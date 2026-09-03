# 9F.4 · ROLLOUT CONTROLADO EM PRODUÇÃO — COMPLETO, E DE VOLTA PARA OFF

**03/09/2026** · projeto `qqsesrntfvmdxqxrfvmw` (org Supabase **SAAS-NR13**, projeto
**SAAS NR13**), conta `perone.fs@gmail.com`. Organização de teste
`99f642d3-6efd-446d-9e76-d234ad8d211c` (`teste@gmail.com`).

Commit do gate: `a5d2778`. Commit aplicado: `9743f21` — os seis arquivos são idênticos
ao gate, exceto `busca_manutencao.sql`, que ganhou **só comentário** (+13 linhas, o bloco
da REGRA OFICIAL de `Último registro = MAX(data)`).

> **O QUE ESTE ARQUIVO REGISTRA:** o roteiro do §10 do
> `2026-09-02-9f4-implementacao-e-gate.md` foi executado **inteiro**, em duas etapas do
> mesmo dia: primeiro os seis SQL e a reprojeção (§§1–4), depois o deploy do front, a flag
> ligada só na organização de teste, a validação na tela e o rollback (§§5–8).
>
> **`livro_v9` terminou OFF nas 30 organizações**, que é onde o roteiro mandava parar.
> Nenhum cliente teve a tela alterada, `cmam.caldeiras` e `EQUIPE TESTE` seguem intocadas, e
> **nada foi escrito em `app_storage`** durante todo o rollout.
>
> Duas coisas ficaram **declaradas como não provadas**, e não valem por inferência: a
> divergência de `Último registro = MAX(data)` (§8.1) e a escala (§10).

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


## 5 · Deploy do front — publicado pelo Coolify

O bundle anterior (`assets/index-qZO32iqH.js`) tinha **0** ocorrências de `livro_v9`,
`buscar_livros`, `contar_livros`, `livro_entradas` e `livro_ultima` — o front da 9F.4 estava
no `main` e não no ar. O dono autorizou o Claude a publicar sozinho, em caráter permanente.

Redeploy disparado no Coolify (aplicação *NOVO - APP - NR13*), importando
`felipe1santos/nr13-app:main` no commit **`dd80bb0c4da8a7e2afbd0fb571870fcea420b9e1`** —
exatamente o que havia sido pushado.

**Conferido pelo BUNDLE, não pelo clique** (`assets/index-B0NvLXJL.js`, 3.188.343 B):

| marcador | antes | depois |
|---|---|---|
| `livro_v9` · `buscar_livros` · `contar_livros` | 0 | **1** cada |
| `livro_entradas` · `livro_ultima` | 0 | **2** cada |
| `nr13_livro_v9` | 0 | **1** |
| `busca_v9` · `boot_v9` · `inspecoes_v9` · `prontuarios_v9` · `calibracoes_v9` | 1 | 1 (intactas) |

## 6 · Baseline com a flag OFF

`/livro-registro` no bundle novo, `livro_v9` ainda OFF:

```
2 LIVROS GERADOS
ZZ-FASE3               Vaso de Pressão  CAT. III  2 registros  21/08/2026
COMPRESSOR V8-15/200L  Vaso de Pressão  —         1 registro   19/08/2026
```

Sem campo de busca e sem paginação — o caminho legado, hidratando a organização.

## 7 · Flag ON só em `teste@gmail.com` — o que foi medido

`definir_livro_v9('99f642d3-…', true)` → `livro_v9` ON em **1** organização de 30. Nenhuma
outra flag tocada. O app resincronizou no boot (`nr13_livro_v9 = "1"`).

### 7.1 · A prova central: o `lerTudo()` sumiu

| ação | requisições | detalhe |
|---|---|---|
| abrir `/livro-registro` | **2** | `rpc/buscar_livros` + `rpc/contar_livros`. **`app_storage`: 0** |
| busca `ZZ` | 2 | 1 resultado, exato. `app_storage`: 0 |
| busca `COMPRESSOR` | 2 | 1 resultado. `app_storage`: 0 |
| busca `NAOEXISTE-XPTO` | 2 | "Nenhum resultado". `app_storage`: 0 |
| limpar a busca | 2 | volta a "2 resultados". `app_storage`: 0 |

`transferSize` volta `0` por falta de `Timing-Allow-Origin` no CORS do Supabase; o que vale
aqui é a **contagem e o destino** de cada requisição.

### 7.2 · Abertura sob demanda — 2 requisições, ambas POR TAG

Ao clicar "Abrir livro", exatamente **2** chamadas a `app_storage`, e nenhuma outra:

1. a **semeadura da TAG** — 36 famílias de chave de `chavesDoEquipamento(tag)`
   (`nr13_info_`, `nr13_livro_`, `nr13_livro_config_`, `nr13_termo_livro_`, `nr13_cat_`,
   `nr13_calc_`, `nr13_emp_`, `nr13_laudo_`, `nr13_assinantes_rel_`, …), **daquela TAG só**;
2. os `nr13_rel_` **daquela TAG**, que alimentam os links "Ver / Imprimir".

> **O gate local mediu 1 requisição, produção mede 2.** Não é regressão: a massa do
> laboratório (`ZZ-LIV`) não tinha relatório salvo, então a segunda chamada não existia lá.
> As duas são por-TAG e limitadas — nenhuma varre a organização.

### 7.3 · O livro montado, com lacre REAL

Diferente do laboratório (onde a massa nascia sem `sha256` e o selo dizia "Sem lacre"), aqui
as entradas são reais e lacradas:

| | ZZ-FASE3 | COMPRESSOR V8-15/200L |
|---|---|---|
| cabeçalho | `ZZ-FASE3 — Vaso de Pressão`, CAT. III | `COMPRESSOR V8-15/200L — Vaso de Pressão` |
| contagem | 2 REGISTRO(S) | 1 REGISTRO(S) |
| cadeia | **"Cadeia de registros íntegra"** | idem |
| registros | nº 000001 `F54425F4` · nº 000002 `4F5D1FFE`, ambos **Íntegro** | nº 000001 `FA750775`, **Íntegro** |
| datas | 21/08/2026 ×2 | 19/08/2026 |
| relatórios | REL-1787282142486 · REL-1787282922043 | REL-1787152599432 |
| termo, ocorrência, PDF | presentes | presentes |

"Ver livro completo" montou os três iframes (`CAPA-LIVRO-REGISTRO`, `TERMO-ABERTURA`,
`LIVRO-REGISTRO`) com **0 requisições novas** — o palco já tinha tudo — e com **dado real**:
TAG, classe/grupo/categoria, `MDK ENG`, CNPJ, "este livro contém 50 folhas". **Zero "-"**,
que é o sintoma de família de chave faltando no palco (§2-ter do `CLAUDE.md`).

"Ver / Imprimir" montou a folha individual do registro **sem `window.print()`, sem
`window.open` e sem requisição**. Nenhum PDF histórico foi regenerado.

### 7.4 · Nada foi escrito

`app_storage` da organização: **0 escritas** na janela de 2 horas que cobre todo o rollout.
Os quatro livros permaneceram com versão e bytes idênticos aos do levantamento inicial —
`COMPRESSOR` 518 B/v1, `EQUIPE TESTE` 1.182 B/v2, `VASO A23` 22.091 B/v1, `ZZ-FASE3`
1.225 B/v2. **`EQUIPE TESTE` intocada.**

## 8 · Rollback e paridade — provada por SHA-256

`definir_livro_v9('99f642d3-…', false)` → `livro_v9` **0 ON**. O app resincronizou
(`nr13_livro_v9` sumiu do `localStorage`), a lista voltou a "2 LIVROS GERADOS", sem busca,
na ordem legada — **idêntica ao baseline do §6**.

**O livro aberto é byte a byte o mesmo nos dois caminhos:**

| livro | bytes | SHA-256 com a flag ON | com a flag OFF |
|---|---|---|---|
| ZZ-FASE3 | 914 | `8abd064376b0a3bb14bd9e9c74ff19dd277d5164cb1d6e58dc5a1afd894bd0e7` | **igual** |
| COMPRESSOR V8-15/200L | 708 | `5f6a9aa07e37e0021c762008c22ec5df50e4f2287b8da2cc0f4c7c5f37627c24` | **igual** |

Diferenças ficaram **só na lista**, e todas esperadas: o rótulo (`2 resultados` × `2 LIVROS
GERADOS`), a ordem (o novo pagina por TAG crescente, o legado não) e a existência do campo de
busca.

### 8.1 · `Último registro = MAX(data)` — verificado, mas a divergência NÃO foi exercitada

Os valores na tela (`21/08/2026` e `19/08/2026`) batem com o `max` das datas da verdade em
`app_storage`, e a cadeia UI → `buscar_livros` → coluna `livro_ultima` → `max` está provada.

**Mas os dois livros da organização têm todas as entradas na mesma data**, então `MAX(data)`
e "último elemento do array" coincidem — o caso que a regra corrige não aparece. Exercitá-lo
exigiria acrescentar uma ocorrência manual com data anterior, e entrada de livro é imutável.
**O dono decidiu não acrescentar.** A divergência segue provada **só no laboratório**
(15/05 × 03/08 no gate). `VASO A23`, que tem 10 entradas fora de ordem (`24/06` … `12/08`) e
ainda mistura formato de data, é livro órfão e não aparece em nenhum dos dois caminhos.

## 9 · Estado final

| | |
|---|---|
| `livro_v9` | **OFF nas 30 organizações** |
| `busca_v9` · `inspecoes_v9` · `prontuarios_v9` · `calibracoes_v9` | 0 |
| `boot_v9` | **as mesmas 2** organizações de antes (`92a28bff…`, `99f642d3…`) |
| `v2_ativa` | 30 |
| `busca_pendencias` | 0 |
| `auditar_projecao` (org teste) | `convergiu: true`, equipamentos 4/4, relatórios 5/5 |
| `livro_entradas` não-nula | 4 linhas, **todas** da org de teste; **0** fora dela |
| `cmam.caldeiras` | `CMP001` com `livro_entradas = null`, `projected_at` de 28/08 — **intocada** |
| escritas em `app_storage` | **0** em toda a janela do rollout |
| front publicado | `assets/index-B0NvLXJL.js`, commit `dd80bb0` |

Suíte local: **vitest 1608/1608** · **`massa.test.mjs` 35/35** · `npm run build` verde.

## 10 · O que ficou provado ONDE

**PROVADO EM PRODUÇÃO:** os seis arquivos aplicados, conferidos por hash antes e por
estrutura/`prosrc`/ACL depois; `null`, `0` e `N` coexistindo na mesma organização; reprojeção
TAG a TAG sem tocar as vizinhas; contagem e `MAX(data)` batendo com a verdade; deploy do front
conferido pelo bundle; **zero `app_storage` ao abrir a lista e ao buscar**; abertura sob
demanda limitada à TAG; livro, termo, capa, timeline, cadeia e lacre reais e íntegros;
paridade do documento **byte a byte** entre ON e OFF; rollback sem perda; **zero escritas**;
nenhuma outra organização afetada.

**NÃO PROVADO, e declarado:** a divergência de `MAX(data)` (§8.1); escala — a organização tem
4 equipamentos, e keyset, paginação e o índice parcial em uso seguem provados só em
laboratório (com 17 linhas o planner escolhe `Seq Scan`, como deve); cache frio e offline sob
a flag; `Exportar PDF` do livro, não acionado de propósito.

## 11 · Três armadilhas de ferramenta, registradas para não custarem duas vezes

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

3. **Aba oculta também mata o `ctrl+Return` — mas NÃO o `.click()`.** A saída, achada depois
   de horas: `element.click()` no botão **Run** dispara a consulta mesmo com a aba em
   `visibilityState: hidden`; o `ctrl+Return` sintético não chega. E aba oculta tem timer
   estrangulado, então a espera pela resposta precisa ser longa (até 30 s) e em laço, não um
   `setTimeout` curto. Com isso o rollout inteiro roda sem exigir que o dono deixe a aba em
   primeiro plano — que era o que vinha travando a sessão.

## 12 · O que falta

1. **Decisão do dono:** ligar `livro_v9` para a primeira organização de cliente, ou fechar a
   9F.4 com o rollout na organização de teste.
2. As limitações do §10 continuam **registradas** — não valem por inferência.
