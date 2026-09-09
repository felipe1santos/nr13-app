import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FATORES_CONVERSAO, formatarValor, paraExibicao, paraMpa, unidadeValida } from './unidades';
import type { SistemaUnidade } from './unidades';
import { descrever } from '../app/RotaErro';

/**
 * 09/09/2026 · UNIDADE GUARDADA NÃO É UNIDADE VÁLIDA.
 *
 * `salvarUnidade(tag, unidade: string)` aceita qualquer string, e a projeção do
 * catálogo devolve `unidade: string | null`. Quem consumia fazia
 * `item.unidade as SistemaUnidade` — um cast, que não verifica nada.
 *
 * Com um valor fora do domínio, `FATORES_CONVERSAO[sistema]` é `undefined` e a
 * leitura seguinte lança. Num render do React isso não produz um valor feio na
 * tela: derruba a ROTA no `errorElement` ("Ocorreu um erro inesperado"). E a
 * lista de equipamentos chama `formatarValor` duas vezes por cartão, então
 * basta um equipamento com a chave estranha para a tela inteira cair — inclusive
 * ao ROLAR, porque o cartão só é montado quando entra na janela virtual.
 */

const FORA_DO_DOMINIO = ['metrico', 'KGF', 'si', '', 'bar', 'undefined', 'null'];

describe('a conversão não quebra com unidade desconhecida', () => {
  it.each(FORA_DO_DOMINIO)('formatarValor sobrevive a %j', (v) => {
    expect(() => formatarValor(1.25, v as SistemaUnidade)).not.toThrow();
  });

  it('valor fora do domínio cai em SI — a unidade só afeta exibição', () => {
    expect(formatarValor(1.25, 'metrico' as SistemaUnidade)).toBe('1.25 MPa');
    expect(paraExibicao(2, 'qualquer' as SistemaUnidade)).toBe(2);
    expect(paraMpa(2, 'qualquer' as SistemaUnidade)).toBe(2);
  });

  it('as unidades REAIS continuam convertendo como sempre', () => {
    expect(formatarValor(1, 'SI')).toBe('1.00 MPa');
    expect(formatarValor(1, 'TECNICO')).toBe('10.20 kgf/cm²');
    expect(formatarValor(1, 'PETROBRAS')).toBe('10.00 bar');
    expect(paraMpa(10.19716, 'TECNICO')).toBeCloseTo(1, 6);
  });

  it('`unidadeValida` aceita só o que existe na tabela', () => {
    for (const k of Object.keys(FATORES_CONVERSAO)) expect(unidadeValida(k)).toBe(k);
    for (const v of [...FORA_DO_DOMINIO, null, undefined, 7, {}, []]) expect(unidadeValida(v)).toBe('SI');
  });

  it('não cai em herança do Object — "toString" não é uma unidade', () => {
    // `'toString' in FATORES_CONVERSAO` seria VERDADEIRO por herança de
    // protótipo, e o cast passaria. Daí o `hasOwnProperty`.
    expect(unidadeValida('toString')).toBe('SI');
    expect(unidadeValida('constructor')).toBe('SI');
  });
});

describe('quem lê a unidade do item não usa mais cast cego', () => {
  const card = readFileSync('src/features/equipamento/CardCatalogo.tsx', 'utf8');
  const tela = readFileSync('src/features/equipamento/EquipamentosV9.tsx', 'utf8');

  it('o cartão da grade valida', () => {
    expect(card).toContain('unidadeValida(item.unidade)');
    expect(card).not.toContain('(item.unidade as SistemaUnidade)');
  });

  it('a linha da lista valida', () => {
    expect(tela).toContain('const unidade = unidadeValida(item.unidade);');
    expect(tela).not.toContain('(item.unidade as SistemaUnidade)');
  });
});

/**
 * O outro lado da mesma rodada: sem os detalhes na tela de erro, o defeito
 * chegou como "aparece erro inesperado" e nada mais — e quem reproduz está no
 * celular, sem console.
 */
describe('a tela de erro diz QUAL foi o erro', () => {
  it('erro comum vira nome, mensagem e pilha', () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'labelPressao')");
    const t = descrever(e);
    expect(t).toContain('TypeError');
    expect(t).toContain('labelPressao');
  });

  it('objeto lançado não vira "[object Object]"', () => {
    // O caso em que a informação some justamente quando ela importa.
    expect(descrever({ codigo: 42, msg: 'falhou' })).toContain('"codigo":42');
    expect(descrever({})).not.toContain('[object Object]');
  });

  it('valor primitivo lançado continua legível', () => {
    expect(descrever('quebrou')).toContain('quebrou');
    expect(descrever(null)).toContain('null');
  });

  it('a tela de erro oferece copiar os detalhes', () => {
    const fonte = readFileSync('src/app/RotaErro.tsx', 'utf8');
    expect(fonte).toContain('navigator.clipboard.writeText(detalhes)');
    expect(fonte).toContain('Ver detalhes técnicos');
    // Recolhido por padrão: quem só quer voltar a trabalhar não lê pilha.
    expect(fonte).toContain('useState(false)');
  });
});
