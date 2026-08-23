# FASE 9 — Escala, busca e carregamento sob demanda · **DESENHO ARQUITETURAL**

**22/08/2026** · v2, com as **decisões arquiteturais do dono incorporadas** (ver §26)

> **NADA FOI IMPLEMENTADO.** Nenhum schema, nenhuma migration, nenhum índice, nenhuma tabela, nada
> em `src/`. Este documento existe para ser **aprovado**. O task-level de implementação só nasce
> depois da sua revisão desta versão.

**Baseline que este desenho precisa derrubar:**
[Fase 8 — fechamento](../../medicoes/2026-08-22-fase8-fechamento.md)

| | 1.000 equipamentos | ~51.000 |
|---|---|---|
| FCP / abertura | 440 ms | **> 10 min** |
| `/equipamentos` | 2,20 s | **~4 min de bloqueio** |
| Nós no DOM | 42.283 | **2.292.273** |
| Heap | 97 MB | **1,63 GB** |
| | utilizável | **inutilizável** |

---

## 1 · Arquitetura atual relevante

### 1.1 A amarra central

```
ler(chave)  →  cache.obterRegistro(chave)  →  Map em memória     ← SÍNCRONO
```

`ler()` é **síncrono**. Toda tela chama `ler()` durante o render. Uma tela que rodasse antes da
hidratação veria o `Map` vazio e concluiria "conta vazia" — o sumiço de dado que a v2 existe para
consertar.

Por isso `RotaProtegida` instalou uma **barreira**, e o comentário dela diz o porquê:

> *"Barreira: organização, IndexedDB, Map, fila e tombstones ANTES de qualquer tela. Sem isso uma
> tela poderia listar zero equipamentos só porque chamou `ler()` antes da hidratação terminar."*

```
BOOT → iniciarArmazenamento()        (local: org, IndexedDB, Map)
     → await lerTudo()               ← BARREIRA: baixa a organização INTEIRA
     → migrações em segundo plano
     → primeira tela
```

**A barreira não é o defeito. O defeito é ela ter de esperar a organização inteira.**

### 1.2 Quem depende do cache completo

| Consumidor | O que faz | Precisa de tudo? |
|---|---|---|
| `equipamentoService.listarEquipamentos` | `listarChavesComPrefixo('nr13_info_')` + resumo de cada | **Não** — precisa de uma página |
| `vencimentos.listarVencimentos` | varre `nr13_info_` + `nr13_vida_` + índices | **Sim hoje** — é agregado (§15) |
| `Dashboard`, `Layout`, `Vencimentos`, `limiteTrial` | `.length` de `nr13_info_` | **Não** — é um `count` |
| `LivroRegistro` | varre `nr13_info_` + livro de cada | **Não** — precisa de uma página |
| `rastreabilidadeService` | prefixo `nr13_rastreab_` | Sim, mas lista pequena e global |
| `livroAssinatura`, `recuperacaoArquivos` | migrações | rodam em segundo plano |

### 1.3 O palco — e a ponte que ele oferece

`palco.coletarItens(tag)` monta o `localStorage` para os 40+ templates HTML a partir de:

```js
chavesDaTag(tag)                     // índice por TAG — barato
+ GLOBAIS                            // 6 chaves fixas
+ chavesComPrefixo('nr13_rastreab_') // lista pequena, escopo de ID
+ chavesDeCalibracaoDaTag(tag)       // filtrada pela lista daquela TAG
```

> **O palco JÁ É por TAG.** Gerar relatório ou prontuário **nunca precisou** da organização
> inteira. **Fundamento aprovado pelo dono**, e é a ponte que permite sair da hidratação integral
> **sem reescrever um único template**.

### 1.4 O precedente de cache parcial

O **cliente do Portal não hidrata** (Fase 0-B, achado A-01). Recebe cache **parcial** por
`semearCachePortal(chaves)` → `storageV2.semearCache(chaves)`, já filtrado pelo servidor.

> **A primitiva já está escrita e em produção.** **Fundamento aprovado pelo dono.** A Fase 9
> generaliza um padrão existente. **Mas generalizar não pode relaxar segurança** — ver §9.

### 1.5 Busca hoje

**Não existe busca no servidor.** Zero `.ilike/.like/.textSearch/.or` em todo o `src/`. Medido com
50.000 equipamentos:

| | Plano | Buffers | Tempo |
|---|---|---:|---:|
| TAG exata | `Index Scan` | 4 | 0,07 ms ✅ |
| Prefixo de TAG | `Parallel Seq Scan` | 10.917 | 26 ms ❌ |
| Fabricante / nº série / nome | `Parallel Seq Scan` | 10.917 | 57 ms ❌ |
| Relatório por código | `Parallel Seq Scan` | 10.917 | 80 ms ❌ |

Causa: `valor` é `text` **opaco**; `chave` é `btree text_ops` sob collation `en_US.UTF-8`, que não
serve `LIKE 'prefixo%'`.

---

## 2 · Causa-raiz, e por que cada remédio isolado falha

| Sintoma medido | Causa-raiz |
|---|---|
| > 10 min para abrir com 51.000 | Barreira de hidratação integral |
| 583 requisições onde 111 bastavam | `lerTudo()` sem throttle na v2 + duas chamadas concorrentes |
| 2.292.273 nós no DOM | `.map()` sobre a coleção inteira, sem paginação nem virtualização |
| 1,63 GB de heap | `Map` com a org inteira **+** 2,29 M de nós **+** objetos do React |
| Busca não acha fabricante | `.filter()` sobre 3 campos escolhidos no cliente |
| Busca por conteúdo é `Seq Scan` | `valor` é `text` opaco; não há camada pesquisável |

- **Só throttle** → continua baixando a organização inteira, uma vez. **~415 MB em 50.000.**
- **Só virtualização** → DOM controlado, boot ainda de minutos.
- **Só busca server-side** → busca rápida, boot e listas ainda carregam tudo.

> **Resolvidos juntos, nesta ordem de dependência:** deixar de exigir a organização inteira →
> paginar o transporte → limitar o DOM. A busca server-side é o que torna a paginação utilizável.

---

## 3 · Arquitetura alvo

```
LOGIN
 └─ sessão + perfil + flags
 └─ hidratarEssencial()        globais pequenas, teto conhecido
 └─ SHELL UTILIZÁVEL           ← a barreira termina AQUI

/equipamentos
 └─ listarPagina(cursor, filtros)   → projeção leve, 50 por página
 └─ virtualização                   → DOM proporcional à viewport

busca
 └─ ONLINE  → consulta na projeção, no servidor
 └─ OFFLINE → mesma consulta sobre o CATÁLOGO cacheado (§8)

abrir equipamento
 └─ carregarEquipamento(tag)  → chaves daquela TAG → semearCache()
 └─ palco/documentos          → já funcionam, são por TAG

/relatorios
 └─ índice leve paginado + busca
 └─ PDF                       → só no clique, via pdfRef  (já é assim ✅)
```

---

## 4 · A estratégia oficial de compatibilidade — como sair da amarra síncrona

> **Pedido explícito do dono:** mostrar como sair de *"antes de qualquer tela funcionar, o `Map`
> precisa conter a organização inteira"* **sem reescrever os 40+ templates**.

**Esta é a estratégia oficial da Fase 9.** O fluxo, concreto:

```
1. LISTA LEVE
   /equipamentos consulta a projeção (servidor ou catálogo cacheado).
   Nada disso passa pelo `Map`. Nenhuma chave `nr13_*` é necessária.

2. USUÁRIO ABRE UMA TAG
   carregarEquipamento(tag)
     → busca as chaves daquela TAG no servidor (ou já as tem no cache)
     → semearCache({ 'nr13_info_VASO-203': '…', 'nr13_calc_…': '…', … })

3. O CÓDIGO LEGADO SÍNCRONO CONTINUA FUNCIONANDO
   ler('nr13_info_VASO-203') encontra a chave no Map. Nada mudou para ele.
   `montarResumo`, a ficha, o memorial, a categoria — tudo intacto.

4. O PALCO COLETA AQUELA TAG
   coletarItens(tag) = chavesDaTag(tag) + GLOBAIS + rastreab + calibrações
   Todas presentes, porque o passo 2 as semeou.

5. O DOCUMENTO FUNCIONA
   Os 40+ templates HTML leem o localStorage materializado, exatamente como
   sempre leram. NENHUM template é tocado.
```

**Por que isto fecha:** `ler()` continua síncrono; o `Map` continua sendo a interface; o palco
continua por TAG. **O que muda é apenas QUANDO o `Map` é preenchido** — de "tudo, antes da primeira
tela" para "o que a tela precisa, quando precisa".

**As duas garantias que sustentam a ponte:**

| | |
|---|---|
| `semearCache()` | já existe, em produção, usado pelo Portal (§1.4) |
| `coletarItens(tag)` | já é por TAG, não varre a organização (§1.3) |

**Contrato que a Fase 9 assume:** nenhuma tela pode chamar `ler()` de uma TAG que não foi semeada.
Isto vira **regra e teste**: `carregarEquipamento(tag)` é obrigatório antes de qualquer rota de
detalhe, documento ou inspeção.

---

## 5 · Modelagem das projeções

### 5.1 Duas projeções — **DECISÃO 1, aprovada**

Uma por domínio: as consultas, os campos, os índices, os filtros e o **ciclo de vida** são
diferentes. Uma tabela genérica com `jsonb` repetiria o erro que estamos consertando — voltaria a
ser opaca.

Também foi descartado alterar o próprio `app_storage` com colunas geradas: é a tabela mais quente
do sistema, com quatro políticas de RLS e a guarda `trg_guardar_app_storage`. **Camada aditiva é
reversível; alterar `app_storage` não é.**

Nomes finais a decidir tecnicamente no task-level.

### 5.2 Identidade entre fonte e projeção — **exigência do dono**

Toda linha de projeção precisa responder: **"esta projeção corresponde a qual versão da verdade?"**

| Coluna | Papel |
|---|---|
| `org_id` | escopo (RLS) |
| `tag` / `relatorio_id` | identidade do recurso |
| **`source_version`** | `app_storage.versao` da chave de origem no momento da projeção |
| **`source_updated_at`** | `app_storage.atualizado_em` da origem |
| **`projected_at`** | quando esta linha foi escrita |

Serve **auditoria, reparo, rebuild, detecção de atraso e rollout** — os cinco usos que você listou.
A auditoria do §7.3 compara `source_version` com a verdade e **não depende de nenhum outro
mecanismo funcionar**.

### 5.3 Campos

**Equipamentos** — origem: `nr13_info_`, `nr13_cat_`, `nr13_emp_`, `nr13_vida_`, `nr13_fotos_`:

`tag` · `descricao` · `tipo` · `subtipo` · `categoria` · `fabricante` · `numero_serie` ·
`localizacao` · `ano` · `cliente` · `proxima_inspecao` (**date**) · `tem_foto` (bool)

**Relatórios** — origem: `nr13_historico_indice_`:

`relatorio_id` · `tag` · `codigo` · `nome` · `tipo` · `emissao` (**date**) · `validade` (**date**) ·
`profissional` · `status` · `pdf_ref` · `sha256` · `paginas`

> Hoje `emissao`/`validade` são string `DD/MM/AAAA`. **Normalizar para `date` na projeção** é o que
> torna busca por período indexável.

**Nada de blob, base64, snapshot, foto, PDF ou JSON pesado.**

### 5.4 Peso — **estimativa, não contrato**

> **Ressalva do dono, acatada:** os ~250 B são **baseline de direção**, não compromisso.

| | Por equipamento | 50.000 |
|---|---:|---:|
| Dado completo (**medido** na Fase 8) | 8,3 kB | ~415 MB |
| Projeção leve (**estimado**) | ~250 B | ~12,5 MB |
| Razão | | **~33×** |

**Obrigatório medir depois da modelagem real**, e publicar em `docs/medicoes/`: tamanho médio de
linha · peso dos índices · overhead do Postgres (TOAST, fillfactor) · bytes transferidos por
página · tamanho no IndexedDB.

**O compromisso é qualitativo e esse não muda:** a projeção fica **várias ordens de grandeza** mais
leve que o registro completo. Se a medição mostrar que não ficou, o desenho volta à mesa.

---

## 6 · Consistência — **DECISÃO 3, ajustada pelo dono**

> **Regra:** a gravação da verdade **não depende** do sucesso da projeção. **Mas** qualquer falha
> ou divergência precisa ficar **duravelmente detectável e recuperável**. Consistência eventual é
> aceita. **Divergência silenciosa permanente, não.**

### 6.1 A hierarquia — e ela é o coração desta seção

> **Regra de ouro:** **falha em QUALQUER mecanismo derivado nunca pode virar falha da verdade.**

Três níveis, e cada um é *menos* essencial que o anterior:

| Nível | Papel | Se falhar |
|---|---|---|
| **1 · `app_storage`** | **A VERDADE** | A transação aborta, a mutação **fica na fila do cliente** e é reenviada. Nada se perde |
| **2 · Projeção** | Derivada, para busca | Rollback só do bloco dela. A verdade permanece |
| **3 · Pendência** | **Best-effort** — apenas acelera o reparo | Rollback só do bloco dela. **Nem a verdade nem a projeção são afetadas** |

> **A pendência é uma otimização, não uma garantia.** A garantia é a **auditoria por
> `source_version`** (§6.3), que funciona **mesmo que o mecanismo de pendência nunca tenha
> funcionado um único dia**. Foi assim que a brecha se fechou: em vez de tornar o registro da
> pendência infalível, o desenho passou a **não depender dele**.

### 6.2 O mecanismo, com os dois níveis de proteção

```sql
-- dentro de aplicar_mutacao_storage, transação única

--  NÍVEL 1 ── A VERDADE. Escrita primeiro, e nunca condicionada ao que vem depois.
update/insert public.app_storage ... ;          -- v_nova = versão persistida

--  NÍVEL 2 ── PROJEÇÃO (subtransação: BEGIN..EXCEPTION cria um savepoint)
begin
  perform public.projetar_equipamento(v_org, p_chave, v_nova, v_agora);
exception when others then

  --  NÍVEL 3 ── PENDÊNCIA, dentro do próprio handler, com savepoint PRÓPRIO.
  --  É ESTE bloco que fecha a brecha: sem ele, uma falha ao gravar a pendência
  --  escaparia do handler do nível 2 e abortaria a transação inteira —
  --  derrubando a verdade que já estava escrita.
  begin
    insert into public.busca_pendencias (org_id, chave, motivo, criado_em)
    values (v_org, p_chave, sqlerrm, v_agora)
    on conflict (org_id, chave) do update set tentativas = busca_pendencias.tentativas + 1;
  exception when others then
    --  Fim da linha: NÃO propaga. A auditoria (§6.3) detecta esta divergência
    --  sem precisar que esta linha exista.
    null;
  end;
end;

--  commit  →  a verdade está salva nos três cenários
```

**Por que os blocos aninhados resolvem:** em PL/pgSQL, todo `BEGIN … EXCEPTION … END` é uma
**subtransação** com *savepoint* próprio. O rollback vai até o savepoint **daquele** bloco e não
além. O handler interno com `null` **não pode levantar exceção**, então nada escapa do nível 3.

**Alternativas consideradas e por que esta venceu:**

| Alternativa | Por que não |
|---|---|
| Só auditoria, sem pendência | Correto, mas o reparo dependeria de a auditoria rodar. A pendência dá reparo rápido **de graça** — desde que não seja obrigatória |
| Pendência via `RAISE WARNING` no log do Postgres | Não é consultável nem durável de forma útil no Supabase |
| Pendência numa transação autônoma (`dblink`/`pg_background`) | Dependência externa e conexão nova por escrita. Custo alto para um mecanismo que é best-effort |

### 6.3 As cinco garantias, provadas

| # | Garantia | Como o desenho prova |
|---|---|---|
| **1** | **Falha da projeção não aborta a verdade** | O `update/insert` do nível 1 acontece **antes** e fora da subtransação. O rollback do nível 2 vai só até o savepoint dele |
| **2** | **Falha ao registrar a pendência também não aborta a verdade** | O nível 3 tem savepoint próprio e handler `null`, que **não pode levantar**. Nada escapa para o nível 2 nem para a transação |
| **3** | **A auditoria não depende da pendência existir** | Ela compara `equipamentos_index.source_version` com `app_storage.versao` **direto nas duas tabelas**. Não lê `busca_pendencias` |
| **4** | **Projeção ausente ou desatualizada continua detectável** | Ausente → *anti-join* acha a chave sem linha. Desatualizada → `source_version < versao`. **Os dois casos pela mesma consulta** |
| **5** | **Reparo posterior converge** | `reparar_pendencias` (rápido, quando há pendência) **ou** `reconstruir_indice_busca` (completo, sempre disponível). Ambos idempotentes e partindo da verdade |

**A rede de segurança mais externa, que já existe:** se a transação inteira abortar — banco fora
do ar, disco cheio, conexão perdida —, a RPC não confirma a mutação, ela **permanece em**
`nr13_fila_sync` **no cliente** e é reenviada. É o mesmo mecanismo que sustenta o trabalho de campo
offline hoje. **Nenhum cenário perde dado.**

### 6.3.1 `source_version` — de onde ele vem, e de onde NÃO vem

> **Exigência do dono:** a autoridade da convergência é a **versão efetivamente persistida da
> verdade pela mesma mutação**. Nada de timestamp de frontend.

| | |
|---|---|
| **`source_version`** | **`v_nova`** — exatamente o inteiro gravado em `app_storage.versao` por **esta** mutação. Mesma variável, mesma transação |
| **`source_updated_at`** | o `now()` da transação, o mesmo gravado em `atualizado_em` |
| **`projected_at`** | quando a linha da projeção foi escrita |

**Não é criado contador novo.** `app_storage.versao` já é o versionamento do sistema — o mesmo que
a RPC usa para detectar conflito e o mesmo do piso de tombstone. A projeção **reusa** essa
semântica.

**Explicitamente proibido como autoridade de convergência:** `mutado_em_cliente`. O próprio
`armazenamento_v2.sql` o marca como **`AUDITORIA APENAS`** — é relógio de aparelho, sujeito a
fuso, atraso e adulteração. Usá-lo para decidir convergência contradiria o desenho existente.

**Consequência prática:** a auditoria é uma comparação de inteiros na mesma transação-fonte, sem
ambiguidade de relógio.

### 6.5 O caso do item recém-salvo — **pedido do dono**

*Usuário salva `VASO-203`; a verdade grava; a projeção fica pendente por alguns segundos. O
equipamento não pode "desaparecer" da tela.*

**Três camadas, e a primeira já resolve quase sempre:**

1. **Caminho feliz — não há atraso.** A projeção é escrita na mesma transação da RPC. Quando a RPC
   retorna, a projeção **já está em dia**. A lista seguinte já mostra `VASO-203`.

2. **Escrita local é imediata, e é a rede de segurança.** O app grava no `Map` local antes/junto do
   envio (é assim que o offline funciona hoje). Então o item **existe no cliente** mesmo que o
   servidor ainda não o tenha projetado.
   → **A lista funde os itens escritos localmente e ainda não confirmados** sobre o resultado do
   servidor, deduplicando por TAG. Item recém-salvo **sempre aparece**, e no topo.

3. **Offline ou pendente — a UI diz.** Se o item veio da fila local e ainda não foi confirmado,
   ganha o mesmo selo de sincronização que o `SyncStatus` já usa. **Nunca some sem explicação.**

> **Regra de UX, e ela é inegociável:** o usuário **nunca** perde de vista o que acabou de salvar.
> Este projeto já teve o defeito de dado sumindo da tela; a Fase 9 não pode reintroduzi-lo por uma
> otimização de busca.

---

## 7 · Rebuild e reparo

### 7.1 `reconstruir_indice_busca(org_id, lote)`

**Requisitos confirmados:** idempotente · paginado · retomável · observável · **por organização** ·
sem alterar histórico · sem PDFs · sem base64 · **sem efeito colateral empresarial**.

- Lê `app_storage` da org em lotes com cursor por `chave`; monta as linhas; `upsert` por PK.
- Grava a posição a cada lote — retomar é continuar do cursor.
- **Não apaga o que não reconheceu.** Remoção só por tombstone explícito, mesma regra do §2-ter.
- Roda com `service_role`. **Nunca** disparada pelo cliente.
- **Não escreve em `app_storage`.** Só lê. Isso é o que garante "sem efeito colateral empresarial".

### 7.2 `reparar_pendencias(org_id, lote)`

Consome `busca_pendencias`, reprojeta cada recurso a partir da verdade, remove a pendência
resolvida. Idempotente. Conta tentativas — pendência que não resolve depois de N tentativas vira
**alerta**, não desaparece.

### 7.3 Auditoria de convergência

```
para a org:
  equipamentos vivos em app_storage   ×   linhas em equipamentos_index
  onde falta, onde sobra, onde source_version ≠ versao
```

**Zero divergências = prova de convergência.** É o critério do portão P9.1.

---

## 8 · Offline — **DECISÃO 4, aprovada**, com a separação que o dono exigiu

> **Bloqueante:** busca server-side **não pode** virar "sem internet, listas vazias".

### 8.1 Catálogo ≠ dados completos offline

**A distinção mais importante desta seção**, e é do dono:

| | **CATÁLOGO** (metadados leves) | **DADOS COMPLETOS** |
|---|---|---|
| O que é | a projeção da organização | as chaves `nr13_*` de uma TAG |
| Tamanho | ~250 B × N — **12,5 MB em 50.000** (a medir) | 8,3 kB × N — **~415 MB em 50.000** |
| Fica offline? | **Sim, inteiro** | **Não. Só o que for escolhido** |
| Serve para | pesquisar, listar, saber que existe | abrir, editar, gerar documento |

> **Conhecer e pesquisar milhares ≠ ter milhares completos no aparelho.** 50.000 equipamentos
> cadastrados **não** significa 50.000 completos offline.

### 8.2 Comportamento

| | Online | Offline |
|---|---|---|
| Lista | página do servidor | página do catálogo cacheado |
| Busca | consulta no servidor | **mesma consulta**, sobre o catálogo |
| Detalhe | sob demanda | só se a TAG estiver no cache completo |
| Documento | palco por TAG | idem |
| PDF | busca no Storage | só se já cacheado |

### 8.3 Pré-carga — **manual e explícita na primeira versão**

O usuário escolhe o que levar: equipamentos selecionados, ou um conjunto (unidade/cliente). A UI
mostra **quantos** e **quanto ocupa** antes de baixar. Simples e previsível.

**Automático fica para depois**, com número medido — candidatos: os N com inspeção próxima, ou os
recém-abertos. **Não entra na primeira versão.**

### 8.4 O que a UI precisa dizer

- Selo no campo de busca: *"buscando no que está neste aparelho"*.
- Resultado sem detalhe cacheado: o card **aparece**; abrir avisa que precisa de conexão.
- **Nunca** mostrar lista vazia sem explicar por quê.

---

## 9 · RLS e segurança — o precedente do Portal **não relaxa nada**

> **Alerta do dono, acatado:** generalizar `semearCache()` não pode afrouxar segurança.

| Papel | `equipamentos_index` / `relatorios_index` |
|---|---|
| `mestre` / sub-login | `select` onde `org_id = org_atual()` |
| `cliente` (Portal) | **Nenhum acesso direto.** Continua pela Edge `portal_cliente`, que filtra por vínculo |
| `anon` | nenhum |
| Escrita | **ninguém** pelo PostgREST. Só a RPC (`security definer`) e o rebuild |

**Invariantes preservadas:**

- **P1** e **P3** intactos.
- **Fail closed:** sem política que case, não devolve linha.
- **Hash/path nunca é autorização.** A projeção guarda `pdf_ref` como *referência*; quem autoriza o
  download continua sendo a política do bucket, **inalterada**.
- **`semearCache()` generalizado semeia apenas o que o servidor já autorizou a devolver.** Ele não
  ganha poder novo: continua sendo um depósito no cache local do que a RLS deixou passar.
- **Recursos vinculados** do Portal seguem a mesma regra de hoje.

**Teste que trava:** usuário da org A consultando a projeção **não** vê linha da org B — igual ao
que a Fase 4 fez para o Portal.

---

## 10 · Paginação — keyset, não OFFSET

`OFFSET 40000 LIMIT 50` obriga o Postgres a **produzir e descartar 40.000 linhas**.

```sql
where org_id = $1 and tag > $cursor
order by tag
limit 50
```

| | OFFSET | **Keyset** |
|---|---|---|
| Página 800 | **cresce linearmente** | **igual à página 1** |
| Inserção durante a navegação | pula/duplica | estável |

Página de **50**. Busca devolve no máximo **50 + cursor**, nunca "todos os 20.000".
**A ser provado por benchmark em 5.000 / 20.000 / 50.000** — não por teoria.

### 10.1 Regra fixada pelo dono — ordenação estável com desempate único

> **Toda paginação por cursor precisa de ordenação estável, determinística e com desempate
> único.** Cursor sobre campo que pode empatar causa **item duplicado, item pulado e paginação
> inconsistente**.

A última coluna da ordenação é sempre uma **chave única daquele domínio**:

| Tela | Forma | Desempate |
|---|---|---|
| Equipamentos por TAG | `order by tag` | `tag` **já é único** por org |
| Equipamentos por data | `order by proxima_inspecao, tag` | `tag` |
| Relatórios por emissão | `order by emissao desc, relatorio_id` | `relatorio_id` |

**A ordenação concreta de cada tela fica para o task-level** — a regra é que ela **sempre termina
em coluna única**. Teste obrigatório: paginar do início ao fim com **inserção concorrente**, e
provar que nenhum item é pulado nem devolvido duas vezes.

---

## 11 · Busca — **DECISÃO 5**: uma modalidade, um índice, um benchmark

> **Ajuste do dono:** não assumir que `tsvector` resolve tudo. **Não existe índice universal.**

| Modalidade | Consulta real | Índice apropriado | Observação |
|---|---|---|---|
| **TAG exata** | `tag = $1` | PK `(org_id, tag)` | já medido: **4 buffers, 0,07 ms** |
| **Prefixo de TAG** | `tag like $1 \|\| '%'` | `(org_id, tag text_pattern_ops)` | a Fase 8 provou que `text_ops` + `en_US.UTF-8` **não** serve |
| **Nº de série** | igualdade **ou** prefixo — **definir pela UX real** | `(org_id, numero_serie)` ou com `text_pattern_ops` | decidir **como o usuário digita** antes de escolher |
| **Código de relatório** | igualdade ou prefixo | `(org_id, codigo)` | muito seletivo |
| **Nome / descrição / fabricante** | busca por **palavra** | `GIN` sobre `tsvector` gerado | **só se a semântica de palavra bastar** |
| **Período** | `emissao between` | `(org_id, emissao desc)` | exige `emissao` como `date` |
| **Filtro tipo/categoria** | `= $1` + ordem | `(org_id, tipo, tag)` — **só se o benchmark mostrar ganho** | poucas categorias podem dispensar |

**Cada linha da tabela vira um experimento:** consulta real → índice candidato →
`EXPLAIN (ANALYZE, BUFFERS)` **antes e depois** → decisão registrada. Índice sem benchmark **não
entra**.

**`pg_trgm`: NÃO agora.** Só entra se precisarmos de **substring no meio de palavra**, *contains*
ou tolerância a erro de digitação — **e** houver benchmark mostrando benefício sobre a alternativa.
Instalar extensão e índice GIN caro por precaução é exatamente o que não vamos fazer.

---

## 12 · Virtualização — responsabilidade separada

| Mecanismo | Controla |
|---|---|
| **Cursor/paginação** | quanto vem **do servidor** |
| **Virtualização** | quanto vai **para o DOM** |
| **Busca server-side** | não baixar a coleção para achar poucos itens |

Com 50 por página a virtualização parece dispensável — **mas** "carregar mais" acumula: 20 páginas
= 1.000 cards × 42 nós = **42.000 nós**, o número já medido. **Então é necessária.**

Requisitos: altura variável · thumbnails · responsivo · mobile · compatível com busca, filtros e
seleção. Biblioteca escolhida **com medição** — candidatos: `@tanstack/react-virtual` ou
implementação própria com `IntersectionObserver` (já usado em `FotoImg`).

---

## 13 · UX de busca

### `/relatorios` — hoje tem **zero** campo de texto

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔍 Buscar por TAG, equipamento ou nº do relatório…             [×] │
└──────────────────────────────────────────────────────────────────────┘
   [ Tipo ▾ ]  [ Período ▾ ]  [ Ordenar ▾ ]              128 resultados
```

| Requisito | |
|---|---|
| Busca **visível** | Não atrás de "Filtrar" — o erro medido em `/equipamentos` |
| Limpar | botão `×` e `Esc` |
| Carregando | esqueleto, não spinner que salta |
| Zero resultados | texto útil, com o termo e como limpar |
| Contador | "128 resultados" |
| **Debounce** | 300 ms, porque é server-side |
| **Cancelar resposta antiga** | `AbortController` + descartar resposta cujo termo não é o atual — senão a resposta lenta de "vas" sobrescreve a de "vaso" |
| Teclado | foco por `/`, setas, `Enter` abre |
| Acessibilidade | `role="searchbox"`, `aria-live` na contagem |
| Mobile | campo em largura total, filtros em bottom-sheet |
| **Item recém-salvo** | sempre visível (§6.4) |

**Estado na URL:** `/relatorios?q=vaso&tipo=periodica` — recarregar, voltar do detalhe, compartilhar
e histórico funcionam.

---

## 14 · Ordem das telas — **DECISÃO 6**: infraestrutura antes do visual

| Ordem | Tela | Por quê |
|---|---|---|
| **1** | `/equipamentos` | maior DOM medido, tem busca a corrigir, é a porta de entrada |
| **2** | `/relatorios` | **zero busca hoje**; o caso concreto levantado pelo dono |
| 3 | `/inspecoes`, `/prontuarios` | mesmo padrão |
| 4 | `/calibracoes` | + tirar `listarCalibracoes` do render |
| 5 | `/livro-registro` | varre todo `nr13_info_` |
| 6 | `/vencimentos`, `/dashboard` | dependem de agregado (§15) |
| 7 | `/empresas` | busca na lista local |

---

## 15 · Dashboard e vencimentos — **DECISÃO 7**: híbrido

`listarVencimentos()` percorre **todos** os `nr13_info_`. Não é lista — é **agregado**.

| | Fonte | UI |
|---|---|---|
| **Online** | consulta agregada no servidor sobre a projeção | números exatos |
| **Offline** | catálogo cacheado, do último sync | **selo com a data do último sync** |

> **Exigência do dono:** offline **não pode** apresentar informação antiga como se tivesse acabado
> de ser consultada. O cartão mostra *"dados de HH:MM"* quando vier do cache.

`proxima_inspecao` como `date` torna a consulta trivial:
`where org_id = $1 and proxima_inspecao < now() + interval '30 days'`.

**O Dashboard não volta a varrer a organização inteira.**

---

## 16 · Fallback — com o cuidado que o dono pediu

> **Não pode ser:** *"se não tem projeção, hidrata 50.000 equipamentos"*.

| Situação | Comportamento |
|---|---|
| Org **sem** projeção (ainda não migrada) | Caminho atual, **temporário**. O backfill remove essa necessidade |
| Org **com** projeção, flag desligada | Projeção escrita e em dia; ninguém lê |
| Org **com** flag ligada | Lê da projeção |
| **Consulta da projeção falha pontualmente** | Erro tratado na UI + retry. **Não** cai em hidratação integral |
| **Item pontual** ausente da projeção | Reparo (§7.2); a UI mostra o que tem |
| Bundle antigo | Caminho atual — a projeção não muda `app_storage` |

**O fallback existe para o rollout, não para sempre.** Critério de saída: quando todas as orgs
tiverem backfill concluído e auditoria em zero, **o caminho de hidratação integral é removido** —
e isso é tarefa explícita da 9G, não "algum dia".

---

## 17 · Backfill

- **Por organização**, sob autorização explícita. Nunca global automático.
- Paginado (lotes de 1.000), **retomável** por cursor, **idempotente** (`upsert` por PK).
- **Observável**: linhas processadas, tempo, erros, posição.
- Não bloqueia usuário: a org funciona pelo fallback enquanto não termina.
- **Roda no servidor**, lendo `app_storage` direto. **O cliente não baixa nada.** Inegociável — a
  cota do Supabase está sob aviso.

---

## 18 · Rollout — **DECISÃO 6**, infraestrutura antes da migração visual

| Etapa | Entrega | Rollback |
|---|---|---|
| **9A** | Projeções + RLS + `busca_pendencias` + rebuild + auditoria + backfill. **Nenhum leitor.** | `drop` — nada depende |
| **9B** | Escrita da projeção na RPC (com savepoint e pendência) + auditoria rodando. **Ainda nenhuma leitura** | Reverter a função (versionada) |
| **9C** | **Piloto `/equipamentos`** — busca server-side, keyset, virtualização, catálogo offline. **Flag por organização** | Desligar a flag |
| **9D** | Sair da hidratação integral: `hidratarEssencial()` + `carregarEquipamento(tag)`. **A etapa mais arriscada** | Flag: a barreira volta |
| **9E** | **`/relatorios`** — a tela sem busca nenhuma | Flag por tela |
| **9F** | Demais telas de escala, uma por vez | Flag por tela |
| **9G** | Secundários + **remover o caminho de hidratação integral** | Independentes |

**Cada etapa:** local → testes → commit → deploy → validação em produção → portão → próxima.

> **9D vem depois de 9C** porque desfaz a barreira que impede "conta vazia". Só depois de a leitura
> pela projeção estar provada em produção.

### Portões

| Portão | Depois de | Libera |
|---|---|---|
| **P9.1** | 9A + 9B | Projeção escrita e **auditoria em zero divergências** |
| **P9.2** | 9C | `/equipamentos` pela projeção, validado em produção sob flag |
| **P9.3** | 9D | Boot sem hidratação integral, **com offline provado** |
| **P9.4** | 9E + 9F | Telas migradas |
| **P9.5** | 9G + benchmarks | Fase 9 concluída |

---

## 19 · Arquivos e schema que seriam tocados

**Nada disto foi feito.** É o mapa para o task-level.

### Banco (novo)

| Arquivo | Conteúdo |
|---|---|
| `supabase/busca_index.sql` | as duas projeções, `busca_pendencias`, índices, RLS, grants |
| `supabase/busca_index_rollback.sql` | `drop` na ordem inversa |
| `supabase/busca_manutencao.sql` | rebuild, reparo, auditoria |
| `supabase/armazenamento_v2.sql` | **modificado**: `aplicar_mutacao_storage` com o savepoint do §6.1 |

### Frontend

| Arquivo | Papel |
|---|---|
| `src/services/buscaIndex.ts` | **novo** — consulta da projeção, online e offline |
| `src/services/catalogoLocal.ts` | **novo** — catálogo no IndexedDB (§8.1) |
| `src/services/storageV2.ts` | `hidratarEssencial()`, `carregarEquipamento(tag)`, **throttle de `lerTudo()`** |
| `src/app/RotaProtegida.tsx` | barreira espera só o essencial |
| `src/features/equipamento/equipamentoService.ts` | `listarPagina()` |
| `src/components/BuscaLista.tsx` · `ListaVirtualizada.tsx` | **novos** |
| `src/pages/Equipamentos.tsx` · `Relatorios.tsx` · … | consumir os novos serviços |
| `src/services/vencimentos.ts` | agregado híbrido |

### Intocados de propósito

`public/arquivos-*` (os 40+ templates) · `palco.ts` · `pdfService.ts` · `artefatoRelatorio.ts` ·
`livroLacre.ts` · `fotos.ts`.

> **`pdfService` não é tocado.** A vetorização é Fase 11 e **não** começa aqui.

---

## 20 · Testes

| Camada | O que trava |
|---|---|
| **Consistência** | Escrita pela RPC projeta · tombstone remove da projeção · `source_version` = versão persistida |
| **Consistência — o teste de falha em cascata (§6.3)** | **1.** força falha na projeção · **2.** força falha **também** no registro da pendência · **3.** confirma que `app_storage` **foi salvo** · **4.** confirma que a **auditoria detecta** a divergência **sem** a pendência existir · **5.** repara · **6.** confirma **convergência** |
| **Keyset** | Paginar do início ao fim **com inserção concorrente**: nenhum item pulado, nenhum duplicado (§10.1) |
| **Reparo** | Idempotente · consome a pendência · pendência teimosa vira alerta |
| **Rebuild** | Idempotente (2× = mesmo) · retomável · **não apaga o não reconhecido** · **não escreve em `app_storage`** |
| **Auditoria** | Detecta linha faltando, sobrando e `source_version` defasada · **detecta divergência criada fora da RPC** |
| **RLS** | Org A não vê org B · Portal sem acesso direto · `anon` nada · fail closed |
| **Busca** | cada modalidade do §11, com seu índice · zero resultados · acentuação |
| **Paginação** | Keyset não pula nem duplica com inserção concorrente · última página · cursor inválido |
| **Item recém-salvo** | Aparece imediatamente após salvar, online e offline (§6.4) |
| **Offline** | Busca sobre o catálogo · UI avisa a limitação · detalhe não cacheado avisa · **fila de escrita funciona** |
| **Compatibilidade** | `carregarEquipamento(tag)` → `ler()` síncrono encontra → palco monta → documento igual (§4) |
| **Regressão** | PDF só no clique · thumbnails da Fase 5 · livro lacrado · Portal · palco |

---

## 21 · Benchmarks — antes e depois, mesmos datasets

O **antes** está registrado. O **depois** roda no mesmo laboratório, com as mesmas seeds.

| Escala | Estrutural | Metadados de busca |
|---|:--:|:--:|
| 100 · 500 · 1.000 · 5.000 | ✅ | ✅ |
| 10.000 · 20.000 · 50.000 | — | ✅ |

Medir dos dois lados: **FCP · bytes · requisições · tempo de consulta · buffers · nós no DOM ·
heap · long tasks · tempo de busca · filtros · scroll/FPS · paginação · cache · offline.**

| | ANTES (medido) | DEPOIS (meta) |
|---|---|---|
| Boot, 1.000 | FCP 440 ms | **não pior** |
| Boot, 51.000 | **> 10 min** | **≈ igual ao de 1.000** |
| `/equipamentos`, 1.000 | 2,20 s · 42.283 nós · 97 MB | **DOM proporcional à página** |
| `/equipamentos`, 51.000 | ~4 min · 2.292.273 nós · 1,63 GB | **≈ igual ao de 1.000** |
| Busca por fabricante | **0 resultados** | **acha** |
| `/relatorios` | sem busca | **com busca** |

**Medir também:** peso real da projeção (§5.4) e do catálogo no IndexedDB.

---

## 22 · Critérios de aceite

- [ ] **Boot não depende do número de equipamentos**
- [ ] **Nenhuma tela hidrata a organização inteira**
- [ ] **DOM proporcional à viewport/página**
- [ ] **Heap não cresce linearmente** com o total
- [ ] Busca por TAG exata, prefixo, descrição, fabricante e nº de série funciona e é rápida
- [ ] `/relatorios` **tem busca**, com todos os requisitos do §13
- [ ] Busca devolve **subconjunto pequeno** com cursor
- [ ] **Zero PDF baixado antes do clique**
- [ ] **Offline funciona**, com limitações **visíveis**
- [ ] **Item recém-salvo nunca some da tela**
- [ ] **Auditoria em zero divergências**, e prova disso
- [ ] **Falha na projeção nunca impede gravar a verdade**
- [ ] **Falha ao registrar a pendência também não impede gravar a verdade**
- [ ] **A auditoria detecta divergência sem depender da pendência existir**
- [ ] Toda ordenação de cursor **termina em coluna única**, provado com inserção concorrente
- [ ] Pendência é **reparável e idempotente**; rebuild reconstrói do zero
- [ ] RLS: org A não vê org B; Portal inalterado; **P1 e P3 preservados**; fail closed
- [ ] Thumbnails da Fase 5 sem regressão (N-01/N-02)
- [ ] Livro lacrado, palco e PDF imutável sem regressão
- [ ] **Cada índice tem consulta real e benchmark**
- [ ] Peso real da projeção **medido e publicado**
- [ ] Rollback provado em cada etapa
- [ ] **Caminho de hidratação integral removido** ao fim da 9G
- [ ] Suíte e build verdes; benchmarks publicados em `docs/medicoes/`

---

## 23 · Riscos

| # | Risco | Grav. | Mitigação |
|---|---|:--:|---|
| R1 | Defeito na projeção derruba gravação de dado real | 🔴 | Savepoint: só o bloco da projeção reverte (§6.1) |
| R2 | **Divergência silenciosa permanente** | 🔴 | Auditoria por `source_version` (§6.3), que **não depende da pendência** |
| R2b | **Falha em mecanismo derivado derruba a verdade** | 🔴 | Savepoints aninhados nos níveis 2 e 3; handler interno `null` **não pode levantar** (§6.2). Teste de falha em cascata (§20) |
| R3 | Sair da hidratação quebra tela que lia do `Map` | 🔴 | §1.2 é a lista completa; 9D depois de 9C; flag; barreira volta |
| R4 | Offline regride sem ninguém notar | 🔴 | Critério de aceite com teste próprio; catálogo é o coração, não remendo |
| R5 | **Item recém-salvo some da tela** | 🔴 | §6.4, três camadas; teste dedicado |
| R6 | Fallback vira muleta permanente | 🟡 | Critério de saída explícito na 9G (§16) |
| R7 | Backfill estoura cota/egress | 🟡 | Roda no servidor; cliente não baixa nada |
| R8 | Virtualização quebra impressão/PDF | 🟡 | Documentos não usam listas virtualizadas — palco intocado |
| R9 | Keyset com ordem instável pula itens | 🟡 | Ordem termina em coluna única; teste com inserção concorrente |
| R10 | Índice novo pesa na escrita | 🟡 | Cada um com benchmark antes/depois |
| R11 | Ganhar desempenho e perder trabalho de campo | 🔴 | Pré-carga manual (§8.3) é escopo, não extra |
| R12 | Projeção mais pesada que o estimado | 🟡 | §5.4: medir depois da modelagem; se não for ordens de grandeza menor, o desenho volta à mesa |
| R13 | Fase 9 crescer sem fim | 🟡 | Portões P9.1–P9.5; secundários só na 9G |

---

## 24 · Fora do escopo, explicitamente

- **PDF vetorial** — Fase 11. `pdfService` não é tocado.
- **Baseline de geração de PDF (5/15/30 folhas)** — pré-requisito antes da Fase 11, não da 9.
- **Degraus 100/500 em produção** — `CALIBRAÇÃO ADIADA`.
- **Dataset realista em produção** — não autorizado.
- **Fase 10** — não iniciada.
- Limpeza de legado, `app_storage_org_idx` redundante, bloat de TOAST — registrados na Fase 8.

---

## 25 · O que o task-level ainda terá de decidir tecnicamente

Não são decisões de arquitetura — são escolhas de implementação, todas com medição:

1. Nomes finais das tabelas e colunas.
2. `numero_serie`: igualdade ou prefixo — **definir pela UX real** antes do índice.
3. Biblioteca de virtualização, escolhida por medição.
4. Ordem do keyset por tela (`tag` × `atualizado_em desc, tag`).
5. Tamanho de lote do backfill e do rebuild.
6. Limiar de tentativas antes de uma pendência virar alerta.

---

## 26 · Decisões arquiteturais aprovadas

Fechadas pelo dono em 22/08/2026, sobre a v1 deste documento.

| # | Decisão | Resolução |
|---|---|---|
| **1** | **Duas projeções por domínio** | **APROVADO.** Equipamentos e relatórios em projeções distintas — consultas, campos, índices, filtros e ciclo de vida diferentes. Nada de tabela genérica só para economizar uma tabela. Nomes finais são escolha técnica |
| **2** | **Fonte da verdade** | **`app_storage` continua sendo a verdade.** As projeções são **derivadas, descartáveis e reconstruíveis**. Perder uma projeção **não perde informação empresarial**. Nunca podem virar segunda fonte de verdade |
| **3** | **Falha de mecanismo derivado** | **Falha em QUALQUER mecanismo derivado — projeção, pendência, outbox, telemetria — nunca pode virar falha da verdade.** Savepoints aninhados garantem isso nos dois níveis. A **pendência é best-effort**; a **auditoria por `source_version` é a garantia**, e funciona mesmo que a pendência nunca funcione. **Consistência eventual é aceita para busca; divergência silenciosa permanente, não** |
| **3c** | **Autoridade da convergência** | **`source_version` é a versão efetivamente persistida** (`app_storage.versao`, mesma mutação, mesma transação). **Nenhum timestamp de frontend decide convergência** — `mutado_em_cliente` é `AUDITORIA APENAS` por desenho existente. Não se cria contador novo |
| **3d** | **Cursor/keyset** | **Ordenação estável, determinística e com desempate único**, sempre terminando em coluna única. A ordenação concreta de cada tela fica para o task-level |
| **3b** | **Item recém-salvo** | O que o usuário acabou de salvar **nunca some da tela**. Caminho feliz é síncrono; escrita local é a rede de segurança; a UI sinaliza pendência quando houver |
| **4** | **Offline** | **Pré-carga manual e explícita** na primeira versão. **Catálogo de metadados leves ≠ dados completos offline**: conhecer e pesquisar milhares não obriga a ter milhares completos no aparelho. Automático só depois, com número medido |
| **5** | **Busca e `pg_trgm`** | **`pg_trgm` não entra agora**, e **`tsvector` não é assumido como solução universal**. Cada modalidade — TAG exata, prefixo, nº de série, código, texto livre, período — tem **consulta real → índice apropriado → `EXPLAIN (ANALYZE, BUFFERS)` → benchmark**. Sem índice universal |
| **6** | **Ordem das telas** | `/equipamentos` → `/relatorios` → demais. **Mas a infraestrutura vem antes da migração visual**: 9A projeções sem leitores · 9B escrita e auditoria · 9C piloto · 9D fim da hidratação integral · 9E `/relatorios` · 9F demais · 9G secundários |
| **7** | **Dashboard** | **Híbrido.** Online: agregados leves do servidor. Offline: último estado do catálogo, **com a UI deixando claro que é do último sync** — nunca apresentar dado antigo como recém-consultado. **Não volta a varrer a organização inteira** |

### Ressalvas registradas junto com as decisões

| | |
|---|---|
| **~250 B por projeção** | É **estimativa/baseline de direção, não contrato**. Medir depois da modelagem real: tamanho médio, índices, overhead do Postgres, transferência, IndexedDB. O compromisso é a projeção ser **várias ordens de grandeza** mais leve |
| **Identidade fonte↔projeção** | Toda linha responde *"corresponde a qual versão da verdade?"* — `source_version`, `source_updated_at`, `projected_at` (nomes a definir). Serve auditoria, reparo, rebuild, detecção de atraso e rollout |
| **Fallback** | Existe para **o rollout**, não para sempre. **Nunca** pode ser "sem projeção, hidrata 50.000". O backfill remove a necessidade, e a 9G **remove o caminho antigo** |
| **Rebuild** | Idempotente · paginado · retomável · observável · por organização · sem alterar histórico · sem PDFs · sem base64 · **sem efeito colateral empresarial** |
| **Portal** | O precedente **não relaxa segurança**: P1, P3, RLS, recursos vinculados, fail closed, e **hash/path nunca é autorização** |
| **Amarra síncrona** | A estratégia oficial de compatibilidade está no **§4**, e sai da dependência do `Map` completo **sem reescrever os 40+ templates** |

---

**Aprovado este desenho, o próximo passo é o task-level de implementação — que ainda não existe.**
