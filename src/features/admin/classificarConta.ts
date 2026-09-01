/**
 * Classificação das contas para o painel de Faturamento.
 *
 * ─── POR QUE ISSO PRECISA EXISTIR ───────────────────────────────────────────
 *
 * "Conta liberada e vigente" NÃO é o mesmo que "conta que paga". Medido na
 * Kiwify em 01/09/2026: das 7 assinaturas ativas da conta, só 3 são do produto
 * NR13-Solutions (engyuricesar, cmam.caldeiras, adm@gyncal) — as outras 4 são
 * de outros produtos do mesmo vendedor. E dentro do sistema existem ainda:
 *
 *  · uma conta VITALÍCIA, liberada pelo Admin sem cobrança;
 *  · a conta interna do dono (`teste@gmail.com`), usada para entrar no sistema
 *    como se fosse um usuário comum.
 *
 * Contar as cinco como assinante daria MRR de R$ 985 onde entram R$ 591. Um
 * painel de receita que arredonda para cima é pior que nenhum painel.
 *
 * ─── E POR QUE NÃO SE APAGA NENHUMA DELAS ───────────────────────────────────
 *
 * Classificar não é excluir. A conta interna e a vitalícia continuam inteiras
 * no banco, seguem aparecendo nas abas de gestão, e o painel mostra em qual
 * balde cada uma caiu. O filtro é sobre a SOMA, não sobre o dado.
 */

/**
 * Contas do próprio dono do produto, que existem para usar o sistema por
 * dentro. Não são clientes e não entram em contagem nenhuma de receita.
 *
 * Fica em código, e não em `config_global`, porque é uma lista de duas linhas
 * que muda de ano em ano: uma tabela nova exigiria migração, RLS e uma tela de
 * edição para guardar um dado que o próximo leitor precisa enxergar aqui de
 * qualquer forma. Se um dia crescer, vira config.
 */
export const CONTAS_INTERNAS: readonly string[] = ['teste@gmail.com'];

export type TipoConta = 'pagante' | 'cortesia' | 'interna' | 'inativa';

/** Só os campos que a classificação lê. */
export interface ContaClassificavel {
  email: string | null;
  ativo: boolean;
  role: string;
  plano: string | null;
  acesso_expira_em: string | null;
  assinatura_ate?: string | null;
  kiwify_subscription_id?: string | null;
}

/**
 * Em qual balde a conta cai.
 *
 * A ordem dos testes é a regra, e não é intercambiável:
 *
 * 1. **interna** — e-mail da lista ou `role = 'admin'`. Vem primeiro porque uma
 *    conta interna também está ativa e vigente; testar vigência antes a
 *    classificaria como pagante.
 * 2. **inativa** — bloqueada, em trial, ou com prazo vencido. Mesma regra de
 *    `ehPagante` no Admin.tsx, e é o que separa cliente de lead.
 * 3. **cortesia** — vigente, sem assinatura na Kiwify e SEM VENCIMENTO nenhum.
 *    Essa combinação só acontece por liberação manual do Admin (§11 do
 *    CLAUDE.md: `assinatura_ate` nulo = conta vitalícia).
 * 4. **pagante** — o resto: vigente e com assinatura ou com prazo, ou seja,
 *    alguém pagou por aquilo em algum momento.
 *
 * LIMITE CONHECIDO: um cliente da Kiwify cujo webhook nunca tenha gravado
 * `kiwify_subscription_id` NEM `acesso_expira_em` cairia em `cortesia` e
 * sumiria do MRR. Por isso a tabela do painel mostra o tipo de cada linha em
 * vez de só somar — um erro de classificação fica visível na tela, não
 * escondido dentro do total.
 */
export function classificarConta(c: ContaClassificavel): TipoConta {
  const email = (c.email ?? '').trim().toLowerCase();
  if (c.role === 'admin') return 'interna';
  if (CONTAS_INTERNAS.includes(email)) return 'interna';

  if (!c.ativo) return 'inativa';
  if (c.plano === 'trial') return 'inativa';
  const venceu = c.acesso_expira_em && new Date(c.acesso_expira_em).getTime() < Date.now();
  if (venceu) return 'inativa';

  const temAssinatura = !!c.kiwify_subscription_id;
  const semPrazo = !c.acesso_expira_em && !c.assinatura_ate;
  if (!temAssinatura && semPrazo) return 'cortesia';

  return 'pagante';
}

export const ROTULO_TIPO: Record<TipoConta, string> = {
  pagante: 'Pagante',
  cortesia: 'Vitalícia',
  interna: 'Interna',
  inativa: 'Sem acesso',
};
