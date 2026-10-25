# Direção visual — proposta para aprovação (25/10/2026)

> **Status: AGUARDANDO APROVAÇÃO.** Nenhum código do app foi alterado. Prévia navegável:
> [`preview.html`](./preview.html) (abre direto no navegador, sem servidor e sem internet).
> Base: [`docs/auditoria-ui.md`](../auditoria-ui.md).

## 0. Entradas consideradas

### Referências (`inspiracao/` e `inspiracao/referencias/`), uma a uma

| Arquivo | O que é (conferido abrindo a imagem) | O que vou aproveitar | O que descarto |
|---|---|---|---|
| `inspiracao/Captura … 135100.png` | **Firecrawl**: menu "Products" em 3 colunas | Linha de item = ícone pequeno + título + descrição curta; colunas separadas por **fio de 1px**, sem sombra; selo "New" discreto | Faixa laranja de anúncio no topo |
| `inspiracao/Captura … 135152.png` | **Firecrawl**: hero | O laranja aparece **só** no CTA e numa palavra-chave; o resto é cinza neutro; abas segmentadas (Search/Scrape/Map/Crawl) com o item ativo "elevado" | Hero de 72px, arte ASCII, grade decorativa |
| `inspiracao/Captura … 135228.png` | **Firecrawl**: documentação | **Sidebar agrupada** (Get Started, Core Endpoints, More) com rótulo de grupo pequeno e item ativo em pílula cinza; busca com `Ctrl K` no topo; cabeçalho de página de uma linha | Barra superior com duas linhas de abas |
| `inspiracao/Captura … 135243.png` | **Firecrawl**: bloco de código | Abas compactas com ícone; mono só em dado; ação secundária ("Copy code") contornada e discreta | — |
| `inspiracao/inspiracao.html` | HTML salvo da Firecrawl | Tokens: neutros por transparência (`--black-alpha-*`), três bordas (`faint/muted/loud`: #EDEDED/#E8E8E8/#E6E6E6), raio de 8px | — |
| `referencias/ref-omie-tablet.webp` | **Omie**: módulo financeiro no tablet | **Sobriedade**: fundo quase branco, cartões de ação com fio fino, **um** acento (verde-água) só no item ativo e no CTA; rail de ícones à esquerda (= sidebar recolhida); coluna lateral "Últimas movimentações" como lista leve | Grade de cartões grandes para ações (no NR-13 vira toolbar/menu); banner promocional |
| `referencias/ref-fintech-wiz.jpg` | **Wiz** (fintech) — *o nome sugerido era `ref-omie`, mas a imagem é da Wiz* | **Hierarquia de KPI**: um número dominante grande ("R$ 9.401") e os outros menores; rótulo curto acima do valor; seletor de período ("Mês") encostado no KPI | **Blocos laranja chapados** dos KPIs, roscas, sidebar branca |
| `referencias/ref-connectskins.webp` | **ConnectSkins**: painel financeiro | Sidebar escura com ícone + rótulo, item ativo com fundo levemente mais claro; barra superior fina (≈40px) com ações à direita | **Blocos chapados azul/vermelho** nos KPIs, rótulos em CAIXA ALTA, gráfico vazio ocupando metade da tela |
| `referencias/ref-innboy.webp` | **Innboy**: painel (imagem com ~370px de largura, baixa resolução) | **Tabela compacta** com cabeçalho cinza, busca e paginação na mesma faixa; KPIs pequenos numa linha só | **Blocos chapados** coloridos à esquerda (ignorar, conforme pedido) |
| *(ausente)* | **Ferramenta BIM** | Densidade e toolbar de uma linha com ícones agrupados, **pelo princípio descrito** | — *a imagem não está em `referencias/`* |
| *(ausente)* | **"Fintech azul"** além da Wiz | — | — *não há outra imagem; considerei a Wiz, que tem o gráfico azul* |

### Sistema atual (`inspiracao/atual/`, 16 capturas — produção, conta de teste, somente leitura)

Capturadas em 1440×900 e 375×812 **reais** (iframe do mesmo domínio com essas larguras; a
janela do Chrome não passava de 1044px úteis por causa da escala de 125% do Windows e do
painel lateral). Os arquivos de 1440 estão a 90% (1305×816); os de 375, a 1,2× (456×989).

| Tela | O que a captura mostra |
|---|---|
| `01-dashboard` | **Bloco vermelho chapado** de largura total para 1 vencido; 4 KPIs de **peso igual**, cada um com borda e ícone de uma cor (azul, laranja, vermelho, verde); "Abrir Agenda" laranja como CTA (navegação); metade inferior vazia. **No celular o alerta quebra o texto numa coluna de uma palavra por linha.** |
| `02-inspecoes` | **Cartões de 66px** por equipamento, nome em **laranja**, colunas CATEGORIA/PMTA quase sempre "—"; cabem ~8 itens por tela. |
| `03-clientes` | Cartões ocupando ~55% da largura, metade direita vazia; **"Excluir" vermelho em toda linha**. |
| `04-prontuarios` | Já é tabela, e é a tela mais próxima do proposto. Selos em 3 cores (âmbar, laranja, verde). |
| `05-certificados` | 3 cartões grandes; o primário "Adicionar" é **azul** e ocupa a largura toda. |
| `06-registros-seguranca` | Linhas-cartão com caixinhas de estatística; ~70% da tela vazia com 2 itens. |
| `07-relatorios-lista` | Tabela densa de ~36px (bom), mas **lixeira vermelha em toda linha** e rascunhos com borda e ícone **roxos** (4ª cor de destaque). **No celular, "CRIAÇÃO" e "VALIDADE" se sobrepõem.** |
| `08-relatorio-aberto` | Relatório finalizado: "Voltar à busca" + título em duas linhas + barra de páginas/zoom: **duas faixas** antes do PDF. |

**Nota de método.** O CLI de busca da skill ui-ux-pro-max precisa de Python, que não está
instalado aqui, e a skill proíbe instalar. As decisões seguem a Referência Rápida da skill,
citada entre crases (`color-contrast`, `primary-action`…). Os contrastes foram **calculados**
pela fórmula WCAG 2.x num script local, não estimados.

### O que o incômodo de densidade significa em pixels (hoje → proposto)

| Ponto | Hoje (medido na produção, 25/10) | Proposto |
|---|---|---|
| Cabeçalho global | **74px** a 1440 (h1 + subtítulo em 2 linhas de texto); a 1044px o subtítulo quebra e chega a **~93px**; somado ao bloco/faixa de topo de cada tela, o conteúdo começa entre **~150 e 190px** | **48px fixo**, uma linha, **sem subtítulo** (vai para o `title` do h1 e para a Central Info). "Último login" vai para o menu da conta |
| Visualizador de Relatórios | PDF começa a **189px** (1440) e **287px** (375) no relatório **finalizado**. O editor de **rascunho**, com a barra de 9 botões, é mais alto (≈250px) — não foi aberto para não gravar nada | cabeçalho 48 + **toolbar única de 44px** = **92px** (celular: 52 + 52 = 104px) |
| Linha de lista | Cartões de **66px** com colunas vazias (Inspeções); ~8 itens por tela | **40px** por linha; cabem **~16 itens** na mesma altura |
| Laranja | Nome de equipamento, CTA de navegação, eyebrow de seção, borda de cartão, ícones | **Só** na ação primária, na barra do item ativo do menu e no anel de foco |
| Cores de destaque por tela | Dashboard: 5 (azul, laranja, vermelho, verde, âmbar); Relatórios: roxo + vermelho + azul | 1 acento + semânticas só em selo de status |

---

## 1. Princípios (valem para as duas opções)

1. **Uma cor de acento.** Âmbar = "faça isto". Nunca é fundo de cartão, ícone decorativo,
   badge ou título. Uma primária por tela (`primary-action`).
2. **Semânticas só para status.** Verde/âmbar-escuro/vermelho/azul aparecem só em selos de
   situação, sempre com **ícone + texto** (`color-not-only`). Botão de perigo é vermelho só
   dentro do menu ⋯ ou do diálogo de confirmação (`destructive-emphasis`).
3. **Fio, não caixa.** Superfícies separadas por bordas de 1px. Sombra só no que flutua:
   menu, popover, modal e barra fixa (`elevation-consistent`).
4. **Densidade no escritório, toque no campo.** Controles de 32–36px no desktop e **44px**
   em toque (`touch-target-size`). Inputs com **16px** no celular (`readable-font-size`).
5. **Texto secundário legível.** Nada abaixo de 4,5:1 (`color-contrast`). O `--muted`
   atual (3,4–3,7:1) sai.
6. **Mono só em dado.** TAG, datas, pressões e espessuras em IBM Plex Mono com algarismos
   tabulares (`number-tabular`). Rótulo nunca é mono.

---

## 2. Duas opções de paleta

As duas mantêm a identidade Forja: **sidebar escura + âmbar como ação primária**. A
diferença é a temperatura dos neutros e como o âmbar se comporta no botão.

### Opção A — "Forja Compacto" (neutros quentes, âmbar vivo com texto escuro)

| Token | Hex | Uso | Contraste medido |
|---|---|---|---|
| `--bg` | `#F6F5F2` | Fundo da aplicação | — |
| `--surface` | `#FFFFFF` | Painéis, tabelas, toolbar | — |
| `--surface-2` | `#FBFAF7` | Cabeçalho de tabela, hover de linha | — |
| `--border` | `#E4E1D8` | Fios de 1px (separação) | decorativo |
| `--border-input` | `#8E897E` | Contorno de input e checkbox | **3,48:1** no branco (≥3 não-texto) |
| `--text-1` | `#1C2227` | Texto principal | 16,1:1 |
| `--text-2` | `#4F5A63` | Texto secundário, rótulos | 7,1:1 branco · 6,5:1 fundo |
| `--text-3` | `#66717A` | Metadado, placeholder | 5,0:1 branco · **4,58:1 fundo** |
| `--accent` | `#FF7A1A` | **Só** botão primário, barra ativa do menu | — |
| `--accent-hover` | `#F06A0A` | Hover do primário | 5,7:1 com `--accent-on` |
| `--accent-on` | `#241505` | Texto sobre âmbar | **6,8:1** |
| `--accent-text` | `#B4530A` | Link ativo, anel de foco | 5,0:1 |
| `--nav-bg` | `#14181C` | Sidebar | — |
| `--nav-text` / `--nav-muted` | `#C9CED3` / `#8C969F` | Itens / títulos de grupo | 11,3:1 / 5,9:1 |
| `--ok` / `--ok-bg` | `#11724B` / `#E7F4EE` | Em dia, concluído | 5,3:1 |
| `--warn` / `--warn-bg` | `#8A6100` / `#FBF3DF` | A vencer, rascunho | 5,0:1 |
| `--crit` / `--crit-bg` | `#B42318` / `#FBEAE8` | Vencido, erro | 5,7:1 |
| `--info` / `--info-bg` | `#2F5E8C` / `#EAF1F8` | Em andamento, informação | 6,0:1 |

### Opção B — "Aço Frio" (neutros frios, âmbar queimado com texto branco)

| Token | Hex | Uso | Contraste medido |
|---|---|---|---|
| `--bg` | `#F3F4F6` | Fundo | — |
| `--surface` | `#FFFFFF` | Painéis | — |
| `--surface-2` | `#F8F9FA` | Cabeçalho de tabela, hover | — |
| `--border` | `#E3E5E8` | Fios | decorativo |
| `--border-input` | `#8A919A` | Contorno de input | **3,18:1** |
| `--text-1` | `#15191E` | Principal | 17,7:1 |
| `--text-2` | `#4A525B` | Secundário | 7,9:1 |
| `--text-3` | `#636C76` | Metadado | 5,3:1 · 4,85:1 fundo |
| `--accent` | `#BC560A` | Botão primário, barra ativa | — |
| `--accent-hover` | `#A34A08` | Hover | 5,9:1 com branco |
| `--accent-on` | `#FFFFFF` | Texto sobre âmbar | **4,69:1** |
| `--accent-text` | `#A34A08` | Link ativo, foco | 5,9:1 |
| `--nav-bg` | `#111418` | Sidebar | — |
| `--nav-text` / `--nav-muted` | `#C4CAD1` / `#8A939D` | Itens / grupos | 11,2:1 / 5,9:1 |
| `--ok` / `--ok-bg` | `#137A4F` / `#E6F4ED` | | 4,7:1 |
| `--warn` / `--warn-bg` | `#8A5A00` / `#FBF2DE` | | 5,3:1 |
| `--crit` / `--crit-bg` | `#B42318` / `#FBEAE8` | | 5,7:1 |
| `--info` / `--info-bg` | `#285A8F` / `#E9F0F8` | | 6,2:1 |

> Na B, a barra ativa âmbar sobre a sidebar fica em 3,9:1 (passa como não-texto, ≥3). Na A,
> 6,8:1.

---

## 3. Tokens comuns

### Espaço (grade de 4px)
`--s-1: 4px · --s-2: 8px · --s-3: 12px · --s-4: 16px · --s-5: 20px · --s-6: 24px · --s-8: 32px · --s-10: 40px · --s-12: 48px`

| Onde | Valor |
|---|---|
| Dentro de controle (padding horizontal) | 12px (`--s-3`); botão de ícone, 0 |
| Entre controles numa toolbar | 8px |
| Entre grupos numa toolbar (com divisor de 1px) | 12px |
| Padding de célula de tabela | 0 12px |
| Padding de painel | 16px |
| Gutter de página | 20px desktop · 16px celular |
| Entre seções | 24px |

Nada de 10, 14, 18 ou ímpares: os 361 usos de `10px` mapeiam para 8 ou 12 conforme o caso.

### Tipografia
Fontes atuais mantidas e auto-hospedadas: **Space Grotesk 600** (títulos), **IBM Plex Sans**
(interface) e **IBM Plex Mono** (dados).

| Papel | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| `--fs-11` | 11 / 16 | 500 | Rótulo de grupo do menu, contador. Nunca em parágrafo |
| `--fs-12` | 12 / 16 | 400–600 | Cabeçalho de tabela, badge, metadado |
| `--fs-13` | 13 / 20 | 400 | **Corpo do desktop**, célula de tabela, controles |
| `--fs-14` | 14 / 20 | 500–600 | Título de painel, item do menu |
| `--fs-16` | 16 / 24 | 400 | **Corpo e inputs no celular**, h1 do cabeçalho |
| `--fs-20` | 20 / 28 | 600 | KPI secundário |
| `--fs-32` | 32 / 36 | 600 | KPI dominante (um por tela) |

Sete tamanhos no lugar de 33. O corpo do desktop passa de 13,5px para 13px: é a densidade
pedida, compensada pelo contraste maior do texto secundário. No celular o corpo vai para 16px.

### Raios
`--r-xs: 4px` (badge, checkbox) · `--r-sm: 6px` (botão, input) · `--r-md: 8px` (painel,
menu) · `--r-lg: 12px` (modal, sheet) · `--r-full: 999px` (avatar, ponto de status).
São cinco valores; hoje são 32.

### Sombras
| Token | Valor | Uso |
|---|---|---|
| `--sh-0` | none | Tudo o que está no fluxo (painel, tabela, cartão) |
| `--sh-1` | `0 1px 2px rgba(20,24,28,.06)` | Botão secundário, campo de busca |
| `--sh-2` | `0 8px 24px rgba(20,24,28,.12), 0 0 0 1px rgba(20,24,28,.06)` | Menu ⋯, popover, toolbar fixa |
| `--sh-3` | `0 24px 64px rgba(20,24,28,.28)` | Modal, gaveta |

### Alturas de controle
| Token | Desktop | Toque (≤640px ou `pointer: coarse`) |
|---|---|---|
| `--h-ctl-sm` (ícone em linha de tabela) | 28px | 44px |
| `--h-ctl` (botão, input, select) | **32px** | **44px** |
| `--h-ctl-lg` (primário de destaque, busca do cabeçalho) | **36px** | 44px |
| `--h-row` (linha de tabela) | **40px** | 56–64px (lista empilhada) |
| `--h-header` | **48px** | 52px + safe-area |
| `--h-toolbar` | **44px** | 52px |
| Item do menu | 32px | 44px |

### Camadas (z-index)
`base 0 · sticky 10 · toolbar fixa 20 · gaveta 30 · overlay 40 · modal 50 · toast 60`

### Pontos de quebra
`560` (celular) · `900` (tablet; sidebar vira gaveta) · `1180` (desktop) · `1440` (largo).
Quatro, no lugar de 22.

### Movimento
`--t-fast: 120ms` (hover, foco) · `--t-base: 180ms` (menu, gaveta) · curva
`cubic-bezier(.2,0,0,1)`. Só `transform` e `opacity`. Tudo desligado em
`prefers-reduced-motion`.

---

## 4. Padrões de tela mostrados na prévia

- **Sidebar agrupada e recolhível.** Cinco grupos: Operação, Documentos, Instrumentos,
  Cadastros e Ajuda. Cada grupo recolhe; a sidebar inteira recolhe para um trilho de 56px
  com ícone + `title`. O item ativo tem fundo `--nav-active` e barra âmbar de 2px. "Sair"
  fica separado no rodapé (`destructive-nav-separation`). No celular a sidebar vira gaveta,
  e uma **barra inferior** leva a Painel, Equipamentos, **Inspeções**, Relatórios e Mais.
- **Cabeçalho de 48px.** Título (+ trilha quando há nível), busca `Ctrl K`, estado de sync
  em uma palavra, notificações e avatar.
- **Painel.** Um KPI dominante (vencidos, com ícone e texto, em `--crit`) e quatro
  secundários numa faixa dividida por fios. Abaixo, a tabela de próximos vencimentos e a
  semana. Sem bloco colorido.
- **Inspeções.** Toolbar de uma linha (busca + segmentos com contagem + Filtros + primária)
  e tabela de 40px. Ações por linha: "Abrir" (ícone) + menu ⋯ (gerar relatório, duplicar,
  excluir em vermelho, separado). No celular vira lista empilhada tocável.
- **Visualizador de Relatórios.** Toolbar única de 44px: voltar, título + selo de estado,
  páginas, zoom, "Salvo hh:mm", Salvar rascunho (secundário), **Finalizar** (primário) e ⋯
  (Medições, Laudo, Configurações, Imprimir, Baixar PDF). Miniaturas recolhíveis. O PDF
  ocupa o resto da altura.

---

## 5. Recomendação: **Opção A — Forja Compacto**

**Por quê:**

1. **O incômodo é de estrutura, não de matiz.** Altura do cabeçalho, cartões gigantes,
   250px antes do PDF e laranja em tudo se resolvem com os tokens de altura, espaço e
   disciplina de acento. Eles são **idênticos** nas duas opções. Trocar a temperatura dos
   neutros não ganha nenhum pixel.
2. **O âmbar da A é o mais legível dos dois.** Texto escuro sobre `#FF7A1A` dá **6,8:1**.
   Branco sobre o âmbar queimado da B dá **4,69:1**, que passa raspando. A B só passa
   porque escurece o âmbar até ele ficar marrom-tijolo, e aí o botão primário perde o
   destaque que justifica ser a única cor da tela.
3. **Identidade e custo.** A A é o Forja de hoje, com o texto secundário corrigido e a
   escala fechada. Os tokens mapeiam 1:1 para os nomes que o código já usa (`--steel`,
   `--panel`, `--line`, `--ink`, `--amber`), então a Fase 0 da auditoria vira troca de
   valor, não de nome. A B obriga a reconferir os 407 tons literais contra uma base nova.
4. **Campo.** O neutro quente da A tem menos ofuscamento ao sol que o cinza-azulado da B,
   e o técnico enxerga o âmbar vivo do "Salvar"/"Finalizar" de longe.

**Quando escolher a B:** se a meta comercial for parecer "ERP/financeiro" (Omie, fintech)
diante de compradores corporativos. Ela é mais sóbria, mas é uma mudança de marca, não de
usabilidade.

**O que a prévia NÃO decide** (fica para depois da aprovação): ícones finais (a prévia usa
traço de 1,75px no estilo do sprite atual), modo escuro (fora de escopo) e as telas não
mostradas (ficha, memorial, formulários de campo).

---

## 6. Próximo passo, depois da aprovação

Aprovada a opção, a **Fase 0** da auditoria passa a ter valores concretos: `tokens.css`
recebe estas escalas como aliases dos nomes atuais, sem mudança visual intencional, mais o
teste de teto (hex literais, `font-size` e breakpoints fora da escala só podem cair). Nada
disso começa sem o seu ok.
