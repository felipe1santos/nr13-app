# O formulário do prontuário

**06/09/2026.** Só UX/UI e organização do formulário. Nenhuma regra de negócio,
emissão, SHA, `pdfRef`, imutabilidade ou croqui foi tocada.

---

## 1 · O que estava espalhado, e por quê

| | antes | depois |
|---|---|---|
| topo | **três faixas**: trilha "← Voltar {tag}", cabeçalho "Prontuário — {tag}", e as ações lá embaixo, no fim do formulário | **uma barra**: voltar · identificação · situação · Pré-visualizar · Salvar |
| resumo | não havia | equipamento · tipo · cliente · categoria, numa linha |
| título da seção | faixa cheia com fundo, × 7 | texto sobre o cartão, com linha fina |
| espaçamento da grade | `gap: 14px` + `padding: 14px` | `gap: 10px 12px` + `padding: 12px 14px` |
| duas grades na mesma seção | somavam dois recheios verticais | a segunda começa colada |
| campos | 31 blocos escritos à mão | um componente |
| origem do valor | indistinguível | campo automático marcado |

As ações no fim do formulário eram o defeito mais caro do conjunto: para salvar,
o usuário rolava a tela inteira de volta. Agora elas estão no topo — e o rodapé
repete **só o Salvar**, porque quem terminou de preencher está no fim da página
e mandá-lo subir seria trocar uma rolagem por outra.

Sete cabeçalhos de seção com o mesmo peso não fazem hierarquia: fazem listra. O
título perdeu a faixa e virou texto.

## 2 · A densidade, medida

Medido na produção logada, com o formulário de um vaso real (41 campos, 7
seções), reaplicando o CSS antigo por cima para comparar no mesmo documento:

| | soma das 7 seções |
|---|---|
| espaçamento antigo | **2.112px** |
| espaçamento novo | **1.859px** |
| diferença | **−253px (−12%)**, sem perder um campo |

O espaçamento caiu onde não carrega informação — entre campos, dentro da seção —
e foi **mantido** onde separa assunto: entre seções.

## 3 · Campo automático × campo digitado

`abrirEquipamento` já sabia, desde sempre, quais campos ele conseguiu preencher
a partir do memorial, da ficha do equipamento e do cadastro do cliente: o
conjunto `preenchidos`. Ele era montado e **jogado fora**.

Agora ele chega à tela — filtrado pelo que importa:

> Um campo que o memorial preencheu **mas que o usuário já editou** mostra o
> valor DELE. Marcá-lo como automático mentiria sobre a origem do dado. Só conta
> como automático o campo em que o valor final ainda é o do sistema.

| estado | como aparece |
|---|---|
| veio do sistema | fundo acinzentado, borda tracejada, selo `auto` com a explicação no tooltip |
| em foco | volta a branco, borda sólida — é um campo em edição |
| depois de digitar | o selo some: o valor deixou de ser do sistema |

**O campo continua totalmente editável.** Nada de `disabled`: o valor do sistema
é ponto de partida, não sentença. Medido na conta real: **21 dos 41 campos**
marcados como automáticos num vaso com memorial e cliente cadastrados.

## 4 · Os 31 campos viraram um componente

Escritos à mão, eles eram exatamente o que impedia uma mudança transversal —
como a marca de campo automático — de acontecer sem editar 31 lugares e esquecer
um. A conversão foi mecânica e conferida antes de rodar: o padrão era idêntico
nos 31, e `largo` e o campo do estado saem do próprio markup. Nada foi
adivinhado; o script recusava rodar se o número não batesse.

## 5 · A grade sem buraco

O pedido nomeou o caso: *"Razão social → largura total; CNPJ + Telefone → mesma
linha; Cidade + Estado → mesma linha; Endereço → largura total."*

A ordem era Razão (largo) · CNPJ · Endereço (largo) · Cidade · Estado ·
Telefone. Como o campo largo quebra a linha, **o CNPJ ficava sozinho** com meia
linha vazia ao lado — e o Telefone também. Agora os curtos vêm em pares entre os
largos.

Colunas: **3** no desktop largo (blocos de campo curto: pressões, materiais),
**2** em telas médias, **1** no celular.

## 6 · Croqui

A seção "Dimensões e Croqui 2D" e o botão do editor continuam onde estavam, com
teste. O que mudou ali é o mesmo do resto: espaçamento e título da seção.

## 7 · Verificação

### Produção logada, formulário de um vaso real

| | |
|---|---|
| barra | `← Voltar` · `Prontuário — ZZ-FASE3 / rascunho` · `Pré-visualizar` · `Salvar rascunho` |
| altura do topo (barra + resumo) | **93px** |
| resumo | `EQUIPAMENTO · TIPO · CLIENTE · CATEGORIA`, preenchido |
| seções | as 7, na ordem |
| campos | 41, sendo **21 automáticos** |
| grade | 2 colunas; `gap: 10px 12px`; a segunda grade da seção com `padding-top: 0` |
| rolagem horizontal | não |

### Três larguras

| | 1400 | 768 | 386 |
|---|---|---|---|
| rolagem horizontal | não | não | não |
| colunas da grade | 2 | 1 | 1 |
| altura do input | 32px | 32px | **40px** (alvo de toque) |
| barra sai da tela | não | não | não |

O resumo passa a **2 colunas** em ≤640px: quatro itens empilhados custavam
quatro linhas e o topo chegava a 212px — um terço da tela de um celular antes do
primeiro campo. Regra conferida no CSS servido em produção
(`.pront-resumo{grid-template-columns:1fr 1fr;…;display:grid}`).

### Suíte

| | |
|---|---|
| gates novos | 14 asserções (barra, resumo, rodapé, campo automático, densidade, grade, croqui) |
| total | **2.274 testes, 174 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 8 · Pendências declaradas

- **a medição do topo em 386px na tela LOGADA não completou.** O harness de
  iframe aninhado trava nessa rota (o formulário monta iframes próprios). O que
  ficou provado para essa largura: a regra está no CSS servido, e a medição
  headless com esse mesmo CSS não acusa transbordo. O número exato do topo em
  386px na conta real não foi medido depois da última correção;
- **o "auto" é da abertura.** Se o memorial mudar enquanto o formulário está
  aberto, a marca não se atualiza sozinha — ela é recalculada na próxima
  abertura do equipamento;
- **o formulário não é bloqueado depois de emitido.** A imutabilidade do
  documento continua sendo do ARQUIVO (§7-quater): o PDF emitido não é
  regenerado, e editar os dados depois produz uma nova revisão, não altera a
  anterior. Travar os campos seria mudança de regra, e não foi pedido.
