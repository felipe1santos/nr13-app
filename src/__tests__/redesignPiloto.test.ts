import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRUPOS_MENU, ITENS_BAIXO, ITENS_TOPO, itensDoGrupo, itensSemGrupo } from '../app/menu';

/**
 * Redesign Forja Compacto — telas piloto (25/10/2026).
 *
 * Direção aprovada em `docs/design/direcao.md` (Opção A). Estes testes travam
 * o que a fase entregou para não voltar sem querer: os tokens novos existem e
 * são nomes NOVOS (nada global muda de cor), a sidebar é agrupada sem perder
 * item nenhum, o cabeçalho é de uma linha, e o Dashboard não tem mais bloco de
 * cor chapada.
 *
 * Os arquivos são lidos com o fim de linha normalizado: no Windows o checkout
 * vem em CRLF, e um teste que procura "\n" dentro do fonte falharia por isso.
 */
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const TOKENS = ler('src/styles/tokens.css');
const LAYOUT = ler('src/app/Layout.tsx');
const LAYOUT_CSS = ler('src/app/layout.css');
const DASH = ler('src/pages/Dashboard.tsx');

describe('tokens Forja Compacto', () => {
  it('as escalas existem', () => {
    for (const t of ['--s-1: 4px', '--s-4: 16px', '--fs-13: 13px', '--r-md: 8px', '--h-ctl: 32px', '--h-row: 40px', '--h-header: 48px', '--h-toolbar: 44px', '--h-toque: 44px']) {
      expect(TOKENS, t).toContain(t);
    }
  });

  it('uma cor de ação, e é o âmbar de sempre', () => {
    expect(TOKENS).toContain('--acao: var(--amber);');
  });

  it('o texto secundário novo passa de 4,5:1 (o --muted antigo não passava)', () => {
    expect(TOKENS).toContain('--texto-2: #4F5A63;');
    expect(TOKENS).toContain('--texto-3: #66717A;');
  });

  it('não redefine --surface/--border: 87 usos com fallback mudariam de cor fora do piloto', () => {
    expect(TOKENS).not.toMatch(/--surface\s*:/);
    expect(TOKENS).not.toMatch(/--border\s*:/);
  });
});

describe('sidebar agrupada', () => {
  it('todo item de topo e de baixo está num grupo, no rodapé (Info) ou nos soltos — nenhum some', () => {
    const todos = [...ITENS_TOPO, ...ITENS_BAIXO];
    const agrupados = GRUPOS_MENU.flatMap((g) => itensDoGrupo(g, todos)).map((i) => i.id);
    const soltos = itensSemGrupo(todos).map((i) => i.id);
    for (const item of todos) {
      const visivel = agrupados.includes(item.id) || soltos.includes(item.id) || item.id === 'info';
      expect(visivel, item.id).toBe(true);
    }
  });

  it('um item SEM grupo cai nos soltos em vez de sumir', () => {
    const novo = { id: 'modulo-novo', to: '/novo', label: 'Novo', icone: 'box' as const };
    expect(itensSemGrupo([novo]).map((i) => i.id)).toEqual(['modulo-novo']);
  });

  it('recolhe, e a preferência fica fora do prefixo nr13_ (que é de dado sincronizado)', () => {
    expect(LAYOUT).toContain("'forja.menu.recolhido'");
    expect(LAYOUT).toContain('menu-recolhido');
    expect(LAYOUT).not.toMatch(/localStorage\.[a-zA-Z]+\(\s*'nr13_menu/);
  });

  it('com o menu recolhido, o item tem nome acessível', () => {
    expect(LAYOUT).toContain('aria-label={recolhida ? item.label : undefined}');
  });
});

describe('cabeçalho de 48px', () => {
  it('uma linha: sem o subtítulo na tela, que vira dica do título', () => {
    expect(LAYOUT).not.toContain('className="path"');
    expect(LAYOUT).toContain('<h1 title={sub || undefined}>{titulo}</h1>');
  });

  it('altura fixa pelo token', () => {
    expect(LAYOUT_CSS).toMatch(/\.topbar \{[^}]*height: var\(--h-header\);/);
  });

  it('"Último login" mora no menu da conta, não no cabeçalho', () => {
    expect(LAYOUT).not.toContain('className="login-info"');
    expect(LAYOUT).toContain('ultimoLogin={ultimoLoginTexto()}');
  });
});

describe('Dashboard: um KPI dominante, quatro secundários, sem bloco colorido', () => {
  it('o banner vermelho de largura total e os cartões coloridos saíram', () => {
    expect(DASH).not.toContain('alert-banner');
    expect(DASH).not.toMatch(/k-(azul|ambar|vermelho|verde)/);
  });

  it('um dominante e exatamente quatro secundários', () => {
    expect(DASH.match(/className=\{`pc-kpi-dom/g)).toHaveLength(1);
    const sec = DASH.slice(DASH.indexOf('className="pc-kpi-sec"'), DASH.indexOf('<SeloPainel'));
    expect(sec.match(/className="pc-kpi-rot"/g)).toHaveLength(4);
  });

  it('contador indefinido continua sendo "sem resposta", nunca zero', () => {
    expect(DASH).toContain('textoContador(nVencidos)');
    expect(DASH).toContain('Sem resposta do servidor');
  });

  it('o estado vazio só afirma ausência depois de conferir (§21)', () => {
    expect(DASH).toContain('consultaIncompleta ? (');
    expect(DASH).toContain('Prazos não conferidos');
  });

  it('certificado de padrão continua levando a /certificados, não a uma ficha que não existe', () => {
    expect(DASH).toContain("navigate('/certificados')");
  });
});

describe('visualizador de Relatórios: uma barra de 44px, PDF no resto da altura', () => {
  const REL = ler('src/pages/Relatorios.tsx');
  const V9 = ler('src/features/relatorios/RelatoriosV9.tsx');
  const VIS = ler('src/components/VisualizadorPdf.tsx');
  const PREVIA = ler('src/features/relatorios/PreviaVetorial.tsx');
  const BARRA_CSS = ler('src/features/relatorios/barraDocumento.css');

  it('rascunho e finalizado usam a MESMA barra', () => {
    expect(REL).toContain('<BarraDocumento');
    expect(V9).toContain('<BarraDocumento');
    // A faixa de ações antiga e a barra "Voltar à busca" separada saíram.
    expect(REL).not.toContain('className="meta-barra-fixa');
    expect(V9).not.toContain('className="rel-doc-barra');
  });

  it('página e zoom entram na barra por portal, sem estado duplicado', () => {
    expect(VIS).toContain('createPortal(barra, barraEm)');
    expect(REL).toContain('barraEm={slotBarra}');
    expect(V9).toContain('barraEm={slotBarra}');
    expect(PREVIA).toContain('barraEm={barraEm}');
  });

  it('sem `barraEm`, todo outro visualizador continua desenhando a barra no lugar de sempre', () => {
    expect(VIS).toContain('barraEm === undefined ? barra');
  });

  it('a barra mede o token de 44px e a altura do PDF vem do layout, não de um calc mágico', () => {
    expect(BARRA_CSS).toMatch(/\.barra-doc \{[^}]*height: var\(--h-toolbar\);/);
    expect(BARRA_CSS).toContain('.tela-documento .vpdf-corpo');
    expect(BARRA_CSS).not.toMatch(/\.tela-documento[^{]*\{[^}]*calc\(100dvh/);
  });

  it('um primário só, âmbar: Finalizar', () => {
    expect(REL.match(/barra-doc-btn primaria/g)).toHaveLength(1);
    expect(REL).toContain('onClick={abrirFinalizacao}');
  });

  it('imprimir, baixar e configurar continuam alcançáveis (no ⋯)', () => {
    const menu = REL.slice(REL.indexOf('<MenuMais'), REL.indexOf('<MenuMais') + 1600);
    expect(menu).toContain('prepararEImprimir');
    expect(menu).toContain('baixarPdf');
    expect(menu).toContain('setModalConfig(true)');
  });

  it('no celular o rótulo sai da vista mas fica para o leitor de tela', () => {
    expect(BARRA_CSS).toContain('clip: rect(0 0 0 0)');
    expect(BARRA_CSS).not.toMatch(/\.rotulo-compacto \{[^}]*display: none/);
  });
});
