# ETAPA 2 — infraestrutura da Fase 9 em PRODUÇÃO + validação da org piloto

**23/08/2026** · projeto **SAAS NR13** · executado pelo SQL Editor do Dashboard

**Resultado: a infraestrutura está instalada, a org piloto está backfilled e convergida, e toda a
camada de servidor foi validada em dado real.** A flag ficou **DESLIGADA**.

> ## ⛔ O que NÃO foi possível validar, e por quê
>
> **O bundle do front com o código da 9C não está em produção.** O deploy é **manual, feito pelo
> dono, fora do código** (`PENDENCIAS.md` §1 — Coolify, via `Dockerfile`/`nixpacks.toml`), e não
> estava na autorização desta etapa.
>
> Sem ele, estes itens do roteiro **ficaram pendentes** e não posso declará-los provados:
>
> - comparação **visual** OFF × ON dos cartões e miniaturas;
> - abrir equipamento pela lista → `carregarEquipamento` → `semearCache` → palco → documentos;
> - offline, fila durável, reconexão e conflito;
> - DOM, rede e *lazy* das imagens no navegador;
> - buscas rápidas consecutivas (debounce e descarte de resposta antiga).
>
> **Tudo o que depende só do servidor foi validado, e está abaixo.** Ligar a flag hoje não teria
> efeito visível: o bundle publicado não conhece `busca_v9`.

---

## 1 · Preflight — o estado esperado, confirmado

| | |
|---|---|
| `app_storage`, `app_storage_excluidos`, `org_sync`, `aplicar_mutacao_storage` | ✅ presentes |
| `equipamentos_index`, `relatorios_index`, `busca_pendencias`, `busca_rebuild_estado` | ✅ **não existiam** |
| coluna `org_sync.busca_v9` | ✅ **não existia** |
| RPC já mantendo projeção | ✅ **false** |
| Etapa 1 (seis funções `STABLE`) | ✅ ainda no lugar |
| `app_storage` | **888 chaves · 33 MB · 39 perfis** |

---

## 2 · O SQL aplicado foi o SQL commitado — verificado, não presumido

Os seis arquivos foram buscados do **repositório publicado** (`raw.githubusercontent.com`, commit
`e4be47b`) e conferidos contra os locais por conteúdo normalizado:

| arquivo | normalizado |
|---|---:|
| `busca_index.sql` | 9.647 |
| `busca_manutencao.sql` | 22.208 |
| `busca_index_rpc.sql` | 12.502 |
| `busca_index_indices.sql` | 8.055 |
| `busca_consulta.sql` | 10.386 |
| `busca_v9_flag.sql` | 1.878 |

**Idênticos.** Nada foi transcrito à mão, então não há risco de eu ter alterado uma linha no
caminho.

### Aplicação, na ordem ensaiada

1 · `busca_index` → 2 · `busca_manutencao` → 3 · `busca_index_rpc` → 4 · `busca_index_indices` →
5 · `busca_consulta` → 6 · `busca_v9_flag`

**O passo 4 rodou com as projeções comprovadamente VAZIAS** (conferido imediatamente antes:
0 e 0) — é ele que reescreve a coluna `tag` para `collate "C"`.

---

## 3 · Pós-deploy, antes de qualquer backfill

| prova | esperado | obtido |
|---|---|---|
| tabelas | 4 | **4** |
| funções | 16 | **16** |
| **collation de `tag`** | `C` | **`C`** |
| collation de `serie_norm` | `C` | **`C`** |
| colunas derivadas | 12 | **12** |
| geradas `ALWAYS` | 2 | **2** |
| índices | 6 | **6** |
| RLS ligada | 4 tabelas | **4** |
| políticas de `SELECT` | 2 | **2** |
| **políticas de ESCRITA** | **0** | **0** — fail closed |
| **organizações com `busca_v9` ON** | **0** | **0** |
| linhas nas projeções | 0 | **0** |
| pendências | 0 | **0** |
| `app_storage` | intacto | **888 chaves · 33 MB · 39 perfis** |

---

## 4 · A organização piloto — escolha, e um conflito de critérios

> ### O roteiro pedia "entre 20 e 200 equipamentos" **e** "não a maior". Em produção, essas duas
> condições **não podem ser satisfeitas ao mesmo tempo.**

Distribuição real:

| org (final) | equipamentos | índices de relatório | chaves |
|---|---:|---:|---:|
| `…d1fe5e` | **38** | 0 | 353 |
| `…8d0f7e` | 4 | **4** | 191 |
| `…8d211c` | 4 | 5 | 99 |
| as outras oito | 0 a 4 | 0 a 1 | 1 a 67 |

A única com ≥ 20 é justamente **a maior**. E nenhuma chega a 50, então **a paginação não é
exercitável em produção** — ela continua provada só no laboratório.

**Escolhida: `…8d0f7e`.** Motivos:

- **não é a maior** (o critério de raio de impacto foi respeitado);
- **4 equipamentos e 4 índices de relatório, com contagens casadas** — exercita as **duas**
  projeções;
- **todos os 4 têm** memorial, categoria, cliente e fotos — os campos do cartão são exercitados de
  verdade, não ficam nulos;
- **78 tombstones**, o que exercita o caminho de exclusão;
- pequena o bastante para conferir **item por item, campo por campo**.

---

## 5 · Backfill — só dela

```
lote 1 · equipamentos          4 processados   107 ms
lote 2 · troca de etapa        0                 8 ms
lote 3 · relatórios            4 processados     8 ms
lote 4 · concluído             0                 0 ms
────────────────────────────────────────────────────
4 lotes · 123 ms de trabalho de banco
```

**Auditoria:**

```
convergiu: true · pendências: 0
equipamentos:  na_verdade 4  ·  na_projecao 4  ·  faltando 0 · sobrando 0 · defasadas 0
relatorios:    tags 4        ·  projetadas 4   ·  faltando 0 · sobrando 0 · defasadas 0
```

**Nenhuma outra organização foi tocada:** a projeção inteira tem **4 linhas**, todas da piloto.

---

## 6 · A projeção reproduz a verdade — campo a campo, em dado real

Comparação direta entre `equipamentos_index` e o que o caminho antigo calcula a partir de
`nr13_info_`, `nr13_cat_`, `nr13_calc_`, `nr13_emp_`, `nr13_vida_` e `nr13_pref_unidade_`:

| TAG | descrição | tipo | fabricante | série | categoria | PMTA | PTH | resultado | volume | fluido | vida | unidade | cliente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `FALCON CG MS - 427L` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `VP01 - SOTREQ - 425L LAVADOR` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `VP02 - SOTREQ - 1000L  OFICINA` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `VP03 - SOTREQ - 427L OFICINA` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**4 equipamentos × 13 campos, todos idênticos.** Isto é a equivalência OFF × ON **no nível do
dado** — o que falta é a conferência visual, que depende do bundle.

> Repare nas TAGs reais: espaços, hífens e até **espaço duplo** (`1000L  OFICINA`). São o tipo de
> dado que quebra implementação frágil, e passaram.

---

## 7 · Busca — sobre os dados reais da piloto

| modalidade | termo | resultado |
|---|---|---|
| **TAG exata** | `VP03 - SOTREQ - 427L OFICINA` | **1**, o certo |
| **prefixo de TAG** | `VP0` | 4 — os três `VP0*` **mais** `FALCON`, cuja descrição é `VP01 - Compressor 427L`. O `OR` com texto livre é o comportamento desenhado |
| **descrição** | `compressor` | 3 — exclui corretamente o `Pulmão de AR 100L` |
| **fabricante** | `schulz` (minúsculo) | **2** — acha `SCHULZ COMPRESSORES LTDA` e `Schulz` |
| **nº de série** | `I000539706` | **1** |
| **nº de série sem separador** | `I416366` (dado é `I-416366`) | **1** |
| filtro de categoria | `V` | 3 |
| filtro de tipo | `caldeira` | 0 |
| termo inexistente | `zzzznaoexistemesmo` | **0**, sem erro |

> **O achado G1 da Fase 8 está resolvido em produção:** fabricante estava cadastrado e não era
> pesquisável. Agora é — e ignorando caixa.
>
> E a decisão de UX do nº de série funcionou em dado real: **quem digita sem o hífen acha o
> registro que tem hífen.**

### A consulta é server-side e limitada

`buscar_equipamentos` devolve no máximo o `limite` pedido, e **a organização nunca vem do
cliente** — sai de `org_atual()` dentro da função. Não há caminho pelo qual o navegador receba a
organização inteira para filtrar.

---

## 8 · Paginação por cursor

Forçando páginas de 2 sobre os 4 equipamentos:

| página | itens | n |
|---|---|---:|
| 1 | `FALCON CG MS - 427L` · `VP01 - SOTREQ - 425L LAVADOR` | 2 |
| 2 | `VP02 - SOTREQ - 1000L  OFICINA` · `VP03 - SOTREQ - 427L OFICINA` | 2 |
| 3 | *(vazia)* | 0 |
| **total lidos** | **4** | |
| **total distintos** | **4** | |

**Nenhum item duplicado, nenhum pulado**, e a página seguinte ao fim vem vazia.

---

## 9 · Isolamento entre organizações

| ator | vê pela RPC | vê na tabela | vê **da piloto** |
|---|---:|---:|---:|
| cliente de outra org (1) | **0** | **0** | **0** |
| cliente de outra org (2) | **0** | **0** | **0** |
| **mestre de outra org** | **0** | — | **0** |
| mestre **da piloto** | **4** | 4 | 4 |

E uma confirmação que veio de um erro meu: consultar `busca_pendencias` como `authenticated`
devolveu **`permission denied`** — a tabela de manutenção não é legível por nenhum papel do app,
que é exatamente o fail closed desenhado.

---

## 10 · Escrita real controlada — `ZZ-TESTE-9C-20260823`

Criado, editado e excluído **pela RPC `aplicar_mutacao_storage`**, que é o caminho oficial de
escrita do sistema — o mesmo que a interface usa. O que **não** foi exercitado é a camada de UI
acima dela.

| passo | resultado |
|---|---|
| **criar** | `{"status":"aplicado","versao":1}` |
| na verdade | 1 linha, versão **1** |
| na projeção | 1 linha, `source_version` **1** — convergido na mesma transação |
| busca por TAG / fabricante / série sem hífen | **1 / 1 / 1** |
| campos projetados | `Descartavel da validacao 9C \| Bremer Validacao \| SN-9C-0001` |
| **editar** | `{"status":"aplicado","versao":2}` |
| projeção reprojetou | `caldeira \| Editado na validacao 9C \| Werner Editado \| SN-9C-0002`, `source_version` **2** |
| busca pelo fabricante **novo** | 1 |
| busca pelo fabricante **antigo** | **0** — o valor velho saiu do índice |
| **excluir** | `{"status":"aplicado","versao":3}` |
| verdade viva | **0** |
| **tombstone** | **1**, gravado |
| **projeção** | **0 — nenhum fantasma** |
| busca por TAG / fabricante / série | **0 / 0 / 0** |
| organização | de volta a **4** |

> **Resíduo declarado:** ficou **1 tombstone** (`nr13_info_ZZ-TESTE-9C-20260823`, ~100 bytes). Ele
> é o **resultado correto** de uma exclusão pelo fluxo oficial — o sistema faz *soft delete* de
> propósito, para a exclusão propagar entre aparelhos. Removê-lo exigiria sair do fluxo oficial,
> o que a autorização proibia. **Fica para o seu conhecimento e decisão.**

---

## 11 · A flag — OFF → ON → OFF

| momento | orgs ligadas | piloto | **outras ligadas** |
|---|---:|---|---:|
| antes | 0 | false | **0** |
| ON na piloto | 1 | **true** | **0** |
| OFF de volta | 0 | false | **0** |

**Nenhuma outra organização mudou de caminho em momento nenhum.** Desligar não converteu nada: a
projeção da piloto continuou com as 4 linhas, e `app_storage` não foi tocada.

**Estado final da flag: DESLIGADA**, como manda o fechamento do P9.2.

---

## 12 · Auditoria final

| prova | valor |
|---|---|
| chaves **vivas** | **746** |
| tombstones | 143 (**+1**, o do teste) |
| projeção total | **4** — só a piloto |
| relatórios projetados | **4** |
| **pendências** | **0** |
| organizações com `busca_v9` ON | **0** |
| auditoria da piloto | **`convergiu: true`** |
| perfis | **39** (inalterado) |
| resíduo `ZZ-TESTE` na projeção | **0** |

---

## 13 · O que ficou provado, e o que não

### Provado em produção, sobre dado real

- instalação na ordem correta, com a collation aplicada com as tabelas vazias;
- backfill de **uma** organização, convergido, sem tocar em nenhuma outra;
- **projeção idêntica à verdade, 4 equipamentos × 13 campos**;
- busca por TAG exata, prefixo, descrição, **fabricante**, **nº de série** (com e sem separador),
  filtros e termo inexistente;
- paginação por cursor sem duplicar nem pular;
- **isolamento entre organizações**, inclusive para o papel `cliente`;
- ciclo completo de escrita: criar → editar → excluir, com `source_version` convergindo e
  **sem fantasma** na busca;
- flag OFF → ON → OFF sem afetar terceiros e sem converter dado.

### NÃO provado — depende do bundle em produção

- comparação **visual** OFF × ON, cartões e miniaturas;
- abrir equipamento e montar documentos pela ponte de compatibilidade;
- offline, fila durável, reconexão, conflito;
- DOM, rede e *lazy* de imagens;
- debounce e descarte de resposta antiga.

**O P9.2 não pode ser fechado só com o que está aqui.** Falta o deploy do front e a validação de
interface — e a decisão de fazer esse deploy é sua.
