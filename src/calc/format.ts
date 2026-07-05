import type { NumLike } from './tipos';

// Replica o comportamento exato de `parseFloat(v) || def` do math.js original:
// NaN e 0 são ambos "falsy" em JS, então 0 também cai pro default — preservado de propósito
// para não alterar nenhum resultado numérico existente.
export function numOuPadrao(v: NumLike, padrao: number): number {
  const n = parseFloat(String(v ?? ''));
  return n || padrao;
}

// `parseFloat(v)` puro, sem fallback — usado onde o math.js original também não tinha default
// (a ausência do campo deve propagar NaN, igual hoje).
export function num(v: NumLike): number {
  return parseFloat(String(v ?? ''));
}

// Estilos inline dos status no log (viajam dentro do memorialHTML salvo, então valem tanto no
// terminal do app quanto nas folhas do relatório). Mesmo design dos .msg-aprovado/.msg-reprovado
// do terminal do vaso: aprovado #008F3F/#E3FFEF, reprovado #DE2300/#FFECE8, padding 11px.
export const CSS_OK =
  'background-color: #E3FFEF; color: #008F3F; padding: 11px 12px; margin: 4px 0; border-radius: 6px; font-weight: 600; font-family: inherit;';
export const CSS_ERRO =
  'background-color: #FFECE8; color: #DE2300; padding: 11px 12px; margin: 4px 0; border-radius: 6px; font-weight: 600; font-family: inherit;';
export const CSS_AVISO =
  'background-color: #FBF1DC; color: #B8860B; padding: 11px 12px; margin: 4px 0; border-radius: 6px; font-weight: 600; font-family: inherit;';
