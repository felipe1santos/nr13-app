# 9F.5 + 9F.6 · ROLLOUT CONTROLADO EM PRODUÇÃO — COMPLETO, E DE VOLTA PARA OFF

**03/09/2026** · projeto `qqsesrntfvmdxqxrfvmw` (org Supabase **SAAS-NR13**, projeto
**SAAS NR13**, branch `main`, badge PRODUCTION). Organização de teste
`99f642d3-6efd-446d-9e76-d234ad8d211c` (`teste@gmail.com`).

Commit do gate e do rollout: **`976408e`** — os três SQL e o front são os mesmos que
passaram pelo gate local, sem uma linha de diferença.

> **ESTADO FINAL: `vencimentos_v9` e `relatorios_v9` OFF nas 30 organizações.**
> Nenhum cliente teve tela alterada. As sete flags anteriores ficaram como estavam
> (`v2_ativa` 30 · `boot_v9` 2 · as outras cinco em 0). Nada foi escrito em
> `app_storage` durante o rollout.

---

## 1 · Preflight (somente leitura)

| item | antes |
|---|---|
| organizações em `org_sync` | 30 |
| `equipamentos_index` / `relatorios_index` | 17 / 22 linhas |
| `org_sync.vencimentos_v9` | **não existia** |
| `org_sync.relatorios_v9` | **não existia** |
| `contar_relatorios_por_tag` | **não existia** |
| `vencimentos_org` | **já existia** (desde 25/08) |
| `relatorios_index_org_tag_idx` | **já existia** (desde a 9E) — o pré-requisito da 9F.6 |
| flags | `v2_ativa` 30 · `boot_v9` 2 · `busca_v9`/`inspecoes_v9`/`prontuarios_v9`/`calibracoes_v9`/`livro_v9` **0** |

As duas últimas linhas são o que torna esta etapa barata: **nenhuma projeção nova,
nenhuma coluna nova, nenhuma reprojeção TAG a TAG.** A 9F.4 precisou reprojetar
equipamento por equipamento; aqui não houve nada a reprojetar.

## 2 · Aplicação — três arquivos, cada um conferido por SHA-256 ANTES de rodar

Regra do §13 do `CLAUDE.md`. Os arquivos em disco estão em CRLF; o Monaco normaliza para
LF, então a referência é o hash do texto **LF-normalizado**. A conferência foi feita
**dentro da página**, comparando o hash do texto que estava no editor com o do commit — e
o `Run` só é acionado se forem iguais.

| # | arquivo | bytes (LF) | SHA-256 conferido no editor |
|---|---|---|---|
| 1 | `supabase/vencimentos_v9_flag.sql` | 5.150 | `c7dadaa45e88293a923323c8ae5e77da53e4ed310f29de65a126d7d996f77c81` |
| 2 | `supabase/relatorios_catalogo.sql` | 4.558 | `6f69aac93c76e35ad6693cdec1272e0ca01c8e9fad1ee10e768d54d2dc04a912` |
| 3 | `supabase/relatorios_v9_flag.sql` | 3.646 | `f7472a4d0b01bce7fb8580678232c267f628feb72afbd97b122ec77692b22fa6` |

**A ordem foi corrigida no ato:** o cabeçalho do arquivo 3 manda aplicá-lo DEPOIS do
`relatorios_catalogo.sql`, e a ordem alfabética teria invertido os dois. Ligar a flag de
uma tela cuja RPC ainda não existe é publicar um catálogo que responde erro a cada página.

### Verificação DEPOIS — por estrutura e ACL, nunca pela mensagem

"Success" confirma que o servidor executou o que recebeu, não que recebeu o que se
escreveu.

| conferido | resultado |
|---|---|
| `org_sync.vencimentos_v9` | `boolean NOT NULL default false` |
| `org_sync.relatorios_v9` | `boolean NOT NULL default false` |
| `contar_relatorios_por_tag` | `security definer`, `stable`, retorno **`TABLE(tag text, total integer)`** — dois campos, sem `pdf_ref` nem `sha256` (invariante I10) |
| ACL de `contar_relatorios_por_tag` | `authenticated` = true · `anon` = **false** |
| ACL de `definir_vencimentos_v9` / `definir_relatorios_v9` | `authenticated` = **false** · `anon` = **false** |
| flags novas ligadas | **0 de 30** — nasceram desligadas |
| flags anteriores | idênticas ao preflight |

**Um erro registrado, e ele foi só de leitura:** a primeira consulta de verificação
falhou com `operator is not unique: text || "char"` (`pg_proc.provolatile` é `"char"`).
Consulta de conferência, nada escrito; corrigida com `::text` e repetida.

## 3 · Deploy do front — publicado pelo Coolify

O bundle no ar (`assets/index-B0NvLXJL.js`, 3.188.343 B) tinha **0** ocorrências de
`vencimentos_v9`, `relatorios_v9` e `contar_relatorios_por_tag`: o front das duas etapas
estava no `main` e não no ar.

Redeploy disparado na aplicação *NOVO - APP - NR13*, importando o commit
**`976408eda9c890f463d5cea5683339032b13f651`** — exatamente o que havia sido pushado.

**Conferido pelo BUNDLE** (`assets/index-CQ4ywCkX.js`, 3.194.261 B):

| marcador | antes | depois |
|---|---|---|
| `nr13_vencimentos_v9` · `nr13_relatorios_v9` | 0 | **1** cada |
| `contar_relatorios_por_tag` | 0 | **1** |
| `nr13_busca_v9` · `nr13_boot_v9` · `nr13_inspecoes_v9` · `nr13_prontuarios_v9` · `nr13_calibracoes_v9` · `nr13_livro_v9` | 1 | 1 (intactas) |

## 4 · Baseline com as duas flags OFF

`/relatorios` no bundle novo, flags ainda desligadas — o caminho legado:

```
4 cartões, SEM campo de busca
COMPRESSOR V8-15/200L   VASO DE PRESSÃO   CAT —     PMTA —   1 Relatórios
DASDSA                  VASO DE PRESSÃO   CAT —     PMTA —   0 Relatórios
ZZ-FASE3                VASO DE PRESSÃO   CAT III   PMTA —   2 Relatórios
ZZ-TESTE-P2             VASO DE PRESSÃO   CAT —     PMTA —   0 Relatórios
```

**1 requisição a `/rest/v1/app_storage`** ao abrir a tela: a hidratação integral da
organização. Com 4 equipamentos é uma página; é a mesma chamada que, numa conta grande,
vira N páginas de 1.000.

`/dashboard`: 4 equipamentos · 0 a vencer · 0 vencidos · 100 % de conformidade.

> **Esta organização já tinha `boot_v9` ligada**, então pela regra da disjunção o painel
> já vinha do servidor mesmo com `vencimentos_v9` OFF. É por isso que os KPIs do baseline
> e os do teste têm de ser IDÊNTICOS: aqui a 9F.5 não muda a fonte, ela desamarra a
> decisão da flag alheia. O que ela muda de fato é a contagem de chamadas — §5.2.

## 5 · Flags ON só em `teste@gmail.com`

`definir_vencimentos_v9(...)` + `definir_relatorios_v9(...)` → **1 organização de 30** com
cada flag. Nenhuma outra tocada. O app resincronizou no boot: `nr13_vencimentos_v9` e
`nr13_relatorios_v9` apareceram no `localStorage` ao lado de `nr13_boot_v9`.

### 5.1 · A prova central da 9F.6: o `lerTudo()` sumiu

| ação | requisições | `app_storage` |
|---|---|---|
| abrir `/relatorios` | **3** — `buscar_equipamentos`, `contar_equipamentos`, `contar_relatorios_por_tag` | **0** |
| baseline, a mesma tela | 1 | **1** (a organização inteira) |

Uma chamada de contagem para a PÁGINA, não uma por cartão.

### 5.2 · A prova central da 9F.5: uma chamada por boot

Boot completo de `/dashboard`, medido no Resource Timing: **1** chamada a
`rpc/vencimentos_org`. O registro AS-IS de 03/09 media **duas** nesta mesma tela, e o
laboratório mediu **três** com a janela desligada (o `focus` da aba recém-carregada é a
terceira). As outras 3 requisições a `app_storage` são o conjunto FIXO do boot leve
(globais, rastreabilidades, permissões), não a tela.

### 5.3 · Abertura sob demanda — 2 requisições, ambas POR TAG

Ao clicar em `ZZ-FASE3`: exatamente **2** chamadas a `app_storage` — a semeadura das
chaves daquela TAG e os `nr13_rel_` daquela TAG — e o histórico montado com os
**relatórios REAIS**:

```
Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf   ZZ-FASE3   INSPEÇÃO PERIÓDICA   21/08/2026
Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf   ZZ-FASE3   INSPEÇÃO PERIÓDICA   21/08/2026
```

É o risco bloqueante da etapa — "semear antes de ler" — conferido por CONTEÚDO, não por
ausência de erro. O mesmo número de 2 requisições da 9F.4, pela mesma razão: a TAG tem
relatório salvo, então a segunda chamada existe.

### 5.4 · Paridade OFF × ON

**Os quatro cartões são idênticos nos dois caminhos**, campo a campo, contagem de
relatórios incluída (1 · 0 · 2 · 0) — e com a flag ligada esse número vem de
`contar_relatorios_por_tag` em vez de `listarIndice(tag).length`.

Os KPIs do painel também: 4 · 0 · 0 · 100 %. `/vencimentos` listou os mesmos 4
equipamentos, todos "Sem prazo cadastrado".

Diferenças ficaram **só** onde a etapa promete mudar: existe campo de busca, existe
paginação, e a lista deixou de baixar a organização.

## 6 · Rollback

`definir_vencimentos_v9(org,false)` + `definir_relatorios_v9(org,false)` → **0 ON nas 30**.
O app resincronizou (as duas chaves sumiram do `localStorage`), `/relatorios` voltou ao
baseline: 4 cartões, **sem** campo de busca, **0** `buscar_equipamentos`, e
`app_storage` de volta ao caminho legado. Conteúdo dos cartões inalterado.

> **`boot_v9` continuou ligada na org de teste, e o painel continuou vindo do servidor.**
> É a regra da disjunção funcionando em produção: desligar `vencimentos_v9` não devolve
> ao caminho local quem tem boot leve — devolver ali seria contar zero num cache que o
> boot leve nunca encheu.

## 7 · Estado final

| | |
|---|---|
| `vencimentos_v9` · `relatorios_v9` | **OFF nas 30 organizações** |
| `boot_v9` | as mesmas **2** organizações de antes |
| `v2_ativa` | 30 |
| `busca_v9` · `inspecoes_v9` · `prontuarios_v9` · `calibracoes_v9` · `livro_v9` | 0 |
| escritas em `app_storage` | **0** em toda a janela |
| front publicado | `assets/index-CQ4ywCkX.js`, commit `976408e` |
| `EQUIPE TESTE` e `cmam.caldeiras` | intocadas |

## 8 · O que ficou provado ONDE

**EM PRODUÇÃO:** os três arquivos aplicados e conferidos por hash antes e por
estrutura/ACL depois; o front publicado e conferido pelo bundle; `lerTudo()` fora de
`/relatorios`; uma chamada de agregado por boot; a semeadura por TAG com histórico real;
paridade OFF × ON campo a campo; e o rollback devolvendo a tela ao baseline.

**SÓ NO LABORATÓRIO:** a escala (1k/10k/50k), a prova offline com o servidor fora, e o
comportamento com cache vazio sob boot leve. A organização de teste tem 4 equipamentos —
ela prova que funciona, não que aguenta.

**NÃO PROVADO, e declarado:** o custo do agregado numa organização grande em produção. O
laboratório mediu 220 ms em 50.000 equipamentos; nenhuma conta real chega perto disso
hoje, e é o que a 9G.2 ataca.
