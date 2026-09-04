# Fase 11 · o gate E2E real — uma finalização vetorial em produção, do clique ao byte

**04/09/2026.** O hardening provou o gerador. Este registro prova o **caminho
inteiro**: finalizar na tela, gerar, hashear, subir, gravar, reabrir e conferir
que o que aparece na tela é o mesmo arquivo que subiu.

**O padrão global continua RASTER e não foi tocado.**

---

## 0 · Onde isto foi feito, e por que é seguro

Organização de teste, em produção: `99f642d3-…`, conta `teste@gmail.com`,
equipamento **`ZZ-FASE3`** — tudo prefixado `ZZ-`, CNPJ de fachada
(`828292929229`), o mesmo parque usado na Fase 9. Nenhum cliente real foi tocado.

É o uso que o §12 do `CLAUDE.md` autoriza em produção: *organização de teste,
poucos registros, validação funcional*. Não houve massa, gate de volume nem
stress.

**O motor vetorial foi ligado SÓ pela URL** (`?motor=vetorial`). A chave de
organização `nr13_motor_pdf` foi conferida antes e depois e continua **ausente**
no `localStorage` e no IndexedDB — a configuração global nunca saiu de `raster`.

---

## 1 · O campo 72, explicado — e era defeito

Na paridade do hardening, 71 de 72 campos casaram. O que faltava:

| | |
|---|---|
| **campo** | **paginação** — a busca literal `"Página 1 de 27"` |
| **origem** | `rodape()` em `pdfVetorial/primitivas.ts`; o `Y` vinha da 1ª passagem |
| **tipo** | **texto vetorial**, não imagem, assinatura ou gráfico |
| **por que não apareceu** | o documento dizia `"de 22"`: o total contava só o CORPO, e os certificados são anexados **depois** da contagem |
| **perda de conteúdo** | **NÃO** — nenhum dado sumiu; o denominador é que mentia |

Não era perda, mas era um número errado impresso em documento assinado: a última
folha dizia "22 de 22" num PDF de 27 páginas. **Corrigido** (commit `1492bc2`):
o total passou a somar as páginas que serão anexadas — folhas de calibração
montadas (uma página cada) e as páginas dos PDFs dos padrões, contadas pelo
**mesmo `resolverPdf`** que as anexa.

Os anexos continuam **sem numeração**, de propósito: são documentos de terceiro
e não se carimbam — a própria folha `CERTIFICADO-CAL-*` esconde o número de
página em produção (`display: none !important`).

> **Descoberta do caminho:** as folhas do sistema **não imprimem total nenhum**.
> O rodapé traz só o número (`?page=N` → `12`). O "Página X de Y" é do layout
> novo; então o `Y` tem que dizer a verdade sobre o arquivo, senão inventa uma
> informação que o documento antigo nem dava.

### Provado no arquivo emitido em produção

```
Página 1 de 12 · Página 2 de 12 · … · Página 11 de 12
denominadores distintos: ["12"]     páginas reais do arquivo: 12
```

11 folhas do corpo numeradas + 1 página de certificado anexada, sem número, e o
total = 12. Antes da correção diria "de 11".

---

## 2 · A finalização vetorial, ponta a ponta

Fluxo real de tela: `/relatorios` → **+ Criar Relatório** → 14 folhas → laudo
**APTO** marcado dentro da `CONCLUSAO.html` → **Finalizar relatório**.

O modal de validação (10B.1) **bloqueou** enquanto o laudo não estava marcado
("Resultado da inspeção (APTO/INAPTO) não marcado"), e liberou depois — a guarda
funcionou sozinha, sem intervenção.

### O relatório: `REL-1788502854038`

| | |
|---|---|
| status | `Aprovado` |
| páginas | **12** |
| `sha256` | `2a5c84d9b2e9e7d7b71ac2311e540af04474e51daf6cc3dc1f3b9cc1c31acba9` |
| `pdfRef` | `inspecao` → `99f642d3-…/relatorios/f347d018-….pdf` |
| tamanho | **48.502 bytes** (~4 KB/página) |
| `pdfPendente` | **`false`** — subiu de verdade, não ficou na fila |
| `livroCorte` | gravado (2 entradas, sha da última lacrada) |

### O upload e o arquivo, conferidos por TRÊS clientes

| conferência | HTTP | bytes | SHA-256 |
|---|---|---|---|
| registro salvo pelo app | — | 48.502 | `2a5c84d9…acba9` |
| download do bucket (navegador) | **200** | 48.502 | `2a5c84d9…acba9` |
| download do bucket (`curl`, fora do navegador) | **200** | 48.502 | `2a5c84d9…acba9` |
| **o que o visualizador do sistema exibe** | — | 48.502 | `2a5c84d9…acba9` |

Quatro caminhos independentes, o mesmo hash. **Integridade = true.**

### O arquivo por dentro (pdf-lib, no dicionário)

```
páginas ......... 12
FontFile2 ....... 4      FontDescriptor .. 4
Type0 ........... 4      CIDFontType2 .... 4
tamanhos ........ 595.28 x 841.89 → 11 páginas
                  200.00 x 100.00 →  1 página
texto extraível . 3.839 caracteres      imagens: 0
```

As **quatro** Carlito (normal, negrito, itálico, negrito-itálico) embutidas como
CID no arquivo que está no cofre. Texto real e selecionável. Zero imagens (este
equipamento não tem foto).

> **A página de 200 × 100 pt é o certificado do padrão anexado**
> (`ZZ-TESTE-F6 rastreabilidade`), preservado na geometria ORIGINAL dele. É o
> comportamento pedido — "não redesenhar, não alterar" — e o mesmo do gerador
> raster, que usa a mesma `anexarRastreabilidades`. **O corpo do relatório é A4
> exato; documento de terceiro anexado mantém o papel dele.**

### Reabertura pelo sistema — sem regenerar

Ao abrir pelo `/relatorios`, a tela mostra:

> *"Documento arquivado — o que você vê é o arquivo emitido."*
> `12 páginas · SHA-256 2a5c84d9b2e9e7d7b71ac2311e540af04474e51daf6cc3dc1f3b9cc1c31acba9`

Medido no DOM da reabertura:

| | |
|---|---|
| iframes de template (`/arquivos-inspecao/`) | **0** |
| folhas `.pagina-relatorio-a4` | **0** |
| quadro com o PDF arquivado | **1** |

**Nenhum template foi remontado, nada foi recalculado** — §7-quater cumprido. E
os bytes exibidos na tela hasheiam para o mesmo SHA do registro.

### Os históricos continuam sendo os deles

| relatório | emissão | páginas | bytes | integridade |
|---|---|---|---|---|
| `REL-1788502854038` (vetorial, hoje) | 04/09/2026 | 12 | **48.502** | **true** |
| `REL-1787282922043` (raster, antigo) | 21/08/2026 | 13 | 4.397.694 | **true** |
| `REL-1787282142486` (raster, antigo) | 21/08/2026 | 15 | 4.971.975 | **true** |

Os dois documentos de agosto seguem baixando os próprios bytes e batendo com os
próprios hashes. A emissão vetorial não encostou neles.

O contraste, no mesmo equipamento e no mesmo dia: **~4 KB por página contra
~338 KB por página.**

---

## 3 · Rollback — provado emitindo

Não bastava afirmar. Um segundo relatório foi finalizado com **`?motor=raster`**:

`REL-1788503679563` — 2 páginas, **522.699 bytes**, `pdfPendente: false`,
integridade `true`, e por dentro:

```
caracteres de texto ... 0
objetos de imagem ..... 2   (uma por página)
veredito .............. RASTER
```

O gerador raster **não foi removido** e continua produzindo exatamente o que
sempre produziu. Lado a lado, na mesma organização, no mesmo dia:

| motor | páginas | bytes | texto | imagens |
|---|---|---|---|---|
| vetorial | 12 | 48.502 | **3.839 caracteres** | 0 |
| raster | 2 | 522.699 | **0** | 2 |

A chave global `nr13_motor_pdf` continua **ausente** — o padrão nunca mudou, e é
por isso que o rollback aqui não precisou desfazer nada: bastou não ligar.

---

## 4 · Limpeza — pelo caminho permitido

Os dois documentos de teste foram **ARQUIVADOS**, que é a única remoção que o
sistema oferece para relatório finalizado. Hard delete de documento emitido não
existe, de propósito (§7-quater), e não foi forçado por fora.

Depois de arquivar:

| | |
|---|---|
| lista padrão de `/relatorios` | **0** dos dois |
| `nr13_relatorios_arquivados` | `["REL-1788503679563", "REL-1788502854038"]` |
| índice do equipamento | **4 entradas — completo** |
| registro do vetorial | SHA, `pdfRef`, 12 páginas e `Aprovado` **intactos** |

Nenhum tombstone criado, nenhum histórico protegido tocado. Os dois seguem
alcançáveis pelo filtro **Arquivados**.

---

## 5 · Uma falha PRÉ-EXISTENTE encontrada (não é da Fase 11)

Durante a emissão, o selo da topbar acusou **"Sincronizar (2) · 2 falhas"**. A
fila mostra:

```
nr13_med_esp_ZZ-FASE3   versaoBase 0 → versaoServidor 2   estado: conflito
nr13_med_grid_ZZ-FASE3  idem
codigo P0001 · nr13_versao_obsoleta
"Alteração mais antiga que a exclusão"
```

É a `ULTRASSOM.html` gravando os valores zerados de abertura
(`{"sup":"0","casco":"0","inf":"0"}`) sobre uma versão 2 que já existia no
servidor, de testes anteriores da Fase 9. **Nada a ver com o motor de PDF** — o
relatório salvou, subiu e conferiu normalmente.

Vale registrar por dois motivos: o controle de versão da v2 **pegou** o conflito
em vez de sobrescrever calado, que é exatamente para o que ele existe; e a
mensagem de erro chega como `[object Object]` no campo `erro` da fila, o que
dificulta o diagnóstico. Fica anotado, fora do escopo deste gate.

---

## 6 · Portal Edge — segue pendente

```
$ ls ~/.supabase/
telemetry.json
traces
```

Sem `access-token`. A Edge `portal_cliente` do commit `6225581` **não foi
publicada**, e isso não bloqueou este gate. Para destravar:
`! npx supabase login --no-browser` no terminal do dono (fluxo de dispositivo,
sem PAT em texto).

---

## 7 · Resultado

| pergunta | resposta |
|---|---|
| campo 72 explicado | **SIM** — paginação; era texto, e o denominador estava errado |
| perda de conteúdo | **NÃO** — corrigido mesmo assim (`1492bc2`) |
| finalização vetorial real em produção | **OK** — `REL-1788502854038` |
| upload no bucket | **OK** — HTTP 200, `pdfPendente: false` |
| SHA | **OK** — mesmo hash em 4 caminhos independentes |
| `pdfRef` | **OK** — salvo e resolvido |
| reabertura do mesmo arquivo | **OK** — 0 templates remontados |
| integridade | **OK** — `true` nos 3 relatórios do equipamento |
| rollback raster | **OK** — provado emitindo, não afirmando |
| Portal Edge publicado | **NÃO** — CLI sem token |
| impressão física | **PENDENTE** — sem impressora nesta máquina |

**O vetorial está pronto para virar padrão global. Não foi virado.**
