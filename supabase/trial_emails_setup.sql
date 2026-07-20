-- ============================================================================
-- NR-13 — E-mails do trial (boas-vindas / lembrete / vencido). IDEMPOTENTE.
-- Rodar APÓS trial_setup.sql. Requer o secret RESEND_API_KEY nas Edge Functions
-- (Dashboard → Edge Functions → Secrets) para os envios acontecerem.
-- ============================================================================

-- 1. Marcadores de envio (impedem e-mail duplicado)
alter table public.profiles add column if not exists email_bemvindo_em timestamptz;
alter table public.profiles add column if not exists email_lembrete_em timestamptz;
alter table public.profiles add column if not exists email_vencido_em  timestamptz;

-- 2. (Opcional) URL pública do app para o botão "Assinar agora" dos e-mails.
--    Ajustar depois:  update config_global set valor = '{"url":"https://SEU-DOMINIO"}'
--    where chave = 'app_url';
insert into public.config_global (chave, valor)
  values ('app_url', '{"url": ""}')
  on conflict (chave) do nothing;

-- 3. Cron de hora em hora chamando a Edge Function `trial` (action enviar_lembretes).
--    A chave usada abaixo é a ANON/publishable (pública por definição — vai no bundle
--    do frontend); só satisfaz o verify_jwt da função.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('trial-emails-hourly');
exception when others then
  null; -- primeiro run: job ainda não existe
end $$;

select cron.schedule(
  'trial-emails-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url     := 'https://qqsesrntfvmdxqxrfvmw.supabase.co/functions/v1/trial',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_q0WdFDVUFTuZMlDpD6uO1g_bYZ7WDEo',
      'apikey', 'sb_publishable_q0WdFDVUFTuZMlDpD6uO1g_bYZ7WDEo'
    ),
    body    := '{"action":"enviar_lembretes"}'::jsonb
  );
  $$
);
