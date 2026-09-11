import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ComponenteCal, LoteCal } from '../componentesService';
import type { DadosCalibracao } from '../tipos';
import {
  FILTRO_LOTES_VAZIO,
  calibracaoDoItem,
  dataDoLote,
  filtrarLotes,
  historicoDoComponente,
  itensDoLote,
  ordenarLotes,
  podeExcluirLote,
  progressoLote,
} from '../lote';
import { dataValida } from '../ModalNovoLote';

/**
 * AS REGRAS DO LOTE (11/09/2026).
 *
 * `data` e `itens` nasceram opcionais porque nenhum lote existente foi
 * reescrito. Os testes de fallback são o que garante que um lote gravado antes
 * desta data continue significando exatamente o que significava.
 */
const comp = (id: string, nome: string, tipo: 'manometro' | 'psv' = 'manometro'): ComponenteCal => ({
  id,
  tipo,
  nome,
  criadoEm: '01/01/2026',
});

const cal = (id: string, loteId: string, componenteId: string, data = '11/09/2026'): DadosCalibracao =>
  ({
    id,
    tag: 'VP-1',
    tipo: 'manometro',
    nome: componenteId,
    criadoEm: data,
    loteId,
    componenteId,
    dataCalibracao: data,
    dataProxCalibracao: '11/09/2027',
    numeroCertificado: `CERT-${id}`,
  }) as unknown as DadosCalibracao;

const lote = (id: string, extra: Partial<LoteCal> = {}): LoteCal => ({
  id,
  criadoEm: '20/09/2026',
  descricao: `Lote ${id}`,
  ...extra,
});

describe('a data do lote', () => {
  it('usa a data de EXECUÇÃO quando ela existe', () => {
    // Calibração é lançada dias depois de feita: a data do registro
    // (`criadoEm`) não é a data do ensaio.
    expect(dataDoLote(lote('a', { data: '11/09/2026' }))).toBe('11/09/2026');
  });

  it('cai em criadoEm no lote legado — é a única data que ele tem', () => {
    expect(dataDoLote(lote('a'))).toBe('20/09/2026');
    expect(dataDoLote(lote('a', { data: '   ' }))).toBe('20/09/2026');
  });

  it('recusa data que não existe no calendário', () => {
    expect(dataValida('11/09/2026')).toBe(true);
    expect(dataValida('29/02/2027')).toBe(false);
    expect(dataValida('31/04/2026')).toBe(false);
    expect(dataValida('11/9/2026')).toBe(false);
    expect(dataValida('')).toBe(false);
  });
});

describe('os itens do lote', () => {
  const comps = [comp('c1', 'MAN-01'), comp('c2', 'MAN-02'), comp('c3', 'PSV-01', 'psv')];

  it('o lote cobre só o que foi escolhido', () => {
    expect(itensDoLote(lote('a', { itens: ['c1', 'c3'] }), comps).map((c) => c.id)).toEqual([
      'c1',
      'c3',
    ]);
  });

  it('lote legado cobre todos — é o que o accordion antigo mostrava', () => {
    expect(itensDoLote(lote('a'), comps)).toHaveLength(3);
  });

  it('componente excluído some da lista, em vez de virar linha fantasma', () => {
    expect(itensDoLote(lote('a', { itens: ['c1', 'sumido'] }), comps).map((c) => c.id)).toEqual(['c1']);
  });
});

describe('o progresso do lote', () => {
  const comps = [comp('c1', 'MAN-01'), comp('c2', 'MAN-02'), comp('c3', 'PSV-01', 'psv')];

  it('conta contra os itens DO LOTE, não contra o parque', () => {
    // Era esse o defeito: "2/2 Completo" comparava com o total de componentes
    // do equipamento HOJE. Cadastrar um manômetro novo fazia todo lote antigo
    // voltar a "Em andamento", retroativamente.
    const l = lote('a', { itens: ['c1', 'c2'] });
    const cals = [cal('x1', 'a', 'c1'), cal('x2', 'a', 'c2')];
    expect(progressoLote(l, comps, cals)).toEqual({ feitos: 2, total: 2, completo: true });
  });

  it('cadastrar um componente novo NÃO desfaz um lote completo', () => {
    const l = lote('a', { itens: ['c1'] });
    const cals = [cal('x1', 'a', 'c1')];
    expect(progressoLote(l, comps, cals).completo).toBe(true);
    const maisUm = [...comps, comp('c9', 'MAN-09')];
    expect(progressoLote(l, maisUm, cals).completo).toBe(true);
  });

  it('calibração de OUTRO lote não conta neste', () => {
    const l = lote('a', { itens: ['c1', 'c2'] });
    expect(progressoLote(l, comps, [cal('x1', 'b', 'c1')]).feitos).toBe(0);
  });

  it('lote sem item nenhum não é completo', () => {
    // 0/0 seria uma rodada concluída sem ter calibrado nada.
    expect(progressoLote(lote('a', { itens: [] }), comps, []).completo).toBe(false);
  });

  it('acha a calibração de um item dentro do lote', () => {
    const cals = [cal('x1', 'a', 'c1'), cal('x2', 'b', 'c1')];
    expect(calibracaoDoItem('a', 'c1', cals)?.id).toBe('x1');
    expect(calibracaoDoItem('a', 'c2', cals)).toBeNull();
  });
});

describe('ordem e filtro da lista', () => {
  const comps = [comp('c1', 'MAN-01'), comp('c2', 'PSV-01', 'psv')];
  const lotes = [
    lote('a', { data: '10/03/2026', descricao: 'Calibração anual 2026', itens: ['c1'] }),
    lote('b', { data: '22/11/2026', descricao: 'Extraordinária', itens: ['c1', 'c2'] }),
    lote('c', { data: '01/07/2025', descricao: 'Calibração 2025', itens: ['c2'] }),
  ];
  const cals = [cal('x1', 'a', 'c1'), cal('x2', 'c', 'c2')];

  it('o mais recente vem primeiro, pela data de execução', () => {
    expect(ordenarLotes(lotes).map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('sem filtro, passam todos', () => {
    expect(filtrarLotes(lotes, FILTRO_LOTES_VAZIO, comps, cals)).toHaveLength(3);
  });

  it('a busca casa o nome, sem acento e sem caixa', () => {
    expect(
      filtrarLotes(lotes, { termo: 'CALIBRACAO', situacao: 'todos' }, comps, cals).map((l) => l.id),
    ).toEqual(['a', 'c']);
  });

  it('a busca casa a data', () => {
    expect(filtrarLotes(lotes, { termo: '22/11', situacao: 'todos' }, comps, cals).map((l) => l.id)).toEqual([
      'b',
    ]);
  });

  it('a busca casa o ACESSÓRIO — "quando o PSV-01 foi calibrado?"', () => {
    // É a pergunta que se faz nesta tela, e ela não se responde procurando
    // pelo nome do lote.
    expect(filtrarLotes(lotes, { termo: 'psv-01', situacao: 'todos' }, comps, cals).map((l) => l.id)).toEqual(
      ['b', 'c'],
    );
  });

  it('a situação separa completo de em andamento', () => {
    expect(filtrarLotes(lotes, { termo: '', situacao: 'completo' }, comps, cals).map((l) => l.id)).toEqual([
      'a',
      'c',
    ]);
    expect(filtrarLotes(lotes, { termo: '', situacao: 'andamento' }, comps, cals).map((l) => l.id)).toEqual([
      'b',
    ]);
  });
});

describe('histórico e exclusão', () => {
  it('o histórico do componente vem do mais recente ao mais antigo', () => {
    const cals = [
      cal('v', 'a', 'c1', '10/09/2024'),
      cal('n', 'b', 'c1', '10/09/2026'),
      cal('m', 'c', 'c1', '10/09/2025'),
      cal('outro', 'a', 'c2', '10/09/2026'),
    ];
    expect(historicoDoComponente('c1', cals).map((c) => c.id)).toEqual(['n', 'm', 'v']);
  });

  it('lote com certificado NÃO pode ser excluído — regra que já existia', () => {
    expect(podeExcluirLote('a', [cal('x', 'a', 'c1')])).toBe(false);
    expect(podeExcluirLote('a', [cal('x', 'b', 'c1')])).toBe(true);
    expect(podeExcluirLote('a', [])).toBe(true);
  });
});

describe('a tela não voltou a crescer com o conteúdo do lote', () => {
  const pagina = readFileSync('src/pages/Calibracoes.tsx', 'utf8');
  const css = readFileSync('src/pages/calibracoes.css', 'utf8');

  it('o accordion saiu — o lote abre em modal', () => {
    expect(pagina).toContain('<ModalDetalhesLote');
    expect(pagina).not.toContain('cal-lote-corpo');
    expect(pagina).not.toContain('cal-lote-head-row');
  });

  it('a criação do lote é um modal com nome, data e itens', () => {
    expect(pagina).toContain('<ModalNovoLote');
    expect(pagina).not.toContain('<CampoNomeLote');
  });

  it('cada lote é UMA linha, de 44 px', () => {
    const bloco = css.slice(css.indexOf('.cal-lote-abrir {'));
    expect(bloco).toMatch(/min-height:\s*44px/);
  });

  it('os acessórios ficam em linha e a faixa rola — a página não alarga', () => {
    const bloco = css.slice(css.indexOf('.cal-acessorios {'), css.indexOf('.cal-acess {'));
    expect(bloco).toMatch(/overflow-x:\s*auto/);
  });

  it('no celular, data e itens têm áreas SEPARADAS na grade', () => {
    // Duas áreas iguais empilhariam um elemento sobre o outro.
    const movel = css.slice(css.indexOf('@media (max-width: 720px)'));
    expect(movel).toContain("'data itens selo'");
    expect(movel).toContain('grid-area: data');
    expect(movel).toContain('grid-area: itens');
  });
});
