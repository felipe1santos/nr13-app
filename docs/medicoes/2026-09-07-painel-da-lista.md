# O painel da lista — presença visual e piso de altura

**07/09/2026.** Rodada final de UX. Nenhuma documentação técnica tocada: PDF,
memorial, fórmulas, SHA, `pdfRef`, bytes arquivados, histórico, Livro como regra
documental e certificados arquivados seguem exatamente como estavam.

---

## 1 · O defeito que só aparece com pouco conteúdo

As rodadas anteriores mediram a tela CHEIA — largura, altura até o conteúdo,
transbordo. Com poucos itens, dois problemas ficam visíveis e nenhum deles
aparece naquelas medições:

1. **a caixa branca terminava logo abaixo da última linha.** Três documentos numa
   tela de 900px produzem uma faixa branca curta boiando num vão cinza. A tela
   não parece uma seção do sistema — parece um erro de carregamento;
2. **a lista não tinha cabeçalho próprio.** O nome da seção vem da topbar, que
   fica longe, e entre ela e a primeira linha havia só a barra de busca.

## 2 · A correção usa o idioma que já existia

O filete âmbar vertical não é vocabulário novo: ele já estava em
`.bloco-dados h3::before` (blocos de formulário) e em `.fj-panel-head::before`
(Dashboard, Livro, Vencimentos). O que faltava era aplicá-lo nas listas
refinadas, que usam `bloco-dados` sem `h3` e por isso não tinham nem cabeçalho
nem acento.

`.painel-lista`, em `forja.css`:

| | |
|---|---|
| piso | `min-height: min(58vh, 520px)` — `min-height`, não `height`: com muitos itens o painel cresce normalmente |
| cabeçalho | filete âmbar de 3px + nome da seção + subtítulo curto |
| contagem | badge roxo à direita — é o número que o olho procura |
| celular | o piso **sai de cena**: lá a altura da janela é o recurso escasso |

Aplicado em `/relatorios`, `/prontuarios` e `/inspecoes`.

## 3 · Livro de Registro — auditado, quase nada a fazer

Ele **já é** o idioma de referência: `fj-panel` + `fj-panel-head` com o filete
âmbar e o `fj-eyebrow` ("NR-13 · 13.4.1.9"). A única inconsistência era a busca
não-compacta, que punha a contagem numa faixa própria de 26px abaixo do campo —
a mesma banda que saiu das outras telas. Agora ela é compacta, com o campo
branco e o foco âmbar do padrão.

O texto explicativo do rodapé (`fj-panel-foot`) **ficou**: ele está embaixo, não
empurra conteúdo nenhum, e movê-lo para um modal seria mexer por mexer.

## 4 · Medido em produção

| tela | largura | painel com poucos itens | filete âmbar | transbordo |
|---|---|---|---|---|
| `/prontuarios` | 1.290px | **448px** com 4 linhas | `rgb(255,122,26)` | não |
| `/inspecoes` | 1.290px | **505px** com 5 cards | `rgb(255,122,26)` | não |
| `/livro-registro` | 1.290px | busca compacta, 146px até a tabela | `rgb(255,122,26)` | não |

Cabeçalhos: "Prontuários e revisões · 4 linhas", "Equipamentos · 5 equipamentos".

### Três larguras

1400 / 768 / 386: sem rolagem horizontal; botão de ação com 34px no desktop e
44px no celular.

### Suíte

**2.305 testes, 175 arquivos, 0 falhas.** `tsc -b` e `vite build` limpos.

## 5 · Sobre a largura (§3)

O pedido fala em "70% a 80% da largura útil". Medido: a área de conteúdo
(`.main-content`, já sem a barra lateral) tem 1.290px na janela usada, e a
página tem `max-width: 1400px` — ou seja, **usa os 1.290 inteiros**, com 20px de
respiro lateral por dentro (`padding`). Numa janela maior, com 1.674px de área,
a página fica em 1.400 — **84%**.

Não estreitei para bater 70–80% em toda janela: a queixa que abriu a rodada
anterior era exatamente a lista parecer uma faixa estreita no centro, e o
respiro pedido ("sem encostar nas bordas") é o que o `padding` já garante.

## 6 · O que NÃO mexi, e por quê

- **as telas de cadastro, Agenda, Dashboard, Acessos e Equipamentos**: a
  auditoria procurou nelas o defeito desta rodada — painel curto sem cabeçalho,
  toolbar empilhada, shell estreito — e não encontrou. Todas já usam `fj-panel`
  com cabeçalho e acento, ou `cad-page` com barra única. Mexer seria o redesenho
  gratuito que o próprio pedido proíbe;
- **o visualizador de PDF** (miniaturas, zoom): §20 da rodada anterior pediu
  miniaturas fechadas por padrão, mas elas são do componente de prévia — parte do
  caminho do documento, que estas duas rodadas mandaram preservar. Segue
  registrado como próximo passo;
- **o `fj-panel-foot` do Livro**: texto de rodapé, não empurra nada.
