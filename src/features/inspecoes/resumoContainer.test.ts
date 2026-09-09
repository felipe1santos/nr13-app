import { describe, expect, it } from 'vitest';
import {
  dataBrDoCampo,
  resumirContainer,
  resumirEnsaio,
  rotuloConteudo,
} from './resumoContainer';
import type { ContainerInspecao } from './tipos';

/**
 * O helper que a criação de relatório usa para dizer o que EXISTE dentro de um
 * container. A regra que ele protege é uma só: não anunciar trabalho que não
 * foi feito.
 */

const container = (dados: ContainerInspecao['dados'], ensaios: ContainerInspecao['ensaios'] = []): ContainerInspecao => ({
  id: 'cont1',
  nome: 'Inspeção de teste',
  criadoEm: '05/09/2026',
  ensaios,
  dados,
});

describe('atribuído não é salvo', () => {
  it('ensaio atribuído e nunca aberto NÃO conta como preenchido', () => {
    const r = resumirContainer(container({}, ['ultrassom', 'teste_hidrostatico', 'checklist']));
    expect(r.ensaios).toHaveLength(3);
    expect(r.salvos).toHaveLength(0);
    expect(r.pendentes).toHaveLength(3);
    expect(rotuloConteudo(r)).toBe('Nenhum ensaio preenchido ainda');
  });

  it('blob presente mas SEM conteúdo continua não preenchido', () => {
    // É o caso que `dados[form] !== undefined` erra: o autosave grava ~1 s
    // depois de o pré-preenchimento mexer no estado, e um formulário aberto e
    // fechado sem responder nada deixa a chave lá.
    const r = resumirContainer(
      container(
        {
          visual_externo: { contratante: 'ACME', dataInspecao: '2026-09-05', itens: {}, fotos: [], resultado: '' },
        },
        ['visual_externo'],
      ),
    );
    expect(r.salvos).toHaveLength(0);
    expect(r.ensaios[0].salvo).toBe(false);
  });

  it('uma resposta já torna o ensaio preenchido', () => {
    const r = resumirEnsaio(
      container({ visual_externo: { itens: { i1: 'sim', i2: '' }, fotos: [] } }, ['visual_externo']),
      'visual_externo',
    );
    expect(r.salvo).toBe(true);
    expect(r.respostas).toBe(1);
  });

  it('só foto também conta — o ensaio existe no documento', () => {
    const r = resumirEnsaio(
      container({ visual_interno: { itens: {}, fotos: [{ descricao: 'a' }, { descricao: 'b' }] } }),
      'visual_interno',
    );
    expect(r.salvo).toBe(true);
    expect(r.fotos).toBe(2);
    // Não estava em `ensaios[]` e mesmo assim aparece: o técnico acrescentou o
    // formulário depois, e esconder dado salvo é pior do que mostrar fora da
    // lista original.
    expect(r.atribuido).toBe(false);
    expect(resumirContainer(container({ visual_interno: { fotos: [{}] } })).salvos).toHaveLength(1);
  });
});

describe('cada formulário tem a sua pergunta', () => {
  it('ultrassom conta MEDIÇÃO, não a grade de pontos', () => {
    // `pontos` é a definição da grade e vem do padrão só de abrir a tela.
    const semMedida = resumirEnsaio(
      container({ ultrassom: { pontos: [{ id: 'p1' }, { id: 'p2' }], medidas: {} } }, ['ultrassom']),
      'ultrassom',
    );
    expect(semMedida.salvo).toBe(false);
    expect(semMedida.medicoes).toBe(0);

    const comMedida = resumirEnsaio(
      container({ ultrassom: { medidas: { p1: { c1: '7,8', c2: '' }, p2: { c1: '7,5' } } } }, ['ultrassom']),
      'ultrassom',
    );
    expect(comMedida.salvo).toBe(true);
    expect(comMedida.medicoes).toBe(2);
  });

  it('teste hidrostático conta curva, foto, parecer ou pressão de teste', () => {
    expect(resumirEnsaio(container({ th: { curva: [{ t: 0, p: 0 }] } }), 'teste_hidrostatico').salvo).toBe(true);
    expect(resumirEnsaio(container({ th: { pressaoTeste: '3,4' } }), 'teste_hidrostatico').salvo).toBe(true);
    expect(resumirEnsaio(container({ th: { curva: [], fotos: [], parecer: '  ' } }), 'teste_hidrostatico').salvo).toBe(false);
  });

  it('checklist conta resposta, foto e comentário da documentação', () => {
    const r = resumirEnsaio(
      container({
        checklist: {
          respostas: { q1: 'Sim', q2: 'Não', q3: '' },
          fotos: [{}],
          fotosDocumentacao: [{}, {}],
          inspetor: 'João',
          dataInspecao: '2026-09-05',
        },
      }),
      'checklist',
    );
    expect(r.salvo).toBe(true);
    expect(r.respostas).toBe(2);
    expect(r.fotos).toBe(3);
    expect(r.data).toBe('05/09/2026');
  });
});

describe('o resumo do container', () => {
  const cheio = container(
    {
      checklist: { respostas: { q1: 'Sim' }, inspetor: 'Maria Souza', dataInspecao: '2026-09-05', fotos: [{}] },
      ultrassom: { medidas: { p1: { c1: '7,8' } }, dataUltrassom: '2026-09-06', resultado: 'APROVADO' },
      th: { curva: [{}], dataTeste: '2026-09-07', parecer: 'Estanque', fotos: [{}, {}] },
    },
    ['checklist', 'ultrassom', 'th' as never, 'teste_hidrostatico', 'visual_externo'],
  );

  it('separa salvos de pendentes e conta o que existe', () => {
    const r = resumirContainer(cheio);
    expect(r.salvos.map((e) => e.ensaio)).toEqual(['checklist', 'ultrassom', 'teste_hidrostatico']);
    expect(r.pendentes.map((e) => e.ensaio)).toEqual(['visual_externo']);
    expect(rotuloConteudo(r)).toBe('3 ensaios com dados salvos');
    expect(r.totalFotos).toBe(3);
    expect(r.totalMedicoes).toBe(1);
  });

  it('traz responsável, data e resultado sem leitura nova', () => {
    const r = resumirContainer(cheio);
    expect(r.responsavel).toBe('Maria Souza');
    expect(r.data).toBe('05/09/2026');
    expect(r.salvos.find((e) => e.ensaio === 'ultrassom')?.resultado).toBe('APROVADO');
    expect(r.salvos.find((e) => e.ensaio === 'teste_hidrostatico')?.conclusao).toBe('Estanque');
  });

  it('sem checklist preenchido não INVENTA responsável', () => {
    expect(resumirContainer(container({ ultrassom: { medidas: { p: { c: '1' } } } })).responsavel).toBeNull();
    expect(resumirContainer(container({})).data).toBe('05/09/2026');
  });

  it('container vazio não quebra e não anuncia nada', () => {
    const r = resumirContainer(container({}));
    expect(r.ensaios).toEqual([]);
    expect(r.salvos).toEqual([]);
    expect(r.totalFotos).toBe(0);
  });

  it('blob corrompido (string, null, array) não derruba a tela', () => {
    const r = resumirContainer(
      container({ ultrassom: 'lixo' as unknown, th: null as unknown, checklist: [] as unknown }, [
        'ultrassom',
        'teste_hidrostatico',
        'checklist',
      ]),
    );
    expect(r.salvos).toHaveLength(0);
    expect(r.ensaios).toHaveLength(3);
  });
});

describe('data do campo', () => {
  it('converte o ISO do input date e devolve o resto como veio', () => {
    expect(dataBrDoCampo('2026-09-05')).toBe('05/09/2026');
    expect(dataBrDoCampo('05/09/2026')).toBe('05/09/2026');
    expect(dataBrDoCampo('  ')).toBeNull();
    expect(dataBrDoCampo(undefined)).toBeNull();
    expect(dataBrDoCampo(42)).toBeNull();
  });
});
