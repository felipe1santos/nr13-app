# 9F.5 + 9F.6 — implementação local e gate conjunto

**03/09/2026** · Supabase **local** (`npx supabase start`), organização de
laboratório `lab9f@local.test`. **Produção não foi tocada:** nenhum SQL das duas
etapas aplicado lá, nenhuma flag criada lá, `vencimentos_v9` e `relatorios_v9`
não existem em produção. Medido no navegador: **0 requisições** para
`qqsesrntfvmdxqxrfvmw` na sessão inteira; `.env.local` aponta para
`http://127.0.0.1:54321`.

AS-IS da 9F.5: `2026-09-03-9f5-vencimentos-dashboard-as-is.md`.

---

## 1 · O que cada etapa é — e o que ela NÃO é

| | 9F.5 · painel | 9F.6 · catálogo |
|---|---|---|
| telas | `/dashboard`, `/vencimentos` | `/relatorios` (seletor de equipamentos) |
| forma | **agregado** — percorre a organização para contar | **lista paginada** — 50 por página |
| pergunta do gate | o custo cresce de forma aceitável? é pedido UMA vez por boot? | o custo NÃO cresce com o parque? |
| SQL novo | **nenhum** — só a flag | **uma** função de contagem, sobre projeção que já existia |
| projeção nova | nenhuma | nenhuma |
| coluna nova | nenhuma | nenhuma |
| reprojeção TAG a TAG | não | não |

**A 9F.5 não habilita código: ela conserta um acoplamento.** `vencimentos_org`
está em produção desde 25/08 e `vencimentosServidor.ts` desde a 9D.5 — o que
faltava era a flag. `carregarPainel()` decidia a fonte por `bootV9Ativo()`, a
flag do BOOT: desligar o boot leve mudava o painel junto, e ligar o painel
obrigava a ligar o boot leve, que é a etapa de maior risco da fase.

**A 9F.6 troca a FONTE DO CATÁLOGO e nada mais.** O PDF, a geração do relatório
e o histórico não são tocados em nenhuma das duas posições da flag: depois do
clique é o código de sempre, lendo as chaves de sempre — semeadas sob demanda em
vez de baixadas em massa.

---

## 2 · A regra da disjunção (9F.5)

```
carregarPainel():  vencimentosV9Ativa() || bootV9Ativo()  →  agregado do servidor
```

A flag nova **soma**, nunca substitui:

- `vencimentos_v9` ON → agregado, mesmo com o cache completo. É o que permite
  ligar o painel sem mexer no boot da organização;
- `boot_v9` ON → agregado **obrigatoriamente**, mesmo com `vencimentos_v9` OFF.
  Sob boot leve o cache não tem a organização: `listarVencimentos()` ali contaria
  zero equipamentos e a tela diria "tudo em dia" sobre uma conta que nunca foi
  lida. **Trocar um painel certo por um painel vazio não é rollback.**

Por isso o rollback de `vencimentos_v9` numa organização com boot leve **não**
devolve o painel ao caminho local — e é `vencimentosDisjuncao.test.ts` que carrega
esse risco (5 casos, incluindo o do rollback).

---

## 3 · A chamada dupla, medida antes e depois

Dois consumidores legítimos do MESMO painel: o `Layout` (sino e contador do menu)
e a página. Cada chamada é um agregado sobre a projeção inteira da organização.

A solução é uma **janela curta compartilhada** (`JANELA_PAINEL_MS = 3000`), não
um cache de sessão: recarga por dado alterado e volta de foco passam `forcar` e
nunca pegam a janela, e resposta com **erro não fica guardada** — segurar uma
falha de rede por três segundos transformaria um tropeço em "não sei" para todo
mundo que pedisse o painel no intervalo.

Medido no navegador, org de 50.000 equipamentos, um boot de `/dashboard`:

| | chamadas de `vencimentos_org` | bytes por boot |
|---|---|---|
| **janela desligada** (comportamento anterior) | **3** | 382.518 B |
| **janela de 3 s** (9F.5.3) | **1** | 127.506 B |

Três, não duas: além do `Layout` e da página, o `focus` da aba recém-carregada
dispara a terceira. A montagem NÃO força; os dois gatilhos de recarga forçam.

---

## 4 · O gate 1k / 10k / 50k — somente Supabase local

`scripts/fase9/lab-9f56-massa.sql` + `scripts/fase9/bench-9f5-9f6.sql`.

### 4.1 · SQL (`explain analyze`)

| degrau | `vencimentos_org(500)` | buffers | `contar_relatorios_por_tag(50)` | buffers |
|---|---|---|---|---|
| **1k** | 26,957 ms | 7.429 | **0,660 ms** | 325 |
| **10k** | 46,652 ms | 8.223 + temp 350 | **1,343 ms** | 476 |
| **50k** | 220,110 ms | 14.031 + temp 1.756 | **1,194 ms** | 58 |

**A contagem da 9F.6 não cresce com o parque** — é a propriedade que a etapa
precisava ter, e ela vale porque a função olha só as 50 TAGs da página, sobre um
índice `(org_id, tag)` que a 9E já tinha criado.

**O agregado da 9F.5 cresce**, e é inerente: ele conta a organização. 220 ms com
50.000 equipamentos, com derrame para disco (`temp read 1756` ≈ 14 MB) na
materialização dos itens antes do corte de 500. Ver §7 — limitação declarada,
**pré-existente**: esta etapa não mudou uma linha de `vencimentos_org`.

### 4.2 · Navegador (`relatorios_v9` ON, `boot_v9` ON)

| | **1k** | **10k** | **50k** |
|---|---|---|---|
| equipamentos no banco | 1.003 | 10.003 | 50.003 |
| cartões na 1ª página | 50 | 50 | 50 |
| DOM nodes | 953 | 949 | 949 |
| heap | 30,5 MB | 30,9 MB | 30,9 MB |
| `buscar_equipamentos` | 1 | 1 | 1 |
| `contar_equipamentos` | 1 | 1 | 1 |
| `contar_relatorios_por_tag` | **1 por página** | 1 | 1 |
| bytes de `buscar_equipamentos` | — | 30.816 B | **30.816 B** |
| bytes de `contar_relatorios_por_tag` | — | 1.598 B | **1.598 B** |
| **`app_storage` ao abrir a lista** | **0** | **0** | **0** |

De 10k para 50k — 5× mais equipamentos — DOM, heap, requisições e **bytes** são
idênticos. A contagem é **uma chamada por página**, não uma por cartão: contar por
cartão devolveria o `N+1` que esta fase existe para remover.

> As três requisições a `app_storage` que aparecem no boot com `boot_v9` ON são o
> conjunto FIXO do boot leve (globais, rastreabilidades, permissões — 2 bytes cada
> neste laboratório), não a lista. A lista não pede nenhuma.

### 4.3 · Paginação keyset (50k)

50 → 100 → 150 → 200 → **250 itens**, **0 duplicados** (250 únicas), ordem
crescente estável (`VP-00001` … `VP-00250`), **5 `buscar_equipamentos` + 5
`contar_relatorios_por_tag`**, e **0 requisições de `app_storage`**.
DOM com 250 linhas: 3.749 nodes, heap 34,2 MB — o mesmo custo de acumular páginas
já registrado na 9F.4, e a mesma decisão de não virtualizar.

---

## 5 · O risco bloqueante da 9F.6: semear ANTES de ler

Invertida, a ordem abre o HISTÓRICO VAZIO de um equipamento que tem relatórios —
**sem erro nenhum**, que é o que torna esse defeito caro (mesmo risco da 9F.2,
onde inverter imprimia seis folhas com "-").

Medido com **`boot_v9` ON e o cache do aparelho apagado**, que é o único estado em
que a semeadura realmente trabalha:

| momento | evidência |
|---|---|
| antes do clique | `listarChavesComPrefixo('nr13_')` = **0 chaves** |
| o cartão, mesmo assim | `ZZ-REL`, CAT. III, PMTA 0,98 MPa, **"3 Relatórios"** |
| ao clicar | **2 requisições** a `app_storage`: as chaves da TAG, depois os registros por id |
| depois do clique | **5 chaves** no cache — só as daquele equipamento |
| o histórico | **3 linhas reais**: Inspeção Extraordinária 20/08/2026, Periódica 12/05/2026, Inicial 10/01/2026, com validades e próximas inspeções |

Ausência de erro não é prova; conteúdo é.

---

## 6 · Dois defeitos achados PELO gate (e corrigidos)

### 6.1 · A purga da v1 apagava sete das nove flags — **o mais grave**

Sintoma na tela: com `vencimentos_v9` e `relatorios_v9` ligadas no servidor e a
sessão rodando pelo caminho novo, `localStorage.getItem` das duas chaves devolvia
`null`.

`purgarCacheV1` (`migracaoV1.ts`) varre o `localStorage` apagando tudo que começa
com `nr13_`, preservando uma lista explícita. A lista tinha **duas** flags escritas
à mão — a da v2 e a da busca v9 — e as **sete** acrescentadas depois (uma por etapa
da 9F, mais as duas desta) eram apagadas a cada boot em que a purga rodasse.

Funciona no dia a dia porque `sincronizarFlagDoServidor` regrava as flags a cada
boot. **O defeito só aparece quando o servidor não responde** — e aí, para o
painel, ele não cai no lado barato: sem `boot_v9` e sem `vencimentos_v9`, o painel
calcula no cache que o boot leve nunca encheu e escreve "tudo em dia" sobre a
organização inteira. É exatamente o que a regra da disjunção existe para impedir.

O comentário que acrescentou `nr13_busca_v9` à lista já dizia esse motivo, palavra
por palavra. Ele foi escrito e não foi generalizado — e por isso o defeito voltou
seis vezes seguidas, em silêncio.

**A correção não foi acrescentar mais dois nomes**: `flag.ts` passa a exportar
`CHAVES_FLAG` (as nove), e a purga consome essa lista. A flag da 9G nasce
preservada sem ninguém lembrar. Travado por
`src/services/migracaoV1.flagsPreservadas.test.ts` (3 casos — inclusive um que
confere que a purga **continua apagando** o cache v1, para a correção não virar
no-op).

Conferido no navegador **com o Kong parado**: as duas flags sobreviveram ao boot
offline e `vencimentosV9Ativa()`/`relatoriosV9Ativa()` seguiram `true`.

### 6.2 · "Nenhum vencido" sobre um número que não foi contado

Com o servidor fora, o painel exibe `—` em todos os KPIs e "sem resposta do
servidor" na conformidade — correto, e é a regra de 25/08. Mas a legenda do KPI
**Vencidos** vinha de `(kpis.vencidos ?? 0) > 0`, e o `?? 0` transformava
"não contei" em "contei e deu zero": o número mostrava `—` e a linha logo abaixo
afirmava **"nenhum vencido"**.

É a única frase daquela tela que não se pode dizer sem ter contado. Corrigido em
`Dashboard.tsx` e `Vencimentos.tsx`: indefinido agora escreve "sem resposta do
servidor".

---

## 7 · Prova offline (Kong parado — falha real, não mock)

| tela | comportamento |
|---|---|
| `/relatorios` | "Não foi possível carregar os equipamentos." + **"Tentar de novo"**. **Não** cai na hidratação integral — trocar uma falha de rede por "baixar a organização inteira" seria o defeito, não o remédio |
| `/dashboard` | KPIs em `—` e "sem resposta do servidor". **Não** exibe zeros |
| flags | **sobrevivem** ao boot offline (§6.1) |
| topo | "Sem resposta do servidor. Você continua trabalhando com os dados deste aparelho…" |

---

## 8 · Paridade

| o quê | como foi provado | resultado |
|---|---|---|
| **contagem do catálogo** (9F.6) | SQL, TAG a TAG: `contar_relatorios_por_tag` × `jsonb_array_length` da verdade (`nr13_historico_indice_<TAG>`) | **0 divergências** |
| **agregado × verdade** (9F.5) | KPIs da tela × a mesma regra escrita em SQL sobre a massa | 1k: **1.003 / 32 / 59** · 50k: **50.003 / 404 / 779** — batem exatamente |
| **linha do vencimento** | `ZZ-REL` com flag OFF (local) × ON (servidor) | idêntica: `18/08/2026 · 18/09/2026 · Vence em 15 dias · ATENÇÃO` |
| **regra do prazo** | é função pura sobre fatos, chamada pelos dois caminhos (9D.5) | paridade por construção, não por disciplina |

---

## 9 · Testes funcionais SQL — `scripts/fase9/testes-9f5-9f6.sql`

**26 asserções, 26 PASSA.** O que elas cobrem e o vitest não alcança:

1. paridade da contagem, TAG a TAG (§8);
2. TAG ausente do resultado é **zero**, e a consulta **responde** — `null` é só
   "a consulta falhou", e aí o cartão escreve `—`;
3. JSON ilegível numa TAG não derruba a contagem das outras;
4. isolamento entre organizações (a org B tem a MESMA TAG com outra contagem);
5. teto de 200 TAGs — 201 devolve vazio; array vazio e `null` também, sem erro;
6. a função devolve **dois** campos: `pdf_ref` e `sha256` não saem daqui
   (invariante I10 — o artefato é resolvido no clique);
7. o agregado conta a organização certa, e não a vizinha;
8. **fail closed**: papel `cliente` e sessão sem organização resolvida recebem
   vazio nas duas funções;
9. as duas flags nascem desligadas, ligar uma preserva as outras oito, e o
   rollback desliga só ela;
10. `definir_vencimentos_v9`/`definir_relatorios_v9` não são executáveis por
    `anon` nem por `authenticated` — virar a chave é ato operacional;
11. `equipamentos_index` segue com as **quatro** colunas de 9F.1..9F.4, sem uma
    quinta: esta etapa não tocou o schema.

---

## 10 · Suíte, tipos e build

| | resultado |
|---|---|
| vitest | **1.656 testes, 142 arquivos — todos passando** |
| `tsc -b` + `vite build` | **verde** |
| trava anti-produção (`massa.test.mjs`) | **35/35** |

---

## 11 · Peças

| arquivo | o quê |
|---|---|
| `supabase/vencimentos_v9_flag.sql` | a flag `vencimentos_v9` — só o interruptor |
| `supabase/relatorios_v9_flag.sql` | a flag `relatorios_v9` — idem |
| `supabase/relatorios_catalogo.sql` | `contar_relatorios_por_tag`, sobre `relatorios_index` |
| `src/services/flag.ts` | as duas flags, os **dois novos degraus** da escada de recuo, e `CHAVES_FLAG` |
| `src/services/migracaoV1.ts` | a purga passa a preservar TODAS as flags (§6.1) |
| `src/services/vencimentosServidor.ts` | a disjunção + a janela compartilhada |
| `src/app/Layout.tsx` | a montagem não força; a recarga por dado alterado força |
| `src/pages/Dashboard.tsx` · `Vencimentos.tsx` | indefinido ≠ zero na legenda (§6.2) |
| `src/features/relatorios/catalogoRelatorios.ts` | semear → ler, e as regras de `null` |
| `src/features/relatorios/CatalogoRelatoriosV9.tsx` | a lista nova |
| `src/pages/Relatorios.tsx` | a flag e a guarda de hidratação |
| `scripts/fase9/lab-9f56-massa.sql` | a massa do laboratório |
| `scripts/fase9/bench-9f5-9f6.sql` | o bench 1k/10k/50k |
| `scripts/fase9/testes-9f5-9f6.sql` | os 26 testes funcionais |

Testes novos: `flagVencimentosV9`, `flagRelatoriosV9`, `vencimentosDisjuncao`,
`vencimentosDeduplicacao`, `catalogoRelatorios`, `listaSemParse`,
`migracaoV1.flagsPreservadas`.

---

## 12 · Limitações declaradas

1. **O agregado cresce com a organização** — 220 ms e derrame de ~14 MB para
   disco em 50.000 equipamentos. Pré-existente (o SQL é de 25/08 e não foi tocado
   aqui), e o custo continua muito menor que o do caminho local, que baixava a
   organização inteira para o navegador. Candidato natural a 9G: contar por
   agregação incremental em vez de materializar os itens antes do corte de 500.
2. **A massa grande vive só nas projeções.** Gerar 50.000 equipamentos pela
   verdade mediria o gerador, não a consulta — mesma decisão declarada desde a
   9E. Por isso a paridade OFF × ON foi feita sobre as TAGs `ZZ-*`, que passam
   pela projeção real, e não sobre a massa.
3. **Duas armadilhas do laboratório, registradas para a próxima vez:**
   - o painel **não lê** `equipamentos_index.proxima_inspecao`; ele monta o prazo
     do relatório mais recente. Uma primeira massa espalhou os baldes na coluna
     errada e a tela exibiu "0 vencidos" sobre 29 — a tela estava certa;
   - `tipo` no histórico é o RÓTULO (`'Inspeção Periódica'`), não um slug. Com
     `"periodica"` o filtro da tela esconde a linha, e o histórico parece vazio.
     Foi esse o susto do primeiro clique deste gate: parecia o risco bloqueante,
     era a massa.
4. **Rollout em produção não foi feito** e não foi autorizado nesta rodada.
