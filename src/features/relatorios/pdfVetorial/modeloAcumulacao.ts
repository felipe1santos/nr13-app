/**
 * O ENSAIO DE ACUMULAÇÃO, como o documento o desenha (21/10/2026).
 *
 * Função PURA sobre `container.dados.acumulacao`: o modelo do relatório chama
 * com o registro do container e o código do relatório, e a folha só desenha. A
 * mesma derivação vale para a prévia, o documento avulso e a emissão — e o
 * teste a alcança sem jsPDF.
 */
import {
  dadosPadraoAcumulacao,
  instrumentoDoEnsaio,
  pressaoNasCincoUnidades,
  rastreavelAcumulacao,
  verificarAcumulacao,
  type AvisoAcumulacao,
  type DadosAcumulacao,
  type InstrumentoDoEnsaio,
} from '../../inspecoes/acumulacao';
import { normalizarFotos } from '../../inspecoes/fotosDescritas';
import type { UnidadePressao } from '../../../calc/pressaoCincoUnidades';
import type { RefFoto } from '../../../services/fotos';

export interface FotoAcumulacao {
  dataUrl: string;
  descricao: string;
  ref?: RefFoto;
  proporcao?: number;
}

export interface ModeloAcumulacao {
  /** Código do relatório + "/EA"; `null` no documento avulso, que não tem relatório. */
  rastreavel: string | null;
  dados: DadosAcumulacao;
  instrumento: InstrumentoDoEnsaio;
  /** As cinco células da pressão máxima; `null` sem pressão digitada. */
  pressao: Record<UnidadePressao, string> | null;
  /** Os mesmos avisos do formulário — o documento os conhece, a folha decide o que imprime. */
  avisos: AvisoAcumulacao[];
  fotos: FotoAcumulacao[];
}

/** `aaaa-mm-dd` → `dd/mm/aaaa`; o resto passa intacto. */
export function dataBrIso(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

export function modeloAcumulacao(
  bruto: unknown,
  codigoRelatorio: string | null | undefined,
  pmtaMpa: number | null,
): ModeloAcumulacao | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const dados: DadosAcumulacao = { ...dadosPadraoAcumulacao(''), ...(bruto as Partial<DadosAcumulacao>) };
  return {
    rastreavel: rastreavelAcumulacao(codigoRelatorio),
    dados,
    instrumento: instrumentoDoEnsaio(dados),
    pressao: pressaoNasCincoUnidades(dados),
    avisos: verificarAcumulacao(dados, { pmtaMpa }),
    fotos: normalizarFotos(dados.fotos)
      .map((f) => ({ dataUrl: String(f.base64 ?? ''), descricao: f.descricao ?? '', ...(f.ref ? { ref: f.ref } : {}) }))
      .filter((f) => f.dataUrl.startsWith('data:image') || !!f.ref),
  };
}
