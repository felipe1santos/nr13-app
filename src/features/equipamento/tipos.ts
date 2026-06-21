import type { SistemaUnidade } from '../../calc/unidades';

export type TipoEquipamento = 'vaso' | 'autoclave' | 'caldeira';
export type SubtipoAutoclave = 'retangular' | 'cilindrica';

// nr13_info_<TAG>
export interface InfoEquipamento {
  tag: string;
  tipo: TipoEquipamento;
  subtipo: SubtipoAutoclave | 'flamotubular' | 'aquatubular' | '';
  descricao?: string;
  fabricante?: string;
  ano?: string;
  numeroSerie?: string;
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
  src: string;
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
  fotoCapa: string | null;
  unidade: SistemaUnidade;
}
