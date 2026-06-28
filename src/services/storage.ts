// "Banco" do sistema = tabela key-value `app_storage` no Supabase, isolada por usuário (RLS).
// REGRA: toda gravação grava no localStorage (cache lido pelos templates HTML em iframe) E no
// Supabase. Toda leitura sai do cache local (já hidratado por lerTudo). Offline = cai no cache.
import { supabase, idUsuarioAtual, TABELA_STORAGE } from './supabase';

// Chaves de sessão/preferência que NÃO são dados de equipamento — não devem ser apagadas ao
// trocar de usuário (são re-gravadas pelo login).
const CHAVES_PRESERVADAS = new Set([
  'nr13_usuario_logado',
  'nr13_plano',
  'nr13_role',
  'nr13_sessao_id',
  'nr13_ultimo_acesso',
  'nr13_cache_owner',
  // Fila de sincronização offline: NÃO pode ser apagada pelo reconcile/limparCacheDados,
  // senão perderíamos as operações pendentes (escritas/deletes feitos offline).
  'nr13_fila_sync',
]);

// ---------------------------------------------------------------------------
// Fila de sincronização offline (nr13_fila_sync)
// ---------------------------------------------------------------------------
// Quando uma chamada ao Supabase FALHA (offline), a operação é enfileirada aqui e drenada
// depois (no próximo lerTudo, ao voltar a ficar online, ou via flushFila). Enquanto a fila
// está vazia o caminho online permanece IDÊNTICO ao anterior: nada é gravado/lido daqui.
type Op = { op: 'set'; chave: string; valor: string } | { op: 'del'; chave: string };

const CHAVE_FILA = 'nr13_fila_sync';

// Lê a fila de operações pendentes do localStorage (array JSON). Tolerante a lixo/ausência.
function lerFila(): Op[] {
  const raw = localStorage.getItem(CHAVE_FILA);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Op[]) : [];
  } catch {
    return [];
  }
}

// Persiste a fila no localStorage. Fila vazia → remove a chave (mantém o storage limpo).
function escreverFila(ops: Op[]): void {
  try {
    if (ops.length === 0) localStorage.removeItem(CHAVE_FILA);
    else localStorage.setItem(CHAVE_FILA, JSON.stringify(ops));
  } catch {
    // cota estourada ao gravar a fila: nada a fazer além de seguir (best-effort)
  }
}

// Enfileira uma operação fazendo DEDUP por chave: remove quaisquer ops anteriores da mesma
// chave e adiciona a nova ao fim — a última operação vence (um 'del' após um 'set' deixa só o
// 'del', e vice-versa).
function enfileirar(op: Op): void {
  const fila = lerFila().filter((o) => o.chave !== op.chave);
  fila.push(op);
  escreverFila(fila);
}

// Drena a fila contra o Supabase. Fila vazia → retorna IMEDIATAMENTE (custo zero no caminho
// online). Aplica as ops EM ORDEM; cada sucesso sai da fila. Se uma falhar (ainda offline),
// PARA e mantém o restante (preservando a ordem). Sem userId, retorna sem mexer na fila.
export async function flushFila(): Promise<void> {
  let fila = lerFila();
  if (fila.length === 0) return; // invariante: fila vazia ⇒ não toca em rede nem storage
  const userId = await idUsuarioAtual();
  if (!userId) return;
  while (fila.length > 0) {
    const op = fila[0];
    try {
      if (op.op === 'set') {
        const { error } = await supabase
          .from(TABELA_STORAGE)
          .upsert({ user_id: userId, chave: op.chave, valor: op.valor }, { onConflict: 'user_id,chave' });
        if (error) break; // ainda offline/erro: para e preserva o restante
      } else {
        const { error } = await supabase
          .from(TABELA_STORAGE)
          .delete()
          .eq('user_id', userId)
          .eq('chave', op.chave);
        if (error) break;
      }
    } catch {
      break; // exceção de rede: para e preserva o restante
    }
    // sucesso desta op: remove da frente e persiste o que sobrou
    fila = fila.slice(1);
    escreverFila(fila);
  }
}

// Drena a fila ao reconectar (registrado UMA única vez no carregamento do módulo).
let listenerOnlineRegistrado = false;
function registrarListenerOnline(): void {
  if (listenerOnlineRegistrado) return;
  if (typeof window === 'undefined') return;
  listenerOnlineRegistrado = true;
  window.addEventListener('online', () => {
    void flushFila();
  });
}
registrarListenerOnline();

// Remove do localStorage TODAS as chaves de dados do app (prefixo nr13_), preservando as de
// sessão. Usado ao trocar de usuário e no logout — impede que dados de um usuário vazem para
// outro pelo cache local.
export function limparCacheDados(): void {
  const remover: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith('nr13_') && !CHAVES_PRESERVADAS.has(chave)) remover.push(chave);
  }
  for (const chave of remover) localStorage.removeItem(chave);
}

// Puxa todas as chaves do usuário logado e hidrata o localStorage (cache p/ os iframes).
// Chamar no login e ao abrir o app. Sem sessão, devolve vazio (mantém o que houver em cache).
const PAGINA_TAMANHO = 1000; // limite padrão de linhas por consulta do PostgREST/Supabase

export async function lerTudo(): Promise<Record<string, string>> {
  const userId = await idUsuarioAtual();
  if (!userId) return {};
  // BUG #8b — guarda de isolamento entre contas: se o cache em disco pertence a OUTRO usuário
  // (ex.: logout interrompido antes de limpar), zera ANTES de servir/hidratar para não vazar
  // dados do usuário A ao usuário B. Só limpa com CERTEZA de mismatch: owner salvo não-nulo E
  // diferente do userId atual (não-nulo, já garantido acima). Owner ausente = primeiro uso e
  // userId nulo = offline/sem sessão NÃO limpam nada. Quando owner == userId (caso comum) é no-op.
  const ownerCache = localStorage.getItem('nr13_cache_owner');
  if (ownerCache && ownerCache !== userId) {
    limparCacheDados();
  }
  // Antes de ler o servidor, drena a fila offline: assim escritas/deletes pendentes chegam ao
  // Supabase ANTES do reconcile e não são apagados (escritas) nem ressuscitados (deletes).
  await flushFila();
  // Snapshot das pendências que sobraram (caso o flush tenha parado no meio por ainda estar
  // offline): protegem o cache no reconcile abaixo.
  const fila = lerFila();
  const pendentesSet = new Set(fila.filter((o) => o.op === 'set').map((o) => o.chave));
  const pendentesDel = new Set(fila.filter((o) => o.op === 'del').map((o) => o.chave));
  try {
    // Busca TODAS as linhas paginando: o Supabase limita ~1000 linhas por consulta; sem paginar,
    // chaves além desse limite (ex.: fotos em base64) não voltariam e ficariam faltando.
    const dados: Record<string, string> = {};
    for (let inicio = 0; ; inicio += PAGINA_TAMANHO) {
      const { data, error } = await supabase
        .from(TABELA_STORAGE)
        .select('chave, valor')
        .eq('user_id', userId)
        .order('chave', { ascending: true })
        .range(inicio, inicio + PAGINA_TAMANHO - 1);
      // Erro de rede em qualquer página: aborta SEM mexer no cache (offline-safe).
      if (error) return {};
      if (!data || data.length === 0) break;
      for (const row of data as { chave: string; valor: string | null }[]) {
        if (row.valor != null) dados[row.chave] = row.valor;
      }
      if (data.length < PAGINA_TAMANHO) break;
    }

    // Hidratação completa e bem-sucedida → agora sim sincroniza o cache:
    // remove chaves de dados que NÃO pertencem a este usuário (isolamento entre contas)
    // e grava as do usuário atual. Só zera DEPOIS de ter os dados, nunca antes.
    const chavesValidas = new Set(Object.keys(dados));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const chave = localStorage.key(i);
      if (
        chave &&
        chave.startsWith('nr13_') &&
        !CHAVES_PRESERVADAS.has(chave) &&
        !chavesValidas.has(chave) &&
        // Proteção extra: não apaga uma escrita offline ainda pendente como 'set' na fila
        // (caso o flush acima tenha falhado parcialmente por estar offline).
        !pendentesSet.has(chave)
      ) {
        localStorage.removeItem(chave);
      }
    }
    for (const [chave, valor] of Object.entries(dados)) {
      // Tombstone: não re-hidrata uma chave que foi deletada offline e ainda está pendente como
      // 'del' na fila — senão o registro do servidor (ainda não removido) ressuscitaria a chave.
      if (pendentesDel.has(chave)) continue;
      // Guarda individual: um valor grande demais (ex.: logo/foto) que estoure a cota não pode
      // abortar a hidratação das demais chaves — senão dados como nr13_minha_empresa somem.
      try {
        localStorage.setItem(chave, valor);
      } catch {
        // cota excedida nesta chave: pula e continua hidratando o resto
      }
    }
    localStorage.setItem('nr13_cache_owner', userId);
    return dados;
  } catch {
    // offline: usa o cache local já existente
    return {};
  }
}

export async function salvar(chave: string, objeto: unknown): Promise<void> {
  const valor = JSON.stringify(objeto);
  try {
    localStorage.setItem(chave, valor); // cache imediato (iframe lê na hora)
  } catch {
    // cota local estourada: ainda assim persiste no Supabase abaixo, sem derrubar a gravação
  }
  const userId = await idUsuarioAtual();
  if (!userId) return;
  try {
    await supabase
      .from(TABELA_STORAGE)
      .upsert({ user_id: userId, chave, valor }, { onConflict: 'user_id,chave' });
  } catch {
    // offline: o upsert lançou → enfileira a escrita para não ser perdida no próximo reconcile
    enfileirar({ op: 'set', chave, valor });
  }
}

// Remove UMA chave do Supabase e do cache local.
export async function excluirChave(chave: string): Promise<void> {
  localStorage.removeItem(chave);
  const userId = await idUsuarioAtual();
  if (!userId) return;
  try {
    await supabase.from(TABELA_STORAGE).delete().eq('user_id', userId).eq('chave', chave);
  } catch {
    // offline: o delete lançou → enfileira o tombstone para o registro não ressuscitar
    enfileirar({ op: 'del', chave });
  }
}

export function ler<T = unknown>(chave: string): T | null {
  const raw = localStorage.getItem(chave);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

// Varre o cache local (já sincronizado por lerTudo) por chaves com um prefixo, ex.: "nr13_info_".
export function listarChavesComPrefixo(prefixo: string): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith(prefixo)) chaves.push(chave);
  }
  return chaves;
}

export async function excluirVaso(tag: string): Promise<void> {
  // coleta no cache local todas as chaves que terminam em "_<TAG>"
  const chavesDoVaso: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.endsWith(`_${tag}`)) chavesDoVaso.push(chave);
  }

  const userId = await idUsuarioAtual();
  if (userId && chavesDoVaso.length > 0) {
    try {
      await supabase
        .from(TABELA_STORAGE)
        .delete()
        .eq('user_id', userId)
        .in('chave', chavesDoVaso);
    } catch {
      // offline: o delete em lote lançou → enfileira um tombstone por chave do vaso
      for (const chave of chavesDoVaso) enfileirar({ op: 'del', chave });
    }
  }

  for (const chave of chavesDoVaso) localStorage.removeItem(chave);
}
