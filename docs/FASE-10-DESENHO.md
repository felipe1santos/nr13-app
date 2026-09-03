# FASE 10 — RASCUNHO → FINALIZAR → PDF IMUTÁVEL (desenho, nada implementado)

**03/09/2026.** Escrito enquanto a 9G.3 estabiliza. **Nenhuma linha de código
desta fase foi escrita.** Este arquivo organiza o que já foi aprovado, aponta os
choques com invariantes existentes e define a ordem — 10 → 10C → 11 → 12.

---

## 1 · O que muda, em uma frase

Hoje **"Salvar" é finalizar**: o relatório nasce imutável, com PDF e SHA-256
(§7-quater), e nenhum caminho pode alterá-lo (§7-ter). Não existe meio-termo — o
usuário que precisa parar no meio e continuar amanhã não tem onde guardar.

A Fase 10 abre esse meio-termo: **RASCUNHO** (editável, sem PDF) → **FINALIZAR**
(irreversível, gera o PDF) → **FINALIZADO** (exatamente o que existe hoje).

## 2 · A invariante que NÃO pode ser afrouxada

> **§7-quater e §7-ter continuam valendo integralmente para o FINALIZADO.**
> Relatório com `pdfRef` não é remontado, não é editado, e é servido como
> arquivo.

O rascunho não é uma exceção a essa regra — é um estado **anterior** a ela. A
diferença tem de ser explícita no dado, e não deduzida da ausência de PDF:
relatório legado (antes da 9F.4) também não tem `pdfRef`, e legado é
**finalizado**, não rascunho.

**Regra do campo:** `status?: 'rascunho' | 'finalizado'`.
**Ausente = finalizado.** É a mesma convenção de `pdfRef`/`sha256`/`livroSnapshot`
— campo novo opcional, ausência significando o comportamento antigo, sem
retrofit. Ler "sem status = rascunho" transformaria todo relatório assinado do
sistema em editável, de uma vez.

## 3 · 10B.1 — RELATÓRIO: RASCUNHO → FINALIZAR → PDF IMUTÁVEL

**Aprovado formalmente pelo dono em 03/09/2026.** As oito regras abaixo são o
contrato desta etapa.

| # | regra |
|---|---|
| 1 | **Salvar rascunho NÃO gera PDF definitivo.** |
| 2 | **Rascunho continua editável** — quantas vezes o usuário quiser. |
| 3 | **O usuário pode sair e voltar depois** e retomar de onde parou. |
| 4 | **O histórico mostra RASCUNHO e FINALIZADO**, distinguíveis à primeira vista. |
| 5 | **Finalizar abre um modal irreversível.** |
| 6 | **O modal lista os campos obrigatórios faltantes E os opcionais em branco** — os dois grupos, separados. |
| 7 | **Só FINALIZADO gera** PDF final, SHA-256, `pdfRef` e imutabilidade. |
| 8 | **Só FINALIZADO interfere em vencimentos** e nos demais efeitos oficiais. |

```
  [+ Criar Relatório]
          │
          ▼
   ┌─────────────┐   Salvar rascunho (quantas vezes quiser, sem PDF)
   │  RASCUNHO   │◄──────────────┐
   │  editável   │   sai e volta │
   └──────┬──────┘───────────────┘
          │  [Finalizar]
          ▼
   ┌──────────────────────────────────────────────┐
   │ MODAL IRREVERSÍVEL                           │
   │  · OBRIGATÓRIOS faltantes → bloqueiam        │
   │  · OPCIONAIS em branco    → listados, passam │
   │  · confirmação explícita                     │
   └──────┬───────────────────────────────────────┘
          ▼
   drenar ponte → congelar corte do livro → gerar PDF → SHA-256
   → upload → gravar status='finalizado'
          ▼
   ┌─────────────┐
   │ FINALIZADO  │  §7-quater: é ARQUIVO. §7-ter: não se edita.
   └─────────────┘        efeitos oficiais passam a valer
```

**A ordem do "Finalizar" é a do `salvarHistorico` de hoje**, e cada passo está lá
por um motivo já pago: drenar a ponte → corte do livro → `gerarPdfBytes` →
SHA-256 → upload → só então gravar. **Falha em gerar ou subir NÃO finaliza** — o
relatório continua rascunho, que é o estado seguro. Marcar como finalizado sem o
arquivo seria o pior desfecho: pareceria pronto e não existiria.

### 3.1 · O modal: obrigatórios × opcionais

Os dois grupos aparecem, e só um bloqueia.

| grupo | exemplos | comportamento |
|---|---|---|
| **obrigatórios faltantes** | engenheiro assinante, nº do relatório, data, nenhum documento selecionado | **impedem** finalizar |
| **opcionais em branco** | campo de folha vazio, foto sem descrição, medição sem valor, observação em branco | **listados**, não impedem |

A lista precisa **levar ao campo** — clicar leva à folha e ao ponto. Lista que só
nomeia o problema devolve o trabalho ao usuário.

> **Onde isso mora:** função pura sobre `documentos` + `meta`, testável sem
> render — a mesma escolha de `catalogoRelatorios.ts` e `modoHidratacao.ts`.
> Regra que vive no JSX não tem teste (o ambiente da suíte é `node`).

### 3.2 · Enquanto é rascunho, a trava de somente-leitura fica DESLIGADA

`somenteLeitura` (§7-ter) tem três camadas — DOM, `sb-storage.js` com `ro=1`, e a
não-drenagem da ponte. No rascunho as três ficam abertas; ao finalizar, as três
fecham. Como `paramsSomenteLeitura(true)` já é quem decide o `&ro=1`, muda **quem
calcula esse booleano**, não o mecanismo.

---

## 4 · Os choques com o que já existe — o que a 10B.1 tem de resolver

### 4.1 · Rascunho NÃO pode mexer em vencimento

`vencimentos_org` e `listarVencimentos` montam o prazo do equipamento a partir do
**relatório mais recente**. Um rascunho com data preenchida passaria a ser "o mais
recente" e **mudaria o prazo de inspeção de um equipamento** — número que o
engenheiro usa para agendar, saído de um documento que ninguém assinou.

**Regra:** o agregado e a regra local filtram `status <> 'rascunho'`. Exige a
coluna na projeção (§4.2) e um caso novo em `testes-9g2.sql`.

### 4.2 · A projeção precisa de uma coluna, e coluna nova tem preço conhecido

`relatorios_index` ganha `status text` — **nullable, sem default**, `null`
significando finalizado (legado). Pelo que a 9F.1–9F.4 mediram, custa: alteração
em `busca_manutencao.sql`, alteração na consulta, e **reprojeção TAG a TAG** para
sair de `null`. Armadilha já registrada: `reconstruir_indice_busca` com o cursor
no fim é no-op silencioso — usar `reparar_divergencias`.

### 4.3 · A contagem do catálogo (9F.6) passa a misturar os dois

`contar_relatorios_por_tag` conta linhas de `relatorios_index`. Com rascunhos lá
dentro, o selo "3 Relatórios" contaria um documento que não existe como
documento. **Ou** a função ganha o filtro, **ou** devolve os dois números.
Decisão da 10, com teste.

### 4.4 · O Livro deixa de receber entrada automática — ver 10B.2

Este item mudou de natureza: não é mais "o Livro só recebe ao finalizar", e sim
**o Livro deixa de receber sozinho**. É a 10B.2, abaixo.

---

## 4-BIS · 10B.2 — LIVRO / REGISTRO DE SEGURANÇA: o registro passa a ser MANUAL

**Aprovado pelo dono em 03/09/2026. Nada disto foi implementado.**

> **Finalizar um relatório de inspeção NÃO cria mais, automaticamente, um
> Registro no Livro.** O Registro passa a ser criado MANUALMENTE pelo usuário.

```
  [NOVO REGISTRO]
        │
        ▼
   usuário preenche
        │
        ▼
   ┌──────────────┐   SALVAR (quantas vezes quiser)
   │   SALVO      │◄──────────────┐
   │  editável    │   sai e volta │
   └──────┬───────┘───────────────┘
          │  [TRANCAR REGISTRO]
          ▼
   ┌──────────────────────────────┐
   │ MODAL IRREVERSÍVEL           │
   │  explica + valida + confirma │
   └──────┬───────────────────────┘
          ▼
   gerar hash → incorporar à cadeia → imutável
          ▼
   ┌──────────────┐
   │  TRANCADO    │  aparece no Portal do Cliente
   └──────────────┘
```

### Os dois estados

| | **SALVO** (rascunho do registro) | **TRANCADO** |
|---|---|---|
| editável | **sim** | **nunca** |
| hash definitivo | não | sim |
| entra na cadeia imutável | não | sim |
| aparece no Portal / Painel do Cliente | **não** | sim |
| pode ser retomado depois | sim | não se aplica |
| pode ser descartado | sim | **nunca** |

**REGRA ABSOLUTA: registro trancado nunca volta para editável.** Correção
posterior usa **retificação / nova ocorrência**, preservando o bloco anterior —
que é exatamente o mecanismo que já existe (`retificaDe`).

### O que TRANCAR faz, na ordem

1. abrir o modal explicando que é irreversível;
2. validar os campos;
3. confirmar a intenção;
4. gerar o hash;
5. incorporar à cadeia do Livro (`shaAnterior` = última lacrada);
6. tornar o registro imutável;
7. **só então** liberar para o Portal do Cliente.

---

## 4-TER · 10B.2 — MAPA DO CÓDIGO QUE PRECISARÁ MUDAR

**Levantado por leitura do código em 03/09/2026. NADA foi alterado.** Este é o
inventário dos pontos afetados.

### A · O ponto que cria a entrada automática

| onde | o quê |
|---|---|
| `src/features/relatorios/relatoriosService.ts:338` | **`adicionarEntradaLivroAuto(relatorio)`** — a função inteira. Comentário atual: *"NR-13 13.5.1.8 — entrada automática no Livro de Registro de Segurança a cada relatório novo"* |
| `src/pages/Relatorios.tsx:23` | o import |
| `src/pages/Relatorios.tsx:728` | **a chamada**, logo depois de `salvarNoHistorico(relatorio)` — é ESTA linha que some |
| `src/features/relatorios/__tests__/relatoriosService.test.ts:77–131` | o bloco `describe('adicionarEntradaLivroAuto…')`, incluindo o teste de não-duplicação por `relatorioCodigo` |

> **A função pode não morrer.** Criar um registro manualmente *a partir de um
> relatório* provavelmente reaproveita quase tudo o que ela monta (tipo, ensaios,
> laudo APTO/INAPTO, assinante congelado). O que muda é **quem a dispara**: deixa
> de ser o "Finalizar" e passa a ser o botão do usuário no Livro.

### B · O estado novo, e onde ele colide com "nasce lacrada"

Hoje **toda** entrada nasce com `lacrado: true` e com `sha256` — a automática e a
manual.

| onde | o quê |
|---|---|
| `relatoriosService.ts:393` | `lacrarEntrada(...)` na entrada automática |
| `relatoriosService.ts:453` | `lacrado: true` na manual — comentário: *"Nasce lacrada (mesma regra da entrada automática)"* |
| `src/features/relatorios/livroLacre.ts` | `lacrarEntrada`, `ultimaLacrada`, `verificarCadeia`, `verificarEntrada` |
| `relatoriosService.ts:71` | `estaLacrada(e)` |

**O problema fino, e é de significado, não de código:** hoje entrada **sem
`sha256` significa ANTIGA** (anterior ao lacre), e `verificarCadeia` a PULA sem
acusar adulteração (§7-quinquies). Um rascunho de registro também não teria
`sha256`. Sem um marcador próprio, os dois viram a mesma coisa na tela — e
"Sem lacre" passaria a significar duas coisas opostas.

**Decisão necessária na 10B.2:** campo explícito, p. ex. `rascunho: true`, que
some ao trancar. Ausência = comportamento de hoje (antiga ou trancada), pela
mesma convenção do `status` do relatório.

### C · Onde um rascunho VAZARIA se nada for filtrado

Todos estes leem `nr13_livro_<TAG>` direto e passariam a ver o rascunho:

| onde | risco |
|---|---|
| `src/pages/portal/PortalAtivo.tsx:96` | **o mais grave — o CLIENTE veria registro não trancado** |
| `public/arquivos-inspecao/LIVRO-REGISTRO.html` | a folha imprimiria o rascunho dentro de um PDF imutável |
| `src/pages/LivroRegistro.tsx:93` | a tela do livro (aqui ele DEVE aparecer, marcado) |
| `src/features/livro/catalogoLivro.ts:75` | `abrirEquipamentoParaLivro` |
| `supabase/busca_manutencao.sql:296` | **`v_liv_n := jsonb_array_length(v_livro)`** → `livro_entradas` contaria rascunhos, e a lista da 9F.4 diria "3 registros" com 2 trancados |
| idem | `livro_ultima` = MAX(data) — rascunho com data futura viraria "último registro" |
| `src/pages/Relatorios.tsx:689` | o `livroCorte` da emissão contaria rascunhos em `entradas` |

### D · O que NÃO precisa mudar — e é a boa notícia

**A trava do banco já tolera rascunho.** `supabase/livro_imutavel.sql` compara
apenas as entradas que têm `sha256` (`where e ? 'sha256'`): a sequência lacrada do
valor novo precisa começar pela do valor antigo. Entrada **sem** `sha256` é
invisível para a guarda — logo **criar, editar e apagar um rascunho passa pelo
trigger sem nenhuma alteração de SQL**.

A 10B.2 **não precisa afrouxar a trava de imutabilidade**. É mudança de cliente e
de UI, com filtros nos consumidores. Afrouxar o trigger seria a maneira errada de
fazer isto, e não é necessária.

### E · O que já existe e será reaproveitado

| peça | para quê |
|---|---|
| `adicionarEntradaLivroManual` (`relatoriosService.ts:429`) | já cria ocorrência manual lacrada; vira o passo **TRANCAR** |
| `LivroRegistro.tsx:445` | já chama a criação manual a partir da UI |
| `retificaDe` | já é o caminho de correção de registro trancado |
| `camposDaRubrica` | congelamento de rubrica/cargo na criação |
| `livroLacre.ts` | hash canônico e elo da cadeia |

### F · A migração dos dados existentes

**Nenhuma.** Todo registro que existe hoje nasceu lacrado; sem `rascunho: true`,
todos continuam trancados. É a mesma regra do `status` do relatório: **a ausência
do campo novo significa o comportamento antigo**. Sem retrofit, sem varredura.

---

## 5 · As telas — UX documental aprovada

### 5.1 · `/relatorios` — lista RELATÓRIOS, não equipamentos

| requisito | nota |
|---|---|
| listar relatórios **diretamente** | hoje lista equipamentos; o relatório só aparece depois do clique |
| **mais recentes primeiro** | ordenação por data de emissão, decrescente |
| **ícone PDF à esquerda** | o artefato é o objeto principal da linha |
| filtros: **data, equipamento/TAG, empresa, tipo** | quatro eixos |
| **depois**: badges RASCUNHO / FINALIZADO | entra junto com a 10B.1 |

**A boa notícia:** `relatorios_index` já tem `emissao`, `validade`, `tipo`,
`status`, `profissional`, `tag`, `codigo`, `pdf_ref` e o índice `(org_id, tag)`.
Falta uma RPC de listagem (`buscar_relatorios`) com keyset **por data**, no molde
de `buscar_equipamentos`/`buscar_livros`, e um índice por `(org_id, emissao desc)`.

O filtro por **empresa** exige o cliente na projeção: hoje `cliente_nome` está em
`equipamentos_index`, não em `relatorios_index` — ou entra por junção, ou vira
coluna (e coluna nova cobra reprojeção, §4.2).

O catálogo por equipamento da 9F.6 **não morre**: vira o caminho de "criar
relatório para este equipamento".

### 5.2 · `/prontuarios` — lista PRONTUÁRIOS, com filtros equivalentes

Mesmo movimento. Pergunta em aberto (§8): hoje o prontuário é **derivado** do
equipamento — `nr13_prontuario_meta_<TAG>` é por TAG, não por documento, e a
projeção tem `tem_prontuario` (booleano). Listar prontuários direto exige decidir
se ele ganha identidade própria.

### 5.3 · `/calibracoes` — NÃO muda de eixo

| requisito | nota |
|---|---|
| continuar centrada em **EQUIPAMENTOS que possuem calibrações** | o eixo por equipamento é o certo aqui: a calibração pertence a um componente, que pertence a um equipamento |
| **foto do equipamento à esquerda** | identificação visual imediata |
| **não listar equipamento sem calibração** | por padrão — é a tela de quem tem, não o parque inteiro |

### 5.4 · Histórico mostra os dois

Rascunhos e finalizados na mesma lista, distinguíveis à primeira vista. Rascunho
abre para editar e pode ser descartado; finalizado abre o **arquivo**
(§7-quater) e nunca é editado — só Duplicar.

---

## 6 · O layout novo — o que a referência já entrega e o que ela cobra

Fonte: `C:\projetos\vender\relatorio-nr13.html` (101 KB, arquivo único).

| medido | valor |
|---|---|
| folhas A4 (`section.folha`) | **22** |
| `@page` | `size: A4 portrait; margin: 0` |
| fonte | `Carlito, Calibri, Segoe UI, Arial` |
| `contenteditable` | **120 pontos** — já nasce editável, casa com o RASCUNHO |
| `display:grid` | 3 |
| `display:flex` | 9 |
| numeração | seções numeradas (`1. OBJETIVO`, `2. DOCUMENTOS DE REFERÊNCIA`, `2.1 ESCOPO…`) |

**O que ele cobra:** `grid` e `flex` no caminho de rasterização. A regra do
projeto é que folha nova se valida **rasterizando de verdade** (abrir no
localhost, rodar `html2canvas` e olhar a imagem) — screenshot do DOM não prova
nada, e foi assim que o memorial saiu como texto plano no PDF em 18/07/2026.

**É exatamente por isso que o layout novo e o PDF vetorial andam juntos:** o
caminho vetorial elimina a classe inteira de armadilha de raster, em vez de
validá-la folha a folha, 22 vezes.

### 6.1 · O que NÃO se mexe agora — lista fechada

Aprovada pelo dono em 03/09/2026. Nenhuma das etapas 10 / 10C / 11 / 12 toca
nestes itens sem uma decisão nova e explícita:

| intocado | por quê |
|---|---|
| **certificados de calibração** | têm assinatura própria e independente (§7-bis); mexer no layout deles é outra frente |
| **Livro histórico já trancado** | é cadeia lacrada; o banco recusa (§7-quinquies), e é assim que tem de ser |
| **capa do Registro de Segurança** | `CAPA-LIVRO-REGISTRO.html` |
| **termo de abertura** | `TERMO-ABERTURA.html` |
| **PDFs históricos** | §7-quater: relatório finalizado é ARQUIVO. Regerar no layout novo produziria um documento com os dados de hoje carimbado como o artefato daquela emissão |

## 7 · A ordem, e o que cada etapa entrega

| etapa | entrega | irreversível? |
|---|---|---|
| **10B.1** | RELATÓRIO: RASCUNHO → FINALIZAR → PDF imutável; modal irreversível com obrigatórios × opcionais; histórico com os dois estados | não — atrás de flag, como as oito anteriores |
| **10B.2** | LIVRO: registro **manual**, SALVAR → TRANCAR; fim da entrada automática ao finalizar relatório | não — o rascunho é estado novo; o trancado continua imutável |
| **10 · UX** | `/relatorios` e `/prontuarios` listando DOCUMENTOS com filtros; `/calibracoes` mantida por equipamento | não |
| **10C** | **especificação e mapeamento visual**: folha a folha da referência × folha atual, campo a campo, com a fonte de dado de cada um (as chaves do §2) | não — é documento |
| **11** | o relatório no layout novo + **PDF vetorial/híbrido** | não para o passado: **sem retrofit** |
| **12** | o mesmo tratamento no Prontuário | idem |

**Referência oficial do layout novo:** `C:\projetos\vender\relatorio-nr13`
(hoje o arquivo `relatorio-nr13.html`, medido no §6).

**Ordem entre 10B.1 e 10B.2:** a 10B.2 depende da 10B.1 no ponto exato em que a
chamada automática é removida — `Relatorios.tsx:728`, que só existe dentro do
"Finalizar". Fazer a 10B.2 antes deixaria o sistema sem nenhuma criação de
registro a partir de relatório por um intervalo. **10B.1 primeiro.**

### A regra que atravessa 11 e 12

> **NENHUM RETROFIT.** Relatório finalizado no layout antigo continua sendo
> servido como o arquivo que foi emitido. Regerar um PDF antigo no layout novo
> produziria um documento com os dados de hoje carimbado como o artefato daquela
> emissão — é a mesma razão pela qual a 9F.4 não regerou PDF de relatório legado.

## 8 · O que NÃO está decidido

1. **O rascunho vai para o servidor ou fica no aparelho?** No servidor, ele
   sincroniza entre PC e celular — que é o fluxo real do §1 do `CLAUDE.md`
   (campo no celular, escritório no PC). No aparelho, é mais simples e some se
   o aparelho sumir. **Recomendação: servidor**, como chave por TAG, com o mesmo
   tratamento de fila offline.
2. **Um rascunho por equipamento, ou vários?** Vários abre a porta para dois
   rascunhos divergentes do mesmo relatório.
3. **Rascunho expira?** Um rascunho de oito meses com dados de campo velhos é
   uma armadilha silenciosa.
4. **`/prontuarios` listando prontuários exige identidade própria?** Ver §5.2.
5. **O registro do Livro (10B.2) precisa de campo próprio ou reaproveita
   `rascunho: true` no array?** Ver §4-TER B — a decisão é de significado: hoje
   "sem `sha256`" quer dizer *entrada antiga*, e o rascunho não pode herdar esse
   sentido.
6. **Quem pode TRANCAR um registro?** Só o engenheiro assinante, ou qualquer
   usuário com acesso ao módulo? Trancar é irreversível e entra na cadeia — a
   permissão importa.
7. **O filtro por EMPRESA em `/relatorios` entra por junção ou por coluna nova
   em `relatorios_index`?** Ver §5.1 — coluna nova cobra reprojeção TAG a TAG.

Nada disso bloqueia a 10C — que é justamente onde essas perguntas viram
requisito escrito.
