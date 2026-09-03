/**
 * Fase 9 · 9C — a busca OFFLINE tem de casar do mesmo jeito que a do servidor.
 *
 * Se divergirem, o usuário vê a lista mudar ao entrar e sair de rede. É o tipo
 * de inconsistência que faz perder a confiança na busca inteira — pior que uma
 * busca simplesmente pobre, porque não dá para explicar.
 *
 * O teste mais importante deste arquivo é o PRIMEIRO: ele lê o `.sql` e compara
 * a tabela de acentos caractere a caractere. Ela existe em dois lugares (banco e
 * bundle) porque a busca acontece nos dois; divergir é questão de tempo, e sem
 * este teste ninguém perceberia — a busca simplesmente deixaria de achar
 * "Metalúrgica" para quem digita "metalurgica", só offline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { casaTermo, normalizar } from './catalogoLocal';
import type { ItemCatalogo } from './buscaIndex';

function eq(extra: Partial<ItemCatalogo> = {}): ItemCatalogo {
  return {
    tag: 'VP-001', descricao: null, tipo: 'vaso', subtipo: null, categoria: null,
    fabricante: null, numeroSerie: null, localizacao: null, ano: null,
    clienteNome: null, clienteCidade: null,
    proximaInspecao: null, temFoto: false, fotoRef: null, pmtaMpa: null, pthMpa: null,
    resultado: null, volumeM3: null, fluido: null, classeFluido: null, vidaAnos: null,
    temCliente: false, unidade: null, sourceVersion: 1, inspecoes: null, temProntuario: null, calibracoes: null, livroEntradas: null, livroUltima: null,
    ...extra,
  };
}

describe('a tabela de acentos do bundle é a MESMA do banco', () => {
  it('bate caractere a caractere com busca_index_indices.sql', () => {
    const sql = readFileSync('supabase/busca_index_indices.sql', 'utf8');
    // A chamada no SQL é `translate(lower(...), '<de>', '<para>')`.
    const m = sql.match(/'([áàâãäéèêëíìîïóòôõöúùûüçñ]+)',\s*'([a-z]+)'/);
    expect(m, 'não achei a chamada translate() no SQL').toBeTruthy();
    const [, de, para] = m!;

    for (let i = 0; i < de.length; i++) {
      expect(normalizar(de[i]), `o caractere ${de[i]} normaliza diferente no bundle`).toBe(para[i]);
    }
  });

  it('a mesma tabela também está na função f9_normalizar da consulta', () => {
    const sql = readFileSync('supabase/busca_consulta.sql', 'utf8');
    const m = sql.match(/'([áàâãäéèêëíìîïóòôõöúùûüçñ]+)',\s*'([a-z]+)'/);
    expect(m).toBeTruthy();
    const [, de, para] = m!;
    for (let i = 0; i < de.length; i++) expect(normalizar(de[i])).toBe(para[i]);
  });
});

describe('quem digita sem acento acha o dado com acento', () => {
  it('"frigorifico" acha "Frigorífico Beta"', () => {
    expect(casaTermo(eq({ clienteNome: 'Frigorífico Beta' }), 'frigorifico')).toBe(true);
  });

  it('"metalurgica" acha "Metalúrgica Silva"', () => {
    expect(casaTermo(eq({ fabricante: 'Metalúrgica Silva' }), 'metalurgica')).toBe(true);
  });

  it('e o contrário também: "válvula" acha "Valvula"', () => {
    expect(casaTermo(eq({ descricao: 'Valvula de seguranca' }), 'válvula')).toBe(true);
  });
});

describe('casa por PALAVRA, como o servidor — não por substring', () => {
  it('prefixo de palavra casa', () => {
    expect(casaTermo(eq({ fabricante: 'Bremer' }), 'brem')).toBe(true);
  });

  it('miolo de palavra NÃO casa', () => {
    // Se casasse, offline acharia o que online não acha. O servidor usa
    // tsquery com `:*`, que é prefixo — não `contains`.
    expect(casaTermo(eq({ fabricante: 'Bremer' }), 'reme')).toBe(false);
  });

  it('várias palavras exigem TODAS (E, não OU)', () => {
    const item = eq({ descricao: 'Vaso separador', fabricante: 'Werner' });
    expect(casaTermo(item, 'vaso werner')).toBe(true);
    expect(casaTermo(item, 'vaso schulz')).toBe(false);
  });

  it('termo vazio casa tudo', () => {
    expect(casaTermo(eq(), '')).toBe(true);
    expect(casaTermo(eq(), '   ')).toBe(true);
  });
});

describe('os campos que a Fase 8 provou não serem pesquisáveis', () => {
  it('FABRICANTE agora acha — era o achado G1', () => {
    expect(casaTermo(eq({ fabricante: 'Atlas Copco' }), 'atlas')).toBe(true);
  });

  it('nº de série acha pelo começo, ignorando o separador', () => {
    const item = eq({ numeroSerie: 'SN-0012/3456' });
    expect(casaTermo(item, 'SN0012')).toBe(true);
    expect(casaTermo(item, 'sn-0012')).toBe(true);
    expect(casaTermo(item, 'SN 0012')).toBe(true);
  });

  it('nº de série acha também pelo trecho numérico inteiro', () => {
    expect(casaTermo(eq({ numeroSerie: 'SN-00123456' }), '00123456')).toBe(true);
  });

  it('cliente e localização entram na busca', () => {
    expect(casaTermo(eq({ clienteNome: 'Usina Epsilon' }), 'epsilon')).toBe(true);
    expect(casaTermo(eq({ localizacao: 'Casa de Máquinas' }), 'maquinas')).toBe(true);
  });
});

describe('prefixo de TAG', () => {
  it('casa pelo começo, em qualquer caixa', () => {
    const item = eq({ tag: 'VP-024001' });
    expect(casaTermo(item, 'VP-024')).toBe(true);
    expect(casaTermo(item, 'vp-024')).toBe(true);
  });

  it('TAG com barra e espaço continua achável', () => {
    // `COMPRESSOR V8-15/200L` é nome de ativo real. Foi por causa dele que a
    // consulta virou RPC em vez de filtro do PostgREST.
    const item = eq({ tag: 'COMPRESSOR V8-15/200L' });
    expect(casaTermo(item, 'COMPRESSOR V8')).toBe(true);
    expect(casaTermo(item, 'compressor')).toBe(true);
  });
});
