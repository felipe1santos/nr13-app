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

## 0-QUATER. INTERFACE (12-13/08/2026) — no ar e validado em produção

Marca própria na sidebar, no favicon e no ícone do PWA (cache do SW em v8, senão o atalho
instalado ficava com o ícone velho). "Meus dados" virou item de menu e saiu do Dashboard.
Lista de vencimentos e histórico de relatórios legíveis com os dados reais do cliente —
os dois só estouraram quando testados com texto de verdade, não com dado curto de teste.
Prazo acima de 60 dias com selo azul. Agenda do Dashboard virou também caderno de
anotações (`nr13_agenda_notas`, global, fora do palco).

Nada aqui sobrou em aberto além do que já está no bloco 0-TER abaixo.

---

## 0-TER. RESPONSIVIDADE MOBILE (12/08/2026) — feito e o que sobrou

Varredura tela a tela em viewport de 390px (Dashboard, Equipamentos, Inspeções + container +
formulário, Relatórios + histórico + visualizador, Prontuários, Calibrações, Certificados,
Livro de Registro + livro aberto, Funcionários, Clientes, Minha Empresa, Acessos, Vencimentos,
Pendências e a ficha do equipamento), medindo estouro pelo retângulo de cada elemento.

Feito: selo do armazenamento v2 virou botão pequeno na topbar (era uma faixa cinza sem CSS
atravessando o topo); sino e instalar-app foram para o menu do círculo de iniciais; histórico
de relatórios, vencimentos, livro e acessos viram cartões no celular; barra do visualizador
numa linha; aviso de rastreabilidade retangular; KPIs do Dashboard sem quebrar a pílula;
Pendências ganhou a folha de estilo que nunca teve.

### O que sobrou deste bloco

- [ ] **Portal do Cliente no celular** — não foi varrido nesta sessão: exige o login do
      cliente (`caioh94@gmail.com`) e a conta de teste local é mestre. As telas do portal
      usam classes próprias (`src/pages/portal/*`), então o que foi corrigido aqui NÃO cobre
      elas automaticamente. Só o visualizador de PDF é compartilhado, e esse melhorou.
- [ ] **PDF em iframe no iOS** — `navigator.pdfViewerEnabled` é `true` no Safari do iPhone,
      mas o iframe mostra só a primeira página e não rola. O botão "Abrir em outra aba"
      resolve na prática; se aparecer queixa, tratar iOS como o Android (cartão em vez de
      quadro).

---

## 0-BIS. ENTREGUE E VALIDADO EM PRODUÇÃO (sessão de 11-12/08/2026)

Tudo abaixo está no ar e foi conferido em tela, na conta `gabriel.dadona`:

- **Arquivos no bucket**: fotos, containers, certificados de rastreabilidade, fotos de
  componente e prontuário do fabricante. `app_storage` da conta: **6.542 KB → ~200 KB**.
- **Relatório finalizado = artefato PDF imutável** (§7-quater). Provado: alterei o nº de série
  da ficha e o SHA-256 do PDF continuou idêntico. Portal serve o arquivo — removi a trava por
  DevTools, editei a página e o arquivo baixado saiu com o hash da emissão.
- **Livro lacrado + trava no banco** (§7-quinquies). As quatro fraudes recusadas pelo Postgres
  (editar, apagar, reordenar, forjar o hash); acréscimo e ocorrência manual seguem passando.
- **Degradação do palco** alcança as fotos de campo; **v2 por default** para org nova.
- **SQL aplicado:** `v2_por_default.sql`, `livro_imutavel.sql`.

**Lixo de teste que ficou na conta** (combinado manter): relatórios `REL-1786503426229` e
`REL-1786504660780` (18 páginas cada) e suas entradas de livro — servem de exemplo real de
artefato + lacre. Duas entradas `LIV-TESTE-*` devem ser removidas pela porta de manutenção
(`set local nr13.manutencao = '1'`).

### O que sobrou deste bloco

- [ ] **Imprimir e Baixar do relatório finalizado** — não validados em produção (o download
      grava ~10 MB no disco do operador).
- [ ] **Retrofit de relatório legado**: sem retrofit automático, por decisão. Se quiser um
      botão "Congelar PDF agora", ele precisa deixar claro que congela o estado ATUAL.
- [ ] **Rasterização segura a thread principal**: 18 folhas em ~3 s, mas o `setTimeout(0)`
      entre folhas não impede a aba de travar. Só mexer se houver queixa.
- [ ] **Limpar as 2 entradas `LIV-TESTE-*`** do livro da AUTOCLAVE ESTERILAV. Comando pronto:

      begin;
      set local nr13.manutencao = '1';
      update public.app_storage
         set valor = (
               select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)::text
                 from jsonb_array_elements(valor::jsonb) with ordinality as t(e, ord)
                where e->>'id' not like 'LIV-TESTE-%'
             ),
             versao = versao + 1
       where org_id = '92a28bff-55ce-40a7-a5f3-4d7598488a75'
         and chave  = 'nr13_livro_AUTOCLAVE ESTERILAV - SANTA CASA MAUÁ';
      commit;

      O `versao + 1` não é detalhe: sem ele, aparelho com o livro em cache não percebe a
      mudança. A porta `nr13.manutencao` é obrigatória — a trava recusa até para o dono.

### 0-BIS.1 — MIGRAÇÃO SEM SENHA (o que destrava a conta `engyuricesar`)

- [ ] **Escrever um migrador que rode com `service_role`, não com a senha do cliente.**

  **O problema:** as duas migrações feitas até aqui (`cmam`, `gabriel`) exigiram ENTRAR na
  conta, porque a RLS do `app_storage` é por organização. Em 12/08/2026 a migração do
  `engyuricesar@gmail.com` (~6,5 MB, e o caso mais desproporcional da base: esse peso todo
  com UM equipamento) parou exatamente aí — o dono do projeto não tem a senha dele, e pedir
  a senha de um cliente pagante é a pior saída possível.

  **Por que a `service_role` resolve:** ela ignora a RLS tanto no `app_storage` quanto no
  Storage. O que NÃO funciona é a RPC `aplicar_mutacao_storage` — ela deriva a organização
  de `auth.uid()`, que é nulo para a service_role, e devolve `sem_permissao`. A escrita
  precisa ser `UPDATE` direto com `set local nr13.manutencao = '1'`, que é a porta que
  desliga a guarda de escrita direta e a trava do livro só naquela transação.

  **Esboço do script** (Node, fora do navegador, com `SUPABASE_SERVICE_ROLE_KEY`):

  1. `select chave, valor, versao from app_storage where org_id = <org> and deletado_em is null`
  2. para cada arquivo em base64 (campos `src`/`base64`, `pdfBase64`, `foto`):
     decodifica → `storage.upload('<org>/<escopo>/<uuid>.<ext>')` → **baixa de volta e
     confere o tamanho** → só então troca por `ref`/`pdfRef`/`fotoRef`
  3. grava com `UPDATE ... set valor = ..., versao = versao + 1` dentro de
     `begin; set local nr13.manutencao='1'; ... commit;`

  **Ordem de segurança que não muda:** o base64 só sai do registro DEPOIS do arquivo estar
  confirmado no bucket. Falha em qualquer passo deixa o registro intacto.

  **Ganho além do `engyuricesar`:** vale para qualquer conta futura, e permite rodar em lote
  sem depender de ninguém. `scripts/migrar-fotos-legadas.mjs` continua servindo para quem
  tem a senha à mão.

---

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

### 0.2 — Migrar as fotos legadas das contas pagantes pesadas

> **`gabriel.dadona` CONCLUÍDO em 11/08/2026: 6.542 KB → 120 KB (−98%).** Migrado pelo
> NAVEGADOR, com a sessão do próprio usuário logado (fetch na REST + Storage + a RPC
> `aplicar_mutacao_storage`), o que dispensa a senha que o script de linha de comando exige.
> Fotos de capa, containers de inspeção, os 2 certificados (3.695 KB) e as 8 fotos de
> componente (1.259 KB) estão no bucket, validados em tela. Sobrou só logo e assinaturas.
>
> **Falta `engyuricesar@gmail.com` (~6,5 MB)** — mesmo roteiro. Pelo navegador dispensa senha:
> basta o dono da conta logar e me deixar a aba aberta.

- [ ] **`engyuricesar@gmail.com` (~6,5 MB)** — única conta pesada que sobrou.

  Mesmo caso do `cmam`, que saiu de 8,00 MB para 3,06 MB. Ferramenta pronta e já validada
  de ponta a ponta: `scripts/migrar-fotos-legadas.mjs`.

      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs simular
      # depois de conferir o ganho:
      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs migrar-todas
      MIGRAR_EMAIL=... MIGRAR_SENHA=... node scripts/migrar-fotos-legadas.mjs migrar-docs

  **Bloqueio:** o script entra na conta para migrar, porque a RLS do `app_storage` é por
  organização — não existe caminho de admin. Precisa da senha de cada uma.

  > **`engyuricesar` PAROU AQUI em 12/08/2026: o dono do projeto não tem a senha.**
  > A saída certa NÃO é pedir a senha ao cliente — é o migrador por `service_role`
  > descrito em **0-BIS.1**. Enquanto ele não existir, esta conta fica como está
  > (funciona; só pesa no egress).

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

- [ ] **VALIDAR EM TELA a degradação que alcança as fotos de campo (era o risco nº 1).**
      Código corrigido em 11/08 e **já no ar**; falta a prova com dado real — gerar um
      relatório com muitas fotos numa conta pesada e conferir que ele CABE em vez de ser
      recusado. Medido em produção DEPOIS da migração: o palco do
      relatório do gabriel foi de 1.449 para **2.780 KB** contra 3.368 — 83% do orçamento,
      sem foto nova nenhuma. Migrar para o bucket alivia o banco e APERTA o palco, porque
      `hidratarFotosDoBucket` grava a imagem em `src` E `base64` (obrigatório: CAPA lê um, as
      folhas de fotos leem o outro, e foto nova chega só com `ref` — ver `palco.fotos.test.ts`,
      que existe para impedir a "otimização"). Antes do fix, no aperto o sistema recomprimia
      ~1 KB de capa e ignorava ~2,7 MB de fotos de inspeção.

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

  > **Conferido na Kiwify em 01/09/2026** (`dashboard.kiwify.com/subscriptions`): existem
  > **7 assinaturas ativas** na conta, mas só **3 são do produto NR13-Solutions** —
  > `engyuricesar@gmail.com` (04/08), `cmam.caldeiras@gmail.com` (24/07) e
  > `adm@gyncal.eng.br` (18/06), a R$ 176,80 líquidos cada. As outras 4 são de outros
  > produtos do mesmo vendedor (Menuzia, PSI-GRO ×3) e nunca devem entrar em conta nenhuma
  > do NR-13.
  >
  > Enquanto o `kiwify_subscription_id` não for gravado, o painel de Faturamento classifica
  > por `classificarConta.ts`: vigente **com** assinatura ou prazo = *Pagante*; vigente
  > **sem** assinatura e **sem vencimento nenhum** = *Vitalícia*; e a lista
  > `CONTAS_INTERNAS` (`teste@gmail.com`) = *Interna*. Os três tipos aparecem na tabela,
  > justamente para um erro de classificação ficar visível em vez de sumir dentro do total.
  > Quando o webhook começar a gravar, a classificação passa a ser automática e essa lista
  > deixa de importar.

---

## 1. Deploy manual (feito pelo dono do projeto, fora do código)

- [ ] **Rodar `supabase/acesso_setup.sql`** no SQL Editor do Supabase (idempotente; backfill
      `org_id = user_id` mantém comportamento atual até criar sub-logins). Conferir depois o
      trigger `handle_new_user`: não pode sobrescrever `org_id`/`papel`/`cliente_id`.
- [ ] **Rodar `supabase/admin_stats.sql`** no SQL Editor (idempotente; cria `admin_usage_stats()`
      para o painel Admin — sem isso as colunas de uso mostram "—").
- [ ] **Rodar `supabase/admin_series.sql`** no SQL Editor (idempotente; cria
      `admin_series_uso(dias)`, a série DIÁRIA que alimenta os gráficos de Relatórios,
      Equipamentos e Inspeções da aba "Visão geral"). Sem ele esses três gráficos ficam
      zerados com a nota "Rode supabase/admin_series.sql para popular"; os gráficos de
      Acessos e Contas cadastradas vêm de `login_events`/`profiles` e já funcionam.
- [ ] **Edge Function `admin_infra`** — é o que tira Egress, Requisições e CPU/RAM do "—" na
      Visão geral. Sem ela o resto do painel funciona inteiro (os números do próprio banco
      são reais); só a faixa de infra fica vazia, com a instrução na tela.

      1. Dashboard → Edge Functions → Deploy a new function → nome **`admin_infra`** →
         colar `supabase/functions/admin_infra/index.ts`. **Verify JWT LIGADO** (ao
         contrário do `kiwify_webhook`): aqui quem chama é o app logado, e o Bearer do
         usuário é justamente o que autentica — a função ainda confere `role = 'admin'`.
      2. Edge Functions → Secrets:

         | secret | valor |
         |---|---|
         | `SUPABASE_PAT` | Personal Access Token — supabase.com/dashboard/account/tokens |
         | `SUPABASE_PROJECT_REF` | `qqsesrntfvmdxqxrfvmw` |
         | `SUPABASE_ORG_SLUG` | opcional; sem ele a cota do plano pode vir vazia |

      **O token NÃO pode virar `VITE_*`.** Ele manda em todos os projetos da organização
      (inclusive pausar e apagar) e `VITE_*` vai para o bundle, que é arquivo público —
      mesma armadilha da chave do Google logo abaixo, com estrago maior.

      **Conferir depois do deploy:** se algum campo continuar em "—", a tela imprime em
      letra miúda qual endpoint falhou e com que HTTP. A Management API não documenta
      publicamente todos esses números, então o `index.ts` lê por tentativa (mesma
      disciplina do parser da Kiwify, §11 do CLAUDE.md) — endpoint que mude de forma
      apaga UM cartão, não derruba o painel. Ajustar o caminho no arquivo quando aparecer.
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

---

## FASE 7B — encerrar a gravação dupla de logo/rubrica

**Data-alvo:** deploy da 7B em produção **+ 45 dias** → **deploy em 21/08/2026, alvo 05/10/2026.**

Hoje `nr13_minha_empresa.logo` e `nr13_lista_phs[].assinatura` guardam a dataURL **e** a
referência. A duplicação é deliberada (D-11): é ela que torna o rollback para a 7A gratuito.
Encerrar = zerar a dataURL viva, e só pode acontecer com as condições **C1–C8** do plano macro
atendidas — em especial o backup (C7) e a ausência de referência órfã (C5).

**Pertence à Fase 10B.** Ver `docs/superpowers/plans/2026-08-20-fase7-task-level.md`.

> **Condição nova, vinda do teste offline de 22/08:** enquanto a promoção tardia abaixo não
> existir, uma identidade cadastrada **sem rede** fica só em dataURL. Zerar a dataURL viva
> antes disso apagaria a única cópia dessa identidade. O achado offline entra como condição
> adicional antes de aposentar a compatibilidade.

## FASE 7B — promoção tardia de dataURL para Ref (identidade cadastrada offline)

**Origem:** teste offline real de 22/08/2026, registrado em
`docs/medicoes/2026-08-20-fase7b-validacao-producao.md` §15. Classificado pelo dono como
**LIMITAÇÃO DE OTIMIZAÇÃO / PROMOÇÃO TARDIA PARA REF** — não é risco de perda, risco
histórico, ref quebrada nem falha de integridade.

Medido: cadastrando logo/rubrica offline, a dataURL é preservada, **nenhuma referência
prematura** é gravada e o blob fica no cofre com `pendente: true`. Na reconexão **não há
recuperação automática**: o botão "Sincronizar" drena a fila de **dados**, não a de
**arquivos**. Resultado: sem ref **e** sem arquivo — nunca arquivo órfão. A identidade fica em
base64 até a próxima edição online, que reaproveita integralmente o mesmo hash.

**A ordem segura, e ela não pode ser invertida:**

```
Blob/dataURL
  → upload do arquivo pendente
  → confirmar arquivoPendente(path) === false
  → validar conteúdo / tamanho / hash
  → gravar assinaturaRef / logoRef
  → manter a compatibilidade D-11
```

**NUNCA:** gravar a Ref e tentar subir o arquivo depois.

1. A fila de **arquivos** precisa drenar de verdade depois da reconexão.
2. **Só depois** da confirmação do arquivo no Storage,
3. `nr13_lista_phs` / `nr13_minha_empresa` podem ser promovidos de dataURL para Ref.
4. Nunca inverter essa ordem.

> **Não ampliar `FAMILIAS_RECUPERAVEIS` antes de corrigir o drain da fila de arquivos.** O
> próprio teste mostrou por quê: a varredura procuraria no Storage um arquivo que ainda não
> chegou lá, e o único desfecho possível seria referência órfã — que hoje **não existe**.

## FASE 7B — regra de rollback (não apagar enquanto a 7B existir)

> **O rollback da 7B é SEMPRE `7B → 7A`. NUNCA para uma versão anterior à 7A.**

A 7A é a versão que **sabe ler** referência. Depois que qualquer writer da 7B tiver gravado um
snapshot com `logoRef`/`assinaturaRef`, voltar para antes da 7A faria o leitor antigo ignorar
a referência e cair no dado **vivo** — e aí um documento histórico passaria a exibir a logo
atual. É exatamente o cenário que o dono recusou ao aprovar o modelo EXPAND → VALIDAR → SWITCH.
