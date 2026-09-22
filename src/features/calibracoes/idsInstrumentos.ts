import type { MapaOverrides, Override } from '../relatorios/overridesRelatorio';
import { INSTRUMENTOS, type TipoInstrumento } from './instrumentos';

/**
 * OS IDs DO QUADRO 7.1.1 DEIXAM DE SER POSICIONAIS (22/09/2026).
 *
 * ## O defeito
 *
 * Os campos editáveis do quadro "INSTRUMENTOS E DISPOSITIVOS DE SEGURANÇA
 * INSTALADOS" tinham id pela POSIÇÃO da linha: `instrumentos.0.certificado`,
 * `instrumentos.1.certificado`… Enquanto a tabela imprimia sempre as seis
 * linhas, na mesma ordem, isso funcionou.
 *
 * No momento em que a tabela passa a esconder os instrumentos não encontrados,
 * o índice deixa de identificar coisa nenhuma: sumindo o termômetro (posição 1),
 * o pressostato deixa de ser 3 e passa a ser 2 — e o override que o engenheiro
 * escreveu para o pressostato vai imprimir na linha do vacuômetro.
 *
 * Medido em produção antes da mudança: **18 overrides posicionais em 5
 * rascunhos**, três deles com o texto "Não instalado — não aplicável" escrito à
 * mão justamente nas linhas que o filtro removeria. Deslocar valor entre
 * instrumentos num documento técnico assinado é pior do que a tabela poluída
 * que a mudança veio consertar.
 *
 * ## A ORDEM HISTÓRICA — a chave da tradução
 *
 * Esta é a ordem em que a tabela SEMPRE foi impressa, e portanto a única leitura
 * possível de um id posicional gravado no passado. Ela sai do array do
 * formulário de campo (`FormularioChecklist.INSTRUMENTOS`), conferida contra o
 * documento revisado pelo cliente (`Modelo Melhorias Vasos`, pág. 11):
 *
 * | posição | instrumento |
 * |---|---|
 * | 0 | Manômetro |
 * | 1 | Termômetro |
 * | 2 | Vacuômetro |
 * | 3 | Pressostato |
 * | 4 | Transmissor de pressão |
 * | 5 | Válvula de segurança (PSV) |
 *
 * **Ela é congelada.** Não é "a ordem de exibição": é o dicionário do que já foi
 * gravado. Mexer aqui reinterpreta override antigo, que é exatamente o acidente
 * que este módulo existe para impedir. A ordem de EXIBIÇÃO pode mudar à vontade
 * — ela não passa mais por aqui.
 *
 * ## O que NÃO se faz
 *
 * Nada é regravado em massa. A tradução é de LEITURA: o documento antigo abre
 * certo, e a próxima edição daquele documento passa a gravar o id estável (é
 * `gravarOverrides` que grava o mapa inteiro, já traduzido). Sem SQL, sem
 * migração, sem tocar em documento finalizado — finalizado serve os bytes
 * arquivados e nem chega a montar este quadro.
 */

/**
 * A ordem em que o quadro foi impresso desde sempre. **Congelada**: é o
 * dicionário dos ids posicionais antigos, não a ordem de exibição de hoje.
 */
export const ORDEM_HISTORICA_QUADRO: readonly TipoInstrumento[] = [
  'manometro',
  'termometro',
  'vacuometro',
  'pressostato',
  'transmissor',
  'psv',
] as const;

/** Os campos editáveis de cada linha do quadro. */
export const CAMPOS_QUADRO = ['possui', 'calibrado', 'certificado'] as const;
export type CampoQuadro = (typeof CAMPOS_QUADRO)[number];

/** O prefixo dos ids do quadro — o mesmo para o id antigo e o novo. */
export const PREFIXO_QUADRO = 'instrumentos.';

/**
 * O id ESTÁVEL de um campo — `instrumentos.<tipo>.<campo>`.
 *
 * Função central de propósito: o id aparece no modelo, na folha, no mapa de
 * overrides e nos testes, e montá-lo à mão em cada lugar é como as quatro
 * camadas passam a discordar.
 */
export function idCampoInstrumento(tipo: TipoInstrumento, campo: CampoQuadro): string {
  return `${PREFIXO_QUADRO}${tipo}.${campo}`;
}

/** O tipo que ocupava aquela posição no quadro antigo. */
export function tipoNaPosicaoHistorica(posicao: number): TipoInstrumento | null {
  return ORDEM_HISTORICA_QUADRO[posicao] ?? null;
}

/** `instrumentos.3.certificado` → `{ posicao: 3, campo: 'certificado' }`. */
export function lerIdPosicional(id: string): { posicao: number; campo: CampoQuadro } | null {
  const m = /^instrumentos\.(\d+)\.(possui|calibrado|certificado)$/.exec(id);
  if (!m) return null;
  return { posicao: Number(m[1]), campo: m[2] as CampoQuadro };
}

/** `instrumentos.psv.certificado` → `{ tipo: 'psv', campo: 'certificado' }`. */
export function lerIdEstavel(id: string): { tipo: TipoInstrumento; campo: CampoQuadro } | null {
  const m = /^instrumentos\.([a-z_]+)\.(possui|calibrado|certificado)$/.exec(id);
  if (!m) return null;
  const tipo = m[1] as TipoInstrumento;
  return tipo in INSTRUMENTOS ? { tipo, campo: m[2] as CampoQuadro } : null;
}

/**
 * Traduz os ids POSICIONAIS de um mapa de overrides para os estáveis.
 *
 * Regras, e cada uma evita um jeito de perder informação:
 *
 * - **o estável VENCE**: se os dois existirem para o mesmo campo, o antigo é
 *   descartado — ele é resquício de uma edição anterior à mudança;
 * - **posição fora da ordem histórica é MANTIDA como está**: um id
 *   `instrumentos.9.certificado` não tem instrumento conhecido; apagá-lo seria
 *   descartar dado que alguém gravou, e traduzi-lo seria inventar um dono;
 * - **nada mais é tocado**: os outros campos do documento passam intactos.
 */
export function comIdsEstaveis(mapa: MapaOverrides): MapaOverrides {
  const saida: MapaOverrides = {};
  const traduzidos: Record<string, Override> = {};

  for (const [id, ovr] of Object.entries(mapa)) {
    const pos = lerIdPosicional(id);
    if (!pos) {
      saida[id] = ovr;
      continue;
    }
    const tipo = tipoNaPosicaoHistorica(pos.posicao);
    if (!tipo) {
      // Posição desconhecida: fica como está, para ninguém perder o que digitou.
      saida[id] = ovr;
      continue;
    }
    traduzidos[idCampoInstrumento(tipo, pos.campo)] = ovr;
  }

  // O estável já existente vence o traduzido.
  for (const [id, ovr] of Object.entries(traduzidos)) if (!(id in saida)) saida[id] = ovr;
  return saida;
}

/** Há algum override posicional do quadro neste mapa? (para teste e diagnóstico) */
export function temIdPosicional(mapa: MapaOverrides): boolean {
  return Object.keys(mapa).some((id) => lerIdPosicional(id) !== null);
}

/**
 * O override daquele campo tem conteúdo que o documento imprimiria?
 *
 * `''` e `null` não contam: são "apagado", e apagar não é declarar. Mas
 * **`'0'`, `'-'` e qualquer outro texto CONTAM** — o engenheiro escreveu aquilo
 * de propósito, e é a manifestação manual dele que a linha precisa preservar.
 */
export function overrideComConteudo(ovr: Override | undefined): boolean {
  if (!ovr || typeof ovr !== 'object') return false;
  const v = (ovr as { valor?: unknown }).valor;
  return typeof v === 'string' && v.trim() !== '';
}

/** Algum campo daquele instrumento foi escrito à mão? */
export function instrumentoComOverride(mapa: MapaOverrides, tipo: TipoInstrumento): boolean {
  return CAMPOS_QUADRO.some((c) => overrideComConteudo(mapa[idCampoInstrumento(tipo, c)]));
}
