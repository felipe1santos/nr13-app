export type TipoTampoModelo = 'eliptico' | 'toriesferico' | 'hemisferico' | 'plano';

export interface TampoModelo {
  tipo: TipoTampoModelo;
  espessura: number | '';
}

export interface BocalModelo {
  id: string;
  doMemorial: boolean;
  servico: string;
  dn: string;
  diametro: number | '';
  espessura: number | '';
  flange: string;
  local: 'casco' | 'tampo1' | 'tampo2';
  posicaoAxial: number | '';
  angulo: number | '';
  projecao: number | '';
}

export interface SuporteModelo {
  tipo: 'saia' | 'pes' | 'selas' | 'nenhum';
  altura: number | '';
  quantidade: number | '';
}

export interface ModeloVaso {
  tag: string;
  orientacao: 'vertical' | 'horizontal';
  diametroInterno: number | '';
  comprimentoCilindro: number | '';
  espessuraCasco: number | '';
  tampo1: TampoModelo;
  tampo2: TampoModelo;
  bocais: BocalModelo[];
  suporte: SuporteModelo;
  densidadeAco: number;
  pesoOperacao: number | '';
  material: string;
}
