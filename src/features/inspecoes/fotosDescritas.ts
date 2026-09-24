/**
 * FOTO COM DESCRIÇÃO INDIVIDUAL — o modelo compartilhado (Fase 5, 24/09/2026).
 *
 * ## O defeito que este módulo fecha
 *
 * As quatro grades de foto dos formulários (checklist ×2, visual externo,
 * visual interno, TH) guardavam `{ ref, descricao }[]` e identificavam cada
 * foto pela POSIÇÃO: `key={idx}` no React e `fotos[i] = {...}` para editar a
 * legenda. A descrição era, na prática, "a legenda da posição 2", não "a
 * legenda desta foto". Remover a primeira foto com a legenda da segunda sendo
 * digitada, ou um merge da Sync V2 que reordenasse o array, trocava a legenda
 * de foto — e ninguém via.
 *
 * ## A regra
 *
 * - Toda foto tem `id` ESTÁVEL. Foto nova nasce com `foto-<uuid>`. Foto
 *   antiga (sem id) ganha um id DERIVADO do caminho no bucket (`ref.path`, que
 *   já é um uuid imutável), então o mesmo registro dá o mesmo id em qualquer
 *   aparelho, sem regravar nada. Só a legada em base64 sem caminho recebe um
 *   id posicional — e ele passa a ser gravado na primeira edição.
 * - A descrição mora NO OBJETO da foto e é editada por `id`, nunca por índice.
 * - A ordem é EXPLÍCITA: `ordem` (0, 1, 2…) gravado em cada foto, e o array é
 *   mantido ordenado por ela. Os dois juntos, de propósito: os templates HTML
 *   e o motor vetorial leem o ARRAY na ordem em que ele está, e não sabem de
 *   `ordem`; quem lê por `ordem` (este módulo) sobrevive a um array que chegou
 *   embaralhado de um merge.
 * - "Foto 01" é DERIVADO da posição na ordem — nunca gravado. Mover uma foto
 *   renumera todas, que é o que o leitor do documento espera.
 * - Remover tira a REFERÊNCIA da lista. Não apaga o arquivo no bucket nem no
 *   cofre: é a mesma política que a ficha (`fichaNaoApaga.test.ts`) e os
 *   formulários sempre seguiram. `services/fotos.removerFoto` (que apaga) não
 *   tem chamador em produção e continua sem ter — um rascunho duplicado ou um
 *   relatório já emitido pode citar o mesmo caminho.
 *
 * ## O que NÃO muda
 *
 * O formato persistido continua sendo o de sempre, com dois campos a mais:
 * `{ id, ordem, ref, descricao }`. Os templates e o gerador vetorial ignoram
 * campo desconhecido, então um container antigo abre igual, e um container
 * novo abre igual num bundle antigo. Nada é migrado: a normalização acontece
 * NA LEITURA e só vai para o storage quando o técnico edita.
 */
import type { RefFoto } from '../../services/fotos';

export interface FotoDescrita {
  /** Identidade estável da foto. Nunca a posição. */
  id: string;
  /** Posição explícita (0 = primeira). O array é mantido ordenado por ela. */
  ordem: number;
  ref?: RefFoto;
  /** LEGADO (antes de 10/08/2026): a imagem inteira em dataURL. */
  base64?: string;
  descricao: string;
}

/** O que chega do storage: qualquer versão já gravada de uma foto de campo. */
export interface FotoBrutaCampo {
  id?: unknown;
  ordem?: unknown;
  ref?: RefFoto;
  base64?: string;
  descricao?: unknown;
}

export function novoIdFoto(): string {
  return `foto-${crypto.randomUUID()}`;
}

/**
 * Id de uma foto antiga, sem gravar nada.
 *
 * Do caminho no bucket quando existe (é um uuid e não muda nunca), e da
 * posição só para a legada em base64 — que não tem outra identidade.
 */
function idDerivado(f: FotoBrutaCampo, posicao: number): string {
  if (f.ref?.path) return `ref:${f.ref.path}`;
  return `legado-${posicao}`;
}

/**
 * A lista como ela deve ser usada: com id, ordem, descrição em texto e
 * ordenada. Idempotente — normalizar uma lista normalizada não muda nada.
 *
 * Empate ou `ordem` ausente cai na posição do array, que é a ordem que a
 * lista sempre teve. Ids repetidos (duas cópias do mesmo registro vindas de um
 * merge) ficam com a primeira ocorrência: exibir a mesma foto duas vezes, com
 * a mesma legenda, não é informação.
 */
export function normalizarFotos(lista: unknown): FotoDescrita[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  const comChave = lista
    .filter((f): f is FotoBrutaCampo => typeof f === 'object' && f !== null)
    .map((f, posicao) => {
      const id = typeof f.id === 'string' && f.id !== '' ? f.id : idDerivado(f, posicao);
      const ordem = typeof f.ordem === 'number' && Number.isFinite(f.ordem) ? f.ordem : posicao;
      return { f, id, ordem, posicao };
    })
    .filter(({ id }) => {
      if (vistas.has(id)) return false;
      vistas.add(id);
      return true;
    })
    .sort((a, b) => a.ordem - b.ordem || a.posicao - b.posicao);

  return comChave.map(({ f, id }, i) => {
    const foto: FotoDescrita = {
      id,
      ordem: i,
      descricao: typeof f.descricao === 'string' ? f.descricao : '',
    };
    if (f.ref) foto.ref = f.ref;
    if (typeof f.base64 === 'string' && f.base64 !== '') foto.base64 = f.base64;
    return foto;
  });
}

/** Reescreve `ordem` pela posição — depois de qualquer operação que a mude. */
function renumerar(lista: FotoDescrita[]): FotoDescrita[] {
  return lista.map((f, i) => (f.ordem === i ? f : { ...f, ordem: i }));
}

export function adicionarFotos(lista: FotoDescrita[], refs: RefFoto[]): FotoDescrita[] {
  const base = normalizarFotos(lista);
  return renumerar([...base, ...refs.map((ref) => ({ id: novoIdFoto(), ordem: 0, ref, descricao: '' }))]);
}

export function definirDescricao(lista: FotoDescrita[], id: string, descricao: string): FotoDescrita[] {
  return normalizarFotos(lista).map((f) => (f.id === id ? { ...f, descricao } : f));
}

/**
 * Move uma foto uma posição para cima (`-1`) ou para baixo (`+1`).
 * Fora dos limites devolve a lista como estava.
 */
export function moverFoto(lista: FotoDescrita[], id: string, delta: -1 | 1): FotoDescrita[] {
  const base = normalizarFotos(lista);
  const i = base.findIndex((f) => f.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= base.length) return base;
  const nova = [...base];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return renumerar(nova);
}

/**
 * Tira a foto da LISTA. O arquivo fica no bucket e no cofre (ver o topo).
 */
export function removerDaLista(lista: FotoDescrita[], id: string): FotoDescrita[] {
  return renumerar(normalizarFotos(lista).filter((f) => f.id !== id));
}

/** "Foto 01", "Foto 02"… — da posição na ordem, nunca gravado. */
export function rotuloFoto(posicao: number): string {
  return `Foto ${String(posicao + 1).padStart(2, '0')}`;
}

export interface PendenciaFoto {
  id: string | null;
  mensagem: string;
}

/**
 * O que impede EMITIR um documento feito só de fotos descritas.
 *
 * O rascunho pode ficar incompleto: nada aqui bloqueia salvar. Só a emissão
 * (baixar / imprimir o documento) exige ao menos uma foto e todas descritas —
 * descrição só com espaços conta como vazia. Regra NOVA, do Relatório de
 * Imagens: os ensaios antigos não passam por ela (não é retroativa).
 */
export function pendenciasParaEmissao(lista: unknown): PendenciaFoto[] {
  const fotos = normalizarFotos(lista);
  if (fotos.length === 0) return [{ id: null, mensagem: 'Adicione ao menos uma imagem.' }];
  return fotos
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.descricao.trim() === '')
    .map(({ f, i }) => ({ id: f.id, mensagem: `${rotuloFoto(i)} está sem descrição.` }));
}
