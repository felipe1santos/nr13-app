# ORDEM DE ROLLOUT — decidida em 23/08/2026

> **Esta é a ordem oficial.** Ela existe para que, no dia do deploy, **nenhuma decisão seja
> improvisada**. Se algo não estiver escrito aqui, não se faz na hora: para-se e decide-se fora
> da janela de deploy.

**Estado em 23/08/2026:** nada aplicado em produção. As duas etapas aguardam autorização
separada, e a segunda só começa depois de a primeira estar fechada.

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

## ⛔ Pré-condição das duas etapas

**O estado do Supabase precisa estar esclarecido.** Diagnóstico completo em
[`medicoes/2026-08-23-diagnostico-grace-period.md`](../../medicoes/2026-08-23-diagnostico-grace-period.md).

Resumo do que foi apurado: **não há restrição ativa, não há dívida, não há problema de cartão** —
7 faturas, todas US$ 0,00 e PAID. O aviso anuncia que a carência acabou em 16/08 e que estourar a
cota **passa a** restringir. A métrica mais alta é *cached egress* em 54 %.

**O custo das duas etapas é desprezível** (alguns MB contra 2,29 GB disponíveis). A decisão de
quando aplicar é do dono; tecnicamente não há impedimento.

---

# ETAPA 1 — RLS/STABLE, isolada

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

# ETAPA 2 — Fase 9, em autorização separada

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

### 2.10 · Auditoria final e P9.2

`convergiu: true`, zero pendências, e então o portão fecha.

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
