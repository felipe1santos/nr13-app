# PLANO — Controle de Acesso (multi-papel) + Portal do Cliente + Sessão Única

> **Status:** próxima etapa do projeto (planejado, ainda não implementado).
> **Fonte de verdade de estrutura:** `CLAUDE.md`. Este plano detalha a fase de controle de acesso.

---

## 1. Objetivo

Criar controle de acesso dentro do sistema, com sub-logins gerenciados por um botão **"Acesso"**
no painel, e um **portal separado para o cliente final** (dono do equipamento). Requisitos do usuário:

- **Funcionário de campo:** preenche inspeções em campo (foco no botão "Inspeções").
- **Gerente:** visualiza tudo que está salvo no sistema e **gerencia todos os ativos**.
- **Mestre (conta principal):** mexe em tudo, edita tudo, e **gerencia os acessos** (cria sub-logins).
- **Cliente final:** painel próprio, **só leitura**, vê **apenas os ativos que pertencem a ele**;
  dentro de cada ativo vê abas no lado direito — Documentação, Anotações, Registros de Inspeção —
  no estilo das telas `img1.jpeg` / `img2.jpeg`, **mas com o design do nosso sistema prevalecendo**.
- **Sessão única (todos os papéis, inclusive o mestre):** duas pessoas **não** podem usar o mesmo
  login/senha ao mesmo tempo. Login simultâneo é bloqueado.

---

## 2. O que já existe e será reaproveitado

| Peça | Onde | Reuso |
|---|---|---|
| Auth e-mail/senha + perfil | `src/services/auth.ts`, tabela `public.profiles` | Base do login. |
| Super-admin da plataforma | `profiles.role` = `admin`/`user` (perone.fs) | **Mantém intacto.** Não confundir com "mestre". |
| Painel admin da plataforma | `/admin`, `src/pages/Admin.tsx` | Inalterado. |
| Edge Function service_role | `supabase/functions/admin/index.ts` | Padrão a clonar para `org_admin`. |
| Storage key-value | `app_storage` + `src/services/storage.ts` | **Vai mudar:** isolar por **org**, não por user. |
| Eventos/métricas | `login_events`, sessão | Reuso; `sessao_id` evolui p/ sessão única. |
| Vínculo cliente↔ativo | `nr13_emp_<TAG>.clienteId` → `nr13_clientes[]` | Base do filtro do portal do cliente. |

> **Distinção crítica de nomenclatura.** Existem DOIS níveis de papel, ortogonais:
> - `profiles.role` (`admin` | `user`) = **dono da plataforma SaaS** (perone.fs). NÃO mexer.
> - `profiles.papel` (`mestre` | `gerente` | `funcionario` | `cliente`) = **papel dentro da
>   organização executante**. É o que este plano introduz.

---

## 3. Conceito central: Organização (tenant)

Hoje cada conta Supabase é um silo: `app_storage` é isolado por `user_id` (RLS). Se um funcionário
logar com conta própria, cai num storage **vazio** — não enxerga os equipamentos da empresa.

**Solução:** introduzir `org_id`. A organização = a empresa executante. A conta que se cadastra hoje
vira o **mestre** e dona da org (`org_id = id do próprio mestre`). Todo sub-login (gerente,
funcionário, cliente) recebe o **mesmo `org_id`** e passa a compartilhar o mesmo escopo de dados.
A RLS de `app_storage` deixa de ser por `user_id` e passa a ser por `org_id`, com permissão de
escrita variando por `papel`.

```
auth.users ─1:1─ profiles { org_id, papel, cliente_id, ... }
                     │
            org_id ──┴──► app_storage (todas as chaves nr13_* da empresa)
```

---

## 4. Modelo de dados (SQL — novo arquivo `supabase/acesso_setup.sql`, idempotente)

### 4.1 Novas colunas em `profiles`

```sql
alter table public.profiles add column if not exists org_id        uuid;
alter table public.profiles add column if not exists papel         text not null default 'mestre';
                                  -- 'mestre' | 'gerente' | 'funcionario' | 'cliente'
alter table public.profiles add column if not exists cliente_id    text;     -- só papel='cliente'
alter table public.profiles add column if not exists criado_por    uuid;     -- mestre que criou
-- Sessão única:
alter table public.profiles add column if not exists sessao_token  text;
alter table public.profiles add column if not exists sessao_visto_em timestamptz;

-- Backfill: contas existentes viram mestre e org de si mesmas.
update public.profiles set org_id = id     where org_id is null;
update public.profiles set papel  = 'mestre' where papel is null;
```

### 4.2 `app_storage` — coluna `org_id` + backfill

```sql
alter table public.app_storage add column if not exists org_id uuid;
-- Hoje cada linha pertence ao user que a criou, que vira o próprio mestre/org:
update public.app_storage s
   set org_id = p.org_id
  from public.profiles p
 where p.id = s.user_id and s.org_id is null;
create index if not exists app_storage_org_idx on public.app_storage (org_id, chave);
```

### 4.3 Helpers SQL (`security definer`, evitam recursão de RLS)

```sql
create or replace function public.org_atual() returns uuid
  language sql security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.papel_atual() returns text
  language sql security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid();
$$;
```

### 4.4 RLS de `app_storage` por org + papel

```sql
-- Substitui as policies antigas (que eram por user_id):
drop policy if exists app_storage_rw_own on public.app_storage;  -- (nome real a confirmar)

-- LEITURA: todo membro da org lê os dados da org.
create policy app_storage_select_org on public.app_storage
  for select using (org_id = public.org_atual());

-- ESCRITA: mestre tudo; gerente e funcionário conforme matriz (§8) — refinar por prefixo de chave
-- na aplicação; na RLS garantimos no mínimo "pertence à org E papel pode escrever".
create policy app_storage_write_org on public.app_storage
  for all using (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  ) with check (
    org_id = public.org_atual()
    and public.papel_atual() in ('mestre','gerente','funcionario')
  );
-- cliente NÃO entra na policy de escrita → portal é somente-leitura por construção.
```

> **Granularidade de escrita por papel (gerente/funcionário) é feita na aplicação** (§8). A RLS
> garante o limite duro: pertencer à org e não ser cliente. Refino por prefixo de chave em RLS é
> possível depois (ex.: funcionário só grava `nr13_inspecao_*`), mas começa na aplicação p/ não
> travar o MVP.

### 4.5 Trigger de novo usuário

O trigger atual (`handle_new_user`) cria profile com `ativo=false`. Para sub-logins, a Edge Function
`org_admin` (§5) já grava `org_id`, `papel`, `cliente_id` e `ativo=true` logo após criar — então o
trigger só precisa **não** sobrescrever esses campos quando já vierem definidos. Ajustar o
`on conflict` para preservar `org_id`/`papel` se já setados.

---

## 5. Backend — Edge Functions (service_role)

### 5.1 `org_admin` (clonar de `functions/admin/index.ts`)

Permite que um **mestre** gerencie os sub-logins **da própria org** (não exige `role=admin` da
plataforma). Autentica o Bearer token, confere `papel='mestre'`, e força `org_id` = org do mestre em
toda criação (o mestre nunca cria fora da própria org).

Ações:
- `criar_subusuario { email, senha, papel }` → cria user confirmado, `profiles.org_id = org do mestre`,
  `papel`, `ativo=true`, `criado_por = mestre`.
- `criar_acesso_cliente { email, senha, cliente_id }` → cria user `papel='cliente'`, `org_id` da org,
  `cliente_id`.
- `listar_subusuarios` → lista profiles `where org_id = org do mestre and id <> mestre`.
- `resetar_senha { user_id }`, `bloquear/liberar { user_id, ativo }`, `excluir { user_id }`
  — todas validando que o alvo pertence à org do mestre (evita um mestre mexer em outra org).

> Segredo `SUPABASE_SERVICE_ROLE_KEY` já existe no ambiente das Edge Functions. Mesmo padrão de CORS
> e validação do `admin` atual.

### 5.2 `portal_cliente` (recomendado p/ segurança do portal)

O portal do cliente precisa de **apenas** as chaves dos ativos daquele cliente. Como o vínculo
ativo→cliente vive dentro do `app_storage` (`nr13_emp_<TAG>.clienteId`), a RLS pura não filtra bem
por cliente. Função server-side:

- Autentica o cliente (Bearer), lê `cliente_id` e `org_id` do profile.
- Carrega `nr13_clientes` e todos os `nr13_emp_<TAG>` da org, resolve as TAGs cujo `clienteId == cliente_id`.
- Retorna **somente** as chaves `*_<TAG>` dessas TAGs (info, fotos, memorial, inspeções, relatórios
  salvos, etc.) + globais públicas necessárias (logo `nr13_minha_empresa`).

> **Por quê Edge Function e não RLS direta:** sem isso, um cliente com DevTools poderia ler chaves de
> outros clientes da mesma org. A função fecha o vazamento server-side. **Decisão em aberto (§10):**
> aceitar RLS "org inteira em leitura p/ cliente" no MVP (mais simples, menos seguro) vs. já fazer a
> Edge Function (recomendado).

---

## 6. Frontend

### 6.1 `auth.ts`
- `carregarPerfil()` passa a ler também `papel`, `org_id`, `cliente_id`; grava em cache local
  (`nr13_papel`, `nr13_org_id`, `nr13_cliente_id`) p/ leitura síncrona no render.
- Novos helpers: `papelAtual()`, `isMestre()`, `isGerente()`, `isFuncionario()`, `isCliente()`,
  `orgAtual()`, `podeEscrever(prefixoChave)`.
- `login()` ganha o passo de **sessão única** (§7) e o redirecionamento por papel (cliente → portal).

### 6.2 `storage.ts` — escopo por org (mudança estrutural mais sensível)
- `lerTudo`, `salvar`, `excluirChave`, `excluirVaso` passam a usar **`org_id`** (de `orgAtual()`) no
  lugar de `user_id` no filtro/upsert do `app_storage`.
- `nr13_cache_owner` passa a guardar o **`org_id`** (não o user). Assim dois sub-logins da mesma org
  compartilham cache sem zerar um ao outro; troca de org continua limpando o cache.
- `CHAVES_PRESERVADAS` ganha `nr13_papel`, `nr13_org_id`, `nr13_cliente_id`.
- **Cliente:** usa `portal_cliente` (§5.2) em vez de `lerTudo`, ou um `lerTudoCliente()` que chama a
  função e hidrata só as chaves liberadas.

### 6.3 Rotas e guards (`router.tsx`)
- Novo guard `RotaPapel({ papeis })` que libera só os papéis informados (reusa padrão de `RotaAdmin`).
- Nova árvore `/portal/*` (portal do cliente) **fora** do `Layout` do sistema, com layout próprio
  (somente-leitura), guard `papel='cliente'`.
- `RotaUsuario` (sistema interno) passa a barrar `cliente` (manda p/ `/portal`) além de já barrar o
  super-admin da plataforma.
- Redirecionamento pós-login: `mestre/gerente/funcionario` → `/dashboard`; `cliente` → `/portal`;
  `role=admin` (plataforma) → `/admin` (como hoje).

### 6.4 Painel "Acesso" (só **mestre**) — `src/pages/Acesso.tsx`
- Novo item no `MENU` da sidebar (`Layout.tsx`): **"Acesso"** (ícone de chave/usuários), renderizado
  **só se `isMestre()`**.
- Tela CRUD de sub-logins da org via `org_admin`:
  - Criar: e-mail, senha, **papel** (gerente | funcionário). Mestre é único (a própria conta).
  - Lista: e-mail, papel, status, último acesso, **sessão ativa** (em uso/livre).
  - Ações: resetar senha, bloquear/liberar, excluir, trocar papel.
- Reusa visual de `admin.css`/`cadastros.css`.

### 6.5 Empresas — criar acesso do cliente (`Empresas.tsx`)
- No card/edição da empresa cadastrada, seção **"Acesso ao Portal"**: campos e-mail + senha e botão
  **"Criar acesso do cliente"** → `org_admin.criar_acesso_cliente { cliente_id }`.
- Mostrar estado: "Acesso criado (e-mail)" + ações resetar senha / revogar.
- Só **mestre** (e talvez gerente, §8) vê essa seção.

### 6.6 Portal do cliente — `src/pages/portal/*`
- **Layout próprio** (`PortalLayout`): topo enxuto com logo da executante (`nr13_minha_empresa`),
  nome do cliente, "Sair". Sem a sidebar de ferramentas internas. Design do nosso sistema (mesmas
  variáveis CSS/tokens), **não** copiar o visual do rglsafety — só a **ideia** de abas no lado direito.
- **`PortalAtivos`** (lista): cards/tabela dos ativos do cliente (filtra TAGs por `clienteId`),
  estilo da `img2` mas com nosso design — coluna status, descrição, categoria.
- **`PortalAtivo`** (detalhe): à esquerda o resumo do equipamento (foto, categoria, PMTA, localização);
  à direita um painel de **abas**:
  - **Documentação** — relatórios/prontuários salvos do ativo (visualização/PDF, read-only).
  - **Anotações** — campo de anotações por ativo (decisão §10: cliente só lê, ou pode comentar?).
  - **Registros de Inspeção** — histórico de inspeções (datas, tipo, resultado/laudo).
  - (Opcional, espelhando img1: Acessórios, Contratos, Registros de Ocorrência, Time Line.)
- **Somente leitura.** Nenhum botão de edição. Dados vêm de `portal_cliente` (§5.2).

---

## 7. Sessão única (vale para TODOS, inclusive o mestre)

Supabase Auth permite múltiplas sessões simultâneas por padrão; o bloqueio é feito na camada do app
com um **lock por heartbeat** em `profiles`.

**Campos:** `sessao_token` (uuid da sessão dona) + `sessao_visto_em` (heartbeat).

**No login (`auth.ts`, após `signInWithPassword` e gate de ativo/expiração):**
1. Lê `sessao_token` + `sessao_visto_em` do próprio profile.
2. Se `sessao_token` existe **e** `sessao_visto_em` é recente (< `LIMITE`, ex. 90s) → **bloqueia**:
   `signOut()` + erro *"Esta conta já está em uso em outro dispositivo."*
3. Senão (sem token, ou heartbeat velho = sessão abandonada) → **assume**: gera novo uuid, grava
   `sessao_token = meu`, `sessao_visto_em = now()`, guarda o uuid em `localStorage` (`nr13_sessao_token`).

**Durante o uso:**
- **Heartbeat:** a cada ~30s, `update profiles set sessao_visto_em = now() where id = me and sessao_token = meu`.
- **Detecção de tomada:** a cada heartbeat (ou via **Supabase Realtime** no próprio profile, instantâneo)
  comparar `sessao_token` do servidor com o local; se **diferente**, outra sessão assumiu → forçar
  logout local com aviso *"Sua sessão foi encerrada: a conta foi aberta em outro dispositivo."*

**No logout:** `update profiles set sessao_token = null, sessao_visto_em = null where id = me and sessao_token = meu`.

**Por que heartbeat + timeout:** se a aba fecha sem logout, o lock ficaria preso para sempre; o
timeout (90s sem heartbeat) libera a conta para o próximo login. `LIMITE` e intervalo do heartbeat
são ajustáveis.

> RLS já permite o próprio usuário atualizar seu profile (`profiles_update_own`), então o heartbeat
> funciona sem Edge Function. É best-effort (cliente coopera), mas atende o requisito de impedir uso
> simultâneo na operação real.

---

## 8. Matriz de permissões por papel (proposta — confirmar §10)

| Recurso | Mestre | Gerente | Funcionário | Cliente |
|---|:--:|:--:|:--:|:--:|
| Ver tudo que está salvo | ✅ | ✅ | ✅ (leitura) | ✅ só os ativos dele |
| Equipamentos/Ativos (criar/editar/excluir) | ✅ | ✅ | ❌ (só ver) | ❌ |
| Empresas cadastradas (CRUD) | ✅ | ✅ | ❌ | ❌ |
| Inspeções de campo (criar/preencher/fotos) | ✅ | ✅ | ✅ | ❌ |
| Memorial / cálculo | ✅ | ✅ | ❌ | ❌ |
| Gerar/editar Relatórios e Prontuários | ✅ | ✅ (ver) / ❓editar | ❌ | ❌ (só ver no portal) |
| Calibrações | ✅ | ✅ | ❌ | ❌ |
| Minha Empresa (logo/dados executante) | ✅ | ❌ | ❌ | ❌ |
| **Acesso** (gerir sub-logins) | ✅ | ❌ | ❌ | ❌ |
| Criar acesso de cliente (em Empresas) | ✅ | ❓ | ❌ | ❌ |

Aplicação: helper `podeEscrever(prefixoChave)` por papel + esconder botões/itens de menu por papel.
RLS garante o piso (org + não-cliente p/ escrita).

---

## 9. Migração / rollout faseado

1. **Fase 0 — SQL (sem quebrar o atual):** rodar `acesso_setup.sql` (colunas, backfill `org_id`,
   helpers, novas policies de `app_storage` por org). Como `org_id = user_id` no backfill, o sistema
   atual segue idêntico (cada mestre só vê os próprios dados).
2. **Fase 1 — storage.ts por org + cache_owner = org_id.** Sem mudança visível p/ contas existentes.
3. **Fase 2 — Edge `org_admin` + Painel "Acesso"** (criar gerente/funcionário). Testar sub-login
   compartilhando dados da org.
4. **Fase 3 — Sessão única** (campos + login gate + heartbeat + kick).
5. **Fase 4 — Acesso do cliente em Empresas + Edge `portal_cliente`.**
6. **Fase 5 — Portal do cliente** (layout, lista de ativos, abas) — somente leitura.
7. **Fase 6 — Refino de permissões por prefixo de chave** (gerente/funcionário) e auditoria.

Cada fase é independente e reversível; nada quebra o fluxo atual antes da Fase 2.

---

## 10. Decisões em aberto (confirmar antes de implementar)

1. **Gerente edita relatórios/prontuários** ou só visualiza? (req. diz "apenas visualizar o que está
   salvo" mas também "gerenciar todos os ativos" — assumido: edita ativos, só vê documentos finais.)
2. **Funcionário** pode ver relatórios/prontuários finais, ou só o módulo Inspeções? (assumido: vê
   equipamentos + faz inspeções; não gera documento final.)
3. **Segurança do portal do cliente:** Edge `portal_cliente` (recomendado) vs. RLS de leitura da org
   inteira no MVP (mais simples, menos seguro).
4. **Aba "Anotações" do cliente:** somente leitura, ou o cliente pode escrever comentários/observações?
5. **Limite da sessão única (`LIMITE`)** e intervalo do heartbeat (sugestão: 90s / 30s).
6. **Gerente pode criar acesso de cliente** em Empresas, ou só o mestre?
7. **Quantos sub-logins por org** (limite por plano?) — hoje sem limite.

---

## 11. Checklist de implementação (resumo)

- [ ] `supabase/acesso_setup.sql` — colunas, backfill, helpers, RLS por org. (Fase 0)
- [ ] `storage.ts` — escopo por `org_id`; `cache_owner = org_id`. (Fase 1)
- [ ] `supabase/functions/org_admin/index.ts` — CRUD sub-logins/cliente da org. (Fase 2)
- [ ] `auth.ts` — papel/org no cache, helpers, redirecionamento por papel. (Fase 2)
- [ ] `src/pages/Acesso.tsx` + item de menu só-mestre na sidebar. (Fase 2)
- [ ] Sessão única: campos SQL + gate no login + heartbeat + kick (Realtime/poll). (Fase 3)
- [ ] `Empresas.tsx` — seção "Acesso ao Portal" (criar/resetar/revogar cliente). (Fase 4)
- [ ] `supabase/functions/portal_cliente/index.ts` — entrega filtrada por cliente. (Fase 4)
- [ ] `RotaPapel` + árvore `/portal/*`; `RotaUsuario` barra cliente. (Fase 5)
- [ ] Portal: `PortalLayout`, `PortalAtivos`, `PortalAtivo` (abas Documentação/Anotações/Inspeções). (Fase 5)
- [ ] Refino de permissões por prefixo + auditoria responsiva mobile. (Fase 6)
```
