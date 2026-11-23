/**
 * CLASSIFICAÇÃO DA CALDEIRA NA FICHA — volume → espessura → classificação
 * (23/11/2026, fluxo pedido pelo engenheiro parceiro, "linha de montagem").
 *
 * NR-13 vigente (Portarias MTP 1.846/2022 e 4.219/2022):
 * - 13.2.1 a) a NR se aplica a caldeiras com pressão de operação SUPERIOR a
 *   60 kPa (0,61 kgf/cm²);
 * - 13.2.2 k) a NR NÃO se aplica a caldeiras com volume INFERIOR a 100 L;
 * - 13.4.1.1 categoria A = pressão de operação IGUAL OU SUPERIOR a 1.960 kPa
 *   (19,98 kgf/cm²); B = superior a 60 kPa e inferior a 1.960 kPa.
 *
 * PRESSÃO DE CLASSIFICAÇÃO = ESCOLHA DO USUÁRIO (engenheiro parceiro, PLH,
 * 23/11/2026: "a norma pede a PMO, porém o sistema não pode restringir — o
 * usuário adota qual valor usar"). `nr13_info_<TAG>.pressaoClassificacao`:
 * 'pmo' (padrão, a norma) ou 'pmta' (adotada ?? calculada no memorial).
 *
 * O volume NÃO muda a categoria — decide se a norma se aplica. Por isso ele vem
 * primeiro. A categoria em si é a de `categoriaCaldeira` (a mesma função que o
 * PDF usa): uma regra só, nenhuma cópia.
 *
 * Nada aqui é gravado como categoria: a classificação é DERIVADA na hora, da
 * PMO adotada e do volume. A `nr13_cat_<TAG>` antiga (método de vaso, I–V) não
 * é apagada nem lida para caldeira.
 *
 * O volume mora na própria ficha da caldeira (`nr13_ficha_caldeira_<TAG>`,
 * grupo `volume`) — nenhuma família de chave nova. Texto como digitado.
 */
import { FATORES_CONVERSAO } from '../../calc/unidades';
import { categoriaCaldeira, type CategoriaCaldeira } from './categoriaCaldeira';
import { valorCaldeira, type DadosCaldeira } from './dadosCaldeira';

export type TipoTampoCaldeira = 'plano' | 'eliptico' | 'torisferico' | 'hemisferico';

export const TIPOS_TAMPO_CALDEIRA: { valor: TipoTampoCaldeira; rotulo: string }[] = [
  { valor: 'plano', rotulo: 'Plano / espelho' },
  { valor: 'eliptico', rotulo: 'Elíptico 2:1' },
  { valor: 'torisferico', rotulo: 'Torisférico' },
  { valor: 'hemisferico', rotulo: 'Hemisférico' },
];

/** Limites da NR-13 para caldeira. */
export const VOLUME_MINIMO_L = 100;
export const PRESSAO_MINIMA_KPA = 60;
export const LIMITE_A_KPA = 1960;

/** kgf/cm² por MPa — a constante oficial mora em `calc/unidades`. */
export const KGF_POR_MPA = FATORES_CONVERSAO.TECNICO.mult;

/** "1.234,5" / "1234.5" / "" → número ou null. Só positivos contam. */
export function numeroBr(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface VolumeParte {
  /** Volume em m³ (null = não dá para calcular nem foi informado). */
  m3: number | null;
  /** De onde veio o número. */
  fonte: 'calculado' | 'informado' | null;
}

export interface VolumeCaldeira {
  corpo: VolumeParte;
  tampo1: VolumeParte;
  tampo2: VolumeParte;
  /**
   * DESCONTOS (23/11/2026, engenheiro: "o volume desconta os tubos"): o espaço
   * que os tubos de gases e a fornalha ocupam dentro do casco não é água. m³
   * POSITIVO, subtraído da soma.
   */
  tubos: VolumeParte;
  fornalha: VolumeParte;
  /** Soma das partes, ou o total informado (que vence quando preenchido). */
  totalM3: number | null;
  fonteTotal: 'soma' | 'informado' | null;
}

const MM3_POR_M3 = 1e9;

function volumeTampoMm3(tipo: string, d: number): number {
  switch (tipo) {
    case 'eliptico':
      return (Math.PI * d ** 3) / 24;
    case 'torisferico':
      return 0.0847 * d ** 3;
    case 'hemisferico':
      return (Math.PI * d ** 3) / 12;
    default:
      return 0;
  }
}

function parteInformada(litros: string): VolumeParte | null {
  const l = numeroBr(litros);
  return l === null ? null : { m3: l / 1000, fonte: 'informado' };
}

/** "2\"" / "2 pol" → 50,8 mm; "50,8" → 50,8 (mm). */
export function mmOuPolegada(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const pol = /("|”|pol|in)\s*$/i.test(s);
  const n = numeroBr(s.replace(/("|”|pol|in)\s*$/i, '').trim());
  return n === null ? null : pol ? n * 25.4 : n;
}

/** Os campos do grupo `volume` da ficha. */
export const CAMPOS_VOLUME = {
  corpoDiametro: 'volume.corpoDiametro',
  corpoComprimento: 'volume.corpoComprimento',
  corpoLitros: 'volume.corpoLitros',
  tampo1Tipo: 'volume.tampo1Tipo',
  tampo1Diametro: 'volume.tampo1Diametro',
  tampo1Litros: 'volume.tampo1Litros',
  tampo2Tipo: 'volume.tampo2Tipo',
  tampo2Diametro: 'volume.tampo2Diametro',
  tampo2Litros: 'volume.tampo2Litros',
  totalLitros: 'volume.totalLitros',
  tubosQuantidade: 'volume.tubosQuantidade',
  tubosDiametroExterno: 'volume.tubosDiametroExterno',
  tubosComprimento: 'volume.tubosComprimento',
  fornalhaDiametroExterno: 'volume.fornalhaDiametroExterno',
  fornalhaComprimento: 'volume.fornalhaComprimento',
} as const;

/**
 * Volume pelas partes do esboço do engenheiro: CORPO (cilindro π·D²/4·L) +
 * TAMPO 1 + TAMPO 2 (as extremidades — fórmulas do modelador de vaso: elíptico π·D³/24,
 * torisférico 0,0847·D³, hemisférico π·D³/12, plano 0). Diâmetros e
 * comprimento em mm, INTERNOS. Cada parte aceita o volume em litros digitado
 * direto (placa, manual do fabricante), que vence o cálculo dela; o TOTAL
 * informado vence a soma. A soma DESCONTA os tubos de gases e, se informada, a
 * fornalha (engenheiro, 23/11/2026: "o volume desconta os tubos").
 */
export function volumeCaldeira(d: DadosCaldeira | null | undefined): VolumeCaldeira {
  const v = (c: string) => valorCaldeira(d, c);

  const corpoD = numeroBr(v(CAMPOS_VOLUME.corpoDiametro));
  const corpoL = numeroBr(v(CAMPOS_VOLUME.corpoComprimento));
  const corpo: VolumeParte =
    parteInformada(v(CAMPOS_VOLUME.corpoLitros)) ??
    (corpoD !== null && corpoL !== null
      ? { m3: (Math.PI * corpoD ** 2 * corpoL) / 4 / MM3_POR_M3, fonte: 'calculado' }
      : { m3: null, fonte: null });

  const tampo = (tipoC: string, diamC: string, litrosC: string): VolumeParte => {
    const inf = parteInformada(v(litrosC));
    if (inf) return inf;
    const tipo = v(tipoC);
    if (!tipo) return { m3: null, fonte: null };
    if (tipo === 'plano') return { m3: 0, fonte: 'calculado' };
    const dd = numeroBr(v(diamC));
    return dd === null ? { m3: null, fonte: null } : { m3: volumeTampoMm3(tipo, dd) / MM3_POR_M3, fonte: 'calculado' };
  };
  const tampo1 = tampo(CAMPOS_VOLUME.tampo1Tipo, CAMPOS_VOLUME.tampo1Diametro, CAMPOS_VOLUME.tampo1Litros);
  const tampo2 = tampo(CAMPOS_VOLUME.tampo2Tipo, CAMPOS_VOLUME.tampo2Diametro, CAMPOS_VOLUME.tampo2Litros);

  // Tubos: quantidade × π·d²/4 × comprimento (d = Ø EXTERNO — o tubo inteiro
  // tira água do casco). Comprimento vazio = o do corpo.
  const cilindro = (d: number | null, l: number | null): number | null =>
    d !== null && l !== null ? (Math.PI * d ** 2 * l) / 4 / MM3_POR_M3 : null;
  // Campo vazio = o dado da própria ficha da caldeira (quantidade e Ø dos tubos,
  // Ø da fornalha) — a fornalha ENTRA SEMPRE (engenheiro, 23/11/2026).
  const qtd = numeroBr(v(CAMPOS_VOLUME.tubosQuantidade)) ?? numeroBr(v('tubos.quantidade'));
  const umTubo = cilindro(
    numeroBr(v(CAMPOS_VOLUME.tubosDiametroExterno)) ?? mmOuPolegada(v('tubos.diametro')),
    numeroBr(v(CAMPOS_VOLUME.tubosComprimento)) ?? corpoL,
  );
  const tubos: VolumeParte = qtd !== null && umTubo !== null ? { m3: qtd * umTubo, fonte: 'calculado' } : { m3: null, fonte: null };
  const forn = cilindro(
    numeroBr(v(CAMPOS_VOLUME.fornalhaDiametroExterno)) ?? numeroBr(v('fornalha.diametro')),
    numeroBr(v(CAMPOS_VOLUME.fornalhaComprimento)) ?? corpoL,
  );
  const fornalha: VolumeParte = forn !== null ? { m3: forn, fonte: 'calculado' } : { m3: null, fonte: null };

  const totalInf = numeroBr(v(CAMPOS_VOLUME.totalLitros));
  if (totalInf !== null) return { corpo, tampo1, tampo2, tubos, fornalha, totalM3: totalInf / 1000, fonteTotal: 'informado' };

  // A soma só existe se o corpo existir; tampo sem dado conta como "falta".
  if (corpo.m3 === null) return { corpo, tampo1, tampo2, tubos, fornalha, totalM3: null, fonteTotal: null };
  const soma = [corpo, tampo1, tampo2].reduce((s, p) => s + (p.m3 ?? 0), 0) - (tubos.m3 ?? 0) - (fornalha.m3 ?? 0);
  // Desconto maior que o casco = dado errado: não inventa volume negativo.
  return { corpo, tampo1, tampo2, tubos, fornalha, totalM3: soma > 0 ? soma : null, fonteTotal: soma > 0 ? 'soma' : null };
}

export type SituacaoNr13 = 'aplica' | 'fora-pressao' | 'fora-volume' | 'indefinida';

/** Qual pressão classifica: PMO (a norma, 13.4.1.1) ou PMTA (adotada pelo PLH). */
export type BasePressao = 'pmo' | 'pmta';
export const ROTULO_BASE: Record<BasePressao, string> = { pmo: 'PMO', pmta: 'PMTA' };

export interface ClassificacaoCaldeira {
  /** A pressão usada (MPa / kPa / kgf/cm²) e qual ela é. */
  base: BasePressao;
  pressaoMpa: number | null;
  pressaoKpa: number | null;
  pressaoKgf: number | null;
  volumeL: number | null;
  situacao: SituacaoNr13;
  /** null quando falta a pressão ou a NR-13 não se aplica. */
  categoria: Exclude<CategoriaCaldeira, 'FORA'> | null;
  /** Item da norma que decidiu — vai escrito ao lado do resultado. */
  item: string;
  /** Frase pronta para a tela. */
  explicacao: string;
  /**
   * "Equipamento não categorizado pela NR-13, pois …" — só quando a norma não
   * se aplica (fora por pressão ou por volume). Vai em vermelho na ficha e no
   * relatório.
   */
  naoCategorizado: string | null;
  /** O que falta para concluir (vazio = nada). */
  faltas: string[];
}

export interface PressoesDaFicha {
  pmoAdotadaMpa?: string | null;
  pmtaAdotadaMpa?: string | null;
  pressaoClassificacao?: BasePressao | string | null;
}

const numMpa = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * A pressão de classificação escolhida na ficha. PMO = a adotada (não existe PMO
 * calculada); PMTA = adotada ?? calculada no memorial. Sem escolha = PMO (norma).
 */
export function pressaoDeClassificacao(
  info: PressoesDaFicha | null | undefined,
  pmtaCalculadaMpa?: string | number | null,
): { base: BasePressao; mpa: number | null } {
  const base: BasePressao = info?.pressaoClassificacao === 'pmta' ? 'pmta' : 'pmo';
  if (base === 'pmo') return { base, mpa: numMpa(info?.pmoAdotadaMpa) };
  return { base, mpa: numMpa(info?.pmtaAdotadaMpa) ?? numMpa(pmtaCalculadaMpa) };
}

/** A classificação a partir do que a ficha guarda: volume da ficha da caldeira + a pressão escolhida. */
export function classificacaoDaFicha(
  dados: DadosCaldeira | null | undefined,
  info: PressoesDaFicha | null | undefined,
  pmtaCalculadaMpa?: string | number | null,
): { volume: VolumeCaldeira; classificacao: ClassificacaoCaldeira } {
  const volume = volumeCaldeira(dados);
  const p = pressaoDeClassificacao(info, pmtaCalculadaMpa);
  return { volume, classificacao: classificarCaldeira(p.mpa, volume.totalM3, p.base) };
}

/** O texto curto da categoria para cartão/resumo: "A", "B", "Não categorizado" ou "—". */
export function rotuloCurtoCategoria(c: ClassificacaoCaldeira): string {
  if (c.categoria) return c.categoria;
  if (c.situacao === 'fora-pressao' || c.situacao === 'fora-volume') return 'Não categorizado';
  return '—';
}

const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * A classificação. Ordem do engenheiro: volume, depois pressão.
 * - volume conhecido e < 100 L → fora da NR-13 (13.2.2 k) — AVISA, não bloqueia;
 * - pressão ≤ 60 kPa → fora da NR-13 (13.2.1 a);
 * - senão A ou B pela pressão (13.4.1.1). Volume desconhecido NÃO impede a
 *   categoria (ela é só pela pressão) — vira uma falta declarada.
 */
export function classificarCaldeira(
  pressaoMpa: number | null,
  volumeM3: number | null,
  base: BasePressao = 'pmo',
): ClassificacaoCaldeira {
  const p = pressaoMpa !== null && Number.isFinite(pressaoMpa) && pressaoMpa > 0 ? pressaoMpa : null;
  const volumeL = volumeM3 !== null && Number.isFinite(volumeM3) && volumeM3 > 0 ? volumeM3 * 1000 : null;
  const rot = ROTULO_BASE[base];
  const comum = {
    base,
    pressaoMpa: p,
    pressaoKpa: p === null ? null : p * 1000,
    pressaoKgf: p === null ? null : p * KGF_POR_MPA,
    volumeL,
  };
  const faltas: string[] = [];
  if (volumeL === null) faltas.push('Volume interno da caldeira');
  if (p === null) {
    faltas.push(
      base === 'pmo'
        ? 'PMO adotada (em "Pressões da Documentação")'
        : 'PMTA (adotada em "Pressões da Documentação" ou calculada no memorial)',
    );
  }

  if (volumeL !== null && volumeL < VOLUME_MINIMO_L) {
    return {
      ...comum,
      situacao: 'fora-volume',
      categoria: null,
      item: 'NR-13 13.2.2 k)',
      explicacao: `Volume de ${fmt(volumeL)} L, inferior a 100 L: a NR-13 não se aplica a esta caldeira.`,
      naoCategorizado: `Equipamento não categorizado pela NR-13, pois o volume interno da caldeira (${fmt(volumeL)} L) é inferior a 100 L (NR-13, item 13.2.2 k).`,
      faltas: [],
    };
  }
  if (p === null) {
    return { ...comum, situacao: 'indefinida', categoria: null, item: 'NR-13 13.4.1.1', explicacao: `Informe a ${rot} para classificar.`, naoCategorizado: null, faltas };
  }
  const cat = categoriaCaldeira(p);
  if (cat === 'FORA' || cat === null) {
    return {
      ...comum,
      situacao: 'fora-pressao',
      categoria: null,
      item: 'NR-13 13.2.1 a)',
      explicacao: `${rot} de ${fmt(p * 1000, 0)} kPa, não superior a 60 kPa (0,61 kgf/cm²): a NR-13 não se aplica.`,
      naoCategorizado: `Equipamento não categorizado pela NR-13, pois a ${rot} (${fmt(p * KGF_POR_MPA)} kgf/cm² · ${fmt(p * 1000, 0)} kPa) não é superior a 60 kPa (0,61 kgf/cm²) (NR-13, item 13.2.1 a).`,
      faltas: [],
    };
  }
  const kgf = fmt(p * KGF_POR_MPA);
  const explicacao =
    cat === 'A'
      ? `${rot} de ${kgf} kgf/cm², igual ou superior a 19,98 kgf/cm² (1.960 kPa): categoria A.`
      : `${rot} de ${kgf} kgf/cm², acima de 0,61 e abaixo de 19,98 kgf/cm²: categoria B.`;
  return { ...comum, situacao: 'aplica', categoria: cat, item: 'NR-13 13.4.1.1', explicacao, naoCategorizado: null, faltas };
}
