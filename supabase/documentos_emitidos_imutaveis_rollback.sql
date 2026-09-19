-- Rollback de `documentos_emitidos_imutaveis.sql`: remove a trava do certificado
-- emitido e devolve às políticas de UPDATE/DELETE do bucket a forma de
-- `fotos_storage.sql`. Idempotente. Não toca em nenhum registro.
begin;

drop trigger if exists trg_guardar_documento_emitido on public.app_storage;
drop function if exists public.guardar_documento_emitido();
drop function if exists public.nr13_calibracao_emitida(jsonb);

drop policy if exists inspecao_atualizacao on storage.objects;
create policy inspecao_atualizacao on storage.objects for update
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

drop policy if exists inspecao_remocao on storage.objects;
create policy inspecao_remocao on storage.objects for delete
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

commit;
-- Obs.: o filtro de rascunho em projetar_calibracoes é mantido (inofensivo). Para removê-lo, reaplicar supabase/busca_manutencao.sql da versão anterior.
