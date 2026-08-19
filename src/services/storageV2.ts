/**
 * Armazenamento v2: `Map` em memória + IndexedDB + fila transacional.
 *
 * POR QUE EXISTE: até 04/08/2026 o cache era o `localStorage`, com 5 MB para a
 * origem inteira. Medido em produção, a conta `cmam.caldeiras` precisava de
 * 5.692 KB e NENHUM dos seus 38 equipamentos entrava no cache — a hidratação,
 * ordenada por nome, estourava a cota dentro de `nr13_fotos_` e nunca chegava
 * em `nr13_info_`.
 *
 * Diferença de fundo em relação à v1: **nada é apagado localmente por não ter
 * voltado do servidor**. A única causa de remoção é tombstone explícito. Era o
 * apagar-por-ausência que transformava qualquer falha de rede ou de cota em
 * sumiço de dado.
 */
import { supabase, escopoStorageAtual, TABELA_STORAGE } from './supabase';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { fecharDb } from './db';
import { bloqueadoParaEscrita, ErroBloqueado } from './gateEscrita';
import { tagDaChave } from './familiasChave';
import { bloqueadoParaUso } from './sessaoArmazenamento';
import { descartarFilaV1, lerFilaV1, purgarCacheV1 } from './migracaoV1';
import * as marcaSync from './marcaSync';
import { ehCliente } from './papelSessao';
import { donoAtual, travaExpirada } from './palcoTrava';

/** Troca de conta em andamento (ou falha nela): nada entra e nada sai. */
export class ErroTrocandoConta extends Error {
  constructor() {
    super('Aguarde: o sistema está trocando de organização.');
    this.name = 'ErroTrocandoConta';
  }
}

const PAGINA = 1000;

// ---------------------------------------------------------------------------
// Leitura — SÍNCRONA, direto do Map
// ---------------------------------------------------------------------------
/**
 * Lê do `Map` já hidratado. Nunca toca no `localStorage` e nunca inicia
 * operação assíncrona: tem ~50 pontos de chamada síncronos.
 */
export function ler<T = unknown>(chave: string): T | null {
  // Durante a troca de conta o Map já foi zerado; devolver null aqui é
  // explícito sobre o motivo. Quem decide o que mostrar é a UI, por
  // `bloqueadoParaUso()` — sem isso a tela concluiria "conta vazia".
  if (bloqueadoParaUso()) return null;
  const reg = cache.obterRegistro(chave);
  if (!reg) return null;
  try {
    return JSON.parse(reg.valor) as T;
  } catch {
    return reg.valor as unknown as T;
  }
}

export function listarChavesComPrefixo(prefixo: string): string[] {
  if (bloqueadoParaUso()) return [];
  return cache.chavesComPrefixo(prefixo);
}

/** Valor bruto, sem parse. Mesma instância enquanto o registro não muda. */
export function lerCru(chave: string): string | null {
  if (bloqueadoParaUso()) return null;
  return cache.obterRegistro(chave)?.valor ?? null;
}

/** Chaves do equipamento pelo índice explícito por TAG — não varre o cache. */
export function listarChavesDaTag(tag: string): string[] {
  if (bloqueadoParaUso()) return [];
  return cache.chavesDaTag(tag);
}

// ---------------------------------------------------------------------------
// Barreira de inicialização
// ---------------------------------------------------------------------------
let iniciado = false;

/**
 * Prepara o armazenamento ANTES de qualquer tela: organização, IndexedDB, Map,
 * fila e tombstones. Só depois disso o app pode chamar `ler()` — uma tela que
 * listasse antes veria zero equipamentos e o usuário concluiria que sumiram.
 */
export async function iniciar(): Promise<boolean> {
  const escopo = await escopoStorageAtual();
  if (!escopo) return false;

  cache.definirOrg(escopo.id);
  await cache.hidratarDoDisco();
  await sync.carregarFilaDoDisco();
  await sync.carregarTombstonesDoDisco();
  await sync.carregarConflitosDoDisco();
  // Cópias de conflito que a versão anterior deixou DENTRO de `dados` (e que a
  // hidratação acabou de trazer para o Map) vão para a store própria. Depois de
  // `hidratarDoDisco` de propósito: a migração precisa do Map para saber qual é
  // a versão local de cada chave em conflito.
  await sync.migrarConflitosAntigos().catch(() => 0);
  iniciado = true;
  return true;
}

export function pronto(): boolean {
  return iniciado && cache.hidratado();
}

export function aguardarPronto(): Promise<void> {
  return cache.aguardarHidratacao();
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------
/**
 * Grava dado + item de fila na MESMA transação do IndexedDB. Só retorna depois
 * do commit — a UI só pode dizer "salvo localmente" quando esta Promise
 * resolve. Bloqueio de assinatura/papel LANÇA e não persiste nada.
 */
export async function salvar(chave: string, objeto: unknown): Promise<void> {
  if (bloqueadoParaUso()) throw new ErroTrocandoConta();
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();

  await gravarComFila(chave, JSON.stringify(objeto));
  await sync.drenar();
}

/** Dado + item de fila na mesma transação. Sem gates: quem chama já os aplicou. */
async function gravarComFila(chave: string, valor: string): Promise<void> {
  const anterior = cache.obterRegistro(chave);
  const versaoServidor = anterior?.versao ?? 0;

  const registro: cache.Registro = {
    valor,
    versao: versaoServidor + 1,
    atualizadoEm: new Date().toISOString(),
    dispositivo: sync.idDispositivo(),
  };

  const item = sync.montarItem('set', chave, valor, versaoServidor);
  const antigo = sync.itemDaChave(chave);

  await cache.gravarAtomico([{ chave, registro }], [item]);
  if (antigo && antigo.mutationId !== item.mutationId) await sync.removerDaFila(antigo.mutationId);
  sync.registrarNaMemoria(item);
}

async function excluirUma(chave: string): Promise<void> {
  const anterior = cache.obterRegistro(chave);
  const versaoServidor = anterior?.versao ?? 0;

  const item = sync.montarItem('del', chave, undefined, versaoServidor);
  const antigo = sync.itemDaChave(chave);
  const tomb = {
    chave,
    versao: versaoServidor,
    excluidoEm: new Date().toISOString(),
    dispositivo: sync.idDispositivo(),
  };

  // Dado, fila e tombstone na mesma transação: o Map só perde a chave depois
  // do commit local.
  await cache.gravarAtomico([{ chave, remover: true }], [item], [{ chave, valor: tomb }]);
  if (antigo && antigo.mutationId !== item.mutationId) await sync.removerDaFila(antigo.mutationId);
  sync.registrarNaMemoria(item);
  await sync.registrarTombstone(chave, versaoServidor);
}

export async function excluirChave(chave: string): Promise<void> {
  if (bloqueadoParaUso()) throw new ErroTrocandoConta();
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  await excluirUma(chave);
  await sync.drenar();
}

/**
 * Chaves que o SERVIDOR nunca deixa apagar, e que por isso não entram na
 * exclusão do equipamento.
 *
 * `nr13_livro_` é o Livro de Registro de Segurança: o trigger de
 * `supabase/livro_imutavel.sql` recusa remover entrada já emitida, e está certo
 * — é registro legal, não dado de trabalho. Antes desta lista, excluir um
 * equipamento enfileirava um `del` que o banco recusava, e a fila retentava
 * eternamente com "⚠ 1 falha" na topbar (medido em 14/08/2026).
 *
 * O livro some da TELA junto com o equipamento (nada mais o referencia) e
 * permanece no servidor E no cache local — de propósito. Removê-lo do cache
 * sem tombstone só o traria de volta na hidratação seguinte, e com tombstone
 * voltaríamos à exclusão recusada. Órfão invisível de ~1 KB por equipamento
 * excluído é o preço certo por um registro legal que a norma manda preservar.
 * `nr13_livro_config_` é só configuração de exibição e sai normalmente — o
 * prefixo mais longo tem que ser testado primeiro.
 */
const PROTEGIDAS_NO_SERVIDOR = ['nr13_livro_'];

export function protegidaContraExclusao(chave: string): boolean {
  if (chave.startsWith('nr13_livro_config_')) return false;
  return PROTEGIDAS_NO_SERVIDOR.some((p) => chave.startsWith(p));
}

/**
 * Exclui o equipamento inteiro usando o ÍNDICE EXPLÍCITO por TAG.
 *
 * A v1 casava chaves por sufixo `_<TAG>`, e por isso excluir a TAG "B" alcançava
 * `nr13_info_A_B` — apagava o equipamento errado.
 */
export async function excluirVaso(tag: string): Promise<void> {
  if (bloqueadoParaUso()) throw new ErroTrocandoConta();
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  for (const chave of cache.chavesDaTag(tag)) {
    if (tagDaChave(chave) !== tag) continue; // cinto e suspensório
    if (protegidaContraExclusao(chave)) continue;
    await excluirUma(chave);
  }
  await sync.drenar();
}

export async function flushFila(): Promise<void> {
  await sync.drenar();
}

/**
 * Quantas mutações ainda não chegaram ao servidor.
 *
 * Não conta as ENCERRADAS: elas continuam na fila para o usuário ver na tela de
 * Pendências, mas nenhuma sincronização futura vai movê-las, e contá-las aqui
 * deixaria o selo da topbar em alerta para sempre.
 */
export function contarPendencias(): number {
  return sync.listarPendentes().length;
}

// ---------------------------------------------------------------------------
// Drenagem automática ao reconectar
// ---------------------------------------------------------------------------
// A v1 tinha este listener; a v2 nasceu sem ele, e o resultado media-se na tela:
// com a conexão de volta, a inspeção feita offline continuava parada até o
// usuário gravar outra coisa ou navegar. Quem trabalha em campo fecha o app
// achando que subiu.
//
// `visibilitychange` entra junto porque no celular é o sinal que realmente
// acontece: o aparelho recupera a rede com a aba em segundo plano — nenhum
// evento `online` chega a esta página — e o app só volta a existir quando o
// usuário o traz para a frente.
// ---------------------------------------------------------------------------
// ...e a atualização na direção CONTRÁRIA (19/08/2026)
// ---------------------------------------------------------------------------
// Os listeners acima só SUBIAM. Descer — descobrir o que os OUTROS aparelhos
// fizeram — dependia de recarregar a página, entrar de novo, ou abrir a lista
// de equipamentos (`listarEquipamentos` chama `lerTudo`).
//
// O caso real: o usuário apaga um vaso pelo celular, em campo. O computador
// ficou aberto no escritório e segue mostrando o vaso apagado, indefinidamente.
//
// Os dois cuidados abaixo são o motivo de isto ser uma função, e não um
// `lerTudo()` solto no listener.

/** Intervalo mínimo entre duas hidratações automáticas. */
export const JANELA_ATUALIZACAO_MS = 60_000;

let ultimaAtualizacaoEm = 0;

/** Zera a janela. Igual ao `zerarThrottleSync`: existe para os testes. */
export function zerarThrottleAtualizacao(): void {
  ultimaAtualizacaoEm = 0;
}

/**
 * Sobe o que está na fila e, no máximo uma vez por janela, baixa o que mudou.
 *
 * **Throttle.** `visibilitychange` dispara a cada volta de aba. Sem janela, um
 * usuário alternando entre o sistema e a planilha geraria uma consulta por
 * distração. A drenagem NÃO é throttled: fila vazia não faz requisição
 * nenhuma, e trabalho de campo parado é o defeito mais caro.
 *
 * **Palco.** Durante a montagem de um documento, o `localStorage` está
 * materializado com as chaves daquela TAG e os iframes já leram parte delas.
 * Hidratar no meio trocaria o dado sob o documento — folha de um equipamento
 * com dado de outro, impressa sem ninguém perceber. Enquanto houver dono VIVO
 * do palco, a atualização espera; trava vencida é aba morta e não segura nada.
 */
export async function atualizarDoServidor(): Promise<void> {
  if (!iniciado) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  await sync.drenar();

  if (!travaExpirada(donoAtual())) return;

  const agora = Date.now();
  if (agora - ultimaAtualizacaoEm < JANELA_ATUALIZACAO_MS) return;
  ultimaAtualizacaoEm = agora;

  await lerTudo();
}

let listenersRegistrados = false;
function registrarSincronizacaoAutomatica(): void {
  if (listenersRegistrados || typeof window === 'undefined') return;
  listenersRegistrados = true;
  const sincronizar = () => {
    void atualizarDoServidor();
  };
  window.addEventListener('online', sincronizar);
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
  });
}
registrarSincronizacaoAutomatica();

// ---------------------------------------------------------------------------
// Hidratação
// ---------------------------------------------------------------------------
/**
 * Desligamento de emergência da hidratação incremental.
 *
 * `localStorage.nr13_hidratacao_completa = '1'` faz todo boot voltar a baixar a
 * organização inteira, como antes de 11/08/2026. Existe porque a incremental
 * foi escrita contra um prazo (a restrição de egress do Supabase em 16/08) e,
 * se ela deixar algum dado para trás em algum cenário que os testes não
 * cobriram, o conserto precisa ser uma linha no console do aparelho afetado —
 * não um deploy.
 */
export const CHAVE_HIDRATACAO_COMPLETA = 'nr13_hidratacao_completa';

function hidratacaoCompletaForcada(): boolean {
  try {
    return localStorage.getItem(CHAVE_HIDRATACAO_COMPLETA) === '1';
  } catch {
    return false;
  }
}

/**
 * Devolve SEMPRE um snapshot do Map — online ou offline.
 *
 * Sem rede, devolve o que veio do IndexedDB; a v1 devolvia `{}`, e a tela que
 * confiasse nisso mostraria a conta vazia. Com rede, traz as linhas do
 * servidor respeitando tombstones e comparando versões: linha antiga do
 * servidor não derruba edição local mais recente.
 */
export async function lerTudo(): Promise<Record<string, string>> {
  if (!iniciado && !(await iniciar())) return cache.snapshot();

  await sync.drenar();

  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return cache.snapshot();

    // ── Hidratação INCREMENTAL ──────────────────────────────────────────────
    // Com marca d'água, pede só o que mudou desde a última leitura; sem ela
    // (primeiro boot, ou cache apagado), pede tudo. A ordenação passa a ser por
    // `atualizado_em` porque é ela que define o corte — ordenar por chave e
    // filtrar por data devolveria as páginas fora da ordem do filtro.
    const marca = hidratacaoCompletaForcada() ? null : await marcaSync.lerMarca(escopo.id);
    let maiorVisto = marca ?? '';

    for (let inicio = 0; ; inicio += PAGINA) {
      let consulta = supabase
        .from(TABELA_STORAGE)
        .select('chave, valor, versao, atualizado_em, dispositivo, deletado_em')
        .eq(escopo.coluna, escopo.id);
      // `gt` e não `gte`: `gte` traria de novo, em toda abertura, a última linha
      // já conhecida — barato, mas some com o "custo zero" quando nada mudou.
      if (marca) consulta = consulta.gt('atualizado_em', marca);

      // Ordenação COMPOSTA (`atualizado_em`, `chave`): `atualizado_em` sozinho
      // não é único, e com empate a ordem entre páginas fica indefinida — duas
      // linhas do mesmo instante poderiam cair na fronteira e uma delas nunca
      // ser lida. A chave desempata e torna a paginação determinística.
      const { data, error } = await consulta
        .order('atualizado_em', { ascending: true })
        .order('chave', { ascending: true })
        .range(inicio, inicio + PAGINA - 1);

      if (error) return cache.snapshot(); // offline: fica com o que veio do disco
      if (!data || data.length === 0) break;

      for (const linha of data as Array<Record<string, unknown>>) {
        const chave = String(linha.chave);
        const atualizadoEm = String(linha.atualizado_em ?? '');
        if (atualizadoEm > maiorVisto) maiorVisto = atualizadoEm;

        // Soft-delete propaga a exclusão feita em OUTRO aparelho.
        if (linha.deletado_em) {
          if (cache.obterRegistro(chave)) await cache.gravarAtomico([{ chave, remover: true }]);
          continue;
        }
        // Tombstone local mais novo: não ressuscita.
        if (sync.tombstoneMaisNovoQue(chave, atualizadoEm)) continue;
        // Escrita local ainda pendente vence o servidor: ela é mais nova.
        if (sync.itemDaChave(chave)) continue;
        if (linha.valor == null) continue;

        await cache.aplicarRemoto(chave, {
          valor: String(linha.valor),
          versao: Number(linha.versao ?? 1),
          atualizadoEm,
          dispositivo: linha.dispositivo ? String(linha.dispositivo) : null,
        });
      }

      if (data.length < PAGINA) break;
    }

    // A marca só avança depois de TODAS as páginas terem sido aplicadas. Movê-la
    // no meio faria uma falha de rede na página 2 deixar a marca dizendo que a
    // organização inteira já foi lida — e as linhas seguintes nunca chegariam.
    if (maiorVisto && maiorVisto !== marca) await marcaSync.avancarMarca(escopo.id, maiorVisto);
  } catch {
    return cache.snapshot(); // offline
  }

  // Só aqui, com o servidor já lido: a herança da v1 precisa da versão vigente
  // de cada chave para não virar conflito, e a purga do cache antigo só é segura
  // depois de o IndexedDB ter o conteúdo.
  await adotarHerancaV1();

  // NÃO existe varredura removendo chaves locais ausentes no servidor.
  return cache.snapshot();
}

/**
 * Traz para a fila da v2 o que ficou preso na fila da v1 e limpa o cache que a
 * v1 deixou no `localStorage` (ver migracaoV1.ts).
 *
 * Uma pendência da v2 para a mesma chave VENCE a herdada: é posterior, foi feita
 * já nesta implementação. E uma op que falhe ao ser adotada não pode interromper
 * as outras — a fila da v1 é justamente o lugar onde estão os dados que ninguém
 * mais tem.
 */
async function adotarHerancaV1(): Promise<number> {
  const ops = lerFilaV1();
  let adotadas = 0;
  for (const op of ops) {
    if (sync.itemDaChave(op.chave)) continue;
    try {
      if (op.op === 'set') await gravarComFila(op.chave, op.valor as string);
      else await excluirUma(op.chave);
      adotadas++;
    } catch {
      // segue para a próxima: perder uma não pode custar as demais
    }
  }
  if (ops.length > 0) {
    descartarFilaV1();
    await sync.drenar();
  }
  purgarCacheV1();
  return adotadas;
}

/**
 * Semeia o cache com chaves que vieram de uma fonte JÁ FILTRADA pelo servidor.
 *
 * Existe para o Portal do Cliente (Fase 0-B). Desde a policy fail-closed, uma
 * conta `papel='cliente'` não lê `app_storage` direto — quem entrega os dados
 * dela é a Edge `portal_cliente`, que filtra pelos ativos vinculados àquele
 * cliente. Sem semear, o `Map` fica vazio, `ler()` devolve `null` e TODA tela do
 * Portal quebra (ela lê do `Map`, não do `localStorage`; aquele serve aos
 * templates em iframe).
 *
 * NÃO é hidratação: não consulta o servidor, não mexe em marca d'água, não
 * enfileira nada e não gera tombstone. É o oposto do `lerTudo` — recebe o que já
 * foi decidido lá fora e apenas deposita.
 *
 * Versão fixa em 1 e `aplicarRemoto` na frente: se por algum motivo já houver
 * registro local mais novo, ele vence. O Portal é somente leitura, então esse
 * caso não deveria existir; deixar `aplicarRemoto` decidir é mais barato que
 * confiar que não existe.
 */
export async function semearCache(chaves: Record<string, string>): Promise<number> {
  if (!iniciado && !(await iniciar())) return 0;
  const agora = new Date().toISOString();
  let postas = 0;
  for (const [chave, valor] of Object.entries(chaves)) {
    if (typeof valor !== 'string') continue;
    try {
      await cache.aplicarRemoto(chave, { valor, versao: 1, atualizadoEm: agora, dispositivo: null });
      postas++;
    } catch {
      // uma chave que falhe não pode custar as demais: o Portal precisa abrir
      // com o que deu para depositar
    }
  }
  return postas;
}

/**
 * Lê UMA chave direto do servidor (valor completo). Null offline/sem sessão.
 *
 * RECUSA para `papel='cliente'` (Fase 0-B): a policy fail-closed já bloqueia
 * essa consulta no servidor, e deixar a chamada sair só produz um erro de rede
 * silencioso a cada tentativa. Para o Portal o caminho é a Edge, e os registros
 * que ele precisa já vêm por ela — `portal_cliente` entrega `nr13_rastreab_`
 * completo, com o `pdfBase64`, então `resolverPdf` resolve no primeiro passo e
 * nunca chega aqui.
 */
export async function lerRemoto(chave: string): Promise<string | null> {
  if (ehCliente()) return null;
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return null;
    const { data, error } = await supabase
      .from(TABELA_STORAGE)
      .select('valor')
      .eq(escopo.coluna, escopo.id)
      .eq('chave', chave)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { valor: string | null }).valor ?? null;
  } catch {
    return null;
  }
}

/**
 * Faxina ao trocar de conta. NÃO apaga o IndexedDB: pode haver pendência lá
 * dentro, e apagá-la em silêncio destruiria inspeção feita offline. Quem decide
 * apagar é o fluxo de logout, depois de conferir a fila.
 */
export function limparCacheDados(): void {
  cache.zerarMemoria();
  sync.zerarFilaMemoria();
  sync.zerarTombstonesMemoria();
  sync.zerarConflitosMemoria();
  fecharDb();
  cache.definirOrg(null);
  iniciado = false;
}
