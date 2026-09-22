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
