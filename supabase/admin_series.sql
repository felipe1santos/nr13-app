-- ============================================================================
-- admin_series.sql — série DIÁRIA de atividade para os gráficos do Painel Admin
-- Rodar no SQL Editor do Supabase (idempotente: create or replace).
--
-- O painel já sabia dizer QUANTO existe (admin_usage_stats). Não sabia dizer
-- QUANDO — e "37 relatórios" sem eixo de tempo não distingue um cliente que
-- emitiu 37 no mês passado e parou de um que emite dois por dia.
--
-- ─── O QUE ESTA FUNÇÃO MEDE, E O QUE ELA NÃO MEDE ───────────────────────────
--
-- Mede ATIVIDADE, não criação. A coluna disponível é `app_storage.atualizado_em`,
-- mantida pelo trigger `touch_atualizado_em` (app_storage_base.sql), e ela anda
-- a cada ESCRITA na chave. Para `nr13_rel_<id>_<TAG>` os dois praticamente
-- coincidem — relatório salvo não se edita (§7-ter do CLAUDE.md) — mas para
-- `nr13_info_<TAG>` não: mexer na ficha de um vaso antigo o traz para o dia de
-- hoje. O rótulo na tela diz "atividade", e é isso mesmo que o número é.
--
-- Não existe coluna de criação em `app_storage` (a PK é (user_id, chave), sem
-- `criado_em`), e acrescentá-la agora nasceria toda preenchida com a data do
-- backfill — um gráfico com um pico falso no dia da migração e nada antes. Uma
-- mentira precisa é pior que uma verdade aproximada e rotulada.
--
-- Linha só aparece para dia com atividade; quem desenha o eixo é o front
-- (`serieDiaria` em painelAdmin.ts), que preenche o dia vazio com zero.
--
-- Segurança: mesma guarda de admin_usage_stats() — só `role = 'admin'`. Nenhuma
-- coluna devolve `valor` de chave, TAG ou nome de equipamento: só contagens.
-- ============================================================================

drop function if exists public.admin_series_uso(int);

create or replace function public.admin_series_uso(dias int default 30)
returns table (
  dia          date,
  relatorios   int,
  equipamentos int,
  inspecoes    int,
  fotos        int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.role = 'admin') then
    raise exception 'acesso negado';
  end if;

  -- Teto na janela: o painel pede 7/30/90. Sem limite, uma chamada com um
  -- número enorme varreria a tabela inteira agrupando por dia.
  if dias is null or dias < 1 then dias := 30; end if;
  if dias > 365 then dias := 365; end if;

  return query
  select
    -- O dia é o do FUSO DE SÃO PAULO, igual ao do front (painelAdmin.FUSO).
    -- Agrupar em UTC jogaria tudo depois das 21h para o dia seguinte, e as duas
    -- metades do painel discordariam sobre o mesmo evento.
    (s.atualizado_em at time zone 'America/Sao_Paulo')::date            as dia,
    count(*) filter (where s.chave like 'nr13\_rel\_%')::int            as relatorios,
    count(*) filter (where s.chave like 'nr13\_info\_%')::int           as equipamentos,
    count(*) filter (where s.chave like 'nr13\_docs\_%')::int           as inspecoes,
    count(*) filter (where s.chave like 'nr13\_fotos\_%')::int          as fotos
  from app_storage s
  where s.deletado_em is null
    and s.atualizado_em >= now() - make_interval(days => dias)
  group by 1
  order by 1;
end;
$$;

grant execute on function public.admin_series_uso(int) to authenticated;
