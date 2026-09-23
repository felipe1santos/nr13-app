import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

/**
 * A CONFIGURAÇÃO DE SYNC SOBREVIVE AO BOOT OFFLINE (23/09/2026).
 *
 * O canário da ZZ mediu o defeito: as flags só existiam em memória, o boot
 * offline caía nos padrões desligados e ficava assim a sessão inteira — um
 * aparelho no bundle NOVO excluiu sem `removidoEm` numa organização que marca,
 * e um caso de itens diferentes virou conflito manual.
 *
 * Aqui o caminho é o REAL: `flag.sincronizarFlagDoServidor` (o que o login
 * chama), `storageV2.iniciar` (a barreira do boot), `atualizarDoServidor` (o
 * evento `online`), `colecaoSync` (as telas) e a fila de `sync`. O servidor é
 * simulado e reproduz o que decide o desfecho: versão, idempotência por
 * `mutation_id` e a guarda `trg_guardar_exclusao_sem_marca`.
 *
 * Cada APARELHO tem o seu IndexedDB (um `IDBFactory` próprio) e o seu
 * `localStorage`. "Reiniciar" é zerar a memória do processo e manter o disco —
 * é o que F5, fechar o navegador e reiniciar o computador têm em comum.
 */

const ORG_ZZ = '99999999-0000-0000-0000-00000000000a';
const ORG_Y = '99999999-0000-0000-0000-00000000000b';
const CH = 'nr13_agenda_notas';

// ── o servidor ──────────────────────────────────────────────────────────────
type Linha = { valor: string | null; versao: number; em: string; disp: string | null };
const srv = new Map<string, Linha>();
const mutacoes = new Map<string, Record<string, unknown>>();
const orgSync = new Map<string, { v2_ativa: boolean; sync_tombstone: boolean; sync_merge_automatico: boolean }>();
let rede = true;
let orgDaSessao = ORG_ZZ;
let log: string[] = [];
/** Cada mutation_id que chegou à RPC, na ordem — para provar que nada se repete. */
let idsEnviados: string[] = [];
let perderProximaResposta = false;
/** Roda logo depois de a guarda recusar — para simular a corrida recusa × leitura. */
let aposRecusa: (() => void) | null = null;

const k = (org: string, chave: string) => `${org}|${chave}`;
const idsDe = (v: string | null | undefined): string[] => {
  try {
    const a = JSON.parse(v ?? '[]');
    return Array.isArray(a) ? a.map((i: { id?: string }) => i?.id).filter((x): x is string => !!x) : [];
  } catch {
    return [];
  }
};
const ehLista = (chave: string) => chave === CH;

async function rpcFake(nome: string, p: Record<string, unknown>) {
  if (nome !== 'aplicar_mutacao_storage') return { data: null, error: null };
  if (!rede) throw new TypeError('Failed to fetch');
  const org = orgDaSessao;
  const chave = String(p.p_chave);
  const id = `${org}|${String(p.p_mutation_id)}`;
  log.push(`rpc:${chave}`);
  idsEnviados.push(String(p.p_mutation_id));

  const guardado = mutacoes.get(id);
  if (guardado) return { data: { ...guardado, status: 'repetido' }, error: null };

  const atual = srv.get(k(org, chave));
  const esperada = Number(p.p_versao_esperada);
  let res: Record<string, unknown>;
  if (atual) {
    if (atual.versao !== esperada) {
      res = { status: 'conflito', versao: atual.versao, valor: atual.valor, atualizado_em: atual.em, dispositivo: atual.disp };
    } else {
      // A GUARDA — espelho de guardar_exclusao_sem_marca: só roda com a versão
      // conferida, e a exceção desfaz tudo (nem a mutação fica registrada).
      const cfg = orgSync.get(org);
      if (cfg?.sync_tombstone && ehLista(chave) && p.p_op === 'set' && atual.valor !== null) {
        const novo = new Set(idsDe(String(p.p_valor)));
        const sumiu = idsDe(atual.valor).find((i) => !novo.has(i));
        if (sumiu) {
          const depois = aposRecusa;
          aposRecusa = null;
          depois?.();
          return {
            data: null,
            error: { code: 'P0001', message: `nr13_exclusao_sem_marca: o item "${sumiu}" sumiu da lista "${chave}" sem tombstone. Atualize o aplicativo.` },
          };
        }
      }
      const nova = esperada + 1;
      srv.set(k(org, chave), { valor: p.p_op === 'del' ? null : String(p.p_valor), versao: nova, em: new Date().toISOString(), disp: String(p.p_dispositivo) });
      res = { status: 'aplicado', versao: nova };
    }
  } else if (esperada !== 0) {
    res = { status: 'conflito', versao: 0, valor: null };
  } else {
    srv.set(k(org, chave), { valor: String(p.p_valor), versao: 1, em: new Date().toISOString(), disp: String(p.p_dispositivo) });
    res = { status: 'aplicado', versao: 1 };
  }
  mutacoes.set(id, res);
  if (perderProximaResposta) {
    perderProximaResposta = false;
    throw new TypeError('Failed to fetch'); // o servidor aplicou; a resposta se perdeu
  }
  return { data: res, error: null };
}

function consulta(tabela: string) {
  const f: Record<string, unknown> = {};
  let em: string[] | null = null;
  const linhas = () => {
    if (!rede) return { data: null, error: { message: 'Failed to fetch' } };
    if (tabela !== 'app_storage') return { data: [], error: null };
    const org = String(f.org_id ?? orgDaSessao);
    const data = [...srv.entries()]
      .filter(([chave]) => chave.startsWith(`${org}|`))
      .map(([chave, l]) => ({
        chave: chave.slice(org.length + 1), valor: l.valor, versao: l.versao,
        atualizado_em: l.em, dispositivo: l.disp, deletado_em: l.valor === null ? (l.em || '2026-09-23T00:00:00Z') : null,
      }))
      .filter((r) => (!em || em.includes(r.chave)) && (!f.chave || r.chave === f.chave));
    return { data, error: null };
  };
  const api: Record<string, unknown> = {
    select: () => api, update: () => api, upsert: () => api, gt: () => api, like: () => api,
    order: () => api, is: () => api, limit: () => api,
    eq: (c: string, v: unknown) => { f[c] = v; return api; },
    in: (_c: string, v: string[]) => { em = v; return api; },
    range: async (i: number, fim: number) => {
      const r = linhas();
      return r.data ? { data: r.data.slice(i, fim + 1), error: null } : r;
    },
    maybeSingle: async () => {
      if (!rede) return { data: null, error: { message: 'Failed to fetch' } };
      if (tabela === 'org_sync') {
        log.push('config');
        const l = orgSync.get(String(f.org_id));
        return { data: l ? { ...l } : null, error: null };
      }
      if (tabela === 'app_storage' && f.chave) log.push(`leitura:${String(f.chave)}`);
      const r = linhas();
      return { data: r.data?.[0] ?? null, error: null };
    },
    then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => Promise.resolve(linhas()).then(ok, erro),
  };
  return api;
}

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (nome: string, p: Record<string, unknown>) => rpcFake(nome, p),
    from: (tabela: string) => consulta(tabela),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
  },
  escopoStorageAtual: async () => ({ coluna: 'org_id', id: orgDaSessao }),
  idUsuarioAtual: async () => 'u1',
  TABELA_STORAGE: 'app_storage',
}));

import { sincronizarFlagDoServidor, zerarFlagEmMemoria, CHAVE_CONFIG_SYNC, type ConfigSyncConfirmada } from './flag';
import { flagsSync, origemConfigSync } from './flagsSync';
import { iniciar, atualizarDoServidor, limparCacheDados } from './storageV2';
import { gravarNaColecao, removerDaColecao, baseDe } from './colecaoSync';
import { salvar } from './storage';
import { obterRegistro } from './cacheLocal';
import { obter, aplicarAtomico, fecharDb } from './db';
import * as sync from './sync';
import { visiveis } from './colecoes';

// ── aparelhos ───────────────────────────────────────────────────────────────
interface Aparelho { nome: string; idb: IDBFactory; ls: Map<string, string> }
let emUso: Aparelho | null = null;

function novoAparelho(nome: string): Aparelho {
  return { nome, idb: new IDBFactory(), ls: new Map([['nr13_armazenamento_v2', '1']]) };
}

/** Encerra o "processo" atual: memória some, disco (IndexedDB + localStorage) fica. */
function desligar(): void {
  if (emUso) {
    emUso.ls = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)!;
      emUso.ls.set(chave, localStorage.getItem(chave)!);
    }
  }
  limparCacheDados();
  zerarFlagEmMemoria();
  fecharDb();
  emUso = null;
}

/** Liga o aparelho — mesma ordem do RotaProtegida: perfil (só online) → iniciar. */
async function ligar(ap: Aparelho, opcoes: { online: boolean; org?: string }): Promise<void> {
  if (emUso) desligar();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = ap.idb;
  localStorage.clear();
  for (const [c, v] of ap.ls) localStorage.setItem(c, v);
  emUso = ap;
  orgDaSessao = opcoes.org ?? ORG_ZZ;
  rede = opcoes.online;
  // `carregarPerfil` só chega a `sincronizarFlagDoServidor` quando o servidor
  // responde; offline ele sai antes (auth.ts, `indisponivel`).
  if (opcoes.online) await sincronizarFlagDoServidor();
  await iniciar();
}

/** A rede volta — o que o listener de `online` do storageV2 faz. */
async function reconectar(): Promise<void> {
  rede = true;
  await atualizarDoServidor({ reconectou: true });
}

const nota = (id: string, titulo = id.toUpperCase()) => ({ id, titulo, data: '2026-09-30', tipo: 'lembrete' });
const servidorLista = (org = ORG_ZZ) => JSON.parse(srv.get(k(org, CH))?.valor ?? '[]') as Array<{ id: string; titulo: string; removidoEm?: string }>;
const titulosVisiveis = (l: Array<{ titulo: string; removidoEm?: string }>) => visiveis(l).map((n) => n.titulo).sort();
const localLista = () => JSON.parse(obterRegistro(CH)?.valor ?? '[]') as Array<{ id: string; titulo: string; removidoEm?: string }>;
const editar = (id: string, titulo: string) =>
  gravarNaColecao<{ id: string; titulo: string }>(CH, (l) => l.map((n) => (n.id === id ? { ...n, titulo } : n)));

/** Base A, B, C no servidor (v1), criada por um aparelho online. */
async function baseABC(ap: Aparelho): Promise<void> {
  await ligar(ap, { online: true });
  await gravarNaColecao(CH, () => [nota('a'), nota('b'), nota('c')]);
  expect(srv.get(k(ORG_ZZ, CH))?.versao).toBe(1);
}

beforeEach(() => {
  if (emUso) desligar();
  srv.clear();
  mutacoes.clear();
  orgSync.clear();
  orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
  orgSync.set(ORG_Y, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
  rede = true;
  log = [];
  idsEnviados = [];
  perderProximaResposta = false;
  aposRecusa = null;
  localStorage.clear();
});

// ===========================================================================
describe('A · B · C — a configuração confirmada sobrevive ao boot offline', () => {
  it('A · online recebe v2=true → desliga → liga OFFLINE: continua true', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true });
    expect(flagsSync()).toMatchObject({ tombstone: true, mergeAutomatico: true });
    expect(origemConfigSync()).toBe('servidor');

    await ligar(ap, { online: false });
    expect(flagsSync()).toMatchObject({ tombstone: true, mergeAutomatico: true });
    expect(origemConfigSync()).toBe('cache');
  });

  it('B · F5 offline repetido: continua true', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true });
    for (let i = 0; i < 3; i++) {
      await ligar(ap, { online: false });
      expect(flagsSync().tombstone).toBe(true);
      expect(flagsSync().mergeAutomatico).toBe(true);
    }
  });

  it('C · reabertura: o recibo está no IndexedDB da organização, com org, protocolo e data', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true });
    desligar();
    (globalThis as { indexedDB: IDBFactory }).indexedDB = ap.idb;
    const recibo = await obter<ConfigSyncConfirmada>(ORG_ZZ, 'meta', CHAVE_CONFIG_SYNC);
    fecharDb();
    expect(recibo).toMatchObject({ org: ORG_ZZ, tombstone: true, mergeAutomatico: true, protocolo: 2 });
    expect(typeof recibo?.confirmadoEm).toBe('string');
    // e NADA no localStorage: o disco da configuração é o IndexedDB da org
    expect([...ap.ls.keys()].some((c) => /sync|tombstone|merge/i.test(c))).toBe(false);

    await ligar(ap, { online: false });
    expect(flagsSync().tombstone).toBe(true);
  });
});

// ===========================================================================
describe('D · a rede volta: configuração ANTES da fila', () => {
  it('reconexão pergunta ao servidor antes do primeiro envio', async () => {
    const ap = novoAparelho('A');
    await baseABC(ap);
    await ligar(ap, { online: false });
    await editar('c', 'C2');
    expect(sync.listarFila()).toHaveLength(1);

    log = [];
    await reconectar();
    const config = log.indexOf('config');
    const envio = log.findIndex((l) => l.startsWith('rpc:'));
    expect(config).toBeGreaterThanOrEqual(0);
    expect(envio).toBeGreaterThan(config);
    expect(sync.listarFila()).toHaveLength(0);
    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B', 'C2']);
  });

  it('drenagem disparada por uma gravação (sem evento online) também pergunta antes', async () => {
    const ap = novoAparelho('A');
    await baseABC(ap);
    await ligar(ap, { online: false });
    rede = true; // voltou, mas nenhum evento chegou à página
    log = [];
    await editar('c', 'C2'); // salvar → drenar
    expect(log.indexOf('config')).toBeGreaterThanOrEqual(0);
    expect(log.findIndex((l) => l.startsWith('rpc:'))).toBeGreaterThan(log.indexOf('config'));
  });

  it('sem resposta do servidor, a coleção ESPERA na fila — não é falha, não some', async () => {
    const ap = novoAparelho('A');
    await baseABC(ap);
    await ligar(ap, { online: false });
    await editar('c', 'C2');
    const r = await sync.drenar();
    expect(r.falhas).toBe(0);
    expect(sync.listarFila()).toHaveLength(1);
    expect(sync.listarFila()[0].estado).toBe('aguardando');
  });
});

// ===========================================================================
describe('E · o Caso B do canário: itens diferentes em dois aparelhos', () => {
  it('B abre OFFLINE com o recibo merge=true e reconecta: A2, B, C2 sem conflito manual', async () => {
    const apA = novoAparelho('A');
    const apB = novoAparelho('B');
    await baseABC(apB); // B criou a base e tem a BASE confirmada (v1)
    desligar();

    await ligar(apA, { online: true });
    await editar('a', 'A2'); // servidor v2
    expect(srv.get(k(ORG_ZZ, CH))?.versao).toBe(2);

    await ligar(apB, { online: false }); // o caso que falhou no canário
    expect(flagsSync().mergeAutomatico).toBe(true);
    await editar('c', 'C2');

    await reconectar();
    expect(titulosVisiveis(servidorLista())).toEqual(['A2', 'B', 'C2']);
    expect(sync.listarConflitos()).toHaveLength(0);
    expect(sync.listarFila()).toHaveLength(0);
  });
});

  it('UMA drenagem entrega o merge que ela mesma gerou (canário, caso C)', async () => {
    // Medido no canário R2: a mutação mesclada nascia DURANTE a drenagem e só
    // subia no próximo gatilho — o boot leve não drena e a retentativa
    // periódica só pega item com erro de rede. Aqui não há `lerTudo` para
    // drenar de novo: é uma chamada só.
    const apA = novoAparelho('A');
    const apB = novoAparelho('B');
    await baseABC(apB);
    desligar();
    await ligar(apA, { online: true });
    await editar('a', 'A2');

    await ligar(apB, { online: false });
    await editar('c', 'C2');
    rede = true;
    await sync.drenar();

    expect(titulosVisiveis(servidorLista())).toEqual(['A2', 'B', 'C2']);
    expect(sync.listarFila()).toHaveLength(0);
  });

// ===========================================================================
describe('F · exclusão offline com o recibo tombstone=true', () => {
  it('C fica MARCADO no dado bruto antes do ACK, e continua excluído depois', async () => {
    const ap = novoAparelho('B');
    await baseABC(ap);
    await ligar(ap, { online: false });

    await removerDaColecao(CH, 'c');
    const cLocal = localLista().find((n) => n.id === 'c');
    expect(cLocal?.removidoEm).toBeTruthy(); // estrutura preservada
    const naFila = JSON.parse(sync.listarFila()[0].valor!) as Array<{ id: string; removidoEm?: string }>;
    expect(naFila.find((n) => n.id === 'c')?.removidoEm).toBeTruthy();

    await reconectar();
    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();
    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B']);
    expect(sync.listarFila()).toHaveLength(0);
  });
});

// ===========================================================================
describe('G · H — isolamento por organização e por sessão', () => {
  it('G · recibo da org ZZ (true) nunca vale na org Y (false)', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true, org: ORG_ZZ });
    expect(flagsSync().tombstone).toBe(true);

    // troca de conta no mesmo navegador, e a nova conta abre offline
    await ligar(ap, { online: false, org: ORG_Y });
    expect(flagsSync().tombstone).toBe(false);
    expect(flagsSync().mergeAutomatico).toBe(false);
    expect(origemConfigSync()).toBe('desconhecida'); // Y nunca respondeu neste aparelho

    await ligar(ap, { online: true, org: ORG_Y });
    await ligar(ap, { online: false, org: ORG_Y });
    expect(flagsSync()).toMatchObject({ tombstone: false, mergeAutomatico: false });
    expect(origemConfigSync()).toBe('cache');

    await ligar(ap, { online: false, org: ORG_ZZ });
    expect(flagsSync()).toMatchObject({ tombstone: true, mergeAutomatico: true });
  });

  it('H · logout zera a memória; o login seguinte ouve o servidor da conta nova', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true, org: ORG_ZZ });
    zerarFlagEmMemoria(); // logout
    expect(origemConfigSync()).toBe('padrao');
    expect(flagsSync().tombstone).toBe(false);

    await ligar(ap, { online: true, org: ORG_Y });
    expect(flagsSync().tombstone).toBe(false);
    expect(origemConfigSync()).toBe('servidor');
  });

  it('manipular o recibo local não autoriza nada: o servidor vence no boot online', async () => {
    const ap = novoAparelho('A');
    await ligar(ap, { online: true, org: ORG_Y });
    const forjado: ConfigSyncConfirmada = {
      org: ORG_Y, tombstone: true, mergeAutomatico: true, protocolo: 2, confirmadoEm: new Date().toISOString(),
    };
    await aplicarAtomico(ORG_Y, [{ store: 'meta', acao: 'put', chave: CHAVE_CONFIG_SYNC, valor: forjado }]);

    await ligar(ap, { online: true, org: ORG_Y });
    expect(flagsSync()).toMatchObject({ tombstone: false, mergeAutomatico: false });
  });
});

// ===========================================================================
describe('I · primeiro boot offline, sem recibo', () => {
  it('não inventa a Sync V2 ligada — mas a exclusão MARCA e espera o servidor', async () => {
    const apB = novoAparelho('B');
    await baseABC(novoAparelho('X'));
    // B já tinha a lista (bundle anterior, sem recibo), e abre offline
    srv.set(k(ORG_ZZ, CH), srv.get(k(ORG_ZZ, CH))!);
    await ligar(apB, { online: true });
    await gravarNaColecao(CH, (l) => l); // traz a lista para o cache de B
    await aplicarAtomico(ORG_ZZ, [{ store: 'meta', acao: 'delete', chave: CHAVE_CONFIG_SYNC }]); // sem recibo

    await ligar(apB, { online: false });
    expect(origemConfigSync()).toBe('desconhecida');
    expect(flagsSync()).toMatchObject({ tombstone: false, mergeAutomatico: false });

    await removerDaColecao(CH, 'c');
    expect(localLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy(); // não sumiu do blob
    expect(sync.listarFila()).toHaveLength(1);

    await reconectar(); // servidor: tombstone=true → a marca sobe como está
    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('...e se o servidor disser que a org NÃO marca, a marca sai no envio', async () => {
    const apB = novoAparelho('B');
    await baseABC(novoAparelho('X'));
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    await ligar(apB, { online: true });
    await gravarNaColecao(CH, (l) => l);
    await aplicarAtomico(ORG_ZZ, [{ store: 'meta', acao: 'delete', chave: CHAVE_CONFIG_SYNC }]);

    await ligar(apB, { online: false });
    await removerDaColecao(CH, 'c');
    expect(localLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();

    await reconectar();
    expect(servidorLista().map((n) => n.id)).toEqual(['a', 'b']); // exclusão de sempre
    expect(servidorLista().some((n) => n.removidoEm)).toBe(false);
    expect(localLista().map((n) => n.id)).toEqual(['a', 'b']); // aparelho = servidor
    expect(sync.listarFila()).toHaveLength(0);
  });
});

// ===========================================================================
describe('J · rollback true → false com o aparelho offline', () => {
  it('exclusão marcada com o recibo true, servidor desligou: sobe como exclusão clássica', async () => {
    const ap = novoAparelho('B');
    await baseABC(ap);
    await ligar(ap, { online: false });
    await removerDaColecao(CH, 'c'); // marca (recibo true)

    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    await reconectar();

    expect(servidorLista().map((n) => n.id)).toEqual(['a', 'b']);
    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B']); // C continua excluído
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('marca que JÁ foi tentada antes da confirmação sobe marcada — segura, e continua invisível', async () => {
    // Medido no canário R2 (rollback false/false): a exclusão foi gravada com
    // a sessão ainda confirmada (true), a 1ª tentativa falhou por rede, e o
    // descarte da marca só age na 1ª tentativa — reescrever o conteúdo de um
    // mutationId que talvez já tenha chegado arriscaria base divergente.
    const ap = novoAparelho('B');
    await baseABC(ap);
    rede = false; // caiu sem o aparelho reiniciar: a sessão segue "servidor"
    await removerDaColecao(CH, 'c');
    expect(sync.listarFila()[0].tentativas).toBeGreaterThan(0);

    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    await reconectar();

    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy(); // marca subiu
    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B']); // e C segue excluído
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('recibo merge=true, servidor desligou o merge: o conflito NÃO se resolve sozinho', async () => {
    const apA = novoAparelho('A');
    const apB = novoAparelho('B');
    await baseABC(apB);
    desligar();
    await ligar(apA, { online: true });
    await editar('a', 'A2');

    await ligar(apB, { online: false });
    await editar('c', 'C2');
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: false });
    await reconectar();

    expect(sync.listarConflitos().map((c) => c.chave)).toEqual([CH]); // decisão do usuário
    expect(titulosVisiveis(servidorLista())).toEqual(['A2', 'B', 'C']); // nada sobrescrito
    expect(titulosVisiveis(localLista())).toEqual(['A', 'B', 'C2']); // nada perdido
  });
});

// ===========================================================================
describe('K · app_desatualizado é recuperável', () => {
  /** Exclusão clássica pendente (org desligada), e o administrador liga tudo. */
  async function exclusaoClassicaPendente(): Promise<Aparelho> {
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    const ap = novoAparelho('B');
    await baseABC(ap);
    await ligar(ap, { online: false }); // recibo: false
    await removerDaColecao(CH, 'c');
    expect(localLista().map((n) => n.id)).toEqual(['a', 'b']); // tirou, sem marca
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    return ap;
  }

  it('versão confere: a exclusão é refeita COM a marca e passa pela guarda', async () => {
    await exclusaoClassicaPendente();
    await reconectar(); // recusa → prova pela versão → reenvio marcado

    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();
    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B']);
    expect(sync.listarFila()).toHaveLength(0);
    expect(sync.exclusoesSemMarca()).toHaveLength(0);
  });

  it('a lista mudou no servidor: o merge marca pela base e a exclusão não é desfeita', async () => {
    await exclusaoClassicaPendente();
    // outro aparelho criou D enquanto este estava offline
    const atual = srv.get(k(ORG_ZZ, CH))!;
    srv.set(k(ORG_ZZ, CH), { ...atual, valor: JSON.stringify([...JSON.parse(atual.valor!), nota('d')]), versao: atual.versao + 1 });

    await reconectar();

    expect(titulosVisiveis(servidorLista())).toEqual(['A', 'B', 'D']); // C NÃO voltou
    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('sem prova possível, vira decisão do usuário — e "usar a do servidor" desbloqueia', async () => {
    await exclusaoClassicaPendente();
    // A corrida: logo depois da recusa, a chave é excluída no servidor. Não há
    // mais lista contra a qual provar qual item saiu aqui.
    aposRecusa = () => srv.set(k(ORG_ZZ, CH), { valor: null, versao: 5, em: '', disp: null });
    await reconectar();

    const presas = sync.exclusoesSemMarca();
    expect(presas).toHaveLength(1);
    expect(presas[0].erro?.categoria).toBe('app_desatualizado');
    expect(sync.pendenciasSemComparacao()).toHaveLength(0); // não é "excluído em outro aparelho"

    // nunca retentando a mesma recusa
    log = [];
    await sync.drenar();
    expect(log.filter((l) => l.startsWith('rpc:'))).toHaveLength(0);

    // "Usar a versão do servidor": a lista recriada no servidor volta ao aparelho
    srv.set(k(ORG_ZZ, CH), { valor: JSON.stringify([nota('a'), nota('b'), nota('c')]), versao: 6, em: '', disp: null });
    await sync.descartarERestaurar(presas[0].mutationId);
    expect(sync.listarFila()).toHaveLength(0);
    expect(localLista().map((n) => n.id)).toEqual(['a', 'b', 'c']); // visível de novo para excluir
  });
});

// ===========================================================================
describe('passadas da drenagem — o teto de 3 não vira laço', () => {
  it('fila vazia: nenhuma passada chega à rede', async () => {
    await ligar(novoAparelho('A'), { online: true });
    log = [];
    expect(await sync.drenar()).toEqual({ enviados: 0, falhas: 0 });
    expect(log.filter((l) => l.startsWith('rpc:'))).toHaveLength(0);
  });

  it('merge: exatamente DOIS envios numa drenagem — o original e o mesclado, ids distintos, versão +1', async () => {
    const apA = novoAparelho('A');
    const apB = novoAparelho('B');
    await baseABC(apB);
    desligar();
    await ligar(apA, { online: true });
    await editar('a', 'A2');
    const versaoAntes = srv.get(k(ORG_ZZ, CH))!.versao;

    await ligar(apB, { online: false });
    await editar('c', 'C2');
    rede = true;
    idsEnviados = [];
    await sync.drenar();

    expect(idsEnviados).toHaveLength(2); // conflito + mesclado; nenhuma 3ª passada com trabalho
    expect(new Set(idsEnviados).size).toBe(2);
    expect(srv.get(k(ORG_ZZ, CH))!.versao).toBe(versaoAntes + 1);
  });

  it('falha definitiva é contada UMA vez por drenagem e não vai à rede', async () => {
    const ap = novoAparelho('A');
    await baseABC(ap);
    const item = { ...sync.montarItem('set', 'nr13_info_X', '{}', 0), estado: 'falha_definitiva' as const };
    await aplicarAtomico(ORG_ZZ, [{ store: 'fila', acao: 'put', chave: item.mutationId, valor: item }]);
    await ligar(ap, { online: true });
    log = [];
    const r = await sync.drenar();
    expect(r.falhas).toBe(1);
    expect(log.filter((l) => l.startsWith('rpc:'))).toHaveLength(0);
  });

  it('exclusão sem marca SEM prova: um envio, vai para decisão, e a drenagem seguinte não reenvia', async () => {
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: false, sync_merge_automatico: false });
    const ap = novoAparelho('B');
    await baseABC(ap);
    await ligar(ap, { online: false });
    await removerDaColecao(CH, 'c');
    orgSync.set(ORG_ZZ, { v2_ativa: true, sync_tombstone: true, sync_merge_automatico: true });
    aposRecusa = () => srv.set(k(ORG_ZZ, CH), { valor: null, versao: 5, em: '', disp: null });

    rede = true;
    idsEnviados = [];
    await atualizarDoServidor({ reconectou: true });
    expect(idsEnviados).toHaveLength(1);
    expect(sync.exclusoesSemMarca()).toHaveLength(1);

    idsEnviados = [];
    await sync.drenar();
    expect(idsEnviados).toHaveLength(0);
  });
});

// ===========================================================================
describe('L · o cliente antigo verdadeiro continua barrado', () => {
  it('protocolo 1 derrubando um item: a guarda recusa e o servidor não muda', async () => {
    await baseABC(novoAparelho('X'));
    rede = true;
    const r = await rpcFake('aplicar_mutacao_storage', {
      p_chave: CH, p_mutation_id: 'velho-1', p_op: 'set',
      p_valor: JSON.stringify([nota('a'), nota('b')]), p_versao_esperada: 1, p_dispositivo: 'bundle-antigo',
    });
    expect((r.error as { message: string }).message).toMatch(/nr13_exclusao_sem_marca/);
    expect(servidorLista().map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('a fila herdada de um bundle antigo (falha_definitiva) volta a ser tentada e se recupera', async () => {
    const ap = novoAparelho('B');
    await baseABC(ap);
    // o que o bundle anterior deixou no disco: exclusão sem marca, classificada como falha definitiva
    const herdado = {
      ...sync.montarItem('set', CH, JSON.stringify([nota('a'), nota('b')]), 1),
      estado: 'falha_definitiva' as const,
      tentativas: 3,
      erro: { categoria: 'desconhecido', titulo: '', explicacao: '', acao: null,
        detalhe: { codigo: 'P0001', mensagemOriginal: 'nr13_exclusao_sem_marca: o item "c" sumiu', chave: CH, mutationId: 'x', dispositivo: 'x', quando: '' } },
    };
    await aplicarAtomico(ORG_ZZ, [{ store: 'fila', acao: 'put', chave: herdado.mutationId, valor: herdado }]);

    await ligar(ap, { online: true }); // bundle novo
    expect(sync.listarFila()[0].estado).toBe('aguardando');
    await sync.drenar();

    expect(servidorLista().find((n) => n.id === 'c')?.removidoEm).toBeTruthy();
    expect(sync.listarFila()).toHaveLength(0);
  });
});

// ===========================================================================
describe('F · ACK perdido + retry com a configuração nova', () => {
  it('o mesmo mutationId volta repetido, a versão não sobe duas vezes e a base avança', async () => {
    const ap = novoAparelho('A');
    await baseABC(ap);
    perderProximaResposta = true;
    await editar('c', 'C2');
    expect(sync.listarFila()).toHaveLength(1);
    expect(srv.get(k(ORG_ZZ, CH))?.versao).toBe(2); // o servidor aplicou

    await sync.drenar();
    expect(srv.get(k(ORG_ZZ, CH))?.versao).toBe(2); // não reaplicou
    expect(sync.listarFila()).toHaveLength(0);
    expect((await baseDe(CH))?.versao).toBe(2);
  });
});

// ===========================================================================
// CHAVES SINGLETON FORA DO CACHE — "não achei" não é "não existe" (Fase 2)
// ===========================================================================
describe('singleton fora do cache: leitura dirigida antes de escrever', () => {
  const ATUAL = 'nr13_prontuario_atual';
  const ASSIN = 'nr13_assinantes_pront_ZZ-FASE3';
  const linhaSrv = (valor: string | null, versao: number) =>
    ({ valor, versao, em: '2026-09-13T02:58:40Z', disp: 'outro-aparelho' });
  const conflitosDe = (chave: string) => sync.listarConflitos().filter((c) => c.chave === chave && !c.resolucao);
  const leituras = (chave: string) => log.filter((l) => l === `leitura:${chave}`).length;

  it('A/E · servidor tem v99, cache não: base 99, sem conflito (o smoke do prontuário)', async () => {
    srv.set(k(ORG_ZZ, ATUAL), linhaSrv('{"tag":"ZZ-TESTE-VISUAL"}', 99));
    await ligar(novoAparelho('A'), { online: true });
    log = [];
    await salvar(ATUAL, { tag: 'ZZ-FASE3' });

    expect(leituras(ATUAL)).toBe(1);
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 100, valor: '{"tag":"ZZ-FASE3"}' });
    expect(conflitosDe(ATUAL)).toHaveLength(0);
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('F · assinantes EXCLUÍDA no servidor (v2): a base é a da exclusão, recria sem conflito', async () => {
    srv.set(k(ORG_ZZ, ASSIN), linhaSrv(null, 2));
    await ligar(novoAparelho('A'), { online: true });
    await salvar(ASSIN, { engenheiroId: 'eng-1', tecnicoId: null });

    expect(srv.get(k(ORG_ZZ, ASSIN))).toMatchObject({ versao: 3 });
    expect(sync.listarFila()).toHaveLength(0);
    expect(sync.pendenciasSemComparacao()).toHaveLength(0);
  });

  it('B · servidor CONFIRMA ausência: a chave nasce na v1', async () => {
    await ligar(novoAparelho('A'), { online: true });
    await salvar(ATUAL, { tag: 'NOVA' });
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 1 });
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('D/H · chave já no cache (inclusive depois de F5): nenhuma leitura extra', async () => {
    srv.set(k(ORG_ZZ, ATUAL), linhaSrv('{"tag":"X"}', 99));
    const ap = novoAparelho('A');
    await ligar(ap, { online: true });
    await salvar(ATUAL, { tag: 'Y' }); // 1ª: lê
    log = [];
    await salvar(ATUAL, { tag: 'Z' });
    expect(leituras(ATUAL)).toBe(0);

    await ligar(ap, { online: true }); // F5
    log = [];
    await salvar(ATUAL, { tag: 'W' });
    expect(leituras(ATUAL)).toBe(0);
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 102, valor: '{"tag":"W"}' });
  });

  it('C · offline com a chave no servidor: base DESCONHECIDA, nunca 0 afirmado; ao voltar, conflito — sem sobrescrever', async () => {
    srv.set(k(ORG_ZZ, ATUAL), linhaSrv('{"tag":"DO-SERVIDOR"}', 99));
    await ligar(novoAparelho('A'), { online: false });
    await salvar(ATUAL, { tag: 'OFFLINE' });
    const item = sync.listarFila()[0];
    expect(item.baseDesconhecida).toBe(true);
    expect(JSON.parse(obterRegistro(ATUAL)!.valor)).toEqual({ tag: 'OFFLINE' }); // o trabalho local vale

    rede = true;
    await sync.drenar();
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 99, valor: '{"tag":"DO-SERVIDOR"}' }); // intacto
    expect(conflitosDe(ATUAL)).toHaveLength(1); // as duas versões preservadas
    expect(log.filter((l) => l.startsWith(`rpc:${ATUAL}`))).toHaveLength(0); // nada enviado às cegas
  });

  it('C · offline, e o servidor tem o MESMO valor: adota a versão e sai da fila', async () => {
    srv.set(k(ORG_ZZ, ATUAL), linhaSrv('{"tag":"IGUAL"}', 99));
    await ligar(novoAparelho('A'), { online: false });
    await salvar(ATUAL, { tag: 'IGUAL' });
    rede = true;
    await sync.drenar();
    expect(sync.listarFila()).toHaveLength(0);
    expect(obterRegistro(ATUAL)!.versao).toBe(99);
    expect(srv.get(k(ORG_ZZ, ATUAL))!.versao).toBe(99);
  });

  it('C · offline e o servidor confirma ausência ao voltar: envia como chave nova', async () => {
    await ligar(novoAparelho('A'), { online: false });
    await salvar(ATUAL, { tag: 'SO-AQUI' });
    rede = true;
    await sync.drenar();
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 1, valor: '{"tag":"SO-AQUI"}' });
    expect(sync.listarFila()).toHaveLength(0);
  });

  it('G · base desconhecida e OUTRO aparelho criou a chave nesse meio-tempo: conflito, nunca overwrite', async () => {
    await ligar(novoAparelho('A'), { online: false });
    await salvar(ATUAL, { tag: 'DESTE-APARELHO' });
    srv.set(k(ORG_ZZ, ATUAL), linhaSrv('{"tag":"DO-OUTRO"}', 1)); // o outro aparelho gravou
    rede = true;
    await sync.drenar();
    expect(srv.get(k(ORG_ZZ, ATUAL))).toMatchObject({ versao: 1, valor: '{"tag":"DO-OUTRO"}' });
    expect(conflitosDe(ATUAL)).toHaveLength(1);
  });

  it('chave VIVA que não é cópia de trabalho ("não achei, então crio"): nunca sobrescreve — conflito', async () => {
    // O padrão de `obterOuCriarMeta`: a tela não achou o número no cache e
    // criou outro. Adotar a versão do servidor apagaria o número existente.
    const META = 'nr13_prontuario_meta_ZZ-X';
    srv.set(k(ORG_ZZ, META), linhaSrv('{"numero":"REL-EXISTENTE"}', 5));
    await ligar(novoAparelho('A'), { online: true });
    await salvar(META, { numero: 'REL-NOVO' });

    expect(srv.get(k(ORG_ZZ, META))).toMatchObject({ versao: 5, valor: '{"numero":"REL-EXISTENTE"}' });
    expect(conflitosDe(META)).toHaveLength(1); // as duas versões preservadas, decisão do usuário
  });

  it('a mesma chave viva, gravada com o MESMO valor: adota a versão, sem conflito', async () => {
    const META = 'nr13_prontuario_meta_ZZ-X';
    srv.set(k(ORG_ZZ, META), linhaSrv('{"numero":"REL-EXISTENTE"}', 5));
    await ligar(novoAparelho('A'), { online: true });
    await salvar(META, { numero: 'REL-EXISTENTE' });
    expect(sync.listarFila()).toHaveLength(0);
    expect(conflitosDe(META)).toHaveLength(0);
    expect(obterRegistro(META)!.versao).toBe(5);
  });

  it('G · base desconhecida e o servidor EXCLUIU a chave: vira "excluído em outro aparelho"', async () => {
    srv.set(k(ORG_ZZ, ASSIN), linhaSrv(null, 2));
    await ligar(novoAparelho('A'), { online: false });
    await salvar(ASSIN, { engenheiroId: 'eng-1', tecnicoId: null });
    rede = true;
    await sync.drenar();
    const presos = sync.pendenciasSemComparacao();
    expect(presos.map((i) => i.chave)).toEqual([ASSIN]);
    expect(presos[0].versaoServidor).toBe(2);
    expect(srv.get(k(ORG_ZZ, ASSIN))).toMatchObject({ versao: 2, valor: null });
  });
});

// ===========================================================================
// "DESCARTAR A MINHA" / "USAR A DO SERVIDOR" ALINHAM O CACHE AO SERVIDOR
// ===========================================================================
describe('resolver conflito deixa o aparelho igual ao servidor', () => {
  const ASSIN = 'nr13_assinantes_pront_ZZ-FASE3';
  const META = 'nr13_prontuario_meta_ZZ-X';
  const OUTRA = 'nr13_prontuario_meta_ZZ-OUTRA';
  const linhaSrv = (valor: string | null, versao: number) =>
    ({ valor, versao, em: '2026-08-19T13:24:30Z', disp: 'outro-aparelho' });

  /** O estado exato do smoke da Fase 2: a chave está EXCLUÍDA no servidor. */
  async function pendenciaComServidorExcluido(ap: Aparelho) {
    srv.set(k(ORG_ZZ, ASSIN), linhaSrv(null, 2));
    srv.set(k(ORG_ZZ, OUTRA), linhaSrv('{"numero":"REL-OUTRA"}', 3));
    await ligar(ap, { online: true });
    await salvar(OUTRA, { numero: 'REL-OUTRA' }); // outra chave no cache, igual ao servidor
    rede = false;
    await salvar(ASSIN, { engenheiroId: 'eng-1', tecnicoId: null });
    rede = true;
    await sync.drenar();
    const [item] = sync.pendenciasSemComparacao();
    expect(item?.chave).toBe(ASSIN);
    return item;
  }

  it('B · servidor EXCLUÍDO + "Descartar a minha": a cópia local sai do cache', async () => {
    const ap = novoAparelho('A');
    const item = await pendenciaComServidorExcluido(ap);
    expect(obterRegistro(ASSIN)).toBeTruthy(); // antes: o fantasma
    await sync.descartarPendencia(item.mutationId);
    expect(obterRegistro(ASSIN)).toBeNull();
    expect(sync.listarFila()).toHaveLength(0);
    expect(srv.get(k(ORG_ZZ, ASSIN))).toMatchObject({ versao: 2, valor: null }); // servidor intacto
  });

  it('C · F5 depois de descartar: o valor não reaparece', async () => {
    const ap = novoAparelho('A');
    const item = await pendenciaComServidorExcluido(ap);
    await sync.descartarPendencia(item.mutationId);
    await ligar(ap, { online: true });
    expect(obterRegistro(ASSIN)).toBeNull();
  });

  it('D · reabrir OFFLINE depois de descartar: o valor não reaparece', async () => {
    const ap = novoAparelho('A');
    const item = await pendenciaComServidorExcluido(ap);
    await sync.descartarPendencia(item.mutationId);
    await ligar(ap, { online: false });
    expect(obterRegistro(ASSIN)).toBeNull();
  });

  it('F · descartar uma chave não toca em nenhuma outra', async () => {
    const ap = novoAparelho('A');
    const item = await pendenciaComServidorExcluido(ap);
    await sync.descartarPendencia(item.mutationId);
    expect(JSON.parse(obterRegistro(OUTRA)!.valor)).toEqual({ numero: 'REL-OUTRA' });
    expect(obterRegistro(OUTRA)!.versao).toBe(3);
  });

  it('sem resposta do servidor, descartar não decide nada: a cópia local fica', async () => {
    const ap = novoAparelho('A');
    const item = await pendenciaComServidorExcluido(ap);
    rede = false;
    await sync.descartarPendencia(item.mutationId);
    expect(obterRegistro(ASSIN)).toBeTruthy();
  });

  it('A/E · conflito com valor VIVO + "Usar a do servidor": o cache recebe o valor do servidor (inalterado)', async () => {
    srv.set(k(ORG_ZZ, META), linhaSrv('{"numero":"REL-EXISTENTE"}', 5));
    await ligar(novoAparelho('A'), { online: true });
    await salvar(META, { numero: 'REL-NOVO' });
    expect(sync.listarConflitos().filter((c) => c.chave === META && !c.resolucao)).toHaveLength(1);

    await sync.resolverUsandoServidor(META);
    expect(JSON.parse(obterRegistro(META)!.valor)).toEqual({ numero: 'REL-EXISTENTE' });
    expect(obterRegistro(META)!.versao).toBe(5);
    expect(sync.listarFila()).toHaveLength(0);
  });
});
