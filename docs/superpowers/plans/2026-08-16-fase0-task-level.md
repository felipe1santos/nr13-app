# Fase 0 — Task-level

> **Para executores:** este plano implementa a **Fase 0** do roteiro macro
> (`2026-08-15-evolucao-arquitetura.md`). Passos com checkbox são executados em ordem.
> Nenhum passo pula o portão que o precede.

**Goal:** fechar o isolamento do Portal do Cliente no servidor, e antes disso fechar a
origem fail-open da criação de perfis que a pré-condição D-24 encontrou.

**Spec:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (Fase 0, D-04, D-05, D-24, D-26)

---

## Resultado das pré-condições (executadas em 16/08/2026, read-only)

### Pré-condição 0.a (D-24) — auditoria dos caminhos de criação de `profiles`

**VEREDITO: Resultado B.** Existe caminho que cria perfil com `papel` implícito.

| # | Caminho | Grava `papel`? | Evidência |
|---|---|---|---|
| 1 | `handle_new_user()` | ❌ **NÃO** | `admin_setup.sql:69` — `insert into public.profiles (id, email, ativo, role)`. `papel` omitido → `default 'mestre'` |
| 2 | Backfill do admin | ❌ NÃO | `admin_setup.sql:114` — mesmo insert, só para `perone.fs@gmail.com` (admin da plataforma; mestre é o correto) |
| 3 | Edge `org_admin` | ✅ sim, **mas DEPOIS** | `org_admin/index.ts:161-166` — `upsert` com `papel` após `createUser()` |
| 4 | Edge `trial` | ✅ sim (update) | opera sobre perfil já criado pelo trigger |
| 5 | Frontend `signUp` × 2 | ❌ NÃO | `auth.ts:395`, `auth.ts:459` — sem metadata de papel; depende do trigger |
| 6 | `insert`/`upsert` em `profiles` no bundle | ✅ nenhum | busca global: zero ocorrências |
| 7 | Policy `profiles_insert_self` | ⚠️ permite | `admin_setup.sql` — `for insert with check (id = auth.uid())`. Sem `ON CONFLICT`, falha se a linha existe |
| 8 | `profiles_update_own` | ✅ protegido | `trg_proteger_campos_sensiveis` reverte `papel`/`org_id`/`cliente_id`/`role` para `authenticated` não-admin |
| 9 | `trg_definir_org_padrao` | — | `before insert on profiles`: `org_id := new.id` se nulo |

**A janela fail-open, medida no código:**

```
org_admin.criar_subusuario / criar_acesso_cliente:
  1. admin.auth.admin.createUser()
       └─> trigger on_auth_user_created
             └─> handle_new_user() insere profile SEM papel
                   └─> papel = 'mestre'  (default)
                   └─> trg_definir_org_padrao: org_id = próprio id
  2. admin.from('profiles').upsert({ papel, org_id, cliente_id, criado_por })
       └─> corrige

  Se o passo 2 FALHAR: o usuário existe no Auth (senha definida,
  email_confirm: true) com perfil papel='mestre', org_id=próprio id.
  Ele consegue logar. É mestre de uma organização vazia.
```

**O próprio `org_admin` já conhece esse estado** e o trata como órfão adotável
(`index.ts:145-146`): `criado_por === null && org_id === próprio id && papel === 'mestre'`.
Ou seja, a janela é conhecida e compensada na retentativa — mas não eliminada.

**Gravidade real, para calibrar a resposta:** o perfil órfão nasce com `org_id = próprio
id`, **não** com a org do inspetor. Ele não lê dado de ninguém — não amplia o A-01. O
defeito é de princípio (origem fail-open) e de estado inconsistente, não vazamento. Isso
justifica corrigir com cuidado e sem pânico, mas **corrigir antes das policies**, como a
D-24 determina.

### Pré-condição 0.d — mapa de acesso direto do Portal ao Supabase

**Muito maior que o previsto.** O macro plano antecipava só o `FotoImg`. São quatro
famílias de acesso, e uma delas lê `app_storage` direto.

| # | Origem no Portal | Cadeia | Quebra com a policy? |
|---|---|---|---|
| 1 | `FotoImg` (lista, capa, componentes, galeria) | `resolverFoto` → `urlAssinada` → `storage.createSignedUrl` | ✅ **sim** |
| 2 | `VisualizadorPdf`, `baixarPdfArquivado`, `imprimirPdfArquivado` | `baixarArtefato` → `baixarFoto` → `storage.download` | ✅ **sim** |
| 3 | `abrirProntuarioFabricante` | `resolverPdfFabricante` → `baixarFoto` → `storage.download` | ✅ **sim** |
| 4 | `AnexosRastreabPreview` | `resolverPdf` → `baixarFoto` → download **e** `lerRemoto` → `from('app_storage').select()` | ✅ **sim, nos dois** |

**A boa notícia — o ponto de estrangulamento é estreito.** As quatro famílias passam por
**três funções**:

- `fotos.urlAssinada(path)` — `fotos.ts:290`
- `fotos.baixarFoto(ref)` — `fotos.ts:342`
- `storageV2.lerRemoto(chave)` — `storageV2.ts:390`

Rotear essas três pela Edge quando o papel é `cliente` corrige os quatro call sites **sem
tocar em nenhum componente de UI do Portal**. É o desenho adotado.

**Limpo, sem acesso direto:** `RotaCliente.tsx`, `PortalLayout.tsx`, `PortalAtivos.tsx`,
`portalService.ts` (só chama a Edge), `arquivoCalibracao` (só devolve nome de arquivo).

---

## Consequência: a Fase 0 tem DOIS deploys

A D-24 exige que a correção da origem seja deployada e validada **antes** das policies
(subetapa `0.c`). Isso não é opcional e não pode ser fundido.

| Parte | Subetapas | Entrega | Portão |
|---|---|---|---|
| **0-A** | 0.a ✅ · 0.b · 0.c | Origem fail-open corrigida | **P1-A** |
| **0-B** | 0.d ✅ · 0.e · 0.f | Edge + frontend + policies | **P1-B** |

**Este documento cobre a Parte 0-A.** O task-level da 0-B é escrito depois do P1-A, já com
o resultado da validação em produção da 0-A em mãos.

---

## Desenho da correção da origem (0.b)

**Princípio:** o perfil nasce com o papel certo, em vez de nascer errado e ser corrigido.
Elimina a janela em vez de compensá-la.

```
ANTES
  createUser()  →  trigger  →  papel = default 'mestre'  →  upsert corrige
                                    └─ janela ─┘

DEPOIS
  createUser({ user_metadata: { papel, org_id, cliente_id } })
        →  trigger LÊ a metadata  →  papel correto DESDE O INSERT
        →  upsert vira confirmação, não correção
```

**Compatibilidade nas duas direções, e é isso que torna cada passo seguro:**

| Situação | Comportamento |
|---|---|
| Trigger novo + Edge antiga (sem metadata) | metadata ausente → `'mestre'` + org própria = **exatamente o de hoje** |
| Trigger antigo + Edge nova (com metadata) | trigger ignora a metadata = **exatamente o de hoje** |
| Trigger novo + Edge nova | perfil nasce correto — o ganho |

Nenhum passo depende do outro para não quebrar. Podem ser deployados em qualquer ordem.

**O que NÃO entra na 0-A:** trocar o default de `papel` para `'sem_papel'`. Ela só é segura
depois que **todo** caminho passar metadata explícita — inclusive os dois `signUp` do
frontend, que também são corrigidos aqui. Fica registrada como **0.b-4**, executada só
depois de a 0-A estar validada em produção, e com o frontend novo já em campo.

---

## Global Constraints

- `npm test` verde (baseline: 69 arquivos, 909 testes) · `npm run build` limpo · `npm run lint` sem erro novo.
- Nenhum teste existente afrouxado.
- SQL idempotente; aplicado **manualmente pelo dono**, nunca por mim.
- Nenhum experimento em organização/equipamento real.
- `service_role` só em Edge.
- Invariantes I-01…I-26 preservados. Esta parte não toca em fila, cache, palco, PDF nem livro.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/perfil_origem.sql` | **criar** — `handle_new_user` honrando metadata; idempotente |
| `supabase/perfil_origem_rollback.sql` | **criar** — restaura a versão atual do trigger |
| `supabase/functions/org_admin/index.ts` | **modificar** — passar `user_metadata` no `createUser` |
| `src/services/auth.ts` | **modificar** — os dois `signUp` passam `data: { papel: 'mestre' }` |
| `src/services/__tests__/perfilOrigem.test.ts` | **criar** — contrato da metadata de criação |
| `src/services/perfilOrigem.ts` | **criar** — a metadata como função pura, testável e compartilhada |

**Por que uma função pura em `perfilOrigem.ts`:** a metadata é montada em três lugares (dois
`signUp` no frontend, um `createUser` na Edge). Duplicar o formato em três pontos é o mesmo
defeito que a paridade `familiasChave`↔Edge combate na Fase 4. A Edge não importa de `src/`
(runtime diferente), então lá o formato é replicado — e o teste de paridade cobre.

---

## Task 1 — Metadata de origem do perfil (função pura + teste)

**Files:**
- Create: `src/services/perfilOrigem.ts`
- Create: `src/services/__tests__/perfilOrigem.test.ts`

**Interfaces:**
- Produz: `metadataPerfil(papel, opcoes?) => Record<string, string>`, `PAPEIS_VALIDOS`, `papelValido(v) => boolean`

- [ ] **Passo 1.1 — escrever o teste que falha**

```ts
// src/services/__tests__/perfilOrigem.test.ts
import { describe, expect, it } from 'vitest';
import { metadataPerfil, papelValido, PAPEIS_VALIDOS } from '../perfilOrigem';

describe('metadataPerfil', () => {
  it('mestre auto-cadastrado não carrega org nem cliente', () => {
    expect(metadataPerfil('mestre')).toEqual({ nr13_papel: 'mestre' });
  });

  it('sub-login carrega o papel e a organização', () => {
    expect(metadataPerfil('funcionario', { orgId: 'org-1' })).toEqual({
      nr13_papel: 'funcionario',
      nr13_org_id: 'org-1',
    });
  });

  it('cliente carrega papel, organização e cliente_id', () => {
    expect(metadataPerfil('cliente', { orgId: 'org-1', clienteId: 'cli-9' })).toEqual({
      nr13_papel: 'cliente',
      nr13_org_id: 'org-1',
      nr13_cliente_id: 'cli-9',
    });
  });

  it('campo vazio nunca vai para a metadata', () => {
    expect(metadataPerfil('gerente', { orgId: '', clienteId: '' })).toEqual({
      nr13_papel: 'gerente',
    });
  });
});

describe('papelValido', () => {
  it('aceita exatamente os quatro papéis do sistema', () => {
    expect([...PAPEIS_VALIDOS]).toEqual(['mestre', 'gerente', 'funcionario', 'cliente']);
  });

  it('recusa papel desconhecido, vazio e caixa trocada', () => {
    expect(papelValido('auditor_externo')).toBe(false);
    expect(papelValido('')).toBe(false);
    expect(papelValido('MESTRE')).toBe(false);
  });
});
```

- [ ] **Passo 1.2 — rodar e ver falhar**

`npx vitest run src/services/__tests__/perfilOrigem.test.ts`
Esperado: falha com "Cannot find module '../perfilOrigem'".

- [ ] **Passo 1.3 — implementar o mínimo**

```ts
// src/services/perfilOrigem.ts
/**
 * Metadata de origem do perfil, lida pelo trigger `handle_new_user`.
 *
 * POR QUE EXISTE (16/08/2026): `handle_new_user` inseria o profile SEM `papel`,
 * então toda conta nova nascia `mestre` pelo default da coluna, e só depois a
 * Edge `org_admin` corrigia com um upsert. Entre as duas coisas havia uma
 * janela — e, se o upsert falhasse, o sub-login ficava mestre para sempre.
 *
 * Com a metadata, o trigger insere o papel certo já no INSERT: a janela deixa
 * de existir em vez de ser compensada na retentativa.
 *
 * O prefixo `nr13_` evita colisão com metadata do próprio Supabase.
 */
export const PAPEIS_VALIDOS = ['mestre', 'gerente', 'funcionario', 'cliente'] as const;

export type Papel = (typeof PAPEIS_VALIDOS)[number];

/** Comparação SENSÍVEL A CAIXA: 'MESTRE' não é papel válido (ver D-04). */
export function papelValido(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Campo vazio NUNCA entra: o trigger distingue "ausente" de "vazio", e uma
 * string vazia viraria `org_id = ''`, que não casa com organização nenhuma.
 */
export function metadataPerfil(
  papel: Papel,
  opcoes: { orgId?: string; clienteId?: string } = {},
): Record<string, string> {
  const meta: Record<string, string> = { nr13_papel: papel };
  if (opcoes.orgId) meta.nr13_org_id = opcoes.orgId;
  if (opcoes.clienteId) meta.nr13_cliente_id = opcoes.clienteId;
  return meta;
}
```

- [ ] **Passo 1.4 — rodar e ver passar**

`npx vitest run src/services/__tests__/perfilOrigem.test.ts` → 6 testes passando.

- [ ] **Passo 1.5 — commit**

```bash
git add src/services/perfilOrigem.ts src/services/__tests__/perfilOrigem.test.ts
git commit -m "feat(perfil): metadata de origem do perfil, com papel explícito"
```

---

## Task 2 — Os dois `signUp` do frontend passam o papel

**Files:**
- Modify: `src/services/auth.ts:395` (cadastro normal) e `:459` (trial)
- Test: `src/services/__tests__/perfilOrigem.test.ts` (estender)

**Interfaces:**
- Consome: `metadataPerfil` da Task 1

- [ ] **Passo 2.1 — ler os dois pontos antes de tocar**

`Read src/services/auth.ts` nas faixas `385-410` e `450-480`. Registrar o que cada `signUp`
já passa em `options.data` — se já houver metadata, a nova entra **junto**, nunca por cima.

- [ ] **Passo 2.2 — escrever o teste que falha**

Teste do formato final da metadata do auto-cadastro (papel mestre, sem org, sem cliente):

```ts
it('auto-cadastro (signUp) declara mestre e nada mais', () => {
  // O signUp de conta nova cria a própria organização: sem orgId, sem clienteId.
  expect(metadataPerfil('mestre')).toEqual({ nr13_papel: 'mestre' });
});
```

- [ ] **Passo 2.3 — aplicar nos dois `signUp`**

Em cada um, acrescentar `nr13_papel: 'mestre'` a `options.data`, **preservando** o que já
estiver lá. Comentário no ponto:

```ts
// Papel EXPLÍCITO na origem: sem isto o profile nasce pelo default da coluna
// (`'mestre'`), e a conta fica correta por acidente em vez de por decisão.
// Ver docs/.../2026-08-16-fase0-task-level.md, Task 2.
```

- [ ] **Passo 2.4 — suíte inteira**

`npm test` → 909+ passando, zero falhas.

- [ ] **Passo 2.5 — build**

`npm run build` → sem erro.

- [ ] **Passo 2.6 — commit**

```bash
git add src/services/auth.ts src/services/__tests__/perfilOrigem.test.ts
git commit -m "feat(auth): signUp declara o papel explicitamente na metadata"
```

---

## Task 3 — `org_admin` passa a metadata no `createUser`

**Files:**
- Modify: `supabase/functions/org_admin/index.ts:122-126`

**Interfaces:**
- Consome: o mesmo formato da Task 1, replicado (a Edge roda em Deno e não importa de `src/`)

- [ ] **Passo 3.1 — guardar a versão atual para rollback**

```bash
cp supabase/functions/org_admin/index.ts supabase/functions/org_admin/index.anterior.ts
git add supabase/functions/org_admin/index.anterior.ts
```

- [ ] **Passo 3.2 — acrescentar a metadata**

```ts
const { data: novo, error } = await admin.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  // Papel EXPLÍCITO na origem. Sem isto o trigger `handle_new_user` insere o
  // profile sem `papel`, ele nasce 'mestre' pelo default da coluna, e o upsert
  // abaixo vira CORREÇÃO em vez de confirmação — com uma janela no meio e um
  // sub-login mestre permanente se o upsert falhar.
  // O formato espelha `src/services/perfilOrigem.ts` (Task 1). Mudou lá, muda aqui.
  user_metadata: {
    nr13_papel: papel,
    nr13_org_id: orgId,
    ...(clienteId ? { nr13_cliente_id: clienteId } : {}),
  },
});
```

O `upsert` das linhas 161-166 **permanece intacto**: ele continua sendo a confirmação, e
cobre o caminho de adoção de usuário já existente (onde `createUser` falha e não há
metadata nova a aplicar).

- [ ] **Passo 3.3 — commit**

```bash
git add supabase/functions/org_admin/index.ts
git commit -m "feat(org_admin): papel explícito na metadata do createUser"
```

---

## Task 4 — `handle_new_user` honra a metadata

**Files:**
- Create: `supabase/perfil_origem.sql`
- Create: `supabase/perfil_origem_rollback.sql`

> ⚠️ **BLOQUEIO ANTES DESTA TASK.** O corpo de `handle_new_user` em produção **pode não ser
> o de `admin_setup.sql`** — o próprio repo registra que "o corpo exato do trigger varia por
> instalação" (`acesso_setup.sql:126`, `v2_por_default.sql:55`). Escrever um
> `create or replace` contra a versão errada apagaria comportamento que existe em produção e
> não está versionado aqui.
>
> **O dono precisa colar o corpo real antes de esta task ser implementada:**
> ```sql
> select prosrc from pg_proc where proname = 'handle_new_user';
> ```
> Sem isso, a task fica bloqueada e o SQL não é escrito.

- [ ] **Passo 4.1 — obter o corpo real do trigger em produção** *(ação do dono)*
- [ ] **Passo 4.2 — comparar com `admin_setup.sql:60-74`** e registrar as diferenças
- [ ] **Passo 4.3 — escrever `perfil_origem.sql`** partindo do corpo REAL, acrescentando só a leitura da metadata
- [ ] **Passo 4.4 — escrever `perfil_origem_rollback.sql`** com o corpo real, byte a byte
- [ ] **Passo 4.5 — commit** (SQL versionado; **não aplicado**)

**Esboço do que a função passa a fazer** (a ser reescrito sobre o corpo real):

```sql
-- Papel vindo da metadata do createUser/signUp; ausente = 'mestre' (auto-cadastro,
-- que de fato é dono da própria organização). Papel desconhecido NÃO vira 'mestre':
-- cai em 'sem_papel', que a lista branca da D-04 recusa.
declare
  v_papel  text := coalesce(new.raw_user_meta_data ->> 'nr13_papel', 'mestre');
  v_org    uuid := nullif(new.raw_user_meta_data ->> 'nr13_org_id', '')::uuid;
  v_cli    text := nullif(new.raw_user_meta_data ->> 'nr13_cliente_id', '');
begin
  if v_papel not in ('mestre','gerente','funcionario','cliente') then
    v_papel := 'sem_papel';
  end if;
  insert into public.profiles (id, email, ativo, role, papel, org_id, cliente_id)
  values (..., v_papel, v_org, v_cli)
  on conflict (id) do update set email = excluded.email;
```

**Ponto de atenção:** `trg_definir_org_padrao` roda `before insert` e preenche
`org_id := new.id` quando nulo. Com `v_org` vindo da metadata, ele não interfere. Confirmar
essa interação no teste manual — é onde um sub-login poderia nascer na org errada.

---

## Portão P1-A

Depois das Tasks 1–4:

- [ ] `npm test` verde · `npm run build` limpo · `npm run lint` sem erro novo
- [ ] `git push origin main`
- [ ] **PARAR.** O dono aplica `perfil_origem.sql` e faz o deploy do frontend e da Edge.

### Validação em produção da 0-A (roteiro, executado após o deploy)

Em **organização de teste**, nunca real:

1. Criar sub-login `funcionario` pela tela Acessos → conferir no banco: `papel='funcionario'`, `org_id` = org do mestre, **desde a criação**.
2. Criar acesso de cliente → `papel='cliente'`, `cliente_id` correto, `org_id` = org do mestre.
3. Criar conta nova por auto-cadastro → `papel='mestre'`, `org_id` = próprio id. Comportamento idêntico ao de antes.
4. Conta de trial → idem.
5. Login de cada uma das três → acesso correto.
6. **Teste da janela:** conferir que nenhum perfil recém-criado passa por um estado `mestre` intermediário (consultar `profiles` logo após criar um sub-login).
7. Regressão: mestre existente, gerente existente e cliente existente continuam funcionando.

**Só depois disso** o task-level da Parte 0-B é escrito.

---

## Fora do escopo desta parte (registrado para não se perder)

- **0.b-4** — trocar o default de `papel` para `'sem_papel'`. Só depois de a 0-A estar validada e o frontend novo em campo. Vira a última trava fail-closed da origem.
- **0.e / 0.f** — Edge `portal_arquivo`, roteamento das três funções de `fotos.ts`/`storageV2.ts`, e as policies. Parte 0-B.
- Auditoria da policy `profiles_insert_self` (item 7 da tabela 0.a): permite `insert` do próprio perfil. Hoje inofensiva (a linha já existe e o insert conflita), mas merece revisão na 0-B junto com as demais policies.
