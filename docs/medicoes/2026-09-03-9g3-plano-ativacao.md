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

## 1 · Pré-condições, por organização — REGRA OBRIGATÓRIA

> **APROVADA COMO REGRA EM 03/09/2026, depois do achado da onda 1.**
> Antes de ligar QUALQUER flag para QUALQUER organização:
>
> 1. executar `auditar_projecao('<ORG>')`;
> 2. **exigir `convergiu = true`**;
> 3. **`busca_pendencias = 0` é evidência COMPLEMENTAR, nunca prova de cobertura.**
>
> **Organização divergente NÃO é ativada.** Repara-se primeiro
> (`reparar_divergencias`), reaudita-se, e só então liga.

**Por que a regra existe, e não é teoria:** em 03/09/2026 sete organizações
estavam com a projeção parada — `cmam.caldeiras` com **1 equipamento de 39** — e
`busca_pendencias` marcava **zero** nas trinta. A tabela de pendências registra o
que FALHOU ao projetar; organização cujo dado nunca passou pelo caminho de
projeção não gera pendência nenhuma. Zero ali significa "nada falhou", não "está
tudo projetado".

Além da regra acima, conferir:

4. as migrações de segundo plano dela **concluíram** — é pré-condição declarada
   do `boot_v9` desde a 9D, porque no boot leve elas não rodam e uma migração
   pela metade se marca como feita;
5. a organização **não é** `EQUIPE TESTE` nem nenhuma conta em uso naquele
   momento em campo.

---

## 2 · A SEQUÊNCIA FINAL — seis ondas, oito flags

**São SEIS ondas.** A confusão possível é contar *flags* como se fossem ondas:
as ondas 2 e 3 levam duas flags cada, porque são telas de mesmo risco que não
vale separar. Oito flags, seis ondas.

As telas de LISTA erram para o lado barato (lentidão, lista vazia visível). O
`boot_v9` erra para o lado caro, porque muda o que existe no cache de todo o
resto. Por isso ele é o ÚLTIMO.

| # | onda | flags | estado em 03/09/2026 | por quê nesta posição |
|---|---|---|---|---|
| **1** | `/equipamentos` | `busca_v9` | **EM CURSO — 2 de 30** | a mais antiga, a mais medida, e a tela onde um erro é imediatamente visível |
| **2** | `/inspecoes` + `/prontuarios` | `inspecoes_v9`, `prontuarios_v9` | 0 de 30 | listas simples, sem artefato imutável envolvido |
| **3** | `/calibracoes` + `/relatorios` | `calibracoes_v9`, `relatorios_v9` | 0 de 30 | listas que semeiam por TAG; o risco é "semear antes de ler", já exercitado |
| **4** | `/livro-registro` | `livro_v9` | 0 de 30 | o Livro é lacrado; a lista é catálogo, mas o documento é registro técnico |
| **5** | painel | `vencimentos_v9` | 0 de 30 | `/dashboard` e `/vencimentos`; daqui em diante a conta não calcula nada localmente |
| **6** | boot | `boot_v9` | **2 de 30** (desde a 9D) | o cache deixa de ter a organização. Só depois de 1–5 estáveis em 30/30 |

Depois das seis, e **só com autorização explícita**:

| # | etapa | natureza |
|---|---|---|
| **7** | remoção das oito flags e dos caminhos legados | **NÃO é onda de ativação. É irreversível.** Ordem: cliente → testes → SQL |

### Dentro de cada onda

Três degraus, sempre os mesmos:

| degrau | quem entra |
|---|---|
| **a** | a organização de teste (`teste@gmail.com`) |
| **b** | uma conta pequena e real |
| **c** | as demais, até 30/30 |

A onda 1 está no degrau **b** concluído: `teste@gmail.com` e `gabriel.dadona`
(as duas que já tinham `boot_v9`). Falta o degrau **c** — 28 organizações.

**Gate do degrau c:** o piloto (a+b) precisa de **pelo menos 48 h no ar com uso
real** antes de ampliar para as demais. É menor que o gate de onda (7 dias)
porque aqui a pergunta é outra — "o caminho novo funciona nesta versão do
código?", não "o caminho novo aguenta uma semana de trabalho?". Sem essa linha, o
degrau c viraria "ampliar assim que der", que é o oposto de rollout gradual.

### Por que as ondas não são paralelizadas

As telas são independentes; a razão de serializar não é dependência técnica, é
**atribuição**. Ligar duas ondas na mesma semana e receber uma queixa deixa duas
suspeitas e nenhuma resposta. Uma variável por vez é o que torna a queixa
diagnosticável.

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

### O calendário que isso produz

| | |
|---|---|
| ondas | 6 |
| gate por onda | 7 dias corridos |
| **até 30/30 nas seis ondas** | **42 dias** — de 03/09/2026 a **~15/10/2026** |
| + a rodada de remoção (etapa 7) | 1 sessão de trabalho |
| **total** | **~43 dias** |

O modelo é: dia 0 da onda liga os degraus **a** e **b** (piloto), o gate de 7
dias corre com o piloto no ar e a ampliação para 30/30 acontece dentro da mesma
janela quando os sinais do §3 estiverem limpos. Onda seguinte no dia 7.

**O que encurtaria:** rodar duas ondas em paralelo — e o preço está no §2, "por
que as ondas não são paralelizadas". Não vale.

**O que alongaria:** qualquer queixa de dado sumido reinicia o gate daquela onda.

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
