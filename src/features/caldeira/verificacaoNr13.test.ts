import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GRUPOS_NR13_CALDEIRA,
  TODOS_ITENS_NR13_CALDEIRA,
  itensNaoAtendidos,
  naoAtendidosSemObservacao,
  normalizarVerificacaoNr13,
  resumoVerificacaoNr13,
  verificacaoNr13Preenchida,
} from './verificacaoNr13';
import { ENSAIOS_DISPONIVEIS, FORM_POR_ENSAIO } from '../inspecoes/tipos';

const fonte = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');

describe('catálogo NR-13 de caldeira', () => {
  it('ids únicos e todo item cita a norma', () => {
    const ids = TODOS_ITENS_NR13_CALDEIRA.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of TODOS_ITENS_NR13_CALDEIRA) expect(it.item).toMatch(/^13\.\d/);
  });
  it('cobre os dispositivos obrigatórios 13.4.1.2 a) a e)', () => {
    const disp = GRUPOS_NR13_CALDEIRA.find((g) => g.id === 'dispositivos')!;
    expect(disp.itens.map((i) => i.item)).toEqual(['13.4.1.2 a)', '13.4.1.2 b)', '13.4.1.2 c)', '13.4.1.2 d)', '13.4.1.2 e)']);
  });
});

describe('respostas', () => {
  const dados = {
    respostas: { disp_valvula: 'sim', disp_nivel: 'nao', placa: 'nao', doc_alteracao: 'na', lixo: 'talvez' },
    observacoes: { disp_nivel: 'Intertravamento por nível baixo não desarma o queimador', placa: '  ' },
  };

  it('normaliza: descarta resposta inválida e observação vazia', () => {
    const n = normalizarVerificacaoNr13(dados);
    expect(n.respostas).not.toHaveProperty('lixo');
    expect(n.observacoes).not.toHaveProperty('placa');
  });

  it('resumo conta atende / não atende / N.A.', () => {
    expect(resumoVerificacaoNr13(dados)).toMatchObject({ respondidos: 4, atende: 1, naoAtende: 2, naoSeAplica: 1 });
  });

  it('itens não atendidos saem na ordem do catálogo, com a constatação', () => {
    const n = itensNaoAtendidos(dados);
    expect(n.map((x) => x.item)).toEqual(['13.4.1.2 e)', '13.4.1.3']);
    expect(n[0].observacao).toMatch(/Intertravamento/);
    expect(n[1].observacao).toBeNull();
  });

  it('"não atende" sem constatação é apontado', () => {
    expect(naoAtendidosSemObservacao(dados).map((i) => i.id)).toEqual(['placa']);
  });

  it('sem resposta nenhuma = verificação não feita (nunca "tudo atendido")', () => {
    expect(verificacaoNr13Preenchida(undefined)).toBe(false);
    expect(verificacaoNr13Preenchida({ respostas: {} })).toBe(false);
    expect(itensNaoAtendidos(undefined)).toEqual([]);
  });
});

describe('ligação no sistema', () => {
  it('é ensaio só de caldeira (fora da lista de vaso/autoclave)', () => {
    expect(ENSAIOS_DISPONIVEIS.map((e) => e.value)).not.toContain('verificacao_caldeira');
    expect(FORM_POR_ENSAIO.verificacao_caldeira).toBe('nr13_caldeira');
    expect(fonte('src/features/equipamento/perfilEquipamento.ts')).toContain('ENSAIO_VERIFICACAO_CALDEIRA');
  });
  it('folha 1.3 imprime a seção 13.4.4.12 i) e a finalização cobra a constatação', () => {
    expect(fonte('src/features/relatorios/pdfVetorial/folhasCaldeira.ts')).toContain("ITENS DA NR-13 NÃO ATENDIDOS (13.4.4.12 i)");
    expect(fonte('src/features/relatorios/validacaoFinalizacao.ts')).toContain('marcado "não atende" sem a constatação');
  });
});
