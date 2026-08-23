# Fase 9C · Índices de busca — um por vez, cada um com benchmark

**22–23/08/2026** · laboratório local · **nada aplicado em produção**

Massa: **50.000 linhas sintéticas de metadado leve** numa organização de bancada, criada e
removida pelo próprio experimento. A Fase 8 autorizou exatamente isto — *"criar no laboratório
somente METADADOS sintéticos leves"*.

> **A primeira massa foi DESCARTADA por enviesar o resultado.** Ela distribuía fabricante,
> cliente e categoria por `i % N`, o que os amarrava ao prefixo da TAG (`i % 4`): faixas inteiras
> da ordenação não tinham nenhuma ocorrência do termo, e o benchmark media o artefato, não a
> consulta. A segunda massa sorteia por `md5(i)`, sem correlação com a ordem, e tem **cauda
> longa** (203 fabricantes, 60 % concentrados em três).

---

## 1 · O peso da projeção — a estimativa do desenho, conferida

| | |
|---|---:|
| Estimativa do desenho (§5.4) | ~250 B/linha |
| **Medido, sem as colunas derivadas** | **188 B/linha** |
| Medido, com `busca` (tsvector) e `serie_norm` | 471 B/linha |

O `busca` **não viaja para o cliente** — é coluna de servidor. Para dimensionar o catálogo
offline vale o primeiro número: **50.000 × 188 B ≈ 9,4 MB**, abaixo dos 12,5 MB estimados.

---

## 2 · b1 · TAG exata — **nenhum índice novo**

| | buffers | ms |
|---|---:|---:|
| Pela PK que já existia | **4** | 0,08 |

**Decisão: não entra índice.** A PK `(org_id, tag)` resolve. Foi o primeiro experimento e o
resultado foi "não faça nada" — que também é resultado.

---

## 3 · b2 · Prefixo de TAG — e a decisão central da subfase

O banco é `en_US.UTF-8`. Sob essa collation um btree comum **não serve** `LIKE 'prefixo%'`.

| Candidato | prefixo longo `VP-024%` | prefixo curto `VP-%` | ordenação | cursor |
|---|---:|---:|---|---|
| Nada (PK) | 3.663 · Seq Scan | 7.988 | ok | ok |
| `(org_id, tag text_pattern_ops)` | 93 | **7.988** | ✗ | ✗ |
| `(org_id, tag collate "C")` | 16 | 18 | ok | ok |
| **`tag` declarada `text collate "C"`** | **36** | **30** | ok | ok |

**`text_pattern_ops` foi criado, medido e DESCARTADO.** Ele serve o LIKE mas **não serve o
`ORDER BY tag`**, que continua na collation padrão — e com o prefixo curto o planner abandonava o
índice para conseguir a ordem, voltando aos 7.988 buffers.

**A escolha foi mudar a COLLATION DA COLUNA**, não somar um índice. Com `tag text collate "C"`:

- a **PK que já existia** passa a servir prefixo, ordenação e cursor — **um índice a menos**;
- o **PostgREST funciona sem saber disso**. Ele não sabe escrever `collate "C"` num `order` nem
  num filtro de cursor; com a collation na coluna, `order by tag` e `tag > $cursor` já saem certos.

Efeito colateral aceito: "C" ordena byte a byte (maiúscula antes de minúscula, acento depois do
ASCII). Para TAG — identificador alfanumérico maiúsculo — é a ordem natural, e é
**determinística por construção**, que é o que a regra de cursor estável exige.

> **Aplicar antes do backfill.** O `alter column ... collate "C"` reescreve a tabela e reconstrói
> a PK. Vazia é instantâneo; com 50.000 linhas por organização é uma janela de lock.

---

## 4 · Keyset × OFFSET — a diferença, medida

| | buffers | ms |
|---|---:|---:|
| Keyset, página 1 | 16 | 0,13 |
| **Keyset, página 800** | **16** | 0,08 |
| `OFFSET 40000 LIMIT 50` | **8.522** | 8,1 |

**533× mais buffers** no OFFSET, e o custo do keyset **não muda** entre a primeira página e a
octingentésima.

---

## 5 · b3 · Texto livre — o GIN entra pelo que o ILIKE ERRA

Mesma massa, mesmos termos:

| Caso | ILIKE sem índice | GIN |
|---|---|---|
| Termo **sem resultado** | **17.007 buffers · 132–172 ms** | 1.522 · 2,0 ms |
| `frigorifico` (dado tem `Frigorífico`) | 17.007 · **ACHA ZERO de 6.211** | 338 · **acha os 6.211** |
| Termo raro (0,6 %) | 444 · 3,4 ms | 2.405 · 5,0 ms |
| Termo comum (12 %) | 544 · 3,4 ms | 338 · 0,4 ms |

> **O argumento decisivo não é desempenho, é CORREÇÃO.** Sem normalização de acento, quem digita
> "frigorifico" recebe zero de 6.211 equipamentos que existem. Em português do Brasil isso é o
> caso comum — *Metalúrgica, Válvula, Pressão, Indústria* — não a exceção.

**Nenhuma extensão foi instalada.** A normalização sai de `translate()`, que é `IMMUTABLE` e serve
uma coluna gerada. `unaccent` seria desnecessário; **`pg_trgm` continua fora**, e só entra se
aparecer necessidade provada de substring no meio de palavra, com benchmark comparativo.

---

## 6 · Nº de série — UX decidida ANTES do índice

**Decisão: busca por PREFIXO, sobre a forma sem separador.** O usuário lê a placa e digita do
começo; o separador varia entre fabricantes (`SN-123`, `SN/123`, `Nº 123`) e entre quem cadastrou,
e ignorá-lo evita o *"não acha porque digitei com hífen e o cadastro tem barra"*. O trecho
puramente numérico também entra no vetor de busca, porque o usuário tanto digita a série inteira
quanto só o número dela.

| | buffers |
|---|---:|
| Série completa, sem índice | 11.334 · Seq Scan |
| **Série completa, com índice** | **6** |
| Prefixo curto (555 casando) | 1.113 |

---

## 7 · b4 · Filtros de tipo e categoria — entrou pelo caso raro

| Caso | sem índice | com `(org_id, tipo, categoria, tag)` |
|---|---:|---:|
| `tipo` sozinho | 78 | 78 |
| `tipo + categoria`, casando 6 % | 488 | 98 |
| **`tipo + categoria`, casando 8 de 50.000** | **9.222** | **12** |

O caso comum sozinho **não justificaria** 3 MB de índice — 0,2 ms de ganho. Quem justifica é o
filtro que casa **menos de uma página**: aí o `limit 50` sobre o índice de tag nunca completa e o
planner varre a tabela inteira. **768×**, e é exatamente o cenário que a Fase 9 existe para
consertar numa organização grande.

---

## 8 · O achado que vale mais que os índices

> Ler 1.000 chaves de `app_storage` como `authenticated`, com a RLS ativa:
>
> | `org_atual()` / `papel_atual()` | buffers | ms |
> |---|---:|---:|
> | **VOLATILE — como estão em PRODUÇÃO hoje** | **1.478.822** | 1.417–2.176 |
> | STABLE | **9.064** | 6,3 |
>
> **163× menos leitura. 225× menos tempo. Dois `ALTER FUNCTION`.**

Uma função `sql`/`plpgsql` sem marcador de volatilidade nasce **VOLATILE**. Numa cláusula de RLS,
função VOLATILE é chamada **uma vez por linha** e não pode ser içada para fora da varredura — e
cada chamada faz um `select` em `profiles`.

Marcá-las `STABLE` está correto: elas só LEEM o perfil do usuário atual. Nada de segurança muda —
`security definer`, corpo e policy seguem iguais; muda quantas vezes o Postgres as chama.

Está em **`supabase/rls_funcoes_estaveis.sql`**, arquivo separado de propósito: **não depende da
Fase 9, não depende de `busca_v9`, e beneficia toda organização existente hoje**. A escrita não
muda (1.533 buffers com ou sem), porque escrita toca uma linha e uma linha não multiplica nada.

---

## 9 · A consulta da tela, medida inteira

Depois de tudo aplicado, `buscar_equipamentos` em **50.000 equipamentos**:

| Modalidade | buffers | ms |
|---|---:|---:|
| Listagem, página 1 | 1.073 | 2,4 |
| **Listagem, página 800** | **1.076** | 2,2 |
| Prefixo de TAG | 1.212 | 4,9 |
| TAG exata | 1.151 | 4,0 |
| Fabricante | 1.179 | 3,6 |
| Acento (`frigorifico`) | 1.218 | 3,5 |
| **Termo sem resultado** | **1.145** | 3,5 |
| Nº de série | 2.235 | 6,3 |
| Filtro raro | 1.107 | 2,3 |
| Contagem sem filtro | 818 | 2,3 |

**O custo é PLANO** — não depende do tamanho da base nem do termo digitado. É a propriedade que
importa, mais do que qualquer número isolado.

### Duas decisões de implementação que só a medição resolveu

**1 · PL/pgSQL com variáveis, não um CTE de parâmetros.** A primeira versão calculava tudo num
`with p as (select org_atual() ...)` e cruzava `from equipamentos_index e, p`. Fica elegante e é
catastrófico: `p.org` não é constante para o planner, `e.org_id = p.org` deixa de ser condição de
índice e vira junção sobre a tabela inteira — **204.429 buffers, 600 a 1.400 ms**.

**2 · `security definer`, e isso mudou depois de medir.** A função nasceu `security invoker` de
propósito. Mas `textlike` (o LIKE) e `ts_match_vq` (o `@@`) **não são leakproof**, e sob RLS o
Postgres não avalia qual não-leakproof antes da cláusula de segurança — então nem o prefixo nem o
GIN viram condição de índice:

| | invoker + RLS | definer |
|---|---:|---:|
| Prefixo de TAG | 11.977 | 928 |
| Texto livre | 989 | 934 |
| Termo sem resultado | 4.032 | 861 |

Tentei antes a saída que preservava a RLS — derivar do prefixo uma faixa `>= / <`, que **é**
leakproof. **Não resolveu** (11.764 buffers): basta o `@@` no mesmo `OR` para a expressão inteira
herdar o não-leakproof.

O que substitui a RLS: a organização **nunca vem do cliente** (sai de `org_atual()`), o papel
`cliente` é recusado explicitamente, e sem organização retorna vazio. É o mesmo padrão de
`aplicar_mutacao_storage`, que já é `security definer` e é o caminho de escrita de tudo neste
sistema. `scripts/fase9/testes-9c.sql` prova org A × org B, `anon`, papel `cliente`.

---

## 10 · Custo de escrita — o acumulado, sem maquiagem

Uma mutação de `nr13_info_` em `aplicar_mutacao_storage`, mediana de 5:

| Estado | buffers | vs. antes da projeção |
|---|---:|---:|
| Antes da 9B (sem projeção) | 1.129 | — |
| Com a projeção da 9B (o que o P9.1 aprovou) | 1.434 | **+27 %** |
| + `serie_norm` e índice de série | 1.503 | +33 % |
| + índice de filtros | 1.480 | +31 % |
| + `busca` (tsvector) e GIN | 1.536 | +36 % |
| **+ os campos do cartão (`nr13_calc_`, unidade)** | **1.671** | **+48 %** |

> **Isto ultrapassa por muito o que foi aceito no P9.1 (+25,9 %), e é o principal ponto a decidir
> no P9.2.**
>
> O último degrau — de +36 % para +48 % — comprou **fidelidade do cartão**: PMTA, PTH, resultado,
> volume, fluido, vida remanescente e a unidade escolhida. Sem ele o piloto perderia informação
> que a tela antiga mostra, e "conteúdo idêntico com a flag ligada e desligada" é exigência do
> próprio portão P9.2.
>
> **É uma troca, não um descuido, e a decisão é sua:** ou o cartão mantém tudo e a escrita custa
> +48 %, ou alguns campos saem da lista e a escrita volta para perto de +36 %.
