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

## 7-quater. DEPOIS DA FASE 4 — medição em produção (20/08/2026)

**Bundle:** `index-C93aM9ry.js`, SHA-256 idêntico ao build de `5a42d4f`.
**Edge:** publicada e confirmada **por comportamento** — pedir 1 chave devolve 1 (a antiga
devolvia 15). Mesma conta, mesmo navegador, mesma organização, **mesma metodologia**.

### Payload e chaves

| Medida | ANTES | DEPOIS | Δ |
|---|---|---|---|
| Chaves entregues | 15 | **13** | −2 |
| **Payload JSON** | 31.403 b (30,7 KB) | **21.592 b (21,1 KB)** | **−31 %** |
| Na rede (`content-length`) | 10.366 b | **9.886 b** | −4,6 % |
| `nr13_rel_` (registro completo) | **presente**, 9,3 KB | **ausente** ✅ | — |
| `nr13_historico_relatorios` (legado) | **presente** | **ausente** ✅ | — |
| `nr13_historico_indice_` (o substituto) | presente | **presente** ✅ | — |

> A queda na rede (−4,6 %) é bem menor que a do JSON (−31 %) porque o que saiu era **texto
> altamente compressível** — JSON repetitivo de snapshot. Registrado como está, sem escolher o
> número mais bonito.

### Leitura no Postgres — o objetivo central da fase

| Medida | ANTES | DEPOIS |
|---|---|---|
| Estratégia | `where org_id = X` **sem filtro**, paginado | `where org_id = X and chave in (lista)` |
| Linhas lidas | **45** (toda a organização) | **≤ 74** pedidas por igualdade, **13 encontradas** |
| Bytes lidos | **534,7 KB** | **~21 KB** (só as linhas do cliente) |
| Descartado | 496 KB — **93 %** | **~0** |
| **Cresce com o tamanho da organização?** | **SIM** | **NÃO** — cresce com o nº de ativos DO CLIENTE |

**O aceite central está cumprido por construção:** a consulta passou a ser por lista fechada,
derivada das TAGs autorizadas. Numa organização de 344 chaves, a leitura deixa de ser 3,06 MB e
passa a ser a mesma de hoje — porque não depende mais do tamanho da organização.

### Tempos — 5 execuções, mesma metodologia (7-bis)

| # | Cache | `portal_cliente` duração | t_lista |
|---|---|---|---|
| 1 | FRIO | 810 | 1.904 |
| 2 | quente | 385 | 1.227 |
| 3 | quente | 387 | 1.223 |
| 4 | quente | 661 | 934 |
| 5 | quente | 582 | 1.046 |

| Medida | ANTES | DEPOIS | Δ |
|---|---|---|---|
| **Duração da Edge** (mediana) | 693 ms | **582 ms** | **−16 %** |
| **t_lista** (mediana) | 1.069 ms | **1.223 ms** | **+14 %** ⚠️ |
| t_lista (pior caso) | 1.510 ms | 1.904 ms | — |
| Requests na abertura | 11 | **11** | = |
| `requestsDepoisDoEdge` | 0 | **0** | = |

**Sobre o `t_lista` ter subido:** a Edge ficou mais rápida (−16 %), mas o `t_lista` piorou. As
duas coisas convivem porque `t_lista` inclui o **início** da chamada, e ele varia com as 4
chamadas de auth em série que vêm antes (`edge_inicio` oscilou entre 274 e 1.093 ms nas
amostras). A dispersão da série (934–1.904) é maior que a diferença entre as medianas, então
**não afirmo melhora nem piora de tempo de abertura com esta amostra** — o ganho provado desta
fase é de **leitura no banco e payload**, não de latência. Medir latência com confiança exigiria
mais execuções e controle do ambiente de rede.

### Abrir um ativo — 5 execuções

| # | t_detalhe |
|---|---|
| A | 732 · B | 972 · C | 936 · D | 215 · E | 559 |

| Medida | ANTES | DEPOIS |
|---|---|---|
| **Mediana** | 754 ms | **732 ms** |
| Pior caso | 954 ms | 972 ms |
| **Requests novos ao abrir** | 0 | **0** |

Praticamente igual, como esperado: o relatório do ativo testado tem `pdfRef`, então o detalhe
não precisou buscar nada sob demanda.

---

## 7-quinquies. REGRESSÃO DE SEGURANÇA — as 10 provas do P1, repetidas ✅

Executadas **depois** da mudança, com `ipiranga@gmail.com`.

| # | Prova | Resultado |
|---|---|---|
| 1 | Cliente vê somente ativo vinculado | ✅ 2 ativos, os dele |
| 2 | Ativo de outro cliente não aparece | ✅ `ZZ-FASE3`, `DASDSA`, `VASO A23` ausentes |
| 3 | `app_storage` amplo negado | ✅ **0 linhas** |
| 4 | Leitura dirigida a ativo alheio | ✅ **0 linhas** |
| 5 | `portal_arquivo` autorizado | ✅ **200 + URL** (PDF e foto) |
| 6 | Arquivo **REAL** de outro cliente | ✅ **404 `nao_disponivel`** |
| 7 | Não-enumerabilidade (D-26) | ✅ arquivo real negado, path inexistente e outra org → **corpo único e idêntico** |
| 8 | Storage pelo SDK | ✅ assinar **400**, download **400**, listar **`[]`** |
| 9 | Prontuário abre | ✅ renderiza, com `Relatório nº` e `Data de Emissão` preenchidos |
| 10 | Relatório arquivado abre | ✅ **15 páginas**, selo "Documento arquivado" |
| 11 | Mestre no sistema interno | ✅ lê `app_storage` (**HTTP 200, 86 linhas**), lista equipamentos; Edge do Portal recusa mestre com **403** |

### A superfície NOVA também foi atacada

O modo `{chaves:[…]}` é uma superfície que **não existia** no P1. Testei-a como atacante:

| Pedido | Devolvido |
|---|---|
| `nr13_info_ZZ-FASE3` (ativo de **outro cliente**) | **0** ✅ |
| `nr13_info_DASDSA` (ativo **sem vínculo**) | **0** ✅ |
| `nr13_rel_…_VASO A23` (relatório **real** de ativo alheio) | **0** ✅ |
| `nr13_minha_empresa` (global, fora da lista por TAG) | **0** ✅ |
| `nr13_info_COMPRESSOR…` (legítima) | **1** ✅ |
| **misto**: 1 alheia + 1 legítima | **1** — só a legítima ✅ |

**Nenhum vazamento.** A autorização é derivada das TAGs lidas do banco; o corpo do request só
diz *qual* chave.

---

## 7-sexies. Cota visível — provado na tela ✅

Enchi o `localStorage` de propósito até não caber nem 2 KB e recarreguei o Portal. A tela
exibiu, em vermelho:

> **"Não foi possível carregar 13 documentos — o armazenamento do navegador está cheio. Feche
> outras abas do sistema e recarregue a página."**

Antes da Fase 4 isso era um `console.error` e o Portal **abria mesmo assim**, com documentos
faltando — o cliente concluiria que o documento não existe.

> **A primeira tentativa deste teste foi inválida e está registrada como tal.** Enchi o
> `localStorage` mas o Portal carregou normalmente: as chaves `nr13_*` já estavam gravadas da
> carga anterior, e reescrever chave existente com o mesmo valor não consome espaço novo. Refiz
> removendo as chaves de dados (preservando sessão) antes de encher, e aí sim o caminho foi
> exercitado. O entulho foi removido ao fim.

---

## 7-septies. O que NÃO foi possível exercitar

- [ ] **Relatório LEGADO pela interface.** A busca sob demanda foi provada **pela API** (pedir a
      chave devolve exatamente 1, e a autorização recusa as alheias), mas o fluxo de UI não pôde
      ser percorrido: **não existe relatório sem `pdfRef` num ativo deste cliente**. Todos os
      relatórios da organização de teste são artefatos. Criar um legado de propósito exigiria
      forjar dado no banco, o que não farei numa validação de portão.
- [ ] **Organização de 500/1.000.** Pertence à **Fase 8**, como combinado.

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
