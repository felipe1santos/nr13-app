/**
 * Recuperação do fallback base64 (Fase 6, achado A-10).
 *
 * ── O QUE ESTA FASE NÃO É ───────────────────────────────────────────────────
 *
 * Não é uma campanha para "zerar base64 no banco". Base64 temporário (canvas,
 * palco, jsPDF) é necessário e fica; base64 de compatibilidade continua legível
 * para sempre (I-26); logo, rubrica e snapshots congelados de relatório estão
 * FORA desta fase — mexer neles quebraria a imutabilidade do §7-bis.
 *
 * O alvo é UM caso só: quando o upload falha, os três serviços de anexo gravam
 * o arquivo em base64 dentro do próprio registro para não perder o documento do
 * usuário. Isso é correto e continua existindo. O que faltava era a **segunda
 * chance**: hoje esse registro fica em base64 PARA SEMPRE, mesmo depois de a
 * rede voltar.
 *
 * ── A ORDEM, QUE É A REGRA ──────────────────────────────────────────────────
 *
 *   base64 → bytes → Storage → CONFIRMAR que não está pendente → validar
 *          → substituir base64 pela referência, em UMA escrita
 *
 * Nunca "apagar o base64 e tentar subir depois". Se qualquer passo antes do
 * último falhar, o registro fica **byte a byte** como estava. O passo final é
 * uma escrita só: ou o registro ganha a referência e perde o base64 ao mesmo
 * tempo, ou nada muda.
 *
 * ── POR QUE ESTE MÓDULO NÃO INVENTOU NADA ───────────────────────────────────
 *
 * `livroAssinatura.migrarRubricasDoLivro` já provou esse padrão em produção
 * desde 14/08/2026. Aqui ele é generalizado para as famílias do A-10, com a
 * mesma garantia central: `arquivoPendente(path) === false` é o ÚNICO sinal
 * aceito de que o arquivo chegou ao servidor (I-14). `navigator.onLine` não
 * serve — a validação offline da Fase 5 mostrou a flag reportando `true` com a
 * rede desligada.
 */
import { ler, salvar, listarChavesComPrefixo, bloqueadoParaEscrita } from './storage';
import { salvarArquivo, arquivoPendente, type RefFoto } from './fotos';

/** dataURL → Blob, sem passar por `fetch` (que o CSP de alguns navegadores barra). */
export function dataUrlParaBlob(dataUrl: string): Blob {
  const virgula = dataUrl.indexOf(',');
  const cabecalho = dataUrl.slice(0, virgula);
  const mime = /data:([^;]+)/.exec(cabecalho)?.[1] ?? 'application/octet-stream';
  const bin = atob(dataUrl.slice(virgula + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}

export function ehDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * Descrição de uma família recuperável.
 *
 * A lista é EXPLÍCITA e curta de propósito. Deduzir "toda chave que contém
 * base64" varreria logo, rubrica e os snapshots congelados dos relatórios — e
 * converter qualquer um deles quebraria a imutabilidade de um documento
 * assinado. Ver `recuperacaoArquivos.test.ts`, que falha se uma dessas famílias
 * aparecer aqui.
 */
export interface FamiliaRecuperavel {
  prefixo: string;
  /** Campo com o dataURL. Vazio ou ausente = nada a fazer. */
  campoBase64: string;
  /** Campo que recebe a `RefFoto`. Presente = já migrado, pula. */
  campoRef: string;
  /** Pasta no bucket. A mesma que o serviço usa no caminho feliz. */
  escopo: string;
  ext: string;
  mimeType: string;
  /** `true` quando o valor da chave é um ARRAY de itens (componentes de calibração). */
  lista?: boolean;
}

export const FAMILIAS_RECUPERAVEIS: readonly FamiliaRecuperavel[] = [
  {
    prefixo: 'nr13_rastreab_',
    campoBase64: 'pdfBase64',
    campoRef: 'pdfRef',
    escopo: 'certificados',
    ext: 'pdf',
    mimeType: 'application/pdf',
  },
  {
    prefixo: 'nr13_pront_fab_',
    campoBase64: 'pdfBase64',
    campoRef: 'pdfRef',
    escopo: 'prontuario-fabricante',
    ext: 'pdf',
    mimeType: 'application/pdf',
  },
  {
    prefixo: 'nr13_componentes_cal_',
    campoBase64: 'foto',
    campoRef: 'fotoRef',
    escopo: 'componentes',
    ext: 'jpg',
    mimeType: 'image/jpeg',
    lista: true,
  },
];

export interface ResultadoRecuperacao {
  /** Itens que passaram a ter referência e perderam o base64. */
  convertidos: number;
  /**
   * Itens que TÊM base64 e não puderam ser convertidos agora — upload não
   * confirmado, conversão falhou, validação falhou. O base64 continua intacto e
   * a próxima sessão tenta de novo.
   */
  adiados: number;
  /** Itens que já tinham referência: pulados sem trabalho nenhum. */
  jaMigrados: number;
}

const VAZIO: ResultadoRecuperacao = { convertidos: 0, adiados: 0, jaMigrados: 0 };

function ehRefValida(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.path === 'string' && r.path.length > 0;
}

/**
 * Tenta recuperar UM item. Devolve o item novo, ou `null` quando ele deve ficar
 * exatamente como está.
 *
 * Todo caminho de falha devolve `null`. Nenhum deles altera o item recebido.
 */
async function recuperarItem(
  item: Record<string, unknown>,
  f: FamiliaRecuperavel,
): Promise<Record<string, unknown> | null> {
  const dataUrl = item[f.campoBase64];
  if (!ehDataUrl(dataUrl)) return null;

  // 1. bytes
  let blob: Blob;
  try {
    blob = dataUrlParaBlob(dataUrl);
  } catch {
    return null; // base64 corrompido: intocado, e continua sendo a única cópia
  }
  if (blob.size === 0) return null;

  // 2. cofre local + tentativa de upload
  let ref: RefFoto;
  try {
    ref = await salvarArquivo(blob, f.escopo, f.ext, f.mimeType);
  } catch {
    return null;
  }
  if (!ehRefValida(ref)) return null;

  // 3. O SERVIDOR confirmou? Só ele decide. Pendente = adia, base64 fica.
  try {
    if (await arquivoPendente(ref.path)) return null;
  } catch {
    return null; // sem resposta = trata como pendente
  }

  // 4. validação de integridade: o tamanho declarado tem de bater com os bytes
  if (ref.tamanho !== blob.size) return null;

  // 5. UMA escrita: ganha a referência e perde o base64 no mesmo objeto
  return { ...item, [f.campoBase64]: '', [f.campoRef]: ref };
}

/** Recupera os itens de UMA chave. Não grava nada se nenhum item mudou. */
export async function recuperarChave(
  chave: string,
  f: FamiliaRecuperavel,
): Promise<ResultadoRecuperacao> {
  const valor = ler<unknown>(chave);
  if (valor == null) return VAZIO;

  const itens = f.lista ? (Array.isArray(valor) ? valor : null) : [valor];
  if (!itens) return VAZIO;

  const res: ResultadoRecuperacao = { convertidos: 0, adiados: 0, jaMigrados: 0 };
  const saida: unknown[] = [];

  for (const bruto of itens) {
    if (typeof bruto !== 'object' || bruto === null) {
      saida.push(bruto);
      continue;
    }
    const item = bruto as Record<string, unknown>;

    // Já migrado: pula ANTES de qualquer trabalho. É o que torna o retry barato
    // e impede o segundo aparelho de subir o arquivo de novo.
    if (ehRefValida(item[f.campoRef])) {
      res.jaMigrados++;
      saida.push(item);
      continue;
    }
    if (!ehDataUrl(item[f.campoBase64])) {
      saida.push(item);
      continue;
    }

    const novo = await recuperarItem(item, f);
    if (novo) {
      res.convertidos++;
      saida.push(novo);
    } else {
      res.adiados++;
      saida.push(item); // intocado
    }
  }

  if (res.convertidos > 0) {
    await salvar(chave, f.lista ? saida : saida[0]);
  }
  return res;
}

export interface ResumoRecuperacao extends ResultadoRecuperacao {
  /** Chaves efetivamente visitadas nesta execução (limitadas pelo teto). */
  chavesVisitadas: number;
  /** `true` quando o teto por sessão interrompeu a varredura. */
  interrompidaPorTeto: boolean;
  /** Motivo de a varredura nem ter começado. */
  naoExecutou?: 'somente-leitura' | 'offline';
}

/**
 * Teto por sessão.
 *
 * Recuperar 50 certificados de 800 KB num boot consumiria a banda do usuário
 * sem ele ter pedido nada. O que sobrar volta na próxima sessão — e como a
 * varredura é idempotente, nada se perde por parar no meio.
 */
export const TETO_POR_SESSAO = 3;

/**
 * Varre as famílias recuperáveis. Best-effort e interrompível: uma chave que
 * falhe não impede as outras, e fechar a aba deixa as já convertidas convertidas
 * e as demais exatamente como estavam.
 */
export async function recuperarPendentes(
  opcoes: { teto?: number } = {},
): Promise<ResumoRecuperacao> {
  const res: ResumoRecuperacao = {
    convertidos: 0,
    adiados: 0,
    jaMigrados: 0,
    chavesVisitadas: 0,
    interrompidaPorTeto: false,
  };

  // Portal e assinatura vencida não convertem nada — a mesma guarda de
  // `migrarHistoricoEmSegundoPlano`.
  if (bloqueadoParaEscrita()) return { ...res, naoExecutou: 'somente-leitura' };

  // Atalho barato, NÃO é o critério: sem rede o passo 3 nunca confirmaria, então
  // nem vale começar. Quem decide de verdade continua sendo `arquivoPendente`.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...res, naoExecutou: 'offline' };
  }

  const teto = opcoes.teto ?? TETO_POR_SESSAO;

  for (const f of FAMILIAS_RECUPERAVEIS) {
    for (const chave of listarChavesComPrefixo(f.prefixo)) {
      if (res.chavesVisitadas >= teto) {
        res.interrompidaPorTeto = true;
        return res;
      }
      res.chavesVisitadas++;
      try {
        const r = await recuperarChave(chave, f);
        res.convertidos += r.convertidos;
        res.adiados += r.adiados;
        res.jaMigrados += r.jaMigrados;
      } catch {
        // uma chave problemática não pode segurar as demais
      }
    }
  }
  return res;
}

let iniciada = false;

/**
 * Gatilho de background, uma vez por sessão. Mesmo lugar e mesmo padrão de
 * `migrarHistoricoEmSegundoPlano` e `migrarRubricasEmSegundoPlano`.
 */
export function recuperarArquivosEmSegundoPlano(): void {
  if (iniciada) return;
  iniciada = true;
  void recuperarPendentes()
    .then((r) => {
      if (r.convertidos > 0 || r.adiados > 0) console.info('[arquivos] recuperação:', r);
    })
    .catch(() => {
      // best-effort: falhar aqui não pode atrapalhar o boot
    });
}

/** Só para teste: permite reexecutar o gatilho. */
export function _zerarGatilho(): void {
  iniciada = false;
}
