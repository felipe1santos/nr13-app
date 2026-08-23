# FASE 9 — Escala, busca e carregamento sob demanda · **DESENHO ARQUITETURAL**

**22/08/2026** · autorizado como **análise + planejamento + desenho + rollout + testes**

> **NADA FOI IMPLEMENTADO.** Nenhum schema alterado, nenhum índice criado, nenhuma tabela criada,
> nada em `src/`. Este documento existe para ser **aprovado antes** de qualquer mudança. O
> task-level de implementação só nasce depois.

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

### 1.1 A amarra que gera tudo o mais

```
ler(chave)  →  cache.obterRegistro(chave)  →  Map em memória     ← SÍNCRONO
```

`ler()` é **síncrono**. Toda tela chama `ler()` durante o render. Uma tela que rodasse antes da
hidratação veria o `Map` vazio e concluiria "conta vazia" — que é exatamente o sumiço de dado que
a v2 existe para consertar.

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

| Consumidor | O que faz | Precisa mesmo de tudo? |
|---|---|---|
| `equipamentoService.listarEquipamentos` | `listarChavesComPrefixo('nr13_info_')` + monta resumo de cada | **Não** — precisa de uma página |
| `vencimentos.listarVencimentos` | varre todo `nr13_info_` + `nr13_vida_` + índices | **Sim, hoje** — é agregado sobre a org |
| `Dashboard`, `Layout`, `Vencimentos`, `limiteTrial` | `.length` de `nr13_info_` para contador | **Não** — é um `count` |
| `LivroRegistro` | varre todo `nr13_info_` + livro de cada | **Não** — precisa de uma página |
| `rastreabilidadeService` | prefixo `nr13_rastreab_` | **Sim**, mas é lista pequena e global |
| `livroAssinatura` | prefixo `nr13_livro_` | migração, roda em segundo plano |
| `recuperacaoArquivos` | prefixos da Fase 6 | migração, roda em segundo plano |

### 1.3 O palco — e a boa notícia

`palco.coletarItens(tag)` monta o `localStorage` para os 40+ templates HTML a partir de:

```js
chavesDaTag(tag)                    // índice por TAG — barato
+ GLOBAIS                           // 6 chaves fixas
+ chavesComPrefixo('nr13_rastreab_')// lista pequena, escopo de ID
+ chavesDeCalibracaoDaTag(tag)      // filtrada pela lista daquela TAG
```

> **O palco JÁ É por TAG.** Gerar relatório ou prontuário **nunca precisou** da organização
> inteira — precisa daquela TAG mais um punhado de globais. **Isto derruba o maior risco do
> carregamento sob demanda**: os 40+ templates não precisam saber de nada.

### 1.4 O precedente que já existe no código

O **cliente do Portal não hidrata** (Fase 0-B, achado A-01). Ele recebe cache **parcial**,
depositado por `semearCachePortal(chaves)` → `storageV2.semearCache(chaves)`, já filtrado pelo
servidor.

> **A primitiva do carregamento sob demanda já está escrita e em produção.** A Fase 9 generaliza
> um padrão existente, não inventa um novo.

### 1.5 Busca hoje

**Não existe busca no servidor.** Zero `.ilike/.like/.textSearch/.or` em todo o `src/`. Toda busca
é `.filter()` em JavaScript sobre o `Map`. Medido em 50.000 equipamentos:

| | Plano | Buffers | Tempo |
|---|---|---:|---:|
| TAG exata | `Index Scan` | 4 | 0,07 ms ✅ |
| Prefixo de TAG | `Parallel Seq Scan` | 10.917 | 26 ms ❌ |
| Fabricante / nº série / nome | `Parallel Seq Scan` | 10.917 | 57 ms ❌ |
| Relatório por código | `Parallel Seq Scan` | 10.917 | 80 ms ❌ |

Causa: `valor` é `text` **opaco**, e `chave` é `btree text_ops` sob collation `en_US.UTF-8` — que
não serve `LIKE 'prefixo%'`.

---

## 2 · Causa-raiz, e por que cada remédio isolado falha

| Sintoma medido | Causa-raiz |
|---|---|
| > 10 min para abrir com 51.000 | Barreira de hidratação integral no boot |
| 583 requisições onde 111 bastavam | `lerTudo()` sem throttle na v2 + duas chamadas concorrentes no boot |
| 2.292.273 nós no DOM | `.map()` sobre a coleção inteira, sem paginação nem virtualização |
| 1,63 GB de heap | `Map` com a org inteira **+** 2,29 M de nós **+** objetos do React |
| Busca não acha fabricante | `.filter()` sobre 3 campos escolhidos no cliente |
| Busca por conteúdo é `Seq Scan` | `valor` é `text` opaco; não há camada pesquisável |

**Os três remédios isolados, e por que cada um falha sozinho:**

- **Só throttle** → continua baixando a organização inteira, só que uma vez. **50.000 equipamentos
  = ~415 MB.** Inaceitável.
- **Só virtualização** → o DOM fica controlado, mas o navegador ainda baixa e materializa tudo, e
  o boot continua de minutos.
- **Só busca server-side** → a busca fica rápida, mas o boot e as listas continuam carregando tudo.

> **Precisam ser resolvidos juntos, e nesta ordem de dependência:** primeiro deixar de exigir a
> organização inteira (senão nada mais importa), depois paginar o transporte, depois limitar o DOM,
> e a busca server-side é o que torna a paginação utilizável.

---

## 3 · Arquitetura alvo

```
LOGIN
 └─ sessão + perfil + flags
 └─ hidratarEssencial()        globais pequenas: minha empresa, funcionários,
                               clientes, config do livro, rastreabilidades,
                               contadores.  ~dezenas de KB, teto conhecido
 └─ SHELL UTILIZÁVEL           ← a barreira termina AQUI

/equipamentos
 └─ listarPagina(cursor, filtros)   → projeção leve, 50 por página
 └─ virtualização                   → DOM proporcional à viewport

busca
 └─ ONLINE  → consulta na projeção, no servidor
 └─ OFFLINE → mesma consulta sobre a projeção cacheada no IndexedDB

abrir equipamento
 └─ carregarEquipamento(tag)  → chaves daquela TAG → semearCache()
 └─ palco/documentos          → já funcionam, são por TAG

/relatorios
 └─ índice leve paginado + busca
 └─ PDF                       → só no clique, via pdfRef  (já é assim ✅)
```

### O que muda de fato

| Camada | Hoje | Alvo |
|---|---|---|
| Boot | organização inteira | globais pequenas |
| Lista | tudo no `Map`, tudo no DOM | página do servidor, DOM virtualizado |
| Busca | `.filter()` no cliente | consulta no servidor; offline sobre projeção cacheada |
| Detalhe | já estava no `Map` | sob demanda por TAG |
| Documentos | palco por TAG | **inalterado** |
| PDF | só no clique | **inalterado** |

---

## 4 · Modelagem da camada pesquisável

### 4.1 Uma tabela ou duas?

Você pediu para não assumir duas. Avaliei três formas:

| Forma | A favor | Contra |
|---|---|---|
| **(a) Duas tabelas** — `equipamentos_index`, `relatorios_index` | Colunas tipadas de verdade (`date`, `numeric`); índices exatos por domínio; `EXPLAIN` legível; RLS simples | Duas migrações, dois backfills |
| **(b) Uma tabela genérica** — `search_index(tipo, campos jsonb)` | Uma migração; extensível sem DDL | `jsonb` volta a ser opaco para tipagem; índices viram GIN sobre expressão; **repete o erro que estamos consertando** |
| **(c) Colunas geradas no próprio `app_storage`** | Sem tabela nova; consistência automática | `valor` é `text` (não `jsonb`) → precisaria de cast em toda linha; infla a tabela mais quente do sistema; RLS já tem quatro políticas e um trigger — mexer ali é caro e arriscado |

**Recomendação: (a) duas tabelas.** O motivo decisivo é que **as consultas dos dois domínios são
diferentes** — equipamento busca por texto e categoria; relatório busca por código, período e TAG.
Índices diferentes, seletividade diferente. Uma tabela só forçaria índices parciais e tornaria o
`EXPLAIN` difícil de ler, que é justamente o que precisamos manter afiado.

E há um argumento de risco: **(c) mexe na tabela mais quente do sistema**, aquela cuja guarda
`trg_guardar_app_storage` e cujas 4 políticas de RLS já são delicadas. Camada nova e **aditiva**
é reversível; alterar `app_storage` não é.

### 4.2 Forma proposta

**`equipamentos_index`** — uma linha por equipamento:

| Coluna | Tipo | Origem |
|---|---|---|
| `org_id` | uuid | escopo |
| `tag` | text | chave do `nr13_info_<TAG>` |
| `descricao` | text | `info.descricao` |
| `tipo` | text | `info.tipo` |
| `subtipo` | text | `info.subtipo` |
| `categoria` | text | `nr13_cat_<TAG>.catFinal` |
| `fabricante` | text | `info.fabricante` |
| `numero_serie` | text | `info.numeroSerie` |
| `localizacao` | text | `info.localizacao` |
| `ano` | text | `info.ano` |
| `cliente` | text | `nr13_emp_<TAG>` |
| `proxima_inspecao` | date | `nr13_vida_<TAG>` |
| `tem_foto` | boolean | `nr13_fotos_<TAG>` não vazio |
| `busca` | tsvector **gerado** | ver §10 |
| `atualizado_em` | timestamptz | do `app_storage` |

**PK `(org_id, tag)`.**

**`relatorios_index`** — uma linha por relatório:

| Coluna | Tipo | Origem |
|---|---|---|
| `org_id` · `relatorio_id` | uuid · text | escopo e id |
| `tag` | text | `tagVaso` |
| `codigo` · `nome` · `tipo` | text | do `RelatorioIndiceItem` |
| `emissao` · `validade` | **date** | hoje são string `DD/MM/AAAA` — normalizar |
| `profissional` | text | `meta.phNome` |
| `status` | text | `status` |
| `pdf_ref` · `sha256` · `paginas` | text · text · int | artefato (§7-quater) |
| `busca` | tsvector gerado | |
| `atualizado_em` | timestamptz | |

**PK `(org_id, relatorio_id)`.**

> **Nada de blob, base64, snapshot, foto, PDF ou JSON pesado.** Estimativa: **~250 B por linha**.

### 4.3 O número que sustenta o desenho, e o offline

| | Por equipamento | 50.000 equipamentos |
|---|---:|---:|
| Dado completo (**medido**: 8,3 kB) | 8,3 kB | **~415 MB** |
| Projeção leve (**estimado**: 250 B) | 250 B | **~12,5 MB** |
| **Razão** | | **33×** |

**12,5 MB cabem folgados no IndexedDB** — a Fase 8 mediu **10.317 MB de cota** e uso de 53,8 MB.
É isto que torna a busca offline possível **sem** guardar a base inteira no aparelho.

---

## 5 · Consistência com `app_storage` — o ponto bloqueante

> **`app_storage` continua sendo a verdade definitiva. A projeção é DERIVADA e descartável.**

### 5.1 As quatro alternativas, avaliadas

| | **A · Trigger no banco** | **B · Mesma RPC/transação** | **C · Projeção derivada assíncrona** | **D · Coluna gerada (§4.1c)** |
|---|---|---|---|---|
| **Consistência** | **Forte** — mesma transação, sempre | **Forte** — se dentro do `begin/commit` da RPC | Eventual | Forte |
| **Atomicidade** | Automática | Precisa de disciplina no código | Não há | Automática |
| **Offline** | Indiferente — roda no servidor quando a fila drena | Indiferente | Indiferente | Indiferente |
| **Rollback** | `drop trigger` | Reverter a RPC (função versionada) | Parar o worker | `drop column` na tabela quente |
| **Desempenho** | +1 upsert por escrita; medir | Idem, sem salto de contexto | Escrita não paga | Cast a cada linha |
| **Manutenção** | Lógica de parsing **em PL/pgSQL** — duplica regra que hoje é TypeScript | Lógica fica **junto da RPC**, já em PL/pgSQL | Lógica em JS, mais fácil | Expressão SQL frágil sobre `text` |
| **RLS** | Herda o escopo | Herda | Worker precisa de `service_role` | Herda |
| **Recuperação** | Rebuild | Rebuild | Rebuild | `REINDEX` |
| **Risco** | Trigger na tabela mais quente | **Baixo — a RPC já é o único caminho de escrita** | **Janela de divergência** | Alto |

### 5.2 Recomendação: **B, com A como rede de segurança**

**`aplicar_mutacao_storage` já é o ÚNICO caminho de escrita.** A guarda
`trg_guardar_app_storage` recusa escrita direta (`nr13_escrita_direta_bloqueada`) — a Fase 8
provou isso por teste funcional. Então:

> Toda escrita passa pela RPC → **atualizar a projeção dentro da mesma transação da RPC** dá
> atomicidade de graça, sem trigger novo na tabela mais quente.

E a rede de segurança: **a projeção é reconstruível** (§6). Se algo divergir, o rebuild resolve —
não há dado perdido, porque a projeção nunca é fonte.

### 5.3 Resposta explícita: **`app_storage` salva e a projeção falha — o que acontece?**

**Não acontece divergência silenciosa, porque as duas escritas são a mesma transação.**

```
begin  (dentro de aplicar_mutacao_storage)
  ├─ escreve app_storage        ← a verdade
  ├─ escreve equipamentos_index ← a projeção
  └─ commit  |  rollback
```

| Cenário | Resultado |
|---|---|
| Projeção falha por erro **lógico** (chave malformada, JSON inválido) | **A transação inteira aborta.** O cliente recebe erro, a mutação **fica na fila** e é reenviada. **Nada é perdido, nada diverge** |
| Projeção falha por erro de **infraestrutura** | Idem — rollback |
| Servidor cai **entre** as duas escritas | Impossível: é uma transação |
| A projeção **não existe ainda** (org não migrada) | `if to_regclass(...) is null then return; end if` — a RPC segue gravando a verdade. **Fallback seguro (§13)** |
| Alguém edita o banco fora da RPC | Guarda recusa. Porta de manutenção (`nr13.manutencao`) exige rebuild depois — **documentar** |

> **O risco que este desenho ACEITA, e precisa da sua ciência:** se a escrita da projeção tiver um
> defeito, ela passa a derrubar **escritas de dado real**. É trocar "busca desatualizada" por
> "gravação recusada" — e gravação recusada é o defeito mais caro deste projeto.
>
> **Mitigação obrigatória:** a atualização da projeção roda dentro de um bloco
> `exception when others then` que **registra e segue**, em vez de abortar. Assim a verdade nunca
> é bloqueada por defeito da projeção; a divergência vira **detectável** (§6.2) e curável pelo
> rebuild. É a inversão certa: **a verdade nunca pode depender da projeção.**

---

## 6 · Reconstrução

### 6.1 `reconstruir_indice_busca(org_id, lote)`

Idempotente · retomável · auditável · **não altera `app_storage`**.

- Lê `app_storage` da org em lotes (cursor por `chave`), monta as linhas, faz `upsert`.
- Ao fim de cada lote, grava a posição — retomar é continuar do cursor.
- **Não apaga o que não reconheceu**: remoção só por tombstone explícito, mesma regra do §2-ter.
- Roda com `service_role` (é manutenção), **nunca** disparada pelo cliente.

### 6.2 Detecção de divergência

Consulta de auditoria, barata, para rodar sob demanda:

```
equipamentos vivos em app_storage   vs   linhas em equipamentos_index
por org, com as TAGs que faltam ou sobram
```

Se divergir: rebuild daquela org. **A projeção nunca é consertada à mão.**

---

## 7 · RLS

Preserva P1 e P3. Espelha o que `acesso_setup.sql` já faz para `app_storage`:

| Papel | `equipamentos_index` / `relatorios_index` |
|---|---|
| `mestre` / sub-login | `select` onde `org_id = org_atual()` |
| `cliente` (Portal) | **Nenhum acesso direto.** Continua pela Edge `portal_cliente`, que já filtra por vínculo |
| `anon` | nenhum |
| Escrita | **ninguém** pelo PostgREST. Só a RPC (`security definer`) e o rebuild |

**Hash/path continua não sendo autorização** — a projeção guarda `pdf_ref` como *referência*, e
quem autoriza o download é a política do bucket, inalterada.

> **Teste que trava isso:** usuário da org A consultando a projeção **não** enxerga linha da org B —
> igual ao que a Fase 4 fez para o Portal.

---

## 8 · Offline — bloqueante

> Busca server-side **não pode** virar "sem internet, listas vazias".

| | Online | Offline |
|---|---|---|
| Lista | página do servidor | página da **projeção cacheada** no IndexedDB |
| Busca | consulta no servidor | **mesma consulta**, sobre a projeção cacheada |
| Detalhe do equipamento | sob demanda | só se aquela TAG já estiver no cache |
| Abrir documento | palco por TAG | idem — precisa da TAG cacheada |
| PDF | busca no Storage | só se já estiver no cache de PDFs |

### O que fica cacheado

**A projeção inteira da organização** — 12,5 MB para 50.000 equipamentos (§4.3), contra 415 MB do
dado completo. É a diferença entre viável e inviável.

Sincronizada pelo mesmo mecanismo incremental que já existe (marca d'água por `atualizado_em`).

### O que a UI precisa dizer, e é requisito

- Selo de offline no campo de busca: *"buscando no que está neste aparelho"*.
- Resultado sem detalhe cacheado: card aparece, **abrir avisa** que precisa de conexão.
- **Nunca** mostrar lista vazia sem explicar por quê — é o defeito que a v2 existe para não repetir.

### Trabalho de campo — o que não pode regredir

O inspetor abre um equipamento, preenche em campo e salva. Isso exige aquela TAG **já cacheada**.
**Proposta: "levar para o campo"** — o usuário marca equipamentos e o app pré-carrega as chaves
deles. Explícito, com tamanho mostrado, em vez de baixar 50.000 "por via das dúvidas".

> **Decisão sua, no aceite:** o pré-carregamento é **manual** (o usuário escolhe) ou **automático**
> (os N com inspeção próxima)? Recomendo manual na 9C e automático depois, com número medido.

---

## 9 · Paginação — cursor, não OFFSET

`OFFSET 40000 LIMIT 50` obriga o Postgres a **produzir e descartar 40.000 linhas**. Keyset não.

```sql
-- página seguinte, ordenada por tag
where org_id = $1 and tag > $cursor
order by tag
limit 50
```

| | OFFSET | **Keyset** |
|---|---|---|
| Custo da página 1 | baixo | baixo |
| Custo da página 800 | **cresce linearmente** | **igual ao da página 1** |
| Inserção durante a navegação | pula/duplica itens | estável |

**Recomendação: keyset em toda lista.** Ordem por `(tag)` ou `(atualizado_em desc, tag)` conforme a
tela; o cursor é o último item da página. **A ser provado por benchmark em 5.000 / 20.000 / 50.000**
— não por teoria.

Página de **50**. Busca devolve no máximo **50 + cursor**, nunca "todos os 20.000".

---

## 10 · Índices e consultas

**Regra: cada índice precisa de consulta real e `EXPLAIN (ANALYZE, BUFFERS)` antes/depois.
Nenhum índice "porque pode".**

| Consulta real | Índice candidato | Por quê |
|---|---|---|
| TAG exata | PK `(org_id, tag)` | já resolve — 4 buffers medidos |
| **Prefixo de TAG** | `(org_id, tag text_pattern_ops)` | a Fase 8 provou que `text_ops` + `en_US.UTF-8` **não** serve `LIKE 'x%'` |
| Paginação keyset | PK | mesma ordem |
| Filtro tipo/categoria + ordem | `(org_id, tipo, tag)` — **só se o benchmark mostrar ganho** | pode ser desnecessário com poucas categorias |
| **Texto livre** (descrição, fabricante, nº série, localização) | `GIN` sobre `busca tsvector` gerada | um índice serve os quatro campos |
| Relatório por código | `(org_id, codigo)` | busca exata, muito seletiva |
| Relatório por período | `(org_id, emissao desc)` | exige `emissao` como **date**, não string |

**Sobre substring tolerante** (`"vaso"` achar `"Vaso separador"`): `tsvector` resolve por palavra.
Para *substring no meio de palavra* seria preciso `pg_trgm` — **não proposto agora**: instala
extensão e índice GIN caro. **Só entra se o benchmark provar que a busca por palavra não basta.**

---

## 11 · UX

### `/relatorios` — hoje tem zero campo de texto

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔍 Buscar por TAG, equipamento ou nº do relatório…             [×] │
└──────────────────────────────────────────────────────────────────────┘
   [ Tipo ▾ ]  [ Período ▾ ]  [ Ordenar ▾ ]              128 resultados
```

Requisitos, todos obrigatórios:

| | |
|---|---|
| Busca **visível** | Não atrás de "Filtrar" — o erro medido em `/equipamentos` |
| Limpar | botão `×`, e `Esc` |
| Carregando | esqueleto, não spinner que salta |
| Zero resultados | texto útil, com o que foi buscado e como limpar |
| Contador | "128 resultados" |
| **Debounce** | 300 ms, porque é server-side |
| **Cancelar resposta antiga** | `AbortController` + descartar resposta cujo termo não é o atual — **senão a resposta lenta de "vas" sobrescreve a de "vaso"** |
| Teclado | foco por `/`, setas, `Enter` abre |
| Acessibilidade | `role="searchbox"`, `aria-live` na contagem |
| Mobile | campo em largura total, filtros em bottom-sheet |

### Estado na URL

`/relatorios?q=vaso&tipo=periodica&cursor=…` — recarregar, voltar do detalhe, compartilhar e
histórico funcionam. **Onde fizer sentido**; o cursor pode ficar fora se poluir.

---

## 12 · Virtualização — responsabilidade separada

| Mecanismo | Controla |
|---|---|
| **Cursor/paginação** | quanto vem **do servidor** |
| **Virtualização** | quanto vai **para o DOM** |
| **Busca server-side** | não baixar a coleção para achar poucos itens |

Com 50 por página a virtualização é quase dispensável — **mas** o "carregar mais" acumula, e 20
páginas viram 1.000 cards × 42 nós = 42.000 nós, o número que já medimos. **Então é necessária.**

Requisitos: altura variável, thumbnails, responsivo, mobile, compatível com busca, filtros e
seleção. Biblioteca a escolher **na 9D, com medição** — candidatos: `@tanstack/react-virtual`
(headless, altura dinâmica) ou implementação própria com `IntersectionObserver` (já usado em
`FotoImg`). **Não decidir por gosto.**

---

## 13 · Ordem de migração das telas

Por impacto medido, e cada uma é um portão:

| Ordem | Tela | Por quê |
|---|---|---|
| **1** | `/equipamentos` | maior DOM medido (42.283 nós), tem busca para corrigir, é a porta de entrada |
| **2** | `/relatorios` | **zero busca hoje**; é o caso concreto que você levantou |
| 3 | `/inspecoes`, `/prontuarios` | mesmo padrão, sem busca |
| 4 | `/calibracoes` | + tirar `listarCalibracoes` do render |
| 5 | `/livro-registro` | varre todo `nr13_info_` |
| 6 | `/vencimentos`, `/dashboard` | dependem de **agregado** (§14) |
| 7 | `/empresas` | busca na lista local |

---

## 14 · Dashboard e vencimentos — o caso que não é paginável

`listarVencimentos()` percorre **todos** os `nr13_info_` e cruza com `nr13_vida_` e o índice de
relatórios. Não é lista — é **agregado sobre a organização**.

| Opção | Avaliação |
|---|---|
| Manter no cliente sobre a projeção cacheada | funciona offline; custo O(n) em 50.000, mas sobre 12,5 MB e não 415 MB |
| Consulta agregada no servidor | rápida e exata; **não funciona offline** |
| **Híbrida — recomendada** | servidor quando online (números exatos, baratos); projeção cacheada quando offline, com selo |

`proxima_inspecao` como `date` na projeção torna a consulta trivial:
`where org_id = $1 and proxima_inspecao < now() + interval '30 days'`.

---

## 15 · Backfill

- Por organização, **sob autorização explícita** — nunca global automático.
- Paginado (lotes de 1.000), **retomável** por cursor, **idempotente** (`upsert` por PK).
- **Observável**: linhas processadas, tempo, erros.
- Sem bloquear usuário: roda como manutenção, e a org funciona pelo **fallback** enquanto não
  terminar.
- **Sem egress absurdo:** roda no **servidor**, lendo `app_storage` direto. O cliente não baixa
  nada para o backfill. Este ponto é inegociável — a cota do Supabase já está sob aviso.

---

## 16 · Rollout por etapas, com portão em cada uma

| Etapa | Entrega | Rollback |
|---|---|---|
| **9A** | Migration da projeção + RLS + rebuild + backfill. **Nenhuma tela muda.** Nada lê a projeção ainda | `drop table` — nada depende dela |
| **9B** | Escrita da projeção dentro da RPC + auditoria de divergência. Ainda **nenhuma leitura** | Reverter a função (versionada) |
| **9C** | **Piloto: `/equipamentos`** — busca server-side, keyset, virtualização, offline pela projeção cacheada. **Atrás de flag por organização** | Desligar a flag → tela volta ao caminho atual |
| **9D** | Sair da hidratação integral: `hidratarEssencial()` + `carregarEquipamento(tag)` sob demanda. **A etapa mais arriscada** | Flag: voltar à barreira |
| **9E** | Restaurar o throttle de `lerTudo()` | trivial |
| **9F** | Expandir para `/relatorios` e demais telas, uma por vez | Flag por tela |
| **9G** | Achados secundários: contador pesado, `<select>` por card, `listarCalibracoes`, Dashboard, PDF duplicado | Independentes |

**Cada etapa:** local → testes → commit → deploy → validação em produção → portão → próxima.

> **9D é a etapa que pode quebrar tudo**, porque desfaz uma barreira que existe para impedir "conta
> vazia". Ela vem **depois** de 9C provar que a leitura pela projeção funciona, e sai atrás de flag.

---

## 17 · Compatibilidade durante a migração

| Situação | Comportamento |
|---|---|
| Org **sem** projeção | A RPC detecta (`to_regclass`) e não escreve nela. As telas usam o caminho atual. **Deploy não depende de backfill completo** |
| Org **com** projeção, flag desligada | Projeção é escrita e fica em dia; ninguém lê ainda |
| Org **com** flag ligada | Lê da projeção; se a consulta falhar, **cai no caminho atual** |
| Aparelho com bundle antigo | Continua no caminho atual. A projeção não muda `app_storage` |
| Dado antigo | Inalterado — a projeção é **aditiva**, não migra nem reescreve nada |

---

## 18 · Arquivos e schema que seriam tocados

**Nada disto foi feito.** É o mapa para o task-level.

### Banco (novo)

| Arquivo | Conteúdo |
|---|---|
| `supabase/busca_index.sql` | tabelas, índices, RLS, grants |
| `supabase/busca_index_rollback.sql` | `drop` na ordem inversa |
| `supabase/busca_rebuild.sql` | `reconstruir_indice_busca` + auditoria |
| `supabase/armazenamento_v2.sql` | **modificado**: `aplicar_mutacao_storage` passa a atualizar a projeção |

### Frontend

| Arquivo | Papel |
|---|---|
| `src/services/buscaIndex.ts` | **novo** — consulta da projeção, online e offline |
| `src/services/storageV2.ts` | `hidratarEssencial()`, `carregarEquipamento(tag)`, **throttle de `lerTudo()`** |
| `src/services/cacheLocal.ts` | store da projeção no IndexedDB |
| `src/app/RotaProtegida.tsx` | barreira passa a esperar só o essencial |
| `src/features/equipamento/equipamentoService.ts` | `listarPagina()` além de `listarEquipamentos()` |
| `src/components/BuscaLista.tsx` | **novo** — o componente de busca do §11 |
| `src/components/ListaVirtualizada.tsx` | **novo** |
| `src/pages/Equipamentos.tsx` · `Relatorios.tsx` · … | consumir os novos serviços |
| `src/services/vencimentos.ts` | agregado híbrido |

### Intocados de propósito

`public/arquivos-*` (os 40+ templates), `palco.ts`, `pdfService.ts`, `artefatoRelatorio.ts`,
`livroLacre.ts`, `fotos.ts`.

> **`pdfService` não é tocado nesta fase.** A vetorização é Fase 11 e **não** começa aqui.

---

## 19 · Testes

| Camada | O que trava |
|---|---|
| **Consistência** | Escrita pela RPC cria/atualiza a linha da projeção · falha na projeção **não** derruba a verdade · tombstone remove da projeção |
| **Rebuild** | Idempotente (rodar 2× dá o mesmo) · retomável do cursor · **não** apaga o que não reconheceu |
| **RLS** | Org A não vê linha da org B · Portal não acessa a projeção direto · `anon` não lê |
| **Busca** | TAG exata · prefixo · fabricante · nº série · código · período · combinação · zero resultados · acentuação |
| **Paginação** | Keyset não pula nem duplica com inserção concorrente · última página · cursor inválido |
| **Offline** | Busca sobre a projeção cacheada · UI avisa a limitação · detalhe não cacheado avisa · **fila de escrita segue funcionando** |
| **Regressão** | Palco monta documento igual · PDF só no clique · thumbnails da Fase 5 intactos · livro lacrado intacto · Portal sem regressão |
| **Fallback** | Org sem projeção funciona · consulta que falha cai no caminho atual |

---

## 20 · Benchmarks — antes e depois, mesmos datasets

O **antes** está registrado. O **depois** roda no mesmo laboratório, com as mesmas seeds.

| Escala | Estrutural | Metadados de busca |
|---|:--:|:--:|
| 100 · 500 · 1.000 · 5.000 | ✅ | ✅ |
| 10.000 · 20.000 · 50.000 | — | ✅ |

Medir, nos dois lados: **FCP · bytes transferidos · nº de requisições · tempo de consulta ·
buffers · nós no DOM · heap · long tasks · tempo de busca · filtros · scroll/FPS · paginação ·
cache · offline.**

### Comparação obrigatória

| | ANTES (medido) | DEPOIS (meta) |
|---|---|---|
| Boot, 1.000 | FCP 440 ms | **não pior** |
| Boot, 51.000 | **> 10 min** | **≈ igual ao de 1.000** |
| `/equipamentos`, 1.000 | 2,20 s · 42.283 nós · 97 MB | **DOM proporcional à página** |
| `/equipamentos`, 51.000 | ~4 min · 2.292.273 nós · 1,63 GB | **≈ igual ao de 1.000** |
| Busca por fabricante | **0 resultados** | **acha** |
| `/relatorios` | sem busca | **com busca** |

---

## 21 · Critérios de aceite

- [ ] **Boot não depende do número de equipamentos** — 1.000 e 50.000 abrem em tempo equivalente
- [ ] **Nenhuma tela hidrata a organização inteira**
- [ ] **DOM proporcional à viewport/página**, não à base
- [ ] **Heap não cresce linearmente** com o total de registros
- [ ] Busca por **TAG exata, prefixo, descrição, fabricante, nº de série** funciona e é rápida
- [ ] `/relatorios` **tem busca**, com todos os requisitos do §11
- [ ] Busca devolve **subconjunto pequeno** com cursor — nunca 20.000 de uma vez
- [ ] **Zero PDF baixado antes do clique**
- [ ] **Offline continua funcionando**, com limitações **visíveis** na UI
- [ ] **Nenhuma divergência** entre projeção e `app_storage` — provado por auditoria
- [ ] **Falha na projeção nunca impede gravar a verdade**
- [ ] RLS: org A não vê org B; Portal inalterado; **P1 e P3 preservados**
- [ ] Thumbnails da Fase 5 **sem regressão** (N-01/N-02)
- [ ] Livro lacrado, palco e PDF imutável **sem regressão**
- [ ] Cada índice criado tem **consulta real e benchmark**
- [ ] Rollback provado em cada etapa
- [ ] Suíte verde, build verde
- [ ] Benchmarks depois publicados em `docs/medicoes/`

---

## 22 · Portões internos

| Portão | Depois de | Libera |
|---|---|---|
| **P9.1** | 9A + 9B | Projeção existe, é escrita e **auditada sem divergência**. Nada lê ainda |
| **P9.2** | 9C | `/equipamentos` pela projeção, com busca e virtualização, **validado em produção sob flag** |
| **P9.3** | 9D + 9E | Boot sem hidratação integral, **com offline provado** |
| **P9.4** | 9F | Demais telas migradas |
| **P9.5** | 9G + benchmarks | Fase 9 concluída |

---

## 23 · Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|:--:|---|
| R1 | **Defeito na projeção passa a derrubar gravação de dado real** | 🔴 | Bloco `exception ... then registra e segue`. **A verdade nunca depende da projeção** (§5.3) |
| R2 | **Sair da hidratação integral quebra tela que lia do `Map`** | 🔴 | Mapeamento do §1.2 é a lista completa; 9D vem depois de 9C; flag por org; a barreira volta desligando a flag |
| R3 | **Offline regride sem ninguém notar** | 🔴 | Offline é critério de aceite, com teste próprio. Projeção cacheada é o coração da solução, não um remendo |
| R4 | Projeção diverge com o tempo | 🟡 | Auditoria (§6.2) + rebuild idempotente |
| R5 | Backfill estoura cota/egress | 🟡 | Roda **no servidor**; cliente não baixa nada; por org, sob autorização |
| R6 | Virtualização quebra impressão/PDF | 🟡 | Documentos **não** usam as listas virtualizadas — o palco é por TAG e fica intocado |
| R7 | Keyset com ordem instável pula itens | 🟡 | Ordem sempre termina em coluna única (`tag` / `relatorio_id`); teste com inserção concorrente |
| R8 | Índice novo pesa na escrita | 🟡 | Cada um com benchmark antes/depois; a Fase 8 já mostrou que este projeto mede isso |
| R9 | Ganhar desempenho e perder trabalho de campo | 🔴 | "Levar para o campo" (§8) é parte do escopo, **não** um extra |
| R10 | Fase 9 crescer sem fim | 🟡 | Portões P9.1–P9.5; achados secundários só na 9G |

---

## 24 · Fora do escopo, explicitamente

- **PDF vetorial** — Fase 11. `pdfService` não é tocado.
- **Baseline de geração de PDF (5/15/30 folhas)** — pré-requisito **antes da Fase 11**, não da 9.
- **Degraus 100/500 em produção** — `CALIBRAÇÃO ADIADA`.
- **Dataset realista em produção** — não autorizado.
- **Fase 10** — não iniciada.
- Limpeza de legado (`nr13_historico_relatorios`), remoção do `app_storage_org_idx` redundante,
  bloat de TOAST — registrados na Fase 8, **fora da 9**.

---

## 25 · O que precisa da sua decisão antes do task-level

| # | Decisão | Recomendação |
|---|---|---|
| 1 | **Duas tabelas** ou projeção genérica? | **Duas** (§4.1) — consultas e índices são diferentes por domínio |
| 2 | **Escrita na mesma transação da RPC** ou trigger? | **Mesma RPC** (§5.2) — ela já é o único caminho de escrita |
| 3 | Projeção pode **abortar** a escrita da verdade? | **Não.** Registra e segue (§5.3, R1) |
| 4 | Offline: pré-carga **manual** ou automática? | **Manual na 9C**, automática depois com número medido (§8) |
| 5 | `pg_trgm` para substring? | **Não agora.** `tsvector` primeiro; só entra com benchmark (§10) |
| 6 | Ordem das telas | `/equipamentos` → `/relatorios` → resto (§13) |
| 7 | Dashboard offline | Híbrido (§14) |

**Aprovado o desenho, o próximo passo é o task-level de implementação — que ainda não existe.**
