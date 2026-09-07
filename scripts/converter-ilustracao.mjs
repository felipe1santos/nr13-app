/**
 * PNG → WebP, sem depender de `sharp`, `magick` ou `cwebp`.
 *
 * As ilustrações de onboarding chegam como PNG de ~1 MB direto do gerador. Servir
 * isso é caro: a ajuda passaria a pesar mais do que a tela que ela explica. Não
 * há conversor instalado nesta máquina — e instalar `sharp` por causa de duas
 * imagens traria um binário nativo para o `package.json`.
 *
 * O Chrome que já é usado para medir responsividade sabe fazer isso sozinho:
 * `canvas.toDataURL('image/webp', q)`. O script desenha a imagem redimensionada
 * num canvas e devolve o base64 pelo `--dump-dom`.
 *
 * Uso: node scripts/converter-ilustracao.mjs <entrada.png> <saida.webp> [lado] [q]
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [entrada, saida, ladoArg, qArg] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('uso: node scripts/converter-ilustracao.mjs <entrada.png> <saida.webp> [lado] [q]');
  process.exit(2);
}
const lado = Number(ladoArg || 900);
const q = Number(qArg || 0.82);

const b64 = readFileSync(resolve(entrada)).toString('base64');
const dir = mkdtempSync(join(tmpdir(), 'conv-'));

const html = `<!doctype html><meta charset="utf-8"><body><script>
const img = new Image();
img.onload = () => {
  const escala = Math.min(1, ${lado} / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const pre = document.createElement('pre');
  pre.id = 'SAIDA';
  pre.textContent = c.width + 'x' + c.height + '|' + c.toDataURL('image/webp', ${q});
  document.body.appendChild(pre);
};
img.src = 'data:image/png;base64,${b64}';
</script></body>`;

const arq = join(dir, 'conv.html');
writeFileSync(arq, html);
const perfil = mkdtempSync(join(tmpdir(), 'perfil-conv-'));

const dom = await new Promise((res, rej) => {
  const p = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${perfil}`,
    '--virtual-time-budget=8000',
    '--dump-dom',
    'file:///' + arq.split('\\').join('/'),
  ]);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.on('close', () => res(out));
  p.on('error', rej);
});

const m = dom.match(/<pre id="SAIDA">([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('não converteu; DOM:\n' + dom.slice(0, 600));
  process.exit(1);
}
const [dim, dataUrl] = m[1].split('|');
const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(saida, bytes);
console.log(`${saida} · ${dim}px · ${(bytes.length / 1024).toFixed(1)} KB`);
