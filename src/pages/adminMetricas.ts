/**
 * Contrato das métricas do Painel Admin (Fase 2, 16/08/2026).
 *
 * Os tipos daqui são o ESPELHO do `returns table` de
 * `supabase/admin_stats.sql` e `supabase/admin_storage_stats.sql`. Ficam num
 * módulo próprio, e não dentro do Admin.tsx, por dois motivos: são testáveis
 * sem montar a tela, e `adminMetricas.test.ts` compara estes nomes com os do
 * `.sql` — se um lado mudar sozinho, o teste quebra em vez de a coluna
 * silenciosamente virar `undefined` na tela.
 */

/** Uma linha de `admin_usage_stats()`. Escopo = organização (ou user_id legado). */
export interface UsoStats {
  escopo: string;
  equip_vaso: number;
  equip_caldeira: number;
  equip_autoclave: number;
  inspecoes: number;
  relatorios: number;
  pdf_gerados: number;
  impressoes: number;
  subusuarios: number;
  // ── Fase 2 ──
  /** Relatórios que existem SÓ no array legado — termômetro da migração. */
  relatorios_legado: number;
  bytes_total: number;
  /** Peso do `nr13_historico_relatorios` desta organização. */
  bytes_legado: number;
  chaves_total: number;
  /** PISO, não total: chaves com `base64,` no valor. */
  chaves_base64: number;
  bytes_base64: number;
  /**
   * `profiles.ultima_sync` do mestre. É por USUÁRIO, não por aparelho: quem usa
   * celular e desktop grava aqui o mais recente dos dois. Um aparelho parado
   * com trabalho dentro NÃO aparece — a tela precisa dizer isso.
   */
  ultima_sync: string | null;
}

/** Uma linha de `admin_storage_stats()`. Só metadados de arquivo. */
export interface StorageStats {
  escopo: string;
  arquivos: number;
  bytes: number;
  bytes_relatorios: number;
  bytes_assinaturas: number;
  bytes_certificados: number;
  bytes_fotos: number;
  pdfs: number;
  pdf_bytes_medio: number;
  fotos: number;
  foto_bytes_medio: number;
}

/**
 * Bytes em unidade legível. Base 1024 (é o que o painel do Supabase usa, e
 * discordar dele obrigaria a converter de cabeça toda vez que os dois fossem
 * comparados). Uma casa decimal até 100, nenhuma acima — "63,8 MB" é
 * informativo, "63,82 MB" é ruído.
 */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const unidades = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  const casas = v < 100 ? 1 : 0;
  return `${v.toFixed(casas).replace('.', ',')} ${unidades[i]}`;
}

/**
 * Quanto do `app_storage` da organização ainda é blob em base64.
 *
 * É esta fração que a migração das fotos para o bucket derruba. Devolve null
 * quando não há bytes — 0/0 é indefinido, e mostrar "0%" para conta vazia
 * sugeriria que já foi resolvido.
 */
export function fracaoBase64(s: Pick<UsoStats, 'bytes_total' | 'bytes_base64'>): number | null {
  if (!s.bytes_total) return null;
  return s.bytes_base64 / s.bytes_total;
}

export function fmtPercentual(fracao: number | null): string {
  if (fracao == null || !Number.isFinite(fracao)) return '—';
  return `${Math.round(fracao * 100)}%`;
}

/** Ranking por consumo somando os dois lados (banco + bucket). */
export function ordenarPorConsumo(
  uso: UsoStats[],
  storage: Map<string, StorageStats>,
): Array<{ escopo: string; bytesBanco: number; bytesBucket: number; total: number }> {
  return uso
    .map((u) => {
      const bytesBanco = u.bytes_total ?? 0;
      const bytesBucket = storage.get(u.escopo)?.bytes ?? 0;
      return { escopo: u.escopo, bytesBanco, bytesBucket, total: bytesBanco + bytesBucket };
    })
    .sort((a, b) => b.total - a.total);
}
