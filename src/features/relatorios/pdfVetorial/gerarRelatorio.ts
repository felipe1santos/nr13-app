import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { registrarCarlito } from './carlito';
import { Documento, type CampoEditavel, type ModoDocumento, type RespiroMedido } from './documento';
import { anexarRastreabilidades, contarPaginasRastreabilidades } from '../rastreabilidadeService';
import { anexarFolhasDeCertificado, contarFolhasDeCertificado } from './certificados';
import { secoesPresentes, type SecaoRelatorio } from './composicao';
import type { MapaOverrides } from '../overridesRelatorio';
import { resolverImagem } from '../imagensDoDocumento';
import {
  secoesDoRelatorio,
  folhaCapa,
  folhaCategorizacao,
  folhaDadosInspecao,
  folhaDadosTecnicos,
  folhaIdentificacao,
  folhaParecer,
  folhaResumoCalculos,
  folhaSumario,
  folhaUltrassom,
  folhasChecklist,
  folhasExameExterno,
  folhasExameInterno,
  folhasFotosDocumentacao,
  folhasMemoria,
  folhasTesteHidrostatico,
} from './folhas';
import { medirFotos, montarModeloRelatorio, type FotoModelo, type ModeloRelatorio } from './modelo';
import { baixarFoto, blobParaDataUrl } from '../../../services/fotos';
import { resolverPlacaReal } from '../placaIdentificacao';

/**
 * Fase 11 · o RELATÓRIO COMPLETO em vetor.
 *
 * ## Duas passagens, e o motivo
 *
 * "Página X de Y" precisa do Y antes da primeira folha. O `putTotalPages` do
 * jsPDF faz substituição de texto no fluxo da página, e isso não é confiável com
 * fonte CID embutida — que é exatamente o nosso caso. Então o documento é gerado
 * DUAS vezes: a primeira, descartada, só conta as folhas; a segunda vale. Custa
 * poucas dezenas de milissegundos e não tem armadilha.
 *
 * ## O que NÃO muda
 *
 * Desde 04/09/2026 este gerador é o PADRÃO das finalizações NOVAS
 * (`nr13_motor_pdf = vetorial`, gravado em produção). O raster
 * (`pdfService.gerarPdfBytes`) continua inteiro no bundle como rollback de um
 * passo. Nenhum PDF histórico é regenerado (§7-quater), e o Livro, os
 * certificados e o termo de abertura não são tocados.
 */

export interface ResultadoVetorial {
  bytes: Uint8Array;
  paginas: number;
  ms: number;
  /** O modelo usado — a comparação campo a campo lê daqui. */
  modelo: ModeloRelatorio;
  /** Certificados que deviam entrar e não entraram — nunca somem calados. */
  falhasAnexo: string[];
  /**
   * 13D-bis · onde cada campo editável caiu no papel (mm), com o valor
   * resolvido e a origem. É com isto que a prévia monta as áreas clicáveis —
   * o PDF pronto nunca é reaberto para adivinhar qual texto é qual.
   */
  editaveis: CampoEditavel[];
}

export interface OpcoesVetorial {
  /**
   * A lista de folhas do relatório. Sem ela o documento sai sem CERTIFICADO
   * nenhum: é ela que diz quais tipos de padrão anexar e quais folhas de
   * calibração existem.
   */
  documentos?: string[];
  /** Anexar os certificados (padrão: sim quando há `documentos`). */
  certificados?: boolean;
  /**
   * 13B · **removido**. As folhas de calibração deixaram de sair da tela: cada
   * uma é montada sozinha num host isolado (`hostCertificado.ts`). O gerador não
   * lê mais `.relatorio-preview`, e por isso não há mais container a apontar.
   */
  onProgresso?: (feito: number, total: number) => void;
  /**
   * 13D-bis · os overrides manuais DESTE relatório.
   *
   * Vão para o `Documento`, que resolve campo a campo no momento de desenhar.
   * Prévia e emissão usam o MESMO caminho: o PDF arquivado sai exatamente com o
   * conteúdo que o usuário aprovou na tela.
   */
  overrides?: MapaOverrides;
  /**
   * 13D · `preview` desenha o MESMO documento com os campos vazios em
   * amarelo-claro. Não arquiva, não gera SHA oficial, não cria `pdfRef`, não
   * mexe em vencimento e não escreve no Livro — quem faz isso é o "Finalizar",
   * e ele nunca passa por aqui em modo preview.
   */
  modo?: ModoDocumento;
}

/**
 * Emite as folhas na ordem da referência, **respeitando a composição**.
 *
 * `tem` diz quais seções aquele relatório contém — vem da mesma lista de folhas
 * que o visualizador monta. Sem ela, tudo é emitido (a bancada de comparação).
 *
 * Isto não é enfeite: medido no gate, um relatório de 8 folhas saía com 14
 * páginas porque o vetorial emitia ultrassom e teste hidrostático que o
 * inspetor não tinha selecionado. Paginação diferente é esperada; ENSAIO a mais
 * num documento assinado é conteúdo errado.
 */
function emitir(
  doc: Documento,
  m: ModeloRelatorio,
  tem: Record<SecaoRelatorio, boolean>,
  paginas: Map<string, number> = new Map(),
  registrar?: Map<string, number>,
): void {
  // O sumário da referência traz a PÁGINA de cada seção. Ela só é conhecida
  // depois de desenhar — e o gerador já desenhava duas vezes por causa do
  // "Página X de Y". A 1ª passagem ANOTA (registrar), a 2ª CONSOME
  // (paginas). Nenhuma passagem extra foi criada para isto.
  const marcar = (titulo: string) => {
    if (registrar && !registrar.has(titulo)) registrar.set(titulo, doc.pdf.getNumberOfPages());
  };

  if (tem.capa) folhaCapa(doc, m);
  if (tem.sumario) {
    folhaSumario(doc, m, secoesDoRelatorio(m, tem), paginas);
    marcar('Objetivo');
    marcar('Documentos de referência');
  }
  if (tem.identificacao) {
    folhaIdentificacao(doc, m);
    marcar('Identificação do equipamento');
  }
  if (tem.categorizacao) {
    folhaCategorizacao(doc, m);
    marcar('Categorização de risco');
  }
  if (tem.dadosTecnicos) {
    folhaDadosTecnicos(doc, m);
    marcar('Dados técnicos do equipamento (prontuário)');
  }
  if (tem.resumoCalculos) {
    folhaResumoCalculos(doc, m);
    marcar('Resumo de cálculos da PMTA');
  }
  if (tem.memoria) {
    folhasMemoria(doc, m);
    marcar('Memória de cálculo da PMTA');
  }
  if (tem.dadosInspecao) {
    folhaDadosInspecao(doc, m);
    marcar('Exames realizados');
  }
  if (tem.checklist) {
    const antes = doc.pdf.getNumberOfPages();
    folhasChecklist(doc, m);
    // As três folhas do checklist saem juntas; a 1ª é a da documentação e as
    // outras duas vêm logo depois, na ordem em que folhasChecklist as emite.
    if (registrar) {
      registrar.set('Verificação da documentação', antes + 1);
      registrar.set('Checklist NR-13 — parte 1', Math.min(antes + 2, doc.pdf.getNumberOfPages()));
      registrar.set('Checklist NR-13 — parte 2', Math.min(antes + 3, doc.pdf.getNumberOfPages()));
    }
  }
  const antesFotosDoc = doc.pdf.getNumberOfPages();
  folhasFotosDocumentacao(doc, m, {
    documentacao: tem.fotosDocumentacao,
    checklist: tem.fotosChecklist,
  });
  if (registrar && doc.pdf.getNumberOfPages() > antesFotosDoc) {
    if (tem.fotosDocumentacao && m.fotosDocumentacao.length > 0) {
      registrar.set('Registro fotográfico — documentação', antesFotosDoc + 1);
    }
    if (tem.fotosChecklist && m.fotosChecklist.length > 0) {
      const inicio = antesFotosDoc + folhasDeFotos(m.fotosDocumentacao, tem.fotosDocumentacao) + 1;
      registrar.set('Registro fotográfico — checklist', Math.min(inicio, doc.pdf.getNumberOfPages()));
    }
  }
  if (tem.exameExterno) {
    const antes = doc.pdf.getNumberOfPages();
    folhasExameExterno(doc, m, tem.fotosExterno);
    marcarExame(registrar, 'Exame externo', 'Registro fotográfico — exame externo', antes, doc, m.visualExterno.fotos, tem.fotosExterno);
  }
  if (tem.exameInterno) {
    const antes = doc.pdf.getNumberOfPages();
    folhasExameInterno(doc, m, tem.fotosInterno);
    marcarExame(registrar, 'Exame interno', 'Registro fotográfico — exame interno', antes, doc, m.visualInterno.fotos, tem.fotosInterno);
  }
  if (tem.ultrassom) {
    folhaUltrassom(doc, m);
    marcar('Medição de espessura por ultrassom');
  }
  if (tem.th) {
    const antes = doc.pdf.getNumberOfPages();
    folhasTesteHidrostatico(doc, m, tem.fotosTh);
    if (registrar) {
      registrar.set('Teste hidrostático', antes + 1);
      if (tem.fotosTh && m.th.fotos.length > 0) {
        registrar.set(
          'Registro fotográfico — teste hidrostático',
          Math.max(antes + 1, doc.pdf.getNumberOfPages() - folhasDeFotos(m.th.fotos, true) + 1),
        );
      }
    }
  }
  if (tem.parecer) {
    folhaParecer(doc, m);
    marcar('Recomendações de segurança');
    marcar('Parecer técnico conclusivo');
    marcar('Data para a próxima inspeção');
  }
}

/** Quantas folhas uma lista de fotos ocupa — 4 por folha, zero se vazia (§5). */
function folhasDeFotos(lista: FotoModelo[], habilitada = true): number {
  return habilitada ? Math.ceil(lista.length / 4) : 0;
}

function marcarExame(
  registrar: Map<string, number> | undefined,
  tituloExame: string,
  tituloFotos: string,
  antes: number,
  doc: Documento,
  fotos: FotoModelo[],
  comFotos = true,
): void {
  if (!registrar) return;
  registrar.set(tituloExame, antes + 1);
  const paginasFotos = folhasDeFotos(fotos, comFotos);
  if (paginasFotos > 0) {
    registrar.set(tituloFotos, Math.max(antes + 1, doc.pdf.getNumberOfPages() - paginasFotos + 1));
  }
}

/**
 * Mede as fotos ANTES de desenhar.
 *
 * O piloto assumia 4:3 e centralizava; foto em retrato ficava com sobra
 * lateral. A proporção real é lida uma vez, aqui, e viaja no modelo.
 */
/**
 * As fotos que estão no COFRE viram imagem.
 *
 * Toda foto de campo posterior a 10/08/2026 é `{ ref }` — caminho no bucket,
 * sem bytes. Este passo baixa cada uma (o cofre local primeiro, o bucket
 * depois) e a devolve como dataURL. Sem ele o documento vetorial saía com ZERO
 * folha de registro fotográfico mesmo com 27 fotos gravadas, e sem erro
 * nenhum: o filtro do modelo descartava tudo que não fosse Base64 (E2E de
 * 05/09/2026).
 *
 * Foto que não resolve é DESCARTADA, não inventada — e o console registra.
 */
async function resolverFotos(lista: FotoModelo[]): Promise<FotoModelo[]> {
  const resolvidas = await Promise.all(
    lista.map(async (f) => {
      if (f.dataUrl.startsWith('data:image') || !f.ref) return f;
      try {
        const blob = await baixarFoto(f.ref);
        if (!blob) return { ...f, dataUrl: '' };
        return { ...f, dataUrl: await blobParaDataUrl(blob) };
      } catch (e) {
        console.error('Falha ao resolver a foto do cofre para o relatório:', f.ref?.path, e);
        return { ...f, dataUrl: '' };
      }
    }),
  );
  return resolvidas.filter((f) => f.dataUrl.startsWith('data:image'));
}

async function comFotosMedidas(m: ModeloRelatorio): Promise<ModeloRelatorio> {
  const [doc, chk, ve, vi, th] = await Promise.all([
    resolverFotos(m.fotosDocumentacao).then(medirFotos),
    resolverFotos(m.fotosChecklist).then(medirFotos),
    resolverFotos(m.visualExterno.fotos).then(medirFotos),
    resolverFotos(m.visualInterno.fotos).then(medirFotos),
    resolverFotos(m.th.fotos).then(medirFotos),
  ]);
  return {
    ...m,
    fotosDocumentacao: doc,
    fotosChecklist: chk,
    visualExterno: { ...m.visualExterno, fotos: ve },
    visualInterno: { ...m.visualInterno, fotos: vi },
    th: { ...m.th, fotos: th },
  };
}

/**
 * Páginas que serão acrescentadas ao fim: folhas de calibração + certificados
 * dos padrões. Zero quando o relatório não leva certificado nenhum.
 */
async function contarPaginasAnexadas(opcoes: OpcoesVetorial): Promise<number> {
  const documentos = opcoes.documentos ?? [];
  if (opcoes.certificados === false || documentos.length === 0) return 0;
  try {
    return (
      contarFolhasDeCertificado(documentos) + (await contarPaginasRastreabilidades(documentos))
    );
  } catch (e) {
    // Falhar a contagem não pode derrubar o relatório: sem ela o total volta a
    // ser só o do corpo, que é o comportamento anterior.
    console.error('Falha ao contar as páginas anexadas; o total usará só o corpo.', e);
    return 0;
  }
}

export async function gerarRelatorioVetorial(
  tag: string,
  opcoes: OpcoesVetorial = {},
): Promise<ResultadoVetorial> {
  const inicio = performance.now();
  const modelo = await comFotosMedidas(montarModeloRelatorio(tag));
  // A placa REAL vem do cofre/bucket, então só dá para resolver aqui — o modelo
  // é montado de forma síncrona. Sem foto, `placaReal` fica `null` e a folha
  // desenha a placa reconstruída.
  modelo.placaReal = await resolverPlacaReal(tag);

  // Bloco 1 · as imagens que o RELATÓRIO trocou (foto de capa, logo).
  //
  // O override guarda o caminho do arquivo no cofre; aqui ele vira a imagem.
  // `branco` (o usuário removeu de propósito) resolve para 'sem imagem' e a
  // área fica vazia — a foto do cadastro NÃO volta sozinha.
  const ovr = opcoes.overrides ?? {};
  const fotoDoRelatorio = await resolverImagem(ovr['capa.foto']?.modo === 'manual' ? ovr['capa.foto'].valor : null);
  if (fotoDoRelatorio) modelo.fotoCapa = fotoDoRelatorio.dataUrl;
  else if (ovr['capa.foto']?.modo === 'branco') modelo.fotoCapa = null;

  // A PLACA do documento: o override vale para ESTE relatório e vence a foto
  // do equipamento. `branco` (o usuário clicou "Remover imagem" na placa) volta
  // para a placa RECONSTRUÍDA — que é informação verdadeira, não um vazio.
  const placaDoRelatorio = await resolverImagem(ovr['placa.foto']?.modo === 'manual' ? ovr['placa.foto'].valor : null);
  if (placaDoRelatorio) {
    modelo.placaReal = { dataUrl: placaDoRelatorio.dataUrl, proporcao: placaDoRelatorio.proporcao ?? 1.6 };
  } else if (ovr['placa.foto']?.modo === 'branco') {
    modelo.placaReal = null;
  }

  const logoDoRelatorio = await resolverImagem(ovr['cabecalho.logo']?.modo === 'manual' ? ovr['cabecalho.logo'].valor : null);
  const logoResolvida = logoDoRelatorio ? logoDoRelatorio.dataUrl : ovr['cabecalho.logo']?.modo === 'branco' ? null : modelo.empresa.logo;

  const novoPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const cab = {
    logo: logoResolvida,
    numeroRelatorio: modelo.numeroRelatorio,
    rodape: [modelo.empresa.razao, modelo.empresa.endereco, modelo.empresa.contato] as [string, string, string],
  };

  // 1ª passagem: contar. O total ainda é desconhecido, então o cabeçalho
  // escreve um número provisório que ninguém verá — este PDF é descartado.
  const contagem = novoPdf();
  await registrarCarlito(contagem);
  const rascunho = new Documento(contagem, cab, 0, opcoes.modo ?? 'final', opcoes.overrides ?? {});
  const tem = secoesPresentes(opcoes.documentos);
  const paginasDasSecoes = new Map<string, number>();
  const respiro: RespiroMedido = {};
  // A 1ª passagem também MEDE o que sobrou no pé das folhas elásticas — a de
  // verificação da documentação e a de ultrassom têm conteúdo curto e fixo, e
  // terminavam no meio do papel. A 2ª passagem distribui essa sobra entre as
  // linhas, em vez de empurrar tudo para um retângulo em branco.
  rascunho.aoFecharSecaoElastica = (m) => {
    respiro[m.chave] = { sobra: m.sobra, linhas: m.linhas, folhaFinal: m.folhaFinal };
  };
  emitir(rascunho, modelo, tem, new Map(), paginasDasSecoes);
  const paginasDoCorpo = contagem.getNumberOfPages();

  // O "de Y" tem que dizer o tamanho do arquivo que o usuário vai receber, e o
  // arquivo inclui os certificados anexados ao fim. Sem esta soma, a última
  // folha de um relatório com certificado dizia "22 de 22" num PDF de 27
  // páginas. Os anexos não são NUMERADOS — são documentos de terceiro e não se
  // carimbam (a própria folha CERTIFICADO-CAL esconde o número em produção) —
  // mas contam no total.
  const anexas = await contarPaginasAnexadas(opcoes);
  const total = paginasDoCorpo + anexas;

  // 2ª passagem: para valer, já com "Página X de Y" correto.
  const desenhar = async (totalDoRodape: number) => {
    const p = novoPdf();
    await registrarCarlito(p);
    const d = new Documento(p, cab, totalDoRodape, opcoes.modo ?? 'final', opcoes.overrides ?? {}, respiro);
    emitir(d, modelo, tem, paginasDasSecoes);
    return d;
  };

  let doc = await desenhar(total);

  // O RODAPÉ NÃO PODE MENTIR: se a 2ª passagem terminar com um número de
  // folhas diferente do que a 1ª contou — o respiro pode mudar uma quebra —,
  // o documento é desenhado de novo com o total certo. Custa uma passagem, e
  // só no caso em que o "de Y" estaria errado.
  if (doc.pdf.getNumberOfPages() !== total - anexas) {
    doc = await desenhar(doc.pdf.getNumberOfPages() + anexas);
  }

  const pdf = doc.pdf;
  let bytes = new Uint8Array(pdf.output('arraybuffer'));
  let paginas = pdf.getNumberOfPages();
  const falhasAnexo: string[] = [];

  // ── CERTIFICADOS ──────────────────────────────────────────────────────────
  // O corpo do relatório é vetor; os certificados entram DEPOIS e preservados.
  // Falha em anexar NÃO invalida o relatório — ela volta nomeada, do mesmo
  // jeito que no gerador raster, para o chamador avisar o usuário.
  const documentos = opcoes.documentos ?? [];
  if (opcoes.certificados !== false && documentos.length > 0) {
    // 1. Folhas de calibração (HTML montado): rasterizadas UMA A UMA.
    try {
      const cal = await anexarFolhasDeCertificado(bytes, documentos, tag);
      if (cal.anexadas > 0) bytes = new Uint8Array(cal.bytes);
      falhasAnexo.push(...cal.falhas);
    } catch (e) {
      console.error('Falha ao anexar as folhas de certificado de calibração:', e);
      falhasAnexo.push('folhas de calibração');
    }
    // 2. Certificados dos padrões: PÁGINAS COPIADAS do PDF original (pdf-lib),
    //    sem rasterizar — é a mesma função que o gerador raster usa.
    try {
      const r = await anexarRastreabilidades(bytes.slice().buffer as ArrayBuffer, documentos);
      if (r.anexados > 0) bytes = new Uint8Array(r.bytes);
      falhasAnexo.push(...r.falhas);
    } catch (e) {
      console.error('Falha ao anexar as rastreabilidades ao relatório vetorial:', e);
      falhasAnexo.push('certificados padrão');
    }
    paginas = (await PDFDocument.load(bytes)).getPageCount();
  }

  return {
    bytes,
    paginas,
    ms: Math.round(performance.now() - inicio),
    modelo,
    falhasAnexo,
    editaveis: doc.editaveis,
  };
}

/**
 * 13D · a PRÉVIA do relatório — o mesmo gerador, em modo `preview`.
 *
 * Existe como função própria para que o caminho seja impossível de confundir
 * com o da emissão: ela devolve **bytes e nada mais**. Não publica artefato,
 * não calcula SHA oficial, não grava `pdfRef`, não toca no histórico, no
 * vencimento nem no Livro. Quem faz tudo isso é `salvarHistorico`, que chama o
 * gerador em modo `final`.
 *
 * Os certificados ficam de FORA da prévia de propósito: cada folha de
 * calibração custa uma rasterização no host isolado, e a prévia é para revisar
 * o corpo do documento. A contagem de páginas do rodapé sai igual à do corpo —
 * e é por isso que a prévia mostra "Página X de Y" do corpo, não do arquivo
 * final com anexos.
 */
export async function gerarPreviaRelatorio(
  tag: string,
  documentos: string[],
  overrides: MapaOverrides = {},
): Promise<{ bytes: Uint8Array; paginas: number; ms: number; editaveis: CampoEditavel[] }> {
  const r = await gerarRelatorioVetorial(tag, {
    documentos,
    certificados: false,
    modo: 'preview',
    overrides,
  });
  return { bytes: r.bytes, paginas: r.paginas, ms: r.ms, editaveis: r.editaveis };
}
