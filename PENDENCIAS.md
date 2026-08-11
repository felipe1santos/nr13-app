# PENDÊNCIAS DO SISTEMA

> **AVISO (para o Claude e para mim):** este arquivo é a lista viva de pendências.
> Conforme cada item for concluído, **REMOVER o item deste arquivo** (não só marcar) e
> commitar. Quando uma seção esvaziar, remover a seção. Quando o arquivo esvaziar,
> deletar o arquivo. Ao trabalhar numa pendência daqui, verificar antes se ela ainda
> procede (o código pode ter mudado).

---

> **MAPA DE ARMAZENAMENTO: `docs/ARMAZENAMENTO-LIMITES.md`** — os quatro limites (o de 5 MB
> do navegador, o de 3.368 KB do palco, o egress do Supabase e o IndexedDB), o peso medido de
> cada família de chave, o que já foi resolvido e o que falta, em ordem de risco. Consultar
> antes de mexer em qualquer coisa que grave arquivo.

## 0. PRÓXIMOS PASSOS COMBINADOS (sessão de 10-11/08/2026)

O que ficou em aberto depois de resolver o sumiço de equipamentos, o login e o peso do
banco. Em ordem de urgência.

### 0.1 — Decisão da cota do Supabase (TEM PRAZO: 16/08/2026)

- [ ] **Decidir entre pagar ~US$ 25 por um mês ou arriscar a restrição.**

  Estado em 11/08: egress em **6,3 GB contra 5 GB** do plano Free, ciclo de 20/jul a
  20/ago, restrição marcada para **16/08**. Depois dela as requisições ao projeto
  respondem **402** e o app sai do ar para os 27 clientes — inclusive o `cmam`.

  O ponto que decide: **o contador é acumulativo e só zera em 20/08.** As correções desta
  sessão (hidratação incremental + fotos no bucket) resolvem o consumo FUTURO — a partir do
  ciclo de 20/08 o Free deve sobrar com folga —, mas não desfazem o que já foi gasto. Ou
  seja, no dia 16 a organização ainda estará acima da cota, faça-se o que fizer.

  Caminhos: pagar um mês e voltar ao Free depois (o Supabase permite), ou aceitar a janela
  de 4 dias (16→20/08) com o app possivelmente fora do ar.

### 0.15 — Rodar `supabase/v2_por_default.sql` (organização nova nascia em v1)

- [ ] **SQL Editor do Supabase, idempotente.** Descoberto em 11/08: `org_sync.v2_ativa` era
      `not null default false` e o `ativar_v2_todas_orgs.sql` foi um tiro único sobre as 27
      orgs daquele dia. **Toda conta criada depois — todo trial, todo cliente novo — nascia
      na v1**, com `localStorage` como banco e o teto de 5 MB: o sumiço de equipamentos de
      volta assim que a conta crescesse.

  O arquivo põe `default true`, faz backfill de quem ficou sem linha e cria
  `trg_garantir_org_sync` em `profiles` (AFTER, com exceção engolida — cadastro de usuário
  nunca falha por causa dessa linha). Traz as consultas de conferência no fim.

  **O front já não depende disso** (`flag.ts`: consulta que responde sem linha = org nova =
  v2), então não há janela de risco como no `ativar_v2_todas_orgs.sql`. Este SQL fecha o
  outro lado: com a linha gravada, a guarda `trg_guardar_app_storage` volta a proteger a
  organização nova contra aparelho com bundle antigo.

### 0.2 — Migrar as fotos legadas das contas pagantes pesadas

> **`gabriel.dadona` FEITO em 11/08/2026: 6.542 KB → 1.377 KB (−79%).** Migrado pelo
> NAVEGADOR, com a sessão do próprio usuário logado (fetch na REST + Storage + a RPC
> `aplicar_mutacao_storage`), o que dispensa a senha que o script de linha de comando exige.
> Falta só `componentes_cal` (1259 KB), que depende do deploy do código novo.

- [ ] **`gabriel.dadona@gmail.com` (~6,7 MB) e `engyuricesar@gmail.com` (~6,5 MB).**

  Mesmo caso do `cmam`, que saiu de 8,00 MB para 3,06 MB. Ferramenta pronta e já validada
  de ponta a ponta: `scripts/migrar-fotos-legadas.mjs`.

      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs simular
      # depois de conferir o ganho:
      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs migrar-todas
      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs migrar-docs

  **Bloqueio:** o script entra na conta para migrar, porque a RLS do `app_storage` é por
  organização — não existe caminho de admin. Precisa da senha de cada uma.

  **ALCANCE REAL DO SCRIPT (medido no banco do `gabriel` em 11/08):** ele varre só os
  prefixos `nr13_fotos_` e `nr13_docs_`, e dentro deles troca só os campos `src` e `base64`.
  Na conta dele isso recupera ~1,5 MB (`nr13_docs_` 863+640 KB, `nr13_fotos_` 184 KB) e
  **não alcança**:

  | chave | KB | por quê |
  |---|---|---|
  | `nr13_rastreab_<id>` (2 registros) | 5451 + 1941 | PDF de certificado, não é foto |
  | `nr13_componentes_cal_<TAG>` | 2518 | campo se chama `foto`, não `src`/`base64` |

  Somar o prefixo de `componentes_cal` NÃO basta: `hidratarFotosDoBucket` devolve a imagem
  escrevendo em `src`/`base64`, e a tela de Calibrações lê `c.foto` síncrono — migrar sem
  mexer nos dois lados deixa os cards de componente sem imagem. É trabalho da Fase 2.

  Roteiro que funcionou no `cmam`, vale repetir: backup → `simular` → migrar UMA TAG →
  conferir na tela → resto → gerar um relatório e comparar o número de imagens com o de
  antes.

### 0.25 — Três buracos de armazenamento ainda abertos (detalhe em `docs/ARMAZENAMENTO-LIMITES.md`)

- [ ] **RISCO Nº 1 — Degradação do palco só enxerga `nr13_fotos_`.** Medido em produção
      DEPOIS da migração: o palco do relatório do gabriel foi de 1.449 para **2.780 KB**
      contra 3.368 — 83% do orçamento, sem foto nova nenhuma. Migrar para o bucket alivia o
      banco e APERTA o palco, porque `hidratarFotosDoBucket` grava a imagem em `src` E
      `base64` (obrigatório: CAPA lê um, as folhas de fotos leem o outro, e foto nova chega
      só com `ref` — ver `palco.fotos.test.ts`, que existe para impedir a "otimização"). As fotos de campo chegam por
      `nr13_inspecao_atual`/`nr13_injecao_atual` (640 KB cada, duplicação obrigatória) e
      NUNCA são recomprimidas. Quando o documento não couber, o sistema recomprime 184 KB
      e ignora 1280 KB. Fix: tornar `recompressorFoto.ts` recursivo sobre `src`/`base64`
      (o caminhador já existe em `hidratarFotosDoBucket`) e somar as duas chaves em
      `ehChaveDeFoto`. **Migrar as fotos para o bucket NÃO resolve isto** — a hidratação
      re-infla a imagem no palco na hora de montar o documento.

- [ ] **Deploy + migração do `componentes_cal` e do `pront_fab`.** O código dos dois ficou
      pronto em 11/08 (`fotoRef` e `pdfRef`). **NESTA ORDEM, sem inverter:** deploy primeiro,
      migração depois — bundle que não sabe ler a referência mostra o campo vazio e o usuário
      conclui que a foto sumiu. Na conta do gabriel restam 1259 KB em `componentes_cal`.

- [ ] **Conferir o Portal do Cliente depois do deploy.** O portal passou a resolver refs
      (`FotoImg`), mas a policy `inspecao_leitura` compara a pasta com `org_atual()` — falta
      confirmar em tela que o papel `cliente` recebe a URL assinada. Se não receber, a foto
      degrada para o ícone (não quebra), mas o cliente fica sem ver imagem.

### 0.3 — Automatizar a purga do trial (hoje é manual e funciona)

- [ ] **Redeploy da Edge Function `purga_trial`** com o código atual do repo. A versão no ar
      é a antiga, que lia o segredo de `config_global`; responde 500 e não faz nada
      (fail-closed, seguro). O segredo já está em Edge Functions → Secrets como
      `PURGA_TRIAL_SEGREDO`.

          supabase functions deploy purga_trial --project-ref qqsesrntfvmdxqxrfvmw

      Teste sem apagar nada (`dry=1` é simulação):

          curl -H "Authorization: Bearer <ANON_KEY>" \
            "https://qqsesrntfvmdxqxrfvmw.supabase.co/functions/v1/purga_trial?s=<SEGREDO>&dry=1"

- [ ] **Agendar** em Integrations → Cron: `0 4 * * *`, POST na mesma URL **sem** `dry=1`,
      com o header `Authorization`. Depende de `pg_cron`, que não foi confirmado no Free —
      se não existir, o Cron nativo do painel resolve.

  Enquanto isso: rodar o bloco 4 do `supabase/purga_trial.sql` de tempos em tempos. Foi
  assim que as 13 contas foram limpas em 11/08.

### 0.4 — Webhook da Kiwify não está gravando a assinatura

- [ ] **Investigar por que `profiles.kiwify_subscription_id` está NULO em todas as contas** —
      inclusive no `cmam`, que é cliente real.

  Consequência prática: não existe marcador de cobrança no banco, e "cliente pagante" hoje
  depende de você lembrar de liberar cada um na mão (`ativo = true` + `plano <> 'trial'` +
  sem prazo vencido). É esse critério que o painel Admin e a purga usam.

  Resolver isso torna a classificação automática e à prova de esquecimento. Pode ser que a
  compra não tenha passado pela Kiwify, ou que o parser do webhook não encontre o campo —
  o payload real dela não é público e o parser lê por tentativa (ver §11 do CLAUDE.md).

### 0.5 — App confunde "servidor indisponível" com "conta revogada" e desloga todo mundo

- [ ] **Distinguir os dois casos em `carregarPerfil` / `verificarAcesso` (`src/services/auth.ts`).**

  **O bug:** `carregarPerfil()` lê o perfil no servidor. Se a leitura FALHA (não é que o
  perfil diga algo — é que não deu para lê-lo), `data` fica `null` e a linha

      const ativo = (data?.ativo as boolean) ?? false;

  produz `ativo: false`. Aí `verificarAcesso()` chama `bloqueioEntrada()`, que devolve
  `'inativo'` — o motivo que significa *"conta ainda não liberada pelo administrador"* — e
  executa `logout()`. **O usuário é deslogado por um erro de leitura.**

  O `catch` de `verificarAcesso` já protege o caso de rede caída, mas só pega EXCEÇÃO. Um
  402 (cota estourada), um 500 ou um 429 do PostgREST não lançam: o supabase-js devolve
  `{ error }`, o fluxo segue e cai no logout.

  **Por que importa agora:** se o Supabase aplicar a restrição de cota (ver 0.1), todo
  usuário que abrir o app é deslogado e não consegue voltar, porque o login também depende
  do servidor. E o pior é que seria desnecessário: com a v2, os dados estão no IndexedDB do
  aparelho. Quem continuasse logado veria os equipamentos, criaria coisas novas e
  sincronizaria quando o serviço voltasse — a capacidade existe, o gate de sessão é que a
  joga fora.

  **O fix:** `carregarPerfil` precisa devolver um terceiro estado — algo como
  `indisponivel: true` — em vez de fingir que leu um perfil inativo. `verificarAcesso`
  trata esse estado como offline: mantém a sessão local e NÃO desloga.

  **O cuidado que não pode faltar:** isto não pode virar brecha. Recusa por autorização
  (401/403) continua deslogando — é revogação real. Só indisponibilidade (402, 429, 5xx e
  falha de rede) mantém a sessão. Vale checar o shape real do erro do supabase-js antes de
  escolher o discriminante; `error.status`/`error.code` são o caminho, e o teste tem que
  cobrir os dois lados.

  **Como testar:** interceptar o `fetch` e devolver 402 nas chamadas ao Supabase (é o mesmo
  truque usado para simular offline na validação das fotos), abrir o app já logado e
  confirmar que continua dentro, lendo do IndexedDB, com a fila acumulando. Depois um teste
  com 403 confirmando que aí SIM desloga.

  Vale por si só, independente da cota: protege contra qualquer instabilidade do Supabase.

---

## 1. Deploy manual (feito pelo dono do projeto, fora do código)

- [ ] **Rodar `supabase/acesso_setup.sql`** no SQL Editor do Supabase (idempotente; backfill
      `org_id = user_id` mantém comportamento atual até criar sub-logins). Conferir depois o
      trigger `handle_new_user`: não pode sobrescrever `org_id`/`papel`/`cliente_id`.
- [ ] **Rodar `supabase/admin_stats.sql`** no SQL Editor (idempotente; cria `admin_usage_stats()`
      para o painel Admin — sem isso as colunas de uso mostram "—").
- [ ] **Deploy das Edge Functions** `org_admin` e `portal_cliente` (Dashboard → Edge Functions).
- [ ] **E-mail de troca de senha:** Authentication → Email Templates → "Reset Password" com
      `{{ .Token }}` no corpo (código de 6 dígitos). Exemplo:
      `<h2>Troca de senha</h2><p>Seu código: <b>{{ .Token }}</b></p><p>Expira em 1 hora.</p>`
- [ ] **SMTP próprio** (Authentication → SMTP Settings — Resend/Brevo/etc.). O e-mail embutido do
      Supabase limita ~2 msgs/hora (só teste); sem SMTP os códigos param de chegar em produção.
- [ ] **`VITE_GOOGLE_MAPS_KEY`** no ambiente de deploy (Vercel/Netlify → Environment Variables).
      Sem ela, busca de empresas e mapa do cliente ficam desativados em produção.
- [ ] **Restringir a chave do Google no Cloud Console:** HTTP referrers (domínio do app +
      `http://localhost:*`) e APIs somente **Places API (New)** + **Maps Embed API**; ativar
      essas 2 APIs no projeto. Chave `VITE_*` fica pública no bundle — sem restrição, terceiros
      usam sua cota e geram cobrança.

## 2. Fase 3 — Motor de assinatura

- [ ] **Certificados de calibração** (prontuário, relatório e livro de registro já feitos em
      13/07/2026): aplicar o bloco canônico de assinatura nos CERTIFICADO-CAL-*.html.

## 3. Polimentos opcionais (nada bloqueia; sistema funciona sem)

- [ ] **Croqui 2D — peso de pés/selas:** cálculo de peso só inclui saia; pés/selas ficam de fora
      (a folha avisa em nota). Incluir estimativa por perfil.
- [ ] **Caldeira sem croqui 2D:** editor de croqui é só vaso/autoclave; caldeira mostra "Em Breve"
      no botão do prontuário (e o passo obrigatório do memorial não se aplica a ela).
- [ ] **Campos do ensaio no relatório:** `ULTRASSOM.html` do relatório preserva os campos do
      ensaio agora, mas o formulário de campo não coleta todos (aparelho/série/acoplante/
      cabeçote/velocidade sônica) — conferir `FormularioUltrassom` e completar o que faltar.
- [ ] **Auditoria mobile folha a folha** das telas de inspeção e **revisão de `@media print`**
      em cada template para A4 exato (sugestão antiga do CLAUDE.md §9).
- [ ] **Limpar equipamentos de teste** do ambiente (criados nas sessões de desenvolvimento):
      `CALD-01`, `AUTO-T1` (tem modelo de croqui salvo Ø1200×3000) — excluir quando não precisar mais.

## Armazenamento offline-first (Fase 1) — pendências de deploy

- [x] **Gate de concorrência da RPC — LIBERADO em 05/08/2026, 30/30.** `scripts/testar-concorrencia-rpc.mts` precisa
      rodar com a `service_role` em `.env.teste`. Os dois cenários — duas criações
      simultâneas da mesma chave e duas chamadas com o mesmo `mutationId` — são os
      únicos do gate que não se provam no SQL Editor. **Enquanto não ficarem verdes,
      `definir_v2_org(<org>, true)` não pode ser executado para nenhum cliente.**
      Resultados em `docs/superpowers/plans/resultados-rpc-armazenamento-v2.md`.

- [ ] **Melhoria cosmética da conferência:** `trial_candidatos_purga` em produção ainda é a
      versão sem `having count(s.chave) > 0`, então relista contas já purgadas com 0 KB. O
      arquivo no repo já tem a correção; falta aplicar quando o SQL Editor voltar a abrir.

- [x] **`supabase/fotos_storage.sql` — APLICADO em 11/08/2026.** Bucket `inspecao` criado pelo
      painel (privado) e as 4 policies no ar. Upload, URL assinada, download e isolamento entre
      organizações validados contra produção.

- [ ] **Agendar `coletar_tombstones(<org>, 30)`** (mensal, service_role). A prova da
      exclusão permanece em `app_storage_excluidos`; só o `valor` é removido.

- [ ] **Deploy do front antes de ligar a v2 em qualquer organização nova.** Com a v2 ligada, a
      guarda recusa escrita direta; aparelho com bundle anterior a `13f12ef` para de gravar no
      banco na hora e acumula tudo em `nr13_fila_sync`. Não se perde nada (o código novo adota
      essa fila sozinho), mas fica sem sincronizar até recarregar a página — e é por isso que
      NÃO se pede para o usuário limpar cache/navegador nessa situação.

- [ ] **Descartar pendência definitivamente falha.** `/pendencias` só oferece "Tentar de novo";
      um item recusado com `versao_obsoleta` (chave excluída no servidor por outro aparelho)
      nunca vai ser aceito e fica para sempre exibindo "1 falha". Falta a ação de descartar,
      mostrando o valor local antes de jogar fora.

- [ ] **Rollback**, se preciso: esvaziar a fila nos aparelhos (`/pendencias` →
      "Tentar todas"), `definir_v2_org(org, false)`, `delete from app_storage where
      deletado_em is not null`. Ao REATIVAR, rodar `reconciliar_versoes_org(org)` antes
      — sem isso a primeira edição na v2 é recusada como `versao_obsoleta` para sempre.

- [ ] **Fases 2 e 3** (planos próprios): fotos no bucket `inspecao` (já criado),
      autosave granular por formulário, migração `esquema: 2`.

**Já aplicado em produção em 05/08/2026:** `supabase/armazenamento_v2.sql` (colunas,
`app_storage_excluidos`, `app_storage_mutacoes`, `org_sync`, RPC, trigger de guarda,
coleta e reconciliação). Backup em `app_storage_bkp_20260805`.

**v2 LIGADA PARA AS 27 ORGANIZAÇÕES em 10/08/2026**, depois do deploy do `52e0621` e da
validação em produção com a conta `cmam.caldeiras` (equipamentos na tela, gravação no
banco, ciclo offline→online, conflito de versão, sessão única, login sem erro).

O levantamento que motivou ligar tudo de uma vez — e que vale repetir de tempos em tempos,
porque é ele que revela quem está prestes a quebrar:

| conta | equipamentos | KB |
|---|---|---|
| teste@gmail.com | 12 | 14.118 |
| cmam.caldeiras@gmail.com | 38 | 8.096 |
| gabriel.dadona@gmail.com | 3 | 6.768 |
| engyuricesar@gmail.com | 1 | 6.481 |
| liperoneads@gmail.com | 2 | 5.064 |
| demais 7 contas com dado | 2–4 | ≤ 455 |

As três do meio estavam na v1 acima da cota do `localStorage`, ou seja, no mesmo estado do
`cmam` — e ninguém tinha reportado. **O peso não vem da quantidade de equipamentos e sim
das fotos e PDFs:** `engyuricesar` estourava 6,4 MB com UM equipamento cadastrado.
