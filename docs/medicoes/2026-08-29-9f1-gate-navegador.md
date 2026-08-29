# Fase 9 · 9F.1 — GATE DE NAVEGADOR: a tela real com 1k / 10k / 50k (29/08/2026)

`InspecoesV9` rodando contra o **Supabase local** (`npm run dev` + `.env.local`), numa
organização de laboratório com `inspecoes_v9` e `boot_v9` ligadas **só nela**.
Massa crescida em degraus, **só metadados**.

> **Nada de produção foi tocado.** Nenhuma flag de cliente, nenhum SQL em produção,
> nenhum PDF regenerado. `cmam.caldeiras` intocada.

**Um defeito foi encontrado, corrigido com teste vermelho antes, e reconferido na
tela.** Ver §4.

---

## 1 · A PROVA CENTRAL

| equipamentos NO BANCO | linhas no DOM | nós no DOM | heap | PDF | leituras de `nr13_docs_` |
|---|---|---|---|---|---|
| **1.000** | **11** | 395 | 28,1 MB | **0** | **0** |
| **10.000** | **11** | 395 | 28,1 MB | **0** | **0** |
| **50.000** | **11** | 395 | 29,7 MB | **0** | **0** |

> **50.000 equipamentos no banco não são 50.000 no DOM.** O DOM ficou em **11 linhas** e
> **395 nós** nos três degraus — proporcional à JANELA, não ao acervo. O heap variou
> 1,6 MB entre 1.000 e 50.000 (5,7 %), dentro do ruído de coleta de lixo.
>
> Para comparação, o que a Fase 8 mediu na tela antiga de equipamentos: **42.283 nós**.

**Montar a tela** (navegação interna, sem recarregar): **2 requisições, 26,3 KB** —
exatamente `buscar_equipamentos` + `contar_equipamentos`. Nada mais:
zero `app_storage`, zero `storage/v1/object`, zero `.pdf`, zero `nr13_docs_`.

## 2 · Interações, todas com 50.000 no banco

| ação | resultado | linhas DOM | rede | PDF |
|---|---|---|---|---|
| abrir `/inspecoes` | "mais de 1.000 resultados" | 11 | 2 req · 26,3 KB | **0** |
| buscar TAG `VP-04999` | **11 resultados** | 11 | 2 req · 5,7 KB | **0** |
| buscar fabricante `Metalúrgica` | "mais de 1.000" | 13 | 2 req | **0** |
| buscar série `NS-012345` | **1 resultado** | 1 | 2 req · 0,5 KB | **0** |
| termo inexistente | "Nenhum equipamento encontrado para *zzzznaoexiste*." | 0 | 2 req · 0 KB | **0** |
| limpar busca | volta à lista completa | 11 | 2 req · 26,3 KB | **0** |
| **rolagem profunda** (3 páginas, 150 itens) | janela em VP-00100…112 | **13** (423 nós) | 2 × `buscar_equipamentos` · 52,8 KB | **0** |

**Long tasks: nenhuma** durante a sessão inteira — nem na rolagem, nem na digitação.

**Custo de uma busca: 2 requisições.** Não há terceira chamada escondida, e nenhuma
delas toca container ou arquivo.

## 3 · O que o gate existia para provar

### 3.1 · Zero container na lista

Em todos os cenários acima: **zero** leitura de `nr13_docs_`, **zero** `app_storage`,
**zero** download. A instrumentação envolveu `window.fetch` e inspecionou **URL e corpo**
de cada chamada — inclusive o corpo do POST, que é onde as chaves apareceriam.

### 3.2 · O pesado só chega DEPOIS da seleção

Clicando em `ZZ-TRES` com **50.000 no banco**:

| | |
|---|---|
| requisições | **1** (`app_storage`), **0,7 KB** |
| pediu as chaves daquela TAG? | **sim** — o corpo menciona `nr13_docs_ZZ-TRES` |
| containers na tela | **Rodada 1 · Rodada 2 · Rodada 3** |
| PDF | **0** |
| nós no DOM | 277 · heap 33,3 MB |

A semeadura acontece **antes** da leitura, e de **uma** TAG. É o `carregarEquipamento`
que a 9F.1.3 ligou — e que, até esta etapa, nenhuma tela chamava.

### 3.3 · Paridade do badge, na tela

As três TAGs de paridade passam pela projeção real (o container existe em `app_storage`):

| TAG | container | badge na tela |
|---|---|---|
| `ZZ-TRES` | 3 containers | **"3 Inspeções"** |
| `ZZ-ZERO` | array vazio | **"0 Inspeções"** |
| `ZZ-NULO` | sem a chave | **badge ausente** |

`null` não virou zero. `0` medido continua sendo escrito.

### 3.4 · Estado na URL

`?q=VP-04999` · `?q=ZZ-TRES&tag=ZZ-TRES` — recarregar, voltar e compartilhar preservam
busca e equipamento.

---

## 4 · O DEFEITO QUE O GATE ACHOU — e a correção

> **Com a lista rolada, buscar algo com poucos resultados deixava a área da lista
> VAZIA**, com o cabeçalho escrevendo "11 resultados".

**Medido antes da correção:** `scrollTop` 1.954 herdado, conteúdo novo com 924 px de
altura total, janela presa em `translateY(2436px)` → **0 linhas no DOM**. Só rolando de
volta ao topo os 11 apareciam.

**Por que é grave:** o usuário lê "11 resultados" e vê o vazio. A conclusão natural é
"não achou" ou "sumiu" — exatamente o defeito que esta fase existe para combater. E não
havia erro nenhum na tela.

**Por que passou pelos gates da 9C e da 9E:** a conta da faixa vivia dentro de
`ListaVirtualizada`, colada ao `getBoundingClientRect`. A suíte roda em
`environment: 'node'`, sem DOM — **nenhum teste a alcançava**. As duas telas anteriores
usam o mesmo componente; o cenário só não apareceu lá porque as buscas foram feitas com
a lista no topo.

**Correção, em duas camadas:**

| camada | o que faz | onde |
|---|---|---|
| `faixaVisivel` (extraída, pura, **7 testes**) | a janela nunca passa da última linha existente — lista que encolhe traz a janela junto | `src/components/faixaVisivel.ts` |
| `chaveDoConjunto` | conjunto novo (busca/filtro) → rolagem volta ao começo | `src/components/ListaVirtualizada.tsx` |

A primeira garante que **algo** seja desenhado; a segunda garante que seja **o começo do
que o usuário pediu**. As duas telas anteriores (`/equipamentos`, `/relatorios`) herdam
a primeira automaticamente — o defeito latente delas some junto.

**Reconferido na tela, com 50.000 no banco:**

| | antes da correção | depois |
|---|---|---|
| rolagem antes de buscar | `scrollTop` 1.500, mostrando VP-00014 | idem |
| depois de digitar `VP-04999` | **0 linhas**, translate 2436px | **11 linhas**, `scrollTop` **0**, primeira = **VP-04999** |

---

## 5 · O que foi medido, e o que NÃO foi

**Medido:** linhas e nós no DOM · heap · requisições · bytes · leituras de `nr13_docs_`
· downloads de container · PDFs · busca (TAG, fabricante, série, inexistente, limpar) ·
rolagem e paginação · abertura de equipamento · paridade do badge · estado na URL ·
long tasks.

**NÃO medido, e por quê:**

| item | por quê |
|---|---|
| **FCP em produção** | os números de carga vêm do **servidor de desenvolvimento** (Vite compila sob demanda): FCP 4.828 ms no primeiro degrau e DCL de 3.402 → 987 → 716 ms conforme o cache do dev aquecia. **Isso mede o Vite, não a tela.** O FCP real só sai de um build servido como em produção |
| Resource Timing como fonte de bytes | o buffer padrão (250 entradas) estoura com os módulos do dev server e descarta as chamadas seguintes. Os números de rede acima vêm da instrumentação do `fetch`, que não tem esse teto |
| Rolagem por `scrollTop` de script | **não emite evento de scroll** neste ambiente — meu próprio ouvinte contou 0. A rolagem foi feita pela roda do mouse (entrada real). Registrado como armadilha de medição, não como defeito |

---

## 6 · Testes de servidor: a lacuna anterior, fechada

`scripts/fase9/testes-9f.sql` foi **executado** no laboratório: **12/12 PASSA**.

Prova a projeção contando de verdade · `0` ≠ `null` · JSON ilegível não derruba a linha ·
container criado/removido reprojeta · isolamento entre organizações (TAG de mesmo nome,
contagens diferentes) · rebuild completo recontando.

> Uma correção foi necessária no próprio script: o `insert` em `profiles` precisa de
> `on conflict`, porque o trigger `handle_new_user` já cria a linha ao inserir em
> `auth.users`. Sem isso o arquivo só rodava uma vez — e teste que roda uma vez não é teste.

---

## 7 · Como reproduzir

```bash
docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X \
  -v n=50000 -f - < scripts/fase9/lab-9f-massa.sql
npm run dev      # .env.local aponta para o Supabase local
# login: lab9f@local.test / lab123456
```

---

## 8 · Estado ao fim do gate

| | |
|---|---|
| Suíte | **1446/1446** |
| `tsc -b` | limpo |
| `npm run build` | verde |
| Produção | **intocada** — nenhuma flag, nenhum SQL, nenhum deploy |
| `inspecoes_v9` | existe só no banco **local**; em produção a coluna nem foi criada |

**Próximo passo (não iniciado, aguarda autorização):** aplicar o SQL em produção,
reprojetar, publicar o front e repetir o roteiro com a flag ON **só na organização de
teste**.
