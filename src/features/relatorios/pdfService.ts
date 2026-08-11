import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { anexarRastreabilidades } from './rastreabilidadeService';
import { ALTURA_A4_PX, aguardarRecursosIframe, garantirFonteInterHost, normalizarCloneParaCanvas } from './printService';
import { avisarBloqueioDocumentos } from '../../services/trial';

// Mesmos parâmetros do relatorios.js original: jsPDF('p','mm','a4'), html2canvas scale:2,
// JPEG 0.95, addImage cobrindo a folha A4 inteira (0,0,210,297mm).
/**
 * Rasteriza as folhas e DEVOLVE os bytes do PDF, em vez de baixar.
 *
 * Existe porque o relatório salvo virou ARTEFATO: no "Salvar", o PDF precisa ser
 * gerado, ter o hash calculado e subir para o bucket — nada disso cabe numa
 * função que termina em `pdf.save()`.
 *
 * NÃO chama `avisarBloqueioDocumentos()` de propósito. Aquele gate existe para
 * os funis de DOWNLOAD e IMPRESSÃO (trial não exporta documento); aplicá-lo aqui
 * impediria uma conta em trial de SALVAR o próprio relatório, que é outra coisa.
 * O invólucro `exportarPdf` continua cobrando o gate.
 *
 * `onProgresso` é chamado a cada folha rasterizada: são dezenas de segundos num
 * relatório grande, e sem isso a tela parece travada.
 */
export async function gerarPdfBytes(
  containerSelector: string,
  opts: {
    rastreabilidades?: boolean;
    documentos?: string[];
    onProgresso?: (feito: number, total: number) => void;
  } = {},
): Promise<{ bytes: Uint8Array; paginas: number; falhasAnexo: string[] }> {
  const folhas = Array.from(document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`));
  if (folhas.length === 0) throw new Error('nenhuma folha para gerar: o documento não está montado');

  const pdf = new jsPDF('p', 'mm', 'a4');
  await garantirFonteInterHost();

  for (let i = 0; i < folhas.length; i++) {
    const iframe = folhas[i].querySelector('iframe');
    const alvo = iframe?.contentDocument?.body || folhas[i];
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
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    opts.onProgresso?.(i + 1, folhas.length);
    // Devolve o fôlego ao navegador entre folhas: sem isso a aba congela e o
    // Chrome chega a oferecer "matar a página" num relatório de 30+ folhas.
    await new Promise((r) => setTimeout(r, 0));
  }

  let bytes: Uint8Array = new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer);
  let falhasAnexo: string[] = [];
  if (opts.rastreabilidades) {
    try {
      const r = await anexarRastreabilidades(bytes.slice().buffer as ArrayBuffer, opts.documentos ?? []);
      if (r.anexados > 0) bytes = new Uint8Array(r.bytes);
      falhasAnexo = r.falhas;
    } catch (e) {
      // Falha no merge NÃO invalida o relatório: o documento sai sem o anexo e o
      // chamador decide o que fazer com a lista de falhas.
      console.error('Falha ao anexar as rastreabilidades:', e);
      falhasAnexo = ['certificados padrão'];
    }
  }

  return { bytes, paginas: pdf.getNumberOfPages(), falhasAnexo };
}

export async function exportarPdf(
  containerSelector: string,
  nomeArquivo: string,
  // Só o RELATÓRIO anexa os certificados padrão ao final (§7 #22) — livro standalone e
  // documentos simples do portal exportam sem eles. `documentos` (lista de folhas do
  // relatório) define QUAIS tipos de padrão anexar (calibrações presentes + ultrassom).
  opts: { rastreabilidades?: boolean; documentos?: string[] } = {},
): Promise<void> {
  // Bloqueio de documento (trial OU assinatura suspensa) — funil único, cobre todos os botões.
  if (avisarBloqueioDocumentos()) return;
  const paginas = Array.from(document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`));
  const pdf = new jsPDF('p', 'mm', 'a4');

  // Inter no documento pai ANTES de rasterizar: o html2canvas mede o texto no iframe (que tem a
  // Inter) mas desenha no canvas criado AQUI — sem a fonte, o fallback mais largo "come" os
  // espaços entre palavras em negrito/uppercase e estoura células (ver printService).
  await garantirFonteInterHost();

  for (let i = 0; i < paginas.length; i++) {
    const iframe = paginas[i].querySelector('iframe');
    const alvo = iframe?.contentDocument?.body || paginas[i];

    // Mesmas garantias do printService: fontes/imagens prontas e corte na altura do A4 —
    // sem isso o PDF saía com cabeçalho em fonte de fallback e folha transbordada espremida.
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
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  }

  // Certificados padrão (Calibrações → Certificados Calibração): os PDFs dos tipos
  // presentes no relatório são mesclados ao FINAL, automaticamente. Sem tipo presente,
  // o fluxo é idêntico ao original (save direto). Falha no merge não bloqueia o download.
  try {
    if (!opts.rastreabilidades) {
      pdf.save(nomeArquivo);
      return;
    }
    const { bytes, anexados, falhas } = await anexarRastreabilidades(pdf.output('arraybuffer'), opts.documentos ?? []);
    if (anexados > 0 || falhas.length > 0) {
      baixarBytes(bytes, nomeArquivo);
      if (falhas.length > 0) {
        window.alert(`Relatório gerado, mas não foi possível anexar o certificado padrão de: ${falhas.join(', ')}. Confira o PDF cadastrado.`);
      }
      return;
    }
  } catch (e) {
    // Merge indisponível (falha ao carregar o próprio PDF do relatório): cai no save padrão
    // abaixo, mas deixa rastro — antes o certificado sumia sem nenhum sinal.
    console.error('Falha ao anexar as rastreabilidades ao final do relatório:', e);
  }

  pdf.save(nomeArquivo);
}

// ── Livro de Registro completo (capa + termo + registros) em PDF ÚNICO e CONTÍNUO ──
// Diferente do exportarPdf (1 folha A4 por iframe), aqui cada URL vira um BLOCO medido na
// altura real do conteúdo (templates em ?modo=compacto): os blocos são empilhados um abaixo
// do outro, quebrando para a página seguinte só quando não cabem — sem numeração de página.
const LARGURA_PDF_MM = 210;
const ALTURA_PDF_MM = 297;
// Tolerância pra capa (min-height 297mm + bordas) não "vazar" uma lasca pra 2ª página.
const FOLGA_MM = 4;

export async function exportarPdfLivroCompleto(urls: string[], nomeArquivo: string): Promise<void> {
  if (avisarBloqueioDocumentos()) return;
  // Host offscreen: os templates leem o localStorage no DOMContentLoaded, então basta
  // carregá-los em iframes invisíveis com a mesma largura do A4 em px (794 @96dpi).
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;overflow:hidden;';
  document.body.appendChild(host);
  try {
    const iframes = await Promise.all(
      urls.map(
        (url) =>
          new Promise<HTMLIFrameElement>((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'width:794px;height:400px;border:none;display:block;';
            iframe.onload = () => resolve(iframe);
            iframe.src = url;
            host.appendChild(iframe);
          }),
      ),
    );
    // Mesmo respiro do preview: os motores das folhas renderizam no DOMContentLoaded.
    await new Promise((r) => setTimeout(r, 400));
    // Mesma garantia de fonte do exportarPdf (texto sem espaços no fillText sem a Inter).
    await garantirFonteInterHost();

    const pdf = new jsPDF('p', 'mm', 'a4');
    let y = 0;
    for (const iframe of iframes) {
      const doc = iframe.contentDocument;
      if (!doc) continue;
      await aguardarRecursosIframe(doc);
      const alvo = doc.querySelector<HTMLElement>('.page') || doc.body;
      // Iframe na altura do conteúdo — sem isso o html2canvas cortaria no viewport de 400px.
      iframe.style.height = `${Math.max(alvo.scrollHeight, 120)}px`;
      const canvas = await html2canvas(alvo, { scale: 2, useCORS: true, allowTaint: true, logging: false, onclone: normalizarCloneParaCanvas });
      if (canvas.width === 0 || canvas.height === 0) continue;
      const alturaMm = (canvas.height / canvas.width) * LARGURA_PDF_MM;

      if (y > 0 && y + alturaMm > ALTURA_PDF_MM + FOLGA_MM) {
        pdf.addPage();
        y = 0;
      }
      if (alturaMm <= ALTURA_PDF_MM + FOLGA_MM) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, y, LARGURA_PDF_MM, alturaMm);
        y += alturaMm;
      } else {
        // Bloco maior que uma folha inteira: fatia em páginas cheias (caso raro).
        const pxPorPagina = Math.floor((canvas.width * ALTURA_PDF_MM) / LARGURA_PDF_MM);
        const fatia = document.createElement('canvas');
        const ctx = fatia.getContext('2d');
        if (!ctx) continue;
        for (let off = 0; off < canvas.height; off += pxPorPagina) {
          if (off > 0) pdf.addPage();
          const alturaPx = Math.min(pxPorPagina, canvas.height - off);
          fatia.width = canvas.width;
          fatia.height = alturaPx;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, fatia.width, fatia.height);
          ctx.drawImage(canvas, 0, off, canvas.width, alturaPx, 0, 0, canvas.width, alturaPx);
          pdf.addImage(fatia.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, LARGURA_PDF_MM, (alturaPx / canvas.width) * LARGURA_PDF_MM);
        }
        y = ((canvas.height % pxPorPagina || pxPorPagina) / canvas.width) * LARGURA_PDF_MM;
      }
    }
    pdf.save(nomeArquivo);
  } finally {
    host.remove();
  }
}

function baixarBytes(bytes: Uint8Array, nomeArquivo: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
