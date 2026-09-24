import type { EmissaoProntuario } from './emissaoProntuario';
import type { ProntuarioFabricanteSalvo } from '../equipamento/ProntuarioFabricante';

/**
 * O PRONTUÁRIO VIGENTE DE UM EQUIPAMENTO (24/09/2026).
 *
 * Regra de produto: **1 equipamento = 1 prontuário NR-13 vigente**, venha ele
 * do sistema (gerado) ou do cliente (PDF existente anexado). A FICHA mostra um
 * slot só, e é esta função que decide o que vai nele.
 *
 * ## Resolver, não migrar
 *
 * Nada é regravado. Os documentos continuam onde sempre estiveram:
 *
 * - `nr13_pront_emitido_<TAG>` — lista append-only (Fase 12A + anexo da Fase 3),
 *   gerados e anexados juntos, em ordem de gravação. É o HISTÓRICO, e segue
 *   inteiro: nenhuma emissão sai da lista para o slot existir.
 * - `nr13_pront_fab_<TAG>` — o "Prontuário do Fabricante" (PDF enviado pela
 *   ficha antes do anexo existir). Auditado em produção em 24/09/2026: 8
 *   arquivos, e 7 deles são, pelo nome, o PRÓPRIO prontuário do equipamento —
 *   o slot que o cliente usou quando não havia outro. Entra aqui como LEGADO:
 *   só vale quando não há nenhuma emissão.
 *
 * ## Qual é o vigente
 *
 * O ÚLTIMO documento da lista de emissões, seja gerado ou anexado — é a ordem
 * em que foram gravados, e "o mais recente vale" é o que "nova versão"
 * significa. Hoje nenhum equipamento tem gerado E anexado ao mesmo tempo
 * (auditoria de 24/09), então a regra ainda não decidiu caso real nenhum; a
 * política definitiva (substituir / nova versão / arquivar) é decisão pendente.
 *
 * `outros` conta o que ficou para trás (revisões anteriores, anexos antigos, o
 * PDF do fabricante quando há emissão): a ficha diz que existe histórico, mas
 * não abre um segundo slot.
 */
export type OrigemVigente = 'gerado' | 'anexado' | 'fabricante';

export interface ProntuarioVigente {
  origem: OrigemVigente;
  /** Presente quando a origem é `gerado` ou `anexado`. */
  emissao?: EmissaoProntuario;
  /** Presente quando a origem é `fabricante` (legado). */
  fabricante?: ProntuarioFabricanteSalvo;
  /** Documentos que existem além do vigente — histórico, não concorrentes. */
  outros: number;
}

export const ROTULO_ORIGEM: Record<OrigemVigente, string> = {
  gerado: 'GERADO PELO SISTEMA',
  anexado: 'PDF ANEXADO',
  fabricante: 'PDF DO FABRICANTE',
};

export function resolverProntuarioVigente(
  emissoes: readonly EmissaoProntuario[],
  fabricante: ProntuarioFabricanteSalvo | null,
): ProntuarioVigente | null {
  if (emissoes.length > 0) {
    const emissao = emissoes[emissoes.length - 1];
    return {
      origem: emissao.origem === 'anexado' ? 'anexado' : 'gerado',
      emissao,
      outros: emissoes.length - 1 + (fabricante ? 1 : 0),
    };
  }
  if (fabricante) return { origem: 'fabricante', fabricante, outros: 0 };
  return null;
}
