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
  ordenarVencimentos,
} from './vencimentos';
import type { ItemVencimento } from './vencimentos';

/** Quantas linhas o servidor devolve. O resto vira `truncado`/`restantes`. */
export const LIMITE_PAINEL = 500;

/**
 * Os contadores do painel. TODOS opcionais, e isso é a regra, não descuido.
 *
 * `undefined` = **não foi possível conferir**; a tela mostra "—".
 * `0` = **conferido, e não há nenhum**.
 *
 * Até 25/08/2026 só `conformidade` sabia dizer "não sei", e os outros três
 * caíam em zero no caminho de erro. Medido em produção com a aba offline: o
 * Dashboard exibia "EQUIPAMENTOS CADASTRADOS: 0" numa organização com 4
 * equipamentos no cache — o mesmo texto que o sumiço de dados produz.
 */
export interface KpisPainel {
  total?: number;
  aVencer30?: number;
  vencidos?: number;
  /** Indefinida quando o painel não pôde ser lido — nunca 100 % por omissão. */
  conformidade?: number;
}

/**
 * Um contador de `KpisPainel`, como ele deve aparecer na tela.
 *
 * Existe porque o React renderiza `undefined` como string VAZIA: trocar o zero
 * por indefinido sem passar por aqui deixaria o KPI em branco — tão mudo quanto
 * o zero era mentiroso. "—" é o símbolo que o painel já usa para a conformidade
 * desconhecida, e agora vale para os quatro.
 */
export function textoContador(n: number | undefined): string {
  return n === undefined ? '—' : n.toLocaleString('pt-BR');
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
  // Os contadores ficam INDEFINIDOS: este objeto só é devolvido quando a
  // consulta falhou, e nada foi conferido. Ver `KpisPainel`.
  const vazio: PainelVencimentos = {
    itens: [],
    kpis: {},
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
 * Sem nenhuma das duas flags nada muda: o cache está completo e o cálculo local
 * é o de sempre.
 *
 * ## A DISJUNÇÃO (9F.5.2), e por que ela não é preguiça
 *
 * `vencimentos_v9` é a flag DESTA tela; `boot_v9` é a flag do BOOT. Elas somam.
 *
 *   · `vencimentos_v9` ligada → agregado do servidor, mesmo com o cache
 *     completo. É o que permite ligar o painel numa organização sem mexer no
 *     boot dela;
 *   · `boot_v9` ligada → agregado do servidor OBRIGATORIAMENTE, mesmo com
 *     `vencimentos_v9` desligada. Sob boot leve o cache NÃO tem a organização:
 *     `listarVencimentos()` aqui contaria zero equipamentos e a tela diria
 *     "tudo em dia" sobre uma conta que nunca foi lida. Trocar um painel certo
 *     por um painel vazio não é rollback, é o defeito.
 *
 * Por isso o rollback de `vencimentos_v9` NÃO devolve ao caminho local quem tem
 * boot leve — e é o teste que carrega o risco em `vencimentosDisjuncao.test.ts`.
 */
export async function carregarPainel(
  hoje: Date = new Date(),
  opcoes: { forcar?: boolean } = {},
): Promise<PainelVencimentos> {
  return agregadoCompartilhado(hoje, opcoes.forcar);
}

/**
 * Fase 9 · 9F.5.3 — janela em que dois consumidores dividem UMA agregação.
 *
 * Curta de propósito: ela existe para colapsar o boot, onde `Layout` (sino e
 * contador do menu) e a página pedem o mesmo painel com milissegundos de
 * diferença. Não é cache de sessão — recarga por dado alterado ou volta de foco
 * passa `forcar` e nunca a consulta.
 */
export const JANELA_PAINEL_MS = 3_000;

let painelEmVoo: Promise<PainelVencimentos> | null = null;
let painelEm = 0;

/** Descarta a janela. Usada pelos testes e por quem sabe que o dado mudou. */
export function invalidarPainel(): void {
  painelEmVoo = null;
  painelEm = 0;
}

/**
 * O agregado, compartilhado dentro da janela.
 *
 * Duas regras que o teste trava:
 *   · resposta com ERRO não fica guardada. Segurar uma falha de rede por três
 *     segundos transformaria um tropeço momentâneo em "não sei" para todo mundo
 *     que pedisse o painel nesse intervalo;
 *   · `forcar` invalida ANTES de consultar — quem recarrega porque algo mudou
 *     não pode receber o número de antes da mudança.
 */
function agregadoCompartilhado(hoje: Date, forcar?: boolean): Promise<PainelVencimentos> {
  if (forcar) invalidarPainel();

  if (painelEmVoo && Date.now() - painelEm < JANELA_PAINEL_MS) return painelEmVoo;

  painelEm = Date.now();
  painelEmVoo = painelDoServidor(hoje).then((p) => {
    if (p.erro) invalidarPainel();
    return p;
  });
  return painelEmVoo;
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
    // 9F.5.3 · a montagem NÃO força: é ela que divide a agregação com o `Layout`
    // e mata a segunda chamada do boot. Os dois gatilhos de RECARGA forçam —
    // quem recarrega porque o dado mudou não pode receber o número de antes.
    const atualizar = (forcar: boolean) => {
      void carregarPainel(new Date(), { forcar }).then((p) => {
        if (!vivo) return;
        setPainel(p);
        setCarregando(false);
      });
    };
    atualizar(false);
    const recarregar = () => atualizar(true);
    const cancelarAssinatura = assinarDadosAlterados(recarregar);
    window.addEventListener('focus', recarregar);
    return () => {
      vivo = false;
      cancelarAssinatura();
      window.removeEventListener('focus', recarregar);
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
