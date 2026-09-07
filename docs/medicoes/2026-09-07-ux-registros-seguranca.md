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
