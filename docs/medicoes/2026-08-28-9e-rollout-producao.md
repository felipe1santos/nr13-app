# Fase 9 · 9E — rollout repetido em produção (28/08/2026)

Segunda execução do roteiro, depois da correção dos três defeitos
(`2026-08-28-9e-destravamento.md`). **O passo 11 — o que reprovou em 25/08 —
passou.** Rollback feito e conferido no mesmo dia; a flag `busca_v9` voltou para
OFF nas 30 organizações.

> **Nenhum PDF foi regenerado e nenhum SHA-256 mudou.** Os quatro artefatos da
> organização de teste continuam com o mesmo hash que tinham antes, e a tela
> exibe exatamente esse hash — conferido linha a linha contra o banco.

---

## 1 · SQL da projeção — o `->> 'path'` (o passo que não podia ser pulado)

`supabase/busca_manutencao.sql` aplicado a partir do commit `a944845`:
"Success. No rows returned".

Conferência pelo `prosrc` — **a auditoria não serve aqui** (armadilha nº 2: ela
converge com a função velha):

| função | lê `->> 'path'` | ainda lê `->> 'caminho'` |
|---|---|---|
| `projetar_relatorios` | **true** | false |
| `projetar_equipamento` | false (não lê `pdfRef`) | false |

## 2 · Reprojeção — só relatórios, só nas organizações já projetadas

Bloco `do $$ … $$` iterando as chaves `nr13_historico_indice_*` das organizações
que **já tinham** projeção. Nenhuma organização nova entrou por este caminho.

**O antes e o depois, medidos na mesma consulta:**

| | antes | depois |
|---|---|---|
| linhas em `relatorios_index` | 22 | 22 |
| `pdf_ref` NULO | **22** | **11** |
| com `sha256` gravado | 11 | 11 |
| **com `sha256` e SEM `pdf_ref`** | **11** | **0** ✅ |
| `pdf_ref` fora do padrão `<org>/relatorios/…` | — | 0 |
| `source_version` nula / mínima | — | 0 / 1 |
| `busca_pendencias` | — | **0** |

Os 11 que continuam sem `pdf_ref` são os relatórios **legados**, anteriores ao
§7-quater: não têm arquivo arquivado, e é para eles que existe o caminho
`legado=1` (§7 abaixo).

## 3 · SQL da busca

`supabase/busca_relatorios.sql` aplicado — a guarda no topo deixou passar porque
o passo 1 já estava feito.

| conferência | valor |
|---|---|
| sobrecargas de `buscar_relatorios` / `contar_relatorios` | **1 e 1** (sem ambiguidade) |
| `anon` executa? | **false** / **false** |
| `authenticated` executa? | **true** / **true** |
| índices em `relatorios_index` | **6** |
| retorno traz `equipamento_ativo` | sim |

**Smoke da RPC, como o usuário mestre da organização de teste:**

| escopo | linhas |
|---|---|
| `ativos` | **3** — paridade exata com a tela legada |
| `historicos` | **12** |
| `todos` | 15 |
| com `pdf_ref` | 4 |
| `contar_relatorios('ativos')` | total **3**, historicos **12** |

## 4 · Saúde e publicação

- Projeto Supabase: **Healthy** (NANO).
- Coolify: deploy do commit `a944845`, **Success**, 01m54s (16:39:29 → 16:41:23 UTC).

**Bundle conferido por `curl`, e o nome NÃO bastou como prova** — ver a nota de
operação no fim. O que prova é a string literal:

| marcador (só existe no commit de hoje) | no bundle servido |
|---|---|
| `/relatorios?legado=1&tag=` | presente |
| `mais de 200` | presente |
| `Voltar à busca` | presente |
| `Mostrando apenas relatórios de equipamentos excluídos` | presente |
| `Equipamento excluído` | presente |

## 5 · Linha de base com a flag OFF

`/relatorios` = tela legada, "Equipamentos Cadastrados", sem campo de busca:
**1 + 0 + 2 + 0 = 3 relatórios**. Idêntica à linha de base de 25/08.

## 6 · Flag ON — a tela nova

`definir_busca_v9('99f642d3-…-8d211c', true)` → `busca_v9` ON em **1** das 30;
`boot_v9` intacto em 2.

| passo | resultado |
|---|---|
| Busca visível, contagem | **3 resultados** — paridade com a tela antiga |
| Aviso de histórico | "**12 relatórios** de equipamento excluído estão fora desta lista." + "Ver histórico" |
| `Sem data` | sim, sem a sentinela `01/01/0001` |
| Busca por TAG (`ZZ-FASE3`) | 2 resultados, estado na URL (`?q=`) |
| Termo inexistente | "Nenhum resultado" + "Limpar busca" |
| Período (`?de=2026-08-20&ate=2026-08-22`) | 2 resultados (o de 19/08 sai); o aviso de histórico some junto, porque os 12 órfãos não têm data no período — **os dois números falam do mesmo conjunto** |
| **PDF durante busca, filtro e período** | **ZERO** — 36 requisições registradas, nenhuma de `storage` |

## 7 · Passo 11 — o que reprovou em 25/08

**Clicar em "Visualizar" ABRE o documento.**

| | ZZ-FASE3 (equipamento ativo) | VASO A23 (equipamento EXCLUÍDO) |
|---|---|---|
| Abriu | sim | sim |
| Páginas na tela | **13** | **18** |
| Páginas no banco | 13 | 18 |
| SHA-256 na tela | `ec93a6d3…1b151d` | `9cc2902b…12d782` |
| SHA-256 no banco | **idêntico** | **idêntico** |
| Origem do arquivo | cofre local (nenhuma requisição ao bucket) | cofre local (só `blob:` + o visualizador nativo) |
| Cabeçalho | "Documento arquivado — o que você vê é o arquivo emitido." | idem |
| Voltar | "Voltar à busca" devolve a lista **com o período preservado** (2 resultados) | volta ao escopo `historicos` (12) |

**Escopo `historicos`:** 12 resultados, aviso "Mostrando apenas relatórios de
equipamentos excluídos. Eles continuam salvos e podem ser abertos." + "Ver
todos", e **todas** as linhas com o selo âmbar **EQUIPAMENTO EXCLUÍDO**
(`VASO A23`, `CALD-01`, `VASO 02`).

**Fallback legado:** clicar num relatório SEM artefato (CALD-01) levou a
`/relatorios?legado=1&tag=CALD-01&rel=REL-1785970122820`, e a tela antiga montou
o documento (capa com a logo e a TAG, barra Imprimir / Baixar PDF /
Configurações). O relatório é de equipamento excluído e mesmo assim abriu.

**Não exercitado nesta massa, e por quê:**

- **cache frio sob `boot_v9`** (cair no histórico da TAG em vez da lista de
  equipamentos): exigiria limpar o IndexedDB do aparelho; está coberto por
  código e por comentário, não por medição em produção;
- **paginação/keyset**: 12 itens contra uma página de 50. Foi medido em
  laboratório com 50.000 (`2026-08-25-9e-relatorios-escala.md`).

## 8 · Rollback ON → OFF

`definir_busca_v9(org, false)`. Estado conferido depois:

| conferência | valor |
|---|---|
| `org_sync` total | **30** |
| `busca_v9` ON | **0** |
| `boot_v9` ON | **2** (intacto) |
| `relatorios_index` / `equipamentos_index` / `calibracoes_index` | **22 / 17 / 18** |
| `busca_pendencias` | **0** |
| índices de `relatorios_index` | **6** |
| linhas com `sha256` e sem `pdf_ref` | **0** (a correção da projeção PERMANECE) |
| `/relatorios` na tela | tela legada, os mesmos **3** relatórios da linha de base |

Sem migração reversa, sem perda de dado, sem remoção de índice, sem alteração de
PDF, e sem tocar em nenhuma das outras 29 organizações.

---

## Nota de operação: duas armadilhas, uma velha e uma nova

1. **O painel do SQL Editor voltou a servir o resultado ANTERIOR** (armadilha nº
   4). Aconteceu de novo: a consulta com colunas `h1_*` exibiu o resultado
   `g1_*` da consulta anterior. **Conferir as COLUNAS, não os valores** — e abrir
   aba nova, que foi o que resolveu.
2. **NOVA: o nome do bundle não mudou entre o deploy velho e o novo**
   (`index-Ccsir5D0.js` nos dois). Conferir o NOME não prova nada; o roteiro já
   mandava procurar uma **string literal** dentro do arquivo, e é isso que vale.
3. **NOVA: a captura de tela trava enquanto o visualizador nativo de PDF está
   montado.** `Page.captureScreenshot` estourou 30 s e `document_idle` nunca
   chegou, com a página VIVA (o heartbeat de sessão continuou batendo). Não é
   defeito do app: o `blob:` foi servido, o PDF renderizou, e a segunda tentativa
   de captura funcionou. Não confundir "a automação não consegue fotografar" com
   "a tela travou".

---

## Veredito técnico

Os 14 passos do roteiro foram executados. O critério que reprovou em 25/08 —
*"clicar explicitamente em pelo menos um relatório arquivado real e confirmar:
abre o `pdfRef` existente"* — foi cumprido em dois relatórios, com o SHA-256 da
tela conferido contra o banco nos dois.

---

## 🚪 DECISÃO DO DONO — 9E FECHADA ✅ (28/08/2026)

**Aceito como provado:** SQL aplicado · projeção corrigida · `pdf_ref`/`path` validado · busca em
produção · RLS · índices · busca V9 · ativos e históricos de equipamentos excluídos · abertura
real do PDF · SHA-256 · zero PDF durante a busca · rollback · 1410/1410 · build verde · árvore
limpa · **nenhuma conta pagante habilitada**.

**DUAS LIMITAÇÕES DECLARADAS NO FECHAMENTO — e nenhuma delas é aprovada por inferência:**

1. **Cache frio sob `boot_v9`** — o caminho em que o aparelho não tem o índice daquela TAG **não
   foi exercitado** no rollout da organização de teste. Coberto por código, não por medição.
   **Não tratar como aprovado.**
2. **Paginação / keyset** — validada em laboratório com massa de **50.000** relatórios, mas **não**
   exercitada na organização de teste, que tem 12 relatórios contra uma página de 50. **Não conta
   como teste de rollout dessa organização.**

**Restrições que continuam valendo:** `busca_v9` permanece **OFF nas 30** — **não habilitar em
organização cliente** sem autorização nova e separada. **A 9F não está autorizada e não começa
sozinha.** `cmam.caldeiras` segue não habilitada.
