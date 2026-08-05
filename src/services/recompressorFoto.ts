import type { PassoDegradacao } from './palco';

/**
 * Gera a "variante de relatório" das fotos de uma chave `nr13_fotos_<TAG>`.
 *
 * Só roda no navegador (depende de canvas), por isso o palco a recebe por
 * injeção — nos testes entra um adaptador falso.
 *
 * IMPORTANTE: devolve uma string NOVA. A foto original permanece intacta no
 * Map, no IndexedDB e no Supabase; a versão degradada existe apenas enquanto o
 * documento está montado.
 */
export async function recomprimirFotosDoValor(
  valor: string,
  passo: PassoDegradacao,
): Promise<string> {
  const fotos = JSON.parse(valor) as Array<Record<string, unknown>>;
  if (!Array.isArray(fotos)) return valor;

  const novas = await Promise.all(
    fotos.map(async (f) =>
      typeof f?.src === 'string' ? { ...f, src: await redesenhar(f.src, passo) } : f,
    ),
  );
  return JSON.stringify(novas);
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
