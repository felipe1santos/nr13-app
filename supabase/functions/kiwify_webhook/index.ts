// Recebe os webhooks de venda da Kiwify e aplica o estado da assinatura.
// Deploy: Supabase Dashboard → Edge Functions → nome "kiwify_webhook".
// URL cadastrada na Kiwify: https://<projeto>.supabase.co/functions/v1/kiwify_webhook?s=<segredo>
//
// Segredo na query porque a Kiwify NÃO documenta assinatura HMAC para eventos de venda.
// A lógica de transição espelha src/features/assinatura/maquinaEstados.ts — ao mudar uma,
// mudar a outra (Deno não importa de src/). Dois testes de consistência em
// src/features/assinatura/__tests__/consistenciaEdge.test.ts leem este arquivo do disco:
// um confere as constantes DIAS_CICLO/DIAS_GRACA, outro confere que cada evento aponta para
// o status certo dentro do switch de aplicarEvento.
//
// TOCTOU conhecido (fix round 1 da revisão, 26/07/2026): a checagem de duplicata (passo 4) e a
// gravação do evento não são atômicas — duas entregas simultâneas do MESMO webhook da Kiwify
// (ela reenvia sem esperar resposta) podem ler "não existe ainda" ao mesmo tempo e as duas
// seguirem para processar. Defesa em profundidade: `assinatura_setup.sql` tem um índice único
// parcial em (evento, subscription_id) para linhas com processado=true. Se a segunda entrega
// tentar marcar sua própria linha como processada e isso colidir com o índice (passo 6, update
// final), tratamos como duplicata (200, sem reprocessar) em vez de estourar como erro genérico.
// Isso não impede as DUAS entregas de já terem atualizado `profiles` antes de uma delas perder
// a corrida no rótulo — mas como aplicarEvento é o mesmo evento com "agora" quase idêntico, o
// pior caso é aplicar a mesma transição duas vezes (ex.: renovação soma 30 dias a partir de
// "agora" duas vezes, a poucos milissegundos de distância) — não há dano de negócio real.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extrairDados, type EventoKiwify } from './parser.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DIAS_CICLO = 30;
// Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar.
const DIAS_GRACA = 5;

// Código do Postgres para violação de índice/constraint único (usado no passo 6).
const PG_UNIQUE_VIOLATION = '23505';

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
  const { data: cfg, error: erroCfg } = await admin
    .from('config_global')
    .select('valor')
    .eq('chave', 'kiwify_webhook_segredo')
    .maybeSingle();
  if (erroCfg) {
    // Sem o segredo não dá pra autorizar: cai no "não autorizado" abaixo mesmo assim
    // (fail-safe) — só loga para diagnóstico, não existe alternativa mais segura aqui.
    console.error('kiwify_webhook: erro ao ler segredo em config_global', erroCfg.message);
  }
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
  // IMPORTANTE: o casamento por e-mail é SEMPRE igualdade exata (.eq), nunca ILIKE — o e-mail
  // já sai normalizado em minúsculas de extrairDados, e ILIKE trata "_"/"%" como coringa. Com
  // ILIKE, um comprador "joao_silva@x.com" podia casar com o perfil "joao.silva@x.com" e
  // liberar/bloquear a CONTA ERRADA.
  let profileId: string | null = null;
  let atual = { status: 'trial', ate: null as string | null };

  if (dados.sck) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .eq('id', dados.sck)
      .maybeSingle();
    if (error) console.error('kiwify_webhook: erro ao buscar profile por sck', error.message);
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }
  if (!profileId && dados.email) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .eq('email', dados.email)
      .maybeSingle();
    if (error) console.error('kiwify_webhook: erro ao buscar profile por email', error.message);
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }

  // 4. Duplicata: mesmo evento processado nos últimos 60s. Chave de dedupe é o subscription_id
  // quando existe; sem ele (nem todo evento da Kiwify traz um), cai para o e-mail — NUNCA usar
  // "?? ''" comparado com .eq, porque em Postgres "coluna = ''" NÃO casa com "coluna IS NULL"
  // (a checagem antiga nunca disparava pra eventos sem subscription_id — corrigido aqui com
  // .is(coluna, null) explícito quando o valor não existe).
  let jaExiste: { id: string } | null = null;
  if (dados.evento) {
    let consulta = admin
      .from('kiwify_eventos')
      .select('id')
      .eq('evento', dados.evento)
      .eq('processado', true)
      .gte('recebido_em', new Date(Date.now() - 60_000).toISOString());
    if (dados.subscriptionId) {
      consulta = consulta.eq('subscription_id', dados.subscriptionId);
    } else {
      consulta = dados.email
        ? consulta.is('subscription_id', null).eq('email', dados.email)
        : consulta.is('subscription_id', null).is('email', null);
    }
    const { data, error } = await consulta.maybeSingle();
    if (error) {
      // Falha na LEITURA da checagem não deve travar o webhook nem perder o evento: segue
      // como "sem duplicata conhecida" e deixa o índice único (assinatura_setup.sql, passo 6)
      // como backstop contra a corrida real.
      console.error('kiwify_webhook: erro ao checar duplicata', error.message);
    } else {
      jaExiste = data;
    }
  }

  // 5. Registra SEMPRE — inclusive órfão e evento desconhecido (auditoria/reprocesso).
  // Grava com processado:false PRIMEIRO: se o UPDATE de profiles falhar depois (passo 6), a
  // linha de auditoria não pode ter mentido dizendo "processado" antes de o processamento
  // realmente acontecer.
  const contaIdentificada = !!profileId;
  const eventoConhecido = !!dados.evento;
  const duplicado = !!jaExiste;
  const podeProcessar = contaIdentificada && eventoConhecido && !duplicado;

  let motivoErro: string | null = null;
  if (!contaIdentificada) motivoErro = 'conta não identificada';
  else if (!eventoConhecido) motivoErro = 'evento fora do escopo';
  else if (duplicado) motivoErro = 'duplicado, ignorado';

  const { data: eventoGravado, error: erroInsert } = await admin
    .from('kiwify_eventos')
    .insert({
      evento: dados.evento ?? 'desconhecido',
      payload: payload as Record<string, unknown>,
      email: dados.email,
      subscription_id: dados.subscriptionId,
      profile_id: profileId,
      processado: false,
      erro: motivoErro,
    })
    .select('id')
    .single();

  if (erroInsert || !eventoGravado) {
    // Não conseguimos nem registrar o evento: melhor a Kiwify reenviar (500) do que perder o
    // rastro em silêncio respondendo 200 — sem a linha em kiwify_eventos não existe auditoria
    // nem reprocesso possível depois.
    console.error('kiwify_webhook: erro ao gravar evento', erroInsert?.message);
    return new Response(JSON.stringify({ ok: false, erro: 'falha ao registrar evento' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 6. Aplica o estado (só quando a conta foi identificada, o evento é conhecido e não é
  // duplicata) — e só marca a linha como processada DEPOIS do UPDATE de profiles ter sucesso.
  if (podeProcessar) {
    const novo = aplicarEvento(atual, dados.evento as EventoKiwify, new Date());
    const { error: erroUpdate } = await admin
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

    if (erroUpdate) {
      // A conta NÃO foi atualizada: grava o motivo na linha de auditoria (processado continua
      // false, correto) e responde 500 — aqui reenviar é o certo, porque nada foi aplicado.
      await admin
        .from('kiwify_eventos')
        .update({ erro: `falha ao atualizar profiles: ${erroUpdate.message}` })
        .eq('id', eventoGravado.id);
      console.error('kiwify_webhook: erro ao atualizar profiles', erroUpdate.message);
      return new Response(JSON.stringify({ ok: false, erro: 'falha ao aplicar assinatura' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // profiles já está correto neste ponto — só falta rotular o evento como processado.
    const { error: erroMarcar } = await admin
      .from('kiwify_eventos')
      .update({ processado: true })
      .eq('id', eventoGravado.id);
    if (erroMarcar) {
      if (erroMarcar.code === PG_UNIQUE_VIOLATION) {
        // Índice único de assinatura_setup.sql pegou a corrida do TOCTOU do passo 4: outra
        // entrega concorrente do MESMO evento já se marcou como processada primeiro. profiles
        // já está correto (a outra entrega aplicou a mesma transição) — não é erro de negócio,
        // só perdemos a corrida no rótulo desta linha específica.
        await admin
          .from('kiwify_eventos')
          .update({ erro: 'duplicado (corrida concorrente), ignorado' })
          .eq('id', eventoGravado.id);
      } else {
        console.error('kiwify_webhook: erro ao marcar evento como processado', erroMarcar.message);
      }
      // Em ambos os casos profiles já foi atualizado com sucesso: a Kiwify reenviar não
      // ajudaria (o estado já foi aplicado), então respondemos 200 mesmo com essa falha de rótulo.
    }
  }

  // 200 sempre que registramos: erro faria a Kiwify reenviar em looping.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
