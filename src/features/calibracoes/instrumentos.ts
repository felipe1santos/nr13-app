/**
 * Revisão do engenheiro, fase 2 (D) · OS INSTRUMENTOS que o relatório prevê.
 *
 * O quadro 7.1.1 do relatório lista seis dispositivos (manômetro, termômetro,
 * vacuômetro, pressostato, transmissor de pressão e PSV), e o módulo de
 * calibrações só conhecia dois — `'manometro' | 'psv'`. Esta tabela é a fonte
 * única do que cada um é:
 *
 * | campo | o que decide |
 * |---|---|
 * | `grandeza` | quais UNIDADES o instrumento aceita (pressão ≠ temperatura) |
 * | `modeloInterno` | se existe folha NOSSA de certificado para ele — manômetro, PSV, pressostato, termostato e malha de pressão |
 * | `checklist` | a linha do quadro 7.1.1 (ids do formulário de checklist) |
 *
 * O que é COMUM a todos mora em `DadosCalibracaoBase` (`tipos.ts`): nº de
 * certificado, datas, fabricante, modelo, série, faixa, unidade, conclusão. O
 * que é ESPECÍFICO é só o resultado da medição — pontos crescente/decrescente
 * do manômetro, pressões de abertura/fechamento da PSV — e existe apenas onde
 * há folha interna que o imprima.
 *
 * Instrumento sem `modeloInterno` NÃO ganha certificado nosso inventado: a
 * calibração dele é registrada como de TERCEIRO (laboratório externo), com o
 * PDF original anexado. Criar folha interna para termômetro, vacuômetro ou
 * vacuômetro é trabalho futuro — ver PENDENCIAS.md. (O pressostato ganhou a
 * sua em 23/11/2026; o termostato e a malha de pressão/transmissor, em
 * 24/11/2026.)
 */
export type TipoInstrumento =
  | 'manometro'
  | 'psv'
  | 'termometro'
  | 'vacuometro'
  | 'pressostato'
  | 'transmissor'
  | 'termostato';

export type Grandeza = 'pressao' | 'temperatura';

/**
 * Os modelos de certificado INTERNO. 23/11/2026 · o pressostato ganhou o seu
 * (set point + dois ensaios de desarme/rearme + inspeção visual), emitido pelo
 * gerador vetorial como os outros dois.
 */
export type ModeloInterno = 'manometro' | 'psv' | 'pressostato' | 'termostato' | 'transmissor';

/**
 * 24/11/2026 · as duas FAMÍLIAS de certificado interno que se repetem:
 *
 * - CHAVEAMENTO (pressostato, termostato): set point, ensaios de desarme/rearme,
 *   inspeção visual, Range/Diferencial e o bloco metrológico. O termostato é "o
 *   pressostato de temperatura" (pedido do engenheiro parceiro).
 * - MEDIÇÃO POR PONTOS (manômetro, malha de pressão/transmissor): valor
 *   convencional × valor indicado, crescente e decrescente, erro, incerteza e k.
 */
export type ModeloChaveamento = 'pressostato' | 'termostato';
export type ModeloPontos = 'manometro' | 'transmissor';

export function ehChaveamento(tipo: unknown): tipo is ModeloChaveamento {
  return tipo === 'pressostato' || tipo === 'termostato';
}

export function ehMedicaoPorPontos(tipo: unknown): tipo is ModeloPontos {
  return tipo === 'manometro' || tipo === 'transmissor';
}

export interface DefinicaoInstrumento {
  rotulo: string;
  /** Rótulo curto, para chip e selo. */
  curto: string;
  grandeza: Grandeza;
  /** A folha NOSSA que emite o certificado; `null` = só calibração de terceiro. */
  modeloInterno: ModeloInterno | null;
  /**
   * Linha do quadro 7.1.1 (ids de `INSTRUMENTOS_CHECKLIST`). `null` = o
   * instrumento não tem linha no quadro (termostato, 24/11/2026): o quadro é a
   * lista FIXA do formulário de campo, e seus ids posicionais antigos são
   * congelados (`idsInstrumentos.ts`).
   */
  checklist: { id: string; calId: string } | null;
  /** Ícone do sprite (`Icone.tsx`). */
  icone: 'manometro' | 'valvula-psv' | 'gauge';
}

export const INSTRUMENTOS: Record<TipoInstrumento, DefinicaoInstrumento> = {
  manometro: {
    rotulo: 'Manômetro',
    curto: 'Manômetro',
    grandeza: 'pressao',
    modeloInterno: 'manometro',
    checklist: { id: 'inst-man', calId: 'inst-man-cal' },
    icone: 'manometro',
  },
  psv: {
    rotulo: 'Válvula de segurança (PSV)',
    curto: 'Válvula PSV',
    grandeza: 'pressao',
    modeloInterno: 'psv',
    checklist: { id: 'inst-psv', calId: 'inst-psv-cal' },
    icone: 'valvula-psv',
  },
  termometro: {
    rotulo: 'Termômetro',
    curto: 'Termômetro',
    grandeza: 'temperatura',
    modeloInterno: null,
    checklist: { id: 'inst-term', calId: 'inst-term-cal' },
    icone: 'gauge',
  },
  vacuometro: {
    rotulo: 'Vacuômetro',
    curto: 'Vacuômetro',
    grandeza: 'pressao',
    modeloInterno: null,
    checklist: { id: 'inst-vac', calId: 'inst-vac-cal' },
    icone: 'manometro',
  },
  pressostato: {
    rotulo: 'Pressostato',
    curto: 'Pressostato',
    grandeza: 'pressao',
    modeloInterno: 'pressostato',
    checklist: { id: 'inst-press', calId: 'inst-press-cal' },
    icone: 'gauge',
  },
  // 24/11/2026 · a malha de pressão (o transmissor e a sua indicação) ganhou
  // certificado interno no modelo do manômetro — é um instrumento de MEDIÇÃO.
  // O tipo continua 'transmissor': é o id do quadro 7.1.1 e dos registros.
  transmissor: {
    rotulo: 'Malha de pressão (transmissor)',
    curto: 'Malha de pressão',
    grandeza: 'pressao',
    modeloInterno: 'transmissor',
    checklist: { id: 'inst-trans', calId: 'inst-trans-cal' },
    icone: 'gauge',
  },
  // 24/11/2026 · termostato: o pressostato de TEMPERATURA (set point,
  // desarme/rearme, inspeção visual). Sem linha no quadro 7.1.1.
  termostato: {
    rotulo: 'Termostato',
    curto: 'Termostato',
    grandeza: 'temperatura',
    modeloInterno: 'termostato',
    checklist: null,
    icone: 'gauge',
  },
};

export const TIPOS_INSTRUMENTO = Object.keys(INSTRUMENTOS) as TipoInstrumento[];

/**
 * Unidades por grandeza. A unidade é do INSTRUMENTO (a escala dele), não do
 * equipamento: um vaso em bar pode ter manômetro em kgf/cm². Nada aqui é
 * convertido — é o rótulo do que foi lido.
 */
export const UNIDADES_POR_GRANDEZA: Record<Grandeza, string[]> = {
  pressao: ['kgf/cm²', 'bar', 'MPa', 'kPa', 'psi', 'mmHg'],
  temperatura: ['°C', '°F', 'K'],
};

export function ehTipoInstrumento(v: unknown): v is TipoInstrumento {
  return typeof v === 'string' && v in INSTRUMENTOS;
}

/** A definição, com recuo para manômetro em dado desconhecido (legado só tinha dois). */
export function definicaoDe(tipo: unknown): DefinicaoInstrumento {
  return ehTipoInstrumento(tipo) ? INSTRUMENTOS[tipo] : INSTRUMENTOS.manometro;
}

export function unidadesDoInstrumento(tipo: unknown): string[] {
  return UNIDADES_POR_GRANDEZA[definicaoDe(tipo).grandeza];
}

/**
 * A unidade é compatível com o instrumento? Termômetro em kgf/cm² é erro de
 * cadastro, e o sistema não o "conserta" trocando por °C — devolve falso, e a
 * tela pede a unidade certa.
 */
export function unidadeCompativel(tipo: unknown, unidade: string | undefined | null): boolean {
  if (!unidade) return false;
  return unidadesDoInstrumento(tipo).includes(unidade);
}

/** O tipo de instrumento dono de uma linha do quadro 7.1.1. */
export function tipoDaLinhaChecklist(idLinha: string): TipoInstrumento | null {
  for (const t of TIPOS_INSTRUMENTO) if (INSTRUMENTOS[t].checklist?.id === idLinha) return t;
  return null;
}
