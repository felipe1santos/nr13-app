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

vi.mock('../../services/supabase', () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }), storage: {} },
  escopoStorageAtual: async () => null,
  idUsuarioAtual: async () => null,
  TABELA_STORAGE: 'app_storage',
}));

import { converterPressao, montarModeloRelatorio } from './pdfVetorial/modelo';
import { corDeFundo } from './pdfVetorial/documento';
import { desserializar, ehImagem, serializar } from './imagensDoDocumento';
import { overrideDeTexto, resolverValor } from './overridesRelatorio';

/**
 * Bloco 1 de fidelidade · o gate das quatro áreas reconstruídas.
 *
 * A pergunta: **o conteúdo que a referência mostra chegou ao documento, vindo
 * da fonte que já existia — e sem recalcular nada?**
 *
 * Os dados abaixo são gravados no formato REAL do sistema (o que
 * `vasoMemorialService`, `calcularESalvarCategoria` e a ficha gravam), não num
 * formato conveniente para o teste passar.
 */

const TAG = 'VP-B1';

function gravar(chave: string, valor: unknown) {
  localStorage.setItem(chave, JSON.stringify(valor));
}

/** O parque completo de um vaso, como o sistema o grava. */
function comEquipamentoCompleto() {
  gravar(`nr13_info_${TAG}`, {
    tag: TAG,
    tipo: 'vaso',
    fabricante: 'WEG',
    numeroSerie: 'SN-1',
    ano: '2015',
    codigoProjeto: 'ASME VIII Div. 1',
    localizacao: 'Casa de compressores',
    tipoConstrucao: 'Soldado — casco cilíndrico horizontal',
    descricaoResumida: 'Pulmão de ar comprimido.',
    volume: 2.5,
    pmoAdotadaMpa: '1.00',
  });
  gravar(`nr13_cat_${TAG}`, {
    classe: 'C',
    grupo: 3,
    PV_cat: '2.5000',
    PV_enq: '2500.0000',
    isEnquadrado: true,
    catFinal: 'III',
    volInput: 2.5,
    presInput: 1,
    unidInput: 'SI',
    fluidoInput: 'C - Ar comprimido',
  });
  gravar(`nr13_calc_${TAG}`, {
    pmta: '1.05',
    pth: '1.37',
    componentes: [
      {
        nome: 'Casco Cilíndrico (UG-27)',
        pmtaMpa: 1.05,
        tReqMm: 5.11,
        tNom: 9.5,
        E: 0.85,
        S: 137.9,
        D: 1200,
        raio: 600,
        ca: 1.5,
        material: 'ASTM A516 Gr. 60',
      },
    ],
  });
  gravar(`nr13_vaso_${TAG}`, {
    tag: TAG,
    P: 1.05,
    D: 1200,
    componentes: [
      { id: 'casco', nome: 'Casco', tipo: 'casco', dados: { mat: 'ASTM A516 Gr. 60', ca: 1.5, temp: 100, S: 137.9, E: 0.85 } },
      { id: 'tampo1', nome: 'Tampo superior', tipo: 'tampoTorisferico', dados: { mat: 'ASTM A516 Gr. 60' } },
      { id: 'tampo2', nome: 'Tampo inferior', tipo: 'tampoTorisferico', dados: { mat: 'ASTM A283 Gr. C' } },
    ],
  });
  gravar(`nr13_emp_${TAG}`, {
    razaoSocial: 'Frigorífico Boa Vista S/A',
    endereco: 'Rod. SP-330, km 142',
    bairro: 'Distrito Industrial',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
  });
  gravar('nr13_relatorio_meta_atual', {
    codigo: 'REL-0142/26',
    emissao: '05/09/2026',
    validade: '08/2027',
    execucaoInspecao: '14/08/2026',
    tipoInspecao: 'Inspeção Periódica',
    phNome: 'Marcos Ribeiro Alves',
    phCrea: 'SP-5061234567',
  });
}

beforeEach(() => localStorage.clear());

describe('A · capa com dados completos', () => {
  it('classe, grupo, categoria e validade chegam ao modelo', () => {
    comEquipamentoCompleto();
    const m = montarModeloRelatorio(TAG);
    expect(m.equipamento['CLASSE DO FLUIDO']).toMatch(/^C/);
    expect(m.categoria.grupo).toBe('3');
    expect(m.categoria.catFinal).toBe('III');
    expect(m.validade).toBe('08/2027');
  });

  it('responsável técnico e CREA vêm da meta do relatório', () => {
    comEquipamentoCompleto();
    const m = montarModeloRelatorio(TAG);
    expect(m.responsavel.nome).toBe('Marcos Ribeiro Alves');
    expect(m.responsavel.registro).toBe('SP-5061234567');
  });

  it('a capa desenha a referência: Portaria, tabela superior, foto e bloco inferior', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain('Portaria nº 1.082');
    expect(folhas).toContain("id: 'capa.classe-do-fluido'");
    expect(folhas).toContain("id: 'capa.art'");
    expect(folhas).toContain("id: 'capa.responsavel'");
    // A foto vem ANTES do bloco inferior, como na referência.
    expect(folhas.indexOf("id: 'capa.foto'")).toBeLessThan(folhas.indexOf("id: 'capa.n-do-relatorio'"));
  });

  it('a foto da capa é ELÁSTICA — é o que fechava a folha com um terço em branco', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain('doc.espacoRestante - ALTURA_TABELA_INFERIOR');
    expect(folhas).toMatch(/Math\.max\(40, Math\.min\(disponivel, 150\)\)/);
  });
});

describe('B · campo sem dado fica amarelo na prévia e limpo no final', () => {
  it('a A.R.T. nasce vazia — o sistema não tem esse cadastro', () => {
    const vazia = { texto: '', valor: true };
    expect(corDeFundo(vazia, 'preview')).toBe('#FFF8C4');
    expect(corDeFundo(vazia, 'final')).toBe('#ffffff');
  });
});

describe('C/D · área de imagem', () => {
  it('sem imagem, a prévia pinta a área e o final só marca o fio', () => {
    const doc = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
    expect(doc).toContain('areaImagem(');
    expect(doc).toMatch(/const vazioNaPrevia = this\.modo === 'preview'/);
    expect(doc).toContain('AMARELO_PREVIA');
  });

  it('a logo ausente também se anuncia, e só na prévia', () => {
    const prim = readFileSync('src/features/relatorios/pdfVetorial/primitivas.ts', 'utf8');
    expect(prim).toContain('destacarLogoVazia');
    expect(prim).toContain('#FFF8C4');
    const doc = readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8');
    expect(doc).toContain("this.modo === 'preview')");
  });

  it('a imagem escolhida é guardada por CAMINHO, nunca em Base64', () => {
    const texto = serializar({ ref: { bucket: 'fotos', path: 'org/documento/abc.jpg' }, proporcao: 1.5 } as never);
    expect(ehImagem(texto)).toBe(true);
    expect(texto).not.toContain('data:image');
    expect(desserializar(texto)?.proporcao).toBe(1.5);
  });

  it('remover a imagem é override em branco — a foto do cadastro não volta', () => {
    const ovr = overrideDeTexto('', '(imagem)');
    expect(ovr.modo).toBe('branco');
    expect(resolverValor('(imagem)', ovr)).toBe('');
    const ger = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');
    expect(ger).toContain("ovr['capa.foto']?.modo === 'branco'");
  });
});

describe('E · folha 5 recebe os dados reais', () => {
  it('contratante, construção, materiais, margem e temperatura saem das fontes que já existem', () => {
    comEquipamentoCompleto();
    const p = montarModeloRelatorio(TAG).prontuario;
    expect(p.contratante).toBe('Frigorífico Boa Vista S/A');
    expect(p.endereco).toContain('Rod. SP-330');
    expect(p.materialCorpo).toBe('ASTM A516 Gr. 60');
    expect(p.tipoConstrucao).toContain('Soldado');
    expect(p.materialTampo1).toBe('ASTM A516 Gr. 60');
    expect(p.materialTampo2).toBe('ASTM A283 Gr. C');
    expect(p.margemCorrosao).toBe('1.5');
    expect(p.temperaturaProjeto).toBe('100');
    expect(p.descricaoResumida).toContain('Pulmão');
    expect(p.pressaoProjeto).toBe('1.050 MPa');
  });

  it('PMO, PMTA e PTH saem nas TRÊS unidades, convertidas do mesmo MPa', () => {
    comEquipamentoCompleto();
    const ops = montarModeloRelatorio(TAG).operacionais;
    expect(ops.map((o) => o.rotulo)).toEqual(['PMO', 'PMTA', 'PTH']);
    const pmta = ops[1];
    expect(pmta.mpa).toBe('1.050');
    expect(pmta.psi).toBe('152.3');
    expect(pmta.kgf).toBe('10.71');
  });

  it('psi é conversão, não rótulo trocado', () => {
    expect(converterPressao(1).psi).toBe('145.0');
    expect(converterPressao(1).kgf).toBe('10.20');
    expect(converterPressao(1).bar).toBe('10.00');
  });

  it('a categorização traz as DUAS contas, lidas da calculadora', () => {
    comEquipamentoCompleto();
    const c = montarModeloRelatorio(TAG).categorizacaoDetalhe;
    expect(c.pvKpa).toBe('2.500');
    expect(c.pvMpa).toBe('2,5');
    expect(c.resultadoEnquadramento).toMatch(/NR-13/i);
    expect(c.resultadoGrupo).toContain('3');
  });

  it('PMO sem valor declarado não vira a PMTA repetida', () => {
    comEquipamentoCompleto();
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tag: TAG, tipo: 'vaso' }));
    expect(montarModeloRelatorio(TAG).operacionais[0].mpa).toBeNull();
  });
});

describe('F · override na folha 5 muda só o relatório', () => {
  it('cada campo do prontuário tem id semântico', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain("'prontuario'");
    expect(folhas).toContain("id: 'prontuario.descricao-resumida'");
    expect(folhas).toContain("id: 'prontuario.observacoes'");
    expect(folhas).toContain("id: 'categorizacao.pv-kpa'");
  });

  it('o valor manual vence a fonte sem tocar no dado mestre', () => {
    comEquipamentoCompleto();
    const auto = montarModeloRelatorio(TAG).prontuario.materialCorpo;
    const ovr = overrideDeTexto('ASTM A285 Gr. C', auto);
    expect(resolverValor(auto, ovr)).toBe('ASTM A285 Gr. C');
    expect(montarModeloRelatorio(TAG).prontuario.materialCorpo).toBe(auto);
  });
});

describe('G · folha 6 recebe os parâmetros reais do memorial', () => {
  it('E, S, raio e margem chegam ao modelo — vindos do motor, não recalculados', () => {
    comEquipamentoCompleto();
    const c = montarModeloRelatorio(TAG).componentes[0];
    expect(c.e).toBe('0.85');
    expect(c.s).toBe('137.9');
    expect(c.raio).toBe('600');
    expect(c.ca).toBe('1.5');
    expect(c.espNom).toBe('9.5');
    expect(c.espReq).toBe('5.11');
    expect(c.pmta).toBe('1.05');
  });

  it('a folha desenha uma faixa por componente, e a tabela quebra sozinha', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain('PARÂMETROS E RESULTADOS: ${c.nome.toUpperCase()}');
    expect(folhas).toContain('EFICIÊNCIA DA JUNTA (E)');
    expect(folhas).toContain('TENSÃO ADMISSÍVEL (S)');
    expect(folhas).toContain('for (const c of m.componentes)');
  });

  it('nenhuma fórmula foi reimplementada na folha', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).not.toMatch(/Math\.(pow|sqrt)\(/);
    expect(folhas).not.toContain('S * E');
  });
});

describe('H/I · recomendações de segurança', () => {
  const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');

  it('a seção 9 existe, com item, recomendação e prazo', () => {
    expect(folhas).toContain('9. RECOMENDAÇÕES DE SEGURANÇA');
    expect(folhas).toContain("cabecalho: ['ITEM', 'RECOMENDAÇÃO', 'PRAZO']");
  });

  it('cada linha é editável e nasce vazia — nada é inventado', () => {
    expect(folhas).toContain('id: `recomendacoes.${n}.texto`');
    expect(folhas).toContain('id: `recomendacoes.${n}.prazo`');
  });

  it('a pergunta da PMTA e a justificativa entraram no parecer', () => {
    expect(folhas).toContain("id: 'parecer.pmta-mantida'");
    expect(folhas).toContain("id: 'parecer.justificativa'");
  });
});

describe('J · o documento final continua sendo documento', () => {
  it('nenhum amarelo no modo final, em nenhum tipo de campo', () => {
    for (const cel of [{ texto: '', valor: true }, { texto: '—', valor: true }]) {
      expect(corDeFundo(cel, 'final')).toBe('#ffffff');
    }
  });

  it('a emissão continua passando pelo mesmo caminho de SHA/pdfRef', () => {
    const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
    expect(tela).toContain('publicarArtefato(bytes, paginas)');
    expect(tela).toContain('overrides,');
  });
});
