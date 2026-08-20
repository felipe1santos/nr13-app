# Fase 5 em produção — ANTES × DEPOIS

**Data:** 20/08/2026 · **Bundle validado:** `index-Bx8gMJyu.js` (antes: `index-C93aM9ry.js`)
**Conta:** `teste@gmail.com`, organização `99f642d3`. **Nenhum dado de cliente real foi tocado.**

> **A Fase 5 NÃO está fechada.** Os dois achados de §6 já foram tratados — **A-F5-02 corrigido**
> (§14) e **A-F5-01 encerrado sem causa determinada** (§15) —, mas seguem pendentes os itens que
> dependem do dono (§7: offline e Portal), a comparação visual dos PDFs, e a confirmação em
> produção da correção do §14, que precisa de um novo redeploy.

---

## 1. O bundle certo está no ar

| | |
|---|---|
| Bundle | `index-Bx8gMJyu.js`, 3.094.423 bytes |
| `.thumb.jpg` presente | ✅ |
| `imageOrientation: 'from-image'` presente | ✅ |
| Textos da ficha nova ("Trocar Foto", "Foto de identificação do equipamento") | ✅ |

Conferido com `fetch(..., {cache:'reload'})` para não ler do service worker.

---

## 2. Massa de teste — a mesma receita do baseline

10 imagens sintéticas 4032×3024 (7) e 3024×4032 (3), 1,57–1,68 MB cada, entregues ao
`<input type=file>` REAL da ficha, uma a uma (o input deixou de ser `multiple` com o T8).
Tempo por foto, **incluindo principal + miniatura**: 728–1.296 ms.

---

## 3. ANTES × DEPOIS — o número da fase

### 3.1 Por arquivo, mesma fonte, medido no bucket

| | Antes (baseline 20/08) | Depois | |
|---|---|---|---|
| 10 principais | **1.152,3 KB** | 1.153,1 KB | a principal **não mudou** |
| 10 miniaturas | não existiam | **144,9 KB** | |
| **O que uma lista baixa** | **1.152,3 KB** | **144,9 KB** | **−87,4 %** |

Por foto: paisagem 96,1–107,0 KB → **11,6–12,5 KB**; retrato 143,9–153,5 KB → **19,9–20,9 KB**.

### 3.2 Listagem `/equipamentos` — 4 cards, cache frio

| Medida | Antes (derivado das principais) | Depois (medido) |
|---|---|---|
| Bytes de imagem | **450,0 KB** | **55,6 KB** — **−87,6 %** |
| Requisições | 4 assinaturas + 4 GET | **4 assinaturas + 4 GET** |
| Arquivos pedidos | 4 principais | **4 miniaturas, ZERO principal** |
| Dimensão decodificada | 1200×900 / 1200×1600 | **400×300 / 400×533** |
| Última imagem pronta | — | 1.184 ms |

**A prova do item 3** é a linha "arquivos pedidos": nenhum GET de caminho sem `.thumb.jpg`.

### 3.3 Cache quente

| | Antes | Depois |
|---|---|---|
| Requisições | 0 | **0** |
| Bytes | 0 | **0** |

---

## 4. N-01 — o cofre guarda a miniatura baixada

| Passo | Resultado |
|---|---|
| Cofre esvaziado (37 blobs, nenhum pendente) | — |
| 1ª carga de `/equipamentos` | 4 assinaturas + 4 GET de miniatura |
| Cofre depois | **4 miniaturas, `pendente: false`, 55,7 KB · ZERO principal** |
| 2ª carga | **0 assinaturas, 0 GET**, 4 fotos exibidas |

Confirma a D5-8 nos dois sentidos: a miniatura passa a ser cacheada, e a **principal continua
fora do cache por download**.

## 5. N-02 — assinaturas por caminho

| | Antes | Depois |
|---|---|---|
| Galeria de 10 fotos | **11 assinaturas para 10 caminhos** | — |
| Listagem de 4 cards | — | **4 assinaturas para 4 caminhos** |

> **Limite declarado.** O cenário exato do baseline — a mesma foto pedida ao mesmo tempo pela
> capa da ficha e pelo item da galeria — **deixou de existir** com o T8, que tirou a galeria da
> ficha. Então a dedução em voo não pôde ser exercida em produção nesse cenário. O que se mede
> aqui é a ausência de assinatura duplicada (4 para 4). A dedup em si está coberta por teste
> automatizado (`fotos.test.ts`: N chamadas simultâneas = 1 requisição).

---

## 6. ACHADOS — como foram encontrados (tratamento em §14 e §15)

### A-F5-01 · Uma foto sumiu da massa de teste, e não sei explicar

Entre a criação da massa (12:05) e a validação (12:5x), **uma das 10 fotos sumiu dos três
lugares ao mesmo tempo**: registro, cofre e bucket.

| Evidência | |
|---|---|
| Medido logo após o upload | 10 blobs no cofre, soma **1.152,3 KB** |
| Encontrado na validação | 9 no registro, 9 no cofre, **9 no bucket** |
| Arquivo ausente | `05d97b1d-…jpg`, 142,1 KB — bate exatamente com a diferença (1.152,3 − 1.010,4) |
| `app_storage.atualizado_em` do registro | **2026-08-20T15:05:40Z**, `versao` 2 — **anterior ao redeploy** |

**O que isso diz:** a última escrita naquele registro é anterior ao bundle da Fase 5, então o
código novo **não** a causou. **O que isso NÃO diz:** o que a causou. Apagar do bucket só
acontece por `removerFoto`, chamado pelo botão "×" da galeria antiga. Não registrei clique
nesse botão. **Não vou fechar essa lacuna com hipótese.**

Impacto: massa de teste, conta de teste. Nenhum dado de cliente.

### A-F5-02 · O palco hidrata TODAS as fotos da ficha, e agora o array cresce

Medido ao gerar um relatório com a folha CAPA no `ZZ-TESTE-P2`:

| | |
|---|---|
| Entradas em `nr13_fotos_ZZ-TESTE-P2` | **18** |
| Entradas convertidas em dataURL pelo palco | **18** |
| Peso dessa chave no palco | **1.100,9 KB** de um orçamento de 3.368 KB |
| Folhas que imprimem essas fotos | **uma** (`CAPA.html`), e só **a de identificação** |

A hidratação de todas as entradas **já era assim** — `hidratarFotosDoBucket` percorre o array
inteiro. O que muda com o T8 é que **o array agora cresce a cada troca de foto**, por decisão
A-4 (nada é apagado). Antes, a galeria era o que o usuário deixasse lá; agora, cada troca
soma uma entrada permanente que o palco carrega em todo documento.

Conta simples: ~87 KB por foto degradada a 900 px ⇒ **por volta de 38 trocas** e essa chave
sozinha ocupa o orçamento inteiro; o documento passa a ser **recusado** (I-23), com mensagem,
sem perda de dado — mas recusado.

**Correção aprovada pelo dono e aplicada em 20/08 — ver §14.**

---

## 7. Itens que dependem do dono

| Item | Por quê |
|---|---|
| **9 · Offline** | Exige a rede desligada de verdade. A regra do projeto proíbe simular offline interceptando `fetch` |
| **10 · Segurança no Portal** | Exige sessão de uma conta com papel `cliente` (ex.: `ipiranga@gmail.com`) |

---

## 8. O que passou

| # | Item | Resultado |
|---|---|---|
| 1 | Bundle novo no ar | ✅ `index-Bx8gMJyu.js` |
| 2 | Baseline repetida | ✅ §3 |
| 3 | Listas usam miniatura, não a principal | ✅ 4 GET, todos `.thumb.jpg`; decodificação 400×300 |
| 4 | Bytes, requests, tamanhos, redução, frio e quente | ✅ §3 |
| 5 | N-01 | ✅ §4 |
| 6 | N-02 | ✅ com limite declarado (§5) |
| 7 | Foto de identificação | ✅ §9 |
| 8 | Orientação | ✅ §10 |
| 11 | Relatório/PDF | ✅ §11 |
| 12 | Nenhuma base64 nova | ✅ §12 |

### 9. Foto de identificação (item 7)

| Verificação | Resultado |
|---|---|
| Só uma foto aparece na ficha | ✅ 1 item, rótulo "Trocar Foto" |
| Adicionar | ✅ em 4 equipamentos |
| Trocar (10× seguidas) | ✅ a nova identifica; **as 9 legadas e as 9 anteriores continuam no registro** (19 entradas) |
| Fotos antigas não são apagadas | ✅ 19 principais no bucket após 10 trocas |
| Remover | ✅ 19 → 18 entradas; a anterior voltou a identificar; **1** capa |
| Remover **não apaga arquivo** | ✅ 29 arquivos no bucket antes e depois; principal **e** miniatura da removida seguem lá |
| Equipamento antigo (9 fotos sem miniatura) | ✅ fallback para a principal, sem erro |
| Galerias técnicas da inspeção | ✅ intactas — família de chave diferente (`nr13_docs_`), nenhuma linha alterada |

### 10. Orientação (item 8)

Fonte 4032×3024 **gravada em paisagem** com EXIF `Orientation = 6`, marca vermelha no canto
superior-esquerdo gravado. Subida pelo fluxo real.

| | Dimensão | Canto sup-esquerdo | Canto sup-direito |
|---|---|---|---|
| Principal | **1200×1600** | cinza | **vermelho** |
| Miniatura | **400×533** | cinza | **vermelho** |

As duas giraram, na mesma direção, com a marca no mesmo lugar. Proporção idêntica.
Retrato e paisagem sem EXIF: conferidos na massa das 10 (7 paisagens, 3 retratos).

### 11. Relatório e PDF (item 11)

| Verificação | Resultado |
|---|---|
| Relatório arquivado (com `pdfRef`) | ✅ abre como **arquivo** — um único iframe com o PDF; **o palco nem foi montado** |
| CAPA de relatório NOVO | ✅ recebe **900×1200** — a principal, degradada pelo palco por orçamento. **Não** é a miniatura (400×533) |
| Miniatura em folha de documento | ✅ nenhuma |

### 12. Base64 (item 12)

13 chaves gravadas hoje. Uma contém `data:image`: `nr13_prontuario_atual`, no campo **`logo`**,
gravada às **01:44Z — antes do deploy**. É a logo da empresa, base64 por desenho (§2-bis) e
alvo da **Fase 7**. As 4 chaves `nr13_fotos_` escritas pelo código novo somam 6,8 KB e **não
contêm imagem nenhuma**.

---

## 13. Reprodução

1. Bundle: `fetch('/', {cache:'reload'})` → extrair `/assets/*.js` → procurar `.thumb.jpg`.
2. Massa: gerar canvas 4032×3024, `toBlob(q0.92)`, `DataTransfer` no input da ficha.
3. Bucket: `POST /storage/v1/object/list/inspecao` com `prefix=<org>/ZZ-TESTE-P2/`.
4. Registro: `GET /rest/v1/app_storage?chave=eq.nr13_fotos_<TAG>`.
5. Cache frio: apagar do IndexedDB `nr13_fotos` os blobs **não pendentes** e recarregar.
6. Requisições: `performance.getEntriesByType('resource')`, separando `?token=` (GET da imagem)
   de `POST /object/sign` (assinatura).

---

## 14. A-F5-02 — CORRIGIDO (aprovado pelo dono em 20/08)

### 14.1 A regra da CAPA, provada antes de mexer

`public/arquivos-inspecao/CAPA.html`, linhas 322-333 — **transcrita, não interpretada**:

```js
let fotoCapa = fotos.find(f => f.isCapa);
if (fotoCapa && fotoCapa.src)              -> fotoCapa.src
else if (fotos.length > 0 && fotos[0].src) -> fotos[0].src
else                                       -> nr13_vaso_<TAG>.imagemPrint
```

**O `&& .src` é o detalhe que decidiu o desenho da correção.** Não basta hidratar a entrada
marcada: se a imagem dela não vier (arquivo indisponível), o template cai em `fotos[0].src` —
e essa entrada precisa ter sido hidratada para o fallback continuar existindo. Hidratar só a
marcada mudaria o comportamento no caminho de falha. Por isso o palco repete **a cadeia
inteira, na mesma ordem**, incluindo o caso do base64 legado já preenchido.

**Nenhum critério novo foi inventado.**

### 14.2 O que mudou e o que não mudou

| | |
|---|---|
| Dados reais, Storage, histórico | **intocados** — nenhuma foto apagada, nenhuma referência removida |
| Array no palco | **inteiro**, com as 18 referências. `fotos.length` e `fotos[0]` são lidos pelo template; mexer neles mudaria a folha |
| O que mudou | **quais entradas ganham a imagem embutida**: só a que a CAPA usaria |
| Fotos de inspeção | intocadas — outra família de chave, outro ramo do código |

### 14.3 Medição

| | Entradas | Imagens embutidas | Peso da chave |
|---|---|---|---|
| **ANTES** (medido em produção, 20/08) | 18 | **18** | **1.100,9 KB** |
| **DEPOIS** (derivado) | 18 | **1** | **≈ 92,9 KB** — **−91,6 %** |

O "depois" é **derivado de dois números medidos**, não medido de ponta a ponta: as 18
referências pesam **5,3 KB** (lido do `app_storage`) e uma foto degradada a 900 px pesou
**87,6 KB** (lida do palco na mesma sessão). **Confirmação em produção fica pendente do
próximo redeploy** — não vou apresentar como medido o que ainda não medi.

Efeito prático: a chave sai de ~33 % do orçamento de 3.368 KB para ~2,8 %, e deixa de crescer
com o número de trocas.

### 14.4 Testes — os 10 pedidos

`src/services/palco.fotos.test.ts` (+11 testes) e `src/features/equipamento/fichaNaoApaga.test.ts` (+4),
`src/features/relatorios/historicoRelatorios.test.ts` (+3).

| # | Pedido | Onde |
|---|---|---|
| 1 | ficha com 1 foto → CAPA recebe essa foto | `palco.fotos` · "ficha com UMA foto" |
| 2 | histórico → palco recebe só a atual | `palco.fotos` · "SÓ a de identificação"; prova também que as outras **nem são baixadas** |
| 3 | trocar → CAPA usa a nova | `palco.fotos` · "trocar a foto" |
| 4 | remover → fallback existente funciona | `palco.fotos` · "sem nenhuma marcada, cai em fotos[0]" e "marcada SEM imagem disponível" |
| 5 | array real completo preservado | `palco.fotos` · "o array REAL continua inteiro" |
| 6 | arquivos antigos continuam no Storage | `fichaNaoApaga` · varredura: a ficha não importa nem chama `removerFoto` |
| 7 | fotos das inspeções múltiplas e intactas | `palco.fotos` · "as fotos das INSPEÇÕES continuam todas" |
| 8 | palco não converte fotos antigas | `palco.fotos` · "18 entradas, 1 imagem", 1 download |
| 9 | relatório arquivado com `pdfRef` imutável | `historicoRelatorios` · "relatório arquivado é ARQUIVO, não receita" |
| 10 | nenhuma base64 nova como fonte definitiva | `palco.fotos` · "nada de base64 é criado onde não havia" + `fichaNaoApaga` · "não escreve base64" |

Suíte **1125/1125** (90 arquivos), build verde.

---

## 15. A-F5-01 — investigação READ-ONLY encerrada

Investigado o caminho `…/ZZ-TESTE-P2/05d97b1d-dc98-4e57-9fae-2ef86dcefd36.jpg` (142,1 KB).

### O que a evidência mostra

| Fonte | Resultado |
|---|---|
| `app_storage_excluidos` (tombstones do servidor) | **nenhuma linha** para `nr13_fotos_ZZ-TESTE-P2` — a chave nunca foi excluída. O que sumiu foi uma **entrada dentro do array**, e isso não gera tombstone |
| `app_storage.versao` no momento da anomalia | **2** — houve exatamente **duas** gravações da chave antes da sessão de hoje. O upload das 10 fotos, no código antigo, grava **uma** vez |
| `atualizado_em` | `2026-08-20T15:05:40Z` — **anterior ao redeploy** |
| Bucket | o arquivo **não está lá** ⇒ `supabase.storage.remove()` foi chamado |
| `app_storage_mutacoes` | **não legível**: a tabela não tem policy de `select` (só a RPC `security definer` a enxerga). Consulta devolve `[]`, o que é **ausência de acesso, não ausência de registro** |

### Leitura

O único caminho de código que apaga arquivo do bucket é `removerFoto`, e no bundle daquele
momento ele era chamado **apenas** por `Galeria.remover()` — o botão "×" da galeria antiga.
Uma segunda gravação da chave (versão 2) com uma entrada a menos e o arquivo apagado é
exatamente a assinatura desse caminho. **Mas não registrei esse clique, e não vou afirmar o
que não observei.**

### Veredito

> **A-F5-01 — CAUSA NÃO DETERMINADA / EVENTO ANTERIOR À FASE 5.**

Sem evidência de regressão causada pelo código novo: a última escrita é anterior ao bundle da
Fase 5, e o caminho capaz de produzir o efeito (`Galeria.remover` → `removerFoto`) **foi
removido pela própria Fase 5** — `FotoIdentificacao` não chama `removerFoto`, e isso agora
está travado por teste de varredura (`fichaNaoApaga.test.ts`).

Impacto: massa de teste, conta de teste. **Não bloqueia a Fase 5.**
