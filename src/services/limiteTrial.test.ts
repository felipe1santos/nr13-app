import { describe, it, expect, beforeEach, vi } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

const estado = vi.hoisted(() => ({ chaves: [] as string[] }));
const flagBoot = vi.hoisted(() => ({ ativo: false }));
const contagem = vi.hoisted(() => ({ total: 0 }));

vi.mock('./flag', () => ({ bootV9Ativo: () => flagBoot.ativo }));
vi.mock('./buscaIndex', () => ({
  contar: async () => ({ total: contagem.total, exato: true }),
}));

vi.mock('./storage', () => ({
  listarChavesComPrefixo: (p: string) => estado.chaves.filter((c) => c.startsWith(p)),
}));

import {
  LIMITE_EQUIPAMENTOS_TRIAL,
  podeCriarEquipamento,
  podeCriarEquipamentoAgora,
  equipamentosCadastrados,
} from './limiteTrial';

function comEquipamentos(n: number) {
  estado.chaves = Array.from({ length: n }, (_, i) => `nr13_info_EQ-${i}`);
}

beforeEach(() => {
  localStorage.clear();
  estado.chaves = [];
});

describe('teto de equipamentos no trial', () => {
  it('conta apenas equipamentos, não as demais chaves da conta', () => {
    estado.chaves = ['nr13_info_A', 'nr13_fotos_A', 'nr13_calc_A', 'nr13_info_B'];
    expect(equipamentosCadastrados()).toBe(2);
  });

  it('conta paga não tem teto', () => {
    localStorage.setItem('nr13_plano', 'completo');
    comEquipamentos(50);
    expect(podeCriarEquipamento().permitido).toBe(true);
  });

  it('trial cria até o limite', () => {
    localStorage.setItem('nr13_plano', 'trial');
    for (let n = 0; n < LIMITE_EQUIPAMENTOS_TRIAL; n++) {
      comEquipamentos(n);
      expect(podeCriarEquipamento().permitido).toBe(true);
    }
  });

  it('trial no limite é recusado, com motivo que diz o número', () => {
    localStorage.setItem('nr13_plano', 'trial');
    comEquipamentos(LIMITE_EQUIPAMENTOS_TRIAL);

    const r = podeCriarEquipamento();

    expect(r.permitido).toBe(false);
    expect(r.atual).toBe(LIMITE_EQUIPAMENTOS_TRIAL);
    expect(r.motivo).toContain(String(LIMITE_EQUIPAMENTOS_TRIAL));
    expect(r.motivo.toLowerCase()).toContain('assine');
  });

  it('excluir equipamento libera vaga', () => {
    // O teto é de quantidade simultânea, não de cadastros ao longo da vida:
    // punir quem apagou um cadastro errado seria hostil sem ganhar nada.
    localStorage.setItem('nr13_plano', 'trial');
    comEquipamentos(LIMITE_EQUIPAMENTOS_TRIAL);
    expect(podeCriarEquipamento().permitido).toBe(false);

    comEquipamentos(LIMITE_EQUIPAMENTOS_TRIAL - 1);
    expect(podeCriarEquipamento().permitido).toBe(true);
  });

  it('conta sem plano gravado (legado) não é tratada como trial', () => {
    // `nr13_plano` ausente acontece em sessão antiga; barrar aí seria travar
    // cliente pagante por falta de um dado que o login regrava.
    comEquipamentos(10);
    expect(podeCriarEquipamento().permitido).toBe(true);
  });
});

/**
 * Fase 9 · 9D.5 — o teto do trial sob o BOOT LEVE.
 *
 * `equipamentosCadastrados()` conta as chaves `nr13_info_` do cache. Com
 * `boot_v9` o cache não tem a organização: a conta daria ZERO, e o teto de 3
 * equipamentos deixaria de existir sem que nada na tela mudasse. É um gate de
 * produto, não de segurança — mas um gate que some em silêncio é pior que um
 * gate que não existe, porque ninguém vai procurar.
 */
describe('teto do trial com o boot leve', () => {
  beforeEach(() => {
    flagBoot.ativo = false;
    contagem.total = 0;
  });

  it('sem boot_v9, conta do cache — o caminho de sempre', async () => {
    localStorage.setItem('nr13_plano', 'trial');
    comEquipamentos(3);

    const r = await podeCriarEquipamentoAgora();

    expect(r.permitido).toBe(false);
    expect(r.atual).toBe(3);
  });

  it('com boot_v9, conta pela PROJEÇÃO — o cache vazio não libera o teto', async () => {
    localStorage.setItem('nr13_plano', 'trial');
    flagBoot.ativo = true;
    contagem.total = 3;   // o cache local está vazio; a organização tem 3

    const r = await podeCriarEquipamentoAgora();

    expect(r.permitido).toBe(false);
    expect(r.atual).toBe(3);
  });

  it('conta paga não é barrada nem quando a contagem falha', async () => {
    // Sem trial, o teto não existe: nem vale a pena consultar o servidor.
    flagBoot.ativo = true;
    contagem.total = 999;

    const r = await podeCriarEquipamentoAgora();

    expect(r.permitido).toBe(true);
  });
});
