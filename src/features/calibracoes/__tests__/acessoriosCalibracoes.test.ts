import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Calibrações · pedidos do dono (21/11/2026).
 *
 *   · BUG "3 × 5": a lista contava acessórios pelo agregado de VENCIMENTOS
 *     (só quem já tem calibração oficial com prazo); o painel contava o
 *     CADASTRO. A definição é o cadastro — e os dois lados leem dela.
 *   · o cartão do acessório: nunca calibrado = "Requer calibração" e nada
 *     mais; calibrado = última calibração oficial, selo, prazo no canto e
 *     "Histórico" com contador.
 */
const rpc = vi.fn();
vi.mock('../../../services/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  __limparCacheAcessorios,
  buscarAcessoriosPorTag,
  contagemDeAcessorios,
  lerRespostaAcessorios,
} from '../acessoriosServidor';
import { GradeAcessorios } from '../PainelEquipamentoCal';
import { prazoDoCanto, situacaoDoAcessorio } from '../situacaoAcessorio';
import type { ComponenteCal } from '../componentesService';
import type { DadosCalibracao } from '../tipos';

const HOJE = new Date(2026, 10, 21); // 21/11/2026

const MAN: ComponenteCal = { id: 'c-man', tipo: 'manometro', nome: 'MAN-01', serie: 'S-123', referencia: '0 a 10', criadoEm: '01/01/2026' };
const PSV: ComponenteCal = { id: 'c-psv', tipo: 'psv', nome: 'PSV-01', serie: 'P-9', criadoEm: '01/01/2026' };

function cal(p: Partial<DadosCalibracao> & { id: string; componenteId: string }): DadosCalibracao {
  return { tipo: 'manometro', nome: 'MAN-01', criadoEm: '01/01/2026', ...p } as unknown as DadosCalibracao;
}

const EMITIDA = cal({
  id: 'k1',
  componenteId: 'c-man',
  status: 'emitido',
  dataCalibracao: '10/09/2026',
  dataProxCalibracao: '12/09/2027',
  statusConclusao: 'aprovado',
  numeroCertificado: 'CERT-77',
  emissao: { pdfRef: { path: 'org/certificados-calibracao/x.pdf' } },
} as never);

describe('contagem de ACESSÓRIOS — a mesma definição na lista e no painel', () => {
  beforeEach(() => {
    __limparCacheAcessorios();
    rpc.mockReset();
  });

  it('o cadastro deste aparelho vence o servidor; sem nenhum dos dois, null ("—")', () => {
    expect(contagemDeAcessorios('A', { A: 3 }, { A: 5 })).toBe(5);
    expect(contagemDeAcessorios('A', { A: 3 })).toBe(3);
    expect(contagemDeAcessorios('A', null)).toBeNull();
    expect(contagemDeAcessorios('A', null, {})).toBeNull();
  });

  it('resposta que VEIO sem a TAG = 0 (não há chave de cadastro)', () => {
    expect(contagemDeAcessorios('B', { A: 3 })).toBe(0);
  });

  it('lê a resposta da RPC e descarta lixo', () => {
    expect(lerRespostaAcessorios({ A: 2, B: '4', C: -1, D: 'x' })).toEqual({ A: 2, B: 4 });
    expect(lerRespostaAcessorios(null)).toBeNull();
    expect(lerRespostaAcessorios([1, 2])).toBeNull();
  });

  it('uma ida por minuto; falha não fica em cache', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function acessorios_org does not exist' } });
    expect(await buscarAcessoriosPorTag(1000)).toBeNull();
    rpc.mockResolvedValueOnce({ data: { 'ZZ-TESTE-P2': 5 }, error: null });
    expect(await buscarAcessoriosPorTag(2000)).toEqual({ 'ZZ-TESTE-P2': 5 });
    expect(await buscarAcessoriosPorTag(3000)).toEqual({ 'ZZ-TESTE-P2': 5 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('acessorios_org');
  });

  it('a lista NÃO tira o número do agregado de vencimentos (a causa do 3 × 5)', () => {
    const fonte = readFileSync('src/features/calibracoes/CatalogoCalibracoesV9.tsx', 'utf8');
    expect(fonte).not.toMatch(/<b>\{acs\.length\}<\/b>/);
    expect(fonte).toMatch(/contagemDeAcessorios\(item\.tag/);
    const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
    expect(pagina).toMatch(/acessoriosLocais=\{acessoriosLocais\}/);
  });

  it('o SQL novo conta o cadastro sem os removidos e tira calibração excluída da projeção', () => {
    const sql = readFileSync('supabase/calibracoes_acessorios.sql', 'utf8');
    expect(sql).toMatch(/create or replace function public\.acessorios_org\(\)/);
    expect(sql).toMatch(/nr13\\_componentes\\_cal\\_%/);
    expect(sql.match(/coalesce\(c ->> 'removidoEm', ''\) = ''/g)?.length).toBe(2);
  });
});

describe('situação de UM acessório', () => {
  it('nunca calibrado — e rascunho não conta como calibração', () => {
    const s = situacaoDoAcessorio(MAN, [cal({ id: 'r', componenteId: 'c-man', status: 'rascunho' } as never)], HOJE);
    expect(s.ultima).toBeNull();
    expect(s.rascunho?.id).toBe('r');
    expect(s.oficiais).toBe(0);
    expect(s.selo).toBeNull();
  });

  it('emitido e vigente = Em dia, prazo em dias, certificado emitido', () => {
    const s = situacaoDoAcessorio(MAN, [EMITIDA], HOJE);
    expect(s.selo).toBe('em-dia');
    expect(s.certificado).toBe('emitido');
    expect(s.oficiais).toBe(1);
    expect(prazoDoCanto(s.dias)).toBe('em 295 dias');
  });

  it('vencido vence o reprovado; legado sem status = registro anterior', () => {
    const v = cal({ id: 'v', componenteId: 'c-man', dataCalibracao: '01/01/2025', dataProxCalibracao: '01/01/2026', statusConclusao: 'reprovado' } as never);
    const s = situacaoDoAcessorio(MAN, [v], HOJE);
    expect(s.selo).toBe('vencido');
    expect(s.certificado).toBe('anterior');
    expect(prazoDoCanto(s.dias)).toMatch(/^vencido há \d+ dias$/);
    const r = cal({ id: 'x', componenteId: 'c-man', status: 'emitido', dataProxCalibracao: '01/01/2027', statusConclusao: 'reprovado' } as never);
    expect(situacaoDoAcessorio(MAN, [r], HOJE).selo).toBe('reprovado');
  });

  it('laboratório externo é certificado externo, nunca "emitido" por nós', () => {
    const t = cal({ id: 't', componenteId: 'c-psv', tipo: 'psv', origem: 'terceiro', laboratorio: 'LAB', dataProxCalibracao: '01/06/2027' } as never);
    expect(situacaoDoAcessorio(PSV, [t], HOJE).certificado).toBe('externo');
  });
});

describe('cartões da aba "Calibrar acessórios"', () => {
  const noop = () => undefined;
  const html = renderToStaticMarkup(
    createElement(GradeAcessorios, {
      componentes: [MAN, PSV],
      cals: [EMITIDA, cal({ id: 'k0', componenteId: 'c-man', status: 'emitido', dataCalibracao: '10/09/2025' } as never)],
      aoAdicionar: noop,
      aoEditar: noop,
      aoHistorico: noop,
      aoCalibrar: noop,
      aoContinuar: noop,
      hoje: HOJE,
    }),
  );
  const [calibrado, novo] = html.split('cal4-ac cal4-ac-novo');

  it('nunca calibrado: nome, tipo, "Requer calibração" — sem série, faixa nem botões', () => {
    expect(novo).toContain('PSV-01');
    expect(novo).toContain('Requer calibração');
    expect(novo).toContain('cal4-tipo');
    expect(novo).not.toContain('P-9');
    expect(novo).not.toContain('Nº de série');
    expect(novo).not.toContain('cal4-calibrar');
    expect(novo).not.toContain('cal4-hist');
    expect(novo).not.toContain('cal4-ra');
    // UM jeito de calibrar: o cartão é o botão.
    expect(html).toMatch(/<button type="button" class="cal4-ac cal4-ac-novo i-psv" aria-label="Calibrar PSV-01/);
  });

  it('calibrado: selo Em dia, prazo no canto, dados da última oficial e Histórico com contador', () => {
    expect(calibrado).toContain('cal4-selo em-dia');
    expect(calibrado).toContain('Em dia');
    expect(calibrado).toContain('em 295 dias');
    expect(calibrado).toContain('10/09/2026');
    expect(calibrado).toContain('CERT-77');
    expect(calibrado).toContain('Certificado emitido');
    expect(calibrado).toMatch(/Histórico <span class="n">2<\/span>/);
    expect(calibrado).toContain('cal4-calibrar');
    expect(calibrado).not.toContain('Requer calibração');
  });
});
