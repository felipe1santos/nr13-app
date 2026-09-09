/**
 * A barra de VIDA REMANESCENTE do cartão do equipamento.
 *
 * O arquivo se chama `barraVida` e não `vidaRemanescente` porque já existe um
 * `VidaRemanescente.tsx` nesta pasta — o CARD da ficha. Dois arquivos que só
 * diferem na primeira letra são, no Windows, o mesmo arquivo para o TypeScript.
 *
 * ## Por que a regra saiu dos cartões
 *
 * Ela existia DUAS vezes, copiada: em `CardEquipamento` (que lê `nr13_vida_`
 * do cache) e em `CardCatalogo` (que recebe a linha da projeção). O portão
 * P9.2 exige que os dois mostrem exatamente a mesma coisa com a flag ligada e
 * desligada — e regra copiada é regra que diverge na primeira mudança. Esta
 * aqui mudou em 09/09/2026 (a faixa azul), e teria que ser lembrada nos dois
 * lugares.
 *
 * A FONTE do número continua sendo de cada um: um lê o storage, o outro recebe
 * pronto. O que se compartilha é só o que fazer com o número.
 *
 * ## A escala
 *
 * `pct` é visual, não é norma: dez anos é o topo da barra. Um equipamento com
 * 12 anos de vida remanescente mostra a barra cheia — a informação exata está
 * no texto ao lado, em anos.
 */

/** Dez anos enchem a barra. Escala de exibição, não critério de engenharia. */
const ANOS_BARRA_CHEIA = 10;

export const COR_VIDA = {
  /** Acima de 75%: folga confortável. Azul pedido pelo dono em 09/09/2026. */
  folgada: '#0078b7',
  boa: 'var(--ok)',
  atencao: 'var(--warn)',
  critica: 'var(--crit)',
  /** Sem cálculo de vida salvo — nem verde nem vermelho: cinza. */
  indefinida: '#AEB4B9',
} as const;

/**
 * A cor da faixa, pela porcentagem da barra.
 *
 * As bordas são exclusivas para cima (`> 75`, não `>= 75`): a faixa seguinte
 * começa onde esta termina, e nenhum valor cai em duas.
 */
export function corDaVida(pct: number): string {
  if (pct > 75) return COR_VIDA.folgada;
  if (pct > 50) return COR_VIDA.boa;
  if (pct > 25) return COR_VIDA.atencao;
  return COR_VIDA.critica;
}

export interface VidaBarra {
  texto: string;
  pct: number;
  cor: string;
}

/** O percentual da barra a partir dos anos — limitado a 0…100. */
export function pctDaVida(anos: number): number {
  return Math.max(0, Math.min(100, Math.round((anos / ANOS_BARRA_CHEIA) * 100)));
}

/**
 * A barra pronta a partir dos anos calculados.
 *
 * `null` = não há cálculo de vida, e o cartão escreve "Não calculado". Um zero
 * aqui seria pior do que a ausência: pintaria a barra de vermelho e afirmaria
 * que o equipamento está no fim, sem ninguém ter calculado nada.
 */
export function vidaDaBarra(anos: number | null | undefined): VidaBarra | null {
  if (anos == null || typeof anos !== 'number' || !Number.isFinite(anos)) return null;
  const pct = pctDaVida(anos);
  return {
    texto: `${anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`,
    pct,
    cor: corDaVida(pct),
  };
}
