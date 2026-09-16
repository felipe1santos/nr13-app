/**
 * A UNIDADE DE MEDIDA É CARACTERÍSTICA DO EQUIPAMENTO (16/09/2026).
 *
 * ## O que mudou
 *
 * Havia um `<select>` no cartão de `/equipamentos` que trocava a unidade na
 * hora e gravava. Unidade não é preferência de visualização: ela é a referência
 * em que a ficha e a DOCUMENTAÇÃO daquele equipamento saem. Trocá-la num cartão
 * de lista mudava, num clique e sem confirmação, a unidade do relatório.
 *
 * Agora: escolhida na CRIAÇÃO, exibida como informação no cartão, e alterável
 * só na ficha — que já tinha select + botão "Salvar" explícito.
 *
 * ## O que NÃO mudou, e é o que este arquivo mais protege
 *
 * O valor técnico continua canônico em **MPa**. A unidade só decide
 * apresentação e ENTRADA. E a CATEGORIA NR-13 continua em kPa·m³ (enquadramento)
 * e MPa·m³ (grupo de risco) seja qual for a unidade do equipamento — são as
 * unidades que DEFINEM o resultado (§4 do CLAUDE.md), não formatação.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CASAS_POR_UNIDADE,
  FATORES_CONVERSAO,
  paraExibicao,
  paraMpa,
  rotuloPressao,
  rotuloSistemaCompleto,
  unidadeValida,
  valorNaUnidade,
  type SistemaUnidade,
} from '../../calc/unidades';
import { calcularCategoriaNR13 } from '../../calc/categoria';

const RAIZ = resolve(__dirname, '../../..');
const fonte = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

const TODAS = Object.keys(FATORES_CONVERSAO) as SistemaUnidade[];

describe('as opções são as que o sistema já suportava — nenhuma inventada', () => {
  it('são exatamente três: SI, TECNICO e PETROBRAS', () => {
    expect(TODAS).toEqual(['SI', 'TECNICO', 'PETROBRAS']);
  });

  it('os rótulos de pressão continuam MPa, kgf/cm² e bar', () => {
    expect(TODAS.map(rotuloPressao)).toEqual(['MPa', 'kgf/cm²', 'bar']);
  });

  it('o nome completo é o que o usuário escolhe no cadastro', () => {
    expect(TODAS.map(rotuloSistemaCompleto)).toEqual(['SI (MPa)', 'Técnico (kgf/cm²)', 'Petrobras (bar)']);
  });

  it('valor fora do domínio não derruba a tela — recua para SI', () => {
    // O recuo já existia e é o que define a unidade do parque ANTIGO, que nunca
    // gravou preferência. Por isso ele é prova de migração, não detalhe.
    expect(unidadeValida(null)).toBe('SI');
    expect(unidadeValida(undefined)).toBe('SI');
    expect(unidadeValida('')).toBe('SI');
    expect(unidadeValida('KGF')).toBe('SI');
    expect(unidadeValida({} as unknown)).toBe('SI');
  });
});

describe('conversão ida e volta — o dado não se degrada', () => {
  // O erro que se quer evitar: arredondar para exibir, e usar o TEXTO
  // arredondado como entrada da próxima conversão. Três trocas de unidade e a
  // PMTA teria mudado de valor sozinha.
  const VALORES = [0.1, 0.8, 1.25, 2.2, 2.33, 10, 99.999];

  for (const u of TODAS) {
    it(`MPa → ${rotuloPressao(u)} → MPa devolve o original (${u})`, () => {
      for (const mpa of VALORES) {
        expect(paraMpa(paraExibicao(mpa, u), u)).toBeCloseTo(mpa, 10);
      }
    });
  }

  it('a conversão parte SEMPRE do canônico, nunca do texto já formatado', () => {
    // 2.2 MPa = 22.43 kgf/cm². Reconvertendo o TEXTO "22.43" chega-se a
    // 2.19960…, e não a 2.2 — a diferença que se acumula a cada troca.
    const canonico = 2.2;
    const textoKgf = valorNaUnidade(canonico, 'TECNICO')!;
    expect(textoKgf).toBe('22.43');
    expect(paraMpa(Number(textoKgf), 'TECNICO')).not.toBeCloseTo(canonico, 10);
    // E o caminho do sistema — que sempre parte do canônico — não tem esse erro.
    expect(valorNaUnidade(canonico, 'SI')).toBe('2.200');
  });

  it('cada unidade imprime com as casas que sempre teve', () => {
    expect(CASAS_POR_UNIDADE).toEqual({ SI: 3, TECNICO: 2, PETROBRAS: 2 });
    expect(valorNaUnidade(1, 'SI')).toBe('1.000');
    expect(valorNaUnidade(1, 'TECNICO')).toBe('10.20');
    expect(valorNaUnidade(1, 'PETROBRAS')).toBe('10.00');
  });

  it('ausente e ilegível saem como null — nunca NaN nem "undefined"', () => {
    for (const u of TODAS) {
      expect(valorNaUnidade(null, u)).toBeNull();
      expect(valorNaUnidade(Number.NaN, u)).toBeNull();
      expect(valorNaUnidade(Number.POSITIVE_INFINITY, u)).toBeNull();
    }
  });
});

describe('CATEGORIA NR-13 — a exceção, e ela não se move', () => {
  /**
   * O enquadramento é `P(kPa) × V(m³) > 8` e o grupo de risco é `P(MPa) × V(m³)`.
   * Essas unidades não são formatação: são a BASE em que os limites da norma
   * foram escritos. Se a unidade do equipamento as alcançasse, um vaso mudaria
   * de categoria por causa de uma escolha de exibição.
   *
   * O teste roda a MESMA pressão física declarada nas três unidades e exige
   * resultado idêntico — produto, enquadramento, grupo e categoria final.
   */
  const VOLUME = 1.25;
  const FLUIDO = 'A - Fluido inflamável, combustível (T ≥ 200 °C)';
  const PMTA_MPA = 1.8;

  it('a mesma pressão física dá a MESMA categoria nas três unidades', () => {
    // O percurso REAL: o usuário digita na unidade do equipamento, o serviço
    // converte para MPa (`paraMpa`) e só então a norma calcula. Aqui a entrada
    // de cada unidade é o MESMO 1,8 MPa escrito naquela unidade.
    const resultados = TODAS.map((u) =>
      calcularCategoriaNR13(VOLUME, paraMpa(paraExibicao(PMTA_MPA, u), u), FLUIDO),
    );
    const [si, tecnico, petrobras] = resultados;

    // O produto do ENQUADRAMENTO é em kPa·m³ — 1,8 MPa = 1800 kPa.
    expect(si.pvEnq).toBeCloseTo(1800 * VOLUME, 6);
    expect(tecnico.pvEnq).toBeCloseTo(si.pvEnq, 6);
    expect(petrobras.pvEnq).toBeCloseTo(si.pvEnq, 6);

    // O produto do GRUPO DE RISCO é em MPa·m³.
    expect(si.pvCat).toBeCloseTo(PMTA_MPA * VOLUME, 6);
    expect(tecnico.pvCat).toBeCloseTo(si.pvCat, 6);
    expect(petrobras.pvCat).toBeCloseTo(si.pvCat, 6);

    // E o que o usuário lê: mesma classe, mesmo grupo, mesma categoria.
    expect([tecnico.classe, tecnico.grupo, tecnico.catFinal]).toEqual([si.classe, si.grupo, si.catFinal]);
    expect([petrobras.classe, petrobras.grupo, petrobras.catFinal]).toEqual([si.classe, si.grupo, si.catFinal]);
    expect(tecnico.isEnquadrado).toBe(si.isEnquadrado);
    expect(petrobras.isEnquadrado).toBe(si.isEnquadrado);
    // E o resultado é o esperado: 1,8 × 1,25 = 2,25 MPa·m³ cai no grupo 4
    // (faixa 1 ≤ PV < 2,5), que cruzado com fluido classe A dá categoria III.
    expect(si.pvCat).toBeCloseTo(2.25, 6);
    expect(si.grupo).toBe(4);
    expect(si.catFinal).toBe('III');
  });

  it('o serviço converte a entrada para MPa ANTES de calcular', () => {
    // É esta linha que garante o teste acima, e ela não pode virar
    // "usa o número como veio".
    expect(fonte('src/features/categoria/categoriaService.ts')).toContain(
      'const pressaoMpa = paraMpa(pressaoExibida, unidade);',
    );
  });

  it('a ficha passa à Categoria a unidade FIXADA, nunca a prévia', () => {
    // Trocar o seletor sem salvar não pode reinterpretar a pressão da
    // categorização — o resultado mudaria sem ninguém ter salvo nada.
    expect(fonte('src/pages/Equipamento.tsx')).toContain('<CategoriaNR13 tag={tag} unidade={unidadeSalva} />');
  });

  it('o relatório NÃO converte os produtos da categorização', () => {
    const modelo = fonte('src/features/relatorios/pdfVetorial/modelo.ts');
    // `pvKpa` e `pvMpa` saem do que `calcularESalvarCategoria` gravou, crus.
    expect(modelo).toContain("pvKpa: numeroBr(cat.PV_enq)");
    expect(modelo).toContain("pvMpa: numeroBr(cat.PV_cat)");
    // E as folhas continuam anunciando as unidades da norma.
    const folhas = fonte('src/features/relatorios/pdfVetorial/folhas.ts');
    expect(folhas).toContain('Produto P.V. para risco (MPa × m³)');
    expect(folhas).toContain('RELAÇÃO: P (MPa) × V (m³)');
  });
});

describe('o cartão mostra a unidade, e não deixa trocá-la', () => {
  const CARTOES = ['src/features/equipamento/CardCatalogo.tsx', 'src/features/equipamento/CardEquipamento.tsx'];

  for (const arq of CARTOES) {
    it(`${arq} não tem mais seletor de unidade`, () => {
      const s = fonte(arq);
      expect(s, 'o select voltou ao cartão').not.toContain('plate-uom-select');
      expect(s, 'o cartão voltou a gravar unidade').not.toContain('salvarUnidade');
      expect(s).toContain('plate-uom-valor');
      expect(s).toContain('rotuloSistemaCompleto(unidade)');
    });
  }

  it('o CSS do seletor saiu junto — pílula clicável não pode sobrar', () => {
    expect(fonte('src/features/equipamento/equipamento.css')).not.toContain('.plate-uom-select');
  });

  it('o cartão continua mostrando a pressão ADOTADA, não a calculada', () => {
    // A rodada anterior (15/09/2026). A unidade não pode desfazê-la.
    const s = fonte('src/features/equipamento/CardCatalogo.tsx');
    expect(s).toContain('formatarValor(item.pmtaAdotadaMpa, unidade)');
    expect(s).toContain('formatarValor(item.pthAdotadaMpa, unidade)');
    expect(s).not.toMatch(/formatarValor\(item\.pmtaMpa/);
  });
});

describe('a criação grava a unidade, e o parque antigo tem recuo provado', () => {
  it('`criarEquipamento` persiste `nr13_pref_unidade_<TAG>`', () => {
    const s = fonte('src/features/equipamento/equipamentoService.ts');
    expect(s).toContain('await salvar(`nr13_pref_unidade_${tag}`, unidade);');
    // Grava SEMPRE, inclusive SI: é o que distingue "escolheu SI" de "nunca
    // escolheu", e sem essa distinção não há migração honesta depois.
    expect(s).toContain("unidade: SistemaUnidade = 'SI'");
  });

  it('o formulário de criação oferece as três, e só elas', () => {
    const s = fonte('src/features/equipamento/ModalCriarEquipamento.tsx');
    expect(s).toContain('Unidade de medida *');
    expect(s).toContain('Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]');
    expect(s).toContain('rotuloSistemaCompleto(u)');
  });

  it('equipamento sem preferência gravada continua válido — SI, sem NaN', () => {
    // O parque anterior a 16/09/2026 não tem a chave. Isto é o CENÁRIO B do
    // pedido, e o default não é chutado: é o mesmo `|| 'SI'` que os leitores
    // sempre aplicaram, agora provado.
    const u = unidadeValida(undefined);
    expect(u).toBe('SI');
    expect(valorNaUnidade(2.2, u)).toBe('2.200');
    expect(rotuloSistemaCompleto(u)).toBe('SI (MPa)');
  });
});

describe('o relatório imprime UMA unidade — a do equipamento', () => {
  const folhas = fonte('src/features/relatorios/pdfVetorial/folhas.ts');

  it('as tabelas de pressão perderam as colunas fixas', () => {
    expect(folhas).not.toContain("cabecalho: ['GRANDEZA', 'MPa', 'psi', 'kgf/cm²', 'bar']");
    expect(folhas).not.toContain("cabecalho: ['GRANDEZA', 'MPa', 'psi', 'kgf/cm²']");
    expect(folhas).not.toContain("cabecalho: ['GRANDEZA', 'MPa', 'kgf/cm²', 'bar']");
  });

  it('as três tabelas usam o MESMO rótulo, vindo do modelo', () => {
    const cabecalhos = [...folhas.matchAll(/cabecalho: \['GRANDEZA', m\.unidadeLabel\]/g)];
    expect(cabecalhos.length, 'as três tabelas de pressão do documento').toBe(3);
  });

  it('a placa reconstruída recebe a mesma unidade das tabelas', () => {
    // Da chamada de `layoutDaPlaca` até o `)` que a fecha — e só ela. Placa e
    // tabela lendo unidades diferentes seria o mesmo número divergindo dentro
    // do mesmo documento.
    const i = folhas.indexOf('layoutDaPlaca(');
    expect(i, 'a chamada de layoutDaPlaca sumiu').toBeGreaterThan(0);
    const chamada = folhas.slice(i, folhas.indexOf(');', i));
    expect(chamada, 'a placa deixou de receber a unidade do equipamento').toContain('m.unidadeLabel');
  });
});
