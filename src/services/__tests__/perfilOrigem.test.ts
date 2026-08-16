import { describe, expect, it } from 'vitest';
import { metadataPerfil, papelValido, PAPEIS_VALIDOS } from '../perfilOrigem';

describe('metadataPerfil', () => {
  it('mestre auto-cadastrado não carrega org nem cliente', () => {
    expect(metadataPerfil('mestre')).toEqual({ nr13_papel: 'mestre' });
  });

  it('sub-login carrega o papel e a organização', () => {
    expect(metadataPerfil('funcionario', { orgId: 'org-1' })).toEqual({
      nr13_papel: 'funcionario',
      nr13_org_id: 'org-1',
    });
  });

  it('cliente carrega papel, organização e cliente_id', () => {
    expect(metadataPerfil('cliente', { orgId: 'org-1', clienteId: 'cli-9' })).toEqual({
      nr13_papel: 'cliente',
      nr13_org_id: 'org-1',
      nr13_cliente_id: 'cli-9',
    });
  });

  // String vazia viraria `org_id = ''` no trigger, que não casa com organização
  // nenhuma. "Ausente" e "vazio" precisam ser a mesma coisa na saída.
  it('campo vazio nunca vai para a metadata', () => {
    expect(metadataPerfil('gerente', { orgId: '', clienteId: '' })).toEqual({
      nr13_papel: 'gerente',
    });
  });
});

describe('papelValido', () => {
  it('aceita exatamente os quatro papéis do sistema', () => {
    expect([...PAPEIS_VALIDOS]).toEqual(['mestre', 'gerente', 'funcionario', 'cliente']);
  });

  // Espelha a D-04: a lista branca das policies compara com sensibilidade a
  // caixa, então 'MESTRE' não pode ser aceito em lugar nenhum do caminho.
  it('recusa papel desconhecido, vazio e caixa trocada', () => {
    expect(papelValido('auditor_externo')).toBe(false);
    expect(papelValido('')).toBe(false);
    expect(papelValido('MESTRE')).toBe(false);
    expect(papelValido(null)).toBe(false);
    expect(papelValido(undefined)).toBe(false);
  });

  it('aceita os quatro papéis reais', () => {
    for (const p of PAPEIS_VALIDOS) expect(papelValido(p)).toBe(true);
  });
});
