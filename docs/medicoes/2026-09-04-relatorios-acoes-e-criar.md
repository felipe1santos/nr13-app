# `/relatorios` · o botão de criar de volta, e as ações por relatório

**04/09/2026.** A tela tinha ficado limpa e perdido função: não havia como criar
um relatório pelo topo, e a coluna de ações tinha só o olho.

---

## 1 · O botão que faltava — e o nome errado do caminho

`+ Criar relatório` voltou ao canto superior direito, **antes** do filtro, porque
é a ação principal da tela.

O caminho, porém, tinha um problema de nome: o editor do sistema é o mesmo
arquivo que abre o relatório anterior ao §7-quater, e a URL dele era
`?legado=1`. Criar um relatório novo por um parâmetro chamado "legado" descreve
errado o que se está fazendo — e apareceu na interface.

Agora existe **`?editor=1`**, que leva à mesma tela com o nome certo.
`legado=1` continua valendo: os links já emitidos não podem parar de abrir.

## 2 · Três ações por relatório

| ícone | ação | o que faz |
|---|---|---|
| 👁 | Visualizar | abre o PDF arquivado — o único ponto da tela que toca o arquivo |
| ✏️ | Editar nome | modal pequeno; muda **só o rótulo** |
| 🗑 | Remover da lista | **arquiva** — não apaga |

No rascunho, as ações são outras: **continuar editando** e **excluir
definitivamente**.

## 3 · Editar nome — o que muda e o que não muda

`renomearRelatorio(id, tag, nome)` reescreve `nome` no registro e no índice. E
só. **Medido no navegador, depois de renomear:**

| | antes | depois |
|---|---|---|
| nome | `Relatorio_Inspeção_Periódica_SEM-01.pdf` | `Inspeção periódica 2026 — SEM-01` |
| `sha256` | — | **idêntico** |
| `pdfRef.path` | — | **idêntico** |
| páginas | 15 | 15 |
| `verificarIntegridade` | — | **true** (4.597.892 bytes conferidos contra o hash) |

Nome vazio é recusado: linha sem identificação é pior que nome feio.
Relatório antigo sem nome customizado continua com o nome gerado.

## 4 · Excluir × arquivar — a separação é a regra

### Rascunho: destrói mesmo

Nada nele foi emitido — sem PDF, sem SHA, fora do índice do equipamento, sem
vencimento e fora do Portal (10B.1). `excluirRelatorio` apaga as referências que
ele tem, pelo caminho oficial de mutação (a mesma fila durável de sempre):

- o registro `nr13_rel_<id>_<TAG>`;
- a entrada no índice do equipamento (que o rascunho nem chega a ter);
- o item em `nr13_rascunhos`.

> **As fotos NÃO são apagadas, de propósito.** Elas vivem em
> `nr13_inspecao_atual` / `nr13_injecao_atual`, que são do CONTAINER de inspeção
> e não do rascunho — apagá-las levaria junto o trabalho de campo do
> equipamento. Não há dado exclusivo do rascunho além das três referências
> acima.

### Finalizado: NÃO existe excluir

Um relatório emitido é um arquivo imutável com hash, alimenta o vencimento do
equipamento, aparece no Portal e pode ter registro no Livro. Apagá-lo destruiria
evidência técnica de equipamento em operação — e em silêncio.

O que o usuário quase sempre quer é **parar de ver**, e é isso que a ação faz,
com o nome certo. `nr13_relatorios_arquivados` guarda **ids** (~40 bytes cada),
no mesmo desenho de `nr13_rascunhos`: chave global, leve, lida no boot.

**O que arquivar não toca:** PDF, `pdfRef`, `sha256`, bytes, índice do
equipamento, projeção, vencimento, Portal e Livro.

## 5 · Onde o arquivado reaparece

Filtro **Lista** no painel: `Sem os arquivados` (padrão) · `Só os arquivados` ·
`Todos`. Ao sair do padrão, a tela escreve uma linha explicando que os
documentos continuam inteiros — sem ela, um relatório que sumiu da lista parece
destruído.

Rascunho excluído não aparece em lugar nenhum: ele deixou de existir.

## 6 · Validação no navegador — os cinco cenários

| | resultado |
|---|---|
| **A** · criar relatório | topo mostra `Criar relatório` + `Período e tipo`; o clique vai para **`?editor=1`**, lista os equipamentos, e escolher um abre o histórico daquele equipamento com o criador. **Nenhum `legado=1`** |
| **B** · renomear finalizado | nome novo na lista e no registro; **SHA, pdfRef e páginas idênticos**; integridade `true` |
| **C** · excluir rascunho | modal de confirmação forte → bloco some, registro `null`, chave direta `null`, `nr13_rascunhos` vazio, nada no índice do equipamento. **Sem órfãos** |
| **D** · arquivar finalizado | modal explicando que não apaga → sai da lista padrão, reaparece em "Só os arquivados" com o aviso; registro, SHA, pdfRef e índice intactos |
| **E** · mobile (390 px) | `scrollWidth == innerWidth` (**sem rolagem horizontal**), linha de 354 px, os **3 botões de ação cabem** sem estourar |

## 7 · Referências mapeadas antes de mexer

| referência | rascunho | finalizado |
|---|---|---|
| `nr13_rel_<id>_<TAG>` | apagado | **intacto** |
| `nr13_rascunhos` | item removido | não se aplica |
| `nr13_historico_indice_<TAG>` | não estava lá | **intacto** |
| projeção `relatorios_index` | nunca chegou | **intacta** |
| vencimentos | não produzia | **intactos** |
| Portal | não aparecia | **continua aparecendo** |
| Storage / `pdfRef` / `sha256` | não existiam | **intactos** |
| fotos | do container, preservadas | não se aplica |
| fila offline | mutação pelo caminho oficial | idem |

Nenhum `delete` direto, nenhum SQL cru.

## 8 · Números

| | |
|---|---|
| suíte | **1.720 testes, 145 arquivos, 0 falhas** (+10 testes, +1 arquivo) |
| `tsc -b` | limpo · **build** verde |
| novos | `arquivados.ts`, `ModalRenomear.tsx`, `ModalRemocao.tsx`, `renomearRelatorio()`, `urlDoEditor()` |
