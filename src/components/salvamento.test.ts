import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DURACAO_CHECK_MS,
  PISO_SPINNER_MS,
  esperaRestante,
  mensagemDeErro,
  rotuloSalvamento,
  vivacidade,
} from './salvamento';

/**
 * O aviso de salvamento. A regra que estes testes protegem é uma só: **o check
 * verde não pode aparecer sem sucesso real**.
 */

describe('o piso não atrasa a gravação', () => {
  it('operação instantânea espera o resto do piso', () => {
    expect(esperaRestante(0)).toBe(PISO_SPINNER_MS);
    expect(esperaRestante(150)).toBe(PISO_SPINNER_MS - 150);
  });

  it('operação LENTA não espera nada — o piso nunca soma tempo', () => {
    expect(esperaRestante(PISO_SPINNER_MS)).toBe(0);
    expect(esperaRestante(4000)).toBe(0);
  });

  it('o piso é pequeno o bastante para não parecer travamento', () => {
    expect(PISO_SPINNER_MS).toBeGreaterThanOrEqual(300);
    expect(PISO_SPINNER_MS).toBeLessThanOrEqual(500);
    expect(DURACAO_CHECK_MS).toBeGreaterThanOrEqual(700);
    expect(DURACAO_CHECK_MS).toBeLessThanOrEqual(1200);
  });

  it('tempo inválido cai no piso, e não em NaN', () => {
    expect(esperaRestante(Number.NaN)).toBe(PISO_SPINNER_MS);
    expect(esperaRestante(-9)).toBe(PISO_SPINNER_MS);
  });
});

describe('o estado é dito, não só colorido', () => {
  it('cada estado tem texto', () => {
    expect(rotuloSalvamento('salvando')).toBe('Salvando…');
    expect(rotuloSalvamento('salvo')).toBe('Salvo');
    expect(rotuloSalvamento('erro')).toBe('Não foi possível salvar');
    expect(rotuloSalvamento('ocioso')).toBe('');
  });

  it('a mensagem REAL do erro vence a genérica', () => {
    expect(rotuloSalvamento('erro', 'Sem espaço para a foto')).toBe('Sem espaço para a foto');
    expect(rotuloSalvamento('erro', '   ')).toBe('Não foi possível salvar');
  });

  it('erro interrompe o leitor de tela; sucesso espera a vez', () => {
    expect(vivacidade('erro')).toBe('assertive');
    expect(vivacidade('salvo')).toBe('polite');
    expect(vivacidade('salvando')).toBe('polite');
  });
});

describe('a mensagem de erro', () => {
  it('usa a do Error quando existe', () => {
    expect(mensagemDeErro(new Error('Container fora do cache'))).toBe('Container fora do cache');
    expect(mensagemDeErro('cota estourada')).toBe('cota estourada');
  });

  it('e um texto útil quando não existe', () => {
    for (const e of [new Error(''), null, undefined, {}, 42]) {
      expect(mensagemDeErro(e)).toContain('Não foi possível salvar');
    }
  });
});

describe('o componente é UM, e é ele que as telas usam', () => {
  const fonte = readFileSync('src/components/FeedbackSalvamento.tsx', 'utf8');

  it('o check só é armado DEPOIS do await da operação', () => {
    const corpo = fonte.slice(fonte.indexOf('const executar = useCallback'));
    const iAwait = corpo.indexOf('await operacao();');
    const iSalvo = corpo.indexOf("setEstado('salvo')");
    expect(iAwait).toBeGreaterThan(-1);
    expect(iSalvo).toBeGreaterThan(iAwait);
    // E no catch NÃO existe caminho para 'salvo'.
    const trechoCatch = corpo.slice(corpo.indexOf('} catch (e) {'));
    expect(trechoCatch).not.toContain("setEstado('salvo')");
    expect(trechoCatch).toContain("setEstado('erro')");
  });

  it('os cinco formulários de campo usam o componente único', () => {
    const forms = [
      'FormularioUltrassom',
      'FormularioTH',
      'FormularioVisualExterno',
      'FormularioVisualInterno',
      'FormularioChecklist',
    ];
    for (const f of forms) {
      const s = readFileSync(`src/features/inspecoes/formularios/${f}.tsx`, 'utf8');
      expect(s, f).toContain('useSalvamento');
      expect(s, f).toContain('<FeedbackSalvamento');
      // As cópias antigas saíram: cada uma tinha o seu `salvoOk` e o seu piso
      // de 600 ms escrito à mão.
      expect(s, `${f} ainda tem a cópia antiga`).not.toContain('setSalvoOk');
    }
  });

  it('o ULTRASSOM, que não tinha aviso nenhum, passou a ter', () => {
    // Era o defeito relatado: o dado ia para o armazenamento e a tela não
    // dizia nada.
    const s = readFileSync('src/features/inspecoes/formularios/FormularioUltrassom.tsx', 'utf8');
    expect(s).toContain("salvamento.executar(() => salvarDadosFormulario(tag, containerId, 'ultrassom', dados))");
  });

  it('nenhum formulário de campo voltou a usar alert/confirm', () => {
    for (const f of ['FormularioUltrassom', 'FormularioTH', 'FormularioVisualExterno', 'FormularioVisualInterno', 'FormularioChecklist']) {
      const s = readFileSync(`src/features/inspecoes/formularios/${f}.tsx`, 'utf8');
      expect(s, f).not.toMatch(/(^|[^.\w])alert\(/);
      expect(s, f).not.toMatch(/(^|[^.\w])confirm\(/);
    }
  });
});
