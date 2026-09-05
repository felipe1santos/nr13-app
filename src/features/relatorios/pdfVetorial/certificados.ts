import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import {
  ALTURA_A4_PX,
  aguardarRecursosIframe,
  garantirFonteInterHost,
  normalizarCloneParaCanvas,
} from '../printService';
import { comFolhaIsolada } from './hostCertificado';

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
export function contarFolhasDeCertificado(documentos: string[]): number {
  // Sem DOM não há como montar o host isolado, logo não há página a contar. A
  // checagem é explícita porque este módulo também é importado fora do
  // navegador (a suíte roda em `node`), e um `document` ausente ali não é erro.
  if (typeof document === 'undefined') return 0;
  // 13B · a conta passou a ser da LISTA, não da tela. Antes ela perguntava
  // quais folhas estavam montadas em `.relatorio-preview`: com o documento
  // fechado a resposta era zero, e o "Página X de Y" prometia menos páginas do
  // que o arquivo teria. Agora toda folha de certificado da composição será
  // montada no host isolado, então toda ela conta.
  return indicesDeCertificado(documentos).length;
}

/**
 * Anexa ao PDF as folhas de certificado da composição.
 *
 * 13B · cada folha é montada SOZINHA num host fora da tela, rasterizada e
 * descartada. Não há mais correspondência com `.pagina-relatorio-a4`: o
 * relatório não precisa estar aberto, e o resultado não depende do que está na
 * tela. Folha que falhar volta em `falhas` — certificado que some sem aviso é o
 * defeito que este projeto passa a vida consertando.
 */
export async function anexarFolhasDeCertificado(
  bytes: Uint8Array,
  documentos: string[],
  tag: string,
): Promise<{ bytes: Uint8Array; anexadas: number; falhas: string[] }> {
  const indices = indicesDeCertificado(documentos);
  if (indices.length === 0) return { bytes, anexadas: 0, falhas: [] };

  const doc = await PDFDocument.load(bytes);
  await garantirFonteInterHost();

  let anexadas = 0;
  const falhas: string[] = [];

  for (const i of indices) {
    try {
      const jpgUrl = await comFolhaIsolada(documentos[i], tag, async (alvo, docFolha) => {
        await aguardarRecursosIframe(docFolha);
        const canvas = await html2canvas(alvo, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          height: ALTURA_A4_PX,
          windowHeight: ALTURA_A4_PX,
          onclone: normalizarCloneParaCanvas,
        });
        return canvas.toDataURL('image/jpeg', 0.95);
      });
      const jpg = await doc.embedJpg(jpgUrl);
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
