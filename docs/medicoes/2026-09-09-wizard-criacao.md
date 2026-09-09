# O assistente de criação de relatório — 09/09/2026

Commits `4242ed9` e `195bae5`. Bundle em produção: `assets/index-CZ78KBTU.js`.
E2E na conta `teste@gmail.com`, org `…d234ad8d211c`, só equipamentos `ZZ-*`.

Diagnóstico que originou a rodada: `2026-09-09-auditoria-fluxo-criacao.md`.

---

## 1. O que mudou

| antes | agora |
|---|---|
| modal de folhas → `navigate` → outro componente → 2º modal | UM shell, três etapas, uma navegação |
| container escolhido DEPOIS da rota | container escolhido antes de navegar |
| bloco azul misturando folha e origem | etapa 1 = estrutura · etapa 2 = origem |
| "N ensaios" vindo de `ensaios[]` (atribuído) | só o que tem conteúdo salvo |
| olho num popup do modal antigo | painel dentro da própria caixa |

`ModalCriarRelatorio` fica montado do começo ao fim. Voltar não perde folha,
container nem rolagem, porque nada é desmontado.

## 2. A causa raiz, e a guarda

`avancarParaEtapaContainer` trocava só `etapaModal`. `tela` continuava com o
valor inicial `'equipamentos'`, e o modal do container abria em cima de "Para
qual equipamento?".

A guarda não é uma transição de estado: `telaInicialDoEditor(state, search)` é
função pura e decide a tela **antes da primeira pintura**.

| entrada | tela |
|---|---|
| escolha pronta com `containerId` (inclusive `null`) | `montando` |
| escolha pronta sem `containerId` (state antigo) | `criacao` |
| URL com `rel=` | `montando` |
| `?legado=1&tag=` sem `rel` | `historico` |
| `?editor=1` puro, sem TAG | `equipamentos` |

E o bloco do seletor só renderiza com `!escolhaPronta.current`.

> **Achado do próprio E2E (teste D).** "Continuar editando" gera
> `?editor=1&tag=…&rel=…` **sem state**, e a primeira versão desta guarda não
> cobria esse caminho: medido com `MutationObserver` sobre o `body`, o seletor
> aparecia por **4 quadros** antes de o rascunho abrir. Foi daí que a URL entrou
> na conta. Depois do `195bae5`: **0**.

## 3. Atribuído × salvo

`inspecoes/resumoContainer.ts` é a fonte única da tela. Ele mede CONTEÚDO, e não
presença de chave: `dados[form] !== undefined` fica verdadeiro só de abrir o
formulário, porque o autosave grava o pré-preenchimento ~1 s depois. Cada
família tem a sua pergunta — resposta, medição, foto, parecer, resultado.

**Não unifiquei as outras duas leituras** (`relatoriosService.montarListaComTermoAbertura`
e `pdfVetorial/modelo.ts`), e a razão é o item 18 desta rodada: as duas decidem
COMPOSIÇÃO DE PDF, e mexer nelas mudaria o documento. Elas leem as chaves
globais `nr13_inspecao_atual`/`nr13_injecao_atual`; esta lê o container. Fonte
diferente, consumidor diferente. Registrado como decisão, não como esquecimento.

## 4. Seleção por ensaio (item 8)

Preservada, **sem arquitetura nova**: as caixas da etapa 3 são a MESMA seleção
de folhas (`marcados`), listando só o ensaio com dado salvo. Elas decidem o que
é IMPRESSO. A injeção continua sendo o container inteiro nas duas chaves
globais, como sempre foi — filtrar o blob por ensaio mudaria a semântica de
persistência, que o item 8 manda não inventar.

O checklist fica fora dessa lista: ele alimenta três folhas
(VERIFICACAO-DOCUMENTACAO + checklist2/3), e uma caixa só não o representaria.

## 5. E2E medido

Sonda: `MutationObserver` no `body` contando toda ocorrência de "Para qual
equipamento?", e envelope de `history.pushState/replaceState`.

### Teste A — com container (`ZZ-FASE3`)

| passo | medido |
|---|---|
| etapa 1 | 17 folhas (catálogo inteiro), sem bloco azul, "Cancelar / Próximo" |
| etapa 2 | `ZZ E2E — inspeção completa 05/09 · 05/09/2026 · 5 ensaios com dados salvos` |
| olho | abriu **sem navegar**, etapa 2 montada por baixo |
| conteúdo do olho | checklist 35 respostas/11 fotos · ultrassom 36 medições/aprovado · V.E. 10 respostas/6 fotos · V.I. 15 respostas/5 fotos · TH 5 fotos/aprovado |
| etapa 3 | 12 documentos, inspeção escolhida, 4 ensaios revisáveis |
| Gerar | **1** `pushState`, editor abriu com **25 páginas** |
| **"Para qual equipamento?"** | **0 ocorrências** |

### Teste B — voltar

- 2 → Voltar → 1: desmarquei SUMÁRIO, 13 → 12 marcados.
- 1 → Próximo → 2: radio do container **preservado** (`is-sel`).
- 3 → Voltar → 2 → Próximo → 3: radio preservado; marquei os 4 ensaios, 12 → 16.

### Teste C — sem container (`ZZ-TESTE-P2`)

Etapa 1 mostrou a seção **Certificados de calibração** (`dasdsad (1 manômetro)`).
Etapa 3: "Nenhum container selecionado. O relatório será gerado sem dados de
inspeção." Gerar → 1 `pushState`, editor com **12 páginas**, 0 seletor.

> A seção de calibração NÃO aparece em `ZZ-FASE3`, e isso está certo: a chave
> `nr13_lotes_cal_ZZ-FASE3` não existe — conferido no IndexedDB. O lote é do
> `ZZ-TESTE-P2`.

### Teste D — F5 e reabrir

Rascunho `REL-1788972747379` salvo. Lido direto do IndexedDB:

```
status: "Rascunho"
meta.containerOrigemId: "cont1788598098985_f1ced96d"
documentos: 18
```

e em `nr13_docs_ZZ-FASE3`:

```
id: "cont1788598098985_f1ced96d"  nome: "ZZ E2E — inspeção completa 05/09"
ensaios: [checklist, ultrassom, visual_externo, visual_interno, teste_hidrostatico]
dados:   [checklist, ultrassom, visual_externo, visual_interno, th]
```

Depois de F5 e "Continuar editando": **25 páginas** de novo (o vínculo com o
container sobreviveu) e **0** ocorrências do seletor.

## 6. Responsividade

Medida com o app dentro de um `<iframe>` de largura fixa — a janela do Chrome
desta máquina reporta `outerWidth: 0` e não aceita redimensionamento.

| | 1400 (1536 CSS) | 768 (765) | 386 (383) |
|---|---|---|---|
| caixa | 660 × 671, dentro da tela | 660 × 663, dentro | 351 × 696, dentro |
| overflow horizontal | não | não | não |
| rótulos das etapas | completos | completos | curtos (`Docs`) |
| altura da barra de etapas | — | — | 44 px |
| linha de documento | 36 px | 36 px | **44 px** |
| botão do rodapé | 38 px | 38 px | **44 px** |
| olho | 34 px | 34 px | **44 px** |
| revisão | 2 colunas | 2 colunas | **1 coluna** |
| painel do olho | 420 px, dentro da caixa | dentro | 331 px, dentro |

## 7. Testes

`resumoContainer.test.ts` (13) · `wizardCriacao.test.ts` (25, com o gate de
"Para qual equipamento?" e o de legado preservado). Suíte 2796.

---

## O que NÃO foi feito, e por quê

1. **Unificar as três leituras de "tem dado?"** — só a da tela foi unificada.
   Ver §3: as outras duas decidem PDF.
2. **Filtrar a injeção por ensaio** — ver §4.
3. **Composição de vários containers** — `meta.containerOrigemId` é singular e o
   modelo não suporta; o item 12 manda preservar isso.
4. **Apagar o caminho legado** — `ModalNovaInspecao`, `ModalSelecionarContainer`
   dentro do editor, `?legado=1` e o histórico por TAG seguem inteiros, com
   teste que quebra se algum sumir.
