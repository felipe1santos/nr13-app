-- ============================================================================
-- app_storage_base.sql — A TABELA BASE DO SISTEMA, RECUPERADA DE PRODUÇÃO
-- ============================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE (22/08/2026)
--
-- `public.app_storage` é o "banco" inteiro do sistema — toda chave que o
-- CLAUDE.md §2 lista mora aqui. E ela NUNCA esteve no repositório: foi criada
-- fora do versionamento (Dashboard ou script perdido) lá no começo do projeto.
-- Os 16 arquivos `.sql` versionados apenas a ALTERAM:
--
--   acesso_setup.sql:30      alter ... add column org_id
--   armazenamento_v2.sql:21  alter ... add column versao
--   armazenamento_v2.sql:22  alter ... add column dispositivo
--   armazenamento_v2.sql:23  alter ... add column deletado_em
--   armazenamento_v2.sql:28  alter ... add column mutado_em_cliente
--
-- A ausência só apareceu quando a Fase 8 tentou levantar o laboratório local:
-- nenhuma migration real aplica sem a tabela existir. Em produção ninguém
-- notava, porque lá ela já estava lá.
--
-- ESTE ARQUIVO NÃO FOI INVENTADO. Foi lido de produção em 22/08/2026 por
-- consulta SOMENTE LEITURA no SQL Editor (`information_schema.columns`,
-- `pg_constraint`, `pg_index`, `pg_get_functiondef`, `pg_get_triggerdef`),
-- projeto `qqsesrntfvmdxqxrfvmw`, PostgreSQL 17.6.
--
-- O QUE FOI CONFIRMADO, E POR QUE CADA COISA IMPORTA:
--
--   `valor` é TEXT, não JSONB.  A Fase 8 mede peso de linha, custo de índice e
--   EXPLAIN (BUFFERS). `jsonb` teria TOAST, compressão e tamanho de linha
--   diferentes — medir contra o tipo errado daria número errado com cara de
--   número certo. Este era o campo que NÃO dava para deduzir por uso.
--
--   A PK é (user_id, chave), e NÃO existe coluna `id`.  A unicidade por
--   organização vem de um índice separado, criado em `app_storage_org_unico.sql`
--   depois que `acesso_setup.sql` acrescenta `org_id`.
--
--   O FK para `auth.users(id)` é ON DELETE CASCADE — apagar o usuário no Auth
--   leva junto o dado dele.
--
-- ORDEM: este arquivo é o passo 0. Nada mais aplica antes dele.
-- Idempotente: pode rodar de novo sem efeito.
-- ============================================================================

create table if not exists public.app_storage (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  chave         text        not null,
  valor         text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, chave)
);

-- As demais colunas (org_id, versao, dispositivo, deletado_em,
-- mutado_em_cliente) NÃO entram aqui de propósito: elas nascem nos arquivos
-- versionados que já existem, e duplicá-las aqui criaria duas fontes de verdade
-- para a mesma coluna.

create index if not exists app_storage_user_idx on public.app_storage using btree (user_id);

-- ----------------------------------------------------------------------------
-- Carimbo de atualização.  Trigger BEFORE UPDATE que existe em produção e
-- também estava fora do repositório.  Ele é o que mantém `atualizado_em`
-- confiável — e `atualizado_em` é a MARCA DE SYNC da v2 (storageV2.ts:409).
-- Sem este trigger, uma escrita que esquecesse de setar a coluna deixaria a
-- hidratação incremental cega para a própria alteração.
-- ----------------------------------------------------------------------------

create or replace function public.touch_atualizado_em()
returns trigger
language plpgsql
as $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$;

drop trigger if exists app_storage_touch on public.app_storage;
create trigger app_storage_touch
  before update on public.app_storage
  for each row execute function public.touch_atualizado_em();
