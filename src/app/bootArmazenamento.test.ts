/**
 * Fase 9 · 9D.4 — o que a barreira do boot espera.
 *
 * A barreira não é o defeito; o defeito é ela esperar a organização inteira.
 * Estes testes travam as três respostas possíveis, e cada uma existe por um
 * incidente:
 *
 *   · `nenhuma`  — cliente do Portal NÃO hidrata (Fase 0-B, achado A-01): a
 *     hidratação roda antes da Edge e não filtra nada, então o cliente recebia
 *     no aparelho os ativos de todos os outros clientes da organização;
 *   · `completa` — o caminho de hoje, e o default. Org sem a flag continua
 *     como sempre;
 *   · `essencial`— o boot leve, sob `boot_v9`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  cliente: false,
  bootV9: false,
  chamadas: [] as string[],
  migracoes: [] as string[],
}));

vi.mock('../features/relatorios/historicoRelatorios', () => ({
  migrarHistoricoEmSegundoPlano: () => estado.migracoes.push('historico'),
}));

vi.mock('../features/relatorios/livroAssinatura', () => ({
  migrarRubricasEmSegundoPlano: () => estado.migracoes.push('rubricas'),
}));

vi.mock('../services/recuperacaoArquivos', () => ({
  recuperarArquivosEmSegundoPlano: () => estado.migracoes.push('arquivos'),
}));

vi.mock('../services/storage', () => ({
  iniciarArmazenamento: vi.fn(async () => {
    estado.chamadas.push('iniciar');
  }),
  lerTudo: vi.fn(async () => {
    estado.chamadas.push('lerTudo');
    return {};
  }),
  hidratarEssencial: vi.fn(async () => {
    estado.chamadas.push('hidratarEssencial');
    return { chaves: 7, bytes: 1234, porFamilia: { nr13_minha_empresa: 1234 } };
  }),
}));

vi.mock('../services/flag', () => ({
  bootV9Ativo: () => estado.bootV9,
}));

vi.mock('../services/papelSessao', () => ({
  ehCliente: () => estado.cliente,
}));

import { hidratarNoBoot, migracoesDeSegundoPlano } from './bootArmazenamento';

beforeEach(() => {
  estado.cliente = false;
  estado.bootV9 = false;
  estado.chamadas.length = 0;
  estado.migracoes.length = 0;
});

describe('hidratarNoBoot', () => {
  it('o boot leve é o ÚNICO caminho: só o essencial, NUNCA lerTudo', async () => {
    // 9G.3 · a flag `boot_v9` saiu e com ela a resposta `completa`. O boot leve
    // não foi removido — virou o padrão, e não há mais o que escolher.
    const r = await hidratarNoBoot();

    expect(r.modo).toBe('essencial');
    expect(estado.chamadas).toEqual(['iniciar', 'hidratarEssencial']);
    expect(estado.chamadas).not.toContain('lerTudo');
  });

  it('com boot_v9, baixa só o essencial e NÃO chama lerTudo', async () => {
    estado.bootV9 = true;

    const r = await hidratarNoBoot();

    expect(r.modo).toBe('essencial');
    expect(estado.chamadas).toEqual(['iniciar', 'hidratarEssencial']);
    expect(estado.chamadas).not.toContain('lerTudo');
  });

  it('devolve a medida do que trouxe — é o número do teto do boot', async () => {
    estado.bootV9 = true;

    const r = await hidratarNoBoot();

    expect(r.medida?.chaves).toBe(7);
    expect(r.medida?.bytes).toBe(1234);
  });

  it('cliente do Portal não hidrata nada — nem essencial', async () => {
    estado.cliente = true;
    estado.bootV9 = true;

    const r = await hidratarNoBoot();

    expect(r.modo).toBe('nenhuma');
    expect(estado.chamadas).toEqual(['iniciar']);
  });

  it('as migrações de varredura rodam no caminho de hoje', async () => {
    migracoesDeSegundoPlano('completa');

    expect(estado.migracoes).toEqual(['historico', 'rubricas', 'arquivos']);
  });

  it('sob boot leve, NENHUMA varredura roda — e o motivo é dito em voz alta', async () => {
    // As três varrem o cache inteiro por prefixo, e o boot leve não baixa a
    // organização. Rodando assim elas não achariam nada, marcariam a sessão
    // como "já migrada" e o defeito seria SILENCIOSO. Pior: a do histórico
    // reconverteria relatório já migrado, porque o "já migrado?" também lê do
    // cache. Pré-condição de ligar `boot_v9` numa organização: as migrações
    // dela já concluíram.
    migracoesDeSegundoPlano('essencial');

    expect(estado.migracoes).toEqual([]);
  });

  it('falha na hidratação não derruba o boot — abre com o que o aparelho tem', async () => {
    const storage = await import('../services/storage');
    vi.mocked(storage.hidratarEssencial).mockRejectedValueOnce(new Error('sem rede'));

    const r = await hidratarNoBoot();

    expect(r.modo).toBe('essencial');
    expect(r.falhou).toBe(true);
  });
});
