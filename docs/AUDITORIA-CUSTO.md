# Auditoria de custo — APIs pagas, loops e abuso externo (14/10/2026)

Motivação: noutro sistema do dono, um relógio de 1 s re-renderizava a tela e o geocode do
Google repetia sem parar (~R$ 200). Este documento procura o equivalente NESTE sistema.
Levantamento só de leitura (Parte 1) + correções das críticas/altas (Parte 2). Nenhuma API
paga foi chamada para testar — tudo com mock. Segredos: só NOMES de variável aparecem aqui.

Regras derivadas: `docs/REGRAS-DE-CUSTO.md`. Trava automática: `src/__tests__/regraDeCusto.test.ts`.

---

## 1. Inventário — o que custa por uso

| Serviço | Onde (arquivo:linha) | Lado | Quem dispara | Variável |
|---|---|---|---|---|
| **Google Places Text Search** (SKU Enterprise ≈ US$ 0,035–0,04/chamada, por pedir telefone+site) | `src/services/googlePlaces.ts` (`consultarPlaces`, via `chamarPago`) | navegador | clique/Enter em Empresas → "Buscar empresa no Google" | `VITE_GOOGLE_MAPS_KEY` (pública por natureza; restrita por domínio + API) |
| Google Maps Embed | `googlePlaces.ts:urlMapaEmbed` → iframe em `Empresas.tsx` | navegador | abrir detalhe do cliente | mesma (SKU **gratuito**) |
| Favicons `s2/favicons`, Google Fonts | `googlePlaces.ts:faviconDe`, templates `public/` | navegador | render | sem chave, grátis |
| **Resend** (e-mail transacional) | `supabase/functions/trial/index.ts` (`enviarEmail`) e `supabase/functions/admin/index.ts` (`enviar_email_leads`) | Edge | cron horário (`trial-emails-hourly`) / ativação do trial / clique do admin | `RESEND_API_KEY` |
| **E-mail do Supabase Auth** (código de cadastro, reenvio, troca de senha) | `src/services/auth.ts` (`signUp`, `resend`, `resetPasswordForEmail`) | navegador → GoTrue | formulários PÚBLICOS do login | publishable key (pública) |
| Supabase Management API | `supabase/functions/admin_infra` | Edge | abrir o painel Admin | `SUPABASE_PAT`, `SUPABASE_PROJECT_REF`, `SUPABASE_ORG_SLUG` |
| Supabase Edge (invocações) | `trial`, `admin`, `admin_infra`, `org_admin`, `portal_cliente`, `portal_arquivo`, `kiwify_webhook`, `purga_trial` | Edge | cliques, montagem de tela, cron, webhook | `SUPABASE_SERVICE_ROLE_KEY` (só servidor) |
| Supabase Storage (egress) | `src/services/fotos.ts` (`upload`, `createSignedUrl`, `download`) — cofre IndexedDB na frente | navegador | abrir fotos/PDF, fila de upload | publishable key |
| Supabase DB (egress/CPU) | RPCs e `.from()` em `src/services/*`, projeções `*_index` | navegador | telas, sync, timers (abaixo) | publishable key |
| pg_cron | `supabase/trial_emails_setup.sql` (horário → Edge `trial`); `purga_trial.sql` (comentado, inativo) | servidor | relógio | publishable key no SQL (pública) |
| Terceiros grátis com limite | `Login.tsx` → `ipapi.co/json` (a cada abertura do login); jsdelivr (KaTeX, chart.js) nos templates | navegador | render | sem chave |

**Não existe** neste sistema: OpenAI/Anthropic/Gemini, transcrição, SMS/WhatsApp (Twilio,
Z-API, Evolution), SendGrid/SES, Geocoding/Directions/Distance Matrix, Maps JavaScript SDK.

Planos atuais relevantes: o custo real em dinheiro por chamada é **Google Places** e
**Resend**. No Supabase o risco não é a fatura por chamada, é **estourar a cota de egress da
organização** — o que já tirou a produção do ar em 31/08/2026 (402).

---

## 2. Achados — por risco

Legenda: ✅ corrigido nesta rodada · ⏳ precisa de você (painel) · ❓ médio/baixo, aguardando decisão.

### ALTO

| # | Achado | Pior caso/dia (antes) | Status / correção |
|---|---|---|---|
| A-1 | **Places: Enter segurado disparava dezenas de buscas pagas por segundo** — o handler não conferia busca em andamento nem `e.repeat`; sem cache, sem teto. | ~30 req/s enquanto a tecla está presa ≈ US$ 70/min. Sem cota no Google, um script com a chave sem restrição: milhares de US$/dia. | ✅ **Guarda central** `src/services/guardaCusto.ts`: cache, deduplicação, intervalo mínimo 1,5 s, teto 40/sessão e **150/dia por aparelho**, registro de uso e custo estimado. Tela ignora `e.repeat`. Teste: 20 chamadas simultâneas → 1 requisição. Chave nova restrita a `app.nr13sistema.com.br` + localhost e **só** Places (New) + Maps Embed (feito 13/10). ⏳ cota diária no Google (Parte 3). Depois: ≤ US$ 6/dia por aparelho; teto rígido = a cota que você puser. |
| A-2 | **E-mails do trial duplicáveis por qualquer um.** `enviar_lembretes` da Edge `trial` só exige a publishable key (pública, está no bundle) e fazia SELECT → envia → marca. N chamadas paralelas = N cópias para cada trial na janela. | Cota diária do Resend esgotada em minutos (e-mails reais de boas-vindas param) + reputação do domínio. | ✅ `supabase/functions/trial/lembretes.ts`: **reserva atômica antes de enviar** (`update … where marca is null returning`), devolução da marca se o envio falhar, teto de 50 envios/execução, segredo opcional `TRIAL_CRON_SEGREDO` (header `x-cron-segredo`). Teste: 10 chamadas simultâneas → 1 e-mail por perfil. ⏳ **deploy da Edge `trial`** (arquivo novo `lembretes.ts` junto). |
| A-3 | **PDF baixado de novo a cada re-render.** `VisualizadorPdf` dependia de `[artefato, onErro]`; os 5 chamadores montam `artefato` no render, então todo toast/estado do pai baixava o PDF inteiro outra vez (o download não volta ao cofre). | 2–6 downloads do PDF por ação do usuário; egress do bucket. | ✅ efeito depende só de `chaveDoArtefato` (path + SHA). Teste de fonte trava as deps. |
| A-4 | **Cadastro/troca de senha públicos sem captcha** (`signUp`, `resend`, `resetPasswordForEmail` direto do navegador). O cooldown de 60 s é só estado do React; a flag do trial só barra `ativar_trial`, não o `signUp`. Cada cadastro falso deixa linha em `auth.users`/`profiles`/`org_sync`. | Até o teto de e-mail/hora do projeto (≈ 720/dia se 30/h) — e os códigos reais deixam de chegar (negação de serviço). | ⏳ exige conta Turnstile/hCaptcha + mudança no front (passar `captchaToken`) feitas JUNTAS — ligar o captcha no painel sem o front quebra o login. Ver Parte 3 e pergunta no fim. |

### MÉDIO (❓ — listados para decisão)

| # | Achado | Onde | Pior caso | Correção proposta |
|---|---|---|---|---|
| M-1 | `drenar()` da fila v2 sem trava de concorrência e sem backoff por item (`tentativas` é contado e nunca lido); roda a cada gravação do autosave. | `src/services/sync.ts:939-996`, `:622` | ~60·K RPCs/min com K itens presos enquanto se digita | trava "em execução", `proximaTentativaEm` com espera crescente e teto |
| M-2 | Erros que nunca encerram: `obsoleto`/`conflito` pela exceção, `app_desatualizado`, e `offline` falso (5xx sem CORS) a cada 45 s para sempre. | `sync.ts:637-664, 853-865`; `retentativaRede.ts:39-52` | 1,3 drenagens/min × itens, enquanto a aba estiver aberta | backoff exponencial com teto (ex.: 45 s → 30 min) e encerramento após N |
| M-3 | Fila de fotos sem teto de tentativas, sem backoff e sem trava; reenvia o arquivo inteiro a cada volta à aba. | `src/services/fotos.ts:341-348, 693-705` | dezenas de uploads de MB/hora por foto recusada | mesma receita de M-1/M-2; recusa definitiva (413/RLS) encerra |
| M-4 | Painel de vencimentos: todo `focus` força o RPC `vencimentos_org` (fura a janela de 3 s); `dados-alterados` gera 2 RPCs. | `src/services/vencimentosServidor.ts:316-337`, `Layout.tsx:158` | 1 RPC por alt-tab | throttle de 30–60 s no foco e chamada forçada compartilhada |
| M-5 | `portal_arquivo` lê TODAS as linhas da organização a cada arquivo pedido (≈3 MB na maior org), sem limite por usuário. Exige login de cliente. | `supabase/functions/portal_arquivo/index.ts:125-193` | ~260 GB/dia de leitura interna se um cliente logado fizer loop de 1 req/s | ler só as chaves do cliente (`.in()`), limite por usuário |
| M-6 | Intervalo mínimo entre e-mails do Auth não confirmado no painel (repo diz 1 s). | `supabase/config.toml:230` | complementa A-4 | ⏳ painel: 60 s |
| M-7 | Paginação automática do RelatoriosV9 com filtro de empresa sem teto de páginas (loop se o cursor repetir). | `src/features/relatorios/RelatoriosV9.tsx:506-509` | infinito só com bug de cursor | teto como `TETO_PAGINAS_RECORTE` do EquipamentosV9 |

### BAIXO (❓)

| # | Achado | Onde | Correção proposta |
|---|---|---|---|
| B-1 | Heartbeat de sessão a cada 30 s (getSession + update + select), também com aba oculta e sem trava de sobreposição. ~5.760 chamadas/dia por aba aberta. | `src/services/auth.ts:380-412` | pausar com aba oculta; trava em voo |
| B-2 | Polling do checkout (10 s, teto 15 min) continua com aba oculta; "Verificar novamente" reabre outros 15 min. | `src/components/ModalAssinatura.tsx:70-146` | pausar oculta; teto global |
| B-3 | `FotoImg` sem cache negativo: foto ausente no bucket é pedida de novo a cada re-render. | `src/components/FotoImg.tsx:74-88`, `fotos.ts:561-565` | cache de falha por 5 min |
| B-4 | Fila v1 (legado) sem backoff. | `src/services/storageV1.ts:207-247` | só se alguma org voltar à v1 |
| B-5 | `status` da Edge `trial` público (1 leitura service-role por chamada). | `trial/index.ts` | cache de 60 s na Edge |
| B-6 | `enviar_email_leads` (admin): sem total diário. | `admin/index.ts:269-365` | contador diário |
| B-7 | `kiwify_webhook`: comparação de segredo não constante e corpo sem limite de tamanho (só depois do segredo). | `kiwify_webhook/index.ts` | compare em tempo constante; teto de corpo |
| B-8 | `Login.tsx` chama `ipapi.co/json` a cada abertura (grátis com limite; envia o IP do usuário a terceiro). | `src/pages/Login.tsx:75` | remover ou cachear por sessão |

### Verificado e SEGURO

- Nenhum efeito React chama rede a cada render; nenhuma drenagem dispara a si mesma; nenhum
  `onAuthStateChange` em loop (guarda anti-loop em `App.tsx`).
- iframe do mapa: `src` determinístico — carrega uma vez por abertura do detalhe.
- Catálogos V9: filtros memoizados, abort + geração; EquipamentosV9 com teto de páginas.
- Timers de 1 s/4 s/5 s/20 s/60 s (`BarraTrial`, `SyncStatus`, `SeloSync`, palco, bloqueio de
  impressão, barra de assinatura) são locais — não chamam rede.
- Servidor: nenhuma função chama a si mesma; nenhum trigger faz HTTP (`pg_net` só no cron);
  cascata de triggers para em 2 níveis (`auth.users → profiles → org_sync`, `on conflict do nothing`).
- **Segredos:** nenhum segredo de servidor no código nem no histórico do git. `.env`/`.env.local`
  nunca foram commitados. As únicas chaves versionadas são a publishable key (pública por
  desenho) em `supabase/trial_emails_setup.sql`. Todo segredo de servidor é lido por
  `Deno.env.get` nas Edges (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `PURGA_TRIAL_SEGREDO`, `SUPABASE_PAT`…). `VITE_*` em uso: só URL, publishable key e a chave
  de navegador do Google. **Nenhuma chave precisa ser trocada.**

---

## 3. Proteções que faltavam

| Proteção | Antes | Agora |
|---|---|---|
| Porta única para chamada paga no navegador | não havia | `guardaCusto.chamarPago` (Places) |
| Teto diário por serviço | não havia | 150/dia por aparelho (código) + cota no Google (⏳ você) |
| Contador de uso / custo estimado | não havia | `nr13_uso_apis_pagas` no aparelho (serviço, chamadas, US$) |
| Deduplicação de chamadas iguais | não havia | na guarda; reserva atômica nos lembretes do trial |
| Teste que quebra o build | não havia | `regraDeCusto.test.ts`: host pago fora da guarda, segredo em `VITE_*`, chave literal no código |
| Alerta / desligamento automático | não havia | ⏳ orçamento + alerta no Google Cloud; o "desligamento" é a cota diária (o Google recusa ao estourar) |

Teto por CLIENTE (organização) no servidor não existe para o Places porque a chamada sai do
navegador direto ao Google; a cota do projeto é o teto global. Se um dia precisar de teto por
organização, a busca passa para uma Edge com contador no banco — custo: uma Edge a mais.

---

## Parte 3 — o que o dono faz à mão

**Google Cloud** (projeto `projeto-api-maps-487406`, chave "API SAAS NR13"):
1. ✅ Restrição por site (`https://app.nr13sistema.com.br/*`, `http://localhost:5173/*`) e por API
   (Places API (New) + Maps Embed API) — feito em 13/10/2026.
2. ⏳ APIs e serviços → **Places API (New)** → Cotas → "Requests per day" → **100**.
3. ⏳ Faturamento → **Orçamentos e alertas** → orçamento de R$ 50/mês com alertas em 50/90/100 %
   por e-mail. (O Google não corta sozinho pelo orçamento; quem corta é a cota do passo 2.)
4. Atenção: o projeto é compartilhado com o Menuzia — a cota do passo 2 vale para os dois.

**Supabase** (projeto `qqsesrntfvmdxqxrfvmw`):
1. ⏳ Edge Functions → `trial` → reimplantar com `index.ts` **e** o arquivo novo `lembretes.ts`.
2. ⏳ (opcional) Secret `TRIAL_CRON_SEGREDO` na Edge + o mesmo valor no header `x-cron-segredo`
   do cron `trial-emails-hourly` — só faça os dois juntos, senão o cron recebe 401.
3. ⏳ Authentication → Rate Limits: "emails sent" baixo (ex.: 30/h) e intervalo mínimo entre
   e-mails de 60 s.
4. ⏳ Captcha (A-4): criar site Cloudflare Turnstile (grátis) → me passar SÓ a site key (pública);
   eu ligo o front; aí você cola a secret key em Authentication → Bot Protection. Na ordem
   inversa o cadastro e a troca de senha param.
5. Usage → conferir alerta de egress da organização.

**Resend**: Settings → conferir o plano; no gratuito o teto diário (100) já é limite rígido.

**Chaves expostas:** nenhuma. Nada a trocar.
