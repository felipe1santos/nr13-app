import { describe, expect, it } from 'vitest';
import {
  FORA_DO_PORTAL,
  PREFIXOS_POR_TAG,
  PREFIXOS_SOB_DEMANDA,
  chaveAutorizadaSobDemanda,
} from '../../../supabase/functions/portal_cliente/prefixos';

/**
 * A autorização do caminho SOB DEMANDA da Edge `portal_cliente`.
 *
 * Este teste é BLOQUEANTE por um motivo concreto: até 04/09/2026 a regra era
 * `chave.endsWith('_' + tag)` e mais nada. Bastava terminar com a TAG de um
 * equipamento do cliente — e `nr13_livro_rascunho_<TAG>` termina. Um cliente
 * autenticado que pedisse a chave pelo nome receberia o RASCUNHO do Livro de
 * Segurança: registro não trancado, que ainda pode mudar, servido como se fosse
 * documento.
 *
 * A Edge roda em Deno e não é executada pela suíte. Por isso a regra vive numa
 * função PURA em `prefixos.ts`, e é ela que este arquivo trava.
 */
const TAG = 'VASO A23';
const OUTRA = 'CALD-99';
const TAGS = [TAG, 'EQUIPE TESTE'];

describe('cliente autorizado LÊ o que é dele', () => {
  it('o Livro OFICIAL do equipamento dele', () => {
    expect(chaveAutorizadaSobDemanda(`nr13_livro_${TAG}`, TAGS)).toBe(true);
  });

  it('a ficha, as fotos e o índice de relatórios do equipamento dele', () => {
    for (const chave of [`nr13_info_${TAG}`, `nr13_fotos_${TAG}`, `nr13_historico_indice_${TAG}`]) {
      expect(chaveAutorizadaSobDemanda(chave, TAGS), chave).toBe(true);
    }
  });

  it('o registro completo de um relatório LEGADO — o caso que criou este caminho', () => {
    // `nr13_rel_` NÃO está em PREFIXOS_POR_TAG de propósito (não entra na carga
    // inicial, pesa ~9,3 KB). Exigir a lista da carga inicial aqui quebraria a
    // abertura desses relatórios no Portal: é o que `PREFIXOS_SOB_DEMANDA` evita.
    expect(chaveAutorizadaSobDemanda(`nr13_rel_REL-123_${TAG}`, TAGS)).toBe(true);
  });
});

describe('cliente autorizado NÃO lê o rascunho do Livro', () => {
  it('nega `nr13_livro_rascunho_<TAG>` mesmo sendo a TAG dele', () => {
    // Todas as condições da regra ANTIGA estão satisfeitas: termina em `_<TAG>`
    // de um equipamento dele, e o prefixo `nr13_livro_` é permitido. Só a
    // negação explícita, avaliada ANTES da permissão, o mantém fora.
    expect(chaveAutorizadaSobDemanda(`nr13_livro_rascunho_${TAG}`, TAGS)).toBe(false);
  });

  it('a família está declarada em FORA_DO_PORTAL', () => {
    expect(FORA_DO_PORTAL).toContain('nr13_livro_rascunho_');
  });

  it('a negação vence a permissão — mesmo se alguém puser o prefixo na lista permitida', () => {
    // Simula o erro futuro: `nr13_livro_rascunho_` acrescentado por engano à
    // lista de permitidos. A ordem das perguntas é o que protege.
    const comErro = [...PREFIXOS_POR_TAG, 'nr13_livro_rascunho_'];
    const negaPrimeiro = (chave: string) =>
      !FORA_DO_PORTAL.some((p) => chave.startsWith(p)) && comErro.some((p) => chave.startsWith(p));
    expect(negaPrimeiro(`nr13_livro_rascunho_${TAG}`)).toBe(false);
    expect(chaveAutorizadaSobDemanda(`nr13_livro_rascunho_${TAG}`, TAGS)).toBe(false);
  });
});

describe('a TAG continua sendo a autorização', () => {
  it('nega chave de equipamento de OUTRO cliente', () => {
    expect(chaveAutorizadaSobDemanda(`nr13_livro_${OUTRA}`, TAGS)).toBe(false);
    expect(chaveAutorizadaSobDemanda(`nr13_info_${OUTRA}`, TAGS)).toBe(false);
    expect(chaveAutorizadaSobDemanda(`nr13_rel_REL-1_${OUTRA}`, TAGS)).toBe(false);
  });

  it('sem TAG nenhuma, nada passa', () => {
    expect(chaveAutorizadaSobDemanda(`nr13_livro_${TAG}`, [])).toBe(false);
  });

  it('nega chave de família desconhecida, ainda que termine na TAG certa', () => {
    // Antes, qualquer chave nova passava a ser legível pelo cliente no dia em
    // que fosse criada, sem ninguém decidir isso.
    expect(chaveAutorizadaSobDemanda(`nr13_familia_inventada_${TAG}`, TAGS)).toBe(false);
    expect(chaveAutorizadaSobDemanda(`nr13_uso_contadores`, TAGS)).toBe(false);
  });

  it('entrada inválida não passa', () => {
    expect(chaveAutorizadaSobDemanda('', TAGS)).toBe(false);
    expect(chaveAutorizadaSobDemanda(undefined as unknown as string, TAGS)).toBe(false);
  });
});

describe('sem regressão nas listas', () => {
  it('toda família permitida por TAG continua autorizada sob demanda', () => {
    const negadas = PREFIXOS_POR_TAG.filter((p) => !chaveAutorizadaSobDemanda(`${p}${TAG}`, TAGS));
    expect(
      negadas,
      'Família da carga inicial que o caminho sob demanda passou a recusar:\n  ' + negadas.join('\n  '),
    ).toEqual([]);
  });

  it('as famílias sob demanda são exatamente as previstas', () => {
    expect(PREFIXOS_SOB_DEMANDA).toEqual(['nr13_rel_']);
  });
});
