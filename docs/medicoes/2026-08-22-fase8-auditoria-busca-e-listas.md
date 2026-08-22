# Fase 8 · Auditoria de busca, listas e escala · **AUDITAR + MEDIR, não corrigir**

**22/08/2026** · laboratório local · **nada em `src/` alterado** · **nenhuma massa em produção**

Requisito formal incorporado à Fase 8 pelo dono em 22/08. A Fase 8 **mede**; a **Fase 9 corrige**.

---

## O achado que governa tudo o resto

> **Não existe busca no servidor. Em lugar nenhum do sistema.**
>
> Varredura em todo o `src/`: **zero** ocorrências de `.ilike(`, `.like(`, `.textSearch(`, `.or(`,
> `to_tsquery` ou `websearch`. As **únicas** consultas ao `app_storage` são a hidratação
> (`.eq(org_id)` + `.gt(atualizado_em)` + `limit 1000`, paginada até o fim) e leitura de chave
> única.
>
> Toda busca de tela é `Array.prototype.filter()` em JavaScript, sobre a organização **inteira**
> já hidratada no `Map` da memória.

Consequência direta, e é a resposta à sua pergunta sobre o índice:

**`app_storage_org_atualizado_idx` não serve busca — e nunca poderia.** Ele serve hidratação, e
isso está provado no registro do F8.11. Para busca ele é irrelevante, porque **não há consulta de
busca** para ele atender.

Procurar uma TAG entre 50.000 hoje significa, na ordem: baixar a organização inteira → montar o
`Map` → `.filter()` no navegador. O primeiro passo é o problema.

---

## 1 · Tabela de auditoria

Legenda de risco: 🟢 baixo · 🟡 médio · 🔴 alto · ⛔ inviável na escala pedida.

| Tela | Busca | Filtros | Ordenação | Client/Server | Registros carregados | Paginação | Virtualização | DOM | Consulta / índice | Risco em 5.000 | Risco em 50.000 | Ação da Fase 9 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **`/equipamentos`** | **SIM** — tag, descrição, rótulo do tipo | SIM — empresa, tipo, categoria, resultado | não | **CLIENT** | **todos** | não | não | 1 card por equipamento, sem teto | hidratação total | 🔴 | ⛔ | busca server-side + paginação/virtualização; ampliar campos |
| **`/relatorios` (tela 1: equipamentos)** | **NÃO** | **NÃO** | não | — | **todos** + `contarRelatorios(tag)` **por equipamento** | não | não | 1 card por equipamento | hidratação total + **`JSON.parse` de TODO `nr13_rel_`** | 🔴 | ⛔ | **o caso que você citou**; ver §3 |
| **`/relatorios` (tela 2: histórico da TAG)** | **NÃO** | SIM — tipo de inspeção | por data, fixa | CLIENT | todos os relatórios daquela TAG | não | não | 1 linha por relatório | índice por TAG (bom) | 🟡 | 🔴 | busca textual + paginação por equipamento |
| **`/inspecoes`** | **NÃO** | **NÃO** | não | — | **todos** | não | não | 1 card por equipamento | hidratação total | 🔴 | ⛔ | busca + paginação |
| **`/prontuarios`** | **NÃO** | **NÃO** | não | — | **todos** | não | não | 1 card por equipamento | hidratação total | 🔴 | ⛔ | busca + paginação |
| **`/calibracoes`** | **NÃO** (só tipo e proprietário) | SIM — tipo, proprietário | não | CLIENT | **todos** + `listarCalibracoes(tag)` **dentro do render** | não | não | 1 card por equipamento | hidratação total | 🔴 | ⛔ | busca + tirar a chamada do render |
| **`/livro-registro`** | **NÃO** | **NÃO** | não | — | **todos** (`listarChavesComPrefixo('nr13_info_')` + livro de cada) | não | não | 1 linha por equipamento | hidratação total | 🔴 | ⛔ | busca + paginação |
| **`/vencimentos`** | **NÃO** | **NÃO** | por data | — | **todos** os equipamentos | não | não | 1 linha por item | hidratação total | 🟡 | 🔴 | paginação; a lista é naturalmente menor |
| **`/dashboard`** | **NÃO** | SIM — prazo | por data | CLIENT | **todos**, mas **exibe `slice(0, 6)`** e 5 alertas | **tem teto de exibição** | não | ~11 linhas | hidratação total | 🟢 no DOM · 🔴 no cálculo | 🔴 | o cálculo continua percorrendo tudo |
| **`/certificados`** | **NÃO** | — | não | — | 3 tipos fixos (`PADROES`) | n/a | n/a | ~3 cards | — | 🟢 | 🟢 | nenhuma |
| **`/funcionarios`** | **NÃO** | **NÃO** | não | — | todos os funcionários | não | não | 1 por funcionário | lista naturalmente pequena | 🟢 | 🟡 | busca simples se crescer |
| **`/acesso`** | **SIM** — e-mail, empresa | **NÃO** | não | CLIENT | todos os sub-logins | não | não | 1 por usuário | lista pequena | 🟢 | 🟡 | — |
| **`/empresas`** | busca é do **Google Places** (externa); a **lista local de clientes não tem busca** | **NÃO** | não | — | todos os clientes | não | não | 1 card por cliente | hidratação total | 🟡 | 🔴 | busca na lista local |
| **`/pendencias`** | **NÃO** | — | não | — | fila de sync | não | não | 1 por item | fila, naturalmente curta | 🟢 | 🟡 | — |

**Nenhuma tela do sistema tem paginação, cursor ou virtualização.** A única contenção de DOM que
existe é o `slice(0, 6)` do Dashboard — e ele limita a **exibição**, não o **cálculo**.

**A única otimização de imagem que existe** é o `FotoImg` com `IntersectionObserver` (herança da
Fase 5): a foto só é decodificada quando entra na viewport. Isso protege o custo de imagem, **não**
o custo de nós no DOM nem o de memória do `Map`.

### Respostas às 15 perguntas, no agregado

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Existe busca textual? | Só em **`/equipamentos`** e **`/acesso`**. Em nenhuma outra |
| 2 | Existe filtro? | `/equipamentos`, `/relatorios` (só tipo), `/calibracoes`, `/dashboard` |
| 3 | Existe ordenação? | Nenhuma escolhida pelo usuário. Só ordens fixas |
| 4 | Existe paginação? | **Não, em nenhuma tela** |
| 5 | Existe virtualização? | **Não. Nenhuma biblioteca, nenhuma implementação** |
| 6 | Quantos registros carregam? | **Todos.** Sempre a organização inteira |
| 7 | Busca client ou server? | **100 % client-side** |
| 8 | Usa `.filter()` sobre tudo carregado? | **Sim, exatamente isso** |
| 9 | Campos pesquisáveis | `/equipamentos`: tag, `info.descricao`, rótulo do tipo. **Não** busca fabricante, nº de série, localização, ano — campos que **existem** em `InfoEquipamento` |
| 10 | Quais requests | 1 request de hidratação por página de 1.000 linhas, até esgotar a org. Nenhum request de busca |
| 11 | Fotos sob demanda? | **Sim** — `FotoImg` + `IntersectionObserver` |
| 12 | PDF antes do clique? | **Não.** O PDF só é resolvido em `imprimirPdfArquivado`/`baixarPdfArquivado`. ✅ correto |
| 13 | Nós no DOM | 1 card/linha por registro, **sem teto** (exceto Dashboard) |
| 14 | 100 / 500 / 1.000 / 5.000 | ver §4 |
| 15 | Risco em 10k / 20k / 50k | ver §4 |

---

## 2 · Relatórios e PDFs — a arquitetura está CERTA, o caminho de leitura é que não está

Sua regra: *PDF pesado no Storage, metadados pesquisáveis no banco, e só baixar o PDF no clique.*

**Isso já é verdade na estrutura de dados.** O `RelatorioIndiceItem` (§7-sexies) é leve e carrega
exatamente o necessário:

```
id · tagVaso · nome · tipo · data · codigo · emissao · validade
execucaoInspecao · proximaInspecaoInterna · proximaInspecaoExterna
pdfRef · sha256 · geradoEm · paginas · pdfPendente
```

E confirmei no código: **a lista nunca pede o PDF.** `artefatoDe(...)` só é chamado dentro de
`imprimirPdfArquivado` e `baixarPdfArquivado`, ou seja, na ação do usuário. Ter 50.000 PDFs no
Storage **não** faz o sistema enumerar 50.000 PDFs para montar `/relatorios`. ✅

**O defeito não está no PDF. Está em como o contador é calculado.**

`/relatorios` monta a primeira tela assim:

```js
const contagemPorTag = useMemo(
  () => new Map(equipamentos.map((e) => [e.tag, contarRelatorios(e.tag)])),
  [equipamentos],
);
```

E `contarRelatorios` → `listarIndice(tag)`, que faz:

```js
for (const chave of chavesDeRegistro(tag)) {
  const r = ler(chave);                       // JSON.parse do registro INTEIRO
  if (r?.id && !porId.has(r.id)) porId.set(r.id, resumir(r));
}
```

O `JSON.parse` acontece **sempre**, mesmo quando o índice leve já tem aquele relatório — o
resultado só é descartado depois. E cada `nr13_rel_` tem **~2,5 KB** com os snapshots congelados do
§7-bis (logo da empresa, duas rubricas PNG, certificados).

**Custo só para desenhar o número no card:**

| Equipamentos × relatórios | `JSON.parse` executados | Bytes parseados |
|---|---:|---:|
| 1.000 × 2 | 2.000 | ~5 MB |
| 5.000 × 2 | 10.000 | ~25 MB |
| 50.000 × 2 | **100.000** | **~250 MB** |

Classe **A** — é o achado mais concreto desta auditoria, e o mais barato de corrigir na Fase 9: o
índice leve já tem tudo, basta não parsear o registro pesado quando ele já está no índice.

---

## 3 · Benchmarks de busca no banco — 50.000 equipamentos

Massa sintética **só de metadados**, como você pediu: **nenhum PDF real gerado**. 111.000 linhas
vivas na org, 41 MB de conteúdo, tabela em 193 MB.

> **Declarado:** estas linhas foram inseridas por `INSERT` direto no laboratório, não pela RPC —
> a RPC anda a ~55 chaves/s e 150.000 chaves levariam ~45 min. O que se mede aqui é **plano de
> consulta**, que depende das LINHAS, e as linhas têm a mesma forma (mesmas colunas, mesmo formato
> de chave e de valor).

Mediana de 3 execuções.

| Cenário | Plano | Buffers | Linhas descartadas | Tempo | |
|---|---|---:|---:|---:|:--:|
| Hidratação, 1ª página (`limit 1000`) | `Index Scan org_atualizado_idx` | 1.021 | 0 | **0,6 ms** | ✅ |
| **TAG exata** (chave inteira) | `Index Scan org_chave_uidx` | **4** | 0 | **0,07 ms** | ✅ |
| Relatórios **de um** equipamento | `Index Scan org_chave_uidx` | **4** | 0 | **0,10 ms** | ✅ |
| Ordenar por mais recente | Index | 5 | 50 | 0,10 ms | ✅ |
| **Prefixo de TAG** (`'ZZ-…-313%'`) | **Parallel Seq Scan** | **10.917** | 64.841 | **26 ms** | ❌ |
| Pedaço no meio da TAG | Parallel Seq Scan | 10.917 | 64.802 | 28 ms | ❌ |
| **Número de série** (dentro do `valor`) | Parallel Seq Scan | 10.917 | 64.861 | **57 ms** | ❌ |
| **Relatório por código**, base inteira | Parallel Seq Scan | 10.917 | 64.877 | **80 ms** | ❌ |
| Relatórios **por período**, base inteira | Parallel Seq Scan | 9.716 | 54.732 | 77 ms | ❌ |
| Nome/descrição | Seq Scan | 36 | 712 | 0,6 ms | ⚠️ |
| Fabricante | Seq Scan | 36 | 709 | 0,6 ms | ⚠️ |

> **Os dois ⚠️ são uma armadilha, não um bom resultado.** Nome e fabricante pareceram rápidos
> porque o `LIMIT 50` foi satisfeito nas primeiras linhas — os termos sintéticos se repetem a cada
> 5 registros. Com um termo **raro** — que é o caso real de quem procura um equipamento
> específico — o plano é o mesmo `Seq Scan` e degrada para o número do "número de série":
> **57 ms e 10.917 buffers**. A forma do plano é o que importa, não o tempo com termo comum.

### 🔴 Por que nem o prefixo de TAG usa índice

Eu esperava que `chave LIKE 'nr13_info_VASO 2%'` usasse o `app_storage_org_chave_uidx`. **Não usa**,
e a causa é precisa:

| | |
|---|---|
| Collation do banco | `en_US.UTF-8` |
| Índice | `btree (org_id, chave)`, opclass **`text_ops` padrão** |

Um btree em collation não-C **não serve `LIKE 'prefixo%'`**. Para isso seria preciso
`text_pattern_ops` (ou C collation, ou outra estrutura). Medido: `Parallel Seq Scan`, 10.917
buffers, 26 ms.

**Ou seja: hoje, até o caso mais fácil — o usuário digitar o começo da TAG — é varredura completa.**

**Nenhum índice foi criado.** A Fase 8 mede; a Fase 9 decide.

---

## 4 · Projeção por escala

O que o navegador precisa baixar e manter em memória **antes de o usuário poder buscar qualquer
coisa** — medido no laboratório, extrapolado linearmente a partir do conteúdo real por equipamento
(8,3 kB de conteúdo + 11 chaves):

| Equipamentos | Linhas na org | Conteúdo baixado | `JSON.parse` só p/ o contador de `/relatorios` | Cards no DOM em `/equipamentos` |
|---:|---:|---:|---:|---:|
| 100 | 1.100 | 0,8 MB | 200 | 100 |
| 500 | 5.500 | 4,1 MB | 1.000 | 500 |
| 1.000 | 11.000 | 8,3 MB | 2.000 | 1.000 |
| 5.000 | 55.000 | **41 MB** | 10.000 | **5.000** |
| 10.000 | 110.000 | ~82 MB | 20.000 | 10.000 |
| 20.000 | 220.000 | ~164 MB | 40.000 | 20.000 |
| 50.000 | 550.000 | **~410 MB** | **100.000** | **50.000** |

Cada boot. Em toda aba. Antes de qualquer busca.

> **A resposta honesta ao critério de produto, hoje:** uma empresa com 50.000 relatórios **não**
> consegue encontrar um item em segundos. Ela precisa primeiro baixar ~410 MB e materializar
> 550.000 entradas num `Map`, e só então o `.filter()` roda — que aí sim é rápido. O gargalo é
> arquitetural, não de algoritmo de busca.

---

## 5 · Gargalos registrados, com classe

| # | Gargalo | Classe | Evidência |
|---|---|---|---|
| B1 | **Nenhuma busca server-side existe.** Toda busca é `.filter()` sobre a org inteira hidratada | **A** | zero `.ilike/.like/.textSearch/.or` em `src/` |
| B2 | **`/relatorios` faz `JSON.parse` de todo registro pesado só para contar** — 100.000 parses e ~250 MB em 50.000 equipamentos | **A** | `historicoRelatorios.ts:197-200` |
| B3 | **Nenhuma tela tem paginação, cursor ou virtualização.** DOM cresce 1:1 com a base | **A** | varredura de todas as páginas |
| B4 | **Prefixo de TAG não usa índice** por causa da collation `en_US.UTF-8` com `text_ops` | **B** | `Parallel Seq Scan`, 10.917 buffers, 26 ms |
| B5 | **Busca por conteúdo (nome, fabricante, série, código, período) é `Seq Scan`** — os dados estão dentro de uma coluna `text` opaca | **B** | 57–80 ms com termo raro |
| B6 | `/relatorios`, `/inspecoes`, `/prontuarios`, `/calibracoes`, `/livro-registro` **não têm busca nenhuma** | **A** | tabela do §1 |
| B7 | `/equipamentos` busca só 3 campos; **fabricante, nº de série, localização e ano existem e não são pesquisáveis** | **B** | `Equipamentos.tsx:87-89` vs `tipos.ts:9-32` |
| B8 | `/calibracoes` chama `listarCalibracoes(tag)` **dentro do `.map()` de render** | **B** | `Calibracoes.tsx:417` |
| B9 | O Dashboard limita a **exibição** (`slice(0,6)`) mas o **cálculo** percorre a base toda | **C** | `Dashboard.tsx:44,51` + `vencimentos.ts:92` |
| B10 | **A arquitetura de PDF está CORRETA** — índice leve com `pdfRef`, PDF só no clique | **D** | `artefatoDe` só em imprimir/baixar |

---

## 6 · O que a Fase 9 precisa decidir (não implementar agora)

Em ordem de retorno pelo custo:

1. **B2 é o mais barato e o mais imediato.** Não parsear o registro pesado quando o índice leve já
   tem o relatório. Não muda schema, não muda arquitetura — muda um `if`.
2. **Busca server-side** — precisa decidir *onde* os metadados pesquisáveis passam a viver.
   O `valor` é `text` opaco; qualquer busca por conteúdo é `Seq Scan` enquanto for assim. As saídas
   plausíveis: colunas/geradas + índice, tabela de metadados separada, ou `pg_trgm`/FTS. **A
   escolha depende de aceitar ou não mudança de schema**, e é decisão sua.
3. **Paginação/keyset + virtualização** nas cinco telas 🔴.
4. **B4** — `text_pattern_ops` resolveria prefixo de TAG barato, se a busca continuar por `chave`.
5. **B7** — ampliar os campos pesquisáveis de `/equipamentos` para os que já existem.

Nada disso foi implementado. Nenhum índice foi criado.

---

## 7 · O que ainda falta medir nesta bateria

- **UI/DOM/memória/long tasks** no navegador, com 1.000 equipamentos já carregados no laboratório
  — **bloqueado**: exige um login no app, e eu não insiro senha em formulário. Ver o pedido no
  fim da conversa.
- **IndexedDB** e **cold × warm** — dependem do mesmo login.
- **Baseline de PDF** (5/15/30 folhas) — depende do mesmo login.
