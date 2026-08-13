export interface DimensaoProntuario {
  modelo: string;
  diametro: string;
  altura: string;
  comprimento: string;
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
  'PRONT-ULTRASSOM.html',
  'PRONT-CROQUI2D.html',
  'PRONT-FOLHA-DADOS.html',
  'PRONT-PRONTUARIO.html',
  'PRONT-CONTINUACAO.html',
  'PRONT-MEMORIAL.html',
] as const;

/**
 * As duas folhas que só existem por causa do croqui 2D.
 *
 * `PRONT-CROQUI2D` é o desenho cotado e `PRONT-FOLHA-DADOS` é a prancha técnica
 * derivada do MESMO modelo (`nr13_modelo3d_<TAG>` → `nr13_croqui2d_<TAG>` e
 * `nr13_folha_dados_<TAG>`). Sem modelo salvo elas caem no desenho genérico e na
 * tabela vazia — duas folhas de enfeite dentro de um documento técnico.
 */
const FOLHAS_DO_CROQUI: readonly string[] = ['PRONT-CROQUI2D.html', 'PRONT-FOLHA-DADOS.html'];

/** Só o vaso de pressão tem croqui 2D no sistema. */
export function temCroqui2d(tipoEquipamento: string): boolean {
  return tipoEquipamento === 'vaso';
}

/**
 * Folhas do prontuário para um tipo de equipamento.
 *
 * Caldeira e autoclave não têm croqui 2D: o editor nunca soube desenhá-las, e o
 * prontuário delas saía com duas folhas genéricas — um desenho que não é o
 * equipamento e uma tabela de dimensões vazia. Pior num documento que vai
 * assinado por engenheiro.
 *
 * A numeração das folhas sai desta lista (`page` e `total` na URL de cada
 * iframe), então filtrar aqui já corrige o rodapé; e a impressão e o PDF do
 * prontuário rasterizam `.prontuario-preview`, isto é, o que esta função
 * montou — não há uma segunda lista para manter em dia.
 */
export function paginasProntuario(tipoEquipamento: string): readonly string[] {
  if (temCroqui2d(tipoEquipamento)) return PAGINAS_PRONTUARIO;
  return PAGINAS_PRONTUARIO.filter((p) => !FOLHAS_DO_CROQUI.includes(p));
}
