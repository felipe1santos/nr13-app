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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Globais que o portal precisa para renderizar (logo/dados da executante).
const CHAVES_GLOBAIS = ['nr13_minha_empresa', 'nr13_lista_phs'];

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

    // 3. Busca todas as chaves da org e filtra as que terminam com _<TAG> das TAGs
    //    do cliente + as globais liberadas. (Uma query só, filtro em memória —
    //    padrões de sufixo com LIKE por TAG explodiriam em N queries.)
    const chaves: Record<string, string> = {};
    const PAGINA = 1000;
    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await admin
        .from('app_storage')
        .select('chave, valor')
        .eq('org_id', perfil.org_id)
        .order('chave', { ascending: true })
        .range(inicio, inicio + PAGINA - 1);
      if (error) return json({ erro: error.message }, 400);
      for (const row of data ?? []) {
        const chave = row.chave as string;
        if (row.valor == null) continue;
        // Histórico de relatórios é uma lista GLOBAL — entrega só as entradas
        // dos ativos deste cliente (tagVaso ∈ tags), nunca a lista inteira.
        if (chave === 'nr13_historico_relatorios') {
          try {
            const lista = JSON.parse(row.valor);
            if (Array.isArray(lista)) {
              chaves[chave] = JSON.stringify(lista.filter((r) => tags.includes(r?.tagVaso)));
            }
          } catch {
            // lixo: não entrega
          }
          continue;
        }
        const pertence =
          CHAVES_GLOBAIS.includes(chave) ||
          // Certificados dos instrumentos PADRÃO (rastreabilidade): anexados no fim dos
          // relatórios/certificados. Não terminam em _<TAG> (são da executante, não do
          // ativo), então sem esta linha o PDF do portal saía sem os anexos.
          chave.startsWith('nr13_rastreab_') ||
          tags.some((t) => chave.endsWith(`_${t}`));
        if (pertence) chaves[chave] = row.valor;
      }
      if (!data || data.length < PAGINA) break;
    }

    return json({ chaves, tags });
  } catch (e) {
    return json({ erro: String(e) }, 500);
  }
});
