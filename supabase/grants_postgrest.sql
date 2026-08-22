-- ============================================================================
-- grants_postgrest.sql — PERMISSÕES DE TABELA PARA OS PAPÉIS DO POSTGREST
-- ============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE (22/08/2026)
--
-- Nenhum `.sql` do repositório concede permissão de TABELA — só de FUNÇÃO
-- (`grant execute on function ...`). Em produção isso nunca fez falta: o
-- projeto é antigo e o Supabase daquela época aplicava, por privilégio padrão
-- do schema `public`, `select/insert/update/delete` a `anon`, `authenticated` e
-- `service_role` em toda tabela nova.
--
-- O CLI atual (2.115.0) NÃO faz mais isso. Levantando o laboratório local, as
-- tabelas nasceram apenas com `REFERENCES, TRIGGER, TRUNCATE`, e a primeira
-- consequência apareceu no teste de fumaça: a escrita direta como
-- `authenticated` foi recusada com **"permission denied for table app_storage"**
-- em vez do `nr13_escrita_direta_bloqueada` da guarda `trg_guardar_app_storage`.
--
-- Isso não é detalhe de arrumação: se o laboratório barra a escrita antes de
-- chegar na guarda, ele estaria medindo o comportamento errado. A RLS só é
-- avaliada DEPOIS do GRANT — sem a permissão, nenhuma política, nenhum trigger
-- e nenhuma medição de caminho de escrita valem.
--
-- MEDIDO, NÃO SUPOSTO. Consulta somente leitura em produção
-- (`information_schema.role_table_grants`, projeto `qqsesrntfvmdxqxrfvmw`,
-- 22/08/2026) devolveu, para `public.app_storage`:
--
--   anon           DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   postgres       DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   service_role   DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- QUEM PROTEGE O DADO CONTINUA SENDO A RLS, não o GRANT. `anon` e
-- `authenticated` enxergam a tabela, e as políticas de `acesso_setup.sql`,
-- `trial_setup.sql`, `assinatura_setup.sql` e `portal_policies.sql` decidem
-- linha a linha. Foi sempre assim em produção — este arquivo apenas para de
-- deixar isso implícito.
--
-- ORDEM: último passo, depois de todas as tabelas existirem.
-- Idempotente.
-- ============================================================================

grant select, insert, update, delete, references, trigger, truncate
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;

-- Para as tabelas que vierem depois deste arquivo, no laboratório local.
alter default privileges in schema public
  grant select, insert, update, delete, references, trigger, truncate
  on tables to anon, authenticated, service_role;
