import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * ATIVAÇÃO CONTROLADA POR ORGANIZAÇÃO (22/09/2026).
 *
 * A pergunta desta rodada é uma só: **ligar o tombstone numa organização pode
 * mudar o comportamento de outra?** Aqui ela é respondida com o caminho real —
 * `flag.sincronizarFlagDoServidor()`, a mesma função que o login chama, contra
 * um `org_sync` simulado.
 *
 * O resto prova as bordas que decidem se o deploy é seguro: organização sem
 * linha, banco sem as colunas, consulta que falha, troca de conta e logout.
 */

const ORG_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const ORG_ZZ = 'zzzzzzzz-0000-0000-0000-000000000002';

/** `org_sync`, por organização. `undefined` = a organização não tem linha. */
const orgSync = new Map<string, Record<string, unknown>>();
/** Ligado, a consulta responde erro — offline, ou banco sem a migração. */
let consultaFalha = false;
/** As colunas que o banco TEM. Sem `sync_v2_por_org.sql` aplicado, só a v2. */
let colunas = ['v2_ativa', 'sync_tombstone', 'sync_merge_automatico'];

let escopo: { coluna: string; id: string } | null = { coluna: 'org_id', id: ORG_A };

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabela: string) => ({
      select: (lista: string) => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => {
            if (tabela !== 'org_sync') return { data: null, error: null };
            if (consultaFalha) return { data: null, error: { message: 'Failed to fetch' } };
            // O PostgREST recusa a consulta INTEIRA quando uma coluna pedida
            // não existe — é o estado "bundle publicado, SQL ainda não
            // aplicado", e ele precisa cair no mesmo lugar que o offline.
            for (const c of lista.split(',').map((x) => x.trim())) {
              if (!colunas.includes(c)) return { data: null, error: { message: `column ${c} does not exist` } };
            }
            const linha = orgSync.get(id);
            return { data: linha ? { ...linha } : null, error: null };
          },
        }),
      }),
    }),
  },
  escopoStorageAtual: async () => escopo,
  idUsuarioAtual: async () => 'u1',
  TABELA_STORAGE: 'app_storage',
}));

import { sincronizarFlagDoServidor, zerarFlagEmMemoria } from './flag';
import { flagsSync, restaurarFlagsSync, definirFlagsSync, PADRAO_SYNC, CombinacaoDeFlagsInvalida, origemConfigSync } from './flagsSync';
import { excluirPorId, COLECOES } from './colecoes';
import {
  PROTOCOLO_SYNC,
  PROTOCOLO_MINIMO_TOMBSTONE,
  protocoloCompativel,
  mutacaoDerrubaItem,
  prontidao,
  type DispositivoVisto,
} from './protocoloSync';
import { readFileSync } from 'node:fs';

beforeEach(() => {
  orgSync.clear();
  consultaFalha = false;
  colunas = ['v2_ativa', 'sync_tombstone', 'sync_merge_automatico'];
  escopo = { coluna: 'org_id', id: ORG_A };
  localStorage.clear();
  restaurarFlagsSync();
});

afterEach(() => restaurarFlagsSync());

// ===========================================================================
// A flag vem do servidor, por organização
// ===========================================================================
describe('a configuração vem do SERVIDOR, e é por organização', () => {
  it('organização SEM linha em org_sync: as duas desligadas', async () => {
    await sincronizarFlagDoServidor();
    expect(flagsSync().tombstone).toBe(false);
    expect(flagsSync().mergeAutomatico).toBe(false);
  });

  it('organização com a v2 ligada e o sync v2 desligado: nada muda', async () => {
    orgSync.set(ORG_A, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    await sincronizarFlagDoServidor();
    expect(flagsSync()).toEqual(PADRAO_SYNC);
  });

  it('organização CANÁRIO ligada: as duas ativas', async () => {
    escopo = { coluna: 'org_id', id: ORG_ZZ };
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });

    await sincronizarFlagDoServidor();

    expect(flagsSync().tombstone).toBe(true);
    expect(flagsSync().mergeAutomatico).toBe(true);
    expect(flagsSync().filaPorItem).toBe(false); // fora desta ativação
  });

  it('tombstone sem merge é combinação válida — é o degrau intermediário', async () => {
    orgSync.set(ORG_A, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: false });
    await sincronizarFlagDoServidor();
    expect(flagsSync().tombstone).toBe(true);
    expect(flagsSync().mergeAutomatico).toBe(false);
  });

  it('merge SEM tombstone vindo do servidor é CLAMPADO, não derruba o login', async () => {
    // A constraint do banco impede isso; se chegar mesmo assim (banco sem a
    // migração, linha adulterada), desligar o merge e seguir é o certo —
    // lançar deixaria a conta inteira inacessível por causa de uma flag.
    orgSync.set(ORG_A, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: true });

    await expect(sincronizarFlagDoServidor()).resolves.not.toThrow();

    expect(flagsSync().mergeAutomatico).toBe(false);
    expect(flagsSync().tombstone).toBe(false);
  });

  it('ligar a org ZZ NÃO afeta a org A', async () => {
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    orgSync.set(ORG_A, { v2_ativa: true });

    escopo = { coluna: 'org_id', id: ORG_ZZ };
    await sincronizarFlagDoServidor();
    expect(flagsSync().tombstone).toBe(true);

    // Troca de conta, como o dono faz no mesmo navegador.
    zerarFlagEmMemoria();
    escopo = { coluna: 'org_id', id: ORG_A };
    await sincronizarFlagDoServidor();

    expect(flagsSync().tombstone).toBe(false);
    expect(flagsSync().mergeAutomatico).toBe(false);
  });

  it('logout devolve tudo ao padrão — nada é herdado pela próxima conta', async () => {
    escopo = { coluna: 'org_id', id: ORG_ZZ };
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    await sincronizarFlagDoServidor();
    expect(flagsSync().tombstone).toBe(true);

    zerarFlagEmMemoria();

    expect(flagsSync()).toEqual(PADRAO_SYNC);
  });
});

// ===========================================================================
// As bordas que decidem se o deploy é seguro
// ===========================================================================
describe('bordas do deploy', () => {
  it('BANCO SEM A MIGRAÇÃO: o bundle publicado não liga nada', async () => {
    // O cenário exato do deploy: código no ar, `sync_v2_por_org.sql` ainda não
    // aplicado. O PostgREST recusa a consulta inteira por causa das colunas
    // inexistentes.
    colunas = ['v2_ativa'];
    orgSync.set(ORG_A, { v2_ativa: true });

    await expect(sincronizarFlagDoServidor()).resolves.not.toThrow();

    expect(flagsSync()).toEqual(PADRAO_SYNC);
  });

  it('consulta falha (offline): vale a última configuração CONFIRMADA desta org', async () => {
    // ATÉ 23/09/2026 este teste afirmava o contrário ("fica no padrão"), e era
    // exatamente o defeito que o canário da ZZ mediu: boot offline → flags
    // desligadas → exclusão sem tombstone numa organização que marca. Sem
    // resposta, o que vale é o recibo do servidor — não a invenção de um padrão.
    escopo = { coluna: 'org_id', id: ORG_ZZ };
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    await sincronizarFlagDoServidor();
    expect(flagsSync().tombstone).toBe(true);

    consultaFalha = true;
    await sincronizarFlagDoServidor();

    expect(flagsSync().tombstone).toBe(true);
    expect(flagsSync().mergeAutomatico).toBe(true);
    // A falha isolada não rebaixa a confirmação que ESTA sessão já tinha. Quem
    // rebaixa é a reconexão (`marcarParaRevalidar`), e aí coleção espera e o
    // merge não roda até o servidor responder de novo — configSyncOffline.test.ts.
    expect(origemConfigSync()).toBe('servidor');
  });

  it('sem escopo (sessão ainda não resolvida): padrão', async () => {
    escopo = null;
    await sincronizarFlagDoServidor();
    expect(flagsSync()).toEqual(PADRAO_SYNC);
  });

  it('a exclusão do caminho real segue a flag da organização', async () => {
    const lista = [{ id: 'a' }, { id: 'b' }];

    orgSync.set(ORG_A, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    await sincronizarFlagDoServidor();
    expect(excluirPorId(lista, 'b')).toHaveLength(1); // tira

    escopo = { coluna: 'org_id', id: ORG_ZZ };
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    await sincronizarFlagDoServidor();
    const marcada = excluirPorId(lista, 'b');
    expect(marcada).toHaveLength(2); // marca
    expect((marcada[1] as { removidoEm?: string }).removidoEm).toBeTruthy();
  });

  it('usuário não liga isto pelo localStorage', async () => {
    // Não existe chave a forjar: a flag não tem espelho em disco. O teste é a
    // prova negativa — depois de tentar de tudo, ela continua no padrão.
    localStorage.setItem('nr13_sync_tombstone', '1');
    localStorage.setItem('nr13_flags_sync', '{"tombstone":true,"mergeAutomatico":true}');
    localStorage.setItem('nr13_armazenamento_v2', '1');

    await sincronizarFlagDoServidor();

    expect(flagsSync()).toEqual(PADRAO_SYNC);
  });

  it('`definirFlagsSync` (a porta dos testes) continua recusando a combinação inválida', () => {
    expect(() => definirFlagsSync({ mergeAutomatico: true })).toThrow(CombinacaoDeFlagsInvalida);
  });
});

// ===========================================================================
// Protocolo do dispositivo
// ===========================================================================
describe('protocolo de sincronização', () => {
  it('este bundle fala o protocolo mínimo exigido pelo tombstone', () => {
    expect(PROTOCOLO_SYNC).toBeGreaterThanOrEqual(PROTOCOLO_MINIMO_TOMBSTONE);
    expect(protocoloCompativel(PROTOCOLO_SYNC)).toBe(true);
    expect(protocoloCompativel(1)).toBe(false);
  });

  it('derrubar um id é o que a guarda recusa; marcar não é derrubar', () => {
    const antes = JSON.stringify([{ id: 'a' }, { id: 'b' }]);

    // Protocolo 1: some com o item.
    expect(mutacaoDerrubaItem(antes, JSON.stringify([{ id: 'a' }]))).toBe(true);
    // Protocolo 2: marca, e o id continua lá.
    expect(mutacaoDerrubaItem(antes, JSON.stringify([{ id: 'a' }, { id: 'b', removidoEm: 'x' }]))).toBe(false);
  });

  it('editar, acrescentar e reordenar PASSAM — a guarda é estreita de propósito', () => {
    const antes = JSON.stringify([{ id: 'a', n: 1 }, { id: 'b' }]);
    expect(mutacaoDerrubaItem(antes, JSON.stringify([{ id: 'a', n: 2 }, { id: 'b' }]))).toBe(false);
    expect(mutacaoDerrubaItem(antes, JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))).toBe(false);
    expect(mutacaoDerrubaItem(antes, JSON.stringify([{ id: 'b' }, { id: 'a' }]))).toBe(false);
  });

  it('valor que não é lista não afirma derrubada — guarda que barra o normal é desligada', () => {
    expect(mutacaoDerrubaItem(null, JSON.stringify([{ id: 'a' }]))).toBe(false);
    expect(mutacaoDerrubaItem('{"nao":"array"}', '[]')).toBe(false);
    expect(mutacaoDerrubaItem('nem json', '[]')).toBe(false);
    expect(mutacaoDerrubaItem(JSON.stringify([{ semId: 1 }]), '[]')).toBe(false);
  });

  it('prontidão: um dispositivo antigo visto desde o corte reprova a organização', () => {
    const devs: DispositivoVisto[] = [
      { dispositivo: 'novo-1', protocolo: 2, vistoEm: '2026-09-24T10:00:00.000Z' },
      { dispositivo: 'velho-1', protocolo: 1, vistoEm: '2026-09-24T11:00:00.000Z' },
    ];
    const r = prontidao(devs, '2026-09-23T00:00:00.000Z');
    expect(r.pronta).toBe(false);
    expect(r.incompativeis.map((d) => d.dispositivo)).toEqual(['velho-1']);
  });

  it('dispositivo antigo visto ANTES do corte não conta', () => {
    const devs: DispositivoVisto[] = [
      { dispositivo: 'velho-1', protocolo: 1, vistoEm: '2026-09-01T00:00:00.000Z' },
      { dispositivo: 'novo-1', protocolo: 2, vistoEm: '2026-09-24T10:00:00.000Z' },
    ];
    expect(prontidao(devs, '2026-09-23T00:00:00.000Z').pronta).toBe(true);
  });

  it('NINGUÉM visto desde o corte não é "pronta" — é "não se sabe"', () => {
    // Lista vazia prova que ninguém sincronizou, não que todos estão em dia.
    // Sem esta linha, a organização mais pronta do sistema seria a que ninguém usa.
    expect(prontidao([], '2026-09-23T00:00:00.000Z').pronta).toBe(false);
  });
});

// ===========================================================================
// O ESPELHO: SQL e TypeScript precisam concordar
// ===========================================================================
describe('a guarda do servidor espelha o catálogo do cliente', () => {
  const sql = readFileSync('supabase/sync_v2_por_org.sql', 'utf8');

  it('toda coleção do catálogo está em `eh_chave_colecao`', () => {
    // Uma coleção que o cliente conhece e o SQL não fica SEM a guarda — e é
    // exatamente nela que o aparelho antigo derrubaria itens sem ninguém ver.
    const trecho = sql.slice(sql.indexOf('eh_chave_colecao'), sql.indexOf('guardar_exclusao_sem_marca'));
    for (const c of COLECOES) {
      expect(trecho).toContain(c.chave);
    }
  });

  it('o SQL não foi aplicado: ele é um arquivo, e nada no código o executa', () => {
    expect(sql).toContain('NAO APLICADO EM PRODUCAO');
  });

  it('as colunas nascem DESLIGADAS no banco', () => {
    expect(sql).toContain('add column if not exists sync_tombstone boolean not null default false');
    expect(sql).toContain('add column if not exists sync_merge_automatico boolean not null default false');
  });

  it('a regra "merge exige tombstone" também vive no banco', () => {
    expect(sql).toContain('check (sync_merge_automatico = false or sync_tombstone = true)');
  });

  it('quem liga não é `authenticated`', () => {
    expect(sql).toContain('revoke all on function public.definir_sync_v2(uuid, boolean, boolean) from public, anon, authenticated');
  });
});

// ===========================================================================
// REAUDITORIA DE 23/09/2026 — antes de aplicar em produção
// ===========================================================================
describe('a guarda não pode barrar operação legítima', () => {
  const sql = readFileSync('supabase/sync_v2_por_org.sql', 'utf8');

  /**
   * O ACHADO que travou a aplicação da migration.
   *
   * A RPC apaga uma chave com `set valor = null, deletado_em = now()`. Em SQL,
   * `x not in (<conjunto vazio>)` é VERDADEIRO — então, sem tratamento, TODO id
   * da lista antiga contaria como derrubado e a guarda recusaria apagar o
   * equipamento inteiro (`excluirVaso`) e a coleta de tombstones.
   *
   * O espelho em TypeScript já estava certo (`ids(null)` devolve `null` e a
   * função responde `false`), e é essa divergência que o espelho existe para
   * expor.
   */
  it('apagar a CHAVE inteira não conta como derrubar item — no espelho TS', () => {
    const antes = JSON.stringify([{ id: 'a' }, { id: 'b' }]);
    expect(mutacaoDerrubaItem(antes, null)).toBe(false);
    expect(mutacaoDerrubaItem(antes, undefined)).toBe(false);
  });

  it('…e a mesma exceção existe no SQL', () => {
    expect(sql).toContain('if new.deletado_em is not null or new.valor is null then return new; end if;');
  });

  it('esvaziar a lista para `[]` CONTINUA sendo derrubada', () => {
    // Não é exclusão de chave: é exclusão de todos os itens, sem marca.
    expect(mutacaoDerrubaItem(JSON.stringify([{ id: 'a' }]), '[]')).toBe(true);
  });

  it('a guarda sai cedo para chave que não é coleção, antes de consultar org_sync', () => {
    const corpo = sql.slice(sql.indexOf('guardar_exclusao_sem_marca()'));
    const saidaCedo = corpo.indexOf('eh_chave_colecao(new.chave) then return new');
    const consulta = corpo.indexOf('from public.org_sync');
    expect(saidaCedo).toBeGreaterThan(-1);
    expect(saidaCedo).toBeLessThan(consulta); // custo zero para o resto do sistema
  });

  it('organização sem linha em org_sync passa (é o estado de todas hoje)', () => {
    expect(sql).toContain('if v_ligado is distinct from true then return new; end if;');
  });

  it('a porta de manutenção do DBA continua aberta', () => {
    expect(sql).toContain('if public.nr13_manutencao_autorizada() then return new; end if;');
  });

  it('a trigger é BEFORE UPDATE — criar uma chave nunca derruba nada', () => {
    expect(sql).toContain('before update on public.app_storage');
    expect(sql).not.toContain('before insert or update on public.app_storage');
  });

  it('org_dispositivos tem RLS e nenhuma policy de escrita', () => {
    expect(sql).toContain('alter table public.org_dispositivos enable row level security');
    expect(sql).toContain('create policy org_dispositivos_select on public.org_dispositivos');
    expect(sql).not.toMatch(/create policy \w+ on public\.org_dispositivos\s+for (insert|update|delete)/);
  });

  it('o protocolo de um dispositivo nunca desce', () => {
    expect(sql).toContain('greatest(public.org_dispositivos.protocolo, excluded.protocolo)');
  });

  it('`sync_v2_prontidao` não é executável por usuário comum', () => {
    expect(sql).toContain(
      'revoke all on function public.sync_v2_prontidao(uuid, timestamptz) from public, anon, authenticated',
    );
  });

  it('é idempotente: toda criação usa `if not exists` ou `or replace`', () => {
    const criacoes = sql.match(/^(create|alter) (table|policy|trigger|function|index)[^\n]*/gim) ?? [];
    for (const linha of criacoes) {
      const ok =
        /if not exists/i.test(linha) ||
        /or replace/i.test(linha) ||
        /^alter table/i.test(linha) || // as colunas usam `add column if not exists`
        /^create policy/i.test(linha) || // precedidas de `drop policy if exists`
        /^create trigger/i.test(linha); // precedida de `drop trigger if exists`
      expect(ok, linha).toBe(true);
    }
  });
});
