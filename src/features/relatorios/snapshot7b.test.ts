/**
 * FASE 7B — o snapshot congela a REFERÊNCIA daquele momento.
 *
 * O teste que importa é o histórico A/B: gerar o documento A com a LOGO A,
 * trocar para a LOGO B, gerar o documento B, e provar que **A continua A**.
 *
 * Antes desta fase isso dependia de a cópia da imagem ter sido feita no
 * momento certo. Agora é consequência do endereço: o path É o hash do
 * conteúdo, então o snapshot A aponta para o hash de A e não há como ele passar
 * a apontar para outro.
 */
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

const banco = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../../services/storage', () => ({
  ler: vi.fn(<T,>(c: string): T | null => (banco.has(c) ? (banco.get(c) as T) : null)),
  salvar: vi.fn(async (c: string, v: unknown) => void banco.set(c, v)),
  lerCru: vi.fn(() => null),
  excluirChave: vi.fn(async () => {}),
  listarChavesDaTag: vi.fn(() => []),
  listarChavesComPrefixo: vi.fn(() => []),
  bloqueadoParaEscrita: vi.fn(() => false),
}));

import { snapshotEmpresa, snapshotAssinantes } from './relatoriosService';
import type { Funcionario } from '../cadastros/tipos';

const REF_A = { bucket: 'inspecao', path: 'org-1/logos/hashA.jpg', mimeType: 'image/jpeg', tamanho: 7000 };
const REF_B = { bucket: 'inspecao', path: 'org-1/logos/hashB.jpg', mimeType: 'image/jpeg', tamanho: 7100 };
const RUB_A = { bucket: 'inspecao', path: 'org-1/assinaturas/rubA.png', mimeType: 'image/png', tamanho: 12000 };
const RUB_B = { bucket: 'inspecao', path: 'org-1/assinaturas/rubB.png', mimeType: 'image/png', tamanho: 12500 };

const eng = (extra: Partial<Funcionario> = {}): Funcionario =>
  ({ id: 'e1', nome: 'Eng', crea: '123', tipo: 'Engenheiro', ...extra }) as Funcionario;

beforeEach(() => banco.clear());

// ---------------------------------------------------------------------------
describe('snapshot da empresa', () => {
  it('com `logoRef`, congela a REFERÊNCIA e a dataURL SAI', () => {
    banco.set('nr13_minha_empresa', {
      razao: 'ACME',
      logo: 'data:image/jpeg;base64,AAAA',
      logoRef: REF_A,
    });

    const s = snapshotEmpresa()!;

    expect(s.logoRef).toEqual(REF_A);
    expect(s.logo).toBeUndefined(); // é daqui que vem o ganho
    expect(s.razao).toBe('ACME');
  });

  it('SEM `logoRef` (organização que ainda não regravou), nada muda', () => {
    const viva = { razao: 'ACME', logo: 'data:image/jpeg;base64,LEGADA' };
    banco.set('nr13_minha_empresa', viva);

    const s = snapshotEmpresa()!;

    expect(s.logo).toBe('data:image/jpeg;base64,LEGADA');
    expect(s.logoRef).toBeUndefined();
  });

  it('o snapshot com referência é ordens de grandeza menor', () => {
    const logoGorda = 'data:image/jpeg;base64,' + 'A'.repeat(7 * 1024);
    banco.set('nr13_minha_empresa', { razao: 'ACME', logo: logoGorda });
    const antes = JSON.stringify(snapshotEmpresa()).length;

    banco.set('nr13_minha_empresa', { razao: 'ACME', logo: logoGorda, logoRef: REF_A });
    const depois = JSON.stringify(snapshotEmpresa()).length;

    expect(depois).toBeLessThan(antes / 20);
  });

  it('sem chave viva, devolve undefined — sem inventar nada', () => {
    expect(snapshotEmpresa()).toBeUndefined();
  });
});

describe('snapshot dos assinantes', () => {
  it('com `assinaturaRef`, congela a referência e a dataURL SAI', () => {
    const s = snapshotAssinantes(
      { engenheiroId: 'e1', tecnicoId: null, assinanteTermoLivro: 'engenheiro' },
      [eng({ assinatura: 'data:image/png;base64,AAAA', assinaturaRef: RUB_A })],
    );
    expect(s.engenheiro!.assinaturaRef).toEqual(RUB_A);
    expect(s.engenheiro!.assinatura).toBeUndefined();
  });

  it('sem referência, congela a dataURL como sempre fez', () => {
    const s = snapshotAssinantes(
      { engenheiroId: 'e1', tecnicoId: null, assinanteTermoLivro: 'engenheiro' },
      [eng({ assinatura: 'data:image/png;base64,LEGADA' })],
    );
    expect(s.engenheiro!.assinatura).toBe('data:image/png;base64,LEGADA');
    expect(s.engenheiro!.assinaturaRef).toBeUndefined();
  });

  it('o resto do snapshot continua congelado igual', () => {
    const s = snapshotAssinantes(
      { engenheiroId: 'e1', tecnicoId: null, assinanteTermoLivro: 'engenheiro' },
      [eng({ funcao: 'Engenheiro Mecânico', assinaturaRef: RUB_A, camposExtras: [{ rotulo: 'CRQ', valor: '9' }] })],
    );
    expect(s.engenheiro!.nome).toBe('Eng');
    expect(s.engenheiro!.funcao).toBe('Engenheiro Mecânico');
    expect(s.engenheiro!.crea).toBe('123');
    expect(s.engenheiro!.camposExtras).toEqual([{ rotulo: 'CRQ', valor: '9' }]);
  });
});

// ---------------------------------------------------------------------------
// O TESTE HISTÓRICO — bloqueante
// ---------------------------------------------------------------------------
describe('A continua A depois de B', () => {
  it('trocar a logo NÃO altera o snapshot já congelado', () => {
    // 1. LOGO A → documento A
    banco.set('nr13_minha_empresa', { razao: 'ACME', logo: 'data:...A', logoRef: REF_A });
    const docA = snapshotEmpresa()!;

    // 2. usuário troca para LOGO B
    banco.set('nr13_minha_empresa', { razao: 'ACME', logo: 'data:...B', logoRef: REF_B });
    const docB = snapshotEmpresa()!;

    // 3. o veredito
    expect(docA.logoRef).toEqual(REF_A);
    expect(docB.logoRef).toEqual(REF_B);
    expect(docA.logoRef).not.toEqual(docB.logoRef);
  });

  it('trocar a rubrica NÃO altera o snapshot já congelado', () => {
    const docA = snapshotAssinantes({ engenheiroId: 'e1', tecnicoId: null, assinanteTermoLivro: 'engenheiro' }, [eng({ assinaturaRef: RUB_A })]);
    const docB = snapshotAssinantes({ engenheiroId: 'e1', tecnicoId: null, assinanteTermoLivro: 'engenheiro' }, [eng({ assinaturaRef: RUB_B })]);

    expect(docA.engenheiro!.assinaturaRef).toEqual(RUB_A);
    expect(docB.engenheiro!.assinaturaRef).toEqual(RUB_B);
  });

  it('o snapshot A nunca aponta para a imagem viva — o path é o hash de A', () => {
    banco.set('nr13_minha_empresa', { logo: 'data:...A', logoRef: REF_A });
    const docA = snapshotEmpresa()!;
    banco.set('nr13_minha_empresa', { logo: 'data:...B', logoRef: REF_B });

    // Nada no snapshot A referencia "a logo atual". Só o endereço do conteúdo A.
    expect(JSON.stringify(docA)).toContain('hashA');
    expect(JSON.stringify(docA)).not.toContain('hashB');
  });
});
