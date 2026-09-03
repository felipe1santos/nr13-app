-- ============================================================================
-- FASE 9 · 9G.3 — REMOÇÃO DAS OITO FLAGS DE ROLLOUT
-- ============================================================================
--
--   ESTE ARQUIVO É A ÚLTIMA ETAPA DA REMOÇÃO, E SÓ RODA DEPOIS DO DEPLOY.
--
-- Ordem obrigatória, e o motivo de cada posição:
--   1. cliente  — o bundle novo para de LER as colunas;
--   2. testes   — a suíte para de exigir as flags;
--   3. SQL      — só então as colunas somem.
--
-- Invertida, o bundle no ar faria `select ... busca_v9, boot_v9, ...` contra um
-- banco que não tem mais as colunas: o PostgREST recusa o SELECT INTEIRO, e a
-- sincronização de flags cai no caminho de erro. Com a escada de recuo já
-- removida do cliente, isso significaria a sessão inteira sem `v2_ativa`.
--
-- ---------------------------------------------------------------------------
-- O QUE SAI, E O QUE FICA
-- ---------------------------------------------------------------------------
--
-- SAI: as OITO flags da Fase 9 e as oito funções que as viravam. Elas eram
-- MECANISMO DE ROLLOUT — cada uma existia para permitir ligar uma tela por
-- organização e desligar em segundos se algo desse errado. O rollout terminou
-- em 30/30, o gate global passou, e os caminhos legados saíram do cliente: sem
-- dois caminhos, não há o que escolher.
--
-- **FICA `v2_ativa`**, e não é descuido. Ela não é da Fase 9: separa dois
-- modelos de ARMAZENAMENTO (localStorage/upsert direto × Map+IndexedDB/RPC), e
-- a RLS do servidor a consulta. Desligá-la é rollback de infraestrutura, com
-- consequência no banco — nada a ver com trocar a fonte de uma lista.
--
-- **FICAM todas as projeções, RPCs e índices**: `equipamentos_index`,
-- `relatorios_index`, `calibracoes_index`, `buscar_equipamentos`,
-- `buscar_relatorios`, `buscar_livros`, `contar_relatorios_por_tag`,
-- `vencimentos_org`, `reparar_divergencias`, `auditar_projecao`. São o caminho
-- novo — o que ficou.
--
-- **NADA DE DADO É APAGADO.** `app_storage` não é tocado, nenhum PDF é
-- regenerado, nenhum registro de Livro é alterado, nenhum certificado é tocado.
-- Este arquivo mexe em NOVE objetos de configuração e em mais nada.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- Reaplicar os arquivos de flag de cada etapa (`busca_index.sql` para
-- `busca_v9`, `boot_v9_flag.sql`, `inspecoes_v9_flag.sql`, …,
-- `vencimentos_v9_flag.sql`, `relatorios_v9_flag.sql`) e republicar o bundle
-- anterior. As colunas nascem `default false`, e o bundle antigo volta a
-- escolher. Nenhum dado precisa ser reconstruído — as flags nunca guardaram
-- verdade.
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guarda: não remover a escada enquanto alguma organização ainda depender dela.
--
-- Se QUALQUER flag estiver desligada em alguma organização, significa que
-- alguém está usando o caminho legado — e o caminho legado acabou de sair do
-- cliente. Remover as colunas aqui deixaria essa organização sem tela.
-- ---------------------------------------------------------------------------
do $$
declare
  v_faltando integer;
begin
  select count(*) into v_faltando
    from public.org_sync
   where not (busca_v9 and boot_v9 and inspecoes_v9 and prontuarios_v9
              and calibracoes_v9 and livro_v9 and vencimentos_v9 and relatorios_v9);

  if v_faltando > 0 then
    raise exception
      'REMOCAO ABORTADA: % organizacao(oes) ainda com alguma flag da Fase 9 DESLIGADA. '
      'O caminho legado ja saiu do cliente — ligue as oito em 30/30 antes de remover.',
      v_faltando;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- As funções primeiro. Coluna com função dependente não cai sozinha, e derrubar
-- a coluna antes deixaria a função quebrada de pé.
-- ---------------------------------------------------------------------------
drop function if exists public.definir_busca_v9(uuid, boolean);
drop function if exists public.definir_boot_v9(uuid, boolean);
drop function if exists public.definir_inspecoes_v9(uuid, boolean);
drop function if exists public.definir_prontuarios_v9(uuid, boolean);
drop function if exists public.definir_calibracoes_v9(uuid, boolean);
drop function if exists public.definir_livro_v9(uuid, boolean);
drop function if exists public.definir_vencimentos_v9(uuid, boolean);
drop function if exists public.definir_relatorios_v9(uuid, boolean);

-- ---------------------------------------------------------------------------
-- E então as colunas.
-- ---------------------------------------------------------------------------
alter table public.org_sync drop column if exists busca_v9;
alter table public.org_sync drop column if exists boot_v9;
alter table public.org_sync drop column if exists inspecoes_v9;
alter table public.org_sync drop column if exists prontuarios_v9;
alter table public.org_sync drop column if exists calibracoes_v9;
alter table public.org_sync drop column if exists livro_v9;
alter table public.org_sync drop column if exists vencimentos_v9;
alter table public.org_sync drop column if exists relatorios_v9;

comment on table public.org_sync is
  'Configuracao por organizacao. Depois da 9G.3 (03/09/2026) sobrou v2_ativa: as oito flags da Fase 9 eram mecanismo de rollout e sairam junto com os caminhos legados do cliente. v2_ativa fica porque separa dois modelos de ARMAZENAMENTO e a RLS a consulta.';
