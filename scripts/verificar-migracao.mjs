/**
 * Verifica uma migração de legado contra o BACKUP feito antes dela.
 *
 * O migrador confirma o upload antes de zerar o base64, mas "o script disse que
 * conferiu" não é verificação — é a mesma linha de código afirmando duas vezes.
 * Aqui a comparação é contra uma fonte independente: o dump tirado ANTES.
 *
 * Para cada arquivo que saiu do banco:
 *   1. acha o base64 original no backup (pelo caminho da chave);
 *   2. baixa do bucket o que a referência aponta;
 *   3. compara TAMANHO e SHA-256 dos bytes.
 *
 * Também confere que nenhuma chave sumiu e que nenhum registro ficou sem
 * arquivo nem referência — o estado que apareceria na tela como "sem foto" ou
 * "certificado sem arquivo".
 *
 * Uso:
 *   MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/verificar-migracao.mjs <backup-antes.json>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

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
const ANTES = process.argv[2];
if (!EMAIL || !SENHA || !ANTES) {
  console.log('uso: MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/verificar-migracao.mjs <backup-antes.json>');
  process.exit(1);
}

const { data: sessao } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
const ORG = sessao.user.id;

const backup = JSON.parse(readFileSync(ANTES, 'utf8'));
const antesPorChave = new Map(backup.linhas.map((l) => [l.chave, l.valor ?? '']));

const PAGINA = 500;
const agora = [];
for (let inicio = 0; ; inicio += PAGINA) {
  const { data } = await sb.from('app_storage').select('chave, valor')
    .eq('org_id', ORG).order('chave', { ascending: true }).range(inicio, inicio + PAGINA - 1);
  if (!data || data.length === 0) break;
  agora.push(...data);
  if (data.length < PAGINA) break;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const b64ParaBytes = (dataUrl) => {
  const v = String(dataUrl);
  return Buffer.from(v.slice(v.indexOf(',') + 1), 'base64');
};

/** Todos os pares (ref, base64 original) de um registro, em qualquer profundidade. */
function paresDe(depois, antes) {
  const pares = [];
  const percorrer = (nd, na) => {
    if (Array.isArray(nd)) {
      nd.forEach((filho, i) => percorrer(filho, Array.isArray(na) ? na[i] : undefined));
      return;
    }
    if (typeof nd !== 'object' || nd === null) return;
    const oa = (typeof na === 'object' && na !== null) ? na : {};
    // Foto: `ref` + o base64 que estava em `src`/`base64`.
    if (nd.ref?.path) pares.push({ ref: nd.ref, original: oa.src || oa.base64 || null });
    // PDF: `pdfRef` + o `pdfBase64`.
    if (nd.pdfRef?.path) pares.push({ ref: nd.pdfRef, original: oa.pdfBase64 || null });
    for (const k of Object.keys(nd)) percorrer(nd[k], oa[k]);
  };
  percorrer(depois, antes);
  return pares;
}

let arquivos = 0, ok = 0, semOriginal = 0;
const problemas = [];

for (const linha of agora) {
  const cru = linha.valor ?? '';
  if (!cru.includes('"path"')) continue;
  let depois, antes;
  try { depois = JSON.parse(cru); } catch { continue; }
  try { antes = JSON.parse(antesPorChave.get(linha.chave) ?? 'null'); } catch { antes = null; }

  for (const { ref, original } of paresDe(depois, antes)) {
    arquivos++;
    const baixado = await sb.storage.from('inspecao').download(ref.path);
    if (baixado.error || !baixado.data) {
      problemas.push(`${linha.chave} → arquivo AUSENTE no bucket: ${ref.path}`);
      continue;
    }
    const bytes = Buffer.from(await baixado.data.arrayBuffer());
    if (!original) {
      // Já era ref antes desta migração: não há original para comparar, mas o
      // arquivo tem que existir e não estar vazio.
      if (bytes.length === 0) problemas.push(`${linha.chave} → arquivo VAZIO: ${ref.path}`);
      else semOriginal++;
      continue;
    }
    const esperado = b64ParaBytes(original);
    if (bytes.length !== esperado.length) {
      problemas.push(`${linha.chave} → TAMANHO: bucket ${bytes.length} != original ${esperado.length}`);
    } else if (sha(bytes) !== sha(esperado)) {
      problemas.push(`${linha.chave} → SHA-256 DIVERGENTE em ${ref.path}`);
    } else {
      ok++;
      console.log(`  ok  ${(bytes.length / 1024).toFixed(0).padStart(6)} KB  ${linha.chave}`);
    }
  }
}

// Nenhuma chave pode ter sumido.
const sumidas = [...antesPorChave.keys()].filter((c) => !agora.some((l) => l.chave === c));

// Registro que perdeu o arquivo E não ganhou referência = dado perdido na tela.
const orfaos = agora.filter((l) => {
  const v = l.valor ?? '';
  return /"(pdfBase64|src|base64)":""/.test(v) && !v.includes('"path"');
}).map((l) => l.chave);

console.log('');
console.log(`arquivos conferidos byte a byte: ${ok}/${arquivos}` + (semOriginal ? ` (${semOriginal} já eram ref antes, só existência)` : ''));
console.log(`chaves antes: ${backup.linhas.length} | depois: ${agora.length} | sumidas: ${sumidas.length}`);
if (sumidas.length) console.log('  SUMIRAM:', sumidas.join(', '));
if (orfaos.length) console.log('  ÓRFÃOS (sem arquivo e sem ref):', orfaos.join(', '));
if (problemas.length) {
  console.log('\nPROBLEMAS:');
  for (const p of problemas) console.log('  ' + p);
  process.exitCode = 1;
} else if (!sumidas.length && !orfaos.length) {
  console.log('\nTUDO ÍNTEGRO.');
}
await sb.auth.signOut({ scope: 'local' });
