/**
 * Backup completo do `app_storage` de UMA organização, para arquivo local.
 *
 * POR QUE EXISTE: a migração do legado (`migrar-fotos-legadas.mjs`) reescreve
 * registros de produção de cliente pagante. Ela é cuidadosa — só zera o base64
 * depois de confirmar o arquivo no bucket, e a RPC recusa gravação com versão
 * divergente — mas "cuidadosa" não é "reversível". Este dump é o que torna
 * reversível: com ele, qualquer registro pode ser regravado exatamente como
 * estava.
 *
 * O arquivo sai com TODOS os bytes, base64 incluso, e por isso pesa o mesmo que
 * a conta (6-8 MB). É dado do cliente: guarde fora do repositório e apague
 * depois de a migração estar validada. O `.gitignore` já cobre `scratchpad/`.
 *
 * Uso:
 *   MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/backup-org.mjs <arquivo.json>
 *
 * Restaurar UMA chave (manual, e de propósito — restauração em massa por script
 * é como se apaga uma conta inteira por engano):
 *   node -e "const b=require('./bkp.json'); console.log(b.linhas.find(l=>l.chave==='X').valor)"
 * e regravar pela RPC `aplicar_mutacao_storage` com a `versao` atual.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

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
const DESTINO = process.argv[2];
if (!EMAIL || !SENHA || !DESTINO) {
  console.log('uso: MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/backup-org.mjs <arquivo.json>');
  process.exit(1);
}

const { data: sessao, error: erroLogin } = await sb.auth.signInWithPassword({ email: EMAIL, password: SENHA });
if (erroLogin || !sessao?.user) {
  console.log('login falhou:', erroLogin?.message);
  process.exit(1);
}
const ORG = sessao.user.id;

// Paginado: uma conta pesada tem mais linhas do que o teto padrão do PostgREST,
// e um backup truncado é pior que backup nenhum — dá falsa segurança.
const PAGINA = 500;
const linhas = [];
for (let inicio = 0; ; inicio += PAGINA) {
  const { data, error } = await sb.from('app_storage')
    .select('chave, valor, versao, atualizado_em, dispositivo, deletado_em')
    .eq('org_id', ORG)
    .order('chave', { ascending: true })
    .range(inicio, inicio + PAGINA - 1);
  if (error) { console.log('falha ao ler:', error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  linhas.push(...data);
  process.stdout.write(`\rlidas ${linhas.length} chaves...`);
  if (data.length < PAGINA) break;
}

const bytes = linhas.reduce((s, l) => s + (l.valor?.length ?? 0), 0);
writeFileSync(DESTINO, JSON.stringify({
  org_id: ORG,
  email: EMAIL,
  em: new Date().toISOString(),
  chaves: linhas.length,
  bytes,
  linhas,
}, null, 1));

console.log(`\nbackup: ${linhas.length} chaves | ${(bytes / 1024 / 1024).toFixed(2)} MB → ${DESTINO}`);
console.log('\nmaiores:');
for (const l of [...linhas].sort((a, b) => (b.valor?.length ?? 0) - (a.valor?.length ?? 0)).slice(0, 10)) {
  console.log(`  ${((l.valor?.length ?? 0) / 1024).toFixed(0).padStart(6)} KB  ${l.chave}`);
}
await sb.auth.signOut({ scope: 'local' });
