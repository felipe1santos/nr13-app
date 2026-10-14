/**
 * GUARDA DE CUSTO — porta única de toda chamada a API PAGA POR USO feita pelo navegador.
 * Regra nº 1 (docs/REGRAS-DE-CUSTO.md): nenhuma chamada paga fora daqui; nunca em loop.
 *
 * O que a guarda garante, por serviço:
 *  - cache da sessão por chave (a mesma pergunta não é paga duas vezes);
 *  - deduplicação de chamadas IGUAIS em andamento (Enter segurado, duplo clique, dois efeitos);
 *  - uma chamada DIFERENTE por vez, com intervalo mínimo entre requisições reais;
 *  - teto por sessão da página E teto diário por aparelho (localStorage, por serviço);
 *  - registro de uso (serviço, chamadas, custo estimado em US$) para o painel/diagnóstico.
 *
 * O teto diário aqui é por APARELHO — o teto rígido da conta é a COTA no Google Cloud
 * (docs/REGRAS-DE-CUSTO.md, parte manual). As duas camadas existem de propósito: a do
 * código corta o loop na origem; a do provedor corta o que o código não alcança.
 */

export interface PoliticaServico {
  /** Custo estimado por chamada, em US$ (preço de tabela do provedor). */
  custoUsd: number;
  intervaloMinMs: number;
  tetoSessao: number;
  tetoDiario: number;
}

export const POLITICAS = {
  google_places_text_search: { custoUsd: 0.04, intervaloMinMs: 1500, tetoSessao: 40, tetoDiario: 150 },
} as const satisfies Record<string, PoliticaServico>;

export type ServicoPago = keyof typeof POLITICAS;

export class LimiteDeCustoError extends Error {}

interface EstadoServico {
  cache: Map<string, unknown>;
  emAndamento: Map<string, Promise<unknown>>;
  ultima: number;
  naSessao: number;
}

const estados = new Map<ServicoPago, EstadoServico>();

function estado(s: ServicoPago): EstadoServico {
  let e = estados.get(s);
  if (!e) {
    e = { cache: new Map(), emAndamento: new Map(), ultima: 0, naSessao: 0 };
    estados.set(s, e);
  }
  return e;
}

const CHAVE_USO = 'nr13_uso_apis_pagas';

interface UsoDia {
  dia: string;
  porServico: Record<string, { chamadas: number; custoUsd: number }>;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Uso do dia neste aparelho. Sem localStorage (aba privada etc.) devolve vazio. */
export function lerUsoDoDia(): UsoDia {
  try {
    const u = JSON.parse(localStorage.getItem(CHAVE_USO) || 'null') as UsoDia | null;
    if (u && u.dia === hoje()) return u;
  } catch {
    /* sem storage: o teto de sessão continua valendo */
  }
  return { dia: hoje(), porServico: {} };
}

function registrarUso(s: ServicoPago): void {
  const u = lerUsoDoDia();
  const atual = u.porServico[s] ?? { chamadas: 0, custoUsd: 0 };
  atual.chamadas += 1;
  atual.custoUsd = Math.round((atual.custoUsd + POLITICAS[s].custoUsd) * 10000) / 10000;
  u.porServico[s] = atual;
  try {
    localStorage.setItem(CHAVE_USO, JSON.stringify(u));
  } catch {
    /* idem */
  }
}

/**
 * Executa `executar` sob a política do serviço. `chave` identifica a pergunta (mesma chave
 * = mesma resposta). Só respostas bem-sucedidas entram no cache — erro não é cacheado.
 */
export async function chamarPago<T>(servico: ServicoPago, chave: string, executar: () => Promise<T>): Promise<T> {
  const pol = POLITICAS[servico];
  const e = estado(servico);
  if (e.cache.has(chave)) return e.cache.get(chave) as T;
  const pendente = e.emAndamento.get(chave);
  if (pendente) return pendente as Promise<T>;
  if (e.emAndamento.size > 0) throw new LimiteDeCustoError('Aguarde a busca anterior terminar.');
  if (e.naSessao >= pol.tetoSessao) {
    throw new LimiteDeCustoError('Limite de buscas desta sessão atingido. Recarregue a página para buscar novamente.');
  }
  if ((lerUsoDoDia().porServico[servico]?.chamadas ?? 0) >= pol.tetoDiario) {
    throw new LimiteDeCustoError('Limite diário de buscas deste aparelho atingido. Tente novamente amanhã.');
  }
  const agora = Date.now();
  if (agora - e.ultima < pol.intervaloMinMs) throw new LimiteDeCustoError('Aguarde um instante antes de buscar de novo.');
  e.ultima = agora;
  e.naSessao++;
  registrarUso(servico);
  const promessa = executar().then((r) => {
    e.cache.set(chave, r);
    return r;
  });
  e.emAndamento.set(chave, promessa);
  try {
    return await promessa;
  } finally {
    e.emAndamento.delete(chave);
  }
}

/** Só para testes. */
export function __reiniciarGuarda(): void {
  estados.clear();
  try {
    localStorage.removeItem(CHAVE_USO);
  } catch {
    /* idem */
  }
}
