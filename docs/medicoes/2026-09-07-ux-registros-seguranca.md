# Registros de Segurança — rodada de UX da primeira tela (07/09/2026)

Escopo: **só** a tela de `/livro-registro`. A tela de dentro (linha do tempo,
lacre, termo, visualizador, PDF) não foi tocada — nenhuma regra documental,
nenhuma projeção, nenhuma migração.

## 1 · O que deixava a primeira tela seca

A lista renderizava uma `fj-table` crua: cinco colunas de texto (`Tag`,
`Categoria`, `Registros`, `Último registro`, `Ações`), um `fj-tag-ico` de 15px e
um `fj-btn-ghost` escrito "Abrir livro". Nenhuma cor, nenhuma hierarquia entre
os números e o resto, nenhum destaque para as duas informações que o usuário vem
buscar (quantos registros e quando foi o último).

A tela de DENTRO — a que já estava aprovada — usa outro vocabulário, e ele já
existe no sistema:

| peça | onde já existia |
|---|---|
| chip de ícone tingido (roxo/verde) | `.livro-doc-ic.capa` / `.termo` |
| card com realce no hover | `.livro-doc-card:hover` (borda `--blue2` + sombra) |
| badge colorido para a contagem | `fj-badge info2` no cabeçalho do livro |
| cabeçalho com filete âmbar + contagem | `painel-lista` (/relatorios, /prontuarios) |

A rodada trouxe esse vocabulário para a primeira tela. Nada foi inventado.

## 2 · Nomenclatura

| lugar | antes | agora |
|---|---|---|
| menu lateral | Livro Registro | **Registros de Segurança** |
| título/subtítulo da página (topbar) | Livro Registro · "Livros de registro de segurança por equipamento" | **Registros de Segurança** · "O histórico de cada equipamento, exigido pela NR-13" |
| cabeçalho da tela | Livros de Registro de Segurança | **Registros de Segurança** |
| ação da linha | Abrir livro | **Abrir registros** |
| aviso de abertura | "Abrindo o livro…" | "Abrindo os registros…" |
| permissões (Acessos) | Livro Registro | **Registros de Segurança** |

**A rota continua `/livro-registro`.** Rótulo é interface; endereço é contrato.

**O nome do DOCUMENTO não mudou:** "Livro de Registro de Segurança (NR-13
13.4.1.9)" segue no eyebrow da tela de dentro, na capa, no termo de abertura e
no PDF. É como a norma chama a peça e é o que a fiscalização procura.

## 3 · Layout

- **Bloco de abertura**: `fj-panel-head` (filete âmbar de sempre) com eyebrow da
  norma, título, descrição curta e chip roxo com o ícone de escudo.
- **Barra**: `BuscaLista compacto` — busca e contagem na MESMA linha (já era).
- **Lista**: cabeçalho `painel-lista` ("Equipamentos com registros" + contagem em
  badge roxo) e, abaixo, cards de linha com:
  chip do tipo (o mapa de ícones do Dashboard: vaso→`cylinder`,
  caldeira→`flame`, autoclave→`box`) · TAG em mono · nome próprio do equipamento
  · badge do tipo · badge `info2` da categoria · contagem em destaque · data do
  último registro em destaque · "Abrir registros".
- **Vazio**: bloco tracejado com chip e dois textos distintos — "a busca não
  achou" e "ainda não existe".

**O card inteiro é o `button`.** "Abrir registros" é um `span` — botão dentro de
botão é HTML inválido e criaria um segundo alvo competindo com o primeiro.

## 4 · Honestidade dos números e dos textos

- `metricaRegistros` (em `catalogoLivro.ts`, onde a suíte alcança) parte o
  rótulo em número + legenda **mantendo a regra do `null`**: `null` vira "—" +
  "não contado", nunca "0". Num destaque tipográfico, afirmar uma ausência que
  ninguém mediu é pior do que numa célula de tabela.
- O rodapé antigo dizia que "o livro é preenchido automaticamente (cada
  relatório salvo adiciona a anotação de inspeção correspondente)" e mandava usar
  um botão "Adicionar ocorrência". **As duas coisas estavam erradas** desde a
  Fase 10B.2 (04/09/2026): o registro virou ato do usuário
  (`Relatorios.tsx:1105`) e o botão hoje se chama "Novo registro". O texto de
  abertura descreve o comportamento de hoje.
- O vazio não manda o usuário procurar um botão que a tela não abre: diz o que
  faz um equipamento entrar na lista, e para.

## 5 · Medições de responsividade

`node scripts/ux-registros-seguranca.mjs` — Chrome headless, perfil descartável,
larguras num `<iframe>` (o Chrome do Windows tem piso de ~500px de janela; pedir
386 mede 504 e as media queries do celular nem chegam a valer). Mede o **CSS
compilado** (`dist/assets/index-*.css`), que é como as regras chegam ao usuário.

| largura | transbordo horizontal | altura do card | ação do card |
|---|---|---|---|
| 1400 | nenhum | 75px | 36px |
| 768 | nenhum | 164px | 36px |
| 386 | nenhum | 209–229px | **44px** |

Nome deliberadamente longo (TAG de 41 caracteres + descrição de 76): cortado com
reticências a 386px, sem empurrar o card em nenhuma largura.

O CSS medido tem o mesmo hash do servido em produção
(`assets/index-DhWlDdEq.css`), ou seja, o que foi medido é o que está no ar.

## 6 · Validação em produção

Deploy pelo Coolify (Redeploy), bundle novo `assets/index-BEFXE0bb.js`. Conferido
pelo CONTEÚDO, não pelo hash:

```
Registros de Segurança            3 ocorrências
Abrir registros                   1
reg-card-acao                     1
Abrir livro                       0
Livros de Registro de Segurança   0
preenchido automaticamente        0
não contado                       1
```

Tela aberta em `https://app.nr13sistema.com.br/livro-registro`, medida no DOM:
menu "Registros de Segurança", título "Registros de Segurança", nenhuma
`fj-table` na página, dois cards renderizados com badges, métricas e ação, e
`scrollWidth === innerWidth` (sem rolagem lateral).

**Defeito encontrado NA VALIDAÇÃO e corrigido:** equipamento sem descrição caía
no rótulo do tipo, e a linha saía com "Vaso de Pressão" no nome **e** no badge
ao lado. Agora a segunda linha só existe quando há nome próprio; o tipo é só o
badge.

## 7 · Testes

- `src/features/livro/uxRegistros.test.ts` — 16 casos (nomenclatura, rota
  preservada, nome do documento preservado, fim da tabela, botão não aninhado,
  cabeçalho `painel-lista`, faixas de responsividade, 44px no celular, textos).
- `src/features/livro/semeaduraLivro.test.ts` — 4 casos novos para
  `metricaRegistros` (os três estados + o `null` que não vira "0").
- Suíte completa: **2335 testes, 175 arquivos, tudo passando**; `tsc -b` e
  `npm run build` limpos.

---

# Segunda rodada — tela interna, toolbar e modal "Novo registro" (07/09/2026)

## 1 · Diagnóstico

**Tela interna.** As quatro ações (Novo registro, Histórico, Ver livro completo,
Exportar PDF) viviam numa fileira **sem moldura**, alinhada à direita, encaixada
entre os cards de capa/termo e a linha do tempo — sem faixa, sem fundo, sem
separação da ação primária. O "← Todos os equipamentos" ficava dentro do
cabeçalho, acima do eyebrow, num lugar onde nenhuma outra tela do sistema põe a
volta. Resultado: botões soltos no meio da tela e nenhuma hierarquia.

**Modal.** 120 linhas de JSX dentro da página, com estilo escrito em
`style={{...}}`, sete campos empilhados em coluna única, um parágrafo cinza de
três linhas no topo e dois selects com rótulos entre travessões
("— preencher à mão —", "— sem assinatura —"). Ele não respondia a pergunta que
o usuário faz ao abrir: *o que acontece com o que eu digitar aqui?*

## 2 · Toolbar

Uma faixa única (`livro-toolbar`) logo abaixo do cabeçalho:

- **esquerda:** `meta-breadcrumb` + `breadcrumb-chevron` + `crumb-tag-chip` — a
  MESMA trilha de /relatorios, /prontuarios, /inspecoes e /calibracoes;
- **direita:** "Novo registro" (única primária), um risco fino, e as três
  utilitárias.

Nenhuma ação foi escondida ou removida. No tablet a primária ocupa a linha
inteira e as utilitárias dividem a de baixo; no celular todas medem 44px.

## 3 · Modal

`features/livro/ModalNovoRegistro.tsx` — diálogo de verdade (`role="dialog"`,
`aria-modal`, `aria-labelledby`, ESC, armadilha de foco), com duas áreas:

| área | conteúdo |
|---|---|
| formulário | pré-preenchimento, grupo **Ocorrência**, grupo **Responsáveis** |
| apoio | ilustração + três passos + nota do lacre |

A coluna de apoio vem **antes no DOM** (é o que se lê primeiro) e vai para a
direita no desktop por `order: 2`; como não tem nada focável, a ordem de
tabulação não muda. Abaixo de 900px ela sobe para o topo; abaixo de 640px tudo
empilha e os botões viram barras de 44px.

**A regra não mudou de lugar:** o modal só desenha. Validar e gravar o rascunho
continua em `salvarOcorrencia` (página), com `montarEntradaLivroManual` +
`salvarRascunhoLivro`, e só o trancamento torna o registro oficial.

## 4 · Ilustração

A arte enviada pelo dono, convertida por `scripts/converter-ilustracao.mjs`
(canvas do Chrome headless — não há `sharp`, `magick` nem `cwebp` nesta máquina,
e um binário nativo no `package.json` por causa de uma imagem não se paga):

**933 KB PNG → 17,5 KB WebP, 860×860.** Em `public/ilustracoes/registro-seguranca.webp`,
`loading="lazy"`, `aspect-ratio: 1/1` + `object-fit: contain`, alt descritivo.

## 5 · Textos refinados

- o parágrafo cinza virou três passos: **Descreva a ocorrência** → **Salve como
  rascunho** (não conta como registro, não vai ao Portal, não entra na folha, dá
  para continuar depois) → **Tranque quando estiver certo** (oficial, entra na
  numeração, não pode mais ser editado);
- nota do lacre, em azul: hash do próprio conteúdo + elo do anterior;
- rodapé do modal: "Salva como rascunho — você tranca depois", ao lado do botão;
- "— preencher à mão —" → **"Preencher manualmente"**; "— sem assinatura —" →
  **"Sem assinatura"**; asterisco solto → marca **obrigatório** no rótulo.

## 6 · "Pré-preencher a partir de um relatório finalizado"

Bloco azul próprio, com um "i" que abre popover (`role="note"`, `aria-expanded`,
`aria-controls`). O ESC ali fecha **só o popover** — derrubar o modal levaria
junto o que já foi digitado. Conferido em produção: 1º ESC fecha o popover, 2º
fecha o modal.

**Dois defeitos encontrados testando o pré-preenchimento em produção:**

1. **a data não chegava.** `<input type="date">` só aceita `aaaa-mm-dd`, e a
   entrada montada traz a data do relatório, que pode vir `dd/mm/aaaa`. Atribuída
   direto, o campo ficava **vazio, sem erro** — justamente o campo obrigatório
   que o pré-preenchimento deveria resolver. Agora passa por `paraISO`, que
   devolve vazio para formato desconhecido (data inventada em registro de
   segurança, não);
2. **o tipo não aparecia.** O relatório traz "Inspeção Periódica", que não está
   entre as ocorrências manuais (manutenção, reparo, substituição…). O `<select>`
   recebia um valor sem opção correspondente e exibia vazio; o "Salvar rascunho"
   então recusava. O tipo vindo do relatório passa a entrar na lista.

## 7 · Medições

`node scripts/ux-registros-seguranca.mjs` sobre o CSS compilado:

| largura | toolbar | modal | form / apoio | ilustração | botões |
|---|---|---|---|---|---|
| 1400 | 57px | 940px | 648 / 292 | 237px | 34px |
| 768 | 143px | 710px | 710 / 710 (empilhado) | 154px | 34px |
| 386 | 215px | 328px | 318 / 318 | 206px | **44px** |

Sem transbordo horizontal em nenhuma peça.

**Terceiro defeito, pego em produção e depois coberto pela medição:** o texto de
cada passo saía com **uma palavra por linha**. Os `<li>` são grade de duas
colunas (número + texto) e o `<span>` não declarava coluna: a auto-colocação o
jogava para a linha de baixo, na coluna de 22px do número. Não transborda nada —
por isso a medição de transbordo não pegava. A medição agora confere a LARGURA
do texto de cada passo e reprova abaixo de 120px (hoje: 219 / 458 / 254px).

## 8 · Validação em produção

Bundle `assets/index-BlXPcIol.js` + CSS `assets/index-COUt5TIg.css`, conferidos
por conteúdo (`livro-toolbar`, `reg-modal-lado`, `registro-seguranca.webp`,
`Preencher manualmente`, `O que é pré-preencher`; `preencher à mão` = 0), e a
imagem servindo `200` com 17.882 bytes.

Na tela: toolbar com as quatro ações e a trilha, 58px de altura; modal 940px com
formulário de 638px e apoio de 292px, ilustração 238px carregada
(`naturalWidth: 860`), passos com 219px de texto, select em "Preencher
manualmente" e assinante em "Sem assinatura".

## 9 · Testes

`uxRegistros.test.ts` foi de 16 para **38 casos**; suíte completa **2358 testes,
175 arquivos**, `tsc -b` e `npm run build` limpos.

## 10 · Conferência final do pré-preenchimento (bundle `assets/index-8Dwb6TOK.js`)

Escolhendo `REL-1788715003775 · Inspeção Periódica · 06/09/2026` no modal, em
produção, os quatro campos que o "i" promete chegam:

| campo | valor |
|---|---|
| Data da ocorrência | `2026-09-06` (o campo mostra 06/09/2026) |
| Tipo de ocorrência | **Inspeção Periódica** — entrou na lista de opções |
| O que foi feito | "Relatório de inspeção gerado: Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf" |
| Responsável que assina | funciona01 |

O modal foi fechado em **Cancelar**: nenhum rascunho foi criado na conta durante
a validação (`document.querySelectorAll('.livro-rascunho').length === 0`).

**Observação fora do escopo desta rodada, registrada porque foi medida:**
escolher um relatório trava a aba por alguns segundos — em uma das tentativas o
`Runtime.evaluate` estourou 45s esperando a thread principal. `carregarRelatorio`
+ `montarEntradaLivroDoRelatorio` fazem trabalho pesado (registro completo com
base64 e a rubrica) de forma síncrona para a UI. Não foi alterado aqui: é
comportamento anterior a esta rodada e mexer nisso é performance de dados, não
UX de layout.

**Armadilha de verificação, para a próxima vez:** ao esperar um deploy, comparar
com o hash servido AGORA, não com o hash de dois deploys atrás. A primeira
espera deu "novo bundle" em 15 segundos porque o JS já tinha mudado no deploy
anterior — e a conferência funcional rodou contra o build errado, mostrando os
campos vazios de novo.
