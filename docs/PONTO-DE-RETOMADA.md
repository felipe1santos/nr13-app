# PONTO DE RETOMADA — 24/08/2026, fim do dia

> **Leia só este arquivo para voltar ao trabalho.** Ele diz onde paramos, o que está de pé em
> produção, e qual é a próxima decisão. Nada aqui depende de lembrar da conversa.

---

## 1 · Onde paramos, em uma linha

**A 9D está ESCRITA e commitada, e nada dela está ligado em produção.** O que falta é
**aplicar o SQL e ligar a flag numa organização** — e essa é a sua decisão quando voltar.

---

## 2 · O que está de pé em PRODUÇÃO agora

| | estado |
|---|---|
| Funções auxiliares da RLS | **`STABLE`** (ETAPA 1, 23/08) |
| Infraestrutura da Fase 9 (9A/9B/9C) | **instalada**; projeção convergida em **duas** organizações |
| **Flag `busca_v9`** | **DESLIGADA nas 29 organizações** |
| **Flag `boot_v9`** | **não existe no banco ainda** — o SQL da 9D não foi aplicado |
| SQL da 9D (3 arquivos) | **NÃO aplicado** — ver §4.1 |
| Front | o bundle em produção é o de 23/08; **a 9D não foi publicada** (deploy é manual, no Coolify) |
| `app_storage` | inalterada |
| Suíte | **1298/1298** · build verde |

> **Nada mudou para nenhum usuário.** A 9D inteira nasce atrás de uma flag que ainda não
> existe no banco — e, mesmo depois de criada, ela nasce `false`.

---

## 3 · O que a 9D fez (commits `0819277` e `cd54457`, em `main`)

O boot esperava `lerTudo()`: a organização INTEIRA antes da primeira tela. Com 51.000
equipamentos a Fase 8 mediu **~4 min e 1,63 GB**. Sob `boot_v9` o boot espera só o
essencial — **433 KB, medidos, e CONSTANTES** (não crescem com o parque).

| | |
|---|---|
| **9D.1** | `hidratarEssencial()` + `essencial.ts` (lista explícita). Não avança a marca d'água — uma leitura parcial que a movesse faria a próxima hidratação completa pular a organização inteira, sem erro na tela |
| **9D.2** | `carregarEquipamento(tag)` já existia (9C). **Faltava uma passada:** `nr13_rel_<id>_<TAG>` é `POR_ID_E_TAG` e nenhuma lista de prefixos o alcança — o histórico abria curto e o relatório não era encontrado |
| **9D.3** | Throttle de `lerTudo()` (60 s), que a v2 tinha perdido. Dentro da janela devolve o SNAPSHOT (a v1 devolvia `{}`, e tela que recebesse isso diria "conta vazia"); a fila NUNCA é throttled |
| **9D.4** | `hidratarNoBoot()`, testado, com três respostas: `nenhuma` (Portal), `completa` (hoje), `essencial`. As 3 migrações de varredura **não rodam** no boot leve |
| **9D.5** | Dashboard/Vencimentos pelo **agregado do servidor** (§15, trazido da 9F por decisão sua); `limiteTrial` conta pela projeção; `Layout` idem; `/livro-registro` hidrata sob demanda |
| **9D.6** | Teste ponta a ponta: palco **idêntico** ao da hidratação integral. **Nenhum template tocado** |

**A regra do vencimento agora tem UMA implementação e DUAS fontes** (`itemDeEquipamento` /
`itemDeCalibracao`, funções puras sobre fatos). O servidor só CONTA e ORDENA. É a lição do
portão P9.2, aplicada antes de o defeito acontecer.

---

## 4 · O QUE FALTA — comece por aqui

### 4.1 · Aplicar o SQL da 9D (manual, no SQL Editor), **nesta ordem**

1. `supabase/boot_v9_flag.sql` — cria a coluna `boot_v9` (nasce `false`) e `definir_boot_v9`.
2. `supabase/vencimentos_agregado.sql` — colunas novas, `calibracoes_index`, `f9_mais_meses`
   e `vencimentos_org()`.
3. `supabase/busca_manutencao.sql` — **reaplicar** (projeta os campos novos e as calibrações).
4. `supabase/busca_index_rpc.sql` — **reaplicar** (`nr13_calibracoes_` entra no despachante).
5. Nas **duas** organizações já convergidas, refazer a projeção para as colunas novas
   deixarem de ser nulas:
   ```sql
   select public.reiniciar_rebuild_busca('<ORG>');
   select public.reconstruir_indice_busca('<ORG>', 1000);   -- repetir até processadas = 0
   select public.auditar_projecao('<ORG>');
   ```

> **Sem o passo 5 o painel abre certo em equipamento novo e vazio nos antigos** — as colunas
> novas nascem nulas nas linhas já projetadas.

### 4.2 · Depois: publicar o front e ligar a flag numa organização

1. Deploy manual no Coolify, a partir do `main` (o `git push` sozinho não publica).
2. Conferir que o bundle subiu — o script está em §4.4, agora com marcador da 9D.
3. `select public.definir_boot_v9('<ORG>', true);` numa organização de teste.
4. Roteiro de tela: Dashboard (KPIs e selo "dados de HH:MM"), `/vencimentos`, abrir um
   equipamento, gerar um documento, `/livro-registro`, offline, e o rollback.

> **PRÉ-CONDIÇÃO de ligar `boot_v9` numa organização:** as migrações de segundo plano dela já
> concluíram (histórico por relatório, rubricas do livro, anexos). O boot leve NÃO as roda —
> elas varrem o cache, que deixa de ter a organização. Confira no servidor, não no aparelho.

### 4.3 · Decisões menores em aberto

| # | assunto | estado |
|---|---|---|
| 1 | Ligar `busca_v9` numa organização de verdade | provado e desligado desde 23/08. Faz sentido ligar junto com `boot_v9` |
| 2 | Cidade pesquisável na busca | decidido **não** agora |
| 3 | 2 pendências antigas de sincronização em `teste@gmail.com` (14/08) | anteriores a este trabalho; ninguém olhou |
| 4 | Fluido do cartão com prefixo duplicado | cosmético, igual nos dois caminhos |
| 5 | `nr13_rastreab_` é 396 dos 433 KB do boot | **fica**, com o motivo registrado na medição. A saída futura é parar de mandar o `pdfBase64` dentro do registro, não tirar a família do boot |
| 6 | Aba do SQL Editor ficou aberta no Chrome | a extensão parou de responder ao fechar; feche na mão |

---

## 4.4 · Os caminhos de acesso

> **Nenhuma senha, token ou chave está escrita aqui, de propósito.**

| o quê | endereço |
|---|---|
| Sistema em produção | `https://app.nr13sistema.com.br` (sessão no Chrome: `teste@gmail.com`, org `99f642d3-…-8d211c`) |
| Supabase — projeto | `https://supabase.com/dashboard/project/qqsesrntfvmdxqxrfvmw` |
| Supabase — SQL Editor | `…/project/qqsesrntfvmdxqxrfvmw/sql/new` |
| Coolify — deploy do front | `http://187.77.34.112:8000/project/ngg0g8oo0sw0wk8ggw8wso4o/environment/vwcgcgsogsswwck8w04c0c0w/application/ok40g4s8ko8wgssk8go00sg8` |
| Repositório | `https://github.com/felipe1santos/nr13-app` · branch **`main`** |

**Publicação:** front = manual no Coolify · SQL = manual no SQL Editor · Edge = manual no Dashboard.

**Conferir que o bundle novo subiu** (console da aba do app):

```js
const html = await (await fetch('/', {cache:'no-store'})).text();
const js = [...html.matchAll(/assets\/([\w.-]+\.js)/g)].map(m => m[1]);
const t = await (await fetch('/assets/' + js[0], {cache:'no-store'})).text();
console.log(js[0], t.includes('hidratarEssencial') ? 'BUNDLE DA 9D' : 'bundle ANTIGO');
```

**Duas manhas do painel do Supabase:**
1. A aba do SQL Editor só monta o Monaco quando está **VISÍVEL** (em segundo plano,
   `document.visibilityState = 'hidden'` e `window.monaco` não existe). Um **screenshot**
   força o render.
2. Depois disso, `window.monaco.editor.getEditors()[0].setValue(sql)` escreve a consulta e
   **Ctrl+Enter** executa — o clique no botão *Run* sozinho não pegou.

---

## 5 · Onde está cada coisa

| o quê | onde |
|---|---|
| Estado de todas as fases | `docs/ESTADO-DAS-FASES.md` |
| Plano da Fase 9 (9D marcada, 9E–9G abertas) | `docs/superpowers/plans/2026-08-22-fase9-task-level.md` |
| Desenho da Fase 9 | `docs/superpowers/specs/2026-08-22-fase9-escala-busca-design.md` |
| **Teto do boot, medido** | `docs/medicoes/2026-08-24-9d1-teto-do-boot-producao.md` |
| P9.2: tela, correção e regressão | `docs/medicoes/2026-08-23-p92-validacao-frontend-8d211c.md` |
| ETAPA 1 e 2 em produção | `docs/medicoes/2026-08-23-etapa1-rls-stable-producao.md` · `…-etapa2-fase9-producao.md` |
| SQL da 9D | `supabase/boot_v9_flag.sql` · `supabase/vencimentos_agregado.sql` |
| Medição, para repetir | `scripts/fase9/medir-teto-boot.sql` |

---

## 6 · Como desfazer

| desfazer | como | custo |
|---|---|---|
| O boot leve de uma organização | `select public.definir_boot_v9('<ORG>', false);` | instantâneo, nada se perde |
| A busca nova de uma organização | `select public.definir_busca_v9('<ORG>', false);` | idem |
| O agregado de vencimentos | bloco ROLLBACK no fim de `vencimentos_agregado.sql` | as projeções são derivadas |
| As funções da RLS voltarem a `VOLATILE` | `supabase/rls_funcoes_estaveis_rollback.sql` | instantâneo |
| A Fase 9 inteira sair do banco | `busca_index_rpc_rollback.sql` **e depois** `fase9_rollback.sql` | **nenhum dado empresarial se perde** |
