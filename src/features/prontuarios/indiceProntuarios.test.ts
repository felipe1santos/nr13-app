import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAVE_INDICE_PRONT,
  docDeEmissao,
  docDeRascunho,
  encerrarRascunho,
  filtrarDocumentos,
  idRascunho,
  listarDocumentos,
  reconciliar,
  registrarDocumento,
  removerDoIndice,
  type DocumentoProntuario,
} from './indiceProntuarios';
import { ler, salvar } from '../../services/storage';
import type { EmissaoProntuario } from './emissaoProntuario';

const emissao = (id: string, tag: string, geradoEm: string): EmissaoProntuario => ({
  id,
  tag,
  numero: 'REL-1',
  emissao: '06/09/2026',
  motor: 'vetorial',
  pdfRef: { path: `x/${id}.pdf` } as EmissaoProntuario['pdfRef'],
  sha256: 'abc',
  paginas: 4,
  tamanho: 1000,
  geradoEm,
  pdfPendente: false,
});

async function limpar() {
  await salvar(CHAVE_INDICE_PRONT, []);
  for (const k of ['nr13_pront_emitido_A', 'nr13_pront_emitido_B', 'nr13_prontuario_A', 'nr13_prontuario_B', 'nr13_prontuario_C']) {
    await salvar(k, null);
  }
}

beforeEach(limpar);

describe('uma linha por DOCUMENTO', () => {
  it('três revisões do mesmo equipamento são três linhas', async () => {
    // O defeito que este índice conserta: a lista mostrava um EQUIPAMENTO por
    // linha, com um selo "Prontuário OK". As revisões anteriores — documentos
    // assinados, com pdfRef e SHA próprios — não tinham onde ser vistas.
    for (const [i, iso] of ['2026-09-01', '2026-09-03', '2026-09-06'].entries()) {
      await registrarDocumento(docDeEmissao(emissao(`P-${i}`, 'A', iso), i + 1, 'Vaso', 'ACME'));
    }
    const lista = listarDocumentos();
    expect(lista).toHaveLength(3);
    expect(lista.map((d) => d.revisao)).toEqual([3, 2, 1]); // mais recente primeiro
    expect(new Set(lista.map((d) => d.tag))).toEqual(new Set(['A']));
  });

  it('gravar a mesma entrada duas vezes não duplica a linha', async () => {
    const doc = docDeEmissao(emissao('P-1', 'A', '2026-09-01'), 1, 'Vaso', null);
    await registrarDocumento(doc);
    await registrarDocumento(doc);
    expect(listarDocumentos()).toHaveLength(1);
  });

  it('salvar o rascunho dez vezes continua sendo uma linha', async () => {
    for (let i = 0; i < 10; i++) {
      await registrarDocumento(docDeRascunho('A', { descricao: 'Vaso', empresaRazaoSocial: '' }, null));
    }
    expect(listarDocumentos()).toHaveLength(1);
    expect(listarDocumentos()[0].id).toBe(idRascunho('A'));
  });
});

describe('rascunho e emissão convivem', () => {
  it('emitir encerra o rascunho e mantém as emissões', async () => {
    await registrarDocumento(docDeRascunho('A', null, null));
    await registrarDocumento(docDeEmissao(emissao('P-1', 'A', '2026-09-01'), 1, null, null));
    await encerrarRascunho('A');
    const lista = listarDocumentos();
    expect(lista).toHaveLength(1);
    expect(lista[0].situacao).toBe('emitido');
  });

  it('encerrar rascunho inexistente não reescreve o índice', async () => {
    await registrarDocumento(docDeEmissao(emissao('P-1', 'A', '2026-09-01'), 1, null, null));
    const antes = ler(CHAVE_INDICE_PRONT);
    await encerrarRascunho('B');
    // O conteúdo não muda — e a função retorna cedo antes de gravar, para não
    // custar uma linha na fila de sync a cada abertura da tela. A identidade da
    // referência não serve como prova aqui: na v1 cada `ler` refaz o parse.
    expect(ler(CHAVE_INDICE_PRONT)).toEqual(antes);
  });

  it('continuar editando depois de emitir volta a ter as duas linhas', async () => {
    await registrarDocumento(docDeEmissao(emissao('P-1', 'A', '2026-09-01'), 1, null, null));
    await registrarDocumento(docDeRascunho('A', null, null));
    const lista = listarDocumentos();
    expect(lista.map((d) => d.situacao).sort()).toEqual(['emitido', 'rascunho']);
  });
});

describe('reconciliação: o índice nasce preenchido', () => {
  it('reconstrói as emissões que já existiam no aparelho', async () => {
    await salvar('nr13_pront_emitido_A', [
      emissao('P-1', 'A', '2026-09-01'),
      emissao('P-2', 'A', '2026-09-05'),
    ]);
    await salvar('nr13_prontuario_A', { tag: 'A', descricao: 'Vaso 1', empresaRazaoSocial: 'ACME' });

    expect(await reconciliar()).toBe(2);
    const lista = listarDocumentos();
    expect(lista).toHaveLength(2);
    expect(lista.map((d) => d.revisao).sort()).toEqual([1, 2]);
    expect(lista[0].equipamento).toBe('Vaso 1');
    expect(lista[0].cliente).toBe('ACME');
  });

  it('SÓ ACRESCENTA — não apaga o que veio de outro aparelho', async () => {
    // O índice sincroniza pela v2 e pode conhecer documentos que esta máquina
    // ainda não hidratou. Reescrevê-lo a partir do que há aqui os apagaria.
    const deOutroAparelho: DocumentoProntuario = {
      ...docDeEmissao(emissao('P-9', 'Z', '2026-08-01'), 1, null, null),
    };
    await salvar(CHAVE_INDICE_PRONT, [deOutroAparelho]);
    await salvar('nr13_pront_emitido_A', [emissao('P-1', 'A', '2026-09-01')]);

    await reconciliar();
    expect(listarDocumentos().map((d) => d.id).sort()).toEqual(['P-1', 'P-9']);
  });

  it('é idempotente: rodar de novo não acrescenta nada', async () => {
    await salvar('nr13_pront_emitido_A', [emissao('P-1', 'A', '2026-09-01')]);
    expect(await reconciliar()).toBe(1);
    expect(await reconciliar()).toBe(0);
  });

  it('dados salvos SEM emissão viram rascunho', async () => {
    await salvar('nr13_prontuario_C', {
      tag: 'C',
      descricao: 'Caldeira',
      empresaRazaoSocial: '',
      criadoEm: '2026-09-02',
    });
    expect(await reconciliar()).toBe(1);
    const [d] = listarDocumentos();
    expect(d.situacao).toBe('rascunho');
    expect(d.tag).toBe('C');
  });

  it('dados salvos COM emissão não viram rascunho', async () => {
    // Os dados podem ser a cópia do que foi emitido; anunciar "rascunho" faria
    // a lista mostrar um trabalho em aberto que ninguém abriu.
    await salvar('nr13_prontuario_A', { tag: 'A', descricao: 'Vaso', empresaRazaoSocial: '' });
    await salvar('nr13_pront_emitido_A', [emissao('P-1', 'A', '2026-09-01')]);
    await reconciliar();
    expect(listarDocumentos().map((d) => d.situacao)).toEqual(['emitido']);
  });
});

describe('remoção e busca', () => {
  it('remover tira todas as linhas daquele equipamento', async () => {
    await registrarDocumento(docDeEmissao(emissao('P-1', 'A', '2026-09-01'), 1, null, null));
    await registrarDocumento(docDeEmissao(emissao('P-2', 'B', '2026-09-02'), 1, null, null));
    await removerDoIndice('A');
    expect(listarDocumentos().map((d) => d.tag)).toEqual(['B']);
  });

  it('a busca alcança TAG, equipamento, cliente e número', () => {
    const lista = [
      { ...docDeEmissao(emissao('P-1', 'VP-01', '2026-09-01'), 1, 'Vaso pulmão', 'Posto Ipiranga') },
      { ...docDeEmissao(emissao('P-2', 'CD-02', '2026-09-02'), 1, 'Caldeira', 'TERCAL') },
    ];
    expect(filtrarDocumentos(lista, 'vp-0').map((d) => d.tag)).toEqual(['VP-01']);
    expect(filtrarDocumentos(lista, 'pulmão').map((d) => d.tag)).toEqual(['VP-01']);
    expect(filtrarDocumentos(lista, 'tercal').map((d) => d.tag)).toEqual(['CD-02']);
    expect(filtrarDocumentos(lista, 'REL-1')).toHaveLength(2);
    expect(filtrarDocumentos(lista, '')).toHaveLength(2);
  });
});

describe('a varredura por prefixo pega mais do que os dados', () => {
  /*
   * Defeito medido em produção em 06/09/2026, com a lista já no ar.
   *
   * `nr13_prontuario_` também casa com `nr13_prontuario_meta_<TAG>` — o número
   * e a data do documento (§8) — e com `nr13_prontuario_assinantes_`. A lista
   * ganhou linhas fantasma com TAG `meta_COMPRESSOR V8-15/200L`, sem cliente e
   * com data de 01/01/1970.
   */
  it('a chave de META não vira uma linha', async () => {
    await salvar('nr13_prontuario_meta_A', { numero: 'REL-1', emissao: '06/09/2026' });
    expect(await reconciliar()).toBe(0);
    expect(listarDocumentos()).toHaveLength(0);
    await salvar('nr13_prontuario_meta_A', null);
  });

  it('o teste é o CONTEÚDO: a TAG do registro tem que bater com a da chave', async () => {
    // Um registro que não sabe de quem é não vira linha na lista.
    await salvar('nr13_prontuario_A', { tag: 'OUTRA', descricao: 'x', empresaRazaoSocial: '' });
    expect(await reconciliar()).toBe(0);
    await salvar('nr13_prontuario_A', { tag: 'A', descricao: 'x', empresaRazaoSocial: '' });
    expect(await reconciliar()).toBe(1);
  });

  it('sem `criadoEm` a data fica vazia — nunca 1970', async () => {
    await salvar('nr13_prontuario_A', { tag: 'A', descricao: 'x', empresaRazaoSocial: '' });
    await reconciliar();
    expect(listarDocumentos()[0].atualizadoEm).toBe('');
  });

  it('as linhas fantasma já gravadas são purgadas', async () => {
    // Elas já estão no índice de quem abriu a tela, e `reconciliar` só
    // acrescenta — então precisam sair por nome.
    await salvar(CHAVE_INDICE_PRONT, [
      docDeRascunho('meta_A', null, null),
      docDeRascunho('assinantes_B', null, null),
      docDeRascunho('C', { descricao: 'real', empresaRazaoSocial: '' }, null),
    ]);
    await reconciliar();
    expect(listarDocumentos().map((d) => d.tag)).toEqual(['C']);
  });

  it('a purga NÃO alcança um equipamento de verdade', async () => {
    // Só entrada de rascunho, com sufixo de chave conhecido, E sem registro de
    // dados. Um equipamento real falha nas três.
    await salvar('nr13_prontuario_meta_X', { tag: 'meta_X', descricao: 'existe mesmo', empresaRazaoSocial: '' });
    await salvar(CHAVE_INDICE_PRONT, [docDeRascunho('meta_X', { descricao: 'existe mesmo', empresaRazaoSocial: '' }, null)]);
    await reconciliar();
    expect(listarDocumentos().map((d) => d.tag)).toEqual(['meta_X']);
    await salvar('nr13_prontuario_meta_X', null);
  });
});
