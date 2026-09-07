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
    nome: 'prontuário · modal de criação (lista + apoio)',
    html: `<div class="fj-modal-overlay" style="position:relative;inset:auto;padding:12px">
      <div class="fj-modal-box mcr-box mcr-box-2col">
        <div class="fj-modal-head">
          <div><div class="fj-eyebrow">Criar prontuário</div><h2>Selecione o equipamento</h2></div>
          <button class="fj-modal-close">x</button>
        </div>
        <div class="mcr-corpo-2col">
          <div class="mcr-col-lista mcr-corpo-lista">
            <div class="busca-lista compacta"><div class="busca-lista-linha">
              <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, equipamento, fabricante ou cliente"></div>
              <div class="busca-lista-info"><span class="busca-lista-contagem">5 resultados</span></div>
            </div></div>
            <div class="lista-cards-horiz">
              ${[
                ['ZZ-FASE3', 'Vaso de Pressão', 'III', '2.25 MPa'],
                ['COMPRESSOR V8-15/200L', 'Vaso de Pressão', '—', '—'],
                ['DASDSA', 'Vaso de Pressão', 'I', '1.10 MPa'],
                ['ZZ-CALDEIRA-TESTE', 'Caldeira', 'A', '—'],
              ].map(([tag, tipo, cat, pmta]) => `<button class="card-equipamento-horiz">
                <div class="card-eq-img"><span class="card-eq-img-vazio">${tag.slice(0,2)}</span></div>
                <div class="card-eq-info">
                  <div class="eq-col"><span class="eq-tag">${tag}</span><span class="eq-tipo">${tipo}</span></div>
                  <div class="eq-col"><span class="eq-label">Categoria</span><span class="eq-value">${cat}</span></div>
                  <div class="eq-col"><span class="eq-label">PMTA</span><span class="eq-value">${pmta}</span></div>
                </div>
                <span class="badge-relatorios tem">Prontuário OK</span>
              </button>`).join('')}
            </div>
          </div>
          <aside class="mcr-col-apoio">
            <div class="mcr-intro">
              <img src="${IMG_PRONTUARIO}" alt="">
              <strong>Escolha o equipamento</strong>
              <p>Selecione ao lado o equipamento que vai receber o prontuário.</p>
              <ul class="mcr-intro-passos">
                <li>O documento abre já com os dados da ficha preenchidos.</li>
                <li>Você completa o que faltar e salva como rascunho.</li>
                <li>A emissão acontece depois, quando o prontuário estiver pronto.</li>
              </ul>
            </div>
          </aside>
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
  const lista = doc.querySelector('.lista-cards-horiz');
  const linhas = [...doc.querySelectorAll('.card-equipamento-horiz')]
    .map(c => Math.round(c.getBoundingClientRect().height));
  const colLista = doc.querySelector('.mcr-col-lista');
  const colApoio = doc.querySelector('.mcr-col-apoio');
  const intro = doc.querySelector('.mcr-intro');
  const larguras = colLista && colApoio
    ? { lista: Math.round(colLista.getBoundingClientRect().width),
        apoio: Math.round(colApoio.getBoundingClientRect().width),
        ladoALado: Math.abs(colLista.getBoundingClientRect().top - colApoio.getBoundingClientRect().top) < 10 }
    : null;
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
    linhas, larguras,
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
  if (d.larguras) {
    const { lista, apoio, ladoALado } = d.larguras;
    if (l > 900 && (!ladoALado || lista <= apoio)) {
      console.log(`  FALHA · colunas: lista ${lista}px, apoio ${apoio}px, lado a lado: ${ladoALado}`);
      falhas++;
    } else console.log(`  ok · lista ${lista}px / apoio ${apoio}px (lado a lado: ${ladoALado})`);
  }
  if (d.linhas && d.linhas.length) {
    const alt = Math.max(...d.linhas);
    // O card da tela de equipamentos tem 92px. Dentro do modal a pergunta é
    // "qual destes?", e caber mais equipamentos vale mais que o respiro.
    // No celular o card EMPILHA (regra global de `relatorios.css`), e aí a
    // altura maior é o comportamento certo: as colunas viram linhas.
    if (l > 640 && alt > 70) {
      console.log(`  FALHA · linha da lista com ${alt}px (esperado <= 70)`);
      falhas++;
    } else console.log(`  ok · linhas da lista com ${Math.min(...d.linhas)}–${alt}px`);
  }
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
