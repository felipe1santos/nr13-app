# PONTO DE RETOMADA — 31/08/2026 (P9.4 FECHADO · 9F.2 CONCLUÍDA · só a ANÁLISE da 9F.3 autorizada)

> **Leia só este arquivo para voltar ao trabalho.** Ele diz onde paramos, o que está de pé em
> produção, e qual é a próxima decisão. Nada aqui depende de lembrar da conversa.

---

## 1 · Onde paramos, em uma linha

**A 9D está CONCLUÍDA (P9.3 fechado em 25/08). Em 28/08 os três defeitos da 9E foram
consertados, o SQL foi aplicado, o front publicado e o rollout de 14 passos REPETIDO na
organização de teste — inclusive o passo 11, que era o bloqueio: o PDF arquivado ABRE, com o
SHA-256 da tela igual ao do banco.** Rollback feito no mesmo dia: `busca_v9` OFF nas 30.
**O dono FECHOU a 9E em 28/08**, com duas limitações declaradas (§4.0) que não valem por
inferência: cache frio sob `boot_v9` e paginação/keyset. **A 9F não está autorizada.**
Evidências em
`medicoes/2026-08-28-9e-rollout-producao.md`; as correções em
`medicoes/2026-08-28-9e-destravamento.md`.

**EM 31/08 O DONO FECHOU O P9.4 e deu a 9F.2 por CONCLUÍDA.** Três limitações ficam
REGISTRADAS e **não** valem por inferência: (1) escala em produção não exercitada; (2) o estado
`null` do badge não exercitado em produção; (3) cache frio/offline sob `prontuarios_v9` não
exercitado. Em seguida ele autorizou **APENAS a ANÁLISE da 9F.3 (`/calibracoes`)** — AS-IS, sem
implementar: sem tocar em `src`, em schema, em SQL de produção, em flags nem em clientes. A
análise está em `medicoes/2026-08-31-9f3-calibracoes-as-is.md`. **A implementação da 9F.3 não
está autorizada.**

> ## 🔴 PRODUÇÃO FORA DO AR (31/08/2026) — LEIA ANTES DE QUALQUER COISA
>
> **O Supabase está recusando TODAS as requisições do NR-13 com HTTP 402.** Login, leitura do
> `app_storage`, RPC, Storage/PDF e Edge Functions: **todos em 402**. O site abre (o front é
> estático, servido pelo Coolify), o login falha. O banco está vivo e ocioso (CPU 2%).
>
> **Causa: cota de `Cached Egress` da ORGANIZAÇÃO em 8,32 GB de 5 GB (166%).** A organização
> `meu SaaS delivery` tem DOIS projetos e uma cota só: **`menuzia` consumiu 8,262 GB (99,35%)**
> e o `SAAS NR13` consumiu **0,054 GB (0,65%)**. **O NR-13 é vítima, não causa.**
>
> **É cobrança, não código — nada da Fase 9 conserta isso.** Só há duas saídas: subir para o
> plano **Pro** (~US$ 25/mês, levanta a restrição na hora) ou **esperar 20 de setembro de
> 2026**, quando o ciclo de faturamento reinicia. Pausar o `menuzia` NÃO destrava: o consumo
> deste ciclo já aconteceu.
>
> **Enquanto durar: nenhum rollout da Fase 9 pode ser validado** — o roteiro precisa da tela, e
> a tela não autentica. Trabalho local (código, testes, build) segue normal.
>
> Diagnóstico completo, com os testes de endpoint e a evidência por projeto:
> `medicoes/2026-08-31-supabase-cota-estourada.md`.
>
> **Atenção específica:** o `kiwify_webhook` é Edge Function e está em 402 — **pagamento
> aprovado não chega ao banco** enquanto isso durar; reconciliar depois.

**Em 29/08 o dono autorizou o rollout da 9F.1** e ele foi FEITO: os 5 arquivos de SQL
aplicados, a org de teste reprojetada, o front publicado (`98e04cb`), o roteiro rodado com
`inspecoes_v9` ligada **só** em `99f642d3-…-8d211c` e **rollback no mesmo dia** — a flag está
desligada nas 30. Registro: `medicoes/2026-08-29-9f1-rollout-producao.md`. O preflight achou
uma divergência de REGISTRO (dois dos cinco arquivos já estavam aplicados sem estar escrito
em lugar nenhum); o trabalho parou, foi reportado, e a decisão do dono foi reaplicar os cinco.
**A 9F.2 NÃO foi iniciada.**

---

## 2 · O que está de pé em PRODUÇÃO agora

| | estado |
|---|---|
| Funções auxiliares da RLS | **`STABLE`** (ETAPA 1, 23/08) |
| Infraestrutura 9A/9B/9C | instalada; projeção convergida em **duas** organizações |
| SQL da 9D (4 arquivos) | **APLICADO** (25/08) — ver `docs/medicoes/2026-08-25-9d-sql-aplicado-producao.md` |
| Projeção das 2 orgs | refeita com as funções da 9D; `convergiu: true`, `pendencias: 0` |
| **Flag `boot_v9`** | **`true` em DUAS**: `99f642d3-…-8d211c` (teste) e `92a28bff-…-488a75` (PILOTO cliente, 25/08); `false` nas outras 28 |
| **Flag `busca_v9`** | **desligada nas 30** — ligada no piloto e revertida em 25/08 (`medicoes/2026-08-25-9e-rollout-producao.md`) |
| Front | commit **`a944845`** publicado no Coolify em 28/08 (deploy Success, 01m54s). O bundle manteve o nome `index-Ccsir5D0.js` — **conferir por string literal, não pelo nome** |
| SQL da 9E (`busca_relatorios.sql`) | **APLICADO em 28/08** — `p_escopo`, `equipamento_ativo`, `historicos`; 1 sobrecarga de cada, `anon` false / `authenticated` true, 6 índices |
| SQL da projeção (`busca_manutencao.sql`) | **APLICADO em 28/08** — `pdfRef ->> 'path'` conferido no `prosrc` |
| Projeções | `relatorios_index` **22** · `equipamentos_index` **17** · `calibracoes_index` **18** · pendências **0**. Reprojetada: linhas com `sha256` e sem `pdf_ref` **11 → 0** |
| `app_storage` | inalterada |
| Suíte | **1446/1446** · `tsc -b` limpo · build verde (29/08) |
| SQL da 9F.1 (5 arquivos) | **APLICADO em 29/08**: `busca_index` · `busca_manutencao` · `busca_index_rpc` · `busca_consulta` · `inspecoes_v9_flag`. Verificado por marcador no banco — `medicoes/2026-08-29-9f1-rollout-producao.md` |
| **Flag `inspecoes_v9`** | existe e está **desligada nas 30**. Ligada só na org de TESTE em 29/08, roteiro rodado, e **revertida no mesmo dia** |
| Bundle publicado | **`index-DkxtOk2G.js`** (commit `98e04cb`), contém a string `inspecoes_v9` — conferido por `curl`, fora do navegador |
| Projeção da org de teste | reprojetada com a contagem de inspeções: `convergiu: true`, pendências 0, paridade 4/4 (1 / null / null / null) |
| SQL da 9F.2 (5 arquivos) | **APLICADO em 29/08** — mesma ordem da 9F.1, agora com `tem_prontuario` e `prontuarios_v9_flag`. Verificado por marcador: `projetar_chave` despacha `nr13_prontuario_`, a RPC devolve a coluna, grants anon=false/auth=true |
| **Flag `prontuarios_v9`** | existe e está **desligada nas 30**. Ligada só na org de TESTE em 29/08, roteiro rodado, e **revertida no mesmo dia** |
| Bundle publicado | **`index-DUDKIbuX.js`** (commit `6342041`), contém `prontuarios_v9` — conferido por `curl` |
| Projeção da org de teste | reprojetada com o badge de prontuário: paridade **4/4** (true / false / false / false) e a `inspecoes` da 9F.1 **preservada** |
| **9F.2 (`/prontuarios`)** | **ROLLADA na org de teste e REVERTIDA** (29/08). As 6 folhas do prontuário: texto **idêntico byte a byte** entre V9 e legado. Registros: `medicoes/2026-08-29-9f2-prontuarios.md` (construção) e `medicoes/2026-08-29-9f2-rollout-producao.md` (rollout) |

---

## 3 · O que aconteceu em 25/08

1. **`revoke` de `public` antes de `anon`** (commit `aa984c9`): `anon` herda de `public`, e
   revogar só de `anon` deixava `has_function_privilege('anon', …) = true`. Medido no banco.
2. **`origin/main` estava 3 commits atrás** — a 9D nunca tinha sido pushada. Sem isso o Coolify
   não teria o que publicar.
3. **`busca_manutencao.sql` não tinha sido reaplicado**: `projetar_equipamento` em produção era a
   versão da 9C, sem `vida_base` e sem chamar `projetar_calibracoes`. Resultado: `vida_base` nula
   e `calibracoes_index` vazia **com a auditoria dizendo `convergiu: true`** — ela mede a projeção
   contra o que a FUNÇÃO ATUAL produz, não contra o que a 9D passou a exigir.
4. Roteiro de tela com a flag ligada: Dashboard, `/vencimentos`, `/equipamentos`, ficha,
   histórico, relatório arquivado, `/livro-registro` e **rollback** — todos conferidos.
5. **Prova offline real**, com o DevTools: achou DOIS defeitos, ambos corrigidos com teste e
   reprovados em produção — o painel inventava `0` quando o agregado falhava, e a UI decidia
   conectividade por `navigator.onLine`, que ficou `true` a sessão inteira com a rede morta.
   Detalhes em `medicoes/2026-08-25-9d-prova-offline-e-dois-defeitos.md`.
6. **9E construída, medida e REPROVADA no rollout.** Gate de banco (1k→50k) e gate de navegador
   passaram: com 50.000 relatórios no banco, a tela mantém **16 linhas** no DOM e **zero** PDF.
   Em produção, o passo 11 achou o bloqueio: `aoAbrir` navega para `/relatorios?tag=…&rel=…`,
   mas com a flag LIGADA essa rota **sempre** renderiza a V9, que ignora `tag` e `rel` — o clique
   não leva a lugar nenhum. Rollback feito e conferido no mesmo dia.

### 3-bis · O que aconteceu em 28/08

7. **Os três defeitos da 9E, consertados com teste, e o rollout REPETIDO em produção** (§4.0/§4.1;
   `medicoes/2026-08-28-9e-destravamento.md`). O segundo é o que importa lembrar: a projeção lia
   `pdfRef ->> 'caminho'` e o campo se chama `path` — chave inexistente devolve `NULL` sem erro,
   e a busca inteira ficava sem referência de arquivo. Em produção, a reprojeção levou as linhas
   com `sha256` e sem `pdf_ref` de **11 para 0**. O passo 11 passou: o PDF abre, com o SHA-256 da
   tela igual ao do banco. Rollback conferido no mesmo dia.

> **QUATRO ARMADILHAS que já custaram tempo, e voltarão. Leia antes de auditar qualquer coisa.**
>
> 1. **O service worker serve o bundle ANTIGO depois do deploy** (`nr13-cache-v8`, cache-first em
>    `/assets/`). Medido duas vezes. Conferir SEMPRE por fora do navegador:
>    `curl -s https://app.nr13sistema.com.br/ | grep -o 'assets/[A-Za-z0-9._-]*.js'`.
> 2. **`auditar_projecao` converge com função de projeção VELHA no banco.** Ela compara a projeção
>    com o que a FUNÇÃO ATUAL produz, não com o que a etapa nova exige. Depois de reaplicar SQL de
>    projeção, conferir o `prosrc`:
>    `select proname, (prosrc like '%vida_base%'), length(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'projetar_%';`
> 3. **Em SQL, `_` é CORINGA.** `like 'nr13_rel_%'` casa também `nr13_relatorio_meta_atual` — o que
>    fez uma auditoria acusar 4 relatórios contra 3 na projeção e PARECER perda de dado. Use
>    `left(chave, 9) = 'nr13_rel_'` ou `like ... escape`. O código usa `startsWith` e está correto.
> 4. **`navigator.onLine === true` não significa nada.** Só o `false` é confiável. Ficou `true` uma
>    sessão inteira com 50 requisições falhando. Conectividade se decide pelo ERRO REAL da última
>    tentativa (`conectividade.ts`), nunca por essa propriedade sozinha.

---

## 4 · O QUE FALTA — comece por aqui

### 4.0 · 🚪 9E FECHADA ✅ pelo dono em 28/08/2026

**O portão está fechado. A 9F NÃO está autorizada e não começa sozinha.**

> **DUAS LIMITAÇÕES DECLARADAS, e elas NÃO contam como aprovadas.** O dono fechou a 9E
> com elas explícitas, e nenhuma vale por inferência:
>
> 1. **Cache frio sob `boot_v9`** — o caminho em que o aparelho não tem o índice daquela TAG
>    e a tela antiga deve parar no HISTÓRICO da TAG certa (e nunca jogar o usuário na lista de
>    equipamentos) **NÃO foi exercitado** no rollout da organização de teste. Está coberto por
>    código e por comentário, não por medição em produção.
> 2. **Paginação / keyset** — validada em **laboratório com 50.000 relatórios**
>    (`medicoes/2026-08-25-9e-relatorios-escala.md`), **não** exercitada na organização de
>    teste, que tem 12 relatórios contra uma página de 50. **Não é teste de rollout dessa
>    organização.**

**O que o dono aceitou como provado:** SQL aplicado · projeção corrigida · `pdf_ref`/`path`
validado · busca em produção · RLS · índices · busca V9 · ativos e históricos de equipamentos
excluídos · abertura real do PDF · SHA-256 · zero PDF durante a busca · rollback · 1410/1410 ·
build verde · árvore limpa · **nenhuma conta pagante habilitada**.

> **NÃO HABILITAR `busca_v9` EM CLIENTE.** A flag está OFF nas 30 e continua assim até
> autorização nova e separada.

Evidência do rollout: `medicoes/2026-08-28-9e-rollout-producao.md`. O resumo:

| | |
|---|---|
| Passo 11 (o bloqueio) | **PASSOU** — dois relatórios abertos, 13 e 18 páginas, SHA-256 da tela **igual** ao do banco |
| Zero PDF na busca | **confirmado** — 36 requisições, nenhuma de `storage` |
| Paridade | `ativos` = **3**, o mesmo da tela legada |
| Excluídos | 12, com aviso e selo; abrem normalmente |
| Legado sem arquivo | abre pela rota `legado=1` |
| Rollback | conferido: `busca_v9` 0/30, `boot_v9` 2, projeções 22/17/18, 6 índices, tela antiga com os mesmos 3 |
| Não exercitado — **declarado, não aprovado** | cache frio sob `boot_v9` · paginação/keyset (12 itens × página de 50; medida em laboratório com 50.000) |

### 4.1 · O rollout de 28/08 — o que foi feito, na ordem

**Código verificado localmente (1410/1410, build verde) e APLICADO em produção.** Os três
defeitos e o desenho de cada correção estão em
`medicoes/2026-08-28-9e-destravamento.md`; o resumo é:

1. **Navegação** — a V9 abre o documento ela mesma (`pdfRef` → `VisualizadorPdf`), em vez de
   navegar para uma rota que a flag impede de renderizar a tela antiga.
2. **`pdfRef ->> 'caminho'` × `path`** — o campo da `RefFoto` se chama `path`. A projeção lia a
   chave errada e devolvia `NULL` **sem erro**: `pdf_ref` nulo nas 15 linhas, inclusive nas 4 com
   artefato e `sha256`. É este o defeito que deixava a tela sem documento nenhum.
3. **Relatório de equipamento excluído** — escopo `ativos` por padrão (o conjunto de sempre),
   aviso com o número dos que ficaram de fora, selo na linha e escopos `historicos`/`todos` na
   URL. Com `equipamentos_index` vazia ninguém é marcado como órfão — a guarda que impede a tela
   de afirmar "não há relatórios" para quem tem o parque inteiro.

**A ORDEM IMPORTOU, e o primeiro passo era o que não podia ser pulado. Tudo abaixo foi FEITO em 28/08:**

| # | Ação | Como conferir |
|---|---|---|
| 1 ✅ | Reaplicar **`supabase/busca_manutencao.sql`** | `prosrc` de `projetar_relatorios` contém `->> 'path'` — conferido (a auditoria NÃO acusa isto — armadilha nº 2) |
| 2 ✅ | Reprojetar (só relatórios, só nas orgs já projetadas) | linhas com `sha256` e sem `pdf_ref`: **11 → 0** |
| 3 ✅ | Reaplicar **`supabase/busca_relatorios.sql`** | a guarda deixou passar; 1 sobrecarga de cada, RLS anon=false/auth=true, 6 índices |
| 4 ✅ | Publicar o front e conferir o bundle | deploy `a944845` Success; **o nome do bundle não mudou** — a prova foi a string literal `/relatorios?legado=1&tag=` |
| 5 ✅ | Repetir o roteiro de 14 passos na org de TESTE | passo 11 PASSOU; zero PDF na busca; selo e aviso conferidos; rollback ON→OFF feito |

**Regra que não muda:** nenhum PDF histórico é regenerado e nenhum SHA-256 muda.

**Proibido sem nova autorização:** iniciar a **9F.2** (e as demais telas da 9F), a 9G, PDF
vetorial, habilitar `cmam.caldeiras`, **habilitar `busca_v9` em qualquer organização cliente**
e **habilitar `inspecoes_v9` em qualquer organização cliente**. A 9F.1 teve autorização própria
em 29/08, já usada: rollout feito na org de teste e revertido.

### 4.1-bis · A expansão do `boot_v9` (gradual, autorização separada)

> **O piloto em organização cliente JÁ FOI FEITO** (25/08, `92a28bff…`, validação
> administrativa read-only): paridade 3/3 campo a campo, boot de **20 KB contra 354 KB**,
> rollback conferido. Registro em `medicoes/2026-08-25-9d-piloto-org-cliente.md`.
>
> **P9.3 FECHADO ✅ em 25/08.** A evidência foi aceita como DISTRIBUÍDA: laboratório (escala,
> essencial constante, testes), organização de teste (interface real, offline, fila, reconexão,
> retentativa, rollback) e piloto real (rebuild, paridade, boot leve, rollback).
>
> **`cmam.caldeiras` (`06f84f2e…`) NÃO deve ser habilitada** — decisão do dono em 25/08. É a
> única pagante, a maior, e a do incidente v1×v2; a organização de maior risco não vira
> requisito artificial para fechar um portão. Expansão a clientes: **gradual, com autorização
> separada, uma de cada vez**.

**PRÉ-CONDIÇÃO, por organização:** as migrações de segundo plano dela já concluíram (histórico
por relatório, rubricas do livro, anexos). O boot leve NÃO as roda — elas varrem o cache, que
deixa de ter a organização inteira. Confira **no servidor**:

```sql
select count(*) filter (where chave like 'nr13_rel_%')              as por_id,
       count(*) filter (where chave like 'nr13_historico_indice_%') as indice,
       count(*) filter (where chave = 'nr13_historico_relatorios')  as legado
  from public.app_storage where org_id = '<ORG>' and deletado_em is null;
```

Organização grande ainda não tem projeção: rodar o rebuild antes de ligar
(`reiniciar_rebuild_busca` → `reconstruir_indice_busca` até `processadas = 0` → `auditar_projecao`).

### 4.2 · Decisões menores em aberto

| # | assunto | estado |
|---|---|---|
| 1 | Ligar `busca_v9` junto com `boot_v9` | provado e desligado desde 23/08 |
| 2 | Cidade pesquisável na busca | decidido **não** agora |
| 3 | 2 pendências de sincronização em `teste@gmail.com` (14/08) | continuam ali; o selo mostra "2 falhas" |
| 4 | Fluido do cartão com prefixo duplicado | cosmético, igual nos dois caminhos |
| 5 | `nr13_rastreab_` é 396 dos 433 KB do boot | **fica**; a saída é parar de mandar `pdfBase64` no registro |
| 6 | Modo offline do roteiro | **EXERCITADO em 25/08** — achou 2 defeitos, corrigidos e reprovados (`medicoes/2026-08-25-9d-prova-offline-e-dois-defeitos.md`) |
| 7 | Cota do Supabase | o painel exibe *"Grace period is over"*. Fora do escopo da Fase 9, decisão sua |
| 8 | Relatório órfão na lista da 9E | **RESOLVIDO em 28/08** — escopo `ativos` por padrão + aviso com o número + selo na linha; nada some, nada aparece sem aviso (§4.1) |

---

## 4.3 · Os caminhos de acesso

> **Nenhuma senha, token ou chave está escrita aqui, de propósito.**

| o quê | endereço |
|---|---|
| Sistema em produção | `https://app.nr13sistema.com.br` (sessão no Chrome: `teste@gmail.com`, org `99f642d3-…-8d211c`) |
| Supabase — projeto | `https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw` |
| Supabase — SQL Editor | `…/project/qqsesrntfvmdxqxrfvmw/sql/new` |
| Coolify — deploy do front | `http://187.77.34.112:8000/project/ngg0g8oo0sw0wk8ggw8wso4o/environment/vwcgcgsogsswwck8w04c0c0w/application/ok40g4s8ko8wgssk8go00sg8` |
| Repositório | `https://github.com/felipe1santos/nr13-app` · branch **`main`** |

**Publicação:** front = manual no Coolify (botão *Redeploy*; ~95 s) · SQL = manual no SQL Editor ·
Edge = manual no Dashboard. O `git push` sozinho não publica — mas sem ele o Coolify publica o
commit velho.

**Conferir que o bundle novo subiu** (console da aba do app) — o marcador é uma **string
literal**, porque nome de função a minificação renomeia:

```js
const html = await (await fetch('/', {cache:'no-store'})).text();
const js = [...html.matchAll(/assets\/([\w.-]+\.js)/g)].map(m => m[1]);
const t = await (await fetch('/assets/' + js[0], {cache:'no-store'})).text();
console.log(js[0], t.includes('boot_v9') ? 'BUNDLE DA 9D' : 'bundle ANTIGO');
```

**Três manhas do painel do Supabase:**
1. A aba do SQL Editor só monta o Monaco quando está **VISÍVEL**. Um **screenshot** força o render.
2. `window.monaco.editor.getEditors()[0].setValue(sql)` escreve, e **Ctrl+Enter** executa — o
   clique no botão *Run* sozinho não pega. Antes do Ctrl+Enter, dar foco:
   `document.querySelector('.monaco-editor textarea').focus()`.
3. Script com `delete`/`drop` no texto abre o modal **"Potential issue detected"**. Confirmar em
   *Run query* — clicar pelo DOM, porque as coordenadas da tela dançam.
4. **O painel de resultado SERVE O RESULTADO ANTERIOR**, e a caixa de texto para de aceitar
   digitação depois da primeira execução em cada aba. Em 25/08 isso quase fez o rollback ser dado
   como falho: a leitura mostrava `busca_on: 1` — o resultado VELHO — porque a consulta nova nem
   tinha rodado. **Confira as COLUNAS, não só os valores:** se os nomes não são os da consulta que
   você acabou de escrever, o painel está velho. Abra uma **aba nova do navegador** em vez de
   insistir na mesma.

**Arquivo grande no editor sem digitar:** `fetch` do `raw.githubusercontent.com` pelo **SHA do
commit** (a URL por branch fica em cache do CDN e serve a versão velha) e `setValue` no Monaco.

---

## 5 · Onde está cada coisa

| o quê | onde |
|---|---|
| Estado de todas as fases | `docs/ESTADO-DAS-FASES.md` |
| Plano da Fase 9 (9D fechada, 9E–9G abertas) | `docs/superpowers/plans/2026-08-22-fase9-task-level.md` |
| Desenho da Fase 9 | `docs/superpowers/specs/2026-08-22-fase9-escala-busca-design.md` |
| **9D em produção: SQL, defeito e roteiro** | `docs/medicoes/2026-08-25-9d-sql-aplicado-producao.md` |
| **9F.1: o rollout em produção (SQL, reprojeção, roteiro, rollback)** | `docs/medicoes/2026-08-29-9f1-rollout-producao.md` |
| 9F.1: gate de navegador em 1k/10k/50k | `docs/medicoes/2026-08-29-9f1-gate-navegador.md` |
| **9E: rollout, defeito bloqueante e rollback** | `docs/medicoes/2026-08-25-9e-rollout-producao.md` |
| **9E: os três defeitos e como foram consertados** | `docs/medicoes/2026-08-28-9e-destravamento.md` |
| **9E: o rollout de 28/08 que passou (evidências)** | `docs/medicoes/2026-08-28-9e-rollout-producao.md` |
| 9E: gates de escala (banco e navegador) | `docs/medicoes/2026-08-25-9e-relatorios-escala.md` |
| Teto do boot, medido | `docs/medicoes/2026-08-24-9d1-teto-do-boot-producao.md` |
| P9.2: tela, correção e regressão | `docs/medicoes/2026-08-23-p92-validacao-frontend-8d211c.md` |
| SQL da 9D | `supabase/boot_v9_flag.sql` · `supabase/vencimentos_agregado.sql` · `busca_manutencao.sql` · `busca_index_rpc.sql` |

---

## 6 · Como desfazer

| desfazer | como | custo |
|---|---|---|
| O boot leve de uma organização | `select public.definir_boot_v9('<ORG>', false);` | instantâneo, nada se perde — **testado em 25/08** |
| A busca nova de uma organização | `select public.definir_busca_v9('<ORG>', false);` | idem |
| A `/inspecoes` nova de uma organização | `select public.definir_inspecoes_v9('<ORG>', false);` | instantâneo, nada é convertido de volta — **testado em 29/08** |
| O agregado de vencimentos | bloco ROLLBACK no fim de `vencimentos_agregado.sql` | as projeções são derivadas |
| As funções da RLS voltarem a `VOLATILE` | `supabase/rls_funcoes_estaveis_rollback.sql` | instantâneo |
| A Fase 9 inteira sair do banco | `busca_index_rpc_rollback.sql` **e depois** `fase9_rollback.sql` | **nenhum dado empresarial se perde** |

---

## 8 · 9F.2 — rollout feito e revertido (29/08/2026)

Autorizado pelo dono, executado na ordem combinada: preflight (sem divergência) → 5 arquivos
de SQL → marcadores, RLS e grants → reprojeção **só** da org de teste (paridade 4/4) → deploy
(`index-DUDKIbuX.js`, conferido por `curl`) → baseline OFF → flag ON só na org de teste →
roteiro → **rollback**: `prontuarios_v9` **0 de 30**, `busca_v9` 0, `boot_v9` 2,
`inspecoes_v9` 0, `auditar_projecao` `convergiu: true` com pendências 0.

**A prova que fecha o risco bloqueante:** as 6 folhas do prontuário abriram com conteúdo real
e, reabertas pelo caminho legado, saíram com texto **idêntico byte a byte**.

> **ARMADILHA NOVA — o botão Redeploy do Coolify que não faz nada.** Com a aba aberta há horas,
> a sessão do Livewire vence: o botão aceita o clique, não dá erro, não registra deployment e o
> bundle em produção continua o antigo. **Recarregue a página do Coolify antes de clicar**, e
> confira o resultado pelo BUNDLE (`curl`), nunca pelo clique.

**Não provado neste rollout, e declarado:** escala (a org de teste tem 4 equipamentos — keyset
e virtualização seguem provados só em laboratório); o estado `null` do badge (em produção não
existe, porque a org foi reprojetada); cache frio/offline sob a flag.

**Decisão tomada em 31/08:** **P9.4 FECHADO ✅ · 9F.2 CONCLUÍDA ✅**, com as três limitações
acima permanecendo REGISTRADAS — elas não foram aprovadas por inferência.

---

## 9 · 9F.3 (`/calibracoes`) — só a ANÁLISE está autorizada (31/08/2026)

O dono autorizou **apenas o AS-IS**: sem tocar em `src`, schema, SQL de produção, flags ou
clientes. O documento é `medicoes/2026-08-31-9f3-calibracoes-as-is.md`.

**O defeito-alvo, em uma linha:** `Calibracoes.tsx:417` roda `listarCalibracoes(eq.tag).length`
**dentro do `.map()` do render** — um `JSON.parse` por cartão, a cada quadro; e o mount chama
`listarEquipamentos()`, que é `lerTudo()` da organização inteira para desenhar uma lista que só
precisa de `nr13_info_` e `nr13_emp_`.

**Implementar a 9F.3 NÃO está autorizado.**
