# Fase 3 — Conflitos: fechar o ciclo · task level

**Plano macro:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (FASE 3)
**Achado:** A-14 · **Data:** 16/08/2026
**Pré-condição:** `docs/medicoes/2026-08-16-fase3-mutationid.md` — **concluída, veredito CASO B**

---

## Estado atual da fase

- **Fase:** 3 — Conflitos: fechar o ciclo
- **Estado:** **VALIDADO EM PRODUÇÃO** (19/08/2026) — implementado, testado, commitado, no `main`,
  deployado e exercitado ponta a ponta na organização de teste
- **Último commit da fase:** `f074a64` (19/08/2026) · **último commit de código:** `cb26450`
- **Push main:** SIM · **Redeploy:** SIM — bundle em produção confirmado **byte-a-byte**
  (SHA-256 do `/assets/index-AIiLkfur.js` igual ao do build local)
- **Validação local:** SIM — suíte **1042/1042** em 84 arquivos, `npm run build` limpo
  (19/08/2026 22:58)
- **Validação produção:** **SIM** — dois ciclos completos de conflito + regressão do fluxo de
  exclusão. Evidência: `docs/medicoes/2026-08-19-p1-p2-producao.md`
- **Portão P2:** **PRONTO PARA APROVAÇÃO DO DONO** — todos os critérios cumpridos, com
  **2 ressalvas nomeadas** (drenagem offline não exercitada manualmente; um clique que não
  registrou, não diagnosticado)
- **Próxima ação exata:** dono lê o resultado e **aprova ou recusa o P2**. Nenhuma linha da
  Fase 4 antes disso
- **Última atualização:** 19/08/2026 23:00 (relógio do ambiente)

> **Nota de honestidade:** esta seção foi escrita em 19/08/2026 numa sessão de RECUPERAÇÃO DE
> ESTADO, a partir de Git + código + testes + build. Nenhum item de produção foi marcado sem
> evidência. Onde a evidência é indireta, está dito.

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

> Marcação revisada em 19/08/2026 contra código, testes e Git. A evidência de cada item
> está ao lado dele.

### Tarefa 1 — Schema v2 com a store `conflitos` · **COMMITADA** `f0e1817`
- [x] Teste: banco criado em v1 com dado nas 4 stores, reaberto em v2 → 4 stores intactas + `conflitos` presente.
      → `src/services/db.upgrade.test.ts`, 4 testes (`preserva dados, fila, tombstones e meta`;
      `cria a store conflitos, vazia`; `a store nova aceita escrita atômica junto com as antigas`;
      `banco novo nasce direto com as cinco stores`)
- [x] `VERSAO_SCHEMA = 2`, `NomeStore` += `'conflitos'`, upgrade só acrescenta.
      → `src/services/db.ts:22,24,41` — `createObjectStore` só quando `!contains(s)`

### Tarefa 2 — `guardarConflito` na store nova, uma cópia por chave · **COMMITADA** `f0e1817`
- [x] Teste: dois conflitos da mesma chave → **1** entrada; `dados` sem `nr13_conflito_*`.
      → `sync.conflito.test.ts`: `DUAS detecções do mesmo conflito produzem UMA cópia, não duas` ·
      `não polui a store dados com nr13_conflito_*`
- [x] Teste: `hidratarDoDisco` não traz conflito para o `Map`.
      → `sync.conflito.test.ts`: `não entra no Map na hidratação`

### Tarefa 3 — Guarda do defeito ativo (D3-03) · **COMMITADA** `ecdf789`
- [x] Teste: `tentarNovamente` em item `conflito` não chama a RPC e não mexe na fila.
      → `sync.conflito.test.ts`: `tentarNovamente RECUSA item em conflito — não chama a RPC`
- [x] `retentarTodas` opera só sobre itens sem conflito.
      → `Pendencias.tsx:62` (`pendentes` filtra `conflito` e `encerrado`) + `sync.drenar` pula conflito
      (`sync.conflito.test.ts`: `drenar continua pulando conflito`)

### Tarefa 4 — Resolver mantendo a minha (D3-01) · **COMMITADA** `150948d`
- [x] Teste: gera UM item novo, com `resolveDe`, `versaoBase` = versão do servidor; o original sai; a troca é uma transação só.
      → `cria UMA mutação nova, com resolveDe e a versão do SERVIDOR como base` ·
      `a troca é UMA transação: o original nunca coexiste com o novo no disco`
- [x] Teste: a resolução sobe e o servidor recebe o valor local (RPC mockada devolvendo `aplicado`).
      → `a resolução SOBE e o item sai da fila`
- [x] Teste: falha de rede na resolução → item continua, sem criar terceiro.
      → `falha de rede na resolução não cria um terceiro item nem ressuscita o original`
- [x] Teste: nunca devolve `repetido` tratado como sucesso.
      → coberto pelo id novo (`resolveDe`) + `resolver de novo o que já foi resolvido é no-op`

### Tarefa 5 — Resolver usando o servidor · **COMMITADA** `150948d`
- [x] Teste: aplica o remoto no cache, item sai da fila, valor local vira `substituido` guardado.
      → `aplica o remoto no cache e tira o item da fila` · `guarda o valor LOCAL como substituído`
- [x] Teste: funciona offline (não chama a RPC).
      → `funciona OFFLINE: não chama a RPC`

### Tarefa 6 — Migração das cópias antigas · **COMMITADA** `f0e1817`
- [x] Teste: `nr13_conflito_<chave>__<ts>` em `dados` → move para `conflitos` (fica a mais recente), remove de `dados`, idempotente.
      → 4 testes em `describe('migração das cópias antigas')`, incluindo
      `não apaga a origem sem ter gravado o destino` e `não sobrescreve conflito novo já existente`.
      Implementação: `sync.migrarConflitosAntigos` (`sync.ts:737`) + `familiasChave.PREFIXO_CONFLITO_LEGADO`

### Tarefa 7 — Tela · **COMMITADA** `150948d` + `c54a84c` + `81cfd79`
- [x] Comparação lado a lado com resumo humano + JSON em `<details>`.
      → `Pendencias.tsx:244-300` (`conflito__lados`, `resumoDoValor`, `<details>` "Detalhes técnicos")
- [x] Três ações; "Decidir depois" não faz nada.
      → "Manter a minha" (l. 258) · "Usar a do servidor" (l. 274) · adiar é texto explicativo,
      sem ação (l. 278-282) — exatamente o previsto
- [x] Seção "Versões substituídas" com Descartar.
      → `Pendencias.tsx:496-520`
- [x] Rótulo humano da chave no card (`rotuloDaChave`), incluindo `nr13_pref_unidade_` → "Unidade de medida"
      → `src/features/documentos/rotuloChave.ts` + `.test.ts`, commit `81cfd79`

### Tarefa 8 — Validação
- [x] Suíte + build. → **1042 testes / 84 arquivos, 0 falhas**; `npm run build` limpo, medido em
      19/08/2026 21:56. (Baseline do plano macro: 909. Baseline citado na Fase 3: 1.011.)
- [x] Roteiro de dois aparelhos em produção (org de teste).
      **EXECUTADO em 19/08/2026 22:45–22:58.** Evidência completa em
      `docs/medicoes/2026-08-19-p1-p2-producao.md`, seção 2. Dois ciclos de conflito na chave
      `nr13_info_ZZ-FASE3`, mais a regressão do fluxo de exclusão com `ZZ-TESTE-EXCLUSAO`.
      **Lacuna nomeada:** o aparelho B foi encenado pela RPC (a mesma que qualquer aparelho
      chama), não por rede cortada — a **drenagem da fila offline** segue coberta só por teste
      automatizado.

---

## Critério de aceite

**Local — todos provados por teste automatizado (19/08/2026):**

- [x] Pré-condição executada e registrada
- [x] "Manter a minha" grava no servidor e sai da fila
- [x] Nenhum caminho trata `repetido` como sucesso sem gravação
- [x] `tentarNovamente`/`retentarTodas` recusam conflito
- [x] Zero `nr13_conflito_*` no `Map`
- [x] Uma cópia por chave, não por tentativa
- [x] Nenhuma versão descartada sem escolha explícita
- [x] Upgrade v1→v2 preserva as stores, provado por teste
- [x] Suíte verde, build limpo — 1042/1042, build sem erro

**Produção — executado em 19/08/2026:**

- [x] Roteiro de dois aparelhos executado e registrado (org de teste, `teste@gmail.com`,
      equipamentos `ZZ-TESTE-*`)
- [x] Desfecho dos 2 conflitos reais parados desde 14/08 registrado —
      **INSPECIONADOS, nenhuma ação tomada.** Não são itens antigos sobrevivendo: são
      **recriados a cada boot** pela migração de histórico, a partir de um relatório que ficou no
      array legado depois de o equipamento ter sido excluído. A causa é que sobrevive desde 14/08.
      Seção 3 do documento de medições, com as três saídas possíveis — a decisão é do dono
- [x] Confirmação de que o bundle em produção é posterior a `cb26450` — **SHA-256 do asset
      idêntico ao build local**, byte a byte
- [x] Conferência de que nenhum `nr13_conflito_*` sobrou em `dados` nos aparelhos migrados —
      **0 ocorrências**, verificado três vezes ao longo da sessão

**Aberto, e por que:**

- [ ] Conta `papel='cliente'` re-verificada nesta rodada — herdada da medição de 16/08; não tenho
      credencial de cliente e ela não deve existir do meu lado (item do P1, listado aqui porque
      é a única linha que separa os dois portões de "fechado sem ressalva")

## Roteiro de dois aparelhos — P2 (acordado em 19/08/2026)

Executar **depois do P1**, na conta `teste@gmail.com`, com chaves de equipamentos `ZZ-TESTE-*`.
Duas sessões (A e B) — janelas/perfis separados, para terem IndexedDB próprio.

> **Os 2 conflitos reais de 14/08 NÃO são material de teste.** Primeiro descobrir se ainda
> existem; se forem de dado real do dono, **apenas inspecionar e reportar**. Nenhuma ação neles
> sem autorização.

**Ciclo do conflito:**

- [x] Sessão A e sessão B abertas na mesma organização, mesma chave
- [x] A altera e sincroniza
- [x] B altera **offline**
- [x] B reconecta → **conflito real aparece** na tela
- [x] "Decidir depois" → estado permanece íntegro, nada se perde, item continua contado
- [x] "Usar a do servidor" → valor remoto prevalece no cache
- [x] A versão local perdedora fica preservada em "Versões substituídas"
- [x] Provocar um novo conflito
- [x] "Manter a minha" → o servidor realmente recebe o valor escolhido

**O que precisa ser inspecionado no momento da resolução** (DevTools → Application → IndexedDB,
e a aba Network para a chamada da RPC):

- [x] `mutationId` **NOVO** (diferente do original)
- [ ] `resolveDe` = id da mutação original
- [x] `versaoBase` = versão vigente do servidor
- [x] O item original **não** é reenviado como retry
- [x] `repetido` nunca é tratado como gravação quando a edição não foi aplicada

**Robustez:**

- [x] Falha de rede durante a resolução não perde nenhuma das versões
- [x] Fechar e reabrir o navegador → IndexedDB consistente
- [x] Conflito fora de `dados`
- [x] Conflito fora do `Map` normal
- [x] Store `conflitos` presente e usada
- [x] Máximo de **uma** entrada por chave (repetir a detecção não multiplica)
- [x] `tentarNovamente` recusa item em conflito
- [x] `retentarTodas` pula conflito
- [x] Versão substituída não entra no sync normal
- [x] Versão substituída não recria conflito
- [x] Descarte explícito funciona
- [x] Sem crescimento infinito (contar entradas antes/depois)
- [x] Fila termina correta (vazia ou só com o que deve ficar)
- [x] Selo/status de sincronização termina correto

**Regressão do fluxo de exclusão** (cobre o defeito de `f074a64`, corrigido — **não
reimplementar**, só provar que não voltou):

- [x] Criar equipamento `ZZ-TESTE-*` → sincronizar
- [x] Segunda sessão enxerga
- [x] Excluir → sincronizar
- [x] **Segunda sessão deixa de enxergar** — era exatamente isto que falhava: com pendência na
      chave, `lerTudo` a pulava (`itemDaChave`) e o `deletado_em` do servidor nunca era aplicado,
      então o equipamento apagado num aparelho continuava visível no outro, sem saída pela interface
- [x] Havendo o cenário de recusa/pendência correspondente
      (`tombstone_mais_novo` / `anterior_ao_corte`), validar as duas saídas do card:
      **"Recriar no servidor"** (mutação nova, base = versão informada na recusa) e
      **"Descartar a minha"**

**Fechamento:** marcar tudo que for comprovado, registrar a validação em
`docs/medicoes/`, atualizar `docs/ESTADO-DAS-FASES.md` e o `Ponto de retomada`, rodar suíte +
build, apresentar o P2. **PARAR.**

---

## Portão P2 — ABERTO

Definido no plano macro (`2026-08-15-evolucao-arquitetura.md`, "Portões de parada
obrigatórios"): P2 vem **depois da Fase 3** e é crítico por ser o único upgrade de schema do
IndexedDB do roteiro, mexendo no motor de sincronização.

Sequência do portão, e onde estamos:

```
validado local          ✅  1042/1042 + build limpo
commit                  ✅  f0e1817 · ecdf789 · 150948d · c54a84c · 81cfd79
push main               ✅  HEAD == origin/main
[dono faz o redeploy]   ✅ (16/08)  ·  ⏳ PENDENTE DE CONFIRMAÇÃO para os commits de 19/08
produção validada       ⏳  PARCIAL — exercitada, não medida nem registrada
relatório com números   ⏳
aprovação do dono       ⏳
próxima fase (4)        🚫  NÃO INICIAR
```

## Rollback

Reverter os commits do frontend. **O schema do IndexedDB não volta para v1** —
`indexedDB.open` com versão menor falha. É seguro porque o upgrade é aditivo: o código
antigo não conhece a store `conflitos` e ignorá-la é inofensivo. Único passo não
reversível da fase.

## Restrição operacional

Os **2 conflitos reais parados desde 14/08** no aparelho do dono não são tocados durante a
implementação. Eles são o material do teste manual **depois** do deploy — e até lá o botão
"Tentar de novo" deles continua sendo o gatilho de perda descrito na pré-condição.

> **19/08/2026 — não há registro do desfecho desses 2 conflitos.** Não sei se foram resolvidos,
> se ainda estão parados, ou se sumiram numa limpeza. Item aberto do P2.

---

## Log de execução

### 16/08/2026 — Tarefas 1, 2 e 6 · commit `f0e1817`
- `VERSAO_SCHEMA` 1 → 2, store `conflitos`, upgrade aditivo (`db.ts`);
- `guardarConflito` sai de `dados`, uma entrada por chave;
- migração das cópias antigas (`migrarConflitosAntigos`) + `PREFIXO_CONFLITO_LEGADO` em `familiasChave`;
- testes: `db.upgrade.test.ts` (4) e `sync.conflito.test.ts`.

### 16/08/2026 — Tarefa 3 · commit `ecdf789`
- `tentarNovamente` recusa item em conflito (era o defeito ativo: destruía a edição em silêncio);
- `drenar` segue pulando conflito.

### 16/08/2026 — Tarefas 4, 5 e 7 · commit `150948d`
- `resolverMantendoLocal` com **mutationId NOVO** + `resolveDe` + `versaoBase` = versão do servidor;
- `resolverUsandoServidor` (funciona offline);
- `descartarSubstituida`;
- tela `/pendencias`: comparação lado a lado, três ações, seção "Versões substituídas".

### 16/08/2026 — Ajustes de tela · commits `c54a84c`, `81cfd79`
- conflito aberto deixa de ser contado como "tudo salvo"; decisão sobe na hora;
- `rotuloChave` mapeia `nr13_pref_unidade_` → "Unidade de medida" (o card mostrava nome de chave).

### 19/08/2026 — Uso em produção revelou um buraco · commit `f074a64`
- Encontrado na conta `teste`: selo dizia "3 falhas", tela oferecia UMA decisão. Itens recusados
  por `tombstone_mais_novo`/`anterior_ao_corte` não têm `RegistroConflito` (o servidor não devolve
  valor — a chave foi EXCLUÍDA lá), então não apareciam. Pior: enquanto a pendência existia,
  `lerTudo` pulava a chave e o `deletado_em` nunca era aplicado — equipamento apagado no celular
  continuava na tela do computador, sem saída pela interface.
- Card próprio com **Recriar no servidor** (mutação nova, base = versão informada na recusa) e
  **Descartar a minha**. Item passou a guardar `versaoServidor`.
- **Este commit é da Fase 3 e não estava registrado em lugar nenhum.**

### 19/08/2026 22:35 — Redeploy anunciado · verificação de bundle preparada · BLOQUEADO
- Dono avisou **`REDEPLOY CONCLUÍDO`** (`main` @ `88956eb`, docs-only, contendo `cb26450`).
- **Método de confirmação do bundle definido e validado localmente.** Não existe carimbo de
  commit no build, então a prova é por **assinatura de string**: literais introduzidos por cada
  commit de 19/08 sobrevivem à minificação e podem ser procurados no JS servido em produção.
  Conferido contra o `dist/` local (build de HEAD):

  | Commit | String-assinatura | No `dist/` local |
  |---|---|---|
  | `cb26450` | `prontuário não coube no armazenamento` | ✅ presente |
  | `f074a64` | `Recriar no servidor` | ✅ presente |
  | `f074a64` | `Descartar a minha` | ✅ presente |
  | `150948d` (controle) | `Versões substituídas` | ✅ presente |
  | `81cfd79` (controle) | `Unidade de medida` | ✅ presente |

- **BLOQUEIO: falta a URL de produção e a autenticação.** A URL não está no repositório
  (`.env` não é versionado; o `Caddyfile` serve em `:80`; deploy manual no Coolify). E a senha de
  `teste@gmail.com` **não deve** ser gravada em código, Git, Markdown ou log — quem autentica é o
  dono.
- Nenhum teste de produção executado. P1 e P2 seguem **ABERTOS**.

### 19/08/2026 22:40–23:00 — P1 e P2 EXECUTADOS em produção
- Bundle confirmado por **SHA-256 idêntico** ao build local (prova mais forte que a assinatura de
  string planejada);
- **P1 passa**: mestre lê `app_storage` (HTTP 200), hidrata, lista, abre, edita, sincroniza, o
  servidor recebe, documento renderiza; as duas Edges do Portal recusam token de mestre com 403;
- **P2 passa**: 2 ciclos de conflito em `nr13_info_ZZ-FASE3`. "Usar a do servidor" e
  "Manter a minha" fizeram exatamente o previsto; `drenar` **pulou** o conflito (tentativas
  ficou em 1, servidor intacto) — que era o defeito ativo da fase; lado perdedor preservado nos
  dois sentidos; descarte explícito zera só o registro de conflito;
- Regressão do fluxo de exclusão provada com `ZZ-TESTE-EXCLUSAO`: criar → servidor vê →
  excluir → servidor marca `deletado_em` → outro aparelho deixa de ver, **sem fila residual**;
- 2 conflitos de `EQUIPE TESTE` **inspecionados e não tocados**. Descoberto que são **recriados a
  cada boot** — a causa é o array legado, não os itens;
- suíte **1042/1042**, build verde;
- **nenhum código alterado nesta sessão.**

### 19/08/2026 — Sessão de recuperação de estado (esta)
- Nenhum código alterado. Git, suíte, build e código conferidos;
- suíte **1042/1042** (84 arquivos), `npm run build` limpo;
- `HEAD == origin/main == cb26450`, working tree limpo;
- 26 checkboxes desta fase estavam abertos com a implementação pronta e commitada — corrigidos
  aqui, um por um, com a evidência ao lado;
- o que NÃO foi marcado: tudo que depende de produção.

---

## Ponto de retomada

- **Última coisa concluída:** **P1 e P2 executados e registrados em produção** (19/08/2026,
  22:40–23:00), na conta `teste@gmail.com`.
- **Commit de CÓDIGO atual:** `cb26450`. Último commit da Fase 3: `f074a64`.
- **Alterações locais:** nenhuma de código. Só documentação desta sessão.
- **Testes:** 1042/1042, 84 arquivos. Verde. · **Build:** verde.
- **Deploy:** **CONFIRMADO.** `https://app.nr13sistema.com.br` serve
  `/assets/index-AIiLkfur.js` com SHA-256 `01e05db6…b48250`, **idêntico byte a byte** ao build
  local do `main`. Service worker `nr13-cache-v8` nos dois lados.
- **Produção:** P1 **passa**, P2 **passa**. Evidência completa em
  `docs/medicoes/2026-08-19-p1-p2-producao.md`.
- **Pendências reais que sobraram:**
  1. **Aprovação do dono** para P1 e P2 — é o único passo que falta na sequência do portão;
  2. conta `papel='cliente'` não re-verificada nesta rodada (sem credencial; a prova de 16/08
     continua valendo e está registrada);
  3. drenagem da fila **offline** não exercitada manualmente — o aparelho B foi encenado pela
     RPC; esse trecho segue coberto só por teste automatizado;
  4. primeiro clique em "Manter a minha" não registrou, sem erro no console — **não
     diagnosticado**, provável causa de automação (layout deslocou entre localizar e clicar);
  5. 🔴 **os 2 itens de `EQUIPE TESTE` são RECRIADOS a cada boot.** Inspecionados, **intocados**.
     A migração de histórico lê o array legado `nr13_historico_relatorios`, não acha o
     `nr13_rel_` correspondente (o equipamento foi excluído) e recria as chaves com `versaoBase 0`;
     o servidor recusa com `versao_obsoleta`. Gerador permanente de pendência. **Não é defeito da
     Fase 3** — é a interseção do §7-sexies com o achado A-13.
- **Próxima ação:** dono lê o resultado e **aprova ou recusa P1 e P2**.
- **Não fazer ainda:** Fase 4 (Portal: arquitetura de leitura) — nenhuma linha antes da aprovação.
  Também **não** corrigir o item 5 por conta própria: mexe no array legado, que é o backup da
  migração de 14/08, e precisa de decisão + fase própria.
