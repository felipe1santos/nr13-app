/**
 * Ponte de escrita entre os templates HTML (iframe) e o app.
 *
 * Os templates gravam alguns dados de dentro da folha (medição de espessura,
 * por exemplo) via `window.sbSalvar`. Antes, cada um falava direto com o REST
 * do Supabase — com `org_id` ausente, aliás, o que fazia a RLS por organização
 * recusar toda escrita direta e só sobreviver porque caía na fila.
 *
 * Agora o template DEPOSITA e o app grava, atomicamente, e só então confirma de
 * volta. `postMessage` é canal aberto: qualquer página, iframe de terceiro ou
 * extensão pode postar. Por isso toda mensagem passa por cinco checagens antes
 * de virar gravação.
 */
export interface SessaoPonte {
  /** Sorteado a cada montagem de palco e entregue ao iframe na query string. */
  nonce: string;
  /** Aba dona do palco. */
  aba: string;
  /** Organização vigente. */
  org: string;
  /** Origem esperada — a nossa própria. */
  origem: string;
  /** `contentWindow` dos iframes que ESTE componente montou. */
  janelas: Set<unknown>;
}

export type MotivoRecusa = 'origem' | 'emissor' | 'nonce' | 'aba' | 'org' | 'formato';

export interface MensagemPonte {
  tipo: 'nr13_salvar';
  id: string;
  nonce: string;
  aba: string;
  org: string;
  chave: string;
  valor: string;
}

export interface EventoParaValidar {
  origin: string;
  source: unknown;
  data: unknown;
}

export type Validacao =
  | { ok: true; msg: MensagemPonte }
  | { ok: false; motivo: MotivoRecusa }
  | { ok: false; motivo: null }; // não é mensagem nossa: ignorar em silêncio

/**
 * As cinco checagens, nesta ordem. `ev.source` não é forjável — quem preenche é
 * o navegador —, e por isso a comparação com as janelas que nós montamos é a
 * defesa mais forte da lista.
 */
export function validarMensagem(sessao: SessaoPonte, ev: EventoParaValidar): Validacao {
  if (ev.origin !== sessao.origem) return { ok: false, motivo: 'origem' };
  if (!ev.source || !sessao.janelas.has(ev.source)) return { ok: false, motivo: 'emissor' };

  const m = ev.data as Record<string, unknown> | null;
  if (!m || m.tipo !== 'nr13_salvar') return { ok: false, motivo: null };

  if (m.nonce !== sessao.nonce) return { ok: false, motivo: 'nonce' };
  if (m.aba !== sessao.aba) return { ok: false, motivo: 'aba' };
  if (m.org !== sessao.org) return { ok: false, motivo: 'org' };

  if (
    typeof m.id !== 'string' ||
    typeof m.chave !== 'string' ||
    typeof m.valor !== 'string' ||
    m.chave === ''
  ) {
    return { ok: false, motivo: 'formato' };
  }

  return { ok: true, msg: m as unknown as MensagemPonte };
}

// ---------------------------------------------------------------------------
// Fallback em localStorage
// ---------------------------------------------------------------------------
// O template grava aqui ANTES de postar: se o app morrer no meio, o dado existe
// e é drenado no próximo boot. Cada item sai individualmente, DEPOIS do commit.
export const CHAVE_PONTE = 'nr13_fila_ponte';

export interface ItemPonte {
  id: string;
  chave: string;
  valor: string;
}

export function lerPonte(): ItemPonte[] {
  try {
    const cru = localStorage.getItem(CHAVE_PONTE);
    if (!cru) return [];
    const p: unknown = JSON.parse(cru);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (i): i is ItemPonte =>
        typeof i === 'object' &&
        i !== null &&
        typeof (i as ItemPonte).chave === 'string' &&
        typeof (i as ItemPonte).valor === 'string',
    );
  } catch {
    return [];
  }
}

/** Remove UM item. Nunca a fila inteira antes de processar. */
export function removerDaPonte(id: string): void {
  try {
    const restante = lerPonte().filter((i) => i.id !== id);
    if (restante.length === 0) localStorage.removeItem(CHAVE_PONTE);
    else localStorage.setItem(CHAVE_PONTE, JSON.stringify(restante));
  } catch {
    // Não conseguir encolher a ponte é inofensivo: o item será reprocessado, e
    // a gravação é idempotente por chave.
  }
}

export function limparPonte(): void {
  localStorage.removeItem(CHAVE_PONTE);
}

/**
 * Drena o fallback item a item. Cada um sai da ponte SÓ depois de a gravação
 * confirmar — a versão anterior limpava a fila inteira antes de salvar, então
 * uma falha no primeiro item já tinha descartado todos os seguintes.
 *
 * Chamada no BOOT e ao desmontar a tela do documento; não depende de a tela
 * chegar a desmontar (a aba pode ser fechada antes).
 */
export async function drenarPonte(
  salvar: (chave: string, valor: string) => Promise<void>,
  aoFalhar?: (item: ItemPonte, erro: unknown) => void,
): Promise<{ drenados: number; falhas: number }> {
  let drenados = 0;
  let falhas = 0;

  for (const item of lerPonte()) {
    try {
      await salvar(item.chave, item.valor);
      removerDaPonte(item.id);
      drenados += 1;
    } catch (erro) {
      // Fica na ponte para a próxima tentativa. Erro reportado, nunca engolido.
      falhas += 1;
      aoFalhar?.(item, erro);
    }
  }

  return { drenados, falhas };
}

// ---------------------------------------------------------------------------
// Escuta
// ---------------------------------------------------------------------------
export interface OuvinteOpcoes {
  salvar: (chave: string, valor: string) => Promise<void>;
  aoRecusar: (motivo: MotivoRecusa, ev: EventoParaValidar) => void;
  aoFalhar?: (item: ItemPonte, erro: unknown) => void;
}

/** Liga a ponte. Devolve a função de desligar. */
export function ouvirPonte(sessao: SessaoPonte, opcoes: OuvinteOpcoes): () => void {
  const aoReceber = async (ev: MessageEvent): Promise<void> => {
    const v = validarMensagem(sessao, { origin: ev.origin, source: ev.source, data: ev.data });

    if (!v.ok) {
      // Mensagem barrada é sinal de bug ou de tentativa de injeção: some em
      // silêncio contraria a regra global do projeto.
      if (v.motivo !== null) opcoes.aoRecusar(v.motivo, ev);
      return;
    }

    try {
      await opcoes.salvar(v.msg.chave, v.msg.valor);
      removerDaPonte(v.msg.id); // só DEPOIS do commit
      (ev.source as Window | null)?.postMessage(
        { tipo: 'nr13_salvo', id: v.msg.id, nonce: sessao.nonce },
        sessao.origem, // destino explícito, nunca '*'
      );
    } catch (erro) {
      opcoes.aoFalhar?.({ id: v.msg.id, chave: v.msg.chave, valor: v.msg.valor }, erro);
    }
  };

  const ouvinte = (e: MessageEvent) => void aoReceber(e);
  window.addEventListener('message', ouvinte);
  return () => window.removeEventListener('message', ouvinte);
}
