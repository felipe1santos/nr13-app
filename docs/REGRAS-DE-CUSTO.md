# Regras de custo

> **Regra nº 1: nenhuma chamada paga sem passar pela guarda; nunca em loop.**

Auditoria que originou estas regras: `docs/AUDITORIA-CUSTO.md` (14/10/2026).
Trava automática: `src/__tests__/regraDeCusto.test.ts` — roda no `npm test` e quebra o build.

## 1. Chamada paga no navegador = `chamarPago`

Toda API cobrada por uso chamada do navegador passa por `src/services/guardaCusto.ts`:

```ts
return chamarPago('google_places_text_search', chave, () => consultarPlaces(chave));
```

A guarda dá cache da sessão, deduplicação de chamadas iguais em andamento, uma chamada
diferente por vez, intervalo mínimo, teto por sessão, teto diário por aparelho e registro de
uso com custo estimado. Serviço novo = nova entrada em `POLITICAS` (custo, intervalo, tetos)
e o host em `HOSTS_PAGOS` do teste, apontando para o ÚNICO arquivo que o chama.

## 2. Chamada paga no servidor (Edge) = teto próprio + reserva antes de enviar

- Envio em lote (e-mail): **reservar** a linha com UPDATE condicional antes de enviar
  (`trial/lembretes.ts`), nunca SELECT → envia → marca. Teto de envios por execução.
- Ação disparada por cron: aceitar segredo em header (`TRIAL_CRON_SEGREDO`).
- Retry: sempre com teto de tentativas e espera crescente. Retry sem teto é loop.

## 3. Nada de chamada paga em efeito que roda por render

- Efeito que baixa ou chama API depende de **primitivos** (id, path, sha), nunca de objeto ou
  função montados no render (`VisualizadorPdf` → `chaveDoArtefato`).
- Timer nunca chama API paga. Timer que chama o Supabase: intervalo ≥ 30 s, pausa com aba
  oculta, trava contra sobreposição, teto de duração.
- Resposta paga entra no cache **antes** de qualquer re-render poder descartá-la (a guarda
  grava no cache dentro da própria promessa).

## 4. Chaves

- `VITE_*` vai para o bundle público: só URL, publishable key do Supabase e chave de
  navegador do Google (restrita por domínio e por API). Segredo de servidor
  (`SERVICE_ROLE`, `RESEND`, `PAT`, `SECRET`, `SEGREDO`…) só em `Deno.env.get` na Edge.
- Nenhuma chave literal em arquivo versionado. Segredo nunca em chat, código ou log — só o NOME.

## 5. Teto rígido fica no provedor

O código corta o loop na origem; o provedor corta o que o código não alcança (chave copiada,
bug novo). Toda API paga precisa de **cota diária + orçamento com alerta** no painel do
provedor — ver "Parte 3" em `docs/AUDITORIA-CUSTO.md`.
