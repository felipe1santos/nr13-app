# FASE 11 · PILOTO VETORIAL — 5 folhas, medidas contra o raster

**04/09/2026.** Primeiro relatório do sistema desenhado **em vetor**, com dados
reais, fonte embutida, SHA-256 e arquivamento pelo mesmo caminho do §7-quater.

> **Produção não mudou.** O gerador de verdade continua sendo o raster
> (`pdfService.gerarPdfBytes`); o piloto vive atrás de `?piloto=1` e nenhum
> relatório histórico foi regenerado.

---

## 1 · Os números

Mesma conta, mesmo equipamento (`SEM-01`), mesma sessão:

| | raster (html2canvas + jsPDF) | piloto vetorial |
|---|---|---|
| páginas | 14 | 6 |
| bytes | **1,36 MB** (1.426.063 B) | **51.960 B** |
| **por página** | **99,6 KB** | **6,9 KB** |
| tempo | 14.030 ms | 175 ms (2ª geração: 66 ms) |
| **por página** | **1.002 ms** | **35 ms** |

> **Redução de 93,1 % no peso por página e 29× no tempo por página.**
>
> A comparação honesta é POR PÁGINA: o raster gerou o relatório inteiro (14
> folhas), o piloto gera 5 folhas fixas + as de fotos. Comparar totais brutos
> (1,36 MB × 52 KB = −96 %) exageraria a favor do piloto.

Extrapolando para um relatório de 27 folhas: **~2,7 MB → ~190 KB**, e
**~27 s → ~1 s**.

## 2 · O que foi provado, e como

Tudo medido no navegador, sobre o PDF gerado — não sobre a tela.

| exigência | prova |
|---|---|
| **dados reais** | texto extraído do PDF: `SEM-01`, `REL-1788494796340`, `Inspeção Periódica`, itens do exame externo, observações, laudo `APTO`, assinante `Eng. Teste 10B1` |
| **Carlito embutida** | `/BaseFont /Carlito`, `/Subtype /CIDFontType2`, `/FontFile2` presentes no arquivo — **não depende da fonte instalada em quem abre** |
| **A4 exato** | `/MediaBox [0 0 595.28 841.89]` = 210×297 mm, e o viewport do pdf.js confirma |
| **cabeçalho/rodapé** | em todas as páginas, com o nº do relatório |
| **Página X de Y** | "Página 1 de 6" … "Página 6 de 6", contadas antes de desenhar |
| **quebra de página** | 6 seções → 6 páginas, sem conteúdo cortado |
| **texto selecionável** | `pdf.js` extraiu o texto **com acentuação correta** ("INSPEÇÃO", "IDENTIFICAÇÃO", "Nº") |
| **tabela vetorial** | as bordas são `rect`/`line`; nenhuma tabela é imagem |
| **foto raster sem virar página-imagem** | `/Subtype /Image` aparece **5 vezes** — exatamente as 5 fotos. O resto da página é vetor |
| **4 fotos por folha** | página 4 traz "Foto 1 … Foto 4" |
| **5ª foto abre folha nova** | página 5 traz **só** "Foto 5" |
| **assinatura** | bloco com rubrica (imagem), linha, nome, função e CREA |
| **SHA-256** | 64 hex, `d6fcdf20…188a3035` |
| **arquivamento** | `publicarArtefato` → `<org>/relatorios/<uuid>.pdf`, `pendente: false` |
| **reabertura pelo MESMO pdfRef** | 51.960 B gerados → 51.960 B reabertos, e `verificarIntegridade` = **true** |

## 3 · Como o vetor foi construído

Quatro módulos novos em `src/features/relatorios/pdfVetorial/`:

| módulo | o que faz |
|---|---|
| `documentoA4.ts` | a geometria em **mm**, copiada do CSS da referência (folha, margens, réguas, paleta, corpos de fonte) |
| `carlito.ts` | baixa e registra a fonte no jsPDF, **sob demanda** e uma vez por sessão |
| `primitivas.ts` | texto, banner, faixa, tabela, foto, cabeçalho, rodapé — **tudo com `pdf.text()`/`rect()`/`line()`** |
| `ponteDados.ts` | o passo 11.3 da 10C: lê as chaves reais e devolve o modelo do documento |
| `gerarPiloto.ts` | monta as 5 folhas e devolve bytes |

> **A ponte de dados veio ANTES das folhas, e é o ponto.** As 27 folhas de hoje
> leem `localStorage` cada uma por conta própria com `|| '{}'`: quando a chave
> falta, imprimem "-" e ninguém vê erro — foi assim que a CAPA saiu com
> "Nº RELATÓRIO: -" por dias. Aqui o campo ausente aparece como `null` no
> modelo, e `textoOu()` decide o que imprimir.

### A fonte

Carlito é a fonte da referência (métrica compatível com Calibri) e é **SIL OFL
1.1** — pode ser embutida em documento e redistribuída. A licença viaja com o
asset (`public/fontes/OFL.txt`).

`scripts/fontes/subset-carlito.mjs` recorta a fonte para Latin + acentuação do
português + os sinais que o documento usa: **621 KB → 102 KB** (regular) e
**674 KB → 115 KB** (negrito). O jsPDF ainda subseta de novo ao embutir
(`CIDFontType2`), e o resultado é que a fonte custa poucos KB no PDF final.

### Nenhuma regra de negócio nova

A ponte **lê** categoria, PMTA, PTH, laudo e próximas inspeções de quem já é
dono deles. As próximas inspeções vêm de `meta` — a MESMA fonte que alimenta
`vencimentos_org` pelo índice. Recalcular prazo ali criaria a segunda regra que
a decisão (B) do dono proíbe, e há teste travando isso.

## 4 · Diferenças visuais em relação ao raster

- **nitidez**: o raster é uma foto da tela a `scale: 2` — em zoom, o texto
  serrilha. No vetor, o texto é texto: nítido em qualquer zoom e em qualquer
  impressora;
- **tipografia**: o raster usa Inter (a fonte da tela); o piloto usa Carlito, que
  é a do layout desenhado. As métricas diferem, então as colunas não coincidem
  linha a linha com o documento atual — **é a mudança pedida**, não um desvio;
- **cores e réguas**: o piloto usa os cinzas da referência (`#d9d9d9`, `#f2f2f2`,
  réguas `#808080` a 0,6 pt), mais sóbrios que os da tela;
- **fotos**: idênticas em conteúdo, e agora com `contain` real — a foto não é
  esticada para preencher o quadro.

## 5 · Problemas encontrados

| # | problema | consequência | onde resolver |
|---|---|---|---|
| **P1** | `TIPO DE EQUIPAMENTO` imprime o slug cru (`vaso`) em vez de `Vaso de Pressão` | rótulo feio num documento assinado | tabela de rótulos na ponte de dados |
| **P2** | resposta do checklist imprime `NAO` (valor guardado) em vez de `NÃO` | idem | mesma tabela de rótulos |
| **P3** | o piloto não pagina DENTRO de uma tabela: uma lista de exame externo com 40 itens passaria do fim da folha | folha estourada | `cabeNaFolha` já existe e mede; falta o laço que quebra a tabela e continua na folha seguinte — **é o item nº 1 da expansão** |
| **P4** | fonte só em regular e negrito | itálico da referência (`.item-titulo`, sigla da capa) cai em regular | acrescentar `Carlito-Italic` ao subset quando alguma folha precisar |
| **P5** | a proporção da foto é assumida como 4:3 | foto em retrato fica centralizada com sobra lateral, sem distorcer | ler a proporção real da imagem antes de desenhar |
| **P6** | impressão física não foi testada | — | precisa de impressora real; o PDF é o artefato e já está em A4 exato |

Nenhum deles bloqueia a decisão de seguir: são acabamentos de mapeamento e uma
funcionalidade (P3) que a expansão exige de qualquer forma.

## 6 · O que falta para expandir às 21 folhas

1. **paginação dentro de tabela** (P3) — sem ela, checklist e ultrassom estouram;
2. **tabela de rótulos** (P1, P2) — slug → texto de documento, num lugar só;
3. **as 16 folhas restantes**, na ordem da 10C §9 (11.4 → 11.6);
4. **memória de cálculo** — a única folha com paginação por orçamento de linhas;
   o motor atual (`expandirMemorial`) precisa ser lido, não reinventado;
5. **injeção de certificados** (pdf-lib) no fim do documento;
6. **convivência atrás de flag** e o gate de comparação folha a folha contra os
   `prints/folha-01..21.jpg` da referência.

## 7 · O que NÃO foi tocado

Certificados de calibração, Livro/Registro de Segurança, capa do Registro, termo
de abertura, registros trancados e **todos os PDFs históricos**. O gerador raster
segue sendo o de produção; o novo só vale para emissões futuras, depois de uma
virada que ainda não foi autorizada.

## 8 · Números da rodada

| | |
|---|---|
| suíte | **1.704 testes, 144 arquivos, 0 falhas** (+12 testes, +1 arquivo) |
| `tsc -b` | limpo · **build** verde |
| arquivos novos | 5 módulos + painel + CSS + teste + script de subset + 2 TTF + OFL |
