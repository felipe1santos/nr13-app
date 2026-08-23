# ETAPA 1 aplicada em PRODUÇÃO — funções da RLS como `STABLE`

**23/08/2026** · projeto **SAAS NR13** (`sa-east-1`) · executado pelo SQL Editor do Dashboard

**Estado final: as seis funções estão `STABLE` em produção.** Rollback exercitado de verdade e
reaplicação confirmada. Nenhum dado alterado, nenhuma permissão nova, nenhuma divergência de RLS.

> **Só a Etapa 1.** Nada da Fase 9 foi aplicado: sem projeções, sem alteração na RPC, sem
> backfill, sem `busca_v9`.

---

## 1 · O que foi conferido ANTES de tocar em qualquer coisa

### 1.1 As seis funções estavam mesmo `VOLATILE`

| função | volatilidade | `security definer` | `search_path` |
|---|---|---|---|
| `org_atual` · `papel_atual` · `is_admin` | **VOLATILE** | true | `public` |
| `acesso_vigente` · `assinatura_status_org` · `assinatura_permite_escrita` | **VOLATILE** | true | `public` |

### 1.2 Os corpos de produção conferem com o que foi analisado

**Não assumi que fossem iguais aos do laboratório — e não eram, byte a byte.** Os tamanhos
diferiam (ex.: `assinatura_status_org`, 419 caracteres no laboratório contra 314 em produção).
Então a verificação foi feita por **asserção estrutural sobre o corpo real de produção**:

| função | linguagem | efeito colateral | statements | lê `profiles` | `auth.uid()` | `now()` | fonte volátil |
|---|---|---|---|---|---|---|---|
| `org_atual` | sql | **não** | **1** | sim | sim | não | **não** |
| `papel_atual` | sql | **não** | **1** | sim | sim | não | **não** |
| `is_admin` | sql | **não** | **1** | sim | sim | não | **não** |
| `acesso_vigente` | sql | **não** | **1** | sim | sim | sim | **não** |
| `assinatura_status_org` | sql | **não** | **1** | sim | não | sim | **não** |
| `assinatura_permite_escrita` | sql | **não** | **1** | não | não | não | **não** |

"Efeito colateral" cobre `insert`, `update`, `delete`, `truncate`, `nextval`, `setval`, `notify`,
`create` e `alter`. "Fonte volátil" cobre `random`, `clock_timestamp`, `timeofday`, `currval` e
`txid`. **Nenhuma das seis tem qualquer um deles.** As diferenças de bytes são formatação.

### 1.3 Escala real de produção

**888 chaves, 11 organizações, 33 MB, 39 perfis.** Muito menor que o laboratório (122.011
chaves) — o que **muda a expectativa de ganho**, e está dito abaixo sem maquiagem.

---

## 2 · A linha de base — 7 atores REAIS, sem criar nada

Produção já tinha todos os tipos de ator necessários. **Nenhum usuário, organização ou registro
foi criado.** Todas as sondas rodaram dentro de transação desfeita (`begin … rollback`).

| ator | org correta | papel | `is_admin` | acesso vigente | permite escrita | vê chaves | vê orgs |
|---|---|---|---|---|---|---:|---:|
| mestre org A | ✓ | mestre | false | true | true | **353** | **1** |
| mestre org B | ✓ | mestre | false | true | true | **191** | **1** |
| funcionário | ✓ | funcionario | false | true | true | 99 | 1 |
| **cliente do Portal** | ✓ | cliente | false | true | true | **0** | **0** |
| superadmin | ✓ | mestre | **true** | true | true | 2 | 1 |
| conta **VENCIDA** | ✓ | mestre | false | **false** | **false** | 41 | 1 |
| **anon** | n/a | **(nulo)** | false | false | false | **0** | **0** |

E as sondas de escrita:

| ator | INSERT direto | UPDATE direto | DELETE direto |
|---|---|---|---|
| mestre org A | **recusado** | **recusado** | afetaria 0 |
| cliente do Portal | **recusado** | afetaria 0 | afetaria 0 |
| conta VENCIDA | **recusado** | afetaria 0 | afetaria 0 |

> Duas mecânicas diferentes, o mesmo resultado: para o mestre a guarda `trg_guardar_app_storage`
> recusa (a escrita tem de passar pela RPC); para o Portal e a conta vencida a RLS filtra as
> linhas antes, e não sobra o que alterar.

### 2.1 O benchmark, com `VOLATILE`

Mesma consulta, três execuções:

```
Buffers: shared hit=1695   ·   11,1 / 12,2 / 11,1 ms   ·   353 linhas
Filter: ((org_id = org_atual()) AND (papel_atual() = ANY ('{mestre,gerente,funcionario}')))
```

O `Filter` é avaliado **por linha**.

---

## 3 · Um defeito no meu próprio arquivo, achado ANTES de aplicar

`rls_funcoes_estaveis.sql` criava políticas em `equipamentos_index` e `relatorios_index` — tabelas
que **não existem em produção**, porque a Fase 9 não foi implantada.

**Aplicá-lo como estava teria falhado no meio**, com as seis funções já alteradas e o arquivo
interrompido. Corrigido antes de tocar em produção: o bloco de políticas passou a ser condicional
(`if to_regclass(...) is not null`). Os dois caminhos foram exercitados — no laboratório, onde as
tabelas existem, as duas políticas são criadas; em produção, o bloco é pulado.

O mesmo conserto foi aplicado ao arquivo de rollback.

---

## 4 · Aplicação

`12:37:56` — seis `alter function … stable` mais o bloco condicional (pulado, como esperado).

O SQL Editor pediu confirmação (*"This query includes destructive operations"*) e ela foi dada,
dentro da autorização recebida.

| função | volatilidade | `security definer` | `search_path` |
|---|---|---|---|
| as seis | **STABLE** | **true** (inalterado) | **`public`** (inalterado) |

---

## 5 · Benchmark — a MESMA consulta, sem trocar nada

| | `VOLATILE` | `STABLE` |
|---|---:|---:|
| **Buffers** | **1.695** | **883** |
| **Tempo** | 11,1 / 12,2 / 11,1 ms | **6,4 / 5,5 / 6,9 ms** |
| **Linhas devolvidas** | 353 | **353** |
| **Heap Fetches** | 197 | 197 |
| **Plano** | `Filter:` avaliado **por linha** | **`One-Time Filter:`** avaliado **uma vez** |

**1,9× menos leitura, ~2× menos tempo.**

> ### O ganho aqui é MENOR que no laboratório, e a razão é honesta
>
> No laboratório a mesma correção rendeu **244×** (248.685 → 1.021 buffers). Ali havia **122.011
> chaves**; produção tem **888**. O custo de uma função `VOLATILE` numa cláusula de RLS é
> **proporcional às linhas varridas** — com poucas linhas, há pouco a economizar.
>
> **O que não muda com a escala é o PLANO.** `Filter` por linha virou `One-Time Filter`, e é essa
> mudança que faz o custo parar de crescer junto com a base. O benefício de hoje é modesto; o de
> amanhã, quando uma organização tiver dezenas de milhares de chaves, é o de duas ordens de
> grandeza medido no laboratório.

---

## 6 · Segurança — 7 atores, antes × depois

```
7 atores comparados  ·  0 divergências
```

| ator | resultado com STABLE | igual ao baseline? |
|---|---|---|
| mestre org A | 353 chaves, 1 org | ✅ |
| mestre org B | 191 chaves, 1 org | ✅ |
| funcionário | 99 chaves, 1 org | ✅ |
| **cliente do Portal** | **0 chaves, 0 orgs** | ✅ |
| superadmin | `is_admin` true, 2 chaves | ✅ |
| conta VENCIDA | acesso **false**, escrita **false**, lê 41 | ✅ |
| **anon** | papel **(nulo)**, **0 chaves** | ✅ |

**Sondas de escrita:** idênticas ao baseline, ator por ator.

**Permissões:** as ACLs das seis funções ficaram **exatamente iguais** — `anon`, `authenticated`
e `service_role` com `EXECUTE`, como antes. `alter function … stable` não toca em privilégio, e
isso foi conferido, não presumido.

Em particular, e é o que mais importa: **org A nunca viu org B**, o **Portal continua recebendo
zero**, e **`anon` não ganhou acesso a nada**.

---

## 7 · Rollback — exercitado de verdade

`12:41:40` — `rls_funcoes_estaveis_rollback.sql`.

| | |
|---|---|
| As seis voltaram a | **VOLATILE**, 6 de 6 |
| Permissões | **idênticas** |
| Verificação funcional curta (3 atores) | **idêntica ao baseline** |
| `app_storage` | **888 chaves** · 39 perfis · 33 MB · **0 sondas residuais** |

> Os números de dados são **exatamente** os do preflight. O rollback não alterou nada, e as
> sondas de escrita não deixaram resíduo — todas foram desfeitas.

---

## 8 · Reaplicação

`12:43:46` — `rls_funcoes_estaveis.sql` de novo.

| | |
|---|---|
| As seis | **STABLE**, `security definer` e `search_path` inalterados |
| Validação essencial (3 atores) | **idêntica** |
| Benchmark, 3 execuções | **883 buffers, `One-Time Filter`, 353 linhas** — reproduzido |

---

## 9 · Estado do projeto

**Healthy.** CPU 3 %, disco 19 %, RAM 59 %, 10 de 60 conexões.

### Os 9 erros de Postgres da última hora — todos MEUS, e todos ANTES da mudança

O painel mostrou 86,8 % de sucesso e **9 erros**. Fui ao log em vez de supor:

```
12:28:52 · 12:28:57 · 12:29:04 · 12:29:31 · 12:29:59
12:30:04 · 12:30:09 · 12:30:27 · 12:30:33
    ERROR: column "<uuid>" does not exist
```

**Os nove são a mesma coisa:** um defeito meu no montador da bateria — usei `JSON.stringify` para
inserir o UUID no SQL, o que produziu **aspas duplas**, e o Postgres leu o UUID como nome de
coluna. Corrigido com aspas simples.

**Todos ocorreram entre 12:28 e 12:30 — antes da aplicação, às 12:37:56.** Depois da mudança,
**zero erros**. O log também registra as três operações na ordem certa:

```
12:37:56  alter function … stable      (aplicação)
12:41:40  alter function … volatile    (rollback)
12:43:46  alter function … stable      (reaplicação)
```

---

## 10 · Estado final

| | |
|---|---|
| Seis funções da RLS | **STABLE** |
| `security definer` / `search_path` | **inalterados** |
| Permissões | **inalteradas** |
| Comportamento de RLS | **idêntico ao baseline**, 7 atores |
| Dados | **inalterados** — 888 chaves, 33 MB |
| Projeto | **Healthy** |
| Fase 9 em produção | **NADA aplicado** |

**ETAPA 2 não foi iniciada.** Continuam fora: infraestrutura 9A/9B/9C, backfill, `busca_v9`,
P9.2, 9D a 9G.
