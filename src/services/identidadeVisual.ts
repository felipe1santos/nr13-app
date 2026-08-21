/**
 * FASE 7B — logo e rubrica endereçadas por conteúdo.
 *
 * ── O QUE ESTE MÓDULO É ─────────────────────────────────────────────────────
 *
 * Uma casca fina sobre `salvarArquivoPorConteudo`, que já faz o trabalho desde
 * 14/08/2026 para a rubrica do Livro: o nome do arquivo **é** o SHA-256 do
 * conteúdo. Nada de content-addressing foi inventado aqui — o objetivo é
 * justamente não criar um segundo mecanismo.
 *
 * O que ele acrescenta é a **ordem obrigatória da fase**:
 *
 *   processar → bytes finais → hash (o próprio path) → upload/reuso
 *             → CONFIRMAR no servidor → só então devolver a referência
 *
 * `arquivoPendente(path) === false` é o único sinal aceito (I-14). Devolver uma
 * referência antes disso deixaria o registro apontando para arquivo que talvez
 * nunca tenha chegado — o defeito que a Fase 6 existe para impedir.
 *
 * ── FALHAR AQUI NÃO PODE CUSTAR O CADASTRO ──────────────────────────────────
 *
 * Toda função devolve `null` quando não consegue confirmar. Quem chama grava a
 * dataURL como sempre gravou, e a rubrica/logo do usuário está salva. É o mesmo
 * princípio da D-18 (Fase 5) e do fallback da Fase 6.
 *
 * ── DEDUPLICAÇÃO ────────────────────────────────────────────────────────────
 *
 * Vem de graça do endereço: bytes iguais → hash igual → **mesmo path**. O
 * `upsert: true` de `salvarArquivoPorConteudo` é seguro exatamente porque
 * reescrever um arquivo por outro idêntico não muda nada. Voltar para uma logo
 * antiga reaproveita o arquivo que já existe, sem upload novo.
 */
import { salvarArquivoPorConteudo, arquivoPendente, type RefFoto } from './fotos';

/** Pastas por tipo. `assinaturas` já é usada pelo Livro desde 14/08/2026. */
export const ESCOPO_LOGO = 'logos';
export const ESCOPO_ASSINATURA = 'assinaturas';

function extensaoDe(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/**
 * Sobe os bytes endereçados pelo conteúdo e devolve a referência **confirmada**.
 *
 * `null` significa "não deu para confirmar agora" — nunca "perdeu". Quem chama
 * mantém o formato antigo, e a varredura da Fase 6 recupera depois.
 */
export async function referenciaPorConteudo(
  blob: Blob,
  escopo: string,
): Promise<RefFoto | null> {
  if (!blob || blob.size === 0) return null;
  try {
    const mime = blob.type || 'image/png';
    const ref = await salvarArquivoPorConteudo(blob, escopo, extensaoDe(mime), mime);
    if (!ref?.path) return null;
    // O SERVIDOR confirma, não o `navigator.onLine`. Enquanto o upload estiver
    // na fila, a referência não é boa o bastante para substituir a imagem.
    if (await arquivoPendente(ref.path)) return null;
    return ref;
  } catch {
    return null;
  }
}

export function referenciaDaLogo(blob: Blob): Promise<RefFoto | null> {
  return referenciaPorConteudo(blob, ESCOPO_LOGO);
}

export function referenciaDaAssinatura(blob: Blob): Promise<RefFoto | null> {
  return referenciaPorConteudo(blob, ESCOPO_ASSINATURA);
}

/**
 * O par que o cadastro grava: a dataURL **e** a referência, quando ela existe.
 *
 * A dataURL fica na chave viva durante toda a convivência (D-11), e é o que
 * torna o rollback para a 7A gratuito. O ganho da fase não vem daqui — vem do
 * snapshot do relatório novo, que congela só a referência.
 */
export interface IdentidadeGravavel {
  dataUrl: string;
  ref?: RefFoto;
}

export async function paraGravar(
  processada: { dataUrl: string; blob: Blob },
  escopo: string,
): Promise<IdentidadeGravavel> {
  const ref = await referenciaPorConteudo(processada.blob, escopo);
  return ref ? { dataUrl: processada.dataUrl, ref } : { dataUrl: processada.dataUrl };
}
