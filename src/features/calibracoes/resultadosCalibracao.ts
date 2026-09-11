import { calcularErro } from './calibracaoService';

/**
 * Os RESULTADOS de uma calibração de manômetro, no formato em que o usuário
 * pensa — e não no formato em que a folha imprime.
 *
 * ## O problema (10/09/2026)
 *
 * A folha tem duas tabelas independentes, crescente e decrescente, cada uma com
 * a sua coluna "valor convencional". O formulário copiava esse desenho: dez
 * células de VC e dez de VI, vinte campos nus, sem unidade e sem ordem
 * sugerida. Só que **a coluna VC é a mesma nas duas tabelas** — são os mesmos
 * pontos, medidos subindo e descendo. O usuário digitava cada ponto duas vezes.
 *
 * Aqui um PONTO é uma linha só: o valor do ponto e as duas leituras. Vinte
 * campos viram dez, e os erros aparecem enquanto se digita.
 *
 * Na hora de gravar, `paraLinhas` devolve as DUAS tabelas com o mesmo VC — o
 * `DadosManometro` e os dois templates continuam exatamente como estavam. Este
 * módulo muda como se PREENCHE, nunca o que se imprime.
 */
export interface PontoCal {
  /** Valor convencional — a indicação no padrão. */
  vc: string;
  /** Leitura do instrumento subindo. */
  viC: string;
  /** Leitura do instrumento descendo. */
  viD: string;
}

export interface LinhaGravada {
  vc: string;
  vi: string;
  erro: string;
}

/** Linha vazia — o ponto ainda não existe. */
export function pontoVazio(): PontoCal {
  return { vc: '', viC: '', viD: '' };
}

/**
 * As duas tabelas gravadas viram a lista de pontos.
 *
 * O VC vem da tabela crescente e, faltando ali, da decrescente: registros
 * antigos podem ter preenchido só um dos lados, e perder o ponto porque ele
 * estava na tabela "errada" apagaria dado do usuário.
 */
export function paraPontos(
  crescente: { vc: string; vi: string }[],
  decrescente: { vc: string; vi: string }[],
): PontoCal[] {
  const total = Math.max(crescente.length, decrescente.length);
  const pontos: PontoCal[] = [];
  for (let i = 0; i < total; i++) {
    const c = crescente[i];
    const d = decrescente[i];
    pontos.push({
      vc: (c?.vc ?? '').trim() !== '' ? c.vc : (d?.vc ?? ''),
      viC: c?.vi ?? '',
      viD: d?.vi ?? '',
    });
  }
  return pontos;
}

/** A lista de pontos volta a ser as duas tabelas da folha, com o erro calculado. */
export function paraLinhas(pontos: PontoCal[]): {
  crescente: LinhaGravada[];
  decrescente: LinhaGravada[];
} {
  return {
    crescente: pontos.map((p) => ({ vc: p.vc, vi: p.viC, erro: calcularErro(p.vc, p.viC) })),
    decrescente: pontos.map((p) => ({ vc: p.vc, vi: p.viD, erro: calcularErro(p.vc, p.viD) })),
  };
}

/** Um ponto conta como preenchido quando tem valor e ao menos uma leitura. */
export function pontoCompleto(p: PontoCal): boolean {
  const preenchido = (v: string) => (v ?? '').trim() !== '';
  return preenchido(p.vc) && (preenchido(p.viC) || preenchido(p.viD));
}

/**
 * Quantos pontos já valem, para o resumo da tela.
 *
 * Um ponto com VC e nenhuma leitura NÃO conta: ele é a sugestão que veio do
 * cadastro do componente, não uma medição feita.
 */
export function resumoPontos(pontos: PontoCal[]): { feitos: number; total: number } {
  const comValor = pontos.filter((p) => (p.vc ?? '').trim() !== '');
  return { feitos: comValor.filter(pontoCompleto).length, total: comValor.length };
}

/** O maior erro absoluto entre os pontos medidos — `null` quando não há medição. */
export function maiorErro(pontos: PontoCal[]): string | null {
  let pior: number | null = null;
  for (const p of pontos) {
    for (const vi of [p.viC, p.viD]) {
      const e = calcularErro(p.vc, vi);
      if (e === '----') continue;
      const n = Math.abs(parseFloat(e.replace(',', '.')));
      if (!isNaN(n) && (pior === null || n > pior)) pior = n;
    }
  }
  return pior === null ? null : pior.toFixed(2).replace('.', ',');
}
