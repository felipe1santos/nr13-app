/**
 * Validação do PDF do certificado de calibração dos instrumentos PADRÃO.
 *
 * Vive fora do componente porque a regra tem dois detalhes que só se provam com
 * teste (ver __tests__/certificadoUpload.test.ts):
 *
 * 1. `File.type` NÃO é confiável. Vários seletores de arquivo (Android, alguns
 *    gerenciadores no Windows, arquivos vindos de nuvem) entregam o PDF com
 *    `type` vazio ou 'application/octet-stream'. A checagem antiga exigia
 *    `type === 'application/pdf'` e recusava PDF legítimo com "Anexe um arquivo
 *    PDF" — foi a reclamação de cliente que originou este módulo. Aqui a
 *    extensão .pdf vale como prova quando o MIME não vem.
 *
 * 2. O teto REAL não é o tamanho do arquivo: o PDF é gravado como data URL
 *    base64 no localStorage (cache que os templates em iframe leem), o que
 *    infla ~37%, e a cota do navegador é de ~5 MB para a origem INTEIRA —
 *    dividida com todas as fotos de inspeção já salvas. O limite anterior de
 *    8 MB era impossível de cumprir: um PDF de 4 MB já virava 5,5 MB de string
 *    e estourava a cota. 2 MB (≈2,8 MB em base64) é o maior valor que ainda
 *    convive com o resto dos dados; certificado escaneado normal tem 200–800 KB.
 */

/** Teto do PDF, em KB — exibido cru na interface para o usuário. */
export const LIMITE_PDF_KB = 2048;
export const LIMITE_PDF_BYTES = LIMITE_PDF_KB * 1024;

/** Fator de inflação do base64 (4 bytes de saída para cada 3 de entrada). */
export const FATOR_BASE64 = 4 / 3;

/** Subconjunto de `File` que a validação usa (permite testar sem DOM). */
export interface ArquivoCertificado {
  name: string;
  type: string;
  size: number;
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

export function tamanhoEmKb(bytes: number): number {
  return Math.round(bytes / 1024);
}

/**
 * Aprova ou recusa o arquivo escolhido, com mensagem pronta para a tela.
 * Recusa só o que é comprovadamente inválido — na dúvida sobre o MIME, aceita
 * pela extensão (ver nota 1 no topo).
 */
export function validarPdfCertificado(arquivo: ArquivoCertificado): ResultadoValidacao {
  const temExtensaoPdf = /\.pdf$/i.test(arquivo.name ?? '');
  const mime = (arquivo.type ?? '').toLowerCase();
  // MIME genérico ('' ou octet-stream) não desqualifica: quem decide é a extensão.
  const mimeIndefinido = mime === '' || mime === 'application/octet-stream';
  const ehPdf = mime === 'application/pdf' || (mimeIndefinido && temExtensaoPdf);

  if (!ehPdf) {
    return { ok: false, erro: 'Esse arquivo não é um PDF. Selecione o certificado em formato PDF (.pdf).' };
  }
  if (!arquivo.size) {
    return { ok: false, erro: 'O arquivo está vazio (0 KB). Verifique o PDF e tente de novo.' };
  }
  if (arquivo.size > LIMITE_PDF_BYTES) {
    return {
      ok: false,
      erro:
        `Esse PDF tem ${tamanhoEmKb(arquivo.size)} KB e o limite é ${LIMITE_PDF_KB} KB (2 MB). ` +
        'Comprima o arquivo (ex.: ilovepdf.com/compress_pdf) e anexe de novo.',
    };
  }
  return { ok: true };
}

/**
 * Mensagem do caso em que o PDF passou na validação mas não pôde ser gravado.
 * Depois que os PDFs passaram a morar no IndexedDB (ver services/pdfStore.ts) o
 * espaço deixou de ser o motivo provável — sobra navegador em modo restrito
 * (armazenamento bloqueado / janela anônima) ou disco cheio. Sem o arquivo
 * gravado o certificado nunca seria injetado no relatório, então a falha é
 * reportada na hora em vez de aparecer só na impressão.
 */
export function erroCotaLocal(tamanhoBase64: number): string {
  return (
    `Não foi possível gravar o PDF (${tamanhoEmKb(tamanhoBase64)} KB depois de convertido) no ` +
    'armazenamento do navegador. Verifique se o navegador não está em janela anônima ou com o ' +
    'armazenamento de sites bloqueado, e tente novamente.'
  );
}
