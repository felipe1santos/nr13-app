/**
 * Medição do Dashboard — ANTES × DEPOIS (07/09/2026).
 *
 * A rodada pediu prova, não impressão: altura dos quatro cards, distância do
 * topo da página até eles, área acima da dobra, transbordo e a largura da
 * lista de prazos, em 1400 / 768 / 386 px.
 *
 * Técnica, igual às outras medições deste repositório: Chrome headless, perfil
 * descartável e `<iframe>` para as larguras (o Chrome do Windows tem piso de
 * ~500px de JANELA, então medir redimensionando a janela mentiria em 386px).
 *
 * O "ANTES" vem de `git show HEAD:<css>` e o "DEPOIS" da árvore de trabalho —
 * os MESMOS três arquivos que compõem a folha do Dashboard (tokens, forja e
 * dashboard-novo). Não é o bundle compilado: o Vite não transforma estas
 * regras, ele só as concatena, e assim a comparação não depende de dois builds
 * completos.
 *
 *   node scripts/ux-dashboard.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LARGURAS = [1400, 768, 386];
const CSS = ['src/styles/tokens.css', 'src/styles/forja.css', 'src/pages/dashboard-novo.css'];

const cssDe = (versao) =>
  CSS.map((f) =>
    versao === 'depois'
      ? readFileSync(f, 'utf8')
      : execFileSync('git', ['show', `HEAD:${f}`], { encoding: 'utf8', maxBuffer: 1 << 24 }),
  ).join('\n');

/** O card de indicador, nas duas versões (a de antes não tem as classes de cor). */
const kpi = (versao, cor, rotulo, valor, legenda, classeLegenda = 'flat') => `
  <div class="fj-kpi${versao === 'depois' ? ` ${cor}` : ''}">
    <div>
      <div class="fj-kpi-label">${rotulo}</div>
      <div class="fj-kpi-value">${valor}</div>
      <div class="fj-kpi-delta ${classeLegenda}">${legenda}</div>
    </div>
    <div class="fj-kpi-icon"${versao === 'antes' ? ' style="background:var(--blue-bg);color:var(--blue)"' : ''}>
      <svg width="17" height="17"><rect width="17" height="17" fill="none"/></svg>
    </div>
  </div>`;

const linha = (tag, chip, classeChip, tipo, ult, venc, prazo) => `
  <tr>
    <td class="cel-titulo"><div class="fj-tag-cell"><div class="fj-tag-ico"></div>
      <div><div class="fj-tag-code">${tag}</div><div class="fj-eq-name">${tipo}</div></div></div></td>
    <td data-rot="Origem">${
      classeChip ? `<span class="orig-chip ${classeChip}">${chip}</span>` : chip
    }</td>
    <td class="mono col-ultima" data-rot="Última">${ult}</td>
    <td class="mono" data-rot="Vencimento">${venc}</td>
    <td class="fj-days warn" data-rot="Prazo"><span class="fj-prazo">${prazo}</span></td>
    <td data-rot="Status"><span class="fj-badge warn">Atenção</span></td>
  </tr>`;

function pagina(versao) {
  const chip = (rot, classe) => (versao === 'depois' ? [rot, classe] : [rot, '']);
  const [cInsp, kInsp] = chip('Inspeção', 'orig-inspecao');
  const [cCal, kCal] = chip('Calibração', 'orig-calibracao');
  const [cCert, kCert] = chip('Certificado', 'orig-certificado');
  return `<div class="dash-page">
  ${versao === 'antes' ? '<div class="fj-selo-painel">Dados de 16:27</div>' : ''}
  <div class="fj-kpi-row">
    ${kpi(versao, 'k-azul', 'Equipamentos cadastrados', '38', 'ativos sob NR-13')}
    ${kpi(versao, 'k-ambar', 'Próximos a vencer <span class="mono" style="font-size:10px">(30d)</span>', '3', versao === 'depois' ? 'inspeções, calibrações e certificados' : 'inspeções e calibrações')}
    ${kpi(versao, 'k-vermelho', 'Vencidos', '1', 'ação imediata', 'down')}
    ${kpi(versao, 'k-verde', 'Taxa de conformidade', '75<span style="font-size:13px;font-weight:500">%</span>', 'dos prazos deste painel em dia', 'up')}
  </div>
  ${versao === 'depois' ? '<div class="fj-selo-painel">Dados de 16:27</div>' : ''}
  <div class="dash-cols">
    <div class="dash-col">
      <div class="fj-panel" id="painel-prazos">
        <div class="fj-panel-head"><div><div class="fj-eyebrow">Prazos</div>
          <h2>${versao === 'depois' ? 'Prazos e vencimentos' : 'Equipamentos próximos do vencimento'}</h2></div>
          <span class="fj-badge crit">1 vencido</span></div>
        <div class="prazo-filtros">
          <button class="prazo-chip ativo">Todos</button><button class="prazo-chip">5 dias</button>
          <button class="prazo-chip">30 dias</button><button class="prazo-chip">60 dias</button>
          <button class="prazo-chip venc">Vencidos</button>
        </div>
        <div class="fj-table-wrap"><table class="fj-table">
          <thead><tr><th>Tag</th><th>Origem</th><th class="col-ultima">Última</th><th>Vencimento</th><th>Prazo</th><th>Status</th></tr></thead>
          <tbody>
            ${linha('ZZ-FASE3', cInsp, kInsp, 'Vaso de Pressão', '01/09/2026', '19/09/2026', 'Vence em 12 dias')}
            ${linha('MANOMETRO-55A', cCal, kCal, 'Manômetro · pertence a ZZ-FASE3', '01/03/2026', '16/09/2026', 'Vence em 9 dias')}
            ${linha('CERT-2026-118', cCert, kCert, 'Manômetro padrão', '—', '27/09/2026', 'Vence em 20 dias')}
          </tbody></table></div>
        <div class="fj-panel-foot"><button class="fj-link">Ver todos os vencimentos (3)</button></div>
      </div>
    </div>
    <div class="dash-col">
      <div class="fj-panel" id="painel-agenda">
        <div class="fj-panel-head"><div><div class="fj-eyebrow">Agenda</div><h2>Serviços do mês</h2></div>
          <button class="fj-btn fj-btn-primary">Abrir Agenda</button></div>
        <div class="ag-resumo"><div class="ag-resumo-linhas">
          <div class="ag-resumo-item previsto"><div class="ag-resumo-rot">Previsto</div><div class="ag-resumo-num">R$ 12.400,00</div></div>
          <div class="ag-resumo-item realizado"><div class="ag-resumo-rot">Realizado</div><div class="ag-resumo-num">R$ 8.000,00</div></div>
          <div class="ag-resumo-item"><div class="ag-resumo-rot">Serviços</div><div class="ag-resumo-num">4</div></div>
        </div><div class="ag-resumo-proximos">
          <div class="ag-resumo-proximo"><span class="data">10/09/2026</span><span class="titulo">Inspeção ZZ-FASE3</span><span class="fj-badge info2">Inspeção</span></div>
        </div></div>
      </div>
      ${
        versao === 'antes'
          ? `<div class="fj-panel" id="painel-alertas">
        <div class="fj-panel-head"><div><div class="fj-eyebrow">Prioridade</div><h2>Alertas críticos</h2></div>
          <button class="fj-link">Ver todos</button></div>
        <div class="alist">
          <div class="alist-item"><div class="alist-ic"></div><div class="alist-main">
            <div class="alist-title">Vencimento de inspeção</div><div class="alist-sub">ZZ-FASE3 · Vaso de Pressão</div>
          </div><span class="alist-badge">Atrasado</span></div>
          <div class="alist-item"><div class="alist-ic"></div><div class="alist-main">
            <div class="alist-title">Vencimento de calibração</div><div class="alist-sub">MANOMETRO-55A · Manômetro</div>
          </div><span class="alist-badge">Alta</span></div>
        </div></div>`
          : ''
      }
    </div>
  </div>
</div>`;
}

const MEDIR = `(doc => {
  const cards = [...doc.querySelectorAll('.fj-kpi')];
  const linha = doc.querySelector('.fj-kpi-row');
  const pagina = doc.querySelector('.dash-page');
  const prazos = doc.querySelector('#painel-prazos');
  const agenda = doc.querySelector('#painel-agenda');
  const alertas = doc.querySelector('#painel-alertas');
  const rp = pagina.getBoundingClientRect();
  const rl = linha.getBoundingClientRect();
  const dir = Math.max(...[...doc.querySelectorAll('*')].map(f => f.getBoundingClientRect().right), 0);
  const chips = [...doc.querySelectorAll('.orig-chip')];
  return {
    largura: doc.documentElement.clientWidth,
    alturaCards: cards.map(c => Math.round(c.getBoundingClientRect().height)),
    alturaLinhaKpi: Math.round(rl.height),
    topoAteCards: Math.round(rl.top - rp.top),
    // Até onde o painel de prazos COMEÇA: é o que o usuário ganha acima da dobra.
    topoAtePrazos: Math.round(prazos.getBoundingClientRect().top - rp.top),
    larguraPrazos: Math.round(prazos.getBoundingClientRect().width),
    larguraAgenda: Math.round(agenda.getBoundingClientRect().width),
    alturaPagina: Math.round(rp.height),
    temAlertas: !!alertas,
    chips: chips.map(c => getComputedStyle(c).color),
    corValor: cards.map(c => getComputedStyle(c.querySelector('.fj-kpi-value')).color),
    transborda: dir > doc.documentElement.clientWidth + 0.5,
    culpados: [...doc.querySelectorAll('*')]
      .filter(f => f.getBoundingClientRect().right > doc.documentElement.clientWidth + 0.5)
      .slice(0, 6)
      .map(f => f.tagName + '.' + (f.className || '') + '@' + Math.round(f.getBoundingClientRect().right)),
  };
})`;

async function medir(versao) {
  const css = cssDe(versao);
  const filho = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}
html,body{margin:0;padding:0;background:var(--steel)}</style>
<body>${pagina(versao)}</body>`;

  const dir = mkdtempSync(join(tmpdir(), `dash-${versao}-`));
  const pai = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#eee} iframe{border:0;display:block;height:1400px}
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

  const perfil = mkdtempSync(join(tmpdir(), 'perfil-dash-'));
  const dom = await new Promise((resolve, reject) => {
    const p = spawn(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${perfil}`,
      '--window-size=1600,1400',
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
    console.error(`não mediu (${versao}); DOM devolvido:\n` + dom.slice(0, 800));
    process.exit(1);
  }
  return JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  );
}

const antes = await medir('antes');
const depois = await medir('depois');

let falhas = 0;
for (const l of LARGURAS) {
  const a = antes[l];
  const d = depois[l];
  console.log(`\n── ${l}px (viewport medido: ${d.viewport}) ──`);
  if (d.viewport !== l) {
    console.log(`  FALHA · viewport ${d.viewport}px ≠ ${l}px pedidos`);
    falhas++;
  }
  const maxA = Math.max(...a.alturaCards);
  const maxD = Math.max(...d.alturaCards);
  console.log(`  card mais alto ....... ${maxA}px → ${maxD}px  (${maxD - maxA >= 0 ? '+' : ''}${maxD - maxA})`);
  console.log(`  bloco de KPIs ........ ${a.alturaLinhaKpi}px → ${d.alturaLinhaKpi}px`);
  console.log(`  topo → cards ......... ${a.topoAteCards}px → ${d.topoAteCards}px`);
  console.log(`  topo → lista prazos .. ${a.topoAtePrazos}px → ${d.topoAtePrazos}px`);
  console.log(`  largura lista prazos . ${a.larguraPrazos}px → ${d.larguraPrazos}px`);
  console.log(`  largura agenda ....... ${a.larguraAgenda}px → ${d.larguraAgenda}px`);
  console.log(`  card "Alertas críticos" presente: ${a.temAlertas} → ${d.temAlertas}`);
  console.log(`  chips de categoria ... ${a.chips.length} → ${d.chips.length}`);

  if (maxD >= maxA) {
    console.log(`  FALHA · o card não encolheu`);
    falhas++;
  }
  if (d.topoAteCards >= a.topoAteCards) {
    console.log(`  FALHA · o espaço acima dos cards não diminuiu`);
    falhas++;
  }
  if (d.temAlertas) {
    console.log(`  FALHA · "Alertas críticos" ainda está na página`);
    falhas++;
  }
  console.log(`  transborda ........... ${a.transborda} → ${d.transborda}`);
  if (d.transborda) {
    console.log('    culpados (antes): ' + (a.culpados || []).join(' , '));
    console.log('    culpados (depois): ' + (d.culpados || []).join(' , '));
  }
  // Regressão é o que importa: transbordo que NÃO existia antes.
  if (d.transborda && !a.transborda) {
    console.log(`  FALHA · a página passou a transbordar em ${l}px`);
    falhas++;
  }
  if (d.chips.length !== 3) {
    console.log(`  FALHA · esperava 3 chips de categoria, achei ${d.chips.length}`);
    falhas++;
  }
  const cores = new Set(d.corValor);
  if (cores.size < 4) {
    console.log(`  FALHA · os quatro números não têm quatro cores distintas: ${[...cores].join(' | ')}`);
    falhas++;
  } else {
    console.log(`  cores dos números .... ${d.corValor.join(' | ')}`);
  }
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
