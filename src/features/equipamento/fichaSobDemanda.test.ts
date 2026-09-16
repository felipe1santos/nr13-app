/**
 * A FICHA ABRE SEM DEPENDER DO CACHE — 16/09/2026.
 *
 * ## O defeito que este arquivo trava
 *
 * `/equipamento/:tag` lia a ficha só do cache e, não achando, fazia
 * `navigate('/equipamentos')`. Com o boot leve (9G.3) o cache nasce sem nenhuma
 * `nr13_info_` — `essencial.ts` não a traz, e não pode trazer: a lista de
 * essenciais não cresce com o parque. O resultado na tela era o clique que
 * "pisca e volta".
 *
 * O teste roda com o cache VAZIO de propósito, que é o estado de um aparelho
 * novo, de uma aba nova e de um F5.
 *
 * ## O que ele NÃO deixa voltar
 *
 * Consertar isso hidratando a organização — o caminho que a Fase 8 mediu em
 * ~4 min e 1,63 GB. Por isso cada caso confere TAMBÉM o que foi pedido ao
 * servidor: as chaves de uma TAG, e nada além.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'fake-indexeddb/auto';

const servidor = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  pedidos: [] as string[][],
  falhar: false,
}));

vi.mock('../../services/supabase', async () => {
  const real = await vi.importActual<typeof import('../../services/supabase')>('../../services/supabase');
  return {
    ...real,
    escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: (_col: string, chaves: string[]) => {
              servidor.pedidos.push(chaves);
              if (servidor.falhar) return Promise.resolve({ data: null, error: { message: 'offline' } });
              return Promise.resolve({
                data: servidor.linhas.filter((l) => chaves.includes(String(l.chave))),
                error: null,
              });
            },
          }),
        }),
      }),
    },
  };
});

const ORG = '22222222-2222-2222-2222-222222222222';
const TAG = 'ZZ-FICHA-01';

import * as cache from '../../services/cacheLocal';
import { definirArmazenamentoV2, zerarFlagEmMemoria } from '../../services/flag';
import { ler } from '../../services/storage';
import { aberturaDoCache, abrirFicha } from './aberturaFicha';
import { chavesDoEquipamento } from './equipamentoService';

function linha(chave: string, valor: unknown, versao = 2) {
  return {
    chave,
    valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    versao,
    atualizado_em: '2026-09-16T10:00:00.000Z',
    dispositivo: 'servidor',
    deletado_em: null,
  };
}

function infoDe(tag: string) {
  return linha(`nr13_info_${tag}`, { tag, tipo: 'vaso', descricao: 'Vaso de teste' });
}

/** Um aparelho recém-aberto: cache vazio, como depois do boot leve. */
async function aparelhoNovo() {
  cache.zerarMemoria();
  cache.definirOrg(ORG);
  servidor.pedidos = [];
}

beforeEach(async () => {
  zerarFlagEmMemoria();
  definirArmazenamentoV2(true);
  servidor.falhar = false;
  servidor.linhas = [
    infoDe(TAG),
    linha(`nr13_cat_${TAG}`, { catFinal: 'II' }),
    linha(`nr13_pref_unidade_${TAG}`, 'PETROBRAS'),
    infoDe('ZZ-FICHA-02'),
    infoDe('COMPRESSOR V8-15/200L'),
    infoDe('ACA 2002'),
    infoDe('vp-legado-minusculo'),
  ];
  await aparelhoNovo();
});

describe('CASO 1 · o equipamento já está no cache', () => {
  it('abre na hora, sem ir ao servidor', async () => {
    await abrirFicha(TAG); // semeia
    servidor.pedidos = [];

    const r = aberturaDoCache(TAG);
    expect(r.estado).toBe('encontrado');
    // Nem uma requisição: o cache continua sendo ATALHO, e é ele o caminho
    // offline do CASO 8.
    expect(servidor.pedidos).toHaveLength(0);
  });
});

describe('CASO 2 · o equipamento NÃO está no cache', () => {
  it('parte do zero: o cache não tem a ficha', () => {
    expect(ler(`nr13_info_${TAG}`)).toBeNull();
    // E o estado síncrono NUNCA é "ausente" — isso só se afirma depois de
    // perguntar ao servidor.
    expect(aberturaDoCache(TAG).estado).toBe('carregando');
  });

  it('busca pontual pela TAG e a ficha abre', async () => {
    const r = await abrirFicha(TAG);
    expect(r.estado).toBe('encontrado');
    if (r.estado === 'encontrado') {
      expect(r.tag).toBe(TAG);
      expect(r.info.descricao).toBe('Vaso de teste');
    }
    // E o resto da ficha veio junto, pela MESMA semeadura das outras telas.
    expect(ler<{ catFinal: string }>(`nr13_cat_${TAG}`)?.catFinal).toBe('II');
    expect(ler<string>(`nr13_pref_unidade_${TAG}`)).toBe('PETROBRAS');
  });
});

describe('CASOS 3 e 4 · F5 e URL colada em aba nova', () => {
  it('são o mesmo caminho do CASO 2 — cache vazio, ficha aberta', async () => {
    await abrirFicha(TAG);
    expect(ler(`nr13_info_${TAG}`)).not.toBeNull();

    // F5 / aba nova: processo novo, `Map` zerado, nada de sessão anterior.
    await aparelhoNovo();
    expect(ler(`nr13_info_${TAG}`)).toBeNull();

    const r = await abrirFicha(TAG);
    expect(r.estado).toBe('encontrado');
  });
});

describe('CASO 5 · equipamento inexistente', () => {
  it('estado "ausente", e não um redirecionamento', async () => {
    const r = await abrirFicha('ZZ-NAO-EXISTE');
    expect(r.estado).toBe('ausente');
  });

  it('repetir NÃO entra em laço: a resposta é estável', async () => {
    const a = await abrirFicha('ZZ-NAO-EXISTE');
    const b = await abrirFicha('ZZ-NAO-EXISTE');
    expect(a.estado).toBe('ausente');
    expect(b.estado).toBe('ausente');
  });
});

describe('CASO 6 · TAG de outra organização', () => {
  it('não vaza informação: responde igual a uma TAG inexistente', async () => {
    // A consulta é filtrada por `escopoStorageAtual()` e pelas policies; a
    // linha de outra organização simplesmente não volta. O estado precisa ser
    // o MESMO de "não existe" — um "sem permissão" confirmaria a existência do
    // equipamento alheio.
    servidor.linhas = servidor.linhas.filter((l) => !String(l.chave).includes('ZZ-DE-OUTRA-ORG'));
    const r = await abrirFicha('ZZ-DE-OUTRA-ORG');
    expect(r.estado).toBe('ausente');
    expect(JSON.stringify(r)).not.toContain('permiss');
    expect(ler('nr13_info_ZZ-DE-OUTRA-ORG')).toBeNull();
  });
});

describe('CASO 7 · organização com muitos equipamentos', () => {
  it('pede as chaves de UMA TAG — nunca o catálogo', async () => {
    await abrirFicha(TAG);

    const pedidas = servidor.pedidos.flat();
    for (const chave of chavesDoEquipamento(TAG)) expect(pedidas).toContain(chave);
    // Nenhuma chave de outro equipamento, e nenhuma consulta por prefixo.
    expect(pedidas.some((c) => c.includes('ZZ-FICHA-02'))).toBe(false);
    expect(ler('nr13_info_ZZ-FICHA-02')).toBeNull();
    // O tamanho do pedido é o tamanho de `POR_TAG`, não o do parque.
    expect(pedidas.length).toBeLessThanOrEqual(chavesDoEquipamento(TAG).length);
  });

  it('não existe caminho de hidratação integral na abertura da ficha', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/features/equipamento/aberturaFicha.ts'), 'utf8');
    expect(fonte).not.toContain('lerTudo');
    expect(fonte).not.toContain('listarPagina');
    expect(fonte).not.toContain('hidratacaoCompletaForcada');
  });
});

describe('CASO 8 · offline com o equipamento no aparelho', () => {
  it('abre igual, sem rede', async () => {
    await abrirFicha(TAG);
    servidor.falhar = true;
    servidor.pedidos = [];

    const r = await abrirFicha(TAG);
    expect(r.estado).toBe('encontrado');
    expect(servidor.pedidos).toHaveLength(0);
  });
});

describe('CASO 9 · offline e o equipamento não está no aparelho', () => {
  it('diz "indisponível", e NÃO "não encontrado"', async () => {
    servidor.falhar = true;
    const r = await abrirFicha(TAG);
    // A diferença é a diferença entre informar e mentir: afirmar "não
    // encontrado" sem ter conseguido perguntar é anunciar uma exclusão que
    // ninguém fez.
    expect(r.estado).toBe('indisponivel');
  });

  it('repetir é estável e não vira laço de navegação', async () => {
    servidor.falhar = true;
    expect((await abrirFicha(TAG)).estado).toBe('indisponivel');
    expect((await abrirFicha(TAG)).estado).toBe('indisponivel');

    // E quando a rede volta, a mesma chamada resolve — é o que o botão
    // "Tentar de novo" faz.
    servidor.falhar = false;
    expect((await abrirFicha(TAG)).estado).toBe('encontrado');
  });
});

describe('IDENTIDADE DA TAG · a chave real, não a que parece', () => {
  it('TAG com hífen', async () => {
    const r = await abrirFicha('ZZ-FICHA-02');
    expect(r.estado).toBe('encontrado');
  });

  it('TAG com barra — a rota codifica, a chave não muda', async () => {
    // `rotaEquipamento` faz `encodeURIComponent`, e `useParams` devolve já
    // decodificado. O que chega aqui é a TAG crua.
    const r = await abrirFicha('COMPRESSOR V8-15/200L');
    expect(r.estado).toBe('encontrado');
  });

  it('TAG com espaço', async () => {
    const r = await abrirFicha('ACA 2002');
    expect(r.estado).toBe('encontrado');
  });

  it('URL digitada à mão em minúsculas resolve pela TAG normalizada', async () => {
    const r = await abrirFicha('zz-ficha-02');
    expect(r.estado).toBe('encontrado');
    // E devolve a TAG REAL: a tela monta as chaves com ela, não com o texto da
    // URL — senão a ficha abriria e gravaria em `nr13_*_zz-ficha-02`.
    if (r.estado === 'encontrado') expect(r.tag).toBe('ZZ-FICHA-02');
  });

  it('sobra de cópia/colagem (espaço-duro, espaços nas pontas) resolve', async () => {
    const r = await abrirFicha('  ZZ-FICHA-02  ');
    expect(r.estado).toBe('encontrado');
    if (r.estado === 'encontrado') expect(r.tag).toBe('ZZ-FICHA-02');
  });

  it('TAG legada fora da forma normalizada continua alcançável', async () => {
    // Equipamento gravado antes de `normalizarTag` existir. A tentativa EXATA
    // vem primeiro justamente por ele: normalizar antes de perguntar deixaria
    // a ficha dele inalcançável para sempre.
    const r = await abrirFicha('vp-legado-minusculo');
    expect(r.estado).toBe('encontrado');
    if (r.estado === 'encontrado') expect(r.tag).toBe('vp-legado-minusculo');
  });
});

describe('A PÁGINA não devolve ninguém para a lista por causa de cache', () => {
  const bruto = readFileSync(join(process.cwd(), 'src/pages/Equipamento.tsx'), 'utf8');
  // Sem as linhas de comentário: o cabeçalho CITA o padrão antigo para explicar
  // o defeito, e citar não é executar.
  const fonte = bruto
    .split(String.fromCharCode(10))
    .filter((l) => !/^[ ]*([/][*]|[*]|[/][/])/.test(l))
    .join(String.fromCharCode(10));

  it('o único `navigate` restante é o da EXCLUSÃO', () => {
    const ocorrencias = fonte.match(/navigate\('\/equipamentos'\)/g) ?? [];
    expect(ocorrencias).toHaveLength(1);
    // E ele está dentro de `excluirEquipamento` — depois de apagar, a ficha
    // não existe mais, e voltar para a lista é o certo.
    const trecho = fonte.slice(fonte.indexOf('async function excluirEquipamento'));
    expect(trecho).toContain("navigate('/equipamentos')");
  });

  it('não sobrou nenhum "sem info → redireciona"', () => {
    expect(fonte).not.toMatch(/if \(!info\) navigate/);
  });

  it('os quatro estados da abertura estão desenhados', () => {
    expect(bruto).toContain('Carregando equipamento');
    expect(bruto).toContain('Equipamento não encontrado');
    expect(bruto).toContain('Sem conexão com o servidor');
    expect(bruto).toContain('Tentar de novo');
  });
});
