# 9E · `/relatorios` em escala — implementação e GATE 9E.2 MEDIDO

**25/08/2026.** Autorizada depois do fechamento do P9.3. **Nada foi aplicado em produção**: nem
SQL, nem deploy, nem flag. Este registro é o conjunto fechado que o dono pediu para revisar antes
do rollout.

---

## 1 · O problema, em números

`/relatorios` tem **zero** campo de texto. Para achar um relatório de dois anos atrás, o usuário
escolhe o equipamento e rola a lista.

O remédio óbvio — "filtra no cliente" — é o pior possível aqui: cada `nr13_rel_<id>_<TAG>` pesa
**~110 KB** por causa dos snapshots congelados do §7-bis (logo em base64, duas rubricas PNG,
`certCalibracoes`, `livroSnapshot`). Uma organização com 100 relatórios baixaria ~11 MB para
escrever linhas de texto numa tabela; com 1.000, ~110 MB.

---

## 2 · A regra bloqueante, e como ela é garantida

> **LISTAR, BUSCAR, FILTRAR e PAGINAR = zero PDF.**
> Só ABRIR / VISUALIZAR / BAIXAR / IMPRIMIR tocam o arquivo.

A busca trafega `pdfRef` — uma string — e o `sha256` como metadado, para a conferência continuar
possível sem baixar nada. **Nenhum PDF é regenerado; nenhum SHA-256 muda.**

A prova é NEGATIVA (algo que *não* acontece), então o teste não confia em inspecionar o
resultado: `buscaRelatorios.semPdf.test.ts` instrumenta **todas** as portas de saída do cliente
Supabase — `rpc`, `from()` e `storage` — e reprova se qualquer uma que não seja o índice for
tocada durante o ciclo real da tela (abrir → digitar → filtrar período → paginar até o fim).

Um dos casos mede a promessa direto:

| acervo | consultas no ciclo | acessos ao storage |
|---|---|---|
| 60 relatórios | N | **0** |
| 10.000 relatórios | **o mesmo N** | **0** |

---

## 3 · O que foi construído

| peça | arquivo |
|---|---|
| RPCs `buscar_relatorios` / `contar_relatorios`, colunas geradas, índices | `supabase/busca_relatorios.sql` |
| Serviço de busca (keyset, cursor composto, fusão do recém-salvo) | `src/services/buscaRelatorios.ts` |
| Resposta offline pelo catálogo do aparelho | `src/services/relatoriosLocais.ts` |
| A tela | `src/features/relatorios/RelatoriosV9.tsx` |
| Interruptor da flag por tela | `src/pages/Relatorios.tsx` |
| Testes SQL (isolamento, keyset real, índices) | `scripts/fase9/testes-9e.sql` |
| Benchmark de 1.000 a 50.000 | `scripts/fase9/bench-9e.sql` |

### 3.1 · Decisões que mudam comportamento

**`ordem_emissao = coalesce(emissao, '0001-01-01')` é INTERNO.** Relatório sem data é real
(importado, antigo) e não pode sumir da paginação. A sentinela o mantém no fim da lista e faz o
keyset ser uma comparação de tupla, em vez de um caso especial na fronteira.

> **A sentinela NUNCA chega à tela.** `dataBr()` a converte em **"Sem data"**, junto com nulo e
> vazio. Ninguém emitiu relatório no ano 1, e mostrar `01/01/0001` seria trocar um dado ausente
> por um dado falso. E ela também **não é um fato**: o filtro de período roda sobre `emissao`, a
> coluna real, então relatório sem data fica FORA de um intervalo que o usuário escolheu — regra
> testada nos dois caminhos, servidor e offline.

**Keyset com as duas colunas descendo** (`ordem_emissao desc, relatorio_id desc`). Direções
mistas impedem a comparação de tupla e fazem o índice ser abandonado. O desempate único (I5)
fica igualmente satisfeito.

**Filtros com suporte REAL, e só eles:** período e tipo. `status` e `profissional` existem na
projeção mas **não ganharam índice** — o gate 9E-b4 exige benchmark antes, e filtro sem índice
numa organização grande é uma varredura disfarçada de recurso.

> **O `9E-b2` (TAG) ganhou índice próprio, e isso mudou por causa da medição.** A primeira
> versão reusava o índice que a 9B criou, com o argumento de que "índice a mais é escrita mais
> cara". O benchmark em 50.000 linhas mostrou que o reuso **não acontecia** (o índice da 9B é
> sobre `tag` cru; o predicado usava `upper(tag)`), e o custo foi de **24.770 buffers**. Ver §6.1.

---

## 4 · Paridade: caminho atual × `RelatoriosV9`

| coluna / recurso | legado | V9 | nota |
|---|---|---|---|
| Nome do relatório | sim | sim | |
| TAG | sim | sim | |
| Tipo | sim | sim | |
| Criação (emissão) | sim | sim | vazio passa a mostrar **"Sem data"** |
| Validade | sim | sim | idem |
| Próx. interna / externa | sim | trafegada, fora da grade | ver §4.1 |
| Val. válvula / manômetro | sim | **ausente** | ver §4.1 |
| Abrir / visualizar PDF | sim | sim | mesma ação, mesmo artefato |
| Renomear · duplicar · excluir | sim | **ausente** | ver §4.1 |
| Seleção múltipla | sim | ausente | idem |
| **Busca textual** | **não existe** | sim | TAG, código, dígitos, nome |
| **Período** | **não existe** | sim | |
| **Contador de resultados** | **não existe** | sim | com teto ("mais de 1.000") |
| Escopo | histórico de UMA TAG | **toda a organização** | |

### 4.1 · As diferenças, explicadas ANTES do rollout

1. **Val. válvula / manômetro** vêm de `validadesPorRelatorio`, derivado dos lotes de calibração
   no cache local — não estão em `relatorios_index`. Numa busca global sobre 10.000 relatórios,
   resolvê-las exigiria ler os lotes de todos os equipamentos, que é exatamente o custo que esta
   etapa remove. **Elas continuam no histórico por equipamento, que não foi tocado.** Levá-las
   para a projeção é decisão de escopo, não de implementação — e precisa de autorização.
2. **Renomear, duplicar, excluir e seleção múltipla** operam sobre o registro completo
   (`nr13_rel_…`), não sobre o metadado. Mantê-las aqui significaria carregar os ~110 KB ao
   clicar — possível, e é o que o legado faz. **Ficaram de fora de propósito:** a 9E é sobre
   ACHAR o relatório; as ações seguem no caminho por equipamento.
3. **Próx. interna/externa** estão na projeção e viajam na resposta; só não entraram na grade,
   para a linha caber no celular. Colocá-las é CSS, não dado.

> Nenhuma dessas diferenças faz informação DESAPARECER do sistema: todas continuam acessíveis
> pelo caminho por equipamento, que segue igual.

---

## 5 · Testes

| suíte | o que trava |
|---|---|
| `buscaRelatorios.test.ts` (20) | contrato da RPC, cursor composto, filtro vazio vira `null`, erro nunca vira lista vazia |
| `buscaRelatorios.keyset.test.ts` (12) | **paginação completa sem duplicar e sem pular**, 120 na mesma data, sem data, fronteira, inserção e exclusão concorrentes |
| `buscaRelatorios.semPdf.test.ts` (6) | **zero PDF**, zero `app_storage`, consultas constantes com o acervo |
| `relatoriosLocais.test.ts` (20) | offline: conversão de data, filtros equivalentes, sem-data fora do período, sem tocar PDF |

**Suíte completa: 1378/1378. Build verde.** Os testes de servidor (25) estão no §6.8.

---

## 6 · GATE 9E.2 — o benchmark de escala, EXECUTADO

**Docker ligado em 25/08.** Massa de 1.000 · 5.000 · 10.000 · 20.000 · 50.000 relatórios,
**só metadados** — `pdf_ref` é string, nenhum PDF criado.

### 6.1 · O gate REPROVOU na primeira passada, e o defeito era real

| consulta | 1.000 | 5.000 | 10.000 | 20.000 | **50.000** |
|---|---|---|---|---|---|
| 1ª página | 444 | 260 | 274 | 287 | **303** |
| keyset (página profunda) | 13 | 56 | 55 | 55 | **57** |
| busca por TAG | 116 | 446 | 724 | 20.173 | **24.770** |
| código só dígitos | 64 | 435 | 712 | 20.160 | **50.423** |
| período de 1 mês | 70 | 435 | 712 | 3.751 | **9.393** |
| termo inexistente | 64 | 435 | 712 | 20.160 | **50.423** |
| contagem | 221 | 214 | 214 | 214 | **214** |

*(buffers — páginas lidas)*

Listagem, keyset e contagem já eram constantes. Mas **busca, código, período e termo inexistente
cresciam junto com o acervo** — 50.423 buffers é a tabela inteira. O plano explicou:

```
Index Scan using relatorios_index_ordem_idx
  Filter: (upper(codigo) ~~ 'VP-0250%' OR upper(tag) ~~ 'VP-0250%')
  Rows Removed by Filter: 24498          ← 24.754 buffers, 22 ms
```

Três causas, e as três eram minhas:

1. **`upper(tag)` não tinha índice.** Eu havia decidido "reusar o índice da 9B para poupar
   escrita" — a medição mostrou que o reuso **não acontece**: o índice da 9B é sobre `tag` cru, e
   o predicado usava `upper(tag)`.
2. **Btree de collation linguística não serve a `LIKE 'ABC%'`** — falta `text_pattern_ops`.
3. **`OR` + `ORDER BY` + `LIMIT`**: o planner apostava em percorrer o índice de ORDENAÇÃO e
   filtrar linha a linha, esperando achar 51 cedo. Com termo seletivo (ou que não casa nada), a
   aposta perde e ele varre tudo.

### 6.2 · As correções

- **`relatorios_index_tag_prefixo_idx`** — `(org_id, tag text_pattern_ops)`. A TAG é gravada em
  caixa alta (`normalizarTag`), então o predicado passou a comparar sem `upper`, igual à 9C.
- **Dois caminhos na RPC.** Sem termo, a ordem É o filtro (percorre o índice e para no limite).
  Com termo, uma **CTE `materialized`** restringe primeiro pelos índices de texto e só então
  ordena o punhado que sobrou — é ela que impede o planner de recair no caso ruim.
- **Período sobre `ordem_emissao`** (com `emissao is not null`), para virar `Index Cond` no mesmo
  índice da ordenação em vez de `Filter`.

### 6.3 · Depois das correções — o gate PASSA

| consulta | 1.000 | 5.000 | 10.000 | 20.000 | **50.000** | antes → depois em 50k |
|---|---|---|---|---|---|---|
| 1ª página | 597 | 434 | 451 | 467 | **481** | — |
| keyset (página profunda) | 14 | 56 | 55 | 55 | **56** | — |
| busca por TAG | 193 | 473 | 754 | 1.314 | **454** | 24.770 → 454 (**55×**) |
| código só dígitos | 37 | 406 | 684 | 1.240 | **266** | 50.423 → 266 (**190×**) |
| período de 1 mês | 10 | 55 | 55 | 55 | **56** | 9.393 → 56 (**168×**) |
| termo inexistente | 37 | 406 | 684 | 1.240 | **266** | 50.423 → 266 (**190×**) |
| contagem | 192 | 184 | 184 | 184 | **184** | — |

**Tempos em 50.000:** 1ª página 0,76 ms · keyset 0,22 ms · TAG 3,02 ms · código 1,77 ms ·
período 0,44 ms · contagem 0,44 ms.

> **Nenhuma consulta cresce com o acervo.** De 1.000 para 50.000 — cinquenta vezes mais
> relatórios — o custo fica na mesma ordem de grandeza. É a promessa da 9E, agora medida.

### 6.4 · O plano, que é a prova de que o índice é escolhido

`EXPLAIN` sobre uma função plpgsql mostra só o `Function Scan`; por isso o benchmark repete o
predicado inline. Busca por TAG em 50.000:

| caminho | plano | buffers | tempo |
|---|---|---|---|
| **novo** | `BitmapOr` de `tag_prefixo_idx` + `codigo_idx` | **205** | **0,35 ms** |
| antigo | `Index Scan` de ordenação + `Filter`, 24.498 linhas descartadas | 24.754 | 22,14 ms |

**121× menos buffers, 63× mais rápido.** Os demais planos:

- 1ª página → `Index Only Scan using relatorios_index_ordem_idx`, 55 buffers, `Heap Fetches: 51`;
- keyset → mesmo índice, com a **comparação de tupla como `Index Cond`** (não como filtro) —
  `ROW(ordem_emissao, relatorio_id) < ROW('2023-06-15','REL-0005000')`;
- texto livre → `Bitmap Index Scan on relatorios_index_busca_idx` (o GIN), 265 buffers.

### 6.5 · Antes × depois dos índices (mesma consulta, `enable_indexscan = off`)

| | plano | buffers | tempo |
|---|---|---|---|
| **sem índice** | `Seq Scan` + `top-N heapsort` sobre 50.000 linhas | 2.903 | 12,63 ms |
| **com os índices da 9E** | `Index Only Scan` | **55** | **0,09 ms** |

**53× menos buffers, 140× mais rápido.**

### 6.6 · Bytes: o que de fato chega ao frontend

| | |
|---|---|
| Uma página (50 linhas) | **12 KB** |
| Por linha | **237 bytes** |
| Um registro completo (`nr13_rel_…`) | **~110 KB** |

> Listar 50 relatórios custa **12 KB**. Baixar os mesmos 50 registros completos custaria
> **~5,5 MB** — 458× mais. É a diferença entre listar metadados e baixar o acervo, e é o motivo
> de a busca não tocar o PDF.

### 6.7 · Custo dos índices (50.000 relatórios, só metadados)

| índice | tamanho | usos no benchmark |
|---|---|---|
| `relatorios_index_busca_idx` (GIN) | 13 MB | 53 |
| `relatorios_index_codigo_idx` | 10 MB | 51 |
| `relatorios_index_pkey` | 8,7 MB | 0 |
| `relatorios_index_ordem_idx` | 6,7 MB | 161 |
| **`relatorios_index_tag_prefixo_idx`** | **1,6 MB** | 70 |

Tabela 23 MB · índices 42 MB. O índice novo é o **menor de todos** e o que resolveu o pior caso
— o argumento de "poupar escrita" que me levou a não criá-lo custava 121× em leitura.

### 6.8 · Testes de servidor: 25/25 PASSA

Isolamento (org A não vê org B) · papel `cliente` recusado · **`anon` recusado no catálogo**
(`permission denied`, antes mesmo do corpo da função) · keyset percorrendo as 160 linhas sem
duplicar e sem pular · 30 na mesma data · 10 sem data, todos na última página · TAG · código
inteiro · só dígitos · `%` escapado · período de um dia · sem-data fora do período · contagem
com teto · e os dois planos usando índice.

### 6.9 · O que continua NÃO medido

**DOM, heap e long tasks** do navegador. Exigem a tela rodando com massa real, o que este
benchmark de banco não cobre. A virtualização é a mesma da 9C, cujo ganho está em
`2026-08-22-fase9c-tela.md`.

## 7 · Estado e rollback

| | |
|---|---|
| SQL da 9E | **não aplicado** em produção |
| Front | **não publicado** |
| Flag `busca_v9` | **OFF nas 30 organizações** |
| `boot_v9` | inalterada: org de teste + piloto `92a28bff…` |
| `cmam.caldeiras` | **não habilitada** |

**Rollback é desligar a flag.** Nada precisa ser convertido: a projeção é derivada, os PDFs
arquivados nunca foram tocados, e `app_storage` continua sendo a verdade. Os dois caminhos não
ficam para sempre — quando o rollout terminar, o legado sai, e é por isso que `RelatoriosV9` não
importa nada de `Relatorios.tsx`.
