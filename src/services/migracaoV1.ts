/**
 * Herança que um aparelho traz da v1 quando a organização passa para a v2.
 *
 * São duas coisas, e as duas fazem mal se ficarem onde estão:
 *
 *  1. **`nr13_fila_sync`** — as escritas que a v1 não conseguiu enviar. Não é
 *     hipótese: entre 05/08 e 10/08/2026 a organização `cmam.caldeiras` estava
 *     com `org_sync.v2_ativa` ligada no servidor enquanto o bundle ainda
 *     despachava para a v1. Nesse estado a guarda `trg_guardar_app_storage`
 *     recusa TODA escrita direta (`nr13_escrita_direta_bloqueada`), e a v1, que
 *     enfileira em vez de perder, empilhou tudo aqui. É onde estão os
 *     equipamentos cadastrados que "sumiram". A v2 usa outra fila e nunca
 *     olharia para esta.
 *
 *  2. **O cache de dados da v1** (chaves `nr13_*` no `localStorage`, até 5 MB).
 *     Na v2 o dado mora no IndexedDB e o `localStorage` é só o PALCO, com
 *     orçamento de 3.400 KB. Cache velho ocupando esse espaço faz a montagem do
 *     documento falhar por cota — o mesmo teto, agora estourando na impressão.
 *
 * As duas rotinas rodam DEPOIS de uma hidratação bem-sucedida do servidor (ver
 * `storageV2.lerTudo`), nunca antes: purgar o cache local com o IndexedDB ainda
 * vazio deixaria o aparelho sem nada para mostrar até a próxima vez que houvesse
 * rede.
 */
import { CHAVE_MANIFESTO } from './palco';
import { CHAVE_DONO, donoAtual, travaExpirada } from './palcoTrava';
import { CHAVE_PONTE } from './ponteTemplates';
import { CHAVE_FLAG_BUSCA_V9, CHAVE_FLAG_V2 } from './flag';

export const CHAVE_FILA_V1 = 'nr13_fila_sync';

export interface OpV1 {
  op: 'set' | 'del';
  chave: string;
  valor?: string;
}

/** Lê a fila da v1. Conteúdo corrompido ou ausente devolve lista vazia. */
export function lerFilaV1(): OpV1[] {
  let cru: string | null = null;
  try {
    cru = localStorage.getItem(CHAVE_FILA_V1);
  } catch {
    return [];
  }
  if (!cru) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(cru);
  } catch {
    return [];
  }
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((o: unknown): o is OpV1 => {
    if (typeof o !== 'object' || o === null) return false;
    const item = o as Record<string, unknown>;
    if (typeof item.chave !== 'string' || item.chave === '') return false;
    if (item.op === 'del') return true;
    return item.op === 'set' && typeof item.valor === 'string';
  });
}

/** Só depois de a fila ter sido adotada pela v2. */
export function descartarFilaV1(): void {
  try {
    localStorage.removeItem(CHAVE_FILA_V1);
  } catch {
    // sem localStorage não havia fila para descartar
  }
}

/**
 * Chaves `nr13_*` que NÃO são cache de dados e por isso sobrevivem à purga:
 * sessão, identidade do aparelho, palco e controle de sincronização.
 */
const PRESERVADAS = new Set([
  // sessão e perfil (regravadas no login, mas apagá-las derruba a sessão atual)
  'nr13_usuario_logado',
  'nr13_plano',
  'nr13_role',
  'nr13_uid',
  'nr13_papel',
  'nr13_org_id',
  'nr13_cliente_id',
  'nr13_sessao_id',
  'nr13_sessao_token',
  'nr13_ultimo_acesso',
  'nr13_ultimo_login',
  'nr13_acesso_expira_em',
  'nr13_cache_owner',
  'nr13_assinatura_status',
  'nr13_assinatura_ate',
  'nr13_assinatura_sucesso_pendente',
  // identidade e controle do armazenamento
  'nr13_dispositivo_id',
  CHAVE_FLAG_V2,
  // A flag da busca v9 entra aqui pelo MESMO motivo da v2, e a falta dela foi
  // achada rodando a tela no navegador: a purga varria `nr13_*` e levava a
  // flag junto. Num boot em que a purga rodasse antes de
  // `sincronizarFlagDoServidor` responder — offline, por exemplo — a sessão
  // usaria o caminho antigo mesmo com o servidor dizendo o contrário.
  //
  // O erro cai para o lado barato (a tela antiga funciona), mas é SILENCIOSO, e
  // faria o rollout parecer instável sem que ninguém achasse o motivo.
  CHAVE_FLAG_BUSCA_V9,
  CHAVE_FILA_V1,
  // palco e ponte com os templates em iframe
  CHAVE_MANIFESTO,
  CHAVE_DONO,
  CHAVE_PONTE,
  // marcador do seed de demonstração: apagá-lo faria o trial reinjetar os DEMO-*
  'nr13_demo_seed',
  'nr13_uso_contadores',
]);

/** Famílias inteiras que ficam (manifesto de pendências é por organização). */
const PREFIXOS_PRESERVADOS = ['nr13_manifesto_pendencias_'];

/**
 * Remove do `localStorage` o cache de dados herdado da v1.
 *
 * Recusa-se a agir enquanto houver um palco montado E VIVO: as chaves
 * materializadas lá são indistinguíveis de cache antigo, e apagá-las no meio da
 * montagem sairia como documento com folha em branco.
 *
 * "Vivo" é a parte que importa. Um manifesto sozinho não prova montagem em
 * andamento: aba fechada no meio do relatório deixa o manifesto para trás, e
 * nenhuma outra aba pode limpá-lo (só o dono limpa o próprio palco). Encontrado
 * assim em 10/08/2026, um manifesto órfão de OUTRA organização, com a trava
 * vencida havia dias, bloqueava a purga para sempre e ainda ocupava o
 * `localStorage`. A trava (`nr13_palco_dono`) é quem tem expiração — é ela que
 * responde se alguém ainda está montando. Vencida, o manifesto é lixo e sai
 * junto.
 *
 * Devolve quantas chaves saíram.
 */
export function purgarCacheV1(): number {
  let temManifesto = false;
  try {
    temManifesto = localStorage.getItem(CHAVE_MANIFESTO) !== null;
  } catch {
    return 0;
  }
  if (temManifesto && !travaExpirada(donoAtual())) return 0;

  const remover: string[] = [];
  // Órfão: some junto com o cache que ele estava protegendo.
  if (temManifesto) {
    remover.push(CHAVE_MANIFESTO);
    if (localStorage.getItem(CHAVE_DONO) !== null) remover.push(CHAVE_DONO);
  }
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (!chave || !chave.startsWith('nr13_')) continue;
    if (PRESERVADAS.has(chave)) continue;
    if (PREFIXOS_PRESERVADOS.some((p) => chave.startsWith(p))) continue;
    remover.push(chave);
  }
  for (const chave of remover) localStorage.removeItem(chave);
  return remover.length;
}
