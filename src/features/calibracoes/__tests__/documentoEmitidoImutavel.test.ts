import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Pré-rollout (19/09/2026) — imutabilidade NO SERVIDOR do certificado emitido,
 * arquivos finais travados no bucket, e rascunho fora dos fluxos oficiais.
 *
 * O comportamento do banco foi provado no laboratório (ver
 * `docs/medicoes/2026-09-19-calibracoes-ux.md`); aqui trava-se o CONTRATO: a
 * migration, a leitura da recusa pelo cliente e os filtros de rascunho.
 */
const banco = new Map<string, unknown>();
vi.mock('../../../services/storage', () => ({
  ler: (k: string) => (banco.has(k) ? structuredClone(banco.get(k)) : null),
  salvar: async (k: string, v: unknown) => void banco.set(k, structuredClone(v)),
  excluirChave: async (k: string) => void banco.delete(k),
  listarChavesComPrefixo: (p: string) => [...banco.keys()].filter((k) => k.startsWith(p)),
}));

vi.mock('../../relatorios/historicoRelatorios', () => ({ listarIndice: () => [] }));

import { classificar } from '../../../services/errosSync';
import { ehPastaDeDocumentoFinal } from '../../../services/fotos';
import { listarVencimentos } from '../../../services/vencimentos';
import { validadesPorRelatorio } from '../componentesService';
import { ehOficial } from '../tipos';

const sql = readFileSync('supabase/documentos_emitidos_imutaveis.sql', 'utf8');

describe('migration: a trava vive no banco', () => {
  it('trigger BEFORE UPDATE OR DELETE em app_storage, idempotente', () => {
    expect(sql).toContain('drop trigger if exists trg_guardar_documento_emitido on public.app_storage;');
    expect(sql).toContain('before update or delete on public.app_storage');
    expect(sql).toContain('create or replace function public.guardar_documento_emitido()');
  });
  it('protege o registro E a cópia na lista do equipamento (o que o Portal lê)', () => {
    expect(sql).toContain("old.chave like 'nr13\\_calibracao\\_item\\_%'");
    expect(sql).toContain("old.chave not like 'nr13\\_calibracoes\\_%'");
    expect(sql).toContain('Toda entrada emitida do valor antigo precisa estar no novo, idêntica.');
  });
  it('exceções: re-sincronização idêntica, manutenção explícita, remoção da org por service_role', () => {
    expect(sql).toContain('v_novo = v_antigo');
    expect(sql).toContain("current_setting('nr13.manutencao', true) = '1'");
    expect(sql).toMatch(/tg_op = 'DELETE'[\s\S]*'service_role'/);
  });
  it('emitido = status emitido COM pdfRef (rascunho e legado não são travados)', () => {
    expect(sql).toContain("coalesce(v->>'status', '') = 'emitido'");
    expect(sql).toContain("coalesce(v->'emissao'->'pdfRef'->>'path', '') <> ''");
  });
  it('bucket: sem UPDATE/DELETE nas pastas de documento final; fotos continuam removíveis', () => {
    const pastas = "('relatorios', 'certificados', 'certificados-calibracao', 'certificados-externos')";
    expect(sql.split(pastas).length - 1).toBe(2); // update e delete
    for (const p of ['relatorios', 'certificados', 'certificados-calibracao', 'certificados-externos']) {
      expect(ehPastaDeDocumentoFinal(`org/${p}/x.pdf`)).toBe(true);
    }
    expect(ehPastaDeDocumentoFinal('org/fotos/x.jpg')).toBe(false);
    expect(ehPastaDeDocumentoFinal('org/componentes/x.jpg')).toBe(false);
  });
  it('projeção de vencimentos sem rascunho, no arquivo canônico e na migration', () => {
    const filtro = "and coalesce(c ->> 'status', '') <> 'rascunho'";
    expect(readFileSync('supabase/busca_manutencao.sql', 'utf8')).toContain(filtro);
    expect(sql).toContain(filtro);
  });
  it('rollback existe e desfaz trigger e políticas', () => {
    const rb = readFileSync('supabase/documentos_emitidos_imutaveis_rollback.sql', 'utf8');
    expect(rb).toContain('drop trigger if exists trg_guardar_documento_emitido on public.app_storage;');
    expect(rb).toContain('create policy inspecao_remocao on storage.objects for delete');
  });
});

describe('cliente: a recusa do banco é DEFINITIVA e o valor local volta ao do servidor', () => {
  it('nr13_documento_emitido → recusa_definitiva (a fila não retenta para sempre)', () => {
    const ctx = { chave: 'nr13_calibracao_item_x', mutationId: 'm', dispositivo: 'd', quando: '' };
    expect(classificar({ message: 'nr13_documento_emitido: o certificado ... já foi emitido' }, ctx).categoria).toBe(
      'recusa_definitiva',
    );
  });
  it('sync restaura do servidor o valor de um set recusado', () => {
    const src = readFileSync('src/services/sync.ts', 'utf8');
    expect(src).toContain("if (item.op === 'set') await restaurarDoServidor(item.chave);");
  });
  it('upload de documento final sem upsert; "já existe" = o nosso, enviado antes', () => {
    const src = readFileSync('src/services/fotos.ts', 'utf8');
    expect(src).toContain('upsert: !final');
  });
});

describe('RASCUNHO não é calibração oficial', () => {
  const amanha = (() => {
    const d = new Date(Date.now() + 86_400_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  })();
  const cal = (id: string, extra: Record<string, unknown>) => ({
    id, tag: 'ZZ-V', tipo: 'manometro', nome: id, componenteId: id, loteId: 'lote-1', dataCalibracao: '19/09/2025', dataProxCalibracao: amanha, ...extra,
  });

  beforeEach(() => {
    banco.clear();
    banco.set('nr13_info_ZZ-V', { tag: 'ZZ-V', tipo: 'vaso', descricao: 'Vaso ZZ' });
  });

  it('ehOficial: emitido, terceiro e legado sim; rascunho não', () => {
    expect(ehOficial({ status: 'emitido' })).toBe(true);
    expect(ehOficial({ origem: 'terceiro' })).toBe(true);
    expect(ehOficial({})).toBe(true);
    expect(ehOficial({ status: 'rascunho' })).toBe(false);
  });

  it('vencimentos (cache): rascunho com próxima amanhã não cria prazo; emitido cria', () => {
    banco.set('nr13_calibracoes_ZZ-V', [cal('RASC', { status: 'rascunho', origem: 'interna' })]);
    expect(listarVencimentos().filter((i) => i.origem === 'calibracao')).toEqual([]);
    banco.set('nr13_calibracoes_ZZ-V', [cal('EMIT', { status: 'emitido', origem: 'interna' })]);
    expect(listarVencimentos().filter((i) => i.origem === 'calibracao').map((i) => i.nome)).toEqual(['EMIT']);
  });

  it('validade no histórico de relatórios (lotes) ignora rascunho', () => {
    banco.set('nr13_lotes_cal_ZZ-V', [{ id: 'lote-1', criadoEm: '', descricao: 'L', relatorioId: 'REL-1' }]);
    banco.set('nr13_calibracoes_ZZ-V', [cal('RASC', { status: 'rascunho' })]);
    expect(validadesPorRelatorio('ZZ-V').get('REL-1')).toEqual({});
  });

  it('Portal, detalhe do equipamento e quadro 7.1.1 filtram o rascunho', () => {
    expect(readFileSync('src/pages/portal/PortalAtivo.tsx', 'utf8')).toContain('listarCalibracoes(tag).filter(ehOficial)');
    expect(readFileSync('src/components/ModalDetalheEquipamento.tsx', 'utf8')).toContain(
      'listarCalibracoes(tag).filter(ehOficial)',
    );
    expect(readFileSync('src/features/calibracoes/quadroInstrumentos.ts', 'utf8')).toContain('selecionavel: !rascunho');
  });
});
