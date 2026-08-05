# Armazenamento offline-first — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o `localStorage` do papel de banco primário — `ler()` passa a servir de um `Map` em memória espelhado no IndexedDB, com gravação local atômica, sincronização transacional no servidor e erro sempre visível — devolvendo os 38 equipamentos da conta `cmam.caldeiras@gmail.com` e matando o teto de 5 MB.

**Architecture:** Quatro camadas com dono único (§3 do spec). Supabase é a verdade e passa a receber escrita por **RPC transacional** (`aplicar_mutacao_storage`), única forma de detectar conflito de versão e garantir idempotência. IndexedDB (`nr13_dados_<org_id>`) é o espelho durável, gravado em **transação única** entre as stores `dados`/`fila`/`tombstones`. Um `Map` em memória serve as leituras síncronas. O `localStorage` fica só como **palco** do documento aberto, com dono exclusivo por aba via Web Locks.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand, Supabase JS v2, Vitest (`environment: 'node'`), IndexedDB nativo, `fake-indexeddb` nos testes, Web Locks API, BroadcastChannel, `postMessage`.

**Spec:** `docs/superpowers/specs/2026-08-04-armazenamento-offline-design.md`. Este plano cobre **só a Fase 1**.

## Global Constraints

- **Nenhum `catch {}` vazio no caminho de dados** — inclusive em `public/sb-storage.js`.
- **Gravação local é atômica:** dado + fila + tombstone na MESMA transação do IndexedDB. A UI só diz "salvo localmente" depois do `tx.oncomplete`. Falha reverte o `Map`.
- **Nenhum teste usa `setTimeout` para "esperar" o IndexedDB.** Se um teste precisa esperar, é porque falta confirmação de transação no código.
- **Toda escrita no servidor passa pela RPC `aplicar_mutacao_storage`.** `upsert` direto em `app_storage` não detecta conflito e está proibido no caminho de sync.
- **O servidor decide o `org_id`** (`org_atual()`), nunca o cliente. A RPC é `security definer` e por isso re-checa papel, `acesso_vigente()` e `assinatura_permite_escrita()` explicitamente — `security definer` ignora RLS.
- **Nada é apagado localmente por ausência no servidor.** Só tombstone explícito remove.
- **Nenhuma versão é descartada sem alguém escolher.**
- **Nenhuma mensagem crua do Supabase na tela principal.** Sempre texto compreensível + "Detalhes técnicos".
- `ORCAMENTO_DOC = 3_400 * 1024` · `ORCAMENTO_IMG = 110 * 1024` · `LARGURA_REL = 900`.
- `ler()` **continua síncrono**. Mudar a assinatura quebra ~50 pontos de chamada e está fora de escopo.
- API pública preservada em `storage.ts`: `ler`, `salvar`, `lerTudo`, `listarChavesComPrefixo`, `excluirChave`, `excluirVaso`, `limparCacheDados`, `flushFila`, `bloqueadoParaEscrita`, `lerRemoto`.
- **Trabalho em branch `feat/armazenamento-offline`, nunca direto na `main`** (Task 14).
- **Todo o frontend novo atrás da feature flag `nr13_armazenamento_v2`** (Task 14).
- Commits em português, formato do repo. Fechar com `npm run build`.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade única |
|---|---|
| `vitest.setup.ts` | shims de `localStorage`/IndexedDB/BroadcastChannel para os testes |
| `src/services/db.ts` | IndexedDB cru, namespace por org, transações multi-store confirmadas |
| `src/services/familiasChave.ts` | tabela explícita prefixo → escopo (`tag`/`global`/`id`) |
| `src/services/cacheLocal.ts` | `Map` + espelho + índice por TAG + propagação entre abas |
| `src/services/errosSync.ts` | classificação e tradução de erro + detalhe técnico |
| `src/services/sync.ts` | fila durável, `mutationId`, RPC, conflitos, tombstones |
| `src/services/manifesto.ts` | manifesto de pendências e detecção (parcial) de despejo |
| `src/services/quotaDispositivo.ts` | `persist()`, `estimate()`, limiares |
| `src/services/palco.ts` | orçamento, degradação, materialização com rollback real, trava por aba |
| `src/services/recompressorFoto.ts` | variante de relatório (canvas) |
| `src/services/ponteTemplates.ts` | `postMessage` entre iframe e app, com confirmação |
| `src/services/flag.ts` | feature flag `nr13_armazenamento_v2` |
| `src/services/selo.ts` + `src/components/SeloSync.tsx` + `src/pages/Pendencias.tsx` | UI de estado |
| `supabase/armazenamento_v2.sql` | colunas, tabelas, RPC, coleta restrita, bucket |

**Modificados:** `vite.config.ts`, `src/services/storage.ts`, `src/services/auth.ts`, `src/app/Layout.tsx`, `public/sb-storage.js`, `src/pages/{Relatorios,Prontuarios,LivroRegistro}.tsx`, `src/services/storage.gate.test.ts`.

---

## Task 1: Infraestrutura de teste

*(Inalterada em relação à revisão anterior, com um acréscimo.)* Instalar `fake-indexeddb`, criar `vitest.setup.ts` com os shims de `localStorage` e `import 'fake-indexeddb/auto'`, registrar `setupFiles` no `vite.config.ts`.

**Acréscimo obrigatório:** shim de `BroadcastChannel` (usado pelo `cacheLocal` na Task 4) e de `navigator.locks` (usado pelo palco na Task 10), ambos ausentes no `environment: 'node'`:

```ts
// acrescentar a vitest.setup.ts
if (typeof globalThis.BroadcastChannel === 'undefined') {
  // Canais por nome, compartilhados no processo: é o que permite simular DUAS ABAS.
  const canais = new Map<string, Set<{ onmessage: ((e: { data: unknown }) => void) | null }>>();
  (globalThis as Record<string, unknown>).BroadcastChannel = class {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor(public name: string) {
      if (!canais.has(name)) canais.set(name, new Set());
      canais.get(name)!.add(this);
    }
    postMessage(data: unknown) {
      for (const outro of canais.get(this.name)!) if (outro !== this) outro.onmessage?.({ data });
    }
    close() { canais.get(this.name)!.delete(this); }
  };
}

if (typeof globalThis.navigator === 'undefined') {
  (globalThis as Record<string, unknown>).navigator = {};
}
if (!(globalThis.navigator as Navigator & { locks?: unknown }).locks) {
  const travados = new Set<string>();
  (globalThis.navigator as unknown as Record<string, unknown>).locks = {
    async request(nome: string, opcoes: { ifAvailable?: boolean }, fn: (lock: unknown) => unknown) {
      if (travados.has(nome)) return opcoes?.ifAvailable ? fn(null) : undefined;
      travados.add(nome);
      try { return await fn({ name: nome }); } finally { travados.delete(nome); }
    },
  };
}
```

Commit: `test(infra): setup com indexedDB, BroadcastChannel e Web Locks`

---

## Task 2 (REVISADA): SQL — RPC transacional, idempotência, corte por org

**Files:**
- Create: `supabase/armazenamento_v2.sql`
- Create: `src/services/contratoRpc.ts`
- Test: `src/services/contratoRpc.test.ts`

**Interfaces:**
- Produces: `type StatusMutacao = 'aplicado' | 'repetido' | 'conflito' | 'recusado'`, `type MotivoRecusa = 'versao_obsoleta' | 'anterior_ao_corte' | 'tombstone_mais_novo' | 'sem_permissao'`, `interface RespostaMutacao`, `interpretarResposta(bruto: unknown): RespostaMutacao`.

**O que mudou e por quê:**

| Ponto | Correção |
|---|---|
| #3 | `upsert` com `versaoBase + 1` **não detecta conflito**: dois aparelhos leem a versão 4, ambos gravam 5, o segundo sobrescreve o primeiro em silêncio. Substituído por RPC que compara `versao_esperada` com a versão atual **sob `for update`** e devolve `conflito` com a linha vigente. |
| #4 | `mutation_id` agora é **registrado no servidor** em `app_storage_mutacoes` (PK `org_id, mutation_id`). Resposta perdida + reenvio devolve o resultado anterior sem reaplicar. |
| #5 | `sync_corte` sai de `profiles` (era por perfil, não por org, e a coleta atualizava **todos os perfis de todas as organizações** sem filtro) e vai para `org_sync`. `coletar_tombstones` passa a receber `org_id` e a exigir `service_role`. |
| #6 | `app_storage_excluidos` passa a ser preenchida **no momento da exclusão**, não na coleta — antes, um aparelho antigo podia dar `upsert` com `deletado_em = null` e reverter um tombstone ainda não coletado. A RPC também compara `p_mutado_em` com `deletado_em` da linha vigente. |
| #5 | O corte é validado **dentro da RPC**. Na versão anterior, `aceitaEscrita()` era criada e nunca chamada por ninguém. |

- [ ] **Step 1: Escrever o SQL**

```sql
-- supabase/armazenamento_v2.sql — Fase 1. IDEMPOTENTE.

-- ── 1. Colunas de versionamento e soft-delete ──────────────────────────────
alter table public.app_storage add column if not exists versao      integer not null default 1;
alter table public.app_storage add column if not exists dispositivo text;
alter table public.app_storage add column if not exists deletado_em timestamptz;
create index if not exists app_storage_deletado_idx on public.app_storage (org_id, deletado_em);

-- ── 2. Historico PERMANENTE de exclusoes ───────────────────────────────────
-- Preenchida NA EXCLUSAO (nao na coleta): enquanto o tombstone ainda estava so
-- em app_storage, um aparelho antigo revertia deletado_em para null e o dado
-- ressuscitava dentro da janela de 30 dias.
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

-- ── 3. Idempotencia: mutacoes ja processadas ───────────────────────────────
create table if not exists public.app_storage_mutacoes (
  org_id      uuid        not null,
  mutation_id uuid        not null,
  resultado   jsonb       not null,
  aplicado_em timestamptz not null default now(),
  primary key (org_id, mutation_id)
);
alter table public.app_storage_mutacoes enable row level security;
-- Sem policy de select: so a RPC (security definer) enxerga.

-- ── 4. Corte de sincronizacao POR ORGANIZACAO ──────────────────────────────
create table if not exists public.org_sync (
  org_id     uuid primary key,
  sync_corte timestamptz
);
alter table public.org_sync enable row level security;
drop policy if exists org_sync_select on public.org_sync;
create policy org_sync_select on public.org_sync
  for select using (org_id = public.org_atual());

-- ── 5. RPC TRANSACIONAL: unica porta de escrita do app ─────────────────────
-- security definer IGNORA RLS, entao papel/assinatura/prazo sao re-checados
-- aqui dentro, explicitamente.
create or replace function public.aplicar_mutacao_storage(
  p_chave           text,
  p_mutation_id     uuid,
  p_op              text,          -- 'set' | 'del'
  p_valor           text,
  p_versao_esperada integer,       -- 0 = espera que a chave NAO exista
  p_dispositivo     text,
  p_mutado_em       timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org       uuid;
  v_res       jsonb;
  v_corte     timestamptz;
  v_piso      integer;
  v_atual     public.app_storage%rowtype;
  v_nova      integer;
  v_user      uuid := auth.uid();
begin
  v_org := public.org_atual();
  if v_org is null then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- Idempotencia: mesma mutacao chegando de novo devolve o resultado anterior.
  select resultado into v_res
    from public.app_storage_mutacoes
   where org_id = v_org and mutation_id = p_mutation_id;
  if found then
    return v_res || jsonb_build_object('status','repetido');
  end if;

  if public.papel_atual() not in ('mestre','gerente','funcionario')
     or not public.acesso_vigente()
     or not public.assinatura_permite_escrita() then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- Corte da org: mutacao criada antes da ultima coleta nunca e aplicada sozinha.
  select sync_corte into v_corte from public.org_sync where org_id = v_org;
  if v_corte is not null and p_mutado_em < v_corte then
    v_res := jsonb_build_object('status','recusado','motivo','anterior_ao_corte');
    insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
      values (v_org, p_mutation_id, v_res);
    return v_res;
  end if;

  v_nova := p_versao_esperada + 1;

  -- Piso de versao: chave ja excluida nao volta com versao antiga.
  select versao_final into v_piso
    from public.app_storage_excluidos
   where org_id = v_org and chave = p_chave;
  if v_piso is not null and v_nova <= v_piso then
    v_res := jsonb_build_object('status','recusado','motivo','versao_obsoleta','versao', v_piso);
    insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
      values (v_org, p_mutation_id, v_res);
    return v_res;
  end if;

  select * into v_atual from public.app_storage
   where org_id = v_org and chave = p_chave
   for update;

  if found then
    -- CONFLITO: alguem gravou entre a leitura do cliente e este envio.
    if v_atual.versao <> p_versao_esperada then
      v_res := jsonb_build_object(
        'status','conflito',
        'versao', v_atual.versao,
        'valor', v_atual.valor,
        'atualizado_em', v_atual.atualizado_em,
        'dispositivo', v_atual.dispositivo,
        'deletado_em', v_atual.deletado_em);
      insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;

    -- Tombstone ainda nao coletado nao pode ser revertido por escrita mais antiga.
    if v_atual.deletado_em is not null and p_mutado_em < v_atual.deletado_em then
      v_res := jsonb_build_object('status','recusado','motivo','tombstone_mais_novo',
                                  'versao', v_atual.versao);
      insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;
  else
    if p_versao_esperada <> 0 then
      v_res := jsonb_build_object('status','conflito','versao', 0, 'valor', null);
      insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;
  end if;

  if p_op = 'set' then
    insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em)
    values (v_org, v_user, p_chave, p_valor, v_nova, p_dispositivo, null, now())
    on conflict (org_id, chave) do update
      set valor = excluded.valor, versao = excluded.versao, dispositivo = excluded.dispositivo,
          deletado_em = null, atualizado_em = now();
  else
    insert into public.app_storage (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em)
    values (v_org, v_user, p_chave, null, v_nova, p_dispositivo, now(), now())
    on conflict (org_id, chave) do update
      set valor = null, versao = excluded.versao, dispositivo = excluded.dispositivo,
          deletado_em = now(), atualizado_em = now();

    -- A prova da exclusao nasce AGORA, nao na coleta.
    insert into public.app_storage_excluidos (org_id, chave, versao_final)
    values (v_org, p_chave, v_nova)
    on conflict (org_id, chave) do update
      set versao_final = greatest(public.app_storage_excluidos.versao_final, excluded.versao_final),
          excluido_em = now();
  end if;

  v_res := jsonb_build_object('status','aplicado','versao', v_nova);
  insert into public.app_storage_mutacoes(org_id, mutation_id, resultado)
    values (v_org, p_mutation_id, v_res);
  return v_res;
end $$;

revoke all on function public.aplicar_mutacao_storage(text,uuid,text,text,integer,text,timestamptz) from public;
grant execute on function public.aplicar_mutacao_storage(text,uuid,text,text,integer,text,timestamptz) to authenticated;

-- ── 6. Coleta: por org e SO para service_role ──────────────────────────────
create or replace function public.coletar_tombstones(p_org uuid, p_dias integer default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'coletar_tombstones exige service_role';
  end if;

  delete from public.app_storage
   where org_id = p_org and deletado_em is not null
     and deletado_em < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;

  insert into public.org_sync (org_id, sync_corte)
  values (p_org, now() - make_interval(days => p_dias))
  on conflict (org_id) do update set sync_corte = excluded.sync_corte;

  -- Mutacoes velhas ja nao podem ser reenviadas (o corte barra antes).
  delete from public.app_storage_mutacoes
   where org_id = p_org and aplicado_em < now() - make_interval(days => p_dias);
  return n;
end $$;

revoke all on function public.coletar_tombstones(uuid, integer) from public, authenticated;

-- ── 7. Bucket de fotos (usado na Fase 2) ───────────────────────────────────
insert into storage.buckets (id, name, public) values ('inspecao','inspecao',false)
on conflict (id) do nothing;

drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (bucket_id = 'inspecao' and (storage.foldername(name))[1] = public.org_atual()::text);

drop policy if exists inspecao_escrita on storage.objects;
create policy inspecao_escrita on storage.objects for insert
  with check (bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente() and public.assinatura_permite_escrita());

drop policy if exists inspecao_remocao on storage.objects;
create policy inspecao_remocao on storage.objects for delete
  using (bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente() and public.assinatura_permite_escrita());
```

- [ ] **Step 2: Escrever o teste do contrato (falha primeiro)**

```ts
// src/services/contratoRpc.test.ts
import { describe, it, expect } from 'vitest';
import { interpretarResposta } from './contratoRpc';

describe('interpretarResposta — contrato com aplicar_mutacao_storage', () => {
  it('aplicado devolve a versão nova', () => {
    expect(interpretarResposta({ status: 'aplicado', versao: 5 }))
      .toEqual({ status: 'aplicado', versao: 5 });
  });

  it('repetido é sucesso: a mutação já tinha sido aplicada antes', () => {
    expect(interpretarResposta({ status: 'repetido', versao: 5 }))
      .toEqual({ status: 'repetido', versao: 5 });
  });

  it('conflito carrega a linha vigente do servidor para preservar as duas versões', () => {
    const r = interpretarResposta({
      status: 'conflito', versao: 7, valor: '{"origem":"escritorio"}',
      atualizado_em: '2026-08-04T12:00:00.000Z', dispositivo: 'desktop-1',
    });
    expect(r).toEqual({
      status: 'conflito', versao: 7, valor: '{"origem":"escritorio"}',
      atualizadoEm: '2026-08-04T12:00:00.000Z', dispositivo: 'desktop-1',
    });
  });

  it('recusado carrega o motivo', () => {
    expect(interpretarResposta({ status: 'recusado', motivo: 'versao_obsoleta', versao: 9 }))
      .toEqual({ status: 'recusado', motivo: 'versao_obsoleta', versao: 9 });
  });

  it('os quatro motivos de recusa do SQL são reconhecidos', () => {
    for (const motivo of ['versao_obsoleta', 'anterior_ao_corte', 'tombstone_mais_novo', 'sem_permissao']) {
      expect(interpretarResposta({ status: 'recusado', motivo }).status).toBe('recusado');
    }
  });

  it('resposta desconhecida vira recusa, nunca sucesso silencioso', () => {
    expect(interpretarResposta({ status: 'coisa_nova' }))
      .toEqual({ status: 'recusado', motivo: 'sem_permissao', versao: 0 });
    expect(interpretarResposta(null))
      .toEqual({ status: 'recusado', motivo: 'sem_permissao', versao: 0 });
  });
});
```

- [ ] **Step 3: Rodar e verificar que falha** — `npx vitest run src/services/contratoRpc.test.ts` → FAIL.

- [ ] **Step 4: Implementar**

```ts
// src/services/contratoRpc.ts
/**
 * Contrato com a RPC `aplicar_mutacao_storage`. Existe separado porque o
 * cliente NUNCA deve inferir sucesso: qualquer resposta que não seja
 * explicitamente 'aplicado'/'repetido' é tratada como recusa.
 */
export type StatusMutacao = 'aplicado' | 'repetido' | 'conflito' | 'recusado';
export type MotivoRecusa =
  | 'versao_obsoleta' | 'anterior_ao_corte' | 'tombstone_mais_novo' | 'sem_permissao';

export type RespostaMutacao =
  | { status: 'aplicado' | 'repetido'; versao: number }
  | { status: 'conflito'; versao: number; valor: string | null; atualizadoEm: string; dispositivo: string | null }
  | { status: 'recusado'; motivo: MotivoRecusa; versao: number };

const MOTIVOS: MotivoRecusa[] = ['versao_obsoleta', 'anterior_ao_corte', 'tombstone_mais_novo', 'sem_permissao'];

export function interpretarResposta(bruto: unknown): RespostaMutacao {
  const r = (bruto ?? {}) as Record<string, unknown>;
  const versao = Number(r.versao ?? 0);
  switch (r.status) {
    case 'aplicado':
    case 'repetido':
      return { status: r.status, versao };
    case 'conflito':
      return {
        status: 'conflito',
        versao,
        valor: r.valor == null ? null : String(r.valor),
        atualizadoEm: String(r.atualizado_em ?? ''),
        dispositivo: r.dispositivo == null ? null : String(r.dispositivo),
      };
    case 'recusado': {
      const motivo = MOTIVOS.includes(r.motivo as MotivoRecusa) ? (r.motivo as MotivoRecusa) : 'sem_permissao';
      return { status: 'recusado', motivo, versao };
    }
    default:
      // Servidor mais novo que o cliente, ou resposta corrompida: recusar é a
      // única postura segura — assumir sucesso apagaria a pendência.
      return { status: 'recusado', motivo: 'sem_permissao', versao: 0 };
  }
}
```

- [ ] **Step 5: Rodar e verificar que passa** — PASS, 6 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/armazenamento_v2.sql src/services/contratoRpc.ts src/services/contratoRpc.test.ts
git commit -m "feat(armazenamento): RPC transacional com conflito, idempotencia e corte por org"
```

---

## Task 3 (REVISADA): `db.ts` — transações confirmadas e multi-store

**Files:** Create `src/services/db.ts`; Test `src/services/db.test.ts`

**Interfaces:**
- Produces: `abrirDb`, `transacao(orgId, stores, modo, fn): Promise<void>` (resolve em `tx.oncomplete`), `obter<T>`, `listarTudo<T>` (cursor, uma transação), `fecharDb`, `apagarDb`, `type NomeStore`, `type Operacao = { store: NomeStore; acao: 'put'|'delete'; chave: string; valor?: unknown }`, `aplicarAtomico(orgId, ops): Promise<void>`.

**O que mudou e por quê:** (#2) a versão anterior resolvia a Promise no `IDBRequest.onsuccess`, que dispara **antes** da transação ser confirmada — dado "salvo" podia sumir se o navegador fechasse em seguida. Agora resolve em `tx.oncomplete` e trata `onerror`/`onabort`. `listarTudo` usava **duas transações** (`getAllKeys` + `getAll`) e podia desalinhar chave e valor sob escrita concorrente; passa a usar cursor numa transação só.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// src/services/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { aplicarAtomico, obter, listarTudo, fecharDb, apagarDb } from './db';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

beforeEach(async () => {
  fecharDb();
  await apagarDb(ORG_A);
  await apagarDb(ORG_B);
});

describe('db — durabilidade e atomicidade', () => {
  it('aplicarAtomico só resolve DEPOIS do commit: leitura imediata já enxerga', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    // Sem sleep nenhum: se resolvesse no onsuccess do request, isto seria instável.
    expect(await obter(ORG_A, 'dados', 'k')).toEqual({ v: 1 });
  });

  it('escreve dados + fila na MESMA transação', async () => {
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'put', chave: 'nr13_info_A', valor: { valor: '{}' } },
      { store: 'fila', acao: 'put', chave: 'm1', valor: { mutationId: 'm1' } },
    ]);
    expect(await obter(ORG_A, 'dados', 'nr13_info_A')).not.toBeNull();
    expect(await obter(ORG_A, 'fila', 'm1')).not.toBeNull();
  });

  it('ABORTO: se uma operação falha, NENHUMA das outras persiste', async () => {
    await expect(
      aplicarAtomico(ORG_A, [
        { store: 'dados', acao: 'put', chave: 'k1', valor: { v: 1 } },
        // Valor não-clonável (função) faz o IndexedDB abortar a transação inteira.
        { store: 'fila', acao: 'put', chave: 'm1', valor: { fn: () => 1 } },
      ]),
    ).rejects.toBeTruthy();
    expect(await obter(ORG_A, 'dados', 'k1')).toBeNull(); // rollback do IndexedDB
  });

  it('listarTudo devolve chave e valor alinhados (cursor, uma transação)', async () => {
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'put', chave: 'k1', valor: { v: 1 } },
      { store: 'dados', acao: 'put', chave: 'k2', valor: { v: 2 } },
    ]);
    const linhas = await listarTudo<{ v: number }>(ORG_A, 'dados');
    expect(linhas.sort((a, b) => a.chave.localeCompare(b.chave)))
      .toEqual([{ chave: 'k1', valor: { v: 1 } }, { chave: 'k2', valor: { v: 2 } }]);
  });

  it('ISOLAMENTO: dado da org A não aparece na org B', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    expect(await obter(ORG_B, 'dados', 'k')).toBeNull();
  });

  it('delete atômico junto de put', async () => {
    await aplicarAtomico(ORG_A, [{ store: 'dados', acao: 'put', chave: 'k', valor: { v: 1 } }]);
    await aplicarAtomico(ORG_A, [
      { store: 'dados', acao: 'delete', chave: 'k' },
      { store: 'tombstones', acao: 'put', chave: 'k', valor: { chave: 'k' } },
    ]);
    expect(await obter(ORG_A, 'dados', 'k')).toBeNull();
    expect(await obter(ORG_A, 'tombstones', 'k')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha** — FAIL, módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/services/db.ts
/**
 * IndexedDB cru, um banco POR ORGANIZAÇÃO (`nr13_dados_<org_id>`).
 *
 * DURABILIDADE: toda escrita resolve em `tx.oncomplete`, não em
 * `request.onsuccess`. O `onsuccess` do request dispara ANTES do commit — quem
 * resolvesse ali diria "salvo" para um dado que some se o navegador fechar no
 * instante seguinte. É a diferença entre a fila ser confiável e não ser.
 */
export type NomeStore = 'dados' | 'fila' | 'tombstones' | 'meta';
const STORES: NomeStore[] = ['dados', 'fila', 'tombstones', 'meta'];
const VERSAO_SCHEMA = 1;

export interface Operacao {
  store: NomeStore;
  acao: 'put' | 'delete';
  chave: string;
  valor?: unknown;
}

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
  fecharDb();
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(nomeDb(orgId), VERSAO_SCHEMA);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
  conexao = { orgId, db };
  db.catch(() => { if (conexao?.db === db) conexao = null; });
  return db;
}

/** Aplica todas as operações numa ÚNICA transação. Resolve só no commit. */
export async function aplicarAtomico(orgId: string, ops: Operacao[]): Promise<void> {
  if (ops.length === 0) return;
  const db = await abrirDb(orgId);
  const stores = [...new Set(ops.map((o) => o.store))];
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();                                   // <- durabilidade confirmada
    tx.onerror = () => reject(tx.error ?? new Error('transação falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('transação abortada'));
    try {
      for (const op of ops) {
        const s = tx.objectStore(op.store);
        if (op.acao === 'put') s.put(op.valor, op.chave);
        else s.delete(op.chave);
      }
    } catch (erro) {
      try { tx.abort(); } catch { /* já abortada pelo próprio erro */ }
      reject(erro);
    }
  });
}

export async function obter<T>(orgId: string, store: NomeStore, chave: string): Promise<T | null> {
  const db = await abrirDb(orgId);
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(chave);
    tx.oncomplete = () => resolve((req.result as T) ?? null);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Cursor numa transação só: getAllKeys + getAll separados podiam desalinhar. */
export async function listarTudo<T>(orgId: string, store: NomeStore): Promise<Array<{ chave: string; valor: T }>> {
  const db = await abrirDb(orgId);
  return new Promise((resolve, reject) => {
    const linhas: Array<{ chave: string; valor: T }> = [];
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        linhas.push({ chave: String(cursor.key), valor: cursor.value as T });
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(linhas);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function apagarDb(orgId: string): Promise<void> {
  fecharDb();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(nomeDb(orgId));
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
```

- [ ] **Step 4: Rodar e verificar que passa** — PASS, 6 testes.
- [ ] **Step 5: Commit** — `feat(armazenamento): db.ts com transacao confirmada no commit`

---

## Task 4 (REVISADA): famílias de chave + `cacheLocal` atômico e multi-aba

**Files:** Create `src/services/familiasChave.ts`, `src/services/cacheLocal.ts`; Test `src/services/familiasChave.test.ts`, `src/services/cacheLocal.test.ts`

**Interfaces:**
- Produces (`familiasChave.ts`): `type Escopo = 'tag' | 'global' | 'id'`, `escopoDaChave(chave): Escopo`, `tagDaChave(chave): string | null`.
- Produces (`cacheLocal.ts`): `Registro`, `definirOrg`, `obterRegistro` (síncrono), `gravarAtomico(ops): Promise<void>`, `chavesComPrefixo`, `chavesDaTag`, `hidratarDoDisco`, `zerarMemoria`, `snapshot(): Record<string,string>`, `aplicarRemoto(chave, reg)`, `aguardarHidratacao(): Promise<void>`, `hidratado(): boolean`.

**O que mudou e por quê:**

| Ponto | Correção |
|---|---|
| #11 | A regex genérica extraía TAG errada em chaves reais: `nr13_med_esp_ACA 2040` virava TAG `esp_ACA 2040`, `nr13_minha_empresa` virava TAG `empresa`, `nr13_lista_phs` virava `phs`. Substituída por **tabela explícita** com as 34 famílias por TAG, 3 por id e 11 globais que existem no projeto, casadas por **prefixo mais longo primeiro** (`nr13_livro_config_` antes de `nr13_livro_`). |
| #1 | `gravarRegistro` escrevia no `Map` e disparava gravação assíncrona solta, com erro engolido. Substituída por `gravarAtomico`, que recebe as operações de **todas as stores** e só confirma o `Map` depois do commit — revertendo em caso de falha. |
| #7 | O `Map` de uma aba não via as alterações da outra. `BroadcastChannel` por org propaga cada commit. |
| #12 | `snapshot()` e a **barreira de inicialização** (`aguardarHidratacao`), para nenhuma tela chamar `ler()` antes da hidratação terminar. |

- [ ] **Step 1: Teste das famílias (falha primeiro)**

```ts
// src/services/familiasChave.test.ts
import { describe, it, expect } from 'vitest';
import { tagDaChave, escopoDaChave } from './familiasChave';

describe('tagDaChave — todas as famílias reais do projeto', () => {
  const casos: Array<[string, string | null]> = [
    ['nr13_info_ACA 2040', 'ACA 2040'],
    ['nr13_calc_ACA 2040', 'ACA 2040'],
    ['nr13_calc_gv_ACA 2040', 'ACA 2040'],          // prefixo mais longo vence
    ['nr13_med_esp_ACA 2040', 'ACA 2040'],          // quebrava na regex antiga
    ['nr13_med_grid_ACA 2040', 'ACA 2040'],
    ['nr13_livro_ACA 2040', 'ACA 2040'],
    ['nr13_livro_config_ACA 2040', 'ACA 2040'],     // prefixo mais longo vence
    ['nr13_vaso_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_ac_corpo_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_cald_ACA 2040', 'ACA 2040'],
    ['nr13_vaso_gv_ACA 2040', 'ACA 2040'],
    ['nr13_assinantes_pront_ACA 2040', 'ACA 2040'],
    ['nr13_assinantes_rel_ACA 2040', 'ACA 2040'],
    ['nr13_pref_unidade_ACA 2040', 'ACA 2040'],
    ['nr13_prontuario_meta_ACA 2040', 'ACA 2040'],
    ['nr13_folha_dados_ACA 2040', 'ACA 2040'],
    ['nr13_componentes_cal_ACA 2040', 'ACA 2040'],
    ['nr13_lotes_cal_ACA 2040', 'ACA 2040'],
    ['nr13_caldeira_dados_costado_ACA 2040', 'ACA 2040'],
    ['nr13_termo_livro_ACA 2040', 'ACA 2040'],
    ['nr13_pront_fab_ACA 2040', 'ACA 2040'],
    ['nr13_docs_ACA 2040', 'ACA 2040'],
    ['nr13_fotos_ACA 2040', 'ACA 2040'],
    // Globais: NÃO têm TAG (a regex antiga inventava uma)
    ['nr13_minha_empresa', null],
    ['nr13_lista_phs', null],
    ['nr13_clientes', null],
    ['nr13_demo_seed', null],
    ['nr13_inspecao_atual', null],
    ['nr13_injecao_atual', null],
    ['nr13_relatorio_meta_atual', null],
    ['nr13_historico_relatorios', null],
    ['nr13_uso_contadores', null],
    // Por id: também não são TAG de equipamento
    ['nr13_rastreab_abc-123', null],
    ['nr13_calibracao_item_99', null],
    ['nr13_permissoes_uuid-do-usuario', null],
  ];

  for (const [chave, esperado] of casos) {
    it(`${chave} -> ${esperado ?? 'null'}`, () => expect(tagDaChave(chave)).toBe(esperado));
  }

  it('TAG que é sufixo de outra não se confunde', () => {
    expect(tagDaChave('nr13_info_B')).toBe('B');
    expect(tagDaChave('nr13_info_A_B')).toBe('A_B');
  });

  it('chave desconhecida é tratada como global, nunca como TAG inventada', () => {
    expect(escopoDaChave('nr13_coisa_nova')).toBe('global');
    expect(tagDaChave('nr13_coisa_nova')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha** — FAIL.

- [ ] **Step 3: Implementar as famílias**

```ts
// src/services/familiasChave.ts
/**
 * Tabela EXPLÍCITA de famílias de chave. Levantada por varredura de src/ e
 * public/ em 04/08/2026.
 *
 * POR QUE NÃO É REGEX: a dedução genérica errava em chaves reais —
 * `nr13_med_esp_ACA 2040` produzia a TAG "esp_ACA 2040", e `nr13_minha_empresa`
 * produzia a TAG "empresa". Índice errado = `excluirVaso` apagando o
 * equipamento errado e palco montando o documento errado.
 *
 * REGRA AO ACRESCENTAR CHAVE NOVA: entre aqui. Chave desconhecida cai em
 * 'global' — nunca vira TAG inventada.
 */
export type Escopo = 'tag' | 'global' | 'id';

// Prefixos por TAG. A ORDEM NÃO IMPORTA: o casamento é sempre pelo mais longo.
const POR_TAG = [
  'nr13_assinantes_pront_', 'nr13_assinantes_rel_', 'nr13_autoclave_dados_',
  'nr13_calc_gv_', 'nr13_calc_', 'nr13_caldeira_dados_costado_',
  'nr13_caldeira_dados_espelho_', 'nr13_caldeira_dados_tampo_', 'nr13_calibracoes_',
  'nr13_cat_', 'nr13_componentes_cal_', 'nr13_croqui2d_', 'nr13_croqui3d_',
  'nr13_docs_', 'nr13_emp_', 'nr13_folha_dados_', 'nr13_fotos_', 'nr13_info_',
  'nr13_laudo_', 'nr13_livro_config_', 'nr13_livro_', 'nr13_lotes_cal_',
  'nr13_med_esp_', 'nr13_med_grid_', 'nr13_modelo3d_', 'nr13_pref_unidade_',
  'nr13_pront_fab_', 'nr13_prontuario_meta_', 'nr13_termo_livro_',
  'nr13_vaso_ac_corpo_', 'nr13_vaso_cald_', 'nr13_vaso_gv_', 'nr13_vaso_',
  'nr13_vida_',
];

// Registros identificados por id próprio, não por TAG de equipamento.
const POR_ID = ['nr13_rastreab_', 'nr13_calibracao_item_', 'nr13_permissoes_'];

// Chaves inteiras (sem sufixo) — comparação exata, não por prefixo.
const GLOBAIS = new Set([
  'nr13_minha_empresa', 'nr13_lista_phs', 'nr13_clientes', 'nr13_demo_seed',
  'nr13_historico_relatorios', 'nr13_uso_contadores', 'nr13_termos_aceite',
  'nr13_relatorio_meta_atual', 'nr13_inspecao_atual', 'nr13_injecao_atual',
  'nr13_prontuario_atual', 'nr13_rastreabilidade',
]);

function prefixoMaisLongo(chave: string, lista: string[]): string | null {
  let achado: string | null = null;
  for (const p of lista) {
    if (chave.startsWith(p) && chave.length > p.length && (!achado || p.length > achado.length)) achado = p;
  }
  return achado;
}

export function escopoDaChave(chave: string): Escopo {
  if (GLOBAIS.has(chave)) return 'global';
  if (prefixoMaisLongo(chave, POR_ID)) return 'id';
  if (prefixoMaisLongo(chave, POR_TAG)) return 'tag';
  return 'global'; // desconhecida: nunca inventar TAG
}

export function tagDaChave(chave: string): string | null {
  if (GLOBAIS.has(chave)) return null;
  if (prefixoMaisLongo(chave, POR_ID)) return null;
  const p = prefixoMaisLongo(chave, POR_TAG);
  return p ? chave.slice(p.length) : null;
}
```

- [ ] **Step 4: Rodar as famílias** — PASS, 37 testes.

- [ ] **Step 5: Teste do cacheLocal (falha primeiro)**

```ts
// src/services/cacheLocal.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fecharDb, apagarDb, obter } from './db';
import {
  definirOrg, obterRegistro, gravarAtomico, chavesComPrefixo, chavesDaTag,
  hidratarDoDisco, zerarMemoria, snapshot, aplicarRemoto, hidratado, aguardarHidratacao,
} from './cacheLocal';

const ORG = '11111111-1111-1111-1111-111111111111';
const reg = (valor: string, versao = 1) =>
  ({ valor, versao, atualizadoEm: '2026-08-04T12:00:00.000Z', dispositivo: 'd1' });

beforeEach(async () => {
  zerarMemoria(); fecharDb(); await apagarDb(ORG); localStorage.clear();
  definirOrg(ORG);
});

describe('cacheLocal — atomicidade', () => {
  it('gravarAtomico só confirma o Map depois do commit (sem sleep nenhum)', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
    expect(await obter(ORG, 'dados', 'nr13_info_A')).not.toBeNull();
  });

  it('grava dado e item de fila na MESMA transação', async () => {
    await gravarAtomico(
      [{ chave: 'nr13_info_A', registro: reg('{}') }],
      [{ mutationId: 'm1', chave: 'nr13_info_A' } as never],
    );
    expect(await obter(ORG, 'fila', 'm1')).not.toBeNull();
  });

  it('REVERTE o Map quando a transação falha', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"v":1}') }]);
    await expect(
      gravarAtomico(
        [{ chave: 'nr13_info_A', registro: reg('{"v":2}') }],
        [{ mutationId: 'm1', fn: () => 1 } as never], // não-clonável: aborta a tx
      ),
    ).rejects.toBeTruthy();
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"v":1}'); // valor anterior restaurado
  });

  it('não tem teto de 5 MB: 38 fichas + 40 fotos de 200 KB cabem', async () => {
    const gordo = 'x'.repeat(200 * 1024);
    for (let i = 0; i < 40; i++) await gravarAtomico([{ chave: `nr13_fotos_T${i}`, registro: reg(gordo) }]);
    for (let i = 0; i < 38; i++) await gravarAtomico([{ chave: `nr13_info_T${i}`, registro: reg('{}') }]);
    expect(chavesComPrefixo('nr13_info_')).toHaveLength(38);
  });

  it('chavesDaTag usa a tabela de famílias, não sufixo', async () => {
    await gravarAtomico([
      { chave: 'nr13_info_B', registro: reg('{}') },
      { chave: 'nr13_info_A_B', registro: reg('{}') },
      { chave: 'nr13_med_esp_B', registro: reg('{}') },
      { chave: 'nr13_minha_empresa', registro: reg('{}') },
    ]);
    expect(chavesDaTag('B').sort()).toEqual(['nr13_info_B', 'nr13_med_esp_B']);
    expect(chavesDaTag('A_B')).toEqual(['nr13_info_A_B']);
  });

  it('hidratarDoDisco repovoa a memória (reabrir 100% offline)', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    zerarMemoria();
    expect(obterRegistro('nr13_info_A')).toBeNull();
    expect(await hidratarDoDisco()).toBe(1);
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"tag":"A"}');
  });

  it('snapshot devolve o conteúdo inteiro do Map', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"tag":"A"}') }]);
    expect(snapshot()).toEqual({ 'nr13_info_A': '{"tag":"A"}' });
  });
});

describe('cacheLocal — versão vence na hidratação (#12)', () => {
  it('linha ANTIGA do servidor NÃO sobrescreve versão local mais nova', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"local":true}', 9) }]);
    await aplicarRemoto('nr13_info_A', reg('{"servidor":true}', 4));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"local":true}');
  });

  it('linha MAIS NOVA do servidor sobrescreve', async () => {
    await gravarAtomico([{ chave: 'nr13_info_A', registro: reg('{"local":true}', 4) }]);
    await aplicarRemoto('nr13_info_A', reg('{"servidor":true}', 9));
    expect(obterRegistro('nr13_info_A')?.valor).toBe('{"servidor":true}');
  });
});

describe('cacheLocal — barreira de inicialização (#12)', () => {
  it('hidratado() é falso antes da hidratação e verdadeiro depois', async () => {
    zerarMemoria();
    expect(hidratado()).toBe(false);
    await hidratarDoDisco();
    expect(hidratado()).toBe(true);
  });

  it('aguardarHidratacao só resolve depois da hidratação', async () => {
    zerarMemoria();
    let resolvida = false;
    void aguardarHidratacao().then(() => { resolvida = true; });
    expect(resolvida).toBe(false);
    await hidratarDoDisco();
    await aguardarHidratacao();
    expect(resolvida).toBe(true);
  });
});

describe('cacheLocal — duas abas (#7)', () => {
  it('gravação de uma aba chega no Map da outra pelo BroadcastChannel', async () => {
    const canal = new BroadcastChannel(`nr13_cache_${ORG}`);
    canal.postMessage({
      tipo: 'gravado',
      chave: 'nr13_info_OUTRA_ABA',
      registro: reg('{"origem":"aba2"}'),
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(obterRegistro('nr13_info_OUTRA_ABA')?.valor).toBe('{"origem":"aba2"}');
    canal.close();
  });
});
```

- [ ] **Step 6: Rodar e verificar que falha** — FAIL.

- [ ] **Step 7: Implementar o `cacheLocal`**

```ts
// src/services/cacheLocal.ts
/**
 * Cache de leitura do app: Map em memória, espelhado no IndexedDB.
 *
 * POR QUE EXISTE: até 04/08/2026 o cache era o localStorage, com 5 MB para a
 * origem inteira. Medido em produção, a conta cmam.caldeiras precisava de
 * 5.692 KB e NENHUM dos seus 38 equipamentos entrava no cache.
 *
 * ATOMICIDADE: `gravarAtomico` grava dado, item de fila e tombstone na MESMA
 * transação e só confirma o Map no commit. Em caso de falha o Map volta ao
 * estado anterior — sem isso, fechar o navegador entre as duas escritas
 * deixava dado sem fila (nunca sobe) ou fila sem dado (sobe lixo).
 */
import { aplicarAtomico, listarTudo, type Operacao } from './db';
import { tagDaChave } from './familiasChave';
import type { ItemFila } from './sync';

export interface Registro {
  valor: string;
  versao: number;
  atualizadoEm: string;
  dispositivo: string | null;
}

export interface GravacaoDado { chave: string; registro: Registro }
export interface RemocaoDado { chave: string; remover: true }

const memoria = new Map<string, Registro>();
const porTag = new Map<string, Set<string>>();
let orgId: string | null = null;
let canal: BroadcastChannel | null = null;
let pronto = false;
let resolverPronto: (() => void) | null = null;
const promessaPronto = new Promise<void>((r) => { resolverPronto = r; });

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

export function definirOrg(id: string | null): void {
  orgId = id;
  canal?.close();
  canal = null;
  if (!id || typeof BroadcastChannel === 'undefined') return;
  // Propagação entre abas: sem isto, a aba B seguiria mostrando dado velho
  // depois de a aba A gravar, e poderia sobrescrever com versão desatualizada.
  canal = new BroadcastChannel(`nr13_cache_${id}`);
  canal.onmessage = (e) => {
    const m = e.data as { tipo: string; chave: string; registro?: Registro };
    if (m?.tipo === 'gravado' && m.registro) { memoria.set(m.chave, m.registro); indexar(m.chave); }
    else if (m?.tipo === 'removido') { memoria.delete(m.chave); desindexar(m.chave); }
  };
}

export function obterRegistro(chave: string): Registro | null { return memoria.get(chave) ?? null; }
export function chavesComPrefixo(p: string): string[] { return [...memoria.keys()].filter((c) => c.startsWith(p)); }
export function chavesDaTag(tag: string): string[] { return [...(porTag.get(tag) ?? [])]; }
export function hidratado(): boolean { return pronto; }
export function aguardarHidratacao(): Promise<void> { return promessaPronto; }

export function snapshot(): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, reg] of memoria) saida[chave] = reg.valor;
  return saida;
}

export function zerarMemoria(): void {
  memoria.clear();
  porTag.clear();
  pronto = false;
}

/**
 * Grava dados (e opcionalmente itens de fila e tombstones) numa transação só.
 * O Map é atualizado ANTES para as leituras síncronas verem, e REVERTIDO se o
 * commit falhar — a UI só pode dizer "salvo" depois que esta Promise resolve.
 */
export async function gravarAtomico(
  dados: Array<GravacaoDado | RemocaoDado>,
  fila: ItemFila[] = [],
  tombstones: Array<{ chave: string; valor: unknown }> = [],
): Promise<void> {
  if (!orgId) throw new Error('cacheLocal sem organização definida');

  const anterior = new Map<string, Registro | null>();
  for (const d of dados) anterior.set(d.chave, memoria.get(d.chave) ?? null);

  for (const d of dados) {
    if ('remover' in d) { memoria.delete(d.chave); desindexar(d.chave); }
    else { memoria.set(d.chave, d.registro); indexar(d.chave); }
  }

  const ops: Operacao[] = [
    ...dados.map((d): Operacao =>
      'remover' in d
        ? { store: 'dados', acao: 'delete', chave: d.chave }
        : { store: 'dados', acao: 'put', chave: d.chave, valor: d.registro }),
    ...fila.map((i): Operacao => ({ store: 'fila', acao: 'put', chave: i.mutationId, valor: i })),
    ...tombstones.map((t): Operacao => ({ store: 'tombstones', acao: 'put', chave: t.chave, valor: t.valor })),
  ];

  try {
    await aplicarAtomico(orgId, ops);
  } catch (erro) {
    for (const [chave, reg] of anterior) {
      if (reg) { memoria.set(chave, reg); indexar(chave); }
      else { memoria.delete(chave); desindexar(chave); }
    }
    throw erro;
  }

  for (const d of dados) {
    canal?.postMessage(
      'remover' in d
        ? { tipo: 'removido', chave: d.chave }
        : { tipo: 'gravado', chave: d.chave, registro: d.registro },
    );
  }
}

/** Aplica registro vindo do servidor SÓ se for mais novo que o local (#12). */
export async function aplicarRemoto(chave: string, remoto: Registro): Promise<void> {
  const local = memoria.get(chave);
  if (local && local.versao >= remoto.versao) return;
  await gravarAtomico([{ chave, registro: remoto }]);
}

export async function hidratarDoDisco(): Promise<number> {
  if (!orgId) return 0;
  const linhas = await listarTudo<Registro>(orgId, 'dados');
  for (const { chave, valor } of linhas) { memoria.set(chave, valor); indexar(chave); }
  pronto = true;
  resolverPronto?.();
  return linhas.length;
}
```

- [ ] **Step 8: Rodar e verificar que passa** — PASS.
- [ ] **Step 9: Commit** — `feat(armazenamento): familias de chave explicitas e cacheLocal atomico multi-aba`

---

## Task 6 (REVISADA): fila com versão-base preservada

**Files:** Modify `src/services/sync.ts`; Test `src/services/sync.fila.test.ts`

**O que mudou e por quê:** (#4) ao condensar autosaves da mesma chave, a versão anterior **substituía `versaoBase` pela versão local mais recente**. O servidor continuava na versão antiga, então a mutação condensada chegava com uma expectativa que nunca casaria — conflito eterno. Agora a `versaoBase` **original** é preservada. (#1) `enfileirar` deixa de gravar sozinha: devolve o item e quem persiste é `gravarAtomico`.

- [ ] **Step 1: Teste (falha primeiro)**

```ts
// src/services/sync.fila.test.ts — trechos novos
describe('fila — versão-base preservada na condensação (#4)', () => {
  it('condensar autosaves NÃO avança a versaoBase: o servidor ainda está na antiga', async () => {
    await enfileirarEGravar('set', 'nr13_form_A', '{"v":1}', 4);   // servidor está na 4
    await enfileirarEGravar('set', 'nr13_form_A', '{"v":2}', 5);   // local já avançou
    await enfileirarEGravar('set', 'nr13_form_A', '{"v":3}', 6);
    const item = itemDaChave('nr13_form_A')!;
    expect(listarFila()).toHaveLength(1);
    expect(item.versaoBase).toBe(4);          // <- a original, não a 6
    expect(item.valor).toBe('{"v":3}');       // <- o conteúdo mais recente
  });

  it('mutationId é preservado quando op e valor são idênticos', async () => {
    const a = await enfileirarEGravar('set', 'nr13_form_A', '{"v":1}', 4);
    const b = await enfileirarEGravar('set', 'nr13_form_A', '{"v":1}', 4);
    expect(b).toBe(a);
  });

  it('a fila sobrevive a fechar o navegador SEM sleep (transação confirmada)', async () => {
    await enfileirarEGravar('set', 'nr13_info_A', '{"tag":"A"}', 1);
    zerarFilaMemoria();
    await carregarFilaDoDisco();
    expect(listarFila()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha** — FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/services/sync.ts — construção do item
export function montarItem(
  op: 'set' | 'del', chave: string, valor: string | undefined, versaoServidor: number,
): ItemFila {
  const anterior = itemDaChave(chave);
  const igual = anterior && anterior.op === op && anterior.valor === valor;
  return {
    mutationId: igual ? anterior!.mutationId : crypto.randomUUID(),
    op, chave, valor,
    // A versão-base é a que o SERVIDOR tinha quando a primeira edição saiu.
    // Substituí-la pela versão local faria a RPC recusar para sempre: o
    // servidor segue na versão antiga até esta mutação chegar.
    versaoBase: anterior ? anterior.versaoBase : versaoServidor,
    dispositivo: idDispositivo(),
    criadoEm: anterior ? anterior.criadoEm : new Date().toISOString(),
    tentativas: igual ? anterior!.tentativas : 0,
    estado: 'aguardando',
  };
}
```

`enfileirar` some; quem chama monta o item e passa para `gravarAtomico` junto do dado, removendo o item anterior da mesma chave na mesma transação.

- [ ] **Step 4: Rodar** — PASS. **Step 5: Commit** — `fix(sync): preserva versao-base original ao condensar autosaves`

---

## Task 7 (REVISADA): drenagem pela RPC, conflito real

**Files:** Modify `src/services/sync.ts`; Test `src/services/sync.drenagem.test.ts`

**O que mudou e por quê:** (#3) `upsert` trocado pela RPC. `guardarConflito` agora é chamado **pelo fluxo real**, quando a RPC devolve `status: 'conflito'`. (#4) idempotência: `status: 'repetido'` é sucesso. (#6) `tombstone_mais_novo` e `versao_obsoleta` viram conflito para o usuário decidir.

- [ ] **Step 1: Teste (falha primeiro)**

```ts
// src/services/sync.drenagem.test.ts
const rpc = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { rpc },
  escopoStorageAtual: vi.fn(async () => ({ coluna: 'org_id', id: ORG })),
  idUsuarioAtual: vi.fn(async () => 'user-1'),
  TABELA_STORAGE: 'app_storage',
}));

describe('drenagem pela RPC', () => {
  it('aplicado: sai da fila e o Map recebe a versão do servidor', async () => {
    rpc.mockResolvedValue({ data: { status: 'aplicado', versao: 5 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 4);
    expect((await drenar()).enviados).toBe(1);
    expect(listarFila()).toHaveLength(0);
    expect(obterRegistro('nr13_info_A')?.versao).toBe(5);
  });

  it('repetido é SUCESSO: a resposta anterior se perdeu, o servidor já aplicou (#4)', async () => {
    rpc.mockResolvedValue({ data: { status: 'repetido', versao: 5 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 4);
    expect((await drenar()).enviados).toBe(1);
    expect(listarFila()).toHaveLength(0);
  });

  it('CONFLITO REAL: dois aparelhos na mesma versaoBase — as DUAS versões sobrevivem (#3)', async () => {
    rpc.mockResolvedValue({
      data: {
        status: 'conflito', versao: 5, valor: '{"origem":"escritorio"}',
        atualizado_em: '2026-08-04T13:00:00.000Z', dispositivo: 'desktop-1',
      },
      error: null,
    });
    await enfileirarEGravar('set', 'nr13_form_A', '{"origem":"celular"}', 4);
    await drenar();

    expect(itemDaChave('nr13_form_A')?.estado).toBe('conflito');   // versão local preservada
    const conflitos = (await listarTudo<Registro>(ORG, 'dados'))
      .filter((g) => g.chave.startsWith('nr13_conflito_'));
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].valor.valor).toBe('{"origem":"escritorio"}'); // versão do servidor preservada
  });

  it('tombstone_mais_novo: escrita antiga NÃO reverte exclusão não coletada (#6)', async () => {
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'tombstone_mais_novo', versao: 8 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 3);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('conflito');
  });

  it('anterior_ao_corte: aparelho parado além da coleta não ressuscita nada (#5)', async () => {
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'anterior_ao_corte', versao: 0 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 3);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('conflito');
  });

  it('sem_permissao vira falha_definitiva', async () => {
    rpc.mockResolvedValue({ data: { status: 'recusado', motivo: 'sem_permissao', versao: 0 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 1);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.estado).toBe('falha_definitiva');
  });

  it('offline: item FICA na fila, nada é perdido', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 1);
    await drenar();
    expect(itemDaChave('nr13_info_A')?.erro?.categoria).toBe('offline');
    expect(listarFila()).toHaveLength(1);
  });

  it('uma falha não impede as outras de subirem', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'recusado', motivo: 'sem_permissao' }, error: null })
       .mockResolvedValueOnce({ data: { status: 'aplicado', versao: 2 }, error: null });
    await enfileirarEGravar('set', 'nr13_info_A', '{}', 1);
    await enfileirarEGravar('set', 'nr13_info_B', '{}', 1);
    const r = await drenar();
    expect(r).toEqual({ enviados: 1, falhas: 1 });
  });
});
```

- [ ] **Step 2: Rodar e verificar que falha** — FAIL.
- [ ] **Step 3: Implementar**

```ts
// src/services/sync.ts
import { interpretarResposta } from './contratoRpc';
import { gravarAtomico, obterRegistro, type Registro } from './cacheLocal';

async function enviarItem(item: ItemFila): Promise<void> {
  item.tentativas += 1;
  const { data, error } = await supabase.rpc('aplicar_mutacao_storage', {
    p_chave: item.chave,
    p_mutation_id: item.mutationId,
    p_op: item.op,
    p_valor: item.valor ?? null,
    p_versao_esperada: item.versaoBase,
    p_dispositivo: item.dispositivo,
    p_mutado_em: item.criadoEm,
  });
  if (error) throw error;

  const r = interpretarResposta(data);

  if (r.status === 'aplicado' || r.status === 'repetido') {
    const local = obterRegistro(item.chave);
    if (local) await gravarAtomico([{ chave: item.chave, registro: { ...local, versao: r.versao } }]);
    await removerDaFila(item.mutationId);
    return;
  }

  if (r.status === 'conflito') {
    // As DUAS versões sobrevivem: a do servidor vira nr13_conflito_*, a local
    // segue na fila marcada como conflito, e o usuário escolhe em /pendencias.
    if (r.valor !== null) {
      await guardarConflito(item.chave, {
        valor: r.valor, versao: r.versao,
        atualizadoEm: r.atualizadoEm, dispositivo: r.dispositivo,
      });
    }
    await marcarEstado(item.mutationId, 'conflito', { code: 'nr13_conflito', message: 'versão divergente' });
    return;
  }

  if (r.motivo === 'sem_permissao') {
    await marcarEstado(item.mutationId, 'falha_definitiva', { code: '42501', message: r.motivo });
  } else {
    // versao_obsoleta / anterior_ao_corte / tombstone_mais_novo: exige decisão.
    await marcarEstado(item.mutationId, 'conflito', { code: 'P0001', message: `nr13_versao_obsoleta: ${r.motivo}` });
  }
}
```

- [ ] **Step 4: Rodar** — PASS, 8 testes. **Step 5: Commit** — `feat(sync): drenagem pela RPC com conflito real preservando as duas versoes`

---

## Task 11 (REVISADA): `storage.ts` orquestrador

**O que mudou:** (#1) `salvar`/`excluirChave` montam o item de fila e gravam **tudo numa transação** via `gravarAtomico`, só retornando depois do commit. (#12) `lerTudo` devolve `snapshot()` do Map em qualquer caminho, inclusive offline, e compara versões via `aplicarRemoto`.

```ts
export async function salvar(chave: string, objeto: unknown): Promise<void> {
  if (bloqueadoParaEscrita()) throw new ErroBloqueado();
  const valor = JSON.stringify(objeto);
  const anterior = cache.obterRegistro(chave);
  const registro: cache.Registro = {
    valor,
    versao: (anterior?.versao ?? 0) + 1,
    atualizadoEm: new Date().toISOString(),
    dispositivo: sync.idDispositivo(),
  };
  const item = sync.montarItem('set', chave, valor, anterior?.versao ?? 0);
  const antigo = sync.itemDaChave(chave);
  // Dado + fila na MESMA transação: só depois disto a UI pode dizer "salvo".
  await cache.gravarAtomico([{ chave, registro }], [item]);
  if (antigo && antigo.mutationId !== item.mutationId) await sync.removerDaFila(antigo.mutationId);
  sync.registrarNaMemoria(item);
  atualizarManifesto();
  await sync.drenar();
}

export async function lerTudo(): Promise<Record<string, string>> {
  const escopo = await escopoStorageAtual();
  if (!escopo) return cache.snapshot();
  cache.definirOrg(escopo.id);
  await cache.hidratarDoDisco();
  await sync.carregarFilaDoDisco();
  await sync.carregarTombstonesDoDisco();
  await sync.drenar();

  try {
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase.from(TABELA_STORAGE)
        .select('chave, valor, versao, atualizado_em, dispositivo, deletado_em')
        .eq(escopo.coluna, escopo.id).order('chave', { ascending: true })
        .range(inicio, inicio + 999);
      if (error) return cache.snapshot();      // offline: devolve o que veio do disco
      if (!data || data.length === 0) break;
      for (const row of data as Array<Record<string, unknown>>) {
        const chave = String(row.chave);
        const atualizadoEm = String(row.atualizado_em ?? '');
        if (row.deletado_em) { await cache.gravarAtomico([{ chave, remover: true }]); continue; }
        if (sync.tombstoneMaisNovoQue(chave, atualizadoEm)) continue;
        if (sync.itemDaChave(chave)) continue;   // escrita local pendente vence
        if (row.valor == null) continue;
        await cache.aplicarRemoto(chave, {       // só sobrescreve se for mais novo
          valor: String(row.valor),
          versao: Number(row.versao ?? 1),
          atualizadoEm,
          dispositivo: row.dispositivo ? String(row.dispositivo) : null,
        });
      }
      if (data.length < 1000) break;
    }
  } catch {
    return cache.snapshot();
  }
  return cache.snapshot();
}
```

**Barreira de inicialização (#12):** o `Layout` só renderiza rotas depois de `await aguardarHidratacao()`, exibindo "Carregando seus dados…". Nenhuma tela chama `ler()` antes disso.

Testes: os 3 de regressão (340 chaves / 5,7 MB → 38 equipamentos), mais `lerTudo devolve snapshot offline` e `ler() antes da hidratação é barrado pela tela, não devolve vazio silencioso`.

---

## Task 12 (REVISADA): logout não apaga pendências

**O que mudou:** (#9) `apagarDb` no logout podia **destruir inspeções feitas offline** que ainda não subiram.

```ts
export type ResultadoLogout =
  | { pode: true }
  | { pode: false; pendencias: number; maisAntiga: string };

/** Chamada ANTES do logout. Nunca apagar IndexedDB com pendência dentro. */
export function podeSairSemPerder(): ResultadoLogout {
  const fila = sync.listarFila();
  if (fila.length === 0) return { pode: true };
  const maisAntiga = fila.map((i) => i.criadoEm).sort()[0];
  return { pode: false, pendencias: fila.length, maisAntiga };
}
```

Fluxo: `pode: false` → modal *"Você tem N alterações que ainda não subiram"* com **[Sincronizar agora]**, **[Sair e manter no aparelho]** (mantém o banco) e **[Cancelar]**. `apagarDb` **só** com fila vazia e confirmação explícita. `limparCacheDados()` (troca de aba/conta) nunca apaga o banco — só zera memória, palco e fecha a conexão.

Testes: logout com pendência bloqueia; logout limpo libera; "sair e manter" preserva o banco; troca de conta não apaga banco da anterior.

---

## Task 13 (REVISADA): ponte por `postMessage` com confirmação

**O que mudou (#8):** a ponte por `localStorage` perdia dado — `drenarPonte()` limpava a fila inteira antes de salvar (falha no item 1 já tinha removido os itens 2..n), só drenava ao desmontar a tela, e `sbSalvar` tinha `catch` vazios contra a regra global.

**Fluxo novo:** o template posta e **espera confirmação**; o app grava atomicamente e só então confirma. Fallback em `localStorage` remove **um item por vez**, depois do commit.

```js
// public/sb-storage.js
(function () {
  var PONTE = 'nr13_fila_ponte';
  var pendentes = {};

  function guardarFallback(id, chave, valor) {
    try {
      var fila = JSON.parse(localStorage.getItem(PONTE) || '[]');
      if (!Array.isArray(fila)) fila = [];
      fila = fila.filter(function (o) { return o && o.chave !== chave; });
      fila.push({ id: id, chave: chave, valor: valor });
      localStorage.setItem(PONTE, JSON.stringify(fila));
    } catch (e) {
      // Cota estourada no fallback: avisa o app em vez de engolir (regra global).
      try { window.parent.postMessage({ tipo: 'nr13_erro_ponte', chave: chave, erro: String(e) }, '*'); } catch (e2) {}
    }
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var m = ev.data;
    if (!m || m.tipo !== 'nr13_salvo' || !pendentes[m.id]) return;
    clearTimeout(pendentes[m.id].timer);
    delete pendentes[m.id];
  });

  window.sbSalvar = function (chave, valor) {
    if ((localStorage.getItem('nr13_papel') || '') === 'cliente') return;
    var id = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
    guardarFallback(id, chave, valor);   // fallback ANTES: se o app morrer, o dado existe
    pendentes[id] = {
      timer: setTimeout(function () {
        try { window.parent.postMessage({ tipo: 'nr13_erro_ponte', chave: chave, erro: 'sem confirmacao' }, '*'); } catch (e) {}
      }, 5000),
    };
    try { window.parent.postMessage({ tipo: 'nr13_salvar', id: id, chave: chave, valor: valor }, '*'); }
    catch (e) { /* sem parent: o fallback já cobriu, o app drena no próximo boot */ }
  };
})();
```

```ts
// src/services/ponteTemplates.ts
export function ouvirPonte(salvarChave: (chave: string, valor: string) => Promise<void>): () => void {
  const aoReceber = async (ev: MessageEvent) => {
    const m = ev.data as { tipo?: string; id?: string; chave?: string; valor?: string };
    if (m?.tipo !== 'nr13_salvar' || !m.chave || m.valor === undefined) return;
    await salvarChave(m.chave, m.valor);              // grava dado + fila atomicamente
    removerDaPonte(m.id!);                            // remove UM item, depois do commit
    (ev.source as Window | null)?.postMessage({ tipo: 'nr13_salvo', id: m.id }, '*');
  };
  window.addEventListener('message', (e) => void aoReceber(e));
  return () => window.removeEventListener('message', (e) => void aoReceber(e));
}
```

`drenarPonte()` passa a iterar item a item, removendo cada um **só depois** do `gravarAtomico` correspondente. É chamada no **boot** (não só ao desmontar a tela) e ao desmontar.

Testes: confirmação chega; item removido só após commit; falha no item 1 preserva 2..n; ponte drenada no boot; erro da ponte aparece em `/pendencias`.

---

## Task 15 (REVISADA): palco com dono exclusivo por aba

**O que mudou:** (#7) duas abas compartilham `localStorage` e sobrescreviam o palco uma da outra — relatório da aba B saía com dado da aba A. (#10) o rollback não restaurava valores anteriores; `ORCAMENTO_IMG` era declarado e nunca usado.

```ts
// src/services/palco.ts
const ID_ABA = crypto.randomUUID();
const REGISTRO = 'nr13_palco_chaves';
const DONO = 'nr13_palco_dono';

export type ResultadoPalco =
  | { ok: true }
  | Recusa
  | { ok: false; erro: unknown; chaveQueFalhou: string }
  | { ok: false; ocupado: true; donoAtual: string };

/** Só UMA aba pode montar o palco: os templates leem chaves de nome fixo. */
export async function montarPalcoDaTag(tag: string, recomprimir = recomprimirFotosDoValor): Promise<ResultadoPalco> {
  const dono = localStorage.getItem(DONO);
  if (dono && dono !== ID_ABA) return { ok: false, ocupado: true, donoAtual: dono };

  return navigator.locks.request(`nr13_palco`, { ifAvailable: true }, async (lock) => {
    if (!lock) return { ok: false, ocupado: true, donoAtual: dono ?? 'outra aba' };
    localStorage.setItem(DONO, ID_ABA);
    /* ...orçar, degradar, materializar... */
  }) as Promise<ResultadoPalco>;
}

export function materializar(itens: ItemPalco[]): { ok: true } | { ok: false; erro: unknown; chaveQueFalhou: string } {
  // ROLLBACK REAL: guarda o valor ANTERIOR de cada chave, não só a lista de
  // gravadas. Remover o que foi escrito não restaura o que havia antes.
  const anteriores = new Map<string, string | null>();
  for (const item of itens) {
    try {
      anteriores.set(item.chave, localStorage.getItem(item.chave));
      localStorage.setItem(item.chave, item.valor);
    } catch (erro) {
      for (const [chave, valor] of anteriores) {
        if (valor === null) localStorage.removeItem(chave);
        else localStorage.setItem(chave, valor);
      }
      return { ok: false, erro, chaveQueFalhou: item.chave };
    }
  }
  localStorage.setItem(REGISTRO, JSON.stringify([...anteriores.keys()]));
  return { ok: true };
}

/** Só o dono limpa: uma aba nunca apaga o palco da outra. */
export function limparPalco(): void {
  if (localStorage.getItem(DONO) !== ID_ABA) return;
  /* ...remove as chaves do REGISTRO... */
  localStorage.removeItem(DONO);
}
```

**`ORCAMENTO_IMG` passa a ser aplicado (#10):** dentro de `degradarAteCaber`, qualquer foto individual acima de `ORCAMENTO_IMG` força mais um passo de degradação mesmo que o total já caiba — foto de 900 KB numa folha estoura a renderização do `html2canvas` ainda que o documento inteiro coubesse.

**Tamanho coerente com o armazenamento real (#10):** `tamanho()` passa a contar **UTF-16** (`(chave.length + valor.length) * 2`), que é como o Chrome cobra a cota, e o `ORCAMENTO_DOC` é reexpresso nessa mesma unidade.

Testes: segunda aba recebe `ocupado` e não monta; `limparPalco` de aba não-dona é no-op; rollback restaura o valor anterior; foto acima de `ORCAMENTO_IMG` força degradação; `nr13_docs_` fora do palco.

---

## Task 14 (NOVA POSIÇÃO): implantação controlada e rollback

**Files:** Create `src/services/flag.ts`, `docs/superpowers/plans/implantacao-armazenamento-v2.md`

**Ordem obrigatória (#14):**

1. **Branch** `feat/armazenamento-offline`. Nada direto na `main`.
2. **Backup e conferência:** `pg_dump` de `app_storage` + guardar a saída das consultas de diagnóstico (38 equipamentos, 340 chaves, 5.692 KB).
3. **SQL aditivo em produção.** Todas as colunas são `add column if not exists` com default, todas as tabelas são novas e a RPC é função nova: **o frontend atual continua funcionando** — ele faz `upsert` direto e ignora as colunas novas.
4. **Teste de compatibilidade:** com o SQL aplicado e o frontend ANTIGO em produção, confirmar que salvar equipamento, gerar relatório e sincronizar seguem funcionando.
5. **Frontend novo atrás da flag** `nr13_armazenamento_v2` (coluna em `config_global`, igual ao toggle de trial que já existe). Flag desligada → caminho antigo, byte a byte.
6. **Ativar só para uma conta de teste.** Validar os 15 cenários.
7. **Ativar para `cmam.caldeiras@gmail.com`** e confirmar os 38 equipamentos na tela.
8. **Ativação gradual** conta a conta, começando pelas 4 acima da cota.

**Rollback do frontend — o ponto que faltava:**

O risco não é desligar a flag: é o **dado novo criado enquanto ela esteve ligada**. Com a v2 ativa, as escritas passam pela RPC e incrementam `versao`; o frontend antigo lê `valor` e ignora `versao`, então **continua funcionando normalmente** — é compatível para leitura. O que ele *não* faz é respeitar `deletado_em`.

Portanto o rollback é:

```sql
-- 1. Desligar a flag para a conta afetada.
update public.config_global set armazenamento_v2 = false;

-- 2. Materializar os soft-deletes que o frontend antigo não entende,
--    senão itens excluídos na v2 REAPARECEM na v1.
delete from public.app_storage where deletado_em is not null;

-- 3. As pendências que ainda estavam no IndexedDB do aparelho não sobem pela
--    v1 (ela usa outra fila). Antes de desligar, drenar:
--    /pendencias -> "Tentar todas" -> confirmar fila vazia em cada aparelho ativo.
```

**Regra:** a flag só é desligada depois de a fila estar vazia nos aparelhos ativos daquela conta. O passo 3 é o único que exige ação do usuário, e a tela `/pendencias` já mostra exatamente o que falta.

As colunas e tabelas novas **permanecem** no rollback: são aditivas e inertes para a v1.

---

## Task 16 (REVISADA): cenários de concorrência real

**Files:** Create `src/services/cenarios.test.ts`; Modify `PENDENCIAS.md`, `CLAUDE.md`

**O que mudou (#13):** os testes anteriores de "duas abas" e "dois dispositivos" **não simulavam concorrência** — limpavam o Map e liam o mesmo IndexedDB em sequência, e chamavam `guardarConflito()` diretamente em vez de provocar um conflito.

| # | Cenário | Como o teste força de verdade |
|---|---|---|
| 1 | Fechar o processo entre dado e fila | operação não-clonável aborta a tx; assertar que **nem** o dado **nem** a fila persistiram |
| 2 | Aborto de transação do IndexedDB | `tx.abort()` no meio; Map revertido ao valor anterior |
| 3 | Resposta do servidor perdida após aplicar | 1ª chamada rejeita depois de aplicado; 2ª devolve `repetido`; assertar **uma** aplicação |
| 4 | Dois aparelhos com a mesma `versaoBase` | RPC devolve `conflito`; assertar `nr13_conflito_*` **e** item local preservado |
| 5 | Exclusão concorrente com edição | `del` aplicado, depois `set` com versão antiga → `tombstone_mais_novo`; nada ressuscita |
| 6 | Duas abas montando relatórios | dois `montarPalcoDaTag` concorrentes; o 2º recebe `ocupado`, o 1º mantém o palco íntegro |
| 7 | Aba A altera o Map da aba B | `BroadcastChannel` real entre duas instâncias; assertar propagação |
| 8 | Iframe grava e recebe confirmação | `postMessage` ida e volta; assertar que o item só sai da ponte após o commit |
| 9 | Logout com pendências | `podeSairSemPerder()` bloqueia; banco preservado |
| 10 | Aparelho offline além da coleta | `anterior_ao_corte`; vira conflito, não ressurreição |
| 11 | Reabrir 100% offline | sem rede, `lerTudo` devolve snapshot do IndexedDB com os 38 |
| 12 | Relatório perto e acima de 5 MB | degrada em passos; recusa listando o que excedeu; nunca parcial |
| 13 | Troca de organização | zero chaves da anterior no Map, palco e IndexedDB |
| 14 | Limpeza total do site | aviso genérico, sem lista inventada |
| 15 | Recriar chave excluída e coletada | versão nova > `versao_final` → aceita |

**SQL/RPC (#13):** os cenários 3, 4, 5, 10 e 15 dependem do comportamento da RPC. O `contratoRpc.test.ts` cobre a interpretação no cliente; a verificação do **servidor** é um roteiro manual em `docs/superpowers/plans/implantacao-armazenamento-v2.md`, executado no passo 4 da implantação, com um `select` de conferência por cenário. Testar PL/pgSQL dentro do Vitest exigiria um Postgres no CI, que este repo não tem — a limitação fica registrada em vez de fingida.

- [ ] Rodar `npm test` (verde) e `npm run build`.
- [ ] `grep -rnE "catch\s*\{\s*\}" src/services/ public/sb-storage.js` → nenhum resultado.
- [ ] Registrar em `PENDENCIAS.md` o SQL, o agendamento de `coletar_tombstones(org, 30)` por service_role, e o roteiro de implantação.
- [ ] Atualizar `CLAUDE.md` §2 com a arquitetura de quatro camadas.

---

## Fora de escopo (Fases 2 e 3)

Fotos no bucket, autosave granular por formulário, `esquema: 2` e migração preguiçosa.
