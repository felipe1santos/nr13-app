-- ---------------------------------------------------------------------------
-- CERTIFICADOS DOS PADRÕES NO PAINEL DE VENCIMENTOS — 07/09/2026
--
-- Por que este arquivo existe, medido em produção:
--
-- A primeira tentativa de trazer estes prazos foi por PostgREST puro, sem SQL
-- nenhum:
--
--   select=chave,validade:valor->>"validade" ... &chave=like.nr13_rastreab_%
--
-- O PostgREST ACEITA a sintaxe (HTTP 200) e devolve as linhas — com TODOS os
-- campos projetados em `null`. `app_storage.valor` é `text`, não `json`, e o
-- operador `->>` sobre texto não extrai: não dá erro, dá vazio. Conferido na
-- organização 99f642d3 em 07/09/2026: duas linhas `nr13_rastreab_` voltaram
-- com `nome`, `tipo` e `validade` nulos, e o painel exibiu "Nenhum prazo
-- cadastrado" sobre um certificado que estava lá. É o MESMO defeito da queixa
-- original, num disfarce novo — e é por isso que a leitura passou a ser feita
-- por uma função, onde o `::jsonb` é explícito.
--
-- O QUE ESTA FUNÇÃO NÃO DEVOLVE: o arquivo. O `valor` completo guarda o PDF
-- do certificado (o cache local nem chega a vê-lo — CLAUDE.md §2-bis), e ler
-- uma data baixando megabytes de arquivo seria trocar um defeito por outro.
-- Saem daqui cinco strings curtas por certificado.
--
-- SEGURO DE APLICAR: só CRIA. Nenhum `drop`, nenhuma alteração de tabela,
-- nenhuma coluna nova. Não há caminho pelo qual rodar este arquivo derrube
-- objeto existente — ao contrário do rollout de 02/09 (CLAUDE.md §13), em que
-- o arquivo começava por dois `drop function`.
-- ---------------------------------------------------------------------------

create or replace function public.certificados_padrao_org()
returns table (
  chave          text,
  nome           text,
  tipo           text,
  certificado    text,
  validade       text,
  substituido_em text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.chave,
    -- `->>` só depois do cast EXPLÍCITO. Era esta linha que faltava.
    nullif(j.v ->> 'nome', '')              as nome,
    nullif(j.v ->> 'tipoInstrumento', '')   as tipo,
    nullif(j.v ->> 'certificadoPadrao', '') as certificado,
    nullif(j.v ->> 'validade', '')          as validade,
    nullif(j.v ->> 'substituidoEm', '')     as substituido_em
    from public.app_storage s
    -- `valor` é texto livre: um registro corrompido não pode derrubar a
    -- consulta inteira e apagar o painel de quem tem 20 certificados sãos.
    -- Daí o cast dentro de um lateral com guarda de validade.
    cross join lateral (
      select case
               when s.valor is null then null
               when jsonb_typeof(
                      (case when s.valor ~ '^\s*\{' then s.valor::jsonb else null end)
                    ) = 'object'
                    then s.valor::jsonb
               else null
             end as v
    ) j
   where s.org_id = public.org_atual()
     and public.org_atual() is not null
     -- O papel `cliente` (Portal) não enxerga o parque de instrumentos do
     -- inspetor. Mesma guarda de `vencimentos_org`.
     and coalesce(public.papel_atual(), '') <> 'cliente'
     and s.chave like 'nr13_rastreab\_%'
     and s.deletado_em is null
     and j.v is not null
   limit 2000;
$$;

-- Toda função nova nasce com EXECUTE para `public`, e `anon` HERDA de
-- `public`. Uma função `security definer` executável por sessão anônima é o
-- oposto do que o desenho exige — ver a mesma dupla de linhas em
-- `vencimentos_agregado.sql`.
revoke all on function public.certificados_padrao_org() from public, anon;
grant execute on function public.certificados_padrao_org() to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar DEPOIS, e não confiar na mensagem "Success")
--
--   select proname, prosecdef, proacl
--     from pg_proc where proname = 'certificados_padrao_org';
--   -- proacl NÃO pode conter anon= nem =X/ para public
--
--   select * from public.certificados_padrao_org();
--   -- as colunas nome/tipo/validade precisam vir PREENCHIDAS; nulas de novo
--   -- significam que o cast não está sendo aplicado.
--
-- ROLLBACK
--   drop function if exists public.certificados_padrao_org();
--   O painel volta a não conhecer certificados: os contadores que eles
--   alimentam passam a "—" e o selo diz o motivo. Nenhum dado se perde —
--   esta função só LÊ.
-- ---------------------------------------------------------------------------
