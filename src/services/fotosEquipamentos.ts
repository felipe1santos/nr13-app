/**
 * Foto (e tipo) dos equipamentos de uma página de lista que NÃO vem da projeção
 * de equipamentos — Relatórios e Prontuários (21/11/2026).
 *
 * UMA ida por página: `fotos_equipamentos(p_tags)` com as TAGs ainda não
 * conhecidas (máx. 200), nunca uma por linha. O resultado fica em memória por
 * 5 minutos — rolar, filtrar e voltar à tela não pergunta de novo.
 *
 * Servidor sem a função (o front pode ir ao ar antes do SQL): lembra na
 * sessão e as listas seguem com o ícone, sem erro e sem nova tentativa.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { RefFoto } from './fotos';

export interface FotoDoEquipamento {
  tipo: string | null;
  fotoRef: RefFoto | null;
}

const VALIDADE_MS = 5 * 60 * 1000;
const cache = new Map<string, { valor: FotoDoEquipamento | null; em: number }>();
let funcaoAusente = false;

function valido(tag: string): boolean {
  const c = cache.get(tag);
  return !!c && Date.now() - c.em < VALIDADE_MS;
}

/** Só para teste. */
export function __limparFotosEquipamentos(): void {
  cache.clear();
  funcaoAusente = false;
}

export async function carregarFotos(tags: string[]): Promise<Record<string, FotoDoEquipamento | null>> {
  const unicas = [...new Set(tags.filter(Boolean))];
  const faltam = unicas.filter((t) => !valido(t)).slice(0, 200);
  if (faltam.length && !funcaoAusente) {
    const { data, error } = await supabase.rpc('fotos_equipamentos', { p_tags: faltam });
    if (error) {
      const e = error as { code?: string };
      if (e.code === 'PGRST202' || e.code === '42883') funcaoAusente = true;
      // Erro de rede: não grava nada — a próxima página tenta de novo.
    } else {
      const agora = Date.now();
      const vieram = new Set<string>();
      for (const l of (data ?? []) as Array<{ tag: string; tipo: string | null; foto_ref: RefFoto | null }>) {
        vieram.add(l.tag);
        cache.set(l.tag, { valor: { tipo: l.tipo, fotoRef: l.foto_ref ?? null }, em: agora });
      }
      // TAG que o servidor não devolveu (excluída, de outra org): "sem foto",
      // também guardado, para não perguntar de novo a cada render.
      for (const t of faltam) if (!vieram.has(t)) cache.set(t, { valor: null, em: agora });
    }
  }
  const saida: Record<string, FotoDoEquipamento | null> = {};
  for (const t of unicas) saida[t] = cache.get(t)?.valor ?? null;
  return saida;
}

/**
 * Fila de UM tique: cada linha pede a sua TAG, e todas as que pedirem no mesmo
 * render saem numa única chamada. Sem isto, 50 linhas = 50 requisições.
 */
let fila: Set<string> | null = null;
let promessaFila: Promise<Record<string, FotoDoEquipamento | null>> | null = null;

function pedirNaFila(tag: string): Promise<Record<string, FotoDoEquipamento | null>> {
  if (!fila) {
    fila = new Set();
    promessaFila = new Promise((resolve) => {
      setTimeout(() => {
        const tags = [...(fila ?? [])];
        fila = null;
        promessaFila = null;
        void carregarFotos(tags).then(resolve, () => resolve({}));
      }, 0);
    });
  }
  fila.add(tag);
  return promessaFila!;
}

/**
 * A foto de UMA TAG — para a linha de lista. Já conhecida: síncrono, sem
 * requisição. Desconhecida: entra na fila do tique. A dependência é a TAG
 * (texto), nunca objeto montado no render (regra de custo do projeto).
 */
export function useFotoDaTag(tag: string | null | undefined): FotoDoEquipamento | null {
  const [res, setRes] = useState<{ tag: string; valor: FotoDoEquipamento | null } | null>(null);
  useEffect(() => {
    if (!tag || valido(tag) || funcaoAusente) return;
    let vivo = true;
    void pedirNaFila(tag).then((r) => {
      if (vivo) setRes({ tag, valor: r[tag] ?? null });
    });
    return () => {
      vivo = false;
    };
  }, [tag]);
  if (!tag) return null;
  // Já conhecida: direto do cache, sem esperar efeito nenhum.
  if (valido(tag)) return cache.get(tag)?.valor ?? null;
  return res && res.tag === tag ? res.valor : null;
}
