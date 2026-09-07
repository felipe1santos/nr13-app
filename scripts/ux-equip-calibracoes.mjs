/**
 * Responsividade de /equipamentos e /calibracoes (07/09/2026).
 *
 * Mesma técnica dos outros: Chrome headless, perfil descartável, larguras num
 * <iframe> (o Chrome do Windows tem piso de ~500px de janela) e o CSS
 * COMPILADO, que é como as regras chegam ao usuário.
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

const cardCal = (tag, tipo, cliente, fab, cat, pmta, cal) => `
  <button class="card-equipamento-horiz">
    <div class="card-eq-img"><span class="card-eq-img-vazio">${tag.slice(0, 2)}</span></div>
    <div class="card-eq-info cal-card-info">
      <div class="eq-col"><span class="eq-tag">${tag}</span><span class="eq-tipo">${tipo}</span></div>
      <div class="eq-col"><span class="eq-label">Proprietário</span><span class="eq-value">${cliente}</span></div>
      <div class="eq-col"><span class="eq-label">Fabricante</span><span class="eq-value">${fab}</span></div>
      <div class="eq-col"><span class="eq-label">Categoria</span><span class="eq-value">${cat}</span></div>
      <div class="eq-col"><span class="eq-label">PMTA</span><span class="eq-value">${pmta}</span></div>
    </div>
    <span class="badge-relatorios tem">${cal}</span>
  </button>`;

const PECAS = [
  {
    nome: '/equipamentos · barra única',
    html: `<div class="dashboard-page"><div class="busca-lista compacta"><div class="busca-lista-linha">
      <div class="equip-barra-esq">
        <span class="equip-barra-titulo">Equipamentos</span>
        <div class="equip-visao">
          <button class="equip-visao-btn ativo">G</button>
          <button class="equip-visao-btn">L</button>
        </div>
      </div>
      <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, descrição, fabricante, nº de série, cliente…"></div>
      <div class="busca-lista-info"><span class="busca-lista-contagem">39 resultados</span></div>
      <button class="fj-btn fj-btn-ghost equip-btn-filtro filtro-ativo"><span class="equip-btn-rotulo">Filtrar</span></button>
      <button class="fj-btn fj-btn-primary equip-btn-criar"><span class="equip-btn-rotulo">Criar equipamento</span></button>
    </div></div></div>`,
  },
  {
    nome: '/equipamentos · modal de filtro',
    html: `<div class="fj-modal-overlay" style="position:relative;inset:auto;padding:12px">
      <div class="fj-modal-box mfp-box">
        <div class="fj-modal-head">
          <div><div class="fj-eyebrow">Equipamentos</div><h2>Filtrar equipamentos</h2></div>
          <button class="fj-modal-close">x</button>
        </div>
        <div class="mfp-corpo">
          <section class="mfp-secao"><h3>Tipo do equipamento</h3><select><option>Todos os tipos</option></select></section>
          <section class="mfp-secao"><h3>Categoria de risco</h3><select><option>Todas as categorias</option></select></section>
          <section class="mfp-secao"><h3>Cliente</h3><select><option>Todos os clientes</option></select></section>
          <section class="mfp-secao"><h3>Fabricante</h3><select><option>Todos os fabricantes</option></select>
            <p class="mfp-nota">Cliente e fabricante são recortados sobre os equipamentos já carregados; tipo e categoria filtram na consulta.</p></section>
        </div>
        <div class="mfp-acoes">
          <button class="fj-btn fj-btn-ghost">Limpar filtros</button>
          <div class="mfp-acoes-dir">
            <button class="fj-btn fj-btn-ghost">Cancelar</button>
            <button class="fj-btn fj-btn-primary">Aplicar</button>
          </div>
        </div>
      </div></div>`,
  },
  {
    nome: '/calibracoes · instrução + cards',
    html: `<div class="calibracoes-page">
      <p class="cal-instrucao">[ selecione o equipamento para iniciar ]</p>
      <div class="bloco-dados"><div class="lista-cards-horiz">
        ${cardCal('ZZ-FASE3', 'Vaso de Pressão', 'Cliente de teste LTDA', 'Fabricante Industrial do Brasil S.A.', 'III', '2.25 MPa', '3 calibrações')}
        ${cardCal('COMPRESSOR V8-15/200L', 'Vaso de Pressão', '—', '—', '—', '—', '1 calibração')}
      </div></div>
    </div>`,
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
  const barra = doc.querySelector('.busca-lista-linha');
  const filtro = doc.querySelector('.equip-btn-filtro');
  const criar = doc.querySelector('.equip-btn-criar');
  const campo = doc.querySelector('.busca-lista-campo');
  const cards = [...doc.querySelectorAll('.card-equipamento-horiz')];
  const instr = doc.querySelector('.cal-instrucao');
  return {
    largura: doc.documentElement.clientWidth,
    pecas: r,
    barraUmaLinha: barra
      ? Math.round(barra.getBoundingClientRect().height) < 70
      : null,
    filtroAltura: filtro ? Math.round(filtro.getBoundingClientRect().height) : null,
    criarAltura: criar ? Math.round(criar.getBoundingClientRect().height) : null,
    // O funil e o criar ficam DEPOIS do campo de busca na linha.
    ordem: filtro && campo
      ? filtro.getBoundingClientRect().left > campo.getBoundingClientRect().left
      : null,
    corFiltro: filtro ? getComputedStyle(filtro).color : null,
    corInstrucao: instr ? getComputedStyle(instr).color : null,
    cards: cards.map(c => Math.round(c.getBoundingClientRect().height)),
    colunasVisiveis: cards.length
      ? [...cards[0].querySelectorAll('.cal-card-info .eq-col')]
          .filter(c => c.getBoundingClientRect().width > 0).length
      : null,
  };
})`;

const filho = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
html,body{margin:0;padding:0}.peca{padding:12px;border-bottom:1px solid #ddd}</style>
<body>${corpo}</body>`;

const dir = mkdtempSync(join(tmpdir(), 'eqcal-'));
const pai = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#eee}
iframe{border:0;display:block;height:1200px}
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

const perfil = mkdtempSync(join(tmpdir(), 'perfil-eqcal-'));
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
    if (p.transborda) {
      console.log(`  FALHA · ${PECAS[p.i].nome}: transborda`);
      falhas++;
    } else console.log(`  ok · ${PECAS[p.i].nome} (${p.altura}px)`);
  }
  // Acima de 640px a barra é UMA linha e a ordem importa. Abaixo disso ela
  // quebra de propósito, e os botões descem para a linha seguinte, à esquerda.
  if (l > 640 && d.ordem === false) {
    console.log('  FALHA · o funil não está depois da busca');
    falhas++;
  } else console.log(`  ok · filtro ${d.filtroAltura}px, criar ${d.criarAltura}px`);
  if (l <= 640 && (d.filtroAltura < 43 || d.criarAltura < 43)) {
    console.log('  FALHA · alvo de toque menor que 44px');
    falhas++;
  }
  console.log(`  cards de calibração: ${d.cards.join(', ')}px · colunas visíveis: ${d.colunasVisiveis}`);
  console.log(`  cor do filtro ${d.corFiltro} · cor da instrução ${d.corInstrucao}`);
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
