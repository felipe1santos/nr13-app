# SUPABASE — COTA ESTOURADA E SERVIÇO RESTRITO (31/08/2026)

> **O que este arquivo é:** o diagnóstico SOMENTE LEITURA do incidente de cota. Nenhum código
> foi alterado, nenhum SQL aplicado, nenhuma flag mexida, nenhuma reprojeção, nenhuma massa
> gerada, nenhum deploy. As únicas ações foram: ler o painel de Usage/Billing e fazer **8
> requisições HTTP de leitura** contra endpoints públicos, para saber o código de status.

**Conclusão em uma linha: é problema de COBRANÇA, não de código. O NR-13 é vítima, não causa —
ele responde por 0,65% do consumo que estourou. E o sistema está FORA DO AR para os clientes.**

---

## 1 · O que estourou

| | |
|---|---|
| Métrica | **Cached Egress** (tráfego de saída servido a partir de cache: API, Storage e Edge Functions) |
| Usado × limite | **8,32 GB de 5 GB — 166%** · excedente **3,32 GB** |
| Plano | **Free**, organização `meu SaaS delivery` (`tsmbvmesdeuaclsxyxnd`) |
| Ciclo atual | **20 ago 2026 → 20 set 2026** |
| Renovação | **20 de setembro de 2026** |

**Nenhuma outra métrica estourou.** Todas as demais estão folgadas:

| métrica | usado / limite |
|---|---|
| Egress (não-cache) | 2,35 / 5 GB (47%) — excedente **0** |
| Storage Size | 0,42 / 1 GB (42%) |
| Database Size | 0,103 / 0,5 GB (21%) |
| Edge Function Invocations | 534 / 500.000 (<1%) |
| Realtime Messages | 1.731 / 2.000.000 (<1%) |
| Realtime Peak Connections | 4 / 200 (2%) |
| Monthly Active Users | 15 / 50.000 (<1%) |

Não é banco. Não é compute. Não é storage. Não é MAU. **É cached egress, e só ele.**

---

## 2 · Quem consumiu — a evidência, por projeto

A organização tem **DOIS** projetos, e a cota é somada entre eles. O painel abre filtrado pelo
projeto que você está olhando, o que esconde isso — foi preciso trocar para "All Projects".

| projeto | ref | **Cached Egress** | Egress | Storage | DB | MAU | Edge inv. |
|---|---|---|---|---|---|---|---|
| **`menuzia`** | `nclnxmdvxmrzrkqystka` | **8,262 GB** | 2,103 GB | 0,19 GB | 0,034 GB | 6 | **0** |
| `SAAS NR13` | `qqsesrntfvmdxqxrfvmw` | **0,054 GB** | 0,245 GB | 0,229 GB | 0,103 GB | 9 | 535 |
| **total org** | | **8,315 GB** | 2,347 GB | 0,418 GB | | 15 | |

> **`menuzia` responde por 99,35% do cached egress. O NR-13 responde por 0,65%.**

**O que chama atenção no `menuzia`, e é só o que os dados sustentam:** ele serviu **8,26 GB a
partir de um bucket de 0,19 GB**, com **zero** invocações de Edge Function e 6 usuários ativos.
Isso é o equivalente a baixar o bucket inteiro **cerca de 43 vezes** no mês. É um perfil de
consumo desproporcional ao tamanho do dado e ao número de usuários, o que é típico de arquivo
público sendo servido em volume (imagem/mídia em página aberta) ou de algum laço de
re-download. **Não investiguei além disso**: `menuzia` é outro produto, e o pedido foi
diagnosticar, não mexer.

### Cached egress por dia (organização, GB aproximados do gráfico)

| 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | **29** | 30 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0,15 | 0,98 | 1,05 | 1,07 | 0,43 | 0,30 | 0,25 | 0,19 | 0,42 | **1,75** | 0,95 |

O pico foi **29 de agosto**. Em 31/08 o consumo é ~0, porque **tudo está sendo recusado**.

---

## 3 · A restrição é REAL e está ativa agora

Texto exato do painel:

> *"All services are restricted. Fair Use Policy applies and your service is restricted. Your
> projects are not able to serve requests and will respond with a **402 status code**. You have
> exceeded your plan's quota (**Cached Egress Exceeded**). Upgrade your plan to lift
> restrictions immediately, or wait until the start of your next billing period."*

**Teste real contra o projeto do NR-13** (31/08/2026 ~03h33, com a chave publicável do bundle
de produção — 8 requisições, nenhuma escrita):

| endpoint | status | resposta |
|---|---|---|
| `/auth/v1/health` | **402** | — |
| `/auth/v1/settings` | **402** | `Service for this project is restricted due to the following violations: exceed_cached_egress_quota` |
| `/rest/v1/rpc/assinatura_org` | **402** | mesma mensagem |
| `/storage/v1/version` | **402** | — |
| `/functions/v1/` | **402** | — |

Resposta literal do servidor:

```
{"message":"Service for this project is restricted due to the following violations:
 exceed_cached_egress_quota. The project owner must upgrade their plan or remove spend caps
 to restore service."}
```

### O que o app de produção consegue fazer AGORA

| capacidade | estado |
|---|---|
| Carregar o site (`app.nr13sistema.com.br`) | ✅ **funciona** — o front é estático, servido pelo Coolify, e não depende do Supabase |
| **Autenticar (login)** | ❌ **402** |
| **Ler `app_storage`** | ❌ **402** |
| **Chamar RPC** (busca, projeção, assinatura) | ❌ **402** |
| **Abrir Storage / baixar PDF / fotos** | ❌ **402** |
| **Edge Functions** (`trial`, `kiwify_webhook`, `portal_cliente`, `org_admin`) | ❌ **402** |
| SQL Editor do painel | ✅ funciona — vai por outro caminho, não pelo gateway público |
| Banco em si | ✅ **vivo e ocioso**: CPU 2%, disco 19%, RAM 57%, 6/60 conexões |

> **Os clientes estão recebendo erro.** O site abre, a tela de login aparece, e o login falha.
> Quem já estava logado não consegue ler nem gravar nada. O selo do projeto está
> **`Unhealthy`** e **`EXCEEDING USAGE LIMITS`** — mas o "unhealthy" aqui é a restrição
> comercial, não uma falha de servidor: a máquina está saudável e sem carga.

**Consequência séria e específica deste sistema:** o `kiwify_webhook` é uma Edge Function e
está em 402. Enquanto durar a restrição, **pagamento aprovado na Kiwify não chega ao banco**.
Os eventos precisarão ser reconciliados depois (a Kiwify reenvia, mas isso precisa ser
conferido).

---

## 4 · Separando o problema de COBRANÇA do problema de CÓDIGO

| | |
|---|---|
| **(A) Cobrança/cota** | **É esta a causa.** Cached egress da organização em 166%, 99,35% dele vindo do projeto `menuzia`. Nada no código do NR-13 causou isso e nada no código do NR-13 resolve. |
| **(B) Código** | **Não há defeito do NR-13 envolvido no estouro.** O NR-13 gastou 0,054 GB de cached egress e 0,245 GB de egress no ciclo inteiro — 5% do teto de egress e 1% do teto de cached egress. |

> **Não se conserta uma restrição de cota mexendo no NR-13.** Qualquer alteração de código
> agora seria trabalho sem efeito sobre o bloqueio.

Vale registrar o contexto, sem transformar em desculpa: a Fase 9 nasceu justamente do consumo
alto de egress do NR-13 (`cota-supabase-ago-2026`), e o trabalho de 9A–9F já derrubou muito
desse consumo. O gasto atual do NR-13 confirma que aquele lado está sob controle. **Mas não é
esse o motivo do bloqueio de hoje.**

---

## 5 · Solução imediata × solução estrutural

### Imediata — só existem DUAS saídas, e as duas são de cobrança

| opção | efeito | custo | quando |
|---|---|---|---|
| **1 · Subir para o plano Pro** | Levanta a restrição **imediatamente**; o teto de cached egress sai de 5 GB e o excedente passa a ser cobrado em vez de bloquear | ~US$ 25/mês | agora |
| **2 · Esperar a renovação** | O ciclo reinicia e a restrição cai (o painel avisa que pode haver um atraso curto depois do reset) | zero | **20 de setembro de 2026 — 20 dias** |

> **Pausar ou apagar o `menuzia` NÃO destrava.** O consumo de 8,32 GB **já aconteceu** neste
> ciclo; parar o consumidor impede que piore, mas não devolve a cota. Continuaria bloqueado até
> 20/09 ou até o upgrade.

**Recomendação:** se o NR-13 tem cliente pagante usando (e tem — `cmam.caldeiras`), **20 dias
fora do ar não é uma opção**. O upgrade para Pro é a única saída imediata, e é decisão sua.

### Estrutural

1. **Separar `menuzia` do NR-13 em organizações diferentes no Supabase.** Hoje eles dividem uma
   cota única: **um projeto derrubou o outro**, e o NR-13 não tem defesa contra isso. É o item
   mais importante desta lista, e é de configuração, não de código.
2. **Descobrir e corrigir o consumo do `menuzia`** — 8,26 GB servidos de um bucket de 0,19 GB
   precisa de explicação (arquivo público em página aberta, cache mal configurado, ou laço).
   Fora do escopo do NR-13; posso investigar se você autorizar.
3. **Alarme de cota.** O painel avisou (período de graça em 30/08, restrição em 31/08) e o
   aviso só foi visto quando o serviço já tinha caído.
4. **Seguir a Fase 9.** Ela reduz o consumo do NR-13 e continua valendo — mas ela **não é** a
   resposta a este incidente, e não deve ser apressada por causa dele.

---

## 6 · Podemos continuar a Fase 9 com segurança?

**Trabalho local (código, testes, build): SIM.** Nada disso toca o Supabase.

**Qualquer coisa que toque produção: NÃO, e por dois motivos.**

1. **Não dá para validar.** Todo rollout da Fase 9 termina em roteiro na tela, com a flag ligada
   na organização de teste. Com o gateway em 402, a tela não carrega, não autentica e não lê —
   não há como provar nada. Aprovar um rollout sem o roteiro seria exatamente o que este projeto
   não faz.
2. **É a hora errada.** Com o sistema fora do ar para clientes, a prioridade é restaurar o
   serviço, não empilhar mudança nova por cima.

**Recomendação:** manter a **9F.3 pausada** (como você já decidiu), resolver a cobrança, e
retomar o rollout depois que o gateway voltar a responder 200.

---

## 7 · Estado ao fim do diagnóstico

| | |
|---|---|
| `src/` | **intocado** |
| SQL / schema / flags / reprojeção | **intocados** |
| Deploy | **nenhum** |
| Ações executadas | leitura do painel + **8 requisições HTTP de leitura** |
| Carga artificial | **nenhuma** |
| Flags de tela | `busca_v9` 0/30 · `inspecoes_v9` 0/30 · `prontuarios_v9` 0/30 · `boot_v9` 2/30 |
| 9F.3 | **pausada por decisão do dono** — análise aprovada como planejamento |
