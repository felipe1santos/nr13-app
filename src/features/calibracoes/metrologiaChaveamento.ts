import { limparDecimal, paraPonto } from '../memorial/decimal';
import type { EnsaioPressostato } from './tipos';

/**
 * 24/11/2026 · RANGE, DIFERENCIAL e o bloco metrológico do certificado de
 * PRESSOSTATO e TERMOSTATO — o modelo do engenheiro parceiro (Pressostato.xls,
 * laboratório TEMPCALL), seção 6:
 *
 * | campo | de onde vem |
 * |---|---|
 * | Range | o SET POINT do ensaio |
 * | Diferencial | o digitado; vazio = média de |desarme − rearme| dos ensaios completos |
 * | Incerteza, erro fiducial, k, Veff | digitados (opcionais) — vazio sai "—" |
 *
 * Tudo aqui é leitura pura: nada é gravado, e registro antigo sem os campos
 * novos continua gerando (cai no "—").
 */

/** "1,5" | "1.5" → 1.5; vazio, texto ou "∞" → null. */
export function numeroDecimal(t: string | null | undefined): number | null {
  const s = paraPonto(String(t ?? '').trim());
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Número em pt-BR, até 3 casas, sem separador de milhar ("3", "1,25"). */
export function formatarDecimalBr(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return r.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
}

/**
 * O diferencial CALCULADO: média de |desarme − rearme| dos ensaios com as duas
 * leituras numéricas. Nenhum ensaio completo → `null` (não se inventa).
 */
export function diferencialDosEnsaios(ensaios: EnsaioPressostato[] | null | undefined): number | null {
  const difs: number[] = [];
  for (const e of Array.isArray(ensaios) ? ensaios : []) {
    const d = numeroDecimal(e?.desarme);
    const r = numeroDecimal(e?.rearme);
    if (d !== null && r !== null) difs.push(Math.abs(d - r));
  }
  if (difs.length === 0) return null;
  return difs.reduce((a, b) => a + b, 0) / difs.length;
}

/**
 * O diferencial que o certificado imprime: o DIGITADO vence (como foi
 * escrito); senão o calculado; senão `null`.
 */
export function diferencialDoCertificado(
  digitado: string | null | undefined,
  ensaios: EnsaioPressostato[] | null | undefined,
): string | null {
  const t = String(digitado ?? '').trim();
  if (t !== '') return t;
  const calc = diferencialDosEnsaios(ensaios);
  return calc === null ? null : formatarDecimalBr(calc);
}

/** Entrada de um campo decimal: só dígitos, um separador (vírgula OU ponto) e o sinal. */
export function entradaDecimal(t: string): string {
  return limparDecimal(t);
}

/**
 * Entrada do Veff: decimal, ou infinito ("∞", "inf", "infinito" → "∞").
 */
export function entradaVeff(t: string): string {
  const s = t.trim().toLowerCase();
  if (s === '∞' || s === 'inf' || s === 'infinito' || t.includes('∞')) return '∞';
  if (/^i(n(f(i(n(i(t(o)?)?)?)?)?)?)?$/.test(s)) return t.trim();
  return limparDecimal(t);
}

/**
 * O Veff no PDF. A fonte embutida (subconjunto de Carlito) NÃO tem o glifo
 * "∞" — o jsPDF imprimiria em branco ou cortaria o texto. Sai por extenso.
 */
export function veffParaDocumento(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim();
  if (t === '') return null;
  return t === '∞' ? 'infinito' : t;
}
