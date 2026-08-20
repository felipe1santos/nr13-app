# Fase 4 — Portal: arquitetura de leitura · task level

**Plano macro:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (FASE 4)
**Achado:** A-02 · **Data:** 20/08/2026
**Baseline:** `docs/medicoes/2026-08-20-fase4-baseline-portal.md`
**Depende de:** Fase 0 (P1 ✅ aprovado) e Fase 2 (✅) — as duas concluídas

---

## Estado atual da fase

- **Fase:** 4 — Portal: arquitetura de leitura
- **Estado:** **IMPLEMENTADO · TESTADO LOCALMENTE — aguardando redeploy do dono**
- **Último commit:** ver Log · **Suíte:** 1063/1063 · **Build:** verde
- **Push main:** SIM
- **Redeploy:** **AGUARDANDO O DONO** — frontend **e** a Edge `portal_cliente` (que agora importa `prefixos.ts`)
- **Validação local:** SIM — 1063/1063, build limpo, 0 problemas novos de lint
- **Validação produção:** **NÃO INICIADA** — só depois do redeploy
- **Portão:** **P3** (depois da Fase 4) — ainda não alcançado
- **Próxima ação:** dono faz o redeploy (frontend + Edge). Depois: repetir a metodologia da baseline, comparar antes×depois e rodar a regressão de segurança da seção 6
- **Última atualização:** 20/08/2026 02:00

---

## 1. Arquitetura AS-IS (provada, não suposta)

```
cliente autentica (Supabase Auth)
  └─ carregarPerfil()  →  papel='cliente', org_id = org do INSPETOR, cliente_id
RotaProtegida
  └─ iniciarArmazenamento()          (abre IndexedDB, sem rede)
  └─ if (!ehCliente()) lerTudo()     ← CLIENTE NÃO HIDRATA (Fase 0-B) ✅
RotaCliente  →  PortalLayout.useEffect
  └─ carregarDadosPortal()
       └─ POST /functions/v1/portal_cliente        ← 1 request
            ├─ getUser(token) → profiles (papel, org_id, cliente_id, ativo)
            ├─ QUERY 1:  where org_id=X and chave like 'nr13\_emp\_%'
            │            → resolve as TAGs cujo clienteId == cliente_id
            └─ QUERY 2:  where org_id=X            ← SEM FILTRO, paginada
                         → filtra EM MEMÓRIA por endsWith('_'+TAG)
       ├─ semearCachePortal(chaves)      → Map (a UI lê daqui)
       └─ localStorage.setItem em laço   → para os templates em iframe
PortalAtivos   →  montarAtivos(tags), tudo do Map
PortalAtivo    →  ler() de 13 famílias, tudo do Map
arquivos       →  FotoImg / VisualizadorPdf → urlAssinada → Edge portal_arquivo (sob demanda)
```

### O que JÁ está certo e não se toca

| | |
|---|---|
| Cliente não hidrata a organização | Fase 0-B |
| Filtro por cliente acontece no **servidor** | a Edge decide, com `service_role` |
| `cliente_id` vem de `profiles`, **nunca do frontend** | `portal_cliente/index.ts:47` |
| Arquivo só sai pela Edge `portal_arquivo`, por vínculo | Fase 0-B / D-05 |
| Nenhum arquivo baixado na listagem | `FotoImg` com `IntersectionObserver` (I-21) |
| PDF servido é o artefato com SHA-256 | I-16 |
| Iframe do Portal travado em somente leitura | I-20 |

---

## 2. O gargalo COMPROVADO

| Medida (org de teste, 45 linhas) | Valor |
|---|---|
| Bytes lidos do Postgres pela Edge | **534,7 KB** |
| Bytes entregues ao cliente | **38,7 KB** |
| **Descartado** | **496 KB — 93 %** |
| Fração do payload que é `RelatorioSalvo` completo | **24 %** (9,3 KB de 38,7) |

**O custo é proporcional à ORGANIZAÇÃO, não ao cliente.** Na maior org real (`06f84f2e`,
344 chaves), a mesma abertura leria **3,06 MB**.

---

## 3. Arquitetura proposta

```
QUERY 1 (mantém):  nr13_emp_%  → conjunto de TAGs do cliente   ← É A AUTORIZAÇÃO
QUERY 2 (nova):    where org_id=X and chave = any($lista)
                   $lista = [ para cada TAG × cada prefixo de familiasChave.POR_TAG ]
                          + globais liberadas (nr13_minha_empresa, nr13_lista_phs)
                          + nr13_rastreab_%  (escopo de id, lista curta)
                   → servida pelo índice (org_id, chave) que JÁ existe
Relatórios:        devolve nr13_historico_indice_<TAG>; NUNCA nr13_rel_ completo
Detalhe:           nr13_rel_<id>_<TAG> buscado só quando o cliente abre aquele relatório
Arquivos:          inalterado — Edge portal_arquivo, sob demanda
Navegador:         QuotaExceeded vira ERRO VISÍVEL, não console.error
```

**A lista de chaves é construída A PARTIR das TAGs autorizadas** — construir a lista já é a
validação. Não há caminho em que uma chave fora do conjunto entre na consulta.

---

## 4. Arquivos que serão alterados

| Ação | Arquivo | O quê |
|---|---|---|
| Backup | `supabase/functions/portal_cliente/index.anterior.ts` | cópia da versão atual, para rollback (exigido pelo plano macro) |
| Modificar | `supabase/functions/portal_cliente/index.ts` | consulta por lista de chaves; devolve índice, não `nr13_rel_`; deixa de mandar `nr13_historico_relatorios` |
| Criar | `supabase/functions/portal_cliente/prefixos.ts` | a lista de prefixos, isolada para o teste de paridade |
| Modificar | `src/features/portal/portalService.ts` | falha de cota vira erro; busca sob demanda do registro de relatório |
| Modificar | `src/pages/portal/PortalAtivo.tsx` | carregar `nr13_rel_` sob demanda ao abrir relatório legado |
| Criar | `src/features/portal/portalService.test.ts` | resolução de TAGs, montagem de lista, cota |
| Criar | `src/features/portal/paridadePrefixos.test.ts` | **`familiasChave.POR_TAG` × lista da Edge** |

**Não serão tocados:** policies (Fase 0), templates HTML, trava de somente leitura,
`portal_arquivo`, `FotoImg`, `VisualizadorPdf`.

---

## 5. Testes que serão criados

- [x] Resolução de TAGs: dado um conjunto de `nr13_emp_*`, devolve só as do cliente ✅
- [x] Montagem da lista: para 1 TAG, produz exatamente os prefixos esperados ✅
- [x] **Paridade de prefixos** `familiasChave.ts` × Edge — quebra se divergirem (espírito do I-24) ✅
- [x] **Paridade de resultado** contra as 15 chaves reais de produção ✅
- [x] Índice de relatório é devolvido; `nr13_rel_` completo **não** é ✅
- [x] `QuotaExceeded` propaga erro, não é engolido ✅

---

## 6. Regressão de segurança OBRIGATÓRIA (tudo que o P1 provou)

Depois da alteração, **repetir integralmente** e registrar:

- [ ] Cliente vê somente ativo vinculado
- [ ] Ativo de outro cliente não aparece
- [ ] `app_storage` amplo continua negado (0 linhas)
- [ ] `portal_arquivo` autorizado funciona (200 + URL)
- [ ] Arquivo **real** de outro cliente continua negado (404)
- [ ] Resposta continua **não-enumerável** (404 idêntico ao de path inexistente)
- [ ] SDK direto continua bloqueado (400 / lista vazia)
- [ ] Prontuário abre
- [ ] Relatório arquivado abre
- [ ] Papel mestre continua funcionando no sistema interno

> **Regra:** não se aceita ganho de egress em troca de isolamento pior. Se qualquer linha
> acima falhar, a fase é revertida, não "ajustada".

---

## 7. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Chave esquecida na lista → folha com "-" | **alta** (falha silenciosa) | teste de paridade de resultado + de prefixos; conferência visual folha a folha |
| Lista de prefixos duplicada (TS × Deno) dessincroniza | alta | teste de paridade que quebra o build |
| Relatório legado (sem `pdfRef`) precisa do registro completo | média | busca sob demanda ao abrir; testar explicitamente com um legado |
| `chave = any($lista)` com lista muito grande | baixa | cliente com N ativos × ~30 prefixos; paginar se passar de ~1.000 |
| Regressão de isolamento | **crítica** | seção 6 é bloqueante |

---

## 8. Rollback

1. Reverter os commits de frontend.
2. Redeployar `portal_cliente/index.anterior.ts` (backup criado **antes** de mexer).
3. Nenhum dado é migrado → rollback imediato, sem perda.
4. As policies da Fase 0 **permanecem** e continuam corretas com a Edge antiga.

---

## 9. Critérios do portão P3

- [ ] Tempo e bytes de abertura **não crescem** com o tamanho da organização
- [ ] Paridade prova que nenhuma chave que o cliente via antes sumiu
- [ ] Paridade de prefixos verde
- [ ] Nenhum `RelatorioSalvo` completo no payload da listagem
- [ ] `QuotaExceeded` produz erro visível
- [ ] Folhas renderizam idênticas (comparação visual antes/depois)
- [ ] **Regressão de segurança da seção 6 integralmente reprovada em produção**
- [ ] Suíte verde, build limpo

> **Divergência registrada, não corrigida:** o plano macro encerra a Fase 4 com
> "**PARAR — PORTÃO P2**". É erro de digitação: pela tabela de portões, depois da Fase 4 vem o
> **P3**. Registrado aqui; o texto do plano macro não foi alterado sem autorização.

---

## Baseline

Resumo — completa em `docs/medicoes/2026-08-20-fase4-baseline-portal.md`.

| Medida | Valor |
|---|---|
| Requests à Edge na abertura | 1 |
| Queries ao Postgres | 2 (a 2ª paginada) |
| Linhas lidas / entregues | **45 / 15** |
| Bytes lidos / entregues | **534,7 KB / 38,7 KB** |
| Desperdício | **93 %** |
| Arquivos baixados na listagem | **nenhum** (já correto) |

**Medido em 20/08** (5 execuções cada): `portal_cliente` **693 ms** (mediana), **t_lista 1.069 ms**,
**t_detalhe 754 ms** com **0 requests novos**, payload **30,7 KB JSON / 10,1 KB na rede**.
Só a medição em org de 500/1.000 continua pendente — pertence à **Fase 8**.

---

## Tarefas

*(a detalhar em passos TDD **após a aprovação** — nada aqui foi iniciado)*

### Bloco 1 — Consulta dirigida na Edge
- [x] Backup `index.anterior.ts` — byte-idêntico (`diff` limpo), sha `a6909e38…`
- [x] `prefixos.ts` + teste de paridade com `familiasChave.POR_TAG` — **5 testes verdes**, e o teste foi provado com dentes: removi `nr13_laudo_` de propósito e ele quebrou com mensagem acionável
- [x] Query por lista de chaves — `.in('chave', fatia)` em lotes de 200, servida pelo índice `(org_id, chave)`; lista montada por `chavesDoCliente(tags)`
- [x] Teste de paridade de resultado (nada some) — contra as **15 chaves reais** medidas em produção

### Bloco 2 — Índice em vez de registro completo
- [x] Edge deixa de enviar `nr13_rel_` e `nr13_historico_relatorios`
- [x] `PortalAtivo` busca o registro sob demanda — novo modo `{chaves:[...]}` na Edge, revalidado contra as TAGs do BANCO
- [x] Teste: payload sem `RelatorioSalvo`

### Bloco 3 — Cota deixa de falhar em silêncio
- [x] `portalService` propaga erro — `ErroCotaPortal`
- [x] UI mostra o erro — `PortalLayout` já renderiza o `catch`; `PortalAtivo` ganhou faixa de erro + estado de carregando
- [x] Teste de `QuotaExceeded` — 4 testes em `cotaPortal.test.ts`

### Bloco 4 — Validação
- [x] Suíte + build — **1063/1063** (era 1042; +21), build limpo, **0 problemas novos de lint**
- [ ] Medição antes/depois
- [ ] **Regressão de segurança completa (seção 6)**

---

## Log de execução

### 20/08/2026 01:00–01:15 — Planejamento e baseline
- P1 e P2 aprovados formalmente pelo dono; Fase 3 marcada como concluída;
- Fase 4 aberta em PLANEJAMENTO/BASELINE;
- lida a seção integral da Fase 4 do plano macro e os achados de Portal da auditoria;
- AS-IS mapeado pelo código, com as sete garantias da Fase 0 que não podem ser afrouxadas;
- baseline colhida em produção, read-only: **534,7 KB lidos para entregar 38,7 KB (93 % de
  desperdício)**, e **24 % do payload é `RelatorioSalvo` completo**;
- **nenhuma linha de código da Fase 4 escrita.**

---

## Ponto de retomada

- **Última coisa concluída:** Blocos 1, 2 e 3 da Fase 4 implementados e testados localmente.
- **Suíte:** 1063/1063 (era 1042) · **Build:** verde · **Lint:** 0 problemas novos.
- **Alterações:** 4 arquivos modificados, 4 criados. Nada em produção.
- **Deploy:** **AGUARDANDO O DONO.** Precisa dos DOIS:
  1. **frontend** (`portalService`, `PortalAtivo`, `familiasChave`);
  2. **Edge `portal_cliente`** — e ela agora importa `./prefixos.ts`, então **os dois arquivos
     têm de subir juntos**. Subir só o `index.ts` quebra a função.
- **Produção:** não validada. P3 não alcançado.
- **Próxima ação, na ordem:**
  1. dono redeploya frontend + Edge (com `prefixos.ts`);
  2. repetir a metodologia da baseline (seção 7-bis do doc de medições) e comparar antes×depois;
  3. rodar a **regressão de segurança da seção 6 inteira** — se qualquer linha falhar, reverter;
  4. registrar medições, apresentar o **P3**, PARAR.
- **Não fazer ainda:** Fase 5. E não validar em produção antes do redeploy.

### Rollback, se preciso

1. `git revert` dos commits de frontend;
2. redeployar `supabase/functions/portal_cliente/index.anterior.ts` (byte-idêntico ao que
   está no ar hoje, sha `a6909e38…`);
3. nada foi migrado — rollback imediato, sem perda. As policies da Fase 0 permanecem e
   continuam corretas com a Edge antiga.
