import { describe, it, expect } from 'vitest';
import {
  CHAVE_TEMA,
  TEMA_PADRAO,
  ehTemaValido,
  gravarTema,
  lerTema,
  proximoTema,
} from './temaAdmin';

/** Armazenamento de mentira; `quebrado` simula navegador que bloqueia storage. */
function store(inicial: Record<string, string> = {}, quebrado = false) {
  const dados = { ...inicial };
  return {
    dados,
    getItem(k: string) {
      if (quebrado) throw new Error('acesso negado');
      return dados[k] ?? null;
    },
    setItem(k: string, v: string) {
      if (quebrado) throw new Error('acesso negado');
      dados[k] = v;
    },
  };
}

describe('temaAdmin', () => {
  it('o padrão é escuro — é o tema para o qual o painel foi desenhado', () => {
    expect(TEMA_PADRAO).toBe('escuro');
  });

  it('alterna entre os dois temas', () => {
    expect(proximoTema('escuro')).toBe('claro');
    expect(proximoTema('claro')).toBe('escuro');
  });

  it('valida o valor lido', () => {
    expect(ehTemaValido('claro')).toBe(true);
    expect(ehTemaValido('escuro')).toBe(true);
    expect(ehTemaValido('roxo')).toBe(false);
    expect(ehTemaValido(null)).toBe(false);
  });

  it('lê o tema salvo', () => {
    expect(lerTema(store({ [CHAVE_TEMA]: 'claro' }))).toBe('claro');
  });

  it('valor ausente ou corrompido cai no padrão em vez de quebrar a tela', () => {
    expect(lerTema(store())).toBe('escuro');
    expect(lerTema(store({ [CHAVE_TEMA]: 'lixo' }))).toBe('escuro');
  });

  it('storage que lança devolve o padrão — painel não pode deixar de abrir por causa da cor', () => {
    expect(lerTema(store({}, true))).toBe('escuro');
  });

  it('grava o tema escolhido', () => {
    const s = store();
    gravarTema('claro', s);
    expect(s.dados[CHAVE_TEMA]).toBe('claro');
  });

  it('storage que lança na escrita não derruba a troca de tema', () => {
    expect(() => gravarTema('claro', store({}, true))).not.toThrow();
  });
});
