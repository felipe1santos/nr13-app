# Criação de conta: o erro que o administrador via não era o erro que acontecia

**04/09/2026.** Diagnóstico e correção do fluxo de criação manual de
conta/cliente.

---

## 1 · O que foi reproduzido

Na organização de TESTE (`99f642d3-…`, `teste@gmail.com`, papel `mestre`), os
três fluxos alcançáveis por um mestre **funcionaram**:

| fluxo | tela | resultado |
|---|---|---|
| sub-login de equipe | Acessos → Cadastrar novo acesso | **200** `{"ok":true,"id":"7bad8f8b…"}` |
| empresa/cliente | Clientes → Nova Empresa | **200** `aplicado` (RPC de mutação) |
| acesso ao portal do cliente | Clientes → Criar acesso | **200** `{"ok":true,"id":"40c9a63f…"}` |
| **retentativa com e-mail já usado** | Acessos | **200 com o MESMO id** — adotou, não duplicou |

O quarto fluxo — **criar uma CONTA nova pelo painel do superadmin** — não é
alcançável por esta conta (`role: user`), e é onde estava o defeito.

## 2 · O erro, medido contra a Edge de produção

Chamada real à Edge `admin` a partir do navegador:

```
error.message  →  "Edge Function returned a non-2xx status code"
corpo do 403   →  {"erro":"Acesso negado (não é admin)"}
```

**A explicação existia e nunca era lida.** É a diferença entre o que o
administrador via e o que de fato acontecia.

## 3 · A causa

`supabase.functions.invoke()` devolve `FunctionsHttpError` com uma frase fixa e
`data = null` sempre que a função responde não-2xx — e **toda recusa de negócio
desta Edge responde 400**. O padrão usado em `Admin.tsx`, em cinco lugares:

```ts
if (error) throw error;                       // ← sempre cai aqui
if (data?.erro) throw new Error(data.erro);   // ← inalcançável: data é null
```

A linha que mostraria a mensagem certa vinha depois da que sempre disparava.

> A extração correta **já existia no projeto**, dentro de `orgAdmin.ts`, com
> comentário explicando a armadilha. A Edge `admin` nunca recebeu o mesmo
> tratamento. Por isso o fluxo de sub-login dava mensagens claras e o de criar
> conta não.

### Três defeitos adicionais na Edge `admin` (`create_user`)

1. **Erro do perfil descartado.** `await admin.from('profiles').update(...)` sem
   checar retorno: se falhasse, a resposta era `ok: true` com uma conta que não
   entra.
2. **`update` em vez de `upsert`.** Se o trigger não tivesse criado a linha, o
   `update` não acerta nada e "dá certo" — conta no Auth, sem perfil, sem
   organização.
3. **Sem retomada de estado parcial.** Auth criado + etapa seguinte falha →
   retentativa devolvia *"A user with this email address has already been
   registered"* e o administrador ficava sem saída.

## 4 · A correção

### `src/services/edgeErro.ts` (novo)

`mensagemDeErroEdge(error, data, rotulo)` — lê, nesta ordem: `data.erro` →
corpo do não-2xx (`erro`, depois `message`/`error_description` do gateway) →
`error.message` se não for ruído → frase em português.

O ramo do `message` veio de uma medição: com chave inválida o gateway devolve
`{"message":"Invalid API key"}` **sem** `erro`, e sem esse ramo o problema de
configuração virava "tente novamente".

Aplicado nos **5** `invoke('admin')` de `Admin.tsx` e em `orgAdmin.ts`, que
perdeu a cópia local — regra que serve a todas as Edges não mora no cliente de
uma delas.

### `supabase/functions/admin/index.ts`

- `user_metadata: { nr13_papel: 'mestre' }` na origem, como em `org_admin`;
- **retomada de estado parcial** com três recusas explícitas: conta de
  administrador da plataforma, sub-login/portal de outra organização, e conta
  **com dados salvos** (consulta `app_storage`) — essa última aponta "Liberar
  acesso"/"Resetar senha" em vez de só recusar;
- `upsert` com `org_id` e `papel`, e **erro verificado**: falha ao gravar o
  perfil devolve `parcial: true` e instrui a repetir com o MESMO e-mail;
- mensagens em português.

**Nada foi afrouxado:** RLS intacta, `service_role` só na Edge (teste garante
que `Admin.tsx` não menciona a chave), a guarda `role !== 'admin'` continua, e
não há INSERT manual como solução.

## 5 · Testes

| | |
|---|---|
| `edgeErro.test.ts` | 10 — extração, ruído, gateway, corpo ilegível |
| `criacaoConta.edge.test.ts` | 17 — lê a Edge e o `Admin.tsx` e trava cada garantia |
| suíte | **1.769**, 147 arquivos, 0 falhas |
| `tsc -b` · `build` | limpos |

Entre as travas: "NÃO retoma conta que já tem dados", "NÃO retoma sub-login de
outra organização", "o erro do perfil é VERIFICADO", "a service_role continua só
na Edge" e "nenhuma chamada de Edge joga o erro cru na tela".

## 6 · O que ficou pendente

**A Edge `admin` NÃO foi publicada** — `~/.supabase` não tem `access-token`, o
mesmo bloqueio da Edge `portal_cliente`. Estado atual:

| parte | onde roda | publicada |
|---|---|---|
| mensagem real na tela (5 chamadas + orgAdmin) | bundle | **SIM** |
| retomada de estado parcial, upsert, erro do perfil | Edge `admin` | **NÃO** |

Com só o front publicado, o administrador **já deixa de ver "non-2xx"** e passa
a ler o motivo que a Edge atual devolve. As garantias de estado parcial entram
quando a Edge for publicada: `! npx supabase login --no-browser` e
`npx supabase functions deploy admin`.

## 7 · Limpeza

Criados e removidos pelo fluxo oficial: o sub-login `zz.teste.criacao…` e o
acesso de portal `zz.portal…`.

**Ficou** a empresa `ZZ TESTE CRIACAO CLIENTE LTDA` na org de teste: o botão
Excluir do card não respondeu ao clique sintético e não insisti na interface de
produção. É registro inerte, sem acesso de portal (removido) e sem equipamento,
na mesma organização onde todo o resto já é `ZZ-`. Excluir pela tela leva um
clique.

Nenhuma conta real foi tocada. O e-mail do dono foi deliberadamente **não usado**
no teste de duplicidade: o caminho de adoção redefine a senha, e num e-mail real
isso seria destrutivo.
