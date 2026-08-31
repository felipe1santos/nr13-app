# 9F.3 — `/calibracoes` · ANÁLISE AS-IS (31/08/2026)

> **O que este arquivo é:** a leitura do estado ATUAL da tela `/calibracoes` e o escopo
> proposto para a 9F.3. **Nada foi implementado.** Nenhuma linha de `src/`, nenhum schema,
> nenhum SQL de produção, nenhuma flag e nenhuma organização cliente foram tocados. As únicas
> operações executadas contra o banco foram **`select` de leitura**.

---

## 0 · Aviso que veio junto e não é da Fase 9

O painel do Supabase mostra agora a faixa vermelha **"Services restricted · Your projects are
unable to serve requests as your organization has used up its quota"** e o selo **EXCEEDING
USAGE LIMITS** no projeto `SAAS NR13`. É a escalada do aviso de cota de agosto: antes era
período de graça, agora é restrição declarada. O SQL Editor do painel ainda respondeu — as
consultas desta análise rodaram às 03h08 de 31/08 —, mas **o app dos clientes pode estar sendo
recusado**. É decisão de cobrança, não de código: **nada da Fase 9 conserta isso**, e a Fase 9
também não deve ser apressada por causa disso.

---

## 1 · O caminho atual, do clique até o cartão

`src/pages/Calibracoes.tsx` (1.148 linhas) tem cinco telas dentro de um arquivo só
(`equipamentos` · `historico` · `formulario` · `visualizador` · `verDados`). A 9F.3 mexe com a
PRIMEIRA, a lista.

| onde | o quê |
|---|---|
| `Calibracoes.tsx:240` | `setEquipamentos(await listarEquipamentos())` |
| `Calibracoes.tsx:243` | efeito de montagem que chama o de cima |
| `equipamentoService.ts:19-27` | `listarEquipamentos()` = **`await lerTudo()`** + varredura do prefixo `nr13_info_` + `montarResumo` por TAG |
| `Calibracoes.tsx:225` | `proprietarios` — `useMemo` que roda `proprietarioDe` em **todos** os equipamentos |
| `Calibracoes.tsx:228-236` | `equipamentosFiltrados` — `useMemo` que roda `proprietarioDe` **de novo**, por item |
| **`Calibracoes.tsx:417`** | **`const qtd = listarCalibracoes(eq.tag).length;` — DENTRO do `.map()` do render** |
| `Calibracoes.tsx:418` | `const prop = proprietarioDe(eq.tag);` — terceira leitura de `nr13_emp_<TAG>` |
| `Calibracoes.tsx:273-283` | `abrirEquipamento(eq)` — `listarCalibracoes` + `listarComponentes` + `listarLotes` |

`listarCalibracoes` é `ler<DadosCalibracao[]>('nr13_calibracoes_' + tag) ?? []`
(`calibracaoService.ts:7`), e `ler` faz `JSON.parse` do valor inteiro.
`proprietarioDe` (`Calibracoes.tsx:40-43`) é `ler<EmpresaEquipamento>('nr13_emp_' + tag)`.

### O que a lista mostra hoje

TAG · tipo · proprietário · categoria · PMTA · **quantidade de calibrações**. Filtros: **dois
selects** (`filtroTipo`, `filtroProp`) e um botão "Limpar filtros". **Não há campo de busca por
texto, não há paginação e não há virtualização.** Todos os cartões vão para o DOM.

---

## 2 · `listarCalibracoes` no render — sim, acontece, e é o alvo

Está em `Calibracoes.tsx:417`, dentro de `equipamentosFiltrados.map(...)`. Consequência:

- **um `JSON.parse` por cartão, a cada re-render** — e a lista re-renderiza ao trocar qualquer
  filtro, ao voltar de outra tela e a cada `setState` do componente, que é grande;
- não é memoizado por TAG: `useMemo` cobre a filtragem, **não** a contagem;
- some junto o `proprietarioDe` da linha 418, que é a **terceira** leitura de `nr13_emp_<TAG>`
  no mesmo quadro (as outras duas estão nos dois `useMemo`).

Por cartão, no pior caso do parque medido: **8,9 KB** de JSON de calibrações + o `nr13_emp_`.
Numa organização com 39 equipamentos e todos com lista cheia, é ~350 KB de `JSON.parse` por
quadro para imprimir 39 números inteiros.

---

## 3 · Peso real dos dados — medido em PRODUÇÃO (31/08/2026 03h08, somente leitura)

`app_storage`, linhas vivas (`deletado_em is null`), **as 30 organizações juntas**:

| | |
|---|---|
| linhas vivas | **803** |
| tamanho total | **3,23 MB** |
| `nr13_info_` (equipamentos) | **67** |
| `nr13_emp_` | **62** |
| `nr13_calibracoes_<TAG>` (as listas) | **9** · média **2,1 KB** · maior **8,9 KB** |
| `nr13_calibracao_item_<id>` | **21** · **21,1 KB** somados |
| `nr13_componentes_cal_<TAG>` | **9** · **5,7 KB** somados |
| `nr13_lotes_cal_<TAG>` | **8** |
| `calibracoes_index` (projeção já existente) | **18 linhas** |

### Por organização (as 7 maiores)

| org | equip. | listas cal | itens cal | comp. | lotes | linhas | KB totais | KB de `info`+`emp` |
|---|---|---|---|---|---|---|---|---|
| `06f84f2e…` (`cmam.caldeiras`) | **39** | 1 | 2 | 2 | 2 | **369** | **780** | **53** |
| `32512667…` | 4 | 4 | 10 | 4 | 4 | 113 | 592 | 3 |
| `99f642d3…` (TESTE) | 4 | 0 | 0 | 1 | 0 | 59 | 618 | 1 |
| `32d3fa95…` | 4 | 0 | 0 | 0 | 0 | 58 | 308 | 3 |
| `92a28bff…` (piloto) | 3 | 1 | 8 | 1 | 1 | 64 | 355 | 2 |
| `5ea4861f…` | 3 | 0 | 0 | 0 | 0 | 15 | 4 | 1 |
| `be25cb86…` | 2 | 0 | 0 | 0 | 0 | 31 | 163 | 1 |

**O número que explica a fase inteira:** na maior organização, abrir `/calibracoes` hidrata
**369 linhas / 780 KB** para desenhar uma lista que precisa de **53 KB**. **93% do que é
baixado e interpretado no mount não é usado pela lista.** É a mesma conta da 9E, da 9F.1 e da
9F.2 — a tela muda, o desperdício é o mesmo.

E o desperdício **cresce com o parque, não com as calibrações**: essa organização tem 39
equipamentos e **1** lista de calibração. O peso vem das fotos, dos memoriais e dos relatórios
que `lerTudo()` traz junto.

---

## 4 · Dependência do `lerTudo()` e o conflito com o `boot_v9`

`listarEquipamentos()` começa com `await lerTudo()`. Com `boot_v9` ligada, o boot leve carrega
só o essencial — e **abrir `/calibracoes` desfaz o boot leve na hora**, baixando a organização
inteira. É exatamente o defeito que a 9F.1 (`/inspecoes`) e a 9F.2 (`/prontuarios`) já
consertaram nas suas telas; `/calibracoes` é o terceiro dos quatro consumidores restantes de
`listarEquipamentos()`:

| tela | estado |
|---|---|
| `/equipamentos` | já tem caminho V9 (`busca_v9`) |
| `/inspecoes` | já tem caminho V9 (`inspecoes_v9`) — 9F.1 |
| `/prontuarios` | já tem caminho V9 (`prontuarios_v9`) — 9F.2 |
| **`/calibracoes`** | **ainda em `lerTudo()` — esta fase** |
| `/relatorios` | ainda em `lerTudo()` — fase seguinte |

---

## 5 · Requisições, DOM e heap — o que dá para afirmar e o que NÃO dá

- **Requisições e bytes do mount:** derivam direto de `lerTudo()`. Na maior organização são
  **369 linhas / 780 KB** de `app_storage` (medido no banco), mais as fotos que a hidratação
  resolve. Contra isso, o caminho da projeção pede **51 linhas** por página.
- **DOM:** um cartão por equipamento, sem virtualização. Hoje o pior caso real são 39 cartões;
  o gate de laboratório da 9F.1/9F.2 mostrou o padrão virtualizado estabilizando em ~11 linhas
  no DOM com 50.000 registros no banco.
- **Heap:** **não medido nesta análise.** Medir o AS-IS em escala exigiria gerar massa em uma
  organização de produção — **escrita**, que não está autorizada nesta etapa, e que agora
  esbarraria também na restrição de cota do §0. Fica **declarado como não medido**, e é item do
  gate de navegador da implementação, não da análise.

---

## 6 · O que já existe pronto e pode ser reaproveitado

Esta é a parte barata da 9F.3, e é grande:

1. **`calibracoes_index` JÁ EXISTE** (`supabase/vencimentos_agregado.sql:75`), com **18 linhas
   projetadas** em produção agora. Uma linha por calibração, PK `(org_id, calibracao_id)`,
   índices `(org_id, tag)` e `(org_id, prox_calibracao)`, RLS ligada **sem policy de select**
   (fecha por padrão; leitura só por RPC). É mantida por `projetar_calibracoes`, chamada de
   dentro de `projetar_equipamento` — **a máquina de estados da projeção não muda**.
2. **A contagem por TAG sai de um `count` sobre ela**, exatamente como a `inspecoes` da 9F.1 e
   a `tem_prontuario` da 9F.2 saíram do `app_storage`. É mais uma coluna `nullable` em
   `equipamentos_index` + mais um campo no retorno de `buscar_equipamentos`.
3. **O contrato "semear antes de ler" JÁ COBRE calibrações.** `carregarEquipamento(tag)`
   (`equipamentoService.ts:173-185`) semeia `chavesDoEquipamento(tag)` — e `familiasChave.ts`
   tem `nr13_calibracoes_`, `nr13_componentes_cal_` e `nr13_lotes_cal_` em `POR_TAG` — e depois
   faz a **segunda passada** que semeia `nr13_calibracao_item_<id>` a partir da lista. Ou seja:
   o risco bloqueante da 9F.2 ("o documento não pode abrir vazio") **já tem a solução
   instalada** para esta tela.
4. **O catálogo virtualizado da 9F.2** (`CatalogoProntuariosV9.tsx`, 258 linhas, com
   `BuscaLista` + `ListaVirtualizada` + keyset) é o molde: muda a coluna que o cartão mostra e
   o que acontece ao clicar.
5. `montarResumoDoCache(tag)` já é exportado e monta o `EquipamentoResumo` do cache **sem ir ao
   servidor** — foi extraído na 9F.2 justamente para isso.

---

## 7 · Escopo proposto para a 9F.3 (para APROVAÇÃO — não implementado)

| bloco | o quê |
|---|---|
| **9F.3.0** | Registro do AS-IS (este arquivo) |
| **9F.3.1** | Coluna `calibracoes integer` **nullable** em `equipamentos_index`; projeção conta de `calibracoes_index` por `(org, tag)`. **Não existe `tem_calibracoes`** — o número é o dado, e `null` significa "não sei" |
| **9F.3.2** | `buscar_equipamentos` devolve `calibracoes`; `ItemCatalogo.calibracoes: number \| null`; o rótulo **some** quando é `null` |
| **9F.3.3** | `catalogoCalibracoes.ts` — `abrirEquipamentoParaCalibracoes(tag)`: `await carregarEquipamento(tag)` **antes** de `listarCalibracoes` / `listarComponentes` / `listarLotes` |
| **9F.3.4** | `CatalogoCalibracoesV9.tsx` — lista da projeção, com busca por texto (que a tela **nunca teve**), keyset e virtualização; os filtros de tipo/proprietário passam a ser do servidor |
| **9F.3.5** | Flag `calibracoes_v9` em `org_sync`, com `definir_calibracoes_v9` e o degrau novo na escada de fallback do `flag.ts` |
| **9F.3.6** | Testes: SQL (`testes-9f3.sql`), unidade, cruzamento semeadura × leitura, gate de navegador 1k/10k/50k |

**O `listarCalibracoes` do render sai da tela nova por construção** — a contagem vem pronta do
servidor. Na tela legada ele **permanece**, e isso é de propósito: com a flag OFF, o
comportamento tem que continuar sendo exatamente o de hoje.

---

## 8 · Riscos

| risco | por quê | como se paga |
|---|---|---|
| **1 · A tela de calibração abrir vazia** | é o mesmo risco da 9F.2: a lista deixa de hidratar tudo, e `abrirEquipamento` lê 4 famílias de chave (`nr13_calibracoes_`, `nr13_componentes_cal_`, `nr13_lotes_cal_`, `nr13_calibracao_item_<id>`) | teste de cruzamento explícito "o que a tela lê × o que `carregarEquipamento` semeia", e a prova final abrindo um equipamento COM calibração e conferindo lista, componentes, lotes e o certificado |
| **2 · `null` virar `0`** | um cartão dizendo "0 calibrações" sem ter contado é pior que não dizer nada — é o número que o usuário usaria para decidir que um acessório não precisa calibrar | a coluna nasce `nullable`, o mapeamento distingue `null` de `0`, e há teste para os dois |
| **3 · A projeção esquecer o `on conflict do update`** | **já aconteceu na 9F.2** e foi pego pelo `testes-9f2.sql`: sem `calibracoes = excluded.calibracoes`, só a PRIMEIRA projeção grava e a coluna congela | assertiva dedicada no `testes-9f3.sql`, escrita ANTES da função |
| **4 · A contagem divergir da tela antiga** | `calibracoes_index` é uma linha por calibração; `listarCalibracoes().length` é o tamanho do array. Se a projeção descartar algo (calibração sem id, por exemplo), os números divergem | paridade linha a linha contra a verdade, na org de teste, **antes** de olhar a tela — o mesmo passo que pegou a divergência na 9F.1 |
| **5 · Quebrar os outros 3 consumidores de `listarCalibracoes`** | `ModalDetalheEquipamento.tsx:61`, `ModalNovaInspecao.tsx:75` e `PortalAtivo.tsx:100` leem a mesma função | **não se toca em `listarCalibracoes`.** A 9F.3 muda quem CHAMA, não o que a função faz |
| **6 · O Portal do Cliente** | `PortalAtivo` roda em conta somente leitura, com hidratação própria | o Portal fica **fora** da flag, como ficou na 9F.1 e na 9F.2 |
| **7 · Cota do Supabase** | §0 — o projeto está com serviços restritos | rollout só depois de a cobrança estar resolvida; não é risco de código |

**O que a 9F.3 NÃO toca:** documentos e relatórios já emitidos. Nenhum template de `public/`
muda, nenhum PDF é regenerado, nenhum SHA-256 se altera. `nr13_calibracao_item_<id>` continua
sendo a fonte do certificado, e `meta.certCalibracoes` (§7-bis do CLAUDE.md) continua congelada
dentro do relatório salvo.

---

## 9 · Testes necessários (o gate desta fase)

1. **SQL — `scripts/fase9/testes-9f3.sql`:** a coluna existe e é `nullable`; a projeção conta
   certo; **o `on conflict do update` inclui a coluna nova** (risco 3); a RPC devolve o campo;
   grants `anon` false / `authenticated` true; a flag nasce desligada; as flags anteriores
   (`v2_ativa`, `busca_v9`, `boot_v9`, `inspecoes_v9`, `prontuarios_v9`) sobrevivem.
2. **Unidade:** `null` ≠ `0` no mapeamento e no rótulo; `deveHidratarListaLegada`.
3. **Cruzamento semeadura × leitura:** varredura das chaves que a tela de calibrações lê contra
   `chavesDoEquipamento(tag)` + a segunda passada — o teste bloqueante, no molde do
   `palcoSemeadura.test.ts` da 9F.2.
4. **Gate de navegador 1k/10k/50k:** DOM, heap, requisições, **zero `JSON.parse` de
   `nr13_calibracoes_` na lista**, busca, virtualização, abrir equipamento, ordem
   `semear → ler`, e a tela de histórico com conteúdo REAL (lista, componentes, lotes,
   certificado abrindo).
5. **Paridade com a tela legada:** mesma organização, flag OFF × ON — mesmas TAGs, mesma
   contagem por TAG, mesmo proprietário.
6. Suíte completa, `tsc -b` limpo, build verde, árvore limpa.

---

## 10 · Estado ao fim desta análise

| | |
|---|---|
| `src/` | **intocado** |
| schema / SQL de produção | **intocado** — só `select` de leitura |
| flags | **intocadas**: `busca_v9` 0/30 · `inspecoes_v9` 0/30 · `prontuarios_v9` 0/30 · `boot_v9` 2/30 |
| organizações cliente | **nenhuma tocada** |
| implementação da 9F.3 | **NÃO iniciada** — depende de autorização |
