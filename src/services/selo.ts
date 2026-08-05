/**
 * Estado agregado da sincronização, para o selo fixo e a tela de Pendências.
 *
 * Os cinco estados do §9.2 do spec precisam ser visualmente distinguíveis. O
 * que a interface nunca pode fazer é dizer "salvo" para algo que não foi
 * persistido — foi essa mentira que fez o cliente perder 28 equipamentos sem
 * perceber.
 */
import type { EstadoItem, ItemFila } from './sync';

export type NivelSelo = 'ok' | 'pendente' | 'falha' | 'bloqueado';

export interface ResumoSelo {
  rotulo: string;
  nivel: NivelSelo;
  pendentes: number;
  falhas: number;
}

/** Estados que exigem decisão ou ação e não se resolvem sozinhos. */
const EXIGEM_ACAO: EstadoItem[] = ['falha_definitiva', 'conflito'];
/** Estados que ainda vão subir sem intervenção. */
const EM_TRANSITO: EstadoItem[] = ['aguardando', 'salvo_local'];

export function resumoSelo(itens: ItemFila[], bloqueado = false): ResumoSelo {
  const falhas = itens.filter((i) => EXIGEM_ACAO.includes(i.estado)).length;
  const pendentes = itens.filter((i) => EM_TRANSITO.includes(i.estado)).length;

  // "Bloqueado" domina: o usuário precisa saber que o que ele digitar agora
  // NÃO será salvo, antes de digitar.
  if (bloqueado) {
    return { rotulo: 'Somente leitura', nivel: 'bloqueado', pendentes, falhas };
  }
  if (falhas > 0) {
    return {
      rotulo: `${falhas} ${falhas === 1 ? 'falha' : 'falhas'}`,
      nivel: 'falha',
      pendentes,
      falhas,
    };
  }
  if (pendentes > 0) {
    return {
      rotulo: `${pendentes} ${pendentes === 1 ? 'pendência' : 'pendências'}`,
      nivel: 'pendente',
      pendentes,
      falhas,
    };
  }
  return { rotulo: 'Tudo salvo', nivel: 'ok', pendentes: 0, falhas: 0 };
}

/** Rótulo por item, para a lista de Pendências. */
export function rotuloEstado(estado: EstadoItem): string {
  switch (estado) {
    case 'salvo_local':
      return 'Salvo no aparelho';
    case 'aguardando':
      return 'Aguardando envio';
    case 'sincronizado':
      return 'Sincronizado';
    case 'falha_definitiva':
      return 'Falhou';
    case 'conflito':
      return 'Precisa de decisão';
  }
}

/**
 * Uma pendência é considerada VELHA depois de uma hora. Não é enfeite: quanto
 * mais tempo ela fica só no aparelho, maior a chance de o navegador despejar o
 * IndexedDB antes de ela subir — e aí o manifesto só consegue dizer que se
 * perdeu, não recuperá-la.
 */
export const LIMITE_PENDENCIA_VELHA_MS = 60 * 60 * 1000;

export function pendenciaVelha(criadoEm: string, agora = Date.now()): boolean {
  const t = new Date(criadoEm).getTime();
  if (!Number.isFinite(t)) return false;
  return agora - t > LIMITE_PENDENCIA_VELHA_MS;
}
