# PENDÊNCIAS DO SISTEMA

> **AVISO (para o Claude e para mim):** este arquivo é a lista viva de pendências.
> Conforme cada item for concluído, **REMOVER o item deste arquivo** (não só marcar) e
> commitar. Quando uma seção esvaziar, remover a seção. Quando o arquivo esvaziar,
> deletar o arquivo. Ao trabalhar numa pendência daqui, verificar antes se ela ainda
> procede (o código pode ter mudado).

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

- [ ] **Agendar `coletar_tombstones(<org>, 30)`** (mensal, service_role). A prova da
      exclusão permanece em `app_storage_excluidos`; só o `valor` é removido.

- [ ] **DEPLOY URGENTE do front.** `cmam.caldeiras` está com `org_sync.v2_ativa = true` no
      servidor desde 05/08 e o bundle em produção ainda é o que não lê essa flag: ele fala v1
      com um banco que só aceita a RPC, então **nenhuma escrita dele chega ao banco** (fica em
      `nr13_fila_sync` no aparelho) e a lista abre vazia. Enquanto não houver deploy, o
      cliente segue nesse estado. Depois do deploy o aparelho dele adota sozinho a fila presa
      (`migracaoV1.ts`) — não pedir para ele limpar o cache/navegador antes disso, é lá que
      estão as gravações que ainda não subiram.

- [ ] **Ligar a v2 nas demais contas acima da cota** (`teste@gmail.com`,
      `gabriel.dadona@gmail.com`, `liperoneads@gmail.com`) com `definir_v2_org(<org>, true)`.
      `cmam.caldeiras@gmail.com` já está ligada e validada em 10/08/2026 (38 equipamentos na
      tela, criação/edição/exclusão indo ao banco, ciclo offline→online drenando, conflito de
      versão preservando as duas versões).

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
coleta e reconciliação). Backup em `app_storage_bkp_20260805`. `v2_ativa` **desligada
em todas as organizações** — comportamento idêntico ao anterior.
