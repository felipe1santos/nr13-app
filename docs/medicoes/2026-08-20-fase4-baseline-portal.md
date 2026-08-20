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

## 7-ter. MEDIÇÕES DE TEMPO — executadas em 20/08/2026 ✅

Sessão `ipiranga@gmail.com` (papel `cliente`, 2 ativos) no **Brave**. Bundle `index-AIiLkfur.js`.

### Abertura do Portal — 5 execuções

| # | Cache | `portal_cliente` início | fim | **duração** | nav DCL | **t_lista** |
|---|---|---|---|---|---|---|
| 1 | **FRIO** | 869 | 1510 | 641 | 416 | **1510** |
| 2 | quente | 761 | 1391 | 630 | 257 | **1391** |
| 3 | quente | 326 | 1069 | 743 | 108 | **1069** |
| 4 | quente | 320 | 1013 | 693 | 123 | **1013** |
| 5 | quente | 293 | 1020 | 728 | 108 | **1020** |

| Medida | Mediana | Pior caso |
|---|---|---|
| **Duração da chamada `portal_cliente`** | **693 ms** | 743 ms |
| **t_lista** (lista utilizável) | **1.069 ms** | 1.510 ms (frio) |

**Como `t_lista` foi obtido, e por que é confiável:** o `portal_cliente` é o **último request
antes de a lista existir** — em todas as 5 execuções, `requestsDepoisDoEdge = 0`. Logo
`t_lista ≡ responseEnd` do `portal_cliente`, valor **exato** do Resource Timing, sem depender
do meu polling.

> **A tentativa de medir `t_lista` por polling foi descartada, como a metodologia previa.** Na
> execução 1 os cards já existiam quando meu script rodou (latência da automação, ~14 s) — a
> amostra foi marcada `LIMITE_INFERIOR` e **não entrou em nenhuma média**.

### Abrir um ativo — 5 execuções

Cenário fiel: **abertura fresca do Portal + um clique real no card** (navegação SPA).

| # | t_detalhe |
|---|---|
| A | 754 ms |
| B | 811 ms |
| C | 954 ms |
| D | 685 ms |
| E | 623 ms |

| Medida | Valor |
|---|---|
| **Mediana** | **754 ms** |
| Pior caso | 954 ms |
| **Requests novos ao abrir o detalhe** | **0 — em todas as 5** |

> **Uma série anterior foi descartada e o motivo está registrado.** Ao repetir com
> `history.back()` entre as amostras, os valores saltaram para ~990 ms com a primeira em 97 ms —
> dispersão de 10×, causada pelo meu vaivém de histórico, que não é o caminho do usuário.
> Refeita com abertura fresca + clique, que é o cenário real.

**Os 754 ms são puro render.** Zero rede. É o React montando `PortalAtivo`, que lê 13 famílias
de chave do `Map` e roda vários `useMemo` (histórico, calibrações, registros). Depois da Fase 4
esse número **muda de natureza**: passa a incluir uma busca sob demanda quando o relatório for
legado. É esperado, e a comparação depois precisa levar isso em conta.

### Payload da resposta

| Medida | Valor |
|---|---|
| HTTP | 200 |
| **JSON descomprimido** | **31.403 bytes — 30,7 KB** |
| **Na rede (`content-length`)** | **10.366 bytes — 10,1 KB** |
| Compressão | ~3,0× |
| Chaves entregues | **15** |
| TAGs | `COMPRESSOR V8-15/200L`, `D33DD33D` |

**As 4 maiores chaves concentram 84 % do payload:**

| Chave | KB | % |
|---|---|---|
| **`nr13_rel_REL-1787152599432_COMPRESSOR…`** | **9,3** | **30 %** |
| `nr13_prontuario_COMPRESSOR…` | 8,6 | 28 % |
| `nr13_minha_empresa` (logo base64) | 7,7 | 25 % |
| `nr13_historico_indice_COMPRESSOR…` | 0,7 | 2 % |

**O alvo direto da Fase 4 é a primeira linha:** o `RelatorioSalvo` completo custa **9,3 KB** e
o índice que o substitui já está sendo enviado por **0,7 KB**. Com mais relatórios por ativo,
essa fatia domina o payload inteiro.

### Requests na abertura

| Medida | Valor |
|---|---|
| Total de requests | **11** |
| Deles, à Edge `portal_cliente` | **1** |
| Chamadas de autenticação antes dela | **4** encadeadas (`getUser`, `profiles`, `assinatura_org`, +1) |
| Arquivos (foto/PDF) baixados | **0** |

> **Achado de latência, fora do escopo da Fase 4 e não corrigido:** o `portal_cliente` só
> **começa** aos 293–869 ms, depois de quatro chamadas de auth em série. Da mediana de
> 1.069 ms até a lista, cerca de **1/3 é espera de autenticação antes de a busca de dados
> sequer começar**. Registrado para avaliação futura; mexer nisso agora seria refatoração
> lateral, que o dono pediu explicitamente para não fazer.

## 7. O que a baseline ainda NÃO tem

Registrado como pendente, não como medido:

- [x] **Tempo até a lista utilizável** e **tempo até abrir um ativo** — MEDIDOS em 20/08/2026 (seção 7-ter): mediana 1.069 ms e 754 ms
- [x] **Bytes transferidos na rede** — MEDIDOS: **10.366 bytes** na rede contra 31.403 do JSON
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
