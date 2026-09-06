import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
const cod = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintJpegXObject].filter(Boolean);
const quero = (process.argv[3] ?? '').split(',').filter(Boolean).map(Number);
let imgs = 0;
for (let p = 1; p <= doc.numPages; p++) {
  const pg = await doc.getPage(p);
  const ops = await pg.getOperatorList();
  const n = ops.fnArray.filter((f) => cod.includes(f)).length;
  imgs += n;
  if (quero.length && !quero.includes(p)) continue;
  const tc = await pg.getTextContent();
  // y de cada item, para medir onde o conteúdo termina na folha.
  const ys = tc.items.map((i) => i.transform?.[5]).filter((v) => typeof v === 'number');
  const txt = tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  console.log(`\n== P${p} (imgs:${n}) menor-y:${ys.length ? Math.min(...ys).toFixed(0) : '-'} ==\n${txt.slice(0, 2200)}`);
}
console.log(`\nPAGINAS ${doc.numPages} · IMAGENS ${imgs}`);
