/**
 * Fase 9 · 9F.5/9F.6 — **A PURGA DA v1 NÃO PODE LEVAR AS FLAGS JUNTO.**
 *
 * ## O defeito, achado no gate de navegador de 03/09/2026
 *
 * `purgarCacheV1` varre o `localStorage` apagando tudo que comece com `nr13_`,
 * preservando uma lista explícita. A lista tinha DUAS flags escritas à mão — a
 * do armazenamento v2 e a da busca v9 — e as outras SETE, acrescentadas uma por
 * etapa da 9F, eram apagadas a cada boot em que a purga rodasse.
 *
 * Foi visto na tela: com `vencimentos_v9` e `relatorios_v9` ligadas no servidor
 * e a sessão funcionando pelo caminho novo, `localStorage.getItem` das duas
 * chaves devolvia `null`. Funciona porque `sincronizarFlagDoServidor` regrava
 * as flags em memória a cada boot — ou seja, o defeito só aparece quando o
 * servidor NÃO responde.
 *
 * ## Por que não é "o lado barato"
 *
 * Para as telas de lista, cair no caminho antigo é lento e correto. Para o
 * PAINEL de vencimentos, não: sem `boot_v9` e sem `vencimentos_v9`, ele calcula
 * no cache local — que sob boot leve nunca foi enchido — e escreve
 * "0 equipamentos, tudo em dia" sobre uma organização inteira. Trocar um painel
 * certo por um painel vazio é o sumiço que esta fase existe para impedir.
 *
 * ## O que este arquivo trava
 *
 * Não a lista de nomes: a CONSTRUÇÃO. `PRESERVADAS` consome `CHAVES_FLAG` de
 * `flag.ts`, então a flag da 9G nasce preservada sem ninguém lembrar. O segundo
 * teste é o que quebra se alguém voltar a escrever os nomes à mão aqui.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn() } }));

import { CHAVES_FLAG } from './flag';
import { purgarCacheV1 } from './migracaoV1';

beforeEach(() => {
  localStorage.clear();
});

describe('purgarCacheV1 × as flags de rollout', () => {
  it('NENHUMA flag é apagada pela purga', () => {
    for (const chave of CHAVES_FLAG) localStorage.setItem(chave, '1');
    // Cache v1 de verdade, que a purga TEM de levar.
    localStorage.setItem('nr13_info_VP-1', '{"descricao":"Vaso"}');
    localStorage.setItem('nr13_fotos_VP-1', '[]');

    purgarCacheV1();

    const perdidas = CHAVES_FLAG.filter((c) => localStorage.getItem(c) === null);
    expect(
      perdidas,
      'Flag apagada pela purga: num boot offline a sessão cai no caminho antigo ' +
        'mesmo com o servidor dizendo o contrário. Ver o cabeçalho deste arquivo.',
    ).toEqual([]);
  });

  it('e o cache de dados da v1 continua saindo — a purga não virou no-op', () => {
    localStorage.setItem('nr13_info_VP-1', '{"descricao":"Vaso"}');
    localStorage.setItem('nr13_fotos_VP-1', '[]');

    const removidas = purgarCacheV1();

    expect(removidas).toBe(2);
    expect(localStorage.getItem('nr13_info_VP-1')).toBeNull();
    expect(localStorage.getItem('nr13_fotos_VP-1')).toBeNull();
  });

  it('a lista de flags tem as NOVE — a 9F.5 e a 9F.6 incluídas', () => {
    // Este teste é o alarme de "nasceu flag e ninguém pôs na lista": ele falha
    // por FALTA, não por excesso, e o número sobe junto com a etapa.
    expect(new Set(CHAVES_FLAG).size).toBe(CHAVES_FLAG.length); // sem duplicata
    expect(CHAVES_FLAG).toContain('nr13_vencimentos_v9');
    expect(CHAVES_FLAG).toContain('nr13_relatorios_v9');
    expect(CHAVES_FLAG).toContain('nr13_boot_v9');
    expect(CHAVES_FLAG).toContain('nr13_livro_v9');
    expect(CHAVES_FLAG).toContain('nr13_inspecoes_v9');
    expect(CHAVES_FLAG).toContain('nr13_prontuarios_v9');
    expect(CHAVES_FLAG).toContain('nr13_calibracoes_v9');
    expect(CHAVES_FLAG).toContain('nr13_busca_v9');
    expect(CHAVES_FLAG).toContain('nr13_armazenamento_v2');
    expect(CHAVES_FLAG).toHaveLength(9);
  });
});
