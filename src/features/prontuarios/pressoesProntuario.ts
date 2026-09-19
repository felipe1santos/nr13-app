import { formatarValor, type SistemaUnidade } from '../../calc/unidades';
import { pressaoDeProjetoMpa } from '../memorial/pressaoProjeto';

/**
 * Revisão do engenheiro, fase 2 (18/09/2026) · as QUATRO pressões do prontuário,
 * cada uma da sua fonte — a mesma regra do teste hidrostático
 * (`memorial/pressaoProjeto.ts`).
 *
 * | campo do prontuário | antes | agora |
 * |---|---|---|
 * | PRESSÃO DE PROJETO | a PMTA **calculada** | `pressaoDeProjetoMpa` — o `P` do memorial |
 * | PRESSÃO MÁX. DE OPERAÇÃO | a PMTA **calculada** | a PMO adotada na ficha (`pmoAdotadaMpa`) |
 * | PMTA | a PMTA calculada | adotada ?? calculada (a precedência oficial, §3-bis) |
 * | PRESSÃO DE TH | a PTH calculada | adotada ?? calculada |
 *
 * Pressão de projeto é a pressão para a qual o equipamento foi projetado; a PMTA
 * sai do cálculo e pode ser maior ou menor que ela; a PMO é a pressão máxima de
 * operação, declarada. Nenhuma substitui outra — sem fonte, o campo fica vazio.
 *
 * Os valores saem na unidade FIXA do equipamento (§4), com rótulo, pelo helper
 * oficial `formatarValor` — o mesmo que o prontuário já usava.
 */
export interface PressoesProntuario {
  pressaoProjeto: string;
  pressaoMaxOp: string;
  pmta: string;
  pressaoTH: string;
  /**
   * O texto que o preenchimento ANTIGO punha em "pressão de projeto" e "pressão
   * máx. de operação": a PMTA calculada formatada. Um prontuário em rascunho que
   * ainda carrega exatamente esse texto não tem pressão de projeto informada —
   * tem a PMTA com o nome errado, e o preenchimento novo o substitui.
   */
  legadoPmtaComoProjeto: string | null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function pressoesDoProntuario(
  tag: string,
  info: { pmtaAdotadaMpa?: unknown; pmoAdotadaMpa?: unknown; pthAdotadaMpa?: unknown } | null | undefined,
  calculo: { pmta?: unknown; pth?: unknown } | null | undefined,
  unidade: SistemaUnidade,
): PressoesProntuario {
  const fmt = (mpa: number | null) => (mpa === null ? '' : formatarValor(mpa, unidade));
  const pmtaCalc = numero(calculo?.pmta);
  return {
    pressaoProjeto: fmt(pressaoDeProjetoMpa(tag)),
    pressaoMaxOp: fmt(numero(info?.pmoAdotadaMpa)),
    pmta: fmt(numero(info?.pmtaAdotadaMpa) ?? pmtaCalc),
    pressaoTH: fmt(numero(info?.pthAdotadaMpa) ?? numero(calculo?.pth)),
    legadoPmtaComoProjeto: pmtaCalc === null ? null : formatarValor(pmtaCalc, unidade),
  };
}

/**
 * O valor SALVO de um campo de pressão ainda é o preenchimento antigo (a PMTA)?
 * Então ele não vence o preenchimento novo no merge — só nesses dois campos, e só
 * quando o texto é idêntico ao que o sistema antigo gerava.
 */
export function ehPmtaDoPreenchimentoAntigo(
  campo: string,
  valorSalvo: unknown,
  p: PressoesProntuario,
): boolean {
  if (campo !== 'pressaoProjeto' && campo !== 'pressaoMaxOp') return false;
  return p.legadoPmtaComoProjeto !== null && String(valorSalvo ?? '').trim() === p.legadoPmtaComoProjeto;
}
