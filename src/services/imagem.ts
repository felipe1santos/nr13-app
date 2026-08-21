/** Largura padrão da foto principal. Ver `MINIATURA_*` para a variante de lista. */
export const PRINCIPAL_LARGURA = 1200;
/**
 * Teto de ALTURA da foto principal (Fase 5).
 *
 * Até 20/08/2026 só a largura limitava, então um retrato 3:4 era guardado em
 * 1200×1600 (1,92 Mpx contra 1,08 Mpx da paisagem) e um retrato 9:16 chegava a
 * **1200×2133**. Medido na conta de teste: paisagem 98–105 KB, retrato
 * 142–150 KB — 1,42× pelo mesmo motivo.
 *
 * 1600 é escolhido para **não mexer no caso comum**: para 4:3 e 3:4 o fator de
 * largura já é o mais restritivo, então a foto sai byte a byte igual à de
 * antes. Ele só age no retrato "alto" (9:16), onde corta 32,4 % — medido:
 * 1200×2133 / 195,2 KB → 900×1600 / 132,0 KB.
 */
export const PRINCIPAL_ALTURA = 1600;
export const PRINCIPAL_QUALIDADE = 0.7;

/** Miniatura de lista/card (Fase 5). 400 px / q0,6 = 16,1 KB medidos, −85,6 %. */
export const MINIATURA_LARGURA = 400;
/** Teto proporcional (4:3) para o retrato não virar uma tira alta. */
export const MINIATURA_ALTURA = 533;
export const MINIATURA_QUALIDADE = 0.6;

/**
 * Dimensão de saída, escalando pelo fator MAIS RESTRITIVO entre largura e altura.
 *
 * Separada por ser a única parte com regra de negócio — e a única testável sem
 * canvas, que não existe no ambiente `node` da suíte.
 */
export function dimensionar(
  largura: number,
  altura: number,
  larguraMax: number,
  alturaMax = Infinity,
): { largura: number; altura: number } {
  const escala = Math.min(1, larguraMax / largura, alturaMax / altura);
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

interface FonteImagem {
  fonte: CanvasImageSource;
  largura: number;
  altura: number;
  liberar(): void;
}

/**
 * Abre o arquivo já com a ORIENTAÇÃO FÍSICA aplicada.
 *
 * Medido em 20/08/2026 nas orientações EXIF 1, 3, 6 e 8: o caminho antigo
 * (`new Image()` + `drawImage`) **já entrega o resultado certo**, idêntico
 * pixel a pixel ao `createImageBitmap` explícito. Isto aqui não conserta bug
 * nenhum — passa a ser GARANTIA, com teste, em vez de comportamento herdado do
 * motor: `image-orientation: from-image` é padrão hoje, mas é decisão do
 * navegador, e uma foto de inspeção girada em documento assinado é caro demais
 * para depender disso.
 *
 * O fallback existe porque `createImageBitmap` não está em toda parte (e não
 * está no ambiente de teste): ele cai exatamente no caminho de antes.
 */
export async function abrirImagem(file: Blob): Promise<FonteImagem> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        fonte: bmp,
        largura: bmp.width,
        altura: bmp.height,
        liberar: () => bmp.close?.(),
      };
    } catch {
      // formato exótico ou navegador sem suporte à opção: segue para o <img>
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        fonte: img,
        largura: img.width,
        altura: img.height,
        liberar: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('arquivo não é uma imagem válida'));
    };
    img.src = url;
  });
}

function rasterizar(
  fonte: CanvasImageSource,
  largura: number,
  altura: number,
  qualidade: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('canvas indisponível'));
    ctx.drawImage(fonte, 0, 0, largura, altura);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('falha ao comprimir a imagem'))),
      'image/jpeg',
      qualidade,
    );
  });
}

/**
 * Redimensiona e comprime para JPEG devolvendo BLOB.
 *
 * É a função que as fotos de equipamento e de inspeção usam desde 10/08/2026.
 * `canvas.toBlob` em vez de `toDataURL` de propósito: o dataURL é a string
 * base64 que saiu do banco nessa mudança, e ela custa ~33% a mais de bytes que
 * o arquivo binário equivalente.
 */
export async function comprimirParaBlob(
  file: Blob,
  larguraMax = PRINCIPAL_LARGURA,
  qualidade = PRINCIPAL_QUALIDADE,
  alturaMax = Infinity,
): Promise<Blob> {
  const img = await abrirImagem(file);
  try {
    const d = dimensionar(img.largura, img.altura, larguraMax, alturaMax);
    return await rasterizar(img.fonte, d.largura, d.altura, qualidade);
  } finally {
    img.liberar();
  }
}

/**
 * Variante MINIATURA — para card, lista e galeria; nunca para o documento.
 *
 * Medido em 20/08/2026: a galeria da ficha desenha 97×67 CSS px decodificando
 * 1200×900, ou seja ~150× a área que chega na tela. Dez fotos numa galeria
 * custavam 1.152,3 KB de rede em cache frio.
 *
 * **Não substitui a principal em lugar nenhum do documento.** O palco, o PDF e
 * o Portal em modo documento continuam usando `baixarFoto`, que não conhece
 * variante.
 */
export function gerarMiniatura(
  file: Blob,
  largura = MINIATURA_LARGURA,
  qualidade = MINIATURA_QUALIDADE,
  alturaMax = MINIATURA_ALTURA,
): Promise<Blob> {
  return comprimirParaBlob(file, largura, qualidade, alturaMax);
}

// Comprime imagem pro tamanho web como base64. Restou para a LOGO da empresa e a
// ASSINATURA dos funcionários: os templates HTML leem essas duas direto do
// localStorage e são pequenas (300–500px, poucos KB), então não justificam ida
// ao bucket — ver a nota em `processarAssinatura` sobre o que ainda custam.
// Fotos de equipamento e de inspeção usam comprimirParaBlob acima.
/**
 * FASE 7B — o dataURL **e** os bytes que o originaram.
 *
 * O SHA-256 do arquivo endereçado por conteúdo precisa representar **exatamente**
 * os bytes que a imagem tem. Por isso o blob é a fonte e o dataURL é derivado
 * dele, e não o contrário: `canvas.toBlob` e `canvas.toDataURL` são dois
 * caminhos de codificação distintos e nada garante que produzam byte a byte a
 * mesma coisa. Gerar os dois independentemente daria um hash que não descreve o
 * que está no registro.
 */
export interface ImagemProcessada {
  /** O que os templates leem hoje. */
  dataUrl: string;
  /** Os bytes de onde o dataURL saiu — é sobre eles que o hash é calculado. */
  blob: Blob;
}

function blobParaDataUrlLocal(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('falha ao ler a imagem'));
    r.readAsDataURL(blob);
  });
}

export function comprimirImagemComBlob(file: File, larguraMax = 500): Promise<ImagemProcessada> {
  return new Promise<ImagemProcessada>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, larguraMax / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas indisponível'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('falha ao comprimir a imagem'));
            blobParaDataUrlLocal(blob).then((dataUrl) => resolve({ dataUrl, blob }), reject);
          },
          'image/jpeg',
          0.5,
        );
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Prepara imagem de assinatura para as folhas (motor de assinatura): detecta a cor de fundo
// pelas bordas (branco de papel, preto de scanner ou transparência) e a remove, convertendo o
// traço em tinta escura sobre fundo TRANSPARENTE (PNG). Sem isso, JPEG mata a transparência
// (vira quadrado preto) e fundo de foto/scanner aparece na folha impressa.
//
// 500px, e não 900 (14/08/2026). PNG não tem qualidade a ajustar — o peso vem da
// ÁREA —, e o comentário logo acima já justificava a exceção ao bucket com
// "300–400px, poucos KB" enquanto esta função guardava o dobro disso. Medido:
// `nr13_lista_phs` pesava 56 KB numa conta com UMA assinatura, e essa chave é
// global, entra no palco de TODO documento das 4 rotas e ainda é copiada para
// dentro de `meta.assinantes` de cada relatório salvo (§7-bis).
//
// 500 é o teto de RENDERIZAÇÃO com margem, não um palpite. A rubrica é impressa
// com altura fixa — 22mm no relatório (`rel-assinatura.js`), 82px no prontuário
// e no livro —, e o PDF rasteriza em `scale: 2`. Isso dá ~165px de altura de
// raster, ou seja ~495px de largura para o formato mais comum (2:1 a 3:1). A
// assinatura real medida na conta engyuricesar tem 591×295 e é desenhada a
// 332×166: já vinha com 1,8× mais resolução do que a folha usa.
//
// SÓ VALE PARA ASSINATURA NOVA. As já cadastradas não são reprocessadas: elas
// são a rubrica de um profissional em documento técnico assinado, e mexer nelas
// mudaria a aparência de registro já emitido.
export function processarAssinaturaComBlob(file: File, larguraMax = 500): Promise<ImagemProcessada> {
  return new Promise<ImagemProcessada>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, larguraMax / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas indisponível'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const { width: w, height: h } = canvas;
        const dados = ctx.getImageData(0, 0, w, h);
        const px = dados.data;

        // Cor de fundo = média dos pixels OPACOS da borda (moldura de 2px). Pixels já
        // transparentes contam como fundo direto.
        let rS = 0, gS = 0, bS = 0, n = 0;
        const amostra = (x: number, y: number) => {
          const i = (y * w + x) * 4;
          if (px[i + 3] < 16) return;
          rS += px[i]; gS += px[i + 1]; bS += px[i + 2]; n++;
        };
        for (let x = 0; x < w; x++) { amostra(x, 0); amostra(x, 1); amostra(x, h - 1); amostra(x, h - 2); }
        for (let y = 0; y < h; y++) { amostra(0, y); amostra(1, y); amostra(w - 1, y); amostra(w - 2, y); }
        const fundo = n > 0 ? [rS / n, gS / n, bS / n] : [255, 255, 255];
        const fundoEscuro = 0.299 * fundo[0] + 0.587 * fundo[1] + 0.114 * fundo[2] < 100;

        // Traço vira tinta: opacidade proporcional à distância da cor de fundo (antialias
        // preservado). Fundo claro mantém a cor original do traço (caneta azul/preta);
        // fundo escuro recolore para tinta escura (traço claro sumiria no papel branco).
        for (let i = 0; i < px.length; i += 4) {
          const aOrig = px[i + 3] / 255;
          const dist = Math.sqrt(
            (px[i] - fundo[0]) ** 2 + (px[i + 1] - fundo[1]) ** 2 + (px[i + 2] - fundo[2]) ** 2,
          );
          const forca = Math.max(0, Math.min(1, (dist - 28) / 90));
          px[i + 3] = Math.round(255 * forca * aOrig);
          if (fundoEscuro) { px[i] = 26; px[i + 1] = 32; px[i + 2] = 84; } // tinta azul-escura
        }
        ctx.putImageData(dados, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('falha ao processar a assinatura'));
          blobParaDataUrlLocal(blob).then((dataUrl) => resolve({ dataUrl, blob }), reject);
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compatibilidade: quem só precisa do dataURL. Os writers da Fase 7B usam as
 * versões `...ComBlob`, porque precisam dos bytes para o hash.
 */
export async function comprimirImagem(file: File, larguraMax = 500): Promise<string> {
  return (await comprimirImagemComBlob(file, larguraMax)).dataUrl;
}

export async function processarAssinatura(file: File, larguraMax = 500): Promise<string> {
  return (await processarAssinaturaComBlob(file, larguraMax)).dataUrl;
}
