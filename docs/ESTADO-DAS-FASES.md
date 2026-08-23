# ESTADO DAS FASES — porta de entrada

> **Abra este arquivo primeiro.** Ele diz em que ponto o projeto está e para onde ir. Cada
> linha aponta para o task-level onde mora o detalhe.
>
> **REGRA:** este arquivo é atualizado NO MOMENTO em que o estado muda — commit, push,
> redeploy, validação, portão. Não no fim da fase.

**Última atualização:** 23/08/2026 03:10
**Branch:** `main` · **Suíte:** 1237 testes / 98 arquivos, 0 falhas · **Build:** verde


## ✅ P1, P2 e P3 APROVADOS · FASE 4 CONCLUÍDA

| | |
|---|---|
| **P1** (Fase 0) | **FECHADO ✅** aprovado 20/08 |
| **P2** (Fase 3) | **FECHADO ✅** aprovado 20/08 |
| **P3** (Fase 4) | **FECHADO ✅** aprovado 20/08 |
| **Fase 3** | **CONCLUÍDA** |
| **Fase 4** | **CONCLUÍDA** |
| **Fase 6** | ✅ **CONCLUÍDA** (20/08) — as 3 famílias recuperadas com integridade byte a byte, idempotente, protegidas intactas |
| **Fase 5** | ✅ **CONCLUÍDA** (20/08) — fotos de lista −87,4 %, palco da CAPA −91,6 %, offline real, Portal sem regressão, fechada com teste de foto real |
| Commits de fechamento | `caa168f` (P1/P2) · `676f81f` (P3) |
| Suíte | **1148/1148**, 91 arquivos · Build **verde** |

**Ganho da Fase 4, aprovado com base nas evidências:** leitura no Postgres **534,7 KB → ~21 KB**
(descarte de 93 % → ~zero), payload **31.403 → 21.592 bytes**, `nr13_rel_` e legado fora da carga
inicial, busca sob demanda funcionando, regressão de segurança completa e ataques ao modo novo
`{chaves:[…]}` — todos passaram.

**Ressalva aceita pelo dono:** **não** se afirma ganho de latência como conclusão da Fase 4 — a
dispersão observada não permite essa conclusão. O ganho provado é de **leitura e payload**.

---

## ✅ Risco operacional Supabase — ENCERRADO (aprovado pelo dono em 20/08)

Auditoria read-only em 20/08: **`docs/medicoes/2026-08-20-auditoria-cota-supabase.md`**

**Nenhuma métrica está excedida.** A maior é o Storage, em **33 %**; todos os *overages* em 0.
O badge `EXCEEDING USAGE LIMITS` refletia o ciclo **20/jul → 20/ago**, que fechou ontem — e já
**desapareceu**; o projeto está `Healthy`. O banner *"Grace period is over"* é **condicional**
("**If** your organization is over its quota…"), não uma constatação.

**Sem risco imediato. Sem necessidade de mudar de plano nem de prioridade.** Encerramento da
auditoria aprovado formalmente pelo dono. Projeto `Healthy`.

O que fica para acompanhar é **estoque, não fluxo**: o Storage não zera no reset, e **o PDF de
relatório é 99,5 % dele**, a ~5,9 MB por arquivo. É exatamente o alvo das **Fases 11 e 12**
(PDF vetorial) — o roadmap já aponta para lá.

## 🔴 ACHADO ABERTO — `EQUIPE TESTE` recriado a cada boot

**NÃO CORRIGIR INCIDENTALMENTE.** Não limpar o array legado. Não remover à mão só para sumir da
fila. Não "consertar" no meio de outra fase sem análise. Pertence ao **legado / achado A-13** e
será tratado na fase apropriada do roadmap (10A/10B).

### Causa provável COMPROVADA

```
legado persistente no SERVIDOR  (nr13_historico_relatorios ainda contém o relatório)
   → migração em segundo plano  (migrarHistoricoEmSegundoPlano, no boot)
   → equipamento/relatório JÁ EXCLUÍDO  (não há nr13_rel_ correspondente)
   → recriação da mutação        (nr13_rel_ + nr13_historico_indice_, versaoBase 0)
   → servidor recusa             (versao_obsoleta — piso em app_storage_excluidos)
   → novo boot repete
```

### Por que não é corrupção de um navegador

Reproduzido em **outro navegador (Brave), outra conta (`inspetor01@gmail.com`) e outro
IndexedDB**, durante o teste do P2. O mesmo item preso apareceu numa sessão que nunca tinha
tocado naquele equipamento. A causa está no servidor, não no aparelho.

### Efeito

Gerador permanente de pendência: toda abertura do app produz mutações que o servidor nunca vai
aceitar, e o selo fica em falha para sempre. Não impede o funcionamento normal da Fase 3 — os
conflitos reais nascem, são resolvidos e drenam normalmente, como o P2 provou.

## Vocabulário de estado

Sempre use um destes. Nunca "concluído".

`PLANEJADO` → `EM IMPLEMENTAÇÃO` → `IMPLEMENTADO` → `TESTADO LOCALMENTE` → `COMMITADO`
→ `PUSH MAIN` → `AGUARDANDO REDEPLOY` → `DEPLOYADO` → `VALIDADO EM PRODUÇÃO` → `PORTÃO FECHADO`

---

## Quadro geral

| Fase | Tema | Estado | Portão | Task-level |
|---|---|---|---|---|
| **0-A** | Origem do papel na criação de perfil | ✅ VALIDADO EM PRODUÇÃO | — | `plans/2026-08-16-fase0-task-level.md` |
| **0-B** | Isolamento do Portal (A-01) | ✅ VALIDADO EM PRODUÇÃO — sem ressalva | **P1 FECHADO ✅** aprovado 20/08 | `plans/2026-08-16-fase0b-task-level.md` |
| **1** | Índice da hidratação (A-03) | ✅ VALIDADO EM PRODUÇÃO | — | *(sem task-level — ver abaixo)* |
| **2** | Observabilidade (A-11) | ✅ VALIDADO EM PRODUÇÃO · 1 item de doc aberto | — | `plans/2026-08-16-fase2-task-level.md` |
| **3** | Conflitos (A-14) | ✅ **CONCLUÍDA** | **P2 FECHADO ✅** aprovado 20/08 | `plans/2026-08-16-fase3-task-level.md` |
| **4** | Portal: arquitetura de leitura (A-02) | ✅ **CONCLUÍDA** | **P3 FECHADO ✅** aprovado 20/08 | `plans/2026-08-20-fase4-task-level.md` |
| **5** | Fotos: thumbnail, EXIF, teto de altura (A-08) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** | — | `plans/2026-08-20-fase5-task-level.md` · `medicoes/2026-08-20-fase5-producao-antes-depois.md` |
| **6** | Recuperação do fallback base64 (A-10) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** nas 3 famílias, com SHA-256 idêntico | — | `plans/2026-08-20-fase6-task-level.md` |
| **9** | Escala, busca e carregamento sob demanda | 🟡 **9A/9B/9C CONCLUÍDAS · 9C tecnicamente aprovada** — P9.2 aguardando validação REAL | P9.1…P9.5 | `plans/2026-08-22-fase9-task-level.md` · `specs/2026-08-22-fase9-escala-busca-design.md` |
| **8** | Escala, dataset e medições | ✅ **CONCLUÍDA** (22/08) — diagnóstico aprovado; o critério de produto **NÃO PASSA em grande escala**, e isso é o mandato da Fase 9 | — | `plans/2026-08-22-fase8-task-level.md` · `medicoes/2026-08-22-fase8-fechamento.md` |
| **7** | Logo e rubrica por conteúdo (A-05) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** (7A EXPAND + 7B SWITCH, Portal e offline real) | **P4 FECHADO ✅** aprovado 22/08 | `plans/2026-08-20-fase7-task-level.md` · `medicoes/2026-08-20-fase7b-validacao-producao.md` |
| **8** | Escala, dataset determinístico e medições (A-17) | 🟡 **PLANEJADA** — AS-IS, dataset e plano de medição escritos; **nenhuma massa gerada** | — | `plans/2026-08-22-fase8-task-level.md` |
| 9…13 | ver plano macro | PLANEJADO | P5…P8 | `plans/2026-08-15-evolucao-arquitetura.md` |

**Fase atual:** **9 — 9C TECNICAMENTE APROVADA. P9.2 aguardando VALIDAÇÃO EM ORGANIZAÇÃO REAL.**

**9D a 9G não autorizadas.** **Produção sem nada aplicado.**

| | |
|---|---|
| Desenho | **APROVADO** (`8e82cf6`) |
| Task-level | **APROVADO** (`2fada5b`) |
| **9A** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9a-peso-projecao.md` |
| **9B** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9b-projecao-na-rpc.md` · P9.1 aprovado |
| **9C** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9c-indices.md` e `-tela.md` |

**Próxima ação exata:** executar `plans/2026-08-23-validacao-real-9c.md` numa organização real —
**bloqueado** enquanto o aviso `Grace period is over` do Supabase não for esclarecido.

### O que a 9C entregou

`/equipamentos` passa a ler da projeção sob a flag `busca_v9`. Medido na mesma organização, com
a flag ligada e desligada pelo servidor:

| | OFF (hoje) | ON (v9) |
|---|---:|---:|
| Nós no DOM | **42.450** | **1.301** |
| Heap | 72,9 MB | 49,5 MB |
| Busca por fabricante | não existe | acha, e sem acento |

A consulta é **plana** em 50.000 equipamentos — 2 a 6 ms para qualquer modalidade, sem depender
do tamanho da base. O DOM ficou constante entre 50 e 100 itens carregados.

**Rollback é desligar a flag**, e foi exercitado: a tela antiga volta inteira, sem converter dado
nenhum.

### Decidido em 23/08

**O custo de escrita de +48 %** (1.129 → 1.671 buffers) foi **ACEITO** como *desvio do piloto 9C*
e registrado como **baseline de escrita da V9**. A fidelidade do cartão — PMTA, PTH, resultado,
volume, fluido, vida e unidade — fica preservada. Reabrir a otimização só com evidência de que a
escrita virou gargalo, e sem enfraquecer consistência.

### Mudança INDEPENDENTE, validada e não aplicada

As **seis** funções auxiliares da RLS estão `VOLATILE` em produção, o que numa cláusula de RLS
significa **uma chamada por linha**. A mesma leitura de 1.000 chaves custa **248.685 buffers**
com `VOLATILE` e **1.021** com `STABLE` — **244×**, e o plano vira `One-Time Filter`.

Validada isolada: análise semântica função por função, **88 provas de comportamento idênticas**
nos dois modos (7 atores × 12 provas + `anon`), e rollback exercitado.
`supabase/rls_funcoes_estaveis.sql` · `medicoes/2026-08-23-rls-funcoes-volateis.md`.

**Não depende da flag nem da Fase 9.** Pode ser implantada sozinha, quando autorizado.

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

### P4 (depois da Fase 7) — FECHADO ✅ · aprovado pelo dono em 22/08/2026

**7A — EXPAND**

- [x] Leitor entende Base64 **e** Ref em produção
- [x] **Zero escrita histórica** — 94 chaves conferidas por SHA-256 + versão
- [x] Fallback seguro de leitura: base64 congelado vence; ref que não resolve **não** é
      substituída pela identidade atual
- [x] Rollback preparado (`7B -> 7A`)

**7B — SWITCH**

- [x] Writers produzem referência endereçada por conteúdo — 4 arquivos baixados do bucket e
      SHA-256 recalculado, `nomeEhOHash` verdadeiro nos quatro
- [x] Mesmo conteúdo = mesmo hash/path · conteúdo diferente = arquivo novo
- [x] Deduplicação validada nos 4 cenários (A/B/C/D), pela UI real
- [x] Snapshot novo congela **só** a referência — nenhum base64 nos registros A e B
- [x] **A continua A depois da troca para B**, com reload completo
- [x] PDF arquivado **imutável**: bytes e SHA-256 idênticos depois da troca
- [x] Histórico em Base64 permanece correto — relatório de 19/08 reaberto mostra a logo original
- [x] Portal: cliente autorizado → **200**
- [x] Portal: outro cliente com o **mesmo hash/path** → **404 `nao_disponivel`**
- [x] Portal: hash inexistente → **404 indistinguível** (1 única assinatura de resposta em 6 casos)
- [x] **P1/P3 preservados** — Storage não lista, não assina arbitrário, não baixa pelo hash;
      `app_storage` devolve 0 linhas
- [x] Livro de Registro preservado — entradas lacradas e encadeadas
- [x] **Offline sem perda** — dataURL preservada, reload offline funciona, dado sincroniza
- [x] **Offline sem Ref quebrada** — nenhuma referência prematura, nenhum arquivo órfão
- [x] Suíte **1186/1186** e build verdes

**Achado offline classificado pelo dono como `LIMITAÇÃO DE OTIMIZAÇÃO / PROMOÇÃO TARDIA PARA
REF`** — e explicitamente **não** como risco de perda, risco histórico, ref quebrada ou falha
de integridade. Correção **não** implementada; pendência registrada em `PENDENCIAS.md`.

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
