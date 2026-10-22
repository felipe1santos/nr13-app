/**
 * AS FOLHAS DO RELATÓRIO DE CALDEIRA FLAMOTUBULAR (22/10/2026).
 *
 * CONTEÚDO e ORDEM do relatório de referência (CAL-25/5340); DESENHO deste
 * documento — as mesmas faixas, tabelas, marcas, cabeçalho, rodapé e
 * paginação das outras seções. O visual do PDF de referência não é copiado.
 *
 * Sumário (fixo, como na referência):
 *   1. Prontuário de Inspeção — prontuário (2 folhas), instrumentos de
 *      segurança e acessórios, relatório de inspeção, exames visuais externo e
 *      interno, cálculos de pressão interna;
 *   2. Relatórios de END — medição de espessura e ensaio de acumulação;
 *   3. Teste de Sobrepressão;
 *   4. Certificados de Calibração (anexos);
 *   5. Prontuário de Fabricação (anexo);
 *   6. ART (anexo);
 *   7. Livro de Registro de Segurança.
 *
 * O que a referência tinha de errado e aqui não se repete: o nº rastreável de
 * outro ensaio numa folha, a "espessura nominal" que era a mínima medida, o
 * t mín dos espelhos que não fechava com os próprios dados, a validade de
 * calibração anterior ao ensaio sem aviso e o laudo citando item da redação de
 * 2018 da NR-13.
 */
import type { CelulaDoc, Documento } from './documento';
import { COR, FONTE } from './documentoA4';
import { textoOu, type ModeloRelatorio } from './modelo';
import { assinaturas, folhasExameExterno, folhasExameInterno, folhasTesteHidrostatico, folhaUltrassom } from './folhas';
import { folhasAcumulacao } from './folhaAcumulacao';
import { rotuloLaudo } from './rotulos';
import { destaqueDaMedida, extremosDaRegiao } from './destaqueMedida';
import { GRUPOS_CALDEIRA, valorCaldeira, type GrupoCaldeira } from '../../caldeira/dadosCaldeira';
import { REGIOES_CALDEIRA, valorCelula } from '../../caldeira/medicaoCaldeira';
import { UNIDADES_QUATRO, type ModeloCaldeira, type PressaoQuatro } from './modeloCaldeira';
import { NORMA_REFERENCIA_CALDEIRA } from './normaCaldeira';

// ── utilidades de célula ────────────────────────────────────────────────────
const rot = (texto: string): CelulaDoc => ({ texto, rotulo: true });
const val = (texto: string | null | undefined, id: string, rotuloCampo: string, opcional = false): CelulaDoc => ({
  texto: textoOu(texto ?? null),
  valor: true,
  id,
  rotuloCampo,
  ...(opcional ? { opcional: true } : {}),
});
const marca = (marcado: boolean, id: string, rotuloCampo: string): CelulaDoc => ({
  texto: marcado ? 'X' : '',
  centro: true,
  valor: true,
  semDestaque: true,
  id,
  rotuloCampo,
});

/** A tabela "DADOS GERAIS" com o nº rastreável daquele documento interno. */
function dadosGerais(doc: Documento, mc: ModeloCaldeira, sufixo: string, idBase: string): void {
  const b = mc.base;
  doc.faixa('DADOS GERAIS');
  doc.tabela({
    compacta: true,
    colunas: [0.2, 0.4, 0.18, 0.22],
    linhas: [
      [
        rot('CONTRATANTE'),
        val(b.cliente, `${idBase}.contratante`, 'Contratante'),
        rot('Nº RASTREÁVEL'),
        val(mc.rastreavel(sufixo), `${idBase}.rastreavel`, 'Nº rastreável'),
      ],
      [
        rot('ENDEREÇO'),
        val(b.clienteEndereco, `${idBase}.endereco`, 'Endereço'),
        rot('DATA DE EMISSÃO'),
        val(mc.dataEmissao, `${idBase}.emissao`, 'Data de emissão'),
      ],
    ],
  });
}

/** Identificação, série, tipo e fabricante — o cabeçalho de quase toda folha. */
function aspectosGerais(doc: Documento, mc: ModeloCaldeira, idBase: string): void {
  const e = mc.base.equipamento;
  doc.faixa('ASPECTOS GERAIS DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    colunas: [0.2, 0.4, 0.18, 0.22],
    linhas: [
      [rot('IDENTIFICAÇÃO'), val(mc.base.tag, `${idBase}.tag`, 'Identificação'), rot('Nº DE SÉRIE'), val(e['NÚMERO DE SÉRIE'], `${idBase}.serie`, 'Nº de série')],
      [
        rot('TIPO DE EQUIPAMENTO'),
        val(mc.tipoTexto, `${idBase}.tipo`, 'Tipo de equipamento'),
        rot('FABRICANTE'),
        val(e['FABRICANTE'], `${idBase}.fabricante`, 'Fabricante'),
      ],
    ],
  });
}

/** Os campos de um grupo da ficha da caldeira, dois por linha. */
function tabelaGrupo(doc: Documento, mc: ModeloCaldeira, g: GrupoCaldeira, porLinha = 2): void {
  const pares: CelulaDoc[][] = [];
  for (let i = 0; i < g.campos.length; i += porLinha) {
    const linha: CelulaDoc[] = [];
    for (const c of g.campos.slice(i, i + porLinha)) {
      const rotulo = (c.unidade ? `${c.rotulo} (${c.unidade})` : c.rotulo).toUpperCase();
      linha.push(rot(rotulo), val(valorCaldeira(mc.dados, c.chave), `cald.${c.chave}`, c.rotulo, true));
    }
    while (linha.length < porLinha * 2) linha.push({ texto: '' }, { texto: '' });
    pares.push(linha);
  }
  doc.secao(g.titulo.toUpperCase());
  const colunas = porLinha === 3 ? [0.15, 0.183, 0.15, 0.183, 0.15, 0.184] : [0.24, 0.26, 0.24, 0.26];
  doc.tabela({ compacta: true, esticavel: true, colunas, linhas: pares });
}

/** PMO, PMTA e PTH nas quatro unidades da referência. */
function tabelaPressoes(doc: Documento, mc: ModeloCaldeira, idBase: string): void {
  const linha = (nome: string, p: PressaoQuatro, id: string): CelulaDoc[] => [
    rot(nome),
    ...UNIDADES_QUATRO.map((u) => ({
      texto: textoOu(p.valores?.[u] ?? null),
      centro: true,
      valor: true,
      id: `${idBase}.${id}-${u === 'kgf/cm²' ? 'kgf' : u.toLowerCase()}`,
      rotuloCampo: `${nome} (${u})`,
    })),
  ];
  doc.tabela({
    compacta: true,
    colunas: [0.2, 0.2, 0.2, 0.2, 0.2],
    cabecalho: ['', ...UNIDADES_QUATRO],
    linhas: [linha('PMO', mc.pmo, 'pmo'), linha('PMTA', mc.pmta, 'pmta'), linha('PTH', mc.pth, 'pth')],
  });
  doc.texto('PMO: Pressão Máxima de Operação · PMTA: Pressão Máxima de Trabalho Admissível · PTH: Pressão de Teste Hidrostático', {
    tamanho: FONTE.nota,
    cor: COR.nota,
  });
}

// ── CAPA ────────────────────────────────────────────────────────────────────
export function folhaCapaCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  const b = mc.base;
  doc.novaFolha();
  doc.texto('Relatório de Inspeção de Segurança', {
    tamanho: FONTE.tituloDoc,
    negrito: true,
    alinhamento: 'center',
    espacoAntes: 4,
    id: 'capa.titulo',
    rotuloCampo: 'Título do documento',
  });
  doc.texto(`${textoOu(mc.tipoTexto, 'Caldeira')} — NR-13`, {
    tamanho: FONTE.subtituloDoc,
    negrito: true,
    alinhamento: 'center',
    id: 'capa.subtitulo',
    rotuloCampo: 'Subtítulo do documento',
  });
  doc.texto(NORMA_REFERENCIA_CALDEIRA, {
    tamanho: FONTE.sigla,
    italico: true,
    cor: '#6a6a6a',
    alinhamento: 'center',
    espacoAntes: 0.8,
    id: 'capa.portaria',
    rotuloCampo: 'Norma de referência',
  });
  doc.y += 3;
  doc.tabela({
    colunas: [0.22, 0.36, 0.14, 0.28],
    linhas: [
      [rot('IDENTIFICAÇÃO'), val(b.tag, 'capa.tag', 'Identificação'), rot('Nº DE SÉRIE'), val(b.equipamento['NÚMERO DE SÉRIE'], 'capa.serie', 'Nº de série')],
      [
        rot('FABRICANTE'),
        val(b.equipamento['FABRICANTE'], 'capa.fabricante', 'Fabricante'),
        rot('MODELO'),
        val(valorCaldeira(mc.dados, 'modelo'), 'capa.modelo', 'Modelo', true),
      ],
      [rot('CATEGORIA'), val(mc.categoria, 'capa.categoria', 'Categoria (NR-13 13.4.1.1)'), rot('LOCAL'), val(b.equipamento['LOCAL DA INSTALAÇÃO'], 'capa.local', 'Local', true)],
    ],
  });
  const disponivel = doc.espacoRestante - 6 * 7 - 6;
  doc.y += 3;
  doc.areaImagem({
    id: 'capa.foto',
    rotulo: 'Foto do equipamento (capa)',
    dataUrl: b.fotoCapa,
    altura: Math.max(40, Math.min(disponivel, 150)),
    convite: 'Clique para adicionar a foto do equipamento',
  });
  doc.y += 3;
  doc.tabela({
    colunas: [0.26, 0.74],
    linhas: [
      [rot('Nº DO RELATÓRIO'), val(b.numeroRelatorio, 'capa.n-do-relatorio', 'Nº do relatório')],
      [rot('DATA DA INSPEÇÃO'), val(b.execucao ?? b.emissao, 'capa.data-da-inspecao', 'Data da inspeção')],
      [rot('SOLICITANTE / CONTRATANTE'), val(b.cliente, 'capa.contratante', 'Contratante')],
      [rot('ENDEREÇO'), val(b.clienteEndereco, 'capa.endereco', 'Endereço')],
      [
        rot('RESPONSÁVEL TÉCNICO'),
        val([textoOu(b.responsavel.nome), `CREA: ${textoOu(b.responsavel.registro)}`].join('   •   '), 'capa.responsavel', 'Responsável técnico'),
      ],
    ],
  });
}

// ── SUMÁRIO ─────────────────────────────────────────────────────────────────
export interface ItemSumarioCaldeira {
  numero: string;
  titulo: string;
}

export const SUMARIO_CALDEIRA: ItemSumarioCaldeira[] = [
  { numero: '1', titulo: 'Prontuário de Inspeção' },
  { numero: '1.1', titulo: 'Prontuário' },
  { numero: '1.2', titulo: 'Instrumentos de segurança e acessórios' },
  { numero: '1.3', titulo: 'Relatório de inspeção' },
  { numero: '1.4', titulo: 'Exame visual externo' },
  { numero: '1.5', titulo: 'Exame visual interno' },
  { numero: '1.6', titulo: 'Cálculos de pressão interna' },
  { numero: '2', titulo: 'Relatórios de END' },
  { numero: '2.1', titulo: 'Medição de espessura' },
  { numero: '2.2', titulo: 'Ensaio de acumulação' },
  { numero: '3', titulo: 'Teste de Sobrepressão' },
  { numero: '4', titulo: 'Certificados de Calibração' },
  { numero: '5', titulo: 'Prontuário de Fabricação' },
  { numero: '6', titulo: 'ART' },
  { numero: '7', titulo: 'Livro de Registro de Segurança' },
];

export function folhaSumarioCaldeira(doc: Documento, paginas: Map<string, number>, itens: ItemSumarioCaldeira[]): void {
  doc.novaFolha();
  doc.banner('SUMÁRIO');
  doc.tabela({
    compacta: true,
    colunas: [0.12, 0.73, 0.15],
    cabecalho: ['ITEM', 'DOCUMENTO', 'PÁGINA'],
    linhas: itens.map((it) => {
      const principal = !it.numero.includes('.');
      return [
        { texto: it.numero, centro: true, ...(principal ? { rotulo: true } : {}) },
        { texto: principal ? it.titulo.toUpperCase() : `   ${it.titulo}`, ...(principal ? { rotulo: true } : {}) },
        { texto: paginas.has(it.numero) ? String(paginas.get(it.numero)) : '—', centro: true },
      ];
    }),
  });
}

/** Folha de rosto de uma seção — o "divisor" da referência, desenhado como as nossas faixas. */
export function folhaDivisoria(doc: Documento, numero: string, titulo: string, linhas: string[]): void {
  doc.novaFolha();
  doc.y += 50;
  doc.banner(`${numero}. ${titulo.toUpperCase()}`);
  for (const l of linhas) doc.texto(l, { alinhamento: 'center', espacoAntes: 3, cor: COR.nota });
}

// ── 1.1 PRONTUÁRIO ──────────────────────────────────────────────────────────
export function folhasProntuarioCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  const e = mc.base.equipamento;
  doc.novaFolha();
  doc.abrirSecaoElastica('caldProntuario1');
  doc.banner('1.1 PRONTUÁRIO');
  dadosGerais(doc, mc, 'P', 'prontuario');
  doc.faixa('DADOS DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.3, 0.2, 0.3],
    linhas: [
      [rot('IDENTIFICAÇÃO'), val(mc.base.tag, 'prontuario.tag', 'Identificação'), rot('Nº DE SÉRIE'), val(e['NÚMERO DE SÉRIE'], 'prontuario.serie', 'Nº de série')],
      [rot('TIPO DE EQUIPAMENTO'), val(mc.tipoTexto, 'prontuario.tipo', 'Tipo'), rot('MODELO'), val(valorCaldeira(mc.dados, 'modelo'), 'prontuario.modelo', 'Modelo', true)],
      [rot('FABRICANTE'), val(e['FABRICANTE'], 'prontuario.fabricante', 'Fabricante'), rot('CÓDIGO DE PROJETO'), val(e['CÓDIGO DE PROJETO'], 'prontuario.codigo', 'Código de projeto')],
      [rot('ANO DE FABRICAÇÃO'), val(e['ANO DE FABRICAÇÃO'], 'prontuario.ano', 'Ano de fabricação'), rot('EDIÇÃO / ADENDA'), val(e['EDIÇÃO / ADENDA'], 'prontuario.edicao', 'Edição / adenda', true)],
    ],
  });
  doc.faixa('ASPECTOS CONSTRUTIVOS');
  for (const g of GRUPOS_CALDEIRA.filter((x) => x.folha === 'prontuario1' && x.id !== 'equipamento')) tabelaGrupo(doc, mc, g);
  doc.fecharSecaoElastica();

  doc.novaFolha();
  doc.abrirSecaoElastica('caldProntuario2');
  doc.banner('1.1 PRONTUÁRIO (CONTINUAÇÃO)');
  for (const g of GRUPOS_CALDEIRA.filter((x) => x.folha === 'prontuario2' && x.id !== 'controles')) tabelaGrupo(doc, mc, g);
  doc.secao('PRESSÕES');
  tabelaPressoes(doc, mc, 'prontuario');
  doc.secao('MECANISMOS DE CONTROLE');
  const controles = GRUPOS_CALDEIRA.find((g) => g.id === 'controles')!;
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.5, 0.25, 0.25],
    cabecalho: ['MECANISMO', 'MANUAL', 'AUTOMÁTICO'],
    linhas: controles.campos.map((c) => {
      const v = valorCaldeira(mc.dados, c.chave).toLowerCase();
      return [
        { texto: c.rotulo },
        marca(v.startsWith('manual'), `cald.${c.chave}.manual`, `${c.rotulo} — manual`),
        marca(v.startsWith('autom'), `cald.${c.chave}.automatico`, `${c.rotulo} — automático`),
      ];
    }),
  });
  doc.fecharSecaoElastica();
}

// ── 1.2 INSTRUMENTOS DE SEGURANÇA E ACESSÓRIOS ──────────────────────────────
export function folhaAcessoriosCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('caldAcessorios');
  doc.banner('1.2 INSTRUMENTOS DE SEGURANÇA E ACESSÓRIOS');
  dadosGerais(doc, mc, 'P', 'acessorios');
  aspectosGerais(doc, mc, 'acessorios');
  // Três pares por linha: são onze grupos de acessórios, e com dois por linha a
  // folha transbordava uma linha só para a página seguinte.
  for (const g of GRUPOS_CALDEIRA.filter((x) => x.folha === 'acessorios')) tabelaGrupo(doc, mc, g, 3);
  doc.fecharSecaoElastica();
}

// ── 1.3 RELATÓRIO DE INSPEÇÃO ───────────────────────────────────────────────
const NATUREZAS = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária'];

function respostaNc(itens: { resposta: string | null }[]): boolean | null {
  const respondidos = itens.filter((i) => (i.resposta ?? '').trim() !== '');
  if (respondidos.length === 0) return null;
  return respondidos.some((i) => (i.resposta ?? '').trim().toLowerCase() === 'sim');
}

function blocoExameNoRelatorio(
  doc: Documento,
  titulo: string,
  idBase: string,
  realizado: boolean,
  numero: string | null,
  nc: boolean | null,
  detalhe: string,
): void {
  // O título não fica órfão no pé da folha: título + duas linhas + nota.
  doc.garantirEspaco(26);
  doc.secao(titulo);
  doc.tabela({
    compacta: true,
    colunas: [0.46, 0.07, 0.07, 0.07, 0.07, 0.26],
    linhas: [
      [
        rot('O EXAME FOI REALIZADO?'),
        rot('SIM'),
        marca(realizado, `${idBase}.realizado-sim`, `${titulo} — realizado SIM`),
        rot('NÃO'),
        marca(!realizado, `${idBase}.realizado-nao`, `${titulo} — realizado NÃO`),
        val(numero, `${idBase}.numero`, `${titulo} — nº do relatório`, true),
      ],
      [
        rot('O EQUIPAMENTO POSSUI ALGUMA NÃO CONFORMIDADE CAPAZ DE INTERFERIR NA SEGURANÇA?'),
        rot('SIM'),
        marca(nc === true, `${idBase}.nc-sim`, `${titulo} — NC SIM`),
        rot('NÃO'),
        marca(nc === false, `${idBase}.nc-nao`, `${titulo} — NC NÃO`),
        { texto: '' },
      ],
    ],
  });
  if (!realizado) {
    doc.tabela({
      compacta: true,
      colunas: [0.25, 0.75],
      linhas: [[rot('SE NÃO, JUSTIFIQUE'), { texto: '', valor: true, id: `${idBase}.justificativa`, rotuloCampo: `${titulo} — justificativa`, multilinha: true }]],
    });
  } else if (detalhe) {
    doc.texto(detalhe, { tamanho: FONTE.nota, cor: COR.nota });
  }
}

export function folhasRelatorioInspecaoCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  const b = mc.base;
  const e = b.equipamento;
  doc.novaFolha();
  doc.banner('1.3 RELATÓRIO DE INSPEÇÃO');
  dadosGerais(doc, mc, 'RI', 'ri');

  doc.faixa('TIPO DA INSPEÇÃO DE SEGURANÇA');
  doc.tabela({
    compacta: true,
    colunas: [0.27, 0.06, 0.27, 0.06, 0.28, 0.06],
    linhas: [
      NATUREZAS.flatMap((n, i) => [
        rot(n.replace('Inspeção ', '').toUpperCase()),
        marca((mc.tipoInspecao ?? '').toLowerCase() === n.toLowerCase(), `ri.natureza-${i}`, `Natureza — ${n}`),
      ]),
    ],
  });

  doc.faixa('ASPECTOS GERAIS DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    colunas: [0.22, 0.28, 0.22, 0.28],
    linhas: [
      [rot('IDENTIFICAÇÃO'), val(b.tag, 'ri.tag', 'Identificação'), rot('Nº DE SÉRIE'), val(e['NÚMERO DE SÉRIE'], 'ri.serie', 'Nº de série')],
      [rot('TIPO DE EQUIPAMENTO'), val(mc.tipoTexto, 'ri.tipo', 'Tipo'), rot('FABRICANTE'), val(e['FABRICANTE'], 'ri.fabricante', 'Fabricante')],
      [rot('CÓDIGO DE PROJETO'), val(e['CÓDIGO DE PROJETO'], 'ri.codigo', 'Código de projeto'), rot('ANO DE FABRICAÇÃO'), val(e['ANO DE FABRICAÇÃO'], 'ri.ano', 'Ano de fabricação')],
      [
        rot('CAPACIDADE DE PRODUÇÃO DE VAPOR (kg/h)'),
        val(valorCaldeira(mc.dados, 'vazao'), 'ri.capacidade', 'Capacidade de produção de vapor', true),
        rot('DATA DA INSTALAÇÃO'),
        val(valorCaldeira(mc.dados, 'dataInstalacao'), 'ri.instalacao', 'Data da instalação', true),
      ],
      [rot('CATEGORIA'), val(mc.categoria, 'ri.categoria', 'Categoria (NR-13 13.4.1.1)'), rot('LOCALIZAÇÃO DO EQUIPAMENTO'), val(e['LOCAL DA INSTALAÇÃO'], 'ri.local', 'Localização', true)],
    ],
  });
  tabelaPressoes(doc, mc, 'ri');

  doc.faixa('ENSAIOS REALIZADOS');
  doc.tabela({
    compacta: true,
    colunas: [0.46, 0.12, 0.18, 0.24],
    cabecalho: ['ENSAIO', 'REALIZADO', 'LAUDO', 'Nº RASTREÁVEL'],
    linhas: mc.ensaios.map((en) => [
      { texto: en.nome },
      marca(en.feito, `ri.ensaio-${en.id}.feito`, `${en.nome} — realizado`),
      { texto: en.feito ? textoOu(en.laudo) : '', centro: true, valor: true, id: `ri.ensaio-${en.id}.laudo`, rotuloCampo: `${en.nome} — laudo`, opcional: true },
      { texto: en.feito ? textoOu(en.numero) : '', centro: true, valor: true, id: `ri.ensaio-${en.id}.numero`, rotuloCampo: `${en.nome} — nº rastreável`, opcional: true },
    ]),
  });

  doc.faixa('DISPOSITIVOS DE SEGURANÇA E ACESSÓRIOS');
  doc.tabela({
    compacta: true,
    colunas: [0.4, 0.12, 0.24, 0.24],
    cabecalho: ['DISPOSITIVO', 'POSSUI', 'CALIBRADO E CERTIFICADO?', 'Nº DO CERTIFICADO'],
    linhas: mc.dispositivos.map((d) => [
      { texto: d.nome },
      marca(d.possui, `ri.disp-${d.id}.possui`, `${d.nome} — possui`),
      { texto: d.possui ? textoOu(d.calibrado) : 'N/A', centro: true, valor: true, id: `ri.disp-${d.id}.calibrado`, rotuloCampo: `${d.nome} — calibrado`, opcional: true },
      { texto: d.possui ? textoOu(d.numero) : '', centro: true, valor: true, id: `ri.disp-${d.id}.numero`, rotuloCampo: `${d.nome} — nº do certificado`, opcional: true },
    ]),
  });

  doc.faixa('EXAME DO PRONTUÁRIO');
  doc.tabela({
    compacta: true,
    colunas: [0.58, 0.07, 0.07, 0.07, 0.07, 0.14],
    linhas: [
      [
        rot('O EQUIPAMENTO POSSUI PRONTUÁRIO DE FABRICAÇÃO?'),
        rot('SIM'),
        marca(mc.temFabricacao, 'ri.prontuario-sim', 'Possui prontuário de fabricação — SIM'),
        rot('NÃO'),
        marca(!mc.temFabricacao, 'ri.prontuario-nao', 'Possui prontuário de fabricação — NÃO'),
        { texto: '' },
      ],
    ],
  });
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.75],
    linhas: [[rot('OBSERVAÇÕES'), { texto: '', valor: true, id: 'ri.prontuario-obs', rotuloCampo: 'Exame do prontuário — observações', multilinha: true, opcional: true }]],
  });

  const ve = b.visualExterno;
  const vi = b.visualInterno;
  const veFeito = ve.itens.some((i) => (i.resposta ?? '').trim() !== '') || !!ve.resultado;
  const viFeito = vi.itens.some((i) => (i.resposta ?? '').trim() !== '') || !!vi.resultado;
  blocoExameNoRelatorio(doc, 'EXAME VISUAL EXTERNO', 'ri.ve', veFeito, veFeito ? mc.rastreavel('VE') : null, respostaNc(ve.itens), veFeito ? `Informações detalhadas no item 1.4 (nº ${textoOu(mc.rastreavel('VE'))}).` : '');
  blocoExameNoRelatorio(doc, 'EXAME VISUAL INTERNO', 'ri.vi', viFeito, viFeito ? mc.rastreavel('VI') : null, respostaNc(vi.itens), viFeito ? `Informações detalhadas no item 1.5 (nº ${textoOu(mc.rastreavel('VI'))}).` : '');

  const th = mc.ensaios.find((x) => x.id === 'th')!;
  blocoExameNoRelatorio(doc, 'TESTE HIDROSTÁTICO', 'ri.th', th.feito, th.numero, th.laudo === null ? null : th.laudo === 'Reprovado', th.feito ? 'Informações detalhadas na seção 3 — Teste de sobrepressão.' : '');

  // ENSAIO DE ACUMULAÇÃO — se NÃO foi realizado, a justificativa é obrigatória
  // (a finalização cobra o campo `ri.acumulacao.justificativa`).
  doc.garantirEspaco(26);
  doc.secao('ENSAIO DE ACUMULAÇÃO');
  doc.tabela({
    compacta: true,
    colunas: [0.46, 0.07, 0.07, 0.07, 0.07, 0.26],
    linhas: [
      [
        rot('O ENSAIO FOI REALIZADO?'),
        rot('SIM'),
        marca(mc.acumulacaoFeita, 'ri.acumulacao.sim', 'Ensaio de acumulação — realizado SIM'),
        rot('NÃO'),
        marca(!mc.acumulacaoFeita, 'ri.acumulacao.nao', 'Ensaio de acumulação — realizado NÃO'),
        val(mc.acumulacaoFeita ? mc.rastreavel('EA') : null, 'ri.acumulacao.numero', 'Ensaio de acumulação — nº', true),
      ],
    ],
  });
  if (!mc.acumulacaoFeita) {
    doc.tabela({
      compacta: true,
      colunas: [0.25, 0.75],
      linhas: [
        [
          rot('SE NÃO, JUSTIFIQUE'),
          { texto: '', valor: true, id: 'ri.acumulacao.justificativa', rotuloCampo: 'Ensaio de acumulação — justificativa (obrigatória)', multilinha: true },
        ],
      ],
    });
  }

  doc.garantirEspaco(60);
  doc.faixa('LAUDO FINAL');
  doc.tabela({
    compacta: true,
    colunas: [0.7, 0.3],
    linhas: [
      [
        rot('O equipamento está apto a operar nas condições de segurança da NR-13?'),
        { texto: textoOu(rotuloLaudo(b.laudo.apto)), centro: true, valor: true, id: 'parecer.laudo', rotuloCampo: 'Parecer (APTO / INAPTO)' },
      ],
    ],
  });
  doc.texto('', { cor: COR.valor, id: 'ri.laudo-final', rotuloCampo: 'Laudo final (texto)', espacoAntes: 1 });

  doc.faixa('PRAZO PARA A REALIZAÇÃO DA PRÓXIMA INSPEÇÃO');
  doc.tabela({
    compacta: true,
    colunas: [0.5, 0.5],
    linhas: [
      [rot('EXAME EXTERNO'), { texto: textoOu(b.proximas.externa), centro: true, valor: true, id: 'proximas.externa', rotuloCampo: 'Próxima — exame externo' }],
      [rot('EXAME INTERNO'), { texto: textoOu(b.proximas.interna), centro: true, valor: true, id: 'proximas.interna', rotuloCampo: 'Próxima — exame interno' }],
    ],
  });

  doc.y += 3;
  assinaturas(doc, b);
}

// ── 1.6 CÁLCULOS DE PRESSÃO INTERNA ─────────────────────────────────────────
export function folhasCalculosCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  mc.calculos.forEach((c, i) => {
    doc.novaFolha();
    doc.abrirSecaoElastica(`caldCalculo${i}`);
    doc.banner(`1.6 CÁLCULO DE PRESSÃO INTERNA — ${c.nome.toUpperCase()}`);
    dadosGerais(doc, mc, 'C', `calculo${i}`);
    aspectosGerais(doc, mc, `calculo${i}`);
    doc.faixa('PARÂMETROS (ASME SEÇÃO I)');
    doc.texto(`PMTA pela espessura medida:  ${c.formulaP}`, { espacoAntes: 1 });
    doc.texto(`Espessura mínima:  ${c.formulaT}`, { espacoAntes: 1 });
    doc.tabela({
      compacta: true,
      esticavel: true,
      colunas: [0.7, 0.3],
      linhas: c.parametros.map(([r, v], k) => [rot(r), { texto: v, centro: true, valor: true, id: `calculo${i}.param-${k}`, rotuloCampo: r }]),
    });
    if (c.fonteEspessura === 'memorial') {
      doc.texto('Espessura do memorial de cálculo: não há medição desta região no ensaio de ultrassom.', { tamanho: FONTE.nota, cor: COR.nota });
    }
    doc.faixa('RESULTADOS OBTIDOS');
    doc.tabela({
      compacta: true,
      colunas: [0.28, 0.18, 0.18, 0.18, 0.18],
      cabecalho: ['', ...UNIDADES_QUATRO],
      linhas: [
        [rot('PMTA PELA ESPESSURA MEDIDA'), ...UNIDADES_QUATRO.map((u) => ({ texto: textoOu(c.pmtaMedida.valores?.[u] ?? null), centro: true, valor: true }))],
        [rot('PMTA ADOTADA (DOCUMENTO)'), ...UNIDADES_QUATRO.map((u) => ({ texto: textoOu(mc.pmta.valores?.[u] ?? null), centro: true, valor: true }))],
        [rot('PTH'), ...UNIDADES_QUATRO.map((u) => ({ texto: textoOu(mc.pth.valores?.[u] ?? null), centro: true, valor: true }))],
      ],
    });
    doc.tabela({
      compacta: true,
      colunas: [0.5, 0.25, 0.25],
      cabecalho: ['ESPESSURA MÍNIMA PARA A PMTA ADOTADA', 'mm', 'in'],
      linhas: [
        [
          rot('t mín'),
          { texto: c.tMin === null ? '—' : c.tMin.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), centro: true, valor: true },
          { texto: c.tMin === null ? '—' : (c.tMin / 25.4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), centro: true, valor: true },
        ],
      ],
    });
    doc.faixa('LAUDO');
    const texto =
      c.veredicto === 'APROVADO'
        ? 'Como a PMTA calculada pela espessura medida é maior ou igual à PMTA adotada, o componente encontra-se APROVADO.'
        : c.veredicto === 'REPROVADO'
          ? 'A PMTA calculada pela espessura medida é MENOR que a PMTA adotada: o componente encontra-se REPROVADO.'
          : 'Sem dados suficientes para a verificação (espessura medida, parâmetros do memorial ou PMTA adotada).';
    doc.texto(texto, { negrito: c.veredicto !== 'INDETERMINADO', cor: COR.valor, id: `calculo${i}.laudo`, rotuloCampo: `Laudo — ${c.nome}` });
    doc.texto(
      'S: tensão admissível · E: eficiência de junta · y: coeficiente de temperatura · D: diâmetro externo · c: margem de corrosão · p: distância entre estais · C: constante dos estais · P: pressão.',
      { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 },
    );
    doc.fecharSecaoElastica();
  });
}

// ── 2.1 MEDIÇÃO DE ESPESSURA ────────────────────────────────────────────────
/** A espessura mínima REQUERIDA de cada região — só onde há cálculo. */
function requeridaDaRegiao(mc: ModeloCaldeira, regiao: string): number | null {
  const pelo = (nome: string) => mc.calculos.find((c) => c.nome === nome)?.tMin ?? null;
  if (regiao === 'corpo') return pelo('Corpo');
  if (regiao === 'espelhoDianteiro') return pelo('Espelho dianteiro');
  if (regiao === 'espelhoTraseiro') return pelo('Espelho traseiro');
  return null;
}

export function folhasMedicaoCaldeira(doc: Documento, mc: ModeloCaldeira): void {
  if (!mc.medicao) {
    // Sem a grade de caldeira, a medição no formato anterior (tampos/casco),
    // se houver — nunca se some com dado de campo.
    if (mc.base.ultrassom.pontos.length > 0) folhaUltrassom(doc, mc.base);
    return;
  }
  doc.novaFolha();
  doc.abrirSecaoElastica('caldMedicao');
  doc.banner('2.1 MEDIÇÃO DE ESPESSURA POR ULTRASSOM');
  dadosGerais(doc, mc, 'ME', 'medicao');
  const ins = mc.base.ultrassom.instrumento;
  doc.faixa('INSTRUMENTO UTILIZADO');
  doc.tabela({
    compacta: true,
    colunas: [0.2, 0.3, 0.2, 0.3],
    linhas: [
      [rot('PADRÃO'), val(ins.padrao, 'medicao.padrao', 'Padrão', true), rot('Nº DE SÉRIE'), val(ins.serie, 'medicao.serie-padrao', 'Nº de série', true)],
      [rot('Nº CERTIFICADO'), val(ins.certificado, 'medicao.certificado', 'Nº certificado', true), rot('VALIDADE'), val(ins.validade, 'medicao.validade', 'Validade', true)],
    ],
  });
  for (const r of REGIOES_CALDEIRA) {
    const req = requeridaDaRegiao(mc, r.id);
    const valores = r.linhas.flatMap((l) => (r.pontos.length ? r.pontos : [null]).map((p) => valorCelula(mc.medicao, r.id, p, l)));
    const { maior, menor } = extremosDaRegiao([{ medidas: valores }]);
    const cel = (v: string, id: string, rotulo: string): CelulaDoc => ({
      texto: textoOu(v || null),
      centro: true,
      valor: true,
      id,
      rotuloCampo: rotulo,
      opcional: true,
      ...destaqueDaMedida(v, maior, menor, req),
    });
    doc.secao(`${r.titulo.toUpperCase()} (mm)${req !== null ? ` — espessura mínima requerida ${req.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm` : ''}`);
    if (r.pontos.length) {
      doc.tabela({
        compacta: true,
        colunas: [0.16, ...r.linhas.map(() => 0.84 / r.linhas.length)],
        cabecalho: ['PONTO', ...r.linhas.map((l) => `LINHA ${l}`)],
        linhas: r.pontos.map((p) => [{ texto: p, centro: true, rotulo: true }, ...r.linhas.map((l) => cel(valorCelula(mc.medicao, r.id, p, l), `medicao.${r.id}.${p}${l}`, `${r.titulo} ${p}${l}`))]),
      });
    } else {
      doc.tabela({
        compacta: true,
        colunas: r.linhas.map(() => 1 / r.linhas.length),
        cabecalho: r.linhas.map((l) => `L${l}`),
        linhas: [r.linhas.map((l) => cel(valorCelula(mc.medicao, r.id, null, l), `medicao.${r.id}.${l}`, `${r.titulo} L${l}`))],
      });
    }
  }
  doc.faixa('RESULTADOS');
  doc.tabela({
    compacta: true,
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['REGIÃO', 'MÍNIMA (mm)', 'MÁXIMA (mm)', 'MÍNIMA REQUERIDA (mm)'],
    linhas: mc.extremos.map((x) => {
      const req = requeridaDaRegiao(mc, x.regiao);
      const f = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      return [
        { texto: x.titulo },
        { texto: f(x.minima), centro: true, valor: true, ...destaqueDaMedida(x.minima === null ? null : String(x.minima), null, null, req) },
        { texto: f(x.maxima), centro: true, valor: true },
        { texto: f(req), centro: true, valor: true },
      ];
    }),
  });
  doc.texto(
    'Destaques: menor valor medido de cada região em âmbar; leitura abaixo da espessura mínima requerida em vermelho. A requerida existe onde há cálculo (corpo e espelhos).',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 },
  );
  doc.fecharSecaoElastica();
}

// ── Seções que reaproveitam as folhas comuns, com a numeração da caldeira ──
export function folhasVisuaisCaldeira(doc: Documento, m: ModeloRelatorio): void {
  folhasExameExterno(doc, m, true, { banner: '1.4 EXAME VISUAL EXTERNO', fotos: '1.4.1 REGISTRO FOTOGRÁFICO — EXAME VISUAL EXTERNO' });
  folhasExameInterno(doc, m, true, { banner: '1.5 EXAME VISUAL INTERNO', fotos: '1.5.1 REGISTRO FOTOGRÁFICO — EXAME VISUAL INTERNO' });
}


export function folhaAcumulacaoCaldeira(doc: Documento, m: ModeloRelatorio): boolean {
  return folhasAcumulacao(doc, m, true, {
    banner: '2.2 ENSAIO DE ACUMULAÇÃO',
    fotos: '2.2.1 REGISTRO FOTOGRÁFICO — ENSAIO DE ACUMULAÇÃO',
  });
}

export function folhasSobrepressaoCaldeira(doc: Documento, m: ModeloRelatorio): void {
  folhasTesteHidrostatico(doc, m, true, {
    banner: '3. TESTE DE SOBREPRESSÃO — TESTE HIDROSTÁTICO',
    fotos: '3.1 REGISTRO FOTOGRÁFICO — TESTE DE SOBREPRESSÃO',
  });
}

