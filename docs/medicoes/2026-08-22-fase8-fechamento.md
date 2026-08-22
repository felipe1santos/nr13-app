# FASE 8 — FECHAMENTO

**22/08/2026** · aprovado pelo dono sobre o commit `f6b2032`

> **Veredito de produto:** o critério **NÃO PASSA em grande escala**. Está provado por medição,
> não por opinião, e é o mandato da Fase 9.

**Nenhuma linha de `src/` alterada. Nenhum índice criado. Massa em produção: ZERO.**

---

## 1 · O que a Fase 8 entregou

| Entrega | Onde |
|---|---|
| Gerador determinístico de massa + limpeza cirúrgica | `scripts/massa-escala/` · 29 testes |
| Laboratório Supabase local, com paridade provada | `2026-08-22-fase8-laboratorio-e-f81.md` |
| **F8.1** e **F8.11** — dívida do índice da Fase 1 | idem · **FECHADOS** |
| Degraus 100 / 500 / 1.000 / 5.000 | idem |
| Auditoria das 14 telas nas 15 perguntas | `2026-08-22-fase8-auditoria-busca-e-listas.md` |
| Benchmarks de busca com 50.000 equipamentos | idem |
| Runtime de UI: 1.000 e ~51.000 equipamentos | `2026-08-22-fase8-diagnostico-consolidado.md` |
| Diagnóstico consolidado + lista para a Fase 9 | idem |

### Duas ausências graves consertadas no repositório

O sistema **não era reconstruível a partir do repositório**. `public.app_storage` — a tabela base
de tudo — não tinha `CREATE TABLE` em lugar nenhum, nem o trigger `app_storage_touch`, nem os
GRANTs de tabela. Recuperados de produção por consulta somente leitura:
`supabase/app_storage_base.sql` e `supabase/grants_postgrest.sql`. **São no-op em produção.**

### Três defeitos na ferramenta de limpeza, achados por medir

Todos **silenciosos** — a limpeza dizia sucesso e deixava coisa para trás: `list()` sem paginação
(200 PDFs), órfão de geração falha invisível (402 arquivos), e ausência de repescagem + prova sobre
as chaves (2.004 chaves). Corrigidos; a ferramenta agora **prova as duas pontas** e sai com código 3
se sobrar.

---

## 2 · A curva medida

| | 1.000 equipamentos | ~51.000 equipamentos |
|---|---|---|
| First Contentful Paint | **440 ms** | — |
| Hidratação warm | **1 requisição · 1.121 ms** | — |
| Abertura do app | imediata | **> 10 minutos** em "Carregando…" |
| `/equipamentos` | **2,20 s** | **~4 min de bloqueio** |
| Nós no DOM | **42.283** | **2.292.273** |
| Heap | 97 MB | **1.630 MB** (limite: 4.002 MB) |
| Requisições de hidratação | 1 (warm) | **583** onde 111 bastavam |
| Veredito | **utilizável** | **inutilizável** |

**Nessa escala menor o sistema funciona. A curva quebra entre 5.000 e 50.000, e quebra por
arquitetura — não por algoritmo.**

---

## 3 · Classificação final A/B/C/D

Escala confirmada pelo dono: **A** = age agora · **B** = age numa fase já planejada ·
**C** = observar, sem ação · **D** = descartado, não é problema.

| # | Achado | Classe | Destino |
|---|---|:--:|---|
| 1 | `public.app_storage` não versionada (tabela, trigger, função) | **A** | ✅ resolvido na Fase 8 |
| 2 | GRANTs de tabela não versionados | **A** | ✅ resolvido na Fase 8 |
| 3 | Três defeitos silenciosos na ferramenta de limpeza | **A** | ✅ resolvidos na Fase 8 |
| 4 | **G1 · Não existe busca server-side em lugar nenhum** | **A** | **Fase 9** |
| 5 | **G2 · Nenhuma paginação, cursor ou virtualização** | **A** | **Fase 9** |
| 6 | **G4 · Throttle de `lerTudo()` perdido da v1 para a v2** | **A** | **Fase 9** — e ver §4 |
| 7 | `/relatorios` sem nenhum campo de busca | **A** | **Fase 9** |
| 8 | `/inspecoes`, `/prontuarios`, `/calibracoes`, `/livro-registro` sem busca | **A** | **Fase 9** |
| 9 | Campo de busca escondido atrás de "Filtrar" em `/equipamentos` | **B** | Fase 9 |
| 10 | Fabricante e nº de série existem e **não** são pesquisáveis | **B** | Fase 9 |
| 11 | Prefixo de TAG não usa índice (`text_ops` + `en_US.UTF-8`) | **B** | Fase 9 |
| 12 | Um `<select>` por card (1.004 em 1.000 equipamentos) | **B** | Fase 9 |
| 13 | `listarCalibracoes(tag)` dentro do `.map()` de render | **B** | Fase 9 |
| 14 | **G3 · Contador de `/relatorios` parseia registro pesado** — 3,1×, ~10 ms em 1.000 | **B** | Fase 9 — **baixa prioridade**, ver §4 |
| 15 | `app_storage_org_idx` redundante com o unique (38 × 14.260 varreduras) | **B** | Fase 9 |
| 16 | PDF arquivado requisitado **duas vezes** | **C** | Fase 9, se sobrar |
| 17 | Dashboard limita exibição, não cálculo | **C** | Fase 9, se sobrar |
| 18 | O índice da Fase 1 tirou o HOT update da tabela (87,7 % → 0,1 %) | **C** | observar |
| 19 | ~29 MB de bloat de TOAST em produção | **C** | observar; a Fase 2 reduz a origem |
| 20 | `app_storage_bkp_20260805` e `gate_resultados` fora do repo | **C** | decidir quando descartar |
| 21 | **Dívida do índice da Fase 1: ele se paga?** | **D** | **Sim.** Manter — 913 buffers constantes de 500 a 5.000 |
| 22 | Regressão de primeiro boot da Fase 1 (65 → 236 buffers) | **D** | **Não reproduz em escala nenhuma** |
| 23 | **Arquitetura de PDF** — índice leve com `pdfRef`, PDF só no clique | **D** | **Está certa. Não mexer** |
| 24 | Armazenamento v2 / cota / palco / fotos sob demanda | **D** | Funcionando como projetado |
| 25 | **"Grace period is over"** no Dashboard do Supabase | **A** | **Atenção do dono** — fora da Fase 8 |

---

## 4 · Correção de prioridade que o dono determinou

> *"Não quero gastar uma semana otimizando um desperdício de 10 ms enquanto existem milhões de nós
> no DOM."*

Registrado, e a medição concorda: o **G3** (contador de `/relatorios`) custa **10 ms em 1.000
equipamentos** e ~500 ms em 50.000. É real e barato, **mas não é dominante**. Foi rebaixado de A
para **B**.

E o **G4** ganhou a ressalva do dono, que é arquitetural:

> **THROTTLE ≠ SOLUÇÃO DE ESCALA.** Restaurar o throttle é obrigatório porque há regressão
> comprovada da v1 para a v2 — mas com dezenas de milhares de equipamentos, **mesmo UMA hidratação
> completa da organização já é arquitetura inadequada.**

A ordem de ataque da Fase 9, por impacto medido, passa a ser:

1. **Sair da hidratação integral** (boot progressivo / sob demanda) — G1 + G4.
2. **Paginação/cursor + virtualização** — G2.
3. **Busca server-side sobre camada pesquisável** — G1.
4. O resto.

---

## 5 · Itens marcados, não fechados

| Item | Marcação | Motivo |
|---|---|---|
| Degraus 100/500 em **produção** | **CALIBRAÇÃO DE PRODUÇÃO ADIADA / NÃO BLOQUEANTE** | Decisão do dono: há aviso de cota/faturamento no Dashboard. **Não é falha da Fase 8** — a evidência local basta para decidir a arquitetura da Fase 9 |
| Dataset **realista** em produção | **NÃO AUTORIZADO** | Decisão do dono |
| **Baseline de GERAÇÃO de PDF** (5/15/30 folhas) | **PRÉ-REQUISITO ANTES DA FASE 11** | O fluxo exige um container de inspeção real, que a massa sintética não cria. Não bloqueia a Fase 8; **bloqueia o piloto vetorial** |
| Boot **cold** cronometrado | não medido | A ida e volta da ferramenta de automação é de ~21 s e o boot termina antes. O **warm** está medido |
| **FPS de scroll** | não medido | Exigiria rolagem sustentada amostrada por `rAF`; não executada |

**Nada acima foi estimado.** Ou tem número, ou está marcado.

---

## 6 · Mandato formal da Fase 9

Registrado por decisão do dono em 22/08. **A Fase 9 começa por um PLANO, não por código.**

### Busca server-side — SIM, mas não com `LIKE` sobre `app_storage.valor`

O baseline provou que `valor` é `text` opaco e que consultas por conteúdo são `Seq Scan`. A Fase 9
deve desenhar uma **camada pesquisável, aditiva e indexável** — uma **projeção LEVE**:

- **Equipamentos:** org, TAG, descrição, tipo, categoria, fabricante, nº de série, localização,
  `atualizado_em`.
- **Relatórios:** org, id, TAG, código, tipo, data, profissional, status, `pdfRef`, `atualizado_em`.

**Sem blobs, sem base64, sem snapshots pesados, sem PDFs.** E **não assumir duas tabelas** — a
modelagem tem de ser analisada.

### Fonte da verdade — a exigência mais dura

**Não criar uma segunda verdade divergente.** O plano precisa responder, com mecanismo escolhido e
justificado (escrita transacional · trigger · RPC · projeção derivada · reconstrução idempotente):

> **O que acontece se o `app_storage` salva e a projeção falha?**

**Não implementar arquitetura que possa mostrar resultado de busca incompatível com o dado
definitivo.**

### Boot progressivo

Sair de *"baixar organização inteira → materializar tudo → só então mostrar UI"* para:

```
BOOT       → autenticação + dados globais pequenos → shell utilizável
EQUIPAMENTOS → página/metadados necessários
BUSCA      → consulta server-side
DETALHE    → chaves daquele equipamento sob demanda
RELATÓRIO  → metadados primeiro; PDF só no clique
```

Sem analisar as dependências existentes — **especialmente offline** — nada disso é implementado.

### Offline não pode ser perdido — obrigatório

> Busca server-side **não** pode significar "sem internet o usuário não encontra mais nada".

O plano precisa definir explicitamente: o que fica disponível offline · quais metadados ficam
cacheados · como a busca local funciona · **como a UI informa as limitações**. Não quebrar
PWA/offline em silêncio para ganhar desempenho online.

### Três mecanismos, três responsabilidades — não confundir

| Mecanismo | Responsabilidade |
|---|---|
| **Paginação / cursor** | quanto dado vem **do servidor** |
| **Virtualização** | quanto vai **para o DOM** |
| **Busca server-side** | não baixar a coleção inteira para achar poucos itens |

Não resolver só o DOM mantendo downloads gigantes; nem só o servidor e depois renderizar milhares
de resultados. **Preferir keyset/cursor** onde `OFFSET` degrada em escala. Limites claros de
resultado (ordem de 20–50 por página, ou outra estratégia justificada).

### Índices

`app_storage_org_atualizado_idx` **continua aprovado para hidratação/sync e não é índice de
busca**. Para a camada pesquisável: analisar as consultas reais (TAG exata, prefixo, descrição,
fabricante, nº de série, relatório por código, por equipamento, período) com
`EXPLAIN (ANALYZE, BUFFERS)`. Avaliar `text_pattern_ops` onde couber. **Cada índice precisa
corresponder a consulta real e benchmark — não criar cinco "porque pode".**

### UX de busca

`/relatorios` hoje tem **zero** campo textual. Precisa mudar. Mas **não** basta um `<input>` que
filtra os mesmos milhares de cards: **UX e arquitetura se corrigem juntas.**

### Benchmarks DEPOIS

O ANTES está documentado. Depois das mudanças: **100 · 500 · 1.000 · 5.000**, e metadados leves em
**10.000 · 20.000 · 50.000**. Provar: app abre rápido · a tela não hidrata a organização inteira ·
busca exata e por prefixo rápidas · fabricante e nº de série funcionam · `/relatorios` tem busca ·
DOM e heap controlados · scroll utilizável · PDFs não baixados para buscar · só o necessário
atravessa a rede.

### Meta de produto

Não é *"51 mil agora abre em 2 minutos"*. É: **abrir rápido · navegar imediatamente · pesquisar um
item em segundos · não carregar a base inteira · não criar milhões de nós · não baixar PDF até o
clique.**

---

## 7 · Limpeza do laboratório — executada e provada

Toda a massa foi removida pela **ferramenta oficial corrigida**, que prova as duas pontas (banco e
bucket) e sai com código 3 se sobrar qualquer coisa.

| Organização | Seed | Chaves | Arquivos | Prova | exit |
|---|---:|---:|---:|---|:--:|
| `lab@local.test` (alvo) | 7 | 11.000 | 4.002 | `0 chaves vivas, 0 arquivos, 0 pastas` | **0** |
| `ruido1@local.test` | 8 | 7.700 | 2.802 | idem | **0** |
| `ruido1@local.test` | 901 | 3.300 | 1.202 | idem | **0** |
| `ruido2@local.test` | 902 | 3.300 | 1.202 | idem | **0** |
| `ruido3@local.test` | 903 | 3.300 | 1.202 | idem | **0** |
| **Total** | | **28.600** | **10.410** | | **0 falhas** |

### Conferência independente, feita no banco e não pela ferramenta

```
chaves vivas com prefixo da massa .... 0
arquivos no bucket inspecao ......... 0
chaves vivas de QUALQUER tipo ....... nenhuma, em nenhuma organização
tombstones .......................... 128.600
```

Os 128.600 tombstones **não são sobra** — são a PROVA da exclusão exigida pelo §2-ter. Nenhuma
chave global (`nr13_lista_phs`, `nr13_minha_empresa`, `nr13_clientes`) jamais existiu no
laboratório: o gerador tem proibição absoluta de escrevê-las, e o teste que trava isso está na
suíte.

### Destino das organizações de ruído — decidido

As três (`ruido1/2/3@local.test`) existiam para dar **seletividade realista** ao laboratório — sem
elas o planner escolhia `Seq Scan` porque a org alvo era 100 % da tabela, e nenhuma medição de
índice de leitura valia.

**Decisão: a massa delas foi removida com prova, e as contas ficam.** Elas são registros do GoTrue
e do `profiles` do banco descartável, custam bytes, e a Fase 9 vai precisar do mesmo laboratório
para os benchmarks DEPOIS — recriá-las seria trabalho repetido sem ganho. Morrem junto com os
volumes do Docker quando o laboratório for descartado (`npx supabase stop --no-backup` ou
`db reset`).

### O que ficou no repositório, e por quê

| Arquivo | Por que fica |
|---|---|
| `supabase/app_storage_base.sql` | O sistema não era reconstruível sem ele. **No-op em produção** |
| `supabase/grants_postgrest.sql` | Idem |
| `supabase/config.toml` | Configuração do laboratório. `site_url` aponta para `localhost:5173` — é do laboratório, **não afeta produção** |
| `supabase/fase8_indice_verificar.sql` | O F8.1, somente leitura |
| `scripts/massa-escala/` | A ferramenta da fase, com os três defeitos corrigidos e 29 testes |

### Ambiente do desenvolvedor, restaurado

| | |
|---|---|
| `.env.local` temporário | **removido** |
| `.env` de produção | **intacto**, apontando para `qqsesrntfvmdxqxrfvmw` |
| Servidor de desenvolvimento | parado |
| App | **não** ficou apontando para o laboratório ✅ |
