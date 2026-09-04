import { describe, expect, it } from 'vitest';
import { validarRegistroLivro } from './validacaoRegistro';
import type { LivroEntrada } from '../relatorios/livroLacre';

function reg(p: Partial<LivroEntrada> = {}): Partial<LivroEntrada> {
  return {
    data: '2026-09-04',
    tipo: 'Manutenção corretiva',
    descricao: 'Troca da válvula de segurança',
    quemRealizou: 'Oficina XYZ',
    phNome: 'Eng. Teste',
    relatorioCodigo: 'REL-1',
    ...p,
  };
}

const campos = (l: { campo: string }[]) => l.map((p) => p.campo);

describe('o que BLOQUEIA o trancamento', () => {
  it('registro completo pode trancar', () => {
    const r = validarRegistroLivro(reg());
    expect(r.obrigatorios).toEqual([]);
    expect(r.podeTrancar).toBe(true);
  });

  it('data, tipo e descrição são obrigatórios', () => {
    const r = validarRegistroLivro(reg({ data: '', tipo: '  ', descricao: '' }));
    expect(campos(r.obrigatorios)).toEqual(['data', 'tipo', 'descricao']);
    expect(r.podeTrancar).toBe(false);
  });

  it('registro inexistente não tranca', () => {
    expect(validarRegistroLivro(null).podeTrancar).toBe(false);
  });
});

describe('o que AVISA e deixa passar', () => {
  it('quem realizou, responsável e relatório de origem só avisam', () => {
    const r = validarRegistroLivro(reg({ quemRealizou: '', phNome: '', relatorioCodigo: '' }));
    expect(campos(r.opcionais)).toEqual(['quemRealizou', 'phNome', 'relatorioCodigo']);
    expect(r.obrigatorios).toEqual([]);
    // Ocorrência de manutenção não nasce de relatório, e exigir um impediria de
    // registrar exatamente o que a NR-13 13.4.1.9 manda registrar.
    expect(r.podeTrancar).toBe(true);
  });
});
