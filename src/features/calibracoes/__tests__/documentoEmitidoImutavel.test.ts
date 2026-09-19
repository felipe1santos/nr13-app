import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Pré-rollout (19/09/2026) — imutabilidade NO SERVIDOR dos documentos oficiais
 * (certificado interno emitido, calibração de terceiro, relatório finalizado e
 * suas listas), arquivos finais travados no bucket, bypass de manutenção que o
 * usuário não alcança, e rascunho fora dos fluxos oficiais.
 *
 * O comportamento do banco foi provado no laboratório — bateria SQL e ataques
 * pelo PostgREST, ver `docs/medicoes/2026-09-19-calibracoes-ux.md`; aqui trava-se
 * o CONTRATO: a migration, a leitura da recusa pelo cliente e os filtros.
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
import { CertificadoEmitidoImutavel, excluirCalibracao, salvarCalibracao } from '../calibracaoService';
import { validadesPorRelatorio } from '../componentesService';
import { ehCongelada, ehOficial, type DadosCalibracao } from '../tipos';

const sql = readFileSync('supabase/documentos_emitidos_imutaveis.sql', 'utf8');
/** O corpo de uma função da migration, para conferir a regra e não um comentário. */
const corpo = (nome: string) => {
  const i = sql.indexOf(`create or replace function public.${nome}(`);
  expect(i, nome).toBeGreaterThan(-1);
  return sql.slice(i, sql.indexOf('$$;', sql.indexOf('as $$', i)) + 3);
};

describe('migration: UMA guarda para os três documentos oficiais', () => {
  it('trigger BEFORE UPDATE OR DELETE em app_storage, idempotente', () => {
    expect(sql).toContain('drop trigger if exists trg_guardar_documento_emitido on public.app_storage;');
    expect(sql).toContain('before update or delete on public.app_storage');
    expect(sql.match(/create trigger /g)).toHaveLength(1);
  });

  it('cobre registro e representação: calibração, relatório, índice e legado', () => {
    const g = corpo('guardar_documento_emitido');
    for (const familia of [
      "'nr13\\_calibracao\\_item\\_%'",
      "'nr13\\_calibracoes\\_%'",
      "'nr13\\_rel\\_%'",
      "'nr13\\_historico\\_indice\\_%'",
      "'nr13_historico_relatorios'",
    ]) {
      expect(g).toContain(familia);
    }
    // escapado: `nr13_relatorio_meta_atual` NÃO pode cair na família `nr13_rel_`
    expect(g).not.toMatch(/like 'nr13_rel_%'/);
  });

  it('A+B: interno emitido E terceiro não-rascunho são oficiais; terceiro ↔ interno não troca', () => {
    const o = corpo('nr13_calibracao_oficial');
    expect(o).toContain('public.nr13_calibracao_emitida(v)');
    expect(o).toContain("coalesce(v->>'origem', '') = 'terceiro' and coalesce(v->>'status', '') <> 'rascunho'");
    expect(corpo('nr13_calibracao_emitida')).toContain("coalesce(v->'emissao'->'pdfRef'->>'path', '') <> ''");
    // o registro oficial só aceita regravação IDÊNTICA (origem inclusa)
    expect(corpo('guardar_documento_emitido')).toContain('if v_vivo and v_novo = v_antigo then');
  });

  it('C: relatório finalizado = status ≠ Rascunho; só o rótulo e o retrofit legado mudam', () => {
    expect(corpo('nr13_relatorio_finalizado')).toContain("coalesce(v->>'status', '') <> 'Rascunho'");
    const r = corpo('nr13_relatorio_regravacao_permitida');
    expect(r).toContain("(novo - 'nome' - 'meta') = (antigo - 'nome' - 'meta')");
    expect(r).toContain("coalesce(antigo->'pdfRef'->>'path', '') = ''");
    expect(r).toContain("array['assinantes', 'empresa', 'certCalibracoes', 'rastreabIds']");
  });

  it('listas: só a entrada oficial é conferida; índice tolera campo vazio a mais e rótulo', () => {
    const g = corpo('guardar_documento_emitido');
    expect(g).toContain("when 'rel_indice' then public.nr13_mesmo_documento(v_ent, n, array['nome'])");
    expect(g).toContain('else n = v_ent');
    expect(corpo('nr13_json_vazio')).toContain(`x is null or x = 'null'::jsonb or x = '""'::jsonb`);
  });

  it('bypass: GUC sozinho não basta — nunca para authenticated/anon, pela API só service_role', () => {
    const m = corpo('nr13_manutencao_autorizada');
    expect(m).toContain("coalesce(v_papel, '') in ('authenticated', 'anon')");
    expect(m).toContain("session_user::text = 'authenticator' and coalesce(v_papel, '') <> 'service_role'");
    const g = corpo('guardar_documento_emitido');
    expect(g).toContain('public.nr13_manutencao_autorizada()');
    // a guarda não lê o GUC direto (o antigo bypass por valor de sessão)
    expect(g).not.toContain("current_setting('nr13.manutencao'");
    // nem existe mais o DELETE livre do service_role sem rotina de manutenção
    expect(g).not.toContain("'service_role'");
  });

  it('rotinas de manutenção perdem o EXECUTE de anon', () => {
    for (const f of [
      'public.coletar_tombstones(uuid, integer)',
      'public.reconciliar_versoes_org(uuid)',
      'public.purgar_dados_trial(integer)',
      'public.purgar_dados_por_email(text[])',
    ]) {
      expect(sql).toContain(`'${f}'`);
    }
    expect(sql).toContain("revoke execute on function %s from public, anon, authenticated");
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

  it('rollback existe e desfaz trigger, funções e políticas', () => {
    const rb = readFileSync('supabase/documentos_emitidos_imutaveis_rollback.sql', 'utf8');
    expect(rb).toContain('drop trigger if exists trg_guardar_documento_emitido on public.app_storage;');
    for (const f of ['guardar_documento_emitido', 'nr13_manutencao_autorizada', 'nr13_calibracao_oficial', 'nr13_relatorio_finalizado']) {
      expect(rb).toContain(`drop function if exists public.${f}(`);
    }
    expect(rb).toContain('create policy inspecao_remocao on storage.objects for delete');
  });
});

describe('cliente: a recusa do banco é DEFINITIVA e o valor local volta ao do servidor', () => {
  it('nr13_documento_emitido → recusa_definitiva (a fila não retenta para sempre)', () => {
    const ctx = { chave: 'nr13_rel_x_T', mutationId: 'm', dispositivo: 'd', quando: '' };
    expect(classificar({ message: 'nr13_documento_emitido: o relatório ... já foi finalizado' }, ctx).categoria).toBe(
      'recusa_definitiva',
    );
  });
  it('sync restaura do servidor o valor de um set OU del recusado', () => {
    const src = readFileSync('src/services/sync.ts', 'utf8');
    const i = src.indexOf("await marcarEstado(item.mutationId, 'encerrado');");
    const trecho = src.slice(i, src.indexOf('return false;', i));
    expect(trecho).toContain('await restaurarDoServidor(item.chave);');
    expect(trecho).not.toContain("if (item.op === 'set') await restaurarDoServidor");
  });
  it('upload de documento final sem upsert; "já existe" = o nosso, enviado antes', () => {
    const src = readFileSync('src/services/fotos.ts', 'utf8');
    expect(src).toContain('upsert: !final');
  });
});

describe('cliente: terceiro oficial congelado como o emitido', () => {
  const terceiro = (extra: Record<string, unknown> = {}) =>
    ({ id: 'T1', tag: 'ZZ-V', tipo: 'termometro', origem: 'terceiro', nome: 'T', laboratorio: 'Lab', ...extra }) as unknown as DadosCalibracao;

  beforeEach(() => banco.clear());

  it('ehCongelada: emitido e terceiro sim; rascunho (interno ou terceiro) e legado não', () => {
    expect(ehCongelada(terceiro())).toBe(true);
    expect(ehCongelada(terceiro({ status: 'rascunho' }))).toBe(false);
    expect(ehCongelada({ id: 'L', tipo: 'manometro' } as unknown as DadosCalibracao)).toBe(false);
    expect(
      ehCongelada({ id: 'E', tipo: 'manometro', status: 'emitido', emissao: { pdfRef: { path: 'x' } } } as unknown as DadosCalibracao),
    ).toBe(true);
  });

  it('salvar/excluir terceiro registrado é recusado antes da fila', async () => {
    await salvarCalibracao('ZZ-V', terceiro());
    await expect(salvarCalibracao('ZZ-V', terceiro({ laboratorio: 'Outro' }))).rejects.toBeInstanceOf(CertificadoEmitidoImutavel);
    await expect(excluirCalibracao('ZZ-V', 'T1')).rejects.toBeInstanceOf(CertificadoEmitidoImutavel);
    expect((banco.get('nr13_calibracao_item_T1') as { laboratorio: string }).laboratorio).toBe('Lab');
  });

  it('a tela não oferece "Excluir" para registro congelado', () => {
    expect(readFileSync('src/pages/Calibracoes.tsx', 'utf8')).toContain(
      '{ehCongelada(calAtual) ? null : confirmandoId === calAtual.id ? (',
    );
  });

  it('a lista legada de relatórios não oferece excluir (toda linha é finalizada)', () => {
    const src = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    expect(src).not.toContain('excluirDoHistorico');
    expect(src).not.toContain('Excluir Selecionados');
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
