import { ler, salvar } from '../../services/storage';

/**
 * Fase 13C · as MEDIÇÕES DE ESPESSURA, fora do template.
 *
 * ## O que esta camada é
 *
 * A tradução exata do que `public/arquivos-inspecao/ULTRASSOM.html` faz quando o
 * inspetor digita numa célula da grade — só que sem o template. Mesmas chaves,
 * mesmos formatos, mesma regra do mínimo por região.
 *
 * Ela existe porque a grade de espessuras é **um dos dois** lugares do relatório
 * onde o que se digita numa folha realmente persiste (13A: 697 campos
 * editáveis, 5 pontos de escrita). Portar esses dois é o que permite a folha
 * deixar de ser superfície de edição.
 *
 * ## As duas chaves, e por que são duas
 *
 * | chave | conteúdo | quem lê |
 * |---|---|---|
 * | `nr13_med_grid_<TAG>` | a GRADE inteira: ângulos e valores digitados, por região | `PRONT-ULTRASSOM` e este editor |
 * | `nr13_med_esp_<TAG>` | só o **mínimo** de cada região (`sup`/`casco`/`inf`) | a caracterização e o `ULTRASSOM` do relatório |
 *
 * A segunda é derivada da primeira, e é gravada por MESCLAGEM: o objeto guarda
 * também os campos do ensaio (aparelho, acoplante, temperatura), que não são
 * desta tela e não podem ser perdidos ao salvar a grade.
 *
 * ## Nada de estrutura nova
 *
 * Os formatos são os do template, byte a byte — inclusive a vírgula decimal e a
 * string vazia para "não medido". Criar um formato próprio obrigaria a migrar
 * dado e a manter dois leitores; o objetivo da 13C é trocar a interface, não a
 * verdade.
 */

/** As três regiões da grade, na ordem em que a folha as imprime. */
export const REGIOES = ['ts', 'casco', 'ti'] as const;
export type Regiao = (typeof REGIOES)[number];

export interface PontoMedicao {
  id: string;
  rotulo: string;
  regiao: Regiao;
}

/** Um ponto por linha, um ângulo por coluna — o que a folha desenha. */
export interface GradeRegiao {
  angulos: string[];
  linhas: string[][];
}

export type GradeMedicoes = Record<Regiao, GradeRegiao>;

/** Os pontos que a folha usa quando o container de inspeção não define outros. */
export const PONTOS_PADRAO: PontoMedicao[] = [
  { id: 'ts', rotulo: 'Tampo Superior', regiao: 'ts' },
  { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
  { id: 'c2', rotulo: 'Casco 2', regiao: 'casco' },
  { id: 'c3', rotulo: 'Casco 3', regiao: 'casco' },
  { id: 'c4', rotulo: 'Casco 4', regiao: 'casco' },
  { id: 'ti', rotulo: 'Tampo Inferior', regiao: 'ti' },
];

const ORDEM: Record<Regiao, number> = { ts: 0, casco: 1, ti: 2 };

/** Ordena por região preservando a ordem interna — a mesma da folha. */
export function ordenarPontos(pontos: PontoMedicao[]): PontoMedicao[] {
  return pontos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (ORDEM[a.p.regiao] !== ORDEM[b.p.regiao] ? ORDEM[a.p.regiao] - ORDEM[b.p.regiao] : a.i - b.i))
    .map((x) => x.p);
}

/**
 * Os ângulos de uma região a partir do número de colunas.
 *
 * `n` colunas viram `n` ângulos igualmente espaçados em 360° — é a fórmula do
 * template (`Math.round(i * 360 / n)`), e mudá-la mudaria o cabeçalho da grade
 * de todo relatório já emitido que for reaberto.
 */
export function angulosDaRegiao(colunas: number): string[] {
  const n = colunas >= 1 && colunas <= 12 ? Math.round(colunas) : 4;
  return Array.from({ length: n }, (_, i) => String(Math.round((i * 360) / n)));
}

/** Número de colunas por região, com o mesmo saneamento do template. */
export function colunasDoContainer(dados: unknown): Record<Regiao, number> {
  const c = ((dados as { colunas?: Record<string, unknown> } | null)?.colunas ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 4;
  };
  return { ts: num(c.ts), casco: num(c.casco), ti: num(c.ti) };
}

/** Os pontos do container de inspeção, ou os padrão. Mesma validação da folha. */
export function pontosDoContainer(dados: unknown): PontoMedicao[] {
  const lista = (dados as { pontos?: unknown[] } | null)?.pontos;
  if (!Array.isArray(lista) || lista.length === 0) return PONTOS_PADRAO.slice();
  const vistos = new Set<string>();
  const validos: PontoMedicao[] = [];
  for (const bruto of lista) {
    const p = bruto as { id?: unknown; rotulo?: unknown; regiao?: unknown };
    const id = p?.id ? String(p.id) : '';
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const reg = REGIOES.includes(p.regiao as Regiao) ? (p.regiao as Regiao) : 'casco';
    validos.push({ id, rotulo: p.rotulo ? String(p.rotulo) : id, regiao: reg });
  }
  return validos.length > 0 ? ordenarPontos(validos) : PONTOS_PADRAO.slice();
}

/** O número, a partir do texto digitado. `"6,35"` e `"6.35"` valem; o resto, não. */
export function numeroDaCelula(v: string | null | undefined): number | null {
  const n = Number.parseFloat(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** O menor valor de uma região, no formato que a folha grava (vírgula, ou vazio). */
export function minimoDaRegiao(grade: GradeRegiao | undefined): string {
  let min = Number.POSITIVE_INFINITY;
  for (const linha of grade?.linhas ?? []) {
    for (const cel of linha) {
      const n = numeroDaCelula(cel);
      if (n !== null && n < min) min = n;
    }
  }
  return min === Number.POSITIVE_INFINITY ? '' : String(min).replace('.', ',');
}

/**
 * Monta a grade a partir do que existe hoje.
 *
 * Ordem das fontes, e cada uma tem um motivo:
 * 1. `nr13_med_grid_<TAG>` — a correção digitada DENTRO daquele documento;
 * 2. `nr13_injecao_atual.ultrassom.medidas` — o que veio do container de campo;
 * 3. vazio.
 *
 * A forma da grade (pontos e ângulos) vem SEMPRE do container, não do que está
 * gravado: se o inspetor acrescentou um ponto na inspeção, a linha nova precisa
 * aparecer, e o valor antigo dos outros pontos precisa continuar no lugar.
 *
 * ## O DONO DA GRADE (10/09/2026)
 *
 * `nr13_med_grid_<TAG>` é uma chave por EQUIPAMENTO, não por inspeção. Sem
 * saber de qual container ela veio, a grade de uma inspeção antiga sobrepunha
 * as medições do container escolhido agora — e o laudo saía com espessuras de
 * OUTRA inspeção.
 *
 * Medido em produção: container "Inspeção da IA" com 24 medições
 * (9,41 · 9,38 · 9,45 …) e o PDF arquivado imprimindo 6.32 · 6.23 · 6.11, de
 * uma rodada anterior do mesmo vaso. Número errado num documento assinado é
 * pior do que campo vazio: ninguém desconfia de um número.
 *
 * Agora a grade guarda `containerId`. Ela só prevalece sobre o container
 * quando é DELE — a correção manual dentro do documento continua vencendo, e a
 * grade de outra inspeção deixa de existir para este.
 *
 * Grade LEGADA (sem `containerId`) perde para um container que tenha medida
 * naquela célula: ela pode ser de qualquer inspeção, e dado de campo
 * identificado vale mais do que dado órfão. Onde o container não tem nada, ela
 * continua valendo — é o caso de quem digitou tudo à mão antes desta data.
 */
export function montarGrade(
  pontos: PontoMedicao[],
  colunas: Record<Regiao, number>,
  gradeSalva: (Partial<GradeMedicoes> & { containerId?: string | null }) | null,
  medidasDoContainer: Record<string, Record<string, unknown>> | null,
  containerAtual: string | null = null,
): GradeMedicoes {
  // A grade só manda se for do container que está em uso. Sem dono declarado
  // (legado), ela cede a célula que o container souber preencher.
  const donoConfere = gradeSalva?.containerId != null && gradeSalva.containerId === containerAtual;
  const gradeOrfa = gradeSalva?.containerId == null;
  const gradeVale = donoConfere || gradeOrfa;
  const saida = {} as GradeMedicoes;
  for (const regiao of REGIOES) {
    const angulos = angulosDaRegiao(colunas[regiao]);
    const daRegiao = pontos.filter((p) => p.regiao === regiao);
    const salva = gradeSalva?.[regiao];
    const linhas = daRegiao.map((ponto, i) => {
      const anterior = gradeVale ? (salva?.linhas?.[i] ?? []) : [];
      const doContainer = medidasDoContainer?.[ponto.id] ?? {};
      return angulos.map((ang, j) => {
        const doCampo = doContainer[ang];
        const temCampo = doCampo !== undefined && doCampo !== null && String(doCampo).trim() !== '';
        // A grade salva é posicional; o container é por ângulo. Quando as duas
        // existem, a digitada vence — MAS só se for daquele container. Grade
        // órfã perde para o dado de campo identificado.
        const gravado = anterior[j];
        const gravadoVale =
          gravado !== undefined && String(gravado).trim() !== '' && (donoConfere || !temCampo);
        if (gravadoVale) return String(gravado);
        return temCampo ? String(doCampo).replace('.', ',') : '';
      });
    });
    saida[regiao] = { angulos, linhas };
  }
  return saida;
}

/** As chaves da TAG. */
export const chaveGrade = (tag: string) => `nr13_med_grid_${tag}`;
export const chaveEspessuras = (tag: string) => `nr13_med_esp_${tag}`;

/**
 * O que vai para `nr13_med_esp_`: o registro que já existe, com os três mínimos
 * atualizados. **Mesclagem**, nunca substituição — `aparelho`, `acoplante`,
 * `tempSup` e companhia são do ensaio, não desta grade, e sumiriam.
 */
export function espessurasMinimas(
  atual: Record<string, unknown> | null,
  grade: GradeMedicoes,
): Record<string, unknown> {
  return {
    ...(atual ?? {}),
    sup: minimoDaRegiao(grade.ts),
    casco: minimoDaRegiao(grade.casco),
    inf: minimoDaRegiao(grade.ti),
  };
}

/** Lê tudo o que o editor precisa para abrir. */
export function carregarMedicoes(
  tag: string,
  /** O container deste documento — ver "O DONO DA GRADE" em `montarGrade`. */
  containerAtual: string | null = null,
): {
  pontos: PontoMedicao[];
  colunas: Record<Regiao, number>;
  grade: GradeMedicoes;
} {
  const injecao = ler<{ ultrassom?: Record<string, unknown> }>('nr13_injecao_atual');
  const us = injecao?.ultrassom ?? null;
  const pontos = pontosDoContainer(us);
  const colunas = colunasDoContainer(us);
  const grade = montarGrade(
    pontos,
    colunas,
    ler<Partial<GradeMedicoes> & { containerId?: string | null }>(chaveGrade(tag)),
    (us?.medidas as Record<string, Record<string, unknown>>) ?? null,
    containerAtual,
  );
  return { pontos, colunas, grade };
}

/**
 * Grava a grade e os mínimos — pelo caminho oficial (`salvar`), com fila, RPC e
 * versionamento. Nada de `localStorage` direto: é o que garante que a edição
 * sobreviva ao offline e que um conflito vire conflito, e não sobrescrita
 * silenciosa.
 */
export async function salvarMedicoes(
  tag: string,
  grade: GradeMedicoes,
  /** Carimba o DONO: sem ele a grade volta a poder contaminar outra inspeção. */
  containerAtual: string | null = null,
): Promise<void> {
  await salvar(chaveGrade(tag), { ...grade, containerId: containerAtual });
  await salvar(chaveEspessuras(tag), espessurasMinimas(ler<Record<string, unknown>>(chaveEspessuras(tag)), grade));
}
