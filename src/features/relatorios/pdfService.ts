import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { anexarRastreabilidades } from './rastreabilidadeService';
import { ALTURA_A4_PX, aguardarRecursosIframe } from './printService';

// Mesmos parâmetros do relatorios.js original: jsPDF('p','mm','a4'), html2canvas scale:2,
// JPEG 0.95, addImage cobrindo a folha A4 inteira (0,0,210,297mm).
export async function exportarPdf(containerSelector: string, nomeArquivo: string): Promise<void> {
  const paginas = Array.from(document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`));
  const pdf = new jsPDF('p', 'mm', 'a4');

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
