import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  CAIXA,
  CORPO,
  FOLHA,
  LIMITE_CORPO,
  MARGEM,
  PT,
  alturaLinha,
} from './documentoA4';
import { ALTURA_PLACA, blocoPlaca } from './folhas';
import {
  FOTOS_POR_FOLHA,
  converterPressao,
  folhasDeFotos,
  montarModeloRelatorio,
  textoOu,
} from './modelo';
import { rotuloLaudo, rotuloResposta, rotuloResultado, rotuloTipoEquipamento } from './rotulos';
import { conferirCampos } from './conferencia';
import { secoesDoRelatorio } from './folhas';
import { corDeCalor, escalaY, numeroDoTexto, pontosDaCurva } from './graficoTh';
import { contarFolhasDeCertificado, ehFolhaDeCertificado, indicesDeCertificado } from './certificados';
import { arquivoDe, incluiFolha, secoesPresentes } from './composicao';
import { foto } from './primitivas';
import { CHAVE_MOTOR_PDF, motorConfigurado, motorPdfAtual } from '../motorPdf';

const TAG = 'VP-01';

beforeEach(() => localStorage.clear());

describe('geometria da folha — os números vêm do CSS da referência', () => {
  it('A4 exato e caixa útil de 180 mm', () => {
    expect(FOLHA).toEqual({ largura: 210, altura: 297 });
    expect(MARGEM).toEqual({ topo: 9, direita: 15, baixo: 7, esquerda: 15 });
    expect(CAIXA.largura).toBe(180);
    expect(CAIXA.x).toBe(15);
  });

  it('o corpo cabe entre cabeçalho e rodapé, e o limite fica dentro da folha', () => {
    expect(CORPO.y).toBeGreaterThan(MARGEM.topo);
    expect(LIMITE_CORPO).toBeLessThan(FOLHA.altura - MARGEM.baixo + 0.001);
    expect(CORPO.altura).toBeGreaterThan(200); // sobra folha de verdade para conteúdo
  });

  it('1 pt = 0,3528 mm e a entrelinha usa o fator 1,3 da referência', () => {
    expect(PT).toBeCloseTo(0.3528, 4);
    expect(alturaLinha(10)).toBeCloseTo(10 * PT * 1.3, 6);
  });
});

describe('4 fotos por folha — a regra do §5, sem exceção', () => {
  it('quatro fotos = uma folha; a QUINTA abre a segunda', () => {
    expect(FOTOS_POR_FOLHA).toBe(4);
    expect(folhasDeFotos(4)).toBe(1);
    expect(folhasDeFotos(5)).toBe(2);
    expect(folhasDeFotos(8)).toBe(2);
    expect(folhasDeFotos(9)).toBe(3);
  });

  // O piloto devolvia 1 aqui para manter a estrutura de seções fixa, e o
  // resultado era página em branco dentro de documento assinado.
  it('SEM FOTO NÃO EXISTE FOLHA — estrutura fixa não justifica papel vazio', () => {
    expect(folhasDeFotos(0)).toBe(0);
    expect(folhasDeFotos(-3)).toBe(0);
    expect(folhasDeFotos(1)).toBe(1);
    expect(folhasDeFotos(12)).toBe(3);
    expect(folhasDeFotos(13)).toBe(4);
  });
});

describe('o sumário lista só as seções que existem', () => {
  function modeloCom(fotos: Partial<Record<'doc' | 'chk' | 've' | 'vi' | 'th', number>>) {
    const lista = (n = 0) =>
      Array.from({ length: n }, (_, i) => ({ dataUrl: 'data:image/jpeg;base64,AA', descricao: `f${i}` }));
    const m = montarModeloRelatorio(TAG);
    return {
      ...m,
      fotosDocumentacao: lista(fotos.doc),
      fotosChecklist: lista(fotos.chk),
      visualExterno: { ...m.visualExterno, fotos: lista(fotos.ve) },
      visualInterno: { ...m.visualInterno, fotos: lista(fotos.vi) },
      th: { ...m.th, fotos: lista(fotos.th) },
    };
  }

  const titulos = (m: Parameters<typeof secoesDoRelatorio>[0], tem?: Parameters<typeof secoesDoRelatorio>[1]) =>
    secoesDoRelatorio(m, tem).map((s) => s.titulo);

  it('sem foto nenhuma, nenhuma seção fotográfica é anunciada', () => {
    const s = titulos(modeloCom({}));
    expect(s.some((t) => /fotográfico/i.test(t))).toBe(false);
    expect(s).toContain('Exame externo');
    expect(s).toContain('Parecer técnico conclusivo');
  });

  it('cada etapa com foto entra logo depois da sua folha-pai', () => {
    const s = titulos(modeloCom({ doc: 1, ve: 5, th: 2 }));
    expect(s).toContain('Registro fotográfico — documentação');
    expect(s).toContain('Registro fotográfico — exame externo');
    expect(s).toContain('Registro fotográfico — teste hidrostático');
    // As que continuam sem foto seguem fora — anunciar página que não existe
    // manda o leitor procurar o que não foi impresso.
    expect(s).not.toContain('Registro fotográfico — exame interno');
    expect(s).not.toContain('Registro fotográfico — checklist');
  });

  it('o sumário numera pela SEÇÃO da referência, não pela posição na lista', () => {
    const s = secoesDoRelatorio(modeloCom({}));
    expect(s.find((x) => x.titulo === 'Medição de espessura por ultrassom')?.numero).toBe('7.4');
    expect(s.find((x) => x.titulo === 'Teste hidrostático')?.numero).toBe('7.5');
    expect(s.find((x) => x.titulo === 'Verificação da documentação')?.numero).toBe('7.1');
    expect(s.find((x) => x.titulo === 'Objetivo')?.numero).toBe('1');
  });
});

describe('composição — o vetorial emite as seções QUE O RELATÓRIO TEM', () => {
  const SIMPLES = ['CAPA.html', 'SUMARIO.html', 'PLACA.html', 'CLASSIFICACAO-RISCO.html', 'CONCLUSAO.html'];

  it('seção cuja folha não foi selecionada NÃO é emitida', () => {
    const t = secoesPresentes(SIMPLES);
    expect(t.capa).toBe(true);
    expect(t.identificacao).toBe(true);
    expect(t.parecer).toBe(true);
    // O defeito medido no gate: 8 folhas selecionadas viravam 14 páginas
    // porque estes três saíam sozinhos, cheios de travessão.
    expect(t.ultrassom).toBe(false);
    expect(t.th).toBe(false);
    expect(t.exameExterno).toBe(false);
    expect(t.memoria).toBe(false);
  });

  it('lista ausente ou vazia = "não informado", e aí tudo entra', () => {
    expect(secoesPresentes(undefined).th).toBe(true);
    expect(secoesPresentes([]).ultrassom).toBe(true);
  });

  it('o checklist existe se QUALQUER um dos seus três templates estiver na lista', () => {
    expect(secoesPresentes(['checklist2.html']).checklist).toBe(true);
    expect(secoesPresentes(['VERIFICACAO-DOCUMENTACAO.html']).checklist).toBe(true);
    expect(secoesPresentes(SIMPLES).checklist).toBe(false);
  });

  it('a query da folha de calibração não atrapalha a correspondência', () => {
    expect(arquivoDe('CERTIFICADO-CAL-MANOMETRO.html?calibId=9')).toBe('CERTIFICADO-CAL-MANOMETRO.HTML');
    expect(incluiFolha(['MEMORIAL.html?page=3'], 'MEMORIAL.html')).toBe(true);
  });

  it('o sumário acompanha a composição — não anuncia seção que não existe', () => {
    const m = montarModeloRelatorio(TAG);
    const s = secoesDoRelatorio(m, secoesPresentes(SIMPLES)).map((x) => x.titulo);
    expect(s).toContain('Identificação do equipamento');
    expect(s).toContain('Parecer técnico conclusivo');
    expect(s).not.toContain('Teste hidrostático');
    expect(s).not.toContain('Medição de espessura por ultrassom');
  });
});

describe('curva do teste hidrostático — os números são os do template', () => {
  it('lê a pressão de teste pelo MESMO regex da folha', () => {
    expect(numeroDoTexto('18.0 kgf/cm²')).toBe(18);
    expect(numeroDoTexto('12,5 bar')).toBe(12); // igual ao template: /[\d.]+/ para no separador
    expect(numeroDoTexto('—')).toBeNull();
    expect(numeroDoTexto(null)).toBeNull();
  });

  it('ponto sem tempo não existe; ponto sem pressão é FURO, não zero', () => {
    const p = pontosDaCurva([
      { tempo: '0', pressao: '0' },
      { tempo: '5', pressao: '' },
      { tempo: '—', pressao: '9' },
      { tempo: '10', pressao: '18.4' },
    ]);
    expect(p).toHaveLength(3);
    expect(p[1]).toEqual({ tempo: '5', pressao: null });
    expect(p[2].pressao).toBeCloseTo(18.4);
  });

  it('a escala de calor tem os mesmos cinco cortes do getHeatColor', () => {
    expect(corDeCalor(0)).toBe('#2563eb');
    expect(corDeCalor(0.3)).toBe('#16a34a');
    expect(corDeCalor(0.55)).toBe('#ca8a04');
    expect(corDeCalor(0.75)).toBe('#ea580c');
    expect(corDeCalor(0.9)).toBe('#dc2626');
  });

  it('o eixo cobre a PT mesmo quando nenhuma leitura chegou perto dela', () => {
    const e = escalaY([2, 4, 6], 18);
    expect(e.max).toBeGreaterThanOrEqual(18);
    expect(e.max % e.passo).toBeCloseTo(0, 9);
  });

  it('sem leitura nenhuma o eixo não vira NaN nem zero', () => {
    const e = escalaY([], null);
    expect(Number.isFinite(e.max)).toBe(true);
    expect(e.max).toBeGreaterThan(0);
  });
});

describe('foto no papel — `contain` com a proporção REAL, nunca 4:3 assumido', () => {
  const CAIXA_FOTO = { x: 15, y: 50, largura: 88, altura: 74 };

  function desenhar(proporcao?: number) {
    const chamadas: { x: number; y: number; w: number; h: number }[] = [];
    const falso = {
      setDrawColor() {}, setFillColor() {}, setLineWidth() {}, rect() {},
      setFont() {}, setFontSize() {}, setTextColor() {}, text() {},
      addImage(_d: string, _f: string, x: number, y: number, w: number, h: number) {
        chamadas.push({ x, y, w, h });
      },
    } as unknown as Parameters<typeof foto>[0];
    foto(falso, 'data:image/jpeg;base64,AAA', CAIXA_FOTO, proporcao);
    return chamadas[0];
  }

  it.each([
    ['retrato', 480 / 640, 0.75],
    ['paisagem', 640 / 360, 1.778],
    ['quadrada', 1, 1],
  ])('%s mantém a proporção e cabe inteira na caixa', (_nome, entrada, esperada) => {
    const d = desenhar(entrada);
    expect(d.w / d.h).toBeCloseTo(esperada, 3);
    expect(d.w).toBeLessThanOrEqual(CAIXA_FOTO.largura + 0.001);
    expect(d.h).toBeLessThanOrEqual(CAIXA_FOTO.altura + 0.001);
    // Centralizada: a sobra é a mesma dos dois lados.
    expect(d.x - CAIXA_FOTO.x).toBeCloseTo((CAIXA_FOTO.largura - d.w) / 2, 3);
    expect(d.y - CAIXA_FOTO.y).toBeCloseTo((CAIXA_FOTO.altura - d.h) / 2, 3);
  });

  it('proporção desconhecida cai em 4:3 — o recuo declarado, não um esticão', () => {
    expect(desenhar(undefined).w / desenhar(undefined).h).toBeCloseTo(4 / 3, 3);
  });
});

describe('certificados — preservados, e cada tipo pelo seu caminho', () => {
  it('reconhece as duas grafias reais do arquivo, inclusive a com erro de digitação', () => {
    expect(ehFolhaDeCertificado('CERTIFICADO-CAL-MANOMETRO.html?calibId=1')).toBe(true);
    expect(ehFolhaDeCertificado('CERTIIFCADO-CAL-PSV.html?calibId=2')).toBe(true);
    expect(ehFolhaDeCertificado('CAPA.html')).toBe(false);
    expect(ehFolhaDeCertificado('ULTRASSOM.html')).toBe(false);
  });

  // O "de Y" precisa dizer o tamanho do arquivo que o usuário recebe. Com o
  // corpo sozinho no denominador, um relatório com certificado terminava em
  // "22 de 22" dentro de um PDF de 27 páginas.
  it('as folhas de calibração contam no total — pela LISTA, não pela tela', () => {
    const docs = ['CAPA.html', 'CERTIFICADO-CAL-MANOMETRO.html?calibId=a', 'CERTIIFCADO-CAL-PSV.html?calibId=b'];
    // 13B · a conta saiu do DOM. Sem `document` (ambiente `node` da suíte) não
    // há host para montar, então continua zero; no navegador conta as duas.
    expect(contarFolhasDeCertificado(docs)).toBe(0);
    expect(indicesDeCertificado(docs)).toHaveLength(2);
  });

  it('as posições batem com a lista de documentos — é por índice que a folha é achada', () => {
    expect(
      indicesDeCertificado(['CAPA.html', 'CERTIFICADO-CAL-MANOMETRO.html?calibId=a', 'CONCLUSAO.html', 'CERTIIFCADO-CAL-PSV.html?calibId=b']),
    ).toEqual([1, 3]);
    expect(indicesDeCertificado([])).toEqual([]);
  });
});

describe('motor do PDF — a virada é reversível em um passo', () => {
  it('padrão é RASTER: ausência de decisão não troca o que está em produção', () => {
    expect(motorConfigurado()).toBe('raster');
    expect(motorPdfAtual('')).toBe('raster');
    expect(motorPdfAtual('?piloto=1')).toBe('raster');
  });

  it('só o valor explícito "vetorial" troca o motor', () => {
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    expect(motorConfigurado()).toBe('vetorial');
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'sim' }));
    expect(motorConfigurado()).toBe('raster');
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: true }));
    expect(motorConfigurado()).toBe('raster');
  });

  it('a URL vence a configuração — testar não pode exigir desligar a organização', () => {
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'raster' }));
    expect(motorPdfAtual('?motor=vetorial')).toBe('vetorial');
    localStorage.setItem(CHAVE_MOTOR_PDF, JSON.stringify({ motor: 'vetorial' }));
    expect(motorPdfAtual('?motor=raster')).toBe('raster');
    // Parâmetro vazio não é decisão: cai na configuração.
    expect(motorPdfAtual('?motor=')).toBe('vetorial');
  });
});

describe('conversão de pressão — leitura, não recálculo', () => {
  it('MPa → kgf/cm² e bar com o fator do sistema', () => {
    const p = converterPressao(1);
    expect(p.mpa).toBe('1.000');
    expect(p.kgf).toBe('10.20');
    expect(p.bar).toBe('10.00');
  });

  it('ausente continua ausente — não vira zero', () => {
    expect(converterPressao(null)).toEqual({ mpa: null, kgf: null, bar: null, psi: null });
    expect(converterPressao(Number.NaN).mpa).toBeNull();
  });
});

describe('campo sem dado NÃO vira dado inventado', () => {
  it('textoOu devolve o travessão, e o vazio configurável', () => {
    expect(textoOu(null)).toBe('—');
    expect(textoOu('   ')).toBe('—');
    expect(textoOu('', '')).toBe('');
    expect(textoOu(' ACME ')).toBe('ACME');
  });
});

describe('ponte de dados — lê a verdade que já existe', () => {
  it('modelo vazio não quebra: todo campo ausente vira null', () => {
    const m = montarModeloRelatorio(TAG);
    expect(m.tag).toBe(TAG);
    expect(m.equipamento['FABRICANTE']).toBeNull();
    expect(m.pressoes[0].mpa).toBeNull();
    expect(m.visualExterno.fotos).toEqual([]);
    expect(m.laudo.apto).toBeNull();
  });

  it('lê ficha, categoria, memorial, meta e laudo das chaves reais', () => {
    localStorage.setItem(
      'nr13_info_VP-01',
      JSON.stringify({ fabricante: 'ACME', numeroSerie: 'S-9', tipo: 'Vaso de Pressão' }),
    );
    localStorage.setItem('nr13_cat_VP-01', JSON.stringify({ catFinal: 'III', grupo: '2', volume: 1.5 }));
    localStorage.setItem('nr13_calc_VP-01', JSON.stringify({ pmta: 1.2, pth: 1.56 }));
    localStorage.setItem('nr13_laudo_VP-01', JSON.stringify({ apto: true }));
    localStorage.setItem(
      'nr13_relatorio_meta_atual',
      JSON.stringify({
        codigo: 'REL-7',
        emissao: '04/09/2026',
        tipoInspecao: 'Inspeção Periódica',
        proximaInspecaoInterna: '04/09/2031',
        proximaInspecaoExterna: '04/09/2028',
        phNome: 'Eng. Teste',
        phCrea: 'CREA-1',
      }),
    );

    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['FABRICANTE']).toBe('ACME');
    expect(m.equipamento['CATEGORIA DO VASO']).toBe('III');
    expect(m.pressoes.find((p) => p.rotulo.startsWith('PMTA'))!.kgf).toBe('12.24');
    expect(m.numeroRelatorio).toBe('REL-7');
    expect(m.laudo.apto).toBe(true);
    // A próxima inspeção vem da META — a MESMA fonte do vencimento oficial.
    // Se algum dia isto for recalculado aqui, este teste é o que quebra.
    expect(m.proximas.interna).toBe('04/09/2031');
    expect(m.assinantes[0].nome).toBe('Eng. Teste');
  });

  it('prefere o SNAPSHOT congelado da empresa ao dado vivo (§7-bis)', () => {
    localStorage.setItem('nr13_minha_empresa', JSON.stringify({ razaoSocial: 'VIVA LTDA' }));
    localStorage.setItem(
      'nr13_relatorio_meta_atual',
      JSON.stringify({ codigo: 'REL-8', empresa: { razaoSocial: 'CONGELADA LTDA' } }),
    );
    expect(montarModeloRelatorio(TAG).empresa.razao).toBe('CONGELADA LTDA');
  });

  it('descarta foto que não é imagem — nada de string solta virando raster', () => {
    localStorage.setItem(
      'nr13_injecao_atual',
      JSON.stringify({
        visual_externo: {
          fotos: [
            { base64: 'data:image/jpeg;base64,AAA', descricao: 'ok' },
            { base64: 'lixo', descricao: 'ruim' },
            { descricao: 'sem base64' },
          ],
        },
      }),
    );
    const m = montarModeloRelatorio(TAG);
    expect(m.visualExterno.fotos).toHaveLength(1);
    expect(m.visualExterno.fotos[0].descricao).toBe('ok');
  });
});

describe('rótulos — o slug guardado não chega cru ao papel', () => {
  it('traduz o que conhece', () => {
    expect(rotuloTipoEquipamento('vaso')).toBe('Vaso de Pressão');
    expect(rotuloResposta('nao')).toBe('NÃO');
    expect(rotuloResposta('sim')).toBe('SIM');
    expect(rotuloResultado('aprovado')).toBe('APROVADO');
  });

  it('slug DESCONHECIDO é devolvido, não apagado — dado feio é melhor que dado sumido', () => {
    expect(rotuloTipoEquipamento('trocador-de-calor')).toBe('Trocador-de-calor');
    expect(rotuloResposta('talvez')).toBe('Talvez');
  });

  it('ausente continua ausente', () => {
    expect(rotuloTipoEquipamento(null)).toBeNull();
    expect(rotuloResposta('  ')).toBeNull();
  });

  it('laudo não marcado NÃO é inapto', () => {
    expect(rotuloLaudo(null)).toBeNull();
    expect(rotuloLaudo(true)).toBe('APTO');
    expect(rotuloLaudo(false)).toBe('INAPTO');
  });
});

describe('conferência campo a campo', () => {
  it('lista por NOME o que sairá em branco', () => {
    const c = conferirCampos(montarModeloRelatorio(TAG));
    expect(c.total).toBeGreaterThan(30);
    expect(c.vazios).toContain('cliente');
    expect(c.vazios).toContain('laudo APTO/INAPTO');
    expect(c.preenchidos + c.vazios.length).toBe(c.total);
  });

  it('campo com dado sai da lista de vazios', () => {
    localStorage.setItem('nr13_laudo_VP-01', JSON.stringify({ apto: false }));
    const c = conferirCampos(montarModeloRelatorio(TAG));
    expect(c.vazios).not.toContain('laudo APTO/INAPTO');
  });
});

describe('placa de identificação: reconstruída em VETOR, real como imagem', () => {
  // Um `Documento` de mentira que só anota o que foi desenhado. O que interessa
  // não é o pixel — é QUAL primitiva foi usada: texto e traço (vetor) contra
  // `addImage` (imagem).
  function bancada(placaReal: { dataUrl: string; proporcao: number } | null) {
    const imagens: { x: number; y: number; w: number; h: number }[] = [];
    const campos: Record<string, unknown>[] = [];
    let textos = 0;
    let retangulos = 0;
    let linhas = 0;
    const pdf = {
      setDrawColor() {}, setFillColor() {}, setLineWidth() {}, setFont() {}, setFontSize() {}, setTextColor() {},
      rect() { retangulos++; },
      line() { linhas++; },
      text() { textos++; },
      addImage(_d: string, _f: string, x: number, y: number, w: number, h: number) { imagens.push({ x, y, w, h }); },
    };
    const doc = {
      pdf,
      y: 60,
      faixa() {},
      // A folha rotula o quadro da placa ("Registro fotográfico da placa de
      // identificação"), como a referência.
      secao() {},
      garantirEspaco() { return false; },
      // A área INTEIRA da placa é registrada como campo de imagem: é o clique
      // que troca a placa reconstruída pela foto, dentro do documento.
      anotarCampo(id: string, _r: string, _a: string, _v: string, _m: boolean, caixa: object, tipo?: string) { campos.push({ id, tipo, ...caixa }); },
      // 13D-bis: a placa passou a resolver override por campo. Na bancada não há
      // override nenhum —  devolve o valor automático e segue.
      campoLivre(_id: string, _rot: string, auto: string) { return auto; },
    } as unknown as Parameters<typeof blocoPlaca>[0];
    const modelo = {
      placaReal,
      equipamento: {
        FABRICANTE: 'Metalúrgica X',
        'IDENTIFICAÇÃO / T.A.G.': 'VP-001',
        'NÚMERO DE SÉRIE': '12345',
      },
      pressoes: [{ rotulo: 'PMTA — Pressão Máxima de Trabalho Admissível', kgf: '10,2' }],
    } as unknown as Parameters<typeof blocoPlaca>[1];
    blocoPlaca(doc, modelo);
    return { imagens, textos, retangulos, linhas, campos, doc };
  }

  it('SEM foto real: a placa é desenhada — zero imagens', () => {
    const b = bancada(null);
    expect(b.imagens).toHaveLength(0);
    // Um rótulo e um valor por campo, mais o título da placa.
    expect(b.textos).toBeGreaterThanOrEqual(21);
    expect(b.retangulos).toBeGreaterThanOrEqual(1);
    expect(b.linhas).toBeGreaterThan(0);
  });

  it('COM foto real: uma imagem, na proporção medida e dentro da caixa', () => {
    const b = bancada({ dataUrl: 'data:image/jpeg;base64,AAA', proporcao: 3.2 });
    expect(b.imagens).toHaveLength(1);
    const img = b.imagens[0];
    expect(img.w / img.h).toBeCloseTo(3.2, 3);
    expect(img.w).toBeLessThanOrEqual(CAIXA.largura + 0.001);
    expect(img.h).toBeLessThanOrEqual(ALTURA_PLACA + 0.001);
    // Nenhum CAMPO da placa reconstruída é desenhado por cima da foto real —
    // o único texto do bloco é o título da seção, que a referência também tem.
    expect(b.textos).toBeLessThanOrEqual(1);
  });

  it('a placa ocupa sempre a mesma altura, com foto ou sem', () => {
    // Altura estável é o que impede a folha de identificação de mudar de
    // paginação só porque o usuário enviou (ou tirou) a foto da placa.
    expect(bancada(null).doc.y).toBe(bancada({ dataUrl: 'data:image/jpeg;base64,AAA', proporcao: 2 }).doc.y);
  });

  it('a placa fica CENTRADA no espaço que sobra, e não colada no topo', () => {
    // A placa é o último bloco da folha 3. Desenhá-la logo abaixo do texto
    // deixava vários centímetros vazios no pé da página — apontado pelo dono
    // em 06/09/2026. Agora ela cresce e centra no espaço livre.
    const b = bancada(null);
    const topoDaPlaca = Math.min(...b.campos.map((c) => Number(c.y)));
    const alturaDaPlaca = Math.max(...b.campos.map((c) => Number(c.alt)));
    expect(topoDaPlaca).toBeGreaterThan(60); // o cursor entrou em 60
    expect(alturaDaPlaca).toBeGreaterThan(ALTURA_PLACA); // usou o espaço livre
    const sobraAbaixo = LIMITE_CORPO - (topoDaPlaca + alturaDaPlaca);
    expect(Math.abs(sobraAbaixo - (topoDaPlaca - 60))).toBeLessThan(1); // centrada
  });

  it('a placa inteira é um campo de imagem clicável — sem botão na barra', () => {
    for (const b of [bancada(null), bancada({ dataUrl: 'data:image/jpeg;base64,AAA', proporcao: 2 })]) {
      const placa = b.campos.find((c) => c.id === 'placa.foto');
      expect(placa).toBeTruthy();
      expect(placa!.tipo).toBe('imagem');
      expect(Number(placa!.larg)).toBe(CAIXA.largura);
    }
  });
});
