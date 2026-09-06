import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';
const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
const pg = await doc.getPage(Number(process.argv[3] ?? 4));
const tc = await pg.getTextContent();
const PT = 25.4 / 72;
for (const it of tc.items) {
  const y = 297 - it.transform[5] * PT;
  if (/OPERAÇÃO DO VASO|Observações sobre|A categorização segue|É OBRIGATÓRIO|MATRIZ DE/.test(it.str)) {
    console.log(`${y.toFixed(1)} mm  ${it.str.slice(0, 50)}`);
  }
}
