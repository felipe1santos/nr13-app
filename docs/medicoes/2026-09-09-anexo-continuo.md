# Relatório + anexos como um documento só — 09/09/2026

Commits `606a2f8` (anexo contínuo) e `9a06704` (ícone da seção + o vão restante).
Bundle em produção: `assets/index-C6IzJ1ac.js`.

---

## A causa da separação

A prévia vetorial gerava com `certificados: false` — os anexos não entravam nos
bytes. Foi uma decisão de custo: cada folha de calibração custa uma rasterização
no host isolado, e a prévia foi feita para revisar o corpo.

O buraco era preenchido por outro caminho. `AnexosRastreabPreview` rasteriza as
páginas do certificado e as desenha como `<img>` dentro de `.relatorio-preview`
— e esse bloco estava **fora** da guarda `montaIframes(fluxo)`.

No fluxo de iframes ele fazia sentido: as folhas do relatório também eram HTML,
e o anexo era mais uma da mesma pilha. No fluxo vetorial, padrão desde a 13E, o
`.relatorio-preview` fica vazio — e sobrava só ele, com contêiner próprio, fundo
próprio, rolagem própria e um vão entre os dois. Eram dois documentos na tela
porque, na tela, eram mesmo.

## A correção, em dois pontos

1. `gerarPreviaRelatorio` passa `certificados: true`. Os anexos entram nos
   MESMOS bytes, pelo mesmo caminho da emissão, e o `Página X de Y` do corpo
   passa a contar o arquivo inteiro.
2. `AnexosRastreabPreview` só é montado no fluxo de iframes.

Depois disso sobrava um resto: o `.relatorio-preview` vazio ainda ocupava ~40px
abaixo do visualizador. `.relatorio-preview:empty { display: none }`.

**Custo declarado:** cada folha de calibração da composição custa uma
rasterização ao gerar a prévia. Aceito — prévia que não mostra o anexo é prévia
de outro documento.

## O que já estava certo, e não foi tocado

| item | onde | como já era |
|---|---|---|
| páginas preservadas | `rastreabilidadeService.anexarRastreabilidades` | `copyPages` + `addPage` — geometria original (MediaBox/CropBox) de cada página |
| sem carimbo por cima | mesmo lugar | o corpo é desenhado ANTES; o anexo é acrescentado a um documento pronto |
| certificado protegido | idem | `ignoreEncryption: true` |
| anexo que não abre | idem | volta NOMEADO em `falhas`, nunca some calado |
| outro tamanho de folha | `VisualizadorPdf` | mede CADA página e escala por página — o comentário no código já dizia que era por causa dos anexos |
| um arquivo só | `gerarRelatorioVetorial` | desenha → anexa → devolve `bytes`; quem publica calcula o SHA sobre esses bytes |
| contagem de páginas | idem | relida do arquivo final (`PDFDocument.load`), não somada |

## E2E em produção

Equipamento **ZZ-TESTE-VISUAL**, com o certificado do padrão de ultrassom
(TEMPCALL / CREA-SP, 8 páginas) marcado para injeção.

**Na prévia:**

- 23 páginas, num visualizador só (`.vpdf-area` = 1);
- `.pagina-anexo-rastreab` = **0** — o bloco de imagens não existe mais;
- os **22 vãos** entre páginas consecutivas medem `10px`, todos iguais: a
  passagem do corpo para o anexo tem exatamente o mesmo espaçamento de qualquer
  virada de página;
- a folha 15 é a última do NR-13 ("Página 15 de 23", rodapé MDK) e a 16 abre a
  capa do certificado, com o fundo vermelho sangrando até a borda — sem moldura,
  sem cabeçalho nosso;
- a folha 23 traz a paginação do PRÓPRIO certificado ("Página 8 de 8") e a
  assinatura do engenheiro dele.

**No arquivo emitido** (`TESTE-ANEXO-CONTINUO.pdf`):

```
nº       REL-1788926754885
pdfRef   inspecao/99f642d3-.../relatorios/73058ee6-bfe1-40c3-af7f-4c59432d8ef3.pdf
sha256   099a3b72fa01d2786f6f3a372f82e08d9eddff7935d6cece87ff655778f49ece
páginas  23 · bytes 968.458
```

- **23 páginas — o mesmo número da prévia.** Preview = final, por contagem.
- O SHA do arquivo baixado do bucket bate byte a byte com o que a tela informou.
- Texto extraído das páginas: a 15 é do NR-13 ("Página 15 de 23"); a 16 diz
  "Página 1 de 8", a 17 "Página 2 de 8", a 23 "Página 8 de 8" — **a paginação do
  certificado**, e nenhum "de 23" nelas.
- As páginas do anexo têm 73, 1268 e 2153 caracteres de texto real: elas foram
  **copiadas**, não rasterizadas. Geometria 595×842 pt preservada.

**Histórico:** o `TESTE-XXXXXXXXXXX-V3.pdf`, emitido antes desta rodada, foi
baixado de novo — 399.243 bytes, SHA `67e97784…ec774`, idêntico. Nada foi
regerado.

## Ícone da seção Relatórios

Era `barchart` — um gráfico de barras para a tela que lista documentos. Passou a
ser a folha com a tarja vermelha "PDF", o mesmo desenho que marca cada linha da
lista.

Desenhado no sprite, não o PNG: em 17px um raster de 1240px sai borrado. É o
único ícone do sprite com cor própria, e há teste garantindo que continue sendo
o único — o resto é traço em `currentColor` para herdar o estado do lugar onde
está. Aqui a tarja É a informação; a folha continua em `currentColor` e acende
junto com o item selecionado.

## Pendências

Nenhuma desta rodada. Continua valendo a de antes: o botão "Gerar Documento" do
modal está âmbar, e não no azul da referência — decisão registrada em
`2026-09-09-modal-configurar-e-icones.md`.
