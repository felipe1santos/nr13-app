# Simulação do deploy da Fase 9 — na ordem exata de produção

**23/08/2026** · laboratório local · **nada aplicado em produção**

O exercício: **desinstalar a Fase 9 do laboratório por completo** e **reinstalá-la do zero**, na
mesma ordem que produção vai usar, medindo cada passo. Um banco com a Fase 9 removida é o
equivalente fiel de como produção está hoje.

---

## 1 · A desinstalação — e a guarda que salvou a ordem

`supabase/fase9_rollback.sql` remove tudo que a fase criou. Ele começa **recusando rodar** se a
RPC ainda estiver chamando `projetar_chave`:

```
ERROR: PARE: aplicar_mutacao_storage ainda chama projetar_chave.
       Rode supabase/busca_index_rpc_rollback.sql primeiro.
```

**Testado de propósito na ordem errada, e a guarda disparou.** Sem ela, apagar `projetar_chave`
com a RPC ainda apontando para ela transformaria **toda gravação de equipamento** numa pendência —
a verdade continuaria salva (é o desenho da 9B), mas seria barulho inútil e assustador.

Na ordem certa:

| | |
|---|---:|
| Objetos da Fase 9 restantes | **0** |
| Chaves em `app_storage` | **139.611 — inalteradas** |

---

## 2 · Preflight num banco sem a Fase 9

`scripts/fase9/preflight.sql` confirmou o que precisa existir e o que não pode existir:

| Pré-requisito | |
|---|---|
| `app_storage`, `app_storage_excluidos`, `org_sync` | ✅ presentes |
| `aplicar_mutacao_storage`, `org_atual`, `papel_atual` | ✅ presentes |

| Fase 9 já instalada? | |
|---|---|
| as 4 tabelas, a coluna da flag, a RPC com projeção | ❌ **todas false** — como produção está hoje |

---

## 3 · A instalação, cronometrada

| # | Arquivo | Tempo |
|---|---|---:|
| 1 | `busca_index.sql` | 379 ms |
| 2 | `busca_manutencao.sql` | 301 ms |
| 3 | `busca_index_rpc.sql` | 262 ms |
| 4 | `busca_index_indices.sql` | 280 ms |
| 5 | `busca_consulta.sql` | 308 ms |
| 6 | `busca_v9_flag.sql` | 269 ms |
| | **TOTAL** | **1,8 s** |

> Inclui a latência do `docker exec` a cada chamada. O trabalho de banco em si é menor.

---

## 4 · Pós-deploy — o que foi conferido

`scripts/fase9/posdeploy.sql`, com a flag ainda desligada:

| Verificação | Resultado |
|---|---|
| 4 tabelas e 16 funções | ✅ |
| **Collation `"C"` em `tag` e `serie_norm`** | ✅ — é o passo que mais se erra |
| 12 colunas derivadas (`busca` e `serie_norm` como `ALWAYS` geradas) | ✅ |
| 6 índices | ✅ |
| A RPC passou a manter a projeção | ✅ |
| RLS ligada nas 4 tabelas | ✅ |
| `SELECT` só para a própria org, cortando o papel `cliente` | ✅ |
| Escrita nas projeções: **nenhuma política** — fail closed | ✅ |
| `buscar_equipamentos` executável só por `authenticated` | ✅ |
| **Organizações com a flag ligada** | **0** |
| **Linhas na projeção** | **0** — o deploy do SQL não faz backfill |
| `app_storage` | **139.611 chaves, 177 MB — inalterada** |

---

## 5 · Backfill de UMA organização

1.004 equipamentos e 1.001 índices de relatório:

```
lote 1: 1000 equipamentos    407 ms
lote 2:    4 equipamentos     16 ms
lote 3: troca de etapa         6 ms
lote 4: 1000 relatórios      129 ms
lote 5:    1 relatório         7 ms
lote 6: concluído              6 ms
──────────────────────────────────
TOTAL: 2,3 s em 6 lotes (571 ms de trabalho de banco)
```

### Fidelidade

| | Antes da desinstalação | Depois do backfill |
|---|---:|---:|
| Equipamentos projetados | 1.004 | **1.004** |
| Relatórios projetados | 2.001 | **2.001** |

Auditoria: `convergiu: true`, `faltando: 0`, `sobrando: 0`, `defasadas: 0`, `pendencias: 0`.

### Idempotência

Reiniciar e rodar o backfill inteiro de novo: **1.004 e 2.001**, os mesmos números. Não duplica.

### Retomada

O teste que importa, porque um backfill de organização grande **vai** ser interrompido:

| Passo | Resultado |
|---|---|
| Lote parcial de 300 | cursor gravado em `nr13_info_ZZ-SCALE-F8-91-364` |
| **Auditoria NO MEIO** | `704 equipamentos faltando`, `convergiu: false` — acusa corretamente |
| Continuar em lotes de 400 | retomou do cursor, sem repetir o que já tinha feito |
| Final | **1.004 / 2.001, `convergiu: true`** |

> A auditoria acusar durante o backfill **não é defeito** — é ela dizendo a verdade sobre um
> estado incompleto. O que não pode é ela continuar acusando depois de terminado.

---

## 6 · Regressão sobre a instalação nova

| Bateria | Resultado |
|---|---|
| `scripts/fase9/testes-9c.sql` | **30 PASSA · 0 FALHA** |
| `scripts/fase9/testes-rls-stable.sql`, nos dois modos | **88 linhas idênticas** |
| Flag `OFF → ON → OFF` | ✅ os três estados obedecem |
| Suíte do app | **1237 / 1237** |
| Build | verde |

---

## 7 · O que esta simulação garante

- a **ordem** dos seis arquivos está certa, e o passo 4 (a collation) entra com as tabelas vazias;
- o pacote inteiro aplica em **segundos**, não em minutos;
- o backfill de uma organização de mil equipamentos leva **~2 segundos**, é **idempotente** e é
  **retomável**;
- o rollback é completo e **se recusa a rodar fora de ordem**;
- e a verdade — `app_storage` — atravessou desinstalação, reinstalação e backfill **sem uma chave
  a menos**.

## 8 · O que ela NÃO garante

Nada sobre **dado real de produção**. O laboratório tem massa sintética da Fase 8, cuja
`nr13_cat_` inclusive tem forma diferente da que o aplicativo grava (registrado em
`2026-08-22-fase9c-tela.md`, §8). Fidelidade sobre dado real é justamente o que o portão **P9.2**
existe para provar, e continua **aberto**.
