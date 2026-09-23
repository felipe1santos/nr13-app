/**
 * PROTOCOLO DE SINCRONIZAÇÃO, E COMO SABER QUEM AINDA FALA O ANTIGO
 * (22/09/2026).
 *
 * ## O bloqueador que este módulo existe para fechar
 *
 * O ensaio da rodada anterior mediu uma incompatibilidade estrutural: um
 * aparelho no bundle ANTIGO exclui um item tirando-o da lista, sem deixar
 * marca. Do ponto de vista do merge, "ausente de um lado" é indistinguível de
 * "criado no outro" — então a exclusão dele é desfeita. Nada se perde (o item
 * volta, não some), mas a decisão do usuário é revertida em silêncio.
 *
 * Duas coisas resolvem isso, e a ordem importa:
 *
 * 1. **saber** quem ainda está no bundle antigo (este módulo + `org_dispositivos`);
 * 2. **impedir** que ele faça a escrita incompatível (a guarda no SQL).
 *
 * A (2) é a garantia; a (1) é o que permite planejar. Sem a (2), qualquer
 * janela de tempo seria um chute — ver `docs/HARDENING-SINCRONIZACAO.md`.
 *
 * ## Por que a detecção é GRATUITA
 *
 * `aplicar_mutacao_storage` ganha um parâmetro `p_protocolo integer default 1`.
 * O bundle antigo não o envia — e o default responde por ele. Não é heurística:
 * é o próprio contrato da chamada dizendo qual código a emitiu.
 */

/**
 * O protocolo que ESTE bundle fala.
 *
 * | versão | o que muda |
 * |---|---|
 * | 1 | exclusão em coleção TIRA o item da lista, sem marca |
 * | 2 | exclusão em coleção MARCA (`removidoEm`); leitura filtra |
 *
 * Sobe quando uma mudança torna o cliente antigo perigoso para o novo — não a
 * cada release. Hoje existe exatamente uma dessas mudanças.
 */
export const PROTOCOLO_SYNC = 2;

/** O menor protocolo que uma organização com tombstone ligado pode aceitar. */
export const PROTOCOLO_MINIMO_TOMBSTONE = 2;

export interface DispositivoVisto {
  /** `nr13_dispositivo_id` — o mesmo id que já viaja em `app_storage.dispositivo`. */
  dispositivo: string;
  protocolo: number;
  /** ISO. Quando o servidor viu este aparelho pela última vez. */
  vistoEm: string;
}

/**
 * Este aparelho pode escrever numa organização com tombstone ligado?
 *
 * A resposta do CLIENTE novo é sempre sim; ela existe para a tela poder
 * explicar o caso contrário sem duplicar o número.
 */
export function protocoloCompativel(protocolo: number): boolean {
  return protocolo >= PROTOCOLO_MINIMO_TOMBSTONE;
}

/**
 * A MUTAÇÃO DERRUBA UM ITEM?
 *
 * Espelho, em TypeScript, da guarda que vive em
 * `supabase/sync_v2_por_org.sql`. Os dois precisam concordar, e é por isso que
 * a regra está escrita aqui também: SQL não tem teste unitário neste projeto, e
 * uma guarda de segurança sem teste é uma guarda que se descobre quebrada em
 * produção.
 *
 * "Derrubar" é sumir com um id que existia — que é exatamente o que o bundle
 * antigo faz ao excluir, e o que nenhuma outra operação dele faz. Editar,
 * acrescentar e reordenar passam.
 *
 * Um id que continua presente mas MARCADO não é derrubada: é a exclusão do
 * protocolo 2, e ela é justamente o que se quer.
 */
export function mutacaoDerrubaItem(antes: string | null | undefined, depois: string | null | undefined): boolean {
  const ids = (bruto: string | null | undefined): Set<string> | null => {
    if (!bruto) return null;
    try {
      const v = JSON.parse(bruto);
      if (!Array.isArray(v)) return null;
      const s = new Set<string>();
      for (const i of v) {
        const id = (i as { id?: unknown })?.id;
        if (typeof id === 'string' && id !== '') s.add(id);
      }
      return s;
    } catch {
      return null;
    }
  };

  const a = ids(antes);
  const d = ids(depois);
  // Sem lista dos dois lados não há derrubada a afirmar. Recusar aqui barraria
  // escrita legítima (primeira gravação da chave, valor que não é array) — e
  // uma guarda que barra o caso normal é desligada no primeiro incidente.
  if (!a || !d) return false;

  for (const id of a) if (!d.has(id)) return true;
  return false;
}

/**
 * A organização está pronta para ligar o tombstone?
 *
 * Regra objetiva, e o que cada parte garante:
 *
 * - **allowlist**: a org está explicitamente habilitada. É decisão humana, e
 *   nenhuma automação a substitui.
 * - **nenhum dispositivo ATIVO abaixo do protocolo mínimo**: é a parte
 *   observável, e ela responde "quantas pessoas vão esbarrar no aviso de
 *   atualizar", não "é seguro?". A segurança vem da guarda no servidor.
 *
 * ## "Ativo recente" — o número, e de onde ele sai
 *
 * Não existe prazo derivável de primeiros princípios para "há quanto tempo o
 * aparelho mais atrasado pode reaparecer": o sistema é offline-first por
 * desenho, e o inspetor passa dias em campo. Qualquer número seria um chute.
 *
 * O que É derivável: **o aparelho que sincronizou DEPOIS da publicação do
 * bundle novo carrega o bundle novo**. A cadeia é causal — sincronizar exige a
 * página aberta, a página vem de `index.html`, e o service worker só serve
 * `/assets/` do cache (ver a memória `sw-cache-first-stale`). Então o corte
 * honesto não é "N dias": é **desde o deploy**.
 *
 * Por isso `prontidao` recebe `desde` do chamador — a data do deploy do bundle
 * com protocolo 2 — em vez de calcular uma janela por conta própria.
 */
export interface Prontidao {
  /** Dispositivos vistos desde o corte, abaixo do protocolo mínimo. */
  incompativeis: DispositivoVisto[];
  /** Dispositivos vistos desde o corte, já compatíveis. */
  compativeis: DispositivoVisto[];
  /** Nenhum incompatível visto desde o corte. */
  pronta: boolean;
}

export function prontidao(dispositivos: DispositivoVisto[], desde: string): Prontidao {
  const recentes = (dispositivos ?? []).filter((d) => d.vistoEm >= desde);
  const incompativeis = recentes.filter((d) => !protocoloCompativel(d.protocolo));
  return {
    incompativeis,
    compativeis: recentes.filter((d) => protocoloCompativel(d.protocolo)),
    // Lista VAZIA não prova prontidão: prova que ninguém sincronizou desde o
    // corte. `pronta` exige ter visto pelo menos um aparelho — senão a
    // organização "pronta" seria a que ninguém usa.
    pronta: recentes.length > 0 && incompativeis.length === 0,
  };
}
