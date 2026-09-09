# Régua de prazos, imagem esticada, placa e destaque — 09/09/2026

Rodada de cinco ajustes pedidos pelo dono, todos de **leitura**: em nenhum deles o
dado estava errado — o documento (ou o painel) apresentava mal o que já tinha.
Fecha com E2E em produção, relatório emitido e conferido página a página.

Commit: `0b021aa` · bundle em produção: `assets/index-DrUTzftC.js`

---

## 1. Dashboard — a régua de prazos

**Antes:** `Todos · 5 dias · 30 · 60 · Vencidos`.

Dois defeitos, e nenhum é estético. "Todos" não é um prazo: ele desligava o
painel de prazos e o transformava numa listagem do parque inteiro, que é o que a
tela `/vencimentos` já faz com busca e paginação. E "5 dias" chega tarde —
reinspeção de vaso se agenda com semanas de antecedência.

**Agora:** `15 · 30 · 60 · 90 · Vencidos`, com 90 como padrão de abertura.

A regra saiu de dentro do JSX — eram três ternários dentro de um `.filter()`, e
por isso nunca teve teste — e virou `noFiltroPrazo` em `services/vencimentos.ts`.
Ela é **cumulativa e inclui o vencido**: `dias <= N`.

Essa última parte é a que importa. Sem "Todos", a janela mais larga passou a ser
90 dias; se ela excluísse os negativos, o Dashboard abriria escondendo
**justamente o que está atrasado**. O chip "Vencidos" continua isolando-os
(`dias < 0`), que é uma pergunta diferente de "o que resolvo nos próximos 90
dias".

Gate: `src/services/filtroPrazo.test.ts` (19 testes) — a lista de chips, a borda
inclusiva, a cumulatividade varrida de −30 a +120 dias, e o item sem prazo que
não entra em filtro nenhum.

**Medido em produção** (conta `teste`, 08/09):

| chip | linhas | conferido |
|---|---|---|
| 15 dias | 0 | "Nada neste filtro" |
| 30 dias | 1 | ZZ-TESTE-P2, vence em 29 dias |
| 60 dias | 1 | idem |
| 90 dias | 2 | + ZZ-F6-001 (certificado), 90 dias |
| Vencidos | 0 | nenhum vencido na conta |

Toque no celular: o chip tinha 24 px de altura e virou 40 px sob 720 px de
largura — com "Todos" fora, ele é o único jeito de mudar a janela do painel.

---

## 2. Imagem esticada

**A causa.** Logo e rubrica eram desenhadas com largura e altura FIXAS
(`addImage(..., 50, 14)` e `(..., 40, 16)`): toda imagem cuja proporção não fosse
a do quadro saía deformada. A foto de capa era pior — `foto()` caía num 4:3
assumido quando ninguém passava a proporção, e foto de celular tirada em pé sai
achatada.

**A correção.** A proporção passa a vir dos BYTES, por `jsPDF.getImageProperties`
— síncrono, sem DOM, funciona igual no navegador e na suíte
`environment: 'node'`. O `proporcao` informado pelos chamadores virou segunda
opção (serve o croqui, que chega como SVG rasterizado) e o 4/3 histórico, último
recurso. O quadro passou a ser LIMITE, não formato.

`imagemEncaixada()` é o mesmo "contain" sem a moldura cinza — logo (à esquerda,
porque a faixa à direita é do nº do relatório) e rubrica (centrada sobre a linha
de assinatura).

**De quebra, um defeito mais caro:** `addImage` com arquivo corrompido lança
"wrong PNG signature" e isso **derrubava a emissão inteira** — uma foto truncada
no upload custava o relatório. Agora o quadro sai vazio e o documento continua.

Gate: `pdfVetorial/apresentacaoDocumento.test.ts` — PNG 2×1 real desenhado em
quadro quadrado, largo e estreito; a razão medida no `addImage` interceptado.

---

## 3. Tratamento de imagem — auditado, sem mudança

O pedido era verificar upload → armazenamento → uso → prévia → PDF. O caminho já
estava correto; o defeito era só o desenho. Registro do que foi conferido:

| etapa | o que faz |
|---|---|
| upload de foto | `imagem.ts`: 1200 × 1600 px, JPEG q0,70, orientação EXIF aplicada; miniatura 400 px q0,60 |
| logo | comprimida a 300 px antes de subir |
| rubrica | PNG transparente por tratamento próprio (JPEG mataria a transparência) |
| armazenamento | bucket + cofre local + `RefFoto`; **nada de base64 no storage** (§2-bis) |
| PDF | `addImage` embute o JPEG como está (`DCTDecode`) — sem recompressão, sem rasterizar folha |

**Medido no PDF emitido do E2E** (24 páginas, 390 KB):

10 imagens somando 278 KB (71 % do arquivo). Maior: 1030 × 773, 144 KB — a foto
de 633 KB da pasta do teste, já comprimida no upload. Seis são JPEG
(`DCTDecode`); as outras quatro são as PNG de logo e rubrica. Nenhuma página
rasterizada: 30.566 caracteres de texto extraível em 24 páginas.

---

## 4. Placa de identificação (folha 3)

**Antes:** grade `RÓTULO | valor` de duas colunas. Informação certa, aparência de
planilha.

**Agora:** o modelo da referência do dono — quadros com o valor grande dentro e o
nome do campo pequeno **por fora, embaixo**; fieira cheia para o que é único
(TAG, tipo, fabricante, código de projeto), fieira partida para o que anda em par
(série + ano, fluido + classe); PMTA e PTH como mini-tabela de três unidades
(MPa · psi · kgf/cm²); CATEGORIA num quadro alto no fim.

A largura sai da ALTURA, pela proporção da referência (`PROPORCAO_PLACA = 0,92`).
Esticá-la de margem a margem produzia uma faixa que não parece placa nenhuma.

A escolha dos campos e a geometria são função pura (`layoutDaPlaca`), testável
sem gerar PDF; o desenho fica em `folhas.ts`. A foto real continua prevalecendo
sobre a reconstruída, e a área inteira segue clicável para trocá-la.

Uma correção depois da primeira prova visual: a fieira das pressões saía com
metade do corpo do resto da placa (ela empilha unidade + valor no mesmo quadro).
Ganhou fator de altura próprio — 1,5 contra 2,1 da categoria.

---

## 5. Categorização — acende o caminho, não a tabela

**Antes:** a linha inteira da classe e a coluna inteira do grupo pintadas de
amarelo-claro. Onze células acesas numa matriz de vinte, e a resposta sumia no
meio delas.

**Agora:** acendem só três. As duas ENTRADAS em tom suave (célula da classe,
cabeçalho do grupo) e o RESULTADO em âmbar forte, em negrito.

A ligação entre eles é um **corredor âmbar** traçado pelas BORDAS do caminho — as
duas horizontais da linha da classe, da célula da classe até o resultado, e as
duas verticais da coluna do grupo, do cabeçalho até o resultado. Pelo meio, a
linha riscaria as letras das outras categorias ("I", "II", "III") ao passar.

Só é desenhado quando as DUAS entradas existem: meia consulta não tem caminho, e
uma linha apontando para lugar nenhum afirmaria um resultado que o sistema não
calculou.

**Conferido no documento emitido:** Classe C (vapor de água) × Grupo 3 → **III**,
e o campo "CATEGORIA DO VASO" da mesma folha diz III. Nenhuma outra célula acesa.

---

## 6. X / APROVADO / REPROVADO em negrito

Saíam no peso do texto corrido, e são exatamente o que um auditor procura numa
folha impressa em preto e branco.

A regra mora no RENDERIZADOR (`negritoDaCelula`, em `documento.ts`), não em cada
chamada: as marcas nascem em quatro lugares diferentes (`celulaMarca`,
`rotuloResultado`, `rotuloLaudo`, `marcasDocumentacao`), e uma flag por chamador
garantiria que a próxima folha a imprimir um veredito esqueceria de passá-la. O
conjunto é `X · APROVADO · REPROVADO · APROVADO COM RESSALVAS · APTO · INAPTO`,
casando a célula INTEIRA — "item aprovado com ressalva do inspetor" não acende.

O `APTO`/`INAPTO` da folha de ensaios é parágrafo, não célula, e recebeu o
negrito na própria chamada.

---

## 7. E2E em produção

Equipamento **ZZ-TESTE-VISUAL** (vaso vertical, Classe C, categoria III),
container "INSPEÇÃO PERIÓDICA 2026 — VS-2019-77410", 17 documentos selecionados,
assinado por **funciona01** (engenheiro) e ZZ-TESTE-F7-OFFLINE-1 (inspetor).

```
nome     TESTE-XXXXXXXXXXX-V3.pdf
nº       REL-1788922332328
pdfRef   inspecao/99f642d3-.../relatorios/de1ba974-3b07-4eb1-a817-1309235d8a6e.pdf
sha256   67e977843c46e120f8cf5fc9fcaab4f3626d40199189390e627dd6c8361ec774
páginas  24 · bytes 399.243 · texto extraível 30.566 caracteres · 10 imagens
```

O SHA-256 do arquivo baixado do bucket bate byte a byte com o que a tela
informou — o documento servido é o documento emitido.

Conferido página a página no arquivo arquivado (pdf.js, fora do app):

| item | página | resultado |
|---|---|---|
| foto de capa não esticada | 1 | vaso vertical na proporção real, centrado |
| logo do cabeçalho não esticada | todas | encaixada à esquerda no quadro 50 × 14 |
| placa no modelo novo | 3 | dados reais da ficha, PMTA/PTH em 3 unidades, CATEGORIA III |
| categorização | 4 | Classe C + Grupo 3 acesos, corredor âmbar até o III |
| X / APROVADO / APTO | 10 | os três em negrito |
| assinatura | 23 | rubrica de funciona01 + CREA + campos extras, e a do inspetor |
| vetorial | — | 30.566 caracteres selecionáveis; nenhuma folha rasterizada |

## Limitações declaradas

- A conta de teste segue com **3 escritas pendentes de sincronização** que não são
  deste teste; por isso a prova de cache frio continua adiada (mesma condição da
  rodada de 08/09).
- A logo da conta de teste é uma foto de vaso, não uma logo — ela serve para
  provar a proporção, não a estética de uma logo real.
