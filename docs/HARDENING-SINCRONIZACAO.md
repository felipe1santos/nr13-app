# Hardening da sincronização — varredura de hidratação e merge por item

> **Rodada local. Nada foi publicado, nenhum dado real foi alterado e o conflito
> de `nr13_pront_indice` na conta de teste continua intacto.**

---

## 1 · Varredura de hidratação

Cruzamento de `familiasChave.ts` × `essencial.ts` × writers × catálogos por TAG.

### 1.1 · Chaves-lista GLOBAIS

| chave | é lista? | escrita localmente? | hidratada antes? | pode nascer com `versaoBase=0`? | risco |
|---|---|---|---|---|---|
| `nr13_lista_phs` | sim | sim | sim (essencial) | **só se o boot falhar** | médio |
| `nr13_clientes` | sim | sim | sim (essencial) | só se o boot falhar | médio |
| `nr13_agenda_notas` | sim | sim | sim (essencial) | só se o boot falhar | baixo |
| `nr13_rascunhos` | sim | sim | sim (essencial) | só se o boot falhar | **alto** |
| `nr13_pront_indice` | sim | sim | sim (essencial **desde 20/09**) | **ACONTECEU** | **alto** |
| `nr13_relatorios_arquivados` | sim (ids) | sim | sim (essencial) | só se o boot falhar | baixo |
| `nr13_historico_relatorios` | sim | **não** (só leitura, legado) | não | não | nenhum |
| `nr13_predef_relatorio` | sim | sim | **não** | **sim** | médio |

### 1.2 · Chaves-lista POR TAG

Todas ficam fora do `essencial` por construção — elas crescem com o parque. A
semeadura vem dos **catálogos**, que chamam `carregarEquipamento(tag)` ao abrir
a tela daquele equipamento:

`catalogoCalibracoes.ts` · `catalogoInspecoes.ts` · `catalogoLivro.ts` ·
`catalogoProntuarios.ts` · `catalogoRelatorios.ts` · `aberturaFicha.ts`

| chave | semeada por | risco |
|---|---|---|
| `nr13_calibracoes_<TAG>` | catálogo de calibrações | baixo |
| `nr13_docs_<TAG>` | catálogo de inspeções | baixo |
| `nr13_historico_indice_<TAG>` | catálogo de relatórios | baixo |
| `nr13_componentes_cal_<TAG>` | catálogo de calibrações | baixo |
| `nr13_lotes_cal_<TAG>` | catálogo de calibrações | baixo |
| `nr13_livro_<TAG>` | catálogo do livro | baixo |

**Observação importante:** **nenhum dos services de lista semeia por conta
própria** — `indiceProntuarios.ts`, `rascunhos.ts`, `calibracaoService.ts` e
`inspecaoService.ts` têm zero chamadas a `carregarEquipamento`. A garantia está
na TELA que os precede. Isso funciona hoje porque não há escrita fora desse
caminho, mas é uma garantia por convenção, não por construção.

### 1.3 · Onde a regra "cache miss ≠ inexistente" ainda é violada

1. **Boot essencial que falha** — `bootArmazenamento.hidratarNoBoot` captura a
   exceção e devolve `falhou: true`, e o app **abre assim mesmo** (decisão
   correta: melhor abrir com o que há do que travar em "Carregando…"). Mas
   depois disso, a primeira escrita numa chave-lista global ausente cria do zero
   com `versaoBase: 0`. **É a causa exata do conflito real medido.**
2. **`nr13_predef_relatorio`** — chave-lista global **fora** do `essencial`.
3. **Services que escrevem sem semear** — a convenção acima.
4. **Nenhum ponto do sistema faz lookup dirigido antes de criar** uma chave
   sincronizada. O único lugar onde esse padrão existe é o que foi criado na
   rodada passada (`aberturaRelatorio.ts`) e o `aberturaFicha.ts` (§3-ter).

**Correção proposta (não implementada nesta rodada):** um
`garantirColecao(chave)` que, antes da primeira escrita de uma chave do
catálogo, faça `semearEquipamentoDetalhado([chave])` quando ela não estiver no
cache. É o mesmo desenho de `abrirRelatorio`, aplicado à escrita.

---

## 2 · Arquitetura nova (implementada: o núcleo)

### 2.1 · Catálogo explícito — `src/services/colecoes.ts`

Dez coleções declaradas, cada uma com a função que extrai o **id estável** do
item. Nada de heurística espalhada; `colecaoDaChave()` é o único ponto de
decisão. `nr13_relatorios_arquivados` e `nr13_historico_relatorios` ficam
**fora**, declaradamente — a primeira é um conjunto de ids (merge = união, sem
tombstone), a segunda é legado só-leitura.

### 2.2 · Tombstone POR ITEM — sem SQL

**O tombstone mora dentro do item** (`removidoEm`), não numa tabela nova.

Isso é possível porque a lista já é um blob JSON numa chave: o tombstone viaja
pelo mesmo caminho do resto, e **o servidor não precisa saber de nada**. Excluir
passa a ser `marcarRemovido(item, quando)`; as telas leem por `visiveis(lista)`.

**Por que isso importa:** sem tombstone, um aparelho offline que ainda tem o
item C o manda de volta e o merge — que só sabe unir — **ressuscita C**. Há um
teste que demonstra exatamente isso no modelo antigo.

O carimbo é passado por quem chama, nunca lido de `Date.now()` dentro do módulo:
ele serve para o merge saber que houve remoção deliberada, **não** para decidir
quem ganhou. O relógio do dispositivo continua sem autoridade.

### 2.3 · Merge de TRÊS vias

`mesclarColecao(local, servidor, idDe, base?)`.

A terceira via (`base` = a coleção que o aparelho conhecia ao começar a editar)
é o que separa dois casos que, de fora, são idênticos:

- **local ≠ base** → eu alterei de verdade;
- **local = base** → eu só tenho a cópia velha; o servidor mudou durante o
  offline e a versão dele vence **sem ambiguidade**.

Sem base, o merge é **conservador**: o servidor fica e a divergência é nomeada.
Nada se perde (o valor local continua na store de conflitos), mas a decisão
volta ao usuário.

**Nenhum relógio é consultado.** A comparação é de conteúdo contra a base.

| situação | resultado | automático? |
|---|---|---|
| item só no servidor | fica | sim |
| item só no local (criação offline) | entra | sim |
| item igual nos dois | fica | sim |
| tombstone de qualquer lado | fica REMOVIDO | sim |
| local = base, servidor mudou | servidor vence | sim |
| servidor = base, local mudou | **local vence** | sim |
| os dois mudaram | servidor fica + `ambiguos` | **não** (§10) |

### 2.4 · Fila — o que ainda NÃO mudou

A fila continua mandando o blob (`op: 'set' | 'del'`). **Isso é deliberado**:
capturar a `base` por coleção é a mudança que falta, e ela mexe no formato da
fila — a parte que não dá para validar sem produção.

Por isso **o merge automático não foi ativado**, exatamente como pedido: A
(operação por item) e B (tombstone) precisam entrar juntos, e A está pela
metade. O que existe é o núcleo puro, provado, pronto para ser ligado.

**Compatibilidade planejada:** o item de fila ganharia `base?: string` opcional.
Item antigo (sem `base`) cai no merge de duas vias — conservador, nunca
destrutivo. Nenhuma migração, nenhum cliente quebrado.

---

## 3 · Casos de teste (26, todos passando)

| cenário | resultado |
|---|---|
| §11 · servidor `A B C D E`, local só `C` | `A B C D E` — resolve sozinho |
| §11 · `C` alterado offline | `A B C D E` com `C` nomeado (sem base) |
| §12 · `C` excluído no servidor | `C` **não ressuscita** |
| §12 · sem tombstone | demonstra a ressurreição que o modelo antigo permite |
| §13 · `D` criado offline | `A B C D`, nunca `D` sozinho |
| §14 · PC altera `A`, celular altera `C` | `A_novo B C_novo`, **sem decisão manual** |
| caso real `nr13_pront_indice` | os **5** voltam, os 2 emitidos incluídos, resolve sozinho |

Mais: idempotência, ordem do servidor preservada, item sem id nunca descartado,
listas vazias/ausentes.

---

## 4 · Performance (medido, não otimizado)

Teste com 60 itens de índice: o blob é **mais de 20×** maior que um item. Hoje
alterar um item reenvia a lista inteira. Com operação por item, o payload cai
para a ordem de um item. A medição fica registrada; a otimização é de outra
rodada.

---

## 5 · Migration

**Nenhuma.** O tombstone por item vive dentro do blob, então não há schema novo,
índice novo, RLS novo nem RPC nova. Se um dia o servidor precisar **validar** o
tombstone (hoje ele não precisa, porque o merge é do cliente), aí sim haveria
SQL — e não é o caso desta entrega.

---

## 6 · Riscos e pendências

**Riscos**
1. A lista cresce com tombstones. Precisa de poda por idade — não implementada.
2. `visiveis()` precisa ser adotado por **todos** os leitores de cada coleção
   antes de a exclusão passar a marcar em vez de remover. Trocar a exclusão
   antes disso faria itens excluídos reaparecerem nas telas.
3. Merge de duas vias (sem base) devolve mais casos ao usuário do que o ideal —
   é conservador de propósito, mas não é a experiência final.

**Pendências, na ordem**
1. Capturar `base` na fila (destrava o §14 no mundo real);
2. `garantirColecao()` antes da primeira escrita — fecha a causa raiz;
3. Adotar `visiveis()` nos leitores e trocar a exclusão por `marcarRemovido`;
4. Poda de tombstones;
5. Só então ativar o merge automático na resolução de conflito;
6. Field merge (§10) fica para depois.

---

*22/09/2026. Núcleo implementado e testado; integração com a fila e ativação do
merge automático dependem da sua revisão.*

---

# RODADA 3 — BASE NO ACK REAL, LEITORES FILTRADOS, PODA ADIADA (22/09/2026)

## 0 · A inconsistência do relatório anterior

O relatório da rodada 2 dizia, na mesma página, duas coisas incompatíveis:

> BASE — Atualiza: no ACK (estado confirmado).

> Pendência: registrar a base também no ACK da fila (hoje só na
> hidratação/lookup).

**A pendência era a linha certa.** O que existia:

| caminho | registrava a base? |
|---|---|
| `colecaoSync.lerColecao` (hidratação / lookup dirigido) | **SIM** — único escritor real |
| `colecaoSync.test.ts` → "o ACK move a base…" | chamava `registrarBase` **direto do teste** |
| `sync.enviarItem`, ramo `aplicado`/`repetido` (a FILA REAL) | **NÃO** — não tocava na base |

Ou seja: a regra estava escrita e provada em teste, e não estava ligada ao
produto. O ramo real fazia `gravarAtomico` da versão e `removerDaFila`, e nada
mais.

**Agora existe UMA regra, com um só dono:**

```
ACK real confirmado pelo servidor
  → versão local alinhada à do servidor
  → BASE daquela chave vira o estado confirmado
  → só então a mutação sai da fila
```

Escritores da base, e são só dois: `colecaoSync.lerColecao` (o servidor
respondeu com o valor) e `sync.enviarItem` (o servidor confirmou a mutação). A
base mudou de arquivo para isso ser possível: mora em `services/baseColecao.ts`,
que só depende de `db` e `cacheLocal` — `sync.ts` não podia importar
`colecaoSync.ts` sem criar o ciclo `sync → storage → storageV2 → sync`.

A base só é guardada para chaves do CATÁLOGO (`deveGuardarBase`). Guardar a de
toda chave dobraria o IndexedDB do aparelho — `nr13_rel_`, `nr13_fotos_` e
`nr13_inspecao_atual` passam de centenas de KB cada — e nada fora de uma lista
sabe o que fazer com uma base.

## 1 · O que NÃO avança a base

Erro de rede, timeout, conflito e recusa (qualquer motivo) não passam pelo ramo
do ACK. Nenhum deles toca na base, e a base de um ACK **anterior** também não é
desfeita por um conflito posterior — é exatamente o que o merge de três vias
precisa para saber que quem mexeu foi este aparelho.

Um `del` confirmado **esquece** a base em vez de gravar `{versao, valor: ''}`:
lista vazia é um estado legítimo, diferente de "a chave não existe".

### O achado do caminho: `repetido` mascarava conflito e recusa

A RPC, no caminho rápido de idempotência, faz:

```sql
return v_res || jsonb_build_object('status','repetido');
```

O `||` do jsonb **sobrescreve** o status guardado. Um `mutationId` que da
primeira vez deu **conflito** ou **recusa** volta, no reenvio, dizendo
`repetido` — e o cliente tratava isso como ACK: carimbava a versão do servidor
sobre o valor local e removia a mutação da fila.

O código se defendia disso por ESTADO (`tentarNovamente` recusa item em
conflito), mas `falha_definitiva` não tinha defesa nenhuma: "tentar de novo"
numa recusa por permissão apagava a pendência em silêncio.

`contratoRpc.interpretarResposta` passou a ler a resposta pelo que ela
**carrega**, que é prova e não convenção:

| resultado guardado | o payload traz | virou |
|---|---|---|
| aplicado | só `status` + `versao` | `repetido` genuíno (ACK) |
| conflito | `valor` / `atualizado_em` / `dispositivo` | `conflito` |
| recusado | `motivo` | `recusado` |

É isso que torna seguro avançar a base num `repetido`.

## 2 · Inventário dos consumidores das 10 coleções

Varredura em `src/`, `public/` e `supabase/functions/`. "Leitor funcional" =
quem materializa a lista para mostrar, contar, oferecer ou calcular.

| coleção | leitor funcional (porta) | outros consumidores |
|---|---|---|
| `nr13_pront_indice` | `prontuarios/indiceProntuarios.listarDocumentos` | tela `/prontuarios`; `essencial` (boot), `familiasChave` (classificação) |
| `nr13_rascunhos` | `relatorios/rascunhos.listarRascunhos` | `RelatoriosV9` (tela), `arquivados`, `historicoRelatorios` (escritor) |
| `nr13_lista_phs` | `cadastros/cadastroService.listarFuncionarios` | selector `calibracoes/responsavelCalibracao`; assinatura `pdfVetorial/modeloProntuario`; templates `public/rel-assinatura.js`, `public/pront-assinatura.js`, `LIVRO-REGISTRO.html`, `PRONT-P4.html` (via palco); `demoSeed`; Portal (`prefixos.ts`) |
| `nr13_clientes` | `cadastros/cadastroService.listarClientes` | `agenda/notasAgenda` (rótulo), `demoSeed` |
| `nr13_agenda_notas` | `agenda/notasAgenda.listarNotas` | Dashboard → Agenda |
| `nr13_historico_indice_` | `relatorios/historicoRelatorios.listarIndice` + `services/relatoriosLocais` (lista offline de `/relatorios`) | `equipamentoService` (semeadura), `aberturaRelatorio`, `vencimentos`, `palco`, Edges `portal_cliente`/`portal_arquivo` |
| `nr13_calibracoes_` | `calibracoes/calibracaoService.listarCalibracoes` | `services/vencimentos` (dashboard), `componentesService.validadesPorRelatorio`, `catalogoCalibracoes`, `certificadosVencimentos`, `Calibracoes.tsx`, `PortalAtivo.tsx`, `equipamentoService` (ids para semear), Edges do Portal |
| `nr13_docs_` | `inspecoes/inspecaoService.listarContainers` | `InspecoesV9`, `Relatorios.tsx` (wizard), `identificacaoEquipamento`, `buscaIndex` (projeção), `sync` |
| `nr13_componentes_cal_` | `calibracoes/componentesService.listarComponentes` | `Calibracoes.tsx`, `catalogoCalibracoes`, `recuperacaoArquivos` |
| `nr13_lotes_cal_` | `calibracoes/componentesService.listarLotes` | `Calibracoes.tsx`, `catalogoCalibracoes` |

**Fora do escopo funcional, de propósito:** `familiasChave` (tabela de escopo de
chave), `essencial` (lista do boot leve), `palco` (materialização para os
templates), `rotuloChave` (texto da tela de pendências),
`functions/*/prefixos.ts` (allowlist do Portal). Nenhum deles decide o que o
usuário vê numa lista; todos recebem a lista já filtrada de quem a lê.

**Os templates de `public/` não filtram, e não precisam:** o que chega neles
passou pelo palco, e o palco materializa o que o app leu.

## 3 · Leitores convertidos

A regra ficou em **uma** função, `colecoes.visiveis()`. Nenhum filtro por
`removidoEm` escrito à mão em tela ou serviço.

Convertidos (leitura filtrada):

`listarDocumentos`, `listarRascunhos`, `listarClientes`, `listarFuncionarios`,
`listarNotas`, `listarContainers`, `listarCalibracoes`, `listarComponentes`,
`listarLotes`, `listarResponsaveis` (selector), `listarIndice`,
`relatoriosLocais` (lista de `/relatorios`), `vencimentos` (dashboard),
`validadesPorRelatorio` e `modeloProntuario.assinantesDe` (assinatura do PDF).

**A armadilha que isso criou, e como foi fechada:** um escritor que lê a visão
filtrada e regrava **apaga o tombstone**. Por isso cada serviço ganhou um leitor
BRUTO privado (`clientesBrutos`, `funcionariosBrutos`, `notasBrutas`,
`calibracoesBrutas`, `containersBrutos`, `componentesBrutos`, `lotesBrutos`,
`lerIndice`, `lerCru`, `indiceReconciliado`), e são esses que os escritores
usam.

**O caso mais perigoso era o índice do histórico**, porque ele se REPARA: se o
índice não tem um relatório cujo registro `nr13_rel_` está no cache, ele o
recoloca. Sem tratamento, o próprio reparo desfaria toda exclusão, sem rede
nenhuma. `indiceReconciliado` monta um conjunto de `sepultados`, e o reparo —
por registro e por legado — o respeita.

## 4 · Exclusão

A decisão marcar-ou-tirar virou **um valor só**: `colecoes.TOMBSTONE_ATIVO`,
consumido por `excluirDaLista`/`excluirPorId` (síncrono, para os serviços) e por
`colecaoSync.removerDaColecao` (assíncrono, com lookup dirigido). Os
`filter((x) => x.id !== id)` dos escritores de coleção passaram a chamar essa
porta.

**`TOMBSTONE_ATIVO` está `false`.** Hoje a exclusão continua tirando o item da
lista, exatamente como sempre fez. Ligar é um passo, e ele já está coberto por
teste: `leituraVisivel.test.ts` e `tombstoneFimAFim.test.ts` provam o
comportamento marcado, inclusive o aparelho atrasado que não ressuscita o item.

**Ordem de ativação, que não se inverte:** leitores filtrados (feito) → base no
ACK (feito) → `TOMBSTONE_ATIVO` → `MERGE_AUTOMATICO_ATIVO`. O 3 antes do 1 faria
item excluído reaparecer na tela; o 4 antes do 3 ressuscita item excluído,
porque o merge só sabe unir.

## 5 · Durabilidade do tombstone

| pergunta | resposta |
|---|---|
| store nova? | **nenhuma** — é campo DO ITEM, dentro do array da chave |
| cliente | IndexedDB `nr13_dados_<org_id>`, store `dados`, chave da coleção |
| servidor | `app_storage.valor` da mesma chave, como o resto da lista |
| formato | `removidoEm: string` ISO |
| itemId | o id que o CATÁLOGO declara, nunca a posição no array |
| versão/base | a da CHAVE, em `baseColecao` — item não tem versão própria |

A store `tombstones` do IndexedDB **é de outra coisa**: a exclusão de uma CHAVE
inteira, que a RPC conhece e registra em `app_storage_excluidos`. Misturar as
duas criaria uma segunda fonte de verdade que o servidor não recebe, que o merge
consultaria à parte e que ficaria para trás do dado na primeira falha parcial de
transação.

**Migration: NENHUMA, nem local nem no servidor.** `removidoEm` é campo novo num
objeto JSON. Lista antiga não o tem, `removido()` responde `false`, e essa é a
leitura correta de "este item nunca foi excluído".

## 6 · Poda — infraestrutura e telemetria, sem remoção

`PODA_AUTOMATICA_ATIVA = false`. `podar()` é fail-closed: sem corte, ou com a
poda desligada, devolve a lista inalterada.

**Por que a poda por idade é insegura aqui:**

1. `removidoEm` é carimbado pelo dispositivo que excluiu. Relógio errado produz
   tombstone "antigo" no instante em que nasce.
2. Não existe piso de versão POR ITEM. A RPC mantém
   `app_storage_excluidos.versao_final` por CHAVE; dentro da lista não há nada
   equivalente. Sem piso, apagar o tombstone devolve a coleção ao estado
   anterior a esta rodada.
3. Não existe piso de TEMPO conhecido. O sistema é offline-first: não há limite
   superior demonstrável para "há quanto tempo o aparelho mais atrasado está sem
   sincronizar" — e a poda precisaria exatamente desse número.

**O que entregaria a poda com segurança** (desenho, não implementado): um CORTE
por coleção — a versão da chave a partir da qual todo aparelho ativo já
sincronizou. Exige que o tombstone guarde a VERSÃO em que nasceu e que o
servidor saiba a menor versão sincronizada entre os dispositivos da organização.
Nenhuma das duas é mudança local.

O que entrou: `estatisticaTombstones(lista)` — total, removidos, bytes e carimbo
mais antigo. Para responder com dado, e não com suposição, se o acúmulo chega a
ser um problema.

## 7 · Fila por item

`services/filaItem.ts`: `upsertItem`, `removeItem`, `aplicarItem`,
`reduzirParaBlob`. Funções puras, testadas, **sem nenhum importador em
produção** — há um teste que varre `src/` e quebra se aparecer um.

| estado | |
|---|---|
| implementada | **SIM** |
| integrada | **NÃO** |
| ativada | **NÃO** (`FILA_POR_ITEM_ATIVA = false`) |

Por que não ativar: a RPC do servidor grava o `valor` que recebe, não sabe
aplicar intenção. Ligar exigiria SQL novo (`aplicar_item_storage`, migration em
produção) ou reduzir a intenção a blob no cliente — que é o que
`reduzirParaBlob` faz, e é o caminho que uma rodada futura pode ligar agora que
a base é registrada por ACK.

## 8 · O que continua desligado

```
colecoes.TOMBSTONE_ATIVO            = false
colecoes.PODA_AUTOMATICA_ATIVA      = false
filaItem.FILA_POR_ITEM_ATIVA        = false
colecaoSync.MERGE_AUTOMATICO_ATIVO  = false
```

A tela manual de conflito não foi tocada. Nenhum conflito real foi resolvido.

## 9 · Pendências, na ordem

1. Ligar `TOMBSTONE_ATIVO` (a exclusão passa a marcar) — decisão sua;
2. Ligar `MERGE_AUTOMATICO_ATIVO` na resolução de conflito;
3. Poda: só com o corte por versão descrito no §6 — exige servidor;
4. Fila por item integrada: exige `aplicar_item_storage` no servidor, ou a
   redução a blob no cliente;
5. Field merge (divergência no mesmo CAMPO do mesmo item) segue com o usuário.

---

*22/09/2026. Base ligada ao ACK real; leitores filtrados; exclusão, poda, fila
por item e merge automático seguem desligados, aguardando sua revisão.*

---

# RODADA 4 — ENSAIO DE ATIVAÇÃO, SEM PUBLICAR (22/09/2026)

Objetivo: provar que `tombstone` e `mergeAutomatico` podem ser ligados. **Nada
foi ligado.** O código entregue continua com os três interruptores no padrão
desligado.

## 1 · Interruptores viraram estado, num lugar só

`services/flagsSync.ts`. Antes eram três `const` espalhados, e um `const` não
se simula: ou o teste mocka o módulo inteiro (e aí não testa o módulo) ou o
código de produção nasce ligado.

```
PADRAO_SYNC = { tombstone: false, mergeAutomatico: false, filaPorItem: false }
```

Quem liga é `definirFlagsSync`, e ela **recusa `mergeAutomatico` sem
`tombstone`** — é a única combinação capaz de apagar dado do usuário: o merge
une, o aparelho atrasado manda o item excluído de volta, e a exclusão é desfeita
sem ninguém pedir. Recusar na função é mais barato do que descobrir em produção.

Não há leitura de `localStorage`, de URL nem de variável de ambiente. Um
interruptor que se liga por parâmetro de query é o que se liga por engano.

## 2 · O merge automático foi INTEGRADO ao caminho real (e ficou desligado)

Até esta rodada `resolverAutomaticamente` existia e ninguém a chamava — ou seja,
não havia o que ensaiar. Agora o ramo `conflito` de `sync.enviarItem` chama
`resolverColecaoAutomaticamente` **antes** de `guardarConflito`.

Quando resolve: troca a mutação em conflito por uma NOVA, com o blob mesclado e
`versaoBase` = a versão que o servidor acabou de informar, numa transação só
(remover a velha e depois criar a nova deixaria uma janela em que a alteração do
usuário não está em fila nenhuma). Quando não resolve, devolve `false` e o fluxo
segue exatamente como hoje.

`services/mergeColecao.ts` é o módulo leve que decide — só `colecoes` e
`baseColecao`, para `sync.ts` não fechar o ciclo `sync → storage → storageV2 →
sync`. Devolve `null` (= "chame o usuário") em cinco situações: flag desligada,
chave fora do catálogo, lado não-array, item alterado nos dois lados, ou merge
que não mudaria nada.

**A base NÃO avança no merge.** O resultado é uma proposta deste aparelho até o
servidor confirmá-la; ela avança no ACK da mutação mesclada, como qualquer outra.

## 3 · O ensaio: dois aparelhos contra um servidor simulado

`services/ensaioAtivacao.test.ts` (38 testes). O servidor de teste reproduz
`aplicar_mutacao_storage` nas partes que decidem o desfecho — incluindo o
mascaramento `resultado || {'status':'repetido'}`. Um servidor de teste mais
gentil que o real prova a coisa errada.

"Trocar de aparelho" zera memória, fila, conflitos e IndexedDB, e semeia o cache
com o que aquele aparelho conhecia. O servidor sobrevive à troca.

| caso | cenário | resultado |
|---|---|---|
| **A** | servidor A B C; celular offline edita C | **A B C2**, sem conflito, base em v2 |
| **B** | PC edita A, celular edita C, ambos da base v1 | **A2 B C2**, sem pergunta |
| **C** | criação offline dos dois lados | **A B C D**, nunca "C sozinho" |
| **D** | PC exclui C; celular atrasado edita B | **A B2**, C não volta |
| **E** | mesmo item, mesmo campo | **conflito manual**, as duas versões guardadas |
| **F** | mesmo item, campos disjuntos | **conflito manual** — P2 declarado |

No caso D, testados também: F5, nova aba, segundo ciclo de sincronização, um
TERCEIRO aparelho que nunca soube da exclusão, e a sobrevivência do tombstone no
blob do servidor. Nenhum ressuscita C.

**O merge sobe no CICLO SEGUINTE de drenagem**, não no mesmo: `drenar` itera um
instantâneo da fila, e a mutação mesclada nasce durante a iteração. É o
comportamento correto (a drenagem seguinte é imediata), e está explícito no
helper `sincronizar`.

## 4 · `interpretarResposta` com a fila real

| situação | resultado |
|---|---|
| ACK aplicado | base avança, fila esvazia |
| ACK perdido + retry (mesmo `mutationId`) | `repetido` genuíno; servidor **não reaplica** (versão fica em 2), base avança, um único id usado |
| conflito | não é lido como repetido; item fica `conflito`, base intacta, não é retentado |
| recusa por permissão | `falha_definitiva`, pendência **não some**, base intacta |
| recusa MASCARADA de `repetido` | idem — desmascarada pelo campo `motivo` |
| `falha_definitiva` na drenagem seguinte | não gasta requisição |

## 5 · Tombstone ligado × telas

`leituraVisivel.test.ts` subiu para 52 testes. Com `tombstone: true`, exclusão
pelos escritores REAIS (`excluirCliente`, `excluirFuncionario`,
`removerContainer`, `excluirComponente`, `excluirLote`, `excluirCalibracao`):

- o item some de lista, contador, busca, selector e de `carregarContainer`;
- o bruto continua com 2 itens e o excluído carrega `removidoEm`;
- excluir duas vezes não duplica; salvar OUTRO item não ressuscita o excluído.

## 6 · As três coleções com histórico de problema real

`nr13_pront_indice`, `nr13_rascunhos` e `nr13_historico_indice_<TAG>` foram
testadas com o defeito ORIGINAL reproduzido: cache vazio, alguém conclui "não
existe" e grava um item só com `versaoBase: 0` contra um servidor na versão 6.

Com o merge ligado o desfecho deixa de ser "escolha entre perder quatro e perder
nada": os cinco continuam lá, o novo entra, e o ciclo seguinte já usa a base
confirmada — sem repetir o conflito.

## 7 · Offline com persistência real

Rede caída (a requisição não sai), criação + edição + exclusão offline,
`zerarMemoria` + `hidratarDoDisco` + `carregarFilaDoDisco` simulando fechar e
reabrir, e então a rede volta. A pendência e o dado sobrevivem ao reload, e a
conciliação fecha em **A B D** com a fila vazia.

Não foi exercitado num navegador real — o ensaio roda sobre o IndexedDB de
teste, que é o mesmo código do app, mas não é o mesmo ambiente.

## 8 · Dois achados do próprio ensaio

**1. Falso positivo de ressurreição, causado pelo harness.** `rpc.mockClear()`
zera chamadas e PRESERVA implementações — inclusive um `mockImplementationOnce`
que o teste anterior enfileirou e não consumiu. O "offline" de um teste vazava
para o seguinte e produzia um C ressuscitado que não existia. Corrigido com
`mockReset()` + reinstalação da implementação.

**2. O helper de teste não espelhava a produção.** `storageV2.salvarUma` remove
da fila a mutação CONDENSADA (`removerDaFila(antigo.mutationId)`); o helper do
ensaio não. Num "fechar e reabrir", as duas linhas voltavam do IndexedDB e a
antiga subia primeiro, publicando um valor desatualizado. **A produção está
correta**; o teste é que estava. Fica registrado porque a distância entre
harness e produção é o que faz um ensaio mentir.

## 9 · A fila por item é necessária?

**NÃO.** Todos os seis casos fecham com a fila atual de blob por chave. O merge
é calculado no CLIENTE, sobre a versão que o servidor devolveu no conflito, e o
resultado sobe como um `set` comum — a RPC não precisa saber de nada e nenhuma
migration é necessária.

A fila por item reduziria o TRÁFEGO desse envio (mandar o item em vez da lista
inteira) e permitiria compor intenções localmente. É **otimização de
performance**, classificada como tal, para uma rodada própria.

## 10 · Compatibilidade antigo × novo

| cenário | resultado |
|---|---|
| novo exclui (marca), antigo edita outro item | exclusão respeitada, edição do antigo preservada |
| antigo exclui (sumindo com o item), novo atrasado ainda o tem | **o item volta** |
| ciclos repetidos de sincronização | fila esvazia, sem laço de conflito |
| criações simultâneas | nada some |

A segunda linha é a **limitação estrutural declarada**, e é a razão de o
tombstone existir: sem marca, o merge não distingue "foi excluído" de "ainda não
chegou aqui" — e "ausente de um lado" significa "criado no outro". Consequência
prática para a ativação: **enquanto houver aparelho no bundle antigo, exclusão
feita nele pode ser desfeita**. Não há perda de dado (o item volta, não some), e
o efeito desaparece quando todos os aparelhos estiverem no bundle novo.

## 11 · Regressão com as flags no padrão

Com os três desligados: a exclusão continua tirando o item da lista; o conflito
de itens diferentes — que o merge resolveria — continua indo para a tela manual;
o ACK continua avançando a base (isso é da rodada 3 e ficou ligado de
propósito); e os leitores continuam filtrando tombstone, o que é inócuo enquanto
não existe tombstone nenhum.

## 12 · Pendências desta rodada

- **P1 · aparelho antigo que exclui sem marcar desfaz-se sozinho no merge.** É o
  bloqueador da ativação ampla; não é bloqueador de ativação controlada numa
  organização cujos aparelhos estejam todos atualizados.
- **P2 · field merge** (caso F): campos disjuntos do mesmo item seguem manuais.
- **P2 · aba velha reescrevendo item excluído.** O escritor grava o objeto que
  recebeu e, com ele, apaga a marca. Não é ressurreição por SINCRONIZAÇÃO — o
  merge respeita o tombstone —, é uma aba aberta antes da exclusão. A tela fecha
  esse caminho ao não oferecer o item.
- Poda: sem mudança. Continua desligada e apenas medida.

## 13 · Estado dos interruptores no código entregue

```
PADRAO_SYNC.tombstone        = false
PADRAO_SYNC.mergeAutomatico  = false
PADRAO_SYNC.filaPorItem      = false
colecoes.PODA_AUTOMATICA_ATIVA = false
```

Verificado por teste (`ensaioAtivacao.test.ts` → "o PADRÃO — o que vai para
produção — tem os três desligados").

---

*22/09/2026. Ensaio concluído; nada ativado, nada publicado.*

---

# RODADA 5 — ATIVAÇÃO CONTROLADA POR ORGANIZAÇÃO (22/09/2026)

Sai de "flags globais em memória" para "configuração persistente por
organização". **Nada foi ativado, nada foi aplicado em produção.**

## 1 · Onde a flag mora, e por que ali

`org_sync`, duas colunas novas: `sync_tombstone` e `sync_merge_automatico`.
SQL em `supabase/sync_v2_por_org.sql` — **não aplicado**.

A auditoria pedida no §2 encontrou o mecanismo já pronto, e ele atende os
requisitos sem nada novo:

| requisito | `org_sync` |
|---|---|
| por organização | chave primária é `org_id` |
| fonte controlada | policy só de SELECT, e só da própria linha; **não existe policy de INSERT/UPDATE** |
| usuário não liga | não há caminho de escrita exposto ao `authenticated` |
| sem round-trip novo | o app já lê `org_sync` uma vez por boot |
| provado | oito flags da Fase 9 rodaram por aqui |

Quem liga é `definir_sync_v2(org, tombstone, merge)`, `SECURITY DEFINER`, com
EXECUTE revogado de `anon` e `authenticated` — sobram o SQL Editor (DBA) e o
`service_role`. Mesma porta de `definir_v2_org` e `definir_boot_v9`.

Uma tabela dedicada daria o mesmo resultado com uma migração, uma RLS e uma
consulta a mais. `localStorage`, URL e query param estão fora por definição.

**A regra `merge ⇒ tombstone` também vive no banco**, como CHECK constraint. O
cliente já a recusa (`definirFlagsSync`), mas o cliente pode ser trocado; a
linha da tabela, não.

## 2 · Default seguro, e o que acontece no deploy

As colunas nascem `not null default false`. Organização sem linha, coluna
ausente (banco sem o SQL) e consulta que falhou caem **todas** no mesmo lugar:
o comportamento de hoje.

O caso que mais importa é "bundle publicado, SQL ainda não aplicado": o
PostgREST recusa a consulta inteira quando uma coluna pedida não existe, e esse
erro cai no ramo que restaura o padrão. Testado
(`sincronizacaoPorOrg.test.ts` → "BANCO SEM A MIGRAÇÃO").

Note a assimetria deliberada com a `v2_ativa`: ela **preserva** a decisão de
sessão quando a consulta falha, porque rebaixá-la mostraria a conta vazia. Aqui
o lado barato é o desligado.

## 3 · Quando a flag é carregada

Uma vez por boot, dentro de `flag.sincronizarFlagDoServidor()` — que
`carregarPerfil()` chama logo depois de gravar `nr13_org_id`, ou seja, no login
e em todo boot pelo `verificarAcesso()` do `RotaProtegida`. As **três** flags
saem na mesma consulta.

Nenhuma requisição por operação de sync.

**Não há cache em disco desta flag, e é de propósito.** A `v2_ativa` é
espelhada no `localStorage` porque precisa de leitura SÍNCRONA antes do primeiro
`ler()`. Estas duas não: a primeira decisão que depende delas é uma exclusão ou
um conflito, ambos bem depois do boot. Sem espelho em disco não há o que forjar
pelo DevTools, e o custo é zero.

`zerarFlagEmMemoria()` (logout e troca de conta) devolve as flags ao padrão. Sem
isso, entrar na organização canário e depois numa conta de cliente ligaria o
tombstone na segunda.

## 4 · Protocolo do dispositivo

`services/protocoloSync.ts`. `PROTOCOLO_SYNC = 2`.

| versão | o que muda |
|---|---|
| 1 | exclusão em coleção TIRA o item da lista, sem marca |
| 2 | exclusão em coleção MARCA (`removidoEm`); leitura filtra |

Sobe quando uma mudança torna o cliente antigo perigoso para o novo — não a cada
release.

**Como o dispositivo é identificado:** `nr13_dispositivo_id`, que já existe e já
viaja em toda mutação (`app_storage.dispositivo`). Nada novo.

**Como a versão é registrada:** `registrar_dispositivo_sync(dispositivo,
protocolo)` → tabela `org_dispositivos(org_id, dispositivo, protocolo,
visto_em)`. Chamada de dentro de `registrarSync()`, pegando carona no throttle
de 60 s e na mesma condição: "este aparelho conseguiu ENTREGAR alguma coisa".
Best-effort — é telemetria, não pode derrubar uma drenagem que deu certo.

`protocolo` sobe por `greatest`, nunca desce: um bundle servido de cache velho
não pode rebaixar a leitura e fazer a organização parecer menos pronta do que
está.

**Como o bundle ANTIGO fica visível sem nunca chamar nada:**
`sync_v2_prontidao(org, desde)` cruza quem **escreveu** (`app_storage.dispositivo`,
que o bundle antigo alimenta sem saber) com quem **se registrou** no protocolo 2.
A diferença são os aparelhos presumidos antigos.

## 5 · Critério de ativação

Uma organização pode ligar quando:

1. está explicitamente na allowlist — decisão humana, nenhuma automação a
   substitui; **e**
2. `sync_v2_prontidao(org, <data do deploy>)` não devolve nenhuma linha com
   `compativel = false`; **e**
3. devolveu pelo menos uma linha — lista vazia prova que ninguém sincronizou,
   não que todos estão em dia. Sem isso, a organização "mais pronta" do sistema
   seria a que ninguém usa.

### "Ativo recente" — o número, e de onde ele sai

Não existe prazo derivável de primeiros princípios para "há quanto tempo o
aparelho mais atrasado pode reaparecer": o sistema é offline-first por desenho e
o inspetor passa dias em campo. Qualquer "N dias" seria chute, e o dono pediu
para não inventar um.

O que É derivável: **o aparelho que sincronizou depois da publicação do bundle
carrega o bundle novo**. A cadeia é causal — sincronizar exige a página aberta,
a página vem de `index.html`, e o service worker só serve `/assets/` do cache
(memória `sw-cache-first-stale`). Então o corte honesto não é um prazo: é **a
data do deploy**, e é ela que `sync_v2_prontidao` recebe como `p_desde`.

**E o critério não é o que garante a segurança.** Ele responde "quantas pessoas
vão esbarrar no aviso de atualizar", não "é seguro?". A segurança é a guarda do
§6, que não depende de janela nenhuma.

## 6 · Dispositivo antigo depois da ativação — a guarda

O caso crítico do §9: org ativada, e aparece um celular no bundle antigo.

**A guarda não pergunta quem enviou.** Numa organização com tombstone ligado,
nenhum cliente correto derruba um id — o protocolo 2 marca. Então a condição é
sobre o EFEITO da escrita:

> chave é coleção **e** a org tem `sync_tombstone` **e** o valor novo perdeu um
> id que o valor antigo tinha → recusa `nr13_exclusao_sem_marca`.

Trigger própria (`trg_guardar_exclusao_sem_marca`), `BEFORE UPDATE` em
`app_storage`. Três consequências que valem dizer:

- **imune a cliente que minta** sobre a própria versão, porque não pergunta a
  versão;
- **não mexe em `aplicar_mutacao_storage`** — alterar a única porta de escrita
  do sistema exigiria `drop function` + `create`, o risco do §13 do CLAUDE.md,
  que esta mudança não precisa correr;
- **estreita de propósito**: acrescentar, editar e reordenar passam. Só sumir
  com um id é recusado. Uma guarda que barra o caso normal é desligada no
  primeiro incidente.

`nr13_manutencao_autorizada()` passa — é a porta do DBA, a mesma do §4-quinquies.

### A UX

A mutação é RECUSADA, e nada é apagado: ela continua na fila, no aparelho. A
categoria de erro é nova — `app_desatualizado` (`errosSync.ts`), separada de
`recusa_definitiva` porque ali não existe estado futuro em que a operação passe,
e aqui existe:

> **Atualize o aplicativo para concluir**
> Esta organização passou a registrar exclusões de um jeito novo, e este
> aparelho ainda usa a versão anterior. A alteração continua guardada aqui —
> nada foi perdido. Recarregue a página para atualizar e refaça a exclusão.
> *[Recarregar para atualizar]*

Leitura e as demais escritas seguem funcionando: o aparelho antigo continua
preenchendo inspeção, anexando foto e salvando relatório. Só a mutação
incompatível para. Bloquear o sync inteiro deixaria trabalho de campo preso por
causa de uma exclusão.

**Pode corromper ou ressuscitar exclusão? NÃO**, com a guarda aplicada. A
exclusão feita no aparelho antigo não chega ao servidor; depois de atualizar, o
usuário a refaz e ela vira tombstone. O que se perde é **a exclusão pendente**,
e o usuário é avisado — nunca em silêncio.

## 7 · Canário ZZ

Pronto, **não habilitado**. O procedimento está no rodapé do SQL:

```sql
-- 1. conferir a prontidão, com o corte na data do deploy:
select * from public.sync_v2_prontidao('<ORG_ZZ>', '<data do deploy>');
-- 2. só se nenhuma linha vier com compativel = false:
select public.definir_sync_v2('<ORG_ZZ>', true, true);
```

Rollback instantâneo e sem converter dado: `definir_sync_v2('<ORG_ZZ>', false,
false)`. Tombstone já gravado continua na lista e é inofensivo — o cliente com a
flag desligada não cria novos, mas os leitores continuam filtrando `removidoEm`,
então o item excluído segue invisível, que é o que o usuário pediu ao excluí-lo.

## 8 · Roteiro do teste canário (para depois do deploy)

Pré-condições: SQL aplicado; bundle novo no ar; `definir_sync_v2(ZZ, true,
true)`; dois perfis de navegador (A e B) logados na org ZZ; DevTools aberto.

| # | passo | esperado |
|---|---|---|
| **A** | A: offline no DevTools → editar um cliente → online → aguardar o selo | sobe sem conflito; item com o texto novo |
| **B** | A cria cliente X offline; B cria Y online; A volta | ambos aparecem; **nenhuma tela de conflito** |
| **C** | A exclui X; B (que ainda tinha X) edita Y e sincroniza | X não volta; edição de Y preservada |
| **D** | B: F5, aba nova, fechar/reabrir o navegador | X continua ausente nas três |
| **E** | A e B editam o MESMO cliente, campo `nome`, offline os dois; reconectar | tela manual de conflito, as duas versões visíveis |
| **F** | A: `Network → Offline` **durante** a requisição (não antes); voltar online | pendência preservada; ao voltar, sobe sem duplicar (mesmo `mutationId`) |
| **G** | abrir a org ZZ num bundle antigo (aba com o app aberto desde antes do deploy) e excluir um item | recusa com "Atualize o aplicativo"; o item continua na fila |
| **H** | nesse mesmo aparelho, F5 → refazer a exclusão | exclusão conclui; `sync_v2_prontidao` passa a mostrar `compativel = true` |

Conferir no banco ao fim: `select * from org_dispositivos where org_id = ZZ`
(dois aparelhos, protocolo 2) e o `valor` de uma chave-lista contendo
`removidoEm`.

Verificações que **não** valem: "Success" no SQL Editor (§13) e hash de bundle
(memória `auditoria-ux-set-2026`) — conferir por conteúdo.

## 9 · O que continua fora

```
FILA_POR_ITEM_ATIVA            = false   (Plano Mestre / performance)
PODA_AUTOMATICA_ATIVA          = false   (sem prazo por dias, por decisão)
PADRAO_SYNC.tombstone          = false
PADRAO_SYNC.mergeAutomatico    = false
```

A tela manual de conflito **não foi tocada** e continua sendo o destino de
divergência real no mesmo item (§12 do pedido). Ela deixa de ser o caminho comum
e vira o fallback — que é o desenho.

O conflito real `nr13_pront_indice` segue intocado.

## 10 · Riscos e pendências

- **Migration não aplicada.** Enquanto `sync_v2_por_org.sql` não rodar, a guarda
  do §6 não existe. Ativar o canário antes de aplicar o SQL seria ativar sem a
  rede de proteção — a ordem é: aplicar SQL → publicar bundle → conferir
  prontidão → ligar.
- **A guarda SQL não tem teste de banco.** Não há Supabase local rodando nesta
  sessão, e produção não recebe massa (§12 do CLAUDE.md). O que existe é o
  espelho em TypeScript (`mutacaoDerrubaItem`) com teste, e um gate que quebra
  se uma coleção do catálogo faltar em `eh_chave_colecao`. A conferência do
  comportamento real do trigger fica para o laboratório local.
- **P2 · aba velha reescrevendo item excluído** (da rodada anterior): o escritor
  grava o objeto que recebeu e apaga a marca. Não é sincronização.
- **P2 · field merge**: campos disjuntos do mesmo item seguem manuais.

---

*22/09/2026. Infraestrutura de ativação por organização pronta; canário
preparado e NÃO habilitado; SQL escrito e NÃO aplicado.*


# RODADA 6 — CANÁRIO ZZ E A CONFIGURAÇÃO QUE NÃO SOBREVIVIA AO BOOT OFFLINE (23/09/2026)

## 0 · O que o canário encontrou

SQL aplicado (a guarda provada no banco real: 6 casos, bloco com rollback
garantido), bundle `index-BSPZBbVH.js` no ar desde 05:39Z. ZZ ativada às
16:00:42Z e **revertida às 16:08:56Z** (`definir_sync_v2(ZZ, false, false)`).
Dois aparelhos Chrome headless reais, cada um com perfil, IndexedDB,
`localStorage` e proxy de rede próprios.

- **Caso A** (edição offline, reload offline, volta online): passou.
- **Caso B** (itens diferentes em dois aparelhos): virou conflito MANUAL.
- **Demonstração que parou o canário**: no bundle novo, boot offline → exclusão
  SEM `removidoEm` → a guarda recusou (`nr13_exclusao_sem_marca`) e o aparelho
  a tratou como cliente antigo. Nenhuma perda, nenhuma ressurreição — a guarda
  segurou —, mas a exclusão ficou presa: `/pendencias` não tinha a ação que a
  mensagem prometia, e a hidratação pula chave com pendência.

Evidência: JSONs de estado dos dois aparelhos e logs, fora do repositório
(scratchpad da sessão). Os perfis e as sessões administrativas foram
destruídos (logout 204).

## 1 · Auditoria do fluxo (antes da correção)

| momento | o que acontecia com `sync_tombstone` / `sync_merge_automatico` |
|---|---|
| login online | `carregarPerfil` → `sincronizarFlagDoServidor` → memória |
| boot online | `RotaProtegida` → `verificarAcesso` → `carregarPerfil` → idem, ANTES de `hidratarNoBoot` (fila, drenagem) |
| **boot offline** | `carregarPerfil` sai com `indisponivel` ANTES de consultar `org_sync`; memória fica no PADRÃO (desligado) |
| consulta com erro | `restaurarFlagsSync()` — zerava mesmo o que estava certo |
| evento `online` / volta de aba | `atualizarDoServidor` → `drenar` direto; **ninguém relia a configuração** |
| troca de org / logout | `zerarFlagEmMemoria` → padrão |
| F5, fechar, reiniciar | memória some; nada em disco |
| service worker | irrelevante para a flag (só serve o shell) |
| IndexedDB `meta` | já existia (`base:<chave>`), por organização |

Causa raiz: a configuração tinha **uma única fonte, a memória**, e a memória
só era preenchida com o servidor respondendo. Para um sistema cujo caso normal
é abrir o app sem rede, isso inverte o fail-safe.

## 2 · A correção

**Fonte da verdade continua o servidor.** O que muda é que a última resposta
dele vira um RECIBO no IndexedDB da própria organização:

```
nr13_dados_<org_id> · store meta · chave "sync-config"
{ org, tombstone, mergeAutomatico, protocolo, confirmadoEm }
```

Nada no `localStorage`. Não é configuração editável: forjar o recibo não
autoriza nada (a guarda e a CHECK continuam no banco, e o boot online
sobrescreve — teste "manipular o recibo local").

A origem de cada valor em memória passa a ser rastreada (`flagsSync.ts`):

| origem | quando | coleção sobe? | merge automático? |
|---|---|---|---|
| `padrao` | nada carregado | sim (comportamento antigo) | se ligado |
| `desconhecida` | boot offline sem recibo | não | não |
| `cache` | recibo do disco, ou reconexão ainda não revalidada | não | não |
| `servidor` | respondido nesta conexão | sim | se ligado |

- **Boot online**: o servidor responde em `carregarPerfil` → memória + recibo;
  `storageV2.iniciar` carrega o recibo SÓ se a memória não tem resposta do
  servidor para a mesma org. A fila é carregada depois disso.
- **Boot offline**: `iniciar` aplica o recibo daquela org ANTES da fila.
  Sobrevive a F5, fechar o navegador e reiniciar — é disco.
- **Evento `online`**: `atualizarDoServidor({ reconectou: true })` marca a
  configuração para revalidar, pergunta ao servidor e **só depois** drena.
- **Qualquer drenagem** (inclusive a disparada por uma gravação sem evento
  `online`): se há coleção na fila e a origem não é `servidor`, pergunta
  primeiro; sem resposta, a coleção ESPERA (não é falha, não sai da fila).
- **Erro da consulta**: coluna ausente (banco sem a migração) é resposta —
  desligado, confirmado. Falta de resposta mantém o recibo.

### Primeiro boot offline sem recibo (política fail-safe)

Não se inventa que a Sync V2 está ligada — as flags ficam desligadas. Mas a
exclusão MARCA (`colecoes.deveMarcarExclusao`), e a coleção só sobe depois que
o servidor responder:

- servidor diz tombstone LIGADO → a marca sobe como está;
- servidor diz DESLIGADO → a marca sai no primeiro envio
  (`sync.semMarcasParaEnvio`) e vira a exclusão de sempre; o valor local é
  reescrito igual ao enviado.

A exclusão nunca some do blob antes de a configuração ser conhecida, nunca
vira exclusão antiga irreversível, e nunca fica presa.

## 3 · Rollback true → false com aparelho offline — a análise

Cenário: o aparelho guardou `true/true`, ficou offline, o administrador fez
`definir_sync_v2(org, false, false)`.

**Tombstones criados offline com o recibo true.** O leitor de todo bundle de
protocolo 2 filtra `removidoEm` (`visiveis`), então a marca é invisível em
qualquer org. Ao reconectar, a drenagem revalida, recebe `false` e as marcas
saem no envio: a exclusão chega ao servidor como exclusão clássica, que é o
que aquela organização espera. Teste J1.

**Correção medida no canário R2 (ver rodada 7):** isso vale quando a PRIMEIRA
tentativa acontece depois da confirmação. Se a exclusão foi gravada com a
sessão ainda confirmada e a 1ª tentativa falhou por rede, a marca sobe como
está — o descarte só age em `tentativas === 0`, porque reescrever o conteúdo
de um `mutationId` que talvez já tenha chegado (ACK perdido) arriscaria base
divergente. O resultado é seguro (marca filtrada por todo leitor de protocolo
2; sem perda, sem ressurreição, sem merge), só não é a exclusão clássica.
Teste "marca que JÁ foi tentada".

**Merge automático com recibo true.** Não roda: `mergeDeConflito` exige origem
`servidor`, e a coleção só é enviada depois da revalidação. Depois do
rollback, o conflito volta para a tela manual com as duas versões
preservadas. Teste J2.

**Por que o merge precisa dessa trava e o tombstone não.** Marca a mais é
inofensiva (é filtrada). Merge a mais é perigoso: com o tombstone desligado,
outros aparelhos voltam a excluir sem marca, e o merge — que só sabe unir —
ressuscitaria esses itens. A regra que decorre:

> **merge exige confirmação do servidor NESTA conexão; tombstone pode vir do
> recibo.**

**Reativar depois de um rollback.** Itens excluídos classicamente durante o
período desligado são ausências. Um aparelho com a cópia velha e o merge
religado poderia trazê-los de volta — é o mesmo risco da ativação inicial, e a
resposta é a mesma: `sync_v2_prontidao` antes de ligar. Somado a isso, o
merge agora marca as exclusões clássicas pela BASE antes de mesclar
(`mergeColecao.comExclusoesClassicasMarcadas`): id na base e ausente na lista
local saiu AQUI. Teste K2.

**Recomendação operacional.** O rollback de menor risco é
`definir_sync_v2(org, true, false)` — desliga o merge e mantém a marca. O
`false, false` continua seguro com as travas acima, e exige a prontidão de novo
antes de religar o merge. Nenhuma mudança de SQL foi necessária.

## 4 · `app_desatualizado` — o caminho completo

Dois casos que o canário confundiu, agora separados:

- **cliente realmente antigo** (protocolo 1): não muda de código. A guarda do
  servidor continua recusando (teste L1). Quando ele atualiza, o item herdado
  (que o bundle antigo classificava como `falha_definitiva`) volta a ser
  tentado no boot (`carregarFilaDoDisco`) e cai no caminho abaixo (teste L2);
- **cliente novo com exclusão antiga na fila** (recibo velho, ou fila herdada):
  `recuperarExclusaoSemMarca` refaz a exclusão com a marca, com PROVA — a
  guarda só roda com a versão conferida, então se o servidor ainda está em
  `versaoBase`, todo id que está lá e falta aqui saiu aqui (teste K1). Se a
  lista mudou, o próximo envio é conflito de versão e o merge marca pela base
  (teste K2). Sem prova possível (a chave sumiu do servidor), o item vai para
  "Exclusão para refazer" em Pendências, com "Usar a versão do servidor", que
  tira a pendência e REGRAVA o valor do servidor no cache — sem isso a
  hidratação incremental não o traria de volta (teste K3).

Nenhum retry infinito: o item ou é refeito, ou vira conflito de versão, ou
para em decisão do usuário. Nenhum descarte silencioso.

## 5 · Testes

`src/services/configSyncOffline.test.ts` — 21 testes, pelo caminho real
(`flag` → `storageV2.iniciar`/`atualizarDoServidor` → `colecaoSync` → `sync`),
com IndexedDB e `localStorage` separados por aparelho e um servidor que
reproduz versão, idempotência e a guarda. Checagem de mutação: sem a leitura
do recibo no boot, 10 falham; sem a marcação pela base, o K2 falha.

`sincronizacaoPorOrg.test.ts`: o teste "consulta falha (offline): fica no
padrão" afirmava o defeito e foi reescrito para a regra nova.

## 6 · Achado secundário

A barra "Sem resposta do servidor" era desenhada no boot e nunca saía. Agora
some quando o servidor volta a responder (`EVENTO_SERVIDOR_RESPONDEU`,
disparado por `flag.confirmarConfigSync`).

## 7 · O que continua fora

Fila por item, poda, field merge e `nr13_pront_indice` — intocados. Nenhuma
organização ativada.

---

*23/09/2026. Correção local, testada; ZZ desligada; canário A–H a repetir.*


# RODADA 7 — CANÁRIO R2 NA ZZ, COM A CORREÇÃO NO AR (23/09/2026)

`04f2918` publicado (bundle `index-Ch50oqIZ.js`, 17:01:33Z; idêntico ao build
do HEAD fora hash de asset e env). ZZ ativada às 17:13Z. Três aparelhos Chrome
headless independentes (A `547f7821`, B `3916628a`, C `494f76b6`), perfis em
caminho curto, proxy liga/desliga por aparelho, sessões da conta de teste
revogadas ao fim. Massa `ZZ-SYNCV2-R2-*` em `nr13_agenda_notas`.

| caso | resultado |
|---|---|
| recibo · F5 · fechar/reabrir offline | origem = recibo provada pelo formato da exclusão (false → tira; desconhecida marcaria); CONFIG antes de MUTACAO nos dois aparelhos |
| A · edição offline + F5 + reabertura | PASS |
| B · itens diferentes, B com boot OFFLINE | PASS — merge automático pelo recibo, sem conflito manual |
| C · criação offline | dados PASS; a mutação mesclada só subiu com "Sincronizar" (achado 1) |
| D · exclusão + aparelho atrasado | PASS — C marcado no RAW antes do ACK; não reaparece em nenhum lugar |
| E · conflito verdadeiro | PASS — manual, as duas versões preservadas |
| F · ACK perdido | PASS — mesmo mutationId, `repetido`, versão não sobe, base avança |
| G · cliente antigo | PASS — guarda recusa; fila herdada se recupera com marca; "Exclusão para refazer" → "Usar a versão do servidor" → usuário refaz com marca |
| H · reinício offline real | PASS — SW, recibo, dado, fila e tombstone sobrevivem |
| rollback true/true → true/false | PASS — recibo atualizado antes da MUTACAO; conflito manual |
| rollback true/true → false/false | seguro; marca subiu em vez de virar exclusão clássica (achado 2) |
| primeiro boot offline sem recibo | PASS nas duas regras da org |

**Achado 1 — merge gerado na drenagem não era enviado nela.** A mutação nova
(merge, ou exclusão refeita com marca) nascia durante a iteração de uma foto
da fila e ficava parada: 90 s sem envio, e nem o reload a subia (o boot leve
não drena; a retentativa periódica só pega erro de rede). Sem perda — estava
na fila e o botão "Sincronizar" a enviava. Corrigido: `drenar` faz até 3
passadas, cada uma só com o que a anterior não viu. Os testes tinham uma
segunda `drenar()` que mascarava isso; foram retiradas, e o teste "UMA
drenagem entrega o merge" quebra sem a correção.

**Achado 2 — descarte da marca só na 1ª tentativa.** Ver a correção na seção
3 da rodada 6. Seguro; documentado e travado por teste.

**Achado 3 (pré-existente, P2) — boot offline lento.** 20–40 s em
"Carregando…": o supabase-js retenta cada GET com falha de rede (1 s, 2 s,
4 s) e o boot faz várias em sequência (perfil, hidratação). Não é desta
correção.

**Nota de UX:** o cabeçalho de Pendências diz "A mesma informação foi alterada
em mais de um aparelho" também quando a única decisão é "Exclusão para
refazer".


# RODADA 8 — P1 NO AR E FECHAMENTO NO CANÁRIO (23/09/2026)

`81e36d4` publicado: bundle `index-BTMyhJwA.js` (17:53:36Z), idêntico ao build
do HEAD fora hash de asset e env, e diferente do anterior. ZZ segue a única
organização ativa (true/true). Dois aparelhos headless novos (A `c1afa2cd`,
B `793182c2`). Massa `ZZ-SYNCV2-P1-*`.

**Merge na mesma drenagem.** Um gatilho só (a rede voltando):
`CONFIG → MUTACAO (conflito) → [merge] → MUTACAO (mesclada) → LEITURA`.
A mesclada saiu 1 ms depois do merge e ANTES de qualquer leitura de
`app_storage` — ou seja, dentro da mesma `drenar()`, não pela hidratação.
Servidor A2 · B · C2, fila 0, conflitos 0.

**Exclusão reconstruída na mesma drenagem.** Exclusão sem marca gravada na
fila de B (lista sem P1-B, versão base 43), um gatilho só:
`CONFIG → MUTACAO (recusada) → CONFIG → LEITURA (a prova) → MUTACAO
(reconstruída) → LEITURA (hidratação)`. Servidor com P1-B marcado, fila 0.

**Por que 3 passadas bastam, e o que encerra antes.** Cada passada só envia
`mutationId` que ainda não viu; a drenagem para assim que uma passada não
encontra nada novo. As cadeias conhecidas têm dois elos (o item original e o
que ele gerou: merge ou exclusão reconstruída); a terceira passada cobre o
caso raro de a mutação gerada também voltar em conflito e ser mesclada. O
teto existe para uma cadeia que ninguém previu não virar laço — e mesmo que
ele seja atingido, nada se perde: o que sobrou fica na fila para o próximo
gatilho. Medido: 2 passadas com trabalho nos dois casos acima; fila vazia não
faz nenhuma. Travado por quatro testes em `configSyncOffline.test.ts`
("passadas da drenagem"): fila vazia sem rede; exatamente 2 envios com ids
distintos e versão +1 no merge; falha definitiva contada uma vez e fora da
rede; exclusão sem prova com um envio e nenhum reenvio na drenagem seguinte.

**Observação do harness.** O controlador caiu uma vez (ECONNRESET não
tratado no proxy) e o Chrome morreu sem fechar; o índice da CacheStorage não
foi gravado e o boot offline seguinte abriu em branco (`#root` vazio). O app
não tem culpa, mas o efeito é real: um navegador morto à força pode perder o
cache do service worker e não abrir offline até a próxima carga online.

# RODADA 9 — O "BRANCO OFFLINE DEPOIS DO KILL": AUDITORIA DO SERVICE WORKER (23/09/2026)

**Pergunta:** na rodada 8 um aparelho do harness abriu em branco offline depois
de o Chrome morrer. É o nosso PWA, o Chromium, ou o harness?

**Arquitetura atual (`public/sw.js`, `nr13-cache-v8`):**
- `install`: precache de `/`, `/index.html`, manifest e ícones — **o bundle
  JS/CSS NÃO entra no precache**; `skipWaiting`.
- `activate`: apaga caches de outra versão; `clients.claim`.
- `fetch`: navegação = rede primeiro (`no-cache`), grava `/index.html`, offline
  cai no cache; `/assets/` = cache primeiro, gravado na primeira vez que passa
  pelo SW; templates e demais arquivos da origem = rede primeiro com fallback;
  Supabase e externos não são interceptados.
- Registro no evento `load` (`main.tsx`): na PRIMEIRA carga o SW nasce depois
  que a página já baixou o próprio bundle, então o bundle não vai para a
  CacheStorage nessa carga (medido: 11 entradas, sem JS/CSS). Ele entra na
  próxima carga — ou no próprio boot offline, quando o `fetch` do SW acha o
  arquivo no cache HTTP do navegador (medido: o reload offline depois de uma
  única carga abriu e completou o cache para 14).

**Medições (Chrome com janela e headless, `taskkill /F /T`, reabertura offline):**

| cenário | tentativas | resultado |
|---|---|---|
| cache assentado (2ª carga), kill, reabre offline — com janela | 2 | abre; IndexedDB, fila, recibo e edição offline intactos |
| gravação de cache em voo (kill 1,2 s após navegar) — com janela | 1 | abre; entradas novas preservadas |
| cache assentado, kill ×3 seguidos — headless | 3 | abre |
| `Browser.close` interrompido por kill (50/150/400 ms) — headless | 3 | fechou sozinho antes; abre |
| **uma única carga** + kill + reabre offline — com janela | 2 | abre (cache HTTP sobreviveu) |
| **uma única carga** + kill + reabre offline — headless | 2 | abre |

Nenhuma das 13 tentativas reproduziu o branco. O caso original foi um evento
composto do harness: o controlador caiu (ECONNRESET não tratado no proxy)
**durante** um `Browser.close`, num aparelho com uma única carga do app, e a
CacheStorage voltou ao estado da instalação (2 entradas). Mesmo ali, IndexedDB,
fila e recibo estavam íntegros — só o shell não abriu.

**Classificação:** limitação do harness; não reproduzida em Chrome real nem em
headless por kill direto. O SW não foi alterado.

**Fragilidade estrutural registrada (P3, sem ação agora):** o shell offline
depende de o bundle ter passado pelo SW pelo menos uma vez — na primeira carga
ele só existe no cache HTTP do navegador. Se os dois se perderem juntos, o app
não abre offline até a próxima carga online (os dados continuam no
IndexedDB). A correção mínima, se um dia for necessária, é precachear o bundle
de entrada no `install` (lista gerada no build) — mudança de SW, a fazer com
medição própria.

# RODADA 10 — CHAVES SINGLETON FORA DO CACHE (23/09/2026)

**Achado da Fase 2:** pré-visualizar um prontuário gravou `nr13_prontuario_atual`
(v99 no servidor) e `nr13_assinantes_pront_ZZ-FASE3` (excluída, v2) com
`versaoBase: 0` e criou dois conflitos manuais. Servidor intacto.

**Causa:** `storageV2.gravarComFila` (e `excluirUma`) calculava
`cache.obterRegistro(chave)?.versao ?? 0`: cache miss afirmava ao servidor que a
chave não existia. É uma CLASSE, não dois casos:

| família | chega ao cache por | risco de base 0 |
|---|---|---|
| `nr13_*_atual` (prontuário, inspeção, injeção, meta do relatório) | nada — fora do boot leve | **sim** — sempre fora do cache num aparelho recém-aberto |
| por TAG viva (`nr13_info_`, `nr13_assinantes_pront_`…) | `carregarEquipamento` | baixo |
| por TAG EXCLUÍDA no servidor | nada — a semeadura pula linhas excluídas | **sim** — a exclusão tem versão |
| globais do boot leve (`essencial.ts`) | boot | não |
| coleções | `colecaoSync.lerColecao` já semeava | não |

O aparelho do dono já tinha conflitos antigos em `nr13_inspecao_atual`,
`nr13_injecao_atual` e `nr13_relatorio_meta_atual` — a mesma causa.

**Correção (uma porta, na camada de storage — `leituraDirigida.ts`):**
- escrita com cache miss e sem pendência → leitura dirigida DAQUELA chave
  (timeout de 4 s). Valor → entra no cache e a versão vira a base; ausência
  confirmada → 0; excluída → a versão da exclusão; sem resposta → o item vai
  `baseDesconhecida` (nunca base 0 afirmado);
- na drenagem, `baseDesconhecida` pergunta antes de enviar: mesmo valor →
  adota a versão; ausente → envia como nova; valor diferente → o conflito de
  sempre (merge para coleção, manual para o resto); excluída → "excluído em
  outro aparelho". Nunca overwrite silencioso.

**Pré-visualizar grava?** Sim, e as duas escritas têm motivo: `nr13_prontuario_atual`
é a cópia que as folhas `PRONT-*.html` leem (a prévia VETORIAL não a lê — é
necessária só para o caminho por template); `nr13_assinantes_pront_<TAG>` é a
pré-seleção do único engenheiro, feita ao abrir. Nenhuma foi removida; o que
mudou é a base com que elas sobem. Sincronizar uma cópia de trabalho global
(`nr13_*_atual`) continua sendo desenho questionável — dois aparelhos se
sobrescrevem nela — e fica como proposta, não como mudança desta rodada.

Travado por 9 testes em `configSyncOffline.test.ts` ("singleton fora do
cache"); sem a leitura dirigida, 6 falham.

**Ajuste antes do deploy (mesmo dia):** a primeira versão desta correção
adotava a versão do servidor para QUALQUER chave viva encontrada na leitura
dirigida. Isso trocava um conflito barulhento por uma sobrescrita silenciosa
nos caminhos "não achei, então crio" — `obterOuCriarMeta` geraria um número de
prontuário novo por cima do existente. Agora a adoção vale só para as
`COPIAS_DE_TRABALHO` (`nr13_*_atual`, regeneradas da fonte a cada abertura) e
para a chave excluída no servidor (recriação). Toda outra chave viva entra no
cache e a escrita sobe com base desconhecida: valor igual, adota; diferente,
conflito com as duas versões. Travado por 2 testes.
