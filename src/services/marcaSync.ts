/**
 * Marca d'água da hidratação: até onde este aparelho já leu o servidor.
 *
 * POR QUE EXISTE: até 11/08/2026 todo boot pedia TODAS as linhas da
 * organização. Na conta `cmam.caldeiras` isso é 8 MB, na `teste@gmail.com` são
 * 14 MB — a cada abertura do app, várias vezes por dia, em 27 contas. Foi o que
 * levou o egress do projeto a 6,1 GB contra um limite de 5 GB, com restrição
 * marcada para 16/08. Guardando o instante da última linha lida, a segunda
 * abertura pede só o que mudou desde então.
 *
 * ONDE MORA, E POR QUÊ ISSO IMPORTA MAIS QUE O RESTO: na store `meta` do MESMO
 * IndexedDB que guarda o cache da organização. A marca precisa viver e morrer
 * junto com os dados. Se ela sobrevivesse a uma limpeza do cache — como
 * aconteceria no `localStorage` —, o app pediria "só o que mudou" tendo um
 * cache vazio, e as linhas antigas nunca mais chegariam. A conta abriria vazia,
 * que é exatamente o sumiço que este projeto inteiro existe para eliminar.
 *
 * Perder a marca é inofensivo (baixa tudo de novo, uma vez). Manter uma marca
 * sem os dados é catastrófico. Toda decisão aqui erra para o primeiro lado.
 */
import { aplicarAtomico, obter } from './db';

const CHAVE = 'sync_corte';

/**
 * Instante da linha mais recente já lida do servidor, no formato que o Postgres
 * devolve. `null` = nunca hidratou (ou o cache foi apagado) e o próximo boot
 * baixa tudo.
 */
export async function lerMarca(orgId: string): Promise<string | null> {
  try {
    const valor = await obter<string>(orgId, 'meta', CHAVE);
    return typeof valor === 'string' && valor.length > 0 ? valor : null;
  } catch {
    return null; // sem marca legível, baixa tudo: o lado seguro
  }
}

/**
 * Avança a marca. NUNCA retrocede: uma resposta fora de ordem não pode fazer o
 * aparelho re-pedir o que já tem, e o piso monotônico deixa o comportamento
 * previsível.
 */
export async function avancarMarca(orgId: string, atualizadoEm: string): Promise<void> {
  if (!atualizadoEm) return;
  const atual = await lerMarca(orgId);
  if (atual && atual >= atualizadoEm) return;
  try {
    await aplicarAtomico(orgId, [{ store: 'meta', acao: 'put', chave: CHAVE, valor: atualizadoEm }]);
  } catch {
    // Não gravou: o próximo boot baixa um pouco mais do que precisaria. Custa
    // banda, não correção.
  }
}

/** Zera a marca — força o próximo boot a reler tudo. */
export async function zerarMarca(orgId: string): Promise<void> {
  try {
    await aplicarAtomico(orgId, [{ store: 'meta', acao: 'delete', chave: CHAVE }]);
  } catch {
    // idem
  }
}
