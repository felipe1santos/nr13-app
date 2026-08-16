# Fase 1 — Índice da hidratação incremental · medições

**Data:** 16/08/2026 · **Achado:** A-03 · **SQL:** `supabase/indice_hidratacao.sql`

## Ambiente medido

| | |
|---|---|
| Tabela | `public.app_storage` — 731 linhas, 9 organizações, 33 MB total |
| Índices antes | `pkey`, `org_idx (org_id, chave)`, `org_chave_uidx (org_id, chave) unique`, `deletado_idx (org_id, deletado_em)`, `user_idx` — 432 kB |
| Organização medida | `06f84f2e…1fe5e` — a maior real: **353 linhas**, 3.119 kB de `valor`, última escrita 2026-08-15 04:00 |
| Consulta | a da hidratação (`storageV2.lerTudo`), literal, com `limit 1000` |

> **Papel do executor:** o SQL Editor roda como `postgres`, sem RLS. O app roda
> como `authenticated`, e a policy acrescenta um filtro ao plano. A pergunta
> desta fase — existe índice para `(org_id, atualizado_em)`? — não muda com isso,
> mas os tempos absolutos aqui são um piso, não o que o app paga.

## Antes

| Cenário | Plano | Linhas varridas | Buffers | Tempo |
|---|---|---|---|---|
| **1 · marca nula** (primeiro boot) | `Seq Scan` → **`Sort`** (quicksort 222 kB) | 353 → devolve 353 | 65 | 0,667 ms |
| **2 · nada mudou** (o caso comum) | `Bitmap Index Scan (deletado_idx)` → `Bitmap Heap Scan` → **`Sort`** (25 kB) | **`Rows Removed by Filter: 353`** → devolve **0** | 61 | 0,985 ms |
| **3 · poucas mudanças** | `Bitmap Index Scan (deletado_idx)` → `Bitmap Heap Scan` → **`Sort`** (26 kB) | `Rows Removed by Filter: 347` → devolve 6 | 61 | 0,294 ms |

O cenário 2 é o retrato do achado: para responder "nada mudou", o banco lia as
353 linhas da organização e ainda ordenava o resultado vazio. A hidratação
incremental (11/08) tirou esse tráfego da rede; ele continuava sendo pago no
banco, em toda abertura, de todo aparelho.

## Índice aplicado

```sql
create index concurrently if not exists app_storage_org_atualizado_idx
  on public.app_storage (org_id, atualizado_em, chave);
```

`indisvalid = true`, `indisready = true`, **72 kB**. Índices da tabela:
432 kB → **504 kB** (+16,7 %). Sem downtime, sem erro de bloco de transação.

## Depois

| Cenário | Plano | Buffers | Tempo | Veredito |
|---|---|---|---|---|
| **1 · marca nula** | `Index Scan` — **sem `Sort`** | 65 → **236** | 0,667 → **2,289 ms** | ⚠️ ficou mais caro nesta escala |
| **2 · nada mudou** | `Index Scan` — **sem `Sort`** | 61 → **2** | 0,985 → **0,058 ms** | ✅ 30× menos buffers |
| **3 · poucas mudanças** | `Index Scan` — **sem `Sort`** | 61 → **8** | 0,294 → …1,598 ms* | ✅ 7,6× menos buffers |

\* primeira execução do plano novo, com o índice recém-criado ainda frio. O
número a comparar aqui é buffers, não o relógio de uma amostra única.

**`Rows Removed by Filter` desapareceu dos cenários 2 e 3** — o índice entrega
exatamente as linhas da faixa, e o nó `Sort` sumiu dos três.

### O cenário 1 piorou, e isso não é um detalhe a esconder

Sem filtro de data o `Index Scan` percorre o índice inteiro da organização e
busca **cada** linha no heap por acesso aleatório: 236 buffers contra os 65 de
uma leitura sequencial seguida de um sort em memória. Com 353 linhas cabendo
folgadamente em cache, ordenar é mais barato que saltar.

Segue aceito, por três razões:

1. O cenário 1 acontece **uma vez por aparelho**; o 2 acontece em **todo boot**.
2. O ganho do 2 (61 → 2 buffers) é estrutural: ele não depende do tamanho da
   organização — o do cenário 1 depende, e é justamente onde o `Sort` de tudo
   deixa de caber em `work_mem` e passa a ir para disco.
3. Reversível em segundos (`indice_hidratacao_rollback.sql`).

## Custo de escrita — NÃO medido nesta fase

O plano pede `INSERT`/`UPDATE` ≤ +10 %. Não é medível aqui, e não vou registrar
um "passou" que não observei:

- a escrita direta em `app_storage` é recusada pelo trigger `trg_guardar_app_storage`
  (a v2 escreve só pela RPC `aplicar_mutacao_storage`), então não há upsert
  isolado para cronometrar;
- com 731 linhas, o custo de manter mais um índice B-tree fica abaixo do ruído
  de medição.

**Fica para a Fase 8**, com massa sintética, onde a medida tem significado. O
que dá para afirmar hoje: um índice a mais em tabela de 33 MB é +72 kB e uma
entrada por escrita.

## Uso real

`pg_stat_user_indexes` logo após a criação:

| Índice | `idx_scan` | `idx_tup_read` | Tamanho |
|---|---|---|---|
| `app_storage_org_chave_uidx` | 13.093 | 150.973 | 104 kB |
| `app_storage_deletado_idx` | 1.320 | 145.331 | 16 kB |
| `app_storage_pkey` | 799 | 1.192 | 112 kB |
| `app_storage_user_idx` | 614 | 9.722 | 16 kB |
| `app_storage_org_idx` | 38 | 13.978 | 112 kB |
| **`app_storage_org_atualizado_idx`** | **3** | 359 | 72 kB |

Os 3 scans são os `EXPLAIN ANALYZE` desta medição. **Conferir de novo depois de
alguns dias de boots reais**: se `idx_scan` não subir junto com o uso do app, o
planner não está escolhendo o índice pela RLS e a fase precisa ser reaberta.

Observação para uma mudança futura e separada: `app_storage_org_idx (org_id, chave)`
tem 38 scans contra 13.093 do `org_chave_uidx`, que é unique sobre as mesmas
colunas. Redundância confirmada — **não removida nesta fase**, por decisão do
plano (remoção de índice é mudança à parte; índice redundante custa espaço, não
correção).

## Verificação funcional

App recarregado na organização de teste após a aplicação: mesma contagem de
equipamentos, selo `Sincronizado`, fila vazia. Nenhuma mudança de comportamento
observável — que é o esperado: o índice serve a consulta como ela é.

## Critério de aceite

- [x] `Index Scan` e **nenhum nó `Sort`** nos cenários "nada mudou" e "poucas mudanças"
- [x] Linhas varridas no cenário "nada mudou": **353 → 0** (`Rows Removed by Filter` sumiu)
- [ ] Custo de escrita ≤ +10 % — **adiado para a Fase 8**, sem massa não é medível
- [x] `indisvalid = true`
- [x] Suíte verde (959), build limpo
