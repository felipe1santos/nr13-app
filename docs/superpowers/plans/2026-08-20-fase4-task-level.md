# Fase 4 — Portal: arquitetura de leitura · task level

**Plano macro:** `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` (FASE 4)
**Achado:** A-02 · **Data:** 20/08/2026
**Baseline:** `docs/medicoes/2026-08-20-fase4-baseline-portal.md`
**Depende de:** Fase 0 (P1 ✅ aprovado) e Fase 2 (✅) — as duas concluídas

---

## Estado atual da fase

- **Fase:** 4 — Portal: arquitetura de leitura
- **Estado:** **BASELINE COMPLETA — iniciando implementação (Bloco 1 / Tarefa 1)**
- **Último commit:** — (nenhuma linha de código escrita)
- **Push main:** N/A
- **Redeploy:** N/A
- **Validação local:** N/A
- **Validação produção:** N/A
- **Portão:** **P3** (depois da Fase 4) — ainda não alcançado
- **Próxima ação:** Bloco 1 / Tarefa 1 — backup da Edge `portal_cliente`
- **Última atualização:** 20/08/2026 01:55

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

- [ ] Resolução de TAGs: dado um conjunto de `nr13_emp_*`, devolve só as do cliente
- [ ] Montagem da lista: para 1 TAG, produz exatamente os prefixos esperados
- [ ] **Paridade de prefixos** `familiasChave.ts` × Edge — quebra se divergirem (espírito do I-24)
- [ ] **Paridade de resultado:** o conjunto novo é superconjunto-ou-igual do antigo, para as TAGs do cliente. Nenhuma chave pode sumir
- [ ] Índice de relatório é devolvido; `nr13_rel_` completo **não** é
- [ ] `QuotaExceeded` propaga erro, não é engolido

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
- [ ] Backup `index.anterior.ts`
- [ ] `prefixos.ts` + teste de paridade com `familiasChave.POR_TAG`
- [ ] Query por lista de chaves
- [ ] Teste de paridade de resultado (nada some)

### Bloco 2 — Índice em vez de registro completo
- [ ] Edge deixa de enviar `nr13_rel_` e `nr13_historico_relatorios`
- [ ] `PortalAtivo` busca o registro sob demanda (só relatório legado)
- [ ] Teste: payload sem `RelatorioSalvo`

### Bloco 3 — Cota deixa de falhar em silêncio
- [ ] `portalService` propaga erro
- [ ] UI mostra "não foi possível carregar"
- [ ] Teste de `QuotaExceeded`

### Bloco 4 — Validação
- [ ] Suíte + build
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

- **Última coisa concluída:** baseline da Fase 4 e este plano.
- **Commit de CÓDIGO atual:** `cb26450` (inalterado — a Fase 4 não tocou em código).
- **Alterações locais:** só documentação.
- **Testes:** 1042/1042 · **Build:** verde.
- **Deploy:** N/A para esta fase.
- **Produção:** P1 ✅ e P2 ✅ aprovados. P3 não alcançado.
- **Pendência:** aprovação deste plano pelo dono.
- **Próxima ação:** dono aprova → começar pelo Bloco 1, Tarefa 1 (backup da Edge).
- **Não fazer ainda:** qualquer alteração funcional de código da Fase 4.

---

### 20/08/2026 01:20 — Plano APROVADO pelo dono
- Aprovada também a correção documental do plano macro: a Fase 4 encerrava com
  "PARAR — PORTÃO P2" e passou a "PARAR — PORTÃO P3" (linha 1476). **Feito.**
- **Duas divergências do mesmo tipo encontradas na conferência, NÃO corrigidas** (fora da
  autorização dada):

  | Fase | Marcador no plano macro | Tabela de portões |
  |---|---|---|
  | 3 | `**PARAR.**` — sem portão | deveria ser **P2** |
  | 5 | `**PARAR — PORTÃO P3.**` (linha 1664) | Fase 5 **não tem portão** |

  Os marcadores estão **deslocados uma fase**. Com a correção autorizada, as Fases 4 e 5 passam
  a reivindicar o mesmo P3 — o que é inconsistente e precisa de decisão do dono.
- Metodologia de medição de tempo definida **antes** de medir, para ser repetível depois da
  implementação (ver seção 7-bis do documento de baseline).
- **Bloqueio:** nenhum dos dois navegadores tem a sessão de cliente. Chrome está em
  `teste@gmail.com` (mestre) e Brave em `inspetor01@gmail.com` (funcionario). Não digito senha
  em campo de autenticação — o dono faz o login.
- **Nenhuma linha de código da Fase 4 escrita.**

### 20/08/2026 01:30–01:55 — BASELINE DE TEMPO COMPLETA
- Corrigidas as duas divergências documentais autorizadas (Fase 3 → P2, Fase 5 → sem portão);
- 5 execuções da abertura do Portal e 5 do clique num ativo, sessão `ipiranga@gmail.com` no Brave;
- `portal_cliente`: mediana **693 ms**, pior caso 743 ms;
- **t_lista** (lista utilizável): mediana **1.069 ms**, pior caso 1.510 ms (frio). Obtido do
  Resource Timing, exato — o `portal_cliente` é o **último request antes da lista** nas 5
  execuções (`requestsDepoisDoEdge = 0`);
- **t_detalhe**: mediana **754 ms**, pior 954 ms, com **0 requests novos** — tudo já veio na
  abertura, então é puro render;
- payload: **31.403 bytes de JSON, 10.366 na rede** (compressão ~3×), 15 chaves;
- **`nr13_rel_` sozinho é 9,3 KB = 30 % do payload**, e o índice que o substitui já vai junto
  por 0,7 KB — é o alvo mais direto da fase;
- **duas séries foram descartadas com o motivo registrado**, em vez de maquiadas: o polling de
  `t_lista` (cards já existiam quando meu script rodou → `LIMITE_INFERIOR`) e a primeira série
  de `t_detalhe` (o meu `history.back()` entre amostras distorceu, dispersão de 10×);
- achado de latência anotado e **não corrigido**: o `portal_cliente` só começa depois de
  **4 chamadas de auth em série** — cerca de 1/3 do tempo até a lista. Mexer nisso agora seria
  refatoração lateral, que o dono vetou;
- **nenhuma linha de código da Fase 4 escrita até aqui.**
