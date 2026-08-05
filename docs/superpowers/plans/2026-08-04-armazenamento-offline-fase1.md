# Armazenamento offline-first — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o `localStorage` do papel de banco primário — `ler()` passa a servir de um `Map` em memória espelhado no IndexedDB, com fila de sincronização idempotente e erro sempre visível — devolvendo os 38 equipamentos da conta `cmam.caldeiras@gmail.com` e matando o teto de 5 MB.

**Architecture:** Quatro camadas com dono único (§3 do spec): Supabase é a verdade, IndexedDB (`nr13_dados_<org_id>`) é o espelho durável, um `Map` em memória serve as leituras síncronas, e o `localStorage` fica só como **palco** do documento aberto para os 40+ templates HTML em iframe, que não mudam uma linha. Nada é apagado localmente por ausência no servidor: a única causa de remoção é um tombstone explícito.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand, Supabase JS v2, Vitest (`environment: 'node'`), IndexedDB nativo, `fake-indexeddb` nos testes.

**Spec:** `docs/superpowers/specs/2026-08-04-armazenamento-offline-design.md` — leia antes de começar. Este plano cobre **só a Fase 1** (§13). Fases 2 e 3 terão planos próprios.

## Global Constraints

- **Nenhum `catch {}` vazio no caminho de dados.** Todo catch reporta ao `sync.ts` (§9.3).
- **Nada é apagado localmente por não ter voltado do servidor.** Só tombstone explícito remove (§3.2, §7.3).
- **Nenhuma versão é descartada sem alguém escolher** (§7.2, §7.4).
- **Nenhuma mensagem crua do Supabase na tela principal.** Sempre texto compreensível + bloco "Detalhes técnicos" (§9.1).
- `ORCAMENTO_DOC = 3_400 * 1024` bytes · `ORCAMENTO_IMG = 110 * 1024` bytes · `LARGURA_REL = 900` px (§5.1).
- Degradação do palco em passos determinísticos: qualidade `0.6 → 0.45 → 0.35`, depois largura `900 → 700 → 560` (§5.3).
- Escrita no palco é **tudo ou nada**, com rollback explícito (§5.4).
- Coleta de tombstones: 30 dias, e o `DELETE` físico **nunca** remove a prova da exclusão (§7.4).
- `ler()` **continua síncrono**. Mudar a assinatura quebra ~50 pontos de chamada e está fora de escopo.
- A API pública de `src/services/storage.ts` que outros módulos importam hoje deve continuar existindo: `ler`, `salvar`, `lerTudo`, `listarChavesComPrefixo`, `excluirChave`, `excluirVaso`, `limparCacheDados`, `flushFila`, `bloqueadoParaEscrita`, `lerRemoto`.
- Commits em português, formato do repo (`feat(escopo): ...`). Branch `main`.
- Fechar com `npm run build` — o `tsc -b` do deploy é mais estrito que `tsc --noEmit`.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade única |
|---|---|
| `vitest.setup.ts` | shims de `localStorage`/IndexedDB para todos os testes |
| `src/services/db.ts` | acesso cru ao IndexedDB, namespace por org. Não conhece regra de negócio |
| `src/services/cacheLocal.ts` | o `Map` + espelho no `db.ts` + índice de chaves por TAG. Não conhece rede |
| `src/services/errosSync.ts` | classificação e tradução de erro + detalhe técnico. Sem dependências |
| `src/services/sync.ts` | fila durável, `mutationId`, drenagem, versionamento, tombstones. Não conhece UI |
| `src/services/manifesto.ts` | manifesto de pendências no `localStorage` e detecção (parcial) de despejo |
| `src/services/quotaDispositivo.ts` | `persist()`, `estimate()`, limiares de aviso |
| `src/services/palco.ts` | orçamento, variante de relatório, materialização e rollback |
| `src/components/SeloSync.tsx` | selo agregado no Layout |
| `src/pages/Pendencias.tsx` | tela `/pendencias` |
| `supabase/armazenamento_v2.sql` | colunas, `app_storage_excluidos`, trigger de piso, `sync_corte`, policies |
| `src/services/pisoVersao.ts` | espelho em TS da regra do trigger, para checagem no cliente e teste de consistência |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `vite.config.ts` | registrar `setupFiles` |
| `src/services/storage.ts` | vira orquestrador fino sobre os módulos acima |
| `src/services/auth.ts:475-489` | troca de conta limpa `Map`, palco e fecha o IndexedDB |
| `src/app/Layout.tsx` | montar `<SeloSync/>` e a rota `/pendencias` |
| `public/sb-storage.js` | escrita dos templates passa pela fila do app |
| `src/pages/Relatorios.tsx`, `Prontuarios.tsx`, `LivroRegistro.tsx` | `prepararPalco` / `limparPalco` ao redor dos iframes |
| `src/services/storage.gate.test.ts` | bloqueado agora **erra**, não finge |

---

## Task 1: Infraestrutura de teste (IndexedDB no Vitest)

**Files:**
- Create: `vitest.setup.ts`
- Modify: `vite.config.ts` (bloco `test`)
- Modify: `package.json` (devDependency)
- Test: `src/services/db.smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: ambiente de teste com `globalThis.localStorage` e `globalThis.indexedDB` funcionais em todos os `src/**/*.test.ts`.

O repo hoje shima `localStorage` à mão em cada arquivo de teste (`storage.gate.test.ts:5-15`, `vencimentos.test.ts`, `auth.test.ts`). O shim central é aditivo: aqueles arquivos checam `typeof globalThis.localStorage === 'undefined'` antes de instalar, então continuam funcionando sem alteração.

- [ ] **Step 1: Instalar a dependência de teste**

```bash
npm install --save-dev fake-indexeddb
```

- [ ] **Step 2: Criar o setup**

```ts
// vitest.setup.ts
// Vitest roda em environment 'node': nem localStorage nem IndexedDB existem.
// Este setup instala os dois para TODOS os testes. Os arquivos que já shimavam
// localStorage à mão checam `typeof === 'undefined'` antes, então seguem intactos.
import 'fake-indexeddb/auto';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
```

- [ ] **Step 3: Registrar no vite.config.ts**

No bloco `test`, acrescentar `setupFiles`:

```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
```

- [ ] **Step 4: Escrever o teste de fumaça**

```ts
// src/services/db.smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('ambiente de teste', () => {
  it('tem indexedDB disponível', () => {
    expect(typeof indexedDB).toBe('object');
    expect(typeof indexedDB.open).toBe('function');
  });

  it('tem localStorage disponível', () => {
    localStorage.setItem('x', '1');
    expect(localStorage.getItem('x')).toBe('1');
    localStorage.clear();
  });
});
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/services/db.smoke.test.ts`
Expected: PASS, 2 testes.

- [ ] **Step 6: Rodar a suíte inteira para garantir que nada quebrou**

Run: `npm test`
Expected: PASS — os testes que já existiam continuam verdes.

- [ ] **Step 7: Commit**

```bash
git add vitest.setup.ts vite.config.ts package.json package-lock.json src/services/db.smoke.test.ts
git commit -m "test(infra): setup central com indexedDB (fake-indexeddb) e localStorage"
```

---

## Task 2: SQL da Fase 1 + espelho da regra de piso em TS

**Files:**
- Create: `supabase/armazenamento_v2.sql`
- Create: `src/services/pisoVersao.ts`
- Test: `src/services/pisoVersao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `aceitaEscrita(args: ArgsPiso): ResultadoPiso` — usada por `sync.ts` (Task 7) para pré-checagem no cliente antes de gastar uma ida ao servidor.

O repo já usa este padrão de espelho front↔servidor em `src/features/assinatura/__tests__/consistenciaEdge.test.ts`. A **autoridade é o SQL**; o TS é conveniência e trava de regressão.

- [ ] **Step 1: Escrever o SQL**

```sql
-- supabase/armazenamento_v2.sql
-- Fase 1 do spec 2026-08-04-armazenamento-offline-design.md. IDEMPOTENTE.
-- Rodar no SQL Editor do Supabase.

-- ── 1. Versionamento e soft-delete em app_storage ──────────────────────────
alter table public.app_storage add column if not exists versao      integer not null default 1;
alter table public.app_storage add column if not exists dispositivo text;
alter table public.app_storage add column if not exists deletado_em timestamptz;

create index if not exists app_storage_deletado_idx
  on public.app_storage (org_id, deletado_em);

-- ── 2. Historico permanente de exclusoes (§7.4a) ───────────────────────────
-- Guarda so identidade e numero de versao. E o que sobrevive ao DELETE fisico
-- da linha: sem isso, um aparelho offline por mais tempo que o prazo de coleta
-- volta e RESSUSCITA o dado excluido.
create table if not exists public.app_storage_excluidos (
  org_id       uuid        not null,
  chave        text        not null,
  versao_final integer     not null,
  excluido_em  timestamptz not null default now(),
  primary key (org_id, chave)
);

alter table public.app_storage_excluidos enable row level security;

drop policy if exists excluidos_select_org on public.app_storage_excluidos;
create policy excluidos_select_org on public.app_storage_excluidos
  for select using (org_id = public.org_atual());

-- ── 3. Corte de sincronizacao por org (§7.4c) ──────────────────────────────
alter table public.profiles add column if not exists sync_corte timestamptz;

-- ── 4. Trigger do piso de versao (§7.4b) ───────────────────────────────────
-- Validado NO SERVIDOR de proposito: o cliente desatualizado e a ameaca.
create or replace function public.checar_piso_versao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_final integer;
begin
  select versao_final into v_final
    from public.app_storage_excluidos
   where org_id = new.org_id and chave = new.chave;

  if v_final is not null and new.versao <= v_final then
    raise exception 'nr13_versao_obsoleta: chave % foi excluida na versao %, escrita tentou versao %',
      new.chave, v_final, new.versao
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_checar_piso_versao on public.app_storage;
create trigger trg_checar_piso_versao
  before insert or update on public.app_storage
  for each row execute function public.checar_piso_versao();

-- ── 5. Coleta de lixo: o valor sai, a PROVA da exclusao fica ───────────────
create or replace function public.coletar_tombstones(dias integer default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.app_storage_excluidos (org_id, chave, versao_final, excluido_em)
  select org_id, chave, versao, deletado_em
    from public.app_storage
   where deletado_em is not null
     and deletado_em < now() - (dias || ' days')::interval
  on conflict (org_id, chave) do update
     set versao_final = greatest(public.app_storage_excluidos.versao_final, excluded.versao_final);

  delete from public.app_storage
   where deletado_em is not null
     and deletado_em < now() - (dias || ' days')::interval;

  get diagnostics n = row_count;

  update public.profiles set sync_corte = now() - (dias || ' days')::interval;
  return n;
end $$;

-- ── 6. Bucket de fotos (criado aqui, usado na Fase 2) ──────────────────────
insert into storage.buckets (id, name, public)
values ('inspecao', 'inspecao', false)
on conflict (id) do nothing;

drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (bucket_id = 'inspecao' and (storage.foldername(name))[1] = public.org_atual()::text);

drop policy if exists inspecao_escrita on storage.objects;
create policy inspecao_escrita on storage.objects for insert
  with check (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

drop policy if exists inspecao_remocao on storage.objects;
create policy inspecao_remocao on storage.objects for delete
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );
```

- [ ] **Step 2: Escrever o teste da regra de piso (falha primeiro)**

```ts
// src/services/pisoVersao.test.ts
import { describe, it, expect } from 'vitest';
import { aceitaEscrita } from './pisoVersao';

const BASE = { excluidoVersaoFinal: null, criadoEm: '2026-08-04T12:00:00.000Z', syncCorte: null };

describe('aceitaEscrita — espelho do trigger checar_piso_versao (SQL é a autoridade)', () => {
  it('chave nunca excluída -> aceita', () => {
    expect(aceitaEscrita({ ...BASE, versao: 5 })).toEqual({ aceita: true });
  });

  it('versão MENOR que a final excluída -> rejeita (ressurreição)', () => {
    const r = aceitaEscrita({ ...BASE, versao: 3, excluidoVersaoFinal: 7 });
    expect(r).toEqual({ aceita: false, motivo: 'versao_obsoleta' });
  });

  it('versão IGUAL à final excluída -> rejeita (limite inclusivo, igual ao SQL)', () => {
    const r = aceitaEscrita({ ...BASE, versao: 7, excluidoVersaoFinal: 7 });
    expect(r).toEqual({ aceita: false, motivo: 'versao_obsoleta' });
  });

  it('versão MAIOR que a final excluída -> aceita (recriar a chave é legítimo)', () => {
    expect(aceitaEscrita({ ...BASE, versao: 8, excluidoVersaoFinal: 7 })).toEqual({ aceita: true });
  });

  it('mutação anterior ao corte da org -> rejeita mesmo sem histórico de exclusão', () => {
    const r = aceitaEscrita({
      ...BASE,
      versao: 99,
      criadoEm: '2026-06-01T00:00:00.000Z',
      syncCorte: '2026-07-05T00:00:00.000Z',
    });
    expect(r).toEqual({ aceita: false, motivo: 'anterior_ao_corte' });
  });

  it('mutação posterior ao corte -> aceita', () => {
    const r = aceitaEscrita({
      ...BASE,
      versao: 99,
      criadoEm: '2026-08-01T00:00:00.000Z',
      syncCorte: '2026-07-05T00:00:00.000Z',
    });
    expect(r).toEqual({ aceita: true });
  });

  it('corte com data corrompida -> não bloqueia por corte (o servidor é quem decide)', () => {
    const r = aceitaEscrita({ ...BASE, versao: 9, syncCorte: 'lixo' });
    expect(r).toEqual({ aceita: true });
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha**

Run: `npx vitest run src/services/pisoVersao.test.ts`
Expected: FAIL — `Failed to resolve import "./pisoVersao"`.

- [ ] **Step 4: Implementar**

```ts
// src/services/pisoVersao.ts
/**
 * Espelho em TypeScript da regra do trigger `checar_piso_versao` (§7.4 do spec).
 * A AUTORIDADE é o SQL — o cliente desatualizado é a própria ameaça, então a
 * validação real acontece no servidor. Isto aqui é (a) pré-checagem para não
 * gastar uma ida à rede com uma escrita fadada a falhar e (b) trava de
 * regressão: se a regra mudar no SQL sem mudar aqui, o teste denuncia.
 */
export interface ArgsPiso {
  versao: number;
  excluidoVersaoFinal: number | null;
  criadoEm: string;
  syncCorte: string | null;
}

export type MotivoRecusa = 'versao_obsoleta' | 'anterior_ao_corte';
export type ResultadoPiso = { aceita: true } | { aceita: false; motivo: MotivoRecusa };

export function aceitaEscrita(args: ArgsPiso): ResultadoPiso {
  if (args.excluidoVersaoFinal !== null && args.versao <= args.excluidoVersaoFinal) {
    return { aceita: false, motivo: 'versao_obsoleta' };
  }
  if (args.syncCorte) {
    const corte = new Date(args.syncCorte).getTime();
    const criado = new Date(args.criadoEm).getTime();
    // Data corrompida não bloqueia: quem decide de verdade é o servidor, e
    // bloquear por lixo local travaria o usuário sem motivo.
    if (Number.isFinite(corte) && Number.isFinite(criado) && criado < corte) {
      return { aceita: false, motivo: 'anterior_ao_corte' };
    }
  }
  return { aceita: true };
}
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/services/pisoVersao.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/armazenamento_v2.sql src/services/pisoVersao.ts src/services/pisoVersao.test.ts
git commit -m "feat(armazenamento): SQL da fase 1 (versao, soft-delete, piso de versao) + espelho em TS"
```

> **Pendência de deploy (manual, pelo dono do projeto):** rodar `supabase/armazenamento_v2.sql` no SQL Editor. Registrar em `PENDENCIAS.md` na Task 16.

---

## Task 3: `db.ts` — IndexedDB com namespace por organização

**Files:**
- Create: `src/services/db.ts`
- Test: `src/services/db.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `abrirDb(orgId: string): Promise<IDBDatabase>`
  - `guardar(orgId: string, store: NomeStore, chave: string, valor: unknown): Promise<void>`
  - `obter<T>(orgId: string, store: NomeStore, chave: string): Promise<T | null>`
  - `listarTudo<T>(orgId: string, store: NomeStore): Promise<Array<{ chave: string; valor: T }>>`
  - `remover(orgId: string, store: NomeStore, chave: string): Promise<void>`
  - `fecharDb(): void`
  - `apagarDb(orgId: string): Promise<void>`
  - `type NomeStore = 'dados' | 'fila' | 'tombstones' | 'meta'`

Namespace por org é o que substitui o `reconcile` como mecanismo de isolamento entre contas (§3.2, §10).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { guardar, obter, listarTudo, remover, fecharDb, apagarDb } from './db';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

beforeEach(async () => {
  fecharDb();
  await apagarDb(ORG_A);
  await apagarDb(ORG_B);
});

describe('db — IndexedDB com namespace por org', () => {
  it('guarda e lê de volta', async () => {
    await guardar(ORG_A, 'dados', 'nr13_info_X', { valor: '{"tag":"X"}', versao: 1 });
    expect(await obter(ORG_A, 'dados', 'nr13_info_X')).toEqual({ valor: '{"tag":"X"}', versao: 1 });
  });

  it('chave ausente devolve null', async () => {
    expect(await obter(ORG_A, 'dados', 'nao_existe')).toBeNull();
  });

  it('ISOLAMENTO: dado da org A não aparece na org B', async () => {
    await guardar(ORG_A, 'dados', 'nr13_info_X', { valor: 'a' });
    expect(await obter(ORG_B, 'dados', 'nr13_info_X')).toBeNull();
  });

  it('listarTudo devolve só a store pedida', async () => {
    await guardar(ORG_A, 'dados', 'k1', { valor: '1' });
    await guardar(ORG_A, 'dados', 'k2', { valor: '2' });
    await guardar(ORG_A, 'fila', 'm1', { op: 'set' });
    const dados = await listarTudo(ORG_A, 'dados');
    expect(dados.map((d) => d.chave).sort()).toEqual(['k1', 'k2']);
  });

  it('remover apaga a chave', async () => {
    await guardar(ORG_A, 'dados', 'k1', { valor: '1' });
    await remover(ORG_A, 'dados', 'k1');
    expect(await obter(ORG_A, 'dados', 'k1')).toBeNull();
  });

  it('apagarDb zera a org inteira', async () => {
    await guardar(ORG_A, 'dados', 'k1', { valor: '1' });
    fecharDb();
    await apagarDb(ORG_A);
    expect(await obter(ORG_A, 'dados', 'k1')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/db.test.ts`
Expected: FAIL — `Failed to resolve import "./db"`.

- [ ] **Step 3: Implementar**

```ts
// src/services/db.ts
/**
 * Acesso cru ao IndexedDB, com um banco POR ORGANIZAÇÃO (`nr13_dados_<org_id>`).
 *
 * O namespace por org é o que substitui o antigo `reconcile` do storage.ts como
 * mecanismo de isolamento entre contas — e sem o efeito colateral que causou o
 * bug original (apagar dado local por ele "não ter voltado do servidor").
 *
 * Este módulo não conhece regra de negócio: quem decide o que guardar é o
 * cacheLocal.ts (dados) e o sync.ts (fila/tombstones).
 */
export type NomeStore = 'dados' | 'fila' | 'tombstones' | 'meta';
const STORES: NomeStore[] = ['dados', 'fila', 'tombstones', 'meta'];
const VERSAO_SCHEMA = 1;

const nomeDb = (orgId: string) => `nr13_dados_${orgId}`;

let conexao: { orgId: string; db: Promise<IDBDatabase> } | null = null;

export function fecharDb(): void {
  if (!conexao) return;
  const anterior = conexao;
  conexao = null;
  void anterior.db.then((db) => db.close()).catch(() => undefined);
}

export function abrirDb(orgId: string): Promise<IDBDatabase> {
  if (conexao && conexao.orgId === orgId) return conexao.db;
  fecharDb(); // trocou de org: nunca reaproveitar a conexão anterior
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(nomeDb(orgId), VERSAO_SCHEMA);
    req.onupgradeneeded = () => {
      for (const s of STORES) {
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
  conexao = { orgId, db };
  // Falha na abertura não pode "grudar": zera para a próxima chamada tentar de novo.
  db.catch(() => { if (conexao?.db === db) conexao = null; });
  return db;
}

function transacao<T>(
  orgId: string,
  store: NomeStore,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrirDb(orgId).then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, modo);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error(`falha em ${store}`));
      }),
  );
}

export function guardar(orgId: string, store: NomeStore, chave: string, valor: unknown): Promise<void> {
  return transacao(orgId, store, 'readwrite', (s) => s.put(valor, chave)).then(() => undefined);
}

export async function obter<T>(orgId: string, store: NomeStore, chave: string): Promise<T | null> {
  const v = await transacao<T | undefined>(orgId, store, 'readonly', (s) => s.get(chave));
  return v ?? null;
}

export async function listarTudo<T>(
  orgId: string,
  store: NomeStore,
): Promise<Array<{ chave: string; valor: T }>> {
  const chaves = await transacao<IDBValidKey[]>(orgId, store, 'readonly', (s) => s.getAllKeys());
  const valores = await transacao<T[]>(orgId, store, 'readonly', (s) => s.getAll());
  return chaves.map((c, i) => ({ chave: String(c), valor: valores[i] }));
}

export function remover(orgId: string, store: NomeStore, chave: string): Promise<void> {
  return transacao(orgId, store, 'readwrite', (s) => s.delete(chave)).then(() => undefined);
}

export function apagarDb(orgId: string): Promise<void> {
  fecharDb();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(nomeDb(orgId));
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // best-effort: não travar logout por causa disso
    req.onblocked = () => resolve();
  });
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/db.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/db.ts src/services/db.test.ts
git commit -m "feat(armazenamento): db.ts com IndexedDB por organizacao"
```

---

## Task 4: `cacheLocal.ts` — o `Map` que substitui o `localStorage`

**Files:**
- Create: `src/services/cacheLocal.ts`
- Test: `src/services/cacheLocal.test.ts`

**Interfaces:**
- Consumes: `db.ts` (Task 3).
- Produces:
  - `type Registro = { valor: string; versao: number; atualizadoEm: string; dispositivo: string | null }`
  - `definirOrg(orgId: string | null): void`
  - `orgAtual(): string | null`
  - `obterRegistro(chave: string): Registro | null` — **síncrono**
  - `gravarRegistro(chave: string, reg: Registro): void` — síncrono no Map, assíncrono no IndexedDB
  - `removerRegistro(chave: string): void`
  - `chaves(): string[]`
  - `chavesComPrefixo(prefixo: string): string[]`
  - `chavesDaTag(tag: string): string[]`
  - `hidratarDoDisco(): Promise<number>`
  - `zerarMemoria(): void`

`chavesDaTag` é o índice que substitui o casamento por sufixo `_<TAG>` do `excluirVaso` (D7).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/cacheLocal.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fecharDb, apagarDb } from './db';
import {
  definirOrg, obterRegistro, gravarRegistro, removerRegistro,
  chavesComPrefixo, chavesDaTag, hidratarDoDisco, zerarMemoria,
} from './cacheLocal';

const ORG = '11111111-1111-1111-1111-111111111111';
const reg = (valor: string) => ({ valor, versao: 1, atualizadoEm: '2026-08-04T12:00:00.000Z', dispositivo: 'd1' });

beforeEach(async () => {
  zerarMemoria();
  fecharDb();
  await apagarDb(ORG);
  definirOrg(ORG);
});

describe('cacheLocal', () => {
  it('lê de volta de forma SÍNCRONA o que acabou de gravar', () => {
    gravarRegistro('nr13_info_A', reg('{"tag":"A"}'));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });

  it('chave ausente devolve null', () => {
    expect(obterRegistro('nada')).toBeNull();
  });

  it('não tem teto de 5 MB: 40 chaves de 200 KB cabem', () => {
    const gordo = 'x'.repeat(200 * 1024);
    for (let i = 0; i < 40; i++) gravarRegistro(`nr13_fotos_T${i}`, reg(gordo));
    for (let i = 0; i < 38; i++) gravarRegistro(`nr13_info_T${i}`, reg('{}'));
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(38);
  });

  it('chavesDaTag NÃO casa uma TAG que é sufixo de outra', () => {
    gravarRegistro('nr13_info_B', reg('{}'));
    gravarRegistro('nr13_info_A_B', reg('{}'));
    gravarRegistro('nr13_calc_A_B', reg('{}'));
    expect(chavesDaTag('B')).toEqual(['nr13_info_B']);
    expect(chavesDaTag('A_B').sort()).toEqual(['nr13_calc_A_B', 'nr13_info_A_B']);
  });

  it('removerRegistro tira do Map e do índice', () => {
    gravarRegistro('nr13_info_A', reg('{}'));
    removerRegistro('nr13_info_A');
    expect(obterRegistro('nr13_info_A')).toBeNull();
    expect(chavesDaTag('A')).toEqual([]);
  });

  it('hidratarDoDisco repovoa a memória a partir do IndexedDB (reabrir offline)', async () => {
    gravarRegistro('nr13_info_A', reg('{"tag":"A"}'));
    await new Promise((r) => setTimeout(r, 20)); // deixa o espelho assíncrono terminar
    zerarMemoria();
    expect(obterRegistro('nr13_info_A')).toBeNull();
    const n = await hidratarDoDisco();
    expect(n).toBe(1);
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/cacheLocal.test.ts`
Expected: FAIL — `Failed to resolve import "./cacheLocal"`.

- [ ] **Step 3: Implementar**

```ts
// src/services/cacheLocal.ts
/**
 * O cache de leitura do app: um Map em memória, espelhado no IndexedDB.
 *
 * POR QUE EXISTE: até 04/08/2026 o cache era o localStorage, com 5 MB para a
 * origem inteira. Medido em produção, a conta cmam.caldeiras precisava de
 * 5.692 KB e NENHUM dos seus 38 equipamentos conseguia entrar no cache — a
 * hidratação, ordenada por nome, estourava dentro de `nr13_fotos_` e nunca
 * chegava em `nr13_info_`. Memória e IndexedDB não têm esse teto.
 *
 * `obterRegistro` é SÍNCRONO de propósito: `ler()` do storage.ts é síncrono e
 * tem ~50 pontos de chamada. Trocar a assinatura estava fora de escopo.
 */
import { guardar, listarTudo, remover } from './db';

export interface Registro {
  valor: string;
  versao: number;
  atualizadoEm: string;
  dispositivo: string | null;
}

const memoria = new Map<string, Registro>();
// Índice TAG -> chaves. Substitui o casamento por sufixo `_<TAG>` do
// excluirVaso, que apagava o equipamento errado quando uma TAG era sufixo de
// outra ("B" casava "nr13_info_A_B").
const porTag = new Map<string, Set<string>>();
let orgId: string | null = null;

/** Extrai a TAG de uma chave `nr13_<familia>_<TAG>`. Sem TAG, devolve null. */
function tagDaChave(chave: string): string | null {
  const m = /^nr13_[a-z0-9]+(?:_[a-z0-9]+)*?_(.+)$/i.exec(chave);
  return m ? m[1] : null;
}

function indexar(chave: string): void {
  const tag = tagDaChave(chave);
  if (!tag) return;
  if (!porTag.has(tag)) porTag.set(tag, new Set());
  porTag.get(tag)!.add(chave);
}

function desindexar(chave: string): void {
  const tag = tagDaChave(chave);
  if (!tag) return;
  const set = porTag.get(tag);
  if (!set) return;
  set.delete(chave);
  if (set.size === 0) porTag.delete(tag);
}

export function definirOrg(id: string | null): void { orgId = id; }
export function orgAtual(): string | null { return orgId; }

export function obterRegistro(chave: string): Registro | null {
  return memoria.get(chave) ?? null;
}

export function gravarRegistro(chave: string, reg: Registro): void {
  memoria.set(chave, reg);
  indexar(chave);
  if (orgId) void guardar(orgId, 'dados', chave, reg).catch(() => undefined);
}

export function removerRegistro(chave: string): void {
  memoria.delete(chave);
  desindexar(chave);
  if (orgId) void remover(orgId, 'dados', chave).catch(() => undefined);
}

export function chaves(): string[] { return [...memoria.keys()]; }

export function chavesComPrefixo(prefixo: string): string[] {
  return [...memoria.keys()].filter((c) => c.startsWith(prefixo));
}

export function chavesDaTag(tag: string): string[] {
  return [...(porTag.get(tag) ?? [])];
}

export function zerarMemoria(): void {
  memoria.clear();
  porTag.clear();
}

/** Repovoa a memória a partir do IndexedDB. É o caminho do boot 100% offline. */
export async function hidratarDoDisco(): Promise<number> {
  if (!orgId) return 0;
  const linhas = await listarTudo<Registro>(orgId, 'dados');
  for (const { chave, valor } of linhas) {
    memoria.set(chave, valor);
    indexar(chave);
  }
  return linhas.length;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/cacheLocal.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/cacheLocal.ts src/services/cacheLocal.test.ts
git commit -m "feat(armazenamento): cacheLocal com Map em memoria e indice por TAG"
```

---

## Task 5: `errosSync.ts` — tradução com detalhe técnico preservado

**Files:**
- Create: `src/services/errosSync.ts`
- Test: `src/services/errosSync.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type CategoriaErro = 'offline' | 'permissao' | 'cota' | 'sessao' | 'conflito' | 'obsoleto' | 'desconhecido'`
  - `interface ErroSync { categoria; titulo; explicacao; acao: { rotulo; tipo } | null; detalhe: { codigo; mensagemOriginal; chave; mutationId; dispositivo; quando } }`
  - `classificar(erro: unknown, ctx: ContextoErro): ErroSync`

Regra do §9.1: nenhuma mensagem crua na tela principal, e **nada escondido** — a original fica no `detalhe`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/errosSync.test.ts
import { describe, it, expect } from 'vitest';
import { classificar } from './errosSync';

const CTX = {
  chave: 'nr13_info_ACA 2040',
  mutationId: 'm-1',
  dispositivo: 'd-1',
  quando: '2026-08-04T12:00:00.000Z',
};

describe('classificar — erro sempre legível, original sempre preservado', () => {
  it('sem rede -> offline, sem ação', () => {
    const e = classificar(new TypeError('Failed to fetch'), CTX);
    expect(e.categoria).toBe('offline');
    expect(e.titulo).toBe('Sem conexão');
    expect(e.acao).toBeNull();
  });

  it('RLS 42501 -> permissão, com ação Regularizar', () => {
    const e = classificar({ code: '42501', message: 'new row violates row-level security policy' }, CTX);
    expect(e.categoria).toBe('permissao');
    expect(e.acao?.tipo).toBe('regularizar');
  });

  it('nr13_versao_obsoleta -> obsoleto (ressurreição barrada pelo servidor)', () => {
    const e = classificar({ code: 'P0001', message: 'nr13_versao_obsoleta: chave X foi excluida' }, CTX);
    expect(e.categoria).toBe('obsoleto');
    expect(e.acao?.tipo).toBe('comparar');
  });

  it('401 -> sessão expirada', () => {
    expect(classificar({ status: 401, message: 'JWT expired' }, CTX).categoria).toBe('sessao');
  });

  it('QuotaExceededError -> cota do aparelho', () => {
    const err = new Error('quota'); err.name = 'QuotaExceededError';
    expect(classificar(err, CTX).categoria).toBe('cota');
  });

  it('NUNCA usa a mensagem crua como texto de tela', () => {
    const cru = 'duplicate key value violates unique constraint "app_storage_org_chave_uidx"';
    const e = classificar({ code: '23505', message: cru }, CTX);
    expect(e.titulo).not.toContain('constraint');
    expect(e.explicacao).not.toContain('constraint');
    expect(e.categoria).toBe('desconhecido');
  });

  it('SEMPRE preserva a mensagem original e o contexto no detalhe técnico', () => {
    const cru = 'duplicate key value violates unique constraint';
    const e = classificar({ code: '23505', message: cru }, CTX);
    expect(e.detalhe.mensagemOriginal).toBe(cru);
    expect(e.detalhe.codigo).toBe('23505');
    expect(e.detalhe.chave).toBe('nr13_info_ACA 2040');
    expect(e.detalhe.mutationId).toBe('m-1');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/errosSync.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/errosSync.ts
/**
 * Traduz erro de sincronização para linguagem do usuário, SEM esconder nada:
 * o texto cru do Supabase (que pode expor nome de constraint, coluna, policy)
 * nunca vai para a tela principal, mas fica inteiro no `detalhe`, exibido no
 * bloco recolhível "Detalhes técnicos" da tela de Pendências (§9.1 do spec).
 */
export type CategoriaErro =
  | 'offline' | 'permissao' | 'cota' | 'sessao' | 'conflito' | 'obsoleto' | 'desconhecido';

export type TipoAcao = 'regularizar' | 'entrar' | 'liberar_espaco' | 'comparar' | 'tentar';

export interface ContextoErro {
  chave: string;
  mutationId: string;
  dispositivo: string;
  quando: string;
}

export interface ErroSync {
  categoria: CategoriaErro;
  titulo: string;
  explicacao: string;
  acao: { rotulo: string; tipo: TipoAcao } | null;
  detalhe: {
    codigo: string;
    mensagemOriginal: string;
    chave: string;
    mutationId: string;
    dispositivo: string;
    quando: string;
  };
}

const TEXTOS: Record<CategoriaErro, Omit<ErroSync, 'detalhe' | 'categoria'>> = {
  offline: {
    titulo: 'Sem conexão',
    explicacao: 'A alteração está guardada no aparelho e sobe sozinha quando a internet voltar.',
    acao: null,
  },
  permissao: {
    titulo: 'Sem permissão para gravar',
    explicacao: 'Sua assinatura está suspensa ou seu acesso não permite gravar este item.',
    acao: { rotulo: 'Regularizar', tipo: 'regularizar' },
  },
  cota: {
    titulo: 'Armazenamento do aparelho cheio',
    explicacao: 'Não há espaço livre neste dispositivo para guardar a alteração.',
    acao: { rotulo: 'Liberar espaço', tipo: 'liberar_espaco' },
  },
  sessao: {
    titulo: 'Sessão expirada',
    explicacao: 'Entre novamente para que as alterações pendentes sejam enviadas.',
    acao: { rotulo: 'Entrar', tipo: 'entrar' },
  },
  conflito: {
    titulo: 'Alterado em outro aparelho',
    explicacao: 'Este item foi modificado em outro dispositivo. As duas versões foram guardadas.',
    acao: { rotulo: 'Comparar versões', tipo: 'comparar' },
  },
  obsoleto: {
    titulo: 'Alteração mais antiga que a exclusão',
    explicacao: 'Este item foi excluído em outro aparelho depois desta alteração ter sido feita.',
    acao: { rotulo: 'Comparar versões', tipo: 'comparar' },
  },
  desconhecido: {
    titulo: 'Não foi possível salvar no servidor',
    explicacao: 'A alteração continua guardada no aparelho. Veja os detalhes técnicos ou tente de novo.',
    acao: { rotulo: 'Tentar de novo', tipo: 'tentar' },
  },
};

function extrair(erro: unknown): { codigo: string; mensagem: string; nome: string; status: number | null } {
  if (typeof erro === 'object' && erro !== null) {
    const e = erro as Record<string, unknown>;
    return {
      codigo: String(e.code ?? e.status ?? ''),
      mensagem: String(e.message ?? ''),
      nome: String(e.name ?? ''),
      status: typeof e.status === 'number' ? e.status : null,
    };
  }
  return { codigo: '', mensagem: String(erro ?? ''), nome: '', status: null };
}

function categorizar(d: ReturnType<typeof extrair>): CategoriaErro {
  const m = d.mensagem.toLowerCase();
  if (m.includes('nr13_versao_obsoleta')) return 'obsoleto';
  if (d.nome === 'QuotaExceededError' || m.includes('quota')) return 'cota';
  if (d.nome === 'TypeError' && m.includes('fetch')) return 'offline';
  if (m.includes('networkerror') || m.includes('failed to fetch')) return 'offline';
  if (d.codigo === '42501' || m.includes('row-level security')) return 'permissao';
  if (d.status === 401 || d.status === 403 || m.includes('jwt')) return 'sessao';
  if (d.codigo === 'nr13_conflito') return 'conflito';
  return 'desconhecido';
}

export function classificar(erro: unknown, ctx: ContextoErro): ErroSync {
  const d = extrair(erro);
  const categoria = categorizar(d);
  return {
    categoria,
    ...TEXTOS[categoria],
    detalhe: {
      codigo: d.codigo || d.nome || '—',
      mensagemOriginal: d.mensagem,
      chave: ctx.chave,
      mutationId: ctx.mutationId,
      dispositivo: ctx.dispositivo,
      quando: ctx.quando,
    },
  };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/errosSync.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/errosSync.ts src/services/errosSync.test.ts
git commit -m "feat(armazenamento): errosSync traduz sem esconder o detalhe tecnico"
```

---

## Task 6: `sync.ts` parte 1 — fila durável e idempotente

**Files:**
- Create: `src/services/sync.ts`
- Test: `src/services/sync.fila.test.ts`

**Interfaces:**
- Consumes: `db.ts` (Task 3), `errosSync.ts` (Task 5).
- Produces:
  - `type EstadoItem = 'salvo_local' | 'aguardando' | 'sincronizado' | 'falha_definitiva' | 'conflito'`
  - `interface ItemFila { mutationId; op: 'set'|'del'; chave; valor?; versaoBase; dispositivo; criadoEm; tentativas; estado; erro?: ErroSync }`
  - `idDispositivo(): string`
  - `enfileirar(op, chave, valor, versaoBase): Promise<string>` — devolve o `mutationId`
  - `listarFila(): ItemFila[]`
  - `itemDaChave(chave): ItemFila | null`
  - `marcarEstado(mutationId, estado, erro?): Promise<void>`
  - `removerDaFila(mutationId): Promise<void>`
  - `carregarFilaDoDisco(): Promise<void>`

Os cinco estados são exatamente os do §9.2. `salvo_local` e `bloqueado_nao_salvo` não convivem: bloqueado nunca entra na fila (§9.2), quem barra é o `storage.ts` na Task 11.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/sync.fila.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fecharDb, apagarDb } from './db';
import { definirOrg } from './cacheLocal';
import {
  enfileirar, listarFila, itemDaChave, marcarEstado, removerDaFila,
  carregarFilaDoDisco, idDispositivo, zerarFilaMemoria,
} from './sync';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  zerarFilaMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
});

describe('sync — fila durável e idempotente', () => {
  it('enfileirar devolve mutationId e o item nasce aguardando', async () => {
    const id = await enfileirar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    expect(id).toMatch(/[0-9a-f-]{8}/);
    expect(itemDaChave('nr13_info_A')?.estado).toBe('aguardando');
  });

  it('idDispositivo é estável entre chamadas', () => {
    expect(idDispositivo()).toBe(idDispositivo());
  });

  it('regravar a MESMA chave substitui o item e PRESERVA o mutationId quando o valor é igual', async () => {
    const id1 = await enfileirar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    const id2 = await enfileirar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    expect(id2).toBe(id1);
    expect(listarFila()).toHaveLength(1);
  });

  it('regravar com valor DIFERENTE gera mutationId novo e continua com 1 item', async () => {
    const id1 = await enfileirar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    const id2 = await enfileirar('set', 'nr13_info_A', '{"tag":"AA"}', 2);
    expect(id2).not.toBe(id1);
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_info_A')?.valor).toBe('{"tag":"AA"}');
  });

  it('del depois de set deixa só o del (a última operação vence)', async () => {
    await enfileirar('set', 'nr13_info_A', '{}', 1);
    await enfileirar('del', 'nr13_info_A', undefined, 2);
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_info_A')?.op).toBe('del');
  });

  it('a fila SOBREVIVE ao fechamento do navegador (recarrega do IndexedDB)', async () => {
    await enfileirar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    await new Promise((r) => setTimeout(r, 20));
    zerarFilaMemoria();
    expect(listarFila()).toHaveLength(0);
    await carregarFilaDoDisco();
    expect(listarFila()).toHaveLength(1);
    expect(itemDaChave('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });

  it('marcarEstado guarda o erro traduzido junto', async () => {
    const id = await enfileirar('set', 'nr13_info_A', '{}', 1);
    await marcarEstado(id, 'falha_definitiva', { code: '42501', message: 'row-level security' });
    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('falha_definitiva');
    expect(item.erro?.categoria).toBe('permissao');
    expect(item.erro?.detalhe.mensagemOriginal).toBe('row-level security');
  });

  it('removerDaFila tira o item', async () => {
    const id = await enfileirar('set', 'nr13_info_A', '{}', 1);
    await removerDaFila(id);
    expect(listarFila()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/sync.fila.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a parte 1**

```ts
// src/services/sync.ts
/**
 * Fila de sincronização durável (IndexedDB) com chave de idempotência.
 *
 * Cada mutação carrega um `mutationId`. Reenviar o mesmo id é inofensivo: o
 * upsert é por (org_id, chave). "Tentar de novo" RETOMA o item existente e
 * nunca cria um segundo — foi por isso que o campo existe (§6.2 do spec).
 */
import { guardar, listarTudo, remover } from './db';
import { orgAtual } from './cacheLocal';
import { classificar, type ErroSync } from './errosSync';

export type EstadoItem = 'salvo_local' | 'aguardando' | 'sincronizado' | 'falha_definitiva' | 'conflito';

export interface ItemFila {
  mutationId: string;
  op: 'set' | 'del';
  chave: string;
  valor?: string;
  versaoBase: number;
  dispositivo: string;
  criadoEm: string;
  tentativas: number;
  estado: EstadoItem;
  erro?: ErroSync;
}

const CHAVE_DISPOSITIVO = 'nr13_dispositivo_id';
const fila = new Map<string, ItemFila>(); // mutationId -> item

/** Id estável deste aparelho. Fica no localStorage (é preservado na faxina de conta). */
export function idDispositivo(): string {
  let id = localStorage.getItem(CHAVE_DISPOSITIVO);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CHAVE_DISPOSITIVO, id);
  }
  return id;
}

export function zerarFilaMemoria(): void { fila.clear(); }
export function listarFila(): ItemFila[] { return [...fila.values()]; }

export function itemDaChave(chave: string): ItemFila | null {
  for (const item of fila.values()) if (item.chave === chave) return item;
  return null;
}

async function persistir(item: ItemFila): Promise<void> {
  const org = orgAtual();
  if (org) await guardar(org, 'fila', item.mutationId, item);
}

/**
 * Enfileira com DEDUP POR CHAVE (a última operação vence, igual à fila antiga).
 * O mutationId é PRESERVADO quando a operação e o valor são idênticos — assim
 * um autosave que dispara duas vezes com o mesmo conteúdo não vira mutação nova.
 */
export async function enfileirar(
  op: 'set' | 'del',
  chave: string,
  valor: string | undefined,
  versaoBase: number,
): Promise<string> {
  const anterior = itemDaChave(chave);
  const igual = anterior && anterior.op === op && anterior.valor === valor;
  if (anterior) {
    fila.delete(anterior.mutationId);
    const org = orgAtual();
    if (org) await remover(org, 'fila', anterior.mutationId).catch(() => undefined);
  }
  const item: ItemFila = {
    mutationId: igual ? anterior!.mutationId : crypto.randomUUID(),
    op,
    chave,
    valor,
    versaoBase,
    dispositivo: idDispositivo(),
    criadoEm: new Date().toISOString(),
    tentativas: igual ? anterior!.tentativas : 0,
    estado: 'aguardando',
  };
  fila.set(item.mutationId, item);
  await persistir(item);
  return item.mutationId;
}

export async function marcarEstado(mutationId: string, estado: EstadoItem, erroBruto?: unknown): Promise<void> {
  const item = fila.get(mutationId);
  if (!item) return;
  item.estado = estado;
  if (erroBruto !== undefined) {
    item.erro = classificar(erroBruto, {
      chave: item.chave,
      mutationId: item.mutationId,
      dispositivo: item.dispositivo,
      quando: new Date().toISOString(),
    });
  }
  await persistir(item);
}

export async function removerDaFila(mutationId: string): Promise<void> {
  fila.delete(mutationId);
  const org = orgAtual();
  if (org) await remover(org, 'fila', mutationId).catch(() => undefined);
}

/** Recarrega a fila do disco. É o que faz a pendência sobreviver a fechar o navegador. */
export async function carregarFilaDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  const linhas = await listarTudo<ItemFila>(org, 'fila');
  for (const { valor } of linhas) if (valor?.mutationId) fila.set(valor.mutationId, valor);
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/sync.fila.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/sync.ts src/services/sync.fila.test.ts
git commit -m "feat(armazenamento): fila de sync duravel com mutationId idempotente"
```

---

## Task 7: `sync.ts` parte 2 — drenagem, versionamento e conflitos

**Files:**
- Modify: `src/services/sync.ts` (acrescentar ao módulo da Task 6)
- Test: `src/services/sync.drenagem.test.ts`

**Interfaces:**
- Consumes: Task 6, `pisoVersao.ts` (Task 2), `supabase.ts` (`supabase`, `escopoStorageAtual`, `TABELA_STORAGE`).
- Produces:
  - `drenar(): Promise<{ enviados: number; falhas: number }>`
  - `tentarNovamente(mutationId: string): Promise<void>`
  - `registrarTombstone(chave: string, versao: number): Promise<void>`
  - `tombstoneMaisNovoQue(chave: string, atualizadoEm: string): boolean`
  - `carregarTombstonesDoDisco(): Promise<void>`
  - `guardarConflito(chave: string, perdedor: Registro): Promise<void>`

Regra do §7.2: mais recente vence, **perdedor preservado** em `nr13_conflito_<chave>__<timestamp>`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/sync.drenagem.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsert = vi.fn();
const update = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ upsert, update }) },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: '11111111-1111-1111-1111-111111111111' })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { definirOrg } from './cacheLocal';
import {
  enfileirar, listarFila, itemDaChave, drenar, tentarNovamente,
  registrarTombstone, tombstoneMaisNovoQue, zerarFilaMemoria,
} from './sync';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  zerarFilaMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  upsert.mockReset();
  update.mockReset();
});

describe('sync — drenagem', () => {
  it('sucesso: item sai da fila', async () => {
    upsert.mockResolvedValue({ error: null });
    await enfileirar('set', 'nr13_info_A', '{}', 1);
    const r = await drenar();
    expect(r.enviados).toBe(1);
    expect(listarFila()).toHaveLength(0);
  });

  it('offline: item FICA na fila com erro traduzido, nada é perdido', async () => {
    upsert.mockRejectedValue(new TypeError('Failed to fetch'));
    await enfileirar('set', 'nr13_info_A', '{}', 1);
    const r = await drenar();
    expect(r.falhas).toBe(1);
    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('aguardando');
    expect(item.erro?.categoria).toBe('offline');
  });

  it('RLS: vira falha_definitiva (não adianta reenviar sozinho)', async () => {
    upsert.mockResolvedValue({ error: { code: '42501', message: 'row-level security' } });
    await enfileirar('set', 'nr13_info_A', '{}', 1);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('falha_definitiva');
  });

  it('versão obsoleta (aparelho parado além da coleta): NÃO ressuscita, vira conflito', async () => {
    upsert.mockResolvedValue({
      error: { code: 'P0001', message: 'nr13_versao_obsoleta: chave nr13_info_A foi excluida na versao 7' },
    });
    await enfileirar('set', 'nr13_info_A', '{}', 3);
    await drenar();
    const item = itemDaChave('nr13_info_A')!;
    expect(item.estado).toBe('conflito');
    expect(item.erro?.categoria).toBe('obsoleto');
    expect(listarFila()).toHaveLength(1); // preservado para o usuário decidir
  });

  it('tentarNovamente REUSA o mutationId (não duplica)', async () => {
    upsert.mockResolvedValue({ error: { code: '42501', message: 'rls' } });
    const id = await enfileirar('set', 'nr13_info_A', '{}', 1);
    await drenar();
    upsert.mockResolvedValue({ error: null });
    await tentarNovamente(id);
    expect(listarFila()).toHaveLength(0);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('uma falha NÃO impede as outras de subirem', async () => {
    upsert
      .mockResolvedValueOnce({ error: { code: '42501', message: 'rls' } })
      .mockResolvedValueOnce({ error: null });
    await enfileirar('set', 'nr13_info_A', '{}', 1);
    await enfileirar('set', 'nr13_info_B', '{}', 1);
    const r = await drenar();
    expect(r.enviados).toBe(1);
    expect(r.falhas).toBe(1);
  });
});

describe('sync — tombstones', () => {
  it('tombstone mais novo que o servidor impede ressurreição na hidratação', async () => {
    await registrarTombstone('nr13_info_A', 5);
    expect(tombstoneMaisNovoQue('nr13_info_A', '2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('servidor mais novo que o tombstone -> a chave volta (foi recriada depois)', async () => {
    await registrarTombstone('nr13_info_A', 5);
    expect(tombstoneMaisNovoQue('nr13_info_A', '2099-01-01T00:00:00.000Z')).toBe(false);
  });

  it('sem tombstone -> nunca bloqueia', () => {
    expect(tombstoneMaisNovoQue('nr13_info_Z', '2020-01-01T00:00:00.000Z')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/sync.drenagem.test.ts`
Expected: FAIL — `drenar` não é exportada.

- [ ] **Step 3: Implementar (acrescentar ao `sync.ts`)**

> **Atenção:** mover os `import` abaixo para o topo do arquivo, junto dos da Task 6. Importar **só o tipo** `Registro` — `tsc -b` reprova import não usado.

```ts
// ── acrescentar a src/services/sync.ts (imports vão para o topo) ──────────
import { supabase, escopoStorageAtual, idUsuarioAtual, TABELA_STORAGE } from './supabase';
import type { Registro } from './cacheLocal';

interface Tombstone { chave: string; versao: number; excluidoEm: string; dispositivo: string }
const tombstones = new Map<string, Tombstone>();

export async function registrarTombstone(chave: string, versao: number): Promise<void> {
  const t: Tombstone = {
    chave, versao, excluidoEm: new Date().toISOString(), dispositivo: idDispositivo(),
  };
  tombstones.set(chave, t);
  const org = orgAtual();
  if (org) await guardar(org, 'tombstones', chave, t);
}

/** A hidratação NUNCA ressuscita uma chave cujo tombstone local é mais novo (§7.3). */
export function tombstoneMaisNovoQue(chave: string, atualizadoEm: string): boolean {
  const t = tombstones.get(chave);
  if (!t) return false;
  const tomb = new Date(t.excluidoEm).getTime();
  const srv = new Date(atualizadoEm).getTime();
  if (!Number.isFinite(tomb)) return false;
  if (!Number.isFinite(srv)) return true; // data do servidor ilegível: manter excluído é o seguro
  return tomb > srv;
}

export async function carregarTombstonesDoDisco(): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  for (const { valor } of await listarTudo<Tombstone>(org, 'tombstones')) {
    if (valor?.chave) tombstones.set(valor.chave, valor);
  }
}

/** Guarda o perdedor de um conflito. Nada é descartado sem alguém escolher (§7.2). */
export async function guardarConflito(chave: string, perdedor: Registro): Promise<void> {
  const org = orgAtual();
  if (!org) return;
  const alvo = `nr13_conflito_${chave}__${Date.now()}`;
  await guardar(org, 'dados', alvo, perdedor);
}

// Categorias que NÃO se resolvem sozinhas com uma nova tentativa automática.
const DEFINITIVAS = new Set(['permissao', 'cota', 'sessao']);

async function enviarItem(item: ItemFila): Promise<void> {
  const escopo = await escopoStorageAtual();
  if (!escopo) throw new Error('sem escopo (sessão ausente)');
  const userId = await idUsuarioAtual();
  item.tentativas += 1;

  const linhaBase = escopo.coluna === 'org_id'
    ? { user_id: userId, org_id: escopo.id, chave: item.chave }
    : { user_id: escopo.id, chave: item.chave };

  const { error } =
    item.op === 'set'
      ? await supabase.from(TABELA_STORAGE).upsert(
          {
            ...linhaBase,
            valor: item.valor,
            versao: item.versaoBase + 1,
            dispositivo: item.dispositivo,
            deletado_em: null,
          },
          { onConflict: escopo.coluna + ',chave' },
        )
      // Exclusão é SOFT-DELETE: sem isso, a exclusão feita num aparelho nunca
      // chegaria aos outros — linha sumida é indistinguível de nunca existiu.
      : await supabase.from(TABELA_STORAGE).upsert(
          {
            ...linhaBase,
            valor: null,
            versao: item.versaoBase + 1,
            dispositivo: item.dispositivo,
            deletado_em: new Date().toISOString(),
          },
          { onConflict: escopo.coluna + ',chave' },
        );

  if (error) throw error;
}

/**
 * Drena a fila. Uma falha NÃO interrompe as demais: cada item é independente,
 * e travar a fila inteira por causa de um item com problema de permissão
 * seguraria dados de campo que subiriam sem dificuldade nenhuma.
 */
export async function drenar(): Promise<{ enviados: number; falhas: number }> {
  let enviados = 0;
  let falhas = 0;
  for (const item of [...fila.values()]) {
    if (item.estado === 'conflito') continue; // aguarda decisão do usuário
    try {
      await enviarItem(item);
      await removerDaFila(item.mutationId);
      enviados += 1;
    } catch (erro) {
      falhas += 1;
      await marcarEstado(item.mutationId, 'aguardando', erro);
      const cat = fila.get(item.mutationId)?.erro?.categoria;
      if (cat === 'obsoleto') await marcarEstado(item.mutationId, 'conflito');
      else if (cat && DEFINITIVAS.has(cat)) await marcarEstado(item.mutationId, 'falha_definitiva');
    }
  }
  return { enviados, falhas };
}

/** Retoma um item existente pelo mutationId. NUNCA cria um segundo (§6.2). */
export async function tentarNovamente(mutationId: string): Promise<void> {
  const item = fila.get(mutationId);
  if (!item) return;
  try {
    await enviarItem(item);
    await removerDaFila(mutationId);
  } catch (erro) {
    await marcarEstado(mutationId, 'aguardando', erro);
  }
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/sync.drenagem.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/sync.ts src/services/sync.drenagem.test.ts
git commit -m "feat(armazenamento): drenagem com soft-delete, tombstones e conflito preservado"
```

---

## Task 8: `manifesto.ts` — detecção (parcial e assumida) de despejo

**Files:**
- Create: `src/services/manifesto.ts`
- Test: `src/services/manifesto.test.ts`

**Interfaces:**
- Consumes: `sync.ts` (`listarFila`).
- Produces:
  - `interface EntradaManifesto { mutationId; chave; criadoEm }`
  - `atualizarManifesto(): void`
  - `type Diagnostico = { tipo: 'ok' } | { tipo: 'despejo_detectado'; perdidos: EntradaManifesto[] } | { tipo: 'estado_zerado' }`
  - `diagnosticarPerda(temDadosNoServidor: boolean): Diagnostico`

O §4.2 é explícito: isto **não** detecta limpeza total do site, porque o manifesto vai junto. Não prometer o contrário nem no código nem na UI.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/manifesto.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const filaMock = vi.fn();
vi.mock('./sync', () => ({ listarFila: () => filaMock() }));

import { atualizarManifesto, diagnosticarPerda } from './manifesto';

beforeEach(() => {
  localStorage.clear();
  filaMock.mockReset();
});

describe('manifesto — o que detecta e o que NÃO detecta', () => {
  it('fila íntegra -> ok', () => {
    filaMock.mockReturnValue([{ mutationId: 'm1', chave: 'nr13_info_A', criadoEm: 'x' }]);
    atualizarManifesto();
    expect(diagnosticarPerda(true)).toEqual({ tipo: 'ok' });
  });

  it('DETECTA despejo isolado do IndexedDB: manifesto sobreviveu, fila sumiu', () => {
    filaMock.mockReturnValue([{ mutationId: 'm1', chave: 'nr13_info_A', criadoEm: 'x' }]);
    atualizarManifesto();
    filaMock.mockReturnValue([]); // IndexedDB despejado
    const d = diagnosticarPerda(true);
    expect(d.tipo).toBe('despejo_detectado');
    if (d.tipo === 'despejo_detectado') expect(d.perdidos[0].chave).toBe('nr13_info_A');
  });

  it('NÃO enumera nada na limpeza total do site (manifesto foi junto)', () => {
    filaMock.mockReturnValue([]);
    localStorage.clear(); // limpou tudo: manifesto some junto com o IndexedDB
    expect(diagnosticarPerda(true)).toEqual({ tipo: 'estado_zerado' });
  });

  it('estado zerado SEM dados no servidor é conta nova, não perda', () => {
    filaMock.mockReturnValue([]);
    expect(diagnosticarPerda(false)).toEqual({ tipo: 'ok' });
  });

  it('fila vazia com manifesto vazio -> ok (nada pendente, nada a perder)', () => {
    filaMock.mockReturnValue([]);
    atualizarManifesto();
    expect(diagnosticarPerda(true)).toEqual({ tipo: 'ok' });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/manifesto.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/manifesto.ts
/**
 * Manifesto de pendências: lista minúscula (id + chave + data, SEM payload e
 * SEM foto) mantida no localStorage para detectar que o IndexedDB foi despejado
 * com pendências dentro.
 *
 * LIMITE ASSUMIDO (§4.2 do spec): isto só funciona quando o IndexedDB é
 * despejado ISOLADAMENTE. Se o usuário limpar todos os dados do site, o
 * manifesto é apagado junto e NÃO há como enumerar o que se perdeu. Nesse caso
 * o app avisa de forma genérica em vez de inventar uma lista. A proteção real
 * contra esse cenário é a janela curta de sincronização, não a detecção.
 */
import { listarFila } from './sync';

const CHAVE = 'nr13_manifesto_pendencias';

export interface EntradaManifesto {
  mutationId: string;
  chave: string;
  criadoEm: string;
}

export type Diagnostico =
  | { tipo: 'ok' }
  | { tipo: 'despejo_detectado'; perdidos: EntradaManifesto[] }
  | { tipo: 'estado_zerado' };

function lerManifesto(): EntradaManifesto[] | null {
  const raw = localStorage.getItem(CHAVE);
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as EntradaManifesto[]) : [];
  } catch {
    return []; // manifesto corrompido conta como vazio, nunca como perda
  }
}

export function atualizarManifesto(): void {
  const entradas: EntradaManifesto[] = listarFila().map((i) => ({
    mutationId: i.mutationId,
    chave: i.chave,
    criadoEm: i.criadoEm,
  }));
  try {
    localStorage.setItem(CHAVE, JSON.stringify(entradas));
  } catch {
    // Manifesto é diagnóstico, não dado: se não couber, seguir sem ele é
    // preferível a derrubar a gravação que o usuário acabou de fazer.
  }
}

export function diagnosticarPerda(temDadosNoServidor: boolean): Diagnostico {
  const manifesto = lerManifesto();
  const fila = listarFila();

  if (manifesto === null) {
    // Sem manifesto: ou é o primeiro uso, ou limpeza total do site levou tudo.
    // Só há motivo de alarme se o servidor tem dados e o local está zerado.
    return temDadosNoServidor && fila.length === 0 ? { tipo: 'estado_zerado' } : { tipo: 'ok' };
  }

  const idsNaFila = new Set(fila.map((i) => i.mutationId));
  const perdidos = manifesto.filter((m) => !idsNaFila.has(m.mutationId));
  return perdidos.length > 0 ? { tipo: 'despejo_detectado', perdidos } : { tipo: 'ok' };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/manifesto.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/manifesto.ts src/services/manifesto.test.ts
git commit -m "feat(armazenamento): manifesto de pendencias com limite de deteccao assumido"
```

---

## Task 9: `quotaDispositivo.ts` — `persist()`, `estimate()` e limiares

**Files:**
- Create: `src/services/quotaDispositivo.ts`
- Test: `src/services/quotaDispositivo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `pedirPersistencia(): Promise<boolean>`
  - `medirUso(): Promise<{ usado: number; cota: number; fracao: number } | null>`
  - `type NivelQuota = 'ok' | 'aviso' | 'critico'`
  - `nivelDaFracao(fracao: number): NivelQuota`

Limiares do §4.1: aviso em 80%, crítico (bloqueia foto nova) em 95%.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/quotaDispositivo.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nivelDaFracao, medirUso, pedirPersistencia } from './quotaDispositivo';

beforeEach(() => {
  (globalThis.navigator as unknown as Record<string, unknown>) = {};
});

describe('nivelDaFracao — limiares do §4.1', () => {
  it('abaixo de 80% -> ok', () => expect(nivelDaFracao(0.79)).toBe('ok'));
  it('exatamente 80% -> aviso', () => expect(nivelDaFracao(0.8)).toBe('aviso'));
  it('exatamente 95% -> critico', () => expect(nivelDaFracao(0.95)).toBe('critico'));
  it('acima de 95% -> critico', () => expect(nivelDaFracao(0.99)).toBe('critico'));
});

describe('medirUso / pedirPersistencia — degradam sem quebrar', () => {
  it('sem navigator.storage devolve null (não quebra o boot)', async () => {
    expect(await medirUso()).toBeNull();
  });

  it('sem navigator.storage.persist devolve false', async () => {
    expect(await pedirPersistencia()).toBe(false);
  });

  it('com estimate calcula a fração', async () => {
    (globalThis.navigator as unknown as Record<string, unknown>).storage = {
      estimate: async () => ({ usage: 800, quota: 1000 }),
    };
    expect(await medirUso()).toEqual({ usado: 800, cota: 1000, fracao: 0.8 });
  });

  it('persist() negado devolve false sem lançar', async () => {
    (globalThis.navigator as unknown as Record<string, unknown>).storage = {
      persist: async () => false,
    };
    expect(await pedirPersistencia()).toBe(false);
  });

  it('cota zero não vira divisão por zero', async () => {
    (globalThis.navigator as unknown as Record<string, unknown>).storage = {
      estimate: async () => ({ usage: 0, quota: 0 }),
    };
    expect(await medirUso()).toEqual({ usado: 0, cota: 0, fracao: 0 });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/quotaDispositivo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/quotaDispositivo.ts
/**
 * Cota e durabilidade do armazenamento do aparelho (§4.1 do spec).
 * O IndexedDB não é ilimitado nem imune à limpeza do navegador: este módulo
 * pede persistência, mede o uso e classifica o nível para a UI avisar ANTES
 * de o inspetor descobrir no meio da inspeção que não cabe mais nada.
 */
export type NivelQuota = 'ok' | 'aviso' | 'critico';

export const LIMIAR_AVISO = 0.8;
export const LIMIAR_CRITICO = 0.95;

export function nivelDaFracao(fracao: number): NivelQuota {
  if (fracao >= LIMIAR_CRITICO) return 'critico';
  if (fracao >= LIMIAR_AVISO) return 'aviso';
  return 'ok';
}

function storageApi(): StorageManager | null {
  const nav = globalThis.navigator as Navigator | undefined;
  return nav && 'storage' in nav ? (nav.storage as StorageManager) : null;
}

export async function pedirPersistencia(): Promise<boolean> {
  const s = storageApi();
  if (!s || typeof s.persist !== 'function') return false;
  try {
    return await s.persist();
  } catch {
    return false; // navegador recusou ou não implementa: seguir sem persistência
  }
}

export async function medirUso(): Promise<{ usado: number; cota: number; fracao: number } | null> {
  const s = storageApi();
  if (!s || typeof s.estimate !== 'function') return null;
  try {
    const { usage = 0, quota = 0 } = await s.estimate();
    return { usado: usage, cota: quota, fracao: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/quotaDispositivo.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/quotaDispositivo.ts src/services/quotaDispositivo.test.ts
git commit -m "feat(armazenamento): quotaDispositivo com persist, estimate e limiares"
```

---

## Task 10: `palco.ts` — orçamento e materialização atômica

**Files:**
- Create: `src/services/palco.ts`
- Create: `src/services/recompressorFoto.ts`
- Test: `src/services/palco.test.ts`

**Interfaces:**
- Consumes: `cacheLocal.ts` (Task 4).
- Produces:
  - `const ORCAMENTO_DOC = 3_400 * 1024` · `ORCAMENTO_IMG = 110 * 1024` · `LARGURA_REL = 900`
  - `const PLANO_DEGRADACAO: PassoDegradacao[]` (5 passos, §5.3)
  - `degradarAteCaber(itens, recomprimir): Promise<{cabe:true; itens; total} | Recusa>`
  - `ehChaveDeFoto(chave: string): boolean`
  - `type Recompressor = (valor: string, passo: PassoDegradacao) => Promise<string>`
  - `recomprimirFotosDoValor: Recompressor` (de `recompressorFoto.ts`)
  - `interface ItemPalco { chave: string; valor: string }`
  - `interface Recusa { cabe: false; total: number; orcamento: number; maiores: Array<{ chave; bytes }> }`
  - `orcar(itens: ItemPalco[]): { cabe: true; total: number } | Recusa`
  - `materializar(itens: ItemPalco[]): { ok: true } | { ok: false; erro: unknown; chaveQueFalhou: string }`
  - `limparPalco(): void`

`materializar` é **tudo ou nada** (§5.4): o `localStorage` não tem transação, então o rollback é explícito.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/palco.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { orcar, materializar, limparPalco, ORCAMENTO_DOC } from './palco';

beforeEach(() => localStorage.clear());

const item = (chave: string, bytes: number) => ({ chave, valor: 'x'.repeat(bytes) });

describe('orcar — calcula ANTES de escrever', () => {
  it('dentro do orçamento -> cabe', () => {
    const r = orcar([item('nr13_info_A', 1000)]);
    expect(r.cabe).toBe(true);
  });

  it('acima do orçamento -> recusa listando os maiores em ordem decrescente', () => {
    const r = orcar([
      item('nr13_fotos_A', ORCAMENTO_DOC),
      item('nr13_docs_A', 500 * 1024),
      item('nr13_info_A', 10),
    ]);
    expect(r.cabe).toBe(false);
    if (!r.cabe) {
      expect(r.maiores[0].chave).toBe('nr13_fotos_A');
      expect(r.maiores[1].chave).toBe('nr13_docs_A');
      expect(r.total).toBeGreaterThan(r.orcamento);
    }
  });

  it('não escreve NADA no localStorage ao orçar', () => {
    orcar([item('nr13_info_A', 1000)]);
    expect(localStorage.length).toBe(0);
  });
});

describe('materializar — tudo ou nada', () => {
  it('sucesso: grava todas as chaves', () => {
    const r = materializar([item('nr13_info_A', 10), item('nr13_calc_A', 10)]);
    expect(r.ok).toBe(true);
    expect(localStorage.getItem('nr13_info_A')).not.toBeNull();
    expect(localStorage.getItem('nr13_calc_A')).not.toBeNull();
  });

  it('ROLLBACK: se a 2ª chave falha, a 1ª é removida — nunca relatório parcial', () => {
    const real = localStorage.setItem.bind(localStorage);
    let n = 0;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (++n === 2) {
        const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e;
      }
      real(k, v);
    });

    const r = materializar([item('nr13_info_A', 10), item('nr13_calc_A', 10)]);
    spy.mockRestore();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.chaveQueFalhou).toBe('nr13_calc_A');
    expect(localStorage.getItem('nr13_info_A')).toBeNull(); // rollback aconteceu
  });

  it('limparPalco remove só o que o palco montou', () => {
    localStorage.setItem('nr13_usuario_logado', 'a@b.com');
    materializar([item('nr13_info_A', 10)]);
    limparPalco();
    expect(localStorage.getItem('nr13_info_A')).toBeNull();
    expect(localStorage.getItem('nr13_usuario_logado')).toBe('a@b.com');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/palco.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/palco.ts
/**
 * O palco: a única coisa que ainda vive no localStorage (§5 do spec).
 *
 * Os 40+ templates HTML em iframe leem localStorage de forma síncrona no
 * DOMContentLoaded. Em vez de reescrevê-los, o app materializa ali só as
 * chaves do documento que está sendo aberto, monta os iframes, e limpa depois.
 *
 * O limite de 5 MB continua valendo NESTE espaço — por isso tudo é orçado
 * ANTES de escrever, e a escrita é tudo-ou-nada: relatório pela metade é pior
 * que relatório recusado, porque sai impresso com folha faltando.
 */
export const ORCAMENTO_DOC = 3_400 * 1024;
export const ORCAMENTO_IMG = 110 * 1024;
export const LARGURA_REL = 900;

const REGISTRO = 'nr13_palco_chaves';

export interface ItemPalco { chave: string; valor: string }
export interface Recusa {
  cabe: false;
  total: number;
  orcamento: number;
  maiores: Array<{ chave: string; bytes: number }>;
}

const tamanho = (i: ItemPalco) => i.chave.length + i.valor.length;

export function orcar(itens: ItemPalco[]): { cabe: true; total: number } | Recusa {
  const total = itens.reduce((s, i) => s + tamanho(i), 0);
  if (total <= ORCAMENTO_DOC) return { cabe: true, total };
  return {
    cabe: false,
    total,
    orcamento: ORCAMENTO_DOC,
    maiores: itens
      .map((i) => ({ chave: i.chave, bytes: tamanho(i) }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

export function materializar(
  itens: ItemPalco[],
): { ok: true } | { ok: false; erro: unknown; chaveQueFalhou: string } {
  const gravadas: string[] = [];
  for (const item of itens) {
    try {
      localStorage.setItem(item.chave, item.valor);
      gravadas.push(item.chave);
    } catch (erro) {
      // Rollback explícito: localStorage não tem transação e um documento
      // meio montado imprimiria folhas faltando sem ninguém perceber.
      for (const c of gravadas) localStorage.removeItem(c);
      localStorage.removeItem(REGISTRO);
      return { ok: false, erro, chaveQueFalhou: item.chave };
    }
  }
  try {
    localStorage.setItem(REGISTRO, JSON.stringify(gravadas));
  } catch {
    for (const c of gravadas) localStorage.removeItem(c);
    return { ok: false, erro: new Error('registro do palco não coube'), chaveQueFalhou: REGISTRO };
  }
  return { ok: true };
}

export function limparPalco(): void {
  const raw = localStorage.getItem(REGISTRO);
  if (!raw) return;
  try {
    const chaves = JSON.parse(raw) as string[];
    for (const c of chaves) localStorage.removeItem(c);
  } catch {
    // Registro corrompido: não sair apagando `nr13_` a esmo, porque as chaves
    // de sessão vivem no mesmo espaço. O palco seguinte sobrescreve.
  }
  localStorage.removeItem(REGISTRO);
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/palco.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Escrever o teste da degradação em passos (falha primeiro)**

Sem isto, um documento acima do orçamento seria só recusado — o §5.3 manda **degradar antes de desistir**. O recompressor é injetado porque `canvas` não existe no ambiente de teste (`environment: 'node'`).

```ts
// acrescentar a src/services/palco.test.ts
import { PLANO_DEGRADACAO, degradarAteCaber, ehChaveDeFoto } from './palco';

describe('degradação em passos (§5.3)', () => {
  it('o plano segue a ordem do spec: qualidade primeiro, largura depois', () => {
    expect(PLANO_DEGRADACAO).toEqual([
      { qualidade: 0.6, largura: 900 },
      { qualidade: 0.45, largura: 900 },
      { qualidade: 0.35, largura: 900 },
      { qualidade: 0.35, largura: 700 },
      { qualidade: 0.35, largura: 560 },
    ]);
  });

  it('reconhece chave de foto e ignora as demais', () => {
    expect(ehChaveDeFoto('nr13_fotos_ACA 2040')).toBe(true);
    expect(ehChaveDeFoto('nr13_info_ACA 2040')).toBe(false);
  });

  it('já cabendo, NÃO recomprime nada (passo 0 é no-op)', async () => {
    const recomprimir = vi.fn();
    const r = await degradarAteCaber([{ chave: 'nr13_info_A', valor: 'x'.repeat(100) }], recomprimir);
    expect(r.cabe).toBe(true);
    expect(recomprimir).not.toHaveBeenCalled();
  });

  it('degrada só o necessário e para no primeiro passo que couber', async () => {
    // Cada passo devolve metade do tamanho anterior.
    const recomprimir = vi.fn(async (valor: string, p: { qualidade: number }) =>
      'y'.repeat(Math.round(valor.length * p.qualidade)));
    const itens = [
      { chave: 'nr13_fotos_A', valor: 'x'.repeat(ORCAMENTO_DOC + 500 * 1024) },
      { chave: 'nr13_info_A', valor: '{}' },
    ];
    const r = await degradarAteCaber(itens, recomprimir);
    expect(r.cabe).toBe(true);
    expect(recomprimir).toHaveBeenCalledTimes(1); // parou no primeiro passo
    if (r.cabe) expect(r.itens.find((i) => i.chave === 'nr13_info_A')?.valor).toBe('{}');
  });

  it('esgotou o plano e ainda não cabe -> recusa com os maiores listados', async () => {
    const recomprimir = vi.fn(async (valor: string) => valor); // não reduz nada
    const itens = [{ chave: 'nr13_fotos_A', valor: 'x'.repeat(ORCAMENTO_DOC * 2) }];
    const r = await degradarAteCaber(itens, recomprimir);
    expect(r.cabe).toBe(false);
    if (!r.cabe) expect(r.maiores[0].chave).toBe('nr13_fotos_A');
    expect(recomprimir).toHaveBeenCalledTimes(PLANO_DEGRADACAO.length);
  });

  it('falha ao recomprimir uma foto NÃO derruba a montagem: segue com o original', async () => {
    const recomprimir = vi.fn(async () => { throw new Error('canvas indisponível'); });
    const itens = [{ chave: 'nr13_fotos_A', valor: 'x'.repeat(100) }];
    const r = await degradarAteCaber(itens, recomprimir);
    expect(r.cabe).toBe(true);
  });
});
```

- [ ] **Step 6: Rodar e verificar que falha**

Run: `npx vitest run src/services/palco.test.ts`
Expected: FAIL — `PLANO_DEGRADACAO` não é exportado.

- [ ] **Step 7: Implementar a degradação**

```ts
// acrescentar a src/services/palco.ts

/** Qualidade primeiro, largura depois — a ordem é a do §5.3 do spec. */
export interface PassoDegradacao { qualidade: number; largura: number }
export const PLANO_DEGRADACAO: PassoDegradacao[] = [
  { qualidade: 0.6, largura: 900 },
  { qualidade: 0.45, largura: 900 },
  { qualidade: 0.35, largura: 900 },
  { qualidade: 0.35, largura: 700 },
  { qualidade: 0.35, largura: 560 },
];

export function ehChaveDeFoto(chave: string): boolean {
  return chave.startsWith('nr13_fotos_');
}

export type Recompressor = (valor: string, passo: PassoDegradacao) => Promise<string>;

/**
 * Aplica os passos até caber. Recomprime SÓ as chaves de foto: degradar o JSON
 * do memorial não economizaria nada e corromperia o documento.
 *
 * O recompressor é injetado porque depende de `canvas`, que não existe no
 * ambiente de teste — e porque falha de recompressão não pode derrubar a
 * montagem: nesse caso segue com o original e o orçamento decide.
 */
export async function degradarAteCaber(
  itens: ItemPalco[],
  recomprimir: Recompressor,
): Promise<{ cabe: true; itens: ItemPalco[]; total: number } | Recusa> {
  let atuais = itens;
  const inicial = orcar(atuais);
  if (inicial.cabe) return { cabe: true, itens: atuais, total: inicial.total };

  for (const passo of PLANO_DEGRADACAO) {
    atuais = await Promise.all(
      atuais.map(async (item) => {
        if (!ehChaveDeFoto(item.chave)) return item;
        try {
          return { chave: item.chave, valor: await recomprimir(item.valor, passo) };
        } catch {
          return item; // recompressão falhou: segue com o original
        }
      }),
    );
    const r = orcar(atuais);
    if (r.cabe) return { cabe: true, itens: atuais, total: r.total };
  }
  return orcar(atuais) as Recusa;
}
```

- [ ] **Step 8: Criar o recompressor real (usado em runtime, não no teste)**

```ts
// src/services/recompressorFoto.ts
import type { Recompressor } from './palco';

/**
 * Gera a "variante de relatório" (§5.2): redesenha cada foto do array
 * `nr13_fotos_<TAG>` em canvas na largura e qualidade do passo.
 * Só roda no navegador — o palco recebe esta função por injeção.
 */
export const recomprimirFotosDoValor: Recompressor = async (valor, passo) => {
  const fotos = JSON.parse(valor) as Array<{ src: string; [k: string]: unknown }>;
  if (!Array.isArray(fotos)) return valor;
  const novas = await Promise.all(
    fotos.map(async (f) => (typeof f.src === 'string' ? { ...f, src: await redesenhar(f.src, passo) } : f)),
  );
  return JSON.stringify(novas);
};

function redesenhar(dataUrl: string, passo: { qualidade: number; largura: number }): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, passo.largura / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', passo.qualidade));
    };
    img.onerror = () => resolve(dataUrl); // imagem quebrada: mantém como está
    img.src = dataUrl;
  });
}
```

- [ ] **Step 9: Rodar e verificar que passa**

Run: `npx vitest run src/services/palco.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 10: Commit**

```bash
git add src/services/palco.ts src/services/recompressorFoto.ts src/services/palco.test.ts
git commit -m "feat(armazenamento): palco com orcamento, degradacao em passos e montagem atomica"
```

---

## Task 11: `storage.ts` como orquestrador + teste de regressão do bug real

**Files:**
- Modify: `src/services/storage.ts` (reescrita: 515 linhas → orquestrador fino)
- Modify: `src/services/storage.gate.test.ts` (bloqueado agora erra)
- Test: `src/services/storage.regressao.test.ts`

**Interfaces:**
- Consumes: Tasks 3-10.
- Produces (API pública preservada): `ler`, `salvar`, `lerTudo`, `listarChavesComPrefixo`, `excluirChave`, `excluirVaso`, `limparCacheDados`, `flushFila`, `bloqueadoParaEscrita`, `lerRemoto`.
- Novo: `salvar` passa a **lançar** `ErroBloqueado` quando `bloqueadoParaEscrita()` — corrige D1.

Este é o teste que prova o conserto: hoje ele falha na `main`.

- [ ] **Step 1: Escrever o teste de regressão (falha primeiro)**

```ts
// src/services/storage.regressao.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Espelha a conta cmam.caldeiras medida em 04/08/2026: 38 equipamentos,
// ~3.900 KB de fotos, ~5.700 KB no total. Antes desta refatoração, a
// hidratação ordenada por nome estourava a cota dentro de `nr13_fotos_` e
// NENHUM `nr13_info_` entrava no cache.
const linhas: Array<{ chave: string; valor: string }> = [];
for (let i = 0; i < 38; i++) {
  const tag = `ACA ${2000 + i}`;
  linhas.push({ chave: `nr13_fotos_${tag}`, valor: 'f'.repeat(103 * 1024) });
  linhas.push({ chave: `nr13_info_${tag}`, valor: JSON.stringify({ tag, tipo: 'vaso' }) });
}

const range = vi.fn(async () => ({ data: linhas, error: null }));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ range }) }) }),
      upsert: vi.fn(async () => ({ error: null })),
    }),
  },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: '11111111-1111-1111-1111-111111111111' })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { zerarMemoria } from './cacheLocal';
import { lerTudo, listarChavesComPrefixo, ler } from './storage';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  zerarMemoria();
  fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  localStorage.setItem('nr13_org_id', ORG);
});

describe('REGRESSÃO do sumiço de equipamentos (conta cmam.caldeiras, 04/08/2026)', () => {
  it('hidrata os 38 equipamentos mesmo com ~5,7 MB de dados', async () => {
    await lerTudo();
    expect(listarChavesComPrefixo('nr13_info_')).toHaveLength(38);
  });

  it('a ficha de cada equipamento é legível depois da hidratação', async () => {
    await lerTudo();
    expect(ler<{ tag: string }>('nr13_info_ACA 2037')?.tag).toBe('ACA 2037');
  });

  it('não depende do localStorage: o cache de 5,7 MB não tenta caber nos 5 MB', async () => {
    await lerTudo();
    expect(localStorage.getItem('nr13_info_ACA 2000')).toBeNull();
    expect(ler('nr13_info_ACA 2000')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/storage.regressao.test.ts`
Expected: FAIL — o `storage.ts` atual grava tudo no `localStorage` e estoura a cota.

- [ ] **Step 3: Reescrever `storage.ts` como orquestrador**

Substituir o corpo inteiro do arquivo, preservando a API pública. Pontos obrigatórios:

```ts
// src/services/storage.ts (estrutura — preservar TODOS os exports listados nas Interfaces)
import { supabase, escopoStorageAtual, idUsuarioAtual, TABELA_STORAGE } from './supabase';
import * as cache from './cacheLocal';
import * as sync from './sync';
import { limparPalco } from './palco';
import { atualizarManifesto } from './manifesto';

export class ErroBloqueado extends Error {
  constructor() {
    // D1: até 04/08/2026 este caminho gravava no cache e retornava em silêncio.
    // A tela dizia "salvo", o reconcile apagava 60s depois e o dado sumia.
    super('Alteração não salva: assinatura suspensa ou acesso somente leitura.');
    this.name = 'ErroBloqueado';
  }
}

export function ler<T = unknown>(chave: string): T | null {
  const reg = cache.obterRegistro(chave);
  if (!reg) return null;
  try { return JSON.parse(reg.valor) as T; } catch { return reg.valor as unknown as T; }
}

export function listarChavesComPrefixo(prefixo: string): string[] {
  return cache.chavesComPrefixo(prefixo);
}

export async function salvar(chave: string, objeto: unknown): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado(); // NUNCA fingir sucesso
  const valor = JSON.stringify(objeto);
  const anterior = cache.obterRegistro(chave);
  const versao = (anterior?.versao ?? 0) + 1;
  cache.gravarRegistro(chave, {
    valor, versao, atualizadoEm: new Date().toISOString(), dispositivo: sync.idDispositivo(),
  });
  await sync.enfileirar('set', chave, valor, anterior?.versao ?? 0);
  atualizarManifesto();
  await sync.drenar();
  atualizarManifesto();
}

export async function excluirChave(chave: string): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  const anterior = cache.obterRegistro(chave);
  await sync.registrarTombstone(chave, anterior?.versao ?? 0);
  cache.removerRegistro(chave);
  await sync.enfileirar('del', chave, undefined, anterior?.versao ?? 0);
  atualizarManifesto();
  await sync.drenar();
}

export async function excluirVaso(tag: string): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  // Índice por TAG em vez do casamento por sufixo `_<TAG>` (corrige D7).
  for (const chave of cache.chavesDaTag(tag)) await excluirChave(chave);
}

export async function lerTudo(): Promise<Record<string, string>> { /* ver Step 4 */ }
export function limparCacheDados(): void { /* ver Task 12 */ }
export async function flushFila(): Promise<void> { await sync.drenar(); atualizarManifesto(); }
// bloqueadoParaEscrita e lerRemoto: manter as implementações atuais (linhas 79-94 e 148-164).
```

- [ ] **Step 4: Implementar `lerTudo` sem apagar-por-ausência**

```ts
export async function lerTudo(): Promise<Record<string, string>> {
  const escopo = await escopoStorageAtual();
  if (!escopo) return {};
  cache.definirOrg(escopo.id);
  await cache.hidratarDoDisco();      // boot offline funciona a partir daqui
  await sync.carregarFilaDoDisco();
  await sync.carregarTombstonesDoDisco();
  await sync.drenar();

  const dados: Record<string, string> = {};
  try {
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase
        .from(TABELA_STORAGE)
        .select('chave, valor, versao, atualizado_em, dispositivo, deletado_em')
        .eq(escopo.coluna, escopo.id)
        .order('chave', { ascending: true })
        .range(inicio, inicio + 999);
      if (error) return {};        // offline: fica com o que veio do IndexedDB
      if (!data || data.length === 0) break;

      for (const row of data as Array<Record<string, unknown>>) {
        const chave = String(row.chave);
        const atualizadoEm = String(row.atualizado_em ?? '');
        // Soft-delete propaga a exclusão feita em OUTRO aparelho.
        if (row.deletado_em) { cache.removerRegistro(chave); continue; }
        // Tombstone local mais novo: não ressuscita (§7.3).
        if (sync.tombstoneMaisNovoQue(chave, atualizadoEm)) continue;
        // Escrita local ainda pendente vence o servidor: ela é mais nova.
        if (sync.itemDaChave(chave)) continue;
        if (row.valor == null) continue;
        const valor = String(row.valor);
        cache.gravarRegistro(chave, {
          valor,
          versao: Number(row.versao ?? 1),
          atualizadoEm,
          dispositivo: row.dispositivo ? String(row.dispositivo) : null,
        });
        dados[chave] = valor;
      }
      if (data.length < 1000) break;
    }
  } catch {
    return {}; // offline
  }
  // NÃO existe mais varredura removendo chaves locais ausentes no servidor.
  // Era ela que transformava falha de rede/cota em sumiço de dado.
  return dados;
}
```

- [ ] **Step 5: Atualizar o teste do gate (bloqueado agora ERRA)**

Em `src/services/storage.gate.test.ts`, acrescentar:

```ts
import { salvar, ErroBloqueado } from './storage';

describe('salvar com escrita bloqueada — não finge sucesso (D1)', () => {
  it('assinatura somente_leitura -> lança ErroBloqueado', async () => {
    localStorage.setItem('nr13_assinatura_status', 'somente_leitura');
    await expect(salvar('nr13_info_A', { tag: 'A' })).rejects.toBeInstanceOf(ErroBloqueado);
  });

  it('papel cliente -> lança ErroBloqueado', async () => {
    localStorage.setItem('nr13_papel', 'cliente');
    await expect(salvar('nr13_info_A', { tag: 'A' })).rejects.toBeInstanceOf(ErroBloqueado);
  });
});
```

- [ ] **Step 6: Rodar tudo e verificar que passa**

Run: `npm test`
Expected: PASS — incluindo os 3 testes de regressão que falhavam no Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/services/storage.ts src/services/storage.gate.test.ts src/services/storage.regressao.test.ts
git commit -m "feat(armazenamento): storage.ts vira orquestrador; fim do apagar-por-ausencia"
```

---

## Task 12: Isolamento na troca de conta

**Files:**
- Modify: `src/services/storage.ts` (`limparCacheDados`)
- Modify: `src/services/auth.ts:475-489` (`encerrarSessaoLocal`)
- Test: `src/services/isolamento.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 10.
- Produces: `limparCacheDados()` agora zera Map, palco, fila em memória e fecha o IndexedDB.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/isolamento.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
  escopoStorageAtual: vi.fn(),
  idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { definirOrg, gravarRegistro, obterRegistro } from './cacheLocal';
import { materializar } from './palco';
import { limparCacheDados } from './storage';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const reg = (v: string) => ({ valor: v, versao: 1, atualizadoEm: '2026-08-04T00:00:00.000Z', dispositivo: 'd' });

beforeEach(() => { localStorage.clear(); definirOrg(ORG_A); });

describe('isolamento entre organizações', () => {
  it('limparCacheDados zera o Map', () => {
    gravarRegistro('nr13_info_A', reg('{}'));
    limparCacheDados();
    expect(obterRegistro('nr13_info_A')).toBeNull();
  });

  it('limparCacheDados limpa o palco', () => {
    materializar([{ chave: 'nr13_info_A', valor: '{}' }]);
    limparCacheDados();
    expect(localStorage.getItem('nr13_info_A')).toBeNull();
  });

  it('preserva as chaves de sessão (regravadas no login)', () => {
    localStorage.setItem('nr13_usuario_logado', 'a@b.com');
    localStorage.setItem('nr13_dispositivo_id', 'd-1');
    limparCacheDados();
    expect(localStorage.getItem('nr13_usuario_logado')).toBe('a@b.com');
    expect(localStorage.getItem('nr13_dispositivo_id')).toBe('d-1');
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/isolamento.test.ts`
Expected: FAIL — `limparCacheDados` ainda só varre o `localStorage`.

- [ ] **Step 3: Implementar**

```ts
// src/services/storage.ts
import { fecharDb } from './db';

/**
 * Faxina ao trocar de conta. O isolamento entre organizações agora vem do
 * namespace do IndexedDB (`nr13_dados_<org_id>`), não mais de varrer e apagar
 * chaves — foi o apagar que causou o bug original.
 */
export function limparCacheDados(): void {
  cache.zerarMemoria();
  sync.zerarFilaMemoria();
  limparPalco();
  fecharDb();
  cache.definirOrg(null);
}
```

Em `src/services/auth.ts`, na `encerrarSessaoLocal` (hoje linhas 475-489), acrescentar `nr13_dispositivo_id` à lista de chaves preservadas e chamar `apagarDb(orgAnterior)` **apenas no logout explícito** — nunca na troca de aba.

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/isolamento.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/storage.ts src/services/auth.ts src/services/isolamento.test.ts
git commit -m "feat(armazenamento): isolamento por org na troca de conta"
```

---

## Task 13: `sb-storage.js` — escrita dos templates pela fila do app

**Files:**
- Modify: `public/sb-storage.js`
- Test: `src/services/sbStorage.contrato.test.ts`

**Interfaces:**
- Consumes: formato de `ItemFila` (Task 6).
- Produces: `window.sbSalvar(chave, valor)` grava no palco e deposita em `nr13_fila_ponte`, que o app drena.

Corrige D5: o upsert atual (`sb-storage.js:70`) manda `{user_id, chave, valor}` **sem `org_id`**, então a RLS por org sempre recusa e a escrita só sobrevive porque cai na fila. Em vez de duplicar a lógica de versionamento no JS solto, o template deposita e o app envia.

- [ ] **Step 1: Escrever o teste do contrato da ponte (falha primeiro)**

```ts
// src/services/sbStorage.contrato.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { lerPonte, limparPonte } from './storage';

beforeEach(() => localStorage.clear());

describe('ponte de escrita dos templates (sb-storage.js -> app)', () => {
  it('lê o que o template depositou', () => {
    localStorage.setItem('nr13_fila_ponte', JSON.stringify([
      { chave: 'nr13_med_esp_ACA 2040', valor: '{"pontos":[]}' },
    ]));
    expect(lerPonte()).toEqual([{ chave: 'nr13_med_esp_ACA 2040', valor: '{"pontos":[]}' }]);
  });

  it('ponte ausente ou corrompida devolve lista vazia, nunca lança', () => {
    expect(lerPonte()).toEqual([]);
    localStorage.setItem('nr13_fila_ponte', 'lixo{');
    expect(lerPonte()).toEqual([]);
  });

  it('limparPonte esvazia', () => {
    localStorage.setItem('nr13_fila_ponte', JSON.stringify([{ chave: 'k', valor: 'v' }]));
    limparPonte();
    expect(lerPonte()).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/sbStorage.contrato.test.ts`
Expected: FAIL — `lerPonte` não existe.

- [ ] **Step 3: Implementar o lado do app**

```ts
// src/services/storage.ts
const CHAVE_PONTE = 'nr13_fila_ponte';

export function lerPonte(): Array<{ chave: string; valor: string }> {
  const raw = localStorage.getItem(CHAVE_PONTE);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return []; // depósito corrompido não pode derrubar o app
  }
}

export function limparPonte(): void { localStorage.removeItem(CHAVE_PONTE); }

/** Absorve o que os templates gravaram durante a montagem do documento. */
export async function drenarPonte(): Promise<void> {
  const itens = lerPonte();
  if (itens.length === 0) return;
  limparPonte();
  for (const { chave, valor } of itens) await salvar(chave, JSON.parse(valor));
}
```

- [ ] **Step 4: Simplificar `public/sb-storage.js`**

Substituir o corpo por um depósito puro — sem token, sem REST, sem `org_id` errado:

```js
// public/sb-storage.js
// Escrita feita DENTRO dos templates HTML (iframe). O template não fala mais
// com o Supabase: ele deposita aqui e o app envia pela fila, que é quem sabe
// org_id, versão e dispositivo. Antes, o upsert daqui ia SEM org_id e a RLS
// por organização recusava toda escrita direta.
(function () {
  var PONTE = 'nr13_fila_ponte';
  window.sbSalvar = function (chave, valor) {
    if ((localStorage.getItem('nr13_papel') || '') === 'cliente') return; // portal é leitura
    try { localStorage.setItem(chave, valor); } catch (e) {}
    try {
      var fila = [];
      try { fila = JSON.parse(localStorage.getItem(PONTE) || '[]'); } catch (e) {}
      if (!Array.isArray(fila)) fila = [];
      fila = fila.filter(function (o) { return o && o.chave !== chave; });
      fila.push({ chave: chave, valor: valor });
      localStorage.setItem(PONTE, JSON.stringify(fila));
    } catch (e) {}
  };
})();
```

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/services/sbStorage.contrato.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 6: Commit**

```bash
git add public/sb-storage.js src/services/storage.ts src/services/sbStorage.contrato.test.ts
git commit -m "fix(armazenamento): escrita dos templates passa pela fila do app (corrige org_id ausente)"
```

---

## Task 14: `<SeloSync/>` e a tela `/pendencias`

**Files:**
- Create: `src/services/selo.ts`
- Create: `src/components/SeloSync.tsx`
- Create: `src/pages/Pendencias.tsx`
- Modify: `src/app/Layout.tsx` (montar o selo + rota)
- Test: `src/services/selo.test.ts`

**Interfaces:**
- Consumes: `sync.ts` (`listarFila`, `tentarNovamente`), `errosSync.ts`, `manifesto.ts`, `quotaDispositivo.ts`.
- Produces: `resumoSelo(itens: ItemFila[]): { rotulo: string; nivel: 'ok'|'pendente'|'falha' }`

Os cinco estados do §9.2 precisam ser visualmente distintos. `bloqueado_nao_salvo` não vem da fila (bloqueado nunca entra nela) — vem do `ErroBloqueado` capturado pela tela que chamou `salvar`.

- [ ] **Step 1: Escrever o teste da lógica do selo (falha primeiro)**

```ts
// src/services/selo.test.ts
import { describe, it, expect } from 'vitest';
import { resumoSelo } from './selo';

const item = (estado: string) => ({ estado } as never);

describe('resumoSelo — os cinco estados do §9.2 são distinguíveis', () => {
  it('fila vazia -> tudo salvo', () => {
    expect(resumoSelo([])).toEqual({ rotulo: 'Tudo salvo', nivel: 'ok' });
  });

  it('aguardando -> conta pendências', () => {
    expect(resumoSelo([item('aguardando'), item('aguardando')]))
      .toEqual({ rotulo: '2 pendências', nivel: 'pendente' });
  });

  it('1 pendência no singular', () => {
    expect(resumoSelo([item('aguardando')]))
      .toEqual({ rotulo: '1 pendência', nivel: 'pendente' });
  });

  it('falha_definitiva domina o rótulo', () => {
    expect(resumoSelo([item('aguardando'), item('falha_definitiva')]))
      .toEqual({ rotulo: '1 falha', nivel: 'falha' });
  });

  it('conflito também é falha (exige decisão)', () => {
    expect(resumoSelo([item('conflito')])).toEqual({ rotulo: '1 falha', nivel: 'falha' });
  });

  it('sincronizado não conta como pendência', () => {
    expect(resumoSelo([item('sincronizado')])).toEqual({ rotulo: 'Tudo salvo', nivel: 'ok' });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/selo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a lógica**

```ts
// src/services/selo.ts
import type { ItemFila } from './sync';

export function resumoSelo(itens: ItemFila[]): { rotulo: string; nivel: 'ok' | 'pendente' | 'falha' } {
  const falhas = itens.filter((i) => i.estado === 'falha_definitiva' || i.estado === 'conflito').length;
  if (falhas > 0) return { rotulo: `${falhas} ${falhas === 1 ? 'falha' : 'falhas'}`, nivel: 'falha' };
  const pend = itens.filter((i) => i.estado === 'aguardando' || i.estado === 'salvo_local').length;
  if (pend > 0) return { rotulo: `${pend} ${pend === 1 ? 'pendência' : 'pendências'}`, nivel: 'pendente' };
  return { rotulo: 'Tudo salvo', nivel: 'ok' };
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `npx vitest run src/services/selo.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Criar `SeloSync.tsx`**

Sem emoji e sem lucide — o repo usa o sprite próprio em `src/components/Icone.tsx`. Cores vêm dos tokens de `design/`.

```tsx
// src/components/SeloSync.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarFila } from '../services/sync';
import { resumoSelo } from '../services/selo';
import { medirUso, nivelDaFracao, pedirPersistencia, type NivelQuota } from '../services/quotaDispositivo';
import Icone from './Icone';

const ICONE = { ok: 'nuvem-ok', pendente: 'nuvem-subindo', falha: 'alerta' } as const;

export default function SeloSync() {
  const navegar = useNavigate();
  const [resumo, setResumo] = useState(() => resumoSelo(listarFila()));
  const [quota, setQuota] = useState<NivelQuota>('ok');
  const [semPersistencia, setSemPersistencia] = useState(false);

  useEffect(() => {
    void pedirPersistencia().then((ok) => setSemPersistencia(!ok));
    const t = setInterval(() => {
      setResumo(resumoSelo(listarFila()));
      void medirUso().then((m) => setQuota(m ? nivelDaFracao(m.fracao) : 'ok'));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <button
      type="button"
      className={`selo-sync selo-sync--${resumo.nivel}`}
      onClick={() => navegar('/pendencias')}
      title={
        semPersistencia
          ? 'Este navegador não garantiu o armazenamento: sincronize com frequência.'
          : 'Ver pendências de sincronização'
      }
    >
      <Icone nome={ICONE[resumo.nivel]} />
      <span>{resumo.rotulo}</span>
      {quota !== 'ok' && <span className="selo-sync__quota">Espaço {quota === 'critico' ? 'esgotando' : 'baixo'}</span>}
      {semPersistencia && <span className="selo-sync__risco">Armazenamento sem garantia</span>}
    </button>
  );
}
```

- [ ] **Step 6: Criar `Pendencias.tsx`**

```tsx
// src/pages/Pendencias.tsx
import { useState } from 'react';
import { listarFila, tentarNovamente, type ItemFila } from '../services/sync';
import { diagnosticarPerda } from '../services/manifesto';

export default function Pendencias() {
  const [itens, setItens] = useState<ItemFila[]>(() => listarFila());
  const perda = diagnosticarPerda(true);
  const recarregar = () => setItens(listarFila());

  return (
    <section className="pendencias">
      <h1>Pendências de sincronização</h1>

      {perda.tipo === 'despejo_detectado' && (
        <div className="aviso aviso--erro">
          <strong>O navegador apagou {perda.perdidos.length} alteração(ões) que ainda não tinham subido.</strong>
          <ul>{perda.perdidos.map((p) => <li key={p.mutationId}>{p.chave} — {p.criadoEm}</li>)}</ul>
        </div>
      )}
      {perda.tipo === 'estado_zerado' && (
        <div className="aviso aviso--erro">
          Se havia alterações não sincronizadas neste aparelho, elas foram perdidas.
          Não é possível listar quais: o registro foi apagado junto.
        </div>
      )}

      {itens.length === 0 && <p>Tudo sincronizado.</p>}

      {itens.map((item) => (
        <article key={item.mutationId} className={`pendencia pendencia--${item.estado}`}>
          <h2>{item.chave}</h2>
          <p className="pendencia__titulo">{item.erro?.titulo ?? 'Aguardando envio'}</p>
          <p className="pendencia__explicacao">{item.erro?.explicacao ?? 'Na fila para subir.'}</p>
          <p className="pendencia__quando">{item.criadoEm} · {item.tentativas} tentativa(s)</p>

          <button type="button" onClick={() => void tentarNovamente(item.mutationId).then(recarregar)}>
            Tentar de novo
          </button>

          {item.erro && (
            <details className="pendencia__detalhes">
              <summary>Detalhes técnicos</summary>
              <dl>
                <dt>Código</dt><dd>{item.erro.detalhe.codigo}</dd>
                <dt>Mensagem original</dt><dd><code>{item.erro.detalhe.mensagemOriginal}</code></dd>
                <dt>Identificador</dt><dd>{item.erro.detalhe.mutationId}</dd>
                <dt>Aparelho</dt><dd>{item.erro.detalhe.dispositivo}</dd>
                <dt>Quando</dt><dd>{item.erro.detalhe.quando}</dd>
              </dl>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(JSON.stringify(item.erro!.detalhe, null, 2))}
              >
                Copiar para o suporte
              </button>
            </details>
          )}
        </article>
      ))}

      <button
        type="button"
        onClick={() => void Promise.all(itens.map((i) => tentarNovamente(i.mutationId))).then(recarregar)}
      >
        Tentar todas
      </button>
    </section>
  );
}
```

> `tentarNovamente(mutationId)` de propósito, **nunca** `enfileirar` — reenfileirar criaria uma segunda mutação para a mesma alteração (§6.2).

- [ ] **Step 7: Montar no Layout**

Em `src/app/Layout.tsx`, renderizar `<SeloSync/>` junto de `<ModalAviso/>` (linha 273) e registrar a rota `/pendencias`.

- [ ] **Step 8: Rodar a suíte e o build**

Run: `npm test && npm run build`
Expected: PASS nos dois.

- [ ] **Step 9: Commit**

```bash
git add src/services/selo.ts src/services/selo.test.ts src/components/SeloSync.tsx src/pages/Pendencias.tsx src/app/Layout.tsx
git commit -m "feat(armazenamento): selo de sincronizacao e tela de pendencias"
```

---

## Task 15: Integrar o palco nas telas de documento

**Files:**
- Modify: `src/pages/Relatorios.tsx`, `src/pages/Prontuarios.tsx`, `src/pages/LivroRegistro.tsx`
- Test: `src/services/palco.integracao.test.ts`

**Interfaces:**
- Consumes: `palco.ts` (Task 10), `cacheLocal.ts`, `storage.ts` (`drenarPonte`).
- Produces: `montarPalcoDaTag(tag: string): { ok: true } | Recusa | { ok: false; erro: unknown; chaveQueFalhou: string }`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/palco.integracao.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() }, escopoStorageAtual: vi.fn(), idUsuarioAtual: vi.fn(),
  TABELA_STORAGE: 'app_storage',
}));

import { definirOrg, gravarRegistro, zerarMemoria } from './cacheLocal';
import { montarPalcoDaTag } from './palco';

const reg = (v: string) => ({ valor: v, versao: 1, atualizadoEm: '2026-08-04T00:00:00.000Z', dispositivo: 'd' });

beforeEach(() => {
  localStorage.clear();
  zerarMemoria();
  definirOrg('11111111-1111-1111-1111-111111111111');
});

describe('montarPalcoDaTag', () => {
  it('materializa só as chaves da TAG pedida', async () => {
    gravarRegistro('nr13_info_A', reg('{"tag":"A"}'));
    gravarRegistro('nr13_info_B', reg('{"tag":"B"}'));
    gravarRegistro('nr13_minha_empresa', reg('{"nome":"X"}'));

    expect(await montarPalcoDaTag('A')).toEqual({ ok: true });
    expect(localStorage.getItem('nr13_info_A')).toBe('{"tag":"A"}');
    expect(localStorage.getItem('nr13_minha_empresa')).toBe('{"nome":"X"}');
    expect(localStorage.getItem('nr13_info_B')).toBeNull();
  });

  it('NÃO leva nr13_docs_ para o palco: nenhum template lê essa chave', async () => {
    gravarRegistro('nr13_info_A', reg('{"tag":"A"}'));
    gravarRegistro('nr13_docs_A', reg('x'.repeat(900 * 1024)));

    expect(await montarPalcoDaTag('A')).toEqual({ ok: true });
    expect(localStorage.getItem('nr13_docs_A')).toBeNull();
  });

  it('acima do orçamento e sem degradação possível: RECUSA e não monta nada', async () => {
    // Recompressor que não reduz nada força o plano a se esgotar.
    gravarRegistro('nr13_fotos_A', reg(JSON.stringify([{ src: 'x'.repeat(4_000 * 1024) }])));
    gravarRegistro('nr13_info_A', reg('{}'));

    const r = await montarPalcoDaTag('A', async (v) => v);
    expect(r).toMatchObject({ cabe: false });
    expect(localStorage.getItem('nr13_info_A')).toBeNull(); // nem parcial
  });

  it('acima do orçamento MAS degradável: monta com as fotos recomprimidas', async () => {
    gravarRegistro('nr13_fotos_A', reg('x'.repeat(4_000 * 1024)));
    gravarRegistro('nr13_info_A', reg('{}'));

    const r = await montarPalcoDaTag('A', async (v) => v.slice(0, 1000));
    expect(r).toEqual({ ok: true });
    expect(localStorage.getItem('nr13_info_A')).toBe('{}');
    expect(localStorage.getItem('nr13_fotos_A')!.length).toBe(1000);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx vitest run src/services/palco.integracao.test.ts`
Expected: FAIL — `montarPalcoDaTag` não existe.

- [ ] **Step 3: Implementar em `palco.ts`**

```ts
// acrescentar a src/services/palco.ts
import { chavesDaTag, obterRegistro } from './cacheLocal';
import { recomprimirFotosDoValor } from './recompressorFoto';

const GLOBAIS = ['nr13_minha_empresa', 'nr13_lista_phs'];

// Chaves que NENHUM template HTML lê — confirmado por varredura em public/
// (04/08/2026): `nr13_docs_` é consumido só por código React. Levá-las ao
// palco gastaria o orçamento de 3,4 MB com dado que ninguém renderiza.
const FORA_DO_PALCO = ['nr13_docs_'];

export async function montarPalcoDaTag(
  tag: string,
  recomprimir = recomprimirFotosDoValor,
): Promise<{ ok: true } | Recusa | { ok: false; erro: unknown; chaveQueFalhou: string }> {
  limparPalco();
  const chaves = [...chavesDaTag(tag), ...GLOBAIS]
    .filter((c) => !FORA_DO_PALCO.some((p) => c.startsWith(p)));

  const itens: ItemPalco[] = [];
  for (const chave of chaves) {
    const reg = obterRegistro(chave);
    if (reg) itens.push({ chave, valor: reg.valor });
  }

  const resultado = await degradarAteCaber(itens, recomprimir);
  if (!resultado.cabe) return resultado;
  return materializar(resultado.itens);
}
```

- [ ] **Step 4: Ligar nas três telas**

O mesmo padrão nas três (`Relatorios.tsx`, `Prontuarios.tsx`, `LivroRegistro.tsx`), trocando só a TAG de origem:

```tsx
const [palco, setPalco] = useState<'montando' | 'pronto' | Recusa>('montando');

useEffect(() => {
  let vivo = true;
  void montarPalcoDaTag(tag).then((r) => {
    if (!vivo) return;
    if ('cabe' in r && !r.cabe) setPalco(r);          // recusa: NÃO montar iframes
    else if ('ok' in r && !r.ok) setPalco({
      cabe: false, total: 0, orcamento: ORCAMENTO_DOC,
      maiores: [{ chave: r.chaveQueFalhou, bytes: 0 }],
    });
    else setPalco('pronto');
  });
  return () => {
    vivo = false;
    limparPalco();
    void drenarPonte();   // absorve o que os templates gravaram via sbSalvar
  };
}, [tag]);

if (palco === 'montando') return <p>Preparando o documento…</p>;
if (palco !== 'pronto') return <RecusaPalco recusa={palco} />;
// ...só aqui os <iframe> são renderizados
```

`RecusaPalco` lista `recusa.maiores` (chave, tamanho), o total e o orçamento — o §5.5 exige dizer **exatamente** o que excedeu, e oferecer remover fotos ou dividir o relatório.

- [ ] **Step 5: Rodar e verificar que passa**

Run: `npx vitest run src/services/palco.integracao.test.ts && npm run build`
Expected: PASS nos dois.

- [ ] **Step 6: Commit**

```bash
git add src/services/palco.ts src/services/palco.integracao.test.ts src/pages/Relatorios.tsx src/pages/Prontuarios.tsx src/pages/LivroRegistro.tsx
git commit -m "feat(armazenamento): telas de documento montam e limpam o palco"
```

---

## Task 16: Cenários do §11.2 e fechamento

**Files:**
- Create: `src/services/cenarios.test.ts`
- Modify: `PENDENCIAS.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: todos os módulos anteriores.
- Produces: cobertura dos 15 cenários obrigatórios do spec.

- [ ] **Step 1: Escrever os cenários que ainda não têm teste**

Cobertos por tasks anteriores: 3 (fechar navegador — Task 6), 5 (sessão expirada — Task 7), 6 (exclusão offline — Task 7), 8 (troca de org — Task 12), 9 (reabrir offline — Task 4), 10 (relatório acima de 5 MB — Tasks 10/15), 11 e 14 (manifesto — Task 8), 12 (`persist()` negado — Task 9), 13 e 15 (piso de versão — Tasks 2/7).

Faltam **1** (duas abas) e **2** (dois dispositivos):

```ts
// src/services/cenarios.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsert = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ upsert }) },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: '11111111-1111-1111-1111-111111111111' })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

import { fecharDb, apagarDb } from './db';
import { definirOrg, zerarMemoria } from './cacheLocal';
import { enfileirar, listarFila, carregarFilaDoDisco, zerarFilaMemoria, guardarConflito } from './sync';

const ORG = '11111111-1111-1111-1111-111111111111';

beforeEach(async () => {
  zerarMemoria(); zerarFilaMemoria(); fecharDb();
  await apagarDb(ORG);
  localStorage.clear();
  definirOrg(ORG);
  upsert.mockReset();
});

describe('cenário 1 — duas abas no mesmo aparelho', () => {
  it('a fila é única: a segunda aba enxerga o que a primeira enfileirou', async () => {
    await enfileirar('set', 'nr13_info_A', '{"aba":1}', 1);
    await new Promise((r) => setTimeout(r, 20));

    zerarFilaMemoria();            // simula a 2ª aba, que começa com memória vazia
    await carregarFilaDoDisco();

    expect(listarFila()).toHaveLength(1);
    expect(listarFila()[0].valor).toBe('{"aba":1}');
  });

  it('a mesma chave nas duas abas não vira dois itens', async () => {
    await enfileirar('set', 'nr13_info_A', '{"aba":1}', 1);
    await new Promise((r) => setTimeout(r, 20));
    zerarFilaMemoria();
    await carregarFilaDoDisco();
    await enfileirar('set', 'nr13_info_A', '{"aba":2}', 1);
    expect(listarFila()).toHaveLength(1);
  });
});

describe('cenário 2 — dois dispositivos na mesma chave', () => {
  it('o perdedor do conflito é PRESERVADO, nunca descartado', async () => {
    const perdedor = {
      valor: '{"origem":"celular"}', versao: 4,
      atualizadoEm: '2026-08-04T10:00:00.000Z', dispositivo: 'celular',
    };
    await guardarConflito('nr13_form_A__c1__visual_externo', perdedor);

    const { listarTudo } = await import('./db');
    const guardados = await listarTudo<typeof perdedor>(ORG, 'dados');
    const conflito = guardados.find((g) => g.chave.startsWith('nr13_conflito_'));
    expect(conflito?.valor.valor).toBe('{"origem":"celular"}');
    expect(conflito?.valor.dispositivo).toBe('celular');
  });
});
```

- [ ] **Step 2: Rodar e verificar que passa**

Run: `npx vitest run src/services/cenarios.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 3: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — todos os arquivos, sem regressão nos testes que já existiam.

- [ ] **Step 4: Rodar o build real**

Run: `npm run build`
Expected: sucesso. O `tsc -b` é mais estrito que `tsc --noEmit`; qualquer erro aqui trava o deploy.

- [ ] **Step 5: Registrar a pendência de deploy**

Acrescentar a `PENDENCIAS.md`:

```markdown
- [ ] **Rodar `supabase/armazenamento_v2.sql`** no SQL Editor do Supabase (idempotente).
      Sem ele: `versao`/`deletado_em` não existem, a sincronização cai no caminho de
      erro e o piso de versão contra ressurreição não é aplicado. Cria também o bucket
      `inspecao` (usado na Fase 2).
- [ ] Agendar `select public.coletar_tombstones(30);` (mensal). A prova da exclusão
      permanece em `app_storage_excluidos`; só o `valor` é removido.
```

- [ ] **Step 6: Atualizar o CLAUDE.md**

Na §2, substituir a descrição do `localStorage` como "banco" pela arquitetura de quatro camadas, apontando para o spec. Registrar que `ler()` serve do `Map`, que o `localStorage` é só o palco, e que **nada é apagado localmente por ausência no servidor**.

- [ ] **Step 7: Commit**

```bash
git add src/services/cenarios.test.ts PENDENCIAS.md CLAUDE.md
git commit -m "test(armazenamento): cenarios de duas abas e dois dispositivos + pendencias de deploy"
```

---

## Verificação final

- [ ] `npm test` — verde, incluindo `storage.regressao.test.ts` (os 38 equipamentos).
- [ ] `npm run build` — sucesso.
- [ ] `grep -rn "catch\s*{\s*}" src/services/` — nenhum resultado nos módulos de dados.
- [ ] Conferido manualmente: nenhum `localStorage.setItem` de dado de equipamento fora do `palco.ts`.
- [ ] `supabase/armazenamento_v2.sql` rodado em produção **antes** do deploy do front.

## Fora de escopo (Fases 2 e 3)

Fotos no bucket, autosave granular por formulário, `esquema: 2` e migração preguiçosa. A Fase 1 mantém o base64 legado funcionando: ele passa a viver no `Map`/IndexedDB, onde cabe, e o palco o recomprime quando necessário.
