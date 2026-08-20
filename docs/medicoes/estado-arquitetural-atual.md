# Estado arquitetural ATUAL — Sistema NR-13

**Data:** 19/08/2026 · **Base:** `main` @ `cb26450`
**Natureza:** auditoria READ-ONLY. Nenhum arquivo de código, SQL, template ou deploy foi
alterado para produzir este documento.
**Método:** leitura do código-fonte (273 arquivos TS/TSX, 84 arquivos de teste, 41 templates
HTML, 23 scripts SQL, 7 Edge Functions).

> **Este documento descreve o que O CÓDIGO FAZ HOJE, não o que deveria fazer.**
> A arquitetura desejada e os gaps estão na seção 16, separados de propósito.

## Limite desta auditoria — leia antes de usar os números

O que está no repositório **não é prova do que está aplicado em produção**. Um arquivo
`.sql` versionado aqui pode não ter sido executado no Supabase; uma Edge Function no
repositório pode estar com versão antiga no ar (é exatamente o caso conhecido de
`purga_trial`, ver PENDENCIAS.md §0.3). Onde este documento afirma "aplicado", a fonte é
um registro de validação em produção (`docs/medicoes/`), e está citada.

Documentos anteriores que este complementa, **sem substituir**:

| Documento | O que traz |
|---|---|
| `docs/auditoria-arquitetura-2026-08-15.md` | Os 18 achados A-01…A-18, com impacto/risco/prioridade |
| `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` | O roteiro de 14 fases e as dependências entre elas |
| `docs/medicoes/2026-08-16-baseline-inicial.md` | Números reais de produção (banco, bucket, egress) |
| `docs/ARMAZENAMENTO-LIMITES.md` | Os quatro tetos de armazenamento e o peso por família de chave |

---

# 1. Rotas e entradas principais

Fonte: `src/app/router.tsx`. Três árvores separadas sob um único gate de sessão
(`RotaProtegida`), e a separação é arquitetural, não cosmética.

```
/login ─────────────────────────────────── público

RotaProtegida  (sessão + verificarAcesso + iniciarArmazenamento + hidratação)
│
├── RotaAdmin ──── /admin ................ painel da plataforma, FORA do Layout
│
├── RotaCliente ── PortalLayout
│                  ├── /portal ........... lista de ativos do cliente
│                  └── /portal/ativo/:tag  ativo: documentos, prontuário, histórico
│
└── RotaUsuario ── Layout (sidebar/topbar do sistema)
                   ├── /dashboard         /equipamentos      /vencimentos
                   ├── /pendencias        /livro-registro
                   ├── /equipamento/:tag  /equipamento/:tag/memorial
                   ├── /relatorios        /prontuarios
                   ├── /inspecoes  /inspecoes/:tag/:containerId[/:formulario]
                   ├── /calibracoes       /certificados
                   └── /minha-empresa  /empresas  /funcionarios  /acesso
```

**Rotas que participam de fluxo de dado, e por onde elas passam:**

| Rota | Serviço principal | Escreve | Monta iframe (palco) |
|---|---|---|---|
| `/equipamentos`, `/equipamento/:tag` | `equipamentoService`, `fotos` | `nr13_info_`, `nr13_fotos_`, `nr13_pref_unidade_`, `nr13_pront_fab_` | não |
| `/equipamento/:tag/memorial` | `vasoMemorialService`, `calc/` | `nr13_calc_`, `nr13_vaso_*`, `nr13_cat_` | não |
| `/inspecoes/**` | `inspecaoService`, `useAutosaveFormulario`, `fotos` | `nr13_docs_` + blobs no cofre | não |
| `/relatorios` | `relatoriosService`, `historicoRelatorios`, `pdfService`, `artefatoRelatorio`, `printService` | `nr13_rel_`, `nr13_historico_indice_`, `nr13_relatorio_meta_atual`, `nr13_inspecao_atual`/`nr13_injecao_atual`, `nr13_livro_` | **sim** |
| `/prontuarios` | `prontuarioService`, `modelador` | `nr13_prontuario_`, `nr13_modelo3d_`, `nr13_croqui2d_`, `nr13_folha_dados_` | **sim** |
| `/calibracoes` | `calibracaoService`, `componentesService` | `nr13_calibracoes_`, `nr13_calibracao_item_`, `nr13_componentes_cal_`, `nr13_lotes_cal_` | **sim** (só no visualizador) |
| `/certificados` | `rastreabilidadeService` | `nr13_rastreab_` + PDF no bucket | não |
| `/livro-registro` | `livroLacre`, `livroAssinatura` | `nr13_livro_`, `nr13_livro_config_` | **sim** |
| `/pendencias` | `sync` | fila/conflitos no IndexedDB | não |
| `/acesso`, `/funcionarios`, `/empresas`, `/minha-empresa` | `orgAdmin`, `cadastroService`, `permissoes` | Edge `org_admin`; `nr13_lista_phs`, `nr13_clientes`, `nr13_minha_empresa`, `nr13_permissoes_` | não |
| `/admin` | Edge `admin` + RPCs `admin_usage_stats`/`admin_storage_stats` | `profiles` (direto, só admin) | não |
| `/portal/**` | `portalService` → Edge `portal_cliente`; `fotos` → Edge `portal_arquivo` | **nada** (papel bloqueado para escrita) | **sim** |

**Detalhe de rota com história (19/08/2026):** a TAG vai para a URL por `src/app/rotas.ts`,
com `encodeURIComponent` **por segmento**. Uma TAG com `/` (`COMPRESSOR V8-15/200L`,
modelo estampado em placa) quebrava o casamento de `:tag` e tornava a ficha inalcançável —
2 de 3 equipamentos de uma conta real. `rotas.test.ts` casa os construtores contra as
strings de rota do `router.tsx`.

---

# 2. Caminho de ESCRITA

## 2.1 O despachante

`src/services/storage.ts` é a porta única (44 arquivos importam dela) e despacha entre
duas implementações pela flag `nr13_armazenamento_v2`, **memoizada por sessão**
(`flag.ts:27`). Trocar de caminho no meio da sessão faria a v2 ler o `localStorage` vazio
e concluir "conta sem equipamentos".

| | v1 (`storageV1.ts`, 500 linhas) | v2 (`storageV2.ts`, 530 linhas) |
|---|---|---|
| Cache | `localStorage` (teto ~5 MB da origem) | `Map` em memória + IndexedDB `nr13_dados_<org_id>` |
| Escrita | `upsert` direto na tabela | RPC `aplicar_mutacao_storage` + fila transacional |
| Estado | **rollback apenas.** Organização nova nasce em v2 (`v2_por_default.sql`) | caminho vigente |

## 2.2 Diagrama textual — criação de equipamento (exemplo canônico)

```
ModalCriarEquipamento (UI)
  └─> equipamentoService.criarEquipamento()                    equipamentoService.ts:74
        └─> storage.salvar('nr13_info_<TAG>', info)            storage.ts:65
              └─> storageV2.salvar()                           storageV2.ts:118
                    ├─ bloqueadoParaUso()    → lança ErroTrocandoConta
                    ├─ bloqueadoParaEscrita()→ lança ErroBloqueado    gateEscrita.ts:14
                    │     (papel 'cliente' | assinatura somente_leitura | prazo vencido)
                    └─> gravarComFila()                        storageV2.ts:127
                          ├─ versaoServidor = registro anterior?.versao ?? 0
                          ├─ registro = { valor, versao+1, atualizadoEm, dispositivo }
                          ├─ item     = sync.montarItem('set', chave, valor, versaoServidor)
                          │              └─ mutationId = uuid                sync.ts:156
                          └─> cacheLocal.gravarAtomico([registro], [item])
                                └─> db.aplicarAtomico(orgId, ops)            db.ts:83
                                      ── UMA transação IndexedDB: stores `dados` + `fila`
                                      ── resolve em tx.oncomplete, NUNCA em onsuccess
        └─> sync.drenar()                                      sync.ts:519
              └─> enviarItem(item)                             sync.ts:412
                    └─> supabase.rpc('aplicar_mutacao_storage', {
                          p_chave, p_mutation_id, p_op, p_valor,
                          p_versao_esperada, p_dispositivo, p_mutado_em })
                          │
                          ├─ 'aplicado' | 'repetido' → carimba r.versao no registro local
                          │                            → removerDaFila(mutationId)
                          ├─ 'conflito'  → guardarConflito(servidor) na store `conflitos`
                          │                → item marcado 'conflito', FICA na fila
                          ├─ 'recusado' + versao_obsoleta|tombstone_mais_novo|anterior_ao_corte
                          │                → 'conflito' (decisão do usuário)
                          ├─ 'recusado' outro motivo → 'falha_definitiva'
                          └─ erro 'recusa_definitiva' → 'encerrado' (para de tentar,
                                                          NÃO some da fila)
```

**Invariantes que este caminho sustenta** (verificados no código, não presumidos):

1. Dado e item de fila nascem na **mesma transação** — dado sem fila nunca sobe; fila sem dado sobe lixo.
2. A Promise resolve no **commit**, não no `onsuccess`.
3. Idempotência por `mutationId` na RPC (tabela `app_storage_mutacoes`).
4. Conflito preserva **as duas versões**; nenhuma é descartada sem decisão humana.
5. Nada é removido localmente por ausência no servidor — só tombstone explícito.
6. Uma falha não interrompe a fila: `drenar()` isola item a item (`sync.ts:519`).

## 2.3 Escrita de ARQUIVO (caminho paralelo, fila própria)

```
salvarFoto/salvarArquivo (fotos.ts:110/134)
  ├─ comprime (imagem.ts: 1200 px, JPEG q0.7)  — só fotos
  ├─ montarPath(orgId, escopo, ext) → '<org_id>/<escopo>/<uuid>.<ext>'   ANTES da rede
  ├─ cofre.guardar(blob) no IndexedDB `nr13_fotos`   ← única cópia até confirmar
  ├─ tenta storage.upload(...)
  └─ devolve RefFoto { path } — o registro aponta para o path, exista ele no bucket ou não
```

`salvarArquivoPorConteudo` (`fotos.ts:178`) é a variante **endereçada por conteúdo** (path
= SHA-256 do arquivo): conteúdo igual → um arquivo, N referências. Usada hoje **só** pelas
rubricas do Livro (`livroAssinatura.ts`).

## 2.4 Escritas que NÃO passam pelo mecanismo esperado

Levantamento por varredura global (`supabase.from(`, `supabase.rpc(`, `functions.invoke(`,
`localStorage.setItem`).

| # | Caminho | Onde | Classificação |
|---|---|---|---|
| 1 | RPC `aplicar_mutacao_storage` | `sync.ts:417` | **o mecanismo canônico** — ponto único |
| 2 | `upsert`/`delete` direto em `app_storage` | `storageV1.ts:216,392,416` | legado v1; morto para org em v2 (o trigger `trg_guardar_app_storage` recusa) |
| 3 | `profiles.update({ultima_sync})` | `sync.ts` (`registrarSync`) | telemetria best-effort, throttle 60 s |
| 4 | `profiles.update` / `select *` | `Admin.tsx` (5 pontos) | painel da plataforma, guarda `is_admin()` |
| 5 | `login_events.insert` | `auth.ts` | auditoria de login |
| 6 | `leads_importados` insert/delete | `leadsImportados.ts` | tabela própria do Admin |
| 7 | Edge `org_admin` | `orgAdmin.ts` | criação de sub-login/cliente (service_role) |
| 8 | Edge `trial` | `auth.ts` | ativação do trial (server-side, por desenho) |
| 9 | Edge `admin` | `Admin.tsx` | ações administrativas |
| 10 | **`localStorage.setItem` direto — 3 pontos** | ver abaixo | **cache de renderização, não dado** |
| 11 | Ponte dos templates (`sb-storage.js`) | `public/sb-storage.js` → `ponteTemplates.ts` | grava no `localStorage` e o APP drena para `salvar()` |
| 12 | Upload de arquivo | `fotos.ts:216` | fila própria (cofre IndexedDB), correto |

**Os três `setItem` diretos (10), e o que cada um é:**

| Ponto | Chave | Por quê | Veredito |
|---|---|---|---|
| `portalService.ts:44` | todas as chaves da Edge | os templates em iframe leem `localStorage` síncrono; o Portal **não tem palco** | necessário hoje; é o A-02 |
| `prontuarioService.ts:87` | `nr13_prontuario_atual` | insumo de renderização; `salvar()` enfileiraria mutação e o gate do papel `cliente` derrubava a abertura (corrigido 19/08) | correto |
| `calibracaoService.ts:35` | `nr13_calibracao_item_<id>` | a Edge não entrega a chave (não termina em `_<TAG>`); hidratada do objeto que já veio | correto |

**Ponto de granularidade (não é bug, é custo):** `useAutosaveFormulario` grava a cada 1 s
de inatividade, e `salvarDadosFormulario` reescreve **`nr13_docs_<TAG>` inteira** — a lista
de TODOS os containers daquele equipamento. Uma inspeção longa produz dezenas de mutações,
cada uma carregando o container completo. É o que a "autosave granular por formulário"
(Fase 2 do plano de armazenamento) resolve.

---

# 3. Caminho de LEITURA / hidratação

```
login (auth.login)
  └─> carregarPerfil()                                          auth.ts:129
        ├─ select plano, ativo, role, acesso_expira_em, papel, org_id, cliente_id,
        │         sessao_token, sessao_visto_em   from profiles where id = uid
        ├─ grava no localStorage: nr13_papel, nr13_org_id, nr13_cliente_id,
        │                         nr13_plano, nr13_role, nr13_uid, nr13_acesso_expira_em
        ├─ rpc('assinatura_org') → nr13_assinatura_status / _ate
        └─> flag.sincronizarFlagDoServidor()   ← lê org_sync.v2_ativa
              (sem linha = org nova = v2; erro de rede NÃO rebaixa para v1)

RotaProtegida (todo boot)                                        RotaProtegida.tsx
  ├─ supabase.auth.getSession()
  ├─ verificarAcesso()  → logout se revogado/expirado
  ├─ iniciarArmazenamento()  → abre IndexedDB da org, carrega Map, fila, tombstones,
  │                            conflitos do disco  (SEM rede)
  ├─ if (!ehCliente()) await lerTudo()      ← CLIENTE NÃO HIDRATA (Fase 0-B)
  ├─ migrarHistoricoEmSegundoPlano()        ← array legado → registro por relatório
  └─ migrarRubricasEmSegundoPlano()         ← base64 da rubrica → ref por conteúdo
```

## 3.1 Hidratação incremental (`storageV2.lerTudo`, linha 341)

```sql
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
  from app_storage
 where org_id = $1
   and atualizado_em > $marca          -- gt, não gte
 order by atualizado_em asc, chave asc  -- ordenação COMPOSTA
 limit 1000 offset $n
```

| Aspecto | Como está |
|---|---|
| Hidratação inicial | sem marca d'água → baixa tudo, paginado de 1000 em 1000 |
| Incremental | marca d'água por org (`marcaSync`), guardada na store `meta` do IndexedDB |
| Índice que a sustenta | `app_storage_org_atualizado_idx (org_id, atualizado_em, chave)` — `indice_hidratacao.sql`, aplicado em 16/08 (Fase 1) |
| Paginação | `range()` de 1000; sai quando a página vem incompleta |
| Deletados | `deletado_em` não nulo → remove do cache local |
| Tombstone local mais novo | não ressuscita a chave |
| Pendência local | vence a linha do servidor (`sync.itemDaChave` → `continue`) |
| Avanço da marca | **só depois de todas as páginas aplicadas** |
| Offline | devolve `cache.snapshot()` — nunca `{}` |
| Válvula de escape | `localStorage.nr13_hidratacao_completa = '1'` força hidratação total |
| Aparelho novo | sem marca → hidratação completa; cofre de fotos vazio → resolve por URL assinada |

## 3.2 Atualização na direção contrária (19/08/2026)

`atualizarDoServidor()` (`storageV2.ts:281`) escuta `online` **e** `visibilitychange`:
sobe a fila sempre e **baixa** no máximo uma vez por janela de 60 s. Dois cuidados
codificados: throttle (evita uma consulta por troca de aba) e **respeito ao palco** — se
houver dono vivo da trava, a hidratação espera, senão trocaria o dado sob um documento já
montado.

## 3.3 Leitura na UI

Toda tela lê do `Map` por `ler()` / `listarChavesComPrefixo()` / `listarChavesDaTag()` —
síncrono, sem rede. `listarEquipamentos()` chama `lerTudo()` antes (é um dos gatilhos de
hidratação). Arquivos são resolvidos sob demanda por `FotoImg` + `IntersectionObserver`.

---

# 4. localStorage — classificação de TODO uso

Varredura global em `src/` (excluídos os testes). **Nenhum dado de negócio da v2 mora
aqui**; o `localStorage` virou palco + estado de sessão.

| Classe | Chaves | Onde | Avaliação |
|---|---|---|---|
| **A · preferência/sessão pequena** | `nr13_uid`, `nr13_papel`, `nr13_org_id`, `nr13_cliente_id`, `nr13_role`, `nr13_plano`, `nr13_usuario_logado`, `nr13_sessao_id`, `nr13_sessao_token`, `nr13_ultimo_login`, `nr13_ultimo_acesso`, `nr13_acesso_expira_em`, `nr13_dispositivo` | `auth.ts` (41 usos), `sync.ts` | correto. É espelho de sessão; quem decide é a RLS |
| **A** | `nr13_assinatura_status`, `nr13_assinatura_ate`, `nr13_assinatura_sucesso_pendente` | `assinatura.ts`, `gateEscrita.ts` | correto (§11 do CLAUDE.md) |
| **A** | `nr13_armazenamento_v2` | `flag.ts` | correto |
| **C · palco (cache de renderização, efêmero)** | todas as chaves da TAG aberta + `GLOBAIS` | `palco.ts` (12 usos), `palcoTrava.ts` | correto por desenho. Montado e limpo por documento, com orçamento e trava |
| **C** | `nr13_palco_manifesto`, `nr13_palco_dono` | `palco.ts`, `palcoTrava.ts` | correto |
| **C** | `nr13_fila_ponte` | `ponteTemplates.ts`, `sb-storage.js` | correto — fila curta, drenada para `salvar()` |
| **C** | `nr13_prontuario_atual`, `nr13_calibracao_item_<id>` (Portal) | `prontuarioService.ts:87`, `calibracaoService.ts:35` | correto — insumo de template, não dado |
| **C** | `nr13_hidratacao_completa` | `storageV2.ts:327` | válvula de emergência |
| **B · compatibilidade temporária** | `nr13_fila_sync`, cache v1, `nr13_manifesto_*` | `migracaoV1.ts` | adoção da herança v1; some sozinha |
| **D · dado de negócio persistido no localStorage** | **nenhum na v2** | — | ✔ |
| **D — exceção: PORTAL DO CLIENTE** | a organização inteira que a Edge devolver | `portalService.ts:44` | 🔴 **é o A-02.** Sem palco, sem IndexedDB, com falha de cota apenas logada |
| **E · base64/arquivo pesado** | dentro das chaves do palco (fotos rehidratadas em dataURL) | `palco.ts` | inerente ao desenho (templates leem síncrono). É o A-12 |
| **F · legado não usado** | — | — | nada encontrado sem uso |

`sessionStorage`: **2 usos**, ambos em `Dashboard.tsx` (estado de UI). Nenhum dado.

**Dois pontos de LEITURA direta que contornam o `Map` — achado novo desta auditoria:**

| Ponto | Chave | Consequência medida no código |
|---|---|---|
| `Calibracoes.tsx:89` (`empresaAutoFill`) | `nr13_minha_empresa` | chamado por `formPadrao()`, ou seja, **ao criar uma calibração nova** — momento em que o palco NÃO está montado (`pular: tela !== 'visualizador'`, linha 210). Na v2 a chave não existe no `localStorage` nesse instante → os campos "empresa" e "endereço" nascem **vazios**. Falha silenciosa: nenhum erro, só um formulário que deixou de se preencher sozinho |
| `Prontuarios.tsx:281` | `nr13_croqui2d_<TAG>` | indicador "croqui salvo". Aqui o palco está montado para a TAG, então funciona — mas o valor é recomputado a cada render e depende de o palco já ter materializado. Acoplamento frágil, não defeito confirmado |

Os dois deveriam ler por `storage.ler()`. **Não foram corrigidos** — esta auditoria é
read-only.

---

# 5. IndexedDB

**Quatro bancos**, com finalidades e ciclos de vida distintos.

| Banco | Versão | Stores | Finalidade | Pode ser a ÚNICA cópia? |
|---|---|---|---|---|
| `nr13_dados_<org_id>` | **2** | `dados`, `fila`, `tombstones`, `meta`, `conflitos` | cache + fila da v2, um por organização | **sim, `fila`/`conflitos`** — mutação ainda não aceita pelo servidor |
| `nr13_fotos` | 1 | `fotos` (keyPath `path`, índice `pendente`) | cofre de blobs: fila de upload **e** cache de leitura offline | **sim, enquanto `pendente=true`** |
| `nr13_pdfs` | 1 | `pdfs` | PDF dos certificados padrão fora do `localStorage` (§2-bis) | não — o Supabase guarda o registro completo |
| — | — | fallback em `Map` | `pdfStore` sem IndexedDB (vitest/navegador restrito) | não persiste |

**Store a store no banco da organização:**

| Store | Conteúdo | Natureza |
|---|---|---|
| `dados` | `{ valor, versao, atualizadoEm, dispositivo }` por chave. Carregada INTEIRA no `Map` a cada boot (`cacheLocal.hidratarDoDisco`) | cache |
| `fila` | `ItemFila` — `mutationId`, `op`, `chave`, `valor`, `versaoBase`, `estado`, `tentativas`, `erro` | **estado, não cache** |
| `tombstones` | exclusões locais com versão e data | estado |
| `meta` | marca d'água da hidratação, por org | estado derivável |
| `conflitos` | versão do servidor preservada num conflito | **estado** — a decisão do usuário depende dela |

**Migração de schema (v1→v2 do IDB, 16/08/2026):** puramente **aditiva** — `indexedDB.open`
com versão menor falha, então um aparelho que subiu não volta. A segurança do rollback vem
de o código antigo continuar funcionando com o schema novo (ele apenas ignora a store a
mais). A store `conflitos` nasceu porque as cópias de conflito moravam em `dados`, entravam
no `Map`, apareciam em `chavesComPrefixo` e nunca eram limpas.

**Isolamento:** banco POR organização. `limparCacheDados()` (troca de conta) **não apaga o
IndexedDB** — pode haver pendência lá, e apagá-la em silêncio destruiria inspeção de campo.

**O cofre de fotos é banco separado de propósito:** a foto pendente precisa sobreviver à
troca de conta e ao `apagarBancoLocal()`.

**Não há poda:** `app_storage_mutacoes` (servidor) e a store `tombstones` (local) crescem
sem retenção. `coletar_tombstones(org, dias)` existe no SQL e **nada o chama** (A-15).

---

# 6. Postgres / Supabase

## 6.1 Tabelas

| Tabela | Papel | RLS |
|---|---|---|
| `app_storage` | **fonte de verdade** — chave-valor por org (`org_id`, `chave`, `valor`, `versao`, `atualizado_em`, `dispositivo`, `deletado_em`, `mutado_em_cliente`) | sim |
| `app_storage_excluidos` | tombstones permanentes (piso de versão à prova de relógio adiantado) | select por org |
| `app_storage_mutacoes` | idempotência por `mutationId` | sim |
| `org_sync` | `v2_ativa` por organização | select por org |
| `profiles` | conta: `org_id`, `papel`, `cliente_id`, `role`, `ativo`, `plano`, `acesso_expira_em`, `assinatura_*`, `kiwify_*`, `sessao_token`, `ultima_sync` | própria + admin |
| `login_events` | auditoria de login | própria + admin |
| `kiwify_eventos` | webhook de assinatura, inclusive órfãos | admin |
| `config_global` | flags da plataforma (cadastro automático, checkout) | select |
| `leads_importados` | leads do Admin | admin |

## 6.2 Funções e RPCs

| Objeto | Tipo | Papel |
|---|---|---|
| `aplicar_mutacao_storage(...)` | RPC | **única porta de escrita** da v2. Idempotente por `mutationId`; compara `versao_esperada` sob `FOR UPDATE` |
| `org_atual()` / `papel_atual()` | security definer | derivam org e papel de `auth.uid()` |
| `assinatura_status_org()` / `assinatura_org()` / `assinatura_permite_escrita()` | — | máquina de estados da assinatura (espelhada em `maquinaEstados.ts`) |
| `acesso_vigente()` | — | prazo do trial |
| `admin_usage_stats()` / `admin_storage_stats()` | security definer + guarda `role='admin'` | observabilidade (Fase 2) |
| `coletar_tombstones(org, dias)` | — | **existe e ninguém chama** |
| `reconciliar_versoes_org(org)` | — | pré-requisito do rollback v2→v1→v2 |
| `definir_v2_org(org, bool)` | — | liga/desliga a v2 |
| `trial_candidatos_purga()` / `purgar_dados_trial()` / `purgar_dados_por_email()` | — | purga do trial |
| `handle_new_user()` | trigger | cria `profiles`; desde 16/08 grava o **papel vindo da metadata** (`perfil_origem.sql`, Fase 0-A) |

## 6.3 Triggers

| Trigger | Tabela | O que impede |
|---|---|---|
| `trg_guardar_app_storage` | `app_storage` | escrita DIRETA quando a org está em v2 (`nr13_escrita_direta_bloqueada`) |
| `trg_guardar_livro_imutavel` | `app_storage` | editar/apagar/reordenar/forjar entrada do Livro. Porta de manutenção: `set local nr13.manutencao='1'` |
| `trg_proteger_campos_sensiveis` | `profiles` | usuário alterar o próprio `papel`/`org_id`/`cliente_id`/`role` |
| `trg_proteger_campos_assinatura` | `profiles` | usuário estender a própria assinatura |
| `trg_definir_org_padrao` | `profiles` | `org_id := id` quando nulo |
| `trg_garantir_org_sync` | `profiles` | cria a linha de `org_sync` (org nova nasce em v2) |
| `on_auth_user_created` | `auth.users` | dispara `handle_new_user` |

## 6.4 Índices em `app_storage`

| Índice | Serve |
|---|---|
| `app_storage_org_chave_uidx (org_id, chave)` unique | identidade |
| `app_storage_org_idx (org_id, chave)` | lookup por chave |
| `app_storage_deletado_idx (org_id, deletado_em)` | varredura de tombstone |
| **`app_storage_org_atualizado_idx (org_id, atualizado_em, chave)`** | **a hidratação incremental** — criado na Fase 1 (16/08); antes dele todo boot varria a organização inteira |

## 6.5 RLS — matriz vigente

| Operação | Regra |
|---|---|
| `select` em `app_storage` | `org_id = org_atual()` **e** `papel_atual() in ('mestre','gerente','funcionario')` — **fail closed** para `cliente` (`portal_policies.sql`, Fase 0-B) |
| `insert`/`update`/`delete` em `app_storage` | mesmos três papéis **e** `acesso_vigente()` **e** `assinatura_permite_escrita()` |
| `select` no bucket `inspecao` | primeira pasta = `org_atual()` **e** papel interno |
| `insert`/`delete` no bucket | idem |
| `profiles` | própria linha, ou `is_admin()` |

---

# 7. Supabase Storage

**Um bucket, privado: `inspecao`** (`fotos.ts:32`).

**Caminho:** `<org_id>/<escopo>/<uuid>.<ext>` — a primeira pasta É a organização, porque a
policy compara `storage.foldername(name)[1]` com `org_atual()`. Mudar essa posição desliga
o isolamento.

| Escopo | Conteúdo | Quem grava | Onde a referência vive |
|---|---|---|---|
| `<tag>` / escopos de foto | fotos de equipamento e de campo | `fotos.salvarFoto` | `nr13_fotos_<TAG>.ref`, container `nr13_docs_` |
| `relatorios` | **PDF do relatório finalizado** | `artefatoRelatorio.publicarArtefato` | `nr13_rel_<id>_<TAG>.pdfRef` + `sha256` |
| `assinaturas` | rubricas, **endereçadas por conteúdo (SHA-256)** | `livroAssinatura` | `assinaturaRef` na entrada do livro |
| `certificados` | PDF dos instrumentos padrão | `rastreabilidadeService` | `nr13_rastreab_<id>` |
| componentes / prontuário do fabricante | fotos de válvula/manômetro, PDF do fabricante (até 8 MB) | `componentesService`, `ProntuarioFabricante` | `fotoRef` / `pdfRef` |

**Obtenção da URL — dois caminhos, decididos pelo papel** (`fotos.ts:324`):

```
urlAssinada(path)
  ├─ cache em memória (TTL menos margem)
  ├─ se ehCliente()  → Edge portal_arquivo  (TTL 300 s)   ← SEM fallback para o SDK
  └─ senão           → storage.createSignedUrl (TTL 3600 s)
```

`resolverFoto` (`fotos.ts:355`) tenta nesta ordem: **blob local → URL assinada → base64
legado**. `baixarFoto` (`fotos.ts:384`) idem, com o mesmo desvio pela Edge para o cliente.

**Offline:** o blob vai para o cofre **antes** da tentativa de upload; falhar é normal e não
é erro de usuário; a fila retoma em `online` **e** `visibilitychange` (`fotos.ts:461`). Quem
grava um registro que aponta para arquivo consulta `arquivoPendente(path)`, **nunca**
`navigator.onLine`.

**Base64 persistente como fallback: SIM, e ele nunca é retomado** (A-10). Nos três caminhos
migrados (`rastreabilidadeService`, `componentesService`, `ProntuarioFabricante`) o `catch`
grava o base64 no `app_storage`, e não existe varredura que recupere depois. O baseline de
16/08 mede a consequência: **81 % do conteúdo de `app_storage` é base64**; na maior
organização real, 79 % (2,43 MB de 3,06 MB).

**Órfãos:** `excluirVaso` e `excluirRelatorio` não conhecem arquivo nenhum; `removerFoto`
engole a falha de propósito. Não há inventário (A-06).

---

# 8. Portal do Cliente

## 8.1 Fluxo atual

```
login (conta papel='cliente')
  └─> carregarPerfil() → nr13_papel='cliente', nr13_org_id (= org do INSPETOR), nr13_cliente_id
RotaProtegida
  ├─ iniciarArmazenamento()          (abre IDB, sem rede)
  └─ NÃO chama lerTudo()             ← Fase 0-B
RotaCliente → PortalLayout
  └─> portalService.carregarDadosPortal()
        └─> Edge portal_cliente (service_role)
              1. select chave,valor from app_storage where org_id=X and chave like 'nr13\_emp\_%'
              2. TAGs cujo emp.clienteId == perfil.cliente_id
              3. select chave,valor from app_storage where org_id=X   ← SEM FILTRO, paginado
                 filtra em memória: globais liberadas | nr13_rastreab_* | endsWith('_'+TAG)
        ├─> semearCachePortal(chaves)  → deposita no Map (é daqui que a UI lê)
        └─> localStorage.setItem por chave  → para os templates em iframe
              (falha de cota agora é CONTADA e reportada, não engolida)
Arquivos
  └─> FotoImg / VisualizadorPdf → fotos.urlAssinada → ehCliente() → Edge portal_arquivo
        └─ autoriza por VÍNCULO (o path precisa estar referenciado por recurso do cliente),
           nunca por pasta; "não existe" e "não é seu" devolvem a MESMA resposta (D-26)
```

## 8.2 A arquitetura da Fase 0 continua valendo?

**Sim, e em cinco camadas independentes** — verificado no código:

| Camada | Onde | Estado |
|---|---|---|
| Policy de `app_storage` fail-closed por papel | `portal_policies.sql:76` | presente no repo; aplicação registrada em `docs/medicoes/` (Fase 0-B, 16/08) |
| Policy do bucket fail-closed por papel | `portal_policies.sql:86` | idem |
| Cliente não hidrata a organização | `RotaProtegida.tsx` | no código |
| Todo arquivo do cliente sai pela Edge, **sem fallback para o SDK** | `fotos.ts:302` (a ausência do fallback é comentada como deliberada) | no código |
| Papel de roteamento desacoplado de `auth` | `papelSessao.ts` | no código; documentado como **roteamento, não segurança** |

**Leituras diretas que ainda poderiam contornar algo:** nenhuma encontrada no bundle.
`lerRemoto` (`storageV2.ts:499`) **recusa explicitamente** para `ehCliente()`. `Admin.tsx`
lê `profiles`/`login_events`, nunca `app_storage`.

## 8.3 O que continua errado no Portal (registro, sem correção)

1. **A Edge lê a organização INTEIRA a cada abertura** (`portal_cliente/index.ts:82`) para
   entregar uma fração. É o A-02, Fase 4 — não iniciada.
2. **Ela entrega o `RelatorioSalvo` completo.** `nr13_rel_<id>_<TAG>` termina em `_<TAG>`,
   então passa no filtro de sufixo: ~110 KB por relatório, com logo e rubricas em base64
   dentro dos snapshots, quando o cliente precisa do índice e do PDF.
3. **Ela ainda entrega `nr13_historico_relatorios`** (o array legado), filtrado por TAG.
4. **O Portal não tem palco nem IndexedDB de cache**: é o único lugar do sistema onde a cota
   de 5 MB do `localStorage` ainda é o teto operacional.
5. **Relatório LEGADO (sem `pdfRef`) ainda é remontado e re-rasterizado no Portal**
   (`PortalAtivo.tsx:295` → `exportarPdf`). Para relatório com artefato, serve o arquivo.

---

# 9. Geração de relatório — pipeline atual, passo a passo

## 9.1 Onde começa

`Relatorios.tsx:salvarHistorico()` (linha 626). "Salvar" **é** "finalizar".

```
1. drenarPonte(...)                                  ← o que os templates gravaram
                                                       enquanto o relatório era editável
                                                       (medição de espessura, laudo)
2. livroCorte = { sha256 da última entrada lacrada, nº de entradas, em }
                                                     ← NÃO o livro inteiro: seria
                                                       crescimento quadrático
3. gerarPdfBytes('.relatorio-preview', { rastreabilidades:true, documentos, onProgresso })
4. publicarArtefato(bytes, paginas)
5. salvarNoHistorico(relatorio) + adicionarEntradaLivroAuto + vincularLotesPendentes
6. setSomenteLeitura(true)  →  setVersao(v+1)   ← remonta os iframes já com ro=1
```

Falhar em 3 ou 4 **não salva nada**. A ordem de 6 importa: trancar antes de drenar
descartaria o que foi digitado.

> **Nota de deriva documental:** o CLAUDE.md §7-quater fala em `livroSnapshot`; o código
> grava hoje `livroCorte` (sha da última entrada lacrada + contagem), que é mais barato e
> tem o mesmo efeito. O CLAUDE.md está desatualizado neste ponto.

## 9.2 O pipeline de rasterização (`pdfService.gerarPdfBytes`, linha 23)

```
para cada .pagina-relatorio-a4 do DOM:
   iframe.contentDocument.body                        ← o alvo é o BODY do iframe
   aguardarRecursosIframe(doc)                        ← fontes + imagens prontas
   html2canvas(alvo, {
     scale: 2,                                        ← bitmap ~1588 × 2245 px
     useCORS: true, allowTaint: true,
     height: ALTURA_A4_PX (1123 px = 297 mm @96dpi),
     windowHeight: ALTURA_A4_PX,                      ← corta na altura do A4
     onclone: normalizarCloneParaCanvas               ← rede de segurança do html2canvas
   })
   pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
   await setTimeout(0)                                ← devolve fôlego ao navegador
```

**Não sobra vetor nenhum.** Texto, tabelas, linhas, fórmulas e números viram pixels.
`garantirFonteInterHost()` roda antes do laço: o html2canvas MEDE no iframe (que tem a
Inter) e DESENHA no canvas do documento pai — sem re-registrar a fonte lá, o `fillText` cai
em fallback mais largo e o texto sai sem espaços.

| Pergunta | Resposta, hoje |
|---|---|
| Resolução / scale | `scale: 2` — ~192 dpi efetivos |
| Formato e qualidade | JPEG **0,95**, uma imagem por folha A4 |
| Fotos | já estão dentro do template, vindas do palco como **dataURL** (degradáveis) |
| Assinaturas | carimbo sobreposto por `public/rel-assinatura.js` (posição `absolute`, não empurra conteúdo); a rubrica vem do snapshot `meta.assinantes` em base64 |
| Croqui | SVG lido de `nr13_croqui2d_<TAG>`, rasterizado junto com a folha |
| Anexos PDF | `anexarRastreabilidades` (**pdf-lib**) mescla os certificados padrão ao FINAL dos bytes já gerados |
| Onde o SHA é calculado | `artefatoRelatorio.sha256Hex` — `crypto.subtle`, exige contexto seguro; erro em vez de hash falso |
| Quando o upload ocorre | dentro de `publicarArtefato`, ANTES de gravar o histórico |
| `pdfRef` persistido | no passo 5, junto com `sha256`, `geradoEm`, `paginas`, `pdfPendente` |
| Se o upload falhar | o blob fica no cofre local, `pdfPendente = true` (vem de `arquivoPendente`, **não** de `navigator.onLine`); o relatório é salvo com essa marca |
| Se `gerarPdfBytes` falhar | **nada é salvo** — o relatório continua editável, com a mensagem de erro |
| Offline | funciona: PDF gerado localmente, blob no cofre, upload enfileirado |

**Custo medido em produção (16/08):** 14 PDFs ocupam **91 MB dos 110 MB** do bucket — 83 %
do armazenamento em 6 % dos arquivos. **Média de 6,6 MB por relatório.**

## 9.3 Templates

41 arquivos HTML estáticos: **29** em `public/arquivos-inspecao/` e **12** em
`public/arquivos-prontuario/`. Cada um lê `localStorage` de forma **síncrona** no
`DOMContentLoaded`. Scripts compartilhados: `sb-storage.js` (ponte de escrita),
`rel-cabecalho.js`, `rel-empresa.js`, `rel-assinatura.js`, `pront-assinatura.js`,
`pront-footer.js`.

É essa leitura síncrona que **obriga** o palco a existir, e é a raiz de A-04 e A-12.

## 9.4 O palco (pré-condição da geração)

`usePalcoDocumento(tag, id, opts)` monta antes de qualquer iframe; **nenhum iframe é
renderizado antes de `estado === 'pronto'`** — documento meio montado sai impresso com
folha faltando e ninguém percebe.

| Parâmetro | Valor |
|---|---|
| Orçamento | 3.400 KB − 32 KB de margem = **3.368 KB por documento** |
| Teto por imagem | 110 KB **do arquivo** (não da string base64) |
| Degradação | q0,60 → 0,45 → 0,35 → largura 900 → 700 → 560 |
| Trava | dono exclusivo por aba, TTL 60 s, renovada a cada 20 s, liberada em `pagehide` |
| Materialização | tudo-ou-nada, com restauração dos valores anteriores |
| Documento arquivado | `pular: true` — não monta palco nenhum |
| Cobertura | `palco.varreduraTemplates.test.ts` varre `public/` e quebra se surgir chave nova sem cobertura |

---

# 10. Visualização de PDF — abre o arquivo ou regenera?

| Caminho | Relatório COM `pdfRef` | Relatório LEGADO (sem `pdfRef`) |
|---|---|---|
| Gerar pela 1ª vez (`salvarHistorico`) | rasteriza (é a emissão) | — |
| Visualizar no histórico (`Relatorios.visualizar`, l. 432) | **A** — `VisualizadorPdf` serve o arquivo; palco pulado; nada é regravado | **B** — regrava `nr13_relatorio_meta_atual` + dados de campo e remonta os iframes |
| Imprimir (`prepararEImprimir`, l. 211) | **A** — `imprimirPdfArquivado` | **B** — `imprimirRelatorio` rasteriza para `#print-root` |
| Baixar (`baixarPdf`, l. 583) | **A** — `baixarPdfArquivado` | **B** — `exportarPdf` rasteriza |
| Portal — visualizar (`PortalAtivo.abrirRelatorio`, l. 195) | **A** — não grava nada | **B** — remonta |
| Portal — imprimir/baixar | **A** | **B** |
| Prontuário (todas as rotas) | — | **sempre B** — o prontuário **não tem artefato**; é remontado e rasterizado toda vez |
| Livro de Registro completo | — | **sempre B** — `exportarPdfLivroCompleto` rasteriza blocos |
| Certificado de calibração | — | **sempre B** |

**Resposta direta à pergunta 10:** existe **um** caminho em que um relatório finalizado
ainda é remontado — o **relatório legado**, e isso é decisão consciente: não há retrofit
automático porque gerar o PDF hoje produziria um documento com os dados de HOJE carimbado
como "o artefato daquela emissão". Prontuário, Livro e Certificados **nunca** foram
artefato: são sempre regenerados. Para o relatório com `pdfRef`, todos os caminhos servem o
arquivo — inclusive no Portal.

`VisualizadorPdf` obtém o blob por `baixarArtefato` (**cofre local antes do bucket**), cria
`URL.createObjectURL` e o exibe em `<iframe>`; onde `navigator.pdfViewerEnabled === false`
(Chrome do Android), cai em cartão com botões em vez do quadro.

---

# 11. Offline — o que funciona de verdade

| Recurso | Funciona offline? | Por quê |
|---|---|---|
| Abrir o app | **sim** | service worker serve o app shell |
| Login | **não** | exige Supabase Auth. Sessão já existente sobrevive |
| Listar/abrir equipamentos | **sim** | `lerTudo` devolve o snapshot do Map (v1 devolvia `{}`) |
| Criar/editar equipamento | **sim** | grava no IDB + fila; sobe depois |
| Inspeção (checklists, formulários) | **sim** | mesmo caminho; autosave a cada 1 s |
| Tirar foto em campo | **sim** | blob no cofre; path definitivo decidido **antes** da rede |
| Ver foto já tirada neste aparelho | **sim** | o blob permanece no cofre depois do upload (cache de leitura) |
| Ver foto de OUTRO aparelho | **não** | exige URL assinada |
| Gerar relatório (PDF) | **sim** | rasterização é 100 % client-side; upload enfileirado, `pdfPendente=true` |
| Abrir relatório finalizado que este aparelho gerou | **sim** | cofre local |
| Abrir relatório finalizado de outro aparelho | **não** | precisa baixar do bucket |
| Prontuário / Livro / Certificado | **sim** (dados) | tudo vem do Map; imagens dependem do cofre |
| Portal do Cliente | **não** | depende da Edge a cada abertura; não tem cache próprio |
| Sincronizar | automático | `online` **e** `visibilitychange`, nas duas filas |

**O que apenas APARENTA funcionar — achado desta auditoria:**
`contarFotosPendentes()` (`fotos.ts:264`) existe, é exportada e **nenhuma tela a consome**.
O selo da topbar (`SyncStatus`) e a página `/pendencias` contam **apenas mutações de dados**
(`storage.contarPendencias` → `sync.listarPendentes`). Consequência: um relatório salvo
offline (PDF de ~6,6 MB no cofre, `pdfPendente=true`) e uma inspeção com 20 fotos não
enviadas **não aparecem em lugar nenhum da UI**. O dado está a salvo — o usuário é que não
tem como saber que ainda não subiu. É a mesma classe de defeito que o
`storage.contarPendencias` corrigiu para a fila de dados em agosto.

---

# 12. Service worker / PWA

| Item | Estado |
|---|---|
| Arquivo | `public/sw.js`, cache `nr13-cache-v8` |
| App shell | `/`, `/index.html`, `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png` |
| Navegação (HTML) | **network-first** com `{cache:'no-cache'}`, fallback `/index.html` |
| Templates (`/arquivos-inspecao/`, `/arquivos-prontuario/`) | **network-first** — os URLs não têm hash; cache-first prenderia uma folha corrigida para sempre |
| `/assets/` (build Vite, nome com hash) | **cache-first** — imutável |
| Externos (Supabase) | **não intercepta** |
| Atualização | `skipWaiting` + `clients.claim`; caches de versão anterior apagados no `activate` |
| Relação com deploy | o nome do cache **precisa** subir quando o app shell muda (o v8 existe porque os ícones do PWA trocaram e o atalho instalado mantinha o ícone velho) |

**Histórico que explica o desenho:** o v5 fazia cache-first de qualquer asset da origem
(inclusive os módulos sem hash do dev server) e edições nunca chegavam ao navegador; o v7
precisou de `{cache:'no-cache'}` porque o Caddy não manda `Cache-Control` e o cache
heurístico do navegador devolvia `rel-assinatura.js` velho **sem ir à rede**.

---

# 13. Autenticação e papéis

## 13.1 Origem de cada campo

| Campo | Origem primária | Espelho local | Quem impede a fraude |
|---|---|---|---|
| `org_id` | `profiles.org_id`; `trg_definir_org_padrao` põe `= id` quando nulo | `nr13_org_id` | `org_atual()` (security definer) + `trg_proteger_campos_sensiveis` |
| `papel` | `profiles.papel`; desde 16/08 gravado por `handle_new_user()` a partir da **metadata do signUp/createUser** (Fase 0-A) | `nr13_papel` | `papel_atual()` nas policies + trigger de proteção |
| `cliente_id` | `profiles.cliente_id`, escrito pela Edge `org_admin` | `nr13_cliente_id` | idem |
| `role` (plataforma) | `profiles.role` | `nr13_role` | `is_admin()` |
| assinatura | RPC `assinatura_org()` | `nr13_assinatura_status`/`_ate` | RLS de escrita |

**A janela fail-open foi fechada:** antes, `handle_new_user()` inseria o perfil **sem**
`papel`, caindo no `default 'mestre'`, e a Edge `org_admin` corrigia **depois** do
`createUser()`. Entre um e outro havia um perfil mestre com `org_id` próprio.

## 13.2 Matriz de acesso vigente

| Papel | Lê `app_storage` | Escreve | Lê bucket | Rota |
|---|---|---|---|---|
| `mestre` | sim (org) | sim | sim | sistema |
| `gerente` | sim (org) | sim | sim | sistema (módulos por `nr13_permissoes_`) |
| `funcionario` | sim (org) | sim | sim | sistema (módulos) |
| `cliente` | **não** (fail closed) | **não** | **não** | só `/portal/**` |
| `admin` (plataforma) | não lê `app_storage` — usa RPC `security definer` | `profiles` | não | só `/admin` |

**Camadas de bloqueio de escrita, e as três existem:** RLS no Postgres (`papel_atual()` +
`acesso_vigente()` + `assinatura_permite_escrita()`), gate no bundle
(`gateEscrita.bloqueadoParaEscrita`, **fail-closed em data corrompida**), e o gate do iframe
(`sb-storage.js` com `ro=1`).

**Sessão única:** `profiles.sessao_token` + heartbeat (`auth.ts:344`) derruba o aparelho
anterior.

---

# 14. Pontos de legado ainda vivos

| # | Legado | Onde | Ainda necessário? |
|---|---|---|---|
| L-1 | `storageV1.ts` inteiro (500 linhas) + `aliviarCacheLocal` | `storage.ts:105` | só como rollback. Nenhuma org nova nasce em v1 |
| L-2 | `nr13_historico_relatorios` (array único) | `historicoRelatorios.legado()` | leitura/fallback. Baseline de 16/08: `relatorios_legado = 0` em **todas** as orgs — a migração terminou; falta só o tempo de guarda |
| L-3 | `nr13_conflito_<chave>__<ts>` na store `dados` | `familiasChave.PREFIXO_CONFLITO_LEGADO` | nada novo grava desde 16/08; `migrarConflitosAntigos` converte |
| L-4 | `nr13_fila_sync` (fila da v1) | `migracaoV1.adotarHerancaV1` | adotada no primeiro `lerTudo` bem-sucedido |
| L-5 | `nr13_croqui3d_<TAG>` (PNG do 3D removido em 11/07) | `PRONT-ULTRASSOM.html` | só fallback de leitura |
| L-6 | `tags[]` em `nr13_rastreab_` | `rastreabilidadeService` | substituído pela injeção por tipo |
| L-7 | `nr13_assinantes_rel_<TAG>` | `rel-assinatura.js` | fallback de relatório sem snapshot |
| L-8 | base64 em `pdfBase64`/`src`/`foto` | vários | fallback ativo e **nunca retomado** (A-10) |
| L-9 | Relatórios sem `pdfRef` | `Relatorios`, `PortalAtivo` | remontados por desenho — não há retrofit |
| L-10 | `nr13_pront_fab_`, `nr13_docs_` fora do palco | `palco.FORA_DO_PALCO` | correto |
| L-11 | `nr13_inspecao_atual` **e** `nr13_injecao_atual` (mesmo conteúdo, 2 chaves) | `gravarInspecaoOrigemAtual` | duplicação obrigatória enquanto os templates não forem uniformizados (A-09) |

---

# 15. Riscos encontrados

Ordenados por severidade. Os que já constavam da auditoria de 15/08 são marcados; os
**novos** são desta passagem.

| # | Risco | Severidade | Evidência |
|---|---|---|---|
| R-1 | **Uploads pendentes são invisíveis na UI.** `contarFotosPendentes()` não tem consumidor; selo e `/pendencias` contam só mutações de dados. Relatório de 6,6 MB e fotos de campo podem estar só no aparelho sem nenhum sinal | 🟠 **NOVO** | `fotos.ts:264` sem call site; `SyncStatus.tsx:3` |
| R-2 | **Autofill de calibração lê `localStorage` direto.** `formPadrao()` chama `empresaAutoFill()` fora do palco → empresa/endereço vazios na v2, em silêncio | 🟡 **NOVO** | `Calibracoes.tsx:87,97` × `palco.ts:134` (`nr13_minha_empresa` é chave de palco) |
| R-3 | **Indicador de croqui depende de o palco já estar montado** | 🟡 **NOVO** | `Prontuarios.tsx:281` |
| R-4 | **Autosave reescreve `nr13_docs_<TAG>` inteira a cada 1 s** — uma mutação por segundo carregando todos os containers do equipamento | 🟡 **NOVO** | `useAutosaveFormulario.ts:27` → `inspecaoService.ts` |
| R-5 | Edge do Portal varre a organização inteira e devolve `RelatorioSalvo` completo + array legado | 🔴 A-02 | `portal_cliente/index.ts:82` |
| R-6 | PDF 100 % raster: 6,6 MB por relatório; 83 % do bucket em 6 % dos arquivos | 🔴 A-04 | `pdfService.ts:42`; baseline 16/08 |
| R-7 | 81 % do conteúdo de `app_storage` é base64, e o fallback nunca é retomado | 🟠 A-05/A-10 | baseline 16/08 |
| R-8 | Arquivo do bucket nunca é removido quando o dono é excluído; não há inventário de órfãos | 🟠 A-06 | `storageV2.excluirVaso`, `fotos.removerFoto` |
| R-9 | `app_storage_mutacoes` e a store de tombstones crescem sem poda; `coletar_tombstones` existe e **ninguém chama** | 🟡 A-15 | `armazenamento_v2.sql:414` |
| R-10 | Nenhuma listagem virtualiza; `listarVencimentos` recalcula a cada `focus` da janela | 🟠 A-07 | `vencimentos.ts:195` |
| R-11 | Uma única resolução de foto (1200 px) serve miniatura de 40 px e folha A4 | 🟠 A-08 | `fotos.ts:110` |
| R-12 | Fotos de campo entram no palco como base64; degradar custa qualidade em documento assinado | 🟠 A-12 | `palco.ts` |
| R-13 | Prontuário, Livro e Certificados **não têm artefato**: são regenerados a cada abertura e mudam com o dado vivo | 🟠 **NOVO (extensão do A-04)** | tabela da seção 10 |
| R-14 | Não existe massa de escala nem ambiente de teste; todo número veio de conta real depois do problema | 🟡 A-17 | — |
| R-15 | `kiwify_subscription_id` nulo em todas as contas: "cliente pagante" depende de liberação manual | 🟠 | PENDENCIAS.md §0.4 |
| R-16 | Edge `purga_trial` no ar é a versão antiga (responde 500, fail-closed) | 🟡 | PENDENCIAS.md §0.3 |

---

# 16. Estado ATUAL × DESEJADO × GAPS

| Objetivo de arquitetura | Atual | Gap | Fase do roteiro |
|---|---|---|---|
| Postgres = dado estruturado + referências leves | 🟠 81 % do conteúdo ainda é base64 | rubrica, logo, fallback não retomado | 6, 7 |
| Bucket = todo arquivo pesado | 🟢 feito | thumbnails; inventário de órfãos | 5, 10A |
| IndexedDB = cache/offline em Blob | 🟢 feito | poda de mutações | 10B |
| localStorage = só dado pequeno | 🟠 sistema sim, **Portal não** | Portal sem palco/IDB | 4 |
| Base64 persistente ≈ zero | 🟠 | idem primeira linha | 6, 7 |
| PDF vetorial/híbrido | 🔴 não iniciado | tudo; precisa de piloto de UMA folha | 11, 12 |
| Foto otimizada antes de persistir | 🟢 feito (1200 px q0,7; média real 87,7 KB) | variante de miniatura; EXIF explícito; teto de altura | 5 |
| Histórico imutável, versionado e leve | 🟢 feito | snapshots ainda copiam imagem | 7 |
| Listagem = índice leve + paginação | 🟠 metade | virtualização + memo | 9 |
| Arquivo pesado sob demanda | 🟢 feito (`FotoImg` + IntersectionObserver) | — | — |
| Sincronização incremental | 🟢 **feita e com índice** (Fase 1, 16/08) | — | — |
| Conflito com decisão do usuário | 🟢 **feito** (Fase 3, 16/08) | — | — |
| Observabilidade | 🟠 **passou de inexistente a real** (Fase 2, 16/08) | métricas de geração de PDF e de pendência de arquivo | — |
| Compatibilidade com dado antigo | 🟢 feito | — | — |
| Migração segura e idempotente | 🟢 feito | — | — |
| Isolamento entre organizações | 🟢 íntegro | — | — |
| **Isolamento ENTRE CLIENTES** | 🟢 **fechado** (Fase 0/0-B, 16/08) | — | — |
| Visibilidade do trabalho pendente | 🟠 dados sim, **arquivos não** | R-1 | — |

## O que já foi entregue desde a auditoria de 15/08

Verificado por commit e por documento de validação em produção:

| Fase | Tema | Achado | Estado |
|---|---|---|---|
| **0-A** | origem do papel na criação de perfil | D-24 | ✅ validada em produção (16/08) |
| **0-B** | isolamento do Portal (policies fail-closed + Edge `portal_arquivo` + cliente não hidrata) | A-01 | ✅ validada em produção (16/08) |
| **1** | índice `(org_id, atualizado_em, chave)` | A-03 | ✅ aplicado (16/08) |
| **2** | observabilidade + baseline | A-11 | ✅ aplicado; baseline em `2026-08-16-baseline-inicial.md` |
| **3** | conflitos: store própria, comparação e decisão em `/pendencias` | A-14 | ✅ aplicado (16/08) |

## Fases NÃO iniciadas

**4** (Portal: arquitetura de leitura) · **5** (fotos: thumbnail/EXIF/altura) · **6**
(recuperar o fallback base64) · **7** (logo e rubrica por conteúdo — feito **só** no Livro) ·
**8** (massa de escala) · **9** (listas grandes) · **10A/10B** (higiene e retenção) ·
**11/12** (PDF vetorial) · **13** (teste de carga).

---

# 17. Recomendação de próxima alteração

**Antes de qualquer fase: quatro correções pequenas e independentes, que esta auditoria
encontrou e que não pertencem a fase nenhuma.**

1. **R-1 — tornar visível o arquivo pendente.** Somar `contarFotosPendentes()` ao selo da
   topbar e listar os arquivos em `/pendencias`. É a única classe de trabalho do usuário que
   hoje pode estar só no aparelho **sem nenhum sinal na tela** — exatamente o defeito que o
   sistema já corrigiu para a fila de dados. Custo baixo, risco baixo.
2. **R-2 e R-3 — trocar os dois `localStorage.getItem` diretos por `storage.ler()`.** Duas
   linhas; elimina uma regressão silenciosa da v1 para a v2.
3. **R-4 — medir a granularidade do autosave** antes de mexer: quantas mutações uma inspeção
   real gera.

**Depois disso, a fase seguinte do roteiro é a 4 (Portal: arquitetura de leitura)**, e a
ordem do plano macro já a autoriza: ela depende das Fases 0 e 2, ambas concluídas. É o maior
ganho isolado de egress da auditoria, é área isolada (sem escrita, sem dado do inspetor em
jogo) e a policy fail-closed da Fase 0-B é a rede de segurança contra qualquer regressão na
Edge.

**Sequência sugerida dentro da Fase 4**, a partir do que este mapeamento mostrou: resolver as
TAGs primeiro e consultar **só** as chaves daquelas TAGs; parar de entregar `nr13_rel_`
completo (índice + `pdfRef` bastam, porque o Portal já serve o arquivo para relatório com
artefato); parar de entregar `nr13_historico_relatorios`.

> **PARADA OBRIGATÓRIA.** Nada acima foi implementado. Nenhum arquivo de código, SQL,
> template ou deploy foi alterado nesta auditoria.
