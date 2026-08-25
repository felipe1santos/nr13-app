/**
 * Fase 9 · 9E — a resposta OFFLINE de `/relatorios`.
 *
 * A política aprovada (desenho §16) é estreita de propósito, e as duas metades
 * importam:
 *
 *   · **não baixar o histórico da organização** para oferecer offline. Trocar
 *     uma falha de rede por "traga 10.000 relatórios" é o defeito, não o
 *     remédio;
 *   · **não mostrar vazio falso.** Lista vazia é uma AFIRMAÇÃO — "não há
 *     relatórios" — e foi exatamente a mentira que a prova offline da 9D pegou
 *     no Dashboard.
 *
 * Entre as duas sobra um caminho honesto: responder com os **metadados que já
 * estão neste aparelho**, e dizer que é isso que se está mostrando. As chaves
 * `nr13_historico_indice_<TAG>` são o índice LEVE do §7-sexies — já vieram no
 * boot ou ao abrir o equipamento, e ler o que já está no cache não custa rede
 * nenhuma.
 *
 * O filtro aqui é em memória, e isso NÃO contradiz "a busca é server-side": o
 * caminho online nunca passa por aqui. Este é o modo degradado, sobre o
 * subconjunto que o aparelho já tem — e ele se anuncia como tal.
 */
import { ler, listarChavesComPrefixo } from './storage';
import type { RelatorioIndiceItem } from '../features/relatorios/tipos';
import type { FiltrosRelatorios, ItemRelatorio } from './buscaRelatorios';

const PREFIXO = 'nr13_historico_indice_';

/** `DD/MM/AAAA` (como o índice guarda) → `AAAA-MM-DD` (como a projeção usa). */
export function paraIso(br: string | null | undefined): string | null {
  if (!br) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Já pode vir ISO em registro mais novo.
  return /^\d{4}-\d{2}-\d{2}/.test(br.trim()) ? br.trim().slice(0, 10) : null;
}

function daIndice(r: RelatorioIndiceItem, tag: string): ItemRelatorio {
  return {
    relatorioId: r.id,
    tag: r.tagVaso || tag,
    codigo: r.codigo ?? null,
    nome: r.nome ?? null,
    tipo: r.tipo ?? null,
    status: r.status ?? null,
    profissional: null,
    emissao: paraIso(r.emissao),
    validade: paraIso(r.validade),
    execucaoInspecao: paraIso(r.execucaoInspecao),
    proximaInterna: paraIso(r.proximaInspecaoInterna),
    proximaExterna: paraIso(r.proximaInspecaoExterna),
    // A referência do artefato, quando o índice a tem. O ARQUIVO continua
    // fora: offline, abrir o PDF depende de ele já estar no cache de arquivos,
    // e quem resolve isso é `artefatoRelatorio` — não esta função.
    pdfRef: r.pdfRef ? String((r.pdfRef as { caminho?: string }).caminho ?? '') || null : null,
    sha256: null,
    paginas: null,
    sourceVersion: 0,
  };
}

/** Casa o termo do usuário contra os campos que a busca online pesquisa. */
function casaTermo(item: ItemRelatorio, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  // Os mesmos campos do vetor do servidor — inclusive o código só com dígitos,
  // porque o usuário digita o número que enxerga no papel.
  const digitos = (item.codigo ?? '').replace(/\D/g, '');
  const alvos = [item.tag, item.codigo, item.nome, digitos];
  const soDigitos = t.replace(/\D/g, '');
  return alvos.some(
    (a) =>
      (a ?? '').toLowerCase().includes(t) ||
      (soDigitos !== '' && (a ?? '').replace(/\D/g, '').includes(soDigitos)),
  );
}

function casaFiltros(item: ItemRelatorio, f: FiltrosRelatorios): boolean {
  if (f.tipo && item.tipo !== f.tipo) return false;
  // Relatório sem data fica FORA de um período escolhido — a data-sentinela é
  // mecanismo de ordenação, não um fato sobre o documento.
  if (f.de && (!item.emissao || item.emissao < f.de)) return false;
  if (f.ate && (!item.emissao || item.emissao > f.ate)) return false;
  return casaTermo(item, f.termo ?? '');
}

/** Ordena como o banco: data desc e, no empate, id desc byte a byte. */
function ordenar(a: ItemRelatorio, b: ItemRelatorio): number {
  const da = a.emissao ?? '0001-01-01';
  const db = b.emissao ?? '0001-01-01';
  if (da !== db) return da < db ? 1 : -1;
  return a.relatorioId < b.relatorioId ? 1 : a.relatorioId > b.relatorioId ? -1 : 0;
}

/**
 * Todos os relatórios que ESTE APARELHO já conhece, filtrados.
 *
 * Não faz rede. Devolve lista vazia quando o cache não tem nada — e quem chama
 * precisa distinguir "não há relatórios" de "este aparelho não os tem", que é a
 * diferença entre informar e mentir.
 */
export function relatoriosLocais(filtros: FiltrosRelatorios = {}): ItemRelatorio[] {
  const itens: ItemRelatorio[] = [];

  for (const chave of listarChavesComPrefixo(PREFIXO)) {
    const tag = chave.slice(PREFIXO.length);
    const lista = ler<RelatorioIndiceItem[]>(chave);
    if (!Array.isArray(lista)) continue;
    for (const r of lista) {
      if (!r?.id) continue;
      const item = daIndice(r, tag);
      if (casaFiltros(item, filtros)) itens.push(item);
    }
  }

  return itens.sort(ordenar);
}

/** Quantos o aparelho conhece com este filtro. Sempre exato — é local. */
export function contarLocais(filtros: FiltrosRelatorios = {}): number {
  return relatoriosLocais(filtros).length;
}
