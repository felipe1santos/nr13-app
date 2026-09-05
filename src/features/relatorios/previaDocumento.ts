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
 *
 * ## 13E · VIRADO EM 05/09/2026 — ausência de valor agora é `vetorial`
 *
 * Até a 13D o default era `iframe`, e a prévia nova precisava ser pedida. A
 * inversão é deliberada e é o que faz a virada alcançar as 30 organizações sem
 * escrever uma chave em cada uma: quem não configurou nada passa a revisar o
 * MESMO documento que assina.
 *
 * O rollback continua sendo um passo, e agora é ele que precisa ser explícito:
 * `?previa=iframe` na URL (diagnóstico) ou a chave gravada com `'iframe'`
 * (organização inteira). Nenhum caminho normal monta os 27 iframes.
 *
 * Leitura que FALHA cai no padrão novo, não no antigo: cair no antigo faria uma
 * falha de storage remontar as 27 folhas em silêncio — o caminho caro, escolhido
 * por acidente.
 */
export type Previa = 'iframe' | 'vetorial';

export const CHAVE_PREVIA = 'nr13_previa_documento';

function normalizar(v: unknown): Previa {
  return String(v ?? '').trim().toLowerCase() === 'iframe' ? 'iframe' : 'vetorial';
}

/** A configuração da organização (sem olhar a URL). */
export function previaConfigurada(): Previa {
  try {
    return normalizar(ler<{ previa?: string }>(CHAVE_PREVIA)?.previa);
  } catch {
    return 'vetorial';
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
