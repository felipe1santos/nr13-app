/**
 * Gate de concorrência da RPC `aplicar_mutacao_storage`.
 *
 * POR QUE ESTE SCRIPT EXISTE: os dois cenários que ele cobre são os únicos do
 * gate que não se prova no SQL Editor — ele roda uma instrução por vez, e aqui
 * o que está sob teste é justamente o que acontece quando DUAS transações
 * chegam ao mesmo tempo. São eles que exercitam o `FOR SHARE` da reivindicação
 * de mutação e o handler de `unique_violation` da corrida de criação.
 *
 * SEGURANÇA: o script provisiona uma ORGANIZAÇÃO DESCARTÁVEL própria (usuário
 * de auth criado na hora, e-mail em @example.invalid), roda tudo dentro dela e
 * apaga o rastro no fim. Nunca toca em organização de cliente. Antes de ligar a
 * flag v2, confere que nenhuma outra organização está com ela ligada.
 *
 * COMO RODAR:
 *   1. Crie `.env.teste` na raiz (já coberto pelo .gitignore) com:
 *        SUPABASE_SERVICE_ROLE_KEY=<Settings > API > service_role>
 *   2. node scripts/testar-concorrencia-rpc.mts
 *
 * A service_role key ignora RLS e pode tudo no projeto. Ela fica só nesse
 * arquivo local, não entra no bundle e não deve ser commitada.
 */
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Configuração ────────────────────────────────────────────────────────────
const RODADAS = 15; // repetições por cenário, para aumentar a chance de colisão
const PREFIXO = 'nr13_ZZTESTE_CONC_';

function carregarEnv(arquivo: string): Record<string, string> {
  try {
    const texto = readFileSync(arquivo, 'utf8');
    const saida: Record<string, string> = {};
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
      if (m) saida[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return saida;
  } catch {
    return {};
  }
}

const env = { ...carregarEnv('.env'), ...carregarEnv('.env.teste'), ...process.env };
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON) {
  console.error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}
if (!SERVICE) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY no .env.teste (Settings > API > service_role).');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Relatório ───────────────────────────────────────────────────────────────
interface Linha {
  cenario: string;
  rodada: number;
  respostas: string;
  detalhe: string;
  ok: boolean;
}
const relatorio: Linha[] = [];
let falhas = 0;

function registrar(l: Linha): void {
  relatorio.push(l);
  if (!l.ok) falhas++;
  const marca = l.ok ? 'ok  ' : 'FALHA';
  console.log(`  [${marca}] ${l.cenario} #${l.rodada}: ${l.respostas} — ${l.detalhe}`);
}

// ── Provisionamento da organização descartável ──────────────────────────────
interface Ambiente {
  userId: string;
  email: string;
  senha: string;
  orgId: string;
}

async function provisionar(): Promise<Ambiente> {
  const sufixo = crypto.randomUUID().slice(0, 8);
  const email = `nr13-gate-conc-${sufixo}@example.invalid`;
  const senha = `S${crypto.randomUUID()}!aA9`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser falhou: ${error?.message}`);
  const userId = data.user.id;

  // A organização é o próprio usuário: ninguém mais pertence a ela.
  const { error: eProfile } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      org_id: userId,
      papel: 'mestre',
      ativo: true,
      plano: 'completo',
      role: 'user',
      acesso_expira_em: null,
      assinatura_status: 'ativa',
      assinatura_ate: null,
    },
    { onConflict: 'id' },
  );
  if (eProfile) throw new Error(`upsert profile falhou: ${eProfile.message}`);

  return { userId, email, senha, orgId: userId };
}

async function limpar(amb: Ambiente): Promise<void> {
  await admin.rpc('definir_v2_org', { p_org: amb.orgId, p_ativa: false });
  await admin.from('app_storage').delete().eq('org_id', amb.orgId);
  await admin.from('app_storage_excluidos').delete().eq('org_id', amb.orgId);
  await admin.from('app_storage_mutacoes').delete().eq('org_id', amb.orgId);
  await admin.from('org_sync').delete().eq('org_id', amb.orgId);
  await admin.from('profiles').delete().eq('id', amb.userId);
  await admin.auth.admin.deleteUser(amb.userId);
}

/** Dois clientes independentes, cada um com sua própria sessão autenticada. */
async function doisClientes(amb: Ambiente): Promise<[SupabaseClient, SupabaseClient]> {
  const criar = async () => {
    const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email: amb.email, password: amb.senha });
    if (error) throw new Error(`signIn falhou: ${error.message}`);
    return c;
  };
  return [await criar(), await criar()];
}

interface Resposta {
  status?: string;
  versao?: number;
  valor?: string | null;
  motivo?: string;
}

function chamar(
  cli: SupabaseClient,
  chave: string,
  mutationId: string,
  valor: string,
  versaoEsperada: number,
  dispositivo: string,
): Promise<Resposta> {
  return cli
    .rpc('aplicar_mutacao_storage', {
      p_chave: chave,
      p_mutation_id: mutationId,
      p_op: 'set',
      p_valor: valor,
      p_versao_esperada: versaoEsperada,
      p_dispositivo: dispositivo,
      p_mutado_em: new Date().toISOString(),
    })
    .then(({ data, error }) => {
      if (error) return { status: 'ERRO_RPC', motivo: error.message } as Resposta;
      return (data ?? {}) as Resposta;
    });
}

/** Dispara as duas chamadas o mais junto possível. */
async function emParalelo(a: () => Promise<Resposta>, b: () => Promise<Resposta>) {
  const [ra, rb] = await Promise.allSettled([a(), b()]);
  const val = (r: PromiseSettledResult<Resposta>): Resposta =>
    r.status === 'fulfilled' ? r.value : { status: 'REJEITADA', motivo: String(r.reason) };
  return [val(ra), val(rb)] as const;
}

// ── Cenário A: mesmo mutationId, simultâneo ────────────────────────────────
async function cenarioA(amb: Ambiente, c1: SupabaseClient, c2: SupabaseClient): Promise<void> {
  console.log('\nCenário A — duas chamadas simultâneas com o MESMO mutationId');
  for (let i = 1; i <= RODADAS; i++) {
    const chave = `${PREFIXO}A_${i}`;
    const mid = crypto.randomUUID();
    const valor = `{"rodada":${i}}`;

    const [r1, r2] = await emParalelo(
      () => chamar(c1, chave, mid, valor, 0, 'cli-1'),
      () => chamar(c2, chave, mid, valor, 0, 'cli-2'),
    );

    const status = [r1.status, r2.status].sort().join('+');
    const { data: linha } = await admin
      .from('app_storage')
      .select('versao, valor')
      .eq('org_id', amb.orgId)
      .eq('chave', chave)
      .maybeSingle();
    const { count } = await admin
      .from('app_storage_mutacoes')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', amb.orgId)
      .eq('mutation_id', mid);

    const umAplicado = [r1.status, r2.status].filter((s) => s === 'aplicado').length === 1;
    const umRepetido = [r1.status, r2.status].filter((s) => s === 'repetido').length === 1;
    const versaoUmaVez = linha?.versao === 1;
    const umRegistro = count === 1;

    registrar({
      cenario: 'A mesmo mutationId',
      rodada: i,
      respostas: status,
      detalhe: `versao=${linha?.versao} mutacoes=${count}`,
      ok: umAplicado && umRepetido && versaoUmaVez && umRegistro,
    });
  }
}

// ── Cenário B: duas criações da mesma chave ────────────────────────────────
async function cenarioB(amb: Ambiente, c1: SupabaseClient, c2: SupabaseClient): Promise<void> {
  console.log('\nCenário B — duas criações simultâneas da MESMA chave (versao_esperada=0)');
  for (let i = 1; i <= RODADAS; i++) {
    const chave = `${PREFIXO}B_${i}`;
    const vA = `{"dono":"A","rodada":${i}}`;
    const vB = `{"dono":"B","rodada":${i}}`;

    const [r1, r2] = await emParalelo(
      () => chamar(c1, chave, crypto.randomUUID(), vA, 0, 'cli-1'),
      () => chamar(c2, chave, crypto.randomUUID(), vB, 0, 'cli-2'),
    );

    const status = [r1.status, r2.status].sort().join('+');
    const { data: linhas } = await admin
      .from('app_storage')
      .select('valor, versao, deletado_em')
      .eq('org_id', amb.orgId)
      .eq('chave', chave);

    const vivas = (linhas ?? []).filter((l) => !l.deletado_em);
    const umAplicado = [r1.status, r2.status].filter((s) => s === 'aplicado').length === 1;
    const umConflito = [r1.status, r2.status].filter((s) => s === 'conflito').length === 1;
    const umaLinha = vivas.length === 1;

    // O valor que ficou tem que ser o do lado que respondeu 'aplicado'.
    const vencedor = r1.status === 'aplicado' ? vA : r2.status === 'aplicado' ? vB : null;
    const naoSobrescrito = vencedor !== null && vivas[0]?.valor === vencedor;

    // A resposta de conflito precisa identificar o vencedor.
    const conflito = r1.status === 'conflito' ? r1 : r2.status === 'conflito' ? r2 : null;
    const conflitoIdentifica = conflito?.valor === vencedor;

    registrar({
      cenario: 'B criacao concorrente',
      rodada: i,
      respostas: status,
      detalhe: `linhas=${vivas.length} vencedor=${vivas[0]?.valor} conflito_viu=${conflito?.valor}`,
      ok: umAplicado && umConflito && umaLinha && naoSobrescrito && conflitoIdentifica,
    });
  }
}

// ── Execução ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('Gate de concorrência da RPC — organização descartável\n');

  const { data: antes } = await admin.from('org_sync').select('org_id').eq('v2_ativa', true);
  if ((antes ?? []).length > 0) {
    console.error('ABORTADO: já existe organização com v2_ativa ligada:', antes);
    process.exit(1);
  }
  console.log('Nenhuma organização com v2 ligada antes de começar. OK.');

  const amb = await provisionar();
  console.log(`Org de teste: ${amb.orgId} (${amb.email})`);

  try {
    await admin.rpc('definir_v2_org', { p_org: amb.orgId, p_ativa: true });
    const { data: ligadas } = await admin.from('org_sync').select('org_id').eq('v2_ativa', true);
    const soATeste = (ligadas ?? []).length === 1 && ligadas![0].org_id === amb.orgId;
    console.log(`v2 ligada apenas na org de teste: ${soATeste ? 'sim' : 'NAO — abortando'}`);
    if (!soATeste) throw new Error('v2 ligada em organização inesperada');

    const [c1, c2] = await doisClientes(amb);
    await cenarioA(amb, c1, c2);
    await cenarioB(amb, c1, c2);
  } finally {
    await limpar(amb);
    const { data: depois } = await admin.from('org_sync').select('org_id').eq('v2_ativa', true);
    const { count: sobrou } = await admin
      .from('app_storage')
      .select('*', { count: 'exact', head: true })
      .like('chave', `${PREFIXO}%`);
    console.log(`\nLimpeza: orgs com v2 ligada=${(depois ?? []).length}, chaves de teste restantes=${sobrou}`);
  }

  const total = relatorio.length;
  console.log(`\n===== RESULTADO: ${total - falhas}/${total} =====`);
  if (falhas > 0) {
    console.log('\nFalhas:');
    for (const l of relatorio.filter((x) => !x.ok)) {
      console.log(`  ${l.cenario} #${l.rodada}: ${l.respostas} — ${l.detalhe}`);
    }
  }
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('ERRO FATAL:', e);
  process.exit(1);
});
