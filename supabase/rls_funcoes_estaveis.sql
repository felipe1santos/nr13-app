-- ============================================================================
-- AS FUNÇÕES AUXILIARES DA RLS ESTÃO `VOLATILE` — e isso custa 244×
-- ============================================================================
--
-- ESTE ARQUIVO É INDEPENDENTE DA FASE 9. Não depende de `busca_v9`, não depende
-- das projeções, não depende da 9C. Beneficia TODA organização existente hoje.
-- Está separado de propósito, para ser decidido e implantado separadamente, e
-- tem rollback próprio: `rls_funcoes_estaveis_rollback.sql`.
--
-- ---------------------------------------------------------------------------
-- O QUE FOI MEDIDO
-- ---------------------------------------------------------------------------
-- Ler 1.000 chaves de `app_storage` como `authenticated`, com a RLS ativa, no
-- laboratório com 122.011 chaves — a MESMA instrução nos dois modos:
--
--   VOLATILE .... 248.685 buffers   ·   Filter por linha sobre 122.081 linhas
--   STABLE ......   1.021 buffers   ·   One-Time Filter + Index Only Scan
--
-- 244× menos leitura. O plano muda de NATUREZA, não de grau: com STABLE o
-- planner reconhece que `org_atual()` vale o mesmo para a instrução inteira e a
-- promove a `One-Time Filter`, avaliada UMA vez.
--
-- ---------------------------------------------------------------------------
-- POR QUE ACONTECE
-- ---------------------------------------------------------------------------
-- Função em `language sql` sem marcador de volatilidade nasce VOLATILE. Numa
-- cláusula de RLS, função VOLATILE é chamada UMA VEZ POR LINHA e não pode ser
-- içada para fora da varredura — e cada chamada faz um `select` em `profiles`.
--
-- ---------------------------------------------------------------------------
-- POR QUE `STABLE` ESTÁ CORRETO — a análise, função por função
-- ---------------------------------------------------------------------------
-- A propriedade exigida é: DENTRO DE UMA MESMA INSTRUÇÃO SQL, a função produz
-- legitimamente o mesmo resultado. Não "dentro da sessão", não "dentro da
-- transação" — o Postgres não guarda resultado de STABLE além da instrução.
--
--   is_admin()                   → auth.uid()                 [9 políticas]
--   org_atual()                  → auth.uid()                 [8 políticas]
--   papel_atual()                → auth.uid()                 [6 políticas]
--   acesso_vigente()             → auth.uid(), now()          [3 políticas]
--   assinatura_permite_escrita() → assinatura_status_org()    [3 políticas]
--   assinatura_status_org()      → org_atual(), now()
--
-- 1 · CORPO. Todas são `language sql` com UM `select`. Nenhuma faz INSERT,
--     UPDATE, DELETE, `nextval`, `NOTIFY` ou qualquer efeito colateral.
--
-- 2 · ENTRADAS. Só duas: o perfil do usuário em `profiles`, e as funções
--     `auth.uid()` e `now()`.
--
-- 3 · `auth.uid()` JÁ É STABLE (e `auth.jwt()` e `auth.role()` também). Ela lê
--     `current_setting('request.jwt.claim.sub')`, um GUC que o PostgREST grava
--     por requisição com `SET LOCAL`. Dentro de uma instrução ele não muda.
--
-- 4 · `now()` é STABLE por definição: devolve o instante de início da
--     transação, não o relógio corrente.
--
-- 5 · A LEITURA DE `profiles` usa o snapshot da instrução. Ainda que outra
--     transação altere o perfil no meio, a instrução em curso continua vendo o
--     mesmo snapshot — então repetir a chamada devolveria o mesmo valor de
--     qualquer forma. STABLE não introduz risco novo; apenas evita repetir.
--
-- 6 · TROCA DE SESSÃO ENTRE INSTRUÇÕES continua funcionando, e isso foi
--     provado: na mesma conexão, alternando o `sub` do JWT entre statements,
--     `org_atual()` acompanha a troca nos DOIS modos.
--
-- 7 · `SECURITY DEFINER` e `SET search_path TO 'public'` ficam INALTERADOS. A
--     volatilidade não tem relação com privilégio: quem podia o quê continua
--     igual, e a policy não é tocada.
--
-- ---------------------------------------------------------------------------
-- A PROVA
-- ---------------------------------------------------------------------------
-- `scripts/fase9/testes-rls-stable.sql` roda a MESMA bateria nos dois modos e
-- compara: 7 atores (mestre org A, sub-login da mesma org, mestre org B,
-- cliente do Portal, superadmin, conta com prazo VENCIDO, e `sub` inexistente)
-- × 12 provas (as 6 funções, SELECT em `app_storage`, SELECT na projeção,
-- INSERT/UPDATE/DELETE diretos, a RPC de escrita e a de busca), mais `anon`.
--
--   88 linhas de resultado funcional · IDÊNTICAS byte a byte nos dois modos.
--
-- Em particular, e nos dois modos: org A nunca enxerga a org B, o cliente do
-- Portal recebe ZERO, `anon` recebe zero ou `permission denied`, a conta
-- vencida LÊ mas não ESCREVE, e a escrita direta continua recusada pela guarda.
--
-- Idempotente. Rodável isolado, a qualquer momento.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · AS SEIS FUNÇÕES DA CADEIA
-- ---------------------------------------------------------------------------
-- As seis, e não só as duas mais visíveis. Deixar uma VOLATILE no meio anula o
-- ganho do trecho que ela domina — e marcar `assinatura_permite_escrita` como
-- STABLE enquanto ela chama uma VOLATILE seria rótulo inconsistente, porque a
-- chamada interna continuaria sendo reavaliada.
alter function public.org_atual()                  stable;
alter function public.papel_atual()                stable;
alter function public.is_admin()                   stable;
alter function public.acesso_vigente()             stable;
alter function public.assinatura_status_org()      stable;
alter function public.assinatura_permite_escrita() stable;

-- ---------------------------------------------------------------------------
-- 2 · A MESMA CORREÇÃO, DO LADO DA POLICY
-- ---------------------------------------------------------------------------
-- Envolver a chamada numa subconsulta escalar faz o Postgres avaliá-la como
-- `InitPlan` — uma vez por consulta. É o padrão documentado pelo próprio
-- Supabase, e vale MESMO com a função já STABLE, porque `security definer`
-- impede o inlining.
--
-- Aqui só as políticas que a Fase 9 criou. As de `app_storage` vivem em
-- `acesso_setup.sql` e NÃO são tocadas por este arquivo — o ganho de 244×
-- medido acima vem só dos `alter function`, sem mexer em política nenhuma do
-- sistema existente.
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

-- ---------------------------------------------------------------------------
-- 3 · O QUE ESTE ARQUIVO **NÃO** FAZ
-- ---------------------------------------------------------------------------
--   · não altera nenhum CORPO de função;
--   · não altera `security definer` nem `search_path`;
--   · não altera nenhuma política de `app_storage`;
--   · não altera dado de usuário;
--   · não depende da Fase 9 e não a habilita.
