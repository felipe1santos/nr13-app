-- ============================================================================
-- FASE 9 · 9F.4.5 — FLAG DE ROLLOUT `livro_v9`
-- ============================================================================
--
-- Aplicar DEPOIS de busca_consulta.sql (a RPC que devolve `livro_entradas` e
-- `livro_ultima`).
--
-- A flag mora na MESMA tabela de `v2_ativa`, `busca_v9`, `boot_v9`,
-- `inspecoes_v9`, `prontuarios_v9` e `calibracoes_v9`. Nenhum mecanismo novo: o
-- app já lê `org_sync` uma vez por boot, em `flag.sincronizarFlagDoServidor()`,
-- e as SETE colunas saem na mesma consulta — nenhum round-trip a mais.
--
-- UMA FLAG POR TELA, e é o que torna o rollback barato: desligar esta devolve
-- `/livro-registro` ao caminho antigo sem tocar em `calibracoes_v9`,
-- `prontuarios_v9`, `inspecoes_v9`, `busca_v9` nem `boot_v9`.
--
-- DEFAULT FALSE. Com a flag ligada a tela deixa de chamar `lerTudo()` — ela é a
-- ÚLTIMA do sistema que ainda o fazia — e a lista passa a vir do catálogo. O
-- LIVRO em si continua vindo da verdade (`nr13_livro_<TAG>` em `app_storage`),
-- semeado sob demanda ao abrir o equipamento. Organização sem a flag continua
-- exatamente como hoje. Errar para o lado do OFF é o lado barato.
--
-- O QUE ESTA FLAG **NÃO** MUDA, e não pode mudar:
--   · o conteúdo de nenhuma entrada do livro;
--   · o lacre (`sha256`, `shaAnterior`, `lacradaEm`) e a verificação da cadeia;
--   · a trava de imutabilidade do banco (`livro_imutavel.sql`);
--   · as regras de assinatura;
--   · o PDF e os artefatos históricos.
-- Ela troca a fonte da LISTA. A projeção é catálogo, nunca a autoridade do
-- Livro de Registro.
--
-- A flag é MECANISMO DE ROLLOUT, não arquitetura permanente. Removê-la, junto
-- com o caminho antigo, é entrega da 9G.
--
-- Idempotente.
-- ============================================================================

alter table public.org_sync
  add column if not exists livro_v9 boolean not null default false;

comment on column public.org_sync.livro_v9 is
  'Fase 9 · 9F.4 · liga a tela /livro-registro pela projeção (catálogo do servidor + livro_entradas/livro_ultima) e a semeadura sob demanda da TAG, eliminando o último lerTudo() do sistema. O livro, o lacre e a imutabilidade continuam na verdade (app_storage). Rollout: uma org por vez. Desligar devolve o caminho antigo sem converter dado nenhum.';

-- ---------------------------------------------------------------------------
-- Liga/desliga uma organização. Mesma porta de `definir_calibracoes_v9`,
-- `definir_prontuarios_v9`, `definir_inspecoes_v9`, `definir_busca_v9` e
-- `definir_boot_v9`, e pelo mesmo motivo: virar a chave de uma organização é
-- decisão operacional, não ação de usuário.
-- ---------------------------------------------------------------------------
create or replace function public.definir_livro_v9(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_sync (org_id, livro_v9)
  values (p_org, coalesce(p_ativa, false))
  on conflict (org_id) do update set livro_v9 = excluded.livro_v9;
end;
$$;

revoke all on function public.definir_livro_v9(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Desligar para uma organização:
--   select public.definir_livro_v9('<ORG>'::uuid, false);
--
-- Remover a flag inteira (só quando a 9G tirar o caminho antigo):
--   drop function if exists public.definir_livro_v9(uuid, boolean);
--   alter table public.org_sync drop column if exists livro_v9;
--
-- Nada aqui guarda verdade: a coluna é um interruptor, e `app_storage` segue
-- sendo a fonte — do livro inclusive, e principalmente.
