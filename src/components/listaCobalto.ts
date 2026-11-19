import type { NomeIcone } from './Icone';

/**
 * Peças do padrão de lista do redesign Cobalto (ver styles/listas-cobalto.css)
 * que precisam de lógica: o ícone do tipo de equipamento e a cor da categoria.
 * Só APRESENTAÇÃO — nenhum dado é derivado ou afirmado aqui.
 */

/** Ícone do tile por tipo de equipamento. Tipo desconhecido cai no genérico. */
export function iconeDoTipo(tipo: string | null | undefined): NomeIcone {
  if (tipo === 'caldeira') return 'flame';
  if (tipo === 'autoclave') return 'gauge';
  if (tipo === 'vaso') return 'cylinder';
  return 'box';
}

/**
 * Classe de cor da categoria NR-13 (I = maior risco, vermelho; V = verde).
 * Caldeira usa A/B: A vai com I, B com III. Sem categoria, sem cor.
 */
export function classeCategoria(cat: string | null | undefined): string {
  const c = (cat ?? '').trim().toUpperCase().replace(/^CAT(EGORIA)?\.?\s*/, '');
  const mapa: Record<string, string> = { I: 'c1', A: 'c1', II: 'c2', III: 'c3', B: 'c3', IV: 'c4', V: 'c5' };
  return mapa[c] ?? '';
}
