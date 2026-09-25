import { abrirPdfEmAba, baixarPdfDeBytes } from '../../components/VisualizadorPdf';
import { gerarPreviaCertificado } from './emissaoCertificado';
import { nomeArquivoCalibracao } from './artefatoCalibracao';
import { avisarBloqueioDocumentos } from '../../services/trial';
import { ehInterna, type DadosCalibracao, type DadosCalibracaoInterna } from './tipos';

/**
 * Fase 7 · o rascunho INTERNO é mostrado, baixado e impresso pelos bytes do
 * gerador vetorial da emissão (com a marca "RASCUNHO — NÃO EMITIDO"). Legado
 * (sem `status`) continua pelo template; emitido, pelo arquivo.
 */
export function ehRascunhoInterno(cal: DadosCalibracao | null | undefined): cal is DadosCalibracaoInterna {
  return ehInterna(cal) && cal.status === 'rascunho';
}

/**
 * Baixar o rascunho: os bytes da prévia, nada publicado. Passa pelo MESMO funil
 * de bloqueio de documentos (trial / assinatura suspensa) do `exportarPdf`.
 */
export async function baixarPreviaCertificado(cal: DadosCalibracaoInterna): Promise<void> {
  if (avisarBloqueioDocumentos()) return;
  const { bytes } = await gerarPreviaCertificado(cal);
  baixarPdfDeBytes(bytes, nomeArquivoCalibracao(cal));
}

/** Imprimir o rascunho: abre a prévia no leitor; bloqueado o popup, baixa. Mesmo funil do `imprimirRelatorio`. */
export async function imprimirPreviaCertificado(cal: DadosCalibracaoInterna): Promise<void> {
  if (avisarBloqueioDocumentos()) return;
  const { bytes } = await gerarPreviaCertificado(cal);
  if (!abrirPdfEmAba(bytes)) baixarPdfDeBytes(bytes, nomeArquivoCalibracao(cal));
}
