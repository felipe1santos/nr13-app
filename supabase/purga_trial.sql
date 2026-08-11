-- ============================================================================
-- Purga dos DADOS de contas de teste que não viraram cliente.
-- ============================================================================
--
-- O QUE APAGA: as linhas de `app_storage` da organização (equipamentos,
-- inspeções, relatórios, fotos legadas em base64).
--
-- O QUE NÃO APAGA, NUNCA: a linha em `profiles`. O e-mail e os dados do lead
-- continuam lá, porque é deles que sai a lista de marketing do painel Admin.
-- Apagar o perfil apagaria o lead — o oposto do que este script serve.
--
-- POR QUE EXISTE: em 11/08/2026 as contas de teste já respondiam por boa parte
-- das linhas do `app_storage`, num projeto que estourou a cota de egress do
-- Supabase (6,1 GB contra 5 GB) e recebeu prazo de restrição.
--
-- ── QUEM É PAGANTE (definição do dono do produto, 11/08/2026) ───────────────
-- Pagante é a conta que ele ATIVOU MANUALMENTE e que segue ativa. Não existe
-- marcador de cobrança utilizável: nenhuma conta tem `kiwify_subscription_id`
-- preenchido, e o `plano` da maioria é o valor legado 'demonstracao' — a conta
-- `cmam.caldeiras`, cliente real e importante, tem exatamente os mesmos campos
-- de várias contas de teste do próprio dono.
--
-- Daí o critério ser por EXCLUSÃO e não por dedução: só entra na purga quem
-- tem `plano = 'trial'`. Quem foi liberado na mão saiu de 'trial' no mesmo ato
-- (é o que "Liberar acesso completo" faz, gravando 'completo'), então nunca
-- alcança este script. `engyuricesar@gmail.com` é a prova viva do caminho: veio
-- de `origem_cadastro = 'trial'` e hoje é `plano = 'completo'`.
--
-- CINTO E SUSPENSÓRIO: além do `plano = 'trial'`, exige prazo vencido há mais
-- de `p_dias` e recusa qualquer conta `role = 'admin'`.
-- ============================================================================

-- ── 1. Quem SERIA afetado (rodar SEMPRE antes) ─────────────────────────────
-- Não apaga nada. É a conferência que precede qualquer execução.
create or replace function public.trial_candidatos_purga(p_dias integer default 5)
returns table (
  email          text,
  plano          text,
  venceu_ha_dias integer,
  linhas         bigint,
  kb             numeric
)
language sql
security definer
set search_path = ''
as $$
  select p.email,
         p.plano,
         extract(day from now() - p.acesso_expira_em)::integer as venceu_ha_dias,
         count(s.chave)                                        as linhas,
         round(coalesce(sum(length(coalesce(s.valor, ''))), 0) / 1024.0, 1) as kb
    from public.profiles p
    left join public.app_storage s
           on s.org_id = coalesce(p.org_id, p.id)
          and s.deletado_em is null
   where p.plano = 'trial'
     and coalesce(p.role, 'user') <> 'admin'
     and p.acesso_expira_em is not null
     and p.acesso_expira_em < now() - make_interval(days => p_dias)
   group by p.email, p.plano, p.acesso_expira_em
   order by kb desc;
$$;

revoke all on function public.trial_candidatos_purga(integer) from public;
grant execute on function public.trial_candidatos_purga(integer) to authenticated;

-- ── 2. A purga ──────────────────────────────────────────────────────────────
-- Só service_role. A checagem de papel é a mesma das demais rotinas
-- administrativas (`coletar_tombstones`, `definir_v2_org`): uma função que
-- apaga dado de cliente não pode ser alcançável pelo app.
create or replace function public.purgar_dados_trial(p_dias integer default 5)
returns table (email text, linhas_apagadas bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org  uuid;
  v_mail text;
  v_n    bigint;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'purgar_dados_trial exige service_role';
  end if;

  -- A guarda de escrita da v2 recusaria o DELETE direto; esta é rotina de
  -- manutenção, igual à coleta de tombstones.
  perform set_config('nr13.manutencao', '1', true);

  for v_org, v_mail in
    select coalesce(p.org_id, p.id), p.email
      from public.profiles p
     where p.plano = 'trial'
       and coalesce(p.role, 'user') <> 'admin'
       and p.acesso_expira_em is not null
       and p.acesso_expira_em < now() - make_interval(days => p_dias)
  loop
    delete from public.app_storage s where s.org_id = v_org;
    get diagnostics v_n = row_count;

    -- Rastro do que foi apagado e quando. Sem isto, "a conta abriu vazia" no
    -- futuro vira investigação sem ponto de partida.
    update public.profiles
       set dados_purgados_em = now()
     where coalesce(org_id, id) = v_org;

    email := v_mail;
    linhas_apagadas := v_n;
    return next;
  end loop;
end $$;

revoke all on function public.purgar_dados_trial(integer) from public, authenticated;

-- Coluna do rastro (aditiva).
alter table public.profiles add column if not exists dados_purgados_em timestamptz;

-- ── 3. Conferência ──────────────────────────────────────────────────────────
select * from public.trial_candidatos_purga(5);

-- ── 4. Execução (rodar SÓ depois de conferir a lista acima) ─────────────────
-- begin;
--   set local request.jwt.claims = '{"role":"service_role"}';
--   select * from public.purgar_dados_trial(5);
-- commit;

-- ── 5. Agendamento (opcional, quando houver pg_cron) ────────────────────────
-- select cron.schedule('purga-trial', '0 4 * * *', $cron$
--   select public.purgar_dados_trial(5);
-- $cron$);
--
-- Sem pg_cron no plano atual, a alternativa é chamar a função por uma Edge
-- Function agendada, ou rodar o bloco 4 manualmente de tempos em tempos.
