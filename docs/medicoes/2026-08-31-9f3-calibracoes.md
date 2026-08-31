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

1. **O gate de navegador rodou em 50.000 e PASSOU** (§8). O que ficou de fora: **os degraus de
   1.000 e 10.000 não foram medidos NA TELA** — o daemon do Docker travou sob a carga dos
   geradores no meio da regeneração da massa. Os números de SERVIDOR existem nos três degraus
   (§3) e mostram custo constante; o que falta é a repetição de DOM/heap nos dois menores, que
   é o caso mais fácil, não o mais difícil.
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
| Gate de navegador | **PASSOU em 50.000** (§8) — 11 cartões / 398 nós / 30 MB, 2 requisições por busca, zero `app_storage`, os 3 estados do rótulo (inclusive o `null`), e o histórico abrindo com conteúdo REAL depois de apagar as 10 chaves do cache. **1.000 e 10.000 não medidos na tela** |
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
