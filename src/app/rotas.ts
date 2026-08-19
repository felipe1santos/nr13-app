/**
 * Construtores das rotas que levam a TAG (ou o id do container) no CAMINHO.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 *
 * Bug reproduzido em produção em 19/08/2026: a TAG ia crua para a URL, por
 * interpolação, em 11 lugares diferentes. Um equipamento com barra na TAG —
 * `COMPRESSOR V8-15/200L`, que é o modelo estampado na placa do compressor —
 * virava `/equipamento/COMPRESSOR%20V8-15/200L`: o navegador codifica o espaço
 * sozinho, mas NUNCA a barra, porque para ele barra é separador de caminho.
 *
 * `:tag` casa UM segmento. Com dois, nenhuma rota casa, o react-router levanta
 * o erro 404 e o `errorElement` do router.tsx pinta "Ocorreu um erro
 * inesperado". Da conta afetada, 2 dos 3 equipamentos eram inalcançáveis — a
 * ficha, o memorial, as inspeções, tudo. Não havia erro de servidor nenhum:
 * a requisição jamais chegou a existir.
 *
 * `#` corta a URL na âncora e `%` solto quebra a decodificação. `encodeURIComponent`
 * resolve os três, e resolve para os equipamentos QUE JÁ EXISTEM — a TAG volta
 * decodificada em `useParams`, então nenhum dado precisa ser migrado nem
 * renomeado.
 *
 * ── POR QUE UM MÓDULO, E NÃO `encodeURIComponent` NA MÃO EM CADA LUGAR ──────
 *
 * Porque a correção espalhada some. Eram 11 pontos de navegação; o 12º nasce
 * na próxima tela e ninguém lembra do detalhe. Aqui a regra tem um lugar só, e
 * `rotas.test.ts` casa a saída destes construtores contra as MESMAS strings de
 * rota do `router.tsx`.
 *
 * Nada de codificar o caminho inteiro: `encodeURI` NÃO escapa `/`, que é
 * justamente o caractere do defeito. Codifica-se cada segmento.
 */

const seg = (valor: string) => encodeURIComponent(valor);

/** Ficha do equipamento — `/equipamento/:tag`. */
export function rotaEquipamento(tag: string): string {
  return `/equipamento/${seg(tag)}`;
}

/** Memorial de cálculo — `/equipamento/:tag/memorial`. */
export function rotaMemorial(tag: string): string {
  return `/equipamento/${seg(tag)}/memorial`;
}

/** Container de inspeção — `/inspecoes/:tag/:containerId`. */
export function rotaInspecaoContainer(tag: string, containerId: string): string {
  return `/inspecoes/${seg(tag)}/${seg(containerId)}`;
}

/**
 * Formulário de inspeção — `/inspecoes/:tag/:containerId/:formulario`.
 *
 * `origem` vira query (`?origem=…`), fora dos segmentos: é ela que faz o botão
 * "voltar" do formulário devolver o usuário à ficha em vez do container.
 */
export function rotaInspecaoFormulario(
  tag: string,
  containerId: string,
  formulario: string,
  origem?: string,
): string {
  const base = `/inspecoes/${seg(tag)}/${seg(containerId)}/${seg(formulario)}`;
  return origem ? `${base}?origem=${encodeURIComponent(origem)}` : base;
}

/** Ativo no Portal do Cliente — `/portal/ativo/:tag`. */
export function rotaPortalAtivo(tag: string): string {
  return `/portal/ativo/${seg(tag)}`;
}

/**
 * Lista de inspeções, opcionalmente filtrada por equipamento —
 * `/inspecoes?tag=…`.
 *
 * Aqui a TAG vai na QUERY, não no caminho, então a barra é inofensiva — mas
 * `&` e `#` cortariam o parâmetro. Mesma codificação, mesmo motivo.
 */
export function rotaInspecoes(tag?: string): string {
  return tag ? `/inspecoes?tag=${encodeURIComponent(tag)}` : '/inspecoes';
}
