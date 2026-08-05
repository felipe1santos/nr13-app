import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validarMensagem,
  lerPonte,
  removerDaPonte,
  limparPonte,
  drenarPonte,
  CHAVE_PONTE,
  type SessaoPonte,
  type ItemPonte,
} from './ponteTemplates';

const JANELA_LEGITIMA = { id: 'iframe-1' };
const ORIGEM = 'http://localhost:5173';

const sessao = (): SessaoPonte => ({
  nonce: 'nonce-abc',
  aba: 'aba-1',
  org: 'org-1',
  origem: ORIGEM,
  janelas: new Set<unknown>([JANELA_LEGITIMA]),
});

const msgValida = () => ({
  tipo: 'nr13_salvar',
  id: 'm1',
  nonce: 'nonce-abc',
  aba: 'aba-1',
  org: 'org-1',
  chave: 'nr13_med_esp_ACA 2040',
  valor: '{"pontos":[]}',
});

const evento = (over: Record<string, unknown> = {}) => ({
  origin: ORIGEM,
  source: JANELA_LEGITIMA as unknown,
  data: msgValida(),
  ...over,
});

beforeEach(() => localStorage.clear());

describe('validação — as cinco checagens', () => {
  it('mensagem legítima passa', () => {
    const v = validarMensagem(sessao(), evento());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.msg.chave).toBe('nr13_med_esp_ACA 2040');
  });

  it('origem diferente é recusada', () => {
    expect(validarMensagem(sessao(), evento({ origin: 'https://site-malicioso.com' }))).toEqual({
      ok: false,
      motivo: 'origem',
    });
  });

  it('emissor que NÃO é um dos nossos iframes é recusado', () => {
    expect(validarMensagem(sessao(), evento({ source: { id: 'iframe-de-terceiro' } }))).toEqual({
      ok: false,
      motivo: 'emissor',
    });
  });

  it('sem source é recusado', () => {
    expect(validarMensagem(sessao(), evento({ source: null })).ok).toBe(false);
  });

  it('nonce de outra montagem é recusado', () => {
    const ev = evento({ data: { ...msgValida(), nonce: 'nonce-velho' } });
    expect(validarMensagem(sessao(), ev)).toEqual({ ok: false, motivo: 'nonce' });
  });

  it('aba diferente é recusada', () => {
    const ev = evento({ data: { ...msgValida(), aba: 'aba-2' } });
    expect(validarMensagem(sessao(), ev)).toEqual({ ok: false, motivo: 'aba' });
  });

  it('organização diferente é recusada (mensagem retida através da troca de conta)', () => {
    const ev = evento({ data: { ...msgValida(), org: 'org-2' } });
    expect(validarMensagem(sessao(), ev)).toEqual({ ok: false, motivo: 'org' });
  });

  it('formato inválido é recusado', () => {
    for (const ruim of [
      { ...msgValida(), chave: 123 },
      { ...msgValida(), valor: null },
      { ...msgValida(), id: undefined },
      { ...msgValida(), chave: '' },
    ]) {
      expect(validarMensagem(sessao(), evento({ data: ruim }))).toEqual({
        ok: false,
        motivo: 'formato',
      });
    }
  });

  it('mensagem de outro tipo é ignorada em silêncio (motivo null)', () => {
    const ev = evento({ data: { tipo: 'outra_coisa' } });
    expect(validarMensagem(sessao(), ev)).toEqual({ ok: false, motivo: null });
  });

  it('a origem é checada ANTES do emissor', () => {
    // Origem errada com emissor errado reporta 'origem': a ordem importa para
    // o diagnóstico não apontar a causa errada.
    const ev = evento({ origin: 'https://outro.com', source: { id: 'x' } });
    expect(validarMensagem(sessao(), ev)).toEqual({ ok: false, motivo: 'origem' });
  });
});

describe('fallback — remoção item a item', () => {
  const guardar = (itens: ItemPonte[]) =>
    localStorage.setItem(CHAVE_PONTE, JSON.stringify(itens));

  it('lê o que o template depositou', () => {
    guardar([{ id: 'a', chave: 'nr13_med_esp_X', valor: '{}' }]);
    expect(lerPonte()).toEqual([{ id: 'a', chave: 'nr13_med_esp_X', valor: '{}' }]);
  });

  it('ponte ausente ou corrompida devolve lista vazia, nunca lança', () => {
    expect(lerPonte()).toEqual([]);
    localStorage.setItem(CHAVE_PONTE, 'lixo{');
    expect(lerPonte()).toEqual([]);
    localStorage.setItem(CHAVE_PONTE, '{"a":1}');
    expect(lerPonte()).toEqual([]);
  });

  it('descarta entradas malformadas sem descartar as boas', () => {
    localStorage.setItem(
      CHAVE_PONTE,
      JSON.stringify([{ id: 'a', chave: 'k', valor: 'v' }, { lixo: true }]),
    );
    expect(lerPonte()).toHaveLength(1);
  });

  it('remover tira só um item', () => {
    guardar([
      { id: 'a', chave: 'k1', valor: 'v1' },
      { id: 'b', chave: 'k2', valor: 'v2' },
    ]);
    removerDaPonte('a');
    expect(lerPonte().map((i) => i.id)).toEqual(['b']);
  });

  it('remover o último limpa a chave', () => {
    guardar([{ id: 'a', chave: 'k', valor: 'v' }]);
    removerDaPonte('a');
    expect(localStorage.getItem(CHAVE_PONTE)).toBeNull();
  });

  it('limparPonte esvazia', () => {
    guardar([{ id: 'a', chave: 'k', valor: 'v' }]);
    limparPonte();
    expect(lerPonte()).toEqual([]);
  });
});

describe('drenagem — nada sai antes da confirmação', () => {
  const guardar = (itens: ItemPonte[]) =>
    localStorage.setItem(CHAVE_PONTE, JSON.stringify(itens));

  it('drena todos quando o salvamento funciona', async () => {
    guardar([
      { id: 'a', chave: 'k1', valor: 'v1' },
      { id: 'b', chave: 'k2', valor: 'v2' },
    ]);
    const salvar = vi.fn(async () => undefined);

    expect(await drenarPonte(salvar)).toEqual({ drenados: 2, falhas: 0 });
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(lerPonte()).toEqual([]);
  });

  it('falha no PRIMEIRO item preserva os seguintes', async () => {
    guardar([
      { id: 'a', chave: 'k1', valor: 'v1' },
      { id: 'b', chave: 'k2', valor: 'v2' },
      { id: 'c', chave: 'k3', valor: 'v3' },
    ]);
    const salvar = vi.fn(async (chave: string) => {
      if (chave === 'k1') throw new Error('falhou');
    });

    const r = await drenarPonte(salvar);

    // A versão anterior limpava a fila INTEIRA antes de salvar: uma falha no
    // primeiro item já tinha descartado b e c.
    expect(r).toEqual({ drenados: 2, falhas: 1 });
    expect(lerPonte().map((i) => i.id)).toEqual(['a']);
  });

  it('item que falhou continua na ponte para a próxima tentativa', async () => {
    guardar([{ id: 'a', chave: 'k1', valor: 'v1' }]);
    const salvar = vi.fn(async () => {
      throw new Error('offline');
    });

    await drenarPonte(salvar);
    expect(lerPonte()).toHaveLength(1);

    const salvarOk = vi.fn(async () => undefined);
    expect(await drenarPonte(salvarOk)).toEqual({ drenados: 1, falhas: 0 });
    expect(lerPonte()).toEqual([]);
  });

  it('a falha é reportada com o item e o erro, nunca engolida', async () => {
    guardar([{ id: 'a', chave: 'k1', valor: 'v1' }]);
    const capturado: Array<{ item: ItemPonte; erro: unknown }> = [];

    await drenarPonte(
      async () => {
        throw new Error('sem rede');
      },
      (item, erro) => capturado.push({ item, erro }),
    );

    expect(capturado).toHaveLength(1);
    expect(capturado[0].item.chave).toBe('k1');
    expect((capturado[0].erro as Error).message).toBe('sem rede');
  });

  it('ponte vazia é no-op', async () => {
    const salvar = vi.fn(async () => undefined);
    expect(await drenarPonte(salvar)).toEqual({ drenados: 0, falhas: 0 });
    expect(salvar).not.toHaveBeenCalled();
  });
});
