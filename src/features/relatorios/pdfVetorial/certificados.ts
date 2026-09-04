import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import {
  ALTURA_A4_PX,
  aguardarRecursosIframe,
  garantirFonteInterHost,
  normalizarCloneParaCanvas,
} from '../printService';

/**
 * Fase 11 · os CERTIFICADOS dentro do relatório vetorial.
 *
 * ## A regra, e por que ela não é a mesma das outras folhas
 *
 * O novo layout vale para o RELATÓRIO. Certificado é outro documento: ele tem
 * emitente, numeração e validade próprios, e em muitos casos foi emitido por um
 * laboratório que não é o usuário do sistema. Redesenhá-lo seria reescrever
 * documento de terceiro — então aqui ele é **preservado como está**.
 *
 * São dois tipos, e cada um entra pelo caminho que preserva melhor:
 *
 * | o que é | onde vive | como entra |
 * |---|---|---|
 * | certificado do padrão (`nr13_rastreab_`) | **PDF** já pronto | páginas COPIADAS pelo pdf-lib — sem rasterizar, sem recomprimir |
 * | folha de calibração (`CERTIFICADO-CAL-*.html?calibId=`) | template HTML | rasterizada da folha montada, como hoje |
 *
 * O primeiro caminho é o `anexarRastreabilidades` que o gerador raster já usa —
 * o vetorial chama exatamente a mesma função, então o certificado escaneado
 * chega ao relatório com os bytes originais.
 *
 * O segundo **precisa** rasterizar: não existe PDF de origem, existe uma folha
 * HTML. Rasterizar só essas páginas é o contrário do que a Fase 11 proíbe —
 * proibido é o `html2canvas` da página inteira virar o relatório todo. Aqui o
 * corpo do relatório é vetor de ponta a ponta, e a raster fica confinada ao
 * documento que não pode ser redesenhado.
 */

/** A4 em pontos PostScript — a unidade do pdf-lib. */
const A4_PT = { largura: 595.28, altura: 841.89 } as const;

/** Uma folha de certificado de calibração dentro da lista de documentos. */
export function ehFolhaDeCertificado(documento: string): boolean {
  const arquivo = documento.split('?')[0].toUpperCase();
  // "CERTIIFCADO" é o nome real do arquivo no repositório (erro de digitação
  // antigo, preservado porque renomear quebraria relatórios já emitidos).
  return arquivo.startsWith('CERTIFICADO-CAL') || arquivo.startsWith('CERTIIFCADO-CAL');
}

/** Posições, na lista de documentos, das folhas de certificado. */
export function indicesDeCertificado(documentos: string[]): number[] {
  return documentos.map((d, i) => (ehFolhaDeCertificado(d) ? i : -1)).filter((i) => i >= 0);
}

/**
 * Quantas páginas as folhas de calibração vão acrescentar.
 *
 * Uma por folha MONTADA — cada uma vira exatamente uma página A4. Folha que não
 * está no DOM não é contada porque também não será anexada; contá-la faria o
 * "Página X de Y" prometer uma página que não existiria.
 */
export function contarFolhasDeCertificado(
  documentos: string[],
  containerSelector = '.relatorio-preview',
): number {
  // Sem DOM não há folha montada para anexar, logo não há página a contar.
  // A checagem é explícita porque este módulo também é importado fora do
  // navegador (a suíte roda em `node`), e um `document` ausente ali não é erro.
  if (typeof document === 'undefined') return 0;
  const folhas = document.querySelectorAll<HTMLElement>(
    `${containerSelector} .pagina-relatorio-a4`,
  );
  return indicesDeCertificado(documentos).filter((i) => !!folhas[i]).length;
}

/**
 * Anexa ao PDF as folhas de certificado que estão montadas no visualizador.
 *
 * Cada índice de `documentos` corresponde a uma `.pagina-relatorio-a4` na mesma
 * ordem — é a mesma correspondência que o gerador raster usa. Página que não
 * estiver montada é PULADA e volta em `falhas`: certificado que some sem aviso
 * é o defeito que este projeto passa a vida consertando.
 */
export async function anexarFolhasDeCertificado(
  bytes: Uint8Array,
  documentos: string[],
  containerSelector = '.relatorio-preview',
): Promise<{ bytes: Uint8Array; anexadas: number; falhas: string[] }> {
  const indices = indicesDeCertificado(documentos);
  if (indices.length === 0) return { bytes, anexadas: 0, falhas: [] };

  const folhas = Array.from(
    document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`),
  );
  const doc = await PDFDocument.load(bytes);
  await garantirFonteInterHost();

  let anexadas = 0;
  const falhas: string[] = [];

  for (const i of indices) {
    const folha = folhas[i];
    if (!folha) {
      falhas.push(documentos[i]);
      continue;
    }
    try {
      const iframe = folha.querySelector('iframe');
      const alvo = iframe?.contentDocument?.body || folha;
      await aguardarRecursosIframe(iframe?.contentDocument);
      const canvas = await html2canvas(alvo, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        height: ALTURA_A4_PX,
        windowHeight: ALTURA_A4_PX,
        onclone: normalizarCloneParaCanvas,
      });
      const jpg = await doc.embedJpg(canvas.toDataURL('image/jpeg', 0.95));
      const pagina = doc.addPage([A4_PT.largura, A4_PT.altura]);
      pagina.drawImage(jpg, { x: 0, y: 0, width: A4_PT.largura, height: A4_PT.altura });
      anexadas++;
    } catch (e) {
      console.error(`Certificado "${documentos[i]}": falha ao anexar ao relatório vetorial.`, e);
      falhas.push(documentos[i]);
    }
    // Devolve o fôlego ao navegador entre folhas, como no gerador raster.
    await new Promise((r) => setTimeout(r, 0));
  }

  return { bytes: await doc.save(), anexadas, falhas };
}
