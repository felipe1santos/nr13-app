# 9D · PILOTO EM ORGANIZAÇÃO CLIENTE — `92a28bff…488a75`

**25/08/2026.** Primeira organização fora das duas de teste a receber `boot_v9`.
Validação **administrativa e READ-ONLY**: nenhuma conta de cliente foi acessada, nenhum dado
empresarial alterado, nenhum usuário criado.

---

## 1 · Como a organização foi escolhida (e o que o inventário revelou)

Onze organizações têm equipamentos vivos. Excluídas as duas de teste, restaram seis:

| org | equip | relat.¹ | livro | calib | inspeç | plano |
|---|---|---|---|---|---|---|
| `06f84f2e` cmam.caldeiras | **39** | 1 | 1 | 0 | 9 | **`completo`** (paga, vence 23/09) |
| **`92a28bff` gabriel.dadona** | **3** | **3** | 1 | **1** | 3 | `demonstracao`, ativa, sem vencimento |
| `32d3fa95` thiagocordeiro | 4 | 0 | 1 | 0 | 3 | `demonstracao`, ativa |
| `5ea4861f` vromanopena222 | 3 | 0 | 0 | 0 | 0 | `trial` |
| `b923e641` tmar@… | 2 | 0 | 0 | 1 | 1 | `trial` **vencido 09/08** |
| `be25cb86` ghsengseg | 2 | 1 | 1 | 0 | 2 | `trial` **vencido 20/08** |

¹ já descontada a colisão do §3.

> **A única organização PAGANTE é `cmam.caldeiras` — e é exatamente a maior**, que o dono pediu
> para evitar no primeiro piloto. As demais são `demonstracao` ou `trial`. Como as preferências
> não podiam ser satisfeitas juntas, a escolha foi levada ao dono, que decidiu por
> `92a28bff` — a mais completa entre as pequenas, e a única com calibração (o que exercita o
> `calibracoes_index`, novidade da 9D).

## 2 · Baseline com `boot_v9 = OFF`

| | |
|---|---|
| Equipamentos (`nr13_info_`) | 3 |
| Relatórios (`nr13_rel_`) | 3 |
| Índices de histórico | 1 |
| Livros de registro | 1 |
| Calibrações (chave) | 1 (com 8 itens) |
| Inspeções (`nr13_med_esp_`) | 3 |
| Prontuários | 4 |
| Categoria / Fotos | 3 / 3 |
| Vida remanescente | 0 |
| Chaves vivas · tombstones | **64** · 4 |
| Projeção · rebuild | **0** · nunca rodou |
| Flags | `boot_v9 false` · `busca_v9 false` |

## 3 · Uma armadilha de auditoria que quase virou falso positivo

A primeira contagem acusou **4** chaves `nr13_rel_` contra **3** linhas em `relatorios_index`, o
que pareceu perda de dado. Não era:

> **Em SQL, `_` é CORINGA.** `like 'nr13_rel_%'` casa também `nr13_relatorio_meta_atual`.

São 3 relatórios reais + a chave de metadados. É exatamente a colisão que o §2 do `CLAUDE.md`
documenta ao explicar por que o prefixo é `nr13_rel_` e não `nr13_relatorio_` — o código usa
`startsWith`, não LIKE, e está correto. **Toda auditoria por prefixo em SQL precisa de
`like 'nr13\_rel\_%' escape '\'` ou de `left(chave, 9) = 'nr13_rel_'`.**

## 4 · Pré-condição executada: rebuild da projeção

A organização nunca tinha sido projetada. `reiniciar_rebuild_busca` + `reconstruir_indice_busca`
(4 lotes), com o resultado:

| | |
|---|---|
| etapa | **concluido** |
| `equipamentos_index` | **3** |
| `calibracoes_index` | **8** |
| `relatorios_index` | **3** |
| `auditar_projecao` | **`convergiu: true`, `pendencias: 0`** |

## 5 · Paridade OFF × ON, campo a campo

Comparação da projeção (caminho ON) contra a verdade do `app_storage` (caminho OFF), para os
campos que a TELA mostra:

| TAG | na projeção | descrição | tipo | categoria | cliente | foto | nº série |
|---|---|---|---|---|---|---|---|
| AUTOCLAVE BAUMER | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| AUTOCLAVE BAUMER – LOCAÇÃO | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| AUTOCLAVE ESTERILAV – SANTA CASA MAUÁ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

**3 de 3, todos os campos idênticos.** Nenhum equipamento fora da projeção; a marca de foto
(thumbnail do cartão) bate com a existência real de `nr13_fotos_`.

## 6 · Boot leve, medido em organização cliente

| o que o boot traz | chaves | KB |
|---|---|---|
| **A) `boot_v9` ON — essencial** | **5** | **20** |
| B) sob demanda, ao abrir 1 equipamento | 21 | 169 |
| C) hidratação integral (boot antigo) | 64 | 354 |

> **O boot leve traz 5,6 % do que o boot antigo trazia** (20 de 354 KB), e o essencial NÃO cresce
> com o parque — é a mesma lista de famílias medida em 24/08. O equipamento inteiro (169 KB) só
> chega quando o usuário o abre, por `carregarEquipamento(tag)` → `semearCache()`.

## 7 · Ligar, conferir isolamento, desligar, religar

| passo | resultado |
|---|---|
| `definir_boot_v9(piloto, true)` | orgs com `boot_v9` ON: 1 → **2** (exatamente +1) |
| `busca_v9` | **0**, inalterada |
| quais orgs | `99f642d3…` (teste) + `92a28bff…` (piloto) — nenhuma outra |
| **rollback** `→ false` | orgs ON de volta a **1**; projeções **intactas** (3 / 8 / 3); nenhuma conversão necessária |
| religar (estado final) | `boot_v9 true` só no piloto; auditoria **`true / pend=0`** nas duas orgs |

## 8 · Estado final

| | |
|---|---|
| `boot_v9` | **ON em 2 organizações**: `99f642d3…` (teste) e `92a28bff…` (piloto) |
| `busca_v9` | **OFF em todas as 30** |
| Auditoria | `convergiu: true`, `pendencias: 0` nas duas |
| Projeto Supabase | **Healthy** |
| Front | `index-o18n-uvq.js` (commit `599ac68`) |

## 9 · O que este piloto NÃO cobre

- **Tela do cliente:** a validação foi administrativa, por decisão do dono ("não acessar conta de
  cliente se houver forma administrativa segura"). A paridade foi provada nos DADOS que alimentam
  cada tela, não na renderização — que já havia sido percorrida na organização de teste.
- **Escala:** 3 equipamentos não exercitam truncamento do painel (`LIMITE_PAINEL = 500`) nem o
  custo de rebuild de parque grande. A única organização com massa real é a pagante.
- **Offline:** não repetido aqui, por orientação do dono. A prova completa está em
  `2026-08-25-9d-prova-offline-e-dois-defeitos.md`.
