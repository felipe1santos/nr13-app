# 9F.2 — `/prontuarios` pela projeção (29/08/2026)

> **Estado:** implementada e verificada LOCALMENTE. **Nada foi aplicado em produção**,
> nenhuma flag de cliente foi ligada, nenhum template de `public/` foi reescrito.
> A 9F.3 não foi iniciada.

---

## 1 · AS-IS — o que a tela fazia (9F.2.0)

| Achado | Onde | Medida |
|---|---|---|
| Lista inteira no DOM, **sem busca e sem paginação** | `Prontuarios.tsx:641` | zero campo de texto; `equipamentos.map` sobre a lista completa |
| `listarEquipamentos()` no mount → **`await lerTudo()`** | `Prontuarios.tsx:325` | hidratação COMPLETA; sob `boot_v9` desfaz o boot leve (20 KB × 354 KB medidos na 9D) na primeira visita |
| **Badge lê o prontuário INTEIRO dentro do render** | `Prontuarios.tsx:642` | `carregarProntuario(eq.tag)` por cartão |
| Peso da família `nr13_prontuario_` **em produção** (29/08, leitura) | `app_storage` | **15 chaves / 10 organizações · média 6,6 KB · maior 25,7 KB · total 99,7 KB** |
| Custo projetado do badge | — | ~**6,6 MB de `JSON.parse` por quadro** com 1.000 equipamentos, para escrever um booleano |

---

## 2 · O que mudou

| # | Entrega |
|---|---|
| **9F.2.1** | `features/prontuarios/CatalogoProntuariosV9.tsx` — catálogo do SERVIDOR, com busca, keyset (50/página) e virtualização. **Sem RPC nova**: reusa `buscar_equipamentos`/`contar_equipamentos` |
| **9F.2.2** | Coluna `tem_prontuario boolean` **NULLABLE** em `equipamentos_index`, projetada de `nr13_prontuario_<TAG>`; `nr13_prontuario_` no dispatch de `projetar_chave`; a RPC devolve a coluna; `rotuloProntuario` no serviço |
| **9F.2.3** | `abrirEquipamentoParaProntuario(tag)` — **semeia e só então lê**, e não lança (offline segue com o cache) |
| **9F.2.4** | Flag `prontuarios_v9` (`supabase/prontuarios_v9_flag.sql`) + **degrau de recuo novo** em `flag.ts` |
| **9F.2.5** | Gate de navegador — ver §5 |
| **9F.2.6** | `scripts/fase9/testes-9f2.sql` — 18 asserções |

### A decisão de desenho que difere da 9F.1, e o porquê

Na 9F.1 a tela nova nasceu INTEIRA ao lado da antiga. Aqui **só a LISTA é nova**: o
formulário do prontuário e o visualizador das seis folhas (~900 linhas) são idênticos nos
dois caminhos, e duplicá-los criaria duas versões de um documento que um engenheiro assina —
a próxima correção teria de ser feita duas vezes, ou seria esquecida em uma. A flag troca a
FONTE DA LISTA e o MOMENTO em que o equipamento chega ao cache, que é exatamente o escopo da
etapa. `CatalogoProntuariosV9.tsx` não importa nada de `pages/`: quando a 9G remover o
caminho antigo, a remoção não leva a lista nova junto.

---

## 3 · O risco bloqueante: o prontuário não pode abrir vazio

`palcoSemeadura.test.ts` cruza, para uma TAG:

```
chaves que as 6 folhas do prontuário LEEM   (varredura de public/)
                     ×
chaves que carregarEquipamento(tag) SEMEIA  (POR_TAG + 2ª passada)
```

Toda chave do primeiro conjunto precisa estar coberta pelo segundo, por uma das rotas
declaradas (essenciais do boot leve; escritas pelo app na montagem) ou por `FORA_DO_PALCO`.

**Resultado: a cobertura já existia** — `chavesDoEquipamento` sai de `POR_TAG`, a MESMA
tabela que o palco usa. O teste passou de primeira, e por isso foi verificado por **mutação
nos dois sentidos**: retirar `nr13_croqui2d_` de `POR_TAG` reprova (`família ausente da
semeadura: nr13_croqui2d_`); devolver a família aprova. Um guard-test que nunca falhou não
prova nada — este falha.

---

## 4 · O DEFEITO QUE OS TESTES ACHARAM, antes de qualquer tela

`testes-9f2.sql` reprovou **4 asserções de uma vez** na primeira execução:

```
FALHA — reprojetou: o null vira false, porque agora alguem olhou
FALHA (NULO) — prontuario SALVO reprojeta: false -> true
FALHA (NULO) — prontuario EXCLUIDO volta a false
FALHA (NULO) — o rebuild reverificou o VP-TEM
```

**Causa:** a coluna entrou no `insert` e no `values` de `projetar_equipamento`, mas **não no
`on conflict … do update set`**. Ou seja: o valor só era gravado na PRIMEIRA projeção da TAG.
Toda reprojeção — mutação ou rebuild — deixava o valor antigo, ou o `null` de quem nunca foi
verificado. Em produção isso seria um badge eternamente vazio numa organização já projetada,
**sem erro nenhum na tela**.

Corrigido com `tem_prontuario = excluded.tem_prontuario`. Depois: **18/18 PASSA**, e
`testes-9f.sql` (9F.1) segue **12/12** — sem regressão.

---

## 5 · Gate de navegador (9F.2.5)

Executado na tela real, contra o Supabase **local**, com massa crescida em degraus
(`scripts/fase9/lab-9f2-massa.sql`), `prontuarios_v9` **e** `boot_v9` ligadas só na
organização de laboratório. Produção não foi tocada.

### A prova central — o DOM não cresce com o parque

| equipamentos NO BANCO | linhas no DOM | nós no DOM | heap | requisições da tela | PDF/arquivo | leituras de `nr13_prontuario_` |
|---|---|---|---|---|---|---|
| **1.000** | 11 | 395 | 30,5 MB | **2** (27,9 KB) | 0 | **0** |
| **10.000** | 11 | 395 | 32,5 MB | **2** (27,9 KB) | 0 | **0** |
| **50.000** | 11 | 395 | 32,0 MB | **2** (27,3 KB) | 0 | **0** |

Montar a tela = `buscar_equipamentos` + `contar_equipamentos`, **e nada mais**. (Na janela de
50.000 aparecem mais duas chamadas a `profiles`: são o *heartbeat* da sessão única, não da
tela — conferido uma a uma.)

### Busca (50.000 no banco)

| ação | requisições | resultado |
|---|---|---|
| TAG `VP-49999` | 2 | 1 resultado, e é ele |
| fabricante `Gama Industrial` | 2 | 11 linhas no DOM |
| termo inexistente | 2 | **"Nenhum resultado"** + *"Nenhum equipamento encontrado para …"* — mensagem explícita, não área vazia |
| limpar | 2 | volta a 11 linhas, primeira `VP-00001`, rolagem no topo |

Nenhuma delas leu `nr13_prontuario_`; nenhuma baixou arquivo.

### Virtualização e rolagem profunda

Rolagem real (roda do mouse — `scrollTop` por script **não** emite evento neste ambiente,
armadilha herdada do gate da 9F.1): **13 linhas** no DOM (`VP-00053` … `VP-00065`), 421 nós,
heap 34,6 MB, **1 página nova pedida com cursor** (keyset), **0 long tasks**, zero PDF.

### Paridade do badge, na tela

`VP-00050` → **"Sem Prontuário"** · vizinhos sem badge (`null` = não verificado) ·
`ZZ-DOC` → **"Prontuário OK"** · `ZZ-META` (só a meta) → **"Sem Prontuário"**.

### Abrir o equipamento — a ordem, medida

Instrumentei `fetch` e `Storage.getItem` e cliquei em `ZZ-DOC`. A sequência registrada:

```
1. semear:app_storage          ← a requisição da semeadura
2. ler:nr13_prontuario_ZZ-DOC  ← só DEPOIS a leitura
3. ler:nr13_prontuario_meta_ZZ-DOC
```

**1 requisição, 4,7 KB, filtrada pela TAG escolhida** (`pediu_so_a_tag: true`). É a 9F.2.3
funcionando: semear antes de ler, e só aquela TAG.

### As 6 folhas — conteúdo REAL, e paridade byte a byte

As seis folhas abriram com conteúdo (653 a 2.432 caracteres de texto), com dados que só podiam
vir da semeadura: `CONTRATANTE CLIENTE PARIDADE LTDA`, `IDENTIFICAÇÃO ZZ-DOC`,
`Nº DE SÉRIE NS-DOC-9F2`, `FABRICANTE METALURGICA ALFA LTDA`, `MATERIAL DO CORPO ASTM A516 Gr
60`, o SVG do croqui, os bocais `N1`/`N2` e os pesos da folha de dados, o memorial com `1,05`.

E a prova que responde "nenhuma informação vazia indevidamente" sem depender do meu olho:
**abri o MESMO equipamento pelo caminho legado (flag OFF) e comparei o texto das seis folhas**.

| folha | caracteres (V9) | caracteres (legado) | idêntico |
|---|---|---|---|
| PRONT-ULTRASSOM | 1.208 | 1.208 | **sim** |
| PRONT-CROQUI2D | 653 | 653 | **sim** |
| PRONT-FOLHA-DADOS | 1.558 | 1.558 | **sim** |
| PRONT-PRONTUARIO | 1.419 | 1.419 | **sim** |
| PRONT-CONTINUACAO | 2.432 | 2.432 | **sim** |
| PRONT-MEMORIAL | 1.046 | 1.046 | **sim** |

Os poucos campos que saem `--` (CÓDIGO DE PROJETO, EDIÇÃO, TIPO DE CONSTRUÇÃO) e o
`NOME DA EMPRESA` do cabeçalho saem **iguais nos dois caminhos**: são do template e da massa de
laboratório, não da semeadura. Nada some por causa da 9F.2.

### O que NÃO foi medido, e por quê

- **FCP/carga de produção**: os números vêm do servidor de desenvolvimento, que compila sob
  demanda — mediria o Vite, não a tela. Mesma limitação declarada na 9F.1.
- **Cache frio / offline sob a flag**: não exercitado. Produzir esse estado exige limpar o
  `localStorage`, o que derruba a sessão do laboratório.
- **Escala em organização real**: laboratório não é rollout. Continua valendo a limitação
  declarada desde a 9E.

---

## 6 · Benchmark — a coluna nova não pode piorar a consulta

`EXPLAIN (ANALYZE, BUFFERS)` com **50.000 equipamentos** na projeção:

| consulta | plano | buffers | tempo |
|---|---|---|---|
| catálogo **sem** `tem_prontuario` (linha base) | Index Scan pela PK | **6** | 0,085 ms |
| catálogo **com** `tem_prontuario` (o que a 9F.2 devolve) | Index Scan pela PK | **6** | 0,036 ms |
| busca por prefixo de TAG, com a coluna | Index Scan pela PK | 8 | 0,048 ms |

Mesmo plano, mesmos buffers: a coluna viaja junto com a linha que já era lida. A exigência do
plano ("ela não pode piorar a consulta medida na 9C/9E.2") está cumprida.

---

## 7 · Achado lateral: o croqui lido do `localStorage`

**É defeito ANTERIOR a esta etapa, e não foi corrigido aqui.**

`src/pages/Prontuarios.tsx:292`:

```ts
const croquiSalvo = tag !== '' && localStorage.getItem(`nr13_croqui2d_${tag}`) !== null;
```

Na **v2**, o `localStorage` **não é o cache**: `storageV2.ler()` responde do `Map` em memória
(`cacheLocal.obterRegistro`), e o `localStorage` é só o **PALCO**, materializado ao abrir um
documento e limpo ao fechar. Logo, essa leitura direta tende a devolver `null` mesmo com
croqui salvo — o indicador diria "não gerado" para quem tem.

- **Independe da 9F.2:** a linha é a mesma antes e depois desta etapa, nos dois caminhos da
  flag. A 9F.2 não a introduziu nem a agravou.
- **Não foi corrigida de improviso**, como combinado. A correção certa é trocar por
  `storage.ler`/`lerCru` — uma linha, mas em código que decide o que o usuário vê no
  prontuário, e portanto merece teste próprio e etapa própria.
- **Fica registrada como pendência da 9F.3** (ou de um conserto avulso autorizado).

### O que a MEDIÇÃO mostrou — e ela não confirma a hipótese inteira

Medi `localStorage.getItem('nr13_croqui2d_ZZ-DOC')` em três momentos, com `boot_v9` ligado:

| momento | a chave estava no `localStorage`? |
|---|---|
| documento aberto (palco montado) | **sim** — esperado |
| depois de voltar para a lista | **sim** |
| depois de um **reload completo** da página | **sim** |

Ou seja: **o palco não foi limpo** ao sair do documento, e a chave sobreviveu inclusive ao
boot. Nesse estado o indicador do croqui **acerta por acidente** — ele lê a fonte errada, mas
encontra o resíduo.

Então o registro honesto é: a leitura vem da fonte errada (fato, no código), e o efeito visível
depende de um resíduo do palco (fato, medido). **Não consegui exercitar o caso limpo** — uma
sessão que nunca abriu aquele documento — porque produzi-lo exige limpar o `localStorage`, o
que derruba a sessão do laboratório. Fica assim: defeito de padrão confirmado, consequência
para o usuário **não demonstrada**, e a limpeza do palco vira uma segunda pergunta a investigar
na mesma etapa.

---

## 8 · Estado ao fim

| | |
|---|---|
| Suíte | **1482/1482** (era 1446 — **+36 testes**) |
| `tsc -b` | limpo |
| `npm run build` | verde |
| `testes-9f2.sql` | **18/18 PASSA** (laboratório) |
| `testes-9f.sql` (9F.1) | **12/12 PASSA** — sem regressão |
| Produção | **intocada** — nenhum SQL aplicado, nenhum deploy, nenhuma flag |
| `prontuarios_v9` | existe só no banco **local**; em produção a coluna nem foi criada |
| 9F.3 | não iniciada |

---

## 9 · A flutuação da suíte — investigada, explicada e corrigida (29/08)

O fechamento anterior declarou uma ressalva: **1 teste falhou em 1 de 6 execuções**, e a
identidade não tinha sido capturada (a execução era foreground, sem log salvo). O dono recusou
rollout em cima de flutuação não explicada. Certo.

### Como foi reproduzida

Execuções sequenciais não reproduzem: **6/6 verdes** com o servidor de desenvolvimento de pé.
O que reproduz é **contenção de CPU** — a condição real do dia, quando a suíte rodou junto com
Vite, Chrome, Docker e o laboratório de 50.000. Rodando **duas suítes em paralelo**:

| par | suíte A | suíte B |
|---|---|---|
| 1 | **1 falhou** / 1481 | 1482 ✓ |
| 2 | 1482 ✓ | 1482 ✓ |
| 3 | **1 falhou** / 1481 | 1482 ✓ |

**2 falhas em 6 execuções**, e sempre o MESMO teste:

```
src/services/palcoTrava.test.ts > trava — fallback sem Web Locks
  > sem Web Locks, uma aba VIVA responde ao broadcast e impede a tomada
AssertionError: expected true to be false
```

### A causa

O teste era uma **corrida contra o relógio de parede**:

1. a aba 1 toma a trava e continua viva;
2. o relógio injetado avança além do TTL;
3. a aba 2 chama `adquirirTrava(..., { esperaMs: 200 })`;
4. `alguemReivindica` pergunta no `BroadcastChannel` e espera **200 ms REAIS**;
5. o `BroadcastChannel` do Node entrega de forma **assíncrona**. Sob carga, a resposta da aba 1
   chega DEPOIS do timeout;
6. a aba 2 conclui "ninguém reivindica" e **toma** a trava → `obtida: true` onde o teste espera
   `false`.

As durações registradas confirmam: **293 ms** e **510 ms** para uma janela de 200 ms.

**Mecanismo provado, não deduzido:** encurtando a espera para `esperaMs: 1`, o teste falha
**3 de 3** — sempre com a mesma asserção.

### Classificação

**Flakiness de TESTE por dependência de tempo real.** Não é defeito do produto, não é ordem de
testes, não é estado compartilhado entre arquivos e não é falso positivo: o produto se comporta
exatamente como projetado (janela curta de pergunta e, no silêncio, assume a posse). Quem estava
errado era o teste, que tratava "a resposta chega em 200 ms" como garantia.

### A correção

Duas camadas, ambas no teste — **nenhuma linha de produção mudou**:

1. **`respostaDaAbaViva()`** — antes de medir, o teste prova que o canal está entregando e que a
   aba viva responde, esperando por **CONDIÇÃO** (voltas do event loop), no mesmo padrão do
   `ate()` de `cacheLocal.test.ts`. Isso tira da medição a parte da corrida que é "listener
   ainda não registrado";
2. **janela folgada** (`esperaMs: 2_000` no lugar de 200). Ela **não deixa o teste lento**:
   `alguemReivindica` resolve no instante em que a resposta chega — o teto só é atingido se
   ninguém responder, que é exatamente a regressão que se quer ver falhar.

E um **teste novo** fixa o contrato que a corrida escondia: com `esperaMs: 0` não há pergunta ao
canal, e a expiração sozinha **aceita** tomar a trava de uma aba viva.

### Verificação

| | |
|---|---|
| Arquivo isolado, 5 execuções | **21/21** em todas (era 20 testes; +1 do contrato) |
| **O cenário que reproduzia** (3 pares em paralelo = 6 suítes) | **6/6 verdes**, 1483 testes |
| 5 execuções consecutivas da suíte completa | **1483/1483** nas cinco |
| `tsc -b` | limpo |
| `npm run build` | verde |

A ressalva está fechada: a flutuação tem causa nomeada, mecanismo reproduzido sob demanda e
correção verificada no ambiente que a produzia.
