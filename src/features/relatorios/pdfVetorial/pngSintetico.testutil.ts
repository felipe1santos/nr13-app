// Utilitário de TESTE: PNG sintético (cor lisa + faixa diagonal) — nenhuma foto real.
import { deflateSync } from 'node:zlib';

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo: string, dados: Buffer): Buffer {
  const t = Buffer.from(tipo, 'ascii');
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
/** PNG RGB de cor lisa com uma faixa diagonal — cada `semente` dá uma imagem distinta. */
export function pngSintetico(largura: number, altura: number, semente: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const cru = Buffer.alloc((largura * 3 + 1) * altura);
  const cor = [(semente * 53) % 256, (semente * 97 + 40) % 256, (semente * 151 + 90) % 256];
  for (let y = 0; y < altura; y++) {
    const base = y * (largura * 3 + 1);
    for (let x = 0; x < largura; x++) {
      const faixa = Math.abs(x * altura - y * largura) < largura * altura * 0.05;
      const o = base + 1 + x * 3;
      cru[o] = faixa ? 255 : cor[0];
      cru[o + 1] = faixa ? 255 : cor[1];
      cru[o + 2] = faixa ? 255 : cor[2];
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(cru)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

