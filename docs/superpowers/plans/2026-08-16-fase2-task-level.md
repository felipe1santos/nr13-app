# Fase 2 — Observabilidade · task level

**Plano macro:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (seção FASE 2)
**Achado:** A-11 · habilita a medição de A-06, A-10 e A-13
**Data:** 16/08/2026

---

## Estado atual da fase

- **Fase:** 2 — Observabilidade (achado A-11)
- **Estado:** **VALIDADO EM PRODUÇÃO** (16/08/2026), com **1 item de documentação em aberto**
- **Commits:** `f1bab47` (contagem por `nr13_rel_`) · `2a03b57` (métricas de storage e ranking) ·
  `8fad49e` (baseline confirmado no painel)
- **Push main:** SIM · **Redeploy:** SIM (frontend) · **SQL aplicado:** `admin_stats.sql` e
  `admin_storage_stats.sql`
- **Validação local:** SIM · **Validação produção:** SIM — tabela "Verificações feitas hoje" em
  `docs/medicoes/2026-08-16-baseline-inicial.md` (contagem 13 = 13; união não dobra; guarda de
  admin recusando mestre comum com `ERROR P0001`; bucket 110,4 MB × painel; org vazia devolve zeros)
- **Baseline gravado:** SIM — `docs/medicoes/2026-08-16-baseline-inicial.md`
- **Portão:** a Fase 2 não tem portão próprio no plano macro
- **Próxima ação exata:** acrescentar `supabase/admin_storage_stats.sql` à nota de deploy manual
  (Bloco 4, Passo 5 — único item aberto)
- **Última atualização:** 19/08/2026 21:58

> **Checkboxes marcados em 19/08/2026** contra os arquivos SQL, `src/pages/adminMetricas.ts` +
> `adminMetricas.test.ts` e o documento de baseline. O Passo 5 do Bloco 4 foi conferido e
> **continua aberto**.

---

## O defeito, em uma linha

O Painel Admin conta relatórios por `nr13_historico_relatorios` — a chave que desde
14/08/2026 **só encolhe** (§7-sexies). Organização migrada reporta número congelado;
conta criada depois da migração reporta **zero**. O painel mente hoje.

## Objetivo da fase

1. Corrigir a contagem de relatórios, **sem contar em dobro** durante a convivência
   legado + novo.
2. Instalar as métricas que faltam para que as fases seguintes tenham "antes/depois" de
   verdade, e não estimativa: bytes por organização, peso do bucket, quanto de base64
   ainda vive no `app_storage`, quanto pesa o legado.
3. Gravar o **snapshot inicial** — o marco zero contra o qual tudo será comparado.

## O que NÃO será mexido

Nenhum caminho de dado do usuário. Nenhuma policy de `app_storage` ou do bucket. Nenhuma
escrita nova. As funções seguem `security definer` com guarda `role = 'admin'` — e a
guarda é **reverificada**, nunca afrouxada.

---

## Decisões desta fase

### D2-01 — Contagem de relatórios por UNIÃO DE IDS, não por soma

O modelo novo grava `nr13_rel_<id>_<TAG>`; a migração (`migrarHistoricoEmSegundoPlano`)
é idempotente e **não apaga o legado** — ele é o backup e o fallback de quem ainda não
rodou o código novo. Logo, durante a convivência, o MESMO relatório existe nos dois
lugares. Somar contaria em dobro exatamente nas contas mais ativas.

A união funciona porque o id é recuperável dos dois lados:

| Fonte | Como extrair o id |
|---|---|
| Chave nova | `nr13_rel_<id>_<TAG>` → `split_part(chave, '_', 3)` (o id nunca tem `_`: `idSeguro()` troca por `-`) |
| Array legado | `jsonb_array_elements(valor) ->> 'id'`, com o mesmo `replace('_','-')` de `idSeguro` |

`count(distinct id)` sobre a união dos dois. Exato, sem dobra, e não depende de a
migração ter rodado.

Coluna extra `relatorios_legado`: quantos ids existem **só** no legado. É o termômetro da
Fase 10B — quando chegar a zero em todas as organizações, o legado pode ser apagado.

### D2-02 — `octet_length`, não `pg_column_size`

O plano macro sugeriu `pg_column_size`. Ele devolve o tamanho do datum **como armazenado**,
já com compressão TOAST — bom para prever disco, errado para prever egress. O que estoura
a cota do Supabase é o byte que sai pela rede, e esse é o valor descomprimido.

Fica `sum(octet_length(valor))` como `bytes`, e o motivo vai comentado no SQL para
ninguém "corrigir" depois.

### D2-03 — Base64 medido por marcador, e o número é um PISO

`count(*) filter (where valor like '%base64,%')` e a soma de bytes dessas linhas. É
heurística: casa `data:image/...;base64,` e `pdfBase64`, que são as duas formas reais no
sistema. Não tenta interpretar o JSON campo a campo — seria mais preciso e muito mais
frágil, porque cada família tem um formato.

O número entra no snapshot **rotulado como piso**, não como total. Serve para dimensionar
a Fase 6; não serve para dizer "acabou".

### D2-04 — Sem tabela de série temporal nesta fase

`metricas_diarias` era opcional no plano. Fica de fora: é escrita nova, exige agendador, e
o que a fase precisa entregar é a FOTO inicial — que o snapshot em `docs/medicoes/`
resolve sem criar caminho de escrita nenhum. Registrado como possível Fase 2.1 quando
houver frota para justificar.

### D2-05 — Frota: opção (b) do plano, com o rótulo honesto

Nada de telemetria nova. O Admin passa a mostrar `profiles.ultima_sync`, que já existe,
**rotulada como "última sincronização do usuário"** — nunca "do aparelho". A coluna é por
perfil e é sobrescrita por qualquer dispositivo daquele usuário (D-25): quem tem celular e
desktop vê o mais recente dos dois, e um aparelho parado com trabalho dentro fica
invisível nessa coluna. Prometer visão por dispositivo aqui seria repetir, no painel, o
tipo de mentira que esta fase existe para corrigir.

### D2-06 — `admin_storage_stats()` lê metadados, nunca conteúdo

`storage.objects` guarda nome, tamanho e data. A função agrega por organização (primeira
pasta do path) e por pasta lógica. Nenhuma coluna devolve conteúdo de arquivo, nome de
equipamento ou qualquer dado de negócio — só contagem e bytes.

Duas armadilhas conhecidas, tratadas no SQL:
- `search_path` precisa incluir `storage`, senão a função não enxerga a tabela;
- `metadata->>'size'` pode ser nulo em objeto recém-criado; `coalesce(...,0)`.

### D2-07 — Compatibilidade de assinatura

As colunas novas de `admin_usage_stats()` entram **no fim** do `returns table`. O
`Admin.tsx` em produção durante o deploy continua lendo as antigas por nome. Reordenar
quebraria a tela entre o `apply` do SQL e o redeploy do front.

---

## Arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Substituir | `supabase/admin_stats.sql` | `admin_usage_stats()` corrigida e ampliada |
| Criar | `supabase/admin_storage_stats.sql` | `admin_storage_stats()` — bucket por organização |
| Criar | `supabase/admin_stats_rollback.sql` | volta à versão de hoje; remove a função nova |
| Modificar | `src/pages/Admin.tsx` | colunas novas + seção "Crescimento e armazenamento" |
| Criar | `src/pages/adminMetricas.ts` | tipos + formatação de bytes (função pura, testável) |
| Criar | `src/pages/adminMetricas.test.ts` | formatação + contrato de colunas TS ↔ SQL |
| Criar | `docs/medicoes/2026-08-16-baseline-inicial.md` | o marco zero |

---

## Tarefas

### Tarefa 1 — `admin_usage_stats()` com a contagem certa

**Arquivo:** `supabase/admin_stats.sql` (substitui)

Colunas mantidas, na ordem de hoje: `escopo`, `equip_vaso`, `equip_caldeira`,
`equip_autoclave`, `inspecoes`, `relatorios`, `pdf_gerados`, `impressoes`, `subusuarios`.

Acrescentadas ao fim:

| Coluna | Conteúdo |
|---|---|
| `relatorios_legado` | ids presentes só em `nr13_historico_relatorios` (termômetro da Fase 10B) |
| `bytes_total` | `sum(octet_length(valor))` da organização |
| `bytes_legado` | bytes de `nr13_historico_relatorios` (dimensiona a Fase 10A) |
| `chaves_total` | nº de chaves |
| `chaves_base64` | chaves com `base64,` no valor (piso — D2-03) |
| `bytes_base64` | bytes dessas chaves (dimensiona a Fase 6) |
| `ultima_sync` | de `profiles`, do MESTRE da org (D2-05) |

- [x] Passo 1: escrever o SQL com a união de ids (D2-01) e os comentários das decisões.
- [x] Passo 2: rodar no SQL Editor (é `create or replace` — idempotente).
- [x] Passo 3: conferir contagem contra uma organização de contagem conhecida.
- [x] Passo 4: conferir que a soma NÃO dobra numa org que tem legado e novo.

### Tarefa 2 — `admin_storage_stats()`

**Arquivo:** `supabase/admin_storage_stats.sql` (novo)

Por organização: `arquivos`, `bytes`, `bytes_relatorios`, `bytes_assinaturas`,
`bytes_certificados`, `bytes_fotos`, `bytes_outros`, `pdfs`, `pdf_bytes_medio`,
`fotos`, `foto_bytes_medio`.

Mesma guarda de admin. `set search_path = public, storage`.

- [x] Passo 1: escrever o SQL.
- [x] Passo 2: rodar e comparar o total com o painel de Storage do Supabase (tolerância de arredondamento).
- [x] Passo 3: confirmar que bucket vazio devolve zero, sem erro.

### Tarefa 3 — Guarda de admin, verificada

- [x] Passo 1: teste estático (`adminMetricas.test.ts`) — o corpo das DUAS funções contém o bloco de guarda antes de qualquer `return query`.
- [x] Passo 2: teste manual em produção — logar como `mestre` comum e chamar as duas RPCs; ambas precisam falhar com `acesso negado`.

### Tarefa 4 — Admin.tsx

- [x] Passo 1: `adminMetricas.ts` com a interface `UsoStats` ampliada, `StorageStats`, e `fmtBytes()` pura.
- [x] Passo 2: teste de `fmtBytes` e do contrato de colunas contra o `.sql`.
- [x] Passo 3: colunas novas na tabela (bytes da org, última sync do usuário).
- [x] Passo 4: seção "Crescimento e armazenamento" — ranking por consumo, base64 restante, peso do legado.
- [ ] Passo 5: nota de deploy atualizada (a de hoje cita só `admin_stats.sql`).
      **Status: NÃO FEITO — verificado em 19/08/2026.** `grep -rn admin_storage_stats PENDENCIAS.md CLAUDE.md docs/` não devolve nada. A função ESTÁ aplicada em produção (o baseline foi colhido com ela), mas quem reconstruir o banco a partir da documentação não vai saber rodar `supabase/admin_storage_stats.sql`.

### Tarefa 5 — Snapshot inicial

- [x] Passo 1: rodar as duas funções em produção e salvar a saída bruta.
- [x] Passo 2: escrever `docs/medicoes/2026-08-16-baseline-inicial.md` com data, org por org (anonimizadas por prefixo de uuid), totais e o que cada número dimensiona.

---

## Critério de aceite

- [x] Contagem de relatórios bate com a contagem manual em organização de teste.
- [x] Nenhuma organização contada em dobro na convivência legado + novo.
- [x] Não-admin recusado nas duas funções (verificado em produção, não só por leitura de código).
- [x] Snapshot inicial salvo em `docs/medicoes/`.
- [x] Suíte verde, build limpo.

## Rollback

`supabase/admin_stats_rollback.sql`: `create or replace` da versão de hoje +
`drop function admin_storage_stats()`. Imediato, não toca em dado. O front tolera as
colunas sumindo (lê por nome, com `?? '—'`).

## Risco

**Baixo.** Leitura pura, atrás de guarda de admin, sem alteração de policy nem de dado.
O risco real é de MEDIÇÃO: um número errado no painel orienta as fases seguintes na
direção errada. Por isso a contagem é conferida contra contagem manual antes do aceite.
