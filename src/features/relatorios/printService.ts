import html2canvas from 'html2canvas';

// Impressão própria: o navegador quebra o conteúdo de <iframe> ao imprimir (sai em tiras / só 1
// página). Aqui rasterizamos cada folha A4 (o body do iframe) em uma imagem e montamos um
// container #print-root com 1 imagem por página. O @media print esconde o app e mostra só essas
// imagens — assim cada folha cai exatamente em 1 folha A4, sem quebra/corte, tanto pelo botão
// quanto pelo Ctrl+P nativo (desde que as folhas já tenham sido pré-rasterizadas).

let gerando = false;

// Altura de UMA folha A4 em px CSS (297mm @ 96dpi). A captura corta o body do iframe nessa
// altura para a impressão sair exatamente como o preview — que também corta em 297mm via
// overflow:hidden (relatorios.css). Sem o corte, um body que transborda o A4 (folhas com
// min-height, conteúdo que cresceu) era fotografado inteiro e ESPREMIDO na folha impressa.
export const ALTURA_A4_PX = Math.ceil((297 * 96) / 25.4);

// Espera imagens (logo/fotos base64) decodificarem e as fontes externas carregarem DENTRO do
// iframe antes do html2canvas — senão a folha sai com logo em branco / cabeçalho em fonte errada.
export async function aguardarRecursosIframe(doc: Document | null | undefined): Promise<void> {
  if (!doc) return;
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => undefined),
    ),
  );
  try {
    await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* fonts API indisponível — segue */
  }
}

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
      await aguardarRecursosIframe(iframe?.contentDocument);
      const canvas = await html2canvas(alvo, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        // Corta na altura de 1 folha A4 — igual ao preview (overflow:hidden em 297mm).
        height: ALTURA_A4_PX,
        windowHeight: ALTURA_A4_PX,
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
