// Purga automática dos dados de contas de teste que não viraram cliente.
//
// Deploy: Supabase Dashboard → Edge Functions → nome "purga_trial".
// Agendamento: Dashboard → Integrations → Cron, chamando
//   https://<projeto>.supabase.co/functions/v1/purga_trial?s=<segredo>
//
// POR QUE UMA EDGE FUNCTION E NÃO SÓ UM CRON DE SQL: o cron do Postgres executa
// e some — sem resposta, sem corpo, sem lugar para olhar quando alguém
// perguntar "o que foi apagado ontem?". Aqui cada execução devolve a lista de
// contas e quantas linhas saíram de cada uma, e isso fica nos logs da função.
// Numa rotina que APAGA dado de cliente, o rastro não é luxo.
//
// SEGURANÇA: o trabalho pesado está na RPC `purgar_dados_trial`, que exige
// service_role e é inalcançável pelo app. Esta função é só o gatilho, e mesmo
// assim é protegida por segredo na query — igual ao kiwify_webhook, pelo mesmo
// motivo: quem agenda (o cron) não manda Authorization.
//
// MODO SIMULAÇÃO: `?dry=1` devolve quem SERIA apagado sem apagar nada. É o
// caminho recomendado depois de qualquer mudança no critério.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/**
 * Segredo em VARIÁVEL DE AMBIENTE, não em `config_global`.
 *
 * A primeira versão guardava em `config_global`, como o kiwify_webhook. Medido
 * em 11/08/2026: qualquer conta logada — inclusive um trial — lia o valor. A
 * policy daquela tabela esconde `kiwify_webhook_segredo` por NOME, e uma chave
 * nova simplesmente não estava na lista. Um segredo que protege uma rotina de
 * EXCLUSÃO não pode depender de alguém lembrar de acrescentar o nome numa
 * policy.
 *
 * Aqui ele fica em Edge Functions → Secrets: o app não tem como ler, com ou sem
 * policy.
 */
const SEGREDO = Deno.env.get('PURGA_TRIAL_SEGREDO') ?? '';

/** Dias de carência DEPOIS do vencimento do teste. Combinado com o dono: 5. */
const DIAS_PADRAO = 5;

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── Autenticação por segredo ───────────────────────────────────────────────
  if (!SEGREDO) {
    return json({ erro: 'PURGA_TRIAL_SEGREDO nao configurado nos Secrets da funcao' }, 500);
  }
  if (url.searchParams.get('s') !== SEGREDO) {
    // 404 e não 401: quem não tem o segredo não precisa saber que a rota existe.
    return json({ erro: 'nao encontrado' }, 404);
  }

  const dias = Number(url.searchParams.get('dias') ?? DIAS_PADRAO);
  if (!Number.isFinite(dias) || dias < 0) return json({ erro: 'dias invalido' }, 400);
  const simulacao = url.searchParams.get('dry') === '1';

  // ── Simulação: só conta o que seria apagado ────────────────────────────────
  if (simulacao) {
    const { data, error } = await sb.rpc('trial_candidatos_purga', { p_dias: dias });
    if (error) return json({ erro: error.message }, 500);
    return json({ simulacao: true, dias, candidatos: data ?? [] });
  }

  // ── Execução ───────────────────────────────────────────────────────────────
  const { data, error } = await sb.rpc('purgar_dados_trial', { p_dias: dias });
  if (error) return json({ erro: error.message }, 500);

  const contas = (data ?? []) as Array<{ email: string; linhas_apagadas: number }>;
  const linhas = contas.reduce((s, c) => s + Number(c.linhas_apagadas ?? 0), 0);

  // O corpo vira o log da execução. Quando alguém perguntar o que sumiu e
  // quando, a resposta está aqui.
  console.log(
    `[purga_trial] dias=${dias} contas=${contas.length} linhas=${linhas} ` +
      `emails=${contas.map((c) => c.email).join(',')}`,
  );

  return json({ ok: true, dias, contas: contas.length, linhas_apagadas: linhas, detalhe: contas });
});
