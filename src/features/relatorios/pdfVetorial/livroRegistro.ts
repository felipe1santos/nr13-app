import { CAIXA, COR, FONTE } from './documentoA4';
import type { Documento } from './documento';
import type { ModeloRelatorio } from './modelo';
import { textoOu } from './modelo';
import { imagemEncaixada } from './primitivas';
import type { SecaoRelatorio } from './composicao';

/**
 * Fase 6.2 · 12. LIVRO DE REGISTRO DE SEGURANÇA dentro do relatório vetorial.
 *
 * ## O defeito
 *
 * O assistente oferece "Livro de Registro de Segurança (NR-13)" — e o deixa
 * MARCADO por padrão —, e `montarListaComTermoAbertura` acrescenta a capa do
 * livro e o Termo de Abertura quando o livro da TAG ainda está vazio. O motor
 * vetorial (padrão desde 04/09/2026) não tinha seção nenhuma para essas três
 * folhas: `secoesPresentes` não as casava e o PDF saía byte a byte igual ao de
 * um relatório sem livro. Selecionado na tela, ausente no papel, sem aviso.
 *
 * ## Os quatro conceitos, que não se misturam
 *
 * | | o que é | onde vive | aqui? |
 * |---|---|---|---|
 * | A | o Livro de Registro (documento do equipamento) | `/livro-registro`, `nr13_livro_<TAG>` | não |
 * | B | a folha DESTA inspeção, para colar no livro físico | `LIVRO-REGISTRO.html` na composição | **12.2** |
 * | C | o Termo de Abertura (1ª inspeção do livro, NR-13 13.4.1.9) | `TERMO-ABERTURA.html` auto-injetado | **12.1** |
 * | D | registro oficial lacrado | `nr13_livro_<TAG>` (entrada trancada) | não — nada aqui escreve no livro |
 *
 * A capa do livro (`CAPA-LIVRO-REGISTRO.html`) viaja com o Termo e não vira uma
 * segunda capa: o relatório já tem a sua. O 12.1 é o termo com a identificação.
 *
 * ## Fontes — nenhuma nova
 *
 * O mesmo modelo das outras seções: tipo, datas e código da META; laudo do
 * parecer (`m.laudo`, o mesmo APTO/INAPTO da seção 10); empresa proprietária,
 * equipamento e pressões (na unidade do equipamento, §4) da ficha; assinantes
 * congelados na meta. Só o que nenhuma outra seção usava entrou em
 * `ModeloRelatorio.livro`.
 */

/** Número por extenso (pt-BR) — o do `TERMO-ABERTURA.html`, para as folhas do livro. */
export function numeroPorExtenso(valor: number): string {
  const n = Math.trunc(valor);
  if (!Number.isFinite(n)) return String(valor);
  if (n === 0) return 'zero';
  const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const dez19 = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const tres = (num: number): string => {
    if (num === 0) return '';
    if (num === 100) return 'cem';
    const partes: string[] = [];
    const c = Math.floor(num / 100);
    const resto = num % 100;
    if (c > 0) partes.push(centenas[c]);
    if (resto > 0) {
      if (resto < 10) partes.push(unidades[resto]);
      else if (resto < 20) partes.push(dez19[resto - 10]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(u > 0 ? `${dezenas[d]} e ${unidades[u]}` : dezenas[d]);
      }
    }
    return partes.join(' e ');
  };
  if (n < 1000) return tres(n);
  const milhar = Math.floor(n / 1000);
  const resto = n % 1000;
  let s = milhar === 1 ? 'mil' : `${tres(milhar)} mil`;
  if (resto > 0) s += ` e ${tres(resto)}`;
  return s;
}

/** O Termo de Abertura — a frase do `TERMO-ABERTURA.html`, com o tipo real do equipamento. */
export function textoTermoAbertura(m: ModeloRelatorio): string {
  const total = m.livro.totalFolhas;
  const tipo = m.equipamento['TIPO DE EQUIPAMENTO'] ?? 'Vaso de Pressão';
  // A descrição só entra quando acrescenta informação — "Vaso de Pressão vaso"
  // era o defeito que a folha HTML já tinha corrigido.
  const descricao = m.livro.descricaoEquipamento;
  const complemento = descricao && !descricao.toLowerCase().includes(tipo.toLowerCase().split(' ')[0]) ? ` ${descricao}` : '';
  const fabricante = m.equipamento.FABRICANTE;
  const tag = m.equipamento['IDENTIFICAÇÃO / T.A.G.'] ?? '—';
  return (
    `Este livro contém ${total} (${numeroPorExtenso(total)}) folhas numeradas tipograficamente de 01 a ` +
    `${String(total).padStart(2, '0')} e servirá como Livro de Registro de Segurança do ${tipo}${complemento}` +
    `${fabricante ? `, fabricado por ${fabricante}` : ''}, TAG ${tag}, Número de Série: ${textoOu(m.equipamento['NÚMERO DE SÉRIE'])}, ` +
    `da Empresa ${m.cliente ?? 'EMPRESA NÃO INFORMADA'}, sob o CNPJ: ${m.clienteCnpj ?? 'CNPJ não informado'}, ` +
    `${m.clienteEndereco ?? 'Endereço não informado'}. Em atendimento ao item 13.4.1.9 da Norma Regulamentadora ` +
    `Nº 13, Portaria Nº 1.082, de 18 de dezembro de 2018.`
  );
}

const DESCRITIVO: Record<string, string> = {
  'Inspeção Inicial': 'inicial',
  'Inspeção Periódica': 'periódica',
  'Inspeção Extraordinária': 'extraordinária',
};

/**
 * O Termo de Inspeção do registro — a frase da folha `LIVRO-REGISTRO.html` (modo relatório).
 * As datas são as da seção 7 (`dadosInspecao`, já em pt-BR): o livro não pode datar a
 * inspeção de um jeito e o relatório de outro.
 */
export function textoTermoInspecao(m: ModeloRelatorio): string {
  const tipo = m.tipoInspecao ?? 'Inspeção Periódica';
  const situacao =
    m.laudo.apto === false
      ? 'foi considerado INAPTO a operar nas condições atuais, conforme conclusão do referido relatório'
      : 'está apto a operar dentro da PMTA estipulada';
  return (
    `Em ${textoOu(m.dadosInspecao.dataTermino, '--')}, executou-se inspeção de segurança ${DESCRITIVO[tipo] ?? ''}, conforme item ` +
    `13.5.4 da NR-13, pela empresa habilitada ${m.empresa.razao || 'NOME DA EMPRESA NÃO INFORMADO'}, em obediência ` +
    `à Portaria Mtb nº 3.214, onde o equipamento a que se refere o relatório de inspeção n° ` +
    `${m.numeroRelatorio || '--'} ${situacao}.`
  ).replace(/\s{2,}/g, ' ');
}

/** Os ensaios do registro — os que a composição escolheu, na ordem da folha HTML. */
export function ensaiosDoRegistro(tem: Record<SecaoRelatorio, boolean>): string[] {
  return [
    tem.exameExterno ? 'Exame visual externo' : null,
    tem.exameInterno ? 'Exame visual interno' : null,
    tem.ultrassom ? 'Medição de espessura (ultrassom)' : null,
    tem.th ? 'Teste hidrostático' : null,
  ].filter((e): e is string => e !== null);
}

const TIPOS_DO_LIVRO = ['Inspeção Inicial', 'Inspeção Periódica', 'Inspeção Extraordinária', 'Ocorrência'] as const;

type Assinante = ModeloRelatorio['assinantes'][number];

/** Um bloco de assinatura centrado — rubrica, linha, nome, função, registro. */
function assinaturaUnica(doc: Documento, a: Assinante | undefined): void {
  if (!a) return;
  const largura = 90;
  const x = CAIXA.x + (CAIXA.largura - largura) / 2;
  doc.garantirEspaco(16 + 14 + 6);
  doc.y += 6;
  const base = doc.y;
  if (a.rubrica) {
    try {
      imagemEncaixada(doc.pdf, a.rubrica, { x: x + largura / 2 - 20, y: base, largura: 40, altura: 16 });
    } catch {
      // Rubrica ilegível não impede o registro de sair assinado por nome.
    }
  }
  const yLinha = base + 16;
  doc.pdf.setDrawColor(COR.texto);
  doc.pdf.setLineWidth(0.6 * (25.4 / 72));
  doc.pdf.line(x, yLinha, x + largura, yLinha);
  doc.y = yLinha + 1;
  doc.texto(a.nome, { negrito: true, alinhamento: 'center', x, largura });
  doc.texto(a.funcao, { tamanho: FONTE.mini, alinhamento: 'center', x, largura });
  if (a.registro) doc.texto(`CREA / Registro: ${a.registro}`, { tamanho: FONTE.mini, alinhamento: 'center', x, largura });
}

const porPapel = (m: ModeloRelatorio, papel: Assinante['papel']) => m.assinantes.find((a) => a.papel === papel);

/**
 * 12.1 · TERMO DE ABERTURA — folha própria. Só quando a composição o traz
 * (1ª inspeção do livro). Assinado pelo engenheiro, como a folha HTML.
 */
function folhaTermoAbertura(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('12. LIVRO DE REGISTRO DE SEGURANÇA');
  doc.secao('12.1 TERMO DE ABERTURA');
  doc.texto('NR-13, item 13.4.1.9 — Portaria nº 1.082, de 18 de dezembro de 2018', {
    tamanho: FONTE.nota,
    cor: COR.nota,
  });
  doc.texto(textoTermoAbertura(m), {
    espacoAntes: 3,
    id: 'livro.abertura',
    rotuloCampo: 'Termo de abertura do Livro de Registro',
  });
  const pmta = m.pressoes.find((p) => p.rotulo.startsWith('PMTA'))?.valor;
  const pth = m.pressoes.find((p) => p.rotulo.startsWith('PTH'))?.valor;
  const comUnidade = (v: string | null | undefined) => (v ? `${v} ${m.unidadeLabel}` : '—');
  const codigo = [m.equipamento['CÓDIGO DE PROJETO'], m.equipamento['EDIÇÃO / ADENDA']].filter(Boolean).join(' — ');
  doc.y += 3;
  doc.tabela({
    compacta: true,
    colunas: [0.35, 0.65],
    cabecalho: ['IDENTIFICAÇÃO DO EQUIPAMENTO', ''],
    linhas: (
      [
        ['EMPRESA', m.cliente],
        ['ENDEREÇO', m.clienteEndereco],
        ['FABRICANTE', m.equipamento.FABRICANTE],
        ['TIPO', m.livro.descricaoEquipamento ?? m.equipamento['TIPO DE EQUIPAMENTO']],
        ['Nº DE SÉRIE', m.equipamento['NÚMERO DE SÉRIE']],
        ['PMTA', comUnidade(pmta)],
        ['PRESSÃO DE TESTE HIDROSTÁTICO', comUnidade(pth)],
        ['CÓDIGO DE PROJETO', codigo || null],
        ['FLUIDO', m.equipamento['FLUIDO DE OPERAÇÃO']],
      ] as [string, string | null | undefined][]
    ).map(([rotulo, valor]) => [{ texto: rotulo, rotulo: true }, { texto: textoOu(valor), valor: true }]),
  });
  assinaturaUnica(doc, porPapel(m, 'engenheiro') ?? m.assinantes[0]);
}

/**
 * 12.2 · REGISTRO DESTA INSPEÇÃO — a folha individual do livro, para imprimir
 * e colar na folha numerada correspondente do livro físico.
 */
function folhaRegistro(doc: Documento, m: ModeloRelatorio, tem: Record<SecaoRelatorio, boolean>, comBanner: boolean): void {
  doc.novaFolha();
  if (comBanner) doc.banner('12. LIVRO DE REGISTRO DE SEGURANÇA');
  doc.secao('12.2 REGISTRO DE SEGURANÇA DESTA INSPEÇÃO');
  doc.texto(
    'NR-13, itens 13.5.1.8 / 13.5.4 — folha individual do Livro de Registro de Segurança, para impressão e ' +
      'colagem na folha numerada tipograficamente correspondente do livro físico.',
    { tamanho: FONTE.nota, cor: COR.nota },
  );
  const tipo = m.tipoInspecao ?? 'Inspeção Periódica';
  doc.y += 3;
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    cabecalho: ['INICIAL', 'PERIÓDICA', 'EXTRAORDINÁRIA', 'OCORRÊNCIA'],
    // Marcação, não campo: sem `valor`, a prévia não pinta de amarelo ("a preencher")
    // os tipos que simplesmente não são o desta inspeção.
    linhas: [TIPOS_DO_LIVRO.map((t) => ({ texto: t === tipo ? 'X' : '', centro: true }))],
  });
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'DATA DE INÍCIO', rotulo: true },
        { texto: textoOu(m.dadosInspecao.dataInicio), valor: true, centro: true },
        { texto: 'DATA DE TÉRMINO', rotulo: true },
        { texto: textoOu(m.dadosInspecao.dataTermino), valor: true, centro: true },
      ],
    ],
  });
  doc.texto('Termo de Inspeção:', { negrito: true, espacoAntes: 3 });
  doc.texto(m.livro.termoRascunho ?? textoTermoInspecao(m), {
    id: 'livro.termo',
    rotuloCampo: 'Termo de inspeção do Livro de Registro',
  });
  const ensaios = ensaiosDoRegistro(tem);
  if (ensaios.length > 0) {
    doc.texto('Ensaios / exames realizados:', { negrito: true, espacoAntes: 3 });
    for (const e of ensaios) doc.texto(`• ${e}`);
  }
  if (m.laudo.apto !== null) {
    doc.texto(`Situação: ${m.laudo.apto ? 'APTO' : 'INAPTO'}`, { negrito: true, espacoAntes: 3 });
  }
  const eng = porPapel(m, 'engenheiro');
  const tec = porPapel(m, 'tecnico');
  if (eng || tec) {
    doc.texto('Inspeção realizada por:', { negrito: true, espacoAntes: 3 });
    if (eng) doc.texto(`Profissional Habilitado: ${eng.nome}${eng.registro ? ` — CREA/Registro: ${eng.registro}` : ''}`);
    if (tec) doc.texto(`Técnico / Inspetor: ${tec.nome}`);
  }
  assinaturaUnica(doc, porPapel(m, m.livro.assinanteTermo) ?? eng);
}

/**
 * Emite a seção 12 conforme a composição e devolve em que folha cada
 * subseção começou (para o sumário). Nada é emitido sem a folha na lista.
 */
export function secaoLivroRegistro(
  doc: Documento,
  m: ModeloRelatorio,
  tem: Record<SecaoRelatorio, boolean>,
): { termo?: number; registro?: number } {
  // Cada subseção abre com `novaFolha`: a página dela é a SEGUINTE à atual,
  // anotada antes de desenhar — se o conteúdo quebrar, o sumário aponta a 1ª.
  const paginas: { termo?: number; registro?: number } = {};
  if (tem.termoAbertura) {
    paginas.termo = doc.pdf.getNumberOfPages() + 1;
    folhaTermoAbertura(doc, m);
  }
  if (tem.livro) {
    paginas.registro = doc.pdf.getNumberOfPages() + 1;
    folhaRegistro(doc, m, tem, !tem.termoAbertura);
  }
  return paginas;
}

export const TITULO_LIVRO = 'Livro de registro de segurança';
export const TITULO_TERMO = 'Termo de abertura do livro';
export const TITULO_REGISTRO = 'Registro de segurança desta inspeção';
