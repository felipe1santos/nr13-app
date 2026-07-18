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

// ── BUG "texto sem espaços" no PDF (html2canvas) ────────────────────────────────────────────
// Causa raiz: os templates usam font-family 'Inter' DENTRO do iframe, mas o html2canvas cria o
// <canvas> no documento do APP (documento pai) — ele MEDE cada palavra no clone do iframe (com
// Inter) e DESENHA via fillText no canvas do pai. O app só registra a família 'Inter Variable'
// (@fontsource-variable/inter, main.tsx), então 'Inter' não resolve no pai e o fillText cai em
// fonte fallback (Arial/Segoe). Em peso 700-900 uppercase o fallback é mais largo que a Inter:
// cada palavra invade o vão do espaço seguinte ("RELATÓRIODEINSPEÇÃO", "DADOSGERAIS") e valores
// longos estouram a célula/sobrepõem a linha de baixo. Correção: re-registrar os @font-face da
// 'Inter Variable' já empacotada sob o nome 'Inter' (funciona offline; Google Fonts só como
// fallback defensivo) e forçar o carregamento antes de rasterizar.
const INTER_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,600;1,700&display=swap';
let interPreparada = false;

function registrarAliasInter(): boolean {
  const regras: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // stylesheet cross-origin — sem acesso
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const familia = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
        if (familia === 'Inter Variable') {
          regras.push(rule.cssText.replace(/font-family\s*:\s*(['"]?)Inter Variable\1/i, "font-family: 'Inter'"));
        }
      }
    }
  }
  if (regras.length === 0) return false;
  const style = document.createElement('style');
  style.setAttribute('data-inter-alias', '');
  style.textContent = regras.join('\n');
  document.head.appendChild(style);
  return true;
}

export async function garantirFonteInterHost(): Promise<void> {
  if (!interPreparada) {
    interPreparada = true;
    if (!registrarAliasInter() && !document.querySelector(`link[href="${INTER_CSS_URL}"]`)) {
      // Fallback (não deveria acontecer): sem a Inter Variable empacotada, usa o mesmo CSS do
      // Google Fonts que os templates carregam nos iframes.
      await new Promise<void>((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = INTER_CSS_URL;
        link.onload = () => resolve();
        link.onerror = () => resolve(); // offline: segue com o comportamento antigo
        document.head.appendChild(link);
        setTimeout(resolve, 4000); // rede lenta não pode travar a geração
      });
    }
  }
  try {
    // O @font-face só baixa o arquivo quando a face é usada — força os pesos dos templates.
    // document.fonts.load pode nunca resolver (fonte que não baixa / rede lenta) — o race com
    // timeout curto garante que a exportação nunca trava aqui; sem a fonte, sai no fallback.
    const pesos = ['400', '500', '600', '700', '800', '900'];
    await Promise.race([
      Promise.all([
        ...pesos.map((p) => document.fonts.load(`${p} 12px 'Inter'`)),
        document.fonts.load(`italic 600 12px 'Inter'`),
        document.fonts.load(`italic 700 12px 'Inter'`),
      ]).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    /* Font Loading API indisponível — segue */
  }
}

// Rede de segurança no clone que o html2canvas rasteriza (bugs documentados do html2canvas):
// letter-spacing ≠ normal faz o texto ser desenhado caractere a caractere (espaços somem) e
// text-align: justify colapsa os espaços entre palavras. Normaliza tudo SÓ no clone — o
// preview/navegador continua com o visual original dos templates.
export function normalizarCloneParaCanvas(doc: Document): void {
  const style = doc.createElement('style');
  style.textContent = '* { letter-spacing: normal !important; word-spacing: normal !important; }';
  (doc.head || doc.documentElement).appendChild(style);
  const win = doc.defaultView;
  if (!win) return;
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (win.getComputedStyle(el).textAlign === 'justify') el.style.textAlign = 'left';
  });
}

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
    // fonts.ready também pode não resolver (fonte externa pendurada) — mesmo race defensivo.
    await Promise.race([
      Promise.resolve((doc as Document & { fonts?: FontFaceSet }).fonts?.ready).then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
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

    // Inter no documento pai ANTES de rasterizar — sem isso o fillText do html2canvas cai em
    // fonte fallback e o texto sai sem espaços/estourando células (ver comentário acima).
    await garantirFonteInterHost();

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
        onclone: normalizarCloneParaCanvas,
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
