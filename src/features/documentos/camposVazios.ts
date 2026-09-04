/**
 * Fase 12B · CAMPO VAZIO EM AMARELO — só na tela de edição.
 *
 * ## O que é
 *
 * Na referência oficial (`docs/referencias/relatorio-nr13.html`), campo ainda
 * não preenchido tem fundo `#FFF8C4`, e a impressão apaga esse fundo:
 *
 * ```css
 * .campo.vazio { background: #FFF8C4; }
 * @media print { .campo, .campo:focus { background: transparent !important; } }
 * ```
 *
 * A mesma ideia aqui: quem está montando o relatório bate o olho na folha e vê
 * o que falta, sem abrir campo por campo.
 *
 * ## O amarelo NÃO é conteúdo do documento
 *
 * Ele é **derivado**, sempre: `campo vazio` + `modo edição`. Nada é gravado —
 * não existe "cor" no dado, e por isso não há como um documento nascer amarelo.
 *
 * Três caminhos garantem isso, e os três são independentes:
 *
 * 1. **O PDF do modelo Novo não vem do DOM.** O gerador vetorial desenha a
 *    partir do modelo de dados; a marcação da tela não existe para ele.
 * 2. **Documento salvo não é marcado.** Com `ro=1` a folha está travada e não
 *    há o que preencher — marcar ali seria dizer que falta algo num documento
 *    fechado.
 * 3. **A impressão limpa antes de rasterizar.** `limparCamposVazios` roda no
 *    clone que o `html2canvas` fotografa, então nem o caminho de rollback leva
 *    amarelo para o papel.
 *
 * ## O amarelo não substitui validação
 *
 * Ele não bloqueia nada e não sabe o que é obrigatório. Quem barra a
 * finalização continua sendo a validação existente (`validarRelatorio`):
 * obrigatório faltando bloqueia, opcional faltando avisa. Cor é auxílio visual;
 * transformá-la em regra esconderia a regra.
 */

/** Classe aplicada ao campo vazio. Prefixada para não colidir com o template. */
export const CLASSE_VAZIO = 'nr13-campo-vazio';

/** Id da folha de estilo injetada na folha (iframe). */
const ID_ESTILO = 'nr13-estilo-campo-vazio';

/** O amarelo da referência. */
export const AMARELO_VAZIO = '#FFF8C4';

/**
 * O texto deste campo significa "vazio"?
 *
 * Os templates preenchem `--`, `-`, `--/--/----`, `--/----` quando o dado não
 * existe — cada folha com o seu traço. Em vez de listar as variantes, a regra
 * olha o que SOBRA depois de tirar traço, barra, ponto, espaço e sublinhado: se
 * não sobrou caractere nenhum, não há informação ali.
 *
 * `—` (travessão) e `–` (meia-risca) entram porque as folhas usam os dois.
 */
export function ehValorVazio(texto: string | null | undefined): boolean {
  const limpo = String(texto ?? '')
    .replace(/[\s ]/g, '')
    .replace(/[-–—_/.:]/g, '');
  return limpo === '';
}

/**
 * Marca (ou desmarca) os campos vazios de UMA folha.
 *
 * Só toca em `[contenteditable]`: nos templates de `public/arquivos-inspecao/`
 * é exatamente esse atributo que marca o que é campo de dado. Célula de
 * checkbox, rótulo e moldura não são editáveis e ficam de fora — que é o certo:
 * elas não estão "vazias", elas são desenho.
 */
export function marcarCamposVazios(doc: Document | null | undefined, ligado = true): number {
  if (!doc?.body) return 0;
  if (!ligado) {
    limparCamposVazios(doc);
    return 0;
  }
  garantirEstilo(doc);
  let marcados = 0;
  doc.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    // Um editável que contém outros elementos é um bloco de texto livre, não um
    // campo: pintar o container inteiro de amarelo cobriria conteúdo de verdade.
    const vazio = el.childElementCount === 0 && ehValorVazio(el.textContent);
    el.classList.toggle(CLASSE_VAZIO, vazio);
    if (vazio) marcados++;
  });
  return marcados;
}

/** Tira a marcação e o estilo — usado no clone que vai para a impressão/PDF. */
export function limparCamposVazios(doc: Document | null | undefined): void {
  if (!doc?.body) return;
  doc.querySelectorAll(`.${CLASSE_VAZIO}`).forEach((el) => el.classList.remove(CLASSE_VAZIO));
  doc.getElementById(ID_ESTILO)?.remove();
}

/**
 * A folha de estilo, injetada uma vez por documento.
 *
 * `@media print` também apaga o fundo: se o usuário der Ctrl+P direto na folha,
 * o papel sai limpo mesmo sem passar pelo caminho de impressão do app.
 */
function garantirEstilo(doc: Document): void {
  if (doc.getElementById(ID_ESTILO)) return;
  const estilo = doc.createElement('style');
  estilo.id = ID_ESTILO;
  estilo.textContent = `
    .${CLASSE_VAZIO} {
      background: ${AMARELO_VAZIO} !important;
      border-radius: 2px;
    }
    @media print {
      .${CLASSE_VAZIO} { background: transparent !important; }
    }
  `;
  (doc.head ?? doc.body).appendChild(estilo);
}

/**
 * Liga a marcação numa folha e mantém enquanto o usuário digita.
 *
 * Devolve a função que desfaz — sem ela, o listener sobreviveria à remontagem
 * dos iframes e ficaria escutando um documento que ninguém mais vê.
 */
export function acompanharCamposVazios(doc: Document | null | undefined): () => void {
  if (!doc?.body) return () => {};
  const atualizar = () => marcarCamposVazios(doc, true);
  atualizar();
  doc.addEventListener('input', atualizar, true);
  doc.addEventListener('blur', atualizar, true);
  return () => {
    doc.removeEventListener('input', atualizar, true);
    doc.removeEventListener('blur', atualizar, true);
    limparCamposVazios(doc);
  };
}
