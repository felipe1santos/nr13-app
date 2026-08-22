# Fase 8 · Laboratório Supabase local + F8.1 (dívida do índice da Fase 1)

**22/08/2026** · somente leitura em produção · **nenhuma massa em produção** · **nada em `src/` alterado**

No laboratório local: degrau **100 estrutural gerado, medido e removido com prova**.

---

## O que esta sessão fez

1. Levantou o laboratório Supabase local (Docker recém-instalado pelo dono).
2. Descobriu que **a tabela base do sistema não estava no repositório**, e recuperou o schema
   real de produção por consulta somente leitura.
3. Aplicou as **migrations reais** do repo, na ordem corrigida por dependência.
4. Provou o laboratório por teste funcional, não só por nomes de objeto iguais.
5. Rodou o **F8.1** e fechou a dívida do índice da Fase 1.
6. Rodou o **degrau 100 estrutural** local — gerar, medir, registrar, limpar, provar.
7. Encontrou um **defeito de método**: laboratório de uma organização só não mede índice de leitura (§9).

---

## 1 · Ambiente

| | Local | Produção |
|---|---|---|
| Postgres | **17.6** (x86_64) | **17.6** (aarch64) |
| Docker | 29.7.2 · 12 CPU · VM WSL2 com **3,9 GB** | — |
| Supabase CLI | 2.115.0 (`npx`) | — |
| Contêineres | 12; `supabase_vector` reinicia (coletor de log do Docker, sem acesso ao socket — **não toca banco, API nem Storage**) | — |
| RAM do laboratório | ~1,9 GB dos 3,6 GB da VM | — |
| Portas | API 54321 · DB 54322 · Studio 54323 · Mailpit 54324 | — |

A versão do Postgres bateu **exata**, o que era a divergência mais cara possível: `EXPLAIN`
local e de produção passam a ser comparáveis plano a plano.

---

## 2 · 🔴 A tabela base do sistema não estava versionada

`public.app_storage` é o "banco" inteiro do sistema — toda chave do §2 do CLAUDE.md mora nela.
**Não havia `CREATE TABLE` em lugar nenhum do repositório.** Os 16 arquivos `.sql` que a citam
apenas a ALTERAM.

Isso nunca doeu porque em produção a tabela já estava lá desde antes do versionamento. Doeu na
primeira vez que alguém tentou reconstruir o sistema do zero — que é exatamente o que um
laboratório é.

**Recuperado de produção, não deduzido** (`information_schema.columns`, `pg_constraint`,
`pg_index`, `pg_get_functiondef`, `pg_get_triggerdef` — projeto `qqsesrntfvmdxqxrfvmw`):

| Coluna | Tipo | Nulo | Padrão | Vem de |
|---|---|---|---|---|
| `user_id` | uuid | NÃO | — | **base (era desconhecido)** |
| `chave` | text | NÃO | — | **base (era desconhecido)** |
| `valor` | **text** | sim | — | **base (era desconhecido)** |
| `atualizado_em` | timestamptz | NÃO | `now()` | **base (era desconhecido)** |
| `org_id` | uuid | sim | — | `acesso_setup.sql:30` |
| `versao` | integer | NÃO | `1` | `armazenamento_v2.sql:21` |
| `dispositivo` | text | sim | — | `armazenamento_v2.sql:22` |
| `deletado_em` | timestamptz | sim | — | `armazenamento_v2.sql:23` |
| `mutado_em_cliente` | timestamptz | sim | — | `armazenamento_v2.sql:28` |

- PK = **`(user_id, chave)`**. **Não existe coluna `id`.**
- FK `user_id → auth.users(id) ON DELETE CASCADE`.
- Trigger `app_storage_touch` BEFORE UPDATE → `public.touch_atualizado_em()`, que faz
  `new.atualizado_em = now()`. **Também estava fora do repositório**, e é ele que mantém
  honesta a marca de sync da v2 (`storageV2.ts:409`).

> **Por que eu me recusei a chutar `valor`.** `text` × `jsonb` muda TOAST, compressão e
> tamanho de linha. A Fase 8 mede exatamente isso. Um palpite aqui produziria número errado
> com cara de número certo — pior do que não medir. Confirmado: é `text`.

Gravado em **`supabase/app_storage_base.sql`**, com a procedência escrita no cabeçalho.

`app_storage_org_chave_uidx (org_id, chave)` **não** estava faltando — está em
`acesso_setup.sql:97`. A primeira varredura não o viu porque procurava `create index` e ele é
`create unique index`.

---

## 3 · Ordem de aplicação — a do plano estava errada

`armazenamento_v2.sql` chama `acesso_vigente`, `assinatura_permite_escrita`, `org_atual` e
`papel_atual`, que nascem em outros três arquivos. Ordem real, **13 passos, 13 OK, 0 falhas**:

| # | Arquivo | Cria |
|---|---|---|
| 0 | `app_storage_base.sql` | a tabela base + `touch_atualizado_em` + `app_storage_user_idx` |
| 1 | `admin_setup.sql` | `profiles`, `login_events`, `is_admin`, `handle_new_user` |
| 2 | `acesso_setup.sql` | `org_atual`, `papel_atual`, RLS, `org_id`, `org_chave_uidx`, `org_idx` |
| 3 | `trial_setup.sql` | `acesso_vigente`, `config_global` |
| 4 | `assinatura_setup.sql` | `assinatura_permite_escrita`, `assinatura_org`, `kiwify_eventos` |
| 5 | `armazenamento_v2.sql` | `aplicar_mutacao_storage`, `org_sync`, tombstones, bucket `inspecao` |
| 6 | `fotos_storage.sql` | políticas de `storage.objects` |
| 7 | `indice_hidratacao.sql` | `app_storage_org_atualizado_idx` — o índice da dívida da Fase 1 |
| 8 | `portal_policies.sql` | leitura do Portal |
| 9 | `livro_imutavel.sql` | `trg_guardar_livro_imutavel` |
| 10 | `v2_por_default.sql` | `trg_garantir_org_sync` |
| 11 | `perfil_origem.sql` | redefine `handle_new_user` |
| 12 | `grants_postgrest.sql` | permissões de tabela (ver §4) |

Depois, fora do caminho crítico e também aplicados sem falha: `leads_setup`, `purga_trial`,
`admin_stats`, `admin_storage_stats`, `trial_emails_setup`.

---

## 4 · Segunda divergência: os GRANTs de tabela

Nenhum `.sql` do repositório concede permissão de **tabela** — só de função. Em produção isso
nunca fez falta, porque o Supabase daquela época dava `select/insert/update/delete` a `anon`,
`authenticated` e `service_role` por privilégio padrão do schema `public`.

**O CLI 2.115.0 não faz mais isso.** No laboratório as tabelas nasceram só com
`REFERENCES, TRIGGER, TRUNCATE`, e o defeito apareceu no teste funcional: a escrita direta como
`authenticated` foi recusada com `permission denied for table app_storage` **em vez de**
`nr13_escrita_direta_bloqueada`.

Isso não é arrumação: a RLS só é avaliada **depois** do GRANT. Um laboratório que barra a
escrita antes da guarda estaria medindo outro sistema.

Medido em produção (`information_schema.role_table_grants`): `anon`, `authenticated`,
`postgres` e `service_role` têm **DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE,
UPDATE**. Reproduzido em `supabase/grants_postgrest.sql`; conferido idêntico depois.

---

## 5 · Paridade local × produção

| Item | Resultado |
|---|---|
| Colunas de `app_storage` | **9 = 9**, mesma ordem, tipos, nulidade e defaults ✅ |
| Índices de `app_storage` | **6 = 6**, mesmos nomes ✅ |
| Triggers em `public` | **7 = 7**, mesmos nomes ✅ |
| Extensões | **7 = 7** (`pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`) ✅ |
| GRANTs de `app_storage` | idênticos depois do §4 ✅ |
| Bucket | `inspecao` nos dois ✅ |
| RLS em `app_storage` | ligada nos dois ✅ |
| Tabelas | local 9 · produção 11 — **ver abaixo** |

**Diferenças declaradas, não escondidas:**

| Divergência | Efeito na Fase 8 |
|---|---|
| `app_storage_bkp_20260805` só existe em produção — backup da migração v2 de 05/08 | nenhum; não é schema do app |
| `gate_resultados` só existe em produção — resíduo dos testes de gate | nenhum |
| **Latência de rede**: loopback local × rede real | boot, hidratação e sync locais **não medem latência**. Ela só sai dos degraus 100/500 em produção |
| **Egress**: não existe local | egress fica `PROJETADO`, nunca `MEDIDO`, no laboratório |
| **Storage**: MinIO local × S3 | tamanho é fiel; throughput não |
| Arquitetura: x86_64 local × aarch64 produção | mesma major.minor do Postgres; custos de plano comparáveis, tempos absolutos não |

---

## 6 · O laboratório foi provado por comportamento, não por nomes

Nome de objeto igual não prova sistema igual. Teste funcional com usuário autenticado simulado
(`request.jwt.claims`), dentro de transação:

| Cenário | Esperado | Obtido |
|---|---|---|
| `org_atual` / `papel_atual` / `acesso_vigente` / `assinatura_permite_escrita` | org, `mestre`, `t`, `t` | ✅ igual |
| `org_sync` criada pelo trigger de `v2_por_default` | `v2_ativa = true` | ✅ |
| Escrita **direta** em `app_storage` | recusada pela guarda | ✅ `nr13_escrita_direta_bloqueada: ... grave por aplicar_mutacao_storage` |
| RPC `set`, versão esperada 0 | aplicado, versão 1 | ✅ `{"status":"aplicado","versao":1}` |
| RPC `set` de novo com versão esperada 0 | **conflito**, devolvendo a linha vigente | ✅ devolveu valor, versão, dispositivo e `atualizado_em` |
| RPC `del` | aplicado, versão 2 + tombstone | ✅ tombstone com `versao_final = 2` |
| Repetir o mesmo `mutation_id` | `repetido`, sem reaplicar | ✅ `{"status":"repetido","versao":1}` |

Dado de teste removido em seguida: `app_storage`, `app_storage_excluidos` e
`app_storage_mutacoes` de volta a **0 linhas**.

---

## 7 · F8.1 — retrato de produção e a dívida do índice da Fase 1

Somente leitura, no SQL Editor.

### Contexto — sem isto, `idx_scan` é número sem denominador

| | |
|---|---|
| Estatísticas zeradas em | 2026-05-22 15:13:20 |
| **Janela de coleta** | **92 dias** |
| Uptime do servidor | 60 dias |
| Último autovacuum · autoanalyze | 2026-08-20 16:11 · 2026-08-20 21:10 |

### Tabela

| | |
|---|---|
| Linhas | **864** (722 vivas, 142 tombstones) |
| Organizações com dado | **10** |
| Heap | 472 kB |
| Índices | 592 kB |
| Conteúdo (`sum(length(valor))`) | 3.586 kB |
| **Total com TOAST** | **33 MB** |

> **Achado lateral:** heap + índices = ~1 MB, conteúdo vivo = 3,5 MB, mas o total é 33 MB.
> Sobra ~29 MB de TOAST que não corresponde a conteúdo vivo. É bloat de TOAST — resíduo das
> 8.935 atualizações sobre valores grandes. Não é problema da Fase 8; fica **registrado**.

### Escrita — o que decide o custo de manter um índice a mais

| | |
|---|---|
| Inseridas | 1.573 |
| Atualizadas | 8.935 |
| **Atualizadas HOT** | **7.834 — 87,7 %** |
| Removidas | 706 |

**HOT update não toca índice nenhum.** 87,7 % das atualizações desta tabela são HOT, então o
custo de escrita de um B-tree extra incide sobre 12,3 % delas — 1.101 atualizações em 92 dias.

### Uso de cada índice — 92 dias

| Índice | `idx_scan` | `idx_tup_read` | `idx_tup_fetch` | Tamanho |
|---|---:|---:|---:|---:|
| `app_storage_org_chave_uidx` | **14.260** | 154.673 | 25.032 | 120 kB |
| `app_storage_deletado_idx` | 1.594 | 183.269 | 10.874 | 40 kB |
| `app_storage_pkey` | 799 | 1.192 | 1.174 | 120 kB |
| **`app_storage_org_atualizado_idx`** | **780** | 10.495 | 4.325 | **112 kB** |
| `app_storage_user_idx` | 616 | 11.517 | 8.512 | 16 kB |
| `app_storage_org_idx` | **38** | 13.978 | 15 | 112 kB |

### Planos

| Bloco | Cenário | Plano | Buffers | Execução |
|---|---|---|---:|---:|
| 2 | "nada mudou", org resolvida por subconsulta | Limit + InitPlan | 261 (129 só do InitPlan) | 1,36 ms |
| **3** | **"nada mudou", org literal — o caminho REAL do app** | **Index Scan using `app_storage_org_atualizado_idx`** | **6** | **0,185 ms** |
| 4 | "primeiro boot", org literal | Bitmap Index Scan on `app_storage_deletado_idx` → Bitmap Heap → Sort (quicksort 68 kB) | 48 | 1,343 ms |

O bloco 2 não representa o app: os 129 buffers extras são do `InitPlan` que resolve qual é a
maior organização, coisa que o cliente já sabe. O bloco 3 é o caminho real.

Planejamento custa 1,1 ms nos dois casos, mais que a execução — normal em tabela pequena, e um
lembrete de que **nesta escala nada disso é gargalo**.

---

## 8 · Classificação dos achados

> ⚠️ **A escala A/B/C/D não está definida em nenhum documento do projeto.** Estou aplicando a
> definição abaixo por ser a leitura natural do plano; **confirme se é o que você quis dizer**
> antes de eu classificar o resto da Fase 8 com ela.
>
> **A** = age agora · **B** = age numa fase já planejada · **C** = observar, sem ação ·
> **D** = descartado, não é problema

| # | Achado | Classe | Por quê |
|---|---|---|---|
| 1 | **`public.app_storage` não versionada** (tabela, trigger e função base) | **A** | O sistema não era reconstruível a partir do repositório. Já resolvido nesta sessão: `app_storage_base.sql`. Falta só o dono decidir se aplica em produção — lá é **no-op**, tudo já existe |
| 2 | **GRANTs de tabela não versionados** | **A** | Mesmo motivo. Resolvido: `grants_postgrest.sql`. Em produção é no-op |
| 3 | **Dívida da Fase 1: `app_storage_org_atualizado_idx` se paga?** | **D** | **Sim, e a dívida fecha.** 780 varreduras em 92 dias; é o índice escolhido pelo caminho de hidratação real (bloco 3), que custa **6 buffers e 0,185 ms**. O custo de escrita incide sobre 12,3 % das atualizações (87,7 % são HOT). 112 kB. **Manter.** |
| 4 | A regressão de primeiro boot da Fase 1 (65 → 236 buffers) | **D** | **Não reproduz.** Hoje o primeiro boot custa **48 buffers** e nem usa esse índice — o planner escolhe `app_storage_deletado_idx`. A medição da Fase 1 foi feita em outro estado de dados/estatísticas |
| 5 | **`app_storage_org_idx (org_id, chave)` é redundante** | **B** | Mesmas colunas do `app_storage_org_chave_uidx`, que é único. 38 varreduras contra 14.260. Ocupa 112 kB e é mantido em toda escrita não-HOT. Candidato a remoção — **mas a Fase 8 mede, não corrige** (R7). Decidir com a massa de 5.000 na mão |
| 6 | **~29 MB de TOAST sem conteúdo vivo correspondente** | **C** | Bloat de 8.935 atualizações sobre valores grandes. Some com `VACUUM FULL`, que trava a tabela. Observar; a Fase 2 (fotos no bucket) reduz a origem |
| 7 | `app_storage_bkp_20260805` e `gate_resultados` em produção, fora do repo | **C** | Resíduos operacionais, não schema do app. Vale decidir quando descartar o backup de 05/08 |
| 8 | **"Grace period is over"** no topo do Dashboard | **A** | Aviso de cota/faturamento visto em 22/08. Não é Fase 8, mas é o mesmo tema do risco de cota já registrado. **Precisa da sua atenção**, e é mais um motivo para não gerar massa em produção agora |

---

## 9 · Degrau 100 estrutural — local · seed 1

```
node scripts/massa-escala/gerar.mjs --org 6721e0d7-... --perfil estrutural \
  --equipamentos 100 --seed 1 --relatorios-por-equipamento 2 --confirmar-org-de-teste
```

Escrito pela **mesma porta do app** — login `authenticated` + `aplicar_mutacao_storage`,
nunca `service_role`.

### Geração

| | Planejado (`--dry-run`) | **Real** |
|---|---|---|
| Chaves | 1.100 | **1.100**, 0 falhas |
| Conteúdo | 0,81 MB | **830 kB** |
| Arquivos no bucket | 402 · 4,61 MB | **402 · 4,61 MB** |
| Desvio de tamanho do PDF | ±10 % tolerado | **0,00 %** |
| Tempo | — | **27,2 s** (~40 chaves/s pela RPC, em loopback) |

O `--dry-run` bateu com o real em tudo. Manifesto: `massa-f8-estrutural-1-100.json`.

### Peso no banco

| | |
|---|---|
| Heap | 800 kB |
| Índices | 472 kB |
| **Total** | **1.304 kB** |
| Conteúdo (`sum(length(valor))`) | 830 kB |

Índices custam **59 % do heap** nesta escala. Tamanho de cada um: `pkey` 112 kB ·
`org_idx` 112 kB · `org_chave_uidx` 112 kB · `org_atualizado_idx` 104 kB · `user_idx` 16 kB ·
`deletado_idx` 16 kB.

### Por família — o que realmente pesa

| Família | Chaves | Conteúdo |
|---|---:|---:|
| `nr13_historico_indice_` | 100 | **130 kB** |
| `nr13_rel_<id>_` | 200 | ~**492 kB** (2.478–2.484 B cada) |
| `nr13_calc_` | 100 | 49 kB |
| `nr13_fotos_` | 100 | 38 kB |
| `nr13_emp_` | 100 | 37 kB |
| `nr13_info_` | 100 | 33 kB |
| `nr13_vida_` | 100 | 29 kB |
| `nr13_docs_` | 100 | 15 kB |
| `nr13_cat_` | 100 | 14 kB |
| `nr13_pref_unidade_` | 100 | 400 B |

Os relatórios são **59 % do conteúdo** já em 100 equipamentos com 2 relatórios cada — e é a
família que cresce sem teto ao longo da vida da conta. Confirma a leitura do §7-sexies.

### ⚠️ ACHADO METODOLÓGICO — o laboratório de uma org só não mede índice de leitura

| Cenário | Buffers (mediana de 3) | Execução (mediana) | Plano |
|---|---:|---:|---|
| Primeiro boot · **com** índice | 106 | 1,27 ms | **Seq Scan** |
| Primeiro boot · **sem** índice | 106 | 3,10 ms | Seq Scan |
| "Nada mudou" · **com** índice | **109** | 0,86 ms | Seq Scan + subconsulta |
| "Nada mudou" · **sem** índice | **206** | 0,65 ms | Seq Scan + subconsulta |

**O planner escolheu `Seq Scan` em todos os casos** — e em produção, a mesma consulta escolhe
`Index Scan using app_storage_org_atualizado_idx`.

A causa é seletividade, não escala: **100 % das linhas do laboratório pertencem à org alvo**,
contra **11,5 %** da org de teste em produção (99 de 864). Com o filtro `org_id` casando tudo,
varrer a tabela inteira é a decisão CORRETA do planner — e nenhum índice sobre `org_id` ajuda.

> **Consequência que precisa ficar escrita:** enquanto o laboratório tiver uma organização só,
> os degraus 500, 1.000 e 5.000 vão medir bem **peso de dado, DOM, listas, IndexedDB e custo de
> escrita** — mas **não** medem escolha de plano nem eficácia de índice de leitura. Subir a
> escala não conserta: 5.000 equipamentos de uma org só continuam sendo 100 % da tabela.
>
> **Correção proposta (precisa da sua decisão):** criar 2–3 organizações de ruído no laboratório
> e distribuir a massa, deixando a org alvo em ~10–40 % das linhas, que é a faixa real de
> produção. Custa uma rodada a mais por degrau e faz o plano local voltar a bater com o de
> produção.

O único efeito de índice que sobreviveu à baixa seletividade é real e vale registrar: a
subconsulta `max(atualizado_em)` da marca de sync custa **206 buffers sem o índice e 109 com**
ele. O índice **corta pela metade** o custo de descobrir "mudou alguma coisa?", que é a pergunta
feita em **todo boot de todo aparelho**.

O índice foi **recriado** logo após o benchmark, e a recriação foi conferida.

### Limpeza — e a prova

```
node scripts/massa-escala/limpar.mjs --org 6721e0d7-... --seed 1            # ensaio
node scripts/massa-escala/limpar.mjs --org 6721e0d7-... --seed 1 --confirmar
```

O ensaio sem `--confirmar` listou 1.100 alvos em 100 TAGs e não apagou nada. A limpeza real
removeu **1.100 chaves, 0 falhas, 402 arquivos**.

| Prova | Resultado |
|---|---|
| Linhas vivas com o prefixo da massa | **0** |
| Linhas vivas na org | **0** |
| Arquivos no bucket | **0** |
| Tombstones | **1.100** — é a PROVA da exclusão (§2-ter), não sobra |

**Nota para os próximos degraus:** depois da limpeza o heap continuou em 800 kB e os índices
subiram para 760 kB — bloat do ciclo de escrita+exclusão. **`VACUUM` entre degraus**, senão o
peso de um degrau contamina a medição do seguinte.

---

## 10 · O que NÃO foi feito

- **Nenhuma massa em produção.** No laboratório local, o degrau 100 foi gerado, medido e removido com prova.
- **Nenhuma escrita em produção.** Só `select` e `explain (analyze)` sobre `select`.
- **Nada em `src/`** alterado.
- Degraus 500 / 1.000 / 5.000: **não iniciados** — aguardam a decisão sobre as organizações de ruído (§9).
- Fase 9 e PDF vetorial: **não iniciados**.

---

## 11 · Como reproduzir

```bash
docker --version                       # 29.7.2
npx supabase start                     # 12 conteineres
# ordem do §3, um arquivo por vez:
docker exec -i supabase_db_nr13-app psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 \
  < supabase/app_storage_base.sql
# ... e assim por diante ate grants_postgrest.sql
```

Para derrubar: `npx supabase stop`. Para zerar: `npx supabase db reset` (o laboratório é
descartável — é o motivo de ele existir).
