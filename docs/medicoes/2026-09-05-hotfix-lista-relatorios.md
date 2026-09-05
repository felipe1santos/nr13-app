# Hotfix de UX · `/relatorios` com uma lista só

**05/09/2026.** A tela abria com duas listagens empilhadas e parecia clonada.

---

## 1 · O que estava errado

| | antes | agora |
|---|---|---|
| listagens na tela | **2** (bloco "Em rascunho" + tabela dos emitidos) | **1** |
| cabeçalhos de coluna | 2 | 1 |
| como se distingue rascunho | por estar em outro bloco | selo `RASCUNHO` na própria linha + acento azul |
| ícone do arquivo | imagem `/icones/pdf.webp` | sprite do projeto (`filetext`) numa marca quadrada |

O argumento do bloco separado era que rascunho não tem emissão, validade nem
PDF. É verdade sobre os DADOS e não justifica duas tabelas: a diferença cabe
numa coluna de situação. Célula sem dado continua com travessão — nada é
inventado para preencher coluna.

## 2 · A regra, em função pura

`features/relatorios/listaUnificada.ts`: `unificarLista` (rascunhos primeiro,
depois a ordem do servidor — a paginação por cursor depende dela),
`situacaoDaLinha` (`rascunho` · `arquivado` · `finalizado` · `sem-arquivo`) e
`totalNaTela`.

`sem-arquivo` existe porque relatório anterior ao §7-quater não pode se chamar
"finalizado" junto dos que têm PDF: quem clica espera o documento, e ali só
existe a receita.

## 3 · Visual

Linha de sistema no lugar do cartão arredondado: cantos de 4–6 px, borda
discreta, acento vertical de 3 px à esquerda (azul = rascunho, âmbar =
arquivado, transparente = emitido), hover discreto e alinhamento vertical firme.
A borda esquerda é transparente por padrão, e não ausente, para o realce não
empurrar o conteúdo quando aparece.

## 4 · Regras de negócio — nenhuma mudou

Rascunho continua fora da projeção do servidor (sem vencimento, Livro ou
Portal) e é o único que pode ser destruído; relatório finalizado continua sem
excluir — só arquivar. Nenhum PDF foi regenerado, nenhum SHA ou `pdfRef` foi
tocado.

## 5 · Validação em produção

Bundle `assets/index-CyNQREF8.js` · CSS `assets/index-XHXDbKVg.css`, org de teste.

| | resultado |
|---|---|
| listagens na tela | **1** (`rel-tabela-v9` × 1, `rel-rascunhos` × 0) |
| selos | `RASCUNHO` na primeira linha, `FINALIZADO` nas demais |
| marcas | 15 com PDF, 1 de rascunho, **0** imagens `rel-ico-pdf` |
| desktop (1400 px) | 8 colunas resolvidas, linha de 55 px, acento `rgb(12,79,155)` no rascunho, **sem overflow** |
| ações · emitido | Visualizar · Editar nome · Remover da lista (arquivar) |
| ações · rascunho | Continuar editando · Excluir rascunho |
| renomear | modal abre (`role=dialog`) e fecha |
| busca | termo do rascunho → 1 linha; limpar → 16 |
| contador | 18 (soma o rascunho, que está na lista) |
| celular (753 px) | cartão de duas colunas, situação visível, ações acessíveis, **sem overflow** |

## 6 · Testes

`listaUnificada.test.ts` — 17 testes, incluindo o gate de fonte que reprova a
volta da segunda tabela.

| | |
|---|---|
| suíte | **1.990 testes, 161 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
