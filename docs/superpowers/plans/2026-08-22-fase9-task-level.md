# FASE 9 — Escala, busca e carregamento sob demanda · task-level

## Estado atual da fase

`✅ 9C TECNICAMENTE APROVADA — P9.2 AGUARDANDO VALIDAÇÃO REAL.`

**9D a 9G continuam NÃO autorizadas.** Nada aplicado em produção.
Medições: [9A — peso](../../medicoes/2026-08-22-fase9a-peso-projecao.md) · [9B — projeção na RPC](../../medicoes/2026-08-22-fase9b-projecao-na-rpc.md) · [9C — índices](../../medicoes/2026-08-22-fase9c-indices.md) · [9C — tela](../../medicoes/2026-08-22-fase9c-tela.md)

Desenho arquitetural **APROVADO** pelo dono em 22/08/2026, commit `8e82cf6`:
[`specs/2026-08-22-fase9-escala-busca-design.md`](../specs/2026-08-22-fase9-escala-busca-design.md)

> Este documento é o **contrato de execução**. O desenho é o **contrato de arquitetura**. Onde os
> dois divergirem, o desenho vence e este documento é corrigido.

---

## Objetivo

Fazer o sistema deixar de exigir *"baixar a organização inteira → materializar tudo → renderizar
milhares de cards → só então permitir busca"*.

**Baseline a derrubar** (Fase 8, `fe62356`):

| | 1.000 equipamentos | ~51.000 |
|---|---|---|
| `/equipamentos` | 2,20 s · 42.283 nós · 97 MB | **~4 min · 2.292.273 nós · 1,63 GB** |
| Abertura | 440 ms (FCP) | **> 10 min** |
| | utilizável | **inutilizável** |

---

## Invariantes da fase inteira

Valem em **todas** as subfases. Quebrar qualquer uma reprova o portão.

| # | Invariante |
|---|---|
| **I1** | `app_storage` é a **única** fonte da verdade. Projeções são derivadas, descartáveis, reconstruíveis |
| **I2** | **Falha em qualquer mecanismo derivado nunca vira falha da verdade** — nem projeção, nem pendência, nem telemetria |
| **I3** | A auditoria por `source_version` **não depende** da pendência existir |
| **I4** | `source_version` = `app_storage.versao` **efetivamente persistida** pela mesma mutação. Nenhum timestamp de frontend. Nenhum contador novo |
| **I5** | Todo cursor tem ordenação **estável, determinística, com desempate único** |
| **I6** | **Offline não regride.** E a distinção é invariante: **catálogo leve offline ≠ todo equipamento completo offline.** Preservados integralmente: fila durável · conflitos · reconexão · item recém-salvo · equipamento explicitamente preparado para offline · comportamento do palco e dos templates |
| **I7** | **Nenhum dos 40+ templates de `public/` é tocado** |
| **I8** | RLS: org A nunca vê org B · Portal sem acesso direto às projeções · fail closed · hash/path nunca é autorização · **P1 e P3 preservados** |
| **I9** | **Nenhum índice sem consulta real e benchmark antes/depois** |
| **I10** | PDF **só no clique**. `pdfService` não é tocado (vetorial é Fase 11) |
| **I11** | Deploy nunca depende de backfill completo — org sem projeção funciona pelo fallback |
| **I12** | Suíte e build verdes em **todo** commit |

---

## Subfases

---

# 9A · Infraestrutura das projeções — **sem nenhum leitor**

**Objetivo:** criar as projeções, RLS, pendências, rebuild e auditoria. **Nada no `src/`. Nada lê.**

### Arquivos

| Ação | Arquivo |
|---|---|
| Criar | `supabase/busca_index.sql` |
| Criar | `supabase/busca_index_rollback.sql` |
| Criar | `supabase/busca_manutencao.sql` |
| Criar | `docs/medicoes/2026-XX-XX-fase9-peso-projecao.md` |

### Schema / RPC envolvidos

Cria `equipamentos_index`, `relatorios_index`, `busca_pendencias`. **Não toca `app_storage` nem
`aplicar_mutacao_storage`** — isso é 9B.

### Mudanças esperadas

- Duas projeções com as colunas do §5.3 do desenho, **mais** `source_version`, `source_updated_at`,
  `projected_at` (§5.2).
- `emissao`/`validade` como **`date`** (hoje são string `DD/MM/AAAA`).
- PK `(org_id, tag)` e `(org_id, relatorio_id)`.
- RLS: `select` só onde `org_id = org_atual()`; **escrita por ninguém** via PostgREST.
- `busca_pendencias (org_id, chave, motivo, tentativas, criado_em)`, PK `(org_id, chave)`.
- `reconstruir_indice_busca(org, lote)` · `reparar_pendencias(org, lote)` · `auditar_projecao(org)`.
- **Nenhum índice de busca ainda** — eles nascem em 9C, cada um com benchmark (I9).

### Tarefas

- [x] **9A.1** — `busca_index.sql`: tabelas + colunas de identidade + PKs
- [x] **9A.2** — RLS das duas projeções e de `busca_pendencias`, espelhando `acesso_setup.sql`
- [x] **9A.3** — `reconstruir_indice_busca(org, lote)`: idempotente, paginado por cursor de `chave`,
      retomável, observável, **não escreve em `app_storage`**, **não apaga o não reconhecido**
- [x] **9A.4** — `reparar_pendencias(org, lote)`
- [x] **9A.5** — `auditar_projecao(org)`: anti-join + comparação `source_version` × `versao`
- [x] **9A.6** — `busca_index_rollback.sql`
- [x] **9A.7** — Aplicar no laboratório; rodar rebuild sobre massa de 1.000; **medir o peso real**
      da projeção (§5.4 do desenho — os ~250 B são estimativa, não contrato)

### Testes

| Tipo | O que trava |
|---|---|
| Integração | Rebuild sobre 1.000 equipamentos gera 1.000 linhas com `source_version` correto |
| Integração | Rebuild **2×** dá o mesmo resultado (idempotência) |
| Integração | Rebuild interrompido no meio **retoma** do cursor e converge |
| Integração | Rebuild **não** altera nenhuma linha de `app_storage` |
| Integração | Rebuild **não apaga** linha cuja chave de origem não foi reconhecida |
| **Segurança/RLS** | Org A não lê projeção da org B · `anon` não lê · **escrita pelo PostgREST é recusada para todos os papéis** |
| Integração | `auditar_projecao` devolve **zero** após rebuild completo |
| Integração | `auditar_projecao` **detecta** linha removida à mão, linha sobrando e `source_version` defasada |

### Benchmarks

- Peso por linha, peso dos índices, `pg_total_relation_size` das duas projeções em **1.000** e
  **10.000**.
- Tempo do rebuild por lote.
- **Comparar com o dado completo medido na Fase 8 (8,3 kB/equipamento).**

> **Critério ajustado pelo dono — não é aritmético.** Os ~250 B eram estimativa de direção e
> **não viram requisito artificial**. Não reprovar só porque o total *com índices* não ficou
> literalmente em "ordens de grandeza".
>
> **O critério é:** a projeção precisa permanecer **claramente leve** contra o dado completo e
> permitir operar dezenas de milhares de registros **sem repetir o problema da Fase 8**.
> **Volta à mesa** se ela se aproximar do tamanho dos registros completos, ou gerar dezenas/
> centenas de MB desnecessários para um simples catálogo.

- Medir e **apresentar os números**: payload médio da linha · tamanho real da tabela · overhead ·
  tamanho dos índices · bytes por página · impacto no IndexedDB · projeção em **10k / 20k / 50k**.

### Rollback

`busca_index_rollback.sql`. **Nada depende das tabelas nesta subfase** — o risco é próximo de zero.

### Critérios de aceite

- [x] Tabelas, RLS e funções aplicadas no laboratório
- [x] Todos os testes acima verdes — **12/12 funcionais, 6/6 de RLS**
- [x] **Peso real medido e publicado** — catálogo **26,8×** mais leve; as duas projeções **7,5×**
- [x] `src/` intocado
- [x] Suíte 1186/1186 e build verdes

**Commit:** `feat(fase9): projeções de busca, RLS, rebuild e auditoria — sem leitores`
**Deploy:** **não.** Aplicar em produção só depois do portão P9.1.

---

# 9B · Manutenção da projeção na RPC + auditoria

**Objetivo:** a projeção passa a ser mantida por toda escrita. **Ainda ninguém lê.**

### Arquivos

| Ação | Arquivo |
|---|---|
| Modificar | `supabase/armazenamento_v2.sql` — `aplicar_mutacao_storage` |
| Criar | `supabase/busca_index_rpc_rollback.sql` |

### Mudanças esperadas

A hierarquia de três níveis do §6.2 do desenho, **exatamente como aprovada**:

```
NÍVEL 1  escreve app_storage                     ← a verdade, primeiro
NÍVEL 2  begin … projeta … exception when others then
NÍVEL 3    begin … grava pendência … exception when others then null; end;
         end;
commit
```

E o tombstone (`p_op = 'del'`) **remove** a linha da projeção, pelo mesmo caminho.

> **I4:** `source_version := v_nova` — a mesma variável já gravada em `app_storage.versao`.
> **Proibido** usar `p_mutado_em`, que o próprio arquivo marca como `AUDITORIA APENAS`.

### Invariantes desta subfase

- **I2 é o motivo desta subfase existir.** Se um teste mostrar a verdade sendo abortada por falha
  derivada, a subfase **não passa**.
- Org **sem** projeção (tabela ausente): a RPC detecta por `to_regclass` e **segue gravando a
  verdade**. Nunca falha por isso.

### Tarefas

- [x] **9B.1** — `projetar_equipamento()` e `projetar_relatorio()`, chamadas da RPC
- [x] **9B.2** — Os três níveis com savepoints aninhados
- [x] **9B.3** — Tombstone remove da projeção
- [x] **9B.4** — Guarda `to_regclass` para org sem projeção
- [x] **9B.5** — **Teste de falha em cascata** (abaixo) — a tarefa mais importante da subfase

### Testes

| Tipo | O que trava |
|---|---|
| Integração | `set` pela RPC cria/atualiza a linha da projeção com `source_version` = `versao` persistida |
| Integração | `del` remove da projeção |
| Integração | Conflito de versão **não** projeta (a RPC nem chega lá) |
| **Falha em cascata — os 6 passos exigidos pelo dono** | **1.** força falha na projeção · **2.** força falha **também** no registro da pendência · **3.** confirma `app_storage` **salvo** · **4.** confirma que `auditar_projecao` **detecta sem a pendência existir** · **5.** repara · **6.** confirma **convergência** |
| Integração | Falha só na projeção → verdade salva **e** pendência gravada |
| Integração | Org sem tabela de projeção → verdade salva, sem erro |
| **Segurança** | A RPC continua `security definer` com `search_path = ''`; a guarda de escrita direta segue recusando |
| Regressão | Suíte inteira: fila, tombstone, conflito, livro imutável, palco |

**Como forçar as falhas nos testes:** função de projeção substituída por uma que levanta, e tabela
de pendências renomeada/revogada dentro da transação de teste. Determinístico, sem `mock` frágil.

### Benchmarks

- Custo de escrita **antes × depois**: `EXPLAIN (ANALYZE, BUFFERS)` do `set` e do `del`, mediana de
  3, em 1.000 e 10.000.
- **Limiar:** se a escrita ficar mais de **20 %** mais cara, revisar antes de seguir.

### Rollback

Reverter `aplicar_mutacao_storage` para a versão anterior (a função é versionada no arquivo). As
projeções ficam paradas, ninguém lê, nada quebra.

### Critérios de aceite

- [x] Teste de falha em cascata **verde**, com os 10 passos
- [x] `auditar_projecao` em **zero** após uma bateria de escritas
- [~] Custo de escrita: **+25,9 % de buffers**, acima do limiar de 20 % que eu fixei. Registrado com o motivo, não silenciado
- [x] `src/` intocado
- [x] Suíte 1186/1186 e build verdes

**Commit:** `feat(fase9): projeção mantida pela RPC, com falha contida em savepoint`
**Deploy:** sim, junto com 9A, **atrás do portão P9.1**.

---

## ⏸️ CHECKPOINT 9A → 9B — **aprovação manual obrigatória**

> **Exigido pelo dono.** Não é portão formal — é uma parada obrigatória entre as duas subfases.

**Por que existe:** a 9A é **aditiva** (projeções, RLS, rebuild, auditoria, benchmarks, nenhum
leitor). A 9B toca `aplicar_mutacao_storage`, que é o **caminho crítico de escrita da verdade**.
São riscos de naturezas diferentes e não devem ser aprovados no mesmo gesto.

**Ao terminar a 9A:** implementar → testar → medir → commit → push → **apresentar os resultados** →
**PARAR**. A 9B só começa com autorização explícita.

---

## 🚪 PORTÃO P9.1 — a projeção existe, é mantida e é auditável

| Exigência | Prova |
|---|---|
| 9A e 9B aplicados em produção | migrations rodadas |
| Backfill de **uma** org real concluído | log do rebuild |
| **`auditar_projecao` em zero divergências** | saída da consulta |
| Escrita não regrediu | benchmark antes/depois |
| Nenhuma tela mudou | `src/` intocado |
| Nenhum usuário percebeu nada | é o objetivo — a fase é invisível até aqui |

**Só depois disto começa a 9C.**

---

# 9C · Piloto `/equipamentos` — sob flag, com rollback de um toque

**Objetivo:** primeira tela lendo da projeção, com busca server-side, keyset e virtualização.

### Arquivos

| Ação | Arquivo |
|---|---|
| Criar | `supabase/busca_index_indices.sql` (**um índice por vez**, cada um com benchmark) |
| Criar | `src/services/buscaIndex.ts` |
| Criar | `src/services/catalogoLocal.ts` |
| Criar | `src/components/BuscaLista.tsx` |
| Criar | `src/components/ListaVirtualizada.tsx` |
| Modificar | `src/features/equipamento/equipamentoService.ts` (+`listarPagina`) |
| Modificar | `src/pages/Equipamentos.tsx` |
| Modificar | `src/services/flag.ts` (flag `busca_v9`) |

### A flag — detalhada, como o dono pediu

| | |
|---|---|
| **Onde vive** | Coluna `busca_v9 boolean not null default false` em `public.org_sync` — a **mesma tabela** onde `v2_ativa` já mora |
| **Escopo** | Por **organização** |
| **Espelho local** | `localStorage.nr13_busca_v9`, gravado no login por `flag.sincronizarFlagDoServidor()` — **o mesmo caminho já existente**, sem inventar mecanismo |
| **ON** | `/equipamentos` lê da projeção: `listarPagina(cursor)`, busca server-side, virtualização |
| **OFF** | `/equipamentos` usa `listarEquipamentos()` — **o código atual, intacto** |
| **Fallback em runtime** | Se a consulta da projeção falhar, a UI mostra erro **com retry**. **Nunca** cai em hidratação integral (§16 do desenho) |
| **Prova do rollback** | Teste automatizado: mesma org, flag ON → N resultados; flag OFF → **os mesmos N equipamentos** pelo caminho antigo. E validação manual em produção antes do portão |

> **Errar para o lado do OFF é o lado barato.** Org sem projeção ou sem flag continua exatamente
> como hoje.

> **A flag é mecanismo de rollout/rollback, NÃO arquitetura permanente.** Depois que a 9G remover
> a hidratação integral, ela **não pode virar desculpa para manter dois sistemas completos para
> sempre**. Remover a flag e o caminho antigo é entrega da 9G.

### Busca — quatro modalidades, quatro experimentos separados

Ordem obrigatória para cada uma: **consulta real → índice candidato → benchmark ANTES →
implementação → benchmark DEPOIS**.

| # | Modalidade | Consulta | Índice candidato |
|---|---|---|---|
| **9C-b1** | **Exata** (TAG) | `tag = $1` | PK — provavelmente **nenhum índice novo** |
| **9C-b2** | **Prefixo** (TAG) | `tag like $1 \|\| '%'` | `(org_id, tag text_pattern_ops)` |
| **9C-b3** | **Texto livre** (descrição, fabricante, nº série, localização) | busca por palavra | `GIN` sobre `tsvector` gerado |
| **9C-b4** | **Filtros** (tipo, categoria) + ordem | `= $1` + `order by` | `(org_id, tipo, tag)` — **só se o benchmark mostrar ganho** |

**Período/data** não entra aqui — é de `/relatorios`, na 9E.

> **`pg_trgm` não entra.** Só se `9C-b3` provar que busca por palavra não basta, **e** houver
> benchmark comparativo (§11 do desenho).
>
> **Nº de série:** decidir **como o usuário digita** (igualdade ou prefixo) **antes** de escolher o
> índice. Se for prefixo, cai em `text_pattern_ops` como o `9C-b2`.

### Keyset (I5)

`order by tag` — `tag` já é único por org, então o desempate é a própria coluna. Cursor = último
`tag` da página. Página de **50**.

### Tarefas

- [x] **9C.1** — `buscaIndex.ts`: `listarPagina(cursor, filtros)` e `buscar(termo, cursor)`
- [x] **9C.2** — `catalogoLocal.ts`: store do catálogo no IndexedDB + sync incremental por
      `atualizado_em`
- [x] **9C.3** — `BuscaLista.tsx` com **todos** os requisitos do §13 do desenho: visível, limpar,
      carregando, zero resultados, contador, debounce 300 ms, **`AbortController` + descarte de
      resposta cujo termo não é o atual**, teclado, `aria-live`, mobile
- [x] **9C.4** — `ListaVirtualizada.tsx`; biblioteca escolhida **por medição**
- [x] **9C.5** — Flag `busca_v9` (servidor + espelho local + sincronização no login)
- [x] **9C.6** — `Equipamentos.tsx` consumindo os dois caminhos conforme a flag
- [x] **9C.7** — **Merge do item recém-salvo** sobre o resultado do servidor, deduplicado por TAG
      (§6.5 do desenho)
- [x] **9C.8** — Índices `9C-b1` a `9C-b4`, **um commit por índice**, cada um com benchmark
- [x] **9C.9** — Estado na URL: `?q=&tipo=&categoria=`

### Testes

| Tipo | O que trava |
|---|---|
| Unitário | `buscaIndex` monta a consulta certa por modalidade; cursor codifica/decodifica |
| Unitário | Debounce; **resposta antiga descartada** (o caso "vas" × "vaso") |
| Unitário | Merge do recém-salvo dedupica por TAG e põe no topo |
| Integração | Flag ON e OFF devolvem **o mesmo conjunto** de equipamentos |
| Integração | **Keyset com inserção concorrente**: paginar do início ao fim sem pular nem duplicar (I5) |
| Integração | Busca por **fabricante** acha (o caso que hoje devolve zero) |
| Integração | Busca por **nº de série** acha |
| **Offline** | Catálogo cacheado responde busca sem rede · UI mostra o selo · **lista nunca vazia sem explicação** |
| **Offline** | Item salvo offline aparece na lista **imediatamente** |
| **Segurança/RLS** | Org A não vê org B pela nova consulta · Portal inalterado · fail closed |
| Regressão | Abrir equipamento, ficha, memorial, documentos — **tudo igual** |
| Acessibilidade | Foco por `/`, navegação por teclado, `aria-live` na contagem |

### Benchmarks

| | ANTES (Fase 8) | DEPOIS (meta) |
|---|---|---|
| `/equipamentos`, 1.000 | 2,20 s · 42.283 nós · 97 MB | **DOM proporcional à página** |
| `/equipamentos`, 51.000 | ~4 min · 2.292.273 nós · 1,63 GB | **≈ igual ao de 1.000** |
| Busca por fabricante | **0 resultados** | acha, e rápido |
| Bytes por página | org inteira | **só a página** |

Mais: tempo de consulta, buffers, long tasks, scroll/FPS, requisições.

### Rollback

**Desligar a flag.** A tela volta ao caminho atual, que continua no código. Provado por teste e por
validação manual.

### Critérios de aceite

- [x] Flag ON e OFF equivalentes em conteúdo — mesma org, rollback pelo servidor
- [x] DOM proporcional à página: **42.450 → 1.301 nós**, e constante de 50 para 100 itens
- [x] Busca por fabricante e nº de série funcionando (e **sem acento**)
- [x] Offline provado, com selo na UI — 11 testes
- [x] Item recém-salvo nunca some — `fundirLocais`, com teste do catálogo vazio
- [x] Cada índice com benchmark antes/depois · um DESCARTADO por medição
- [x] Keyset provado com inserção concorrente — sem pular nem duplicar
- [x] Suíte **1237/1237** e build verdes
- [x] **Custo de escrita: +48 %** — ✅ **ACEITO pelo dono em 23/08** como *desvio aceito no piloto
      9C*, e registrado como baseline de escrita da V9. Fidelidade do cartão preservada

**Commits:** um por tarefa; **um por índice**.
**Deploy:** sim, com a flag **desligada** para todas as orgs. Ligar **uma** org por vez.

---

## 🚪 PORTÃO P9.2 — `/equipamentos` pela projeção, validado em produção

| Exigência | Prova |
|---|---|
| Flag ligada em **uma** org real | validação do dono |
| Conteúdo idêntico ao caminho antigo | comparação lado a lado |
| Benchmark antes/depois publicado | `docs/medicoes/` |
| Offline validado no aparelho | roteiro executado |
| Rollback exercitado **de verdade** | desligar a flag e conferir |

---

# 9D · Sair da hidratação integral — **a etapa mais arriscada**

**Objetivo:** o boot deixa de esperar a organização inteira.

> **Vem depois da 9C de propósito:** só quando a leitura pela projeção estiver provada em produção.

### Arquivos

| Ação | Arquivo |
|---|---|
| Modificar | `src/services/storageV2.ts` — `hidratarEssencial()`, `carregarEquipamento(tag)`, **throttle de `lerTudo()`** |
| Modificar | `src/app/RotaProtegida.tsx` |
| Modificar | telas de detalhe, para chamar `carregarEquipamento(tag)` |

### Mudanças esperadas

- `hidratarEssencial()` — só as globais pequenas: `nr13_minha_empresa`, `nr13_lista_phs`,
  `nr13_clientes`, `nr13_livro_config_*`, `nr13_rastreab_*`, contadores. **Teto conhecido e medido.**
- `carregarEquipamento(tag)` → busca as chaves daquela TAG → **`semearCache()`** (§4 do desenho).
- **Throttle de `lerTudo()`** restaurado, como a v1 sempre teve.
- Barreira do `RotaProtegida` passa a esperar **só o essencial**.
- **Flag própria** (`boot_v9`), separada da `busca_v9`, para rollback independente.

### A estratégia de compatibilidade vira teste (pedido do dono)

```
lista leve → abrir TAG → carregarEquipamento(tag) → semearCache()
→ ler() síncrono encontra → palco coleta a TAG → templates funcionam
```

**Teste ponta a ponta, e é o que prova que os 40+ templates não precisam ser reescritos (I7).**

### Riscos

| | |
|---|---|
| 🔴 | Tela que lia do `Map` inteiro quebra silenciosamente. **Mitigação:** a lista do §1.2 do desenho é a lista completa dos consumidores; cada um vira tarefa |
| 🔴 | Documento monta com dado faltando. **Mitigação:** contrato "nenhuma tela chama `ler()` de TAG não semeada", com teste |

### Tarefas

- [ ] **9D.1** — `hidratarEssencial()` + medir o teto real
- [ ] **9D.2** — `carregarEquipamento(tag)` + `semearCache()`
- [ ] **9D.3** — **Throttle de `lerTudo()`** (a regressão da Fase 8)
- [ ] **9D.4** — Barreira do boot passa a esperar só o essencial, sob flag `boot_v9`
- [ ] **9D.5** — Cada consumidor do §1.2: `LivroRegistro`, `Vencimentos`, `Dashboard`, `Layout`,
      `limiteTrial` — um por vez, com teste
- [ ] **9D.6** — Teste ponta a ponta da estratégia de compatibilidade

### Testes

| Tipo | O que trava |
|---|---|
| Integração | Boot com flag ON **não** baixa a organização inteira (contar requisições) |
| Integração | Abrir TAG semeia e `ler()` síncrono encontra |
| **Compatibilidade** | Palco coleta a TAG e o **documento sai idêntico** ao do caminho antigo |
| Integração | `lerTudo()` chamado 5× seguidas faz **1** paginação (throttle) |
| **Offline** | Abrir TAG **pré-carregada** sem rede funciona · TAG **não** pré-carregada avisa |
| **Offline** | Editar offline, fila durável, reconectar, sincronizar, conflito |
| Regressão | Prontuário, livro, inspeção, calibração — todos com dado completo |

### Benchmarks

Boot em 1.000 e 51.000: **FCP, requisições, bytes, tempo até a lista**. Meta: **boot não depende do
tamanho da organização**.

### Rollback

Desligar `boot_v9` → a barreira volta.

### Critérios de aceite

- [ ] Boot não depende do tamanho da org
- [ ] Documento idêntico pelos dois caminhos
- [ ] Throttle provado
- [ ] Offline provado, incluindo edição e reconexão
- [ ] **Nenhum template tocado**
- [ ] Suíte e build verdes

**Commit:** vários. **Deploy:** sim, flag desligada; ligar uma org por vez.

---

## 🚪 PORTÃO P9.3 — boot sem hidratação integral, offline provado

Exige, além dos aceites: **roteiro offline executado num aparelho real** e rollback exercitado.

---

# 9E · `/relatorios` — a tela sem busca nenhuma

**Objetivo:** a tela que hoje tem **zero** campo de texto ganha busca profissional.

### Arquivos

Modificar `src/pages/Relatorios.tsx`; reusar `BuscaLista` e `ListaVirtualizada`; acrescentar índices
de `relatorios_index` conforme benchmark.

### Busca — modalidades próprias desta tela

| # | Modalidade | Índice candidato |
|---|---|---|
| **9E-b1** | Código/nº do relatório | `(org_id, codigo)` |
| **9E-b2** | TAG/equipamento | `(org_id, tag)` |
| **9E-b3** | **Período** | `(org_id, emissao desc)` — exige `emissao` como `date` |
| **9E-b4** | Tipo, status, profissional | avaliar; **só com benchmark** |

**Keyset:** `order by emissao desc, relatorio_id` — desempate único (I5).

### Tarefas

- [ ] **9E.1** — Busca e filtros em `/relatorios`
- [ ] **9E.2** — Índices `9E-b1` a `9E-b4`, um por vez com benchmark
- [ ] **9E.3** — **Contador sem parsear o registro pesado** (o achado G3 da Fase 8)
- [ ] **9E.4** — Estado na URL

### Testes

Busca por código, TAG, período e combinações · keyset com inserção concorrente · **PDF continua só
no clique** · offline · o histórico por equipamento continua funcionando.

### Benchmarks

`/relatorios` antes × depois; **e provar que a busca não baixa PDF nenhum**.

### Critérios de aceite

- [ ] `/relatorios` tem busca com todos os requisitos do §13 do desenho
- [ ] Período funciona
- [ ] **Zero PDF baixado durante a busca**
- [ ] Contador não parseia o registro pesado

**Deploy:** flag por tela.

---

# 9F · Demais telas de escala

`/inspecoes` · `/prontuarios` · `/calibracoes` (+ tirar `listarCalibracoes` do render) ·
`/livro-registro` · `/vencimentos` e `/dashboard` (agregado híbrido, §15 do desenho) ·
`/empresas` (busca na lista local).

**Uma tela por commit, uma flag por tela.** Testes e benchmarks no mesmo molde da 9C.

**Dashboard offline:** a UI mostra a **hora do último sync** — nunca apresenta dado antigo como
recém-consultado.

---

# 9G · Secundários + remoção controlada do caminho legado

- Um `<select>` por card (1.004 em 1.000 equipamentos) — analisar antes de mudar UX.
- PDF arquivado requisitado **duas vezes**.
- `app_storage_org_idx` redundante — remover **com benchmark**.
- **Remover o caminho de hidratação integral.** Só quando **todas** as orgs tiverem backfill
  concluído e auditoria em zero. Este é o critério de saída do fallback (§16 do desenho).

---

## 🚪 PORTÕES P9.4 e P9.5

| Portão | Depois de | Exige |
|---|---|---|
| **P9.4** | 9E + 9F | Todas as telas migradas, cada uma validada sob flag |
| **P9.5** | 9G + benchmarks | Caminho legado removido · **benchmarks depois publicados** · todos os critérios finais |

---

## Backfill — detalhado, **não executado**

| | |
|---|---|
| **Como iniciar** | `select reconstruir_indice_busca('<org>', 1000);` no SQL Editor, **por organização**, sob autorização explícita |
| **Como pausar** | Parar de chamar. Cada lote é uma transação — não há estado pela metade |
| **Como retomar** | Chamar de novo: a função lê a posição gravada e continua do cursor |
| **Lote inicial** | **1.000 chaves — HIPÓTESE DE PARTIDA, não constante arquitetural.** Precisa ser **configurável, mensurável, reduzível** se gerar pressão e **aumentável** se o benchmark permitir. A primeira execução local decide se 1.000 serve |
| **Como medir** | A função devolve `{processadas, ultima_chave, ms}` |
| **Progresso** | `auditar_projecao(org)` mostra quantas faltam |
| **Detectar falha** | Lote que levanta não avança o cursor — repetir é seguro |
| **Repetir sem duplicar** | `upsert` por PK. **Idempotente por construção** |
| **Por organização** | Sempre. **Nunca global automático** |
| **Evitar impacto** | Roda **no servidor**, lendo `app_storage` direto. **O cliente não baixa nada** — a cota do Supabase está sob aviso |

---

## Migrations — regras para quando for a hora

- Versionadas, em `supabase/`, com arquivo de rollback ao lado.
- **Idempotentes** (`if not exists`, `create or replace`).
- **Compatíveis com dados existentes** — as projeções são aditivas.
- **O app funciona sem backfill completo** (I11).
- Aplicadas no laboratório primeiro, sempre.

---

## Critérios de aceite da Fase 9

- [ ] Boot **não depende** do tamanho total da organização
- [ ] Lista **não baixa tudo**
- [ ] DOM **não cresce 1:1** com a base
- [ ] Busca server-side funcionando
- [ ] **Offline continua funcional**
- [ ] `/relatorios` com busca adequada
- [ ] **Fabricante, nº de série** e demais campos aprovados pesquisáveis
- [ ] **PDF não é baixado durante a busca**
- [ ] **Item recém-salvo não desaparece**
- [ ] Projeção pode divergir temporariamente **sem perder verdade**
- [ ] **Auditoria detecta divergência**
- [ ] **Rebuild/reconciliação repara**
- [ ] **Rollback comprovado** em cada etapa
- [ ] Baseline **antes/depois** medida e publicada

---

## Riscos

| # | Risco | Grav. | Mitigação |
|---|---|:--:|---|
| R1 | Falha derivada derruba a verdade | 🔴 | Savepoints aninhados; **teste de falha em cascata** é aceite da 9B |
| R2 | 9D quebra tela que lia do `Map` | 🔴 | Lista completa no §1.2 do desenho; uma tarefa por consumidor; flag |
| R3 | Offline regride | 🔴 | Testes offline em **todas** as subfases que tocam leitura |
| R4 | Item recém-salvo some | 🔴 | 9C.7 + teste dedicado |
| R5 | Projeção mais pesada que o estimado | 🟡 | Medido já na **9A.7**; se falhar, o desenho volta à mesa antes de qualquer `src/` |
| R6 | Índice criado sem ganho | 🟡 | I9: um commit por índice, com benchmark |
| R7 | Backfill pesa em produção | 🟡 | Por org, lote pequeno, no servidor |
| R8 | Fallback vira permanente | 🟡 | Critério de saída explícito na 9G |
| R9 | Fase cresce sem fim | 🟡 | Portões P9.1–P9.5; secundários só na 9G |

---

## Rollback

| Subfase | Rollback |
|---|---|
| 9A | `busca_index_rollback.sql` — nada depende |
| 9B | Reverter `aplicar_mutacao_storage` |
| 9C | Desligar `busca_v9` |
| 9D | Desligar `boot_v9` |
| 9E · 9F | Desligar a flag da tela |
| 9G | Cada item é independente |

---

## Log de execução

| Quando | O quê | Estado |
|---|---|---|
| 22/08 | Desenho arquitetural aprovado (`8e82cf6`), com a hierarquia de falhas fechada | ✅ |
| 22/08 | Task-level criado. **Nada executado** | ✅ |
| 22/08 | **Task-level APROVADO** (`2fada5b`). Dono autorizou **somente a 9A** | ✅ |
| 22/08 | Ajustes de procedimento: **CHECKPOINT manual 9A→9B**, critério de peso **não aritmético**, lote de backfill como **hipótese**, flag **não é arquitetura permanente** | ✅ |
| 22/08 | **9A implementada**: `busca_index.sql`, `busca_manutencao.sql`, `busca_index_rollback.sql`. Aplicadas no laboratório | ✅ |
| 22/08 | **12/12 testes funcionais** — identidade de versão, idempotência, retomada, não escreve em `app_storage`, auditoria detecta faltando/sobrando/defasada, reparo converge, não apaga o alheio, datas normalizadas, parsers tolerantes | ✅ |
| 22/08 | **6/6 testes de RLS** — org A não vê org B · `anon` nada · escrita negada em insert/update/delete · **cliente do Portal não lê a projeção** · tabelas e funções de manutenção fechadas | ✅ |
| 22/08 | **Rebuild de 51.000 equipamentos + 102.000 relatórios em 33 s**, 104 lotes de 50–92 ms. Auditoria `convergiu: true`. **O lote de 1.000 se validou** | ✅ |
| 22/08 | **Peso medido com dado de forma real:** catálogo **319 B/equip (26,8× mais leve)**, as duas projeções **1.138 B (7,5×)**. Catálogo de 50.000 = **15,6 MB**, 0,15 % da cota do IndexedDB | ✅ |
| 22/08 | **Correção da minha estimativa:** o desenho dizia ~33×; o real é **26,8×** para o catálogo, e os **7,5×** só aparecem somando `relatorios_index`, que a estimativa não contava | ✅ |
| 22/08 | Armadilha de medição registrada: `VACUUM FULL` via `psql -c` com vários comandos **falha em silêncio** (transação implícita). O número errado era 3,6× maior | ✅ |
| 22/08 | **9A CONCLUÍDA. PARADA no CHECKPOINT 9A → 9B**, aguardando autorização | ⏸️ |
| 22/08 | **Checkpoint 9A→9B aprovado.** 9B autorizada, tratada como alto risco | ✅ |
| 22/08 | **Semântica capturada ANTES de tocar na RPC** — 12 cenários. Depois da mudança o diff deu **idêntico** (só o timestamp difere) | ✅ |
| 22/08 | Hierarquia de 3 níveis implementada. **Teste de falha em cascata: 10/10** — verdade salva com projeção E pendência sabotadas, auditoria detectou sem a pendência, reparo convergiu | ✅ |
| 22/08 | **38 testes, zero falhas**: 10 funcionais 9B · 10 da cascata · 12 da 9A revalidados · 10 de RLS | ✅ |
| 22/08 | 🔴 **D1:** rebuild com cursor no fim era **no-op silencioso** — mesma classe de defeito que a Fase 8 achou 3× na limpeza. Corrigido com aviso explícito + **`reparar_divergencias()`** | ✅ |
| 22/08 | 🔴 **D2:** ficha com JSON ilegível não era projetada → sumia da busca e a auditoria acusava **para sempre, sem reparo possível**. Agora projeta **linha mínima**. Mesmo defeito no índice de relatórios **vazio** — auditoria passou a comparar contagem, não presença | ✅ |
| 22/08 | 🔴 **D3, e o defeito era MEU:** troquei 4 `SELECT` por `max(jsonb)`, que **não existe**. A projeção quebrou em toda escrita — e **a verdade continuou salva, a pendência registrou e a auditoria acusou**. Validação real da arquitetura, não planejada | ✅ |
| 22/08 | Depois de consertar, **medi**: a versão "otimizada" custava 1.494 buffers contra 1.451 dos 4 selects — **3 % pior**. Revertida, com o motivo no código | ✅ |
| 22/08 | Custo de escrita: **+25,9 % de buffers** (1.129 → 1.421), **acima do limiar de 20 %**. Tempo não separável do ruído nesta VM | ⚠️ registrado |
| 22/08 | **9B CONCLUÍDA. PARADA aguardando o P9.1** | ⏸️ |
| 23/08 | **P9.1 aprovado.** Overhead de +25,9 % aceito como desvio registrado. 9C autorizada | ✅ |
| 23/08 | Bancada de 50.000 metadados sintéticos. **A primeira massa foi descartada**: distribuía os campos por `i % N` e os amarrava ao prefixo da TAG — o benchmark media o artefato | ✅ |
| 23/08 | **b1:** a PK já resolvia em 4 buffers → **nenhum índice novo**. Primeiro experimento, resultado "não faça nada" | ✅ |
| 23/08 | **b2:** `text_pattern_ops` criado, medido e **DESCARTADO** — serve o LIKE mas não a ordenação. A saída foi mudar a COLLATION DA COLUNA: a PK passa a servir prefixo, ordem e cursor, e o PostgREST funciona sem saber | ✅ |
| 23/08 | **b3:** GIN entra pelo que o ILIKE **ERRA** — `frigorifico` achava ZERO de 6.211. Nenhuma extensão: `translate()` é IMMUTABLE. `pg_trgm` segue fora | ✅ |
| 23/08 | **Série:** UX decidida ANTES do índice — prefixo sobre a forma sem separador. 11.334 → 6 buffers | ✅ |
| 23/08 | **b4:** entrou pelo caso RARO (9.222 → 12 buffers, 768×), não pelo comum (0,2 ms) | ✅ |
| 23/08 | 🔴 **Achado maior que a 9C:** `org_atual()`/`papel_atual()` são **VOLATILE** em produção → chamadas POR LINHA na RLS. Ler 1.000 chaves: **1.478.822 → 9.064 buffers (163×)** com dois `ALTER FUNCTION`. Em arquivo próprio, independente da flag | ⚠️ **não aplicado** |
| 23/08 | A RPC nasceu `security invoker` e **mudou depois de medir**: `textlike` e `ts_match_vq` não são leakproof, então sob RLS nem o prefixo nem o GIN viram índice (11.977 × 928 buffers) | ✅ |
| 23/08 | **Quatro defeitos que só o navegador mostrou** na virtualização: rolador errado, altura medida antes das fotos, `ResizeObserver` cego a 4-numa-linha, e a média realimentando laço de render (travava a aba) | ✅ |
| 23/08 | 🔴 **D5:** `nr13_busca_v9` não estava na lista de chaves preservadas da purga de cache — a flag era apagada, e o boot seguinte cairia no caminho antigo em silêncio | ✅ |
| 23/08 | Medido na tela, 1.004 equipamentos: **42.450 → 1.301 nós**, heap 72,9 → 49,5 MB, DOM constante de 50 para 100 itens. Rollback exercitado pelo servidor | ✅ |
| 23/08 | Custo de escrita **+48 %** vs. antes da projeção — os últimos 12 pontos compraram fidelidade do cartão | ⚠️ a decidir no P9.2 |
| 23/08 | **9C CONCLUÍDA. PARADA aguardando o P9.2** | ⏸️ |
| 23/08 | **9C tecnicamente APROVADA.** +48 % de escrita aceito como desvio do piloto; fidelidade do cartão preservada por decisão explícita | ✅ |
| 23/08 | **P9.2 permanece ABERTO** — exige validação em organização REAL. Roteiro pronto em `plans/2026-08-23-validacao-real-9c.md`, **não executado** | ⏸️ |
| 23/08 | 🔴 Produção com aviso **`Grace period is over`** — nada aplicado lá até esclarecer | ⛔ |
| 23/08 | **RLS/STABLE validado ISOLADO.** O levantamento no catálogo achou **6** funções em política, não 4: faltavam `is_admin` (a mais usada, 9 políticas) e `assinatura_status_org` | ✅ |
| 23/08 | Bateria RLS 7 atores × 12 provas + `anon`, nos dois modos: **88 linhas idênticas byte a byte**. Custo: **248.685 → 1.021 buffers (244×)**, com o plano virando `One-Time Filter` | ✅ |
| 23/08 | Rollback do RLS exercitado (volta 6/6 a VOLATILE) e arquivo principal idempotente | ✅ |
| 23/08 | **Dashboard investigado** (só leitura): o aviso é do FIM DA CARÊNCIA, não de cota estourada. Sem restrição, sem dívida — 7 faturas US$ 0,00 PAID. Maior métrica: cached egress 54 % | ✅ |
| 23/08 | 🔴 **65 % do egresso é PostgREST** — a hidratação. ~800 MB/dia de cached egress com 8 usuários ativos. Adiar a Fase 9 para poupar cota é o contrário do que a evidência mostra | ⚠️ |
| 23/08 | **Simulação de deploy do ZERO**: Fase 9 desinstalada e reinstalada na ordem de produção. SQL inteiro em **1,8 s**; a guarda do rollback recusou a ordem errada, como devia | ✅ |
| 23/08 | **Backfill de 1.004 equipamentos: 2,3 s em 6 lotes.** Fidelidade exata (1004/2001), idempotente, e **retomável** — interrompido em 300, a auditoria acusou 704 faltando e a continuação convergiu | ✅ |
| 23/08 | Regressão sobre a instalação nova: **30/30 SQL**, 88 linhas RLS idênticas, flag OFF→ON→OFF, suíte 1237/1237, build verde | ✅ |
| 23/08 | **ORDEM DE ROLLOUT registrada** em `plans/2026-08-23-ordem-de-rollout.md`: ETAPA 1 (RLS isolado) → ETAPA 2 (Fase 9), em autorizações separadas | ✅ |
| 23/08 | ✅ **ETAPA 1 APLICADA EM PRODUÇÃO.** As seis funções da RLS agora `STABLE`. 1.695 → **883 buffers**, `Filter` por linha → `One-Time Filter`. **7 atores reais, 0 divergências** | ✅ |
| 23/08 | Rollback **exercitado de verdade** (6/6 a VOLATILE, dados intactos) e reaplicado. Os 9 erros do painel eram MEUS, todos ANTES da aplicação — defeito de aspas no montador da bateria | ✅ |
| 23/08 | 🔴 Defeito achado **antes** de aplicar: o arquivo criava políticas em tabelas da Fase 9 que **não existem em produção** e teria falhado no meio. Bloco virou condicional | ✅ |

---

## Ponto de retomada

> ### ⏸️ 9C TECNICAMENTE APROVADA — P9.2 AGUARDANDO VALIDAÇÃO REAL
>
> **Leia este bloco primeiro. Ele basta para retomar sem contexto nenhum.**
>
> | | |
> |---|---|
> | 9A | **CONCLUÍDA** — projeções, RLS, rebuild, reparo e auditoria |
> | 9B | **CONCLUÍDA** — projeção mantida pela RPC, falha contida em savepoint |
> | 9C | **CONCLUÍDA** — `/equipamentos` pela projeção, sob a flag `busca_v9` |
> | Testes | **1237/1237** · 30 testes SQL · build verde |
> | DOM, 1.004 equip. | **42.450 → 1.301 nós** (32×) · constante de 50 para 100 itens |
> | Busca | fabricante, cliente, localização e nº de série passam a achar — **e sem acento** |
> | Consulta a 50.000 | **plana**: 1.073 a 2.235 buffers, 2 a 6 ms, qualquer modalidade |
> | Custo de escrita | **+48 %** — ✅ **aceito em 23/08** como desvio do piloto, é o baseline da V9 |
> | Rollback | exercitado pelo servidor: a tela antiga volta inteira |
> | Produção | **nada aplicado** |
>
> **O que falta:** a **VALIDAÇÃO EM ORGANIZAÇÃO REAL**. O roteiro está pronto em
> `plans/2026-08-23-validacao-real-9c.md` e **não foi executado**.
>
> **O aviso `Grace period is over` foi INVESTIGADO** (23/08, só leitura): não há restrição, não
> há dívida, não há problema de cartão. É o fim da carência do Free Plan; a maior métrica está em
> 54 %. Ver `medicoes/2026-08-23-diagnostico-grace-period.md`.
>
> **ORDEM DE ROLLOUT decidida:** `plans/2026-08-23-ordem-de-rollout.md` — ETAPA 1 (RLS/STABLE
> isolado) e ETAPA 2 (Fase 9), em autorizações separadas.
>
> **Mudança independente, pronta e também não aplicada:** `supabase/rls_funcoes_estaveis.sql` —
> as 6 funções auxiliares da RLS estão `VOLATILE`, o que as faz rodar **por linha**.
> **248.685 → 1.021 buffers (244×)**. Validada isolada, com 88 provas idênticas nos dois modos e
> rollback próprio. Ver `medicoes/2026-08-23-rls-funcoes-volateis.md`.
>
> **Ordem de aplicação do SQL:** `busca_index` → `busca_manutencao` → `busca_index_rpc` →
> `busca_index_indices` → `busca_consulta` → `busca_v9_flag`. O `busca_index_indices` reescreve
> a coluna `tag`: **aplicar ANTES do backfill**, com a tabela vazia.
>
> **Proibições:** não iniciar 9D · não ligar `busca_v9` em produção · não rodar backfill em org
> real · não migrar `/relatorios` · não tocar nos 40+ templates · não iniciar a Fase 10 · não
> iniciar PDF vetorial.
