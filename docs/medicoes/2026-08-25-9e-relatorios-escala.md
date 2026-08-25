# 9E · `/relatorios` em escala — implementação e o que falta medir

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
numa organização grande é uma varredura disfarçada de recurso. O `9E-b2` (TAG) **reusa** o
índice que a 9B já criou: índice a mais é escrita mais cara em toda emissão de relatório.

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

**Suíte completa: 1378/1378. Build verde.**

---

## 6 · O QUE FALTA — e por que

### 6.1 · Benchmark e testes SQL: escritos, NÃO EXECUTADOS

`scripts/fase9/bench-9e.sql` e `scripts/fase9/testes-9e.sql` estão prontos, mas **não rodaram**:
o Docker não está ativo nesta máquina (`failed to connect to the docker API … dockerDesktopLinuxEngine`).
É o mesmo bloqueio registrado na Fase 8 em 22/08.

> **Nenhum número de escala foi medido.** O que esta etapa prova sobre custo constante está no
> nível do CLIENTE (contagem de consultas e de acessos ao storage), não no do PLANNER. Falta a
> prova de que os índices são realmente escolhidos em 50.000 linhas — e ela é exigência do
> próprio task-level ("um por vez, com benchmark"). **Sem ela, o gate 9E.2 não pode ser dado
> como cumprido.**

O benchmark mede **buffers** (métrica independente da máquina) em 1.000 · 5.000 · 10.000 ·
20.000 · 50.000, com **só metadados**: `pdf_ref` é string, e nenhum PDF é criado — gerar 50.000
arquivos para medir uma busca que não os toca seria medir a coisa errada.

### 6.2 · DOM, heap e long tasks

Não medidos: exigem a tela rodando com massa, o que depende do mesmo Docker. A virtualização é a
mesma da 9C, cujo ganho está medido em `2026-08-22-fase9c-tela.md`.

---

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
