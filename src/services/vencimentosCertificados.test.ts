/**
 * GATE do motor de vencimentos (07/09/2026).
 *
 * O defeito relatado: um certificado de padrão cadastrado pela UI, com PDF e
 * validade dentro de 30 dias, **não aparecia no Dashboard** — nem na lista,
 * nem nos contadores. A causa não era de tela: NENHUMA das duas fontes lia a
 * família `nr13_rastreab_`. O caminho local varria `nr13_info_` e
 * `nr13_calibracoes_`; o agregado do servidor soma `equipamentos_index` e
 * `calibracoes_index`, e certificado de padrão não está em projeção nenhuma.
 *
 * Estes casos travam as três coisas que a correção precisa manter:
 *
 *   1. o certificado vira linha do painel pela MESMA regra dos outros
 *      domínios, com as faixas de prazo batendo (5 / 30 / 60 / vencido);
 *   2. os CONTADORES do topo somam o certificado — foi a discordância entre o
 *      card "A VENCER (30D)" e a realidade que o usuário viu;
 *   3. um TIPO NOVO de instrumento padrão não pode ficar de fora em silêncio.
 *
 * Suíte pura: sem DOM, sem rede.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANO_MAX_PRAZO,
  ANO_MIN_PRAZO,
  ROTULO_PADRAO,
  chaveIdentidade,
  conformidadeDe,
  dedupVencimentos,
  itemDeCalibracao,
  itemDeCertificado,
  itemDeEquipamento,
  ordenarVencimentos,
  parseDataPrazo,
  resumoKpis,
} from './vencimentos';
import type { ItemVencimento } from './vencimentos';
import {
  COLUNAS_CERTIFICADO,
  PREFIXO_RASTREAB,
  itensDeLinhas,
} from './certificadosVencimentos';

const HOJE = new Date(2026, 8, 7); // 07/09/2026, o dia da queixa

/** `hoje + dias`, em data local — a mesma aritmética do motor. */
function emDias(dias: number): string {
  const d = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() + dias);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const CERT_BASE = {
  id: 'r1',
  nome: 'Manômetro padrão Record 0-10 bar',
  tipo: 'manometro',
  certificado: 'CERT-2026-118',
};

describe('1 · o certificado de padrão vira linha do painel', () => {
  it('validade em 20 dias: aparece, com origem `certificado` e o rótulo do tipo', () => {
    const item = itemDeCertificado({ ...CERT_BASE, validade: emDias(20) }, HOJE);
    expect(item).not.toBeNull();
    expect(item!.origem).toBe('certificado');
    expect(item!.tipoEquip).toBe('Manômetro padrão');
    expect(item!.dias).toBe(20);
    expect(item!.status).toBe('warn');
    // A "TAG" da linha é o nº do certificado: é por ele que o usuário reconhece
    // o documento. Certificado de padrão NÃO pertence a equipamento.
    expect(item!.tag).toBe('CERT-2026-118');
    expect(item!.pertenceA).toBeUndefined();
  });

  it('as faixas: 5, 30, 60 e vencido', () => {
    const faixa = (dias: number) => {
      const i = itemDeCertificado({ ...CERT_BASE, validade: emDias(dias) }, HOJE)!;
      return [i.dias, i.status];
    };
    expect(faixa(5)).toEqual([5, 'warn']);
    expect(faixa(30)).toEqual([30, 'warn']); // 30 ainda é "a vencer"
    expect(faixa(31)).toEqual([31, 'ok']);   // e 31 já não é
    expect(faixa(60)).toEqual([60, 'ok']);
    expect(faixa(0)).toEqual([0, 'warn']);   // vence hoje: não está vencido
    expect(faixa(-1)).toEqual([-1, 'crit']);
    expect(faixa(-400)).toEqual([-400, 'crit']);
  });

  it('cada tipo de padrão traz o SEU rótulo — PSV e bloco de espessura inclusos', () => {
    const rotulo = (tipo: string) =>
      itemDeCertificado({ ...CERT_BASE, tipo, validade: emDias(10) }, HOJE)!.tipoEquip;
    expect(rotulo('valvula')).toBe('Válvula PSV padrão');
    expect(rotulo('ultrassom')).toBe('Bloco padrão de espessura');
    expect(rotulo('bloco')).toBe('Bloco padrão de espessura');
    expect(rotulo('manometro')).toBe('Manômetro padrão');
  });

  it('sem nº de certificado, a linha cai no nome do instrumento — nunca em branco', () => {
    const i = itemDeCertificado({ ...CERT_BASE, certificado: '', validade: emDias(3) }, HOJE)!;
    expect(i.tag).toBe(CERT_BASE.nome);
    const semNome = itemDeCertificado(
      { id: 'r9', tipo: 'valvula', validade: emDias(3) },
      HOJE,
    )!;
    expect(semNome.tag).toBe('Válvula PSV padrão');
  });
});

describe('2 · o que NÃO pode virar prazo', () => {
  it('validade ausente, vazia ou ilegível: fora do painel, e sem inventar data', () => {
    for (const v of [undefined, null, '', '   ', 'ontem', '32/13/2026', '2026-13-45']) {
      expect(itemDeCertificado({ ...CERT_BASE, validade: v as string }, HOJE)).toBeNull();
    }
  });

  it('SENTINELA não é vencimento: 01/01/1970 e 9999-12-31 saem', () => {
    // Sem esta guarda o Dashboard abria com "Vencido há 20.703 dias" no topo,
    // empurrando para baixo o que vence esta semana.
    expect(parseDataPrazo('01/01/1970')).toBeNull();
    expect(parseDataPrazo('1900-01-01')).toBeNull();
    expect(parseDataPrazo('9999-12-31')).toBeNull();
    expect(itemDeCertificado({ ...CERT_BASE, validade: '01/01/1970' }, HOJE)).toBeNull();
    // E a data plausível continua passando, nos dois formatos.
    expect(parseDataPrazo('20/09/2026')).toEqual(new Date(2026, 8, 20));
    expect(parseDataPrazo('2026-09-20')).toEqual(new Date(2026, 8, 20));
    expect(ANO_MIN_PRAZO).toBeLessThan(ANO_MAX_PRAZO);
  });

  it('registro SUBSTITUÍDO (soft-replace) não vence — quem vence é o que o trocou', () => {
    const antigo = itemDeCertificado(
      { ...CERT_BASE, validade: emDias(-5), substituidoEm: '2026-09-01' },
      HOJE,
    );
    expect(antigo).toBeNull();
    const novo = itemDeCertificado({ ...CERT_BASE, id: 'r2', validade: emDias(300) }, HOJE);
    expect(novo!.status).toBe('ok');
  });

  it('excluído em outro aparelho (tombstone) não entra pela consulta do servidor', () => {
    const itens = itensDeLinhas(
      [
        { chave: 'nr13_rastreab_r1', validade: emDias(10), tipo: 'manometro', deletado_em: null },
        { chave: 'nr13_rastreab_r2', validade: emDias(10), tipo: 'valvula', deletado_em: '2026-09-06T10:00:00Z' },
      ],
      HOJE,
    );
    expect(itens.map((i) => i.tipoEquip)).toEqual(['Manômetro padrão']);
  });
});

describe('3 · os outros domínios continuam de pé', () => {
  it('inspeção INTERNA e EXTERNA: vale a MENOR das duas', () => {
    const i = itemDeEquipamento(
      {
        tag: 'ZZ-VASO-1',
        tipo: 'vaso',
        descricao: 'Vaso de teste',
        relExecucao: '2026-09-01',
        relProxInterna: emDias(40),
        relProxExterna: emDias(12),
      },
      HOJE,
    );
    expect(i.origem).toBe('inspecao');
    expect(i.dias).toBe(12); // a externa é a que manda
    expect(i.status).toBe('warn');

    const soInterna = itemDeEquipamento(
      { tag: 'ZZ-VASO-2', tipo: 'caldeira', relProxInterna: emDias(3) },
      HOJE,
    );
    expect(soInterna.dias).toBe(3);
    expect(soInterna.tipoEquip).toBe('Caldeira');
  });

  it('equipamento sem prazo nenhum é `semPrazo` — e não some da lista', () => {
    const i = itemDeEquipamento({ tag: 'ZZ-VASO-3', tipo: 'vaso' }, HOJE);
    expect(i.status).toBe('semPrazo');
    expect(i.vencimento).toBeUndefined();
  });

  it('componente/acessório (manômetro do equipamento) segue com origem `calibracao`', () => {
    const i = itemDeCalibracao(
      {
        tag: 'ZZ-VASO-1',
        nome: 'Manômetro do casco',
        tipo: 'manometro',
        serie: '55A',
        dataCalibracao: '2026-03-01',
        proxCalibracao: emDias(9),
      },
      HOJE,
    )!;
    expect(i.origem).toBe('calibracao');
    expect(i.pertenceA).toBe('ZZ-VASO-1');
    expect(i.dias).toBe(9);
  });

  it('o COMPONENTE do equipamento e o PADRÃO da bancada não se confundem', () => {
    const componente = itemDeCalibracao(
      { tag: 'ZZ-VASO-1', nome: 'Manômetro do casco', tipo: 'manometro', proxCalibracao: emDias(10) },
      HOJE,
    )!;
    const padrao = itemDeCertificado({ ...CERT_BASE, validade: emDias(10) }, HOJE)!;
    expect(componente.origem).not.toBe(padrao.origem);
    expect(componente.tipoEquip).toBe('Manômetro');
    expect(padrao.tipoEquip).toBe('Manômetro padrão');
    expect(chaveIdentidade(componente)).not.toBe(chaveIdentidade(padrao));
  });
});

describe('4 · deduplicação', () => {
  it('a mesma linha vinda de duas fontes aparece UMA vez', () => {
    const a = itemDeCertificado({ ...CERT_BASE, validade: emDias(12) }, HOJE)!;
    const b = itemDeCertificado({ ...CERT_BASE, validade: emDias(12) }, HOJE)!;
    expect(dedupVencimentos([a, b])).toHaveLength(1);
  });

  it('duas linhas PARECIDAS mas diferentes sobrevivem às duas', () => {
    const cert = itemDeCertificado({ ...CERT_BASE, validade: emDias(12) }, HOJE)!;
    const outraData = itemDeCertificado({ ...CERT_BASE, validade: emDias(13) }, HOJE)!;
    const outroPadrao = itemDeCertificado(
      { ...CERT_BASE, id: 'r7', certificado: 'CERT-2026-119', validade: emDias(12) },
      HOJE,
    )!;
    expect(dedupVencimentos([cert, outraData, outroPadrao])).toHaveLength(3);
  });

  it('dois acessórios de EQUIPAMENTOS diferentes não colapsam num só', () => {
    const fatos = { nome: 'Manômetro', tipo: 'manometro', serie: '10', proxCalibracao: emDias(4) };
    const a = itemDeCalibracao({ ...fatos, tag: 'ZZ-A' }, HOJE)!;
    const b = itemDeCalibracao({ ...fatos, tag: 'ZZ-B' }, HOJE)!;
    expect(dedupVencimentos([a, b])).toHaveLength(2);
  });
});

describe('5 · os contadores do topo', () => {
  const equip = (dias: number, tag: string) =>
    itemDeEquipamento({ tag, tipo: 'vaso', relProxInterna: emDias(dias) }, HOJE);

  it('“A VENCER (30D)” soma inspeção + certificado de manômetro + certificado de PSV', () => {
    // O exemplo do usuário, ao pé da letra: 1 + 1 + 1 = 3.
    const itens: ItemVencimento[] = [
      equip(18, 'ZZ-VASO-1'),
      itemDeCertificado({ ...CERT_BASE, validade: emDias(20) }, HOJE)!,
      itemDeCertificado(
        { id: 'r2', nome: 'PSV padrão', tipo: 'valvula', certificado: 'C-2', validade: emDias(25) },
        HOJE,
      )!,
      equip(200, 'ZZ-VASO-2'), // fora da janela
    ];
    const k = resumoKpis(itens, 2);
    expect(k.aVencer30).toBe(3);
    expect(k.vencidos).toBe(0);
  });

  it('“VENCIDOS” conta o certificado vencido e a conformidade cai junto', () => {
    const itens: ItemVencimento[] = [
      equip(120, 'ZZ-VASO-1'),
      equip(150, 'ZZ-VASO-2'),
      equip(180, 'ZZ-VASO-3'),
      itemDeCertificado({ ...CERT_BASE, validade: emDias(-2) }, HOJE)!,
    ];
    const k = resumoKpis(itens, 3);
    expect(k.vencidos).toBe(1);
    // 4 itens com prazo, 1 vencido → 75 %. Um certificado vencido NÃO pode
    // coexistir com "100 % em dia" (§13 da rodada).
    expect(k.conformidade).toBe(75);
  });

  it('organização sem vencimento nenhum: zero conferido, conformidade 100 %', () => {
    const k = resumoKpis([], 0);
    expect(k).toEqual({ total: 0, aVencer30: 0, vencidos: 0, conformidade: 100 });
  });

  it('a conformidade é a MESMA conta nas duas fontes', () => {
    expect(conformidadeDe(4, 1)).toBe(75);
    expect(conformidadeDe(0, 0)).toBe(100);
    expect(conformidadeDe(3, 3)).toBe(0);
  });

  it('a ordem do painel: vencidos primeiro, `semPrazo` por último', () => {
    const semPrazo = itemDeEquipamento({ tag: 'ZZ-SEM', tipo: 'vaso' }, HOJE);
    const vencido = itemDeCertificado({ ...CERT_BASE, validade: emDias(-3) }, HOJE)!;
    const perto = equip(2, 'ZZ-PERTO');
    const ordem = ordenarVencimentos([semPrazo, perto, vencido]).map((i) => i.tag);
    expect(ordem[0]).toBe(vencido.tag);
    expect(ordem[2]).toBe('ZZ-SEM');
  });
});

describe('6 · GATE — um tipo NOVO de padrão não pode ficar de fora', () => {
  const fonte = readFileSync('src/features/relatorios/rastreabilidadeService.ts', 'utf8');

  it('todo membro de `TipoInstrumento` tem rótulo em `ROTULO_PADRAO`', () => {
    const bloco = fonte.slice(
      fonte.indexOf('export type TipoInstrumento'),
      fonte.indexOf(';', fonte.indexOf('export type TipoInstrumento')),
    );
    const tipos = [...bloco.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(tipos.length).toBeGreaterThanOrEqual(9);
    for (const t of tipos) {
      // Falhou? Um tipo novo entrou no cadastro e ninguém deu nome a ele aqui.
      // Ele apareceria no painel como "Instrumento padrão" genérico.
      expect(Object.keys(ROTULO_PADRAO)).toContain(t);
    }
  });

  it('a consulta do servidor projeta TODOS os campos que a regra lê', () => {
    // Se um campo sumir do `select`, ele chega `null` e o certificado vira uma
    // linha muda — sem validade, sem tipo, sem nº. Silencioso, como o defeito.
    for (const campo of ['nome', 'tipoInstrumento', 'certificadoPadrao', 'validade', 'substituidoEm']) {
      expect(COLUNAS_CERTIFICADO).toContain(`"${campo}"`);
    }
    // Os nomes vão entre ASPAS por causa do camelCase.
    expect(COLUNAS_CERTIFICADO).not.toContain('->>tipoInstrumento');
    // E o PDF NUNCA entra: `valor` inteiro traria o base64 do certificado.
    expect(COLUNAS_CERTIFICADO).not.toMatch(/(^|[\s,])valor([\s,]|$)/);
    expect(COLUNAS_CERTIFICADO).not.toContain('pdfBase64');
  });

  it('servidor e cache local varrem o MESMO prefixo de família', () => {
    const motor = readFileSync('src/services/vencimentos.ts', 'utf8');
    expect(PREFIXO_RASTREAB).toBe('nr13_rastreab_');
    expect(motor).toContain("listarChavesComPrefixo('nr13_rastreab_')");
  });

  it('o agregado do servidor SOMA os certificados aos contadores', () => {
    // A prova é estrutural: os três contadores que eles alimentam precisam
    // citar a parcela dos certificados. Sem isso, a lista mostraria o
    // certificado e o card diria que não há nada a vencer — a discordância
    // exata que o usuário viu.
    const painel = readFileSync('src/services/vencimentosServidor.ts', 'utf8');
    expect(painel).toContain('certAVencer30');
    expect(painel).toContain('certVencidos');
    expect(painel).toContain('certComPrazo');
    expect(painel).toContain('...certificados.itens');
    // E, sem conferir, viram "—" em vez de zero.
    expect(painel).toContain('certificados.ok ? Number(dados.a_vencer_30 ?? 0) + certAVencer30 : undefined');
  });
});

describe('7 · o painel não depende do cache do aparelho', () => {
  it('a consulta dos certificados é por METADADO, no servidor, e por organização', () => {
    const fonte = readFileSync('src/services/certificadosVencimentos.ts', 'utf8');
    expect(fonte).toContain('.like(\'chave\', `${PREFIXO_RASTREAB}%`)');
    expect(fonte).toContain('escopoStorageAtual');
    expect(fonte).toContain('.eq(escopo.coluna, escopo.id)');
    // Nada de hidratação integral para desenhar um painel.
    expect(fonte).not.toContain('lerTudo');
    expect(fonte).not.toContain('resolverPdf');
  });

  it('cache local VAZIO não zera o painel: as linhas vêm das linhas do servidor', () => {
    // `itensDeLinhas` é função pura sobre a resposta — nenhum acesso a
    // `localStorage`, `Map` ou IndexedDB. Aparelho recém-logado vê o mesmo que
    // o aparelho que cadastrou.
    const itens = itensDeLinhas(
      [{ chave: 'nr13_rastreab_r1', nome: 'PSV padrão', tipo: 'valvula', validade: emDias(20), certificado: 'C-9' }],
      HOJE,
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].dias).toBe(20);
  });

  it('resposta vazia é lista vazia — e não erro', () => {
    expect(itensDeLinhas([], HOJE)).toEqual([]);
  });
});
