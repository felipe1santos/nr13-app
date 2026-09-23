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
