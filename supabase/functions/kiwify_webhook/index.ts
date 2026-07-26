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
// TOCTOU conhecido (fix round 1, 26/07/2026) e correção da janela (fix round 2, 26/07/2026):
// a checagem de duplicata (passo 4) e a gravação do evento (passo 5) não são atômicas — duas
// entregas simultâneas do MESMO webhook da Kiwify (ela reenvia sem esperar resposta) podem ler
// "não existe ainda" ao mesmo tempo e as duas seguirem para processar. Defesa em profundidade:
// `assinatura_setup.sql` tem um índice único parcial sobre a coluna `dedupe_chave`
// (`<evento>:<subscription_id ou email>:<balde de 60s>`, calculada em `calcularDedupeChave`
// abaixo). O "balde" (minuto UTC corrente) é o que limita a proteção do banco à janela CURTA do
// TOCTOU — NUNCA à vida inteira da assinatura: subscription_id é o MESMO em toda renovação, então
// um índice único só em (evento, subscription_id) colidiria a renovação do mês seguinte com a
// primeira gravação e a deixaria presa como "duplicado" para sempre (bug do índice do round 1,
// substituído por este). A janela por balde é aproximada: duas entregas do mesmo evento
// separadas por poucos segundos podem cair em baldes diferentes bem na virada do minuto e não
// colidir — aceitável, porque o índice é só o BACKSTOP; a consulta em memória do passo 4
// continua sendo a primeira linha de defesa. Se o INSERT do passo 5 violar o índice, tratamos
// como duplicata (200, sem reprocessar) em vez de estourar como erro genérico.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extrairDados, type EventoKiwify } from './parser.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DIAS_CICLO = 30;
// Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar.
const DIAS_GRACA = 5;

// Código do Postgres para violação de índice/constraint único (usado no passo 5).
const PG_UNIQUE_VIOLATION = '23505';

// Valor que `assinatura_setup.sql` insere em config_global e que o passo de deploy MANDA
// trocar. A função RECUSA (401) enquanto ele estiver lá: se a troca for esquecida, o segredo
// está publicado no repositório — qualquer um POSTaria `compra_aprovada` e se daria 30 dias
// de graça, ou `chargeback` e derrubaria um cliente pagante. Melhor o webhook não funcionar
// (a Kiwify reenfileira e o Admin libera na mão) do que funcionar para o mundo inteiro.
const SEGREDO_PLACEHOLDER = 'TROQUE-ESTE-VALOR';

function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

// Maior entre a data atual e o piso (ver maiorData em maquinaEstados.ts): null = sem
// vencimento, permanece sem vencimento; data inválida perde para o piso.
function maiorData(atual: string | null, piso: string): string | null {
  if (!atual) return null;
  const t = new Date(atual).getTime();
  return Number.isFinite(t) && t > new Date(piso).getTime() ? atual : piso;
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
      // NUNCA encurta o que já foi pago: um `late` reentregue depois de um `renewed`
      // rebaixaria conta paga até o dia 30 para 5 dias. A graça é um PISO.
      return { status: 'graca', ate: maiorData(atual.ate, somarDias(agora, DIAS_GRACA)) };
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

// Chave de dedupe do índice único parcial `kiwify_eventos_dedup_idx` (assinatura_setup.sql):
// só existe quando há evento conhecido E um identificador (subscription_id ou e-mail) — sem
// isso não há como agrupar entregas do "mesmo" evento, e a linha entra com dedupe_chave NULL
// (fora do índice parcial, sem essa proteção extra). O "balde" de 60s é o que torna a janela
// curta em vez de permanente — ver comentário no topo do arquivo.
function calcularDedupeChave(
  evento: string | null,
  subscriptionId: string | null,
  email: string | null,
): string | null {
  if (!evento) return null;
  const identificador = subscriptionId ?? email;
  if (!identificador) return null;
  const balde = Math.floor(Date.now() / 60_000);
  return `${evento}:${identificador}:${balde}`;
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
  if (segredo === SEGREDO_PLACEHOLDER) {
    console.error(
      'kiwify_webhook: segredo ainda é o placeholder de assinatura_setup.sql — ' +
        'troque o valor de kiwify_webhook_segredo em config_global antes de cadastrar o webhook.',
    );
    return new Response('Não autorizado', { status: 401 });
  }
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

  if (dados.sck) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, org_id')
      .eq('id', dados.sck)
      .maybeSingle();
    if (error) console.error('kiwify_webhook: erro ao buscar profile por sck', error.message);
    if (data) profileId = (data.org_id as string) ?? (data.id as string);
  }
  if (!profileId && dados.email) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, org_id')
      .eq('email', dados.email)
      .maybeSingle();
    if (error) console.error('kiwify_webhook: erro ao buscar profile por email', error.message);
    if (data) profileId = (data.org_id as string) ?? (data.id as string);
  }

  // 3-bis. Estado ATUAL da linha que vai ser gravada (a da ORG), nunca o da linha casada.
  // Sem isto (achado C4 da revisão final), quando quem paga não é o mestre — gerente pagando
  // com o próprio e-mail, situação comum — lia-se o estado do PAGADOR ({trial, ate:null}) e
  // aplicava-se a transição no MESTRE. Um subscription_canceled nesse cenário via `ate` nulo
  // como "período ainda em aberto" e gravava {cancelada_no_prazo, ate:null} = SEM VENCIMENTO:
  // conta cancelada com acesso permanente e de graça.
  let atual = { status: 'trial', ate: null as string | null };
  let atualLido = false;
  if (profileId) {
    const { data, error } = await admin
      .from('profiles')
      .select('assinatura_status, assinatura_ate')
      .eq('id', profileId)
      .maybeSingle();
    if (error) console.error('kiwify_webhook: erro ao ler estado atual da org', error.message);
    if (data) {
      atual = {
        status: (data.assinatura_status as string) ?? 'trial',
        ate: (data.assinatura_ate as string | null) ?? null,
      };
      atualLido = true;
    }
  }

  // 4. Duplicata: mesmo evento processado nos últimos 60s. Chave de dedupe é o subscription_id
  // quando existe; sem ele (nem todo evento da Kiwify traz um), cai para o e-mail — NUNCA usar
  // "?? ''" comparado com .eq, porque em Postgres "coluna = ''" NÃO casa com "coluna IS NULL"
  // (a checagem antiga nunca disparava pra eventos sem subscription_id — corrigido aqui com
  // .is(coluna, null) explícito quando o valor não existe). Esta é a primeira linha de defesa
  // (mais barata, roda antes de qualquer escrita); o índice único do passo 5 é o backstop.
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
      // como "sem duplicata conhecida" e deixa o índice único (assinatura_setup.sql, passo 5)
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
  // Estado atual ilegível = NÃO processa (fail-closed): aplicar a transição em cima de um
  // estado chutado é como o C4 dava acesso permanente a conta cancelada. Melhor pedir reenvio.
  const podeProcessar = contaIdentificada && eventoConhecido && !duplicado && atualLido;

  let motivoErro: string | null = null;
  if (!contaIdentificada) motivoErro = 'conta não identificada';
  else if (!eventoConhecido) motivoErro = 'evento fora do escopo';
  else if (duplicado) motivoErro = 'duplicado, ignorado';
  else if (!atualLido) motivoErro = 'estado atual da conta ilegível';

  const dedupeChave = calcularDedupeChave(dados.evento, dados.subscriptionId, dados.email);

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
      dedupe_chave: dedupeChave,
    })
    .select('id')
    .single();

  if (erroInsert?.code === PG_UNIQUE_VIOLATION) {
    // Backstop do TOCTOU: alguma outra entrega (a checagem em memória do passo 4, ou uma
    // corrida concorrente que passou por ela ao mesmo tempo) já gravou o MESMO evento dentro
    // do MESMO balde de 60s. Não reprocessa (evita duplicar a transição em profiles) e responde
    // 200 — a Kiwify não precisa reenviar, o evento já está coberto pela outra gravação.
    console.warn('kiwify_webhook: duplicata pega pelo índice único de dedupe', erroInsert.message);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
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

  // 5-bis. Conta e evento válidos, mas não conseguimos ler o estado atual da org: o evento
  // ficou registrado (auditoria/reprocesso) e pedimos reenvio — nada foi aplicado.
  if (contaIdentificada && eventoConhecido && !duplicado && !atualLido) {
    return new Response(JSON.stringify({ ok: false, erro: 'estado atual da conta ilegível' }), {
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
      console.error('kiwify_webhook: erro ao marcar evento como processado', erroMarcar.message);
      // A linha NÃO pode ficar processado:false, erro:null — isso seria indistinguível de uma
      // linha nunca tocada, mesmo com profiles já correto. Persiste o motivo real (best-effort:
      // se este segundo UPDATE também falhar, já logamos acima e seguimos, sem travar a resposta).
      await admin
        .from('kiwify_eventos')
        .update({ erro: `falha ao marcar processado: ${erroMarcar.message}` })
        .eq('id', eventoGravado.id);
      // profiles já foi atualizado com sucesso: reenviar não corrige nada e ainda arrisca
      // reaplicar a transição — por isso respondemos 200 mesmo com essa falha de rótulo.
    }
  }

  // 200 sempre que registramos: erro faria a Kiwify reenviar em looping.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
