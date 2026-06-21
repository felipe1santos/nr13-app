export interface LinhaResultado {
  vc: string;
  vi: string;
  erro: string;
}

interface DadosCalibracaoBase {
  id: string;
  tag: string;
  tipo: 'manometro' | 'psv';
  nome: string;
  criadoEm: string;
  numeroCertificado: string;
  dataEmissao: string;
  empresa: string;
  endereco: string;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  referencia: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  tempAr: string;
  umidade: string;
  local: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  textoMotivo: string;
}

export interface DadosManometro extends DadosCalibracaoBase {
  tipo: 'manometro';
  crescente: LinhaResultado[];
  incertezaC: string;
  coefC: string;
  decrescente: LinhaResultado[];
  incertezaD: string;
  coefD: string;
}

export interface DadosPSV extends DadosCalibracaoBase {
  tipo: 'psv';
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
}

export type DadosCalibracao = DadosManometro | DadosPSV;
