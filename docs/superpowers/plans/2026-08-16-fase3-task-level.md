# Fase 3 — Conflitos: fechar o ciclo · task level

**Plano macro:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (FASE 3)
**Achado:** A-14 · **Data:** 16/08/2026
**Pré-condição:** `docs/medicoes/2026-08-16-fase3-mutationid.md` — **concluída, veredito CASO B**

---

## O que a pré-condição decidiu

Verificado por execução contra o banco (org de teste, chave descartável):

- a tentativa que termina em conflito **fica registrada** com `resultado.status = 'conflito'`;
- reenviar o **mesmo** `mutationId` cai no caminho rápido de idempotência e devolve
  **`repetido`** carregando o valor e a versão do **servidor** — sem gravar nada;
- `sync.enviarItem` trata `repetido` como sucesso: carimba a versão do servidor no registro
  local (que ainda tem o valor do usuário) e **remove o item da fila**;
- um `mutationId` NOVO com `versaoBase` = versão do servidor **aplica** (`versao 2`).

**Consequência:** hoje, clicar "Tentar de novo" ou "Tentar todas" com um item em conflito
**destrói a edição do usuário em silêncio** — ela fica só no aparelho, carimbada com a
versão do servidor, e por isso `aplicarRemoto` nunca mais a corrige. É o defeito ativo que
esta fase fecha, e é o motivo de os dois conflitos de 14/08 seguirem intocados.

---

## Decisões

### D3-01 — Resolução "Manter a minha" cria mutação NOVA com `resolveDe`

Decidido pelo resultado medido, não por suposição. Reusar o id devolveria `repetido` e o
cliente reportaria sucesso sem gravação. A nova mutação carrega:

```ts
{ mutationId: <novo uuid>, resolveDe: <id original>, op, chave,
  valor: <o valor LOCAL>, versaoBase: <versão do SERVIDOR>, tentativas: 0, estado: 'aguardando' }
```

Não viola I-03: a idempotência protege contra reenviar **a mesma** mutação. Esta é outra —
base diferente, decisão humana no meio. `resolveDe` mantém a auditoria.

A troca (remover o original + gravar o novo) vai numa transação só, como I-01 exige. Nunca
"apaga o velho e depois cria o novo".

### D3-02 — Store `conflitos`, chave = chave original

`guardarConflito` gravava em `dados` com chave `nr13_conflito_<chave>__<Date.now()>`:
entrava no `Map` na hidratação, aparecia em `chavesComPrefixo`, caía em escopo `'global'`
por não estar em `familiasChave`, e **crescia sem teto** — uma cópia por tentativa.

Agora: store própria, fora de `dados`, uma entrada **por chave**. A cópia relevante é a
mais recente do servidor; guardar N tentativas do mesmo conflito não ajuda ninguém.

Exige `VERSAO_SCHEMA` 1 → 2. O upgrade é **puramente aditivo** (só `createObjectStore`), e
por isso é o único passo não reversível da fase — código antigo continua funcionando com o
schema v2, ele apenas ignora a store nova.

### D3-03 — `tentarNovamente` e `retentarTodas` recusam item em conflito

Correção mínima do defeito ativo, e ela vale por si: mesmo sem a UI de resolução, deixa de
ser possível destruir a própria edição clicando num botão.

### D3-04 — O lado PERDEDOR é preservado nas DUAS escolhas

O plano macro previa apagar a cópia ao escolher "usar a do servidor". Isso descartaria o
valor local sem que ele existisse em lugar nenhum — o espelho exato do problema que a fase
conserta. Então:

| Escolha | Vai para o servidor | O que fica guardado em `conflitos` |
|---|---|---|
| Manter a minha | valor local | a versão do **servidor**, marcada `substituida` |
| Usar a do servidor | (nada — o servidor já tem) | o valor **local**, marcado `substituido` |

As duas saem da fila na hora. O lado perdedor fica listado em "Versões substituídas", com
botão **Descartar** — ação explícita do usuário, igual ao padrão das mutações encerradas.
I-05 preservado nos dois sentidos.

### D3-05 — Sem resolução automática, nunca

Nenhum caminho do código escolhe sozinho. Item sem decisão fica — visível e contado.

### D3-06 — Livro de registro em conflito tem mensagem própria

`nr13_livro_` sob a trava de imutabilidade (I-17) pode recusar "manter a minha". A recusa
já é classificada como `recusa_definitiva` (Fase anterior) e agora aparece com o texto do
livro, não com erro genérico.

---

## Arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modificar | `src/services/db.ts` | store `conflitos`, `VERSAO_SCHEMA` 2, upgrade aditivo |
| Modificar | `src/services/sync.ts` | `guardarConflito` na store nova; `listarConflitos`; `resolverMantendoLocal`; `resolverUsandoServidor`; `descartarSubstituida`; guarda em `tentarNovamente` |
| Modificar | `src/services/cacheLocal.ts` | `gravarAtomico` aceita ops de `conflitos` (troca atômica) |
| Modificar | `src/services/familiasChave.ts` | registrar `nr13_conflito_` explicitamente (chave nova se registra na tabela) |
| Modificar | `src/services/storageV2.ts` | migração das cópias antigas na hidratação |
| Modificar | `src/pages/Pendencias.tsx` | comparação lado a lado, 3 ações, seção de substituídas; `retentarTodas` pula conflito |
| Criar | `src/services/sync.conflito.test.ts` | conflito, retry, troca atômica, migração |
| Criar | `src/services/db.upgrade.test.ts` | upgrade v1→v2 preserva as stores |

---

## Tarefas

### Tarefa 1 — Schema v2 com a store `conflitos`
- [ ] Teste: banco criado em v1 com dado nas 4 stores, reaberto em v2 → 4 stores intactas + `conflitos` presente.
- [ ] `VERSAO_SCHEMA = 2`, `NomeStore` += `'conflitos'`, upgrade só acrescenta.

### Tarefa 2 — `guardarConflito` na store nova, uma cópia por chave
- [ ] Teste: dois conflitos da mesma chave → **1** entrada; `dados` sem `nr13_conflito_*`.
- [ ] Teste: `hidratarDoDisco` não traz conflito para o `Map`.

### Tarefa 3 — Guarda do defeito ativo (D3-03)
- [ ] Teste: `tentarNovamente` em item `conflito` não chama a RPC e não mexe na fila.
- [ ] `retentarTodas` opera só sobre itens sem conflito.

### Tarefa 4 — Resolver mantendo a minha (D3-01)
- [ ] Teste: gera UM item novo, com `resolveDe`, `versaoBase` = versão do servidor; o original sai; a troca é uma transação só.
- [ ] Teste: a resolução sobe e o servidor recebe o valor local (RPC mockada devolvendo `aplicado`).
- [ ] Teste: falha de rede na resolução → item continua, sem criar terceiro.
- [ ] Teste: nunca devolve `repetido` tratado como sucesso.

### Tarefa 5 — Resolver usando o servidor
- [ ] Teste: aplica o remoto no cache, item sai da fila, valor local vira `substituido` guardado.
- [ ] Teste: funciona offline (não chama a RPC).

### Tarefa 6 — Migração das cópias antigas
- [ ] Teste: `nr13_conflito_<chave>__<ts>` em `dados` → move para `conflitos` (fica a mais recente), remove de `dados`, idempotente.

### Tarefa 7 — Tela
- [ ] Comparação lado a lado com resumo humano + JSON em `<details>`.
- [ ] Três ações; "Decidir depois" não faz nada.
- [ ] Seção "Versões substituídas" com Descartar.

### Tarefa 8 — Validação
- [ ] Suíte + build.
- [ ] Roteiro de dois aparelhos em produção (org de teste).

---

## Critério de aceite

- [x] Pré-condição executada e registrada
- [ ] "Manter a minha" grava no servidor e sai da fila
- [ ] Nenhum caminho trata `repetido` como sucesso sem gravação
- [ ] `tentarNovamente`/`retentarTodas` recusam conflito
- [ ] Zero `nr13_conflito_*` no `Map`
- [ ] Uma cópia por chave, não por tentativa
- [ ] Nenhuma versão descartada sem escolha explícita
- [ ] Upgrade v1→v2 preserva as stores, provado por teste
- [ ] Suíte verde, build limpo

## Rollback

Reverter os commits do frontend. **O schema do IndexedDB não volta para v1** —
`indexedDB.open` com versão menor falha. É seguro porque o upgrade é aditivo: o código
antigo não conhece a store `conflitos` e ignorá-la é inofensivo. Único passo não
reversível da fase.

## Restrição operacional

Os **2 conflitos reais parados desde 14/08** no aparelho do dono não são tocados durante a
implementação. Eles são o material do teste manual **depois** do deploy — e até lá o botão
"Tentar de novo" deles continua sendo o gatilho de perda descrito na pré-condição.
