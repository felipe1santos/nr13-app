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
  /** E-mail do checkout. Também serve de marcação manual — ver `ehClienteKiwify`. */
  kiwify_email?: string | null;
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

  const semPrazo = !c.acesso_expira_em && !c.assinatura_ate;
  if (!ehClienteKiwify(c) && semPrazo) return 'cortesia';

  return 'pagante';
}

/**
 * A conta tem vínculo com a Kiwify?
 *
 * `kiwify_email` conta junto com `kiwify_subscription_id` porque, enquanto o
 * webhook não grava o id (pendência 0.4 do PENDENCIAS.md — em 01/09/2026 ele
 * está NULO em todas as contas), o `kiwify_email` é o que o painel grava ao
 * marcar uma conta como pagante à mão.
 *
 * **Por que a marcação usa esse campo e não outro:** `kiwify_email` é
 * informativo — nenhum gate de acesso o consulta. `assinatura_ate` e
 * `acesso_expira_em` consultam: gravar uma data ali para "marcar pagante"
 * poderia deixar um cliente somente-leitura no dia em que essa data vencesse.
 * E o campo ainda tem um efeito colateral bom: é por e-mail que o webhook
 * procura o perfil, então preenchê-lo aumenta a chance de um pagamento futuro
 * casar sozinho.
 *
 * Caso real: `engyuricesar@gmail.com` tem assinatura ATIVA na Kiwify desde
 * 04/08/2026 e, sem `kiwify_subscription_id` nem prazo gravado, era
 * classificado como "Vitalícia" e ficava fora do MRR.
 */
function ehClienteKiwify(c: ContaClassificavel): boolean {
  return !!c.kiwify_subscription_id?.trim() || !!c.kiwify_email?.trim();
}

export const ROTULO_TIPO: Record<TipoConta, string> = {
  pagante: 'Pagante',
  cortesia: 'Vitalícia',
  interna: 'Interna',
  inativa: 'Sem acesso',
};

// ── TAG MANUAL DO PAINEL (21/09/2026) ───────────────────────────────────────

/**
 * As tags que o dono escolhe na tela, gravadas em `profiles.classificacao`.
 *
 * Elas existem porque a derivação não consegue responder tudo: "pagante" e
 * "vitalício" têm exatamente os mesmos campos no banco (plano completo, sem
 * vencimento), e só o dono sabe qual é qual. Enquanto isso era deduzido, uma
 * cortesia entrava no MRR — ou um cliente real ficava fora dele.
 */
export type TagConta = 'pagante' | 'vitalicio' | 'interna' | 'suspenso';

export const TAGS: readonly TagConta[] = ['pagante', 'vitalicio', 'interna', 'suspenso'];

export const ROTULO_TAG: Record<TagConta, string> = {
  pagante: 'Pagante',
  vitalicio: 'Vitalício',
  interna: 'Interna',
  suspenso: 'Suspenso',
};

/** Só o pagante entra na soma — as outras três aparecem e não somam. */
export function tagSomaNoFaturamento(tag: TagConta): boolean {
  return tag === 'pagante';
}

/** Da classificação derivada para a tag da tela. */
const TAG_DO_TIPO: Record<TipoConta, TagConta> = {
  pagante: 'pagante',
  cortesia: 'vitalicio',
  interna: 'interna',
  inativa: 'suspenso',
};

function tagValida(v: unknown): TagConta | null {
  const t = String(v ?? '').trim().toLowerCase();
  return (TAGS as readonly string[]).includes(t) ? (t as TagConta) : null;
}

/**
 * A tag EFETIVA de uma conta: a escolhida à mão, ou a derivada.
 *
 * A manual vence sempre — é uma decisão do dono sobre o próprio negócio, e o
 * sistema não tem como saber mais do que ele sobre isso. Sem marcação, o
 * comportamento é exatamente o de antes desta camada existir, então nenhuma
 * conta muda de balde só porque a coluna passou a existir.
 */
export function tagDaConta(
  c: ContaClassificavel & { classificacao?: string | null },
): TagConta {
  return tagValida(c.classificacao) ?? TAG_DO_TIPO[classificarConta(c)];
}

/** A tag foi escolhida à mão, ou está sendo deduzida? (a tela mostra a diferença) */
export function tagEhManual(c: { classificacao?: string | null }): boolean {
  return tagValida(c.classificacao) !== null;
}

/**
 * A mensalidade daquela conta, em reais.
 *
 * `valor_mensal` nulo é "não informado", e aí vale o padrão do painel — nunca
 * zero: zerar em silêncio faria o MRR encolher sem ninguém mexer em preço.
 * Conta que não soma (vitalício, interna, suspenso) vale 0 por definição.
 */
export function mensalidadeDaConta(
  c: { valor_mensal?: number | string | null; classificacao?: string | null } & ContaClassificavel,
  padrao: number,
): number {
  if (!tagSomaNoFaturamento(tagDaConta(c))) return 0;
  const n = Number(c.valor_mensal);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/** O MRR real: a soma das mensalidades de quem paga. */
export function somarMensalidades(
  contas: (ContaClassificavel & { valor_mensal?: number | string | null; classificacao?: string | null })[],
  padrao: number,
): { pagantes: number; mrr: number } {
  const pagantes = contas.filter((c) => tagSomaNoFaturamento(tagDaConta(c)));
  return {
    pagantes: pagantes.length,
    mrr: pagantes.reduce((s, c) => s + mensalidadeDaConta(c, padrao), 0),
  };
}
