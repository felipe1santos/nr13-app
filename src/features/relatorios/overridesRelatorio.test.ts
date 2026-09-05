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

import {
  carregarOverrides,
  chaveOverrides,
  comOverride,
  contarOverrides,
  copiarOverrides,
  gravarOverrides,
  origemDoValor,
  overrideDeTexto,
  resolverValor,
  sanear,
  semOverride,
} from './overridesRelatorio';
import { ler } from '../../services/storage';
import { idCampo } from './pdfVetorial/folhas';
import { montarModeloRelatorio } from './pdfVetorial/modelo';
import { corDeFundo } from './pdfVetorial/documento';

/**
 * 13D-bis · o gate do DOCUMENTO EDITÁVEL.
 *
 * A pergunta que ele responde: **o texto que o usuário aprovou na tela é o que
 * sai no PDF — e o cadastro do sistema continua onde estava?**
 *
 * Os casos A–I são os que o dono listou, e o terceiro (`branco`) é o que quase
 * sempre falta numa implementação de override: apagar tem que PERMANECER
 * apagado, senão o valor automático volta sozinho na próxima geração.
 */

const TAG = 'VP-OVR';
const ID = 'REL-1';

beforeEach(() => localStorage.clear());

describe('A · sem override, manda a fonte automática', () => {
  it('o valor do sistema atravessa intacto', () => {
    expect(resolverValor('WEG', undefined)).toBe('WEG');
    expect(origemDoValor(undefined)).toBe('auto');
  });

  it('ausência de dado continua ausência — não vira string mágica', () => {
    expect(resolverValor(null, undefined)).toBeNull();
  });
});

describe('B · override manual manda no documento, e só nele', () => {
  it('o texto escrito prevalece', () => {
    const ovr = overrideDeTexto('WEG Equipamentos', 'WEG');
    expect(resolverValor('WEG', ovr)).toBe('WEG Equipamentos');
    expect(origemDoValor(ovr)).toBe('manual');
  });

  it('o valor automático fica guardado — é o que permite restaurar', () => {
    const ovr = overrideDeTexto('WEG Equipamentos', 'WEG');
    expect(ovr.auto).toBe('WEG');
    expect(ovr.em).not.toBe('');
  });

  it('a gravação NÃO encosta na ficha do equipamento', async () => {
    localStorage.setItem(`nr13_info_${TAG}`, JSON.stringify({ fabricante: 'WEG' }));
    await gravarOverrides(ID, TAG, { 'equipamento.fabricante': overrideDeTexto('WEG Equipamentos', 'WEG') });
    expect(ler<{ fabricante: string }>(`nr13_info_${TAG}`)?.fabricante).toBe('WEG');
  });

  it('a chave é do RELATÓRIO, e não colide com o registro dele', () => {
    expect(chaveOverrides(ID, TAG)).toBe(`nr13_ovr_${ID}_${TAG}`);
    expect(chaveOverrides(ID, TAG).startsWith('nr13_rel_')).toBe(false);
  });
});

describe('C · apagar de propósito PERMANECE apagado', () => {
  it('texto vazio vira `branco`, não "sem override"', () => {
    const ovr = overrideDeTexto('', 'WEG');
    expect(ovr.modo).toBe('branco');
    expect(resolverValor('WEG', ovr)).toBe('');
  });

  it('só espaços também é apagar', () => {
    expect(overrideDeTexto('   ', 'WEG').modo).toBe('branco');
  });

  it('o automático NÃO reaparece na geração seguinte', () => {
    const mapa = comOverride({}, 'equipamento.fabricante', overrideDeTexto('', 'WEG'));
    expect(resolverValor('WEG', mapa['equipamento.fabricante'])).toBe('');
  });

  it('campo apagado continua amarelo na prévia, e branco no final', () => {
    const celula = { texto: '', valor: true };
    expect(corDeFundo(celula, 'preview')).toBe('#FFF8C4');
    expect(corDeFundo(celula, 'final')).toBe('#ffffff');
  });
});

describe('D · restaurar o valor automático', () => {
  it('remover o override devolve a fonte', () => {
    const mapa = comOverride({}, 'equipamento.fabricante', overrideDeTexto('Outro', 'WEG'));
    const limpo = semOverride(mapa, 'equipamento.fabricante');
    expect(resolverValor('WEG', limpo['equipamento.fabricante'])).toBe('WEG');
    expect(contarOverrides(limpo)).toBe(0);
  });

  it('restaurar é DIFERENTE de gravar vazio', () => {
    const apagado = comOverride({}, 'x', overrideDeTexto('', 'WEG'));
    expect(resolverValor('WEG', apagado.x)).toBe('');
    expect(resolverValor('WEG', semOverride(apagado, 'x').x)).toBe('WEG');
  });
});

describe('E · o que foi digitado sobrevive ao F5', () => {
  it('grava e relê pelo caminho oficial', async () => {
    await gravarOverrides(ID, TAG, { 'capa.contratante': overrideDeTexto('Cliente X', '') });
    const lido = carregarOverrides(ID, TAG);
    expect(resolverValor('', lido['capa.contratante'])).toBe('Cliente X');
  });

  it('relatório sem overrides devolve mapa vazio, nunca erro', () => {
    expect(carregarOverrides('REL-INEXISTENTE', TAG)).toEqual({});
    expect(carregarOverrides('', '')).toEqual({});
  });

  it('registro corrompido não derruba o documento — o campo volta ao automático', () => {
    expect(sanear({ a: { modo: 'manual' }, b: 'texto solto', c: null })).toEqual({});
    expect(sanear(sanear({ ok: { modo: 'manual', valor: 'v', auto: 'a', em: 'x' } }))).toHaveProperty('ok');
  });
});

describe('F · texto padrão do sistema é editável', () => {
  it('o parágrafo do objetivo tem id próprio e default no gerador', () => {
    const folhas = readFileSync('src/features/relatorios/pdfVetorial/folhas.ts', 'utf8');
    expect(folhas).toContain("id: 'objetivo.texto'");
    expect(folhas).toContain('Este relatório apresenta o resultado da');
  });

  it('reescrever o padrão é um override manual como outro qualquer', () => {
    const padrao = 'Este relatório apresenta o resultado da inspeção…';
    const ovr = overrideDeTexto('Outro objetivo, escrito pelo engenheiro.', padrao);
    expect(resolverValor(padrao, ovr)).toBe('Outro objetivo, escrito pelo engenheiro.');
    expect(ovr.auto).toBe(padrao);
  });
});

describe('G · campo técnico aceita override sem mexer no cálculo', () => {
  it('a PMTA impressa muda; a calculada, não', () => {
    localStorage.setItem(`nr13_calc_${TAG}`, JSON.stringify({ pmta: '2.25', pth: '2.93' }));
    const antes = montarModeloRelatorio(TAG).pressoes.find((p) => /PMTA/i.test(p.rotulo))?.mpa;

    const ovr = overrideDeTexto('2,30', antes ?? '');
    expect(resolverValor(antes, ovr)).toBe('2,30');

    // A fonte permanece: o modelo remontado continua com o valor calculado.
    const depois = montarModeloRelatorio(TAG).pressoes.find((p) => /PMTA/i.test(p.rotulo))?.mpa;
    expect(depois).toBe(antes);
    expect(ler<{ pmta: string }>(`nr13_calc_${TAG}`)?.pmta).toBe('2.25');
  });
});

describe('H · a emissão usa o mesmo mapa da prévia', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');
  const gerador = readFileSync('src/features/relatorios/pdfVetorial/gerarRelatorio.ts', 'utf8');

  it('a finalização passa os overrides ao gerador', () => {
    expect(tela).toMatch(/gerarRelatorioVetorial\(tag, \{\s*\n\s*documentos,[\s\S]{0,400}overrides,/);
  });

  it('o gerador entrega os overrides ao Documento nas DUAS passagens', () => {
    const usos = gerador.match(/opcoes\.overrides \?\? \{\}/g) ?? [];
    expect(usos.length).toBe(2);
  });

  it('o mapa é congelado no registro como rastreabilidade', () => {
    expect(tela).toContain('meta: contarOverridesMeta() > 0 ? { ...m, overrides } : m');
  });

  it('nenhum marcador de edição vai para o PDF — o marcador é CSS da tela', () => {
    const css = readFileSync('src/pages/relatorios.css', 'utf8');
    expect(css).toContain('.previa-alvo.is-manual');
    expect(readFileSync('src/features/relatorios/pdfVetorial/documento.ts', 'utf8')).not.toContain('is-manual');
  });
});

describe('I · histórico continua servindo os bytes arquivados', () => {
  const tela = readFileSync('src/pages/Relatorios.tsx', 'utf8');

  it('documento arquivado não monta prévia nem editor', () => {
    expect(tela).toContain("fluxoDaTela(previaVetorial ? 'vetorial' : 'iframe', !!relatorioArquivado)");
    expect(tela).toContain("{fluxo === 'vetorial' && !somenteLeitura && (");
  });

  it('imprimir/baixar de documento com pdfRef segue pelo arquivo', () => {
    expect(tela).toContain("fonteDeImpressao(relatorioArquivado) === 'arquivo'");
    expect(tela).toContain('baixarPdfArquivado(artefatoDe(relatorioArquivado)!');
  });
});

describe('duplicar leva as correções de texto', () => {
  it('copia o mapa para o id novo, e os dois passam a viver separados', async () => {
    await gravarOverrides(ID, TAG, { 'capa.contratante': overrideDeTexto('Cliente X', '') });
    const copiado = await copiarOverrides(ID, TAG, 'REL-2', TAG);
    expect(contarOverrides(copiado)).toBe(1);

    await gravarOverrides('REL-2', TAG, { 'capa.contratante': overrideDeTexto('Cliente Y', '') });
    expect(resolverValor('', carregarOverrides(ID, TAG)['capa.contratante'])).toBe('Cliente X');
    expect(resolverValor('', carregarOverrides('REL-2', TAG)['capa.contratante'])).toBe('Cliente Y');
  });

  it('sem overrides na origem, não grava nada no destino', async () => {
    expect(await copiarOverrides('REL-VAZIO', TAG, 'REL-3', TAG)).toEqual({});
  });
});

describe('os identificadores são semânticos e estáveis', () => {
  it('saem do rótulo documental, sem acento e sem espaço', () => {
    expect(idCampo('equipamento', 'FABRICANTE')).toBe('equipamento.fabricante');
    expect(idCampo('equipamento', 'Nº DE SÉRIE')).toBe('equipamento.n-de-serie');
    expect(idCampo('capa', 'DATA DE EMISSÃO')).toBe('capa.data-de-emissao');
  });

  it('não carregam página nem índice — a paginação muda', () => {
    expect(idCampo('capa', 'CONTRATANTE')).not.toMatch(/\d/);
  });

  it('a camada de edição é React sobre o canvas, não o PDF editado', () => {
    const previa = readFileSync('src/features/relatorios/PreviaVetorial.tsx', 'utf8');
    expect(previa).toContain('sobreposicao={(pagina, largura, altura)');
    expect(previa).not.toContain('contentEditable');
    expect(readFileSync('src/components/VisualizadorPdf.tsx', 'utf8')).not.toContain('contentEditable');
  });
});
