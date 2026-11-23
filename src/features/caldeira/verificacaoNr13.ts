/**
 * VERIFICAÇÃO NR-13 DA CALDEIRA (23/11/2026) — ensaio só de caldeira.
 *
 * As perguntas são os itens da NR-13 vigente (Portarias MTP 1.846/2022 e
 * 4.219/2022) que valem para caldeira e que se conferem em campo. Cada "NÃO
 * ATENDE" vira, no relatório, uma linha de "Itens da NR-13 não atendidos" —
 * exigência do 13.4.4.12 i) ("relação dos itens desta NR, relativos a
 * caldeiras, que não estão sendo atendidos").
 *
 * Resposta: 'sim' (atende) · 'nao' (não atende) · 'na' (não se aplica). Vazio =
 * não verificado — o relatório NÃO trata não verificado como atendido.
 *
 * Gravado no container como `dados.nr13_caldeira` = `{ respostas: {id: ...},
 * observacoes: {id: texto} }`. Ids estáveis: mudar o texto de uma pergunta não
 * pode reinterpretar resposta antiga.
 */

export type RespostaNr13 = 'sim' | 'nao' | 'na';

export interface ItemVerificacaoNr13 {
  id: string;
  /** Item da norma, como sai no relatório. */
  item: string;
  texto: string;
  /** Só faz sentido para categoria A / B / combustível sólido etc. — dica na tela. */
  condicao?: string;
}

export interface GrupoVerificacaoNr13 {
  id: string;
  titulo: string;
  itens: ItemVerificacaoNr13[];
}

export const CATALOGO_NR13_CALDEIRA = 'nr13-caldeira-2022-1';

export const GRUPOS_NR13_CALDEIRA: GrupoVerificacaoNr13[] = [
  {
    id: 'dispositivos',
    titulo: 'Dispositivos obrigatórios (13.4.1.2)',
    itens: [
      { id: 'disp_valvula', item: '13.4.1.2 a)', texto: 'Válvula de segurança com pressão de abertura ajustada em valor igual ou inferior à PMTA' },
      { id: 'disp_indicador', item: '13.4.1.2 b)', texto: 'Instrumento que indique a pressão do vapor acumulado' },
      { id: 'disp_injetor', item: '13.4.1.2 c)', texto: 'Injetor ou sistema de alimentação de água independente do principal', condicao: 'Combustível sólido não atomizado ou queima em suspensão' },
      { id: 'disp_drenagem', item: '13.4.1.2 d)', texto: 'Sistema dedicado de drenagem rápida de água', condicao: 'Caldeira de recuperação de álcalis' },
      { id: 'disp_nivel', item: '13.4.1.2 e)', texto: 'Sistema automático de controle do nível de água com intertravamento contra superaquecimento por alimentação deficiente' },
    ],
  },
  {
    id: 'identificacao',
    titulo: 'Identificação (13.4.1.3 e 13.4.1.4)',
    itens: [
      { id: 'placa', item: '13.4.1.3', texto: 'Placa de identificação indelével, visível e de fácil acesso, com fabricante, nº de ordem, ano de fabricação, PMTA, capacidade de vapor, área de superfície de aquecimento e código de construção/ano' },
      { id: 'categoria_visivel', item: '13.4.1.4', texto: 'Categoria da caldeira e seu número ou código de identificação em local visível' },
    ],
  },
  {
    id: 'documentacao',
    titulo: 'Documentação no estabelecimento (13.4.1.5)',
    itens: [
      { id: 'doc_prontuario', item: '13.4.1.5 a)', texto: 'Prontuário da caldeira (do fabricante ou reconstituído — 13.4.1.6)' },
      { id: 'doc_registro', item: '13.4.1.5 b)', texto: 'Registro de segurança' },
      { id: 'doc_instalacao', item: '13.4.1.5 c)', texto: 'Projeto de instalação' },
      { id: 'doc_alteracao', item: '13.4.1.5 d)', texto: 'Projeto de alteração ou reparo', condicao: 'Quando houve alteração ou reparo' },
      { id: 'doc_relatorios', item: '13.4.1.5 e)', texto: 'Relatórios de inspeção de segurança' },
      { id: 'doc_certificados', item: '13.4.1.5 f)', texto: 'Certificados de inspeção e teste dos dispositivos de segurança' },
    ],
  },
  {
    id: 'instalacao',
    titulo: 'Instalação — casa ou área de caldeiras (13.4.2)',
    itens: [
      { id: 'inst_local', item: '13.4.2.2', texto: 'Instalada em local específico (casa de caldeiras ou área de caldeiras)' },
      { id: 'inst_afastamento', item: '13.4.2.3 a) / 13.4.2.4 a)', texto: 'Afastamento mínimo de 3 m de outras instalações, depósitos de combustível, limite de terceiros e vias públicas (ou projeto alternativo — 13.4.2.5)' },
      { id: 'inst_saidas', item: '13.4.2.3 b) / 13.4.2.4 b)', texto: 'Pelo menos duas saídas amplas, desobstruídas, sinalizadas e em direções distintas' },
      { id: 'inst_ventilacao', item: '13.4.2.4 c)', texto: 'Ventilação permanente com entradas de ar que não possam ser bloqueadas', condicao: 'Ambiente fechado' },
      { id: 'inst_gas', item: '13.4.2.4 d)', texto: 'Sensor para detecção de vazamento de gás', condicao: 'Combustível gasoso, ambiente fechado' },
      { id: 'inst_finalidade', item: '13.4.2.4 e)', texto: 'Casa de caldeiras não utilizada para outra finalidade', condicao: 'Ambiente fechado' },
      { id: 'inst_acesso', item: '13.4.2.3 c) / 13.4.2.4 f)', texto: 'Acesso fácil e seguro para operação e manutenção (guarda-corpos que impeçam queda)' },
      { id: 'inst_gases', item: '13.4.2.3 d) / 13.4.2.4 g)', texto: 'Captação e lançamento dos gases e material particulado para fora da área de operação' },
      { id: 'inst_iluminacao', item: '13.4.2.3 e) f) / 13.4.2.4 h)', texto: 'Iluminação conforme normas e iluminação de emergência' },
      { id: 'inst_painel', item: '13.4.2.6', texto: 'Painel de instrumentos instalado em sala de controle', condicao: 'Categoria A' },
    ],
  },
  {
    id: 'operacao',
    titulo: 'Segurança na operação (13.4.3)',
    itens: [
      { id: 'op_manual', item: '13.4.3.1', texto: 'Manual de operação atualizado, em português, de fácil acesso, com partida/parada, rotina, emergência e segurança' },
      { id: 'op_agua', item: '13.4.3.2', texto: 'Qualidade da água controlada e tratada conforme parâmetros do fabricante' },
      { id: 'op_operador', item: '13.4.3.3 / 13.4.3.4', texto: 'Operação e controle por operador de caldeira capacitado (Anexo I, item 1.1)' },
    ],
  },
  {
    id: 'valvulas',
    titulo: 'Válvulas de segurança (13.4.4.7 e 13.4.4.8)',
    itens: [
      { id: 'val_manutencao', item: '13.4.4.7', texto: 'Válvulas desmontadas, inspecionadas e testadas em prazo não superior ao da inspeção periódica' },
      { id: 'val_alavanca', item: '13.4.4.8', texto: 'Teste periódico por acionamento manual da alavanca (mensal sem tratamento de água; conforme fabricante com água tratada)', condicao: 'Categoria B' },
    ],
  },
];

export const TODOS_ITENS_NR13_CALDEIRA: ItemVerificacaoNr13[] = GRUPOS_NR13_CALDEIRA.flatMap((g) => g.itens);

export interface DadosVerificacaoNr13 {
  catalogo?: string;
  respostas: Record<string, RespostaNr13 | undefined>;
  observacoes: Record<string, string | undefined>;
}

export function dadosPadraoVerificacaoNr13(): DadosVerificacaoNr13 {
  return { catalogo: CATALOGO_NR13_CALDEIRA, respostas: {}, observacoes: {} };
}

/** Normaliza o que veio do container (pode ser parcial, antigo ou lixo). */
export function normalizarVerificacaoNr13(bruto: unknown): DadosVerificacaoNr13 {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<DadosVerificacaoNr13>;
  const respostas: Record<string, RespostaNr13> = {};
  for (const [k, v] of Object.entries(b.respostas ?? {})) if (v === 'sim' || v === 'nao' || v === 'na') respostas[k] = v;
  const observacoes: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.observacoes ?? {})) if (typeof v === 'string' && v.trim()) observacoes[k] = v;
  return { catalogo: b.catalogo ?? CATALOGO_NR13_CALDEIRA, respostas, observacoes };
}

export interface ResumoVerificacaoNr13 {
  total: number;
  respondidos: number;
  atende: number;
  naoAtende: number;
  naoSeAplica: number;
}

export function resumoVerificacaoNr13(bruto: unknown): ResumoVerificacaoNr13 {
  const d = normalizarVerificacaoNr13(bruto);
  const r = { total: TODOS_ITENS_NR13_CALDEIRA.length, respondidos: 0, atende: 0, naoAtende: 0, naoSeAplica: 0 };
  for (const it of TODOS_ITENS_NR13_CALDEIRA) {
    const v = d.respostas[it.id];
    if (!v) continue;
    r.respondidos++;
    if (v === 'sim') r.atende++;
    else if (v === 'nao') r.naoAtende++;
    else r.naoSeAplica++;
  }
  return r;
}

export function verificacaoNr13Preenchida(bruto: unknown): boolean {
  return resumoVerificacaoNr13(bruto).respondidos > 0;
}

export interface ItemNaoAtendido {
  item: string;
  texto: string;
  observacao: string | null;
}

/** 13.4.4.12 i): os itens marcados "não atende", na ordem do catálogo. */
export function itensNaoAtendidos(bruto: unknown): ItemNaoAtendido[] {
  const d = normalizarVerificacaoNr13(bruto);
  return TODOS_ITENS_NR13_CALDEIRA.filter((it) => d.respostas[it.id] === 'nao').map((it) => ({
    item: it.item,
    texto: it.texto,
    observacao: d.observacoes[it.id]?.trim() || null,
  }));
}

/** "Não atende" exige a observação (o que foi encontrado) para finalizar. */
export function naoAtendidosSemObservacao(bruto: unknown): ItemVerificacaoNr13[] {
  const d = normalizarVerificacaoNr13(bruto);
  return TODOS_ITENS_NR13_CALDEIRA.filter((it) => d.respostas[it.id] === 'nao' && !d.observacoes[it.id]?.trim());
}
