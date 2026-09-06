import { CAIXA, COR, FONTE, LIMITE_CORPO, PT, alturaLinha } from './documentoA4';
import { secoesPresentes, type SecaoRelatorio } from './composicao';
import { ALTURA_GRAFICO_TH, desenharGraficoTh, numeroDoTexto, pontosDaCurva } from './graficoTh';
import { foto } from './primitivas';
import { FAMILIA } from './carlito';
import { camposDaPlaca } from '../placaIdentificacao';
import type { CelulaDoc, Documento } from './documento';
import { rotuloLaudo } from './rotulos';
import { DESCRICAO_VARIAVEL, prepararFormula, variaveisDaFormula } from './formulaMatematica';
import { formulaDoLatex } from './latexMemorial';
import { textoOu, type ExameVisual, type FotoModelo, type ItemChecklist, type ModeloRelatorio } from './modelo';

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
  esticavel = false,
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
  doc.tabela({ colunas: largura, linhas, esticavel });
}

/** A resposta guardada, sem acento e em minúsculas — só para COMPARAR. */
function chaveResposta(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * As três marcas de uma resposta SIM / NÃO / N.A.
 *
 * A referência não imprime a resposta por extenso: ela marca a coluna. E a
 * quarta possibilidade — resposta que não é nenhuma das três, como "Ambiente
 * aberto" ou "Sim (RGI)" — não pode sumir: o `extra` volta para a coluna
 * OBSERVAÇÃO, porque apagar a resposta do inspetor é pior do que imprimi-la
 * fora da coluna.
 */
export function marcasSimNaoNa(resposta: string | null | undefined): {
  sim: boolean;
  nao: boolean;
  na: boolean;
  extra: string | null;
} {
  const k = chaveResposta(resposta);
  if (k === '') return { sim: false, nao: false, na: false, extra: null };
  const na = k === 'na' || k === 'n/a' || k === 'n.a.' || k.startsWith('nao aplica');
  const nao = !na && k === 'nao';
  const sim = k === 'sim' || k.startsWith('sim ');
  const conhecida = na || nao || sim;
  return { sim, nao, na, extra: conhecida ? null : String(resposta ?? '').trim() || null };
}

/** As três marcas da folha da DOCUMENTAÇÃO (Existe / Não ident. / Não aplica). */
export function marcasDocumentacao(resposta: string | null | undefined): {
  existe: boolean;
  naoIdent: boolean;
  naoAplica: boolean;
} {
  const k = chaveResposta(resposta);
  return {
    existe: k === 'existe',
    naoIdent: k.startsWith('nao ident'),
    naoAplica: k.startsWith('nao aplica'),
  };
}

/**
 * Uma coluna de marcação.
 *
 * `semDestaque` porque numa linha de três colunas duas estão sempre vazias — e
 * o vazio ali É a resposta, não uma pendência. Sem isso a prévia pintava de
 * amarelo dois terços de todo checklist respondido.
 */
function celulaMarca(marcado: boolean, id: string, rotulo: string): CelulaDoc {
  return { texto: marcado ? 'X' : '', centro: true, valor: true, semDestaque: true, id, rotuloCampo: rotulo };
}

/**
 * O exame visual, como a referência o imprime: os QUINZE itens, numerados, com
 * a marcação em SIM / NÃO / N.A. e a coluna de observação.
 *
 * O que mudou em 06/09/2026: a folha imprimia o NÚMERO do item no lugar da
 * pergunta (o formulário guarda `{ "1": "sim" }`) e escondia os itens sem
 * resposta, renumerando o resto. As duas coisas produziam um documento
 * assinado que não dizia o que foi verificado.
 */
function blocoExame(
  doc: Documento,
  titulo: string,
  exame: ExameVisual,
  prefixo = 'exame',
  nomeDoExame = 'exame',
): void {
  doc.banner(titulo);
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'T.A.G. / IDENTIFICAÇÃO', rotulo: true },
        { texto: textoOu(exame.tag), valor: true, id: `${prefixo}.tag`, rotuloCampo: 'T.A.G. / identificação' },
        { texto: 'Nº DE SÉRIE', rotulo: true },
        { texto: textoOu(exame.serie), valor: true, id: `${prefixo}.serie`, rotuloCampo: 'Nº de série' },
      ],
    ],
  });

  // As três colunas marcáveis respondem a UMA pergunta, e ela é o que dá
  // sentido à marca: sem esta faixa, "X" na coluna SIM não diz se o item está
  // conforme ou se a não conformidade foi encontrada.
  doc.faixa('FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.06, 0.44, 0.08, 0.08, 0.08, 0.26],
    cabecalho: ['Nº', 'ITEM DE VERIFICAÇÃO', 'SIM', 'NÃO', 'N.A.', 'OBSERVAÇÃO'],
    linhas: exame.itens.map((it, i) => {
      const m = marcasSimNaoNa(it.resposta);
      const obs = [it.observacao, m.extra].filter(Boolean).join(' · ');
      const base = `${prefixo}.item-${i + 1}`;
      return [
        { texto: String(i + 1), centro: true },
        { texto: it.titulo },
        celulaMarca(m.sim, `${base}.sim`, `${i + 1}. ${it.titulo} — SIM`),
        celulaMarca(m.nao, `${base}.nao`, `${i + 1}. ${it.titulo} — NÃO`),
        celulaMarca(m.na, `${base}.na`, `${i + 1}. ${it.titulo} — N.A.`),
        { texto: obs, valor: true, id: `${base}.obs`, rotuloCampo: `${i + 1}. ${it.titulo} — observação`, multilinha: true },
      ];
    }),
  });

  doc.secao('Observações gerais');
  doc.texto(textoOu(exame.observacoes, ''), {
    cor: COR.valor,
    id: `${prefixo}.observacoes`,
    rotuloCampo: 'Observações gerais',
  });

  doc.secao(`Conclusão técnica — ${nomeDoExame}`);
  doc.texto(textoOu(exame.conclusao, ''), {
    cor: COR.valor,
    id: `${prefixo}.conclusao`,
    rotuloCampo: 'Conclusão técnica',
  });
  doc.tabela({
    compacta: true,
    colunas: [0.3, 0.7],
    linhas: [
      [
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(exame.resultado), valor: true, id: `${prefixo}.resultado`, rotuloCampo: 'Resultado do exame' },
      ],
    ],
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
export function folhaSumario(
  doc: Documento,
  m: ModeloRelatorio,
  secoes: SecaoSumario[],
  paginas: Map<string, number> = new Map(),
): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('sumario');
  doc.banner('SUMÁRIO GERAL');
  // A referência numera com o número DA SEÇÃO (7.1, 7.2…), não com a posição
  // na lista, e traz a PÁGINA de cada uma. O número da página vem da primeira
  // passagem do gerador — a mesma que já contava o total do rodapé.
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.1, 0.78, 0.12],
    cabecalho: ['ITEM', 'SEÇÃO', 'PÁG.'],
    linhas: secoes.map((sec) => [
      { texto: sec.numero, centro: true, rotulo: true },
      { texto: sec.titulo },
      { texto: paginas.has(sec.titulo) ? String(paginas.get(sec.titulo)) : '', centro: true },
    ]),
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
    cabecalho: ['DOCUMENTO', 'TÍTULO'],
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
        { texto: 'ASME VIII Div. 1', rotulo: true },
        {
          texto: 'Rules for Construction of Pressure Vessels',
          id: 'referencias.asme-viii',
          rotuloCampo: 'Referência ASME VIII',
        },
      ],
      [
        { texto: 'ABNT NBR 16035', rotulo: true },
        {
          texto: 'Vasos de pressão e trocadores de calor — Requisitos',
          id: 'referencias.abnt-16035',
          rotuloCampo: 'Referência ABNT NBR 16035',
        },
      ],
      [
        { texto: 'ASME V', rotulo: true },
        {
          texto: 'Nondestructive Examination — Ensaios não destrutivos',
          id: 'referencias.asme-v',
          rotuloCampo: 'Referência ASME V',
        },
      ],
      [
        // A quinta linha da referência é uma linha EM BRANCO, para o documento
        // que aquela inspeção usou e o sistema não conhece.
        { texto: '', valor: true, id: 'referencias.extra-doc', rotuloCampo: 'Documento de referência adicional' },
        { texto: '', valor: true, id: 'referencias.extra-titulo', rotuloCampo: 'Título do documento adicional' },
      ],
    ],
  });

  // 2.1 — o escopo daquela inspeção. Não existe fonte automática: é o que o
  // engenheiro delimita, e a referência reserva o bloco para isso.
  doc.blocoAteOFim('escopo.texto', 'Escopo e observações da inspeção', '2.1 ESCOPO E OBSERVAÇÕES DA INSPEÇÃO', 18, 36);
  doc.fecharSecaoElastica();
}

// ── 3. IDENTIFICAÇÃO / PLACA ────────────────────────────────────────────────
export function folhaIdentificacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('3. IDENTIFICAÇÃO DO EQUIPAMENTO — PLACA');
  tabelaChaveValor(doc, Object.entries(m.equipamento) as [string, string | null][], 2, 'equipamento');

  doc.faixa('PRESSÕES');
  doc.tabela({
    colunas: [0.36, 0.16, 0.16, 0.16, 0.16],
    cabecalho: ['GRANDEZA', 'MPa', 'psi', 'kgf/cm²', 'bar'],
    // Pressão é campo CALCULADO, e mesmo assim recebe override: a revisão
    // integral antes da emissão é o requisito. O cálculo do sistema não muda —
    // o override vive na chave do relatório e só altera o que este documento
    // imprime.
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true, id: idCampo('pressoes', p.rotulo + ' MPa'), rotuloCampo: `${p.rotulo} (MPa)` },
      { texto: textoOu(p.psi), centro: true, valor: true, id: idCampo('pressoes', p.rotulo + ' psi'), rotuloCampo: `${p.rotulo} (psi)` },
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
  doc.secao('Registro fotográfico da placa de identificação');
  doc.garantirEspaco(ALTURA_PLACA + 2);

  // A placa é a ÚLTIMA coisa da folha 3, então o que sobra abaixo dela é o
  // fim do papel. Desenhá-la colada no topo desse espaço deixava um vazio de
  // vários centímetros embaixo — o defeito que o dono apontou. Ela agora ocupa
  // até 80% do espaço livre (nunca menos que a altura clássica de 62 mm) e
  // fica CENTRADA no que restou.
  const livre = LIMITE_CORPO - doc.y;
  const altura = Math.max(ALTURA_PLACA, Math.min(livre - 4, livre * 0.8));
  const topo = doc.y + Math.max(0, (livre - altura) / 2);

  if (m.placaReal) {
    // `foto` já encaixa DENTRO do quadro mantendo a proporção medida — é o
    // "contain" pedido, e é o que impede a placa de sair esticada.
    foto(doc.pdf, m.placaReal.dataUrl, { x: CAIXA.x, y: topo, largura: CAIXA.largura, altura }, m.placaReal.proporcao);
  } else {
    desenharPlacaReconstruida(doc, m, topo, altura);
  }

  // A ÁREA INTEIRA da placa é clicável (13D-bis, tipo imagem): o usuário troca
  // a placa reconstruída por uma foto clicando NELA, dentro do documento, em
  // vez de procurar um botão na barra do topo. "Remover imagem" devolve a
  // reconstrução — ela é o padrão, não um vazio.
  doc.anotarCampo(
    'placa.foto',
    'Foto da placa de identificação',
    m.placaReal ? '(imagem)' : '',
    m.placaReal ? '(imagem)' : '',
    false,
    { x: CAIXA.x, y: topo, larg: CAIXA.largura, alt: altura },
    'imagem',
  );
  doc.y = topo + altura;
}

/**
 * A placa RECONSTRUÍDA — desenhada, não fotografada.
 *
 * Texto, linhas e moldura em vetor: é o mesmo motor que desenha o resto do
 * documento, então a placa fica selecionável e nítida em qualquer zoom. Nenhum
 * dado é inventado: campo sem valor na ficha sai com o travessão do documento.
 */
function desenharPlacaReconstruida(doc: Documento, m: ModeloRelatorio, topo: number, alturaTotal = ALTURA_PLACA): void {
  const campos = camposDaPlaca(m.equipamento, m.pressoes);
  const largura = CAIXA.largura * 0.72;
  const x = CAIXA.x + (CAIXA.largura - largura) / 2;
  const alturaTitulo = 8;
  const linhas = Math.ceil(campos.length / 2);
  const alturaLinhaPlaca = (alturaTotal - alturaTitulo - 4) / linhas;
  const y0 = topo + 2;

  doc.pdf.setDrawColor(COR.texto);
  doc.pdf.setLineWidth(0.8 * PT);
  doc.pdf.rect(x, y0, largura, alturaTotal - 4);

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
/**
 * A MATRIZ do item 13.5.1.2 — a tabela da norma, como a referência a imprime.
 *
 * Ela é a NORMA impressa, não uma conta: as cinco faixas de P.V. e as quatro
 * classes de fluido são texto fixo do regulamento. A categoria do equipamento
 * continua vindo de `calc/categoria.ts`; esta tabela só mostra ao leitor de
 * onde ela saiu.
 */
const MATRIZ_13512: { classe: string; descricao: string; categorias: string[] }[] = [
  {
    classe: 'A',
    descricao: 'Fluido inflamável; combustível com temperatura ≥ 200 °C; tóxico com limite de tolerância ≤ 20 ppm; hidrogênio; acetileno',
    categorias: ['I', 'I', 'II', 'III', 'III'],
  },
  {
    classe: 'B',
    descricao: 'Combustível com temperatura menor que 200 °C; tóxico com limite de tolerância > 20 ppm',
    categorias: ['I', 'II', 'III', 'IV', 'IV'],
  },
  { classe: 'C', descricao: 'Vapor de água; gases asfixiantes simples; ar comprimido', categorias: ['I', 'II', 'III', 'IV', 'V'] },
  { classe: 'D', descricao: 'Outro fluido', categorias: ['II', 'III', 'IV', 'V', 'V'] },
];

// As cinco faixas de P.V. do item 13.5.1.2, na MESMA quebra da referência:
// o número do grupo em cima, os limites embaixo. O cabeçalho da tabela quebra
// linha, então o texto cabe na coluna em vez de invadir a vizinha.
const FAIXAS_PV = ['1\nP.V ≥ 100', '2\nP.V < 100\nP.V ≥ 30', '3\nP.V < 30\nP.V ≥ 2,5', '4\nP.V < 2,5\nP.V ≥ 1', '5\nP.V < 1'];

export function folhaCategorizacao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('4. CATEGORIZAÇÃO DE RISCO');
  doc.texto('Classificação do vaso de pressão conforme o item 13.5.1.2 da norma NR-13.', {
    tamanho: FONTE.nota,
    cor: COR.nota,
    espacoAntes: 1,
  });

  // As alturas desta folha sao maiores de proposito: o conteudo dela e curto
  // e fixo, e sem isso a pagina terminava aos dois tercos com um vazio no pe.
  const c = m.categorizacaoFolha;
  doc.tabela({
    alturaMinima: 12,
    colunas: [0.26, 0.24, 0.28, 0.22],
    linhas: [
      [
        { texto: 'FLUIDO DE TRABALHO', rotulo: true },
        { texto: textoOu(c.fluidoTrabalho), valor: true, id: 'categoria.fluido-trabalho', rotuloCampo: 'Fluido de trabalho' },
        { texto: 'CÓDIGO DE PROJETO', rotulo: true },
        { texto: textoOu(c.codigoProjeto), valor: true, id: 'categoria.codigo-projeto', rotuloCampo: 'Código de projeto' },
      ],
      [
        { texto: 'PRESSÃO MÁX. ADMISSÍVEL (PMTA)', rotulo: true },
        { texto: textoOu(c.pmta), valor: true, id: 'categoria.pmta', rotuloCampo: 'PMTA na categorização' },
        { texto: 'VOLUME GEOMÉTRICO', rotulo: true },
        { texto: textoOu(c.volumeGeometrico), valor: true, id: 'categoria.volume', rotuloCampo: 'Volume geométrico' },
      ],
      [
        { texto: 'PRODUTO P.V. (kPa × m³)', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.pvKpa), valor: true, id: 'categoria.pv-kpa', rotuloCampo: 'Produto P.V. (kPa × m³)' },
        { texto: 'P.V. > 8 — APLICA-SE A NR-13?', rotulo: true },
        { texto: textoOu(c.aplicaNr13), valor: true, id: 'categoria.aplica-nr13', rotuloCampo: 'Aplica-se a NR-13?' },
      ],
      [
        { texto: 'PRODUTO P.V. PARA RISCO (MPa × m³)', rotulo: true },
        { texto: textoOu(m.categorizacaoDetalhe.pvMpa), valor: true, id: 'categoria.pv-mpa', rotuloCampo: 'Produto P.V. para risco (MPa × m³)' },
        { texto: 'CLASSE DO FLUIDO', rotulo: true },
        { texto: textoOu(m.equipamento['CLASSE DO FLUIDO']), valor: true, id: 'categoria.classe-do-fluido', rotuloCampo: 'Classe do fluido' },
      ],
      [
        { texto: 'GRUPO POTENCIAL DE RISCO', rotulo: true },
        { texto: textoOu(m.categoria.grupo), valor: true, id: 'categoria.grupo', rotuloCampo: 'Grupo de potencial de risco' },
        { texto: 'CATEGORIA DO VASO', rotulo: true },
        { texto: textoOu(m.categoria.catFinal), valor: true, id: 'categoria.categoria', rotuloCampo: 'Categoria do equipamento' },
      ],
    ],
  });

  doc.faixa('MATRIZ DE CATEGORIZAÇÃO — item 13.5.1.2 da NR-13');
  doc.tabela({
    compacta: true,
    alturaMinima: 17,
    colunas: [0.4, 0.12, 0.12, 0.12, 0.12, 0.12],
    cabecalho: ['CLASSE DE FLUIDO (CORPO / TUBO)', ...FAIXAS_PV],
    linhas: MATRIZ_13512.map((linha) => [
      { texto: `${linha.classe} — ${linha.descricao}` },
      ...linha.categorias.map((cat) => ({ texto: cat, centro: true })),
    ]),
  });

  doc.faixa('OPERAÇÃO DO VASO DE PRESSÃO');
  doc.tabela({
    alturaMinima: 12,
    colunas: [0.6, 0.4],
    linhas: [
      [
        { texto: 'CATEGORIA DO VASO', rotulo: true },
        { texto: textoOu(m.categoria.catFinal), centro: true, valor: true, id: 'categoria.operacao-categoria', rotuloCampo: 'Categoria do vaso (operação)' },
      ],
      [
        { texto: 'É OBRIGATÓRIO OPERADOR TREINADO (ANEXO I-B)?', rotulo: true },
        { texto: textoOu(c.operadorTreinado), centro: true, valor: true, id: 'categoria.operador-treinado', rotuloCampo: 'Operador treinado obrigatório?' },
      ],
    ],
  });

  doc.texto(
    'A categorização segue o item 13.5.1.2 da NR-13: o grupo de potencial de risco resulta do ' +
      'produto pressão × volume, e a categoria, do cruzamento desse grupo com a classe do fluido.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2, id: 'categoria.nota', rotuloCampo: 'Nota da categorização' },
  );

  // O bloco de observações é o ÚLTIMO da folha e cresce até o fim dela. A
  // referência reserva um retângulo grande para ele; deixá-lo do tamanho de
  // uma linha era o que deixava um terço da folha 4 em branco.
  doc.blocoAteOFim('categoria.observacoes', 'Observações sobre a categorização', 'Observações sobre a categorização');
}

// ── 5. DADOS TÉCNICOS / PRONTUÁRIO ──────────────────────────────────────────
export function folhaDadosTecnicos(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('prontuario');
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
    true,
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
    true,
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
    esticavel: true,
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
    esticavel: true,
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
  doc.blocoAteOFim(
    'prontuario.observacoes',
    'Observações e pendências do prontuário',
    'OBSERVAÇÕES E PENDÊNCIAS DO PRONTUÁRIO',
    18,
    34,
  );
  doc.fecharSecaoElastica();
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

  // ── MEMORIAL POR COMPONENTE ─────────────────────────────────────────────
  //
  // Bloco 1.1 · a folha deixou de ser uma tabela de números soltos e passou a
  // ler como memorial de engenharia: para cada componente, a EQUAÇÃO aplicada,
  // os dados que entraram nela (símbolo · descrição · valor · unidade) e o
  // resultado que o motor produziu.
  //
  // As duas fórmulas — espessura e PMTA — vêm de `nr13_calc_.componentes[]`,
  // gravadas pelo motor do memorial. O gerador não conhece engenharia: ele
  // reformata a string para poder desenhar a fração, e imprime.
  for (const c of m.componentes) {
    doc.faixa(`MEMÓRIA DE CÁLCULO — ${c.nome.toUpperCase()}`);
    const pref = idCampo('componente', c.nome);

    doc.secao('Fórmulas aplicadas');
    const fT = prepararFormula(c.formulaT);
    const fP = prepararFormula(c.formulaP);
    if (fT) doc.formula(fT);
    if (fP) doc.formula(fP);
    if (!fT && !fP) {
      doc.texto('Memorial sem fórmula registrada para este componente.', {
        tamanho: FONTE.nota,
        cor: COR.nota,
      });
    }

    doc.secao('Dados utilizados');
    // A legenda descreve só os símbolos que ESTAS fórmulas usam; variável que
    // não aparece na equação não entra — legenda com símbolo ausente é ruído.
    const simbolos = variaveisDaFormula(c.formulaT, c.formulaP);
    const valorDe: Record<string, string | null> = {
      S: c.s,
      E: c.e,
      t: c.espNom,
      D: c.raio ? String(Number(c.raio) * 2) : null,
      Ri: c.raio,
      R: c.raio,
      L: c.raio,
      c: c.ca,
      PMTA: c.pmta,
    };
    doc.tabela({
      compacta: true,
      colunas: [0.12, 0.48, 0.22, 0.18],
      cabecalho: ['SÍMBOLO', 'DESCRIÇÃO', 'VALOR', 'UNIDADE'],
      linhas: simbolos.map((sim) => {
        const d = DESCRICAO_VARIAVEL[sim] ?? { descricao: '—', unidade: '—' };
        return [
          { texto: sim, centro: true, rotulo: true },
          { texto: d.descricao },
          {
            texto: textoOu(valorDe[sim] ?? null),
            centro: true,
            valor: true,
            id: `${pref}.var-${sim.toLowerCase()}`,
            rotuloCampo: `${c.nome} — ${d.descricao} (${sim})`,
          },
          { texto: d.unidade, centro: true },
        ];
      }),
    });

    // PARÂMETROS E RESULTADOS — as quatro linhas da referência, com os oito
    // campos que ela imprime. E, S e o raio já apareciam na legenda dos
    // símbolos; aqui eles aparecem com o RÓTULO documental, que é o que um
    // fiscal procura na folha.
    doc.secao(`Parâmetros e resultados: ${c.nome.toUpperCase()}`);
    const rotuloRaio = /tampo/i.test(c.nome) ? 'RAIO DA COROA (L)' : 'RAIO INTERNO (Ri)';
    doc.tabela({
      compacta: true,
      colunas: [0.3, 0.2, 0.3, 0.2],
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
          { texto: rotuloRaio, rotulo: true },
          { texto: textoOu(c.raio), centro: true, valor: true, id: `${pref}.raio`, rotuloCampo: `${c.nome} — ${rotuloRaio.toLowerCase()}` },
        ],
        [
          { texto: /tampo/i.test(c.nome) ? 'MATERIAL DO TAMPO' : 'MATERIAL DO CASCO', rotulo: true },
          { texto: textoOu(c.material), centro: true, valor: true, id: `${pref}.material`, rotuloCampo: `${c.nome} — material` },
          { texto: 'TENSÃO ADMISSÍVEL (S)', rotulo: true },
          { texto: textoOu(c.s), centro: true, valor: true, id: `${pref}.tensao`, rotuloCampo: `${c.nome} — tensão admissível` },
        ],
      ],
    });

    // A situação é COMPARAÇÃO entre dois números que já vieram calculados —
    // não é cálculo de engenharia, é leitura. Sem um dos dois, o documento não
    // afirma nada.
    const medida = Number(String(c.espNom ?? '').replace(',', '.'));
    const requerida = Number(String(c.espReq ?? '').replace(',', '.'));
    const situacao =
      Number.isFinite(medida) && Number.isFinite(requerida)
        ? medida >= requerida
          ? 'Espessura medida MAIOR OU IGUAL à mínima requerida — componente aprovado no critério de espessura.'
          : 'Espessura medida MENOR que a mínima requerida — componente reprovado no critério de espessura.'
        : '';
    doc.secao('Situação do componente');
    doc.texto(situacao, {
      cor: COR.valor,
      id: `${pref}.situacao`,
      rotuloCampo: `${c.nome} — situação`,
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
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'T.A.G.', rotulo: true },
        { texto: textoOu(m.tag), valor: true, id: 'memoria.tag', rotuloCampo: 'T.A.G. do memorial' },
        { texto: 'CÓDIGO DE PROJETO', rotulo: true },
        {
          texto: textoOu(m.equipamento['CÓDIGO DE PROJETO']),
          valor: true,
          id: 'memoria.codigo-projeto',
          rotuloCampo: 'Código de projeto do memorial',
        },
      ],
    ],
  });
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
    // As equações vêm em LaTeX (`$ t_{req} = \frac{...}{...} $`), que é o que
    // o KaTeX renderiza na tela. Imprimir a string crua punha código-fonte no
    // documento assinado — e o jsPDF ainda cortava no primeiro símbolo ausente.
    // Aqui elas viram fração desenhada, com subscrito de verdade.
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
}

// ── 8. DADOS GERAIS DA INSPEÇÃO ─────────────────────────────────────────────
/** As quatro naturezas de inspeção da NR-13 — marcáveis, como na referência. */
const NATUREZAS = ['INICIAL', 'PERIÓDICA', 'EXTRAORDINÁRIA', 'OCORRÊNCIA'];

export function folhaDadosInspecao(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.banner('7. EXAMES REALIZADOS — DADOS GERAIS DA INSPEÇÃO');

  const d = m.dadosInspecao;
  doc.tabela({
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'DATA DE INÍCIO DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(d.dataInicio), valor: true, id: 'inspecao.data-inicio', rotuloCampo: 'Data de início da inspeção' },
        { texto: 'DATA DE TÉRMINO', rotulo: true },
        { texto: textoOu(d.dataTermino), valor: true, id: 'inspecao.data-termino', rotuloCampo: 'Data de término' },
      ],
      [
        { texto: 'EQUIPAMENTO / T.A.G.', rotulo: true },
        { texto: textoOu(d.equipamento), valor: true, id: 'inspecao.equipamento', rotuloCampo: 'Equipamento / T.A.G.' },
        { texto: 'Nº DE SÉRIE', rotulo: true },
        { texto: textoOu(d.serie), valor: true, id: 'inspecao.serie', rotuloCampo: 'Nº de série' },
      ],
      [
        { texto: 'Nº DA A.R.T. (CREA)', rotulo: true },
        { texto: textoOu(d.art), valor: true, id: 'inspecao.art', rotuloCampo: 'Nº da A.R.T. (CREA)' },
        { texto: 'Nº DO RELATÓRIO', rotulo: true },
        { texto: textoOu(d.numeroRelatorio), valor: true, id: 'inspecao.numero-relatorio', rotuloCampo: 'Nº do relatório' },
      ],
    ],
  });

  // NATUREZA e ENSAIOS saem MARCADOS, não escritos por extenso: é assim que a
  // referência os imprime e é o que um fiscal lê de relance.
  doc.faixa('NATUREZA DA INSPEÇÃO');
  const naturezaAtual = String(m.tipoInspecao ?? '').toUpperCase();
  doc.tabela({
    compacta: true,
    colunas: [0.35, 0.15, 0.35, 0.15],
    linhas: [0, 2].map((i) =>
      [i, i + 1].flatMap((k) => [
        { texto: NATUREZAS[k], rotulo: true } as CelulaDoc,
        celulaMarca(
          naturezaAtual.includes(NATUREZAS[k].replace('Ó', 'O').replace('Á', 'A')) || naturezaAtual.includes(NATUREZAS[k]),
          `inspecao.natureza-${NATUREZAS[k].toLowerCase()}`,
          `Natureza — ${NATUREZAS[k]}`,
        ),
      ]),
    ),
  });

  doc.faixa('TIPO DE EXAME / ENSAIOS REALIZADOS');
  const e = d.ensaios;
  doc.tabela({
    compacta: true,
    colunas: [0.35, 0.15, 0.35, 0.15],
    linhas: [0, 2, 4].map((i) =>
      [i, i + 1].flatMap((k) => [
        { texto: e[k]?.rotulo ?? '', rotulo: true } as CelulaDoc,
        celulaMarca(!!e[k]?.feito, `inspecao.ensaio-${k}`, `Ensaio — ${e[k]?.rotulo ?? ''}`),
      ]),
    ),
  });

  doc.faixa('RESULTADO DO EXAME VISUAL');
  doc.tabela({
    compacta: true,
    colunas: [0.5, 0.5],
    linhas: [
      [
        { texto: 'VISUAL EXTERNO', rotulo: true },
        { texto: textoOu(d.resultadoVisualExterno), centro: true, valor: true, id: 'inspecao.resultado-externo', rotuloCampo: 'Resultado do visual externo' },
      ],
      [
        { texto: 'VISUAL INTERNO', rotulo: true },
        { texto: textoOu(d.resultadoVisualInterno), centro: true, valor: true, id: 'inspecao.resultado-interno', rotuloCampo: 'Resultado do visual interno' },
      ],
    ],
  });

  doc.secao('RESULTADO DOS ENSAIOS REALIZADOS');
  doc.texto(textoOu(rotuloLaudo(m.laudo.apto)), {
    cor: COR.valor,
    id: 'inspecao.resultado-ensaios',
    rotuloCampo: 'Resultado dos ensaios realizados',
  });

  doc.secao('OBSERVAÇÕES');
  doc.texto('', { cor: COR.valor, id: 'inspecao.observacoes', rotuloCampo: 'Observações da inspeção' });
}

// ── 9 a 11. VERIFICAÇÃO DA DOCUMENTAÇÃO E CHECKLIST NR-13 ───────────────────
//
// São TRÊS folhas na referência, e cada uma tem um papel diferente:
//   7.1   · a documentação existente na data da inspeção (Existe / Não ident. /
//           Não aplica), com observação por item;
//   7.1.1 · o checklist parte 1 — enquadramento, prontuário, exame externo e o
//           quadro de instrumentos e dispositivos de segurança;
//   7.1.2 · o checklist parte 2 — exame interno, ensaio hidrostático e as
//           considerações finais.
//
// Até 06/09/2026 as três viravam UMA folha com uma coluna RESULTADO de texto:
// o documento não tinha o quadro de instrumentos, não separava documentação de
// checklist e escondia todo item sem resposta.

/** Uma seção do checklist, com as marcas SIM / NÃO / N.A. da referência. */
function tabelaChecklist(doc: Documento, secao: { titulo: string; itens: ItemChecklist[] }, prefixo: string): void {
  doc.faixa(secao.titulo.toUpperCase());
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.5, 0.08, 0.08, 0.08, 0.26],
    cabecalho: ['ITEM VERIFICADO', 'SIM', 'NÃO', 'N.A.', 'OBSERVAÇÃO'],
    linhas: secao.itens.map((it, i) => {
      const marca = marcasSimNaoNa(it.resposta);
      const base = `${prefixo}.${i + 1}`;
      const obs = [it.observacao, marca.extra].filter(Boolean).join(' · ');
      return [
        { texto: it.titulo },
        celulaMarca(marca.sim, `${base}.sim`, `${it.titulo} — SIM`),
        celulaMarca(marca.nao, `${base}.nao`, `${it.titulo} — NÃO`),
        celulaMarca(marca.na, `${base}.na`, `${it.titulo} — N.A.`),
        { texto: obs, valor: true, id: `${base}.obs`, rotuloCampo: `${it.titulo} — observação`, multilinha: true },
      ];
    }),
  });
}

export function folhasChecklist(doc: Documento, m: ModeloRelatorio): void {
  const secoes = m.checklist;
  const documentacao = secoes[0];
  const parte1 = secoes.slice(1, 4);
  const parte2 = secoes.slice(4);

  // ── 7.1 · VERIFICAÇÃO DA DOCUMENTAÇÃO ────────────────────────────────────
  doc.novaFolha();
  doc.abrirSecaoElastica('documentacao');
  doc.banner('7.1 VERIFICAÇÃO DA DOCUMENTAÇÃO EXISTENTE NA DATA DA INSPEÇÃO');
  if (documentacao) {
    doc.tabela({
      compacta: true,
      esticavel: true,
      colunas: [0.46, 0.09, 0.1, 0.1, 0.25],
      cabecalho: ['DESCRIÇÃO', 'EXISTE', 'NÃO IDENT.', 'NÃO APLICA', 'OBSERVAÇÃO'],
      linhas: documentacao.itens.map((it, i) => {
        const marca = marcasDocumentacao(it.resposta);
        const base = `documentacao.${i + 1}`;
        return [
          { texto: it.titulo },
          celulaMarca(marca.existe, `${base}.existe`, `${it.titulo} — Existe`),
          celulaMarca(marca.naoIdent, `${base}.nao-ident`, `${it.titulo} — Não identificado`),
          celulaMarca(marca.naoAplica, `${base}.nao-aplica`, `${it.titulo} — Não aplica`),
          { texto: textoOu(it.observacao, ''), valor: true, id: `${base}.obs`, rotuloCampo: `${it.titulo} — observação`, multilinha: true },
        ];
      }),
    });
  }
  doc.blocoAteOFim(
    'documentacao.comentarios',
    'Comentários sobre a documentação',
    'Comentários sobre a documentação',
    18,
    32,
  );
  doc.fecharSecaoElastica();

  // ── 7.1.1 · CHECKLIST, PARTE 1 ───────────────────────────────────────────
  doc.novaFolha();
  doc.abrirSecaoElastica('checklist1');
  doc.banner('7.1.1 CHECKLIST NR-13 — VASO SOB PRESSÃO (PARTE 1)');
  parte1.forEach((secao, i) => tabelaChecklist(doc, secao, `checklist1.${i}`));

  doc.faixa('INSTRUMENTOS E DISPOSITIVOS DE SEGURANÇA INSTALADOS');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.34, 0.13, 0.13, 0.4],
    cabecalho: ['INSTRUMENTO', 'POSSUI', 'CALIBRADO', 'Nº DO CERTIFICADO / VALIDADE'],
    linhas: m.instrumentos.map((inst, i) => [
      { texto: inst.nome, rotulo: true },
      celulaMarca(inst.possui === 'SIM', `instrumentos.${i}.possui`, `${inst.nome} — possui`),
      celulaMarca(inst.calibrado === 'SIM', `instrumentos.${i}.calibrado`, `${inst.nome} — calibrado`),
      {
        texto: textoOu(inst.certificado, ''),
        valor: true,
        id: `instrumentos.${i}.certificado`,
        rotuloCampo: `${inst.nome} — nº do certificado / validade`,
      },
    ]),
  });

  doc.blocoAteOFim('checklist1.observacoes', 'Observações do checklist (parte 1)', 'Observações — checklist (parte 1)', 16, 30);
  doc.fecharSecaoElastica();

  // ── 7.1.2 · CHECKLIST, PARTE 2 ───────────────────────────────────────────
  doc.novaFolha();
  doc.abrirSecaoElastica('checklist2');
  doc.banner('7.1.2 CHECKLIST NR-13 — VASO SOB PRESSÃO (PARTE 2)');
  parte2.forEach((secao, i) => tabelaChecklist(doc, secao, `checklist2.${i}`));

  doc.blocoAteOFim('checklist2.observacoes', 'Observações do checklist (parte 2)', 'Observações do checklist', 16, 30);
  doc.fecharSecaoElastica();
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
  doc.abrirSecaoElastica('exameExterno');
  blocoExame(doc, '7.2 EXAME EXTERNO (INSPEÇÃO VISUAL EXTERNA)', m.visualExterno, 'exameExterno', 'exame externo');
  doc.fecharSecaoElastica();
  if (comFotos) folhaDeFotos(doc, '8.1 REGISTRO FOTOGRÁFICO — EXAME EXTERNO', m.visualExterno.fotos);
}

export function folhasExameInterno(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('exameInterno');
  blocoExame(doc, '7.3 EXAME INTERNO (INSPEÇÃO VISUAL INTERNA)', m.visualInterno, 'exameInterno', 'exame interno');
  doc.fecharSecaoElastica();
  if (comFotos) folhaDeFotos(doc, '8.2 REGISTRO FOTOGRÁFICO — EXAME INTERNO', m.visualInterno.fotos);
}

// ── 17. ULTRASSOM ───────────────────────────────────────────────────────────
/** O número de uma leitura de espessura — aceita "6,32" e "6.32". */
function medidaNumero(v: string | null | undefined): number | null {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A MAIOR e a MENOR leitura de uma região.
 *
 * A comparação é por região, e não pela folha inteira: é dentro do costado, do
 * tampo, que a diferença entre pontos significa desgaste. Só as leituras dos
 * ângulos entram — a coluna MENOR VALOR é derivada delas e repetiria o
 * destaque no lugar errado.
 */
export function extremosDaRegiao(
  linhas: { medidas: string[] }[],
): { maior: number | null; menor: number | null } {
  const valores = linhas.flatMap((l) => l.medidas.map(medidaNumero)).filter((n): n is number => n !== null);
  if (valores.length < 2) return { maior: null, menor: null };
  return { maior: Math.max(...valores), menor: Math.min(...valores) };
}

function destaqueDaMedida(
  valor: string | null | undefined,
  maior: number | null,
  menor: number | null,
): { destaque?: 'maior' | 'menor' } {
  const n = medidaNumero(valor);
  if (n === null) return {};
  if (menor !== null && n === menor) return { destaque: 'menor' };
  if (maior !== null && n === maior) return { destaque: 'maior' };
  return {};
}

export function folhaUltrassom(doc: Documento, m: ModeloRelatorio): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('ultrassom');
  doc.banner('7.4 MEDIÇÃO DE ESPESSURA POR ULTRASSOM');

  // INFORMAÇÕES DO COMPONENTE AVALIADO — a referência abre a folha por aqui, e
  // os três campos já eram coletados pelo formulário de campo: sem esta tabela
  // o documento não dizia em QUE equipamento e em que área o ensaio foi feito.
  doc.faixa('INFORMAÇÕES DO COMPONENTE AVALIADO');
  doc.tabela({
    compacta: true,
    colunas: [0.16, 0.24, 0.14, 0.16, 0.1, 0.2],
    linhas: [
      [
        { texto: 'EQUIPAMENTO', rotulo: true },
        { texto: textoOu(m.ultrassom.equipamento), valor: true, id: 'ultrassom.equipamento', rotuloCampo: 'Equipamento avaliado' },
        { texto: 'Nº DE SÉRIE', rotulo: true },
        { texto: textoOu(m.ultrassom.serie), valor: true, id: 'ultrassom.serie', rotuloCampo: 'Nº de série (ultrassom)' },
        { texto: 'ÁREA', rotulo: true },
        { texto: textoOu(m.ultrassom.area), valor: true, id: 'ultrassom.area', rotuloCampo: 'Área avaliada' },
      ],
      [
        { texto: 'ESPESSURA NOMINAL', rotulo: true },
        { texto: textoOu(m.ultrassom.espessuraNominal), valor: true, id: 'ultrassom.espessura-nominal', rotuloCampo: 'Espessura nominal' },
        { texto: 'MATERIAL', rotulo: true },
        { texto: textoOu(m.ultrassom.material), valor: true, id: 'ultrassom.material', rotuloCampo: 'Material (ultrassom)' },
        { texto: 'DATA', rotulo: true },
        { texto: textoOu(m.ultrassom.data), valor: true, id: 'ultrassom.data', rotuloCampo: 'Data do ensaio' },
      ],
    ],
  });

  doc.faixa('INFORMAÇÕES PARA O ENSAIO');
  doc.tabela({
    compacta: true,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'APARELHO / Nº DE SÉRIE', rotulo: true },
        { texto: textoOu(m.ultrassom.aparelho), valor: true, id: 'ultrassom.aparelho', rotuloCampo: 'Aparelho / nº de série' },
        { texto: 'ACOPLANTE', rotulo: true },
        { texto: textoOu(m.ultrassom.acoplante), valor: true, id: 'ultrassom.acoplante', rotuloCampo: 'Acoplante' },
      ],
      [
        { texto: 'TEMP. DA SUPERFÍCIE (°C)', rotulo: true },
        { texto: textoOu(m.ultrassom.tempSup), valor: true, id: 'ultrassom.temperatura', rotuloCampo: 'Temperatura da superfície' },
        { texto: 'ESTADO DA SUPERFÍCIE', rotulo: true },
        { texto: textoOu(m.ultrassom.estadoSup), valor: true, id: 'ultrassom.estado-superficie', rotuloCampo: 'Estado da superfície' },
      ],
      [
        { texto: 'CABEÇOTE', rotulo: true },
        { texto: textoOu(m.ultrassom.cabecote), valor: true, id: 'ultrassom.cabecote', rotuloCampo: 'Cabeçote' },
        { texto: 'VELOCIDADE SÔNICA', rotulo: true },
        { texto: textoOu(m.ultrassom.velSonica), valor: true, id: 'ultrassom.velocidade', rotuloCampo: 'Velocidade sônica' },
      ],
    ],
  });

  doc.faixa('LOCALIZAÇÃO DOS PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (mm)');
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
      const { maior, menor } = extremosDaRegiao(linhas);
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
        linhas: linhas.map((p) => {
          const pref = idCampo('ultrassom', `${regiao} ${p.ponto}`);
          return [
            { texto: p.ponto },
            // Cada leitura é editável no próprio documento: a grade vem da
            // seção Inspeções, mas corrigir um número na hora da revisão não
            // pode exigir voltar ao formulário de campo.
            ...Array.from({ length: Math.max(angulos.length, 1) }, (_, i) => ({
              texto: textoOu(p.medidas[i]),
              centro: true,
              valor: true,
              id: `${pref}.m${i}`,
              rotuloCampo: `${p.ponto} — ${angulos[i] ? `${angulos[i]}°` : 'medida'}`,
              ...destaqueDaMedida(p.medidas[i], maior, menor),
            })),
            {
              texto: textoOu(p.menor),
              centro: true,
              valor: true,
              id: `${pref}.menor`,
              rotuloCampo: `${p.ponto} — menor valor`,
              ...destaqueDaMedida(p.menor, maior, menor),
            },
            { texto: textoOu(p.requerida), centro: true, valor: true, id: `${pref}.requerida`, rotuloCampo: `${p.ponto} — espessura mínima requerida` },
          ];
        }),
      });
    }
  } else {
    doc.texto('Sem pontos de medição registrados.', { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2 });
  }

  blocoInstrumentoPadrao(doc, m.ultrassom.instrumento, 'ultrassom');

  doc.secao('Observações / conclusões do ensaio');
  doc.texto(textoOu(m.ultrassom.observacoes, ''), {
    cor: COR.valor,
    id: 'ultrassom.observacoes',
    rotuloCampo: 'Observações / conclusões do ensaio',
  });

  doc.tabela({
    compacta: true,
    colunas: [0.3, 0.7],
    linhas: [
      [
        { texto: 'RESULTADO DO ENSAIO', rotulo: true },
        { texto: textoOu(m.ultrassom.resultado), valor: true, id: 'ultrassom.resultado', rotuloCampo: 'Resultado do ensaio' },
      ],
    ],
  });
  doc.fecharSecaoElastica();
}

/**
 * O quadro do instrumento PADRÃO — o mesmo nas folhas de ultrassom e de teste
 * hidrostático, porque é o mesmo quadro na referência: PADRÃO, Nº SÉRIE,
 * Nº CERTIFICADO e VALIDADE numa linha só.
 */
function blocoInstrumentoPadrao(
  doc: Documento,
  inst: { padrao: string | null; serie: string | null; certificado: string | null; validade: string | null },
  prefixo: string,
): void {
  doc.faixa('INSTRUMENTO DE MEDIÇÃO UTILIZADO');
  doc.tabela({
    compacta: true,
    colunas: [0.12, 0.26, 0.1, 0.16, 0.14, 0.22],
    linhas: [
      [
        { texto: 'PADRÃO', rotulo: true },
        { texto: textoOu(inst.padrao), valor: true, id: `${prefixo}.instrumento.padrao`, rotuloCampo: 'Instrumento padrão' },
        { texto: 'Nº SÉRIE', rotulo: true },
        { texto: textoOu(inst.serie), valor: true, id: `${prefixo}.instrumento.serie`, rotuloCampo: 'Nº de série do padrão' },
        { texto: 'Nº CERTIFICADO', rotulo: true },
        { texto: textoOu(inst.certificado), valor: true, id: `${prefixo}.instrumento.certificado`, rotuloCampo: 'Nº do certificado do padrão' },
      ],
      [
        { texto: 'VALIDADE', rotulo: true },
        { texto: textoOu(inst.validade), valor: true, colspan: 5, id: `${prefixo}.instrumento.validade`, rotuloCampo: 'Validade do certificado do padrão' },
      ],
    ],
  });
}

// ── 18 e 19. TESTE HIDROSTÁTICO E SUAS FOTOS ────────────────────────────────
export function folhasTesteHidrostatico(doc: Documento, m: ModeloRelatorio, comFotos = true): void {
  doc.novaFolha();
  doc.abrirSecaoElastica('th');
  doc.banner('7.5 REGISTRO DE TESTE HIDROSTÁTICO');

  doc.faixa('DADOS GERAIS');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.22, 0.28, 0.22, 0.28],
    linhas: [
      [
        { texto: 'CLIENTE', rotulo: true },
        { texto: textoOu(m.th.cliente), valor: true, id: 'th.cliente', rotuloCampo: 'Cliente (TH)' },
        { texto: 'DOC Nº', rotulo: true },
        { texto: textoOu(m.th.docNumero), valor: true, id: 'th.doc-numero', rotuloCampo: 'Documento nº (TH)' },
      ],
      [
        { texto: 'T.A.G.', rotulo: true },
        { texto: textoOu(m.th.tag), valor: true, id: 'th.tag', rotuloCampo: 'T.A.G. (TH)' },
        { texto: 'EQUIPAMENTO', rotulo: true },
        { texto: textoOu(m.th.equipamento), valor: true, id: 'th.equipamento', rotuloCampo: 'Equipamento (TH)' },
      ],
      [
        { texto: 'PRESSÃO DE PROJETO', rotulo: true },
        { texto: textoOu(m.th.pressaoProjeto), valor: true, id: 'th.pressao-projeto', rotuloCampo: 'Pressão de projeto (TH)' },
        { texto: 'PRESSÃO DE TRABALHO', rotulo: true },
        { texto: textoOu(m.th.pressaoTrabalho), valor: true, id: 'th.pressao-trabalho', rotuloCampo: 'Pressão de trabalho (TH)' },
      ],
    ],
  });

  // DADOS DO TESTE — duração, temperatura do fluido, normas, validade do laudo
  // e procedimento estão na referência e o formulário de campo ainda não os
  // coleta (E2E de 05/09/2026). A linha existe e nasce vazia: amarela na
  // prévia, preenchida à mão. Escondê-la seria tirar do laudo o que ele afirma.
  doc.faixa('DADOS DO TESTE');
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.22, 0.28, 0.22, 0.28],
    linhas: [
      [
        { texto: 'FLUIDO DE TESTE', rotulo: true },
        { texto: textoOu(m.th.fluido), valor: true, id: 'th.fluido', rotuloCampo: 'Fluido de teste' },
        { texto: 'PRESSÃO DE TESTE', rotulo: true },
        { texto: textoOu(m.th.pressaoTeste), valor: true, id: 'th.pressao-teste', rotuloCampo: 'Pressão de teste' },
      ],
      [
        { texto: 'DURAÇÃO DO TESTE', rotulo: true },
        { texto: textoOu(m.th.duracao, ''), valor: true, id: 'th.duracao', rotuloCampo: 'Duração do teste' },
        { texto: 'TEMP. DO FLUIDO', rotulo: true },
        { texto: textoOu(m.th.tempFluido, ''), valor: true, id: 'th.temp-fluido', rotuloCampo: 'Temperatura do fluido' },
      ],
      [
        { texto: 'NORMAS DE REFERÊNCIA', rotulo: true },
        { texto: textoOu(m.th.normas, ''), valor: true, id: 'th.normas', rotuloCampo: 'Normas de referência (TH)' },
        { texto: 'VALIDADE DO LAUDO', rotulo: true },
        { texto: textoOu(m.th.validadeLaudo, ''), valor: true, id: 'th.validade-laudo', rotuloCampo: 'Validade do laudo (TH)' },
      ],
      [
        { texto: 'PROCEDIMENTO', rotulo: true },
        { texto: textoOu(m.th.procedimento, ''), colspan: 3, valor: true, id: 'th.procedimento', rotuloCampo: 'Procedimento do teste', multilinha: true },
      ],
      [
        { texto: 'DATA DO TESTE', rotulo: true },
        { texto: textoOu(m.th.dataTeste), valor: true, id: 'th.data', rotuloCampo: 'Data do teste' },
        { texto: 'RESULTADO', rotulo: true },
        { texto: textoOu(m.th.resultado), valor: true, id: 'th.resultado', rotuloCampo: 'Resultado do teste hidrostático' },
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

  blocoInstrumentoPadrao(doc, m.th.instrumento, 'th');

  doc.blocoAteOFim('th.parecer', 'Parecer técnico do teste hidrostático', 'Parecer técnico do teste hidrostático', 18, 34);
  doc.fecharSecaoElastica();

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
  doc.abrirSecaoElastica('parecer');
  doc.banner('9. RECOMENDAÇÕES DE SEGURANÇA');
  doc.tabela({
    compacta: true,
    esticavel: true,
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
    esticavel: true,
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
  // A referência tem TRÊS colunas: exame, PRAZO (o intervalo normativo, em
  // anos) e a data limite. O prazo não tem fonte automática — quem o define é
  // a categoria e o julgamento do engenheiro —, então nasce editável.
  doc.tabela({
    compacta: true,
    esticavel: true,
    colunas: [0.45, 0.25, 0.3],
    cabecalho: ['EXAME', 'PRAZO', 'DATA LIMITE'],
    linhas: [
      [
        { texto: 'EXAME VISUAL EXTERNO' },
        { texto: '', centro: true, valor: true, id: 'proximas.prazo-externa', rotuloCampo: 'Prazo — exame visual externo' },
        { texto: textoOu(m.proximas.externa), centro: true, valor: true, id: 'proximas.externa', rotuloCampo: 'Próxima — exame visual externo' },
      ],
      [
        { texto: 'EXAME VISUAL INTERNO' },
        { texto: '', centro: true, valor: true, id: 'proximas.prazo-interna', rotuloCampo: 'Prazo — exame visual interno' },
        { texto: textoOu(m.proximas.interna), centro: true, valor: true, id: 'proximas.interna', rotuloCampo: 'Próxima — exame visual interno' },
      ],
      [
        { texto: 'TESTE HIDROSTÁTICO' },
        { texto: '', centro: true, valor: true, id: 'proximas.prazo-th', rotuloCampo: 'Prazo — teste hidrostático' },
        { texto: textoOu(m.proximas.th), centro: true, valor: true, id: 'proximas.th', rotuloCampo: 'Próxima — teste hidrostático' },
      ],
    ],
  });
  doc.texto(
    'As datas acima são as registradas na emissão deste relatório e são a mesma fonte que alimenta ' +
      'o controle de vencimentos do sistema.',
    { tamanho: FONTE.nota, cor: COR.nota, espacoAntes: 2, id: 'proximas.nota', rotuloCampo: 'Nota das próximas inspeções' },
  );

  doc.fecharSecaoElastica();
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
export interface SecaoSumario {
  /** O número DA SEÇÃO na referência (7.1, 7.2…), não a posição na lista. */
  numero: string;
  titulo: string;
}

export function secoesDoRelatorio(
  m: ModeloRelatorio,
  tem: Record<SecaoRelatorio, boolean> = TUDO,
): SecaoSumario[] {
  const s: SecaoSumario[] = [];
  const push = (ok: boolean, numero: string, titulo: string) => {
    if (ok) s.push({ numero, titulo });
  };
  // Os números são os da referência. Eles NÃO se renumeram quando uma seção
  // não é emitida: "7.4" é o nome da seção de ultrassom no documento e no
  // vocabulário de quem lê o relatório, e mudá-lo por causa da composição
  // faria a mesma seção ter nomes diferentes em dois relatórios da mesma TAG.
  push(tem.sumario, '1', 'Objetivo');
  push(tem.sumario, '2', 'Documentos de referência');
  push(tem.identificacao, '3', 'Identificação do equipamento');
  push(tem.categorizacao, '4', 'Categorização de risco');
  push(tem.dadosTecnicos, '5', 'Dados técnicos do equipamento (prontuário)');
  push(tem.resumoCalculos, '6', 'Resumo de cálculos da PMTA');
  push(tem.memoria, '6.1', 'Memória de cálculo da PMTA');
  push(tem.dadosInspecao, '7', 'Exames realizados');
  push(tem.checklist, '7.1', 'Verificação da documentação');
  push(tem.checklist, '7.1.1', 'Checklist NR-13 — parte 1');
  push(tem.checklist, '7.1.2', 'Checklist NR-13 — parte 2');
  push(tem.exameExterno, '7.2', 'Exame externo');
  push(tem.exameInterno, '7.3', 'Exame interno');
  push(tem.ultrassom, '7.4', 'Medição de espessura por ultrassom');
  push(tem.th, '7.5', 'Teste hidrostático');
  push(tem.fotosDocumentacao && m.fotosDocumentacao.length > 0, '8', 'Registro fotográfico — documentação');
  push(tem.fotosChecklist && m.fotosChecklist.length > 0, '8.0', 'Registro fotográfico — checklist');
  push(tem.fotosExterno && m.visualExterno.fotos.length > 0, '8.1', 'Registro fotográfico — exame externo');
  push(tem.fotosInterno && m.visualInterno.fotos.length > 0, '8.2', 'Registro fotográfico — exame interno');
  push(tem.fotosTh && m.th.fotos.length > 0, '8.3', 'Registro fotográfico — teste hidrostático');
  push(tem.parecer, '9', 'Recomendações de segurança');
  push(tem.parecer, '10', 'Parecer técnico conclusivo');
  push(tem.parecer, '11', 'Data para a próxima inspeção');
  return s;
}

/** Sem lista de folhas informada, tudo entra — o comportamento do piloto. */
const TUDO: Record<SecaoRelatorio, boolean> = secoesPresentes(undefined);
