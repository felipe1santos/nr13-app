-- ============================================================================
-- NR-13 — Armazenamento offline-first, Fase 1
-- Spec:  docs/superpowers/specs/2026-08-04-armazenamento-offline-design.md
-- Plano: docs/superpowers/plans/2026-08-04-armazenamento-offline-fase1.md
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ADITIVO: todas as colunas nascem com default e todas as tabelas/funcoes sao
-- novas. O frontend ATUAL (v1) continua funcionando com este SQL aplicado — ele
-- faz upsert direto e ignora as colunas novas. Isso e o que permite aplicar o
-- SQL antes do deploy do frontend.
--
-- NOTA SOBRE search_path = '' NAS FUNCOES SECURITY DEFINER:
-- com search_path vazio, nenhum schema do usuario e pesquisado; so o pg_catalog,
-- que o Postgres sempre inclui implicitamente. Por isso todo objeto de `public`,
-- `auth` e `storage` aparece qualificado, enquanto funcoes internas (now,
-- jsonb_build_object, greatest...) ficam sem prefixo — elas so podem resolver em
-- pg_catalog, que e exatamente a garantia que se quer.
-- ============================================================================

-- ── 1. Versionamento e soft-delete em app_storage ───────────────────────────
alter table public.app_storage add column if not exists versao      integer not null default 1;
alter table public.app_storage add column if not exists dispositivo text;
alter table public.app_storage add column if not exists deletado_em timestamptz;

-- AUDITORIA APENAS. O relogio do aparelho NUNCA decide aceitacao: um celular de
-- campo com a data adiantada passaria por qualquer regra baseada nesta coluna.
-- Quem decide e a versao (monotonica, atribuida pelo servidor).
alter table public.app_storage add column if not exists mutado_em_cliente timestamptz;

create index if not exists app_storage_deletado_idx on public.app_storage (org_id, deletado_em);

-- ── 2. Historico PERMANENTE de exclusoes ────────────────────────────────────
-- Preenchida NO MOMENTO DA EXCLUSAO (nao na coleta fisica): enquanto o tombstone
-- existia apenas como deletado_em em app_storage, um aparelho antigo podia
-- gravar deletado_em = null e o dado ressuscitava dentro da janela de 30 dias.
--
-- NUNCA E PODADA. E ela que torna o piso de versao permanente e dispensa
-- qualquer regra baseada em data do cliente.
create table if not exists public.app_storage_excluidos (
  org_id       uuid        not null,
  chave        text        not null,
  versao_final integer     not null,
  excluido_em  timestamptz not null default now(),
  primary key (org_id, chave)
);

alter table public.app_storage_excluidos enable row level security;

drop policy if exists excluidos_select_org on public.app_storage_excluidos;
create policy excluidos_select_org on public.app_storage_excluidos
  for select using (org_id = public.org_atual());

-- ── 3. Idempotencia: mutacoes ja processadas ────────────────────────────────
-- Sem isto, uma resposta perdida na rede fazia o app reenviar e o servidor
-- reaplicar. Com unicidade por (org_id, mutation_id), o reenvio devolve o
-- resultado anterior sem tocar no dado.
create table if not exists public.app_storage_mutacoes (
  org_id      uuid        not null,
  mutation_id uuid        not null,
  resultado   jsonb       not null,
  aplicado_em timestamptz not null default now(),
  primary key (org_id, mutation_id)
);

alter table public.app_storage_mutacoes enable row level security;
-- Sem policy de select: so a RPC (security definer) enxerga esta tabela.

-- ── 4. Corte de sincronizacao POR ORGANIZACAO ───────────────────────────────
-- DIAGNOSTICO APENAS (a UI usa para sugerir re-hidratacao completa). NAO e
-- criterio de aceitacao: seria baseado em data do cliente, e o piso de versao
-- ja cobre a ressurreicao de forma monotonica.
create table if not exists public.org_sync (
  org_id     uuid primary key,
  sync_corte timestamptz
);

alter table public.org_sync enable row level security;

drop policy if exists org_sync_select on public.org_sync;
create policy org_sync_select on public.org_sync
  for select using (org_id = public.org_atual());

-- ── 5. RPC TRANSACIONAL: unica porta de escrita do app v2 ───────────────────
-- POR QUE UMA RPC E NAO UPSERT: upsert com "versao + 1" nao detecta conflito
-- nenhum. Dois aparelhos leem a versao 4, os dois gravam 5, e o segundo
-- sobrescreve o primeiro em silencio. So uma comparacao "versao atual =
-- versao esperada" sob FOR UPDATE detecta, e ela precisa ser transacional.
--
-- NAO EXISTE PARAMETRO org_id: a organizacao vem sempre de org_atual(), que
-- deriva de auth.uid(). O cliente nao tem como afetar a org de outra conta.
create or replace function public.aplicar_mutacao_storage(
  p_chave           text,
  p_mutation_id     uuid,
  p_op              text,        -- 'set' | 'del'
  p_valor           text,
  p_versao_esperada integer,     -- 0 = espera que a chave NAO exista
  p_dispositivo     text,
  p_mutado_em       timestamptz  -- AUDITORIA APENAS
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org   uuid;
  v_user  uuid := auth.uid();
  v_res   jsonb;
  v_piso  integer;
  v_atual public.app_storage%rowtype;
  v_nova  integer;
begin
  -- Sessao anonima nao grava nada.
  if v_user is null then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  if p_op not in ('set','del') or p_chave is null or p_chave = '' then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  v_org := public.org_atual();
  if v_org is null then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- Redundante com org_atual() (que ja le o profile de auth.uid()), mantido
  -- como assercao explicita de que o usuario pertence a organizacao afetada.
  if not exists (
    select 1 from public.profiles p where p.id = v_user and p.org_id = v_org
  ) then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- IDEMPOTENCIA: mesma mutacao chegando de novo devolve o resultado anterior.
  select m.resultado into v_res
    from public.app_storage_mutacoes m
   where m.org_id = v_org and m.mutation_id = p_mutation_id;
  if found then
    return v_res || jsonb_build_object('status','repetido');
  end if;

  -- security definer IGNORA RLS: papel, prazo e assinatura sao re-checados aqui.
  if public.papel_atual() not in ('mestre','gerente','funcionario')
     or not public.acesso_vigente()
     or not public.assinatura_permite_escrita() then
    return jsonb_build_object('status','recusado','motivo','sem_permissao');
  end if;

  -- Marca a sessao como escrita-via-RPC para o trigger de piso (secao 5b).
  perform set_config('nr13.via_rpc', '1', true);

  -- NAO existe checagem por p_mutado_em em lugar nenhum desta funcao.
  v_nova := p_versao_esperada + 1;

  -- PISO DE VERSAO: chave ja excluida nao volta com versao antiga. Monotonico
  -- e permanente (app_storage_excluidos nunca e podada).
  select e.versao_final into v_piso
    from public.app_storage_excluidos e
   where e.org_id = v_org and e.chave = p_chave;

  if v_piso is not null and v_nova <= v_piso then
    v_res := jsonb_build_object('status','recusado','motivo','versao_obsoleta','versao', v_piso);
    insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
      values (v_org, p_mutation_id, v_res);
    return v_res;
  end if;

  select * into v_atual
    from public.app_storage s
   where s.org_id = v_org and s.chave = p_chave
   for update;

  if found then
    -- CONFLITO: alguem gravou entre a leitura do cliente e este envio.
    -- Devolve a linha vigente para o cliente preservar AS DUAS versoes.
    if v_atual.versao <> p_versao_esperada then
      v_res := jsonb_build_object(
        'status','conflito',
        'versao', v_atual.versao,
        'valor', v_atual.valor,
        'atualizado_em', v_atual.atualizado_em,
        'dispositivo', v_atual.dispositivo,
        'deletado_em', v_atual.deletado_em);
      insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;

    -- Tombstone ainda nao coletado: decidido por VERSAO, nao por data. O caso
    -- de escrita antiga ja foi barrado pelo piso acima; se chegou aqui com a
    -- versao casando, e recriacao legitima e segue adiante.
    if v_atual.deletado_em is not null and v_piso is not null and v_nova <= v_piso then
      v_res := jsonb_build_object('status','recusado','motivo','tombstone_mais_novo',
                                  'versao', v_atual.versao);
      insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;
  else
    -- Cliente esperava uma linha que nao existe mais.
    if p_versao_esperada <> 0 then
      v_res := jsonb_build_object('status','conflito','versao', 0, 'valor', null);
      insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
        values (v_org, p_mutation_id, v_res);
      return v_res;
    end if;
  end if;

  if p_op = 'set' then
    insert into public.app_storage
      (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em, mutado_em_cliente)
    values
      (v_org, v_user, p_chave, p_valor, v_nova, p_dispositivo, null, now(), p_mutado_em)
    on conflict (org_id, chave) do update
      set valor             = excluded.valor,
          versao            = excluded.versao,
          dispositivo       = excluded.dispositivo,
          deletado_em       = null,
          atualizado_em     = now(),
          mutado_em_cliente = excluded.mutado_em_cliente;
  else
    insert into public.app_storage
      (org_id, user_id, chave, valor, versao, dispositivo, deletado_em, atualizado_em, mutado_em_cliente)
    values
      (v_org, v_user, p_chave, null, v_nova, p_dispositivo, now(), now(), p_mutado_em)
    on conflict (org_id, chave) do update
      set valor             = null,
          versao            = excluded.versao,
          dispositivo       = excluded.dispositivo,
          deletado_em       = now(),
          atualizado_em     = now(),
          mutado_em_cliente = excluded.mutado_em_cliente;

    -- A PROVA da exclusao nasce agora, nao na coleta fisica.
    insert into public.app_storage_excluidos (org_id, chave, versao_final)
    values (v_org, p_chave, v_nova)
    on conflict (org_id, chave) do update
      set versao_final = greatest(public.app_storage_excluidos.versao_final, excluded.versao_final),
          excluido_em  = now();
  end if;

  v_res := jsonb_build_object('status','aplicado','versao', v_nova);
  insert into public.app_storage_mutacoes (org_id, mutation_id, resultado)
    values (v_org, p_mutation_id, v_res);
  return v_res;
end $$;

revoke all on function
  public.aplicar_mutacao_storage(text, uuid, text, text, integer, text, timestamptz)
  from public;
grant execute on function
  public.aplicar_mutacao_storage(text, uuid, text, text, integer, text, timestamptz)
  to authenticated;

-- ── 5b. Piso tambem contra escrita DIRETA (defesa em profundidade) ──────────
-- As policies de app_storage seguem permitindo insert/update direto, e o
-- frontend v1 DEPENDE disso. O trigger aplica o piso SOMENTE quando a escrita
-- veio pela RPC, que marca nr13.via_rpc.
--
-- Consequencia assumida (ver Task 14 do plano): durante um rollback para a v1,
-- aquela organizacao volta a ter a protecao que tinha ANTES deste projeto —
-- nenhuma. Nao e regressao introduzida aqui; e o comportamento da v1, que e
-- justamente para onde se esta voltando. Sem esta valvula, a v1 ficaria
-- impedida de recriar qualquer chave excluida, porque ela nao sabe enviar uma
-- versao superior ao piso.
create or replace function public.checar_piso_versao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_final integer;
begin
  if current_setting('nr13.via_rpc', true) is distinct from '1' then
    return new;  -- escrita direta (v1): semantica antiga, sem piso
  end if;

  select e.versao_final into v_final
    from public.app_storage_excluidos e
   where e.org_id = new.org_id and e.chave = new.chave;

  if v_final is not null and new.versao <= v_final then
    raise exception 'nr13_versao_obsoleta: chave % excluida na versao %', new.chave, v_final
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_checar_piso_versao on public.app_storage;
create trigger trg_checar_piso_versao
  before insert or update on public.app_storage
  for each row execute function public.checar_piso_versao();

-- ── 6. Coleta de lixo: por organizacao e SO para service_role ───────────────
-- A versao anterior deste desenho rodava "update profiles set sync_corte"
-- SEM FILTRO, alterando todos os perfis de todas as organizacoes.
--
-- Remove o VALOR das linhas excluidas ha mais de p_dias. A PROVA da exclusao
-- (app_storage_excluidos) permanece para sempre.
create or replace function public.coletar_tombstones(p_org uuid, p_dias integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'coletar_tombstones exige service_role';
  end if;

  delete from public.app_storage s
   where s.org_id = p_org
     and s.deletado_em is not null
     and s.deletado_em < now() - make_interval(days => p_dias);
  get diagnostics n = row_count;

  insert into public.org_sync (org_id, sync_corte)
  values (p_org, now() - make_interval(days => p_dias))
  on conflict (org_id) do update set sync_corte = excluded.sync_corte;

  -- Mutacoes antigas saem: o piso de versao ja barra qualquer reenvio delas.
  delete from public.app_storage_mutacoes m
   where m.org_id = p_org
     and m.aplicado_em < now() - make_interval(days => p_dias);

  return n;
end $$;

revoke all on function public.coletar_tombstones(uuid, integer) from public, authenticated;

-- ── 7. Reconciliacao de versao (usada ao REATIVAR a v2 apos rollback) ───────
-- Chaves recriadas pela v1 ficam com versao baixa enquanto o piso segue alto;
-- sem isto, a primeira edicao na v2 seria recusada como versao_obsoleta para
-- sempre. Nao mexe no historico: a protecao continua valendo para as chaves
-- que seguem excluidas.
create or replace function public.reconciliar_versoes_org(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' is distinct from 'service_role' then
    raise exception 'reconciliar_versoes_org exige service_role';
  end if;

  update public.app_storage s
     set versao = e.versao_final + 1
    from public.app_storage_excluidos e
   where e.org_id = s.org_id
     and e.chave  = s.chave
     and s.org_id = p_org
     and s.deletado_em is null
     and s.versao <= e.versao_final;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.reconciliar_versoes_org(uuid) from public, authenticated;

-- ── 8. Bucket de fotos (criado aqui, consumido na Fase 2) ───────────────────
insert into storage.buckets (id, name, public)
values ('inspecao', 'inspecao', false)
on conflict (id) do nothing;

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

drop policy if exists inspecao_remocao on storage.objects;
create policy inspecao_remocao on storage.objects for delete
  using (
    bucket_id = 'inspecao'
    and (storage.foldername(name))[1] = public.org_atual()::text
    and public.papel_atual() in ('mestre','gerente','funcionario')
    and public.acesso_vigente()
    and public.assinatura_permite_escrita()
  );
