# Fase 12A · a virada do prontuário — e o fluxo de emissão que não existia

**04/09/2026.** O prontuário vetorial virou o padrão de produção. Mas a virada
não foi só trocar uma chave: **não havia o que trocar**.

---

## 1 · O achado que veio antes da virada

`nr13_motor_prontuario = vetorial` teria sido **no-op**. A busca por quem lia
`motorProntuarioAtual` no fluxo normal voltou vazia: o prontuário não tinha
etapa de emissão nenhuma — só **"Imprimir"**, que remonta as seis folhas com os
dados VIVOS.

Isso é o mesmo defeito que o §7-quater corrigiu no relatório: duas impressões da
mesma TAG em dias diferentes podiam sair diferentes, e ninguém perceberia.

**Então a virada exigiu construir o fluxo antes.**

## 2 · O prontuário passa a ser EMITIDO

`features/prontuarios/emissaoProntuario.ts` + botão **"Emitir prontuário"**:

```
dados → motorProntuarioAtual → PDF → publicarArtefato → SHA-256 → Storage → pdfRef
```

`publicarArtefato`, `artefatoDe` e `baixarArtefato` foram reusados **sem
alteração** — é o mesmo caminho do relatório. "Abrir documento emitido" serve o
ARQUIVO, nunca uma remontagem.

### Imutabilidade por revisão

`nr13_pront_emitido_<TAG>` guarda uma **LISTA**, e `registrarEmissao`
**acrescenta ao fim**. Um `pdfRef` já gravado nunca é substituído: corrigir algo
gera emissão nova, e a anterior segue alcançável pelo próprio `pdfRef`.

> Sobrescrever seria pior que perder: o arquivo antigo continuaria no bucket,
> órfão, com um hash que não confere com registro nenhum.

Emitir duas vezes sem mudar nada **não duplica** a linha (mesmo SHA).

---

## 3 · A virada, e a independência do relatório

`nr13_motor_prontuario = {motor:'vetorial'}` gravado pela RPC oficial
(`aplicar_mutacao_storage` → `aplicado`, versão 1).

**O relatório não foi tocado**, conferido depois da virada:

```
nr13_motor_pdf → { motor: "vetorial", em: "2026-09-04T15:23:54.662Z" }  versão 1
                  ↑ mesmo timestamp de antes, mesma versão
```

Um teste garante que `?motor=vetorial` (do relatório) **não** vira o prontuário,
e vice-versa.

---

## 4 · E2E pós-virada, pelo fluxo normal

Org de teste, `COMPRESSOR V8-15/200L`. URL **sem `?motorPront=` e sem
`?piloto=`** — conferido antes de emitir.

| | |
|---|---|
| motor gravado na emissão | **`vetorial`** ← escolhido pela configuração, não por parâmetro |
| páginas | **6**, todas em **A4 exato** (0 fora) |
| bytes | **71.426** |
| `pdfPendente` | **`false`** |
| upload | **HTTP 200** |
| tamanho baixado × registrado | **idênticos** |
| SHA-256 | **confere** |
| assinatura | `%PDF-1.3` |
| Carlito embutida | **4× FontFile2 / Type0 / CIDFontType2** |
| texto selecionável | 2.730 caracteres |
| numeração | "Página 1 de 6" … "Página 6 de 6" |

Conteúdo conferido presente no arquivo emitido: **número do prontuário**
(`REL-1787152522812`), **data de emissão** (19/08/2026), **cliente**
(Posto Ipiranga), **executante** (MDK ENG), **bairro** (Alvorada),
**responsabilidade técnica**, **ultrassom** e **croqui**.

### Reabertura sem regeneração

| | |
|---|---|
| bytes reabertos | **71.426** |
| SHA do que foi servido | **igual ao do registro** |
| emissões depois de abrir | **1** — abrir não emitiu nada |

---

## 5 · O croqui — e o defeito que a validação pediu e encontrou

Validar "proporção correta, sem distorção" achou um defeito real:
`desenharCroqui` chamava a primitiva `foto` **sem passar a proporção**, e ela
cai em **4:3** quando não recebe nenhuma.

Croqui 2D é desenho **cotado**. Esticado, ele imprime cota errada — num
documento assinado por engenheiro isso é pior do que não ter croqui.

Corrigido: `svgParaPng` devolve `{ png, proporcao }` medindo a imagem real, e a
folha repassa. O PNG legado (`nr13_croqui3d_`) também passou a ser **medido** em
vez de assumido. Quatro testes cobrem croqui largo (4,5), quase quadrado (1,1) e
detalhe alto (0,6), e um deles prova que sem a proporção a primitiva realmente
assume 4:3 — é por isso que o gerador sempre a envia.

Rasterização em **3×** mantida e declarada: o jsPDF não importa SVG sem plugin,
e trazer um segundo motor de desenho contradiz "nenhum framework novo". Croqui
que falhe na conversão é **dito na folha** ("Croqui não pôde ser convertido para
impressão"), nunca substituído por outro desenho.

---

## 6 · Rollback

`definirMotorProntuario('atual')`. **Nada foi removido**: o gerador antigo
(`imprimirRelatorio`), os testes antigos e a seleção de motor continuam no lugar,
e ausência de valor continua significando `atual` — apagar a chave já é rollback.
O `?motorPront=atual` também força, sem tocar na configuração.

---

## 7 · Decisão registrada: Portal

A guarda de paridade de prefixos pegou a família nova. `nr13_pront_emitido_` foi
declarada em `FORA_DO_PORTAL` **com o motivo**: não é decisão de segurança — o
prontuário emitido é documento do cliente e caberia bem lá —, mas a tela do
Portal ainda não sabe apresentá-lo, e servir a chave sem tela que a use só
engorda a carga inicial.

> **Atenção ao repo × produção:** essa linha ainda **não foi publicada** na Edge.
> O comportamento é idêntico (a família nunca esteve em `PREFIXOS_POR_TAG`, então
> a Edge já a nega), mas `prefixos.ts` no repo e o publicado divergem por essa
> linha. Vale republicar `portal_cliente` na próxima janela.

---

## 8 · Números

| | |
|---|---|
| suíte | **1.801 testes, 149 arquivos, 0 falhas** |
| `tsc -b` · build | limpos |
| bundle | `assets/index-DUcY11yv.js` |
| defeitos achados pela validação | 4 (emissão/nº, bairro/CEP, croqui esticado, colisão de id de revisão) |

Fora do escopo e **não tocados**: Livro/Registro, capa do Livro, termo de
abertura, certificados de calibração, registros trancados, PDFs históricos de
relatório e o motor vetorial do relatório.
