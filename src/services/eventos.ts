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

/** Aviso visual global (bloqueio, sucesso). Emitido por serviços que não são React. */
export interface Aviso {
  variante: 'sucesso' | 'alerta' | 'erro';
  titulo: string;
  texto: string;
  acao?: { rotulo: string; aoClicar: () => void };
}

const EVENTO_AVISO = 'nr13:aviso';

export function emitirAviso(aviso: Aviso): void {
  alvo.dispatchEvent(new CustomEvent<Aviso>(EVENTO_AVISO, { detail: aviso }));
}

export function assinarAviso(cb: (a: Aviso) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Aviso>).detail);
  alvo.addEventListener(EVENTO_AVISO, handler);
  return () => alvo.removeEventListener(EVENTO_AVISO, handler);
}
