import { listarContainers } from '../inspecoes/inspecaoService';
import type { ContainerInspecao } from '../inspecoes/tipos';
import { carregarProntuario } from './prontuarioService';

/**
 * Fase 6.1 (24/09/2026) · a MEDIÇÃO DE ESPESSURA do prontuário, entregue ao
 * gerador — nunca gravada nas chaves do equipamento.
 *
 * ## O defeito que isto encerra (P0)
 *
 * `Prontuarios.tsx` tinha `aplicarEnsaioEspessura(tag, container)`, chamada ao
 * ABRIR o prontuário e ao trocar o container no formulário. Ela montava a grade
 * do container escolhido e a gravava pelo `salvar` — sincronizado — em
 * `nr13_med_grid_<TAG>` e `nr13_med_esp_<TAG>`, as chaves que as folhas do
 * prontuário liam. Sem container escolhido, gravava as duas VAZIAS.
 *
 * Essas chaves não são do prontuário. São do editor de medições do RELATÓRIO
 * (`medicoesEspessura.salvarMedicoes`, com `containerId` de dono) e da folha
 * `ULTRASSOM.html`: a correção digitada, a espessura requerida manual e o
 * aparelho. Abrir `/prontuarios?tag=X` apagava tudo isso no servidor
 * (reproduzido no lab: v14 → v15, requerida manual 7,77 perdida).
 *
 * ## A regra agora
 *
 * A fonte da espessura do prontuário é o CONTAINER escolhido no formulário do
 * prontuário (`ProntuarioDados.containerEnsaioId`) — é o que o seletor "puxar
 * do container de inspeção" sempre disse. Sem container: seção vazia, como
 * já saía. O conteúdo é EXATAMENTE o que a função antiga gravava (mesma grade,
 * mesmos mínimos, mesmos campos do ensaio), só que entregue ao gerador em vez
 * de escrito em chave viva.
 */

type MedidasUS = Record<string, Record<string, string>>;
type RegiaoUS = 'ts' | 'casco' | 'ti';

export interface GradeProntuario {
  ts: { angulos: string[]; linhas: string[][] };
  casco: { angulos: string[]; linhas: string[][] };
  ti: { angulos: string[]; linhas: string[][] };
}

/** O que a folha de ultrassom do prontuário precisa: a grade e o "med_esp" do ensaio. */
export interface EspessuraProntuario {
  grade: GradeProntuario;
  medEsp: Record<string, unknown>;
}

// Ângulos por região (colunas distribuídas em 360°). Espelho de angulosDe do
// FormularioUltrassom; container antigo sem `colunas` cai nos 4 ângulos históricos.
function angulosUS(n: unknown): string[] {
  const qtd = Math.min(12, Math.max(1, Math.round(Number(n)) || 4));
  return Array.from({ length: qtd }, (_, i) => String(Math.round((i * 360) / qtd)));
}

// Ponto de medição como salvo pelo FormularioUltrassom (PontoME). Normalização replicada de lá
// (normalizarPontos não é exportado): região fora de 'ts'/'ti' cai no casco, ids duplicados/vazios
// são descartados.
const PONTOS_FIXOS_US: { id: string; regiao: RegiaoUS }[] = [
  { id: 'ts', regiao: 'ts' },
  { id: 'c1', regiao: 'casco' },
  { id: 'c2', regiao: 'casco' },
  { id: 'c3', regiao: 'casco' },
  { id: 'c4', regiao: 'casco' },
  { id: 'ti', regiao: 'ti' },
];

function normalizarPontosUS(bruto: unknown): { id: string; regiao: RegiaoUS }[] {
  if (!Array.isArray(bruto)) return [];
  const validos: { id: string; regiao: RegiaoUS }[] = [];
  const vistos = new Set<string>();
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue;
    const p = item as { id?: unknown; regiao?: unknown };
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    validos.push({ id, regiao: p.regiao === 'ts' || p.regiao === 'ti' ? p.regiao : 'casco' });
  }
  return validos;
}

function construirGridMinima(medidas: MedidasUS | undefined, pontos?: unknown, colunas?: unknown) {
  const med = medidas ?? {};
  const cols = (colunas ?? {}) as Partial<Record<RegiaoUS, unknown>>;
  // Shape lido por PRONT-ULTRASSOM.html: { <regiao>: { angulos: string[], linhas: string[][] } }
  // (formato antigo — array puro de linhas com 4 ângulos — segue aceito na LEITURA lá).
  const angPorRegiao: Record<RegiaoUS, string[]> = {
    ts: angulosUS(cols.ts),
    casco: angulosUS(cols.casco),
    ti: angulosUS(cols.ti),
  };
  const linha = (id: string, regiao: RegiaoUS) => angPorRegiao[regiao].map((a) => med[id]?.[a] ?? '');
  // Container sem lista de pontos (dado antigo) => os 6 ids históricos.
  const lista = normalizarPontosUS(pontos);
  const efetivos = lista.length ? lista : PONTOS_FIXOS_US;
  const grid: GradeProntuario = {
    ts: { angulos: angPorRegiao.ts, linhas: [] },
    casco: { angulos: angPorRegiao.casco, linhas: [] },
    ti: { angulos: angPorRegiao.ti, linhas: [] },
  };
  for (const p of efetivos) grid[p.regiao].linhas.push(linha(p.id, p.regiao));
  const minOf = (rows: string[][]) => {
    let m = Infinity;
    rows.forEach((r) =>
      r.forEach((v) => {
        const n = parseFloat(String(v).replace(',', '.'));
        if (Number.isFinite(n) && n > 0 && n < m) m = n;
      }),
    );
    return m === Infinity ? '' : String(m).replace('.', ',');
  };
  const minima = { sup: minOf(grid.ts.linhas), casco: minOf(grid.casco.linhas), inf: minOf(grid.ti.linhas) };
  return { grid, minima };
}

interface DadosUltrassomContainer {
  medidas?: MedidasUS;
  pontos?: unknown;
  colunas?: unknown;
  aparelho?: string;
  acoplante?: string;
  tempSup?: string;
  estadoSup?: string;
  cabecote?: string;
  velSonica?: string;
}

/**
 * A espessura que o prontuário mostra para aquele container — ou a seção vazia,
 * sem container. Função PURA: não lê nem grava storage.
 */
export function espessuraDoContainer(container: ContainerInspecao | null): EspessuraProntuario {
  const us = (container?.dados?.ultrassom as DadosUltrassomContainer | undefined) ?? undefined;
  const { grid, minima } = construirGridMinima(us?.medidas, us?.pontos, us?.colunas);
  return {
    grade: grid,
    // Além dos mínimos (sup/casco/inf), os campos de "Informações para o Ensaio"
    // preenchidos no FormularioUltrassom.
    medEsp: {
      ...minima,
      aparelho: us?.aparelho ?? '',
      acoplante: us?.acoplante ?? '',
      tempSup: us?.tempSup ?? '',
      estadoSup: us?.estadoSup ?? '',
      cabecote: us?.cabecote ?? '',
      velSonica: us?.velSonica ?? '',
    },
  };
}

/** O container com esse id entre os da TAG, ou `null`. Só leitura. */
export function containerDoEnsaio(tag: string, containerEnsaioId: string | null | undefined): ContainerInspecao | null {
  if (!containerEnsaioId) return null;
  return listarContainers(tag).find((c) => c.id === containerEnsaioId) ?? null;
}

/**
 * A espessura do prontuário SALVO da TAG — para quem gera sem a tela na frente
 * (o piloto). A tela entrega a escolha que está no formulário, salva ou não.
 */
export function espessuraDoProntuarioSalvo(tag: string): EspessuraProntuario {
  return espessuraDoContainer(containerDoEnsaio(tag, carregarProntuario(tag)?.containerEnsaioId));
}

/**
 * As mesmas duas chaves, no formato que `PRONT-ULTRASSOM.html` lê — para o
 * caminho de ROLLBACK em iframe. Vão ao PALCO (cópia temporária no
 * `localStorage`, restaurada ao fechar), nunca ao `salvar`.
 */
export function itensDoPalcoDaEspessura(tag: string, e: EspessuraProntuario): { chave: string; valor: string }[] {
  return [
    { chave: `nr13_med_grid_${tag}`, valor: JSON.stringify(e.grade) },
    { chave: `nr13_med_esp_${tag}`, valor: JSON.stringify(e.medEsp) },
  ];
}
