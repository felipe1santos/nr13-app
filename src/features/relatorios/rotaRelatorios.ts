/**
 * Fase 9 · 9E.5 — quem decide qual tela `/relatorios` mostra.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
 * No rollout de 25/08/2026, com `busca_v9` LIGADA, clicar em "Visualizar" num
 * relatório não fazia nada. A tela nova delegava a abertura navegando para
 * `/relatorios?tag=…&rel=…`, confiando que "a tela legada sabe abrir a partir da
 * TAG" — mas a rota `/relatorios` decidia a tela pela FLAG e só por ela, então o
 * link levava de volta à mesma tela nova, que ignora `tag` e `rel`. Com a flag
 * ligada não existia caminho nenhum até o documento arquivado.
 *
 * ── A REGRA ─────────────────────────────────────────────────────────────────
 * A flag continua mandando no padrão — ela é a decisão de rollout. O que muda é
 * que a URL passa a ter uma saída explícita (`legado=1`), usada num caso só: o
 * relatório salvo ANTES do §7-quater, que não tem PDF arquivado e por isso só a
 * tela antiga sabe remontar. Todo o resto a V9 abre sozinha, pelo `pdfRef`.
 *
 * Isto é função pura porque a tela não pode ser testada aqui: a suíte roda em
 * `environment: 'node'`, sem DOM. A regra que quebrou em produção não pode
 * depender de um teste que este projeto não tem como escrever.
 */

/** A tela que `/relatorios` deve montar. */
export function modoRelatorios(flagAtiva: boolean, search: string): 'v9' | 'legado' {
  if (!flagAtiva) return 'legado';
  return new URLSearchParams(search).get('legado') === '1' ? 'legado' : 'v9';
}

/** Para onde a tela legada deve ir ao abrir, quando a URL pede um documento. */
export interface AlvoLegado {
  tag: string;
  /** `null` = abre só o histórico da TAG; é destino útil, não falha. */
  rel: string | null;
}

export function alvoLegadoDaUrl(search: string): AlvoLegado | null {
  const p = new URLSearchParams(search);
  const tag = (p.get('tag') ?? '').trim();
  if (!tag) return null;
  const rel = (p.get('rel') ?? '').trim();
  return { tag, rel: rel === '' ? null : rel };
}

/** O link que leva um documento específico para a tela antiga. */
export function urlDoLegado(tag: string, rel: string): string {
  return `/relatorios?legado=1&tag=${encodeURIComponent(tag)}&rel=${encodeURIComponent(rel)}`;
}
