# ESTADO DAS FASES — porta de entrada

> **Abra este arquivo primeiro.** Ele diz em que ponto o projeto está e para onde ir. Cada
> linha aponta para o task-level onde mora o detalhe.
>
> **REGRA:** este arquivo é atualizado NO MOMENTO em que o estado muda — commit, push,
> redeploy, validação, portão. Não no fim da fase.

**Última atualização:** 19/08/2026 22:19
**Branch:** `main` · **Suíte:** 1042 testes / 84 arquivos, 0 falhas · **Build:** verde

## ⏳ BLOQUEADO — falta URL de produção e autenticação

Redeploy **anunciado** em 19/08/2026 22:35 (`main` @ `88956eb`, docs-only, contendo `cb26450`).
Os testes de produção **não começaram**.

**Faltam duas coisas, as duas só o dono fornece:**

1. **URL de produção.** Não está no repositório e não deve estar: `.env` não é versionado, o
   `Caddyfile` serve em `:80` e o deploy é manual no Coolify.
2. **Sessão autenticada em `teste@gmail.com`.** A senha não entra em código, Git, Markdown nem
   log — quem faz o login é o dono, no navegador.

**Já pronto, esperando só isso:** o método de confirmação do bundle. Não há carimbo de commit no
build, então a prova é por **assinatura de string** — literais que cada commit de 19/08 introduziu
e que sobrevivem à minificação. Validado contra o `dist/` local; basta procurá-los no JS servido.

Assim que destravar: confirmar bundle → **P1** → **P2**. **Fase 4: não começar.**

---

## Vocabulário de estado

Sempre use um destes. Nunca "concluído".

`PLANEJADO` → `EM IMPLEMENTAÇÃO` → `IMPLEMENTADO` → `TESTADO LOCALMENTE` → `COMMITADO`
→ `PUSH MAIN` → `AGUARDANDO REDEPLOY` → `DEPLOYADO` → `VALIDADO EM PRODUÇÃO` → `PORTÃO FECHADO`

---

## Quadro geral

| Fase | Tema | Estado | Portão | Task-level |
|---|---|---|---|---|
| **0-A** | Origem do papel na criação de perfil | ✅ VALIDADO EM PRODUÇÃO | — | `plans/2026-08-16-fase0-task-level.md` |
| **0-B** | Isolamento do Portal (A-01) | ✅ VALIDADO EM PRODUÇÃO, com 3 limitações registradas | **P1 ABERTO** | `plans/2026-08-16-fase0b-task-level.md` |
| **1** | Índice da hidratação (A-03) | ✅ VALIDADO EM PRODUÇÃO | — | *(sem task-level — ver abaixo)* |
| **2** | Observabilidade (A-11) | ✅ VALIDADO EM PRODUÇÃO · 1 item de doc aberto | — | `plans/2026-08-16-fase2-task-level.md` |
| **3** | Conflitos (A-14) | 🟡 PUSH MAIN · produção **PARCIAL** | **P2 ABERTO** | `plans/2026-08-16-fase3-task-level.md` |
| **4** | Portal: arquitetura de leitura (A-02) | 🚫 NÃO INICIAR — depende do P2 | P3 | — |
| 5…13 | ver plano macro | PLANEJADO | P4…P8 | `plans/2026-08-15-evolucao-arquitetura.md` |

**Fase atual:** 3 · **Tarefa atual:** Tarefa 8 (validação em produção)
**Próxima ação exata:** aguardar `REDEPLOY CONCLUÍDO`. Ordem combinada em 19/08/2026:
**P1 primeiro, P2 depois, Fase 4 só com autorização.**

Os dois roteiros já estão escritos e não dependem desta sessão:

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
Markdown até 19/08/2026 21:58.** Todas commitadas e no `main`; **redeploy PENDENTE DE
CONFIRMAÇÃO**.

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

## O que trava cada portão agora

### P1 (depois da Fase 0) — ABERTO

- [ ] Regressão do sistema interno **depois** das policies fail-closed, com conta
      `mestre`/`gerente`/`funcionario`
- [ ] Cliente-contra-cliente de arquivo na mesma organização (caso literal)
- [ ] `lerRemoto` recusando para cliente, exercitado com certificado legado real
- [ ] Revalidar o prontuário do Portal depois do fix `cb26450`

### P2 (depois da Fase 3) — ABERTO

- [ ] Confirmar que o bundle em produção é posterior a `cb26450`
- [ ] Roteiro de dois aparelhos na org de teste, com números
- [ ] Desfecho dos 2 conflitos reais parados desde 14/08
- [ ] Conferir que nenhum `nr13_conflito_*` sobrou em `dados` nos aparelhos migrados

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
