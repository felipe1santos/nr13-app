import type { jsPDF } from 'jspdf';

/**
 * Fase 11 · a fonte do documento, EMBUTIDA no PDF.
 *
 * ## Por que embutir, e não pedir a fonte ao computador de quem abre
 *
 * Um PDF que referencia a fonte pelo nome só é fiel em máquinas que a tenham
 * instalada. Em qualquer outra, o leitor substitui por uma métrica parecida — e
 * "parecida" numa folha A4 com tabela de 7 colunas significa coluna estourando,
 * texto quebrando em lugar diferente e rodapé fora da margem. O documento é
 * assinado por engenheiro: ele precisa sair igual em toda máquina, sempre.
 *
 * ## Por que CARLITO
 *
 * É a fonte da referência de layout — métrica compatível com Calibri, o que
 * preserva a diagramação desenhada lá — e é **SIL Open Font License 1.1**, que
 * permite embutir em documento e redistribuir. A licença viaja junto do asset,
 * em `public/fontes/OFL.txt`.
 *
 * ## Por que SUBCONJUNTO
 *
 * O jsPDF embute o arquivo INTEIRO que recebe; ele não subseta. Carlito completa
 * são 1,3 MB (regular + negrito) carimbados em todo relatório. O subconjunto
 * gerado por `scripts/fontes/subset-carlito.mjs` tem 102 KB + 115 KB e cobre
 * Latin + acentuação do português + os sinais que o documento usa.
 *
 * ## Carregamento
 *
 * Sob demanda, e uma vez por sessão: os ~217 KB só são baixados quando alguém
 * gera um PDF. Quem só navega pelo sistema não paga por eles.
 */
export const FAMILIA = 'Carlito';

const ARQUIVOS = {
  normal: { url: '/fontes/carlito-regular.ttf', vfs: 'Carlito-Regular.ttf' },
  bold: { url: '/fontes/carlito-bold.ttf', vfs: 'Carlito-Bold.ttf' },
  // A referência usa itálico na sigla da capa e nos títulos de item. Sem os dois
  // arquivos, o jsPDF cai no regular e a distinção some do documento.
  italic: { url: '/fontes/carlito-italic.ttf', vfs: 'Carlito-Italic.ttf' },
  bolditalic: { url: '/fontes/carlito-bolditalic.ttf', vfs: 'Carlito-BoldItalic.ttf' },
} as const;

type Estilo = keyof typeof ARQUIVOS;

/** Cache por sessão: base64 do TTF, já convertido. */
const cache = new Map<Estilo, string>();

function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Em blocos: `String.fromCharCode(...bytes)` com 100 KB estoura a pilha.
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  return btoa(bin);
}

async function carregar(estilo: Estilo): Promise<string> {
  const emCache = cache.get(estilo);
  if (emCache) return emCache;
  const resp = await fetch(ARQUIVOS[estilo].url);
  if (!resp.ok) throw new Error(`Fonte ${ARQUIVOS[estilo].url} não carregou (${resp.status})`);
  const b64 = paraBase64(await resp.arrayBuffer());
  cache.set(estilo, b64);
  return b64;
}

/**
 * Registra Carlito (normal + negrito) no documento.
 *
 * **Falha alto, de propósito.** Se a fonte não carregar, o PDF sairia em
 * Helvetica com métrica diferente da desenhada — um documento que parece certo
 * e não é. Melhor recusar a geração e dizer por quê.
 */
export async function registrarCarlito(pdf: jsPDF): Promise<void> {
  for (const estilo of ['normal', 'bold', 'italic', 'bolditalic'] as const) {
    const b64 = await carregar(estilo);
    pdf.addFileToVFS(ARQUIVOS[estilo].vfs, b64);
    pdf.addFont(ARQUIVOS[estilo].vfs, FAMILIA, estilo);
  }
  pdf.setFont(FAMILIA, 'normal');
}

/** Só para os testes: esquece o que foi baixado. */
export function zerarCacheFontes(): void {
  cache.clear();
}
