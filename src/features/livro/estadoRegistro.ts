import type { LivroEntrada } from '../relatorios/livroLacre';

/**
 * Fase 10B.2 · em que estado está um registro do Livro.
 *
 * ## Por que não basta olhar o `sha256`
 *
 * A leitura tentadora é "sem hash = rascunho". Ela está errada, e o erro é caro:
 * o livro tem entradas de ANTES do lacre (12/08/2026) e ocorrências manuais que
 * nunca foram lacradas. Chamá-las de rascunho as tiraria da contagem oficial, do
 * Portal e da folha impressa — apagaria registro de segurança de equipamento em
 * operação, que é exatamente o que um livro existe para impedir.
 *
 * Então são TRÊS estados, e o marcador é explícito:
 *
 * | estado | como se reconhece | é oficial? |
 * |---|---|---|
 * | `trancado` | `estado === 'trancado'`, ou tem `sha256` (lacrado antes deste campo existir) | sim |
 * | `rascunho` | `estado === 'rascunho'` — e mora em chave separada | **não** |
 * | `legado`   | não diz nada: registro anterior a esta fase | sim |
 *
 * `legado` é oficial de propósito: ele já estava no livro, já foi impresso, já
 * foi ao Portal. O que esta fase acrescenta é a possibilidade de um registro
 * NOVO ainda não ser oficial — e isso ele precisa DIZER.
 */
export type EstadoRegistro = 'legado' | 'rascunho' | 'trancado';

export function estadoDoRegistro(entrada: Partial<LivroEntrada> | null | undefined): EstadoRegistro {
  if (!entrada) return 'legado';
  if (entrada.estado === 'rascunho') return 'rascunho';
  if (entrada.estado === 'trancado') return 'trancado';
  // Lacrada antes de o campo existir: o hash é a prova, e ela é oficial.
  return entrada.sha256 ? 'trancado' : 'legado';
}

/** Conta como registro EMITIDO? Rascunho não; legado e trancado, sim. */
export function ehOficial(entrada: Partial<LivroEntrada> | null | undefined): boolean {
  return estadoDoRegistro(entrada) !== 'rascunho';
}

export const ROTULO_ESTADO: Record<EstadoRegistro, string> = {
  legado: 'Registro',
  rascunho: 'Rascunho',
  trancado: 'Trancado',
};

/**
 * Só os oficiais. Existe como função para que a regra tenha UM lugar: a lista, a
 * contagem, a folha impressa e o Portal precisam concordar, e concordar por
 * acaso não é concordar.
 */
export function somenteOficiais<T extends { estado?: unknown; sha256?: unknown }>(entradas: T[]): T[] {
  return entradas.filter((e) => ehOficial(e as Partial<LivroEntrada>));
}
