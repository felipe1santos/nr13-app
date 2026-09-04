import { ler, salvar } from '../../services/storage';
import { lacrarEntrada, ultimaLacrada, type LivroEntrada } from '../relatorios/livroLacre';

/**
 * Fase 10B.2 · o REGISTRO EM RASCUNHO do Livro de Segurança.
 *
 * ## A decisão, e é a mesma da 10B.1
 *
 * O rascunho **não entra em `nr13_livro_<TAG>`**. Aquela chave é lida por três
 * consumidores que só podem enxergar registro oficial:
 *
 *  1. **a projeção** (`busca_manutencao.sql`) conta
 *     `jsonb_array_length` da chave e grava em `equipamentos_index.livro_entradas`
 *     — é o número que a lista da 9F.4 mostra. Um rascunho ali viraria
 *     "3 registros" onde há 2;
 *  2. **o Portal do Cliente**, que lê `nr13_livro_<TAG>` direto;
 *  3. **a folha impressa** `LIVRO-REGISTRO.html`, que é documento legal.
 *
 * Nenhum dos três precisou de filtro novo — e dois deles nem poderiam ganhar um
 * agora: a projeção é SQL, e o SQL Editor do Supabase segue sem abrir. Manter o
 * rascunho fora da chave resolve os três de uma vez, no cliente.
 *
 * ## E a cadeia de integridade
 *
 * `livro_imutavel.sql` exige que a sequência de entradas LACRADAS do valor novo
 * comece exatamente pela do valor antigo. Por isso trancar **acrescenta ao FIM**
 * do array e nunca reordena: a cadeia é uma sequência de LACRES, não de datas. A
 * tela ordena por data para exibir; o array guarda a ordem em que os registros
 * foram trancados, que é a única ordem que a cadeia pode ter.
 */
export const PREFIXO_RASCUNHO_LIVRO = 'nr13_livro_rascunho_';

export function chaveRascunhoLivro(tag: string): string {
  return `${PREFIXO_RASCUNHO_LIVRO}${tag}`;
}

export function chaveLivro(tag: string): string {
  return `nr13_livro_${tag}`;
}

export function listarRascunhosLivro(tag: string): LivroEntrada[] {
  const lista = ler<LivroEntrada[]>(chaveRascunhoLivro(tag));
  if (!Array.isArray(lista)) return [];
  return lista.filter((e) => e && typeof e.id === 'string');
}

/** Grava (ou substitui) um rascunho. Continua editável — nada é lacrado aqui. */
export async function salvarRascunhoLivro(tag: string, entrada: LivroEntrada): Promise<void> {
  const registro: LivroEntrada = {
    ...entrada,
    estado: 'rascunho',
    // Um rascunho não tem lacre. Se alguém passar um objeto que já teve, os
    // campos saem: hash de rascunho seria uma promessa que o registro não faz.
    sha256: undefined,
    shaAnterior: undefined,
    lacradaEm: undefined,
    lacrado: false,
    atualizadoEm: new Date().toISOString(),
  };
  const resto = listarRascunhosLivro(tag).filter((e) => e.id !== registro.id);
  await salvar(chaveRascunhoLivro(tag), [...resto, registro]);
}

export async function excluirRascunhoLivro(tag: string, id: string): Promise<void> {
  const resto = listarRascunhosLivro(tag).filter((e) => e.id !== id);
  await salvar(chaveRascunhoLivro(tag), resto);
}

export class ErroTrancarRegistro extends Error {}

/**
 * TRANCAR: lacra o rascunho, acrescenta ao livro oficial e o tira dos rascunhos.
 *
 * A ordem importa e é a mesma disciplina do §7-quater: o livro oficial é gravado
 * PRIMEIRO. Se a segunda gravação falhar, o registro existe trancado e sobra um
 * rascunho órfão — feio, e visível. A ordem inversa perderia o registro.
 *
 * Depois disto não há caminho de volta: a entrada tem hash, está encadeada na
 * anterior, e o gatilho do banco (`livro_imutavel.sql`) recusa qualquer valor
 * novo cuja sequência lacrada não comece pela atual.
 */
export async function trancarRegistroLivro(tag: string, id: string): Promise<LivroEntrada> {
  const rascunho = listarRascunhosLivro(tag).find((e) => e.id === id);
  if (!rascunho) throw new ErroTrancarRegistro('Rascunho não encontrado.');

  const livro = ler<LivroEntrada[]>(chaveLivro(tag)) ?? [];
  if (livro.some((e) => e.id === id)) {
    // Já trancado numa tentativa anterior que falhou depois de gravar o livro:
    // limpa o rascunho e devolve o que já existe, em vez de duplicar o registro.
    await excluirRascunhoLivro(tag, id);
    return livro.find((e) => e.id === id)!;
  }

  // `estado: 'trancado'` entra ANTES do lacre, de propósito: assim ele faz parte
  // do conteúdo hasheado. Marcar depois deixaria o estado fora da prova.
  const paraLacrar: LivroEntrada = {
    ...rascunho,
    estado: 'trancado',
    lacrado: true,
    trancadoEm: new Date().toISOString(),
    atualizadoEm: undefined,
  };
  const lacrada = await lacrarEntrada(paraLacrar, ultimaLacrada(livro));

  // ACRESCENTA AO FIM. Não ordenar é requisito da cadeia e do gatilho do banco.
  await salvar(chaveLivro(tag), [...livro, lacrada]);
  await excluirRascunhoLivro(tag, id);
  return lacrada;
}
