export interface DimensaoProntuario {
  modelo: string;
  diametro: string;
  altura: string;
  espCorpo: string;
  espFundo: string;
  espTampa: string;
  volume: string;
}

export interface ProntuarioDados {
  tag: string;
  criadoEm: string;
  // Identificação
  descricao: string;
  dataFabricacao: string;
  classeFluid: string;
  categoria: string;
  grupoPotencialRisco: string;
  modelo: string;
  caracteristicasFuncionais: string;
  // Dados do projeto
  codigoProjeto: string;
  anoEdicao: string;
  pressaoTH: string;
  pressaoMaxOp: string;
  pressaoProjeto: string;
  nroSerie: string;
  pmta: string;
  sobreespessura: string;
  // Materiais
  tempProjeto: string;
  tipoTampos: string;
  fundoCorpo: string;
  tampa: string;
  manipulos: string;
  prisioneiros: string;
  aro: string;
  luvConexoes: string;
  // Dimensões (opcional)
  croqui?: string;
  dimensoes?: DimensaoProntuario[];
  // Ensaio de espessura puxado (container de inspeção)
  containerEnsaioId?: string;
  // Revisão
  revisao: string;
  dataRevisao: string;
  // Empresa emissora (minha empresa)
  logo?: string;
  minhaEmpresaNome?: string;
  minhaEmpresaCnpj?: string;
  minhaEmpresaEndereco?: string;
  minhaEmpresaCidade?: string;
  minhaEmpresaEstado?: string;
  minhaEmpresaTelefone?: string;
  // Empresa proprietária do equipamento
  empresaClienteId?: string;
  empresaRazaoSocial?: string;
  empresaCnpj?: string;
  empresaEndereco?: string;
  empresaCidade?: string;
  empresaEstado?: string;
  empresaTelefone?: string;
}

export const PAGINAS_PRONTUARIO = [
  'PRONT-P1.html',
  'PRONT-CARACTERIZACAO.html',
  'PRONT-P2.html',
  'PRONT-P2B.html',
  'PRONT-P3.html',
  'PRONT-P4.html',
] as const;
