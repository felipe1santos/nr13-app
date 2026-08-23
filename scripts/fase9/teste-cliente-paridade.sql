-- ============================================================================
-- FASE 9 · prova sintética da PARIDADE DO CLIENTE (23/08/2026)
-- ============================================================================
--
-- O caso que a produção NÃO exerce: `razaoSocial` DIFERENTE de `nomeFantasia`.
--
-- Nas duas organizações usadas na validação real os dois campos coincidiam, e
-- foi por isso que a precedência invertida (`nomeFantasia || razaoSocial` na
-- projeção contra `razaoSocial || nomeFantasia` no cartão antigo) passou
-- despercebida na comparação visual: os dois lados imprimiam o mesmo texto.
--
-- Este script projeta massa sintética PELO PROJETOR REAL — `projetar_equipamento`
-- lendo `app_storage` — e confere o resultado. Nada de `insert` direto na
-- projeção: o que se quer provar é o caminho que a `aplicar_mutacao_storage`, o
-- rebuild e o reparo usam.
--
-- ---------------------------------------------------------------------------
-- POR QUE UM BLOCO `do` QUE TERMINA EM `raise exception`
-- ---------------------------------------------------------------------------
-- A exceção final NÃO é falha: é o mecanismo de limpeza. Ela aborta o bloco, e
-- o Postgres desfaz TUDO que ele escreveu — massa, projeção, pendência. E, ao
-- contrário de um `rollback` solto, ela DEVOLVE o resultado das asserções na
-- mensagem, o que faz a prova funcionar igual no `psql`, no SQL Editor e em
-- qualquer cliente que só mostre o último resultado.
--
-- Ou seja: a saída ESPERADA deste script é um ERRO cuja mensagem começa com
-- `PARIDADE ...`. Leia a mensagem; é ela o relatório.
--
-- SEGURANÇA: nada fica gravado — nem em `app_storage`, nem na projeção, nem na
-- fila. Pode rodar em produção.
--
-- Uso:  psql … -f scripts/fase9/teste-cliente-paridade.sql
-- ============================================================================

do $$
declare
  v_org   uuid := '00000000-0000-4000-8000-0000000f9c11';  -- organização inventada
  v_user  uuid;
  v_linha record;
  v_saida text := '';
  v_ok    boolean := true;
begin
  -- `app_storage.user_id` tem chave estrangeira para `auth.users`. Um usuário
  -- REAL qualquer serve de portador: o `org_id` é que define o escopo, e ele é
  -- inventado — nenhuma organização real é tocada.
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'PARIDADE: nao ha usuario em auth.users para servir de portador';
  end if;

  -- -------------------------------------------------------------------------
  -- MASSA — três equipamentos, três formas de cadastro de cliente
  -- -------------------------------------------------------------------------
  insert into public.app_storage (org_id, user_id, chave, valor, versao, atualizado_em)
  select v_org, v_user, chave, valor::jsonb, 1, now() from (values
    -- 1 · razão social ≠ nome fantasia, COM cidade — o caso que produção não tem
    ('nr13_info_ZZ-PARIDADE-1', '{"descricao":"Vaso teste 1","tipo":"vaso"}'),
    ('nr13_emp_ZZ-PARIDADE-1',
     '{"razaoSocial":"Alfa Industria e Comercio Ltda","nomeFantasia":"Alfa Gases","cidade":"Serra","clienteId":"c1"}'),
    -- 2 · SÓ nome fantasia — a reserva precisa continuar valendo
    ('nr13_info_ZZ-PARIDADE-2', '{"descricao":"Vaso teste 2","tipo":"vaso"}'),
    ('nr13_emp_ZZ-PARIDADE-2', '{"nomeFantasia":"Beta Postos","cidade":"Vitoria","clienteId":"c2"}'),
    -- 3 · razão social SEM cidade — o cartão antigo imprime só o nome
    ('nr13_info_ZZ-PARIDADE-3', '{"descricao":"Vaso teste 3","tipo":"vaso"}'),
    ('nr13_emp_ZZ-PARIDADE-3', '{"razaoSocial":"Gama Energia S.A.","nomeFantasia":"Gama"}')
  ) as m(chave, valor);

  -- -------------------------------------------------------------------------
  -- PROJEÇÃO — pelo projetor real
  -- -------------------------------------------------------------------------
  perform public.projetar_equipamento(v_org, 'ZZ-PARIDADE-1');
  perform public.projetar_equipamento(v_org, 'ZZ-PARIDADE-2');
  perform public.projetar_equipamento(v_org, 'ZZ-PARIDADE-3');

  -- -------------------------------------------------------------------------
  -- ASSERÇÕES — `esperado` é o texto que o cartão ANTIGO produziria:
  --   [razaoSocial || nomeFantasia, cidade].filter(Boolean).join(' · ')
  -- -------------------------------------------------------------------------
  for v_linha in
    select x.tag,
           concat_ws(' · ', e.cliente_nome, e.cliente_cidade) as obtido,
           x.esperado
      from (values
        ('ZZ-PARIDADE-1', 'Alfa Industria e Comercio Ltda · Serra'),
        ('ZZ-PARIDADE-2', 'Beta Postos · Vitoria'),
        ('ZZ-PARIDADE-3', 'Gama Energia S.A.')
      ) as x(tag, esperado)
      left join public.equipamentos_index e on e.org_id = v_org and e.tag = x.tag
     order by x.tag
  loop
    if coalesce(v_linha.obtido, '') = v_linha.esperado then
      v_saida := v_saida || format(' | %s PASSA [%s]', v_linha.tag, v_linha.obtido);
    else
      v_ok := false;
      v_saida := v_saida || format(' | %s FALHA esperado=[%s] obtido=[%s]',
                                   v_linha.tag, v_linha.esperado, coalesce(v_linha.obtido, '(sem linha)'));
    end if;
  end loop;

  -- A busca livre continua achando pelo NOME do cliente...
  if (select count(*) from public.equipamentos_index
       where org_id = v_org and busca @@ public.f9_tsquery('alfa')) = 1 then
    v_saida := v_saida || ' | BUSCA-NOME PASSA';
  else
    v_ok := false;
    v_saida := v_saida || ' | BUSCA-NOME FALHA';
  end if;

  -- ...e a cidade NÃO entra no vetor, que é a decisão registrada em
  -- `busca_index_indices.sql`. Se um dia entrar, esta linha avisa.
  if (select count(*) from public.equipamentos_index
       where org_id = v_org and busca @@ public.f9_tsquery('serra')) = 0 then
    v_saida := v_saida || ' | CIDADE-FORA-DA-BUSCA ok';
  else
    v_saida := v_saida || ' | ATENCAO cidade entrou no vetor';
  end if;

  -- A exceção desfaz tudo e devolve o relatório. Saída esperada: `PARIDADE OK`.
  raise exception 'PARIDADE % %', case when v_ok then 'OK' else 'COM FALHA' end, v_saida;
end $$;
