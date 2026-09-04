import { listarPagina, type ItemCatalogo } from '../../services/buscaIndex';

/**
 * Fase 10A · o filtro por EMPRESA em `/relatorios`.
 *
 * ## Por que ele não é um parâmetro da consulta
 *
 * `relatorios_index` não guarda o cliente: a projeção da 9E foi desenhada em
 * cima do relatório, e o cliente pertence ao EQUIPAMENTO. Filtrar no servidor
 * exigiria coluna nova + reprojeção + índice — o caminho certo, e o que fica
 * registrado como continuação (`FASE-10-DESENHO.md`).
 *
 * O que dá para fazer sem SQL novo, e sem mentir: a projeção de EQUIPAMENTOS
 * (`equipamentos_index`) já traz `clienteNome` por TAG. Uma varredura dela dá o
 * mapa TAG → empresa, e o filtro passa a ser sobre a TAG de cada relatório.
 *
 * ## O preço, declarado
 *
 * O mapa custa uma requisição por 50 equipamentos, e só é buscado quando o
 * usuário ABRE o painel de filtros — abrir a tela continua custando o que
 * custava. Acima do teto o mapa volta `completo: false`, e a tela precisa DIZER
 * que o filtro pode não alcançar todo o parque. Filtro que esconde linha sem
 * avisar é a mesma queixa de dado sumido, com outro nome.
 */

/** Páginas de catálogo que a varredura aceita (50 equipamentos cada). */
export const TETO_PAGINAS_EMPRESAS = 20;

export interface MapaEmpresas {
  /** TAG → nome da empresa. TAG sem cliente simplesmente não está aqui. */
  porTag: Map<string, string>;
  /** Nomes distintos, ordenados — o que o `<select>` oferece. */
  empresas: string[];
  /** `false` = a varredura bateu no teto e o mapa pode estar incompleto. */
  completo: boolean;
}

export const MAPA_VAZIO: MapaEmpresas = { porTag: new Map(), empresas: [], completo: true };

/** Parte PURA: dobra as linhas do catálogo no mapa. Testada sem rede. */
export function montarMapaEmpresas(
  itens: Pick<ItemCatalogo, 'tag' | 'clienteNome'>[],
  completo = true,
): MapaEmpresas {
  const porTag = new Map<string, string>();
  for (const it of itens) {
    const nome = it.clienteNome?.trim();
    if (nome) porTag.set(it.tag, nome);
  }
  const empresas = [...new Set(porTag.values())].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
  );
  return { porTag, empresas, completo };
}

/**
 * Filtra por empresa. Relatório cuja TAG não está no mapa é EXCLUÍDO quando há
 * empresa escolhida — ele pertence a outra empresa ou a nenhuma, e nos dois
 * casos não é o que se pediu.
 */
export function filtrarPorEmpresa<T extends { tag: string }>(
  itens: T[],
  mapa: MapaEmpresas,
  empresa: string,
): T[] {
  if (!empresa) return itens;
  return itens.filter((i) => mapa.porTag.get(i.tag) === empresa);
}

/** Varre o catálogo de equipamentos e devolve o mapa. Uma requisição por página. */
export async function carregarEmpresasPorTag(sinal?: AbortSignal): Promise<MapaEmpresas> {
  const acumulado: Pick<ItemCatalogo, 'tag' | 'clienteNome'>[] = [];
  let cursor: string | null = null;
  let paginas = 0;
  let completo = true;

  for (;;) {
    const pagina = await listarPagina({}, cursor, sinal);
    acumulado.push(...pagina.itens);
    paginas++;
    if (!pagina.temMais || !pagina.proximoCursor) break;
    if (paginas >= TETO_PAGINAS_EMPRESAS) {
      completo = false;
      break;
    }
    cursor = pagina.proximoCursor;
  }

  return montarMapaEmpresas(acumulado, completo);
}
