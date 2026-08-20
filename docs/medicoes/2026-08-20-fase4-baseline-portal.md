# Baseline da Fase 4 — arquitetura de leitura do Portal

**Data:** 20/08/2026 · **Achado:** A-02 · **Ambiente:** `https://app.nr13sistema.com.br`
**Bundle:** `main` (asset `index-AIiLkfur.js`, SHA-256 `01e05db6…b48250`)
**Organização de teste:** `99f642d3-…` · **Cliente medido:** `ipiranga@gmail.com`
(`cliente_id ad1fd71c-…`, 2 ativos)

> Medição **read-only**, feita com token de **mestre** consultando a REST do Postgres — ou seja,
> reproduz exatamente o que a Edge `portal_cliente` lê e o que ela devolve, sem depender de
> instrumentar a Edge.

---

## 1. O gargalo, medido

A Edge faz **duas varreduras** (`portal_cliente/index.ts:60` e `:82`). A segunda é
`select chave, valor where org_id = X`, **sem filtro**, paginada de mil em mil, e o filtro por
cliente acontece **em memória, depois**.

| Medida | Valor |
|---|---|
| Linhas na organização (não deletadas) | **45** |
| Bytes lidos do Postgres pela Edge | **534,7 KB** |
| Linhas efetivamente entregues ao cliente | **15** |
| Bytes entregues ao navegador | **38,7 KB** |
| **Lido e descartado** | **496 KB — 93 %** |
| Fator de desperdício | **13,8×** |

**As TAGs do cliente:** `COMPRESSOR V8-15/200L` e `D33DD33D`.

### Composição dos 38,7 KB entregues

| Família | Chaves | KB | Observação |
|---|---|---|---|
| `nr13_historico_` | 2 | **10,3** | índice + **o array legado inteiro** filtrado por TAG |
| `nr13_rel_` | 1 | **9,3** | **`RelatorioSalvo` COMPLETO** — o que a Fase 4 troca por índice |
| `nr13_prontuario_` | 2 | 8,6 | |
| `nr13_minha_` | 1 | 7,7 | logo da executante em base64 |
| `nr13_emp_` | 2 | 0,7 | |
| `nr13_docs_` | 1 | 0,6 | container de inspeção |
| `nr13_lista_` | 1 | 0,6 | rubricas dos funcionários |
| `nr13_livro_` | 1 | 0,5 | |
| `nr13_med_` | 2 | 0,3 | |
| `nr13_info_` | 1 | 0,1 | |
| `nr13_assinantes_` | 1 | 0,1 | |

**24 % do payload é um `RelatorioSalvo` completo** que o cliente não precisa para listar nada —
ele só precisa do índice e do `pdfRef`. Com vários relatórios por ativo, essa fatia domina.

---

## 2. Por que a org de teste SUBESTIMA o problema

45 linhas é uma organização minúscula. O custo da varredura é **proporcional ao tamanho da
organização**, não ao do cliente. Com os números reais do baseline de 16/08
(`2026-08-16-baseline-inicial.md`), a mesma abertura de Portal custaria:

| Organização real | Chaves | Bytes que a Edge leria | Para entregar |
|---|---|---|---|
| org de teste (medida hoje) | 45 | **535 KB** | 38,7 KB |
| `06f84f2e` (a maior real) | 344 | **3,06 MB** | a fração do cliente |
| `32512667` | 85 | 427 KB | idem |
| projeção 1.000 equipamentos | ~15.000 | **dezenas de MB** | idem |

**É esse o aceite central da fase:** o custo de abertura precisa deixar de depender do tamanho
da organização.

---

## 3. Requests e caminho de dados (AS-IS)

```
Portal abre
  └─ PortalLayout.useEffect → carregarDadosPortal()
       └─ 1 request:  POST /functions/v1/portal_cliente
            ├─ Edge query 1: nr13_emp_%          (resolve TAGs)
            └─ Edge query 2: TODA a organização  (paginada, 1000 em 1000)
       ├─ semearCachePortal(chaves)   → Map (é daqui que a UI lê)
       └─ localStorage.setItem em laço → para os templates em iframe
```

| Medida | Valor |
|---|---|
| Requests à Edge na abertura | **1** |
| Queries ao Postgres por request | **2** (a 2ª paginada: `⌈linhas/1000⌉`) |
| Registros retornados ao navegador | **15** |
| Payload | **38,7 KB** |
| Chaves gravadas no `localStorage` | 15 |

**Nenhum arquivo é baixado na abertura.** Fotos e PDFs saem por `FotoImg` /
`VisualizadorPdf` → `fotos.urlAssinada` → Edge `portal_arquivo`, sob demanda. `FotoImg` usa
`IntersectionObserver` (I-21), então a foto de capa só é pedida quando o card entra na tela.

**Isto é importante para o escopo:** o problema da Fase 4 **não é** arquivo pesado baixado
antes da hora — isso já está correto. O problema é **dado estrutural**: a varredura ampla no
servidor e o `RelatorioSalvo` completo no payload.

---

## 4. Onde há leitura ampla, e onde não há

| Local | Lê amplo? | Detalhe |
|---|---|---|
| `RotaProtegida` | **não** (desde a Fase 0-B) | `if (!ehCliente()) await lerTudo()` — o cliente não hidrata a organização |
| Edge `portal_cliente` | **SIM** | `select … where org_id = X` sem filtro — **o gargalo** |
| `portalService.carregarDadosPortal` | não | recebe o que a Edge mandou |
| `PortalAtivos` | não | `montarAtivos(tags)` lê do `Map` |
| `PortalAtivo` | não | tudo por `ler()` do `Map` |
| `fotos.urlAssinada` | não | 1 arquivo por vez, pela Edge |

**Nenhuma tela do navegador baixa a organização inteira para filtrar.** O filtro por cliente já
acontece no servidor. O defeito é **onde** a Edge filtra: depois de ler tudo, em vez de antes.

---

## 5. O que só precisaria ser carregado ao abrir o detalhe

`PortalAtivo` consome, tudo do `Map` já semeado na abertura:

`nr13_info_`, `nr13_fotos_`, `nr13_cat_`, `nr13_calc_`, `nr13_emp_`, `nr13_livro_`,
`nr13_docs_`, `nr13_componentes_cal_`, `nr13_calibracoes_`, `nr13_prontuario_`,
`nr13_pront_fab_`, `nr13_historico_indice_`, `nr13_rel_<id>_`

**A lista precisa de:** só `nr13_info_`, `nr13_fotos_` (capa), `nr13_cat_`, `nr13_calc_`.
As outras 9 famílias são **detalhe** e poderiam ser buscadas ao abrir o ativo.

`nr13_rel_` (o registro completo) só é necessário quando o cliente **abre um relatório
específico** — e, para relatório com `pdfRef`, `abrirRelatorio` **não usa `meta` nem
`documentos`**: serve o arquivo direto (§7-quater). Para esses, o registro completo é
**puro desperdício**.

---

## 6. Reload e dependências de armazenamento

| Aspecto | Comportamento |
|---|---|
| Reload do Portal | **refaz a chamada à Edge por inteiro** — `PortalLayout.useEffect` roda a cada montagem. Não há cache entre recargas |
| IndexedDB | usado como cache (`semearCachePortal` → `storageV2.semearCache`), mas **não é reaproveitado** no reload: a Edge é chamada de novo antes |
| `localStorage` | recebe as 15 chaves para os templates em iframe. **É o único lugar do sistema sem palco** |
| Falha de cota | **contada e reportada no console** (`portalService.ts:49`), mas o Portal **continua abrindo** com documento potencialmente incompleto |
| Offline | não funciona, e a fase não muda isso |

---

## 7-bis. Metodologia de tempo — definida ANTES de medir, para ser repetível

Escrita aqui para que a medição **depois** da Fase 4 use exatamente os mesmos pontos. Repetir
com a mesma conta, mesmo navegador e mesma organização.

### Definição dos pontos

| Marco | Definição operacional |
|---|---|
| **t0** | `performance.timeOrigin` da navegação — instante em que o navegador começa a carregar `/portal` |
| **t_edge_inicio** | `startTime` da entrada de Resource Timing cujo `name` contém `portal_cliente` |
| **t_edge_fim** | `responseEnd` dessa mesma entrada |
| **t_lista** | instante em que o **primeiro `.portal-card-ativo` existe no DOM** |
| **t_detalhe** | instante em que, após clicar num card, o container do detalhe (`.portal-abas`/lista de documentos) existe no DOM |

Todos relativos a **t0**, em milissegundos.

### Como cada número é obtido

- **Tempos de rede:** `performance.getEntriesByType('resource')` — exatos, independem de quando
  eu leio.
- **Bytes:** da mesma entrada — `transferSize` (o que trafegou, já com compressão),
  `encodedBodySize` e `decodedBodySize` (o JSON expandido).
- **t_lista / t_detalhe:** polling de **25 ms** procurando o seletor. Granularidade declarada:
  **±25 ms**. Se o seletor já existir na primeira checagem, a amostra é marcada
  **`LIMITE_INFERIOR`** e não entra na mediana.

### Protocolo

- **5 execuções** de cada medição.
- **Cache frio:** `caches.delete()` do cache do service worker + `location.reload()` — a primeira
  execução de cada série é rotulada `FRIO`.
- **Cache quente:** as 4 seguintes.
- Reportar: **cada valor individual**, **mediana** e, se a dispersão passar de 2×, também o
  **pior caso**.
- Entre execuções, `performance.clearResourceTimings()`.

### O que NÃO é medido, e por quê

- Org de 500/1.000: pertence à **Fase 8** (massa sintética). Combinado com o dono.
- A prova de que o custo deixa de crescer com a organização será **arquitetural** (a consulta
  passa a ser por lista de chaves derivada das TAGs) mais leitura read-only da maior org real.

## 7. O que a baseline ainda NÃO tem

Registrado como pendente, não como medido:

- [ ] **Tempo até a lista utilizável** e **tempo até abrir um ativo** — exigem sessão de cliente
      autenticada e cronometragem no navegador. O dono precisa logar `ipiranga@gmail.com`
      (não digito senha em campo de autenticação).
- [ ] **Bytes transferidos na rede** (com gzip) — o número acima é o tamanho do conteúdo em
      `app_storage`; o payload HTTP real é menor por compressão.
- [ ] **Medição em org de 500 / 1.000 equipamentos** — depende de massa sintética, que é a
      **Fase 8**. Até lá, o critério "custo não cresce com a organização" será provado por
      construção (a consulta passa a ser por lista de chaves) + medição nas orgs reais
      disponíveis.

---

## 8. Reprodução

```js
// no console de uma sessão MESTRE da organização, read-only
const ORG='99f642d3-…', CLIENTE='ad1fd71c-…';
// 1) tudo da org  → o que a Edge LÊ
// 2) filtrar por: globais liberadas | nr13_rastreab_ | endsWith('_'+TAG) | historico legado
//    → o que a Edge DEVOLVE
// comparar bytes das duas
```

O script completo usado está no histórico da sessão de 20/08/2026.
