/**
 * O PERFIL DO EQUIPAMENTO — o que muda de um tipo para outro, num lugar só
 * (21/10/2026).
 *
 * Caldeira (no sistema, toda caldeira é flamotubular) ganhou o Ensaio de
 * Acumulação e, a seguir, o relatório próprio. A REGRA DE OURO é que vaso e
 * autoclave não mudem nada — nem comportamento, nem layout, nem dado. Por isso
 * as telas e o relatório perguntam AQUI "quais ensaios este tipo oferece?" e
 * "quais folhas este tipo tem?", em vez de cada uma ter o seu
 * `if (tipo === 'caldeira')`.
 *
 * Para vaso e autoclave as respostas são as MESMAS listas de sempre — o mesmo
 * objeto, não uma cópia —, e `naoRegressaoTipos.test.ts` confere byte a byte
 * que o documento deles não mudou.
 */
import { ler } from '../../services/storage';
import {
  ENSAIOS_DISPONIVEIS,
  ENSAIO_ACUMULACAO,
  ENSAIO_ALIMENTACAO_AGUA,
  ENSAIO_VERIFICACAO_CALDEIRA,
  type TipoEnsaio,
} from '../inspecoes/tipos';
import { DOCUMENTOS_DISPONIVEIS } from '../relatorios/tipos';
import type { InfoEquipamento, TipoEquipamento } from './tipos';

export const FOLHA_ACUMULACAO = 'ENSAIO-ACUMULACAO.html';

const ENSAIOS_CALDEIRA: { value: TipoEnsaio; label: string }[] = [
  ...ENSAIOS_DISPONIVEIS,
  ENSAIO_ACUMULACAO,
  // 23/11/2026 · itens da NR-13 de caldeira → 13.4.4.12 i) na folha 1.3.
  ENSAIO_VERIFICACAO_CALDEIRA,
  // 23/11/2026 · dispositivos de alimentação de água e controle de nível (13.4.1.2 c/e).
  ENSAIO_ALIMENTACAO_AGUA,
];

/**
 * As folhas do relatório de CALDEIRA, na ordem do sumário da referência (Rodada
 * 2, 22/10/2026). As `CALD-*` só existem no gerador vetorial
 * (`gerarRelatorioCaldeira`); as demais são as mesmas folhas de sempre, com os
 * títulos e a numeração da caldeira. Certificados entram pela escolha de
 * calibrações do assistente, como em qualquer relatório.
 */
export const DOCUMENTOS_CALDEIRA: readonly string[] = [
  'CAPA.html',
  'SUMARIO.html',
  'CALD-PRONTUARIO.html',
  'CALD-ACESSORIOS.html',
  'CALD-RELATORIO-INSPECAO.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-INTERNO.html',
  'CALD-CALCULOS.html',
  'ULTRASSOM.html',
  FOLHA_ACUMULACAO,
  // 23/11/2026 · 2.3, só vetorial.
  'CALD-ALIMENTACAO-AGUA.html',
  'TESTE-HIDROSTATICO.html',
  'LIVRO-REGISTRO.html',
  // 23/11/2026 · seção 8, no fim: o Relatório de Imagens da inspeção.
  'RELATORIO-IMAGENS.html',
  // 23/11/2026 · fotos da documentação e do checklist da inspeção, também na
  // seção 8 — antes o checklist da caldeira não tinha onde sair.
  'CALD-FOTOS-CHECKLIST.html',
];

export function ehCaldeira(tipo: TipoEquipamento | string | null | undefined): boolean {
  return tipo === 'caldeira';
}

/** O tipo cadastrado da TAG (`nr13_info_`). `null` quando a ficha não está no cache. */
export function tipoDaTag(tag: string): TipoEquipamento | null {
  if (!tag) return null;
  try {
    return ler<InfoEquipamento>(`nr13_info_${tag}`)?.tipo ?? null;
  } catch {
    return null;
  }
}

function numero(v: unknown): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A PMTA do documento, em MPa: a ADOTADA na ficha, senão a calculada pelo
 * memorial — a precedência oficial fora do cartão (CLAUDE.md §3-bis).
 */
export function pmtaDoDocumentoMpa(tag: string): number | null {
  if (!tag) return null;
  try {
    const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
    const calc = ler<{ pmta?: string | number }>(`nr13_calc_${tag}`);
    return numero(info?.pmtaAdotadaMpa) ?? numero(calc?.pmta);
  } catch {
    return null;
  }
}

/** Os ensaios que se pode ATRIBUIR a um container deste tipo de equipamento. */
export function ensaiosDoTipo(tipo: TipoEquipamento | string | null | undefined): { value: TipoEnsaio; label: string }[] {
  return ehCaldeira(tipo) ? ENSAIOS_CALDEIRA : ENSAIOS_DISPONIVEIS;
}

/** As folhas que o relatório deste tipo oferece, na ordem do documento. */
export function documentosDoTipo(tipo: TipoEquipamento | string | null | undefined): readonly string[] {
  return ehCaldeira(tipo) ? DOCUMENTOS_CALDEIRA : DOCUMENTOS_DISPONIVEIS;
}
