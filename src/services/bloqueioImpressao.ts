// Bloqueio de impressão fora do React (trial/assinatura suspensa). Duas frentes, NENHUMA
// das duas sozinha basta:
//
// (a) Ctrl+P/Cmd+P/Ctrl+Shift+P: intercepta o atalho e chama avisarBloqueioDocumentos() —
//     conveniência, mostra a tela de "assine para continuar" no lugar de a caixa de diálogo
//     de impressão do navegador simplesmente abrir sem explicação nenhuma.
// (b) Classe `bloqueio-impressao` no <html>, consumida pela regra @media print em
//     styles/forja.css: essa é a proteção REAL. preventDefault() no keydown só cobre o atalho
//     de teclado *dentro desta aba*; o usuário ainda pode imprimir pelo menu do navegador,
//     por um atalho de outra extensão, ou por um /print de outra origem — nenhum desses passa
//     pelo keydown, mas todos disparam o evento `print` do navegador, e é aí que a regra
//     @media print entra e some com o conteúdo.
//
// IMPORTANTE (não quebrar o assinante em dia): a classe só entra quando `documentosBloqueados()`
// é true. Para quem está em dia ela nunca é aplicada, então a regra @media print correspondente
// nunca ativa e o fluxo real de impressão (printService/#print-root) segue 100% intacto.
import { documentosBloqueados, avisarBloqueioDocumentos } from './trial';
import { assinarAssinaturaAlterada } from './eventos';

const CLASSE_BLOQUEIO = 'bloqueio-impressao';

// Releitura periódica: o espelho da assinatura/trial pode mudar com a aba aberta e parada
// (ex.: trial zera o prazo, graça vence) sem nenhum evento explícito disparar — mesmo
// intervalo de releitura usado pela BarraAssinatura.
const RELEITURA_MS = 60_000;

function aplicarClasse(): void {
  document.documentElement.classList.toggle(CLASSE_BLOQUEIO, documentosBloqueados());
}

function ehAtalhoImprimir(e: KeyboardEvent): boolean {
  // Ctrl+P (Windows/Linux) ou Cmd+P (Mac); Ctrl+Shift+P (imprimir "mais opções" em alguns
  // navegadores) também cai aqui — shiftKey não entra na checagem de propósito.
  const tecla = e.key?.toLowerCase();
  return tecla === 'p' && (e.ctrlKey || e.metaKey) && !e.altKey;
}

/**
 * Instala o bloqueio de impressão e devolve a função de limpeza (mesmo padrão dos outros
 * listeners globais do projeto — ver instalação/cleanup em Layout.tsx). Chamar uma vez, no
 * mount do Layout: reage a mudanças do espelho local (assinarAssinaturaAlterada), ao foco
 * voltar para a aba e a um timer, exatamente como a BarraAssinatura reage ao mesmo espelho.
 */
export function instalarBloqueioImpressao(): () => void {
  aplicarClasse();

  const onKeyDown = (e: KeyboardEvent) => {
    if (!ehAtalhoImprimir(e)) return;
    if (!documentosBloqueados()) return; // assinante em dia: não intercepta nada
    e.preventDefault();
    avisarBloqueioDocumentos();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('focus', aplicarClasse);
  const cancelarEventoAssinatura = assinarAssinaturaAlterada(aplicarClasse);
  const timer = window.setInterval(aplicarClasse, RELEITURA_MS);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('focus', aplicarClasse);
    cancelarEventoAssinatura();
    window.clearInterval(timer);
    document.documentElement.classList.remove(CLASSE_BLOQUEIO);
  };
}
