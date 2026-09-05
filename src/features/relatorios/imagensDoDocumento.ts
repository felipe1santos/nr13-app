import { baixarFoto, blobParaDataUrl, salvarArquivo, type RefFoto } from '../../services/fotos';
import { comprimirImagemComBlob } from '../../services/imagem';

/**
 * Bloco 1 · as IMAGENS que o relatório pode trocar campo a campo.
 *
 * ## Por que a imagem entra pelo mesmo mecanismo do texto
 *
 * A 13D-bis já resolve "o que este documento mostra neste campo" por override.
 * Uma foto de capa trocada só neste relatório é a mesma pergunta — e resolvê-la
 * por outro caminho criaria duas verdades sobre o mesmo documento.
 *
 * O que muda é o CONTEÚDO do override: nunca a imagem, sempre o **caminho** do
 * arquivo no cofre (`org/relatorios-imagens/<sha>.jpg`). Guardar Base64 no
 * override colocaria centenas de KB numa chave que é lida a cada geração — e o
 * §2-bis existe justamente porque isso já custou caro aqui.
 *
 * `branco` continua significando "vazio de propósito": a área fica sem imagem,
 * amarela na prévia, e a foto automática do cadastro NÃO volta.
 */
export const ESCOPO_IMAGENS = 'documento';

/** O override de imagem guarda isto, serializado — nunca os bytes. */
export interface ImagemDoDocumento {
  ref: RefFoto;
  /** largura ÷ altura, medida na imagem comprimida. O PDF precisa para não esticar. */
  proporcao: number;
}

/** `true` quando o texto do override é uma imagem (e não um texto documental). */
export function ehImagem(valor: string | null | undefined): boolean {
  return !!valor && valor.trim().startsWith('{') && valor.includes('"ref"');
}

export function serializar(img: ImagemDoDocumento): string {
  return JSON.stringify(img);
}

export function desserializar(valor: string | null | undefined): ImagemDoDocumento | null {
  if (!ehImagem(valor)) return null;
  try {
    const o = JSON.parse(String(valor)) as ImagemDoDocumento;
    return o?.ref?.path ? { ref: o.ref, proporcao: Number(o.proporcao) || 4 / 3 } : null;
  } catch {
    return null;
  }
}

/**
 * Sobe o arquivo escolhido e devolve o texto do override.
 *
 * Comprime antes de subir — a foto de um celular chega com 4–8 MB e o documento
 * a desenha em 180 mm de largura. É o mesmo caminho das fotos de inspeção e da
 * placa real (cofre local primeiro, bucket depois, fila offline por baixo).
 */
export async function prepararImagem(arquivo: File): Promise<string> {
  const { blob, dataUrl } = await comprimirImagemComBlob(arquivo, 1600);
  const ref = await salvarArquivo(blob, ESCOPO_IMAGENS, 'jpg', 'image/jpeg');
  return serializar({ ref, proporcao: await medirProporcao(dataUrl) });
}

/** A imagem pronta para o gerador. `null` quando não resolve — e aí a área fica vazia. */
export async function resolverImagem(
  valor: string | null | undefined,
): Promise<{ dataUrl: string; proporcao: number } | null> {
  const img = desserializar(valor);
  if (!img) return null;
  try {
    const blob = await baixarFoto(img.ref);
    if (!blob) return null;
    return { dataUrl: await blobParaDataUrl(blob), proporcao: img.proporcao };
  } catch {
    // Imagem que não resolve não derruba a emissão: a área sai vazia, que é
    // informação verdadeira, em vez de o documento inteiro falhar.
    return null;
  }
}

function medirProporcao(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 4 / 3);
    img.onerror = () => resolve(4 / 3);
    img.src = dataUrl;
  });
}
