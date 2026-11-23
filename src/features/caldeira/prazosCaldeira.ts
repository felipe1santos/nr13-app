/**
 * PRAZOS DE INSPEÇÃO DE CALDEIRA — NR-13 vigente (23/11/2026).
 *
 * 13.4.4.4 — inspeção periódica (exames interno e externo), prazos máximos:
 *   a) 12 meses para caldeiras das categorias A e B;
 *   b) 18 meses para caldeiras de recuperação de álcalis de qualquer categoria;
 *   c) 24 meses para categoria A, desde que aos 12 meses sejam testadas as
 *      pressões de abertura das válvulas de segurança;
 *   d) 30 meses para categoria B com SGC que atenda ao Anexo IV.
 * 13.4.4.5 — com SPIE (Anexo II): 24 meses recuperação de álcalis; 24 meses
 *   categoria B; 30 meses categoria A; 48 meses categoria A com SIS (Anexo IV).
 * 13.4.4.6 — aos 25 anos de uso, na inspeção subsequente, avaliação de
 *   integridade com maior abrangência.
 *
 * É SUGESTÃO: o PLH decide a data e o sistema nunca a impõe. O que se sugere é
 * o prazo MÁXIMO da norma para a condição informada.
 */

export interface CondicoesPrazoCaldeira {
  recuperacaoAlcalis?: boolean;
  /** 13.4.4.4 c) — pressões de abertura das válvulas testadas aos 12 meses. */
  valvulasTestadasAos12Meses?: boolean;
  /** 13.4.4.4 d) — categoria B com sistema de gerenciamento de combustão (Anexo IV). */
  sgcAnexoIV?: boolean;
  /** 13.4.4.5 — estabelecimento com Serviço Próprio de Inspeção de Equipamentos. */
  spie?: boolean;
  /** 13.4.4.5 d) — categoria A com Sistema Instrumentado de Segurança (Anexo IV). */
  sis?: boolean;
}

export interface PrazoCaldeira {
  meses: number;
  item: string;
}

/** O prazo máximo da inspeção periódica (meses), com o item da norma. `null` sem categoria A/B. */
export function prazoMaximoCaldeira(categoria: string | null | undefined, c: CondicoesPrazoCaldeira = {}): PrazoCaldeira | null {
  if (categoria !== 'A' && categoria !== 'B') return null;
  if (c.spie) {
    if (c.recuperacaoAlcalis) return { meses: 24, item: '13.4.4.5 a)' };
    if (categoria === 'B') return { meses: 24, item: '13.4.4.5 b)' };
    if (c.sis) return { meses: 48, item: '13.4.4.5 d)' };
    return { meses: 30, item: '13.4.4.5 c)' };
  }
  if (c.recuperacaoAlcalis) return { meses: 18, item: '13.4.4.4 b)' };
  if (categoria === 'A' && c.valvulasTestadasAos12Meses) return { meses: 24, item: '13.4.4.4 c)' };
  if (categoria === 'B' && c.sgcAnexoIV) return { meses: 30, item: '13.4.4.4 d)' };
  return { meses: 12, item: '13.4.4.4 a)' };
}

/** "dd/mm/aaaa" + N meses → "dd/mm/aaaa". Dia que não existe no mês final cai no último dia (31/01 + 1 → 28/02). */
export function somarMesesBr(dataBr: string, meses: number): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dataBr ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const ano = Number(m[3]);
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
  const alvoMes = mes + meses;
  const anoFinal = ano + Math.floor(alvoMes / 12);
  const mesFinal = ((alvoMes % 12) + 12) % 12;
  const ultimo = new Date(anoFinal, mesFinal + 1, 0).getDate();
  const d = Math.min(dia, ultimo);
  return `${String(d).padStart(2, '0')}/${String(mesFinal + 1).padStart(2, '0')}/${anoFinal}`;
}

/** 13.4.4.6 — idade da caldeira na data de referência e se passou dos 25 anos. */
export function avaliacaoVinteECincoAnos(anoFabricacao: string | number | null | undefined, anoReferencia: number): { idade: number; exige: boolean } | null {
  const ano = Number(String(anoFabricacao ?? '').trim());
  if (!Number.isInteger(ano) || ano < 1800 || ano > anoReferencia) return null;
  const idade = anoReferencia - ano;
  return { idade, exige: idade >= 25 };
}
