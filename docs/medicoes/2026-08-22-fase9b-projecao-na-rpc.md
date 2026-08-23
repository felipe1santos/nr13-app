# Fase 9B · A projeção passa a ser mantida pela RPC

**22/08/2026** · laboratório local · **nada em `src/`** · **nada aplicado em produção**

A 9B é a primeira subfase que toca `aplicar_mutacao_storage` — o **caminho crítico de escrita da
verdade**. Tratada como mudança de alto risco: semântica capturada antes, comparada depois.

---

## 1 · A semântica empresarial não mudou — provado por diff

Antes de alterar qualquer coisa, registrei o comportamento atual em 12 cenários e guardei a saída.
Depois da mudança, rodei **a mesma bateria** e comparei.

| Cenário | Resultado (idêntico antes e depois) |
|---|---|
| Escrita normal | `aplicado`, versão 1 |
| **Idempotência** por `mutation_id` | `repetido`, versão preservada, conteúdo não sobrescrito |
| **Conflito** de versão | `conflito`, com a linha vigente devolvida |
| Atualização legítima | `aplicado`, v1 → v2 |
| Chave não projetável | `aplicado`, normal |
| Valor não-JSON | `aplicado` — `valor` é `text` opaco |
| **Exclusão** | `aplicado`, `deletado_em` preenchido, piso gravado |
| Retry da exclusão | `repetido` |
| **Versão obsoleta** após exclusão | `recusado`, `versao_obsoleta` |
| Recriação acima do piso | `aplicado`, v4 |
| Índice de relatórios | `aplicado` |
| `anon` | `permission denied` |

```
diff antes × depois  →  IDÊNTICO (ignorando o timestamp, que muda entre execuções)
```

**Nenhuma linha da semântica foi reescrita.** O corpo da função veio de `pg_get_functiondef` do
banco, e a única alteração é um bloco **aditivo** entre "a verdade está persistida" e o retorno.

---

## 2 · A hierarquia de três níveis, implementada

```sql
-- NÍVEL 1 ── a verdade, já escrita acima. Nunca condicionada ao que vem depois.

begin                                        -- NÍVEL 2: savepoint próprio
  perform public.projetar_chave(v_org, p_chave);
exception when others then
  begin                                      -- NÍVEL 3: savepoint PRÓPRIO
    insert into public.busca_pendencias ...
  exception when others then
    null;                                    -- não pode levantar
  end;
end;
```

**Por que a projeção LÊ em vez de receber parâmetro:** `projetar_equipamento` relê `app_storage`
na mesma transação, então projeta por construção a **versão efetivamente persistida**. Uma mutação
recusada retorna antes e nunca chega ao bloco. É mais forte que passar `v_nova`: parâmetro pode
divergir do que foi gravado, releitura não pode.

---

## 3 · O teste de falha em cascata — bloqueante, 10/10

| Passo | Resultado |
|---|---|
| 1–3 · mutação válida, projeção **e** pendência sabotadas | executado |
| 4 · a RPC concluiu | `{"status":"aplicado","versao":1}` |
| **5 · a VERDADE contém `v_nova`** | ✅ linha presente, versão 1, viva |
| 6 · projeção ausente | ✅ como esperado |
| 7 · pendência ausente | ✅ como esperado (sabotada) |
| **8 · a auditoria detecta MESMO SEM a pendência** | ✅ `convergiu: false`, `faltando ≥ 1` |
| 9 · reconciliação repara | ✅ |
| 10 · auditoria volta a zero | ✅ `convergiu: true` |

**A garantia não depende da pendência.** É exatamente o que a decisão 3 exigia.

---

## 4 · Demais testes — 38 no total, zero falhas

| Bateria | |
|---|---|
| **Funcionais 9B** | 10/10 — caminho feliz com `source_version` correto · idempotência sem duplicar projeção nem pendência · **conflito não altera a projeção** · atualização reprojeta · chave de enriquecimento reprojeta a TAG · chave não projetável não quebra · JSON inválido não impede a verdade · **exclusão não deixa fantasma pesquisável** · retry e exclusão obsoleta · relatórios projetam e somem |
| **Cascata** | 10 passos |
| **Funcionais 9A** | 12/12, revalidados |
| **RLS** | 10/10 — org A não vê org B · `anon` nada · escrita negada em `insert`/`update`/`delete` · **cliente do Portal sem acesso** · manutenção fechada. **A alteração da RPC não virou rota indireta para outra org** |

**Suíte do app: 1186/1186. Build: verde.**

---

## 5 · Custo de escrita

### Buffers — a métrica confiável

| | Mediana de 3 |
|---|---:|
| **Sem** projeção | **1.129** |
| **Com** projeção | **1.421** |
| **Overhead** | **+25,9 % · +292 buffers por mutação** |

> **Acima do limiar de 20 % que eu mesmo fixei no task-level.** Registro isso em vez de silenciar.
>
> O custo é inerente ao que a projeção faz: ler a ficha, ler 4 chaves de enriquecimento e fazer o
> `upsert`. **Poderia cair** passando os valores da RPC em vez de reler — mas isso **enfraqueceria
> a garantia** de que a projeção representa a versão efetivamente persistida (§2). Preferi o custo.

### Tempo — não separável do ruído

Três baterias de 700 mutações, 5 rodadas cada, deram overhead de **+16 %**, **+2 %** e **+5 %**,
com dispersão de 366 a 1.079 ms **dentro da mesma condição**. A VM do laboratório tem 3,9 GB e
está carregada; **o relógio aqui não decide nada**. Em absoluto, a diferença de mediana ficou
entre **+0,02 e +0,06 ms por mutação**.

---

## 6 · Três defeitos que os testes acharam — e um deles era meu

### D1 · No-op silencioso no rebuild

`reconstruir_indice_busca` com o cursor já em `concluido` devolvia `{"processadas": 0}` e **não
fazia nada** — parece sucesso. É a mesma classe de defeito que a Fase 8 achou **três vezes** na
ferramenta de limpeza.

**Corrigido em dois lugares:** o retorno passou a trazer um `aviso` explícito dizendo o que fazer,
e nasceu **`reparar_divergencias(org, lote)`** — reconciliação **dirigida**, que repara só as TAGs
que a auditoria acusou, sem varrer a organização e sem depender do cursor.

### D2 · Divergência permanente e irreparável

Equipamento cuja ficha tem **JSON ilegível** não era projetado. Consequência: sumia da busca **e** a
auditoria o acusava **para sempre**, porque nenhum reparo conseguia produzir a linha.

Isso violava a decisão 3 — *divergência silenciosa permanente, não* — e fazia dado sumir da tela,
que é o defeito que este projeto combate.

**Corrigido:** ficha viva com JSON ilegível projeta **linha mínima** (TAG + versão, campos
pesquisáveis nulos). O equipamento continua achável pela TAG, que vem da **chave** e não do valor,
e a auditoria converge.

**O mesmo valia para relatórios:** um índice legitimamente **vazio** (`[]`, equipamento sem
relatório ainda) geraria zero linhas e seria acusado de divergente eternamente. A auditoria passou
a comparar **contagem esperada × projetada**, em vez de presença da TAG.

### D3 · Minha "otimização" quebrou a projeção — e o sistema pegou

Tentei trocar os 4 `SELECT` por uma varredura única. Usei `max(jsonb)`, que **não existe em
Postgres**. A projeção passou a falhar em toda escrita.

**E o sistema fez exatamente o que foi desenhado para fazer:** a verdade continuou sendo gravada,
a pendência registrou o erro (`function max(jsonb) does not exist`, 4 pendências), e a auditoria
acusou a divergência. Nenhum dado empresarial foi afetado.

**É a validação mais forte da arquitetura nesta subfase** — não porque eu planejei o teste, mas
porque um defeito de verdade apareceu e as três camadas se comportaram como previsto.

Consertado com `array_agg(...)[1]`. Aí **medi**: a versão "otimizada" custava **1.494 buffers**
contra **1.451** dos 4 `SELECT`. **A otimização era 3 % pior.** Revertida, com o motivo escrito no
código — o índice `(org_id, chave)` resolve cada chave em ~4 buffers, e agregar sobre um `IN` custa
mais do que isso.

> **Assumi que uma varredura venceria quatro buscas por índice. Estava errado, e só descobri porque
> medi.**

---

## 7 · Rollback

`supabase/busca_index_rpc_rollback.sql` — extraído por `pg_get_functiondef` **antes** da alteração,
não reconstruído de memória. Restaura a RPC exatamente como estava.

As projeções continuam existindo depois do rollback; só param de ser mantidas, e a auditoria passa
a acusar. Para desfazer a 9A também: **RPC primeiro, tabelas depois**.

---

## 8 · Estado final do laboratório

```
convergiu: true   ·   pendências: 0
```

`src/` intocado · `armazenamento_v2.sql` intocado (a mudança vive em arquivo próprio, com ordem de
aplicação documentada) · **produção sem nada aplicado**.
