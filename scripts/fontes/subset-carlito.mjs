/**
 * Fase 11 · gera o subconjunto de Carlito que vai DENTRO do PDF.
 *
 * POR QUE SUBCONJUNTO. O jsPDF embute o arquivo de fonte INTEIRO no PDF — não
 * subseta. Carlito completa tem 636 KB (regular) + 690 KB (negrito): 1,3 MB
 * carimbados em todo relatório emitido, para escrever texto em português. O
 * subconjunto abaixo mantém só o que o documento usa e cai para dezenas de KB.
 *
 * POR QUE CARLITO. É a fonte da referência de layout (métrica compatível com
 * Calibri) e é SIL OFL 1.1 — pode ser embutida em PDF e redistribuída. A
 * licença acompanha o asset em `public/fontes/OFL.txt`.
 *
 * COMO RODAR (uma vez; o resultado é versionado):
 *   node scripts/fontes/subset-carlito.mjs
 *
 * A origem é `@fontsource/carlito` quando houver TTF, senão a fonte do sistema
 * (o pacote npm publica só woff/woff2, que o jsPDF não lê).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import subsetFont from 'subset-font';

/**
 * Os caracteres que o relatório pode imprimir.
 *
 * Latin básico + acentuação do português + os sinais que o documento usa de
 * fato (°, ³, ², ±, ×, –, —, ª, º, §, µ). Faltar um caractere aqui não quebra o
 * PDF: ele imprime em branco, e é por isso que a lista é explícita e revisável
 * em vez de "o que apareceu no teste".
 */
const CARACTERES =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~' +
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ' +
  'àáâãäåæçèéêëìíîïðñòóôõöøùúûüýÿ' +
  '°²³ªº±×÷–—‘’“”„…•§¶©®™€£¢¥µ≥≤≠→←↑↓✓✗';

const ORIGENS = {
  regular: [
    'node_modules/@fontsource/carlito/files/carlito-latin-400-normal.ttf',
    'C:/Windows/Fonts/Carlito-Regular.ttf',
  ],
  bold: [
    'node_modules/@fontsource/carlito/files/carlito-latin-700-normal.ttf',
    'C:/Windows/Fonts/Carlito-Bold.ttf',
  ],
};

for (const [peso, caminhos] of Object.entries(ORIGENS)) {
  const origem = caminhos.find((c) => existsSync(c));
  if (!origem) {
    console.error(`Carlito ${peso}: nenhuma origem encontrada em\n  ${caminhos.join('\n  ')}`);
    process.exit(1);
  }
  const inteira = await readFile(origem);
  const recorte = await subsetFont(inteira, CARACTERES, { targetFormat: 'truetype' });
  const destino = `public/fontes/carlito-${peso}.ttf`;
  await writeFile(destino, recorte);
  const pct = (100 - (recorte.length / inteira.length) * 100).toFixed(1);
  console.log(
    `${peso.padEnd(8)} ${origem}\n         ${(inteira.length / 1024).toFixed(0)} KB → ` +
      `${(recorte.length / 1024).toFixed(0)} KB (−${pct}%)  →  ${destino}`,
  );
}
