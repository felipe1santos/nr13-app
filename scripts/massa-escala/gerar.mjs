/**
 * FASE 8 — gerador determinístico de massa de escala.
 *
 * ── O QUE ELE É ─────────────────────────────────────────────────────────────
 *
 * Ferramenta, não produto. Vive fora do bundle, escreve pela MESMA porta que o
 * app usa (`aplicar_mutacao_storage` como `authenticated`), e **nunca** com
 * `service_role`. Um gerador que passa por cima da arquitetura mede um sistema
 * que não existe.
 *
 * ── AS TRAVAS ───────────────────────────────────────────────────────────────
 *
 * Em `seguranca.mjs`, e são a parte mais importante daqui:
 *   1. `--org` obrigatório, sem default. Nunca "a org logada".
 *   2. A org precisa estar na lista branca `ORGS_DE_TESTE`.
 *   3. Toda TAG nasce com o prefixo `ZZ-SCALE-F8-<seed>-`.
 *   4. `--confirmar-org-de-teste` explícito.
 *   5. Contra URL de produção, exige `NR13_PERMITIR_PRODUCAO=1`.
 *   6. **Nunca** grava `nr13_livro_*` — o livro tem trava de imutabilidade no
 *      banco, e entrada sintética lá não sai mais.
 *
 * ── DETERMINISMO ────────────────────────────────────────────────────────────
 *
 * Mesma seed + mesmos parâmetros = mesmo dataset lógico. Sem isso, medir de
 * novo depois de uma mudança não compara nada.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *
 *   MASSA_EMAIL=... MASSA_SENHA=... node scripts/massa-escala/gerar.mjs \
 *     --org <uuid> --perfil estrutural --equipamentos 100 --seed 1 \
 *     --relatorios-por-equipamento 2 --confirmar-org-de-teste
 *
 * Perfil realista acrescenta os tamanhos, que vêm de MEDIÇÃO e entram por
 * parâmetro — nunca embutidos:
 *     --kb-foto 88 --kb-thumb 15 --kb-pdf 6600 --calibracao 2026-08-atual
 *
 *   --dry-run       calcula tudo e não escreve nada (use antes de qualquer rodada)
 *   --url <url>     aponta para outro Supabase (laboratório local)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prng } from './prng.mjs';
import { tagDaSeed, validarAlvo, podeEscrever } from './seguranca.mjs';
import { chavesDoEquipamento } from './conteudo.mjs';
import { jpegSintetico, pdfSintetico, pngSintetico, desvio } from './arquivos.mjs';

// ── argumentos ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : argv[i + 1];
};
const flag = (nome) => argv.includes(`--${nome}`);
const num = (nome, padrao) => {
  const v = arg(nome);
  return v === null ? padrao : Number(v);
};

const PERFIL = arg('perfil');
const ORG = arg('org');
const SEED = num('seed', 1);
const EQUIPAMENTOS = num('equipamentos', 100);
const RELS = num('relatorios-por-equipamento', 2);
const CALIBRACAO = arg('calibracao', PERFIL === 'realista' ? null : 'estrutural-fixo');
const DRY = flag('dry-run');

// Tamanhos: no estrutural são fixos e mínimos; no realista vêm por parâmetro.
const PADRAO = { estrutural: { foto: 5, thumb: 2, pdf: 20 }, realista: { foto: null, thumb: null, pdf: null } };
const base = PADRAO[PERFIL] ?? PADRAO.estrutural;
const KB_FOTO = num('kb-foto', base.foto);
const KB_THUMB = num('kb-thumb', base.thumb);
const KB_PDF = num('kb-pdf', base.pdf);

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

// ── travas, ANTES de qualquer contato com a rede ────────────────────────────
const checagem = validarAlvo({
  org: ORG,
  perfil: PERFIL,
  url: URL_SB,
  confirmou: flag('confirmar-org-de-teste'),
  producaoPermitida: process.env.NR13_PERMITIR_PRODUCAO === '1',
});
if (!checagem.ok) {
  console.error('RECUSADO:');
  for (const e of checagem.erros) console.error('  ·', e);
  process.exit(1);
}
if (PERFIL === 'realista' && (!KB_FOTO || !KB_THUMB || !KB_PDF || !CALIBRACAO)) {
  console.error('RECUSADO: o perfil realista exige --kb-foto, --kb-thumb, --kb-pdf e --calibracao.');
  console.error('  Os valores vêm de MEDIÇÃO (Fases 2 e 5). Inventar tamanho aqui inventaria a projeção de Storage.');
  process.exit(1);
}

// ── plano da massa (puro; o dry-run para aqui) ──────────────────────────────
const rnd = prng(SEED);
const bytesFoto = Math.round(KB_FOTO * 1024);
const bytesThumb = Math.round(KB_THUMB * 1024);
const bytesPdf = Math.round(KB_PDF * 1024);

const plano = [];
for (let n = 0; n < EQUIPAMENTOS; n++) {
  const tag = tagDaSeed(SEED, n);
  const caminhos = {
    foto: `${ORG}/${tag}/f8-${SEED}-${n}.jpg`,
    bytesFoto,
    bytesThumb,
    bytesPdf,
    pdf: (i) => `${ORG}/relatorios/f8-${SEED}-${n}-${i}.pdf`,
    logo: `${ORG}/logos/f8-${SEED}-logo.jpg`,
    assinatura: `${ORG}/assinaturas/f8-${SEED}-rubrica.png`,
  };
  plano.push({ tag, n, pares: chavesDoEquipamento(rnd, { org: ORG, tag, n, perfil: PERFIL, relatoriosPorEquipamento: RELS, caminhos }), caminhos });
}

// A 6ª trava também vale chave a chave, não só no desenho.
const proibidas = plano.flatMap((e) => e.pares.map(([c]) => c)).filter((c) => !podeEscrever(c, SEED));
if (proibidas.length) {
  console.error('RECUSADO: o gerador produziu chave que não pode escrever:');
  for (const c of proibidas.slice(0, 10)) console.error('  ·', c);
  process.exit(1);
}

const totalChaves = plano.reduce((s, e) => s + e.pares.length, 0);
const bytesConteudo = plano.reduce((s, e) => s + e.pares.reduce((t, [, v]) => t + v.length, 0), 0);
const arquivos = EQUIPAMENTOS * 2 + EQUIPAMENTOS * RELS + 2; // foto + thumb + PDFs + logo + rubrica
const bytesArquivos = EQUIPAMENTOS * (bytesFoto + bytesThumb) + EQUIPAMENTOS * RELS * bytesPdf + 4408 + 14557;

console.log('── PLANO ────────────────────────────────────────────');
console.log(`perfil         ${PERFIL}   calibração: ${CALIBRACAO}`);
console.log(`org            ${ORG}${checagem.ehProducao ? '   ⚠ PRODUÇÃO' : '   (não-produção)'}`);
console.log(`seed           ${SEED}`);
console.log(`equipamentos   ${EQUIPAMENTOS}   relatórios/eq: ${RELS}`);
console.log(`chaves         ${totalChaves}   conteúdo: ${(bytesConteudo / 1048576).toFixed(2)} MB`);
console.log(`arquivos       ${arquivos}   bucket: ${(bytesArquivos / 1048576).toFixed(2)} MB`);
console.log(`tamanhos       foto ${KB_FOTO} KB · thumb ${KB_THUMB} KB · pdf ${KB_PDF} KB`);
console.log('─────────────────────────────────────────────────────');

if (DRY) {
  console.log('--dry-run: nada foi escrito.');
  process.exit(0);
}

// ── daqui para baixo, escreve ───────────────────────────────────────────────
const EMAIL = process.env.MASSA_EMAIL;
const SENHA = process.env.MASSA_SENHA;
if (!EMAIL || !SENHA || !URL_SB || !ANON) {
  console.error('RECUSADO: faltam MASSA_EMAIL, MASSA_SENHA, e URL/ANON (via .env, --url ou MASSA_URL/MASSA_ANON).');
  process.exit(1);
}

const sb = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: sessao, error: erroLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao?.user) {
  console.error('login falhou:', erroLogin?.message);
  process.exit(1);
}
// A RPC deriva a org de auth.uid(); se o login não for da org pedida, ela recusaria
// silenciosamente na org errada. Conferir aqui é mais barato que descobrir depois.
const { data: perfilRow } = await sb.from('profiles').select('org_id').eq('id', sessao.user.id).maybeSingle();
const orgDaSessao = perfilRow?.org_id ?? sessao.user.id;
if (orgDaSessao !== ORG) {
  console.error(`RECUSADO: a sessão pertence à org ${orgDaSessao}, e --org pediu ${ORG}.`);
  process.exit(1);
}

const DISPOSITIVO = `massa-escala-f8-${SEED}`;
let escritas = 0, falhas = 0;
const errosVistos = new Map();

async function gravar(chave, valor) {
  const { data, error } = await sb.rpc('aplicar_mutacao_storage', {
    p_chave: chave,
    p_mutation_id: randomUUID(),
    p_op: 'set',
    p_valor: valor,
    p_versao_esperada: 0, // 0 = espera que a chave NÃO exista; massa nova nunca sobrescreve
    p_dispositivo: DISPOSITIVO,
    p_mutado_em: new Date().toISOString(),
  });
  if (error) { falhas++; errosVistos.set(error.message, (errosVistos.get(error.message) ?? 0) + 1); return false; }
  const status = data?.status;
  if (status && status !== 'aplicado' && status !== 'ok') {
    falhas++;
    const m = `${status}:${data?.motivo ?? ''}`;
    errosVistos.set(m, (errosVistos.get(m) ?? 0) + 1);
    return false;
  }
  escritas++;
  return true;
}

async function subir(caminho, bytes, mime) {
  const { error } = await sb.storage.from('inspecao').upload(caminho, bytes, { contentType: mime, upsert: true });
  if (error) { falhas++; errosVistos.set(`storage:${error.message}`, (errosVistos.get(`storage:${error.message}`) ?? 0) + 1); }
}

const t0 = Date.now();

// Logo e rubrica: um par para toda a massa — é o que o content-addressing faria.
await subir(`${ORG}/logos/f8-${SEED}-logo.jpg`, jpegSintetico(SEED, 4408), 'image/jpeg');
await subir(`${ORG}/assinaturas/f8-${SEED}-rubrica.png`, pngSintetico(SEED, 14557), 'image/png');

const amostraDeTamanho = [];
for (const eq of plano) {
  const foto = jpegSintetico(SEED + eq.n, bytesFoto);
  const thumb = jpegSintetico(SEED + eq.n + 1_000_000, bytesThumb);
  await subir(eq.caminhos.foto, foto, 'image/jpeg');
  await subir(eq.caminhos.foto.replace(/\.jpg$/, '.thumb.jpg'), thumb, 'image/jpeg');
  for (let i = 0; i < RELS; i++) {
    const pdf = pdfSintetico(SEED + eq.n * 100 + i, bytesPdf);
    await subir(eq.caminhos.pdf(i), pdf, 'application/pdf');
    if (amostraDeTamanho.length < 3) amostraDeTamanho.push({ tipo: 'pdf', alvo: bytesPdf, real: pdf.length, desvio: desvio(pdf.length, bytesPdf) });
  }
  for (const [chave, valor] of eq.pares) await gravar(chave, valor);
  if (eq.n % 25 === 0) process.stdout.write(`\r  ${eq.n}/${EQUIPAMENTOS} equipamentos · ${escritas} chaves · ${falhas} falhas`);
}

const segundos = (Date.now() - t0) / 1000;
console.log(`\n── RESULTADO ────────────────────────────────────────`);
console.log(`chaves gravadas ${escritas}   falhas: ${falhas}   tempo: ${segundos.toFixed(1)}s`);
for (const [msg, n] of errosVistos) console.log(`  ! ${n}× ${msg}`);
for (const a of amostraDeTamanho) console.log(`  tamanho ${a.tipo}: alvo ${a.alvo} · real ${a.real} · desvio ${(a.desvio * 100).toFixed(2)}%`);

// Manifesto: sem ele o número medido não é rastreável até a massa que o produziu.
const manifesto = {
  seed: SEED, perfil: PERFIL, calibracao: CALIBRACAO, org: ORG, url: URL_SB,
  equipamentos: EQUIPAMENTOS, relatoriosPorEquipamento: RELS,
  kbFoto: KB_FOTO, kbThumb: KB_THUMB, kbPdf: KB_PDF,
  chavesPlanejadas: totalChaves, chavesGravadas: escritas, falhas,
  bytesConteudo, bytesArquivos, segundos,
  node: process.version, geradoEm: new Date().toISOString(),
};
try { mkdirSync(new URL('../../docs/medicoes/', import.meta.url), { recursive: true }); } catch { /* já existe */ }
const destino = new URL(`../../docs/medicoes/massa-f8-${PERFIL}-${SEED}-${EQUIPAMENTOS}.json`, import.meta.url);
writeFileSync(destino, JSON.stringify(manifesto, null, 2));
console.log(`manifesto: ${destino.pathname.split('/').pop()}`);
process.exit(falhas > 0 ? 2 : 0);
