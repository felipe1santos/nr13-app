# Fase 12B · dois modelos de relatório, e um visualizador que devolve a tela ao documento

**04/09/2026.** Duas entregas independentes: a escolha **Clássico / Novo** por
empresa, e a substituição do leitor de PDF do navegador por um visualizador do
próprio app.

---

## 1 · MODELO VISUAL × MOTOR TÉCNICO

| camada | quem decide | vocabulário | onde |
|---|---|---|---|
| **Modelo visual** | a EMPRESA, em "Minha Empresa" | `Clássico` / `Novo` | `features/relatorios/modeloDocumento.ts` |
| **Motor técnico** | o código | `raster` / `vetorial` | `features/relatorios/motorPdf.ts` |

A tradução é 1:1 e vive num lugar só:

```
'classico' → motor 'raster'
'novo'     → motor 'vetorial'
```

Na interface não aparece raster, vetorial, motor nem engine. Quem opera escolhe
um desenho, não uma implementação. O motor continua existindo porque é o que os
geradores entendem e é a porta de rollback (`?motor=` na URL,
`definirMotorPdf`) — mas ele deixou de ser o que o usuário configura.

### A configuração é da ORGANIZAÇÃO

`nr13_modelo_relatorio` é chave **global**, e no armazenamento v2 global já
significa "da organização": o IndexedDB é `nr13_dados_<org_id>` e o
`app_storage` é escopado por org pela RLS. Todo usuário daquela empresa lê a
mesma escolha, em qualquer aparelho. **Nenhum mecanismo novo de configuração foi
criado**, e não existe preferência por usuário nem por navegador.

> **Correção de um mal-entendido registrado antes:** `nr13_motor_pdf` nunca foi
> uma preferência global de TODAS as organizações. Ela também é por org — a
> virada de 04/09/2026 alcançou a org de teste, e as outras 29 seguiram no
> desenho antigo. O que faltava não era escopo: era **a escolha existir na
> tela**.

### O padrão quando a chave não existe

Herda o `nr13_motor_pdf` da própria organização. Sem esse encadeamento, a org
já virada seria rebaixada para Clássico sem ninguém ter pedido — o documento
mudaria de cara sozinho. Provado em produção: ao abrir a tela pela primeira vez,
a org de teste já apareceu marcada em **Novo**, sem nenhuma chave nova gravada.

## 2 · O modelo congela no RASCUNHO, não na finalização

`modeloDocumento` é carimbado em `metaPadrao`, no nascimento do rascunho.
`motorDoRelatorio` decide nesta ordem:

1. `?motor=` na URL — rollback/diagnóstico, vale para uma sessão;
2. **`meta.modeloDocumento`** — o modelo congelado quando o rascunho nasceu;
3. a configuração atual da empresa — só para rascunho anterior a esta fase.

Sem o degrau 2, um relatório começado na segunda e finalizado na quinta sairia
com o desenho de quinta. Duplicar é relatório NOVO e nasce com o modelo atual —
a mesma regra que já valia para os snapshots de empresa e assinantes (§7-bis).

**Documento finalizado não passa por aqui.** Ele tem `pdfRef` e é servido como
arquivo (§7-quater): nenhuma configuração de empresa alcança histórico.

## 3 · O visualizador

O `<iframe src={blob}>` entregava a tela ao leitor de PDF do NAVEGADOR. Ali o
app não manda em nada: a coluna de miniaturas abre sozinha e come um terço da
largura, a barra dele soma altura à barra do app, e `#navpanes=0` / `#toolbar=0`
são convenção da Adobe que cada navegador implementa como quer. Forçar por CSS
seria pior — o conteúdo é de outra origem.

Então o desenho passou a ser nosso, com o **pdf.js que o projeto já usa** para
rasterizar certificados na impressão (`printService`). Nenhuma dependência nova.

| | |
|---|---|
| miniaturas | **fechadas por padrão**, botão `☰ Páginas` abre/fecha |
| abertura | ajuste à **largura da página**, recalculado por `ResizeObserver` |
| zoom | −/+ e um botão que volta ao ajuste automático |
| barra | **uma linha**: `☰ Páginas · 1/N · − 100% + · Documento arquivado · Abrir em outra aba` |
| render | preguiçoso (`IntersectionObserver`, margem de 400px) |
| fallback | se o pdf.js falhar, cai no `<iframe>` de antes |

> **Viewer ≠ gerador.** Nada aqui produz PDF: só desenha na tela os bytes do
> `pdfRef`.

Sem o render preguiçoso, abrir um relatório de 22 folhas rasterizadas desenharia
as 22 antes de mostrar a primeira.

Também: o botão **"Configurações" some no documento arquivado** (todos os campos
do modal já abrem bloqueados) e a linha do SHA virou rodapé de 10,5px.

### Finalizar já entrega o arquivo

`salvarHistorico` passou a marcar `relatorioArquivado` no fim. Antes, a tela
continuava com os iframes montados até alguém reabrir o relatório pelo
histórico — e nessa janela "Imprimir" rasterizava a prévia em vez de servir o
PDF recém-emitido. O documento era o mesmo; o que mudava era o caminho.

---

## 4 · Validação em produção

Org de teste, equipamento `ZZ-TESTE-P2`, relatórios de **uma folha** (CAPA) para
não gastar cota — a regra do §12 vale também para validação funcional.

### A · Empresa em Clássico → relatório Clássico

| | |
|---|---|
| chave gravada | `nr13_modelo_relatorio = {"modelo":"classico"}`, versão 1 (pela RPC oficial) |
| rascunho nasceu | `modeloDocumento: "classico"` |
| rótulo do botão | **"Imprimir pré-visualização"** (ainda não há arquivo) |
| finalizado | `REL-1788551349331` · SHA `834a0f909e825941` · 1 página |
| bytes | **387.670** |
| conteúdo | **1 `/Subtype /Image`, 0 `FontFile2`** — é o gerador raster |

### B · Empresa em Novo → relatório Novo

| | |
|---|---|
| rascunho nasceu | `modeloDocumento: "novo"` |
| finalizado | `REL-1788551975460` · SHA `6376f499f0d94f2b` · 1 página |
| bytes | **32.219** (12× menor que o Clássico, mesma folha) |
| conteúdo | **0 imagens, 4 `FontFile2`, Carlito embutida** — é o gerador vetorial |

### C · Mudar a empresa NÃO muda o rascunho em andamento

O rascunho `REL-1788551975460` nasceu com a empresa em **Novo**, foi salvo, e
então a empresa foi trocada para **Clássico**. Ao reabrir, o registro continuava
com `modeloDocumento: "novo"`, e a finalização — feita com a empresa em
Clássico — produziu o PDF **vetorial** de 32.219 bytes acima.

### D · Cada histórico abre o SEU arquivo

Com a empresa em Clássico, os dois relatórios foram abertos e baixados:

| relatório | modelo | bytes servidos | SHA | conteúdo |
|---|---|---|---|---|
| `REL-1788551975460` | novo | 32.219 | `6376f499f0d94f2b` | 4 FontFile2, 0 imagem |
| `REL-1788551349331` | clássico | 387.670 | `834a0f909e825941` | 1 imagem, 0 fonte |

O SHA dos bytes servidos confere com o do registro nos dois casos, e o SHA
exibido na tela é o mesmo. Nenhuma regeneração.

### Visualizador — desktop (1.396px) e estreito (585px)

| | desktop | estreito |
|---|---|---|
| miniaturas ao abrir | **fechadas** | **fechadas** |
| `☰ Páginas` | abre (132px) e a área do PDF vai de **1.093 → 951px**; fecha e volta | painel escondido por media query, botão continua sem quebrar a barra |
| altura da barra do visualizador | **38px** | 38px |
| folha × área | 1.058 / 1.093 | 513 / 548 |
| rolagem horizontal da página | **não** (`scrollWidth === clientWidth`) | **não** |
| ações | Voltar · Imprimir · Baixar PDF · Abrir em outra aba, todas na tela | idem |

Ressalva medida: com a aba em SEGUNDO PLANO o navegador congela o ciclo de
quadros, e o `IntersectionObserver` não dispara — as páginas só desenham quando
a aba fica visível. É comportamento do navegador, não do componente, e não
afeta o arquivo.

---

## 5 · Não foi tocado

Conteúdo dos PDFs, SHA, `pdfRef`, histórico, certificados, Livro, prontuário
(que segue com a própria chave de motor), dados técnicos e cálculos. Nenhum
gerador foi removido: raster e vetorial continuam no bundle, com rollback por
`definirMotorPdf` e por `?motor=`.

| | |
|---|---|
| suíte | **1.829 testes, 152 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
