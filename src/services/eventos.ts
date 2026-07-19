/**
 * Barramento mínimo de eventos do app: avisa telas reativas (Dashboard, Vencimentos)
 * que algo foi salvo e o localStorage mudou, sem precisar de F5 nem depender só do
 * window 'focus' (que só cobre troca de aba/janela).
 */
const alvo = new EventTarget();
const EVENTO = 'nr13:dados-alterados';

export function emitirDadosAlterados(): void {
  alvo.dispatchEvent(new Event(EVENTO));
}

export function assinarDadosAlterados(cb: () => void): () => void {
  alvo.addEventListener(EVENTO, cb);
  return () => alvo.removeEventListener(EVENTO, cb);
}
