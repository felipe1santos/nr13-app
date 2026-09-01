/**
 * Funções puras do Painel Admin — séries diárias, sparklines e faturamento.
 *
 * Moram aqui, e não dentro do `Admin.tsx`, pelo mesmo motivo de
 * `adminMetricas.ts`: dá para testar sem montar a tela, e o desenho do gráfico
 * (a parte que erra silenciosamente com NaN e some da folha sem avisar) fica
 * coberto por teste em vez de conferido a olho.
 */

/**
 * Mensalidade do sistema. Valor único para todos os assinantes, combinado com o
 * dono do produto em 01/09/2026. Não há coluna de preço por conta de propósito:
 * preço diferente por cliente hoje não existe, e uma coluna sem uso vira campo
 * que ninguém mantém e número que ninguém confere.
 */
export const MENSALIDADE_PADRAO = 197;

export interface PontoSerie {
  /** Dia no formato `AAAA-MM-DD`, no fuso de São Paulo. */
  dia: string;
  valor: number;
}

/**
 * Fuso do painel. O dono do produto lê estes números no horário dele; usar UTC
 * jogaria todo evento depois das 21h para o dia seguinte, e o gráfico mostraria
 * pico num dia em que ninguém trabalhou.
 */
const FUSO = 'America/Sao_Paulo';

/** `AAAA-MM-DD` de um instante, no fuso de São Paulo. `null` se não for data. */
export function chaveDia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // 'en-CA' devolve exatamente AAAA-MM-DD — sem montar a string na mão a partir
  // de getFullYear/getMonth, que ignorariam o fuso.
  return d.toLocaleDateString('en-CA', { timeZone: FUSO });
}

/**
 * Série contínua dos últimos `dias` dias terminando em `ate` (inclusive).
 *
 * Contínua importa: o gráfico precisa de um ponto por dia mesmo quando não
 * houve evento nenhum. Pular o dia vazio encurtaria o eixo e faria dois dias
 * distantes virarem vizinhos na linha.
 */
export function serieDiaria(
  isos: Array<string | null | undefined>,
  dias: number,
  ate: Date = new Date(),
): PontoSerie[] {
  const contagem = new Map<string, number>();
  for (const iso of isos) {
    const k = chaveDia(iso);
    if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const out: PontoSerie[] = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(ate.getTime() - i * 86_400_000);
    const k = d.toLocaleDateString('en-CA', { timeZone: FUSO });
    out.push({ dia: k, valor: contagem.get(k) ?? 0 });
  }
  return out;
}

export function somaSerie(s: PontoSerie[]): number {
  return s.reduce((a, p) => a + p.valor, 0);
}

/**
 * Variação da metade recente contra a anterior, em pontos percentuais inteiros.
 *
 * `null` quando a metade anterior é ZERO: de 0 para 3 não é "subiu 300%", é uma
 * divisão por zero, e o painel prefere não dizer nada a dizer número inventado.
 */
export function variacaoPercentual(s: PontoSerie[]): number | null {
  if (s.length < 2) return null;
  const meio = Math.floor(s.length / 2);
  const antes = somaSerie(s.slice(0, meio));
  const depois = somaSerie(s.slice(meio));
  if (antes === 0) return null;
  return Math.round(((depois - antes) / antes) * 100);
}

/** Escala vertical da série. Máximo 0 vira 1 para não dividir por zero. */
function escala(s: PontoSerie[]): number {
  const max = Math.max(...s.map((p) => p.valor), 0);
  return max === 0 ? 1 : max;
}

/** Coordenada X do ponto `i`. Um ponto só fica encostado na esquerda. */
function px(i: number, total: number, largura: number): number {
  if (total <= 1) return 0;
  return (i / (total - 1)) * largura;
}

function py(valor: number, max: number, altura: number): number {
  return altura - (valor / max) * altura;
}

/** Duas casas bastam num SVG de 100px — mais que isso só engorda o DOM. */
function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `"x,y x,y …"` para o `points` de um `<polyline>`. Vazio se não há série. */
export function pontosSparkline(s: PontoSerie[], largura: number, altura: number): string {
  if (s.length === 0) return '';
  const max = escala(s);
  return s
    .map((p, i) => `${arred(px(i, s.length, largura))},${arred(py(p.valor, max, altura))}`)
    .join(' ');
}

/** `d` de um `<path>` fechado na base — é o preenchimento sob a linha. */
export function areaSparkline(s: PontoSerie[], largura: number, altura: number): string {
  if (s.length === 0) return '';
  const max = escala(s);
  const linha = s
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${arred(px(i, s.length, largura))},${arred(py(p.valor, max, altura))}`,
    )
    .join(' ');
  const xFim = arred(px(s.length - 1, s.length, largura));
  return `${linha} L${xFim},${altura} L0,${altura} Z`;
}

/** Valor em reais no padrão brasileiro. Entrada inválida vira travessão. */
export function fmtBRL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  // O separador que o Intl põe entre "R$" e o número é espaço NÃO-SEPARÁVEL
  // (U+00A0, ou U+202F em ICU novo), não o espaço comum — e muda com a versão
  // do ICU. A classe \s cobre os dois; normalizar aqui é o que faz o teste
  // valer igual no Node e no navegador.
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');
}

export interface Faturamento {
  assinantes: number;
  mensalidade: number;
  mrr: number;
  anual: number;
}

export function calcularFaturamento(assinantes: number, mensalidade: number): Faturamento {
  const mrr = assinantes * mensalidade;
  return { assinantes, mensalidade, mrr, anual: mrr * 12 };
}
