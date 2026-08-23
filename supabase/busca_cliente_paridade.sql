-- ============================================================================
-- FASE 9 · 9C — PARIDADE DO CLIENTE NO CARTÃO (correção, 23/08/2026)
-- ============================================================================
--
-- O QUE ESTE ARQUIVO CONSERTA
--
--   Medido em produção, organização `…8d211c`, com o mesmo equipamento:
--
--     flag OFF (cartão antigo) .... Posto Ipiranga · Vila Velha
--     flag ON  (cartão da V9) ..... Posto Ipiranga
--
--   O cartão antigo (`CardEquipamento.tsx`) monta
--     [razaoSocial || nomeFantasia, cidade].filter(Boolean).join(' · ')
--   e a projeção guardava UM campo só, com `nomeFantasia || razaoSocial`.
--
--   São DOIS defeitos, não um:
--     1 · a CIDADE não era projetada        → visível, some do cartão;
--     2 · a PRECEDÊNCIA estava invertida    → latente: só aparece quando razão
--         social e nome fantasia diferem, e aí o cartão troca de nome sem erro
--         nenhum na tela. Em produção os dois coincidiram e o defeito ficou
--         escondido — é o tipo de divergência que só um teste sintético pega.
--
-- O DESENHO: dois campos ESTRUTURADOS, `cliente_nome` e `cliente_cidade`.
--
--   A alternativa era gravar a string já composta ("Nome · Cidade"). Rejeitada:
--   petrificaria formatação de UI dentro do banco, e qualquer leitor futuro
--   (filtro por cidade, agrupamento, Dashboard, Portal) teria de fatiar texto
--   para recuperar o que já se sabia na hora de escrever. A composição é da
--   tela; o banco guarda o fato.
--
-- QUANDO USAR
--
--   Só em banco que JÁ recebeu a Fase 9 antes desta correção (produção, em
--   23/08/2026). Em banco novo não é preciso: `busca_index.sql` já cria as duas
--   colunas com os nomes certos.
--
-- ORDEM COMPLETA DA CORREÇÃO, em produção:
--
--   1 · ESTE arquivo            → renomeia a coluna e cria a nova
--   2 · busca_manutencao.sql    → projetor com a precedência e a cidade certas
--   3 · busca_consulta.sql      → a RPC devolve os dois campos
--                                 (ela já derruba as funções antes de recriar,
--                                  porque o TIPO DE RETORNO mudou)
--   4 · reprojetar as organizações já backfilladas:
--         select public.reiniciar_rebuild_busca('<ORG>');
--         select public.reconstruir_indice_busca('<ORG>', 1000);
--         select jsonb_pretty(public.auditar_projecao('<ORG>'));
--
-- POR QUE O PASSO 4 É OBRIGATÓRIO: renomear coluna não reescreve conteúdo. As
-- linhas existentes continuam com o nome fantasia no campo renomeado e a cidade
-- vazia até serem projetadas de novo. `app_storage` é a verdade e não foi
-- tocada — a projeção é derivada, e refazê-la é o caminho previsto.
--
-- O QUE ESTE ARQUIVO **NÃO** FAZ
--
--   · não reescreve a tabela: `alter table ... rename column` é só catálogo. A
--     coluna gerada `busca` referencia a coluna por OID, então o Postgres
--     atualiza a expressão sozinho e o GIN NÃO é reconstruído;
--   · não cria índice nenhum;
--   · não inclui a cidade no vetor de busca — ver a justificativa em
--     `busca_index_indices.sql` (a busca do caminho legado não pesquisa nem
--     cliente nem cidade; incluir a cidade obrigaria a derrubar e recriar a
--     coluna gerada, com rewrite da tabela e do GIN, por uma funcionalidade
--     que ninguém pediu nesta correção);
--   · não toca em `app_storage`, `source_version`, fila, tombstone ou RLS.
--
-- Idempotente: pode rodar duas vezes.
-- ============================================================================

do $$
begin
  -- 1 · `cliente` → `cliente_nome`
  if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'equipamentos_index'
           and column_name = 'cliente')
     and not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'equipamentos_index'
           and column_name = 'cliente_nome')
  then
    execute 'alter table public.equipamentos_index rename column cliente to cliente_nome';
  end if;
end $$;

-- 2 · a coluna nova. Fora do bloco: `add column if not exists` já é idempotente.
alter table public.equipamentos_index
  add column if not exists cliente_cidade text;

comment on column public.equipamentos_index.cliente_nome is
  'nr13_emp_<TAG>: razaoSocial || nomeFantasia — MESMA precedência do cartão antigo.';
comment on column public.equipamentos_index.cliente_cidade is
  'nr13_emp_<TAG>: cidade. A tela compõe "nome · cidade"; o banco guarda o fato separado.';

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
-- Depois deste arquivo, as duas colunas existem e a `busca` continua gerada:
--
--   select column_name, is_generated
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'equipamentos_index'
--      and column_name in ('cliente_nome', 'cliente_cidade', 'busca')
--    order by 1;
--
-- E a expressão da coluna gerada deve mencionar `cliente_nome` (o Postgres a
-- reescreveu sozinho no rename):
--
--   select pg_get_expr(adbin, adrelid) from pg_attrdef d
--     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
--    where d.adrelid = 'public.equipamentos_index'::regclass and a.attname = 'busca';
