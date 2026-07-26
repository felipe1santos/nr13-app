// Regra de negócio da assinatura, sem I/O: a mesma função decide o estado no
// front (espelho) e no webhook (Edge Function). Testável isoladamente.

export type StatusAssinatura =
  | 'trial'
  | 'ativa'
  | 'graca'
  | 'cancelada_no_prazo'
  | 'somente_leitura';

export type EventoKiwify =
  | 'compra_aprovada'
  | 'subscription_renewed'
  | 'subscription_late'
  | 'subscription_canceled'
  | 'compra_reembolsada'
  | 'chargeback';

/** `ate` = fim do período pago (ISO). `null` = sem vencimento (conta vitalícia/liberada na mão). */
export interface EstadoAssinatura {
  status: StatusAssinatura;
  ate: string | null;
}

export const DIAS_CICLO = 30;
/** Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar. */
export const DIAS_GRACA = 5;

// Exportada (Task 10): o painel Admin reusa para calcular a nova validade ao vincular
// manualmente um evento Kiwify órfão a um usuário — mesma regra de "30 dias corridos"
// usada pelo webhook, sem duplicar a conta em outro lugar.
export function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

function futuro(ate: string | null, agora: Date): boolean {
  if (ate === null) return true;
  const t = new Date(ate).getTime();
  return Number.isFinite(t) && t > agora.getTime();
}

export function aplicarEvento(
  atual: EstadoAssinatura,
  evento: EventoKiwify,
  agora: Date,
): EstadoAssinatura {
  switch (evento) {
    case 'compra_aprovada':
    case 'subscription_renewed':
      return { status: 'ativa', ate: somarDias(agora, DIAS_CICLO) };
    case 'subscription_late':
      return { status: 'graca', ate: somarDias(agora, DIAS_GRACA) };
    case 'subscription_canceled':
      // Cancelou: usa o que já pagou. Sem período restante, bloqueia agora.
      return futuro(atual.ate, agora)
        ? { status: 'cancelada_no_prazo', ate: atual.ate }
        : { status: 'somente_leitura', ate: atual.ate };
    case 'chargeback':
    case 'compra_reembolsada':
      // Dinheiro devolvido: corta na hora, ignorando período pago.
      return { status: 'somente_leitura', ate: agora.toISOString() };
  }
}

/** Por que a entrada foi barrada, ou `null` quando a conta pode entrar. */
export type MotivoBloqueioEntrada = 'inativo' | 'expirado';

export interface ContaParaEntrada {
  /** `profiles.ativo` — liberação/bloqueio manual pelo Admin. */
  ativo: boolean;
  /** `profiles.acesso_expira_em` — validade LEGADA (trial 48h, prazo definido na mão). */
  acessoExpiraEm: string | null;
  /** `''`/`null` = servidor sem a migração da assinatura → vale o gate legado por data. */
  assinaturaStatus: StatusAssinatura | '' | null;
}

/**
 * Decide se a conta ENTRA no app (achado C2 da revisão final).
 *
 * O produto vende "somente leitura sem deslogar": conta sem assinatura em dia entra, vê tudo
 * e é travada na ESCRITA (RLS no servidor + espelho na UI). O gate antigo barrava por
 * `acesso_expira_em` e derrubava exatamente quem deveria ver a barra vermelha e o botão de
 * pagar — e ainda expulsava cliente adimplente quando o webhook de renovação atrasava horas.
 *
 * Regra: `ativo=false` (bloqueio manual do Admin) sempre barra. Tendo assinatura conhecida
 * (qualquer status, inclusive `somente_leitura`), a conta ENTRA e degrada — quem manda na
 * escrita é `assinatura_permite_escrita()` no Postgres. Sem status de assinatura (banco sem a
 * migração), mantém o comportamento LEGADO: expirou pela data, não entra.
 *
 * Data inválida é tratada como expirada (fail-closed), igual a `statusEfetivo`.
 */
export function bloqueioEntrada(conta: ContaParaEntrada, agora: Date): MotivoBloqueioEntrada | null {
  if (!conta.ativo) return 'inativo';
  if (conta.assinaturaStatus) return null;
  return futuro(conta.acessoExpiraEm, agora) ? null : 'expirado';
}

export function statusEfetivo(estado: EstadoAssinatura, agora: Date): StatusAssinatura {
  if (estado.status === 'somente_leitura') return 'somente_leitura';
  return futuro(estado.ate, agora) ? estado.status : 'somente_leitura';
}

/** Campos de `profiles` gravados por `camposVinculoManual` — ver comentário da função abaixo. */
export interface CamposVinculoManual {
  assinatura_status: StatusAssinatura;
  assinatura_ate: string;
  kiwify_email: string | null;
  kiwify_subscription_id: string | null;
  ativo: true;
  plano: 'completo';
  acesso_expira_em: string;
}

/**
 * Campos gravados em `profiles` ao vincular MANUALMENTE (painel Admin, Task 10) um evento Kiwify
 * órfão a uma conta. Extraída para função pura (fix round 1, achado CRITICAL 1) depois de um bug
 * em que o handler gravava só `assinatura_status`/`assinatura_ate`/`kiwify_email` — o gate real de
 * login (`login()` em src/services/auth.ts) usa as colunas LEGADAS `ativo`/`acesso_expira_em`
 * (e `plano` para a mensagem de "período de teste terminou"), então uma conta de trial vencida
 * que pagasse com e-mail diferente do cadastro continuava barrada mesmo com o painel mostrando
 * "Ativa" — a ação parecia ter funcionado e não tinha destravado nada.
 *
 * Espelha o passo 6 do webhook (`supabase/functions/kiwify_webhook/index.ts`, que grava os dois
 * mundos juntos a cada evento) nos campos em comum — `assinatura_status`/`ate`,
 * `kiwify_email`/`kiwify_subscription_id`, `plano`, `acesso_expira_em` — e ACRESCENTA
 * `ativo: true`: o vínculo manual pode ser exatamente a forma de destravar uma conta que o admin
 * bloqueou antes (ver `liberarAcessoCompleto` em Admin.tsx, mesmo padrão de "liberar tudo junto");
 * o webhook não precisa tocar em `ativo` porque só processa contas que o fluxo normal (cadastro/
 * trial) já deixou ativas. `plano` sempre vira `'completo'` aqui (diferente do webhook, que também
 * pode gravar `'expirado'` para eventos de bloqueio) porque o vínculo manual só existe para o
 * caminho de ATIVAR uma assinatura — não há tela de "desvincular" nesta task.
 */
export function camposVinculoManual(
  agora: Date,
  emailEvento: string | null,
  subscriptionId: string | null,
): CamposVinculoManual {
  const ate = somarDias(agora, DIAS_CICLO);
  return {
    assinatura_status: 'ativa',
    assinatura_ate: ate,
    kiwify_email: emailEvento,
    kiwify_subscription_id: subscriptionId,
    ativo: true,
    plano: 'completo',
    acesso_expira_em: ate,
  };
}
