/**
 * O que o modal do cliente mostra além do cadastro (v4, 25/10/2026): os
 * equipamentos dele e a situação dos prazos.
 *
 * ## De onde vem cada número — e o que NÃO entra
 *
 *   · EQUIPAMENTOS: do catálogo do servidor (`buscar_equipamentos`), uma busca
 *     pelo nome do cliente. A projeção guarda o cliente do equipamento como
 *     NOME (`clienteNome` = `razaoSocial || nomeFantasia` do `nr13_emp_<TAG>`),
 *     não como id — por isso a busca é por nome e o filtro final é por
 *     igualdade de nome normalizado. A busca textual sozinha não basta: "SA"
 *     também casa com "Cliente SA Engenharia".
 *   · VENCIDOS / A VENCER EM 30 DIAS: do MESMO agregado do Dashboard
 *     (`carregarPainel`), filtrado pelas TAGs do cliente — o item do próprio
 *     equipamento e o dos acessórios dele (`pertenceA`). A regra do prazo é a do
 *     motor de vencimentos, nunca refeita aqui.
 *   · Conformidade e faturamento, que a prévia da v4 desenhava, NÃO entram:
 *     nenhuma fonte do sistema os tem por cliente.
 *
 * `undefined` continua significando "não deu para conferir" (a tela escreve
 * "—"), e nunca vira zero — a mesma regra de `KpisPainel`.
 */
import type { ItemCatalogo } from '../../services/buscaIndex';
import type { ItemVencimento } from '../../services/vencimentos';
import type { Cliente } from './tipos';

/** Maiúsculas, sem espaço duplo nem nas pontas: o que o usuário digitou duas vezes igual. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

/** Os nomes pelos quais um equipamento pode apontar para este cliente. */
export function nomesDoCliente(c: Pick<Cliente, 'razaoSocial' | 'nomeFantasia'>): string[] {
  const nomes = [normalizarNome(c.razaoSocial), normalizarNome(c.nomeFantasia)].filter(Boolean);
  return [...new Set(nomes)];
}

/** Só os itens do catálogo cujo cliente é EXATAMENTE este (por nome normalizado). */
export function equipamentosDoCliente(
  itens: ItemCatalogo[],
  c: Pick<Cliente, 'razaoSocial' | 'nomeFantasia'>,
): ItemCatalogo[] {
  const nomes = new Set(nomesDoCliente(c));
  if (!nomes.size) return [];
  const vistos = new Set<string>();
  return itens.filter((i) => {
    if (vistos.has(i.tag)) return false;
    if (!nomes.has(normalizarNome(i.clienteNome))) return false;
    vistos.add(i.tag);
    return true;
  });
}

export interface ResumoPrazos {
  vencidos?: number;
  aVencer30?: number;
  /** O prazo da INSPEÇÃO de cada equipamento (origem `inspecao`), por TAG. */
  porTag: Map<string, ItemVencimento>;
}

/**
 * Filtra o agregado do painel pelas TAGs do cliente.
 *
 * `painel` nulo (erro) ou TRUNCADO deixa os contadores indefinidos: com a lista
 * cortada no servidor, um zero aqui afirmaria "nada vencido" sem ter conferido.
 */
export function resumoPrazos(
  tags: string[],
  painel: { itens: ItemVencimento[]; truncado: boolean; erro?: boolean } | null,
): ResumoPrazos {
  const porTag = new Map<string, ItemVencimento>();
  if (!painel || painel.erro) return { porTag };
  const conjunto = new Set(tags);
  const doCliente = painel.itens.filter(
    (i) => conjunto.has(i.tag) || (i.pertenceA !== undefined && conjunto.has(i.pertenceA)),
  );
  for (const i of doCliente) {
    if (i.origem === 'inspecao' && conjunto.has(i.tag)) porTag.set(i.tag, i);
  }
  if (painel.truncado) return { porTag };
  return {
    vencidos: doCliente.filter((i) => i.status === 'crit').length,
    aVencer30: doCliente.filter((i) => i.status === 'warn').length,
    porTag,
  };
}

/** Soma das inspeções; `undefined` se alguma contagem é desconhecida (projeção antiga). */
export function totalInspecoes(itens: ItemCatalogo[]): number | undefined {
  let soma = 0;
  for (const i of itens) {
    if (i.inspecoes === null || i.inspecoes === undefined) return undefined;
    soma += i.inspecoes;
  }
  return soma;
}
