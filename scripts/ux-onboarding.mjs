/**
 * Responsividade das ilustrações de onboarding (07/09/2026):
 * o estado do memorial antes do cálculo e o bloco de abertura do modal de
 * criar prontuário.
 *
 * Mesma técnica de `ux-registros-seguranca.mjs`: Chrome headless, perfil
 * descartável, larguras num <iframe> (o Chrome do Windows tem piso de ~500px de
 * janela) e o CSS COMPILADO, que é como as regras chegam ao usuário.
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LARGURAS = [1400, 768, 386];
// As ilustrações entram como data: URI do arquivo LOCAL — medir contra a
// produção mediria a versão que ainda não subiu, e um quadro vazio passa por
// "não carregou" sem dizer por quê.
const dataUri = (f) =>
  'data:image/webp;base64,' + readFileSync('public/ilustracoes/' + f).toString('base64');
const IMG_MEMORIAL = dataUri('memorial-calculo.webp');
const IMG_PRONTUARIO = dataUri('escolher-equipamento.webp');

const arqCss =
  process.argv[2] ||
  readdirSync('dist/assets')
    .filter((f) => f.endsWith('.css'))
    .map((f) => join('dist/assets', f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const css = readFileSync(arqCss, 'utf8');

const PECAS = [
  {
    nome: 'memorial · área do cálculo antes de gerar',
    html: `<div class="calc-terminal-section" style="border:1px solid #e7e7e3;border-radius:12px">
      <div class="memorial-log memorial-log-vazio">
        <figure class="memorial-vazio-fig"><img src="${IMG_MEMORIAL}" alt=""></figure>
        <strong>Memorial ainda não gerado</strong>
        <p>Preencha os dados estruturais do equipamento e clique em Gerar Cálculo para ver o
        memorial técnico desta geometria.</p>
      </div>
    </div>`,
  },
  {
    nome: 'prontuário · modal de criação com a abertura',
    html: `<div class="fj-modal-overlay" style="position:relative;inset:auto;padding:12px">
      <div class="fj-modal-box mcr-box">
        <div class="fj-modal-head">
          <div><div class="fj-eyebrow">Criar prontuário</div><h2>Selecione o equipamento</h2></div>
          <button class="fj-modal-close">x</button>
        </div>
        <div class="mcr-corpo mcr-corpo-lista">
          <div class="mcr-intro">
            <img src="${IMG_PRONTUARIO}" alt="">
            <strong>Escolha o equipamento</strong>
            <p>Selecione o equipamento que receberá o prontuário. O sistema abre o documento em
            seguida, com os dados que já existem na ficha preenchidos.</p>
          </div>
          <div class="busca-lista compacta"><div class="busca-lista-linha">
            <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, equipamento, fabricante ou cliente"></div>
            <div class="busca-lista-info"><span class="busca-lista-contagem">5 resultados</span></div>
          </div></div>
          <div class="sel-eq-lista">
            <button class="sel-eq-linha">
              <span class="sel-eq-foto"><span class="sel-eq-foto-vazia">ZZ</span></span>
              <span class="sel-eq-texto"><span class="sel-eq-tag">ZZ-FASE3</span>
                <span class="sel-eq-sub">Vaso de pressão de teste</span></span>
              <span class="sel-eq-col">Vaso de Pressão</span>
              <span class="sel-eq-col">Cliente de teste LTDA</span>
              <span class="sel-eq-col sel-eq-cat">Categoria III</span>
            </button>
            <button class="sel-eq-linha">
              <span class="sel-eq-foto"><span class="sel-eq-foto-vazia">CO</span></span>
              <span class="sel-eq-texto"><span class="sel-eq-tag">COMPRESSOR V8-15/200L</span>
                <span class="sel-eq-sub">Vaso de Pressão</span></span>
              <span class="sel-eq-col">Vaso de Pressão</span>
              <span class="sel-eq-col">—</span>
              <span class="sel-eq-col sel-eq-cat">—</span>
            </button>
          </div>
        </div>
      </div></div>`,
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
      transborda: dir > doc.documentElement.clientWidth + 0.5 });
  }
  const medirImg = (sel) => {
    const im = doc.querySelector(sel);
    if (!im) return null;
    const b = im.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height),
             fit: getComputedStyle(im).objectFit, carregou: im.complete && im.naturalWidth > 0 };
  };
  const lista = doc.querySelector('.sel-eq-lista');
  const intro = doc.querySelector('.mcr-intro');
  const caixa = doc.querySelector('.mcr-box');
  return {
    largura: doc.documentElement.clientWidth,
    pecas: r,
    memorial: medirImg('.memorial-vazio-fig img'),
    prontuario: medirImg('.mcr-intro img'),
    // Quanto do modal a abertura ocupa: acima de metade, a ilustração virou o
    // conteúdo e a lista virou detalhe.
    fracaoIntro: intro && caixa
      ? Math.round((intro.getBoundingClientRect().height / caixa.getBoundingClientRect().height) * 100)
      : null,
    listaVisivel: lista && caixa
      ? lista.getBoundingClientRect().top < caixa.getBoundingClientRect().bottom
      : null,
  };
})`;

const filho = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
html,body{margin:0;padding:0}.peca{padding:12px;border-bottom:1px solid #ddd}</style>
<body>${corpo}</body>`;

const dir = mkdtempSync(join(tmpdir(), 'onb-'));
const pai = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#eee}
iframe{border:0;display:block;height:1200px}
</style><body>
${LARGURAS.map((l) => `<iframe data-l="${l}" style="width:${l}px" srcdoc="${filho.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe>`).join('')}
<script>
addEventListener('load', () => {
  // As ilustrações vêm da rede: sem esperar, a medida sai do quadro vazio.
  setTimeout(() => {
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
  }, 1500);
});
</script></body>`;
const arqPai = join(dir, 'pai.html');
writeFileSync(arqPai, pai);

const perfil = mkdtempSync(join(tmpdir(), 'perfil-onb-'));
const dom = await new Promise((resolve, reject) => {
  const p = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    '--window-size=1600,1200',
    '--virtual-time-budget=8000',
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
    if (p.transborda) {
      console.log(`  FALHA · ${PECAS[p.i].nome}: transborda`);
      falhas++;
    } else console.log(`  ok · ${PECAS[p.i].nome} (${p.altura}px)`);
  }
  for (const [nome, im] of [['memorial', d.memorial], ['prontuário', d.prontuario]]) {
    if (!im) continue;
    if (!im.carregou) {
      console.log(`  FALHA · ilustração do ${nome} não carregou`);
      falhas++;
    } else console.log(`  ok · ilustração do ${nome}: ${im.w}x${im.h} (${im.fit})`);
  }
  if (d.fracaoIntro > 45) {
    console.log(`  FALHA · a abertura ocupa ${d.fracaoIntro}% do modal (> 45%)`);
    falhas++;
  } else console.log(`  ok · abertura ocupa ${d.fracaoIntro}% do modal, lista visível: ${d.listaVisivel}`);
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
