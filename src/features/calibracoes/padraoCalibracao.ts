import type { RefFoto } from '../../services/fotos';
import {
  listarRastreabilidadesAtivas,
  listarRastreabilidades,
  tipoPadraoDoCertificado,
  type Rastreabilidade,
} from '../relatorios/rastreabilidadeService';

/** aaaa-mm-dd (input date) → dd/mm/aaaa; o resto passa intacto. */
function dataBr(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * Reestruturação de Calibrações (19/09/2026) · o PADRÃO utilizado.
 *
 * A fonte é a oficial: o cadastro de **Certificados** (`nr13_rastreab_<id>`).
 * Não há cadastro paralelo de padrão. Cada gravação ali cria uma VERSÃO nova
 * (id novo, a anterior marcada `substituidoEm`), então o id guardado na
 * calibração (`padraoId`) já aponta para o certificado da época.
 *
 * Na calibração o usuário só ESCOLHE; instrumento, série, nº do certificado e
 * validade são derivados e gravados como snapshot nos campos que o template
 * sempre leu (`padraoInst/Serie/Cert/Val`). Renovar o certificado do padrão
 * depois não altera calibração nenhuma.
 */
export interface SnapshotPadrao {
  padraoId: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  /** O PDF exato daquela versão do certificado, quando ele está no bucket. */
  padraoPdfRef?: RefFoto;
}

/** Padrões ATIVOS compatíveis com o certificado (manômetro → manômetro, PSV → válvula). */
export function padroesCompativeis(tipoCalibracao: 'manometro' | 'psv'): Rastreabilidade[] {
  const tipo = tipoPadraoDoCertificado(tipoCalibracao);
  return listarRastreabilidadesAtivas().filter((r) => r.tipoInstrumento === tipo);
}

/** Um só compatível: pré-selecionado. Vários: o usuário escolhe. Nenhum: nada. */
export function padraoInicial(tipoCalibracao: 'manometro' | 'psv'): Rastreabilidade | null {
  const lista = padroesCompativeis(tipoCalibracao);
  return lista.length === 1 ? lista[0] : null;
}

export function snapshotPadrao(r: Rastreabilidade): SnapshotPadrao {
  return {
    padraoId: r.id,
    padraoInst: [r.nome, r.aparelho].filter((x) => (x ?? '').trim() !== '').join(' — '),
    padraoSerie: r.numeroSerie ?? '',
    padraoCert: r.certificadoPadrao ?? '',
    padraoVal: dataBr(r.validade),
    ...(r.pdfRef?.path ? { padraoPdfRef: r.pdfRef } : {}),
  };
}

/** O registro (inclusive versão substituída) pelo id — para "Ver certificado". */
export function padraoPorId(id: string | undefined | null): Rastreabilidade | null {
  if (!id) return null;
  return listarRastreabilidades().find((r) => r.id === id) ?? null;
}

export type SituacaoValidade = 'valido' | 'vence_em_breve' | 'vencido' | 'sem_validade';

/** Aviso — não bloqueio: o sistema não tinha regra de bloqueio por padrão vencido. */
export function situacaoValidade(validade: string, referencia: Date = new Date(), diasAviso = 30): SituacaoValidade {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((validade ?? '').trim());
  if (!m) return 'sem_validade';
  const val = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  const ref = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate()).getTime();
  if (val < ref) return 'vencido';
  if (val - ref <= diasAviso * 86_400_000) return 'vence_em_breve';
  return 'valido';
}
