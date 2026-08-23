# ORDEM DE ROLLOUT — decidida em 23/08/2026

> **Esta é a ordem oficial.** Ela existe para que, no dia do deploy, **nenhuma decisão seja
> improvisada**. Se algo não estiver escrito aqui, não se faz na hora: para-se e decide-se fora
> da janela de deploy.

**Estado em 23/08/2026:** as **DUAS ETAPAS estão CONCLUÍDAS em produção**, e o **P9.2 está
FECHADO ✅**. A flag `busca_v9` ficou **DESLIGADA nas 29 organizações** — a validação foi feita
ligando e desligando, organização por organização, como o roteiro previa.

> **A ETAPA 2 ganhou um passo que não estava previsto, e ele foi o mais importante:** a comparação
> campo a campo achou uma divergência de paridade (a cidade do cliente sumindo do cartão) e o
> portão **ficou aberto até a correção**. O registro está em
> [`medicoes/2026-08-23-p92-validacao-frontend-8d211c.md`](../../medicoes/2026-08-23-p92-validacao-frontend-8d211c.md),
> §11 e §12. Para banco que já recebeu a Fase 9, a migração é `supabase/busca_cliente_paridade.sql`,
> aplicada **antes** de `busca_manutencao.sql` e `busca_consulta.sql`.

---

## Por que DUAS etapas, e não uma

As duas mudanças são **independentes**:

| | O que é | Depende da outra? |
|---|---|---|
| **Etapa 1** | As seis funções auxiliares da RLS passam de `VOLATILE` para `STABLE` | **Não.** Beneficia o sistema como ele é hoje |
| **Etapa 2** | Infraestrutura da Fase 9 + busca V9 sob flag | **Não.** Funciona com as funções em qualquer volatilidade |

Misturá-las num passo só custaria a capacidade de saber **qual delas** causou qualquer coisa que
aparecesse depois. Separadas, cada uma tem sua própria medição e seu próprio rollback.

**A ordem entre elas não é arbitrária.** A Etapa 1 vem primeiro porque a Fase 8/9 mediu que a
hidratação sofre com o custo por linha das funções de RLS — e a Etapa 2 vai ser validada
justamente navegando pelo app. Entrar com a Etapa 1 antes deixa o terreno limpo.

---

## Pré-condição das duas etapas — esclarecida em 23/08

**O estado do Supabase precisa estar esclarecido.** Diagnóstico completo em
[`medicoes/2026-08-23-diagnostico-grace-period.md`](../../medicoes/2026-08-23-diagnostico-grace-period.md).

Resumo do que foi apurado: **não há restrição ativa, não há dívida, não há problema de cartão** —
7 faturas, todas US$ 0,00 e PAID. O aviso anuncia que a carência acabou em 16/08 e que estourar a
cota **passa a** restringir. A métrica mais alta é *cached egress* em 54 %.

**O custo das duas etapas é desprezível** (alguns MB contra 2,29 GB disponíveis). A decisão de
quando aplicar é do dono; tecnicamente não há impedimento.

---

# ✅ ETAPA 1 — CONCLUÍDA EM 23/08/2026

> **Aplicada, validada, revertida e reaplicada em produção.** Estado final: as seis funções estão
> `STABLE`. Resultado completo em
> [`medicoes/2026-08-23-etapa1-rls-stable-producao.md`](../../medicoes/2026-08-23-etapa1-rls-stable-producao.md).
>
> | | |
> |---|---|
> | Benchmark | 1.695 → **883 buffers** · 11,4 → **6,3 ms** · `Filter` por linha → **`One-Time Filter`** |
> | Segurança | **7 atores reais, 0 divergências** · Portal em zero · `anon` em zero · org A nunca viu org B |
> | Permissões | **inalteradas** |
> | Dados | **inalterados** — 888 chaves, 33 MB, zero resíduo |
> | Rollback | **exercitado**, 6/6 de volta a VOLATILE, e reaplicado |
> | Projeto | **Healthy** |
>
> **O ganho foi menor que no laboratório (244×), e a razão está documentada:** produção tem 888
> chaves contra 122.011 do laboratório, e o custo de uma função VOLATILE em RLS é proporcional às
> linhas varridas. O que não depende da escala é a mudança de PLANO, que é o que impede o custo
> de crescer junto com a base.
>
> **Defeito corrigido antes de aplicar:** o arquivo criava políticas em tabelas da Fase 9 que não
> existem em produção, e teria falhado no meio. O bloco virou condicional.

---

# ETAPA 1 — o roteiro que foi seguido

**Arquivo:** `supabase/rls_funcoes_estaveis.sql`
**Rollback:** `supabase/rls_funcoes_estaveis_rollback.sql`
**Validação local:** [`medicoes/2026-08-23-rls-funcoes-volateis.md`](../../medicoes/2026-08-23-rls-funcoes-volateis.md)

### 1.1 · Medir ANTES

Guarde a saída. Sem ela, "antes × depois" vira memória.

```sql
-- Troque <ORG> e <UID_DO_MESTRE> por valores reais.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<UID_DO_MESTRE>","role":"authenticated"}';
explain (analyze, buffers)
select chave from public.app_storage where org_id = '<ORG>' order by chave limit 1000;
rollback;
```

**Anote:** `Buffers: shared hit=` e `Execution Time`. E o formato do plano — com `VOLATILE` o
`org_atual()` aparece em `Filter`; com `STABLE` deve virar `One-Time Filter`.

### 1.2 · Aplicar

Um arquivo só, no SQL Editor. **Seis `alter function` e duas políticas.** Não altera corpo de
função, não altera `security definer`, não altera `search_path`, não toca em dado.

### 1.3 · Medir DEPOIS

A **mesma** consulta do 1.1. Esperado, pela medição local: de ~248.685 para ~1.021 buffers.

### 1.4 · Confirmar segurança em produção

Com um usuário real de cada tipo, e **sem alterar nada**:

- [ ] um mestre entra e vê **os equipamentos da organização dele**;
- [ ] um sub-login da mesma organização vê o mesmo;
- [ ] o **Portal do Cliente** abre e mostra **apenas** os equipamentos do cliente vinculado;
- [ ] uma conta de organização diferente **não** vê nada da primeira;
- [ ] salvar um campo qualquer funciona (a escrita não foi afetada).

> Se qualquer um destes falhar: **1.5 imediatamente.**

### 1.5 · Exercer o rollback — obrigatório, mesmo dando tudo certo

```
supabase/rls_funcoes_estaveis_rollback.sql
```

Conferir que as seis voltaram a `VOLATILE` e que o app continua funcionando. **Rollback que nunca
foi exercitado não é rollback, é esperança.**

### 1.6 · Reaplicar

`rls_funcoes_estaveis.sql` de novo, e confirmar o ganho pela terceira vez.

### 1.7 · Registrar e PARAR

Commit com os números medidos em produção. **A Etapa 2 não começa aqui.**

---

# ✅ ETAPA 2 — CONCLUÍDA EM 23/08/2026

**Roteiro detalhado:** [`2026-08-23-validacao-real-9c.md`](2026-08-23-validacao-real-9c.md).
Abaixo está só a **ordem**; o detalhe de cada prova está lá.

### 2.1 · Preflight

```
scripts/fase9/preflight.sql     → guardar a saída
scripts/backup-org.mjs          → backup da organização escolhida
```

### 2.2 · O SQL, nesta ordem exata

| # | Arquivo | Por que nesta posição |
|---|---|---|
| 1 | `supabase/busca_index.sql` | tabelas e RLS — nada depende delas ainda |
| 2 | `supabase/busca_manutencao.sql` | projeção, rebuild, reparo, auditoria |
| 3 | `supabase/busca_index_rpc.sql` | a RPC passa a manter a projeção; precisa das funções acima |
| 4 | `supabase/busca_index_indices.sql` | **reescreve a coluna `tag`** |
| 5 | `supabase/busca_consulta.sql` | a consulta; precisa das colunas do passo 4 |
| 6 | `supabase/busca_v9_flag.sql` | a flag, `default false` |

> **O passo 4 tem de acontecer com as tabelas VAZIAS.** Ele faz
> `alter column tag type text collate "C"`, que reescreve a tabela e reconstrói a PK. Vazia, é
> instantâneo; depois do backfill de uma organização grande, é janela de lock.
>
> **Portanto: todo o SQL ANTES do backfill. Sempre.**

**Medido na simulação local, banco limpo:** os seis arquivos aplicam em **1,8 segundo**.

### 2.3 · Pós-deploy

```
scripts/fase9/posdeploy.sql     → guardar a saída
```

Confere objetos, a collation `"C"` das duas colunas, as 12 colunas derivadas, os 6 índices, a RLS,
que **nenhuma organização** está com a flag ligada, que a projeção está **vazia**, e que
`app_storage` não mudou de tamanho.

### 2.4 · Deploy do bundle

Manual, no Coolify. **Antes de ligar qualquer flag.** Com a flag desligada — o padrão — o bundle
novo se comporta exatamente como o atual.

### 2.5 · Backfill de UMA organização

```sql
select public.reiniciar_rebuild_busca('<ORG>');
select public.reconstruir_indice_busca('<ORG>', 1000);   -- repetir até 'concluido'
select jsonb_pretty(public.auditar_projecao('<ORG>'));
```

**Medido na simulação local**, 1.004 equipamentos e 1.001 índices de relatório: **2,3 s em 6
lotes**. Provado **idempotente** (reexecutar não duplica) e **retomável** (interrompido em 300, o
cursor guardou a posição, a auditoria acusou 704 faltando, e a continuação fechou convergida).

**Não seguir enquanto a auditoria não disser `convergiu: true` com zero pendências.**

### 2.6 · Flag OFF × ON

Comparação campo a campo, conforme o roteiro. **Anotar antes de ligar.**

### 2.7 · Escrita com TAG descartável

`ZZ-TESTE-9C-<AAAAMMDD>`, criada e **removida pelo fluxo oficial da tela**, nunca por SQL.

### 2.8 · Offline

Cortar a rede, recarregar, conferir o selo e que a lista **não fica vazia sem explicação**.

### 2.9 · Rollback da flag — obrigatório

```sql
select public.definir_busca_v9('<ORG>', false);
```

A tela antiga volta inteira. **Nenhum dado precisa ser convertido.**

### 2.10 · Auditoria final e P9.2 — **FECHADO ✅ em 23/08/2026**

`convergiu: true` nas duas organizações com projeção (`…8d0f7e` e `…8d211c`), **zero pendências**,
`app_storage` inalterada (891 chaves, 32,9 MB), `busca_v9` **OFF nas 29**.

> **O portão não fechou na primeira passagem — e não devia mesmo.** O passo 2.6 (OFF × ON, campo a
> campo) achou a cidade do cliente sumindo do cartão, mais uma precedência de nome invertida que
> nenhuma organização real exercia. A correção entrou como mudança própria, com migração,
> reprojeção medida e regressão curta, e só então o dono fechou o P9.2. **Se a comparação tivesse
> sido "no olho", esse defeito teria ido para dentro da 9D.**

---

## Rollback total, se for preciso

| Alcance | Como | Custo |
|---|---|---|
| Desligar a busca de uma org | `definir_busca_v9('<ORG>', false)` | instantâneo, nada se perde |
| Desfazer a Etapa 1 | `rls_funcoes_estaveis_rollback.sql` | instantâneo, nada se perde |
| Remover a Fase 9 do banco | `busca_index_rpc_rollback.sql` **e então** `fase9_rollback.sql` | nada empresarial se perde: as projeções são derivadas |

> A **ordem do rollback total é a inversa da instalação**, e o `fase9_rollback.sql` **recusa
> rodar** se a RPC ainda estiver chamando `projetar_chave`. Testado: a guarda dispara.

---

## O que NÃO se decide durante o deploy

- qual organização validar — **escolher antes**, pelos critérios do roteiro;
- se pula alguma prova — **não pula**;
- se ignora uma divergência pequena — **não ignora**: anota e desliga a flag;
- mexer em plano, *spend cap* ou cartão — **fora do escopo do deploy**, decisão à parte.
