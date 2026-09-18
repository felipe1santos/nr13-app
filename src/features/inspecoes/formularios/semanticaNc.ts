/**
 * Revisão do engenheiro (18/09/2026) · A PERGUNTA DOS EXAMES VISUAIS.
 *
 * ## O defeito
 *
 * No documento (7.2 Exame Externo e 7.3 Exame Interno), as três colunas SIM /
 * NÃO / N.A. respondem a UMA pergunta, impressa sobre elas:
 * **"Foi encontrada alguma não conformidade?"**. Então SIM = não conformidade
 * encontrada. É a referência do dono (`docs/referencias/relatorio-nr13.html`).
 *
 * No celular a pergunta não aparecia: o técnico via "Juntas, conexões e
 * vedações" e três botões — e SIM, sem pergunta, lê-se "está ok". O visualizador
 * desktop reforçava a leitura errada pintando SIM de VERDE. O laudo assinado
 * podia dizer o oposto do que foi inspecionado.
 *
 * ## As regras deste módulo
 *
 * 1. **A pergunta é cabeçalho, não resposta.** Não existe um booleano geral
 *    "houve NC?" gravado: ele poderia divergir das linhas. A resposta geral é
 *    DERIVADA dos itens (`resultadoNcDerivado`).
 * 2. **Os valores gravados não mudam** (`sim`/`nao`/`na`). Nenhuma migração;
 *    o documento sempre leu SIM como não conformidade.
 * 3. **Registro antigo não é reinterpretado em silêncio.** Um exame preenchido
 *    ANTES da pergunta aparecer na tela, e que tenha respostas, fica marcado
 *    para revisão (`precisaConfirmarSemantica`) até alguém confirmar no
 *    formulário — e a finalização de um relatório novo é bloqueada até lá.
 *    O carimbo `semanticaNc` é o que distingue um do outro.
 */

export const PERGUNTA_NC = 'Foi encontrada alguma não conformidade?';

/** A versão da semântica. Registro com este carimbo foi respondido VENDO a pergunta. */
export const SEMANTICA_NC_ATUAL = 1;

export type RespostaNc = 'sim' | 'nao' | 'na' | '';

/** O que cada resposta significa — é o que a legenda da tela escreve. */
export const SIGNIFICADO_NC: Record<Exclude<RespostaNc, ''>, string> = {
  sim: 'há não conformidade',
  nao: 'conforme',
  na: 'não se aplica',
};

/** Tom visual de cada resposta: SIM é problema, NÃO é conforme. */
export const TOM_NC: Record<Exclude<RespostaNc, ''>, 'perigo' | 'ok' | 'neutro'> = {
  sim: 'perigo',
  nao: 'ok',
  na: 'neutro',
};

interface BlocoExame {
  itens?: Record<string, string>;
  itemObs?: Record<string, string>;
  semanticaNc?: number;
}

function respostas(bloco: unknown): string[] {
  const itens = (bloco as BlocoExame | null | undefined)?.itens ?? {};
  return Object.values(itens).map((v) => String(v ?? '').trim());
}

/** O exame tem pelo menos uma resposta marcada? */
export function temRespostas(bloco: unknown): boolean {
  return respostas(bloco).some((v) => v !== '');
}

/**
 * Este exame foi respondido SEM a pergunta na tela e ainda não foi revisado?
 *
 * Só quando há respostas: um exame vazio não tem o que ser mal interpretado.
 */
export function precisaConfirmarSemantica(bloco: unknown): boolean {
  if (!bloco || typeof bloco !== 'object') return false;
  if ((bloco as BlocoExame).semanticaNc === SEMANTICA_NC_ATUAL) return false;
  return temRespostas(bloco);
}

/**
 * O carimbo com que o formulário abre um registro.
 *
 * - registro novo, ou antigo SEM resposta nenhuma → já nasce na semântica atual
 *   (não há o que reinterpretar: tudo o que for respondido agora, é com a
 *   pergunta na tela);
 * - registro antigo COM respostas → sem carimbo, até a revisão explícita.
 */
export function carimboInicial(salvo: unknown): number | undefined {
  const s = salvo as BlocoExame | null | undefined;
  if (s?.semanticaNc === SEMANTICA_NC_ATUAL) return SEMANTICA_NC_ATUAL;
  return temRespostas(s) ? undefined : SEMANTICA_NC_ATUAL;
}

export interface ResultadoNc {
  /** SIM se algum item tem NC; NÃO se todos respondidos sem NC; N.A. se todos N.A.; null se incompleto. */
  resposta: 'SIM' | 'NÃO' | 'N.A.' | null;
  /** Números (1-based) dos itens com não conformidade. */
  itensNc: number[];
  respondidos: number;
  total: number;
}

/**
 * A resposta GERAL, derivada dos itens — nunca gravada.
 *
 * - qualquer item SIM → SIM (mesmo com itens em branco: a NC já existe);
 * - nenhum SIM e todos respondidos → NÃO (ou N.A., se TODOS forem N.A.);
 * - nenhum SIM e algum em branco → `null`: não dá para afirmar que não há.
 */
export function resultadoNcDerivado(valores: (string | null | undefined)[]): ResultadoNc {
  const v = valores.map((x) => String(x ?? '').trim().toLowerCase());
  const itensNc = v.flatMap((x, i) => (x === 'sim' ? [i + 1] : []));
  const respondidos = v.filter((x) => x !== '').length;
  const total = v.length;
  let resposta: ResultadoNc['resposta'] = null;
  if (itensNc.length > 0) resposta = 'SIM';
  else if (total > 0 && respondidos === total) resposta = v.every((x) => x === 'na') ? 'N.A.' : 'NÃO';
  return { resposta, itensNc, respondidos, total };
}

/** Os itens (1-based) marcados SIM e sem observação. */
export function itensNcSemObservacao(bloco: unknown, total: number): number[] {
  const b = (bloco ?? {}) as BlocoExame;
  const saida: number[] = [];
  for (let n = 1; n <= total; n++) {
    const r = String(b.itens?.[String(n)] ?? '').trim().toLowerCase();
    const obs = String(b.itemObs?.[String(n)] ?? '').trim();
    if (r === 'sim' && obs === '') saida.push(n);
  }
  return saida;
}

/** "itens 3, 11" / "item 3". */
export function listaDeItens(itens: number[]): string {
  return `${itens.length === 1 ? 'item' : 'itens'} ${itens.join(', ')}`;
}
