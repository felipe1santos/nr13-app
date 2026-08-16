# Baseline inicial — marco zero da evolução da arquitetura

**Data:** 16/08/2026 · **Fase:** 2 (Observabilidade) · **Achado:** A-11
**Fontes:** `admin_usage_stats()` e `admin_storage_stats()` recém-aplicadas, painel de
Usage do Supabase, `pg_*` do banco.

> Este é o número contra o qual todas as fases seguintes serão comparadas. Cada linha
> abaixo diz também **o que ela dimensiona** — medir sem isso vira enfeite de painel.

## Projeto (painel Supabase, ciclo 20/07 → 20/08/2026)

| Medida | Valor | Limite do plano Free |
|---|---|---|
| **Egress** | **3,494 GB** | 5 GB |
| Cached egress | 0,033 GB | — |
| Database size | 96,51 MB | 500 MB |
| Storage size (pico no gráfico) | ~110–122 MB | 1 GB |
| Edge Function invocations | 1.215 | 500 k |
| MAU | 26 | 50 k |

O egress é o que aperta: 70 % da cota consumida com 26 usuários ativos. É por isso que a
hidratação incremental (11/08) e as fases de arquivo pesado vêm antes de qualquer coisa
cosmética.

## Banco — `app_storage`

731 linhas · 9 organizações com dado · 33 MB (tabela + índices) · índices 504 kB
(72 kB deles são o índice novo da Fase 1).

`admin_usage_stats()` devolve **27 organizações** (as demais existem em `profiles` sem
nada gravado).

### As sete maiores

| org (prefixo) | relatórios | só no legado | equip. vaso | chaves | bytes | legado | chaves c/ base64 | bytes base64 | % base64 |
|---|---|---|---|---|---|---|---|---|---|
| `06f84f2e` | 0 | 0 | 38 | 344 | 3,06 MB | 0 | 8 | 2,43 MB | **79 %** |
| `99f642d3` (teste) | 13 | 0 | 1 | 42 | 844 KB | 9,6 KB | 17 | 817 KB | **97 %** |
| `0a264586` | 0 | 0 | 1 | 23 | 456 KB | 0 | 5 | 432 KB | **95 %** |
| `32512667` | 2 | 0 | 3 | 85 | 427 KB | 2 B | 7 | 271 KB | 63 % |
| `92a28bff` | 3 | 0 | 0 | 64 | 371 KB | **112 KB** | 10 | 298 KB | 80 % |
| `32d3fa95` | 0 | 0 | 4 | 58 | 309 KB | 2 B | 6 | 172 KB | 56 % |
| `b923e641` | 0 | 0 | 2 | 29 | 9,1 KB | 0 | 0 | 0 | 0 % |

**O que estes números dimensionam:**

- **Base64 no banco (Fase 6).** A maior organização real tem **79 % do seu `app_storage`
  em blob base64** — 2,43 MB de 3,06 MB. Não é caso isolado: quatro das sete passam de
  60 %. É a maior fatia de dado no lugar errado que o sistema tem hoje. O número é um
  **piso** (conta chaves com o marcador `base64,`), então a fatia real é ≥ essa.
- **Legado do histórico (Fase 10A/10B).** `relatorios_legado = 0` em **todas** as
  organizações: tudo que estava no array já existe como registro próprio. A migração de
  14/08 terminou. O que sobra é peso morto — 112 KB numa organização, o resto residual.
  A remoção do legado é segura pelo lado do dado; falta só o tempo de guarda.
- **Contagem de relatórios.** 18 relatórios em toda a base (13 + 3 + 2).

## Bucket `inspecao`

| Medida | Valor |
|---|---|
| Arquivos | 220 |
| Bytes | **110,4 MB** |
| PDFs de relatório | **14** |
| **Tamanho médio de PDF** | **6,5 MB** |
| Fotos | 206 |
| Tamanho médio de foto | 77 KB |

| org (prefixo) | arquivos | bytes | relatórios | assinaturas | certificados | fotos |
|---|---|---|---|---|---|---|
| `32512667` | 75 | 60,9 MB | 44,3 MB | 41 KB | 527 KB | 16,0 MB |
| `92a28bff` | 34 | 26,9 MB | 24,3 MB | 0 | 552 KB | 2,03 MB |
| `99f642d3` | 9 | 19,0 MB | 18,9 MB | 12 KB | 0 | 142 KB |
| `06f84f2e` | 102 | 3,65 MB | 0 | 0 | 0 | 3,65 MB |

**O que estes números dimensionam:**

- **PDF rasterizado.** 14 arquivos ocupam **91 MB dos 110 MB** do bucket — 83 % do
  armazenamento em 6 % dos arquivos. Cada relatório emitido custa 6,5 MB porque a página
  é rasterizada em JPEG antes de virar PDF. Um PDF vetorial/híbrido derruba isso em uma
  ordem de grandeza, e derruba junto o egress de cada download no Portal.
- **Fotos já estão certas.** 77 KB de média é resultado da compressão no upload. O
  problema das fotos **não é o bucket** — é a cópia base64 que continua no `app_storage`
  (linha acima).
- **`06f84f2e` é o retrato do desequilíbrio:** 38 equipamentos, 102 fotos no bucket,
  ZERO relatório emitido — e ainda assim 79 % do dado dela no banco é base64.

## Como reproduzir

```sql
-- Como admin da plataforma (a função recusa qualquer outro chamador):
select * from admin_usage_stats() order by bytes_total desc;
select * from admin_storage_stats();
```

No SQL Editor, que roda como `postgres` e portanto sem `auth.uid()`, simule a sessão:

```sql
select set_config('request.jwt.claims', '{"sub":"<uuid-do-admin>"}', true);
select * from admin_usage_stats();
```

## Verificações feitas hoje

| Item | Resultado |
|---|---|
| Contagem de relatórios × contagem manual | organização de teste: **13 chaves `nr13_rel_` = 13 relatórios** ✔ |
| Dobra na convivência legado + novo | org `92a28bff`: 3 chaves novas + 3 ids no legado → **união 3** (somar daria 6) ✔ |
| Guarda de admin — `admin_usage_stats()` | mestre comum: `ERROR P0001: acesso negado` ✔ |
| Guarda de admin — `admin_storage_stats()` | mestre comum: `ERROR P0001: acesso negado` ✔ |
| Bucket × painel do Supabase | função 110,4 MB × gráfico ~110–122 MB ✔ |
| Organização sem dado | devolve zeros, sem erro ✔ |

## O que o painel media antes

Contava relatórios por `jsonb_array_length(nr13_historico_relatorios)`. Hoje isso daria
**1** para a organização que tem 13, e **0** para as duas que têm 2 e 3 — porque a chave é
legado desde 14/08 e só encolhe. Nenhuma das métricas de peso (banco, bucket, base64,
legado) existia.
