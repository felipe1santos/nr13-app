/**
 * Verificação de responsividade das peças alteradas na reforma de UX.
 *
 * Sobe um Chrome headless PRÓPRIO (perfil descartável), com o CSS informado,
 * renderiza a marcação exata dos componentes tocados e mede transbordo
 * horizontal em 1400 / 768 / 386 px.
 *
 * Duas decisões que a medição obrigou:
 *
 * 1. a largura vem de um <iframe>, não de `--window-size`. O Chrome do Windows
 *    tem piso de largura de janela (~500px), e pedir 386 media 504 — as media
 *    queries do celular nem chegavam a valer. Dentro do iframe elas avaliam o
 *    viewport DELE, que é exatamente o que se quer medir;
 * 2. isolado, e não a tela logada: a aba do MCP vive na janela que o dono está
 *    usando, e medir lá exigiria trazê-la para a frente. O que esta reforma
 *    mudou é CSS, e é CSS o que se prova aqui.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const css = readFileSync(process.argv[2], 'utf8');
const LARGURAS = [1400, 768, 386];

const PECAS = [
  {
    nome: 'cal-lote-nome (campo que substituiu o window.prompt)',
    html: `<div class="cal-lote-nome">
      <input value="Lote de calibração — 06/09/2026">
      <button class="btn-primario">Salvar</button>
      <button class="btn-secundario">Cancelar</button>
    </div>`,
  },
  {
    nome: 'meta-card-header + primário (Lotes de calibração)',
    html: `<div class="meta-card-header"><h3>Lotes de calibração</h3>
      <button class="btn-primario">+ Novo lote de calibração</button></div>`,
  },
  {
    nome: 'meta-breadcrumb (trilha padronizada)',
    html: `<div class="meta-breadcrumb">
      <button class="btn-secundario">← Voltar</button>
      <span class="breadcrumb-chevron">›</span>
      <span class="crumb-tag-chip">ZZ-FASE3</span></div>`,
  },
  {
    nome: 'pront-linha (linha do histórico de prontuários)',
    html: `<div class="pront-lista"><button class="pront-linha">
      <span class="pront-linha-icone"></span>
      <span class="pront-linha-nome"><strong>ZZ-FASE3</strong>
        <span class="pront-linha-sub">Vaso de pressão de teste</span></span>
      <span class="pront-linha-col">Vaso de pressão</span>
      <span class="pront-linha-col">Cliente de teste</span>
      <span class="pront-linha-col">Categoria III</span>
      <span class="badge-relatorios tem">Prontuário</span></button></div>`,
  },
  {
    nome: 'botões lado a lado (as duas famílias)',
    html: `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn-primario">Salvar</button>
      <button class="fj-btn fj-btn-primary">Salvar</button>
      <button class="btn-secundario">Cancelar</button>
      <button class="fj-btn fj-btn-ghost">Cancelar</button>
      <button class="fj-btn fj-btn-danger">Excluir lote</button></div>`,
  },
];

const corpo = PECAS.map((p, i) => `<div class="peca" data-i="${i}">${p.html}</div>`).join('');

const MEDIR = `(doc => {
  const r = [];
  for (const el of doc.querySelectorAll('.peca')) {
    const filhos = [...el.querySelectorAll('*')];
    const dir = Math.max(...filhos.map(f => f.getBoundingClientRect().right), 0);
    r.push({ i: +el.dataset.i,
      altura: Math.round(el.getBoundingClientRect().height),
      transborda: dir > doc.documentElement.clientWidth + 0.5,
      direita: Math.round(dir) });
  }
  const botoes = [...doc.querySelectorAll('button')].map(b =>
    b.className.trim() + '=' + Math.round(b.getBoundingClientRect().height));
  return { largura: doc.documentElement.clientWidth,
           scrollH: doc.documentElement.scrollWidth, pecas: r, botoes };
})`;

const filho = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
html,body{margin:0;padding:0}.peca{padding:12px;border-bottom:1px solid #ddd}</style>
<body>${corpo}</body>`;

const dir = mkdtempSync(join(tmpdir(), 'resp-'));
const arqFilho = join(dir, 'filho.html');
writeFileSync(arqFilho, filho);
const urlFilho = 'file:///' + arqFilho.split('\\').join('/');

const pai = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#eee}
iframe{border:0;display:block;height:1100px}
</style><body>
${LARGURAS.map((l) => `<iframe data-l="${l}" style="width:${l}px" srcdoc="${filho.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`).join('')}
<script>
addEventListener('load', () => {
  const saida = {};
  for (const f of document.querySelectorAll('iframe')) {
    saida[f.dataset.l] = (${MEDIR})(f.contentDocument);
  }
  const pre = document.createElement('pre');
  pre.id = 'MEDIDA';
  pre.textContent = JSON.stringify(saida);
  document.body.appendChild(pre);
});
</script></body>`;
const arqPai = join(dir, 'pai.html');
writeFileSync(arqPai, pai);

const perfil = mkdtempSync(join(tmpdir(), 'perfil-'));
const dom = await new Promise((resolve, reject) => {
  const p = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    '--window-size=1600,1200',
    '--virtual-time-budget=4000',
    '--dump-dom',
    'file:///' + arqPai.split('\\').join('/'),
  ]);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.on('close', () => resolve(out));
  p.on('error', reject);
});

const m = dom.match(/<pre id="MEDIDA">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('não mediu; DOM devolvido:\n' + dom.slice(0, 800));
  process.exit(1);
}
const tudo = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

let falhas = 0;
for (const l of LARGURAS) {
  const d = tudo[l];
  console.log(`\n### ${l}px  (viewport medido = ${d.largura}px, scrollWidth = ${d.scrollH}px)`);
  if (d.largura !== l) {
    console.log(`  !! viewport não bateu com o pedido`);
    falhas++;
  }
  if (d.scrollH > d.largura) {
    console.log('  !! ROLAGEM HORIZONTAL');
    falhas++;
  } else console.log('  ok · sem rolagem horizontal');
  for (const p of d.pecas) {
    if (p.transborda) falhas++;
    console.log(
      `  ${p.transborda ? '!! TRANSBORDA' : 'ok           '} altura=${String(p.altura).padStart(3)}px  ${PECAS[p.i].nome}`,
    );
  }
  // A LINHA da lista também é <button>, e é uma linha: 44px no desktop, 56 no
  // celular, que é o alvo de toque. Só os botões de AÇÃO precisam bater entre si.
  const acoes = d.botoes.filter((b) => /btn-primario|btn-secundario|fj-btn/.test(b));
  const alturas = new Set(acoes.map((b) => b.split('=')[1]));
  console.log(`  botões: ${d.botoes.join('  ')}`);
  if (alturas.size > 1) {
    console.log(`  !! alturas de botão divergentes: ${[...alturas].join(', ')}`);
    falhas++;
  } else console.log(`  ok · todo botão com ${[...alturas][0]}px`);
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
