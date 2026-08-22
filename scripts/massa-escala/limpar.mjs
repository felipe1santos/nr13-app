/**
 * FASE 8 — remoção da massa de escala, restrita a UMA seed.
 *
 * ── POR QUE ESTE ARQUIVO É PERIGOSO, E COMO ELE SE DEFENDE ──────────────────
 *
 * É o script que apaga. Um filtro largo demais aqui não devolve o que levou.
 * As defesas, em ordem:
 *
 *   · `podeApagar(chave, seed)` decide chave a chave — não há `delete` por
 *     prefixo largo em lugar nenhum.
 *   · Chave global (`nr13_lista_phs`, `nr13_minha_empresa`, …) é recusada mesmo
 *     que por acidente contivesse o prefixo da massa.
 *   · TAGs protegidas — `ZZ-FASE3`, `EQUIPE TESTE`, `VASO A23` … — são recusadas
 *     antes de qualquer teste de pertencimento.
 *   · Duas seeds coexistindo não se veem: `ZZ-SCALE-F8-1-` nunca casa
 *     `ZZ-SCALE-F8-12-`, porque o que vem depois da seed tem de ser só dígitos.
 *   · Remoção pela RPC oficial (`p_op: 'del'`), com tombstone. `DELETE` direto
 *     é recusado pela guarda do banco, e com razão.
 *   · Sem `--confirmar`, só imprime o que faria.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *
 *   MASSA_EMAIL=... MASSA_SENHA=... node scripts/massa-escala/limpar.mjs \
 *     --org <uuid> --seed 1 [--url <url>] [--confirmar]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { podeApagar, ORGS_DE_TESTE, PREFIXO, tagDaChave } from './seguranca.mjs';

const argv = process.argv.slice(2);
const arg = (n, p = null) => { const i = argv.indexOf(`--${n}`); return i === -1 ? p : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);

const ORG = arg('org');
const SEED = Number(arg('seed', NaN));
const CONFIRMAR = flag('confirmar');

function env() {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../../.env', import.meta.url), 'utf8')
        .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch { return {}; }
}
const ENV = env();
const URL_SB = arg('url', process.env.MASSA_URL || ENV.VITE_SUPABASE_URL);
const ANON = process.env.MASSA_ANON || ENV.VITE_SUPABASE_ANON_KEY;

if (!ORG || !ORGS_DE_TESTE.includes(ORG)) {
  console.error('RECUSADO: --org obrigatório e precisa estar na lista de organizações de teste.');
  process.exit(1);
}
if (!Number.isInteger(SEED)) {
  console.error('RECUSADO: --seed obrigatório (inteiro). Limpar "tudo que parece massa" não é uma opção.');
  process.exit(1);
}

const EMAIL = process.env.MASSA_EMAIL;
const SENHA = process.env.MASSA_SENHA;
if (!EMAIL || !SENHA || !URL_SB || !ANON) {
  console.error('RECUSADO: faltam MASSA_EMAIL, MASSA_SENHA e URL/ANON.');
  process.exit(1);
}

const sb = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: sessao, error: erroLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao?.user) { console.error('login falhou:', erroLogin?.message); process.exit(1); }
const { data: perfilRow } = await sb.from('profiles').select('org_id').eq('id', sessao.user.id).maybeSingle();
const orgDaSessao = perfilRow?.org_id ?? sessao.user.id;
if (orgDaSessao !== ORG) {
  console.error(`RECUSADO: a sessão pertence à org ${orgDaSessao}, e --org pediu ${ORG}.`);
  process.exit(1);
}

// ── levantar o que existe ───────────────────────────────────────────────────
const PAGINA = 1000;
const todas = [];
for (let inicio = 0; ; inicio += PAGINA) {
  const { data, error } = await sb.from('app_storage')
    .select('chave, versao')
    .eq('org_id', ORG)
    .order('chave', { ascending: true })
    .range(inicio, inicio + PAGINA - 1);
  if (error) { console.error('falha ao listar:', error.message); process.exit(1); }
  if (!data?.length) break;
  todas.push(...data);
  if (data.length < PAGINA) break;
}

const alvos = todas.filter((l) => podeApagar(l.chave, SEED));
const recusadasComPrefixo = todas.filter((l) => l.chave.includes(PREFIXO) && !podeApagar(l.chave, SEED));

console.log('── LIMPEZA ──────────────────────────────────────────');
console.log(`org             ${ORG}`);
console.log(`seed            ${SEED}`);
console.log(`chaves na org   ${todas.length}`);
console.log(`alvos da seed   ${alvos.length}`);
if (recusadasComPrefixo.length) {
  console.log(`recusadas       ${recusadasComPrefixo.length} (têm o prefixo mas NÃO são desta seed — ficam)`);
  for (const r of recusadasComPrefixo.slice(0, 5)) console.log(`  · ${r.chave}`);
}
const tags = [...new Set(alvos.map((a) => tagDaChave(a.chave)).filter(Boolean))];
console.log(`TAGs            ${tags.length}`);
console.log('─────────────────────────────────────────────────────');

if (!CONFIRMAR) {
  console.log('Sem --confirmar: nada foi apagado. Confira a lista acima antes de repetir com --confirmar.');
  process.exit(0);
}

// ── apagar: chaves pela RPC, arquivos pelo Storage ──────────────────────────
let removidas = 0, falhas = 0;
for (const linha of alvos) {
  // Segunda checagem, imediatamente antes de apagar. Barato, e é a última rede.
  if (!podeApagar(linha.chave, SEED)) { console.error('BUG: alvo recusado na segunda checagem:', linha.chave); continue; }
  const { data, error } = await sb.rpc('aplicar_mutacao_storage', {
    p_chave: linha.chave,
    p_mutation_id: randomUUID(),
    p_op: 'del',
    p_valor: null,
    p_versao_esperada: linha.versao,
    p_dispositivo: `massa-escala-f8-limpeza-${SEED}`,
    p_mutado_em: new Date().toISOString(),
  });
  if (error || (data?.status && data.status !== 'aplicado' && data.status !== 'ok')) {
    falhas++;
    if (falhas <= 5) console.error('  ! falhou', linha.chave, error?.message ?? data?.motivo);
  } else removidas++;
  if (removidas % 100 === 0) process.stdout.write(`\r  ${removidas}/${alvos.length} chaves removidas`);
}

// Arquivos: só sob as pastas das TAGs desta seed, mais os PDFs/logo/rubrica com o carimbo da seed.
let arquivosRemovidos = 0;
async function limparPasta(prefixo, filtro = () => true) {
  const { data, error } = await sb.storage.from('inspecao').list(prefixo, { limit: 1000 });
  if (error || !data?.length) return;
  const nomes = data.filter((o) => filtro(o.name)).map((o) => `${prefixo}/${o.name}`);
  if (!nomes.length) return;
  const { error: e2 } = await sb.storage.from('inspecao').remove(nomes);
  if (!e2) arquivosRemovidos += nomes.length;
}
for (const tag of tags) await limparPasta(`${ORG}/${tag}`);
const carimbo = `f8-${SEED}-`;
await limparPasta(`${ORG}/relatorios`, (n) => n.startsWith(carimbo));
await limparPasta(`${ORG}/logos`, (n) => n.startsWith(carimbo));
await limparPasta(`${ORG}/assinaturas`, (n) => n.startsWith(carimbo));

console.log(`\nchaves removidas ${removidas}   falhas: ${falhas}   arquivos: ${arquivosRemovidos}`);
process.exit(falhas > 0 ? 2 : 0);
