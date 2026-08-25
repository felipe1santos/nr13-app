/**
 * Fase 9 · 9E — o que a busca de `/relatorios` promete, travado por teste.
 *
 * A tela que este serviço alimenta tem HOJE zero campo de texto, e cada registro
 * de relatório pesa ~110 KB por causa dos snapshots congelados (§7-sexies).
 * Filtrar no cliente significaria baixar dezenas de MB para escrever uma linha.
 *
 * O CRITÉRIO QUE MANDA NESTA ETAPA: **zero PDF baixado durante a busca**. O
 * serviço trafega `pdfRef` — uma referência de texto — e nunca o arquivo. Há
 * teste explícito para isso, porque é a diferença entre uma busca que custa o
 * mesmo em 10 e em 10.000 relatórios e uma que derruba a conta do usuário.
 *
 * Nenhum destes testes fala com o banco: keyset real e RLS exigem Postgres e
 * ficam em `scripts/fase9/testes-9e.sql`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  resposta: [] as unknown[],
  erro: null as unknown,
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      const p = Promise.resolve({ data: estado.resposta, error: estado.erro });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import {
  ErroBuscaRelatorios,
  TAMANHO_PAGINA_REL,
  TETO_CONTAGEM_REL,
  contarRelatorios,
  fundirRelatoriosLocais,
  listarPaginaRelatorios,
  type ItemRelatorio,
} from './buscaRelatorios';

function linha(id: string, extra: Record<string, unknown> = {}) {
  return {
    relatorio_id: id,
    tag: 'VASO-01',
    codigo: id,
    nome: 'Relatorio_' + id,
    tipo: 'periodica',
    status: null,
    profissional: null,
    emissao: '2026-08-20',
    validade: null,
    execucao_inspecao: null,
    proxima_inspecao_interna: null,
    proxima_inspecao_externa: null,
    pdf_ref: 'org/relatorios/' + id + '.pdf',
    sha256: 'abc123',
    paginas: 13,
    source_version: 1,
    ...extra,
  };
}

function item(id: string, extra: Partial<ItemRelatorio> = {}): ItemRelatorio {
  return {
    relatorioId: id,
    tag: 'VASO-01',
    codigo: id,
    nome: null,
    tipo: null,
    status: null,
    profissional: null,
    emissao: null,
    validade: null,
    execucaoInspecao: null,
    proximaInterna: null,
    proximaExterna: null,
    pdfRef: null,
    sha256: null,
    paginas: null,
    sourceVersion: 0,
    ...extra,
  };
}

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = [];
  estado.erro = null;
});

describe('listarPaginaRelatorios', () => {
  it('pede UMA linha a mais que a página, para saber se há próxima', () => {
    void listarPaginaRelatorios();
    expect(estado.chamadas[0].args.p_limite).toBe(TAMANHO_PAGINA_REL + 1);
  });

  it('a linha extra NÃO vai para a tela — ela só responde "tem mais"', async () => {
    estado.resposta = Array.from({ length: TAMANHO_PAGINA_REL + 1 }, (_, i) =>
      linha('REL-' + String(i).padStart(4, '0')),
    );

    const pagina = await listarPaginaRelatorios();

    expect(pagina.itens).toHaveLength(TAMANHO_PAGINA_REL);
    expect(pagina.temMais).toBe(true);
  });

  it('sem linha extra, não há próxima página', async () => {
    estado.resposta = [linha('REL-1'), linha('REL-2')];

    const pagina = await listarPaginaRelatorios();

    expect(pagina.itens).toHaveLength(2);
    expect(pagina.temMais).toBe(false);
  });

  it('o cursor é COMPOSTO — data e id do último item', async () => {
    estado.resposta = [
      linha('REL-9', { emissao: '2026-08-20' }),
      linha('REL-3', { emissao: '2026-08-19' }),
    ];

    const pagina = await listarPaginaRelatorios();

    // Sem o id no cursor, dois relatórios emitidos no MESMO dia embaralhariam
    // entre páginas: um deles apareceria duas vezes e outro sumiria (I5).
    expect(pagina.proximoCursor).toEqual({ data: '2026-08-19', id: 'REL-3' });
  });

  it('relatório SEM data de emissão ainda pagina — cursor com a data mínima', async () => {
    // Registro antigo ou importado. Ele não pode travar a paginação nem sumir:
    // sumir é o defeito que este projeto inteiro combate.
    estado.resposta = [linha('REL-7', { emissao: null })];

    const pagina = await listarPaginaRelatorios();

    expect(pagina.itens[0].emissao).toBeNull();
    expect(pagina.proximoCursor).toEqual({ data: '0001-01-01', id: 'REL-7' });
  });

  it('lista vazia não inventa cursor', async () => {
    const pagina = await listarPaginaRelatorios();
    expect(pagina.proximoCursor).toBeNull();
    expect(pagina.temMais).toBe(false);
  });

  it('repassa termo, tipo e período; cursor nulo na primeira página', () => {
    void listarPaginaRelatorios({ termo: '  vaso  ', tipo: 'periodica', de: '2026-01-01', ate: '2026-12-31' });

    const a = estado.chamadas[0].args;
    expect(a.p_termo).toBe('vaso');       // aparado
    expect(a.p_tipo).toBe('periodica');
    expect(a.p_de).toBe('2026-01-01');
    expect(a.p_ate).toBe('2026-12-31');
    expect(a.p_cursor_data).toBeNull();
    expect(a.p_cursor_id).toBeNull();
  });

  it('filtro vazio vira null, não string vazia', () => {
    void listarPaginaRelatorios({ termo: '', tipo: '', de: '', ate: '' });

    const a = estado.chamadas[0].args;
    // String vazia como filtro faria a RPC procurar tipo = '' e não achar nada.
    expect(a.p_tipo).toBeNull();
    expect(a.p_de).toBeNull();
    expect(a.p_ate).toBeNull();
    expect(a.p_termo).toBe('');
  });

  it('erro do servidor vira ErroBuscaRelatorios, não resposta vazia', async () => {
    estado.erro = { message: 'timeout' };

    // Devolver lista vazia aqui faria a tela dizer "nenhum relatório" para uma
    // organização cheia deles — a mentira que a 9D já custou caro.
    await expect(listarPaginaRelatorios()).rejects.toBeInstanceOf(ErroBuscaRelatorios);
  });
});

describe('o PDF não é tocado pela busca (invariante I10)', () => {
  it('o item carrega a REFERÊNCIA do PDF, nunca o arquivo', async () => {
    estado.resposta = [linha('REL-1', { pdf_ref: 'org/relatorios/uuid.pdf', sha256: 'deadbeef' })];

    const pagina = await listarPaginaRelatorios();
    const it0 = pagina.itens[0];

    expect(it0.pdfRef).toBe('org/relatorios/uuid.pdf');
    expect(it0.sha256).toBe('deadbeef');
    // Nada de conteúdo, bytes, base64 ou URL assinada. O arquivo só é resolvido
    // no clique, e é isso que faz a busca custar o mesmo em 10 e em 10.000.
    const chaves = Object.keys(it0);
    for (const proibida of ['pdf', 'pdfBytes', 'conteudo', 'arquivo', 'url', 'blob', 'base64']) {
      expect(chaves).not.toContain(proibida);
    }
  });

  it('a busca chama SOMENTE as RPCs de índice — nenhuma de storage/artefato', async () => {
    estado.resposta = [linha('REL-1')];
    await listarPaginaRelatorios({ termo: 'vaso' });
    await contarRelatorios({ termo: 'vaso' });

    expect(estado.chamadas.map((c) => c.fn)).toEqual(['buscar_relatorios', 'contar_relatorios']);
  });
});

describe('contarRelatorios', () => {
  it('devolve o total e se ele é exato', async () => {
    estado.resposta = [{ total: 128, exato: true }];
    await expect(contarRelatorios()).resolves.toEqual({ total: 128, exato: true });
  });

  it('teto atingido: a tela precisa poder escrever "mais de N"', async () => {
    estado.resposta = [{ total: TETO_CONTAGEM_REL, exato: false }];
    const c = await contarRelatorios();
    expect(c.exato).toBe(false);
  });

  it('resposta ausente não vira contagem inventada', async () => {
    estado.resposta = [];
    await expect(contarRelatorios()).resolves.toEqual({ total: 0, exato: true });
  });

  it('erro vira exceção — contagem zero seria mentira', async () => {
    estado.erro = { message: 'x' };
    await expect(contarRelatorios()).rejects.toBeInstanceOf(ErroBuscaRelatorios);
  });
});

describe('fundirRelatoriosLocais — o relatório recém-salvo não some (§6.4)', () => {
  it('o item local entra na posição certa da ordenação', () => {
    const servidor = [
      item('REL-3', { emissao: '2026-08-20' }),
      item('REL-1', { emissao: '2026-08-10' }),
    ];
    const local = [item('REL-2', { emissao: '2026-08-15' })];

    const fundido = fundirRelatoriosLocais(servidor, local);

    // Mais novo primeiro, como a RPC ordena.
    expect(fundido.map((r) => r.relatorioId)).toEqual(['REL-3', 'REL-2', 'REL-1']);
  });

  it('local VENCE o servidor no mesmo id', () => {
    const servidor = [item('REL-1', { nome: 'antigo', emissao: '2026-08-10' })];
    const local = [item('REL-1', { nome: 'recém-salvo', emissao: '2026-08-10' })];

    // O local é o que o usuário acabou de gravar; se diverge, é porque o
    // servidor ainda não sabe.
    expect(fundirRelatoriosLocais(servidor, local)[0].nome).toBe('recém-salvo');
  });

  it('desempata por id quando a data é a mesma, igual ao banco', () => {
    const servidor = [item('REL-A', { emissao: '2026-08-20' })];
    const local = [item('REL-B', { emissao: '2026-08-20' })];

    // O banco ordena `relatorio_id desc` sob collation "C" (byte a byte).
    // `localeCompare` ordenaria diferente e a emenda entre páginas passaria a
    // pular itens.
    expect(fundirRelatoriosLocais(servidor, local).map((r) => r.relatorioId)).toEqual([
      'REL-B',
      'REL-A',
    ]);
  });

  it('sem itens locais, devolve o servidor intacto', () => {
    const servidor = [item('REL-1'), item('REL-2')];
    expect(fundirRelatoriosLocais(servidor, [])).toEqual(servidor);
  });

  it('relatório sem data vai para o fim, não some', () => {
    const servidor = [item('REL-1', { emissao: '2026-08-10' })];
    const local = [item('REL-0', { emissao: null })];

    expect(fundirRelatoriosLocais(servidor, local).map((r) => r.relatorioId)).toEqual([
      'REL-1',
      'REL-0',
    ]);
  });
});
