/**
 * MEDIÇÃO DE ESPESSURA DA CALDEIRA (22/10/2026).
 *
 * As regiões do relatório de referência, que a grade de vaso (tampo superior /
 * casco / tampo inferior) não tem:
 * - CORPO e FORNALHA: 4 pontos na seção (A topo, B direita, C baixo, D
 *   esquerda) × 4 linhas ao longo do comprimento;
 * - CHAMINÉ e PAREDE DA REVERSÃO: 4 linhas, uma leitura cada;
 * - ESPELHO DIANTEIRO e TRASEIRO: 10 linhas, uma leitura cada.
 *
 * Mora no MESMO ensaio de ultrassom do container, em `ultrassom.caldeira` — o
 * cabeçalho do ensaio (aparelho, acoplante, cabeçote, padrão) é o mesmo, e a
 * grade de vaso (`pontos`/`medidas`) continua intacta para quem já a usa.
 *
 * Formato: `{ corpo: { "A|1": "10,24", ... }, chamine: { "1": "6,12" } }` —
 * texto como foi digitado (vírgula decimal, vazio = não medido), o mesmo
 * princípio do resto do sistema.
 */
import { medidaNumero } from '../relatorios/pdfVetorial/destaqueMedida';

export type RegiaoCaldeira = 'corpo' | 'fornalha' | 'chamine' | 'reversao' | 'espelhoDianteiro' | 'espelhoTraseiro';

export interface DefRegiaoCaldeira {
  id: RegiaoCaldeira;
  titulo: string;
  /** Pontos na seção (A–D). Vazio = uma leitura por linha. */
  pontos: string[];
  linhas: string[];
}

const LINHAS_4 = ['1', '2', '3', '4'];
const LINHAS_10 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const REGIOES_CALDEIRA: DefRegiaoCaldeira[] = [
  { id: 'corpo', titulo: 'Corpo', pontos: ['A', 'B', 'C', 'D'], linhas: LINHAS_4 },
  { id: 'fornalha', titulo: 'Fornalha', pontos: ['A', 'B', 'C', 'D'], linhas: LINHAS_4 },
  { id: 'chamine', titulo: 'Chaminé', pontos: [], linhas: LINHAS_4 },
  { id: 'reversao', titulo: 'Parede da reversão', pontos: [], linhas: LINHAS_4 },
  { id: 'espelhoDianteiro', titulo: 'Espelho dianteiro', pontos: [], linhas: LINHAS_10 },
  { id: 'espelhoTraseiro', titulo: 'Espelho traseiro', pontos: [], linhas: LINHAS_10 },
];

export type MedicaoCaldeira = Partial<Record<RegiaoCaldeira, Record<string, string>>>;

/** A chave de uma célula: `A|1` com ponto, `1` sem. */
export function celula(ponto: string | null, linha: string): string {
  return ponto ? `${ponto}|${linha}` : linha;
}

export function valorCelula(m: MedicaoCaldeira | null | undefined, regiao: RegiaoCaldeira, ponto: string | null, linha: string): string {
  const v = m?.[regiao]?.[celula(ponto, linha)];
  return typeof v === 'string' ? v : '';
}

/** As leituras numéricas de uma região (só positivas — mesma regra da tabela de vaso). */
export function leiturasDaRegiao(m: MedicaoCaldeira | null | undefined, regiao: RegiaoCaldeira): number[] {
  const def = REGIOES_CALDEIRA.find((r) => r.id === regiao)!;
  const saida: number[] = [];
  for (const linha of def.linhas) {
    for (const ponto of def.pontos.length ? def.pontos : [null]) {
      const n = medidaNumero(valorCelula(m, regiao, ponto, linha));
      if (n !== null) saida.push(n);
    }
  }
  return saida;
}

export interface ExtremosRegiao {
  regiao: RegiaoCaldeira;
  titulo: string;
  minima: number | null;
  maxima: number | null;
  leituras: number;
}

export function extremosCaldeira(m: MedicaoCaldeira | null | undefined): ExtremosRegiao[] {
  return REGIOES_CALDEIRA.map((r) => {
    const v = leiturasDaRegiao(m, r.id);
    return {
      regiao: r.id,
      titulo: r.titulo,
      minima: v.length ? Math.min(...v) : null,
      maxima: v.length ? Math.max(...v) : null,
      leituras: v.length,
    };
  });
}

/** Há alguma leitura na grade de caldeira? */
export function temMedicaoCaldeira(m: MedicaoCaldeira | null | undefined): boolean {
  return REGIOES_CALDEIRA.some((r) => leiturasDaRegiao(m, r.id).length > 0);
}

/** A mínima medida da região, para a verificação do cálculo. */
export function minimaDaRegiao(m: MedicaoCaldeira | null | undefined, regiao: RegiaoCaldeira): number | null {
  const v = leiturasDaRegiao(m, regiao);
  return v.length ? Math.min(...v) : null;
}
