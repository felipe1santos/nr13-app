/**
 * REGRA Nº 1 DE CUSTO (docs/REGRAS-DE-CUSTO.md): nenhuma chamada paga sem passar pela guarda;
 * nunca em loop. Este teste roda no `npm test` e QUEBRA se:
 *  1. aparecer chamada a host de API paga fora dos arquivos autorizados;
 *  2. alguém puser segredo de servidor numa variável pública (VITE_*);
 *  3. a busca do Places deixar de passar pela guarda.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { chaveDoArtefato } from '../features/relatorios/artefatoRelatorio';

const RAIZ = join(__dirname, '..', '..');
const PASTAS = ['src', 'public', 'supabase/functions', 'scripts'];
const EXT = /\.(ts|tsx|js|mjs|mts|html)$/;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === 'dist' || nome.startsWith('.')) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (EXT.test(nome) && !/\.test\.(ts|tsx|mjs)$/.test(nome)) out.push(p);
  }
  return out;
}

const TODOS = PASTAS.flatMap((d) => arquivos(join(RAIZ, d))).map((p) => ({
  rel: relative(RAIZ, p).split(sep).join('/'),
  src: readFileSync(p, 'utf8'),
}));

/**
 * Host pago → arquivos onde a chamada é PERMITIDA (e por quê). Acrescentar um arquivo aqui
 * exige passar pela guarda (navegador) ou ter teto próprio documentado (servidor).
 */
const HOSTS_PAGOS: Record<string, string[]> = {
  // Navegador: só pela guarda (chamarPago em googlePlaces.ts).
  'places.googleapis.com': ['src/services/googlePlaces.ts'],
  'maps.googleapis.com': [],
  // Edge: teto por execução (trial/lembretes.ts) e por chamada (admin: 90 destinatários).
  'api.resend.com': ['supabase/functions/trial/index.ts', 'supabase/functions/admin/index.ts'],
  'api.openai.com': [],
  'api.anthropic.com': [],
  'generativelanguage.googleapis.com': [],
  'api.twilio.com': [],
  'api.sendgrid.com': [],
  'api.z-api.io': [],
};

describe('Regra nº 1 de custo', () => {
  for (const [host, permitidos] of Object.entries(HOSTS_PAGOS)) {
    it(`${host} só é chamado de arquivo autorizado`, () => {
      const usos = TODOS.filter((f) => f.src.includes(host)).map((f) => f.rel);
      expect(usos.filter((u) => !permitidos.includes(u))).toEqual([]);
    });
  }

  it('a busca do Places passa pela guarda (chamarPago)', () => {
    const f = TODOS.find((x) => x.rel === 'src/services/googlePlaces.ts')!;
    expect(f.src).toMatch(/chamarPago\(\s*'google_places_text_search'/);
    // o fetch pago só existe dentro de consultarPlaces, que só é chamado pela guarda
    expect(f.src.match(/consultarPlaces\(/g)?.length).toBe(2); // definição + dentro de chamarPago
  });

  it('nenhum segredo de servidor em variável pública (VITE_*)', () => {
    const SEGREDO = /VITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET|SEGREDO|PRIVATE|RESEND|OPENAI|ANTHROPIC|PAT\b|KIWIFY|TWILIO|SENDGRID|PASSWORD|SENHA)/;
    const achados = TODOS.filter((f) => SEGREDO.test(f.src)).map((f) => f.rel);
    const envs = ['.env.example'].map((n) => readFileSync(join(RAIZ, n), 'utf8'));
    expect(achados).toEqual([]);
    expect(envs.some((e) => SEGREDO.test(e))).toBe(false);
  });

  it('nenhuma chave literal do Google ou service_role no código versionado', () => {
    const CHAVE = /AIza[0-9A-Za-z_-]{30,}|sb_secret_[0-9A-Za-z_-]{10,}/;
    expect(TODOS.filter((f) => CHAVE.test(f.src)).map((f) => f.rel)).toEqual([]);
  });
});

describe('VisualizadorPdf não baixa o PDF de novo a cada render', () => {
  it('objeto novo com o mesmo arquivo = mesma chave', () => {
    const a = { pdfRef: { path: 'org/relatorios/x.pdf' }, sha256: 'ab' } as never;
    const b = { pdfRef: { path: 'org/relatorios/x.pdf' }, sha256: 'ab' } as never;
    expect(chaveDoArtefato(a)).toBe(chaveDoArtefato(b));
    expect(chaveDoArtefato(a)).not.toBe(chaveDoArtefato({ pdfRef: { path: 'y.pdf' }, sha256: 'ab' } as never));
  });

  it('o efeito do download depende só da chave do arquivo', () => {
    const f = TODOS.find((x) => x.rel === 'src/components/VisualizadorPdf.tsx')!;
    const efeito = f.src.slice(f.src.indexOf('void baixarArtefato('));
    expect(efeito.slice(0, efeito.indexOf('if (estado ==='))).toMatch(/\}, \[chave\]\);/);
  });
});
