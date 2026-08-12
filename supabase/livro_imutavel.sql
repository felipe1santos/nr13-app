-- ============================================================================
-- Livro de Registro de Segurança: entrada EMITIDA não se edita nem se apaga.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================
--
-- POR QUE NO SERVIDOR E NÃO NO APP:
--
--   O lacre criptográfico (features/relatorios/livroLacre.ts) DETECTA alteração
--   — hash do conteúdo mais o elo da entrada anterior. Detectar é muito, mas não
--   é impedir. Em 12/08/2026 eu mesmo alterei uma entrada já emitida em produção
--   com UMA chamada à RPC pelo console do navegador. Qualquer usuário da
--   organização com o DevTools aberto faz o mesmo.
--
--   Trava no cliente é sugestão. A única trava real fica aqui.
--
-- A REGRA: as entradas LACRADAS do livro só podem CRESCER.
--
--   A sequência de entradas lacradas do valor NOVO precisa COMEÇAR exatamente
--   pela sequência de entradas lacradas do valor ANTIGO — cada uma idêntica,
--   na mesma ordem. Isso recusa de uma vez:
--
--     - editar campo de entrada emitida  (a entrada deixa de ser idêntica)
--     - apagar entrada emitida           (some da sequência)
--     - reordenar entradas emitidas      (a ordem muda)
--     - inserir entrada emitida no meio  (a sequência antiga deixa de ser prefixo)
--
--   E continua permitindo o que é legítimo:
--
--     - acrescentar entrada nova ao fim (o caminho normal de cada inspeção)
--     - inserir ocorrência MANUAL (sem lacre) em qualquer posição cronológica
--     - retificar: entrada nova com `retificaDe`, com as duas permanecendo
--
-- COMPARAÇÃO POR IGUALDADE DE JSONB, não por recálculo do hash: reproduzir em
-- SQL a serialização canônica do TypeScript seria frágil, e qualquer divergência
-- boba entre as duas implementações recusaria gravação legítima. Igualdade
-- estrutural do jsonb dá a mesma garantia sem esse risco.
--
-- O QUE ISTO NÃO COBRE, e é honesto dizer:
--   - quem tem a `service_role` do projeto (você) continua podendo tudo;
--   - DELETE da chave inteira não é bloqueado aqui, senão excluir um equipamento
--     de propósito passaria a ser impossível. A exclusão deixa tombstone em
--     `app_storage_excluidos`, então fica registrada.
-- ============================================================================

begin;

create or replace function public.guardar_livro_imutavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antigas jsonb;
  v_novas   jsonb;
begin
  -- Só UPDATE do livro. `nr13_livro_config_` é configuração de exibição, não registro.
  if tg_op <> 'UPDATE'
     or new.chave not like 'nr13\_livro\_%'
     or new.chave like 'nr13\_livro\_config\_%' then
    return new;
  end if;

  -- Manutenção (purga, migração) roda como service_role e precisa passar.
  if current_setting('nr13.manutencao', true) = '1' then
    return new;
  end if;

  -- Valor não-JSON ou não-array: não é um livro reconhecível, deixa passar em vez
  -- de travar uma gravação legítima por um formato inesperado.
  begin
    if jsonb_typeof(old.valor::jsonb) <> 'array' or jsonb_typeof(new.valor::jsonb) <> 'array' then
      return new;
    end if;
  exception when others then
    return new;
  end;

  -- Sequência ORDENADA das entradas lacradas de cada lado.
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_antigas
    from jsonb_array_elements(old.valor::jsonb) with ordinality as t(e, ord)
   where e ? 'sha256';

  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into v_novas
    from jsonb_array_elements(new.valor::jsonb) with ordinality as t(e, ord)
   where e ? 'sha256';

  -- As antigas precisam ser PREFIXO exato das novas.
  if v_novas @> '[]'::jsonb
     and jsonb_array_length(v_novas) >= jsonb_array_length(v_antigas)
     and (
       select coalesce(bool_and(v_novas -> (ord - 1)::int = e), true)
         from jsonb_array_elements(v_antigas) with ordinality as t(e, ord)
     ) then
    return new;
  end if;

  raise exception
    'nr13_livro_imutavel: registro do Livro de Segurança já emitido não pode ser alterado, removido nem reordenado (chave %). Para corrigir, lance uma RETIFICAÇÃO — a entrada original permanece.', new.chave
    using errcode = 'P0001';
end $$;

drop trigger if exists trg_guardar_livro_imutavel on public.app_storage;
create trigger trg_guardar_livro_imutavel
  before update on public.app_storage
  for each row execute function public.guardar_livro_imutavel();

commit;

-- ── Conferência ────────────────────────────────────────────────────────────
-- 1. O trigger existe?
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.app_storage'::regclass
   and tgname = 'trg_guardar_livro_imutavel';

-- 2. TESTE (roda como o usuário dono do livro, NÃO como service_role).
--    O primeiro update deve PASSAR (acréscimo) e o segundo FALHAR (edição).
--
--    begin;
--      -- acrescentar entrada nova ao fim: permitido
--      update public.app_storage
--         set valor = (valor::jsonb || '[{"id":"NOVA","sha256":"aa"}]'::jsonb)::text
--       where chave = 'nr13_livro_<TAG>' and org_id = '<org>';
--      -- editar entrada lacrada: recusado com nr13_livro_imutavel
--      update public.app_storage
--         set valor = replace(valor, '"descricao":"', '"descricao":"MEXIDO ')
--       where chave = 'nr13_livro_<TAG>' and org_id = '<org>';
--    rollback;
