-- ============================================================================
-- perfil_origem_rollback.sql — desfaz perfil_origem.sql
-- ============================================================================
--
-- Restaura `handle_new_user` EXATAMENTE como estava antes da Fase 0, com o
-- corpo lido da produção em 16/08/2026 via:
--
--     select prosrc from pg_proc where proname = 'handle_new_user';
--
-- e conferido contra `admin_setup.sql:60-74` — os dois são idênticos.
--
-- ── QUANDO USAR ─────────────────────────────────────────────────────────────
--
-- Sintoma que justifica o rollback: conta nova nascendo sem acesso, ou signup
-- falhando. Em qualquer um dos dois, rodar este arquivo devolve o comportamento
-- anterior em segundos.
--
-- ── O QUE O ROLLBACK **NÃO** DESFAZ ─────────────────────────────────────────
--
-- Perfis criados enquanto a versão nova estava ativa MANTÊM o papel com que
-- nasceram. Isso é seguro e desejado:
--
--   - sub-login nascido 'funcionario'/'cliente' continua correto — é o estado
--     que o upsert do org_admin produziria de qualquer forma;
--   - conta de auto-cadastro nascida 'mestre' continua correta;
--   - conta nascida 'sem_papel' (metadata inválida) precisa de correção
--     MANUAL e individual, nunca em massa:
--
--       update public.profiles
--          set papel = 'mestre'          -- ou o papel correto daquele usuário
--        where id = '<uuid-exato-do-perfil>'
--          and papel = 'sem_papel';
--
--     Sempre com `id` explícito no WHERE. Um update sem delimitação aqui
--     reescreveria o papel da base inteira.
--
-- O frontend e a Edge com metadata podem permanecer: esta versão do trigger
-- simplesmente ignora `raw_user_meta_data`, como sempre fez. Não é preciso
-- reverter os três commits de aplicação para reverter o SQL.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eh_admin boolean := lower(new.email) = 'perone.fs@gmail.com';
begin
  insert into public.profiles (id, email, ativo, role)
  values (new.id, lower(new.email), eh_admin, case when eh_admin then 'admin' else 'user' end)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Conferência: o corpo abaixo tem que voltar a ser o de 4 linhas, sem
-- nenhuma menção a `nr13_papel`.
select prosrc from pg_proc where proname = 'handle_new_user';
