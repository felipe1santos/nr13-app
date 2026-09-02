# 9F.3 — `/calibracoes` PELA PROJEÇÃO (31/08/2026)

> **O que este arquivo é:** o registro da construção da 9F.3 — o que mudou, os números
> antes/depois, o que ficou provado e o que **não** ficou. Tudo local: nenhum SQL foi aplicado
> em produção, nenhuma flag de cliente ligada, nenhum deploy feito.
>
> **Contexto que não pode faltar:** desde 31/08 o projeto do Supabase em produção responde
> **HTTP 402** a tudo (`exceed_cached_egress_quota` — ver
> `2026-08-31-supabase-cota-estourada.md`). Esta etapa foi construída e medida contra o
> **Supabase LOCAL**, que está no mesmo estado de schema da produção.

Commit: **`4af6f13`**.

---

## 1 · O defeito, medido

| | |
|---|---|
| `Calibracoes.tsx:417` | `const qtd = listarCalibracoes(eq.tag).length;` **dentro do `.map()` do render** |
| custo por cartão, por quadro | um `JSON.parse` da lista inteira — **2,1 KB** na média, **8,9 KB** na maior (produção, 31/08) |
| `proprietarioDe` | `ler('nr13_emp_' + tag)` **três vezes** no mesmo quadro (2 `useMemo` + a linha 418) |
| mount | `listarEquipamentos()` → **`await lerTudo()`** |
| hidratação na maior org | **369 linhas / 780 KB** para desenhar uma lista que precisa de **53 KB** — 93% de desperdício |
| busca por texto | **não existe** |
| paginação · virtualização | **não existem** |

---

## 2 · O que mudou

### Servidor

| arquivo | mudança |
|---|---|
| `busca_index.sql` | coluna `calibracoes integer` **NULLABLE** + `alter … add column if not exists` |
| `busca_manutencao.sql` | `v_cal`, o `select count(*) from calibracoes_index` **depois** de `projetar_calibracoes`, a coluna no `insert`/`values` **e** `calibracoes = excluded.calibracoes` no `on conflict` |
| `busca_index_rpc.sql` | nada novo — `nr13_calibracoes_%` **já despachava** desde a 9D; só ficou documentado que a contagem pega carona |
| `busca_consulta.sql` | guarda que falha antes de derrubar a RPC + `calibracoes` no retorno e no `select` |
| `calibracoes_v9_flag.sql` | **NOVO** — `org_sync.calibracoes_v9`, `definir_calibracoes_v9`, revogada de `anon`/`authenticated` |

### Front

| arquivo | mudança |
|---|---|
| `buscaIndex.ts` | `ItemCatalogo.calibracoes: number \| null`, `LinhaRpc.calibracoes`, mapeamento que distingue `null` de `0`, e `rotuloCalibracoes()` |
| `flag.ts` | `calibracoes_v9` — acessores, a coluna na consulta única, e o **degrau novo** `sincronizarSemColunaCalibracoes` |
| `catalogoCalibracoes.ts` | **NOVO** — `abrirEquipamentoParaCalibracoes` (semear → ler) e `deveHidratarListaLegada` |
| `CatalogoCalibracoesV9.tsx` | **NOVO** — lista da projeção, busca, keyset, virtualização |
| `Calibracoes.tsx` | `v9` lido uma vez, `abrirPorTag`, o gate no `carregarEquipamentos`, e o ramo `v9` × `!v9` |
| `equipamentoService.ts` | item PENDENTE ganha `calibracoes: null` — **não** conta pelo array local |

> **A decisão que vale registrar:** a contagem sai de **`calibracoes_index`**, não do `.length`
> do array. É a mesma tabela que alimenta o painel de vencimentos. As duas contagens PODEM
> divergir — item sem `id` não entra na projeção — e o teste MEDE essa divergência em vez de
> fingir que ela não existe. Um número no cartão e outro no painel para a mesma coisa é como as
> divergências nasceram na 9C.

---

## 3 · Números — antes × depois

### Servidor, no banco local, com a massa de laboratório

**Buffers CONSTANTES nos três degraus.** É esta linha que prova a escala: o custo por página
não cresce com o parque.

| consulta | 1.000 | 10.000 | 50.000 |
|---|---|---|---|
| página 1 (51 linhas) | 430 buffers · 64,2 ms | **430** · 13,9 ms | **430** · 3,6 ms |
| busca por termo | 36 buffers · 23,1 ms | **36** · 8,2 ms | **36** · 3,4 ms |
| keyset (página 20) | 2 buffers · 0,68 ms | **2** · 0,91 ms | **2** · 0,60 ms |
| `contar_equipamentos` | — | — | 457 buffers · 5,1 ms |

Os tempos CAEM ao longo da série porque o cache do Postgres esquenta entre as rodadas; os
**buffers** é que são a medida honesta, e eles não se mexem.

### Tela

| | antes | depois |
|---|---|---|
| mount | `lerTudo()` — 369 linhas / 780 KB na maior org | **51 linhas** por página |
| contagem do cartão | `JSON.parse` da lista **por cartão, por quadro** | inteiro que já veio na linha |
| proprietário | `ler('nr13_emp_')` **3×** por quadro | campo da mesma linha |
| busca por texto | não existe | existe |
| linhas no DOM | uma por equipamento | virtualizado |

---

## 4 · O que ficou PROVADO

### `testes-9f3.sql` — **31/31**, em três execuções seguidas

1. a projeção conta (3 / 0 sem chave / 0 com array vazio / 0 com JSON ilegível, e o
   equipamento **sobrevive**);
2. **a contagem sai de `calibracoes_index`**: 2 itens no array com 1 `id` → o cartão conta 1, e
   o teste confirma que o array cru tem 2 — a divergência é conhecida, não acidente;
3. `0` ≠ `null`: o `null` plantado sobrevive até alguém reprojetar, e vira `0` quando reprojeta;
4. **o upsert regrava a coluna** — o valor 99 plantado à mão não sobrevive à reprojeção. É o
   defeito que a 9F.2 pagou uma vez, e a assertiva foi escrita antes da função;
5. escrever a lista reprojeta a contagem (3 → 2); gravar o **certificado** (chave por id) não
   mexe nela e não cria equipamento fantasma;
6. isolamento entre organizações;
7. o número viaja na RPC, com **uma** sobrecarga só;
8. o rebuild chega ao mesmo resultado da mutação;
9. a flag nasce desligada, está revogada de `authenticated`, **preserva as quatro anteriores** e
   o rollback desliga só a dela;
10. `inspecoes` e `tem_prontuario` seguem de pé;
11. `auditar_projecao` **converge**.

### Testes de unidade — 25 novos, suíte **1508/1508**

- `buscaIndexCalibracoes.test.ts` (10): `null` ≠ `0`, coluna ausente vira `null`, `integer` que
  chegue como string vira número, e as colunas da 9F.1/9F.2 não são atropeladas;
- `flagCalibracoesV9.test.ts` (8): inclui **a escada inteira** — banco anterior a toda a 9F
  ainda preserva `busca_v9` e `boot_v9`, e no fundo do poço a `v2_ativa` continua sincronizada
  (o estado que custou uma semana no `cmam.caldeiras`);
- `semeaduraCalibracoes.test.ts` (7): **o teste bloqueante**.

### O teste bloqueante sabe ficar VERMELHO

Não basta passar. Tirando `nr13_componentes_cal_` da tabela de famílias por TAG, ele quebra e
diz qual família ficou descoberta:

```
nr13_componentes_cal_<TAG> (componentesService.listarComponentes): expected [ … ] to deeply equal []
```

Restaurado o arquivo, 7/7 de novo. **Um teste de cruzamento que nunca foi visto falhar é
decoração.**

### `tsc` limpo · `npm run build` verde · árvore limpa

---

## 5 · Dois achados que valem para o ROLLOUT

### 5.1 · `reconstruir_indice_busca` não repreenche coluna nova

Descoberto pelo `testes-9f3.sql` falhando na **segunda** execução, não na primeira. A função é
**retomável** e, com o cursor no fim (`etapa = 'concluido'`), é um **no-op explícito**: devolve
`processadas: 0` e **parece sucesso**.

> **Consequência operacional:** numa organização já reconstruída antes, chamar o rebuild **não**
> preenche `calibracoes`. O rollout precisa reprojetar **TAG a TAG** com
> `projetar_equipamento` — como foi feito na 9F.1 e na 9F.2 — ou chamar
> `reiniciar_rebuild_busca()` antes.

### 5.2 · `tsc -b` do build é mais estrito que `tsc --noEmit`

Armadilha já registrada, e ela cobrou de novo: `tsc --noEmit` passou limpo enquanto
`npm run build` apontava quatro lugares que precisavam do campo novo. **Validar pelo build
real, sempre.**

---

## 6 · O que NÃO foi provado — declarado, não presumido

1. ~~Degraus de 1.000 e 10.000~~ — **FEITOS em 31/08** (§11). O gate passou nos TRÊS.
2. **Produção intocada.** O SQL da 9F.3 **não** foi aplicado lá, e não poderia ser validado
   agora: o gateway responde 402 a tudo.
3. **Escala em produção** segue não exercitada, como nas 9F.1 e 9F.2.

---

## 7 · Estado ao fim

| | |
|---|---|
| SQL da 9F.3 | aplicado e testado **só no LOCAL** — 5/5 arquivos, `testes-9f3.sql` 31/31 |
| Suíte | **1508/1508** (+25) · `tsc` limpo · build verde |
| `calibracoes_v9` | existe; **ligada só na organização de laboratório local** |
| Produção | **nada aplicado, nada ligado, nada publicado** |
| Gate de navegador | **PASSOU nos TRÊS degraus** (§8 e §11) — 1.000, 10.000 e 50.000, com DOM e heap constantes. Antes só 50.000 (§8) — 11 cartões / 398 nós / 30 MB, 2 requisições por busca, zero `app_storage`, os 3 estados do rótulo (inclusive o `null`), e o histórico abrindo com conteúdo REAL depois de apagar as 10 chaves do cache. **1.000 e 10.000 não medidos na tela** |
| 9F.4 · 9G · PDF vetorial | **não iniciados** |

---

## 8 · GATE DE NAVEGADOR — 50.000 (31/08/2026, laboratório local)

> Executado depois de restaurar a janela do Chrome (ela estava minimizada, com
> `screen: [0,0]`; a saída foi abrir a aba num **outro** janela do mesmo perfil — o
> `localStorage` é por origem, então a sessão valeu).

Organização de laboratório, `calibracoes_v9` **e** `boot_v9` ligadas só nela.

### 8.1 · A lista, com 50.003 equipamentos no banco

| | |
|---|---|
| cartões no DOM | **11** |
| nós no DOM | **398** |
| heap | **30 MB** |
| campo de busca | presente — *"Buscar por TAG, equipamento, fabricante ou cliente…"* |
| cabeçalho | "mais de 1.000 resultados" |
| **chaves no cache do aparelho** | **39** — com **50.003** na projeção. A lista **não hidratou nada** |

### 8.2 · Requisições por busca: **2**, e nenhuma de `app_storage`

Medido com um espião em `window.fetch`, ao digitar `ZZ-CAL`:

```
POST /rest/v1/rpc/buscar_equipamentos   {p_termo:"ZZ-CAL", …, p_limite:51}
POST /rest/v1/rpc/contar_equipamentos   {p_termo:"ZZ-CAL", …, p_teto:1000}
```

**Zero** requisição a `app_storage`, e portanto **zero `JSON.parse` de
`nr13_calibracoes_` para desenhar a lista** — que é o defeito que esta etapa remove.

### 8.3 · Os TRÊS estados do rótulo, na tela

| TAG | valor na projeção | o que a tela escreveu |
|---|---|---|
| `ZZ-CAL` | 2 | **"2 calibrações"** |
| `ZZ-TRES` | 3 | **"3 calibrações"** |
| `ZZ-NENHUMA` | 0 | **"Nenhuma calibração"** |
| `VP-00100` · `VP-01000` · `VP-01500` | 3 | **"3 calibrações"** |
| `VP-00150` | 0 | **"Nenhuma calibração"** |
| `VP-00120` a `VP-00123` | **`null`** | **(SEM RÓTULO)** — o rótulo SOME |

> **O estado `null` foi exercitado NA TELA.** É a limitação nº 2 que ficou declarada no
> fechamento da 9F.2 (lá o badge `null` nunca apareceu em produção, porque a org tinha sido
> reprojetada). Aqui ele aparece, e o rótulo some — a tela não afirma ausência que ninguém mediu.

E o **proprietário** (`CLIENTE CALIBRACAO LTDA · Vila Velha`) veio na MESMA linha da projeção,
em vez das três leituras de `nr13_emp_<TAG>` por quadro da tela antiga.

### 8.4 · A PROVA BLOQUEANTE — semear antes de ler

O risco desta etapa é o histórico abrir vazio **sem erro nenhum**. Para provar que não abre,
não basta clicar: é preciso garantir que o dado **não estava** no aparelho.

1. **10 chaves do `ZZ-CAL` apagadas do IndexedDB** — `nr13_calibracoes_`,
   `nr13_componentes_cal_`, `nr13_lotes_cal_`, os dois `nr13_calibracao_item_<id>`,
   `nr13_info_`, `nr13_emp_`, `nr13_cat_`, `nr13_calc_`, `nr13_pref_unidade_`;
2. recarregada a página (o `Map` em memória morre junto);
3. buscado `ZZ-CAL` — o cartão **ainda dizia "2 calibrações"**, porque o número vem do
   SERVIDOR, não do cache;
4. clicado.

**O histórico abriu com conteúdo REAL:**

```
Calibrações — ZZ-CAL
COMPONENTES DO EQUIPAMENTO
  MANOMETRO LABORATORIO   S/N SER-MAN-001   MANÔMETRO
  VALVULA LABORATORIO     S/N SER-PSV-002   PSV
Lotes de calibração
  LOTE DE LABORATORIO 9F3    2/2 calibrados    COMPLETO
```

As três famílias estavam lá: os **2 componentes**, o **1 lote**, e o "**2/2 calibrados**" — que
só é possível cruzando o lote com a lista de calibrações. Depois do clique, **as 10 chaves
apagadas voltaram ao cache: 10 de 10**. Foi a semeadura que as trouxe.

### 8.5 · O que este gate NÃO cobriu

- **1.000 e 10.000 não foram medidos na tela.** O daemon do Docker travou sob a carga dos
  geradores no meio da regeneração da massa. O degrau de 50.000 — o mais difícil — passou, e os
  números de SERVIDOR nos três degraus estão no §3, mas a medição de DOM/heap nos dois degraus
  menores **fica declarada como não feita**.
- `pg_stat_statements` não devolveu as chamadas da abertura (a extensão existe e o reset
  funciona, mas as consultas não apareceram); a evidência da semeadura veio do **cache antes ×
  depois**, que é mais direta.

### 8.6 · Estado do laboratório ao fim (para quem retomar)

O gerador de 10.000 foi **interrompido no meio** e o daemon do Docker ficou travado — `docker ps`
deixou de responder. Consequências, e nenhuma delas afeta o que foi provado:

- **A massa da organização de laboratório pode estar inconsistente** (o script começa apagando
  `equipamentos_index` e `app_storage` da org). Antes de medir 1.000 ou 10.000, rode o
  `lab-9f3-massa.sql` do zero — ele é idempotente e recria tudo, inclusive as TAGs de paridade.
- **Nada de produção foi tocado**, e nada do que está no §8 depende deste estado: aquelas medidas
  foram tiradas com a massa de 50.003 íntegra, e estão registradas.
- Para destravar: reiniciar o Docker Desktop (derruba o Supabase local junto; ele sobe de novo
  com `npx supabase start`).

---

## 9 · A TRAVA CONTRA A REGRESSÃO (31/08, depois do gate de 50k)

O dono destacou, com razão, que `listarCalibracoes(eq.tag)` **não pode voltar** ao render da
lista. Conferir isso à mão não trava nada: "tirei" não é um estado, é uma decisão que a próxima
edição desfaz sem querer — alguém acrescenta uma coluna no cartão, precisa de um dado, e chama o
serviço ali mesmo. E o defeito volta **sem erro nenhum**: a tela fica correta e fica lenta.

`src/features/calibracoes/listaSemParse.test.ts` (**9 testes**) lê o ARQUIVO da lista nova, sem
os comentários, e exige que ele não toque em nada que custe por cartão:

| trava | por quê |
|---|---|
| não chama `listarCalibracoes` | é o `JSON.parse` por cartão que a etapa removeu — e daria número diferente do painel de vencimentos |
| não chama `listarComponentes` / `listarLotes` | mesmas famílias, mesmo custo |
| não lê `nr13_emp_` | o proprietário vem na linha da projeção; a tela antiga lê 3× por quadro |
| não chama `ler(` do storage | nenhuma leitura de cache por cartão |
| não chama `lerTudo` / `listarEquipamentos` | é o mount que a etapa remove |
| não importa de `pages/` | a 9G remove o caminho antigo sem levar a lista nova junto |
| **usa** `rotuloCalibracoes` | é lá que a regra `null` ≠ `0` mora, e ela tem teste |

E mais duas sobre o contrato de abertura: `carregarEquipamento` aparece **antes** de
`listarCalibracoes(` no arquivo, e `lerTudo` não aparece.

**Verificado ficando VERMELHO:** injetando `import { listarCalibracoes } from './calibracaoService'`
no componente, o teste quebra na assertiva certa. Restaurado o arquivo, 9/9.

> **A tela LEGADA continua chamando `listarCalibracoes` no render (`Calibracoes.tsx:484`), e
> deve mesmo.** Com a flag desligada o comportamento tem que ser exatamente o de hoje. O teste
> olha só o componente da flag ligada. Confirmado por leitura: a chamada está dentro do ramo
> `tela === 'equipamentos' && !v9` (linha 445), e o ramo `&& v9` (linha 431) só monta o
> `CatalogoCalibracoesV9`.

Suíte: **1517/1517** (128 arquivos).

---

## 10 · 1.000 e 10.000 — TENTATIVA BLOQUEADA PELO DOCKER (31/08, 18h30)

Depois do restart do Docker Desktop, a tentativa de fechar os dois degraus faltantes **não
saiu do passo 1**. Sintomas medidos, na ordem:

| comando | resultado |
|---|---|
| `docker ps -a` | **vazio**, sem erro — nenhum container listado |
| `docker version --format {{.Server.Version}}` | **vazio**, exit 0 |
| `docker info` | `500 Internal Server Error … /v1.55/info` |
| `npx supabase status` | `LegacyStatusDbInspectError` — 500 ao inspecionar `supabase_db_nr13-app` |
| `npx supabase start` | `LegacyDockerLifecycleInspectError` — mesmo 500 |
| loop de espera de ~3 min | desistiu; engine ainda em erro |

O CLI e o engine estão discordando: o `supabase` acha que o container `supabase_db_nr13-app`
existe (e recebe 500 ao inspecioná-lo), enquanto o `docker ps -a` não lista container nenhum. A
mensagem sugere incompatibilidade de versão de API (`check if the server supports the requested
API version`).

**É problema do ambiente, não da 9F.3.** Nada de código mudou, nada de produção foi tocado, e
as medidas de 50.003 do §8 seguem válidas — foram tiradas antes, com a massa íntegra.

> **ARMADILHA DE MEDIÇÃO, e ela quase me enganou:** `docker info --format '{{.ServerVersion}}'`
> devolve **exit 0 com string VAZIA** quando o engine está em erro. Um loop de espera escrito
> como `until docker info --format ... >/dev/null; do sleep; done` termina **na primeira
> tentativa** e anuncia "engine pronto" com o Docker ainda quebrado. Esperar pelo código de
> saída não serve aqui — o teste honesto é `docker ps -a` LISTAR algo, ou o valor do format não
> ser vazio.

**Para retomar** (ação do dono): sair do Docker Desktop pela bandeja (*Quit*, não *Restart*) e
abrir de novo; depois `npx supabase start`. **Não** usar *Troubleshoot → Clean/Purge data*: isso
apaga o volume do Postgres local e levaria junto o schema da Fase 9 aplicado ali.

Depois disso, os dois degraus são rápidos — o roteiro está no §8.5.

---

## 11 · GATE COMPLETO NOS TRÊS DEGRAUS (31/08/2026, 18h50–19h10)

Depois do restart do Docker Desktop, os containers voltaram (`Up 2 days`, sem downtime real —
o engine é que estava inconsistente). A massa interrompida de 10.000 foi **descartada** e cada
degrau foi regenerado do zero com `lab-9f3-massa.sql`.

### 11.1 · Quadro comparativo — 1.000 × 10.000 × 50.000

| medida | 1.000 | 10.000 | 50.000 |
|---|---|---|---|
| no banco (`equipamentos_index`) | **1.003** | **10.003** | **50.003** |
| `calibracoes` nulas / zero / >0 | 980 / 11 / 12 | 9.800 / 101 / 102 | 49.000 / 501 / 502 |
| `calibracoes_index` | 5 | 5 | 5 |
| **cartões no DOM** | **11** | **11** | **11** |
| **nós no DOM** | **398** | **398** | **398** |
| **heap** | **29–30 MB** | **30 MB** | **30 MB** |
| contagem no cabeçalho | "mais de 1.000 resultados" | "mais de 1.000 resultados" | "mais de 1.000 resultados" |
| campo de busca | presente | presente | presente |
| **requisições por busca** | **2** | **2** | **2** |
| requisições a `app_storage` na lista | **0** | **0** | **0** |
| **chaves no cache do aparelho** | **29–39** | **29–39** | **39** |
| altura reservada (virtualização) | 4.511 px | 4.511 px | — |
| keyset: altura após rolar | **8.711 px** (+1 página) | **+2 páginas** | — |
| prova bloqueante (semear → ler) | ✅ **10/10** chaves | ✅ **10/10** chaves | ✅ **10/10** chaves |

**O DOM e o heap não se mexem entre 1.000 e 50.000.** É a mesma linha que os buffers do
servidor (§3) contam do outro lado: o custo por página não cresce com o parque.

### 11.2 · Itens do roteiro, um a um

| item | 1.000 | 10.000 | como foi verificado |
|---|---|---|---|
| quantidade real no banco | 1.003 | 10.003 | `select count(*)` na projeção |
| quantidade apresentada | "mais de 1.000" | "mais de 1.000" | texto do cabeçalho |
| DOM | 398 | 398 | `querySelectorAll('*').length` |
| heap | 29 MB | 30 MB | `performance.memory` |
| requests | 2 por busca | 2 por busca | espião em `window.fetch` |
| busca | `ZZ-` → **3 resultados** | `ZZ-` → **3 resultados** | rótulos conferidos |
| termo inexistente | 0 cartões + mensagem | "Nenhum resultado" + mensagem | `XPTO-NAO-EXISTE-9F3` |
| limpar busca | volta a 11 / "mais de 1.000" | volta a 11 / "mais de 1.000" | campo esvaziado |
| keyset | +1 página, altura 4.511 → 8.711 | +2 páginas, "Carregando mais…" na tela | rolagem real |
| virtualização | 11 no DOM com altura de 4.511 px | idem | janela trocou: VP-00007..VP-00019 → VP-00041..VP-00050 |
| zero `lerTudo()` na lista | ✅ | ✅ | cache com 29–39 chaves para 1.003 e 10.003 na projeção |
| zero `JSON.parse` de `nr13_calibracoes_` | ✅ | ✅ | nenhuma requisição a `app_storage`; o cartão mostra a contagem **com o cache apagado** |
| leitura pesada antes de abrir | ✅ nenhuma | ✅ nenhuma | as 4 famílias só entram no cache DEPOIS do clique |
| `null` ≠ `0` | `VP-0012*` → **sem rótulo** | `VP-0012*` → **sem rótulo** (110 resultados) | os 3 estados na tela |
| abertura sob demanda | ✅ | ✅ | 10 chaves apagadas voltam |
| semear → ler | ✅ | ✅ | histórico com conteúdo real com o cache vazio |
| histórico | ✅ | ✅ | "LOTE DE LABORATORIO 9F3 · 2/2 calibrados · COMPLETO" |
| componentes / lotes | ✅ 2 e 1 | ✅ 2 e 1 | com número de série |
| certificado | ✅ | ✅ | `nr13_calibracao_item_cal-lab-1/2` entre as 10 que voltaram |
| paridade com o legado | ✅ | ✅ | ver §11.4 |

### 11.3 · Os três estados do rótulo, na tela, nos dois degraus

| TAG | projeção | tela |
|---|---|---|
| `ZZ-CAL` | 2 | **"2 calibrações"** |
| `ZZ-TRES` | 3 | **"3 calibrações"** |
| `ZZ-NENHUMA` | 0 | **"Nenhuma calibração"** |
| `VP-00050` | 0 | **"Nenhuma calibração"** (visto na tela, na rolagem) |
| `VP-00120`…`VP-00122` | **`null`** | **sem rótulo** |

### 11.4 · PARIDADE COM O LEGADO — flag OFF × ON

`definir_calibracoes_v9(lab, false)` + limpeza da flag local + recarga:

| | flag ON (9F.3) | flag OFF (legado) |
|---|---|---|
| campo de busca | **presente** | **ausente** |
| filtros | busca por texto | **2 `<select>`** (tipo e proprietário) |
| rótulo do `ZZ-CAL` | "2 calibrações" | "2 Calibraç6es" — mesmo NÚMERO |
| **histórico do `ZZ-CAL`** | 2 componentes · 1 lote · "2/2 calibrados · COMPLETO" | **texto IDÊNTICO** |

O que vem DEPOIS da lista não foi duplicado, e a prova é essa: o mesmo equipamento abre o mesmo
histórico pelos dois caminhos. A única diferença é o rótulo do cartão, que mudou de propósito
("2 Calibrações" → "2 calibrações", e `0` passou a ser "Nenhuma calibração" em vez de
"0 Calibrações").

### 11.5 · DUAS ARMADILHAS DE MEDIÇÃO, e as duas quase viraram defeito falso

> **1 · `elemento.scrollTop = N` NÃO exercita a virtualização.** Definindo `scrollTop` por
> JavaScript, a janela desenhada **não mudava** — sempre `VP-00001..VP-00011`, em qualquer
> posição. Parecia defeito grave. Com **rolagem real de roda do mouse** no mesmo ponto, a janela
> trocou na hora (`VP-00007..VP-00019`). A virtualização está correta; o método é que estava
> errado. **Rolagem se mede rolando.**
>
> **2 · Ler o DOM logo depois de digitar mede a lista ANTIGA.** A busca tem debounce e a
> resposta é assíncrona: com 2,5 s de espera, uma leitura pegou os cartões anteriores e pareceu
> que a busca não filtrava. Com 4,5 s, o resultado certo. **O que se lê cedo demais é a tela de
> antes.**

E uma observação que **não** é defeito, mas é honesta: depois de apagar chaves do IndexedDB, um
boot levou **mais de 30 segundos** em "Carregando…". É cache frio reconstruindo — o mesmo
cenário que segue declarado como não exercitado em produção.

### 11.6 · Testes rodados no fim, contra o banco recuperado

| arquivo | resultado |
|---|---|
| `scripts/fase9/testes-9f3.sql` | **31/31** |
| `scripts/fase9/testes-9f2.sql` | **18/18** |
| `scripts/fase9/testes-9f.sql` (9F.1) | **12/12** |
| suíte vitest | **1517/1517** (128 arquivos) |
| `tsc -b` + build | **verde** |

**61/61 nas assertivas SQL das três etapas da 9F.** As colunas `inspecoes` e `tem_prontuario`
seguem de pé depois da `calibracoes`.

---

## 12 · REVALIDAÇÃO APÓS A RECUPERAÇÃO DO WSL (01/09/2026)

O §10 acima ficou como o último estado visível para quem lesse o histórico de commits, e a
impressão que sobrou foi de que **1.000 e 10.000 continuavam pendentes**. Não continuavam: o
§11 é posterior ao §10 e fechou os três degraus no mesmo dia, 18h50–19h10. Este bloco existe
para desfazer essa leitura e provar que o fechamento sobreviveu à queda do ambiente.

### 12.1 · O que travou o ambiente, e o que era

Entre 31/08 e 01/09 o Docker ficou inutilizável. A causa **não era o Docker nem o WSL**:

```
WslService   Status = StopPending   PID = 6624   C:\Program Files\WSL\wslservice.exe
```

Serviço preso no meio do encerramento. Todo comando de WSL (`--shutdown`, `--status`,
`-l -v`) espera por ele e pendura — não é lentidão, é espera por algo que nunca conclui.
O resto da pilha estava íntegro (`vmcompute`, `hns`, `HvHost`, `vmms` todos *Running*;
`LxssManager` não existe porque o WSL moderno usa `WslService`), e **nenhuma VM estava
rodando** (`vmmem`/`vmmemWSL` ausentes) — por isso matar o processo travado, com elevação,
não interrompia escrita nenhuma. Conserto: matar o PID e `Start-Service WslService`.

**Por que o reboot anterior não resolveu:** `LastBootUpTime` apontava 28/08, quatro dias
antes. Ou o reboot não ocorreu, ou foi *Desligar* em vez de *Reiniciar* — com o Fast Startup
do Windows, desligar hiberna e restaura a sessão do kernel, trazendo o serviço travado de
volta no mesmo estado. Some-se que o Docker Desktop está no auto-start e chama o WSL logo no
login, re-travando antes de dar tempo de olhar.

### 12.2 · Prova de que o laboratório sobreviveu

| item | evidência |
|---|---|
| `docker info` | **29.7.2** (conferido pelo CONTEÚDO — ver a armadilha do §10) |
| stack Supabase local | 11 containers `Up`, `supabase_db` *healthy* |
| volumes | `supabase_db_nr13-app`, `supabase_storage_nr13-app`, `supabase_edge_runtime_nr13-app` |
| `docker_data.vhdx` | **12.708 MB**, intacto |
| dado da org de laboratório | **11.009** chaves em `app_storage` |
| projeção | `equipamentos_index` **12.486** · `calibracoes_index` **5** |
| os três estados do rótulo | `NULL` 12.283 · `0` 101 · `>0` 102 — preservados |

Nenhum volume foi recriado, nenhuma massa regenerada, o gate de 50.000 **não** foi repetido.

### 12.3 · Assertivas rodadas hoje contra o banco recuperado

| arquivo | resultado |
|---|---|
| `scripts/fase9/testes-9f3.sql` | **31/31** · 0 falhas |
| `scripts/fase9/testes-9f2.sql` | **18/18** · 0 falhas |
| `scripts/fase9/testes-9f.sql` (9F.1) | **12/12** · 0 falhas |
| suíte vitest | **1561/1561** (131 arquivos) |
| `tsc` + build | verde |

Todas com `ON_ERROR_STOP=1` e saída 0. **61/61**, os mesmos números de 31/08 — o fechamento
da 9F.3 é reprodutível depois de o ambiente cair e voltar.

> A suíte subiu de 1517 para 1561 porque entraram, entre 31/08 e hoje, o painel admin novo e
> a trava de massa contra produção (§12 do CLAUDE.md). Nenhum teste da 9F foi alterado.

### 12.4 · Estado da 9F.3

**Fechada localmente.** O que falta é rollout, e ele não foi iniciado: `calibracoes_v9`
permanece **OFF** em produção.
