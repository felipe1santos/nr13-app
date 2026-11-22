import { baixarArtefato, type PdfArtefato } from '../artefatoRelatorio';
import { aplicarAnotacoes } from './aplicarAnotacoes';
import type { Anotacao } from './modelo';

/**
 * A cópia anotada de um documento ARQUIVADO.
 *
 * Só LÊ o arquivo da emissão (cofre local → bucket, o mesmo `baixarArtefato`
 * do visualizador) e devolve bytes novos, na memória. Não publica, não regrava
 * o arquivo, não toca no `pdfRef` nem no SHA: o documento oficial segue sendo o
 * da emissão, e o que o usuário leva é uma cópia com as marcas dele por cima.
 *
 * `null` = não deu para ler o arquivo (rede, cofre vazio).
 */
export async function copiaAnotadaDoArtefato(
  artefato: Pick<PdfArtefato, 'pdfRef'>,
  anotacoes: readonly Anotacao[],
): Promise<Uint8Array | null> {
  const blob = await baixarArtefato(artefato);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return aplicarAnotacoes(bytes, anotacoes);
}
