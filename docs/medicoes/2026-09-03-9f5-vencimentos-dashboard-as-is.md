# 9F.5 · `/vencimentos` + `/dashboard` — AS-IS

**03/09/2026** · análise autorizada, **implementação NÃO autorizada**. Nada em `src`, em
schema, em SQL de produção, em flag ou em cliente foi tocado. Produção usada **somente para
leitura e medição pequena**; nenhuma massa gerada.

Alvo pelo task-level (`2026-08-22-fase9-task-level.md` §9F.5): `/vencimentos` +
`/dashboard`, o "agregado híbrido" da DECISÃO 7 (§15 do desenho).

---

## 0 · A conclusão que muda o escopo, e ela vem antes de tudo

> **O agregado do servidor JÁ EXISTE, JÁ ESTÁ EM PRODUÇÃO E JÁ ESTÁ LIGADO** — só que
> atrás da flag **errada**.

`supabase/vencimentos_agregado.sql` foi aplicado em produção em **25/08/2026**
(`2026-08-25-9d-sql-aplicado-producao.md`): `vencimentos_org(p_limite)`, `f9_mais_meses` e
`calibracoes_index`. `src/services/vencimentosServidor.ts` (258 linhas, nascido na 9D.5) já
tem o painel do servidor, os KPIs que sabem dizer "não sei", o selo de procedência e a lista
truncada declarada em voz alta.

O que **não** existe é uma flag própria. `carregarPainel()` decide assim:

```ts
export async function carregarPainel(hoje = new Date()): Promise<PainelVencimentos> {
  if (bootV9Ativo()) return painelDoServidor(hoje);   // ← boot_v9, não vencimentos_v9
  const itens = listarVencimentos(hoje);              // varre o cache inteiro
  ...
}
```

Consequência medida: nas **2** organizações com `boot_v9` ON o painel já vem do servidor;
nas **28** restantes ele continua varrendo o cache local. **A 9F.5 não é construir o
agregado — é desacoplá-lo do `boot_v9` e dar a ele a mesma flag por tela que as outras
cinco etapas têm.**

---

## 1 · Medido em produção, hoje, na organização de teste (`boot_v9` ON)

Conta `teste@gmail.com`, org `99f642d3-…`, 4 equipamentos. Bundle `index-B0NvLXJL.js`.

| cenário | requisições | destino | DOM | heap |
|---|---|---|---|---|
| **`/vencimentos`, boot completo** | **17** | 5 estáticos · `profiles` ×3 · `app_storage` ×3 (boot leve) · **`vencimentos_org` ×2** · `assinatura_org` · `org_sync` · `config_global` | 429 | 26,2 MB |
| **`/dashboard`, navegação SPA** | **1** | **`vencimentos_org` ×1**, e **zero `app_storage`** | 388 | 14,8 MB |
| **`/relatorios`, navegação SPA** | 2 | `profiles` ×2, **zero `app_storage`** — mas ver §4 | 259 | 15,1 MB |

O selo apareceu como projetado: **"Dados de 13:43"**. A exigência do §15 — não apresentar
informação antiga como recém-consultada — está cumprida e funcionando em produção.

### 1.1 · O defeito pequeno que a medição pegou: `vencimentos_org` chamado DUAS vezes

No boot completo a RPC sai **duas vezes**. Não é novo — o registro da 9D já anotava
"`vencimentos_org` ×2" em 25/08 — e a causa está à vista: `Layout.tsx:138` chama
`painel.carregarPainel()` para o sino/atalhos, e a página chama de novo pelo
`usePainelVencimentos()`. Duas agregações completas da organização por boot.

Na navegação SPA sai **uma** só, porque o Layout já não remonta. **É desperdício barato hoje
(org de 4 equipamentos) e caro numa org grande**, já que cada chamada é um agregado sobre a
projeção inteira.

---

## 2 · O caminho local (28 organizações) — o que ele custa, linha a linha

Com `boot_v9` OFF, `carregarPainel()` chama `listarVencimentos()`
(`src/services/vencimentos.ts:178`). Por **cada** equipamento da organização:

| leitura | chave | o que é |
|---|---|---|
| 1 | `nr13_info_<TAG>` | ficha |
| 2 | `nr13_vida_<TAG>` | vida remanescente |
| 3 | `nr13_historico_indice_<TAG>` (via `listarIndice`) | índice de relatórios |
| 4 | `nr13_calibracoes_<TAG>` | todas as calibrações, para reduzir por componente num `Map` |

**4 `JSON.parse` por equipamento**, mais um `Map` por equipamento para achar a calibração
mais recente de cada componente. E `carregarPainel` ainda faz um
`listarChavesComPrefixo('nr13_info_')` extra só para o KPI `total`.

Não é "lista": é **agregado** — precisa de todos, não da primeira página. É exatamente o que
o §15 do desenho já dizia.

### 2.1 · O que a hidratação por trás disso custa (medido em produção, 31/08)

Da AS-IS da 9F.3, na maior organização (`cmam.caldeiras`, 39 equipamentos):
**369 linhas / 780 KB** baixados para desenhar uma lista que precisa de **53 KB** — 93% de
desperdício. O painel de vencimentos paga a mesma conta, pelo mesmo motivo.

---

## 3 · Os itens pedidos, um a um

| item | AS-IS |
|---|---|
| **onde ainda existe `lerTudo()`** | não em `/vencimentos` nem em `/dashboard` — nenhuma das duas o chama. Elas dependem do cache já hidratado pelo BOOT. Sob `boot_v9` OFF, esse boot é `auth.ts:222 → await lerTudo()`, a organização inteira |
| **quanto baixa** | pelo servidor: 1 RPC, resposta com no máximo `LIMITE_PAINEL = 500` fatos crus. Pelo cache: 0 bytes de rede na hora, mas o boot já pagou 780 KB na maior org |
| **quantidade de chaves** | caminho local toca **4 famílias por TAG** (`info`, `vida`, `historico_indice`, `calibracoes`) + 1 varredura de prefixo. Caminho servidor: **nenhuma** chave de `app_storage` |
| **peso real** | `/dashboard` SPA: **1 requisição**. `/vencimentos` boot: 17, com a RPC duplicada. Heap 14,8–26,2 MB, DOM 388–429 — com 4 equipamentos |
| **DOM** | `/vencimentos` renderiza **todas** as linhas do painel (`itens.map`), até 500. `/dashboard` renderiza **6**, ou **todas as filtradas** com "ver mais" (`listaExpandida`), mais 5 alertas. Sem `<select>` por linha (o problema da 9G é em `/equipamentos`) |
| **heap** | 14,8 MB no `/dashboard`, 26,2 MB no `/vencimentos` recém-carregado. Sem massa, não dá para extrapolar — e por regra não haverá massa em produção |
| **requests** | §1 |
| **parses no render** | **zero** nas duas telas. Os filtros do Dashboard (`vencidos`, `alertas`, `comPrazo`, `filtrados`) são `Array.filter` sobre a lista já pronta, não `JSON.parse`. O parse está no caminho LOCAL de `listarVencimentos`, fora do render |
| **busca** | **não existe em nenhuma das duas.** `/vencimentos` não tem campo. `/dashboard` tem só o filtro de prazo (`todos`/`vencidos`/30/60/90), client-side |
| **paginação** | não existe. O servidor **trunca** em 500 e devolve `truncado`/`restantes`, que o `SeloPainel` diz em voz alta. O caminho local não trunca nada |
| **virtualização** | não existe |
| **dependências por TAG** | caminho servidor: **nenhuma** — o agregado resolve tudo no banco. Caminho local: as 4 famílias por TAG do §2 |
| **dados globais** | `nr13_agenda_notas` (uma chave, lida por `CalendarioVencimentos` sem varredura) e `nr13_info_` só para o KPI `total` |
| **offline** | **já resolvido e é o melhor pedaço desta etapa.** Sem rede o `painelDoServidor` devolve `erro: true` e a tela diz que **não sabe** — `KpisPainel` com todos os campos opcionais e `textoContador` imprimindo `—`. **Não cai em hidratação integral** (§16 do desenho). Com `boot_v9` OFF, offline lê o cache normalmente. Não exercitado em produção com rede desligada |
| **projeções reutilizáveis** | **todas as necessárias já existem**: `equipamentos_index` (com `proxima_inspecao date`), `relatorios_index` (`execucao_inspecao`, `data_ref`) e `calibracoes_index` (`componente_id`, `prox_calibracao`) |
| **precisa de projeção nova?** | **NÃO.** E não precisa de SQL novo: `vencimentos_org` está aplicado desde 25/08 |
| **riscos de paridade** | **baixos, e por construção**: as linhas são montadas pelas MESMAS funções (`itemDeEquipamento`, `itemDeCalibracao`, `ordenarVencimentos`, `conformidadeDe`) nos dois caminhos. É a lição da 9C aplicada. O risco que sobra é o `total`: local conta `nr13_info_` do cache, servidor conta `equipamentos_index` — divergem se a projeção estiver defasada |
| **riscos para documentos/PDF** | **nenhum.** Nenhuma das duas telas monta iframe, toca template de `public/`, escreve chave por TAG ou lê artefato de relatório |
| **rollback / flag própria** | **é o buraco da etapa.** Hoje o comportamento é decidido por `boot_v9`, que é a flag do BOOT. Desligar `boot_v9` para consertar um problema de boot muda também o painel; ligar para o painel muda também o boot. As outras cinco telas têm flag própria; esta não |

---

## 4 · Um achado FORA do escopo da 9F.5, que precisa ficar registrado

**`/relatorios` é a única tela de lista que ainda chama `listarEquipamentos()` sem flag
nenhuma** (`Relatorios.tsx:271`). As outras cinco já têm par: `/equipamentos` → `busca_v9`,
`/inspecoes` → `inspecoes_v9`, `/prontuarios` → `prontuarios_v9`, `/calibracoes` →
`calibracoes_v9`, `/livro-registro` → `livro_v9`.

`listarEquipamentos()` faz `await lerTudo()` e depois `montarResumo(tag)` para cada TAG, e
`montarResumo` lê **5 chaves por equipamento** — `nr13_info_`, `nr13_cat_`, `nr13_calc_`,
**`nr13_fotos_`** e `nr13_pref_unidade_`. A quarta é a família mais pesada do sistema
(92 KB numa TAG medida, `ARMAZENAMENTO-LIMITES.md`): **a lista faz parse das fotos de todos
os equipamentos para desenhar cartões**.

A medição de hoje mostrou `/relatorios` com **zero** `app_storage`, e a explicação **não** é
que a tela ficou barata: `storageV2.lerTudo` tem **janela de 60 s** (`JANELA_HIDRATACAO_MS`)
e hidratação **incremental** por marca d'água. Dentro da janela ela devolve o snapshot do
`Map` — sem rede, mas ainda com o custo de CPU proporcional à organização. Fora da janela, e
principalmente com **cache frio ou `boot_v9` ligado**, ela volta a baixar a organização.

> Não é a 9F.5. Fica anotado para a ordem do roadmap decidir se vira 9F.5-bis ou entra na
> 9F.6, junto com `/empresas`.

---

## 5 · Desenho proposto (NÃO implementado)

### 5.1 · Escopo mínimo, e por que ele é pequeno

Como o SQL e o serviço já existem, a etapa é de **rollout e desacoplamento**, não de
construção:

1. **`supabase/vencimentos_v9_flag.sql`** — `org_sync.vencimentos_v9 boolean not null
   default false` + `definir_vencimentos_v9(uuid, boolean)`, no molde exato das seis
   anteriores, com `execute` revogado de `anon`/`authenticated` e bloco de rollback.
2. **`flag.ts`** — `vencimentosV9Ativa()` e o **7º degrau** da escada de recuo; a coluna
   entra na mesma consulta de `org_sync` do boot, sem round-trip novo.
3. **`vencimentosServidor.ts`** — trocar `if (bootV9Ativo())` por
   `if (vencimentosV9Ativa() || bootV9Ativo())`. **A disjunção não é preguiça:** é o que
   impede uma regressão nas duas organizações que hoje dependem de `boot_v9` para ter painel
   — sob `boot_v9` o cache não tem a organização, e cair no caminho local ali mostraria
   painel vazio, que é o sumiço que este projeto conserta.
4. **A chamada dupla** (§1.1): uma fonte só por boot. Ou o Layout consome o resultado da
   página, ou a página consome o do Layout — decidir com medição, não por gosto.

### 5.2 · O que NÃO fazer, e o motivo

- **Não criar projeção nova.** As três já existem e o agregado já as usa.
- **Não paginar o painel.** É agregado: os contadores precisam da organização inteira, e é
  por isso que eles vêm dos `count` do servidor e não da lista truncada.
- **Não virtualizar sem evidência.** `/dashboard` mostra 6 linhas por construção;
  `/vencimentos` mostra até 500. O gate da 9F.4 já registrou o número que decide (300 linhas
  = 5.964 nós de DOM); se `/vencimentos` for medido acima disso em laboratório, aí se
  discute.
- **Não adicionar busca agora.** Nenhuma das duas telas tem, e ninguém pediu. Busca em
  agregado é outra conversa: filtrar muda os contadores.

### 5.3 · Como provar (gate)

- **Laboratório, 1k/10k/50k** — e **somente** laboratório (§12 do `CLAUDE.md`): custo do
  `vencimentos_org` por degrau, buffers, uso de índice, e o teto de 500.
- **Paridade ON × OFF** pelas MESMAS funções de montagem, com a lista e os quatro KPIs
  comparados campo a campo — e o `total` conferido contra `nr13_info_`, que é o único ponto
  onde as duas fontes contam coisas diferentes.
- **Offline com rede desligada**, que nunca foi exercitado: a tela precisa dizer "não sei",
  não "tudo em dia".
- **Rollout controlado** no molde das seis anteriores: preflight, baseline OFF, ON só na org
  de teste, medição de requisições, rollback, flags preservadas.

### 5.4 · Riscos, e o que fazer com cada um

| risco | grau | contenção |
|---|---|---|
| `total` divergente entre cache e projeção | médio | conferir contra `auditar_projecao` antes de ligar; a projeção defasada é detectável, e o reparo já existe |
| Chamada dupla virar duas agregações caras numa org grande | médio | resolver ANTES do rollout, não depois |
| Ligar a flag e regredir as 2 orgs com `boot_v9` | alto se ignorado | a disjunção do §5.1.3, com teste |
| Offline mostrando "0 vencidos" | alto | já contido por construção (`KpisPainel` opcional); falta exercitar |
| Documentos/PDF | **nenhum** | as telas não tocam template, artefato nem chave por TAG |

---

## 6 · O que esta análise NÃO fez

- Não tocou `src`, schema, SQL, flags nem clientes.
- Não gerou massa. Não mediu escala — e por regra a escala será medida **só em laboratório**.
- Não introspeccionou `vencimentos_org` no banco nesta sessão (a aba do SQL Editor morreu no
  fim do rollout da 9F.4). A existência e a aplicação em produção vêm do registro de 25/08 e
  estão confirmadas pelo fato de a RPC responder na tela, medido hoje.
- Não exercitou offline nem cache frio.
