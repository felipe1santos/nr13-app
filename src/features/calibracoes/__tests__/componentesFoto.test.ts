import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A foto do componente de calibração (válvula/manômetro) era gravada em base64
 * dentro de `nr13_componentes_cal_<TAG>`. Medido na conta gabriel.dadona em
 * 11/08/2026: 8 componentes, 260–355 KB cada, 2.518 KB numa única chave — o
 * maior peso da conta depois dos certificados, e baixado a cada hidratação.
 */
const salvarMock = vi.fn<(chave: string, obj: unknown) => Promise<void>>(async () => {});
let lido: unknown = [];

vi.mock('../../../services/storage', () => ({
  salvar: (chave: string, obj: unknown) => salvarMock(chave, obj),
  ler: () => lido,
}));

const subirMock = vi.fn(async (_b: Blob, escopo: string, ext: string, mime: string) => ({
  bucket: 'inspecao',
  path: `org-1/${escopo}/novo.${ext}`,
  mimeType: mime,
  tamanho: 3,
}));

vi.mock('../../../services/fotos', () => ({
  salvarArquivo: (b: Blob, e: string, x: string, m: string) => subirMock(b, e, x, m),
}));

import { salvarComponente, fotoDoComponente, type ComponenteCal } from '../componentesService';

const FOTO = 'data:image/jpeg;base64,AAAA';

const comp = (over: Partial<ComponenteCal> = {}): ComponenteCal => ({
  id: 'c1',
  tipo: 'manometro',
  nome: 'Câmara Interna',
  criadoEm: '16/07/2026',
  ...over,
});

beforeEach(() => {
  salvarMock.mockClear();
  subirMock.mockClear();
  lido = [];
});

describe('foto do componente de calibração vai para o bucket', () => {
  it('foto nova sobe e o registro guarda só a referência', async () => {
    await salvarComponente('TAG-1', comp({ foto: FOTO }));

    expect(subirMock).toHaveBeenCalledTimes(1);
    const [, escopo, ext] = subirMock.mock.calls[0];
    expect(escopo).toBe('componentes');
    expect(ext).toBe('jpg');

    const [chave, lista] = salvarMock.mock.calls[0] as unknown as [string, ComponenteCal[]];
    expect(chave).toBe('nr13_componentes_cal_TAG-1');
    expect(lista[0].foto).toBe('');
    expect(lista[0].fotoRef?.path).toBe('org-1/componentes/novo.jpg');
  });

  it('componente que já tem ref não sobe de novo nem carrega base64 junto', async () => {
    const ref = { bucket: 'inspecao', path: 'org-1/componentes/velho.jpg', mimeType: 'image/jpeg', tamanho: 9 };
    // A tela pode ter resolvido a foto para exibir; esse valor não pode voltar
    // ao app_storage pela porta dos fundos.
    await salvarComponente('TAG-1', comp({ foto: FOTO, fotoRef: ref }));

    expect(subirMock).not.toHaveBeenCalled();
    const [, lista] = salvarMock.mock.calls[0] as unknown as [string, ComponenteCal[]];
    expect(lista[0].foto).toBe('');
    expect(lista[0].fotoRef?.path).toBe('org-1/componentes/velho.jpg');
  });

  it('falha no upload NÃO perde a foto do usuário — grava o base64', async () => {
    subirMock.mockRejectedValueOnce(new Error('sem organização ativa'));

    await salvarComponente('TAG-1', comp({ foto: FOTO }));

    const [, lista] = salvarMock.mock.calls[0] as unknown as [string, ComponenteCal[]];
    expect(lista[0].foto).toBe(FOTO);
    expect(lista[0].fotoRef).toBeUndefined();
  });

  it('componente sem foto nenhuma não chama o bucket', async () => {
    await salvarComponente('TAG-1', comp());
    expect(subirMock).not.toHaveBeenCalled();
  });

  it('fotoDoComponente entrega a ref quando existe e o base64 legado quando não', () => {
    const ref = { bucket: 'inspecao', path: 'p.jpg', mimeType: 'image/jpeg', tamanho: 1 };
    expect(fotoDoComponente(comp({ fotoRef: ref }))).toEqual({ ref });
    expect(fotoDoComponente(comp({ foto: FOTO }))).toBe(FOTO);
    expect(fotoDoComponente(comp())).toBeNull();
  });
});
