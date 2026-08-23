# As funções auxiliares da RLS estão `VOLATILE` — análise, prova e custo

**23/08/2026** · laboratório local · **independente da Fase 9** · **nada aplicado em produção**

> Este documento existe para responder a uma pergunta só: **`STABLE` é semanticamente correto
> para estas funções?** Se for, o ganho vem de graça. Se não for, nada disso deve ser aplicado,
> por mais atraente que seja o número.

---

## 1 · O custo, medido com a MESMA instrução nos dois modos

Ler 1.000 chaves de `app_storage` como `authenticated`, com a RLS ativa, num laboratório com
122.011 chaves:

| | buffers | plano |
|---|---:|---|
| **`VOLATILE` — como está em produção hoje** | **248.685** | `Filter: org_id = org_atual() AND papel_atual() = ANY(...)` avaliado **por linha** sobre 122.081 linhas |
| **`STABLE`** | **1.021** | `One-Time Filter: org_atual() = '...'` + `Index Only Scan`, 1.000 linhas |

**244× menos leitura.** E repare que **o plano muda de natureza, não de grau**: com `STABLE` o
planner reconhece que `org_atual()` vale o mesmo para a instrução inteira e a promove a
`One-Time Filter`, avaliada **uma vez**. Com `VOLATILE` ele é obrigado a chamá-la para cada linha
candidata, e cada chamada é um `select` em `profiles`.

---

## 2 · Quem realmente participa — o levantamento, não a memória

Consultando `pg_policies` cruzado com `pg_proc`, as funções que aparecem em política de RLS são
**seis**, não as duas mais visíveis:

| Função | Políticas que a usam | Chama internamente |
|---|---:|---|
| `is_admin()` | **9** | `auth.uid()` |
| `org_atual()` | 8 | `auth.uid()` |
| `papel_atual()` | 6 | `auth.uid()` |
| `acesso_vigente()` | 3 | `auth.uid()`, `now()` |
| `assinatura_permite_escrita()` | 3 | `assinatura_status_org()` |
| `assinatura_status_org()` | — (via a anterior) | `org_atual()`, `now()` |

> **`is_admin()` é a mais usada de todas — 9 políticas — e não estava na primeira versão deste
> trabalho.** Só apareceu porque o levantamento foi feito no catálogo em vez de por lembrança.
>
> E marcar `assinatura_permite_escrita()` como `STABLE` deixando `assinatura_status_org()` como
> `VOLATILE` seria **rótulo inconsistente**: o Postgres aceita, mas a chamada interna continuaria
> sendo reavaliada, e o ganho do trecho se perderia. As seis andam juntas.

---

## 3 · A análise, ponto a ponto

A propriedade exigida por `STABLE` é precisa: **dentro de UMA instrução SQL, a função produz
legitimamente o mesmo resultado.** Não "dentro da sessão", não "dentro da transação" — o Postgres
não guarda resultado de `STABLE` além da instrução.

### 3.1 Corpo completo

```sql
org_atual()   → select org_id from public.profiles where id = auth.uid();
papel_atual() → select papel  from public.profiles where id = auth.uid();
is_admin()    → select exists (select 1 from public.profiles
                                where id = auth.uid() and role = 'admin');
acesso_vigente() → select coalesce((select acesso_expira_em is null
                                      or acesso_expira_em > now()
                                    from public.profiles where id = auth.uid()), false);
assinatura_status_org()      → select ... from public.profiles p where p.id = public.org_atual();
assinatura_permite_escrita() → select public.assinatura_status_org() in ('trial','ativa','graca',
                                                                        'cancelada_no_prazo');
```

Todas são `language sql` com **um** `select`.

### 3.2 Efeito colateral

**Nenhum.** Nenhuma faz `insert`, `update`, `delete`, `nextval`, `setval`, `notify` ou chamada a
função volátil de escrita. São leitura pura.

### 3.3 As entradas, e por que nenhuma varia dentro de uma instrução

| Entrada | Volatilidade real | Por quê |
|---|---|---|
| `auth.uid()` | **já é `STABLE`** no schema `auth` | Lê `current_setting('request.jwt.claim.sub')`, um GUC gravado pelo PostgREST **por requisição** com `SET LOCAL`. Dentro de uma instrução não muda |
| `auth.jwt()`, `auth.role()` | também já são `STABLE` | idem |
| `now()` | `STABLE` por definição | Devolve o instante de **início da transação**, não o relógio corrente |
| `profiles` (a tabela) | — | A leitura usa o **snapshot da instrução**. Ainda que outra transação altere o perfil no meio, a instrução em curso continua vendo o mesmo snapshot |

O item da tabela merece ênfase, porque é o único que parece perigoso e não é: **mesmo com
`VOLATILE`, repetir a chamada dentro da mesma instrução devolveria o mesmo valor**, porque o
snapshot é o mesmo. `STABLE` não introduz risco novo — apenas evita repetir trabalho idêntico.

### 3.4 `SECURITY DEFINER` e `search_path`

As seis são `SECURITY DEFINER` com `SET search_path TO 'public'`, e **isso não muda**.
Volatilidade não tem relação com privilégio: quem podia o quê continua igual, e nenhum corpo de
função é reescrito.

Efeito lateral conhecido e aceito: `SECURITY DEFINER` (e a cláusula `SET`) impede o *inlining* da
função. Por isso a correção do lado da policy — envolver a chamada numa subconsulta escalar,
`(select public.org_atual())`, que a torna um `InitPlan` — continua valendo **mesmo com a função
já `STABLE`**. As duas coisas somam.

### 3.5 Troca de usuário entre instruções

É o risco que `STABLE` poderia introduzir, se o Postgres guardasse o resultado além da instrução.
**Ele não guarda**, e isso foi provado: na mesma conexão, alternando o `sub` do JWT entre
statements, `org_atual()` acompanha a troca — **nos dois modos**.

```
PASSA — trocar de sessão entre statements muda o resultado (A=000a  B=000b  A=000a)
```

### 3.6 Conclusão da análise

**`STABLE` é o marcador correto.** `VOLATILE` era **omissão** do `create function` — o padrão do
Postgres quando nada é declarado — e não uma decisão de projeto. Nenhuma das seis tem qualquer
característica que exija `VOLATILE`.

---

## 4 · A prova de comportamento — 88 resultados, idênticos

`scripts/fase9/testes-rls-stable.sql` roda a **mesma** bateria nos dois modos e compara.

**7 atores × 12 provas, mais `anon`:**

| Atores | Provas |
|---|---|
| mestre da org A | as 6 funções auxiliares, uma a uma |
| sub-login da MESMA org A (papel diferente) | `SELECT` em `app_storage` — quantas linhas e **de quem** |
| mestre da org B | `SELECT` na projeção `equipamentos_index` |
| **cliente do Portal** | `INSERT` direto · `UPDATE` direto · `DELETE` direto |
| superadmin | RPC `aplicar_mutacao_storage` (o caminho oficial de escrita) |
| conta com prazo **VENCIDO** | RPC `buscar_equipamentos` |
| `sub` **inexistente** no `profiles` | |
| `anon`, sem sessão | |

```
88 linhas de resultado funcional  ·  IDÊNTICAS byte a byte entre VOLATILE e STABLE
```

O que a bateria confirma **nos dois modos**:

- **org A nunca enxerga a org B** — nem em `app_storage`, nem na projeção, nem pela RPC de busca;
- **o cliente do Portal recebe ZERO** em tudo: lista, projeção, contagem e busca. Ele continua
  pela Edge `portal_cliente`, que filtra por vínculo;
- **`anon`** recebe zero nas tabelas e `permission denied` na RPC;
- **a conta vencida LÊ mas não ESCREVE** — `acesso_vigente()` falso, `assinatura_permite_escrita()`
  falso, RPC recusada, e ainda assim o `SELECT` devolve o dado dela;
- **`sub` inexistente** devolve `(nulo)` em `org_atual()` e nada em lugar nenhum — fail closed;
- **a escrita direta continua recusada** pela guarda `trg_guardar_app_storage`.

---

## 5 · Rollback

`supabase/rls_funcoes_estaveis_rollback.sql` devolve as seis a `VOLATILE` e as duas políticas da
Fase 9 à forma anterior. **Instantâneo** — só metadado de função e duas políticas — e **não toca
em dado nenhum**. Exercitado: aplica, volta 6/6 a `VOLATILE`, e o arquivo principal reaplica
idempotente.

---

## 6 · Uma ressalva honesta sobre as medições da 9C

As medições da 9C (`2026-08-22-fase9c-indices.md` e `-tela.md`) foram tomadas com
`org_atual()`/`papel_atual()` **já `STABLE` no laboratório**. Isso importa pouco para os números
da própria busca — `buscar_equipamentos` é `security definer` e chama cada função **uma vez**,
não por linha — mas importa para a hidratação do boot, que atravessa a RLS de `app_storage`.

**Consequência prática:** aplicar a 9C sem esta correção não a quebra, mas o boot continuaria
pagando o custo por linha. As duas coisas são independentes; esta aqui vale sozinha.

---

## 7 · O que este arquivo **não** faz

- não altera nenhum **corpo** de função;
- não altera `SECURITY DEFINER` nem `search_path`;
- não altera nenhuma **política de `app_storage`** — o ganho de 244× vem só dos `alter function`;
- não altera dado de usuário;
- **não depende da Fase 9 e não a habilita.**
