import { CAIXA, COR, FONTE, LIMITE_CORPO } from './documentoA4';
import { foto } from './primitivas';
import type { CelulaDoc, Documento } from './documento';
import { textoOu } from './modelo';
import { extremosDaRegiao } from './folhas';
import { formulaDoLatex } from './latexMemorial';
import type { ModeloProntuario } from './modeloProntuario';

/**
 * O PRONTUÁRIO — modelo próprio, em 4 ou 5 folhas.
 *
 * ## Por que ele não é o relatório
 *
 * O relatório é o documento de um EVENTO: uma inspeção, com ensaios, laudo e
 * validade; ele é lido de ponta a ponta e por isso tem capa e sumário. O
 * prontuário é o documento de VIDA do equipamento — dados construtivos,
 * parâmetros de projeto e a última medição de integridade. Ele é CONSULTADO:
 * capa e sumário custavam duas folhas para anunciar quatro, e uma assinatura
 * por folha repetia seis vezes a mesma responsabilidade técnica (foi isso que
 * o levou a dez páginas, porque o bloco pede ~40 mm contíguos e, não cabendo,
 * ia sozinho para a página seguinte).
 *
 * O DESENHO é o mesmo do sistema — cabeçalho, faixas, tabelas, o realce da
 * medição, o memorial em álgebra. O que muda é a arrumação: compacto, e
 * **uma assinatura só, no fim**.
 *
 * ## As folhas
 *
 * 1. identificação do equipamento, do contratante e do documento;
 * 2. dados técnicos: construção, pressões, categorização, procedimentos;
 * 3. medição de espessura e instrumento;
 * 4. croqui cotado e dimensões — **só para vaso de pressão** (§8);
 * 5. memorial de cálculo e a responsabilidade técnica.
 *
 * Caldeira e autoclave não têm croqui: para elas são quatro folhas.
 */

function tabelaChaveValor(doc: Documento, campos: [string, string | null][], colunas = 2): void {
  const linhas: CelulaDoc[][] = [];
  for (let i = 0; i < campos.length; i += colunas) {
    const linha: CelulaDoc[] = [];
    for (let k = 0; k < colunas; k++) {
      const par = campos[i + k];
      linha.push({ texto: par ? par[0] : '', rotulo: !!par });
      linha.push({ texto: par ? textoOu(par[1]) : '', valor: true });
    }
    linhas.push(linha);
  }
  doc.tabela({
    compacta: true,
    colunas: colunas === 2 ? [0.22, 0.28, 0.22, 0.28] : [0.3, 0.7],
    linhas,
  });
}

/**
 * A RESPONSABILIDADE TÉCNICA — uma vez, no fim do documento.
 *
 * Assinatura de documento fica no fim do documento. Repeti-la em cada folha
 * não acrescenta responsabilidade nenhuma e consome, por folha, mais espaço do
 * que a maioria das seções.
 */
function responsabilidadeTecnica(doc: Documento, m: ModeloProntuario): void {
  const assinam = m.assinantes.slice(0, 2);
  if (assinam.length === 0) return;

  const alturaBloco = 6 + 7 + 2 + 15 + 1 + 3 * 4.4;
  doc.garantirEspaco(alturaBloco);
  doc.y += 6;
  doc.faixa('RESPONSABILIDADE TÉCNICA');
  doc.y += 2;

  const largura = (CAIXA.largura - 8) / 2;
  const base = doc.y;
  assinam.forEach((a, i) => {
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

// ── 1. IDENTIFICAÇÃO ────────────────────────────────────────────────────────
export function folhaProntIdentificacao(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.texto('Prontuário do Equipamento', { tamanho: FONTE.secao + 4, negrito: true, alinhamento: 'center' });
  doc.texto(`${textoOu(m.identificacao['TIPO DE EQUIPAMENTO'], 'Equipamento')} — NR-13 · Portaria nº 1.082/2018`, {
    tamanho: FONTE.nota,
    cor: COR.nota,
    alinhamento: 'center',
    espacoAntes: 0.8,
  });

  doc.banner('1. IDENTIFICAÇÃO DO EQUIPAMENTO');
  tabelaChaveValor(doc, Object.entries(m.identificacao) as [string, string | null][]);

  doc.faixa('CONTRATANTE');
  tabelaChaveValor(doc, [
    ['RAZÃO SOCIAL', m.cliente.razao],
    ['CNPJ', m.cliente.cnpj],
  ]);
  doc.tabela({
    compacta: true,
    colunas: [0.22, 0.78],
    linhas: [[{ texto: 'ENDEREÇO', rotulo: true }, { texto: textoOu(m.cliente.endereco), valor: true }]],
  });

  doc.faixa('CONTROLE DO DOCUMENTO');
  tabelaChaveValor(doc, [
    ['Nº DO PRONTUÁRIO', m.numero],
    ['DATA DE EMISSÃO', m.emissao],
    ['REVISÃO', m.revisao],
    ['DATA DA REVISÃO', m.dataRevisao],
  ]);

  // A foto do equipamento fecha a folha, ocupando o que sobra: é a
  // identificação visual, e aqui ela não disputa espaço com nada.
  if (m.fotoCapa) {
    const altura = Math.max(50, Math.min(120, LIMITE_CORPO - doc.y - 10));
    doc.faixa('REGISTRO FOTOGRÁFICO DO EQUIPAMENTO');
    foto(doc.pdf, m.fotoCapa, { x: CAIXA.x, y: doc.y, largura: CAIXA.largura, altura });
    doc.y += altura;
  }
}

// ── 2. DADOS TÉCNICOS ───────────────────────────────────────────────────────
export function folhaProntDadosTecnicos(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('2. DADOS TÉCNICOS E CATEGORIZAÇÃO');

  doc.faixa('ASPECTOS CONSTRUTIVOS');
  tabelaChaveValor(doc, Object.entries(m.construtivos) as [string, string | null][]);

  doc.faixa('PRESSÕES');
  doc.tabela({
    compacta: true,
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

  doc.faixa('ASPECTOS OPERACIONAIS');
  tabelaChaveValor(doc, Object.entries(m.operacionais) as [string, string | null][], 1);

  doc.faixa('CATEGORIZAÇÃO DO EQUIPAMENTO');
  doc.tabela({
    compacta: true,
    colunas: [0.34, 0.16, 0.34, 0.16],
    linhas: [
      [
        { texto: 'RELAÇÃO P (kPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categoria.kpaVolume), centro: true, valor: true },
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.categoria.resultadoKpa), centro: true, valor: true },
      ],
      [
        { texto: 'RELAÇÃO P (MPa) × V (m³)', rotulo: true },
        { texto: textoOu(m.categoria.mpaVolume), centro: true, valor: true },
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.categoria.resultadoMpa), centro: true, valor: true },
      ],
      [
        { texto: 'CLASSIFICAÇÃO DO FLUIDO', rotulo: true },
        { texto: textoOu(m.categoria.classeFluido), centro: true, valor: true },
        { texto: 'GRUPO / CATEGORIA', rotulo: true },
        {
          texto: `${textoOu(m.categoria.grupo)} / ${textoOu(m.categoria.categoria)}`,
          centro: true,
          valor: true,
        },
      ],
    ],
  });
  doc.texto(
    'O enquadramento na NR-13 usa a base kPa × m³ > 8; o grupo de potencial de risco, MPa × m³. ' +
      'Os dois valores são os calculados pelo sistema — esta folha não recalcula nenhum deles.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 1.5 },
  );

  // Os três textos do engenheiro fecham a folha, um sob o outro.
  doc.faixa('PROCEDIMENTOS DE INSPEÇÃO');
  doc.texto(textoOu(m.procedimentos, ''), { cor: COR.valor });
  doc.faixa('DISPOSITIVOS DE SEGURANÇA');
  doc.texto(textoOu(m.dispositivos, ''), { cor: COR.valor });
  doc.faixa('PONTOS DE ATENÇÃO');
  doc.texto(textoOu(m.atencao, ''), { cor: COR.valor });
}

// ── 3. MEDIÇÃO DE ESPESSURA ─────────────────────────────────────────────────
export function folhaProntUltrassom(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('3. MEDIÇÃO DE ESPESSURA POR ULTRASSOM');

  doc.faixa('INFORMAÇÕES DO ENSAIO');
  tabelaChaveValor(doc, [
    ['IDENTIFICAÇÃO / T.A.G.', m.tag],
    ['COMPONENTE', m.ultrassom.componente],
    ['APARELHO', m.ultrassom.aparelho],
    ['ACOPLANTE', m.ultrassom.acoplante],
    ['CABEÇOTE', m.ultrassom.cabecote],
    ['VELOCIDADE SÔNICA', m.ultrassom.velSonica],
    ['TEMP. DA SUPERFÍCIE', m.ultrassom.tempSup],
    ['ESTADO DA SUPERFÍCIE', m.ultrassom.estadoSup],
  ]);

  doc.faixa('PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (mm)');
  if (m.ultrassom.pontos.length > 0) {
    desenharGradeEspessura(doc, m);
  } else {
    doc.texto('Sem pontos de medição registrados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }

  doc.faixa('INSTRUMENTO DE MEDIÇÃO UTILIZADO');
  doc.tabela({
    compacta: true,
    colunas: [0.12, 0.26, 0.1, 0.16, 0.14, 0.22],
    linhas: [
      [
        { texto: 'PADRÃO', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.padrao), valor: true },
        { texto: 'Nº SÉRIE', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.serie), valor: true },
        { texto: 'CERTIFICADO', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.certificado), valor: true },
      ],
      [
        { texto: 'VALIDADE', rotulo: true },
        { texto: textoOu(m.ultrassom.instrumento.validade), valor: true, colspan: 5 },
      ],
    ],
  });
}

/**
 * A grade: uma tabela só quando todas as regiões medem nos MESMOS ângulos.
 *
 * O realce é o do relatório — maior leitura em azul-petróleo, menor em
 * vermelho. Numa grade de dezenas de números, é a menor que decide a vida
 * remanescente do equipamento.
 */
function desenharGradeEspessura(doc: Documento, m: ModeloProntuario): void {
  const { maior, menor } = extremosDaRegiao(m.ultrassom.pontos);
  const marca = (v: string | null | undefined): { destaque?: 'maior' | 'menor' } => {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return {};
    if (menor !== null && n === menor) return { destaque: 'menor' };
    if (maior !== null && n === maior) return { destaque: 'maior' };
    return {};
  };
  const mesmosAngulos = new Set(m.ultrassom.pontos.map((p) => p.angulos.join('|'))).size === 1;

  if (mesmosAngulos) {
    const angulos = m.ultrassom.pontos[0]?.angulos ?? [];
    const colMedida = angulos.length > 0 ? 0.4 / angulos.length : 0.4;
    doc.tabela({
      compacta: true,
      colunas: [0.22, 0.16, ...Array(Math.max(angulos.length, 1)).fill(colMedida), 0.11, 0.11],
      cabecalho: [
        'REGIÃO',
        'PONTO',
        ...(angulos.length > 0 ? angulos.map((a) => `${a}°`) : ['MEDIDA']),
        'MENOR',
        'ESP. MÍN. REQ.',
      ],
      linhas: m.ultrassom.pontos.map((p) => [
        { texto: p.regiao },
        { texto: p.ponto },
        ...(Array.from({ length: Math.max(angulos.length, 1) }, (_, i) => ({
          texto: textoOu(p.medidas[i]),
          centro: true,
          valor: true,
          ...marca(p.medidas[i]),
        })) as CelulaDoc[]),
        { texto: textoOu(p.menor), centro: true, valor: true, ...marca(p.menor) },
        { texto: textoOu(p.requerida), centro: true, valor: true },
      ]),
    });
    return;
  }

  // Ângulos diferentes entre regiões: cada uma tem a sua tabela. Um cabeçalho
  // comum inventaria ângulos que aquela região não mediu.
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
        'REGIÃO / PONTO',
        ...(angulos.length > 0 ? angulos.map((a) => `${a}°`) : ['MEDIDA']),
        'MENOR VALOR',
        'ESP. MÍN. REQUERIDA',
      ],
      linhas: linhas.map((p) => [
        { texto: p.ponto },
        ...(Array.from({ length: Math.max(angulos.length, 1) }, (_, i) => ({
          texto: textoOu(p.medidas[i]),
          centro: true,
          valor: true,
          ...marca(p.medidas[i]),
        })) as CelulaDoc[]),
        { texto: textoOu(p.menor), centro: true, valor: true, ...marca(p.menor) },
        { texto: textoOu(p.requerida), centro: true, valor: true },
      ]),
    });
  }
}

// ── 4. CROQUI — SÓ PARA VASO DE PRESSÃO ─────────────────────────────────────
export function folhaProntCroqui(doc: Documento, m: ModeloProntuario): void {
  doc.novaFolha();
  doc.banner('4. CROQUI 2D COTADO E DIMENSÕES');

  const vistas: [string, string | null][] = [
    ['VISTA LONGITUDINAL', m.croqui.longitudinal],
    ['VISTA TRANSVERSAL', m.croqui.transversal],
    ['DETALHE DO TAMPO', m.croqui.detalheTampo],
  ];
  const presentes = vistas.filter(([, svg]) => !!svg);

  if (presentes.length === 0) {
    doc.texto('Croqui não gerado para este equipamento.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 3 });
  } else {
    desenharPranchaDeVistas(doc, m, presentes);
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

  // A folha de dados derivada do modelo entra aqui, e não numa folha própria:
  // são poucos campos, e separá-los custava uma página inteira.
  const campos = Object.entries(m.folhaDados).filter(([, v]) => v !== null) as [string, string][];
  if (campos.length > 0) {
    doc.y += 2;
    doc.faixa('DADOS DERIVADOS DO MODELO');
    tabelaChaveValor(doc, campos);
  }
}

// ── 5. MEMORIAL + ASSINATURA ────────────────────────────────────────────────
export function folhaProntMemorial(doc: Documento, m: ModeloProntuario, numero = 5): void {
  doc.novaFolha();
  doc.banner(`${numero}. MEMORIAL DE CÁLCULO`);

  if (m.componentes.length > 0) {
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
    doc.faixa('MEMÓRIA DE CÁLCULO');
    for (const linha of m.memorial) {
      // As equações do motor vêm em LaTeX; aqui viram fração desenhada, com
      // subscrito. Imprimir a string crua punha código-fonte num documento
      // assinado.
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

  // A ÚNICA assinatura do documento, no fim dele.
  responsabilidadeTecnica(doc, m);
}

/**
 * A PRANCHA de vistas: a longitudinal grande à esquerda, as outras duas
 * empilhadas à direita.
 *
 * O equipamento é comprido: numa pilha de três faixas de largura inteira, a
 * vista longitudinal ficava com 5 cm de altura e as cotas viravam risco. Do
 * jeito da prancha técnica — a principal ocupando a coluna larga em toda a
 * altura, as auxiliares ao lado — nenhuma das três é suprimida e a que se lê
 * de perto é a que ganha espaço.
 */
function desenharPranchaDeVistas(
  doc: Documento,
  m: ModeloProntuario,
  presentes: [string, string | null][],
): void {
  const alturaTabela = m.dimensoes.length > 0 ? 14 + m.dimensoes.length * 6 : 0;
  const disponivel = LIMITE_CORPO - doc.y - alturaTabela - 8;

  if (presentes.length < 3) {
    for (const [titulo, svg] of presentes) {
      doc.faixa(titulo);
      desenharCroqui(doc, svg!, Math.max(50, Math.min(110, disponivel / presentes.length - 10)));
      doc.y += 2;
    }
    return;
  }

  const [principal, ...auxiliares] = presentes;
  const alturaPrancha = Math.max(70, Math.min(170, disponivel));
  const larguraEsq = CAIXA.largura * 0.6 - 3;
  const larguraDir = CAIXA.largura * 0.4 - 3;
  const xDir = CAIXA.x + larguraEsq + 6;
  const topo = doc.y;
  const alturaFaixa = 6.4;

  // Qual orientação preenche melhor a coluna: a que, ao caber inteira dentro
  // dela, ocupa mais área. Numa coluna alta e estreita, a vista comprida
  // deitada usa uma fração do espaço e girada usa quase tudo — e é a mesma
  // imagem, com as mesmas cotas.
  const cache = (doc as unknown as { __croquis?: Map<string, { proporcao: number }> }).__croquis;
  const alturaUtil = alturaPrancha - alturaFaixa;
  const areaNa = (p?: { proporcao: number }) => {
    if (!p || !p.proporcao) return 0;
    const larguraCabe = Math.min(larguraEsq, alturaUtil * p.proporcao);
    return larguraCabe * (larguraCabe / p.proporcao);
  };
  const girada = cache?.get(`${principal[1]}#girado`);
  const chavePrincipal =
    girada && areaNa(girada) > areaNa(cache?.get(principal[1]!)) ? `${principal[1]}#girado` : principal[1]!;

  doc.faixa(principal[0]);
  desenharCroqui(doc, chavePrincipal, alturaUtil, { x: CAIXA.x, largura: larguraEsq, y: doc.y });

  const alturaCada = (alturaPrancha - alturaFaixa * auxiliares.length) / auxiliares.length;
  let y = topo;
  for (const [titulo, svg] of auxiliares) {
    doc.y = y;
    doc.faixaEm(titulo, { x: xDir, largura: larguraDir });
    desenharCroqui(doc, svg!, alturaCada, { x: xDir, largura: larguraDir, y: doc.y });
    y += alturaCada + alturaFaixa;
  }

  doc.y = topo + alturaPrancha + 3;
}

/**
 * Pinta um croqui na folha.
 *
 * **Este é o único raster do prontuário, e é declarado.** O croqui é um
 * DESENHO, não uma fotografia — o ideal seria convertê-lo em traços do PDF,
 * mas o jsPDF não importa SVG sem plugin, e trazer um segundo motor de desenho
 * contradiz "não criar um segundo framework". A imagem é gerada em alta
 * resolução (3×) para não perder nitidez na impressão.
 */
function desenharCroqui(
  doc: Documento,
  svgOuPng: string,
  altura: number,
  caixa?: { x: number; largura: number; y?: number },
): void {
  if (!caixa) doc.garantirEspaco(altura + 4);
  const cache = (doc as unknown as { __croquis?: Map<string, { png: string; proporcao: number }> }).__croquis;
  const pronto = cache?.get(svgOuPng);
  if (!pronto) {
    // Sem a versão rasterizada (o pré-processo não rodou): a folha não inventa
    // um desenho, e diz o que faltou.
    doc.texto('Croqui não pôde ser convertido para impressão.', { tamanho: FONTE.nota, cor: COR.nota });
    return;
  }
  const x = caixa?.x ?? CAIXA.x;
  const largura = caixa?.largura ?? CAIXA.largura;
  const y = caixa?.y ?? doc.y;
  // A proporção REAL vai junto: sem ela a primitiva assume 4:3 e o croqui sai
  // esticado — cota errada num documento técnico.
  foto(doc.pdf, pronto.png, { x, y, largura, altura }, pronto.proporcao);
  if (!caixa) doc.y += altura;
}

/** As seções do prontuário, na ordem em que saem. */
export function secoesDoProntuario(m: ModeloProntuario): string[] {
  const s = ['Identificação do equipamento', 'Dados técnicos e categorização', 'Medição de espessura por ultrassom'];
  if (m.tipoEquipamento === 'vaso') s.push('Croqui 2D cotado e dimensões');
  s.push('Memorial de cálculo');
  return s;
}
