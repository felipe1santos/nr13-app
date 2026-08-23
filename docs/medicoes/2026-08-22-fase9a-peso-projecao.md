# Fase 9A · Peso das projeções e desempenho do rebuild

**22/08/2026** · laboratório Supabase local · **nada em `src/`** · **`aplicar_mutacao_storage` intocada**

Critério do dono: *"a projeção precisa permanecer **claramente leve** em comparação ao dado
completo e permitir operar dezenas de milhares de registros sem repetir o problema da Fase 8"* —
**não é um limiar aritmético**.

---

## 1 · A medição que vale — dado com forma real

1.000 equipamentos gerados pelo gerador da Fase 8: **11 chaves por equipamento** (ficha, memorial,
categoria, empresa, fotos, vida, docs, unidade, índice e 2 relatórios). É a forma real do dado.

| | Por equipamento | Total (1.000) |
|---|---:|---:|
| **Verdade** — conteúdo em `app_storage` | **8.548 B** | 8.348 kB |
| `equipamentos_index` (payload 222 B) | **319 B** | 312 kB |
| `relatorios_index` (2 linhas, payload 287 B cada) | **819 B** | 800 kB |
| **As duas projeções somadas** | **1.138 B** | 1.112 kB |

### As duas razões que importam, e elas respondem coisas diferentes

| Comparação | Razão | Para quê serve |
|---|---:|---|
| **Catálogo de equipamentos × dado completo** | **26,8×** | É o que vai **offline** (§3) |
| **Ambas as projeções × dado completo** | **7,5×** | É o custo no **servidor** |

> **Correção da minha própria estimativa.** O desenho falava em ~250 B e **~33×**. O catálogo de
> equipamentos ficou em **319 B** com o armazenamento incluído — próximo do estimado, e a razão
> real é **26,8×**, não 33×.
>
> Mas o número de **7,5×** só aparece quando se soma `relatorios_index`, que a estimativa do
> desenho **não contava**. Com 2 relatórios por equipamento, os relatórios pesam **2,6× mais que o
> catálogo**. Em uma organização com histórico longo, essa é a tabela que cresce.

**Veredito pelo critério do dono: PASSA.** As duas projeções somadas são **7,5× mais leves** que o
conteúdo da verdade, e o catálogo — o que realmente precisa ir para o aparelho — é **26,8× mais
leve**. Não há aproximação do tamanho dos registros completos, e não há dezenas de MB
desnecessários para catálogo.

---

## 2 · Comportamento em volume grande

51.000 equipamentos (1.000 reais + 50.000 sintéticos só de metadados) → **102.000 relatórios**.

### Rebuild

| | |
|---|---|
| **Tempo total** | **33 s** |
| Lotes | 104 (lote de 1.000) |
| Por lote | **50–92 ms** |
| Resultado | 51.000 + 102.000 linhas |
| Auditoria | **`convergiu: true`**, zero em tudo |

**O lote de 1.000 se mostrou adequado** — cada um custa menos de 100 ms, então não gera pressão. A
hipótese de partida do task-level está validada, e o parâmetro continua configurável.

### Peso em escala

| | Payload | Total | Por equipamento |
|---|---:|---:|---:|
| `equipamentos_index` (51.000) | 162 B | 11 MB | 219 B |
| `relatorios_index` (102.000) | 170 B | 25 MB | 522 B |

> **Estes 51.000 NÃO servem para calcular razão.** A massa sintética tem só 2 chaves por
> equipamento, então a "verdade" ali pesa 837 B — contra os 8.548 B do dado com forma real. Usar
> essa comparação inflaria o resultado a favor da projeção. **Ela serve para linearidade e
> desempenho**, e mostra que o custo por linha **cai** com o volume (fill de página melhor), não
> cresce.

### Projeção para o catálogo offline

Usando os **319 B/equipamento medidos com dado real**:

| Equipamentos | Catálogo | Dado completo | |
|---:|---:|---:|---|
| 1.000 | 0,3 MB | 8,3 MB | |
| 10.000 | 3,1 MB | 83 MB | |
| 20.000 | 6,1 MB | 167 MB | |
| **50.000** | **15,6 MB** | **407 MB** | |

**Cota do IndexedDB medida na Fase 8: 10.317 MB.** O catálogo de 50.000 ocupa **0,15 %** dela.

> **É este número que sustenta a estratégia offline do desenho:** conhecer e pesquisar 50.000
> equipamentos custa 15,6 MB no aparelho; ter os 50.000 completos custaria 407 MB.

---

## 3 · Testes

### Funcionais — 12/12

| | |
|---|---|
| T1 | `source_version` e `source_updated_at` batem com a verdade, linha a linha — **0 divergências** |
| T2 | **Idempotência** — rebuild 2× dá o mesmo conteúdo e a mesma contagem |
| T3 | **Retomável** — interrompido em lotes de 137, retomou e convergiu |
| T4 | **Não escreve em `app_storage`** — `except` entre antes e depois: 0 linhas |
| T5 | Auditoria detecta linha **faltando** e marca `convergiu: false` |
| T6 | Auditoria detecta linha **sobrando** |
| T7 | Auditoria detecta **`source_version` defasada** |
| T8 | **Reparo converge** — 2 reparadas, 0 falhas, pendências zeradas |
| T9 | **Não apaga o que não reconheceu** — linha de outra org intacta após rebuild |
| T10 | Datas normalizadas para `date` — 2.000 relatórios com `emissao` |
| T11 | `f9_data` tolera `31/02/2026`, vazio, nulo e lixo; acerta `DD/MM/AAAA` e ISO |
| T12 | `f9_json` tolera JSON inválido |

### Segurança / RLS — 6/6

| | |
|---|---|
| R1 | **Org A não vê linha da org B** — e vê as próprias 1.000 |
| R2 | **`anon` não lê nada** |
| R3 | **Escrita recusada** para `authenticated`: `insert`, `update` e `delete` — `permission denied` |
| R4 | **Cliente do Portal não lê a projeção** — segue pela Edge, preservando o achado A-01 |
| R5 | `busca_pendencias` e `busca_rebuild_estado` **invisíveis** para o app |
| R6 | `reconstruir_indice_busca` e `auditar_projecao` **não executáveis** por `authenticated` |

**Suíte do app: 1186/1186. Build: verde.**

---

## 4 · Um defeito de medição que quase entrou neste documento

A primeira leitura deu **1.139 B de heap por linha** para um payload de 222 B — 5× de overhead, o
que não faz sentido em Postgres.

Investiguei em vez de reportar: **139 páginas para 1.000 linhas, 7 linhas por página**, quando
caberiam ~36. Era bloat dos rebuilds repetidos dos testes.

E o `VACUUM FULL` que eu tinha rodado **falhou em silêncio**: `psql -c` com vários comandos os
envolve numa transação implícita, e `VACUUM` não roda dentro de transação. Rodando um por vez:
**28 páginas, 36 linhas/página, 319 B por equipamento** — o número correto, 3,6× menor que o
errado.

Fica registrado porque é uma armadilha que volta: **toda medição de tamanho de tabela nesta fase
precisa de `VACUUM FULL` executado isoladamente e conferido.**

---

## 5 · O que a 9A NÃO fez, de propósito

| | |
|---|---|
| `aplicar_mutacao_storage` | **intocada.** Manter a projeção durante a escrita é 9B |
| Índices de busca | **nenhum criado.** Nascem na 9C, um por vez, com benchmark (I9) |
| Coluna `tsvector` | **não criada.** A configuração (`simple` × `portuguese`) é decisão da 9C, com medição. Medi o que ela custaria: **194 B por linha** |
| `src/` | **intocado.** Nenhum leitor produtivo |
| Produção | **nada aplicado.** Só laboratório |
| Backfill de org real | **não executado** |
