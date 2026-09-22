/**
 * RASCUNHO ANTIGO ABRE MESMO COM O CACHE VAZIO (22/09/2026).
 *
 * ## O defeito que isto trava
 *
 * Clicar em "Continuar editando" num rascunho que não estava no cache daquele
 * aparelho piscava a URL do editor e voltava para a lista, **sem erro nenhum**.
 * Medido em produção: dos 5 rascunhos da organização de teste, 3 estavam no
 * cache e abriam; os 2 que faltavam eram exatamente os 2 que voltavam.
 *
 * ## Por que só o rascunho
 *
 * `carregarRelatorio` lê SÓ o cache (síncrono, nunca pergunta ao servidor), e
 * `carregarEquipamento(tag)` semeia os registros de relatório pelos ids do
 * ÍNDICE — onde o rascunho, por regra da 10B.1, não entra. Ninguém semeava o
 * registro dele. Relatório FINALIZADO nunca sofreu: está no índice.
 *
 * O teste roda com o cache VAZIO, que é a condição real de um aparelho novo,
 * uma aba nova ou um F5 depois do boot leve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = new Map<string, string>();
const servidor = new Map<string, unknown>();
let semeouComAsChaves: string[][] = [];
let semearFalha = false;

vi.mock('../../services/storage', () => ({
  ler: <T,>(chave: string): T | null => {
    const v = cache.get(chave);
    return v === undefined ? null : (JSON.parse(v) as T);
  },
  salvar: async () => {},
  // O resto da cadeia (`historicoRelatorios`) importa estes; o teste não os
  // exercita, mas o mock precisa oferecê-los.
  lerCru: () => null,
  excluirChave: async () => {},
  listarChavesDaTag: () => [],
  bloqueadoParaEscrita: () => false,
  // Semear TRAZ do servidor para o cache — é leitura, nunca escrita de dado novo.
  semearEquipamentoDetalhado: async (chaves: string[]) => {
    semeouComAsChaves.push(chaves);
    if (semearFalha) return { postas: 0, falhou: true };
    let postas = 0;
    for (const c of chaves) {
      if (servidor.has(c)) {
        cache.set(c, JSON.stringify(servidor.get(c)));
        postas++;
      }
    }
    return { postas, falhou: false };
  },
}));

import { abrirRelatorio, avisoDaAbertura, chavesDaAbertura } from './aberturaRelatorio';

const ID = 'REL-1789004119133';
const TAG = 'ZZ-FASE3';
const CHAVE_REL = `nr13_rel_${ID}_${TAG}`;
const CHAVE_OVR = `nr13_ovr_${ID}_${TAG}`;

/** O rascunho real auditado, na forma como está no banco. */
const RASCUNHO = {
  id: ID,
  tagVaso: TAG,
  nome: 'RELATORIO DA IA.pdf',
  tipo: 'Inspeção Periódica',
  data: '10/09/2026',
  status: 'Rascunho',
  documentos: ['CAPA.html', 'SUMARIO.html', 'checklist2.html'],
  meta: { codigo: ID, containerOrigemId: 'cont1788990746084_78a10501' },
};

/** Os overrides posicionais do mesmo rascunho — eles precisam vir JUNTO. */
const OVERRIDES = {
  'instrumentos.0.certificado': { modo: 'manual', valor: 'CAL-2026/1187 — validade 12/03/2027', auto: '', em: '' },
  'instrumentos.1.certificado': { modo: 'manual', valor: 'Não instalado — não aplicável', auto: '', em: '' },
};

beforeEach(() => {
  cache.clear();
  servidor.clear();
  semeouComAsChaves = [];
  semearFalha = false;
});

describe('cache vazio — o caminho que falhava', () => {
  it('o rascunho está no SERVIDOR e não no cache: abre assim mesmo', async () => {
    servidor.set(CHAVE_REL, RASCUNHO);
    const r = await abrirRelatorio(ID, TAG);
    expect(r.estado).toBe('encontrado');
    expect(r.relatorio?.id).toBe(ID);
    expect(r.relatorio?.documentos).toHaveLength(3);
  });

  it('traz os OVERRIDES junto — senão o documento abriria sem o texto do engenheiro', async () => {
    servidor.set(CHAVE_REL, RASCUNHO);
    servidor.set(CHAVE_OVR, OVERRIDES);
    await abrirRelatorio(ID, TAG);
    expect(cache.has(CHAVE_OVR)).toBe(true);
    expect(semeouComAsChaves[0]).toEqual(chavesDaAbertura(ID, TAG));
  });

  it('pede ao servidor SÓ as chaves deste documento', async () => {
    servidor.set(CHAVE_REL, RASCUNHO);
    await abrirRelatorio(ID, TAG);
    expect(semeouComAsChaves).toHaveLength(1);
    expect(semeouComAsChaves[0]).toHaveLength(2);
    for (const c of semeouComAsChaves[0]) expect(c).toContain(ID);
  });
});

describe('o cache continua sendo o atalho', () => {
  it('estando no cache, NÃO pergunta ao servidor (é o caminho offline)', async () => {
    cache.set(CHAVE_REL, JSON.stringify(RASCUNHO));
    const r = await abrirRelatorio(ID, TAG);
    expect(r.estado).toBe('encontrado');
    expect(semeouComAsChaves).toHaveLength(0);
  });
});

describe('quando não dá para abrir, a tela precisa saber POR QUÊ', () => {
  it('documento que não existe em lugar nenhum = ausente', async () => {
    const r = await abrirRelatorio(ID, TAG);
    expect(r.estado).toBe('ausente');
    expect(r.relatorio).toBeNull();
    expect(avisoDaAbertura('ausente')).toContain('não foi encontrado');
  });

  it('falha de REDE = indisponível, nunca "não encontrado"', async () => {
    // Dizer "não encontrado" a quem está sem rede afirma uma exclusão que
    // ninguém fez — a mesma separação de `aberturaFicha` (§3-ter).
    servidor.set(CHAVE_REL, RASCUNHO);
    semearFalha = true;
    const r = await abrirRelatorio(ID, TAG);
    expect(r.estado).toBe('indisponivel');
    expect(avisoDaAbertura('indisponivel')).toContain('conexão');
  });

  it('id ou tag vazios não viram consulta ao servidor', async () => {
    expect((await abrirRelatorio('', TAG)).estado).toBe('ausente');
    expect((await abrirRelatorio(ID, '')).estado).toBe('ausente');
    expect(semeouComAsChaves).toHaveLength(0);
  });
});

describe('nada é reescrito', () => {
  it('semear só TRAZ: o valor do servidor chega igual ao cache', async () => {
    servidor.set(CHAVE_REL, RASCUNHO);
    await abrirRelatorio(ID, TAG);
    expect(JSON.parse(cache.get(CHAVE_REL)!)).toEqual(RASCUNHO);
    // E o servidor não foi tocado.
    expect(servidor.get(CHAVE_REL)).toEqual(RASCUNHO);
  });

  it('o rascunho reabre igual na segunda vez, agora pelo cache', async () => {
    servidor.set(CHAVE_REL, RASCUNHO);
    const a = await abrirRelatorio(ID, TAG);
    const b = await abrirRelatorio(ID, TAG);
    expect(b.relatorio).toEqual(a.relatorio);
    expect(semeouComAsChaves).toHaveLength(1);
  });
});

describe('relatório FINALIZADO continua pelo caminho de sempre', () => {
  it('estando no cache pelo índice, abre sem consulta nova', async () => {
    const finalizado = { ...RASCUNHO, status: 'Aprovado', pdfRef: { path: 'x.pdf' } };
    cache.set(CHAVE_REL, JSON.stringify(finalizado));
    const r = await abrirRelatorio(ID, TAG);
    expect(r.estado).toBe('encontrado');
    expect(r.relatorio?.status).toBe('Aprovado');
    expect(semeouComAsChaves).toHaveLength(0);
  });
});
