/**
 * DADOS DA CALDEIRA — o que só uma caldeira flamotubular tem (22/10/2026).
 *
 * Chave `nr13_ficha_caldeira_<TAG>` (por TAG, registrada em `familiasChave`): modelo,
 * aspectos construtivos (corpo, espelhos, fornalha, tubos), termodinâmicos e
 * operacionais, mecanismos de controle e os instrumentos de segurança e
 * acessórios. Para vaso e autoclave a chave simplesmente não existe — nenhum
 * formulário deles a mostra, nenhum documento deles a lê.
 *
 * UMA configuração (`GRUPOS_CALDEIRA`) serve à tela da ficha e às tabelas do
 * relatório: o rótulo que o engenheiro preenche é o rótulo que sai no papel, e
 * não existe uma segunda lista para sair de sincronia.
 *
 * Tudo é texto livre e opcional: o PDF de referência mistura "N/I", "N/C" e
 * "---", e o sistema não inventa valor — vazio vira travessão no documento.
 */
import { ler, salvar } from '../../services/storage';

export const PREFIXO_CALDEIRA = 'nr13_ficha_caldeira_';
export const chaveCaldeira = (tag: string) => `${PREFIXO_CALDEIRA}${tag}`;

/** Um campo: `chave` é o caminho no registro (`corpo.material`). */
export interface CampoCaldeira {
  chave: string;
  rotulo: string;
  /** Sugestões rápidas — continua sendo texto livre. */
  opcoes?: string[];
  /** Unidade mostrada no rótulo do documento. */
  unidade?: string;
}

export interface GrupoCaldeira {
  id: string;
  titulo: string;
  /** Em que folha do relatório o grupo sai. */
  folha: 'prontuario1' | 'prontuario2' | 'acessorios';
  campos: CampoCaldeira[];
}

const MANUAL_AUTO = ['Manual', 'Automático'];

export const GRUPOS_CALDEIRA: GrupoCaldeira[] = [
  {
    id: 'equipamento',
    titulo: 'Dados do equipamento',
    folha: 'prontuario1',
    campos: [
      { chave: 'modelo', rotulo: 'Modelo' },
      { chave: 'dataInstalacao', rotulo: 'Data da instalação' },
    ],
  },
  {
    id: 'corpo',
    titulo: 'Corpo',
    folha: 'prontuario1',
    campos: [
      { chave: 'corpo.material', rotulo: 'Material' },
      { chave: 'corpo.tipoConstrucao', rotulo: 'Tipo de construção', opcoes: ['Soldada', 'Rebitada'] },
      { chave: 'corpo.descricao', rotulo: 'Descrição resumida' },
      { chave: 'corpo.comprimento', rotulo: 'Comprimento', unidade: 'mm' },
      { chave: 'corpo.espessuraNominal', rotulo: 'Espessura nominal', unidade: 'mm' },
      { chave: 'corpo.eficienciaJunta', rotulo: 'Eficiência de junta' },
    ],
  },
  {
    id: 'espelhos',
    titulo: 'Espelhos',
    folha: 'prontuario1',
    campos: [
      { chave: 'espelhos.tipo', rotulo: 'Tipo', opcoes: ['Estaiado', 'Plano'] },
      { chave: 'espelhos.material', rotulo: 'Material' },
      { chave: 'espelhos.diametro', rotulo: 'Diâmetro', unidade: 'mm' },
      { chave: 'espelhos.espessuraDianteiro', rotulo: 'Espessura nominal — dianteiro', unidade: 'mm' },
      { chave: 'espelhos.espessuraTraseiro', rotulo: 'Espessura nominal — traseiro', unidade: 'mm' },
    ],
  },
  {
    id: 'fornalha',
    titulo: 'Fornalha tubular',
    folha: 'prontuario1',
    campos: [
      { chave: 'fornalha.tipo', rotulo: 'Tipo' },
      { chave: 'fornalha.diametro', rotulo: 'Diâmetro', unidade: 'mm' },
      { chave: 'fornalha.material', rotulo: 'Material' },
      { chave: 'fornalha.espessura', rotulo: 'Espessura nominal', unidade: 'mm' },
    ],
  },
  {
    id: 'tubos',
    titulo: 'Tubos de gases',
    folha: 'prontuario1',
    campos: [
      { chave: 'tubos.quantidade', rotulo: 'Quantidade de tubos' },
      { chave: 'tubos.construcao', rotulo: 'Construção', opcoes: ['Mandrilhado', 'Soldado', 'Mandrilhado/Soldado'] },
      { chave: 'tubos.diametro', rotulo: 'Diâmetro' },
      { chave: 'tubos.material', rotulo: 'Material' },
    ],
  },
  {
    id: 'termodinamicos',
    titulo: 'Aspectos termodinâmicos',
    folha: 'prontuario2',
    campos: [{ chave: 'passes', rotulo: 'Número de passes' }],
  },
  {
    id: 'operacionais',
    titulo: 'Aspectos operacionais',
    folha: 'prontuario2',
    campos: [
      { chave: 'vazao', rotulo: 'Vazão mássica', unidade: 'kg/h' },
      { chave: 'tipoVapor', rotulo: 'Tipo de vapor', opcoes: ['Saturado', 'Superaquecido'] },
      { chave: 'fonteEnergia', rotulo: 'Fonte de energia', opcoes: ['Diesel', 'Gás natural', 'GLP', 'Lenha', 'Biomassa', 'Óleo combustível'] },
      { chave: 'tiragem', rotulo: 'Tiragem', opcoes: ['Natural', 'Forçada', 'Induzida', 'Indução natural'] },
      { chave: 'alimentacaoAgua', rotulo: 'Alimentação de água', opcoes: MANUAL_AUTO },
      { chave: 'tipoTratamento', rotulo: 'Tipo de tratamento de água' },
      { chave: 'processoTratamento', rotulo: 'Processo de tratamento' },
    ],
  },
  {
    id: 'controles',
    titulo: 'Mecanismos de controle',
    folha: 'prontuario2',
    campos: [
      { chave: 'controles.agua', rotulo: 'Alimentação de água', opcoes: MANUAL_AUTO },
      { chave: 'controles.ar', rotulo: 'Ar atmosférico', opcoes: MANUAL_AUTO },
      { chave: 'controles.combustivel', rotulo: 'Combustível', opcoes: MANUAL_AUTO },
      { chave: 'controles.ignicao', rotulo: 'Ignição', opcoes: MANUAL_AUTO },
    ],
  },
  {
    id: 'indicadorPressao',
    titulo: 'Indicador de pressão',
    folha: 'acessorios',
    campos: [
      { chave: 'indicadorPressao.identificacao', rotulo: 'Identificação' },
      { chave: 'indicadorPressao.fabricante', rotulo: 'Fabricante' },
      { chave: 'indicadorPressao.tipo', rotulo: 'Tipo', opcoes: ['Analógico', 'Digital'] },
      { chave: 'indicadorPressao.escala', rotulo: 'Escala' },
      { chave: 'indicadorPressao.diametro', rotulo: 'Diâmetro' },
      { chave: 'indicadorPressao.localizacao', rotulo: 'Localização' },
      { chave: 'indicadorPressao.divisao', rotulo: 'Divisão' },
    ],
  },
  ...[1, 2].map((n) => ({
    id: `alivio${n}`,
    titulo: `Dispositivo de alívio de pressão ${n}`,
    folha: 'acessorios' as const,
    campos: [
      { chave: `alivio${n}.identificacao`, rotulo: 'Identificação' },
      { chave: `alivio${n}.fabricante`, rotulo: 'Fabricante' },
      { chave: `alivio${n}.tipo`, rotulo: 'Tipo' },
      { chave: `alivio${n}.material`, rotulo: 'Material' },
      { chave: `alivio${n}.dimensao`, rotulo: 'Dimensão' },
      { chave: `alivio${n}.pressaoAbertura`, rotulo: 'Pressão de abertura' },
    ],
  })),
  ...[1, 2].map((n) => ({
    id: `nivel${n}`,
    titulo: `Indicador de nível ${n}`,
    folha: 'acessorios' as const,
    campos: [
      { chave: `nivel${n}.modelo`, rotulo: 'Modelo' },
      { chave: `nivel${n}.fabricante`, rotulo: 'Fabricante' },
      { chave: `nivel${n}.tipo`, rotulo: 'Tipo', opcoes: ['Visor', 'Eletrodo', 'Boia'] },
      { chave: `nivel${n}.escala`, rotulo: 'Escala' },
    ],
  })),
  {
    id: 'drenagem',
    titulo: 'Dispositivo de drenagem',
    folha: 'acessorios',
    campos: [
      { chave: 'drenagem.identificacao', rotulo: 'Identificação' },
      { chave: 'drenagem.fabricante', rotulo: 'Fabricante' },
      { chave: 'drenagem.tipo', rotulo: 'Tipo' },
      { chave: 'drenagem.dimensao', rotulo: 'Dimensão' },
      { chave: 'drenagem.material', rotulo: 'Material' },
      { chave: 'drenagem.localizacao', rotulo: 'Localização' },
    ],
  },
  ...[1, 2].map((n) => ({
    id: `bomba${n}`,
    titulo: `Dispositivo de alimentação de água ${n}`,
    folha: 'acessorios' as const,
    campos: [
      { chave: `bomba${n}.identificacao`, rotulo: 'Identificação' },
      { chave: `bomba${n}.fabricante`, rotulo: 'Fabricante' },
      { chave: `bomba${n}.tipo`, rotulo: 'Tipo' },
      { chave: `bomba${n}.material`, rotulo: 'Material' },
      { chave: `bomba${n}.capacidade`, rotulo: 'Capacidade' },
      { chave: `bomba${n}.potencia`, rotulo: 'Potência' },
      { chave: `bomba${n}.pressao`, rotulo: 'Pressão' },
      { chave: `bomba${n}.acionamento`, rotulo: 'Acionamento', opcoes: MANUAL_AUTO },
    ],
  })),
  {
    id: 'aberturas',
    titulo: 'Abertura para inspeção e limpeza',
    folha: 'acessorios',
    campos: [
      { chave: 'abertura1.localizacao', rotulo: 'Localização 1' },
      { chave: 'abertura1.dimensao', rotulo: 'Dimensão 1' },
      { chave: 'abertura2.localizacao', rotulo: 'Localização 2' },
      { chave: 'abertura2.dimensao', rotulo: 'Dimensão 2' },
    ],
  },
  {
    id: 'chamine',
    titulo: 'Chaminé',
    folha: 'acessorios',
    campos: [
      { chave: 'chamine.quantidade', rotulo: 'Quantidade' },
      { chave: 'chamine.altura', rotulo: 'Altura', unidade: 'mm' },
    ],
  },
];

/** O registro: um objeto de dois níveis, só strings. */
export type DadosCaldeira = Record<string, string | Record<string, string>>;

/** O valor de `corpo.material` (ou `modelo`). Ausente = ''. */
export function valorCaldeira(d: DadosCaldeira | null | undefined, chave: string): string {
  if (!d) return '';
  const [a, b] = chave.split('.');
  const v = b === undefined ? d[a] : (d[a] as Record<string, string> | undefined)?.[b];
  return typeof v === 'string' ? v : '';
}

/** Devolve uma CÓPIA com o campo alterado — nunca muta o registro recebido. */
export function comValorCaldeira(d: DadosCaldeira, chave: string, valor: string): DadosCaldeira {
  const [a, b] = chave.split('.');
  if (b === undefined) return { ...d, [a]: valor };
  const grupo = (typeof d[a] === 'object' && d[a] !== null ? d[a] : {}) as Record<string, string>;
  return { ...d, [a]: { ...grupo, [b]: valor } };
}

export function carregarDadosCaldeira(tag: string): DadosCaldeira {
  try {
    const v = ler<DadosCaldeira>(chaveCaldeira(tag));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export async function salvarDadosCaldeira(tag: string, d: DadosCaldeira): Promise<void> {
  await salvar(chaveCaldeira(tag), d);
}

/** Algum campo preenchido? (A ficha mostra "não preenchido" em vez de uma tabela de travessões.) */
export function temDadosCaldeira(d: DadosCaldeira | null | undefined): boolean {
  return GRUPOS_CALDEIRA.some((g) => g.campos.some((c) => valorCaldeira(d, c.chave).trim() !== ''));
}
