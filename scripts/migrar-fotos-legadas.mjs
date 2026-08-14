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
 *   node scratch-migrar-fotos.mjs migrar-certificados → PDFs de nr13_rastreab_
 *   node scratch-migrar-fotos.mjs simular-certificados → o mesmo, sem gravar
 *   node scratch-migrar-fotos.mjs migrar-prontuarios   → PDFs de nr13_pront_fab_
 *   node scratch-migrar-fotos.mjs simular-prontuarios  → o mesmo, sem gravar
 *
 * Os modos `certificados` e `prontuarios` são separados porque o registro tem
 * outro FORMATO: o arquivo mora em `pdfBase64` (não em `src`/`base64`) e a
 * referência vai para `pdfRef` (não para `ref`). Os dois maiores pesos da conta
 * gabriel.dadona estavam aí: 5.451 KB e 1.941 KB num par de registros.
 *
 * `prontuarios` (`nr13_pront_fab_`) entrou em 14/08/2026: o PDF do prontuário do
 * fabricante aceita até 8 MB e é o MAIOR peso possível por chave no sistema.
 * Medido na conta engyuricesar: 5.614 KB numa única chave — 86% dos 6,37 MB da
 * organização inteira. O código que grava já usa `pdfRef` desde 11/08, mas a
 * migração é forward-only: registro nunca reescrito carrega o base64 para
 * sempre, e volta inteiro em cada hidratação completa.
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
const modoCertificados = acao === 'migrar-certificados' || acao === 'simular-certificados';
const modoProntuarios = acao === 'migrar-prontuarios' || acao === 'simular-prontuarios';
/** Os dois modos que movem um `pdfBase64` — mesmo código, escopos diferentes. */
const modoPdf = modoCertificados || modoProntuarios;
const simulando = acao === 'simular' || acao.startsWith('simular-');

function sanitizar(txt) {
  return (txt || 'geral').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'geral';
}

/** dataURL → { bytes, mime, ext } */
function decodificar(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');
  // `pdf` PRECISA estar aqui: sem ele o fallback dava `.jpg` a todo certificado e
  // prontuário do fabricante migrado (achado em 14/08/2026, na conta
  // engyuricesar — um PDF de 4,2 MB gravado como `.jpg`). Não quebra nada: o que
  // manda na leitura é o `contentType` do objeto, que sempre foi o correto, e o
  // app resolve pelo `blob.type`. Mas é o nome errado no bucket para sempre, e
  // qualquer download direto pelo painel do Supabase sai ilegível.
  // Os arquivos JÁ subidos com `.jpg` ficam como estão: re-migrar por causa da
  // extensão trocaria um defeito cosmético por risco em dado de produção.
  const ext = mime.includes('pdf') ? 'pdf'
    : mime.includes('png') ? 'png'
    : mime.includes('webp') ? 'webp'
    : 'jpg';
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

/**
 * Certificado de rastreabilidade: `pdfBase64` → arquivo no bucket + `pdfRef`.
 *
 * Formato diferente do das fotos, por isso a função separada. Mesma ordem de
 * segurança: sobe, CONFIRMA tamanho, e só então zera o base64 do registro.
 * Idempotente — registro que já tem `pdfRef` é pulado.
 *
 * `temPdf` é forçado para true: é ele que a interface e a injeção no relatório
 * consultam de forma síncrona (`temPdfDe`), e um registro que perdesse o base64
 * sem ganhar o marcador apareceria como "sem certificado".
 */
async function migrarPdfDoRegistro(chave, opcoes) {
  const { data, error } = await sb.from('app_storage')
    .select('valor, versao').eq('org_id', ORG).eq('chave', chave).maybeSingle();
  if (error || !data) { console.log(chave, '→ nao encontrado'); return null; }

  const antes = data.valor.length;
  let reg;
  try { reg = JSON.parse(data.valor); } catch { console.log(chave, '→ nao e JSON, pulando'); return null; }

  if (reg.pdfRef?.path) { console.log(chave, '→ ja migrado, pulando'); return null; }
  if (!reg.pdfBase64) { console.log(chave, '→ sem pdfBase64, pulando'); return null; }

  if (simulando) {
    const est = antes - reg.pdfBase64.length + 160; // ~tamanho da ref
    console.log(`${chave} → 1 PDF | ${(antes/1024).toFixed(0)} KB → ~${(est/1024).toFixed(1)} KB (simulacao)`);
    return { antes, depois: est, fotos: 1 };
  }

  const ref = await subirEConfirmar(reg.pdfBase64, opcoes.escopo);
  if (!ref) { console.log(chave, '→ upload/confirmacao falhou, registro intacto'); return null; }

  // Os marcadores só valem para o certificado: `temPdfDe()` os consulta de forma
  // síncrona. O prontuário do fabricante não os tem no tipo e decide por
  // `pdfRef?.path || pdfBase64` (ver lerProntuarioFabricante) — acrescentá-los ali
  // seria campo órfão num registro que o Portal do Cliente também lê.
  const marcadores = opcoes.marcadores ? { temPdf: true, pdfBytes: reg.pdfBase64.length } : {};
  const novo = JSON.stringify({ ...reg, pdfBase64: '', pdfRef: ref, ...marcadores });
  const r = await sb.rpc('aplicar_mutacao_storage', {
    p_op: 'set', p_mutation_id: crypto.randomUUID(), p_chave: chave, p_valor: novo,
    p_versao_esperada: data.versao, p_dispositivo: opcoes.dispositivo, p_mutado_em: new Date().toISOString(),
  });
  const st = r.data?.status;
  if (st !== 'aplicado' && st !== 'repetido') {
    console.log(`${chave} → RECUSADO (${st ?? r.error?.message}) — registro intacto, arquivo ficou no bucket`);
    return null;
  }
  console.log(`${chave} → 1 PDF | ${(antes/1024).toFixed(0)} KB → ${(novo.length/1024).toFixed(1)} KB`);
  return { antes, depois: novo.length, fotos: 1 };
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
if (modoCertificados) prefixo = 'nr13_rastreab_';
if (modoProntuarios) prefixo = 'nr13_pront_fab_';

let chaves = [];
if (alvo) {
  chaves = [`${prefixo}${alvo}`];
} else {
  const { data } = await sb.from('app_storage').select('chave, valor')
    .eq('org_id', ORG).like('chave', `${prefixo}%`).is('deletado_em', null);
  // Certificado guarda PDF (`data:application/pdf`), não imagem — o filtro de
  // `data:image` do caminho das fotos descartaria todos eles.
  chaves = (data ?? [])
    .filter((d) => (d.valor ?? '').includes(modoPdf ? '"pdfBase64":"data:' : 'data:image'))
    .map((d) => d.chave);
}

console.log(`acao=${acao} | ${chaves.length} chaves\n`);
let antes = 0, depois = 0, fotos = 0;
for (const chave of chaves) {
  const r = modoPdf
    ? await migrarPdfDoRegistro(chave, modoCertificados
        ? { escopo: 'certificados', marcadores: true, dispositivo: 'migracao-certificados' }
        : { escopo: 'prontuario-fabricante', marcadores: false, dispositivo: 'migracao-prontuarios' })
    : await migrarChave(chave, chave.slice(prefixo.length));
  if (r) { antes += r.antes; depois += r.depois; fotos += r.fotos; }
}
console.log('');
const unidade = modoPdf ? 'PDFs' : 'fotos';
console.log(`TOTAL: ${fotos} ${unidade} | ${(antes/1024/1024).toFixed(2)} MB → ${(depois/1024).toFixed(0)} KB`);
await sb.auth.signOut({ scope: 'local' });
