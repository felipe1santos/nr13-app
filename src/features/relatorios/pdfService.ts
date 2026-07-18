import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { anexarRastreabilidades } from './rastreabilidadeService';
import { ALTURA_A4_PX, aguardarRecursosIframe, garantirFonteInterHost, normalizarCloneParaCanvas } from './printService';

// Mesmos parâmetros do relatorios.js original: jsPDF('p','mm','a4'), html2canvas scale:2,
// JPEG 0.95, addImage cobrindo a folha A4 inteira (0,0,210,297mm).
export async function exportarPdf(containerSelector: string, nomeArquivo: string): Promise<void> {
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

  // Rastreabilidade (Calibrações → aba Rastreabilidade): PDFs marcados com
  // "injetar no relatório" são mesclados ao FINAL. Sem itens marcados, o fluxo
  // é idêntico ao original (save direto). Falha no merge não bloqueia o download.
  try {
    const { bytes, anexados, falhas } = await anexarRastreabilidades(pdf.output('arraybuffer'));
    if (anexados > 0 || falhas.length > 0) {
      baixarBytes(bytes, nomeArquivo);
      if (falhas.length > 0) {
        window.alert(`Relatório gerado, mas não foi possível anexar a rastreabilidade de: ${falhas.join(', ')}. Confira o PDF cadastrado.`);
      }
      return;
    }
  } catch {
    /* merge indisponível: cai no save padrão abaixo */
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
