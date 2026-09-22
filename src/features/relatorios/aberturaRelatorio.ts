import { semearEquipamentoDetalhado } from '../../services/storage';
import { carregarRelatorio, chaveRelatorio } from './historicoRelatorios';
import { chaveOverrides } from './overridesRelatorio';
import type { RelatorioSalvo } from './tipos';

/**
 * ABRIR UM RELATÓRIO NÃO PODE DEPENDER DO CACHE (22/09/2026).
 *
 * ## O defeito, medido em produção
 *
 * `visualizar()` fazia `carregarRelatorio(id, tag)` e, com `null`, devolvia
 * `false` — e a tela voltava para a lista **em silêncio**, sem erro no console.
 * Clicar em "Continuar editando" piscava a URL do editor e caía de volta.
 *
 * `carregarRelatorio` lê SÓ o cache local (`ler`, síncrono). Ele nunca pergunta
 * ao servidor. Enquanto o boot hidratava a organização inteira isso não
 * aparecia; desde o boot leve (9D/9G.3) o cache tem uma parte, e a LISTA vem da
 * projeção do servidor — ou seja, a tela oferece para abrir documentos que o
 * aparelho não tem.
 *
 * ## Por que só o RASCUNHO cai nisso
 *
 * `carregarEquipamento(tag)` semeia os registros de relatório pelos ids do
 * ÍNDICE (`nr13_historico_indice_<TAG>`). E rascunho **não entra no índice** —
 * é a regra da 10B.1, que é o que impede um documento em edição de produzir
 * vencimento, Portal e contagem. Consequência não prevista: o registro do
 * rascunho **não é semeado por ninguém**. Num aparelho (ou aba) onde ele não
 * foi gravado, ele simplesmente não existe para a tela.
 *
 * Medido na conta de teste: 5 rascunhos no servidor, 3 no cache — e eram
 * exatamente os 3 que abriam. Os 2 de fora eram os 2 que voltavam para a lista.
 * Relatório FINALIZADO não sofre: está no índice, e é semeado.
 *
 * ## A regra
 *
 * A mesma da ficha (§3-ter do CLAUDE.md): **cache vazio não é motivo para
 * fechar uma tela**. Primeiro o cache (atalho, e o caminho OFFLINE); não
 * achando, pergunta-se ao servidor; e o resultado é um estado DESENHADO, nunca
 * um retorno mudo.
 *
 * `ausente` e `indisponivel` são separados de propósito: "não existe" e "não deu
 * para perguntar" levam a ações diferentes de quem está na frente da tela, e
 * dizer "não encontrado" a quem está sem rede afirma uma exclusão que ninguém
 * fez.
 *
 * Nada é reescrito: semear é LEITURA — traz a chave do servidor para o cache do
 * aparelho, pelo mesmo caminho que a ficha e as calibrações já usam.
 */
export type EstadoAbertura = 'encontrado' | 'ausente' | 'indisponivel';

export interface AberturaRelatorio {
  estado: EstadoAbertura;
  relatorio: RelatorioSalvo | null;
}

/**
 * As chaves que a abertura precisa ter no cache.
 *
 * O REGISTRO e os OVERRIDES do documento. Os overrides vão junto porque são
 * lidos logo em seguida (`carregarOverrides`) pelo mesmo caminho síncrono: sem
 * eles o documento abriria com o texto automático no lugar do que o engenheiro
 * escreveu — pior do que não abrir, porque não avisa.
 */
export function chavesDaAbertura(id: string, tag: string): string[] {
  return [chaveRelatorio(id, tag), chaveOverrides(id, tag)];
}

/**
 * O relatório para abrir: do cache, ou do servidor sob demanda.
 *
 * Não lança. Rede ruim vira `indisponivel`, que a tela sabe dizer.
 */
export async function abrirRelatorio(id: string, tag: string): Promise<AberturaRelatorio> {
  if (!id || !tag) return { estado: 'ausente', relatorio: null };

  // 1 · o cache. É o atalho e é o caminho offline.
  const doCache = carregarRelatorio(id, tag);
  if (doCache) return { estado: 'encontrado', relatorio: doCache };

  // 2 · o servidor, só as chaves DESTE documento (sob RLS, como todo o resto).
  let falhou: boolean;
  try {
    falhou = (await semearEquipamentoDetalhado(chavesDaAbertura(id, tag))).falhou;
  } catch {
    // Semear é o melhor esforço: a resposta de verdade é a releitura abaixo.
    falhou = true;
  }

  const depois = carregarRelatorio(id, tag);
  if (depois) return { estado: 'encontrado', relatorio: depois };

  // `postas: 0` sozinho não distingue "não existe" de "não deu para perguntar".
  return { estado: falhou ? 'indisponivel' : 'ausente', relatorio: null };
}

/** A frase que a tela mostra quando o documento não pôde ser aberto. */
export function avisoDaAbertura(estado: EstadoAbertura): string {
  if (estado === 'indisponivel') {
    return 'Não foi possível buscar este relatório agora. Verifique a conexão e tente de novo.';
  }
  return 'Este relatório não foi encontrado. Ele pode ter sido excluído em outro aparelho.';
}
