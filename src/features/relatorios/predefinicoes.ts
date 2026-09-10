import { ler, salvar } from '../../services/storage';

/**
 * PREDEFINIÇÕES DE RECOMENDAÇÕES (10/09/2026).
 *
 * ## O que resolve
 *
 * Medido no E2E do "RELATORIO DA IA": das 28 células que o engenheiro digita
 * depois do documento montado, 8 são as quatro recomendações e seus prazos — e
 * elas se repetem quase sem mudança de uma inspeção para a outra ("solicitar a
 * documentação faltante", "manter os instrumentos calibrados", "acompanhar o
 * pite na próxima interna"). Redigitar isso em todo relatório é trabalho que o
 * sistema pode guardar.
 *
 * Uma predefinição é um CONJUNTO com nome, guardado por organização, que o
 * usuário aplica com um clique num relatório novo.
 *
 * ## O que ela NÃO é
 *
 * Não é preenchimento automático. Aplicar é um gesto explícito, com o texto à
 * vista antes de aplicar — recomendação de segurança entra num documento
 * assinado, e nenhuma frase deve chegar lá sem alguém ter lido. É por isso que
 * o modal mostra o conteúdo inteiro e o botão se chama "Usar neste relatório".
 *
 * Também não é atalho para outros campos: escopo, parecer e observações mudam
 * a cada equipamento e cada inspeção. Só as recomendações se repetem o
 * bastante para valer um catálogo — começar por elas é o pedido do dono.
 *
 * ## Onde mora
 *
 * `nr13_predef_recomendacoes`, chave GLOBAL da organização (o mesmo escopo de
 * `nr13_lista_phs` e `nr13_minha_empresa`): a biblioteca é da empresa, não de
 * um equipamento nem de um aparelho. Sobe pela fila durável como todo o resto,
 * então aparece no computador do escritório depois de ter sido criada no
 * celular em campo.
 *
 * Nenhum template de `public/` lê esta chave — ela não vai para o palco.
 */

/** Uma linha da tabela de recomendações do documento. */
export interface ItemRecomendacao {
  texto: string;
  prazo: string;
}

export interface PredefinicaoRecomendacoes {
  id: string;
  nome: string;
  criadoEm: string;
  itens: ItemRecomendacao[];
}

export const CHAVE_PREDEF_RECOMENDACOES = 'nr13_predef_recomendacoes';

/**
 * Quantas linhas a tabela de recomendações tem no documento.
 *
 * Espelha `[1, 2, 3, 4].map(...)` de `folhas.ts`. Uma predefinição com mais
 * itens do que isso teria linhas que nunca chegariam ao papel.
 */
export const LINHAS_RECOMENDACAO = 4;

/** O id do campo daquela linha, exatamente como o gerador o registra. */
export function idRecomendacao(n: number, parte: 'texto' | 'prazo'): string {
  return `recomendacoes.${n}.${parte}`;
}

function limpar(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Saneia o que veio do storage.
 *
 * A lista é lida na abertura do documento; um registro corrompido (outro
 * aparelho, versão antiga, edição manual) não pode derrubar a barra do
 * relatório. Item sem texto sai: linha de recomendação com prazo e sem
 * recomendação não diz nada.
 */
export function sanearPredefinicoes(bruto: unknown): PredefinicaoRecomendacoes[] {
  if (!Array.isArray(bruto)) return [];
  const saida: PredefinicaoRecomendacoes[] = [];
  for (const p of bruto) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const nome = limpar(r.nome);
    const itens = (Array.isArray(r.itens) ? r.itens : [])
      .map((i) => {
        const it = (i ?? {}) as Record<string, unknown>;
        return { texto: limpar(it.texto), prazo: limpar(it.prazo) };
      })
      .filter((i) => i.texto !== '')
      .slice(0, LINHAS_RECOMENDACAO);
    if (!nome || itens.length === 0) continue;
    saida.push({
      id: limpar(r.id) || `pref-${saida.length + 1}`,
      nome,
      criadoEm: limpar(r.criadoEm),
      itens,
    });
  }
  return saida;
}

/** As predefinições da organização. Nunca lança: sem registro, lista vazia. */
export function listarPredefinicoes(): PredefinicaoRecomendacoes[] {
  try {
    return sanearPredefinicoes(ler<unknown>(CHAVE_PREDEF_RECOMENDACOES));
  } catch {
    return [];
  }
}

/**
 * Guarda uma predefinição nova, ou substitui a de mesmo NOME.
 *
 * Substituir pelo nome é deliberado: o gesto real é "salvar as recomendações
 * que eu uso sempre", e repetir o nome significa corrigir aquele conjunto, não
 * criar um segundo com o mesmo rótulo — duas linhas iguais na lista seriam
 * indistinguíveis na hora de aplicar.
 */
export function comPredefinicao(
  atuais: PredefinicaoRecomendacoes[],
  nova: PredefinicaoRecomendacoes,
): PredefinicaoRecomendacoes[] {
  const chave = nova.nome.trim().toLocaleLowerCase('pt-BR');
  const resto = atuais.filter((p) => p.nome.trim().toLocaleLowerCase('pt-BR') !== chave);
  return [nova, ...resto];
}

export function semPredefinicao(
  atuais: PredefinicaoRecomendacoes[],
  id: string,
): PredefinicaoRecomendacoes[] {
  return atuais.filter((p) => p.id !== id);
}

export async function gravarPredefinicoes(lista: PredefinicaoRecomendacoes[]): Promise<void> {
  await salvar(CHAVE_PREDEF_RECOMENDACOES, sanearPredefinicoes(lista));
}

/**
 * As recomendações que ESTE documento tem agora, prontas para virar
 * predefinição.
 *
 * `valores` é o que está no papel — o valor resolvido de cada campo, override
 * aplicado. Linha sem texto não entra: é a mesma regra da tabela do documento,
 * onde a linha vazia não existe (`linhaOpcional`).
 */
export function recomendacoesDoDocumento(valores: Record<string, string>): ItemRecomendacao[] {
  const itens: ItemRecomendacao[] = [];
  for (let n = 1; n <= LINHAS_RECOMENDACAO; n++) {
    const texto = limpar(valores[idRecomendacao(n, 'texto')]);
    if (!texto) continue;
    itens.push({ texto, prazo: limpar(valores[idRecomendacao(n, 'prazo')]) });
  }
  return itens;
}

/**
 * Aplicar = escrever cada item numa linha, DE CIMA PARA BAIXO.
 *
 * Devolve os pares `id → texto` que o chamador transforma em override. Duas
 * decisões que precisam ser explícitas:
 *
 * - **as linhas que sobram são LIMPAS**. Aplicar um conjunto de duas
 *   recomendações sobre um documento que tinha quatro deixaria as duas últimas
 *   da vez anterior no papel, misturadas com as novas — e ninguém revisa uma
 *   tabela que parece já preenchida;
 * - o PRAZO acompanha o texto, inclusive quando é vazio: um prazo antigo ao
 *   lado de uma recomendação nova é pior do que prazo em branco, que a barra
 *   "O que falta" cobra.
 */
export function aplicarPredefinicao(p: PredefinicaoRecomendacoes): Record<string, string> {
  const saida: Record<string, string> = {};
  for (let n = 1; n <= LINHAS_RECOMENDACAO; n++) {
    const item = p.itens[n - 1];
    saida[idRecomendacao(n, 'texto')] = item?.texto ?? '';
    saida[idRecomendacao(n, 'prazo')] = item?.prazo ?? '';
  }
  return saida;
}

/** Um resumo de uma linha para a lista do modal. */
export function resumoPredefinicao(p: PredefinicaoRecomendacoes): string {
  const n = p.itens.length;
  return `${n} recomendaç${n === 1 ? 'ão' : 'ões'}`;
}
