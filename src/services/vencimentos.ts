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
  /**
   * De onde o prazo vem:
   *   · `inspecao`    — do relatório (ou da vida remanescente) do equipamento;
   *   · `calibracao`  — do acessório instalado no equipamento (manômetro, PSV);
   *   · `certificado` — do CERTIFICADO do instrumento PADRÃO usado no ensaio
   *     (`nr13_rastreab_`). São coisas diferentes e não podem se confundir: um
   *     é a válvula do vaso, o outro é a válvula-padrão da bancada.
   */
  origem: 'inspecao' | 'calibracao' | 'certificado';
  pertenceA?: string;                // TAG pai (acessórios de calibração)
  ultima?: Date;
  vencimento?: Date;
  dias?: number;                     // dias restantes (negativo = vencido)
  status: 'crit' | 'warn' | 'ok' | 'semPrazo';
}

const MS_DIA = 86_400_000;

/**
 * Uma data de calendário REAL, ou `null`.
 *
 * `new Date(2026, 12, 32)` não é inválida para o JavaScript: ela TRANSBORDA
 * para 01/02/2027. Era assim que `32/13/2026` — digitação errada, importação
 * torta — virava um vencimento plausível em vez de ser recusado (07/09/2026).
 * A volta ao mesmo dia/mês/ano é o que separa data de lixo bem formatado.
 */
function dataExata(ano: number, mes: number, dia: number): Date | null {
  const d = new Date(ano, mes - 1, dia);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}

/** Aceita 'dd/mm/aaaa', 'aaaa-mm-dd' e 'ddmmaaaa' (dado antigo digitado sem máscara). */
export function parseDataFlex(s: string | undefined | null): Date | null {
  if (!s) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(s.trim());
  if (br) return dataExata(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (iso) return dataExata(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/**
 * A janela em que uma data de prazo é PLAUSÍVEL (07/09/2026).
 *
 * `parseDataFlex` aceita qualquer data bem formada, e é o certo para ele: ele
 * também ordena históricos e desenha o Portal. Aqui, no motor de PRAZOS, uma
 * data fora desta janela não é um vencimento — é sentinela de dado velho, e
 * exibi-la produz "Vencido há 20.703 dias" no topo do Dashboard, empurrando
 * para baixo o que realmente vence esta semana.
 *
 * As sentinelas vistas no sistema: `01/01/1970` (epoch de um campo que veio
 * como `0`), `1900-01-01` e `0000-00-00` (herança de importação). O teto
 * existe pela razão oposta — `9999-12-31` como "nunca vence" abriria uma linha
 * dizendo "vence em 2.9 milhões de dias".
 */
export const ANO_MIN_PRAZO = 1990;
export const ANO_MAX_PRAZO = 2200;

/**
 * A data de um PRAZO. Como `parseDataFlex`, mais a recusa das sentinelas.
 *
 * Devolve `null` — e `null` aqui significa "não há prazo", que a tela mostra
 * como "Sem prazo cadastrado". Nunca uma data inventada.
 */
export function parseDataPrazo(s: string | undefined | null): Date | null {
  const d = parseDataFlex(s);
  if (!d) return null;
  const ano = d.getFullYear();
  if (ano < ANO_MIN_PRAZO || ano > ANO_MAX_PRAZO) return null;
  return d;
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

/**
 * Fatos de UM certificado de instrumento PADRÃO (`nr13_rastreab_<id>`).
 *
 * O painel nunca leu esta família — foi o defeito relatado em 07/09/2026:
 * certificado com validade dentro de 30 dias não aparecia em lugar nenhum.
 */
export interface FatosCertificado {
  id: string;
  nome?: string | null;
  /** `tipoInstrumento`: 'manometro' | 'valvula' | 'ultrassom' | 'bloco'… */
  tipo?: string | null;
  /** Nº do certificado do padrão, para a linha da tela. */
  certificado?: string | null;
  validade?: string | null;
  /** Soft-replace: registro substituído não vence — quem vence é o que o trocou. */
  substituidoEm?: string | null;
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
    .map(parseDataPrazo)
    .filter((d): d is Date => d !== null);
  const vencimento =
    doRelatorio.length > 0
      ? doRelatorio.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
      : prazoDaVida(f)?.vencimento;

  const ultima =
    doRelatorio.length > 0
      ? (parseDataPrazo(f.relExecucao ?? null) ?? parseDataPrazo(f.relEmissao ?? null) ?? undefined)
      : prazoDaVida(f)?.ultima;

  if (!vencimento) return { tag: f.tag, nome, tipoEquip, origem: 'inspecao', status: 'semPrazo' };
  const { dias, status } = statusPrazo(vencimento, hojeZero);
  return { tag: f.tag, nome, tipoEquip, origem: 'inspecao', ultima, vencimento, dias, status };
}

function prazoDaVida(f: FatosEquipamento): { ultima: Date; vencimento: Date } | null {
  const base = parseDataPrazo(f.vidaBase ?? null);
  const anos = f.vidaProxAnos;
  if (!base || typeof anos !== 'number' || anos < 0) return null;
  return { ultima: base, vencimento: somarAnosEmMeses(base, anos) };
}

/** A linha do painel para um acessório. `null` sem próxima calibração — igual ao caminho antigo. */
export function itemDeCalibracao(f: FatosCalibracao, hoje: Date): ItemVencimento | null {
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const venc = parseDataPrazo(f.proxCalibracao ?? null);
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
    ultima: parseDataPrazo(f.dataCalibracao ?? null) ?? undefined,
    vencimento: venc,
    dias,
    status,
  };
}

/**
 * O rótulo humano de cada instrumento padrão. As chaves são as do
 * `TipoInstrumento` de `rastreabilidadeService`; um tipo novo lá sem entrada
 * aqui cai em "Instrumento padrão" — e o gate
 * `vencimentosCertificados.test.ts` reprova a omissão.
 */
export const ROTULO_PADRAO: Record<string, string> = {
  manometro: 'Manômetro padrão',
  valvula: 'Válvula PSV padrão',
  ultrassom: 'Bloco padrão de espessura',
  bloco: 'Bloco padrão de espessura',
  pressostato: 'Pressostato padrão',
  termostato: 'Termostato padrão',
  manovacuometro: 'Manovacuômetro padrão',
  termometro: 'Termômetro padrão',
  outro: 'Instrumento padrão',
};

/**
 * A linha do painel para um certificado de padrão.
 *
 * `null` em dois casos, e os dois são regra: registro SUBSTITUÍDO (soft-replace
 * — quem vence é o que o trocou) e validade ausente/ilegível. Inventar prazo
 * onde não há data é o oposto do que este motor faz.
 */
export function itemDeCertificado(f: FatosCertificado, hoje: Date): ItemVencimento | null {
  if (f.substituidoEm) return null;
  const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const venc = parseDataPrazo(f.validade ?? null);
  if (!venc) return null;

  const rotulo = ROTULO_PADRAO[f.tipo ?? ''] ?? 'Instrumento padrão';
  const { dias, status } = statusPrazo(venc, hojeZero);
  return {
    // A "TAG" é rótulo de tela: o nº do certificado quando existe, senão o
    // nome do instrumento. Certificado de padrão NÃO pertence a equipamento
    // nenhum — vale para a organização inteira.
    tag: f.certificado?.trim() || f.nome?.trim() || rotulo,
    nome: f.nome?.trim() || rotulo,
    tipoEquip: rotulo,
    origem: 'certificado',
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

  // ── Certificados dos instrumentos PADRÃO (nr13_rastreab_<id>) ──
  // Não pertencem a equipamento: são da organização. Ficavam de fora do painel
  // inteiro — nem aqui nem no agregado do servidor.
  for (const chave of listarChavesComPrefixo('nr13_rastreab_')) {
    try {
      const r = ler<{
        id?: string;
        nome?: string;
        tipoInstrumento?: string;
        certificadoPadrao?: string;
        validade?: string;
        substituidoEm?: string;
      }>(chave);
      if (!r) continue;
      const linha = itemDeCertificado(
        {
          id: r.id ?? chave.slice('nr13_rastreab_'.length),
          nome: r.nome,
          tipo: r.tipoInstrumento,
          certificado: r.certificadoPadrao,
          validade: r.validade,
          substituidoEm: r.substituidoEm,
        },
        hojeZero,
      );
      if (linha) itens.push(linha);
    } catch { /* registro malformado: ignora */ }
  }

  return ordenarVencimentos(dedupVencimentos(itens));
}

/**
 * A IDENTIDADE de uma linha do painel, para não exibi-la duas vezes.
 *
 * O painel passou a somar TRÊS fontes (relatório, calibração e certificado de
 * padrão), e duas delas podem chegar pelo servidor e pelo cache na mesma
 * carga. Duplicata no painel não é só feiúra: ela conta duas vezes em
 * "vencidos" e derruba a conformidade de uma organização que está em dia.
 *
 * A chave não usa `dias`: ele é derivado de `hoje` e mudaria a identidade da
 * mesma linha entre duas renderizações do mesmo dia.
 */
export function chaveIdentidade(i: ItemVencimento): string {
  const venc = i.vencimento ? i.vencimento.toISOString().slice(0, 10) : '';
  return [i.origem, i.pertenceA ?? '', i.tag, i.nome, venc].join('|');
}

/** Mantém a PRIMEIRA ocorrência de cada identidade, preservando a ordem. */
export function dedupVencimentos(itens: ItemVencimento[]): ItemVencimento[] {
  const vistos = new Set<string>();
  const saida: ItemVencimento[] = [];
  for (const i of itens) {
    const k = chaveIdentidade(i);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(i);
  }
  return saida;
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

/**
 * ## O FILTRO DE PRAZO DO PAINEL (08/09/2026)
 *
 * Os chips eram `Todos · 5 · 30 · 60 · Vencidos`. Duas coisas estavam erradas
 * ali, e nenhuma é estética:
 *
 * 1. **"Todos" não é um prazo.** Ele desligava o painel de prazos e o
 *    transformava numa listagem do parque inteiro — que é o que a tela
 *    `/vencimentos` já faz, com busca e paginação.
 * 2. **"5 dias" chegava tarde.** Reinspeção de vaso se agenda com semanas de
 *    antecedência; cinco dias é o prazo de quem já perdeu o prazo.
 *
 * A régua passa a ser `15 · 30 · 60 · 90 · Vencidos`.
 *
 * ### A regra é CUMULATIVA, e inclui o vencido
 *
 * `dias <= N` — o que vence em 3 dias aparece em 15, em 30, em 60 e em 90.
 * E o que JÁ VENCEU aparece em todas elas, porque `dias` é negativo.
 *
 * Essa última parte é deliberada e é a razão de a regra ter saído do JSX: com
 * "Todos" removido, o filtro mais largo passou a ser "90 dias", e se ele
 * excluísse os negativos o usuário abriria o Dashboard sem ver **nenhum item
 * vencido** — exatamente a informação mais urgente do painel. O chip
 * "Vencidos" continua existindo para isolá-los (`dias < 0`), que é uma
 * pergunta diferente de "o que preciso resolver nos próximos 90 dias".
 *
 * `semPrazo` (sem `dias`) nunca entra: não há o que filtrar em algo que não
 * tem data. A tela já o exclui antes, via `status !== 'semPrazo'`.
 */
export type FiltroPrazo = 15 | 30 | 60 | 90 | 'vencidos';

export const FILTROS_PRAZO: ReadonlyArray<readonly [FiltroPrazo, string]> = [
  [15, '15 dias'],
  [30, '30 dias'],
  [60, '60 dias'],
  [90, '90 dias'],
  ['vencidos', 'Vencidos'],
] as const;

/** O filtro que o painel usa ao abrir: a janela mais larga. */
export const FILTRO_PRAZO_PADRAO: FiltroPrazo = 90;

export function noFiltroPrazo(item: Pick<ItemVencimento, 'dias'>, filtro: FiltroPrazo): boolean {
  if (item.dias === undefined) return false;
  if (filtro === 'vencidos') return item.dias < 0;
  return item.dias <= filtro;
}
