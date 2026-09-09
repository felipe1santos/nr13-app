# Auditoria do fluxo de criação de relatório — 09/09/2026

**Rodada de diagnóstico. Nenhum arquivo de código foi alterado.**

Bundle auditado: `assets/index-BG1gpWCo.js` (commit `18e0bdb`).
Reprodução em produção, conta `teste@gmail.com`, equipamento `ZZ-FASE3`.

---

## 1. O fluxo atual, passo a passo

```
/relatorios                                      ← rota única, router.tsx:75
  │  pages/Relatorios.tsx · export default Relatorios()
  │  modoRelatorios(search) === 'v9'  → monta <RelatoriosV9/>
  ↓
[+ Criar relatório]                              RelatoriosV9.tsx:723
  │  onClick → setCriacao({ passo: 1 })
  ↓
passo 1 · <ModalSelecionarEquipamento>           RelatoriosV9.tsx:757
  │  filho: <CatalogoRelatoriosV9 modo="selecao">
  │  aoEscolher(tag,item) → setCriacao({ passo:2, tag, descricao, tipoEq })
  ↓
passo 2 · <ModalNovaInspecao>  "Configurar Novo Relatório"   RelatoriosV9.tsx:775
  │  tipo de inspeção + bloco azul de injeção + documentos a agrupar
  │  onGerar(tipo, documentos) → setCriacao(null)
  │                            → aoEscolherEquipamento({tag,tipo,documentos})
  ↓
Relatorios.tsx:1893 (o default export)
  │  navigate(urlDoEditor(tag), { state: escolha })
  │  → /relatorios?editor=1&tag=<TAG>   +   history.state.usr = escolha
  ↓
modoRelatorios(search) === 'legado'  (porque editor=1)
  │  React troca o filho: desmonta RelatoriosV9, MONTA RelatoriosLegado
  ↓
RelatoriosLegado, montagem
  │  useState<Tela>('equipamentos')                    ← Relatorios.tsx:155
  │  escolhaPronta = useRef(window.history.state?.usr) ← :168  (CHEGA PREENCHIDO)
  │  useEffect [] :506
  │     └─ pronta?.tag  →  await abrirEquipamento(tag)
  │                        avancarParaEtapaContainer(tipo, documentos)   :704
  │                           setPendente({tipo,docs})
  │                           setEtapaModal('container')
  │                           ⚠ NÃO chama setTela(...)
  ↓
TELA RENDERIZADA:
  │  tela === 'equipamentos'  → "Para qual equipamento?"  :1209   ← O FUNDO ERRADO
  │  etapaModal === 'container' → <ModalSelecionarContainer>  :1803  ← por cima
  ↓
[Gerar Documento] → finalizarGeracao(containerId)   :709
  │  monta documentos, grava meta e dados de campo
  │  setTela('visualizador')                        :751
  ↓
EDITOR / PRÉVIA
```

---

## 2. Telas e componentes

| # | arquivo | componente | como é aberto | estado/prop | rota/query | ainda necessário? |
|---|---|---|---|---|---|---|
| A | `features/relatorios/RelatoriosV9.tsx` | `RelatoriosV9` | padrão de `/relatorios` | `params` (`useSearchParams`) | `/relatorios` | **SIM** — lista canônica |
| B | `features/relatorios/ModalSelecionarEquipamento.tsx` + `CatalogoRelatoriosV9.tsx` | modal passo 1 | `setCriacao({passo:1})` | `criacao` | nenhuma | **SIM** |
| C | `features/relatorios/ModalNovaInspecao.tsx` | "Configurar Novo Relatório" | `criacao.passo===2` | `tipo`, `marcados`, `calibSelecionados` | nenhuma | **SIM** |
| D | idem C, bloco `automaticos` (`ModalNovaInspecao.tsx:193`) | "Injeção Automática de Dados (Containers)" | mesma montagem | **vista** sobre `marcados` + `calibSelecionados` | nenhuma | **PARCIAL** — ver §8 |
| E | `features/relatorios/ModalSelecionarContainer.tsx` | "Selecionar Container de Inspeção" | `etapaModal==='container'` | `selecionado` (radio único) | nenhuma | **SIM** |
| F | `pages/Relatorios.tsx:1209` | bloco `tela==='equipamentos'` — "Para qual equipamento?" | valor INICIAL de `useState<Tela>` | `tela` | `?editor=1` sem state, ou `?legado=1` | **PARCIAL** — ver §4 |
| G | `pages/Relatorios.tsx:1417` | bloco `tela==='visualizador'` (+ `PreviaVetorial`) | `finalizarGeracao` / `visualizar` | `meta`, `documentos` | `?editor=1` | **SIM** — é o único editor |
| H | `pages/Relatorios.tsx:1236` | bloco `tela==='criacao'` — "Novo relatório — TAG / Escolher as folhas" | `escolherEquipamento()` no papel `editor` | `tela` | `?editor=1` | **PARCIAL** — é o fundo CERTO do passo C/E |
| I | `pages/Relatorios.tsx:1263` | bloco `tela==='historico'` — "Histórico de Relatórios" | só com `papel.current==='legado'` | `tela` + `papel` | `?legado=1` | **SIM, só legado** |

---

## 3. Causa exata da duplicidade

**Não é perda de state, não é remontagem, não é fallback legado. É uma
transição de tela que não acontece.**

Medido no navegador, com sonda em `history.pushState` (leitura apenas):

```
1 única chamada a pushState
url:  /relatorios?editor=1&tag=ZZ-FASE3
history.state = { idx:1, key:"xhrugzbo",
                  usr:{ tag:"ZZ-FASE3", tipo:"Inspeção Periódica",
                        documentos:[13 folhas] } }
```

Ou seja: **a escolha CHEGA inteira**. `escolhaPronta.current` é preenchido, o
efeito de montagem entra no ramo certo e o modal do container abre.

O defeito está em uma função de três linhas:

```ts
// pages/Relatorios.tsx:704
function avancarParaEtapaContainer(tipo: TipoInspecao, docsSelecionados: string[]) {
  setPendente({ tipo, docs: docsSelecionados });
  setEtapaModal('container');
  // não há setTela(...)
}
```

`tela` continua com o valor inicial `'equipamentos'` (`:155`), e o bloco
`:1209` renderiza "Para qual equipamento?" **como fundo** do modal de container.

O contraste está no caminho de dentro do editor, que faz certo:

```ts
// pages/Relatorios.tsx:586  escolherEquipamento()
await abrirEquipamento(novaTag);
if (papel.current === 'editor') {
  setTela('criacao');            // ← o fundo correto
  setEtapaModal('documentos');
  return;
}
```

- **causa exata:** `avancarParaEtapaContainer` altera só `etapaModal`.
- **função:** `pages/Relatorios.tsx:704`, chamada de `pages/Relatorios.tsx:514`.
- **condição:** `escolhaPronta.current?.tag` presente — o caminho do fluxo moderno.
- **rota/state/query:** `/relatorios?editor=1&tag=<TAG>` com `history.state.usr`
  preenchido. A rota e o state estão corretos.

> **Correção de uma afirmação minha da rodada anterior.** Eu disse que a escolha
> "não é carregada" porque a rota não remonta. Está errado nas duas partes: a
> rota **troca de componente filho** (`RelatoriosV9` → `RelatoriosLegado`), logo
> remonta e o `useRef` roda; e o `state` chega. Só a tela de fundo não muda.

---

## 4. É a mesma duplicidade antiga?

**Resposta: B — é outro problema, no mesmo arquivo.**

A duplicidade corrigida em 06/09 era a **segunda LISTA de relatórios**
("Histórico de Relatórios" por TAG, bloco `:1263`). Aquela guarda continua de pé
e é estrutural: `tela === 'historico' && papel.current === 'legado'`. No papel
`editor` aquele bloco **não renderiza em hipótese nenhuma**.

O que aparece agora é outra coisa: o **seletor de equipamento** (`:1209`), que
não tem guarda por papel porque é legítimo nos dois papéis.

- **A) mesma arquitetura antiga?** Sim, o mesmo componente de 4 telas; não, o
  mesmo defeito.
- **C) ainda necessária para legado?** Sim: `?legado=1` sem `tag` cai nela, e é
  a única porta para documento anterior ao §7-quater. Também é o destino de
  `?editor=1` **puro** (sem tag e sem state) — hoje alcançável digitando a URL.
- **D) pode sair do fluxo moderno?** Sim, sem tocar em legado nenhum: basta a
  transição de tela do §3. O bloco continua existindo para os dois casos acima.

---

## 5. Seleção do equipamento

**O SISTEMA PEDE O EQUIPAMENTO MAIS DE UMA VEZ HOJE? — NÃO.**

Ele pede **uma vez**. O que acontece é pior de explicar e mais barato de
corrigir: a segunda tela de seleção **aparece atrás do modal**, sem ser
necessária, e quem fechar o modal do container cai nela e escolhe de novo — aí
sim, a segunda pergunta, agora pelo caminho `escolherEquipamento`.

Trilha da TAG:

| ponto | onde vive |
|---|---|
| escolha no passo 1 | `criacao.tag` — React state de `RelatoriosV9` |
| entrega ao pai | argumento de `aoEscolherEquipamento({tag,tipo,documentos})` |
| travessia da rota | `history.state.usr` (**+** `?tag=` na query, redundante e legível) |
| leitura no editor | `useRef(window.history.state?.usr)` (`:168`) e `alvoLegadoDaUrl` (`:505`) |
| estado do editor | `const [tag,setTag]` (`:196`), gravado por `abrirEquipamento` |
| fonte canônica | a query `?tag=` sobrevive a F5; o `state` **não** |

**Onde pode se perder:** F5 na URL `?editor=1&tag=X` sem `rel=` mata o `state` e
o efeito cai em `alvoUrl` sem `rel` → no papel `editor`, `navegar('/relatorios')`
(`:531`). Perde-se a configuração de folhas, não o equipamento. É coerente: o
rascunho ainda não existe.

---

## 6. Containers de inspeção

| pergunta | resposta |
|---|---|
| fonte oficial | `features/inspecoes/inspecaoService.ts` |
| chave | **`nr13_docs_<TAG>`** — um array de `ContainerInspecao` por equipamento |
| vínculo com a TAG | é a própria chave; não há campo `tag` dentro do container |
| estrutura | `{ id, nome, criadoEm, ensaios: TipoEnsaio[], dados: Partial<Record<FormularioEnsaio, unknown>> }` |
| leitura | `listarContainers(tag)` (síncrona, do cache) e `carregarContainer(tag,id)` |
| hidratação | `abrirEquipamentoParaInspecao(tag)` (`catalogoInspecoes.ts`) semeia a TAG antes de ler |

> **`nr13_docs_` está em `FORA_DO_PALCO`** (CLAUDE.md §2-ter): nenhum template
> HTML a lê. Quem leva os dados às folhas é a cópia global
> `nr13_inspecao_atual` / `nr13_injecao_atual`.

**ATRIBUÍDO × SALVO — a distinção que a Etapa 2/3 futura precisa:**

- `container.ensaios[]` = o que foi **atribuído** ao criar (checkboxes de
  `ENSAIOS_DISPONIVEIS`). Existe mesmo que ninguém tenha aberto o formulário.
- `container.dados[formulario]` = o que foi **salvo em campo**. É gravado por
  `salvarDadosFormulario`, e só existe depois de o técnico salvar.

O critério "está realmente salvo" já é usado em um lugar do sistema:

```ts
// ModalNovaInspecao.tsx:130 · origemDeCampo()
const comDado = containers.filter((c) => c.dados && c.dados[form] !== undefined);
```

Os cinco ensaios e seus formulários (`inspecoes/tipos.ts`):

| `TipoEnsaio` | `FormularioEnsaio` | chave em `dados` |
|---|---|---|
| `checklist` | `checklist` | `dados.checklist` |
| `ultrassom` | `ultrassom` | `dados.ultrassom` |
| `visual_externo` | `visual_externo` | `dados.visual_externo` |
| `visual_interno` | `visual_interno` | `dados.visual_interno` |
| `teste_hidrostatico` | `th` | `dados.th` |

`manometro` e `psv` existem em `FormularioEnsaio` mas **não** em `TipoEnsaio`:
calibração não vem de container, vem de `listarCalibracoes(tag)` / `listarLotes(tag)`.

---

## 7. Conteúdo interno do container — o que já dá para mostrar

**Sem nenhuma leitura pesada.** `listarContainers(tag)` devolve o objeto
inteiro, `dados` incluso, direto do cache em memória. Hoje já dá para responder:

| dado | disponível? | de onde |
|---|---|---|
| nome, data de criação | ✅ | `c.nome`, `c.criadoEm` |
| ensaios ATRIBUÍDOS | ✅ | `c.ensaios` |
| ensaios com dado SALVO | ✅ | `c.dados[FORM_POR_ENSAIO[e]] !== undefined` |
| data do ensaio | ✅ | `dataDoEnsaio()` — 1º campo `data*` do blob (`ModalSelecionarContainer.tsx:33`) |
| nº de fotos por etapa | ✅ | `c.dados[etapa].fotos.length` — o mesmo teste de `montarListaComTermoAbertura` |
| nº de medições de espessura | ✅ | `c.dados.ultrassom.pontos.length` — mesmo teste de `modelo.ts:702` |
| exame externo/interno respondido | ✅ | `Object.values(dados[x].itens).some(v => v)` — `modelo.ts:700` |
| observações | ✅ | dentro do blob do formulário |
| tipo de inspeção | ❌ | **não existe no container** — é escolhido no relatório |
| status / responsável / conclusão | ❌ | **não existem** no `ContainerInspecao` |

**Helper reutilizável para o olho: PARCIALMENTE.** Já existem TRÊS
implementações do mesmo teste, em lugares diferentes, e nenhuma exportada como
função de resumo:

1. `origemDeCampo()` — `ModalNovaInspecao.tsx:130` (tem dado?)
2. `temFotos()` / `temFotosDoc` / `temFotosCL` — `relatoriosService.ts:250`
3. `temExameExterno` / `temExameInterno` / `temUltrassom` — `modelo.ts:700`

Um `resumirContainer(c)` que devolvesse `{ ensaio, atribuido, salvo, data,
fotos, medicoes }` unificaria as três **sem nenhuma leitura nova**.
`NECESSIDADE DE LEITURA PESADA: NÃO.`

**Já existe um olho.** `ModalSelecionarContainer.tsx:106-160`: botão com
`Icone nome="eye"`, popup `position:fixed` que abre no hover e trava no clique,
listando ensaio + data. Ele lista `c.ensaios` (atribuídos), **não** o que está
salvo — é exatamente a troca que a Etapa 3 futura pede.

---

## 8. "Injeção Automática de Dados" — o que ela realmente faz

**As caixas do bloco azul NÃO escolhem ensaio. Escolhem FOLHA.**

```ts
// ModalNovaInspecao.tsx:193
// "É uma VISTA sobre os dois estados que já existiam (`marcados` e
//  `calibSelecionados`) — nenhum estado novo, nenhuma regra nova"
marcado:  marcados.includes(doc),
alternar: () => toggle(doc),
```

Marcar "Medição de Espessura" no bloco azul é **idêntico** a marcar
`ULTRASSOM.html` na lista de baixo. O bloco só separa visualmente os quatro
documentos de `ENSAIOS` para os quais `origemDeCampo()` achou um container com
dado salvo; os que não têm origem ficam na lista comum (`naLista`, `:214`).

**O container em si não é escolhido aqui.** A linha "Container: X" é só o
rótulo de origem. Quem escolhe é o `ModalSelecionarContainer`, **um passo
depois**, com **radio de seleção única**.

Consequência mensurável: se o bloco azul disser "Medição de Espessura ·
Container: A" e o usuário escolher o container B no passo seguinte,
**os dados injetados são os de B**. Nada avisa.

Como a escolha chega ao documento:

```ts
// finalizarGeracao(containerId)  ·  Relatorios.tsx:709
const dadosContainer = containerId ? carregarContainer(tag, containerId)?.dados ?? {} : {};
…
await gravarInspecaoOrigemAtual(dadosContainer);   // grava o BLOB INTEIRO
novaMeta.containerOrigemId = containerId;
```

`gravarInspecaoOrigemAtual` grava o blob **completo** nas duas chaves globais
(§2 do CLAUDE.md). O gerador vetorial lê dali (`modelo.ts:682`). Ou seja:

> **Ensaio a ensaio NÃO é selecionável hoje.** É um container inteiro, e o que
> a seleção de folhas decide é o que será IMPRESSO — não o que é injetado.

Estruturas que guardam a escolha: `marcados: string[]` (folhas),
`calibSelecionados: Set<string>` (lotes), `pendente: {tipo,docs}` (React) e,
depois de gerar, `meta.containerOrigemId` + `documentos[]` no registro.

---

## 9. Documentos a agrupar

| pergunta | resposta |
|---|---|
| fonte da lista | `DOCUMENTOS_DISPONIVEIS` — `features/relatorios/tipos.ts:9` (17 folhas, na ordem canônica do §7) |
| rótulos | `ROTULOS` / `ROTULO_CURTO` — `ModalNovaInspecao.tsx:23` e `:52` |
| default | tudo **exceto** as 4 de `ENSAIOS` (`:148`) |
| estado da seleção | `marcados: string[]` |
| saída | `onGerar(tipo, [...ordenados, ...calibDocs])` — reordenado por `DOCUMENTOS_DISPONIVEIS` |
| expansão | `montarListaComTermoAbertura` → `expandirFolhasFoto` → `expandirMemorial` → `expandirFolhasUltrassom` (`Relatorios.tsx:697`) |
| congelamento | `documentos: docs` em `montarRegistro` (`:1013`) — entra no registro do rascunho e no do finalizado |
| chega ao gerador | `gerarRelatorioVetorial(tag, { documentos })` → `pdfVetorial/composicao.ts` |

**São independentes?** Conceitualmente sim; na prática há **duas** amarras, e
ambas são desejadas:

1. As folhas de foto (`*-FOTOS.html`) e o `TERMO-ABERTURA` só entram se o
   container tiver foto — `montarListaComTermoAbertura(tag, docs, dadosContainer)`.
2. O bloco azul de C só lista um ensaio se `origemDeCampo` achou container com
   dado salvo.

Fora disso, marcar folha e escolher container são decisões separadas.

---

## 10-15. A arquitetura suporta o wizard único?

**SIM**, e com risco baixo. As razões, concretas:

- Não há rota nova envolvida: `ModalNovaInspecao` e `ModalSelecionarContainer`
  **já são chamados dos dois lados** (RelatoriosV9 e Relatorios). Bastaria o
  passo 3 de `criacao` em `RelatoriosV9` montar o `ModalSelecionarContainer`
  antes de chamar `aoEscolherEquipamento`, e a prop crescer para
  `{tag, tipo, documentos, containerId}`.
- `finalizarGeracao(containerId)` já recebe o container por parâmetro e já
  aceita `null`. É a única porta de entrada do editor.
- Nenhuma regra de negócio mora nas telas: `montarListaComTermoAbertura`,
  `expandir*`, `gravarInspecaoOrigemAtual` e `montarRegistro` são funções de
  serviço.

**Componentes reutilizáveis:** `ModalSelecionarEquipamento`,
`CatalogoRelatoriosV9` (modo `selecao`), `ModalNovaInspecao`,
`ModalSelecionarContainer` (com o olho já implementado), `Icone`.

**O que fica só como legado:** o bloco `tela==='historico'`
(`Relatorios.tsx:1263`, guardado por `papel.current==='legado'`) e a entrada
`?legado=1`. O bloco `tela==='equipamentos'` **não** é legado — continua sendo o
destino de `?legado=1` sem tag e de `?editor=1` puro.

**Fronteira a preservar:** `modoRelatorios()` / `papelDaTelaLegada()`
(`features/relatorios/rotaRelatorios.ts`). O fluxo moderno nunca deve produzir
uma URL com `legado=1`, e hoje não produz.

### Riscos

1. **`meta.containerOrigemId` reabre o container.** Ao continuar um rascunho, o
   editor relê `carregarContainer(tag, meta.containerOrigemId)` em três pontos
   (`:794`, `:848`, `:1067`). Um wizard que deixasse de gravar esse id
   silenciaria a reinjeção ao reabrir.
2. **Seleção por ensaio (Etapa 3) é funcionalidade NOVA, não rearranjo.** Hoje
   `gravarInspecaoOrigemAtual` grava o blob inteiro; filtrar por ensaio exigiria
   uma peneira nova sobre `dados`, com efeito no PDF. Não é mover botão.
3. **Composição múltipla de containers não existe.** `containerOrigemId` é
   singular, o radio é único e as chaves globais são uma só. Suportar dois
   containers seria mudança de modelo, não de tela.
4. **O olho de hoje mostra ATRIBUÍDO.** Trocar para SALVO muda o que o usuário
   vê antes de escolher — melhora, mas é mudança de comportamento.
5. `escolhaPronta` é lido do `history.state`: qualquer passo futuro que troque
   `navigate(state)` por `navigate` simples quebra o caminho inteiro em silêncio,
   e o sintoma seria exatamente o de hoje.

---

## Resumo executivo

| item | veredito |
|---|---|
| há dois fluxos de criação? | **Não.** Há um fluxo e uma tela de fundo errada |
| a escolha viaja? | **Sim** — medido: `history.state.usr` chega completo |
| causa | `avancarParaEtapaContainer` (`Relatorios.tsx:704`) não chama `setTela` |
| equipamento pedido 2×? | **Não**, a menos que o usuário feche o modal e caia no fundo |
| é a duplicidade de 06/09? | **Não** — aquela era a segunda LISTA, e a guarda dela está de pé |
| dá para virar wizard único? | **Sim**, sem tocar em regra de negócio |
| o olho já existe? | **Sim**, e mostra o ensaio ATRIBUÍDO, não o SALVO |
| seleção por ensaio existe? | **Não** — hoje é container inteiro |
