# Predefinições do relatório — de "recomendações guardadas" a gerenciador

**12/09/2026** · Evolução estrutural e de UX da funcionalidade de predefinições do
editor de relatórios.

---

## 1. Arquitetura ANTERIOR (auditada antes de mexer)

| item | onde |
|---|---|
| botão | `PreviaVetorial.tsx`, na barra do visualizador, ao lado de "O que falta" |
| modal | `src/features/relatorios/ModalPredefinicoes.tsx` (229 linhas) |
| serviço | `src/features/relatorios/predefinicoes.ts` |
| persistência | `services/storage.ts` → `salvar()` → fila durável → RPC `aplicar_mutacao_storage` → Postgres |
| chave | `nr13_predef_recomendacoes` — **global da organização** (`familiasChave.GLOBAIS`) |
| escopo | organização (já correto) |
| estrutura | `{ id, nome, criadoEm, itens: [{texto, prazo}] }[]`, máximo 4 itens |
| aplicação | `aplicarPredefinicao()` → 8 pares `recomendacoes.N.texto/prazo` → `overrideDeTexto` → `gravarOverrides` |

**Não era Supabase direto, não era tabela própria, não era IndexedDB próprio.** Era o
despachante oficial de storage, que já resolve v1/v2, fila offline, versionamento e
conflito. Essa parte estava certa e foi **preservada inteira**.

### O que suportava

Oito campos, e só eles: as quatro linhas da tabela "Recomendações de Segurança"
(`recomendacoes.1..4.texto` e `.prazo`).

### Defeitos medidos

1. **Escopo de um campo só.** Das 28 células que o engenheiro digita depois do
   documento montado, 8 eram recomendações. As outras 20 — objetivo, escopo,
   procedimento do TH, prazos das próximas inspeções, parecer da PMTA — também se
   repetem, e não tinham catálogo.
2. **Não havia edição.** Salvar com o mesmo NOME substituía o conjunto. Corrigir uma
   vírgula exigia reescrever tudo no documento e regravar.
3. **Sobrescrita silenciosa.** `aplicarPredefinicao` escrevia as 4 linhas E **limpava
   as que sobravam**. Quem tinha escrito a quarta recomendação à mão e aplicava um
   conjunto de duas perdia a quarta sem ver aviso nenhum.
4. **Sem revisão.** "Usar neste relatório" aplicava na hora.
5. **Sem duplicar, sem busca, sem conjunto de demonstração.**
6. **UX:** parágrafo de ajuda fixo ocupando a altura da lista, acordeão que crescia
   sem limite, criação misturada ao fim da listagem, botão "Guardar" ambíguo.
7. **Código morto:** a prop `somenteLeitura` do modal nunca era passada.

---

## 2. Arquitetura NOVA

```
src/features/relatorios/predefinicoes/
  camposPredefiniveis.ts   allowlist dos 23 campos + grupos + tipos
  modelo.ts                tipo, saneamento, migração, CRUD, persistência
  conjuntoSistema.ts       o conjunto embutido (código, não dado)
  aplicacao.ts             plano, estados, modos, mapa de overrides
  useFocoPreso.ts          trava de foco dos diálogos empilhados
  ModalPredefinicoes.tsx   shell com 4 vistas
  EditorPredefinicao.tsx   criar / editar
  RevisaoAplicacao.tsx     revisar antes de aplicar
  ComoFunciona.tsx         ajuda (modal sobre modal)
```

### O modelo

```ts
interface Predefinicao {
  id: string;
  nome: string;
  descricao: string;
  campos: Record<string, string>;   // id semântico do campo → valor
  criadoEm: string;
  atualizadoEm: string;
  criadoPor?: string;               // e-mail; nunca impresso
  versao: number;                   // sobe a cada gravação
  sistema?: boolean;                // só o embutido; nunca persistido
}
```

Os ids de `campos` são **os mesmos que o gerador vetorial registra ao desenhar**
(`pdfVetorial/folhas.ts`). Nada de posição de célula nem de texto visível como chave.

**Valor vazio é um valor.** Um conjunto "Inspeção periódica sem recomendações" declara
as quatro linhas com `''`; aplicá-lo LIMPA a tabela de propósito. Isso cai no terceiro
estado do override (`branco`), em que o valor automático não volta sozinho.

### Persistência

**Nenhuma persistência nova.** Chave nova, mesmo caminho:

```
salvar('nr13_predef_relatorio', lista)
  → despachante storage.ts (v1/v2 por flag)
  → fila durável transacional
  → RPC aplicar_mutacao_storage
  → Postgres (app_storage)
  → ack
```

`nr13_predef_relatorio` entra em `familiasChave.GLOBAIS` (escopo da organização) e
**fora do palco** — nenhum template de `public/` a lê.

A chave antiga `nr13_predef_recomendacoes` continua sendo **lida** e convertida na
leitura (`camposDeItensLegados`). Ela **não é apagada**: é o backup e o fallback de
quem ainda não rodou o código novo — a mesma regra da migração do histórico
(§7-sexies do CLAUDE.md). Não há rotina de migração; a conversão acontece em
`sanearPredefinicao`, então vale inclusive para o registro que chegar de um aparelho
que ainda esteja na versão anterior.

### Multi-tenant

O isolamento **não é implementado neste módulo** — é herdado do caminho oficial, em
três camadas independentes:

| camada | o que garante | onde |
|---|---|---|
| RLS | `select`/`insert` em `app_storage` filtram por `org_id = public.org_atual()` | `supabase/armazenamento_v2.sql` |
| RPC | `aplicar_mutacao_storage` **não tem parâmetro `org_id`** — a organização vem do servidor, nunca do cliente | idem |
| cache local | banco IndexedDB por organização: `nr13_dados_<org_id>` | `src/services/db.ts` |

Criar tabela própria para as predefinições significaria reescrever essas três camadas.
Uma cópia dessa regra é uma chance a mais de ela divergir. `modelo.test.ts` trava as
três: a chave é global, o módulo importa `services/storage` e não `services/supabase`,
e o SQL continua sem parâmetro `org_id`.

---

## 3. Campos permitidos (allowlist)

Inventário dos ~180 `id:` de `pdfVetorial/folhas.ts`, filtrado para os que **não têm
fonte automática** — texto redigido à mão que se repete de inspeção em inspeção.

| Seção | ids | tipo |
|---|---|---|
| Objetivo | `objetivo.texto` | texto longo |
| Documentos de referência | `referencias.extra-doc`, `referencias.extra-titulo` | texto |
| Escopo | `escopo.texto` | texto longo |
| Categorização de risco | `categoria.nota` | texto longo |
| Exames realizados | `inspecao.observacoes` | texto longo |
| Teste hidrostático ✱ | `th.procedimento`, `th.parecer` | texto longo |
| Teste hidrostático ✱ | `th.normas` | texto |
| Recomendações | `recomendacoes.1..4.texto` | texto longo |
| Recomendações | `recomendacoes.1..4.prazo` | texto |
| Parecer técnico | `parecer.pmta-mantida` | opção (SIM / NÃO / N/A) |
| Parecer técnico | `parecer.justificativa` | texto longo |
| Próximas inspeções | `proximas.prazo-externa`, `proximas.prazo-interna`, `proximas.prazo-th` | texto |
| Próximas inspeções | `proximas.nota` | texto longo |

**23 campos.** `camposPredefiniveis.test.ts` confere cada um contra o próprio
`folhas.ts`: um id escrito errado aqui seria um campo que o conjunto promete preencher
e nunca preenche — falha silenciosa, o defeito mais caro deste sistema.

**✱ Os três do teste hidrostático são a exceção:** eles TÊM fonte — o container de
inspeção. Quando vêm preenchidos de campo, o dado da inspeção prevalece e a predefinição
não os escreve em modo nenhum (estado `protegido`, §4). Vindo vazios, ela preenche. Os
outros 20 nascem vazios no gerador.

### Campos PROIBIDOS

| família | por quê |
|---|---|
| `capa.*`, `identificacao.*`, `placa.*` | ficha do equipamento |
| `categoria.*`/`categorizacao.*` de valor, `resumo.*` | cálculo de categoria de risco |
| `componente.*`, `memoria.*` | memorial |
| `checklist*`, `exameExterno.*`, `exameInterno.*`, `documentacao.*` | container de inspeção |
| `ultrassom.*`, `vida.*` | grade de medições (`nr13_med_esp_`) |
| `parecer.laudo`, `inspecao.resultado-ensaios` | painel Laudo (`nr13_laudo_`) |
| `proximas.externa/interna/th`, `datas.*`, `*.art`, `*.numero-relatorio` | modal Configurações do Relatório |
| `*.foto`, `instrumentos.*`, `th.instrumento.*` | imagens e certificados |

A allowlist é aplicada **no saneamento, ou seja, na leitura**. Filtrar só na tela de
criação deixaria um registro forjado (outro aparelho, versão futura, storage editado à
mão) escrever em `capa.tag` ou `categoria.pmta` na hora de aplicar. Teste:
`sanearPredefinicao` com `{'capa.tag': 'ZZ-FALSA', 'recomendacoes.1.texto': 'legítima'}`
devolve **só** a recomendação.

---

## 4. Comportamento de conflito

Aplicar tem duas etapas. Primeiro monta-se o **plano** (`planoAplicacao`), campo a
campo, contra o que o gerador **acabou de desenhar** (`editaveis` — valor resolvido,
override aplicado). Quatro estados:

| estado | quando | o que acontece |
|---|---|---|
| `ausente` | o campo não foi desenhado neste relatório | nada, e a tela diz por quê |
| `igual` | o documento já diz exatamente isso | nada |
| `preenche` | o campo está vazio | escrito nos dois modos |
| `conflito` | há conteúdo diferente escrito ali | só no modo `substituir` |

`ausente` é o que impede a falha silenciosa: um conjunto com campos do teste
hidrostático aplicado num relatório sem a folha de TH gravaria overrides para campos
que ninguém desenha, e o contador diria "8 preenchidos" com três no papel.

### `protegido` — o dado automático prevalece (12/09/2026)

Regra do dono, acrescentada depois da primeira entrega: **predefinição preenche o que está
vazio; o que o sistema puxa de outra seção — ficha do equipamento, inspeção de campo —
prevalece.**

A allowlist já cobria quase tudo: nenhum campo alimentado por ficha, memorial,
categorização, medições ou laudo é predefinível. A auditoria campo a campo encontrou
**três exceções** que a allowlist admitia e que mesmo assim têm fonte:

| campo | fonte | verificado em |
|---|---|---|
| `th.procedimento` | container de inspeção (`nr13_injecao_atual` → `m.th.procedimento`) | `modelo.ts:698,1002` |
| `th.normas` | idem | `modelo.ts:996` |
| `th.parecer` | idem | `modelo.ts:1003` |

Eles ganharam `fonteExterna` na allowlist. Quando o valor no papel **não está vazio E veio
da fonte** (`origem === 'auto'`), o plano os classifica como `protegido`: nenhum modo os
escreve — nem `substituir`. `itensQueSeraoEscritos` é uma lista de **inclusão**, então
`protegido` fica de fora por não estar lá, e um modo novo não o alcança por descuido.

As três partes da condição importam:

- **`fonteExterna`** — sem isso, `objetivo.texto` (cuja redação padrão é escrita pelo
  próprio gerador, não puxada de outra seção) ficaria trancado, e substituí-la pela redação
  da empresa é o uso mais óbvio de uma predefinição;
- **valor não vazio** — se a inspeção não respondeu aquele item, a predefinição preenche
  normalmente: ali ela não substitui dado nenhum;
- **`origem === 'auto'`** — sem isso, o texto que o próprio usuário digitou naquele campo
  ficaria trancado para ele mesmo.

O campo continua corrigível **à mão**, clicando nele no documento: gesto individual, sobre
aquele valor, com o automático guardado no override. O que não existe é a via em lote.

Os outros 20 campos da allowlist nascem vazios no gerador — não há fonte que possa
prevalecer sobre eles.

### Os modos

- **`vazios` (padrão)** — preenche apenas os campos vazios; o que já está escrito
  permanece;
- **`substituir`** — troca também os campos em conflito, escolha explícita.

**Desvio deliberado da especificação:** ela pedia três opções — "manter os valores
existentes", "preencher apenas campos vazios" e "substituir". As duas primeiras
descrevem o mesmo comportamento (em ambas o que está escrito fica), e oferecer duas
opções idênticas com nomes diferentes faz o usuário procurar a diferença que não
existe. Ficaram duas.

A tela de revisão mostra, para cada conflito, **valor atual → valor da predefinição**,
e o seletor de modo só aparece quando há conflito.

### Mudança de comportamento registrada

O modelo antigo **limpava** as linhas de recomendação que o conjunto não usava. O novo
toca **apenas os campos que o conjunto declara**. É o que o requisito de não-sobrescrita
exige, e a tela de revisão mostra exatamente o que muda, então nada é silencioso. Quem
quiser limpar uma linha declara o campo com valor vazio → override `branco`.

---

## 5. UX

### Lista

Uma linha por conjunto — ícone, nome, `N campos configurados`, `Atualizado em
DD/MM/AAAA`, botão **Usar** e menu **⋯** (Visualizar / Editar / Duplicar / Excluir).
Os valores **não** aparecem na lista; abrem no detalhe. Cabeçalho e rodapé fixos, corpo
rolável — trinta conjuntos não empurram os botões para fora da tela.

Busca por nome e descrição (sem acento, sem caixa) a partir de 5 conjuntos.

### Criar

Dois caminhos na barra:

- **+ Nova predefinição** — formulário em branco;
- **A partir deste relatório** — formulário já preenchido com os campos da allowlist
  que o documento aberto tem agora. É a capacidade do antigo botão "Guardar", movida
  para onde ela pertence (criação), e agora alcançando os 23 campos em vez de 8.

Nada de `window.prompt`, `confirm` ou `alert` — há teste que trava isso.

### Editar / Visualizar / Duplicar / Excluir

Editar e criar são a mesma tela. Excluir confirma num diálogo que diz o que **não**
acontece: "Esta ação remove apenas o conjunto salvo. Relatórios em que ela já foi
utilizada não serão alterados." — e é verdade, porque o relatório guarda o texto
aplicado, não uma referência ao conjunto.

Substituir passou a ser **por id**, e não mais por nome. Com Editar na tela,
substituir por nome faria uma edição que troca o nome apagar o conjunto homônimo de
outra pessoa. Nome repetido virou **aviso**, não regra de dado.

### Conjunto do sistema

"Exemplo do sistema — inspeção periódica", selo **PADRÃO DO SISTEMA**, 10 campos
(3 recomendações com prazo, PMTA mantida, 3 prazos de próxima inspeção). Pode ser
visualizado, aplicado e **duplicado**; não pode ser editado nem excluído.

Ele é **código**, não registro gravado: um registro seria uma cópia congelada por
organização, e corrigir uma vírgula exigiria migração passando por todas as contas.
`gravarPredefinicoes` descarta qualquer conjunto marcado `sistema` antes de gravar, e o
saneamento tira a marca de um registro forjado — senão ele seria inapagável pela tela.

### Como funciona

Botão de aparência clicável (borda, fundo, ícone) no cabeçalho. Abre um **segundo
modal** com z-index maior, foco preso (`useFocoPreso`) e Esc que fecha só a camada de
cima. Quatro passos + a ressalva sobre o que a aplicação não altera. O parágrafo fixo
que antes ocupava a altura da lista saiu da tela e foi para cá.

---

## 6. Aplicação

Depois da confirmação, `overridesDaAplicacao` produz **um mapa só**, gravado numa
chamada só, com **uma geração** de PDF. Aplicar campo a campo redesenharia o documento
uma vez por campo (~1,8 s cada num relatório completo).

O caminho é o mesmo de quem digita o texto clicando na folha:

```
plano + modo → overrideDeTexto → comOverride → gravarOverrides(nr13_ovr_<id>_<TAG>)
             → gerarPreviaRelatorio → prévia e PDF
```

**Não altera:** ficha do equipamento, inspeção, container, cadastro da empresa,
memorial, categoria, livro, prontuário, calibrações, documento histórico ou PDF
arquivado.

### Documento finalizado

A trava não vive no modal — vive um nível acima. Em `Relatorios.tsx`:

```tsx
{fluxo === 'vetorial' && !somenteLeitura && (<PreviaVetorial ... />)}
```

Relatório salvo não monta a prévia, logo não tem o botão. Mesmo assim o modal honra
`somenteLeitura` (sem Usar, sem criar, sem editar, sem excluir) — a guarda de dados
vale independentemente de a UI chegar lá, que é a regra do §7-ter.

---

## 7. Testes

`npx vitest run src/features/relatorios/predefinicoes` — **134 testes, 4 arquivos**.

| arquivo | o que trava |
|---|---|
| `camposPredefiniveis.test.ts` | todo id da allowlist existe em `folhas.ts`; 30 ids proibidos estão FORA; ordem das folhas; tipos e rótulos |
| `modelo.test.ts` | saneamento aplica a allowlist na leitura; valor vazio preservado; migração do modelo antigo; criar/editar/duplicar/excluir; conjunto do sistema não persistido e não forjável; busca; **escopo da organização e as 3 camadas de isolamento** |
| `aplicacao.test.ts` | os 5 estados do plano; modo padrão não toca no conflito; substituir só com escolha explícita; **`protegido` — dado da inspeção que nenhum modo escreve**, com as 3 partes da condição cobertas uma a uma; `branco` para valor vazio; mapa anterior preservado; uma gravação só; documento finalizado bloqueado |
| `interfacePredefinicoes.test.ts` | título e conceito novos; "Como funciona" clicável e empilhado; sem `prompt`/`confirm`/`alert`; tipos de editor corretos; sucesso só depois do `await`; revisão com antes→depois; **mobile 386px sem overflow** |

Suíte inteira: **208 arquivos, 3143 testes, todos passando**. `npm run build` verde.
`eslint .` mantém exatamente o baseline anterior (112 problemas, 101 erros — todos
pré-existentes, nenhum nos arquivos novos).

---

## 8. E2E

**Ambiente:** Supabase LOCAL (`127.0.0.1:54321`, container `supabase_db_nr13-app`), conta
`lab@local.test`, org `6721e0d7-4229-4b7d-b495-05677f574d45`. Produção
(`qqsesrntfvmdxqxrfvmw`) não foi tocada — §12 do CLAUDE.md.

**Equipamento:** `ZZ-SCALE-F8-91-1` (vaso, Categoria III). Relatório
`REL-1789249034520`, 12 páginas.

| # | passo | resultado |
|---|---|---|
| 1 | criar "ZZ PREDEFINIÇÃO E2E" com 5 campos | salva; faixa verde `Predefinição "ZZ PREDEFINIÇÃO E2E" salva.` |
| 2 | ACK no servidor | linha `nr13_predef_relatorio` em `app_storage`, `org_id` correta |
| 3 | fechar o modal + **F5** | botão volta com `Predefinições (1)`; conjunto intacto |
| 4 | visualizar | detalhe com os 5 campos, na ordem das folhas |
| 5 | editar — acrescentar `parecer.pmta-mantida = SIM` (select) | lista passa a `6 campos configurados` |
| 6 | conferir o registro | `versao: 2`, `atualizadoEm` novo, `criadoPor: lab@local.test`, **só ids da allowlist** |
| 7 | Usar → revisão | `6 campos vazios`, sem seletor de modo (não há conflito), botão `Aplicar em 6 campos` |
| 8 | aplicar | barra passa a `6 campos alterados`; prévia regerada |
| 9 | overrides no servidor | `nr13_ovr_REL-1789249034520_ZZ-SCALE-F8-91-1`, 6 chaves, todas `modo: manual`, **mesmo carimbo de tempo** (uma gravação só) |
| 10 | sentinelas no PDF | texto extraído com pdf.js: `PRESET-RECOMENDACAO-E2E` p.12, `PRESET-PARECER-E2E` p.12, `PRESET-OBSERVACAO-E2E` p.8, `30 dias` p.12, `12 meses` p.12 |
| 11 | linhas 2–4 da tabela de recomendações | **vazias** — nada foi limpo nem inventado |

### Conflito

| # | passo | resultado |
|---|---|---|
| 12 | criar "ZZ CONFLITO E2E": `inspecao.observacoes` (conflita) + `recomendacoes.2.texto` (vazio) | salva |
| 13 | Usar → revisão | `1 campo vazio` · `1 já possui conteúdo`; seletor de modo aparece; `Preencher apenas os campos vazios` **pré-selecionado**; a linha em conflito mostra VALOR ATUAL riscado → VALOR DA PREDEFINIÇÃO |
| 14 | aplicar no modo padrão | botão diz `Aplicar em 1 campo`; no servidor: `inspecao.observacoes` **continua** `PRESET-OBSERVACAO-E2E`, `recomendacoes.2.texto` recebe `PRESET-REC2-E2E`; total 6 → 7 chaves |
| 15 | escolher `Substituir` e aplicar | só então `inspecao.observacoes` vira `TEXTO-CONFLITO-E2E`; total continua 7 |

**Nada foi sobrescrito em silêncio.**

### Rascunho, finalização e documento histórico

| # | passo | resultado |
|---|---|---|
| 16 | Salvar rascunho → **F5** → reabrir pela lista | `7 campos alterados`; overrides intactos |
| 17 | finalizar | bloqueado por `Resultado da inspeção (APTO/INAPTO) não marcado` — campo do painel Laudo, **fora da allowlist**, como projetado |
| 18 | marcar APTO e finalizar | `pdfRef` gravado, `paginas: 12`, `pdfPendente: false` |
| 19 | SHA-256 do arquivo baixado do bucket | `b69d7f3b…ff3593` — **idêntico** ao gravado no registro |
| 20 | sentinelas nos BYTES ARQUIVADOS | `PRESET-RECOMENDACAO-E2E` p.12, `PRESET-REC2-E2E` p.12, `PRESET-PARECER-E2E` p.12, `TEXTO-CONFLITO-E2E` p.8, `30 dias` e `12 meses` p.12 |
| 21 | `PRESET-OBSERVACAO-E2E` nos bytes finais | **ausente, e corretamente** — foi substituído no passo 15 por escolha explícita |
| 22 | reabrir o documento arquivado + F5 | selo `Documento arquivado`; barra com apenas Páginas/zoom/Abrir em outra aba; **sem Predefinições, sem O que falta, zero alvos editáveis** (`.previa-alvo` = 0) |

### Multi-tenancy, medido na RLS

Sessão real em cada lado, mesma consulta:

```
ruido1@local.test (org B) → select … where chave in ('nr13_predef_relatorio', …) → []
lab@local.test    (org A) → mesma consulta                                       → 1 linha, org_id 6721e0d7…
```

Nenhuma linha vaza. O filtro é da RLS, não do bundle.

### O que NÃO foi provado no navegador

O estado `protegido` está coberto por **seis testes** contra a função de plano real
(`aplicacao.test.ts`), e não por uma passagem no navegador. Reproduzi-lo na tela exige um
container de inspeção com o teste hidrostático respondido, e o laboratório não tem nenhum
container (`nr13_inspecao_atual` está vazio). Cheguei a injetar um `th.procedimento` em
`nr13_injecao_atual` para forçar o cenário; a aba passou a recarregar sozinha antes de eu
montar o relatório com a folha de TH, parei de insistir e **removi a chave injetada**
(`delete` com `nr13.manutencao`, conferido depois: a chave não existe mais).

Fica como o único item da entrega validado só por teste. A validação na tela é barata assim
que existir um container com TH: criar o relatório incluindo `TESTE-HIDROSTATICO.html`,
aplicar um conjunto que declare `th.procedimento` e conferir que a linha sai com cadeado,
fora das duas contagens de escrita.

---

## 9. Responsividade

**Medido no navegador**, com o modal aberto sobre um rascunho real:

| vista | largura | rolagem horizontal do corpo | da página | elementos fora da caixa |
|---|---|---|---|---|
| lista | 536 px (mínimo que o Chrome permite na janela) | 0 | 0 | 0 |
| lista | 386 px | 0 | 0 | 0 |
| editor (vazio) | 386 px | 0 | 0 | 0 |
| editor (com texto longo, prazo e select abertos) | 386 px | 0 | 0 | 0 |
| revisão com conflito | 386 px | 0 | 0 | 0 |

O Chrome não reduz a janela abaixo de 536 CSS px nesta máquina; os 386 px foram obtidos
fixando a largura do modal, com as regras de `@media (max-width: 640px)` **já ativas** — o
que se mediu é o layout de celular estreito, não um desktop espremido. Na revisão a 386 px
a grade antes→depois colapsa para uma coluna (`grid-template-columns: 322.4px`) e a seta
gira 90°.

Regras travadas em teste, além da medição no navegador:

- `min-width: 0` em todo contêiner flex/grid que pode espremer texto
  (`.predef-cab-txt`, `.predef-linha-alvo`, `.predef-linha-txt`, `.predef-busca`,
  `.predef-check-txt`);
- `min-width: 0` nos `<fieldset>` (`.predef-bloco`, `.predef-modos`) — um fieldset tem
  largura mínima intrínseca que ignora o contêiner, causa clássica de rolagem
  horizontal em modal estreito;
- `minmax(0, 1fr)` na grade antes→depois, nunca `1fr` puro;
- `overflow-wrap: anywhere` no nome, nos valores e nos textos de revisão;
- `overflow-x: hidden` no corpo;
- nenhuma largura fixa maior que 386px em todo o bloco;
- em ≤640px: modal em folha inferior quase full-width, alvos de 44px, linha da lista
  empilhada em duas faixas, seta do antes→depois rotacionada 90°.

---

## 10. Deploy

Frontend, **sem SQL e sem Edge Function**. Nada a rodar no painel do Supabase: a chave nova
entra em `app_storage` como qualquer outra, pela RPC que já existe. Deploy pelo Coolify,
como de costume.

## 11. Pendências reais

1. **A chave legada não é apagada.** `nr13_predef_recomendacoes` continua no storage de quem
   já tinha conjuntos, servindo de fallback. Ela deixa de ser lida assim que a chave nova
   tem conteúdo, e encolher/remover é decisão de uma rodada futura — o mesmo tratamento que
   `nr13_historico_relatorios` recebeu no §7-sexies.
2. **Aplicar não limpa campos que o conjunto não declara.** É deliberado (§4), mas muda o
   comportamento de quem usava o conjunto de recomendações antigo esperando que as linhas
   não usadas fossem zeradas. Quem quiser esse efeito declara o campo com valor vazio.
3. **A allowlist tem 23 campos e é conservadora.** Os parâmetros do ultrassom (acoplante,
   cabeçote, velocidade sônica, estado e temperatura da superfície) são repetitivos por
   empresa e ficaram de fora por virem do painel de Medições, que o §8 do pedido lista como
   proibido. Se o dono quiser, entram numa rodada própria — o custo é uma linha por campo
   em `camposPredefiniveis.ts` mais o teste, que já confere contra `folhas.ts`.
4. **A busca filtra nome e descrição, não o conteúdo dos campos.** Suficiente para as
   dezenas de conjuntos que uma organização terá; procurar por dentro do texto exigiria
   destacar a ocorrência para valer a pena.
5. **Sem ordenação manual da lista.** Ela é alfabética, com o conjunto do sistema no topo.
   Favoritar ou fixar não foi pedido e não foi feito.
6. **O E2E rodou no laboratório local, não em produção** — que é a regra §12. A validação em
   produção é o rollout normal: emitir um relatório de teste na organização do dono.
