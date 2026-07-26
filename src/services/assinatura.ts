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

/**
 * Limpa o espelho local inteiro (status, validade e "sucesso pendente"). Chamada por
 * carregarPerfil() (auth.ts) sempre que o perfil recém-carregado NÃO trouxe assinatura_status
 * (coluna ausente pré-migração, ou conta sem assinatura registrada) e por encerrarSessaoLocal()
 * no logout explícito.
 *
 * Por que também no login (não só no logout): em computador compartilhado, se a conta A ficar
 * bloqueada e a aba for fechada sem clicar "Sair", encerrarSessaoLocal() nunca roda — o espelho
 * de A sobrevive no localStorage. Sem esta chamada, a conta B logaria e herdaria o
 * 'somente_leitura' de A. Chamar aqui fecha o buraco em TODO login, com ou sem logout anterior.
 *
 * Por que sucesso_pendente também entra: essa flag só faz sentido para uma conta que TEM
 * assinatura_status no servidor (é setada em reação a um evento de pagamento real); se o
 * perfil carregado não tem a coluna, um "sucesso pendente" guardado só pode ser resíduo de
 * outra conta no mesmo navegador — nunca um caso legítimo desta conta.
 */
export function limparEstadoLocal(): void {
  localStorage.removeItem(CHAVE_STATUS);
  localStorage.removeItem(CHAVE_ATE);
  localStorage.removeItem(CHAVE_SUCESSO);
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
