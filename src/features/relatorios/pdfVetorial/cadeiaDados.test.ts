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

import { montarModeloRelatorio } from './modelo';
import { calcularCategoriaNR13 } from '../../../calc/categoria';
import type { CategoriaSalva, EmpresaEquipamento, FotoEquipamento, InfoEquipamento } from '../../equipamento/tipos';
import type { Rastreabilidade } from '../rastreabilidadeService';

/**
 * 06/09/2026 · O GATE **FONTE → RELATÓRIO**, campo a campo.
 *
 * ## O defeito que ele conserta
 *
 * `storageParaModelo.test.ts` provou a ideia — gravar dado real e exigir que
 * ele chegue ao modelo — mas cobria três famílias (categoria, PMTA/PTH,
 * conversões). Fora delas o sistema seguia com **leitores de chave errada**, e
 * um leitor errado é indistinguível de "o usuário não preencheu": o campo chega
 * `null`, a folha imprime travessão e nada acusa.
 *
 * Auditado em 06/09/2026 e provado aqui, um teste por defeito:
 *
 * | fonte | como o sistema grava | como o modelo lia | consequência |
 * |---|---|---|---|
 * | `nr13_fotos_<TAG>` | **lista** de `{src, ref, isCapa}` | objeto `{capa, fotos[].base64}` | foto de capa NUNCA saía |
 * | `nr13_info_.pmtaAdotadaMpa` | pressão da DOCUMENTAÇÃO, vence a calculada | ignorada | PMTA/PTH em branco sem memorial |
 * | `nr13_vaso_.componentes[].tipo` | `cilindrico` / `eliptico` | procurava `casco` / `tampo` | material, margem de corrosão e temperatura em branco |
 * | `nr13_rastreab_<id>` | certificado do PADRÃO, por tipo | lia `ultrassom.instrumento` do container | bloco "INSTRUMENTO DE MEDIÇÃO UTILIZADO" em branco |
 *
 * ## A regra que este arquivo executa
 *
 * **Fonte com valor e modelo vazio é FALHA.** Não é pendência do usuário, não é
 * "campo opcional": é o loader perdendo dado. Um campo que o sistema não coleta
 * em lugar nenhum não entra aqui — entra em `previaEditavel`, como campo
 * manual.
 */

const TAG = 'ZZ-REL-E2E';

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

/** A ficha, exatamente como `DadosEquipamento` + `PressoesDocumentacao` gravam. */
const INFO: InfoEquipamento = {
  tag: TAG,
  tipo: 'vaso',
  subtipo: '',
  descricao: 'DESCRICAO-E2E',
  fabricante: 'FABRICANTE-E2E-2026',
  ano: '2024',
  numeroSerie: 'SERIE-E2E-987654',
  codigoProjeto: 'PROJ-E2E-ASME',
  edicao: '2021',
  adenda: 'ADENDA-E2E',
  localizacao: 'SETOR-E2E',
  tipoConstrucao: 'CONSTRUCAO-E2E',
  descricaoResumida: 'RESUMIDA-E2E',
};

const CATEGORIA: CategoriaSalva = {
  classe: 'A',
  grupo: 4,
  PV_cat: '1.0000',
  PV_enq: '1000.0000',
  isEnquadrado: true,
  catFinal: 'III',
  volInput: 1.25,
  presInput: 1,
  unidInput: 'SI',
  fluidoInput: 'A - Fluido inflamável, combustível (T ≥ 200 °C)',
};

const CLIENTE: EmpresaEquipamento = {
  razaoSocial: 'CLIENTE-E2E LTDA',
  cnpj: '00.000.000/0001-00',
  endereco: 'RUA-E2E, 100',
  bairro: 'BAIRRO-E2E',
  cidade: 'CIDADE-E2E',
  estado: 'SP',
};

/** O memorial do vaso, com os TIPOS que `MemorialVaso` realmente grava. */
const VASO = {
  tag: TAG,
  P: 1.0,
  D: 1000,
  componentes: [
    { id: 'tampo1', nome: 'Tampo Inferior', tipo: 'eliptico', dados: { mat: 'MATERIAL-TAMPO1-E2E', ca: '3', temp: '150', t_comercial: '8' } },
    { id: 'casco', nome: 'Casco Cilíndrico', tipo: 'cilindrico', dados: { mat: 'MATERIAL-CASCO-E2E', ca: '1,6', temp: '120', t_comercial: '9,5' } },
    { id: 'tampo2', nome: 'Tampo Superior', tipo: 'eliptico', dados: { mat: 'MATERIAL-TAMPO2-E2E', ca: '3', temp: '150', t_comercial: '8' } },
  ],
};

function fichaCompleta() {
  gravar(`nr13_info_${TAG}`, INFO);
  gravar(`nr13_cat_${TAG}`, CATEGORIA);
  gravar(`nr13_emp_${TAG}`, CLIENTE);
  gravar(`nr13_vaso_${TAG}`, VASO);
  gravar(`nr13_calc_${TAG}`, { pmta: '1.25', pth: '1.63', memorialHTML: '' });
}

beforeEach(() => localStorage.clear());

// ── 1 · FOTO DE CAPA ────────────────────────────────────────────────────────
describe('foto de capa: `nr13_fotos_<TAG>` é uma LISTA, não um objeto', () => {
  const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';

  it('a foto marcada como capa chega ao documento (legado, base64 em `src`)', () => {
    const fotos: FotoEquipamento[] = [
      { id: 1, src: 'data:image/png;base64,OUTRA=', isCapa: false },
      { id: 2, src: PIXEL, isCapa: true },
    ];
    gravar(`nr13_fotos_${TAG}`, fotos);
    expect(montarModeloRelatorio(TAG).fotoCapa).toBe(PIXEL);
  });

  it('sem `isCapa`, vale a PRIMEIRA foto — é o que a ficha mostra', () => {
    gravar(`nr13_fotos_${TAG}`, [{ id: 1, src: PIXEL, isCapa: false }]);
    expect(montarModeloRelatorio(TAG).fotoCapa).toBe(PIXEL);
  });

  it('foto NOVA mora no cofre: a referência viaja no modelo para o gerador baixar', () => {
    // Desde 10/08/2026 toda foto nasce `{ ref }` e `src` vem vazio. Exigir
    // base64 aqui — o que o modelo fazia — descarta a foto de capa de todo
    // equipamento cadastrado depois dessa data.
    const ref = { bucket: 'inspecao', path: 'org/fotos/abc.jpg' };
    gravar(`nr13_fotos_${TAG}`, [{ id: 1, src: '', ref, isCapa: true }]);
    const m = montarModeloRelatorio(TAG);
    expect(m.fotoCapaRef).toEqual(ref);
  });

  it('sem foto nenhuma, capa é AUSÊNCIA — e não quebra', () => {
    const m = montarModeloRelatorio(TAG);
    expect(m.fotoCapa).toBeNull();
    expect(m.fotoCapaRef).toBeNull();
  });
});

// ── 2 · PRESSÕES ADOTADAS DA DOCUMENTAÇÃO ───────────────────────────────────
const pressao = (m: ReturnType<typeof montarModeloRelatorio>, inicio: string) =>
  m.pressoes.find((p) => p.rotulo.startsWith(inicio))!;

describe('pressões: a ADOTADA da documentação vence a calculada', () => {
  it('PMTA adotada na ficha é a que o documento imprime', () => {
    // `PLACA.html:555` e `PRONTUARIO.html:711` sempre preferiram a adotada.
    // O vetorial lia só `nr13_calc_`, e um equipamento sem memorial (PMTA vinda
    // da placa do fabricante) saía com PMTA/PTH em branco no documento inteiro.
    gravar(`nr13_info_${TAG}`, { ...INFO, pmtaAdotadaMpa: '0.8', pthAdotadaMpa: '1.04' });
    gravar(`nr13_calc_${TAG}`, { pmta: '1.25', pth: '1.63', memorialHTML: '' });
    const m = montarModeloRelatorio(TAG);
    expect(pressao(m, 'PMTA').mpa).toBe('0.800');
    expect(pressao(m, 'PTH').mpa).toBe('1.040');
  });

  it('sem memorial nenhum, a adotada sozinha já preenche o documento', () => {
    gravar(`nr13_info_${TAG}`, { ...INFO, pmtaAdotadaMpa: '0.8', pthAdotadaMpa: '1.04', pmoAdotadaMpa: '0.6' });
    const m = montarModeloRelatorio(TAG);
    expect(pressao(m, 'PMTA').kgf).toBe('8.16');
    expect(pressao(m, 'PTH').kgf).toBe('10.61');
    expect(pressao(m, 'PMO').kgf).toBe('6.12');
    // A PLACA reconstruída lê das MESMAS pressões — tabela e placa não podem divergir.
    expect(m.categorizacaoFolha.pmta).toBe('8.16 kgf/cm²');
  });

  it('sem adotada, a calculada continua valendo (nenhuma regressão)', () => {
    gravar(`nr13_info_${TAG}`, INFO);
    gravar(`nr13_calc_${TAG}`, { pmta: '1.25', pth: '1.63', memorialHTML: '' });
    expect(pressao(montarModeloRelatorio(TAG), 'PMTA').mpa).toBe('1.250');
  });

  it('PTH NÃO é derivada de PMTA aqui — o fator é do motor do memorial', () => {
    // Vaso usa 1,3 e caldeira 1,5 (§3 do CLAUDE.md). Multiplicar aqui criaria
    // uma segunda verdade, e ela estaria errada para caldeira.
    gravar(`nr13_info_${TAG}`, { ...INFO, pmtaAdotadaMpa: '0.8' });
    expect(pressao(montarModeloRelatorio(TAG), 'PTH').mpa).toBeNull();
  });
});

// ── 3 · DADOS CONSTRUTIVOS (folha 5) ────────────────────────────────────────
describe('dados técnicos: o casco e os tampos do memorial', () => {
  it('material, margem de corrosão e temperatura saem do COMPONENTE certo', () => {
    // `TipoComponenteVaso` é `cilindrico | esferico | eliptico | toroesferico |
    // plano | planoAparafusado | cone`. O modelo procurava `casco`/`costado` e
    // `tipo.includes('tampo')` — nomes que o sistema nunca gravou.
    fichaCompleta();
    const p = montarModeloRelatorio(TAG).prontuario;
    expect(p.materialCorpo).toBe('MATERIAL-CASCO-E2E');
    expect(p.margemCorrosao).toBe('1,6');
    expect(p.temperaturaProjeto).toBe('120');
    expect(p.materialTampo1).toBe('MATERIAL-TAMPO1-E2E');
    expect(p.materialTampo2).toBe('MATERIAL-TAMPO2-E2E');
  });

  it('pressão de projeto, contratante, endereço e construção também chegam', () => {
    fichaCompleta();
    const p = montarModeloRelatorio(TAG).prontuario;
    expect(p.pressaoProjeto).toBe('1.000 MPa');
    expect(p.contratante).toBe('CLIENTE-E2E LTDA');
    expect(p.endereco).toBe('RUA-E2E, 100, BAIRRO-E2E, CIDADE-E2E, SP');
    expect(p.tipoConstrucao).toBe('CONSTRUCAO-E2E');
    expect(p.descricaoResumida).toBe('RESUMIDA-E2E');
    expect(p.volume).toBe('1,25');
  });

  it('AUTOCLAVE guarda o memorial em `nr13_vaso_ac_corpo_<TAG>` — e a folha não fica vazia', () => {
    gravar(`nr13_info_${TAG}`, { ...INFO, tipo: 'autoclave' });
    gravar(`nr13_vaso_ac_corpo_${TAG}`, VASO);
    expect(montarModeloRelatorio(TAG).prontuario.materialCorpo).toBe('MATERIAL-CASCO-E2E');
  });

  it('CALDEIRA guarda em `nr13_vaso_cald_<TAG>` — idem', () => {
    gravar(`nr13_info_${TAG}`, { ...INFO, tipo: 'caldeira' });
    gravar(`nr13_vaso_cald_${TAG}`, { ...VASO, componentes: [{ id: 'costado', nome: 'Costado', tipo: 'cilindrico', dados: { mat: 'ASTM-A516-E2E', ca: '2', temp: '200' } }] });
    expect(montarModeloRelatorio(TAG).prontuario.materialCorpo).toBe('ASTM-A516-E2E');
  });
});

// ── 4 · IDENTIFICAÇÃO E CLIENTE ─────────────────────────────────────────────
describe('identificação: a ficha inteira chega à folha 3', () => {
  it('todos os campos sentinela aparecem', () => {
    fichaCompleta();
    const e = montarModeloRelatorio(TAG).equipamento;
    expect(e['IDENTIFICAÇÃO / T.A.G.']).toBe(TAG);
    expect(e['FABRICANTE']).toBe('FABRICANTE-E2E-2026');
    expect(e['NÚMERO DE SÉRIE']).toBe('SERIE-E2E-987654');
    expect(e['ANO DE FABRICAÇÃO']).toBe('2024');
    expect(e['CÓDIGO DE PROJETO']).toBe('PROJ-E2E-ASME');
    expect(e['LOCAL DA INSTALAÇÃO']).toBe('SETOR-E2E');
    expect(e['TIPO DE EQUIPAMENTO']).toBe('Vaso de Pressão');
    expect(e['FLUIDO DE OPERAÇÃO']).toBe('Fluido inflamável, combustível (T ≥ 200 °C)');
    expect(e['CLASSE DO FLUIDO']).toBe('Classe A');
    expect(e['VOLUME (m³)']).toBe('1,25');
    expect(e['GRUPO DE RISCO']).toBe('4');
    expect(e['CATEGORIA DO VASO']).toBe('III');
  });

  it('cliente e endereço saem de `nr13_emp_<TAG>`', () => {
    fichaCompleta();
    const m = montarModeloRelatorio(TAG);
    expect(m.cliente).toBe('CLIENTE-E2E LTDA');
    expect(m.clienteEndereco).toBe('RUA-E2E, 100, CIDADE-E2E, SP');
  });
});

// ── 5 · CATEGORIZAÇÃO: TELA = MOTOR = PDF ───────────────────────────────────
describe('categorização: os três precisam concordar', () => {
  it('o que o MOTOR calcula é o que o documento imprime', () => {
    // Nada é recalculado no gerador; o que se prova aqui é que ler o
    // persistido devolve exatamente o resultado do motor oficial.
    const r = calcularCategoriaNR13(1.25, 1, 'A - Fluido inflamável, combustível (T ≥ 200 °C)');
    gravar(`nr13_cat_${TAG}`, {
      classe: r.classe,
      grupo: r.grupo,
      PV_cat: r.pvCat.toFixed(4),
      PV_enq: r.pvEnq.toFixed(4),
      isEnquadrado: r.isEnquadrado,
      catFinal: r.catFinal,
      volInput: 1.25,
      presInput: 1,
      unidInput: 'SI',
      fluidoInput: 'A - Fluido inflamável, combustível (T ≥ 200 °C)',
    });
    const m = montarModeloRelatorio(TAG);
    expect(m.categoria.catFinal).toBe(r.catFinal);
    expect(m.categoria.grupo).toBe(String(r.grupo));
    expect(m.equipamento['CLASSE DO FLUIDO']).toBe(`Classe ${r.classe}`);
    expect(m.categorizacaoDetalhe.pvKpa).not.toBeNull();
    expect(m.categorizacaoDetalhe.pvMpa).not.toBeNull();
    expect(m.categorizacaoDetalhe.resultadoEnquadramento).toBe(
      r.isEnquadrado ? 'Enquadrado na NR-13' : 'Não enquadrado',
    );
  });

  it('a tabela e a PLACA reconstruída leem o MESMO campo', () => {
    fichaCompleta();
    const m = montarModeloRelatorio(TAG);
    expect(m.categorizacaoFolha.volumeGeometrico).toBe(m.equipamento['VOLUME (m³)']);
    expect(m.categorizacaoFolha.fluidoTrabalho).toBe(m.equipamento['FLUIDO DE OPERAÇÃO']);
    expect(m.categorizacaoFolha.codigoProjeto).toBe(m.equipamento['CÓDIGO DE PROJETO']);
  });
});

// ── 6 · INSPEÇÃO SELECIONADA ────────────────────────────────────────────────
const CHECKLIST = {
  dataInspecao: '2026-09-07',
  inspetor: 'INSPETOR-E2E',
  respostas: { '1': 'sim' },
  observacoes: { '1': 'OBS-ITEM-E2E' },
  instrumentos: {},
  fotosDocumentacao: [],
  fotos: [],
  comentariosDocumentacao: 'COMENTARIO-DOC-E2E',
};

const VISUAL_EXTERNO = {
  serie: 'SERIE-VE-E2E',
  itens: { '1': 'nao' },
  itemObs: { '1': 'OBS-VE-E2E' },
  observacoes: 'OBSERVACOES-VE-E2E',
  conclusao: 'CONCLUSAO-VE-E2E',
  resultado: 'aprovado',
  fotos: [],
};

function comInspecao() {
  gravar('nr13_inspecao_atual', { checklist: CHECKLIST });
  gravar('nr13_injecao_atual', { checklist: CHECKLIST, visual_externo: VISUAL_EXTERNO });
}

describe('inspeção: o que o técnico digitou em campo chega ao documento', () => {
  it('comentários da documentação e observações do exame NÃO se perdem', () => {
    fichaCompleta();
    comInspecao();
    const m = montarModeloRelatorio(TAG);
    expect(m.comentariosDocumentacao).toBe('COMENTARIO-DOC-E2E');
    expect(m.visualExterno.observacoes).toBe('OBSERVACOES-VE-E2E');
    expect(m.visualExterno.conclusao).toBe('CONCLUSAO-VE-E2E');
    expect(m.visualExterno.serie).toBe('SERIE-VE-E2E');
  });

  it('a data da inspeção sai em pt-BR, como o resto do documento', () => {
    // `<input type="date">` grava ISO. Imprimir `2026-09-07` num documento em
    // português é o mesmo defeito que já foi corrigido nos ensaios.
    comInspecao();
    expect(montarModeloRelatorio(TAG).dadosInspecao.dataInicio).toBe('07/09/2026');
  });

  it('a pergunta do exame aparece por extenso, e a observação junto', () => {
    comInspecao();
    const item = montarModeloRelatorio(TAG).visualExterno.itens[0];
    expect(item.titulo.length).toBeGreaterThan(5);
    expect(item.observacao).toBe('OBS-VE-E2E');
  });
});

describe('isolamento: só a inspeção SELECIONADA entra', () => {
  it('trocar o container troca o conteúdo do documento — nada da outra sobra', () => {
    fichaCompleta();
    gravar('nr13_injecao_atual', { visual_externo: { ...VISUAL_EXTERNO, conclusao: 'INSPECAO-A' } });
    expect(montarModeloRelatorio(TAG).visualExterno.conclusao).toBe('INSPECAO-A');
    gravar('nr13_injecao_atual', { visual_externo: { ...VISUAL_EXTERNO, conclusao: 'INSPECAO-B' } });
    expect(montarModeloRelatorio(TAG).visualExterno.conclusao).toBe('INSPECAO-B');
    // Relatório sem container: as chaves são REGRAVADAS vazias, e o documento
    // não pode continuar exibindo a inspeção anterior.
    gravar('nr13_injecao_atual', {});
    gravar('nr13_inspecao_atual', {});
    expect(montarModeloRelatorio(TAG).visualExterno.conclusao).toBeNull();
    expect(montarModeloRelatorio(TAG).comentariosDocumentacao).toBeNull();
  });

  it('o documento é de UMA TAG: as chaves da outra não vazam', () => {
    fichaCompleta();
    gravar('nr13_info_ZZ-OUTRO', { ...INFO, tag: 'ZZ-OUTRO', fabricante: 'FABRICANTE-DO-OUTRO' });
    expect(montarModeloRelatorio(TAG).equipamento['FABRICANTE']).toBe('FABRICANTE-E2E-2026');
    expect(montarModeloRelatorio('ZZ-OUTRO').equipamento['FABRICANTE']).toBe('FABRICANTE-DO-OUTRO');
  });
});

// ── 7 · ULTRASSOM ───────────────────────────────────────────────────────────
describe('ultrassom: pontos, ângulos e instrumento', () => {
  const US = {
    equipamento: 'EQUIP-US-E2E',
    dataUltrassom: '2026-09-07',
    area: 'AREA-US-E2E',
    espNomCasco: '9,5',
    material: 'MATERIAL-US-E2E',
    aparelho: 'APARELHO-US-E2E',
    acoplante: 'ACOPLANTE-E2E',
    tempSup: 'Ambiente',
    estadoSup: 'ESTADO-E2E',
    cabecote: '2.25 mhz',
    velSonica: '5920',
    resultado: 'aprovado',
    pontos: [
      { id: 'c1', rotulo: 'Casco 1', regiao: 'casco' },
      { id: 'c2', rotulo: 'Casco 2', regiao: 'casco' },
    ],
    colunas: { ts: 4, casco: 4, ti: 4 },
    medidas: {
      c1: { '0': '9,1', '90': '9,2', '180': '9,3', '270': '9,4' },
      c2: { '0': '8,1', '90': '8,2', '180': '8,3', '270': '8,4' },
    },
  };

  it('cada ponto sai com o seu ângulo e o seu valor', () => {
    gravar('nr13_injecao_atual', { ultrassom: US });
    const p = montarModeloRelatorio(TAG).ultrassom.pontos;
    expect(p).toHaveLength(2);
    expect(p[0].ponto).toBe('Casco 1');
    expect(p[0].angulos).toEqual(['0', '90', '180', '270']);
    expect(p[0].medidas).toEqual(['9,1', '9,2', '9,3', '9,4']);
    expect(p[0].menor).toBe('9,1');
    expect(p[1].medidas).toEqual(['8,1', '8,2', '8,3', '8,4']);
  });

  it('os dados do ensaio vêm do formulário de campo', () => {
    gravar(`nr13_info_${TAG}`, INFO);
    gravar('nr13_injecao_atual', { ultrassom: US });
    const u = montarModeloRelatorio(TAG).ultrassom;
    expect(u.equipamento).toBe('EQUIP-US-E2E');
    expect(u.area).toBe('AREA-US-E2E');
    expect(u.material).toBe('MATERIAL-US-E2E');
    expect(u.aparelho).toBe('APARELHO-US-E2E');
    expect(u.data).toBe('07/09/2026');
    expect(u.serie).toBe('SERIE-E2E-987654');
  });

  it('INSTRUMENTO DE MEDIÇÃO UTILIZADO sai de `nr13_rastreab_`, não do container', () => {
    // A folha `ULTRASSOM.html:807` sempre leu o cadastro de Certificados. O
    // modelo lia `ultrassom.instrumento`, campo que formulário nenhum grava —
    // o bloco saía com quatro travessões em todo relatório vetorial.
    const padrao: Partial<Rastreabilidade> = {
      id: 'r1',
      nome: 'PADRAO-US-E2E',
      aparelho: 'CYGNUS 6278',
      numeroSerie: 'SERIE-PADRAO-US',
      certificadoPadrao: 'CERT-US-2026',
      validade: '2027-05-30',
      tipoInstrumento: 'ultrassom',
      injetarNoRelatorio: true,
      criadoEm: '01/01/2026',
      pdfBase64: '',
    };
    gravar('nr13_rastreab_r1', padrao);
    gravar('nr13_injecao_atual', { ultrassom: US });
    const i = montarModeloRelatorio(TAG).ultrassom.instrumento;
    expect(i.padrao).toBe('PADRAO-US-E2E');
    expect(i.serie).toBe('SERIE-PADRAO-US');
    expect(i.certificado).toBe('CERT-US-2026');
    expect(i.validade).toBe('30/05/2027');
  });

  it('padrão SUBSTITUÍDO não preenche folha nova', () => {
    gravar('nr13_rastreab_r1', {
      id: 'r1', nome: 'ANTIGO', certificadoPadrao: 'X', validade: '', tipoInstrumento: 'ultrassom',
      injetarNoRelatorio: true, criadoEm: '01/01/2026', pdfBase64: '', substituidoEm: '02/02/2026',
    });
    expect(montarModeloRelatorio(TAG).ultrassom.instrumento.padrao).toBeNull();
  });
});

// ── 8 · TESTE HIDROSTÁTICO ──────────────────────────────────────────────────
describe('teste hidrostático', () => {
  const TH = {
    cliente: 'CLIENTE-TH-E2E',
    docNum: 'DOC-TH-E2E',
    equipamento: 'EQUIP-TH-E2E',
    dataTeste: '2026-09-07',
    pressaoProj: '12,75',
    pressaoTeste: '16,60',
    fluido: 'Água Potável',
    resultado: 'aprovado',
    curva: [{ tempo: '0', pressao: '0' }, { tempo: '10', pressao: '16,6' }],
    fotos: [],
  };

  it('o que o formulário coleta chega inteiro', () => {
    gravar('nr13_injecao_atual', { th: TH });
    const t = montarModeloRelatorio(TAG).th;
    expect(t.cliente).toBe('CLIENTE-TH-E2E');
    expect(t.docNumero).toBe('DOC-TH-E2E');
    expect(t.equipamento).toBe('EQUIP-TH-E2E');
    expect(t.dataTeste).toBe('07/09/2026');
    expect(t.pressaoProjeto).toBe('12,75');
    expect(t.pressaoTeste).toBe('16,60');
    expect(t.fluido).toBe('Água Potável');
    expect(t.resultado).toBe('APROVADO');
    expect(t.curva).toHaveLength(2);
  });

  it('o manômetro PADRÃO sai do cadastro de Certificados', () => {
    gravar('nr13_rastreab_r2', {
      id: 'r2', nome: 'PADRAO-MANOMETRO-E2E', numeroSerie: 'SERIE-PADRAO-MAN',
      certificadoPadrao: 'CERT-MAN-2026', validade: '2027-08-15', tipoInstrumento: 'manometro',
      injetarNoRelatorio: true, criadoEm: '01/01/2026', pdfBase64: '',
    });
    gravar('nr13_injecao_atual', { th: TH });
    const i = montarModeloRelatorio(TAG).th.instrumento;
    expect(i.padrao).toBe('PADRAO-MANOMETRO-E2E');
    expect(i.serie).toBe('SERIE-PADRAO-MAN');
    expect(i.certificado).toBe('CERT-MAN-2026');
    expect(i.validade).toBe('15/08/2027');
  });

  it('padrão de OUTRO tipo não vaza para o bloco errado', () => {
    gravar('nr13_rastreab_r1', {
      id: 'r1', nome: 'SO-ULTRASSOM', certificadoPadrao: 'C', validade: '', tipoInstrumento: 'ultrassom',
      injetarNoRelatorio: true, criadoEm: '01/01/2026', pdfBase64: '',
    });
    gravar('nr13_injecao_atual', { th: TH, ultrassom: {} });
    expect(montarModeloRelatorio(TAG).th.instrumento.padrao).toBeNull();
  });
});

// ── 9 · A REGRA GERAL ───────────────────────────────────────────────────────
describe('nenhum campo em branco em silêncio', () => {
  it('com a ficha e a inspeção preenchidas, nada do documento fica vazio', () => {
    fichaCompleta();
    comInspecao();
    const m = montarModeloRelatorio(TAG);
    const vazios: string[] = [];
    for (const [nome, valor] of Object.entries(m.equipamento)) {
      if (valor === null || String(valor).trim() === '') vazios.push(nome);
    }
    for (const [nome, valor] of Object.entries(m.prontuario)) {
      if (valor === null || String(valor).trim() === '') vazios.push(`prontuario.${nome}`);
    }
    expect(vazios).toEqual([]);
  });
});

// ── 10 · OS CAMPOS QUE O FORMULÁRIO PASSOU A COLETAR (07/09/2026) ───────────
/**
 * O E2E de 07/09/2026 fechou com sete campos do TH e um do ultrassom saindo em
 * branco no documento — e a causa não era leitor errado, era **fonte
 * inexistente**: a folha imprimia campos que nenhum formulário coletava.
 *
 * Agora eles são do ensaio. Estes testes travam o par: o formulário grava com
 * ESTE nome, e o modelo lê deste nome. Trocar um sem o outro quebra aqui, e não
 * num documento assinado.
 */
describe('TH: os campos novos do formulário chegam ao documento', () => {
  const COMPLETO = {
    cliente: 'CLIENTE-TH-E2E',
    docNum: 'DOC-TH-E2E',
    equipamento: 'EQUIP-TH-E2E',
    dataTeste: '2026-09-07',
    pressaoProj: '12,75',
    pressaoTrabalho: '8,16',
    pressaoTeste: '16,60',
    fluido: 'Água Potável',
    duracao: '30 min',
    tempFluido: '22 °C',
    normas: 'ASME VIII Div.1 / NR-13',
    validadeLaudo: '07/09/2031',
    procedimento: 'PROCEDIMENTO-TH-E2E',
    parecer: 'PARECER-TH-E2E',
    resultado: 'aprovado',
    curva: [{ tempo: '0', pressao: '0' }],
    fotos: [],
  };

  it('os sete campos que faltavam saem preenchidos', () => {
    gravar('nr13_injecao_atual', { th: COMPLETO });
    const t = montarModeloRelatorio(TAG).th;
    expect(t.pressaoTrabalho).toBe('8,16');
    expect(t.duracao).toBe('30 min');
    expect(t.tempFluido).toBe('22 °C');
    expect(t.normas).toBe('ASME VIII Div.1 / NR-13');
    expect(t.validadeLaudo).toBe('07/09/2031');
    expect(t.procedimento).toBe('PROCEDIMENTO-TH-E2E');
    expect(t.parecer).toBe('PARECER-TH-E2E');
  });

  it('os campos que já chegavam continuam chegando', () => {
    gravar('nr13_injecao_atual', { th: COMPLETO });
    const t = montarModeloRelatorio(TAG).th;
    expect(t.cliente).toBe('CLIENTE-TH-E2E');
    expect(t.docNumero).toBe('DOC-TH-E2E');
    expect(t.pressaoTeste).toBe('16,60');
    expect(t.resultado).toBe('APROVADO');
  });

  it('ensaio ANTIGO (sem os campos novos) não quebra — sai vazio, como antes', () => {
    // Inspeção gravada antes desta rodada não tem as chaves novas. Ela precisa
    // continuar abrindo, com aqueles campos em branco para preenchimento manual.
    const antigo = { ...COMPLETO } as Record<string, unknown>;
    for (const k of ['pressaoTrabalho', 'duracao', 'tempFluido', 'normas', 'validadeLaudo', 'procedimento', 'parecer']) delete antigo[k];
    gravar('nr13_injecao_atual', { th: antigo });
    const t = montarModeloRelatorio(TAG).th;
    expect(t.pressaoTrabalho).toBeNull();
    expect(t.parecer).toBeNull();
    expect(t.cliente).toBe('CLIENTE-TH-E2E');
  });
});

describe('ultrassom: a observação do ensaio chega ao documento', () => {
  it('`observacoes` do formulário sai na folha', () => {
    gravar('nr13_injecao_atual', { ultrassom: { equipamento: 'EQ', observacoes: 'OBSERVACOES-US-E2E' } });
    expect(montarModeloRelatorio(TAG).ultrassom.observacoes).toBe('OBSERVACOES-US-E2E');
  });

  it('ensaio sem observação continua saindo vazio, não quebrado', () => {
    gravar('nr13_injecao_atual', { ultrassom: { equipamento: 'EQ' } });
    expect(montarModeloRelatorio(TAG).ultrassom.observacoes).toBeNull();
  });

  it('a fonte é a MESMA do ensaio — não há segunda chave paralela', () => {
    // Se algum dia a observação passar a morar noutro lugar, este teste é quem
    // avisa: o documento lê do container, e é lá que o formulário grava.
    gravar('nr13_injecao_atual', { ultrassom: { observacoes: 'DO-CONTAINER' } });
    gravar(`nr13_med_esp_${TAG}`, { observacoes: 'DE-OUTRO-LUGAR' });
    expect(montarModeloRelatorio(TAG).ultrassom.observacoes).toBe('DO-CONTAINER');
  });
});

describe('formulário e modelo usam o MESMO nome de campo', () => {
  it('TH: cada campo lido pelo modelo existe no tipo do formulário', () => {
    // Varredura de fonte: o par formulário↔modelo é o que quebrou antes, e ele
    // não aparece em nenhum teste de valor — os dois lados podem estar
    // internamente corretos e mesmo assim não se encontrarem.
    const form = readFileSync('src/features/inspecoes/formularios/FormularioTH.tsx', 'utf8');
    const bloco = form.slice(form.indexOf('interface DadosTH'), form.indexOf('function dadosPadrao'));
    for (const campo of ['pressaoTrabalho', 'duracao', 'tempFluido', 'normas', 'validadeLaudo', 'procedimento', 'parecer']) {
      expect(bloco).toContain(`${campo}:`);
    }
  });

  it('ultrassom: `observacoes` existe no tipo do formulário', () => {
    const form = readFileSync('src/features/inspecoes/formularios/FormularioUltrassom.tsx', 'utf8');
    const bloco = form.slice(form.indexOf('interface Dados'), form.indexOf('function linhaVazia'));
    expect(bloco).toContain('observacoes:');
  });
});
