/**
 * Fase 6.3 · o PRONTUÁRIO no Portal serve o ARQUIVO emitido, não remonta.
 *
 * Antes: `PortalAtivo.abrirProntuario` materializava o rascunho vivo e montava
 * as folhas `PRONT-*.html` com os dados de hoje; a Edge nem entregava
 * `nr13_pront_emitido_<TAG>`. Agora a emissão vigente (gerada OU anexada) abre
 * pelo `pdfRef` → `portal_arquivo` → os mesmos bytes. Letras = §24 do pedido.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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

const upserts: unknown[] = [];
vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async (x: unknown) => (upserts.push(x), { error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { prontuarioNoPortal } from './prontuarioPortal';
import {
  PREFIXOS_POR_TAG,
  FORA_DO_PORTAL,
  chavesDoCliente,
  chaveAutorizadaSobDemanda,
} from '../../../supabase/functions/portal_cliente/prefixos';
import { sanearParaPortal as sanearCliente } from '../../../supabase/functions/portal_cliente/oficialidade';
import { sanearParaPortal as sanearArquivo } from '../../../supabase/functions/portal_arquivo/oficialidade';

const TAG = 'ZZ-PORTAL-63';
const g = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const ref = (n: string) => ({ bucket: 'inspecao', path: `org/relatorios/${n}.pdf`, mimeType: 'application/pdf', tamanho: 10 });
const emissao = (id: string, geradoEm: string, extra: Record<string, unknown> = {}) => ({
  id,
  tag: TAG,
  numero: `REL-${id}`,
  emissao: '10/09/2026',
  motor: 'vetorial',
  pdfRef: ref(id),
  sha256: `sha-${id}`,
  paginas: 3,
  tamanho: 10,
  geradoEm,
  pdfPendente: false,
  ...extra,
});
const retrato = () => {
  const r: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) r[localStorage.key(i)!] = localStorage.getItem(localStorage.key(i)!)!;
  return r;
};

beforeEach(() => {
  localStorage.clear();
  upserts.length = 0;
  // O rascunho vivo SEMPRE existe nos casos abaixo: é ele que o Portal
  // remontava. Com emissão, ele tem de ser ignorado.
  g(`nr13_prontuario_${TAG}`, { tag: TAG, criadoEm: '01/09/2026', modelo: 'FABRICANTE ALTERADO' });
});

describe('A/B · a emissão vigente abre como ARQUIVO', () => {
  it('A · gerado vigente → pdfRef e SHA dele', () => {
    g(`nr13_pront_emitido_${TAG}`, [emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z'), emissao('PRONT-1788500000000-r2', '2026-09-05T10:00:00Z')]);
    const p = prontuarioNoPortal(TAG);
    expect(p?.tipo).toBe('arquivo');
    if (p?.tipo !== 'arquivo') return;
    expect(p.artefato.pdfRef.path).toBe('org/relatorios/PRONT-1788500000000-r2.pdf');
    expect(p.artefato.sha256).toBe('sha-PRONT-1788500000000-r2');
    expect(p.rotuloOrigem).toBe('GERADO PELO SISTEMA');
  });

  it('B · anexado mais recente é o vigente → o ORIGINAL anexado', () => {
    g(`nr13_pront_emitido_${TAG}`, [
      emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z'),
      emissao('PRONT-1788900000000-anexo1', '2026-09-09T10:00:00Z', { origem: 'anexado', arquivoNome: 'original.pdf' }),
    ]);
    const p = prontuarioNoPortal(TAG);
    expect(p?.tipo).toBe('arquivo');
    if (p?.tipo !== 'arquivo') return;
    expect(p.artefato.pdfRef.path).toBe('org/relatorios/PRONT-1788900000000-anexo1.pdf');
    expect(p.rotuloOrigem).toBe('PDF ANEXADO');
    expect(p.nomeArquivo).toBe('original.pdf');
  });

  it('a emissão RETIRADA (removidoEm) não é vigente', () => {
    g(`nr13_pront_emitido_${TAG}`, [
      emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z'),
      emissao('PRONT-1788500000000-r2', '2026-09-05T10:00:00Z', { removidoEm: '2026-09-06T00:00:00Z' }),
    ]);
    const p = prontuarioNoPortal(TAG);
    expect(p?.tipo === 'arquivo' && p.artefato.pdfRef.path).toBe('org/relatorios/PRONT-1788000000000-r1.pdf');
  });
});

describe('C · dados vivos não entram', () => {
  it('o documento aberto é só o artefato — nada do rascunho/ficha de hoje', () => {
    g(`nr13_pront_emitido_${TAG}`, [emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z')]);
    const antes = prontuarioNoPortal(TAG);
    g(`nr13_prontuario_${TAG}`, { tag: TAG, criadoEm: '25/09/2026', modelo: 'OUTRO FABRICANTE' });
    g(`nr13_info_${TAG}`, { fabricante: 'FABRICANTE ALTERADO DEPOIS' });
    expect(prontuarioNoPortal(TAG)).toEqual(antes);
  });
});

describe('H · emissão sem arquivo NÃO vira remontagem', () => {
  it('sem pdfRef → indisponível (e não "legado")', () => {
    g(`nr13_pront_emitido_${TAG}`, [{ ...emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z'), pdfRef: undefined }]);
    expect(prontuarioNoPortal(TAG)?.tipo).toBe('indisponivel');
  });
});

describe('C/D/E · sem prontuário oficial: "ainda não emitido", nada é remontado', () => {
  it('C · só o rascunho → naoEmitido, sem artefato', () => {
    const p = prontuarioNoPortal(TAG);
    expect(p.tipo).toBe('naoEmitido');
    expect(p.descricao).toBe('Prontuário ainda não emitido.');
    expect('artefato' in p).toBe(false);
  });

  it('D · rascunho + meta (nº e data) continua não emitido', () => {
    g(`nr13_prontuario_meta_${TAG}`, { numero: 'REL-1', emissao: '01/09/2026' });
    expect(prontuarioNoPortal(TAG).tipo).toBe('naoEmitido');
  });

  it('E · rascunho + PDF do fabricante: o legado NÃO vira oficial', () => {
    g(`nr13_pront_fab_${TAG}`, { nome: 'fab.pdf', pdfRef: ref('fab'), tamanho: 1, enviadoEm: '2026-01-01' });
    expect(prontuarioNoPortal(TAG).tipo).toBe('naoEmitido');
  });

  it('nem o rascunho existir muda o estado (a Edge nem o entrega mais)', () => {
    localStorage.clear();
    expect(prontuarioNoPortal(TAG).tipo).toBe('naoEmitido');
  });
});

describe('I · Portal read-only', () => {
  it('resolver o prontuário não grava nada', () => {
    g(`nr13_pront_emitido_${TAG}`, [emissao('PRONT-1788000000000-r1', '2026-09-01T10:00:00Z')]);
    const antes = retrato();
    prontuarioNoPortal(TAG);
    expect(retrato()).toEqual(antes);
    expect(upserts).toHaveLength(0);
  });
});

describe('J · a tela não tem mais caminho de remontagem', () => {
  const tela = readFileSync('src/pages/portal/PortalAtivo.tsx', 'utf8');
  const corpo = tela.slice(tela.indexOf('async function abrirProntuario()'), tela.indexOf('function fecharVisualizador()'));

  it('abrirProntuario só abre o ARTEFATO oficial', () => {
    expect(corpo).toContain("if (prontPortal.tipo !== 'arquivo') return;");
    expect(corpo).toContain('artefato: prontPortal.artefato');
    expect(corpo).not.toContain('materializarProntuarioAtual');
    expect(corpo).not.toContain('arquivos-prontuario');
    // (o comentário cita "`salvar()`" entre crases; chamada de verdade não tem crase antes)
    expect(corpo).not.toMatch(/(^|[^`\w])salvar\s*\(/m);
  });

  it('nenhuma folha PRONT-*.html nem o rascunho no Portal', () => {
    expect(tela).not.toContain('/arquivos-prontuario/');
    expect(tela).not.toContain('materializarProntuarioAtual');
    expect(tela).not.toContain('carregarProntuario');
    expect(tela).not.toContain('paginasProntuario');
  });

  it('o botão Visualizar do prontuário só existe para o documento oficial', () => {
    const item = tela.slice(tela.indexOf('data-teste="portal-prontuario"'), tela.indexOf('{prontFabricante && ('));
    expect(item).toContain("{prontPortal.tipo === 'arquivo' && (");
    expect(item.match(/Visualizar/g)).toHaveLength(1);
  });
});


describe('Edge · a lista de emissões chega ao Portal, sem as retiradas', () => {
  it('nr13_pront_emitido_ é buscada na carga inicial, e não está mais em FORA_DO_PORTAL', () => {
    expect(PREFIXOS_POR_TAG).toContain('nr13_pront_emitido_');
    expect(FORA_DO_PORTAL).not.toContain('nr13_pront_emitido_');
    expect(chavesDoCliente([TAG])).toContain(`nr13_pront_emitido_${TAG}`);
  });

  it('o RASCUNHO do prontuário não chega ao cliente (nem na carga, nem sob demanda)', () => {
    for (const p of ['nr13_prontuario_', 'nr13_prontuario_meta_', 'nr13_assinantes_pront_']) {
      expect(PREFIXOS_POR_TAG, p).not.toContain(p);
      expect(FORA_DO_PORTAL, p).toContain(p);
      expect(chavesDoCliente([TAG]), p).not.toContain(`${p}${TAG}`);
      expect(chaveAutorizadaSobDemanda(`${p}${TAG}`, [TAG]), p).toBe(false);
    }
  });

  it('G · só das TAGs do cliente: TAG alheia não é autorizada', () => {
    expect(chavesDoCliente(['TAG-A'])).not.toContain('nr13_pront_emitido_TAG-B');
    expect(chaveAutorizadaSobDemanda('nr13_pront_emitido_TAG-B', ['TAG-A'])).toBe(false);
    expect(chaveAutorizadaSobDemanda('nr13_pront_emitido_TAG-A', ['TAG-A'])).toBe(true);
  });

  it('a emissão retirada sai no servidor — as duas Edges com a mesma regra', () => {
    const valor = JSON.stringify([
      emissao('r1', '2026-09-01T10:00:00Z'),
      emissao('r2', '2026-09-05T10:00:00Z', { removidoEm: '2026-09-06T00:00:00Z' }),
    ]);
    for (const sanear of [sanearCliente, sanearArquivo]) {
      const saida = JSON.parse(sanear(`nr13_pront_emitido_${TAG}`, valor)!);
      expect(saida.map((e: { id: string }) => e.id)).toEqual(['r1']);
    }
    // Sem retirada, os MESMOS bytes.
    const intacto = JSON.stringify([emissao('r1', '2026-09-01T10:00:00Z')]);
    expect(sanearCliente(`nr13_pront_emitido_${TAG}`, intacto)).toBe(intacto);
  });

  it('as duas cópias de oficialidade.ts continuam idênticas', () => {
    expect(readFileSync('supabase/functions/portal_arquivo/oficialidade.ts', 'utf8')).toBe(
      readFileSync('supabase/functions/portal_cliente/oficialidade.ts', 'utf8'),
    );
  });
});
