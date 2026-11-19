# Roteiro de produção — achado #1 (auto-cadastro escolhia papel e organização)

Branch `fix/cadastro-papel`, commit `1b1238b`. Auditoria de 25/10/2026.

**O furo:** a versão de 16/08 de `handle_new_user` lia `nr13_papel` / `nr13_org_id`
de `raw_user_meta_data`, que é o `options.data` do `signUp` público. Qualquer pessoa
podia se cadastrar como gerente da organização de outro cliente e ler/gravar o
`app_storage` dela. Reproduzido no laboratório (`scripts/lab/cadastroPapel.lab.test.mjs`).

**A correção:** o trigger não lê metadata nenhuma — todo usuário novo nasce `mestre`
da própria organização. Sub-login recebe papel e org pelo upsert do service_role na
Edge `org_admin` (que já existia). As Edges registram a origem em `app_metadata`.

Produção é `qqsesrntfvmdxqxrfvmw`. Nada deste roteiro gera massa nem roda em loop (§12).

---

## 0. Antes de começar

**Os arquivos e os hashes (§13).** Os hashes abaixo são do texto do COMMIT, com quebra de
linha LF. O arquivo no disco do Windows sai com CRLF (`core.autocrlf=true`) e tem OUTRO
hash — não use o arquivo do disco como fonte. Gere o texto exato com:

```
git show 1b1238b:supabase/perfil_origem_levantamento.sql > levantamento.sql
git show 1b1238b:supabase/perfil_origem.sql             > correcao.sql
git show 1b1238b:supabase/perfil_origem_verificar.sql   > verificar.sql
git show 1b1238b:supabase/perfil_origem_rollback.sql    > rollback.sql
```

| Arquivo | Bytes (LF) | SHA-256 (LF) |
|---|---|---|
| `perfil_origem_levantamento.sql` | 5726 | `1f8af16d1e04a83dd635ff22fe44458325300e1fa679410f6295342e45daf5c9` |
| `perfil_origem.sql` (a correção) | 6382 | `8932b8741e521fa816f92170c931aaf56bca052431e232678d8246573e019240` |
| `perfil_origem_verificar.sql` | 6794 | `7cd233ccbed43faf660896c7af164bace0ac3ad301819aa564c13372d6c8f941` |
| `perfil_origem_rollback.sql` | 2758 | `9f17e1753616b03c8690469823a3c8a3c3670062fa65ab6adc7b20e5e7ebaa5d` |

Depois de colocar o texto no SQL Editor, compare o SHA-256 do texto DO EDITOR com a
tabela. Se der diferente e o tamanho for maior, é CRLF — converta para LF e confira de
novo. Diferente com o mesmo tamanho é byte trocado: **não rode** (foi o `array_agh` da 9F.3).

**Fotografia do estado atual** (só leitura; guarde o resultado):

```sql
select md5(prosrc)                          as md5_corpo,
       prosrc like '%raw_user_meta_data%'   as le_user_metadata
  from pg_proc where proname = 'handle_new_user';
```

Esperado hoje: `le_user_metadata = true` (a versão de 16/08). Se vier `false`, a produção
NÃO está na versão vulnerável — pare e reavalie antes de seguir.

---

## 1. Levantamento — ANTES da correção (somente leitura)

Rode `perfil_origem_levantamento.sql` bloco a bloco (o SQL Editor mostra só o último
resultado). Guarde as quatro saídas.

| Bloco | O que mostra | Esperado |
|---|---|---|
| 1 | perfis em org alheia sem `criado_por` da org_admin | 0 linhas |
| 2 | o que esses perfis gravaram na org alheia | 0 linhas |
| 3 | logins desses perfis | 0 linhas |
| 4 | auto-cadastros que declararam papel ≠ mestre | 0 linhas |

**Se aparecer linha:**
- `SUSPEITO` no bloco 1 = conta cuja org veio da metadata do signUp. Trate como incidente:
  anote id/e-mail/org, veja os blocos 2 e 3 para medir o que ela fez, e **bloqueie a
  conta pela tela Admin** (por id exato, §14). Não rode `update`/`delete` em massa.
- `INVESTIGAR` = pode ser falso positivo: sub-login antigo criado antes de o `org_admin`
  gravar `criado_por`, ou perfil ajustado à mão. Confira com o mestre daquela org antes
  de mexer. No laboratório, a conta `portal-zz@local.test` (criada à mão) cai aqui.
- Lembre: `profiles.ativo` não é checado pela RLS (achado #3 da auditoria). Bloquear pela
  tela não corta o acesso ao banco. Para conter de verdade, exclua o usuário no Auth
  **depois** de guardar as evidências — e veja o achado #16 antes (exclusão em cascata).

A correção do passo 2 não depende do resultado deste passo: ela fecha a porta para
contas NOVAS. Contas já criadas precisam do tratamento acima.

---

## 2. Correção — `perfil_origem.sql`

Rode o arquivo inteiro (conferido por hash).

**Esperado:**
1. `CREATE FUNCTION`
2. `on_auth_user_created | O` (o trigger continua ligado)
3. `le_user_metadata = false`, `le_org_da_metadata = false`

**Se falhar:**
- Erro antes do `create or replace` → nada mudou. Leia o erro, não repita às cegas.
- Passo 3 com algum `true` → o texto rodado não é o do commit. Confira o hash de novo.
- O arquivo é idempotente: rodar duas vezes não causa dano.

---

## 3. Verificação

1. `perfil_origem_verificar.sql`, **bloco 1** → `veredito = OK`.
2. `perfil_origem_levantamento.sql`, **bloco 1** de novo → as MESMAS linhas do passo 1,
   nenhuma nova.
3. Bloco 4 do verificador (regressão global) → `veredito = OK` em todas as linhas.

---

## 4. Deploy das Edges

A ordem entre SQL e Edges é livre: Edge antiga + SQL novo funciona (o upsert dela corrige
o perfil logo depois do createUser, como antes de 16/08).

Pegue o texto do commit, não do disco:

```
git show 1b1238b:supabase/functions/org_admin/index.ts
git show 1b1238b:supabase/functions/org_admin/adocao.ts
git show 1b1238b:supabase/functions/admin/index.ts
```

- **`org_admin`**: são DOIS arquivos — `index.ts` e `adocao.ts`. Os dois mudaram.
- **`admin`**: `index.ts`.
- **Não cole** `supabase/functions/_rollback/org_admin.index.anterior.ts` nem
  `portal_cliente/index.anterior.ts` — são cópias antigas com regras já corrigidas
  (achado #18 da auditoria).

**Esperado:** no código publicado, `createUser` com `app_metadata:` e a adoção com
`metadata: existente.app_metadata`.

**Se falhar:** redeploy da versão anterior (`git show 540d709:<caminho>`). É seguro
voltar a Edge com o SQL novo aplicado — o trigger ignora a metadata de qualquer forma.

**Efeito colateral conhecido:** sub-login ÓRFÃO criado pela Edge ANTIGA (origem em
`user_metadata`) não é mais adotado numa retentativa; o mestre recebe "Use outro e-mail".
É raro (exige falha do upsert) e o caminho é usar outro e-mail ou corrigir pelo Admin.

**Frontend:** a mudança em `src/services/auth.ts` (os dois `signUp` param de mandar
`nr13_*`) vai no próximo deploy normal. Não é urgente: o trigger já ignora o que vier.

---

## 5. Teste manual — sub-login

Na organização de TESTE de produção (`teste@gmail.com`, a única na lista branca de
`scripts/massa-escala/seguranca.mjs`), pela tela **Acessos**:

1. Crie um funcionário com e-mail novo de teste.
2. **Esperado** (verificador, bloco 3, trocando o e-mail do mestre):
   `org_e_a_do_mestre = true`, `criado_pelo_mestre = true`,
   `origem_papel = funcionario`, `nasceu_correto = OK — criado pela org_admin…`.
3. Entre com o sub-login: ele vê os equipamentos da organização de teste.
4. Repita com um **acesso de cliente** (Empresas → Acesso ao Portal): papel `cliente`,
   `cliente_id` preenchido, entra no Portal.

**Se falhar:**
- Perfil `mestre` com org própria depois de criar → o upsert da Edge falhou. Veja o
  log da função `org_admin`; a tela deve ter mostrado o erro. Retentar com o MESMO
  e-mail cai na adoção (que agora confere `app_metadata`).
- Sub-login sem acesso aos dados → confira `org_id` e `papel` do perfil.

Remova os acessos de teste pela tela (são novos e sem dados, então o achado #16 não pega).

---

## 6. Teste manual — cadastro novo

**6a. Cadastro legítimo.** Pela tela de login, "Testar gratuitamente", com e-mail novo.
Esperado (verificador, bloco 2): `papel = mestre`, `org_e_a_propria = true`,
`veredito = OK`. O trial ativa e a conta vê só os dados DEMO-*.

**6b. Cadastro forjado (a prova de que o furo fechou).** No navegador, no domínio do app,
DevTools → Console. Troque `<ANON>` pela chave publicável do app (Settings → API) — ela
já é pública no bundle:

```js
await fetch('https://qqsesrntfvmdxqxrfvmw.supabase.co/auth/v1/signup', {
  method: 'POST',
  headers: { apikey: '<ANON>', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'forjado-' + Date.now() + '@example.invalid',
    password: 'Forj4do!' + Date.now(),
    data: { nr13_papel: 'gerente', nr13_org_id: '99f642d3-6efd-446d-9e76-d234ad8d211c' },
  }),
}).then((r) => r.status);
```

O alvo é a organização de TESTE. Como "Confirm email" está ligado, não volta sessão;
confira pelo SQL:

```sql
select p.email, p.papel, (p.org_id = p.id) as org_propria
  from public.profiles p
 where p.email like 'forjado-%@example.invalid'
 order by p.email desc limit 1;
```

**Esperado:** `papel = mestre`, `org_propria = true`. **Se vier `gerente` ou
`org_propria = false`: o furo continua aberto** — vá para o passo 7 sem esperar.

Depois, exclua o usuário forjado pelo Admin (por id exato).

---

## 7. Rollback — se algo quebrar

**Sintoma que justifica:** cadastro novo falhando (`Database error saving new user`) ou
conta nova nascendo sem perfil.

Rode `perfil_origem_rollback.sql` (hash na tabela do passo 0). Ele volta ao corpo de
ANTES de 16/08: insert sem `papel`, que cai no default `'mestre'`, e **também não lê
metadata**. Voltar por ele não reabre o furo.

**Não use o corpo de 16/08 como rollback.** É a versão vulnerável.

Esperado depois do rollback: `select prosrc from pg_proc where proname = 'handle_new_user'`
devolve o corpo de 4 linhas, sem `nr13_papel` e sem `raw_user_meta_data`.

As Edges podem ficar como estão: o upsert delas continua atribuindo papel e org.

---

## 8. Depois

- Registrar em `PENDENCIAS.md` o que ficou do passo 1 (contas investigadas e decisão).
- Achados ligados, ainda abertos: #3 (`ativo` fora da RLS), #14 (usuário troca o próprio
  `email`, que decide pagamento), #16 (excluir sub-login em cascata), #18 (cópias antigas
  das Edges).
