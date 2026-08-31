/**
 * Fase 9 · 9F.3.5 — a flag própria de `/calibracoes`.
 *
 * Uma flag POR TELA é o que permite ligar uma e deixar as outras quietas, e o
 * que faz o rollback ser "desligar aquela". Esta é a QUINTA (`busca_v9`,
 * `boot_v9`, `inspecoes_v9`, `prontuarios_v9`, `calibracoes_v9`), e o degrau de
 * recuo que ela exige é o que estes testes protegem de verdade.
 *
 * ## O defeito que o degrau evita, e que já aconteceu nesta fase
 *
 * Entre publicar o bundle e aplicar o SQL, o banco tem as colunas ANTIGAS e não
 * a nova — o estado NORMAL de todo deploy. Uma consulta que desistisse no
 * primeiro erro apagaria `busca_v9`, `boot_v9`, `inspecoes_v9` e
 * `prontuarios_v9` de quem as tem ligadas: uma flag derrubando as outras sem
 * ninguém pedir.
 *
 * A cada etapa a escada fica mais alta, e o teste do último degrau é o único
 * lugar onde a queda inteira é exercitada de uma vez.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const estado = vi.hoisted(() => ({
  colunas: [] as string[],
  colunasAusentes: [] as string[],
  resposta: { data: null as unknown, error: null as unknown },
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((colunas: string) => {
        estado.colunas.push(colunas);
        const faltando = estado.colunasAusentes.find((c) => colunas.includes(c));
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () =>
              faltando
                ? { data: null, error: { message: `column ${faltando} does not exist` } }
                : estado.resposta,
            ),
          })),
        };
      }),
    })),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: 'org-1' })),
}));

import {
  bootV9Ativo,
  buscaV9Ativa,
  calibracoesV9Ativa,
  inspecoesV9Ativa,
  prontuariosV9Ativa,
  sincronizarFlagDoServidor,
  zerarFlagEmMemoria,
} from './flag';

beforeEach(() => {
  localStorage.clear();
  zerarFlagEmMemoria();
  estado.colunas.length = 0;
  estado.colunasAusentes.length = 0;
  estado.resposta = { data: null, error: null };
});

describe('flag calibracoes_v9', () => {
  it('nasce DESLIGADA — a tela de todo mundo continua a antiga', () => {
    expect(calibracoesV9Ativa()).toBe(false);
  });

  it('organização SEM linha em org_sync não herda a flag', async () => {
    // "Sem linha = organização nova = v2" vale só para `v2_ativa`. Tela nova é
    // ato explícito: nasce desligada, como as outras quatro.
    estado.resposta = { data: null, error: null };
    await sincronizarFlagDoServidor();
    expect(calibracoesV9Ativa()).toBe(false);
  });

  it('liga quando o servidor diz que está ligada para a organização', async () => {
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: false,
        boot_v9: false,
        inspecoes_v9: false,
        prontuarios_v9: false,
        calibracoes_v9: true,
      },
      error: null,
    };
    await sincronizarFlagDoServidor();
    expect(calibracoesV9Ativa()).toBe(true);
  });

  it('sai na MESMA consulta das outras — nenhum round-trip novo no boot', async () => {
    estado.resposta = { data: { v2_ativa: true }, error: null };
    await sincronizarFlagDoServidor();
    expect(estado.colunas[0]).toContain('calibracoes_v9');
    expect(estado.colunas).toHaveLength(1);
  });

  it('BANCO SEM a coluna nova preserva as QUATRO anteriores', async () => {
    // O estado entre publicar o bundle e aplicar o SQL.
    estado.colunasAusentes = ['calibracoes_v9'];
    estado.resposta = {
      data: {
        v2_ativa: true,
        busca_v9: true,
        boot_v9: true,
        inspecoes_v9: true,
        prontuarios_v9: true,
      },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(calibracoesV9Ativa()).toBe(false); // a nova fica desligada — lado barato
    expect(buscaV9Ativa()).toBe(true); // e as quatro que já estavam ligadas CONTINUAM
    expect(bootV9Ativo()).toBe(true);
    expect(inspecoesV9Ativa()).toBe(true);
    expect(prontuariosV9Ativa()).toBe(true);
  });

  it('sem `calibracoes_v9` NEM `prontuarios_v9` ainda preserva as três de baixo', async () => {
    // Recuo de dois degraus: o banco anterior à 9F.2.
    estado.colunasAusentes = ['calibracoes_v9', 'prontuarios_v9'];
    estado.resposta = {
      data: { v2_ativa: true, busca_v9: true, boot_v9: true, inspecoes_v9: true },
      error: null,
    };

    await sincronizarFlagDoServidor();

    expect(calibracoesV9Ativa()).toBe(false);
    expect(prontuariosV9Ativa()).toBe(false);
    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
    expect(inspecoesV9Ativa()).toBe(true);
  });

  it('A ESCADA INTEIRA: banco anterior a toda a 9F ainda preserva busca_v9 e boot_v9', async () => {
    // Quatro degraus de queda de uma vez — o estado da produção quando a 9E
    // fechou. Este é o caso que nenhum teste das etapas anteriores alcançava,
    // porque a escada ainda não tinha esta altura.
    estado.colunasAusentes = ['calibracoes_v9', 'prontuarios_v9', 'inspecoes_v9'];
    estado.resposta = { data: { v2_ativa: true, busca_v9: true, boot_v9: true }, error: null };

    await sincronizarFlagDoServidor();

    expect(calibracoesV9Ativa()).toBe(false);
    expect(prontuariosV9Ativa()).toBe(false);
    expect(inspecoesV9Ativa()).toBe(false);
    expect(buscaV9Ativa()).toBe(true);
    expect(bootV9Ativo()).toBe(true);
  });

  it('e o fundo do poço: sem NENHUMA coluna de tela, a v2 continua sincronizada', async () => {
    // O motivo de a escada existir. Se o recuo desistisse, `v2_ativa` deixaria
    // de ser sincronizada — o estado exato que custou uma semana na conta
    // `cmam.caldeiras`: bundle na v1 contra servidor em v2, escrita recusada em
    // silêncio, conta aparecendo vazia.
    estado.colunasAusentes = ['calibracoes_v9', 'prontuarios_v9', 'inspecoes_v9', 'boot_v9', 'busca_v9'];
    estado.resposta = { data: { v2_ativa: true }, error: null };

    const v2 = await sincronizarFlagDoServidor();

    expect(v2).toBe(true);
    expect(calibracoesV9Ativa()).toBe(false);
    expect(prontuariosV9Ativa()).toBe(false);
    expect(inspecoesV9Ativa()).toBe(false);
    expect(buscaV9Ativa()).toBe(false);
    expect(bootV9Ativo()).toBe(false);
  });
});
