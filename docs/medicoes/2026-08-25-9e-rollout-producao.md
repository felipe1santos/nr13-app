# Fase 9 · 9E — rollout controlado em produção (25/08/2026)

Roteiro de 14 passos executado na ordem obrigatória. **Resultado: 9E BLOQUEADA ❌**
por um defeito encontrado no passo 11 — a tela nova não abre relatório arquivado.
A flag foi devolvida para OFF no mesmo dia e a tela antiga voltou intacta.

---

## Passos 1–10 — preparo e linha de base (todos ✅)

| # | Passo | Evidência |
|---|---|---|
| 1 | SQL `busca_relatorios.sql` aplicado | "Success. No rows returned" |
| 2 | Funções, colunas e índices conferidos | 4 índices em `relatorios_index` (incl. `relatorios_index_tag_prefixo_idx`), collation `C`, CTE `AS MATERIALIZED`, `security definer` |
| 3 | RLS das RPCs | `anon` = false · `authenticated` = true |
| 4 | Saúde do projeto | **Healthy** (NANO) |
| 5 | Front publicado | bundle `index-CuF2FwNz.js`, contendo `buscar_relatorios`, `contar_relatorios`, `Sem data` e o placeholder da busca |
| 6 | Flag por default | `busca_v9` OFF nas **30** organizações |
| 7 | Piloto escolhido | organização de TESTE `99f642d3-6efd-446d-9e76-d234ad8d211c` (decisão do dono) |
| 8 | Linha de base com a flag OFF | tela legada, sem busca, **3 relatórios** |
| 9 | Flag ligada só no piloto | `busca_on = 1` · `boot_on = 2` · `total = 30` |
| 10 | Tela nova no ar | busca visível, **15 resultados**, 15 linhas no DOM |

Conferências do passo 10/11 que passaram:

- TAGs listadas: `ZZ-FASE3`, `COMPRESSOR V8-15/200L`, `VASO A23`, `CALD-01`, `VASO 02`.
- `Sem data` aparece; a sentinela `01/01/0001` **não** aparece em lugar nenhum.
- Termo inexistente → "Nenhum relatório encontrado para zzznaoexiste. Limpar busca".
- **Zero requisições de PDF** durante toda a navegação e busca.

### Observação que NÃO é defeito, mas precisa de decisão do dono

A V9 mostra **15** relatórios onde a tela legada mostrava **3**. A diferença não é
duplicação: a legada lista o histórico **do equipamento escolhido**, e a V9 lista o
da **organização inteira** — inclusive relatórios órfãos, cujo equipamento foi
excluído (`VASO A23`, `CALD-01`, `VASO 02`). É informação **aparecendo**, não
sumindo. Ainda assim é uma mudança de comportamento visível para o usuário, e
quem decide se relatório órfão deve ser listado é o dono do produto.

---

## Passo 11 — DEFEITO BLOQUEANTE ❌

> **Clicar em "Visualizar" num relatório arquivado não faz nada.**

Medido: a URL continua em `/relatorios`, `temVisualizadorPdf: false`, `linhas: 15`,
`PDF: 0`. Nenhum erro no console — o clique simplesmente não leva a lugar nenhum.

**Causa raiz** (`src/pages/Relatorios.tsx:1180`):

```jsx
aoAbrir={(r) => navigate(`/relatorios?tag=${...}&rel=${...}`)}
```

O comentário logo acima diz "a tela legada já sabe fazer isso a partir da TAG".
Mas com a flag LIGADA a rota `/relatorios` **sempre** renderiza `RelatoriosV9` —
o `modo` é decidido uma vez pela flag e nunca pelos parâmetros da URL. E a V9 lê
apenas `q`, `tipo`, `de` e `ate`: `tag` e `rel` são ignorados. A navegação troca a
query string e re-renderiza a mesma tela.

Ou seja: **com a 9E ligada não existe caminho para abrir um relatório arquivado.**

Isso reprova o critério explícito do roteiro — "clicar explicitamente em pelo menos
um relatório arquivado real e confirmar: abre o `pdfRef` existente". Não dá para
confirmar o que não abre.

Vale registrar o que o defeito **não** é: nada foi corrompido. A tela nunca chegou
a tocar em PDF nenhum (zero requisições), então nenhum `pdfRef` foi resolvido,
nenhum arquivo foi regenerado e nenhum SHA-256 mudou. O defeito é de navegação,
e a correção é só de front — o SQL e a projeção estão certos.

---

## Passos 12–14 — rollback ON → OFF ✅

```sql
select public.definir_busca_v9('99f642d3-6efd-446d-9e76-d234ad8d211c'::uuid, false);
```

Estado depois, medido em produção:

| Conferência | Valor |
|---|---|
| `org_sync where busca_v9` | **0** |
| `org_sync where boot_v9` | **2** (intacto — 9D não foi afetada) |
| `org_sync` total | 30 |
| `relatorios_index` | **23** linhas |
| `equipamentos_index` | **17** linhas |
| `calibracoes_index` | **18** linhas |
| índices `relatorios_index*` | **6** |

E na tela: `/relatorios` voltou a ser a tela legada — lista "Equipamentos
Cadastrados", sem campo de busca, com os mesmos **3** relatórios da linha de base
(1 + 0 + 2 + 0). Idêntica ao passo 8.

Portanto o rollback cumpriu as quatro exigências: **sem** migração reversa, **sem**
perda de dados, **sem** remoção de índices, **sem** alteração de PDF. E sem impacto
em outra organização — as outras 29 nunca tiveram a flag ligada.

> **Por que desligar basta:** a projeção é DERIVADA e a tela nova é só uma leitura
> diferente da mesma verdade. `app_storage` nunca deixou de ser a fonte, e a 9E
> jamais escreve. Desligar não desfaz nada porque nada foi feito.

---

## Nota de operação: o SQL Editor do Supabase travou no meio

Durante os passos 12–14 o SQL Editor passou a **exibir o resultado anterior** depois
de rodar uma consulta nova, e a caixa de texto parou de aceitar digitação depois da
primeira execução em cada aba. Isso quase produziu um erro caro: a primeira leitura
do rollback mostrava `busca_on: 1` — o resultado VELHO — dando a impressão de que o
rollback tinha falhado, quando na verdade a consulta nem havia rodado.

**Regra para a próxima vez:** conferir as COLUNAS do resultado, não só os valores. Se
os nomes das colunas não são os da consulta que você acabou de escrever, o painel
está velho — abra uma aba nova do navegador em vez de insistir na mesma.

---

## Veredito

**9E = BLOQUEADA ❌**

Bloqueio único e específico: `aoAbrir` não abre. Tudo mais que o roteiro pedia foi
medido e passou — SQL, índices, RLS, bundle, flag por organização, busca visível,
`Sem data`, termo inexistente, zero PDF, rollback limpo.

Para desbloquear, a V9 precisa de um caminho real até o documento arquivado —
resolver `pdfRef` ela mesma no `VisualizadorPdf`, em vez de delegar a uma tela que
a flag impede de existir.
