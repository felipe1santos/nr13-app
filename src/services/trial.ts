// Período de teste (trial 48h): contagem regressiva e bloqueios de recurso.
// A validade real é do SERVIDOR (profiles.acesso_expira_em + RLS acesso_vigente);
// aqui só se lê o espelho local para UI e para cortar as ações no bundle.
import { isTrial, verificarAcesso } from './auth';
import { emitirAviso } from './eventos';
import { podeEscreverAssinatura, textoBloqueio } from './assinatura';

export const MSG_BLOQUEIO_DOCS =
  'Download e impressão estão disponíveis somente após a contratação do sistema.';
export const MSG_BLOQUEIO_IMPORTACAO =
  'Importação de planilha disponível somente para assinantes.';

// Milissegundos até o fim do teste; null se a conta não é trial ou não tem prazo.
export function msRestantesTrial(): number | null {
  if (!isTrial()) return null;
  const fim = localStorage.getItem('nr13_acesso_expira_em');
  if (!fim) return null;
  const t = new Date(fim).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - Date.now());
}

// Mensagem de bloqueio para geração/baixa/impressão de documentos, ou null se liberado.
export function bloqueioTrialDocs(): string | null {
  return isTrial() ? MSG_BLOQUEIO_DOCS : null;
}

// Mensagem de bloqueio para importação de planilha, ou null se liberado.
export function bloqueioTrialImportacao(): string | null {
  return isTrial() ? MSG_BLOQUEIO_IMPORTACAO : null;
}

// "1 dia, 08h 32m 15s" — usada na barra de contagem regressiva.
export function formatarContagem(ms: number): string {
  const totalSeg = Math.floor(ms / 1000);
  const dias = Math.floor(totalSeg / 86400);
  const horas = Math.floor((totalSeg % 86400) / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  const dd = dias === 1 ? '1 dia' : `${dias} dias`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dd}, ${pad(horas)}h ${pad(min)}m ${pad(seg)}s`;
}

/**
 * Funil ÚNICO de bloqueio de documentos (PDF, impressão, download). Devolve true
 * quando bloqueou — quem chama só precisa dar `return`. Cobre trial e assinatura
 * suspensa com a mesma tela (ModalAviso), no lugar dos window.alert() de antes.
 */
export function avisarBloqueioDocumentos(): boolean {
  const bloqueioTrial = bloqueioTrialDocs();
  if (bloqueioTrial) {
    emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: bloqueioTrial });
    return true;
  }
  if (!podeEscreverAssinatura()) {
    emitirAviso({ variante: 'erro', titulo: 'Assinatura suspensa', texto: textoBloqueio() });
    return true;
  }
  return false;
}

// Chamada quando o contador zera: o servidor decide (verificarAcesso faz logout
// se o perfil expirou de verdade — relógio local adiantado não derruba ninguém).
let verificando = false;
export async function verificarExpiracaoTrial(): Promise<boolean> {
  if (verificando) return true;
  verificando = true;
  try {
    const r = await verificarAcesso();
    return r.ativo;
  } finally {
    verificando = false;
  }
}
