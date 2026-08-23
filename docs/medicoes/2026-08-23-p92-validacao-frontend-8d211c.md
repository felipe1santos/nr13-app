# P9.2 · validação REAL do FRONTEND — organização `…8d211c`

**23/08/2026** · produção (`https://app.nr13sistema.com.br`) · bundle do `main` conferido marcador
a marcador (12/12 JS + 5/5 CSS, hash do CSS idêntico ao build local)

> **OPÇÃO B, conforme decidido.** A conta real do cliente (`engyuricesar@gmail.com`) **não foi
> acessada**, nenhum sub-login foi criado na organização real, e a organização da SOTREQ
> permanece com `busca_v9` **OFF**, sem novo acesso e sem alteração.

---

## A DIVISÃO DA EVIDÊNCIA

| organização | o que ela prova | por que ela |
|---|---|---|
| **`…8d0f7e`** (piloto) | validação **server-side** com dado real rico — projeção × verdade, **4 equipamentos × 13 campos**, busca, cursor, isolamento, ciclo de escrita | tem memorial, categoria, PMTA, PTH, volume e fluido preenchidos |
| **`…8d211c`** (esta) | validação **de frontend**: flag OFF × ON, busca na tela, DOM/rede, ponte, palco, **offline**, fila, reconexão, rollback | é a conta em que já se estava logado; nenhuma conta de cliente foi tocada |

**Esta organização não tem memorial, categoria, PMTA, PTH, volume nem fluido preenchidos na
maioria dos equipamentos — e nada foi inventado para preencher.** A comparação correta, e a que
foi feita, é: campo que aparece `—` com a flag OFF continua aparecendo `—` com a flag ON. **Isso
também é paridade.**

---

## 1 · Linha de base, antes de qualquer coisa

| | |
|---|---|
| fichas (`nr13_info_`) | **4** |
| índices de histórico | **5** |
| chaves da organização | **99** |
| linhas na projeção | **0** |
| `busca_v9` | **0** organizações |
| pendências | **0** |

## 2 · Backfill — só desta organização

`reiniciar_rebuild_busca` → `reconstruir_indice_busca` → `auditar_projecao`.

| | |
|---|---|
| projetados | **4 equipamentos + 5 índices de relatório** (4 lotes) |
| tempo | **60 ms** |
| auditoria desta org | `convergiu: true` |
| auditoria da org piloto | `convergiu: true` — **inalterada** |
| `busca_v9` depois do backfill | ainda **0** organizações |

> Backfill e flag são coisas separadas, e isso ficou provado: a projeção existiu por vários
> minutos com a tela ainda no caminho antigo.

## 3 · Flag OFF — o que a tela mostrava ANTES

| | |
|---|---|
| cabeçalho | "4 equipamentos cadastrados" · "4 de 4 equipamentos" |
| busca | **não existe** — só o botão "Filtrar" |
| nós no DOM | **409** |
| cartões | 4, todos com imagem `blob:` |
| campos técnicos | todos `—` · Resultado "Pendente" · Vida "Não calculado" |

## 4 · Flag ON — só nesta organização

`definir_busca_v9('99f642d3-…-8d211c', true)` → `org_sync` com **exatamente uma** linha `true`.

| | OFF | ON |
|---|---|---|
| cabeçalho | 4 de 4 equipamentos | **"4 resultados"** |
| busca | ausente | **caixa visível** + filtros Tipo/Categoria |
| nós no DOM | 409 | **428** |
| TAGs | as mesmas 4 | **as mesmas 4** |
| imagens | 4 | **4** |
| campos técnicos | todos `—` | **todos `—`** |

### 4.1 · DIVERGÊNCIA ENCONTRADA — a cidade do cliente some

| cartão | flag OFF | flag ON |
|---|---|---|
| COMPRESSOR V8-15/200L | `Posto Ipiranga · Vila Velha` | **`Posto Ipiranga`** |
| ZZ-FASE3 | `Posto Shell Prime · Vila Velha` | **`Posto Shell Prime`** |

**Causa, nas duas pontas:**

```ts
// src/features/equipamento/CardEquipamento.tsx:51  (caminho ANTIGO)
[emp?.razaoSocial || emp?.nomeFantasia, emp?.cidade].filter(Boolean).join(' · ');
```

```sql
-- supabase/busca_manutencao.sql  (projeção)
nullif(btrim(coalesce(v_emp ->> 'nomeFantasia', v_emp ->> 'razaoSocial', '')), '')
```

Duas diferenças, não uma:

1. **a cidade não é projetada** — é o que se vê;
2. **a preferência está invertida** — o antigo prefere `razaoSocial`, a projeção prefere
   `nomeFantasia`. Aqui os dois coincidiram e o defeito ficou LATENTE; numa empresa cujo nome
   fantasia difere da razão social, o cartão trocaria de nome sem avisar.

> **CORRIGIDO em 23/08/2026 — ver §11.** A correção autorizada não foi a proposta original de
> uma string composta no banco: ficaram **dois campos estruturados** (`cliente_nome` e
> `cliente_cidade`), com a composição na tela. A cidade **não** entrou na busca textual, e a
> razão está no §11.3.

> **Nenhuma outra diferença de conteúdo foi encontrada.** Em particular, o FLUIDO com prefixo
> duplicado e transbordo do cartão (`A · A - Fluido inflamável, com…`) aparece **igual nos dois
> caminhos** — é defeito cosmético PRÉ-EXISTENTE do cartão, não da Fase 9.
>
> A busca do caminho antigo filtra só TAG + descrição + tipo; a da V9 cobre também fabricante,
> nº de série e cliente. É ganho, não regressão.

## 5 · Busca na tela real

| termo | resultado |
|---|---|
| `ZZ-FASE3` | 1 |
| `ZZ` | 2 |
| `compressor` | 1 |
| `zzzznaoexiste` | "Nenhum resultado" + "Nenhum equipamento para «zzzznaoexiste»" |

Estado na URL (`?q=`) funciona. **Debounce:** 10 teclas a 60 ms → **1 RPC de busca (785 B, 40 ms)
+ 1 de contagem (26 B, 40 ms)**, resultado final correto.

## 6 · DOM, rede e ponte

| | |
|---|---|
| nós | 428 · 4 cartões · 4 imagens · heap 27,2 MB |
| requisições | 1 busca + 1 contagem + 1 `app_storage` (hidratação de boot, que a 9D remove) |
| **PDF** | **nenhum pedido** |
| ficha pela ponte | abre com Memorial/Vida/Categoria, **468 nós — idênticos ao caminho OFF** |
| palco | Prontuário de `COMPRESSOR V8-15/200L` montou a folha PRONT-ULTRASSOM com logo, nº de relatório e data. **Nenhum template alterado** |

> Honestidade: `pedidos: []` na ponte porque o cache já estava hidratado. A prova isolada do
> carregamento sob demanda com cache vazio é o teste de laboratório
> `carregamentoSobDemanda.test.ts`.

## 7 · OFFLINE — rede realmente falhando

**Não se confiou em `navigator.onLine`.** O `fetch` foi substituído para **rejeitar** toda chamada
a `supabase.co`:

```js
window.fetch = async (...a) => {
  const u = typeof a[0] === 'string' ? a[0] : a[0].url;
  if (/supabase\.co/.test(String(u))) { window.__falhas++; throw new TypeError('Failed to fetch'); }
  return window.__origFetch(...a);
};
```

`navigator.onLine` continuou `true` o tempo todo — e mesmo assim:

| prova | resultado |
|---|---|
| requisições falhando de verdade | **86 falhas contadas** |
| lista sem termo | **4 resultados**, do catálogo local, com o selo âmbar **"buscando no que está neste aparelho"** |
| busca `ZZ` offline | **2 resultados** corretos, com selo, "Fim da lista" |
| termo sem correspondência local | estado explicado ("Não foi possível carregar os equipamentos" + "Tentar de novo"), **com o selo** |
| lista vazia sem explicação | **nunca aconteceu** |
| abrir equipamento offline | ficha de `ZZ-FASE3` abriu do cache: foto, fabricante, tipo, categoria |
| **escrita offline** | alteração pelo fluxo da ficha entrou na fila |
| **fila durável** | IndexedDB `nr13_dados_99f642d3-…`, store `fila`: **3 entradas**, cada uma com `mutation_id` (idempotência) e `tentativas` |
| selo da topbar | "Sincronizar (3)" |

**Reconexão** (`fetch` restaurado + eventos `online`/`visibilitychange`):

| | |
|---|---|
| fila | **3 → 2** — a escrita offline drenou |
| as 2 restantes | pendências **pré-existentes** desta conta (`…_EQUIPE TESTE`, de 14/08), anteriores a esta sessão |
| item sumiu? | **não** |

**E o ciclo fechou no servidor:** a escrita feita offline chegou à verdade, a RPC reprojetou
sozinha, e o cartão da V9 passou a mostrar o dado novo.

| `ZZ-FASE3` | antes | depois da drenagem |
|---|---|---|
| `source_version` | 5 | **8** |
| `categoria` | `-` | **III** |
| `volume_m3` | `-` | **1** |
| `projected_at` | 18:10:24 | **18:28:21** |

## 8 · Rollback da flag — ON → OFF

`definir_busca_v9('…8d211c', false)`.

| | |
|---|---|
| organizações com a flag | **0** de 29 |
| tela | voltou inteira ao caminho antigo ("4 equipamentos cadastrados", botão "Filtrar", sem busca) |
| dado | **nada convertido, nada perdido** — inclusive a categoria III e o volume escritos offline |
| projeção | **mantida** (é derivada; não se limpa no rollback) |
| outras organizações | **nenhum efeito** |

## 9 · Auditoria final

| | |
|---|---|
| `auditar_projecao('…8d211c')` | **`convergiu: true`** |
| `auditar_projecao('…8d0f7e')` | **`convergiu: true`** |
| pendências | **0** |
| `equipamentos_index` | **8** (4 + 4, duas organizações) |
| `relatorios_index` | **19** |
| organizações com `busca_v9` | **0** |
| `app_storage` | **891 chaves · 32,9 MB** |
| tombstone do `ZZ-TESTE` | **permanece** — exclusão lógica, como previsto |
| projeto | **Healthy** |

---

## 10 · O que ficou provado, e o que não

**Provado:** flag OFF × ON na tela real, busca em todas as modalidades, debounce, DOM/rede sem
PDF, ponte de compatibilidade, palco sem tocar em template, offline com requisição realmente
falhando, fila durável com idempotência, reconexão, reprojeção automática pela RPC, rollback da
flag e auditoria convergida nas duas organizações.

**Não provado, e por decisão:** nada foi validado dentro da conta real do cliente. E o
carregamento sob demanda com cache VAZIO segue coberto só por teste de laboratório.

**PENDENTE DE DECISÃO SUA:** a divergência do §4.1 (cidade do cliente + preferência de nome).
Ela é a única encontrada, e a regra combinada é clara: *nenhum campo do cartão antigo pode
desaparecer silenciosamente*. **P9.2 não está fechado.**

---

# 11 · A CORREÇÃO — aplicada em 23/08/2026

Autorizada logo depois deste relatório, e limitada à divergência do §4.1.

## 11.1 · Modelagem: dois campos, não uma string

| | |
|---|---|
| `cliente_nome` | `razaoSocial \|\| nomeFantasia` — **a precedência do cartão antigo** |
| `cliente_cidade` | `cidade` (só ela; `localidade` é alias que o cartão antigo não lê) |
| composição | é da TELA: `textoCliente()` faz `[nome, cidade].filter(Boolean).join(' · ')` |

Gravar a string já composta petrificaria formatação de UI dentro do banco, e
qualquer leitor futuro (filtro por cidade, agrupamento, Dashboard, Portal)
teria de fatiar texto para recuperar o que já se sabia na hora de escrever.

`textoCliente()` existe **uma vez** e é usada pelo cartão e pela lista — a
divergência de 23/08 nasceu de cada lado compor esse texto por conta própria.

## 11.2 · Todos os caminhos, não só o backfill

| caminho | arquivo |
|---|---|
| estrutura | `supabase/busca_index.sql` (banco novo) + `supabase/busca_cliente_paridade.sql` (banco já instalado) |
| projetor · manutenção pela RPC · rebuild · reparo | `supabase/busca_manutencao.sql` — insert, `on conflict` e o ramo de reset |
| consulta | `supabase/busca_consulta.sql` — a RPC devolve os dois campos |
| vetor de busca | `supabase/busca_index_indices.sql` — passa a citar `cliente_nome` |
| frontend | `buscaIndex.ts`, `CardCatalogo.tsx`, `EquipamentosV9.tsx`, `equipamentoService.ts` (item pendente), `catalogoLocal.ts` |
| scripts | `posdeploy.sql`, `testes-9c.sql`, `teste-cliente-paridade.sql` |

> A projeção criada hoje e a criada daqui a seis meses produzem o mesmo
> resultado porque **o projetor é um só** — `projetar_equipamento`. Backfill,
> escrita pela `aplicar_mutacao_storage`, rebuild e reparo passam todos por ele.

## 11.3 · A cidade NÃO entrou na busca textual — e por quê

- a busca do caminho **legado** não pesquisa nem cliente nem cidade (filtra TAG
  + descrição + tipo). Cidade pesquisável seria funcionalidade nova, e esta
  correção é de **paridade**;
- trocar a EXPRESSÃO de uma coluna gerada obriga a **derrubá-la e recriá-la**:
  rewrite da tabela e reconstrução do GIN (12 MB por 50.000 linhas, medido na
  9C). **Renomear** `cliente` → `cliente_nome` não custa nada disso — o Postgres
  reescreve a referência dentro da expressão sozinho, e foi conferido em
  produção que a expressão passou a citar `cliente_nome`;
- o catálogo local espelha o vetor do servidor campo a campo. Incluir a cidade
  só de um lado faria a busca offline achar o que a online não acha.

**Nenhum índice novo foi criado.**

## 11.4 · Aplicação em produção

Os três arquivos foram baixados do GitHub no commit `de01cda` e conferidos por
**SHA-256 contra a cópia local** antes de rodar:

| arquivo | SHA-256 (início) | resultado |
|---|---|---|
| `busca_cliente_paridade.sql` | `fbae43a0…` | rename + coluna nova |
| `busca_manutencao.sql` | `c2e778e5…` | projetor novo |
| `busca_consulta.sql` | `f6eb2f1b…` | RPC com os dois campos |

Conferido depois, no banco: coluna `cliente` **não existe mais**,
`cliente_nome`/`cliente_cidade` existem, `busca` continua `GENERATED ALWAYS` e
sua expressão cita `cliente_nome`, `projetar_equipamento` é a versão nova e a
RPC declara `cliente_nome, cliente_cidade`.

## 11.5 · A prova sintética — o caso que produção não tem

`scripts/fase9/teste-cliente-paridade.sql`, rodado **em produção**, projetando
pelo projetor real e desfazendo tudo pela própria exceção final:

```
PARIDADE OK
 | ZZ-PARIDADE-1 PASSA [Alfa Industria e Comercio Ltda · Serra]   ← razão social ≠ nome fantasia
 | ZZ-PARIDADE-2 PASSA [Beta Postos · Vitoria]                    ← só nome fantasia
 | ZZ-PARIDADE-3 PASSA [Gama Energia S.A.]                        ← sem cidade
 | BUSCA-NOME PASSA
 | CIDADE-FORA-DA-BUSCA ok
```

Resíduo depois: **0 chaves, 0 linhas de projeção, 0 pendências**.

No laboratório, `buscaIndex.test.ts` compara `textoCliente()` contra a regra do
legado **reescrita de forma independente**, caso a caso, e
`carregamentoSobDemanda.test.ts` prova que o item PENDENTE (montado no
aparelho, não pela projeção) usa a mesma precedência — senão o cartão trocaria
de nome no instante em que a sincronização terminasse. Suíte: **1.237 → 1.244**.

## 11.6 · Reprojeção — só as duas organizações da validação

| organização | lotes | tempo |
|---|---|---|
| `…8d0f7e` | 4 | — |
| `…8d211c` | 4 | **18,1 ms** (medido no servidor, `clock_timestamp`) |

Auditoria **`convergiu: true`** nas duas · `busca_rebuild_estado` = `concluido`
nas duas · pendências **0** · **nenhuma outra organização tocada**.

E a projeção agora carrega a cidade:

```
COMPRESSOR V8-15/200L → Posto Ipiranga · Vila Velha
ZZ-FASE3             → Posto Shell Prime · Vila Velha
FALCON CG MS - 427L  → Falcon Aditivos · Campo Grande
```

> Os ~6 s de relógio por organização são ida e volta de HTTP do painel; o custo
> real do servidor é o de cima.
