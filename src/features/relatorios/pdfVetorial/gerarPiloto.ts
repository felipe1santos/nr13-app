import { jsPDF } from 'jspdf';
import { registrarCarlito } from './carlito';
import { CAIXA, COR, CORPO, FONTE, LIMITE_CORPO } from './documentoA4';
import {
  banner,
  cabeNaFolha,
  faixa,
  foto,
  novaFolha,
  tabela,
  texto,
  type Contexto,
} from './primitivas';
import {
  FOTOS_POR_FOLHA,
  folhasDeFotos,
  montarModelo,
  textoOu,
  type ModeloDocumento,
} from './ponteDados';

/**
 * Fase 11 · PILOTO — cinco folhas representativas, geradas em VETOR.
 *
 * Não é o relatório inteiro, e não deve ser: portar 21 folhas antes de provar o
 * motor é descobrir no fim que a fonte não embarca, que a tabela não fecha ou
 * que o PDF ficou maior que o raster. As cinco escolhidas cobrem tudo o que o
 * documento sabe fazer:
 *
 *   1. CAPA .................. título, foto grande, dados do cliente
 *   2. IDENTIFICAÇÃO ......... tabelas de rótulo/valor e a de pressões
 *   3. EXAME EXTERNO ......... lista de itens com resposta + texto corrido
 *   4. FOTOS ................. grade 2×2, e a 5ª foto abrindo folha nova
 *   5. PARECER ............... laudo, próximas inspeções e assinaturas
 *
 * O que NÃO muda por causa dele: o gerador raster continua sendo o de produção
 * (`pdfService.ts`), e nenhum relatório histórico é regenerado (§7-quater).
 */

export interface ResultadoPiloto {
  bytes: Uint8Array;
  paginas: number;
  /** Milissegundos da geração — para comparar com o raster. */
  ms: number;
}

/** As folhas do piloto, em ordem. A contagem de fotos decide o total. */
export function totalDePaginas(m: ModeloDocumento): number {
  return 4 + folhasDeFotos(m.fotos.length);
}

export async function gerarPdfPiloto(tag: string): Promise<ResultadoPiloto> {
  const inicio = performance.now();
  const m = montarModelo(tag);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  // A fonte precisa estar registrada ANTES do primeiro texto: sem ela o jsPDF
  // cai em Helvetica e a métrica deixa de ser a que o layout foi desenhado.
  await registrarCarlito(pdf);

  const ctx: Contexto = {
    pdf,
    cabecalho: {
      logo: m.empresa.logo,
      numeroRelatorio: m.numeroRelatorio,
      rodape: [m.empresa.razao, m.empresa.endereco, m.empresa.contato],
    },
  };

  const total = totalDePaginas(m);
  let pagina = 1;

  // ── 1. CAPA ───────────────────────────────────────────────────────────────
  let y = novaFolha(ctx, pagina, total, true);
  y = texto(pdf, 'Relatório de Inspeção de Segurança', CAIXA.x + CAIXA.largura / 2, y + 4, {
    tamanho: FONTE.tituloDoc,
    negrito: true,
    alinhamento: 'center',
  });
  y = texto(pdf, 'Vaso de Pressão · NR-13', CAIXA.x + CAIXA.largura / 2, y, {
    tamanho: FONTE.subtituloDoc,
    negrito: true,
    alinhamento: 'center',
  });
  y = texto(pdf, textoOu(m.tipoInspecao, 'Inspeção'), CAIXA.x + CAIXA.largura / 2, y + 1, {
    tamanho: FONTE.sigla,
    cor: '#6a6a6a',
    alinhamento: 'center',
  });

  y += 3;
  y = tabela(pdf, {
    y,
    colunas: [0.3, 0.7],
    linhas: [
      [{ texto: 'CONTRATANTE', rotulo: true }, { texto: textoOu(m.cliente), valor: true }],
      [{ texto: 'EQUIPAMENTO / T.A.G.', rotulo: true }, { texto: m.tag, valor: true }],
      [{ texto: 'Nº DO RELATÓRIO', rotulo: true }, { texto: textoOu(m.numeroRelatorio), valor: true }],
      [{ texto: 'DATA DE EMISSÃO', rotulo: true }, { texto: textoOu(m.emissao), valor: true }],
    ],
  });

  if (m.fotoCapa) {
    y += 4;
    foto(pdf, m.fotoCapa, { x: CAIXA.x, y, largura: CAIXA.largura, altura: 92 });
  }

  // ── 2. IDENTIFICAÇÃO ──────────────────────────────────────────────────────
  pagina++;
  y = novaFolha(ctx, pagina, total);
  y = banner(pdf, '3. IDENTIFICAÇÃO DO EQUIPAMENTO — PLACA', y);

  const campos = Object.entries(m.equipamento);
  const linhasEquip = [];
  for (let i = 0; i < campos.length; i += 2) {
    const [r1, v1] = campos[i];
    const par = campos[i + 1];
    linhasEquip.push([
      { texto: r1, rotulo: true },
      { texto: textoOu(v1), valor: true },
      { texto: par ? par[0] : '', rotulo: !!par },
      { texto: par ? textoOu(par[1]) : '', valor: true },
    ]);
  }
  y = tabela(pdf, { y, colunas: [0.22, 0.28, 0.22, 0.28], linhas: linhasEquip });

  y += 2.4;
  y = faixa(pdf, 'PRESSÕES', y);
  y = tabela(pdf, {
    y,
    colunas: [0.4, 0.2, 0.2, 0.2],
    cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar'],
    linhas: m.pressoes.map((p) => [
      { texto: p.rotulo, rotulo: true },
      { texto: textoOu(p.mpa), centro: true, valor: true },
      { texto: textoOu(p.kgf), centro: true, valor: true },
      { texto: textoOu(p.bar), centro: true, valor: true },
    ]),
  });

  y += 2.4;
  y = faixa(pdf, 'DATAS', y);
  y = tabela(pdf, {
    y,
    colunas: [0.25, 0.25, 0.25, 0.25],
    linhas: [
      [
        { texto: 'EXECUÇÃO DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.datas.execucao), valor: true },
        { texto: 'VALIDADE DA INSPEÇÃO', rotulo: true },
        { texto: textoOu(m.datas.validade), valor: true },
      ],
    ],
  });

  // ── 3. EXAME EXTERNO ──────────────────────────────────────────────────────
  pagina++;
  y = novaFolha(ctx, pagina, total);
  y = banner(pdf, '7.2 EXAME EXTERNO (INSPEÇÃO VISUAL EXTERNA)', y);

  const itens = m.exameExterno.itens;
  if (itens.length > 0) {
    y = tabela(pdf, {
      y,
      compacta: true,
      colunas: [0.08, 0.72, 0.2],
      cabecalho: ['ITEM', 'VERIFICAÇÃO', 'RESULTADO'],
      linhas: itens.map((it, i) => [
        { texto: String(i + 1), centro: true },
        { texto: it.titulo },
        { texto: it.resposta, centro: true, valor: true },
      ]),
    });
  } else {
    y = texto(pdf, 'Sem itens de exame externo registrados nesta inspeção.', CAIXA.x, y + 2, {
      tamanho: FONTE.nota,
      cor: COR.nota,
    });
  }

  y += 3.4;
  y = texto(pdf, 'Observações gerais', CAIXA.x, y, { tamanho: FONTE.secao, negrito: true });
  y = texto(pdf, textoOu(m.exameExterno.observacoes, 'Sem observações.'), CAIXA.x, y, {
    larguraMax: CAIXA.largura,
    cor: COR.valor,
  });

  y += 3.4;
  y = texto(pdf, 'Conclusão técnica — exame externo', CAIXA.x, y, { tamanho: FONTE.secao, negrito: true });
  y = texto(pdf, textoOu(m.exameExterno.resultado), CAIXA.x, y, { cor: COR.valor });

  // ── 4. FOTOS (4 por folha; a 5ª abre folha nova) ──────────────────────────
  const folhasFoto = folhasDeFotos(m.fotos.length);
  for (let f = 0; f < folhasFoto; f++) {
    pagina++;
    y = novaFolha(ctx, pagina, total);
    y = banner(pdf, '8.1 REGISTRO FOTOGRÁFICO — EXAME EXTERNO', y);
    y += 1;

    const doBloco = m.fotos.slice(f * FOTOS_POR_FOLHA, (f + 1) * FOTOS_POR_FOLHA);
    const col = (CAIXA.largura - 4) / 2;
    const altQuadro = 74;
    const altLegenda = 5;
    for (let i = 0; i < FOTOS_POR_FOLHA; i++) {
      const linha = Math.floor(i / 2);
      const coluna = i % 2;
      const x = CAIXA.x + coluna * (col + 4);
      const yq = y + linha * (altQuadro + altLegenda + 4);
      const item = doBloco[i];
      if (!item) continue;
      foto(pdf, item.dataUrl, { x, y: yq, largura: col, altura: altQuadro });
      texto(pdf, textoOu(item.descricao, ''), x + col / 2, yq + altQuadro + 1, {
        tamanho: FONTE.mini,
        alinhamento: 'center',
        larguraMax: col,
      });
    }
    if (doBloco.length === 0) {
      texto(pdf, 'Sem registro fotográfico do exame externo.', CAIXA.x, y + 2, {
        tamanho: FONTE.nota,
        cor: COR.nota,
      });
    }
  }

  // ── 5. PARECER E ASSINATURAS ──────────────────────────────────────────────
  pagina++;
  y = novaFolha(ctx, pagina, total);
  y = banner(pdf, '10. PARECER TÉCNICO CONCLUSIVO', y);
  y = tabela(pdf, {
    y,
    compacta: true,
    colunas: [0.7, 0.3],
    linhas: [
      [
        { texto: 'O equipamento está apto a operar nas condições de segurança da NR-13?', rotulo: true },
        {
          texto: m.laudo.apto === null ? '—' : m.laudo.apto ? 'APTO' : 'INAPTO',
          centro: true,
          valor: true,
        },
      ],
    ],
  });

  y += 3;
  y = banner(pdf, '11. DATA PARA A PRÓXIMA INSPEÇÃO', y);
  y = tabela(pdf, {
    y,
    compacta: true,
    colunas: [0.6, 0.4],
    cabecalho: ['EXAME', 'DATA LIMITE'],
    linhas: [
      [{ texto: 'EXAME VISUAL EXTERNO' }, { texto: textoOu(m.proximas.externa), centro: true, valor: true }],
      [{ texto: 'EXAME VISUAL INTERNO' }, { texto: textoOu(m.proximas.interna), centro: true, valor: true }],
    ],
  });

  // Assinaturas coladas ao pé do corpo, como no carimbo de hoje: elas fecham o
  // documento, não flutuam no meio da folha.
  const alturaBloco = 16 + 3 + 3 * 4;
  const yAssin = Math.max(y + 8, LIMITE_CORPO - alturaBloco);
  const larguraQuadro = (CAIXA.largura - 8) / 2;
  m.assinantes.slice(0, 2).forEach((a, i) => {
    const x = CAIXA.x + i * (larguraQuadro + 8);
    if (a.rubrica) {
      try {
        const formato = a.rubrica.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(a.rubrica, formato, x + larguraQuadro / 2 - 20, yAssin, 40, 16, undefined, 'FAST');
      } catch {
        // Rubrica ilegível não impede o documento de sair assinado por nome.
      }
    }
    const yLinha = yAssin + 16;
    pdf.setDrawColor(COR.texto);
    pdf.setLineWidth(0.6 * (25.4 / 72));
    pdf.line(x, yLinha, x + larguraQuadro, yLinha);
    let yt = yLinha + 1;
    yt = texto(pdf, a.nome, x + larguraQuadro / 2, yt, { negrito: true, alinhamento: 'center' });
    yt = texto(pdf, a.funcao, x + larguraQuadro / 2, yt, { tamanho: FONTE.mini, alinhamento: 'center' });
    texto(pdf, a.registro ? `CREA: ${a.registro}` : '', x + larguraQuadro / 2, yt, {
      tamanho: FONTE.mini,
      alinhamento: 'center',
    });
  });

  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  return { bytes, paginas: pdf.getNumberOfPages(), ms: Math.round(performance.now() - inicio) };
}

/** Só para o gate: as folhas que o piloto produz, na ordem. */
export const FOLHAS_DO_PILOTO = [
  'CAPA',
  'IDENTIFICAÇÃO',
  'EXAME EXTERNO',
  'FOTOS (4 por folha)',
  'PARECER E ASSINATURAS',
] as const;

/** `cabeNaFolha` reexportado: o gate confere estouro sem importar primitivas. */
export { cabeNaFolha, CORPO };
