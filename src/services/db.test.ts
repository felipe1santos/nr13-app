import { describe, it, expect, beforeEach } from 'vitest';
import { aplicarAtomico, obter, listarTudo, fecharDb, apagarDb } from './db';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

beforeEach(async () => {
  fecharDb();
  await apagarDb(ORG_A);
  await apagarDb(ORG_B);
});

describe('db — durabilidade e atomicidade', () => {
  it('aplicarAtomico só resolve DEPOIS do commit: leitura imediata já enxerga', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    // Sem sleep nenhum. Se resolvesse no onsuccess do request (antes do commit),
    // este teste seria instável — que é justamente o bug que ele trava.
    expect(await obter(ORG_A, 'dados', 'k')).toEqual({ v: 1 });
  });

  it('escreve dados + fila na MESMA transação', async () => {
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'put', chave: 'nr13_info_A', valor: { valor: '{}' } },
      { store: 'fila', acao: 'put', chave: 'm1', valor: { mutationId: 'm1' } },
    ]);
    expect(await obter(ORG_A, 'dados', 'nr13_info_A')).not.toBeNull();
    expect(await obter(ORG_A, 'fila', 'm1')).not.toBeNull();
  });

  it('ABORTO: se uma operação falha, NENHUMA das outras persiste', async () => {
    await expect(
      aplicarAtomico(ORG_A, [
        { store: 'dados', acao: 'put', chave: 'k1', valor: { v: 1 } },
        // Função não é clonável pelo structured clone: aborta a transação inteira.
        { store: 'fila', acao: 'put', chave: 'm1', valor: { fn: () => 1 } },
      ]),
    ).rejects.toBeTruthy();

    // Sem atomicidade, k1 teria ficado: dado gravado sem a fila que o sincroniza.
    expect(await obter(ORG_A, 'dados', 'k1')).toBeNull();
  });

  it('listarTudo devolve chave e valor alinhados (cursor, uma transação)', async () => {
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'put', chave: 'k1', valor: { v: 1 } },
      { store: 'dados', acao: 'put', chave: 'k2', valor: { v: 2 } },
    ]);
    const linhas = await listarTudo<{ v: number }>(ORG_A, 'dados');
    expect(linhas.sort((a, b) => a.chave.localeCompare(b.chave))).toEqual([
      { chave: 'k1', valor: { v: 1 } },
      { chave: 'k2', valor: { v: 2 } },
    ]);
  });

  it('listarTudo de store vazia devolve lista vazia', async () => {
    expect(await listarTudo(ORG_A, 'tombstones')).toEqual([]);
  });

  it('obter de chave ausente devolve null', async () => {
    expect(await obter(ORG_A, 'dados', 'nao_existe')).toBeNull();
  });

  it('ISOLAMENTO: dado da org A não aparece na org B', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    expect(await obter(ORG_B, 'dados', 'k')).toBeNull();
  });

  it('delete atômico junto de put', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'delete', chave: 'k' },
      { store: 'tombstones', acao: 'put', chave: 'k', valor: { chave: 'k' } },
    ]);
    expect(await obter(ORG_A, 'dados', 'k')).toBeNull();
    expect(await obter(ORG_A, 'tombstones', 'k')).not.toBeNull();
  });

  it('lista de operações vazia é no-op e não abre transação', async () => {
    await expect(aplicarAtomico(ORG_A, [])).resolves.toBeUndefined();
  });

  it('trocar de org fecha a conexão anterior (nunca reaproveita entre contas)', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 'a' } }]);
    await aplicarAtomico(ORG_B, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 'b' } }]);
    expect(await obter(ORG_A, 'dados', 'k')).toEqual({ v: 'a' });
    expect(await obter(ORG_B, 'dados', 'k')).toEqual({ v: 'b' });
  });

  it('apagarDb zera a org inteira', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    await apagarDb(ORG_A);
    expect(await obter(ORG_A, 'dados', 'k')).toBeNull();
  });
});
