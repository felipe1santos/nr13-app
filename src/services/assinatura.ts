// Espelho LOCAL do status da assinatura, só para desenhar a UI e cortar ações no bundle.
// Quem decide de verdade é o Postgres (assinatura_permite_escrita na RLS): se o espelho
// mentir, a escrita é recusada no servidor do mesmo jeito.
// IMPORTANTE: este módulo NÃO pode importar `./auth` (auth.ts já importa `./storage`;
// um import de volta para auth criaria ciclo auth -> assinatura -> auth).
import { statusEfetivo, type EstadoAssinatura, type StatusAssinatura } from '../features/assinatura/maquinaEstados';

const CHAVE_STATUS = 'nr13_assinatura_status';
const CHAVE_ATE = 'nr13_assinatura_ate';
const CHAVE_SUCESSO = 'nr13_assinatura_sucesso_pendente';

export function gravarEstadoLocal(estado: EstadoAssinatura): void {
  localStorage.setItem(CHAVE_STATUS, estado.status);
  if (estado.ate) localStorage.setItem(CHAVE_ATE, estado.ate);
  else localStorage.removeItem(CHAVE_ATE);
}

export function assinaturaAte(): string | null {
  return localStorage.getItem(CHAVE_ATE);
}

export function statusAssinaturaLocal(): StatusAssinatura {
  // Ausência de dado = conta antiga/servidor sem a migração: não trava ninguém.
  const bruto = localStorage.getItem(CHAVE_STATUS) as StatusAssinatura | null;
  if (!bruto) return 'ativa';
  return statusEfetivo({ status: bruto, ate: assinaturaAte() }, new Date());
}

export function podeEscreverAssinatura(): boolean {
  return statusAssinaturaLocal() !== 'somente_leitura';
}

export function textoBloqueio(): string {
  switch (statusAssinaturaLocal()) {
    case 'graca':
      return 'A cobrança no seu cartão não foi aprovada. Regularize para não perder o acesso.';
    case 'cancelada_no_prazo':
      return 'Sua assinatura foi cancelada e o acesso termina no fim do período já pago.';
    case 'trial':
      return 'Este recurso fica disponível após a contratação do sistema.';
    default:
      return 'Sua assinatura está suspensa. Regularize o pagamento para voltar a salvar, imprimir e gerar documentos.';
  }
}

/** Marca que a próxima abertura deve exibir o modal verde de "assinatura confirmada". */
export function marcarSucessoPendente(): void {
  localStorage.setItem(CHAVE_SUCESSO, '1');
}

export function sucessoPendente(): boolean {
  return localStorage.getItem(CHAVE_SUCESSO) === '1';
}

export function marcarSucessoExibido(): void {
  localStorage.removeItem(CHAVE_SUCESSO);
}
