/**
 * O NOME DE EXIBIÇÃO do relatório — e só ele.
 *
 * ## O que este nome é, e o que ele não é
 *
 * É a etiqueta: o texto que aparece na lista, no histórico e no arquivo baixado.
 * **Não** é identidade. O `id` do registro continua sendo o código (`REL-…`), o
 * `sha256` continua sendo o hash dos bytes emitidos, e o `pdfRef` continua
 * apontando para o mesmo objeto no bucket. Trocar o nome não toca em nenhum dos
 * três — é a mesma regra que já valia para renomear um relatório salvo, tratada
 * como exceção explícita à trava de edição (§7-ter do CLAUDE.md).
 *
 * Por isso o nome pode ser escolhido pelo usuário no momento de finalizar: o
 * documento continua o mesmo documento, com a mesma rastreabilidade, mesmo que
 * a pasta dele se chame outra coisa.
 *
 * ## Por que uma função, e não um template solto
 *
 * A expressão estava escrita à mão em dois lugares de `Relatorios.tsx` (o nome
 * do arquivo baixado e o nome do registro). Dois lugares com a mesma regra é um
 * lugar a mais para divergirem — e o nome que aparece na lista precisa ser o
 * mesmo que sai no arquivo.
 */

/**
 * Caracteres que um nome de arquivo não pode ter em Windows, macOS ou Linux.
 *
 * Hífen e espaço ficam de FORA desta lista de propósito: toda TAG deste sistema
 * tem hífen (`ZZ-FASE3`, `V-101`), e tirá-lo faria o nome higienizado divergir
 * do nome que a lista mostra.
 */
const PROIBIDOS = /[\\/:*?"<>|]/g;

/**
 * O nome sugerido: `Relatorio_<Tipo>_<TAG>.pdf`.
 *
 * Os espaços do tipo viram `_` — "Relatorio_Inspeção Periódica_X.pdf" existe,
 * mas convida o navegador e o sistema de arquivos a encurtarem no espaço.
 */
export function nomeSugerido(tipoInspecao: string, tag: string): string {
  const tipo = (tipoInspecao || 'Inspecao').trim().replace(/\s+/g, '_');
  const t = (tag || 'SEM-TAG').trim();
  return `Relatorio_${tipo}_${t}.pdf`;
}

/**
 * Higieniza o que o usuário digitou.
 *
 * O que ela faz, e o motivo de cada regra:
 *
 * - tira barras, dois-pontos e afins — em `<a download>` uma barra é diretório,
 *   e o arquivo sairia com outro nome ou nem sairia;
 * - colapsa espaços e apara as pontas — nome terminando em espaço é inválido no
 *   Windows e vira um arquivo que não abre;
 * - garante a extensão `.pdf`, porque o arquivo É um PDF, e sem ela o sistema
 *   operacional não sabe com o que abrir;
 * - limita a 120 caracteres, contando a extensão. O limite real do sistema de
 *   arquivos é maior, mas o caminho inteiro conta, e um nome que só falha na
 *   máquina do cliente é pior do que um nome curto;
 * - **vazio devolve `null`**, e não um nome inventado: quem chama decide entre
 *   recusar e usar o sugerido. Gravar nome em branco deixaria a lista com uma
 *   linha sem identificação nenhuma.
 */
export function limparNomeDocumento(bruto: string): string | null {
  let n = (bruto ?? '').replace(PROIBIDOS, '').replace(/\s+/g, ' ').trim();
  // Ponto final é aparado antes de decidir a extensão: "meu relatório." não
  // pode virar "meu relatório..pdf".
  n = n.replace(/\.+$/, '').trim();
  if (n === '') return null;
  const semExt = /\.pdf$/i.test(n) ? n.slice(0, -4) : n;
  if (semExt.trim() === '') return null;
  const cortado = semExt.slice(0, 116).trim();
  if (cortado === '') return null;
  return `${cortado}.pdf`;
}

/**
 * O nome final, resolvido: o que o usuário escolheu, ou o sugerido.
 *
 * É o único ponto que decide — assim a lista, o registro e o arquivo baixado
 * não podem discordar.
 */
export function nomeDoDocumento(
  escolhido: string | null | undefined,
  tipoInspecao: string,
  tag: string,
): string {
  return limparNomeDocumento(escolhido ?? '') ?? nomeSugerido(tipoInspecao, tag);
}
