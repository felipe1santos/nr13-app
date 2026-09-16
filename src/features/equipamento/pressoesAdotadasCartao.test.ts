/**
 * O cartão de `/equipamentos` mostra a pressão ADOTADA, não a calculada.
 *
 * A regra, por inteiro:
 *
 *   MEMORIAL calcula        → `nr13_calc_<TAG>.pmta` / `.pth`
 *   ENGENHEIRO adota        → `nr13_info_<TAG>.pmtaAdotadaMpa` / `.pthAdotadaMpa`
 *                             (ficha, seção "Pressões da Documentação")
 *   CARTÃO/LINHA da lista   → a ADOTADA, e "—" quando não há
 *
 * O cartão é o RESUMO DA FICHA, e em pressão quem manda na ficha é o que o
 * engenheiro adotou. Antes de 15/09/2026 ele mostrava a calculada: 2,33 MPa no
 * cartão onde a ficha dizia 2,2.
 *
 * DUAS COISAS QUE ESTE ARQUIVO PRECISA PROVAR JUNTAS:
 *
 *   1. que a adotada CHEGA (projeção → RPC → `ItemCatalogo`), independente da
 *      calculada — que continua chegando, porque as outras quatro listas
 *      (Inspeções, Prontuários, Relatórios, Calibrações) a mostram;
 *   2. que o cartão NÃO CAI na calculada quando a adotada falta. Esta é a parte
 *      que some sem teste: um `?? item.pmtaMpa` "defensivo" passa despercebido
 *      em revisão, não quebra nada e devolve exatamente o defeito — o resumo
 *      afirmando uma adoção que o engenheiro não fez.
 *
 * A prova do item 2 é uma VARREDURA DO FONTE, e não um render: a suíte roda em
 * `environment: 'node'`, sem jsdom e sem testing-library, e `include` só pega
 * `*.test.ts`. Mesmo recurso de `palco.varreduraTemplates.test.ts` — quando não
 * dá para observar o comportamento, trava-se o texto que o produz.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const estado = vi.hoisted(() => ({
  resposta: [] as unknown[],
}));

vi.mock('../../services/supabase', () => ({
  supabase: {
    rpc: () => {
      const p = Promise.resolve({ data: estado.resposta, error: null });
      return Object.assign(p, { abortSignal: () => p });
    },
  },
}));

import { listarPagina } from '../../services/buscaIndex';

/** Uma linha da RPC `buscar_equipamentos`, com o mínimo que o mapeamento lê. */
function linha(extra: Record<string, unknown> = {}) {
  return {
    tag: 'ZZ-FASE3',
    descricao: null, tipo: 'vaso', subtipo: null, categoria: null, fabricante: null,
    numero_serie: null, localizacao: null, ano: null, cliente_nome: null, cliente_cidade: null,
    proxima_inspecao: null, tem_foto: false, foto_ref: null,
    pmta_mpa: null, pth_mpa: null, resultado: null, volume_m3: null,
    fluido: null, classe_fluido: null, vida_anos: null, tem_cliente: false,
    unidade: null, source_version: 1,
    ...extra,
  };
}

const fonte = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

beforeEach(() => {
  estado.resposta = [];
});

describe('a pressão adotada chega da projeção até a tela', () => {
  it('adotada e calculada viajam JUNTAS e SEPARADAS — uma não vira a outra', async () => {
    // O caso real que motivou a mudança: memorial 2.33/3.02, ficha 2.2/2.86.
    estado.resposta = [
      linha({
        pmta_mpa: '2.33', pth_mpa: '3.02',
        pmta_adotada_mpa: '2.2', pth_adotada_mpa: '2.86',
      }),
    ];

    const [item] = (await listarPagina()).itens;

    expect(item.pmtaAdotadaMpa).toBeCloseTo(2.2);
    expect(item.pthAdotadaMpa).toBeCloseTo(2.86);
    // As calculadas CONTINUAM vindo: são elas que as outras quatro listas
    // mostram, e perdê-las aqui seria trocar um defeito por outro.
    expect(item.pmtaMpa).toBeCloseTo(2.33);
    expect(item.pthMpa).toBeCloseTo(3.02);
  });

  it('sem adoção a adotada é null — e o calculado NÃO ocupa o lugar dela', async () => {
    estado.resposta = [linha({ pmta_mpa: '2.33', pth_mpa: '3.02' })];

    const [item] = (await listarPagina()).itens;

    expect(item.pmtaAdotadaMpa).toBeNull();
    expect(item.pthAdotadaMpa).toBeNull();
    expect(item.pmtaMpa).toBeCloseTo(2.33);
  });

  it('banco ANTES desta migração não devolve as colunas — vira null, nunca NaN', async () => {
    // `pmta_adotada_mpa` ausente (não `null`): é o que um servidor sem o
    // `busca_consulta.sql` novo manda. `undefined` precisa virar `null`, que a
    // tela já sabe desenhar como "—". `NaN` viraria "NaN MPa" no cartão.
    estado.resposta = [linha({ pmta_mpa: '2.33' })];

    const [item] = (await listarPagina()).itens;

    expect(item.pmtaAdotadaMpa).toBeNull();
    expect(item.pthAdotadaMpa).toBeNull();
  });

  it('adotada ilegível vira null, e não derruba o resto da linha', async () => {
    estado.resposta = [linha({ pmta_adotada_mpa: '--', pth_adotada_mpa: '', pmta_mpa: '2.33' })];

    const [item] = (await listarPagina()).itens;

    expect(item.pmtaAdotadaMpa).toBeNull();
    expect(item.pthAdotadaMpa).toBeNull();
    expect(item.pmtaMpa).toBeCloseTo(2.33);
  });
});

describe('o cartão e a linha da lista leem a ADOTADA, sem queda para a calculada', () => {
  const ARQUIVOS = ['CardCatalogo.tsx', 'EquipamentosV9.tsx'];

  it('exibem `pmtaAdotadaMpa`', () => {
    for (const arq of ARQUIVOS) {
      expect(fonte(`./${arq}`), arq).toContain('pmtaAdotadaMpa');
    }
  });

  it('nenhum dos dois cai na calculada quando a adotada falta', () => {
    // Qualquer forma de "se não tem adotada, usa a calculada". O `?.` cobre
    // `item?.pmtaMpa`; o `\s*` cobre a quebra de linha que o prettier põe.
    const QUEDA = /(pmtaAdotadaMpa|pthAdotadaMpa)\s*(\?\?|\|\|)\s*\w*\??\.?(pmtaMpa|pthMpa)/;
    for (const arq of ARQUIVOS) {
      expect(fonte(`./${arq}`), `${arq} voltou a cair na calculada`).not.toMatch(QUEDA);
    }
  });

  it('o rótulo do PTH no cartão não anuncia o fator 1,3× sobre um valor adotado', () => {
    // O multiplicador descreve a DERIVAÇÃO do cálculo. A pressão adotada não é
    // obrigada a segui-lo — e numa caldeira a regra nem é 1,3×, é 1,5×.
    expect(fonte('./CardCatalogo.tsx')).not.toContain('PTH (1,3×)');
  });
});
