# 9D · PROVA OFFLINE EM PRODUÇÃO — dois defeitos achados, corrigidos e reprovados

**25/08/2026.** Organização de teste `99f642d3-…-8d211c`, `boot_v9` LIGADA, `busca_v9` desligada
em todas. Offline real pelo DevTools, aplicado à mão pelo dono do projeto.

Fecha o item "modo offline não exercitado" que ficou aberto em
`2026-08-25-9d-sql-aplicado-producao.md` §7.

---

## 1 · O que a primeira prova mostrou (bundle `index-C_iTpE2Y.js`)

| verificação | resultado |
|---|---|
| Requests falhando de verdade | **50 falhas** `TypeError: Failed to fetch` — `profiles` ×35, `app_storage` ×9, **`rpc/aplicar_mutacao_storage` ×5**, `vencimentos_org` ×1 |
| Catálogo local | `/equipamentos` **4 de 4**; `/relatorios` com os mesmos contadores do online |
| Ficha pelo cache | `ZZ-FASE3` abre completa (volume 1 m³, P×V 1000 kPa·m³, memorial) |
| Edição offline | PMTA adotada **0,87** gravada e exibida |
| Fila | **2 → 3**; a nova é `nr13_info_ZZ-FASE3`, op `set` |
| Durabilidade | fila lida de um **contexto JS separado** (iframe same-origin): as 3 entradas estão no IndexedDB, não na memória da página |
| Nada sumiu | `dados` 61 (igual à linha de base), tombstones 2, conflitos 0 |

E dois defeitos, tratados pelo dono como BLOQUEIOS da validação final.

---

## 2 · Defeito 1 — o painel inventava zero

**Medido:** Dashboard offline exibindo **"EQUIPAMENTOS CADASTRADOS: 0"** com 4 equipamentos no
cache, o menu lateral marcando 4 e `/equipamentos` listando "4 de 4".

`painelDoServidor` já sabia não inventar 100 % de conformidade no caminho de erro — mas os
outros três contadores caíam em **zero literal**, e a tela os imprimia.

> **Zero é uma AFIRMAÇÃO** — "conferi, e não há nenhum". É a mesma frase que o sumiço de dados
> diz, e este projeto existe para que a tela nunca a diga sem ter conferido.

**Correção:** os quatro contadores de `KpisPainel` viraram opcionais.
`undefined` = não foi possível conferir → a tela mostra **"—"** (`textoContador`);
`0` = conferido, e não há nenhum. O badge do menu lateral tem fonte local legítima (as chaves do
cache), então com contador indefinido ele **não é tocado**: não saber é motivo para não mexer,
não para zerar.

**O que NÃO foi feito, e por quê:** nada de fallback por varredura do cache. Sob boot leve o
cache tem um SUBCONJUNTO da organização; contar nele mostraria "12" numa conta de 50.000. Seria
trocar um número falso por outro.

## 3 · Defeito 2 — `navigator.onLine` não é autoridade

**Medido:** `onLine` permaneceu `true` a sessão inteira, com a rede morta. Consequências em
cadeia, todas observadas:

1. a topbar anunciava **"Sincronizar (3)"** — convite a clicar num botão sem como funcionar;
2. na volta da rede, **nenhum** evento `online` disparou (nada mudou aos olhos do navegador) e a
   aba já estava visível, então também não houve `visibilitychange`: a drenagem automática, que
   escuta os dois, **nunca acordou**. A fila ficou parada em 3 com a internet de volta, até um
   clique manual.

Em campo não existe esse clique: o inspetor fecha o app achando que subiu.

**Correção, em duas peças puras e testáveis:**

- `conectividade.ts` — decide pelo ERRO REAL da última tentativa. `errosSync` já classificava
  falha de fetch como `categoria: 'offline'`, e a verdade já estava gravada em cada item da
  fila; só a topbar não perguntava. Falha por permissão/sessão/cota **não** é falta de rede: a
  rede funcionou e trouxe uma recusa.
- `retentativaRede.ts` — rede de segurança dos dois listeners. Só age com evidência de queda,
  fora de uma janela de **45 s**, e drena a fila (trabalho que já ia sair) em vez de inventar um
  ping periódico contra a cota que a Fase 9 protege.

---

## 4 · Reprova com o bundle corrigido (`index-o18n-uvq.js`)

### 4.1 · Sincronização da edição feita offline

| | |
|---|---|
| Fila | **3 → 2** — saiu SÓ a mutação nova |
| Pendências antigas (14/08) | as 2 permanecem, agora com a causa visível: `obsoleto` |
| Servidor | `nr13_info_ZZ-FASE3` **versão 8 → 9**, `pmtaAdotadaMpa = "0.87"` |
| Projeção | `source_version 9`, `projected_at` **idêntico** ao `atualizado_em` — mesma transação da RPC (9B) |
| Conflitos | 0 |

### 4.2 · Dashboard offline

Os quatro KPIs em **"—"**, faixa "Sem resposta do servidor — os números abaixo não puderam ser
conferidos", e o **menu lateral mantendo o 4**. O `/equipamentos` seguiu com 4 de 4 e a ficha do
`ZZ-FASE3` abriu com a PMTA 0,87 que havia sincronizado.

### 4.3 · O rótulo de conectividade, no cenário exato do defeito

`navigator.onLine` foi **forçado a mentir `true`** (`Object.defineProperty`) com a rede ainda
bloqueada, e uma segunda edição offline (PMTA **0,91**) foi gravada:

| | antes | depois |
|---|---|---|
| `navigator.onLine` | `true` | `true` |
| rede real | morta | morta |
| pendência | `categoria: 'offline'` | `categoria: 'offline'` |
| **selo da topbar** | "Sincronizar (3)" | **"Offline — salvo no aparelho (3)"** |

> Nota do caminho: enquanto a fila só tinha as 2 pendências antigas (`obsoleto`), o selo
> respondia "online" — e está CERTO. A evidência de queda nasce de uma tentativa real que falha
> por rede; sem trabalho pendente não há o que provar, e `navigator.onLine` volta a ser tudo que
> existe.

### 4.4 · A retentativa automática, com testemunha

Reconexão sem clicar em "Sincronizar", sem disparar evento `online` e sem recarregar a página.
Um observador instalado na página contou cliques no selo e eventos `online`:

| | |
|---|---|
| Fila | **3 → 2**, sozinha |
| Tempo até drenar | **~74 s** após a volta da rede (janela de 45 s + tick de 4 s) |
| Cliques no selo | **0** |
| Eventos `online` | **0** |
| Servidor | versão **9 → 10**, `pmtaAdotadaMpa = "0.91"`, às 17:55:05 |
| Projeção | `source_version 10`, mesmo timestamp |
| Pendências antigas | as 2, intactas |
| Conflitos | 0 · `dados` 61 |

### 4.5 · Estado final

| | |
|---|---|
| `auditar_projecao` nas 2 orgs convergidas | **`convergiu: true`, `pendencias: 0`** |
| Dashboard online | 4 / 0 / 0 / 100 %, selo "Dados de 14:56" |
| Projeto Supabase | **Healthy** (compute NANO) |
| `boot_v9` | **1** organização (a de teste) · `busca_v9` **0** |
| Suíte | **1315/1315** (eram 1298; +17) · build verde |

---

## 5 · Três lições que ficam

1. **`auditar_projecao` pode dizer `convergiu: true` com função de projeção velha no banco.** Ela
   compara a projeção com o que a FUNÇÃO ATUAL produz, não com o que a etapa nova exige. Depois
   de reaplicar SQL de projeção, conferir o `prosrc`.
2. **O service worker serve o bundle antigo depois do deploy.** Medido de novo aqui: o servidor
   já entregava `index-o18n-uvq.js` (conferido por fora do navegador, com `curl`) enquanto a aba
   recebia `index-C_iTpE2Y.js` do cache. Conferir o bundle SEMPRE fora do navegador.
3. **`navigator.onLine === true` não significa nada.** A metade confiável da promessa é só o
   `false`. Qualquer decisão de UI apoiada no `true` mente exatamente quando mais importa.
