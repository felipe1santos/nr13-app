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
  const win = doc.defaultView;
  if (win) {
    // Tudo que LÊ o layout original roda ANTES de injetar o <style> abaixo — a normalização de
    // letter-spacing alarga o texto e mudaria as medidas (grids auto estouravam a folha).
    substituirControlesPorTexto(doc, win);
    fixarColunasDeGrid(doc, win);
    corrigirFundoDeLinhaComRowspan(doc, win);
    doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (win.getComputedStyle(el).textAlign === 'justify') el.style.textAlign = 'left';
    });
  }
  const style = doc.createElement('style');
  // .no-print: o raster é o que sai impresso, então segue a mesma semântica do @media print
  // dos templates (controles de tela não podem aparecer na folha).
  style.textContent =
    '* { letter-spacing: normal !important; word-spacing: normal !important; }\n' +
    '.no-print { display: none !important; }';
  (doc.head || doc.documentElement).appendChild(style);
}

// A normalização de letter-spacing (acima) alarga o texto do clone; colunas de grid
// dimensionadas por conteúdo (ex.: .id-bar das folhas de fotos, com letter-spacing negativo)
// crescem e estouram a margem direita da folha, cortando a última célula no raster. Congela as
// trilhas na largura do layout original — o texto pode encostar na célula vizinha (fração de
// px por caractere), mas a folha mantém as bordas.
function fixarColunasDeGrid(doc: Document, win: Window): void {
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const cs = win.getComputedStyle(el);
    if (cs.display !== 'grid' && cs.display !== 'inline-grid') return;
    // getComputedStyle devolve as trilhas já resolvidas em px (valores usados). Só as colunas:
    // as linhas precisam continuar livres para crescer se o texto re-quebrar.
    if (cs.gridTemplateColumns && cs.gridTemplateColumns !== 'none') {
      el.style.gridTemplateColumns = cs.gridTemplateColumns;
    }
  });
}

// ── BUG "linha some atrás do fundo da tabela" (html2canvas) ─────────────────────────────────
// Quando um <tr> tem background-color e alguma célula de linha ANTERIOR usa rowspan, o
// html2canvas pinta o fundo do <tr> (cujo box atravessa a tabela inteira, inclusive a coluna
// da célula rowspan) DEPOIS do conteúdo já pintado da célula — apagando o texto (ex.: "ANO DE
// FABRICAÇÃO" do PRONT-ULTRASSOM perdia a 2ª linha). No navegador as células pintam acima do
// fundo do row; aqui movemos o fundo do <tr> para as células dele, que é visualmente idêntico
// e não cobre a célula rowspan.
function corrigirFundoDeLinhaComRowspan(doc: Document, win: Window): void {
  doc.querySelectorAll<HTMLTableRowElement>('tr').forEach((tr) => {
    const bg = win.getComputedStyle(tr).backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return;
    Array.from(tr.cells).forEach((celula) => {
      const cbg = win.getComputedStyle(celula).backgroundColor;
      if (cbg === 'rgba(0, 0, 0, 0)' || cbg === 'transparent') celula.style.backgroundColor = bg;
    });
    tr.style.backgroundColor = 'transparent';
  });
}

// ── BUG "texto cortado ao meio" nos inputs (html2canvas) ────────────────────────────────────
// O html2canvas desenha o valor de <input>/<textarea> com fillText numa baseline que ele mede
// criando uma div escondida NO DOCUMENTO DO APP (FontMetrics) — herdando line-height/CSS do
// app, não do template — e depois aplica ctx.clip() no box do elemento. Qualquer divergência
// entre a métrica do app e o layout real do iframe desloca o glifo para baixo e o clip corta a
// metade inferior (dígitos da PMTA, datas, placeholders). Ajuste de line-height/height no
// template NÃO resolve, porque a métrica errada vem do documento pai.
// Correção definitiva: no clone, trocar cada controle por um elemento estático com o mesmo
// texto e estilo — texto comum é desenhado pelo caminho normal (bounds do layout real, sem
// clip) e sai íntegro. Bônus: placeholder volta a sair na cor de placeholder, não na do valor.
function substituirControlesPorTexto(doc: Document, win: Window): void {
  const controles = Array.from(
    doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'),
  );
  for (const el of controles) {
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const tipo = ((el as HTMLInputElement).getAttribute('type') || 'text').toLowerCase();
      // checkbox/radio o html2canvas desenha como forma geométrica (sem fillText) — sem bug;
      // hidden/file não têm representação visual.
      if (tipo === 'checkbox' || tipo === 'radio' || tipo === 'hidden' || tipo === 'file') continue;
    }
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;

    let texto = '';
    let ehPlaceholder = false;
    if (tag === 'SELECT') {
      const sel = el as HTMLSelectElement;
      texto = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex]?.text ?? '' : '';
    } else {
      texto = (el as HTMLInputElement | HTMLTextAreaElement).value;
      if (texto === '') {
        texto = (el as HTMLInputElement | HTMLTextAreaElement).placeholder || '';
        ehPlaceholder = texto !== '';
      }
    }

    const sub = doc.createElement('div');
    sub.textContent = texto;
    const s = sub.style;
    // Mesmo box do controle (valores usados em px — o clone tem o mesmo viewport/layout).
    s.boxSizing = 'border-box';
    s.width = `${el.offsetWidth}px`;
    s.height = `${el.offsetHeight}px`;
    s.paddingTop = cs.paddingTop;
    s.paddingRight = cs.paddingRight;
    s.paddingBottom = cs.paddingBottom;
    s.paddingLeft = cs.paddingLeft;
    s.borderTop = cs.borderTopWidth === '0px' ? 'none' : `${cs.borderTopWidth} ${cs.borderTopStyle} transparent`;
    s.borderRight = cs.borderRightWidth === '0px' ? 'none' : `${cs.borderRightWidth} ${cs.borderRightStyle} transparent`;
    s.borderBottom = cs.borderBottomWidth === '0px' ? 'none' : `${cs.borderBottomWidth} ${cs.borderBottomStyle} transparent`;
    s.borderLeft = cs.borderLeftWidth === '0px' ? 'none' : `${cs.borderLeftWidth} ${cs.borderLeftStyle} transparent`;
    s.margin = cs.margin;
    s.fontFamily = cs.fontFamily;
    s.fontSize = cs.fontSize;
    s.fontWeight = cs.fontWeight;
    s.fontStyle = cs.fontStyle;
    s.textAlign = cs.textAlign;
    s.overflow = 'hidden';
    s.backgroundColor = 'transparent';
    if (ehPlaceholder) {
      let corPlaceholder = '';
      try {
        corPlaceholder = win.getComputedStyle(el, '::placeholder').color;
      } catch {
        /* ::placeholder indisponível — usa fallback */
      }
      s.color = corPlaceholder || '#9ca3af';
    } else {
      s.color = cs.color;
    }
    if (tag === 'TEXTAREA') {
      s.whiteSpace = 'pre-wrap';
      s.overflowWrap = 'break-word';
      s.lineHeight = cs.lineHeight;
    } else {
      // Linha única: o navegador centraliza o texto do input verticalmente no content box —
      // line-height igual à altura do conteúdo reproduz esse centro no elemento estático.
      s.whiteSpace = 'pre';
      const alturaConteudo =
        el.offsetHeight -
        (parseFloat(cs.paddingTop) || 0) -
        (parseFloat(cs.paddingBottom) || 0) -
        (parseFloat(cs.borderTopWidth) || 0) -
        (parseFloat(cs.borderBottomWidth) || 0);
      s.lineHeight = alturaConteudo > 0 ? `${alturaConteudo}px` : cs.lineHeight;
    }
    el.replaceWith(sub);
  }
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
