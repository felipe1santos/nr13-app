import { describe, expect, it, vi } from 'vitest';

// salvarResumoVaso toca localStorage (via services/storage) e Supabase (via categoriaService).
// Ambiente de teste é 'node' (sem DOM/localStorage), então mockamos os dois módulos como spies
// simples — não é preciso simular Supabase/RLS pra observar SE atualizarCategoriaComPmta foi
// chamada, só QUANTAS vezes e com quê.
vi.mock('../../../services/storage', () => ({
  salvar: vi.fn().mockResolvedValue(undefined),
  ler: vi.fn().mockReturnValue(null),
}));
vi.mock('../../categoria/categoriaService', () => ({
  atualizarCategoriaComPmta: vi.fn().mockResolvedValue(undefined),
}));

import { atualizarCategoriaComPmta } from '../../categoria/categoriaService';
import { calcularResumoVaso, salvarResumoVaso, type VasoSalvo, type ComponenteVasoSalvo } from '../vasoMemorialService';

const fixos: ComponenteVasoSalvo[] = [
  { id: 'tampo1', nome: 'Tampo Inferior', tipo: 'eliptico', dados: { S: 137.9, E: 1, t_comercial: 10, ca: 1, temp: 50, mat: 'SA-516-70' } },
  { id: 'casco', nome: 'Casco Cilíndrico (UG-27c)', tipo: 'cilindrico', dados: { S: 137.9, E: 0.85, t_comercial: 12, ca: 1, temp: 50, mat: 'SA-516-70' } },
  { id: 'tampo2', nome: 'Tampo Superior', tipo: 'eliptico', dados: { S: 137.9, E: 1, t_comercial: 10, ca: 1, temp: 50, mat: 'SA-516-70' } },
];
const base: VasoSalvo = { tag: 'T1', P: 1.0, D: 1000, orientacao: 'vertical', componentes: fixos };
const bocalOk: ComponenteVasoSalvo = {
  id: 'bocal1', nome: 'Bocal N1', tipo: 'bocal',
  dados: { d: 150, t_comercial: 10, ca: 1.5, S: 137.9, temp: 50 },
};

describe('calcularResumoVaso — bocais opcionais', () => {
  it('sem bocal: comportamento atual (3 componentes, APROVADO)', () => {
    const r = calcularResumoVaso(base);
    expect(r.porComponente).toHaveLength(3);
    expect(r.resultado).toBe('APROVADO');
  });

  it('bocal recebe dadosCascoRef do casco automaticamente (sem ERRO SISTÊMICO)', () => {
    const r = calcularResumoVaso({ ...base, componentes: [...fixos, bocalOk] });
    const b = r.porComponente.find((c) => c.id === 'bocal1')!;
    const log = b.resultado.log.join('\n');
    expect(log).not.toContain('ERRO SISTÊMICO');
    expect(log).toContain('UG-37');
  });

  it('bocal não altera a PMTA final', () => {
    const sem = calcularResumoVaso(base);
    const com = calcularResumoVaso({ ...base, componentes: [...fixos, bocalOk] });
    expect(com.pmtaFinal).toBe(sem.pmtaFinal);
  });

  it('bocal reprovado derruba o resultado geral', () => {
    // casco no limite (pouca sobra p/ A1) + pescoço fino (A2=A3=A4=0) → A_disp < A_req
    const cascoJusto: ComponenteVasoSalvo = { ...fixos[1], dados: { ...fixos[1].dados, t_comercial: 5.3 } };
    const bocalRuim: ComponenteVasoSalvo = { ...bocalOk, dados: { ...bocalOk.dados, t_comercial: 2 } };
    const r = calcularResumoVaso({ ...base, componentes: [fixos[0], cascoJusto, fixos[2], bocalRuim] });
    const b = r.porComponente.find((c) => c.id === 'bocal1')!;
    expect(b.resultado.resultado).toBe('REPROVADO');
    expect(r.resultado).toBe('REPROVADO');
  });

  it('bocal incompleto marca PENDENTE', () => {
    const bocalVazio: ComponenteVasoSalvo = { ...bocalOk, dados: { S: 137.9 } };
    const r = calcularResumoVaso({ ...base, componentes: [...fixos, bocalVazio] });
    expect(r.resultado).toBe('PENDENTE');
  });
});

describe('salvarResumoVaso — GV não pode sobrescrever a categoria do corpo principal', () => {
  it('sufixo "gv" NÃO chama atualizarCategoriaComPmta', async () => {
    vi.mocked(atualizarCategoriaComPmta).mockClear();
    const resumo = calcularResumoVaso(base);
    await salvarResumoVaso('T1', resumo, 'gv');
    expect(atualizarCategoriaComPmta).not.toHaveBeenCalled();
  });

  it('sufixo "" (corpo principal) chama atualizarCategoriaComPmta com a PMTA final', async () => {
    vi.mocked(atualizarCategoriaComPmta).mockClear();
    const resumo = calcularResumoVaso(base);
    await salvarResumoVaso('T1', resumo, '');
    expect(atualizarCategoriaComPmta).toHaveBeenCalledWith('T1', resumo.pmtaFinal);
  });

  it('sufixo "ac_corpo" também chama atualizarCategoriaComPmta (continua atualizando)', async () => {
    vi.mocked(atualizarCategoriaComPmta).mockClear();
    const resumo = calcularResumoVaso(base);
    await salvarResumoVaso('T1', resumo, 'ac_corpo');
    expect(atualizarCategoriaComPmta).toHaveBeenCalledWith('T1', resumo.pmtaFinal);
  });
});
