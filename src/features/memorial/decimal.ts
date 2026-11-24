/**
 * VÍRGULA DECIMAL nos campos numéricos (23/11/2026).
 *
 * `<input type="number">` descarta a vírgula digitada no teclado brasileiro:
 * "1,1" virava 11 — dez vezes a pressão de projeto no memorial. Os campos
 * decimais do sistema são TEXTO com teclado decimal; a tela mostra o que se
 * digitou e o valor entregue ao formulário vai com ponto.
 */

/** Só dígitos, UM separador decimal (vírgula ou ponto) e o sinal no início. */
export function limparDecimal(t: string): string {
  let s = t.replace(/[^\d.,-]/g, '').replace(/(?!^)-/g, '');
  const i = s.search(/[.,]/);
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '');
  return s;
}

/** "1,1" → "1.1"; "1," → "1." (o `Number` lê 1, e a tela segue mostrando "1,"). */
export function paraPonto(t: string): string {
  return t.replace(',', '.');
}

/** O texto que a tela deve manter quando o valor de fora muda (ou não). */
export function textoSincronizado(atual: string, valorDeFora: string): string {
  return paraPonto(atual) !== '' && Number(paraPonto(atual)) === Number(valorDeFora) ? atual : valorDeFora.replace('.', ',');
}
