/**
 * Cota e durabilidade do armazenamento do aparelho.
 *
 * O IndexedDB não é ilimitado nem imune à limpeza do navegador. Este módulo
 * MEDE, CLASSIFICA e INFORMA — e só isso. Ele nunca apaga banco, foto, fila,
 * conflito ou dado antigo por conta própria: qualquer liberação de espaço é
 * ação explícita do usuário, com proteção contra apagar pendência.
 *
 * A persistência é TENTATIVA, não garantia. Mesmo concedida, o navegador pode
 * remover o armazenamento em situações extremas — a UI não deve prometer o
 * contrário.
 */
import { classificar, type ErroSync } from './errosSync';

export const LIMIAR_AVISO = 0.8;
export const LIMIAR_CRITICO = 0.95;

export type EstadoQuota = 'normal' | 'aviso' | 'critico' | 'desconhecido';
export type EstadoPersistencia = 'concedida' | 'recusada' | 'indisponivel' | 'desconhecida';
export type TipoOperacao = 'leve' | 'pesada' | 'sincronizacao' | 'liberacao';

/** Por que a medição foi feita. Serve para diagnóstico e para evitar medir à toa. */
export type MotivoMedicao =
  | 'boot'
  | 'antes_gravacao_pesada'
  | 'apos_quota_excedida'
  | 'apos_liberacao';

export interface MedidaQuota {
  estado: EstadoQuota;
  usage: number | null;
  quota: number | null;
  /** 0..1, ou null quando não é calculável. */
  percentual: number | null;
  persistencia: EstadoPersistencia;
  podeGravarPesado: boolean;
  motivo: ErroSync | null;
  motivoDaMedicao: MotivoMedicao | null;
}

// ---------------------------------------------------------------------------
// Detecção de suporte — cada peça separadamente
// ---------------------------------------------------------------------------
interface ApiStorage {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

function api(): ApiStorage | null {
  const nav = globalThis.navigator as (Navigator & { storage?: ApiStorage }) | undefined;
  if (!nav || typeof nav !== 'object') return null;
  const s = nav.storage;
  return s && typeof s === 'object' ? s : null;
}

export function temEstimate(): boolean {
  return typeof api()?.estimate === 'function';
}
export function temPersist(): boolean {
  return typeof api()?.persist === 'function';
}
export function temPersisted(): boolean {
  return typeof api()?.persisted === 'function';
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------
const finitoNaoNegativo = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * Classifica o uso. Valor ausente, quota zero, uso maior que a quota, negativo
 * ou não-finito devolvem 'desconhecido' — nunca 'normal'. Fingir que há espaço
 * é pior que admitir que não dá para saber.
 */
export function classificarUso(
  usage: number | null | undefined,
  quota: number | null | undefined,
): Pick<MedidaQuota, 'estado' | 'usage' | 'quota' | 'percentual'> {
  if (!finitoNaoNegativo(usage) || !finitoNaoNegativo(quota) || quota === 0 || usage > quota) {
    return {
      estado: 'desconhecido',
      usage: finitoNaoNegativo(usage) ? usage : null,
      quota: finitoNaoNegativo(quota) ? quota : null,
      percentual: null,
    };
  }

  const percentual = usage / quota;
  const estado: EstadoQuota =
    percentual >= LIMIAR_CRITICO ? 'critico' : percentual >= LIMIAR_AVISO ? 'aviso' : 'normal';

  return { estado, usage, quota, percentual };
}

/**
 * O crítico bloqueia gravação PESADA (foto, anexo). Nunca bloqueia dado
 * estrutural pequeno, fila, sincronização ou exclusão: são justamente as
 * operações que tiram o aparelho do aperto, e travá-las prenderia o usuário
 * num estado do qual ele não conseguiria sair.
 *
 * 'desconhecido' não bloqueia. Sem medida confiável, quem recusa é o próprio
 * navegador na hora da escrita — e bloquear preventivamente inutilizaria o app
 * em todo navegador sem a API.
 */
export function permiteOperacao(tipo: TipoOperacao, estado: EstadoQuota): boolean {
  if (tipo !== 'pesada') return true;
  return estado !== 'critico';
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------
let persistenciaResolvida: EstadoPersistencia | null = null;
let pedidoEmVoo: Promise<EstadoPersistencia> | null = null;

export function zerarEstadoPersistencia(): void {
  persistenciaResolvida = null;
  pedidoEmVoo = null;
}

/**
 * Estado atual da persistência. Sem resposta ainda, distingue "não perguntei"
 * de "não dá para perguntar": API ausente é `indisponivel`, não `desconhecida`.
 */
export function persistenciaConhecida(): EstadoPersistencia {
  if (persistenciaResolvida) return persistenciaResolvida;
  return temPersist() ? 'desconhecida' : 'indisponivel';
}

/**
 * Pede persistência UMA vez por sessão. Consulta `persisted()` antes: se já foi
 * concedida, não há o que pedir. Recusa é registrada e não bloqueia nada.
 */
export async function garantirPersistencia(): Promise<EstadoPersistencia> {
  if (persistenciaResolvida) return persistenciaResolvida;
  if (pedidoEmVoo) return pedidoEmVoo;

  const s = api();
  if (!s || typeof s.persist !== 'function') {
    persistenciaResolvida = 'indisponivel';
    return persistenciaResolvida;
  }

  // Capturadas ANTES da closure: o estreitamento do `typeof s.persist` acima
  // não sobrevive ao corpo assíncrono. `.call(s)` preserva o `this` do
  // StorageManager real, que a implementação do navegador exige.
  const persist = s.persist;
  const persisted = s.persisted;

  pedidoEmVoo = (async (): Promise<EstadoPersistencia> => {
    try {
      if (typeof persisted === 'function' && (await persisted.call(s))) return 'concedida';
      return (await persist.call(s)) ? 'concedida' : 'recusada';
    } catch {
      // Navegador recusou de forma atípica: não sabemos o estado, e insistir
      // não ajudaria. O app segue — a proteção real é a fila.
      return 'desconhecida';
    }
  })();

  persistenciaResolvida = await pedidoEmVoo;
  pedidoEmVoo = null;
  return persistenciaResolvida;
}

// ---------------------------------------------------------------------------
// Medição
// ---------------------------------------------------------------------------
let ultima: MedidaQuota | null = null;

export function ultimaMedida(): MedidaQuota | null {
  return ultima;
}

/** Descarta a medição em cache (troca de conta, e testes). */
export function zerarMedidas(): void {
  ultima = null;
}

function medidaDesconhecida(
  motivoDaMedicao: MotivoMedicao,
  motivo: ErroSync | null,
): MedidaQuota {
  return {
    estado: 'desconhecido',
    usage: null,
    quota: null,
    percentual: null,
    persistencia: persistenciaConhecida(),
    podeGravarPesado: permiteOperacao('pesada', 'desconhecido'),
    motivo,
    motivoDaMedicao,
  };
}

/**
 * Mede a cota. Chamar nos momentos que importam — boot (após a hidratação),
 * antes de gravação pesada, depois de um QuotaExceededError e depois de uma
 * liberação de espaço — e não a cada tecla ou autosave leve.
 */
export async function medir(motivoDaMedicao: MotivoMedicao): Promise<MedidaQuota> {
  const s = api();
  if (!s || typeof s.estimate !== 'function') {
    ultima = medidaDesconhecida(motivoDaMedicao, null);
    return ultima;
  }

  let bruto: { usage?: number; quota?: number };
  try {
    bruto = (await s.estimate()) ?? {};
  } catch (erro) {
    // Falha da API não vira "tem espaço": vira desconhecido COM motivo técnico.
    ultima = medidaDesconhecida(
      motivoDaMedicao,
      classificar(erro, {
        chave: 'navigator.storage.estimate',
        mutationId: '—',
        dispositivo: '—',
        quando: new Date().toISOString(),
      }),
    );
    return ultima;
  }

  const base = classificarUso(bruto.usage, bruto.quota);
  ultima = {
    ...base,
    persistencia: persistenciaConhecida(),
    podeGravarPesado: permiteOperacao('pesada', base.estado),
    motivo: null,
    motivoDaMedicao,
  };
  return ultima;
}
