# Fase 12B · polimento do Modelo Novo — campo vazio, placa e gate de geometria

**04/09/2026.** Três frentes: o realce de campo vazio na edição, a placa de
identificação (reconstruída e real) e o gate de fidelidade contra a referência
oficial.

---

## 0 · Uma diferença de arquitetura que precisa ser dita

O pedido fala em "campos vazios no Modelo Novo durante edição/pré-visualização".
**A prévia da tela não é o Modelo Novo.**

| | o que é |
|---|---|
| prévia na tela | os 27 templates de `public/arquivos-inspecao/`, um `<iframe>` por folha — o desenho CLÁSSICO |
| Modelo Novo | existe só na FINALIZAÇÃO: o gerador vetorial desenha o PDF a partir do modelo de dados |

Não existe, hoje, uma prévia do desenho novo em tela: ele nasce direto em PDF.
Por isso o amarelo foi implementado onde o usuário de fato edita — nas folhas da
prévia — e o gate de fidelidade foi feito onde o Modelo Novo de fato existe: no
gerador. As duas coisas atendem ao que o pedido quer (ver o que falta; e o
desenho bater com a referência), mas em superfícies diferentes, e vale registrar
isso em vez de deixar parecer que são a mesma tela.

---

## 1 · Gate de geometria — medido, não olhado

A referência entrou no repo: `docs/referencias/relatorio-nr13.html`, **101.290
bytes**, SHA-256 `52392e60347ca025e9ad98113cd931a9d959e0d1c75a676267bce06efbc21e95`.
Um `.gitattributes` marca o arquivo como binário: normalizar fim de linha
mudaria os bytes e o gate acusaria adulteração de um arquivo intocado.

`pdfVetorial/geometriaReferencia.test.ts` **abre o arquivo e extrai o CSS**, e
compara com as constantes do gerador — 27 asserções:

| grupo | o que é conferido |
|---|---|
| folha | 210 × 297 mm; margens 9 / 15 / 7 / 15; caixa útil de 180 mm derivada, não digitada |
| cabeçalho | logo 14 mm + respiro 2 mm + 3,5 mm abaixo da régua; régua .6pt #808080; 8.5pt / 10pt (nº do doc) / 7.5pt ("Página X de Y") |
| rodapé | margem 3,5 + respiro 1,5 + 3 linhas de 8.5pt na entrelinha do `.rod` |
| tipografia | 10pt base, 24 / 14 / 12 na capa, 10 seção, 9.5 sub, 10.5 banner, 9 faixa, 8 nota, 8.5 mini |
| espaçamento | banner 3 / 1.2 mm, faixa 2.4 / 0, seção 3.4 / 1.2 |
| tabela | padding .6 × 1.4 mm (compacta .45 × 1.2), 8.5 / 8pt, borda .6pt #808080, `#d9d9d9` no cabeçalho, `#f2f2f2` no rótulo, rótulo com 38% |
| campos | valor `#1B3A6B`; vazio `#FFF8C4` — e a regra de impressão que o apaga |
| fotos e assinaturas | capa 92 mm, larga 62 mm, cartão 74 mm, assinatura 16 mm, grade 2 colunas com 4 mm, assinaturas 2 colunas com 8 mm e 6 mm acima |

> Copiar os números para dentro do teste faria gate e implementação
> concordarem para sempre — inclusive quando os dois estivessem errados. Por
> isso o teste **lê a referência**.

### As quatro divergências encontradas — e corrigidas

Vinte e três passaram de primeira: a geometria da Fase 11 já tinha saído da
referência. Quatro não:

| # | o que estava | o que é | consequência |
|---|---|---|---|
| 1 | `banner()` sem margem de topo | `margin: 3mm 0 1.2mm` | banner colado na seção anterior, folha inteira subindo 3 mm por seção |
| 2 | `faixa()` sem margem de topo | `margin: 2.4mm 0 0` | estava a cargo do chamador (`doc.y += 2.4`), e só **2 dos 27** pontos faziam |
| 3 | rodapé reservando 15,80 mm | 17,14 mm | o `.rod` usa `line-height: 1.35`, e **só ele**; a 3ª linha ficava a 1,34 mm da borda |
| 4 | assinaturas com 8 mm acima | 6 mm | bloco de assinatura 2 mm mais baixo que a referência |

O caso 2 é o mais instrutivo: margem é atributo do elemento, não tarefa de quem
o usa. Enquanto foi tarefa do chamador, 25 dos 27 usos saíram errados sem que
nada acusasse.

---

## 2 · Campo vazio em amarelo

`features/documentos/camposVazios.ts`. A referência define
`.campo.vazio { background: #FFF8C4 }` e apaga na impressão; aqui é o mesmo
amarelo, aplicado nos `[contenteditable]` das folhas da prévia — que é
exatamente o que os templates usam para marcar campo de dado (célula de
checkbox, rótulo e moldura não são editáveis e ficam de fora).

A regra do que é "vazio" não lista variantes: ela remove traço, barra, ponto,
espaço e sublinhado e pergunta se sobrou alguma coisa. Assim `--`, `—`,
`--/--/----`, `--/----` e `&nbsp;` são vazios, enquanto `0` e `N/A` **não são** —
zero é medida e "não se aplica" é resposta.

### O amarelo não é conteúdo do documento

Ele é derivado (`campo vazio` + `modo edição`) e nada é gravado. Três barreiras
independentes:

1. **o PDF do Modelo Novo não vem do DOM** — o gerador desenha a partir do
   modelo de dados, e a marcação da tela não existe para ele;
2. **documento salvo não é marcado** — com `ro=1` não há o que preencher, e
   marcar diria que falta algo num documento fechado;
3. **`normalizarCloneParaCanvas` limpa o clone** que o `html2canvas` fotografa,
   então nem a impressão nem o PDF de rollback levam amarelo. Há ainda um
   `@media print` dentro da própria folha, para o Ctrl+P direto.

### Não substitui validação

O realce não sabe o que é obrigatório e não bloqueia nada. Quem barra a
finalização continua sendo a validação existente: obrigatório faltando bloqueia,
opcional faltando avisa. Cor como regra esconderia a regra.

---

## 3 · Placa de identificação

A folha de identificação passou a fechar com a placa, no bloco
`PLACA DE IDENTIFICAÇÃO` (62 mm — a mesma `.foto-larga` da referência).

| situação | o que sai |
|---|---|
| sem foto | placa **reconstruída**, desenhada em vetor a partir da ficha |
| com foto real | a **foto**, encaixada por `contain` na proporção medida |
| foto removida | volta a reconstruída, sem passo extra |

A reconstrução traz o que uma placa real traz — fabricante, TAG, nº de série,
ano, código de projeto, fluido, PMTA, PTH, volume e categoria NR-13 — em moldura
e grade desenhadas: **texto e traço vetoriais, nenhuma imagem**. Campo sem valor
na ficha sai com o travessão do documento; nada é inventado.

A altura do bloco é a mesma com foto e sem, para que enviar ou tirar a foto não
mude a paginação da folha.

### Onde o arquivo mora

Pelo pipeline de fotos que já existe (`services/fotos.ts`): comprime, guarda no
cofre local, sobe para o bucket privado e grava **`RefFoto`** — nunca base64. Foi
o base64 que estourou a cota no prontuário do fabricante (§2-bis).

`nr13_placa_` foi declarada em três lugares, cada um com o seu motivo:
`familiasChave` (escopo de TAG), `FORA_DO_PALCO` (nenhuma folha de `public/` a
lê) e a lista de negação do Portal — o cliente recebe a placa **dentro do PDF**,
e servir a referência de um arquivo que a tela dele não abre não ajudaria
ninguém.

### A escolha fica num card, não num clique na folha

`CardPlacaIdentificacao` fica na barra do documento. Pendurar o clique dentro do
`<iframe>` amarraria a escolha da placa a uma folha que **não é** a que sai no
PDF (ver §0), e não funcionaria bem no celular. Em documento salvo o card só
informa: trocar a placa mudaria um documento assinado (§7-ter).

---

## 4 · Testes

| arquivo | o que cobre |
|---|---|
| `pdfVetorial/geometriaReferencia.test.ts` (27) | o gate de geometria descrito no §1 |
| `documentos/camposVazios.test.ts` (6) | a regra do que é vazio, incluindo `0` e `N/A` que **não** são |
| `relatorios/placaIdentificacao.test.ts` (9) | campos da reconstrução, nada inventado, real prevalece, remoção volta, chave por TAG sem base64, fora do palco |
| `pdfVetorial/pdfVetorial.test.ts` (+3) | sem foto → 0 imagens e ≥21 textos; com foto → 1 imagem na proporção 3,2 dentro da caixa; altura estável |

| | |
|---|---|
| suíte | **1.880 testes, 155 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

---

## 5 · Validação em produção

Bundle **`assets/index-Cb-GK4ZC.js`**. Org de teste, `ZZ-TESTE-P2`, relatórios
de **uma folha** (PLACA) para não gastar cota.

### A e C · o amarelo na edição

Na folha `PLACA.html` da prévia, medido dentro do iframe:

| | |
|---|---|
| campos editáveis | **21** |
| marcados como vazios | **14** — `plate-serie`, `plate-ano`, `plate-fluido`, `plate-classe`, `pmta-mpa`… todos com `--` ou `-` |
| NÃO marcados | `plate-equip` (ZZ-TESTE-P2), `plate-tipo` (vaso), `plate-fab-nome` (ZZ-TESTE-B-CICLO2), `plate-norma` (ASME), `plate-data-insp` (04/09/2026) |
| folha de estilo injetada | sim, e contém `@media print { .nr13-campo-vazio { background: transparent !important; } }` |

Conferido também na tela: os preenchidos ficam brancos, os vazios amarelos.

### B · o amarelo NÃO chega ao documento

Relatório finalizado pelo Modelo Novo, `REL-1788556347343`:

| | |
|---|---|
| bytes | **33.760** · SHA `de4b78ac33bc8aea` |
| `/Subtype /Image` | **0** |
| `FontFile2` | **4** |
| MediaBox | `[0 0 595.28 841.89]` — A4 exato |
| operador de preenchimento amarelo (`1 0.97… 0.76… rg`) | **ausente** |

O amarelo foi procurado no arquivo, não presumido ausente.

### D e G · placa reconstruída, em vetor

O mesmo PDF traz o bloco `PLACA DE IDENTIFICAÇÃO` com a placa desenhada:
moldura, faixa "PLACA DE IDENTIFICAÇÃO — NR-13" e 10 campos em duas colunas —
`FABRICANTE: ZZ-TESTE-B-CICLO2`, `IDENTIFICAÇÃO / TAG: ZZ-TESTE-P2`, e travessão
onde a ficha não tem dado. **Zero imagens no arquivo** é a prova de que a placa
é desenho, não captura.

### E e H · foto real prevalece, sem distorção

Enviada uma placa de teste de **900 × 300** (proporção 3,00):

| | |
|---|---|
| card na barra | passou a "foto real do equipamento", com "Trocar foto" e "Remover" |
| registro gravado | `{ ref: { bucket, path: …/placa/c79b699c….jpg, tamanho: 3939 }, proporcao: 3, enviadoEm }` |
| base64 no registro | **não** — só a `RefFoto` |
| PDF finalizado | 37.123 bytes · SHA `93b5857204352f60` · **1** imagem, `/Width 900 /Height 300`, 4 `FontFile2` |

A proporção 3,00 é a MEDIDA da imagem, não uma suposição — o quadro é o mesmo
de 62 mm e a foto entra por `contain`.

### F · remover devolve a reconstruída

Um clique em "Remover": o card voltou a "reconstruída com os dados da ficha",
sobrou só o botão "Usar foto real", e a chave `nr13_placa_ZZ-TESTE-P2`
desapareceu do IndexedDB.

---

## 6 · O que continua valendo

Motor vetorial, A4, Carlito embutida, texto real, tabelas e gráfico do TH em
vetor, 4 fotos por folha, certificados, assinaturas, SHA, Storage, `pdfRef`,
integridade e histórico imutável — nada foi tocado. Nenhum PDF histórico foi
regenerado.
