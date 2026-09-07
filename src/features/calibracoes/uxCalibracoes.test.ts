/**
 * GATE da reforma de UX de Calibrações e Certificados (06/09/2026).
 *
 * Estrutura, não render: a suíte roda sem DOM. O que depende de render está
 * verificado no navegador, em `docs/medicoes/2026-09-06-ux-calibracoes.md`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
const catalogo = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
const certificados = readFileSync('src/pages/Certificados.tsx', 'utf8');
const modalComp = readFileSync('src/features/calibracoes/ModalComponente.tsx', 'utf8');
const modalAjuda = readFileSync('src/features/calibracoes/ModalAjuda.tsx', 'utf8');
const ajudaCal = readFileSync('src/features/calibracoes/AjudaCalibracoes.tsx', 'utf8');
const ajudaCert = readFileSync('src/features/calibracoes/AjudaCertificados.tsx', 'utf8');
const cssIlustra = readFileSync('src/features/calibracoes/ilustracoes.css', 'utf8');

/** O código, sem comentários — eles citam os rótulos antigos de propósito. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('adicionar componente: modal central, não caixa embaixo', () => {
  it('o formulário inline saiu', () => {
    // Ele nascia embaixo do painel: clicar em "+ Adicionar" empurrava os lotes
    // para baixo e, no celular, abria os campos fora da primeira tela.
    expect(semComentarios(pagina)).not.toContain('className="cal-comp-form"');
    expect(pagina).toContain('<ModalComponente');
  });

  it('o modal é diálogo, com ESC e armadilha de foco', () => {
    expect(modalComp).toContain('role="dialog"');
    expect(modalComp).toContain('aria-modal="true"');
    expect(modalComp).toContain("e.key === 'Escape'");
    expect(modalComp).toContain("e.key !== 'Tab'");
  });

  it('a regra de salvar é a MESMA — nome obrigatório, `salvarComponente`', () => {
    expect(modalComp).toContain("const podeSalvar = c.nome.trim() !== '';");
    expect(pagina).toContain('await salvarComponente(tag, c);');
  });

  it('trocar a foto continua zerando a `fotoRef` antiga', () => {
    // Manter a referência velha faria `salvarComponente` gravar a foto antiga e
    // descartar em silêncio a que o usuário acabou de escolher.
    expect(modalComp).toContain('fotoRef: undefined');
  });
});

describe('o texto explicativo virou ajuda contextual', () => {
  it('Calibrações troca o parágrafo fixo por "Como funciona"', () => {
    expect(semComentarios(pagina)).not.toContain('cal-eq-sub');
    expect(pagina).toContain('Como funciona');
    expect(pagina).toContain('<AjudaCalibracoes');
  });

  it('Certificados troca os três parágrafos por uma linha', () => {
    const limpo = semComentarios(certificados);
    expect(limpo).not.toContain('Aqui você injeta o');
    expect(limpo).not.toContain('cert-intro-nota');
    expect(certificados).toContain('cert-intro-compacta');
    expect(certificados).toContain('<AjudaCertificados');
  });

  it('o texto foi REAPROVEITADO, não jogado fora', () => {
    // As quatro ideias do texto antigo continuam ali, em passos numerados.
    expect(ajudaCert).toContain('instrumentos usados como PADRÃO');
    expect(ajudaCert).toContain('rastreabilidade');
    expect(ajudaCert).toContain('um certificado por padrão');
    expect(ajudaCert).toContain('copiadas para o fim do documento');
  });

  it('a ajuda é um diálogo, fechável pelo ESC', () => {
    expect(modalAjuda).toContain('role="dialog"');
    expect(modalAjuda).toContain("e.key === 'Escape'");
  });
});

describe('ilustrações de onboarding', () => {
  /*
   * Elas deixaram de ser SVG de traço desenhado no componente e passaram a ser
   * a arte que o dono produziu — WebP de ~44 KB, servido de `public/`. O
   * desenho real diz mais do que qualquer esquema que eu montasse com linhas.
   */
  it('cada sessão usa a SUA ilustração', () => {
    expect(ajudaCal).toContain('/ilustracoes/fluxo-calibracao.webp');
    expect(ajudaCert).toContain('/ilustracoes/rastreabilidade-padroes.webp');
    // Trocadas, elas explicariam a sessão errada.
    expect(ajudaCal).not.toContain('rastreabilidade-padroes');
    expect(ajudaCert).not.toContain('fluxo-calibracao');
  });

  it('os arquivos existem e são leves', () => {
    for (const nome of ['fluxo-calibracao.webp', 'rastreabilidade-padroes.webp']) {
      const b = readFileSync(`public/ilustracoes/${nome}`);
      expect(b.length).toBeGreaterThan(1000);
      // Os originais tinham ~1 MB cada. Acima de 150 KB, a ajuda passaria a
      // custar mais do que o resto da tela.
      expect(b.length).toBeLessThan(150_000);
      expect(b.slice(8, 12).toString()).toBe('WEBP');
    }
  });

  it('não esticam: proporção fixa e `contain`', () => {
    const css = readFileSync('src/features/calibracoes/modalAjuda.css', 'utf8');
    expect(css).toContain('aspect-ratio: 2172 / 724;');
    expect(css).toContain('object-fit: contain;');
  });

  it('têm alt descritivo — não o nome do arquivo', () => {
    for (const fonte of [ajudaCal, ajudaCert]) {
      const alt = /alt="([^"]+)"/.exec(fonte)![1];
      expect(alt.length).toBeGreaterThan(40);
      expect(alt).not.toContain('.webp');
    }
  });

  it('carregam sob demanda — a ajuda não pesa no boot da tela', () => {
    expect(modalAjuda).toContain('loading="lazy"');
    expect(modalAjuda).toContain('decoding="async"');
  });
});

describe('o modal de ajuda', () => {
  const css = readFileSync('src/features/calibracoes/modalAjuda.css', 'utf8');

  it('anima com discrição, e não anima para quem pediu menos movimento', () => {
    expect(css).toContain('translateY(10px) scale(0.985)');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/);
  });

  it('tem título ligado ao diálogo e foco inicial na saída', () => {
    expect(modalAjuda).toContain('aria-labelledby={idTitulo}');
    expect(modalAjuda).toContain('fechar.current?.focus();');
  });

  it('fecha por X, ESC, overlay e botão — é informativo, nada se perde', () => {
    expect(modalAjuda).toContain('aria-label="Fechar"');
    expect(modalAjuda).toContain("e.key === 'Escape'");
    expect(modalAjuda).toContain('e.target === e.currentTarget && aoFechar()');
    expect(modalAjuda).toContain('>\n            Entendi\n          </button>');
  });

  it('o corpo rola, e o cabeçalho e o botão de sair ficam', () => {
    expect(css).toContain('max-height: 88vh;');
    expect(css).toMatch(/\.ajuda-corpo \{[\s\S]*?overflow-y: auto;/);
  });
});

describe('o texto descreve o comportamento REAL', () => {
  it('a reutilização automática declara as DUAS condições', () => {
    /*
     * Conferido no código: `tiposPadraoDoRelatorio` só devolve um tipo quando o
     * documento correspondente está na lista (ULTRASSOM.html, ou uma folha
     * `?calibId=`), e `rastreabilidadesParaRelatorio` descarta quem está com a
     * caixa "Injetar no final do relatório" desmarcada.
     *
     * Uma promessa genérica aqui faria o usuário entregar um documento
     * acreditando que o certificado está dentro.
     */
    expect(ajudaCert).toContain('inclui a folha');
    expect(ajudaCert).toContain('Injetar no final do relatório');
    expect(ajudaCert).toContain('o mais recente que tenha PDF');
  });

  it('cita os três tipos que o sistema realmente aceita', () => {
    for (const t of ['bloco padrão de espessura', 'manômetro padrão', 'válvula PSV padrão']) {
      expect(ajudaCert).toContain(t);
    }
  });

  it('não promete que o PDF do padrão é alterado', () => {
    expect(ajudaCert).toContain('não é alterado');
    expect(ajudaCert).toContain('copiadas para o fim do documento');
  });

  it('a ajuda de calibrações descreve o fluxo da tela', () => {
    for (const t of ['Cadastre os acessórios', 'Crie um lote', 'Calibre os acessórios']) {
      expect(ajudaCal).toContain(t);
    }
    // O vínculo com o relatório é real (`vincularProximoRelatorio`).
    expect(ajudaCal).toContain('vinculado àquele relatório');
  });
});

describe('estado vazio ilustrado', () => {
  it('aparece só quando NÃO há lote', () => {
    expect(pagina).toContain('lotes.length === 0 ? (');
    expect(pagina).toContain('className="cal-vazio"');
    // Havendo um lote, a ilustração sai de cena.
    const bloco = /lotes\.length === 0 \? \([\s\S]*?\) : \(/.exec(pagina)![0];
    expect(bloco).toContain('/ilustracoes/fluxo-calibracao.webp');
  });
});

describe('a barra de Calibrações', () => {
  it('filtro e busca na mesma linha; o painel exposto saiu', () => {
    const barra = /<BuscaLista[\s\S]*?\/>/.exec(catalogo)![0];
    expect(barra).toContain('antes={');
    expect(barra).toContain('compacto');
    expect(semComentarios(catalogo)).not.toContain('rel-filtros-painel');
    expect(catalogo).toContain('<ModalFiltrosProntuarios');
  });

  it('reusa o MESMO modal de filtro dos prontuários', () => {
    // São a mesma pergunta em duas telas. Dois modais quase iguais seriam a
    // próxima correção feita num lugar e esquecida no outro.
    expect(catalogo).toContain("from '../prontuarios/ModalFiltrosProntuarios'");
    expect(catalogo).toContain('modo="equipamentos"');
  });

  it('o cabeçalho "Selecione o Equipamento" saiu', () => {
    expect(semComentarios(pagina)).not.toContain('Selecione o Equipamento');
  });

  it('no celular o botão de filtro fica quadrado, com altura declarada', () => {
    expect(cssIlustra).toContain('.calibracoes-page .pront-btn-rotulo { display: none; }');
    const movel = cssIlustra.slice(cssIlustra.indexOf('@media (max-width: 640px)'));
    // Sem rótulo e com `padding: 0`, um botão sem altura declarada mede 2px.
    expect(movel).toContain('height: 44px;');
  });
});

describe('nada de diálogo nativo nos fluxos tocados', () => {
  it('o cadastro de componente não usa prompt nem alert', () => {
    expect(modalComp).not.toContain('window.prompt');
    expect(modalComp).not.toContain('window.alert');
    expect(modalAjuda).not.toContain('window.alert');
  });
});
