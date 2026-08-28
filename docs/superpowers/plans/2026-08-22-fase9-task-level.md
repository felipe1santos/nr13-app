# FASE 9 — Escala, busca e carregamento sob demanda · task-level

## Estado atual da fase

**✅ 9A · 9B · 9C EM PRODUÇÃO — P9.2 FECHADO ✅ em 23/08/2026.**
A flag `busca_v9` está **DESLIGADA nas 29 organizações**: a tela de todo mundo é a antiga.

**9D CONCLUÍDA · P9.3 FECHADO ✅ (25/08/2026).** `boot_v9` ON em DUAS organizações: a de teste e o
piloto `92a28bff…` (gabriel.dadona). **`cmam.caldeiras` NÃO habilitada, por decisão do dono.**
**🚪 9E FECHADA ✅ pelo dono em 28/08/2026**, com DUAS limitações declaradas que NÃO valem por
inferência: **cache frio sob `boot_v9`** (não exercitado no rollout) e **paginação/keyset**
(validada em laboratório com 50.000; a organização de teste tem 12 relatórios). **`busca_v9`
segue OFF nas 30 — não habilitar em cliente.** **9F e 9G continuam NÃO autorizadas: a 9F não
começa sozinha.**
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

## 🚪 PORTÃO P9.2 — `/equipamentos` pela projeção, validado em produção · **FECHADO ✅ 23/08/2026**

| Exigência | Prova | |
|---|---|---|
| Flag ligada em **uma** org real | `…8d211c`, uma linha `true` em `org_sync`, as outras 28 intactas | ✅ |
| Conteúdo idêntico ao caminho antigo | **4 de 4 cartões idênticos caractere a caractere** OFF × ON; ficha pela ponte com os mesmos 466 nós | ✅ |
| Benchmark antes/depois publicado | `medicoes/2026-08-22-fase9c-indices.md`, `-tela.md`, `2026-08-23-etapa2-fase9-producao.md`, `2026-08-23-p92-validacao-frontend-8d211c.md` | ✅ |
| Offline validado no aparelho | `fetch` recusando `supabase.co` de verdade, com `navigator.onLine` seguindo `true`: catálogo local responde, selo aparece, fila durável com `mutation_id`, reconexão drena e a RPC reprojeta sozinha | ✅ |
| Rollback exercitado **de verdade** | ON → OFF: caminho antigo inteiro de volta, nada convertido, nenhuma outra organização afetada | ✅ |

> **O portão não fechou de primeira, e é isso que deu valor a ele:** a comparação campo a campo
> achou a cidade do cliente sumindo do cartão sob a V9, mais uma precedência de nome invertida que
> nenhuma organização real exercia. Só depois da correção — `cliente_nome` + `cliente_cidade`, em
> todos os caminhos da projeção — a paridade ficou em 4/4.

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

- [x] **9D.1** — `hidratarEssencial()` + teto real medido: **433 KB, constante** (`docs/medicoes/2026-08-24-9d1-teto-do-boot-producao.md`)
- [x] **9D.2** — `carregarEquipamento(tag)` (veio da 9C) + a passada que FALTAVA: `nr13_rel_<id>_<TAG>` pelo índice
- [x] **9D.3** — **Throttle de `lerTudo()`**, janela de 60 s; snapshot dentro da janela, fila nunca throttled
- [x] **9D.4** — `hidratarNoBoot()` sob `boot_v9`; as 3 migrações de varredura NÃO rodam no boot leve
- [x] **9D.5** — Cada consumidor do §1.2. `Dashboard`/`Vencimentos` ganharam o AGREGADO do §15,
      trazido da 9F por decisão do dono (a tela de entrada mostraria zero em silêncio);
      `limiteTrial` conta pela projeção (o teto do trial sumia); `Layout` pela mesma fonte;
      `LivroRegistro` hidrata SOB DEMANDA — é a única que cruza `nr13_livro_` de todo equipamento
- [x] **9D.6** — `bootLeve.pontaAPonta.test.ts`: palco IDÊNTICO ao da hidratação integral

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

- [x] **9E.1** — Busca e filtros em `/relatorios`
- [x] **9E.2** — Índices `9E-b1` a `9E-b4`, um por vez com benchmark
- [x] **9E.3** — **Contador sem parsear o registro pesado** (o achado G3 da Fase 8)
- [x] **9E.4** — Estado na URL
- [x] **9E.5** — **Abrir o relatório arquivado a partir da V9** (validado em produção em 28/08:
      dois relatórios abertos, SHA-256 da tela igual ao do banco). A V9 resolve o `pdfRef` no próprio
      `VisualizadorPdf` (`artefatoDoItemBuscado`); a rota ganhou a saída `legado=1`
      (`rotaRelatorios.ts`) e a tela antiga passou a abrir por link (`?tag=…&rel=…`), que é o
      caminho do relatório anterior ao §7-quater, sem arquivo. Nenhum PDF regenerado; nenhum
      SHA-256 alterado. Registro: `medicoes/2026-08-28-9e-destravamento.md`
- [x] **9E.6** — **`pdfRef ->> 'path'` na projeção** (o campo da `RefFoto` não se chama
      `caminho`). Era o defeito que deixava `pdf_ref` NULO em toda linha, **em silêncio** —
      inclusive nas que têm artefato e `sha256`. `busca_relatorios.sql` agora RECUSA ser aplicado
      sobre a projeção velha, e `testes-9e.sql` §6-quater projeta de verdade e exige o caminho.
- [x] **9E.7** — **Relatório de equipamento EXCLUÍDO**: escopo `ativos` por padrão (o conjunto da
      tela antiga), aviso com o número dos que ficaram de fora, selo na linha, escopos
      `historicos`/`todos` na URL, `historicos` na mesma linha da contagem. Guarda: sem
      `equipamentos_index` projetada ninguém é marcado e o escopo não corta — senão a tela diria
      "não há relatórios" para quem tem o parque inteiro.

### Testes

Busca por código, TAG, período e combinações · keyset com inserção concorrente · **PDF continua só
no clique** · offline · o histórico por equipamento continua funcionando.

### Benchmarks

`/relatorios` antes × depois; **e provar que a busca não baixa PDF nenhum**.

### Critérios de aceite

- [x] `/relatorios` tem busca com todos os requisitos do §13 do desenho — medido na org de teste em 28/08
- [x] Período funciona — `?de=2026-08-20&ate=2026-08-22` reduz de 3 para 2, e o de 19/08 sai
- [x] **Zero PDF baixado durante a busca** — 36 requisições registradas, nenhuma de `storage`
- [x] Contador não parseia o registro pesado — `contar_relatorios` devolve total e historicos direto da projeção
- [x] **Abrir o relatório arquivado** — 13 e 18 páginas, SHA-256 conferido contra o banco; legado sem artefato abre por `legado=1`
- [x] Rollback ON→OFF — `busca_v9` 0/30, projeções e índices intactos, tela antiga com os mesmos 3

**Evidência:** `medicoes/2026-08-28-9e-rollout-producao.md`.

> **🚪 GATE 9E FECHADO ✅ pelo dono em 28/08/2026**, com as duas limitações abaixo DECLARADAS —
> nenhuma delas foi aprovada por inferência:
>
> 1. **Cache frio sob `boot_v9`** — NÃO exercitado no rollout da organização de teste.
> 2. **Paginação / keyset** — validada em laboratório com 50.000 relatórios; NÃO exercitada na
>    organização de teste (12 relatórios contra página de 50). Não conta como teste de rollout
>    dessa organização.
>
> **`busca_v9` permanece OFF nas 30. Não habilitar em cliente sem autorização nova.**

**Deploy:** flag por tela.

---

# 9F · Demais telas de escala

**INICIADA em 28/08/2026 — bloco de análise.** Ordem do desenho (§14): `/inspecoes` e
`/prontuarios` · `/calibracoes` (+ tirar `listarCalibracoes` do render) · `/livro-registro` ·
`/vencimentos` e `/dashboard` (agregado híbrido, §15) · `/empresas` (busca na lista local).

**Uma tela por commit, uma flag por tela.** Testes e benchmarks no mesmo molde da 9C/9E.

> **O DEFEITO É O MESMO NAS QUATRO PRIMEIRAS TELAS, e tem nome:** `listarEquipamentos()`.
> `Inspecoes.tsx`, `Prontuarios.tsx`, `Calibracoes.tsx` e a `/relatorios` LEGADA chamam a mesma
> função, e ela começa com `await lerTudo()` — **hidratação completa**. Sob `boot_v9` isso desfaz
> o boot leve da 9D (20 KB × 354 KB medidos) na primeira visita a qualquer uma delas. Não são
> quatro problemas: é um, repetido quatro vezes.

---

## 9F.1 · `/inspecoes` — PRIMEIRA TELA

**Análise concluída em 28/08:** `medicoes/2026-08-28-9f-analise-inspecoes.md`.
**Nada foi alterado ainda — aguardando aprovação do dono para implementar.**

### O que foi medido (AS-IS)

| Achado | Medida |
|---|---|
| Lista inteira no DOM, sem busca nem paginação | org de teste: 4 equipamentos, 261 nós, 14 MB de heap, `tem_campo_busca: false` |
| **Badge "N Inspeções" parseia o container INTEIRO, 2× por cartão, no render** | `nr13_docs_` medida em produção: 27 chaves / 10 orgs · média **11,4 KB** · p95 **71,8 KB** · maior **117,3 KB** → projeção: **~22 MB de `JSON.parse` por render** com 1.000 equipamentos |
| `lerTudo()` desfaz o boot leve | `hidratarEssencial` não traz `nr13_info_`; a tela precisa da hidratação completa para ter o que mostrar |

> **ACHADO LATERAL, registrado e NÃO corrigido de improviso:** `carregarEquipamento(tag)` — a
> semeadura sob demanda do §4 do desenho, com teste próprio — **não é chamada por nenhuma tela**.
> Hoje fica mascarada porque `lerTudo()` traz tudo. No dia em que a 9F tirar o `lerTudo()`, ela
> passa a ser obrigatória: **entra como tarefa 9F.1.3**, não como conserto avulso.

### Tarefas

- [x] **9F.1.0** — Análise do caminho atual, com medida em produção e no banco
- [x] **9F.1.1** — Catálogo da tela vindo do SERVIDOR (`InspecoesV9.tsx`), com busca, keyset e
      virtualização — sem `lerTudo()`. Commit `ef10c90`
- [x] **9F.1.2** — **Badge sem parsear o container** (commit `b555ddb`). Caminho recomendado: coluna
      `inspecoes integer` em `equipamentos_index`, projetada de `nr13_docs_<TAG>`;
      `projetar_chave` já tem a porta (uma linha no `elsif`), e a contagem é
      `jsonb_array_length`. **Ausente é `null` = "não sei", nunca `0`** — o badge omite o número
      em vez de afirmar zero numa organização ainda não reprojetada
- [x] **9F.1.3** — `carregarEquipamento(tag)` LIGADO ao escolher a TAG, via
      `abrirEquipamentoParaInspecao`: semeia e só então lê, e não lança (offline segue com o
      cache). A semeadura existia desde a 9D e **nenhuma tela a chamava**
- [x] **9F.1.4** — Flag `inspecoes_v9` (`supabase/inspecoes_v9_flag.sql`) + **degrau de recuo
      novo** em `flag.ts`: banco sem a coluna nova não derruba `busca_v9` e `boot_v9` junto — o
      estado normal entre publicar o bundle e aplicar o SQL

> **ESTADO EM 28/08: implementada e verificada localmente (1439/1439, build verde). NADA foi
> aplicado em produção e NENHUMA flag foi ligada.** Falta o gate de navegador (1k/10k/50k), o SQL,
> a reprojeção e o roteiro na organização de teste — nesta ordem, e só com autorização.
> Registro: `medicoes/2026-08-28-9f1-inspecoes-implementada.md`

### Testes — ANTES da mudança

| Nível | O que trava |
|---|---|
| unidade | contagem por TAG a partir da projeção · `null` ≠ `0` no rótulo · estado na URL |
| unidade | a tela nova **não** chama `lerTudo()` (mesma instrumentação do `buscaRelatorios.semPdf.test.ts`) |
| SQL | `projetar_equipamento` conta o array de `nr13_docs_` · container criado/removido reprojeta · org sem a chave devolve `null` · isolamento entre organizações |
| navegador | 1k / 10k / 50k: nós de DOM constantes, heap estável, **zero leitura de `nr13_docs_` na lista** |
| produção | só depois da aprovação: flag ON na org de TESTE, paridade da contagem contra a tela antiga, rollback |

### Benchmark

`explain (analyze, buffers)` do catálogo antes × depois da coluna nova — ela não pode piorar a
consulta medida na 9C/9E.2.

---

## 9F.2…9F.6 · demais telas — NÃO INICIADAS

`/prontuarios` · `/calibracoes` · `/livro-registro` · `/vencimentos` + `/dashboard` (§15) ·
`/empresas`. Cada uma repete o molde: entender o caminho atual → escopo → testes antes →
benchmark → medir DOM/heap/rede → commit próprio → aprovação antes do rollout.

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

## Backfill — detalhado · **executado em DUAS organizações** em 23/08/2026 (`…8d0f7e` e `…8d211c`) · **nunca global**

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
| 23/08 | ✅ **ETAPA 2 APLICADA EM PRODUÇÃO.** Os 6 arquivos na ordem, buscados do repositório publicado e conferidos byte a byte. Passo 4 (collation) com as tabelas comprovadamente vazias | ✅ |
| 23/08 | Org piloto `…8d0f7e` escolhida. **Conflito de critérios registrado:** a única org com ≥20 equipamentos é a MAIOR, e nenhuma chega a 50 — paginação não é exercitável em produção | ⚠️ |
| 23/08 | Backfill: 4 equip. + 4 relatórios em **123 ms**, `convergiu: true`. **Projeção × verdade: 4 × 13 campos, todos idênticos** — inclusive TAGs com espaço duplo | ✅ |
| 23/08 | Busca em dado real: fabricante `schulz` acha `SCHULZ COMPRESSORES` e `Schulz`; série `I416366` acha `I-416366`. **O achado G1 da Fase 8 está resolvido em produção** | ✅ |
| 23/08 | Escrita controlada `ZZ-TESTE-9C-20260823`: criar → editar → excluir. `source_version` 1→2→removido, fabricante antigo saiu do índice, **zero fantasma**. Resíduo: 1 tombstone, declarado | ✅ |
| 23/08 | Isolamento: outras orgs e papel `cliente` veem **zero**. `busca_pendencias` recusa `authenticated` com `permission denied` — fail closed confirmado | ✅ |
| 23/08 | ⛔ **P9.2 NÃO pode fechar ainda:** o bundle do front com a 9C **não está em produção** (deploy manual do dono, no Coolify). Validação de interface pendente | ⏸️ |
| 23/08 | Bundle publicado. Validação de tela em `…8d211c` (OPÇÃO B — **a conta real do cliente não foi acessada**): OFF × ON, busca, debounce, DOM/rede, ponte, palco, offline real, fila, reconexão, rollback | ✅ |
| 23/08 | ⛔ **DIVERGÊNCIA DE PARIDADE:** a cidade do cliente some do cartão sob a V9, e a precedência do nome está invertida (`nomeFantasia` antes de `razaoSocial`) — este segundo é LATENTE, nenhuma org real o exercia | ⚠️ |
| 23/08 | Correção autorizada e aplicada: projeção passa a ter **`cliente_nome` + `cliente_cidade`**, composição na tela (`textoCliente()`), em TODOS os caminhos. Cidade **fora** do vetor de busca, por decisão registrada | ✅ |
| 23/08 | Prova sintética em produção com razão social ≠ nome fantasia: **`PARIDADE OK`**, zero resíduo. Reprojeção das duas orgs piloto: 4 lotes, **18,1 ms** no servidor | ✅ |
| 23/08 | Regressão curta: **4/4 cartões idênticos** OFF × ON · ficha 466 = 466 nós · busca por TAG, fabricante e nome do cliente · cidade não pesquisa, como projetado · offline curto com a cidade vinda do catálogo local | ✅ |
| 23/08 | **🚪 P9.2 FECHADO ✅ pelo dono.** Flag `busca_v9` de volta a OFF nas 29 organizações. **9D não iniciada** | ✅ |
| 24/08 | **9D escrita e commitada** (9D.1…9D.6), flag `boot_v9` ainda inexistente no banco; suíte 1298/1298 | ✅ |
| 25/08 | `revoke` de `vencimentos_org`/`f9_mais_meses` corrigido para `from public, anon` — `anon` HERDA de `public`, e o banco respondia `has_function_privilege(anon,…) = true` (`aa984c9`) | ✅ |
| 25/08 | **`origin/main` estava 3 commits atrás** — a 9D nunca fora pushada. Push feito; sem ele o Coolify publicaria o commit velho | ✅ |
| 25/08 | ⛔ **`busca_manutencao.sql` não tinha sido reaplicado:** `projetar_equipamento` em produção era a versão da 9C (8.177 bytes), sem `vida_base` e sem chamar `projetar_calibracoes` — `vida_base` nula e `calibracoes_index` vazia **com `auditar_projecao` dizendo `convergiu: true`** | ⚠️ |
| 25/08 | SQL da 9D aplicado inteiro (`boot_v9_flag`, `vencimentos_agregado`, `busca_manutencao` 9D, despachante com `nr13_calibracoes_`) e projeção refeita nas 2 orgs: `convergiu: true`, `pendencias: 0` | ✅ |
| 25/08 | Front publicado no Coolify (`aa984c9`). Marcador de bundle do ponto de retomada corrigido: usar a **string literal** `boot_v9`, não o nome de função `hidratarEssencial` (a minificação renomeia) | ✅ |
| 25/08 | **`boot_v9` LIGADA em `99f642d3…8d211c`** (org de teste). Roteiro: Dashboard, /vencimentos, /equipamentos, ficha, histórico (2 relatórios), relatório arquivado (13 págs), /livro-registro, **rollback** — paridade OK. Offline **não** exercitado | ✅ |
| 25/08 | **Prova offline real** (DevTools). ⛔ Achou 2 defeitos: (1) Dashboard exibia `EQUIPAMENTOS CADASTRADOS: 0` com 4 no cache — o painel caía em zero literal no caminho de erro; (2) `navigator.onLine` ficou `true` a sessão inteira com 50 requisições falhando, e na volta da rede NENHUM evento `online`/`visibilitychange` disparou: a fila ficou parada com internet | ⚠️ |
| 25/08 | Correções com teste (`599ac68`): `KpisPainel` com contadores opcionais + `textoContador` (`—`); `conectividade.ts` decide pelo erro REAL da fila; `retentativaRede.ts` (janela 45 s, só com evidência de queda). Suíte 1298 → **1315** | ✅ |
| 25/08 | Reprova em produção com o bundle novo: fila **3→2** sem clique e sem evento `online` (~74 s), servidor 9→10 com `pmtaAdotadaMpa 0.91`, projeção no mesmo timestamp, KPIs em `—` offline, auditoria **`convergiu: true`** nas 2 orgs, projeto **Healthy** | ✅ |
| 25/08 | Os ~74 s da retentativa explicados e travados por teste: o relógio já corria durante a queda; teto real = JANELA + TICK ≈ 49 s. Sem bug de timer, sem backoff, ciclo perpétuo, evidência persistida em disco. Suíte **1320** | ✅ |
| 25/08 | **PILOTO em organização CLIENTE** (`92a28bff…`, escolhida pelo dono): rebuild da projeção (3/8/3, `convergiu: true`), paridade OFF×ON **3/3 campo a campo**, boot **20 KB × 354 KB** (5,6 %), isolamento (1→2 orgs, `busca_v9` intocada), rollback conferido e religada. **P9.3 NÃO fechado** | ✅ |
| 25/08 | **9E construída** — SQL (`busca_relatorios.sql`), serviço, tela sob flag por sessão, 58 testes novos | ✅ |
| 25/08 | **Gate 9E.2 (banco)**: 1k→50k. 1ª passada **REPROVOU** (TAG 24.770 buffers, código 50.423, termo inexistente 50.423). Causa: `upper(tag)` sem índice + collation linguística não serve `LIKE 'ABC%'` + OR com ORDER BY/LIMIT levando a varredura ordenada. Corrigido com índice `text_pattern_ops` de TAG + RPC de dois caminhos + CTE `AS MATERIALIZED`: **55×–190×** melhor | ✅ |
| 25/08 | **Gate 9E (navegador)**: 1k/10k/50k. 50.000 relatórios no banco = **16 linhas** no DOM, heap constante, **zero** requisição de PDF | ✅ |
| 25/08 | **⛔ ROLLOUT DA 9E REPROVADO — 9E BLOQUEADA.** Passos 1–10 ✅ (SQL, índices, RLS, bundle `index-CuF2FwNz.js`, flag OFF nas 30, piloto na org de teste, busca visível, 15 resultados, `Sem data`, zero PDF). **Passo 11: "Visualizar" não abre nada** — `aoAbrir` navega para uma rota que a própria flag impede de renderizar a tela legada. Rollback ON→OFF conferido: `busca_v9` 0/30, `boot_v9` 2, projeções 23/17/18, 6 índices, tela antiga com os mesmos 3 relatórios da linha de base | ⛔ |
| 25/08 | **🚪 P9.3 FECHADO ✅ pelo dono. 9D CONCLUÍDA.** Evidência aceita como DISTRIBUÍDA entre laboratório (escala, essencial constante, testes), organização de teste (interface real, offline, fila, reconexão, rollback) e piloto real (rebuild, paridade, boot leve, rollback). **`cmam.caldeiras` NÃO habilitada** — a organização de maior risco não vira requisito artificial para fechar um portão. Expansão a clientes: gradual, com autorização separada. **9E autorizada** | ✅ |
| 28/08 | **9E DESTRAVADA no código** — três defeitos consertados com teste: (1) a navegação, agora a V9 abre o `pdfRef` no próprio visualizador e a rota tem a saída `legado=1` para o relatório sem arquivo; (2) **`pdfRef ->> 'caminho'` × `path`** na projeção, o NULL silencioso que deixava `pdf_ref` nulo nas 15 linhas, inclusive nas 4 com artefato — agora com guarda no `busca_relatorios.sql` e teste de projeção de verdade; (3) relatório de equipamento excluído com escopo, aviso e selo. **1410/1410** · build verde. **A 9E só sai de BLOQUEADA com o rollout repetido em produção** | 🔧 |
| 28/08 | **ROLLOUT DA 9E REPETIDO EM PRODUÇÃO — PASSOU.** `busca_manutencao.sql` aplicado (`prosrc` com `->> 'path'`) → reprojeção só de relatórios nas orgs já projetadas (**linhas com `sha256` e sem `pdf_ref`: 11 → 0**) → `busca_relatorios.sql` aplicado (1 sobrecarga de cada, anon=false/auth=true, 6 índices) → front `a944845` publicado (**o nome do bundle NÃO mudou; a prova foi a string literal**) → flag ON na org de teste: 3 resultados (paridade), aviso de 12 excluídos, `Sem data`, busca por TAG, termo inexistente, período, **zero PDF**. **Passo 11 APROVADO**: dois relatórios abertos (13 e 18 páginas), SHA-256 da tela **igual ao do banco**, incl. um de equipamento EXCLUÍDO; legado sem artefato abriu por `legado=1`. Rollback ON→OFF conferido: 0/30, boot_v9 2, 22/17/18, 6 índices, tela antiga com os mesmos 3. Falta só a decisão do dono | ✅ |
| 28/08 | **🚪 9E FECHADA ✅ pelo dono.** Aceito como provado: SQL aplicado · projeção corrigida · `pdf_ref`/`path` · busca em produção · RLS · índices · busca V9 · ativos e históricos de equipamento excluído · abertura real do PDF · SHA-256 · zero PDF durante a busca · rollback · 1410/1410 · build verde · árvore limpa · **nenhuma conta pagante habilitada**. **DUAS LIMITAÇÕES DECLARADAS, não aprovadas por inferência:** cache frio sob `boot_v9` (não exercitado no rollout) e paginação/keyset (laboratório com 50.000; a org de teste tem 12). **`busca_v9` fica OFF nas 30 — não habilitar em cliente. A 9F NÃO está autorizada** | ✅ |

---


> ### ✅ P9.2 FECHADO — 23/08/2026
>
> **Leia este bloco primeiro. Ele basta para retomar sem contexto nenhum.**
>
> | | |
> |---|---|
> | 9A | **CONCLUÍDA** — projeções, RLS, rebuild, reparo e auditoria |
> | 9B | **CONCLUÍDA** — projeção mantida pela RPC, falha contida em savepoint |
> | 9C | **CONCLUÍDA E VALIDADA EM PRODUÇÃO** — `/equipamentos` pela projeção, sob `busca_v9` |
> | **P9.1** | **APROVADO** |
> | **P9.2** | **FECHADO ✅** pelo dono, depois da correção de paridade do cartão |
> | Testes | **1244/1244** · 30 testes SQL · build verde |
> | Produção | ETAPA 1 (RLS `STABLE`) + infraestrutura 9A/9B/9C aplicadas · **flag OFF nas 29 organizações** |
>
> **Estado de produção, exato:**
>
> - as seis funções auxiliares da RLS estão **`STABLE`** (883 buffers contra 1.695);
> - as projeções, a RPC de manutenção, os índices, a consulta e a flag estão instalados;
> - **duas** organizações têm projeção convergida: `…8d0f7e` (4 equip.) e `…8d211c` (4 equip.);
> - **`busca_v9` está DESLIGADA em todas as 29** — a tela de todo mundo é a antiga;
> - `app_storage` **inalterada**: 891 chaves, 32,9 MB.
>
> **A evidência do P9.2 ficou dividida em duas organizações**, para não acessar a conta real do
> cliente (decisão OPÇÃO B do dono):
>
> | organização | o que provou |
> |---|---|
> | `…8d0f7e` | **servidor**, com dado rico: projeção × verdade 4 × 13 campos, busca em todas as modalidades, cursor, isolamento, ciclo criar→editar→excluir sem fantasma |
> | `…8d211c` | **tela**: OFF × ON, busca, debounce (10 teclas → 1 RPC), URL, DOM/rede sem PDF, ponte, palco, offline com requisição realmente falhando, fila durável com `mutation_id`, reconexão, reprojeção automática, rollback |
>
> **O portão só fechou depois de uma divergência achada e corrigida.** A cidade do cliente sumia
> do cartão sob a V9, e a precedência do nome estava invertida — defeito LATENTE, que só aparece
> quando razão social ≠ nome fantasia, e nenhuma organização validada exercia isso. A projeção
> passou a ter **`cliente_nome` + `cliente_cidade`**, com a composição na tela (`textoCliente()`),
> e a correção alcançou TODOS os caminhos: estrutura, projetor, manutenção pela RPC, rebuild,
> reparo, consulta, catálogo offline, item pendente e testes. Migração para banco já instalado:
> `supabase/busca_cliente_paridade.sql`.
>
> Resultado final: **4 de 4 cartões idênticos caractere a caractere entre OFF e ON**, ficha pela
> ponte com os mesmos 466 nós, `PARIDADE OK` na prova sintética com razão social ≠ nome fantasia
> (`scripts/fase9/teste-cliente-paridade.sql`, rodada em produção e desfeita pela própria
> exceção), auditoria convergida nas duas organizações, **zero pendências**.
>
> **Decisão registrada, e ela vale para o futuro:** a **cidade NÃO entra no vetor de busca**. A
> busca do caminho legado não pesquisa cliente nem cidade; e mudar a expressão de uma coluna
> gerada obriga a derrubá-la e recriá-la, com rewrite da tabela e do GIN. Se um dia for pedida,
> entra nos DOIS lados juntos — servidor e `catalogoLocal.ts` — com medição.
>
> **Medições:** [P9.2 · frontend `…8d211c`](../../medicoes/2026-08-23-p92-validacao-frontend-8d211c.md)
> (§11 correção · §12 regressão curta) · [ETAPA 2](../../medicoes/2026-08-23-etapa2-fase9-producao.md)
> · [ETAPA 1](../../medicoes/2026-08-23-etapa1-rls-stable-producao.md)
>
> **Próximo passo:** a 9D está **em produção desde 25/08**, ligada só na organização de teste
> (ver `medicoes/2026-08-25-9d-sql-aplicado-producao.md`). A decisão em aberto é subir `boot_v9`
> para organização de cliente, e em que ritmo.
>
> **Proibições que seguem valendo:** não ligar `boot_v9` para organização de cliente sem a
> pré-condição do §4.1 do ponto de retomada · não ligar `busca_v9` para outras organizações · não rodar backfill global · não migrar `/relatorios` · não tocar nos 40+
> templates · não iniciar a Fase 10 · não iniciar PDF vetorial.
