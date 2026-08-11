/**
 * Migração das fotos legadas em base64 → bucket `inspecao`.
 *
 * ORDEM QUE GARANTE A SEGURANÇA, por foto:
 *   1. decodifica o base64 para binário
 *   2. sobe para o bucket
 *   3. CONFIRMA que o arquivo existe lá e tem o tamanho esperado
 *   4. só então reescreve o registro com a referência
 *
 * O base64 só sai do banco depois do arquivo confirmado. Falha em qualquer
 * passo deixa o registro intacto e a próxima execução tenta de novo.
 *
 * Idempotente: foto que já tem `ref` é pulada.
 * Gravação pela RPC com versão esperada: se o cliente mexeu no registro nesse
 * meio tempo, a RPC recusa por conflito em vez de sobrescrever.
 *
 * Uso:
 *   node scratch-migrar-fotos.mjs simular            → não grava nada
 *   node scratch-migrar-fotos.mjs migrar "ACA 2038"  → uma TAG
 *   node scratch-migrar-fotos.mjs migrar-todas       → nr13_fotos_ inteiro
 *   node scratch-migrar-fotos.mjs migrar-docs        → containers de inspeção
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('C:/projetos/nr13-app/.env', 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const EMAIL = process.env.MIGRAR_EMAIL;
const SENHA = process.env.MIGRAR_SENHA;
if (!EMAIL || !SENHA) {
  console.log('defina MIGRAR_EMAIL e MIGRAR_SENHA no ambiente (a conta cujas fotos serao migradas)');
  process.exit(1);
}
const { data: sessao } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
const ORG = sessao.user.id;
const BUCKET = 'inspecao';

const acao = process.argv[2] ?? 'simular';
const alvo = process.argv[3] ?? null;
const simulando = acao === 'simular';

function sanitizar(txt) {
  return (txt || 'geral').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'geral';
}

/** dataURL → { bytes, mime, ext } */
function decodificar(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { bytes, mime, ext };
}

/** Sobe e CONFIRMA. Devolve a ref ou null. */
async function subirEConfirmar(dataUrl, escopo) {
  const dec = decodificar(dataUrl);
  if (!dec) return null;
  const path = `${ORG}/${sanitizar(escopo)}/${crypto.randomUUID()}.${dec.ext}`;

  const up = await sb.storage.from(BUCKET).upload(path, dec.bytes, { contentType: dec.mime, upsert: false });
  if (up.error) { console.log('    upload falhou:', up.error.message); return null; }

  // CONFIRMAÇÃO: o arquivo tem que existir e bater o tamanho. Sem isto, um
  // upload "aceito" mas truncado apagaria o base64 e perderia a foto.
  const baixado = await sb.storage.from(BUCKET).download(path);
  if (baixado.error || !baixado.data) { console.log('    confirmacao falhou'); return null; }
  if (baixado.data.size !== dec.bytes.length) {
    console.log(`    TAMANHO DIVERGENTE: ${baixado.data.size} != ${dec.bytes.length}`);
    return null;
  }
  return { bucket: BUCKET, path, mimeType: dec.mime, tamanho: dec.bytes.length };
}

/** Percorre o objeto trocando base64 por ref. Devolve quantas migrou. */
async function migrarNo(no, escopo, contador) {
  if (Array.isArray(no)) {
    for (const item of no) await migrarNo(item, escopo, contador);
    return;
  }
  if (typeof no !== 'object' || no === null) return;

  // Formato da galeria (`src`) e o dos formulários (`base64`).
  for (const campo of ['src', 'base64']) {
    const valor = no[campo];
    if (typeof valor === 'string' && valor.startsWith('data:image') && !no.ref) {
      contador.encontradas++;
      if (simulando) {
        // Substitui por uma ref do MESMO formato para o tamanho medido ser o
        // real. Sem isso o dry run informa que nada mudou.
        no.ref = { bucket: BUCKET, path: `${ORG}/${sanitizar(escopo)}/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', tamanho: 999999 };
        no[campo] = '';
        contador.migradas++;
        continue;
      }
      const ref = await subirEConfirmar(valor, escopo);
      if (!ref) { contador.falhas++; continue; }
      no.ref = ref;
      no[campo] = '';
      contador.migradas++;
    }
  }
  for (const v of Object.values(no)) await migrarNo(v, escopo, contador);
}

async function migrarChave(chave, escopo) {
  const { data, error } = await sb.from('app_storage')
    .select('valor, versao').eq('org_id', ORG).eq('chave', chave).maybeSingle();
  if (error || !data) { console.log(chave, '→ nao encontrado'); return null; }
  if (!(data.valor ?? '').includes('data:image')) { console.log(chave, '→ sem base64, pulando'); return null; }

  const antes = data.valor.length;
  let obj;
  try { obj = JSON.parse(data.valor); } catch { console.log(chave, '→ nao e JSON, pulando'); return null; }

  const c = { encontradas: 0, migradas: 0, falhas: 0 };
  await migrarNo(obj, escopo, c);
  if (c.migradas === 0) { console.log(chave, '→ nada migrado'); return null; }

  const novo = JSON.stringify(obj);
  if (simulando) {
    console.log(`${chave} → ${c.encontradas} fotos | ${(antes/1024).toFixed(0)} KB → ~${(novo.length/1024).toFixed(1)} KB (simulacao)`);
    return { antes, depois: novo.length, fotos: c.migradas };
  }

  const r = await sb.rpc('aplicar_mutacao_storage', {
    p_op: 'set', p_mutation_id: crypto.randomUUID(), p_chave: chave, p_valor: novo,
    p_versao_esperada: data.versao, p_dispositivo: 'migracao-fotos', p_mutado_em: new Date().toISOString(),
  });
  const st = r.data?.status;
  if (st !== 'aplicado' && st !== 'repetido') {
    console.log(`${chave} → RECUSADO (${st ?? r.error?.message}) — registro intacto, arquivos ficaram no bucket`);
    return null;
  }
  console.log(`${chave} → ${c.migradas} fotos | ${(antes/1024).toFixed(0)} KB → ${(novo.length/1024).toFixed(1)} KB` + (c.falhas ? ` | ${c.falhas} falhas` : ''));
  return { antes, depois: novo.length, fotos: c.migradas };
}

// ── execução ────────────────────────────────────────────────────────────────
let prefixo = 'nr13_fotos_';
if (acao === 'migrar-docs') prefixo = 'nr13_docs_';

let chaves = [];
if (alvo) {
  chaves = [`${prefixo}${alvo}`];
} else {
  const { data } = await sb.from('app_storage').select('chave, valor')
    .eq('org_id', ORG).like('chave', `${prefixo}%`).is('deletado_em', null);
  chaves = (data ?? []).filter((d) => (d.valor ?? '').includes('data:image')).map((d) => d.chave);
}

console.log(`acao=${acao} | ${chaves.length} chaves\n`);
let antes = 0, depois = 0, fotos = 0;
for (const chave of chaves) {
  const escopo = chave.slice(prefixo.length);
  const r = await migrarChave(chave, escopo);
  if (r) { antes += r.antes; depois += r.depois; fotos += r.fotos; }
}
console.log('');
console.log(`TOTAL: ${fotos} fotos | ${(antes/1024/1024).toFixed(2)} MB → ${(depois/1024).toFixed(0)} KB`);
await sb.auth.signOut({ scope: 'local' });
