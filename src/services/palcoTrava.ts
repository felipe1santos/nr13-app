/**
 * Posse exclusiva do palco.
 *
 * O `localStorage` é compartilhado por TODAS as abas da origem, e os templates
 * em iframe leem chaves de nome fixo (`nr13_info_<TAG>` etc.). Duas abas
 * montando relatórios diferentes ao mesmo tempo produziriam um documento
 * misturado — folha de um equipamento com dado de outro, impressa sem ninguém
 * perceber. Por isso a montagem tem dono, e só um por vez.
 *
 * Web Locks é o mecanismo primário. Onde não existe, o registro em
 * `localStorage` com EXPIRAÇÃO faz o papel, e um `BroadcastChannel` pergunta
 * antes de tomar posse: uma aba viva que ainda segura o palco responde e a
 * tomada é recusada. A expiração cobre o caso oposto — aba que morreu sem
 * liberar não pode travar o app para sempre.
 */
export interface ContextoMontagem {
  orgId: string;
  tabId: string;
  relatorioId: string;
  tag: string;
  nonce: string;
}

export interface DonoRegistrado extends ContextoMontagem {
  expiraEm: number;
}

export type ResultadoTrava =
  | { obtida: true; ctx: ContextoMontagem }
  | { obtida: false; motivo: 'ocupado'; dono: DonoRegistrado | null };

export const CHAVE_DONO = 'nr13_palco_dono';
/** Tempo que o registro vale sem renovação. Aba que morreu libera sozinha. */
export const TTL_TRAVA_MS = 60_000;
const NOME_LOCK = 'nr13_palco';
const CANAL = 'nr13_palco_posse';

/** Injetável para teste de expiração. */
let agora: () => number = () => Date.now();
export function definirRelogio(fn: () => number): void {
  agora = fn;
}
export function restaurarRelogio(): void {
  agora = () => Date.now();
}

interface ApiLocks {
  request: (
    nome: string,
    opcoes: { ifAvailable?: boolean },
    fn: (lock: unknown) => unknown,
  ) => Promise<unknown>;
}

function locks(): ApiLocks | null {
  const nav = globalThis.navigator as (Navigator & { locks?: ApiLocks }) | undefined;
  const l = nav?.locks;
  return l && typeof l.request === 'function' ? l : null;
}

export function temWebLocks(): boolean {
  return locks() !== null;
}

export function donoAtual(): DonoRegistrado | null {
  try {
    const cru = localStorage.getItem(CHAVE_DONO);
    if (!cru) return null;
    const d = JSON.parse(cru) as DonoRegistrado;
    return typeof d?.tabId === 'string' && typeof d?.expiraEm === 'number' ? d : null;
  } catch {
    // Registro corrompido não pode travar o app para sempre: tratado como
    // ausente, e a tomada de posse o sobrescreve.
    return null;
  }
}

export function travaExpirada(d: DonoRegistrado | null): boolean {
  return d === null || d.expiraEm <= agora();
}

/**
 * Mesma aba, mesma organização: remontar é legítimo.
 *
 * O `relatorioId` NÃO entra na comparação, e isso é o conserto de um bug real:
 * ele carrega um contador de versão (`pront-<TAG>-<versao>`, `rel-<TAG>-<versao>`)
 * que sobe a cada troca de assinante, salvamento ou abertura de documento já
 * salvo. Quando a versão subia logo depois da tag mudar, a montagem nova pedia
 * a trava antes de a limpeza da anterior terminar de soltá-la — e, com o
 * `relatorioId` diferente, a aba se recusava a si mesma com "Este relatório já
 * está aberto em outra aba". Medido em produção: abrir o prontuário salvo de um
 * equipamento não montava nenhuma folha.
 *
 * Ampliar para "mesma aba" não enfraquece a garantia: uma aba mostra uma rota
 * por vez, então nunca há dois documentos sendo montados nela. O que a trava
 * existe para impedir — DUAS ABAS escrevendo no mesmo `localStorage` e
 * produzindo um documento misturado — continua impedido.
 */
function mesmaMontagem(d: DonoRegistrado, ctx: ContextoMontagem): boolean {
  return d.tabId === ctx.tabId && d.orgId === ctx.orgId;
}

// Um objetor por aba: responde ao broadcast enquanto esta aba for a dona.
let canal: BroadcastChannel | null = null;
let posseAtual: ContextoMontagem | null = null;

function ouvirPerguntas(): void {
  if (canal || typeof BroadcastChannel === 'undefined') return;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = (e: MessageEvent) => {
    const m = e.data as { tipo?: string; tabId?: string };
    if (m?.tipo !== 'pergunta' || !posseAtual) return;
    if (m.tabId === posseAtual.tabId) return; // a própria aba
    canal?.postMessage({ tipo: 'ocupado', dono: posseAtual });
  };
}

/**
 * Pergunta às outras abas se alguma ainda segura o palco. Silêncio dentro da
 * janela significa que ninguém vivo reivindica — é o complemento da expiração,
 * que sozinha aceitaria roubar de uma aba viva com relógio adiantado.
 */
async function alguemReivindica(ctx: ContextoMontagem, esperaMs: number): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined' || esperaMs <= 0) return false;
  const perguntador = new BroadcastChannel(CANAL);
  try {
    return await new Promise<boolean>((resolve) => {
      const fim = setTimeout(() => resolve(false), esperaMs);
      perguntador.onmessage = (e: MessageEvent) => {
        const m = e.data as { tipo?: string; dono?: DonoRegistrado };
        if (m?.tipo === 'ocupado' && m.dono && m.dono.tabId !== ctx.tabId) {
          clearTimeout(fim);
          resolve(true);
        }
      };
      perguntador.postMessage({ tipo: 'pergunta', tabId: ctx.tabId });
    });
  } finally {
    perguntador.close();
  }
}

/**
 * Roda `fn` com exclusão mútua entre abas.
 *
 * O Web Lock é usado como seção crítica MOMENTÂNEA em volta do
 * ler-decidir-gravar do registro de posse — e não segurado durante toda a
 * sessão do relatório. Segurá-lo por toda a sessão faria uma aba travada
 * prender o palco para sempre, sem a expiração poder socorrer, e impediria a
 * própria aba de remontar. Quem representa a posse é o REGISTRO, que tem TTL.
 */
async function comExclusao<T>(fn: () => Promise<T>): Promise<T> {
  const api = locks();
  if (!api) return fn(); // sem Web Locks: registro + broadcast fazem o papel

  let saida: T;
  await api.request(NOME_LOCK, {}, async () => {
    saida = await fn();
  });
  return saida!;
}

export async function adquirirTrava(
  ctx: ContextoMontagem,
  opcoes: { esperaMs?: number } = {},
): Promise<ResultadoTrava> {
  const espera = opcoes.esperaMs ?? 120;

  return comExclusao(async (): Promise<ResultadoTrava> => {
    const dono = donoAtual();

    // Registro vivo de OUTRA montagem: recusa direto, sem tocar em nada.
    if (dono && !travaExpirada(dono) && !mesmaMontagem(dono, ctx)) {
      return { obtida: false, motivo: 'ocupado', dono };
    }

    // Registro expirado ou ausente: confirma por broadcast antes de tomar
    // posse. A expiração sozinha aceitaria roubar de uma aba viva cujo relógio
    // andou; o silêncio no canal é o que prova que ninguém a segura.
    if (!dono || travaExpirada(dono)) {
      if (await alguemReivindica(ctx, espera)) {
        return { obtida: false, motivo: 'ocupado', dono: donoAtual() };
      }
    }

    const registro: DonoRegistrado = { ...ctx, expiraEm: agora() + TTL_TRAVA_MS };
    // Sem registro de dono não há montagem segura: o erro sobe para quem chama
    // traduzir, em vez de seguir com um palco sem responsável.
    localStorage.setItem(CHAVE_DONO, JSON.stringify(registro));

    posseAtual = ctx;
    ouvirPerguntas();
    return { obtida: true, ctx };
  });
}

/** Renova o prazo. O visualizador chama enquanto o relatório segue aberto. */
export function renovarTrava(ctx: ContextoMontagem): boolean {
  const dono = donoAtual();
  if (!dono || !mesmaMontagem(dono, ctx) || dono.nonce !== ctx.nonce) return false;
  try {
    localStorage.setItem(CHAVE_DONO, JSON.stringify({ ...dono, expiraEm: agora() + TTL_TRAVA_MS }));
    return true;
  } catch {
    return false;
  }
}

/** Só o dono exato libera — nonce inclusive. */
export function ehDono(ctx: ContextoMontagem): boolean {
  const d = donoAtual();
  return (
    d !== null &&
    d.tabId === ctx.tabId &&
    d.orgId === ctx.orgId &&
    d.relatorioId === ctx.relatorioId &&
    d.tag === ctx.tag &&
    d.nonce === ctx.nonce
  );
}

export function liberarTrava(ctx: ContextoMontagem): boolean {
  if (!ehDono(ctx)) return false;
  localStorage.removeItem(CHAVE_DONO);
  posseAtual = null;
  return true;
}

/** Só para teste: derruba o estado em memória desta "aba". */
export function zerarPosseEmMemoria(): void {
  posseAtual = null;
  canal?.close();
  canal = null;
}
