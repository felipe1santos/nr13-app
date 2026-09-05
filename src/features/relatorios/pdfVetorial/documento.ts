import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import {
  origemDoValor,
  resolverValor,
  type MapaOverrides,
} from '../overridesRelatorio';
import type { OrigemValor } from '../overridesRelatorio';
import {
  BORDA_FINA,
  CAIXA,
  COR,
  CORPO,
  FONTE,
  LIMITE_CORPO,
  alturaLinha,
} from './documentoA4';
import { cabecalho, foto, rodape, type DadosCabecalho } from './primitivas';

/**
 * Fase 11 · o motor do documento — quem sabe QUANDO virar a folha.
 *
 * ## O defeito que ele conserta
 *
 * O piloto desenhava com um `y` solto: cada folha era montada à mão e o autor do
 * código garantia, no olho, que o conteúdo cabia. Funciona com 5 folhas de
 * conteúdo conhecido; com 21 folhas e uma tabela de checklist que muda de
 * tamanho conforme a inspeção, não funciona — a tabela simplesmente passa do fim
 * do papel, sem erro nenhum. Era o problema P3 do piloto.
 *
 * Aqui o cursor é do DOCUMENTO. Todo bloco pergunta se cabe antes de desenhar; a
 * tabela quebra POR LINHA e repete o cabeçalho na folha seguinte, que é o que
 * uma tabela impressa precisa fazer para continuar legível.
 *
 * ## Duas passagens, e o motivo
 *
 * "Página X de Y" exige saber o total antes de escrever a primeira folha. O
 * `putTotalPages` do jsPDF faz substituição de texto no fluxo da página — e não
 * é confiável com fonte CID embutida, que é justamente o nosso caso. Então o
 * documento é gerado DUAS VEZES: a primeira só para contar, a segunda para
 * valer. Custa ~70 ms e não tem armadilha.
 */
export class Documento {
  readonly pdf: jsPDF;
  private readonly cab: DadosCabecalho;
  private readonly total: number;
  private pagina = 0;
  private cursor = 0;

  /**
   * 13D · o MODO do documento.
   *
   * `preview` é o mesmo desenho do `final` — mesmo layout, mesmos dados, mesma
   * paginação — com UMA diferença: célula de valor sem dado sai com fundo
   * amarelo-claro, para o revisor ver o que falta.
   *
   * O amarelo é derivado do conteúdo, nunca gravado, e não existe no `final`.
   * É a mesma regra da 12B, agora dentro do gerador em vez de dentro do iframe.
   */
  private readonly modo: ModoDocumento;

  /**
   * 13D-bis · os overrides DESTE relatório.
   *
   * O gerador resolve o valor na hora de desenhar — automático, manual ou
   * deliberadamente vazio —, então prévia e PDF final saem do MESMO caminho.
   * Um resolvedor à parte, aplicado só na prévia, deixaria o documento emitido
   * diferente do que foi aprovado, que é exatamente o que esta fase evita.
   */
  private readonly overrides: MapaOverrides;
  /** As caixas dos campos editáveis desenhados — a prévia constrói a UI com elas. */
  private readonly campos: CampoEditavel[] = [];

  constructor(
    pdf: jsPDF,
    cab: DadosCabecalho,
    total: number,
    modo: ModoDocumento = 'final',
    overrides: MapaOverrides = {},
  ) {
    this.pdf = pdf;
    this.cab = cab;
    this.total = total;
    this.modo = modo;
    this.overrides = overrides;
  }

  /** Os campos editáveis desta geração, na ordem em que foram desenhados. */
  get editaveis(): CampoEditavel[] {
    return this.campos;
  }

  /**
   * Para quem desenha FORA de `tabela`/`texto` — hoje a placa reconstruída,
   * amanhã qualquer bloco novo do gate das 21 folhas: resolve o override e
   * registra a caixa clicável, sem precisar virar tabela para ser editável.
   */
  campoLivre(
    id: string,
    rotulo: string,
    auto: string,
    caixa: { x: number; y: number; larg: number; alt: number },
  ): string {
    const valor = this.resolver(id, auto);
    this.anotarCampo(id, rotulo, auto, valor, false, caixa);
    return valor;
  }

  /** O texto que a célula/parágrafo deve mostrar, já com o override aplicado. */
  private resolver(id: string | undefined, auto: string): string {
    if (!id) return auto;
    return resolverValor(auto, this.overrides[id]) ?? '';
  }

  private anotarCampo(
    id: string,
    rotulo: string,
    auto: string,
    valor: string,
    multilinha: boolean,
    caixa: { x: number; y: number; larg: number; alt: number },
  ): void {
    this.campos.push({
      id,
      rotulo,
      auto,
      valor,
      origem: origemDoValor(this.overrides[id]),
      multilinha,
      pagina: this.pagina,
      ...caixa,
    });
  }

  get paginaAtual(): number {
    return this.pagina;
  }

  get y(): number {
    return this.cursor;
  }

  set y(v: number) {
    this.cursor = v;
  }

  private fundoDaCelula(cel: CelulaDoc): string {
    return corDeFundo(cel, this.modo);
  }

  /** Abre uma folha nova, com cabeçalho e rodapé, e devolve o cursor ao topo. */
  novaFolha(): void {
    if (this.pagina > 0) this.pdf.addPage();
    this.pagina++;
    cabecalho({ pdf: this.pdf, cabecalho: this.cab }, this.pagina, this.total);
    rodape({ pdf: this.pdf, cabecalho: this.cab });
    this.cursor = CORPO.y;
  }

  /** Quanto ainda cabe nesta folha. */
  get espacoRestante(): number {
    return LIMITE_CORPO - this.cursor;
  }

  /**
   * Garante espaço para um bloco. Vira a folha se não couber.
   *
   * Devolve `true` quando virou — quem desenha tabela usa isso para repetir o
   * cabeçalho dela.
   */
  garantirEspaco(altura: number): boolean {
    if (this.cursor + altura <= LIMITE_CORPO) return false;
    this.novaFolha();
    return true;
  }

  // ── Blocos ────────────────────────────────────────────────────────────────

  texto(
    conteudoAuto: string,
    opcoes: {
      tamanho?: number;
      negrito?: boolean;
      italico?: boolean;
      cor?: string;
      alinhamento?: 'left' | 'center' | 'right';
      x?: number;
      largura?: number;
      espacoAntes?: number;
      /** 13D-bis · torna o parágrafo editável, com este identificador. */
      id?: string;
      rotuloCampo?: string;
    } = {},
  ): void {
    // O parágrafo editável mostra o override; sem override, o texto de origem.
    // Um bloco resolvido para vazio ainda ocupa a caixa mínima de uma linha —
    // sem isso o campo apagado ficaria sem área clicável para ser desfeito.
    const conteudo = this.resolver(opcoes.id, conteudoAuto);
    const inicioY = this.cursor + (opcoes.espacoAntes ?? 0);
    const paginaInicio = this.pagina;
    const tamanho = opcoes.tamanho ?? FONTE.base;
    const largura = opcoes.largura ?? CAIXA.largura;
    const estilo = opcoes.negrito
      ? opcoes.italico
        ? 'bolditalic'
        : 'bold'
      : opcoes.italico
        ? 'italic'
        : 'normal';

    this.pdf.setFont(FAMILIA, estilo);
    this.pdf.setFontSize(tamanho);
    const linhas = this.pdf.splitTextToSize(conteudo, largura) as string[];
    const passo = alturaLinha(tamanho);

    this.cursor += opcoes.espacoAntes ?? 0;
    this.pdf.setTextColor(opcoes.cor ?? COR.texto);

    // Quebra o PARÁGRAFO entre folhas, linha a linha: um texto longo de
    // observações não pode sumir por não caber inteiro.
    for (const linha of linhas) {
      this.garantirEspaco(passo);
      const x =
        opcoes.alinhamento === 'center'
          ? (opcoes.x ?? CAIXA.x) + largura / 2
          : opcoes.alinhamento === 'right'
            ? (opcoes.x ?? CAIXA.x) + largura
            : (opcoes.x ?? CAIXA.x);
      this.pdf.text(linha, x, this.cursor + passo * 0.78, { align: opcoes.alinhamento ?? 'left' });
      this.cursor += passo;
      // `setTextColor`/`setFont` sobrevivem à troca de página, mas o cursor não.
      this.pdf.setFont(FAMILIA, estilo);
      this.pdf.setFontSize(tamanho);
      this.pdf.setTextColor(opcoes.cor ?? COR.texto);
    }

    if (opcoes.id) {
      // Um parágrafo que atravessou a folha tem duas caixas possíveis; a que
      // vale é a da folha onde ele COMEÇOU — é onde o revisor clicou.
      const alturaBloco =
        this.pagina === paginaInicio ? Math.max(passo, this.cursor - inicioY) : LIMITE_CORPO - inicioY;
      this.anotarCampo(
        opcoes.id,
        opcoes.rotuloCampo ?? opcoes.id,
        conteudoAuto,
        conteudo,
        true,
        { x: opcoes.x ?? CAIXA.x, y: inicioY, larg: largura, alt: alturaBloco },
      );
      // A página do registro é a do início do parágrafo.
      this.campos[this.campos.length - 1].pagina = paginaInicio;
    }
  }

  banner(conteudo: string): void {
    const altura = alturaLinha(FONTE.banner) + 1.4;
    this.garantirEspaco(altura + 6); // banner órfão no pé da folha é ruído
    // `margin: 3mm 0 1.2mm` na referência. O respiro DE CIMA estava faltando, e
    // é ele que separa o banner da seção anterior — sem ele os blocos colavam.
    // No topo da folha não se aplica: lá quem manda é a margem do papel.
    if (this.cursor > CORPO.y) this.cursor += 3;
    this.pdf.setFillColor(COR.fundoCabecalhoTabela);
    this.pdf.setDrawColor(COR.texto);
    this.pdf.setLineWidth(BORDA_FINA);
    this.pdf.rect(CAIXA.x, this.cursor, CAIXA.largura, altura, 'FD');
    this.pdf.setFont(FAMILIA, 'bold');
    this.pdf.setFontSize(FONTE.banner);
    this.pdf.setTextColor(COR.texto);
    this.pdf.text(conteudo, CAIXA.x + CAIXA.largura / 2, this.cursor + altura * 0.72, { align: 'center' });
    this.cursor += altura + 1.2;
  }

  faixa(conteudo: string): void {
    const altura = alturaLinha(FONTE.faixa) + 1.4;
    this.garantirEspaco(altura + 8);
    // `margin: 2.4mm 0 0` na referência. Estava a cargo do chamador (`doc.y +=
    // 2.4`), e só 2 dos 27 pontos faziam — o resto saía colado. Margem é
    // atributo do elemento, não tarefa de quem o usa.
    if (this.cursor > CORPO.y) this.cursor += 2.4;
    this.pdf.setFillColor(COR.fundoRotulo);
    this.pdf.setDrawColor(COR.bordaTabela);
    this.pdf.setLineWidth(BORDA_FINA);
    this.pdf.rect(CAIXA.x, this.cursor, CAIXA.largura, altura, 'FD');
    this.pdf.setFont(FAMILIA, 'bold');
    this.pdf.setFontSize(FONTE.faixa);
    this.pdf.setTextColor(COR.texto);
    this.pdf.text(conteudo, CAIXA.x + 2, this.cursor + altura * 0.74);
    this.cursor += altura;
  }

  secao(conteudo: string): void {
    this.texto(conteudo, { tamanho: FONTE.secao, negrito: true, espacoAntes: 3.4 });
  }

  /**
   * Tabela que QUEBRA entre folhas, repetindo o cabeçalho.
   *
   * Mede cada linha antes de desenhar (a altura é a da célula mais alta) e,
   * quando a próxima não cabe, vira a folha e redesenha o cabeçalho — sem
   * isso, a continuação vira um bloco de números sem título.
   */
  tabela(opcoes: {
    colunas: number[];
    cabecalho?: string[];
    linhas: CelulaDoc[][];
    compacta?: boolean;
  }): void {
    const tamanho = opcoes.compacta ? FONTE.tabelaCompacta : FONTE.tabela;
    const padX = 1.4;
    const padY = opcoes.compacta ? 0.45 : 0.6;
    const larguras = opcoes.colunas.map((f) => f * CAIXA.largura);
    const alturaCab = alturaLinha(tamanho) + padY * 2;

    const desenharCabecalho = () => {
      if (!opcoes.cabecalho) return;
      let x = CAIXA.x;
      this.pdf.setLineWidth(BORDA_FINA);
      this.pdf.setDrawColor(COR.bordaTabela);
      for (let i = 0; i < opcoes.cabecalho.length; i++) {
        this.pdf.setFillColor(COR.fundoCabecalhoTabela);
        this.pdf.rect(x, this.cursor, larguras[i], alturaCab, 'FD');
        this.pdf.setFont(FAMILIA, 'bold');
        this.pdf.setFontSize(tamanho);
        this.pdf.setTextColor(COR.texto);
        this.pdf.text(opcoes.cabecalho[i], x + larguras[i] / 2, this.cursor + alturaCab * 0.72, {
          align: 'center',
        });
        x += larguras[i];
      }
      this.cursor += alturaCab;
    };

    this.garantirEspaco(alturaCab + alturaLinha(tamanho) * 2);
    desenharCabecalho();

    // 13D-bis: o override é resolvido ANTES da medição. Medir o automático e
    // desenhar o manual daria altura de linha errada — o texto mais longo
    // estouraria a célula que foi medida pelo mais curto.
    for (const linhaAuto of opcoes.linhas) {
      const linha = linhaAuto.map((cel) =>
        cel.id ? { ...cel, texto: this.resolver(cel.id, cel.texto) } : cel,
      );
      // Mede.
      let altura = alturaLinha(tamanho) + padY * 2;
      {
        let i = 0;
        for (const cel of linha) {
          const span = cel.colspan ?? 1;
          const larg = larguras.slice(i, i + span).reduce((a, b) => a + b, 0) - padX * 2;
          this.pdf.setFont(FAMILIA, 'normal');
          this.pdf.setFontSize(tamanho);
          const n = (this.pdf.splitTextToSize(cel.texto, larg) as string[]).length;
          altura = Math.max(altura, alturaLinha(tamanho) * Math.max(1, n) + padY * 2);
          i += span;
        }
      }

      if (this.garantirEspaco(altura)) desenharCabecalho();

      let x = CAIXA.x;
      let i = 0;
      for (let k = 0; k < linha.length; k++) {
        const cel = linha[k];
        const span = cel.colspan ?? 1;
        const larg = larguras.slice(i, i + span).reduce((a, b) => a + b, 0);
        if (cel.id) {
          this.anotarCampo(
            cel.id,
            cel.rotuloCampo ?? linhaAuto[k]?.rotuloCampo ?? cel.id,
            linhaAuto[k]?.texto ?? cel.texto,
            cel.texto,
            !!cel.multilinha,
            { x, y: this.cursor, larg, alt: altura },
          );
        }
        this.pdf.setLineWidth(BORDA_FINA);
        this.pdf.setDrawColor(COR.bordaTabela);
        this.pdf.setFillColor(this.fundoDaCelula(cel));
        this.pdf.rect(x, this.cursor, larg, altura, 'FD');

        this.pdf.setFont(FAMILIA, cel.rotulo ? 'bold' : 'normal');
        this.pdf.setFontSize(tamanho);
        this.pdf.setTextColor(cel.valor ? COR.valor : COR.texto);
        const linhasCel = this.pdf.splitTextToSize(cel.texto, larg - padX * 2) as string[];
        let yc = this.cursor + padY;
        for (const l of linhasCel) {
          this.pdf.text(l, cel.centro ? x + larg / 2 : x + padX, yc + alturaLinha(tamanho) * 0.78, {
            align: cel.centro ? 'center' : 'left',
          });
          yc += alturaLinha(tamanho);
        }
        x += larg;
        i += span;
      }
      this.cursor += altura;
    }
  }

  /**
   * Grade de fotos: 4 por folha (§5), e a QUINTA abre folha nova.
   *
   * `aoAbrirFolha` deixa o chamador redesenhar o banner da seção na folha nova —
   * uma folha de registro fotográfico sem título não diz de que exame é.
   */
  fotos(itens: FotoDoc[], aoAbrirFolha?: () => void): void {
    const POR_FOLHA = 4;
    const col = (CAIXA.largura - 4) / 2;
    const altQuadro = 74;
    const altLegenda = 5;
    const altBloco = altQuadro + altLegenda + 4;

    for (let i = 0; i < itens.length; i++) {
      const posicao = i % POR_FOLHA;
      if (posicao === 0 && i > 0) {
        this.novaFolha();
        aoAbrirFolha?.();
      }
      const linha = Math.floor(posicao / 2);
      const coluna = posicao % 2;
      if (coluna === 0 && linha > 0) {
        // nada: a segunda fileira usa o mesmo bloco de origem
      }
      const base = this.cursor;
      const x = CAIXA.x + coluna * (col + 4);
      const y = base + linha * altBloco;
      foto(this.pdf, itens[i].dataUrl, { x, y, largura: col, altura: altQuadro }, itens[i].proporcao);
      this.pdf.setFont(FAMILIA, 'normal');
      this.pdf.setFontSize(FONTE.mini);
      this.pdf.setTextColor(COR.texto);
      const legenda = (this.pdf.splitTextToSize(itens[i].descricao || '', col) as string[])[0] ?? '';
      this.pdf.text(legenda, x + col / 2, y + altQuadro + 3.4, { align: 'center' });

      // Depois da última foto da folha, o cursor desce o bloco inteiro.
      if (posicao === POR_FOLHA - 1 || i === itens.length - 1) {
        const fileiras = Math.floor(posicao / 2) + 1;
        this.cursor = base + fileiras * altBloco;
      }
    }
  }
}

/** O amarelo-claro da referência, para campo vazio na PRÉVIA. */
export const AMARELO_PREVIA = '#FFF8C4';

export type ModoDocumento = 'preview' | 'final';

/**
 * A cor de fundo de uma célula.
 *
 * Rótulo tem o cinza da referência; valor tem branco — e, **só em `preview`**,
 * valor AUSENTE tem o amarelo. Documento final nunca passa pelo ramo do
 * amarelo, e é isso que o gate `edicao13d.test.ts` exige: o realce é da
 * revisão, não do documento assinado.
 *
 * É função pura, e não um método privado, porque essa é a regra que o dono
 * escreveu em duas frases ("amarelo na prévia" / "sem amarelo no arquivado") —
 * regra dessas precisa de um teste que a leia direto, sem instanciar jsPDF.
 */
export function corDeFundo(cel: CelulaDoc, modo: ModoDocumento): string {
  if (cel.rotulo) return COR.fundoRotulo;
  if (modo === 'preview' && celulaVazia(cel)) return AMARELO_PREVIA;
  return '#ffffff';
}

/** Uma célula "de valor" está vazia quando o modelo não tinha o dado. */
export function celulaVazia(cel: CelulaDoc): boolean {
  if (!cel.valor) return false;
  const t = (cel.texto ?? '').trim();
  return t === '' || t === '—' || t === '-';
}

export interface CelulaDoc {
  texto: string;
  rotulo?: boolean;
  centro?: boolean;
  colspan?: number;
  valor?: boolean;
  /**
   * 13D-bis · o identificador SEMÂNTICO do campo, quando ele é editável.
   *
   * Estável por significado (`equipamento.fabricante`), nunca por posição: a
   * paginação muda quando um checklist cresce, e um id derivado de página ou
   * de índice apontaria para outro campo depois disso.
   */
  id?: string;
  /** Como o campo se chama no editor. Sem isto o popover abre sem título. */
  rotuloCampo?: string;
  /** Editor de texto longo (observações, conclusões) em vez de uma linha. */
  multilinha?: boolean;
}

/**
 * Um campo editável, do jeito que a interface precisa dele.
 *
 * A caixa (`x`,`y`,`larg`,`alt`, em mm) é registrada pelo GERADOR no momento em
 * que desenha — é o único lugar que sabe onde o texto caiu. A camada React usa
 * isso para pôr a área clicável exatamente sobre o texto, sem tocar no PDF
 * pronto: nada de reabrir o arquivo para adivinhar qual texto é qual.
 */
export interface CampoEditavel {
  id: string;
  rotulo: string;
  /** O que a fonte automática diz (antes do override). */
  auto: string;
  /** O que o documento está mostrando agora. */
  valor: string;
  origem: OrigemValor;
  multilinha: boolean;
  pagina: number;
  x: number;
  y: number;
  larg: number;
  alt: number;
}

export interface FotoDoc {
  dataUrl: string;
  descricao: string;
  /** largura/altura reais da imagem. Sem isto o desenho assumiria 4:3. */
  proporcao?: number;
}
