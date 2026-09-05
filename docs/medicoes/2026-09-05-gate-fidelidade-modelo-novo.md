# Gate de fidelidade · Modelo Novo × relatório-base oficial

**05/09/2026 · AUDITORIA. Nada foi corrigido nesta rodada.**

---

## 0 · Método e evidências

| fonte | o que foi usado |
|---|---|
| referência | `docs/referencias/relatorio-nr13.html` — SHA-256 idêntico ao de `C:\projetos\vender\relatorio-nr13.html` (`52392e60347ca025…`), 101.290 bytes |
| impressos da referência | `C:\projetos\vender\prints\folha-01..21.jpg` (21 folhas, documento preenchido) |
| Modelo Novo | PDFs REAIS emitidos em produção na org de teste (10 páginas, rascunho e finalizado), texto extraído com pdf.js |
| código | `pdfVetorial/{documentoA4,documento,folhas,modelo,composicao}.ts` |

Contagem estrutural da referência (extraída do HTML, não estimada):

| elemento | total |
|---|---|
| folhas (`section.folha`) | 22 — as 21 do documento + 1 modelo de folha de fotos extra |
| campos editáveis de valor (`.campo`) | 130 |
| campos editáveis livres (`.campo livre`) | 178 |
| células de texto editável (`.texto-cel`) | 100 |
| blocos de texto (`.campo bloco`) | 18 |
| marcas de checkbox (`.c marca`) | 224 |
| áreas de imagem (`.slot`) | 27 |

---

## 1 · Matriz — folha a folha

Legenda de severidade: **CRÍTICO** = o documento afirma menos do que a inspeção
provou, ou o conteúdo obrigatório da NR-13 não sai; **ALTO** = seção/bloco
inteiro ausente; **MÉDIO** = campo ausente ou layout claramente divergente;
**BAIXO** = acabamento.

Classificação da ausência: **(A)** dado existe no sistema e não é impresso ·
**(B)** existe com outro nome/fonte · **(C)** não existe no sistema · **(D)**
puramente visual.

### Folha 1 — CAPA

| item da referência | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Logo no cabeçalho (50 × 14 mm) | existe; **sem logo não há placeholder amarelo** | D | MÉDIO |
| `h1` "Relatório de Inspeção de Segurança" 24 pt | igual (editável) | — | — |
| `h2` "Vaso de Pressão — NR-13" 14 pt | "Vaso de Pressão · NR-13" — **não editável** (sem id) | D | BAIXO |
| `p` "(Portaria nº 1.082, de 18 de dezembro de 2018)" 12 pt itálico | **ausente**; no lugar sai o tipo de inspeção | C (texto fixo) | MÉDIO |
| Tabela superior 4 colunas: EQUIPAMENTO · T.A.G. / CLASSE DO FLUIDO · GRUPO / CATEGORIA DO VASO · VALIDADE | **ausente** — a capa traz outra tabela | A (todos os 6 valores existem: `nr13_info_`, `nr13_cat_`) | ALTO |
| Foto do equipamento, `height: 92mm` e **`flex:1 1 auto`** (estica até o rodapé) | existe com 92 mm FIXOS e **depois** da tabela; sem foto, **nada** é desenhado | D | **CRÍTICO** (é a causa do vazio da capa) |
| Tabela inferior: Nº DO RELATÓRIO · Nº DA A.R.T. (CREA) · DATA DA INSPEÇÃO · SOLICITANTE/CONTRATANTE · ENDEREÇO · RESPONSÁVEL TÉCNICO + CREA | parcial: Nº DO RELATÓRIO, DATA DE EMISSÃO, CONTRATANTE, ENDEREÇO. **Faltam** A.R.T., DATA DA INSPEÇÃO (temos execução), RESPONSÁVEL TÉCNICO e CREA | A (execução, engenheiro e CREA existem) · C (A.R.T.) | ALTO |
| Ordem vertical: título → tabela → FOTO → tabela de dados | Modelo Novo: título → tabela única → foto no fim | D | ALTO |

### Folha 2 — SUMÁRIO / OBJETIVO / DOCUMENTOS DE REFERÊNCIA / ESCOPO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Sumário com **17 linhas numeradas** (1, 2, 3, 4, 5, 6, 7, 7.1–7.5, 8, 9, 10, 11, 12) e **coluna de PÁGINA** | 8 linhas genéricas, **sem numeração de seção e sem página** | D + A | ALTO |
| Objetivo — texto longo citando a Portaria 1.082, os exames e a PMTA | texto curto de 3 linhas (editável) | D | MÉDIO |
| Documentos de referência: 4 linhas (NR-13, ASME VIII, **ABNT NBR 16035**, ASME V) + nota | 3 linhas, **sem NBR 16035** e sem a nota | D | MÉDIO |
| **2.1 ESCOPO E OBSERVAÇÕES DA INSPEÇÃO** (bloco de texto livre) | **ausente** | C | ALTO |

### Folha 3 — IDENTIFICAÇÃO / PLACA

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| 12 campos de identificação | **todos presentes e editáveis** | — | — |
| PRESSÕES: **PMO**, PMTA, PTH | só PMTA e PTH — **PMO não é impresso** | A (`info.pmoAdotadaMpa`) | ALTO |
| DATAS: execução + validade | presentes | — | — |
| Área da placa: `.foto-larga` 62 mm, largura TOTAL (180 mm), legenda "Registro fotográfico da placa" | placa reconstruída com **72 % da largura** (129,6 mm) e 62 mm de altura; sem legenda | D | MÉDIO |
| Placa vazia = amarelo | placa reconstruída sempre desenhada; **sem estado amarelo** | D | MÉDIO |

### Folha 4 — CATEGORIZAÇÃO DE RISCO

| item da referência | no Modelo Novo | classe | severidade |
|---|---|---|---|
| FLUIDO DE TRABALHO | ausente | A (`cat.fluidoInput`) | MÉDIO |
| CÓDIGO DE PROJETO | ausente | A (`info.codigoProjeto`) | MÉDIO |
| PRESSÃO MÁX. ADMISSÍVEL (PMTA) | ausente nesta folha | A | MÉDIO |
| VOLUME GEOMÉTRICO | presente | — | — |
| **PRODUTO P.V. (kPa × m³)** | ausente | A (`cat.PV_enq`) | ALTO |
| **P.V. > 8 — APLICA-SE A NR-13?** | presente como "ENQUADRAMENTO" | B | BAIXO |
| **PRODUTO P.V. PARA RISCO (MPa × m³)** | ausente | A (`cat.PV_cat`) | ALTO |
| CLASSE DO FLUIDO · GRUPO · CATEGORIA | presentes | — | — |
| **MATRIZ DE CATEGORIZAÇÃO (13.5.1.2)** — tabela inteira | **ausente** | D (derivável de `calc/categoria.ts`) | ALTO |
| **OPERAÇÃO DO VASO** — "é obrigatório operador treinado (Anexo I-B)?" | **ausente** | D (derivável da categoria) | MÉDIO |
| Observações sobre a categorização (texto livre) | **ausente** | C | MÉDIO |

### Folha 5 — DADOS TÉCNICOS / PRONTUÁRIO

A maior divergência do documento. A referência tem 4 faixas e 20 rótulos; o
Modelo Novo tem **1 faixa e uma tabela de componentes**, e no relatório medido
imprimiu uma única frase ("Memorial sem componentes calculados") numa folha
inteira.

| faixa / campo | no Modelo Novo | classe | severidade |
|---|---|---|---|
| DADOS GERAIS: CONTRATANTE, ENDEREÇO | ausentes | A (`nr13_emp_`) | ALTO |
| ASPECTOS CONSTRUTIVOS: MATERIAL DO CORPO | ausente | A (`nr13_vaso_`) | ALTO |
| TIPO DE CONSTRUÇÃO | ausente | A (`info.tipoConstrucao`) | ALTO |
| MATERIAL DO TAMPO 1 / TAMPO 2 | ausentes | A (`nr13_vaso_`) | ALTO |
| VOLUME (m³) | ausente nesta folha | A | MÉDIO |
| PRESSÃO DE PROJETO | ausente | A (`nr13_vaso_`) | ALTO |
| MARGEM DE CORROSÃO (mm) | ausente | A (`nr13_vaso_.ca`) | ALTO |
| TEMPERATURA DE PROJETO (°C) | ausente | A (`nr13_vaso_`) | ALTO |
| DESCRIÇÃO RESUMIDA | ausente | A (`info.descricaoResumida`) | ALTO |
| ASPECTOS OPERACIONAIS: PMO / PMTA / PTH em **MPa · psi · kgf/cm²** | Modelo Novo usa **MPa · kgf/cm² · bar** e não traz PMO | A + B | ALTO |
| CATEGORIZAÇÃO: P(kPa)×V, resultado, P(MPa)×V, resultado, classe, grupo/categoria | ausente | A | ALTO |
| Legenda PMO/PMTA/PTH | ausente | D | BAIXO |
| OBSERVAÇÕES E PENDÊNCIAS DO PRONTUÁRIO (texto livre) | ausente | C | ALTO |

### Folha 6 — RESUMO DE CÁLCULOS DA PMTA

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Uma faixa **por componente** (CASCO, TAMPO SUPERIOR, TAMPO INFERIOR) com 8 parâmetros cada: t calculada, PMTA, E, t medida, margem de corrosão, raio, material, tensão admissível S | tabela única de 5 colunas (componente, PMTA, esp. req., esp. nom., material) | A — `nr13_calc_.componentes[]` guarda `E`, `S`, `D`, `raio`, `ca`, `tReqMm`, `tNom`, fórmulas | ALTO |
| Texto "espessura mínima requerida limitante… PMTA limitante…" | frase genérica | A | MÉDIO |

### Folha 7 — MEMÓRIA DE CÁLCULO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Tabela T.A.G. / CÓDIGO DE PROJETO no topo | ausente | A | BAIXO |
| Memória em linhas | presente (`linhasMemorial`) | — | — |
| **Nota com as fórmulas ASME (UG-27 / UG-32)** | ausente | D | MÉDIO |

### Folha 8 — EXAMES REALIZADOS: DADOS GERAIS

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| DATA DE INÍCIO / DATA DE TÉRMINO | uma só "DATA DE EXECUÇÃO" | B/C | MÉDIO |
| EQUIPAMENTO / T.A.G., Nº DE SÉRIE, Nº DA A.R.T., Nº DO RELATÓRIO | ausentes nesta folha | A (menos A.R.T. = C) | MÉDIO |
| NATUREZA: INICIAL · PERIÓDICA · EXTRAORDINÁRIA · OCORRÊNCIA **com marcação** | texto simples | D | MÉDIO |
| TIPO DE EXAME/ENSAIOS: 6 itens marcáveis (externo, interno, TH, ultrassom, LP, PM) | linha única de texto | D | MÉDIO |
| RESULTADO DO EXAME VISUAL: visual externo / interno | ausente | A | MÉDIO |
| RESULTADO DOS ENSAIOS + OBSERVAÇÕES (texto livre) | ausente | C | MÉDIO |

### Folha 9 — VERIFICAÇÃO DA DOCUMENTAÇÃO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Tabela de 15 itens com 3 colunas de marca (SIM/NÃO/N.A.) | o checklist é emitido como **uma** tabela genérica; no relatório medido saiu "Nenhum item de checklist respondido" | A (`nr13_inspecao_atual`) | ALTO |
| Comentários sobre a documentação | existe no modelo (`comentariosDocumentacao`) — **impresso?** sim, quando há checklist | — | — |

### Folhas 10 e 11 — CHECKLIST NR-13 partes 1 e 2

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| 7 faixas temáticas (prontuário/registro, exame externo, instrumentos, exame interno, ensaio hidrostático, considerações finais) | agrupamento por seção do container, sem os títulos da referência | B | MÉDIO |
| 224 marcas SIM/NÃO/N.A. em toda a referência | resposta em texto | D | MÉDIO |
| Observações por parte | uma só | B | BAIXO |

### Folha 12 — REGISTRO FOTOGRÁFICO: DOCUMENTAÇÃO

4 cartões (foto 74 mm + legenda). **Equivalente no Modelo Novo: existe** e
respeita 4 por folha. Sem foto, a referência mostra o slot amarelo; o Modelo
Novo **não emite a folha** (regra da 13D, deliberada). Severidade: BAIXO
(divergência declarada).

### Folhas 13 e 15 — EXAME EXTERNO / INTERNO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| Tabela T.A.G. / Nº DE SÉRIE no topo | ausente | A | BAIXO |
| Itens verificados com marcas | tabela ITEM/VERIFICAÇÃO/RESULTADO | B | BAIXO |
| Observações gerais + Conclusão técnica + "Resultado: APROVADO" | presentes e **editáveis** | — | — |

### Folhas 14, 16, 19 — REGISTROS FOTOGRÁFICOS

Iguais em estrutura (4 fotos/folha, legenda). Diferença: a referência desenha o
**quadro do slot** mesmo vazio; o Modelo Novo omite a folha. BAIXO.

### Folha 17 — ULTRASSOM

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| INFORMAÇÕES DO COMPONENTE AVALIADO: EQUIPAMENTO, Nº DE SÉRIE, **ÁREA** | ausente | A (o formulário de campo tem `area`, `equipamento`, série) | MÉDIO |
| INFORMAÇÕES PARA O ENSAIO (6 campos) | presentes e editáveis | — | — |
| Tabela: **uma só**, com coluna REGIÃO / PONTO, ângulos, MENOR VALOR, ESP. MÍN. REQUERIDA | Modelo Novo: **uma tabela por região**, coluna PONTO | D | MÉDIO |
| INSTRUMENTO DE MEDIÇÃO (padrão, série, certificado, validade) | presente | — | — |
| Nota INMETRO | ausente | D | BAIXO |
| Observações / conclusões do ensaio | ausente | C | MÉDIO |

### Folha 18 — TESTE HIDROSTÁTICO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| DADOS GERAIS: CLIENTE, DOC Nº, T.A.G., EQUIPAMENTO | ausentes | A (o formulário TH grava `cliente`, `docNum`, `equipamento`) | MÉDIO |
| DADOS DO TESTE: pressão de projeto, pressão de trabalho, fluido, pressão de teste, **duração**, **temp. do fluido**, **normas**, **validade do laudo**, **procedimento** | 4 dos 9 | A (4) · C (5) | MÉDIO |
| Gráfico de pressurização | presente (vetorial) | — | — |
| INSTRUMENTO DE MEDIÇÃO + nota INMETRO | ausente | A (rastreabilidade existe) | MÉDIO |
| Parecer técnico do TH | ausente | C | MÉDIO |

### Folha 20 — RECOMENDAÇÕES / PARECER / PRÓXIMA INSPEÇÃO

| item | no Modelo Novo | classe | severidade |
|---|---|---|---|
| **9. RECOMENDAÇÕES DE SEGURANÇA** — tabela ITEM/RECOMENDAÇÃO/PRAZO | **seção inteira ausente** | C | **CRÍTICO** |
| "A PMTA pode ser mantida?" + justificativa | ausente | C | ALTO |
| "Equipamento apto?" | presente | — | — |
| Próxima inspeção: EXAME / **PRAZO** / DATA LIMITE | sem a coluna PRAZO | A (regra de vencimento existe) | MÉDIO |
| Duas assinaturas com CREA e **A.R.T.** | duas assinaturas com registro; sem A.R.T. | A/C | MÉDIO |

### Folha 21 — REGISTRO DE SEGURANÇA (Livro NR-13)

**Folha inteira ausente do Modelo Novo** — o Livro sai por outro caminho
(`LIVRO-REGISTRO.html`), que a composição vetorial não emite. Classe A (as
entradas existem em `nr13_livro_`). Severidade: **CRÍTICO** para quem seleciona
a folha do Livro no relatório, porque a seção simplesmente não aparece no PDF.

---

## 2 · Consolidado

### B) Seções da referência ausentes no Modelo Novo

1. Escopo e observações da inspeção (2.1) — **ALTO**
2. Matriz de categorização 13.5.1.2 — **ALTO**
3. Operação do vaso / operador treinado — MÉDIO
4. Dados gerais + aspectos construtivos + aspectos operacionais + categorização do prontuário (folha 5 quase inteira) — **ALTO**
5. Parâmetros por componente na folha 6 — **ALTO**
6. Nota de fórmulas ASME (folha 7) — MÉDIO
7. Resultado dos ensaios / observações (folha 8) — MÉDIO
8. Informações do componente avaliado (folha 17) — MÉDIO
9. Observações/conclusões do ultrassom — MÉDIO
10. Dados gerais e instrumento do TH; parecer do TH — MÉDIO
11. **Recomendações de segurança (9)** — **CRÍTICO**
12. PMTA pode ser mantida? + justificativa — ALTO
13. **Registro de Segurança (folha 21)** — **CRÍTICO**

### C) Campos ausentes, por classe

**(A) Existem no sistema e NÃO são impressos** — 31 campos:
PMO; classe/grupo/categoria/validade na capa; responsável técnico + CREA na
capa; data da inspeção na capa; contratante e endereço no prontuário; material
do corpo; material dos tampos 1 e 2; tipo de construção; pressão de projeto;
margem de corrosão; temperatura de projeto; descrição resumida; P.V. (kPa×m³);
P.V. (MPa×m³); fluido de trabalho e código de projeto na categorização;
E, S, raio e espessura medida por componente; T.A.G./código de projeto na
memória; Nº de série e resultado dos exames na folha 8; área/equipamento/série
do ultrassom; cliente, doc nº e equipamento do TH; instrumento do TH; prazo da
próxima inspeção; entradas do Livro.

**(B) Existem com outro nome/fonte** — 5: "P.V. > 8" ↔ `enquadramento`;
psi ↔ bar na tabela de pressões; data de execução ↔ início/término; faixas do
checklist ↔ seções do container; marcas SIM/NÃO ↔ texto de resposta.

**(C) Não existem no sistema** — 9: Nº da A.R.T.; escopo/observações da
inspeção; observações da categorização; observações e pendências do prontuário;
observações do ultrassom; parecer do TH; duração/temperatura/normas/validade do
laudo/procedimento do TH; recomendações de segurança; justificativa da PMTA.
Todos são **texto documental** — nascem como campo com default vazio e override
manual (13D-bis), sem inventar dado.

**(D) Puramente visuais** — 12: sigla da Portaria; ordem/altura elástica da foto
de capa; placeholder amarelo de logo/foto/placa; largura da placa; matriz de
categorização; nota de fórmulas; nota INMETRO; zebra das tabelas; marcação
SIM/NÃO/N.A.; coluna REGIÃO/PONTO única no ultrassom; numeração e páginas do
sumário; legendas dos slots.

### E–H) Diferenças visuais, de geometria, espaçamento e tipografia

A geometria de PÁGINA está fiel (medida no gate 12B e confirmada aqui):
210 × 297 mm, margens 9/15/7/15 mm, cabeçalho 14 mm de logo + régua a 16 mm,
rodapé de 3 linhas com entrelinha 1,35, fontes 24/14/12/10,5/9/10/8,5/8 pt,
bordas 0,6 pt, cinzas `#d9d9d9`/`#f2f2f2`, valor `#1B3A6B`.

Divergências que sobram:

| # | divergência | severidade |
|---|---|---|
| 1 | **Zebra** (`tr:nth-child(even) td:not(.rotulo) → #fafafa`) existe na referência e a cor está declarada em `COR.fundoZebra`, mas **nenhuma tabela a usa** | MÉDIO |
| 2 | Foto de capa não estica (a referência usa `flex:1 1 auto`, mín. 40 mm, base 92 mm) | CRÍTICO (vazio da capa) |
| 3 | Placa reconstruída com 72 % da largura; referência usa 100 % | MÉDIO |
| 4 | Subtítulo da capa usa `·` no lugar de `—` | BAIXO |
| 5 | Tabelas do Modelo Novo sem `min-width` de coluna de rótulo (38 % na referência) | BAIXO |
| 6 | Sumário sem numeração hierárquica nem coluna de página | ALTO |

### I) Fotos

| área | referência | Modelo Novo |
|---|---|---|
| capa | 92 mm, elástica, quadro visível vazio | 92 mm fixos, **nada** quando não há foto |
| placa | 62 mm × 180 mm | 62 mm × 129,6 mm |
| cartão de foto | slot 74 mm + legenda | 74 mm + legenda ✔ |
| 4 por folha | ✔ | ✔ |
| controle de remover (canto sup. dir.) | `.slot .rm` | inexistente (é requisito da implementação futura) |

### K) Amarelo — onde ele NÃO está

Hoje o amarelo existe **apenas em célula de tabela de valor vazia**
(`corDeFundo`). Faltam, em `preview`:

1. logo ausente no cabeçalho (referência: `.logo-vazio` amarelo);
2. foto de capa ausente (`.slot` amarelo);
3. placa ausente / campos vazios da placa;
4. parágrafos vazios (objetivo, observações, conclusões) — `doc.texto` não pinta fundo;
5. slots de foto das folhas de registro;
6. área de assinatura vazia (`.slot-assin`);
7. blocos de texto livre que ainda não existem (escopo, recomendações…).

No FINAL: zero amarelo — confirmado pelo gate `edicao13d`/`overridesRelatorio` e
pelos PDFs arquivados.

### L) Editabilidade

| | hoje | depois da fidelidade |
|---|---|---|
| campos editáveis por documento de 10 folhas | **52** | — |
| estimativa para as 21 folhas completas | — | **≈ 420 campos de texto** (130 `.campo` + 178 `.campo livre` + 100 `.texto-cel` + 18 blocos), mais **27 áreas de imagem** e **224 marcas SIM/NÃO** |

As marcas e as imagens precisam de tratamento próprio (toggle e slot), não de
`override` de texto — mas a infraestrutura de id/rótulo/caixa da 13D-bis já
serve aos três.

### M) Sumário e paginação

A referência resolve o sumário por JS (`renumerarPaginas`) e traz a coluna de
página. O Modelo Novo lista 8 títulos genéricos, sem número de seção e **sem
página**. Como o documento é dinâmico (fotos, tabelas que quebram, certificados
anexados), o sumário só pode ser preenchido na **segunda passagem** do gerador —
que já existe hoje para o "Página X de Y". É lá que a numeração real deve ser
colhida.

---

## 3 · Plano de correção, na ordem

**Bloco 1 — o que faz o documento parecer vazio (CRÍTICO/ALTO)**
1. Capa: reordenar (título → sigla da Portaria → tabela 4 colunas → foto elástica → tabela de dados), foto que ocupa o espaço restante, campos de A.R.T./data da inspeção/responsável técnico + CREA.
2. Folha 5 (prontuário): as 4 faixas e os 20 campos, todos com fonte já existente.
3. Folha 6: parâmetros por componente (E, S, raio, espessura medida, margem).
4. Recomendações de segurança (seção 9) — tabela editável, campo novo.
5. Folha 21 — Registro de Segurança, alimentada por `nr13_livro_`.

**Bloco 2 — conteúdo faltante de seções existentes (ALTO/MÉDIO)**
6. Categorização: P.V. em kPa e MPa, fluido, código de projeto, matriz 13.5.1.2, operador treinado, observações.
7. Folha 3: PMO na tabela de pressões; placa em largura total com legenda.
8. Folha 8: início/término, série, natureza e ensaios marcáveis, resultados, observações.
9. Folha 17: componente avaliado (área/equipamento/série), tabela única REGIÃO/PONTO, nota INMETRO, observações.
10. Folha 18: dados gerais, instrumento, parecer do TH e os campos que faltam.
11. Folha 2: escopo (2.1), NBR 16035, nota dos documentos, objetivo completo.

**Bloco 3 — sumário e navegação (ALTO)**
12. Sumário numerado (1 … 12, com 7.1–7.5) e **coluna de página preenchida na segunda passagem**.

**Bloco 4 — amarelo e áreas de imagem (MÉDIO)**
13. Placeholder amarelo para logo, foto de capa, placa, slots de foto e assinatura — só em `preview`.
14. Controle de remover a foto no canto do próprio slot; clicar no slot escolhe a imagem; remover volta à reconstrução.

**Bloco 5 — acabamento (BAIXO)**
15. Zebra nas tabelas, larguras de coluna de rótulo, marcas SIM/NÃO/N.A., notas de rodapé de seção, subtítulo com travessão.

Cada campo criado nos blocos acima entra **já com `id` semântico + rótulo +
caixa**, para nascer editável pela 13D-bis — nenhum campo novo pode nascer
travado.

---

## 4 · Resposta ao gate

**O Modelo Novo hoje é um clone visual/profissional da referência: NÃO.**
A moldura (papel, margens, cabeçalho, rodapé, tipografia, cores) é fiel; o
CONTEÚDO é um subconjunto — 13 seções ausentes, 31 campos que existem no sistema
e não são impressos e 2 folhas inteiras que não saem.

| divergências | quantidade |
|---|---|
| críticas | 4 |
| altas | 14 |
| médias | 25 |
| baixas | 11 |

| campos | quantidade |
|---|---|
| existem no sistema e não estão impressos | 31 |
| existem com outra fonte/nome | 5 |
| realmente não existem (texto documental novo) | 9 |
| puramente visuais | 12 |

| editáveis | quantidade |
|---|---|
| hoje | 52 |
| estimados após fidelidade completa | ~420 de texto + 27 imagens + 224 marcas |
