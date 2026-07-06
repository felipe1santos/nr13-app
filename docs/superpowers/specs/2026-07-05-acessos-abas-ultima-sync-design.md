# Acessos: abas Equipe/Clientes + coluna "Última sincronização" + aviso "sem cliente"

Data: 2026-07-05. Aprovado pelo usuário em conversa (design + 3 decisões via perguntas).

## Objetivo

1. Controlar quais usuários conseguiram **enviar dados de campo ao servidor**: coluna
   "Última sincronização" na tela Acessos, depois de "Último acesso".
2. Separar a lista de Acessos em **duas abas**: "Equipe" (papéis gerente/funcionario) e
   "Clientes" (papel cliente, criados em Clientes → Acesso ao Portal) — a lista de clientes
   cresce muito e não pode poluir a lista da equipe.
3. **Aviso "sem cliente vinculado"** no card e na ficha do equipamento (sem bloquear nada):
   todo equipamento deve ter um cliente para aparecer no portal do cliente.

## Decisões (usuário escolheu)

- "Última sync" = **qualquer dado salvo com sucesso no servidor** (inclui fila offline drenada).
- Aba Clientes tem **coluna Empresa** (nome via `cliente_id` → `listarClientes()`) + busca.
- Equipamento sem cliente: **aviso visual**, sem validação dura. Gatilho: `nr13_emp_<TAG>.clienteId`
  vazio (é o campo que o portal_cliente usa para filtrar).

## Implementação

### Última sincronização
- **SQL** (`supabase/acesso_setup.sql`, idempotente):
  `alter table public.profiles add column if not exists ultima_sync timestamptz;`
- **App** (`src/services/storage.ts`): `registrarSync()` — best-effort, throttle 60s em memória,
  `update profiles set ultima_sync = now() where id = uid` (mesmo padrão RLS do heartbeat).
  Chamada após upsert com sucesso em `salvar()` e após dreno com ≥1 op na `flushFila()`.
  Coluna inexistente (SQL não rodado) → update falha silencioso; deploy do código é seguro.
- **Edge function** `org_admin` (`listar_subusuarios`): seleciona e devolve `ultima_sync`.
- **UI** (`Acesso.tsx`): coluna após "Último acesso", mesmo visual (azul ≤7d / cinza / "Nunca sincronizou").

### Abas em Acessos
- Abas "Equipe (n)" e "Clientes (n)" filtrando por `papel`.
- Equipe: tabela atual sem os logins de cliente; botão "+ Cadastrar novo acesso" só aqui.
- Clientes: E-mail, Empresa, Último acesso, Última sync, Status, Sessão, Ações
  (resetar senha / bloquear / excluir; sem permissões). Busca por e-mail/empresa.
  Atalho para criar acesso: Clientes → editar empresa → Acesso ao Portal.

### Aviso "sem cliente"
- `CardEquipamento.tsx`: linha da empresa vira aviso âmbar "Sem cliente vinculado" quando
  `!emp?.clienteId`.
- `DadosEmpresa.tsx` (ficha): mesmo aviso no modo visualização.

## Deploy (manual, dono do projeto)
1. Rodar `supabase/acesso_setup.sql` atualizado no SQL Editor (idempotente).
2. Redeploy da Edge Function `org_admin`.
3. Push do frontend.
Sem o SQL/redeploy, a coluna mostra "Nunca sincronizou" e o resto funciona.

## Fora do escopo
Portal do cliente e criação de acesso em Clientes (inalterados).
