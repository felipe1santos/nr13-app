# Auditoria do motor de vencimentos + refino do Dashboard — 07/09/2026

> Queixa que abriu a rodada: *"cadastrei um certificado de calibração, anexei o
> PDF, informei uma validade dentro dos próximos 30 dias e ELE NÃO APARECEU NO
> DASHBOARD."*

---

## 1. A causa, medida (não suposta)

O certificado **estava salvo e sincronizado**. O que não existia era a leitura:
**nenhuma das duas fontes do painel lia a família `nr13_rastreab_`.**

| fonte do painel | o que ela varre | lê `nr13_rastreab_`? |
|---|---|---|
| local (`vencimentos.listarVencimentos`) | `nr13_info_` (equipamentos) e, dentro de cada um, `nr13_calibracoes_` | **não** |
| servidor (`vencimentos_org`, `supabase/vencimentos_agregado.sql`) | `equipamentos_index` + `relatorios_index` + `calibracoes_index` | **não** — certificado de padrão não está em projeção nenhuma |

E `carregarPainel()` usa **só** a fonte do servidor desde a Fase 9 (9G.3). Ou
seja: o dado chegava ao banco e morria ali, para efeito de prazo.

Não era filtro de tipo, normalização de data, hidratação nem sincronismo. Era
**ausência de fonte** — a hipótese "família de chave ignorada" da lista do
pedido.

Por que ninguém tinha visto: a família não pertence a equipamento nenhum. Ela é
da ORGANIZAÇÃO (um certificado ativo por `tipoInstrumento`), e as duas fontes
foram construídas percorrendo equipamentos.

---

## 2. A tabela da auditoria

Todas as fontes de data do sistema, e o que cada uma é.

| # | domínio | onde é salvo | chave / tabela / projeção | campo de data | hoje no Dashboard | hoje em /vencimentos | precisa aparecer | como é agregado |
|---|---|---|---|---|---|---|---|---|
| 1 | Inspeção do equipamento (relatório mais recente) | localStorage + `app_storage` | `nr13_rel_<id>_<TAG>` / índice `nr13_historico_indice_<TAG>` / `relatorios_index` | `proximaInspecaoInterna`, `proximaInspecaoExterna` (vale a **menor**) | sim | sim | sim | RPC `vencimentos_org` → `itemDeEquipamento`, origem `inspecao` |
| 2 | Vida remanescente (reserva do item 1) | idem | `nr13_vida_<TAG>` / `equipamentos_index.vida_base`, `vida_prox_anos` | `entrada.dataAtual` (ou `calculadoEm`) + `proximaInspecaoAnos` | sim | sim | sim | mesma RPC; só entra quando o relatório não tem prazo |
| 3 | Calibração de acessório instalado (manômetro, PSV do equipamento) | idem | `nr13_calibracoes_<TAG>` / `calibracoes_index.prox_calibracao` | `dataProxCalibracao` | sim | sim | sim | mesma RPC → `itemDeCalibracao`, origem `calibracao`; só a calibração mais recente por componente |
| 4 | **Certificado do instrumento PADRÃO** (manômetro padrão, PSV padrão, bloco de espessura, e os demais `TipoInstrumento`) | idem | `nr13_rastreab_<id>` — sem projeção; lido por função | `validade` | **NÃO** ← o defeito | **NÃO** | **sim** | **NOVO:** RPC `certificados_padrao_org()` (metadados, sem o PDF) → `itemDeCertificado`, origem `certificado` |
| 5 | Padrão usado DENTRO de um certificado de calibração | idem | `nr13_calibracoes_<TAG>` → `padraoVal` | `padraoVal` | não | não | **não** | é registro HISTÓRICO ("com que padrão esta calibração foi feita"), não prazo vigente. O prazo vigente daquele padrão é o item 4 |
| 6 | Validade do relatório | idem | `meta.validade` / `RelatorioIndiceItem.validade` | `validade` | não | não | **pendência declarada** (§6) | não agregado nesta rodada — ver "Limitações" |
| 7 | Validade da válvula na lista de relatórios | derivado | `validadeValvula` / `validadesPorRelatorio(tag)` | — | não | não | não | é a mesma data do item 3 (vem do lote de calibração). Agregá-la duplicaria a linha |
| 8 | Anotações da Agenda | localStorage | `nr13_agenda_notas` | `data` | não | não | não | controle pessoal do usuário — CLAUDE.md §2 já registra que não alimenta relatório, livro nem vencimento |
| 9 | Assinatura / trial da conta | `profiles` | `nr13_assinatura_ate`, `acesso_expira_em` | — | não | não | não | vencimento COMERCIAL. Tem barra própria (`BarraAssinatura`), e misturá-lo com prazo técnico de equipamento seria errado nos dois sentidos |
| 10 | Teste hidrostático | — | — | — | — | — | **não existe essa fonte** | o TH não persiste prazo próprio no modelo; ele entra na inspeção (item 1) |

---

## 3. O que mudou

### 3.1 A fonte que faltava — e a armadilha no meio do caminho

A primeira implementação tentou resolver **sem SQL nenhum**, com a extração
JSON do próprio PostgREST:

```
select=chave,validade:valor->>"validade",tipo:valor->>"tipoInstrumento"
      &chave=like.nr13_rastreab_%
```

Ela foi **medida em produção antes de ser declarada pronta**, e é bom que
tenha sido: o PostgREST **aceita a sintaxe, responde HTTP 200, devolve as
linhas certas — e todos os campos projetados vêm `null`.**

```
[{"chave":"nr13_rastreab_5264…","deletado_em":null,
  "nome":null,"tipo":null,"validade":null}, …]
```

`app_storage.valor` é `text`, não `json`. O operador `->>` sobre texto não
extrai **e não reclama**: devolve vazio. O painel teria voltado a dizer
"Nenhum prazo cadastrado" sobre um certificado que está lá — a queixa
original outra vez, com roupa nova, e agora com um teste verde por cima.

A leitura passou então a ser uma FUNÇÃO,
`supabase/vencimentos_certificados.sql` → `certificados_padrao_org()`, onde o
`::jsonb` é explícito:

```sql
nullif(j.v ->> 'tipoInstrumento', '')  -- j.v = s.valor::jsonb, com guarda
```

Quatro decisões que carregam a regra:

* **o PDF não trafega.** `valor` guarda o registro COMPLETO no servidor —
  inclusive o arquivo em base64, que o cache local nem chega a ver (CLAUDE.md
  §2-bis). A extração é feita pelo Postgres: chegam cinco strings curtas por
  certificado. Baixar `valor` inteiro para ler uma data traria megabytes;
* **o cast tem guarda.** `valor` é texto livre: um registro corrompido não pode
  derrubar a consulta inteira e apagar o painel de quem tem 20 certificados
  sãos. O `::jsonb` mora num `lateral` com teste de formato;
* **o escopo é aplicado DENTRO da função** (`org_id = org_atual()`, e o papel
  `cliente` do Portal não passa). Quem chama não escolhe organização;
* **`security definer` sem `anon`.** `revoke all … from public, anon` vem antes
  do `grant … to authenticated` — toda função nova nasce executável por
  `public`, e `anon` herda de `public`. Conferido depois de aplicar:
  `proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

**Aplicado em produção em 07/09/2026**, com a disciplina do CLAUDE.md §13: o
texto foi transcrito por base64 e o SHA-256 do que estava DENTRO do editor foi
comparado com o do arquivo do commit —
`2c7ecd336890fd37858b8e4ddadb4790c7f2e93baabb38b3c75b979da4432ac6`, igual —
antes de rodar. O arquivo é só `create`: não há `drop` nenhum, e portanto não
há caminho pelo qual ele derrube objeto existente. Conferência depois de rodar
por `pg_proc` (nome, `prosecdef`, `proacl`, retorno) e por chamada real
autenticada, que devolveu os campos **preenchidos**.

### 3.2 A regra, no mesmo lugar das outras

`itemDeCertificado()` em `src/services/vencimentos.ts`, ao lado de
`itemDeEquipamento` e `itemDeCalibracao`. Devolve `null` em dois casos, e os
dois são regra:

* registro **substituído** (soft-replace do `nr13_rastreab_`): quem vence é o
  que o trocou;
* validade ausente ou ilegível: sem data não há prazo — nada é inventado.

`ItemVencimento.origem` passou de dois valores para três: `inspecao`,
`calibracao` e `certificado`. **O padrão da bancada e o acessório do vaso não se
confundem** (§5 do pedido): "Manômetro" é o instrumento instalado no
equipamento; "Manômetro padrão" é o da bancada que o calibrou.

### 3.3 Datas: sentinela e transbordo

Duas correções de normalização, ambas com caso de teste:

* **`parseDataPrazo`** recusa data fora de 1990–2200. `01/01/1970`,
  `1900-01-01` e `9999-12-31` deixam de virar vencimento. Antes, uma sentinela
  abria o Dashboard com *"Vencido há 20.703 dias"* no topo, empurrando para
  baixo o que vence esta semana. `parseDataFlex` continua aceitando tudo — ele
  também ordena histórico e desenha o Portal;
* **`parseDataFlex` deixou de transbordar.** `new Date(2026, 12, 32)` não é
  inválida para o JavaScript: vira 01/02/2027. Era assim que `32/13/2026` —
  digitação errada, importação torta — virava um vencimento plausível. Agora a
  data volta ao mesmo dia/mês/ano ou é recusada.

### 3.4 Deduplicação

`chaveIdentidade(item)` = `origem | pertenceA | tag | nome | vencimento(ISO)`, e
`dedupVencimentos` mantém a primeira ocorrência. A chave **não** usa `dias`:
ele é derivado de `hoje` e mudaria a identidade da mesma linha entre duas
renderizações do mesmo dia.

### 3.5 Contadores

Os certificados entram **na lista e nos contadores**:

* `aVencer30` = `a_vencer_30` do agregado **+** certificados com 0–30 dias;
* `vencidos` = `vencidos` do agregado **+** certificados vencidos;
* `total` **não** recebe certificados: aquele card conta EQUIPAMENTOS
  CADASTRADOS, e padrão de bancada não é equipamento sob NR-13. Somá-lo
  inflaria o parque do cliente.

Se a consulta dos certificados **falhar** com o agregado respondendo, os três
contadores que eles alimentam viram `undefined` → a tela mostra **"—"**, e o
selo diz *"os certificados dos padrões não puderam ser conferidos nesta
consulta"*. Zero seria uma afirmação, e a errada.

---

## 4. Taxa de conformidade — fórmula antiga, problema e semântica final

**Fórmula antiga** (`conformidadeDe`, inalterada):

```
comPrazo = itens com prazo cadastrado
conformidade = round( (comPrazo − vencidos) / comPrazo × 1000 ) / 10     (0 itens → 100 %)
```

**O problema não era a fórmula, era o CONJUNTO.** `comPrazo` vinha de
`com_prazo` do agregado, que soma equipamentos e calibrações. Um certificado
vencido não estava em conjunto nenhum — daí "100 % em dia" convivendo com um
certificado fora da validade.

**Semântica final:** a fórmula é a mesma; o conjunto passou a ser
*inspeções + calibrações de acessório + certificados de padrão*, os mesmos itens
listados logo abaixo do card. O texto do card diz o escopo em voz alta:
**"dos prazos deste painel em dia"** — antes dizia "itens com prazo em dia", que
não informava quais itens.

Não é conformidade normativa da planta: é conformidade dos PRAZOS que este
sistema conhece.

---

## 5. Layout — medido antes e depois

`node scripts/ux-dashboard.mjs` (Chrome headless, `<iframe>` para as larguras,
CSS "antes" vindo de `git show HEAD:` e "depois" da árvore de trabalho).

| medida | 1400px | 768px | 386px |
|---|---|---|---|
| card mais alto | 125 → **84px** | 125 → **84px** | 116 → **70px** |
| bloco dos 4 indicadores | 125 → **84px** | 264 → **180px** | 227 → **150px** |
| topo da página → cards | 47 → **14px** | 47 → **14px** | 43 → **18px** |
| topo → lista de prazos | 192 → **134px** | 330 → **230px** | 289 → **204px** |
| largura da lista de prazos | 824 → **904px** | 708 → 708px | 344 → 344px |
| card "Alertas críticos" | presente → **removido** | idem | idem |
| chips de categoria por linha | 0 → **3** | 0 → 3 | 0 → 3 |
| transbordo horizontal | não → não | não → não | **sim → não** |

O transbordo em 386px **já existia antes** desta rodada (o cartão terminava em
404px numa tela de 386px) e ninguém tinha medido; ficou consertado de passagem
com `min-width: 0` nos dois níveis do cartão.

Cores dos quatro números, conferidas por `getComputedStyle`:
`#0C4F9B` (azul), `#D9640C` (âmbar), `#B93A33` (vermelho), `#1FA971` (verde) —
filete à esquerda + ícone + número, sem fundo colorido.

---

## 6. Limitações declaradas

1. **`meta.validade` do relatório (item 6 da tabela) não entra no painel.** Ela
   é preenchida à mão no modal de Configurações do Relatório e, na prática, é a
   mesma data da próxima inspeção — agregá-la sem uma regra de precedência
   produziria duas linhas para o mesmo prazo. Além disso, o agregado do servidor
   não projeta essa coluna: incluí-la exigiria migração SQL em produção
   (CLAUDE.md §13). Fica registrado como decisão desta rodada, não como
   esquecimento;
2. **A leitura de certificados é por organização inteira, com teto de 2.000
   linhas.** É folgado para a família (um ativo por tipo + versões
   substituídas), mas é teto: uma organização que passe disso teria certificados
   fora da conta. Não há aviso de truncamento nessa consulta específica;
3. **O caminho local (`listarVencimentos`) também passou a ler
   `nr13_rastreab_`**, embora nenhuma tela o use desde a 9G.3. Foi mantido em
   paridade de propósito: ele é a referência da regra e o que os testes exercem.

---

## 7. Testes

`src/services/vencimentosCertificados.test.ts` — 27 casos:

* certificado em 5 / 30 / 31 / 60 dias, vencendo hoje, vencido e vencido há
  muito;
* rótulo por tipo (manômetro, PSV, bloco de espessura);
* validade ausente, vazia, ilegível, sentinela e data transbordada;
* substituído (soft-replace) e tombstone (`deletado_em`);
* inspeção interna, externa, a menor das duas, e equipamento sem prazo;
* acessório do equipamento × padrão da bancada (identidades distintas);
* deduplicação (mesma linha, linhas parecidas, acessórios de equipamentos
  diferentes);
* contadores: 1 inspeção + 1 manômetro padrão + 1 PSV padrão = 3 a vencer;
  certificado vencido derruba a conformidade para 75 %;
* organização sem vencimentos e cache local vazio;
* **GATE**: todo membro de `TipoInstrumento` tem rótulo em `ROTULO_PADRAO`; a
  projeção do servidor contém todos os campos que a regra lê e **não** contém
  `valor` inteiro nem `pdfBase64`; servidor e cache varrem o mesmo prefixo; o
  agregado soma os certificados aos três contadores.

Suíte completa do app: **179 arquivos, 2.498 casos, verde.**

---

## 8. E2E em produção — 07/09/2026

Feito na organização de teste `99f642d3` (conta `teste@gmail.com`), com
entidades `ZZ-*` descartáveis, poucos casos e nenhuma geração em massa.

### Antes (estado inicial, bundle novo já no ar)

Painel: **"Nenhum prazo cadastrado"**, "Ver todos os vencimentos (0)" — com um
certificado `ZZ-F6-001` cadastrado, validade 07/12/2026, PDF anexado. É a
queixa reproduzida.

*(Este primeiro estado é o que revelou a armadilha do §3.1: o bundle
intermediário já lia a família, mas pelo PostgREST, e recebia campos nulos.)*

### TESTE A — certificado com validade em ~20 dias

Cadastrado pela UI no card **Manômetro padrão**: `ZZ-TESTE E2E Manômetro
padrão`, nº `ZZ-E2E-30D`, validade **27/09/2026**, PDF anexado, salvo e
sincronizado (confirmado pela RPC, que devolveu o registro com todos os campos
preenchidos).

| filtro | resultado |
|---|---|
| Todos | **aparece** — `ZZ-E2E-30D · Manômetro padrão · CERTIFICADO · 27/09/2026 · Vence em 20 dias · ATENÇÃO` |
| 30 dias | **aparece** |
| 60 dias | **aparece** |
| 5 dias | **NÃO aparece** ("Nada neste filtro") |

Card "PRÓXIMOS A VENCER (30D)": 0 → **1**.

### TESTE B — certificado VENCIDO

Cadastrado no card **Válvula PSV padrão**: nº `ZZ-E2E-VENCIDO`, validade
**30/08/2026** (8 dias atrás), PDF anexado.

* aparece no topo da lista: *Vencido há 8 dias · CRÍTICO*;
* card "VENCIDOS": 0 → **1**;
* **TAXA DE CONFORMIDADE: 100 % → 66,7 %** — o certificado vencido deixou de
  conviver com "tudo em dia", que era o §13 do pedido;
* banner crítico: *"1 certificado vencido requer atenção imediata"*.

### TESTE C — vencimento de INSPEÇÃO (o que já funcionava, ainda funciona)

Vida Remanescente calculada e salva em `ZZ-TESTE-P2` (10,00 mm em 07/09/2021 →
6,13 mm em 07/09/2026, mínima 6,00 mm): taxa 0,7741 mm/ano, próxima inspeção
0,08 anos → **07/10/2026**.

Painel com os três domínios juntos:

| linha | categoria | vencimento | prazo |
|---|---|---|---|
| ZZ-E2E-VENCIDO | CERTIFICADO | 30/08/2026 | Vencido há 8 dias |
| ZZ-E2E-30D | CERTIFICADO | 27/09/2026 | Vence em 20 dias |
| ZZ-TESTE-P2 | INSPEÇÃO | 07/10/2026 | Vence em 30 dias |
| ZZ-F6-001 | CERTIFICADO | 07/12/2026 | Vence em 91 dias |

Contadores: **A VENCER (30D) = 2** (1 certificado + 1 inspeção — o exemplo do
§11 do pedido, ao pé da letra), **VENCIDOS = 1**, **CONFORMIDADE = 75 %**
(4 com prazo, 1 vencido).

### TESTE D — o painel não depende do cache deste navegador

Não havia um segundo aparelho autorizado, e limpar o cache local desta conta
apagaria **3 pendências de sincronização ainda não resolvidas** (conflitos de
06/09 esperando decisão do dono) — destruí-las para produzir uma evidência
seria o oposto do que esta rodada conserta. A prova foi feita por
INSTRUMENTAÇÃO, que é mais forte que o cache limpo:

`Storage.prototype.getItem` e `indexedDB.open` foram interceptados e o painel,
recarregado. Chaves lidas durante a montagem:

```
["nr13_assinatura_status", "nr13_assinatura_ate", "nr13_plano",
 "sb-…-auth-token"]           ← nenhuma de vencimento
indexedDB aberto: nenhum
linhas renderizadas: 4
```

Nenhuma leitura de `nr13_rastreab_`, `nr13_info_` ou `nr13_calibracoes_`, e
nenhum banco local aberto: as quatro linhas vieram inteiras das duas RPCs. Um
aparelho que nunca abriu a tela de Certificados vê exatamente o mesmo painel.

### Limpeza

Os dois certificados de teste foram removidos **pelo fluxo oficial** (botão
Excluir do card, que faz o soft-delete marcando `substituidoEm`) — nenhum
delete cru. A identificação do alvo seguiu o CLAUDE.md §14: nº do certificado →
card que contém aquele nº e nenhum outro → botão dentro daquele card, com
recusa em caso de ambiguidade.

Estado final conferido: **A VENCER = 1, VENCIDOS = 0, CONFORMIDADE = 100 %**,
banner ausente, lista com `ZZ-TESTE-P2` (inspeção) e `ZZ-F6-001`
(certificado). Os registros substituídos continuam no servidor e **não**
produzem prazo — a regra do soft-replace, provada de ponta a ponta.

**O que ficou de propósito:** a Vida Remanescente de `ZZ-TESTE-P2`. Não existe
"desfazer" oficial para um cálculo salvo, e apagá-lo exigiria escrita crua.
Equipamento `ZZ-*` descartável; o dono recalcula quando quiser.

**Fora do escopo, observado:** a conta tem **3 conflitos de sincronização**
aguardando decisão do usuário (tela Pendências, de 06/09/2026) e o projeto
Supabase exibe `EXCEEDING USAGE LIMITS` com o aviso "Grace period is over".
Nenhum dos dois foi tocado.
