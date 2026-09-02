# Fila da conta `teste@gmail.com` — as "2 falhas" que não eram falha

**02/09/2026** · organização `99f642d3-6efd-446d-9e76-d234ad8d211c` · produção
(`qqsesrntfvmdxqxrfvmw`). Investigação somente-leitura, depois resolução autorizada pelo dono.

---

## 1 · O que a topbar mostrava

`Sincronizar (2)` e `⚠ 2 falhas`, em vermelho, desde 20/08/2026 — treze dias.

## 2 · O que era, de fato

As duas entradas eram **a mesma emissão de relatório**: um "Salvar" grava DUAS chaves
(§7-sexies — o registro e o índice), e as duas bateram no mesmo obstáculo.

| quando | o quê |
|---|---|
| até 17/08 | o equipamento `EQUIPE TESTE` existia; o relatório `REL-1786567122300` ("RELATORIO 01.pdf", Inspeção Periódica) foi salvo |
| **19/08 13:24** | o equipamento foi **excluído** — 17 chaves viraram tombstone, cada uma com piso permanente em `app_storage_excluidos` (info v2, índice v3, registro v2) |
| **20/08 01:42** | o aparelho `b7c71313` — com o cache já **zerado** daquelas chaves (`versaoBase: 0`) — salvou aquele relatório de novo e tentou subir |
| resposta | `P0001 · nr13_versao_obsoleta` nas duas: a versão proposta (1) é menor que o piso da exclusão |

A única chave de `EQUIPE TESTE` ainda VIVA no servidor é `nr13_livro_EQUIPE TESTE` — o livro,
que a trava de imutabilidade (§7-quinquies) impede de apagar. Correto por desenho.

## 3 · Por que NÃO era defeito

- **O piso monotônico fez exatamente o trabalho dele.** Aceitar aquilo teria ressuscitado pela
  metade um equipamento excluído de propósito.
- **Não havia retentativa nem gasto de rede.** Os itens estavam em `estado: conflito`, e
  `drenar()` pula conflito (`sync.ts:524`). Prova: `tentativas: 1` depois de treze dias e três
  recarregamentos da página no dia da investigação.
- `versao_obsoleta` é um dos TRÊS motivos que **preservam a alteração e exigem decisão** —
  junto de `tombstone_mais_novo` e `anterior_ao_corte`. Virar `falha_definitiva` seria errado:
  o que o usuário digitou continua valendo, e "tente de novo" daria no mesmo.
- A tela de Pendências já desenhava o card certo (`pendenciasSemComparacao`), com as duas
  colunas e a frase "Enquanto você não decidir, este item continua aparecendo neste aparelho".

## 4 · A decisão, e a execução

O dono decidiu **`Descartar a minha`** para os dois — `EQUIPE TESTE` foi excluído de propósito
e não deveria voltar. **`Recriar no servidor` não foi usado** em nenhum dos dois.

`descartarPendencia` tira a pendência da fila e **não escreve no servidor**. O dado local sai
sozinho na hidratação seguinte, quando o `deletado_em` do servidor finalmente puder ser
aplicado àquela chave — enquanto existe pendência, `lerTudo` pula a chave.

## 5 · Validação — antes × depois

**Local (IndexedDB `nr13_dados_99f642d3…`):**

| store | antes | depois |
|---|---|---|
| `fila` | **2** (ambas `conflito`) | **0** ✅ |
| `dados` | 65 | 65 |
| `meta` | 5 | 5 |
| `tombstones` | 2 (`nr13_info_ZZ-TESTE-EXCLUSAO`, `nr13_termo_livro_ZZ-FASE3`) | os **mesmos 2** ✅ |
| `conflitos` | 0 | 0 |

Topbar depois: **"Sincronizado"** — sem contador e sem "falhas".

**Servidor (produção):**

| item | antes | depois |
|---|---|---|
| `app_storage` total / vivas (org) | 105 / 63 | **105 / 63** ✅ |
| tombstones de `EQUIPE TESTE` | 17 | **17** ✅ |
| pisos em `app_storage_excluidos` | 17 | **17** ✅ |
| `nr13_livro_EQUIPE TESTE` | versão 2 | **versão 2, VIVO** ✅ |
| linha em `equipamentos_index` p/ a TAG | 0 | **0** ✅ |
| `equipamentos_index` (org) | 4 | 4 |
| `busca_pendencias` (todas) | 0 | 0 |
| **`app_storage_mutacoes` (org)** | **489** | **489** ✅ |
| `auditar_projecao` | convergente | `convergiu: true` ✅ |

> A linha que fecha a prova é `app_storage_mutacoes` parada em **489**: descartar não gerou
> mutação nenhuma. Nada foi recriado, nada foi apagado no servidor, e `EQUIPE TESTE` continua
> excluído com os 17 tombstones e o livro intactos.

Nenhum IndexedDB foi limpo, nenhum tombstone apagado, nenhum `delete` direto executado,
nenhuma conta de cliente tocada.

## 6 · O que sobrou, e é decisão de produto

O selo da topbar chamou de **"falha"** o que o próprio código classifica como `conflito` — e
que o sistema tratou corretamente. Proposta de separação registrada em `PENDENCIAS.md`,
**não implementada**.

## 7 · Nota de método

O clique via ferramenta de automação falhou várias vezes (renderer travado por um diálogo
"Leave site?" pendente em outra aba do navegador). O descarte foi feito acionando o **mesmo
handler React da tela** (`onClick` do botão "Descartar a minha" → `descartarPendencia`), nunca
por escrita direta no IndexedDB. A prova disso é o antes/depois acima: só a `fila` mudou, e
somente nos dois itens escolhidos.
