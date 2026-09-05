import type { ItemRelatorio } from '../../services/buscaRelatorios';
import type { RascunhoItem } from './rascunhos';

/**
 * Hotfix de UX (05/09/2026) · UMA LISTA SÓ em `/relatorios`.
 *
 * ## O que estava errado
 *
 * A tela tinha duas listagens empilhadas: um bloco "Em rascunho" em cima, com
 * cabeçalho, contagem e linhas próprias, e a lista dos emitidos embaixo, com
 * OUTRO cabeçalho e outras linhas. Visualmente eram duas tabelas iguais uma
 * sobre a outra — a tela parecia clonada, e para achar um documento era preciso
 * decidir antes em qual das duas procurar.
 *
 * O argumento original do bloco separado era que rascunho não tem emissão, nem
 * validade, nem PDF, e por isso "não teria o que preencher nas colunas". Isso é
 * verdade sobre os DADOS e não justifica duas tabelas: a diferença cabe numa
 * coluna de situação e num ícone. Continua sem inventar data nenhuma — a célula
 * vazia mostra travessão, como qualquer outra célula vazia do sistema.
 *
 * ## O que NÃO muda
 *
 * Rascunho continua fora da projeção do servidor, continua sem gerar
 * vencimento, Livro ou Portal, e continua sendo o único que pode ser destruído.
 * A união é de APRESENTAÇÃO: as ações de cada linha seguem as regras de sempre.
 *
 * Rascunhos vêm primeiro porque é trabalho em aberto — o que o usuário
 * provavelmente veio continuar. Depois deles, a ordem do servidor (emissão
 * decrescente) fica intacta: reordenar a lista inteira no cliente quebraria a
 * paginação por cursor.
 */
export type SituacaoLinha = 'rascunho' | 'arquivado' | 'finalizado' | 'sem-arquivo';

export type LinhaRelatorio =
  | { tipo: 'rascunho'; chave: string; rascunho: RascunhoItem }
  | { tipo: 'emitido'; chave: string; item: ItemRelatorio };

/** A lista da tela: rascunhos no topo, emitidos na ordem em que o servidor os deu. */
export function unificarLista(
  rascunhos: RascunhoItem[],
  emitidos: ItemRelatorio[],
): LinhaRelatorio[] {
  return [
    ...rascunhos.map((r): LinhaRelatorio => ({ tipo: 'rascunho', chave: `rasc:${r.id}`, rascunho: r })),
    ...emitidos.map((i): LinhaRelatorio => ({ tipo: 'emitido', chave: `rel:${i.relatorioId}`, item: i })),
  ];
}

/**
 * A situação que o selo da linha mostra.
 *
 * `sem-arquivo` é o relatório anterior ao §7-quater: finalizado, mas sem PDF
 * arquivado. Ele não pode se chamar "finalizado" junto dos que têm arquivo —
 * quem clica espera o documento, e ali só existe a receita.
 */
export function situacaoDaLinha(linha: LinhaRelatorio, arquivados: Set<string>): SituacaoLinha {
  if (linha.tipo === 'rascunho') return 'rascunho';
  if (arquivados.has(linha.item.relatorioId)) return 'arquivado';
  return linha.item.pdfRef ? 'finalizado' : 'sem-arquivo';
}

const ROTULOS: Record<SituacaoLinha, string> = {
  rascunho: 'RASCUNHO',
  arquivado: 'ARQUIVADO',
  finalizado: 'FINALIZADO',
  'sem-arquivo': 'SEM ARQUIVO',
};

export function rotuloSituacao(s: SituacaoLinha): string {
  return ROTULOS[s];
}

/** Quantas linhas a tela mostra — rascunho conta, porque ele está na lista. */
export function totalNaTela(rascunhos: number, emitidos: number): number {
  return rascunhos + emitidos;
}

/**
 * A PRÓXIMA INSPEÇÃO da linha — a mais próxima entre interna e externa.
 *
 * As duas datas já vêm na projeção (`proximaInterna`, `proximaExterna`), então
 * a coluna não custa requisição, leitura de documento nem hidratação. Quando
 * só uma existe, é ela. Quando nenhuma existe, `null` — e a célula mostra
 * travessão, como qualquer outra célula sem dado.
 *
 * A data-sentinela `0001-…` é mecanismo interno de ordenação e nunca é uma
 * resposta: ela vale como ausente.
 */
export function proximaInspecaoIso(
  r: { proximaInterna?: string | null; proximaExterna?: string | null },
): string | null {
  const validas = [r.proximaInterna, r.proximaExterna]
    .map((d) => (d ?? '').trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d) && !d.startsWith('0001'));
  if (validas.length === 0) return null;
  return validas.sort()[0];
}

/** Qual das duas é a data mostrada — para o `title` dizer o que ela significa. */
export function qualProxima(
  r: { proximaInterna?: string | null; proximaExterna?: string | null },
): 'interna' | 'externa' | null {
  const escolhida = proximaInspecaoIso(r);
  if (!escolhida) return null;
  return (r.proximaInterna ?? '').startsWith(escolhida) ? 'interna' : 'externa';
}
