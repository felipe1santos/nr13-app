import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Mesmos parâmetros do relatorios.js original: jsPDF('p','mm','a4'), html2canvas scale:2,
// JPEG 0.95, addImage cobrindo a folha A4 inteira (0,0,210,297mm).
export async function exportarPdf(containerSelector: string, nomeArquivo: string): Promise<void> {
  const paginas = Array.from(document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`));
  const pdf = new jsPDF('p', 'mm', 'a4');

  for (let i = 0; i < paginas.length; i++) {
    const iframe = paginas[i].querySelector('iframe');
    const alvo = iframe?.contentDocument?.body || paginas[i];

    const canvas = await html2canvas(alvo, { scale: 2, useCORS: true, allowTaint: true, logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  }

  pdf.save(nomeArquivo);
}
