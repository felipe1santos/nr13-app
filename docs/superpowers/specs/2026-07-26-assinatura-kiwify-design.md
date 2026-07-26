# Assinatura Kiwify — trial → paywall → cobrança recorrente

Data: 2026-07-26
Escopo desta spec: **blocos A + B** (estado de assinatura + integração Kiwify).
Fora do escopo: notificações por e-mail e WhatsApp (bloco C, spec própria).

---

## 1. Problema

O sistema tem trial de 48h (`plano='trial'`, `acesso_expira_em`) e, quando o prazo acaba,
o usuário é **deslogado** — não existe caminho para ele pagar sozinho, nem cobrança
recorrente, nem tratamento de inadimplência/cancelamento/chargeback. A liberação é manual,
pelo painel Admin.

## 2. Objetivo

O usuário assina sozinho, o acesso libera sozinho quando o pagamento é confirmado, e o
sistema degrada para **somente leitura** (não desloga) quando a assinatura não está em dia.

## 3. Decisões tomadas (com o dono do projeto)

| Tema | Decisão |
|---|---|
| Cobrança | Assinatura **recorrente no cartão** (Kiwify) |
| Bloqueio | Entra e vê tudo, mas **somente leitura** — não salva, não gera PDF, não imprime |
| Unidade de cobrança | **1 assinatura por organização**; sub-logins e portal herdam do mestre |
| Checkout | **Nova aba** para `pay.kiwify.com.br` + liberação automática por webhook (a Kiwify não tem checkout embutido) |
| Graça na inadimplência | **5 dias**, alinhado à retentativa de cartão da Kiwify |
| Cancelamento | Acesso até o fim do período já pago |
| Chargeback / reembolso | Somente leitura **imediata** |

### Dados da conta Kiwify (já configurados)

- Produto: **NR13-Solutions** — `4f89f940-5964-11f1-875a-0b55d0449a9f`
- Plano usado pelo sistema: **Mensal R$ 197** → `https://pay.kiwify.com.br/O9KdzEI`
- Método de pagamento do produto: **Apenas cartão de crédito** (ajustado em 26/07/2026)
- Outros planos existentes (não usados pelo app): Padrão R$297/mês; unico R$297/ano;
  Licença promo R$699/ano; Promocional R$997/ano; tteste R$5/ano

---

## 4. Máquina de estados

Estado por organização, guardado na linha do **mestre** em `profiles`.

| Status | Entra quando | Permissões |
|---|---|---|
| `trial` | Cadastro automático 48h (fluxo atual) | Tudo, menos PDF/impressão/importação (regra atual) |
| `ativa` | `compra_aprovada` ou `subscription_renewed` | Tudo |
| `graca` | `subscription_late` | Tudo + barra vermelha "cartão recusado" com contagem |
| `cancelada_no_prazo` | `subscription_canceled` com `assinatura_ate` no futuro | Tudo + aviso de término |
| `somente_leitura` | Trial venceu · graça venceu · `assinatura_ate` passou · chargeback/reembolso | Lê tudo; **não escreve, não gera PDF, não imprime** |

Transições:

```
trial ──(compra_aprovada)──> ativa
trial ──(prazo venceu)──> somente_leitura
ativa ──(subscription_renewed)──> ativa (+30d)
ativa ──(subscription_late)──> graca (5 dias)
graca ──(compra_aprovada|renewed)──> ativa
graca ──(5 dias sem pagamento | subscription_canceled)──> somente_leitura
ativa ──(subscription_canceled)──> cancelada_no_prazo
cancelada_no_prazo ──(assinatura_ate passou)──> somente_leitura
qualquer ──(chargeback|compra_reembolsada)──> somente_leitura
somente_leitura ──(compra_aprovada)──> ativa
```

**A data manda, não o webhook:** `somente_leitura` por vencimento não depende de um evento
chegar — é derivado de `assinatura_ate < now()` na própria função SQL. Webhook perdido não
libera acesso indevido.

## 5. Modelo de dados

`profiles` (novas colunas):

- `assinatura_status text not null default 'trial'`
- `assinatura_ate timestamptz` — fim do período pago (ou fim da graça)
- `kiwify_subscription_id text` — id da assinatura na Kiwify, quando o payload trouxer
- `kiwify_email text` — e-mail usado na compra (pode diferir do e-mail de login)

Ambas entram na lista do trigger `proteger_campos_sensiveis` — usuário não altera o próprio
status.

### Convivência com `plano` e backfill (obrigatório)

`plano` (`trial` / `completo` / `demonstracao`) **continua existindo** para o Admin e para os
bloqueios já escritos; quem decide permissão passa a ser `assinatura_status`. O SQL de
migração precisa classificar as contas atuais na mesma transação que cria a coluna —
sem isso, toda conta paga cairia em `trial` no dia do deploy:

| Conta hoje | `assinatura_status` | `assinatura_ate` |
|---|---|---|
| `plano='completo'` e `acesso_expira_em` nulo | `ativa` | nulo (vitalícia; nunca rebaixa) |
| `plano='completo'` com data futura | `ativa` | a data atual |
| `plano='trial'` com data futura | `trial` | `trial_fim` |
| qualquer uma com data no passado | `somente_leitura` | a data atual |
| `plano='demonstracao'` | `ativa` | nulo |

`assinatura_ate` nulo significa **sem vencimento** — a função de status nunca rebaixa esses
casos. É o que preserva as contas liberadas na mão pelo Admin.

Tabela nova `kiwify_eventos`:

- `id uuid pk`, `recebido_em timestamptz`, `evento text`, `payload jsonb`,
  `email text`, `subscription_id text`, `profile_id uuid null`,
  `processado boolean`, `erro text null`

Todo webhook é gravado **antes** de processar: auditoria, reprocesso e — quando
`profile_id` fica nulo — fila de órfãos para vínculo manual no Admin.

### Função SQL de status

```sql
create or replace function public.assinatura_status_org() returns text
```

Resolve o status **efetivo** da org do usuário atual: lê a linha do mestre
(`profiles where id = org_atual()`), e rebaixa para `somente_leitura` quando
`assinatura_ate < now()`. Sub-login e portal herdam sem código extra.

### RLS

`app_storage` (insert/update/delete) passa a exigir
`assinatura_status_org() in ('trial','ativa','graca','cancelada_no_prazo')`, substituindo
o `acesso_vigente()` atual. Leitura continua liberada — é o que dá o "só leitura".

## 6. Edge Function `kiwify_webhook`

- URL com segredo longo em query (`?s=<segredo>`), validado contra `config_global`.
  Motivo: a Kiwify **não documenta** assinatura HMAC para eventos de venda.
- Grava em `kiwify_eventos`, casa a conta por `email` (pré-preenchido por nós na URL do
  checkout) e, como reforço, por `sck` = `user_id` do Supabase.
- Aplica a transição da §4 e grava `assinatura_status` / `assinatura_ate` com `service_role`.
- Idempotência: mesmo `subscription_id` + mesmo evento + mesma data já processada = ignora.
- Eventos assinados na Kiwify: `compra_aprovada`, `subscription_renewed`, `subscription_late`,
  `subscription_canceled`, `compra_reembolsada`, `chargeback`.

**Risco conhecido:** o payload da Kiwify não é público. O parser lê os campos por
tentativa (`data.customer.email` / `Customer.email` / `email`) e, se não achar, grava o
evento como órfão em vez de falhar. O ajuste fino só é possível **depois de capturar um
evento real** (ver §9).

## 7. Front-end

- `src/services/assinatura.ts` — status espelhado, textos por estado, helpers
  `podeEscrever()` / `bloqueioDocumentos()`. Reaproveita o que `trial.ts` já faz.
- `BarraAssinatura` — irmã da `BarraTrial`, some quando `ativa`. Cor e texto por estado,
  botão **Assinar / Regularizar**.
- `ModalAssinatura` — resumo do plano; botão abre `pay.kiwify.com.br/O9KdzEI?email=<email>&sck=<user_id>`
  em nova aba; a tela fica em "aguardando confirmação" com polling do próprio status
  (a cada 10s, para em 15min ou quando liberar).
- Somente leitura: mesma mecânica criada para o Portal do Cliente
  (`storage.ts` grava só no cache local; `somenteLeituraDoc.ts` trava os iframes),
  com gatilho novo. Nada de segunda implementação.
- Admin: coluna de status da assinatura, aba de eventos órfãos com vínculo manual,
  e os botões de liberar/suspender que já existem.

O link do checkout e o segredo do webhook ficam em `config_global` — nada hardcoded.

### Avisos visuais (`ModalAviso`)

Hoje o projeto **não tem** modal/toast global: os bloqueios de trial usam `window.alert()`
(caixa cinza do navegador) em `pdfService.ts`, `printService.ts`, `importarPlanilhaService.ts`
e `ProntuarioFabricante.tsx`.

Componente novo `src/components/ModalAviso.tsx`, três variantes:

| Variante | Uso |
|---|---|
| `sucesso` (verde, ícone de check) | "Assinatura confirmada" ao liberar; lista o que foi desbloqueado |
| `alerta` (âmbar) | Graça: "cartão recusado, regularize em N dias" |
| `erro` (vermelho) | "Assinatura suspensa" ao tentar salvar/imprimir, com o motivo real (venceu / cartão recusado / cancelada / contestada) e botão **Regularizar** que abre o checkout |

`pdfService`/`printService` são serviços, não componentes — por isso caíram no `alert()`.
Em vez de transformá-los em React, eles passam a **emitir** o bloqueio pelo barramento que
já existe (`src/services/eventos.ts`, ampliado com um evento `nr13:aviso`), e um listener
montado no `Layout` desenha o modal. O funil único de bloqueio continua sendo um só.

O modal de sucesso do pagamento dispara uma vez por assinatura (marca no `localStorage`),
para não reaparecer a cada carregamento.

Efeito colateral positivo: os bloqueios do **trial** que já existem passam a usar o mesmo
modal — o `alert()` cinza atual some sem código novo, só trocando a chamada.

## 8. Testes

- Unitário da máquina de estados: cada transição da §4, incluindo webhook fora de ordem
  (renewed chegando depois de late) e evento duplicado.
- Unitário do parser: payloads em formatos diferentes → mesmo resultado; payload
  irreconhecível → órfão, nunca exceção.
- SQL: conta em `somente_leitura` lê e não escreve; sub-login herda o status do mestre.
- Front: barra e modal por estado; polling libera a tela sem F5.

## 9. Ordem de implantação (o que depende de ação manual)

1. Rodar o SQL novo (colunas, tabela de eventos, função, RLS) no SQL Editor.
2. Deploy da Edge Function `kiwify_webhook`.
3. Cadastrar o webhook na Kiwify (Apps → Webhooks) apontando para a função, com os 6 eventos.
4. **Compra de teste pelo link `tteste` (R$ 5)** para capturar o payload real.
5. Ajustar o parser com o payload capturado e refazer o teste.
6. Só então divulgar o botão de assinatura.

Até o passo 5, o sistema funciona com liberação manual pelo Admin — nenhum usuário fica
preso.

## 10. Fora de escopo (spec seguinte)

- Notificações por e-mail (precisa de SMTP próprio; o embutido do Supabase tem limite de
  ~2 msgs/hora).
- Notificações por WhatsApp (precisa de provedor contratado, número aprovado e templates
  homologados).
- Upgrade/downgrade de plano dentro do sistema.
- Cupom de desconto.
