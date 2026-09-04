import type { ItemCatalogo } from './buscaIndex';

/**
 * Fase 10A · o recorte que `/prontuarios` e `/calibracoes` fazem sobre o
 * catálogo de equipamentos.
 *
 * ## O pedido, e a armadilha dentro dele
 *
 * "Listar os prontuários, não todo equipamento com 'Sem Prontuário'." E, em
 * calibrações: "não poluir com '0 Calibrações'." As duas telas continuam sendo
 * POR EQUIPAMENTO — o que muda é que quem comprovadamente não tem o documento
 * sai da lista por padrão.
 *
 * A armadilha é o `null`. A projeção responde com três valores, e eles não são
 * dois: `true`/`n > 0` = tem, `false`/`0` = não tem, **`null` = ninguém
 * contou** (projeção ainda não refeita para aquela organização). Esconder o
 * `null` seria afirmar uma ausência que não foi medida — e o prontuário some da
 * tela de quem o tem. Por isso o recorte tira apenas o valor MEDIDO como
 * ausente.
 *
 * ## Por que o recorte é do cliente
 *
 * `buscar_equipamentos` não tem parâmetro para "só com prontuário", "só com
 * calibração" nem para cliente. Passar a filtrar no servidor é coluna/índice
 * novos — registrado como continuação. Enquanto isso o recorte é feito aqui,
 * sobre as páginas já trazidas, e a tela DIZ quando não pôde varrer o parque
 * inteiro. Filtro que esconde linha calado é o mesmo relato de dado sumido, com
 * outro nome.
 */
export interface RecorteCatalogo {
  /** Padrão das duas telas: esconder quem comprovadamente não tem o documento. */
  soComDocumento: boolean;
  /** Nome exato do cliente, como vem em `clienteNome`. Vazio = todos. */
  empresa: string;
}

export const RECORTE_PADRAO: RecorteCatalogo = { soComDocumento: true, empresa: '' };

/** Páginas de catálogo que a tela varre quando há recorte ligado. */
export const TETO_PAGINAS_RECORTE = 20;

/**
 * O equipamento tem o documento?
 *
 * `null`/`undefined` respondem **`true`**: "não contado" não é "não tem", e a
 * diferença entre as duas coisas é o que decide se um equipamento aparece na
 * tela do usuário.
 */
export function possuiDocumento(valor: boolean | number | null | undefined): boolean {
  if (valor === null || valor === undefined) return true;
  return typeof valor === 'number' ? valor > 0 : valor;
}

export function filtrarCatalogo<T extends Pick<ItemCatalogo, 'clienteNome'>>(
  itens: T[],
  recorte: RecorteCatalogo,
  documentoDe: (item: T) => boolean | number | null | undefined,
): T[] {
  return itens.filter((i) => {
    if (recorte.soComDocumento && !possuiDocumento(documentoDe(i))) return false;
    if (recorte.empresa && (i.clienteNome ?? '').trim() !== recorte.empresa) return false;
    return true;
  });
}

/** Nomes de cliente distintos, ordenados — o que o `<select>` oferece. */
export function empresasDoCatalogo(itens: Pick<ItemCatalogo, 'clienteNome'>[]): string[] {
  const nomes = new Set<string>();
  for (const i of itens) {
    const n = i.clienteNome?.trim();
    if (n) nomes.add(n);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Um recorte do cliente só pode ser lido como resposta se a lista estiver
 * inteira: filtrar a primeira página anunciaria "2 prontuários" a quem tem 30.
 * Enquanto houver recorte ligado e páginas por vir, a tela continua puxando.
 */
export function precisaVarrerTudo(recorte: RecorteCatalogo): boolean {
  return recorte.soComDocumento || !!recorte.empresa;
}
