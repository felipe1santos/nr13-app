import { ler, listarChavesComPrefixo } from './storage';
import { listarIndice } from '../features/relatorios/historicoRelatorios';
import type { InfoEquipamento } from '../features/equipamento/tipos';
import type { DadosCalibracao } from '../features/calibracoes/tipos';

/**
 * Motor de vencimentos: deriva prazos SOMENTE de dados já salvos no sistema.
 *  - Equipamentos: card "Vida Remanescente" (nr13_vida_<TAG> → próxima inspeção)
 *  - Acessórios:   calibrações (nr13_calibracoes_<TAG> → dataProxCalibracao),
 *                  sempre com a TAG do equipamento a que pertencem.
 * Nada é inventado: sem dado salvo, o item aparece como 'semPrazo'.
 */
export interface ItemVencimento {
  tag: string;
  nome: string;
  tipoEquip: string;                 // rótulo humano ('Vaso de Pressão', 'Manômetro'…)
  origem: 'inspecao' | 'calibracao';
  pertenceA?: string;                // TAG pai (acessórios de calibração)
  ultima?: Date;
  vencimento?: Date;
  dias?: number;                     // dias restantes (negativo = vencido)
  status: 'crit' | 'warn' | 'ok' | 'semPrazo';
}

const MS_DIA = 86_400_000;

/** Aceita 'dd/mm/aaaa', 'aaaa-mm-dd' e 'ddmmaaaa' (dado antigo digitado sem máscara). */
export function parseDataFlex(s: string | undefined | null): Date | null {
  if (!s) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(s.trim());
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function statusPrazo(venc: Date, hoje: Date): { dias: number; status: 'crit' | 'warn' | 'ok' } {
  const dias = Math.floor((venc.getTime() - hoje.getTime()) / MS_DIA);
  if (dias < 0) return { dias, status: 'crit' };
  if (dias <= 30) return { dias, status: 'warn' };
  return { dias, status: 'ok' };
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

interface VidaSalva {
  entrada?: { dataAtual?: string };
  proximaInspecaoAnos?: number | null;
  calculadoEm?: string;
}

// O prazo pelo RELATÓRIO mais recente (Configurações do Relatório → Próx.
// Interna / Próx. Externa) era uma função à parte aqui. Virou parte de
// `itemDeEquipamento`, logo abaixo, quando o agregado do servidor passou a
// precisar da MESMA regra: duas cópias divergiriam em silêncio.
//
// O que não mudou: a leitura é do ÍNDICE por TAG (14/08/2026). Antes vinha do
// array global `nr13_historico_relatorios`, que carrega os snapshots
// congelados de cada relatório (logo e rubricas em base64, ~125 KB por
// entrada) só para chegar a quatro datas. O Dashboard nunca abre um relatório.

// ── A REGRA, sobre FATOS — uma implementação, duas fontes (Fase 9 · §15) ────
//
// O painel pode vir do cache local (caminho de sempre) ou do agregado no
// servidor sobre a projeção. A lição do portão P9.2: quando dois caminhos
// montam a mesma linha cada um por sua conta, eles divergem em SILÊNCIO — foi
// assim que a cidade do cliente sumiu do cartão em 23/08/2026.
//
// Por isso a regra vive aqui, em função pura sobre fatos, e as duas fontes a
// chamam. A paridade passa a ser consequência da construção.

/** Fatos de um equipamento, venham do `Map` ou do agregado do servidor. */
export interface FatosEquipamento {
  tag: string;
  descricao?: string | null;
  tipo?: string | null;
  /** `nr13_vida_`: entrada.dataAtual (ou calculadoEm) e proximaInspecaoAnos. */
  vidaBase?: string | null;
  vidaProxAnos?: number | null;
  /** Do relatório MAIS RECENTE do equipamento. */
  relEmissao?: string | null;
  relExecucao?: string | null;
  relProxInterna?: string | null;
  relProxExterna?: string | null;
}

/** Fatos de UMA calibração — a que já venceu a disputa por componente. */
export interface FatosCalibracao {
  tag: string;
  nome?: string | null;
  tipo?: string | null;
  serie?: string | null;
  dataCalibracao?: string | null;
  proxCalibracao?: string | null;
}

/**
 * `base` + `anos` — em MESES de calendário, como o `setMonth` do JavaScript,
 * que transborda (31/01 + 1 mês = 03/03). O agregado do servidor reproduz esta
 * conta em `f9_mais_meses`, e não a de "anos × 365 dias" da coluna derivada
 * `proxima_inspecao`: duas datas quase iguais seriam pior que duas diferentes.
 */
function somarAnosEmMeses(base: Date, anos: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + Math.round(anos * 12));
  return d;
}

/** A linha do painel para um equipamento. Nunca devolve null: sem prazo, `semPrazo`. */
export function itemDeEquipamento(f: FatosEquipamento, hoje: Date): ItemVencimento {
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const tipoEquip = ROTULO_TIPO[f.tipo ?? ''] ?? 'Equipamento';
  const nome = f.descricao?.trim() || tipoEquip;

  // Regra do painel (decisão do usuário): o prazo é o do ÚLTIMO RELATÓRIO
  // (menor entre Próx. Interna e Próx. Externa). Vida Remanescente só entra
  // como reserva, e um relatório recente SEM datas não faz procurar num
  // anterior — a regra sempre olhou só o mais recente.
  const doRelatorio = [f.relProxInterna, f.relProxExterna]
    .map(parseDataFlex)
    .filter((d): d is Date => d !== null);
  const vencimento =
    doRelatorio.length > 0
      ? doRelatorio.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
      : prazoDaVida(f)?.vencimento;

  const ultima =
    doRelatorio.length > 0
      ? (parseDataFlex(f.relExecucao ?? null) ?? parseDataFlex(f.relEmissao ?? null) ?? undefined)
      : prazoDaVida(f)?.ultima;

  if (!vencimento) return { tag: f.tag, nome, tipoEquip, origem: 'inspecao', status: 'semPrazo' };
  const { dias, status } = statusPrazo(vencimento, hojeZero);
  return { tag: f.tag, nome, tipoEquip, origem: 'inspecao', ultima, vencimento, dias, status };
}

function prazoDaVida(f: FatosEquipamento): { ultima: Date; vencimento: Date } | null {
  const base = parseDataFlex(f.vidaBase ?? null);
  const anos = f.vidaProxAnos;
  if (!base || typeof anos !== 'number' || anos < 0) return null;
  return { ultima: base, vencimento: somarAnosEmMeses(base, anos) };
}

/** A linha do painel para um acessório. `null` sem próxima calibração — igual ao caminho antigo. */
export function itemDeCalibracao(f: FatosCalibracao, hoje: Date): ItemVencimento | null {
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const venc = parseDataFlex(f.proxCalibracao ?? null);
  if (!venc) return null;

  const tipoAc = f.tipo === 'psv' ? 'Válvula de Segurança' : 'Manômetro';
  const nome = f.nome?.trim() || tipoAc;
  const { dias, status } = statusPrazo(venc, hojeZero);
  return {
    // A "TAG" do acessório é rótulo de tela, não identidade de equipamento:
    // primeira palavra do tipo + nº de série, como sempre foi.
    tag: f.serie ? `${tipoAc.split(' ')[0].toUpperCase()}-${f.serie}` : nome,
    nome,
    tipoEquip: tipoAc,
    origem: 'calibracao',
    pertenceA: f.tag,
    ultima: parseDataFlex(f.dataCalibracao ?? null) ?? undefined,
    vencimento: venc,
    dias,
    status,
  };
}

export function listarVencimentos(hoje: Date = new Date()): ItemVencimento[] {
  const itens: ItemVencimento[] = [];
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // ── Equipamentos (via vida remanescente salva na ficha) ──
  for (const chave of listarChavesComPrefixo('nr13_info_')) {
    try {
      const tag = chave.slice('nr13_info_'.length);
      const info = ler<InfoEquipamento>(chave);
      if (!info) continue;

      // Os FATOS saem do cache; a REGRA é a mesma função que o agregado do
      // servidor usa. Foi o que tirou daqui a segunda cópia da regra.
      const vida = ler<VidaSalva>(`nr13_vida_${tag}`);
      // `listarIndice` já devolve do mais recente para o mais antigo.
      const recente = listarIndice(tag)[0];
      itens.push(
        itemDeEquipamento(
          {
            tag,
            descricao: info.descricao,
            tipo: info.tipo,
            vidaBase: vida?.entrada?.dataAtual ?? vida?.calculadoEm ?? null,
            vidaProxAnos: vida?.proximaInspecaoAnos ?? null,
            relEmissao: recente?.emissao ?? null,
            relExecucao: recente?.execucaoInspecao ?? null,
            relProxInterna: recente?.proximaInspecaoInterna ?? null,
            relProxExterna: recente?.proximaInspecaoExterna ?? null,
          },
          hojeZero,
        ),
      );

      // ── Acessórios do equipamento (calibrações) ──
      // Com lotes, o mesmo componente acumula certificados a cada inspeção:
      // só a calibração MAIS RECENTE de cada componente conta para o prazo.
      const todas = ler<DadosCalibracao[]>(`nr13_calibracoes_${tag}`) ?? [];
      const porComponente = new Map<string, DadosCalibracao>();
      for (const cal of todas) {
        const chaveComp = (cal as { componenteId?: string }).componenteId ?? `nome:${cal.nome ?? cal.id}`;
        const atual = porComponente.get(chaveComp);
        const dNova = parseDataFlex(cal.dataProxCalibracao)?.getTime() ?? 0;
        const dAtual = atual ? (parseDataFlex(atual.dataProxCalibracao)?.getTime() ?? 0) : -1;
        if (!atual || dNova >= dAtual) porComponente.set(chaveComp, cal);
      }
      const cals = [...porComponente.values()];
      for (const cal of cals) {
        try {
          const linha = itemDeCalibracao(
            {
              tag,
              nome: cal.nome,
              tipo: cal.tipo,
              serie: cal.serie,
              dataCalibracao: cal.dataCalibracao,
              proxCalibracao: cal.dataProxCalibracao,
            },
            hojeZero,
          );
          if (linha) itens.push(linha);
        } catch { /* item malformado: ignora */ }
      }
    } catch { /* chave malformada: ignora */ }
  }

  return ordenarVencimentos(itens);
}

/**
 * Vencidos primeiro, depois por dias restantes; `semPrazo` por último.
 *
 * Exportada porque o painel do servidor ordena a MESMA lista: o servidor
 * ordena para escolher QUAIS linhas mandar (é ele que tem a organização
 * inteira), e a tela reordena com esta função para exibir. Duas ordens
 * parecidas seriam pior que duas diferentes.
 */
export function ordenarVencimentos(itens: ItemVencimento[]): ItemVencimento[] {
  return [...itens].sort((a, b) => {
    if (a.status === 'semPrazo' && b.status !== 'semPrazo') return 1;
    if (b.status === 'semPrazo' && a.status !== 'semPrazo') return -1;
    return (a.dias ?? Infinity) - (b.dias ?? Infinity);
  });
}

/**
 * A conta da conformidade, isolada porque o painel do servidor a refaz sobre
 * CONTADORES da organização (a lista que ele devolve é truncada). Duas
 * fórmulas dariam duas porcentagens para a mesma conta.
 */
export function conformidadeDe(comPrazo: number, vencidos: number): number {
  if (comPrazo <= 0) return 100;
  return Math.round(((comPrazo - vencidos) / comPrazo) * 1000) / 10;
}

export function resumoKpis(itens: ItemVencimento[], totalEquip: number): {
  total: number; aVencer30: number; vencidos: number; conformidade: number;
} {
  const comPrazo = itens.filter((i) => i.status !== 'semPrazo');
  const vencidos = comPrazo.filter((i) => i.status === 'crit').length;
  const aVencer30 = comPrazo.filter((i) => i.status === 'warn').length;
  return { total: totalEquip, aVencer30, vencidos, conformidade: conformidadeDe(comPrazo.length, vencidos) };
}

/** Texto humano do prazo ("Vencido há 2 dias" / "Vence em 3 dias" / "Vence hoje"). */
export function textoPrazo(item: ItemVencimento): string {
  if (item.dias === undefined) return 'Sem prazo cadastrado';
  if (item.dias < 0) return `Vencido há ${Math.abs(item.dias)} dia${Math.abs(item.dias) === 1 ? '' : 's'}`;
  if (item.dias === 0) return 'Vence hoje';
  return `Vence em ${item.dias} dia${item.dias === 1 ? '' : 's'}`;
}

/**
 * Hook compartilhado por Dashboard e Vencimentos: recalcula `listarVencimentos()`
 * sempre que os dados mudam. Cobre os três casos de dado velho:
 *  - mesma aba, sem remount: `emitirDadosAlterados()` (ex.: relatoriosService ao salvar);
 *  - outra aba/janela: window 'focus';
 *  - montagem normal da tela.
 * Os listeners são limpos no cleanup do efeito; nenhum deles reemite o evento que escuta,
 * então não há loop de re-render.
 */
// O hook do painel mora em `vencimentosServidor.ts`, e não aqui, por uma razão
// de DEPENDÊNCIA: ele precisa escolher entre a fonte local (este arquivo) e o
// agregado do servidor (aquele). Se ficasse aqui, os dois módulos importariam
// um ao outro. Este arquivo é a camada de baixo — regra e leitura do cache — e
// não conhece o servidor.
