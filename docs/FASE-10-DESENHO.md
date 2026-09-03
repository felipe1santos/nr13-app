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

## 3 · O fluxo

```
  [+ Criar Relatório]
          │
          ▼
   ┌─────────────┐   Salvar (quantas vezes quiser)
   │  RASCUNHO   │◄──────────────┐
   │  editável   │               │
   └──────┬──────┘───────────────┘
          │  [Finalizar]
          ▼
   ┌──────────────────────────────┐
   │ VALIDAÇÃO: campos vazios     │  lista o que falta, com link para o campo
   └──────┬───────────────────────┘
          │  nada bloqueante pendente
          ▼
   ┌──────────────────────────────┐
   │ MODAL IRREVERSÍVEL           │  "Depois disso o relatório não pode mais
   │ confirmação explícita        │   ser editado. Para mudar algo, Duplicar."
   └──────┬───────────────────────┘
          ▼
   gerar PDF → SHA-256 → upload → gravar status='finalizado'
          ▼
   ┌─────────────┐
   │ FINALIZADO  │  §7-quater: é ARQUIVO. §7-ter: não se edita.
   └─────────────┘
```

**A ordem do "Finalizar" é a mesma do `salvarHistorico` de hoje** e cada passo
importa pelo mesmo motivo: drenar a ponte → congelar `livroSnapshot` →
`gerarPdfBytes` → SHA-256 → upload → só então gravar. **Falha em gerar ou subir
não finaliza** — o relatório continua rascunho, que é o estado seguro.

### 3.1 · A validação de campos vazios

Não é enfeite: é o que evita que "irreversível" produza um documento pela metade.

- **Bloqueante** (impede finalizar): assinante sem engenheiro, número/data do
  relatório vazios, nenhum documento selecionado.
- **Aviso** (lista, mas deixa passar): campos de folha em branco, foto sem
  descrição, medição sem valor.

A lista precisa **levar ao campo** — clicar leva à folha e ao ponto. Uma lista de
pendências que só nomeia o problema devolve o trabalho ao usuário.

> **Onde isso mora:** função pura sobre a lista de documentos + a meta, testável
> sem render — a mesma escolha de `catalogoRelatorios.ts` e `modoHidratacao.ts`.
> Regra que vive no JSX não tem teste (o ambiente da suíte é `node`).

### 3.2 · Enquanto é rascunho, a trava de somente-leitura fica DESLIGADA

`somenteLeitura` (§7-ter) tem três camadas — DOM, `sb-storage.js` com `ro=1`, e a
não-drenagem da ponte. No rascunho as três ficam abertas; ao finalizar, as três
fecham. Como `paramsSomenteLeitura(true)` já é o que decide o `&ro=1`, a mudança
é de **quem** calcula esse booleano, não de mecanismo.

## 4 · Os choques com o que já existe — o que a Fase 10 tem de resolver

### 4.1 · Rascunho NÃO pode mexer em vencimento

`vencimentos_org` e `listarVencimentos` montam o prazo do equipamento a partir do
**relatório mais recente**. Um rascunho com data preenchida passaria a ser "o
mais recente" e **mudaria o prazo de inspeção de um equipamento** — número que o
engenheiro usa para agendar, saído de um documento que ninguém assinou.

**Regra:** o agregado e a regra local filtram `status <> 'rascunho'`. Isso exige
a coluna na projeção (§4.2) e um caso no `testes-9g2.sql`.

### 4.2 · A projeção precisa de uma coluna, e coluna nova tem preço conhecido

`relatorios_index` ganha `status text` — **nullable, sem default**, com `null`
significando finalizado (legado). Pelo que a 9F.1–9F.4 mediram, isso custa:
alteração em `busca_manutencao.sql`, alteração na consulta, e **reprojeção TAG a
TAG** para sair de `null`. E a armadilha já registrada: `reconstruir_indice_busca`
com o cursor no fim é no-op silencioso — usar `reparar_divergencias`.

### 4.3 · A contagem do catálogo (9F.6) passa a misturar os dois

`contar_relatorios_por_tag` conta linhas de `relatorios_index`. Com rascunhos
lá dentro, o selo "3 Relatórios" passaria a contar um documento que não existe
como documento. **Ou** a função ganha o filtro, **ou** devolve os dois números.
Decisão da 10, com teste.

### 4.4 · O Livro de Registro só recebe entrada ao FINALIZAR

Hoje o livro é congelado em `livroSnapshot` no salvar. Rascunho não escreve no
livro — entrada de livro é lacrada e a trava do banco (§7-quinquies) recusa
edição. Um rascunho que lançasse entrada criaria um registro imutável de um
documento que ainda pode mudar.

## 5 · As telas

### 5.1 · `/relatorios` — passa a listar RELATÓRIOS

Hoje lista **equipamentos**, e o relatório aparece depois do clique. Passa a
listar os relatórios direto, **ordenados por data**, com filtros.

**A boa notícia:** `relatorios_index` já tem tudo — `emissao`, `validade`,
`tipo`, `status`, `profissional`, `tag`, `codigo`, `pdf_ref`, e o índice
`(org_id, tag)`. Falta uma RPC de listagem (`buscar_relatorios`) com keyset por
data, no molde de `buscar_equipamentos`/`buscar_livros`, e um índice por
`(org_id, emissao desc)`.

Filtros: TAG/equipamento, tipo de inspeção, período, e **rascunho × finalizado**.

O catálogo por equipamento da 9F.6 **não morre**: vira o caminho de "criar
relatório para este equipamento".

### 5.2 · `/prontuarios` — passa a listar PRONTUÁRIOS

Mesmo movimento. Hoje lista equipamentos com prontuário (flag `prontuarios_v9`,
coluna `tem_prontuario`). Passa a listar os prontuários. Precisa decidir se
prontuário ganha identidade própria na projeção ou continua derivado do
equipamento — hoje ele é **derivado**, e `nr13_prontuario_meta_<TAG>` é por TAG,
não por documento.

### 5.3 · `/calibracoes` — NÃO muda de eixo

Continua centrada em **EQUIPAMENTOS que possuem calibrações**, com a **foto do
equipamento à esquerda**. É a tela onde o eixo por equipamento é o certo: a
calibração pertence a um componente, que pertence a um equipamento.

### 5.4 · Histórico mostra os dois

Rascunhos e finalizados na mesma lista, distinguíveis à primeira vista. Rascunho
abre para editar; finalizado abre o **arquivo** (§7-quater). Rascunho pode ser
descartado; finalizado, nunca — só Duplicar.

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

## 7 · A ordem, e o que cada etapa entrega

| etapa | entrega | irreversível? |
|---|---|---|
| **10** | RASCUNHO → FINALIZAR → PDF imutável; validação de campos; histórico com os dois; `/relatorios` e `/prontuarios` listando documentos | não — atrás de flag, como as oito anteriores |
| **10C** | **especificação e mapeamento visual**: folha a folha da referência × folha atual, campo a campo, com a fonte de dado de cada um (as chaves do §2) | não — é documento |
| **11** | o relatório no layout novo + **PDF vetorial/híbrido** | não para o passado: **sem retrofit** |
| **12** | o mesmo tratamento no Prontuário | idem |

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

Nada disso bloqueia a 10C — que é justamente onde essas perguntas viram
requisito escrito.
