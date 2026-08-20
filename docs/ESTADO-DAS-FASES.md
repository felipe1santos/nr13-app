# ESTADO DAS FASES — porta de entrada

> **Abra este arquivo primeiro.** Ele diz em que ponto o projeto está e para onde ir. Cada
> linha aponta para o task-level onde mora o detalhe.
>
> **REGRA:** este arquivo é atualizado NO MOMENTO em que o estado muda — commit, push,
> redeploy, validação, portão. Não no fim da fase.

**Última atualização:** 19/08/2026 23:15
**Branch:** `main` · **Suíte:** 1042 testes / 84 arquivos, 0 falhas · **Build:** verde

## ⏸ P1/P2 NÃO APROVADOS — fechando as ressalvas (19/08/2026 23:15)

O dono recusou fechar os portões com as ressalvas abertas. Em andamento:

1. **P1 — conta cliente no bundle ATUAL.** Cenário montado (`ZZ-FASE3` vinculado a Posto Shell
   Prime, criando o caso cliente-contra-cliente literal). **AGUARDANDO O DONO FAZER LOGIN** como
   `ipiranga@gmail.com` — não digito senha em campo de autenticação.
2. **P2 — offline REAL**, com DevTools → Network → Offline, e prova DIRETA de
   `mutationId`/`resolveDe`/`versaoBase` inspecionados na fila antes de reconectar.

Resultado anterior (por RPC) segue registrado e válido; não substitui estes dois.

---

## Resultado da rodada de 19/08 22:40–23:00

Validados em produção em 19/08/2026, na conta `teste@gmail.com`.
Evidência completa: `docs/medicoes/2026-08-19-p1-p2-producao.md`.

- **Bundle conferido byte a byte:** o `/assets/index-AIiLkfur.js` servido em
  `https://app.nr13sistema.com.br` tem SHA-256 **idêntico** ao do build local do `main`.
- **P1 passa** — o sistema interno não regrediu com as policies fail-closed.
- **P2 passa** — dois ciclos completos de conflito + regressão do fluxo de exclusão.
- **Falta só a aprovação do dono.** É o último passo da sequência do portão.

**Ressalvas nomeadas, nenhuma bloqueante:**

1. conta `papel='cliente'` não re-verificada (sem credencial; prova de 16/08 vale);
2. drenagem da fila **offline** não exercitada manualmente — o 2º aparelho foi encenado pela RPC;
3. primeiro clique em "Manter a minha" não registrou, sem erro no console — **não diagnosticado**.

**🔴 Achado que precisa de decisão sua (não corrigido):** os 2 itens presos de `EQUIPE TESTE`
**não são antigos — são recriados a cada boot**. A migração de histórico lê o array legado
`nr13_historico_relatorios`, não acha o `nr13_rel_` (o equipamento foi excluído) e recria as
chaves com `versaoBase 0`; o servidor recusa com `versao_obsoleta`. É um gerador permanente de
pendência, e a interseção do §7-sexies com o achado A-13. **Inspecionados e intocados.**

## Vocabulário de estado

Sempre use um destes. Nunca "concluído".

`PLANEJADO` → `EM IMPLEMENTAÇÃO` → `IMPLEMENTADO` → `TESTADO LOCALMENTE` → `COMMITADO`
→ `PUSH MAIN` → `AGUARDANDO REDEPLOY` → `DEPLOYADO` → `VALIDADO EM PRODUÇÃO` → `PORTÃO FECHADO`

---

## Quadro geral

| Fase | Tema | Estado | Portão | Task-level |
|---|---|---|---|---|
| **0-A** | Origem do papel na criação de perfil | ✅ VALIDADO EM PRODUÇÃO | — | `plans/2026-08-16-fase0-task-level.md` |
| **0-B** | Isolamento do Portal (A-01) | ✅ VALIDADO EM PRODUÇÃO, com 3 limitações registradas | **P1 aguardando aprovação** | `plans/2026-08-16-fase0b-task-level.md` |
| **1** | Índice da hidratação (A-03) | ✅ VALIDADO EM PRODUÇÃO | — | *(sem task-level — ver abaixo)* |
| **2** | Observabilidade (A-11) | ✅ VALIDADO EM PRODUÇÃO · 1 item de doc aberto | — | `plans/2026-08-16-fase2-task-level.md` |
| **3** | Conflitos (A-14) | ✅ VALIDADO EM PRODUÇÃO | **P2 aguardando aprovação** | `plans/2026-08-16-fase3-task-level.md` |
| **4** | Portal: arquitetura de leitura (A-02) | 🚫 NÃO INICIAR — depende da aprovação de P1 e P2 | P3 | — |
| 5…13 | ver plano macro | PLANEJADO | P4…P8 | `plans/2026-08-15-evolucao-arquitetura.md` |

**Fase atual:** 3 · **Tarefa atual:** Tarefa 8 (validação em produção)
**Próxima ação exata:** dono aprova ou recusa **P1** e **P2**. Roteiros executados; evidência em `docs/medicoes/2026-08-19-p1-p2-producao.md`.

Os dois roteiros ficam gravados, já com os resultados marcados:

| Portão | Roteiro | Onde |
|---|---|---|
| **P1** | "Roteiro de fechamento do P1" — regressão curta do sistema interno com as policies atuais | `plans/2026-08-16-fase0b-task-level.md` |
| **P2** | "Roteiro de dois aparelhos — P2" — ciclo completo de conflito + regressão do fluxo de exclusão | `plans/2026-08-16-fase3-task-level.md` |

---

## Fase 1 — não tem task-level, e não precisa ter

Fase de um commit só. Registro aqui para não parecer não-feita.

- **Estado:** VALIDADO EM PRODUÇÃO (16/08/2026)
- **Commit:** `da77d3c` · **SQL:** `supabase/indice_hidratacao.sql` (+ `_rollback`)
- **Índice:** `app_storage_org_atualizado_idx (org_id, atualizado_em, chave)`,
  `indisvalid = true`, 72 kB. Índices da tabela: 432 kB → 504 kB (+16,7 %)
- **Medição:** `docs/medicoes/2026-08-16-fase1-explain.md` — `EXPLAIN ANALYZE` antes/depois nos
  3 cenários. Cenário "nada mudou" (o comum): **61 → 2 buffers**, o nó `Sort` sumiu dos três, e
  `Rows Removed by Filter: 353` desapareceu
- **Ressalva já registrada e aceita:** o cenário "marca nula" (primeiro boot) ficou mais caro
  nesta escala (65 → 236 buffers), porque o `Index Scan` busca cada linha no heap. Documentado
  no próprio arquivo de medição, com o raciocínio

---

## Trabalho de 19/08/2026 — fora de fase, sem task-level

Sessão de uso/validação em produção que produziu correções. **Nenhuma delas tinha registro em
Markdown até 19/08/2026 21:58.** Todas commitadas, no `main` e **CONFIRMADAS EM PRODUÇÃO**
(SHA-256 do bundle idêntico ao build local, 19/08/2026 22:40).

| Commit | O que é | Pertence a |
|---|---|---|
| `8f19a26` | TAG com barra deixava a ficha do equipamento inalcançável — `:tag` casa um segmento só; 2 de 3 equipamentos de uma conta real eram inacessíveis. Correção central em `src/app/rotas.ts` | fora de fase (bug de produção) |
| `4a8e50e` | teste de navegação real, casando os construtores de rota contra o `router.tsx` | idem |
| `a85570a` | TAG nasce sem caractere invisível | idem |
| `f074a64` | **Fase 3** — item recusado por `tombstone_mais_novo`/`anterior_ao_corte` ficava contado no selo e invisível na tela, e a chave nunca recebia o `deletado_em` do servidor | **Fase 3** |
| `e72dd38` | a aba aberta também DESCE o que os outros aparelhos fizeram (`atualizarDoServidor`, throttle de 60 s, respeito ao palco) | sync (fora de fase) |
| `90c2b5f` + `9d9978c` | "TAG nova não aceita barra" — **implementado e revertido no mesmo dia**. A restrição não vale: a barra está na placa do equipamento | — |
| `cb26450` | **Fase 0-B** — prontuário do cliente não abria no Portal: `salvar()` recusado pelo gate de escrita do papel `cliente`. Consequência direta da policy fail-closed | **Fase 0-B** |

**Item aberto herdado de `cb26450`:** o caminho interno (`Prontuarios.tsx`) segue gravando
`nr13_prontuario_atual` por `salvar()` — sincroniza para o servidor uma chave efêmera de
renderização. Não quebra nada; é lixo de sincronização a limpar.

### O defeito de exclusão de `f074a64` — cobertura obrigatória daqui para frente

Já corrigido. **Não reimplementar.** Mas o comportamento entra no roteiro de regressão de
sincronização (P2), porque a falha era silenciosa e cara:

> Com uma pendência na chave, `lerTudo` a **pulava** (`sync.itemDaChave`), então o
> `deletado_em` vindo do servidor nunca era aplicado. Um equipamento excluído num aparelho
> continuava aparecendo no outro **indefinidamente, sem nenhum caminho na interface** para
> resolver — e o selo contava uma falha que a tela não sabia desenhar.

Cenário mínimo de regressão (conta de teste, ativos `ZZ-TESTE-*`):
criar equipamento → sincronizar → segunda sessão enxerga → excluir → sincronizar →
**segunda sessão deixa de enxergar**. Havendo o cenário de recusa correspondente, validar também
as duas saídas do card: **"Recriar no servidor"** e **"Descartar a minha"**.

---

## Situação de cada portão

### P1 (depois da Fase 0) — executado, aguardando aprovação

- [x] Regressão do sistema interno **depois** das policies fail-closed, com conta `mestre`
      → `GET /rest/v1/app_storage` com token de mestre = **HTTP 200**; hidratar, listar, abrir,
      editar, sincronizar e renderizar documento, todos verificados
- [x] Mestre não usa os caminhos do Portal → Edges `portal_cliente` e `portal_arquivo` = **403**
- [x] Revalidar o prontuário do Portal depois do fix `cb26450`
      → **parcial**: o prontuário INTERNO renderizou (palco + iframe). O do Portal exige conta
      cliente, que não tenho
- [ ] Cliente-contra-cliente de arquivo na mesma organização (caso literal)
- [ ] `lerRemoto` recusando para cliente, exercitado com certificado legado real
- [ ] Conta cliente re-verificada nesta rodada — **sem credencial; prova de 16/08 continua valendo**

### P2 (depois da Fase 3) — executado, aguardando aprovação

- [x] Confirmar que o bundle em produção é posterior a `cb26450` → **SHA-256 idêntico**
- [x] Roteiro de dois aparelhos na org de teste, com números
- [x] Desfecho dos 2 conflitos de `EQUIPE TESTE` → **inspecionados, intocados**; descoberto que
      são recriados a cada boot (a causa é o array legado, não os itens)
- [x] Nenhum `nr13_conflito_*` sobrou em `dados` → **0**, conferido três vezes
- [x] Regressão do fluxo de exclusão (`f074a64`) → criar → outro aparelho vê → excluir →
      outro aparelho deixa de ver, **sem fila residual**

**Ressalvas que ficam registradas** (não bloqueiam, mas não devem ser esquecidas): drenagem
offline não exercitada manualmente; primeiro clique em "Manter a minha" sem efeito, não
diagnosticado.

---

## Documentos de referência

| Documento | Papel |
|---|---|
| `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` | **Roteiro principal** (Revisão 3, fechado). Fases, portões, invariantes I-01…I-26 |
| `docs/auditoria-arquitetura-2026-08-15.md` | Achados A-01…A-18 com impacto e prioridade |
| `docs/medicoes/estado-arquitetural-atual.md` | Como o sistema funciona HOJE (rotas, escrita, leitura, PDF, offline, papéis) |
| `docs/medicoes/2026-08-16-baseline-inicial.md` | Marco zero de produção — egress, banco, bucket, base64 |
| `docs/ARMAZENAMENTO-LIMITES.md` | Os quatro tetos de armazenamento |
| `PENDENCIAS.md` | Pendências operacionais fora do roteiro de fases |

---

## Regras de sessão (combinadas em 19/08/2026)

1. **Markdown acompanha a execução.** Tarefa concluída → `[x]` na hora. Commit, push,
   redeploy, validação, portão → registrar na hora.
2. **`[x]` só com critério cumprido.** Parcial escreve `Status: PARCIAL — falta …` embaixo.
3. **Nunca inventar** deploy, teste, resultado ou medição. Sem prova, escrever
   `PENDENTE DE CONFIRMAÇÃO`.
4. **Antes de qualquer parada**, atualizar `## Ponto de retomada` no task-level ativo.
5. **Testes destrutivos** só em `teste@gmail.com`, com nomes `ZZ-TESTE-*`. Produção de cliente
   real é read-only. Senha nunca em código, Git, Markdown ou log.
6. **Parar no portão.** Nenhuma linha da fase seguinte sem autorização explícita do dono.
