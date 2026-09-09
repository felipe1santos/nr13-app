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

export const PASSOS: { n: PassoWizard; rotulo: string; curto: string }[] = [
  { n: 1, rotulo: 'Documentos', curto: 'Docs' },
  { n: 2, rotulo: 'Inspeção', curto: 'Inspeção' },
  { n: 3, rotulo: 'Revisar e gerar', curto: 'Revisar' },
];

/** Sem folha marcada não há documento — é a mesma trava que o modal antigo tinha. */
export function podeAvancar(passo: PassoWizard, marcados: string[]): boolean {
  if (passo === 1) return marcados.length > 0;
  // Passo 2 avança sempre: "não usar container" é escolha legítima, e o `null`
  // é o valor que `finalizarGeracao` já aceitava.
  return true;
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
export function documentosFinais(marcados: string[], docsCalibracao: string[]): string[] {
  return [...DOCUMENTOS_DISPONIVEIS.filter((d) => marcados.includes(d)), ...docsCalibracao];
}

/**
 * Marcar/desmarcar preservando o resto — usado pelas caixas do passo 1 e pelas
 * da revisão, que são a MESMA seleção vista de dois lugares.
 */
export function alternarDocumento(marcados: string[], doc: string): string[] {
  return marcados.includes(doc) ? marcados.filter((d) => d !== doc) : [...marcados, doc];
}
