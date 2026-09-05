import { ler, salvar } from '../../services/storage';

/**
 * Fase 13D · QUEM é a prévia do relatório em edição.
 *
 * | valor | o que a tela mostra |
 * |---|---|
 * | `iframe` (padrão) | as 27 folhas HTML, como sempre |
 * | `vetorial` | o **próprio Modelo Novo**, gerado pelo mesmo motor da emissão |
 *
 * A flag existe porque esta é a virada mais visível da Fase 13: o que o usuário
 * revisa deixa de ser um desenho diferente do que ele assina. Trocar isso sem
 * porta de volta seria apostar que a prévia nova cobre todos os casos de campo
 * na primeira tentativa.
 *
 * **Não alcança documento arquivado.** Relatório com `pdfRef` continua servindo
 * os bytes emitidos (§7-quater), e a prévia nem é montada nesse caso.
 */
export type Previa = 'iframe' | 'vetorial';

export const CHAVE_PREVIA = 'nr13_previa_documento';

function normalizar(v: unknown): Previa {
  return String(v ?? '').trim().toLowerCase() === 'vetorial' ? 'vetorial' : 'iframe';
}

/** A configuração da organização (sem olhar a URL). */
export function previaConfigurada(): Previa {
  try {
    return normalizar(ler<{ previa?: string }>(CHAVE_PREVIA)?.previa);
  } catch {
    return 'iframe';
  }
}

/** A prévia a usar agora: a URL (`?previa=`), se disser algo; senão a chave. */
export function previaAtual(busca = ''): Previa {
  const daUrl = new URLSearchParams(busca).get('previa');
  if (daUrl !== null && daUrl.trim() !== '') return normalizar(daUrl);
  return previaConfigurada();
}

/** Grava a decisão da organização. Caminho oficial de mutação. */
export async function definirPrevia(previa: Previa): Promise<void> {
  await salvar(CHAVE_PREVIA, { previa: normalizar(previa), em: new Date().toISOString() });
}
