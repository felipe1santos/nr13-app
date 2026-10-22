/**
 * 7.6 ENSAIO DE ACUMULAÇÃO — a folha (21/10/2026). Só caldeira.
 *
 * O CONTEÚDO e a ORDEM são os do laudo de referência (dados gerais, aspectos do
 * equipamento, parâmetros, instrumento, dados do teste, laudo, registro
 * fotográfico, observações); o DESENHO é o deste documento — as mesmas faixas,
 * tabelas, marcas e folha de fotos das outras seções. O visual do PDF de
 * referência não é copiado.
 *
 * O nº rastreável sai de UM lugar (`modelo.acumulacao.rastreavel`, código do
 * relatório + "/EA") e vale para as duas folhas — o laudo de referência
 * imprimia na de fotos o rastreável de outro ensaio.
 *
 * Os ALERTAS (acumulação acima de 1,06 × PMTA, calibração vencida) não são
 * impressos: são informação para o engenheiro na tela e na finalização. O
 * documento registra o que foi medido e o laudo que o PLH assinou.
 */
import type { CelulaDoc, Documento } from './documento';
import { COR } from './documentoA4';
import { textoOu, type ModeloRelatorio } from './modelo';
import { dataBrIso, type ModeloAcumulacao } from './modeloAcumulacao';
import { UNIDADES_PRESSAO } from '../../../calc/pressaoCincoUnidades';

export const TITULO_ACUMULACAO = '7.6 ENSAIO DE ACUMULAÇÃO';
export const TITULO_FOTOS_ACUMULACAO = '7.6.1 REGISTRO FOTOGRÁFICO — ENSAIO DE ACUMULAÇÃO';

const rot = (texto: string): CelulaDoc => ({ texto, rotulo: true });
const val = (texto: string | null | undefined, id: string, rotuloCampo: string): CelulaDoc => ({
  texto: textoOu(texto ?? null),
  valor: true,
  id,
  rotuloCampo,
});
const marca = (marcado: boolean, id: string, rotuloCampo: string): CelulaDoc => ({
  texto: marcado ? 'X' : '',
  centro: true,
  valor: true,
  semDestaque: true,
  id,
  rotuloCampo,
});

function linhaPar(
  a: string,
  va: string | null | undefined,
  ida: string,
  b: string,
  vb: string | null | undefined,
  idb: string,
): CelulaDoc[] {
  return [rot(a), val(va, `acumulacao.${ida}`, a), rot(b), val(vb, `acumulacao.${idb}`, b)];
}

/** A folha do ensaio. Devolve `false` (nada desenhado) quando não há ensaio. */
export function folhasAcumulacao(doc: Documento, m: ModeloRelatorio, comFotos = true): boolean {
  const a: ModeloAcumulacao | null = m.acumulacao;
  if (!a) return false;
  const d = a.dados;

  doc.novaFolha();
  // Seção ELÁSTICA, como a do TH: as linhas marcadas `esticavel` dividem a
  // sobra da folha, e as observações vão até o fim — sem meia página em branco
  // no pé de um documento assinado (§5).
  doc.abrirSecaoElastica('acumulacao');
  doc.banner(TITULO_ACUMULACAO);

  doc.faixa('DADOS GERAIS');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.4, 0.18, 0.22],
    linhas: [
      linhaPar('CONTRATANTE', d.contratante, 'contratante', 'Nº RASTREÁVEL', a.rastreavel, 'rastreavel'),
      linhaPar('ENDEREÇO', d.endereco, 'endereco', 'DATA DO ENSAIO', dataBrIso(d.dataEnsaio), 'data'),
    ],
  });

  doc.faixa('ASPECTOS GERAIS DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.4, 0.18, 0.22],
    linhas: [
      linhaPar('IDENTIFICAÇÃO', d.identificacao, 'identificacao', 'Nº DE SÉRIE', d.serie, 'serie'),
      linhaPar('TIPO DE EQUIPAMENTO', d.tipoEquipamento, 'tipo-equipamento', 'FABRICANTE', d.fabricante, 'fabricante'),
    ],
  });

  doc.faixa('PARÂMETROS DO ENSAIO');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.3, 0.22, 0.28],
    linhas: [linhaPar('PROCEDIMENTO', d.procedimento, 'procedimento', 'NORMAS DE REFERÊNCIA', d.normas, 'normas')],
  });

  const i = a.instrumento;
  doc.faixa('INSTRUMENTO UTILIZADO NO TESTE');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.3, 0.22, 0.28],
    linhas: [
      linhaPar('INSTRUMENTO', i.instrumento, 'instrumento', 'FABRICANTE', i.fabricante, 'instrumento-fabricante'),
      linhaPar('TIPO', i.tipo, 'instrumento-tipo', 'IDENTIFICAÇÃO', i.identificacao, 'instrumento-identificacao'),
      linhaPar('ESCALA', i.escala, 'instrumento-escala', 'VALIDADE DA CALIBRAÇÃO', dataBrIso(i.validade), 'instrumento-validade'),
    ],
  });

  doc.faixa('DADOS DO TESTE');
  doc.tabela({
    compacta: true,
    colunas: [0.62, 0.38],
    linhas: [
      [
        rot('TEMPO DE ESTABILIZAÇÃO DA(S) VÁLVULA(S) APÓS ABERTURA, DE MODO A GARANTIR A SUFICIÊNCIA DO DISPOSITIVO DE SEGURANÇA (min)'),
        val(d.tempoEstabilizacaoMin, 'acumulacao.estabilizacao', 'Tempo de estabilização (min)'),
      ],
    ],
  });
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.2, 0.3, 0.22, 0.28],
    linhas: [linhaPar('INÍCIO DO ENSAIO (h)', d.horaInicio, 'inicio', 'TÉRMINO DO ENSAIO (h)', d.horaTermino, 'termino')],
  });

  doc.secao('PRESSÃO MÁXIMA ATINGIDA DURANTE O ENSAIO DE ACUMULAÇÃO');
  doc.tabela({
    compacta: true,
    colunas: UNIDADES_PRESSAO.map(() => 1 / UNIDADES_PRESSAO.length),
    cabecalho: [...UNIDADES_PRESSAO],
    linhas: [
      UNIDADES_PRESSAO.map((u) => ({
        texto: textoOu(a.pressao?.[u] ?? null),
        centro: true,
        valor: true,
        id: `acumulacao.pressao-${u === 'kgf/cm²' ? 'kgf' : u.toLowerCase()}`,
        rotuloCampo: `Pressão máxima atingida (${u})`,
      })),
    ],
  });

  doc.tabela({
    compacta: true,
    colunas: [0.7, 0.075, 0.075, 0.075, 0.075],
    linhas: [
      [
        rot('AS VÁLVULAS DE SEGURANÇA EXISTENTES SÃO SUFICIENTES PARA MANTER O EQUIPAMENTO EM FUNCIONAMENTO COM SEGURANÇA?'),
        rot('SIM'),
        marca(d.valvulasSuficientes === 'sim', 'acumulacao.valvulas-sim', 'Válvulas suficientes — SIM'),
        rot('NÃO'),
        marca(d.valvulasSuficientes === 'nao', 'acumulacao.valvulas-nao', 'Válvulas suficientes — NÃO'),
      ],
      [
        rot('DURANTE O ENSAIO FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?'),
        rot('SIM'),
        marca(d.ncEncontrada === 'sim', 'acumulacao.nc-sim', 'Não conformidade — SIM'),
        rot('NÃO'),
        marca(d.ncEncontrada === 'nao', 'acumulacao.nc-nao', 'Não conformidade — NÃO'),
      ],
    ],
  });
  if (d.ncEncontrada === 'sim') {
    doc.tabela({
      compacta: true,
      colunas: [0.2, 0.8],
      linhas: [[rot('JUSTIFICATIVA'), val(d.justificativaNc, 'acumulacao.justificativa', 'Justificativa da não conformidade')]],
    });
  }

  doc.faixa('LAUDO');
  doc.texto(textoOu(d.laudo || null), {
    cor: COR.valor,
    negrito: true,
    alinhamento: 'center',
    espacoAntes: 2,
    id: 'acumulacao.laudo',
    rotuloCampo: 'Laudo do ensaio de acumulação',
  });
  if (d.resultado) {
    doc.texto(d.resultado === 'aprovado' ? 'APROVADO' : 'REPROVADO', {
      cor: COR.valor,
      negrito: true,
      alinhamento: 'center',
      espacoAntes: 1,
    });
  }

  doc.blocoAteOFim(
    'acumulacao.observacoes',
    'Observações do ensaio de acumulação',
    'OBSERVAÇÕES',
    18,
    50,
    d.observacoes ?? '',
  );
  doc.fecharSecaoElastica();

  if (comFotos && a.fotos.length > 0) {
    doc.novaFolha();
    const banner = () => doc.banner(TITULO_FOTOS_ACUMULACAO);
    banner();
    if (a.rastreavel) doc.texto(`Nº rastreável: ${a.rastreavel}`, { tamanho: 8, cor: COR.nota });
    doc.fotos(a.fotos, banner);
  }
  return true;
}
