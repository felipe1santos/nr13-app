# Refino cirúrgico de `/relatorios`

**06/09/2026.** Só a lista principal e o fluxo de criação/filtro. Nada de regra
de negócio, PDF, SHA, `pdfRef`, overrides, cálculo, storage, sync, projeção ou
Livro foi tocado, e nenhuma outra tela entrou nesta rodada.

---

## 1 · A lista

O que se via numa conta real com 27 documentos: a célula do nome tinha **duas
linhas** (nome em cima, `REL-1788571268261 · atualizado em…` embaixo), o tipo era
um badge azul preenchido repetido em toda linha, e a situação era outra pílula
colorida ao lado. Três manchas de cor por linha, altura variável, e nenhuma
coluna onde procurar o número do relatório.

| | antes | depois |
|---|---|---|
| nome | duas linhas, altura variável | **uma linha**, ellipsis, nome inteiro no `title` |
| nº do relatório | embaixo do nome | **coluna própria**, monoespaçada |
| tipo | badge azul preenchido | texto azul escuro, peso 650 |
| finalizado | pílula verde | texto cinza, sem fundo |
| rascunho | badge azul | badge **roxo** — a única cor da linha |
| altura da linha | ~55px | **39px**, medidos |

Duas informações na mesma célula fazem a altura variar, e a varredura vertical
para de funcionar: o olho não sabe mais onde uma linha termina. E numa lista onde
quase tudo é "Inspeção Periódica", a mancha de cor do tipo não distingue nada —
come a atenção que a situação precisa.

**Empresa/cliente NÃO virou coluna**, e é decisão, não esquecimento: ela sai da
varredura do catálogo (`empresasPorTag`), não da projeção de relatórios, e só
existe depois que o mapa carrega. Coluna que às vezes está vazia por falta de
dado carregado é pior do que coluna que não existe. Ela entra no `title` da
célula do número.

## 2 · A barra

Ordem **filtro → busca → criar**: o que recorta a lista vem antes dela, o campo
cresce com a janela, e a ação principal fica no extremo oposto, sozinha. Antes os
três estavam à direita, na ordem criar → filtro, com o campo espremido.

`BuscaLista` ganhou um slot `antes` — sem ele, tudo que o pai passasse cairia
depois do campo, e a saída seria cada tela remontar a barra por conta própria.

O campo passou a ser **branco com borda neutra**: o cinza do `fj-search-box`
fazia o campo parecer desabilitado. No foco, borda âmbar escuro e um anel de 3px;
o **caret** também é âmbar, e é ele que pisca — que é o que o olho espera de um
campo em edição. A borda não anima.

## 3 · O filtro virou modal

O painel abria **empurrando a lista para baixo** — escolher um período fazia o
primeiro relatório sair da tela — e aplicava a cada `onChange`: mexer no "De"
disparava consulta antes de o "Até" existir, e a lista piscava um recorte que
ninguém pediu.

No modal o recorte é **rascunho até o Aplicar**, e por isso existe um "Cancelar"
de verdade — no painel antigo não havia o que cancelar, porque tudo já tinha
acontecido. Rodapé: `Limpar filtros` · `Cancelar` · `Aplicar`.

Seções: período (com atalhos este mês / este ano / últimos 12 meses), tipo,
**situação**, empresa/cliente, equipamentos e arquivados.

A SITUAÇÃO é exata **sem consulta nova**: rascunho é registro local, finalizado é
o que veio do servidor, arquivado já era o modo de lista. Nenhum filtro daqui
varre documento.

`Limpar filtros` passou a preservar o termo digitado. Antes zerava a URL inteira,
busca junto — filtro e busca são duas coisas, e o botão de uma não manda na outra.

## 4 · Criar, sem sair da rota

O caminho anterior navegava para uma tela inteira "Para qual equipamento?", e ao
voltar a lista era remontada do zero: busca, rolagem e filtro perdidos. Escolher
o equipamento não é um lugar — é uma pergunta dentro do trabalho que já estava
acontecendo.

```
/relatorios → [+ Criar relatório] → modal 1 (equipamento)
                                  → modal 2 (configuração)  ← Trocar equipamento
                                  → editor (container → documento)
```

O passo 1 é o catálogo em `modo="selecao"`. Nesse modo a **contagem de relatórios
por TAG nem chega a ser pedida ao servidor**: no cartão normal ela é o elemento
mais visível da direita, e dentro do modal de CRIAR essa é a informação errada em
destaque — responde a pergunta de outra tela e devolveria, em outro formato, a
segunda lista que a auditoria anterior removeu.

O passo 2 é o **mesmo `ModalNovaInspecao`** que o editor sempre usou: tipo,
folhas e lotes de calibração saem da lógica que já existe. Ele só ganhou o resumo
do equipamento e o caminho de volta.

Confirmar entrega tipo e documentos ao editor pelo **`state` da navegação**, não
pela URL: são dezenas de nomes de arquivo, e uma query com isso dentro seria
ilegível, quebraria ao ser copiada e viraria um segundo formato de "o que compõe
o relatório" — quando o formato de verdade é o `documentos` do registro.

## 5 · Nome do documento, editável ao finalizar

`nomeDocumento.ts`. É a **etiqueta**: o texto da lista e do arquivo baixado. Não é
identidade — o `id` do registro continua sendo o código (`REL-…`), o `sha256`
continua sendo o hash dos bytes emitidos, e o `pdfRef` continua apontando para o
mesmo objeto. É a mesma regra que o §7-ter já aplicava à renomeação de um
relatório salvo.

O campo nasce preenchido com o sugerido; quem não quiser mexer segue como antes.
O template estava escrito à mão em **dois** lugares de `Relatorios.tsx` e agora
tem um dono só — senão o nome da lista e o do arquivo baixado divergiriam.

## 6 · O que a medição pegou

`scripts/ux-responsividade.mjs`, com o CSS do build, em 1400 / 768 / 386.

| defeito | causa | correção |
|---|---|---|
| em **768px** as dez colunas transbordavam | somam 944px de mínimo + 72 de espaçamento = **1.016px**, e o cartão só valia a partir de 720: entre 721 e 1.023 a lista saía pela direita | cartão até **1.023px**; acima disso a tabela tem rolagem própria com `min-width`, porque a largura da janela não é a largura disponível (o menu lateral come ~230px) |
| botões da barra com **2px** de altura | com o rótulo escondido, "largura 44 + padding 0" não gera altura | altura declarada, e o rótulo só some em 640px — num tablet os três cabem com texto |
| cartão de **161px** | uma faixa por campo | agrupou o que é curto: **125px**, sem cortar nada |

## 7 · Dois defeitos que só o navegador pegou

**A segunda lista voltou, escondida atrás de um modal.** O modal de criar leva a
`?editor=1&tag=…`. O editor decide seu papel por "tem TAG na URL?" — que agora
respondia SIM — e caía no ramo do legado: montava o "Histórico de Relatórios"
daquele equipamento atrás do modal de container. Vir **com a escolha pronta**
passou a contar como criação.

**O tipo cru no resumo.** O passo 2 imprimia `vaso` logo abaixo do nome, enquanto
a linha ao lado, no mesmo modal, escrevia "Vaso de Pressão". `ROTULO_TIPO` virou
export.

Nenhum dos dois aparece na suíte: o primeiro é a interação entre duas telas, o
segundo é um rótulo. Estão travados agora, com o defeito descrito na asserção.

## 8 · Verificação

### Suíte

| | |
|---|---|
| gate novo | `refinoRelatorios.test.ts` — **40 asserções**, uma por item do pedido |
| `nomeDocumento.test.ts` | 9 |
| gate invertido | o de 05/09 exigia o nome em DOIS níveis; era o refino da rodada anterior e virou o defeito desta |
| total | **2.178 testes, 170 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

### Navegador, na produção logada

| | 1400px | 768px | 386px |
|---|---|---|---|
| rolagem horizontal da página | não | não | não |
| colunas da linha | 10 | 4 (cartão) | 4 (cartão) |
| altura da linha | **39px** | 126px | 126px |
| barra sai da tela | não | não | não |
| tabela com rolagem própria | `auto` | — | — |
| modal do filtro cabe | sim, ações visíveis | — | sim, 754px, corpo rolando |
| modal de criar cabe | sim | — | sim, 722px, busca fixa no topo |

### Fluxos

| | |
|---|---|
| cabeçalho | `— · Relatório · Nº relatório · TAG · Tipo · Criação · Validade · Próxima · Situação · Ações` |
| barra | `[Período e tipo] [busca] [27 resultados] [Criar relatório]` |
| filtro | abre modal centralizado, URL não muda, ESC fecha, lista intacta atrás |
| criar | modal 1 → modal 2 → `?editor=1&tag=…` com `tipo` e 13 documentos no `state` → modal do container |
| trocar equipamento | volta ao passo 1, mesma rota |
| backdrop da criação | "Novo relatório — <TAG>", **não** o histórico |
| `?legado=1&tag=` | continua abrindo o "Histórico de Relatórios" daquele equipamento |

## 9 · Limites declarados

- **empresa/cliente não virou coluna** (§4 permite não forçar): não está na
  projeção leve, e forçá-la significaria varrer o catálogo para desenhar a lista;
- a busca alcança TAG, equipamento, nome e nº do relatório — **não** empresa, pelo
  mesmo motivo. O filtro por empresa existe, e diz quando não alcança o parque
  inteiro;
- o gate lê ARQUIVO, não renderiza: a suíte roda em `environment: 'node'`, sem
  DOM. O que não dá para travar assim foi verificado no navegador e está na tabela
  acima;
- **arquivado** continua sendo uma situação da lista, não um estado no servidor
  (`arquivados.ts`, local por organização) — nada mudou nisso aqui.
