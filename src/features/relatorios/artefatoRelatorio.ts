/**
 * O relatório salvo como ARTEFATO: um PDF imutável no bucket, com hash.
 *
 * ── O QUE ISTO CONSERTA ─────────────────────────────────────────────────────
 * Até 11/08/2026, "salvar relatório" gravava uma RECEITA: a lista de templates
 * (`documentos`) mais os campos (`meta`). Reabrir remontava os 27 templates em
 * iframe e re-injetava os dados das chaves VIVAS. Consequências reais:
 *
 *   - editar a ficha do equipamento mudava a Capa, a Placa e a Caracterização de
 *     relatórios ASSINADOS anos antes;
 *   - mexer no checkbox da conclusão mudava o APTO/INAPTO de laudo antigo;
 *   - apagar o container de inspeção esvaziava as folhas de campo do histórico;
 *   - corrigir uma margem num `.html` reescrevia, em silêncio, todo documento já
 *     emitido;
 *   - no Portal do Cliente, o PDF era gerado a partir do DOM vivo — quem abrisse
 *     o DevTools removia a trava, trocava "Aprovado" por "Reprovado" e baixava um
 *     documento adulterado com a logo e a assinatura do engenheiro.
 *
 * Os snapshots de 14 e 20/07 (empresa, assinantes, calibrações) já tinham atacado
 * a ponta mais visível do problema. Este módulo resolve a raiz: o documento
 * assinado deixa de ser re-renderizado e passa a ser um arquivo.
 *
 * ── DESENHO ─────────────────────────────────────────────────────────────────
 * O arquivo vai para o MESMO bucket e a MESMA fila das fotos e dos certificados
 * (`services/fotos.ts`). Não existe segunda fila: o relatório herda de graça a
 * gravação offline, a retomada quando a rede volta e a contagem de pendências.
 *
 * O SHA-256 não é enfeite. Ele é o que permite provar, depois, que o documento
 * não foi trocado — é a razão de o artefato existir num registro técnico com
 * responsabilidade de engenheiro.
 */
import { salvarArquivo, baixarFoto, montarPath, type RefFoto } from '../../services/fotos';

/** O que fica gravado no `RelatorioSalvo` quando o artefato existe. */
export interface PdfArtefato {
  pdfRef: RefFoto;
  /** SHA-256 do arquivo, hex minúsculo. */
  sha256: string;
  /** ISO da geração. */
  geradoEm: string;
  paginas: number;
}

/** Escopo (pasta) dos relatórios dentro do bucket, sob `<org_id>/`. */
export const ESCOPO_RELATORIOS = 'relatorios';

/**
 * SHA-256 em hex. Usa `crypto.subtle`, que só existe em contexto seguro
 * (https/localhost) — em http simples devolve erro em vez de um hash falso,
 * porque hash errado é pior que hash nenhum.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle indisponível: o hash do relatório exige contexto seguro (https)');
  const buf = await subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sobe o PDF e devolve o artefato. NÃO devolve sucesso sem o arquivo estar
 * gravado — offline, "gravado" significa no cofre local, com o upload
 * enfileirado; quem chama decide como sinalizar isso ao usuário.
 *
 * O caminho é `<org_id>/relatorios/<uuid>.pdf`. A primeira pasta É a organização
 * porque a policy `inspecao_leitura` compara exatamente
 * `storage.foldername(name)[1]` com `org_atual()` — mudar essa posição desliga o
 * isolamento entre clientes.
 *
 * O nome NÃO usa o id do relatório de propósito: `montarPath` gera um uuid, e um
 * caminho novo a cada publicação impede que uma regeração sobrescreva o arquivo
 * que um relatório já salvo referencia. Artefato é imutável, inclusive no nome.
 */
export async function publicarArtefato(bytes: Uint8Array, paginas: number): Promise<PdfArtefato> {
  if (!bytes?.length) throw new Error('PDF vazio: nada a publicar');
  const sha256 = await sha256Hex(bytes);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const pdfRef = await salvarArquivo(blob, ESCOPO_RELATORIOS, 'pdf', 'application/pdf');
  return { pdfRef, sha256, geradoEm: new Date().toISOString(), paginas };
}

/** O arquivo: cofre local primeiro (offline, egress zero), bucket depois. */
export async function baixarArtefato(a: Pick<PdfArtefato, 'pdfRef'>): Promise<Blob | null> {
  if (!a?.pdfRef?.path) return null;
  return baixarFoto(a.pdfRef);
}

/**
 * Confere que o arquivo guardado ainda casa com o hash gravado na emissão.
 * `null` = não deu para verificar (offline e sem cópia local) — que é diferente
 * de "não confere", e a UI não pode tratar os dois do mesmo jeito.
 */
export async function verificarIntegridade(a: PdfArtefato): Promise<boolean | null> {
  const blob = await baixarArtefato(a);
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return (await sha256Hex(bytes)) === a.sha256;
}

/**
 * Extrai o artefato de um relatório salvo. `null` para relatório legado (sem
 * `pdfRef`), que é o sinal para o chamador cair no fluxo antigo.
 *
 * Existe para que nenhum ponto do app precise montar o objeto na mão — foi
 * assim que a primeira versão acabou passando o `RelatorioSalvo` inteiro onde se
 * esperava um `PdfArtefato`.
 */
export function artefatoDe(r: {
  pdfRef?: RefFoto;
  sha256?: string;
  geradoEm?: string;
  paginas?: number;
} | null | undefined): PdfArtefato | null {
  if (!r?.pdfRef?.path) return null;
  return {
    pdfRef: r.pdfRef,
    sha256: r.sha256 ?? '',
    geradoEm: r.geradoEm ?? '',
    paginas: r.paginas ?? 0,
  };
}

/** Caminho que ESTE relatório usaria — exposto para teste e diagnóstico. */
export function caminhoDoRelatorio(orgId: string): string {
  return montarPath(orgId, ESCOPO_RELATORIOS, 'pdf');
}
