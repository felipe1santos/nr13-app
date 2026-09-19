import type { PdfArtefato } from '../relatorios/artefatoRelatorio';
import { ehEmitido, ehTerceiro, type DadosCalibracao } from './tipos';

/**
 * O ARQUIVO que representa uma calibração, quando ele existe (fase 2, C.3/D).
 *
 * - certificado interno EMITIDO → os bytes da emissão (`emissao.pdfRef`);
 * - calibração de TERCEIRO com PDF → o PDF do laboratório, intacto;
 * - rascunho, legado e terceiro sem arquivo → `null`: quem chama cai no
 *   template (interno) ou diz que não há arquivo (terceiro).
 *
 * Devolve um `PdfArtefato` para o visualizador, o download e a impressão serem
 * os MESMOS do relatório finalizado (§7-quater) — nenhum caminho novo de
 * servir PDF.
 */
export function artefatoDaCalibracao(cal: DadosCalibracao | null | undefined): PdfArtefato | null {
  if (!cal) return null;
  if (ehTerceiro(cal)) {
    if (!cal.pdfExternoRef?.path) return null;
    return {
      pdfRef: cal.pdfExternoRef,
      sha256: cal.pdfExternoSha256 ?? '',
      geradoEm: '',
      paginas: 0,
      pendente: false,
    };
  }
  if (!ehEmitido(cal) || !('emissao' in cal) || !cal.emissao) return null;
  return {
    pdfRef: cal.emissao.pdfRef,
    sha256: cal.emissao.sha256,
    geradoEm: cal.emissao.emitidoEm,
    paginas: cal.emissao.paginas,
    pendente: cal.emissao.pendente,
  };
}

/** Nome do arquivo para download — nunca sugere que o certificado de terceiro é nosso. */
export function nomeArquivoCalibracao(cal: DadosCalibracao): string {
  const base = ehTerceiro(cal)
    ? `${cal.laboratorio || 'laboratorio'}-${cal.numeroCertificado || 'certificado'}`
    : `${cal.numeroCertificado || 'certificado'}-${cal.nome || cal.tipo}`;
  return `${base.replace(/[^\w.-]+/g, '-')}.pdf`;
}
