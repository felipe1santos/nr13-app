# Etapa 7B em produção — validação

**Data:** 21/08/2026 · **Bundle:** `index-WDnlnv6E.js` · **Commit:** `490a236`
**Contas:** `teste@gmail.com` (mestre), `cliente001@gmail.com` e `ipiranga@gmail.com` (Portal). Nenhuma organização real foi tocada.
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

## 11. Portal do Cliente — cadeia de vínculo

Cliente autenticado: **`cliente001@gmail.com`** (`62299e40-…`, Posto Shell Prime), que enxerga
exatamente 1 equipamento: **ZZ-FASE3**, com os relatórios **A** e **B**.

### 11.1 A cadeia, reproduzida chave a chave

O conjunto autorizado da Edge é derivado das TAGs do cliente: chaves que terminam em
`_ZZ-FASE3` mais `nr13_rastreab_*`. Reproduzido sobre o mesmo conjunto, com a mesma varredura
por FORMA, o caminho de cada path é:

| Arquivo | Chave autorizada | Campo |
|---|---|---|
| LOGO A | `nr13_rel_REL-1787282142486_ZZ-FASE3` | `.meta.empresa.logoRef` |
| LOGO B | `nr13_rel_REL-1787282922043_ZZ-FASE3` | `.meta.empresa.logoRef` |
| RUBRICA A | `nr13_rel_REL-1787282142486_ZZ-FASE3` | `.meta.assinantes.engenheiro.assinaturaRef` |
| RUBRICA B | `nr13_rel_REL-1787282922043_ZZ-FASE3` | `.meta.assinantes.engenheiro.assinaturaRef` |

Chaves varridas: 9. Paths autorizados no total: **13** — conjunto estreito, sem sobra.

> **É o vínculo que autoriza, e dá para provar pela ausência:** `nr13_minha_empresa` e
> `nr13_lista_phs` **não entram** no conjunto varrido (não terminam em `_ZZ-FASE3`), e as duas
> carregam `logoRef`/`assinaturaRef`. Se o cadastro vivo bastasse, o 200 viria dali. Veio do
> **snapshot do relatório**.

### 11.2 Rota real `portal_arquivo`

| Path pedido | Status | |
|---|---|---|
| LOGO A · LOGO B | **200** | URL assinada válida |
| RUBRICA A · RUBRICA B | **200** | URL assinada válida |
| PDF de A · PDF de B | **200** | URL assinada válida |
| **Rubrica `45cbb213…png`** — arquivo **REAL**, mesmo bucket, mesma organização, hash válido, **sem vínculo** | **404** | `nao_disponivel` |
| Hash inventado em `logos/` (`000…0.jpg`) | **404** | `nao_disponivel` |
| Hash inventado em `assinaturas/` (`fff…f.png`) | **404** | `nao_disponivel` |
| Path de outra organização | **404** | `nao_disponivel` |

Todas as recusas devolvem **o mesmo status e o mesmo corpo**. Não há como distinguir "não
existe" de "não é seu" (D-26).

> A linha do `45cbb213` é a prova direta de que **hash não é autorização**: arquivo que existe,
> na mesma organização, com o nome correto — e mesmo assim 404, porque nenhum recurso que esse
> cliente enxerga o referencia.

### 11.3 As URLs devolvidas são de verdade

Cada URL de 200 foi baixada e o SHA-256 recalculado:

| | Bytes | Hash bate com o nome |
|---|---|---|
| LOGO A | 4.408 | ✅ |
| LOGO B | 4.453 | ✅ |
| RUBRICA A | 14.557 | ✅ |
| RUBRICA B | 19.496 | ✅ |

### 11.4 O documento recebe a imagem certa

**Relatório arquivado (PDF).** O Portal exibe *"Documento arquivado — o que você vê é o arquivo
emitido"*. Os bytes servidos ao cliente são **os mesmos** que o engenheiro tem:

| | Bytes | SHA-256 |
|---|---|---|
| A | 4.971.975 | `c74e21afcb89667f…` |
| B | 4.397.694 | `ec93a6d39a10064b…` |

Na tela do Portal, o relatório B abre com **13 páginas** e **LOGO-B** no cabeçalho — página 1 e
página 10. Como o arquivo é byte a byte o mesmo já conferido no §4, a página 10 é a mesma que
mostra **RUBRICA B**.

**Documento remontado (Livro de Registro).** Este não é PDF congelado: é montado na hora, pelo
palco. No Portal ele renderizou **LOGO-B** no cabeçalho e a **RUBRICA B** no bloco de
assinatura, com `funciona01 · Profissional Habilitado`. É a materialização funcionando do lado
do cliente.

> Durante a convivência D-11 a chave viva tem **as duas** formas, então esta folha não distingue
> "veio da dataURL" de "veio da referência resolvida". Distinguir só será possível quando a
> gravação dupla for encerrada — e é por isso que a prova de leitura por referência é a do §11.2,
> que passa pela rota e não pelo cadastro.

## 12. P1/P3 — sem regressão

Tudo abaixo executado **com o token do cliente**:

| Tentativa | Resultado |
|---|---|
| Listar `inspecao/<org>/assinaturas` | **0 itens** |
| Assinar URL de arquivo arbitrário (`45cbb213`) | **400** — recusado |
| Baixar direto um arquivo que ele **pode** ver pela Edge (LOGO A) | **400** — recusado |
| `select` amplo em `app_storage` | **0 linhas** |

O cliente só alcança arquivo pela Edge, e só o que está vinculado.

## 13. Observação registrada — logo do CABEÇALHO do Portal está velha

Não é da 7B, e não afeta documento nenhum, mas fica registrado porque foi visto:

O cabeçalho do Portal desenha a logo **MDK antiga** (7.767 B). O servidor entrega a atual
(5.963 B, LOGO-B) e o `localStorage` já tem a nova, mas o cache IndexedDB da conta cliente
segue em **versão 1** de `nr13_minha_empresa` — a conta é somente leitura e não re-hidrata essa
chave. **Os documentos usam o dado fresco** (o Livro renderizou LOGO-B). Item para uma fase
seguinte, não corrigido aqui.

## 14. Contraprova — `ipiranga@gmail.com` conhece o hash e não passa

Sessão conferida pelo **JWT**, não pela tela, antes de qualquer requisição:

```
jwt_email  : ipiranga@gmail.com
jwt_sub    : 5f865e4d-cfb3-46df-9edd-6eb8802e9175
papel      : cliente
cliente_id : ad1fd71c-c99b-4277-a07d-a57b90723e35   ← o OUTRO cliente
org_id     : 99f642d3-…                              ← a MESMA organização
navegador  : Brave
```

### 14.1 As seis referências reais do ZZ-FASE3

Os mesmos paths que devolveram **200** para o `cliente001`, pedidos agora com o token do
`ipiranga`:

| # | Referência | Path | Status |
|---|---|---|---|
| 1 | `logoRef` A | `…/logos/17822fce…adc.jpg` | **404 `nao_disponivel`** |
| 2 | `logoRef` B | `…/logos/ad888201…5cb.jpg` | **404 `nao_disponivel`** |
| 3 | `assinaturaRef` A | `…/assinaturas/df32c300…139.png` | **404 `nao_disponivel`** |
| 4 | `assinaturaRef` B | `…/assinaturas/67bd9c3e…16e.png` | **404 `nao_disponivel`** |
| 5 | `pdfRef` A | `…/relatorios/40edde04….pdf` | **404 `nao_disponivel`** |
| 6 | `pdfRef` B | `…/relatorios/e50b5bf1….pdf` | **404 `nao_disponivel`** |

**Nenhuma URL assinada foi emitida.** Seis de seis recusadas.

### 14.2 O 404 é SELETIVO, não é conta vazia

Este é o controle que dá sentido aos seis 404 acima. Se o `ipiranga` não tivesse vínculo
nenhum, a Edge sairia no atalho `tags.length === 0` e o 404 não provaria a regra do vínculo —
provaria só a ausência de qualquer vínculo.

Ele **tem** vínculo próprio: 2 TAGs (`COMPRESSOR V8-15/200L` e `D33DD33D`) e 15 chaves
autorizadas. E, **na mesma rota e com o mesmo token**:

| Pedido | Status |
|---|---|
| PDF do relatório do **COMPRESSOR** — vínculo dele | **200** + URL assinada |
| As 6 refs do **ZZ-FASE3** — vínculo do `cliente001` | **404** |

A rota funciona para ele. O que não funciona é alcançar o que não é dele.

### 14.3 Não-enumerabilidade — status, corpo E cabeçalhos

Comparadas as assinaturas completas das respostas (status + corpo + cabeçalhos, descontados os
voláteis de data/CDN) para seis casos deliberadamente diferentes: referência real com vínculo
**alheio**, arquivo real **sem vínculo nenhum** (`45cbb213`), hash inexistente em `logos/`,
hash inexistente em `assinaturas/`, PDF alheio e path de **outra organização**.

```
respostas distintas: 1
404 :: {"erro":"nao_disponivel"} :: content-length:45|content-type:application/json
```

**Uma única assinatura.** Não há oráculo: o atacante não distingue "não existe" de "existe e
não é seu" nem pelo corpo, nem pelo tamanho, nem pelos cabeçalhos.

### 14.4 P1/P3 com o token do `ipiranga`

| Tentativa | Resultado |
|---|---|
| Listar `inspecao/<org>/assinaturas` | **200, 0 itens** |
| Listar `inspecao/<org>/logos` | **200, 0 itens** |
| Listar `inspecao/<org>/relatorios` | **200, 0 itens** |
| Assinar URL de `logoRef` A direto no Storage | **400** — recusado |
| Download autenticado direto pelo hash conhecido | **400** — recusado |
| Download pela rota **pública** do bucket | **400** — recusado |
| `select` amplo em `app_storage` | **200, 0 linhas** |
| `select` filtrado por `nr13_rel_*` em `app_storage` | **200, 0 linhas** |

Conhecer o path não abre atalho nenhum fora da Edge. **Nenhuma política global do tipo
"cliente da organização alcança qualquer logo/rubrica"** — a leitura direta do bucket segue
fechada para o papel `cliente` (D-04), e a listagem não expõe sequer os nomes.

---

## PORTAL 7B = VALIDADO EM PRODUÇÃO ✅

A cadeia fechou nas três pontas, com os **mesmos paths** nos três casos:

| | |
|---|---|
| `cliente001` + relatório autorizado, ref dentro do snapshot | **200** |
| `ipiranga` + **exatamente o mesmo hash/path**, sem vínculo | **404** |
| Hash inexistente | **404**, indistinguível |

E a origem do 200 foi reproduzida chave a chave (§11.1): veio de
`nr13_rel_…_ZZ-FASE3 → .meta.empresa.logoRef` e
`→ .meta.assinantes.engenheiro.assinaturaRef` — não do cadastro vivo, que sequer entra no
conjunto varrido.

> **Hash/path não é autorização. O vínculo com o recurso é que autoriza.**

Nenhum código, política, Edge, banco ou dado foi alterado para esta prova.

---

## PENDENTE DE CONFIRMAÇÃO — o último item

Resta **um**, e ele depende de ação do dono. Não está sendo dado como aprovado.

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
