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
  // Chamado quando o usuário efetivamente FECHA este aviso (clique em "Fechar", clique fora
  // ou Esc) — não quando ele é apenas emitido. Existe para consumir "flags de já mostrado"
  // (ex.: sucessoPendente da assinatura) só depois que o usuário teve chance de ler, em vez
  // de zerar a flag no mesmo instante em que o modal aparece na tela. Opcional: quem não
  // precisa desse gancho simplesmente não passa nada.
  aoFechar?: () => void;
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

/**
 * Espelho local da assinatura mudou (gravado/limpo em services/assinatura.ts). Existe para a
 * BarraAssinatura reagir: ela lia o localStorage só no render, então quando o polling do
 * ModalAssinatura confirmava o pagamento a barra vermelha continuava na tela até o usuário
 * navegar ou dar F5 — logo depois de pagar, que é o pior momento para parecer que não liberou.
 */
const EVENTO_ASSINATURA = 'nr13:assinatura-alterada';

export function emitirAssinaturaAlterada(): void {
  alvo.dispatchEvent(new Event(EVENTO_ASSINATURA));
}

export function assinarAssinaturaAlterada(cb: () => void): () => void {
  alvo.addEventListener(EVENTO_ASSINATURA, cb);
  return () => alvo.removeEventListener(EVENTO_ASSINATURA, cb);
}
