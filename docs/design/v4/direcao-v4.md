# Direção visual v4: consolidação (25/10/2026)

> **Status: AGUARDANDO APROVAÇÃO.** Substitui a v3. Nenhum código do app foi alterado e nada
> foi commitado.
>
> Prévia: [`preview-v4.html`](./preview-v4.html). Abre direto, sem internet, e tem 209 KB com as
> fontes embutidas. Seletores na prévia:
> - aparelho: desktop / celular de 390px;
> - tela: Painel, Inspeções, Relatório, Clientes, Modal do cliente;
> - modo do modal: Leitura / Edição;
> - botão "Mostrar contraste".
>
> Não há seletor de paleta: a paleta está decidida.

## 1. Decisão aplicada

| Tema | Decisão |
|---|---|
| Paleta | **v1 Opção B "Aço Frio"**, sem variação nenhuma. Sai o marinho da v2, sai o laranja Wiz da v3, sai todo botão azul |
| Tipografia | **v2 combinação 1**: Inter na interface. JetBrains Mono tabular **só** em TAG, datas e números de tabela. Escala 11 · 12 · 13 · 14 · 16 · 20 · 32 |
| Estrutura | **v2**: telas, tabelas, abas segmentadas e KPIs compactos numa faixa |
| Forma | **v3**: botões e selos retos, raio 4–6, sem borda. Input e botão secundário com 1px e raio 6 |
| Sidebar, cabeçalho 48px, toolbar 44px e menu ⋯ | **v1, copiados**. Muda só a fonte, mais a correção do menu (seção 5) |
| Ativo (aba, chip, filtro) | **`#BC560A` com texto branco** |
| Cor semântica | **Só em selo e ponto**, sempre com ícone e texto |
| Modal | Raio 8, sem cartão com borda dentro, overlay cobrindo a tela inteira (cabeçalho incluído), z-index nomeado |

## 2. Tokens

### Cor

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#F3F4F6` | fundo da aplicação |
| `--surface` | `#FFFFFF` | cartões, cabeçalho, toolbar, modal |
| `--surface-2` | `#F8F9FA` | cabeçalho de tabela, hover de linha, busca do cabeçalho |
| `--surface-3` | `#EEF0F2` | trilho das abas, chip inativo, selo neutro, avatar |
| `--border` | `#E3E5E8` | fios de separação |
| `--border-input` | `#8A919A` | borda de input, botão secundário e checkbox |
| `--text-1` / `-2` / `-3` | `#15191E` / `#4A525B` / `#636C76` | texto principal / secundário / terciário |
| `--accent` | **`#BC560A`** | botão primário, aba/chip ativo, barra do item ativo, logo, linha do gráfico, alternador ligado |
| `--accent-hover` | `#A34A08` | hover do primário |
| `--accent-on` | `#FFFFFF` | texto sobre o acento |
| `--accent-text` | `#A34A08` | link |
| `--focus` | `#BC560A` | anel de foco (2px) |
| `--nav-bg` · `-hover` · `-active` | `#111418` · `#1A1F25` · `#222831` | sidebar |
| `--nav-text` · `-muted` · `-line` | `#C4CAD1` · `#8A939D` · `#232930` | sidebar |
| `--ok` / `--ok-bg` | `#137A4F` / `#E6F4ED` | selo "Em dia", "Emitido", "Ativo"; variação positiva |
| `--warn` / `--warn-bg` | `#8A5A00` / `#FBF2DE` | selo "A vencer", "Rascunho", "Editando" |
| `--crit` / `--crit-bg` | `#B42318` / `#FBEAE8` | selo "Vencido", ponto crítico, erro de campo, perigo |
| `--info` / `--info-bg` | `#285A8F` / `#E9F0F8` | selo "Agendada", "Em andamento" |
| `--viewer-bg` | `#D5D8DD` | fundo do visualizador de PDF |

O valor de cada token é o mesmo de [`../direcao.md`](../direcao.md), Opção B.

### Tipografia

| Papel | Tamanho / linha | Peso | Família |
|---|---|---|---|
| KPI dominante | 32 / 36 | 600 | Inter, algarismos tabulares |
| KPI | 20 / 28 | 600 | Inter, algarismos tabulares |
| Título do cabeçalho e do modal | 16 / 24 | 600 | Inter |
| Título de cartão | 14 / 20 | 600 | Inter |
| Valor em leitura (modal) | 14 / 20 | 400 | Inter |
| Corpo, célula, botão | 13 / 20 | 400 (botão 500, primário 600) | Inter |
| Rótulo, selo, legenda | 12 / 16 | 500 | Inter |
| Cabeçalho de tabela | 11 / 16, CAIXA ALTA, +0,05em | 600 | Inter |
| TAG, datas, CNPJ, telefone, números de tabela | 13 (TAG 500) | 400/500 | JetBrains Mono |

No celular o corpo vai para 16px, e inputs e selects também (o iOS não dá zoom).

### Forma, medidas e camadas

| Token | Valor | Uso |
|---|---|---|
| `--r-xs` | 4px | selo, checkbox, `kbd` |
| `--r-sm` | 6px | botão, input, chip, abas, item da sidebar |
| `--r-md` | 8px | cartão, menu, **modal** |
| Bordas | botão primário, selo, chip e aba: **0**; input e botão secundário: **1px** | |
| `--h-header` / `--h-toolbar` | 48 / 44px (celular 52 / 52) | |
| `--h-ctl` / `--h-row` | 32 / 40px (toque: 44) | |
| `--z-sticky` · `--z-menu` · `--z-overlay` · `--z-modal` · `--z-painel` | 10 · 30 · 40 · 50 · 60 | camadas nomeadas |
| `--sh-1` · `--sh-2` · `--sh-3` | botão secundário · menu · modal | uma sombra por camada |

## 3. Contraste (calculado, WCAG 2.x)

São **34 pares em uso, e todos passam**:
- menor par de texto: **4,67:1** (texto 3 sobre superfície 3);
- menor par não-texto: **3,16:1** (barra laranja sobre o item ativo da sidebar).

Os dois pares "não ocorre" no fim da tabela foram medidos para mostrar **por que** não aparecem
no layout:
- a borda de campo sobre o fundo cinza dá 2,89:1, abaixo de 3. Por isso todo campo fica em
  superfície branca. Pela mesma razão tirei o botão secundário "Agenda" da barra do Painel,
  que ficava direto no cinza. O link "Agenda" continua no cartão "Esta semana";
- o acento como texto sobre o fundo dá 4,27:1. Por isso o link usa `#A34A08`.

| Par | Cores | Razão | Mínimo | |
|---|---|---|---|---|
| Texto 1 / fundo | `#15191E` / `#F3F4F6` | **16,04:1** | 4,5 | ✓ |
| Texto 1 / superfície | `#15191E` / `#FFFFFF` | **17,65:1** | 4,5 | ✓ |
| Texto 2 / fundo | `#4A525B` / `#F3F4F6` | **7,20:1** | 4,5 | ✓ |
| Texto 2 / superfície | `#4A525B` / `#FFFFFF` | **7,93:1** | 4,5 | ✓ |
| Texto 2 / superfície 3 (trilho de abas, chip, selo neutro) | `#4A525B` / `#EEF0F2` | **6,94:1** | 4,5 | ✓ |
| Texto 3 / fundo | `#636C76` / `#F3F4F6` | **4,85:1** | 4,5 | ✓ |
| Texto 3 / superfície | `#636C76` / `#FFFFFF` | **5,33:1** | 4,5 | ✓ |
| Texto 3 / superfície 2 (cabeçalho de tabela, busca) | `#636C76` / `#F8F9FA` | **5,06:1** | 4,5 | ✓ |
| Texto 3 / superfície 3 | `#636C76` / `#EEF0F2` | **4,67:1** | 4,5 | ✓ |
| Branco sobre acento (botão primário, aba/chip ativo) | `#FFFFFF` / `#BC560A` | **4,69:1** | 4,5 | ✓ |
| Branco sobre acento hover | `#FFFFFF` / `#A34A08` | **5,93:1** | 4,5 | ✓ |
| Link / superfície | `#A34A08` / `#FFFFFF` | **5,93:1** | 4,5 | ✓ |
| Link / fundo | `#A34A08` / `#F3F4F6` | **5,39:1** | 4,5 | ✓ |
| OK / selo | `#137A4F` / `#E6F4ED` | **4,72:1** | 4,5 | ✓ |
| Alerta / selo | `#8A5A00` / `#FBF2DE` | **5,32:1** | 4,5 | ✓ |
| Crítico / selo | `#B42318` / `#FBEAE8` | **5,65:1** | 4,5 | ✓ |
| Info / selo | `#285A8F` / `#E9F0F8` | **6,20:1** | 4,5 | ✓ |
| Crítico (botão perigo, erro de campo) / superfície | `#B42318` / `#FFFFFF` | **6,57:1** | 4,5 | ✓ |
| Sidebar: texto | `#C4CAD1` / `#111418` | **11,18:1** | 4,5 | ✓ |
| Sidebar: rótulo de grupo e contador | `#8A939D` / `#111418` | **5,93:1** | 4,5 | ✓ |
| Sidebar: contador de vencidos | `#F3A39C` / `#111418` | **9,26:1** | 4,5 | ✓ |
| Sidebar: item ativo (branco) | `#FFFFFF` / `#222831` | **14,83:1** | 4,5 | ✓ |
| Sidebar: hover | `#C4CAD1` / `#1A1F25` | **10,04:1** | 4,5 | ✓ |
| Branco sobre texto 1 (balão de dica) | `#FFFFFF` / `#15191E` | **17,65:1** | 4,5 | ✓ |
| Borda de campo e botão secundário / superfície | `#8A919A` / `#FFFFFF` | **3,18:1** | 3 | ✓ |
| Anel de foco / superfície | `#BC560A` / `#FFFFFF` | **4,69:1** | 3 | ✓ |
| Anel de foco / fundo | `#BC560A` / `#F3F4F6` | **4,27:1** | 3 | ✓ |
| Linha do gráfico / superfície | `#BC560A` / `#FFFFFF` | **4,69:1** | 3 | ✓ |
| Alternador ligado / superfície | `#BC560A` / `#FFFFFF` | **4,69:1** | 3 | ✓ |
| Barra do item ativo / item ativo da sidebar | `#BC560A` / `#222831` | **3,16:1** | 3 | ✓ |
| Barra do item ativo / sidebar | `#BC560A` / `#111418` | **3,93:1** | 3 | ✓ |
| Logo (acento) / sidebar | `#BC560A` / `#111418` | **3,93:1** | 3 | ✓ |
| Ponto crítico / superfície | `#B42318` / `#FFFFFF` | **6,57:1** | 3 | ✓ |
| Ponto OK (sincronizado) / superfície | `#137A4F` / `#FFFFFF` | **5,35:1** | 3 | ✓ |
| NÃO OCORRE · borda de campo direto sobre o fundo cinza (todo campo fica em superfície branca) | `#8A919A` / `#F3F4F6` | **2,89:1** | 3 | ✗ não ocorre |
| NÃO OCORRE · acento como texto sobre o fundo (link usa #A34A08) | `#BC560A` / `#F3F4F6` | **4,27:1** | 4,5 | ✗ não ocorre |


## 4. De onde veio cada coisa

**Da v1** (`docs/design/preview.html`, copiado):
- tokens de cor da Opção B, raios, espaçamentos, alturas e sombras;
- **sidebar inteira**:
  - marca "13" com NR-13 e "Caldeiraria Exemplo";
  - quatro grupos, com Cadastros começando fechado;
  - contadores 5 (vencidos, em vermelho claro) e 142;
  - item ativo com barra de 2px;
  - recolher para 56px;
  - Ajuda e Sair no rodapé;
- **cabeçalho de 48px**: título com trilha, busca "Ctrl K", "Sincronizado", sino e avatar;
- **toolbar de 44px do visualizador**:
  - voltar, código, selo Rascunho;
  - miniaturas, páginas ‹ 3 / 12 › e zoom;
  - "Salvo 14:32", Salvar rascunho, Finalizar e ⋯;
- **menu ⋯**: os mesmos 5 itens, na mesma ordem e com os mesmos ícones;
- painel de miniaturas, folhas, lista mobile de 64px e barra inferior do celular;
- botões primário, secundário e fantasma;
- selos (`.badge`): 20px, raio 4, sem borda;
- foco com contorno de 2px.

**Da v2:**
- Inter + JetBrains Mono e a escala 11–32;
- cabeçalho de tabela em CAIXA ALTA 11px;
- faixa única de KPIs com fios;
- gráfico com linha atual e período anterior tracejado;
- chips de tipo de equipamento;
- abas segmentadas com contador;
- estrutura de Inspeções e Clientes num cartão com a barra de ferramentas no topo.

**Da v3:**
- forma: retos, sem borda, raio 4–6;
- variação em selo com ícone;
- o modal inteiro conforme [`../v3/modal-cliente.md`](../v3/modal-cliente.md):
  - leitura e edição;
  - quatro abas;
  - faixa de KPIs sem caixas;
  - erro embaixo do campo;
  - Excluir no ⋯ com confirmação;
  - sheet de tela cheia no celular;
- overlay irmão do app, cobrindo o cabeçalho;
- z-index nomeado;
- botão perigo (texto vermelho sem fundo);
- alternador do Portal.

**Novo nesta rodada:**
- aba, chip e filtro ativos em `#BC560A` com texto branco. Na v1 o ativo era branco sobre o
  trilho;
- alternador ligado na cor do acento. Na v3 era verde, e cor semântica agora fica só em selo
  e ponto;
- no modal, a variação (−7,1 p.p., +22%) passou para a linha do valor: na linha do rótulo
  ela estourava a célula em 4px;
- o selo "2 vencidos" ao lado do número de vencidos saiu do modal: repetia o "2".

**Saiu:** o marinho, o petróleo e o índigo (v2), o laranja Wiz `#FD9124` com texto escuro (v3),
os dois grafites (v3) e o seletor de paleta.

## 5. Comparação lado a lado com a v1: sidebar, cabeçalho e toolbar

**Método.**
- As duas prévias foram carregadas no Chrome em quadros de **1440 × 900**: a v1 com a Opção B,
  a v4 como está.
- Nas duas, a tela do relatório ficou aberta com o menu ⋯ aberto.
- Comparei **elemento por elemento**, na mesma ordem do DOM, o estilo computado de:
  - cor, fundo, bordas, raio e padding;
  - tamanho, peso e altura de linha da fonte;
  - altura, sombra, gap, z-index, largura mínima e quebra de linha;
  - os pseudo-elementos `::before`/`::after`.

| Região | Elementos comparados | Diferenças |
|---|---|---|
| Sidebar | 92 | **só a fonte** |
| Cabeçalho | 21 | **só a fonte** |
| Toolbar + menu ⋯ | 58 | **a fonte** + a correção do menu (abaixo) |

**O que a fonte muda, e nada além disso.** A Inter é um pouco mais estreita que a IBM Plex
Sans. Por isso os elementos empurrados por `margin-left: auto` andam de 0,5 a 4px, porque o
texto antes deles ficou mais curto:
- os contadores 5 e 142;
- as setas dos grupos;
- a busca do cabeçalho.

As medidas fixas são idênticas:

| Medida | v1 | v4 |
|---|---|---|
| Cabeçalho | 48px | 48px |
| Toolbar | 44px | 44px |
| Topo do PDF (abaixo do cabeçalho) | 92px | 92px |
| Cores, raios, paddings, sombras e barra ativa | — | iguais |

**A correção do menu ⋯**, a única diferença fora a fonte:

| Propriedade | v1 | v4 | Efeito |
|---|---|---|---|
| `min-width` | 200px | **240px** | "Configurações do relatório" cabe numa linha |
| `white-space` dos itens | normal | **nowrap** | garante uma linha em qualquer largura |
| Altura do texto de "Configurações do relatório" | 37px (2 linhas, vazando do item de 32px) | **16px (1 linha)** | o defeito some |
| `z-index` | 50 | `var(--z-menu)` = 30 | sem efeito visual: nada fica entre o menu e o conteúdo. Mudou só para a escala nomeada |

Duas diferenças que não são de design:
- Foram retiradas as anotações `data-medida` ("Mostrar medidas"), que eram da barra da prévia.
- A folha de exemplo do PDF usa Arial em vez de IBM Plex. Ela representa o documento, não a
  interface.

A diferença de 6px na altura total da sidebar vem da barra da prévia, que é mais baixa na v4.

## 6. Verificado na prévia (Chrome)

- **Painel.**
  - Chips com "Todos" ativo em laranja e o KPI dominante de 32px com ponto vermelho.
  - Gráfico em `#BC560A` e "Próximos vencimentos" com aba ativa.
- **Inspeções.** "Em andamento" ativa em laranja com texto branco, linhas de 40px e ⋯ em cada
  linha.
- **Relatório.** Menu ⋯ aberto, com os 5 itens, cada um em uma linha.
- **Clientes.** Cadastros abre e marca Clientes. A linha abre o modal.
- **Modal no desktop:**
  - 720px;
  - a aba Dados em leitura **sem rolagem**;
  - o overlay cobre a sidebar e o cabeçalho;
  - os KPIs sem estouro (0px nas 4 células).
- **Celular 390:**
  - sem rolagem horizontal (390 = 390);
  - toolbar de 52px;
  - modal em tela cheia, com abas de 44px, inputs de 44px e texto de 16px.

## 7. Próximo passo, depois do ok

1. Trocar os valores dos tokens em português que já existem na branch `redesign-ui` pelos da
   tabela acima.
2. Trocar a fonte no `main.tsx`.
3. Aplicar o ativo laranja nas abas segmentadas.

Nada começa sem a sua aprovação.
