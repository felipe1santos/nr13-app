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
import { podeApagar, ORGS_DE_TESTE, PREFIXO, tagDaChave, ehTagDaSeed } from './seguranca.mjs';

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
  // `deletado_em is null`: a linha excluída CONTINUA na tabela, virada em
  // tombstone (§2-ter). Sem este filtro a limpeza reapaga o que já está morto —
  // inofensivo, porque a RPC é idempotente, mas em 5.000 equipamentos são
  // 55.000 chamadas de rede para não mudar nada. Os arquivos de uma chave já
  // tombstoneada não ficam órfãos por causa deste filtro: a varredura D2 abaixo
  // trabalha sobre o BUCKET, não sobre as chaves.
  const { data, error } = await sb.from('app_storage')
    .select('chave, versao')
    .eq('org_id', ORG)
    .is('deletado_em', null)
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
//
// TERCEIRO DEFEITO CONSERTADO AQUI (22/08/2026), medido no degrau de 5.000:
// numa rodada de 55.000 chaves, **2.004 falharam (3,6 %)** e a limpeza terminou
// assim mesmo, imprimindo uma linha de prova de aparência vitoriosa. Rodar o
// mesmo comando de novo removeu as 2.004 com ZERO falhas — ou seja, não eram
// recusas legítimas: eram TRANSITÓRIAS, sob 20 minutos de chamadas sequenciais
// com a pilha local também servindo 20.002 remoções de arquivo.
//
// Duas coisas faltavam, e são o mesmo defeito de fundo dos outros dois:
// incompletude SILENCIOSA. Agora a limpeza **repete o que falhou** e a prova
// confere **as chaves também**, não só o bucket.
let removidas = 0, falhas = 0;
const naoRemovidas = [];

async function apagar(linha) {
  // Segunda checagem, imediatamente antes de apagar. Barato, e é a última rede.
  if (!podeApagar(linha.chave, SEED)) { console.error('BUG: alvo recusado na segunda checagem:', linha.chave); return false; }
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
    if (falhas < 5) console.error('  ! falhou', linha.chave, error?.message ?? data?.motivo);
    return false;
  }
  return true;
}

for (const linha of alvos) {
  if (await apagar(linha)) removidas++;
  else { falhas++; naoRemovidas.push(linha); }
  if (removidas % 100 === 0) process.stdout.write(`\r  ${removidas}/${alvos.length} chaves removidas`);
}

// Repescagem. Duas passadas bastam para falha transitória; se sobrar depois
// disso, é problema de verdade e a prova no fim vai gritar.
for (let volta = 1; volta <= 2 && naoRemovidas.length; volta++) {
  const repetir = naoRemovidas.splice(0, naoRemovidas.length);
  console.log(`\nrepescagem ${volta}: ${repetir.length} chave(s) que falharam`);
  for (const linha of repetir) {
    if (await apagar(linha)) { removidas++; falhas--; }
    else naoRemovidas.push(linha);
  }
}

// ── arquivos ────────────────────────────────────────────────────────────────
//
// DOIS DEFEITOS CONSERTADOS AQUI EM 22/08/2026, os dois encontrados medindo os
// degraus 100 e 500 no laboratório, e os dois SILENCIOSOS — a limpeza reportava
// sucesso e deixava arquivo para trás:
//
//   D1 · `list()` devolve no máximo 1.000 objetos por chamada. A pasta
//        `relatorios/` passa disso já em 500 equipamentos com 2 relatórios
//        cada, e o excedente ficava. Medido: 200 PDFs da seed 3 sobreviveram a
//        uma limpeza que se declarou completa. Agora `listarTudo` pagina até o
//        fim, e `remove` vai em lotes.
//
//   D2 · O gerador sobe o arquivo ANTES da RPC. Quando a RPC recusa — foi o que
//        aconteceu ao reusar uma seed cujos tombstones já existiam — sobram
//        arquivos sem chave nenhuma apontando para eles. Como a limpeza deriva
//        as TAGs das CHAVES, esses órfãos eram invisíveis: sem chave, sem TAG,
//        sem remoção. Medido: 402 arquivos órfãos da seed 1.
//        Agora, além das pastas das TAGs vivas, varremos a raiz da org atrás de
//        QUALQUER pasta `ZZ-SCALE-F8-<seed>-<n>` — a verdade do bucket, não a
//        do banco.
let arquivosRemovidos = 0;

/** `list` pagina de 1.000 em 1.000. Sem isto, some arquivo em silêncio. */
async function listarTudo(prefixo) {
  const itens = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await sb.storage.from('inspecao')
      .list(prefixo, { limit: 1000, offset: inicio });
    if (error) { console.error(`  ! falha ao listar ${prefixo}:`, error.message); return itens; }
    if (!data?.length) return itens;
    itens.push(...data);
    if (data.length < 1000) return itens;
  }
}

async function limparPasta(prefixo, filtro = () => true) {
  const itens = await listarTudo(prefixo);
  const nomes = itens.filter((o) => filtro(o.name)).map((o) => `${prefixo}/${o.name}`);
  for (let i = 0; i < nomes.length; i += 500) {
    const lote = nomes.slice(i, i + 500);
    const { error } = await sb.storage.from('inspecao').remove(lote);
    if (error) console.error('  ! falha ao remover lote:', error.message);
    else arquivosRemovidos += lote.length;
  }
}

const carimbo = `f8-${SEED}-`;

// Pastas das TAGs que ainda têm chave no banco.
for (const tag of tags) await limparPasta(`${ORG}/${tag}`);

// D2: pastas de TAG desta seed que existem no BUCKET mesmo sem chave no banco.
// `podeApagar` não serve aqui (é sobre chave); a checagem é a mesma regra de
// pertencimento da seed, aplicada ao nome da pasta.
const jaLimpas = new Set(tags);
const pastasOrfas = (await listarTudo(ORG))
  .map((o) => o.name)
  .filter((n) => ehTagDaSeed(n, SEED) && !jaLimpas.has(n));
if (pastasOrfas.length) {
  console.log(`órfãs no bucket ${pastasOrfas.length} pasta(s) sem chave no banco — removendo`);
  for (const pasta of pastasOrfas) await limparPasta(`${ORG}/${pasta}`);
}

await limparPasta(`${ORG}/relatorios`, (n) => n.startsWith(carimbo));
await limparPasta(`${ORG}/logos`, (n) => n.startsWith(carimbo));
await limparPasta(`${ORG}/assinaturas`, (n) => n.startsWith(carimbo));

// ── PROVA, não promessa ─────────────────────────────────────────────────────
//
// Relê o estado REAL das duas pontas — banco e bucket — em vez de confiar nos
// contadores do laço. Foi a falta disso do lado das CHAVES que deixou a rodada
// de 5.000 imprimir uma linha de sucesso com 2.004 chaves ainda vivas.

// 1) chaves: relista da fonte, sem reaproveitar nada da lista inicial.
const chavesVivas = [];
for (let inicio = 0; ; inicio += PAGINA) {
  const { data, error } = await sb.from('app_storage')
    .select('chave').eq('org_id', ORG).is('deletado_em', null)
    .order('chave', { ascending: true }).range(inicio, inicio + PAGINA - 1);
  if (error) { console.error('falha ao conferir chaves:', error.message); process.exit(4); }
  if (!data?.length) break;
  chavesVivas.push(...data.map((l) => l.chave));
  if (data.length < PAGINA) break;
}
const chavesSobraram = chavesVivas.filter((c) => podeApagar(c, SEED));

// 2) arquivos: raiz da org (pastas de TAG) e as três pastas compartilhadas.
const sobrouRaiz = (await listarTudo(ORG)).map((o) => o.name).filter((n) => ehTagDaSeed(n, SEED));
let arquivosSobraram = sobrouRaiz.length;
for (const p of ['relatorios', 'logos', 'assinaturas']) {
  arquivosSobraram += (await listarTudo(`${ORG}/${p}`)).filter((o) => o.name.startsWith(carimbo)).length;
}

console.log(`\nchaves removidas ${removidas}   falhas: ${falhas}   arquivos: ${arquivosRemovidos}`);

if (chavesSobraram.length || arquivosSobraram) {
  if (chavesSobraram.length) {
    console.error(`! SOBRARAM ${chavesSobraram.length} chave(s) vivas da seed ${SEED}. Exemplos:`);
    for (const c of chavesSobraram.slice(0, 5)) console.error(`  · ${c}`);
  }
  if (arquivosSobraram) {
    console.error(`! SOBRARAM ${arquivosSobraram} arquivo(s)/pasta(s) com o carimbo da seed ${SEED}.`);
  }
  console.error('A limpeza NÃO está completa. Rode o mesmo comando de novo — é idempotente.');
  process.exit(3);
}

console.log(`prova: 0 chaves vivas, 0 arquivos com o carimbo f8-${SEED}- e 0 pastas ZZ-SCALE-F8-${SEED}-*.`);
process.exit(falhas > 0 ? 2 : 0);
