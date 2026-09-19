import { unidadeCompativel, type TipoInstrumento } from './instrumentos';
import type { DadosTerceiro } from './tipos';

/**
 * Revisão do engenheiro, fase 2 (D) · as regras PURAS do registro de
 * calibração de laboratório externo — o modal (`ModalCalibracaoTerceiro`)
 * só coleta e chama. Separadas para teste sem DOM.
 */
export const ESCOPO_CERTIFICADOS_EXTERNOS = 'certificados-externos';

export interface FormTerceiro {
  tipo: TipoInstrumento;
  nome: string;
  fabricante: string;
  modelo: string;
  serie: string;
  faixa: string;
  unidade: string;
  laboratorio: string;
  responsavelExterno: string;
  numeroCertificado: string;
  dataCalibracao: string;
  validade: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  observacoes: string;
}

/** O que falta para poder registrar — lista vazia = pode. */
export function faltasTerceiro(f: FormTerceiro): string[] {
  const out: string[] = [];
  if (!f.nome.trim()) out.push('identificação do instrumento');
  if (!f.laboratorio.trim()) out.push('laboratório');
  if (!f.numeroCertificado.trim()) out.push('nº do certificado');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f.dataCalibracao)) out.push('data da calibração');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(f.validade)) out.push('validade');
  if (!unidadeCompativel(f.tipo, f.unidade)) out.push('unidade do instrumento');
  return out;
}

/** O registro — função pura, testada sem DOM. */
export function montarTerceiro(
  f: FormTerceiro,
  tag: string,
  ids: { id: string; componenteId: string; loteId?: string },
  pdf?: { ref: DadosTerceiro['pdfExternoRef']; nome: string; sha256: string } | null,
): DadosTerceiro {
  return {
    id: ids.id,
    tag,
    tipo: f.tipo,
    origem: 'terceiro',
    nome: f.nome.trim(),
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    componenteId: ids.componenteId,
    ...(ids.loteId ? { loteId: ids.loteId } : {}),
    numeroCertificado: f.numeroCertificado.trim(),
    // Data de emissão e cliente pertencem ao certificado do laboratório — não
    // se copiam para cá (seria reescrever o documento de outro emitente).
    dataEmissao: '',
    empresa: '',
    endereco: '',
    instrumento: f.nome.trim(),
    fabricante: f.fabricante.trim(),
    modelo: f.modelo.trim(),
    serie: f.serie.trim(),
    referencia: f.faixa.trim(),
    dataCalibracao: f.dataCalibracao,
    dataProxCalibracao: f.validade,
    tempAr: '',
    umidade: '',
    local: '',
    padraoInst: '',
    padraoSerie: '',
    padraoCert: '',
    padraoVal: '',
    statusConclusao: f.statusConclusao,
    textoMotivo: '',
    unidade: f.unidade,
    laboratorio: f.laboratorio.trim(),
    responsavelExterno: f.responsavelExterno.trim(),
    observacoes: f.observacoes.trim(),
    ...(pdf?.ref ? { pdfExternoRef: pdf.ref, pdfExternoNome: pdf.nome, pdfExternoSha256: pdf.sha256 } : {}),
  };
}
