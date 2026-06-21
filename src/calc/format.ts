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

// Estilos inline idênticos aos 3 lugares que os definiam (CalculoAutoclave.retangular/cilindrica
// e CalculoCaldeira) — centralizados aqui só pra não repetir a string 3x, sem mudar o resultado.
export const CSS_OK =
  "background-color: #e6f4ea; color: #188038; padding: 8px 12px; border-left: 4px solid #188038; margin-top: 10px; margin-bottom: 15px; border-radius: 3px; font-family: 'Roboto', sans-serif;";
export const CSS_ERRO =
  "background-color: #fce8e6; color: #d93025; padding: 8px 12px; border-left: 4px solid #d93025; margin-top: 10px; margin-bottom: 15px; border-radius: 3px; font-family: 'Roboto', sans-serif;";
export const CSS_AVISO =
  "background-color: #fef7e0; color: #b06000; padding: 8px 12px; border-left: 4px solid #f9ab00; margin-top: 10px; margin-bottom: 15px; border-radius: 3px; font-family: 'Roboto', sans-serif;";
