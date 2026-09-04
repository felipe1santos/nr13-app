// Edge Function `portal_cliente` — entrega ao cliente final SOMENTE as chaves dos ativos dele.
// Deploy: Supabase Dashboard → Edge Functions → nome "portal_cliente" → cola isto.
//
// Por que server-side: o vínculo ativo→cliente mora DENTRO do app_storage
// (nr13_emp_<TAG>.clienteId), então RLS pura não filtra por cliente — um cliente
// com DevTools leria chaves de outros clientes da mesma org. Aqui o filtro é
// feito com service_role e o cliente só recebe o que é dele.
//
// POST (Bearer token do usuário papel='cliente'):
//   { }  ->  { chaves: { 'nr13_info_<TAG>': '<json>', ... }, tags: ['TAG1', ...] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chaveAutorizadaSobDemanda, chavesDoCliente, PREFIXO_RASTREABILIDADE } from './prefixos.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// As globais que o Portal precisa (logo/dados da executante) agora vivem em `prefixos.ts`,
// como `GLOBAIS_LIBERADAS`, junto com a tabela por TAG — e são cobradas pelo teste de
// paridade. Manter uma segunda lista aqui recriaria a dessincronização que o teste existe
// para impedir.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return json({ erro: 'Sem token' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ erro: 'Token inválido' }, 401);

  const { data: perfil } = await admin
    .from('profiles')
    .select('papel, org_id, cliente_id, ativo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!perfil?.ativo) return json({ erro: 'Acesso não liberado' }, 403);
  if (perfil.papel !== 'cliente' || !perfil.org_id || !perfil.cliente_id) {
    return json({ erro: 'Acesso negado (somente contas de cliente)' }, 403);
  }

  // Chaves pedidas SOB DEMANDA (Fase 4). Vazio/ausente = carga inicial normal.
  let pedidas: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.chaves)) pedidas = body.chaves.filter((c: unknown) => typeof c === 'string').slice(0, 50);
  } catch {
    // corpo ausente ou inválido: segue como carga inicial
  }

  try {
    // 1. Todas as chaves de vínculo empresa↔ativo da org.
    const { data: emps, error: empErr } = await admin
      .from('app_storage')
      .select('chave, valor')
      .eq('org_id', perfil.org_id)
      .like('chave', 'nr13\\_emp\\_%');
    if (empErr) return json({ erro: empErr.message }, 400);

    // 2. TAGs cujo clienteId == cliente do chamador.
    const tags: string[] = [];
    for (const row of emps ?? []) {
      try {
        const emp = JSON.parse(row.valor ?? '{}');
        if (emp?.clienteId === perfil.cliente_id) {
          tags.push(row.chave.replace(/^nr13_emp_/, ''));
        }
      } catch {
        // valor não-JSON: ignora
      }
    }

    // 2-bis. MODO SOB DEMANDA: o cliente abriu um relatório LEGADO (sem `pdfRef`) e o
    // visualizador precisa do registro completo `nr13_rel_<id>_<TAG>`, que a carga inicial
    // deixou de mandar de propósito (pesa ~9,3 KB e a listagem só precisa do índice).
    //
    // A AUTORIZAÇÃO É A MESMA: a chave só é servida se terminar em `_<TAG>` de uma TAG que o
    // passo 2 já resolveu como sendo deste cliente. `tags` vem do banco, nunca do frontend —
    // o corpo do request só diz QUAL chave, jamais A QUEM ela pertence.
    if (pedidas.length > 0) {
      // A autorização mora em `prefixos.ts`, como função pura e testada
      // (`portalSobDemanda.test.ts`). Ela nega por FAMÍLIA antes de permitir por
      // TAG: `nr13_livro_rascunho_<TAG>` termina em `_<TAG>` de um equipamento
      // legítimo e começa com um prefixo permitido — só a negação explícita, e
      // avaliada primeiro, o mantém fora do Portal.
      const autorizadas = pedidas.filter((c) => chaveAutorizadaSobDemanda(c, tags));
      // Silêncio deliberado sobre a recusa: devolver "essa não é sua" daria um oráculo de
      // enumeração, o mesmo motivo da D-26 em `portal_arquivo`. Chave não autorizada
      // simplesmente não vem no resultado.
      const achadas: Record<string, string> = {};
      if (autorizadas.length > 0) {
        const { data, error } = await admin
          .from('app_storage')
          .select('chave, valor')
          .eq('org_id', perfil.org_id)
          .is('deletado_em', null)
          .in('chave', autorizadas);
        if (error) return json({ erro: error.message }, 400);
        for (const row of data ?? []) {
          if (row.valor == null) continue;
          achadas[row.chave as string] = row.valor as string;
        }
      }
      return json({ chaves: achadas, tags });
    }

    // 3. LEITURA DIRIGIDA PELA AUTORIZAÇÃO (Fase 4, achado A-02).
    //
    // Antes: `select … where org_id = X` SEM filtro, paginado, e o recorte por cliente
    // acontecia em memória depois. Medido em 20/08/2026 na organização de teste:
    // **534,7 KB lidos do Postgres para entregar 38,7 KB** — 93 % descartado. E o custo era
    // proporcional ao tamanho da ORGANIZAÇÃO, não ao do cliente: na maior org real (344
    // chaves) a mesma abertura lia 3,06 MB.
    //
    // Agora a lista de chaves é construída A PARTIR das TAGs já autorizadas no passo 2 —
    // construir a lista É a validação. Não existe caminho em que uma chave fora do conjunto
    // do cliente entre na consulta. O `in` é servido pelo índice `(org_id, chave)`, que já
    // existe desde o `acesso_setup.sql`.
    //
    // O comentário antigo dizia que "padrões de sufixo com LIKE por TAG explodiriam em N
    // queries". Verdade — e é por isso que aqui não há LIKE nem N queries: é UMA consulta por
    // igualdade sobre uma lista fechada.
    const chaves: Record<string, string> = {};

    // Lote generoso, mas com teto: PostgREST manda a lista na URL, e uma lista sem limite
    // viraria 414 numa organização com muitos ativos por cliente.
    const LOTE = 200;
    const alvo = chavesDoCliente(tags);
    for (let i = 0; i < alvo.length; i += LOTE) {
      const fatia = alvo.slice(i, i + LOTE);
      const { data, error } = await admin
        .from('app_storage')
        .select('chave, valor')
        .eq('org_id', perfil.org_id)
        .is('deletado_em', null)
        .in('chave', fatia);
      // Falha de lote NÃO pode virar Portal pela metade: o cliente veria um ativo sem
      // documento e concluiria que não existe. Erro explícito, como o palco faz (I-23).
      if (error) return json({ erro: error.message }, 400);
      for (const row of data ?? []) {
        if (row.valor == null) continue;
        chaves[row.chave as string] = row.valor as string;
      }
    }

    // Certificados dos instrumentos PADRÃO da executante: são da empresa, não do ativo, então
    // não terminam em `_<TAG>` e não cabem na lista por TAG. Continuam por prefixo — a lista é
    // curta (um por tipo de instrumento) e não cresce com a organização.
    {
      const { data, error } = await admin
        .from('app_storage')
        .select('chave, valor')
        .eq('org_id', perfil.org_id)
        .is('deletado_em', null)
        .like('chave', `${PREFIXO_RASTREABILIDADE.replace(/_/g, '\\_')}%`);
      if (error) return json({ erro: error.message }, 400);
      for (const row of data ?? []) {
        if (row.valor == null) continue;
        chaves[row.chave as string] = row.valor as string;
      }
    }

    return json({ chaves, tags });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
