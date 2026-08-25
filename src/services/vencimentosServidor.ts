/**
 * Fase 9 · 9D.5 — o painel de vencimentos vindo do AGREGADO do servidor.
 *
 * `listarVencimentos()` percorre TODOS os `nr13_info_` do cache. Não é lista, é
 * AGREGADO (desenho §15), e é a razão de o `/dashboard` — a tela de ENTRADA do
 * sistema — precisar da organização inteira no `Map`. Sob `boot_v9` ela
 * mostraria zero equipamentos e o painel vazio, em silêncio.
 *
 * Aqui o servidor conta e ordena sobre a projeção, e devolve FATOS CRUS das N
 * linhas mais urgentes. As linhas são montadas pela MESMA regra do caminho
 * antigo (`itemDeEquipamento` / `itemDeCalibracao`) — é o que garante que o
 * painel exiba a mesma data pelos dois caminhos.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, de propósito:
 *   · não cai em hidratação integral quando a consulta falha (desenho §16):
 *     erro vira ERRO na tela. Trocar uma falha de rede por "baixar 50.000
 *     equipamentos" é o defeito, não o remédio;
 *   · não conta sobre a lista que recebeu: ela é truncada, e contar nela
 *     mostraria "3 vencidos" numa organização com 300;
 *   · não inventa 100 % de conformidade quando não sabe. Ver `kpis.conformidade`
 *     indefinida no caminho de erro.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { assinarDadosAlterados } from './eventos';
import {
  conformidadeDe,
  itemDeCalibracao,
  itemDeEquipamento,
  resumoKpis,
  listarVencimentos,
  ordenarVencimentos,
} from './vencimentos';
import { bootV9Ativo } from './flag';
import { listarChavesComPrefixo } from './storage';
import type { ItemVencimento } from './vencimentos';

/** Quantas linhas o servidor devolve. O resto vira `truncado`/`restantes`. */
export const LIMITE_PAINEL = 500;

export interface KpisPainel {
  total: number;
  aVencer30: number;
  vencidos: number;
  /** Indefinida quando o painel não pôde ser lido — nunca 100 % por omissão. */
  conformidade?: number;
}

export interface PainelVencimentos {
  itens: ItemVencimento[];
  kpis: KpisPainel;
  fonte: 'local' | 'servidor';
  /** Hora em que o servidor agregou. A tela mostra "dados de HH:MM". */
  em?: Date;
  truncado: boolean;
  restantes: number;
  erro?: boolean;
}

interface FatoServidor {
  origem?: string;
  [campo: string]: unknown;
}

interface RespostaAgregado {
  total_equip?: number;
  com_prazo?: number;
  vencidos?: number;
  a_vencer_30?: number;
  truncado?: boolean;
  restantes?: number;
  em?: string;
  itens?: FatoServidor[];
}

// `conformidadeDe` vem de `vencimentos.ts`, onde o `resumoKpis` também a usa:
// a mesma conta para as duas fontes.

export async function painelDoServidor(
  hoje: Date = new Date(),
  limite: number = LIMITE_PAINEL,
): Promise<PainelVencimentos> {
  const vazio: PainelVencimentos = {
    itens: [],
    kpis: { total: 0, aVencer30: 0, vencidos: 0 },
    fonte: 'servidor',
    truncado: false,
    restantes: 0,
  };

  let dados: RespostaAgregado | null = null;
  try {
    const { data, error } = await supabase.rpc('vencimentos_org', { p_limite: limite });
    if (error || !data) return { ...vazio, erro: true };
    dados = data as RespostaAgregado;
  } catch {
    return { ...vazio, erro: true };
  }

  const itens: ItemVencimento[] = [];
  for (const fato of dados.itens ?? []) {
    if (fato?.origem === 'calibracao') {
      const linha = itemDeCalibracao(
        {
          tag: String(fato.pertenceA ?? fato.tag ?? ''),
          nome: texto(fato.nome),
          tipo: texto(fato.tipo),
          serie: texto(fato.serie),
          dataCalibracao: texto(fato.dataCalibracao),
          proxCalibracao: texto(fato.proxCalibracao),
        },
        hoje,
      );
      if (linha) itens.push(linha);
      continue;
    }
    itens.push(
      itemDeEquipamento(
        {
          tag: String(fato.tag ?? ''),
          descricao: texto(fato.descricao),
          tipo: texto(fato.tipo),
          vidaBase: texto(fato.vidaBase),
          vidaProxAnos: numero(fato.vidaProxAnos),
          relEmissao: texto(fato.relEmissao),
          relExecucao: texto(fato.relExecucao),
          relProxInterna: texto(fato.relProxInterna),
          relProxExterna: texto(fato.relProxExterna),
        },
        hoje,
      ),
    );
  }

  const comPrazo = Number(dados.com_prazo ?? 0);
  const vencidos = Number(dados.vencidos ?? 0);
  const em = dados.em ? new Date(dados.em) : undefined;

  return {
    itens: ordenarVencimentos(itens),
    kpis: {
      total: Number(dados.total_equip ?? 0),
      aVencer30: Number(dados.a_vencer_30 ?? 0),
      vencidos,
      conformidade: conformidadeDe(comPrazo, vencidos),
    },
    fonte: 'servidor',
    em: em && !isNaN(em.getTime()) ? em : undefined,
    truncado: dados.truncado === true,
    restantes: Number(dados.restantes ?? 0),
  };
}

/**
 * O painel, da fonte que valer para esta organização.
 *
 * Sem `boot_v9` nada muda: o cache está completo e o cálculo local é o de
 * sempre. Com a flag ligada o cache NÃO tem a organização, então consultar o
 * local aqui devolveria zero e ainda pagaria a varredura — o pior dos dois
 * mundos.
 */
export async function carregarPainel(hoje: Date = new Date()): Promise<PainelVencimentos> {
  if (bootV9Ativo()) return painelDoServidor(hoje);

  const itens = listarVencimentos(hoje);
  const total = listarChavesComPrefixo('nr13_info_').length;
  return {
    itens,
    kpis: resumoKpis(itens, total),
    fonte: 'local',
    truncado: false,
    restantes: 0,
  };
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && !isNaN(n) ? n : null;
}

/**
 * O painel inteiro — linhas, KPIs e a PROCEDÊNCIA deles.
 *
 * Substituiu o `useVencimentos()` cru quando o painel passou a poder vir do
 * servidor (§15). A tela precisa de mais do que a lista:
 *   · `kpis`     — no caminho do servidor eles vêm dos CONTADORES da
 *                  organização, não da lista, que é truncada;
 *   · `em`       — a hora do agregado, para o selo "dados de HH:MM". Exigência
 *                  do dono: nunca apresentar dado antigo como recém-consultado;
 *   · `truncado` — lista cortada é dita em voz alta, nunca em silêncio;
 *   · `erro`     — sem resposta, a tela diz que não sabe. "Zero vencidos" é uma
 *                  resposta, e a errada.
 *
 * Os gatilhos de recarga são os três de sempre: montagem, `nr13:dados-alterados`
 * (mesma aba, ex.: relatório salvo) e volta de foco (outra aba/janela).
 */
export function usePainelVencimentos(): PainelVencimentos & { carregando: boolean } {
  const [painel, setPainel] = useState<PainelVencimentos>(PAINEL_VAZIO);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const atualizar = () => {
      void carregarPainel().then((p) => {
        if (!vivo) return;
        setPainel(p);
        setCarregando(false);
      });
    };
    atualizar();
    const cancelarAssinatura = assinarDadosAlterados(atualizar);
    window.addEventListener('focus', atualizar);
    return () => {
      vivo = false;
      cancelarAssinatura();
      window.removeEventListener('focus', atualizar);
    };
  }, []);

  return { ...painel, carregando };
}

const PAINEL_VAZIO: PainelVencimentos = {
  itens: [],
  kpis: { total: 0, aVencer30: 0, vencidos: 0 },
  fonte: 'local',
  truncado: false,
  restantes: 0,
};
