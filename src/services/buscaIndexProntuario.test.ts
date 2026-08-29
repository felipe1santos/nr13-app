/**
 * Fase 9 · 9F.2.2 — o badge "Prontuário OK" sai do render e vem da projeção.
 *
 * ## O que está sendo consertado
 *
 * `Prontuarios.tsx` escreve o badge com `carregarProntuario(eq.tag)` DENTRO do
 * render, uma vez por cartão: lê e faz `JSON.parse` do prontuário INTEIRO para
 * decidir entre duas palavras. Medido em produção em 29/08/2026, a família
 * `nr13_prontuario_` tem média de **6,6 KB** por TAG e máximo de **25,7 KB** —
 * com 1.000 equipamentos são ~6,6 MB de parse por quadro para escrever um
 * booleano.
 *
 * ## A regra que este arquivo trava: `null` NÃO é `false`
 *
 *   · existe a chave  → `true`  → "Prontuário OK"
 *   · não existe      → `false` → "Sem Prontuário"  (contei, e não há)
 *   · projeção antiga → `null`  → **badge some**     (ninguém contou)
 *
 * `null` virar `false` seria a tela afirmando "Sem Prontuário" sobre um
 * equipamento que pode ter um, numa organização cuja projeção nem foi refeita.
 * É o mesmo defeito do painel que inventava zero (prova offline da 9D) e o mesmo
 * cuidado que a 9F.1.2 tomou com `inspecoes`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  resposta: [] as unknown[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: () => {
      const p = Promise.resolve({ data: estado.resposta, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import { listarPagina, rotuloProntuario } from './buscaIndex';

const LINHA_BASE = {
  tag: 'VP-01',
  descricao: null,
  tipo: 'vaso',
  subtipo: null,
  categoria: null,
  fabricante: null,
  numero_serie: null,
  localizacao: null,
  ano: null,
  cliente_nome: null,
  cliente_cidade: null,
  proxima_inspecao: null,
  tem_foto: null,
  foto_ref: null,
  pmta_mpa: null,
  pth_mpa: null,
  resultado: null,
  volume_m3: null,
  fluido: null,
  classe_fluido: null,
  vida_anos: null,
  tem_cliente: null,
  unidade: null,
  source_version: 1,
};

beforeEach(() => {
  estado.resposta = [];
});

describe('rotuloProntuario', () => {
  it('`true` vira "Prontuário OK"', () => {
    expect(rotuloProntuario(true)).toBe('Prontuário OK');
  });

  it('`false` vira "Sem Prontuário" — contei, e não há', () => {
    expect(rotuloProntuario(false)).toBe('Sem Prontuário');
  });

  it('`null` NÃO vira rótulo nenhum — o badge some', () => {
    expect(rotuloProntuario(null)).toBeNull();
  });
});

describe('temProntuario na linha do catálogo', () => {
  it('coluna AUSENTE (servidor sem a migração) vira `null`, nunca `false`', async () => {
    estado.resposta = [{ ...LINHA_BASE }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].temProntuario).toBeNull();
  });

  it('`null` do banco continua `null`', async () => {
    estado.resposta = [{ ...LINHA_BASE, tem_prontuario: null }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].temProntuario).toBeNull();
  });

  it('`false` do banco continua `false` — é uma verificação, não uma ausência', async () => {
    estado.resposta = [{ ...LINHA_BASE, tem_prontuario: false }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].temProntuario).toBe(false);
  });

  it('`true` do banco continua `true`', async () => {
    estado.resposta = [{ ...LINHA_BASE, tem_prontuario: true }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].temProntuario).toBe(true);
  });
});
