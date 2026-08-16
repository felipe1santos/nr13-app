// Edge Function `portal_arquivo` — entrega ao cliente final a URL de UM arquivo,
// e só se aquele arquivo estiver REFERENCIADO por um recurso que ele pode ver.
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → nome
// "portal_arquivo" → cola isto.
//
// ── POR QUE ESTA FUNÇÃO EXISTE (Fase 0-B, achado A-01) ──────────────────────
//
// A policy de leitura do bucket compara apenas a primeira pasta do caminho com
// a organização da sessão. Como o `org_id` de um cliente é a organização do
// INSPETOR, qualquer cliente autenticado conseguia assinar a URL de qualquer
// arquivo da organização — fotos, PDFs e prontuários de OUTROS clientes.
//
// A partir da Fase 0-B a policy recusa leitura direta para o papel `cliente`
// (fail closed, D-04), e todo arquivo do Portal passa por aqui.
//
// ── AUTORIZAÇÃO É POR VÍNCULO, NÃO POR PASTA (D-05) ─────────────────────────
//
// Autorizar por pasta seria insuficiente e envelheceria mal: o PDF do relatório
// mora em `<org>/relatorios/`, a rubrica em `<org>/assinaturas/`, o certificado
// em `<org>/certificados/` — nenhum deles sob a pasta da TAG. Liberar a pasta
// significaria "o cliente pertence à organização, logo pode pedir qualquer
// rubrica", que é o mesmo defeito do A-01 em escala menor: um caminho
// descoberto ou adivinhado vira acesso.
//
// A regra: o path só é servido se estiver REFERENCIADO por um recurso que
// aquele cliente pode ver. O conjunto autorizado é derivado a partir das TAGs
// do cliente, nunca a partir do diretório.
//
// Consequência de desenho, e ela é deliberada: a rubrica do engenheiro só é
// servida porque um relatório que o cliente pode ver a referencia. Trocada a
// rubrica no cadastro, a versão nova não é alcançável por ele até que algum
// relatório dele passe a apontar para ela. É o comportamento correto.
//
// ── NÃO-ENUMERAÇÃO (D-26) ───────────────────────────────────────────────────
//
// "não existe" e "existe mas não é seu" devolvem o MESMO status, o MESMO corpo
// e os MESMOS cabeçalhos. E a decisão é tomada SEM nunca consultar a existência
// do arquivo: é pertinência a um conjunto, então não há caminho de código
// distinguível para servir de oráculo. Latência não é critério — variação de
// rede e cache é esperada e não constitui vazamento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'inspecao';

// TTL curto. URL assinada é bearer token: quem a tiver, acessa, independente de
// papel. Uma hora (o valor usado no sistema interno) transforma um link vazado
// num acesso longo. Cinco minutos cobrem folgadamente o carregamento de uma
// imagem ou o download de um PDF.
const TTL_S = 300;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// A ÚNICA recusa desta função depois da autenticação. Mesma resposta para
// "não existe", "não é seu", "path malformado" e "de outra organização".
// Ver D-26: diferenciar entregaria um oráculo de enumeração.
function recusa(): Response {
  return json({ erro: 'nao_disponivel' }, 404);
}

/** Coleta recursiva de todo `path` sob uma chave `ref`/`pdfRef`/`fotoRef`/`assinaturaRef`. */
function coletarPaths(valor: unknown, destino: Set<string>): void {
  if (valor == null) return;
  if (Array.isArray(valor)) {
    for (const v of valor) coletarPaths(v, destino);
    return;
  }
  if (typeof valor !== 'object') return;
  const o = valor as Record<string, unknown>;
  // Qualquer objeto com `bucket` + `path` é uma RefFoto, venha de que campo vier
  // (`ref`, `pdfRef`, `fotoRef`, `assinaturaRef`, `logoRef`, `thumbPath`...).
  // Varrer por FORMA, e não por nome de campo, é o que faz esta função
  // continuar correta quando a Fase 5 e a Fase 7 acrescentarem campos novos.
  if (typeof o.path === 'string' && o.path) destino.add(o.path);
  for (const v of Object.values(o)) coletarPaths(v, destino);
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

  // O papel vem do BANCO, nunca do que o cliente afirma.
  const { data: perfil } = await admin
    .from('profiles')
    .select('papel, org_id, cliente_id, ativo')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!perfil?.ativo) return json({ erro: 'Acesso não liberado' }, 403);
  if (perfil.papel !== 'cliente' || !perfil.org_id || !perfil.cliente_id) {
    return json({ erro: 'Acesso negado (somente contas de cliente)' }, 403);
  }

  let path: string;
  try {
    const body = await req.json();
    path = String(body?.path ?? '');
  } catch {
    return recusa();
  }
  if (!path) return recusa();

  try {
    // ── 1. TAGs vinculadas a este cliente — o vínculo raiz ────────────────
    const { data: emps, error: empErr } = await admin
      .from('app_storage')
      .select('chave, valor')
      .eq('org_id', perfil.org_id)
      .like('chave', 'nr13\\_emp\\_%');
    if (empErr) return json({ erro: empErr.message }, 400);

    const tags: string[] = [];
    for (const row of emps ?? []) {
      try {
        const emp = JSON.parse(row.valor ?? '{}');
        if (emp?.clienteId === perfil.cliente_id) {
          tags.push((row.chave as string).replace(/^nr13_emp_/, ''));
        }
      } catch {
        // valor não-JSON: ignora
      }
    }
    if (tags.length === 0) return recusa();

    // ── 2. Chaves alcançáveis a partir das TAGs ───────────────────────────
    // Buscadas por sufixo `_<TAG>`, o mesmo critério que `portal_cliente` usa
    // para decidir o que o cliente pode ver. Mais as globais de rastreabilidade,
    // que não terminam em TAG (são da executante) e são anexadas aos relatórios
    // que o cliente legitimamente recebe.
    const chaves: Array<{ chave: string; valor: string | null }> = [];
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
        if (
          tags.some((t) => chave.endsWith(`_${t}`)) ||
          chave.startsWith('nr13_rastreab_')
        ) {
          chaves.push({ chave, valor: row.valor as string | null });
        }
      }
      if (!data || data.length < PAGINA) break;
    }

    // ── 3. Conjunto de paths autorizados ──────────────────────────────────
    // Varredura por FORMA (objeto com `path`), então cobre de uma vez:
    // fotos de equipamento e de campo, PDF de relatório, prontuário do
    // fabricante, foto de componente, rubrica do livro, e — quando a Fase 7
    // chegar — `assinaturaRef` e `logoRef` dentro de `meta`. Sem precisar de
    // deploy novo desta função.
    const autorizados = new Set<string>();
    for (const { valor } of chaves) {
      if (!valor) continue;
      try {
        coletarPaths(JSON.parse(valor), autorizados);
      } catch {
        // valor não-JSON: não contribui com path nenhum
      }
    }

    // ── 4. Decisão. Não consulta a existência do arquivo. ─────────────────
    if (!autorizados.has(path)) return recusa();

    const { data: assinada, error: urlErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, TTL_S);
    // Arquivo autorizado mas ausente no bucket cai na MESMA recusa: o cliente
    // não precisa saber a diferença, e para ele o efeito é o mesmo.
    if (urlErr || !assinada?.signedUrl) return recusa();

    return json({ url: assinada.signedUrl, expiraEm: TTL_S });
  } catch (e) {
    console.error('[portal_arquivo]', e);
    return json({ erro: 'falha interna' }, 500);
  }
});
