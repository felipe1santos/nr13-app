import type { jsPDF } from 'jspdf';
import { FAMILIA } from './carlito';
import { pedacosComSubscrito } from './latexMemorial';
import {
  origemDoValor,
  resolverValor,
  type MapaOverrides,
} from '../overridesRelatorio';
import type { OrigemValor } from '../overridesRelatorio';
import {
  BORDA_FINA,
  CAIXA,
  PT,
  COR,
  CORPO,
  FONTE,
  LIMITE_CORPO,
  alturaLinha,
} from './documentoA4';
import { cabecalho, foto, rodape, type DadosCabecalho } from './primitivas';
import type { FormulaDesenhavel } from './formulaMatematica';

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

  /**
   * Registra uma área clicável do documento.
   *
   * Público porque nem todo campo nasce de uma tabela: a placa de
   * identificação é desenhada à mão e precisa registrar a SUA área — é o que
   * permite trocá-la clicando nela, dentro do documento, em vez de por um
   * botão na barra do topo.
   */
  anotarCampo(
    id: string,
    rotulo: string,
    auto: string,
    valor: string,
    multilinha: boolean,
    caixa: { x: number; y: number; larg: number; alt: number },
    tipo: 'texto' | 'imagem' = 'texto',
  ): void {
    this.campos.push({
      id,
      rotulo,
      tipo,
      auto,
      valor,
      origem: origemDoValor(this.overrides[id]),
      multilinha,
      pagina: this.pagina,
      ...caixa,
    });
  }

  /**
   * Bloco 1 · UMA ÁREA DE IMAGEM do documento (foto de capa, logo, placa).
   *
   * Com imagem: desenha em `contain`, centralizada, sem distorcer — a mesma
   * primitiva das fotos de inspeção.
   *
   * Sem imagem: em `preview`, o retângulo sai com o amarelo-claro e a legenda
   * de convite; no documento FINAL sai apenas o fio cinza da referência
   * (`.foto-capa:not(.tem-img) { border: .4pt solid #cfcfcf }`) — nunca o
   * amarelo, nunca a legenda.
   *
   * A caixa é registrada como campo editável do tipo `imagem`: é assim que a
   * prévia consegue pôr o clique EM CIMA da área, sem botão distante no topo.
   */
  areaImagem(opcoes: {
    id: string;
    rotulo: string;
    dataUrl: string | null;
    proporcao?: number;
    altura: number;
    x?: number;
    largura?: number;
    convite?: string;
  }): void {
    const x = opcoes.x ?? CAIXA.x;
    const largura = opcoes.largura ?? CAIXA.largura;
    this.garantirEspaco(opcoes.altura);
    const y = this.cursor;

    if (opcoes.dataUrl) {
      foto(this.pdf, opcoes.dataUrl, { x, y, largura, altura: opcoes.altura }, opcoes.proporcao);
    } else {
      const vazioNaPrevia = this.modo === 'preview';
      this.pdf.setDrawColor(vazioNaPrevia ? '#c9bd7a' : COR.bordaFoto);
      this.pdf.setLineWidth(vazioNaPrevia ? BORDA_FINA : 0.4 * (25.4 / 72));
      if (vazioNaPrevia) {
        this.pdf.setFillColor(AMARELO_PREVIA);
        this.pdf.rect(x, y, largura, opcoes.altura, 'FD');
        this.pdf.setFont(FAMILIA, 'normal');
        this.pdf.setFontSize(FONTE.nota);
        this.pdf.setTextColor('#8a7a2e');
        this.pdf.text(opcoes.convite ?? 'Clique para adicionar a imagem', x + largura / 2, y + opcoes.altura / 2, {
          align: 'center',
        });
      } else {
        this.pdf.rect(x, y, largura, opcoes.altura);
      }
    }

    this.anotarCampo(
      opcoes.id,
      opcoes.rotulo,
      opcoes.dataUrl ? '(imagem)' : '',
      opcoes.dataUrl ? '(imagem)' : '',
      false,
      { x, y, larg: largura, alt: opcoes.altura },
      'imagem',
    );
    this.cursor = y + opcoes.altura;
  }

  /**
   * Um bloco de texto livre que ocupa o que RESTA da folha.
   *
   * A referência reserva um retângulo grande para observações no pé de várias
   * folhas; imprimir uma linha só deixava um terço de página em branco — foi o
   * que o dono viu na folha de categorização de risco. O bloco tem altura
   * mínima (nunca vira uma tira) e é campo editável como qualquer outro.
   */
  blocoAteOFim(id: string, rotulo: string, titulo?: string, minAltura = 22, maxAltura = 48): void {
    if (titulo) this.secao(titulo);
    const disponivel = LIMITE_CORPO - this.cursor;
    if (disponivel < minAltura) {
      // Não cabe nem o mínimo: o bloco vai para a folha seguinte inteiro, em
      // vez de sair espremido no rodapé.
      this.novaFolha();
      if (titulo) this.secao(titulo);
    }
    // Teto: uma caixa de observações de meia página é tão feia quanto o vazio
    // que ela veio substituir. O espaço que sobra além do teto é distribuído
    // pelas tabelas da folha (`alturaMinima`), não empilhado aqui.
    const altura = Math.min(maxAltura, Math.max(minAltura, LIMITE_CORPO - this.cursor));
    const y = this.cursor;
    const auto = '';
    const valor = this.resolver(id, auto);

    const vazio = valor.trim() === '';
    this.pdf.setDrawColor(COR.bordaTabela);
    this.pdf.setLineWidth(BORDA_FINA);
    if (vazio && this.modo === 'preview') {
      this.pdf.setFillColor(AMARELO_PREVIA);
      this.pdf.rect(CAIXA.x, y, CAIXA.largura, altura, 'FD');
    } else {
      this.pdf.rect(CAIXA.x, y, CAIXA.largura, altura);
    }

    if (!vazio) {
      this.pdf.setFont(FAMILIA, 'normal');
      this.pdf.setFontSize(FONTE.tabela);
      this.pdf.setTextColor(COR.valor);
      const linhas = this.pdf.splitTextToSize(valor, CAIXA.largura - 4) as string[];
      let cy = y + 1.4;
      for (const l of linhas) {
        if (cy + alturaLinha(FONTE.tabela) > y + altura) break;
        this.pdf.text(l, CAIXA.x + 2, cy + alturaLinha(FONTE.tabela) * 0.78);
        cy += alturaLinha(FONTE.tabela);
      }
    }

    this.anotarCampo(id, rotulo, auto, valor, true, { x: CAIXA.x, y, larg: CAIXA.largura, alt: altura });
    this.cursor = y + altura;
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
    cabecalho({ pdf: this.pdf, cabecalho: this.cab }, this.pagina, this.total, this.modo === 'preview');
    rodape({ pdf: this.pdf, cabecalho: this.cab });
    this.cursor = CORPO.y;

    // A área da logo é clicável em TODAS as folhas (Bloco 1.1): o revisor pode
    // estar na folha 9 quando percebe que a logo falta, e obrigá-lo a voltar à
    // capa para corrigir seria esconder a ação onde ele não está. Todas as
    // entradas têm o mesmo id, então abrem o mesmo editor e produzem UM override.
    {
      this.anotarCampo(
        'cabecalho.logo',
        'Logo da empresa',
        this.cab.logo ? '(imagem)' : '',
        this.cab.logo ? '(imagem)' : '',
        false,
        { x: CAIXA.x, y: CAIXA.y, larg: 50, alt: 14 },
        'imagem',
      );
    }
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

  /**
   * Bloco 1.1 · a FÓRMULA desenhada como equação.
   *
   * Numerador em cima, traço no meio, denominador embaixo — tudo em texto e
   * linha VETORIAIS, selecionáveis e nítidos em qualquer zoom. Rasterizar a
   * fórmula como imagem devolveria ao documento o problema que a Fase 11
   * inteira existiu para resolver.
   *
   * A expressão vem pronta de `prepararFormula`, que só reformata o que o motor
   * do memorial gravou. Este método não conhece engenharia: ele desenha.
   */
  /**
   * A largura que um texto ocupa quando os `_{...}` viram subscrito.
   *
   * Medir com `getTextWidth` do texto cru contaria as chaves e o sublinhado, e
   * a fração sairia descentralizada — o traço mais largo que o numerador de um
   * lado e cortando o denominador do outro.
   */
  private larguraComSubscrito(texto: string, tamanho: number): number {
    let largura = 0;
    for (const p of pedacosComSubscrito(texto)) {
      this.pdf.setFontSize(p.subscrito ? tamanho * 0.72 : tamanho);
      largura += this.pdf.getTextWidth(p.texto);
    }
    this.pdf.setFontSize(tamanho);
    return largura;
  }

  /** Escreve o texto com os `_{...}` desenhados como índice de verdade. */
  private textoComSubscrito(texto: string, x: number, linhaBase: number, tamanho: number): number {
    let cx = x;
    for (const p of pedacosComSubscrito(texto)) {
      this.pdf.setFontSize(p.subscrito ? tamanho * 0.72 : tamanho);
      const y = p.subscrito ? linhaBase + tamanho * PT * 0.28 : linhaBase;
      this.pdf.text(p.texto, cx, y);
      cx += this.pdf.getTextWidth(p.texto);
    }
    this.pdf.setFontSize(tamanho);
    return cx - x;
  }

  formula(f: FormulaDesenhavel, opcoes: { tamanho?: number; espacoAntes?: number } = {}): void {
    const tamanho = opcoes.tamanho ?? FONTE.tabela + 0.5;
    const passo = alturaLinha(tamanho);
    const altura = f.numerador ? passo * 2.4 : passo * 1.2;
    this.cursor += opcoes.espacoAntes ?? 1.5;
    this.garantirEspaco(altura);

    this.pdf.setFont(FAMILIA, 'normal');
    this.pdf.setFontSize(tamanho);
    this.pdf.setTextColor(COR.texto);

    const meio = this.cursor + altura / 2;
    let x = CAIXA.x + 4;

    if (f.lhs) {
      this.pdf.setFont(FAMILIA, 'bold');
      const largura = this.textoComSubscrito(f.lhs, x, meio + tamanho * PT * 0.35, tamanho);
      this.pdf.text(' =', x + largura, meio + tamanho * PT * 0.35);
      x += largura + this.pdf.getTextWidth(' =') + 2.5;
      this.pdf.setFont(FAMILIA, 'normal');
    }

    if (f.numerador && f.denominador) {
      const larguraNum = this.larguraComSubscrito(f.numerador, tamanho);
      const larguraDen = this.larguraComSubscrito(f.denominador, tamanho);
      const larguraTraco = Math.max(larguraNum, larguraDen) + 3;
      this.textoComSubscrito(f.numerador, x + (larguraTraco - larguraNum) / 2, meio - passo * 0.35, tamanho);
      this.pdf.setDrawColor(COR.texto);
      this.pdf.setLineWidth(BORDA_FINA);
      this.pdf.line(x, meio, x + larguraTraco, meio);
      this.textoComSubscrito(f.denominador, x + (larguraTraco - larguraDen) / 2, meio + passo * 0.95, tamanho);
    } else if (f.expressao) {
      this.textoComSubscrito(f.expressao, x, meio + tamanho * PT * 0.35, tamanho);
    }

    this.cursor += altura;
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
    /**
     * Piso da altura de cada linha, em mm.
     *
     * Existe para a folha ocupar o papel: a de categorização de risco tem
     * conteúdo fixo e curto, e terminava aos dois terços da página, com um
     * vazio no pé. Esticar as linhas distribui esse espaço pelo conteúdo, em
     * vez de empurrá-lo todo para um retângulo em branco no fim.
     */
    alturaMinima?: number;
  }): void {
    const tamanho = opcoes.compacta ? FONTE.tabelaCompacta : FONTE.tabela;
    const padX = 1.4;
    const padY = opcoes.compacta ? 0.45 : 0.6;
    const larguras = opcoes.colunas.map((f) => f * CAIXA.largura);
    // O cabeçalho QUEBRA em várias linhas quando o título não cabe na coluna.
    // Sem isto, o rótulo era desenhado inteiro a partir do centro da célula e
    // invadia a vizinha: as faixas de P.V. da matriz da NR-13 saíram
    // sobrepostas, ilegíveis, no documento emitido.
    const linhasDoCab = (opcoes.cabecalho ?? []).map((titulo, i) => {
      this.pdf.setFont(FAMILIA, 'bold');
      this.pdf.setFontSize(tamanho);
      return this.pdf.splitTextToSize(titulo, larguras[i] - padX * 2) as string[];
    });
    const maxLinhasCab = linhasDoCab.reduce((n, l) => Math.max(n, l.length), 1);
    const alturaCab = alturaLinha(tamanho) * maxLinhasCab + padY * 2;

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
        const linhas = linhasDoCab[i];
        // Verticalmente centrado: com uma linha só o resultado é o de sempre.
        let y = this.cursor + padY + (alturaCab - padY * 2 - alturaLinha(tamanho) * linhas.length) / 2;
        for (const l of linhas) {
          this.pdf.text(l, x + larguras[i] / 2, y + alturaLinha(tamanho) * 0.78, { align: 'center' });
          y += alturaLinha(tamanho);
        }
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
      let altura = Math.max(alturaLinha(tamanho) + padY * 2, opcoes.alturaMinima ?? 0);
      {
        let i = 0;
        for (const cel of linha) {
          const span = cel.colspan ?? 1;
          const larg = larguras.slice(i, i + span).reduce((a, b) => a + b, 0) - padX * 2;
          // NEGRITO é mais largo. Medir a quebra com a fonte normal e desenhar
          // em negrito fazia o rótulo passar do fim da célula e ser cortado —
          // "PRODUTO P.V. PARA RISCO (MPa ×" saiu assim no documento emitido.
          this.pdf.setFont(FAMILIA, cel.rotulo ? 'bold' : 'normal');
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
  if (!cel.valor || cel.semDestaque) return false;
  const t = (cel.texto ?? '').trim();
  return t === '' || t === '—' || t === '-';
}

export interface CelulaDoc {
  texto: string;
  rotulo?: boolean;
  /**
   * A célula fica vazia SEM virar amarelo na prévia.
   *
   * É o caso das colunas de marcação: numa linha SIM / NÃO / N.A., duas das
   * três estão sempre vazias, e é isso que significa a resposta. Pintá-las de
   * amarelo dizia "falta preencher" em cima de um item já respondido — a
   * prévia inteira ficava amarela justamente onde o inspetor tinha trabalhado.
   */
  semDestaque?: boolean;
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
  /**
   * `texto` abre o editor de texto; `imagem` abre o seletor de arquivo.
   *
   * A área de imagem é o mesmo mecanismo: id semântico, caixa registrada pelo
   * gerador e override por relatório. O que muda é o que o override guarda —
   * o CAMINHO do arquivo no cofre, nunca Base64.
   */
  tipo: 'texto' | 'imagem';
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
