import type { PassoDegradacao } from './palco';

/**
 * Gera a "variante de relatório" das fotos de uma chave do palco.
 *
 * Só roda no navegador (depende de canvas), por isso o palco a recebe por
 * injeção — nos testes entra um adaptador falso.
 *
 * IMPORTANTE: devolve uma string NOVA. A foto original permanece intacta no
 * Map, no IndexedDB e no Supabase; a versão degradada existe apenas enquanto o
 * documento está montado.
 *
 * POR QUE É RECURSIVO (11/08/2026): antes esta função só entendia o array plano
 * de `{src}` do `nr13_fotos_<TAG>`, e a degradação inteira só era aplicada a
 * essa chave. Só que o peso de verdade está nas fotos de CAMPO, que chegam ao
 * palco aninhadas dentro de `nr13_inspecao_atual`/`nr13_injecao_atual`
 * (checklists, visual externo/interno, TH, ultrassom). Resultado medido na conta
 * gabriel.dadona: com o palco em 2.780 KB de 3.368, o aperto recomprimia ~1 KB
 * de foto de capa e ignorava ~2,7 MB de fotos de inspeção. A degradação existia
 * e não tinha efeito nenhum sobre o que importava.
 */
const CAMPOS = ['src', 'base64'] as const;

function ehImagem(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image');
}

export async function recomprimirFotosDoValor(
  valor: string,
  passo: PassoDegradacao,
): Promise<string> {
  let raiz: unknown;
  try {
    raiz = JSON.parse(valor);
  } catch {
    return valor; // não é JSON: nada a fazer
  }

  // A hidratação grava o MESMO dataURL em `src` e em `base64` (ver
  // `hidratarFotosDoBucket`), e uma foto de campo pode se repetir entre a folha
  // do ensaio e a folha de fotos. Redesenhar cada ocorrência custaria um canvas
  // por cópia — o cache resolve cada imagem UMA vez por passo.
  const jaFeitas = new Map<string, string>();
  async function converter(dataUrl: string): Promise<string> {
    const pronta = jaFeitas.get(dataUrl);
    if (pronta !== undefined) return pronta;
    const nova = await redesenhar(dataUrl, passo);
    jaFeitas.set(dataUrl, nova);
    return nova;
  }

  async function percorrer(no: unknown): Promise<void> {
    if (Array.isArray(no)) {
      for (const filho of no) await percorrer(filho);
      return;
    }
    if (typeof no !== 'object' || no === null) return;

    const obj = no as Record<string, unknown>;
    for (const campo of CAMPOS) {
      if (ehImagem(obj[campo])) obj[campo] = await converter(obj[campo] as string);
    }
    for (const filho of Object.values(obj)) await percorrer(filho);
  }

  await percorrer(raiz);
  return JSON.stringify(raiz);
}

/**
 * Tamanho (UTF-16) da MAIOR imagem dentro do valor, em qualquer profundidade.
 *
 * A mesma imagem repetida em `src` e `base64` conta UMA vez: são o mesmo
 * arquivo, e contá-la em dobro faria a degradação enxergar uma foto do dobro do
 * tamanho e degradar mais do que o necessário.
 */
export function maiorFotoDoValor(valor: string): number {
  let raiz: unknown;
  try {
    raiz = JSON.parse(valor);
  } catch {
    return 0;
  }

  let maior = 0;
  const pilha: unknown[] = [raiz];
  while (pilha.length) {
    const no = pilha.pop();
    if (Array.isArray(no)) {
      pilha.push(...no);
      continue;
    }
    if (typeof no !== 'object' || no === null) continue;
    const obj = no as Record<string, unknown>;
    for (const campo of CAMPOS) {
      if (ehImagem(obj[campo])) maior = Math.max(maior, (obj[campo] as string).length * 2);
    }
    pilha.push(...Object.values(obj));
  }
  return maior;
}

function redesenhar(dataUrl: string, passo: PassoDegradacao): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = passo.largura === null ? 1 : Math.min(1, passo.largura / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));

      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl); // sem canvas: mantém como está
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', passo.qualidade));
    };
    // Imagem quebrada não pode derrubar a montagem inteira.
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
