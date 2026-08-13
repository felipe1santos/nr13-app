/**
 * O palco: a única coisa que ainda vive no `localStorage`.
 *
 * Os 40+ templates HTML em iframe leem `localStorage` de forma síncrona no
 * DOMContentLoaded. Em vez de reescrevê-los, o app materializa ali só as chaves
 * do documento que está sendo aberto, monta os iframes, e limpa depois.
 *
 * O limite de 5 MB continua valendo NESTE espaço — por isso tudo é orçado ANTES
 * de escrever, e a escrita é tudo-ou-nada com restauração dos valores
 * anteriores. Relatório pela metade é pior que relatório recusado: sai impresso
 * com folha faltando e ninguém percebe.
 */
import { chavesComPrefixo, chavesDaTag, obterRegistro } from './cacheLocal';
import { baixarFoto, blobParaDataUrl, ehRef, type RefFoto } from './fotos';
import { classificar, type ErroSync } from './errosSync';
import {
  adquirirTrava,
  ehDono,
  liberarTrava,
  type ContextoMontagem,
  type DonoRegistrado,
} from './palcoTrava';

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------
/** Orçamento do documento. NÃO é o teto de 5 MB: o resto fica para a sessão. */
export const ORCAMENTO_DOC = 3_400 * 1024;
/**
 * Teto por imagem já na variante de relatório, em BYTES DO ARQUIVO — não do
 * texto base64 que o carrega. Existe para barrar a imagem que estoura a
 * renderização do `html2canvas` numa folha.
 *
 * A unidade importa: `maiorFotoDoValor` media a string em UTF-16, que é 2,67×
 * o arquivo (base64 infla 33%, UTF-16 dobra), e o teto de 110 KB valia na
 * prática ~41 KB de JPEG. Passou despercebido enquanto só a foto de CAPA era
 * medida; ao estender a degradação para as fotos de campo, uma foto de inspeção
 * já degradada nos seis passos foi medida em "117 KB" e derrubou o documento
 * inteiro em produção (11/08/2026) — o arquivo real tinha ~44 KB e o total
 * cabia no orçamento.
 */
export const ORCAMENTO_IMG = 110 * 1024;
/** Reserva para o manifesto da montagem e a variação entre navegadores. */
export const MARGEM_METADADOS = 32 * 1024;
export const ORCAMENTO_EFETIVO = ORCAMENTO_DOC - MARGEM_METADADOS;

/**
 * Custo real no `localStorage`: chave + valor, em UTF-16 (2 bytes por unidade
 * de código). Contar só o valor, ou contar em UTF-8, subestima o consumo.
 */
export function tamanhoUtf16(chave: string, valor: string): number {
  return (chave.length + valor.length) * 2;
}

// ---------------------------------------------------------------------------
// Degradação
// ---------------------------------------------------------------------------
export interface PassoDegradacao {
  qualidade: number;
  /** `null` = mantém a largura original (só mexe na qualidade). */
  largura: number | null;
}

/** Ordem fixa e testável: três passos de qualidade, depois três de largura. */
export const PLANO_DEGRADACAO: readonly PassoDegradacao[] = [
  { qualidade: 0.6, largura: null },
  { qualidade: 0.45, largura: null },
  { qualidade: 0.35, largura: null },
  { qualidade: 0.35, largura: 900 },
  { qualidade: 0.35, largura: 700 },
  { qualidade: 0.35, largura: 560 },
];

export interface AdaptadorFoto {
  /** Devolve o valor da chave com as fotos recomprimidas no passo indicado. */
  recomprimir(valor: string, passo: PassoDegradacao): Promise<string>;
  /** Tamanho (UTF-16) da MAIOR foto dentro do valor. 0 se não houver foto. */
  maiorFoto(valor: string): number;
}

/**
 * Chaves que a degradação pode recomprimir.
 *
 * `nr13_fotos_` é a foto de capa — alguns KB. O peso de verdade está nas fotos
 * de CAMPO, que chegam ao palco dentro de `nr13_inspecao_atual` e
 * `nr13_injecao_atual` (checklists, visual externo/interno, TH, ultrassom), em
 * DUAS chaves porque os templates nunca foram uniformes (§2 do CLAUDE.md).
 *
 * Enquanto só `nr13_fotos_` entrava aqui, a degradação era decorativa: medido
 * na conta gabriel.dadona em 11/08/2026, com o palco em 2.780 KB de 3.368, ela
 * recomprimia ~1 KB de capa e ignorava ~2,7 MB de fotos de inspeção.
 *
 * NÃO acrescente chave de dado estruturado: recomprimir o JSON do memorial não
 * economizaria nada e corromperia o documento.
 */
const CHAVES_DEGRADAVEIS = ['nr13_fotos_', 'nr13_inspecao_atual', 'nr13_injecao_atual'];

export function ehChaveDeFoto(chave: string): boolean {
  return CHAVES_DEGRADAVEIS.some((p) => chave.startsWith(p));
}

// ---------------------------------------------------------------------------
// Conteúdo do palco
// ---------------------------------------------------------------------------
export interface ItemPalco {
  chave: string;
  valor: string;
}

/**
 * Globais que os templates leem.
 *
 * `nr13_inspecao_atual` e `nr13_injecao_atual` carregam os dados de campo do
 * container escolhido (checklists, visual externo/interno, TH, ultrassom) e são
 * lidas por quase todas as folhas do relatório — em DUAS chaves porque os
 * templates nunca foram uniformes (ver `gravarInspecaoOrigemAtual`). Sem elas
 * aqui, na v2 o documento monta com os ensaios em branco: o dado existe no Map,
 * mas o iframe só enxerga o `localStorage`.
 *
 * `nr13_relatorio_meta_atual` é a SEGUNDA chave mais lida de todo o sistema (36
 * ocorrências em `public/`) e ficou de fora até 13/08/2026. O estrago, medido na
 * conta gabriel.dadona com o documento montado: a CAPA saía com "Nº RELATÓRIO:
 * -", "DATA INSPEÇÃO: -" e "VALIDADE: -" enquanto SOLICITANTE e ENDEREÇO — que
 * vêm de `nr13_emp_<TAG>`, chave de TAG e portanto no palco — apareciam
 * preenchidos; e a folha INSPECOES não marcava natureza, tipo de exame nem
 * resultado, porque tudo isso sai de `meta.tipoInspecao`/`meta.documentos`.
 * Preencher "Configurações do Relatório" não adiantava: o valor era gravado no
 * Map e nunca chegava ao `localStorage` que o iframe enxerga.
 *
 * `nr13_prontuario_atual` é lida pelas 6 folhas do prontuário e pelo rodapé
 * (`pront-footer.js`).
 */
export const GLOBAIS = [
  'nr13_minha_empresa',
  'nr13_lista_phs',
  'nr13_inspecao_atual',
  'nr13_injecao_atual',
  'nr13_relatorio_meta_atual',
  'nr13_prontuario_atual',
];

/**
 * Famílias de escopo de ID (não de TAG) que algum template lê.
 *
 * `nr13_rastreab_` é varrida por PREFIXO dentro do `ULTRASSOM.html`, que
 * percorre o `localStorage` inteiro atrás do certificado do instrumento padrão.
 * Sem as chaves aqui, a varredura não acha nada e o bloco "INSTRUMENTO DE
 * MEDIÇÃO UTILIZADO" sai com "--" nos quatro campos, mesmo com o certificado
 * cadastrado. São registros ENXUTOS: o `pdfBase64` mora no IndexedDB (§2-bis),
 * então o custo aqui é de ~1 KB por instrumento.
 *
 * `nr13_calibracao_item_` NÃO entra por prefixo: ela é global por organização e
 * uma conta com muitos equipamentos traria centenas de certificados que este
 * documento não imprime. Vem filtrada pela TAG, em `chavesDeCalibracaoDaTag`.
 */
export const POR_ID_NO_PALCO = ['nr13_rastreab_'];

/**
 * Família por id que entra FILTRADA pela TAG, não por varredura de prefixo.
 * Declarada aqui para a varredura de `public/` saber que ela está coberta.
 */
export const POR_ID_FILTRADO_POR_TAG = ['nr13_calibracao_item_'];

/**
 * Chaves que NENHUM template HTML lê — confirmado por varredura em `public/`.
 * Levá-las gastaria o orçamento com dado que ninguém renderiza.
 *
 * `nr13_docs_` (containers de inspeção) e `nr13_pront_fab_` (PDF do prontuário
 * do fabricante, até 8 MB) são consumidos só por código React. O segundo
 * apareceu na validação de 05/08/2026 contra dados reais: sozinho ocupava
 * 10.012 KB numa conta, três vezes o orçamento inteiro, e fazia o livro de
 * registro ser recusado sem motivo real.
 *
 * `nr13_componentes_cal_` e `nr13_lotes_cal_` entraram em 11/08/2026 pelo mesmo
 * caminho: o cadastro de válvulas/manômetros guarda uma FOTO base64 por
 * componente (`ComponenteCal.foto`), e essa foto só é desenhada no card da tela
 * de Calibrações. Na conta gabriel.dadona eram 8 componentes de 260–355 KB cada
 * = 2.518 KB dos 3.959 KB do documento — a chave sozinha recusava o relatório da
 * AUTOCLAVE ESTERILAV. O que o relatório de fato imprime são as folhas
 * `CERTIFICADO-CAL-*?calibId=<id>`, que leem `nr13_calibracao_item_<id>` (escopo
 * de id, nunca coletada por TAG) ou o snapshot congelado em `meta.certCalibracoes`.
 */
export const FORA_DO_PALCO = [
  'nr13_docs_',
  'nr13_pront_fab_',
  'nr13_componentes_cal_',
  'nr13_lotes_cal_',
  // Esta é lida por um template (`LIVRO-REGISTRO.html`) e mesmo assim fica de
  // fora, de propósito: guarda TODO o histórico da organização e cresce a cada
  // relatório emitido — 224 KB na conta gabriel.dadona em 13/08/2026, sem teto.
  // O único uso é `relatorioJaSalvo(codigo)`, que congela o texto do termo
  // depois do salvamento; desde §7-ter esse congelamento é feito pelo `ro=1`,
  // que bloqueia a escrita na origem. Trazer uma chave sem limite de tamanho
  // para dentro de um orçamento de 3.368 KB trocaria "termo editável" por
  // "documento recusado", que é o defeito pior.
  'nr13_historico_relatorios',
];

export const CHAVE_MANIFESTO = 'nr13_palco_manifesto';

interface EntradaManifestoPalco {
  chave: string;
  existiaAntes: boolean;
}
interface ManifestoPalco {
  ctx: ContextoMontagem;
  chaves: EntradaManifestoPalco[];
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export type FalhaPalco =
  | { tipo: 'ocupado'; dono: DonoRegistrado | null }
  | {
      tipo: 'acima_do_orcamento';
      total: number;
      orcamento: number;
      maiores: Array<{ chave: string; bytes: number }>;
    }
  | { tipo: 'imagem_indegradavel'; chave: string; bytes: number; limite: number }
  | { tipo: 'erro_ao_resolver_imagem'; chave: string; erro: ErroSync }
  | { tipo: 'escrita_falhou'; chave: string; erro: ErroSync }
  | { tipo: 'rollback_falhou'; chave: string; erro: ErroSync };

export type ResultadoPalco = { ok: true; ctx: ContextoMontagem } | { ok: false; falha: FalhaPalco };

function erroTecnico(erro: unknown, chave: string): ErroSync {
  return classificar(erro, {
    chave,
    mutationId: '—',
    dispositivo: '—',
    quando: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Estado da montagem desta aba
// ---------------------------------------------------------------------------
interface Anterior {
  chave: string;
  valor: string | null;
}

let montagem: { ctx: ContextoMontagem; anteriores: Anterior[] } | null = null;

export function zerarMontagemEmMemoria(): void {
  montagem = null;
}

// ---------------------------------------------------------------------------
// Orçamento e degradação
// ---------------------------------------------------------------------------
export function orcar(
  itens: ItemPalco[],
): { cabe: true; total: number } | Extract<FalhaPalco, { tipo: 'acima_do_orcamento' }> {
  const total = itens.reduce((s, i) => s + tamanhoUtf16(i.chave, i.valor), 0);
  if (total <= ORCAMENTO_EFETIVO) return { cabe: true, total };
  return {
    tipo: 'acima_do_orcamento',
    total,
    orcamento: ORCAMENTO_EFETIVO,
    maiores: itens
      .map((i) => ({ chave: i.chave, bytes: tamanhoUtf16(i.chave, i.valor) }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/**
 * Aplica os passos até o documento caber E nenhuma foto passar do teto por
 * imagem. Recomprime SÓ chaves de foto: degradar o JSON do memorial não
 * economizaria nada e corromperia o documento.
 *
 * NÃO altera o original: trabalha sobre cópias e devolve itens novos. A foto
 * degradada existe só para o palco — o Map, o IndexedDB e o Supabase seguem com
 * a original.
 */
export async function degradarAteCaber(
  itens: ItemPalco[],
  foto: AdaptadorFoto,
): Promise<{ cabe: true; itens: ItemPalco[]; total: number } | { cabe: false; falha: FalhaPalco }> {
  let atuais = itens.map((i) => ({ ...i }));

  const avaliar = (): { cabe: boolean; falha?: FalhaPalco } => {
    const orcamento = orcar(atuais);
    if (!('cabe' in orcamento)) return { cabe: false, falha: orcamento };

    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) continue;
      const maior = foto.maiorFoto(item.valor);
      if (maior > ORCAMENTO_IMG) {
        return {
          cabe: false,
          falha: { tipo: 'imagem_indegradavel', chave: item.chave, bytes: maior, limite: ORCAMENTO_IMG },
        };
      }
    }
    return { cabe: true };
  };

  let veredito = avaliar();
  if (veredito.cabe) return { cabe: true, itens: atuais, total: orcar(atuais).total ?? 0 };

  for (const passo of PLANO_DEGRADACAO) {
    const proximos: ItemPalco[] = [];
    for (const item of atuais) {
      if (!ehChaveDeFoto(item.chave)) {
        proximos.push(item);
        continue;
      }
      try {
        proximos.push({ chave: item.chave, valor: await foto.recomprimir(item.valor, passo) });
      } catch (erro) {
        // Falha ao resolver/recomprimir uma imagem é reportada com a chave —
        // seguir em silêncio produziria um documento sem a foto.
        return {
          cabe: false,
          falha: { tipo: 'erro_ao_resolver_imagem', chave: item.chave, erro: erroTecnico(erro, item.chave) },
        };
      }
    }
    atuais = proximos;

    veredito = avaliar();
    if (veredito.cabe) {
      const o = orcar(atuais);
      return { cabe: true, itens: atuais, total: 'cabe' in o ? o.total : 0 };
    }
  }

  return { cabe: false, falha: veredito.falha! };
}

// ---------------------------------------------------------------------------
// Materialização atômica
// ---------------------------------------------------------------------------
/**
 * Escreve tudo ou nada. Os valores ANTERIORES são guardados antes da primeira
 * escrita e restaurados exatamente em caso de falha: remover as chaves gravadas
 * não bastaria, porque uma chave global como `nr13_minha_empresa` pode já
 * existir e seria perdida.
 */
export function materializar(
  ctx: ContextoMontagem,
  itens: ItemPalco[],
): { ok: true } | { ok: false; falha: FalhaPalco } {
  const anteriores: Anterior[] = [];

  for (const item of itens) {
    anteriores.push({ chave: item.chave, valor: localStorage.getItem(item.chave) });
    try {
      localStorage.setItem(item.chave, item.valor);
    } catch (erro) {
      const falhaEscrita = erroTecnico(erro, item.chave);
      // Rollback: restaura o que existia e remove só o que criamos.
      for (const a of anteriores) {
        try {
          if (a.valor === null) localStorage.removeItem(a.chave);
          else localStorage.setItem(a.chave, a.valor);
        } catch (erroRollback) {
          return {
            ok: false,
            falha: { tipo: 'rollback_falhou', chave: a.chave, erro: erroTecnico(erroRollback, a.chave) },
          };
        }
      }
      return { ok: false, falha: { tipo: 'escrita_falhou', chave: item.chave, erro: falhaEscrita } };
    }
  }

  const manifesto: ManifestoPalco = {
    ctx,
    chaves: anteriores.map((a) => ({ chave: a.chave, existiaAntes: a.valor !== null })),
  };
  try {
    localStorage.setItem(CHAVE_MANIFESTO, JSON.stringify(manifesto));
  } catch (erro) {
    for (const a of anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
    return { ok: false, falha: { tipo: 'escrita_falhou', chave: CHAVE_MANIFESTO, erro: erroTecnico(erro, CHAVE_MANIFESTO) } };
  }

  montagem = { ctx, anteriores };
  return { ok: true };
}

function lerManifestoPalco(): ManifestoPalco | null {
  try {
    const cru = localStorage.getItem(CHAVE_MANIFESTO);
    if (!cru) return null;
    const m = JSON.parse(cru) as ManifestoPalco;
    return Array.isArray(m?.chaves) && m?.ctx ? m : null;
  } catch {
    return null; // manifesto corrompido: não sai apagando a esmo
  }
}

/**
 * Limpa o palco. SÓ o dono exato (org + aba + relatório + TAG + nonce) pode, e
 * só as chaves registradas na montagem atual — nunca varredura por prefixo.
 *
 * Com o snapshot em memória (mesma aba, mesma sessão), restaura os valores
 * anteriores.
 *
 * LIMITAÇÃO CONHECIDA (aceita em 05/08/2026): se a página recarregar entre a
 * montagem e a limpeza, o snapshot em memória se perde. Nesse caso a limpeza
 * remove apenas o que a montagem criou e DEIXA intactas as chaves que já
 * existiam antes — inclusive as globais, que podem ter ficado com o valor do
 * palco. Apagá-las seria pior que deixá-las: o dado verdadeiro segue no cache e
 * a próxima montagem sobrescreve. Persistir o snapshot no `localStorage`
 * resolveria, mas duplicaria o valor de chaves grandes como
 * `nr13_minha_empresa` (com logo), consumindo justamente o orçamento que este
 * módulo existe para proteger.
 */
export function limparPalco(ctx: ContextoMontagem): { ok: boolean; motivo?: 'nao_e_dono' } {
  if (!ehDono(ctx)) return { ok: false, motivo: 'nao_e_dono' };

  if (montagem && montagem.ctx.nonce === ctx.nonce) {
    for (const a of montagem.anteriores) {
      if (a.valor === null) localStorage.removeItem(a.chave);
      else localStorage.setItem(a.chave, a.valor);
    }
  } else {
    const m = lerManifestoPalco();
    if (m && m.ctx.nonce === ctx.nonce) {
      for (const e of m.chaves) if (!e.existiaAntes) localStorage.removeItem(e.chave);
    }
  }

  localStorage.removeItem(CHAVE_MANIFESTO);
  montagem = null;
  liberarTrava(ctx);
  return { ok: true };
}

/**
 * Libera o palco que ESTA aba montou, se houver. Usada na troca de conta e no
 * logout, onde não existe o `ctx` à mão. Se a aba não é dona de nada, é no-op —
 * nunca mexe no palco de outra aba.
 */
export function liberarPalcoDestaAba(): boolean {
  if (!montagem) return false;
  return limparPalco(montagem.ctx).ok;
}

// ---------------------------------------------------------------------------
// Montagem completa
// ---------------------------------------------------------------------------
/**
 * Certificados de calibração DESTE equipamento, no formato por id que as folhas
 * `CERTIFICADO-CAL-*?calibId=<id>` leem.
 *
 * A chave `nr13_calibracao_item_<id>` não tem TAG no nome, então não aparece em
 * `chavesDaTag`. A lista de quem pertence a quem está em `nr13_calibracoes_<TAG>`
 * — a mesma origem que o Portal do Cliente usa em `hidratarItemLocal`. Filtrar
 * por aqui, em vez de varrer o prefixo, mantém o custo proporcional ao
 * equipamento aberto e não à organização inteira.
 */
function chavesDeCalibracaoDaTag(tag: string): string[] {
  const reg = obterRegistro(`nr13_calibracoes_${tag}`);
  if (!reg) return [];
  try {
    const lista: unknown = JSON.parse(reg.valor);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((c) => (c as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string' && id !== '')
      .map((id) => `nr13_calibracao_item_${id}`);
  } catch {
    return []; // lista corrompida não pode derrubar a montagem do documento
  }
}

/** Coleta as chaves que os templates realmente leem para a TAG aberta. */
export function coletarItens(tag: string): ItemPalco[] {
  // Set: a mesma chave duas vezes faria `materializar` guardar o valor do palco
  // como "anterior" da segunda gravação, e o rollback restauraria o palco em vez
  // do estado original.
  const chaves = [
    ...new Set([
      ...chavesDaTag(tag),
      ...GLOBAIS,
      ...POR_ID_NO_PALCO.flatMap((p) => chavesComPrefixo(p)),
      ...chavesDeCalibracaoDaTag(tag),
    ]),
  ].filter((c) => !FORA_DO_PALCO.some((p) => c.startsWith(p)));
  const itens: ItemPalco[] = [];
  for (const chave of chaves) {
    const reg = obterRegistro(chave);
    if (reg) itens.push({ chave, valor: reg.valor });
  }
  return itens;
}

/**
 * Traz para dentro do valor a imagem que hoje mora no bucket.
 *
 * Os 40+ templates HTML são páginas estáticas que leem `localStorage` de forma
 * síncrona e renderizam `<img src="...">`. Eles não sabem — e não vão aprender,
 * porque reescrevê-los é justamente o que o palco existe para evitar — pedir
 * arquivo ao Storage. Então na montagem do documento, e SÓ nela, a foto volta a
 * ser dataURL, escrita nos mesmos campos que os templates sempre leram (`src` e
 * `base64`).
 *
 * Isso não desfaz a mudança: o dataURL vive no palco, que é apagado ao fechar o
 * documento, e nunca volta para o `app_storage`. O banco continua guardando só
 * o caminho.
 */
export async function hidratarFotosDoBucket(itens: ItemPalco[]): Promise<ItemPalco[]> {
  const jaBaixadas = new Map<string, string | null>();

  async function dataUrlDe(ref: RefFoto): Promise<string | null> {
    const emCache = jaBaixadas.get(ref.path);
    if (emCache !== undefined) return emCache;
    let url: string | null;
    try {
      const blob = await baixarFoto(ref);
      url = blob ? await blobParaDataUrl(blob) : null;
    } catch {
      url = null; // foto indisponível não pode derrubar o documento inteiro
    }
    jaBaixadas.set(ref.path, url);
    return url;
  }

  async function percorrer(no: unknown): Promise<boolean> {
    if (Array.isArray(no)) {
      let mudou = false;
      for (const filho of no) if (await percorrer(filho)) mudou = true;
      return mudou;
    }
    if (typeof no !== 'object' || no === null) return false;

    const obj = no as Record<string, unknown>;
    let mudou = false;
    if (ehRef(obj.ref)) {
      const url = await dataUrlDe(obj.ref as RefFoto);
      if (url) {
        // OS DOIS CAMPOS, e isso CUSTA CARO: a mesma imagem é gravada duas
        // vezes dentro do orçamento de 3.368 KB. Medido em produção em
        // 11/08/2026, o palco do relatório da conta gabriel.dadona foi de
        // 1.449 KB para 2.780 KB logo depois da migração das fotos para o
        // bucket — sem que uma única foto nova tivesse sido tirada.
        //
        // Mesmo assim é obrigatório: CAPA.html lê `.src`, as folhas de fotos
        // leem `.base64`, e uma foto nova chega ao palco só com `ref`, sem
        // nenhum dos dois declarado. Não há como saber qual campo o template
        // daquela folha vai consultar. Preencher um só deixa folha em branco —
        // pior que gastar orçamento (ver `palco.fotos.test.ts`).
        //
        // A saída certa para o custo NÃO é aqui: é fazer a degradação alcançar
        // `nr13_inspecao_atual`/`nr13_injecao_atual`, hoje limitada a
        // `nr13_fotos_` (ver docs/ARMAZENAMENTO-LIMITES.md §3.1).
        obj.src = url;
        obj.base64 = url;
        mudou = true;
      }
    }
    for (const valor of Object.values(obj)) if (await percorrer(valor)) mudou = true;
    return mudou;
  }

  const saida: ItemPalco[] = [];
  for (const item of itens) {
    // Atalho barato: sem a palavra "ref" no texto não há o que hidratar, e a
    // maioria das chaves (memorial, categoria, livro) cai aqui sem custo.
    if (!item.valor.includes('"ref"')) {
      saida.push(item);
      continue;
    }
    try {
      const obj: unknown = JSON.parse(item.valor);
      const mudou = await percorrer(obj);
      saida.push(mudou ? { chave: item.chave, valor: JSON.stringify(obj) } : item);
    } catch {
      saida.push(item); // valor não-JSON: segue intacto
    }
  }
  return saida;
}

/**
 * Fluxo completo: trava → coleta → hidrata as fotos → degrada → orça →
 * materializa. Só devolve `ok: true` depois de TUDO confirmado. Quem chama não
 * pode montar iframe nenhum antes disso.
 */
export async function montarPalcoDaTag(
  ctx: ContextoMontagem,
  foto: AdaptadorFoto,
  opcoes: { esperaMs?: number } = {},
): Promise<ResultadoPalco> {
  const trava = await adquirirTrava(ctx, opcoes);
  if (!trava.obtida) return { ok: false, falha: { tipo: 'ocupado', dono: trava.dono } };

  // A hidratação vem ANTES da degradação de propósito: é ela que devolve os
  // bytes da imagem, e é sobre esses bytes que o orçamento de 3.400 KB decide
  // se precisa recomprimir.
  const brutos = await hidratarFotosDoBucket(coletarItens(ctx.tag));
  const degradado = await degradarAteCaber(brutos, foto);
  if (!degradado.cabe) {
    liberarTrava(ctx);
    return { ok: false, falha: degradado.falha };
  }

  const escrita = materializar(ctx, degradado.itens);
  if (!escrita.ok) {
    liberarTrava(ctx);
    return { ok: false, falha: escrita.falha };
  }

  return { ok: true, ctx };
}
