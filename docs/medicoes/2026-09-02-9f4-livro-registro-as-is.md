# 9F.4 · `/livro-registro` — AS-IS medido

**02/09/2026** · SOMENTE ANÁLISE. Nada implementado, nada aplicado, nenhuma flag criada.
Mesmo molde da 9F.3.0: entender o caminho atual → medir → escopo. O rollout, quando houver,
é decisão separada.

---

## 1 · O defeito-alvo, medido em produção

A tela chama **`lerTudo()` — a hidratação INTEGRAL da organização** (`LivroRegistro.tsx:257`),
e é a única do sistema que ainda faz isso. O comentário no código já declara o porquê:

> "esta tela é a ÚNICA que ainda precisa da organização inteira. Ela cruza `nr13_info_` com
> `nr13_livro_<TAG>` de cada equipamento, e o livro não tem projeção — dar uma a ele é entrega
> da 9F."

Medido em produção, por organização com pelo menos um livro:

| org | equip. | livros | livro (bytes) | o que a tela precisa | o que `lerTudo` traz | desperdício |
|---|---|---|---|---|---|---|
| `06f84f2e…` | 39 | **1** | 7.209 B | 33 kB | **780 kB** | **95,7 %** |
| `99f642d3…` (teste) | 4 | 4 | 24 kB | 25 kB | 621 kB | 96,0 % |
| `32512667…` | 4 | 3 | 2.916 B | 5.392 B | 592 kB | **99,1 %** |
| `92a28bff…` | 3 | 1 | 18 kB | 19 kB | 355 kB | 94,5 % |
| `32d3fa95…` | 4 | 1 | **553 B** | 2.020 B | **308 kB** | **99,4 %** |
| `be25cb86…` | 2 | 1 | 2.623 B | 3.515 B | 163 kB | 97,9 % |

O caso mais caro é `06f84f2e`: **780 kB hidratados para desenhar UMA linha de tabela**, cujo
conteúdo de livro pesa 7,2 kB. O pior em proporção é `32d3fa95`, com **99,4 %** de desperdício.

**Só 6 das 30 organizações têm livro.** As outras 24 pagam a hidratação inteira para chegar a
uma tela vazia — a tela abre em "Nenhum livro de registro gerado ainda" depois de baixar a
organização toda.

## 2 · O universo real do livro, hoje

11 livros em toda a produção:

| entradas | livros |
|---|---|
| 10 | 1 (`VASO A23`, 22 kB) |
| 7 | 1 (`CMP001`, 7,2 kB) |
| 6 | 1 (`AUTOCLAVE ESTERILAV — SANTA CASA MAUÁ`, 18 kB, versão 17) |
| 3 | 1 |
| 2 | 2 |
| 1 | 5 |

> **Consequência de projeto:** o gargalo da 9F.4 **não é o volume do livro** — é a hidratação
> integral que a tela dispara para encontrá-lo. Uma projeção que devolva só
> `(tag, nome, categoria, nº de entradas, data da última)` já resolve a LISTA inteira; o
> conteúdo das entradas continua sendo lido por TAG, sob demanda, ao abrir um livro.

## 3 · O caminho atual, no código

`montarLinhas()` (`LivroRegistro.tsx:76`) varre **todas** as chaves `nr13_info_` e, para cada
equipamento, faz três leituras com `JSON.parse`: `nr13_info_`, `nr13_livro_` e `nr13_cat_`.
Depois `comLivro = linhas.filter(l => l.entradas.length > 0)` (linha 290) **descarta** quase
tudo que acabou de ser lido — na org de 39 equipamentos, 38 dos 39 são parseados e jogados fora.

Diferença importante em relação à 9F.3: **isto NÃO roda dentro do `.map()` do render.**
`montarLinhas` é chamada no inicializador do `useState` e depois de salvar uma ocorrência. O
custo é por MONTAGEM, não por quadro. O defeito da 9F.4 é de REDE e de BOOT, não de render.

A tela **não tem busca, não tem paginação e não tem virtualização** — a `<table>` desenha
`comLivro` inteiro (linha 1014). Hoje isso é inofensivo (11 livros no parque todo); com 1.000
equipamentos e livro em todos, passa a não ser.

## 4 · O que já existe e é reaproveitável

- `equipamentos_index` já tem `tag`, `descricao`, `tipo` e `categoria` — as três primeiras
  colunas da tabela saem dela **sem nenhuma coluna nova**.
- Faltam só duas: **quantidade de entradas** e **data da última** — exatamente o formato da
  `calibracoes integer` da 9F.3 (`null` = "não contei", nunca `0` por omissão).
- `projetar_chave` **já despacha** `nr13_livro_%`? **NÃO** — conferido: a família não está na
  lista de `projetar_chave`. Um despacho novo seria necessário, e é a única peça de servidor
  que a 9F.4 precisa além das colunas.
- `bootV9Ativo()` já guarda o `lerTudo` sob demanda; sob a flag nova, ele **sai**.

## 5 · Cuidado específico desta tela — o lacre

O livro é **lacrado** (§7-quinquies): `sha256`, `shaAnterior`, `lacradaEm`, verificados por
`verificarCadeia` + `verificarEntrada` a cada abertura de livro (`LivroRegistro.tsx:299`).

> **Isto NÃO pode migrar para a projeção.** A verificação precisa do conteúdo canônico da
> entrada, e conferir o lacre no servidor com o dado do próprio servidor seria o servidor
> atestando a si mesmo. A projeção pode contar entradas e guardar a última data; **a íntegra do
> livro e a conferência do lacre continuam vindo da verdade, por TAG, ao abrir.**

## 6 · Escopo proposto (para aprovação, NÃO iniciado)

| etapa | o quê |
|---|---|
| 9F.4.1 | colunas `livro_entradas integer` (nullable) e `livro_ultima date` em `equipamentos_index`, contadas de `nr13_livro_<TAG>` na projeção, com `= excluded.` no `on conflict` — o defeito que a 9F.2 pagou uma vez |
| 9F.4.2 | despacho de `nr13_livro_%` em `projetar_chave`, para a contagem não envelhecer |
| 9F.4.3 | `buscar_equipamentos` devolve as duas; `null` nunca vira `0` |
| 9F.4.4 | `CatalogoLivroV9`: lista da projeção + busca (que a tela nunca teve) + keyset; abrir um livro semeia a TAG e lê a verdade |
| 9F.4.5 | flag `livro_v9` + degrau na escada de recuo |
| 9F.4.6 | `testes-9f4.sql` + unidade + suíte + build |

**Fora de escopo, declarado:** o lacre e a íntegra do livro continuam na verdade (§5); o
`nr13_livro_` continua fora do palco; a trava de imutabilidade não é tocada.

## 7 · O que NÃO foi medido

- Tempo de parede e heap do navegador na tela (o gate de navegador da 9F.3 mediu isso para
  `/calibracoes`; aqui não foi feito).
- Comportamento com um parque grande de livros — não existe hoje em produção, e massa de
  escala roda **só em laboratório local** (§12 do `CLAUDE.md`).
