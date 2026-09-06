import { CAIXA, COR, FONTE, LIMITE_CORPO } from './documentoA4';
import { foto } from './primitivas';
import type { CelulaDoc, Documento } from './documento';
import { textoOu } from './modelo';
import { extremosDaRegiao } from './folhas';
import { formulaDoLatex } from './latexMemorial';
import type { ModeloProntuario } from './modeloProntuario';

/**
 * Fase 12 · as folhas do PRONTUÁRIO, no padrão visual da Fase 11.
 *
 * **Não há framework novo.** Estas funções usam o MESMO `Documento`, as mesmas
 * primitivas e a mesma geometria A4 do relatório vetorial — quem quebra a
 * folha, repete o cabeçalho da tabela e conta "Página X de Y" continua sendo
 * ele. A Fase 12 acrescenta conteúdo, não motor.
 *
 * A ordem e a existência das folhas seguem `paginasProntuario`: caldeira e
 * autoclave não têm croqui 2D, e por isso não recebem as folhas 2 e 3 (§8 do
 * CLAUDE.md). Quem decide é o modelo, que já veio filtrado.
 */

function tabelaChaveValor(doc: Documento, campos: [string, string | null][], colunas = 2, esticavel = false): void {
  const linhas: { texto: string; rotulo?: boolean; valor?: boolean }[][] = [];
  for (let i = 0; i < campos.length; i += colunas) {
    const linha: { texto: string; rotulo?: boolean; valor?: boolean }[] = [];
    for (let k = 0; k < colunas; k++) {
      const par = campos[i + k];
      linha.push({ texto: par ? par[0] : '', rotulo: !!par });
      linha.push({ texto: par ? textoOu(par[1]) : '', valor: true });
    }
    linhas.push(linha);
  }
  doc.tabela({ colunas: colunas === 2 ? [0.22, 0.28, 0.22, 0.28] : [0.3, 0.7], linhas, esticavel });
}

/** Bloco de responsabilidade técnica — o rodapé assinado das folhas. */
function responsabilidadeTecnica(doc: Documento, m: ModeloProntuario, folha: string): void {
  const assinam = m.assinantes.filter((a) => a.folhas.includes(folha));
  if (assinam.length === 0) return;

  doc.garantirEspaco(30);
  doc.y += 6;
  doc.faixa('RESPONSABILIDADE TÉCNICA');
  doc.y += 2;

  const largura = (CAIXA.largura - 8) / 2;
  const base = doc.y;
  assinam.slice(0, 2).forEach((a, i) => {
    const x = CAIXA.x + i * (largura + 8);
    if (a.rubrica) {
      try {
        const formato = a.rubrica.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.pdf.addImage(a.rubrica, formato, x + largura / 2 - 20, base, 40, 15, undefined, 'FAST');
      } catch {
        // Rubrica ilegível não impede o documento de sair assinado por nome.
      }
    }
    const yLinha = base + 15;
    doc.pdf.setDrawColor(COR.texto);
    doc.pdf.setLineWidth(0.6 * (25.4 / 72));
    doc.pdf.line(x, yLinha, x + largura, yLinha);
    doc.y = yLinha + 1;
    doc.texto(a.nome, { negrito: true, alinhamento: 'center', x, largura });
    doc.texto(a.funcao, { tamanho: FONTE.mini, alinhamento: 'center', x, largura });
    if (a.registro) {
      doc.texto(`CREA / Registro: ${a.registro}`, { tamanho: FONTE.mini, alinhamento: 'center', x, largura });
    }
    if (i === 0) doc.y = base;
  });
}

/**
 * A CAPA do prontuário — o mesmo desenho da capa do relatório.
 *
 * Os dois documentos saem da mesma empresa, para o mesmo equipamento, e vão
 * para a mesma pasta: capa diferente faz um deles parecer de outro sistema. O
 * que muda é o CONTEÚDO — aqui não há laudo nem validade de inspeção, e sim a
 * identificação construtiva e o número do prontuário.
 */
export function folhaProntCapa(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.y += 6;
  doc.texto('Prontuário do Equipamento', { tamanho: FONTE.tituloDoc, negrito: true, alinhamento: 'center' });
  doc.texto(`${textoOu(m.identificacao['TIPO DE EQUIPAMENTO'], 'Equipamento')} — NR-13`, {
    tamanho: FONTE.subtituloDoc,
    alinhamento: 'center',
    espacoAntes: 1.5,
  });
  doc.texto('(Portaria nº 1.082, de 18 de dezembro de 2018)', {
    tamanho: FONTE.nota,
    cor: COR.nota,
    alinhamento: 'center',
    espacoAntes: 1,
  });

  doc.y += 5;
  doc.tabela({
    colunas: [0.22, 0.28, 0.22, 0.28],
    linhas: [
      [
        { texto: 'EQUIPAMENTO', rotulo: true },
        { texto: textoOu(m.identificacao['TIPO DE EQUIPAMENTO']), valor: true },
        { texto: 'T.A.G.', rotulo: true },
        { texto: textoOu(m.tag), valor: true },
      ],
      [
        { texto: 'CLASSE DO FLUIDO', rotulo: true },
        { texto: textoOu(m.categoria.classeFluido), valor: true },
        { texto: 'GRUPO', rotulo: true },
        { texto: textoOu(m.categoria.grupo), valor: true },
      ],
      [
        { texto: 'CATEGORIA', rotulo: true },
        { texto: textoOu(m.categoria.categoria), valor: true },
        { texto: 'REVISÃO', rotulo: true },
        { texto: textoOu(m.revisao), valor: true },
      ],
    ],
  });

  // A foto do equipamento ocupa o miolo da capa, como no relatório: o espaço
  // que sobra é dela, com um piso para ela não virar uma tarja.
  doc.y += 3;
  const disponivel = LIMITE_CORPO - doc.y - 62;
  const alturaFoto = Math.max(40, Math.min(disponivel, 150));
  if (m.fotoCapa) {
    foto(doc.pdf, m.fotoCapa, { x: CAIXA.x, y: doc.y, largura: CAIXA.largura, altura: alturaFoto });
    doc.y += alturaFoto + 3;
  }

  doc.tabela({
    colunas: [0.3, 0.7],
    linhas: [
      [
        { texto: 'Nº DO PRONTUÁRIO', rotulo: true },
        { texto: textoOu(m.numero), valor: true },
      ],
      [
        { texto: 'DATA DE EMISSÃO', rotulo: true },
        { texto: textoOu(m.emissao), valor: true },
      ],
      [
        { texto: 'CONTRATANTE', rotulo: true },
        { texto: textoOu(m.cliente.razao), valor: true },
      ],
      [
        { texto: 'ENDEREÇO', rotulo: true },
        { texto: textoOu(m.cliente.endereco), valor: true },
      ],
      [
        { texto: 'RESPONSÁVEL TÉCNICO', rotulo: true },
        {
          texto: `${textoOu(m.responsavel.nome, '')}${m.responsavel.registro ? ` • CREA: ${m.responsavel.registro}` : ''}`.trim() || '—',
          valor: true,
        },
      ],
    ],
  });
}

/**
 * O SUMÁRIO, com a página real de cada folha.
 *
 * Mesmo mecanismo do relatório: a 1ª passagem do gerador anota onde cada seção
 * começou, a 2ª imprime. Um sumário sem página é um índice que não indexa.
 */
export function folhaProntSumario(doc: Documento, m: ModeloProntuario, paginas: Map<string, number> = new Map()): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('pront-sumario');
  doc.banner('SUMÁRIO DO PRONTUÁRIO');
  const secoes = secoesDoProntuario(m);
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.1, 0.78, 0.12],
    cabecalho: ['ITEM', 'SEÇÃO', 'PÁG.'],
    linhas: secoes.map((titulo, i) => [
      { texto: String(i + 1), centro: true, rotulo: true },
      { texto: titulo },
      { texto: paginas.has(titulo) ? String(paginas.get(titulo)) : '', centro: true },
    ]),
  });

  doc.banner('OBJETIVO DO PRONTUÁRIO');
  doc.texto(
    'Este prontuário reúne os dados construtivos, os parâmetros de projeto e os registros de ' +
      `integridade do equipamento ${m.tag}, em atendimento ao item 13.5.1.4 da NR-13. Ele acompanha o ` +
      'equipamento durante toda a sua vida útil e é atualizado a cada inspeção de segurança.',
  );

  doc.blocoAteOFim('pront.observacoes-gerais', 'Observações gerais', 'OBSERVAÇÕES GERAIS', 18, 40);
  doc.fecharSecaoElastica();
}

// ── 1. ULTRASSOM / MEDIÇÃO DE ESPESSURA ─────────────────────────────────────
export function folhaProntUltrassom(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('pront-ultrassom');
  doc.banner('MEDIÇÃO DE ESPESSURA POR ULTRASSOM');

  doc.faixa('INFORMAÇÕES DO COMPONENTE AVALIADO');
  tabelaChaveValor(doc, [
    ['IDENTIFICAÇÃO / T.A.G.', m.tag],
    ['COMPONENTE', m.ultrassom.componente],
  ]);

  doc.y += 2;
  doc.faixa('INFORMAÇÕES PARA O ENSAIO');
  tabelaChaveValor(doc, [
    ['APARELHO', m.ultrassom.aparelho],
    ['ACOPLANTE', m.ultrassom.acoplante],
    ['CABEÇOTE', m.ultrassom.cabecote],
    ['VELOCIDADE SÔNICA', m.ultrassom.velSonica],
    ['TEMP. DA SUPERFÍCIE', m.ultrassom.tempSup],
    ['ESTADO DA SUPERFÍCIE', m.ultrassom.estadoSup],
  ]);

  doc.y += 2;
  doc.faixa('LOCALIZAÇÃO DOS PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (mm)');
  if (m.ultrassom.pontos.length > 0) {
    // Uma tabela por REGIÃO, com os ângulos dela e o realce da maior e da menor
    // leitura — exatamente como na folha 7.4 do relatório. Os dois documentos
    // falam do mesmo ensaio; ler diferente em cada um é o que confunde quem
    // confere.
    const porRegiao = new Map<string, typeof m.ultrassom.pontos>();
    for (const linha of m.ultrassom.pontos) {
      const atual = porRegiao.get(linha.regiao) ?? [];
      atual.push(linha);
      porRegiao.set(linha.regiao, atual);
    }
    for (const [regiao, linhas] of porRegiao) {
      const angulos = linhas[0]?.angulos ?? [];
      const colMedida = angulos.length > 0 ? 0.48 / angulos.length : 0.48;
      const { maior, menor } = extremosDaRegiao(linhas);
      const marca = (v: string | null | undefined): { destaque?: 'maior' | 'menor' } => {
        const n = Number(String(v ?? '').replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0) return {};
        if (menor !== null && n === menor) return { destaque: 'menor' };
        if (maior !== null && n === maior) return { destaque: 'maior' };
        return {};
      };
      doc.secao(regiao);
      doc.tabela({
        compacta: true,
        esticavel: true,
        colunas: [0.26, ...Array(Math.max(angulos.length, 1)).fill(colMedida), 0.13, 0.13],
        cabecalho: [
          'REGIÃO / PONTO',
          ...(angulos.length > 0 ? angulos.map((a) => `${a}°`) : ['MEDIDA']),
          'MENOR VALOR',
          'ESP. MÍN. REQUERIDA',
        ],
        linhas: linhas.map((p) => [
          { texto: p.ponto },
          ...Array.from({ length: Math.max(angulos.length, 1) }, (_, i) => ({
            texto: textoOu(p.medidas[i]),
            centro: true,
            valor: true,
            ...marca(p.medidas[i]),
          })) as CelulaDoc[],
          { texto: textoOu(p.menor), centro: true, valor: true, ...marca(p.menor) },
          { texto: textoOu(p.requerida), centro: true, valor: true },
        ]),
      });
    }
  } else {
    doc.texto('Sem pontos de medição registrados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }

  // O croqui longitudinal é DESENHO: entra como figura, e só aqui — e SÓ
  // PARA VASO DE PRESSÃO. O editor de croqui nunca soube desenhar caldeira nem
  // autoclave (§8 do CLAUDE.md); um desenho genérico num prontuário assinado
  // afirma uma geometria que não é a do equipamento. Sem croqui, o espaço fica
  // em branco: ausência é informação, desenho errado não.
  if (m.tipoEquipamento === 'vaso' && m.croqui.longitudinal) {
    doc.y += 2;
    doc.faixa('CROQUI DO EQUIPAMENTO');
    desenharCroqui(doc, m.croqui.longitudinal, 62);
  }

  doc.y += 2;
  doc.faixa('INSTRUMENTO DE MEDIÇÃO UTILIZADO');
  tabelaChaveValor(doc, [
    ['PADRÃO', m.ultrassom.instrumento.padrao],
    ['Nº SÉRIE', m.ultrassom.instrumento.serie],
    ['Nº CERTIFICADO', m.ultrassom.instrumento.certificado],
    ['VALIDADE', m.ultrassom.instrumento.validade],
  ]);

  doc.fecharSecaoElastica();
  responsabilidadeTecnica(doc, m, 'PRONT-ULTRASSOM.html');
}

// ── 2. CROQUI 2D COTADO ─────────────────────────────────────────────────────
export function folhaProntCroqui(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('CROQUI 2D COTADO DO EQUIPAMENTO');

  const vistas: [string, string | null][] = [
    ['VISTA LONGITUDINAL', m.croqui.longitudinal],
    ['VISTA TRANSVERSAL', m.croqui.transversal],
    ['DETALHE DO TAMPO', m.croqui.detalheTampo],
  ];
  const presentes = vistas.filter(([, svg]) => !!svg);

  if (presentes.length === 0) {
    doc.texto('Croqui não gerado para este equipamento.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 3,
    });
  } else {
    for (const [titulo, svg] of presentes) {
      doc.faixa(titulo);
      desenharCroqui(doc, svg!, presentes.length > 2 ? 52 : 76);
      doc.y += 2;
    }
  }

  if (m.dimensoes.length > 0) {
    doc.y += 2;
    doc.faixa('DIMENSÕES REAIS');
    doc.tabela({
      compacta: true,
      colunas: [0.2, 0.11, 0.11, 0.14, 0.11, 0.11, 0.11, 0.11],
      cabecalho: ['MODELO', 'Ø', 'ALTURA', 'COMPRIMENTO', 'e CORPO', 'e FUNDO', 'e TAMPA', 'VOLUME'],
      linhas: m.dimensoes.map((d) => [
        { texto: d.modelo },
        { texto: d.diametro, centro: true, valor: true },
        { texto: d.altura, centro: true, valor: true },
        { texto: d.comprimento, centro: true, valor: true },
        { texto: d.espCorpo, centro: true, valor: true },
        { texto: d.espFundo, centro: true, valor: true },
        { texto: d.espTampa, centro: true, valor: true },
        { texto: d.volume, centro: true, valor: true },
      ]),
    });
  }

  responsabilidadeTecnica(doc, m, 'PRONT-CROQUI2D.html');
}

// ── 3. FOLHA DE DADOS ───────────────────────────────────────────────────────
export function folhaProntFolhaDados(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('FOLHA DE DADOS DO EQUIPAMENTO');

  const campos = Object.entries(m.folhaDados).filter(([, v]) => v !== null) as [string, string][];
  if (campos.length > 0) {
    doc.faixa('DADOS DERIVADOS DO MODELO');
    tabelaChaveValor(doc, campos);
  } else {
    doc.texto('Folha de dados não gerada — o modelo do croqui não foi salvo para este equipamento.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 2,
    });
  }

  if (m.dimensoes.length > 0) {
    doc.y += 2;
    doc.faixa('DIMENSÕES POR COMPONENTE');
    doc.tabela({
      compacta: true,
      colunas: [0.28, 0.18, 0.18, 0.18, 0.18],
      cabecalho: ['COMPONENTE', 'Ø', 'ALTURA', 'COMPRIMENTO', 'VOLUME'],
      linhas: m.dimensoes.map((d) => [
        { texto: d.modelo },
        { texto: d.diametro, centro: true, valor: true },
        { texto: d.altura, centro: true, valor: true },
        { texto: d.comprimento, centro: true, valor: true },
        { texto: d.volume, centro: true, valor: true },
      ]),
    });
  }

  responsabilidadeTecnica(doc, m, 'PRONT-FOLHA-DADOS.html');
}

// ── 4. PRONTUÁRIO (dados construtivos + categorização) ──────────────────────
export function folhaProntProntuario(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('pront-dados');
  doc.banner('PRONTUÁRIO DO EQUIPAMENTO');

  doc.faixa('DADOS GERAIS');
  // Nº e DATA DE EMISSÃO saem no corpo, como na folha atual (`pront-data-insp`).
  // Ficavam só no cabeçalho, e a conferência campo a campo pegou a falta: a
  // data de emissão de um documento assinado não pode depender do cabeçalho.
  tabelaChaveValor(doc, [
    ['Nº DO PRONTUÁRIO', m.numero],
    ['DATA DE EMISSÃO', m.emissao],
    ['CONTRATANTE', m.cliente.razao],
    ['CNPJ', m.cliente.cnpj],
  ]);
  doc.tabela({
    colunas: [0.22, 0.78],
    linhas: [[{ texto: 'ENDEREÇO', rotulo: true }, { texto: textoOu(m.cliente.endereco), valor: true }]],
  });

  doc.y += 2;
  doc.faixa('ASPECTOS GERAIS DO EQUIPAMENTO');
  tabelaChaveValor(doc, Object.entries(m.identificacao) as [string, string | null][], 2, true);

  doc.y += 2;
  doc.faixa('ASPECTOS CONSTRUTIVOS');
  tabelaChaveValor(doc, Object.entries(m.construtivos) as [string, string | null][], 2, true);

  doc.y += 2;
  doc.faixa('ASPECTOS OPERACIONAIS');
  tabelaChaveValor(doc, Object.entries(m.operacionais) as [string, string | null][], 1);

  doc.y += 2;
  doc.faixa('CATEGORIZAÇÃO DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    colunas: [0.45, 0.2, 0.35],
    cabecalho: ['RELAÇÃO', 'VALOR', 'RESULTADO'],
    linhas: [
      [
        { texto: 'P (kPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categoria.kpaVolume), centro: true, valor: true },
        { texto: textoOu(m.categoria.resultadoKpa), centro: true, valor: true },
      ],
      [
        { texto: 'P (MPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categoria.mpaVolume), centro: true, valor: true },
        { texto: textoOu(m.categoria.resultadoMpa), centro: true, valor: true },
      ],
    ],
  });
  tabelaChaveValor(doc, [
    ['CLASSIFICAÇÃO DO FLUIDO', m.categoria.classeFluido],
    ['GRUPO POTENCIAL DE RISCO', m.categoria.grupo],
    ['CATEGORIA DO EQUIPAMENTO', m.categoria.categoria],
    ['REVISÃO', m.revisao],
  ]);
  doc.texto(
    'O enquadramento na NR-13 usa a base kPa × m³ > 8; o grupo de potencial de risco, MPa × m³. ' +
      'Os dois valores são os calculados pelo sistema — esta folha não recalcula nenhum deles.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 },
  );

  doc.fecharSecaoElastica();
  responsabilidadeTecnica(doc, m, 'PRONT-PRONTUARIO.html');
}

// ── 5. CONTINUAÇÃO (procedimentos, dispositivos, atenção) ───────────────────
export function folhaProntContinuacao(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('PROCEDIMENTOS, DISPOSITIVOS DE SEGURANÇA E PONTOS DE ATENÇÃO');

  // Os três são texto redigido pelo engenheiro. Cada um ocupa um terço do que
  // resta da folha, em vez de uma linha solta seguida de meia página vazia.
  const terco = Math.max(28, (LIMITE_CORPO - doc.y - 34) / 3);
  doc.secao('6 · Procedimentos de inspeção');
  doc.texto(textoOu(m.procedimentos, ''), { cor: COR.valor });
  doc.y = Math.min(LIMITE_CORPO - 8, doc.y + terco * 0.4);

  doc.secao('7 · Dispositivos de segurança');
  doc.texto(textoOu(m.dispositivos, ''), { cor: COR.valor });
  doc.y = Math.min(LIMITE_CORPO - 8, doc.y + terco * 0.4);

  doc.secao('8 · Atenção');
  doc.texto(textoOu(m.atencao, ''), { cor: COR.valor });

  responsabilidadeTecnica(doc, m, 'PRONT-CONTINUACAO.html');
}

// ── 6. MEMORIAL (resumo dos cálculos) ───────────────────────────────────────
export function folhaProntMemorial(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('RESUMO DOS CÁLCULOS — MEMORIAL');

  doc.faixa('PRESSÕES');
  doc.tabela({
    colunas: [0.36, 0.16, 0.16, 0.16, 0.16],
    cabecalho: ['GRANDEZA', 'MPa', 'psi', 'kgf/cm²', 'bar'],
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true },
      { texto: textoOu(p.psi), centro: true, valor: true },
      { texto: textoOu(p.kgf), centro: true, valor: true },
      { texto: textoOu(p.bar), centro: true, valor: true },
    ]),
  });

  if (m.componentes.length > 0) {
    doc.y += 2;
    doc.faixa('PARÂMETROS E RESULTADOS POR COMPONENTE');
    doc.tabela({
      compacta: true,
      colunas: [0.3, 0.18, 0.18, 0.16, 0.18],
      cabecalho: ['COMPONENTE', 'PMTA (MPa)', 'ESP. MÍN. (mm)', 'ESP. NOM.', 'MATERIAL'],
      linhas: m.componentes.map((c) => [
        { texto: c.nome },
        { texto: textoOu(c.pmta), centro: true, valor: true },
        { texto: textoOu(c.espReq), centro: true, valor: true },
        { texto: textoOu(c.espNom), centro: true, valor: true },
        { texto: textoOu(c.material), centro: true },
      ]),
    });
  }

  if (m.memorial.length > 0) {
    doc.y += 2;
    doc.faixa('MEMÓRIA DE CÁLCULO');
    for (const linha of m.memorial) {
      // As equações do motor vêm em LaTeX; aqui viram fração desenhada, com
      // subscrito, como na folha 6.1 do relatório. Imprimir a string crua punha
      // código-fonte num documento assinado.
      const formula = formulaDoLatex(linha);
      if (formula) {
        doc.formula(formula, { espacoAntes: 1.2 });
        continue;
      }
      const titulo = /^MEMORIAL DE C[ÁA]LCULO\b/i.test(linha);
      doc.texto(linha, {
        tamanho: titulo ? FONTE.secao : FONTE.tabela,
        negrito: titulo,
        espacoAntes: titulo ? 2.5 : 0,
      });
    }
  } else {
    doc.texto('Memorial de cálculo não salvo para este equipamento.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
      espacoAntes: 2,
    });
  }

  responsabilidadeTecnica(doc, m, 'PRONT-MEMORIAL.html');
}

/**
 * Pinta um croqui SVG na folha.
 *
 * **Isto é o único raster do prontuário vetorial, e é declarado.** O croqui é um
 * DESENHO, não uma fotografia — o ideal seria convertê-lo em traços do PDF, mas
 * o jsPDF não importa SVG sem plugin, e trazer um segundo motor de desenho
 * contradiz "não criar um segundo framework". A imagem é gerada em alta
 * resolução (3×) para não perder cota na impressão.
 *
 * Fica registrado como a diferença conhecida entre os dois motores no
 * prontuário: nas demais folhas não há uma única imagem.
 */
function desenharCroqui(doc: Documento, svgOuPng: string, altura: number): void {
  doc.garantirEspaco(altura + 4);
  const cache = (doc as unknown as { __croquis?: Map<string, { png: string; proporcao: number }> }).__croquis;
  const pronto = cache?.get(svgOuPng);
  if (!pronto) {
    // Sem a versão rasterizada (o pré-processo não rodou): a folha não inventa
    // um desenho, e diz o que faltou.
    doc.texto('Croqui não pôde ser convertido para impressão.', {
      tamanho: FONTE.nota,
      cor: COR.nota,
    });
    return;
  }
  // A proporção REAL vai junto: sem ela a primitiva assume 4:3 e o croqui sai
  // esticado — cota errada num documento técnico.
  foto(doc.pdf, pronto.png, { x: CAIXA.x, y: doc.y, largura: CAIXA.largura, altura }, pronto.proporcao);
  doc.y += altura;
}

/** Os títulos do sumário do prontuário — na ordem em que as folhas saem. */
export function secoesDoProntuario(m: ModeloProntuario): string[] {
  const s = ['Medição de espessura por ultrassom'];
  if (m.tipoEquipamento === 'vaso') {
    s.push('Croqui 2D cotado', 'Folha de dados');
  }
  s.push('Prontuário do equipamento', 'Procedimentos e dispositivos de segurança', 'Resumo dos cálculos');
  return s;
}
