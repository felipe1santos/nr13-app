// Trava de SOMENTE LEITURA dos documentos exibidos em iframe.
//
// As folhas de relatório/prontuário são templates HTML preenchíveis
// (contenteditable, inputs, divs com onclick que trocam logo/foto ou marcam
// SIM/NÃO) — durante a MONTAGEM do relatório isso é proposital. Depois de o
// relatório ser salvo, não é: o documento vira registro técnico assinado e não
// pode mais mudar. Mesma regra vale para o Portal do Cliente, que só visualiza.
//
// A flag `somenteLeitura` da tela é estado React e só alcança a UI React. O
// conteúdo do documento mora DENTRO do iframe — por isso a trava precisa entrar
// no documento do iframe (mesmo-origin, então acessível pelo pai).
//
// Esta é a camada de DOM. As outras duas camadas:
//   - `public/sb-storage.js` recusa `sbSalvar` quando a folha recebe `ro=1`
//     (nada entra na ponte de escrita);
//   - `usePalcoDocumento` não drena a ponte em documento somente leitura.
//
// A trava é reaplicada por MutationObserver porque os templates montam conteúdo
// depois do DOMContentLoaded (injeção de dados, páginas de fotos, assinaturas).

const CSS_TRAVA = `
  [contenteditable] { -webkit-user-modify: read-only !important; user-modify: read-only !important; caret-color: transparent !important; }
  input, textarea, select, button { pointer-events: none !important; }
  .editable-image, [onclick] { cursor: default !important; }
`;

const ID_ESTILO = 'nr13-somente-leitura';

// `click` e `dblclick` entram na lista porque TODO onclick inline dos templates
// é ação de edição — selOpt, toggleCb, selectSN (grava nr13_laudo_<TAG>),
// selectResult, selectRC, removerFoto, clicarArea, removeImageBox e os que
// abrem o seletor de arquivo da logo/foto do equipamento. `mousedown` fica de
// fora de propósito: sem ele o usuário ainda consegue selecionar e copiar texto.
export const EVENTOS_BLOQUEADOS = [
  'beforeinput',
  'keydown',
  'keypress',
  'paste',
  'cut',
  'drop',
  'dragstart',
  'click',
  'dblclick',
] as const;

/** Sufixo de query string que avisa o template que ele é somente leitura. */
export function paramsSomenteLeitura(somenteLeitura: boolean): string {
  return somenteLeitura ? '&ro=1' : '';
}

/**
 * Espelho, do lado do app, do gate que `public/sb-storage.js` aplica. Existe
 * para que a regra tenha um único teste de verdade: se um dos dois mudar sem o
 * outro, o teste quebra.
 */
export function documentoSomenteLeitura(search: string): boolean {
  return new URLSearchParams(search).get('ro') === '1';
}

function travarElementos(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    if (el.getAttribute('contenteditable') !== 'false') el.setAttribute('contenteditable', 'false');
  });
  doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
    el.readOnly = true;
  });
}

/** Trava um documento já carregado. Devolve a função de limpeza. */
export function travarDocumento(doc: Document): () => void {
  try {
    doc.designMode = 'off';
  } catch {
    // alguns documentos recusam designMode; o resto da trava cobre
  }

  if (!doc.getElementById(ID_ESTILO)) {
    const estilo = doc.createElement('style');
    estilo.id = ID_ESTILO;
    estilo.textContent = CSS_TRAVA;
    (doc.head ?? doc.documentElement).appendChild(estilo);
  }

  // stopPropagation na fase de CAPTURA é o que impede o evento de chegar ao
  // onclick inline do próprio elemento — preventDefault sozinho não faria isso.
  const bloquear = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  for (const nome of EVENTOS_BLOQUEADOS) doc.addEventListener(nome, bloquear, true);

  travarElementos(doc);
  const observer = new MutationObserver(() => travarElementos(doc));
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributeFilter: ['contenteditable'] });

  return () => {
    observer.disconnect();
    for (const nome of EVENTOS_BLOQUEADOS) doc.removeEventListener(nome, bloquear, true);
  };
}

/** Trava o iframe agora (se já carregou) e a cada novo load. Devolve a limpeza. */
export function travarIframeSomenteLeitura(iframe: HTMLIFrameElement): () => void {
  let limparDoc: (() => void) | null = null;

  const aplicar = () => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    limparDoc?.();
    limparDoc = travarDocumento(doc);
  };

  if (iframe.contentDocument?.readyState === 'complete') aplicar();
  iframe.addEventListener('load', aplicar);

  return () => {
    iframe.removeEventListener('load', aplicar);
    limparDoc?.();
  };
}
