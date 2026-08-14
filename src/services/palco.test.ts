import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn() },
  escopoStorageAtual: vi.fn(),
  idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { definirOrg, gravarAtomico, obterRegistro, zerarMemoria } from './cacheLocal';
import { zerarPosseEmMemoria, adquirirTrava, donoAtual, type ContextoMontagem } from './palcoTrava';
import {
  ORCAMENTO_DOC,
  ORCAMENTO_IMG,
  ORCAMENTO_EFETIVO,
  MARGEM_METADADOS,
  PLANO_DEGRADACAO,
  CHAVE_MANIFESTO,
  tamanhoUtf16,
  ehChaveDeFoto,
  orcar,
  degradarAteCaber,
  materializar,
  limparPalco,
  liberarPalcoAoSair,
  coletarItens,
  montarPalcoDaTag,
  zerarMontagemEmMemoria,
  type AdaptadorFoto,
  type ItemPalco,
} from './palco';

const ORG = '11111111-1111-1111-1111-111111111111';
const TAG = 'ACA 2040';

const ctx = (tabId: string, nonce = `n-${tabId}`): ContextoMontagem => ({
  orgId: ORG,
  tabId,
  relatorioId: 'rel-1',
  tag: TAG,
  nonce,
});

const reg = (valor: string) => ({
  valor,
  versao: 1,
  atualizadoEm: '2026-08-05T12:00:00.000Z',
  dispositivo: 'd1',
});

/** Adaptador falso: cada passo reduz pela qualidade; largura reduz mais. */
function adaptador(tamanhoInicial: number): AdaptadorFoto & { chamadas: string[] } {
  const tamanhos = new Map<string, number>();
  return {
    chamadas: [] as string[],
    maiorFoto(valor: string) {
      return tamanhos.get(valor) ?? tamanhoInicial;
    },
    async recomprimir(valor: string, passo) {
      this.chamadas.push(`q${passo.qualidade}/l${passo.largura ?? 'orig'}`);
      const atual = tamanhos.get(valor) ?? tamanhoInicial;
      const fator = passo.largura === null ? passo.qualidade : passo.qualidade * 0.5;
      const novo = Math.round(atual * fator);
      const saida = 'f'.repeat(Math.max(1, Math.round(novo / 2)));
      tamanhos.set(saida, novo);
      return saida;
    },
  };
}

/** Adaptador que nunca reduz: força o plano a se esgotar. */
const teimoso: AdaptadorFoto = {
  maiorFoto: () => ORCAMENTO_IMG * 3,
  recomprimir: async (v) => v,
};

/** Adaptador sem foto nenhuma. */
const semFoto: AdaptadorFoto = { maiorFoto: () => 0, recomprimir: async (v) => v };

const item = (chave: string, chars: number): ItemPalco => ({ chave, valor: 'x'.repeat(chars) });

beforeEach(async () => {
  zerarMemoria();
  zerarPosseEmMemoria();
  zerarMontagemEmMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
});

afterEach(() => {
  zerarPosseEmMemoria();
  zerarMontagemEmMemoria();
});

describe('orçamento — custo real em UTF-16, chave inclusa', () => {
  it('conta chave e valor, 2 bytes por unidade', () => {
    expect(tamanhoUtf16('abc', 'de')).toBe((3 + 2) * 2);
  });

  it('a chave pesa: duas chaves de nomes diferentes têm custos diferentes', () => {
    expect(tamanhoUtf16('nr13_info_A', 'v')).toBeLessThan(
      tamanhoUtf16('nr13_assinantes_pront_A', 'v'),
    );
  });

  it('o orçamento do documento não é o teto de 5 MB', () => {
    expect(ORCAMENTO_DOC).toBe(3_400 * 1024);
    expect(ORCAMENTO_DOC).toBeLessThan(5 * 1024 * 1024);
  });

  it('há margem reservada para metadados', () => {
    expect(MARGEM_METADADOS).toBeGreaterThan(0);
    expect(ORCAMENTO_EFETIVO).toBe(ORCAMENTO_DOC - MARGEM_METADADOS);
  });

  it('documento abaixo do orçamento cabe', () => {
    const r = orcar([item('nr13_info_A', 1000)]);
    expect(r).toMatchObject({ cabe: true });
  });

  it('documento acima é recusado, com os maiores em ordem decrescente', () => {
    const r = orcar([
      item('nr13_fotos_A', ORCAMENTO_EFETIVO),
      item('nr13_docs_A', 500 * 1024),
      item('nr13_info_A', 5),
    ]);
    expect(r).toMatchObject({ tipo: 'acima_do_orcamento' });
    if ('maiores' in r) {
      expect(r.maiores[0].chave).toBe('nr13_fotos_A');
      expect(r.maiores[1].chave).toBe('nr13_docs_A');
      expect(r.total).toBeGreaterThan(r.orcamento);
    }
  });

  it('orçar não escreve nada', () => {
    orcar([item('nr13_info_A', 1000)]);
    expect(localStorage.length).toBe(0);
  });
});

describe('degradação — ordem determinística', () => {
  it('o plano é exatamente três passos de qualidade e três de largura', () => {
    expect(PLANO_DEGRADACAO).toEqual([
      { qualidade: 0.6, largura: null },
      { qualidade: 0.45, largura: null },
      { qualidade: 0.35, largura: null },
      { qualidade: 0.35, largura: 900 },
      { qualidade: 0.35, largura: 700 },
      { qualidade: 0.35, largura: 560 },
    ]);
  });

  it('reconhece chave de foto', () => {
    expect(ehChaveDeFoto('nr13_fotos_ACA 2040')).toBe(true);
    expect(ehChaveDeFoto('nr13_info_ACA 2040')).toBe(false);
  });

  it('imagem EXATAMENTE no limite não é degradada', async () => {
    const ad: AdaptadorFoto = { maiorFoto: () => ORCAMENTO_IMG, recomprimir: async (v) => v };
    const espia = vi.spyOn(ad, 'recomprimir');
    const r = await degradarAteCaber([{ chave: 'nr13_fotos_A', valor: 'x' }], ad);
    expect(r.cabe).toBe(true);
    expect(espia).not.toHaveBeenCalled();
  });

  it('imagem 1 byte acima do limite é degradada', async () => {
    const ad = adaptador(ORCAMENTO_IMG + 1);
    const r = await degradarAteCaber([{ chave: 'nr13_fotos_A', valor: 'x' }], ad);
    expect(r.cabe).toBe(true);
    expect(ad.chamadas[0]).toBe('q0.6/lorig');
  });

  it('imagem muito acima percorre os passos NA ORDEM', async () => {
    const ad = adaptador(ORCAMENTO_IMG * 50);
    await degradarAteCaber([{ chave: 'nr13_fotos_A', valor: 'x' }], ad);
    expect(ad.chamadas.slice(0, 4)).toEqual([
      'q0.6/lorig',
      'q0.45/lorig',
      'q0.35/lorig',
      'q0.35/l900',
    ]);
  });

  it('esgotado o plano e ainda acima: RECUSA identificando a imagem', async () => {
    const r = await degradarAteCaber([{ chave: 'nr13_fotos_A', valor: 'x' }], teimoso);
    expect(r.cabe).toBe(false);
    if (!r.cabe) {
      expect(r.falha.tipo).toBe('imagem_indegradavel');
      if (r.falha.tipo === 'imagem_indegradavel') {
        expect(r.falha.chave).toBe('nr13_fotos_A');
        expect(r.falha.limite).toBe(ORCAMENTO_IMG);
      }
    }
  });

  it('documento que segue acima de 3.400 KB é recusado', async () => {
    const grande: ItemPalco = { chave: 'nr13_info_A', valor: 'x'.repeat(ORCAMENTO_DOC) };
    const r = await degradarAteCaber([grande], semFoto);
    expect(r.cabe).toBe(false);
    if (!r.cabe) expect(r.falha.tipo).toBe('acima_do_orcamento');
  });

  it('erro ao recomprimir é reportado com a chave, não engolido', async () => {
    const quebrado: AdaptadorFoto = {
      maiorFoto: () => ORCAMENTO_IMG * 2,
      recomprimir: async () => {
        throw new Error('canvas indisponível');
      },
    };
    const r = await degradarAteCaber([{ chave: 'nr13_fotos_A', valor: 'x' }], quebrado);
    expect(r.cabe).toBe(false);
    if (!r.cabe && r.falha.tipo === 'erro_ao_resolver_imagem') {
      expect(r.falha.chave).toBe('nr13_fotos_A');
      expect(r.falha.erro.detalhe.mensagemOriginal).toBe('canvas indisponível');
    }
  });

  it('NÃO altera os itens de entrada', async () => {
    const entrada: ItemPalco[] = [{ chave: 'nr13_fotos_A', valor: 'original' }];
    await degradarAteCaber(entrada, adaptador(ORCAMENTO_IMG * 10));
    expect(entrada[0].valor).toBe('original');
  });
});

describe('materialização — tudo ou nada', () => {
  it('sucesso grava todas as chaves e o manifesto', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    const r = materializar(c, [item('nr13_info_A', 10), item('nr13_calc_A', 10)]);

    expect(r.ok).toBe(true);
    expect(localStorage.getItem('nr13_info_A')).not.toBeNull();
    expect(localStorage.getItem('nr13_calc_A')).not.toBeNull();
    expect(localStorage.getItem(CHAVE_MANIFESTO)).not.toBeNull();
  });

  const posicoes: Array<[string, number]> = [
    ['primeiro', 1],
    ['do meio', 2],
    ['último', 3],
  ];

  for (const [nome, falhaNo] of posicoes) {
    it(`falha no ${nome} setItem restaura tudo e não deixa nada parcial`, async () => {
      const c = ctx('aba-1');
      await adquirirTrava(c);
      localStorage.setItem('nr13_minha_empresa', 'ANTERIOR');

      const real = localStorage.setItem.bind(localStorage);
      let n = 0;
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
        if (k.startsWith('nr13_') && k !== CHAVE_MANIFESTO && ++n === falhaNo) {
          const e = new Error('cheio');
          e.name = 'QuotaExceededError';
          throw e;
        }
        real(k, v);
      });

      const r = materializar(c, [
        { chave: 'nr13_minha_empresa', valor: 'NOVO' },
        item('nr13_info_A', 10),
        item('nr13_calc_A', 10),
      ]);
      spy.mockRestore();

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.falha.tipo).toBe('escrita_falhou');

      // Chave preexistente restaurada ao valor original.
      expect(localStorage.getItem('nr13_minha_empresa')).toBe('ANTERIOR');
      // Chaves novas removidas.
      expect(localStorage.getItem('nr13_info_A')).toBeNull();
      expect(localStorage.getItem('nr13_calc_A')).toBeNull();
      expect(localStorage.getItem(CHAVE_MANIFESTO)).toBeNull();
    });
  }

  it('a falha aponta a chave e preserva o detalhe técnico', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k === 'nr13_info_A') {
        const e = new Error('cheio');
        e.name = 'QuotaExceededError';
        throw e;
      }
      real(k, v);
    });

    const r = materializar(c, [item('nr13_info_A', 10)]);
    spy.mockRestore();

    if (!r.ok && r.falha.tipo === 'escrita_falhou') {
      expect(r.falha.chave).toBe('nr13_info_A');
      expect(r.falha.erro.categoria).toBe('cota');
      expect(r.falha.erro.detalhe.mensagemOriginal).toBe('cheio');
    }
  });
});

describe('limpeza — só o dono, só as chaves da montagem', () => {
  it('a aba proprietária limpa e restaura o que existia antes', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    localStorage.setItem('nr13_minha_empresa', 'ANTERIOR');
    materializar(c, [{ chave: 'nr13_minha_empresa', valor: 'DO PALCO' }, item('nr13_info_A', 10)]);

    expect(limparPalco(c)).toEqual({ ok: true });
    expect(localStorage.getItem('nr13_minha_empresa')).toBe('ANTERIOR'); // restaurada
    expect(localStorage.getItem('nr13_info_A')).toBeNull(); // criada pela montagem
    expect(localStorage.getItem(CHAVE_MANIFESTO)).toBeNull();
    expect(donoAtual()).toBeNull(); // trava liberada
  });

  it('outra aba é RECUSADA e o palco fica intacto', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    materializar(c, [item('nr13_info_A', 10)]);

    expect(limparPalco(ctx('aba-2', 'n-outro'))).toEqual({ ok: false, motivo: 'nao_e_dono' });
    expect(localStorage.getItem('nr13_info_A')).not.toBeNull();
    expect(donoAtual()?.tabId).toBe('aba-1');
  });

  it('não faz varredura por prefixo: chave alheia sobrevive', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    localStorage.setItem('nr13_usuario_logado', 'a@b.com');
    localStorage.setItem('nr13_dispositivo_id', 'disp-9');
    materializar(c, [item('nr13_info_A', 10)]);

    limparPalco(c);
    expect(localStorage.getItem('nr13_usuario_logado')).toBe('a@b.com');
    expect(localStorage.getItem('nr13_dispositivo_id')).toBe('disp-9');
  });

  it('sem snapshot em memória (página recarregou), NÃO apaga chave preexistente', async () => {
    const c = ctx('aba-1');
    await adquirirTrava(c);
    localStorage.setItem('nr13_minha_empresa', 'ANTERIOR');
    materializar(c, [{ chave: 'nr13_minha_empresa', valor: 'DO PALCO' }, item('nr13_info_A', 10)]);

    zerarMontagemEmMemoria(); // simula recarga da página

    limparPalco(c);
    expect(localStorage.getItem('nr13_info_A')).toBeNull(); // criada: removida
    expect(localStorage.getItem('nr13_minha_empresa')).not.toBeNull(); // preexistente: mantida
  });
});

describe('conteúdo do palco', () => {
  it('leva as chaves da TAG e as globais', async () => {
    await gravarAtomico([
      { chave: `nr13_info_${TAG}`, registro: reg('{"tag":"A"}') },
      { chave: `nr13_calc_${TAG}`, registro: reg('{}') },
      { chave: 'nr13_minha_empresa', registro: reg('{"nome":"X"}') },
      { chave: 'nr13_info_OUTRA', registro: reg('{}') },
    ]);

    const chaves = coletarItens(TAG).map((i) => i.chave).sort();
    expect(chaves).toEqual([`nr13_calc_${TAG}`, `nr13_info_${TAG}`, 'nr13_minha_empresa']);
  });

  it('NÃO leva chaves que nenhum template lê', async () => {
    await gravarAtomico([
      { chave: `nr13_info_${TAG}`, registro: reg('{}') },
      { chave: `nr13_docs_${TAG}`, registro: reg('x'.repeat(1000)) },
      // PDF do fabricante: 10 MB numa conta real, e nenhum template o lê.
      { chave: `nr13_pront_fab_${TAG}`, registro: reg('x'.repeat(1000)) },
      // Componentes de calibração: cada válvula/manômetro guarda uma foto
      // base64. Numa conta real (gabriel.dadona, 11/08/2026) eram 2.518 KB de
      // 3.959 KB — sozinha essa chave derrubava o relatório inteiro, e nenhum
      // template a lê: a foto só aparece no card da tela de Calibrações.
      { chave: `nr13_componentes_cal_${TAG}`, registro: reg('x'.repeat(1000)) },
      { chave: `nr13_lotes_cal_${TAG}`, registro: reg('x'.repeat(1000)) },
    ]);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves).not.toContain(`nr13_docs_${TAG}`);
    expect(chaves).not.toContain(`nr13_pront_fab_${TAG}`);
    expect(chaves).not.toContain(`nr13_componentes_cal_${TAG}`);
    expect(chaves).not.toContain(`nr13_lotes_cal_${TAG}`);
    expect(chaves).toContain(`nr13_info_${TAG}`);
  });

  it('a chave que o template CERTIFICADO-CAL lê de fato continua no palco', async () => {
    // Guarda contra excesso de zelo: `nr13_calibracoes_<TAG>` é irmã das duas
    // acima, mas alimenta o vencimento e o Portal do Cliente — tirá-la exigiria
    // a mesma varredura de `public/` que justificou tirar as outras.
    await gravarAtomico([{ chave: `nr13_calibracoes_${TAG}`, registro: reg('[]') }]);
    expect(coletarItens(TAG).map((i) => i.chave)).toContain(`nr13_calibracoes_${TAG}`);
  });
});

/**
 * Regressão de 13/08/2026. Medido na conta gabriel.dadona, em produção, com o
 * documento montado: o palco levava 14 chaves e `nr13_relatorio_meta_atual` não
 * era uma delas. Sintomas que isso produzia, todos relatados como bugs
 * separados: capa com "Nº RELATÓRIO: -", "DATA INSPEÇÃO: -" e "VALIDADE: -";
 * folha INSPECOES sem marcar natureza/tipo de exame/resultado; bloco
 * "Instrumento de Medição Utilizado" do ULTRASSOM com "--"; e certificado de
 * calibração em branco.
 */
describe('chaves que os templates leem e não eram materializadas', () => {
  it('leva a meta do relatório — é dela que saem código, datas e natureza', async () => {
    await gravarAtomico([
      { chave: 'nr13_relatorio_meta_atual', registro: reg('{"codigo":"REL-1"}') },
    ]);
    expect(coletarItens(TAG).map((i) => i.chave)).toContain('nr13_relatorio_meta_atual');
  });

  it('leva o prontuário atual — lido pelas 6 folhas e pelo rodapé', async () => {
    await gravarAtomico([{ chave: 'nr13_prontuario_atual', registro: reg('{"tag":"A"}') }]);
    expect(coletarItens(TAG).map((i) => i.chave)).toContain('nr13_prontuario_atual');
  });

  it('leva TODOS os certificados padrão: o ULTRASSOM varre o prefixo', async () => {
    // A folha percorre o localStorage inteiro atrás de `nr13_rastreab_`; filtrar
    // por TAG aqui devolveria "--" para o instrumento cadastrado sem vínculo.
    await gravarAtomico([
      { chave: 'nr13_rastreab_us-1', registro: reg('{"tipoInstrumento":"ultrassom"}') },
      { chave: 'nr13_rastreab_man-2', registro: reg('{"tipoInstrumento":"manometro"}') },
    ]);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves).toContain('nr13_rastreab_us-1');
    expect(chaves).toContain('nr13_rastreab_man-2');
  });

  it('leva o certificado padrão PODADO: o PDF não cabe no palco e ninguém o imprime', async () => {
    // Regressão de 14/08/2026, conta engyuricesar. Dois registros
    // `nr13_rastreab_` ocupavam 794 KB e 614 KB de um orçamento de 3.368 KB e
    // recusavam o relatório inteiro. A poda existia desde 30/07 (§2-bis) mas
    // vivia dentro do `storageV1`: na v2 o `Map` guarda o valor cru do Supabase.
    const pdf = 'JVBERi0xLjQK' + 'A'.repeat(400_000);
    await gravarAtomico([
      {
        chave: 'nr13_rastreab_us-pesado',
        registro: reg(
          JSON.stringify({ tipoInstrumento: 'ultrassom', nome: 'Krautkramer', validade: '2027-01-01', pdfBase64: pdf }),
        ),
      },
    ]);

    const item = coletarItens(TAG).find((i) => i.chave === 'nr13_rastreab_us-pesado')!;
    const obj = JSON.parse(item.valor);
    expect(obj.pdfBase64).toBe('');
    expect(obj.temPdf).toBe(true);
    // Os metadados que a folha ULTRASSOM imprime continuam lá.
    expect(obj.nome).toBe('Krautkramer');
    expect(obj.validade).toBe('2027-01-01');
    expect(item.valor.length).toBeLessThan(1_000);
    // E o arquivo NÃO foi tocado no cache: quem monta o PDF do relatório é o
    // React, por `resolverPdf()`, sobre o registro completo.
    expect(JSON.parse(obterRegistro('nr13_rastreab_us-pesado')!.valor).pdfBase64).toBe(pdf);
  });

  it('leva os certificados de calibração DESTA TAG, e só eles', async () => {
    await gravarAtomico([
      { chave: `nr13_calibracoes_${TAG}`, registro: reg('[{"id":"cal-1"},{"id":"cal-2"}]') },
      { chave: 'nr13_calibracoes_OUTRA', registro: reg('[{"id":"cal-9"}]') },
      { chave: 'nr13_calibracao_item_cal-1', registro: reg('{"id":"cal-1"}') },
      { chave: 'nr13_calibracao_item_cal-2', registro: reg('{"id":"cal-2"}') },
      { chave: 'nr13_calibracao_item_cal-9', registro: reg('{"id":"cal-9"}') },
    ]);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves).toContain('nr13_calibracao_item_cal-1');
    expect(chaves).toContain('nr13_calibracao_item_cal-2');
    // Escopo de id é global por organização: varrer o prefixo traria o parque
    // inteiro para dentro do orçamento de 3.368 KB.
    expect(chaves).not.toContain('nr13_calibracao_item_cal-9');
  });

  it('lista de calibrações corrompida não derruba a montagem', async () => {
    await gravarAtomico([
      { chave: `nr13_calibracoes_${TAG}`, registro: reg('não é json') },
      { chave: `nr13_info_${TAG}`, registro: reg('{}') },
    ]);
    expect(coletarItens(TAG).map((i) => i.chave)).toContain(`nr13_info_${TAG}`);
  });

  it('NÃO leva o histórico de relatórios: cresce sem teto', async () => {
    // 224 KB na conta gabriel.dadona, e mais um relatório a cada emissão. Ver o
    // comentário em FORA_DO_PALCO.
    await gravarAtomico([{ chave: 'nr13_historico_relatorios', registro: reg('[]') }]);
    expect(coletarItens(TAG).map((i) => i.chave)).not.toContain('nr13_historico_relatorios');
  });

  it('NÃO leva os relatórios salvos nem o índice — e AINDA leva a meta atual', async () => {
    // Regressão de 14/08/2026. Os registros por relatório (`nr13_rel_<id>_<TAG>`)
    // são de escopo de TAG, então `chavesDaTag` os traria sozinho: cada um pesa
    // ~125 KB de snapshots que nenhuma folha imprime.
    //
    // A segunda metade do teste é a que importa mais: o prefixo tinha que ser
    // `nr13_rel_` justamente para que excluí-lo NÃO excluísse
    // `nr13_relatorio_meta_atual`, cuja ausência deixou a CAPA com
    // "Nº RELATÓRIO: -" em 13/08/2026.
    await gravarAtomico([
      { chave: `nr13_rel_REL-1755000000000_${TAG}`, registro: reg('x'.repeat(1000)) },
      { chave: `nr13_historico_indice_${TAG}`, registro: reg('[]') },
      { chave: 'nr13_relatorio_meta_atual', registro: reg('{"codigo":"REL-1"}') },
      { chave: `nr13_info_${TAG}`, registro: reg('{}') },
    ]);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves).not.toContain(`nr13_rel_REL-1755000000000_${TAG}`);
    expect(chaves).not.toContain(`nr13_historico_indice_${TAG}`);
    expect(chaves).toContain('nr13_relatorio_meta_atual');
    expect(chaves).toContain(`nr13_info_${TAG}`);
  });

  it('não repete chave: valor anterior duplicado quebraria o rollback', async () => {
    await gravarAtomico([
      { chave: `nr13_calibracoes_${TAG}`, registro: reg('[{"id":"x"},{"id":"x"}]') },
      { chave: 'nr13_calibracao_item_x', registro: reg('{}') },
    ]);
    const chaves = coletarItens(TAG).map((i) => i.chave);
    expect(chaves.length).toBe(new Set(chaves).size);
  });
});

/**
 * Regressão de 13/08/2026, achada validando em produção: abrir um certificado
 * de calibração logo depois de recarregar a página com um relatório na tela
 * dava "Este relatório já está aberto em outra aba" — mesma aba, nada aberto.
 * O `tabId` mora em memória, então o F5 sorteia outro e a aba não reconhece o
 * próprio registro; sobrava esperar os 60s do TTL.
 */
describe('saída da página solta a trava', () => {
  it('pagehide libera o registro de posse', async () => {
    const alvo = new EventTarget();
    const c = ctx('aba-1');
    await montarPalcoDaTag(c, semFoto, { esperaMs: 0 });
    expect(donoAtual()).not.toBeNull();

    liberarPalcoAoSair(alvo);
    alvo.dispatchEvent(new Event('pagehide'));

    expect(donoAtual()).toBeNull();
  });

  it('depois de sair, outra montagem entra na hora', async () => {
    const alvo = new EventTarget();
    await montarPalcoDaTag(ctx('aba-1'), semFoto, { esperaMs: 0 });
    liberarPalcoAoSair(alvo);
    alvo.dispatchEvent(new Event('pagehide'));

    // `aba-2` representa a MESMA aba depois do F5: tabId novo, sem esperar TTL.
    const r = await montarPalcoDaTag(ctx('aba-2'), semFoto, { esperaMs: 0 });
    expect(r).toMatchObject({ ok: true });
  });

  it('a escuta cancelada não solta mais nada', async () => {
    const alvo = new EventTarget();
    const c = ctx('aba-1');
    await montarPalcoDaTag(c, semFoto, { esperaMs: 0 });

    liberarPalcoAoSair(alvo)();
    alvo.dispatchEvent(new Event('pagehide'));

    expect(donoAtual()).not.toBeNull();
  });

  it('aba que não montou nada não mexe no palco de ninguém', async () => {
    const alvo = new EventTarget();
    await montarPalcoDaTag(ctx('aba-1'), semFoto, { esperaMs: 0 });
    zerarMontagemEmMemoria(); // esta "aba" não é dona de nada

    liberarPalcoAoSair(alvo);
    alvo.dispatchEvent(new Event('pagehide'));

    expect(donoAtual()).not.toBeNull();
  });
});

describe('montagem completa', () => {
  it('só devolve ok depois de tudo confirmado', async () => {
    await gravarAtomico([{ chave: `nr13_info_${TAG}`, registro: reg('{"tag":"A"}') }]);
    const c = ctx('aba-1');

    const r = await montarPalcoDaTag(c, semFoto, { esperaMs: 0 });
    expect(r).toMatchObject({ ok: true });
    expect(localStorage.getItem(`nr13_info_${TAG}`)).toBe('{"tag":"A"}');
  });

  it('segunda aba recebe ocupado e NÃO altera o palco', async () => {
    await gravarAtomico([{ chave: `nr13_info_${TAG}`, registro: reg('{"tag":"A"}') }]);
    const a = ctx('aba-1');
    await montarPalcoDaTag(a, semFoto, { esperaMs: 0 });
    const antes = localStorage.getItem(`nr13_info_${TAG}`);

    const r = await montarPalcoDaTag(ctx('aba-2', 'n-2'), semFoto, { esperaMs: 0 });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.falha.tipo).toBe('ocupado');
      if (r.falha.tipo === 'ocupado') expect(r.falha.dono?.tabId).toBe('aba-1');
    }
    expect(localStorage.getItem(`nr13_info_${TAG}`)).toBe(antes);
    expect(donoAtual()?.tabId).toBe('aba-1');
  });

  it('documento acima do orçamento é RECUSADO e nada é montado', async () => {
    await gravarAtomico([
      { chave: `nr13_info_${TAG}`, registro: reg('{}') },
      { chave: `nr13_fotos_${TAG}`, registro: reg('x'.repeat(ORCAMENTO_DOC)) },
    ]);

    const r = await montarPalcoDaTag(ctx('aba-1'), teimoso, { esperaMs: 0 });
    expect(r.ok).toBe(false);
    expect(localStorage.getItem(`nr13_info_${TAG}`)).toBeNull();
    expect(donoAtual()).toBeNull(); // trava devolvida
  });

  it('a foto ORIGINAL no cache não é alterada pela degradação', async () => {
    const original = 'FOTO-ORIGINAL-INTACTA';
    await gravarAtomico([
      { chave: `nr13_info_${TAG}`, registro: reg('{}') },
      { chave: `nr13_fotos_${TAG}`, registro: reg(original) },
    ]);

    await montarPalcoDaTag(ctx('aba-1'), adaptador(ORCAMENTO_IMG * 10), { esperaMs: 0 });

    // O palco pode ter versão degradada; o cache tem que seguir com a original.
    expect(obterRegistro(`nr13_fotos_${TAG}`)?.valor).toBe(original);
  });
});
