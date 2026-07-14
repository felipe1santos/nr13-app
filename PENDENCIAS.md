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
