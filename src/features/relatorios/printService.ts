import html2canvas from 'html2canvas';

// Impressão própria: o navegador quebra o conteúdo de <iframe> ao imprimir (sai em tiras).
// Aqui rasterizamos cada folha A4 (o body do iframe) em uma imagem e imprimimos 1 imagem por
// página — assim cada folha cai exatamente em 1 folha A4, sem quebra/corte.
export async function imprimirRelatorio(containerSelector = '.relatorio-preview'): Promise<void> {
  const paginas = Array.from(
    document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`),
  );
  if (paginas.length === 0) {
    window.print();
    return;
  }

  // 1. Rasteriza cada folha (mesmos parâmetros do PDF: scale 2, JPEG 0.95).
  const imagens: string[] = [];
  for (const pag of paginas) {
    const iframe = pag.querySelector('iframe');
    const alvo = iframe?.contentDocument?.body || pag;
    const canvas = await html2canvas(alvo, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
    imagens.push(canvas.toDataURL('image/jpeg', 0.95));
  }

  // 2. Monta um container só-impressão com 1 imagem A4 por folha.
  const root = document.createElement('div');
  root.id = 'print-root';
  for (const src of imagens) {
    const img = document.createElement('img');
    img.className = 'folha-print';
    img.src = src;
    root.appendChild(img);
  }
  document.body.appendChild(root);
  document.body.classList.add('imprimindo-relatorio');

  const limpar = () => {
    document.body.classList.remove('imprimindo-relatorio');
    root.remove();
    window.removeEventListener('afterprint', limpar);
  };
  window.addEventListener('afterprint', limpar);

  // 3. Espera as imagens decodificarem antes de abrir o diálogo de impressão.
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          }),
    ),
  );

  window.print();
}
