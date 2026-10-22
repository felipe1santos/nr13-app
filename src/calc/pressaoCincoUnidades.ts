/**
 * PRESSÃO EM CINCO UNIDADES (21/10/2026) — Ensaio de Acumulação.
 *
 * O laudo do ensaio de acumulação imprime a pressão máxima atingida em MPa,
 * kPa, psi, kgf/cm² e bar, e o técnico digita em UMA delas. `calc/unidades.ts`
 * só conhece os três sistemas de exibição do equipamento (MPa, kgf/cm², bar);
 * kPa e psi não são sistema de ninguém, então entram aqui como conversão pura,
 * sem tocar no que já existe.
 *
 * Os fatores de kgf/cm² e bar são os MESMOS de `FATORES_CONVERSAO` — o teste
 * confere —, para os dois módulos nunca discordarem do mesmo número.
 * psi: 1 psi = 6,894757 kPa (NIST SP 811).
 */
import { FATORES_CONVERSAO } from './unidades';

export type UnidadePressao = 'MPa' | 'kPa' | 'psi' | 'kgf/cm²' | 'bar';

export const UNIDADES_PRESSAO: readonly UnidadePressao[] = ['MPa', 'kPa', 'psi', 'kgf/cm²', 'bar'];

/** Quantas unidades valem 1 MPa. */
export const POR_MPA: Record<UnidadePressao, number> = {
  MPa: 1,
  kPa: 1000,
  psi: 1000 / 6.894757293168,
  'kgf/cm²': FATORES_CONVERSAO.TECNICO.mult,
  bar: FATORES_CONVERSAO.PETROBRAS.mult,
};

/** Casas decimais de exibição — as do laudo de referência (1,080 · 1080 · 157 · 11,01 · 10,80). */
export const CASAS_PRESSAO: Record<UnidadePressao, number> = {
  MPa: 3,
  kPa: 0,
  psi: 0,
  'kgf/cm²': 2,
  bar: 2,
};

export function ehUnidadePressao(v: unknown): v is UnidadePressao {
  return typeof v === 'string' && (UNIDADES_PRESSAO as readonly string[]).includes(v);
}

export function paraMpaDe(valor: number, de: UnidadePressao): number {
  return valor / POR_MPA[de];
}

export function deMpaPara(mpa: number, para: UnidadePressao): number {
  return mpa * POR_MPA[para];
}

/** O valor digitado, nas cinco unidades. `null` quando não é número positivo. */
export function emCincoUnidades(valor: number | null, de: UnidadePressao): Record<UnidadePressao, number> | null {
  if (valor === null || !Number.isFinite(valor) || valor <= 0) return null;
  const mpa = paraMpaDe(valor, de);
  return Object.fromEntries(UNIDADES_PRESSAO.map((u) => [u, deMpaPara(mpa, u)])) as Record<UnidadePressao, number>;
}

/** Formata em pt-BR com as casas da unidade. */
export function formatarPressao(valor: number, unidade: UnidadePressao): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: CASAS_PRESSAO[unidade],
    maximumFractionDigits: CASAS_PRESSAO[unidade],
    useGrouping: false,
  });
}
