import { DOC_DO_ENSAIO, type ResumoContainer } from '../inspecoes/resumoContainer';
import { DOCUMENTOS_DISPONIVEIS } from './tipos';

/**
 * A LÓGICA do assistente de criação de relatório — 09/09/2026.
 *
 * Está fora do componente porque a suíte deste projeto roda em
 * `environment: 'node'`, sem DOM: regra que mora dentro do `.tsx` não tem como
 * ser testada aqui, e a que este arquivo guarda é a que o dono pediu por
 * escrito — "não afirmar ensaio que não foi preenchido".
 */

export type PassoWizard = 1 | 2 | 3;

/**
 * 23/11/2026 · a ordem do assistente mudou a pedido do dono: primeiro a
 * INSPEÇÃO (de onde vêm os dados — e é ela que decide quais folhas de ensaio
 * nascem marcadas), depois os CERTIFICADOS, por último o RESUMO do que vai ser
 * gerado. A composição fina das folhas saiu das etapas e mora na engrenagem do
 * cabeçalho, disponível em qualquer uma delas.
 */
export const PASSOS: { n: PassoWizard; rotulo: string; curto: string }[] = [
  { n: 1, rotulo: 'Inspeção', curto: 'Inspeção' },
  { n: 2, rotulo: 'Certificados', curto: 'Certif.' },
  { n: 3, rotulo: 'Resumo', curto: 'Resumo' },
];

/**
 * 23/11/2026 · as etapas 1 e 2 avançam SEMPRE: "não usar container" e "nenhum
 * certificado" são respostas legítimas. A trava de "pelo menos uma folha" é a
 * do botão Gerar (`podeGerar`), porque a composição deixou de ser uma etapa.
 */
export function podeAvancar(passo: PassoWizard, marcados: string[]): boolean {
  if (passo === 3) return podeGerar(marcados);
  return true;
}

/** Sem folha marcada não há documento — é a mesma trava que o modal antigo tinha. */
export function podeGerar(marcados: string[]): boolean {
  return marcados.length > 0;
}

/** A fração da barra de progresso (vermelha, no topo do modal): passo ÷ 3. */
export function progressoDoPasso(p: PassoWizard): number {
  return p / PASSOS.length;
}

export function passoSeguinte(p: PassoWizard): PassoWizard {
  return (p < 3 ? p + 1 : 3) as PassoWizard;
}

export function passoAnterior(p: PassoWizard): PassoWizard {
  return (p > 1 ? p - 1 : 1) as PassoWizard;
}

/** Qual etapa da barra está feita, atual ou por vir. */
export function estadoDoPasso(n: PassoWizard, atual: PassoWizard): 'feito' | 'atual' | 'futuro' {
  if (n < atual) return 'feito';
  return n === atual ? 'atual' : 'futuro';
}

/**
 * Folhas que o assistente NÃO oferece (23/11/2026, pedido do dono): o Livro de
 * Registro de Segurança é preenchido À MÃO na seção "Registros de Segurança" e
 * não é mais injetado no relatório. O rótulo continua em `ROTULOS` para os
 * rascunhos antigos que ainda o trazem.
 */
export const FOLHAS_FORA_DA_CRIACAO: ReadonlySet<string> = new Set<string>(['LIVRO-REGISTRO.html']);

/** As folhas que o assistente oferece para este tipo de equipamento. */
export function folhasOferecidas(folhasDoTipo: readonly string[]): string[] {
  return folhasDoTipo.filter((d) => !FOLHAS_FORA_DA_CRIACAO.has(d));
}

/**
 * Folhas que só têm conteúdo se a inspeção de campo tiver sido feita.
 *
 * 23/11/2026 · + `CALD-ALIMENTACAO-AGUA.html` (2.3 da caldeira): ela vem do
 * ensaio "Alimentação de água e controle de nível" e faltava aqui — saía
 * marcada como folha de estrutura, sem o aviso de "sem dados". A
 * `CALD-RELATORIO-INSPECAO.html` NÃO entra: ela é estrutura (ensaios,
 * dispositivos e laudo) e só INCLUI a Verificação NR-13 quando ela existe.
 */
export const FOLHAS_ENSAIO: ReadonlySet<string> = new Set<string>([
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
  'RELATORIO-IMAGENS.html',
  'ENSAIO-ACUMULACAO.html',
  'CALD-ALIMENTACAO-AGUA.html',
]);

/** O nome de cada folha na tela do assistente. */
export const ROTULOS_FOLHA: Readonly<Record<string, string>> = {
  'CAPA.html': 'Capa',
  'SUMARIO.html': 'Sumário',
  'PLACA.html': 'Placa de Identificação',
  'PRONTUARIO.html': 'Prontuário',
  'CLASSIFICACAO-RISCO.html': 'Caracterização (Classificação de Risco)',
  'RESUMO-MEMORIAL.html': 'Resumo do Memorial',
  'MEMORIAL.html': 'Memorial de Cálculo (folhas automáticas)',
  'INSPECOES.html': 'Inspeções',
  'VERIFICACAO-DOCUMENTACAO.html': 'Verificação de Documentação',
  'checklist1.html': 'Checklist 1',
  'checklist2.html': 'Checklist 2',
  'checklist3.html': 'Checklist 3',
  'CONCLUSAO.html': 'Conclusão',
  'ULTRASSOM.html': 'Laudo de Ultrassom',
  'TESTE-HIDROSTATICO.html': 'Teste Hidrostático (dados + fotos)',
  'VISUAL-EXTERNO.html': 'Inspeção Visual Externa (checklist + fotos)',
  'VISUAL-INTERNO.html': 'Inspeção Visual Interna (checklist + fotos)',
  'RELATORIO-IMAGENS.html': 'Relatório de Imagens (fotos descritas)',
  'ENSAIO-ACUMULACAO.html': 'Ensaio de Acumulação (dados + fotos)',
  'CALD-PRONTUARIO.html': 'Prontuário da caldeira (construção, operação e controles)',
  'CALD-ACESSORIOS.html': 'Instrumentos de segurança e acessórios',
  'CALD-RELATORIO-INSPECAO.html': 'Relatório de inspeção (ensaios, dispositivos e laudo final)',
  'CALD-CALCULOS.html': 'Cálculos de pressão interna (corpo e espelhos)',
  // 23/11/2026 · faltava: a caldeira mostrava o nome do arquivo.
  'CALD-ALIMENTACAO-AGUA.html': 'Alimentação de água e controle de nível (2.3)',
  'LIVRO-REGISTRO.html': 'Livro de Registro de Segurança (NR-13)',
};

export function rotuloDaFolha(doc: string): string {
  return ROTULOS_FOLHA[doc] ?? doc;
}

/**
 * As folhas que o container escolhido ALIMENTA com dado salvo — pela mesma
 * tabela `DOC_DO_ENSAIO` da revisão. Sem container, nenhuma.
 */
export function folhasComDados(resumo: ResumoContainer | null): Set<string> {
  const docs = new Set<string>();
  if (!resumo) return docs;
  for (const e of resumo.salvos) {
    const doc = DOC_DO_ENSAIO[e.ensaio];
    if (doc) docs.add(doc);
  }
  return docs;
}

/**
 * O PADRÃO INTELIGENTE (23/11/2026): escolher o container decide as folhas de
 * ensaio. Folha de estrutura nasce marcada (como sempre); folha de ensaio nasce
 * marcada só se o container tem dado SALVO para ela — marcar uma vazia
 * produziria uma seção em branco num documento assinado. Sem container, as
 * folhas de ensaio ficam todas desmarcadas: o default antigo.
 */
export function documentosPadraoParaContainer(
  folhasDoTipo: readonly string[],
  resumo: ResumoContainer | null,
): string[] {
  const comDados = folhasComDados(resumo);
  return folhasDoTipo.filter((d) => !FOLHAS_ENSAIO.has(d) || comDados.has(d));
}

/**
 * As folhas de ensaio MARCADAS para as quais o container não tem dado — cada
 * uma ganha o aviso "sem dados na inspeção — sai em branco" no resumo.
 */
export function folhasEnsaioSemDados(marcados: string[], resumo: ResumoContainer | null): string[] {
  const comDados = folhasComDados(resumo);
  return marcados.filter((d) => FOLHAS_ENSAIO.has(d) && !comDados.has(d));
}

/**
 * O ensaio do container que TEM dado salvo E tem uma folha correspondente.
 *
 * É a lista de caixas da revisão. O checklist fica de fora de propósito: ele
 * alimenta três folhas (VERIFICACAO-DOCUMENTACAO + checklist2/3) e não uma, de
 * modo que uma caixa só não conseguiria representá-lo sem mentir.
 */
export function ensaiosRevisaveis(
  resumo: ResumoContainer | null,
): { ensaio: string; doc: string; rotulo: string }[] {
  if (!resumo) return [];
  const itens: { ensaio: string; doc: string; rotulo: string }[] = [];
  for (const e of resumo.salvos) {
    const doc = DOC_DO_ENSAIO[e.ensaio];
    if (!doc) continue;
    itens.push({ ensaio: e.ensaio, doc, rotulo: e.rotulo });
  }
  return itens;
}

/**
 * A lista final entregue ao editor: as folhas marcadas, na ordem canônica do
 * §7, mais os certificados de calibração escolhidos.
 *
 * A ordenação é a mesma que `ModalNovaInspecao.gerar()` sempre fez —
 * `DOCUMENTOS_DISPONIVEIS` é a ordem do documento, e a ordem em que o usuário
 * clicou nas caixas não é ordem nenhuma.
 */
export function documentosFinais(
  marcados: string[],
  docsCalibracao: string[],
  /** A ordem do documento DESTE tipo (`perfilEquipamento.documentosDoTipo`); ausente = a de sempre. */
  ordem: readonly string[] = DOCUMENTOS_DISPONIVEIS,
): string[] {
  return [...ordem.filter((d) => marcados.includes(d)), ...docsCalibracao];
}

/**
 * Marcar/desmarcar preservando o resto — usado pelas caixas do passo 1 e pelas
 * da revisão, que são a MESMA seleção vista de dois lugares.
 */
export function alternarDocumento(marcados: string[], doc: string): string[] {
  return marcados.includes(doc) ? marcados.filter((d) => d !== doc) : [...marcados, doc];
}
