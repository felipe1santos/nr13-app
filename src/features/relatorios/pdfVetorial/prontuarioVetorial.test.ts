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

import { folhasDoProntuario, montarModeloProntuario } from './modeloProntuario';
import { conferirCamposProntuario } from './conferenciaProntuario';
import { secoesDoProntuario } from './folhasProntuario';
import { paginasProntuario } from '../../prontuarios/tipos';
import { foto } from './primitivas';
import {
  CHAVE_MOTOR_PRONTUARIO,
  motorProntuarioAtual,
  motorProntuarioConfigurado,
  motorPdfAtual,
} from '../motorPdf';

const TAG = 'VP-99';

beforeEach(() => localStorage.clear());

describe('a composição do prontuário espelha a tela — uma fonte só', () => {
  // Se estas duas listas divergirem, o PDF sai com folhas que o engenheiro não
  // vê na tela (ou sem folhas que ele vê). É o defeito que o §8 do CLAUDE.md
  // já corrigiu uma vez para caldeira e autoclave.
  it.each(['vaso', 'caldeira', 'autoclave', 'qualquer-outro'])(
    'para %s, o vetorial emite exatamente as folhas de paginasProntuario',
    (tipo) => {
      expect(folhasDoProntuario(tipo)).toEqual([...paginasProntuario(tipo)]);
    },
  );

  it('só o VASO tem croqui 2D e folha de dados', () => {
    expect(folhasDoProntuario('vaso')).toContain('PRONT-CROQUI2D.html');
    expect(folhasDoProntuario('vaso')).toContain('PRONT-FOLHA-DADOS.html');
    expect(folhasDoProntuario('caldeira')).not.toContain('PRONT-CROQUI2D.html');
    expect(folhasDoProntuario('caldeira')).not.toContain('PRONT-FOLHA-DADOS.html');
    expect(folhasDoProntuario('caldeira')).toHaveLength(4);
  });

  it('o sumário acompanha o tipo do equipamento', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'caldeira' }));
    const s = secoesDoProntuario(montarModeloProntuario(TAG));
    expect(s).not.toContain('Croqui 2D cotado');
    expect(s).toContain('Resumo dos cálculos');
  });
});

describe('o modelo LÊ — não calcula', () => {
  it('prontuário vazio não quebra: tudo vira null', () => {
    const m = montarModeloProntuario(TAG);
    expect(m.tag).toBe(TAG);
    expect(m.identificacao['FABRICANTE']).toBeNull();
    expect(m.pressoes[0].mpa).toBeNull();
    expect(m.ultrassom.pontos).toEqual([]);
    expect(m.croqui.longitudinal).toBeNull();
    expect(m.assinantes).toEqual([]);
  });

  it('lê ficha, categoria, cálculo e o formulário do prontuário', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ tipo: 'vaso', fabricante: 'ACME', numeroSerie: 'S-1' }));
    localStorage.setItem(`nr13_cat_${TAG}`, JSON.stringify({ catFinal: 'III', grupo: '2', volume: '1.5', classeFluido: 'C' }));
    localStorage.setItem(`nr13_calc_${TAG}`, JSON.stringify({ pmta: 1.2, pth: 1.56 }));
    localStorage.setItem(
      `nr13_prontuario_${TAG}`,
      JSON.stringify({ codigoProjeto: 'ASME VIII', tempProjeto: '80', revisao: '02', fundoCorpo: 'SA-516' }),
    );
    localStorage.setItem(`nr13_prontuario_meta_${TAG}`, JSON.stringify({ numero: 'REL-9', emissao: '04/09/2026' }));

    const m = montarModeloProntuario(TAG);
    expect(m.identificacao['FABRICANTE']).toBe('ACME');
    expect(m.identificacao['CÓDIGO DE PROJETO']).toBe('ASME VIII');
    expect(m.construtivos['MATERIAL DO CORPO']).toBe('SA-516');
    expect(m.categoria.categoria).toBe('III');
    // Conversão de pressão: o MESMO fator do relatório, sem recálculo local.
    expect(m.pressoes[0].kgf).toBe('12.24');
    expect(m.numero).toBe('REL-9');
    expect(m.revisao).toBe('02');
  });

  it('o dado do FORMULÁRIO vence o da ficha quando ambos existem', () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ numeroSerie: 'DA-FICHA' }));
    localStorage.setItem(`nr13_prontuario_${TAG}`, JSON.stringify({ nroSerie: 'DO-PRONTUARIO' }));
    expect(montarModeloProntuario(TAG).identificacao['Nº DE SÉRIE']).toBe('DO-PRONTUARIO');
  });

  it('ausente continua ausente — nunca vira zero', () => {
    localStorage.setItem(`nr13_calc_${TAG}`, JSON.stringify({}));
    const m = montarModeloProntuario(TAG);
    expect(m.pressoes[0].mpa).toBeNull();
    expect(m.pressoes[0].kgf).toBeNull();
  });
});

describe('assinatura: a mesma regra do pront-assinatura.js', () => {
  function comFuncionarios(folhasEng?: string[]) {
    localStorage.setItem(
      'nr13_lista_phs',
      JSON.stringify([
        { id: 'e1', nome: 'Eng. Teste', funcao: 'Engenheiro', crea: 'CREA-1', ...(folhasEng ? { folhasProntuario: folhasEng } : {}) },
        { id: 't1', nome: 'Insp. Teste', funcao: 'Inspetor' },
      ]),
    );
    localStorage.setItem(`nr13_assinantes_pront_${TAG}`, JSON.stringify({ engenheiroId: 'e1', tecnicoId: 't1' }));
  }

  it('sem folhasProntuario: engenheiro assina TODAS, inspetor NENHUMA', () => {
    comFuncionarios();
    const m = montarModeloProntuario(TAG);
    const eng = m.assinantes.find((a) => a.nome === 'Eng. Teste')!;
    const tec = m.assinantes.find((a) => a.nome === 'Insp. Teste')!;
    expect(eng.folhas.length).toBeGreaterThan(0);
    expect(eng.folhas).toContain('PRONT-MEMORIAL.html');
    expect(tec.folhas).toEqual([]);
  });

  it('com folhasProntuario declarado, vale o declarado', () => {
    comFuncionarios(['PRONT-MEMORIAL.html']);
    const eng = montarModeloProntuario(TAG).assinantes.find((a) => a.nome === 'Eng. Teste')!;
    expect(eng.folhas).toEqual(['PRONT-MEMORIAL.html']);
  });

  it('assinante sem nome não entra — coluna vazia é pior que ausente', () => {
    localStorage.setItem('nr13_lista_phs', JSON.stringify([{ id: 'e1', funcao: 'Engenheiro' }]));
    localStorage.setItem(`nr13_assinantes_pront_${TAG}`, JSON.stringify({ engenheiroId: 'e1', tecnicoId: null }));
    expect(montarModeloProntuario(TAG).assinantes).toEqual([]);
  });
});

describe('conferência campo a campo', () => {
  it('lista por NOME o que sai em branco', () => {
    const c = conferirCamposProntuario(montarModeloProntuario(TAG));
    expect(c.total).toBeGreaterThan(35);
    expect(c.vazios).toContain('contratante');
    expect(c.vazios).toContain('ultrassom · aparelho');
    expect(c.preenchidos + c.vazios.length).toBe(c.total);
  });

  it('campo com dado sai da lista de vazios', () => {
    localStorage.setItem(`nr13_emp_${TAG}`, JSON.stringify({ razaoSocial: 'CLIENTE LTDA' }));
    expect(conferirCamposProntuario(montarModeloProntuario(TAG)).vazios).not.toContain('contratante');
  });
});

describe('motor do prontuário — chave SEPARADA da do relatório', () => {
  it('padrão é ATUAL: ausência de decisão não troca o que está em produção', () => {
    expect(motorProntuarioConfigurado()).toBe('atual');
    expect(motorProntuarioAtual('')).toBe('atual');
  });

  it('só "vetorial" troca; qualquer outra coisa é atual', () => {
    localStorage.setItem(CHAVE_MOTOR_PRONTUARIO, JSON.stringify({ motor: 'vetorial' }));
    expect(motorProntuarioConfigurado()).toBe('vetorial');
    localStorage.setItem(CHAVE_MOTOR_PRONTUARIO, JSON.stringify({ motor: 'sim' }));
    expect(motorProntuarioConfigurado()).toBe('atual');
  });

  it('a URL usa `motorPront`, e não colide com a do relatório', () => {
    expect(motorProntuarioAtual('?motorPront=vetorial')).toBe('vetorial');
    // `?motor=` é do RELATÓRIO: não pode virar o prontuário por tabela.
    expect(motorProntuarioAtual('?motor=vetorial')).toBe('atual');
  });

  it('VIRAR O PRONTUÁRIO NÃO VIRA O RELATÓRIO, e vice-versa', () => {
    localStorage.setItem(CHAVE_MOTOR_PRONTUARIO, JSON.stringify({ motor: 'vetorial' }));
    // o relatório tem a sua própria chave; esta não o alcança
    expect(motorPdfAtual('')).toBe('raster');
    localStorage.clear();
    localStorage.setItem('nr13_motor_pdf', JSON.stringify({ motor: 'vetorial' }));
    expect(motorProntuarioConfigurado()).toBe('atual');
  });
});

describe('paridade: o que a folha ATUAL imprime, o vetorial imprime', () => {
  // Os dois casos abaixo foram achados pela conferência campo a campo contra
  // um prontuário real, não por leitura do código. Estavam faltando.
  it('a DATA DE EMISSÃO e o Nº vêm da meta e chegam ao modelo', () => {
    localStorage.setItem(`nr13_prontuario_meta_${TAG}`, JSON.stringify({ numero: 'REL-42', emissao: '19/08/2026' }));
    const m = montarModeloProntuario(TAG);
    expect(m.numero).toBe('REL-42');
    expect(m.emissao).toBe('19/08/2026');
    expect(conferirCamposProntuario(m).vazios).not.toContain('data de emissão');
  });

  it('o rodapé da executante leva bairro e CEP, como o `footer-empresa` atual', () => {
    localStorage.setItem('nr13_minha_empresa', JSON.stringify({
      razaoSocial: 'MDK ENG', endereco: 'Rua X, 1', bairro: 'Centro',
      cidade: 'Vila Velha', cnpj: '00.000.000/0001-00', cep: '29122-036',
    }));
    const e = montarModeloProntuario(TAG).empresa.endereco;
    expect(e).toContain('Centro');
    expect(e).toContain('CEP: 29122-036');
    expect(e).toContain('CNPJ: 00.000.000/0001-00');
  });
});

describe('croqui: proporção REAL, nunca 4:3 assumido', () => {
  // A primitiva `foto` cai em 4:3 quando não recebe proporção. O croqui do
  // prontuário é desenho COTADO: esticá-lo é imprimir cota errada, que num
  // documento técnico é pior do que não ter croqui.
  const CAIXA_CROQUI = { x: 15, y: 40, largura: 180, altura: 76 };

  function desenhado(proporcao?: number) {
    const chamadas: { w: number; h: number }[] = [];
    const falso = {
      setDrawColor() {}, setFillColor() {}, setLineWidth() {}, rect() {},
      setFont() {}, setFontSize() {}, setTextColor() {}, text() {},
      addImage(_d: string, _f: string, _x: number, _y: number, w: number, h: number) {
        chamadas.push({ w, h });
      },
    } as unknown as Parameters<typeof foto>[0];
    foto(falso, 'data:image/png;base64,AAA', CAIXA_CROQUI, proporcao);
    return chamadas[0];
  }

  it.each([
    ['croqui largo (vista longitudinal)', 4.5],
    ['croqui quase quadrado (vista transversal)', 1.1],
    ['detalhe alto (tampo)', 0.6],
  ])('%s mantém a proporção e cabe na caixa', (_n, razao) => {
    const d = desenhado(razao);
    expect(d.w / d.h).toBeCloseTo(razao, 3);
    expect(d.w).toBeLessThanOrEqual(CAIXA_CROQUI.largura + 0.001);
    expect(d.h).toBeLessThanOrEqual(CAIXA_CROQUI.altura + 0.001);
  });

  it('sem proporção a primitiva assume 4:3 — por isso o gerador SEMPRE a envia', () => {
    expect(desenhado(undefined).w / desenhado(undefined).h).toBeCloseTo(4 / 3, 3);
  });
});
