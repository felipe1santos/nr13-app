import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CAMPOS_PREDEFINIVEIS,
  LINHAS_RECOMENDACAO,
  campoPredefinivel,
  gruposDeCampos,
  idPermitido,
  idRecomendacao,
  ordenarPorFolha,
  rotuloDoCampo,
} from './camposPredefiniveis';

const FOLHAS = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');

/**
 * A allowlist é uma PROMESSA: "marque este campo e ele será preenchido". Um id
 * escrito errado aqui quebra a promessa em silêncio — o conjunto grava, aplica,
 * diz "5 campos preenchidos" e o papel não muda. É a falha mais cara deste
 * sistema (§2-ter do CLAUDE.md), e é por isso que este arquivo confere contra o
 * gerador de verdade, e não contra uma cópia da lista.
 */
describe('todo id da allowlist existe no gerador', () => {
  const gerados = CAMPOS_PREDEFINIVEIS.filter((c) => !c.id.startsWith('recomendacoes.'));

  it.each(gerados.map((c) => [c.id]))('folhas.ts registra %s', (id) => {
    expect(FOLHAS).toContain(`'${id}'`);
  });

  it('as linhas de recomendação saem do mesmo laço que a tabela do documento', () => {
    expect(FOLHAS).toContain('id: `recomendacoes.${n}.texto`');
    expect(FOLHAS).toContain('id: `recomendacoes.${n}.prazo`');
    expect(FOLHAS).toContain('linhas: [1, 2, 3, 4].map((n) => [');
    expect(LINHAS_RECOMENDACAO).toBe(4);
    for (let n = 1; n <= LINHAS_RECOMENDACAO; n++) {
      expect(idPermitido(idRecomendacao(n, 'texto'))).toBe(true);
      expect(idPermitido(idRecomendacao(n, 'prazo'))).toBe(true);
    }
    expect(idPermitido(idRecomendacao(LINHAS_RECOMENDACAO + 1, 'texto'))).toBe(false);
  });
});

/**
 * O §8 do pedido, virado em teste.
 *
 * Predefinição escreve TEXTO MANUAL. Um conjunto que carimbasse PMTA, categoria,
 * medição ou laudo faria um documento assinado afirmar, por automação, um dado
 * técnico que ninguém apurou naquele equipamento.
 */
describe('o que NÃO pode ser predefinido', () => {
  const proibidos = [
    // Ficha do equipamento e identificação
    'capa.tag',
    'capa.equipamento',
    'capa.n-do-relatorio',
    'capa.responsavel',
    'capa.foto',
    'placa.foto',
    // Cálculo e categorização
    'categoria.pmta',
    'categoria.volume',
    'categoria.categoria',
    'categoria.classe-do-fluido',
    'categorizacao.pv-kpa',
    'resumo.conclusao',
    // Datas e ART — vêm do modal de Configurações
    'datas.execucao',
    'datas.validade',
    'capa.art',
    'inspecao.art',
    'proximas.externa',
    'proximas.interna',
    'proximas.th',
    // Medições e vida remanescente
    'ultrassom.espessura-nominal',
    'ultrassom.resultado',
    'ultrassom.acoplante',
    'vida.taxa',
    'vida.proxima',
    // Laudo APTO/INAPTO
    'parecer.laudo',
    'inspecao.resultado-ensaios',
    // Resultado dos exames, que vem do container de inspeção
    'inspecao.resultado-externo',
    'inspecao.resultado-interno',
    // Instrumento padrão / certificados
    'th.instrumento.certificado',
    'instrumentos.0.certificado',
  ];

  it.each(proibidos.map((id) => [id]))('%s está fora da allowlist', (id) => {
    expect(idPermitido(id)).toBe(false);
    expect(campoPredefinivel(id)).toBeUndefined();
  });

  it('id inventado é recusado sem lançar', () => {
    expect(idPermitido('qualquer.coisa')).toBe(false);
    expect(idPermitido('')).toBe(false);
    expect(rotuloDoCampo('qualquer.coisa')).toBe('qualquer.coisa');
  });
});

describe('a lista se apresenta na ordem das folhas', () => {
  it('os grupos são contíguos — nenhuma seção aparece duas vezes', () => {
    const nomes = gruposDeCampos().map((g) => g.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('ordenarPorFolha devolve a ordem do documento, não a de marcação', () => {
    // O usuário marcou o parecer antes do objetivo; o documento os mostra ao
    // contrário, e é assim que a revisão precisa listá-los.
    const fora = ['proximas.nota', 'objetivo.texto', 'recomendacoes.1.texto'];
    expect(ordenarPorFolha(fora)).toEqual([
      'objetivo.texto',
      'recomendacoes.1.texto',
      'proximas.nota',
    ]);
  });

  it('cada campo tem rótulo, grupo e tipo', () => {
    for (const c of CAMPOS_PREDEFINIVEIS) {
      expect(c.rotulo.trim()).not.toBe('');
      expect(c.grupo.trim()).not.toBe('');
      expect(['texto', 'textoLongo', 'opcao']).toContain(c.tipo);
      if (c.tipo === 'opcao') expect((c.opcoes ?? []).length).toBeGreaterThan(1);
    }
  });

  it('nenhum id repetido', () => {
    const ids = CAMPOS_PREDEFINIVEIS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
