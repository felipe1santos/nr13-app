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

/**
 * Caractere recusado na TAG NOVA: os dois separadores de caminho.
 *
 * A barra é o caractere do defeito de 19/08/2026 — TAG com `/` virava dois
 * segmentos de URL e a ficha caía em "Ocorreu um erro inesperado". A barra
 * invertida entra junto porque o navegador a CONVERTE em barra ao normalizar a
 * URL: proibir uma e liberar a outra deixaria a porta aberta pelo lado que
 * ninguém lembra de testar.
 *
 * A rota já codifica os dois desde `src/app/rotas.ts`, então isto não é o que
 * conserta o defeito — é decisão do dono do produto de manter TAG nova simples.
 * Por isso vale só na CRIAÇÃO e na IMPORTAÇÃO: equipamento que já existe com
 * barra continua funcionando, abrindo e imprimindo. Bloquear o que já está
 * cadastrado tornaria a ficha inalcançável de novo, agora de propósito.
 */
const PROIBIDOS = ['/', '\\'];

/**
 * Devolve a mensagem para o usuário, ou `null` se a TAG serve.
 *
 * Vazio devolve `null`: quem chama já tem mensagem própria para "informe a
 * TAG", e duas mensagens para a mesma falha confundem mais que ajudam.
 */
export function motivoTagInvalida(tag: string): string | null {
  const achados = PROIBIDOS.filter((c) => tag.includes(c));
  if (achados.length === 0) return null;
  return `A TAG não pode conter ${achados.map((c) => `"${c}"`).join(' nem ')}. Use traço ou espaço no lugar (ex.: V8-15-200L).`;
}
