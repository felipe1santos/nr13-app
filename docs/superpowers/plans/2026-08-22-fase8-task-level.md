# FASE 8 — Escala, dataset determinístico e medições · task-level

## Estado atual da fase

`🟡 EM IMPLEMENTAÇÃO — gerador, limpeza e testes prontos; estimativas recalibradas com bytes reais.`
**Nenhuma massa gerada, nem local nem em produção. Nenhuma linha de código de produção alterada.**
Bloqueado em dois pontos que dependem do dono: **Docker não existe nesta máquina** (laboratório
local) e **F8.1 precisa do SQL Editor**.

Autorizado em 22/08/2026: **somente planejamento + baseline + desenho do dataset + plano de
medição**. Sem otimização, sem Fase 9, sem PDF vetorial.

---

## Objetivo

Responder com número, não com opinião: **com a arquitetura de hoje, o que acontece quando o
volume de dados cresce?**

A fase entrega três coisas — um **gerador determinístico** de massa, um **roteiro de baseline
repetível**, e um **conjunto de medições** classificadas. Ela não melhora nenhum número: o
aceite é a existência e a repetibilidade da ferramenta, mais a baseline coletada.

O que esta fase **não** decide: virtualização, paginação, índices novos, mudança de sync,
limpeza de legado, PDF vetorial. Tudo isso depende da evidência que ela produz.

---

## AS-IS

### O que já existe e será reusado

| Peça | Onde | Papel na Fase 8 |
|---|---|---|
| `demoSeed.ts` | `src/services/demoSeed.ts` (221 linhas) | **Referência de formato.** Mostra o conjunto mínimo coerente de chaves por equipamento e que tudo entra pela API normal (`salvar` → RPC → RLS) |
| `backup-org.mjs` | `scripts/` | **Padrão dos scripts**: `.mjs`, `createClient` com **ANON**, login por variável de ambiente, **nunca `service_role`** |
| `migrar-fotos-legadas.mjs` | `scripts/` | Precedente de escrita em massa com confirmação antes de destruir |
| `testar-concorrencia-rpc.mts` | `scripts/` | Precedente de teste de RPC fora do bundle |

### Caminhos que a massa vai exercitar

| Caminho | Código | Custo por escala |
|---|---|---|
| Hidratação | `storageV2.lerTudo` — páginas de **1.000**, ordem composta `(atualizado_em, chave)`, corte por marca | 1 request por 1.000 chaves |
| Lista de equipamentos | `listarEquipamentos` → `listarChavesComPrefixo('nr13_info_')` → `montarResumo(tag)` | **5 `ler()` por equipamento** (`info`, `cat`, `calc`, `fotos`, `pref_unidade`) — 5.000 equipamentos = **25.000 leituras + JSON.parse** |
| Render da lista | `Equipamentos.tsx` — `filtrados.map(...)`, **sem virtualização** | 1 card por equipamento, com `<FotoImg variante="thumb">` |
| Vencimentos | `listarVencimentos()` → por equipamento: `ler(info)` + `ler(vida)` + `prazoPorRelatorio(tag)` → `listarIndice(tag)` | ~3 leituras + 1 índice por equipamento, **sem memoização** |
| Empresa do card | `empresaDe(tag)` → `ler(nr13_emp_<TAG>)` chamado **dentro de `useMemo` de filtros e no render** | leitura repetida por equipamento |
| PDF | `pdfService.gerarPdfBytes` — `html2canvas` `scale: 2` + JPEG 0.95, **1 canvas por folha, sequencial** | tempo e pico de memória crescem com o nº de folhas |
| IndexedDB | `nr13_dados_<org>` (stores `dados`, `fila`, `meta`, `tombstones`, `conflitos`) e `nr13_fotos` | 1 registro por chave |

### Retrato de hoje — organização de teste `99f642d3…` (medido 22/08/2026, read-only)

| | |
|---|---|
| Chaves no cache | **59** |
| Peso total | **604,7 KB** |
| Equipamentos | 4 |

Top famílias por peso:

| Família | Chaves | KB |
|---|---|---|
| `nr13_rel_` | 16 | **472,9** |
| `nr13_lista_phs` | 1 | 52,8 |
| `nr13_livro_` | 4 | 24,4 |
| `nr13_prontuario_` | 2 | 17,2 |
| `nr13_historico_relatorios` (legado) | 1 | 9,6 |
| `nr13_fotos_` | 4 | 7,9 |
| `nr13_historico_indice_` | 6 | 6,9 |

> A escala de 5.000 equipamentos é da ordem de **1.000× este retrato**. Nenhuma medição atual
> serve de baseline de escala — é exatamente o buraco que esta fase fecha.

### Números reais já medidos, que calibram o perfil realista

Nada aqui é inventado; cada linha vem de uma medição anterior.

| Parâmetro | Valor | Origem |
|---|---|---|
| PDF de relatório — média ponderada | **6,6 MB** (14 PDFs, 91 MB) | `2026-08-16-baseline-inicial.md` |
| PDF — amostra recente (15 e 13 folhas) | **4,97 MB** e **4,40 MB** | `2026-08-20-fase7b-validacao-producao.md` |
| Foto principal — média | **87,7 KB** | baseline inicial |
| Foto principal — 10 fotos de celular | 96,1–153,5 KB | Fase 5 |
| Miniatura | **~14,5 KB** (144,9 KB / 10) | Fase 5 |
| Registro de relatório com Ref | **2,46–2,50 KB** | Fase 7B |
| Registro de relatório legado (base64) | 9,5–98,4 KB | Fase 7B §7 |
| Índice do histórico | 0,34–3,4 KB | AS-IS |
| Storage do projeto | **0,331 GB de 1 GB** | auditoria de cota 20/08 |
| Database | **97 MB de 500 MB** | idem |
| Egress | 0,131 GB de 5 GB/mês | idem |

### A dívida herdada da Fase 1

`2026-08-16-fase1-explain.md` deixou **explicitamente** para esta fase:

> `[ ] Custo de escrita ≤ +10 % — **adiado para a Fase 8**, sem massa não é medível`

E deixou uma segunda verificação em aberto: `app_storage_org_atualizado_idx` tinha **3
`idx_scan`** logo após a criação — todos do próprio `EXPLAIN`. O texto pede conferir de novo
depois de dias de uso real; se não subiu, **o planner não escolhe o índice sob RLS e a Fase 1
precisa ser reaberta**. É a primeira coleta desta fase, custa uma query e não depende de massa.

---

## Dataset estrutural

**Para que serve:** DOM, listas, hidratação, IndexedDB, sync, filtros, busca, vencimentos,
histórico, CPU. Nada disso depende do tamanho do arquivo.

**Arquivos sintéticos mínimos:** JPEG de ~5 KB, miniatura de ~2 KB, PDF de ~20 KB.

### Chaves por equipamento (8) — espelham o `demoSeed`, sem o livro

| Chave | Bytes-alvo | Observação |
|---|---|---|
| `nr13_info_<TAG>` | ~250 | ficha |
| `nr13_emp_<TAG>` | ~340 | cliente vinculado |
| `nr13_cat_<TAG>` | ~300 | categoria de risco |
| `nr13_calc_<TAG>` | ~2.000 | memorial com `componentes[]` |
| `nr13_fotos_<TAG>` | ~450 | 1 foto com `ref` + `thumb` |
| `nr13_vida_<TAG>` | ~400 | alimenta vencimentos |
| `nr13_pref_unidade_<TAG>` | ~10 | lido por `montarResumo` |
| `nr13_docs_<TAG>` | ~600 | 1 container de inspeção |
| **Soma** | **≈ 4,4 KB** | |

Por relatório: `nr13_rel_<id>_<TAG>` (**~2,5 KB**, formato 7B com Ref) + entrada no
`nr13_historico_indice_<TAG>` (~0,35 KB).

> **`nr13_livro_` NUNCA é gerado.** O livro tem trava de imutabilidade no banco
> (§7-quinquies, `livro_imutavel.sql`): entrada sintética em livro seria irreversível. Trava 6
> do plano macro, e vira teste automatizado.

### Projeção de tamanho — antes de criar qualquer coisa

Fórmula: `eq × 4,4 KB + rel × 2,85 KB`, com **2 relatórios por equipamento**.

| Escala | Chaves | Conteúdo | Arquivos no bucket | Storage |
|---|---|---|---|---|
| 100 | ~1.000 | **1,0 MB** | 100 fotos + 100 thumbs + 200 PDFs | **~4,7 MB** |
| 500 | ~5.000 | **5,1 MB** | 500 + 500 + 1.000 | **~23,5 MB** |
| 1.000 | ~10.000 | **10,1 MB** | 1.000 + 1.000 + 2.000 | **~47 MB** |
| 5.000 | ~50.000 | **50,7 MB** | 5.000 + 5.000 + 10.000 | **~235 MB** |

**O degrau de 5.000 é o que exige decisão.** Em produção ele somaria ~235 MB aos 331 MB atuais
(**57 % do teto de 1 GB**) e, na tabela, 50 MB de conteúdo viram bem mais com overhead de
página e TOAST — contra 97 MB já usados de 500 MB. Ver "Onde a massa nasce".

---

## Dataset realista

**Para que serve:** Storage, egress, abertura de PDF, projeção de custo, fixture da D-19.

**Calibração 1 — rótulo `2026-08-atual`**, com os valores medidos acima:

| Parâmetro | Valor | Origem |
|---|---|---|
| `--kb-foto` | **88** | baseline inicial |
| `--kb-thumb` | **14,5** | Fase 5 |
| `--kb-pdf` | **6.600** | baseline inicial (média ponderada) |
| `--fotos-por-inspecao` | **6** | a definir na coleta (ver Riscos) |
| `--relatorios-por-equipamento` | **2** | AS-IS |

> Os valores entram por **parâmetro**, nunca embutidos — e a calibração usada é gravada junto
> com a massa. Sem isso, duas rodadas de carga não são comparáveis (exigência do plano macro).
> A **calibração 2** só existe depois da Fase 12, com o PDF novo.

**Contagem menor, bytes reais.** Com PDF de 6,6 MB, cada equipamento com 2 relatórios custa
**13,2 MB**:

| Escala realista | Storage | Cabe em produção? |
|---|---|---|
| 5 equipamentos | ~69 MB | sim, com folga |
| 10 equipamentos | ~137 MB | sim — chega a **47 %** do teto |
| 20 equipamentos | ~274 MB | **não** — passaria de 60 % |

**Proposta: realista = 10 equipamentos.** É suficiente para medir tempo de abertura de PDF,
egress por documento e projeção por unidade; multiplicar por N é aritmética, e a aritmética não
precisa ocupar bucket.

---

## Seeds e reprodutibilidade

- **PRNG próprio, determinístico** (mulberry32 semeado), **nunca `Math.random`**.
- TAG: `ZZ-SCALE-F8-<seed>-<n>` — prefixo `ZZ-` mantém a convenção de descartável do projeto e
  `-<seed>-` permite duas massas coexistirem sem se confundirem.
- Texto, datas, categorias e dimensões derivam do PRNG → **mesma seed = mesmo dataset lógico**.
- Cada rodada grava `docs/medicoes/massa-f8-<seed>.json` com: seed, perfil, escala, calibração,
  parâmetros, versão do gerador, commit, data.
- O roteiro de baseline registra: máquina, navegador, versão, rede, **cold/warm**, e o
  procedimento exato.

---

## Escalas

| Perfil | Escalas | Justificativa |
|---|---|---|
| **Estrutural** | 100 · 500 · 1.000 · 5.000 | O que se mede (DOM, hidratação, filtros, IndexedDB) **não depende** do tamanho do arquivo. Gerar 5.000 com fotos reais custaria dezenas de GB e horas de upload para medir tempo de render |
| **Realista** | 10 equipamentos | Com PDF de 6,6 MB, 5.000 equipamentos seriam **~66 GB** — 66× o teto do projeto. Medir por unidade e projetar é a única forma honesta |

**Declarar sempre**: `MEDIDO` para o que foi observado; `PROJETADO` para o que é aritmética
sobre o medido. Nunca converter um no outro.

---

## Métricas

### Boot / hidratação — cold e warm separados

| Medida | Como | Escalas |
|---|---|---|
| Shell visível | `performance.mark` + Performance panel | 100/500/1.000/5.000 |
| Autenticação | `performance.measure` em torno de `carregarPerfil` | idem |
| Hidratação (`lerTudo`) | `performance.mark` na entrada/saída | idem |
| Lista utilizável | mark no fim do 1º render com dados | idem |
| Linhas/chaves consultadas | contador de páginas em `lerTudo` | idem |
| Bytes recebidos | Network, filtro `supabase.co` | idem |
| Nº de requests | Network | idem |
| Tempo de query | `EXPLAIN ANALYZE` equivalente | idem |
| Processamento no frontend | tempo total − tempo de rede | idem |
| Leitura/escrita IndexedDB | mark em torno de `db.lerTudo`/`gravarLote` | idem |

**Cold** = perfil limpo, cache e IndexedDB zerados, `Disable cache`, 1º login.
**Warm** = 2ª abertura, cache quente, marca de sync presente.
Nunca somar num único "carregou em X".

### Listas / DOM

Tela `/equipamentos`, nas quatro escalas, nos modos grade e lista:

| Medida | Como |
|---|---|
| Nodes no DOM | `document.querySelectorAll('*').length` + contagem de cards |
| Tempo de render | Performance panel (Scripting/Rendering/Painting separados) |
| Tempo de filtro | `performance.mark` em torno do `useMemo` de `filtrados` |
| Tempo de busca | digitar 1 caractere, medir até o repaint |
| Tempo de ordenação | idem para os `.sort()` de `empresas`/`categorias` |
| Scroll | `requestAnimationFrame`, FPS e long tasks (`PerformanceObserver`) |
| Memória | heap snapshot antes/depois |
| Miniaturas | nº de GET `.thumb.jpg`, bytes, tempo até a última |
| Cache quente | repetir com o cofre já populado |

**Sintomas objetivos** (não "pareceu lento"): long task > 50 ms; INP > 200 ms; FPS < 30 no
scroll; nodes > 10.000.

### Memória

Heap snapshot em pontos fixos: após boot · após abrir a lista · após navegar por 10
equipamentos · após voltar para a lista. Registrar `usedJSHeapSize`, contagem de `Blob`/object
URLs e imagens decodificadas. **Só registrar retenção reproduzível em 3 execuções** — sem caça
genérica a leak.

### IndexedDB / offline

Registros e bytes por store · tempo de leitura completa · tempo de escrita em lote · bootstrap
offline com massa grande · fila com 1/10/100 mutações · tempo de drenagem · comportamento após
reload. Procurar **crescimento não linear**, não números altos.

### Sincronização

| Cenário | O que medir |
|---|---|
| Servidor sem alterações | requests, bytes, tempo, páginas |
| Poucas alterações (5 chaves) | idem + linhas devolvidas |
| Muitas alterações (10 % da massa) | idem |
| Fila local com N mutações | RPCs, tempo, idempotência, versões |

Observar conflito falso e mutação repetida. **Não reabrir a lógica da Fase 3 sem evidência.**

### Banco

Linhas · bytes por equipamento e por relatório · crescimento de `app_storage` ·
`pg_total_relation_size` · tamanho de cada índice · `EXPLAIN (ANALYZE, BUFFERS)` das consultas
críticas. **Nenhum índice novo é criado nesta fase**; query problemática vira registro para
decisão posterior.

### Custo do índice da Fase 1 — a dívida

O problema é que **não existe upsert isolado para cronometrar**: `trg_guardar_app_storage`
recusa escrita direta e tudo passa por `aplicar_mutacao_storage`. Então:

1. Medir `aplicar_mutacao_storage` ponta a ponta, com massa crescente, **com o índice presente**
   (é o estado de produção). N repetições, mediana e p95.
2. Comparação com/sem índice **apenas em ambiente controlado** — nunca dropar em produção.
   Sem ambiente controlado, o item fica `PENDENTE DE CONFIRMAÇÃO`, não "passou".
3. `pg_stat_user_indexes` antes e depois da geração: `idx_scan`, `idx_tup_read`, tamanho.
4. **Verificação independente de massa, e a primeira a rodar:** `idx_scan` de
   `app_storage_org_atualizado_idx` hoje. Se continuar perto de 3, o planner não usa o índice
   sob RLS → **reabrir a Fase 1**. Se subiu, o benefício de leitura está confirmado em campo.

### Storage e egress

Projeção separada por classe — thumbnails · principais · PDFs · assinaturas · logos ·
anexos — para 100/500/1.000/5.000. Modelo de egress por **comportamento real**:

| Ação | Egress |
|---|---|
| Abrir `/equipamentos` | N × miniatura (14,5 KB) |
| Abrir 1 equipamento | 1 × principal (88 KB) |
| Abrir 1 relatório | 1 × PDF (6,6 MB) |
| Portal — lista | payload JSON + miniaturas |
| Portal — documento | 1 × PDF sob demanda |

**Banco ≠ Storage. Egress ≠ tamanho armazenado.** Cada tabela declara qual das três está
medindo.

### PDF atual — baseline para as Fases 11/12

Sem tocar em `pdfService.ts`. Para relatórios de **5, 15 e 30 folhas**: tempo total e por
folha · pico de heap · bytes finais · páginas · fotos embutidas · tamanho no bucket · tempo e
bytes de abertura pelo Portal · SHA-256 (prova de determinismo do artefato).

---

## Baseline

Roteiro em `docs/medicoes/roteiro-baseline.md` (a criar) — procedimento passo a passo,
reexecutável por outra pessoa. Resultados em `docs/medicoes/2026-XX-XX-fase8-<perfil>-<escala>.md`.

---

## Onde a massa nasce — **precisa da sua decisão**

| | **A · Supabase local** | **B · Org sintética em produção** |
|---|---|---|
| Setup | Docker + `supabase init/start`; não há `config.toml` no repo hoje | nenhum |
| Custo em produção | **zero** | ~235 MB de Storage no degrau de 5.000 |
| Fidelidade | RLS, triggers e RPC iguais (mesmos `.sql`); **latência de rede não é real** | totalmente real |
| Serve para | banco, EXPLAIN, custo do índice, IndexedDB, DOM, listas | egress e latência reais |
| Risco | baixo | médio — cota e vizinhança de dados reais |

**Recomendação: híbrido.**

1. **Local** — estrutural até 5.000, custo do índice, EXPLAIN, IndexedDB, DOM, listas, memória.
2. **Produção, org de teste `99f642d3…`, até 500 equipamentos estrutural** (~23,5 MB, 2,3 % do
   teto) — para medir latência e egress reais.
3. **Produção, realista de 10 equipamentos** (~137 MB) — **só com autorização explícita sua**,
   e com limpeza imediata após a coleta.
4. **Produção, 1.000 e 5.000** — só se você quiser, e depois de rever as estimativas.

Antes de qualquer massa em produção, apresento: bytes estimados, Storage, nº de writes, impacto
no Supabase e o procedimento de limpeza. Sem sua autorização, não é gerada.

---

## Limpeza — planejada **antes** de existir massa

`scripts/massa-escala/limpar.mjs --org <uuid> --seed <int> --confirmar`

1. Só remove chaves cujo sufixo de TAG casa **exatamente** `ZZ-SCALE-F8-<seed>-`.
2. Só remove arquivos do bucket sob os prefixos daquelas TAGs.
3. **Recusa** se qualquer alvo não casar o padrão — nada de `delete` por prefixo largo.
4. Antes de apagar, imprime o que vai apagar e exige confirmação.
5. Remoção pela RPC oficial (`p_op: 'del'`), com tombstone — nunca `DELETE` direto.
6. Nunca toca em chave global (`nr13_lista_phs`, `nr13_minha_empresa`, `nr13_clientes`).
7. **Nunca toca** nas TAGs da Fase 7 (`ZZ-FASE3`, `ZZ-TESTE-*`) nem em `EQUIPE TESTE`.
8. Teste automatizado com **duas seeds coexistindo**: limpar uma não pode tocar a outra.

Massa parcial (gerador interrompido) sai pelo mesmo caminho — a seed identifica tudo.

---

## Tarefas

- [~] **F8.1** — `supabase/fase8_indice_verificar.sql` escrito: 7 consultas, **somente leitura**,
      com o contexto exigido (`stats_reset`, uptime, todos os índices, volume, escrita, planos
      dos cenários 1 e 2). **Falta o dono rodar no SQL Editor**
- [x] **F8.2** — `scripts/massa-escala/gerar.mjs` com as 6 travas, `--dry-run` e manifesto
- [x] **F8.3** — `prng.mjs` (mulberry32, marco de data **fixo**) + `conteudo.mjs` por família
- [x] **F8.4** — `arquivos.mjs` com preenchimento **incompressível** — provado por gzip no teste
- [x] **F8.5** — `scripts/massa-escala/limpar.mjs`, cirúrgico por seed, pela RPC oficial
- [x] **F8.6** — `massa.test.mjs` — **27 testes, 27 verdes** (`node --test`, sem tocar o Vitest)
- [ ] **F8.7** — `docs/medicoes/roteiro-baseline.md`
- [ ] **F8.8** — Instrumentação de medição (`performance.mark`) — **decisão pendente**, ver Riscos
- [ ] **F8.9** — Rodar estrutural 100/500/1.000/5.000 no ambiente aprovado
- [ ] **F8.10** — Rodar realista, calibração 1
- [ ] **F8.11** — Custo do índice da Fase 1
- [ ] **F8.12** — Baseline de PDF (5/15/30 folhas)
- [ ] **F8.13** — Medições de banco, Storage e egress
- [ ] **F8.14** — Classificar cada achado em A/B/C/D
- [ ] **F8.15** — Limpar toda a massa e provar que não sobrou nada

---

## Testes

| Teste | O que trava |
|---|---|
| Determinismo | mesma seed → mesmas TAGs e mesmos conteúdos, nos dois perfis |
| Prefixo | toda TAG gerada casa `ZZ-SCALE-F8-<seed>-` |
| Sem `--org` | aborta |
| Org não marcada como teste | aborta |
| Sem `--perfil` | aborta |
| **Nunca gera `nr13_livro_`** | varredura das chaves produzidas |
| Limpeza cirúrgica | duas seeds coexistindo; limpar uma não toca a outra |
| Limpeza não toca global | `nr13_lista_phs`, `nr13_minha_empresa`, `nr13_clientes` intactas |
| Limpeza não toca Fase 7 | `ZZ-FASE3` e seus relatórios intactos |
| Tamanho de arquivo | bucket confere com o pedido, ±10 % |
| Calibração gravada | arquivo de manifesto presente e completo |

---

## Critérios de aceite

- [ ] Gerar e limpar 100, 500 e 1.000 no perfil **estrutural**, sem sobra
- [ ] Gerar e limpar uma massa **realista**, calibração 1, com tamanhos **vindos das Fases 2 e 5**
- [ ] Determinismo provado por teste nos dois perfis
- [ ] As três recusas de segurança funcionam (`--org`, org não marcada, `--perfil`)
- [ ] Tamanho no bucket confere ±10 %
- [ ] Calibração registrada junto com a massa
- [ ] Roteiro de baseline executado ponta a ponta, resultado em `docs/medicoes/`
- [ ] Boot cold e warm medidos **separadamente** nas escalas aprovadas
- [ ] Listas medidas com métrica objetiva (nodes, long task, FPS, INP)
- [ ] Dívida do índice da Fase 1 fechada — ou registrada como `PENDENTE DE CONFIRMAÇÃO` com o
      motivo técnico
- [ ] Storage e egress projetados, com `MEDIDO` e `PROJETADO` separados
- [ ] Baseline de PDF coletada para 5/15/30 folhas
- [ ] Cada achado classificado em **A / B / C / D**
- [ ] **Nenhuma linha de código de produção alterada**
- [ ] Toda a massa removida ao fim, com prova

---

## Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Gerador apontado para org errada | 6 travas; `--org` obrigatório; org marcada; prefixo; `--confirmar`; variável extra para produção; nunca "a org logada" |
| R2 | Massa em produção estourar a cota | Estimativa **antes**; 5.000 só local; autorização por degrau; limpeza imediata |
| R3 | Massa contaminar o histórico da Fase 7 | Prefixo próprio; limpeza cirúrgica; teste que prova que `ZZ-FASE3` fica intacta |
| R4 | Livro sintético em livro real | Gerador **nunca** grava `nr13_livro_`; teste automatizado |
| R5 | **Instrumentar para medir altera o que se mede** | `performance.mark` é barato, mas é código de produção — e o aceite proíbe alterá-lo. **Preferir DevTools e `PerformanceObserver` injetado pelo console.** Se algum ponto exigir mark permanente, peço autorização separada |
| R6 | Números irreproduzíveis | Seed, calibração, ambiente, navegador, cold/warm registrados em toda rodada |
| R7 | Ceder à tentação de corrigir durante a medição | Fase 8 **mede**. Corrigir durante destrói a baseline. Achado vira registro classificado |
| R8 | `--fotos-por-inspecao` sem origem medida | Coletar de contas reais por consulta read-only **antes** de gerar; sem número real, declarar como suposição explícita |
| R9 | Sem Supabase local, o híbrido não fecha | Se você preferir não instalar, o custo do índice fica `PENDENTE DE CONFIRMAÇÃO` e as escalas grandes ficam limitadas ao que couber em produção |

---

## Rollback

Remover `scripts/massa-escala/`. Não há efeito no sistema — a fase **acrescenta ferramenta**,
não altera produção. A massa gerada sai por `limpar.mjs`.

---

## Log de execução

| Quando | O quê | Estado |
|---|---|---|
| 22/08 | Fase 7 fechada (P4 ✅). Fase 8 autorizada **só para planejamento/baseline** | ✅ |
| 22/08 | Lidos: `ESTADO-DAS-FASES.md`, Fase 8 do plano macro (linhas 2142–2350), Fase 9 (para saber o que **não** fazer), `PENDENCIAS.md`, medições das Fases 1, 2, 5, 6, 7 | ✅ |
| 22/08 | AS-IS de código mapeado: `demoSeed`, `storageV2.lerTudo`, `listarEquipamentos`, `Equipamentos.tsx`, `vencimentos.ts`, `pdfService.ts`, `db.ts`, padrão de `scripts/` | ✅ |
| 22/08 | Retrato read-only da org de teste: **59 chaves, 604,7 KB, 4 equipamentos** | ✅ |
| 22/08 | Calibração do perfil realista derivada de medições reais — PDF 6,6 MB, foto 87,7 KB, thumb 14,5 KB | ✅ |
| 22/08 | Dívida da Fase 1 recuperada e transformada em tarefa (F8.1 e F8.11) | ✅ |
| 22/08 | Constatado: **sem `supabase/config.toml`** — não há Supabase local hoje | ⚠️ registrado |
| 22/08 | Task-level criado. **Nenhuma massa gerada, nenhum código tocado** | ✅ |
| 22/08 | **Plano aprovado** pelo dono: local-first · Supabase local autorizado · instrumentação por DevTools · realista em produção **NÃO** autorizado · produção só 100 e 500 estrutural, depois do local | ✅ |
| 22/08 | **Ambiente conferido antes de instalar nada: `docker` NÃO existe nesta máquina.** Supabase CLI roda por `npx` (2.115.0), mas `supabase start` **exige Docker** | ⚠️ **bloqueio** |
| 22/08 | `prng.mjs`, `seguranca.mjs`, `conteudo.mjs`, `arquivos.mjs`, `gerar.mjs`, `limpar.mjs` implementados | ✅ |
| 22/08 | Testes em `node:test` — **sem tocar `vite.config.ts`**: a suíte do app está travada em `src/**`, e mexer no include por causa de uma ferramenta seria alterar configuração de build | ✅ |
| 22/08 | **27/27 verdes**: determinismo, prefixo, seed 1 × seed 12, proibição de `nr13_livro_`, limpeza cirúrgica, TAGs protegidas, 5 recusas de segurança, tamanho ±10 %, **incompressibilidade provada por gzip** | ✅ |
| 22/08 | **Divergência encontrada e corrigida:** o relatório sintético saía com **1.103 B** contra **2.461 B** do registro real — subestimava 2,2×. Formato refeito contra o registro real da Fase 7B, campo a campo | ✅ |
| 22/08 | Depois da correção: `nr13_rel_` = **2.460 B** (real: 2.461) · índice = **662 B/item** (real: 665) | ✅ |
| 22/08 | Estimativas recalibradas por `--dry-run` — todas as do plano eram **conservadoras** | ✅ |
| 22/08 | **Nenhuma massa gerada.** Sem laboratório local, não há onde gerar sem tocar produção | ⏳ |
| 22/08 | **Dono aprovou A+B+C** e autorizou instalar Docker Desktop | ✅ |
| 22/08 | F8.1 reescrito **sem placeholder**: 4 blocos, org e marca auto-resolvidas e provadas no código (`storageV2.ts:409` e `:365-374`) | ✅ |
| 22/08 | Ambiente conferido: Win 11 Pro build 26200 x64 · virtualização na BIOS **ativa** · **WSL não instalado** · `HypervisorPresent: False` · 224 GB livres · **RAM 7,6 GB** · sessão não elevada | ⚠️ registrado |
| 22/08 | Passo a passo de instalação entregue ao dono (`wsl --install` → reinício → Docker Desktop). **Parado antes do reinício**, como combinado | ⏳ |

### Estimado × observado — recalibração por `--dry-run`

| Escala | Conteúdo estimado | **Observado** | Bucket estimado | **Observado** |
|---|---|---|---|---|
| 100 | 1,0 MB | **0,81 MB** | 4,7 MB | **4,61 MB** |
| 500 | 5,1 MB | **4,06 MB** | 23,5 MB | **22,97 MB** |
| 1.000 | 10,1 MB | **8,13 MB** | 47 MB | **45,92 MB** |
| 5.000 | 50,7 MB | **40,79 MB** | 235 MB | **229,51 MB** |

Conteúdo ficou **20 % abaixo** do estimado; bucket, **2 %**. As duas divergências são para o
lado seguro. **O degrau de 500 confirma a condição do dono** — 22,97 MB contra o teto de
"~23,5 MB" que ele fixou para autorizar produção.

### Peso por família — massa sintética × registro real

| Família | Sintético | Real medido | |
|---|---|---|---|
| `nr13_rel_<id>_<TAG>` | **2.460 B** | 2.461 B | ✅ fiel |
| `nr13_historico_indice_` | 662 B/item | 665 B/item | ✅ fiel |
| `nr13_calc_` | 501 B | — | memorial reduzido |
| `nr13_emp_` | 383 B | 336 B | próximo |
| `nr13_fotos_` | 380 B | 408–1.145 B | 1 foto contra 1–9 reais |
| `nr13_info_` | 335 B | 43–81 B | **maior** que o real — a ficha de teste é magra |
| **Total por equipamento (2 relatórios)** | **8.431 B** | — | |

---

## Ponto de retomada

**Gerador pronto e testado (27/27). Nenhuma massa gerada. Duas coisas param na sua mão.**

### 1 · F8.1 — SQL pronto, sem placeholder

`supabase/fase8_indice_verificar.sql`. **Somente leitura**, sem `INSERT/UPDATE/DELETE/CREATE/ALTER/DROP`.

Os valores foram provados, não escolhidos:

| Valor | De onde veio |
|---|---|
| Org de teste `99f642d3-…` | `localStorage.nr13_org_id` e `sub` do JWT em `teste@gmail.com`; `2026-08-16-baseline-inicial.md` a lista como "99f642d3 (teste)" |
| Org representativa | **não fixada** — resolvida pela consulta como "a de mais linhas", mesmo critério da Fase 1 |
| Marca de sync | **maior `atualizado_em` da org** — `storageV2.ts:409`, `avancarMarca(escopo.id, maiorVisto)` |
| Filtro, ordem, limite | `gt` (estritamente maior), `(atualizado_em, chave)`, `limit 1000` — `storageV2.ts:365-374` |

**São 4 blocos, e o motivo é uma limitação real da ferramenta:** o SQL Editor mostra apenas o
resultado da ÚLTIMA consulta de um lote. Rode um bloco por vez:

| Bloco | O que é | Como copiar |
|---|---|---|
| **1** | Contexto — estatísticas, todos os índices, volume, escrita, 10 maiores orgs com a marca de cada | **uma célula JSON**; clique nela e copie inteira |
| **2** | `EXPLAIN` "nada mudou", org representativa | copie o texto do plano |
| **3** | `EXPLAIN` "nada mudou", org de teste (uuid literal) | idem |
| **4** | `EXPLAIN` "primeiro boot", org de teste | idem |

Com as quatro saídas eu classifico em **A / B / C / D**, considerando `stats_reset`, uptime,
`idx_scan`/`tup_read`/`tup_fetch`, tamanho, linhas, índices concorrentes, writes, plano,
buffers e a diferença `postgres` × `authenticated`. **Sem reabrir a Fase 1 por contador baixo.**

### 2 · Docker — ambiente conferido, e falta ação sua

| | |
|---|---|
| Windows | **11 Pro**, build 26200, x64 ✅ |
| Virtualização na BIOS | `VirtualizationFirmwareEnabled: True` ✅ |
| Hypervisor ativo | `HypervisorPresent: **False**` |
| WSL | **não instalado** |
| Disco livre | 224,3 GB ✅ |
| **RAM** | **7,6 GB** ⚠️ |
| Sessão | **não elevada** — não instalo daqui |

**Passo a passo — execute você, em PowerShell como Administrador:**

```powershell
# 1) instala WSL2 + VirtualMachinePlatform (EXIGE REINÍCIO ao final)
wsl --install
```

**Reinicie o Windows.** Depois:

```powershell
# 2) confirmar
wsl --status
wsl --version

# 3) instalar o Docker Desktop
winget install -e --id Docker.DockerDesktop
```

Abra o Docker Desktop uma vez (ele finaliza a configuração do WSL2) e me avise. Eu retomo em:
`docker --version` → `docker run --rm hello-world` → `npx supabase init` → `npx supabase start`
→ aplicar as migrations **reais** de `supabase/*.sql` → documentar as diferenças local × produção.

> **Risco da RAM, declarado antes e não depois.** O Supabase local sobe ~8 contêineres
> (Postgres, GoTrue, PostgREST, Storage, Kong, Realtime, Studio, Inbucket). Com 7,6 GB totais,
> mais Chrome com massa de 5.000 equipamentos, é apertado. Mitigação: rodar o degrau de 5.000
> **sem** o navegador aberto e medir DOM/listas pela via B (IndexedDB direto). Se travar, digo
> na hora — não vou empurrar medição em máquina saturada, porque o número sairia errado.

### Ordem depois que o laboratório subir — como você definiu

Um degrau por vez: **gerar → medir → registrar → limpar → provar limpeza → próximo**.
100 · 500 · 1.000 · 5.000. Sem acumular.

Depois, no local (descartável), o benchmark do índice: leitura (hidratação, poucas, muitas
alterações) e escrita (`aplicar_mutacao_storage`, INSERT/UPDATE lógicos, buffers, mediana,
variação), **com e sem** o índice — e **recriar o índice antes de qualquer outro benchmark**.
Nunca `DROP` em produção.

Medições com **≥ 3 execuções**, mediana e variação declaradas, cold e warm separados.

### Como rodar o que já existe

```bash
node --test scripts/massa-escala/massa.test.mjs      # 27 testes
node scripts/massa-escala/gerar.mjs --org <uuid> --perfil estrutural \
  --equipamentos 500 --seed 1 --relatorios-por-equipamento 2 \
  --url <url> --confirmar-org-de-teste --dry-run     # não escreve nada
```

**Produção continua sem massa.** Os degraus 100 e 500 estruturais seguem autorizados, mas só
depois do laboratório local provado. Realista em produção: **não autorizado**.
**Não iniciar a Fase 9. Não iniciar PDF vetorial.**
