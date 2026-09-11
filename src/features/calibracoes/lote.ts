import type { ComponenteCal, LoteCal } from './componentesService';
import type { DadosCalibracao } from './tipos';

/**
 * As regras do LOTE de calibração — fora do `.tsx` para terem teste.
 *
 * ## O que o lote é
 *
 * Uma rodada de calibração: um nome, uma data e os acessórios daquele
 * equipamento que foram (ou serão) calibrados nela. Cada item vira um
 * certificado próprio; o lote é o que os agrupa e o que se vincula ao
 * relatório da inspeção.
 *
 * ## Os dois campos que faltavam (11/09/2026)
 *
 * `data` e `itens` nasceram opcionais e continuam opcionais: nenhum lote
 * antigo foi reescrito. As funções daqui são o ÚNICO lugar que decide o
 * fallback, para a tela, o Dashboard e o vínculo com o relatório nunca
 * divergirem sobre o que um lote legado significa.
 */

/** A data que o lote exibe: a de execução, ou a de criação nos legados. */
export function dataDoLote(lote: LoteCal): string {
  return (lote.data ?? '').trim() || lote.criadoEm;
}

/**
 * Os componentes que este lote cobre.
 *
 * Lote legado (sem `itens`) devolve o parque inteiro — é exatamente o que o
 * accordion antigo renderizava. Um id que já não existe (componente excluído)
 * some da lista em vez de virar linha fantasma.
 */
export function itensDoLote(lote: LoteCal, componentes: ComponenteCal[]): ComponenteCal[] {
  if (!lote.itens) return componentes;
  const escolhidos = new Set(lote.itens);
  return componentes.filter((c) => escolhidos.has(c.id));
}

export interface ProgressoLote {
  feitos: number;
  total: number;
  completo: boolean;
}

/**
 * Quantos itens do lote já têm certificado.
 *
 * O denominador é o do LOTE, não o do equipamento. Era essa a origem do
 * "Completo" que voltava sozinho a "Em andamento" quando alguém cadastrava um
 * componente novo meses depois.
 *
 * Lote sem item nenhum não é "completo": `0/0` seria uma rodada concluída sem
 * ter calibrado nada.
 */
export function progressoLote(
  lote: LoteCal,
  componentes: ComponenteCal[],
  calibracoes: DadosCalibracao[],
): ProgressoLote {
  const itens = itensDoLote(lote, componentes);
  const doLote = calibracoes.filter((c) => c.loteId === lote.id);
  const comCertificado = new Set(
    doLote.map((c) => (c as { componenteId?: string }).componenteId).filter((x): x is string => !!x),
  );
  const feitos = itens.filter((c) => comCertificado.has(c.id)).length;
  return { feitos, total: itens.length, completo: itens.length > 0 && feitos >= itens.length };
}

/** A calibração daquele componente dentro daquele lote, se já existir. */
export function calibracaoDoItem(
  loteId: string,
  componenteId: string,
  calibracoes: DadosCalibracao[],
): DadosCalibracao | null {
  return (
    calibracoes.find(
      (c) => c.loteId === loteId && (c as { componenteId?: string }).componenteId === componenteId,
    ) ?? null
  );
}

/** `dd/mm/aaaa` → número comparável; `0` quando a data não presta. */
export function ordemData(d: string | undefined | null): number {
  const p = (d ?? '').split('/');
  if (p.length !== 3) return 0;
  const t = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Os lotes do mais recente para o mais antigo, pela data de EXECUÇÃO. */
export function ordenarLotes(lotes: LoteCal[]): LoteCal[] {
  return [...lotes].sort((a, b) => ordemData(dataDoLote(b)) - ordemData(dataDoLote(a)));
}

export type SituacaoLote = 'todos' | 'andamento' | 'completo';

export interface FiltroLotes {
  termo: string;
  situacao: SituacaoLote;
}

export const FILTRO_LOTES_VAZIO: FiltroLotes = { termo: '', situacao: 'todos' };

function normalizar(s: string): string {
  return s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * A busca casa o NOME e a DATA do lote, e também o nome dos componentes que
 * ele cobre: "quando o PSV-01 foi calibrado?" é a pergunta que se faz aqui, e
 * ela não se responde procurando pelo nome do lote.
 */
export function filtrarLotes(
  lotes: LoteCal[],
  filtro: FiltroLotes,
  componentes: ComponenteCal[],
  calibracoes: DadosCalibracao[],
): LoteCal[] {
  const termo = normalizar(filtro.termo.trim());
  return lotes.filter((lote) => {
    if (filtro.situacao !== 'todos') {
      const { completo } = progressoLote(lote, componentes, calibracoes);
      if (filtro.situacao === 'completo' && !completo) return false;
      if (filtro.situacao === 'andamento' && completo) return false;
    }
    if (termo === '') return true;
    const alvo = [
      lote.descricao,
      dataDoLote(lote),
      ...itensDoLote(lote, componentes).map((c) => `${c.nome} ${c.serie ?? ''}`),
    ]
      .map(normalizar)
      .join(' ');
    return alvo.includes(termo);
  });
}

/**
 * O histórico de calibrações de UM componente, do mais recente ao mais antigo.
 *
 * Responde às três perguntas do §31 sem sair do modal: quando foi calibrado,
 * qual foi a anterior e quando vence.
 */
export function historicoDoComponente(
  componenteId: string,
  calibracoes: DadosCalibracao[],
): DadosCalibracao[] {
  return calibracoes
    .filter((c) => (c as { componenteId?: string }).componenteId === componenteId)
    .sort((a, b) => ordemData(b.dataCalibracao || b.criadoEm) - ordemData(a.dataCalibracao || a.criadoEm));
}

/** Um lote só pode ser excluído enquanto não tiver certificado nenhum. */
export function podeExcluirLote(loteId: string, calibracoes: DadosCalibracao[]): boolean {
  return !calibracoes.some((c) => c.loteId === loteId);
}
