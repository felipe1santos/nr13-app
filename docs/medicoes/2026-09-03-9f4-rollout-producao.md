# 9F.4 · ROLLOUT CONTROLADO EM PRODUÇÃO — SQL APLICADO, FLAG NÃO LIGADA

**03/09/2026** · projeto `qqsesrntfvmdxqxrfvmw` (org Supabase **SAAS-NR13**, projeto
**SAAS NR13**), conta `perone.fs@gmail.com`. Organização de teste
`99f642d3-6efd-446d-9e76-d234ad8d211c` (`teste@gmail.com`).

Commit do gate: `a5d2778`. Commit aplicado: `9743f21` — os seis arquivos são idênticos
ao gate, exceto `busca_manutencao.sql`, que ganhou **só comentário** (+13 linhas, o bloco
da REGRA OFICIAL de `Último registro = MAX(data)`).

> **O QUE ESTE ARQUIVO REGISTRA:** os passos 1–9 e 15–16 do roteiro do §10 do
> `2026-09-02-9f4-implementacao-e-gate.md` foram executados. Os passos **10–14**
> (ligar `livro_v9`, validar a tela, rollback) **NÃO** foram — e a razão está no §5.
> `livro_v9` está **OFF nas 30 organizações**, que é onde o roteiro mandava terminar.

---

## 1 · Confirmação de identidade antes de qualquer escrita

| item | evidência |
|---|---|
| conta | `perone.fs@gmail.com` (menu da conta, na tela) |
| organização | **SAAS-NR13** (`tsmbvmesdeuaclsxyxnd`) |
| projeto | **SAAS NR13**, branch `main`, badge PRODUCTION |
| project ref | `qqsesrntfvmdxqxrfvmw`, na URL do dashboard |

O projeto exibia **`EXCEEDING USAGE LIMITS`** e o aviso *"Grace period is over — your
projects will not be able to serve requests when you use up your quota"*. Nada do rollout
esbarrou nisso: as consultas somam poucos KB.

## 2 · Preflight (somente leitura)

PostgreSQL 17.6 · 30 organizações em `org_sync` · 17 linhas em `equipamentos_index`.

- `org_sync.livro_v9` **não existia**;
- `equipamentos_index.livro_entradas` / `livro_ultima` **não existiam**;
- `equipamentos_index_livro_idx` **não existia**;
- flags: `v2_ativa` 30 · `boot_v9` 2 (`92a28bff…`, `99f642d3…`) · `busca_v9`,
  `inspecoes_v9`, `prontuarios_v9`, `calibracoes_v9` **0**;
- `busca_pendencias` **0**; `auditar_projecao` da org teste `convergiu: true`.

**Guarda de colunas antes do arquivo 2** — e ela pegou um falso positivo meu:
`data_ref` e `execucao_inspecao` moram em `relatorios_index`, `componente_id` e
`prox_calibracao` em `calibracoes_index`, não em `equipamentos_index`. Conferidas nas
tabelas certas, as quatro existem. Conferir a coluna na tabela errada acusa ausência que
não existe — e teria "justificado" não rodar o arquivo 2.

## 3 · Aplicação — os seis arquivos, na ordem, cada um conferido por SHA-256

Regra do §13 do `CLAUDE.md`: compara-se o **hash do texto que está no editor** com o do
arquivo do commit, ANTES de rodar. Os arquivos em disco estão em CRLF; o Monaco normaliza
para LF, então a referência é o hash do texto **LF-normalizado**.

| # | arquivo | bytes (LF) | SHA-256 conferido no editor | verificação depois |
|---|---|---|---|---|
| 1 | `busca_index.sql` | 17.191 | `857343f23651a7df6e7ec1763529507c90848e33e7b42b092d8fddcfd1e5848d` | `livro_entradas integer` e `livro_ultima date`, **nullable, sem default**; **0** não-nulas em 17 linhas; policies `equipamentos_index_select_org` e `relatorios_index_select_org` presentes; RLS ligada nas 3 tabelas; `anon`/`authenticated` só com SELECT |
| 2 | `busca_manutencao.sql` | 42.288 | `e233b12408ab9929b6b00aa0a4edcfd90459f51c7caedc6cb97369d58a9b2161` | `projetar_equipamento` (secdef, 17.579 B) lê `nr13_livro_`, exclui `_config_`, tem `v_liv_n`/`v_liv_ult`, grava as duas colunas no `insert` **e** no `on conflict`, e carrega o comentário da REGRA OFICIAL; `reconstruir_indice_busca` com o `NAO-OP EXPLICITO`; **0** funções de manutenção com `execute` para `anon`/`authenticated` |
| 3 | `busca_index_rpc.sql` | 19.327 | `79ca82ea0ce4fb86f2917e7462a4fbd9a7221ba2fb0ef93164423171734514ed` | `projetar_chave` despacha `nr13_livro_` (offset 12) com `nr13_livro_config_` excluído **antes**; `nr13_calibracao_item` aparece em **0** linhas de código (só comentário); `aplicar_mutacao_storage` chama `projetar_chave`, mantém pendência e guarda de assinatura e **não** consulta `v2_ativa` |
| 4 | `busca_consulta.sql` | 17.548 | `782f4b112653cf46bd81e777af1f25cd4c288720ccdd4b51e68412effa7048e7` | **uma única** `buscar_equipamentos` (sem sobrecarga órfã), **29 colunas** de saída, devolve e seleciona `livro_entradas`/`livro_ultima`, `security definer`, `execute` só p/ `authenticated` (`anon` revogado) |
| 5 | `busca_livro.sql` | 7.549 | `3dd2cb332354a9ea25666efece2354e646a865dd346e516e2e02ba8898016fe6` | `buscar_livros(p_termo,p_cursor,p_limite)` e `contar_livros(p_termo)`, secdef, só `authenticated`; **índice parcial criado** — `WHERE ((livro_entradas IS NULL) OR (livro_entradas > 0))`, idêntico ao predicado da consulta |
| 6 | `livro_v9_flag.sql` | 3.872 | `12af0bcbf30302065bbe13a463d9ffc0b722025b770ed5431656b71ad5c7f9a6` | `org_sync.livro_v9 boolean NOT NULL DEFAULT false`; `definir_livro_v9(uuid, boolean)` secdef, `execute` só `postgres`/`service_role` |

**Falso positivo registrado:** `f9_normalizar` e `f9_tsquery` aparecem com `EXECUTE` para
PUBLIC (`=X/postgres`), logo também para `anon`. É o default do Postgres para funções, é
anterior a este rollout, e as duas são normalizadores de texto sem acesso a dado.
`aplicar_mutacao_storage` continua com `anon=X` pelo grant explícito do
`armazenamento_v2.sql` — o mesmo falso positivo já registrado na 9F.3.

## 4 · Reprojeção TAG a TAG — só na organização de teste

Nenhum rebuild global. `projetar_equipamento(org, tag)`, uma TAG por vez, na ordem abaixo.

| momento | COMPRESSOR V8-15/200L | DASDSA | ZZ-FASE3 | ZZ-TESTE-P2 |
|---|---|---|---|---|
| antes | `null` | `null` | `null` | `null` |
| depois de projetar só a 1ª | **1** · 2026-08-19 | `null` | `null` | `null` |
| depois de projetar a 2ª | 1 | **0** · `null` | `null` | `null` |
| depois das duas últimas | 1 | 0 | **2** · 2026-08-21 | **0** · `null` |

**Os três estados coexistiram em produção**, na mesma organização: `null` (não
reprojetada), `0` (reprojetada, sem livro) e `N` (com livro). Reprojetar uma TAG não tocou
nenhuma outra — as demais mantiveram o `projected_at` de 02/09.

### Verdade × projeção, entrada a entrada

| TAG | `nr13_livro_<TAG>` em `app_storage` | projeção | bate |
|---|---|---|---|
| COMPRESSOR V8-15/200L | 1 entrada, data `19/08/2026` | 1 · 2026-08-19 | **sim** |
| ZZ-FASE3 | 2 entradas, `21/08` e `21/08` | 2 · 2026-08-21 | **sim** |

### Dois livros ÓRFÃOS, e por que não foram projetados

A organização tem `nr13_livro_EQUIPE TESTE` (2 entradas) e `nr13_livro_VASO A23` (10
entradas) **sem `nr13_info_` correspondente**. Sem `nr13_info_` não há linha em
`equipamentos_index`, e `projetar_equipamento` para uma TAG assim é caminho de **remoção**
de linha, não de contagem. Nenhuma das duas foi projetada — `EQUIPE TESTE` por proibição
explícita, `VASO A23` por essa razão. `auditar_projecao` converge porque compara a projeção
com `nr13_info_`, e é o comportamento certo.

`VASO A23` é, de quebra, o caso real que a REGRA OFICIAL descreve: suas 10 datas estão
fora de ordem cronológica (`24/06`, `02/07`, … `20/07`, `12/08`) e ainda misturam formato
(`24/06/2026` e `2026-07-13`), os dois lidos por `f9_data`.

### Auditoria ao fim

`auditar_projecao('99f642d3-…')` → `convergiu: true`, `pendencias: 0`,
equipamentos 4/4 (0 faltando, 0 sobrando, 0 defasadas), relatórios 5/5 (idem).
`busca_pendencias` **0** no banco inteiro.

## 5 · POR QUE A FLAG NÃO FOI LIGADA — o front da 9F.4 não está publicado

O bundle de `https://app.nr13sistema.com.br` foi baixado e contado:

| marcador | ocorrências em `assets/index-qZO32iqH.js` (3,2 MB) |
|---|---|
| `busca_v9` · `boot_v9` · `inspecoes_v9` · `prontuarios_v9` · `calibracoes_v9` | 1 cada |
| **`livro_v9`** · **`buscar_livros`** · **`contar_livros`** · **`livro_entradas`** · **`livro_ultima`** | **0** |

O código da 9F.4 está no `main` (`a5d2778`), mas o deploy do front é manual (Coolify) e
não foi feito. Ligar `livro_v9` contra este bundle **não mudaria nada na tela** — e um
"OK, a tela continuou igual" seria um resultado sem significado, que é o pior tipo de
evidência. Os passos 10–14 ficam **não executados**, e a flag fica OFF.

> **Isto NÃO é a repetição do bug do `cmam`** (§2-ter do `CLAUDE.md`, bundle v1 contra
> servidor v2). Lá o servidor passou a RECUSAR o que o bundle antigo fazia. Aqui o schema
> só ACRESCENTA: duas colunas nulas, duas funções novas e uma flag desligada. O bundle
> publicado não chama nenhuma delas, e `buscar_equipamentos` — que ele chama — ganhou duas
> colunas no fim do retorno, que ele ignora.

### O que foi provado no lugar, direto no banco

Sob a identidade da organização de teste (`set local role authenticated` +
`request.jwt.claims` com o `sub` do mestre), numa transação somente leitura:

| prova | resultado |
|---|---|
| `org_atual()` / `papel_atual()` | `99f642d3-…` / `mestre` |
| `buscar_livros('')` | 2 linhas — `COMPRESSOR V8-15/200L` (1 · 2026-08-19) e `ZZ-FASE3` (2 · 2026-08-21). As duas TAGs com `0` ficaram **fora**, pelo predicado do índice |
| `contar_livros('')` | `{ total: 2, exato: true }` |
| busca por TAG `ZZ-FASE3` | 1 linha, exata |
| termo inexistente | 0 linhas |
| keyset com `p_cursor = 'COMPRESSOR V8-15/200L'` | 1 linha (`ZZ-FASE3`), sem repetir a anterior |
| `execute` como `authenticated` | funcionou — o grant do arquivo 5 está certo |

**O índice parcial existe com o predicado certo, mas NÃO foi provado em uso em produção:**
com 17 linhas na tabela o planner escolhe `Seq Scan` (3 buffers, 0,142 ms), como deve. A
prova de que o índice muda o custo é a do laboratório (§3 do registro da 9F.4: 125.623
buffers sem ele contra 22 com ele, em 1.002 equipamentos). Produção é pequena demais para
exercitá-lo, e por regra (§12 do `CLAUDE.md`) não vai receber massa.

## 6 · Estado final

| | |
|---|---|
| `livro_v9` | **OFF nas 30 organizações** (nunca foi ligada) |
| `busca_v9` · `inspecoes_v9` · `prontuarios_v9` · `calibracoes_v9` | 0 |
| `boot_v9` | **as mesmas 2** organizações de antes |
| `v2_ativa` | 30 |
| `busca_pendencias` | 0 |
| `livro_entradas` não-nula | 4 linhas, **todas** da org de teste; **0** fora dela |
| `cmam.caldeiras` | `CMP001` com `livro_entradas = null`, `projected_at` de 28/08 — **intocada** |
| clientes | nenhum tocado; nenhum livro, lacre ou PDF histórico alterado |

Suíte local depois de tudo: **vitest 1608/1608** · **`massa.test.mjs` 35/35** · `npm run
build` verde.

## 7 · O que ficou provado ONDE

**PROVADO EM PRODUÇÃO:** os seis arquivos aplicados, cada um conferido por hash antes e
por estrutura/`prosrc`/ACL depois; `null`, `0` e `N` coexistindo na mesma organização;
reprojeção TAG a TAG sem tocar as vizinhas; contagem e `MAX(data)` batendo com a verdade
em `app_storage`; `buscar_livros`/`contar_livros` respondendo sob a identidade real da
organização, com busca, keyset e o filtro "tem livro"; nenhuma outra organização afetada.

**NÃO PROVADO (e não presumido):** a tela `/livro-registro` com a flag ligada — lista,
busca, abertura do livro, timeline, termo, lacre, ocorrência manual, PDF e rollback
visual. Depende do deploy do front. E o índice parcial em uso, que precisa de escala.

## 8 · Duas armadilhas de ferramenta, registradas para não custarem duas vezes

1. **Aba oculta do Chrome mata o SQL Editor.** Com `document.visibilityState === 'hidden'`
   o Monaco não repinta, o `ctrl+v` cola o conteúdo ANTERIOR do clipboard (a área de
   transferência do renderer fica congelada) e o **Run não dispara requisição nenhuma** —
   sem erro, sem modal, sem log. Perdi três abas e vários ciclos até medir
   `visibilityState`. **Antes de qualquer passo no SQL Editor, conferir que a aba está
   `visible`.** Criar uma aba nova rouba o foco da anterior e quebra a que estava
   funcionando.
2. **Transporte do SQL por clipboard, não por transcrição.** `Set-Clipboard` no PowerShell
   + `ctrl+v` + hash no editor põe o arquivo lá com **zero** bytes passando por
   transcrição. A alternativa (base64+gzip em blocos, com hash por bloco) funciona e serviu
   de reserva — e a primeira tentativa dela **corrompeu um caractere em 1.808**, exatamente
   o defeito que o §13 do `CLAUDE.md` descreve. O gate de hash pegou nas duas vezes.
   Também: o editor abre o modal *"Potential issue detected"* para qualquer arquivo com
   `drop`/`delete`/`truncate` **fora de comentário** — é preciso confirmar em "Run query",
   e não confirmar é indistinguível de "o Run não funcionou".

## 9 · O que falta, em ordem

1. **Decisão do dono:** publicar o front da 9F.4 no Coolify.
2. Com o bundle no ar, repetir os passos 10–14: baseline com a flag OFF → `livro_v9` ON
   **só** em `teste@gmail.com` → lista, busca e abertura do Livro → `Último registro` =
   `MAX(data)` na tela → timeline, termo, lacre, ocorrência manual e PDF existente →
   rollback para OFF → conferir que as seis flags anteriores seguem intactas.
3. O par `COMPRESSOR V8-15/200L` (1 entrada) e `ZZ-FASE3` (2 entradas) é o material de
   validação: são os únicos dois livros da organização com equipamento no catálogo.
