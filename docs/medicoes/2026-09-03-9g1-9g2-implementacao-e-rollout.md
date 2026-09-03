# 9G.1 + 9G.2 — implementação local, gate e rollout

**03/09/2026** · gate em Supabase **local**; rollout no projeto
`qqsesrntfvmdxqxrfvmw` (SAAS NR13), organização de teste
`99f642d3-6efd-446d-9e76-d234ad8d211c`.

Commit: **`97ce3a5`**.

---

## 1 · 9G.1 — o login parou de desfazer o boot leve

### O defeito

`aposEntrar` (`src/services/auth.ts`) chamava `await lerTudo()` **sem condição
nenhuma**. Era o único caminho de hidratação integral que a Fase 9 inteira não
tinha coberto: sete telas ganharam flag, o boot ganhou `boot_v9`, e o login
continuou baixando a organização toda.

Com `boot_v9` ligada, o efeito é o pior possível — o boot pede o essencial e o
login, segundos antes, já pediu tudo. **O boot leve não estava desligado; estava
sendo desfeito.**

A causa não foi esquecimento. A decisão já existia em `hidratarNoBoot`
(`app/bootArmazenamento.ts`), e o login tinha a sua, escrita antes de a flag
existir. Duas cópias da mesma regra divergem — foi o que aconteceu com as flags
na purga da v1 (9F.5/9F.6, §6.1), no mesmo dia.

### A correção

A regra virou **um módulo com dois chamadores**: `services/modoHidratacao.ts`.

```
modoHidratacaoDaSessao():
  cliente do Portal  → 'nenhuma'
  boot_v9 ligada     → 'essencial'
  sem a flag         → 'completa'
```

A **ordem das perguntas** é testada: o cliente do Portal vem primeiro, porque o
modo `essencial` também lê `app_storage` — perguntar a flag antes do papel
colocaria o cliente de volta num caminho que não é dele (Fase 0-B, achado A-01).

A paridade entre login e boot passou a ser **estrutural**: não há duas
implementações para divergir. `modoHidratacao.test.ts` trava a decisão (7 casos).

### Medido no navegador

Organização de laboratório com **10.003 equipamentos**, `boot_v9` ligada,
aparelho zerado (IndexedDB apagado, `localStorage` limpo), login real:

| | requisições a `app_storage` no login + boot |
|---|---|
| **depois da 9G.1** | **6, todas do conjunto essencial** — a lista fixa de globais, `nr13_rastreab_%` e `nr13_permissoes_%`, duas vezes (login e boot) |
| hidratação integral da organização | **0** |

> **Declarado:** o "antes" não foi medido em VOLUME, e sim em TIPO de
> requisição. A massa do laboratório vive nas projeções, não em `app_storage`,
> então a hidratação integral desta org é de uma página só — o número de bytes
> não mostraria a diferença. O que a medição mostra é que o login deixou de
> emitir a requisição de hidratação da organização e passou a emitir as do
> conjunto essencial. Numa conta real com 38 equipamentos e fotos, é a diferença
> entre megabytes e kilobytes.

> **Sobra declarada:** as duas hidratações do essencial (login e boot) são
> trabalho repetido. Removê-las é limpeza da 9G.3 — enquanto as duas existirem,
> o que não se pode é elas DISCORDAREM, e agora não podem.

---

## 2 · 9G.2 — o agregado parou de montar JSON que joga fora

### O defeito

`vencimentos_org` montava um `jsonb_build_object` por linha da organização
INTEIRA — equipamentos mais calibrações — e só depois ordenava e cortava em 500.
Em 50.000 equipamentos: **50.000 objetos JSON construídos para descartar 49.500**.

O custo aparecia como derrame para disco: a CTE `itens` não cabia em `work_mem`.

### A correção

1. as CTEs devolvem **colunas cruas**; a contagem roda sobre elas;
2. o `jsonb_build_object` acontece **uma vez por linha da PÁGINA**, depois do
   corte;
3. `fatos` é declarada **`not materialized`** — ela tem dois consumidores
   (`contas` e `pagina`), e materializada é ela que derrama.

### Medido — laboratório, buffers quentes, massa com prazos reais

| degrau | antes | 9G.2 | temp antes | temp depois |
|---|---|---|---|---|
| **1k** | 6,93 ms | 6,86 ms | 0 | **0** |
| **10k** | 44,55 ms | **30,11 ms** | 337 | **0** |
| **50k** | 191,09 ms | **79,64 ms** | 1.686 (~14 MB) | **0** |

O caminho até aqui, em 50k, mediu os três estágios:

| versão | tempo | temp (blocos) |
|---|---|---|
| antes (jsonb da org inteira) | 181,6 ms | 1.756 |
| top-N com a CTE materializada | 116,8 ms | 418 |
| top-N + `not materialized` | **87,5 ms** | **0** |

Ler a mesma página duas vezes da RAM é mais barato que escrevê-la uma vez no
disco.

### Paridade — comparação direta das duas versões

Sobre a MESMA massa de 50.000 equipamentos com prazos reais, capturando a saída
das duas versões da função e comparando o `jsonb`:

| conferido | resultado |
|---|---|
| saída completa (ignorando `em`/`now()`) | **IDÊNTICA** |
| ordem dos itens | **idêntica** |
| contagens | 50.003 equipamentos · **779** vencidos · **404** a vencer · 5.001 com prazo, nos dois lados |

E na tela, no navegador: `10.003 / 94 / 179`, batendo com a expectativa calculada
em SQL, com o mais urgente em primeiro lugar (`VP-00400`, vencido há 60 dias).

### `jsonb_agg` sem `order by` não promete ordem

A agregação passou a acontecer **depois** do corte, e o `limit` da CTE não
carrega ordenação para fora dela. A cláusula está lá, e há teste para ela: ordem
errada numa lista de vencimentos é o item vencido aparecendo no fim.

### Sem flag, de propósito

Uma flag aqui carregaria **duas cópias da regra de vencimento no servidor** —
exatamente o que a 9D.5 evitou. O rollback é reaplicar
`supabase/vencimentos_agregado.sql`, que contém a versão anterior inteira.

**Consequência que precisa estar escrita:** aplicar este SQL muda o agregado
para TODAS as organizações no mesmo instante. A segurança não vem de rollout
gradual — vem da paridade provada byte a byte e do rollback de um arquivo.

---

## 3 · Testes

`scripts/fase9/testes-9g2.sql` — **22 asserções, 22 PASSA**: as quatro
contagens, a regra do prazo nos três ramos (relatório mais recente / menor das
duas próximas / Vida Remanescente como reserva), a calibração com e sem prazo, a
ORDEM da lista, os nomes de campo um a um, `truncado`/`restantes`, e fail closed
para papel `cliente` e sessão sem organização.

> **Um erro do TESTE, registrado:** a primeira versão da asserção de ordem
> reconstruía o prazo só pelos dois primeiros ramos e acusou desordem numa lista
> correta — `VG-VIDA` caía no `9999`. Teste que reimplementa a regra pela metade
> acusa o código certo.

Suíte do app: **1.663 testes, 143 arquivos**. `tsc -b` + `vite build` verdes.
Trava anti-produção: **35/35**.

---

## 4 · Rollout em produção

### 4.1 · SQL — conferido por SHA-256 antes de rodar

| arquivo | bytes (LF) | SHA-256 conferido no editor |
|---|---|---|
| `supabase/vencimentos_agregado_topn.sql` | 13.293 | `e7e648b4cd6f359d7096fb687ddb44c8555b819adf84ac5f94fda7e02823cd1b` |

> **Obstáculo de ferramenta, registrado:** o canal do navegador recusou o
> payload inteiro (17.724 chars de base64) com um erro genérico de alvo. O texto
> foi transmitido em **16 partes**, remontado na página e só então conferido —
> o hash do texto no editor bateu com o do commit, que é o que a regra do §13
> exige. Transmitir em partes não afrouxa a conferência: ela é sobre o texto
> final, não sobre como ele chegou.

### 4.2 · Verificação DEPOIS — por estrutura, não pela mensagem

| conferido | resultado |
|---|---|
| `not materialized` no corpo | **SIM** |
| CTE `pagina_json` | **SIM** |
| `jsonb_agg(item order by venc nulls last, tag)` | **SIM** |
| assinatura e retorno | `p_limite integer -> jsonb` — inalterados |
| ACL | `authenticated` = true · `anon` = **false** |
| versões da função | **1** (sem sobrecarga órfã) |

### 4.3 · Front

Deploy do commit `97ce3a5` pelo Coolify. Bundle no ar:
`assets/index-C2_BBPFP.js` (3.194.404 B), contra `index-CQ4ywCkX.js`
(3.194.261 B) de antes.

> **Limite da conferência por bundle, declarado:** os marcadores da 9F.5/9F.6
> eram STRINGS (`nr13_vencimentos_v9`, `contar_relatorios_por_tag`), que a
> minificação preserva. A 9G.1 não introduziu string nova — ela move uma
> decisão entre módulos, e `modoHidratacao`/`hidratarEssencial` são
> IDENTIFICADORES, renomeados na minificação. O que se pode afirmar pelo bundle
> é que ele mudou e veio do commit publicado; o comportamento da 9G.1 foi
> provado no laboratório (§1), não em produção.

### 4.4 · Validação na organização de teste

`/dashboard` com o bundle novo e a 9G.2 no banco:

| | antes da 9G.2 | depois |
|---|---|---|
| KPIs | 4 · 0 · 0 · 100 % | **4 · 0 · 0 · 100 %** |
| `rpc/vencimentos_org` no boot | 1 | **1** |
| `app_storage` no boot | 3 (conjunto fixo do boot leve) | **3** |
| flags de tela | `vencimentos_v9`/`relatorios_v9` OFF | **OFF** |

Paridade em produção: o painel não mudou uma casa. É o resultado esperado — a
9G.2 muda o custo, não a resposta.

> **O login da 9G.1 NÃO foi exercitado em produção:** provar exigiria sair e
> entrar de novo na conta de teste, e esta sessão não tem a senha dela. A
> sessão já autenticada exercita o BOOT, não o login. Fica declarado como não
> provado em produção.

---

## 5 · O que ficou provado ONDE

**EM PRODUÇÃO:** o SQL da 9G.2 aplicado, conferido por hash antes e por
estrutura/ACL depois.

**SÓ NO LABORATÓRIO:** a escala (1k/10k/50k), a paridade das duas versões do
agregado, e o comportamento do login com boot leve e aparelho zerado.

**NÃO PROVADO, e declarado:** o ganho da 9G.2 numa organização real grande. A
organização de teste tem 4 equipamentos; o ganho medido é de 50.000. Nenhuma
conta real chega perto disso hoje — o valor da etapa é remover o custo antes que
alguém chegue lá.
