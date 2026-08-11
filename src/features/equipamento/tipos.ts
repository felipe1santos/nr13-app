import type { SistemaUnidade } from '../../calc/unidades';
import type { FotoArmazenada, RefFoto } from '../../services/fotos';

export type TipoEquipamento = 'vaso' | 'autoclave' | 'caldeira';
export type SubtipoAutoclave = 'retangular' | 'cilindrica' | 'vertical';
export type SubtipoCaldeira = 'flamotubular' | 'aquatubular' | 'vertical' | 'mista' | 'eletrica';

// nr13_info_<TAG>
export interface InfoEquipamento {
  tag: string;
  tipo: TipoEquipamento;
  subtipo: SubtipoAutoclave | SubtipoCaldeira | '';
  descricao?: string;
  fabricante?: string;
  ano?: string;
  numeroSerie?: string;
  // Dados cadastrais complementares — injetados em PRONTUARIO/INSPECOES/PLACA (antes saíam "--").
  codigoProjeto?: string; // ex.: "ASME Seção VIII Divisão 1"
  edicao?: string; // ex.: "2004"
  adenda?: string;
  localizacao?: string; // ex.: "Área de utilidades"
  tipoConstrucao?: string;
  descricaoResumida?: string;
  // Pressões da Documentação (adotadas manualmente) — SEMPRE armazenadas em MPa (string numérica).
  // Templates preferem estas quando preenchidas; senão caem nas calculadas (nr13_calc/nr13_cat).
  // NUNCA entram no cálculo da Categoria de Risco (regra absoluta §4 do CLAUDE.md).
  pmtaAdotadaMpa?: string;
  pmoAdotadaMpa?: string;
  pthAdotadaMpa?: string;
  // Placa de identificação: ocultar células EXECUÇÃO DA INSPEÇÃO / VALIDADE (default false).
  placaOcultarDatas?: boolean;
}

// nr13_cat_<TAG>
export interface CategoriaSalva {
  classe: 'A' | 'B' | 'C' | 'D';
  grupo: 1 | 2 | 3 | 4 | 5;
  PV_cat: string;
  PV_enq: string;
  isEnquadrado: boolean;
  catFinal: string;
  volInput: number;
  presInput: number;
  unidInput: SistemaUnidade;
  fluidoInput: string;
}

// nr13_calc_<TAG>
export interface CalculoSalvo {
  pmta: string;
  pth: string;
  ecasco?: string;
  etampo?: string;
  memorialHTML: string;
  logCalculo?: string[];
  resultado?: 'APROVADO' | 'REPROVADO';
}

// nr13_fotos_<TAG>
export interface FotoEquipamento {
  id: number;
  /**
   * LEGADO: base64 das fotos gravadas antes de 10/08/2026. Fotos novas nascem
   * com `src: ''` e a imagem no bucket — ver `ref`. O campo continua existindo
   * porque as fotos antigas não foram migradas e precisam seguir aparecendo.
   */
  src: string;
  /** Referência no Storage (bucket + path). Ausente nas fotos legadas. */
  ref?: RefFoto;
  isCapa: boolean;
}

// nr13_emp_<TAG>
export interface EmpresaEquipamento {
  clienteId?: string;
  razaoSocial?: string;
  cnpj?: string;
  nomeFantasia?: string;
  atividade?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  localidade?: string; // alias for cidade — read by CAPA.html
  cep?: string;
  telefone?: string;
  estado?: string;
  contato?: string;
  email?: string;
}

export interface EquipamentoResumo {
  tag: string;
  info: InfoEquipamento;
  categoria: CategoriaSalva | null;
  calculo: CalculoSalvo | null;
  /** Capa: referência no bucket e/ou base64 legado. Resolvida na exibição. */
  fotoCapa: FotoArmazenada | null;
  unidade: SistemaUnidade;
}
