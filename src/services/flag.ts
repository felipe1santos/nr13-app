/**
 * Feature flag do armazenamento v2 (Map + IndexedDB + palco).
 *
 * Com ela desligada o app usa o caminho v1 — `localStorage` como cache e upsert
 * direto no Supabase. Só continua existindo para o rollback: desligar uma
 * organização é uma decisão explícita (`definir_v2_org(org, false)`).
 *
 * O valor é espelhado no login a partir de `org_sync.v2_ativa` (servidor), que
 * é quem manda de verdade: a RLS recusa escrita direta quando a v2 está ativa
 * para a organização. Este espelho local só decide qual caminho o bundle usa.
 *
 * PADRÃO DESDE 11/08/2026: organização SEM linha em `org_sync` é v2. Ver o
 * comentário em `sincronizarFlagDoServidor`.
 */
import { supabase, escopoStorageAtual } from './supabase';

const CHAVE = 'nr13_armazenamento_v2';

/**
 * Fase 9 · leitura de `/equipamentos` pela projeção de busca.
 *
 * DEFAULT DESLIGADA, e é o oposto da `v2_ativa` de propósito: org sem a flag
 * continua com a hidratação integral, que funciona. Errar para o lado do OFF é
 * o lado barato — o contrário custaria uma tela vazia numa org sem backfill.
 *
 * É MECANISMO DE ROLLOUT, não arquitetura permanente: remover a flag e o
 * caminho antigo é entrega da 9G.
 */
const CHAVE_BUSCA = 'nr13_busca_v9';

/**
 * MEMOIZADA de propósito: qual implementação está ativa é decisão de SESSÃO,
 * tomada no login. Reler o `localStorage` a cada chamada deixaria o caminho
 * trocar no meio da sessão se algo limpasse o storage — e a v2, que não guarda
 * dado lá, passaria a despachar para a v1, que mostraria a conta VAZIA. É
 * justamente o sumiço que este projeto conserta.
 */
let emMemoria: boolean | null = null;
let buscaEmMemoria: boolean | null = null;

export function armazenamentoV2Ativo(): boolean {
  if (emMemoria !== null) return emMemoria;
  try {
    emMemoria = localStorage.getItem(CHAVE) === '1';
  } catch {
    emMemoria = false; // sem localStorage, o caminho seguro é o antigo
  }
  return emMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirArmazenamentoV2(ativo: boolean): void {
  emMemoria = ativo;
  try {
    if (ativo) localStorage.setItem(CHAVE, '1');
    else localStorage.removeItem(CHAVE);
  } catch {
    // Falhar aqui só significa não persistir para a próxima sessão; a decisão
    // desta continua valendo em memória.
  }
}

/**
 * Memoizada pelo mesmo motivo da `armazenamentoV2Ativo`: qual caminho a tela
 * usa é decisão de SESSÃO. Trocar no meio faria a lista alternar entre duas
 * fontes com cursores diferentes, e o usuário veria itens repetirem ou sumirem
 * no meio da rolagem.
 */
export function buscaV9Ativa(): boolean {
  if (buscaEmMemoria !== null) return buscaEmMemoria;
  try {
    buscaEmMemoria = localStorage.getItem(CHAVE_BUSCA) === '1';
  } catch {
    buscaEmMemoria = false;
  }
  return buscaEmMemoria;
}

/** Gravada no login a partir do que o servidor informou para a organização. */
export function definirBuscaV9(ativa: boolean): void {
  buscaEmMemoria = ativa;
  try {
    if (ativa) localStorage.setItem(CHAVE_BUSCA, '1');
    else localStorage.removeItem(CHAVE_BUSCA);
  } catch {
    // idem `definirArmazenamentoV2`: a decisão desta sessão continua valendo.
  }
}

/** Descarta a decisão memoizada (troca de conta, e testes). */
export function zerarFlagEmMemoria(): void {
  emMemoria = null;
  buscaEmMemoria = null;
}

/**
 * Pergunta ao SERVIDOR qual implementação esta organização usa e grava a
 * resposta. É o elo que faltava: sem ele `org_sync.v2_ativa` podia estar ligada
 * no banco e o bundle continuar despachando para a v1 — foi exatamente o estado
 * da conta `cmam.caldeiras` entre 05/08 e 10/08/2026. Nesse estado a guarda
 * `trg_guardar_app_storage` recusa TODA escrita direta (`nr13_escrita_direta_
 * bloqueada`), a v1 empilha tudo em `nr13_fila_sync` e o usuário vê o sistema
 * "salvando" sem que nada chegue ao banco.
 *
 * Chamar SEMPRE antes do primeiro acesso ao armazenamento (é o que
 * `carregarPerfil` faz, logo após gravar `nr13_org_id`).
 *
 * Falha de rede NÃO troca de caminho: mantém o que já valia. Rebaixar para a v1
 * porque a consulta não respondeu levaria a tela a ler o `localStorage` vazio da
 * v2 e concluir "conta sem equipamentos" — o sumiço que este código combate.
 */
export async function sincronizarFlagDoServidor(): Promise<boolean> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return armazenamentoV2Ativo();
    const { data, error } = await supabase
      .from('org_sync')
      // As duas flags saem na MESMA consulta — nenhum round-trip novo no boot.
      .select('v2_ativa, busca_v9')
      .eq('org_id', escopo.id)
      .maybeSingle();
    // Erro pode ser offline OU banco sem a migração armazenamento_v2.sql. Nos
    // dois casos o valor conhecido continua valendo.
    if (error) return await sincronizarSemColunaBusca(escopo.id);

    // AUSÊNCIA DE LINHA = ORGANIZAÇÃO NOVA = v2 (11/08/2026).
    //
    // A coluna nasceu `default false` e a ativação de 10/08 foi um tiro único
    // sobre as 27 organizações que existiam naquele dia. Toda conta criada
    // depois — todo trial, todo cliente novo — vinha sem linha e caía na v1:
    // `localStorage` como banco, teto de 5 MB da origem inteira, e o sumiço de
    // equipamentos de volta assim que a conta crescesse.
    //
    // Consulta que RESPONDE (sem `error`) e não traz linha é organização que
    // nunca passou por `definir_v2_org` — nova. Rollback deliberado grava a
    // linha com `false` e continua sendo respeitado logo abaixo.
    //
    // Por que errar para o lado da v2 é o lado barato: `aplicar_mutacao_storage`
    // NUNCA consulta `v2_ativa` (só cobra papel, prazo e assinatura), então uma
    // org que o servidor ainda considera v1 grava normalmente pela RPC. O erro
    // inverso é o que custou uma semana no `cmam`: bundle na v1 contra servidor
    // em v2, escrita direta recusada em silêncio e a conta aparecendo vazia.
    const linha = data as { v2_ativa?: boolean; busca_v9?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);

    // A busca v9 NÃO herda a regra "sem linha = ligada". Org nova nasce com o
    // caminho antigo, que funciona sem backfill nenhum; ligar é ato explícito.
    definirBuscaV9(linha?.busca_v9 === true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

/**
 * Recuo para banco SEM a migração `busca_v9_flag.sql`.
 *
 * ESTA FUNÇÃO EXISTE POR CAUSA DE UM BUG CONHECIDO, não por precaução: se a
 * consulta combinada falhar porque a coluna `busca_v9` não existe e nós
 * desistíssemos ali, a `v2_ativa` deixaria de ser sincronizada — que é
 * exatamente o estado que custou uma semana na conta `cmam.caldeiras` (bundle
 * na v1 contra servidor em v2, escrita recusada em silêncio, conta vazia).
 *
 * Então: erro na consulta combinada não desiste — repete pedindo só a coluna
 * antiga. A busca v9 fica DESLIGADA, que é o lado barato.
 */
async function sincronizarSemColunaBusca(orgId: string): Promise<boolean> {
  definirBuscaV9(false);
  try {
    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa')
      .eq('org_id', orgId)
      .maybeSingle();
    if (error) return armazenamentoV2Ativo(); // aí sim é rede/tabela ausente
    const linha = data as { v2_ativa?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

export const CHAVE_FLAG_V2 = CHAVE;
export const CHAVE_FLAG_BUSCA_V9 = CHAVE_BUSCA;
