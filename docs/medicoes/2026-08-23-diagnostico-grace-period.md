# `Grace period is over` — o que é, objetivamente

**23/08/2026** · investigação no Dashboard do Supabase · **somente leitura, nada foi alterado**

Projeto **SAAS NR13** (`qqsesrntfvmdxqxrfvmw`, sa-east-1) · organização **meu SaaS delivery**
(`tsmbvmesdeuaclsxyxnd`) · dono `perone.fs@gmail.com`.

---

## Resposta curta

**Não há nada bloqueado agora, e não há problema de pagamento.** O aviso anuncia que o período de
carência acabou em **16/08/2026** e que, **a partir de agora, estourar a cota restringe o
projeto** — não que ele já esteja restrito.

O projeto está **Healthy**, serviu **360 requisições nos últimos 60 min com 100 % de sucesso**,
CPU 2 %, disco 19 %, RAM 55 %, 11 de 60 conexões.

---

## 1 · O texto exato do aviso

> **Your grace period is over.**
> Your grace period ended on **16 Aug, 2026**. **Fair Use Policy applies now.** If your
> organization is over its quota, your projects **can be restricted** and requests will respond
> with a **402** status code. Upgrade your plan if you expect to exceed your plan's quota.

**Leitura literal:** é condicional (*"if your organization is over its quota"*). É um aviso
**permanente e informativo** do estado da conta, não um alarme de incidente.

---

## 2 · As dez perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Qual cota originou o aviso | **Nenhuma.** O aviso é do fim da carência, não de cota estourada. A métrica mais próxima do teto é o **Cached Egress, em 54 %** |
| 2 | Uso atual | ver a tabela abaixo |
| 3 | Limite atual | Free Plan — ver a tabela abaixo |
| 4 | Ciclo | **20/08/2026 → 20/09/2026** |
| 5 | Existe restrição hoje | **Não.** `Overage in period: 0 GB` nas duas métricas de egresso; projeto **Healthy**, 100 % de sucesso |
| 6 | Risco de read-only, pausa ou 402 | **Sim, condicional a estourar a cota.** O *spend cap* está LIGADO, e é ele que converte excesso em restrição em vez de cobrança |
| 7 | Problema de faturamento/cartão/fatura | **Não.** 7 faturas, **todas US$ 0,00 e PAID**. A última é de 19/08/2026 |
| 8 | O aviso é histórico/persistente | **Persistente e informativo.** Fica visível enquanto a organização estiver no Free Plan sob Fair Use |
| 9 | Quando renova | **20/09/2026** |
| 10 | Há margem para o que vem | **Sim, com folga enorme.** Ver §5 |

---

## 3 · Uso × limite, ciclo de 20/08 a 20/09

| Métrica | Uso | Limite | % | Overage |
|---|---:|---:|---:|---:|
| **Cached Egress** | **2,71 GB** | 5 GB | **54 %** | **0 GB** |
| Storage Size | 0,37 GB | 1 GB | 37 % | — |
| Database Size | 0,102 GB | 0,5 GB/projeto | 20 % | — |
| Egress (não cacheado) | 0,92 GB | 5 GB | 18 % | **0 GB** |
| Realtime Peak Connections | 3 | 200 | 2 % | — |
| Edge Function Invocations | 250 | 500.000 | <1 % | — |
| Realtime Messages | 632 | 2.000.000 | <1 % | — |
| Monthly Active Users | **8** | 50.000 | <1 % | — |

**Cost Control:** *Spend cap is enabled* — "You won't be charged any extra for usage. However,
your projects could become unresponsive or enter read only mode if you exceed the included quota."

---

## 4 · O que consome, e por que isso importa para a Fase 9

**Egresso não cacheado, por tipo (21/08, o dia de pico medido):**

| Tipo | % | Volume |
|---|---:|---:|
| **PostgREST** | **65,1 %** | **163,9 MB** |
| Storage | 34,7 % | 87,3 MB |
| Functions | 0,1 % | 196 KB |
| Auth | 0,1 % | 278 KB |
| Realtime | 0,1 % | 173 KB |

> **PostgREST é 65 % do egresso, e PostgREST aqui é `app_storage`** — ou seja, a hidratação
> integral que a Fase 9 existe para eliminar.

**Cached Egress por dia:** 250 MB (20/08) · ~1,0 GB (21/08) · ~1,15 GB (22/08) · ~290 MB
(23/08, dia parcial).

> **Limite honesto desta investigação:** o gráfico de *cached egress* não oferece detalhamento por
> tipo, então **não consigo atribuí-lo** com a mesma segurança. Pela definição do próprio painel
> ("API, Storage and Edge Functions" servidos por cache), o candidato mais provável são as **fotos
> do bucket** servidas por CDN. Isso é inferência, não medição — e está marcado como tal.

### A conta que preocupa

Consumo de *cached egress*: **2,71 GB em 4 dias**, com **3 dias completos** somando ~2,4 GB —
cerca de **800 MB/dia**. Restam **2,29 GB** e faltam **28 dias** de ciclo.

**Nesse ritmo, o teto de 5 GB seria atingido por volta de 26/08**, deixando ~25 dias de ciclo em
que o projeto pode responder **402**.

E isso com **8 usuários ativos no mês**. São ~100 MB por usuário por dia — o perfil de quem baixa
a organização inteira a cada abertura.

> **Este é o achado mais importante da investigação, e ele é independente do deploy:** o risco de
> restrição não vem do que vamos fazer, vem do que o sistema **já faz hoje**.

---

## 5 · Há margem para o que está planejado?

**Sim, e a margem é enorme** — porque nada do que está planejado consome egresso relevante.

| Operação | Egresso | Crescimento do banco |
|---|---|---|
| `rls_funcoes_estaveis.sql` | 6 `ALTER FUNCTION` + 2 políticas → **alguns KB** | **zero** |
| Migrations da V9 | DDL, respostas mínimas → **alguns KB** | tabelas VAZIAS + funções ≈ **< 1 MB** |
| Backfill de UMA org pequena (20–200 equipamentos) | RPC **server-side**: o cliente **não baixa nada**, só o retorno em JSON → **dezenas de KB** | ~471 B × 200 ≈ **~300 KB** com índices |
| Validação real da 9C | navegação normal no app, ~30 min | — |

Contra **2,29 GB** de cached egress e **4,08 GB** de egresso ainda disponíveis, tudo isso soma
**alguns megabytes**. Não é o deploy que ameaça a cota.

### E há um argumento no sentido inverso

A validação da 9C com a flag **ligada** consome **menos** que com ela desligada: a lista passa de
"a organização inteira" para **41 KB por página**. Medido no laboratório: 42.450 → 1.301 nós no
DOM, e a rede acompanha.

> **Adiar a Fase 9 para poupar cota é o contrário do que a evidência recomenda.** Os 65 % de
> PostgREST são exatamente o que ela remove.

---

## 6 · O que eu NÃO fiz, e o que precisaria de autorização

Investiguei e **não alterei nada**. Não mudei plano, não toquei em cartão, não mexi no *spend
cap*, não rodei SQL, não liguei flag.

**Nada precisa ser alterado para continuarmos** o trabalho local. Se em algum momento a decisão
for dar folga à cota, as opções — **para o senhor decidir, não para eu executar** — são:

| Opção | O que é | Custo | Risco | Rollback |
|---|---|---|---|---|
| **Não fazer nada** | O ciclo renova em 20/09 e zera os contadores | US$ 0 | Se o consumo mantiver o ritmo, ~25 dias sob risco de 402 | — |
| **Reduzir o consumo** | É o que a Fase 9 faz. Além dela, revisar quantas vezes as fotos são rebaixadas | US$ 0 | Nenhum | — |
| Desligar o *spend cap* | Passa a **cobrar** o excesso em vez de restringir | Variável, US$/GB | Cobrança inesperada no cartão | religar |
| Subir para o plano Pro | Cotas maiores | US$ 25/mês por organização | Custo fixo | voltar ao Free |

**Recomendação técnica:** não mexer em plano nem em *spend cap* agora. O caminho barato é reduzir
o consumo — e ele já está construído, esperando autorização.

---

## 7 · Conclusão para o rollout

**O `Grace period is over` NÃO impede tecnicamente o deploy.** Não há restrição ativa, não há
dívida, não há bloqueio; há uma cota de Free Plan que hoje está em 54 % no pior item, e um ritmo
de consumo que merece atenção **por si só**.

A decisão de quando aplicar continua sendo sua. O que a investigação acrescenta é que **o custo
das operações planejadas é desprezível** e que **a causa do consumo é justamente o que a Fase 9
corrige**.
