-- ============================================================================
-- ACHADO DA 9C — AS FUNÇÕES AUXILIARES DA RLS ESTÃO `VOLATILE`
-- ============================================================================
--
-- ESTE ARQUIVO NÃO FAZ PARTE DA BUSCA. Ele é independente da Fase 9 inteira,
-- não depende de `busca_v9`, e beneficia TODA organização já existente hoje.
-- Ele está separado de propósito, para poder ser decidido separadamente.
--
-- O QUE FOI MEDIDO
--
--   Ler 1.000 chaves de `app_storage` como usuário `authenticated`, com a RLS
--   ativa, no laboratório com 122.011 chaves:
--
--     org_atual()/papel_atual() VOLATILE  ·  1.478.822 buffers · 1.417–2.176 ms
--     org_atual()/papel_atual() STABLE    ·      9.064 buffers ·         6,3 ms
--
--   163× menos leitura. 225× menos tempo. Duas linhas de ALTER.
--
-- POR QUE ACONTECE
--
--   Uma função em `language sql`/`plpgsql` sem marcador de volatilidade nasce
--   VOLATILE. Numa cláusula de RLS, função VOLATILE é chamada UMA VEZ POR
--   LINHA e não pode ser içada para fora da varredura. Cada chamada de
--   `org_atual()` faz um `select` em `profiles`. Multiplicado pelas linhas
--   varridas, vira o número acima.
--
--   Marcá-las STABLE está CORRETO, não é um atalho: as duas só LEEM o perfil do
--   usuário atual. STABLE é exatamente "não modifica o banco e devolve o mesmo
--   resultado dentro de uma mesma instrução" — que é o que elas fazem. O
--   VOLATILE era omissão do `create function`, não decisão.
--
-- O QUE NÃO MUDA
--
--   Nada de segurança. `security definer` continua igual, o corpo continua
--   igual, a policy continua igual, e quem não é da organização continua sem
--   ver linha nenhuma. Muda apenas QUANTAS VEZES o Postgres chama a função
--   dentro de uma instrução.
--
--   E não muda a ESCRITA: medido, uma mutação custa 1.533 buffers com ou sem
--   este arquivo. Escrita toca uma linha, e uma linha não multiplica nada.
--
-- Idempotente. Rodável a qualquer momento, isolado.
-- ============================================================================

alter function public.org_atual()   stable;
alter function public.papel_atual() stable;

-- As duas do caminho de escrita entram pelo mesmo motivo de correção, embora o
-- ganho medido nelas tenha sido nulo: escrita toca uma linha. Ficam STABLE para
-- que uma leitura futura sobre muitas linhas não repita o mesmo defeito.
alter function public.acesso_vigente()             stable;
alter function public.assinatura_permite_escrita() stable;

-- ---------------------------------------------------------------------------
-- A MESMA CORREÇÃO, DO LADO DA POLICY
-- ---------------------------------------------------------------------------
-- Envolver a chamada numa subconsulta escalar faz o Postgres avaliá-la como
-- `InitPlan` — uma vez por consulta, não por linha. É o padrão documentado pelo
-- próprio Supabase para RLS, e vale mesmo com a função já STABLE, porque
-- `security definer` impede o inlining.
--
-- Aqui só as políticas que a Fase 9 criou (9A). As de `app_storage` vivem em
-- `acesso_setup.sql` e NÃO são tocadas por este arquivo — o ganho de 163×
-- acima já vem só dos ALTER FUNCTION.
drop policy if exists equipamentos_index_select_org on public.equipamentos_index;
create policy equipamentos_index_select_org on public.equipamentos_index
  for select using (
    org_id = (select public.org_atual())
    and coalesce((select public.papel_atual()), '') <> 'cliente'
  );

drop policy if exists relatorios_index_select_org on public.relatorios_index;
create policy relatorios_index_select_org on public.relatorios_index
  for select using (
    org_id = (select public.org_atual())
    and coalesce((select public.papel_atual()), '') <> 'cliente'
  );
