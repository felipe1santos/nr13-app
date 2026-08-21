/**
 * FASE 7B — logo e rubrica endereçadas por conteúdo.
 *
 * A promessa da fase é dupla: **deduplicar** (mesmos bytes = mesmo arquivo) e
 * **nunca devolver referência para arquivo que o servidor não confirmou**. Os
 * dois lados são testados aqui, e o segundo é o que protege o registro.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const est = vi.hoisted(() => ({
  uploads: [] as { path: string; bytes: number }[],
  pendentes: new Set<string>(),
  falharUpload: false,
  falharConfirmacao: false,
}));

/**
 * Dublê content-addressed: o path É o hash do conteúdo, como
 * `salvarArquivoPorConteudo` faz de verdade. Aqui o "hash" é o próprio texto do
 * blob — o que importa para o teste é que **conteúdo igual dá path igual**.
 */
vi.mock('./fotos', () => ({
  salvarArquivoPorConteudo: vi.fn(async (blob: Blob, escopo: string, ext: string, mime: string) => {
    if (est.falharUpload) throw new Error('sem organização ativa');
    const conteudo = await blob.text();
    const hash = [...conteudo].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
    const path = `org-1/${escopo}/${hash}.${ext}`;
    est.uploads.push({ path, bytes: blob.size });
    return { bucket: 'inspecao', path, mimeType: mime, tamanho: blob.size };
  }),
  arquivoPendente: vi.fn(async (path: string) => {
    if (est.falharConfirmacao) throw new Error('cofre indisponível');
    return est.pendentes.has(path);
  }),
}));

import {
  referenciaDaLogo,
  referenciaDaAssinatura,
  referenciaPorConteudo,
  paraGravar,
  ESCOPO_LOGO,
  ESCOPO_ASSINATURA,
} from './identidadeVisual';

const png = (txt: string) => new Blob([txt], { type: 'image/png' });
const jpg = (txt: string) => new Blob([txt], { type: 'image/jpeg' });

beforeEach(() => {
  est.uploads = [];
  est.pendentes.clear();
  est.falharUpload = false;
  est.falharConfirmacao = false;
});

// ---------------------------------------------------------------------------
describe('content-addressing', () => {
  it('a logo vai para `logos/` e a rubrica para `assinaturas/`', async () => {
    const l = await referenciaDaLogo(jpg('LOGO-A'));
    const a = await referenciaDaAssinatura(png('RUBRICA-A'));
    expect(l!.path).toContain(`/${ESCOPO_LOGO}/`);
    expect(l!.path).toMatch(/\.jpg$/);
    expect(a!.path).toContain(`/${ESCOPO_ASSINATURA}/`);
    expect(a!.path).toMatch(/\.png$/);
  });

  it('a extensão sai do mime dos bytes, não do nome do arquivo enviado', async () => {
    expect((await referenciaPorConteudo(png('X'), 'logos'))!.path).toMatch(/\.png$/);
    expect((await referenciaPorConteudo(jpg('X'), 'logos'))!.path).toMatch(/\.jpg$/);
    expect((await referenciaPorConteudo(new Blob(['X'], { type: 'image/webp' }), 'logos'))!.path)
      .toMatch(/\.webp$/);
  });
});

describe('deduplicação — conteúdo é a identidade', () => {
  it('A · a MESMA logo duas vezes: mesmo path, nenhum arquivo novo', async () => {
    const p1 = (await referenciaDaLogo(jpg('LOGO-A')))!.path;
    const p2 = (await referenciaDaLogo(jpg('LOGO-A')))!.path;

    expect(p2).toBe(p1);
    // `salvarArquivoPorConteudo` é chamada de novo, mas escreve no MESMO
    // endereço — reescrever bytes idênticos não cria um segundo arquivo.
    expect(new Set(est.uploads.map((u) => u.path)).size).toBe(1);
  });

  it('B · a mesma rubrica em dois funcionários dá a mesma referência', async () => {
    const a = await referenciaDaAssinatura(png('RUBRICA-JOAO'));
    const b = await referenciaDaAssinatura(png('RUBRICA-JOAO'));
    expect(b!.path).toBe(a!.path);
    expect(new Set(est.uploads.map((u) => u.path)).size).toBe(1);
  });

  it('C · imagem diferente → hash diferente → arquivo novo', async () => {
    const a = (await referenciaDaLogo(jpg('LOGO-A')))!.path;
    const b = (await referenciaDaLogo(jpg('LOGO-B')))!.path;
    expect(b).not.toBe(a);
    expect(new Set(est.uploads.map((u) => u.path)).size).toBe(2);
  });

  it('D · voltar exatamente para os bytes da LOGO A reaproveita o arquivo A', async () => {
    const a = (await referenciaDaLogo(jpg('LOGO-A')))!.path;
    await referenciaDaLogo(jpg('LOGO-B'));
    const deVolta = (await referenciaDaLogo(jpg('LOGO-A')))!.path;

    expect(deVolta).toBe(a);
    // Dois endereços no total — o de A e o de B. O de B **continua existindo**.
    expect(new Set(est.uploads.map((u) => u.path)).size).toBe(2);
  });

  it('um byte diferente já muda o endereço', async () => {
    const a = (await referenciaDaLogo(jpg('LOGO-A')))!.path;
    const b = (await referenciaDaLogo(jpg('LOGO-a')))!.path;
    expect(b).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------
// O que protege o registro
// ---------------------------------------------------------------------------
describe('nenhuma referência sem confirmação do servidor', () => {
  it('upload ainda PENDENTE não vira referência', async () => {
    // Tudo que subir fica pendente.
    const espiao = await referenciaDaLogo(jpg('PRIMEIRA'));
    est.pendentes.add(espiao!.path);

    expect(await referenciaDaLogo(jpg('PRIMEIRA'))).toBeNull();
  });

  it('falha no upload devolve null — o cadastro segue com a dataURL', async () => {
    est.falharUpload = true;
    expect(await referenciaDaLogo(jpg('LOGO-A'))).toBeNull();
    expect(est.uploads).toHaveLength(0);
  });

  it('falha na CONFIRMAÇÃO devolve null — trata como pendente', async () => {
    est.falharConfirmacao = true;
    expect(await referenciaDaAssinatura(png('R'))).toBeNull();
  });

  it('blob vazio não vira referência nem sobe nada', async () => {
    expect(await referenciaDaLogo(new Blob([], { type: 'image/jpeg' }))).toBeNull();
    expect(est.uploads).toHaveLength(0);
  });
});

describe('paraGravar — a gravação dupla da D-11', () => {
  it('com confirmação: dataURL **e** referência', async () => {
    const r = await paraGravar({ dataUrl: 'data:image/jpeg;base64,AAA', blob: jpg('LOGO-A') }, ESCOPO_LOGO);
    expect(r.dataUrl).toBe('data:image/jpeg;base64,AAA');
    expect(r.ref?.path).toContain('/logos/');
  });

  it('sem confirmação: só a dataURL — o cadastro NUNCA se perde', async () => {
    est.falharUpload = true;
    const r = await paraGravar({ dataUrl: 'data:image/jpeg;base64,AAA', blob: jpg('LOGO-A') }, ESCOPO_LOGO);
    expect(r.dataUrl).toBe('data:image/jpeg;base64,AAA');
    expect(r.ref).toBeUndefined();
  });

  it('nunca devolve URL assinada — só bucket, path, mime e tamanho', async () => {
    const r = await paraGravar({ dataUrl: 'data:image/png;base64,AAA', blob: png('R') }, ESCOPO_ASSINATURA);
    const bruto = JSON.stringify(r.ref);
    expect(bruto).not.toMatch(/https?:\/\//);
    expect(bruto).not.toMatch(/token=/);
    expect(Object.keys(r.ref!).sort()).toEqual(['bucket', 'mimeType', 'path', 'tamanho']);
  });
});
