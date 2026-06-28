import html2canvas from 'html2canvas';

// Impressão própria: o navegador quebra o conteúdo de <iframe> ao imprimir (sai em tiras / só 1
// página). Aqui rasterizamos cada folha A4 (o body do iframe) em uma imagem e montamos um
// container #print-root com 1 imagem por página. O @media print esconde o app e mostra só essas
// imagens — assim cada folha cai exatamente em 1 folha A4, sem quebra/corte, tanto pelo botão
// quanto pelo Ctrl+P nativo (desde que as folhas já tenham sido pré-rasterizadas).

let gerando = false;

function aguardarImagens(root: HTMLElement): Promise<void> {
  return Promise.all(
    Array.from(root.querySelectorAll('img')).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          }),
    ),
  ).then(() => undefined);
}

// Rasteriza todas as folhas do preview e popula (ou atualiza) o #print-root oculto. Mantém o
// container vivo para que o Ctrl+P nativo imprima as imagens prontas. Retorna a qtd de folhas.
export async function prepararFolhasImpressao(containerSelector = '.relatorio-preview'): Promise<number> {
  if (gerando) return document.getElementById('print-root')?.childElementCount ?? 0;
  gerando = true;
  try {
    const paginas = Array.from(
      document.querySelectorAll<HTMLElement>(`${containerSelector} .pagina-relatorio-a4`),
    );
    if (paginas.length === 0) return 0;

    const imagens: string[] = [];
    for (const pag of paginas) {
      const iframe = pag.querySelector('iframe');
      const alvo = iframe?.contentDocument?.body || pag;
      // Garante que as imagens (logo/fotos base64) e fontes DENTRO do iframe estejam decodificadas
      // antes do html2canvas — senão a folha rasterizada pode sair com foto/logo em branco.
      const doc = iframe?.contentDocument;
      if (doc) {
        await Promise.all(
          Array.from(doc.images).map((img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : img.decode().catch(() => undefined),
          ),
        );
        try {
          await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
        } catch {
          /* fonts API indisponível — segue */
        }
      }
      const canvas = await html2canvas(alvo, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      imagens.push(canvas.toDataURL('image/jpeg', 0.95));
    }

    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    for (const src of imagens) {
      const img = document.createElement('img');
      img.className = 'folha-print';
      img.src = src;
      root.appendChild(img);
    }
    // Só a partir daqui o @media print esconde o app e mostra as imagens — antes disso o Ctrl+P
    // cairia no fluxo nativo (quebrado), então só ativamos quando as folhas estão prontas.
    document.body.classList.add('imprimindo-relatorio');
    await aguardarImagens(root);
    return imagens.length;
  } finally {
    gerando = false;
  }
}

// Remove o container de impressão e desativa o modo print (ao sair do visualizador).
export function limparFolhasImpressao(): void {
  document.body.classList.remove('imprimindo-relatorio');
  document.getElementById('print-root')?.remove();
}

// Botão "Imprimir": garante folhas atualizadas e abre o diálogo nativo.
export async function imprimirRelatorio(containerSelector = '.relatorio-preview'): Promise<void> {
  const n = await prepararFolhasImpressao(containerSelector);
  if (n === 0) {
    window.print();
    return;
  }
  window.print();
}
