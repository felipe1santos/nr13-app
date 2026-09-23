import { supabase, escopoStorageAtual, TABELA_STORAGE } from './supabase';

/**
 * LEITURA DIRIGIDA DE UMA CHAVE — "não achei no cache" não é "não existe" (23/09/2026).
 *
 * ## O defeito
 *
 * `storageV2.gravarComFila` calculava a base da mutação como
 * `cache.obterRegistro(chave)?.versao ?? 0`. Para toda chave FORA do cache, a
 * mutação saía com `versaoBase: 0` — afirmando ao servidor que a chave não
 * existia. Medido em produção na Fase 2: pré-visualizar um prontuário gravou
 * `nr13_prontuario_atual` (v99 no servidor) e `nr13_assinantes_pront_ZZ-FASE3`
 * (excluída, v2) com base 0, e os dois viraram conflito manual.
 *
 * Não eram dois casos isolados, e sim uma classe:
 *
 * - as chaves de trabalho GLOBAIS (`nr13_*_atual`) não estão no boot leve
 *   (`essencial.ts`), então num aparelho recém-aberto elas NUNCA estão no cache;
 * - as chaves por TAG chegam por `carregarEquipamento`, que pula as linhas
 *   EXCLUÍDAS no servidor — e uma chave excluída ainda tem versão.
 *
 * As coleções já tinham a regra certa (`colecaoSync.lerColecao`); as chaves
 * singleton não. Esta é a mesma regra, na camada de storage, para as duas.
 *
 * ## O contrato
 *
 * | resposta | significa | base da mutação |
 * |---|---|---|
 * | `presente` | a linha existe (viva ou excluída) | a versão dela |
 * | `ausente` | o SERVIDOR confirmou que a chave não existe | 0 |
 * | `indisponivel` | não deu para perguntar | DESCONHECIDA — nunca 0 afirmado |
 *
 * Uma chave só. Nunca a organização inteira.
 */

export interface LinhaServidor {
  valor: string | null;
  versao: number;
  atualizadoEm: string;
  dispositivo: string | null;
  excluida: boolean;
}

export type ResultadoLeitura =
  | { estado: 'presente'; linha: LinhaServidor }
  | { estado: 'ausente' }
  | { estado: 'indisponivel' };

/**
 * Teto de espera. O supabase-js retenta GET com falha de rede (1 s, 2 s, 4 s);
 * uma escrita local não pode ficar 7 s parada esperando isso — sem resposta em
 * tempo, a base fica DESCONHECIDA e a drenagem pergunta de novo depois.
 */
export const TIMEOUT_LEITURA_MS = 4000;

export async function lerLinhaDoServidor(
  chave: string,
  timeoutMs: number = TIMEOUT_LEITURA_MS,
): Promise<ResultadoLeitura> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { estado: 'indisponivel' };
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return { estado: 'indisponivel' };

    const consulta = supabase
      .from(TABELA_STORAGE)
      .select('valor, versao, atualizado_em, dispositivo, deletado_em')
      .eq(escopo.coluna, escopo.id)
      .eq('chave', chave)
      .maybeSingle();

    const tempo = new Promise<'tempo'>((r) => setTimeout(() => r('tempo'), timeoutMs));
    const resposta = await Promise.race([consulta, tempo]);
    if (resposta === 'tempo') return { estado: 'indisponivel' };

    const { data, error } = resposta as { data: Record<string, unknown> | null; error: unknown };
    if (error) return { estado: 'indisponivel' };
    if (!data) return { estado: 'ausente' };
    return {
      estado: 'presente',
      linha: {
        valor: typeof data.valor === 'string' ? data.valor : null,
        versao: Number(data.versao ?? 0),
        atualizadoEm: String(data.atualizado_em ?? ''),
        dispositivo: data.dispositivo ? String(data.dispositivo) : null,
        excluida: !!data.deletado_em,
      },
    };
  } catch {
    return { estado: 'indisponivel' };
  }
}
