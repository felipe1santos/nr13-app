/**
 * Normaliza a TAG digitada ou importada, ANTES de qualquer checagem.
 *
 * ── O QUE ISTO TIRA, E POR QUE ──────────────────────────────────────────────
 *
 * Só caractere INVISÍVEL. TAB e quebra de linha entram colados de célula do
 * Excel na importação de planilha; espaço-duro (NBSP) e largura-zero (ZWSP,
 * BOM) entram de copiar/colar de página web ou de PDF de fabricante.
 *
 * São silenciosos, e é isso que os torna caros: a TAG parece idêntica na tela,
 * mas `VP-01` e `VP-01<TAB>` são chaves DIFERENTES. O equipamento nasce
 * duplicado, a busca não acha, e a checagem de "TAG já cadastrada" deixa
 * passar. Some da URL também, e aí a ficha abre com a TAG truncada — vazia,
 * sem erro nenhum na tela.
 *
 * ── O QUE ISTO NÃO TIRA ─────────────────────────────────────────────────────
 *
 * Barra, `#`, `%`, acento, parênteses: tudo isso é nome legítimo de ativo
 * (`V8-15/200L` é o modelo estampado na placa do compressor) e a rota já os
 * codifica — ver `src/app/rotas.ts`. Remover aqui seria RENOMEAR o equipamento
 * do usuário pelas costas, num sistema que emite documento técnico assinado.
 *
 * Normalizar aqui, e não dentro de `criarEquipamento`, porque a TAG é usada
 * antes disso nas duas entradas: a tela confere "já existe uma TAG assim" e a
 * importação confere duplicidade dentro da planilha. Normalizar depois dessas
 * conferências deixaria a duplicata invisível passar exatamente pelo furo que
 * esta função fecha.
 */

/** Largura zero (ZWSP/ZWNJ/ZWJ/BOM): não contam como espaço para o regex. */
const LARGURA_ZERO = /[\u200B-\u200D\uFEFF]/g;

/**
 * Controle C0 + DEL — TAB, CR, LF e companhia. Viram ESPAÇO, não somem:
 * `VP<TAB>01` é "VP 01", não "VP01".
 */
const CONTROLE = /[\u0000-\u001F\u007F]/g;

export function normalizarTag(bruta: string): string {
  return bruta
    .replace(LARGURA_ZERO, '')
    .replace(CONTROLE, ' ')
    .replace(/\s+/g, ' ') // o \s do JS já cobre NBSP e os espaços tipográficos
    .trim()
    .toUpperCase();
}
