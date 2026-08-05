import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn() },
  escopoStorageAtual: vi.fn(),
  idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { definirOrg, hidratarDoDisco, zerarMemoria } from './cacheLocal';
import {
  registrarPendencias,
  removerPendencia,
  substituirManifesto,
  diagnosticarPerda,
  lerManifestoBruto,
  erroDoManifesto,
  limparErroDoManifesto,
  type PendenciaResumida,
} from './manifesto';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

const pend = (id: string, chave = `nr13_info_${id}`): PendenciaResumida => ({
  mutationId: id,
  chave,
  criadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'disp-1',
});

/** Estado de boot completo: org definida e hidratação concluída. */
async function prontoNaOrg(org: string): Promise<void> {
  zerarMemoria();
  definirOrg(org);
  await hidratarDoDisco();
}

beforeEach(async () => {
  zerarMemoria();
  fecharDb();
  await apagarDb(ORG_A);
  await apagarDb(ORG_B);
  localStorage.clear();
  limparErroDoManifesto();
});

describe('manifesto — isolado por organização', () => {
  it('grava numa chave que carrega o org_id', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);
    expect(localStorage.getItem(`nr13_manifesto_pendencias_${ORG_A}`)).not.toBeNull();
    expect(localStorage.getItem('nr13_manifesto_pendencias')).toBeNull();
  });

  it('pendência de uma conta NÃO gera diagnóstico na outra', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);

    // Mesmo navegador, outra conta: fila vazia e servidor com dados.
    await prontoNaOrg(ORG_B);
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'estado_zerado' });
  });

  it('a conta original continua enxergando as suas', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);
    await prontoNaOrg(ORG_B);
    await prontoNaOrg(ORG_A);

    const d = diagnosticarPerda([], true);
    expect(d.tipo).toBe('despejo_detectado');
    if (d.tipo === 'despejo_detectado') expect(d.perdidos[0].mutationId).toBe('m1');
  });
});

describe('manifesto — nunca diagnostica antes da hidratação', () => {
  it('sem organização definida -> nao_avaliado', () => {
    definirOrg(null);
    expect(diagnosticarPerda([], true)).toEqual({
      tipo: 'nao_avaliado',
      motivo: 'sem_organizacao',
    });
  });

  it('org definida mas ainda NÃO hidratada -> nao_avaliado', () => {
    zerarMemoria();
    definirOrg(ORG_A);
    // hidratarDoDisco() de propósito NÃO chamado: é o meio do boot.
    expect(diagnosticarPerda([], true)).toEqual({
      tipo: 'nao_avaliado',
      motivo: 'nao_hidratado',
    });
  });

  it('fila vazia durante o boot não vira estado_zerado', () => {
    zerarMemoria();
    definirOrg(ORG_A);
    expect(diagnosticarPerda([], true).tipo).not.toBe('estado_zerado');
  });
});

describe('manifesto — duas abas não apagam pendências uma da outra', () => {
  it('registrar faz MERGE com o que já está gravado', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('aba-A-1')]); // aba A
    registrarPendencias([pend('aba-B-1')]); // aba B, que só conhece a própria

    const bruto = lerManifestoBruto(ORG_A);
    expect(bruto.tipo).toBe('lido');
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas.map((e) => e.mutationId).sort()).toEqual(['aba-A-1', 'aba-B-1']);
    }
  });

  it('registrar a mesma mutação duas vezes não duplica', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);
    registrarPendencias([pend('m1')]);
    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') expect(bruto.entradas).toHaveLength(1);
  });

  it('remover tira SÓ a mutação confirmada, preservando a da outra aba', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('aba-A-1'), pend('aba-B-1')]);
    removerPendencia('aba-A-1');

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas.map((e) => e.mutationId)).toEqual(['aba-B-1']);
    }
  });

  it('substituir só é usado com a visão AUTORITATIVA vinda do IndexedDB', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('velha')]);
    substituirManifesto([pend('do-disco')]);

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas.map((e) => e.mutationId)).toEqual(['do-disco']);
    }
  });

  it('substituir com lista vazia limpa (fila confirmadamente vazia)', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);
    substituirManifesto([]);

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') expect(bruto.entradas).toEqual([]);
  });
});

describe('manifesto — só metadados', () => {
  it('não grava valor, JSON de formulário, foto nem base64', async () => {
    await prontoNaOrg(ORG_A);
    const sujo = {
      ...pend('m1'),
      valor: '{"foto":"data:image/jpeg;base64,AAAAAAAA"}',
      segredo: 'eyJhbGciOi',
    } as PendenciaResumida;
    registrarPendencias([sujo]);

    const cru = localStorage.getItem(`nr13_manifesto_pendencias_${ORG_A}`)!;
    expect(cru).not.toContain('base64');
    expect(cru).not.toContain('data:image');
    expect(cru).not.toContain('eyJhbGciOi');
    expect(cru).not.toContain('valor');
    expect(cru).toContain('m1');
  });

  it('guarda mutationId, chave, data, organização e dispositivo', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1', 'nr13_form_X')]);
    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas[0]).toEqual({
        mutationId: 'm1',
        chave: 'nr13_form_X',
        criadoEm: '2026-08-05T12:00:00.000Z',
        orgId: ORG_A,
        dispositivo: 'disp-1',
      });
    }
  });
});

describe('manifesto — diagnóstico', () => {
  it('fila íntegra -> ok', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1')]);
    expect(diagnosticarPerda([pend('m1')], true)).toEqual({ tipo: 'ok' });
  });

  it('DETECTA despejo isolado do IndexedDB: manifesto sobreviveu, fila sumiu', async () => {
    await prontoNaOrg(ORG_A);
    registrarPendencias([pend('m1'), pend('m2')]);

    const d = diagnosticarPerda([pend('m1')], true); // m2 desapareceu
    expect(d.tipo).toBe('despejo_detectado');
    if (d.tipo === 'despejo_detectado') {
      expect(d.perdidos).toHaveLength(1);
      expect(d.perdidos[0].mutationId).toBe('m2');
    }
  });

  it('limpeza total do site: alerta genérico, SEM lista inventada', async () => {
    await prontoNaOrg(ORG_A);
    // localStorage e IndexedDB foram embora juntos: nada a enumerar.
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'estado_zerado' });
  });

  it('conta nova (servidor sem dados) não é perda', async () => {
    await prontoNaOrg(ORG_A);
    expect(diagnosticarPerda([], false)).toEqual({ tipo: 'ok' });
  });

  it('manifesto vazio gravado + fila vazia -> ok', async () => {
    await prontoNaOrg(ORG_A);
    substituirManifesto([]);
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'ok' });
  });
});

describe('manifesto — corrompido não vira "tudo certo"', () => {
  it('JSON inválido -> manifesto_invalido', async () => {
    await prontoNaOrg(ORG_A);
    localStorage.setItem(`nr13_manifesto_pendencias_${ORG_A}`, 'lixo{{{');
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'manifesto_invalido' });
  });

  it('JSON válido que não é lista -> manifesto_invalido', async () => {
    await prontoNaOrg(ORG_A);
    localStorage.setItem(`nr13_manifesto_pendencias_${ORG_A}`, '{"a":1}');
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'manifesto_invalido' });
  });

  it('lerManifestoBruto sinaliza invalido em vez de devolver lista vazia', async () => {
    await prontoNaOrg(ORG_A);
    localStorage.setItem(`nr13_manifesto_pendencias_${ORG_A}`, 'lixo{{{');
    expect(lerManifestoBruto(ORG_A)).toEqual({ tipo: 'invalido' });
  });
});

describe('manifesto — falha de gravação não derruba o salvamento', () => {
  it('não lança, e registra o erro técnico para diagnóstico', async () => {
    await prontoNaOrg(ORG_A);
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k.startsWith('nr13_manifesto_')) {
        const e = new Error('cheio');
        e.name = 'QuotaExceededError';
        throw e;
      }
      real(k, v);
    });

    expect(() => registrarPendencias([pend('m1')])).not.toThrow();
    spy.mockRestore();

    const erro = erroDoManifesto();
    expect(erro).not.toBeNull();
    expect(erro?.categoria).toBe('cota');
    expect(erro?.detalhe.mensagemOriginal).toBe('cheio');
  });
});

// ---------------------------------------------------------------------------
// Integração com a fila: o manifesto acompanha sozinho, sem depender da UI.
// ---------------------------------------------------------------------------
import { montarItem, registrarNaMemoria, removerDaFila, carregarFilaDoDisco, listarFila, zerarFilaMemoria } from './sync';
import { gravarAtomico } from './cacheLocal';

const regA = (valor: string, versao: number) => ({
  valor, versao, atualizadoEm: '2026-08-05T12:00:00.000Z', dispositivo: 'd1',
});

describe('manifesto — atualizado em todos os caminhos da fila', () => {
  beforeEach(async () => {
    zerarFilaMemoria();
    await prontoNaOrg(ORG_A);
  });

  it('enfileirar registra no manifesto', async () => {
    const item = montarItem('set', 'nr13_info_A', '{}', 0);
    await gravarAtomico([{ chave: 'nr13_info_A', registro: regA('{}', 1) }], [item]);
    registrarNaMemoria(item);

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') expect(bruto.entradas[0].mutationId).toBe(item.mutationId);
  });

  it('condensar autosave troca a entrada, sem deixar a antiga cobrando', async () => {
    const a = montarItem('set', 'nr13_form_A', '{"v":1}', 0);
    await gravarAtomico([{ chave: 'nr13_form_A', registro: regA('{"v":1}', 1) }], [a]);
    registrarNaMemoria(a);

    const b = montarItem('set', 'nr13_form_A', '{"v":2}', 0);
    await gravarAtomico([{ chave: 'nr13_form_A', registro: regA('{"v":2}', 2) }], [b]);
    registrarNaMemoria(b);

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas.map((e) => e.mutationId)).toEqual([b.mutationId]);
    }
    expect(diagnosticarPerda(listarFila(), true)).toEqual({ tipo: 'ok' });
  });

  it('remover após sucesso tira do manifesto', async () => {
    const item = montarItem('set', 'nr13_info_A', '{}', 0);
    await gravarAtomico([{ chave: 'nr13_info_A', registro: regA('{}', 1) }], [item]);
    registrarNaMemoria(item);
    await removerDaFila(item.mutationId);

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') expect(bruto.entradas).toEqual([]);
  });

  it('carregar do IndexedDB substitui pela visão autoritativa', async () => {
    const item = montarItem('set', 'nr13_info_A', '{}', 0);
    await gravarAtomico([{ chave: 'nr13_info_A', registro: regA('{}', 1) }], [item]);
    registrarNaMemoria(item);

    // Entrada órfã, como se tivesse sobrado de uma sessão anterior.
    registrarPendencias([pend('fantasma')]);
    zerarFilaMemoria();
    await carregarFilaDoDisco();

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') {
      expect(bruto.entradas.map((e) => e.mutationId)).toEqual([item.mutationId]);
    }
  });

  it('fila confirmadamente vazia no disco limpa o manifesto', async () => {
    registrarPendencias([pend('fantasma')]);
    zerarFilaMemoria();
    await carregarFilaDoDisco();

    const bruto = lerManifestoBruto(ORG_A);
    if (bruto.tipo === 'lido') expect(bruto.entradas).toEqual([]);
    expect(diagnosticarPerda([], true)).toEqual({ tipo: 'ok' });
  });

  it('o manifesto nunca carrega o valor da mutação, mesmo vindo da fila real', async () => {
    const item = montarItem('set', 'nr13_info_A', '{"foto":"data:image/jpeg;base64,ZZZZ"}', 0);
    await gravarAtomico([{ chave: 'nr13_info_A', registro: regA('{}', 1) }], [item]);
    registrarNaMemoria(item);

    const cru = localStorage.getItem(`nr13_manifesto_pendencias_${ORG_A}`)!;
    expect(cru).not.toContain('base64');
    expect(cru).not.toContain('data:image');
  });
});
