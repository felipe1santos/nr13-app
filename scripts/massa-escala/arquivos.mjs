/**
 * Arquivos sintéticos no tamanho pedido.
 *
 * O detalhe que faz diferença: o preenchimento é **incompressível**. Um PDF
 * "de 6,6 MB" cheio de zeros vira alguns KB no bucket, e a medição de Storage
 * passaria a mentir exatamente na fase que existe para não mentir sobre
 * Storage. Bytes vindos do PRNG não comprimem.
 *
 * Os arquivos são deliberadamente identificáveis como sintéticos: o cabeçalho
 * carrega a marca. Ninguém deve confundir um destes com documento emitido.
 */
import { prng } from './prng.mjs';

export const MARCA = 'NR13-FASE8-MASSA-SINTETICA';

/** Bytes pseudoaleatórios determinísticos — mesma seed, mesmo arquivo. */
function ruido(seed, n) {
  const rnd = prng(seed);
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.floor(rnd() * 256);
  return b;
}

function concat(partes) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { saida.set(p, o); o += p.length; }
  return saida;
}

const texto = (s) => new TextEncoder().encode(s);

/**
 * JPEG sintético: SOI + comentário com a marca + ruído + EOI.
 *
 * Não é um JPEG decodificável, e isso é proposital — ele existe para ocupar
 * bytes no bucket e ser baixado, não para ser exibido. Se algum dia precisar
 * renderizar, o gerador é o lugar de trocar isto por um encode real.
 */
export function jpegSintetico(seed, bytesAlvo) {
  const cabecalho = concat([new Uint8Array([0xff, 0xd8, 0xff, 0xfe]), texto(`${MARCA}\0`)]);
  const rodape = new Uint8Array([0xff, 0xd9]);
  const corpo = Math.max(0, bytesAlvo - cabecalho.length - rodape.length);
  return concat([cabecalho, ruido(seed, corpo), rodape]);
}

/**
 * PDF sintético com um stream binário do tamanho pedido.
 *
 * Estrutura mínima válida o bastante para o Storage tratar como PDF; o volume
 * está no stream, que é ruído puro. Sem `/Filter`, então nada tenta
 * descomprimir.
 */
export function pdfSintetico(seed, bytesAlvo) {
  const abre = texto(
    `%PDF-1.4\n%${MARCA}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n3 0 obj<</Length `,
  );
  const fecha1 = texto('>>stream\n');
  const fecha2 = texto('\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  // O comprimento do stream depende do próprio número escrito; duas passadas
  // resolvem sem malabarismo.
  let corpo = Math.max(0, bytesAlvo - abre.length - fecha1.length - fecha2.length - 8);
  for (let passada = 0; passada < 2; passada++) {
    const rotulo = texto(String(corpo));
    const total = abre.length + rotulo.length + fecha1.length + corpo + fecha2.length;
    corpo += bytesAlvo - total;
    if (corpo < 0) corpo = 0;
  }
  return concat([abre, texto(String(corpo)), fecha1, ruido(seed, corpo), fecha2]);
}

/** PNG sintético para assinatura — mesma lógica do JPEG. */
export function pngSintetico(seed, bytesAlvo) {
  const cabecalho = concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    texto(MARCA),
  ]);
  const corpo = Math.max(0, bytesAlvo - cabecalho.length);
  return concat([cabecalho, ruido(seed, corpo)]);
}

/** Quanto o arquivo produzido difere do alvo, em fração. Aceite do plano: ±10 %. */
export function desvio(bytesProduzidos, bytesAlvo) {
  if (bytesAlvo === 0) return 0;
  return Math.abs(bytesProduzidos - bytesAlvo) / bytesAlvo;
}
