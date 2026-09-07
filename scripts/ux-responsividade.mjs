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
    nome: 'rel-linha · linha da lista de relatorios (desktop = 10 colunas)',
    html: `<div class="rel-page"><div class="rel-tabela-v9">
      <div class="rel-linha rel-linha-cabecalho" role="row">
        <span></span><span>Relatório</span><span>Nº relatório</span><span>TAG</span>
        <span>Tipo</span><span>Criação</span><span>Validade</span><span>Próxima</span>
        <span>Situação</span><span>Ações</span>
      </div>
      <div class="rel-linha" role="row">
        <span class="rel-cel-icone"><span class="rel-marca rel-marca-pdf"></span></span>
        <span class="rel-cel-nome"><b class="rel-nome-forte">Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf</b></span>
        <span class="rel-cel-codigo" data-rot="Nº relatório">REL-1788571268261</span>
        <span class="rel-cel-tag" data-rot="TAG">ZZ-FASE3</span>
        <span class="rel-cel-tipo" data-rot="Tipo">Inspeção Periódica</span>
        <span data-rot="Criação">05/09/2026</span>
        <span data-rot="Validade">05/09/2027</span>
        <span data-rot="Próxima">05/03/2027</span>
        <span data-rot="Situação"><span class="rel-selo rel-selo-finalizado">FINALIZADO</span></span>
        <span class="rel-cel-acoes">
          <button class="btn-icone cor-azul">V</button>
          <button class="btn-icone">R</button>
          <button class="btn-icone">A</button>
        </span>
      </div>
      <div class="rel-linha rel-linha-rascunho" role="row">
        <span class="rel-cel-icone"><span class="rel-marca rel-marca-rascunho"></span></span>
        <span class="rel-cel-nome"><b class="rel-nome-forte">Relatorio_Inspeção_Inicial_ZZ-CALDEIRA-TESTE.pdf</b></span>
        <span class="rel-cel-codigo" data-rot="Nº relatório">REL-1788999111222</span>
        <span class="rel-cel-tag" data-rot="TAG">ZZ-CALDEIRA-TESTE</span>
        <span class="rel-cel-tipo" data-rot="Tipo">Inspeção Inicial</span>
        <span data-rot="Criação">06/09/2026</span>
        <span data-rot="Validade">—</span>
        <span data-rot="Próxima">—</span>
        <span data-rot="Situação"><span class="rel-selo rel-selo-rascunho">RASCUNHO</span></span>
        <span class="rel-cel-acoes">
          <button class="btn-icone cor-azul">E</button>
          <button class="btn-icone">X</button>
        </span>
      </div>
    </div></div>`,
  },
  {
    nome: 'barra de /relatorios · filtro, busca e criar',
    html: `<div class="rel-page"><div class="busca-lista compacta"><div class="busca-lista-linha">
      <button class="fj-btn fj-btn-ghost rel-btn-filtro"><span class="rel-btn-rotulo">Período e tipo</span></button>
      <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, equipamento, nome ou nº do relatório"></div>
      <div class="busca-lista-info"><span class="busca-lista-contagem">27 resultados</span></div>
      <button class="fj-btn fj-btn-primary rel-btn-criar"><span class="rel-btn-rotulo">Criar relatório</span></button>
    </div></div></div>`,
  },
  {
    nome: 'sel-eq-linha · seleção de equipamento no modal',
    html: `<div class="sel-eq-lista"><button class="sel-eq-linha">
      <span class="sel-eq-foto"><span class="sel-eq-foto-vazia">ZZ</span></span>
      <span class="sel-eq-texto"><span class="sel-eq-tag">ZZ-FASE3</span><span class="sel-eq-sub">Vaso de pressão de teste</span></span>
      <span class="sel-eq-col">Vaso de Pressão</span>
      <span class="sel-eq-col">Cliente de teste LTDA</span>
      <span class="sel-eq-col sel-eq-cat">Categoria III</span>
    </button></div>`,
  },
  {
    nome: 'pront-linha · lista de prontuarios (desktop = 8 colunas)',
    html: `<div class="prontuarios-page"><div class="pront-lista">
      <div class="pront-linha pront-linha-cabecalho">
        <span></span><span>Equipamento</span><span>Tipo</span><span>Empresa / cliente</span>
        <span>Categoria</span><span>Emitido em</span><span>Situação</span>
        <span class="pront-col-acoes">Ações</span>
      </div>
      <div class="pront-linha pront-linha-emitido">
        <span class="pront-linha-icone"></span>
        <span class="pront-linha-nome"><strong>Vaso de pressão de teste</strong><span class="pront-linha-sub">ZZ-FASE3</span></span>
        <span class="pront-linha-col">Vaso de Pressão</span>
        <span class="pront-linha-col">Cliente de teste LTDA</span>
        <span class="pront-linha-col">III</span>
        <span class="pront-linha-col pront-linha-data">06/09/2026</span>
        <span class="pront-linha-situacao"><span class="pront-selo pront-selo-emitido">EMITIDO</span></span>
        <span class="pront-linha-acoes">
          <button class="btn-icone cor-azul">V</button>
          <button class="btn-icone">E</button>
          <button class="btn-icone cor-vermelho">X</button>
        </span>
      </div>
      <div class="pront-linha pront-linha-salvo">
        <span class="pront-linha-icone"></span>
        <span class="pront-linha-nome"><strong>ZZ-CALDEIRA-TESTE</strong><span class="pront-linha-sub">ZZ-CALDEIRA-TESTE</span></span>
        <span class="pront-linha-col">Caldeira</span>
        <span class="pront-linha-col">—</span>
        <span class="pront-linha-col">—</span>
        <span class="pront-linha-col pront-linha-data">—</span>
        <span class="pront-linha-situacao"><span class="pront-selo pront-selo-salvo">SALVO</span></span>
        <span class="pront-linha-acoes">
          <button class="btn-icone cor-azul">V</button>
          <button class="btn-icone">E</button>
          <button class="btn-icone cor-vermelho">X</button>
        </span>
      </div>
    </div></div>`,
  },
  {
    nome: 'barra de /prontuarios · filtro, busca e criar',
    html: `<div class="prontuarios-page"><div class="busca-lista compacta"><div class="busca-lista-linha">
      <button class="fj-btn fj-btn-ghost pront-btn-filtro"><span class="pront-btn-rotulo">Filtrar</span></button>
      <div class="fj-search-box busca-lista-campo"><input placeholder="Buscar por TAG, equipamento, fabricante ou cliente"></div>
      <div class="busca-lista-info"><span class="busca-lista-contagem">12 resultados</span></div>
      <button class="fj-btn fj-btn-primary pront-btn-criar"><span class="pront-btn-rotulo">Criar prontuário</span></button>
    </div></div></div>`,
  },
  {
    nome: 'topo do formulario do prontuario (barra + resumo)',
    html: `<div class="prontuarios-page"><div class="bloco-dados pront-topo">
      <div class="pront-barra">
        <button class="fj-btn fj-btn-ghost pront-barra-voltar">← <span class="pront-btn-rotulo">Voltar</span></button>
        <div class="pront-barra-id"><strong>Prontuário — ZZ-FASE3</strong><span>rascunho</span></div>
        <div class="pront-visualizador-acoes">
          <button class="fj-btn fj-btn-ghost"><span class="pront-btn-rotulo">Pré-visualizar</span><span class="pront-btn-icone">o</span></button>
          <button class="fj-btn fj-btn-primary">Salvar rascunho</button>
        </div>
      </div>
      <div class="pront-resumo">
        <span><b>Equipamento</b>Vaso de pressão de teste</span>
        <span><b>Tipo</b>Vaso de Pressão</span>
        <span><b>Cliente</b>Posto Shell Prime</span>
        <span><b>Categoria</b>III</span>
      </div>
    </div></div>`,
  },
  {
    nome: 'secao do formulario (grade + campo automatico)',
    html: `<div class="prontuarios-page"><div class="pront-form-secao">
      <div class="pront-form-secao-titulo">Empresa Proprietária</div>
      <div class="pront-form-grid">
        <div class="pront-campo pront-campo-full"><label>Razão Social<span class="pront-selo-auto">auto</span></label><input class="campo-auto" value="POSTO SHELL PRIME LTDA"></div>
        <div class="pront-campo"><label>CNPJ<span class="pront-selo-auto">auto</span></label><input class="campo-auto" value="00.000.000/0001-00"></div>
        <div class="pront-campo"><label>Telefone</label><input value=""></div>
        <div class="pront-campo pront-campo-full"><label>Endereço<span class="pront-selo-auto">auto</span></label><input class="campo-auto" value="Av. Brasil, 1000"></div>
        <div class="pront-campo"><label>Cidade</label><input value=""></div>
        <div class="pront-campo"><label>Estado</label><input value=""></div>
      </div>
    </div></div>`,
  },
  {
    nome: 'modal de ajuda com ilustracao (Calibracoes)',
    html: `<div class="fj-modal-overlay ajuda-overlay"><div class="fj-modal-box ajuda-box">
      <div class="ajuda-head">
        <div class="ajuda-head-txt">
          <div class="fj-eyebrow">Calibrações</div>
          <h2>Como funcionam as calibrações</h2>
          <p>As calibrações são organizadas por equipamento e por lote: primeiro você cadastra os acessórios do equipamento, depois cria um lote e registra a calibração de cada um.</p>
        </div>
        <button class="fj-modal-close">x</button>
      </div>
      <div class="ajuda-corpo">
        <figure class="ajuda-figura"><img src="https://app.nr13sistema.com.br/ilustracoes/fluxo-calibracao.webp" alt="fluxo"></figure>
        <ol class="ajuda-passos">
          <li><div><b>Cadastre os acessórios</b><span>Os componentes que pertencem ao equipamento — manômetros e válvulas de segurança (PSV).</span></div></li>
          <li><div><b>Crie um lote de calibração</b><span>O lote é a rodada daquela inspeção e mantém o histórico separado das anteriores.</span></div></li>
          <li><div><b>Calibre os acessórios do lote</b><span>Dentro do lote, cada componente cadastrado aparece com o botão Calibrar.</span></div></li>
          <li><div><b>Use o lote no relatório</b><span>Marcando um lote, as folhas de certificado dele entram no documento.</span></div></li>
        </ol>
        <p class="ajuda-nota"><span>O certificado do instrumento padrão fica em Certificados.</span></p>
      </div>
      <div class="ajuda-acoes"><button class="fj-btn fj-btn-primary">Entendi</button></div>
    </div></div>`,
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
  // Altura de cada LINHA da lista de relatorios — a densidade pedida (38–44px).
  const alturaLinhas = [...doc.querySelectorAll('.rel-linha:not(.rel-linha-cabecalho)')]
    .map(l => Math.round(l.getBoundingClientRect().height));
  const modal = doc.querySelector('.ajuda-box');
  const fig = doc.querySelector('.ajuda-figura img');
  const ajuda = modal ? {
    largura: Math.round(modal.getBoundingClientRect().width),
    altura: Math.round(modal.getBoundingClientRect().height),
    img: fig ? Math.round(fig.getBoundingClientRect().width) + 'x' + Math.round(fig.getBoundingClientRect().height) : null,
    fit: fig ? getComputedStyle(fig).objectFit : null,
  } : null;
  const alturaPront = [...doc.querySelectorAll('.pront-linha:not(.pront-linha-cabecalho)')]
    .map(l => Math.round(l.getBoundingClientRect().height));
  return { largura: doc.documentElement.clientWidth,
           scrollH: doc.documentElement.scrollWidth, pecas: r, botoes, alturaLinhas, alturaPront, ajuda };
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
    // innerWidth inclui a barra de rolagem; clientWidth nao. A largura PEDIDA
    // se confere pelo primeiro — senao uma pagina que cresceu e ganhou barra
    // vertical seria reprovada pelos 10px que o navegador tirou dela.
    // (Sem crase neste comentario: ele vive dentro de um template literal.)
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
  if ((d.viewport ?? d.largura) !== l) {
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
  /*
   * TOLERÂNCIA DE 1px, e ela é deliberada.
   *
   * A altura do botão sai do conteúdo, e um rótulo de texto puro mede 33,6px
   * onde um com <span> mede 34,2 — o navegador arredonda para 33 e 34. Tentei
   * eliminar isso com `line-height` (piorou: as duas famílias herdam valores
   * diferentes) e com um piso de `min-height` (pior ainda: por carregar depois
   * do `tokens.css`, o piso de 34 derrubou o alvo de toque de 44px no celular).
   *
   * Um pixel de diferença é invisível e não vale uma regressão de acessibilidade.
   * O que este teste tem de travar é o que se enxerga — 26 contra 34, 2 contra
   * 44 —, e é isso que a faixa faz.
   */
  const valores = acoes.map((b) => Number(b.split('=')[1]));
  const alturas = new Set(
    valores.length ? [Math.max(...valores) - Math.min(...valores) <= 1 ? 'ok' : 'divergente'] : [],
  );
  if (d.alturaLinhas?.length) console.log(`  linhas de /relatorios: ${d.alturaLinhas.join(', ')}px`);
  if (d.alturaPront?.length) console.log(`  linhas de /prontuarios: ${d.alturaPront.join(', ')}px`);
  if (d.ajuda) console.log(`  modal de ajuda: ${d.ajuda.largura}x${d.ajuda.altura}px · imagem ${d.ajuda.img} · ${d.ajuda.fit}`);
  console.log(`  botões: ${d.botoes.join('  ')}`);
  if (alturas.has('divergente')) {
    console.log(`  !! alturas de botão divergentes: ${[...new Set(valores)].join(', ')}px`);
    falhas++;
  } else console.log(`  ok · botões de ação entre ${Math.min(...valores)} e ${Math.max(...valores)}px`);
}
console.log(falhas === 0 ? '\nRESULTADO: sem falha.' : `\nRESULTADO: ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
