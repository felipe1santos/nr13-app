// Paginação da folha de ultrassom (medição de espessura).
//
// Os pontos de medição deixaram de ser 6 fixos: o inspetor acrescenta pontos por região
// (tampo superior / casco / tampo inferior) no FormularioUltrassom. Quando eles não cabem
// numa folha A4, a entrada 'ULTRASSOM.html' vira N entradas 'ULTRASSOM.html?upag=k&uof=N'
// e o template renderiza só a sua fatia (mesmo mecanismo de expandirFolhasFoto/?fpag=).
//
// O módulo é separado de relatoriosService.ts de propósito; é conectado no pipeline em
// src/pages/Relatorios.tsx, junto de expandirMemorial/expandirFolhasFoto.
import { ler } from '../../services/storage';

/** Linhas (pontos) por folha. DEVE casar com LINHAS_POR_FOLHA_US em ULTRASSOM.html. */
export const LINHAS_POR_FOLHA_ULTRASSOM = 12;

/** Quantidade de pontos históricos (ts, c1..c4, ti) — assumida por container sem lista. */
const PONTOS_PADRAO = 6;

interface UltrassomContainer {
  pontos?: unknown;
  medidas?: unknown;
}

interface GridSalva {
  ts?: unknown;
  casco?: unknown;
  ti?: unknown;
}

function tamanho(v: unknown): number {
  // Formato antigo: array de linhas. Formato novo: { angulos, linhas } (colunas dinâmicas).
  if (Array.isArray(v)) return v.length;
  const linhas = (v as { linhas?: unknown } | null)?.linhas;
  return Array.isArray(linhas) ? linhas.length : 0;
}

/**
 * Nº de linhas da grade de espessuras. Ordem das fontes:
 *  1. lista de pontos do container (dado novo);
 *  2. container antigo, sem lista => os 6 pontos originais;
 *  3. sem container => grade já persistida em nr13_med_grid_<TAG>;
 *  4. fallback: 6.
 */
export function contarPontosUltrassom(tag: string, dadosContainer?: unknown): number {
  const d = (dadosContainer ?? {}) as Record<string, UltrassomContainer | undefined>;
  const us = d['ultrassom'];

  if (us && Array.isArray(us.pontos)) {
    const ids = new Set<string>();
    for (const bruto of us.pontos) {
      if (!bruto || typeof bruto !== 'object') continue;
      const id = (bruto as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim()) ids.add(id.trim());
    }
    if (ids.size > 0) return ids.size;
  }
  if (us) return PONTOS_PADRAO;

  try {
    const grid = ler<GridSalva>(`nr13_med_grid_${tag}`);
    if (grid) {
      const total = tamanho(grid.ts) + tamanho(grid.casco) + tamanho(grid.ti);
      if (total > 0) return total;
    }
  } catch {
    /* storage indisponível/corrompido: cai no padrão */
  }
  return PONTOS_PADRAO;
}

/**
 * Troca 'ULTRASSOM.html' por N entradas 'ULTRASSOM.html?upag=k&uof=N' quando a grade não
 * cabe numa folha. Idempotente: documento já expandido (?upag=) passa intacto.
 */
export function expandirFolhasUltrassom(tag: string, docs: string[], dadosContainer?: unknown): string[] {
  const out: string[] = [];
  for (const doc of docs) {
    const base = doc.split('?')[0];
    if (base !== 'ULTRASSOM.html' || doc.includes('upag=')) {
      out.push(doc);
      continue;
    }
    const n = contarPontosUltrassom(tag, dadosContainer);
    const total = Math.max(1, Math.ceil(n / LINHAS_POR_FOLHA_ULTRASSOM));
    if (total <= 1) {
      // Cabe numa folha: comportamento idêntico ao de hoje (sem ?upag).
      out.push(doc);
      continue;
    }
    const sep = doc.includes('?') ? '&' : '?';
    for (let k = 1; k <= total; k++) out.push(`${doc}${sep}upag=${k}&uof=${total}`);
  }
  return out;
}
