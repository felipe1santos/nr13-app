# Auditoria de UI + plano de redesign — 25/10/2026

> **Somente leitura.** Nenhum arquivo do app foi alterado; este documento é o único
> artefato produzido. Commit de referência: `23d51ca` (main, árvore limpa).

## 0. Método e limites

- **Análise estática** de `src/` (173 `.tsx`, ~25.300 linhas de CSS em 40+ arquivos):
  contagens por `grep` sobre CSS/TSX, leitura dos componentes de página e de dois
  relatórios de varredura independentes (navegação/mobile e componentes/ações), com
  amostras conferidas à mão (ver "Conferido" nos achados).
- **Nada foi renderizado em navegador.** Alturas de toque são calculadas de
  `padding + font-size + line-height`; contagem de botões é por JSX visível no estado
  padrão — estado condicional (rascunho, offline, papel) não foi exercitado.
- **Skill ui-ux-pro-max:** o CLI de busca (`scripts/search.py`) exige Python, que não
  está instalado nesta máquina (só o atalho da Microsoft Store). Seguindo a regra da
  própria skill, nada foi instalado; o plano usa a **Referência Rápida** dela
  (prioridades 1→10 e as regras nomeadas, citadas entre crases ao longo do texto).
  Quando houver Python, rodar
  `python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "industrial compliance inspection saas" --design-system --density 8 --variance 3 --motion 2 -p "NR-13"`
  para conferir as escolhas da Fase 0.
- **Fora do escopo:** as folhas A4 em `public/arquivos-inspecao/` e
  `public/arquivos-prontuario/` (são documento, não interface, e têm regras próprias —
  CLAUDE.md §5, html2canvas sem grid/flex) e o PDF vetorial.

---

## 1. Resumo executivo

O design system "Forja" existe (`src/styles/tokens.css`, `forja.css`, `design/`), mas
**é seguido por cima de duas camadas que nunca foram retiradas**: o CSS legado de cada
feature e os "mini design systems" locais (`--pm-*` no Memorial, `--adm-*` no Admin).
O resultado não é feio; é **inconsistente** — cada tela tem seu botão, seu cabeçalho,
seu modal e seu breakpoint.

| Dimensão | Número que resume | Gravidade |
|---|---|---|
| Espaçamento | **0 tokens de espaço**; 34 valores px distintos; só ~55% no grid de 4px | Alta |
| Tipografia | **33 tamanhos de fonte**; base 13,5px; 170 regras abaixo de 11px | Alta |
| Cor | **1.938 hex literais** fora de `tokens.css` (407 distintos); `--muted` reprova contraste AA | Alta |
| Botões | **4 famílias + ~109 classes `*btn*`**; 6 versões de botão "perigo" | Alta |
| Modais | **47 `Modal*.tsx` + ~10 inline**, 18 vocabulários de overlay, focus trap em só 6 | Crítica (a11y) |
| Diálogos nativos | **21** `confirm/alert/prompt` (5 são `prompt()` de senha) | Alta |
| Navegação | sem rota 404; `/vencimentos` órfã; 0 `navigate(-1)`; 6 jeitos de "Voltar"; 8 telas com `<h1>` duplicado | Alta |
| Mobile | shell em `100vh`; **0** `safe-area-inset`; 22 breakpoints; inputs < 16px (zoom no iOS) no fluxo de campo | Crítica (fluxo de campo) |

---

## 2. Inconsistências de espaçamento

**Não existe escala de espaço.** `tokens.css` e `forja.css` não definem nenhum
`--space-*`/`--gap-*`, e nenhum CSS usa um (0 ocorrências). Cada arquivo escolhe seu
número.

Distribuição de `padding|margin|gap` em px (2.315 ocorrências, 34 valores distintos):

| Grupo | Valores | Ocorrências | % |
|---|---|---|---|
| No grid de 4px | 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 52, 60 | ~1.279 | 55% |
| Grid de 2px, fora do de 4 | 2, 6, 10, 14, 18, 22, 26, 30, 34, 90 | ~638 + 2 e 6 | ~28% (10px sozinho = 361, o valor mais usado do sistema) |
| Ímpares | 1, 3, 5, 7, 9, 11, 13, 15 | 398 | 17% |

Achados concretos:

- **O valor mais comum (10px) não pertence a nenhuma escala** de 4/8. Ele convive com
  8 e 12 nas mesmas telas, produzindo ritmo vertical que "quase" alinha.
- **Ímpares em botões**: `.btn-primario`/`.fj-btn` usam `padding: 9px 15px`
  (`features/equipamento/equipamento.css:349`, `styles/forja.css:88`). O botão base do
  sistema está fora do grid.
- **Raios**: 32 declarações distintas de `border-radius` — 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 14, 20px, 999px, 50% **e** os tokens `--radius-sm/md/lg/xl`. Os tokens
  (7/10/12/14) são usados em ~126 lugares; os literais 8/9/6px, em ~220.
- **Sombras**: 87 `box-shadow` literais que não usam `--shadow-*`.
- **z-index sem escala**: 24 valores (1 → 9999), com 4000/4010 para toasts e modais e
  1400/1500/2000/3000 espalhados. Risco real de sobreposição já visível: a barra fixa
  do formulário (`z-index: 50`) cobre o rodapé da sidebar no desktop (ver §7).
- **`!important`**: 42 ocorrências — sintoma de especificidade disputada entre o CSS
  Forja e o legado.
- **Cabeçalhos de página**: ~14 estilos diferentes de topo (`info-hero`, `reg-hero`,
  `pendencias-hero`, `cal-faixa`, `livro-topo`, `pront-topo`, `cad-page-header`,
  `equipamento-header`, `equip-topo`, `ficha-topo`, `memorial-page-header`,
  `formulario-header`, `rel-cabecalho`, `admin-header`). Cada um tem padding próprio,
  então a distância topbar → conteúdo muda de tela para tela. `.fj-page-head` existe
  em `forja.css` e **não é usado por nenhum TSX** (conferido: 0).

**Tipografia (mesma raiz):** 33 tamanhos distintos — 8,5 / 9 / 9,5 / 10 / 10,5 / 11 /
11,5 / 12 / 12,5 / 13 / 13,5 / 14 / 14,5 / 15 / 15,5 / 16 / 16,5 / 17 / 18 / 19 / 20 /
21 / 22 / 24 / 25 / 26 / 30px, mais `rem` e `em` avulsos. Base global de **13,5px**
(`tokens.css`). **170** regras abaixo de 11px. Cinco famílias carregadas no
`main.tsx` (Space Grotesk, IBM Plex Sans, IBM Plex Mono, Inter, JetBrains Mono) — Inter
tem motivo (html2canvas), mas o Memorial usa Inter + JetBrains Mono como identidade
própria, diferente do resto do app.

---

## 3. Quantidade de botões por tela

Ações visíveis no estado padrão (botões + links clicáveis, incluindo componentes
filhos renderizados por padrão). Regra de referência: `primary-action` — uma CTA
primária por tela; >8 ações de topo é sinal de sobrecarga.

| Tela | Ações (padrão) | Primárias | Diagnóstico |
|---|---|---|---|
| **Memorial Vaso** (`MemorialVaso.tsx:282-594`) | ~12 + abas de etapa | **4 cores fortes**: `btn-nav-next` roxo, `btn-gerar-calculo` grafite, `btn-primario` âmbar, `btn-ok` verde | Pior caso: >1 primária, >8 ações, fora da paleta |
| **Ficha do equipamento** (`Equipamento.tsx` + filhos) | ~13–15 (Excluir, 6 lápis, 3–4 do slot de prontuário, foto, memorial ×2) | 0 com memorial salvo; 1 sem | >8 e, no caso comum, nenhuma CTA |
| **Relatórios — barra do editor** (`Relatorios.tsx:1503-1645`) | ~9 (Voltar, Medições, Laudo, Salvar rascunho, Finalizar, Imprimir, PDF, Config, ⋯) | 1, mas **azul** (`barra-btn-salvar`, `--blue2`) | >8; primária fora da paleta |
| **Calibrações — histórico** (`Calibracoes.tsx:539-750`) | ~8 + edição por acessório + 3 por lote | **2** de famílias diferentes (`fj-btn-primary` "Nova calibração" :565 e `btn-primario` "Novo lote" :664) | >1 primária |
| **Livro de Registro** (`LivroRegistro.tsx:753-1035`) | ~6 + 4 por rascunho | 1 + 1 **por rascunho** (`livro-btn-trancar`) | Primária repetida |
| **Portal — ativo** (`portal/PortalAtivo.tsx`) | 6 abas + voltar + 1 por item | `btn-primario` **em toda linha** (:434, 458, 555, 572, 600, 709) | Primária repetida — tudo grita igual |
| **InspecaoContainer** | voltar + 2–3 por formulário | `btn-primario` por linha | Primária repetida |
| **Dashboard** (`Dashboard.tsx:159-377`) | ~9 (alerta, dispensar, 5 chips de prazo, expandir, "Ver agenda") | 1 — e ela leva **para fora** (Agenda), competindo com o botão branco do alerta | CTA primária é navegação secundária |
| **Admin** (`Admin.tsx` + `PainelClientes`) | ~8 + 3 por linha | 0 Forja (`adm-btn-novo` próprio) | Limite |
| **Acesso** | ~7 + 4 por linha | 1 | Ações de linha usam `prompt()`/`confirm()` |
| **Certificados** | info + 3 por cartão (Ver, Editar, **Excluir vermelho**) + adicionar | 0 | Destrutivo em destaque em toda linha (`destructive-emphasis`) |
| **Pendências** | 2–4 por item, estilizados por seletor de elemento (`.pendencias button`) | 0 | Sem hierarquia |
| Equipamentos (lista) | 5 + clique no cartão | 1 | **Bom** — modelo a copiar |
| Relatórios (lista) | 3 + 4 por linha | 1 | Bom |
| Prontuários (lista) | 4 + 2–4 por linha | 1 | Bom |
| Inspeções | busca; com TAG: Voltar, info, Novo container + 2 por cartão | 1 (legado) | OK, mistura famílias |
| Funcionários, Empresas, Agenda, Vencimentos, MinhaEmpresa, Login, Info | 1–5 | 0–1 | OK (Login usa primária petróleo, não âmbar) |

Contagem bruta de `<button` só no arquivo da página: Calibrações 26, Relatórios 22,
Livro 18, Empresas 17, Portal 16, Acesso 16, Funcionários 16, Prontuários 14, Login 14.

---

## 4. Uso de cores

**Tokens existem; o código não os usa.**

- **1.938 hex literais** em CSS fora de `tokens.css`, **407 cores distintas**. Piores:
  `relatorios.css` (292), `memorial.css` (268), `admin.css` (162), `info.css` (100),
  `listaRegistros.css` (92). Mais **108 hex em TSX** e **312 `style={{…}}`** inline
  (Empresas 26, VisualizadorFormulario 25, Acesso 21). 215 `rgb()/rgba()` literais.
- **Paletas paralelas:**
  - **Azul**: Forja tem `--blue`, `--blue2`, `--link`, `--petroleo` (quatro azuis já é
    muito). O código ainda usa `#0C4F9B` **76×** como literal, além de `#1D4ED8`,
    `#2563EB`, `#1E3A8A`. O "salvar" do editor de relatório é azul; o login é petróleo.
  - **Roxo**: `#4A37C4` (19×), `#5B45E0` (11×), `#5B3AA6` (8×) como cor de texto e de
    botão de navegação no Memorial — o token `--purple` (`#7C5CFC`) quase não aparece.
  - **Laranja**: `#F97316` (4×) e `#F59E0B` convivem com `--amber`.
  - **Vermelho/verde**: `#B91C1C` (14×), `#DC2626`, `#16A34A`, `#15803D`, `#059669`
    convivem com `--crit` e `--ok`.
  - **Tokens locais**: `--adm-*` (40 definições, `admin-tema.css`) e `--pm-*` (28,
    `memorial.css`) são design systems inteiros dentro do app. `--pm-*` só existe sob
    `.memorial-page` — e é usado fora dela (bug do "Voltar" do formulário, §6).
- **Contraste (`color-contrast`, `color-accessible-pairs`)** — calculado:
  | Par | Razão | AA texto (4,5) |
  |---|---|---|
  | `--muted` `#7A8790` sobre branco | 3,7:1 | **reprova** |
  | `--muted` sobre `--steel` `#F6F5F2` | 3,4:1 | **reprova** |
  | `--text-faint` `#AEB4B9` sobre branco | 2,1:1 | **reprova** |
  | `--amber` `#FF7A1A` como texto sobre branco | 2,6:1 | **reprova** (como fundo com `--amber-txt` está ok) |
  `--muted`/`--text-muted` são a cor de texto secundário em **214** regras, quase
  sempre em 10–12px — o pior caso possível para legibilidade em campo, ao sol.
- **Sem modo escuro** (0 `prefers-color-scheme`). Não é requisito; registrado só porque
  a quantidade de literais tornaria isso inviável hoje.
- **Cor como único sinal** (`color-not-only`): `btn-icone cor-cinza/azul/roxo` nas
  linhas do histórico legado de relatórios diferenciam ação só por cor.

---

## 5. Componentes duplicados

| Padrão | Implementações | Componente compartilhado hoje |
|---|---|---|
| **Modal** | 47 `Modal*.tsx` + ~10 inline (`Acesso.tsx:448`, `Agenda.tsx:258,304`, `Equipamento.tsx:170,362`, `LivroRegistro.tsx:1067,1189`, `PainelClientes.tsx:469`, `SeletorCalibracaoInstrumento.tsx:94`). Overlays: `fj-modal-overlay` (36), legado `modal-overlay`/`modal-content` (`equipamento.css:171`, redefinido em `importar.css`) e mais 15 próprios. Fechar: 6 classes diferentes, uma é um "✕" literal. | Nenhum. Focus trap (`useFocoPreso`) em **6**; Escape em ~19; **10 sem `role="dialog"`** |
| **Botão** | `fj-btn*` (Forja), `btn-primario/secundario` (definidos num arquivo de *feature*, `equipamento.css:349-410`), `btn-icone` definido em **3 arquivos com 3 alturas** (32px `relatorios.css:340`, 44px `forja.css:887`, 38px `tokens.css:326`), família `cadastros`, ~109 classes avulsas | `fj-btn` — adoção parcial |
| **Botão perigo** | `fj-btn-danger`, `btn-danger(-sm)`, `adm-btn-perigo`, `efd-btn-perigo`, `mr-btn-perigo`, `btn-remover` | — |
| **Confirmação** | 21 diálogos nativos + confirmações artesanais (ModalExcluirProntuario, ContainerCard, Funcionários, Equipamento, Calibrações) | `ModalAviso` (~5 usos) |
| **Toast/feedback** | `FeedbackSalvamento` (13 arquivos) + `toast-sucesso`, `modelador-toast`, `mts-sucesso`, `predef-sucesso`, `mf-alerta` ×6 | `FeedbackSalvamento` |
| **Abas** | 8 (`admin-aba`, `acesso-aba`, `portal-abas`, `reg-modal-abas`, `mts-tabs`, `abas-caldeira`, `calc-step`, `vpdf-btn-aba`); `role="tab"` em só 3 | — |
| **Selo/badge/chip** | `fj-badge` (20) + `rel-selo-*`, `pront-selo-*`, `mlote-selo`, `ensaio-selo`, `cal-emissao-selo`, `predef-selo`, `portal-badge`, `badge-tipo` (definido em 2 arquivos), `imp-chip-*`, `ficha-chip`, `pend-chip`, `ag-chip` | `fj-badge`, `SeloPainel` |
| **Estado vazio** | `fj-empty` (13) vs ~30 próprios (`dashboard-vazio`, `cad-vazio`, `cal-vazio`, `reg-vazio`, `pront-vazio`, `rel-vazio`…) | `fj-empty` |
| **Carregando** | `.spinner` (`tokens.css:218`) + `fbs-spinner`, `rel-rodape-carregando`, `portal-carregando`; texto "Carregando…" solto em 92 lugares | `.spinner` |
| **Catálogo (lista)** | 6 quase-clones (`EquipamentosV9`, `InspecoesV9`, `CatalogoRelatoriosV9`, `CatalogoProntuariosV9`, `CatalogoCalibracoesV9`, `CatalogoLivroV9`) com a mesma barra busca + filtro + primária e linha própria cada | `BuscaLista`, `ListaVirtualizada` (o Livro não usa) |
| **Modal de filtros** | 4, ~1.250 linhas, dois vocabulários CSS (`mfp-*`/`mfd-*` e `mfr-*`) | — |
| **Menu "⋯"** | `MenuMais`, `MaisAcoesProntuario`, `fj-mais` inline | `MenuMais` |
| **Busca** | `BuscaLista` + ad-hoc em Acesso, Calibrações, Info, PainelClientes, ModalNovoLote, ModalFiltrosDocumentos, ModalPredefinicoes | `BuscaLista` |
| **Seletores CSS redefinidos** | `.val-view`, `.bloco-dados`, `.meta-card-header` (3 arquivos cada); `.livro-timeline-*` copiado inteiro em `dashboard-novo.css` e `listaRegistros.css`; `.container-card-*`, `.card-equipamento-horiz`, `.nav-item`, `.cad-item-card` | — |
| **Código morto visual** | `CardEquipamento.tsx` (só testes o importam); `FormularioManometro/PSV/Generico` (conferido: nenhuma tela importa); histórico legado em `Relatorios.tsx:1354-1490` ao lado do `RelatoriosV9` | — |

---

## 6. Problemas de navegação

**Estrutura** (`src/app/router.tsx:38-87`, `menu.ts:23-70`): 24 rotas, todas carregadas
de saída (0 `lazy()`); sidebar com até 12 itens de topo + grupo "Cadastrar" + Trocar
senha + Sair.

1. **Sem rota 404.** URL desconhecida cai no `errorElement` (`RotaErro`): "Ocorreu um
   erro inesperado" + só "Recarregar" — sem caminho para casa. URL digitada errada vira
   beco sem saída (`back-stack-integrity`, `error-recovery`). *Conferido.*
2. **Destinos órfãos e sobrepostos.**
   - `/vencimentos` não está no menu nem é linkada por nenhuma tela, embora
     "vencimentos" seja um módulo de permissão. É a mesma fonte (`usePainelVencimentos`)
     e a mesma tabela do Dashboard.
   - `/pendencias` só é alcançável pelo selo de sincronização, cujo rótulo some abaixo
     de 560px.
   - `ModalDetalheEquipamento` (Dashboard) duplica a ficha `/equipamento/:tag`.
   - Calibrações também emite certificado; Certificados guarda os de padrão — os nomes
     não deixam claro onde fica o quê.
3. **"Voltar" em 6 implementações e nenhuma usa o histórico** (0 `navigate(-1)`):
   `Link` fixo com `btn-secundario`, botão que muda query param, `btn-voltar` com
   estado local, `btn-voltar-memorial`, `pront-barra-voltar`/`cal-btn-voltar` e
   `aoVoltar` interno de ~8 modais (`back-behavior`).
   - **Bug visível:** o "Voltar" do formulário de inspeção
     (`InspecaoFormulario.tsx:34`) usa `.btn-voltar-memorial`, cujas cores vêm de
     `--pm-*`, definidas só sob `.memorial-page` (`memorial.css:10-12`). No formulário
     ele sai **sem fundo, sem borda, ~34px**. *Conferido.*
   - `Memorial.tsx:61` diz "← Voltar para Lista" e leva à **ficha**.
   - A ficha não tem volta para `/equipamentos`.
   - `?origem=equipamento` (`rotas.ts:54-65`) nunca é gerado — ramo morto.
4. **Telas guardadas em estado React, não na URL.** Relatórios (5 visões), Calibrações
   (4), Prontuários (3), Empresas (3), Funcionários (2). O botão voltar do
   navegador/Android sai da página inteira em vez de voltar uma visão; F5 perde o lugar
   (`deep-linking`, `state-preservation`).
5. **Modais não entram no histórico.** No celular, o "voltar" do sistema navega para
   fora em vez de fechar o modal — e há fluxos inteiros dentro de modal (criar
   relatório, nova inspeção, predefinições, lote de calibração) (`modal-vs-navigation`,
   `modal-escape`).
6. **Deep link frágil.** O editor de relatório lê `history.state.usr`;
   `InspecaoContainer` lê o container do cache síncrono e **redireciona para a lista se
   não achar** (`InspecaoContainer.tsx:28-34`) — o mesmo padrão que o §3-ter do
   CLAUDE.md proibiu para a ficha ("cache vazio não é motivo para fechar uma tela").
   `/inspecoes/:tag/:id/manometro` renderiza corpo vazio.
7. **Título duplicado.** A topbar do Layout sempre renderiza `<h1>`; 8 páginas renderizam
   outro (InspecaoFormulario, Memorial, Equipamento, Calibrações, Info, Pendências,
   Prontuários, Admin) — o título aparece duas vezes e a hierarquia de cabeçalhos
   quebra (`heading-hierarchy`).
8. **"Breadcrumb" não é trilha.** `.meta-breadcrumb` é "← Voltar › chip da TAG"; em
   telas de 3 níveis (Inspeções → container → formulário) não há trilha real
   (`breadcrumb-web`).

---

## 7. Problemas de mobile

O fluxo de campo (CLAUDE.md §1) é o mais crítico do produto. Os formulários de inspeção
foram feitos *mobile-first* e acertam muito (inputs de grade 44px/15px, respostas
segmentadas 44px, cabeçalho NC fixo, autosave nos 7 formulários vivos) — os problemas
abaixo são o que sobra.

**Shell e plataforma**
- **`height: 100vh; overflow: hidden`** em `.app-layout` e `.shell`
  (`layout.css:5,10`, *conferido*). No iOS/Android o fim do conteúdo fica sob a barra
  do navegador (`viewport-units`). `dvh` aparece só em `relatorios.css`, `info.css:696`
  e `janelaCalibracao.css:189`.
- **0 `safe-area-inset`** no código e sem `viewport-fit=cover` em `index.html:8`,
  apesar de `apple-mobile-web-app-capable` (PWA em tela cheia) (`safe-area-awareness`).
- **22 breakpoints distintos** (max: 380, 480, 560, 600, 640, 700, 720, 760, 780, 800,
  820, 860, 900, 1000, 1023, 1040, 1180; min: 700, 821, 1021, 1024, 1181). O shell vira
  gaveta em 900; formulários em 700; lista de inspeções em 600; topbar em 560;
  `relatorios.css` sozinho usa 9 (`breakpoint-consistency`).
- Navegação móvel = hambúrguer + gaveta. **Sem barra inferior** — para o técnico em
  campo, Inspeções fica a dois toques de qualquer tela (`adaptive-navigation`).

**Alvos de toque abaixo de 44px** (`touch-target-size`)
- Hambúrguer 38×38 (`layout.css:374`); itens da sidebar ~35px (`:61-66`); selo de
  sync e "Instalar app" 34px; `.btn-info-secao` 27px (`inspecoes.css:243`);
  `.btn-icone` 30px nas linhas do Livro e de Relatórios (sobrescreve a regra de 38px);
  `.vpdf-btn` 32px; `.placa-btn` 28px; gatilho do popover em
  `ModalSelecionarContainer.tsx:105` com padding 2px/4px.
- A regra global de 44px (`tokens.css:320-327`) cobre `btn-primario`, `btn-secundario`
  e `fj-btn`, mas dá **38px** ao `btn-icone`.

**Zoom automático do iOS (input < 16px)** (`readable-font-size`, `touch-friendly-input`)
- Nenhuma regra eleva inputs a 16px no mobile; ~83 regras de input/select/textarea com
  10–15px.
- No fluxo de campo: `.linha-medida-campos input` 14px/40px (grade de medição,
  `formularios.css:122-127`); `.nc-item-obs` 12px/~30px (`:490`); observação do
  checklist 12px (`FormularioChecklist.tsx:191-199`); textareas de observação 14px
  inline (`FormularioUltrassom.tsx:471`, `FormularioVisualExterno.tsx:190,201`);
  descrição da foto 13px (`formularios.css:621`); rótulos 10–12px.

**Fluxo de campo — outros**
- **Barra fixa de salvar** (`.formulario-acoes-fixas`, `formularios.css:273-290`):
  `left:0; right:0` **ignora a sidebar** no desktop (cobre o rodapé "Sair") e centraliza
  o botão no viewport, não no conteúdo; sem `safe-area-inset-bottom` (colide com o
  indicador de home do iPhone) (`fixed-element-offset`).
- Botões da linha do container 36px no desktop e 40px abaixo de 600px, fora da regra de
  44px; com 3 botões numa grade de 2 colunas, o terceiro fica órfão em meia largura
  (`inspecoes.css:194,217`).
- Autosave engole todos os erros (`useAutosaveFormulario.ts:27,38`) e sair do
  formulário não tem guarda de "alterações não salvas" (`form-autosave`,
  `sheet-dismiss-confirm`).
- Foto abre a galeria, não a câmera: `accept="image/*" multiple` sem `capture`
  (`EditorFotosDescritas.tsx:93`).
- O visualizador do formulário (`VisualizadorFormulario.tsx`, 5 tabelas) está dentro de
  `.viz-secao { overflow: hidden }` (`visualizador.css:7`) — tabela larga é **cortada**,
  não rolada (`horizontal-scroll`).
- Prévia A4 do Livro tem 794px fixos dentro de `overflow-x` — funciona, mas exige
  arrastar para os lados.

---

## 8. Referências em `inspiracao/`

Quatro capturas e o HTML salvo do site da **Firecrawl** (menu de produtos, hero,
documentação, bloco de código). O que vale trazer — e o que não vale — para um SaaS
de inspeção:

| Traço da referência | Como aparece lá | Aplicação no NR-13 |
|---|---|---|
| **Um único acento quente** | Laranja "heat" só em CTA, palavra-chave do título e ícones; todo o resto é neutro | Já é a tese do Forja (âmbar). Falta disciplina: hoje âmbar disputa com azul (salvar, login), roxo (memorial) e verde (ok como botão). **Âmbar = ação primária, e só ela.** |
| **Neutros por transparência** | `--black-alpha-1…48` sobre `--background-base #F9F9F9`; bordas `--border-faint/muted/loud` (#EDEDED/#E8E8E8/#E6E6E6) | Trocar os ~400 cinzas literais por **3 bordas + 4 níveis de texto** nomeados. O par fundo/painel do Forja (`#F6F5F2`/`#FFF`) já cumpre esse papel. |
| **Fios de 1px em vez de caixas com sombra** | Cartões e menus separados por linhas finas; sombra só no elemento flutuante (o campo de busca do hero) | Bate com o §3-quater ("dado parece dado"): lista e ficha com fios; sombra só em modal, popover e barra fixa. Elimina os 87 `box-shadow` literais. |
| **Linha de item = ícone + título + descrição curta** | Menu "Products" (Search / Scrape / Crawl) | Modelo para itens de menu, linhas de catálogo e a Central Info. |
| **Abas segmentadas com indicador "elevado"** | Python / Node.js / cURL; Search / Scrape / Map | Um componente `Tabs` para os 8 sistemas de abas atuais. |
| **Mono como tempero técnico** | Rótulos `[ .JSON ]`, numeração de linha | Já existe (`--font-mono`) para TAG, PMTA, espessuras. Usar só em dado, não em rótulo. |
| **Sidebar de docs com seções e item ativo em pílula** | Lista agrupada ("Get Started", "Core Endpoints"), ativo com fundo cinza | Bom modelo para o menu do app quando os grupos forem reorganizados (Fase 2). |

**Não trazer:** hero de marketing, arte ASCII, grade decorativa de fundo, título de 72px.
Isto é ferramenta de trabalho densa (`style-match`: produtividade/compliance), não
landing page. A sidebar escura do Forja continua — a referência é clara, mas trocar a
identidade não resolve nenhum dos problemas listados acima.

---

## 9. Plano de redesign em fases (ui-ux-pro-max)

**Direção** (Referência Rápida da skill, prioridades 1→10, para produto
*industrial / compliance / técnico de campo*): manter o Forja, densidade **alta** no
escritório e **confortável** no celular, variação visual **baixa**, movimento
**mínimo** (só feedback de estado). Prioridade da skill:
Acessibilidade → Toque → Performance → Estilo → Layout → Tipo/Cor → Animação →
Formulários → Navegação.

**Regras de execução que valem para todas as fases** (vindas do CLAUDE.md):
- Redesign é **visual**: nenhuma tela muda de fonte de dado, conversão ou regra de
  edição (§3-quater). Folhas A4 de `public/` e o PDF vetorial ficam fora.
- Cada fase entra com **teste de trava** no padrão do repositório (varredura de
  `src/` que quebra o build se o problema voltar), como `fichaRedesign.test.ts`.
- `npm run build` real antes de qualquer push; push só com autorização da rodada.
- Medição antes/depois por fase em `docs/medicoes/`.

### Fase 0 — Fundação de tokens (sem mudança visível intencional)
*Skill: `spacing-scale`, `font-scale`, `color-semantic`, `z-index-management`,
`breakpoint-consistency`, `color-contrast`.*
1. **Escala de espaço** `--space-1…8` = 4/8/12/16/20/24/32/48. Mapa de migração:
   10→8 ou 12 conforme o contexto, 14→12 ou 16, 6→4 ou 8, ímpares → par mais próximo.
2. **Escala de tipo**, 7 passos: 11 / 12 / 13 / 14 / 16 / 20 / 24 (+ display 30).
   Base de interface 14px; **inputs 16px abaixo de 640px**.
3. **Cores semânticas**: `--text-1/2/3`, `--border-1/2/3`, `--action` (âmbar),
   `--info`, `--ok`, `--warn`, `--crit`. **Escurecer o texto secundário** (proposta
   `#5F6B73`: ~5,5:1 no branco, ~5,0:1 no steel) e restringir `--text-faint` a
   decoração. Aposentar `--adm-*` e `--pm-*` como aliases dos tokens globais.
4. **z-index nomeado**: base 0 / sticky 10 / barra fixa 20 / gaveta 30 / overlay 40 /
   modal 50 / toast 60.
5. **4 breakpoints**: 560 (celular), 900 (tablet/gaveta), 1180 (desktop),
   1440 (largo) — como custom media ou mixin documentado.

*Trava:* teste que conta hex literais, `font-size` fora da escala e breakpoints fora da
lista por arquivo, com teto que **só pode cair**. *Pronto quando:* o teto está gravado
e `tokens.css` tem as escalas.

### Fase 1 — Primitivos compartilhados
*Skill: `primary-action`, `state-clarity`, `focus-states`, `escape-routes`,
`confirmation-dialogs`, `empty-states`, `toast-accessibility`.*
- `<Botao variante="primaria|secundaria|fantasma|perigo|icone" tamanho>` sobre
  `fj-btn` — altura mínima 44px no toque, `aria-label` obrigatório no ícone,
  estado `carregando`.
- `<Modal>` único: overlay, `role="dialog"`, `aria-modal`, `useFocoPreso`, Escape,
  fechar padronizado, confirmação ao fechar com alteração (já existe em
  `JanelaCalibracao` — extrair), variante *sheet* no celular.
- `<Confirmar>`/`<PedirTexto>` assíncronos que substituem os **21** nativos (o
  `prompt()` de senha vira campo `type="password"`).
- `<Abas>` (com `role="tab"`), `<Selo>`, `<EstadoVazio>`, `<Carregando>`, `<Toast>`
  (sobre `FeedbackSalvamento`), `<CabecalhoPagina>` (ativar o `.fj-page-head` órfão).

*Trava:* teste que proíbe `confirm(`/`alert(`/`prompt(` em `src/` e exige que todo
`Modal*.tsx` use `<Modal>`. *Pronto quando:* primitivos documentados com exemplo e
usados por **uma** tela-piloto (Funcionários — a mais simples com modal + lista).

### Fase 2 — Shell e navegação
*Skill: `viewport-units`, `safe-area-awareness`, `navigation-consistency`,
`back-behavior`, `deep-linking`, `heading-hierarchy`, `adaptive-navigation`.*
- Shell em `100dvh` + `viewport-fit=cover` + `env(safe-area-inset-*)`.
- **Rota `*` com 404 útil** (link para Dashboard e busca) separada de `RotaErro`.
- Um `<h1>` por tela: a topbar mostra o título **ou** a página, nunca os dois.
- **Barra inferior no celular** (≤560px) com 4 itens + "Mais": Painel, Equipamentos,
  **Inspeções**, Relatórios — o técnico de campo chega à inspeção em 1 toque.
- Menu reagrupado (modelo da sidebar de docs da referência): *Operação* (Painel,
  Agenda, Vencimentos, Equipamentos, Inspeções) / *Documentos* (Relatórios,
  Prontuários, Livro) / *Instrumentos* (Calibrações, Certificados de padrão) /
  *Cadastros* / *Ajuda*. Decidir: Vencimentos volta ao menu **ou** é absorvida pelo
  Dashboard — a tela órfã não fica.
- Visões internas para a URL (`?visao=` em Relatórios, Calibrações, Prontuários,
  Empresas, Funcionários); modais de fluxo empurram entrada no histórico para o
  "voltar" do celular fechá-los.
- `<Voltar>` único: histórico quando houver, rota-pai quando não; trilha real
  (Inspeções › TAG › Container › Formulário).
- `InspecaoContainer` adota a porta do §3-ter (carregar → encontrado/ausente/
  indisponível) em vez de redirecionar.

*Trava:* teste de rotas — toda rota tem entrada de menu ou pai declarado; nenhuma
página renderiza `<h1>`. *Pronto quando:* E2E no celular (375px) navega
Painel → Inspeção → Formulário → voltar ×3 sem sair do app.

### Fase 3 — Fluxo de campo (celular)
*Skill: `touch-target-size`, `touch-friendly-input`, `readable-font-size`,
`fixed-element-offset`, `form-autosave`, `error-recovery`.*
- Todos os inputs do fluxo de inspeção com 16px e ≥44px; rótulos ≥12px.
- Corrigir o "Voltar" sem estilo do formulário (usar `<Voltar>`).
- Barra de salvar: dentro da coluna de conteúdo (respeita a sidebar),
  `safe-area-inset-bottom`, toast ancorado nela.
- Botões da linha do container em `<Botao>` 44px; grade que não deixa órfão.
- Foto: oferecer **"Câmera"** (`capture="environment"`) e **"Galeria"** lado a lado.
- Autosave com estado visível (salvando / salvo / falhou + tentar de novo) e guarda de
  saída com alteração pendente.
- Visualizador do formulário: tabela rolável com cabeçalho fixo, ou lista empilhada
  abaixo de 560px.

*Pronto quando:* checklist da skill "Pre-Delivery" passa em 375px e em paisagem, com
uma inspeção real do início ao fim em celular físico.

### Fase 4 — Telas densas (hierarquia de ações)
*Skill: `primary-action`, `overflow-menu`, `destructive-emphasis`,
`progressive-disclosure`, `visual-hierarchy`.*
Uma primária âmbar por tela; o resto em secundária/fantasma ou no "⋯"; destrutivo
separado e dentro do "⋯".
| Tela | Mudança |
|---|---|
| Memorial (vaso/caldeira/autoclave) | Tirar `--pm-*`, Inter e JetBrains Mono → Forja. Etapas como `<Abas>`/stepper; só "Calcular"/"Salvar memorial" em âmbar; roxo e grafite saem. |
| Editor de relatório | 9 → 4 visíveis (Voltar, Salvar rascunho, **Finalizar** âmbar, ⋯ com Medições, Laudo, Imprimir, PDF, Config). |
| Ficha do equipamento | Primária contextual (sem memorial: "Calcular memorial"; com: "Nova inspeção"); lápis por seção viram uma ação "Editar" por bloco; Excluir para o "⋯". |
| Calibrações — histórico | Uma primária ("Nova calibração"); "Novo lote" secundária. |
| Livro / Portal / InspecaoContainer | Ação de linha deixa de ser primária (fantasma ou link); primária só no topo. |
| Certificados / Pendências | Excluir vai para o "⋯"; Pendências ganha `<Botao>` em vez de `.pendencias button`. |
| Dashboard | Primária = ação do dia (abrir vencidos), não "Ver agenda". |

*Trava:* teste que conta `variante="primaria"` por página (≤1 no topo). *Pronto
quando:* todas as linhas da tabela do §3 com "Primárias = 1".

### Fase 5 — Catálogos e filtros unificados
*Skill: `consistency`, `virtualize-lists`, `search-accessible`, `empty-states`.*
- `<Catalogo>`: barra (busca + filtro + primária) + `ListaVirtualizada` + estado vazio,
  usado pelos 6 catálogos V9 (o Livro passa a virtualizar).
- `<ModalFiltros>` com campos declarativos substitui os 4 (~1.250 linhas).
- Um `<MenuMais>` (absorve `MaisAcoesProntuario` e `fj-mais`).
- Linha de catálogo no padrão da referência: ícone + título + descrição + selos.

### Fase 6 — Limpeza e aposentadoria
- Apagar CSS legado sem uso: `btn-primario/secundario` (depois da migração),
  `.modal-overlay/.modal-content`, `--adm-*`, `--pm-*`, cópias de `.livro-timeline-*`,
  `.card-equipamento-horiz`, `badge-tipo` duplicado.
- Remover código morto: `CardEquipamento.tsx`, `FormularioManometro/PSV/Generico` (ou
  ligá-los, se forem pendência de produto — decisão do dono), histórico legado em
  `Relatorios.tsx:1354-1490`.
- Zerar `!important` onde só existia para vencer o legado.
- Revisão final com a skill **web-design-guidelines** (instrução do CLAUDE.md global).

**Ordem e dependências:** 0 → 1 → (2 ∥ 3) → 4 → 5 → 6. A Fase 3 pode subir antes da 2
se o campo for a prioridade comercial — ela depende só de `<Botao>`, `<Voltar>` e da
escala de tipo.

---

## 10. Cobertura — o que esta auditoria NÃO cobriu

| Tela / área | O que faltou | Por quê |
|---|---|---|
| **Todas as telas, em execução** | Aparência real, alturas medidas, sobreposição, contraste sobre imagens, estados condicionais | Nada foi renderizado; análise só de código |
| **Admin** (`/admin`, `admin.css`, `admin-tema.css`) | Layout próprio e responsividade linha a linha; só contagem de ações e tokens `--adm-*` | Arquivos grandes (2.600+ linhas de CSS) com tema paralelo; fora do shell |
| **Login** (`Login.tsx`, `login.css`) | Internos do formulário, fluxos de recuperação/trial | Só contagem de botões e cor da primária |
| **Editor de Relatórios — subtelas** (Configurações, Medições, Laudo, Predefinições, prévia vetorial) | Responsividade e espaçamento de cada modal | `Relatorios.tsx` tem 2.106 linhas e `relatorios.css` 3.222; só a barra do editor foi contada |
| **Prontuários — formulário e editor** | Idem | `Prontuarios.tsx` (1.607 linhas) |
| **Editor de Croqui 2D** (`modelador`) | Tudo além do `100vh` | Overlay de tela cheia com regras próprias |
| **Portal do Cliente** (`PortalAtivo`) | CSS mobile além de um breakpoint de 800px | Só ações e "voltar" |
| **Formulários de inspeção, um a um** (11 formulários) | Internos de checklist, TH, acumulação, caldeira | Coberto no nível do CSS comum (`formularios.css`) e de 4 formulários; os demais não foram lidos linha a linha |
| **Memorial de caldeira e autoclave** | Hierarquia de ações detalhada | Só o de vaso foi lido inteiro |
| **Mockups em `design/*.html`** | Comparação tela a tela entre mockup e implementação | Não confrontados; usados só como origem dos tokens |
| **Buscas da skill ui-ux-pro-max** | Recomendações do banco (paleta, fontes, regras UX por domínio) | Python ausente; usada a Referência Rápida |
| **Folhas A4 e PDF vetorial** | — | Fora do escopo por decisão (são documento, não interface) |
