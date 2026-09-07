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
 * ## Por que uma consulta própria, e não uma coluna nova na projeção
 *
 * Certificado de padrão **não pertence a equipamento**: é da organização (um
 * por `tipoInstrumento` entre os ativos). Não cabe em `equipamentos_index` nem
 * em `calibracoes_index`, e criar uma projeção nova custaria migração SQL em
 * produção (§13) para uma família que tem dezenas de linhas, não milhares.
 *
 * ## O que esta consulta NÃO traz: o PDF
 *
 * `valor` guarda o registro COMPLETO no servidor — inclusive `pdfBase64`, que
 * o cache local nem chega a ver (§2-bis). Baixar `valor` inteiro para ler uma
 * data seria trazer megabytes de PDF por causa de um `validade`. Por isso a
 * projeção é por CAMPO (`valor->>"validade"`), feita pelo Postgres: chegam ao
 * navegador cinco strings curtas por certificado.
 *
 * Escopo por organização (`org_id`/`user_id`) além da RLS: a política já
 * filtra, o `.eq` é o segundo cinto.
 */
import { supabase, escopoStorageAtual, TABELA_STORAGE } from './supabase';
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
 * Só os campos que a linha do painel precisa. Cada um é extraído do JSON pelo
 * servidor; `valor` inteiro nunca trafega.
 *
 * As chaves vão entre aspas porque são camelCase: sem as aspas o nome do campo
 * dependeria de como o PostgREST normaliza maiúsculas, e `tipoInstrumento`
 * viraria `tipoinstrumento` — que não existe no registro, e devolveria `null`
 * em silêncio (o certificado apareceria como "Instrumento padrão" genérico).
 */
export const COLUNAS_CERTIFICADO =
  'chave, deletado_em,' +
  ' nome:valor->>"nome",' +
  ' tipo:valor->>"tipoInstrumento",' +
  ' certificado:valor->>"certificadoPadrao",' +
  ' validade:valor->>"validade",' +
  ' substituidoEm:valor->>"substituidoEm"';

interface LinhaCertificado {
  chave?: string | null;
  deletado_em?: string | null;
  nome?: string | null;
  tipo?: string | null;
  certificado?: string | null;
  validade?: string | null;
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
        substituidoEm: linha?.substituidoEm ?? null,
      },
      hoje,
    );
    if (item) itens.push(item);
  }
  return itens;
}

/** Os certificados de padrão da organização, direto do servidor. */
export async function certificadosDoServidor(
  hoje: Date = new Date(),
): Promise<CertificadosDoPainel> {
  try {
    const escopo = await escopoStorageAtual();
    if (!escopo) return { itens: [], ok: false };

    const { data, error } = await supabase
      .from(TABELA_STORAGE)
      .select(COLUNAS_CERTIFICADO)
      .eq(escopo.coluna, escopo.id)
      .like('chave', `${PREFIXO_RASTREAB}%`)
      .limit(LIMITE_CERTIFICADOS);

    if (error || !data) return { itens: [], ok: false };
    return { itens: itensDeLinhas(data as unknown as LinhaCertificado[], hoje), ok: true };
  } catch {
    return { itens: [], ok: false };
  }
}
