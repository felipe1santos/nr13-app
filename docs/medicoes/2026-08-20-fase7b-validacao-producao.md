# Etapa 7B em produção — validação

**Data:** 21/08/2026 · **Bundle:** `index-WDnlnv6E.js` · **Commit:** `490a236`
**Conta:** `teste@gmail.com` (mestre). Nenhuma organização real foi tocada.
**Nenhum conteúdo de imagem ou assinatura foi registrado aqui** — só tamanhos, hashes e paths.

> **O que a 7B precisa provar:** os writers passam a **produzir** referência de logo e rubrica,
> o snapshot do relatório novo congela **só a referência**, e nada disso alcança um documento
> já emitido.

O bundle local reconstruído nesta validação sai com o **mesmo hash** do que está em produção
(`index-WDnlnv6E.js`) — é a prova de que o que foi medido é exatamente o commit `490a236`.

---

## 1. Content-addressing — o nome do arquivo É o conteúdo

Cada arquivo foi **baixado do bucket** e teve o SHA-256 recalculado sobre os bytes recebidos.

| Imagem | Path | Bytes | `nomeEhOHash` |
|---|---|---|---|
| LOGO A | `<org>/logos/17822fce…adc.jpg` | 4.408 | ✅ |
| LOGO B | `<org>/logos/ad888201…5cb.jpg` | 4.453 | ✅ |
| RUBRICA A | `<org>/assinaturas/df32c300…139.png` | 14.557 | ✅ |
| RUBRICA B | `<org>/assinaturas/67bd9c3e…16e.png` | 19.496 | ✅ |

O `tamanho` declarado na referência bate com os bytes reais em todos os quatro.
Nenhuma referência guarda URL assinada — só `bucket`, `path`, `mimeType`, `tamanho`.

## 2. Deduplicação — os quatro cenários pedidos

| | Cenário | Resultado |
|---|---|---|
| A | Mesma logo duas vezes | ✅ mesmo path, **um** arquivo |
| B | Logo diferente | ✅ path novo, arquivo novo |
| C | Voltar aos bytes da LOGO A | ✅ referência **volta** para o arquivo de A, sem upload novo |
| D | O arquivo de B depois de voltar para A | ✅ **continua existindo** (nenhuma GC nesta fase) |

Estado final do bucket: `logos/` = 2 arquivos · `assinaturas/` = 3 (1 pré-existente + A + B).

## 3. Gravação dupla D-11 — intacta

| Chave viva | dataURL | Referência |
|---|---|---|
| `nr13_minha_empresa` | ✅ 5.963 B | ✅ `logoRef` |
| `nr13_lista_phs` | ✅ 26.018 B | ✅ `assinaturaRef` |

A dataURL **continua na chave viva**, como a D-11 exige. É ela que torna o rollback
`7B → 7A` gratuito. O encerramento da gravação dupla segue como item da Fase 10B.

## 4. O TESTE HISTÓRICO A/B — bloqueante

Sequência real, pela UI: LOGO A + RUBRICA A → **relatório A** → trocar para LOGO B + RUBRICA B
→ **relatório B** → **reload completo** → reabrir os dois.

| Registro | Bytes | `logoRef` | `assinaturaRef` | base64 no snapshot | Páginas | SHA-256 do PDF |
|---|---|---|---|---|---|---|
| A · `nr13_rel_REL-1787282142486_ZZ-FASE3` | **2.497** | **A** | **A** | ❌ nenhum | 15 | `c74e21afcb89667f…` |
| B · `nr13_rel_REL-1787282922043_ZZ-FASE3` | **2.461** | **B** | **B** | ❌ nenhum | 13 | `ec93a6d39a10064b…` |

Depois do reload completo, no visualizador:

| | Capa | Carimbo de assinatura |
|---|---|---|
| Relatório **A** | **LOGO-A** | **RUBRICA A** |
| Relatório **B** | **LOGO-B** | **RUBRICA B** |

**A = A, B = B.** ✅

> A diferença de páginas (15 × 13) **não é defeito**: o relatório A era a 1ª inspeção do
> equipamento, e por isso levou `CAPA-LIVRO-REGISTRO` + `TERMO-ABERTURA` auto-injetados. Ao
> emitir B o livro já tinha entrada, e as duas folhas deixaram de ser injetadas — §7 do
> CLAUDE.md.

## 5. PDF imutável — SHA-256 do A depois da troca para B

O arquivo foi **rebaixado do bucket** e o hash recalculado sobre os bytes recebidos:

| | Antes de B | Depois de B |
|---|---|---|
| Bytes | 4.971.975 | **4.971.975** |
| SHA-256 | `c74e21af…ea85c5` | **idêntico** |
| Confere com o `sha256` gravado na emissão | — | ✅ |

O próprio app exibe o selo: *"Documento arquivado em 2026-08-21 · 15 páginas · SHA-256
c74e21afcb89667f…"*. §7-quater funcionando: o que se vê é o **arquivo**, não uma remontagem.

## 6. Convivência base64 × referência

`nr13_rel_REL-1787152599432_COMPRESSOR V8-15/200L`, emitido em **19/08** (antes da 7B, logo em
base64, sem referência), reaberto **hoje**, com a identidade viva já na LOGO B:

> renderizou a logo **original "MDK ENGENHARIA"** — nem LOGO-A, nem LOGO-B. ✅

Os 15 registros legados com base64 seguem **byte a byte idênticos** (§7 abaixo).

**Referência quebrada não cai na identidade atual:** o leitor **não mudou na 7B**. O diff do
commit `490a236` não toca `palco.ts` — são `imagem.ts`, `identidadeVisual.ts` (novo), os dois
writers de cadastro e `relatoriosService.ts`. A regra é a mesma validada em produção na 7A
(item 8) e travada por `palco.refs7a.test.ts`: ref que não resolve deixa o campo **vazio**.

## 7. Prova de não escrita histórica

Comparação chave a chave (SHA-256 + versão) contra o retrato tirado **antes** da 7B: 94 chaves.

| | |
|---|---|
| Chaves históricas conferidas (`nr13_rel_`, `nr13_livro_`, `nr13_historico_*`) | **24** |
| Alteradas por esta validação | **0** |
| `nr13_historico_relatorios` (9.862 B) | **byte a byte idêntico** |
| Chaves **com conteúdo** que sumiram | **0** |

Mudaram só as chaves **vivas e de montagem**, todas esperadas: `nr13_minha_empresa`,
`nr13_lista_phs`, `nr13_relatorio_meta_atual`. Nasceram 4: os dois relatórios novos, o índice e
o livro do ZZ-FASE3.

As 39 chaves que sumiram do cache local tinham **0 byte** no retrato — são tombstones que a
hidratação limpou. Nenhuma perdeu conteúdo.

### Duas exceções, e elas são anteriores à 7B

`nr13_historico_indice_EQUIPE TESTE` e `nr13_rel_REL-1786567122300_EQUIPE TESTE` divergem do
retrato. São as **duas falhas** que o selo da topbar já mostrava, com erro registrado em
`2026-08-20T01:42` — antes desta etapa:

```
nr13_versao_obsoleta: versao_obsoleta
"Este item foi excluído em outro aparelho depois desta alteração ter sido feita."
```

É o caso legado do `EQUIPE TESTE`: o equipamento foi excluído em outro aparelho, e
`migrarHistoricoEmSegundoPlano` recria o registro a partir do `nr13_historico_relatorios`
legado a cada boot, onde o servidor recusa. **Nenhuma escrita da 7B falhou.** O item continua
na Fase 10B, **não corrigido**.

## 8. Livro de Registro — sem regressão

| Entrada | Relatório | Lacre | Elo |
|---|---|---|---|
| 1 | `REL-1787282142486` | `f54425f4d717…` | `shaAnterior: null` (primeira) |
| 2 | `REL-1787282922043` | `4f5d1ffe1141…` | `shaAnterior = f54425f4d717…` ✅ |

Encadeamento correto (§7-quinquies). Nenhum livro de outro equipamento foi tocado.

## 9. Economia real medida

O ganho da fase está no **snapshot do relatório**, não na chave viva.

| | Bytes |
|---|---|
| Snapshot do relatório B, como está | **2.461** |
| O mesmo snapshot com as imagens em base64 (5.963 + 26.018) | 34.442 |
| **Fator** | **14,0× menor** (−93%) |

Para escala, registros legados da mesma conta com snapshot em base64: 9.509 B, 45.023 B,
98.425 B.

**A chave viva NÃO encolheu, e isso é de propósito:** `nr13_minha_empresa` foi de 7.838 B para
6.226 B só porque a LOGO B comprime menor — a dataURL continua lá pela D-11. A economia na
chave viva só chega quando a gravação dupla for encerrada (Fase 10B, condições C1–C8).

Os **475,8 KB históricos continuam onde estão** e não entram em nenhuma conta.

## 10. Suíte e build

| | |
|---|---|
| Suíte | **1186/1186** (94 arquivos) |
| Build | ✅ verde · `index-WDnlnv6E.js` — mesmo hash de produção |

---

## PENDENTE DE CONFIRMAÇÃO — precisa de ação do dono

Estes dois itens **não foram executados** e **não estão sendo dados como aprovados**.

### A · Portal do Cliente

O equipamento ZZ-FASE3 é do cliente **`cliente001@gmail.com`** (Posto Shell Prime,
`62299e40-…`). O outro cliente da conta, **`ipiranga@gmail.com`** (`ad1fd71c-…`), serve de
contraprova.

Falta provar, com o cliente autenticado:

1. `assinaturaRef` e `logoRef` de relatório autorizado → **200**
2. Referência real do **outro** cliente → **404 `nao_disponivel`**
3. Hash inventado → **a mesma resposta**, sem revelar existência

> Se um relatório autorizado devolver **404**, o P4 continua **ABERTO**.

### B · Offline real

Pelo código, `referenciaPorConteudo` devolve `null` quando `arquivoPendente(path)` ainda é
`true` — ou seja, **offline o cadastro salva com a dataURL e sem referência**, que é o
comportamento seguro. Mas isso **não foi medido offline de verdade** e, pela regra do dono,
não se simula offline interceptando `fetch`.

Registro de um vazio conhecido, para não passar por implementado:
`FAMILIAS_RECUPERAVEIS` (Fase 6) cobre `nr13_rastreab_`, `nr13_pront_fab_` e
`nr13_componentes_cal_` — **não** cobre `nr13_minha_empresa` nem `nr13_lista_phs`. Uma logo
cadastrada offline **não ganha referência sozinha** depois; ela só aparece na próxima edição.
Não é perda de dado (a dataURL está salva e o snapshot cai nela), mas é uma lacuna a avaliar
numa fase seguinte.
