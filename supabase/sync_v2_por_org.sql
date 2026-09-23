-- ============================================================================
-- SYNC v2 POR ORGANIZACAO — tombstone e merge automatico, habilitados um a um
-- ============================================================================
--
-- NAO APLICADO EM PRODUCAO (22/09/2026). Este arquivo prepara a ativacao
-- CONTROLADA; aplicar nao liga nada para ninguem.
--
-- Idempotente. Aplicar pelo SQL Editor conferindo o SHA-256 antes de rodar
-- (§13 do CLAUDE.md): "Success" confirma que o servidor executou o que
-- recebeu, nao que recebeu o que voce escreveu.
--
-- ── POR QUE org_sync, E NAO UMA TABELA NOVA ─────────────────────────────────
--
-- `org_sync` ja e a porta de flag POR ORGANIZACAO deste sistema, e ja provou o
-- desenho oito vezes na Fase 9 (busca_v9, boot_v9, inspecoes_v9...). O app a le
-- UMA vez por boot, em `flag.sincronizarFlagDoServidor()`, e as colunas novas
-- saem na MESMA consulta: nenhum round-trip a mais.
--
-- Ela tambem ja tem a propriedade que o dono exigiu: a policy `org_sync_select`
-- deixa a organizacao LER a propria linha e nada mais, e nao existe policy de
-- INSERT/UPDATE nenhuma. Ou seja, usuario comum nao liga isto nem pelo
-- DevTools — nao ha caminho de escrita exposto. Quem liga e `definir_sync_v2`,
-- SECURITY DEFINER, com EXECUTE revogado de anon e authenticated: sobra o SQL
-- Editor (DBA) e o service_role.
--
-- Uma tabela dedicada daria o mesmo resultado com uma migracao a mais, uma RLS
-- a mais e uma consulta a mais por boot. `localStorage`, URL e query param
-- estao fora por definicao: isto e arquitetura de dados, nao preferencia de
-- tela.
-- ============================================================================

-- ── 1. As duas flags ────────────────────────────────────────────────────────
-- DEFAULT FALSE, e e isto que garante o requisito nao-negociavel: publicar o
-- bundle novo NAO muda o comportamento de nenhum cliente existente.
alter table public.org_sync
  add column if not exists sync_tombstone boolean not null default false;

alter table public.org_sync
  add column if not exists sync_merge_automatico boolean not null default false;

comment on column public.org_sync.sync_tombstone is
  'Exclusao em chave-lista MARCA o item (removidoEm) em vez de tira-lo. Pre-requisito do merge automatico.';

comment on column public.org_sync.sync_merge_automatico is
  'Conflito de chave-lista e resolvido por merge de tres vias. Exige sync_tombstone; ver a constraint.';

-- A REGRA MORA NO BANCO, e nao so no cliente.
--
-- merge sem tombstone e a unica combinacao capaz de DESFAZER uma exclusao: o
-- merge une, o aparelho atrasado devolve o item excluido, e ninguem pediu isso.
-- O cliente ja recusa a combinacao (`definirFlagsSync`), mas o cliente pode ser
-- trocado; a linha da tabela, nao.
alter table public.org_sync
  drop constraint if exists org_sync_merge_exige_tombstone;

alter table public.org_sync
  add constraint org_sync_merge_exige_tombstone
  check (sync_merge_automatico = false or sync_tombstone = true);

-- ── 2. Quem liga ────────────────────────────────────────────────────────────
-- Mesma porta de `definir_v2_org` e `definir_boot_v9`: virar a chave de uma
-- organizacao e decisao operacional, nunca acao de usuario.
create or replace function public.definir_sync_v2(
  p_org       uuid,
  p_tombstone boolean,
  p_merge     boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_merge and not p_tombstone then
    raise exception 'nr13_merge_exige_tombstone: ligar o merge automatico sem tombstone desfaz exclusoes';
  end if;

  insert into public.org_sync (org_id, sync_tombstone, sync_merge_automatico)
  values (p_org, p_tombstone, p_merge)
  on conflict (org_id) do update
    set sync_tombstone        = excluded.sync_tombstone,
        sync_merge_automatico = excluded.sync_merge_automatico;
end;
$$;

revoke all on function public.definir_sync_v2(uuid, boolean, boolean) from public, anon, authenticated;

-- ── 3. A GUARDA — a parte que nao depende de janela de tempo ────────────────
--
-- O bloqueador medido no ensaio: um aparelho no bundle ANTIGO exclui um item
-- da lista sem deixar marca. Para o merge, "ausente de um lado" e
-- indistinguivel de "criado no outro", entao a exclusao dele e DESFEITA.
--
-- A guarda nao pergunta quem enviou, e e de proposito. Num organizacao com
-- tombstone ligado, NENHUM cliente correto derruba um id: o protocolo 2 marca.
-- Entao a condicao e sobre o EFEITO da escrita, nao sobre a identidade de quem
-- escreveu — o que a torna imune a um cliente que mentisse sobre a propria
-- versao, e dispensa acrescentar parametro a `aplicar_mutacao_storage` (mexer
-- naquela funcao significa drop+create da unica porta de escrita do sistema,
-- risco que esta mudanca nao precisa correr — ver §13 do CLAUDE.md).
--
-- O que PASSA: acrescentar, editar, reordenar, e a exclusao do protocolo 2
-- (o id continua na lista, marcado). O que e RECUSADO: sumir com um id que
-- existia.
create or replace function public.ids_da_lista(p_valor text)
returns setof text
language plpgsql
immutable
as $$
declare
  v jsonb;
begin
  if p_valor is null then return; end if;
  begin
    v := p_valor::jsonb;
  exception when others then
    return;                       -- nao e JSON: nada a afirmar
  end;
  if jsonb_typeof(v) is distinct from 'array' then return; end if;
  return query
    select e->>'id'
      from jsonb_array_elements(v) e
     where jsonb_typeof(e) = 'object'
       and e->>'id' is not null
       and e->>'id' <> '';
end;
$$;

-- As CHAVES-LISTA. Espelho de `COLECOES` em src/services/colecoes.ts — os dois
-- precisam concordar, e `sincronizacaoPorOrg.test.ts` quebra se divergirem.
create or replace function public.eh_chave_colecao(p_chave text)
returns boolean
language sql
immutable
as $$
  select p_chave in ('nr13_pront_indice','nr13_rascunhos','nr13_lista_phs',
                     'nr13_clientes','nr13_agenda_notas')
      or p_chave like 'nr13_historico_indice_%'
      or p_chave like 'nr13_calibracoes_%'
      or p_chave like 'nr13_docs_%'
      or p_chave like 'nr13_componentes_cal_%'
      or p_chave like 'nr13_lotes_cal_%';
$$;

create or replace function public.guardar_exclusao_sem_marca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligado boolean;
  v_sumiu  text;
begin
  if not public.eh_chave_colecao(new.chave) then return new; end if;

  -- EXCLUIR A CHAVE INTEIRA NAO E EXCLUIR UM ITEM.
  --
  -- Achado na reauditoria de 23/09/2026, ANTES de aplicar. Sem esta linha a
  -- guarda recusaria apagar o equipamento inteiro: a RPC faz
  -- `set valor = null, deletado_em = now()`, `ids_da_lista(null)` devolve
  -- conjunto vazio, e `x not in (<vazio>)` e VERDADEIRO para todo id — entao
  -- TODO id contaria como derrubado.
  --
  -- E a excecao esta certa por merito, nao so por conveniencia: apagar a chave
  -- e outra operacao, com outra prova. A RPC registra o piso permanente em
  -- `app_storage_excluidos`, o cliente tem tombstone DE CHAVE para ela, e o
  -- merge de lista nunca a reinterpreta — nao existe o risco de ressurreicao
  -- que esta guarda evita. `excluirVaso` e `coletar_tombstones` passam por
  -- aqui.
  --
  -- Esvaziar a lista para `[]` continua sendo derrubada de itens, e e recusado.
  if new.deletado_em is not null or new.valor is null then return new; end if;

  select o.sync_tombstone into v_ligado
    from public.org_sync o
   where o.org_id = new.org_id;

  -- Organizacao sem linha, ou com a flag desligada: comportamento de sempre.
  if v_ligado is distinct from true then return new; end if;

  -- MANUTENCAO passa: e a porta do DBA, a mesma de `nr13_manutencao_autorizada`
  -- usada pelas rotinas de purga (§4-quinquies).
  if public.nr13_manutencao_autorizada() then return new; end if;

  select i into v_sumiu
    from public.ids_da_lista(old.valor) i
   where i not in (select j from public.ids_da_lista(new.valor) j)
   limit 1;

  if v_sumiu is not null then
    raise exception
      'nr13_exclusao_sem_marca: o item "%" sumiu da lista "%" sem tombstone. Atualize o aplicativo.',
      v_sumiu, new.chave
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Trigger PROPRIA, e nao uma alteracao de `trg_guardar_app_storage`: as duas
-- respondem perguntas diferentes, e juntar as respostas numa funcao so faria
-- o rollback de uma exigir o rollback da outra. O nome comeca depois de
-- `trg_guardar_app_storage` na ordem alfabetica, entao a guarda de escrita
-- direta continua sendo a primeira a falar.
drop trigger if exists trg_guardar_exclusao_sem_marca on public.app_storage;
create trigger trg_guardar_exclusao_sem_marca
  before update on public.app_storage
  for each row execute function public.guardar_exclusao_sem_marca();

-- ── 4. Quem sao os aparelhos, e que protocolo falam ─────────────────────────
--
-- O id ja existe e ja viaja: `nr13_dispositivo_id` vai em toda mutacao e fica
-- em `app_storage.dispositivo`. O que faltava era a VERSAO DO PROTOCOLO.
--
-- Por que uma tabela em vez de mais uma coluna em app_storage: a informacao e
-- do APARELHO, nao da linha de dado. Numa coluna ela seria reescrita a cada
-- gravacao e perdida na anterior.
create table if not exists public.org_dispositivos (
  org_id      uuid    not null,
  dispositivo text    not null,
  protocolo   integer not null default 1,
  visto_em    timestamptz not null default now(),
  primary key (org_id, dispositivo)
);

alter table public.org_dispositivos enable row level security;

drop policy if exists org_dispositivos_select on public.org_dispositivos;
create policy org_dispositivos_select on public.org_dispositivos
  for select using (org_id = public.org_atual());

-- Sem policy de INSERT/UPDATE: quem grava e a RPC abaixo, SECURITY DEFINER.
-- O aparelho nao escolhe a propria org (ela vem de org_atual(), que deriva de
-- auth.uid()) e nao escreve a linha de outro aparelho da mesma org sem
-- conhecer o id dele — que e local ao aparelho.
create or replace function public.registrar_dispositivo_sync(
  p_dispositivo text,
  p_protocolo   integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.org_atual();
begin
  if v_org is null or coalesce(p_dispositivo,'') = '' then return; end if;

  insert into public.org_dispositivos (org_id, dispositivo, protocolo, visto_em)
  values (v_org, p_dispositivo, greatest(coalesce(p_protocolo,1), 1), now())
  on conflict (org_id, dispositivo) do update
    -- GREATEST, e nao `excluded`: um aparelho nao "volta" de protocolo. Se
    -- voltasse, um bundle servido de cache velho rebaixaria a leitura e a
    -- organizacao pareceria menos pronta do que esta.
    set protocolo = greatest(public.org_dispositivos.protocolo, excluded.protocolo),
        visto_em  = now();
end;
$$;

grant execute on function public.registrar_dispositivo_sync(text, integer) to authenticated;

-- ── 5. A organizacao esta pronta? ───────────────────────────────────────────
--
-- Cruza DOIS conjuntos, e e o cruzamento que enxerga o bundle antigo:
--
--   A · quem ESCREVEU desde o corte  → app_storage.dispositivo (ja existe,
--       e o bundle antigo alimenta sem saber);
--   B · quem SE REGISTROU no protocolo 2 → org_dispositivos (so o bundle novo
--       chama).
--
-- A menos B = aparelhos ativos presumidos ANTIGOS. Presumir e correto aqui:
-- quem escreve e nao se registra so pode ser codigo que nao conhece a RPC nova.
--
-- `p_desde` e do chamador de proposito. Nao existe prazo derivavel de
-- primeiros principios para "ha quanto tempo o aparelho mais atrasado pode
-- reaparecer" — o sistema e offline-first e o inspetor passa dias em campo.
-- O corte honesto e A DATA DO DEPLOY do bundle com protocolo 2: quem
-- sincronizou depois dela carrega o bundle novo, porque sincronizar exige a
-- pagina aberta e o service worker so serve /assets/ do cache.
create or replace function public.sync_v2_prontidao(p_org uuid, p_desde timestamptz)
returns table (dispositivo text, protocolo integer, visto_em timestamptz, compativel boolean)
language sql
security definer
set search_path = ''
as $$
  with escreveram as (
    select s.dispositivo, max(s.atualizado_em) as visto_em
      from public.app_storage s
     where s.org_id = p_org
       and s.dispositivo is not null
       and s.atualizado_em >= p_desde
     group by s.dispositivo
  ),
  registrados as (
    select d.dispositivo, d.protocolo, d.visto_em
      from public.org_dispositivos d
     where d.org_id = p_org
       and d.visto_em >= p_desde
  )
  select coalesce(e.dispositivo, r.dispositivo),
         coalesce(r.protocolo, 1),
         greatest(coalesce(e.visto_em, r.visto_em), coalesce(r.visto_em, e.visto_em)),
         coalesce(r.protocolo, 1) >= 2
    from escreveram e
    full outer join registrados r on r.dispositivo = e.dispositivo;
$$;

revoke all on function public.sync_v2_prontidao(uuid, timestamptz) from public, anon, authenticated;

-- ============================================================================
-- COMO ATIVAR O CANARIO (quando for a hora — NAO agora)
-- ============================================================================
--   -- 1. conferir a prontidao, com o corte na data do deploy:
--   select * from public.sync_v2_prontidao('<ORG_ZZ>', '2026-09-23T00:00:00Z');
--   -- 2. so se nenhuma linha vier com compativel = false:
--   select public.definir_sync_v2('<ORG_ZZ>', true, true);
--
-- ROLLBACK, instantaneo e sem converter dado nenhum:
--   select public.definir_sync_v2('<ORG_ZZ>', false, false);
--
-- Tombstone ja gravado continua na lista depois do rollback, e e inofensivo:
-- o cliente com a flag desligada nao o cria, mas os leitores continuam
-- filtrando `removidoEm` — o item excluido segue invisivel, que e o que o
-- usuario pediu quando o excluiu.
-- ============================================================================
