/**
 * Redimensiona e comprime para JPEG devolvendo BLOB.
 *
 * É a função que as fotos de equipamento e de inspeção usam desde 10/08/2026.
 * `canvas.toBlob` em vez de `toDataURL` de propósito: o dataURL é a string
 * base64 que saiu do banco nessa mudança, e ela custa ~33% a mais de bytes que
 * o arquivo binário equivalente.
 */
export function comprimirParaBlob(file: File, larguraMax = 1200, qualidade = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, larguraMax / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas indisponível'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('falha ao comprimir a imagem'))),
        'image/jpeg',
        qualidade,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('arquivo não é uma imagem válida'));
    };
    img.src = url;
  });
}

// Comprime imagem pro tamanho web como base64. Restou para a LOGO da empresa e a
// ASSINATURA dos funcionários: os templates HTML leem essas duas direto do
// localStorage e são pequenas (300–500px, poucos KB), então não justificam ida
// ao bucket — ver a nota em `processarAssinatura` sobre o que ainda custam.
// Fotos de equipamento e de inspeção usam comprimirParaBlob acima.
export function comprimirImagem(file: File, larguraMax = 500): Promise<string> {
  return new Promise((resolve, reject) => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.5));
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
export function processarAssinatura(file: File, larguraMax = 500): Promise<string> {
  return new Promise((resolve, reject) => {
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
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
