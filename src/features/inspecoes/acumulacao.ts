/**
 * ENSAIO DE ACUMULAÇÃO — o modelo, o preenchimento e as regras (21/10/2026).
 *
 * Só existe para CALDEIRA (no sistema, toda caldeira é flamotubular). Mora no
 * container de inspeção, em `dados.acumulacao`, pelo mesmo
 * `salvarDadosFormulario` dos outros ensaios — nenhuma chave nova: a
 * sincronização, a exclusão do equipamento e o Duplicar relatório (que aponta
 * para o mesmo container) já o alcançam.
 *
 * O que está aqui é PURO, para o teste alcançar sem DOM:
 * - `dadosPadraoAcumulacao`: o registro vazio, com os padrões do laudo de
 *   referência (POP-TP-003, NBR 12177 / NR-13, laudo de aprovação);
 * - `prefillAcumulacao`: o que vem da ficha e do cliente, sem redigitar;
 * - `instrumentoDoEnsaio`: a calibração escolhida vence o que foi digitado;
 * - `verificarAcumulacao`: erros (impedem finalizar) e alertas (só avisam);
 * - `rastreavelAcumulacao`: o nº rastreável é o do relatório + "/EA".
 *
 * NÃO reproduz os erros do PDF de referência: lá a validade da calibração era
 * anterior ao ensaio sem aviso nenhum (aqui vira alerta) e a página de fotos
 * levava o rastreável de OUTRO ensaio (aqui o rastreável é um só, derivado).
 */
import type { EmpresaEquipamento, InfoEquipamento } from '../equipamento/tipos';
import type { RefInstrumentoChecklist } from '../calibracoes/quadroInstrumentos';
import { diaDe } from '../calibracoes/quadroInstrumentos';
import {
  deMpaPara,
  ehUnidadePressao,
  emCincoUnidades,
  formatarPressao,
  paraMpaDe,
  type UnidadePressao,
} from '../../calc/pressaoCincoUnidades';
import type { ResultadoEnsaioValor } from './formularios/ResultadoEnsaio';
import type { FotoDescrita } from './fotosDescritas';

export type SimNao = '' | 'sim' | 'nao';

export interface DadosAcumulacao {
  // Dados gerais
  contratante: string;
  endereco: string;
  /** ISO `aaaa-mm-dd` — o `<input type="date">`. */
  dataEnsaio: string;
  // Aspectos gerais do equipamento (da ficha)
  identificacao: string;
  serie: string;
  tipoEquipamento: string;
  fabricante: string;
  // Parâmetros do ensaio
  procedimento: string;
  normas: string;
  // Instrumento — a calibração vinculada vence os campos digitados
  instrumentoRef?: RefInstrumentoChecklist;
  instrumento: string;
  instrumentoFabricante: string;
  instrumentoTipo: string;
  instrumentoIdentificacao: string;
  instrumentoEscala: string;
  /** `aaaa-mm-dd` ou `dd/mm/aaaa`. */
  instrumentoValidade: string;
  // Dados do teste
  tempoEstabilizacaoMin: string;
  horaInicio: string;
  horaTermino: string;
  /** O número como o técnico digitou, na unidade de `pressaoUnidade`. */
  pressaoMaxima: string;
  pressaoUnidade: UnidadePressao;
  valvulasSuficientes: SimNao;
  ncEncontrada: SimNao;
  justificativaNc: string;
  // Laudo e registro
  laudo: string;
  resultado: ResultadoEnsaioValor;
  observacoes: string;
  fotos: FotoDescrita[];
}

export const PROCEDIMENTO_PADRAO = 'POP-TP-003';
export const NORMAS_PADRAO = 'NBR 12177 / NR-13';
export const LAUDO_PADRAO = 'Equipamento aprovado no ensaio de acumulação.';
/** ASME Seção I, PG-67.2: acumulação de no máximo 6% acima da PMTA. */
export const FATOR_LIMITE_ACUMULACAO = 1.06;

export function dadosPadraoAcumulacao(hojeIso = new Date().toISOString().slice(0, 10)): DadosAcumulacao {
  return {
    contratante: '',
    endereco: '',
    dataEnsaio: hojeIso,
    identificacao: '',
    serie: '',
    tipoEquipamento: '',
    fabricante: '',
    procedimento: PROCEDIMENTO_PADRAO,
    normas: NORMAS_PADRAO,
    instrumento: 'Manômetro',
    instrumentoFabricante: '',
    instrumentoTipo: '',
    instrumentoIdentificacao: '',
    instrumentoEscala: '',
    instrumentoValidade: '',
    tempoEstabilizacaoMin: '',
    horaInicio: '',
    horaTermino: '',
    pressaoMaxima: '',
    pressaoUnidade: 'bar',
    valvulasSuficientes: '',
    ncEncontrada: '',
    justificativaNc: '',
    laudo: LAUDO_PADRAO,
    resultado: '',
    observacoes: '',
    fotos: [],
  };
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

const ROTULO_TIPO: Record<string, string> = { caldeira: 'Caldeira', vaso: 'Vaso de Pressão', autoclave: 'Autoclave' };

/** "Caldeira Flamotubular" — o tipo e o subtipo do cadastro, como o laudo de referência escreve. */
export function tipoDoEquipamento(info: InfoEquipamento | null): string | null {
  if (!info) return null;
  const tipo = ROTULO_TIPO[info.tipo] ?? texto(info.tipo);
  const sub = texto(info.subtipo);
  const subRot = sub ? sub.charAt(0).toLocaleUpperCase('pt-BR') + sub.slice(1) : null;
  return [tipo, subRot].filter(Boolean).join(' ') || null;
}

function enderecoCliente(emp: EmpresaEquipamento | null): string | null {
  if (!emp) return null;
  const cidade = texto(emp.cidade) ?? texto(emp.localidade);
  const cidadeUf = cidade && texto(emp.estado) ? `${cidade}/${texto(emp.estado)}` : cidade;
  const partes = [texto(emp.endereco), texto(emp.bairro), cidadeUf].filter((p): p is string => p !== null);
  return partes.length ? partes.join(', ') : null;
}

/**
 * O que a ficha e o cadastro do cliente já sabem. Recebe os registros, não lê
 * storage: a tela lê, o teste entrega.
 */
export function prefillAcumulacao(
  tag: string,
  info: InfoEquipamento | null,
  emp: EmpresaEquipamento | null,
): Partial<DadosAcumulacao> {
  const saida: Partial<DadosAcumulacao> = {};
  const por = (k: keyof DadosAcumulacao, v: string | null) => {
    if (v !== null) (saida as Record<string, unknown>)[k] = v;
  };
  por('contratante', texto(emp?.razaoSocial) ?? texto(emp?.nomeFantasia));
  por('endereco', enderecoCliente(emp));
  por('identificacao', texto(tag));
  por('serie', texto(info?.numeroSerie));
  por('tipoEquipamento', tipoDoEquipamento(info));
  por('fabricante', texto(info?.fabricante));
  return saida;
}

export interface InstrumentoDoEnsaio {
  instrumento: string;
  fabricante: string;
  tipo: string;
  identificacao: string;
  escala: string;
  validade: string;
  /** Veio de uma calibração registrada (snapshot), não de digitação. */
  vinculado: boolean;
}

/**
 * O instrumento que vai para o laudo. Com calibração vinculada, os dados vêm do
 * SNAPSHOT guardado no ensaio (nunca do registro vivo — mesma regra do quadro
 * 7.1.1); o que o snapshot não tem (o tipo, ex.: "Analógico") fica com o
 * digitado.
 */
export function instrumentoDoEnsaio(d: DadosAcumulacao): InstrumentoDoEnsaio {
  const s = d.instrumentoRef?.snapshot;
  if (s) {
    const escala = [texto(s.faixa), texto(s.unidade)].filter(Boolean).join(' ');
    return {
      instrumento: texto(s.instrumento) ?? d.instrumento,
      fabricante: texto(s.fabricante) ?? d.instrumentoFabricante,
      tipo: d.instrumentoTipo,
      identificacao: texto(s.serie) ?? d.instrumentoIdentificacao,
      escala: escala || d.instrumentoEscala,
      validade: texto(s.validade) ?? d.instrumentoValidade,
      vinculado: true,
    };
  }
  return {
    instrumento: d.instrumento,
    fabricante: d.instrumentoFabricante,
    tipo: d.instrumentoTipo,
    identificacao: d.instrumentoIdentificacao,
    escala: d.instrumentoEscala,
    validade: d.instrumentoValidade,
    vinculado: false,
  };
}

/** "10,80" ou "10.80" → 10.8. Só positivos. */
export function numeroDigitado(v: unknown): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A pressão máxima atingida em MPa — o valor técnico de toda comparação. */
export function pressaoMaximaMpa(d: Pick<DadosAcumulacao, 'pressaoMaxima' | 'pressaoUnidade'>): number | null {
  const n = numeroDigitado(d.pressaoMaxima);
  if (n === null) return null;
  return paraMpaDe(n, ehUnidadePressao(d.pressaoUnidade) ? d.pressaoUnidade : 'bar');
}

/** As cinco células do laudo (MPa, kPa, psi, kgf/cm², bar), já formatadas. */
export function pressaoNasCincoUnidades(
  d: Pick<DadosAcumulacao, 'pressaoMaxima' | 'pressaoUnidade'>,
): Record<UnidadePressao, string> | null {
  const unidade = ehUnidadePressao(d.pressaoUnidade) ? d.pressaoUnidade : 'bar';
  const todas = emCincoUnidades(numeroDigitado(d.pressaoMaxima), unidade);
  if (!todas) return null;
  return Object.fromEntries(
    (Object.keys(todas) as UnidadePressao[]).map((u) => [u, formatarPressao(todas[u], u)]),
  ) as Record<UnidadePressao, string>;
}

/** `HH:MM` → minutos do dia. */
function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

export interface AvisoAcumulacao {
  campo: keyof DadosAcumulacao | 'instrumento';
  /** `erro` impede finalizar o relatório; `alerta` só avisa — a decisão é do PLH. */
  nivel: 'erro' | 'alerta';
  texto: string;
}

export interface ContextoAcumulacao {
  /** PMTA do documento (adotada ?? calculada), em MPa. */
  pmtaMpa: number | null;
}

/**
 * As regras do ensaio.
 *
 * ERROS — o laudo sairia contraditório:
 * - término não posterior ao início;
 * - não conformidade marcada "sim" sem justificativa.
 *
 * ALERTAS — informação técnica para o engenheiro, NUNCA bloqueio:
 * - pressão máxima acima de 1,06 × PMTA (ASME Seção I, PG-67.2). A comparação
 *   é sobre o valor técnico em MPa, não sobre o texto formatado;
 * - calibração do instrumento vencida na data do ensaio — o erro que o laudo de
 *   referência tinha e ninguém viu.
 */
export function verificarAcumulacao(d: DadosAcumulacao, ctx: ContextoAcumulacao): AvisoAcumulacao[] {
  const avisos: AvisoAcumulacao[] = [];

  const ini = minutos(d.horaInicio);
  const fim = minutos(d.horaTermino);
  if (ini !== null && fim !== null && fim <= ini) {
    avisos.push({ campo: 'horaTermino', nivel: 'erro', texto: 'O término do ensaio deve ser depois do início.' });
  }

  if (d.ncEncontrada === 'sim' && !texto(d.justificativaNc)) {
    avisos.push({
      campo: 'justificativaNc',
      nivel: 'erro',
      texto: 'Foi marcada não conformidade: descreva a justificativa.',
    });
  }

  const pMax = pressaoMaximaMpa(d);
  if (pMax !== null && ctx.pmtaMpa !== null && ctx.pmtaMpa > 0) {
    const limite = ctx.pmtaMpa * FATOR_LIMITE_ACUMULACAO;
    if (pMax > limite) {
      const u: UnidadePressao = ehUnidadePressao(d.pressaoUnidade) ? d.pressaoUnidade : 'bar';
      avisos.push({
        campo: 'pressaoMaxima',
        nivel: 'alerta',
        texto:
          `A pressão máxima atingida (${formatarPressao(deMpaPara(pMax, u), u)} ${u}) passou de 106% da PMTA ` +
          `(limite ${formatarPressao(deMpaPara(limite, u), u)} ${u}). O ASME Seção I, PG-67.2, limita a ` +
          'acumulação a 6% acima da PMTA. A decisão sobre a suficiência das válvulas é do Profissional ' +
          'Legalmente Habilitado.',
      });
    }
  }

  const inst = instrumentoDoEnsaio(d);
  const val = diaDe(inst.validade);
  const dia = diaDe(d.dataEnsaio);
  if (val !== null && dia !== null && val < dia) {
    avisos.push({
      campo: 'instrumento',
      nivel: 'alerta',
      texto: 'A validade da calibração do instrumento é ANTERIOR à data do ensaio.',
    });
  }

  return avisos;
}

/**
 * O nº rastreável do ensaio: o código do RELATÓRIO + "/EA" (decisão de
 * 21/10/2026, opção A). Sem relatório — o documento avulso do ensaio — não há
 * número: inventar um afirmaria uma emissão que não existe.
 */
export function rastreavelAcumulacao(codigoRelatorio: string | null | undefined): string | null {
  const c = texto(codigoRelatorio);
  return c ? `${c}/EA` : null;
}

/** O ensaio tem conteúdo? Mesma pergunta que o resumo do container faz aos outros. */
export function acumulacaoPreenchida(d: Partial<DadosAcumulacao> | null | undefined): boolean {
  if (!d) return false;
  return (
    numeroDigitado(d.pressaoMaxima) !== null ||
    !!texto(d.horaInicio) ||
    !!texto(d.tempoEstabilizacaoMin) ||
    d.valvulasSuficientes === 'sim' ||
    d.valvulasSuficientes === 'nao' ||
    (Array.isArray(d.fotos) && d.fotos.length > 0)
  );
}
