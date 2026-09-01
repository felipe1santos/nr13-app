// Edge Function `admin_infra` — espelha no nosso painel os números de
// infraestrutura que o painel do Supabase mostra: egress, requisições, tamanho
// do banco, Storage, CPU/RAM do banco primário.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome
// "admin_infra" → cola isto. Depois, em Edge Functions → Secrets, criar:
//
//   SUPABASE_PAT        Personal Access Token da conta
//                       (supabase.com/dashboard/account/tokens → Generate new token)
//   SUPABASE_PROJECT_REF  ref do projeto (o subdomínio da URL: xxxxxxxx.supabase.co)
//   SUPABASE_ORG_SLUG     (opcional) slug da organização, para ler cota do plano
//
// Verify JWT pode ficar LIGADO nesta função — diferente do kiwify_webhook, aqui
// quem chama é o app logado, e o Bearer do usuário é justamente o que autentica.
//
// ─── POR QUE O TOKEN VIVE AQUI, E NÃO NO FRONT ──────────────────────────────
//
// O Personal Access Token manda em TODOS os projetos da organização — inclusive
// pausar e apagar. Uma `VITE_*` iria para o bundle, que é arquivo público
// (mesma armadilha da chave do Google Maps, §9 do CLAUDE.md, com estrago maior).
// Aqui ele é secret do runtime da função: o navegador nunca o recebe, e a função
// só responde para quem é `role = 'admin'` em `public.profiles`.
//
// ─── POR QUE A LEITURA É "POR TENTATIVA" ────────────────────────────────────
//
// A Management API cobre parte destes números com endpoints estáveis
// (`/v1/projects`, `/v1/projects/{ref}/analytics/endpoints/...`), e outra parte
// só existe hoje nos endpoints que o próprio painel deles consome. Contrato
// público não há para todos. Então cada número é buscado de forma independente e
// o que não vier volta como `null`, com o endpoint anotado em `falhas[]` —
// campo vazio COM motivo é diagnóstico, campo vazio sem motivo é mistério. Um
// endpoint que mude de forma degrada um cartão; não derruba o painel.
//
// Mesma disciplina do parser da Kiwify (§11 do CLAUDE.md): ler por tentativa,
// declarar o que não deu, e ajustar quando o formato real aparecer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAT = Deno.env.get('SUPABASE_PAT') ?? '';
const PROJECT_REF =
  Deno.env.get('SUPABASE_PROJECT_REF') ??
  // Deduz do próprio SUPABASE_URL: https://<ref>.supabase.co
  (SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\./)?.[1] ?? '');
const ORG_SLUG = Deno.env.get('SUPABASE_ORG_SLUG') ?? '';

const API = 'https://api.supabase.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** GET na Management API. Devolve `null` em qualquer falha, sem lançar. */
async function api<T>(caminho: string, falhas: string[]): Promise<T | null> {
  try {
    const r = await fetch(`${API}${caminho}`, {
      headers: { Authorization: `Bearer ${PAT}`, Accept: 'application/json' },
    });
    if (!r.ok) {
      falhas.push(`${caminho} → HTTP ${r.status}`);
      return null;
    }
    return (await r.json()) as T;
  } catch (e) {
    falhas.push(`${caminho} → ${e instanceof Error ? e.message : 'erro'}`);
    return null;
  }
}

/**
 * Procura um número dentro de um JSON de forma desconhecida.
 *
 * A Management API devolve o mesmo dado com nomes diferentes conforme o
 * endpoint (`usage`, `total`, `value`, `current`, e às vezes dentro de um array
 * de séries). Em vez de casar uma forma só — que quebraria silenciosamente e
 * deixaria o cartão em "—" sem ninguém entender por quê — varre em profundidade
 * pelas chaves candidatas e devolve a primeira numérica.
 */
function achaNumero(raiz: unknown, chaves: string[], profundidade = 0): number | null {
  if (raiz == null || profundidade > 6) return null;
  if (Array.isArray(raiz)) {
    for (const it of raiz) {
      const v = achaNumero(it, chaves, profundidade + 1);
      if (v != null) return v;
    }
    return null;
  }
  if (typeof raiz !== 'object') return null;
  const o = raiz as Record<string, unknown>;
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  for (const v of Object.values(o)) {
    const achado = achaNumero(v, chaves, profundidade + 1);
    if (achado != null) return achado;
  }
  return null;
}

/**
 * Converte a resposta de série temporal da Management API em pontos diários.
 *
 * O formato observado é `{ result: [{ timestamp | period_start, count | ... }] }`.
 * Data ilegível ou valor não-numérico é DESCARTADO em vez de virar ponto zero:
 * ponto zero inventado num gráfico de requisições parece queda de tráfego.
 */
function serieDeResultado(bruto: unknown): Array<{ dia: string; valor: number }> | null {
  const raiz = (bruto as Record<string, unknown> | null)?.result ?? bruto;
  if (!Array.isArray(raiz)) return null;
  const pontos: Array<{ dia: string; valor: number }> = [];
  for (const it of raiz) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const marca = o.timestamp ?? o.period_start ?? o.time ?? o.date;
    const valor = o.count ?? o.total ?? o.value ?? o.sum;
    if (typeof valor !== 'number' || !Number.isFinite(valor)) continue;
    // `timestamp` costuma vir em MICROssegundos (Logflare). Número muito grande
    // dividido errado viraria ano 55000 e o gráfico sairia vazio.
    let ms: number | null = null;
    if (typeof marca === 'number') ms = marca > 1e14 ? marca / 1000 : marca;
    else if (typeof marca === 'string') {
      const d = new Date(marca);
      ms = isNaN(d.getTime()) ? null : d.getTime();
    }
    if (ms == null) continue;
    const dia = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    pontos.push({ dia, valor });
  }
  if (pontos.length === 0) return null;
  // Agrupa por dia (a API pode devolver por hora) e ordena.
  const m = new Map<string, number>();
  for (const p of pontos) m.set(p.dia, (m.get(p.dia) ?? 0) + p.valor);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, valor]) => ({ dia, valor }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Autentica o chamador e confere que é admin da plataforma. Mesma guarda de
  //    `admin_usage_stats()` — esta função enxerga a conta Supabase inteira.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
  if (!token) return json({ erro: 'Sem token' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ erro: 'Token inválido' }, 401);
  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (perfil?.role !== 'admin') return json({ erro: 'Acesso negado (não é admin)' }, 403);

  // 2. Sem token de conta configurado, a função responde `erro` em vez de zeros.
  //    Zero é um número e seria lido como "não consumiu nada"; erro vira "—".
  if (!PAT || !PROJECT_REF) {
    return json(
      {
        erro:
          'Falta configurar os secrets SUPABASE_PAT e SUPABASE_PROJECT_REF na Edge Function admin_infra.',
      },
      200,
    );
  }

  const falhas: string[] = [];

  // 3. Projeto: região, plano, status.
  const projeto = await api<Record<string, unknown>>(`/v1/projects/${PROJECT_REF}`, falhas);

  // 4. Séries de uso. `interval=1d` cobre a janela que o painel deles usa por
  //    padrão; o app reamostra para os 30 dias que desenha.
  const reqs = await api<unknown>(
    `/v1/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts?interval=1d`,
    falhas,
  );
  const serieRequisicoes = serieDeResultado(reqs);

  // 5. Uso e cota da organização (egress, tamanho do banco, storage). Este é o
  //    endpoint com maior chance de mudar de forma — daí o `achaNumero`.
  const usoOrg = ORG_SLUG
    ? await api<unknown>(`/v1/organizations/${ORG_SLUG}/usage`, falhas)
    : await api<unknown>(`/v1/projects/${PROJECT_REF}/usage`, falhas);

  const egressBytes = achaNumero(usoOrg, ['egress', 'total_egress', 'db_egress', 'usage']);
  const egressCotaBytes = achaNumero(usoOrg, ['egress_limit', 'limit', 'quota', 'plan_limit']);
  const dbBytes = achaNumero(usoOrg, ['db_size', 'database_size', 'db_size_bytes']);
  const storageBytes = achaNumero(usoOrg, ['storage_size', 'storage_size_bytes', 'storage']);

  // 6. Saúde do banco primário (CPU/RAM/disco). Endpoint de status; ausente em
  //    projeto pausado ou em plano sem a métrica.
  const saude = await api<unknown>(
    `/v1/projects/${PROJECT_REF}/health?services=db`,
    falhas,
  );

  return json({
    egressBytes,
    egressCotaBytes,
    dbBytes,
    dbCotaBytes: achaNumero(usoOrg, ['db_size_limit', 'disk_size_limit']),
    storageBytes,
    storageCotaBytes: achaNumero(usoOrg, ['storage_size_limit']),
    requisicoes: serieRequisicoes ? serieRequisicoes.reduce((a, p) => a + p.valor, 0) : null,
    serieRequisicoes,
    cpu: achaNumero(saude, ['cpu', 'cpu_usage', 'cpu_percent']),
    ram: achaNumero(saude, ['ram', 'memory', 'ram_usage', 'memory_percent']),
    disco: achaNumero(saude, ['disk', 'disk_usage', 'disk_percent']),
    plano:
      (projeto?.subscription_plan as string | undefined) ??
      ((projeto?.plan as Record<string, unknown> | undefined)?.name as string | undefined) ??
      null,
    regiao: (projeto?.region as string | undefined) ?? null,
    cicloInicio: (achaNumero(usoOrg, ['billing_cycle_start']) ?? null) as unknown as string | null,
    cicloFim: (achaNumero(usoOrg, ['billing_cycle_end']) ?? null) as unknown as string | null,
    falhas,
  });
});
