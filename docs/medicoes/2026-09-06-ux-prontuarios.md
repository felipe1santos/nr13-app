# UX de `/prontuarios`

**06/09/2026.** A mesma lógica de navegação de `/relatorios`, com a identidade
dos prontuários preservada. Nada de conteúdo técnico, PDF emitido, SHA, `pdfRef`,
croqui, certificados, Livro, cálculo ou sync foi tocado.

---

## 1 · Auditoria de duplicidade

| # | onde | o que é | classificação | fica? |
|---|---|---|---|---|
| 1 | `/prontuarios`, `tela === 'equipamentos'` | a lista | **canônica** | sim |
| 2 | `/prontuarios`, `tela === 'selecao'` | escolher equipamento para criar | **duplicada** — tela inteira, com trilha e voltar, no meio do caminho de criar | **virou modal** |
| 3 | `portal/PortalAtivo` | prontuário no Portal do Cliente | outra aplicação, somente leitura | sim |
| 4 | `Equipamento.tsx`, `ProntuarioFabricante` | o prontuário do FABRICANTE (anexo do equipamento) | outra coisa, mesmo nome | sim |
| 5 | `LivroRegistro`, `ModalNovaInspecao` | leem prontuário, não listam | helpers | sim |

**Havia duplicidade escondida? SIM** — a mesma classe do defeito de
`/relatorios`, um tamanho menor: escolher o equipamento era uma TELA, e voltar
dela remontava a lista do zero (busca e rolagem perdidas).

Uma diferença de modelo que vale registrar: **prontuário é UM por equipamento**
(`nr13_prontuario_<TAG>`), com N emissões (`nr13_pront_emitido_<TAG>`, Fase 12).
Não é como relatório, que é N por equipamento. Por isso a linha da lista É o
prontuário daquele equipamento — não havia uma lista "de documentos" escondida
em outro lugar.

## 2 · O que a tela tinha antes da primeira linha

Três faixas empilhadas:

1. cabeçalho com o título "Prontuários salvos" e o botão de criar;
2. a busca, numa faixa própria;
3. um painel com três filtros **sempre abertos** (tipo, empresa, "só com
   prontuário").

Em 386px o painel empilhava de novo e empurrava a lista para fora da primeira
tela. Agora: **uma barra** (filtro · busca · criar), **um cabeçalho de colunas**,
e a lista.

## 3 · A linha

| coluna | de onde vem |
|---|---|
| equipamento (nome + TAG) | projeção |
| tipo | projeção |
| empresa / cliente | projeção |
| categoria | projeção |
| **emitido em** | `nr13_pront_emitido_<TAG>`, local |
| **situação** | emissão + `temProntuario` |
| ações | — |

A linha **deixou de ser um `<button>`**: ela passou a ter botões dentro, e botão
dentro de botão é HTML inválido — o clique de fora engoliria o de dentro.

### O custo da coluna nova

`emissaoAtual(tag)` lê um array de ~180 bytes por revisão, do cache em memória,
e **só para as linhas renderizadas** — a lista é virtualizada, então são ~15, não
o parque inteiro. O que a 9F.2 tirou desta tela foi `carregarProntuario(tag)` no
render (6,6 KB de `JSON.parse` por cartão, 25,7 KB no maior), e isso **não
voltou**.

### Situação

| selo | significa | visual |
|---|---|---|
| **EMITIDO** | há PDF arquivado com SHA | verde, com fundo — é o único |
| SALVO | dados cadastrados, sem emissão | texto âmbar |
| SEM PRONTUÁRIO | ausência **medida** | texto cinza |
| *(nada)* | `temProntuario === null` | travessão |

`null` continua sendo `null`: sem selo, porque ninguém verificou. Só o estado que
vale como documento tem fundo; os outros são a regra e a ausência, não notícia.

## 4 · O filtro

Modal, com situação, tipo, empresa e categoria. Rascunho até o "Aplicar" — é o
que dá sentido ao "Cancelar".

**O padrão da tela não é o filtro vazio.** `/prontuarios` abre mostrando quem TEM
prontuário, então "Limpar filtros" volta a esse estado: limpar não pode
transformar a lista de prontuários na lista de equipamentos.

**"Sem prontuário ainda"** é a lista do que falta — e ali o `null` **sai**. Dizer
que falta prontuário num equipamento que ninguém verificou mandaria o usuário
refazer um documento que talvez exista. As duas opções tratam o não-medido pelo
lado seguro, e os lados seguros são opostos. A regra vive em `filtrarCatalogo`,
com teste.

## 5 · Criar

```
/prontuarios → [+ Criar prontuário] → modal (equipamento) → prontuário
```

A lista continua atrás, no mesmo estado. O catálogo em `modo="selecao"` nasce sem
recorte: quem vai criar o PRIMEIRO prontuário de um equipamento não pode ser
filtrado para fora da própria lista.

**A moldura do modal é a MESMA de `/relatorios`** — overlay, cabeçalho, ESC e
armadilha de foco. O catálogo entra por dentro, que é a única parte diferente
entre os dois módulos. Duas molduras quase iguais seriam a próxima correção feita
num lugar e esquecida no outro.

## 6 · Excluir

Usa a `excluirProntuario` de sempre. O modal diz o que **não** é apagado, porque
a diferença muda a decisão de quem clica:

- os **PDFs já emitidos**, com o código de verificação de cada um — documento
  emitido é arquivo imutável (Fase 12);
- o **croqui 2D** (`nr13_croqui2d_`, `nr13_modelo3d_`) — ele é do equipamento,
  não do documento, e refazer o prontuário reaproveita o desenho.

Há teste lendo o corpo de `excluirProntuario` para garantir que os dois ficam de
fora.

## 7 · O croqui, verificado

| | |
|---|---|
| prontuário de vaso (ZZ-FASE3) | abriu com **4 páginas** — o layout do vaso, que inclui a folha do croqui |
| botão "Croqui 2D do Equipamento" | presente no formulário |
| editor de croqui | abre, com preview ao vivo (32 SVGs na tela) |
| `excluirProntuario` | não toca `nr13_croqui2d_` nem `nr13_modelo3d_` |

## 8 · Responsividade, medida na produção logada

| | 1400px | 768px | 386px |
|---|---|---|---|
| rolagem horizontal | não | não | não |
| colunas da linha | **8** | 3 (cartão) | 3 (cartão) |
| altura da linha | **46px** | 111px | 111px |
| cabeçalho de colunas | visível | escondido | escondido |
| barra sai da tela | não | não | não |
| botões da barra | com rótulo | com rótulo | **44px, quadrados** |

## 9 · O que a medição corrigiu no próprio medidor

`scripts/ux-responsividade.mjs` reprovava 768 e 386 por **10px**: ele comparava
`clientWidth` (que **exclui** a barra de rolagem) com a largura pedida, e a
página tinha crescido o bastante para ganhar barra vertical. Passou a conferir
por `innerWidth`, que a inclui. Um medidor que reprova o que está certo é pior do
que não medir — ele ensina a ignorar o resultado.

## 10 · Um defeito de texto encontrado no caminho

O formulário dizia **"Novo Prontuário — TAG"** mesmo ao editar um prontuário já
EMITIDO: o cabeçalho contava uma história diferente da que o botão "Emitir" e o
selo da lista contavam. Passou a depender de o prontuário já existir.

## 11 · Verificação

| | |
|---|---|
| gates novos | `uxProntuarios.test.ts`, **23 asserções** |
| suíte | **2.212 testes, 171 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
| produção | conferida pelo conteúdo do bundle servido |

## 12 · Pendências declaradas

- **empresa, categoria e situação são recorte do CLIENTE**, sobre as páginas já
  carregadas: `buscar_equipamentos` não tem esses parâmetros. Enquanto a
  varredura não alcança o parque inteiro, o modal **diz isso** — filtro que
  esconde linha calado é o mesmo relato de dado sumido, com outro nome. Levar
  para o servidor é coluna e índice novos, e continua registrado como
  continuação (Fase 10A);
- **"Emitido em" só enxerga o que está neste aparelho**: as emissões são chave
  por TAG no armazenamento, não coluna da projeção. Num aparelho novo, antes da
  hidratação, a coluna mostra travessão e o selo cai para SALVO. Não inventa
  data;
- a data de **criação/última atualização do cadastro** (não da emissão) não
  entrou: ela está dentro de `nr13_prontuario_<TAG>`, e lê-la por linha é
  exatamente o `JSON.parse` por cartão que a 9F.2 removeu.
