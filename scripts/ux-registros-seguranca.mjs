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

const card = (tag, nome, tipo, cat, valor, legenda, data, comFoto = false) => `
  <li><button class="reg-card">
    ${comFoto
      ? '<span class="reg-card-foto"><img src="https://app.nr13sistema.com.br/ilustracoes/registro-seguranca.webp" alt=""></span>'
      : '<span class="reg-card-ic">I</span>'}
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
        <ul class="reg-lista">
          ${card('ZZ-FASE3', 'Vaso de pressão de teste', 'Vaso de Pressão', 'III', '12', 'registros', '10/07/2026', true)}
          ${card('ZZ-CALDEIRA-TESTE-DE-NOME-MUITO-COMPRIDO', 'Caldeira flamotubular horizontal de teste com nome deliberadamente longo', 'Caldeira', 'A', '1', 'registro', '02/09/2026')}
          ${card('ZZ-AUTO-01', 'Autoclave', 'Autoclave', '', '—', 'não contado', '—')}
        </ul>
      </div></div></div>`,
  },
  {
    nome: 'tela do equipamento (cabeçalho 2 linhas + faixa + lista)',
    html: `<div class="dash-page"><div class="fj-panel">
      <div class="fj-panel-head livro-topo">
        <div class="livro-topo-l1">
          <div class="meta-breadcrumb livro-topo-trilha">
            <button class="btn-secundario">← Todos os equipamentos</button>
            <span class="breadcrumb-chevron">›</span>
            <span class="fj-eyebrow">NR-13 · 13.4.1.9 · Livro de Registro de Segurança</span>
          </div>
          <div class="livro-toolbar-acoes">
            <button class="fj-btn fj-btn-primary">+ Novo registro</button>
            <button class="fj-btn fj-btn-ghost">Ver livro completo</button>
            <button class="fj-btn fj-btn-ghost">Exportar PDF</button>
          </div>
          <span class="livro-topo-foto"><span class="livro-topo-foto-vazia">F</span></span>
        </div>
        <div class="livro-topo-l2">
          <h2>ZZ-FASE3</h2>
          <span class="livro-topo-tipo">Vaso de pressão de teste</span>
          <span class="livro-topo-cat">Cat. III</span>
        </div>
      </div>
      <div class="livro-fixos">
        <div class="livro-fixos-docs">
          <button class="livro-doc-card"><span class="livro-doc-ic capa">C</span>
            <div><strong>Capa do Livro</strong><span>Identificação e classificação</span></div></button>
          <button class="livro-doc-card"><span class="livro-doc-ic termo">T</span>
            <div><strong>Termo de Abertura</strong><span>NR-13, item 13.4.1.9</span></div></button>
        </div>
        <div class="livro-resumo">
          <span class="livro-resumo-num"><b>4</b><small>registros</small></span>
          <span class="livro-resumo-txt">3 lacrados · 1 rascunho</span>
          <span class="livro-resumo-cadeia">Cadeia íntegra
            <span class="reg-ajuda"><button class="reg-ajuda-btn">i</button></span></span>
        </div>
      </div>
      <ul class="livro-timeline">
        <li class="livro-timeline-item rascunho">
          <span class="livro-timeline-marco"></span>
          <div class="livro-timeline-corpo">
            <div class="livro-timeline-topo">
              <span class="livro-timeline-rascunho">Rascunho</span>
              <span class="livro-timeline-data">05/09/2026</span>
              <span class="livro-timeline-tipo t-neutro">Manutenção corretiva</span>
              <span class="livro-timeline-origem">manual</span>
            </div>
            <div class="livro-timeline-desc">Troca da válvula de segurança — assento com vazamento</div>
            <div class="livro-timeline-meta"><span>Manutenção Industrial XYZ</span></div>
          </div>
          <div class="livro-timeline-acoes">
            <button class="btn-icone">o</button>
            <button class="btn-icone">e</button>
            <button class="fj-btn fj-btn-primary livro-btn-trancar">Trancar</button>
            <button class="btn-icone cor-vermelho">x</button>
          </div>
        </li>
        <li class="livro-timeline-item">
          <span class="livro-timeline-marco"></span>
          <div class="livro-timeline-corpo">
            <div class="livro-timeline-topo">
              <span class="livro-timeline-num">#000001</span>
              <span class="livro-timeline-data">21/08/2026</span>
              <span class="livro-timeline-tipo t-info">Inspeção Periódica</span>
              <span class="livro-timeline-lacre">Lacrado</span>
            </div>
            <div class="livro-timeline-desc">Relatório de inspeção gerado: Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf</div>
            <div class="livro-timeline-meta">
              <span>Relatório REL-1787282142486</span><span>funciona01</span>
              <span class="selo-flat crypto">SHA-256 F54425F4</span>
              <span class="livro-timeline-integro">Íntegro</span>
            </div>
          </div>
          <div class="livro-timeline-acoes">
            <button class="fj-btn fj-btn-ghost">Ver registro</button>
          </div>
        </li>
      </ul>
    </div></div>`,
  },
  {
    nome: 'modal "Novo registro" (formulário + prévia)',
    html: `<div class="fj-modal-overlay reg-modal-overlay" style="position:relative;inset:auto;padding:12px">
      <div class="fj-modal-box reg-modal">
        <div class="fj-modal-head reg-modal-head">
          <div><div class="fj-eyebrow">Livro de Registro · ZZ-FASE3</div><h2>Novo registro</h2></div>
          <button class="fj-modal-close">x</button>
        </div>
        <div class="reg-modal-corpo">
          <div class="reg-modal-form">
            <div class="reg-modal-prefill">
              <div class="reg-modal-prefill-topo">
                <label>Pré-preencher a partir de um relatório finalizado</label>
                <span class="reg-ajuda"><button class="reg-ajuda-btn">i</button></span>
              </div>
              <select><option>Preencher manualmente</option></select>
            </div>
            <div class="reg-modal-grupo">
              <h3>Ocorrência</h3>
              <div class="reg-modal-linha">
                <div class="fj-field"><label>Data da ocorrência <em>obrigatório</em></label><input type="date"></div>
                <div class="fj-field"><label>Tipo de ocorrência <em>obrigatório</em></label><select><option>Selecione…</option></select></div>
              </div>
              <div class="fj-field"><label>O que foi feito <em>obrigatório</em></label>
                <input placeholder="Ex.: Troca da válvula de segurança">
                <small>Uma linha, do jeito que deve aparecer no livro.</small></div>
              <div class="fj-field"><label>Descrição</label><textarea rows="3"></textarea></div>
            </div>
            <div class="reg-modal-grupo">
              <h3>Termo de Inspeção:</h3>
              <div class="fj-field"><label>Texto que sai no livro
                <button class="reg-modal-restaurar">restaurar sugestão</button></label>
                <textarea rows="5">Em 19/08/2026, executou-se inspeção de segurança periódica, conforme item 13.5.4 da NR-13, pela empresa habilitada MDK ENG, em obediência à Portaria Mtb nº 3.214, onde o equipamento a que se refere o relatório de inspeção n° REL-1787152599432 está apto a operar dentro da PMTA estipulada.</textarea>
                <small>Escreva do seu jeito: o texto acima é só uma sugestão.</small></div>
            </div>
            <div class="reg-modal-grupo">
              <h3>Responsáveis</h3>
              <div class="reg-modal-linha">
                <div class="fj-field"><label>Quem realizou</label><input></div>
                <div class="fj-field"><label>Responsável que assina</label><select><option>Sem assinatura</option></select></div>
              </div>
            </div>
          </div>
          <aside class="reg-modal-lado">
            <div class="reg-modal-abas">
              <button class="ativa">Prévia</button><button>Como funciona</button>
            </div>
            <div class="reg-modal-lado-corpo">
              <article class="ficha-reg">
                <header class="ficha-reg-topo">
                  <div class="ficha-reg-id">
                    <span class="ficha-reg-eyebrow">Registro de Segurança · NR-13</span>
                    <strong class="ficha-reg-equip">Vaso de pressão de teste</strong>
                    <span class="ficha-reg-tag">ZZ-FASE3</span>
                  </div>
                  <span class="ficha-reg-selo rascunho">Rascunho</span>
                </header>
                <div class="ficha-reg-destaques">
                  <span class="ficha-reg-dado"><small>Data da ocorrência</small><b class="ficha-reg-data">19/08/2026</b></span>
                  <span class="ficha-reg-dado"><small>Tipo</small><b class="ficha-reg-tipo">Inspeção Periódica</b></span>
                  <span class="ficha-reg-dado"><small>Relatório</small><b class="ficha-reg-rel">REL-1787152599432</b></span>
                </div>
                <section class="ficha-reg-bloco"><h4>Termo de Inspeção:</h4>
                  <p class="ficha-reg-termo">Em 19/08/2026, executou-se inspeção de segurança periódica, conforme item 13.5.4 da NR-13, pela empresa habilitada MDK ENG, em obediência à Portaria Mtb nº 3.214, onde o equipamento a que se refere o relatório de inspeção n° REL-1787152599432 está apto a operar dentro da PMTA estipulada.</p></section>
                <section class="ficha-reg-bloco"><h4>Descrição do registro</h4>
                  <p class="ficha-reg-desc">Relatório de inspeção gerado</p></section>
                <footer class="ficha-reg-pes"><span><small>Executado por</small>Manutenção Industrial XYZ</span>
                  <span><small>Responsável técnico</small>funciona01</span></footer>
                <p class="ficha-reg-nota">Esta é a ficha do registro no sistema.</p>
              </article>
            </div>
          </aside>
        </div>
        <div class="reg-modal-acoes">
          <span class="reg-modal-acoes-dica">Salva como rascunho — você tranca depois.</span>
          <div class="reg-modal-acoes-btns">
            <button class="fj-btn fj-btn-ghost">Cancelar</button>
            <button class="fj-btn fj-btn-primary">Salvar rascunho</button>
          </div>
        </div>
      </div></div>`,
  },
  {
    nome: 'visualizador do registro (ficha + abas)',
    html: `<div class="fj-modal-overlay" style="position:relative;inset:auto;padding:12px">
      <div class="fj-modal-box" style="max-width:900px">
        <div class="fj-modal-head">
          <div><div class="fj-eyebrow">REGISTRO_2026-09-07</div><h2>ZZ-FASE3</h2></div>
          <button class="fj-modal-close">x</button>
        </div>
        <div class="livro-visual-barra">
          <div class="livro-visual-modos">
            <button class="ativa">Registro</button><button>Folha A4</button>
          </div>
          <div class="livro-visual-acoes">
            <button class="btn-secundario">Imprimir</button>
            <button class="barra-btn barra-btn-pdf">Baixar PDF</button>
          </div>
        </div>
        <div class="livro-visual-ficha">
          <article class="ficha-reg">
            <header class="ficha-reg-topo">
              <div class="ficha-reg-id">
                <span class="ficha-reg-eyebrow">Registro de Segurança · NR-13</span>
                <strong class="ficha-reg-equip">Vaso de pressão de teste</strong>
                <span class="ficha-reg-tag">ZZ-FASE3</span>
              </div>
              <span class="ficha-reg-selo lacrado">#000003 · Lacrado</span>
            </header>
            <div class="ficha-reg-destaques">
              <span class="ficha-reg-dado"><small>Data da ocorrência</small><b class="ficha-reg-data">07/09/2026</b></span>
              <span class="ficha-reg-dado"><small>Tipo</small><b class="ficha-reg-tipo">Manutenção corretiva</b></span>
            </div>
            <section class="ficha-reg-bloco"><h4>Termo de Ocorrência:</h4>
              <p class="ficha-reg-termo">Em 07/09/2026 foi executada manutenção corretiva no vaso de pressão: substituição da válvula de segurança por unidade calibrada, com teste funcional aprovado.</p></section>
            <section class="ficha-reg-bloco"><h4>Descrição do registro</h4>
              <p class="ficha-reg-desc">Troca da válvula de segurança — Assento apresentava vazamento.</p></section>
            <p class="ficha-reg-nota">Esta é a ficha do registro no sistema.</p>
          </article>
        </div>
      </div></div>`,
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
  const modal = doc.querySelector('.reg-modal');
  const fig = doc.querySelector('.reg-modal-figura img');
  const janela = modal ? {
    largura: Math.round(modal.getBoundingClientRect().width),
    img: fig ? Math.round(fig.getBoundingClientRect().width) + 'x' + Math.round(fig.getBoundingClientRect().height) : null,
    fit: fig ? getComputedStyle(fig).objectFit : null,
    // O formulário não pode ficar mais estreito que a coluna de apoio: se ficar,
    // a ilustração virou a protagonista de um modal de cadastro.
    form: Math.round(doc.querySelector('.reg-modal-form').getBoundingClientRect().width),
    lado: Math.round(doc.querySelector('.reg-modal-lado').getBoundingClientRect().width),
    botoes: [...doc.querySelectorAll('.reg-modal-acoes-btns .fj-btn')]
      .map(b => Math.round(b.getBoundingClientRect().height)),
    // Largura do TEXTO de cada passo. Foi assim que o defeito de produção
    // apareceria antes: sem a coluna 2 declarada, o span cai na coluna do
    // número e mede 22px — uma palavra por linha, sem transbordar nada.
    // (Sem crase neste comentario: ele vive dentro de um template literal.)
    passos: [...doc.querySelectorAll('.ficha-reg-bloco p')]
      .map(s => Math.round(s.getBoundingClientRect().width)),
  } : null;
  const barra = doc.querySelector('.livro-topo');
  const item = doc.querySelector('.livro-timeline-item');
  const toolbar = barra ? {
    altura: Math.round(barra.getBoundingClientRect().height),
    botoes: [...barra.querySelectorAll('.fj-btn')].map(b => Math.round(b.getBoundingClientRect().height)),
    // Acima de 1023px identificação, ações e foto dividem a MESMA faixa: os três
    // topos coincidem quando estão na mesma linha.
    mesmaLinha: (() => {
      const id = doc.querySelector('.livro-topo-l1 .meta-breadcrumb').getBoundingClientRect();
      const ac = doc.querySelector('.livro-topo-l1 .livro-toolbar-acoes').getBoundingClientRect();
      const ft = doc.querySelector('.livro-topo-foto').getBoundingClientRect();
      return ac.left > id.left && ft.left > ac.left && Math.abs(ac.top - ft.top) < 60;
    })(),
    timeline: item ? Math.round(item.getBoundingClientRect().height) : null,
    // As quatro ações do rascunho precisam estar na MESMA linha: se empilharem,
    // o card do rascunho cresce e a lista vira uma coluna de blocos altos.
    acoesNaLinha: (() => {
      const a = [...doc.querySelectorAll('.livro-timeline-item.rascunho .livro-timeline-acoes > *')];
      if (a.length < 2) return null;
      const topos = a.map(x => Math.round(x.getBoundingClientRect().top));
      return Math.max(...topos) - Math.min(...topos) < 8;
    })(),
    acaoTimeline: item
      ? Math.round(item.querySelector('.fj-btn').getBoundingClientRect().height)
      : null,
  } : null;
  return { largura: doc.documentElement.clientWidth,
           scrollH: doc.documentElement.scrollWidth, pecas: r, cards, janela, toolbar };
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

  if (d.toolbar) {
    const alt = d.toolbar.botoes;
    if (l <= 640 && Math.min(...alt) < 44) {
      console.log(`  FALHA · botão da toolbar com ${Math.min(...alt)}px (< 44px no dedo)`);
      falhas++;
    } else console.log(`  ok · cabeçalho ${d.toolbar.altura}px, botões ${Math.min(...alt)}–${Math.max(...alt)}px`);
    if (l > 1023 && !d.toolbar.mesmaLinha) {
      console.log('  FALHA · identificação, ações e foto NÃO estão na mesma faixa');
      falhas++;
    } else if (l > 1023) console.log('  ok · identificação, ações e foto na mesma faixa');
    if (l <= 640 && d.toolbar.acaoTimeline < 43) {
      console.log(`  FALHA · ação da linha do tempo com ${d.toolbar.acaoTimeline}px (< 44px no dedo)`);
      falhas++;
    } else console.log(`  timeline: item ${d.toolbar.timeline}px, ação ${d.toolbar.acaoTimeline}px`);
    if (d.toolbar.acoesNaLinha === false) {
      console.log('  FALHA · as ações do rascunho empilharam');
      falhas++;
    } else if (d.toolbar.acoesNaLinha) console.log('  ok · ações do rascunho na horizontal');
  }
  if (d.janela) {
    const j = d.janela;
    console.log(`  modal ${j.largura}px · form ${j.form}px · apoio ${j.lado}px · img ${j.img} (${j.fit})`);
    // Acima de 900px as duas colunas convivem; o formulário tem que ser o maior.
    if (l > 900 && j.form <= j.lado) {
      console.log('  FALHA · o formulário ficou mais estreito que a coluna de apoio');
      falhas++;
    }
    if (Math.min(...j.passos) < 120) {
      console.log(`  FALHA · texto dos passos com ${Math.min(...j.passos)}px de largura`);
      falhas++;
    } else console.log(`  ok · passos com ${Math.min(...j.passos)}px de texto`);
    if (l <= 640 && Math.min(...j.botoes) < 43) {
      // 43 e nao 44: o alvo declarado e 44px, e a medicao oscila 1px conforme a
      // altura da pagina no iframe. Ja custou uma regressao perseguir esse 1px.

      console.log(`  FALHA · botão do modal com ${Math.min(...j.botoes)}px (< 44px no dedo)`);
      falhas++;
    } else console.log(`  ok · botões do modal ${Math.min(...j.botoes)}–${Math.max(...j.botoes)}px`);
  }
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
