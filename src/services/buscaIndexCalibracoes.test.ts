/**
 * Fase 9 · 9F.3.2 — a contagem de calibrações sai do render e vem da projeção.
 *
 * ## O que está sendo consertado
 *
 * `Calibracoes.tsx:417` escreve o número com `listarCalibracoes(eq.tag).length`
 * DENTRO do `.map()` do render: um `JSON.parse` da lista INTEIRA por cartão, a
 * cada quadro, para imprimir um inteiro. Medido em produção em 31/08/2026, a
 * família `nr13_calibracoes_` tem média de **2,1 KB** por TAG e máximo de
 * **8,9 KB**. E a tela ainda lê `nr13_emp_<TAG>` três vezes no mesmo quadro.
 *
 * ## A regra que este arquivo trava: `null` NÃO é `0`
 *
 *   · contei e há 3   → `3`    → "3 calibrações"
 *   · contei e não há → `0`    → "Nenhuma calibração"  (contei, e não há)
 *   · projeção antiga → `null` → **o rótulo some**      (ninguém contou)
 *
 * Aqui o `null` virando `0` é o pior dos três casos da fase: é esse número que
 * o usuário lê para decidir que uma válvula ou um manômetro não precisa
 * calibrar. Mesmo cuidado da 9F.1.2 com `inspecoes` e da 9F.2.2 com
 * `tem_prontuario`, e mesma origem: o painel que inventava zero, na prova
 * offline da 9D.
 *
 * ## E de onde o número vem
 *
 * De `calibracoes_index` — a MESMA tabela que alimenta o painel de vencimentos.
 * Não do `.length` do array. As duas contagens podem divergir (item sem `id`
 * não entra na projeção), e o `testes-9f3.sql` mede essa divergência. Ter um
 * número no cartão e outro no painel para a mesma coisa é como as divergências
 * de cartão nasceram na 9C.
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

import { listarPagina, rotuloCalibracoes } from './buscaIndex';

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

describe('rotuloCalibracoes — o que a tela escreve', () => {
  it('`null` NÃO vira rótulo nenhum — quem não contou não afirma', () => {
    expect(rotuloCalibracoes(null)).toBeNull();
  });

  it('`0` vira "Nenhuma calibração" — contei, e não há', () => {
    expect(rotuloCalibracoes(0)).toBe('Nenhuma calibração');
  });

  it('`1` fica no singular', () => {
    expect(rotuloCalibracoes(1)).toBe('1 calibração');
  });

  it('mais de um vai para o plural', () => {
    expect(rotuloCalibracoes(3)).toBe('3 calibrações');
    expect(rotuloCalibracoes(12)).toBe('12 calibrações');
  });
});

describe('calibracoes na linha do catálogo', () => {
  it('coluna AUSENTE (servidor sem a migração) vira `null`, nunca `0`', async () => {
    estado.resposta = [{ ...LINHA_BASE }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].calibracoes).toBeNull();
  });

  it('`null` do banco continua `null`', async () => {
    estado.resposta = [{ ...LINHA_BASE, calibracoes: null }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].calibracoes).toBeNull();
  });

  it('`0` do banco continua `0` — é uma contagem, não uma ausência', async () => {
    estado.resposta = [{ ...LINHA_BASE, calibracoes: 0 }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].calibracoes).toBe(0);
  });

  it('um número chega inteiro', async () => {
    estado.resposta = [{ ...LINHA_BASE, calibracoes: 7 }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].calibracoes).toBe(7);
  });

  it('`integer` que o PostgREST devolva como STRING vira número', async () => {
    // `numeric` sempre chega como string; `integer` costuma chegar número. O
    // mapeamento não pode depender de qual dos dois o driver escolheu — se
    // '2' escapasse como string, `rotuloCalibracoes` faria '2 calibrações'
    // por acidente e `=== 0` nunca casaria com a string '0'.
    estado.resposta = [{ ...LINHA_BASE, calibracoes: '2' }];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].calibracoes).toBe(2);
  });

  it('a contagem NÃO atropela as colunas da 9F.1 e da 9F.2', async () => {
    estado.resposta = [
      { ...LINHA_BASE, inspecoes: 4, tem_prontuario: true, calibracoes: 2 },
    ];
    const pagina = await listarPagina({});
    expect(pagina.itens[0].inspecoes).toBe(4);
    expect(pagina.itens[0].temProntuario).toBe(true);
    expect(pagina.itens[0].calibracoes).toBe(2);
  });
});
