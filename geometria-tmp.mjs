import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

// Mede, em mm a partir do TOPO, onde cada página termina de desenhar — e onde a
// imagem da placa caiu na folha 3. É a checagem de "sobrou espaço no pé".
const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
const PT_MM = 25.4 / 72;
const ALTURA_MM = 297;

for (const p of (process.argv[3] ?? '3,4').split(',').map(Number)) {
  const pg = await doc.getPage(p);
  const ops = await pg.getOperatorList();
  let menorY = Infinity; // menor y em pt (mais perto do pé)
  let imagem = null;
  ops.fnArray.forEach((f, i) => {
    const a = ops.argsArray[i];
    if (f === OPS.constructPath) {
      const args = a[1] ?? [];
      for (let k = 1; k < args.length; k += 2) if (typeof args[k] === 'number') menorY = Math.min(menorY, args[k]);
    }
    if (f === OPS.transform && Array.isArray(a) && Math.abs(a[0]) > 50 && Math.abs(a[3]) > 50) {
      imagem = { x: a[4], y: a[5], larg: a[0], alt: Math.abs(a[3]) };
    }
  });
  const fimDoDesenho = Number.isFinite(menorY) ? ALTURA_MM - menorY * PT_MM : null;
  console.log(
    `P${p}: último traço a ${fimDoDesenho?.toFixed(1)} mm do topo · sobra abaixo ${(ALTURA_MM - 7 - (fimDoDesenho ?? 0)).toFixed(1)} mm` +
      (imagem ? ` · imagem: topo ${(ALTURA_MM - (imagem.y + imagem.alt) * PT_MM).toFixed(1)} mm, altura ${(imagem.alt * PT_MM).toFixed(1)} mm` : ''),
  );
}
