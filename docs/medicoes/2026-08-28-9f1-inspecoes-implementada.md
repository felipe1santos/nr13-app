# Fase 9 · 9F.1 — `/inspecoes` implementada (28/08/2026)

Blocos 9F.1.1 a 9F.1.4 entregues, sob a flag `inspecoes_v9`. **Nenhuma flag foi
ligada, nenhuma organização cliente tocada, nenhum PDF regenerado.** O rollout em
produção não foi iniciado — depende da sua aprovação.

Commits: `b555ddb` (contagem na projeção) · `ef10c90` (tela, semeadura, flag).

---

## 1 · O antes e o depois, por caminho

| | ANTES (tela atual) | DEPOIS (tela sob flag) |
|---|---|---|
| Origem da lista | `listarEquipamentos()` → **`lerTudo()`** (hidratação completa) | `buscar_equipamentos` (projeção), 50 por página, keyset |
| Boot leve da 9D | **desfeito** na 1ª visita | preservado — a tela não chama `lerTudo()` |
| Busca | **não existe** | por TAG, equipamento, fabricante, nº de série, cliente, localização |
| DOM | proporcional ao parque inteiro | proporcional ao que se vê (virtualizada) |
| Badge "N Inspeções" | `JSON.parse` de `nr13_docs_<TAG>` **2× por cartão, no render** | inteiro que chega na linha do catálogo |
| Custo do badge, 1.000 equipamentos | **~22 MB de parse por quadro** (11,4 KB × 2 × 1.000) | **0 B** no navegador |
| Container do equipamento | lido para todos, sempre | lido de **uma** TAG, só ao escolher |
| Offline | dependia do cache completo | catálogo local do aparelho, com selo |

**A medida que sustenta a linha do badge** (produção, 28/08): família
`nr13_docs_` = 27 chaves em 10 organizações · média **11,4 KB** · p95 **71,8 KB**
· maior **117,3 KB**.

## 2 · O que os testes provam

**+29 testes** (1410 → 1439), todos escritos antes da implementação e vermelhos
primeiro.

| Arquivo | O que trava |
|---|---|
| `buscaIndexInspecoes.test.ts` | a contagem viaja na linha · **`0` é fato, ausente é `null`** · `rotuloInspecoes(null)` não escreve nada |
| `catalogoInspecoes.test.ts` | **semeia antes de ler** (a ordem é o teste) · semeia só a TAG escolhida · não chama `lerTudo` · falha de rede não derruba a abertura |
| `inspecoesSemDocs.test.ts` | no ciclo abrir→buscar→paginar: zero `nr13_docs_`, zero cache local, zero `app_storage`, zero download, só as 2 RPCs do índice |
| `flagInspecoesV9.test.ts` | flag nasce desligada · org sem linha não a herda · **o degrau de recuo preserva `busca_v9` e `boot_v9`** |
| `scripts/fase9/testes-9f.sql` | a projeção conta de verdade · `null` ≠ `0` · JSON ilegível não derruba a linha · mutação reprojeta · isolamento entre organizações · rebuild reconta |

### O limite deste conjunto, declarado

A suíte roda em `environment: 'node'`, **sem DOM**: nenhum teste renderiza
`InspecoesV9`. Os testes acima provam o SERVIÇO. Contra a TELA a defesa é
estrutural — varredura do próprio arquivo, no molde do
`palco.varreduraTemplates.test.ts` — e ela foi **verificada por mutação**:
reintroduzir `listarContainers(item.tag)` no render faz o teste reprovar
(conferido nos dois sentidos).

**O `testes-9f.sql` ainda NÃO foi executado**: exige Postgres local (Docker),
pendente desde a Fase 8. Fica versionado e roda no rollout, com o roteiro.

## 3 · Problema novo que apareceu

**Um, e ele não é da 9F.1** — é anterior, e estava mascarado:

> `carregarEquipamento(tag)`, a semeadura sob demanda que o desenho (§4) chama de
> "estratégia oficial de compatibilidade", **não era chamada por nenhuma tela**.
> Só o teste dela a exercitava.

Hoje ninguém sente porque `lerTudo()` traz tudo. É a mesma forma de defeito de
`sincronizarFlagDoServidor` (9D: a v2 pronta e sem chamador) e do §2-ter do
CLAUDE.md. A 9F.1.3 ligou a semeadura **nesta tela**; as outras três telas que
chamam `listarEquipamentos()` (`/prontuarios`, `/calibracoes` e a `/relatorios`
legada) continuam dependendo do `lerTudo()`, e cada uma será tratada no seu bloco.

Nenhum outro defeito apareceu. Nada em produção foi alterado.

## 4 · O que falta para esta tela — e a ordem

1. **Gate de navegador** em 1k/10k/50k: nós de DOM, heap e a prova de que a lista
   não lê `nr13_docs_` (o número que os testes de fonte não dão).
2. **Aplicar o SQL** na ordem: `busca_index.sql` → `busca_manutencao.sql` →
   `busca_index_rpc.sql` → `busca_consulta.sql` → `inspecoes_v9_flag.sql`.
   `busca_consulta.sql` **recusa rodar** se a coluna não existir.
3. **Reprojetar** — sem isso `inspecoes` fica `null` em toda linha e o badge some
   (comportamento correto, mas a tela perde informação que a antiga mostra).
4. **Publicar o front** e conferir por string literal (o nome do bundle não muda).
5. **Roteiro com a flag ON só na organização de TESTE**, com paridade do número
   do badge contra a tela antiga, e rollback.

**Nada disso começa sem sua aprovação.** A flag está desligada em todas as
organizações e não há SQL aplicado.
