/**
 * O QUE O PORTAL PODE RECEBER de uma chave já autorizada — a regra de
 * OFICIALIDADE aplicada NO SERVIDOR (19/09/2026).
 *
 * A autorização por TAG (`prefixos.ts`) decide QUAIS chaves são do cliente. Isto
 * decide o que, DENTRO delas, é documento: rascunho não é, e o navegador do
 * cliente não pode recebê-lo — nem para a tela esconder depois. Antes desta
 * regra, `nr13_calibracoes_<TAG>` ia inteira, com os rascunhos dentro, e só o
 * `ehOficial` da tela os tirava.
 *
 * MESMA SEMÂNTICA de `ehOficial` (`src/features/calibracoes/tipos.ts`), que vale
 * para vencimentos, quadro 7.1.1, Portal e certificados: é oficial tudo que não
 * DIZ que é rascunho — emitido, laboratório externo e legado (sem `status`).
 * `oficialidadePortal.test.ts` compara as duas sobre a mesma tabela de casos.
 *
 * ── POR QUE HÁ UMA CÓPIA DESTE ARQUIVO EM CADA EDGE ──────────────────────────
 *
 * O deploy das Edges é pelo dashboard, uma função por vez (sem pasta
 * compartilhada). `portal_cliente/oficialidade.ts` e `portal_arquivo/oficialidade.ts`
 * precisam ser IDÊNTICOS, byte a byte — o mesmo teste quebra se divergirem.
 *
 * Sem nada de Deno aqui dentro: é função pura, para rodar na suíte.
 */

/** Calibração oficial = não é rascunho. Espelho de `ehOficial`. */
export function calibracaoOficial(c: unknown): boolean {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  return (c as { status?: unknown }).status !== 'rascunho';
}

/** Relatório em rascunho — espelho de `ehRascunho` (`relatorios/tipos.ts`). */
export function relatorioEmRascunho(r: unknown): boolean {
  return !!r && typeof r === 'object' && (r as { status?: unknown }).status === 'Rascunho';
}

function lerJson(valor: string): unknown {
  try {
    return JSON.parse(valor);
  } catch {
    return undefined;
  }
}

/**
 * O valor que o Portal pode receber para `chave`, ou `null` para NÃO entregar a
 * chave. Só mexe nas famílias que carregam rascunho; o resto passa intacto (os
 * mesmos bytes).
 *
 * Nas famílias que carregam rascunho, valor ilegível é recusado (`null`): sem
 * conseguir ler, não há como provar que não há rascunho dentro.
 */
export function sanearParaPortal(chave: string, valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null;

  // Livro em rascunho: nunca é do Portal (também está em FORA_DO_PORTAL).
  if (chave.startsWith('nr13_livro_rascunho_')) return null;

  // A lista de calibrações do equipamento: sai só o que é oficial.
  if (chave.startsWith('nr13_calibracoes_')) {
    const lista = lerJson(valor);
    if (!Array.isArray(lista)) return null;
    const oficiais = lista.filter(calibracaoOficial);
    return oficiais.length === lista.length ? valor : JSON.stringify(oficiais);
  }

  // O registro de UM relatório (sob demanda): rascunho não é documento.
  if (chave.startsWith('nr13_rel_')) {
    const r = lerJson(valor);
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    return relatorioEmRascunho(r) ? null : valor;
  }

  // O índice já nasce sem rascunho (Fase 10B.1); aqui é a segunda camada.
  if (chave.startsWith('nr13_historico_indice_')) {
    const lista = lerJson(valor);
    if (!Array.isArray(lista)) return null;
    const finalizados = lista.filter((i) => !relatorioEmRascunho(i));
    return finalizados.length === lista.length ? valor : JSON.stringify(finalizados);
  }

  return valor;
}
