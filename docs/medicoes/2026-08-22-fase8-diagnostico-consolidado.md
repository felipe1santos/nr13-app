# FASE 8 — Diagnóstico consolidado e o que a Fase 9 precisa corrigir

**22/08/2026** · laboratório Supabase local · **nada em `src/` alterado** · **nenhum índice criado**
· **massa em produção: ZERO**

Registros de origem:
[laboratório e F8.1](2026-08-22-fase8-laboratorio-e-f81.md) ·
[auditoria de busca e listas](2026-08-22-fase8-auditoria-busca-e-listas.md)

---

## 1 · A pergunta de produto, respondida

> *"Uma empresa com milhares de equipamentos e dezenas de milhares de relatórios consegue encontrar
> qualquer item em segundos, sem percorrer listas enormes e sem o navegador carregar a base
> inteira?"*

**Hoje: NÃO.** E agora isso tem número, não opinião.

Com **51.000 equipamentos** carregados no laboratório, medido no navegador:

| | |
|---|---|
| Abertura do app | **> 10 minutos** em "Carregando…" |
| `/equipamentos` | **2.292.273 nós no DOM** |
| Heap JS na mesma tela | **1.630 MB** (o limite do navegador é 4.002 MB) |
| Bloqueio da thread principal ao montar a lista | **~4 minutos**, com **zero** requisição de rede |
| Depois de montada | um `querySelectorAll('img')` **não completa em 45 s** |
| Requisições de hidratação | **583** onde **111** bastavam |

A tela não fica lenta — ela fica **inutilizável**. E o usuário não chegou a digitar nada ainda:
tudo isso acontece **antes** da primeira busca.

**A causa não é o algoritmo de busca.** É que a busca só pode começar depois de o navegador baixar
e materializar a organização inteira.

---

## 2 · Os quatro gargalos estruturais

### G1 · Não existe busca no servidor — em lugar nenhum

Varredura em todo o `src/`: **zero** `.ilike(`, `.like(`, `.textSearch(`, `.or(`, `to_tsquery`.
As únicas consultas ao `app_storage` são a hidratação e leitura de chave única.

Toda busca de tela é `.filter()` em JavaScript sobre o `Map` já hidratado.

**Isso responde sua pergunta sobre o índice:** `app_storage_org_atualizado_idx` serve hidratação
e **não serve busca — nunca poderia**, porque não há consulta de busca para ele atender.

O que o schema de hoje consegue e não consegue, medido com 50.000 equipamentos:

| | Plano | Buffers | Tempo |
|---|---|---:|---:|
| TAG exata | `Index Scan` | **4** | **0,07 ms** ✅ |
| Relatórios de **um** equipamento | `Index Scan` | **4** | **0,10 ms** ✅ |
| **Prefixo de TAG** | `Parallel Seq Scan` | 10.917 | 26 ms ❌ |
| Nº de série / nome / fabricante | `Parallel Seq Scan` | 10.917 | 57 ms ❌ |
| Relatório por código | `Parallel Seq Scan` | 10.917 | 80 ms ❌ |

> **Por que nem o prefixo funciona:** o banco é `en_US.UTF-8` e o índice é `btree (org_id, chave)`
> com opclass `text_ops` padrão. Btree em collation não-C **não serve `LIKE 'prefixo%'`**. Sem
> `text_pattern_ops`, até o caso mais fácil é varredura completa.

### G2 · Nenhuma tela tem paginação, cursor ou virtualização

**Nenhuma. Em nenhum lugar.** O DOM cresce 1:1 com a base: medi **~45 nós por card**, então:

| Equipamentos | Nós no DOM (projetado do medido) |
|---:|---:|
| 1.000 | ~45.000 |
| 5.000 | ~225.000 |
| **51.000** | **2.292.273 — medido** |

A única contenção que existe é o `slice(0, 6)` do Dashboard, e ele limita a **exibição**, não o
**cálculo**.

### G3 · `/relatorios` faz `JSON.parse` do registro pesado só para desenhar um contador

`contarRelatorios(tag)` → `listarIndice(tag)` parseia **todo** `nr13_rel_` daquele equipamento —
~2,5 KB cada, com os snapshots congelados do §7-bis — **mesmo quando o índice leve já tem aquele
relatório**. O resultado só é descartado depois.

| Equipamentos × 2 relatórios | `JSON.parse` | Bytes parseados |
|---:|---:|---:|
| 1.000 | 2.000 | ~5 MB |
| 5.000 | 10.000 | ~25 MB |
| 50.000 | **100.000** | **~250 MB** |

### G4 · O throttle de `lerTudo()` existe na v1 e se perdeu na v2

`storageV1.ts:276` tem a guarda, com o comentário que descreve exatamente o defeito:

> *"as telas de lista chamam `lerTudo()` a cada navegação, o que re-baixava o banco INTEIRO a cada
> clique no menu — a «demora do banco»."*

Na v2 a janela de 60 s protege só `atualizarDoServidor()`. **`lerTudo()` ficou sem throttle**, e é
chamada por `RotaProtegida` (todo boot) e por `listarEquipamentos` (toda navegação para
Equipamentos, Relatórios, Inspeções, Prontuários, Calibrações) — duas paginações completas
concorrentes já no boot.

Medido: **583 requisições onde 111 bastavam**. É **regressão da v1 para a v2**, não defeito novo
de escala.

---

## 3 · O que está CERTO e não deve ser mexido

| | |
|---|---|
| **Arquitetura de PDF** | O índice é leve, carrega `pdfRef`, e o PDF **só é resolvido no clique** (`artefatoDe` só aparece em imprimir/baixar). Ter 50.000 PDFs no Storage **não** faz o sistema enumerá-los. Exatamente a arquitetura que você descreveu ✅ |
| **Armazenamento v2** | IndexedDB com **10.317 MB** de cota contra os 5 MB do `localStorage` da v1; uso em 59,9 MB. O teto de 5 MB saiu do caminho, como a §2-ter prometia ✅ |
| **Palco** | `localStorage` com **5 KB** sem documento aberto — o palco esvazia direito ✅ |
| **Fotos** | `FotoImg` + `IntersectionObserver`: a foto só decodifica ao entrar na viewport (Fase 5) ✅ |
| **`app_storage_org_atualizado_idx`** | Com ele o primeiro boot **não cresce** — 913 buffers de 500 a 5.000 equipamentos; sem ele vai a 6.347. **Manter** ✅ |

**O gargalo não é armazenamento nem PDF.** É hidratação total + ausência de busca no servidor +
DOM sem teto.

---

## 4 · O que a Fase 9 precisa corrigir — lista objetiva

Ordem de retorno pelo custo. **Nada disso foi implementado.**

| # | Correção | Classe | Custo | Por que nesta ordem |
|---|---|---|---|---|
| **1** | **Não parsear o registro pesado quando o índice leve já tem o relatório** (`historicoRelatorios.ts:197-200`) | A | **muito baixo** | É um `if`. Não muda schema nem arquitetura, e derruba ~250 MB de parse em 50.000 equipamentos |
| **2** | **Restaurar o throttle de `lerTudo()` na v2**, como a v1 já tinha | A | **baixo** | Regressão conhecida, correção conhecida. Corta 5,3× das requisições de boot |
| **3** | **Paginação / keyset + virtualização** nas 5 telas 🔴 (`/equipamentos`, `/relatorios`, `/inspecoes`, `/prontuarios`, `/calibracoes`, `/livro-registro`) | A | médio | Sem isto o DOM continua 1:1 com a base, e nenhuma busca salva a tela |
| **4** | **Busca server-side** — exige decidir **onde os metadados pesquisáveis vão viver**, porque hoje `valor` é `text` opaco e toda busca por conteúdo é `Seq Scan` | A | **alto — precisa da sua decisão** | Ver §5 |
| **5** | **Busca nas telas que não têm nenhuma**: `/relatorios`, `/inspecoes`, `/prontuarios`, `/calibracoes`, `/livro-registro`, lista de clientes em `/empresas` | A | médio | Requisito formal seu de 22/08 |
| **6** | `text_pattern_ops` para prefixo de TAG, **se** a busca continuar por `chave` | B | baixo | Resolve o caso "usuário digita o começo da TAG" barato |
| **7** | **Ampliar os campos pesquisáveis de `/equipamentos`** — fabricante, nº de série, localização e ano **já existem** em `InfoEquipamento` e não são buscáveis | B | baixo | Ganho de UX imediato |
| **8** | Tirar `listarCalibracoes(tag)` de dentro do `.map()` de render (`Calibracoes.tsx:417`) | B | baixo | Mesmo padrão do G3 |
| **9** | Dashboard: limitar o **cálculo**, não só a exibição | C | baixo | `slice(0,6)` esconde o custo, não o remove |

### A experiência que a Fase 9 deve entregar (requisito formal, 22/08)

```
[ 🔍 Buscar por TAG, equipamento ou relatório...        ]   [ Tipo ▾ ] [ Período ▾ ] [ Ordenar ▾ ]
```

Com: placeholder adequado · limpar pesquisa · estado de carregamento · zero resultados · contagem
de resultados · teclado · mobile · acessibilidade · **debounce** se for server-side · e **proteção
contra resposta antiga sobrescrever busca nova**.

> **E a regra que você fixou, que esta auditoria confirma ser a certa:** nada de input decorativo
> sobre arquitetura ruim. Com 50.000 registros, **não** carregar 50.000 para depois filtrar no
> navegador — que é exatamente o que o sistema faz hoje.

---

## 5 · A decisão que a Fase 9 não pode tomar sozinha

O item 4 depende de você, porque muda schema:

Hoje `app_storage` é uma tabela chave-valor com `valor text` **opaco**. Qualquer busca por conteúdo
(nome, fabricante, série, código de relatório, período) é `Seq Scan` **enquanto for assim** — isso
está medido, não suposto.

As saídas plausíveis, em ordem de invasividade:

1. **Colunas geradas + índice** sobre os campos pesquisáveis, mantendo a tabela.
2. **Tabela de metadados separada** (equipamentos e relatórios), alimentada junto com o
   `app_storage` — mais trabalho, mais controle.
3. **`pg_trgm` / busca textual** sobre `valor` — menos invasivo no schema, mais caro em índice.

Cada uma tem consequência diferente para RLS, sync e offline. **A Fase 8 não escolhe.**

---

## 6 · Estado do que ficou medido, e do que não

### Medido

- Degraus locais **100 / 500 / 1.000 / 5.000** — gerados, medidos e removidos com prova.
- **F8.1** e **F8.11** — dívida do índice da Fase 1 **fechada: manter**.
- Auditoria das **14 telas** nas 15 perguntas.
- Benchmarks de busca no banco com **50.000 equipamentos**, só metadados (nenhum PDF real).
- Runtime com **51.000 equipamentos**: DOM, heap, IndexedDB, `localStorage`, requisições.
- Três defeitos na **ferramenta de limpeza**, encontrados por medir e corrigidos.

### Pendente, e o motivo — declarado, nunca estimado

| Item | Motivo |
|---|---|
| Boot **cold × warm** cronometrado | A aba do NR-13 nunca foi a **aba ativa** da janela: `document.visibilityState === "hidden"` e `requestAnimationFrame` **não dispara**. Em aba oculta o Chrome despriorizará rede e renderização, e o relógio não vale |
| **Long tasks / INP** | `PerformanceObserver` de longtask não recebe entradas em aba oculta |
| **FPS de scroll** | `requestAnimationFrame` não roda em aba oculta |
| **`/relatorios` em runtime** e tempo da busca atual | a aba ficou irresponsiva depois de montar 2,29 M de nós |
| **Baseline de PDF (5/15/30 folhas)** | idem |
| **Degraus 100/500 em produção** | `PENDENTE DE AUTORIZAÇÃO` — decisão sua, até esclarecer a cota do Supabase |

> Um erro que quase entrou neste registro: cheguei a medir saltos de 60 s entre amostras e ia
> reportá-los como bloqueio da thread principal. Conferi `document.visibilityState` antes e
> **descartei a leitura** — era o Chrome estrangulando `setInterval` em aba oculta. O bloqueio de
> ~4 minutos do `/equipamentos`, esse é real: foi medido por timeout de chamada síncrona, que não
> depende de timer.
