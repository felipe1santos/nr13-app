# Auditoria READ-ONLY da cota do Supabase

**Data:** 20/08/2026 · **Natureza:** somente leitura. **Nada foi alterado** — nenhum plano,
nenhuma compra, nenhuma exclusão, nenhuma limpeza.
**Origem dos números:** Dashboard do Supabase (Usage, nível de organização) + listagem
read-only do bucket com token de mestre.

> **Motivo:** durante o deploy da Fase 4 apareceu o banner *"Grace period is over"* e o badge
> **`EXCEEDING USAGE LIMITS`** no projeto. Ficou registrado como risco operacional aberto, e o
> dono pediu para investigar antes da Fase 5.

---

## 1. RESPOSTA CURTA

**Nenhuma métrica está excedida.** A maior está em **33 %**. Todas as linhas de *Overage in
period* estão em **0**.

O que houve: o **ciclo de faturamento virou hoje**. O ciclo anterior era 20/jul → 20/ago; o
atual é **20/ago → 20/set**, e começou hoje. O badge `EXCEEDING USAGE LIMITS` que vi durante o
deploy **refletia o ciclo que acabou de fechar** — e já **desapareceu**: o projeto agora aparece
como `Healthy`, sem badge.

O banner *"Grace period is over"* **não diz que a quota está estourada**. Ele diz, literalmente:

> "Your grace period ended on 16 Aug, 2026. Fair Use Policy applies now. **If** your organization
> is over its quota, your projects **can** be restricted and requests will respond with a 402."

É um aviso **condicional e permanente** sobre a política que passou a valer, não sobre o estado
atual do consumo.

---

## 2. Tabela — organização inteira, ciclo 20/ago → 20/set

Escopo **All Projects**, que é como o Supabase cobra ("Supabase uses organization-level billing
and quotas"). A organização tem **dois** projetos: `SAAS NR13` e `menuzia`.

| Métrica | Uso atual | Limite (Free) | % usado | Status | Reset | Risco |
|---|---|---|---|---|---|---|
| **Storage Size** | **0,331 GB** | 1 GB | **33 %** | ok | 20/set | **o mais alto — acompanhar** |
| **Database Size** | 0,102 GB | 0,5 GB **por projeto** | **20 %** | ok | — (estoque) | baixo |
| **Egress** | 0,131 GB | 5 GB | **3 %** | ok | 20/set | baixo |
| **Cached Egress** | 0,13 GB | 5 GB | **3 %** | ok | 20/set | baixo |
| Edge Function Invocations | 76 | 500.000 | <1 % | ok | 20/set | nenhum |
| Monthly Active Users | 3 | 50.000 | <1 % | ok | 20/set | nenhum |
| Realtime Peak Connections | 1 | 200 | <1 % | ok | 20/set | nenhum |
| Realtime Messages | 0 | 2.000.000 | 0 % | ok | 20/set | nenhum |
| MA Third-Party Users | 0 | 50.000 | 0 % | ok | 20/set | nenhum |
| SSO / Image Transformations | — | não incluído no plano | — | — | — | — |

**Database Size por projeto:** `SAAS NR13` **97,01 MB** · `menuzia` **31,88 MB**. O limite de
0,5 GB é **por projeto**, então o NR-13 está em **19,4 %** do seu próprio teto.

---

## 3. Estoque × Fluxo

O dono pediu essa separação, e ela muda a leitura do risco.

### FLUXO — zera todo ciclo

| | |
|---|---|
| Egress | 0,131 GB de 5 GB · **zera em 20/set** |
| Cached egress | 0,13 GB de 5 GB · zera em 20/set |
| Edge invocations | 76 de 500.000 · zera |
| MAU | 3 de 50.000 · zera |

> **Cuidado ao extrapolar:** os 0,131 GB são de **um único dia**, e esse dia teve a validação
> inteira da Fase 4 (dezenas de recargas do Portal, download de PDF, listagens do bucket). Não é
> um dia representativo. **Não projeto o mês a partir dele.**

### ESTOQUE — não zera; só cresce ou é apagado

| | |
|---|---|
| Storage | 0,331 GB de 1 GB — **acumulado, permanente** |
| Database | 97,01 MB de 0,5 GB (projeto NR-13) |

**É aqui que mora o risco de médio prazo:** estoque não se resolve esperando o reset.

---

## 4. Quem consome o Storage — medido

Listagem read-only do bucket `inspecao`, pasta da organização de teste
(`99f642d3-…`), com token de mestre:

| Tipo | Arquivos | MB | Média | % do total |
|---|---|---|---|---|
| **PDF** | **5** | **28,85** | **5,9 MB cada** | **99,5 %** |
| JPG (fotos) | 6 | 0,14 | 23,8 KB | 0,5 % |
| PNG (rubrica) | 1 | 0,01 | 12,4 KB | 0,0 % |
| **Total** | **12** | **29,0** | | |

| Pasta | Arquivos | MB |
|---|---|---|
| `relatorios` | 5 | **28,85** |
| `EQUIPE_TESTE` | 1 | 0,09 |
| `EQUIPE_TESTE_checklist` | 3 | 0,04 |
| `EQUIPE_TESTE_visual-externo` | 1 | 0,01 |
| `assinaturas` | 1 | 0,01 |
| `COMPRESSOR…visual-interno` | 1 | ~0,00 |

**O PDF de relatório é 99,5 % do estoque desta organização, com 5,9 MB por arquivo.** Bate com
o baseline de 16/08, que mediu no bucket inteiro: **14 PDFs = 91 MB de 110,4 MB (83 %)**, média
6,6 MB.

> **Limite da medição, declarado:** só consigo ler a pasta da **organização de teste** — a RLS
> restringe o mestre à própria org. Os 0,331 GB do Dashboard incluem as outras 26 organizações
> do app e o projeto `menuzia`. A proporção "PDF domina" é consistente entre as duas medições
> independentes, mas o rateio exato por organização exigiria a RPC `admin_storage_stats()`, que
> pede a conta de **admin da plataforma** (`perone.fs@gmail.com`), não a de teste.

---

## 5. Egress — por onde ele sai

O Dashboard **não fornece granularidade por caminho**. O que ele diz é apenas:

> "Contains any outgoing traffic including Database, Storage, Realtime, Auth, API, Edge
> Functions, Pooler and Log Drains."

**Não vou inventar precisão que a ferramenta não dá.** O que se pode afirmar com base na
arquitetura e nos tamanhos medidos:

| Caminho | Peso provável | Base |
|---|---|---|
| **Download de PDF** (sistema interno e Portal) | **dominante quando ocorre** | 5,9 MB por download, contra ~21 KB de uma abertura de Portal inteira |
| Fotos | baixo | 24–88 KB cada, com lazy loading (I-21) |
| Hidratação do sistema interno | moderado, recorrente | incremental desde 11/08 |
| Portal | **baixo, e caiu 31 % com a Fase 4** | 21 KB por abertura |
| Edge Functions | desprezível | 76 invocações no ciclo |

**Um único download de PDF equivale a ~280 aberturas de Portal.** É a razão de ordem de
grandeza que orienta onde vale otimizar.

---

## 6. Impacto da Fase 4 — registrado separadamente

**A Fase 4 reduz consumo FUTURO de leitura do Portal. Não desfaz nada já contabilizado.**

| | |
|---|---|
| O que ela mudou | payload do Portal **−31 %**; leitura no Postgres **534,7 KB → ~21 KB** por abertura |
| O que ela **não** mudou | o estoque de Storage (99,5 % PDF) e o egress de download de PDF |
| Efeito na quota atual | **nenhum retroativo** — o ciclo anterior já fechou |

Não misturo as duas coisas: a economia da Fase 4 é arquitetural e aparece no consumo dos
próximos ciclos, sobretudo quando o parque crescer.

---

## 7. As 8 respostas

**1. Qual quota está causando `EXCEEDING USAGE LIMITS`?**
**Nenhuma, hoje.** O badge era do ciclo 20/jul→20/ago, que fechou ontem, e já sumiu do
Dashboard. No ciclo atual a maior métrica está em 33 %.

**2. O sistema corre risco imediato de indisponibilidade?**
**Não.** Todas as métricas ≤ 33 %, todos os overages em 0, projeto `Healthy`, banco com CPU 2 %,
disco 19 %, RAM 54 %, 9/60 conexões. Nenhuma restrição ativa.

**3. Quando a quota reinicia?**
As métricas de **fluxo** já reiniciaram — **hoje, 20/08**. Próximo reset: **20/09/2026**.
As de **estoque** (Storage, Database) **não reiniciam nunca**.

**4. Esperar o reset é suficiente?**
**Para o fluxo, sim — e já aconteceu.** Para o **estoque, não**: Storage em 33 % não cai
sozinho, só cresce a cada relatório emitido.

**5. Precisamos reduzir consumo imediatamente?**
**Não.** Não há urgência. O que existe é uma **tendência** a acompanhar: cada relatório emitido
soma ~6 MB permanentes ao Storage.

**6. Precisamos migrar de plano?**
**Não agora.** Com 33 % do Storage e 3 % do egress, o Free comporta. A conta muda quando o
Storage se aproximar de 1 GB — o que, ao ritmo de ~6 MB por relatório, significa da ordem de
**110 relatórios adicionais** a partir do estoque atual, sem nenhuma otimização.

**7. Qual é o maior consumidor?**
**O PDF de relatório.** 99,5 % do estoque medido; 83 % no bucket inteiro em 16/08. Média de
5,9–6,6 MB por arquivo, porque **cada folha A4 é uma imagem JPEG** (achado A-04).

**8. Quais ações técnicas teriam maior impacto?**

| Ação | Impacto | Onde já está previsto |
|---|---|---|
| **PDF vetorial/híbrido** | **o maior de todos** — ataca 99,5 % do estoque e o egress de download; uma ordem de grandeza por arquivo | **Fases 11 e 12** |
| Thumbnails de foto | baixo para o estoque, relevante para egress de listagem | Fase 5 |
| Inventário e retenção de órfãos | desconhecido — **ninguém sabe quanto do bucket é lixo** | Fases 10A/10B |
| Tirar o base64 do `app_storage` | reduz banco (81 % do conteúdo era base64 em 16/08) | Fases 6 e 7 |

**O roadmap já está ordenado na direção certa.** Nada aqui pede mudança de prioridade.

---

## 8. O que NÃO foi feito

Conforme instruído: nenhuma alteração de plano, nenhuma compra, nenhuma exclusão de dado,
nenhuma limpeza. Só leitura.

## 9. Reprodução

1. Dashboard → organização → **Usage** → filtro **All projects** (o filtro por projeto mostra
   números que **não** são os da quota — o próprio Dashboard avisa isso).
2. Conferir o período no canto superior direito: a quota é por **ciclo de faturamento**.
3. Estoque do bucket: `POST /storage/v1/object/list/inspecao` com `prefix = <org_id>/<pasta>/`,
   somando `metadata.size`. Read-only.
