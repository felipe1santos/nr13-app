/**
 * Lacre criptográfico das entradas do Livro de Registro de Segurança.
 *
 * ── POR QUE NÃO UM PDF POR ENTRADA ──────────────────────────────────────────
 * O relatório virou artefato: um PDF imutável no bucket. Aplicar o mesmo ao
 * livro seria caro do jeito errado, porque o livro é CUMULATIVO — congelar o
 * livro inteiro a cada inspeção cresce ao quadrado (10 inspeções = 10 PDFs, o
 * último com 10 páginas).
 *
 * E é desnecessário: a folha do livro daquela inspeção JÁ ESTÁ dentro do PDF do
 * relatório, que é imutável e tem hash. O que falta não é guardar o conteúdo de
 * novo — é provar que a ENTRADA não foi alterada depois de emitida.
 *
 * Custo deste desenho: ~180 bytes por entrada, nenhum arquivo, nenhuma
 * requisição nova. Vinte anos de inspeções anuais somam ~3,6 KB.
 *
 * ── O QUE O LACRE DETECTA ───────────────────────────────────────────────────
 * `sha256` sozinho pega EDIÇÃO. `shaAnterior` encadeia as entradas e pega
 * também REMOÇÃO e REORDENAÇÃO — não dá para tirar uma entrada do meio do livro
 * sem quebrar todas as seguintes. Num livro de registro de segurança isso não é
 * luxo: apagar uma inspeção ruim é exatamente a fraude que o livro existe para
 * impedir.
 *
 * ── COMPATIBILIDADE ─────────────────────────────────────────────────────────
 * Entrada sem `sha256` é ANTIGA, não adulterada. O livro tem anos de registros
 * anteriores a esta mudança, e acusá-los destruiria a confiança no selo. Eles
 * aparecem como `sem_lacre` e a cadeia os ignora.
 */

/** Reexportado do relatoriosService para o módulo não criar dependência circular. */
export interface LivroEntrada {
  id: string;
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
  phCrea: string;
  origem: 'auto' | 'manual';
  criadoEm: string;
  /**
   * Fase 10B.2 · o ESTADO do registro, explícito.
   *
   * Três valores, e o terceiro é o motivo de o campo existir:
   *   · `'trancado'` — registro oficial, lacrado, imutável;
   *   · `'rascunho'` — em edição. **Nunca aparece em `nr13_livro_<TAG>`**: o
   *     rascunho mora em chave própria (ver `rascunhosLivro.ts`);
   *   · **ausente** — registro ANTIGO, anterior a esta fase. É oficial.
   *
   * "Sem `sha256` = rascunho" seria a leitura errada e cara: o livro tem anos de
   * entradas anteriores ao lacre (12/08/2026) e entradas manuais que nunca foram
   * lacradas. Rebaixá-las a rascunho as tiraria da contagem oficial e do Portal
   * — apagaria registro de segurança de equipamento em operação.
   */
  estado?: 'rascunho' | 'trancado';
  [campo: string]: unknown;

  // ── Lacre (12/08/2026) ──
  /** SHA-256 do conteúdo canônico da entrada, hex. Ausente = entrada antiga. */
  sha256?: string;
  /** Hash da entrada lacrada anterior. `null` na primeira. É o elo da cadeia. */
  shaAnterior?: string | null;
  /** ISO do momento em que a entrada foi lacrada (emissão do relatório). */
  lacradaEm?: string;
}

/** Campos que NÃO entram no hash: são o próprio lacre. */
const CAMPOS_DO_LACRE = new Set(['sha256', 'shaAnterior', 'lacradaEm']);

/**
 * Serialização CANÔNICA: chaves ordenadas, recursivamente, sem os campos do
 * lacre. Sem isso, um `{...entrada}` que reordenasse as chaves mudaria o hash e
 * acusaria de adulterada uma entrada íntegra — o selo viraria ruído e o usuário
 * aprenderia a ignorá-lo, que é o pior desfecho de um alarme.
 */
function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const saida: Record<string, unknown> = {};
    for (const chave of Object.keys(obj).sort()) {
      if (CAMPOS_DO_LACRE.has(chave)) continue;
      if (obj[chave] === undefined) continue;
      saida[chave] = canonico(obj[chave]);
    }
    return saida;
  }
  return valor;
}

async function sha256Hex(texto: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle indisponível: o lacre do livro exige contexto seguro (https)');
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash do CONTEÚDO da entrada — sem os campos do próprio lacre. */
export async function hashDaEntrada(entrada: LivroEntrada): Promise<string> {
  return sha256Hex(JSON.stringify(canonico(entrada)));
}

/**
 * Lacra a entrada, encadeando-a na anterior. Chamada no momento em que o
 * relatório é SALVO — a partir daí a entrada é registro emitido.
 *
 * `anterior` = a última entrada JÁ LACRADA do livro, ou `null` se não houver
 * (livro novo, ou livro que só tem entradas antigas).
 */
export async function lacrarEntrada(
  entrada: LivroEntrada,
  anterior: LivroEntrada | null,
): Promise<LivroEntrada> {
  const base: LivroEntrada = {
    ...entrada,
    shaAnterior: anterior?.sha256 ?? null,
    lacradaEm: new Date().toISOString(),
  };
  return { ...base, sha256: await hashDaEntrada(base) };
}

export type VeredictoEntrada = 'integra' | 'adulterada' | 'sem_lacre';

/** A entrada ainda casa com o hash gravado na emissão? */
export async function verificarEntrada(entrada: LivroEntrada): Promise<VeredictoEntrada> {
  if (!entrada?.sha256) return 'sem_lacre';
  return (await hashDaEntrada(entrada)) === entrada.sha256 ? 'integra' : 'adulterada';
}

export interface ProblemaCadeia {
  id: string;
  motivo: 'adulterada' | 'elo_quebrado';
}

/**
 * Verifica o livro inteiro: cada entrada contra o próprio hash, e cada elo
 * contra a entrada lacrada anterior.
 *
 * Entradas antigas (sem lacre) são PULADAS sem virar problema, e não quebram o
 * elo das que vieram depois: numa migração real o livro tem as duas coisas.
 */
export async function verificarCadeia(
  entradas: LivroEntrada[],
): Promise<{ ok: boolean; problemas: ProblemaCadeia[] }> {
  const problemas: ProblemaCadeia[] = [];
  let ultimaLacrada: LivroEntrada | null = null;

  for (const entrada of entradas) {
    const veredicto = await verificarEntrada(entrada);
    if (veredicto === 'sem_lacre') continue;

    if (veredicto === 'adulterada') {
      problemas.push({ id: entrada.id, motivo: 'adulterada' });
      // Sem hash confiável, o elo desta entrada não serve de referência para a
      // próxima — mas ela ainda avança a cadeia, senão UMA edição espalharia
      // "elo_quebrado" por todo o resto do livro e o relatório de problemas
      // ficaria ilegível.
      ultimaLacrada = entrada;
      continue;
    }

    const esperado = ultimaLacrada?.sha256 ?? null;
    if ((entrada.shaAnterior ?? null) !== esperado) {
      problemas.push({ id: entrada.id, motivo: 'elo_quebrado' });
    }
    ultimaLacrada = entrada;
  }

  return { ok: problemas.length === 0, problemas };
}

/** A última entrada lacrada de um livro — o elo para a próxima. */
export function ultimaLacrada(entradas: LivroEntrada[]): LivroEntrada | null {
  for (let i = entradas.length - 1; i >= 0; i--) {
    if (entradas[i]?.sha256) return entradas[i];
  }
  return null;
}
