-- ============================================================================
-- ROLLBACK de `rls_funcoes_estaveis.sql`
-- ============================================================================
--
-- Devolve as seis funções auxiliares da RLS a `VOLATILE` e as duas políticas da
-- Fase 9 à forma sem subconsulta escalar — exatamente o estado anterior.
--
-- QUANDO USAR: se aparecer qualquer comportamento inesperado de visibilidade
-- depois de aplicar. O rollback é instantâneo (só metadado de função e duas
-- políticas) e NÃO toca em dado nenhum.
--
-- QUANDO **NÃO** É PRECISO: para desligar a busca da Fase 9. Este arquivo não
-- tem relação com `busca_v9` — a flag se desliga por `definir_busca_v9`.
--
-- Idempotente.
-- ============================================================================

alter function public.org_atual()                  volatile;
alter function public.papel_atual()                volatile;
alter function public.is_admin()                   volatile;
alter function public.acesso_vigente()             volatile;
alter function public.assinatura_status_org()      volatile;
alter function public.assinatura_permite_escrita() volatile;

-- AS TABELAS DA FASE 9 PODEM NÃO EXISTIR — e em produção, hoje, NÃO existem.
--
-- Este arquivo é INDEPENDENTE da Fase 9, então ele não pode falhar num banco que
-- ainda não a recebeu. Sem esta guarda, aplicá-lo em produção pararia no meio
-- com "relation does not exist" — e as funções acima já teriam sido alteradas,
-- deixando o deploy pela metade.
do $$
begin
  if to_regclass('public.equipamentos_index') is not null then
    execute 'drop policy if exists equipamentos_index_select_org on public.equipamentos_index';
    execute 'create policy equipamentos_index_select_org on public.equipamentos_index
               for select using (
                 org_id = public.org_atual()
                 and coalesce(public.papel_atual(), '''') <> ''cliente''
               )';
  end if;

  if to_regclass('public.relatorios_index') is not null then
    execute 'drop policy if exists relatorios_index_select_org on public.relatorios_index';
    execute 'create policy relatorios_index_select_org on public.relatorios_index
               for select using (
                 org_id = public.org_atual()
                 and coalesce(public.papel_atual(), '''') <> ''cliente''
               )';
  end if;
end $$;

