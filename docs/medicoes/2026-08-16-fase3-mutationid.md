# Fase 3 — pré-condição: semântica do `mutationId` depois de um conflito

**Data:** 16/08/2026 · **Executado contra:** produção, organização de TESTE
(`99f642d3…` = `teste@gmail.com`), chave descartável `nr13_teste_fase3`, removida ao fim.

> O plano macro proibia escolher o desenho por leitura de código. Isto é o resultado da
> execução. **Veredito: CASO B.**

## Roteiro e saída bruta

Sessão simulada no SQL Editor com
`set_config('request.jwt.claims','{"sub":"99f642d3-…"}',true)` — sem isso `auth.uid()` é
nulo e a RPC recusa. Perfil: `teste@gmail.com`, papel `mestre`, ativo.

| # | Chamada | Saída |
|---|---|---|
| 1 | `aplicar_mutacao_storage('nr13_teste_fase3', A, 'set', '{"origem":"aparelho-A"}', 0, 'dev-A', now())` | `{"status":"aplicado","versao":1}` |
| 2 | mesma chave, **id B**, versão esperada **0** (aparelho desatualizado) | `{"status":"conflito","versao":1,"valor":"{\"origem\":\"aparelho-A\"}", …}` |
| 3 | `select mutation_id, resultado from app_storage_mutacoes` | A → `{"status":"aplicado","versao":1}`<br>**B → `{"status":"conflito","versao":1,"valor":"…aparelho-A…"}`** |
| 4 | **reenvio do MESMO id B**, agora com versão esperada 1 | **`{"status":"repetido","versao":1,"valor":"{\"origem\":\"aparelho-A\"}"}`** |
| 5 | `select valor, versao from app_storage` | `{"origem":"aparelho-A"}`, versão **1** — **a edição de B nunca foi gravada** |
| 6 | **id NOVO C**, versão esperada 1 (a do servidor), mesmo valor de B | `{"status":"aplicado","versao":2}` |
| 7 | limpeza: `del` da chave | `{"status":"aplicado","versao":3}` |

## Veredito: CASO B

**A tentativa que termina em conflito fica REGISTRADA como resultado final.** O passo 3
prova: a linha de B em `app_storage_mutacoes` guarda `status: "conflito"`, que é distinto
de `'processando'` — e é essa distinção que o caminho rápido de idempotência usa:

```sql
if found and v_res->>'status' is distinct from 'processando' then
  return v_res || jsonb_build_object('status','repetido');
end if;
```

Por isso o passo 4 devolve `repetido`. E note **o que** ele devolve junto: o payload do
conflito, ou seja, o valor do **servidor** e a versão do **servidor**. Reenviar o mesmo id
não é "tentar de novo": é receber de volta o registro de que aquela tentativa falhou,
maquiado de sucesso.

## O defeito ativo que isto confirma

`sync.enviarItem` trata `repetido` como sucesso:

```ts
if (r.status === 'aplicado' || r.status === 'repetido') {
  const local = obterRegistro(item.chave);
  if (local) await gravarAtomico([{ chave, registro: { ...local, versao: r.versao } }]);
  await removerDaFila(item.mutationId);
  return true;
}
```

Logo, hoje, clicar **"Tentar de novo"** num item em conflito (ou **"Tentar todas"**, que
percorre todos os itens, inclusive os em conflito):

1. reenvia o mesmo `mutationId`;
2. recebe `repetido`;
3. **carimba a versão do servidor no registro LOCAL** — que ainda contém o valor do
   usuário;
4. **remove o item da fila** e reporta sucesso;
5. o servidor continua com o valor do outro aparelho (passo 5 acima).

O resultado é divergência **permanente e silenciosa**: a edição do usuário existe só no
aparelho dele, agora carimbada com a versão do servidor — e por isso
`cacheLocal.aplicarRemoto` (`local.versao >= remoto.versao`) nunca mais a corrige nem a
sobrescreve. Sem pendência, sem selo, sem erro. É perda de dado, e viola I-03 e I-05.

**Os dois conflitos parados desde 14/08 no aparelho do dono são exatamente esse gatilho.**
Foi por isso que a instrução de não clicar "Tentar de novo" neles se manteve durante toda
a fase.

## Desenho decidido pelo resultado

Vale o **Caso B** descrito no plano macro: a resolução "Manter a minha" precisa de um
`mutationId` NOVO, com `versaoBase` = versão do servidor (vinda do payload do conflito) e
vínculo `resolveDe` para o id original.

O passo 6 é a prova executada de que esse desenho funciona: id novo + versão base do
servidor → `aplicado, versao 2`. Não é violação de I-03: a idempotência protege contra
reenviar **a mesma** mutação; a resolução é uma mutação **diferente** — mesma intenção de
valor, base diferente, decisão humana no meio.

## Reprodução

```sql
select set_config('request.jwt.claims', '{"sub":"<uuid do mestre de teste>"}', true);
select public.aplicar_mutacao_storage('nr13_teste_fase3', gen_random_uuid(), 'set', '{"origem":"A"}', 0, 'dev-A', now());
-- repetir com outro id e versão esperada 0 para provocar o conflito
```

Use organização de teste. A chave `nr13_teste_fase3` não é lida por template nenhum e foi
removida ao fim deste roteiro.
