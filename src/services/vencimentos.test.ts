import { beforeEach, describe, expect, it } from 'vitest';
import { listarVencimentos, parseDataFlex, resumoKpis, statusPrazo, textoPrazo } from './vencimentos';

// vitest roda em node (sem DOM): shim mínimo de localStorage p/ o motor de vencimentos.
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

const HOJE = new Date(2026, 6, 3); // 03/07/2026

describe('parseDataFlex', () => {
  it('aceita dd/mm/aaaa', () => {
    expect(parseDataFlex('02/07/2026')?.getTime()).toBe(new Date(2026, 6, 2).getTime());
  });
  it('aceita aaaa-mm-dd', () => {
    expect(parseDataFlex('2026-07-02')?.getTime()).toBe(new Date(2026, 6, 2).getTime());
  });
  it('aceita ddmmaaaa sem barras (dado antigo digitado sem máscara)', () => {
    expect(parseDataFlex('09072026')?.getTime()).toBe(new Date(2026, 6, 9).getTime());
  });
  it('rejeita lixo', () => {
    expect(parseDataFlex('banana')).toBeNull();
    expect(parseDataFlex('')).toBeNull();
    expect(parseDataFlex(undefined)).toBeNull();
  });
});

describe('statusPrazo', () => {
  it('vencido → crit com dias negativos', () => {
    const r = statusPrazo(new Date(2026, 6, 1), HOJE);
    expect(r.status).toBe('crit');
    expect(r.dias).toBe(-2);
  });
  it('15 dias → warn', () => {
    expect(statusPrazo(new Date(2026, 6, 18), HOJE).status).toBe('warn');
  });
  it('45 dias → ok', () => {
    expect(statusPrazo(new Date(2026, 7, 17), HOJE).status).toBe('ok');
  });
});

describe('resumoKpis', () => {
  it('sem prazos cadastrados → conformidade 100', () => {
    const r = resumoKpis(
      [{ tag: 'X', nome: 'X', tipoEquip: 'Vaso de Pressão', origem: 'inspecao', status: 'semPrazo' }],
      3,
    );
    expect(r).toEqual({ total: 3, aVencer30: 0, vencidos: 0, conformidade: 100 });
  });
  it('1 vencido em 4 com prazo → 75%', () => {
    const mk = (status: 'crit' | 'warn' | 'ok') => ({
      tag: 'X', nome: 'X', tipoEquip: 'Vaso de Pressão', origem: 'inspecao' as const, status, dias: 1,
    });
    const r = resumoKpis([mk('crit'), mk('warn'), mk('ok'), mk('ok')], 4);
    expect(r.vencidos).toBe(1);
    expect(r.aVencer30).toBe(1);
    expect(r.conformidade).toBe(75);
  });
});

describe('listarVencimentos (localStorage)', () => {
  beforeEach(() => localStorage.clear());

  it('equipamento com vida salva gera vencimento; sem vida gera semPrazo', () => {
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    localStorage.setItem('nr13_vida_V1', JSON.stringify({
      entrada: { dataAtual: '02/07/2026' },
      proximaInspecaoAnos: 0.5, // 6 meses → 02/01/2027
    }));
    localStorage.setItem('nr13_info_V2', JSON.stringify({ tag: 'V2', tipo: 'caldeira', subtipo: 'mista' }));

    const itens = listarVencimentos(HOJE);
    const v1 = itens.find((i) => i.tag === 'V1')!;
    expect(v1.status).toBe('ok');
    expect(v1.vencimento?.getMonth()).toBe(0); // janeiro
    const v2 = itens.find((i) => i.tag === 'V2')!;
    expect(v2.status).toBe('semPrazo');
    expect(v2.tipoEquip).toBe('Caldeira');
  });

  it('calibração vencida aparece como acessório com pertenceA', () => {
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    localStorage.setItem('nr13_calibracoes_V1', JSON.stringify([{
      id: 'a', tag: 'V1', tipo: 'manometro', nome: 'Manômetro principal',
      dataCalibracao: '01/06/2025', dataProxCalibracao: '01/06/2026', serie: 'M77',
    }]));
    const itens = listarVencimentos(HOJE);
    const ac = itens.find((i) => i.origem === 'calibracao')!;
    expect(ac.pertenceA).toBe('V1');
    expect(ac.status).toBe('crit');
    expect(textoPrazo(ac)).toMatch(/^Vencido há \d+ dias$/);
    // vencido ordena antes do semPrazo
    expect(itens[0].origem).toBe('calibracao');
  });

  it('sem vida, relatório salvo com próx. interna gera vencimento do equipamento', () => {
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    localStorage.setItem('nr13_historico_relatorios', JSON.stringify([{
      id: 'REL-1', tagVaso: 'V1', nome: 'r', tipo: 'Inspeção Periódica', data: '08/07/2026',
      documentos: [], status: 'Aprovado',
      meta: { codigo: 'REL-1', emissao: '08/07/2026', execucaoInspecao: '08/07/2026', proximaInspecaoInterna: '09/07/2026', proximaInspecaoExterna: '' },
    }]));
    const itens = listarVencimentos(HOJE);
    const v1 = itens.find((i) => i.tag === 'V1')!;
    expect(v1.status).toBe('warn'); // 6 dias
    expect(v1.vencimento?.getDate()).toBe(9);
    expect(v1.vencimento?.getMonth()).toBe(6);
  });

  it('vale o relatório mais recente; e entre interna/externa vale a mais próxima', () => {
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    localStorage.setItem('nr13_historico_relatorios', JSON.stringify([
      { id: 'REL-1', tagVaso: 'V1', nome: 'r', tipo: 'Inspeção Periódica', data: '01/01/2025', documentos: [], status: 'Aprovado',
        meta: { codigo: 'REL-1', emissao: '01/01/2025', proximaInspecaoInterna: '01/02/2025', proximaInspecaoExterna: '' } },
      { id: 'REL-2', tagVaso: 'V1', nome: 'r', tipo: 'Inspeção Periódica', data: '01/07/2026', documentos: [], status: 'Aprovado',
        meta: { codigo: 'REL-2', emissao: '01/07/2026', proximaInspecaoInterna: '01/07/2027', proximaInspecaoExterna: '09072026' } },
    ]));
    const itens = listarVencimentos(HOJE);
    const v1 = itens.find((i) => i.tag === 'V1')!;
    // REL-2 manda; externa 09/07/2026 (sem barras) vence antes da interna
    expect(v1.vencimento?.getFullYear()).toBe(2026);
    expect(v1.vencimento?.getDate()).toBe(9);
    expect(v1.status).toBe('warn');
  });

  it('vida e relatório juntos: o relatório manda (mesmo com vida vencendo antes)', () => {
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    localStorage.setItem('nr13_vida_V1', JSON.stringify({
      entrada: { dataAtual: '02/07/2026' }, proximaInspecaoAnos: 0, // 02/07/2026 — já vencida
    }));
    localStorage.setItem('nr13_historico_relatorios', JSON.stringify([{
      id: 'REL-1', tagVaso: 'V1', nome: 'r', tipo: 'Inspeção Periódica', data: '02/07/2026', documentos: [], status: 'Aprovado',
      meta: { codigo: 'REL-1', emissao: '02/07/2026', proximaInspecaoInterna: '09/07/2026', proximaInspecaoExterna: '' },
    }]));
    const itens = listarVencimentos(HOJE);
    const v1 = itens.find((i) => i.tag === 'V1')!;
    expect(v1.vencimento?.getDate()).toBe(9); // prazo do relatório, não o da vida
    expect(v1.vencimento?.getFullYear()).toBe(2026);
    expect(v1.status).toBe('warn');
  });

  it('chave malformada não derruba a listagem', () => {
    localStorage.setItem('nr13_info_RUIM', '{{{nao é json');
    localStorage.setItem('nr13_info_V1', JSON.stringify({ tag: 'V1', tipo: 'vaso', subtipo: '' }));
    expect(() => listarVencimentos(HOJE)).not.toThrow();
    expect(listarVencimentos(HOJE).some((i) => i.tag === 'V1')).toBe(true);
  });
});
