# Fase 11 · hardening final — o vetorial pronto para virar, e ainda não virado

**04/09/2026.** O relatório vetorial existia e estava certo em quase tudo. Este
registro é o que faltava para ele poder substituir o raster: as folhas vazias, o
gráfico, os certificados, a paridade de conteúdo — e a chave que faz a virada
ser desfeita em um passo.

**O padrão global continua RASTER.** Nada aqui troca o motor de produção.

---

## 0 · Portal — a pendência que continua pendente

O endurecimento da Edge `portal_cliente` (negar `nr13_livro_rascunho_*` mesmo
quando a chave termina em `_<TAG>` de equipamento autorizado) está implementado e
testado no commit `6225581`. **Não foi publicado.**

```
$ ls ~/.supabase/
telemetry.json
traces
```

Não há `access-token`: a CLI segue sem autenticação, e o dashboard do Supabase
renderiza corpo vazio nesta máquina. O caminho seguro para destravar continua
sendo `! npx supabase login --no-browser` no terminal do dono (fluxo de
dispositivo, sem segredo passando pelo chat) — `--token <PAT>` deixaria o token
no histórico da conversa.

> **O que está exposto enquanto isso: nada de novo.** O rascunho do Livro já é
> negado pelo bundle e não entra em `nr13_livro_<TAG>`; a Edge é a terceira
> camada, e é a que falta. A pendência não bloqueou o resto, por decisão do dono.

---

## 1 · Folhas de fotos vazias

`folhaDeFotos` abria a folha ANTES de olhar a lista. Uma inspeção sem foto do
exame interno gerava uma página inteira dizendo "sem registro fotográfico nesta
etapa" — e cinco etapas sem foto, cinco páginas em branco num documento assinado
por engenheiro.

| fotos | folhas |
|---|---|
| 0 | **0** |
| 1–4 | 1 |
| 5–8 | 2 |
| 9–12 | 3 |

`folhasDeFotos(0)` devolvia 1 e agora devolve 0; o teste que afirmava o contrário
foi invertido, com o motivo escrito. Preservados: 4 por folha (§5), proporção
real, `contain`, legenda.

**O sumário acompanha.** Seção fotográfica que não vai existir não é mais
anunciada — um índice que aponta para página inexistente manda o leitor procurar
o que não foi impresso.

### O defeito irmão, achado no gate: seções inteiras a mais

Rodando o cenário A (8 folhas selecionadas), o vetorial saiu com **14 páginas**.
Ele emitia sempre as 21 seções — ultrassom e teste hidrostático incluídos, cada
um com uma folha de travessões, num relatório onde o inspetor não selecionou
esses ensaios.

Paginação diferente entre motores está autorizada. **Ensaio a mais, não**: é o
documento afirmando que houve um exame que ninguém fez.

`composicao.ts` passou a derivar as seções da MESMA lista de folhas que o
visualizador monta e o raster rasteriza (`FOLHA_DA_SECAO`). Cenário A depois da
correção: **8 páginas contra 8**.

---

## 2 · Curva do teste hidrostático, em vetor

O gráfico existe na folha atual em Chart.js. Agora existe no PDF **desenhado**,
não fotografado.

Medido na página 20 do cenário C:

| | |
|---|---|
| caminhos vetoriais | **83** |
| textos | **66** |
| tracejados (`setDash`) | 2 — a linha da PT |
| **objetos de imagem** | **0** |

Texto extraído da página:

```
GRÁFICO DE PRESSURIZAÇÃO E ESTABILIZAÇÃO
0 5 10 15 20 25    PT: 18.0 kgf/cm²
0.00 kgf/cm² 4.50 9.20 13.80 18.00 18.00 17.90 9.00 0.00
0 2 4 6 8 18 28 30 32
Tempo (minutos)   Pressão (kgf/cm²)
```

Cada valor bate com `injecao.th.curva`, com as mesmas duas casas.

**O que veio do template, sem reinvenção:** os pontos, a pressão de teste lida
pelo mesmo regex `/[\d.]+/`, as faixas de 50% e 80% da PT do `pressurePlugin`, os
cinco cortes e as cinco cores de `getHeatColor`, os cinco `addColorStop` do
gradiente, o eixo X categórico e os títulos dos eixos.

**O que é desenho, e está declarado no arquivo:** a escala do eixo Y (topo
`max(pico, PT) × 1,2` arredondado para passo redondo — o Chart.js usa um
algoritmo interno; o valor impresso em cada ponto continua sendo o do dado) e o
gradiente, que num PDF não existe como traço e virou uma cor por segmento,
interpolada dos mesmos cinco stops.

A **tabela de leituras continua**: o gráfico mostra o comportamento, a tabela dá
o número exato — e é a tabela que se lê num documento impresso em preto e branco.

---

## 3 · Certificados — preservados, cada um pelo seu caminho

O novo layout vale para o RELATÓRIO. Certificado é documento de terceiro, com
emitente e numeração próprios: redesenhá-lo seria reescrevê-lo.

| o que é | onde vive | como entra |
|---|---|---|
| certificado do padrão (`nr13_rastreab_`) | **PDF pronto** | páginas COPIADAS pelo pdf-lib — sem rasterizar, sem recomprimir |
| folha de calibração (`CERTIFICADO-CAL-*.html?calibId=`) | template HTML | rasterizada da folha montada, como hoje |

O primeiro caminho é a MESMA `anexarRastreabilidades` do gerador raster — o
certificado escaneado chega com os bytes originais. O segundo **precisa**
rasterizar: não existe PDF de origem. Rasterizar essas páginas é o oposto do que
a Fase 11 proíbe — proibido é o `html2canvas` da página inteira virar o relatório
todo. Aqui o corpo é vetor de ponta a ponta e a raster fica confinada ao
documento que não pode ser redesenhado.

Medido no cenário C: 27 páginas = 22 do corpo + **1** folha de calibração + **4**
páginas dos dois certificados padrão. `falhasAnexo: []`. O texto
`"CERTIFICADO DE CALIBRAÇÃO DO PADRÃO"` e `"Página 2 do certificado original"`
saem **extraíveis** do PDF final: as páginas foram copiadas, não fotografadas.

Certificado que não entra volta NOMEADO em `falhasAnexo` — nunca some calado.
A tela/menu Certificados não foi tocada.

---

## 4 · Folhas de reconstituição — NÃO EXISTEM neste sistema

Item verificado antes de portar, e o resultado foi que não há o que portar:

```
$ find public -iname "*recons*"        → nada
$ grep -ril "reconstitui" public/      → nada
$ grep -n "RECONS" src/features/relatorios/tipos.ts  → nada
```

Não há arquivo, não há entrada em `DOCUMENTOS_DISPONIVEIS`, não há auto-injeção,
não há referência em código. **`PRONTUARIO-RECONSTITUICAO-1..4` nunca existiu
neste repositório.**

> **Duas afirmações do projeto estão desatualizadas e ficam aqui corrigidas:** o
> `CLAUDE.md` §8 diz que essas folhas "seguem como folhas do relatório (ver §7)"
> — o §7 não as lista; e a especificação da 10C as coloca em "o que existe no
> sistema e não existe na referência". Nenhuma das duas é verdadeira hoje.

Portar folha inexistente exigiria inventar campos e cálculos, que é exatamente o
que o pedido proíbe.

---

## 5 · Paridade raster × vetorial

Três cenários, gerados pelos DOIS motores contra os MESMOS dados, com os
templates reais montados.

### Conteúdo, campo a campo (cenário C, texto extraído do PDF)

**71 de 72 campos conferidos presentes.** Identificação, TAG, fabricante, nº de
série, ano, código de projeto, local, contratante e endereço, nº do relatório,
emissão, validade, execução, tipo de inspeção, fluido, classe, volume, grupo,
categoria, enquadramento, PMTA nas três unidades, PTH, os dois componentes com
material e espessuras, as duas fórmulas do memorial (UG-27 e UG-32) com S,
itens/respostas/observações do checklist, comentários da documentação, itens e
conclusões dos dois exames visuais, todo o bloco de ultrassom (aparelho,
acoplante, cabeçote, velocidade, pontos, medidas, requerida, instrumento padrão,
série e certificado), todo o bloco do TH (fluido, pressões, data, pontos da
curva, eixos, linha da PT, rótulos), laudo APTO, as três próximas inspeções,
os dois assinantes com função e CREA, empresa executante e CNPJ, legendas de
foto e os dois certificados anexados.

O único item da lista que não casou foi a busca literal `"Página 1 de 27"` — e
essa é a resposta certa:

```
Página 1 de 22 … Página 22 de 22     (22 ocorrências, todas "de 22")
```

O corpo do relatório numera as SUAS 22 páginas; as 5 páginas de certificado
anexadas ao fim não recebem numeração do relatório. É o mesmo comportamento da
produção raster hoje — certificado é documento de terceiro, não folha do
relatório.

### Estrutura do arquivo

| | A vet | A raster | B vet | B raster | C vet | C raster |
|---|---|---|---|---|---|---|
| páginas | 8 | 8 | 13 | 12 | 27 | 26 |
| A4 exato 595,28 × 841,89 pt | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **caracteres de texto** | **4.046** | **0** | **5.801** | **0** | **10.148** | **314** |
| Carlito embutida (`FontFile2`) | **4** | 0 | **4** | 0 | **4** | 0 |
| objetos de imagem | **0** | 8 | 11 | 12 | 28 | 22 |

O raster tem **zero** texto: cada página é uma fotografia. Os 314 caracteres do
C-raster são justamente os certificados anexados por pdf-lib — a prova de que
aquele caminho preserva o original em vez de fotografá-lo.

> **Armadilha de medição registrada.** A varredura de bytes crus por
> `/FontFile2` devolve 0 no C vetorial, porque o pdf-lib re-salva o arquivo e os
> objetos vão para dentro de object streams comprimidos. A pergunta certa é ao
> DICIONÁRIO (`enumerateIndirectObjects`), e aí aparecem os **4** subsets, iguais
> aos do B. Quem parar na varredura de bytes conclui, errado, que a fonte sumiu
> quando o relatório tem certificado.

As páginas 1, 8, 20, 23 e 27 foram **rasterizadas de volta** para conferir que
não há folha em branco: 5,24% · 5,60% · 21,67% · 22,37% · 0,13% de tinta (a
última é a página final do certificado, uma linha de texto).

### Diferenças que sobram, e por que sobram

| diferença | por quê |
|---|---|
| B: 13 × 12 páginas | 6 fotos do exame externo viram **2** folhas no vetorial (regra dos 4 por folha, §5). O raster imprime **1** página por iframe montado e não pagina o excedente |
| C: 27 × 26 páginas | mesma causa: 9 + 4 + 3 fotos paginadas corretamente |
| numeração para em 22 no C | corpo numerado entre si; certificados anexados sem numeração — igual à produção |
| fonte | vetorial: Carlito embutida. Raster: nenhuma — não há texto |

Nenhuma diferença é perda de conteúdo. As duas de paginação são o vetorial
imprimindo fotos que o raster deixa de fora.

### Fotos: `contain` com a proporção real

Medido chamando a primitiva com uma caixa de 88 × 74 mm:

| entrada | desenhado | razão | cabe | centralizada |
|---|---|---|---|---|
| retrato 480×640 | 55,5 × 74,0 | 0,750 | ✔ | ✔ |
| paisagem 640×360 | 88,0 × 49,5 | 1,778 | ✔ | ✔ |
| quadrada 500×500 | 74,0 × 74,0 | 1,000 | ✔ | ✔ |
| proporção desconhecida | 88,0 × 66,0 | 1,333 | ✔ | ✔ |

O último é o recuo declarado (4:3) para imagem que o navegador não conseguiu
medir — não um esticão. Virou teste na suíte.

---

## 6 · SHA-256, `pdfRef` e integridade

```
sha256(C-vetorial) = 4332b512607b53c802c7dd0628bfb9a29c5a0753afd64eda93bcb48a95c0be6a
bytes = 646.515      estável entre chamadas = sim
1 bit trocado no meio do arquivo → 8f9b2da7b9308a0c…   (detectado)
```

O hash é o mesmo `sha256Hex` do fluxo de finalização, e ele não sabe qual motor
gerou os bytes — `publicarArtefato(bytes, paginas)` recebe bytes. Upload,
`pdfRef` e reabertura são o caminho já provado em 04/09 com 4.597.892 bytes e
`verificarIntegridade` = `true`.

> **O que NÃO foi possível provar nesta sessão:** upload real ao bucket e
> reabertura pelo `pdfRef`, porque exigem conta autenticada e esta sessão não
> tem a senha da conta de teste. O trecho é engine-agnóstico e não foi tocado —
> `git diff` em `artefatoRelatorio.ts`, `VisualizadorPdf.tsx`,
> `historicoRelatorios.ts`, `RelatoriosV9.tsx` e `arquivados.ts` está **vazio**.

---

## 7 · Convivência: qual motor gera a PRÓXIMA finalização

`features/relatorios/motorPdf.ts`. O gerador raster **não foi apagado** e
continua sendo o padrão.

| onde | alcance | para quê |
|---|---|---|
| `?motor=vetorial` na URL | uma sessão do visualizador | testar numa conta sem mudar nada para ninguém |
| `nr13_motor_pdf` (chave global) | a organização | a virada, quando for autorizada |

A URL vence a chave. Ausência de valor é ausência de decisão → `raster`. Só a
string exata `'vetorial'` troca o motor: `'sim'`, `true` e qualquer outra coisa
caem no raster.

**O que a chave NÃO alcança: documento já emitido.** Relatório finalizado é
arquivo com hash (§7-quater) — visualizar, imprimir, baixar e o Portal servem o
`pdfRef` daquela emissão. Trocar o motor não regenera, não reabre e não
recalcula PDF histórico. O documento de 2024 continua sendo os bytes de 2024,
feitos pelo motor de 2024.

`nr13_motor_pdf` foi registrada em `CHAVES_ESSENCIAIS` e nas `GLOBAIS` de
`familiasChave` — precisa estar no boot porque a decisão é tomada no
"Finalizar", e consultar o servidor naquele instante faria a finalização
depender da rede.

---

## 8 · `/relatorios`

Preservada inteira: `+ Criar relatório`, `?editor=1`, visualizar, editar nome,
arquivar finalizado, excluir rascunho, filtro de arquivados, layout compacto,
ícone WebP e mobile sem overflow. `git diff` em `RelatoriosV9.tsx` e
`arquivados.ts`: **vazio**.

---

## 9 · Medições

Tempos de **carga fria** (a primeira geração após recarregar a página; repetições
na mesma aba medem o cache do html2canvas e não valem).

| cenário | motor | páginas | bytes | tempo |
|---|---|---|---|---|
| **A** simples | raster | 8 | 2.615.399 | 8.313 ms |
| | **vetorial** | 8 | **54.065** | **325 ms** |
| **B** com fotos | raster | 12 | 3.662.610 | 12.297 ms |
| | **vetorial** | 13 | **89.879** | **320 ms** |
| **C** completo | raster | 22 | 7.466.752 | 22.608 ms |
| | **vetorial** | 27 | **646.510** | **1.834 ms** |

| cenário | redução de tamanho | ganho de tempo | por página |
|---|---|---|---|
| A | **97,9%** (48×) | **25,6×** | 327 KB → 6,6 KB |
| B | **97,5%** (41×) | **38,4×** | 305 KB → 6,7 KB |
| C | **91,3%** (11,5×) | **12,3×** | 339 KB → 23,4 KB |

O C tem a menor redução porque é o que tem 27 fotos: foto é raster nos dois
motores. O corpo vetorial do C pesa ~6 KB por folha; o resto são as imagens que
existiriam de qualquer jeito.

Para a cota do Supabase (§12), a conta que importa: **um relatório completo
deixou de custar 7,5 MB e passou a custar 0,65 MB** por emissão, subida e
download.

---

## 10 · Gate

| | |
|---|---|
| suíte | **1.741 testes, 145 arquivos, 0 falhas** (+21 testes) |
| `tsc -b` | limpo |
| `npm run build` | verde |
| testes do gerador | 39 no `pdfVetorial.test.ts` |
| inspeção real dos PDFs | 6 arquivos: páginas, A4, fontes, imagens, texto |
| extração de texto | 71/72 campos conferidos |
| objetos de imagem | contados por página nos dois motores |
| SHA-256 / adulteração | conferidos |
| navegador | 3 cenários, templates reais, dois motores |
| históricos abrem o arquivo antigo | caminho intocado (`git diff` vazio) |

**Gate manual pendente: IMPRESSÃO FÍSICA.** Esta máquina não tem impressora. É
gate manual, não falha técnica — o A4 exato (595,28 × 841,89 pt em 100% das
páginas dos 6 arquivos) e as margens de 9/15/7/15 mm estão medidos.

**Finalização controlada com o motor vetorial:** exercitada pelo mesmo caminho de
código do `salvarHistorico` (mesma chamada, mesmos parâmetros, mesmo container),
mas **não numa conta real**, pelo mesmo motivo do §6. Fica declarado.

---

## 11 · Resposta objetiva

| pergunta | resposta |
|---|---|
| Portal Edge publicado | **NÃO** — CLI sem token; pendência mantida e registrada |
| folhas fotográficas vazias | **CORRIGIDO** (e seções inteiras a mais, achadas no gate) |
| gráfico TH vetorial | **OK** — 83 caminhos, 0 imagens |
| certificados | **OK** — PDF copiado; folha HTML rasterizada só ela |
| reconstituição | **NÃO APLICÁVEL** — não existem neste sistema (§4) |
| paridade de conteúdo | **OK** — 71/72; o 72º é a numeração, e está certa |
| tamanho | 7,47 MB → **0,65 MB** (C) · até **97,9%** menor (A) |
| tempo | 22,6 s → **1,8 s** (C) · até **38×** mais rápido (B) |
| testes | 1.741 · tsc · build |
| impressão física | **PENDENTE** — sem impressora nesta máquina |
| **vetorial pronto para virar padrão** | **SIM** — e NÃO virado |
