# 13D · a prévia passa a ser o documento

**04–05/09/2026.** O que o usuário revisa deixa de ser um desenho diferente do
que ele assina: a prévia é o **mesmo gerador da emissão**, em modo `preview`.

---

## 0 · A paridade do ultrassom (feita primeiro, e de propósito)

A 13C registrou a ressalva; a 13D a fechou antes de qualquer coisa nova.

| | antes | agora |
|---|---|---|
| origem da tabela | `us.pontos` / `us.medidas` — o **container** de inspeção | `carregarMedicoes(tag)` — a **grade** (`nr13_med_grid_` + pontos do container) |
| colunas | `P1..Pn`, genéricas | os **ângulos reais** (`0°`, `90°`, `180°`, `270°`) |
| agrupamento | uma tabela só | uma tabela por região (tampo superior / casco / tampo inferior) |

Nenhuma chave nova, nenhum dado duplicado: `pontosUltrassom` passou a ler pela
mesma função que o editor React usa. O documento e o prontuário agora dizem a
mesma coisa sobre a mesma medição — antes, o que o inspetor digitava alimentava
o prontuário e **não** aparecia no relatório.

Regra preservada: linha sem medida nenhuma e sem espessura requerida continua
fora do papel.

---

## 1 · Um gerador, dois modos

`Documento` recebe um 4º argumento, `modo: 'preview' | 'final'` (default
`'final'`). A única diferença de desenho é a cor de fundo de uma célula de
valor **vazia**:

```ts
export function corDeFundo(cel: CelulaDoc, modo: ModoDocumento): string {
  if (cel.rotulo) return COR.fundoRotulo;
  if (modo === 'preview' && celulaVazia(cel)) return AMARELO_PREVIA; // #FFF8C4
  return '#ffffff';
}
```

`gerarPreviaRelatorio(tag, documentos)` devolve **bytes, páginas e tempo**. Não
publica artefato, não calcula SHA oficial, não grava `pdfRef`, não toca em
histórico, vencimento nem Livro — quem faz isso é `salvarHistorico`, sempre em
modo `final`. Certificados ficam de fora da prévia: cada folha de calibração
custa uma rasterização no host isolado (13B), e a prévia é para revisar o corpo.

---

## 2 · O amarelo e o painel, juntos

O painel **"O que falta"** não substitui o amarelo — foi condição explícita do
dono. Os dois saem da MESMA fonte (`oQueFalta(montarModeloRelatorio(tag))`, o
modelo que desenha o PDF), então não há como um dizer uma coisa e o outro dizer
outra:

- o amarelo mostra **onde**, na folha, o campo está vazio;
- a lista mostra **o quê**, sem rolar doze folhas, e cada item clicável abre o
  painel certo (Configurações / Medições / Laudo).

`oQueFalta` **não valida**: quem barra a finalização continua sendo
`validacaoFinalizacao`. Vazio nem sempre é problema — nem toda inspeção tem
teste hidrostático.

---

## 3 · Atualizar prévia, e o aviso de atrasada

Uma geração na abertura; depois, sob demanda pelo botão. **Nunca por tecla** —
o vetorial leva ~1,8 s num documento completo, e gerar a cada dígito travaria a
tela. Enquanto houver edição salva mais nova que a última geração, a barra
mostra "Há alterações ainda não refletidas na prévia."; prévia silenciosamente
velha seria pior que prévia nenhuma.

---

## 4 · Flag e rollback

`nr13_previa_documento` (`iframe` | `vetorial`), com `?previa=` vencendo a
chave. **Ausência de valor = `iframe`**: a prévia antiga das 27 folhas continua
sendo o padrão, intacta, a um passo de distância. Valor desconhecido também cai
no caminho antigo — nunca em tela em branco.

Documento **arquivado não é alcançado pela flag**: com `pdfRef`, servem-se os
bytes emitidos (§7-quater) e a prévia nem é montada.

---

## 5 · Testes

`edicao13d.test.ts` — **22 testes**, em quatro blocos: paridade do ultrassom,
preview × final (o amarelo não vaza para o final), a prévia não emite, painel e
flag. O gate da paridade parte da grade salva pelo editor React e exige os
valores e os ângulos na tabela do Modelo Novo.

| | |
|---|---|
| suíte | **1.953 testes, 159 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 6 · Fora do escopo, não tocados

13E (desligamento do palco, remoção dos iframes) e 13F (limpeza). Livro,
Prontuário e certificados seguem como a 13B os deixou.

---

## 7 · A prévia usa o visualizador do app, não o do navegador

Medido na primeira validação em produção: com a prévia num `<iframe src=blob>`,
o Chrome abre o **próprio** leitor de PDF — barra dele somada à do app e coluna
de miniaturas aberta comendo um terço da largura. Era exatamente o que a 12B
tinha tirado do documento arquivado, voltando pela porta da prévia.

`VisualizadorPdfBytes` é o MESMO componente (pdf.js), para bytes que ainda não
são artefato. Ele recebe `extras` — os controles da prévia entram DENTRO da
barra do visualizador, e é assim que "uma única barra horizontal" se cumpre — e
`selo`, que troca "Documento arquivado" por "Prévia — não é o documento
emitido".

## 8 · Validação em produção

Org de teste, `ZZ-TESTE-P2`, bundle `assets/index-OibvTDsM.js`.

| | o que foi verificado | resultado |
|---|---|---|
| A | grade editada no React → Atualizar prévia | `Casco 1 · 0° = 3,21` na tabela do Modelo Novo, colunas `0° 90° 180° 270°`, uma tabela por região |
| B | campo vazio na prévia | CONTRATANTE, ENDEREÇO, VALIDADE, APARELHO, ACOPLANTE… em amarelo |
| C | os MESMOS campos no PDF arquivado | fundo branco, `—` — zero amarelo |
| D | editar depois de gerar | "Há alterações não refletidas" aparece |
| E | Atualizar prévia | o aviso some |
| F | prévia não emite | nenhuma linha de histórico, nenhum `pdfRef`, nenhum SHA enquanto só se gerava prévia |
| G | finalização | 12 páginas, SHA `172bff565fde2682…`, "Documento arquivado"; reabrir devolve o MESMO SHA |
| H | desktop | uma barra só (Atualizar prévia · O que falta · Páginas · zoom · selo), miniaturas fechadas, topo do app reduzido |
| I | 387px | sem overflow horizontal, nenhum elemento clipado, três botões por linha |

**Achado da validação (corrigido):** a barra de ações do celular estava
calibrada para os quatro botões de antes da 13C; com sete, "Imprimir
pré-visualização" era cortado (117px de rótulo em 105px de botão). Passou a três
por linha, com quebra de linha no rótulo.

**Nota de método:** o pdf.js só desenha com a aba **visível** (`rAF` não dispara
em segundo plano). Validar por script numa aba oculta mostra canvas em branco —
não é defeito do visualizador.
