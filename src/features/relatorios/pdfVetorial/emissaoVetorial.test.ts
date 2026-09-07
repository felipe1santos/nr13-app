import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { gerarRelatorioVetorial } from './gerarRelatorio';
import { zerarCacheFontes } from './carlito';
import type { CategoriaSalva, EmpresaEquipamento, InfoEquipamento } from '../../equipamento/tipos';

/**
 * 06/09/2026 · O GATE **PAPEL**: o documento é gerado DE VERDADE e o que o
 * usuário salvou tem que estar nele.
 *
 * ## Por que este segundo gate existe
 *
 * `cadeiaDados.test.ts` para no MODELO. Entre o modelo e o papel ainda há uma
 * camada onde dado se perde em silêncio — e ela perdeu quatro campos:
 * `blocoAteOFim` fixava o valor automático em `''`, então os comentários da
 * documentação, as observações dos dois exames visuais e as do ultrassom eram
 * desenhados como caixa em branco mesmo com o texto no modelo.
 *
 * Aqui o gerador roda inteiro — duas passagens, fonte embutida, tabelas,
 * fotos — e a asserção é sobre `editaveis`, que é o registro do que foi
 * REALMENTE escrito em cada posição do papel (id, rótulo, valor, página, mm).
 * É a mesma lista que a prévia usa para montar as áreas clicáveis: se um campo
 * chega aqui com o valor certo, ele está impresso ali.
 *
 * O PDF em si é medido pelos bytes: fonte embutida (`FontFile2` = texto
 * vetorial e selecionável, não fotografia da folha) e uma imagem por foto.
 */

const TAG = 'ZZ-REL-E2E';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

const INFO: InfoEquipamento = {
  tag: TAG,
  tipo: 'vaso',
  subtipo: '',
  descricao: 'DESCRICAO-E2E',
  fabricante: 'FABRICANTE-E2E-2026',
  ano: '2024',
  numeroSerie: 'SERIE-E2E-987654',
  codigoProjeto: 'PROJ-E2E-ASME',
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

const DOCUMENTOS = [
  'CAPA.html',
  'SUMARIO.html',
  'PLACA.html',
  'CLASSIFICACAO-RISCO.html',
  'PRONTUARIO.html',
  'RESUMO-MEMORIAL.html',
  'INSPECOES.html',
  'VERIFICACAO-DOCUMENTACAO.html',
  'VISUAL-EXTERNO.html',
  'VISUAL-EXTERNO-FOTOS.html',
  'VISUAL-INTERNO.html',
  'ULTRASSOM.html',
  'TESTE-HIDROSTATICO.html',
  'CONCLUSAO.html',
];

function montarStorage() {
  gravar(`nr13_info_${TAG}`, INFO);
  gravar(`nr13_cat_${TAG}`, CATEGORIA);
  gravar(`nr13_emp_${TAG}`, CLIENTE);
  gravar(`nr13_calc_${TAG}`, {
    pmta: '1.25',
    pth: '1.63',
    memorialHTML: '',
    componentes: [
      { nome: 'Casco Cilíndrico', pmtaMpa: 1.25, tReqMm: 6.2, tNom: 9.5, E: 0.85, S: 138, D: 1000, raio: null, ca: 1.6, material: 'MATERIAL-CASCO-E2E', formulaT: 't = P·R/(S·E−0,6·P)+CA', formulaP: 'P = S·E·t/(R+0,6·t)' },
    ],
  });
  gravar(`nr13_vaso_${TAG}`, {
    tag: TAG,
    P: 1.0,
    D: 1000,
    componentes: [
      { id: 'tampo1', nome: 'Tampo Inferior', tipo: 'eliptico', dados: { mat: 'MATERIAL-TAMPO1-E2E', ca: '3', temp: '150' } },
      { id: 'casco', nome: 'Casco Cilíndrico', tipo: 'cilindrico', dados: { mat: 'MATERIAL-CASCO-E2E', ca: '1,6', temp: '120' } },
      { id: 'tampo2', nome: 'Tampo Superior', tipo: 'eliptico', dados: { mat: 'MATERIAL-TAMPO2-E2E', ca: '3', temp: '150' } },
    ],
  });
  gravar(`nr13_fotos_${TAG}`, [{ id: 1, src: PIXEL, isCapa: true }]);
  gravar('nr13_minha_empresa', { razao: 'EXECUTANTE-E2E', endereco: 'AV-E2E, 1', cidade: 'CIDADE-EXEC', cnpj: '11.111.111/0001-11', telefone: '(11) 1111-1111' });
  gravar('nr13_rastreab_r1', {
    id: 'r1', nome: 'PADRAO-US-E2E', aparelho: 'CYGNUS 6278', numeroSerie: 'SERIE-PADRAO-US',
    certificadoPadrao: 'CERT-US-2026', validade: '2027-05-30', tipoInstrumento: 'ultrassom',
    injetarNoRelatorio: true, criadoEm: '01/01/2026', pdfBase64: '',
  });
  gravar('nr13_rastreab_r2', {
    id: 'r2', nome: 'PADRAO-MAN-E2E', numeroSerie: 'SERIE-PADRAO-MAN',
    certificadoPadrao: 'CERT-MAN-2026', validade: '2027-08-15', tipoInstrumento: 'manometro',
    injetarNoRelatorio: true, criadoEm: '01/01/2026', pdfBase64: '',
  });
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-E2E-0001',
    emissao: '07/09/2026',
    validade: '07/09/2027',
    execucaoInspecao: '07/09/2026',
    proximaInspecaoInterna: '07/09/2031',
    proximaInspecaoExterna: '07/09/2029',
    validadeValvula: '07/09/2027',
    tipoInspecao: 'inicial',
    phNome: 'ENGENHEIRO-E2E',
    phCrea: 'CREA-E2E-123',
    tecnicoNome: 'TECNICO-E2E',
    documentos: DOCUMENTOS,
  });
  gravar(`nr13_laudo_${TAG}`, { apto: true, relatorioCodigo: 'REL-E2E-0001', atualizadoEm: '2026-09-07' });

  const checklist = {
    dataInspecao: '2026-09-07',
    inspetor: 'INSPETOR-E2E',
    respostas: { '1': 'sim' },
    observacoes: { '1': 'OBS-ITEM-E2E' },
    instrumentos: {},
    fotosDocumentacao: [],
    fotos: [],
    comentariosDocumentacao: 'COMENTARIO-DOC-E2E',
  };
  const exame = (marca: string) => ({
    serie: `SERIE-${marca}-E2E`,
    itens: { '1': 'nao' },
    itemObs: { '1': `OBS-ITEM-${marca}` },
    observacoes: `OBSERVACOES-${marca}-E2E`,
    conclusao: `CONCLUSAO-${marca}-E2E`,
    resultado: 'aprovado',
    fotos: [{ base64: PIXEL, descricao: `FOTO-${marca}-E2E` }],
  });
  const dados = {
    checklist,
    visual_externo: exame('VE'),
    visual_interno: exame('VI'),
    ultrassom: {
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
      observacoes: 'OBSERVACOES-US-E2E',
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
    },
    th: {
      cliente: 'CLIENTE-TH-E2E',
      docNum: 'DOC-TH-E2E',
      equipamento: 'EQUIP-TH-E2E',
      dataTeste: '2026-09-07',
      pressaoProj: '12,75',
      pressaoTeste: '16,60',
      fluido: 'Água Potável',
      pressaoTrabalho: '8,16',
      duracao: '30 min',
      tempFluido: '22 °C',
      normas: 'ASME VIII Div.1 / NR-13',
      validadeLaudo: '07/09/2031',
      procedimento: 'PROCEDIMENTO-TH-E2E',
      parecer: 'PARECER-TH-E2E',
      resultado: 'aprovado',
      curva: [{ tempo: '0', pressao: '0' }, { tempo: '10', pressao: '16,6' }],
      fotos: [],
    },
  };
  gravar('nr13_inspecao_atual', dados);
  gravar('nr13_injecao_atual', dados);
}

/**
 * A fonte vem do disco: `registrarCarlito` a busca por `fetch('/fontes/…')`, e
 * ela FALHA ALTO de propósito — sem a fonte não há documento. Servir os mesmos
 * arquivos de `public/` é o que torna a medição verdadeira (o PDF carrega o TTF
 * real, e é isso que `FontFile2` prova).
 */
beforeAll(() => {
  zerarCacheFontes();
  vi.stubGlobal('fetch', async (url: string) => {
    const nome = String(url).replace(/^\//, '');
    const buf = readFileSync(resolve(process.cwd(), 'public', nome));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    };
  });
  // `medirFotos` decodifica cada imagem para saber a proporção real. Em node não
  // há `Image`; a proporção não é o que este gate mede.
  class ImagemFalsa {
    naturalWidth = 4;
    naturalHeight = 3;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImagemFalsa);
});

beforeEach(() => {
  localStorage.clear();
  montarStorage();
});

/** O que foi escrito num campo do papel — `null` quando o campo não existe. */
function campo(editaveis: { id: string; valor: string }[], id: string): string | null {
  const c = editaveis.find((e) => e.id === id);
  return c ? c.valor : null;
}

describe('emissão vetorial: o documento sai com o que o usuário salvou', () => {
  it('gera um PDF de verdade, com a fonte embutida', async () => {
    const r = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const cabecalho = new TextDecoder('latin1').decode(r.bytes.subarray(0, 8));
    expect(cabecalho.startsWith('%PDF-')).toBe(true);
    expect(r.paginas).toBeGreaterThan(8);

    const cru = new TextDecoder('latin1').decode(r.bytes);
    // FontFile2 = TrueType embutida. É a prova de que o texto é TEXTO (vetorial,
    // selecionável) e não uma fotografia da folha — o que o Modelo Clássico fazia.
    expect(cru).toContain('/FontFile2');
    // jsPDF embute como CIDFontType2 dentro de um Type0 — é a forma que suporta
    // acentuação. O que importa é que existe FONTE, e não imagem de página.
    expect(cru).toContain('/Type0');
  });

  it('imagem no PDF SÓ onde se espera foto — o resto é vetor', async () => {
    const r = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const cru = new TextDecoder('latin1').decode(r.bytes);
    const imagens = (cru.match(/\/Subtype\s*\/Image/g) ?? []).length;
    // 1 capa + 1 foto do exame externo + 1 do interno. Nenhuma folha inteira
    // rasterizada: se o gerador voltasse a fotografar páginas, este número
    // saltaria para a ordem de grandeza do total de páginas.
    expect(imagens).toBeGreaterThan(0);
    expect(imagens).toBeLessThan(r.paginas);
  });

  it('a ficha do equipamento está no papel', async () => {
    const { editaveis } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const valores = editaveis.map((e) => e.valor);
    expect(valores).toContain('FABRICANTE-E2E-2026');
    expect(valores).toContain('SERIE-E2E-987654');
    expect(valores).toContain('PROJ-E2E-ASME');
    expect(valores).toContain('SETOR-E2E');
    expect(valores).toContain('CLIENTE-E2E LTDA');
    expect(valores).toContain('MATERIAL-CASCO-E2E');
    expect(valores).toContain('MATERIAL-TAMPO1-E2E');
    expect(valores).toContain('MATERIAL-TAMPO2-E2E');
  });

  it('a inspeção de campo está no papel — inclusive os blocos de texto livre', async () => {
    const { editaveis } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    // Os quatro campos que `blocoAteOFim` descartava.
    expect(campo(editaveis, 'documentacao.comentarios')).toBe('COMENTARIO-DOC-E2E');
    expect(campo(editaveis, 'exameExterno.observacoes')).toBe('OBSERVACOES-VE-E2E');
    expect(campo(editaveis, 'exameInterno.observacoes')).toBe('OBSERVACOES-VI-E2E');
    // E as conclusões, que já chegavam.
    expect(campo(editaveis, 'exameExterno.conclusao')).toBe('CONCLUSAO-VE-E2E');
    expect(campo(editaveis, 'exameInterno.conclusao')).toBe('CONCLUSAO-VI-E2E');
  });

  it('o bloco do INSTRUMENTO PADRÃO sai preenchido nas duas folhas de ensaio', async () => {
    const { editaveis } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const valores = editaveis.map((e) => e.valor);
    expect(valores).toContain('PADRAO-US-E2E');
    expect(valores).toContain('CERT-US-2026');
    expect(valores).toContain('PADRAO-MAN-E2E');
    expect(valores).toContain('CERT-MAN-2026');
  });

  it('a medição de espessura sai ponto a ponto', async () => {
    const { modelo } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    expect(modelo.ultrassom.pontos.map((p) => p.ponto)).toEqual(['Casco 1', 'Casco 2']);
    expect(modelo.ultrassom.pontos[0].medidas).toEqual(['9,1', '9,2', '9,3', '9,4']);
  });

  it('a foto de capa da ficha chega ao documento', async () => {
    const { modelo } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    expect(modelo.fotoCapa).toBe(PIXEL);
  });

  it('override manual vence a fonte, e a string vazia é respeitada', async () => {
    const auto = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    expect(campo(auto.editaveis, 'documentacao.comentarios')).toBe('COMENTARIO-DOC-E2E');

    const manual = await gerarRelatorioVetorial(TAG, {
      documentos: DOCUMENTOS,
      certificados: false,
      overrides: {
        'documentacao.comentarios': { modo: 'manual', valor: 'ESCRITO-A-MAO', auto: 'COMENTARIO-DOC-E2E', em: '2026-09-07' },
      },
    });
    expect(campo(manual.editaveis, 'documentacao.comentarios')).toBe('ESCRITO-A-MAO');

    // Apagar de propósito NÃO faz o valor automático voltar.
    const apagado = await gerarRelatorioVetorial(TAG, {
      documentos: DOCUMENTOS,
      certificados: false,
      overrides: {
        'documentacao.comentarios': { modo: 'branco', auto: 'COMENTARIO-DOC-E2E', em: '2026-09-07' },
      },
    });
    expect(campo(apagado.editaveis, 'documentacao.comentarios')).toBe('');
  });

  it('seção não selecionada NÃO é emitida — o documento não inventa ensaio', async () => {
    const semEnsaios = DOCUMENTOS.filter(
      (d) => !['ULTRASSOM.html', 'TESTE-HIDROSTATICO.html'].includes(d),
    );
    const completo = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const curto = await gerarRelatorioVetorial(TAG, { documentos: semEnsaios, certificados: false });
    expect(curto.paginas).toBeLessThan(completo.paginas);
    expect(campo(curto.editaveis, 'ultrassom.resultado')).toBeNull();
    expect(campo(curto.editaveis, 'th.pressaoTeste')).toBeNull();
  });

  it('a PLACA nasce RECONSTRUÍDA, e ela concorda com as tabelas', async () => {
    const { editaveis, modelo } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    // Sem `nr13_placa_<TAG>` não há foto real: a placa é desenhada.
    expect(modelo.placaReal).toBeNull();
    // Desenhada = campo de texto por linha, com id próprio. Se ela virasse
    // imagem da tabela, estes campos não existiriam.
    expect(campo(editaveis, 'placa.fabricante')).toBe('FABRICANTE-E2E-2026');
    expect(campo(editaveis, 'placa.n-de-serie')).toBe('SERIE-E2E-987654');
    // UMA fonte: o que a placa imprime é o mesmo valor da tabela de identificação.
    expect(campo(editaveis, 'placa.fabricante')).toBe(modelo.equipamento['FABRICANTE']);
    const pmtaPlaca = campo(editaveis, 'placa.pmta-kgf-cm');
    expect(pmtaPlaca).toBe(modelo.pressoes.find((p) => p.rotulo.startsWith('PMTA'))!.kgf);
  });

  it('a área da placa é clicável para trocar por FOTO — e remover volta à reconstruída', async () => {
    const comArea = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    const alvo = comArea.editaveis.find((e) => e.id === 'placa.foto');
    expect(alvo).toBeDefined();
    expect(alvo!.tipo).toBe('imagem');

    // `branco` é o gesto "Remover imagem" no bloco da placa. Ele NÃO deixa o
    // espaço vazio: devolve a placa reconstruída, que é informação verdadeira.
    const removida = await gerarRelatorioVetorial(TAG, {
      documentos: DOCUMENTOS,
      certificados: false,
      overrides: { 'placa.foto': { modo: 'branco', auto: '', em: '2026-09-07' } },
    });
    expect(removida.modelo.placaReal).toBeNull();
    expect(campo(removida.editaveis, 'placa.fabricante')).toBe('FABRICANTE-E2E-2026');
  });

  it('override do relatório NÃO altera a ficha nem a inspeção', async () => {
    const antes = localStorage.getItem(`nr13_info_${TAG}`);
    const antesInspecao = localStorage.getItem('nr13_injecao_atual');
    await gerarRelatorioVetorial(TAG, {
      documentos: DOCUMENTOS,
      certificados: false,
      overrides: {
        'identificacao.fabricante': { modo: 'manual', valor: 'OUTRO NOME SÓ AQUI', auto: 'FABRICANTE-E2E-2026', em: '2026-09-07' },
        'documentacao.comentarios': { modo: 'branco', auto: 'COMENTARIO-DOC-E2E', em: '2026-09-07' },
      },
    });
    expect(localStorage.getItem(`nr13_info_${TAG}`)).toBe(antes);
    expect(localStorage.getItem('nr13_injecao_atual')).toBe(antesInspecao);
  });

  it('a PRÉVIA e a EMISSÃO desenham o mesmo conteúdo', async () => {
    const previa = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false, modo: 'preview' });
    const final = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false, modo: 'final' });
    expect(previa.paginas).toBe(final.paginas);
    expect(previa.editaveis.map((e) => `${e.id}=${e.valor}`)).toEqual(
      final.editaveis.map((e) => `${e.id}=${e.valor}`),
    );
  });
});

describe('os campos que o formulário passou a coletar (07/09/2026) chegam ao PAPEL', () => {
  it('os sete campos do teste hidrostático são desenhados na folha', async () => {
    const { editaveis } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    expect(campo(editaveis, 'th.pressao-trabalho')).toBe('8,16');
    expect(campo(editaveis, 'th.duracao')).toBe('30 min');
    expect(campo(editaveis, 'th.temp-fluido')).toBe('22 °C');
    expect(campo(editaveis, 'th.normas')).toBe('ASME VIII Div.1 / NR-13');
    expect(campo(editaveis, 'th.validade-laudo')).toBe('07/09/2031');
    expect(campo(editaveis, 'th.procedimento')).toBe('PROCEDIMENTO-TH-E2E');
    expect(campo(editaveis, 'th.parecer')).toBe('PARECER-TH-E2E');
  });

  it('a observação do ultrassom é desenhada na folha', async () => {
    const { editaveis } = await gerarRelatorioVetorial(TAG, { documentos: DOCUMENTOS, certificados: false });
    expect(campo(editaveis, 'ultrassom.observacoes')).toBe('OBSERVACOES-US-E2E');
  });

  it('e continuam editáveis por override, sem tocar no ensaio', async () => {
    // O ensaio agora tem fonte; o override continua sendo a camada de cima.
    // `branco` apaga só neste relatório — o container fica intacto.
    const antes = localStorage.getItem('nr13_injecao_atual');
    const r = await gerarRelatorioVetorial(TAG, {
      documentos: DOCUMENTOS,
      certificados: false,
      overrides: {
        'th.parecer': { modo: 'manual', valor: 'PARECER-SO-NESTE-RELATORIO', auto: 'PARECER-TH-E2E', em: '2026-09-07' },
        'ultrassom.observacoes': { modo: 'branco', auto: 'OBSERVACOES-US-E2E', em: '2026-09-07' },
      },
    });
    expect(campo(r.editaveis, 'th.parecer')).toBe('PARECER-SO-NESTE-RELATORIO');
    expect(campo(r.editaveis, 'ultrassom.observacoes')).toBe('');
    expect(localStorage.getItem('nr13_injecao_atual')).toBe(antes);
  });
});
