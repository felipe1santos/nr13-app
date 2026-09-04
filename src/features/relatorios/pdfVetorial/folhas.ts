import { CAIXA, COR, FONTE } from './documentoA4';
import { secoesPresentes, type SecaoRelatorio } from './composicao';
import { ALTURA_GRAFICO_TH, desenharGraficoTh, numeroDoTexto, pontosDaCurva } from './graficoTh';
import { foto } from './primitivas';
import type { Documento } from './documento';
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

function tabelaChaveValor(doc: Documento, campos: [string, string | null][], colunas = 2): void {
  const linhas: { texto: string; rotulo?: boolean; valor?: boolean }[][] = [];
  const passo = colunas;
  for (let i = 0; i < campos.length; i += passo) {
    const linha: { texto: string; rotulo?: boolean; valor?: boolean }[] = [];
    for (let k = 0; k < passo; k++) {
      const par = campos[i + k];
      linha.push({ texto: par ? par[0] : '', rotulo: !!par });
      linha.push({ texto: par ? textoOu(par[1]) : '', valor: true });
    }
    linhas.push(linha);
  }
  const largura = colunas === 2 ? [0.22, 0.28, 0.22, 0.28] : [0.3, 0.7];
  doc.tabela({ colunas: largura, linhas });
}

function blocoExame(doc: Documento, titulo: string, exame: ExameVisual): void {
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
  doc.texto(textoOu(exame.observacoes, 'Sem observações.'), { cor: COR.valor });

  doc.secao('Conclusão técnica');
  doc.texto(textoOu(exame.conclusao ?? exame.resultado), { cor: COR.valor });
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
  });
  doc.texto(textoOu(m.equipamento['TIPO DE EQUIPAMENTO'], 'Equipamento') + ' · NR-13', {
    tamanho: FONTE.subtituloDoc,
    negrito: true,
    alinhamento: 'center',
  });
  doc.texto(textoOu(m.tipoInspecao, 'Inspeção'), {
    tamanho: FONTE.sigla,
    italico: true,
    cor: '#6a6a6a',
    alinhamento: 'center',
    espacoAntes: 1,
  });

  doc.y += 3;
  tabelaChaveValor(
    doc,
    [
      ['CONTRATANTE', m.cliente],
      ['ENDEREÇO', m.clienteEndereco],
      ['EQUIPAMENTO / T.A.G.', m.tag],
      ['Nº DO RELATÓRIO', m.numeroRelatorio],
      ['DATA DE EMISSÃO', m.emissao],
      ['VALIDADE', m.validade],
    ],
    1,
  );

  if (m.fotoCapa) {
    doc.y += 4;
    foto(doc.pdf, m.fotoCapa, { x: CAIXA.x, y: doc.y, largura: CAIXA.largura, altura: 92 });
    doc.y += 92;
  }
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
  doc.texto(
    `Este relatório apresenta o resultado da ${textoOu(m.tipoInspecao, 'inspeção')} de segurança do ` +
      `equipamento ${m.tag}, realizada conforme a Norma Regulamentadora NR-13 do Ministério do ` +
      'Trabalho e Emprego, com o objetivo de avaliar as condições de integridade e de segurança ' +
      'operacional do equipamento.',
  );

  doc.banner('2. DOCUMENTOS DE REFERÊNCIA');
  doc.tabela({
    compacta: true,
    colunas: [0.3, 0.7],
    linhas: [
      [{ texto: 'NR-13', rotulo: true }, { texto: 'Caldeiras, Vasos de Pressão, Tubulações e Tanques Metálicos de Armazenamento' }],
      [{ texto: 'ASME Seção VIII Div. 1', rotulo: true }, { texto: 'Regras para construção de vasos de pressão' }],
      [{ texto: 'ASME Seção V', rotulo: true }, { texto: 'Ensaios não destrutivos' }],
    ],
  });
}

// ── 3. IDENTIFICAÇÃO / PLACA ────────────────────────────────────────────────
export function folhaIdentificacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('3. IDENTIFICAÇÃO DO EQUIPAMENTO — PLACA');
  tabelaChaveValor(doc, Object.entries(m.equipamento) as [string, string | null][]);

  doc.y += 2.4;
  doc.faixa('PRESSÕES');
  doc.tabela({
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar'],
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true },
      { texto: textoOu(p.kgf), centro: true, valor: true },
      { texto: textoOu(p.bar), centro: true, valor: true },
    ]),
  });

  doc.y += 2.4;
  doc.faixa('DATAS');
  doc.tabela({
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'EXECUÇÃO DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.execucao), valor: true },
        { texto: 'VALIDADE DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.validade), valor: true },
      ],
    ],
  });
}

// ── 4. CATEGORIZAÇÃO DE RISCO ───────────────────────────────────────────────
export function folhaCategorizacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('4. CATEGORIZAÇÃO DE RISCO');
  doc.tabela({
    colunas: [0.35, 0.65],
    linhas: [
      [{ texto: 'CLASSE DO FLUIDO', rotulo: true }, { texto: textoOu(m.equipamento['CLASSE DO FLUIDO']), valor: true }],
      [{ texto: 'GRUPO DE POTENCIAL DE RISCO', rotulo: true }, { texto: textoOu(m.categoria.grupo), valor: true }],
      [{ texto: 'VOLUME (m³)', rotulo: true }, { texto: textoOu(m.categoria.volume), valor: true }],
      [{ texto: 'CATEGORIA DO EQUIPAMENTO', rotulo: true }, { texto: textoOu(m.categoria.catFinal), valor: true }],
      [{ texto: 'ENQUADRAMENTO NA NR-13', rotulo: true }, { texto: textoOu(m.categoria.enquadramento), valor: true }],
    ],
  });
  doc.texto(
    'A categorização segue o item 13.5.1.2 da NR-13: o grupo de potencial de risco resulta do ' +
      'produto pressão × volume, e a categoria, do cruzamento desse grupo com a classe do fluido.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 3 },
  );
}

// ── 5. DADOS TÉCNICOS / PRONTUÁRIO ──────────────────────────────────────────
export function folhaDadosTecnicos(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('5. DADOS TÉCNICOS DO EQUIPAMENTO — PRONTUÁRIO');
  doc.faixa('ASPECTOS CONSTRUTIVOS');
  if (m.componentes.length > 0) {
    doc.tabela({
      compacta: true,
      colunas: [0.3, 0.18, 0.18, 0.16, 0.18],
      cabecalho: ['COMPONENTE', 'PMTA (MPa)', 'ESP. REQ. (mm)', 'ESP. NOM.', 'MATERIAL'],
      linhas: m.componentes.map((c) => [
        { texto: c.nome },
        { texto: textoOu(c.pmta), centro: true, valor: true },
        { texto: textoOu(c.espReq), centro: true, valor: true },
        { texto: textoOu(c.espNom), centro: true, valor: true },
        { texto: textoOu(c.material), centro: true },
      ]),
    });
  } else {
    doc.texto('Memorial sem componentes calculados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }
}

// ── 6. RESUMO DOS CÁLCULOS ──────────────────────────────────────────────────
export function folhaResumoCalculos(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('6. RESUMO DE CÁLCULOS DA PMTA E ESPESSURA MÍNIMA');
  doc.tabela({
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar'],
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true },
      { texto: textoOu(p.kgf), centro: true, valor: true },
      { texto: textoOu(p.bar), centro: true, valor: true },
    ]),
  });
  doc.secao('Conclusão do cálculo');
  doc.texto(
    m.componentes.length > 0
      ? `A PMTA do equipamento é a MENOR entre as ${m.componentes.length} PMTA calculadas por componente.`
      : 'Sem cálculo de componentes registrado para este equipamento.',
    { cor: COR.valor },
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
  blocoExame(doc, '7.2 EXAME EXTERNO (INSPEÇÃO VISUAL EXTERNA)', m.visualExterno);
  if (comFotos) folhaDeFotos(doc, '8.1 REGISTRO FOTOGRÁFICO — EXAME EXTERNO', m.visualExterno.fotos);
}

export function folhasExameInterno(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  blocoExame(doc, '7.3 EXAME INTERNO (INSPEÇÃO VISUAL INTERNA)', m.visualInterno);
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
        { texto: textoOu(m.ultrassom.aparelho), valor: true },
        { texto: 'ACOPLANTE', rotulo: true },
        { texto: textoOu(m.ultrassom.acoplante), valor: true },
      ],
      [
        { texto: 'TEMP. DA SUPERFÍCIE', rotulo: true },
        { texto: textoOu(m.ultrassom.tempSup), valor: true },
        { texto: 'ESTADO DA SUPERFÍCIE', rotulo: true },
        { texto: textoOu(m.ultrassom.estadoSup), valor: true },
      ],
      [
        { texto: 'CABEÇOTE', rotulo: true },
        { texto: textoOu(m.ultrassom.cabecote), valor: true },
        { texto: 'VELOCIDADE SÔNICA', rotulo: true },
        { texto: textoOu(m.ultrassom.velSonica), valor: true },
      ],
    ],
  });

  doc.y += 2.4;
  doc.faixa('PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (mm)');
  if (m.ultrassom.pontos.length > 0) {
    const maxMedidas = Math.max(...m.ultrassom.pontos.map((p) => p.medidas.length), 1);
    const colMedida = 0.48 / maxMedidas;
    doc.tabela({
      compacta: true,
      colunas: [0.26, ...Array(maxMedidas).fill(colMedida), 0.13, 0.13],
      cabecalho: [
        'REGIÃO / PONTO',
        ...Array.from({ length: maxMedidas }, (_, i) => `P${i + 1}`),
        'MENOR',
        'REQUERIDA',
      ],
      linhas: m.ultrassom.pontos.map((p) => [
        { texto: p.regiao },
        ...Array.from({ length: maxMedidas }, (_, i) => ({
          texto: textoOu(p.medidas[i]),
          centro: true,
          valor: true,
        })),
        { texto: textoOu(p.menor), centro: true, valor: true },
        { texto: textoOu(p.requerida), centro: true },
      ]),
    });
  } else {
    doc.texto('Sem pontos de medição registrados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }

  doc.y += 2.4;
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
        { texto: textoOu(m.th.fluido), valor: true },
        { texto: 'DATA DO TESTE', rotulo: true },
        { texto: textoOu(m.th.dataTeste), valor: true },
      ],
      [
        { texto: 'PRESSÃO DE PROJETO', rotulo: true },
        { texto: textoOu(m.th.pressaoProjeto), valor: true },
        { texto: 'PRESSÃO DE TESTE', rotulo: true },
        { texto: textoOu(m.th.pressaoTeste), valor: true },
      ],
      [
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.th.resultado), colspan: 3, valor: true },
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
  doc.banner('10. PARECER TÉCNICO CONCLUSIVO');
  doc.tabela({
    compacta: true,
    colunas: [0.7, 0.3],
    linhas: [
      [
        { texto: 'O equipamento está apto a operar nas condições de segurança da NR-13?', rotulo: true },
        { texto: textoOu(rotuloLaudo(m.laudo.apto)), centro: true, valor: true },
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
      [{ texto: 'EXAME VISUAL EXTERNO' }, { texto: textoOu(m.proximas.externa), centro: true, valor: true }],
      [{ texto: 'EXAME VISUAL INTERNO' }, { texto: textoOu(m.proximas.interna), centro: true, valor: true }],
      [{ texto: 'TESTE HIDROSTÁTICO' }, { texto: textoOu(m.proximas.th), centro: true, valor: true }],
    ],
  });
  doc.texto(
    'As datas acima são as registradas na emissão deste relatório e são a mesma fonte que alimenta ' +
      'o controle de vencimentos do sistema.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 },
  );

  assinaturas(doc, m);
}

function assinaturas(doc: Documento, m: ModeloRelatorio): void {
  const alturaBloco = 16 + 3 + 3 * 4.2;
  doc.garantirEspaco(alturaBloco + 6);
  doc.y += 8;

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
