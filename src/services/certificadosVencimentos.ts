/**
 * Os certificados dos instrumentos PADRÃO no painel de vencimentos (07/09/2026).
 *
 * ## O defeito
 *
 * Um certificado de padrão cadastrado em **Certificados** (`nr13_rastreab_<id>`),
 * com PDF e validade dentro de 30 dias, **não aparecia em lugar nenhum** —
 * nem no Dashboard, nem em `/vencimentos`, nem nos contadores. A auditoria
 * achou a razão: nenhuma das duas fontes lia essa família. O caminho local
 * varria `nr13_info_` (equipamentos) e `nr13_calibracoes_` (acessórios); o
 * agregado do servidor (`vencimentos_org`) agrega `equipamentos_index` e
 * `calibracoes_index`, e certificado de padrão não está em projeção nenhuma.
 *
 * ## Por que uma leitura própria, e não uma coluna nova na projeção
 *
 * Certificado de padrão **não pertence a equipamento**: é da organização (um
 * por `tipoInstrumento` entre os ativos). Não cabe em `equipamentos_index` nem
 * em `calibracoes_index` — as duas são indexadas por TAG.
 *
 * ## O que esta leitura NÃO traz: o PDF
 *
 * `valor` guarda o registro COMPLETO no servidor — inclusive `pdfBase64`, que
 * o cache local nem chega a ver (§2-bis). Baixar `valor` inteiro para ler uma
 * data seria trazer megabytes de PDF por causa de um `validade`. A extração é
 * por CAMPO, feita pelo Postgres: chegam ao navegador cinco strings curtas por
 * certificado.
 */
import { supabase } from './supabase';
import { itemDeCertificado } from './vencimentos';
import type { ItemVencimento } from './vencimentos';

/** Prefixo da família. Um só lugar — o teste-gate compara com o do motor local. */
export const PREFIXO_RASTREAB = 'nr13_rastreab_';

/**
 * Teto de segurança da consulta. A família é pequena por construção (um
 * certificado ATIVO por tipo de instrumento, mais as versões substituídas do
 * soft-replace), mas o teto impede que um histórico grande vire uma resposta
 * grande sem ninguém perceber.
 */
export const LIMITE_CERTIFICADOS = 2_000;

/**
 * A função que faz a extração — `supabase/vencimentos_certificados.sql`.
 *
 * ## POR QUE UMA RPC, E NÃO `select=validade:valor->>"validade"`
 *
 * Foi assim que este módulo nasceu, e o PostgREST ACEITOU: HTTP 200, as linhas
 * certas, e TODOS os campos projetados em `null`. `app_storage.valor` é
 * `text`, não `json`; `->>` sobre texto não extrai nem reclama — devolve
 * vazio. Medido em produção (org 99f642d3, 07/09/2026): dois registros
 * `nr13_rastreab_` voltaram com nome, tipo e validade nulos, e o painel disse
 * "Nenhum prazo cadastrado" sobre um certificado que estava lá.
 *
 * Era a queixa original outra vez, com outra roupa. Na função o `::jsonb` é
 * explícito, o cast tem guarda contra registro corrompido, e o `pdfBase64`
 * continua sem sair do servidor.
 */
export const RPC_CERTIFICADOS = 'certificados_padrao_org';

interface LinhaCertificado {
  chave?: string | null;
  deletado_em?: string | null;
  nome?: string | null;
  tipo?: string | null;
  certificado?: string | null;
  validade?: string | null;
  /** Vem `substituido_em` da função; o campo camelCase é o do cache local. */
  substituido_em?: string | null;
  substituidoEm?: string | null;
}

export interface CertificadosDoPainel {
  itens: ItemVencimento[];
  /**
   * `false` = a consulta NÃO respondeu. Quem chama precisa saber: somar zero
   * certificados a um contador é dizer "conferi e não há", que é a mentira
   * que este painel inteiro evita (ver `KpisPainel`).
   */
  ok: boolean;
}

/**
 * Converte as linhas cruas em itens do painel pela MESMA regra do caminho
 * local (`itemDeCertificado`). Exportada para o teste montar linhas na mão sem
 * rede.
 */
export function itensDeLinhas(linhas: LinhaCertificado[], hoje: Date): ItemVencimento[] {
  const itens: ItemVencimento[] = [];
  for (const linha of linhas) {
    // Tombstone: excluído em outro aparelho não vence mais nada.
    if (linha?.deletado_em) continue;
    const item = itemDeCertificado(
      {
        id: String(linha?.chave ?? '').slice(PREFIXO_RASTREAB.length),
        nome: linha?.nome ?? null,
        tipo: linha?.tipo ?? null,
        certificado: linha?.certificado ?? null,
        validade: linha?.validade ?? null,
        substituidoEm: linha?.substituido_em ?? linha?.substituidoEm ?? null,
      },
      hoje,
    );
    if (item) itens.push(item);
  }
  return itens;
}

/**
 * Os certificados de padrão da organização, direto do servidor.
 *
 * O escopo é aplicado DENTRO da função (`org_id = org_atual()`, e o papel
 * `cliente` não passa): quem chama não escolhe organização.
 *
 * `ok: false` cobre também a função AUSENTE — enquanto o SQL não estiver
 * aplicado, o painel diz que não conferiu os certificados em vez de afirmar
 * que não há nenhum.
 */
export async function certificadosDoServidor(
  hoje: Date = new Date(),
): Promise<CertificadosDoPainel> {
  try {
    const { data, error } = await supabase.rpc(RPC_CERTIFICADOS);
    if (error || !data) return { itens: [], ok: false };
    const linhas = (data as unknown as LinhaCertificado[]).slice(0, LIMITE_CERTIFICADOS);
    return { itens: itensDeLinhas(linhas, hoje), ok: true };
  } catch {
    return { itens: [], ok: false };
  }
}
