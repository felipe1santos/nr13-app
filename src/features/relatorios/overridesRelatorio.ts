import { ler, salvar } from '../../services/storage';

/**
 * Fase 13D-bis · O DOCUMENTO EDITÁVEL, POR RELATÓRIO.
 *
 * ## O problema
 *
 * O Modelo Novo preenche tudo a partir das fontes do sistema (ficha, memorial,
 * categoria, container de inspeção). Quando o cadastro diz `WEG` e este
 * relatório precisa dizer `WEG Equipamentos`, o usuário tinha duas saídas
 * ruins: alterar o cadastro MESTRE — mudando todo relatório futuro e o
 * histórico de telas que leem a mesma ficha — ou emitir o documento errado.
 *
 * ## A regra
 *
 * ```
 * fonte automática → valor base → override manual do rascunho → prévia → PDF
 * ```
 *
 * O override pertence **àquele relatório**. Nada aqui escreve em ficha,
 * cliente, memorial, categoria, cálculo ou configuração da organização: é uma
 * camada de apresentação, gravada na chave do próprio documento.
 *
 * ## TRÊS estados, e o terceiro é o que costuma ser esquecido
 *
 * | estado | significado | o documento mostra |
 * |---|---|---|
 * | ausente | ninguém mexeu | o valor automático |
 * | `manual` | o usuário escreveu | exatamente o que ele escreveu |
 * | `branco` | o usuário APAGOU de propósito | vazio (e amarelo na prévia) |
 *
 * `branco` não é "sem override". Tratar os dois do mesmo jeito faria o valor
 * automático voltar sozinho na próxima geração — o usuário apagaria `WEG` e
 * `WEG` reapareceria, o que é pior do que não deixar apagar.
 *
 * ## Rastreabilidade
 *
 * Cada override guarda o valor automático que ele substituiu, quem alterou
 * (quando o app sabe) e quando. Isso não é impresso no PDF: serve para explicar
 * uma divergência entre o documento e a ficha meses depois.
 */
export type Override =
  | { modo: 'manual'; valor: string; auto: string; em: string; por?: string }
  | { modo: 'branco'; auto: string; em: string; por?: string };

export type MapaOverrides = Record<string, Override>;

export const PREFIXO_OVERRIDES = 'nr13_ovr_';

/**
 * A chave é `nr13_ovr_<id>_<TAG>` — id primeiro, TAG por último, igual à do
 * relatório (`historicoRelatorios.chaveRelatorio`). O prefixo é PRÓPRIO, e não
 * `nr13_rel_ovr_`, porque `listarRegistrosDaTag` filtra por `startsWith('nr13_rel_')`
 * e leria o mapa de overrides como se fosse um relatório salvo.
 */
export function chaveOverrides(idRelatorio: string, tag: string): string {
  return `${PREFIXO_OVERRIDES}${String(idRelatorio).replace(/_/g, '-')}_${tag}`;
}

/** O que o documento mostra para um campo: o override manda; senão, o automático. */
export function resolverValor(auto: string | null | undefined, ovr: Override | undefined): string | null {
  if (!ovr) return auto ?? null;
  if (ovr.modo === 'branco') return '';
  return ovr.valor;
}

/** De onde veio o valor que está no papel. */
export type OrigemValor = 'auto' | 'manual' | 'branco';

/** De onde veio o que está na tela — a prévia usa isto para o marcador discreto. */
export function origemDoValor(ovr: Override | undefined): OrigemValor {
  if (!ovr) return 'auto';
  return ovr.modo === 'branco' ? 'branco' : 'manual';
}

/**
 * O override que um texto digitado produz.
 *
 * Texto vazio (ou só espaços) é a intenção de APAGAR, e vira `branco`. É o
 * único caminho para o estado C: não existe botão "apagar" separado, porque
 * apagar o conteúdo do campo é o gesto natural para isso.
 */
export function overrideDeTexto(texto: string, auto: string | null | undefined, por?: string): Override {
  const base = { auto: auto ?? '', em: new Date().toISOString(), ...(por ? { por } : {}) };
  return texto.trim() === '' ? { modo: 'branco', ...base } : { modo: 'manual', valor: texto, ...base };
}

/** Aplica um override ao mapa (sem mutar o original). */
export function comOverride(mapa: MapaOverrides, id: string, ovr: Override): MapaOverrides {
  return { ...mapa, [id]: ovr };
}

/**
 * Tira o override — é o "Restaurar valor automático".
 *
 * Remover é diferente de gravar `branco`: aqui o campo volta a seguir a fonte,
 * inclusive se ela mudar depois.
 */
export function semOverride(mapa: MapaOverrides, id: string): MapaOverrides {
  const copia = { ...mapa };
  delete copia[id];
  return copia;
}

/** Quantos campos foram tocados à mão — a barra da prévia mostra isso. */
export function contarOverrides(mapa: MapaOverrides): number {
  return Object.keys(mapa ?? {}).length;
}

// ---------------------------------------------------------------------------
// Persistência — pelo caminho oficial (fila durável → RPC → Postgres → ack)
// ---------------------------------------------------------------------------

/** O mapa gravado deste relatório. Nunca lança: sem registro, é `{}`. */
export function carregarOverrides(idRelatorio: string, tag: string): MapaOverrides {
  if (!idRelatorio || !tag) return {};
  try {
    return sanear(ler<MapaOverrides>(chaveOverrides(idRelatorio, tag)));
  } catch {
    return {};
  }
}

/**
 * Grava o mapa inteiro.
 *
 * `salvar` é o mesmo caminho de todo o resto: fila durável, RPC, versionamento
 * e conflito explícito. Offline, o override entra na fila e sobe na
 * reconexão — editar texto no campo continua possível sem rede, como o resto
 * do sistema.
 */
export async function gravarOverrides(
  idRelatorio: string,
  tag: string,
  mapa: MapaOverrides,
): Promise<void> {
  await salvar(chaveOverrides(idRelatorio, tag), sanear(mapa));
}

/**
 * DUPLICAR copia os overrides (decisão registrada em 05/09/2026).
 *
 * Duplicar existe para emitir uma versão NOVA daquele documento — a próxima
 * inspeção do mesmo equipamento, a correção de um relatório já emitido. Quem
 * duplica espera continuar de onde o outro parou; jogar fora as correções de
 * texto obrigaria a refazer campo a campo, e o mais provável seria emitir com o
 * texto errado de volta.
 *
 * A cópia é independente: id novo, mapa novo, e editar um não mexe no outro.
 */
export async function copiarOverrides(
  idOrigem: string,
  tagOrigem: string,
  idDestino: string,
  tagDestino: string,
): Promise<MapaOverrides> {
  const mapa = carregarOverrides(idOrigem, tagOrigem);
  if (contarOverrides(mapa) === 0) return {};
  await gravarOverrides(idDestino, tagDestino, mapa);
  return mapa;
}

/**
 * Descarta o que não é override válido.
 *
 * O mapa vem do storage, que é compartilhado entre aparelhos e versões do app.
 * Uma entrada com formato antigo (ou corrompida) não pode derrubar a geração do
 * documento inteiro — ela simplesmente não vale, e o campo volta ao automático.
 */
export function sanear(bruto: unknown): MapaOverrides {
  if (!bruto || typeof bruto !== 'object') return {};
  const saida: MapaOverrides = {};
  for (const [id, v] of Object.entries(bruto as Record<string, unknown>)) {
    const o = v as Partial<Override> & { valor?: unknown };
    if (!o || typeof o !== 'object') continue;
    const auto = typeof o.auto === 'string' ? o.auto : '';
    const em = typeof o.em === 'string' ? o.em : '';
    const por = typeof o.por === 'string' ? o.por : undefined;
    if (o.modo === 'branco') saida[id] = { modo: 'branco', auto, em, ...(por ? { por } : {}) };
    else if (o.modo === 'manual' && typeof o.valor === 'string')
      saida[id] = { modo: 'manual', valor: o.valor, auto, em, ...(por ? { por } : {}) };
  }
  return saida;
}
