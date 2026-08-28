/**
 * Fase 9 · 9C — OFFLINE: a lista nunca fica vazia sem explicação.
 *
 * O bloqueante que o dono fixou no desenho (§8): busca server-side NÃO pode
 * virar "sem internet, listas vazias". Aqui se prova que o catálogo guardado no
 * aparelho responde a mesma consulta, com a mesma ordem e a mesma paginação.
 *
 * E o outro compromisso, o do §6.5: item salvo offline aparece IMEDIATAMENTE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('./supabase', () => ({
  supabase: { rpc: () => { throw new Error('offline: nenhuma consulta pode sair daqui'); } },
}));

const ORG = '22222222-2222-2222-2222-222222222222';

import * as cache from './cacheLocal';
import * as catalogo from './catalogoLocal';
import { apagarDb } from './db';
import { TAMANHO_PAGINA, fundirLocais, type ItemCatalogo } from './buscaIndex';

function item(tag: string, extra: Partial<ItemCatalogo> = {}): ItemCatalogo {
  return {
    tag, descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numeroSerie: null, localizacao: null, ano: null, clienteNome: null, clienteCidade: null,
    proximaInspecao: null,
    temFoto: false, fotoRef: null, pmtaMpa: null, pthMpa: null, resultado: null,
    volumeM3: null, fluido: null, classeFluido: null, vidaAnos: null, temCliente: false, inspecoes: null,
    unidade: null, sourceVersion: 1,
    ...extra,
  };
}

beforeEach(async () => {
  cache.zerarMemoria();
  cache.definirOrg(ORG);
  // O IndexedDB falso PERSISTE entre os testes do arquivo. Sem apagar, o
  // catálogo de um teste vaza para o seguinte e as contagens somam.
  await apagarDb(ORG);
});

describe('o catálogo do aparelho responde a mesma busca', () => {
  it('guarda o que a listagem já trouxe — custo de rede zero', async () => {
    await catalogo.guardar([item('VP-001'), item('VP-002')]);
    expect(await catalogo.quantosGuardados()).toBe(2);
  });

  it('acha por FABRICANTE offline, e sem acento', async () => {
    await catalogo.guardar([
      item('VP-001', { fabricante: 'Metalúrgica Silva' }),
      item('VP-002', { fabricante: 'Werner' }),
    ]);
    const p = await catalogo.paginaLocal({ termo: 'metalurgica' });
    expect(p.itens.map((i) => i.tag)).toEqual(['VP-001']);
  });

  it('acha por Nº DE SÉRIE offline, ignorando o separador', async () => {
    await catalogo.guardar([item('VP-001', { numeroSerie: 'SN-0012/3456' }), item('VP-002')]);
    expect((await catalogo.paginaLocal({ termo: 'sn00123456' })).itens.map((i) => i.tag)).toEqual(['VP-001']);
  });

  it('aplica os MESMOS filtros de tipo e categoria', async () => {
    await catalogo.guardar([
      item('VP-001', { tipo: 'caldeira', categoria: 'III' }),
      item('VP-002', { tipo: 'vaso', categoria: 'III' }),
    ]);
    const p = await catalogo.paginaLocal({ tipo: 'caldeira' });
    expect(p.itens.map((i) => i.tag)).toEqual(['VP-001']);
  });

  it('pagina com o MESMO keyset e o mesmo tamanho de página', async () => {
    const muitos = Array.from({ length: 120 }, (_, i) => item(`VP-${String(i).padStart(4, '0')}`));
    await catalogo.guardar(muitos);

    const p1 = await catalogo.paginaLocal({});
    expect(p1.itens).toHaveLength(TAMANHO_PAGINA);
    expect(p1.temMais).toBe(true);

    const p2 = await catalogo.paginaLocal({}, p1.proximoCursor);
    expect(p2.itens).toHaveLength(TAMANHO_PAGINA);
    // Sem sobreposição entre as páginas: é a mesma garantia do servidor.
    const cruzam = p2.itens.filter((i) => p1.itens.some((j) => j.tag === i.tag));
    expect(cruzam).toHaveLength(0);

    const p3 = await catalogo.paginaLocal({}, p2.proximoCursor);
    expect(p3.itens).toHaveLength(20);
    expect(p3.temMais).toBe(false);

    // Percorrer tudo devolve os 120, sem repetir nem pular.
    const todas = [...p1.itens, ...p2.itens, ...p3.itens].map((i) => i.tag);
    expect(new Set(todas).size).toBe(120);
  });

  it('ordena BYTE A BYTE, igual à collation "C" do servidor', async () => {
    await catalogo.guardar([item('a-1'), item('B-1'), item('A-1')]);
    const p = await catalogo.paginaLocal({});
    expect(p.itens.map((i) => i.tag)).toEqual(['A-1', 'B-1', 'a-1']);
  });

  it('a contagem offline é exata — o teto do servidor não se aplica aqui', async () => {
    await catalogo.guardar(Array.from({ length: 7 }, (_, i) => item(`VP-${i}`, { fabricante: 'Werner' })));
    expect(await catalogo.contarLocal({ termo: 'werner' })).toBe(7);
  });

  it('equipamento excluído sai do catálogo', async () => {
    await catalogo.guardar([item('VP-001'), item('VP-002')]);
    await catalogo.remover('VP-001');
    expect((await catalogo.paginaLocal({})).itens.map((i) => i.tag)).toEqual(['VP-002']);
  });
});

describe('o que o usuário salvou offline aparece na hora (§6.5)', () => {
  it('item local entra na lista mesmo com o catálogo sem ele', async () => {
    await catalogo.guardar([item('VP-100')]);
    const daPagina = (await catalogo.paginaLocal({})).itens;
    const comLocal = fundirLocais(daPagina, [item('VP-001', { pendente: true })]);
    expect(comLocal.map((i) => i.tag)).toEqual(['VP-001', 'VP-100']);
    expect(comLocal[0].pendente).toBe(true);
  });

  it('catálogo vazio + item local = a lista mostra o item, não um vazio', async () => {
    // Este é o caso que NÃO pode virar "nenhum equipamento": o usuário acabou de
    // cadastrar, está sem rede, e o aparelho nunca baixou catálogo nenhum.
    const p = await catalogo.paginaLocal({});
    expect(p.itens).toHaveLength(0);
    expect(fundirLocais(p.itens, [item('VP-NOVO')])).toHaveLength(1);
  });
});

describe('sincronização explícita do catálogo', () => {
  it('percorre as páginas pelo cursor e guarda tudo', async () => {
    const todos = Array.from({ length: 130 }, (_, i) => item(`VP-${String(i).padStart(4, '0')}`));
    const buscar = async (_f: unknown, cursor: string | null) => {
      const restantes = todos.filter((i) => cursor === null || i.tag > cursor);
      const pagina = restantes.slice(0, TAMANHO_PAGINA);
      return {
        itens: pagina,
        proximoCursor: pagina.length ? pagina[pagina.length - 1].tag : null,
        temMais: restantes.length > TAMANHO_PAGINA,
      };
    };

    const passos: number[] = [];
    const baixados = await catalogo.sincronizarTudo(buscar, (n) => passos.push(n));
    expect(baixados).toBe(130);
    expect(await catalogo.quantosGuardados()).toBe(130);
    // Reporta progresso: é o que a tela mostra durante o download.
    expect(passos).toEqual([50, 100, 130]);
  });
});
