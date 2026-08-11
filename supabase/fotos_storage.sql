-- ============================================================================
-- Fotos no Storage (bucket `inspecao`) — migration ADITIVA e idempotente.
-- ============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE SEPARADO DO armazenamento_v2.sql:
--   A seção 8 daquele script criava o bucket e as policies, mas em 10/08/2026
--   descobriu-se que NADA daquela seção valeu em produção: o bucket não
--   existia (`Bucket not found` em qualquer upload) e as policies também não.
--   Provável causa: `insert into storage.buckets` é recusado para quem não é
--   dono do schema `storage`, e o erro abortou o restante do bloco. O bucket
--   passou a ser criado pelo painel (Storage → New bucket, privado); as
--   policies ficam aqui, onde rodam sozinhas.
--
-- NÃO apaga nada e NÃO migra foto antiga. Fotos legadas continuam em base64
-- dentro do app_storage e seguem sendo exibidas (ver `fotos.ts`).
--
-- PRÉ-REQUISITO: o bucket `inspecao` precisa existir e ser PRIVADO.
--   Painel → Storage → New bucket → nome `inspecao`, "Public bucket"
--   DESMARCADO. (Bucket público exporia a foto de qualquer cliente a quem
--   descobrisse a URL, sem autenticação nenhuma.)
-- ============================================================================

-- Confere o pré-requisito antes de criar qualquer policy: sem o bucket, as
-- policies existiriam apontando para o nada e o erro só apareceria no app.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'inspecao') then
    raise exception 'bucket `inspecao` nao existe — crie pelo painel (privado) antes de rodar este script';
  end if;
  if (select public from storage.buckets where id = 'inspecao') then
    raise exception 'bucket `inspecao` esta PUBLICO — deixe-o privado antes de rodar este script';
  end if;
end $$;

-- ── Isolamento por organização ──────────────────────────────────────────────
-- O caminho do arquivo é `<org_id>/<tag>/<uuid>.jpg`, e a primeira pasta é a
-- organização. `storage.foldername(name)[1]` compara essa pasta com a org da
-- sessão: uma organização nunca enxerga nem grava no diretório de outra.
--
-- Escrita e remoção exigem, além disso, exatamente o mesmo trio que a RLS de
-- `app_storage` exige (papel, prazo e assinatura em dia) — senão o Portal do
-- Cliente e a conta suspensa gravariam foto sem poder gravar o registro que a
-- referencia, deixando arquivo órfão no bucket.

drop policy if exists inspecao_leitura on storage.objects;
create policy inspecao_leitura on storage.objects for select
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
  );

drop policy if exists inspecao_escrita on storage.objects;
create policy inspecao_escrita on storage.objects for insert
  with check (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );

-- UPDATE existe porque o cliente de Storage reenvia o MESMO caminho quando uma
-- retentativa de upload acontece depois de o arquivo já ter subido (rede que
-- caiu entre o upload e a confirmação). Sem esta policy a retentativa falha
-- para sempre e a foto fica pendente no aparelho.
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

-- ── Conferência ─────────────────────────────────────────────────────────────
select policyname, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like 'inspecao%'
 order by policyname;
