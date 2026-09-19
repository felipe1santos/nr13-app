import { listarCalibracoes } from './calibracaoService';
import { listarComponentes, type ComponenteCal } from './componentesService';
import { definicaoDe, type TipoInstrumento } from './instrumentos';
import { ehEmitido, ehInterna, ehTerceiro, type DadosCalibracao } from './tipos';

/**
 * Revisão do engenheiro, fase 2 (D) · INSTRUMENTO → CALIBRAÇÃO → INSPEÇÃO →
 * RELATÓRIO, sem redigitar.
 *
 * No checklist de campo, cada linha do quadro 7.1.1 aponta para UMA calibração
 * registrada (interna emitida, interna anterior à emissão, ou de laboratório
 * externo). A inspeção guarda a REFERÊNCIA (ids) e um SNAPSHOT dos dados que o
 * quadro imprime — o relatório lê o snapshot, nunca o registro vivo. Corrigir a
 * calibração depois (uma revisão) não muda uma inspeção já feita; relatório
 * finalizado é arquivo (§7-quater) e não é tocado de jeito nenhum.
 *
 * Mora em `container.dados.checklist.instrumentosRef[<id da linha>]` — o mesmo
 * caminho do resto do checklist: container → cache local → fila → sync → ACK.
 */
export type OrigemSnapshot = 'interna' | 'terceiro' | 'nao_informada';

export interface SnapshotInstrumento {
  calibracaoId: string;
  componenteId?: string;
  origem: OrigemSnapshot;
  tipo: TipoInstrumento;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  faixa: string;
  unidade: string;
  numeroCertificado: string;
  dataCalibracao: string;
  /** Validade = próxima calibração. */
  validade: string;
  /** Quem emitiu o certificado: a empresa executante (interna) ou o laboratório. */
  emissor: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  /** Certificado interno emitido (arquivo imutável) — e o hash dele. */
  emitido: boolean;
  sha256?: string;
}

export interface RefInstrumentoChecklist {
  componenteId?: string;
  calibracaoId: string;
  snapshot: SnapshotInstrumento;
  /** ISO de quando o inspetor escolheu. */
  selecionadoEm: string;
}

export function snapshotDaCalibracao(cal: DadosCalibracao, emissorInterno: string): SnapshotInstrumento {
  const terceiro = ehTerceiro(cal);
  return {
    calibracaoId: cal.id,
    ...(cal.componenteId ? { componenteId: cal.componenteId } : {}),
    origem: terceiro ? 'terceiro' : cal.origem === 'interna' ? 'interna' : 'nao_informada',
    tipo: cal.tipo,
    instrumento: cal.instrumento || cal.nome,
    fabricante: cal.fabricante ?? '',
    modelo: cal.modelo ?? '',
    serie: cal.serie ?? '',
    faixa: cal.referencia ?? '',
    unidade: cal.unidade ?? '',
    numeroCertificado: cal.numeroCertificado ?? '',
    dataCalibracao: cal.dataCalibracao ?? '',
    validade: cal.dataProxCalibracao ?? '',
    emissor: terceiro ? cal.laboratorio : emissorInterno,
    statusConclusao: cal.statusConclusao ?? '',
    emitido: ehEmitido(cal),
    ...(ehInterna(cal) && cal.emissao?.sha256 ? { sha256: cal.emissao.sha256 } : {}),
  };
}

/** `dd/mm/aaaa` ou `aaaa-mm-dd` → timestamp do dia; `null` se não for data. */
export function diaDe(s: string | null | undefined): number | null {
  const t = (s ?? '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return null;
}

export type SituacaoCalibracao = 'valida' | 'vencida' | 'reprovada' | 'sem_validade';

/**
 * CALIBRADO vem da informação estruturada, não de "tem um número": reprovada
 * → não; vencida NA DATA DA INSPEÇÃO → não; sem validade informada → não dá
 * para afirmar. Sem data de inspeção, compara com a validade só se houver.
 */
export function situacaoCalibracao(s: SnapshotInstrumento, dataInspecao: string | null | undefined): SituacaoCalibracao {
  if (s.statusConclusao === 'reprovado') return 'reprovada';
  const val = diaDe(s.validade);
  if (val === null) return 'sem_validade';
  const ref = diaDe(dataInspecao ?? null);
  if (ref !== null && val < ref) return 'vencida';
  return 'valida';
}

/** O texto da coluna "Nº DO CERTIFICADO / VALIDADE" — nunca atribui a nós um certificado de terceiro. */
export function textoCertificado(s: SnapshotInstrumento): string {
  const partes = [s.numeroCertificado || 's/ nº'];
  if (s.validade) partes.push(`val. ${s.validade}`);
  if (s.origem === 'terceiro') partes.push(`${s.emissor || 'laboratório externo'} (externo)`);
  return partes.join(' · ');
}

export interface LinhaQuadro {
  nome: string;
  possui: string;
  /** 'SIM' | 'NÃO' | '' */
  calibrado: string;
  certificado: string | null;
  /** De onde veio: a calibração escolhida na inspeção, ou só as marcações manuais (legado). */
  fonte: 'calibracao' | 'manual';
  situacao?: SituacaoCalibracao;
}

/**
 * Uma linha do quadro 7.1.1.
 *
 * - Com calibração escolhida: POSSUI = SIM; CALIBRADO derivado; CERTIFICADO /
 *   VALIDADE do snapshot.
 * - Sem calibração (inspeção antiga, ou não escolhida): as marcações manuais,
 *   exatamente como antes — nada é reinterpretado.
 */
export function linhaQuadro(
  inst: { id: string; calId: string; nome: string },
  chk: { instrumentos?: Record<string, boolean>; instrumentosRef?: Record<string, RefInstrumentoChecklist> },
  dataInspecao: string | null | undefined,
): LinhaQuadro {
  const ref = chk.instrumentosRef?.[inst.id];
  if (ref?.snapshot) {
    const situacao = situacaoCalibracao(ref.snapshot, dataInspecao);
    return {
      nome: inst.nome,
      possui: 'SIM',
      calibrado: situacao === 'valida' ? 'SIM' : situacao === 'sem_validade' ? '' : 'NÃO',
      certificado: textoCertificado(ref.snapshot),
      fonte: 'calibracao',
      situacao,
    };
  }
  const marc = chk.instrumentos ?? {};
  return {
    nome: inst.nome,
    possui: marc[inst.id] ? 'SIM' : '',
    calibrado: marc[inst.calId] ? 'SIM' : '',
    certificado: null,
    fonte: 'manual',
  };
}

export interface OpcaoCalibracao {
  componente: ComponenteCal | null;
  calibracao: DadosCalibracao;
  /** Rascunho não entra: o certificado não foi emitido. */
  selecionavel: boolean;
  motivo?: string;
}

/**
 * O que o inspetor pode escolher para aquela linha: as calibrações dos
 * acessórios DAQUELE tipo, mais recentes primeiro. Rascunho aparece, mas não se
 * escolhe — citar num relatório um certificado que ainda não existe seria
 * emiti-lo por tabela.
 */
export function opcoesParaLinha(tag: string, tipo: TipoInstrumento): OpcaoCalibracao[] {
  const comps = listarComponentes(tag);
  const porId = new Map(comps.map((c) => [c.id, c]));
  const cals = listarCalibracoes(tag).filter((c) => c.tipo === tipo || (c.componenteId && porId.get(c.componenteId)?.tipo === tipo));
  const substituidas = new Set(
    cals.map((c) => (ehInterna(c) ? c.substitui : undefined)).filter((x): x is string => !!x),
  );
  return cals
    .filter((c) => !substituidas.has(c.id))
    .map((c) => {
      const rascunho = ehInterna(c) && c.status === 'rascunho';
      return {
        componente: (c.componenteId && porId.get(c.componenteId)) || null,
        calibracao: c,
        selecionavel: !rascunho,
        ...(rascunho ? { motivo: 'Rascunho — emita o certificado em Calibrações para poder citá-lo.' } : {}),
      };
    })
    .sort((a, b) => (diaDe(b.calibracao.dataCalibracao) ?? 0) - (diaDe(a.calibracao.dataCalibracao) ?? 0));
}

/** Rótulo curto de uma opção, para a lista do celular. */
export function rotuloOpcao(o: OpcaoCalibracao): string {
  const c = o.calibracao;
  const quem = ehTerceiro(c) ? c.laboratorio : 'interna';
  return `${o.componente?.nome || c.nome || definicaoDe(c.tipo).curto} · ${c.numeroCertificado || 's/ nº'} · ${quem}`;
}
