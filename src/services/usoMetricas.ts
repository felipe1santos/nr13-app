import { ler, salvar } from './storage';

/**
 * Contadores de uso lidos pelo Painel Admin (via admin_usage_stats no Supabase).
 * Incrementados no momento da ação (baixar PDF / imprimir) e sincronizados como
 * qualquer chave do app (nr13_uso_contadores). Best-effort: nunca bloqueia o fluxo.
 */
interface ContadoresUso {
  pdf: number;
  impressoes: number;
}

const CHAVE = 'nr13_uso_contadores';

export function registrarUso(tipo: 'pdf' | 'impressao'): void {
  try {
    const c = ler<ContadoresUso>(CHAVE) ?? { pdf: 0, impressoes: 0 };
    if (tipo === 'pdf') c.pdf = (c.pdf ?? 0) + 1;
    else c.impressoes = (c.impressoes ?? 0) + 1;
    void salvar(CHAVE, c);
  } catch {
    // métrica é best-effort
  }
}
