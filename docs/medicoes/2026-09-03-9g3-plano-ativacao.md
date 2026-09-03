# 9G.3 — ativação gradual e remoção dos caminhos legados (PLANO, não executado)

**03/09/2026.** Escrito ao fim do rollout da 9G.1/9G.2, com a Fase 9 inteira
implantada e **todas as flags de tela em OFF**. Este arquivo é o roteiro da
última etapa; nada dele foi executado.

> **A ORDEM É A ENTREGA.** Ligar as flags é reversível; remover os caminhos
> legados não é. A 9G.3 só começa a segunda metade quando a primeira estiver
> estável — e "estável" aqui é um número, não uma impressão.

---

## 0 · Onde estamos

| flag | organizações ON | o que ela liga |
|---|---|---|
| `v2_ativa` | **30 de 30** | armazenamento v2 (não é da Fase 9) |
| `boot_v9` | **2** | boot leve |
| `busca_v9` | 0 | `/equipamentos` pela projeção |
| `inspecoes_v9` | 0 | `/inspecoes` |
| `prontuarios_v9` | 0 | `/prontuarios` |
| `calibracoes_v9` | 0 | `/calibracoes` |
| `livro_v9` | 0 | `/livro-registro` |
| `vencimentos_v9` | 0 | painel de `/dashboard` e `/vencimentos` |
| `relatorios_v9` | 0 | catálogo de `/relatorios` |

A 9G.2 **não tem flag** e já vale para todas — a segurança dela é a paridade
provada e o rollback de um arquivo.

---

## 1 · Pré-condições, por organização

Antes de ligar QUALQUER flag numa organização, conferir **no servidor**:

1. `auditar_projecao('<ORG>') ->> 'convergiu' = true` — a projeção reflete a
   verdade. Sem isso, a tela nova mostra menos do que a antiga;
2. `busca_pendencias` da organização = **0**;
3. as migrações de segundo plano dela **concluíram** — é pré-condição declarada
   do `boot_v9` desde a 9D, porque no boot leve elas não rodam e uma migração
   pela metade se marca como feita;
4. a organização **não é** `EQUIPE TESTE` nem nenhuma conta em uso naquele
   momento em campo.

---

## 2 · A ordem de ativação — a menos arriscada primeiro

As telas de LISTA erram para o lado barato (lentidão, lista vazia visível). O
`boot_v9` erra para o lado caro, porque muda o que existe no cache de todo o
resto. Por isso ele é o ÚLTIMO.

| onda | flags | por quê nesta posição |
|---|---|---|
| 1 | `busca_v9` | a mais antiga, a mais medida, e a tela onde um erro é imediatamente visível |
| 2 | `inspecoes_v9`, `prontuarios_v9` | listas simples, sem artefato imutável envolvido |
| 3 | `calibracoes_v9`, `relatorios_v9` | listas que semeiam por TAG; o risco é "semear antes de ler", já exercitado |
| 4 | `livro_v9` | o Livro é lacrado; a lista é catálogo, mas o documento é registro técnico |
| 5 | `vencimentos_v9` | o painel; a partir daqui a conta não calcula mais nada localmente |
| 6 | `boot_v9` | o cache deixa de ter a organização. Só depois de 1–5 estáveis |

Dentro de cada onda: **uma organização por vez**, começando pela de teste, depois
uma conta pequena e real, depois o resto.

---

## 3 · O que "estável" significa — os números que liberam a onda seguinte

Uma onda só avança quando, para as organizações já ligadas:

| sinal | limite |
|---|---|
| queixa de dado que sumiu | **zero** — é o defeito que a fase inteira existe para não causar |
| `busca_pendencias` | 0 |
| `auditar_projecao` | `convergiu: true` |
| escritas recusadas em `app_storage` | nenhuma nova |
| tempo em observação | **7 dias corridos** com uso real |

Sete dias porque o ciclo de trabalho do usuário é semanal: inspeção em campo,
escritório depois. Um defeito que só aparece ao gerar o relatório da semana não
aparece em dois dias.

---

## 4 · Rollback, por nível

| nível | ação | custo |
|---|---|---|
| uma tela, uma org | `definir_<flag>(org, false)` | segundos; a tela volta ao caminho antigo no boot seguinte |
| uma tela, todas | o mesmo, em laço | minutos |
| a 9G.2 | reaplicar `supabase/vencimentos_agregado.sql` | um arquivo |
| o front | redeploy do commit anterior no Coolify | minutos |

**A regra da disjunção continua valendo:** desligar `vencimentos_v9` numa
organização com `boot_v9` ligada NÃO devolve o painel ao caminho local — e é o
comportamento correto. Para devolver, desliga-se o boot leve.

---

## 5 · A remoção — só depois de 30/30 estáveis

Quando as oito flags estiverem ON nas 30 organizações e o §3 tiver sido
satisfeito na última onda:

1. **primeiro o código do cliente**: apagar os componentes legados de cada tela,
   `listarEquipamentos()`, `montarResumo()`, o caminho local de
   `carregarPainel`, `modoHidratacao` com a resposta `completa`, e os OITO
   degraus de `sincronizarFlagDoServidor`;
2. **depois os testes que existem só para o caminho antigo** — e NÃO os que
   travam regra (`vencimentosFatos`, `listaSemParse`, `somenteLeituraDoc`);
3. **por último o SQL**: `drop function definir_<flag>` e
   `alter table org_sync drop column <flag>`, oito vezes.

Nessa ordem porque um bundle que ainda lê uma coluna derrubada quebra o boot de
todo mundo, e um banco sem a coluna com um bundle que a lê cai no degrau de
recuo — que existe exatamente para esse intervalo.

**`CHAVES_FLAG` sai junto**, e com ela a entrada correspondente em
`migracaoV1.PRESERVADAS` — mas só quando não sobrar flag nenhuma.

---

## 6 · O que NÃO entra na 9G.3

- **A medição mensal de egress.** Ela é acompanhamento pós-rollout, não critério
  de encerramento técnico: o ciclo de faturamento é de 30 dias e a fase não pode
  ficar aberta esperando um extrato. Fica registrada como pendência de
  observação, com o número de referência a bater: o ciclo de ago/set fechou em
  **8,32 GB contra 5 GB de cota**, e a parte que era gate de laboratório
  (~1 GB/dia nos dias de gate) já saiu por construção — o que resta medir é o
  efeito das telas nos clientes.
- **Qualquer coisa da Fase 10.**
