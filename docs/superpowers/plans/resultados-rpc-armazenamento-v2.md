# Gate manual da RPC — resultados

**Regra:** este arquivo precisa estar **preenchido e datado** antes de `definir_v2_org(<org>, true)` ser executado para qualquer organização. Roteiro não executado **não libera** a ativação.

Não há Postgres no CI deste repo, então o comportamento do PL/pgSQL não é coberto por teste automatizado. O `contratoRpc.test.ts` cobre só a interpretação da resposta no cliente. Esta é a verificação do servidor, e ela é manual **de propósito** — em vez de fingir cobertura que não existe.

**Ambiente:** rodar num projeto Supabase de teste (nunca produção), com `armazenamento_v2.sql` aplicado.

**Preencher:** `Executado em`, `Por`, e a saída real de cada cenário. Saída divergente do esperado **bloqueia** a ativação.

- **Executado em:** _(não executado)_
- **Por:** _(—)_
- **Projeto/ref:** _(—)_

---

## Preparo

```sql
-- Duas sessões psql são necessárias (A e B) para os cenários de concorrência.
-- Substitua pelos ids reais do ambiente de teste.
\set org  '00000000-0000-0000-0000-000000000000'
\set user 'aaaaaaaa-0000-0000-0000-000000000000'
```

---

## 1. Conflito real: dois aparelhos na mesma `versao_esperada`

```sql
-- Estado: chave existe na versão 4.
select public.aplicar_mutacao_storage('nr13_form_T', gen_random_uuid(), 'set', '{"a":1}', 4, 'dev-A', now());
select public.aplicar_mutacao_storage('nr13_form_T', gen_random_uuid(), 'set', '{"a":2}', 4, 'dev-B', now());
```

**Esperado:** 1ª → `{"status":"aplicado","versao":5}`. 2ª → `{"status":"conflito","versao":5,"valor":"{\"a\":1}",...}` com a linha vigente.

**Obtido:** _(—)_

---

## 2. Idempotência: mesma mutação reenviada

```sql
\set mid '11111111-1111-1111-1111-111111111111'
select public.aplicar_mutacao_storage('nr13_form_T', :'mid', 'set', '{"a":9}', 5, 'dev-A', now());
select public.aplicar_mutacao_storage('nr13_form_T', :'mid', 'set', '{"a":9}', 5, 'dev-A', now());
select versao from public.app_storage where chave = 'nr13_form_T';
```

**Esperado:** 1ª `aplicado`, versão 6. 2ª `repetido`, versão 6. A coluna `versao` fica em **6**, não 7 — a mutação não foi reaplicada.

**Obtido:** _(—)_

---

## 3. Duas chamadas SIMULTÂNEAS com o mesmo `mutationId`

Sessões A e B, em paralelo:

```sql
-- A:                                              -- B (ao mesmo tempo):
begin;                                             begin;
select public.aplicar_mutacao_storage(             select public.aplicar_mutacao_storage(
  'nr13_form_S', :'mid2', 'set', '{"x":1}',          'nr13_form_S', :'mid2', 'set', '{"x":1}',
  0, 'dev-A', now());                                0, 'dev-B', now());
-- (não commitar ainda)                            -- deve BLOQUEAR aqui, no FOR SHARE
commit;                                            -- destrava e responde
                                                   commit;
```

**Esperado:** A → `aplicado`. B → **`repetido`** com o mesmo resultado. **Sem** erro de chave duplicada em `app_storage_mutacoes`, e a mutação aplicada **uma única vez**.

**Obtido:** _(—)_

---

## 4. Duas criações SIMULTÂNEAS da mesma chave com `versao_esperada = 0`

Sessões A e B, `mutationId` **diferentes**, mesma chave inexistente:

```sql
-- A:                                              -- B (ao mesmo tempo):
begin;                                             begin;
select public.aplicar_mutacao_storage(             select public.aplicar_mutacao_storage(
  'nr13_info_NOVA', gen_random_uuid(), 'set',        'nr13_info_NOVA', gen_random_uuid(), 'set',
  '{"dono":"A"}', 0, 'dev-A', now());                '{"dono":"B"}', 0, 'dev-B', now());
commit;                                            commit;
```

**Esperado:** uma responde `aplicado`; a outra responde **`conflito`** com o valor da vencedora. **Nunca** as duas `aplicado`, e **nunca** um erro cru de `unique_violation` vazando para o cliente. `FOR UPDATE` não tranca linha inexistente — quem resolve é a unique constraint, capturada pelo handler.

**Obtido:** _(—)_

---

## 5. Exclusão concorrente com edição (tombstone não coletado)

```sql
select public.aplicar_mutacao_storage('nr13_info_X', gen_random_uuid(), 'del', null, 7, 'dev-A', now());
-- Aparelho que parou na versão 3 volta e tenta gravar:
select public.aplicar_mutacao_storage('nr13_info_X', gen_random_uuid(), 'set', '{"z":1}', 3, 'dev-B', now());
select versao_final from public.app_storage_excluidos where chave = 'nr13_info_X';
```

**Esperado:** exclusão `aplicado` (versão 8) e `versao_final = 8` gravado **na hora**. A escrita antiga → `recusado`/`versao_obsoleta`. **Nada ressuscita.**

**Obtido:** _(—)_

---

## 6. Aparelho offline além do prazo de coleta

```sql
select public.coletar_tombstones(:'org', 30);   -- como service_role
-- Aparelho antigo volta com versão anterior à exclusão coletada:
select public.aplicar_mutacao_storage('nr13_info_X', gen_random_uuid(), 'set', '{"z":2}', 3, 'dev-C', now());
```

**Esperado:** `recusado`/`versao_obsoleta`. O `valor` saiu na coleta, mas `app_storage_excluidos` **não é podada** e o piso continua valendo.

**Obtido:** _(—)_

---

## 7. Recriar legitimamente uma chave excluída e coletada

```sql
select public.aplicar_mutacao_storage('nr13_info_X', gen_random_uuid(), 'set', '{"novo":true}', 8, 'dev-A', now());
```

**Esperado:** `aplicado`, versão 9 (`9 > versao_final = 8`). Excluir não pode significar "nunca mais existirá".

**Obtido:** _(—)_

---

## 8. Escrita direta PERMITIDA com a v2 desligada

```sql
select public.definir_v2_org(:'org', false);   -- service_role
insert into public.app_storage (org_id, user_id, chave, valor)
values (:'org', :'user', 'nr13_info_V1', '{"via":"v1"}');
```

**Esperado:** insert **aceito**. É o que mantém o frontend v1 funcionando com o SQL já aplicado, e o que torna o rollback possível.

**Obtido:** _(—)_

---

## 9. Escrita direta BLOQUEADA com a v2 ligada

```sql
select public.definir_v2_org(:'org', true);
insert into public.app_storage (org_id, user_id, chave, valor)
values (:'org', :'user', 'nr13_info_V1B', '{"via":"direto"}');

update public.app_storage set valor = '{"x":1}' where chave = 'nr13_info_V1';
delete from public.app_storage where chave = 'nr13_info_V1';
```

**Esperado:** os **três** comandos falham com `nr13_escrita_direta_bloqueada`. Insert, update e delete — não só o insert.

**Obtido:** _(—)_

---

## 10. Escrita pela RPC ACEITA com a v2 ligada

```sql
-- v2 continua ligada do cenário anterior.
select public.aplicar_mutacao_storage('nr13_info_V2', gen_random_uuid(), 'set', '{"via":"rpc"}', 0, 'dev-A', now());
```

**Esperado:** `aplicado`. A RPC marca `nr13.via_rpc` e passa pela guarda.

**Obtido:** _(—)_

---

## 11. Coleta funciona com a v2 ligada

```sql
select public.coletar_tombstones(:'org', 0);   -- service_role, v2 ainda ligada
```

**Esperado:** executa sem `nr13_escrita_direta_bloqueada` — a rotina marca `nr13.manutencao` e é isenta da guarda. Sem esta isenção, ligar a v2 quebraria a coleta.

**Obtido:** _(—)_

---

## 12. Isolamento entre organizações

```sql
-- Autenticado como usuário da org A, tentando afetar chave da org B:
select public.aplicar_mutacao_storage('nr13_info_DA_ORG_B', gen_random_uuid(), 'set', '{}', 0, 'dev-A', now());
select org_id from public.app_storage where chave = 'nr13_info_DA_ORG_B';
```

**Esperado:** a linha nasce com o `org_id` **de A**, nunca de B. A função não tem parâmetro `org_id` — a org vem sempre de `org_atual()`.

**Obtido:** _(—)_

---

## 13. Permissão: papel cliente e assinatura suspensa

```sql
-- Autenticado como papel 'cliente':
select public.aplicar_mutacao_storage('nr13_info_T', gen_random_uuid(), 'set', '{}', 0, 'dev', now());
```

**Esperado:** `recusado`/`sem_permissao`. `security definer` ignora RLS, então papel, `acesso_vigente()` e `assinatura_permite_escrita()` são re-checados dentro da função — se essa checagem sumir, a RPC vira um buraco que contorna toda a RLS de escrita.

**Obtido:** _(—)_

---

## Conclusão

- [ ] Todos os 13 cenários executados e com saída igual à esperada.
- [ ] Divergências registradas e corrigidas antes da ativação.

**Liberado para `definir_v2_org(<org>, true)` em:** _(não liberado)_
