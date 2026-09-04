# Fase 12B · gate: nenhum modelo oferecido pode sair pelo raster

**04/09/2026.** Auditoria pedida sobre o que cada modelo faz na finalização, e a
correção que ela obrigou.

---

## 1 · Auditoria — o que o código faz hoje

`modeloDocumento` tem **quatro** consumidores, e só um decide o PDF:

| onde | o que faz |
|---|---|
| `pages/Relatorios.tsx:114` (`metaPadrao`) | carimba `modeloDocumento` no nascimento do rascunho |
| `pages/Relatorios.tsx:574` (duplicar) | carimba com o modelo atual — relatório duplicado é novo |
| `pages/Relatorios.tsx:794` (finalizar) | **`motorDoRelatorio(meta, search)` → escolhe o gerador** |
| `SeletorModeloRelatorio.tsx` | a tela |

A cadeia da decisão, antes deste gate:

```
modeloDocumento = 'classico'
  → motorDoModelo() → 'raster'
  → pdfService.gerarPdfBytes('.relatorio-preview')
  → html2canvas(folha) por folha
  → pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)

modeloDocumento = 'novo'
  → motorDoModelo() → 'vetorial'
  → pdfVetorial/gerarRelatorio.ts → jsPDF + Carlito embutida, texto e traço reais
```

`pdfService.ts:52` é a linha que define a natureza do Clássico: **uma imagem
JPEG cobrindo o A4 inteiro, por folha**. Não há texto no arquivo, só o desenho
dele.

No motor vetorial, `html2canvas` aparece **uma única vez**
(`pdfVetorial/certificados.ts:110`) e não é a folha do relatório: é a folha de
calibração, que não tem PDF de origem — a exceção já declarada no §7-septies.

### 2 · A resposta

> **B) O modelo Clássico gerava PDF RASTER pelo gerador antigo.**

Provado no código (cadeia acima) e medido em produção, antes de qualquer
alteração, num relatório Clássico real de uma folha:

| | Clássico | Novo |
|---|---|---|
| bytes | **387.670** | 32.219 |
| `/Subtype /Image` | **1** | 0 |
| `FontFile2` | **0** | 4 |
| texto selecionável | **não existe** | sim |
| Carlito embutida | não | sim |

Um `FontFile2` zerado com uma imagem de página inteira é a assinatura do
`html2canvas`: o PDF não tem uma única letra, e nenhuma busca, seleção ou
leitor de tela alcança o conteúdo de um documento técnico assinado.

---

## 3 · Estimativa antes de decidir

O layout Clássico **não é um estilo**: são os 27 templates de
`public/arquivos-inspecao/` — **14.690 linhas** de HTML/CSS, com tabela, moldura
e cabeçalho próprios folha a folha.

O que **já é compartilhado** e continua servindo:

| peça | linhas | papel |
|---|---|---|
| `pdfVetorial/modelo.ts` | 385 | a ponte de dados — lê as chaves do §2 e entrega um modelo sem layout |
| `pdfVetorial/documento.ts` | 315 | paginação, quebra de folha, cabeçalho/rodapé |
| `pdfVetorial/primitivas.ts` | 309 | texto, tabela, foto, linha |
| `documentoA4.ts` · `carlito.ts` | 174 | caixa A4 e fonte embutida |
| `graficoTh.ts` · `certificados.ts` · `composicao.ts` | 480+ | gráfico do TH, anexos, composição |

O que **falta** é só o layout: um segundo `folhas.ts`. O atual tem **635 linhas**
para 21 folhas de um desenho projetado para o motor; reproduzir o Clássico —
mais denso, todo em moldura — não sai por menos, e vem com um portão de
fidelidade folha a folha contra 27 arquivos que são a especificação.

**Estimativa: da ordem de 1.500–2.000 linhas de layout novo, mais um gate visual
de 21 folhas.** É o tamanho da própria Fase 11, que foi uma fase inteira. E
deixaria dois layouts para manter em sincronia a cada regra nova.

> A arquitetura pedida — dados e regras únicos → motor vetorial → dois layouts —
> **já está montada**. A ponte de dados, a paginação e as primitivas não
> precisam de nada. Falta o segundo layout, e ele é grande.

## 4 · Decisão

**NÃO implementar agora**, e **retirar o Clássico da oferta** — o caminho que o
próprio pedido prevê para o caso desproporcional.

Motivo, em uma frase: entre oferecer uma escolha em que uma das opções é a
fotografia de um documento e oferecer um modelo só, o modelo só é honesto.

## 5 · O que mudou no código

| peça | mudança |
|---|---|
| `MODELOS_OFERECIDOS` | passa a listar só `'novo'`. `MODELOS` continua com os dois, para ler valor gravado e para a prévia que já existe |
| `modeloEfetivo(m)` | modelo retirado cai no oferecido |
| `motorDoModelo(m)` | passa pelo efetivo — **nenhum modelo oferecido devolve `raster`** |
| `modeloGravado()` | NOVO: o valor cru, para auditoria. Uma org com `classico` gravado não perdeu a escolha; está esperando o layout |
| `modeloDaEmpresa()` | passa a devolver o EFETIVO — é ele que carimba o rascunho, para o carimbo não prometer um desenho que o sistema não emite |
| `SeletorModeloRelatorio` | renderiza `MODELOS_VISIVEIS` e avisa que outros modelos aparecem quando existirem. **Não foi simplificado**: devolver `'classico'` a `MODELOS_OFERECIDOS` faz a escolha reaparecer inteira |

### O que isso custa, dito por inteiro

Um rascunho congelado em `classico` passa a sair no modelo Novo. É a única parte
da promessa de congelamento de que a regra nova abre mão, e de propósito:
congelar serve para o desenho não mudar debaixo do usuário — não para manter
vivo um desenho que o sistema retirou. A alternativa seria honrar o
congelamento e emitir a fotografia.

**Históricos não são afetados de forma nenhuma:** documento com `pdfRef` é
servido como arquivo (§7-quater) e nunca passa por esta decisão. Um relatório
emitido em raster continua abrindo os seus próprios bytes raster.

### Raster depois deste gate

| camada | valores | quem alcança |
|---|---|---|
| MODELO VISUAL | `novo` (e `classico` gravado, à espera de layout) | a empresa, em "Minha Empresa" |
| MOTOR NORMAL | `vetorial` | ninguém escolhe: é consequência do modelo |
| ROLLBACK | `raster` | só `?motor=raster` na URL e `definirMotorPdf('raster')` |

O parâmetro de rollback não aparece em "Minha Empresa" e não é alcançável por
nenhum caminho normal.

## 6 · Testes

`modeloDocumento.test.ts` — **18 testes**, com o bloco novo *"NENHUM modelo
oferecido pode sair pelo raster"*:

- todo modelo de `MODELOS_OFERECIDOS` gera pelo motor vetorial — devolver um
  modelo à lista sem lhe dar layout vetorial quebra aqui, não em produção;
- a tela mostra exatamente os modelos oferecidos;
- modelo retirado cai no oferecido, e não no raster;
- empresa com `classico` gravado emite pelo Novo, e o valor cru continua legível;
- rascunho congelado em `classico` também sai vetorial;
- o raster continua alcançável **só** por `?motor=raster`.

| | |
|---|---|
| suíte | **1.835 testes, 152 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 7 · Preservado da 12B

Configuração por organização, congelamento no rascunho (para modelos
oferecidos), mini-prévias, visualizador novo, miniaturas fechadas, topbar
compacta, históricos por `pdfRef`, desktop/mobile — nada foi tocado. Nenhum
gerador foi removido.

---

## 8 · Validação em produção, depois do gate

Bundle **`assets/index-DKBY80Ef.js`**, conferido pela string
`"Outros modelos aparecem aqui quando ficarem disponíveis."`.

A organização de teste continuava com **`{"modelo":"classico"}` GRAVADO** — o
pior caso possível para esta regra.

| exigência | medido |
|---|---|
| tela de "Minha Empresa" | mostra **um** modelo, "Novo", marcado como ativo, com a nota de que outros aparecem quando existirem |
| valor cru preservado | `nr13_modelo_relatorio = {"modelo":"classico","em":"…T20:00:18.312Z"}` — a org não perdeu a escolha |
| rascunho novo nasceu | **`modeloDocumento: "novo"`** (`REL-1788554033329`), mesmo com `classico` gravado |
| finalizado | 1 página, SHA `47a510a4d46b4b8b`, `pdfPendente:false` |
| bytes | **32.477** |
| `/Subtype /Image` | **0** |
| `FontFile2` | **4**, com 8 entradas `/BaseFont /Carlito` |
| `/Type /Font` | presente |
| MediaBox | `[0 0 595.28 841.89]` — **A4 exato** |
| assinatura | `%PDF-1.3` |
| baixar × registro × tela | mesmos 32.477 bytes e mesmo SHA nos três |

> Um PDF com **zero objetos de imagem** e quatro subsets de fonte embutidos não
> pode ser a fotografia de uma página. O contraste com o Clássico medido antes
> do gate — 387.670 bytes, 1 imagem, 0 fontes — é a prova direta.

### Históricos intactos

O relatório Clássico **raster** emitido antes do gate foi reaberto **depois**
dele: **387.670 bytes**, SHA `834a0f909e825941`, 1 imagem, 0 fontes — idênticos
ao registro. Nenhuma regeneração, nenhum documento reconvertido. Documento com
`pdfRef` continua sendo servido como arquivo.
