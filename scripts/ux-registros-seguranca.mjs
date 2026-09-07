/**
 * Responsividade da tela "Registros de Segurança" (07/09/2026).
 *
 * Mesma técnica de `ux-responsividade.mjs`, e pelas mesmas duas razões:
 *
 * 1. a largura vem de um <iframe>, não de `--window-size` — o Chrome do Windows
 *    tem piso de ~500px de janela, e pedir 386 mede 504, com as media queries
 *    do celular nunca chegando a valer;
 * 2. mede-se o CSS COMPILADO (`dist/assets/*.css`), não um arquivo solto: o
 *    card depende de tokens, do `forja.css` e do `listaRegistros.css` juntos, e
 *    é assim que eles chegam ao navegador do usuário.
 *
 * Uso: node scripts/ux-registros-seguranca.mjs [caminho.css]
 * (sem argumento, acha sozinho o bundle mais recente em dist/assets)
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LARGURAS = [1400, 768, 386];

const arqCss =
  process.argv[2] ||
  readdirSync('dist/assets')
    .filter((f) => f.endsWith('.css'))
    .map((f) => join('dist/assets', f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const css = readFileSync(arqCss, 'utf8');

const card = (tag, nome, tipo, cat, valor, legenda, data) => `
  <li><button class="reg-card">
    <span class="reg-card-ic">I</span>
    <span class="reg-card-id">
      <strong class="reg-card-tag">${tag}</strong>
      <span class="reg-card-nome">${nome}</span>
    </span>
    <span class="reg-card-marcas">
      <span class="fj-badge neutro">${tipo}</span>
      ${cat ? `<span class="fj-badge info2">Cat. ${cat}</span>` : ''}
    </span>
    <span class="reg-card-metricas">
      <span class="reg-metrica"><b>${valor}</b><small>${legenda}</small></span>
      <span class="reg-metrica reg-metrica-data"><b>${data}</b><small>último registro</small></span>
    </span>
    <span class="reg-card-acao">Abrir registros ›</span>
  </button></li>`;

const PECAS = [
  {
    nome: 'bloco de abertura (hero) da tela',
    html: `<div class="dash-page"><div class="fj-panel"><div class="fj-panel-head reg-hero">
      <div class="reg-hero-txt">
        <div class="fj-eyebrow">NR-13 · 13.4.1.9</div>
        <h2>Registros de Segurança</h2>
        <p>O histórico de cada equipamento — inspeções, manutenções e reparos — em ordem
        cronológica, com cada registro lacrado no momento em que é trancado. Abra um equipamento
        para ler a linha do tempo, lançar um novo registro ou exportar o documento completo.</p>
      </div>
      <span class="reg-hero-ic">S</span>
    </div></div></div>`,
  },
  {
    nome: 'barra compacta de busca',
    html: `<div class="dash-page"><div class="fj-panel"><div class="busca-lista compacta">
      <div class="busca-lista-linha">
        <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, equipamento, fabricante ou cliente…"></div>
        <div class="busca-lista-info"><span class="busca-lista-contagem">11 resultados</span></div>
      </div></div></div></div>`,
  },
  {
    nome: 'lista de cards (3 linhas, com nome longo)',
    html: `<div class="dash-page"><div class="fj-panel">
      <div class="bloco-dados painel-lista reg-painel">
        <div class="painel-lista-head">
          <span class="painel-lista-titulo"><strong>Equipamentos com registros</strong>
            <span>Cada linha é o histórico de segurança de um equipamento</span></span>
          <span class="painel-lista-contagem">3 equipamentos</span>
        </div>
        <ul class="reg-lista">
          ${card('ZZ-FASE3', 'Vaso de pressão de teste', 'Vaso de Pressão', 'III', '12', 'registros', '10/07/2026')}
          ${card('ZZ-CALDEIRA-TESTE-DE-NOME-MUITO-COMPRIDO', 'Caldeira flamotubular horizontal de teste com nome deliberadamente longo', 'Caldeira', 'A', '1', 'registro', '02/09/2026')}
          ${card('ZZ-AUTO-01', 'Autoclave', 'Autoclave', '', '—', 'não contado', '—')}
        </ul>
      </div></div></div>`,
  },
  {
    nome: 'estado vazio ilustrado',
    html: `<div class="dash-page"><div class="fj-panel"><div class="reg-vazio">
      <span class="reg-vazio-ic">L</span>
      <strong>Nenhum registro de segurança ainda</strong>
      <p>O equipamento entra nesta lista quando recebe o primeiro registro — a inspeção ou uma
      ocorrência de manutenção lançada no histórico dele.</p>
    </div></div></div>`,
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
  const cards = [...doc.querySelectorAll('.reg-card')].map(c => ({
    altura: Math.round(c.getBoundingClientRect().height),
    acao: Math.round(c.querySelector('.reg-card-acao').getBoundingClientRect().height),
    nomeCortado: (() => { const n = c.querySelector('.reg-card-nome');
      return n.scrollWidth > n.clientWidth + 1; })(),
  }));
  return { largura: doc.documentElement.clientWidth,
           scrollH: doc.documentElement.scrollWidth, pecas: r, cards };
})`;

const filho = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
html,body{margin:0;padding:0}.peca{padding:12px;border-bottom:1px solid #ddd}</style>
<body>${corpo}</body>`;

const dir = mkdtempSync(join(tmpdir(), 'resp-reg-'));
const pai = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#eee}
iframe{border:0;display:block;height:1400px}
</style><body>
${LARGURAS.map((l) => `<iframe data-l="${l}" style="width:${l}px" srcdoc="${filho.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`).join('')}
<script>
addEventListener('load', () => {
  const saida = {};
  for (const f of document.querySelectorAll('iframe')) {
    const r = (${MEDIR})(f.contentDocument);
    r.viewport = f.contentWindow.innerWidth;
    saida[f.dataset.l] = r;
  }
  const pre = document.createElement('pre');
  pre.id = 'MEDIDA';
  pre.textContent = JSON.stringify(saida);
  document.body.appendChild(pre);
});
</script></body>`;
const arqPai = join(dir, 'pai.html');
writeFileSync(arqPai, pai);

const perfil = mkdtempSync(join(tmpdir(), 'perfil-reg-'));
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
const tudo = JSON.parse(
  m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
);

console.log(`CSS medido: ${arqCss}\n`);
let falhas = 0;
for (const l of LARGURAS) {
  const d = tudo[l];
  console.log(`── ${l}px (viewport medido: ${d.viewport}) ──`);
  if (d.viewport !== l) {
    console.log(`  FALHA · viewport ${d.viewport}px ≠ ${l}px pedidos`);
    falhas++;
  }
  for (const p of d.pecas) {
    const nome = PECAS[p.i].nome;
    if (p.transborda) {
      console.log(`  FALHA · ${nome}: borda direita em ${p.direita}px > ${d.largura}px`);
      falhas++;
    } else console.log(`  ok · ${nome} (${p.altura}px de altura)`);
  }
  const acoes = d.cards.map((c) => c.acao);
  // No celular a ação do card é a barra de toque: 44px, a regra da rodada de UX.
  if (l <= 640 && Math.min(...acoes) < 44) {
    console.log(`  FALHA · ação do card com ${Math.min(...acoes)}px (< 44px no dedo)`);
    falhas++;
  } else console.log(`  ok · ação do card entre ${Math.min(...acoes)} e ${Math.max(...acoes)}px`);
  console.log(`  cards: alturas ${d.cards.map((c) => c.altura).join(', ')}px`);
  // O nome longo TEM que ser cortado com reticências — se ele não corta, é
  // porque empurrou o card, e aí o transbordo acima já teria acusado.
  console.log(`  nome longo cortado: ${d.cards.map((c) => (c.nomeCortado ? 'sim' : 'não')).join(', ')}`);
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
