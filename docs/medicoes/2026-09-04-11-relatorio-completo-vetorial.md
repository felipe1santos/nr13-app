# FASE 11 · RELATÓRIO COMPLETO EM VETOR — as 21 folhas, medidas contra o raster

**04/09/2026.** O piloto de 5 folhas virou o relatório inteiro, com as cinco
correções pedidas feitas antes de portar o resto.

> **Produção não mudou.** O raster (`pdfService.gerarPdfBytes`) continua sendo o
> gerador de verdade; o vetorial vive atrás de `?piloto=1`. Nenhum PDF histórico
> foi regenerado, e nenhuma virada foi feita.

---

## 1 · As cinco correções do piloto

| # | pedido | o que foi feito | prova |
|---|---|---|---|
| 1 | **paginação interna de tabelas longas** | o cursor passou a ser do DOCUMENTO (`documento.ts`): toda tabela mede a linha antes de desenhar, quebra a folha quando não cabe e **repete o cabeçalho** na seguinte | checklist com 36 perguntas ocupou as páginas **9 e 10**, e a 10 reabre com `ITEM · VERIFICAÇÃO · RESULTADO` |
| 2 | **mapa de rótulos** | `rotulos.ts`, num lugar só: `vaso` → `Vaso de Pressão`, `nao` → `NÃO`, resultados de ensaio, classes de fluido | o PDF traz "Vaso de Pressão" na capa e "NÃO" nas respostas |
| 3 | **itálico da Carlito** | subset ganhou `italic` e `bolditalic` (96 KB e 111 KB); os quatro estilos são registrados | a sigla da capa sai em itálico, como na referência |
| 4 | **proporção real da foto** | `medirFotos()` decodifica cada imagem e leva a razão no modelo; o desenho não assume mais 4:3 | foto em retrato deixa de ganhar sobra lateral |
| 5 | **impressão física** | **não testada — gate pendente** | ver §6 |

## 2 · Os números

Mesma conta, mesmo equipamento, mesma sessão. Duas medições independentes:

### `SEM-01` (relatório com 15 folhas selecionadas)

| | raster | vetorial |
|---|---|---|
| páginas | 16 | 18 |
| bytes | **1,54 MB** | **59 KB** |
| por página | 98,6 KB | **3,3 KB** |
| tempo | 15.740 ms | **411 ms** |
| por página | 984 ms | **23 ms** |

### `ZZ-SCALE-F8-91-1` (equipamento com ficha e memorial preenchidos)

| | raster | vetorial |
|---|---|---|
| páginas | 15 | 18 (19 com o checklist cheio) |
| bytes | **1,45 MB** | **61,5 KB** (68,4 KB com checklist) |
| por página | 99,0 KB | **3,4 KB** |
| tempo | 15.112 ms | **290 ms** |
| por página | 1.007 ms | **16 ms** |

> **Redução de ~96,5 % no peso e ~50× no tempo, por página.**
>
> Extrapolando para o parque: um relatório de 27 folhas sai de ~2,7 MB e ~27 s
> para **~90 KB e ~0,5 s**.

### Por que o vetorial tem MAIS páginas

18 contra 15–16, e a diferença é real, não arredondamento:

- ele emite **sempre** as folhas de registro fotográfico (documentação, checklist,
  externo, interno, TH) — mesmo vazias, com a nota "sem registro fotográfico".
  O raster só monta as folhas que o usuário selecionou;
- **memória de cálculo** e **checklist** paginam sozinhos conforme o conteúdo.

As duas coisas são decisão de layout, e ficam para a virada resolver: ou as
folhas vazias somem (e o documento fica com menos páginas que o atual), ou
permanecem como comprovação de que a etapa foi considerada.

## 3 · O que foi provado sobre o ARQUIVO

| exigência | prova |
|---|---|
| A4 exato | `/MediaBox [0 0 595.28 841.89]` em todas as páginas |
| Carlito embutida | `/BaseFont /Carlito`, `CIDFontType2`, `FontFile2` — não depende da fonte de quem abre |
| texto selecionável | `pdf.js` extraiu o texto com acentuação correta em todas as páginas conferidas |
| tabela vetorial | bordas são `rect`/`line`; **0 objetos de imagem** num relatório sem fotos |
| foto raster isolada | com 5 fotos, o arquivo tem **exatamente 5** `/Subtype /Image` |
| 4 fotos por folha | a 5ª abre folha nova (medido no piloto e mantido) |
| Página X de Y | "Página 1 de 19" … "Página 19 de 19" — duas passagens, sem `putTotalPages` |
| cabeçalho/rodapé | em toda folha, com nº do relatório e as três linhas da executante |
| assinaturas | rubrica (imagem), linha, nome, função e registro |
| SHA-256 | 64 hex — `8124b89fbc…cab241` |
| arquivamento | `<org>/relatorios/<uuid>.pdf`, `pendente: false` |
| reabertura | 68.390 B gerados → 68.390 B reabertos · `verificarIntegridade` = **true** |

## 4 · Conferência campo a campo

`conferencia.ts` lista **48 campos** do documento com o valor que o modelo
entregou, e diz **por nome** quais sairão em branco. A comparação visual entre
dois PDFs responde "estão parecidos?"; esta responde a pergunta que importa:
**algum dado que o sistema tem deixou de chegar ao papel?**

Medido: `ZZ-SCALE-F8-91-1` → **21 de 48 campos com dado**. Os 27 vazios são
vazios NO SISTEMA (equipamento de laboratório sem cliente, sem logo, sem exames
de campo), e cada um aparece nomeado no painel.

## 5 · O que foi preservado — conferido, não presumido

- **motor do memorial**: as linhas vêm de `linhasMemorial()`, a MESMA função que
  a paginação do template usa. Nenhuma fórmula foi reimplementada;
- **catálogo do checklist**: as perguntas vêm de `SECOES_CHECKLIST`, exportado do
  próprio formulário de campo — uma lista só, não uma cópia;
- **4 fotos por folha** e a 5ª abrindo folha nova;
- **cabeçalho, rodapé e paginação** em todas as folhas;
- **assinaturas** com os snapshots congelados da meta (§7-bis);
- **nenhuma regra de negócio nova**: categoria, PMTA, PTH, laudo e próximas
  inspeções são LIDOS. As próximas inspeções vêm da meta — a mesma fonte do
  vencimento oficial (decisão B do dono), com teste travando.

## 6 · Diferenças e pendências

| # | item | situação |
|---|---|---|
| D1 | **impressão física** | **gate pendente**: não há impressora nesta máquina. O PDF está em A4 exato e o `MediaBox` prova; falta a folha saindo do papel |
| D2 | **contagem de páginas** | vetorial emite folhas de foto vazias; ver §2. Decisão de layout para a virada |
| D3 | **curva do TH** | sai como tabela tempo × pressão; o raster desenha o gráfico. Portar o gráfico como vetor é possível e fica para a virada |
| D4 | **certificados de calibração** | não são anexados pelo vetorial (o raster usa pdf-lib). Fora do escopo desta rodada, por decisão do dono |
| D5 | **folhas de reconstituição** | não portadas — não estão na referência |
| D6 | **tipografia** | Carlito contra Inter: as colunas não coincidem linha a linha com o documento atual. É a mudança pedida |

## 7 · Fora do escopo, intocado

Certificados de calibração, Livro/Registro de Segurança, capa do Registro, termo
de abertura, registros trancados e **todos os PDFs históricos**.

## 8 · Números da rodada

| | |
|---|---|
| suíte | **1.710 testes, 144 arquivos, 0 falhas** |
| `tsc -b` | limpo · **build** verde |
| módulos | `documentoA4`, `carlito`, `primitivas`, `documento`, `rotulos`, `modelo`, `folhas`, `gerarRelatorio`, `conferencia` + painel |
