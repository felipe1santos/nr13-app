# PONTO DE RETOMADA — 23/08/2026, fim do dia

> **Leia só este arquivo para voltar ao trabalho.** Ele diz onde paramos, o que está de pé em
> produção, e qual é a próxima decisão. Nada aqui depende de lembrar da conversa.

---

## 1 · Onde paramos, em uma linha

**A Fase 9 chegou até o portão P9.2, e ele FECHOU ✅ em 23/08/2026.** O próximo passo é a **9D**,
que **não está autorizada** — é a sua decisão quando voltar.

---

## 2 · O que está de pé em PRODUÇÃO agora

| | estado |
|---|---|
| Funções auxiliares da RLS | **`STABLE`** (eram `VOLATILE`) — 1.695 → 883 buffers, `Filter` por linha → `One-Time Filter` |
| Infraestrutura da Fase 9 (9A/9B/9C) | **instalada**: projeções, manutenção pela RPC, índices, consulta, flag |
| Correção de paridade do cliente | **aplicada**: `cliente_nome` + `cliente_cidade` |
| Organizações com projeção convergida | **duas**: `…8d0f7e` (4 equip.) e `…8d211c` (4 equip.) |
| **Flag `busca_v9`** | **DESLIGADA nas 29 organizações** — **a tela de todo mundo é a antiga** |
| `app_storage` | **inalterada**: 891 chaves, 32,9 MB |
| Pendências de projeção | **0** · auditoria `convergiu: true` nas duas orgs |
| Bundle em produção | `index-Bf-Fi8nA.js`, do `main` atual |
| Suíte | **1244/1244** · build verde |

> **Ninguém está usando a busca nova ainda.** Ela está provada e desligada. Ligar para uma
> organização é uma linha: `select public.definir_busca_v9('<ORG>', true);` — e desligar é a mesma
> linha com `false`. Nada é convertido nos dois sentidos.

---

## 3 · O que fizemos hoje, na ordem

1. **ETAPA 1** — as seis funções da RLS viraram `STABLE` em produção; rollback exercitado de
   verdade e reaplicado. 7 atores reais, 0 divergências.
2. **ETAPA 2** — infraestrutura da Fase 9 instalada na ordem certa; backfill de **uma** org piloto;
   validação server-side com dado real (projeção × verdade, 4 equipamentos × 13 campos).
3. **Deploy do front** — detectamos que o bundle não tinha subido, você redeployou, conferimos.
4. **Validação de tela** na organização `…8d211c` (**OPÇÃO B**: a conta real do cliente **não** foi
   acessada) — OFF × ON, busca, debounce, DOM/rede, ponte, palco, offline com requisição
   **realmente falhando**, fila durável, reconexão, rollback.
5. **Divergência encontrada** — a cidade do cliente sumia do cartão sob a V9, e a precedência do
   nome estava invertida (defeito latente). **O portão ficou aberto.**
6. **Correção** — projeção passou a ter `cliente_nome` + `cliente_cidade`, com a composição na tela
   (`textoCliente()`), em **todos** os caminhos. Prova sintética em produção: `PARIDADE OK`.
7. **Regressão curta** — **4/4 cartões idênticos** caractere a caractere entre OFF e ON.
8. **P9.2 FECHADO ✅** por você, e registrado na documentação.

---

## 4 · O QUE FALTA — comece por aqui

### 4.1 · A decisão que está esperando você

> ## 👉 Autorizar (ou não) a **9D**

**9D = o boot deixa de baixar a organização inteira.** É a etapa que resolve de vez o problema da
Fase 8 (~4 min e 1,63 GB para abrir `/equipamentos` com 51.000 equipamentos).

| | |
|---|---|
| Por que ela vem agora | a leitura pela projeção já está **provada em produção** — era a pré-condição |
| Risco | **o mais alto da fase**: toda tela que hoje lê do `Map` inteiro pode quebrar em silêncio |
| Mitigação já pronta | a ponte `carregarEquipamento(tag)` → `semearCache()` → `ler()` síncrono **já existe e já foi validada em produção**; os 40+ templates continuam intocados |
| Flag | **própria** (`boot_v9`), separada da `busca_v9`, para rollback independente |
| Tarefas | 6, detalhadas em `plans/2026-08-22-fase9-task-level.md` §9D |

**Se você autorizar, o primeiro passo é 9D.1:** `hidratarEssencial()` e **medir o teto real** do
que fica no boot.

### 4.2 · Decisões menores que ficaram abertas (nenhuma bloqueia nada)

| # | assunto | estado |
|---|---|---|
| 1 | **Ligar `busca_v9` para alguma organização de verdade** | provado e desligado. Faz sentido esperar a 9D, porque juntas elas resolvem o problema inteiro |
| 2 | **Cidade pesquisável na busca** | decidimos **não** incluir agora (a busca antiga não pesquisa cliente nem cidade, e mudar a coluna gerada obriga a reescrever tabela e GIN). Se um dia quiser, entra nos dois lados juntos, com medição |
| 3 | **2 pendências antigas de sincronização** na conta `teste@gmail.com` (`…_EQUIPE TESTE`, de 14/08) | **anteriores a este trabalho**, não são efeito da Fase 9. Ninguém olhou ainda |
| 4 | **Fluido do cartão** imprime prefixo duplicado e transborda (`A · A - Fluido inflamável…`) | cosmético, **igual nos dois caminhos** — defeito antigo do cartão, não da Fase 9 |
| 5 | `ZZ-TESTE-9C-20260823` deixou **1 tombstone** na org piloto | exclusão lógica, como previsto. Nada a fazer |

---

## 4.3 · Os caminhos de acesso — para não procurar de novo

> **Nenhuma senha, token ou chave está escrita aqui, de propósito.** O que está aqui são os
> **endereços**; as sessões já ficam logadas no Chrome deste computador.

| o quê | endereço | quem entra |
|---|---|---|
| **Sistema em produção** | `https://app.nr13sistema.com.br` | a sessão aberta no Chrome é a conta de teste `teste@gmail.com` (organização `99f642d3-…-8d211c`) |
| Lista de equipamentos (a tela da Fase 9) | `https://app.nr13sistema.com.br/equipamentos` | — |
| **Supabase — projeto de produção** | `https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw` | já logado no Chrome (projeto **SAAS NR13**, org "meu SaaS delivery", região `sa-east-1`) |
| Supabase — SQL Editor (aba nova) | `https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw/sql/new` | — |
| Supabase — logs do Postgres | `…/project/qqsesrntfvmdxqxrfvmw/logs/postgres-logs` | — |
| Supabase — Auth / usuários | `…/project/qqsesrntfvmdxqxrfvmw/auth/users` | — |
| **Coolify — deploy do front** | `http://187.77.34.112:8000/project/ngg0g8oo0sw0wk8ggw8wso4o/environment/vwcgcgsogsswwck8w04c0c0w/application/ok40g4s8ko8wgssk8go00sg8` | já logado no Chrome |
| Repositório | `https://github.com/felipe1santos/nr13-app` · branch **`main`** (nunca `master`) | — |

### Como cada coisa é publicada

| camada | como vai para produção |
|---|---|
| **Front** | **manual, por você, no Coolify** — botão *Deploy*, a partir do `main`. `git push` sozinho **não** publica |
| **SQL** | manual, colando o arquivo no SQL Editor do Supabase |
| **Edge Functions** | manual, pelo Dashboard |

### Como conferir que o bundle novo REALMENTE subiu

`git push` e "Deploy successful" não bastam — já aconteceu de o front continuar antigo. A
conferência que vale, rodada no console da aba do app:

```js
const html = await (await fetch('/', {cache:'no-store'})).text();
const js = [...html.matchAll(/assets\/([\w.-]+\.js)/g)].map(m => m[1]);
const t = await (await fetch('/assets/' + js[0], {cache:'no-store'})).text();
console.log(js[0], t.includes('clienteCidade') ? 'BUNDLE NOVO' : 'bundle ANTIGO');
```

> O **hash do arquivo `.js` de produção é diferente do build local** — o build de produção embute
> as variáveis de ambiente dele. Por isso a conferência é por **marcador dentro do arquivo**
> (contagem das strings, comparada com o build local), não por nome de arquivo.

### Duas manhas do Dashboard do Supabase que custaram tempo hoje

1. **A aba do SQL Editor só monta o editor quando está VISÍVEL.** Em segundo plano ela congela, o
   Monaco nem carrega, e o clique em *Run* não faz nada. Sintoma: `document.visibilityState` =
   `hidden` e `window.monaco` indefinido.
2. **Contorno que funcionou:** falar direto com a API que o próprio painel usa —
   `POST https://api.supabase.com/platform/pg-meta/qqsesrntfvmdxqxrfvmw/query` com `{query: "..."}`,
   reaproveitando os cabeçalhos de uma requisição que o painel acabou de fazer (o `authorization`
   expira rápido; é só rodar qualquer consulta pelo botão e capturar de novo).

---

## 5 · Onde está cada coisa

| o quê | onde |
|---|---|
| Estado de todas as fases | `docs/ESTADO-DAS-FASES.md` |
| Plano da Fase 9, com a 9D detalhada | `docs/superpowers/plans/2026-08-22-fase9-task-level.md` (o bloco final é o ponto de retomada técnico) |
| Ordem de rollout, as duas etapas | `docs/superpowers/plans/2026-08-23-ordem-de-rollout.md` |
| ETAPA 1 (RLS `STABLE`) em produção | `docs/medicoes/2026-08-23-etapa1-rls-stable-producao.md` |
| ETAPA 2 (infraestrutura + servidor) | `docs/medicoes/2026-08-23-etapa2-fase9-producao.md` |
| **P9.2: tela, correção e regressão** | `docs/medicoes/2026-08-23-p92-validacao-frontend-8d211c.md` |
| Diagnóstico do `Grace period is over` | `docs/medicoes/2026-08-23-diagnostico-grace-period.md` |
| Migração da paridade, para banco já instalado | `supabase/busca_cliente_paridade.sql` |
| Prova sintética da paridade | `scripts/fase9/teste-cliente-paridade.sql` |

**Commits de hoje, todos em `main`:** `e4be47b` (ETAPA 1) · `639c252` (ETAPA 2) · `aae1510`
(validação de tela e a divergência) · `de01cda` (correção) · `5a7d3ab` (prova sintética) ·
`7e87f42` e `10d965a` (registro) · `ca320cd` (P9.2 fechado).

---

## 6 · Como desfazer, se precisar (nada foi feito sem volta)

| desfazer | como | custo |
|---|---|---|
| A busca nova de uma organização | `select public.definir_busca_v9('<ORG>', false);` | instantâneo, **nada se perde** |
| As funções da RLS voltarem a `VOLATILE` | `supabase/rls_funcoes_estaveis_rollback.sql` | instantâneo, nada se perde |
| A Fase 9 inteira sair do banco | `busca_index_rpc_rollback.sql` **e depois** `fase9_rollback.sql` | as projeções são derivadas — **nenhum dado empresarial se perde** |
