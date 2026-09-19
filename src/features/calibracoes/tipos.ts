import type { RefFoto } from '../../services/fotos';
import type { TipoInstrumento } from './instrumentos';

export interface LinhaResultado {
  vc: string;
  vi: string;
  erro: string;
}

/**
 * Revisão do engenheiro, fase 2 (C.2) · QUEM responde pela calibração.
 *
 * Snapshot tirado de `nr13_lista_phs` no momento do registro — trocar o
 * cadastro do funcionário depois não muda o certificado. Mesma regra da logo e
 * dos assinantes do relatório (§7-bis): com `assinaturaRef` a rubrica fica só
 * como referência (a imagem mora no bucket, endereçada pelo conteúdo) e a
 * dataURL sai; sem referência, congela a dataURL como sempre foi.
 *
 * Nunca se inventa assinatura: sem imagem no cadastro, o certificado sai com
 * nome, função e registro, e a linha da rubrica em branco.
 */
export interface ResponsavelCalibracao {
  /** id em `nr13_lista_phs` — só para rastrear a origem; o que vale é o snapshot. */
  id: string;
  nome: string;
  funcao: string;
  /** CREA / registro profissional. */
  registro: string;
  assinaturaRef?: RefFoto;
  assinatura?: string;
}

/**
 * Revisão do engenheiro, fase 2 (C.3) · o certificado EMITIDO é um arquivo.
 *
 * Mesma regra do relatório (§7-quater): depois de emitido, o certificado não é
 * mais remontado do template — visualizar, baixar e anexar ao relatório servem
 * estes bytes. `sha256` é do arquivo gravado; `pendente` vem do cofre local
 * (nunca de `navigator.onLine`).
 */
export interface EmissaoCertificado {
  pdfRef: RefFoto;
  sha256: string;
  /** ISO da emissão. */
  emitidoEm: string;
  paginas: number;
  pendente: boolean;
  /** Logo e rubrica que ESTA emissão usou (referências imutáveis, por conteúdo/uuid). */
  logoRef?: RefFoto | null;
  assinaturaRef?: RefFoto | null;
}

/**
 * De onde veio a calibração. AUSENTE = registro anterior a esta regra: o
 * sistema NÃO deduz nada — pode ter sido feita pela empresa ou digitada de um
 * certificado de laboratório. A tela diz "origem não informada".
 */
export type OrigemCalibracao = 'interna' | 'terceiro';

/**
 * Situação do certificado INTERNO. Ausente = legado (anterior à emissão
 * imutável): continua abrindo pelo template, como sempre abriu.
 */
export type StatusCertificado = 'rascunho' | 'emitido';

interface DadosCalibracaoBase {
  id: string;
  tag: string;
  /** O INSTRUMENTO calibrado. Legado só conhece 'manometro' | 'psv'. */
  tipo: TipoInstrumento;
  nome: string;
  criadoEm: string;
  /** Componente cadastrado que originou esta calibração (agrupamento por instrumento). */
  componenteId?: string;
  /** Lote/rodada de calibração a que este certificado pertence (agrupamento por inspeção). */
  loteId?: string;
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
  /**
   * Reestruturação (19/09/2026) · o padrão ESCOLHIDO: id da versão em
   * `nr13_rastreab_` (cada gravação lá é uma versão nova). Os quatro campos
   * acima são o snapshot dele na data. Ausente = registro anterior ou padrão
   * informado à mão.
   */
  padraoId?: string;
  /**
   * O ARQUIVO do certificado do padrão usado — a referência exata no bucket,
   * congelada junto com o snapshot. O relatório anexa por `padraoId` e, se o
   * registro não for encontrado, por esta referência. Nunca "algum padrão do
   * mesmo tipo".
   */
  padraoPdfRef?: RefFoto;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  textoMotivo: string;
  /**
   * Unidade das medições, escolhida no cadastro do componente.
   *
   * Os dois títulos de tabela do `CERTIFICADO-CAL-MANOMETRO.html` traziam
   * `Kgf/cm²` fixo no HTML: quem calibrasse em bar via a própria medição
   * rotulada com a unidade errada no documento emitido. Ausente = registro
   * anterior a 10/09/2026; o template mantém o texto que já tinha.
   */
  unidade?: string;
  origem?: OrigemCalibracao;
}

interface DadosInternoBase extends DadosCalibracaoBase {
  origem?: 'interna';
  status?: StatusCertificado;
  responsavel?: ResponsavelCalibracao;
  emissao?: EmissaoCertificado;
  /** Correção: esta emissão SUBSTITUI a de id `substitui` (que continua existindo). */
  substitui?: string;
}

export interface DadosManometro extends DadosInternoBase {
  tipo: 'manometro';
  crescente: LinhaResultado[];
  incertezaC: string;
  coefC: string;
  decrescente: LinhaResultado[];
  incertezaD: string;
  coefD: string;
}

export interface DadosPSV extends DadosInternoBase {
  tipo: 'psv';
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
}

/**
 * Revisão do engenheiro, fase 2 (D) · calibração feita por LABORATÓRIO EXTERNO.
 *
 * Só é registrada e referenciada. O sistema NUNCA gera certificado nosso para
 * ela — nem folha de template, nem logo, nem assinatura: o documento é do
 * laboratório, e o PDF original fica no bucket (`<org>/certificados-externos/`)
 * sem modificação nenhuma. Os campos de ambiente/padrão da base ficam vazios —
 * pertencem ao certificado do laboratório, não a este registro.
 */
export interface DadosTerceiro extends DadosCalibracaoBase {
  origem: 'terceiro';
  laboratorio: string;
  responsavelExterno: string;
  observacoes: string;
  /** O PDF do laboratório, intacto. Ausente = registrado sem arquivo (ainda). */
  pdfExternoRef?: RefFoto;
  pdfExternoNome?: string;
  /** SHA-256 do PDF externo como recebido — prova de que não foi alterado. */
  pdfExternoSha256?: string;
}

export type DadosCalibracaoInterna = DadosManometro | DadosPSV;
export type DadosCalibracao = DadosCalibracaoInterna | DadosTerceiro;

export function ehTerceiro(c: { origem?: unknown } | null | undefined): c is DadosTerceiro {
  return c?.origem === 'terceiro';
}

export function ehInterna(c: DadosCalibracao | null | undefined): c is DadosCalibracaoInterna {
  return !!c && !ehTerceiro(c) && (c.tipo === 'manometro' || c.tipo === 'psv');
}

export function ehEmitido(c: DadosCalibracao | null | undefined): boolean {
  return ehInterna(c) && c.status === 'emitido' && !!c.emissao?.pdfRef?.path;
}

/** Rótulo da origem para a tela — legado diz que NÃO SABE, em vez de chutar. */
export function rotuloOrigem(c: DadosCalibracao): string {
  if (c.origem === 'terceiro') return 'Laboratório externo';
  if (c.origem === 'interna') return 'Calibração interna';
  return 'Origem não informada (registro anterior)';
}
