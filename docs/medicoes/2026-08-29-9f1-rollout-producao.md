# 9F.1 — ROLLOUT EM PRODUÇÃO (29/08/2026)

> **O que este arquivo é:** o registro do rollout da 9F.1 em produção — SQL aplicado,
> reprojeção, deploy, roteiro com a flag ligada **só** na organização de TESTE e rollback.
> Nenhuma organização cliente foi tocada. A 9F.2 não foi iniciada.

Organização de teste: `99f642d3-6efd-446d-9e76-d234ad8d211c` (`teste@gmail.com`).
Commit publicado: **`98e04cb`**.

---

## 1 · A DIVERGÊNCIA ENCONTRADA NO PREFLIGHT — e ela é de REGISTRO, não de operação

O registro anterior (`2026-08-29-9f1-gate-navegador.md` §8 e o commit `98e04cb`) diz
*"Produção intocada — nenhuma flag, nenhum SQL, nenhum deploy"*. **Não era verdade.**
Medido no banco antes de qualquer escrita, com consulta carimbada:

| arquivo | marcador medido | estado antes do rollout |
|---|---|---|
| `busca_index.sql` | `equipamentos_index.inspecoes` existe, `integer`, nullable | **JÁ APLICADO** |
| `busca_manutencao.sql` | `projetar_equipamento` contém `nr13_docs_` **e** `inspecoes = excluded.inspecoes` | **JÁ APLICADO** |
| `busca_index_rpc.sql` | `projetar_chave` contém `nr13_docs_` = **false** | não aplicado |
| `busca_consulta.sql` | retorno de `buscar_equipamentos` sem `inspecoes` | não aplicado |
| `inspecoes_v9_flag.sql` | `org_sync.inspecoes_v9` e `definir_inspecoes_v9` ausentes | não aplicado |

O marcador não é ambíguo: `nr13_docs_` **não existia** em `projetar_equipamento` antes do
commit `b555ddb` (conferido no git). Não há como datar um `create or replace` no Postgres —
a hipótese (aplicação na sessão anterior, sem atualizar o registro) fica como hipótese.

**O estado intermediário e o que ele custava:** `projetar_equipamento` GRAVAVA a contagem, mas
`projetar_chave` não reprojetava na mutação de `nr13_docs_`, e nada tinha sido reprojetado —
`inspecoes` nula nas 17 linhas contra 27 chaves `nr13_docs_` na verdade. Sem leitor (a RPC não
devolvia a coluna, a flag não existia), não quebrava nada. Era registro errado, não defeito.

**O trabalho parou aqui e a decisão foi do dono:** reaplicar os cinco na ordem — os já
aplicados por garantia, porque a conferência tinha sido por marcador, não linha a linha.

> **ARMADILHA DE MEDIÇÃO, registrada:** a primeira checagem usou `jsonb_array_length` como
> marcador de `projetar_equipamento` e deu **falso positivo** — esse marcador já existia desde
> a contagem de fotos. Marcador de etapa nova tem que ser exclusivo da etapa nova.

---

## 2 · SQL aplicado (5 arquivos, na ordem, do SHA `98e04cb`)

Carregados por `fetch` do `raw.githubusercontent.com` **pelo SHA do commit** e injetados no
Monaco — não digitados, não lidos do disco. Ordem: `busca_index` → `busca_manutencao` →
`busca_index_rpc` → `busca_consulta` → `inspecoes_v9_flag`. Todos "Success. No rows returned".

`busca_consulta.sql` derruba e recria `buscar_equipamentos`/`contar_equipamentos`; rodou com
`busca_v9` **desligada nas 30**, então nenhuma tela dependia delas nesse intervalo.

### Verificação — depois, no banco (carimbos 15:25:47 e 15:26:50)

| checagem | antes | depois |
|---|---|---|
| `equipamentos_index.inspecoes` | existe | existe |
| `projetar_equipamento` lê `nr13_docs_` | true | true |
| `projetar_chave` despacha `nr13_docs_` | **false** | **true** |
| retorno de `buscar_equipamentos` tem `inspecoes` | **false** | **true** |
| sobrecargas de `buscar_equipamentos` / `contar_equipamentos` | — | **1** e **1** |
| `org_sync.inspecoes_v9` · `definir_inspecoes_v9` | ausentes | **criados** |
| `inspecoes_v9` ligada | — | **0 de 30** (nasce desligada) |
| grants `buscar_equipamentos` / `contar_equipamentos` | — | anon **false**, authenticated **true** |
| grant `definir_inspecoes_v9` para authenticated | — | **false** (revogada) |

---

## 3 · Reprojeção — SOMENTE a organização de teste

4 TAGs (`nr13_info_` ∪ `nr13_docs_`), via `projetar_equipamento(org, tag)`. A organização
piloto em cliente (`92a28bff…`) **não foi reprojetada** — decisão de não tocar em conta cliente.

`auditar_projecao` da org de teste: **`convergiu: true`, `pendencias: 0`**, equipamentos
`{faltando 0, sobrando 0, defasadas 0, na_verdade 4, na_projecao 4}`, relatórios
`{faltando 0, sobrando 0, defasadas 0, tags 5/5}`.

**Paridade da contagem, linha a linha:**

| TAG | projetado | verdade (`jsonb_array_length` do `nr13_docs_`) | bate |
|---|---|---|---|
| COMPRESSOR V8-15/200L | **1** | **1** | ✅ |
| DASDSA | **NULL** | NULL (sem a chave) | ✅ |
| ZZ-FASE3 | **NULL** | NULL | ✅ |
| ZZ-TESTE-P2 | **NULL** | NULL | ✅ |

A regra `null ≠ 0` de pé: ausência de chave virou "não sei", não "nenhuma inspeção".

---

## 4 · Deploy do front

Coolify, Redeploy manual. Log: *"Importing felipe1santos/nr13-app:main (commit sha
98e04cb989e586135a98de3b82ff6dd0168e427f)"* — o mesmo SHA de onde o SQL saiu.

Bundle novo: **`assets/index-DkxtOk2G.js`** (o nome MUDOU desta vez), e ele **contém a string
literal `inspecoes_v9`** — conferido por `curl` **fora do navegador**, que é a única conferência
imune ao service worker (armadilha nº 1).

---

## 5 · Roteiro na organização de TESTE

### 5.0 · Linha de base — tela LEGADA, flag desligada, bundle novo

4 cartões · **0 campo de texto** · 262 nós de DOM · badges `1 / 0 / 0 / 0`.

### 5.1 · Flag ligada — `definir_inspecoes_v9(org, true)`

Conferido no banco antes de olhar a tela: teste `inspecoes_v9 = true`; piloto cliente
`false`; `busca_v9` 0; `boot_v9` 2 — **só a org de teste mudou**.

| # | passo | resultado |
|---|---|---|
| 1 | Tela nova sobe | campo "Buscar por TAG, equipamento, fabricante ou cliente…" presente |
| 2 | **Paridade** | **"4 resultados"**, as MESMAS 4 TAGs da tela legada |
| 3 | **Badge** | `COMPRESSOR` = **"1 Inspeção"**; as outras três **sem badge** — a diferença esperada contra a legada, que escrevia "0 Inspeções" por parsear o container e não achar nada |
| 4 | Busca por TAG (`ZZ-FASE`) | 1 resultado, `ZZ-FASE3`; URL vira `?q=ZZ-FASE` (estado na URL) |
| 5 | **Rede da busca** | **exatamente 2 requisições**: `rpc/buscar_equipamentos` + `rpc/contar_equipamentos`, ambas 200. **Zero** `storage`, **zero** PDF, **zero** `app_storage` |
| 6 | Termo inexistente | "Nenhum resultado" + *"Nenhum equipamento encontrado para XPTO-NAO-EXISTE-9F."* — mensagem explícita, não área vazia (é o defeito que a 9F.1.6 consertou) |
| 7 | Limpar | volta a 4, URL sem `?q=` |
| 8 | **Escolher equipamento** | 1 requisição a `app_storage` **filtrada pela TAG** (`chave=in.(… COMPRESSOR V8-15/200L)`) — a semeadura sob demanda da 9F.1.3, que antes ninguém chamava |
| 9 | Containers | "Teste barra 2026", 19/08/2026, 2 itens — bate com o badge `1` |
| 10 | Abrir o container | Ultrassom **Pendente**, Visual Interna **Preenchido** |
| 11 | Dados de campo | "Ver preenchido" abre com data 2026-08-19, TAG "vaso" e os itens 1–12+ — **sem regressão** |

### 5.2 · Rollback

`definir_inspecoes_v9(org, false)` → `inspecoes_v9` **0 de 30**, `boot_v9` **2**, `busca_v9` **0**.
Tela recarregada: **legada de volta** ("Equipamentos Cadastrados", sem campo de busca), mesmos
4 equipamentos, badges `1 / 0 / 0 / 0` — idênticos à linha de base de §5.0.

### Estado final do banco (16:29:24)

`equipamentos_index` **17** · `relatorios_index` **22** · `calibracoes_index` **18** ·
`busca_pendencias` **0** · `app_storage` **803** linhas vivas ·
`inspecoes` não-nula em **1** linha (o COMPRESSOR da org de teste).

---

## 6 · O QUE NÃO FOI MEDIDO — declarado, não presumido

1. **Escala na organização de teste.** Ela tem **4 equipamentos**. Virtualização, keyset e
   paginação **não foram exercitados aqui** — a prova deles é o gate de laboratório com
   1k/10k/50k (`2026-08-29-9f1-gate-navegador.md`). É a **mesma limitação declarada no
   fechamento da 9E**, e continua valendo: laboratório não é rollout.
2. **Cache frio / offline sob `inspecoes_v9`.** Não exercitado. A tela foi vista com o cache
   já quente da sessão.
3. **Montagem da tela do zero.** A volta a `/inspecoes` pela navegação interna fez **0**
   requisições (catálogo em memória). Os "2 pedidos para montar" do gate de laboratório não
   foram reproduzidos aqui — o que se mediu em produção foram os 2 pedidos **da busca**.
4. **Organização cliente.** `92a28bff…` não foi reprojetada nem teve a flag ligada.
   `cmam.caldeiras` segue intocada.

> **ARMADILHA DE MEDIÇÃO, nova e registrada:** instrumentar `window.fetch` **não vê** as
> chamadas do supabase-js — ele guarda a referência de `fetch` na criação do cliente. A
> instrumentação acusou "0 requisições" em passos que de fato fizeram requisição. Toda medida
> de rede deste registro veio do **CDP** (o painel de rede do navegador), não do wrapper.

---

## 7 · Estado ao fim

| | |
|---|---|
| SQL da 9F.1 em produção | **aplicado (5/5)** e verificado por marcador no banco |
| Projeção | org de teste reprojetada, `convergiu: true`, pendências 0 |
| Front | `98e04cb` publicado, bundle `index-DkxtOk2G.js` com `inspecoes_v9` |
| `inspecoes_v9` | **0 de 30** — desligada em todas |
| `busca_v9` / `boot_v9` | **0** / **2** — inalteradas |
| Conta cliente | nenhuma tocada · nenhum PDF regenerado · nenhum SHA-256 alterado |
| 9F.2 | **não iniciada** |
