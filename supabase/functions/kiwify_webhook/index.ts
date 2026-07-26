// Recebe os webhooks de venda da Kiwify e aplica o estado da assinatura.
// Deploy: Supabase Dashboard → Edge Functions → nome "kiwify_webhook".
// URL cadastrada na Kiwify: https://<projeto>.supabase.co/functions/v1/kiwify_webhook?s=<segredo>
//
// Segredo na query porque a Kiwify NÃO documenta assinatura HMAC para eventos de venda.
// A lógica de transição espelha src/features/assinatura/maquinaEstados.ts — ao mudar uma,
// mudar a outra (Deno não importa de src/). Um teste de consistência
// (src/features/assinatura/__tests__/consistenciaEdge.test.ts) lê este arquivo do disco e
// falha se as constantes ou os 6 eventos abaixo divergirem do módulo puro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extrairDados, type EventoKiwify } from './parser.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DIAS_CICLO = 30;
// Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar.
const DIAS_GRACA = 5;

function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

function futuro(ate: string | null, agora: Date): boolean {
  if (!ate) return true;
  const t = new Date(ate).getTime();
  return Number.isFinite(t) && t > agora.getTime();
}

function aplicarEvento(
  atual: { status: string; ate: string | null },
  evento: EventoKiwify,
  agora: Date,
): { status: string; ate: string | null } {
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
    default:
      return { status: 'somente_leitura', ate: agora.toISOString() };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Segredo da URL
  const url = new URL(req.url);
  const { data: cfg } = await admin
    .from('config_global')
    .select('valor')
    .eq('chave', 'kiwify_webhook_segredo')
    .maybeSingle();
  const segredo = (cfg?.valor as { segredo?: string } | null)?.segredo ?? '';
  if (!segredo || url.searchParams.get('s') !== segredo) {
    return new Response('Não autorizado', { status: 401 });
  }

  // 2. Corpo (nunca confiar no formato)
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = { _corpo_invalido: true };
  }
  const dados = extrairDados(payload);

  // 3. Acha a conta: e-mail da compra, ou sck (= id do usuário no Supabase)
  let profileId: string | null = null;
  let atual = { status: 'trial', ate: null as string | null };

  if (dados.sck) {
    const { data } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .eq('id', dados.sck)
      .maybeSingle();
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }
  if (!profileId && dados.email) {
    const { data } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .ilike('email', dados.email)
      .maybeSingle();
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }

  // 4. Registra SEMPRE — inclusive órfão e evento desconhecido (auditoria/reprocesso)
  const podeProcessar = !!profileId && !!dados.evento;
  const { data: jaExiste } = await admin
    .from('kiwify_eventos')
    .select('id')
    .eq('evento', dados.evento ?? '')
    .eq('subscription_id', dados.subscriptionId ?? '')
    .eq('processado', true)
    .gte('recebido_em', new Date(Date.now() - 60_000).toISOString())
    .maybeSingle();

  await admin.from('kiwify_eventos').insert({
    evento: dados.evento ?? 'desconhecido',
    payload: payload as Record<string, unknown>,
    email: dados.email,
    subscription_id: dados.subscriptionId,
    profile_id: profileId,
    processado: podeProcessar && !jaExiste,
    erro: podeProcessar ? (jaExiste ? 'duplicado, ignorado' : null) : 'conta não identificada ou evento fora do escopo',
  });

  // 5. Aplica o estado (idempotente: duplicado em <60s não reprocessa)
  if (podeProcessar && !jaExiste) {
    const novo = aplicarEvento(atual, dados.evento as EventoKiwify, new Date());
    await admin
      .from('profiles')
      .update({
        assinatura_status: novo.status,
        assinatura_ate: novo.ate,
        kiwify_subscription_id: dados.subscriptionId,
        kiwify_email: dados.email,
        // Mantém a coluna legada coerente para o painel Admin e os gates antigos.
        plano: novo.status === 'somente_leitura' ? 'expirado' : 'completo',
        acesso_expira_em: novo.ate,
      })
      .eq('id', profileId as string);
  }

  // 200 sempre que registramos: erro faria a Kiwify reenviar em looping.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
