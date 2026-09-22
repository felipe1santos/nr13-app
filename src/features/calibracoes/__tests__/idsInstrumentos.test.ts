/**
 * IDs ESTÁVEIS DO QUADRO 7.1.1 E A COMPATIBILIDADE COM O LEGADO (22/09/2026).
 *
 * Os campos editáveis do quadro tinham id pela POSIÇÃO da linha. Enquanto a
 * tabela imprimia sempre as seis, funcionou; no instante em que ela passa a
 * esconder os instrumentos não declarados, o índice deixa de identificar coisa
 * nenhuma e o override de um instrumento vai parar em outro.
 *
 * Este arquivo trava as duas metades:
 *
 * 1. o id novo é do TIPO, e não muda quando a lista encolhe ou é reordenada;
 * 2. os 18 overrides posicionais medidos em produção continuam valendo, cada um
 *    no seu instrumento — traduzidos pela ORDEM HISTÓRICA, não pela lista de
 *    hoje.
 *
 * Os cinco casos do fim do arquivo são os cinco rascunhos REAIS auditados antes
 * da mudança, com os valores como estão no banco.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CAMPOS_QUADRO,
  ORDEM_HISTORICA_QUADRO,
  comIdsEstaveis,
  idCampoInstrumento,
  instrumentoComOverride,
  lerIdEstavel,
  lerIdPosicional,
  overrideComConteudo,
  temIdPosicional,
  tipoNaPosicaoHistorica,
} from '../idsInstrumentos';
import { INSTRUMENTOS, TIPOS_INSTRUMENTO } from '../instrumentos';
import type { MapaOverrides } from '../../relatorios/overridesRelatorio';

const manual = (valor: string): MapaOverrides[string] => ({
  modo: 'manual',
  valor,
  auto: '',
  em: '2026-09-14T12:00:00.000Z',
});

describe('a ORDEM HISTÓRICA é o dicionário do legado', () => {
  it('é exatamente a ordem em que a tabela sempre foi impressa', () => {
    expect([...ORDEM_HISTORICA_QUADRO]).toEqual([
      'manometro',
      'termometro',
      'vacuometro',
      'pressostato',
      'transmissor',
      'psv',
    ]);
  });

  it('bate com o array do FORMULÁRIO de campo — a fonte de onde ela saiu', () => {
    // Se alguém reordenar o formulário, a ordem histórica NÃO pode segui-lo:
    // ela descreve o passado. Este teste existe para a divergência aparecer
    // aqui, e não num documento com valores trocados.
    const form = readFileSync('src/features/inspecoes/formularios/FormularioChecklist.tsx', 'utf8');
    const bloco = form.slice(form.indexOf('const INSTRUMENTOS = ['));
    const ids = [...bloco.slice(0, bloco.indexOf('];')).matchAll(/id: '(inst-[a-z]+)'/g)].map((m) => m[1]);
    const tipos = ids.map((id) => TIPOS_INSTRUMENTO.find((t) => INSTRUMENTOS[t].checklist.id === id));
    expect(tipos).toEqual([...ORDEM_HISTORICA_QUADRO]);
  });

  it('cada posição devolve o seu tipo, e fora da lista é null', () => {
    expect(tipoNaPosicaoHistorica(0)).toBe('manometro');
    expect(tipoNaPosicaoHistorica(3)).toBe('pressostato');
    expect(tipoNaPosicaoHistorica(5)).toBe('psv');
    expect(tipoNaPosicaoHistorica(6)).toBeNull();
    expect(tipoNaPosicaoHistorica(-1)).toBeNull();
  });
});

describe('o id ESTÁVEL', () => {
  it('é montado por uma função só, a partir do tipo', () => {
    expect(idCampoInstrumento('manometro', 'certificado')).toBe('instrumentos.manometro.certificado');
    expect(idCampoInstrumento('psv', 'possui')).toBe('instrumentos.psv.possui');
  });

  it('existe para os seis instrumentos e os três campos', () => {
    const todos = new Set<string>();
    for (const t of ORDEM_HISTORICA_QUADRO) for (const c of CAMPOS_QUADRO) todos.add(idCampoInstrumento(t, c));
    expect(todos.size).toBe(18);
  });

  it('volta a ser lido como tipo + campo', () => {
    expect(lerIdEstavel('instrumentos.pressostato.calibrado')).toEqual({
      tipo: 'pressostato',
      campo: 'calibrado',
    });
    expect(lerIdEstavel('instrumentos.inexistente.possui')).toBeNull();
    expect(lerIdEstavel('capa.art')).toBeNull();
  });

  it('não é confundido com o posicional', () => {
    expect(lerIdPosicional('instrumentos.3.certificado')).toEqual({ posicao: 3, campo: 'certificado' });
    expect(lerIdPosicional('instrumentos.psv.certificado')).toBeNull();
    expect(lerIdEstavel('instrumentos.3.certificado')).toBeNull();
  });
});

describe('ESCONDER ou REORDENAR linhas não muda a identidade dos campos', () => {
  it('o id da PSV é o mesmo esteja ela em que posição estiver', () => {
    // Simula as duas listas: a completa e a filtrada (só manômetro e PSV).
    const completa = [...ORDEM_HISTORICA_QUADRO];
    const filtrada = completa.filter((t) => t === 'manometro' || t === 'psv');
    const invertida = [...completa].reverse();

    for (const lista of [completa, filtrada, invertida]) {
      const psv = lista.find((t) => t === 'psv')!;
      expect(idCampoInstrumento(psv, 'certificado')).toBe('instrumentos.psv.certificado');
    }
  });

  it('tirar o termômetro não mexe no id de ninguém', () => {
    const antes = ORDEM_HISTORICA_QUADRO.map((t) => idCampoInstrumento(t, 'certificado'));
    const depois = ORDEM_HISTORICA_QUADRO.filter((t) => t !== 'termometro').map((t) =>
      idCampoInstrumento(t, 'certificado'),
    );
    for (const id of depois) expect(antes).toContain(id);
    expect(depois).not.toContain('instrumentos.termometro.certificado');
    // E o que sobrou continua apontando para o mesmo instrumento de sempre.
    expect(depois[2]).toBe('instrumentos.pressostato.certificado');
  });
});

describe('TRADUÇÃO do legado — nada se perde, nada se desloca', () => {
  it('cada posição vira o seu instrumento', () => {
    const mapa: MapaOverrides = {
      'instrumentos.0.certificado': manual('MAN-1'),
      'instrumentos.3.certificado': manual('PRESS-1'),
      'instrumentos.5.certificado': manual('PSV-1'),
    };
    const novo = comIdsEstaveis(mapa);
    expect(novo['instrumentos.manometro.certificado']).toEqual(manual('MAN-1'));
    expect(novo['instrumentos.pressostato.certificado']).toEqual(manual('PRESS-1'));
    expect(novo['instrumentos.psv.certificado']).toEqual(manual('PSV-1'));
    expect(temIdPosicional(novo)).toBe(false);
  });

  it('nenhum valor sobra sem dono e nenhum ganha dono errado', () => {
    const mapa: MapaOverrides = {};
    ORDEM_HISTORICA_QUADRO.forEach((_, i) => {
      mapa[`instrumentos.${i}.certificado`] = manual(`VALOR-${i}`);
    });
    const novo = comIdsEstaveis(mapa);
    ORDEM_HISTORICA_QUADRO.forEach((tipo, i) => {
      expect((novo[idCampoInstrumento(tipo, 'certificado')] as { valor: string }).valor).toBe(`VALOR-${i}`);
    });
    expect(Object.keys(novo)).toHaveLength(ORDEM_HISTORICA_QUADRO.length);
  });

  it('o id ESTÁVEL vence o posicional quando os dois existem', () => {
    const novo = comIdsEstaveis({
      'instrumentos.0.certificado': manual('ANTIGO'),
      'instrumentos.manometro.certificado': manual('NOVO'),
    });
    expect((novo['instrumentos.manometro.certificado'] as { valor: string }).valor).toBe('NOVO');
  });

  it('posição fora da ordem histórica é MANTIDA, nunca descartada nem chutada', () => {
    const novo = comIdsEstaveis({ 'instrumentos.9.certificado': manual('ORFAO') });
    expect((novo['instrumentos.9.certificado'] as { valor: string }).valor).toBe('ORFAO');
  });

  it('campos de OUTRAS seções passam intactos', () => {
    const novo = comIdsEstaveis({
      'capa.art': manual('ART-123'),
      'parecer.laudo': manual('APTO'),
      'instrumentos.0.possui': manual('X'),
    });
    expect(novo['capa.art']).toEqual(manual('ART-123'));
    expect(novo['parecer.laudo']).toEqual(manual('APTO'));
    expect(novo['instrumentos.manometro.possui']).toBeDefined();
  });
});

describe('override COM CONTEÚDO — o que conta como manifestação do engenheiro', () => {
  it('texto qualquer conta, inclusive "0" e "-"', () => {
    for (const v of ['Não instalado — não aplicável', '0', '-', 'X', '260814-1 / 14/08/2027']) {
      expect(overrideComConteudo(manual(v))).toBe(true);
    }
  });

  it('vazio e só espaço NÃO contam', () => {
    expect(overrideComConteudo(manual(''))).toBe(false);
    expect(overrideComConteudo(manual('   '))).toBe(false);
    expect(overrideComConteudo(undefined)).toBe(false);
    expect(overrideComConteudo({ modo: 'branco', auto: '', em: '' })).toBe(false);
  });

  it('acha o override de um instrumento em qualquer um dos três campos', () => {
    expect(instrumentoComOverride({ 'instrumentos.psv.possui': manual('X') }, 'psv')).toBe(true);
    expect(instrumentoComOverride({ 'instrumentos.psv.certificado': manual('C') }, 'psv')).toBe(true);
    expect(instrumentoComOverride({ 'instrumentos.psv.certificado': manual('C') }, 'termometro')).toBe(false);
  });
});

/**
 * OS CINCO RASCUNHOS REAIS.
 *
 * Valores copiados da auditoria somente-leitura feita em produção em
 * 22/09/2026, antes da mudança. O teste prova, caso a caso, que a tradução leva
 * cada valor ao instrumento certo.
 */
describe('os 5 rascunhos auditados em produção', () => {
  it('CASO 1 · ZZ-FASE3 — os seis certificados, e os três "não aplicável" no lugar', () => {
    const novo = comIdsEstaveis({
      'instrumentos.0.certificado': manual('CAL-2026/1187 — validade 12/03/2027'),
      'instrumentos.1.certificado': manual('Não instalado — não aplicável'),
      'instrumentos.2.certificado': manual('Não instalado — não aplicável'),
      'instrumentos.3.certificado': manual('CAL-2026/1188 — validade 12/03/2027'),
      'instrumentos.4.certificado': manual('Não instalado — não aplicável'),
      'instrumentos.5.certificado': manual('CAL-PSV-2026/0442 — validade 20/05/2027'),
    });
    const v = (t: string) => (novo[`instrumentos.${t}.certificado`] as { valor: string } | undefined)?.valor;
    expect(v('manometro')).toBe('CAL-2026/1187 — validade 12/03/2027');
    expect(v('termometro')).toBe('Não instalado — não aplicável');
    expect(v('vacuometro')).toBe('Não instalado — não aplicável');
    expect(v('pressostato')).toBe('CAL-2026/1188 — validade 12/03/2027');
    expect(v('transmissor')).toBe('Não instalado — não aplicável');
    expect(v('psv')).toBe('CAL-PSV-2026/0442 — validade 20/05/2027');
    // E os três "não aplicável" mantêm as linhas visíveis.
    for (const t of ['termometro', 'vacuometro', 'transmissor'] as const) {
      expect(instrumentoComOverride(novo, t)).toBe(true);
    }
  });

  it('CASO 2 · CMP001 — a PSV marcada por override, e não pelo checklist', () => {
    const novo = comIdsEstaveis({
      'instrumentos.5.possui': manual('X'),
      'instrumentos.5.calibrado': manual('X'),
    });
    expect((novo['instrumentos.psv.possui'] as { valor: string }).valor).toBe('X');
    expect((novo['instrumentos.psv.calibrado'] as { valor: string }).valor).toBe('X');
    expect(instrumentoComOverride(novo, 'psv')).toBe(true);
    // Não pode ter ido para o transmissor (posição 4) nem para ninguém mais.
    expect(instrumentoComOverride(novo, 'transmissor')).toBe(false);
  });

  it('CASO 3 · 8324 — os índices 0, 3 e 5 sem NENHUM deslocamento', () => {
    const novo = comIdsEstaveis({
      'instrumentos.0.certificado': manual('260814-1 / 14/08/2027'),
      'instrumentos.3.certificado': manual('260814-2 / 260814-3 / 14/08/2027'),
      'instrumentos.5.certificado': manual('260814-4 / 260814-5 / 14/08/2027'),
    });
    expect((novo['instrumentos.manometro.certificado'] as { valor: string }).valor).toBe('260814-1 / 14/08/2027');
    expect((novo['instrumentos.pressostato.certificado'] as { valor: string }).valor).toBe(
      '260814-2 / 260814-3 / 14/08/2027',
    );
    expect((novo['instrumentos.psv.certificado'] as { valor: string }).valor).toBe(
      '260814-4 / 260814-5 / 14/08/2027',
    );
    // O que NÃO tinha override continua sem — nada foi puxado para preencher.
    for (const t of ['termometro', 'vacuometro', 'transmissor'] as const) {
      expect(novo[idCampoInstrumento(t, 'certificado')]).toBeUndefined();
    }
  });

  it('CASO 4 · VP03 #1 — o traço do índice 0 fica no manômetro', () => {
    const novo = comIdsEstaveis({ 'instrumentos.0.certificado': manual('-') });
    expect((novo['instrumentos.manometro.certificado'] as { valor: string }).valor).toBe('-');
    expect(instrumentoComOverride(novo, 'manometro')).toBe(true);
  });

  it('CASO 5 · VP03 #2 — os seis "0" continuam seis, e "0" não vira vazio', () => {
    const mapa: MapaOverrides = {};
    for (let i = 0; i < 6; i++) mapa[`instrumentos.${i}.certificado`] = manual('0');
    const novo = comIdsEstaveis(mapa);
    for (const t of ORDEM_HISTORICA_QUADRO) {
      expect((novo[idCampoInstrumento(t, 'certificado')] as { valor: string }).valor).toBe('0');
      expect(instrumentoComOverride(novo, t)).toBe(true);
    }
  });

  it('nenhum dos cinco perde um valor sequer na tradução', () => {
    const casos: MapaOverrides[] = [
      {
        'instrumentos.0.certificado': manual('A'),
        'instrumentos.1.certificado': manual('B'),
        'instrumentos.2.certificado': manual('C'),
        'instrumentos.3.certificado': manual('D'),
        'instrumentos.4.certificado': manual('E'),
        'instrumentos.5.certificado': manual('F'),
      },
      { 'instrumentos.5.possui': manual('X'), 'instrumentos.5.calibrado': manual('X') },
      {
        'instrumentos.0.certificado': manual('A'),
        'instrumentos.3.certificado': manual('B'),
        'instrumentos.5.certificado': manual('C'),
      },
      { 'instrumentos.0.certificado': manual('-') },
      Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [`instrumentos.${i}.certificado`, manual('0')]),
      ) as MapaOverrides,
    ];
    let total = 0;
    for (const c of casos) {
      const novo = comIdsEstaveis(c);
      expect(Object.keys(novo)).toHaveLength(Object.keys(c).length);
      total += Object.keys(novo).length;
    }
    // 6 + 2 + 3 + 1 + 6 = 18, os mesmos 18 medidos em produção.
    expect(total).toBe(18);
  });
});

describe('nova edição NÃO volta a gravar id posicional', () => {
  it('a folha do relatório monta o id pela função central, nunca por índice', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    // O padrão antigo era `instrumentos.${i}.possui` — com o índice do map.
    expect(folhas).not.toMatch(/instrumentos\.\$\{i\}\./);
    expect(folhas).toContain('idCampoInstrumento');
  });

  it('a leitura dos overrides traduz sempre — é o que consolida na próxima gravação', () => {
    const ovr = readFileSync('src/features/relatorios/overridesRelatorio.ts', 'utf8');
    expect(ovr).toContain('comIdsEstaveis');
  });
});
