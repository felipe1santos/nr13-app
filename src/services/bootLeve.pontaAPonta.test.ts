/**
 * Fase 9 · 9D.6 — a estratégia de compatibilidade, ponta a ponta.
 *
 * Esta é a prova que sustenta a fase inteira (desenho §4), e o que ela precisa
 * mostrar é uma frase só: **o documento sai IDÊNTICO pelos dois caminhos.**
 *
 *   boot leve (só o essencial)  →  usuário abre a TAG  →  carregarEquipamento
 *   →  `ler()` SÍNCRONO encontra  →  o palco coleta a TAG  →  o documento monta
 *
 * O caminho antigo baixa a organização inteira antes da primeira tela; o novo
 * baixa um punhado de chaves e o resto quando o usuário pede. Se as duas
 * montagens do palco divergirem em UMA chave, o documento impresso muda — e é
 * documento assinado por engenheiro.
 *
 * NENHUM template é tocado por este trabalho, e é isso que o teste trava.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const ORG = '55555555-5555-5555-5555-555555555555';
const TAG = 'VP-9D';

/** A organização inteira, do lado do servidor. */
const SERVIDOR: Array<Record<string, unknown>> = [];
/** O que cada caminho PEDIU — é onde se vê o boot deixar de baixar tudo. */
const pedidos: Array<{ tipo: string; alvo: unknown }> = [];

function linha(chave: string, valor: unknown, versao = 2) {
  return {
    chave,
    valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    versao,
    atualizado_em: '2026-08-24T10:00:00.000Z',
    dispositivo: 'servidor',
    deletado_em: null,
  };
}

vi.mock('./supabase', () => {
  const construir = () => {
    let filtro: { tipo: string; alvo: unknown } | null = null;
    const resolver = () => {
      if (!filtro) return { data: [], error: null };
      const { tipo, alvo } = filtro;
      const casa = (chave: string) => {
        if (tipo === 'in') return (alvo as string[]).includes(chave);
        if (tipo === 'like') return chave.startsWith(String(alvo).replace(/%$/, ''));
        return true;
      };
      return { data: SERVIDOR.filter((l) => casa(String(l.chave))), error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      gt: () => api,
      order: () => api,
      in: (_c: string, valores: string[]) => {
        filtro = { tipo: 'in', alvo: valores };
        pedidos.push(filtro);
        return api;
      },
      like: (_c: string, padrao: string) => {
        filtro = { tipo: 'like', alvo: padrao };
        pedidos.push(filtro);
        return api;
      },
      range: async (inicio: number, fim: number) => {
        pedidos.push({ tipo: 'tudo', alvo: `${inicio}-${fim}` });
        return { data: SERVIDOR.slice(inicio, fim + 1), error: null };
      },
      then: (aceitar: (v: unknown) => unknown) => Promise.resolve(resolver()).then(aceitar),
    };
    return api;
  };
  return {
    supabase: {
      from: () => construir(),
      rpc: vi.fn(async () => ({ data: { status: 'aplicado', versao: 2 }, error: null })),
    },
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    idUsuarioAtual: vi.fn(async () => 'user-1'),
    TABELA_STORAGE: 'app_storage',
  };
});

import { fecharDb, apagarDb } from './db';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { hidratarEssencial, lerTudo, zerarThrottleHidratacao } from './storageV2';
import { definirArmazenamentoV2, zerarFlagEmMemoria } from './flag';
import { carregarEquipamento } from '../features/equipamento/equipamentoService';
import { coletarItens } from './palco';

beforeEach(async () => {
  zerarFlagEmMemoria();
  definirArmazenamentoV2(true);
  cache.zerarMemoria();
  sync.zerarFilaMemoria();
  sync.zerarTombstonesMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  zerarThrottleHidratacao();
  cache.definirOrg(ORG);
  pedidos.length = 0;

  SERVIDOR.length = 0;
  SERVIDOR.push(
    // ── globais, o que o boot leve traz ──
    linha('nr13_minha_empresa', { nome: 'ACME Inspeções', logo: 'data:x' }),
    linha('nr13_lista_phs', [{ id: 'ph-1', nome: 'Eng. Responsável' }]),
    linha('nr13_rastreab_ultra1', { id: 'ultra1', tipoInstrumento: 'ultrassom', temPdf: true }),
    // ── o equipamento do documento ──
    linha(`nr13_info_${TAG}`, { tag: TAG, tipo: 'vaso', descricao: 'Vaso separador' }),
    linha(`nr13_cat_${TAG}`, { catFinal: 'III' }),
    linha(`nr13_calc_${TAG}`, { pmta: '1.2345', pth: '1.605' }),
    linha(`nr13_emp_${TAG}`, { razaoSocial: 'Frigorífico Beta', cidade: 'Vila Velha' }),
    linha(`nr13_med_esp_${TAG}`, [{ ponto: 1, valor: 9.4 }]),
    linha(`nr13_livro_config_${TAG}`, { numero: '001' }),
    linha(`nr13_calibracoes_${TAG}`, [{ id: 'cal-1' }]),
    linha('nr13_calibracao_item_cal-1', { id: 'cal-1', instrumento: 'Manômetro' }),
    // ── OUTRO equipamento: o boot leve não pode trazê-lo ──
    linha('nr13_info_OUTRO', { tag: 'OUTRO', tipo: 'caldeira' }),
    linha('nr13_fotos_OUTRO', [{ id: 1, src: 'x'.repeat(500) }]),
  );
});

/** As chaves que o palco levaria para os templates, em ordem estável. */
function palcoDaTag(): string[] {
  return coletarItens(TAG)
    .map((i) => i.chave)
    .sort();
}

describe('boot leve, ponta a ponta', () => {
  it('o boot NÃO baixa a organização — e a TAG ainda não está no cache', async () => {
    await hidratarEssencial();

    expect(pedidos.some((p) => p.tipo === 'tudo')).toBe(false);
    expect(cache.obterRegistro('nr13_minha_empresa')).not.toBeNull();
    expect(cache.obterRegistro(`nr13_info_${TAG}`)).toBeNull();
    expect(cache.obterRegistro('nr13_info_OUTRO')).toBeNull();
  });

  it('abrir a TAG monta o MESMO palco que a hidratação integral montaria', async () => {
    // Caminho ANTIGO: baixa tudo, monta o palco.
    await lerTudo();
    const palcoAntigo = palcoDaTag();
    expect(palcoAntigo).toContain(`nr13_info_${TAG}`);

    // Caminho NOVO, do zero: boot leve + abrir a TAG.
    cache.zerarMemoria();
    fecharDb();
    await apagarDb(ORG);
    cache.definirOrg(ORG);
    await hidratarEssencial();
    await carregarEquipamento(TAG);

    expect(palcoDaTag()).toEqual(palcoAntigo);
  });

  it('o palco montado sob boot leve NÃO arrasta o outro equipamento', async () => {
    await hidratarEssencial();
    await carregarEquipamento(TAG);

    const chaves = palcoDaTag();
    expect(chaves.some((c) => c.includes('OUTRO'))).toBe(false);
  });

  it('abrir a TAG pede só as chaves dela — nunca uma paginação da organização', async () => {
    await hidratarEssencial();
    pedidos.length = 0;

    await carregarEquipamento(TAG);

    expect(pedidos.some((p) => p.tipo === 'tudo')).toBe(false);
    expect(pedidos.every((p) => p.tipo === 'in')).toBe(true);
  });
});
