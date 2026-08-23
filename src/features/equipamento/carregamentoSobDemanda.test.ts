/**
 * Fase 9 · 9C — a ESTRATÉGIA OFICIAL DE COMPATIBILIDADE, provada.
 *
 * O que este arquivo trava é a promessa central do desenho (§4): dá para sair
 * de "o `Map` precisa conter a organização inteira antes de qualquer tela
 * funcionar" SEM reescrever os 40+ templates HTML.
 *
 *   lista leve → usuário abre a TAG → carregarEquipamento(tag) → semeia o cache
 *   → `ler()` SÍNCRONO encontra → o palco coleta a TAG → o documento monta.
 *
 * O teste roda com o cache VAZIO de propósito. Na 9C o boot ainda hidrata tudo,
 * então no navegador esta prova ficaria mascarada — o dado estaria lá de
 * qualquer jeito. Aqui não está, e é isso que dá valor ao teste: ele já vale
 * para o mundo da 9D, onde a hidratação integral deixa de existir.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

const servidor = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  pedidos: [] as string[][],
  falhar: false,
}));

vi.mock('../../services/supabase', async () => {
  const real = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase');
  return {
    ...real,
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: (_col: string, chaves: string[]) => {
              servidor.pedidos.push(chaves);
              if (servidor.falhar) return Promise.resolve({ data: null, error: { message: 'offline' } });
              return Promise.resolve({
                data: servidor.linhas.filter((l) => chaves.includes(String(l.chave))),
                error: null,
              });
            },
          }),
        }),
      }),
    },
  };
});

const ORG = '11111111-1111-1111-1111-111111111111';
const TAG = 'VP-203';

import * as cache from '../../services/cacheLocal';
import { definirArmazenamentoV2, zerarFlagEmMemoria } from '../../services/flag';
import { ler } from '../../services/storage';
import { carregarEquipamento, chavesDoEquipamento } from './equipamentoService';
import { coletarItens } from '../../services/palco';

function linha(chave: string, valor: unknown, versao = 3) {
  return {
    chave,
    valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    versao,
    atualizado_em: '2026-08-22T10:00:00.000Z',
    dispositivo: 'servidor',
    deletado_em: null,
  };
}

beforeEach(async () => {
  zerarFlagEmMemoria();
  definirArmazenamentoV2(true);
  cache.zerarMemoria();
  cache.definirOrg(ORG);
  servidor.pedidos = [];
  servidor.falhar = false;
  servidor.linhas = [
    linha(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'Vaso separador', fabricante: 'Werner' }),
    linha(`nr13_cat_${TAG}`, { catFinal: 'III', classe: 'B', volInput: 9.4, fluidoInput: 'Ar comprimido' }),
    linha(`nr13_calc_${TAG}`, { pmta: '1.2345', pth: '1.605', resultado: 'APROVADO', memorialHTML: '<p/>' }),
    linha(`nr13_emp_${TAG}`, { razaoSocial: 'Frigorífico Beta', clienteId: 'cli-1' }),
    linha(`nr13_fotos_${TAG}`, [{ id: 1, src: '', isCapa: true }]),
    linha(`nr13_calibracoes_${TAG}`, [{ id: 'cal-9' }]),
    linha('nr13_calibracao_item_cal-9', { id: 'cal-9', instrumento: 'Manômetro' }),
    // Chave de OUTRO equipamento: não pode vir junto.
    linha('nr13_info_OUTRO-1', { tag: 'OUTRO-1', tipo: 'caldeira' }),
  ];
});

describe('carregarEquipamento — a ponte que dispensa reescrever os templates', () => {
  it('com o cache VAZIO, `ler()` não acha nada — é o ponto de partida', () => {
    expect(ler(`nr13_info_${TAG}`)).toBeNull();
  });

  it('depois de carregar, `ler()` SÍNCRONO acha — nada mudou para o código legado', async () => {
    await carregarEquipamento(TAG);

    const info = ler<{ tag: string; fabricante?: string }>(`nr13_info_${TAG}`);
    expect(info?.tag).toBe(TAG);
    expect(info?.fabricante).toBe('Werner');
    // A ficha, o memorial e a categoria leem exatamente assim, sem alteração.
    expect(ler<{ catFinal: string }>(`nr13_cat_${TAG}`)?.catFinal).toBe('III');
    expect(ler<{ pmta: string }>(`nr13_calc_${TAG}`)?.pmta).toBe('1.2345');
  });

  it('pede as chaves da TAG pela MESMA tabela que o palco usa', async () => {
    await carregarEquipamento(TAG);
    const pedidas = servidor.pedidos.flat();
    // Se `POR_TAG` ganhar uma família nova, ela entra aqui sozinha. Montar uma
    // lista à parte deixaria este caminho para trás no dia dessa mudança.
    for (const chave of chavesDoEquipamento(TAG)) expect(pedidas).toContain(chave);
  });

  it('NÃO traz o parque inteiro — só a TAG pedida', async () => {
    await carregarEquipamento(TAG);
    expect(ler('nr13_info_OUTRO-1')).toBeNull();
    expect(servidor.pedidos.flat().some((c) => c.includes('OUTRO-1'))).toBe(false);
  });

  it('traz o certificado de calibração, que é chave POR ID e não por TAG', async () => {
    // Duas passadas: a lista de ids mora DENTRO de `nr13_calibracoes_<TAG>`, e
    // só existe depois da primeira. Sem a segunda, o certificado do relatório
    // sairia em branco.
    await carregarEquipamento(TAG);
    expect(ler<{ id: string }>('nr13_calibracao_item_cal-9')?.id).toBe('cal-9');
  });

  it('o PALCO acha as chaves da TAG — o documento monta', async () => {
    await carregarEquipamento(TAG);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves).toContain(`nr13_info_${TAG}`);
    expect(chaves).toContain(`nr13_cat_${TAG}`);
    expect(chaves).toContain(`nr13_calc_${TAG}`);
    expect(chaves).toContain('nr13_calibracao_item_cal-9');
  });

  it('preserva a VERSÃO do servidor — senão a próxima edição daria conflito', async () => {
    await carregarEquipamento(TAG);
    // `semearCache` do Portal fixa versão 1 porque é somente leitura. Aqui não
    // pode: o usuário vai EDITAR, e a RPC compara a versão base.
    expect(cache.obterRegistro(`nr13_info_${TAG}`)?.versao).toBe(3);
  });

  it('sem rede, NÃO lança e NÃO apaga o que já estava no cache', async () => {
    await carregarEquipamento(TAG);
    servidor.falhar = true;
    await expect(carregarEquipamento(TAG)).resolves.toBeUndefined();
    // Derrubar a navegação por causa da rede transformaria uma tela degradada
    // numa tela quebrada.
    expect(ler<{ tag: string }>(`nr13_info_${TAG}`)?.tag).toBe(TAG);
  });
});
