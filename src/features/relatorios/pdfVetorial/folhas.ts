import { CAIXA, COR, FONTE, PT, alturaLinha } from './documentoA4';
import { secoesPresentes, type SecaoRelatorio } from './composicao';
import { ALTURA_GRAFICO_TH, desenharGraficoTh, numeroDoTexto, pontosDaCurva } from './graficoTh';
import { foto } from './primitivas';
import { FAMILIA } from './carlito';
import { camposDaPlaca } from '../placaIdentificacao';
import type { CelulaDoc, Documento } from './documento';
import { rotuloLaudo } from './rotulos';
import { textoOu, type ExameVisual, type FotoModelo, type ModeloRelatorio } from './modelo';

/**
 * Fase 11 · as 21 folhas do relatório, na ordem da referência.
 *
 * Cada função recebe o documento (que sabe virar folha) e o modelo (que já leu
 * os dados). Nenhuma delas calcula nada nem toca `localStorage` — se um valor
 * não está no modelo, ele não existe para a folha, e o travessão é a resposta
 * honesta.
 *
 * As folhas que dependem de conteúdo variável — checklist, ultrassom, memorial,
 * fotos — NÃO controlam paginação: elas despejam blocos, e o `Documento` quebra
 * a folha quando precisa. Foi assim que a limitação P3 do piloto (tabela longa
 * passando do fim do papel) deixou de existir.
 */

/**
 * 13D-bis · o identificador SEMÂNTICO de um campo.
 *
 * `equipamento.fabricante`, e nunca `pagina3.linha2.coluna1`: a paginação muda
 * quando um checklist cresce, e um id posicional passaria a apontar para outro
 * campo — o override do fabricante apareceria no número de série.
 *
 * O slug sai do RÓTULO impresso, que é o nome documental do campo. Rótulo é o
 * que o usuário lê, o que o gate das 21 folhas vai conferir contra a referência
 * e o que menos muda; quando um rótulo mudar de fato, o override antigo deixa
 * de casar e o campo volta ao automático — degradação segura, sem valor
 * manual pousando no campo errado.
 */
export function idCampo(prefixo: string, rotulo: string): string {
  const slug = rotulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefixo}.${slug}`;
}

function tabelaChaveValor(
  doc: Documento,
  campos: [string, string | null][],
  colunas = 2,
  prefixo?: string,
): void {
  const linhas: CelulaDoc[][] = [];
  const passo = colunas;
  for (let i = 0; i < campos.length; i += passo) {
    const linha: CelulaDoc[] = [];
    for (let k = 0; k < passo; k++) {
      const par = campos[i + k];
      linha.push({ texto: par ? par[0] : '', rotulo: !!par });
      linha.push({
        texto: par ? textoOu(par[1]) : '',
        valor: true,
        ...(par && prefixo ? { id: idCampo(prefixo, par[0]), rotuloCampo: par[0] } : {}),
      });
    }
    linhas.push(linha);
  }
  const largura = colunas === 2 ? [0.22, 0.28, 0.22, 0.28] : [0.3, 0.7];
  doc.tabela({ colunas: largura, linhas });
}

function blocoExame(doc: Documento, titulo: string, exame: ExameVisual, prefixo = 'exame'): void {
  doc.banner(titulo);
  if (exame.itens.length > 0) {
    doc.tabela({
      compacta: true,
      colunas: [0.07, 0.63, 0.3],
      cabecalho: ['ITEM', 'VERIFICAÇÃO', 'RESULTADO'],
      linhas: exame.itens.map((it, i) => [
        { texto: String(i + 1), centro: true },
        { texto: it.observacao ? `${it.titulo}\n${it.observacao}` : it.titulo },
        { texto: it.resposta, centro: true, valor: true },
      ]),
    });
  } else {
    doc.texto('Sem itens registrados para este exame nesta inspeção.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 2,
    });
  }

  doc.secao('Observações gerais');
  doc.texto(textoOu(exame.observacoes, 'Sem observações.'), {
    cor: COR.valor,
    id: `${prefixo}.observacoes`,
    rotuloCampo: 'Observações gerais',
  });

  doc.secao('Conclusão técnica');
  doc.texto(textoOu(exame.conclusao ?? exame.resultado), {
    cor: COR.valor,
    id: `${prefixo}.conclusao`,
    rotuloCampo: 'Conclusão técnica',
  });
}

/**
 * Folha de registro fotográfico — e ela SÓ EXISTE se houver foto.
 *
 * Até o hardening da Fase 11 esta função abria a folha ANTES de olhar a lista:
 * uma inspeção sem foto do exame interno saía com uma página inteira dizendo
 * "sem registro fotográfico nesta etapa". Cinco etapas sem foto viravam cinco
 * páginas vazias dentro de um documento assinado por engenheiro — e a ausência
 * de foto já está dita no corpo do exame, que é onde ela significa alguma coisa.
 *
 * A regra agora é a contagem, sem exceção: 0 fotos → 0 folhas; 1–4 → 1;
 * 5–8 → 2; 9–12 → 3. Quem distribui dentro da folha é `doc.fotos` (4 por folha,
 * §5, proporção real e `contain`); quem conta as folhas é `folhasDeFotos`.
 */
function folhaDeFotos(doc: Documento, titulo: string, lista: FotoModelo[]): void {
  if (lista.length === 0) return;
  doc.novaFolha();
  const banner = () => doc.banner(titulo);
  banner();
  doc.fotos(lista, banner);
}

// ── 1. CAPA ─────────────────────────────────────────────────────────────────
export function folhaCapa(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.texto('Relatório de Inspeção de Segurança', {
    tamanho: FONTE.tituloDoc,
    negrito: true,
    alinhamento: 'center',
    espacoAntes: 4,
    id: 'capa.titulo',
    rotuloCampo: 'Título do documento',
  });
  doc.texto(`${textoOu(m.equipamento['TIPO DE EQUIPAMENTO'], 'Equipamento')} — NR-13`, {
    tamanho: FONTE.subtituloDoc,
    negrito: true,
    alinhamento: 'center',
    id: 'capa.subtitulo',
    rotuloCampo: 'Subtítulo do documento',
  });
  // A referência traz a Portaria logo abaixo do subtítulo; é texto PADRÃO do
  // documento (não dado do equipamento), e por isso nasce como default
  // editável — quem precisar citar outra portaria reescreve neste relatório.
  doc.texto('(Portaria nº 1.082, de 18 de dezembro de 2018)', {
    tamanho: FONTE.sigla,
    italico: true,
    cor: '#6a6a6a',
    alinhamento: 'center',
    espacoAntes: 0.8,
    id: 'capa.portaria',
    rotuloCampo: 'Portaria de referência',
  });

  doc.y += 2;
  // Tabela superior da referência: quatro colunas, três linhas.
  doc.tabela({
    colunas: [0.22, 0.36, 0.14, 0.28],
    linhas: [
      [
        { texto: 'EQUIPAMENTO', rotulo: true },
        { texto: textoOu(m.equipamento['TIPO DE EQUIPAMENTO']), valor: true, id: 'capa.equipamento', rotuloCampo: 'Equipamento' },
        { texto: 'T.A.G.', rotulo: true },
        { texto: textoOu(m.tag), valor: true, id: 'capa.tag', rotuloCampo: 'T.A.G.' },
      ],
      [
        { texto: 'CLASSE DO FLUIDO', rotulo: true },
        { texto: textoOu(m.equipamento['CLASSE DO FLUIDO']), valor: true, id: 'capa.classe-do-fluido', rotuloCampo: 'Classe do fluido' },
        { texto: 'GRUPO', rotulo: true },
        { texto: textoOu(m.categoria.grupo), valor: true, id: 'capa.grupo', rotuloCampo: 'Grupo de risco' },
      ],
      [
        { texto: 'CATEGORIA DO VASO', rotulo: true },
        { texto: textoOu(m.categoria.catFinal), valor: true, id: 'capa.categoria', rotuloCampo: 'Categoria' },
        { texto: 'VALIDADE', rotulo: true },
        { texto: textoOu(m.validade), valor: true, id: 'capa.validade', rotuloCampo: 'Validade da inspeção' },
      ],
    ],
  });

  // ── A FOTO PRINCIPAL, ELÁSTICA ──────────────────────────────────────────
  //
  // A referência usa `flex: 1 1 auto` com base de 92 mm: a foto OCUPA o que
  // sobra entre as duas tabelas. Era isto que faltava — com 92 mm fixos e a
  // foto no fim da folha, a capa do Modelo Novo terminava com um terço do
  // papel em branco. Aqui a altura é calculada: o que resta até o rodapé,
  // menos a tabela de baixo (6 linhas) e os respiros.
  const ALTURA_TABELA_INFERIOR = 6 * (alturaLinha(FONTE.tabela) + 1.2) + 2;
  const disponivel = doc.espacoRestante - ALTURA_TABELA_INFERIOR - 6;
  const alturaFoto = Math.max(40, Math.min(disponivel, 150));
  doc.y += 3;
  doc.areaImagem({
    id: 'capa.foto',
    rotulo: 'Foto do equipamento (capa)',
    dataUrl: m.fotoCapa,
    altura: alturaFoto,
    convite: 'Clique para adicionar a foto do equipamento',
  });
  doc.y += 3;

  // ── BLOCO INFERIOR DE DADOS ─────────────────────────────────────────────
  doc.tabela({
    colunas: [0.26, 0.74],
    linhas: [
      [
        { texto: 'Nº DO RELATÓRIO', rotulo: true },
        { texto: textoOu(m.numeroRelatorio), valor: true, id: 'capa.n-do-relatorio', rotuloCampo: 'Nº do relatório' },
      ],
      [
        { texto: 'Nº DA A.R.T. (CREA)', rotulo: true },
        // A A.R.T. não existe como cadastro no sistema. Nasce como campo
        // DOCUMENTAL vazio: amarelo na prévia, preenchido à mão, e nada é
        // inventado quando ninguém preenche.
        { texto: '', valor: true, id: 'capa.art', rotuloCampo: 'Nº da A.R.T. (CREA)' },
      ],
      [
        { texto: 'DATA DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.execucao ?? m.emissao), valor: true, id: 'capa.data-da-inspecao', rotuloCampo: 'Data da inspeção' },
      ],
      [
        { texto: 'SOLICITANTE / CONTRATANTE', rotulo: true },
        { texto: textoOu(m.cliente), valor: true, id: 'capa.contratante', rotuloCampo: 'Solicitante / contratante' },
      ],
      [
        { texto: 'ENDEREÇO', rotulo: true },
        { texto: textoOu(m.clienteEndereco), valor: true, id: 'capa.endereco', rotuloCampo: 'Endereço' },
      ],
      [
        { texto: 'RESPONSÁVEL TÉCNICO', rotulo: true },
        {
          texto: [textoOu(m.responsavel.nome), `CREA: ${textoOu(m.responsavel.registro)}`].join('   •   '),
          valor: true,
          id: 'capa.responsavel',
          rotuloCampo: 'Responsável técnico e CREA',
        },
      ],
    ],
  });
}
// ── 2. SUMÁRIO / OBJETIVO / REFERÊNCIAS ─────────────────────────────────────
export function folhaSumario(doc: Documento, m: ModeloRelatorio, secoes: string[]): void {
  doc.novaFolha();
  doc.banner('SUMÁRIO GERAL');
  doc.tabela({
    compacta: true,
    colunas: [0.12, 0.88],
    cabecalho: ['ITEM', 'SEÇÃO'],
    linhas: secoes.map((s, i) => [{ texto: String(i + 1), centro: true }, { texto: s }]),
  });

  doc.banner('1. OBJETIVO');
  // Texto PADRÃO do sistema: o usuário pode manter, reescrever ou apagar, e
  // "Restaurar automático" devolve exatamente esta redação.
  doc.texto(
    `Este relatório apresenta o resultado da ${textoOu(m.tipoInspecao, 'inspeção')} de segurança do ` +
      `equipamento ${m.tag}, realizada conforme a Norma Regulamentadora NR-13 do Ministério do ` +
      'Trabalho e Emprego, com o objetivo de avaliar as condições de integridade e de segurança ' +
      'operacional do equipamento.',
    { id: 'objetivo.texto', rotuloCampo: 'Objetivo do relatório' },
  );

  doc.banner('2. DOCUMENTOS DE REFERÊNCIA');
  doc.tabela({
    compacta: true,
    colunas: [0.3, 0.7],
    linhas: [
      [
        { texto: 'NR-13', rotulo: true },
        {
          texto: 'Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos de Armazenamento',
          id: 'referencias.nr13',
          rotuloCampo: 'Referência NR-13',
        },
      ],
      [
        { texto: 'ASME Seção VIII Div. 1', rotulo: true },
        {
          texto: 'Regras para construção de vasos de pressão',
          id: 'referencias.asme-viii',
          rotuloCampo: 'Referência ASME VIII',
        },
      ],
      [
        { texto: 'ASME Seção V', rotulo: true },
        { texto: 'Ensaios não destrutivos', id: 'referencias.asme-v', rotuloCampo: 'Referência ASME V' },
      ],
    ],
  });
}

// ── 3. IDENTIFICAÇÃO / PLACA ────────────────────────────────────────────────
export function folhaIdentificacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('3. IDENTIFICAÇÃO DO EQUIPAMENTO — PLACA');
  tabelaChaveValor(doc, Object.entries(m.equipamento) as [string, string | null][], 2, 'equipamento');

  doc.faixa('PRESSÕES');
  doc.tabela({
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar'],
    // Pressão é campo CALCULADO, e mesmo assim recebe override: a revisão
    // integral antes da emissão é o requisito. O cálculo do sistema não muda —
    // o override vive na chave do relatório e só altera o que este documento
    // imprime.
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true, id: idCampo('pressoes', p.rotulo + ' MPa'), rotuloCampo: `${p.rotulo} (MPa)` },
      { texto: textoOu(p.kgf), centro: true, valor: true, id: idCampo('pressoes', p.rotulo + ' kgf'), rotuloCampo: `${p.rotulo} (kgf/cm²)` },
      { texto: textoOu(p.bar), centro: true, valor: true, id: idCampo('pressoes', p.rotulo + ' bar'), rotuloCampo: `${p.rotulo} (bar)` },
    ]),
  });

  doc.faixa('DATAS');
  doc.tabela({
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'EXECUÇÃO DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.execucao), valor: true, id: 'datas.execucao', rotuloCampo: 'Execução da inspeção' },
        { texto: 'VALIDADE DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.validade), valor: true, id: 'datas.validade', rotuloCampo: 'Validade da inspeção' },
      ],
    ],
  });

  blocoPlaca(doc, m);
}

/** Altura reservada à placa — a mesma `.foto-larga` da referência (62mm). */
export const ALTURA_PLACA = 62;

/**
 * A placa de identificação: a FOTO REAL quando existe, a RECONSTRUÍDA quando não.
 *
 * A foto prevalece porque ela é o equipamento; a reconstrução é a leitura que o
 * sistema faz da ficha. Quando as duas existissem juntas, a foto é a que um
 * fiscal confere.
 */
export function blocoPlaca(doc: Documento, m: ModeloRelatorio): void {
  doc.faixa('PLACA DE IDENTIFICAÇÃO');
  doc.garantirEspaco(ALTURA_PLACA + 2);
  const topo = doc.y;
  if (m.placaReal) {
    // `foto` já encaixa DENTRO do quadro mantendo a proporção medida — é o
    // "contain" pedido, e é o que impede a placa de sair esticada.
    foto(doc.pdf, m.placaReal.dataUrl, { x: CAIXA.x, y: topo, largura: CAIXA.largura, altura: ALTURA_PLACA }, m.placaReal.proporcao);
  } else {
    desenharPlacaReconstruida(doc, m, topo);
  }
  doc.y = topo + ALTURA_PLACA;
}

/**
 * A placa RECONSTRUÍDA — desenhada, não fotografada.
 *
 * Texto, linhas e moldura em vetor: é o mesmo motor que desenha o resto do
 * documento, então a placa fica selecionável e nítida em qualquer zoom. Nenhum
 * dado é inventado: campo sem valor na ficha sai com o travessão do documento.
 */
function desenharPlacaReconstruida(doc: Documento, m: ModeloRelatorio, topo: number): void {
  const campos = camposDaPlaca(m.equipamento, m.pressoes);
  const largura = CAIXA.largura * 0.72;
  const x = CAIXA.x + (CAIXA.largura - largura) / 2;
  const alturaTitulo = 8;
  const linhas = Math.ceil(campos.length / 2);
  const alturaLinhaPlaca = (ALTURA_PLACA - alturaTitulo - 4) / linhas;
  const y0 = topo + 2;

  doc.pdf.setDrawColor(COR.texto);
  doc.pdf.setLineWidth(0.8 * PT);
  doc.pdf.rect(x, y0, largura, ALTURA_PLACA - 4);

  // Faixa do título, com o nome da empresa executante — é o que uma placa traz.
  doc.pdf.setFillColor(COR.fundoCabecalhoTabela);
  doc.pdf.rect(x, y0, largura, alturaTitulo, 'F');
  doc.pdf.setLineWidth(0.6 * PT);
  doc.pdf.line(x, y0 + alturaTitulo, x + largura, y0 + alturaTitulo);
  doc.pdf.setFont(FAMILIA, 'bold');
  doc.pdf.setFontSize(FONTE.banner);
  doc.pdf.setTextColor(COR.texto);
  doc.pdf.text('PLACA DE IDENTIFICAÇÃO — NR-13', x + largura / 2, y0 + alturaTitulo * 0.68, { align: 'center' });

  const meia = largura / 2;
  campos.forEach((campo, i) => {
    const coluna = i % 2;
    const linha = Math.floor(i / 2);
    const cx = x + coluna * meia;
    const cy = y0 + alturaTitulo + linha * alturaLinhaPlaca;
    doc.pdf.setDrawColor(COR.bordaTabela);
    doc.pdf.setLineWidth(0.4 * PT);
    if (linha > 0) doc.pdf.line(cx, cy, cx + meia, cy);
    if (coluna === 1) doc.pdf.line(cx, cy, cx, cy + alturaLinhaPlaca);

    doc.pdf.setFont(FAMILIA, 'bold');
    doc.pdf.setFontSize(FONTE.nota);
    doc.pdf.setTextColor(COR.texto);
    doc.pdf.text(campo[0], cx + 2, cy + alturaLinhaPlaca * 0.42);

    doc.pdf.setFont(FAMILIA, 'normal');
    doc.pdf.setFontSize(FONTE.tabela);
    doc.pdf.setTextColor(COR.valor);
    // A placa é DESENHADA à mão (não é tabela), então o override e a caixa
    // clicável vêm por `campoLivre`. Ela é reconstrução da ficha: corrigir o
    // texto aqui é justamente o caso de uso — a placa física pode dizer outra
    // coisa do que o cadastro.
    const valorPlaca = doc.campoLivre(
      idCampo('placa', campo[0]),
      `Placa — ${campo[0]}`,
      textoOu(campo[1]),
      { x: cx, y: cy, larg: meia, alt: alturaLinhaPlaca },
    );
    doc.pdf.text(textoOu(valorPlaca), cx + 2, cy + alturaLinhaPlaca * 0.85);
  });
}

// ── 4. CATEGORIZAÇÃO DE RISCO ───────────────────────────────────────────────
export function folhaCategorizacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('4. CATEGORIZAÇÃO DE RISCO');
  doc.tabela({
    colunas: [0.35, 0.65],
    linhas: [
      [
        { texto: 'CLASSE DO FLUIDO', rotulo: true },
        { texto: textoOu(m.equipamento['CLASSE DO FLUIDO']), valor: true, id: 'categoria.classe-do-fluido', rotuloCampo: 'Classe do fluido' },
      ],
      [
        { texto: 'GRUPO DE POTENCIAL DE RISCO', rotulo: true },
        { texto: textoOu(m.categoria.grupo), valor: true, id: 'categoria.grupo', rotuloCampo: 'Grupo de potencial de risco' },
      ],
      [
        { texto: 'VOLUME (m³)', rotulo: true },
        { texto: textoOu(m.categoria.volume), valor: true, id: 'categoria.volume', rotuloCampo: 'Volume (m³)' },
      ],
      [
        { texto: 'CATEGORIA DO EQUIPAMENTO', rotulo: true },
        { texto: textoOu(m.categoria.catFinal), valor: true, id: 'categoria.categoria', rotuloCampo: 'Categoria do equipamento' },
      ],
      [
        { texto: 'ENQUADRAMENTO NA NR-13', rotulo: true },
        { texto: textoOu(m.categoria.enquadramento), valor: true, id: 'categoria.enquadramento', rotuloCampo: 'Enquadramento na NR-13' },
      ],
    ],
  });
  doc.texto(
    'A categorização segue o item 13.5.1.2 da NR-13: o grupo de potencial de risco resulta do ' +
      'produto pressão × volume, e a categoria, do cruzamento desse grupo com a classe do fluido.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 3, id: 'categoria.nota', rotuloCampo: 'Nota da categorização' },
  );
}

// ── 5. DADOS TÉCNICOS / PRONTUÁRIO ──────────────────────────────────────────
export function folhaDadosTecnicos(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('5. DADOS TÉCNICOS DO EQUIPAMENTO — PRONTUÁRIO');

  doc.faixa('DADOS GERAIS');
  tabelaChaveValor(
    doc,
    [
      ['CONTRATANTE', m.prontuario.contratante],
      ['ENDEREÇO', m.prontuario.endereco],
    ],
    1,
    'prontuario',
  );

  doc.faixa('ASPECTOS CONSTRUTIVOS');
  tabelaChaveValor(
    doc,
    [
      ['MATERIAL DO CORPO', m.prontuario.materialCorpo],
      ['TIPO DE CONSTRUÇÃO', m.prontuario.tipoConstrucao],
      ['MATERIAL DO TAMPO 1', m.prontuario.materialTampo1],
      ['MATERIAL DO TAMPO 2', m.prontuario.materialTampo2],
      ['VOLUME (m³)', m.prontuario.volume],
      ['PRESSÃO DE PROJETO', m.prontuario.pressaoProjeto],
      ['MARGEM DE CORROSÃO (mm)', m.prontuario.margemCorrosao],
      ['TEMPERATURA DE PROJETO (°C)', m.prontuario.temperaturaProjeto],
    ],
    2,
    'prontuario',
  );
  doc.tabela({
    colunas: [0.3, 0.7],
    linhas: [
      [
        { texto: 'DESCRIÇÃO RESUMIDA', rotulo: true },
        {
          texto: textoOu(m.prontuario.descricaoResumida),
          valor: true,
          id: 'prontuario.descricao-resumida',
          rotuloCampo: 'Descrição resumida',
          multilinha: true,
        },
      ],
    ],
  });

  // ASPECTOS OPERACIONAIS — MPa · psi · kgf/cm², as unidades da referência.
  // Os três valores saem convertidos do MESMO número em MPa; nenhuma coluna é
  // apenas renomeada.
  doc.faixa('ASPECTOS OPERACIONAIS');
  doc.tabela({
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'psi', 'kgf/cm²'],
    linhas: m.operacionais.map((o) => [
      { texto: o.rotulo, rotulo: true },
      { texto: textoOu(o.mpa), centro: true, valor: true, id: idCampo('operacionais', o.rotulo + ' MPa'), rotuloCampo: `${o.rotulo} (MPa)` },
      { texto: textoOu(o.psi), centro: true, valor: true, id: idCampo('operacionais', o.rotulo + ' psi'), rotuloCampo: `${o.rotulo} (psi)` },
      { texto: textoOu(o.kgf), centro: true, valor: true, id: idCampo('operacionais', o.rotulo + ' kgf'), rotuloCampo: `${o.rotulo} (kgf/cm²)` },
    ]),
  });
  doc.texto(
    'Legenda: PMO — Pressão Máxima de Operação · PMTA — Pressão Máxima de Trabalho Admissível · ' +
      'PTH — Pressão de Teste Hidrostático.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 1.2, id: 'prontuario.legenda', rotuloCampo: 'Legenda das pressões' },
  );

  doc.faixa('CATEGORIZAÇÃO DO EQUIPAMENTO');
  doc.tabela({
    colunas: [0.32, 0.18, 0.2, 0.3],
    linhas: [
      [
        { texto: 'RELAÇÃO: P (kPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.pvKpa), centro: true, valor: true, id: 'categorizacao.pv-kpa', rotuloCampo: 'P (kPa) × V' },
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.resultadoEnquadramento), valor: true, id: 'categorizacao.resultado-enquadramento', rotuloCampo: 'Resultado do enquadramento' },
      ],
      [
        { texto: 'RELAÇÃO: P (MPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.pvMpa), centro: true, valor: true, id: 'categorizacao.pv-mpa', rotuloCampo: 'P (MPa) × V' },
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.resultadoGrupo), valor: true, id: 'categorizacao.resultado-grupo', rotuloCampo: 'Resultado do grupo de risco' },
      ],
      [
        { texto: 'CLASSIFICAÇÃO DO FLUIDO', rotulo: true },
        { texto: textoOu(m.equipamento['CLASSE DO FLUIDO']), centro: true, valor: true, id: 'categorizacao.classificacao-fluido', rotuloCampo: 'Classificação do fluido' },
        { texto: 'GRUPO / CATEGORIA', rotulo: true },
        {
          texto: `${textoOu(m.categoria.grupo)} / ${textoOu(m.categoria.catFinal)}`,
          valor: true,
          id: 'categorizacao.grupo-categoria',
          rotuloCampo: 'Grupo / categoria',
        },
      ],
    ],
  });

  // Bloco textual: não existe fonte automática para observações do prontuário.
  // Nasce vazio (amarelo na prévia) e o engenheiro escreve o que precisa.
  doc.secao('OBSERVAÇÕES E PENDÊNCIAS DO PRONTUÁRIO');
  doc.texto('', {
    cor: COR.valor,
    id: 'prontuario.observacoes',
    rotuloCampo: 'Observações e pendências do prontuário',
  });
}
// ── 6. RESUMO DOS CÁLCULOS ──────────────────────────────────────────────────
export function folhaResumoCalculos(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('6. RESUMO DE CÁLCULOS DA PMTA E ESPESSURA MÍNIMA');
  doc.tabela({
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar'],
    linhas: m.pressoes.map((pr) => [
      { texto: pr.rotulo, rotulo: true },
      { texto: textoOu(pr.mpa), centro: true, valor: true, id: idCampo('pressoes', pr.rotulo + ' MPa'), rotuloCampo: `${pr.rotulo} (MPa)` },
      { texto: textoOu(pr.kgf), centro: true, valor: true, id: idCampo('pressoes', pr.rotulo + ' kgf'), rotuloCampo: `${pr.rotulo} (kgf/cm²)` },
      { texto: textoOu(pr.bar), centro: true, valor: true, id: idCampo('pressoes', pr.rotulo + ' bar'), rotuloCampo: `${pr.rotulo} (bar)` },
    ]),
  });

  // ── PARÂMETROS POR COMPONENTE ───────────────────────────────────────────
  //
  // A referência dedica uma FAIXA a cada componente (casco, tampo superior,
  // tampo inferior) com oito parâmetros. Todos já existiam em
  // `nr13_calc_<TAG>.componentes[]`, gravados pelo motor do memorial: E, S,
  // raio, margem de corrosão, espessura comercial medida, espessura mínima e a
  // PMTA daquele componente. Nada é recalculado aqui — o relatório apresenta.
  //
  // A tabela do `Documento` já quebra entre folhas repetindo o cabeçalho, então
  // um equipamento com muitos componentes pagina sozinho, sem corte.
  for (const c of m.componentes) {
    doc.faixa(`PARÂMETROS E RESULTADOS: ${c.nome.toUpperCase()}`);
    const pref = idCampo('componente', c.nome);
    doc.tabela({
      compacta: true,
      colunas: [0.28, 0.22, 0.28, 0.22],
      linhas: [
        [
          { texto: 'ESPESSURA MÍN. CALCULADA (t)', rotulo: true },
          { texto: textoOu(c.espReq), centro: true, valor: true, id: `${pref}.esp-min-calculada`, rotuloCampo: `${c.nome} — espessura mínima calculada` },
          { texto: 'PMTA CALCULADA (P)', rotulo: true },
          { texto: textoOu(c.pmta), centro: true, valor: true, id: `${pref}.pmta`, rotuloCampo: `${c.nome} — PMTA calculada` },
        ],
        [
          { texto: 'EFICIÊNCIA DA JUNTA (E)', rotulo: true },
          { texto: textoOu(c.e), centro: true, valor: true, id: `${pref}.eficiencia`, rotuloCampo: `${c.nome} — eficiência da junta` },
          { texto: 'ESP. MÍN. MEDIDA (t)', rotulo: true },
          { texto: textoOu(c.espNom), centro: true, valor: true, id: `${pref}.esp-medida`, rotuloCampo: `${c.nome} — espessura medida` },
        ],
        [
          { texto: 'MARGEM DE CORROSÃO (c)', rotulo: true },
          { texto: textoOu(c.ca), centro: true, valor: true, id: `${pref}.margem`, rotuloCampo: `${c.nome} — margem de corrosão` },
          { texto: 'RAIO INTERNO (Ri)', rotulo: true },
          { texto: textoOu(c.raio), centro: true, valor: true, id: `${pref}.raio`, rotuloCampo: `${c.nome} — raio interno` },
        ],
        [
          { texto: 'MATERIAL', rotulo: true },
          { texto: textoOu(c.material), centro: true, valor: true, id: `${pref}.material`, rotuloCampo: `${c.nome} — material` },
          { texto: 'TENSÃO ADMISSÍVEL (S)', rotulo: true },
          { texto: textoOu(c.s), centro: true, valor: true, id: `${pref}.tensao`, rotuloCampo: `${c.nome} — tensão admissível` },
        ],
      ],
    });
  }

  doc.secao('Conclusão do cálculo');
  doc.texto(
    m.componentes.length > 0
      ? `A PMTA do equipamento é a MENOR entre as ${m.componentes.length} PMTA calculadas por componente.`
      : 'Sem cálculo de componentes registrado para este equipamento.',
    { cor: COR.valor, id: 'resumo.conclusao', rotuloCampo: 'Conclusão do cálculo' },
  );
}
// ── 7. MEMÓRIA DE CÁLCULO (quantas folhas forem precisas) ───────────────────
export function folhasMemoria(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('6.1 MEMÓRIA DE CÁLCULO DA PMTA E ESPESSURA MÍNIMA');
  if (m.memorial.length === 0) {
    doc.texto('Memorial de cálculo não salvo para este equipamento.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 2,
    });
    return;
  }
  // As linhas vêm do MESMO extrator do template (`linhasMemorial`). A quebra
  // entre folhas é do documento — não há orçamento de linhas a manter aqui,
  // porque quem mede a folha é quem desenha.
  for (const linha of m.memorial) {
    const titulo = /^MEMORIAL DE C[ÁA]LCULO\b/i.test(linha);
    doc.texto(linha, {
      tamanho: titulo ? FONTE.secao : FONTE.tabela,
      negrito: titulo,
      espacoAntes: titulo ? 2.5 : 0,
    });
  }
}

// ── 8. DADOS GERAIS DA INSPEÇÃO ─────────────────────────────────────────────
export function folhaDadosInspecao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('7. EXAMES REALIZADOS — DADOS GERAIS DA INSPEÇÃO');
  doc.tabela({
    colunas: [0.3, 0.7],
    linhas: [
      [{ texto: 'NATUREZA DA INSPEÇÃO', rotulo: true }, { texto: textoOu(m.tipoInspecao), valor: true }],
      [{ texto: 'DATA DE EXECUÇÃO', rotulo: true }, { texto: textoOu(m.execucao), valor: true }],
      [
        { texto: 'ENSAIOS REALIZADOS', rotulo: true },
        {
          texto: textoOu(
            [
              m.visualExterno.itens.length || m.visualExterno.fotos.length ? 'Exame visual externo' : '',
              m.visualInterno.itens.length || m.visualInterno.fotos.length ? 'Exame visual interno' : '',
              m.ultrassom.pontos.length ? 'Medição de espessura (ultrassom)' : '',
              m.th.pressaoTeste ? 'Teste hidrostático' : '',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
          valor: true,
        },
      ],
      [
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(rotuloLaudo(m.laudo.apto)), valor: true },
      ],
    ],
  });
}

// ── 9 a 11. CHECKLIST NR-13 ─────────────────────────────────────────────────
export function folhasChecklist(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('7.1 CHECKLIST NR-13 — VERIFICAÇÃO E RESULTADOS');
  if (m.checklist.length === 0) {
    doc.texto('Nenhum item de checklist respondido nesta inspeção.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 2,
    });
    return;
  }
  // O layout base é de 2 folhas (decisão C do dono); se o conteúdo real passar,
  // a paginação automática abre a terceira. NENHUM item é cortado para forçar
  // duas páginas — a evidência de inspeção não se ajusta ao papel.
  for (const secao of m.checklist) {
    doc.faixa(secao.titulo.toUpperCase());
    doc.tabela({
      compacta: true,
      colunas: [0.07, 0.63, 0.3],
      cabecalho: ['ITEM', 'VERIFICAÇÃO', 'RESULTADO'],
      linhas: secao.itens.map((it, i) => [
        { texto: String(i + 1), centro: true },
        { texto: it.observacao ? `${it.titulo}\n${it.observacao}` : it.titulo },
        { texto: it.resposta, centro: true, valor: true },
      ]),
    });
  }
  if (m.comentariosDocumentacao) {
    doc.secao('Comentários sobre a documentação');
    doc.texto(m.comentariosDocumentacao, { cor: COR.valor });
  }
}

// ── 12. FOTOS DA DOCUMENTAÇÃO · e as do checklist ───────────────────────────
export function folhasFotosDocumentacao(
  doc: Documento,
  m: ModeloRelatorio,
  tem: { documentacao?: boolean; checklist?: boolean } = {},
): void {
  if (tem.documentacao !== false) folhaDeFotos(doc, '8. REGISTRO FOTOGRÁFICO — DOCUMENTAÇÃO', m.fotosDocumentacao);
  if (tem.checklist !== false) folhaDeFotos(doc, '8.0 REGISTRO FOTOGRÁFICO — CHECKLIST', m.fotosChecklist);
}

// ── 13 a 16. EXAMES VISUAIS E SUAS FOTOS ────────────────────────────────────
export function folhasExameExterno(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  blocoExame(doc, '7.2 EXAME EXTERNO (INSPEÇÃO VISUAL EXTERNA)', m.visualExterno, 'exameExterno');
  if (comFotos) folhaDeFotos(doc, '8.1 REGISTRO FOTOGRÁFICO — EXAME EXTERNO', m.visualExterno.fotos);
}

export function folhasExameInterno(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  blocoExame(doc, '7.3 EXAME INTERNO (INSPEÇÃO VISUAL INTERNA)', m.visualInterno, 'exameInterno');
  if (comFotos) folhaDeFotos(doc, '8.2 REGISTRO FOTOGRÁFICO — EXAME INTERNO', m.visualInterno.fotos);
}

// ── 17. ULTRASSOM ───────────────────────────────────────────────────────────
export function folhaUltrassom(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('7.4 MEDIÇÃO DE ESPESSURA POR ULTRASSOM');
  doc.faixa('INFORMAÇÕES PARA O ENSAIO');
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'APARELHO', rotulo: true },
        { texto: textoOu(m.ultrassom.aparelho), valor: true, id: 'ultrassom.aparelho', rotuloCampo: 'Aparelho' },
        { texto: 'ACOPLANTE', rotulo: true },
        { texto: textoOu(m.ultrassom.acoplante), valor: true, id: 'ultrassom.acoplante', rotuloCampo: 'Acoplante' },
      ],
      [
        { texto: 'TEMP. DA SUPERFÍCIE', rotulo: true },
        { texto: textoOu(m.ultrassom.tempSup), valor: true, id: 'ultrassom.temperatura', rotuloCampo: 'Temperatura da superfície' },
        { texto: 'ESTADO DA SUPERFÍCIE', rotulo: true },
        { texto: textoOu(m.ultrassom.estadoSup), valor: true, id: 'ultrassom.estado-superficie', rotuloCampo: 'Estado da superfície' },
      ],
      [
        { texto: 'CABEÇOTE', rotulo: true },
        { texto: textoOu(m.ultrassom.cabecote), valor: true },
        { texto: 'VELOCIDADE SÔNICA', rotulo: true },
        { texto: textoOu(m.ultrassom.velSonica), valor: true },
      ],
    ],
  });

  doc.faixa('PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (mm)');
  if (m.ultrassom.pontos.length > 0) {
    // 13D · UMA TABELA POR REGIÃO. Regiões podem ter contagens de coluna
    // diferentes (o container define quantos ângulos cada uma tem), e uma
    // tabela só obrigaria a inventar um cabeçalho comum — foi o que produzia
    // "P1, P2, P3" no lugar dos ângulos. Cada região imprime os SEUS ângulos,
    // como a folha clássica sempre fez.
    const porRegiao = new Map<string, typeof m.ultrassom.pontos>();
    for (const linha of m.ultrassom.pontos) {
      const atual = porRegiao.get(linha.regiao) ?? [];
      atual.push(linha);
      porRegiao.set(linha.regiao, atual);
    }
    for (const [regiao, linhas] of porRegiao) {
      const angulos = linhas[0]?.angulos ?? [];
      const colMedida = angulos.length > 0 ? 0.48 / angulos.length : 0.48;
      doc.secao(regiao);
      doc.tabela({
        compacta: true,
        colunas: [0.26, ...Array(Math.max(angulos.length, 1)).fill(colMedida), 0.13, 0.13],
        cabecalho: [
          'PONTO',
          ...(angulos.length > 0 ? angulos.map((a) => `${a}°`) : ['MEDIDA']),
          'MENOR',
          'REQUERIDA',
        ],
        linhas: linhas.map((p) => [
          { texto: p.ponto },
          ...Array.from({ length: Math.max(angulos.length, 1) }, (_, i) => ({
            texto: textoOu(p.medidas[i]),
            centro: true,
            valor: true,
          })),
          { texto: textoOu(p.menor), centro: true, valor: true },
          { texto: textoOu(p.requerida), centro: true },
        ]),
      });
    }
  } else {
    doc.texto('Sem pontos de medição registrados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }

  doc.faixa('INSTRUMENTO DE MEDIÇÃO UTILIZADO');
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'PADRÃO', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.padrao), valor: true },
        { texto: 'Nº SÉRIE', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.serie), valor: true },
      ],
      [
        { texto: 'Nº CERTIFICADO', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.certificado), valor: true },
        { texto: 'VALIDADE', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.validade), valor: true },
      ],
    ],
  });

  doc.secao('Resultado do ensaio');
  doc.texto(textoOu(m.ultrassom.resultado), { cor: COR.valor });
}

// ── 18 e 19. TESTE HIDROSTÁTICO E SUAS FOTOS ────────────────────────────────
export function folhasTesteHidrostatico(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  doc.banner('7.5 REGISTRO DE TESTE HIDROSTÁTICO');
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'FLUIDO DE TESTE', rotulo: true },
        { texto: textoOu(m.th.fluido), valor: true, id: 'th.fluido', rotuloCampo: 'Fluido de teste' },
        { texto: 'DATA DO TESTE', rotulo: true },
        { texto: textoOu(m.th.dataTeste), valor: true, id: 'th.data', rotuloCampo: 'Data do teste' },
      ],
      [
        { texto: 'PRESSÃO DE PROJETO', rotulo: true },
        { texto: textoOu(m.th.pressaoProjeto), valor: true, id: 'th.pressao-projeto', rotuloCampo: 'Pressão de projeto' },
        { texto: 'PRESSÃO DE TESTE', rotulo: true },
        { texto: textoOu(m.th.pressaoTeste), valor: true, id: 'th.pressao-teste', rotuloCampo: 'Pressão de teste' },
      ],
      [
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.th.resultado), colspan: 3, valor: true, id: 'th.resultado', rotuloCampo: 'Resultado do teste hidrostático' },
      ],
    ],
  });

  if (m.th.curva.length > 0) {
    doc.y += 2.4;
    doc.faixa('GRÁFICO DE PRESSURIZAÇÃO E ESTABILIZAÇÃO');

    // O GRÁFICO, em vetor — eixos, faixas, linha, pontos e valores desenhados
    // com os mesmos dados e os mesmos limiares do Chart.js da folha atual.
    // Nada de captura de tela: a curva é uma polilinha, e continua nítida em
    // qualquer zoom e na impressão.
    const pontos = pontosDaCurva(m.th.curva);
    if (pontos.some((p) => p.pressao !== null)) {
      doc.garantirEspaco(ALTURA_GRAFICO_TH + 4);
      doc.y = desenharGraficoTh(doc.pdf, doc.y, {
        pontos,
        pressaoTeste: numeroDoTexto(m.th.pressaoTeste),
      });
      doc.y += 2.4;
    }

    // A TABELA fica: o gráfico mostra o comportamento, a tabela dá o valor
    // exato de cada leitura — e é a tabela que se lê num documento impresso em
    // preto e branco.
    doc.faixa('LEITURAS REGISTRADAS');
    doc.tabela({
      compacta: true,
      colunas: [0.5, 0.5],
      cabecalho: ['TEMPO', 'PRESSÃO'],
      linhas: m.th.curva.map((l) => [
        { texto: l.tempo, centro: true },
        { texto: l.pressao, centro: true, valor: true },
      ]),
    });
  }

  if (comFotos) folhaDeFotos(doc, '8.3 REGISTRO FOTOGRÁFICO — TESTE HIDROSTÁTICO', m.th.fotos);
}

// ── 20. RECOMENDAÇÕES, PARECER, PRÓXIMAS INSPEÇÕES E ASSINATURAS ────────────
export function folhaParecer(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();

  // ── 9. RECOMENDAÇÕES DE SEGURANÇA ───────────────────────────────────────
  //
  // O sistema NÃO tem recomendações estruturadas: não existe formulário, chave
  // nem campo que as guarde (auditado em 05/09/2026). Inventar uma origem
  // automática aqui produziria recomendação que ninguém escreveu, num documento
  // assinado.
  //
  // Então a seção existe como a referência a desenha — quatro linhas numeradas
  // com recomendação e prazo —, cada célula vazia, amarela na prévia e
  // preenchida à mão. Quando houver origem estruturada, ela entra por aqui sem
  // mudar o desenho.
  doc.banner('9. RECOMENDAÇÕES DE SEGURANÇA');
  doc.tabela({
    compacta: true,
    colunas: [0.08, 0.62, 0.3],
    cabecalho: ['ITEM', 'RECOMENDAÇÃO', 'PRAZO'],
    linhas: [1, 2, 3, 4].map((n) => [
      { texto: String(n), centro: true },
      { texto: '', valor: true, id: `recomendacoes.${n}.texto`, rotuloCampo: `Recomendação ${n}`, multilinha: true },
      { texto: '', valor: true, centro: true, id: `recomendacoes.${n}.prazo`, rotuloCampo: `Prazo da recomendação ${n}` },
    ]),
  });

  doc.y += 3;
  doc.banner('10. PARECER TÉCNICO CONCLUSIVO');
  doc.tabela({
    compacta: true,
    colunas: [0.7, 0.3],
    linhas: [
      [
        // A referência pergunta primeiro pela PMTA: manter a PMTA é decisão
        // técnica separada do "apto a operar". Sem fonte automática — é o
        // engenheiro que responde neste relatório.
        { texto: 'A Pressão Máxima de Trabalho Admissível (PMTA) pode ser mantida?', rotulo: true },
        { texto: '', centro: true, valor: true, id: 'parecer.pmta-mantida', rotuloCampo: 'A PMTA pode ser mantida?' },
      ],
      [
        { texto: 'Se não, justifique:', rotulo: true },
        { texto: '', valor: true, id: 'parecer.justificativa', rotuloCampo: 'Justificativa da PMTA', multilinha: true },
      ],
      [
        {
          texto: 'O equipamento está apto a operar nas condições de segurança da NR-13?',
          rotulo: true,
        },
        {
          texto: textoOu(rotuloLaudo(m.laudo.apto)),
          centro: true,
          valor: true,
          id: 'parecer.laudo',
          rotuloCampo: 'Parecer (APTO / INAPTO)',
        },
      ],
    ],
  });

  doc.y += 3;
  doc.banner('11. DATA PARA A PRÓXIMA INSPEÇÃO');
  doc.tabela({
    compacta: true,
    colunas: [0.6, 0.4],
    cabecalho: ['EXAME', 'DATA LIMITE'],
    linhas: [
      [
        { texto: 'EXAME VISUAL EXTERNO' },
        { texto: textoOu(m.proximas.externa), centro: true, valor: true, id: 'proximas.externa', rotuloCampo: 'Próxima — exame visual externo' },
      ],
      [
        { texto: 'EXAME VISUAL INTERNO' },
        { texto: textoOu(m.proximas.interna), centro: true, valor: true, id: 'proximas.interna', rotuloCampo: 'Próxima — exame visual interno' },
      ],
      [
        { texto: 'TESTE HIDROSTÁTICO' },
        { texto: textoOu(m.proximas.th), centro: true, valor: true, id: 'proximas.th', rotuloCampo: 'Próxima — teste hidrostático' },
      ],
    ],
  });
  doc.texto(
    'As datas acima são as registradas na emissão deste relatório e são a mesma fonte que alimenta ' +
      'o controle de vencimentos do sistema.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2, id: 'proximas.nota', rotuloCampo: 'Nota das próximas inspeções' },
  );

  assinaturas(doc, m);
}

function assinaturas(doc: Documento, m: ModeloRelatorio): void {
  const alturaBloco = 16 + 3 + 3 * 4.2;
  doc.garantirEspaco(alturaBloco + 6);
  // `.assinaturas { margin-top: 6mm }` na referência — eram 8, medidos pelo gate.
  doc.y += 6;

  const larguraQuadro = (CAIXA.largura - 8) / 2;
  const base = doc.y;
  m.assinantes.slice(0, 2).forEach((a, i) => {
    const x = CAIXA.x + i * (larguraQuadro + 8);
    if (a.rubrica) {
      try {
        const formato = a.rubrica.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.pdf.addImage(a.rubrica, formato, x + larguraQuadro / 2 - 20, base, 40, 16, undefined, 'FAST');
      } catch {
        // Rubrica ilegível não impede o documento de sair assinado por nome.
      }
    }
    const yLinha = base + 16;
    doc.pdf.setDrawColor(COR.texto);
    doc.pdf.setLineWidth(0.6 * (25.4 / 72));
    doc.pdf.line(x, yLinha, x + larguraQuadro, yLinha);
    doc.y = yLinha + 1;
    doc.texto(a.nome, { negrito: true, alinhamento: 'center', x, largura: larguraQuadro });
    doc.texto(a.funcao, { tamanho: FONTE.mini, alinhamento: 'center', x, largura: larguraQuadro });
    if (a.registro) {
      doc.texto(`CREA / Registro: ${a.registro}`, {
        tamanho: FONTE.mini,
        alinhamento: 'center',
        x,
        largura: larguraQuadro,
      });
    }
    if (i === 0) doc.y = base; // a segunda coluna começa na mesma altura
  });
}

/**
 * Os títulos do sumário — na ordem em que as folhas são emitidas, e **só as
 * que serão emitidas**.
 *
 * As seções fotográficas entram conforme a contagem de fotos daquela etapa.
 * Um sumário que anuncia "Registro fotográfico do exame interno" num relatório
 * que não tem essa folha é conteúdo errado, não estilo: o leitor procura uma
 * página que não existe.
 */
export function secoesDoRelatorio(
  m: ModeloRelatorio,
  tem: Record<SecaoRelatorio, boolean> = TUDO,
): string[] {
  const s: string[] = [];
  const push = (ok: boolean, titulo: string) => {
    if (ok) s.push(titulo);
  };
  push(tem.identificacao, 'Identificação do equipamento');
  push(tem.categorizacao, 'Categorização de risco');
  push(tem.dadosTecnicos, 'Dados técnicos / prontuário');
  push(tem.resumoCalculos, 'Resumo dos cálculos da PMTA');
  push(tem.memoria, 'Memória de cálculo');
  push(tem.dadosInspecao, 'Dados gerais da inspeção');
  push(tem.checklist, 'Checklist NR-13');
  push(tem.fotosDocumentacao && m.fotosDocumentacao.length > 0, 'Registro fotográfico da documentação');
  push(tem.fotosChecklist && m.fotosChecklist.length > 0, 'Registro fotográfico do checklist');
  push(tem.exameExterno, 'Exame externo');
  push(tem.fotosExterno && m.visualExterno.fotos.length > 0, 'Registro fotográfico do exame externo');
  push(tem.exameInterno, 'Exame interno');
  push(tem.fotosInterno && m.visualInterno.fotos.length > 0, 'Registro fotográfico do exame interno');
  push(tem.ultrassom, 'Medição de espessura por ultrassom');
  push(tem.th, 'Teste hidrostático');
  push(tem.fotosTh && m.th.fotos.length > 0, 'Registro fotográfico do teste hidrostático');
  push(tem.parecer, 'Parecer conclusivo e próxima inspeção');
  return s;
}

/** Sem lista de folhas informada, tudo entra — o comportamento do piloto. */
const TUDO: Record<SecaoRelatorio, boolean> = secoesPresentes(undefined);
