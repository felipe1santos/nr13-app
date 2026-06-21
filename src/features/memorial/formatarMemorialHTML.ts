// Mesmo formato que script.js gravava em nr13_calc_<TAG>.memorialHTML (linhas 1671-1681,
// 2517-2526, 2845-2852): NÃO renderiza o LaTeX aqui — só junta as linhas com <br> dentro de
// <div class="katex-render">, e quem renderiza o $$...$$ depois é o KaTeX auto-render embutido
// nos próprios templates de arquivos-inspecao/ (MEMORIAL1/2/3.html). Preservar verbatim esse
// contrato é o que faz os relatórios herdados continuarem funcionando sem tocar no design deles.
export function formatarMemorialHTML(log: string[]): string {
  const corpo = log
    .map((linha) => linha.replace(/^\/\/\s?/, '').replace(/==+/g, '<hr style="border:0; border-top:1px solid #eee; margin:10px 0;">'))
    .join('<br>');
  return `<div class="katex-render">${corpo}</div>`;
}
