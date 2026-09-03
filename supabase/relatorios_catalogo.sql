-- ============================================================================
-- FASE 9 · 9F.6 — CONTAGEM DE RELATÓRIOS POR TAG, PARA O CATÁLOGO
-- ============================================================================
--
-- Aplicar depois de `busca_index.sql` (que cria `relatorios_index`) e de
-- `busca_consulta.sql` (que cria `buscar_equipamentos`). As duas estão em
-- produção desde 23/08 e 03/09.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO É — e o que ele DELIBERADAMENTE não é
-- ---------------------------------------------------------------------------
--
-- O catálogo novo de `/relatorios` mostra, em cada cartão, quantos relatórios a
-- TAG tem. A tela antiga tirava esse número de `listarIndice(tag).length`, do
-- cache — logo, dependia de `lerTudo()`.
--
-- **NÃO criamos coluna nova em `equipamentos_index`.** Seria o padrão das
-- etapas anteriores (`inspecoes`, `tem_prontuario`, `calibracoes`,
-- `livro_entradas`), mas cada coluna nova custa: alteração em
-- `busca_manutencao.sql`, alteração em `busca_consulta.sql`, e **reprojeção
-- TAG a TAG** para sair de `null`. Aqui nada disso é necessário:
-- `relatorios_index` já guarda uma linha por relatório, já tem
-- `relatorios_index_org_tag_idx (org_id, tag)`, e contar sobre ele é um
-- Index Only Scan.
--
-- Uma chamada por PÁGINA (as 50 TAGs de uma vez), não uma por cartão. Contar
-- por cartão devolveria o `N+1` que esta fase inteira existe para remover.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FUNÇÃO NÃO TOCA
-- ---------------------------------------------------------------------------
--
-- O PDF, a geração do relatório e o histórico. Ela devolve DOIS campos por TAG:
-- o texto da TAG e um inteiro. `pdf_ref` e `sha256` não saem daqui — o artefato
-- continua sendo resolvido no clique, por `artefatoRelatorio` (invariante I10).
--
-- Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guarda: sem `relatorios_index` esta função não tem o que contar, e criá-la
-- assim mesmo faria o catálogo novo devolver erro a cada página em vez de
-- falhar aqui, uma vez, com a mensagem certa.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.relatorios_index') is null then
    raise exception 'relatorios_index nao existe: aplique busca_index.sql antes deste arquivo';
  end if;
end $$;

create or replace function public.contar_relatorios_por_tag(p_tags text[])
returns table (tag text, total integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.org_atual();
  v_papel text := coalesce(public.papel_atual(), '');
begin
  -- FAIL CLOSED, iguais às de `buscar_equipamentos` e `buscar_livros`: sem
  -- organização resolvida ou com papel `cliente`, devolve VAZIO — nunca a
  -- contagem de outra organização.
  if v_org is null or v_papel = 'cliente' then
    return;
  end if;

  -- Teto: a página do catálogo é de 50. Aceitar um array sem limite deixaria a
  -- porta aberta para uma chamada pedindo o parque inteiro de uma vez.
  if p_tags is null or array_length(p_tags, 1) is null or array_length(p_tags, 1) > 200 then
    return;
  end if;

  return query
  select r.tag, count(*)::integer
    from public.relatorios_index r
   where r.org_id = v_org
     and r.tag = any (p_tags)
   group by r.tag;
end;
$$;

comment on function public.contar_relatorios_por_tag(text[]) is
  'Fase 9 · 9F.6 · quantos relatorios cada TAG da PAGINA tem, numa chamada so, sobre relatorios_index. TAG ausente do resultado tem zero. Nao devolve pdf_ref nem sha256 — o artefato continua sendo resolvido no clique.';

-- `anon` não recebe: sem sessão não há `org_atual()`, e a função devolveria
-- vazio de qualquer forma — mas negar o EXECUTE é o fail closed.
revoke all on function public.contar_relatorios_por_tag(text[]) from public, anon;
grant execute on function public.contar_relatorios_por_tag(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
--   drop function if exists public.contar_relatorios_por_tag(text[]);
--
-- Nada se perde: a função é só leitura sobre uma projeção derivada.
