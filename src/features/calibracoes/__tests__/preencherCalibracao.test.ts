import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

vi.mock('../../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import {
  clienteDoEquipamento,
  motivoPadrao,
  padraoSugerido,
  pontosDeTexto,
  pontosDoComponente,
  proximaCalibracao,
  textoDePontos,
  unidadeDoComponente,
} from '../preencherCalibracao';
import {
  PONTOS_NA_FOLHA,
  cabeMaisUmPonto,
  maiorErro,
  paraLinhas,
  paraPontos,
  pontoCompleto,
  resumoPontos,
} from '../resultadosCalibracao';

/**
 * OS QUATRO BURACOS DA CADEIA DE CALIBRAÇÃO (10/09/2026), medidos no
 * certificado de PSV-GATE-9F3 em produção. Todos SILENCIOSOS: o documento saía
 * com `----` e nada na tela indicava erro.
 */
beforeEach(() => localStorage.clear());

describe('bloco 1 · o cliente vem do dono do equipamento', () => {
  it('lê pelo storage do sistema, não pelo localStorage cru', () => {
    // O `empresaAutoFill` antigo fazia `localStorage.getItem('nr13_minha_empresa')`.
    // Na v2 o localStorage é só o palco: a chave não está lá e a leitura
    // devolvia `{}` — o bloco 1 saía vazio em TODA calibração.
    localStorage.setItem(
      'nr13_emp_VP-9',
      JSON.stringify({
        razaoSocial: 'Indústria Alfa Ltda',
        endereco: 'Rua das Caldeiras, 100',
        bairro: 'Centro',
        cidade: 'Vitória',
        estado: 'ES',
      }),
    );
    expect(clienteDoEquipamento('VP-9')).toEqual({
      empresa: 'Indústria Alfa Ltda',
      endereco: 'Rua das Caldeiras, 100, Centro, Vitória, ES',
    });
  });

  it('sem cliente cadastrado, devolve vazio — não inventa a executante', () => {
    // Preencher com a empresa que EXECUTA um bloco chamado "cliente /
    // solicitante" era o comportamento antigo; o rodapé da folha já a imprime.
    expect(clienteDoEquipamento('VP-SEM')).toEqual({ empresa: '', endereco: '' });
  });
});

describe('bloco 5 · o padrão vem do cadastro de Certificados', () => {
  function semearPadrao(extra: Record<string, unknown> = {}) {
    localStorage.setItem(
      'nr13_rastreab_p1',
      JSON.stringify({
        id: 'p1',
        nome: 'Manômetro padrão MP-7',
        aparelho: 'WIKA 332',
        numeroSerie: 'MP7-2024',
        certificadoPadrao: 'RBC-2026/9911',
        validade: '2027-03-14',
        tipoInstrumento: 'manometro',
        injetarNoRelatorio: true,
        pdfBase64: '',
        criadoEm: '01/01/2026',
        ...extra,
      }),
    );
  }

  it('manômetro puxa o padrão de manômetro, com a data em pt-BR', () => {
    semearPadrao();
    expect(padraoSugerido('manometro', 'VP-9')).toEqual({
      padraoInst: 'Manômetro padrão MP-7 — WIKA 332',
      padraoSerie: 'MP7-2024',
      padraoCert: 'RBC-2026/9911',
      // O cadastro grava aaaa-mm-dd (input type=date); a folha imprime dd/mm/aaaa.
      padraoVal: '14/03/2027',
      origem: 'Manômetro padrão MP-7',
    });
  });

  it('PSV puxa o padrão de VÁLVULA — não o de manômetro', () => {
    // É a mesma correspondência que decide qual PDF de padrão é anexado ao
    // relatório. Divergir aqui faria o texto do bloco 5 e o anexo falarem de
    // instrumentos diferentes no mesmo documento.
    semearPadrao();
    expect(padraoSugerido('psv', 'VP-9').padraoCert).toBe('');
    localStorage.setItem(
      'nr13_rastreab_p2',
      JSON.stringify({
        id: 'p2',
        nome: 'Banca de PSV',
        certificadoPadrao: 'RBC-2026/5500',
        validade: '10/10/2027',
        tipoInstrumento: 'valvula',
        injetarNoRelatorio: true,
        pdfBase64: '',
        criadoEm: '01/01/2026',
      }),
    );
    expect(padraoSugerido('psv', 'VP-9').padraoCert).toBe('RBC-2026/5500');
  });

  it('versão substituída não preenche certificado novo', () => {
    semearPadrao({ substituidoEm: '05/09/2026' });
    expect(padraoSugerido('manometro', 'VP-9').origem).toBeNull();
  });

  it('sem padrão cadastrado, tudo vazio e origem nula — a tela avisa', () => {
    expect(padraoSugerido('manometro', 'VP-9')).toEqual({
      padraoInst: '',
      padraoSerie: '',
      padraoCert: '',
      padraoVal: '',
      origem: null,
    });
  });
});

describe('a data da próxima calibração deixa de sair como "DD/MM/AAAA"', () => {
  it('soma doze meses', () => {
    expect(proximaCalibracao('10/09/2026')).toBe('10/09/2027');
  });

  it('31 de março continua 31 de março', () => {
    expect(proximaCalibracao('31/03/2026')).toBe('31/03/2027');
  });

  it('29 de fevereiro recua para o último dia de fevereiro', () => {
    // Sem o recuo, 29/02/2028 + 12 meses viraria 01/03/2029 — uma data que o
    // usuário não digitou, num campo de validade.
    expect(proximaCalibracao('29/02/2028')).toBe('28/02/2029');
  });

  it('data inválida devolve vazio, em vez de chutar', () => {
    expect(proximaCalibracao('')).toBe('');
    expect(proximaCalibracao('10/09')).toBe('');
  });
});

describe('a conclusão não sai com a frase pela metade', () => {
  it('aprovado sem motivo ganha o mesmo texto do seletor da folha', () => {
    // A folha costura "…está <status>, pois durante o processo, o mesmo
    // <motivo>". Motivo vazio terminava o certificado em "o mesmo".
    expect(motivoPadrao('aprovado')).toMatch(/^apresentou resultados dentro dos critérios/);
    expect(motivoPadrao('aprovado')).toMatch(/\.$/);
  });

  it('reprovado diz fora dos critérios', () => {
    expect(motivoPadrao('reprovado')).toMatch(/fora dos critérios/);
  });

  it('sem status escolhido não inventa frase', () => {
    expect(motivoPadrao('')).toBe('');
  });
});

describe('o que não muda fica no cadastro do componente', () => {
  it('os pontos viram a coluna do valor do padrão', () => {
    expect(pontosDoComponente({ pontos: ['0', '2', '4'] } as never)).toEqual(['0', '2', '4']);
  });

  it('sem pontos cadastrados, cinco linhas em branco — como era antes', () => {
    expect(pontosDoComponente(null)).toEqual(['', '', '', '', '']);
    expect(pontosDoComponente({ pontos: [] } as never)).toHaveLength(5);
  });

  it('corta no que a FOLHA imprime, em vez de sugerir ponto que some', () => {
    // Medido em produção: seis pontos cadastrados, seis medidos, e o SEXTO não
    // aparecia no certificado — a última linha do HTML existia sem `id` para
    // receber injeção. Os ids foram criados; o corte impede o mesmo estrago
    // quando alguém cadastrar o sétimo.
    const dez = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    expect(pontosDoComponente({ pontos: dez } as never)).toHaveLength(PONTOS_NA_FOLHA);
  });

  it('a lista aceita vírgula, ponto-e-vírgula e quebra de linha', () => {
    expect(pontosDeTexto('0, 2; 4\n6,  8 ')).toEqual(['0', '2', '4', '6', '8']);
    expect(pontosDeTexto('')).toEqual([]);
    expect(textoDePontos(['0', '5', '10'])).toBe('0, 5, 10');
  });

  it('a unidade tem padrão, e é o que a folha imprimia fixo', () => {
    expect(unidadeDoComponente(null)).toBe('kgf/cm²');
    expect(unidadeDoComponente({ unidade: 'bar' } as never)).toBe('bar');
  });
});

describe('os resultados: um ponto no lugar de duas tabelas', () => {
  it('as duas tabelas viram uma lista de pontos', () => {
    const pontos = paraPontos(
      [
        { vc: '0', vi: '0,1' },
        { vc: '5', vi: '5,2' },
      ],
      [
        { vc: '0', vi: '0,0' },
        { vc: '5', vi: '4,9' },
      ],
    );
    expect(pontos).toEqual([
      { vc: '0', viC: '0,1', viD: '0,0' },
      { vc: '5', viC: '5,2', viD: '4,9' },
    ]);
  });

  it('o valor do ponto sobrevive quando só a tabela decrescente o tinha', () => {
    // Registro antigo podia ter preenchido um lado só. Perder o ponto por
    // estar na tabela "errada" apagaria dado do usuário.
    const pontos = paraPontos([{ vc: '', vi: '' }], [{ vc: '7', vi: '6,9' }]);
    expect(pontos[0].vc).toBe('7');
  });

  it('volta a ser as duas tabelas da folha, com o mesmo VC e o erro', () => {
    const linhas = paraLinhas([{ vc: '10', viC: '10,4', viD: '9,7' }]);
    expect(linhas.crescente).toEqual([{ vc: '10', vi: '10,4', erro: '-0,40' }]);
    expect(linhas.decrescente).toEqual([{ vc: '10', vi: '9,7', erro: '0,30' }]);
  });

  it('ida e volta não altera o que a folha imprime', () => {
    const crescente = [{ vc: '0', vi: '0,1' }, { vc: '5', vi: '5,2' }];
    const decrescente = [{ vc: '0', vi: '0,0' }, { vc: '5', vi: '4,9' }];
    const volta = paraLinhas(paraPontos(crescente, decrescente));
    expect(volta.crescente.map((l) => ({ vc: l.vc, vi: l.vi }))).toEqual(crescente);
    expect(volta.decrescente.map((l) => ({ vc: l.vc, vi: l.vi }))).toEqual(decrescente);
  });

  it('ponto com valor e nenhuma leitura NÃO conta como medido', () => {
    // É a sugestão que veio do cadastro, não uma medição feita. Contá-la diria
    // "5 de 5 pontos medidos" num certificado ainda vazio.
    expect(pontoCompleto({ vc: '5', viC: '', viD: '' })).toBe(false);
    expect(pontoCompleto({ vc: '5', viC: '5,1', viD: '' })).toBe(true);
    expect(pontoCompleto({ vc: '', viC: '5,1', viD: '' })).toBe(false);
  });

  it('o resumo conta só os pontos que existem', () => {
    expect(
      resumoPontos([
        { vc: '0', viC: '0,1', viD: '' },
        { vc: '5', viC: '', viD: '' },
        { vc: '', viC: '', viD: '' },
      ]),
    ).toEqual({ feitos: 1, total: 2 });
  });

  it('o maior erro é em módulo — o pior desvio, para qualquer lado', () => {
    expect(
      maiorErro([
        { vc: '10', viC: '10,4', viD: '9,2' },
        { vc: '5', viC: '5,1', viD: '5,0' },
      ]),
    ).toBe('0,80');
    expect(maiorErro([{ vc: '10', viC: '', viD: '' }])).toBeNull();
  });
});

describe('as regras ficam no código', () => {
  /**
   * A prosa sai antes de procurar o defeito: os comentários que explicam este
   * conserto CITAM a chamada errada, e sem tirá-los o gate acusaria a própria
   * explicação — obrigando a apagá-la para ficar verde.
   */
  const semProsa = (caminho: string) =>
    readFileSync(caminho, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n');

  const pagina = semProsa('src/pages/Calibracoes.tsx');
  const template = readFileSync('public/arquivos-inspecao/CERTIFICADO-CAL-MANOMETRO.html', 'utf8');

  it('a tela NÃO lê o localStorage cru para montar o certificado', () => {
    // Foi assim que o bloco 1 ficou vazio em toda organização v2.
    expect(pagina).not.toContain("localStorage.getItem('nr13_minha_empresa')");
    expect(pagina).not.toContain('function empresaAutoFill');
  });

  it('a unidade escolhida chega ao título das tabelas da folha', () => {
    // Estava fixa em Kgf/cm² no HTML: quem calibrasse em bar via a própria
    // medição rotulada com a unidade errada no documento emitido.
    expect(template).toContain('id="inj-unid-c"');
    expect(template).toContain("inj('inj-unid-c', c.unidade)");
    expect(template).toContain("inj('inj-unid-d', c.unidade)");
  });

  it('a folha tem uma linha com id para CADA ponto que o modal aceita', () => {
    // A 6ª linha das duas tabelas existia no HTML sem `id`: o ponto 6 medido
    // era descartado em silêncio no documento emitido.
    for (let i = 1; i <= PONTOS_NA_FOLHA; i++) {
      expect(template).toContain(`id="inj-vcv-${i}"`);
      expect(template).toContain(`id="inj-vic-${i}"`);
      expect(template).toContain(`id="inj-vcv-d-${i}"`);
      expect(template).toContain(`id="inj-vid-${i}"`);
    }
    expect(template).not.toContain(`id="inj-vcv-${PONTOS_NA_FOLHA + 1}"`);
  });

  it('o modal para de aceitar ponto no teto da folha', () => {
    const cheio = Array.from({ length: PONTOS_NA_FOLHA }, () => ({ vc: '1', viC: '', viD: '' }));
    expect(cabeMaisUmPonto(cheio)).toBe(false);
    expect(cabeMaisUmPonto(cheio.slice(1))).toBe(true);
  });

  it('os resultados são preenchidos pelo modal, não por vinte células soltas', () => {
    expect(pagina).toContain('<ModalResultados');
    expect(pagina).not.toContain('function setCrescente');
    expect(pagina).not.toContain('cal-tabela-resultados');
  });
});
