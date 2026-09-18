import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Revisão do engenheiro (18/09/2026) · a LOGO do Certificado de Calibração.
 *
 * ## O defeito
 *
 * Aberto na tela de Calibrações, o certificado mostrava a logo: a folha monta
 * pelo PALCO, que troca a referência (`logoRef`) pela imagem. Anexado ao
 * relatório, o canto superior esquerdo saía VAZIO: o host isolado
 * (`hostCertificado`) copiava o snapshot da meta cru — e o snapshot, desde a
 * Fase 7B, tem só `logoRef`. O template lê `dados.logo`, não achava, e ficava
 * com `src="logo.webp"`: arquivo que não existe em `/arquivos-inspecao/`.
 *
 * ## O que este arquivo trava
 *
 * 1. As chaves que a folha lê chegam ao `localStorage` com a logo RESOLVIDA,
 *    pela mesma função do palco — e somem depois.
 * 2. Nenhum template de certificado usa mais o placeholder inexistente.
 * 3. O detector de "folha montada sem a logo que a empresa tem" funciona.
 * 4. O host usa `hidratarFotosDoBucket` (um caminho só) e não uma cópia.
 */

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const LOGO_DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGNgYGBoaGgAAAMHAYHq5YhcAAAAAElFTkSuQmCC';
const baixados: string[] = [];

vi.mock('../../../services/fotos', async (original) => {
  const real = await original<typeof import('../../../services/fotos')>();
  return {
    ...real,
    baixarFoto: async (ref: { path: string }) => {
      baixados.push(ref.path);
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    },
    blobParaDataUrl: async () => LOGO_DATAURL,
  };
});

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

// O CACHE (armazenamento v2) é um Map fora do `localStorage` — é por isso que a
// folha precisa que o host materialize as chaves. Aqui ele é este Map.
const cache = new Map<string, unknown>();
vi.mock('../../../services/storage', async (original) => {
  const real = await original<typeof import('../../../services/storage')>();
  return { ...real, ler: <T,>(k: string) => (cache.has(k) ? (cache.get(k) as T) : null) };
});

import { LOGO_VAZIA, empresaTemLogo, logoAusenteNaFolha, materializarChaves } from './hostCertificado';

const REF = { bucket: 'inspecao', path: 'org-x/logos/abc123.png', mimeType: 'image/png', tamanho: 10 };
const DOC = 'CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1';

beforeEach(() => {
  localStorage.clear();
  cache.clear();
  baixados.length = 0;
  cache.set('nr13_calibracao_item_cal-1', { id: 'cal-1', tipo: 'manometro', numeroCertificado: 'CERT-1' });
});

describe('a folha anexada recebe a logo resolvida', () => {
  it('snapshot da meta só com `logoRef` → a folha lê `empresa.logo` como imagem', async () => {
    cache.set('nr13_relatorio_meta_atual', { codigo: 'R1', empresa: { razao: 'ACME', logoRef: REF } });
    cache.set('nr13_minha_empresa', { razao: 'ACME', logoRef: REF });
    const desfazer = await materializarChaves(DOC);

    const meta = JSON.parse(localStorage.getItem('nr13_relatorio_meta_atual')!);
    expect(meta.empresa.logo).toBe(LOGO_DATAURL);
    expect(meta.empresa.logoRef).toEqual(REF); // a referência continua lá
    const viva = JSON.parse(localStorage.getItem('nr13_minha_empresa')!);
    expect(viva.logo).toBe(LOGO_DATAURL);
    expect(baixados).toContain(REF.path);

    // O item da calibração vai cru (não tem referência a resolver).
    expect(JSON.parse(localStorage.getItem('nr13_calibracao_item_cal-1')!).numeroCertificado).toBe('CERT-1');

    desfazer();
    expect(localStorage.getItem('nr13_relatorio_meta_atual')).toBeNull();
    expect(localStorage.getItem('nr13_minha_empresa')).toBeNull();
    expect(localStorage.getItem('nr13_calibracao_item_cal-1')).toBeNull();
  });

  it('logo JÁ congelada como dataURL vence — nunca é trocada pela de hoje', async () => {
    const congelada = 'data:image/png;base64,QUFB';
    cache.set('nr13_relatorio_meta_atual', { empresa: { razao: 'ACME', logo: congelada, logoRef: REF } });
    const desfazer = await materializarChaves(DOC);
    expect(JSON.parse(localStorage.getItem('nr13_relatorio_meta_atual')!).empresa.logo).toBe(congelada);
    desfazer();
  });

  it('o container de campo NÃO é hidratado (a folha não imprime foto nenhuma)', async () => {
    cache.set('nr13_injecao_atual', { visual_externo: { fotos: [{ ref: { bucket: 'inspecao', path: 'org-x/fotos/f1.jpg' } }] } });
    const desfazer = await materializarChaves(DOC);
    expect(baixados).not.toContain('org-x/fotos/f1.jpg');
    expect(localStorage.getItem('nr13_injecao_atual')).not.toBeNull();
    desfazer();
  });

  it('chave que JÁ está no localStorage (palco montado) não é tocada', async () => {
    localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razao: 'DO PALCO', logo: 'data:image/png;base64,UEFM' }));
    cache.set('nr13_minha_empresa', { razao: 'DO CACHE', logoRef: REF });
    const desfazer = await materializarChaves(DOC);
    expect(JSON.parse(localStorage.getItem('nr13_minha_empresa')!).razao).toBe('DO PALCO');
    desfazer();
    expect(JSON.parse(localStorage.getItem('nr13_minha_empresa')!).razao).toBe('DO PALCO');
  });
});

describe('o detector de logo ausente', () => {
  const folha = (src: string | null) =>
    ({ getElementById: () => (src === null ? null : { getAttribute: () => src }) }) as unknown as Document;

  it('acusa placeholder, vazio, logo.webp e img inexistente — quando a empresa TEM logo', () => {
    expect(logoAusenteNaFolha(folha(LOGO_VAZIA), true)).toBe(true);
    expect(logoAusenteNaFolha(folha(''), true)).toBe(true);
    expect(logoAusenteNaFolha(folha('logo.webp'), true)).toBe(true);
    expect(logoAusenteNaFolha(folha('/arquivos-inspecao/logo.webp'), true)).toBe(true);
    expect(logoAusenteNaFolha(folha(null), true)).toBe(true);
    expect(logoAusenteNaFolha(folha(LOGO_DATAURL), true)).toBe(false);
  });

  it('empresa sem logo cadastrada não é defeito', () => {
    expect(logoAusenteNaFolha(folha(LOGO_VAZIA), false)).toBe(false);
  });

  it('sabe se a empresa tem logo pela referência OU pela dataURL', () => {
    expect(empresaTemLogo()).toBe(false);
    cache.set('nr13_minha_empresa', { logoRef: REF });
    expect(empresaTemLogo()).toBe(true);
    cache.set('nr13_relatorio_meta_atual', { empresa: { logo: LOGO_DATAURL } });
    expect(empresaTemLogo()).toBe(true);
  });
});

describe('os templates de certificado', () => {
  for (const arq of ['CERTIFICADO-CAL-MANOMETRO.html', 'CERTIIFCADO-CAL-PSV.html']) {
    const html = readFileSync(`public/arquivos-inspecao/${arq}`, 'utf8');

    it(`${arq}: não aponta mais para o logo.webp inexistente`, () => {
      expect(html).not.toMatch(/src="logo\.webp"/);
      expect(html).toContain(`id="imgLogo" src="${LOGO_VAZIA}"`);
    });

    it(`${arq}: continua lendo a logo de \`dados.logo\` (o campo que o palco e o host preenchem)`, () => {
      expect(html).toContain("if (dados.logo) document.getElementById('imgLogo').src = dados.logo;");
    });
  }

  it('o PSV imprime a unidade do instrumento nas três pressões', () => {
    const psv = readFileSync('public/arquivos-inspecao/CERTIIFCADO-CAL-PSV.html', 'utf8');
    expect(psv.match(/<span class="inj-unid-psv"><\/span>/g)).toHaveLength(3);
    expect(psv).toContain("el.textContent = ' (' + c.unidade + ')'");
  });
});

describe('um caminho só', () => {
  it('o host resolve a logo com a função do palco, não com uma cópia', () => {
    const src = readFileSync('src/features/relatorios/pdfVetorial/hostCertificado.ts', 'utf8');
    expect(src).toContain('hidratarFotosDoBucket');
    expect(src).toContain('refsNoLugarDaChave');
    expect(src).not.toMatch(/baixarFoto|blobParaDataUrl/);
  });
});
