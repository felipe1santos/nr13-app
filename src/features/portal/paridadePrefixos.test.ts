/**
 * A tabela de prefixos existe DUAS vezes: em `src/services/familiasChave.ts` (o app, em
 * TypeScript) e em `supabase/functions/portal_cliente/prefixos.ts` (a Edge, em Deno).
 *
 * Duplicação de tabela é fonte clássica de dessincronização, e aqui ela falha do jeito mais
 * caro possível: alguém acrescenta uma família nova em `familiasChave.ts`, esquece a Edge, e a
 * chave simplesmente **para de chegar ao Portal**. O cliente vê a folha com "-" e ninguém vê
 * erro nenhum — exatamente a classe de defeito silencioso que este projeto já pagou quatro
 * vezes (§2-ter do CLAUDE.md).
 *
 * Este teste é o mesmo remédio do `palco.varreduraTemplates.test.ts` (I-24): a conferência que
 * seria manual vira build quebrado.
 *
 * NÃO pode ser afrouxado. Se uma família nova de verdade não deve ir para o Portal, ela entra
 * na lista de exclusão explícita abaixo, com o motivo escrito.
 */
import { describe, it, expect } from 'vitest';
import { POR_TAG } from '../../services/familiasChave';
import {
  PREFIXOS_POR_TAG,
  GLOBAIS_LIBERADAS,
  FORA_DO_PORTAL,
} from '../../../supabase/functions/portal_cliente/prefixos';

describe('paridade de prefixos entre o app e a Edge do Portal', () => {
  it('todo prefixo de POR_TAG está na Edge, ou está explicitamente excluído', () => {
    const naEdge = new Set(PREFIXOS_POR_TAG);
    const excluidos = new Set(FORA_DO_PORTAL);
    const faltando = POR_TAG.filter((p) => !naEdge.has(p) && !excluidos.has(p));

    expect(
      faltando,
      `Família(s) em familiasChave.POR_TAG que a Edge do Portal não busca:\n` +
        `  ${faltando.join('\n  ')}\n\n` +
        `Ou acrescente em supabase/functions/portal_cliente/prefixos.ts (PREFIXOS_POR_TAG),\n` +
        `ou declare em FORA_DO_PORTAL com o motivo. Não deixe implícito: chave que não é\n` +
        `buscada some do Portal em silêncio.`,
    ).toEqual([]);
  });

  it('a Edge não busca prefixo que não existe em POR_TAG', () => {
    const noApp = new Set<string>(POR_TAG);
    const sobrando = PREFIXOS_POR_TAG.filter((p) => !noApp.has(p));

    expect(
      sobrando,
      `A Edge busca prefixo(s) que não existem em familiasChave.POR_TAG:\n  ${sobrando.join('\n  ')}\n` +
        `Isso é consulta desperdiçada, ou uma família que foi renomeada só de um lado.`,
    ).toEqual([]);
  });

  it('nenhum prefixo aparece nas duas listas ao mesmo tempo', () => {
    const excluidos = new Set(FORA_DO_PORTAL);
    const ambiguos = PREFIXOS_POR_TAG.filter((p) => excluidos.has(p));
    expect(ambiguos, 'prefixo listado como buscado E como fora do Portal').toEqual([]);
  });

  it('as globais liberadas são exatamente as duas previstas, e nenhuma a mais', () => {
    // Cada global liberada é uma decisão de segurança: o cliente passa a ver um dado que NÃO
    // é do ativo dele. Hoje são os dados da executante, que ele legitimamente vê impressos no
    // documento. Acrescentar aqui exige análise — por isso o teste é de igualdade exata.
    expect([...GLOBAIS_LIBERADAS].sort()).toEqual(['nr13_lista_phs', 'nr13_minha_empresa']);
  });

  it('as chaves que o cliente recebe hoje continuam cobertas', () => {
    // As 15 chaves medidas em produção em 20/08/2026 para `ipiranga@gmail.com`.
    // É a prova de PARIDADE DE RESULTADO contra dado real, não contra teoria.
    const TAG = 'COMPRESSOR V8-15/200L';
    const reaisPorTag = [
      'nr13_assinantes_rel_',
      'nr13_docs_',
      'nr13_emp_',
      'nr13_historico_indice_',
      'nr13_info_',
      'nr13_livro_',
      'nr13_med_esp_',
      'nr13_med_grid_',
      'nr13_prontuario_',
      'nr13_prontuario_meta_',
    ];
    const buscadas = new Set(PREFIXOS_POR_TAG.map((p) => `${p}${TAG}`));
    const perdidas = reaisPorTag.map((p) => `${p}${TAG}`).filter((k) => !buscadas.has(k));

    expect(perdidas, `chaves que o cliente RECEBE hoje e deixariam de ser buscadas`).toEqual([]);
  });
});
