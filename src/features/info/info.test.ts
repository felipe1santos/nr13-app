import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CATEGORIAS,
  FAQ,
  GUIAS,
  PRIMEIROS_PASSOS,
  buscarFaq,
  buscarGuias,
  guiasDaCategoria,
  normalizar,
  type CategoriaInfo,
} from './infoConteudo';
import { ITENS_BAIXO, TITULOS_ROTA } from '../../app/menu';

/**
 * A CENTRAL INFO.
 *
 * O gate que mais importa é o de ROTAS: documentação que manda o usuário para
 * um lugar que não existe é pior do que documentação nenhuma — ela faz o
 * usuário concluir que o sistema está quebrado. Por isso toda rota citada num
 * guia é conferida contra o router de verdade.
 */

const router = readFileSync('src/app/router.tsx', 'utf8');
/** As rotas que o sistema REALMENTE declara. */
const ROTAS_REAIS = new Set(
  [...router.matchAll(/path: '([^']+)'/g)].map((m) => m[1]),
);

describe('menu e rota', () => {
  it('o item "Info" existe no menu principal', () => {
    const info = ITENS_BAIXO.find((i) => i.id === 'info');
    expect(info).toBeDefined();
    expect(info!.label).toBe('Info');
    expect(info!.to).toBe('/info');
  });

  it('fica DEPOIS do que ele explica', () => {
    const ids = ITENS_BAIXO.map((i) => i.id);
    expect(ids.indexOf('info')).toBe(ids.length - 1);
  });

  it('a rota /info está declarada no router', () => {
    expect(ROTAS_REAIS.has('/info')).toBe(true);
    expect(router).toContain("import Info from '../pages/Info'");
  });

  it('a topbar sabe o título da rota', () => {
    expect(TITULOS_ROTA.some((t) => t.prefixo === '/info')).toBe(true);
  });

  it('a ajuda NÃO se esconde de quem tem menos permissão', () => {
    // O inspetor com acesso só a Inspeções é justamente quem mais precisa dela.
    const layout = readFileSync('src/app/Layout.tsx', 'utf8');
    expect(layout).toContain("i.id === 'info' || permitido(i.id)");
  });
});

describe('conteúdo', () => {
  it('todo guia tem id único', () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda categoria usada existe na lista de categorias', () => {
    const validas = new Set<CategoriaInfo>(CATEGORIAS.map((c) => c.id));
    for (const g of GUIAS) expect(validas.has(g.categoria), `${g.id}: ${g.categoria}`).toBe(true);
  });

  it('nenhuma categoria fica vazia — seção sem conteúdo é ruído', () => {
    for (const c of CATEGORIAS) {
      expect(guiasDaCategoria(c.id).length, c.id).toBeGreaterThan(0);
    }
  });

  it('todo guia tem título, resumo e ao menos dois passos', () => {
    for (const g of GUIAS) {
      expect(g.titulo.trim(), g.id).not.toBe('');
      expect(g.resumo.trim(), g.id).not.toBe('');
      expect(g.passos.length, g.id).toBeGreaterThanOrEqual(2);
      for (const p of g.passos) {
        expect(p.titulo.trim(), g.id).not.toBe('');
        expect(p.texto.trim(), g.id).not.toBe('');
      }
    }
  });

  it('NENHUM link aponta para rota inexistente', () => {
    for (const g of GUIAS) {
      if (!g.rota) continue;
      expect(ROTAS_REAIS.has(g.rota), `${g.id} → ${g.rota}`).toBe(true);
    }
    for (const p of PRIMEIROS_PASSOS) {
      expect(ROTAS_REAIS.has(p.rota), `${p.titulo} → ${p.rota}`).toBe(true);
    }
  });

  it('guia com rota tem rótulo de botão', () => {
    for (const g of GUIAS) {
      if (g.rota) expect(g.rotaRotulo, g.id).toBeTruthy();
    }
  });

  it('o FAQ traz só a RESPOSTA — sem botão para o guia', () => {
    // Decisão do dono: quem abre a pergunta quer a resposta ali, não um desvio.
    const pagina = readFileSync('src/pages/Info.tsx', 'utf8');
    expect(pagina).not.toContain('Ver o guia');
    for (const f of FAQ) expect(f.resposta.trim().length, f.pergunta).toBeGreaterThan(40);
  });

  it('nenhuma pergunta repetida', () => {
    const p = FAQ.map((f) => f.pergunta);
    expect(new Set(p).size).toBe(p.length);
  });

  it('o vocabulário INTERNO não vaza para a ajuda', () => {
    // O leitor é o engenheiro que usa o sistema, não quem o mantém.
    const proibidos = [
      'IndexedDB',
      'localStorage',
      'RPC',
      'bucket',
      'pdfRef',
      'SHA-256',
      'nr13_',
      'React',
      'useState',
      'Supabase',
    ];
    const texto = [
      ...GUIAS.flatMap((g) => [
        g.titulo,
        g.resumo,
        ...g.passos.flatMap((p) => [p.titulo, p.texto]),
        ...g.observacoes,
        g.depois ?? '',
      ]),
      ...FAQ.flatMap((f) => [f.pergunta, f.resposta]),
      ...PRIMEIROS_PASSOS.flatMap((p) => [p.titulo, p.texto]),
    ].join(' ');
    for (const p of proibidos) expect(texto, p).not.toContain(p);
  });

  it('as REGRAS que não podem ser escondidas estão ditas', () => {
    const texto = [
      ...GUIAS.flatMap((g) => [...g.observacoes, ...g.passos.map((p) => p.texto)]),
      ...FAQ.map((f) => f.resposta),
    ]
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    // Documento finalizado não se edita.
    expect(texto).toContain('não muda mais');
    // O container precisa ser salvo.
    expect(texto).toContain('preenchido e salvo');
    // Rascunho não gera prazo.
    expect(texto).toContain('não gera prazo');
    // Certificado depende de condição.
    expect(texto).toContain('injetar no final do relatório');
    // Assinatura depende de cadastro.
    expect(texto).toContain('assinatura');
  });
});

describe('busca', () => {
  it('sem termo, devolve tudo', () => {
    expect(buscarGuias('')).toHaveLength(GUIAS.length);
    expect(buscarFaq('   ')).toHaveLength(FAQ.length);
  });

  it('acha "certificado" nos guias e no FAQ', () => {
    const g = buscarGuias('certificado').map((x) => x.id);
    expect(g).toContain('certificados');
    expect(g).toContain('calibracoes');
    expect(buscarFaq('certificado').length).toBeGreaterThan(0);
  });

  it('ignora acento — quem digita "calibracao" acha "calibração"', () => {
    expect(normalizar('Calibração')).toBe('calibracao');
    expect(buscarGuias('calibracao').map((x) => x.id)).toContain('calibracoes');
    expect(buscarGuias('inspecao').map((x) => x.id)).toContain('inspecoes');
  });

  it('acha pelo TEXTO do passo, não só pelo título', () => {
    // A dúvida raramente é escrita com a palavra do título.
    expect(buscarGuias('planilha').map((x) => x.id)).toContain('equipamentos');
    expect(buscarGuias('duplicar').map((x) => x.id)).toContain('rascunho');
    // ...e pelo texto de uma OBSERVAÇÃO.
    expect(buscarGuias('renomear').map((x) => x.id)).toContain('rascunho');
  });

  it('termo sem resposta devolve lista vazia — sem inventar resultado', () => {
    expect(buscarGuias('xyzzy-nao-existe')).toEqual([]);
    expect(buscarFaq('xyzzy-nao-existe')).toEqual([]);
  });

  it('as perguntas de exemplo da tela vazia realmente acham algo', () => {
    for (const t of ['inspeção', 'certificado', 'prazo', 'rascunho']) {
      expect(buscarGuias(t).length + buscarFaq(t).length, t).toBeGreaterThan(0);
    }
  });
});

describe('gate · a tela', () => {
  const pagina = readFileSync('src/pages/Info.tsx', 'utf8');
  const modal = readFileSync('src/features/info/ModalGuia.tsx', 'utf8');
  const css = readFileSync('src/pages/info.css', 'utf8');

  it('a busca filtra guias E FAQ ao mesmo tempo', () => {
    // Filtrar só os guias faria o usuário concluir que não há resposta com ela
    // três dedos abaixo, no FAQ intacto.
    expect(pagina).toContain('buscarGuias(termo)');
    expect(pagina).toContain('buscarFaq(termo)');
  });

  it('o deep link `?guia=` abre o guia', () => {
    expect(pagina).toContain("params.get('guia')");
    expect(pagina).toContain('guiaPorId(abertoId)');
  });

  it('o modal tem o contrato de acessibilidade', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby');
    expect(modal).toContain("e.key === 'Escape'");
    expect(modal).toContain("e.key !== 'Tab'");
    // ...e o foco VOLTA para o botão de origem.
    expect(modal).toContain('anterior?.focus?.()');
  });

  it('todo ícone-só tem rótulo', () => {
    expect(modal).toContain('aria-label="Fechar o guia"');
    expect(pagina).toContain('aria-label="Buscar na central de ajuda"');
    expect(pagina).toContain('aria-label="Limpar a busca"');
  });

  it('mobile: coluna única, alvo de 44px e sem largura fixa', () => {
    const celular = css.slice(css.indexOf('@media (max-width: 640px)') + 30);
    expect(celular).toContain('grid-template-columns: 1fr');
    expect(celular).toContain('min-height: 44px');
    // Nada de largura em px fixa dentro do bloco do celular: é assim que
    // nasce overflow horizontal.
    expect(celular).not.toMatch(/\bwidth:\s*\d{3,}px/);
  });

  it('as colunas do fluxo são FIXAS por faixa — a seta depende disso', () => {
    // Com `auto-fill` não há como saber qual cartão fecha a fileira, e a seta
    // do último apontaria para o vazio da margem.
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    // 768px (o tablet de referência) precisa cair em DUAS colunas: com três, o
    // cartão fica com 240px e o texto quebra em quatro linhas.
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('.info-fluxo-passo:nth-child(4n)::after');
    expect(css).toContain('.info-fluxo-passo:last-child::after');
  });

  it('os cards de guia continuam encolhendo — 1fr sozinho não encolhe', () => {
    expect(css).toContain('minmax(min(100%, 330px), 1fr)');
    expect(css).toContain('min-width: 0');
  });
});

/**
 * A JORNADA — "Comece por aqui" (10/09/2026).
 *
 * O cartão numerado abre a etapa; a etapa avança pela seta; o "Guia completo"
 * é a mesma coisa começando do zero. Um componente só, porque quem abre a
 * etapa 3 e entende quer ver a 4 — dois modais separados deixariam o primeiro
 * sem saída.
 */
describe('a jornada', () => {
  const pagina = readFileSync('src/pages/Info.tsx', 'utf8');
  const modal = readFileSync('src/features/info/ModalJornada.tsx', 'utf8');
  const css = readFileSync('src/pages/info.css', 'utf8');

  it('toda etapa tem detalhe, pontos e destino real', () => {
    for (const e of PRIMEIROS_PASSOS) {
      expect(e.detalhe.trim().length, e.titulo).toBeGreaterThan(80);
      expect(e.pontos.length, e.titulo).toBeGreaterThanOrEqual(3);
      expect(e.rotaRotulo.trim(), e.titulo).not.toBe('');
      expect(ROTAS_REAIS.has(e.rota), `${e.titulo} → ${e.rota}`).toBe(true);
    }
  });

  it('as 12 etapas fecham as fileiras de 4, 3, 2 e 1 — nenhuma seta órfã', () => {
    for (const colunas of [4, 3, 2, 1]) {
      expect(PRIMEIROS_PASSOS.length % colunas, `com ${colunas} colunas`).toBe(0);
    }
  });

  it('clicar num cartão abre a jornada NAQUELA etapa', () => {
    expect(pagina).toContain("trocar('etapa', String(i))");
    expect(pagina).toContain("params.get('etapa')");
    expect(pagina).toContain('<ModalJornada inicio={jornadaAberta}');
  });

  it('"Guia completo" é a mesma jornada, da etapa zero', () => {
    expect(pagina).toContain("trocar('etapa', '0')");
    expect(pagina).toContain('Guia completo');
  });

  it('índice fora da faixa não abre nada', () => {
    // `?etapa=99` ou `?etapa=abc` na barra do navegador não pode quebrar a tela.
    expect(pagina).toContain('Number.isInteger(etapa) && etapa >= 0 && etapa < PRIMEIROS_PASSOS.length');
  });

  it('a barra de progresso navega, e o alvo dela é clicável de verdade', () => {
    expect(modal).toContain('role="tablist"');
    expect(modal).toContain('aria-selected={n === i}');
    expect(modal).toContain('onClick={() => setI(n)}');
    // 4px de traço não se acerta com o dedo: a área cresce por ::before.
    expect(css).toContain('.info-jor-traco::before');
    expect(css).toContain('inset: -11px 0');
  });

  it('as setas do teclado andam pela jornada', () => {
    expect(modal).toContain("e.key === 'ArrowRight'");
    expect(modal).toContain("e.key === 'ArrowLeft'");
  });

  it('a última etapa conclui em vez de avançar para o nada', () => {
    expect(modal).toContain("i === total - 1 ? aoFechar() : ir(1)");
    expect(modal).toContain("i === total - 1 ? 'Concluir' : 'Próxima etapa'");
  });

  it('cada etapa tem o botão que leva à seção', () => {
    expect(modal).toContain('navigate(etapa.rota)');
    expect(modal).toContain('{etapa.rotaRotulo}');
  });

  it('o contrato de acessibilidade vale aqui também', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby="jornada-titulo"');
    expect(modal).toContain("e.key === 'Escape'");
    expect(modal).toContain("e.key !== 'Tab'");
    expect(modal).toContain('origem?.focus?.()');
    expect(modal).toContain('aria-label="Fechar a jornada"');
  });

  it('o guia por seção NÃO tem ilustração — só o ícone do card', () => {
    const guia = readFileSync('src/features/info/ModalGuia.tsx', 'utf8');
    expect(guia).not.toContain('info-modal-arte');
    expect(guia).toContain('<Icone nome={guia.icone}');
  });

  it('no celular a seta gira para baixo', () => {
    const celular = css.slice(css.indexOf('@media (max-width: 640px)') + 30);
    expect(celular).toContain('transform: rotate(135deg)');
    expect(celular).toContain('grid-template-columns: 1fr');
  });
});
