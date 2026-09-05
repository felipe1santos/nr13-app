# Re-auditoria bloqueante · completude do Modelo Novo

**05/09/2026.** Comparação do **resultado renderizado**: a referência aberta no
Chrome (servida em `http://127.0.0.1:8199`, mesmo arquivo de
`C:\projetos\vender\relatorio-nr13.html`) contra a **prévia real** do sistema e
o PDF de 12 páginas emitido na org de teste. Nada foi corrigido nesta rodada.

A auditoria anterior declarou "9 de 20 completas" contando presença de seção.
Esta conta elementos: faixas, rótulos, valores, linhas, colunas, marcas, notas,
parágrafos, slots. **Seis** seções resistem a esse critério.

---

## Método

| lado | fonte |
|---|---|
| referência | 21 folhas renderizadas no navegador; `innerText` folha a folha; contagem de elementos direto do HTML |
| Modelo Novo | prévia renderizada (154 áreas editáveis), PDF real de 12 páginas com texto extraído, e contagem por função de folha em `folhas.ts` |

Exclusões intencionais (não contam como divergência): folha 21 · Registro de
Segurança, capa do Livro, termo de abertura, históricos arquivados e a
aparência interna dos certificados.

---

## Matriz seção a seção

### F1 · CAPA — **COMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| tabelas | 3×4 + 6×2 | 3×4 + 6×2 |
| rótulos / valores | 12 / 11 | 12 / 12 |
| áreas de imagem | 1 (foto) + logo | 1 (foto, elástica) + logo |
| textos | título, subtítulo, Portaria | os três |

FALTANDO: — · EXTRA: — · FONTE: automática + override · VISUAL: fiel.

### F2 · SUMÁRIO / OBJETIVO / DOCUMENTOS / ESCOPO — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| sumário | 17 linhas, 3 colunas (nº · seção · **página**), com subitens 7.1–7.5 | 8 linhas, 2 colunas, sem numeração hierárquica e **sem página** |
| objetivo | **2 parágrafos** (citando Portaria, exames, PMTA e parecer) | 1 parágrafo de 3 linhas |
| documentos | tabela 6×2 com cabeçalho: NR-13, ASME VIII, **ABNT NBR 16035**, ASME V + **linha extra editável** | 3 linhas, sem cabeçalho, sem NBR 16035, sem linha extra |
| nota | "os documentos acima constituem a base normativa…" | **ausente** |
| 2.1 escopo | banner + bloco de texto livre | **ausente** |

FALTANDO literal: numeração 1–11 com subitens; coluna de página com página
real; 2º parágrafo do objetivo; ABNT NBR 16035; linha extra de documento;
cabeçalho "Documento / Título"; nota normativa; **seção 2.1 inteira**.

### F3 · IDENTIFICAÇÃO / PLACA — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| identificação | 6×4 (12 campos) | 12 campos ✔ |
| PRESSÕES | 4×4+cab · **PMO**, PMTA, PTH em **MPa · psi · kgf/cm²** | 2 linhas (PMTA, PTH) em MPa · kgf/cm² · **bar** |
| DATAS | 1×4 ✔ | ✔ |
| placa | slot de FOTO + legenda "Registro fotográfico da placa de identificação" | placa **reconstruída** (EXTRA) + foto real opcional, 72 % da largura, sem legenda |

FALTANDO: linha **PMO**; coluna **psi**; legenda da área da placa; placeholder
amarelo quando não há foto nem dados. EXTRA: a placa reconstruída.

### F4 · CATEGORIZAÇÃO DE RISCO — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| texto introdutório | "Classificação do vaso conforme item 13.5.1.2…" | ausente |
| campos | 10 (fluido de trabalho, código de projeto, **PMTA**, volume geométrico, **P.V. kPa**, P.V.>8, **P.V. MPa**, classe, grupo, categoria) | 5 (classe, grupo, volume, categoria, enquadramento) |
| matriz 13.5.1.2 | tabela 6×6 com as 4 classes e os 5 grupos | **ausente** |
| operação do vaso | faixa + "operador treinado (Anexo I-B)?" + nota | **ausente** |
| observações | bloco de texto | **ausente** |

FALTANDO: 5 campos, a matriz inteira, o bloco de operação, a nota do Anexo I-B,
o texto introdutório e as observações. *(P.V. em kPa e MPa hoje só aparecem na
folha 5.)*

### F5 · DADOS TÉCNICOS / PRONTUÁRIO — **COMPLETA**

Referência: 4 faixas, 20 rótulos, 4 tabelas, 1 nota, 1 bloco de observações.
Modelo Novo: 4 faixas, 20 rótulos, 4 tabelas (incl. operacionais em MPa·psi·kgf),
a legenda e o bloco de observações. FALTANDO: —.

### F6 · RESUMO DE CÁLCULOS — **INCOMPLETA (por 2 parágrafos)**

| | referência | Modelo Novo |
|---|---|---|
| por componente | 3 faixas fixas (casco, tampo superior, tampo inferior), 8 rótulos cada | uma faixa **por componente real**, com fórmulas, legenda de variáveis, resultados e situação (EXTRA) |
| conclusão | **2 parágrafos**: "A espessura mínima requerida limitante do sistema é de X mm, referente ao componente Y" e "A PMTA limitante do sistema é de X MPa, determinada pelo componente Y" | 1 frase genérica ("a PMTA é a MENOR entre as N calculadas") |

FALTANDO: as duas frases com o **componente limitante nomeado** e os valores.
EXTRA: fórmulas algébricas, legenda de variáveis e situação por componente.

### F7 · MEMÓRIA DE CÁLCULO — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| tabela do topo | 1×4: T.A.G. · CÓDIGO DE PROJETO | **ausente** |
| nota | "Fórmulas de referência — ASME VIII Div. 1: casco (UG-27)… tampo torisférico (UG-32)… elipsoidal 2:1… Espessura requerida = t + margem de corrosão." | **ausente** |
| corpo | bloco livre | `linhasMemorial()` ✔ (mais completo) |

### F8 · EXAMES — DADOS GERAIS — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| campos | 6: data de início, data de término, equipamento/T.A.G., nº de série, **nº da A.R.T.**, nº do relatório | 0 (só natureza, data de execução, ensaios e resultado, em 5 linhas) |
| NATUREZA | faixa + 4 marcas (inicial/periódica/extraordinária/ocorrência) | texto simples |
| TIPO DE EXAME | faixa + 6 marcas (externo, interno, TH, ultrassom, LP, PM) | linha única de texto |
| RESULTADO DO EXAME VISUAL | faixa + 2 linhas (visual externo / visual interno) | **ausente** |
| blocos de texto | "RESULTADO DOS ENSAIOS REALIZADOS" e "OBSERVAÇÕES" | **ausentes** |

### F9 · VERIFICAÇÃO DA DOCUMENTAÇÃO — **INCOMPLETA**

Referência: tabela de **15 itens fixos** da NR-13, 3 colunas de marca (Existe ·
Não ident. · Não aplica), coluna de observação por item, 45 marcas.
Modelo Novo: tabela genérica ITEM / VERIFICAÇÃO / RESULTADO, só com o que foi
respondido — no relatório medido saiu "Nenhum item de checklist respondido".
FALTANDO: os 15 itens fixos, as 3 colunas de marca, a observação por item.

### F10 e F11 · CHECKLIST PARTES 1 e 2 — **INCOMPLETAS**

Referência: 7 faixas temáticas (prontuário/registro de segurança, exame
externo, instrumentos e dispositivos de segurança, exame interno, ensaio
hidrostático, considerações finais), 4 tabelas na parte 1 e 3 na parte 2,
39 + 36 marcas, observações por parte.
Modelo Novo: **uma** tabela agrupada, sem as faixas e sem marcas.

### F12 · FOTOS — DOCUMENTAÇÃO — **COMPLETA**
### F14 · FOTOS — EXAME EXTERNO — **COMPLETA**
### F16 · FOTOS — EXAME INTERNO — **COMPLETA**
### F19 · FOTOS — TESTE HIDROSTÁTICO — **COMPLETA**

4 cartões por folha (74 mm + legenda), 4 por página. Divergência declarada: sem
foto, a referência imprime a folha com os slots vazios; o Modelo Novo não emite
a folha (regra da 13D).

### F13 e F15 · EXAME EXTERNO / INTERNO — **INCOMPLETAS**

| | referência | Modelo Novo |
|---|---|---|
| topo | 1×4: T.A.G. / identificação · Nº de série | ausente |
| tabela | 17×6 com cabeçalho de dois níveis: Nº · item · **SIM/NÃO/N.A.** · observação; **15 itens fixos** | n×3: item · verificação · resultado |
| observações / conclusão / resultado | 3 blocos | 3 blocos ✔ |

### F17 · ULTRASSOM — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| faixas | 4 (componente avaliado, ensaio, pontos, instrumento) | 3 |
| componente avaliado | equipamento · nº de série · **área** | **ausente** |
| pontos | **uma** tabela 7×7: REGIÃO/PONTO · 0° · 90° · 180° · 270° · MENOR VALOR · ESP. MÍN. REQUERIDA | uma tabela **por região**, com coluna PONTO |
| instrumento | 1×8 ✔ | ✔ |
| nota INMETRO | presente | **ausente** |
| observações / conclusões | bloco | **ausente** (há só "Resultado do ensaio") |

### F18 · TESTE HIDROSTÁTICO — **INCOMPLETA**

| | referência | Modelo Novo |
|---|---|---|
| DADOS GERAIS | cliente · doc nº · T.A.G. · equipamento · pressão de projeto · **pressão de trabalho** | ausente |
| DADOS DO TESTE | fluido · pressão de teste · **duração** · **temp. do fluido** · **normas** · **validade do laudo** · **procedimento** | fluido · data · pressão de projeto · pressão de teste · resultado |
| gráfico | slot de imagem | gráfico **vetorial** (EXTRA) + tabela de leituras (EXTRA) |
| instrumento + nota INMETRO | 1×8 + nota | **ausentes** |
| parecer técnico do TH | bloco | **ausente** |

### F20 · RECOMENDAÇÕES / PARECER / PRÓXIMA INSPEÇÃO — **INCOMPLETA (por 2 itens)**

| | referência | Modelo Novo |
|---|---|---|
| recomendações | 5×3+cab (ITEM · RECOMENDAÇÃO · PRAZO) | ✔ 4 linhas |
| parecer | PMTA pode ser mantida? · justificativa · apto | ✔ |
| próxima inspeção | 4×3+cab: EXAME · **PRAZO** · DATA LIMITE | 3×2: EXAME · DATA LIMITE |
| assinaturas | 2 slots + CREA + **A.R.T.** + Registro | 2 assinaturas com nome, função e registro |

FALTANDO: coluna **PRAZO**; campo **A.R.T.** na assinatura.

### F21 · REGISTRO DE SEGURANÇA — **EXCLUSÃO INTENCIONAL**

### Cabeçalho e rodapé (todas as folhas)

| elemento | referência | Modelo Novo |
|---|---|---|
| logo 50×14 mm | ✔ (amarela quando vazia) | ✔ (amarela na prévia, clicável em todas as folhas) |
| título + nº do relatório + "Página X de Y" + régua | ✔ | ✔ |
| rodapé: razão social · endereço/CNPJ/CEP · telefone/site/e-mail | ✔ **editável** | ✔ conteúdo, **não editável** (sem `editableId`) |

---

## Números

| | |
|---|---|
| total de seções no escopo | **20** |
| realmente completas | **6** — F1, F5, F12, F14, F16, F19 |
| incompletas | **14** |
| campos/itens faltantes | **58** |
| textos/parágrafos/notas faltantes | **17** |
| tabelas/blocos faltantes | **15** |
| diferenças somente visuais | **7** |
| exclusões intencionais | **5** (folha 21, capa do Livro, termo de abertura, históricos, certificados) |

### Lista literal — o que falta, por seção

**F2:** numeração 1–11 com 7.1–7.5 · coluna de página com página real · 2º
parágrafo do objetivo · ABNT NBR 16035 · linha extra de documento · cabeçalho
da tabela · nota normativa · seção 2.1 (escopo e observações).

**F3:** linha PMO · coluna psi · legenda da área da placa · placeholder amarelo
da placa.

**F4:** texto introdutório · fluido de trabalho · código de projeto · PMTA ·
P.V. (kPa×m³) · P.V. (MPa×m³) · matriz 13.5.1.2 · operação do vaso / operador
treinado · nota do Anexo I-B · observações da categorização.

**F6:** parágrafo da espessura limitante (com componente) · parágrafo da PMTA
limitante (com componente).

**F7:** tabela T.A.G. / código de projeto · nota das fórmulas ASME.

**F8:** data de início · data de término · equipamento/T.A.G. · nº de série ·
nº da A.R.T. · nº do relatório · marcação da natureza (4) · marcação dos
ensaios (6) · resultado do exame visual externo e interno · bloco "resultado
dos ensaios" · bloco "observações".

**F9:** 15 itens fixos da documentação · colunas Existe / Não ident. / Não
aplica · observação por item.

**F10/F11:** 7 faixas temáticas · marcação SIM/NÃO/N.A. · observações por parte.

**F13/F15:** tabela T.A.G. / nº de série · 15 itens fixos · colunas SIM/NÃO/N.A.
· coluna de observação por item.

**F17:** faixa "informações do componente avaliado" com equipamento, nº de série
e área · tabela única REGIÃO/PONTO · nota INMETRO · bloco de observações e
conclusões.

**F18:** cliente · doc nº · T.A.G. · equipamento · pressão de trabalho ·
duração do teste · temperatura do fluido · normas de referência · validade do
laudo · procedimento · instrumento de medição · nota INMETRO · parecer técnico
do TH.

**F20:** coluna PRAZO da próxima inspeção · campo A.R.T. na assinatura.

**Cabeçalho/rodapé:** as três linhas do rodapé sem `editableId`.

### Diferenças somente visuais (7)

Marcação SIM/NÃO/N.A. em vez de texto · uma tabela por região no ultrassom ·
largura da placa reconstruída (72 % × 100 %) · zebra das tabelas · cabeçalho de
dois níveis nas tabelas de checklist · botões "+ item/− última linha" da
referência (são de tela, não do papel) · folha de fotos vazia (a referência
imprime, o Modelo Novo omite — decisão declarada).

### O que o Modelo Novo tem A MAIS que a referência

Placa reconstruída a partir da ficha · fórmulas algébricas e legenda de
variáveis por componente · situação por componente · gráfico do TH em vetor ·
tabela de leituras do TH · memória de cálculo completa do motor ·
`linhasMemorial` · 154 campos editáveis com override e rastreabilidade.

---

## Resposta

> **“O Modelo Novo contém hoje TODO o conteúdo necessário da referência, exceto
> as exclusões intencionais?”**

# NÃO

Faltam **58 campos**, **17 textos/notas**, **15 tabelas/blocos** e a coluna de
página do sumário, distribuídos em **14 das 20 seções no escopo**. A lista
literal acima é o que precisa ser implementado.
