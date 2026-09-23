/**
 * A BASE CONFIRMADA de uma chave (22/09/2026).
 *
 * Módulo separado por uma razão só: **dependências**. A base precisa ser
 * gravada no ACK real da fila (`sync.ts`), e `sync.ts` não pode importar
 * `colecaoSync.ts` — este último passa por `./storage`, que despacha para
 * `storageV2`, que importa `sync`. O ciclo quebraria o boot.
 *
 * Aqui só entram `./db` e `./cacheLocal`, que `sync.ts` já importa.
 *
 * ## O que é a base
 *
 * O merge de três vias precisa saber o que ESTE aparelho reconheceu do
 * servidor antes de editar. Sem isso, "eu alterei o item" e "eu tenho a cópia
 * velha dele" são indistinguíveis, e todo item que o servidor mexeu durante o
 * offline viraria uma pergunta ao usuário.
 *
 * Mora na store `meta` do IndexedDB, chave `base:<chave>`, com
 * `{ versao, valor }` — a versão monotônica DO SERVIDOR e o conteúdo daquela
 * versão. Nada de relógio: quem ordena é a versão.
 *
 * ## A REGRA ÚNICA de quando ela avança
 *
 * | evento | base |
 * |---|---|
 * | hidratação/lookup traz a chave do servidor | passa a ser o que veio |
 * | **ACK real da fila** (`aplicado`/`repetido` genuíno) | passa a ser o valor CONFIRMADO |
 * | edição local | **NÃO muda** — é o ponto inteiro |
 * | erro de rede / timeout | **NÃO muda** |
 * | conflito | **NÃO muda** até a resolução |
 * | recusado (qualquer motivo) | **NÃO muda** |
 *
 * A linha da edição local é a crítica: se a base virasse o valor local depois
 * de editar, o sistema perderia a capacidade de detectar que os dois lados
 * mexeram — que é exatamente o caso que ainda precisa do usuário.
 *
 * ## Por que só COLEÇÕES
 *
 * `deveGuardarBase` limita a gravação às chaves do catálogo de `colecoes.ts`.
 * Guardar a base de TODA chave dobraria o IndexedDB do aparelho — `nr13_rel_`,
 * `nr13_fotos_` e `nr13_inspecao_atual` passam de centenas de KB cada, e nada
 * fora de uma lista sabe o que fazer com uma base. Chave que não é coleção não
 * tem merge por item para alimentar.
 */
import { aplicarAtomico, obter } from './db';
import { orgAtual } from './cacheLocal';
import { ehColecao } from './colecoes';

/** O que o aparelho reconheceu do servidor, por chave. */
export interface BaseColecao {
  /** A versão monotônica do servidor. `0` = a chave não existia lá / não se sabe. */
  versao: number;
  /** O conteúdo daquela versão, serializado como veio. */
  valor: string;
}

const chaveBase = (chave: string) => `base:${chave}`;

/** Esta chave merece base guardada? Só as coleções do catálogo. */
export function deveGuardarBase(chave: string): boolean {
  return ehColecao(chave);
}

/** A base guardada desta chave, ou `null`. */
export async function baseDe(chave: string): Promise<BaseColecao | null> {
  const org = orgAtual();
  if (!org) return null;
  try {
    return await obter<BaseColecao>(org, 'meta', chaveBase(chave));
  } catch {
    return null;
  }
}

/**
 * Registra a base CONFIRMADA de uma chave.
 *
 * Só quem tem confirmação do servidor chama: a hidratação (que recebeu o valor)
 * e o ACK real da fila (que soube a versão aplicada). A edição local **nunca**
 * chama — ver a tabela no topo do arquivo.
 *
 * Silencioso por desenho: falha de IndexedDB aqui não pode derrubar um ACK que
 * já aconteceu no servidor. Base ausente degrada o merge para "sem base" (mais
 * perguntas ao usuário), que é o comportamento anterior a esta rodada; base
 * ERRADA produziria merge errado. Por isso o `catch` engole, e por isso
 * `registrarBase` nunca é chamada fora de uma confirmação.
 */
export async function registrarBase(chave: string, base: BaseColecao): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  try {
    await aplicarAtomico(org, [{ store: 'meta', acao: 'put', chave: chaveBase(chave), valor: base }]);
  } catch {
    // ver comentário acima: base ausente é degradação conhecida, não corrupção
  }
}

/**
 * Esquece a base de uma chave.
 *
 * É o que um `del` confirmado deixa para trás: a chave não existe mais no
 * servidor, então não há conteúdo confirmado nenhum. Guardar `{versao, valor:''}`
 * seria afirmar que o servidor confirmou uma lista vazia — e uma lista vazia é
 * um estado legítimo, diferente de "a chave não existe".
 */
export async function esquecerBase(chave: string): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  try {
    await aplicarAtomico(org, [{ store: 'meta', acao: 'delete', chave: chaveBase(chave) }]);
  } catch {
    // idem
  }
}
