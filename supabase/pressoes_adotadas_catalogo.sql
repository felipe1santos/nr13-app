-- ============================================================================
-- PRESSÕES ADOTADAS NO CATÁLOGO DE `/equipamentos` — 15/09/2026
-- ============================================================================
--
-- ORDEM DE APLICAÇÃO (e ela importa):
--
--   1. supabase/busca_index.sql       (cria as colunas — `add column if not exists`)
--   2. supabase/busca_manutencao.sql  (a projeção passa a preenchê-las)
--   3. supabase/busca_consulta.sql    (a RPC passa a devolvê-las; DROP + CREATE)
--   4. ESTE ARQUIVO                   (retroalimenta as linhas já projetadas)
--
-- O QUE MUDOU, E POR QUÊ
--
--   O cartão de `/equipamentos` é o RESUMO DA FICHA. Em pressão, quem manda na
--   ficha é a seção "Pressões da Documentação" — o valor que o engenheiro
--   ADOTOU (`nr13_info_.pmtaAdotadaMpa` / `.pthAdotadaMpa`, sempre em MPa).
--   O cartão vinha mostrando a pressão CALCULADA pelo memorial
--   (`nr13_calc_.pmta` / `.pth`): 2,33 MPa no cartão onde a ficha dizia 2,2.
--
--   Colunas NOVAS, e não uma troca de significado de `pmta_mpa`/`pth_mpa`: as
--   calculadas seguem alimentando os cartões de Inspeções, Prontuários,
--   Relatórios e Calibrações, que não foram objeto desta mudança.
--
--   NULO = não adotada. O cartão escreve "—" e NÃO cai na calculada: exibir o
--   cálculo no lugar faria o resumo afirmar uma adoção que não houve, e
--   esconderia justamente o sinal de que falta definir o valor. Fora do cartão,
--   a precedência oficial do sistema continua sendo `adotada ?? calculada`
--   (PLACA, PRONTUARIO, INSPECOES, PDF vetorial) — nada disso mudou.
--
-- POR QUE UM BACKFILL DIRIGIDO, E NÃO `reiniciar_rebuild_busca()`
--
--   As colunas nascem NULAS em toda linha já projetada, e `auditar_projecao()`
--   compara `source_version` — não colunas. Ou seja: a linha antiga parece
--   convergida e NINGUÉM a reprojeta. Chamar `reconstruir_indice_busca()` com o
--   cursor em `concluido` devolve `{"processadas": 0}` e não faz nada.
--
--   Reprojetar a organização inteira funcionaria, mas relê 10 chaves por TAG e
--   já custou cota de egresso cara em 08/2026 (§12 do CLAUDE.md). Aqui o dado
--   sai de UMA chave que a linha já tem — `nr13_info_<TAG>` — e o `update` toca
--   só as colunas desta mudança.
--
--   `source_version` NÃO é mexida de propósito: ela é a versão da VERDADE que a
--   linha reflete, e este arquivo não muda o que a linha reflete — completa o
--   que faltava projetar dela. Mexer nela faria a auditoria acusar defasagem
--   onde não há.
--
-- Idempotente. Rodar duas vezes escreve o mesmo valor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0 · GUARDA: as colunas precisam existir ANTES
-- ---------------------------------------------------------------------------
-- Sem elas o `update` abaixo falha com "column does not exist" — e a mensagem
-- crua não diz qual arquivo ficou faltando. Falhar com o rumo escrito é a
-- diferença entre um deploy interrompido e meia hora procurando.
do $guarda$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'equipamentos_index'
       and column_name = 'pmta_adotada_mpa'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'equipamentos_index'
       and column_name = 'pth_adotada_mpa'
  ) then
    raise exception using
      message = 'equipamentos_index.pmta_adotada_mpa/pth_adotada_mpa nao existem',
      hint    = 'Aplique supabase/busca_index.sql antes deste arquivo.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- 1 · BACKFILL — todas as organizações, direto da verdade
-- ---------------------------------------------------------------------------
-- `f9_num` devolve null para vazio e para texto ilegível em vez de estourar, e
-- é a MESMA função que a projeção usa — as duas rotas precisam produzir o mesmo
-- número para a mesma ficha.
--
-- Um `update` só: são duas colunas numéricas por linha, e a tabela é a projeção
-- (~190 B/linha). Em 50.000 equipamentos isso é um seq scan com um join por
-- índice, não uma releitura da organização.
--
-- Equipamento cuja ficha não tem pressão adotada fica NULO — e é o resultado
-- certo, não uma falha do backfill.
update public.equipamentos_index e
   set pmta_adotada_mpa = public.f9_num(i.info ->> 'pmtaAdotadaMpa'),
       pth_adotada_mpa  = public.f9_num(i.info ->> 'pthAdotadaMpa')
  from (
    select org_id,
           substring(chave from 11) as tag,   -- len('nr13_info_') = 10
           public.f9_json(valor)    as info
      from public.app_storage
     where chave like 'nr13_info_%'
       and deletado_em is null
  ) i
 where e.org_id = i.org_id
   and e.tag    = i.tag
   -- Só escreve onde o valor MUDA. Rodar de novo não suja `projected_at` nem
   -- gera WAL à toa, e o `count` da saída vira a medida do que faltava.
   and (e.pmta_adotada_mpa is distinct from public.f9_num(i.info ->> 'pmtaAdotadaMpa')
     or e.pth_adotada_mpa  is distinct from public.f9_num(i.info ->> 'pthAdotadaMpa'));

-- ---------------------------------------------------------------------------
-- 2 · VERIFICAÇÃO — por ESTRUTURA, nunca pela mensagem "Success" (§13)
-- ---------------------------------------------------------------------------
-- `divergentes` PRECISA vir 0. Ele compara linha a linha a projeção com a
-- verdade, então um 0 aqui significa "toda ficha com pressão adotada tem a
-- mesma pressão no catálogo" — e não "o update rodou".
select
  count(*)                                            as linhas,
  count(e.pmta_adotada_mpa)                           as com_pmta_adotada,
  count(e.pth_adotada_mpa)                            as com_pth_adotada,
  count(*) filter (
    where e.pmta_adotada_mpa is distinct from public.f9_num(i.info ->> 'pmtaAdotadaMpa')
       or e.pth_adotada_mpa  is distinct from public.f9_num(i.info ->> 'pthAdotadaMpa')
  )                                                   as divergentes
from public.equipamentos_index e
join (
  select org_id, substring(chave from 11) as tag, public.f9_json(valor) as info
    from public.app_storage
   where chave like 'nr13_info_%' and deletado_em is null
) i on i.org_id = e.org_id and i.tag = e.tag;
