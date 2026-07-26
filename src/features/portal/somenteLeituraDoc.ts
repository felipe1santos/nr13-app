// Trava de SOMENTE LEITURA dos documentos exibidos no Portal do Cliente.
//
// As folhas de relatório/prontuário são templates HTML preenchíveis (contenteditable,
// inputs, checkboxes) — no sistema interno isso é proposital. No portal, o cliente só
// pode VISUALIZAR: aqui o documento do iframe (mesmo-origin, então acessível pelo pai)
// é travado após o load. É a camada visual; a trava de dados está em storage.ts e
// public/sb-storage.js (papel 'cliente' nunca escreve no banco).
//
// A trava é reaplicada por MutationObserver porque os templates montam conteúdo depois
// do DOMContentLoaded (injeção de dados, páginas de fotos, assinaturas).

const CSS_TRAVA = `
  [contenteditable] { -webkit-user-modify: read-only !important; user-modify: read-only !important; caret-color: transparent !important; }
  input, textarea, select, button { pointer-events: none !important; }
`;

const EVENTOS_BLOQUEADOS = ['beforeinput', 'keydown', 'keypress', 'paste', 'cut', 'drop', 'dragstart'];

function travarElementos(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    if (el.getAttribute('contenteditable') !== 'false') el.setAttribute('contenteditable', 'false');
  });
  doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
    el.readOnly = true;
  });
}

// Trava um iframe já carregado. Devolve a função de limpeza (desliga o observer).
function travarDocumento(doc: Document): () => void {
  try {
    doc.designMode = 'off';
  } catch {
    // alguns documentos recusam designMode; o resto da trava cobre
  }

  if (!doc.getElementById('portal-somente-leitura')) {
    const estilo = doc.createElement('style');
    estilo.id = 'portal-somente-leitura';
    estilo.textContent = CSS_TRAVA;
    (doc.head ?? doc.documentElement).appendChild(estilo);
  }

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

// Trava o iframe agora (se já carregou) e a cada novo load. Devolve a limpeza.
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
