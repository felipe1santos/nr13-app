// Bloqueio de impressão fora do React (trial/assinatura suspensa). Duas frentes no documento
// PAI, NENHUMA das duas sozinha basta:
//
// (a) Ctrl+P/Cmd+P: intercepta o atalho e chama avisarBloqueioDocumentos() — conveniência,
//     mostra a tela de "assine para continuar" no lugar de a caixa de diálogo de impressão do
//     navegador simplesmente abrir sem explicação nenhuma.
// (b) Classe `bloqueio-impressao` no <html>, consumida pela regra @media print em
//     styles/forja.css: essa é a proteção real PARA O DOCUMENTO PAI. preventDefault() no
//     keydown só cobre o atalho de teclado *dentro desta aba*; o usuário ainda pode imprimir
//     pelo menu do navegador, por um atalho de outra extensão etc. — nenhum desses passa pelo
//     keydown, mas todos disparam o evento `print`, e é aí que a regra @media print entra.
//
// MAIS uma frente pros IFRAMES (fix round 1, 28/07 — achado da revisão): as folhas de
// relatório/prontuário são <iframe> apontando pra HTMLs standalone em
// public/arquivos-inspecao|prontuario/ — documento PRÓPRIO, <head> PRÓPRIO, sem o CSS do app
// e sem nenhuma lógica de bloqueio. As duas frentes acima NÃO alcançam esse conteúdo:
//   - o keydown do pai só ouve o documento pai; com o foco DENTRO do iframe (o caso normal —
//     o usuário está olhando a folha), o evento não sobe pra o documento pai e o Ctrl+P passa;
//   - a classe/regra do pai também só existe no pai, então "Imprimir Quadro" (menu de contexto
//     do Firefox, imprime só o <iframe> isolado) não é coberto.
// Os iframes são MESMA ORIGEM (mesmo raciocínio de src/features/portal/somenteLeituraDoc.ts,
// que trava os mesmos templates em somente-leitura pro Portal do Cliente): dá pra acessar
// `iframe.contentDocument` a partir do pai e injetar a MESMA trava lá dentro — estilo
// @media print + o listener de keydown, direto no documento do iframe. Um MutationObserver no
// <body> (mesma mecânica de "observar e reaplicar" do somenteLeituraDoc.ts, só que aqui
// observando o PAI pra achar iframes NOVOS — lá o observer roda dentro do iframe pra achar
// CONTEÚDO novo) pega os iframes que entram/saem conforme o usuário navega entre folhas: cada
// folha troca de `src`, então cada nova folha é um `load` novo que precisa da injeção de novo.
import { documentosBloqueados, avisarBloqueioDocumentos } from './trial';
import { assinarAssinaturaAlterada } from './eventos';

const CLASSE_BLOQUEIO = 'bloqueio-impressao';
const ESTILO_ID = 'nr13-bloqueio-impressao-estilo';

// Releitura periódica: o espelho da assinatura/trial pode mudar com a aba aberta e parada
// (ex.: trial zera o prazo, graça vence) sem nenhum evento explícito disparar — mesmo
// intervalo de releitura usado pela BarraAssinatura.
const RELEITURA_MS = 60_000;

// Mesma regra @media print de styles/forja.css, duplicada aqui DE PROPÓSITO: esta versão é
// injetada dentro de cada documento de iframe (que tem <head> próprio e não carrega o CSS do
// app) — não tem como "importar" o forja.css de lá. Se o texto do aviso mudar num lugar,
// mudar no outro também.
const CSS_BLOQUEIO_PRINT_IFRAME = `
@media print {
  html.${CLASSE_BLOQUEIO} body {
    visibility: hidden !important;
  }
  html.${CLASSE_BLOQUEIO} body::after {
    content: 'Impressão disponível somente para assinantes. Contrate o sistema para gerar e imprimir documentos.';
    visibility: visible !important;
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px;
    text-align: center;
    font-family: Arial, sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 1.6;
    color: #111;
  }
}
`;

function ehAtalhoImprimir(e: KeyboardEvent): boolean {
  // Ctrl+P (Windows/Linux) ou Cmd+P (Mac) — o único atalho de impressão de verdade que dá pra
  // interceptar a partir da página. Ctrl+Shift+P também bate nesta checagem (shiftKey não
  // entra de propósito), mas não é atalho de IMPRESSÃO em navegador nenhum (Firefox abre uma
  // janela privada, Chrome abre o command menu do DevTools) — e mesmo que fosse, combinações
  // tratadas pelo "chrome" do navegador não chegam como evento à página pra interceptar. Não
  // excluímos porque não precisa: a combinação nunca dispara impressão de verdade, então nunca
  // faz diferença estar (ou não) dentro deste `if`.
  const tecla = e.key?.toLowerCase();
  return tecla === 'p' && (e.ctrlKey || e.metaKey) && !e.altKey;
}

// Listener único (mesma referência de função) usado tanto no documento pai quanto injetado em
// cada iframe — permite `addEventListener` idempotente: registrar a mesma função duas vezes no
// mesmo documento não duplica a chamada.
function onKeyDownBloqueio(e: KeyboardEvent): void {
  if (!ehAtalhoImprimir(e)) return;
  if (!documentosBloqueados()) return; // assinante em dia: não intercepta nada
  e.preventDefault();
  avisarBloqueioDocumentos();
}

// Injeta a trava (estilo @media print + atalho de teclado) num documento same-origin — pai ou
// iframe. Idempotente: usa o id do <style> como marca pra não injetar duas vezes no reload.
function injetarTravaNoDocumento(doc: Document): void {
  if (!doc.getElementById(ESTILO_ID)) {
    const estilo = doc.createElement('style');
    estilo.id = ESTILO_ID;
    estilo.textContent = CSS_BLOQUEIO_PRINT_IFRAME;
    (doc.head ?? doc.documentElement).appendChild(estilo);
  }
  doc.addEventListener('keydown', onKeyDownBloqueio, true);
}

// Acha iframes dentro de um nó recém-adicionado ao DOM (ele mesmo, ou descendentes — um único
// append de subtree grande pode trazer várias folhas de uma vez, ex.: a lista inteira de
// documentos do relatório montando de uma vez).
function iframesEm(node: Node): HTMLIFrameElement[] {
  if (!(node instanceof Element)) return [];
  const proprio = node instanceof HTMLIFrameElement ? [node] : [];
  return [...proprio, ...Array.from(node.querySelectorAll<HTMLIFrameElement>('iframe'))];
}

/**
 * Instala o bloqueio de impressão (documento pai + iframes same-origin das folhas) e devolve a
 * função de limpeza (mesmo padrão dos outros listeners globais do projeto — ver
 * instalação/cleanup em Layout.tsx). Chamar uma vez, no mount do Layout: reage a mudanças do
 * espelho local (assinarAssinaturaAlterada), ao foco voltar para a aba e a um timer, exatamente
 * como a BarraAssinatura reage ao mesmo espelho — e a um MutationObserver que descobre novos
 * iframes conforme o usuário navega entre folhas/telas.
 *
 * IMPORTANTE (não quebrar o assinante em dia): a classe só entra em qualquer documento
 * (pai ou iframe) quando `documentosBloqueados()` é true. Para quem está em dia ela nunca é
 * aplicada, então nenhuma regra @media print correspondente ativa e o fluxo real de impressão
 * (printService/#print-root) segue 100% intacto.
 */
export function instalarBloqueioImpressao(): () => void {
  // Estado local à instalação (não módulo): cada chamada tem seu próprio rastro de documentos
  // vistos, então reinstalar (ex.: Layout desmonta e remonta) começa limpo.
  const documentosRastreados = new Set<Document>([document]);
  const iframesVistos = new WeakSet<HTMLIFrameElement>();

  const aplicarClasseEmTodos = () => {
    const bloqueado = documentosBloqueados();
    for (const doc of documentosRastreados) {
      if (!doc.defaultView) {
        // Documento morto (iframe navegou pra outra folha/desmontou) — tira da lista pra não
        // vazar memória numa sessão longa com muita navegação entre folhas.
        documentosRastreados.delete(doc);
        continue;
      }
      doc.documentElement.classList.toggle(CLASSE_BLOQUEIO, bloqueado);
    }
  };

  const rastrearIframe = (iframe: HTMLIFrameElement) => {
    if (iframesVistos.has(iframe)) return;
    iframesVistos.add(iframe);
    const aoCarregar = () => {
      const doc = iframe.contentDocument;
      if (!doc) return; // cross-origin (ex.: mapa do Google em Empresas.tsx) — nada a fazer
      injetarTravaNoDocumento(doc);
      documentosRastreados.add(doc);
      aplicarClasseEmTodos();
    };
    if (iframe.contentDocument?.readyState === 'complete') aoCarregar();
    iframe.addEventListener('load', aoCarregar);
  };

  aplicarClasseEmTodos();
  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(rastrearIframe);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => iframesEm(n).forEach(rastrearIframe));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('keydown', onKeyDownBloqueio);
  window.addEventListener('focus', aplicarClasseEmTodos);
  const cancelarEventoAssinatura = assinarAssinaturaAlterada(aplicarClasseEmTodos);
  const timer = window.setInterval(aplicarClasseEmTodos, RELEITURA_MS);

  return () => {
    window.removeEventListener('keydown', onKeyDownBloqueio);
    window.removeEventListener('focus', aplicarClasseEmTodos);
    cancelarEventoAssinatura();
    window.clearInterval(timer);
    observer.disconnect();
    for (const doc of documentosRastreados) {
      if (doc.defaultView) doc.documentElement.classList.remove(CLASSE_BLOQUEIO);
    }
  };
}
