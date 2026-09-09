# Modal "Configurar novo relatório" e o vocabulário de cor da lista — 09/09/2026

Rodada de UX/UI. Nenhuma regra de geração, seleção, persistência, PDF, SHA,
`pdfRef`, rascunho ou finalização foi tocada — e há gate travando cada uma
dessas afirmações (`modalConfigurarRelatorio.test.ts`, 20 testes).

Referência: `sistema1.png`. Commit `7e8e70c`, bundle `assets/index-DE_wEUMw.js`,
CSS `assets/index-GhZJZH9v.css`.

---

## O que o modal perdeu ao longo do caminho

Ele tinha virado título pequeno + select + caixa de dezessete checkboxes. O que
a referência faz e ele não fazia mais é **separar o que o sistema já tem salvo
do que ele está pedindo para o usuário escolher**. Sem essa separação, o ensaio
que veio de campo e a capa em branco eram a mesma linha de lista.

## O que voltou

| bloco | como ficou |
|---|---|
| cabeçalho | título em corpo de título (19px), X à direita, fio de separação |
| equipamento | o resumo e o "← Trocar equipamento" continuam, compactos, acima do tipo |
| tipo de inspeção | rótulo em cima, campo de largura cheia e 11px de respiro |
| **injeção automática** | painel azul com o raio, o texto de apoio e um cartão branco por achado |
| documentos a agrupar | rótulo + a instrução verde ao lado, lista em caixa própria |
| rodapé | Cancelar + Gerar Documento à direita, FORA do corpo rolável |

## As três decisões que não são estéticas

**1 · O bloco azul é uma VISTA, não um estado novo.**
Marcar um ensaio ali é marcar exatamente a mesma caixa que estava na lista: o
item delega para `toggle(doc)` ou `toggleCalib(id)`, que são os de sempre. O
modal continua com três `useState` — tipo, marcados, calibrações. O que sobe
para o bloco sai da lista de baixo, senão a mesma caixa apareceria duas vezes e
desmarcar numa "desmarcaria sozinha" na outra.

**2 · Um ensaio só entra se o formulário estiver PREENCHIDO.**
O critério é `container.dados[formulario] !== undefined` — o mesmo que o resto
do sistema usa para saber se o técnico salvou aquilo em campo. Container criado
e nunca aberto não aparece: prometer injeção de formulário vazio é pior do que
não prometer nada. Com mais de um container para o mesmo formulário (reinspeção),
mostra o mais recente e diz `(+N)`, em vez de escolher em silêncio. E se não há
nada, **o bloco não é desenhado** — um painel dizendo "o sistema localizou
formulários salvos" com nada dentro afirmaria o contrário do que é verdade.

**3 · Checkbox azul, botão âmbar.**
O checkbox virou azul como na referência: o âmbar é a cor de AÇÃO no sistema, e
dezessete caixas âmbar competiam com o botão que gera o documento. O botão
principal ficou âmbar, e isso é uma escolha declarada: `equipamento.css` carrega
a regra "um só botão no sistema" (06/09), e um primário azul só aqui criaria
duas famílias de botão principal. Trocar é uma linha, se o dono preferir o azul
da referência.

## Densidade

Visual da referência, densidade de hoje, como pedido: a linha da lista tem 36px
(a referência respira ~60px). São dezessete itens; rolar tudo para achar
"Conclusão" custa mais que o respiro. No celular ela sobe para 44px — alvo de
dedo.

## Rolagem

Uma tentativa de deixar os dois blocos elásticos (bloco azul encolhendo, lista
tomando o resto) foi **desfeita**: com piso de altura, o bloco azul passava por
cima da lista. O que ficou: a caixa de documentos tem altura própria (264px) e o
corpo rola. Em tela de trabalho tudo cabe e a única barra é a da lista, como na
referência; em tela baixa o corpo rola também — foi a alternativa a espremer o
bloco azul, que é a informação nova.

## A coluna "Ações"

Tinha olho azul, lápis azul e lixeira neutra ao lado da marca vermelha do PDF:
quatro cores para três gestos, e nenhuma dizia de qual gesto se tratava.

| gesto | cor | por quê |
|---|---|---|
| ver o documento | `#b42318` | o vermelho da própria marca do arquivo |
| retirar da lista / excluir rascunho | `#c0392b` | o gesto que tira algo de vista |
| renomear | neutro | é o único que não toca no documento |
| desarquivar | neutro | ele traz de volta; vermelho diria o contrário |

Só cor. Arquivar continua arquivando, rascunho continua sendo o único que se
exclui, e relatório finalizado continua sem caminho de exclusão.

Tudo escopado em `.rel-page`: `.btn-icone.cor-azul` é usado por Prontuários,
Calibrações e Certificados, e lá o azul continua certo. O CSS do modal é todo
`.mni-` pela mesma razão — `.modal-content`, `.btn-primario` e
`.item-documento-check` são compartilhados por dezenas de telas, e há teste que
quebra se um seletor global aparecer no bloco do modal.

---

## Como foi validado

**Render isolado do modal** (fora do app, com dados semeados), porque validar
dentro do app exige sessão e a sessão vive na origem de produção:

- marcar os três itens do bloco azul e desmarcar a CAPA → o `onGerar` recebeu
  `Inspeção Inicial` e 15 documentos: sem `CAPA.html`, **com**
  `VISUAL-EXTERNO.html` e `ULTRASSOM.html` na posição canônica, **sem**
  `TESTE-HIDROSTATICO.html` (o container tinha o ensaio mas não os dados — é a
  regra do item 2 funcionando) e com
  `CERTIFICADO-CAL-MANOMETRO.html?calibId=…` no fim;
- 386px e 768px, medidos: `scrollWidth === clientWidth` nos dois (zero overflow
  horizontal), rodapé presente, alvo de 44px na lista do celular, modal de
  354px no estreito e 620px a partir do tablet.

**Em produção**, depois do deploy:

- a lista com a marca vermelha do PDF, olho vermelho, lápis neutro e lixeira
  vermelha (conferido em zoom);
- o modal aberto em ZZ-TESTE-VISUAL com o bloco azul trazendo os **quatro**
  ensaios do container real "INSPEÇÃO PERIÓDICA 2026 — VS-2019-77410", cada um
  com o selo verde, e 13 documentos na lista (17 − 4);
- marcar/desmarcar nas duas listas e rolar até "LIVRO DE REGISTRO DE SEGURANÇA";
- **gerar de verdade**: com a Capa desmarcada e só "Medição de Espessura"
  marcada no bloco azul, o documento saiu com 14 páginas, começando pelo
  SUMÁRIO (sem capa) e com "7.4 Medição de espessura por ultrassom" como único
  ensaio — nem visual externo, nem interno, nem hidrostático. As escolhas do
  modal chegaram ao relatório.

O rascunho de teste não foi salvo (saí por "← Voltar"): a lista continua com o
mesmo rascunho de antes.

Suíte 2666/2666, `tsc -b` e build limpos.

## Pendência declarada

O botão "Gerar Documento" está âmbar, e não no azul da referência — decisão
registrada acima. É uma linha de CSS se o dono quiser o azul.
