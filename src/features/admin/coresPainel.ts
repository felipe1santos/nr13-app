/**
 * AS CORES DO PAINEL — o que cada uma AFIRMA (21/09/2026).
 *
 * Cor em painel não é enfeite: ela é lida antes do número, e por isso precisa
 * significar sempre a mesma coisa. Aqui ficam as duas escalas do painel, em
 * módulo próprio e sem JSX, para a suíte (que roda em `node`) alcançar.
 *
 * ## A escala das TAGS
 *
 * | tag | cor | o que afirma |
 * |---|---|---|
 * | pagante | verde | entra no MRR |
 * | vitalício | roxo | usa o sistema, não paga |
 * | interna | azul | conta do próprio dono, não é cliente |
 * | suspenso | vermelho | sem acesso hoje |
 *
 * Verde é o único que significa receita. Roxo e azul são "ativo, mas fora da
 * conta" — diferentes entre si porque cortesia e conta interna se confundem na
 * leitura rápida e levam a somas erradas.
 *
 * ## A escala de OCUPAÇÃO
 *
 * Verde/âmbar/vermelho por fração da COTA REAL do plano (Management API), nunca
 * por um teto inventado aqui. Sem cota conhecida a barra fica neutra: pintar de
 * vermelho um número sem referência é inventar um alarme.
 */

export type NivelOcupacao = 'ok' | 'atencao' | 'critico' | 'desconhecido';

/** A partir de 75% é atenção; de 90%, crítico. */
export const LIMIAR_ATENCAO = 0.75;
export const LIMIAR_CRITICO = 0.9;

/**
 * Em que nível está um consumo diante da sua cota.
 *
 * `null` em qualquer um dos dois devolve `desconhecido` — é o caso da Edge de
 * infraestrutura não publicada, e nele a tela mostra o número sem cor de
 * alarme. Cota zero ou negativa também: dividir por ela daria infinito e
 * pintaria tudo de vermelho para sempre.
 */
export function nivelDeOcupacao(usado: number | null, cota: number | null): NivelOcupacao {
  if (usado === null || cota === null || !Number.isFinite(usado) || !Number.isFinite(cota) || cota <= 0) {
    return 'desconhecido';
  }
  const fracao = usado / cota;
  if (fracao >= LIMIAR_CRITICO) return 'critico';
  if (fracao >= LIMIAR_ATENCAO) return 'atencao';
  return 'ok';
}

/** A fração 0–1 para a barra, limitada a 1: barra não passa da caixa. */
export function fracaoDaBarra(usado: number | null, cota: number | null): number | null {
  if (usado === null || cota === null || cota <= 0) return null;
  return Math.max(0, Math.min(1, usado / cota));
}

/**
 * O texto que acompanha a barra.
 *
 * Diz o quanto FALTA quando aperta, e o quanto foi usado quando sobra: perto do
 * teto, a pergunta deixa de ser "quanto usei" e passa a ser "quanto ainda
 * tenho".
 */
export function rotuloDeOcupacao(usado: number | null, cota: number | null): string {
  const f = fracaoDaBarra(usado, cota);
  if (f === null) return 'sem cota conhecida';
  const pct = Math.round(f * 100);
  return f >= LIMIAR_ATENCAO ? `${pct}% da cota · restam ${100 - pct}%` : `${pct}% da cota`;
}
