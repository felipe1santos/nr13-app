import { calcularErro } from './calibracaoService';
import type { ComponenteCal } from './componentesService';
import { definicaoDe } from './instrumentos';
import {
  clienteDoEquipamento,
  motivoPadrao,
  pontosDoComponente,
  proximaCalibracao,
  unidadeDoComponente,
} from './preencherCalibracao';
import { padraoInicial, snapshotPadrao } from './padraoCalibracao';
import { listarResponsaveis, snapshotResponsavel } from './responsavelCalibracao';
import type { DadosCalibracao, DadosManometro, DadosPSV } from './tipos';

/**
 * Reestruturação de Calibrações (19/09/2026) · O FORMULÁRIO DE UMA CALIBRAÇÃO,
 * separado em três camadas:
 *
 * | camada | fonte | na tela |
 * |---|---|---|
 * | ITEM calibrado (nome, fabricante, modelo, série, faixa, unidade) | cadastro do COMPONENTE | resumo somente leitura + "Editar componente" |
 * | PADRÃO utilizado (instrumento, série, certificado, validade) | cadastro de CERTIFICADOS (`nr13_rastreab_`) | um seletor; o resto é derivado |
 * | EVENTO (datas, ambiente, resultados, conclusão) | o usuário | os únicos campos digitados |
 *
 * O número do certificado é gerado (`CERT-<timestamp>`, o esquema que o
 * sistema sempre usou) e a data de emissão é a da EMISSÃO
 * (`emissaoCertificado.ts`) — nenhum dos dois é digitado.
 *
 * O registro gravado continua com os mesmos campos de antes (`DadosManometro`
 * / `DadosPSV`): eles SÃO o snapshot. Componente editado depois, padrão
 * renovado depois — a calibração antiga continua com o que existia na data.
 */
export interface FormDados {
  tipo: 'manometro' | 'psv';
  nome: string;
  numeroCertificado: string;
  dataEmissao: string;
  empresa: string;
  endereco: string;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  referencia: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  tempAr: string;
  umidade: string;
  local: string;
  /** O padrão escolhido (id da VERSÃO em `nr13_rastreab_`); '' = nenhum / manual. */
  padraoId: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  textoMotivo: string;
  /** Unidade das medições — vem do cadastro do componente. */
  unidade: string;
  crescente: Array<{ vc: string; vi: string }>;
  incertezaC: string;
  coefC: string;
  decrescente: Array<{ vc: string; vi: string }>;
  incertezaD: string;
  coefD: string;
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
  /** id em `nr13_lista_phs` do RESPONSÁVEL PELA CALIBRAÇÃO (fase 2, C.2). */
  responsavelId: string;
  /** Esta calibração é a REVISÃO (correção) daquela emitida (fase 2, C.3). */
  substitui?: string;
}

const hoje = () => new Date().toLocaleDateString('pt-BR');

/** Id novo de calibração — também é o que dá o número do certificado. */
export function novoIdCalibracao(): string {
  return `cal-${Date.now()}`;
}

/** Número do certificado interno: gerado, nunca digitado. */
export function numeroCertificadoNovo(agora = Date.now()): string {
  return `CERT-${agora}`;
}

export function formPadrao(tipo: 'manometro' | 'psv' = 'manometro', tag = ''): FormDados {
  const { empresa, endereco } = tag ? clienteDoEquipamento(tag) : { empresa: '', endereco: '' };
  const padrao = padraoInicial(tipo);
  const snap = padrao ? snapshotPadrao(padrao) : null;
  const h = hoje();
  return {
    tipo,
    nome: '',
    numeroCertificado: numeroCertificadoNovo(),
    dataEmissao: h,
    empresa,
    endereco,
    instrumento: '',
    fabricante: '',
    modelo: '',
    serie: '',
    referencia: '',
    dataCalibracao: h,
    // Sem valor aqui, o template mantém o próprio texto de exemplo e o
    // certificado emitido imprime literalmente "DD/MM/AAAA" como se fosse data.
    dataProxCalibracao: proximaCalibracao(h),
    tempAr: '',
    umidade: '',
    local: '',
    padraoId: snap?.padraoId ?? '',
    padraoInst: snap?.padraoInst ?? '',
    padraoSerie: snap?.padraoSerie ?? '',
    padraoCert: snap?.padraoCert ?? '',
    padraoVal: snap?.padraoVal ?? '',
    statusConclusao: '',
    textoMotivo: '',
    unidade: 'kgf/cm²',
    crescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaC: '',
    coefC: '',
    decrescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaD: '',
    coefD: '',
    pressaoAbertura: '',
    pressaoAjuste: '',
    fechamento: '',
    incerteza: '',
    coef: '',
    // Um só responsável cadastrado: é ele. Mais de um: o usuário escolhe.
    responsavelId: (() => {
      const r = listarResponsaveis();
      return r.length === 1 ? r[0].id : '';
    })(),
  };
}

/**
 * Calibração NOVA de um componente: o item vem do cadastro, a data parte da
 * data do lote (quando há), os pontos da coluna "padrão" vêm do componente.
 */
export function formDoComponente(comp: ComponenteCal, tag: string, dataLote?: string): FormDados {
  const modelo = definicaoDe(comp.tipo).modeloInterno;
  if (!modelo) throw new Error(`${definicaoDe(comp.tipo).rotulo} não tem certificado interno`);
  const base = formPadrao(modelo, tag);
  if (dataLote && dataLote.trim() !== '') {
    base.dataCalibracao = dataLote;
    base.dataProxCalibracao = proximaCalibracao(dataLote);
  }
  base.nome = comp.nome;
  base.instrumento = comp.nome;
  base.fabricante = comp.fabricante ?? '';
  base.modelo = comp.modelo ?? '';
  base.serie = comp.serie ?? '';
  base.referencia = comp.referencia ?? '';
  base.unidade = unidadeDoComponente(comp);
  // Os pontos são DEFAULT do instrumento: a calibração registra os que foram
  // executados (a coluna segue editável no modal de resultados).
  const pontos = pontosDoComponente(comp);
  if (pontos.length) {
    base.crescente = pontos.map((vc) => ({ vc, vi: '' }));
    base.decrescente = pontos.map((vc) => ({ vc, vi: '' }));
  }
  if (comp.tipo === 'psv') base.pressaoAjuste = comp.pressaoAjuste ?? '';
  return base;
}

/** O item do componente, de novo — depois de "Editar componente". Não toca no evento. */
export function aplicarComponente(form: FormDados, comp: ComponenteCal): FormDados {
  return {
    ...form,
    nome: comp.nome,
    instrumento: comp.nome,
    fabricante: comp.fabricante ?? '',
    modelo: comp.modelo ?? '',
    serie: comp.serie ?? '',
    referencia: comp.referencia ?? '',
    unidade: unidadeDoComponente(comp),
  };
}

/** Os campos de um registro já gravado, de volta ao formulário. */
function doRegistro(cal: DadosManometro | DadosPSV, tag: string): FormDados {
  const base = formPadrao(cal.tipo, tag);
  const comum: FormDados = {
    ...base,
    nome: cal.nome,
    numeroCertificado: cal.numeroCertificado,
    dataEmissao: cal.dataEmissao,
    empresa: cal.empresa,
    endereco: cal.endereco,
    instrumento: cal.instrumento,
    fabricante: cal.fabricante,
    modelo: cal.modelo,
    serie: cal.serie,
    referencia: cal.referencia,
    dataCalibracao: cal.dataCalibracao,
    dataProxCalibracao: cal.dataProxCalibracao,
    tempAr: cal.tempAr,
    umidade: cal.umidade,
    local: cal.local,
    // O padrão do registro vence o sugerido de hoje: é o que foi USADO.
    padraoId: cal.padraoId ?? '',
    padraoInst: cal.padraoInst,
    padraoSerie: cal.padraoSerie,
    padraoCert: cal.padraoCert,
    padraoVal: cal.padraoVal,
    statusConclusao: cal.statusConclusao,
    textoMotivo: cal.textoMotivo,
    unidade: cal.unidade ?? base.unidade,
    responsavelId: cal.responsavel?.id ?? '',
  };
  if (cal.tipo === 'manometro') {
    return {
      ...comum,
      crescente: cal.crescente.map((r) => ({ vc: r.vc, vi: r.vi })),
      incertezaC: cal.incertezaC,
      coefC: cal.coefC,
      decrescente: cal.decrescente.map((r) => ({ vc: r.vc, vi: r.vi })),
      incertezaD: cal.incertezaD,
      coefD: cal.coefD,
    };
  }
  return {
    ...comum,
    pressaoAbertura: cal.pressaoAbertura,
    pressaoAjuste: cal.pressaoAjuste,
    fechamento: cal.fechamento,
    incerteza: cal.incerteza,
    coef: cal.coef,
  };
}

/** Continuar um RASCUNHO: mesmo id, mesmo número reservado. */
export function formDeRascunho(cal: DadosManometro | DadosPSV, tag: string): FormDados {
  return { ...doRegistro(cal, tag), substitui: cal.substitui };
}

/**
 * REVISÃO de um emitido (ou de um registro antigo): registro NOVO, o emitido
 * continua intacto. O nº ganha sufixo de revisão.
 */
export function formDeRevisao(cal: DadosManometro | DadosPSV, tag: string): FormDados {
  const f = doRegistro(cal, tag);
  const n = (cal.numeroCertificado || 'CERT').replace(/-R\d+$/, '');
  const rev = Number(/-R(\d+)$/.exec(cal.numeroCertificado || '')?.[1] ?? 0) + 1;
  return { ...f, numeroCertificado: `${n}-R${rev}`, dataEmissao: hoje(), substitui: cal.id };
}

function responsavelDoForm(form: FormDados) {
  const f = listarResponsaveis().find((x) => x.id === form.responsavelId);
  return f ? snapshotResponsavel(f) : null;
}

/** O que falta para salvar — datas no formato certo. */
export function faltasDoForm(form: FormDados): string[] {
  const out: string[] = [];
  const data = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!data.test(form.dataCalibracao)) out.push('data da calibração');
  if (!data.test(form.dataProxCalibracao)) out.push('data da próxima calibração');
  return out;
}

export function converterForm(form: FormDados, tag: string, id: string): DadosCalibracao {
  const resp = responsavelDoForm(form);
  const base = {
    id,
    tag,
    nome: form.nome || (form.tipo === 'manometro' ? 'Manômetro' : 'Válvula de Segurança'),
    criadoEm: hoje(),
    numeroCertificado: form.numeroCertificado,
    dataEmissao: form.dataEmissao,
    empresa: form.empresa,
    endereco: form.endereco,
    instrumento: form.instrumento || form.nome,
    fabricante: form.fabricante,
    modelo: form.modelo,
    serie: form.serie,
    referencia: form.referencia,
    dataCalibracao: form.dataCalibracao,
    dataProxCalibracao: form.dataProxCalibracao,
    tempAr: form.tempAr,
    umidade: form.umidade,
    local: form.local,
    ...(form.padraoId ? { padraoId: form.padraoId } : {}),
    padraoInst: form.padraoInst,
    padraoSerie: form.padraoSerie,
    padraoCert: form.padraoCert,
    padraoVal: form.padraoVal,
    statusConclusao: form.statusConclusao,
    // Status escolhido e motivo em branco fechava a frase da conclusão em "o
    // mesmo", sem ponto final — o texto padrão é o MESMO do seletor da folha.
    textoMotivo: form.textoMotivo.trim() || motivoPadrao(form.statusConclusao),
    unidade: form.unidade,
    origem: 'interna' as const,
    status: 'rascunho' as const,
    ...(resp ? { responsavel: resp } : {}),
    ...(form.substitui ? { substitui: form.substitui } : {}),
  };

  if (form.tipo === 'manometro') {
    return {
      ...base,
      tipo: 'manometro',
      crescente: form.crescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaC: form.incertezaC,
      coefC: form.coefC,
      decrescente: form.decrescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaD: form.incertezaD,
      coefD: form.coefD,
    } as DadosManometro;
  }
  return {
    ...base,
    tipo: 'psv',
    pressaoAbertura: form.pressaoAbertura,
    pressaoAjuste: form.pressaoAjuste,
    fechamento: form.fechamento,
    incerteza: form.incerteza,
    coef: form.coef,
  } as DadosPSV;
}
