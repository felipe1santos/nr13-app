import { supabase } from '../../services/supabase';
import type { PontoSerie } from './painelAdmin';

/**
 * Números de INFRAESTRUTURA do projeto Supabase (egress, requisições, tamanho do
 * banco, CPU/RAM) — os mesmos que o painel deles mostra.
 *
 * ─── POR QUE ISSO NÃO PODE SER LIDO DIRETO DO NAVEGADOR ─────────────────────
 *
 * Esses valores não moram no banco do projeto: moram na Management API
 * (`api.supabase.com`), que autentica por Personal Access Token da CONTA. Esse
 * token dá poder sobre todos os projetos da organização — criar, pausar,
 * apagar. Colocá-lo numa `VITE_*` o publicaria no bundle, que é arquivo
 * estático servido para qualquer visitante (é exatamente a armadilha descrita
 * no §9 do CLAUDE.md para a chave do Google Maps, e aqui o estrago seria maior).
 *
 * Por isso o token vive como SECRET da Edge Function `admin_infra`, que também
 * confere que quem chamou é `role = 'admin'`. O bundle nunca vê o token; vê só
 * o resultado agregado.
 *
 * ─── ENQUANTO A EDGE NÃO ESTIVER PUBLICADA ──────────────────────────────────
 *
 * `lerInfra()` devolve `null` e a faixa de infra do painel mostra "—" com a
 * instrução de deploy. Nada mais da tela depende dela: o resto dos números vem
 * das RPCs `admin_usage_stats()`/`admin_storage_stats()`, que leem o próprio
 * banco.
 */
export interface InfraSupabase {
  /** Egress do ciclo de faturamento, em bytes. */
  egressBytes: number | null;
  egressCotaBytes: number | null;
  /** Tamanho do banco, em bytes. */
  dbBytes: number | null;
  dbCotaBytes: number | null;
  /** Bytes no Storage (bucket), pela contagem do Supabase. */
  storageBytes: number | null;
  storageCotaBytes: number | null;
  /** Requisições no período coberto por `serieRequisicoes`. */
  requisicoes: number | null;
  /** Requisições por dia — alimenta o gráfico grande da Visão Geral. */
  serieRequisicoes: PontoSerie[] | null;
  /** Percentuais 0–100 do banco primário. */
  cpu: number | null;
  ram: number | null;
  disco: number | null;
  plano: string | null;
  regiao: string | null;
  /** Início/fim do ciclo de faturamento, ISO. */
  cicloInicio: string | null;
  cicloFim: string | null;
  /**
   * Endpoints da Management API que a Edge NÃO conseguiu ler nesta chamada.
   * A tela mostra isso em letra miúda: campo vazio com motivo é diagnóstico,
   * campo vazio sem motivo é mistério.
   */
  falhas: string[];
}

/**
 * Lê a infra. `null` = a Edge `admin_infra` não está publicada, não tem o token
 * configurado, ou recusou a chamada. Nunca lança: o painel inteiro não pode cair
 * por causa de um cartão de métrica.
 */
export async function lerInfra(): Promise<InfraSupabase | null> {
  try {
    const { data, error } = await supabase.functions.invoke('admin_infra', {
      body: { action: 'resumo' },
    });
    if (error || !data || data.erro) return null;
    return data as InfraSupabase;
  } catch {
    return null;
  }
}
