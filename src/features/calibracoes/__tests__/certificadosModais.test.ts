import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

const TELA = readFileSync('src/pages/Certificados.tsx', 'utf8');
const FORM = readFileSync('src/features/calibracoes/ModalCertificado.tsx', 'utf8');
const VER = readFileSync('src/features/calibracoes/ModalVerCertificado.tsx', 'utf8');
const CSS = readFileSync('src/pages/certificados.css', 'utf8');
const BLOCO = CSS.slice(CSS.indexOf('/* ── CERTIFICADOS: modais e estado vazio'));
const MOBILE = BLOCO.slice(BLOCO.indexOf('@media (max-width: 640px)'));

describe('o formulário virou modal central', () => {
  it('a tela não monta mais o painel embaixo dos cards', () => {
    expect(TELA).not.toContain('className="cert-form"');
    expect(TELA).not.toContain('painelRef');
    // O scroll automático existia só para levar o usuário até o painel.
    expect(TELA).not.toContain('scrollIntoView');
  });

  it('a tela monta o ModalCertificado e lhe passa o que ele precisa', () => {
    expect(TELA).toContain('<ModalCertificado');
    for (const prop of ['form={form}', 'onCampo={set}', 'onArquivo={lerPdf}', 'onSalvar=']) {
      expect(TELA).toContain(prop);
    }
  });

  it('o modal NÃO grava — quem persiste é a tela', () => {
    expect(FORM).not.toMatch(/salvarRastreabilidade|listarRastreabilidades|resolverPdf/);
    expect(FORM).not.toContain('services/storage');
  });

  it('prende o foco e trava o fechamento enquanto grava', () => {
    expect(FORM).toContain('useFocoPreso');
    // Fechar no meio da gravação deixaria o aviso órfão e o registro pela metade.
    expect(FORM).toContain('!ocupado && onFechar()');
    expect(FORM).toContain('aria-modal="true"');
  });

  it('o input de arquivo se limpa DEPOIS de entregar o arquivo', () => {
    // Sem isso, reescolher o mesmo PDF (após comprimi-lo) não dispara `change`.
    const i = FORM.indexOf('onArquivo(f)');
    const j = FORM.indexOf("e.target.value = ''", i);
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });
});

describe('o aviso de salvando → salvo', () => {
  it('usa o componente único do sistema, centralizado', () => {
    expect(TELA).toContain('useSalvamento');
    expect(TELA).toContain('<FeedbackSalvamento');
    // O estado local de "salvando" saiu: dois donos do mesmo aviso divergem.
    expect(TELA).not.toContain('setSalvando');
  });

  it('a falha de cota é LANÇADA, para não virar sucesso otimista', () => {
    // Dentro de `executar`, um `return` silencioso levaria ao check verde.
    expect(TELA).toContain('throw new Error(erroCotaLocal(pdfTamanho))');
  });

  it('fecha o formulário só quando a gravação deu certo', () => {
    const fn = TELA.slice(TELA.indexOf('async function salvar()'));
    const corpo = fn.slice(0, fn.indexOf('async function alternarInjecao'));
    expect(corpo).toContain('if (ok) {');
    expect(corpo.indexOf('await salvamento.executar')).toBeLessThan(corpo.indexOf('setForm(null)'));
  });

  it('o aviso fica FORA do modal, para sobreviver ao fechamento dele', () => {
    expect(TELA.indexOf('<FeedbackSalvamento')).toBeGreaterThan(TELA.indexOf('<ModalCertificado'));
  });
});

describe('o card mostra o estado e dá acesso ao PDF', () => {
  it('"Cadastrado" sai com check', () => {
    expect(TELA).toContain('{completo && injeta && <Icone nome="check" tam={12} />}');
  });

  it('o badge verde é o do estado resolvido, e ele alinha o ícone', () => {
    expect(TELA).toContain("completo && injeta ? 'cert-badge-ok' : 'neutro'");
    expect(BLOCO).toMatch(/\.cert-badge-ok\s*\{[^}]*display: inline-flex/);
  });

  it('"Ver certificado" só existe quando há PDF para abrir', () => {
    const i = TELA.indexOf('Ver certificado');
    expect(i).toBeGreaterThan(0);
    expect(TELA.slice(i - 400, i)).toContain('{completo && (');
  });

  /**
   * O PDF é desenhado pelo visualizador DO SISTEMA.
   *
   * A primeira versão punha o arquivo num `<iframe>` e deixava o Chrome
   * desenhar: barra cinza do navegador, tipografia e miniaturas que não são
   * deste sistema, no meio de uma tela que é. O mesmo documento em /relatorios
   * tinha outra cara.
   */
  it('usa o mesmo visualizador do relatório, não um iframe cru', () => {
    expect(VER).toContain('VisualizadorPdfBytes');
    // Sem o comentário de cabeçalho: ele cita `<iframe>` de propósito, para
    // registrar o que saiu daqui e por quê.
    const codigo = VER.slice(VER.indexOf('export default'));
    expect(codigo).not.toContain('<iframe');
    // `paginas={0}`: o total sai do próprio documento depois de carregado.
    expect(VER).toContain('paginas={0}');
  });

  it('entrega BYTES ao visualizador, não a dataURL crua', () => {
    // `fetch(data:)` é bloqueado por alguns navegadores; o base64 já está na
    // mão e é decodificado aqui.
    expect(VER).toContain('atob(base64)');
    expect(VER).toMatch(/bytes=\{bytes\}/);
  });

  it('o blob e a revogação continuam existindo — dentro do visualizador', () => {
    // A invariante não sumiu, mudou de dono: quem cria e revoga a URL agora é
    // o componente compartilhado.
    const viewer = readFileSync('src/components/VisualizadorPdf.tsx', 'utf8');
    expect(viewer).toContain('URL.createObjectURL');
    expect(viewer).toContain('URL.revokeObjectURL');
  });

  it('o visualizador diz quando o PDF não pôde ser aberto', () => {
    expect(VER).toContain('Não foi possível abrir o PDF deste certificado');
  });
});

describe('o estado vazio ganhou ilustração', () => {
  it('a imagem existe em public/ e é leve', () => {
    const caminho = 'public/ilustracoes/certificado-vazio.jpg';
    expect(existsSync(caminho)).toBe(true);
    // Ilustração de card não justifica peso: acima de ~80 KB vira custo de
    // carregamento numa tela que o usuário abre para conferir três cartões.
    expect(statSync(caminho).size).toBeLessThan(80 * 1024);
  });

  it('a tela aponta para ela e a marca como decorativa', () => {
    expect(TELA).toContain('/ilustracoes/certificado-vazio.jpg');
    // `alt` vazio: o texto ao lado já diz tudo, e um alt descritivo faria o
    // leitor de tela anunciar duas vezes a mesma informação.
    expect(TELA).toMatch(/certificado-vazio\.jpg"\s+alt=""/);
  });

  it('a ilustração não estoura o card', () => {
    expect(BLOCO).toMatch(/\.cert-card-vazio img\s*\{[^}]*max-width: 132px/);
    expect(BLOCO).toMatch(/\.cert-card-vazio img\s*\{[^}]*height: auto/);
  });
});

describe('gate · responsividade dos modais de certificado', () => {
  it('cabeçalho e rodapé fixos, corpo rolando por dentro', () => {
    expect(BLOCO).toMatch(/\.certm-corpo\s*\{[^}]*min-height: 0/);
    expect(BLOCO).toMatch(/\.certm-corpo\s*\{[^}]*overflow-x: hidden/);
  });

  it('o título encolhe em vez de empurrar o × para fora', () => {
    expect(BLOCO).toMatch(/\.certm-cab-txt,\n\.certv-cab-txt \{ flex: 1; min-width: 0; \}/);
  });

  it('a grade usa minmax(0, 1fr) — 1fr puro não encolhe', () => {
    expect(BLOCO).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(MOBILE).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('no celular o formulário vira uma coluna e os botões chegam a 44px', () => {
    expect(MOBILE).toMatch(/min-height: 44px/);
  });
});
