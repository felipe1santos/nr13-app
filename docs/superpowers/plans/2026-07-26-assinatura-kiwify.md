# Assinatura Kiwify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O usuário assina sozinho pelo checkout da Kiwify, o acesso libera sozinho quando o pagamento é confirmado, e a conta degrada para somente leitura (sem deslogar) quando a assinatura não está em dia.

**Architecture:** O status vive no Postgres (linha do mestre da org) e é o único que decide permissão — o front só espelha. Uma Edge Function recebe os webhooks da Kiwify, grava um log de eventos e aplica as transições. O front ganha barra de aviso, modal de checkout com polling e um `ModalAviso` reutilizável que substitui os `window.alert()` de bloqueio existentes.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand, Supabase (Postgres + RLS + Edge Functions em Deno), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-assinatura-kiwify-design.md`

## Global Constraints

- Toda string visível ao usuário em **português do Brasil**.
- **Nenhuma dependência nova** no `package.json` (regra do projeto: `xlsx` vem de CDN, nada de `npm install` fora do que já existe).
- `npm run build` (que roda `tsc -b`) precisa passar — é mais estrito que `tsc --noEmit`.
- Testes com `npx vitest run`. Testes novos vão em `__tests__/` ao lado do código, seguindo o padrão de `src/features/relatorios/__tests__/`.
- Não alterar o comportamento do Portal do Cliente (`papel = 'cliente'`): ele já é somente leitura por outro motivo e as duas travas convivem.
- Produto Kiwify: `NR13-Solutions` / plano **Mensal R$ 197** → `https://pay.kiwify.com.br/O9KdzEI`. Projeto Supabase: `qqsesrntfvmdxqxrfvmw`.
- Nada de valor/link/segredo hardcoded no bundle: vai em `config_global`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/assinatura_setup.sql` | Colunas, backfill, tabela de eventos, função de status, RLS |
| `supabase/functions/kiwify_webhook/parser.ts` | TS puro: extrai e-mail/id/evento de um payload desconhecido (testável no Vitest) |
| `supabase/functions/kiwify_webhook/index.ts` | Handler Deno: valida segredo, grava evento, aplica transição |
| `src/features/assinatura/maquinaEstados.ts` | Função pura de transição de estado (sem I/O) |
| `src/features/assinatura/__tests__/maquinaEstados.test.ts` | Testes da máquina |
| `src/services/assinatura.ts` | Espelho local do status, textos por estado, gates de escrita/documentos |
| `src/components/ModalAviso.tsx` + `.css` | Modal reutilizável (sucesso/alerta/erro) |
| `src/components/BarraAssinatura.tsx` | Barra fixa por estado, com botão Regularizar |
| `src/components/ModalAssinatura.tsx` | Resumo do plano, abre checkout, faz polling |
| `src/services/eventos.ts` | (modificar) barramento ganha o evento `nr13:aviso` |
| `src/services/storage.ts` | (modificar) gate de escrita também olha a assinatura |
| `src/services/auth.ts` | (modificar) carrega e espelha o status no login |
| `src/app/Layout.tsx` | (modificar) monta `BarraAssinatura` e o listener do `ModalAviso` |
| `src/features/relatorios/pdfService.ts`, `printService.ts`, `src/features/equipamento/importarPlanilhaService.ts`, `ProntuarioFabricante.tsx` | (modificar) trocam `window.alert` por evento de aviso |
| `src/pages/Admin.tsx` | (modificar) coluna de status + eventos órfãos |

---

### Task 1: Máquina de estados (função pura)

Começa aqui porque é a regra de negócio inteira sem I/O — dá pra testar tudo antes de existir banco, webhook ou tela.

**Files:**
- Create: `src/features/assinatura/maquinaEstados.ts`
- Test: `src/features/assinatura/__tests__/maquinaEstados.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type StatusAssinatura = 'trial' | 'ativa' | 'graca' | 'cancelada_no_prazo' | 'somente_leitura'`
  - `type EventoKiwify = 'compra_aprovada' | 'subscription_renewed' | 'subscription_late' | 'subscription_canceled' | 'compra_reembolsada' | 'chargeback'`
  - `interface EstadoAssinatura { status: StatusAssinatura; ate: string | null }` (`ate` = ISO 8601 ou `null` = sem vencimento)
  - `function aplicarEvento(atual: EstadoAssinatura, evento: EventoKiwify, agora: Date): EstadoAssinatura`
  - `function statusEfetivo(estado: EstadoAssinatura, agora: Date): StatusAssinatura`
  - `const DIAS_CICLO = 30`, `const DIAS_GRACA = 5`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assinatura/__tests__/maquinaEstados.test.ts
import { describe, it, expect } from 'vitest';
import { aplicarEvento, statusEfetivo, type EstadoAssinatura } from '../maquinaEstados';

const AGORA = new Date('2026-07-26T12:00:00.000Z');
const trial: EstadoAssinatura = { status: 'trial', ate: '2026-07-27T12:00:00.000Z' };

describe('aplicarEvento', () => {
  it('compra aprovada ativa a conta por 30 dias', () => {
    const r = aplicarEvento(trial, 'compra_aprovada', AGORA);
    expect(r.status).toBe('ativa');
    expect(r.ate).toBe('2026-08-25T12:00:00.000Z');
  });

  it('renovacao estende 30 dias a partir de agora', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-07-27T12:00:00.000Z' };
    expect(aplicarEvento(ativa, 'subscription_renewed', AGORA).ate).toBe('2026-08-25T12:00:00.000Z');
  });

  it('cartao recusado joga para graca de 5 dias', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-07-26T12:00:00.000Z' };
    const r = aplicarEvento(ativa, 'subscription_late', AGORA);
    expect(r.status).toBe('graca');
    expect(r.ate).toBe('2026-07-31T12:00:00.000Z');
  });

  it('pagamento durante a graca volta para ativa', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-31T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'compra_aprovada', AGORA).status).toBe('ativa');
  });

  it('cancelamento preserva o periodo ja pago', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-08-20T12:00:00.000Z' };
    const r = aplicarEvento(ativa, 'subscription_canceled', AGORA);
    expect(r.status).toBe('cancelada_no_prazo');
    expect(r.ate).toBe('2026-08-20T12:00:00.000Z');
  });

  it('cancelamento sem periodo restante bloqueia na hora', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-20T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'subscription_canceled', AGORA).status).toBe('somente_leitura');
  });

  it('chargeback e reembolso bloqueiam na hora, mesmo com periodo pago', () => {
    const ativa: EstadoAssinatura = { status: 'ativa', ate: '2026-08-20T12:00:00.000Z' };
    expect(aplicarEvento(ativa, 'chargeback', AGORA).status).toBe('somente_leitura');
    expect(aplicarEvento(ativa, 'chargeback', AGORA).ate).toBe(AGORA.toISOString());
    expect(aplicarEvento(ativa, 'compra_reembolsada', AGORA).status).toBe('somente_leitura');
  });

  it('renovacao fora de ordem depois de late reativa (webhook atrasado nao pode punir)', () => {
    const graca: EstadoAssinatura = { status: 'graca', ate: '2026-07-31T12:00:00.000Z' };
    expect(aplicarEvento(graca, 'subscription_renewed', AGORA).status).toBe('ativa');
  });
});

describe('statusEfetivo', () => {
  it('rebaixa para somente leitura quando a data passou', () => {
    expect(statusEfetivo({ status: 'ativa', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
    expect(statusEfetivo({ status: 'graca', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
    expect(statusEfetivo({ status: 'trial', ate: '2026-07-25T12:00:00.000Z' }, AGORA)).toBe('somente_leitura');
  });

  it('data nula significa sem vencimento e nunca rebaixa', () => {
    expect(statusEfetivo({ status: 'ativa', ate: null }, AGORA)).toBe('ativa');
  });

  it('mantem o status quando a data ainda esta no futuro', () => {
    expect(statusEfetivo({ status: 'cancelada_no_prazo', ate: '2026-08-20T12:00:00.000Z' }, AGORA)).toBe('cancelada_no_prazo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assinatura/__tests__/maquinaEstados.test.ts`
Expected: FAIL — `Failed to resolve import "../maquinaEstados"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/assinatura/maquinaEstados.ts
// Regra de negócio da assinatura, sem I/O: a mesma função decide o estado no
// front (espelho) e no webhook (Edge Function). Testável isoladamente.

export type StatusAssinatura =
  | 'trial'
  | 'ativa'
  | 'graca'
  | 'cancelada_no_prazo'
  | 'somente_leitura';

export type EventoKiwify =
  | 'compra_aprovada'
  | 'subscription_renewed'
  | 'subscription_late'
  | 'subscription_canceled'
  | 'compra_reembolsada'
  | 'chargeback';

/** `ate` = fim do período pago (ISO). `null` = sem vencimento (conta vitalícia/liberada na mão). */
export interface EstadoAssinatura {
  status: StatusAssinatura;
  ate: string | null;
}

export const DIAS_CICLO = 30;
/** Alinhado à retentativa de cartão da Kiwify — bloquear antes derrubaria quem ela ainda ia cobrar. */
export const DIAS_GRACA = 5;

function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

function futuro(ate: string | null, agora: Date): boolean {
  if (ate === null) return true;
  const t = new Date(ate).getTime();
  return Number.isFinite(t) && t > agora.getTime();
}

export function aplicarEvento(
  atual: EstadoAssinatura,
  evento: EventoKiwify,
  agora: Date,
): EstadoAssinatura {
  switch (evento) {
    case 'compra_aprovada':
    case 'subscription_renewed':
      return { status: 'ativa', ate: somarDias(agora, DIAS_CICLO) };
    case 'subscription_late':
      return { status: 'graca', ate: somarDias(agora, DIAS_GRACA) };
    case 'subscription_canceled':
      // Cancelou: usa o que já pagou. Sem período restante, bloqueia agora.
      return futuro(atual.ate, agora)
        ? { status: 'cancelada_no_prazo', ate: atual.ate }
        : { status: 'somente_leitura', ate: atual.ate };
    case 'chargeback':
    case 'compra_reembolsada':
      // Dinheiro devolvido: corta na hora, ignorando período pago.
      return { status: 'somente_leitura', ate: agora.toISOString() };
  }
}

export function statusEfetivo(estado: EstadoAssinatura, agora: Date): StatusAssinatura {
  if (estado.status === 'somente_leitura') return 'somente_leitura';
  return futuro(estado.ate, agora) ? estado.status : 'somente_leitura';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assinatura/__tests__/maquinaEstados.test.ts`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/assinatura/maquinaEstados.ts src/features/assinatura/__tests__/maquinaEstados.test.ts
git commit -m "feat(assinatura): maquina de estados da assinatura"
```

---

### Task 2: SQL — colunas, backfill, tabela de eventos, função de status e RLS

**Files:**
- Create: `supabase/assinatura_setup.sql`

**Interfaces:**
- Consumes: `public.org_atual()`, `public.papel_atual()`, `public.is_admin()`, `public.config_global` (já existem em `acesso_setup.sql` / `trial_setup.sql`).
- Produces: colunas `profiles.assinatura_status`, `profiles.assinatura_ate`, `profiles.kiwify_subscription_id`, `profiles.kiwify_email`; tabela `public.kiwify_eventos`; função `public.assinatura_status_org()`; chaves `assinatura_checkout_url` e `kiwify_webhook_segredo` em `config_global`.

- [ ] **Step 1: Escrever o SQL**

```sql
-- supabase/assinatura_setup.sql
-- ============================================================================
-- NR-13 — Assinatura recorrente (Kiwify). IDEMPOTENTE.
-- Rodar no SQL Editor DEPOIS de admin_setup.sql, acesso_setup.sql e trial_setup.sql.
--
-- Efeito nas contas existentes: nenhum, DESDE QUE o backfill da seção 2 rode
-- junto (ele é que impede toda conta paga cair no default 'trial').
-- ============================================================================

-- ── 1. Colunas em profiles ──────────────────────────────────────────────────
alter table public.profiles add column if not exists assinatura_status       text not null default 'trial';
alter table public.profiles add column if not exists assinatura_ate          timestamptz;
alter table public.profiles add column if not exists kiwify_subscription_id  text;
alter table public.profiles add column if not exists kiwify_email            text;

-- ── 2. Backfill (OBRIGATÓRIO) ───────────────────────────────────────────────
-- Sem isto, quem já paga entra em 'trial' e é rebaixado a somente leitura.
-- assinatura_ate NULL = sem vencimento: a função da seção 4 nunca rebaixa.
update public.profiles
   set assinatura_status = case
         when acesso_expira_em is not null and acesso_expira_em <= now() then 'somente_leitura'
         when plano = 'trial'  then 'trial'
         else 'ativa'                       -- completo, demonstracao e legado
       end,
       assinatura_ate = case
         when plano = 'trial' then coalesce(trial_fim, acesso_expira_em)
         else acesso_expira_em              -- null = vitalícia, preservado
       end
 where assinatura_status = 'trial'          -- só quem ainda está no default
   and assinatura_ate is null;

-- ── 3. Campos sensíveis: usuário não muda o próprio status ──────────────────
create or replace function public.proteger_campos_sensiveis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    new.ativo                  := old.ativo;
    new.acesso_expira_em       := old.acesso_expira_em;
    new.plano                  := old.plano;
    new.role                   := old.role;
    new.papel                  := old.papel;
    new.org_id                 := old.org_id;
    new.cliente_id             := old.cliente_id;
    new.trial_inicio           := old.trial_inicio;
    new.trial_fim              := old.trial_fim;
    new.origem_cadastro        := old.origem_cadastro;
    new.assinatura_status      := old.assinatura_status;
    new.assinatura_ate         := old.assinatura_ate;
    new.kiwify_subscription_id := old.kiwify_subscription_id;
    new.kiwify_email           := old.kiwify_email;
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_campos_sensiveis on public.profiles;
create trigger trg_proteger_campos_sensiveis
  before update on public.profiles
  for each row execute function public.proteger_campos_sensiveis();

-- ── 4. Status efetivo da ORG (mestre manda; a data rebaixa) ─────────────────
-- Espelha src/features/assinatura/maquinaEstados.ts::statusEfetivo.
create or replace function public.assinatura_status_org() returns text
  language sql security definer set search_path = public as $$
  select coalesce(
    (select case
              when p.assinatura_status = 'somente_leitura' then 'somente_leitura'
              when p.assinatura_ate is null then p.assinatura_status
              when p.assinatura_ate > now() then p.assinatura_status
              else 'somente_leitura'
            end
       from public.profiles p
      where p.id = public.org_atual()),
    'somente_leitura'
  );
$$;

create or replace function public.assinatura_permite_escrita() returns boolean
  language sql security definer set search_path = public as $$
  select public.assinatura_status_org() in ('trial','ativa','graca','cancelada_no_prazo');
$$;

-- ── 5. RLS de escrita: troca acesso_vigente() pelo status da assinatura ─────
drop policy if exists app_storage_insert_org on public.app_storage;
create policy app_storage_insert_org on public.app_storage
  for insert with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.assinatura_permite_escrita()
  );

drop policy if exists app_storage_update_org on public.app_storage;
create policy app_storage_update_org on public.app_storage
  for update using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.assinatura_permite_escrita()
  ) with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.assinatura_permite_escrita()
  );

drop policy if exists app_storage_delete_org on public.app_storage;
create policy app_storage_delete_org on public.app_storage
  for delete using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.assinatura_permite_escrita()
  );

-- ── 6. Log de eventos da Kiwify (auditoria + fila de órfãos) ────────────────
create table if not exists public.kiwify_eventos (
  id              uuid primary key default gen_random_uuid(),
  recebido_em     timestamptz not null default now(),
  evento          text not null,
  payload         jsonb not null,
  email           text,
  subscription_id text,
  profile_id      uuid references public.profiles(id),
  processado      boolean not null default false,
  erro            text
);

create index if not exists kiwify_eventos_email_idx on public.kiwify_eventos (email);
create index if not exists kiwify_eventos_orfaos_idx on public.kiwify_eventos (processado, recebido_em desc);

alter table public.kiwify_eventos enable row level security;

-- Só admin da plataforma lê pelo app; a Edge Function usa service_role (ignora RLS).
drop policy if exists kiwify_eventos_admin on public.kiwify_eventos;
create policy kiwify_eventos_admin on public.kiwify_eventos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 7. Config: link do checkout e segredo do webhook ────────────────────────
insert into public.config_global (chave, valor) values
  ('assinatura_checkout_url', '{"url": "https://pay.kiwify.com.br/O9KdzEI"}'),
  ('kiwify_webhook_segredo',  '{"segredo": "TROQUE-ESTE-VALOR"}')
  on conflict (chave) do nothing;
```

- [ ] **Step 2: Verificar o backfill em consulta seca (antes de aplicar)**

No SQL Editor do Supabase, rodar só o SELECT abaixo e conferir se a classificação bate com a realidade das contas:

```sql
select plano,
       acesso_expira_em,
       count(*),
       case
         when acesso_expira_em is not null and acesso_expira_em <= now() then 'somente_leitura'
         when plano = 'trial' then 'trial'
         else 'ativa'
       end as status_previsto
  from public.profiles
 group by 1,2,4
 order by 1;
```

Expected: nenhuma conta paga em uso caindo em `somente_leitura` por engano.

- [ ] **Step 3: Commit**

```bash
git add supabase/assinatura_setup.sql
git commit -m "feat(assinatura): SQL de status, backfill, RLS e log de eventos"
```

---

### Task 3: Parser do payload da Kiwify

O formato não é público (a doc da Kiwify aponta para um Notion privado). O parser tenta vários caminhos e, quando não acha, devolve `null` para o evento virar órfão em vez de explodir.

**Files:**
- Create: `supabase/functions/kiwify_webhook/parser.ts`
- Test: `src/features/assinatura/__tests__/kiwifyParser.test.ts`

**Interfaces:**
- Consumes: `EventoKiwify` (Task 1) — redeclarado localmente, porque a Edge Function roda em Deno e não importa de `src/`.
- Produces:
  - `interface DadosEvento { evento: EventoKiwify | null; email: string | null; subscriptionId: string | null; sck: string | null }`
  - `function extrairDados(payload: unknown): DadosEvento`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assinatura/__tests__/kiwifyParser.test.ts
import { describe, it, expect } from 'vitest';
import { extrairDados } from '../../../../supabase/functions/kiwify_webhook/parser';

describe('extrairDados', () => {
  it('le o formato com Customer maiusculo', () => {
    const r = extrairDados({
      webhook_event_type: 'compra_aprovada',
      Customer: { email: 'Fulano@Empresa.com' },
      subscription_id: 'sub_123',
    });
    expect(r).toEqual({ evento: 'compra_aprovada', email: 'fulano@empresa.com', subscriptionId: 'sub_123', sck: null });
  });

  it('le o formato aninhado em data.customer', () => {
    const r = extrairDados({
      event: 'subscription_late',
      data: { customer: { email: 'a@b.com' }, subscription: { id: 'sub_9' } },
    });
    expect(r.evento).toBe('subscription_late');
    expect(r.email).toBe('a@b.com');
    expect(r.subscriptionId).toBe('sub_9');
  });

  it('le o sck dos parametros de rastreamento', () => {
    const r = extrairDados({ order_status: 'chargeback', email: 'c@d.com', TrackingParameters: { sck: 'uid-42' } });
    expect(r.evento).toBe('chargeback');
    expect(r.sck).toBe('uid-42');
  });

  it('payload irreconhecivel devolve tudo nulo, sem lancar', () => {
    expect(extrairDados({ qualquer: 'coisa' })).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
    expect(extrairDados(null)).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
    expect(extrairDados('texto')).toEqual({ evento: null, email: null, subscriptionId: null, sck: null });
  });

  it('evento desconhecido nao vira evento valido', () => {
    expect(extrairDados({ webhook_event_type: 'pix_gerado', email: 'a@b.com' }).evento).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assinatura/__tests__/kiwifyParser.test.ts`
Expected: FAIL — módulo `parser` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/kiwify_webhook/parser.ts
// TS puro (sem APIs do Deno nem imports) para rodar igual na Edge Function e no Vitest.
// A Kiwify NÃO publica o schema do webhook de vendas: por isso lemos por tentativa e,
// quando não achamos, devolvemos null — o evento vira órfão e ninguém é liberado/bloqueado
// por engano.

export type EventoKiwify =
  | 'compra_aprovada'
  | 'subscription_renewed'
  | 'subscription_late'
  | 'subscription_canceled'
  | 'compra_reembolsada'
  | 'chargeback';

const EVENTOS: EventoKiwify[] = [
  'compra_aprovada',
  'subscription_renewed',
  'subscription_late',
  'subscription_canceled',
  'compra_reembolsada',
  'chargeback',
];

export interface DadosEvento {
  evento: EventoKiwify | null;
  email: string | null;
  subscriptionId: string | null;
  sck: string | null;
}

const VAZIO: DadosEvento = { evento: null, email: null, subscriptionId: null, sck: null };

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Primeiro valor string não vazio entre vários caminhos "a.b.c". */
function primeiraString(raiz: Record<string, unknown>, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = raiz;
    for (const parte of caminho.split('.')) {
      const o = obj(atual);
      atual = o ? o[parte] : undefined;
    }
    if (typeof atual === 'string' && atual.trim() !== '') return atual.trim();
  }
  return null;
}

export function extrairDados(payload: unknown): DadosEvento {
  const raiz = obj(payload);
  if (!raiz) return { ...VAZIO };

  const eventoBruto = primeiraString(raiz, [
    'webhook_event_type',
    'event',
    'event_type',
    'order_status',
    'status',
    'data.event',
    'data.webhook_event_type',
  ]);
  const evento = EVENTOS.includes(eventoBruto as EventoKiwify) ? (eventoBruto as EventoKiwify) : null;

  const email = primeiraString(raiz, [
    'Customer.email',
    'customer.email',
    'data.customer.email',
    'data.Customer.email',
    'buyer.email',
    'email',
  ]);

  const subscriptionId = primeiraString(raiz, [
    'subscription_id',
    'subscription.id',
    'data.subscription.id',
    'Subscription.id',
    'order_id',
  ]);

  const sck = primeiraString(raiz, [
    'TrackingParameters.sck',
    'tracking_parameters.sck',
    'data.tracking_parameters.sck',
    'sck',
  ]);

  return { evento, email: email ? email.toLowerCase() : null, subscriptionId, sck };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assinatura/__tests__/kiwifyParser.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/kiwify_webhook/parser.ts src/features/assinatura/__tests__/kiwifyParser.test.ts
git commit -m "feat(assinatura): parser tolerante do payload da Kiwify"
```

---

### Task 4: Edge Function `kiwify_webhook`

**Files:**
- Create: `supabase/functions/kiwify_webhook/index.ts`

**Interfaces:**
- Consumes: `extrairDados` (Task 3); tabela `kiwify_eventos`, colunas de assinatura e `config_global` (Task 2); regra de transição (Task 1, reimplementada em Deno — ver comentário no arquivo).
- Produces: endpoint `POST /kiwify_webhook?s=<segredo>` que responde `200 {ok:true}` sempre que conseguir registrar o evento (a Kiwify reenvia em erro; registrar e responder 200 evita tempestade de retry).

- [ ] **Step 1: Escrever a função**

```ts
// supabase/functions/kiwify_webhook/index.ts
// Recebe os webhooks de venda da Kiwify e aplica o estado da assinatura.
// Deploy: Supabase Dashboard → Edge Functions → nome "kiwify_webhook".
// URL cadastrada na Kiwify: https://<projeto>.supabase.co/functions/v1/kiwify_webhook?s=<segredo>
//
// Segredo na query porque a Kiwify NÃO documenta assinatura HMAC para eventos de venda.
// A lógica de transição espelha src/features/assinatura/maquinaEstados.ts — ao mudar uma,
// mudar a outra (Deno não importa de src/).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extrairDados, type EventoKiwify } from './parser.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DIAS_CICLO = 30;
const DIAS_GRACA = 5;

function somarDias(base: Date, dias: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

function futuro(ate: string | null, agora: Date): boolean {
  if (!ate) return true;
  const t = new Date(ate).getTime();
  return Number.isFinite(t) && t > agora.getTime();
}

function aplicarEvento(
  atual: { status: string; ate: string | null },
  evento: EventoKiwify,
  agora: Date,
): { status: string; ate: string | null } {
  switch (evento) {
    case 'compra_aprovada':
    case 'subscription_renewed':
      return { status: 'ativa', ate: somarDias(agora, DIAS_CICLO) };
    case 'subscription_late':
      return { status: 'graca', ate: somarDias(agora, DIAS_GRACA) };
    case 'subscription_canceled':
      return futuro(atual.ate, agora)
        ? { status: 'cancelada_no_prazo', ate: atual.ate }
        : { status: 'somente_leitura', ate: atual.ate };
    default:
      return { status: 'somente_leitura', ate: agora.toISOString() };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método não permitido', { status: 405 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Segredo da URL
  const url = new URL(req.url);
  const { data: cfg } = await admin
    .from('config_global')
    .select('valor')
    .eq('chave', 'kiwify_webhook_segredo')
    .maybeSingle();
  const segredo = (cfg?.valor as { segredo?: string } | null)?.segredo ?? '';
  if (!segredo || url.searchParams.get('s') !== segredo) {
    return new Response('Não autorizado', { status: 401 });
  }

  // 2. Corpo (nunca confiar no formato)
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    payload = { _corpo_invalido: true };
  }
  const dados = extrairDados(payload);

  // 3. Acha a conta: e-mail da compra, ou sck (= id do usuário no Supabase)
  let profileId: string | null = null;
  let atual = { status: 'trial', ate: null as string | null };

  if (dados.sck) {
    const { data } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .eq('id', dados.sck)
      .maybeSingle();
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }
  if (!profileId && dados.email) {
    const { data } = await admin
      .from('profiles')
      .select('id, org_id, assinatura_status, assinatura_ate')
      .ilike('email', dados.email)
      .maybeSingle();
    if (data) {
      profileId = (data.org_id as string) ?? (data.id as string);
      atual = { status: data.assinatura_status as string, ate: data.assinatura_ate as string | null };
    }
  }

  // 4. Registra SEMPRE — inclusive órfão e evento desconhecido (auditoria/reprocesso)
  const podeProcessar = !!profileId && !!dados.evento;
  const { data: jaExiste } = await admin
    .from('kiwify_eventos')
    .select('id')
    .eq('evento', dados.evento ?? '')
    .eq('subscription_id', dados.subscriptionId ?? '')
    .eq('processado', true)
    .gte('recebido_em', new Date(Date.now() - 60_000).toISOString())
    .maybeSingle();

  await admin.from('kiwify_eventos').insert({
    evento: dados.evento ?? 'desconhecido',
    payload: payload as Record<string, unknown>,
    email: dados.email,
    subscription_id: dados.subscriptionId,
    profile_id: profileId,
    processado: podeProcessar && !jaExiste,
    erro: podeProcessar ? (jaExiste ? 'duplicado, ignorado' : null) : 'conta não identificada ou evento fora do escopo',
  });

  // 5. Aplica o estado (idempotente: duplicado em <60s não reprocessa)
  if (podeProcessar && !jaExiste) {
    const novo = aplicarEvento(atual, dados.evento as EventoKiwify, new Date());
    await admin
      .from('profiles')
      .update({
        assinatura_status: novo.status,
        assinatura_ate: novo.ate,
        kiwify_subscription_id: dados.subscriptionId,
        kiwify_email: dados.email,
        // Mantém a coluna legada coerente para o painel Admin e os gates antigos.
        plano: novo.status === 'somente_leitura' ? 'expirado' : 'completo',
        acesso_expira_em: novo.ate,
      })
      .eq('id', profileId as string);
  }

  // 200 sempre que registramos: erro faria a Kiwify reenviar em looping.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Conferir a compilação do TS compartilhado**

Run: `npx tsc --noEmit supabase/functions/kiwify_webhook/parser.ts`
Expected: sem erros (o `index.ts` usa APIs do Deno e não passa pelo `tsc` do projeto — é esperado).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/kiwify_webhook/index.ts
git commit -m "feat(assinatura): edge function do webhook da Kiwify"
```

---

### Task 5: Serviço de assinatura no front (espelho local)

**Files:**
- Create: `src/services/assinatura.ts`
- Test: `src/features/assinatura/__tests__/assinaturaServico.test.ts`
- Modify: `src/services/auth.ts` (função `carregarPerfil`, linhas ~58-95)

**Interfaces:**
- Consumes: `statusEfetivo`, `StatusAssinatura` (Task 1).
- Produces:
  - `function gravarEstadoLocal(estado: EstadoAssinatura): void`
  - `function statusAssinaturaLocal(): StatusAssinatura`
  - `function assinaturaAte(): string | null`
  - `function podeEscreverAssinatura(): boolean`
  - `function textoBloqueio(): string` — frase por estado, usada pelo `ModalAviso`
  - `function marcarSucessoExibido(): void` / `function sucessoPendente(): boolean`
  - Chaves de `localStorage`: `nr13_assinatura_status`, `nr13_assinatura_ate`, `nr13_assinatura_sucesso_pendente`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assinatura/__tests__/assinaturaServico.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  statusAssinaturaLocal,
  podeEscreverAssinatura,
  textoBloqueio,
  gravarEstadoLocal,
} from '../../../services/assinatura';

beforeEach(() => localStorage.clear());

describe('espelho local da assinatura', () => {
  it('sem nada gravado assume ativa (nao trava usuario por falta de dado)', () => {
    expect(statusAssinaturaLocal()).toBe('ativa');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('respeita o status gravado', () => {
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('graca');
    expect(podeEscreverAssinatura()).toBe(true);
  });

  it('rebaixa quando a data ja passou', () => {
    gravarEstadoLocal({ status: 'ativa', ate: new Date(Date.now() - 1000).toISOString() });
    expect(statusAssinaturaLocal()).toBe('somente_leitura');
    expect(podeEscreverAssinatura()).toBe(false);
  });

  it('texto do bloqueio muda por estado', () => {
    gravarEstadoLocal({ status: 'somente_leitura', ate: null });
    expect(textoBloqueio()).toContain('suspensa');
    gravarEstadoLocal({ status: 'graca', ate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(textoBloqueio()).toContain('cartão');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/assinatura/__tests__/assinaturaServico.test.ts`
Expected: FAIL — módulo `assinatura` não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/assinatura.ts
// Espelho LOCAL do status da assinatura, só para desenhar a UI e cortar ações no bundle.
// Quem decide de verdade é o Postgres (assinatura_permite_escrita na RLS): se o espelho
// mentir, a escrita é recusada no servidor do mesmo jeito.
import { statusEfetivo, type EstadoAssinatura, type StatusAssinatura } from '../features/assinatura/maquinaEstados';

const CHAVE_STATUS = 'nr13_assinatura_status';
const CHAVE_ATE = 'nr13_assinatura_ate';
const CHAVE_SUCESSO = 'nr13_assinatura_sucesso_pendente';

export function gravarEstadoLocal(estado: EstadoAssinatura): void {
  localStorage.setItem(CHAVE_STATUS, estado.status);
  if (estado.ate) localStorage.setItem(CHAVE_ATE, estado.ate);
  else localStorage.removeItem(CHAVE_ATE);
}

export function assinaturaAte(): string | null {
  return localStorage.getItem(CHAVE_ATE);
}

export function statusAssinaturaLocal(): StatusAssinatura {
  // Ausência de dado = conta antiga/servidor sem a migração: não trava ninguém.
  const bruto = localStorage.getItem(CHAVE_STATUS) as StatusAssinatura | null;
  if (!bruto) return 'ativa';
  return statusEfetivo({ status: bruto, ate: assinaturaAte() }, new Date());
}

export function podeEscreverAssinatura(): boolean {
  return statusAssinaturaLocal() !== 'somente_leitura';
}

export function textoBloqueio(): string {
  switch (statusAssinaturaLocal()) {
    case 'graca':
      return 'A cobrança no seu cartão não foi aprovada. Regularize para não perder o acesso.';
    case 'cancelada_no_prazo':
      return 'Sua assinatura foi cancelada e o acesso termina no fim do período já pago.';
    case 'trial':
      return 'Este recurso fica disponível após a contratação do sistema.';
    default:
      return 'Sua assinatura está suspensa. Regularize o pagamento para voltar a salvar, imprimir e gerar documentos.';
  }
}

/** Marca que a próxima abertura deve exibir o modal verde de "assinatura confirmada". */
export function marcarSucessoPendente(): void {
  localStorage.setItem(CHAVE_SUCESSO, '1');
}

export function sucessoPendente(): boolean {
  return localStorage.getItem(CHAVE_SUCESSO) === '1';
}

export function marcarSucessoExibido(): void {
  localStorage.removeItem(CHAVE_SUCESSO);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/assinatura/__tests__/assinaturaServico.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Espelhar o status no login**

Em `src/services/auth.ts`, dentro de `carregarPerfil()`, incluir as colunas novas no primeiro `select` e gravar o espelho. O `select` legado (fallback quando a migração não rodou) fica como está.

```ts
// dentro de carregarPerfil(), trocar a lista de colunas do primeiro select:
    .select('plano, ativo, role, acesso_expira_em, papel, org_id, cliente_id, sessao_token, sessao_visto_em, assinatura_status, assinatura_ate')

// e, logo depois de gravar papel/org/cliente no localStorage, acrescentar:
  const assinaturaStatus = (data?.assinatura_status as string) ?? '';
  const assinaturaAteCol = (data?.assinatura_ate as string) ?? null;
  if (assinaturaStatus) {
    gravarEstadoLocal({ status: assinaturaStatus as StatusAssinatura, ate: assinaturaAteCol });
  }
```

Import no topo de `auth.ts`:

```ts
import { gravarEstadoLocal } from './assinatura';
import type { StatusAssinatura } from '../features/assinatura/maquinaEstados';
```

Atenção: `assinatura.ts` **não pode** importar `auth.ts` (ciclo — `auth` já importa `storage`).

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/services/assinatura.ts src/services/auth.ts src/features/assinatura/__tests__/assinaturaServico.test.ts
git commit -m "feat(assinatura): espelho local do status e leitura no login"
```

---

### Task 6: `ModalAviso` + evento de aviso no barramento

**Files:**
- Create: `src/components/ModalAviso.tsx`, `src/components/modal-aviso.css`
- Modify: `src/services/eventos.ts`
- Modify: `src/app/Layout.tsx:232` (junto de `<BarraTrial />`)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `interface Aviso { variante: 'sucesso' | 'alerta' | 'erro'; titulo: string; texto: string; acao?: { rotulo: string; aoClicar: () => void } }`
  - `function emitirAviso(aviso: Aviso): void` e `function assinarAviso(cb: (a: Aviso) => void): () => void` (em `eventos.ts`)
  - `<ModalAviso />` — componente sem props, monta uma vez no Layout e escuta o barramento.

- [ ] **Step 1: Ampliar o barramento**

Acrescentar ao fim de `src/services/eventos.ts`:

```ts
/** Aviso visual global (bloqueio, sucesso). Emitido por serviços que não são React. */
export interface Aviso {
  variante: 'sucesso' | 'alerta' | 'erro';
  titulo: string;
  texto: string;
  acao?: { rotulo: string; aoClicar: () => void };
}

const EVENTO_AVISO = 'nr13:aviso';

export function emitirAviso(aviso: Aviso): void {
  alvo.dispatchEvent(new CustomEvent<Aviso>(EVENTO_AVISO, { detail: aviso }));
}

export function assinarAviso(cb: (a: Aviso) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Aviso>).detail);
  alvo.addEventListener(EVENTO_AVISO, handler);
  return () => alvo.removeEventListener(EVENTO_AVISO, handler);
}
```

- [ ] **Step 2: Criar o componente**

```tsx
// src/components/ModalAviso.tsx
import { useEffect, useState } from 'react';
import { assinarAviso, type Aviso } from '../services/eventos';
import { Icone, type NomeIcone } from './Icone';
import './modal-aviso.css';

const ICONE: Record<Aviso['variante'], NomeIcone> = {
  sucesso: 'check',
  alerta: 'alerttri',
  erro: 'alerttri',
};

// Modal único do app para bloqueio/sucesso. Monta uma vez no Layout e escuta o
// barramento — assim serviços (pdfService, printService) avisam sem virar React.
export default function ModalAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => assinarAviso(setAviso), []);

  useEffect(() => {
    if (!aviso) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAviso(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aviso]);

  if (!aviso) return null;

  return (
    <div className="modal-aviso-fundo" role="dialog" aria-modal="true" onClick={() => setAviso(null)}>
      <div className={`modal-aviso ${aviso.variante}`} onClick={(e) => e.stopPropagation()}>
        <span className="modal-aviso-ic">
          <Icone nome={ICONE[aviso.variante]} tam={30} />
        </span>
        <h3>{aviso.titulo}</h3>
        <p>{aviso.texto}</p>
        <div className="modal-aviso-acoes">
          {aviso.acao && (
            <button
              type="button"
              className="modal-aviso-btn principal"
              onClick={() => {
                aviso.acao?.aoClicar();
                setAviso(null);
              }}
            >
              {aviso.acao.rotulo}
            </button>
          )}
          <button type="button" className="modal-aviso-btn" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
```

Se `'check'` não existir em `NomeIcone` (`src/components/Icone.tsx`), usar `'shield'` — conferir a união de tipos antes de rodar o build.

```css
/* src/components/modal-aviso.css */
.modal-aviso-fundo {
  position: fixed;
  inset: 0;
  background: rgba(12, 16, 20, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1200;
}

.modal-aviso {
  background: var(--bg-card, #fff);
  border-radius: 14px;
  padding: 26px 24px 20px;
  max-width: 440px;
  width: 100%;
  text-align: center;
  border-top: 5px solid var(--cor-aviso);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}

.modal-aviso.sucesso { --cor-aviso: #16a34a; }
.modal-aviso.alerta  { --cor-aviso: #f59e0b; }
.modal-aviso.erro    { --cor-aviso: #dc2626; }

.modal-aviso-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  color: var(--cor-aviso);
  background: color-mix(in srgb, var(--cor-aviso) 14%, transparent);
  margin-bottom: 12px;
}

.modal-aviso h3 { margin: 0 0 8px; font-size: 18px; }
.modal-aviso p { margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: var(--text-muted, #555); }

.modal-aviso-acoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

.modal-aviso-btn {
  border: 1px solid var(--border-solid, #ddd);
  background: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.modal-aviso-btn.principal {
  background: var(--cor-aviso);
  border-color: var(--cor-aviso);
  color: #fff;
}
```

- [ ] **Step 3: Montar no Layout**

Em `src/app/Layout.tsx`, logo abaixo de `<BarraTrial />` (linha ~232):

```tsx
          <BarraTrial />
          <ModalAviso />
```

com `import ModalAviso from '../components/ModalAviso';` no topo.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalAviso.tsx src/components/modal-aviso.css src/services/eventos.ts src/app/Layout.tsx
git commit -m "feat(ui): ModalAviso global ligado ao barramento de eventos"
```

---

### Task 7: Trocar os `window.alert()` de bloqueio pelo ModalAviso

**Files:**
- Modify: `src/features/relatorios/pdfService.ts:18-21` e `:88` (mesma checagem, duas funções)
- Modify: `src/features/relatorios/printService.ts` (chamadas a `bloqueioTrialDocs`)
- Modify: `src/features/equipamento/importarPlanilhaService.ts:403`
- Modify: `src/features/equipamento/ProntuarioFabricante.tsx:209-210`
- Modify: `src/services/trial.ts` (novo helper que junta trial + assinatura)

**Interfaces:**
- Consumes: `emitirAviso` (Task 6), `podeEscreverAssinatura`/`textoBloqueio` (Task 5).
- Produces: `function avisarBloqueioDocumentos(): boolean` em `src/services/trial.ts` — devolve `true` quando bloqueou (e já emitiu o aviso), `false` quando pode seguir.

- [ ] **Step 1: Criar o helper único**

Acrescentar em `src/services/trial.ts`:

```ts
import { emitirAviso } from './eventos';
import { podeEscreverAssinatura, textoBloqueio } from './assinatura';

/**
 * Funil ÚNICO de bloqueio de documentos (PDF, impressão, download). Devolve true
 * quando bloqueou — quem chama só precisa dar `return`. Cobre trial e assinatura
 * suspensa com a mesma tela.
 */
export function avisarBloqueioDocumentos(): boolean {
  const bloqueioTrial = bloqueioTrialDocs();
  if (bloqueioTrial) {
    emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: bloqueioTrial });
    return true;
  }
  if (!podeEscreverAssinatura()) {
    emitirAviso({ variante: 'erro', titulo: 'Assinatura suspensa', texto: textoBloqueio() });
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Trocar nos quatro pontos**

`pdfService.ts` (nas duas funções que hoje fazem `const bloqueio = bloqueioTrialDocs(); if (bloqueio) { window.alert(bloqueio); return; }`):

```ts
  if (avisarBloqueioDocumentos()) return;
```

`printService.ts`: mesma troca, mantendo o `return` que já existe.

`importarPlanilhaService.ts:403`:

```ts
  if (isTrial()) {
    emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_IMPORTACAO });
    return;
  }
```

`ProntuarioFabricante.tsx:209-210`: trocar `onClick={() => window.alert(MSG_BLOQUEIO_DOCS)}` por
`onClick={() => emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_DOCS })}`.

Manter o `throw new Error(MSG_BLOQUEIO_IMPORTACAO)` da linha 352 — é caminho de serviço, não de UI.

- [ ] **Step 3: Verificar que não sobrou alert de bloqueio**

Run: `npx rg "window.alert\(MSG_BLOQUEIO|window.alert\(bloqueio" src`
Expected: nenhum resultado.

- [ ] **Step 4: Verificar build e testes**

Run: `npm run build && npx vitest run`
Expected: `✓ built` e todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/services/trial.ts src/features/relatorios/pdfService.ts src/features/relatorios/printService.ts src/features/equipamento/importarPlanilhaService.ts src/features/equipamento/ProntuarioFabricante.tsx
git commit -m "feat(ui): bloqueios de documento usam ModalAviso em vez de window.alert"
```

---

### Task 8: Gate de escrita no storage

**Files:**
- Modify: `src/services/storage.ts` (função `somenteLeitura`, ~linha 30)

**Interfaces:**
- Consumes: `podeEscreverAssinatura` (Task 5) — lido via `localStorage` para não criar ciclo de import.
- Produces: comportamento — `salvar()` de conta suspensa grava só no cache local, nunca no Supabase nem na fila.

- [ ] **Step 1: Estender a guarda existente**

Trocar a função `somenteLeitura()` de `storage.ts` por:

```ts
// Escrita bloqueada quando: (a) Portal do Cliente (papel 'cliente') ou (b) assinatura
// suspensa. Nos dois casos a gravação fica só no cache local — os templates em iframe
// leem de lá para renderizar — e NUNCA vai ao Supabase nem para a fila offline (que
// seria drenada depois por uma sessão com permissão de escrita).
// Lê direto do localStorage (e não de auth.ts/assinatura.ts) para evitar import circular.
function somenteLeitura(): boolean {
  try {
    if ((localStorage.getItem('nr13_papel') || '') === 'cliente') return true;
    const status = localStorage.getItem('nr13_assinatura_status') || '';
    if (status === 'somente_leitura') return true;
    if (status && status !== '') {
      const ate = localStorage.getItem('nr13_assinatura_ate');
      if (ate) {
        const t = new Date(ate).getTime();
        if (Number.isFinite(t) && t <= Date.now()) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Teste manual no navegador**

1. `npm run dev`
2. No console: `localStorage.setItem('nr13_assinatura_status','somente_leitura')`
3. Editar qualquer ficha de equipamento e salvar.
4. Recarregar a página.

Expected: a alteração some ao recarregar (ficou só no cache local, não foi ao banco) e nenhuma entrada nova aparece em `nr13_fila_sync`.

- [ ] **Step 3: Commit**

```bash
git add src/services/storage.ts
git commit -m "feat(assinatura): assinatura suspensa bloqueia escrita no storage"
```

---

### Task 9: `BarraAssinatura` + `ModalAssinatura` com polling

**Files:**
- Create: `src/components/BarraAssinatura.tsx`, `src/components/ModalAssinatura.tsx`, `src/components/barra-assinatura.css`
- Modify: `src/app/Layout.tsx:232`

**Interfaces:**
- Consumes: `statusAssinaturaLocal`, `assinaturaAte`, `marcarSucessoPendente`, `sucessoPendente`, `marcarSucessoExibido` (Task 5); `emitirAviso` (Task 6); `carregarPerfil` via `verificarAcesso` de `auth.ts`.
- Produces: `<BarraAssinatura />` (sem props) e `<ModalAssinatura aberto onFechar />`.

- [ ] **Step 1: Criar a barra**

```tsx
// src/components/BarraAssinatura.tsx
import { useState } from 'react';
import { statusAssinaturaLocal, assinaturaAte } from '../services/assinatura';
import ModalAssinatura from './ModalAssinatura';
import { Icone } from './Icone';
import './barra-assinatura.css';

function diasRestantes(): number | null {
  const ate = assinaturaAte();
  if (!ate) return null;
  const ms = new Date(ate).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null;
}

// Barra fixa acima do topbar. Some quando a assinatura está ativa; o trial continua
// na BarraTrial (contagem própria de 48h).
export default function BarraAssinatura() {
  const [modal, setModal] = useState(false);
  const status = statusAssinaturaLocal();
  if (status === 'ativa' || status === 'trial') return null;

  const dias = diasRestantes();
  const texto =
    status === 'graca'
      ? `Não conseguimos cobrar seu cartão. Regularize em ${dias ?? 0} dia(s) para não perder o acesso.`
      : status === 'cancelada_no_prazo'
        ? `Assinatura cancelada. Seu acesso termina em ${dias ?? 0} dia(s).`
        : 'Sua assinatura está suspensa. O sistema está em modo somente leitura.';

  return (
    <>
      <div className={`barra-assinatura ${status}`} role="alert">
        <Icone nome="alerttri" tam={14} />
        <span>{texto}</span>
        <button type="button" onClick={() => setModal(true)}>
          {status === 'somente_leitura' ? 'Assinar agora' : 'Regularizar'}
        </button>
      </div>
      <ModalAssinatura aberto={modal} onFechar={() => setModal(false)} />
    </>
  );
}
```

```css
/* src/components/barra-assinatura.css */
.barra-assinatura {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: #dc2626;
  flex-wrap: wrap;
}

.barra-assinatura.graca { background: #d97706; }
.barra-assinatura.cancelada_no_prazo { background: #b45309; }

.barra-assinatura button {
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  border-radius: 7px;
  padding: 5px 14px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.barra-assinatura button:hover { background: rgba(255, 255, 255, 0.26); }
```

- [ ] **Step 2: Criar o modal de assinatura com polling**

```tsx
// src/components/ModalAssinatura.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { verificarAcesso, usuarioLogado } from '../services/auth';
import { statusAssinaturaLocal, marcarSucessoPendente } from '../services/assinatura';
import { emitirAviso } from '../services/eventos';
import { Icone } from './Icone';

const INTERVALO_MS = 10_000;
const LIMITE_MS = 15 * 60_000;
/** Fallback do link do checkout (plano Mensal R$ 197) se config_global não responder. */
const URL_CHECKOUT_PADRAO = 'https://pay.kiwify.com.br/O9KdzEI';

// A Kiwify não tem checkout embutido (só página hospedada), então abrimos em outra aba
// e ficamos perguntando o status ao servidor: quando o webhook chegar, a tela libera
// sozinha, sem F5 nem novo login.
export default function ModalAssinatura({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [aguardando, setAguardando] = useState(false);
  const email = usuarioLogado() ?? '';
  const [urlBase, setUrlBase] = useState(URL_CHECKOUT_PADRAO);

  // O link vive em config_global (você troca de plano sem novo deploy). Enquanto a
  // consulta não volta — ou se ela falhar — usa a constante, para o botão nunca ficar morto.
  useEffect(() => {
    if (!aberto) return;
    void supabase
      .from('config_global')
      .select('valor')
      .eq('chave', 'assinatura_checkout_url')
      .maybeSingle()
      .then(({ data }) => {
        const u = (data?.valor as { url?: string } | null)?.url;
        if (u) setUrlBase(u);
      });
  }, [aberto]);

  useEffect(() => {
    if (!aguardando) return;
    const inicio = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - inicio > LIMITE_MS) {
        setAguardando(false);
        return;
      }
      void verificarAcesso().then(() => {
        if (statusAssinaturaLocal() === 'ativa') {
          setAguardando(false);
          marcarSucessoPendente();
          emitirAviso({
            variante: 'sucesso',
            titulo: 'Assinatura confirmada!',
            texto: 'Pagamento aprovado. Salvar, imprimir e gerar documentos já estão liberados.',
          });
          onFechar();
        }
      });
    }, INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [aguardando, onFechar]);

  if (!aberto) return null;

  const uid = localStorage.getItem('nr13_uid') ?? '';
  const url = `${urlBase}?email=${encodeURIComponent(email)}&sck=${encodeURIComponent(uid)}`;

  return (
    <div className="modal-aviso-fundo" role="dialog" aria-modal="true" onClick={onFechar}>
      <div className="modal-aviso erro" onClick={(e) => e.stopPropagation()}>
        <span className="modal-aviso-ic"><Icone nome="shield" tam={30} /></span>
        <h3>Assinatura NR-13</h3>
        <p>
          Plano mensal, cobrança automática no cartão. Ao concluir o pagamento nesta nova aba,
          esta tela libera sozinha — não precisa recarregar nem entrar de novo.
        </p>
        <div className="modal-aviso-acoes">
          <button
            type="button"
            className="modal-aviso-btn principal"
            onClick={() => {
              window.open(url, '_blank', 'noopener');
              setAguardando(true);
            }}
          >
            {aguardando ? 'Aguardando confirmação…' : 'Ir para o pagamento'}
          </button>
          <button type="button" className="modal-aviso-btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Montar no Layout**

Em `src/app/Layout.tsx`, junto de `<BarraTrial />` e `<ModalAviso />`:

```tsx
          <BarraTrial />
          <BarraAssinatura />
          <ModalAviso />
```

E, no mesmo arquivo, o aviso de sucesso para quem fechou a aba antes do polling terminar
(pagou, voltou depois): o webhook já gravou `ativa`, e `carregarPerfil` no login espelha —
o Layout só precisa exibir uma vez.

```tsx
  useEffect(() => {
    if (!sucessoPendente()) return;
    if (statusAssinaturaLocal() !== 'ativa') return;
    marcarSucessoExibido();
    emitirAviso({
      variante: 'sucesso',
      titulo: 'Assinatura confirmada!',
      texto: 'Pagamento aprovado. Salvar, imprimir e gerar documentos já estão liberados.',
    });
  }, []);
```

com `import { sucessoPendente, marcarSucessoExibido, statusAssinaturaLocal } from '../services/assinatura';`
e `import { emitirAviso } from '../services/eventos';`.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Teste manual**

1. `npm run dev`; no console: `localStorage.setItem('nr13_assinatura_status','somente_leitura')` e recarregar.
2. Conferir: barra vermelha aparece; botão abre o modal; "Ir para o pagamento" abre a aba do checkout com `?email=` preenchido.
3. Simular liberação: `localStorage.setItem('nr13_assinatura_status','ativa')` e recarregar — barra some.

- [ ] **Step 6: Commit**

```bash
git add src/components/BarraAssinatura.tsx src/components/ModalAssinatura.tsx src/components/barra-assinatura.css src/app/Layout.tsx
git commit -m "feat(assinatura): barra de status e modal de checkout com polling"
```

---

### Task 10: Admin — status da assinatura e eventos órfãos

**Files:**
- Modify: `src/pages/Admin.tsx` (interface do perfil ~linha 21; tabela ~linha 1180)

**Interfaces:**
- Consumes: colunas `assinatura_status`/`assinatura_ate` e tabela `kiwify_eventos` (Task 2).
- Produces: coluna "Assinatura" na tabela de usuários e seção "Eventos Kiwify sem conta" com botão de vincular.

- [ ] **Step 1: Ler o status na consulta de perfis**

Acrescentar `assinatura_status` e `assinatura_ate` ao `select` de perfis e ao tipo `PerfilAdmin` (linha ~21):

```ts
  assinatura_status: string | null;
  assinatura_ate: string | null;
```

- [ ] **Step 2: Coluna na tabela**

Ao lado de `<BadgeDias expiraEm={p.acesso_expira_em} />` (linha ~1180):

```tsx
                  <td data-label="Assinatura">
                    <span className={`admin-badge-assinatura ${p.assinatura_status ?? 'trial'}`}>
                      {p.assinatura_status === 'ativa' ? 'Ativa'
                        : p.assinatura_status === 'graca' ? 'Em graça'
                        : p.assinatura_status === 'cancelada_no_prazo' ? 'Cancelada'
                        : p.assinatura_status === 'somente_leitura' ? 'Suspensa'
                        : 'Trial'}
                    </span>
                  </td>
```

Acrescentar o `<th>Assinatura</th>` correspondente no cabeçalho da tabela.

- [ ] **Step 3: Seção de eventos órfãos**

Nova seção na página, carregada com:

```ts
const { data } = await supabase
  .from('kiwify_eventos')
  .select('id, recebido_em, evento, email, subscription_id')
  .is('profile_id', null)
  .order('recebido_em', { ascending: false })
  .limit(50);
```

Cada linha mostra data, evento e e-mail, com um `select` de usuários e botão **Vincular** que faz:

```ts
await supabase.from('profiles')
  .update({ assinatura_status: 'ativa', assinatura_ate: proximaData, kiwify_email: emailDoEvento })
  .eq('id', usuarioEscolhido);
await supabase.from('kiwify_eventos').update({ profile_id: usuarioEscolhido, processado: true }).eq('id', eventoId);
```

onde `proximaData` = agora + 30 dias em ISO.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat(admin): status da assinatura e vinculo de eventos orfaos"
```

---

### Task 11: Implantação e captura do payload real

Esta task é **operacional** (executada pelo dono do projeto, com o agente acompanhando) e fecha o ciclo: sem ela, nada libera sozinho.

**Files:** nenhum código novo, exceto o ajuste do parser no passo 6.

- [ ] **Step 1: Rodar o SQL**

`supabase/assinatura_setup.sql` no SQL Editor do projeto `qqsesrntfvmdxqxrfvmw`. Antes, trocar `TROQUE-ESTE-VALOR` por um segredo longo aleatório.

- [ ] **Step 2: Conferir o backfill**

```sql
select assinatura_status, count(*) from public.profiles group by 1;
```

Expected: nenhuma conta paga em `trial` ou `somente_leitura` indevidamente.

- [ ] **Step 3: Deploy da Edge Function**

Dashboard → Edge Functions → nova função `kiwify_webhook` com `index.ts` e `parser.ts`.

- [ ] **Step 4: Cadastrar o webhook na Kiwify**

Apps → Webhooks → novo, URL `https://qqsesrntfvmdxqxrfvmw.supabase.co/functions/v1/kiwify_webhook?s=<segredo>`, marcando os 6 eventos: `compra_aprovada`, `subscription_renewed`, `subscription_late`, `subscription_canceled`, `compra_reembolsada`, `chargeback`.

- [ ] **Step 5: Compra de teste**

Usar o link `tteste` (R$ 5) com o e-mail de uma conta de teste. Depois:

```sql
select recebido_em, evento, email, subscription_id, profile_id, processado, erro, payload
  from public.kiwify_eventos order by recebido_em desc limit 5;
```

- [ ] **Step 6: Ajustar o parser com o payload real**

Se `email`/`evento` vieram nulos, acrescentar o caminho real do payload nas listas de `primeiraString` em `parser.ts`, **com um teste novo** usando o payload capturado como fixture. Rodar `npx vitest run`, redeployar a função e repetir o passo 5 até `processado = true`.

- [ ] **Step 7: Commit do ajuste**

```bash
git add supabase/functions/kiwify_webhook/parser.ts src/features/assinatura/__tests__/kiwifyParser.test.ts
git commit -m "fix(assinatura): parser ajustado ao payload real da Kiwify"
```

---

## Ordem e dependências

```
Task 1 (máquina) ─┬─> Task 3 (parser) ──> Task 4 (edge function) ──┐
                  └─> Task 5 (serviço) ──> Task 6 (ModalAviso) ──> Task 7 (alerts)
Task 2 (SQL) ─────────────────────────────────────────────────────┤
                                    Task 5 ──> Task 8 (storage)    │
                                    Task 5,6 ─> Task 9 (barra/modal)│
                                    Task 2 ───> Task 10 (admin)     │
                                                                    └─> Task 11 (deploy)
```

Tasks 1, 2 e 3 são independentes entre si e podem ser feitas em qualquer ordem.
