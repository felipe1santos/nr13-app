# PONTO DE RETOMADA — 28/08/2026 (9E: defeito consertado, rollout por repetir)

> **Leia só este arquivo para voltar ao trabalho.** Ele diz onde paramos, o que está de pé em
> produção, e qual é a próxima decisão. Nada aqui depende de lembrar da conversa.

---

## 1 · Onde paramos, em uma linha

**A 9D está CONCLUÍDA (P9.3 fechado em 25/08). O defeito que bloqueou a 9E foi CONSERTADO em
28/08 — junto com outros dois que estavam escondidos atrás dele —, mas a 9E só sai de
BLOQUEADA quando o rollout for repetido em produção.** A flag `busca_v9` segue OFF nas 30. A
próxima tarefa é APLICAR e MEDIR, na ordem do §4.1: o SQL da projeção primeiro, senão nada mais
adianta. Registro da correção: `medicoes/2026-08-28-9e-destravamento.md`.

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
| Front | bundle **`index-CuF2FwNz.js`** publicado no Coolify em 25/08 — contém a 9E **com o defeito**; a correção de 28/08 ainda NÃO foi publicada |
| SQL da 9E (`busca_relatorios.sql`) | aplicado em 25/08, **VERSÃO ANTIGA** — a de 28/08 (escopo, `equipamento_ativo`, `historicos`) está por aplicar |
| SQL da projeção (`busca_manutencao.sql`) | **PRECISA SER REAPLICADO** — `pdfRef ->> 'path'`; enquanto não for, `pdf_ref` continua nulo em toda linha |
| Projeções | `relatorios_index` **23** · `equipamentos_index` **17** · `calibracoes_index` **18** — a de relatórios precisa ser REFEITA depois do passo acima |
| `app_storage` | inalterada |
| Suíte | **1410/1410** · `tsc -b` limpo · build verde (28/08) |

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

7. **Os três defeitos da 9E, consertados com teste** (§4.1 e
   `medicoes/2026-08-28-9e-destravamento.md`). O segundo é o que importa lembrar: a projeção lia
   `pdfRef ->> 'caminho'` e o campo se chama `path` — chave inexistente devolve `NULL` sem erro,
   e a busca inteira ficava sem referência de arquivo. **Nada em produção foi tocado**: são
   mudanças de código e de SQL, ainda por aplicar.

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

### 4.1 · A PRÓXIMA TAREFA: aplicar e repetir o rollout da 9E

**O código está pronto e verificado localmente (1410/1410, build verde). O que falta é
produção.** Os três defeitos e o desenho de cada correção estão em
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

**A ORDEM IMPORTA, e o primeiro passo é o que não pode ser pulado:**

| # | Ação | Como conferir |
|---|---|---|
| 1 | Reaplicar **`supabase/busca_manutencao.sql`** | `prosrc` de `projetar_relatorios` contém `->> 'path'` (a auditoria NÃO acusa isto — armadilha nº 2) |
| 2 | Reprojetar (`reiniciar_rebuild_busca` + `reconstruir_indice_busca`) | nenhuma linha com `sha256` preenchido e `pdf_ref` nulo |
| 3 | Reaplicar **`supabase/busca_relatorios.sql`** | ele RECUSA rodar se o passo 1 faltou; assinaturas com `p_escopo`, coluna `equipamento_ativo` |
| 4 | Publicar o front e conferir o bundle | `curl` da raiz, nunca pelo navegador (armadilha nº 1) |
| 5 | Repetir o roteiro de 14 passos na org de TESTE | **passo 11**: o PDF ABRE; a busca segue com **zero** requisição de PDF; o selo e o aviso aparecem para o órfão |

**Regra que não muda:** nenhum PDF histórico é regenerado e nenhum SHA-256 muda.

**Proibido sem nova autorização:** 9F, 9G, PDF vetorial, e habilitar `cmam.caldeiras`.

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
| **9E: rollout, defeito bloqueante e rollback** | `docs/medicoes/2026-08-25-9e-rollout-producao.md` |
| **9E: os três defeitos e como foram consertados** | `docs/medicoes/2026-08-28-9e-destravamento.md` |
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
| O agregado de vencimentos | bloco ROLLBACK no fim de `vencimentos_agregado.sql` | as projeções são derivadas |
| As funções da RLS voltarem a `VOLATILE` | `supabase/rls_funcoes_estaveis_rollback.sql` | instantâneo |
| A Fase 9 inteira sair do banco | `busca_index_rpc_rollback.sql` **e depois** `fase9_rollback.sql` | **nenhum dado empresarial se perde** |
