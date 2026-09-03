/**
 * Fase 9 · 9F.4 — **O TESTE BLOQUEANTE DESTA ETAPA.**
 *
 * ## O risco que ele existe para impedir
 *
 * O LIVRO DE REGISTRO abrir vazio.
 *
 * Tirar o `lerTudo()` de `/livro-registro` significa que o cache passa a ter
 * apenas o que alguém semeou. E esta tela lê o livro, a configuração da folha e
 * o termo de abertura — nenhum dos três reclama quando falta:
 *
 *   · `nr13_livro_<TAG>`        → `?? []`  (a timeline fica vazia)
 *   · `nr13_livro_config_<TAG>` → `?? {}`  (o cabeçalho sai em branco)
 *   · `nr13_termo_livro_<TAG>`  → idem
 *
 * Sem a semeadura, o livro abre sem entrada nenhuma, sem erro no console, sem
 * teste vermelho — e o usuário conclui que o livro sumiu. É o mesmo defeito
 * silencioso da 9F.2 e da 9F.3, com o agravante de que aqui o documento é o
 * registro de segurança que a fiscalização pede, e cuja imutabilidade o banco
 * protege.
 *
 * ## O cruzamento
 *
 *   chaves que a tela do livro LÊ  (a lista + os TRÊS templates da folha)
 *                        ×
 *   chaves que `carregarEquipamento(tag)` COLOCA no cache
 *
 * Toda chave do primeiro conjunto precisa estar coberta pelo segundo — ou por
 * uma das rotas declaradas abaixo. Família nova lida pela tela, sem cobertura,
 * QUEBRA este teste.
 *
 * ## E a ordem, que é metade do risco
 *
 * `abrirEquipamentoParaLivro` precisa semear ANTES de ler. Inverter produziria
 * exatamente o mesmo livro vazio, com a semeadura funcionando perfeitamente — só
 * que tarde demais. O penúltimo bloco trava isso.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'VL-TESTE/9F4';
const RAIZ = join(process.cwd(), 'public');

/**
 * As famílias que a TELA do livro lê, com o lugar onde isso acontece. Escritas à
 * mão, e não deduzidas, porque é a lista que um humano confere quando desconfia
 * que um livro sumiu.
 */
const FAMILIAS_DA_TELA: Array<{ prefixo: string; onde: string }> = [
  { prefixo: 'nr13_livro_', onde: 'LivroRegistro.montarLinhas: as entradas' },
  { prefixo: 'nr13_livro_config_', onde: 'CAPA-LIVRO-REGISTRO / TERMO-ABERTURA' },
  { prefixo: 'nr13_termo_livro_', onde: 'LIVRO-REGISTRO.html: o termo de abertura' },
  { prefixo: 'nr13_info_', onde: 'LivroRegistro.montarLinhas: nome do equipamento' },
  { prefixo: 'nr13_cat_', onde: 'LivroRegistro.montarLinhas: categoria' },
  { prefixo: 'nr13_calc_', onde: 'CAPA-LIVRO-REGISTRO / TERMO-ABERTURA: PMTA' },
  { prefixo: 'nr13_emp_', onde: 'TERMO-ABERTURA.html: o cliente' },
  { prefixo: 'nr13_laudo_', onde: 'LIVRO-REGISTRO.html: o selo APTO/INAPTO' },
  { prefixo: 'nr13_assinantes_rel_', onde: 'LIVRO-REGISTRO.html: assinantes' },
];

/** Os três templates que a folha do livro monta. */
const TEMPLATES_LIVRO = [
  'arquivos-inspecao/CAPA-LIVRO-REGISTRO.html',
  'arquivos-inspecao/TERMO-ABERTURA.html',
  'arquivos-inspecao/LIVRO-REGISTRO.html',
];

/**
 * Chaves GLOBAIS da organização, ou que o PRÓPRIO APP escreve ao montar o
 * documento — não vêm da semeadura por TAG, e não deviam.
 */
const FORA_DA_SEMEADURA_POR_TAG = new Set([
  'nr13_minha_empresa', // global, essencial do boot
  'nr13_lista_phs', // global: os profissionais habilitados
  'nr13_historico_relatorios', // global, LEGADO (§7-sexies)
  'nr13_relatorio_meta_atual', // escrita pelo app ao montar o documento
  'nr13_rubricas_palco', // do palco, montado pelo app
]);

describe('as chaves que a tela do livro lê estão cobertas pela semeadura', () => {
  it('`chavesDoEquipamento` cobre as famílias por TAG que a tela lê', async () => {
    const { chavesDoEquipamento } = await import('../equipamento/equipamentoService');
    const semeadas = new Set(chavesDoEquipamento(TAG));

    const descobertas = FAMILIAS_DA_TELA.filter(({ prefixo }) => !semeadas.has(`${prefixo}${TAG}`));

    expect(
      descobertas,
      'Estas famílias são lidas pela tela do livro e NÃO são semeadas — o livro abriria vazio sem erro:\n' +
        descobertas.map((d) => `  ${d.prefixo}<TAG>  (${d.onde})`).join('\n'),
    ).toEqual([]);
  });

  it('os TRÊS templates do livro não leem nenhuma chave por TAG descoberta', async () => {
    const { chavesDoEquipamento } = await import('../equipamento/equipamentoService');
    const semeadas = new Set(chavesDoEquipamento(TAG));

    const descobertas: string[] = [];
    for (const arquivo of TEMPLATES_LIVRO) {
      const html = readFileSync(join(RAIZ, arquivo), 'utf8');
      for (const token of new Set(html.match(/nr13_[a-z0-9_]+/g) ?? [])) {
        if (FORA_DA_SEMEADURA_POR_TAG.has(token)) continue;
        if (semeadas.has(`${token}${TAG}`) || semeadas.has(token)) continue;
        descobertas.push(`${arquivo}: ${token}`);
      }
    }

    expect(
      descobertas,
      'Chave nova num template do livro, sem cobertura na semeadura:\n' + descobertas.join('\n'),
    ).toEqual([]);
  });

  it('o livro está em POR_TAG — que é a MESMA tabela do palco e da exclusão', async () => {
    // Montar uma lista própria em `chavesDoEquipamento` garantiria que, no dia
    // em que uma família nova nascesse, este caminho ficasse para trás.
    const { POR_TAG } = await import('../../services/familiasChave');
    expect(POR_TAG).toContain('nr13_livro_');
    expect(POR_TAG).toContain('nr13_livro_config_');
    expect(POR_TAG).toContain('nr13_termo_livro_');
  });
});

describe('a ORDEM: semear antes de ler', () => {
  const ordem: string[] = [];

  beforeEach(() => {
    ordem.length = 0;
    vi.resetModules();
  });

  it('`carregarEquipamento` roda ANTES de qualquer leitura do cache', async () => {
    vi.doMock('../equipamento/equipamentoService', () => ({
      carregarEquipamento: vi.fn(async () => {
        ordem.push('semear');
      }),
    }));
    vi.doMock('../../services/storage', () => ({
      ler: vi.fn((chave: string) => {
        ordem.push(`ler:${chave}`);
        return null;
      }),
    }));

    const { abrirEquipamentoParaLivro } = await import('./catalogoLivro');
    await abrirEquipamentoParaLivro(TAG);

    expect(ordem[0]).toBe('semear');
    expect(ordem).toContain(`ler:nr13_livro_${TAG}`);
    expect(ordem.indexOf('semear')).toBeLessThan(ordem.indexOf(`ler:nr13_livro_${TAG}`));
  });

  it('falha de rede na semeadura NÃO derruba a tela — segue com o cache', async () => {
    vi.doMock('../equipamento/equipamentoService', () => ({
      carregarEquipamento: vi.fn(async () => {
        throw new Error('offline');
      }),
    }));
    vi.doMock('../../services/storage', () => ({
      ler: vi.fn((chave: string) => (chave.startsWith('nr13_livro_') ? [{ id: 'e1' }] : null)),
    }));

    const { abrirEquipamentoParaLivro } = await import('./catalogoLivro');
    const aberto = await abrirEquipamentoParaLivro(TAG);

    // Derrubar a navegação por causa da rede transformaria uma tela degradada
    // numa tela quebrada — e o que já está no aparelho continua valendo.
    expect(aberto.entradas).toHaveLength(1);
  });

  it('livro ausente devolve lista VAZIA, e não `undefined`', async () => {
    vi.doMock('../equipamento/equipamentoService', () => ({
      carregarEquipamento: vi.fn(async () => undefined),
    }));
    vi.doMock('../../services/storage', () => ({ ler: vi.fn(() => null) }));

    const { abrirEquipamentoParaLivro } = await import('./catalogoLivro');
    const aberto = await abrirEquipamentoParaLivro(TAG);

    expect(aberto.entradas).toEqual([]);
    expect(aberto.config).toBeNull();
  });
});

describe('deveHidratarListaLegada', () => {
  it('com a flag LIGADA, ninguém hidrata a organização inteira', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoLivro');
    expect(deveHidratarListaLegada(true)).toBe(false);
  });

  it('com a flag DESLIGADA, a tela antiga hidrata como sempre fez', async () => {
    const { deveHidratarListaLegada } = await import('./catalogoLivro');
    expect(deveHidratarListaLegada(false)).toBe(true);
  });
});

describe('o `null` da projeção não pode esvaziar a tela', () => {
  it('equipamento com livro entra na lista', async () => {
    const { entraNaListaDoLivro } = await import('./catalogoLivro');
    expect(entraNaListaDoLivro(3)).toBe(true);
  });

  it('equipamento SEM livro (contado) fica de fora', async () => {
    const { entraNaListaDoLivro } = await import('./catalogoLivro');
    expect(entraNaListaDoLivro(0)).toBe(false);
  });

  it('`null` ENTRA — organização não reprojetada não pode aparecer vazia', async () => {
    // Um `(x ?? 0) > 0` aqui esvaziaria a tela inteira de toda organização sem
    // backfill, com a frase "Nenhum livro de registro gerado ainda". Melhor
    // mostrar um equipamento cujo livro talvez esteja vazio — o usuário abre e
    // vê a verdade — do que esconder um livro que existe.
    const { entraNaListaDoLivro } = await import('./catalogoLivro');
    expect(entraNaListaDoLivro(null)).toBe(true);
  });
});

describe('rotuloRegistros: os três estados, separados', () => {
  it('conta quando sabe', async () => {
    const { rotuloRegistros } = await import('./catalogoLivro');
    expect(rotuloRegistros(3)).toBe('3 registros');
    expect(rotuloRegistros(1)).toBe('1 registro');
  });

  it('`0` é um fato: "Sem registro"', async () => {
    const { rotuloRegistros } = await import('./catalogoLivro');
    expect(rotuloRegistros(0)).toBe('Sem registro');
  });

  it('`null` não vira "0" nem "Sem registro" — fica em branco', async () => {
    const { rotuloRegistros } = await import('./catalogoLivro');
    expect(rotuloRegistros(null)).toBe('');
  });
});
