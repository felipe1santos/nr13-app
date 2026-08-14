/**
 * A rubrica das entradas do Livro de Registro: UMA cópia no bucket, N
 * referências.
 *
 * ── O QUE ERA (14/08/2026) ──────────────────────────────────────────────────
 * Cada entrada do livro congelava a rubrica do assinante em `assinaturaImg`,
 * uma dataURL PNG. Medido em produção: uma entrada pesava 56 KB e **54,9 deles
 * eram a assinatura**. O livro é CUMULATIVO por equipamento, então 20 inspeções
 * guardavam 20 cópias do mesmo desenho — 1,1 MB — e `nr13_livro_` vai para o
 * palco, dentro de um orçamento de 3.368 KB.
 *
 * ── POR QUE O CONGELAMENTO EXISTE, E CONTINUA EXISTINDO ─────────────────────
 * Não era desperdício por descuido: a entrada precisa mostrar a rubrica que
 * ESTAVA em uso naquela inspeção. Resolver ao vivo por `phId` faria trocar a
 * assinatura no cadastro reescrever a aparência de todo registro passado —
 * exatamente o defeito consertado em 14/07/2026.
 *
 * ── A SAÍDA: ENDEREÇO PELO CONTEÚDO ─────────────────────────────────────────
 * `salvarArquivoPorConteudo` nomeia o arquivo com o SHA-256 do próprio
 * conteúdo. Daí sai tudo:
 *
 *   mesma rubrica  → mesmo path → um arquivo, N referências de ~150 bytes;
 *   rubrica nova   → path novo  → o arquivo antigo continua lá, intacto.
 *
 * A imutabilidade histórica deixa de depender de alguém lembrar de preservá-la:
 * ela é consequência do endereço. Uma entrada de 2024 aponta para o hash da
 * rubrica de 2024, e nada que aconteça no cadastro em 2026 alcança esse
 * endereço.
 *
 * ── COMO A FOLHA CONTINUA IMPRIMINDO ────────────────────────────────────────
 * `LIVRO-REGISTRO.html` lê `info.assinaturaImg` e faz `<img src>`. Não muda: o
 * palco hidrata `assinaturaRef` → `assinaturaImg` na montagem do documento
 * (`CAMPO_REF_NOMEADO` em `palco.ts`), do mesmo jeito que já faz com as fotos.
 *
 * ── O QUE **NÃO** É MIGRADO, E POR QUÊ ──────────────────────────────────────
 * Entrada LACRADA não é tocada. O hash do lacre cobre o conteúdo canônico
 * inteiro (`livroLacre.canonico` só exclui `sha256`/`shaAnterior`/`lacradaEm`),
 * então trocar `assinaturaImg` por `assinaturaRef` mudaria o hash e a entrada
 * passaria a se acusar de adulterada — e a trava do banco
 * (`nr13_livro_imutavel`) recusaria a gravação, com razão. Reescrever registro
 * emitido é a fraude que o lacre existe para impedir; economizar bytes não é
 * motivo para abrir essa porta.
 *
 * Migram apenas as entradas SEM lacre (anteriores a 12/08/2026), que nunca
 * foram seladas. O ganho estrutural está no futuro: toda entrada nova nasce com
 * referência, e o livro para de crescer dezenas de KB por inspeção.
 */
import { salvarArquivoPorConteudo, baixarFoto, arquivoPendente, type RefFoto } from '../../services/fotos';
import { ler, salvar, listarChavesComPrefixo, bloqueadoParaEscrita } from '../../services/storage';
import type { LivroEntrada } from './livroLacre';

/** Pasta do bucket. Fica fora de `<tag>/` porque a rubrica é da ORGANIZAÇÃO. */
export const ESCOPO_ASSINATURA = 'assinaturas';

/** dataURL → Blob, sem passar por fetch (que o CSP de alguns navegadores barra). */
function dataUrlParaBlob(dataUrl: string): Blob {
  const virgula = dataUrl.indexOf(',');
  const cabecalho = dataUrl.slice(0, virgula);
  const mime = /data:([^;]+)/.exec(cabecalho)?.[1] ?? 'image/png';
  const bin = atob(dataUrl.slice(virgula + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}

function ehDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * Sobe a rubrica e devolve a referência. `null` quando não há rubrica ou quando
 * o upload não pôde nem ser preparado.
 *
 * Falhar aqui NÃO pode impedir a entrada de nascer: o livro é registro legal e
 * uma inspeção não deixa de ser registrada porque o bucket está fora do ar. Quem
 * chama trata o `null` mantendo o base64 — pesado, porém salvo.
 */
export async function referenciaDaRubrica(dataUrl: string | undefined): Promise<RefFoto | null> {
  if (!ehDataUrl(dataUrl)) return null;
  try {
    const blob = dataUrlParaBlob(dataUrl);
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    return await salvarArquivoPorConteudo(blob, ESCOPO_ASSINATURA, ext, blob.type || 'image/png');
  } catch {
    return null;
  }
}

/**
 * Monta os campos de assinatura de uma entrada NOVA.
 *
 * Devolve `assinaturaRef` quando a rubrica chegou ao bucket, e `assinaturaImg`
 * só como último recurso. Nunca os dois: seria voltar a duplicar.
 */
export async function camposDaRubrica(
  dataUrl: string | undefined,
): Promise<{ assinaturaRef?: RefFoto; assinaturaImg?: string }> {
  const ref = await referenciaDaRubrica(dataUrl);
  if (ref) return { assinaturaRef: ref };
  return ehDataUrl(dataUrl) ? { assinaturaImg: dataUrl } : {};
}

// ---------------------------------------------------------------------------
// Migração do legado
// ---------------------------------------------------------------------------
export interface ResultadoMigracaoLivro {
  /** Entradas convertidas de base64 para referência. */
  convertidas: number;
  /** Entradas com base64 que NÃO podem ser tocadas por estarem lacradas. */
  lacradasIntactas: number;
  /** Entradas cujo upload não confirmou — o base64 fica onde está. */
  adiadas: number;
  tags: string[];
}

/**
 * Converte, no livro de UMA tag, as entradas SEM LACRE que ainda carregam a
 * rubrica em base64.
 *
 * Idempotente: entrada que já tem `assinaturaRef` é pulada, e o path é o hash do
 * conteúdo, então reenviar o mesmo desenho não cria arquivo novo.
 *
 * O base64 SÓ sai depois de `arquivoPendente(path) === false` — ou seja, depois
 * de o servidor ter confirmado o arquivo. Enquanto o upload estiver na fila
 * offline, a entrada continua com a imagem embutida: perder a rubrica de um
 * registro de segurança para economizar bytes seria o pior desfecho possível.
 */
export async function migrarRubricasDoLivro(
  chave: string,
): Promise<{ convertidas: number; lacradasIntactas: number; adiadas: number }> {
  const livro = ler<LivroEntrada[]>(chave);
  if (!Array.isArray(livro) || livro.length === 0) {
    return { convertidas: 0, lacradasIntactas: 0, adiadas: 0 };
  }

  let convertidas = 0;
  let lacradasIntactas = 0;
  let adiadas = 0;
  const saida: LivroEntrada[] = [];

  for (const entrada of livro) {
    const img = entrada?.assinaturaImg;
    if (!ehDataUrl(img) || entrada.assinaturaRef) {
      saida.push(entrada);
      continue;
    }
    // Lacrada: intocável. Trocar o campo mudaria o hash e a própria entrada
    // passaria a se denunciar como adulterada.
    if (entrada.sha256) {
      lacradasIntactas++;
      saida.push(entrada);
      continue;
    }

    const ref = await referenciaDaRubrica(img);
    if (!ref || (await arquivoPendente(ref.path))) {
      adiadas++;
      saida.push(entrada);
      continue;
    }
    const { assinaturaImg: _sai, ...resto } = entrada;
    saida.push({ ...resto, assinaturaRef: ref } as LivroEntrada);
    convertidas++;
  }

  if (convertidas > 0) await salvar(chave, saida);
  return { convertidas, lacradasIntactas, adiadas };
}

/**
 * Percorre TODOS os livros da organização. Idempotente e best-effort: um livro
 * que falhe não impede os outros, e nada é apagado sem o arquivo confirmado.
 */
export async function migrarRubricasDeTodosOsLivros(): Promise<ResultadoMigracaoLivro> {
  const res: ResultadoMigracaoLivro = { convertidas: 0, lacradasIntactas: 0, adiadas: 0, tags: [] };
  for (const chave of listarChavesComPrefixo('nr13_livro_')) {
    if (chave.startsWith('nr13_livro_config_')) continue; // configuração de exibição
    try {
      const r = await migrarRubricasDoLivro(chave);
      res.convertidas += r.convertidas;
      res.lacradasIntactas += r.lacradasIntactas;
      res.adiadas += r.adiadas;
      if (r.convertidas > 0) res.tags.push(chave.slice('nr13_livro_'.length));
    } catch {
      // um livro problemático não pode segurar os demais
    }
  }
  return res;
}

/**
 * Roda a migração UMA vez por sessão, em segundo plano.
 *
 * Conta somente leitura não migra: toda gravação lançaria `ErroBloqueado`. E
 * falhar aqui não quebra nada — o palco hidrata a referência quando ela existe e
 * o base64 legado continua sendo impresso quando ela não existe.
 */
let migracaoIniciada = false;

export function migrarRubricasEmSegundoPlano(): void {
  if (migracaoIniciada || bloqueadoParaEscrita()) return;
  migracaoIniciada = true;
  void migrarRubricasDeTodosOsLivros()
    .then((r) => {
      if (r.convertidas > 0 || r.lacradasIntactas > 0) console.info('[livro] rubricas:', r);
    })
    .catch((e) => console.error('[livro] migração de rubricas falhou; seguindo pelo base64', e));
}

export function zerarMigracaoRubricasEmMemoria(): void {
  migracaoIniciada = false;
}

/**
 * A rubrica de uma entrada, venha da referência ou do base64 legado. Para o
 * código React (o palco resolve sozinho o que a folha HTML precisa).
 */
export async function resolverRubrica(entrada: LivroEntrada): Promise<string | null> {
  if (ehDataUrl(entrada.assinaturaImg)) return entrada.assinaturaImg;
  const ref = entrada.assinaturaRef as RefFoto | undefined;
  if (!ref?.path) return null;
  try {
    const blob = await baixarFoto(ref);
    if (!blob) return null;
    return await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
