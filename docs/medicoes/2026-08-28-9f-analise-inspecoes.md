# Fase 9 · 9F.1 — `/inspecoes`: o caminho atual, medido (28/08/2026)

Primeira tela da 9F, na ordem do desenho (§14, prioridade 3). **Nada foi alterado
ainda**: este documento é o AS-IS e o escopo proposto. Nenhuma flag foi tocada,
nenhum PDF regenerado, nenhuma organização cliente habilitada.

---

## 1 · O que a tela faz hoje

`src/pages/Inspecoes.tsx` (216 linhas) tem duas telas dentro dela:

1. **lista de equipamentos** — `listarEquipamentos()`, um cartão por equipamento,
   com foto, categoria, PMTA e um badge "**N Inspeções**";
2. **containers da TAG escolhida** — `listarContainers(tag)`, um cartão por
   container de inspeção.

Sem campo de busca, sem filtro, sem paginação. Igual à `/relatorios` legada: é
**TAG-first**, e para achar um equipamento o usuário rola.

---

## 2 · Três defeitos de escala, e o segundo é o caro

### 2.1 · A lista inteira, sem paginação

`listarEquipamentos()` monta um `EquipamentoResumo` para **cada** `nr13_info_` do
cache — lendo junto `nr13_cat_`, `nr13_calc_`, `nr13_fotos_` e
`nr13_pref_unidade_`. É o mesmo padrão que a 9C tirou de `/equipamentos`, e que
`EquipamentosV9` + `buscaIndex` já resolvem lendo a projeção do servidor.

Medido agora na organização de teste: **4 equipamentos, 261 nós de DOM, 14 MB de
heap, `tem_campo_busca: false`**. É pequeno porque o parque é pequeno — o número
que importa é o da Fase 8, que reprovou a mesma classe de tela em 1.000 e em
51.000.

### 2.2 · O badge parseia o container INTEIRO, duas vezes por cartão

```jsx
<span className={`badge-relatorios ${listarContainers(eq.tag).length > 0 ? 'tem' : ''}`}>
  {listarContainers(eq.tag).length} Inspeções
</span>
```

`listarContainers(tag)` é `JSON.parse` de `nr13_docs_<TAG>` — o container com
`dados`, que é o blob preenchido de cada formulário de campo. **Chamado duas
vezes por cartão, dentro do render**, e de novo a cada re-render.

**Peso real da família, medido em produção hoje:**

| | |
|---|---|
| chaves `nr13_docs_` | **27**, em 10 organizações |
| total | 307,7 KB |
| **média por TAG** | **11,4 KB** |
| p95 | **71,8 KB** |
| maior | **117,3 KB** |

Projetando com a média medida: **1.000 equipamentos × 11,4 KB × 2 = ~22 MB de
`JSON.parse` por render**, só para escrever um número no badge. Na cauda (p95),
~140 MB. Isto é o parente do achado *"tirar `listarCalibracoes` do render"* que o
plano já previa para `/calibracoes` — só que aqui a estrutura lida é a mais
pesada do sistema.

> A família já foi aliviada uma vez: as fotos de campo saíram para o bucket em
> 11/08 (751 KB → ~6 KB por TAG naquela conta). Os 11,4 KB de hoje são
> **metadados** — o que sobra depois da migração. O defeito não é o tamanho do
> dado; é ler o dado inteiro para contar itens de um array.

### 2.3 · `lerTudo()` desfaz o boot leve da 9D

`listarEquipamentos()` começa com `await lerTudo()`. Na v2 isso é **hidratação
completa** (incremental por marca d'água, mas completa na primeira vez).

Sob `boot_v9`, `hidratarEssencial()` traz 7 chaves globais e 2 prefixos —
`nr13_info_` **não** está entre elas, de propósito. Então a tela precisa de
`lerTudo()` para ter o que mostrar, e o ganho medido da 9D (**boot 20 KB × 354
KB**) é desfeito na primeira visita a `/inspecoes`.

**Não é exclusivo desta tela:** `Prontuarios.tsx`, `Calibracoes.tsx` e a
`/relatorios` legada chamam o mesmo `listarEquipamentos()`. É o mesmo defeito,
quatro vezes — e é por isso que a 9F existe.

> **Achado lateral, registrado e NÃO corrigido aqui:**
> `carregarEquipamento(tag)` — a semeadura sob demanda que o desenho §4 chama de
> "estratégia oficial de compatibilidade", com teste próprio
> (`carregamentoSobDemanda.test.ts`) — **não é chamada por nenhuma tela**. Só o
> teste a exercita. É a mesma forma do defeito da 9D (`sincronizarFlagDoServidor`
> pronta e sem chamador) e do §2-ter do CLAUDE.md. Hoje isso está MASCARADO
> porque `lerTudo()` traz tudo; no dia em que a 9F tirar o `lerTudo()` das telas,
> essa semeadura passa a ser obrigatória. **Entra como tarefa da 9F.1, não como
> conserto avulso.**

---

## 3 · O que a 9F.1 propõe

Mesmo molde da 9E: **flag por tela**, tela nova ao lado da antiga, rollback =
desligar a flag.

| # | Mudança | Por quê |
|---|---|---|
| 1 | Catálogo vem do SERVIDOR (`buscaIndex`), com busca, keyset e virtualização | reuso do que a 9C já validou; acaba com a lista inteira no DOM |
| 2 | **Badge de contagem sem parsear o container** | é o defeito 2.2 |
| 3 | `carregarEquipamento(tag)` passa a ser chamado ao escolher a TAG | sem `lerTudo()`, o cache da TAG precisa ser semeado — senão a tela de containers abre vazia |
| 4 | A tela de containers continua lendo `nr13_docs_<TAG>` **daquela TAG** | uma TAG por vez, sob demanda: é leitura legítima, não varredura |

### O badge — três caminhos, e a recomendação

| | Como | Custo por página | Contra |
|---|---|---|---|
| **A (recomendado)** | coluna `inspecoes integer` em `equipamentos_index`, projetada de `nr13_docs_<TAG>` | **zero** — vem junto com a linha | mexe na projeção; exige reprojetar |
| B | RPC agregada `contar_inspecoes(tags[])` por página | ~570 KB lidos no servidor por página (50 × 11,4 KB), toda vez | repete o trabalho a cada rolagem |
| C | tirar a contagem da lista | zero | perde informação que hoje aparece — decisão de produto, não técnica |

**Recomendo A**, e ela é barata porque a porta já existe: `projetar_chave`
(`busca_index_rpc.sql`) já mapeia família → TAG → `projetar_equipamento`.
Acrescentar `nr13_docs_` é **uma linha** no mesmo `elsif`, e a contagem é
`jsonb_array_length` dentro de `projetar_equipamento`. O número no badge passa a
ser um inteiro de 4 bytes que viaja com a linha do catálogo.

> **A regra da 9E vale aqui:** ausente **não** vira zero. Numa organização cuja
> projeção ainda não foi refeita, `inspecoes` vem `null` — e `null` significa
> "não sei", não "nenhuma inspeção". O badge omite o número em vez de afirmar 0.

---

## 4 · Como isto vai ser testado

**Antes de mudar a tela** (disciplina da 9E — teste primeiro, e ele falha antes):

| Nível | O que trava |
|---|---|
| unidade (vitest) | contagem de inspeções por TAG a partir da projeção; `null` ≠ `0` no rótulo do badge; ordem/estado na URL |
| unidade | o serviço da tela nova **não** chama `lerTudo()` (mesma instrumentação do `buscaRelatorios.semPdf.test.ts`, que reprova se uma porta proibida do cliente for tocada) |
| SQL (`scripts/fase9/`) | `projetar_equipamento` conta o array de `nr13_docs_`; container adicionado/removido reprojeta; org sem a chave devolve `null`, não `0`; isolamento entre organizações |
| navegador (laboratório) | 1k / 10k / 50k equipamentos: nós de DOM constantes, heap estável, **zero leitura de `nr13_docs_` na lista** |
| produção (só depois da sua aprovação) | roteiro com flag ON na organização de TESTE, paridade de contagem contra a tela antiga, e rollback |

**Benchmark:** `explain (analyze, buffers)` do catálogo com e sem a coluna nova,
como na 9E.2 — a coluna não pode piorar a consulta que já foi medida.

---

## 5 · O que esta etapa NÃO faz

- não habilita `busca_v9` nem flag nenhuma em organização cliente;
- não toca `cmam.caldeiras`;
- não inicia 9G, Fase 10 nem PDF vetorial;
- não apaga nem regenera PDF histórico;
- não reabre a 9E: as duas limitações declaradas no fechamento
  (cache frio sob `boot_v9`; paginação/keyset não exercitada na org de teste)
  **continuam registradas como não exercitadas**.
