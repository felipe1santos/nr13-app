# 9F.4 · `/livro-registro` — implementação local e gate de escala

**02/09/2026** · Supabase **local** (`npx supabase start`), organização de
laboratório `lab9f@local.test`. **Produção não foi tocada:** nenhum SQL da 9F.4
aplicado lá, nenhuma flag criada lá, `livro_v9` não existe em produção.

AS-IS e escopo: `2026-09-02-9f4-livro-registro-as-is.md`.

---

## 1 · Antes × depois

| | antes (legado) | depois (`livro_v9` ON) |
|---|---|---|
| fonte da lista | `lerTudo()` — organização INTEIRA | `buscar_livros`, 50 por página |
| medido em produção | **780 KB** para desenhar 1 linha (org de 39 equip.) | **2,4 KB** por página, constante |
| parse por equipamento | 3 (`info` + `livro` + `cat`), e descarta 38 de 39 | zero |
| quem filtra "tem livro" | o cliente, depois de baixar tudo | o servidor, no índice |
| busca | **não existe** | por TAG, fabricante, cliente |
| paginação | não existe (tabela inteira) | keyset por TAG |
| contagem de registros | `entradas.length` do JSON local | coluna `livro_entradas` |
| último registro | último item do array | `max` das datas |
| livro, lacre, cadeia, termo | da verdade (`app_storage`) | **da verdade — inalterado** |

## 2 · Arquitetura

```
                 lista                              livro
  ┌────────────────────────────────┐   ┌──────────────────────────────┐
  │ buscar_livros / contar_livros  │   │  nr13_livro_<TAG>            │
  │  ← equipamentos_index          │   │  nr13_livro_config_<TAG>     │
  │    livro_entradas, livro_ultima│   │  nr13_termo_livro_<TAG>      │
  │  índice parcial "tem livro"    │   │  ← app_storage  (A VERDADE)  │
  └────────────────────────────────┘   └──────────────────────────────┘
        CATÁLOGO — descartável                AUTORIDADE — lacrada
        reconstruível do zero                 imutável no banco
```

**A projeção nunca vira autoridade.** `projetar_equipamento` **lê**
`nr13_livro_<TAG>` e escreve duas colunas de catálogo; não normaliza, não
reescreve, não versiona a verdade. O bloco 6 do `testes-9f4.sql` compara o
conteúdo **byte a byte** antes e depois de projetar, e confere que `versao` não
mudou — se alguém um dia "melhorar" a projeção mexendo na origem, fica vermelho.

O lacre continua onde estava: `verificarCadeia` / `verificarEntrada` leem as
entradas da verdade, ao abrir. Não migrou, e não deve — conferir o lacre no
servidor com o dado que o próprio servidor projetou seria o servidor atestando a
si mesmo.

### Peças

| arquivo | o quê |
|---|---|
| `supabase/busca_index.sql` | `livro_entradas integer` + `livro_ultima date`, **nullable, sem default** |
| `supabase/busca_manutencao.sql` | a projeção conta, e o `on conflict` **grava as duas** |
| `supabase/busca_index_rpc.sql` | dispatch de `nr13_livro_%`, com `nr13_livro_config_%` excluído antes |
| `supabase/busca_livro.sql` | `buscar_livros` / `contar_livros` + **índice parcial** |
| `supabase/livro_v9_flag.sql` | a flag `livro_v9`, default `false`, com rollback próprio |
| `src/services/flag.ts` | `livroV9Ativa` + o **6º degrau** da escada de recuo |
| `src/features/livro/buscaLivro.ts` | a chamada da RPC, keyset, `null` preservado |
| `src/features/livro/catalogoLivro.ts` | semear → ler, e as regras de `null` |
| `src/features/livro/CatalogoLivroV9.tsx` | a lista nova |
| `src/pages/LivroRegistro.tsx` | a flag, `montarLinha(tag)` e `abrirPorTag` |

## 3 · O gate 1k / 10k / 50k — **somente Supabase local**

`scripts/fase9/lab-9f4-massa.sql` + `scripts/fase9/bench-9f4.sql`.

| degrau | equipamentos | na lista | 1ª página | busca por TAG | 2ª página | contagem | buffers | bytes/página |
|---|---|---|---|---|---|---|---|---|
| **1k** | 1.002 | 21 | 0,068 ms | 0,032 ms | 0,024 ms | 0,083 ms | 24 | 966 B (21 linhas) |
| **10k** | 10.002 | 201 | 0,101 ms | 0,051 ms | 0,100 ms | 0,091 ms | 54 | 2.377 B (51) |
| **50k** | 50.002 | 1.001 | 0,074 ms | 0,035 ms | 0,057 ms | 0,209 ms | 54 | 2.377 B (51) |

**O custo não cresce com o parque.** 50× mais equipamentos: mesmos buffers,
mesmos bytes, mesmo tempo. É a diferença entre "a lista custa o resultado" e "a
lista custa a organização".

### O índice parcial nasceu de uma medição que contrariou a expectativa

A primeira versão rodava sobre `equipamentos_index_pkey (org_id, tag)`. O
predicado "tem livro" não é indexável ali, então o Index Scan percorria a
organização inteira descartando linha a linha até juntar 51.

**Medido com 1.002 equipamentos e 21 na lista: 125.623 buffers e 79,7 ms para
devolver 21 linhas.** Teria trocado o `lerTudo()` do cliente por uma varredura no
servidor — o mesmo defeito, de roupa nova. Com
`equipamentos_index_livro_idx (org_id, tag) where livro_entradas is null or
livro_entradas > 0`: **22 buffers e 0,228 ms**. O predicado do índice é idêntico
ao da consulta, palavra por palavra; se divergirem, o planner deixa de casar e o
custo volta em silêncio.

### Virtualização: decisão MEDIDA, e a decisão foi não

As outras telas da 9F virtualizam. Esta não, e o gate é quem diz por quê: a lista
já é filtrada no servidor, então o DOM é **no máximo 51 linhas por página em
qualquer degrau** — 51 com 50.000 equipamentos, igual a 51 com 1.000. Virtualizar
isso adicionaria observador de rolagem, medição de altura e uma classe de defeito
conhecida (a rolagem que não volta ao topo na busca, que o gate da 9F.1 pegou)
para resolver um problema que não existe. A **paginação por keyset fica**, porque
é ela que impede a página gigante.

## 4 · Prova de zero `lerTudo()`

`listaSemParse.test.ts` lê os arquivos do caminho novo e exige, sobre o código
sem comentários:

- `CatalogoLivroV9.tsx` não contém `lerTudo`, `JSON.parse`, `nr13_livro_`,
  `listarChavesComPrefixo`, `montarLinhas`, nem importa `services/storage`;
- `buscaLivro.ts` idem, e usa `buscar_livros` com `p_cursor`;
- `LivroRegistro.tsx` **ainda tem** `lerTudo` (o rollback não foi removido) —
  mas atrás de `deveHidratarListaLegada`.

O último é deliberado: se alguém apagar o caminho antigo antes da 9G, o teste
fica vermelho.

## 5 · Prova de abertura sob demanda

`semeaduraLivro.test.ts`, 14 asserções. As duas que carregam o risco:

- **cruzamento** das 9 famílias por TAG que a tela e os 3 templates leem
  (`nr13_livro_`, `_config_`, `termo_livro_`, `info_`, `cat_`, `calc_`, `emp_`,
  `laudo_`, `assinantes_rel_`) contra `chavesDoEquipamento(tag)`;
- **ordem**: `carregarEquipamento` roda antes de qualquer `ler()`.

### Mutation tests — o guard tem mordida

| mutação | resultado |
|---|---|
| remover `'nr13_livro_'` de `POR_TAG` | **3 testes vermelhos**, apontando a família e o template |
| ler antes de semear em `abrirEquipamentoParaLivro` | **1 teste vermelho** (a ordem) |
| remover a exclusão de `nr13_livro_config_` do dispatch | **continuou verde — e isso é um achado, não uma falha do teste** |

O terceiro contrariou a expectativa e está registrado como tal no
`testes-9f4.sql`: o fantasma `config_<TAG>` **não nasce** mesmo sem a exclusão,
porque `projetar_equipamento` exige `nr13_info_<TAG>` viva e, sem ela, apaga a
linha e retorna. A exclusão **fica** — evita reprojeção inútil a cada gravação de
cabeçalho, e é defesa em profundidade se um dia aquela guarda afrouxar — mas a
asserção foi reescrita para afirmar o que é verdade (a guarda de `nr13_info_`),
e não o que seria conveniente.

## 6 · Prova de paridade do Livro

- **O conteúdo não muda**: bloco 6 do `testes-9f4.sql` compara `valor` byte a
  byte e `versao` antes/depois de projetar.
- **A linha é montada pela MESMA função** nos dois caminhos: `montarLinha(tag)`
  foi extraída de `montarLinhas()`, e ambos a usam. Compor de novo na tela nova é
  como as divergências de cartão nasceram na 9C.
- **O que vem depois da lista é literalmente o mesmo código**: timeline, lacre,
  termo, visualizador, PDF e ocorrência manual não foram duplicados — a flag
  troca a FONTE DA LISTA, não o documento.
- **`0` × `null` × `N`** exercitados no servidor (blocos 1–3) e no cliente
  (`rotuloRegistros`, `entraNaListaDoLivro`).

## 7 · Testes

| suíte | resultado |
|---|---|
| `scripts/fase9/testes-9f4.sql` | **32/32** |
| `scripts/fase9/testes-9f3.sql` (regressão) | **31/31** |
| `scripts/fase9/testes-9f2.sql` (regressão) | **18/18** |
| `scripts/fase9/testes-9f.sql` (regressão 9F.1) | **12/12** |
| vitest | **1608/1608** (135 arquivos) — eram 1561 |
| `massa.test.mjs` (trava de produção) | **35/35** |
| `tsc -b` + build | verde |

Os 47 testes novos: 14 de semeadura, 15 do mapeamento da RPC, 10 da lista sem
parse, 8 da escada de flags.

## 8 · Riscos encontrados

1. **O índice parcial era obrigatório, e só a medição mostrou.** Sem ele a etapa
   teria "funcionado" e trocado um desperdício por outro. Registrado no §3.
2. **`nr13_livro_config_` casa o `like` de `nr13_livro_`.** A exclusão existe; a
   investigação mostrou que a proteção real é outra (§5).
3. **A data do último registro não é o último item do array.** Ocorrência manual
   e retificação entram no fim com data anterior — usar o último elemento
   mostraria uma data já passada como "último registro". Virou `max`, com teste.
4. **`erasableSyntaxOnly`**: o build (`tsc -b`) recusa `readonly` como parâmetro
   de construtor, e o `tsc --noEmit` não. Pego pelo build, como a memória do
   projeto já registrava.
5. **Duas colunas novas em `ItemCatalogo` quebram todo literal do tipo.** Três
   fixtures de teste e o caminho de itens pendentes precisaram das duas chaves —
   e o pendente recebe `null`, não `0`, pelo mesmo motivo das outras etapas.

## 9 · Limitações — declaradas, não presumidas

- ~~O gate de NAVEGADOR não foi executado.~~ **EXECUTADO em 02/09 à noite — ver §11.** DOM real, heap e requisições da aba
  não foram medidos: o grupo de abas do Chrome desta sessão foi substituído no
  meio do trabalho e o acesso se perdeu. O que está no §3 é medição de
  **servidor** (buffers, tempo, bytes, linhas por página) e prova **estática** de
  ausência de `lerTudo()`. O número de linhas por página (51) é o teto do DOM por
  construção, mas isso é dedução, não medição.
- **Offline**: a lista nova não tem catálogo local — sem rede ela avisa e fica
  vazia, em vez de cair em hidratação integral (o desenho §16 proíbe). O livro
  já baixado continua abrindo. Não exercitado com rede desligada.
- **Escala em produção não foi exercitada**, e por regra não será (§12 do
  `CLAUDE.md`).
- **`EQUIPE TESTE` não foi usada em teste nenhum.** O livro dela é protegido por
  imutabilidade; a massa da 9F.4 usa `VL-*` e `ZZ-LIV`, criadas e removidas pelo
  próprio script.

## 10 · Roteiro de rollout controlado (NÃO EXECUTADO)

Nada disto foi feito. É a proposta para quando houver autorização.

1. Aplicar em produção, **nesta ordem**, conferindo cada arquivo **por SHA-256
   antes de rodar** (§13 do `CLAUDE.md`) e por `prosrc` depois:
   `busca_index.sql` → `busca_manutencao.sql` → `busca_index_rpc.sql` →
   `busca_consulta.sql` → `busca_livro.sql` → `livro_v9_flag.sql`.
2. Conferir: colunas nullable **sem default**; `livro_entradas` não-nula em
   **zero** linhas; o índice parcial criado; `livro_v9` OFF nas 30 organizações.
3. Reprojetar **TAG a TAG** só na organização de teste — `reconstruir_indice_busca`
   vira no-op com o cursor no fim e não repreencheria coluna nova.
4. Provar os três estados em produção: `null` (não reprojetada), `0` (reprojetada
   sem livro) e `N` (com livro), com `auditar_projecao` convergente.
5. Baseline com a flag OFF; ligar só na organização de teste; conferir paridade
   da lista e **abrir um livro real**, verificando as entradas e o selo do lacre.
6. Rollback para OFF e confirmar que as seis flags anteriores seguem intactas.

---

## 11 · GATE REAL DE NAVEGADOR (02/09/2026, noite)

O §9 declarava este gate como **não executado**. Foi executado agora.

### 11.1 · Pré-condições confirmadas antes de medir

| item | evidência |
|---|---|
| aplicação | `location.origin` = `http://localhost:5178` |
| Supabase | `.env.local` → `http://127.0.0.1:54321`, e a stack local respondeu `auth/v1/health` **200** |
| produção | **0 requests** para `qqsesrntfvmdxqxrfvmw` em toda a sessão, medido no Resource Timing |
| trava anti-produção | `massa.test.mjs` **35/35** |
| massa | só `VL-*`/`ZZ-LIV` do `lab-9f4-massa.sql`. **`EQUIPE TESTE` não foi usada** |
| Menuzia/Dayse | a aba do projeto dela ficou aberta e **não foi tocada** |

### 11.2 · Dois obstáculos de ambiente, e o que eles ensinaram

1. **A stack local estava sem publicar portas.** Todos os containers `Up`, nenhum com
   mapeamento (`8000/tcp`, não `54321->8000`). O app dava "Failed to fetch" e o Kong parecia
   saudável. `supabase stop` + `start` recriou os containers com as portas; os **volumes
   foram preservados** ("Starting database from backup...") e a massa continuou lá.
2. **Um service worker (`nr13-cache-v8`) controlava `localhost`** e servia bundle antigo por
   cima do dev. O sintoma era enganoso: React montava, console limpo, e **nenhum handler
   respondia** — o formulário de login fazia submit HTML nativo em vez de chamar o `onSubmit`.
   Desregistrar o SW e limpar os caches resolveu na hora. É a armadilha já registrada na
   memória do projeto, e ela reaparece em `localhost` porque o SW de produção casa a origem.

### 11.3 · A tabela do gate — `livro_v9` ON

| | **1k** | **10k** | **50k** |
|---|---|---|---|
| equipamentos no banco | 1.002 | 10.002 | 50.002 |
| com livro (`>0`) | 11 | 101 | 501 |
| não contados (`null`) | 10 | 100 | 500 |
| **na lista** (`null` ou `>0`) | 21 | 201 | 1.001 |
| **resultados mostrados** | 21 | 50 | 50 |
| **linhas montadas** | 21 | 50 | 50 |
| **DOM nodes** | 660 | 1.214 | 1.214 |
| **heap** | 30,6 MB | 32,0 MB | 32,1 MB |
| **requests (abertura)** | 2 | 2 | 2 |
| **bytes** | 2.726 B | 6.580 B | 6.610 B |
| `buscar_livros` | 1 | 1 | 1 |
| `contar_livros` | 1 | 1 | 1 |
| **`app_storage`** | **0** | **0** | **0** |
| **long tasks** | 0 | 0 | 0 |
| DCL (carga completa) | 1.801 ms | — | — |

**O custo é constante.** De 10k para 50k — 5× mais equipamentos — DOM, heap, requests e
bytes são iguais. A página é limitada a 50 por construção.

### 11.4 · As cinco provas pedidas, no navegador

| prova | evidência medida |
|---|---|
| zero `lerTudo()` ao abrir | **0 requests a `/rest/v1/app_storage`** nos três degraus |
| zero download de `nr13_livro_` na lista | idem — a única chamada é a RPC do catálogo |
| zero parse de livro por equipamento | a lista recebe 6,6 KB de metadados; o livro nunca chega |
| página limitada | 50 linhas no DOM com 1.001 elegíveis |
| custo não cresce | tabela do §11.3 |

### 11.5 · Busca e paginação

| caso | resultado | `app_storage` |
|---|---|---|
| TAG `ZZ-LIV` | 1 linha, exata | 0 |
| fabricante `Metalúrgica` | 50 linhas | 0 |
| cliente `Frigorífico` | 50 linhas | 0 |
| TAG `VP-01000` | 2 linhas (prefixo + token) | 0 |
| termo inexistente | 0 linhas, mensagem de vazio | 0 |
| limpar busca | volta a 50 | 0 |

**Keyset:** seis páginas carregadas — 50 → 100 → 150 → 200 → 250 → **300 itens**,
**0 duplicados** (300 únicas), ordenação crescente estável (`VP-00050` … `VP-15000`),
5 requests, **0 a `app_storage`**. Nenhum item perdido.

> **Custo do DOM ao acumular páginas:** 300 linhas = 5.964 nodes, heap 41,6 MB. É o limite
> conhecido da decisão de não virtualizar: quem rolar as 1.001 linhas do degrau de 50k
> chegaria a ~20 mil nodes. Fica registrado como o número que decide, se um dia decidir.

### 11.6 · Abertura sob demanda — a ordem, medida na rede

**Antes do clique:** 0 requests de livro, 0 de `app_storage`.

**Ao clicar em "Abrir livro" de `ZZ-LIV`:** exatamente **1 request — `/rest/v1/app_storage`**
(a semeadura da TAG). Depois dela, o livro montado:

| | conteúdo |
|---|---|
| cabeçalho | `ZZ-LIV — Vaso do gate 9F.4`, CAT. III |
| contagem | **4 REGISTRO(S)** |
| entradas | nº 000001, 000002, 000003, 000004 |
| datas | 12/01/2026 · 03/08/2026 · 20/03/2026 · 15/05/2026 |
| tipos | Inspeção Inicial · Inspeção Periódica · Manutenção Corretiva · Ajuste/Calibração |
| lacre | "Sem lacre" nas quatro — **correto**: a massa cria entradas sem `sha256`, e entrada sem lacre é ANTIGA, não adulterada. O mecanismo rodou e classificou certo |
| termo de abertura | presente |
| ocorrência manual | botão presente |
| PDF | "Exportar PDF" presente, **não acionado** — nenhum PDF histórico foi regenerado |

### 11.7 · Paridade OFF × ON

**O livro aberto é IDÊNTICO** nos dois caminhos, campo a campo: mesmas 4 entradas, mesmos
números, mesmas 4 datas, mesmos 4 tipos, mesmo selo de lacre, termo, ocorrência e PDF.

Diferenças na LISTA, todas esperadas: o legado não tem busca, não pagina e mostra o badge
"1 LIVRO GERADO".

> **UMA DIVERGÊNCIA FUNCIONAL, E ELA É DELIBERADA:** a coluna "Último registro".
> Legado **15/05/2026** × novo **03/08/2026**, para o mesmo livro.
>
> O legado lê `entradas[entradas.length - 1].data` — o último ELEMENTO do array. O novo usa o
> `max` das datas. A massa tem as entradas fora de ordem cronológica de propósito (12/01,
> 03/08, 20/03, 15/05), que é o que ocorrência manual e retificação produzem na vida real.
>
> **O novo está certo e o legado está errado**: a coluna diz "último registro", e o registro
> mais recente é 03/08. É correção de defeito, não regressão — mas é mudança visível, está
> travada por teste (`testes-9f4.sql` §2) e **precisa de decisão do dono** antes do rollout.

> **Nota sobre a contagem da lista no laboratório:** com a flag ON a lista mostra 21 linhas e
> o legado mostra 1. Não é divergência de produto: a massa grande escreve `livro_entradas`
> direto na projeção **sem** criar o livro correspondente em `app_storage` (declarado no
> cabeçalho do `lab-9f4-massa.sql` — gerar 50.000 livros mediria o gerador, não a tela). O
> legado só enxerga livro real; por isso vê um. As TAGs de paridade (`ZZ-LIV`) passam pela
> projeção de verdade, e é por elas que a comparação de conteúdo vale.

### 11.8 · O legado não sobrevive a 50k — medido

Com `livro_v9` **OFF** e 50.002 equipamentos, abrir `/livro-registro` **congelou o renderer**:
o CDP passou a responder `Runtime.evaluate timed out` e a aba precisou ser fechada. É a
hidratação integral fazendo exatamente o que a etapa existe para impedir. A comparação de
paridade do §11.7 foi feita em **1k**, onde o legado ainda roda.

### 11.9 · Fechamento

| | |
|---|---|
| `testes-9f4.sql` | **32/32** |
| regressões 9F.3 / 9F.2 / 9F.1 | **31/31** · **18/18** · **12/12** |
| vitest | **1608/1608** |
| `massa.test.mjs` | **35/35** |
| `tsc` + build | verdes |

**Nenhum defeito de produto encontrado no gate.** Os dois obstáculos (§11.2) eram ambiente, e
a única divergência funcional (§11.7) é uma correção deliberada que aguarda decisão.

---

## 12 · DECISÃO DO DONO — 02/09/2026

**Gate local APROVADO.** `9F.4 LOCAL = APROVADA` · `9F.4 = PRONTA PARA ROLLOUT CONTROLADO`.

### 12.1 · `Último registro = MAX(data)` — regra oficial

A divergência do §11.7 foi **aprovada como correção semântica**:

> `Último registro` significa o registro com a **MAIOR DATA cronológica válida** do Livro de
> Registro. **Não** significa o último elemento do array.
>
> Motivo: ocorrências manuais, retificações e outros eventos podem ser inseridos fora de ordem
> cronológica.
>
> | | cálculo | resultado no livro do gate |
> |---|---|---|
> | legado | último elemento do array | 15/05/2026 |
> | **V9** | **`max` das datas** | **03/08/2026** |
>
> **NÃO É REGRESSÃO.** Uma futura tentativa de "corrigir a paridade" com o legado estaria
> restaurando o comportamento errado.

Registrada em quatro lugares, de propósito: aqui, no `PONTO-DE-RETOMADA.md`, no plano
task-level e **no próprio `busca_manutencao.sql`**, junto do código que a implementa.

### 12.2 · Virtualização — limitação declarada, não bloqueante

O dono aceitou a não-virtualização da lista acumulada, com os motivos: página inicial limitada
a 50, zero long tasks no gate, produção com poucos livros hoje, e o problema extremo só depois
de acumular muitas páginas. **Não adicionar virtualização sem evidência de necessidade real.**
