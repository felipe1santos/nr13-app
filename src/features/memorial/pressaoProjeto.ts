import { ler } from '../../services/storage';

/**
 * A PRESSÃO DE PROJETO do equipamento, canônica em MPa — UMA fonte para o
 * sistema inteiro (revisão do engenheiro, 18/09/2026).
 *
 * ## As quatro grandezas, e por que nenhuma substitui a outra
 *
 * | grandeza | fonte |
 * |---|---|
 * | PMTA | `nr13_info_.pmtaAdotadaMpa` ?? `nr13_calc_.pmta` (memorial) |
 * | PRESSÃO DE PROJETO | esta função — o `P` que o MEMORIAL usou no cálculo |
 * | PRESSÃO DE TRABALHO | `nr13_info_.pmoAdotadaMpa` (PMO declarada na ficha) |
 * | PRESSÃO DE TESTE | o que o técnico aplicou (`th.pressaoTeste`); o prefill é a PTH adotada ?? calculada |
 *
 * O formulário do teste hidrostático pré-preenchia a "pressão de projeto" com a
 * PMTA. São números diferentes (a PMTA sai do cálculo e pode ser maior ou menor
 * que a de projeto) e o documento imprimia um com o nome do outro.
 *
 * ## Onde o memorial guarda o `P`
 *
 * Cada tipo de equipamento tem a sua chave, e é por isso que ler só a primeira
 * (o que `modelo.ts` fazia) deixava caldeira e autoclave sem pressão de projeto:
 *
 * - vaso: `nr13_vaso_<TAG>.P`
 * - corpo do autoclave: `nr13_vaso_ac_corpo_<TAG>.P`
 * - caldeira: `nr13_vaso_cald_<TAG>.P` ("Pressão de projeto (MPa) — global da caldeira")
 * - autoclave por subtipo: `nr13_autoclave_dados_<subtipo>_<TAG>.pressao`
 *
 * Todas em MPa. Sem valor numérico em nenhuma, a resposta é `null` — e `null`
 * vira travessão no documento. Nunca a PMTA.
 */
export function pressaoDeProjetoMpa(tag: string): number | null {
  for (const chave of [`nr13_vaso_${tag}`, `nr13_vaso_ac_corpo_${tag}`, `nr13_vaso_cald_${tag}`]) {
    const v = numero(lerSeguro<{ P?: unknown }>(chave)?.P);
    if (v !== null) return v;
  }
  const info = lerSeguro<{ tipo?: string; subtipo?: string }>(`nr13_info_${tag}`);
  if (String(info?.tipo ?? '').toLowerCase().startsWith('autoclave')) {
    const subtipo = (info?.subtipo || 'cilindrica').trim();
    const v = numero(lerSeguro<{ pressao?: unknown }>(`nr13_autoclave_dados_${subtipo}_${tag}`)?.pressao);
    if (v !== null) return v;
  }
  return null;
}

function lerSeguro<T>(chave: string): T | null {
  try {
    return ler<T>(chave) ?? null;
  } catch {
    return null;
  }
}

/** Número positivo do storage — string ou number; `''`, texto e zero não valem. */
function numero(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) && n > 0 && !(typeof v === 'string' && v.trim() === '') ? n : null;
}
