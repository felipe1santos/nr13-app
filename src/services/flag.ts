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
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AS OITO FLAGS DA FASE 9 SAÍRAM DAQUI (9G.3, 03/09/2026)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Este arquivo chegou a ter NOVE flags e uma "escada de recuo" de oito degraus
 * — cada degrau existia para o intervalo entre publicar o bundle e aplicar o
 * SQL, quando o banco ainda não tinha a coluna nova. Eram mecanismo de rollout,
 * nunca arquitetura.
 *
 * O rollout terminou: `busca_v9`, `inspecoes_v9`, `prontuarios_v9`,
 * `calibracoes_v9`, `livro_v9`, `vencimentos_v9`, `relatorios_v9` e `boot_v9`
 * ficaram ligadas nas 30 organizações, o gate global passou, e os caminhos
 * legados foram removidos das telas. Sem dois caminhos, não há o que escolher.
 *
 * **`v2_ativa` FICA.** Ela não é da Fase 9: separa dois modelos de
 * ARMAZENAMENTO, e desligá-la é rollback de infraestrutura, não de tela.
 *
 * A escada de recuo saiu junto, e agora ela é uma linha só: se a consulta a
 * `org_sync` falhar — offline, ou banco sem a migração —, a decisão de sessão
 * permanece a que já estava em memória.
 */
import { supabase, escopoStorageAtual } from './supabase';

const CHAVE = 'nr13_armazenamento_v2';

/**
 * MEMOIZADA de propósito: qual implementação está ativa é decisão de SESSÃO,
 * tomada no login. Reler o `localStorage` a cada chamada deixaria o caminho
 * trocar no meio da sessão se algo limpasse o storage — e a v2, que não guarda
 * dado lá, passaria a despachar para a v1, que mostraria a conta VAZIA. É
 * justamente o sumiço que este projeto conserta.
 */
let emMemoria: boolean | null = null;

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

/** Logout: a próxima sessão relê do servidor. */
export function zerarFlagEmMemoria(): void {
  emMemoria = null;
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
 */
export async function sincronizarFlagDoServidor(): Promise<boolean> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return armazenamentoV2Ativo();

    const { data, error } = await supabase
      .from('org_sync')
      .select('v2_ativa')
      .eq('org_id', escopo.id)
      .maybeSingle();

    // ERRO PODE SER OFFLINE **OU** BANCO SEM A MIGRAÇÃO. Nos dois casos a
    // decisão de sessão permanece a que já estava em memória: rebaixar aqui
    // mostraria a conta VAZIA para quem está na v2, que é o sumiço que este
    // projeto conserta.
    if (error) return armazenamentoV2Ativo();

    // AUSÊNCIA DE LINHA = ORGANIZAÇÃO NOVA = v2 (11/08/2026).
    //
    // `v2_ativa` nasceu `default false` e a ativação de 10/08 foi um tiro único
    // sobre as 27 organizações existentes — toda conta criada depois caía na v1
    // e voltava a bater no teto de 5 MB do `localStorage`. Linha PRESENTE com
    // `false` (rollback deliberado) continua vencendo.
    //
    // Errar para o lado da v2 é o lado barato: `aplicar_mutacao_storage` nunca
    // consulta `v2_ativa`, então org que o servidor ainda considera v1 grava
    // normal pela RPC. O erro caro é o inverso — bundle v1 contra servidor v2,
    // que foi o bug do `cmam`.
    const linha = data as { v2_ativa?: boolean } | null;
    definirArmazenamentoV2(linha ? linha.v2_ativa === true : true);
    return armazenamentoV2Ativo();
  } catch {
    return armazenamentoV2Ativo();
  }
}

export const CHAVE_FLAG_V2 = CHAVE;

/**
 * As chaves de flag que a purga do cache v1 NÃO pode levar.
 *
 * ## Por que a lista existe (achado do gate da 9F.5/9F.6, 03/09/2026)
 *
 * `purgarCacheV1` varre o `localStorage` apagando tudo que comece com `nr13_`,
 * preservando uma lista explícita. Essa lista tinha DUAS flags escritas à mão e
 * as outras SETE eram apagadas a cada boot em que a purga rodasse. Num boot em
 * que ela rode antes de `sincronizarFlagDoServidor` responder — offline, ou
 * rede lenta —, a sessão usa o caminho antigo mesmo com o servidor dizendo o
 * contrário.
 *
 * Depois da 9G.3 sobrou UMA flag, e a lista continua existindo pelo mesmo
 * motivo: ela é o que impede que a próxima flag nasça fora da proteção.
 * `migracaoV1.flagsPreservadas.test.ts` quebra se isso acontecer.
 */
export const CHAVES_FLAG: readonly string[] = [CHAVE];
