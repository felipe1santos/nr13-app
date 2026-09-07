# Prontuários por documento, Calibrações em modal, barras compactas

**06/09/2026.** Nada de PDF emitido, SHA, `pdfRef`, histórico arquivado, Livro,
cálculo ou croqui foi tocado. `excluirProntuario` continua sem apagar emissões
nem croqui, e há teste lendo o corpo da função.

---

## 1 · Prontuários: uma linha por DOCUMENTO

A lista mostrava um **equipamento** por linha, com um selo "Prontuário OK". Um
equipamento com três revisões emitidas era uma linha só, e as duas anteriores —
documentos assinados, com `pdfRef` e SHA-256 próprios — não tinham onde ser
vistas. A tela dizia *"existe prontuário"* quando a pergunta é *"quais
documentos existem"*.

| | antes | depois |
|---|---|---|
| unidade da linha | equipamento | **documento** (cada revisão, cada rascunho) |
| revisões anteriores | invisíveis | uma linha cada, com `Rev. NN` |
| rascunho | invisível até abrir o equipamento | linha própria, com data |
| colunas | equipamento · tipo · empresa · categoria | documento · TAG · cliente · **revisão** · data · situação |

### De onde vêm as linhas

`indiceProntuarios` — uma chave global e leve, o mesmo desenho de
`nr13_rascunhos` (§10B.1) e do §7-sexies. As duas alternativas foram descartadas
por motivo, não por gosto:

- **varrer `nr13_pront_emitido_*`** só enxerga o que este aparelho hidratou, e
  sob boot leve (9D) isso é uma fração do parque. A lista ficaria incompleta em
  silêncio — o relato de "sumiu" com outro nome;
- **a projeção do servidor** tem `temProntuario`, um BOOLEANO. Sabe que existe;
  não sabe quantos, nem quando, nem qual revisão.

Sem migração de banco: é uma chave, sincroniza pela v2, ~200 bytes por entrada, e
cresce com o número de DOCUMENTOS — não com o parque.

O índice é **derivado e nunca é a única cópia**. `reconciliar` o reconstrói das
chaves do aparelho, roda uma vez ao abrir a lista, é idempotente e **só
acrescenta**: reescrevê-lo a partir do que há aqui apagaria documentos vindos de
outro aparelho.

### Rascunho e emitido

| ação | o que acontece |
|---|---|
| Salvar | grava os dados e a linha de RASCUNHO. Sobrevive a fechar o navegador e volta em outro aparelho |
| Emitir | grava a linha da REVISÃO e encerra o rascunho. A posição na lista É o número da revisão, porque `registrarEmissao` nunca sobrescreve |
| Abrir da lista | rascunho → formulário; emitido → o arquivo daquela emissão (§7-quater) |

## 2 · A exclusão saiu da barra

Era um botão vermelho do mesmo tamanho dos outros, que virava "Confirmar
Exclusão" no primeiro clique — uma confirmação que não explicava nada, no lugar
do botão que a disparou.

Prontuário não é descartável: é o cadastro técnico do equipamento, e depois de
emitido há PDFs com código de verificação apontando para ele. A exclusão vive no
menu **"Mais ações"**, separada por uma linha, como último item, e abre o modal
que diz o que **não** é apagado — os PDFs já emitidos e o croqui.

## 3 · A barra do visualizador

Eram três faixas — trilha, cabeçalho com título, e uma linha com até seis botões
iguais — mais dois selects de assinatura, tudo acima do documento.

Virou **uma linha**: voltar · identificação · `Editar` · `Emitir` · `⋯`. Os
assinantes ficam recolhidos, com resumo de quem assina — eles são escolhidos uma
vez, não a cada abertura. Medido em produção: **95px** de topo inteiro,
incluindo os assinantes.

## 4 · Calibrações

| defeito | correção |
|---|---|
| o formulário do componente nascia INLINE embaixo do painel: "+ Adicionar" empurrava os lotes para baixo e, no celular, abria os campos fora da primeira tela — o usuário clicava e nada parecia acontecer | **modal central**, foco no campo do nome, mesma regra de salvar |
| painel de filtros sempre aberto entre a busca e a lista | **modal**, e o MESMO dos prontuários: são a mesma pergunta em duas telas |
| cabeçalho "Selecione o Equipamento" | saiu — o título da página já diz Calibrações, e a faixa custava 40px em toda visita |
| parágrafo explicativo fixo | virou "Como funciona" |

## 5 · Ajuda contextual, com ilustração

Os três parágrafos de Certificados e o de Calibrações explicavam **em toda
visita** algo que se lê uma vez, e empurravam o trabalho para baixo da dobra.

O texto foi **reaproveitado**, não jogado fora: virou quatro passos numerados,
com ilustração. Ele estava certo, estava no lugar errado.

### As ilustrações

SVG no próprio componente — sem arquivo, sem requisição, sem dependência —, de
traço, na paleta do tema, com cor só onde a atenção deve cair. Aparecem em dois
lugares apenas: **a ajuda pedida** e o **estado vazio de primeira visita**. Nunca
sobre uma lista com conteúdo.

## 6 · Dois defeitos que só a produção pegou

A varredura por prefixo `nr13_prontuario_` casa com mais do que os dados:

| chave irmã | o que é | como apareceu |
|---|---|---|
| `nr13_prontuario_meta_<TAG>` | número e data do documento (§8) | linha `meta_COMPRESSOR V8-15/200L`, sem cliente, data 01/01/1970 |
| `nr13_prontuario_assinantes_<TAG>` | quem assina | idem |
| `nr13_prontuario_atual` | cópia de trabalho que os templates leem | linha da TAG "atual" |

Duas correções:

1. o teste não é o nome da chave, é o **conteúdo**: `ProntuarioDados` carrega a
   própria TAG, e ela tem que bater com a do nome da chave. Um registro que não
   sabe de quem é não vira linha;
2. uma **tabela explícita** de chaves irmãs — o mesmo motivo de `familiasChave`
   existir no armazenamento: dedução por regex errou lá, e erraria aqui na
   primeira TAG que começasse com uma dessas palavras. Há teste para `ATUAL-01` e
   `metalurgica` não serem confundidas.

E **purga** das linhas já gravadas, com critério estreito: só rascunho, com TAG
de chave irmã, E sem registro de dados. Um equipamento de verdade falha nas três.

Sem `criadoEm`, a data fica **vazia**. O `new Date(0)` imprimia 01/01/1970 — um
dado falso é pior do que um travessão.

## 7 · Verificação em produção

Bundle `assets/index-Dz4dyb99.js`.

| item | resultado |
|---|---|
| lista canônica | 4 linhas: **2 revisões** do mesmo equipamento + 2 rascunhos, **0 fantasmas** |
| criar | modal "Selecione o equipamento", URL inalterada, lista atrás |
| filtro | modal, opções "Todos os documentos / Só emitidos / Só rascunhos" |
| rascunho persiste | salvei, recarreguei: linha RASCUNHO com data de hoje e o número |
| emitido | abre com `rev. 02`, código de verificação e "Emitir revisão" |
| croqui (vaso) | "Croqui 2D do Equipamento" presente no formulário |
| barra do visualizador | `Editar` · `Emitir` · `⋯`; topo de 95px; assinantes recolhidos |
| menu ⋯ | Imprimir · separador · **Excluir prontuário…** (último) |
| Calibrações | barra única, sem painel exposto, sem "Selecione o Equipamento" |
| modal do componente | centralizado, foco no nome, Cancelar/Salvar |
| ajuda | 4 passos + ilustração com rótulo de leitor de tela |
| 386px | prontuários, calibrações e certificados: **sem transbordo**, botões de 44px |

## 8 · Verificação automatizada

| | |
|---|---|
| índice | `indiceProntuarios.test.ts` — 21 asserções |
| calibrações | `uxCalibracoes.test.ts` — 16 |
| prontuários | `uxProntuarios.test.ts` — atualizado para a lista nova |
| suíte | **2.260 testes, 174 arquivos, 0 falhas** |

## 9 · Pendências declaradas

- **o índice é local até alguém abrir a tela.** `reconciliar` roda no cliente:
  uma organização cujos aparelhos nunca abriram `/prontuarios` ainda não tem o
  índice populado. Ele se preenche na primeira visita e sincroniza dali em
  diante;
- **as colunas do documento vêm do índice**, gravadas no momento em que a linha
  nasce. Renomear o equipamento depois não reescreve as linhas antigas — o que é
  o comportamento certo para um documento emitido (ele registra o que era), e
  discutível para um rascunho;
- **Inspeções não foi tocada** nesta rodada: a auditoria não encontrou lá painel
  de filtro exposto nem faixa explicativa fixa — a tela já tinha barra única e um
  primário por região desde a auditoria de 06/09 pela manhã.
