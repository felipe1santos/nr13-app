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
 * | `modeloInterno` | se existe folha NOSSA de certificado para ele — hoje só manômetro e PSV |
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
 * PDF original anexado. Criar folha interna para termômetro, pressostato ou
 * transmissor é trabalho futuro — ver PENDENCIAS.md.
 */
export type TipoInstrumento =
  | 'manometro'
  | 'psv'
  | 'termometro'
  | 'vacuometro'
  | 'pressostato'
  | 'transmissor';

export type Grandeza = 'pressao' | 'temperatura';

export interface DefinicaoInstrumento {
  rotulo: string;
  /** Rótulo curto, para chip e selo. */
  curto: string;
  grandeza: Grandeza;
  /** A folha NOSSA que emite o certificado; `null` = só calibração de terceiro. */
  modeloInterno: 'manometro' | 'psv' | null;
  /** Linha do quadro 7.1.1 (ids de `INSTRUMENTOS_CHECKLIST`). */
  checklist: { id: string; calId: string };
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
    modeloInterno: null,
    checklist: { id: 'inst-press', calId: 'inst-press-cal' },
    icone: 'gauge',
  },
  transmissor: {
    rotulo: 'Transmissor de pressão',
    curto: 'Transmissor',
    grandeza: 'pressao',
    modeloInterno: null,
    checklist: { id: 'inst-trans', calId: 'inst-trans-cal' },
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
  for (const t of TIPOS_INSTRUMENTO) if (INSTRUMENTOS[t].checklist.id === idLinha) return t;
  return null;
}
