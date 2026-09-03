/**
 * Fase 9 · 9F.6 — o que a tela nova de `/relatorios` precisa do armazenamento.
 *
 * ## Por que existe
 *
 * `/relatorios` era a ÚLTIMA tela de lista sem flag própria. `Relatorios.tsx`
 * montava o catálogo com `listarEquipamentos()`, que começa com
 * `await lerTudo()` — hidratação COMPLETA — e depois `montarResumo(tag)` para
 * cada TAG. `montarResumo` lê CINCO chaves por equipamento: `nr13_info_`,
 * `nr13_cat_`, `nr13_calc_`, `nr13_pref_unidade_` e **`nr13_fotos_`**, que é a
 * família mais pesada do sistema (92 KB numa TAG medida). Ou seja: a lista fazia
 * parse das fotos do parque inteiro para desenhar cartões.
 *
 * Aqui a lista vem da projeção (`buscaIndex`), a foto vem do `foto_ref` que já
 * viaja na mesma linha, e o equipamento só chega ao cache quando é ESCOLHIDO.
 *
 * ## O que esta etapa NÃO toca, de propósito
 *
 * O PDF, a geração do relatório e o histórico. A flag troca a FONTE DO
 * CATÁLOGO — o seletor de equipamentos — e nada mais. Depois do clique, tudo o
 * que acontece é o código de sempre, lendo as chaves de sempre; a única
 * diferença é que elas foram semeadas sob demanda em vez de baixadas em massa.
 *
 * ## A ordem é o teste inteiro
 *
 * Semear primeiro, ler depois. Invertida, a tela abre o HISTÓRICO VAZIO de um
 * equipamento que tem relatórios — e sem erro nenhum, que é o que torna esse
 * defeito caro. Mesmo risco da 9F.2, onde inverter imprimia seis folhas com "-".
 */
import { carregarEquipamento } from '../equipamento/equipamentoService';
import { supabase } from '../../services/supabase';
import { listarIndice } from './historicoRelatorios';
import type { RelatorioIndiceItem } from './tipos';

/**
 * Traz do servidor as chaves desta TAG, para o histórico e os documentos
 * encontrarem o que ler.
 *
 * **Não lança.** Sem rede, o que já está no aparelho continua valendo — é a
 * promessa do próprio `carregarEquipamento`, e derrubar a navegação por causa da
 * rede transformaria uma tela degradada numa tela quebrada.
 */
export async function abrirEquipamentoParaRelatorio(tag: string): Promise<RelatorioIndiceItem[]> {
  try {
    await carregarEquipamento(tag);
  } catch {
    // Offline ou falha pontual: segue com o cache. A tela mostra o que tem.
  }
  // A LEITURA MORA AQUI, e não no componente, porque é a ordem que importa: a
  // suíte roda em ambiente `node` e não renderiza React, então regra que vive no
  // JSX não tem teste. Devolvendo o histórico, "semear antes de ler" vira uma
  // asserção de verdade — a mesma escolha da 9F.2.
  return listarIndice(tag);
}

/**
 * Quantos relatórios cada TAG da PÁGINA tem.
 *
 * UMA chamada para as 50 TAGs, sobre `relatorios_index` — a projeção que a 9E
 * já criou e que tem índice por `(org_id, tag)`. Não há coluna nova nem
 * reprojeção: contar aqui custa um índice que já existe.
 *
 * ## `null` não é zero
 *
 * Consulta que RESPONDE devolve o mapa; TAG ausente dele tem mesmo zero
 * relatório, e o cartão escreve "0". Consulta que FALHA devolve `null`, e o
 * cartão escreve "—". Escrever "0 Relatórios" sobre um equipamento que tem doze
 * é a mesma mentira que o painel de vencimentos aprendeu a não contar em
 * 25/08/2026, quando exibia "EQUIPAMENTOS CADASTRADOS: 0" numa conta com quatro.
 */
export async function contagensPorTag(tags: string[]): Promise<Map<string, number> | null> {
  if (tags.length === 0) return new Map();

  try {
    const { data, error } = await supabase.rpc('contar_relatorios_por_tag', { p_tags: tags });
    if (error || !data) return null;
    const mapa = new Map<string, number>();
    for (const linha of data as { tag?: string; total?: number }[]) {
      if (linha?.tag) mapa.set(String(linha.tag), Number(linha.total ?? 0));
    }
    return mapa;
  } catch {
    return null;
  }
}

/**
 * A tela legada precisa hidratar a organização inteira?
 *
 * Existe como função — e não como um `if` dentro do componente — porque é a
 * decisão que define se `lerTudo()` roda: a suíte não renderiza React (ambiente
 * `node`), então regra que mora no JSX não tem teste. Com a flag ligada, ninguém
 * hidrata: a lista vem da projeção e o equipamento chega por semeadura.
 */
export function deveHidratarListaLegada(v9Ativa: boolean): boolean {
  return !v9Ativa;
}
