# Plano — ajustes da revisão do engenheiro (Inspeções · Calibrações · TH · Certificados)

> **STATUS (18/09/2026, branch local `revisao-engenheiro-b-c1-a`, sem push/deploy):**
> Etapa B, C.1 e A **implementadas e provadas em E2E local** —
> `docs/medicoes/2026-09-18-revisao-engenheiro-b-c1-a.md`. C.2, C.3 e D pendentes
> (`PENDENCIAS.md` §0-OCTIES).
>
> Decisões aplicadas:
> - **D-2** — registro antigo com respostas e sem `semanticaNc` pede revisão e bloqueia a finalização.
> - **D-7** — fontes confirmadas: PMTA = `pmtaAdotadaMpa ?? calc.pmta`; PRESSÃO DE PROJETO =
>   `pressaoDeProjetoMpa` (`P` do memorial: `nr13_vaso_`, `nr13_vaso_ac_corpo_`, `nr13_vaso_cald_`,
>   `nr13_autoclave_dados_<subtipo>_`.pressao); TRABALHO = `pmoAdotadaMpa`; TESTE = aplicada
>   (sugerida de `pthAdotadaMpa ?? calc.pth`).
> - **D-6** — folha 6 por componente classificada como **A (memória de cálculo)**: variáveis do
>   motor em MPa/mm substituídas nas fórmulas impressas ao lado; legenda já em MPa/mm. Mantém
>   MPa/mm, agora escritos. A tabela do topo da folha é documental e segue o equipamento.
> - **D-3** — linha derivada no PDF, calculada das marcas efetivas (overrides incluídos).

**Data da auditoria:** 18/09/2026 · **Base:** `main` @ `6c4ffe0` (árvore limpa)
**Natureza:** SOMENTE auditoria e plano. Nenhum código, banco, commit, push ou deploy.
**Método:** leitura do código real (formulários de campo → container → modelo vetorial →
folhas → PDF). Onde a conclusão depende de execução em navegador, está marcado
**[a confirmar no E2E]**. A verificação visual em 390 px NÃO foi executada nesta rodada
(ver §12); a análise mobile abaixo é por código/CSS.

---

## 1. RESUMO EXECUTIVO

Oito achados, em ordem de gravidade:

1. **Semântica SIM/NÃO invertida entre campo e documento (Exame Externo e Interno).**
   O PDF imprime os itens sob a faixa *"FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?"*, então
   **SIM = não conformidade encontrada**. O formulário do celular mostra só o item e os
   botões SIM/NÃO/N.A., sem a pergunta — e o visualizador desktop pinta **SIM de verde e
   NÃO de vermelho** (lê SIM como "conforme"). O técnico tende a marcar SIM para "está ok";
   o documento assinado diz que ali foi encontrada não conformidade. Não é só "a pergunta
   não aparece": é risco de laudo afirmar o oposto do que foi inspecionado — **inclusive
   em relatórios já emitidos**, que não serão alterados (§13).
2. **Teste Hidrostático ignora a unidade do equipamento.** Rótulos do formulário fixos em
   kgf/cm², prefill convertido à mão para kgf/cm² (constante duplicada), valores gravados
   como texto sem unidade, PDF imprime os três números **sem unidade**, e o gráfico tem
   `kgf/cm²` escrito no código em três lugares (eixo, etiqueta da PT, rótulo dos pontos).
3. **Logo do Certificado de Calibração some quando o certificado é anexado ao relatório.**
   Causa confirmada no código: `hostCertificado.materializarChaves` copia o snapshot da
   meta (que desde a Fase 7B tem só `logoRef`, sem a dataURL) direto para o
   `localStorage`, **sem passar pela resolução `logoRef → logo` do palco**. O template lê
   `dados.logo`, não acha, e fica com `src="logo.webp"` — arquivo que **não existe** em
   `public/arquivos-inspecao/` (404 → área vazia).
4. **Certificado de Calibração não tem assinatura.** O CSS "ASSINATURAS DUPLAS" existe nos
   dois templates, a marcação HTML não. Pendência antiga já registrada
   (`PENDENCIAS.md §2 — Fase 3, motor de assinatura`).
5. **Certificado não é documento independente/imutável.** Não há artefato (`pdfRef`/SHA):
   ele é re-renderizado dos dados vivos a cada visualização, download, anexo e no Portal.
6. **Quadro "Instrumentos e dispositivos de segurança" não tem fonte para o nº do
   certificado/validade.** O modelo grava `certificado: null` fixo; o formulário só tem
   dois checkboxes por instrumento. O módulo Calibrações já tem nº do certificado,
   validade, fabricante, série — mas **só para manômetro e PSV**, e **não existe registro
   de calibração feita por terceiro** (laboratório externo) em lugar nenhum.
7. **Grandezas sem unidade no documento:** TH (7 campos + tabela + gráfico), ultrassom
   (espessura nominal, velocidade sônica), resumo de cálculos (6 células por componente),
   certificado de PSV (abertura/ajuste/fechamento/incerteza — a unidade é coletada na
   calibração e não impressa), visualizador de calibração (título fixo "(kgf/cm²)").
8. **Dados incoerentes no TH:** "Pressão de Projeto" é pré-preenchida com a **PMTA**, e
   "Fluido utilizado" (fluido de TESTE) é pré-preenchido com a **classe do fluido de
   operação** (`nr13_cat_.fluidoInput`, ex.: "A - Hidrogênio"), sobrescrevendo o padrão
   "Água Potável".

**Categoria NR-13 não precisa de alteração nenhuma** e o plano não toca em
`calc/categoria.ts`, `folhaCategorizacao`, `matrizCategorizacao` nem no bloco
"CATEGORIZAÇÃO DO EQUIPAMENTO" da folha 5 (§8).

**Banco:** nenhuma migration SQL, nenhuma tabela nova, nenhum impacto em RLS. Todas as
alterações propostas cabem em chaves `app_storage` que já existem (container
`nr13_docs_<TAG>`, `nr13_componentes_cal_<TAG>`, `nr13_calibracoes_<TAG>`,
`nr13_calibracao_item_<id>`) e no bucket `inspecao` já usado pelos PDFs de padrão.

---

## 2. INSPEÇÃO EXTERNA (7.2)

### Estado atual (cadeia completa)

| camada | arquivo | o que faz |
|---|---|---|
| UI mobile/desktop | `src/features/inspecoes/formularios/FormularioVisualExterno.tsx:156-189` | título "Itens de Verificação — Inspeção Visual Externa"; por item: número, texto, `RespostaSegmentada` SIM/NÃO/N.A., input "Observação (opcional)". **Nenhuma pergunta de contexto.** Mesmo componente no celular e no desktop (não há versão desktop separada). |
| dado | container `nr13_docs_<TAG>` → `dados.visual_externo` | `itens: { "1": "sim" \| "nao" \| "na" \| "" }`, `itemObs`, `observacoes`, `conclusao`, `resultado`, `fotos`, `serie`, `contratante`, `endereco`, `rastreabilidade`, `dataInspecao` |
| visualizador desktop ("ver preenchido") | `VisualizadorFormulario.tsx:98-111` | `BadgeResposta`: **SIM = verde, NÃO = vermelho**. E tem uma **cópia própria** dos 15 itens (`ITENS_VE`, l. 231) em vez de importar `ITENS_VISUAL_EXTERNO`. |
| modelo | `pdfVetorial/modelo.ts:669-696` (`exameVisual`) | lê `itens[n]` pela posição no catálogo; `opcoes: ['sim','nao','na']` |
| folha | `pdfVetorial/folhas.ts:143-222` (`blocoExame`) | faixa `FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?` + tabela Nº / ITEM / SIM / NÃO / N.A. / OBSERVAÇÃO; conclusão; resultado; observações gerais |
| referência do dono | `docs/referencias/relatorio-nr13.html:817` | `<th colspan="3">Foi encontrada alguma não conformidade?</th>` sobre SIM/NÃO/N.A. |
| template legado (rollback raster) | `public/arquivos-inspecao/VISUAL-EXTERNO.html:232,301-303` | mesma pergunta no cabeçalho, mas checkbox SIM azul e NÃO/N.A. **vermelhos** (classe `chk-neg`) |

### Pergunta de não conformidade — respostas às 5 questões

1. **Existe como dado real e só não é renderizada?** NÃO. Não há campo no blob.
2. **É apenas texto estático do PDF?** SIM. É o cabeçalho de grupo das três colunas
   marcáveis — idêntico ao da referência. Ela **dá significado** às marcas de cada item.
3. **Existe lógica que deriva a resposta?** NÃO. Nenhum código deriva "houve NC" dos itens.
   O `resultado` (APROVADO/REPROVADO) é escolha manual; `temExameExterno` só conta se há
   alguma resposta, para marcar o ensaio como realizado na folha 7.
4. **O técnico marca item a item sem resposta geral?** SIM.
5. **Deveria ter valor SIM/NÃO próprio?** Pela referência, **não**: ela é pergunta feita
   **a cada item**, não uma resposta geral. A resposta geral "houve alguma NC?" é
   **derivável** dos itens (algum item = SIM). Persistir uma resposta própria criaria uma
   segunda verdade que pode contradizer os itens (geral "NÃO" com item 3 "SIM") num
   documento assinado.

### Conflito semântico (achado crítico)

As três camadas discordam sobre o que SIM significa:

| camada | SIM significa |
|---|---|
| PDF (vetorial e raster) e referência | não conformidade **encontrada** (ruim) |
| visualizador desktop | ok (verde) |
| template legado | ok (azul; NÃO em vermelho) |
| formulário de campo | nada — o técnico escolhe o sentido |

Alguns itens do interno são redigidos como defeito ("Presença de trincas ou fissuras",
"Pontos de corrosão localizada (pite)") e só fazem sentido com SIM = achado; outros são
neutros ("Iluminação", "Limpeza interna") e convidam SIM = ok.

### Proposta

**P-VE-1 · A pergunta aparece no formulário, como cabeçalho do grupo — não como resposta.**
- Logo abaixo do título da seção, uma faixa fixa (sticky ao rolar a lista, ~32 px):
  **"Foi encontrada alguma não conformidade?"** + legenda de uma linha:
  *SIM = não conformidade encontrada · NÃO = conforme · N.A. = não se aplica*.
- Mantém um único formulário e a densidade atual (não vira card por item).
- Os valores gravados continuam `sim`/`nao`/`na` → **zero migração**, PDF inalterado.

**P-VE-2 · Coerência visual.** No formulário e no visualizador desktop, para os exames
visuais, **SIM (NC) em vermelho/âmbar, NÃO (conforme) em verde, N.A. neutro**.
`BadgeResposta` passa a receber a polaridade da pergunta (o checklist continua como está:
lá as perguntas são positivas, "Possui placa?"). Remover a cópia `ITENS_VE`/`ITENS_VI` do
visualizador e importar do formulário (mesma regra "a ordem é o identificador").

**P-VE-3 · Resumo DERIVADO, não persistido.** No rodapé da lista: "2 não conformidades
marcadas · 13 conformes · 0 N.A. · 0 sem resposta". Opcional no PDF: uma linha derivada
abaixo da tabela ("Não conformidades encontradas: 2 — itens 3 e 11") — **decisão D-3**.

**P-VE-4 · Item marcado SIM pede observação.** A observação do exame já é campo NÃO
opcional no documento (decisão do dono, `folhas.ts:182-189`). No campo, item SIM sem
observação ganha um aviso inline ("Descreva a não conformidade"), sem bloquear o salvar
(offline não pode travar).

**P-VE-5 · Marca de versão semântica no blob.** Ao salvar pelo formulário novo, gravar
`semanticaNc: 1` dentro de `dados.visual_externo`. No gerador, container **sem** a marca
e com alguma resposta `sim` gera pendência em "O que falta": *"Confirme as respostas SIM
do exame externo: no documento, SIM significa não conformidade encontrada."* Protege os
rascunhos em aberto preenchidos com a tela antiga. **Decisão D-2.**

**Onde armazenar:** nada novo além de `semanticaNc` (campo dentro do blob que já existe).

---

## 3. INSPEÇÃO INTERNA (7.3)

Estado idêntico ao externo (`FormularioVisualInterno.tsx` é cópia do externo com outros
15 itens; `diff` confirmou só lista, textos e chave `visual_interno`). Mesmas respostas às
5 questões, mesmo conflito semântico, mesmas propostas **P-VE-1 a P-VE-5** aplicadas ao
interno.

Particularidade: 4 dos 15 itens do interno já estão redigidos como defeito (itens 2, 8,
11, 12) e ficam **coerentes** com a pergunta; os outros 11 são neutros. **Não** se propõe
reescrever itens: a ordem é o identificador (`FormularioVisualInterno.tsx:32-41`) e mudar
texto muda o que documentos futuros dizem sobre dados já coletados.

**Oportunidade de refatoração (baixo risco, dentro da Etapa A):** extrair um
`FormularioVisual` único parametrizado (`chave`, `itens`, `titulo`, `pastaFoto`) — as
correções P-VE-1..5 passam a ser feitas uma vez só.

---

## 4. INSTRUMENTOS / DISPOSITIVOS / CALIBRAÇÕES

### O que existe hoje

| peça | chave / arquivo | campos |
|---|---|---|
| Quadro no checklist de campo | `FormularioChecklist.tsx:122-132, 322-365` → `dados.checklist.instrumentos` | por instrumento: `inst-man` (possui) e `inst-man-cal` (calibrado) — **booleanos**; mais `inst-nenhum` ("não possui nenhum"), que o documento **não imprime** |
| Instrumentos listados | idem | Manômetro, Termômetro, Vacuômetro, Pressostato, Transmissor de pressão, Válvula de segurança (PSV) |
| Modelo | `modelo.ts:992-997` | `possui`, `calibrado` e **`certificado: null` fixo** |
| Folha 7.1.1 | `folhas.ts:1573-1589` | INSTRUMENTO / POSSUI / CALIBRADO / Nº DO CERTIFICADO / VALIDADE (esta última célula só via override manual no documento) |
| Componentes de calibração | `nr13_componentes_cal_<TAG>` (`componentesService.ts:12-54`) | `id`, **`tipo: 'manometro' \| 'psv'`**, nome, fabricante, modelo, série, referência (faixa), unidade, pontos, pressão de ajuste, foto |
| Lotes | `nr13_lotes_cal_<TAG>` | data de execução, itens, vínculo com relatório |
| Calibração (certificado emitido pela org) | `nr13_calibracoes_<TAG>` + `nr13_calibracao_item_<id>` (`calibracoes/tipos.ts`) | nº certificado, data emissão, **empresa/endereço = CLIENTE solicitante**, instrumento, fabricante, modelo, série, referência, data calibração, **data próxima calibração**, condições ambientais, padrão (inst/série/cert/validade), resultados, status, motivo, unidade, `componenteId`, `loteId` |
| Certificados de PADRÃO (instrumentos da org) | `nr13_rastreab_<id>` (`rastreabilidadeService.ts:24-65`) | nome, nº certificado, validade, aparelho, fabricante, série, tipo, **PDF anexado** (`pdfRef` no bucket), soft-replace |
| Vencimentos | `services/vencimentos.ts` | acessório usa a ÚLTIMA calibração (`dataProxCalibracao`) |
| Formulários de campo `manometro`/`psv` | `FormularioManometro.tsx`, `FormularioPSV.tsx` | **legado inalcançável**: não estão em `ENSAIOS_DISPONIVEIS`; leem `nr13_rastreabilidade`, chave morta. Não reaproveitar. |

### Campos necessários — onde existem, fonte da verdade, destino

| CAMPO NECESSÁRIO | JÁ EXISTE ONDE? | PRECISA SER CRIADO? | FONTE DA VERDADE (proposta) | DESTINO NO RELATÓRIO |
|---|---|---|---|---|
| Possui | `checklist.instrumentos[id]` | não | container | 7.1.1 POSSUI |
| Calibrado | `checklist.instrumentos[calId]` (manual) | não | container; **sugerido** a partir da validade quando houver referência (o técnico confirma) | 7.1.1 CALIBRADO |
| Nº do certificado | `nr13_calibracao_item_.numeroCertificado` (manômetro/PSV) | sim para terceiro e para os outros 4 tipos | registro de calibração (próprio ou de terceiro) | 7.1.1 Nº CERTIFICADO |
| Validade | `…item_.dataProxCalibracao` | idem | idem | 7.1.1 VALIDADE |
| Quem calibrou (laboratório/empresa) | **não existe**. Hoje é implícito: a própria org (`nr13_minha_empresa`) | **sim**: `origem: 'propria' \| 'terceiro'` + `laboratorio` | registro de calibração | 7.1.1 (nova informação na célula ou coluna — decisão D-5) |
| Dados do instrumento (fabricante, modelo, série, faixa, TAG) | `ComponenteCal` (só manômetro/PSV) | ampliar `tipo` para os 6 instrumentos do quadro | componente | 7.1.1 (opcional) |
| Referência ao certificado cadastrado | parcial: lote vinculado ao relatório (`vincularProximoRelatorio`) injeta folhas; o quadro 7.1.1 não é ligado a nada | **sim**: `checklist.instrumentosRef[instId] = { componenteId }` | container guarda SÓ o id; relatório congela os valores na meta (como `meta.certCalibracoes`) | 7.1.1 |
| Anexo PDF do certificado de terceiro | padrão existe para `nr13_rastreab_` (`pdfRef`, `certificadoUpload.ts`) | **sim** para calibração de terceiro | bucket `inspecao`, `<org>/certificados/<uuid>.pdf` | anexado ao fim do relatório por pdf-lib (bytes originais), como os padrões |
| Responsável (quem executou) | não existe | sim (§9) | `nr13_lista_phs` (id + snapshot) | certificado próprio |

### Terceiros — proposta

**P-INS-1 · Calibração de terceiro é um REGISTRO de calibração, não texto no checklist.**
`DadosCalibracao` ganha a variante `tipo: 'externa'` (ou `origem: 'terceiro'` nas duas
existentes — **decisão D-4**) com: `laboratorio`, `numeroCertificado`, `dataCalibracao`,
`dataProxCalibracao`, `componenteId`, `pdfRef?`, `observacao?`. Mora nas MESMAS chaves
(`nr13_calibracoes_<TAG>` + `nr13_calibracao_item_<id>`), então vencimentos, lista,
lote, Portal e sync já a enxergam. Não gera folha HTML (não fomos nós que emitimos): o
PDF do laboratório entra por pdf-lib com os bytes originais — exatamente o caminho
`anexarRastreabilidades`.

**P-INS-2 · `ComponenteCal.tipo` cobre os 6 instrumentos do quadro.** Termômetro,
vacuômetro, pressostato e transmissor só aceitam calibração `externa` (não há template
nosso para eles); manômetro e PSV aceitam as duas.

**P-INS-3 · O checklist REFERENCIA, não redigita.** Com "Possui" marcado, a linha do
instrumento mostra um seletor compacto "Componente" (lista de `nr13_componentes_cal_<TAG>`
do tipo). Escolhido, a linha exibe em uma linha: *Cert. 123 · val. 10/2027 · Lab. X* e
**sugere** "Calibrado" (validade ≥ data da inspeção). Sem componente cadastrado: link
"cadastrar em Calibrações". Offline: o seletor lê do cache; se o componente não estiver no
aparelho, o técnico marca só Possui/Calibrado como hoje (degradação segura).

**P-INS-4 · O relatório congela.** Na geração, os dados da calibração referenciada são
copiados para `meta.instrumentos[instId]` (mesmo padrão de `meta.certCalibracoes`,
§7-bis). Editar a calibração depois não altera relatório salvo. Não duplicamos: o
container só guarda o id; a meta guarda a cópia congelada (que é o que a imutabilidade
exige).

**Duplicações encontradas hoje (§10):** nº do certificado do padrão é redigitado a cada
calibração (`padraoInst/Serie/Cert/Val` em cada `DadosCalibracao`, em vez de referenciar
`nr13_rastreab_<id>`); a lista de itens do exame visual existe em 3 lugares (2 formulários
+ `VisualizadorFormulario`); a constante MPa→kgf existe em 4 lugares.

---

## 5. OBSERVAÇÕES DO CHECKLIST

| pergunta | resposta |
|---|---|
| De onde vem "Observações — checklist (parte 1)" e "(parte 2)"? | `folhas.ts:1591` e `:1600` — `doc.blocoAteOFim(id, …)` **sem o argumento `auto`**: nasce vazio. |
| Onde o técnico preenche? | **Em lugar nenhum do formulário de campo.** Só é possível escrever DENTRO do documento (override `nr13_ovr_checklist1.observacoes_<TAG>`). |
| Aparece no mobile? | Não existe no mobile. O que existe no mobile é observação POR PERGUNTA (vai para a coluna OBSERVAÇÃO de cada linha) e "Comentários sobre a documentação" (vai para 7.1). |
| Persiste? | O override persiste por relatório (não volta à inspeção). |
| Chega ao relatório? | Só o que foi digitado no documento. |
| Títulos | Inconsistentes: "Observações — checklist (parte 1)" × "Observações do checklist" (parte 2). |
| Pode receber observações de calibração? | Pode receber texto livre complementar, **não** nº de certificado/validade — esses têm estrutura (§4). |

**Proposta P-OBS-1:** dois campos livres no `FormularioChecklist` — "Observações —
checklist (parte 1)" no fim do bloco "Instrumentos de Controle Instalados" e "Observações
— checklist (parte 2)" no fim de "Ensaio Hidrostático" — gravados em
`dados.checklist.observacoesParte1` / `observacoesParte2` e passados como `auto` ao
`blocoAteOFim`. O override do documento continua vencendo (regra 13D-bis). Unificar os
títulos. Nenhuma chave nova.

---

## 6. TESTE HIDROSTÁTICO (7.5)

### Dados — cadeia UI → persistência → relatório → PDF

Persistência de todos: container `nr13_docs_<TAG>` → `dados.th` (texto livre, exceto datas
ISO e `curva[]`). Relatório: `modelo.ts:1042-1075`. PDF: `folhas.ts:1874-1993`.

| campo | UI de origem | prefill | PDF | problema |
|---|---|---|---|---|
| Cliente | "Cliente / Empresa" | `nr13_emp_` | DADOS GERAIS | — |
| Doc Nº | "Doc Nº" | — | DOC Nº | — |
| T.A.G. | rota | — | T.A.G. | — |
| Equipamento | "Equipamento" | descrição da ficha | EQUIPAMENTO | — |
| **Pressão de projeto** | "Pressão de Projeto (kgf/cm²)" fixo | **PMTA** adotada/calculada ×10,19716 | sem unidade | rótulo de unidade fixo; **semântica: PMTA ≠ pressão de projeto** (a de projeto é `nr13_vaso_.P`) — D-7 |
| **Pressão de trabalho** | "(kgf/cm²)" fixo | PMO adotada ×10,19716 | sem unidade | unidade |
| **Pressão de teste** | "(kgf/cm²)" fixo | PTH adotada/calculada ×10,19716 | sem unidade | unidade |
| **Fluido de teste** | "Fluido Utilizado" (padrão "Água Potável") | **`nr13_cat_.fluidoInput`** — o fluido de OPERAÇÃO com a classe ("A - Hidrogênio") | FLUIDO DE TESTE | **prefill errado** sobrescreve a água |
| Duração | texto livre ("Ex.: 30 min") | — | DURAÇÃO DO TESTE | unidade depende do que foi digitado |
| Temp. do fluido | texto livre ("Ex.: 22 °C") | — | TEMP. DO FLUIDO | idem |
| Normas | texto (padrão ASME VIII/NR-13) | — | NORMAS | — |
| Procedimento | textarea | — | PROCEDIMENTO | — |
| Validade do laudo | date | — | VALIDADE DO LAUDO (`dataBr`) | — |
| Data do teste | date | — | DATA DO TESTE | — |
| Resultado | `ResultadoEnsaio` | — | RESULTADO | — |
| Leituras (curva) | "Tempo (min)" / "Pressão (kgf/cm²)" fixo | — | gráfico + "LEITURAS REGISTRADAS" com cabeçalho **TEMPO / PRESSÃO sem unidade** | unidade |
| Instrumento / padrão / nº série / nº certificado / validade | **nenhuma UI no formulário** | `padraoDoEnsaio('manometro')` de `nr13_rastreab_` (Certificados) | INSTRUMENTO DE MEDIÇÃO UTILIZADO | funciona pelo cadastro de Certificados; sem escolha em campo (aceitável) |
| Parecer | textarea | — | Parecer técnico (bloco final) | — |
| Fotos | upload | — | 8.3 | — |

**Campo sem caminho claro de preenchimento:** o bloco do instrumento só é preenchido pelo
cadastro de Certificados (tipo manômetro); não há como o técnico indicar em campo qual
manômetro usou. Não é bloqueante — registrar como **D-8** (manter automático ou permitir
escolher o padrão).

### Gráfico — `pdfVetorial/graficoTh.ts`

| elemento | linha | hoje |
|---|---|---|
| eixo Y | 339 | `'Pressão (kgf/cm²)'` fixo |
| etiqueta da PT | 284 | `` `PT: ${…toFixed(1)} kgf/cm²` `` fixo |
| rótulo de cada ponto | 300 | `` `${p.v.toFixed(2)} kgf/cm²` `` fixo |
| eixo X | 338 | `Tempo (minutos)` — correto |
| doc da interface | 41, 48 | "kgf/cm²" no comentário do tipo |

### Unidade — armazenamento canônico e proposta

Hoje **não há valor canônico em MPa** para o TH: o dado é o TEXTO que o técnico digitou,
na unidade que o rótulo mostrava — sempre kgf/cm². Não se converte o dado gravado.

**P-TH-1 · Carimbo de unidade no blob.** `dados.th.unidade: SistemaUnidade`, gravado pelo
formulário novo = unidade do equipamento (`nr13_pref_unidade_<TAG>`, imutável).
Blob **sem** carimbo = legado = **`TECNICO`** (kgf/cm² era o único rótulo que existiu).

**P-TH-2 · Formulário na unidade do equipamento.** Rótulos por `rotuloPressao(unidade)`.
Prefill por `valorNaUnidade(mpa, unidade)` — some a `MPA_PARA_KGFCM2` duplicada de
`autoPreencher.ts`. Blob legado aberto no formulário mostra o rótulo **do blob** (kgf/cm²)
e **não reescreve** os valores.

**P-TH-3 · Documento na unidade do equipamento.** Novo helper em `calc/unidades.ts`,
`converterEntreUnidades(valor, de, para)` = `paraExibicao(paraMpa(v, de), para)`
(reuso, sem fórmula nova). Se `de === para`, imprime o número digitado (sem arredondar de
novo). Aplica a: pressão de projeto, trabalho, teste, cada ponto da curva, a PT do gráfico.
`DadosGraficoTh` ganha `unidadeLabel`. Cabeçalho da tabela: `TEMPO (min)` /
`PRESSÃO (<unidade>)`.

**P-TH-4 · Estruturar duração e temperatura.** Inputs numéricos com sufixo fixo (min, °C)
gravados em `duracaoMin` / `tempFluidoC`; texto livre legado continua sendo impresso como
veio. Decisão **D-9** (pode ficar para depois — não é pressão).

**P-TH-5 · Corrigir os dois prefills.** Fluido de teste: não usar `fluidoInput` (manter
"Água Potável"). Pressão de projeto: **D-7**.

**Overrides:** os ids `th.pressao-projeto`, `th.pressao-trabalho`, `th.pressao-teste`
mudam (ex.: sufixo `-v2`), pela mesma razão documentada em `folhas.ts:476-480` na troca de
16/09: um override digitado em kgf/cm² exibido sob rótulo "bar" seria um número errado
num documento assinado. Override antigo fica inerte; a célula volta ao automático.

**Categoria afetada: NÃO.**

---

## 7. MATRIZ DE UNIDADES DO RELATÓRIO (Modelo Novo, vetorial)

Classes: **A** segue a unidade do equipamento · **B** unidade normativa/fixa ·
**B-calc** unidade do registro de cálculo (MPa/mm do motor — proposta, **D-6**) ·
**B-inst** unidade da escala do instrumento calibrado · **C** não afetado / sem unidade.
"Folha" = número da seção do relatório (a página varia com o conteúdo).

### 7.1 Matriz de regra

| CAMPO | FOLHA | FONTE | UNIDADE ATUAL | UNIDADE CORRETA | REGRA | ALTERAR? |
|---|---|---|---|---|---|---|
| Classe/Grupo/Categoria (capa) | 1 | `nr13_cat_` | — | — | C | NÃO |
| VOLUME (m³) | 3, 5 | `info.volume`/`cat.volInput` | m³ | m³ | B | NÃO |
| PMO / PMTA / PTH (tabela PRESSÕES) | 3 | adotada ?? calculada | equipamento (cabeçalho) | equipamento | A | NÃO |
| Placa reconstruída PMTA/PTH | 3 | idem | equipamento | equipamento | A | NÃO |
| Placa VOLUME (m³) | 3 | idem | m³ | m³ | B | NÃO |
| PMTA (folha de categorização) | 4 | `pmta.kgf` | kgf/cm² | kgf/cm² | B | **NÃO — intocável** |
| Produto P·V (kPa × m³), P·V > 8 | 4 | `cat.PV_enq` | kPa·m³ | kPa·m³ | B | **NÃO** |
| Produto P·V risco (MPa × m³) | 4 | `cat.PV_cat` | MPa·m³ | MPa·m³ | B | **NÃO** |
| PRESSÃO DE PROJETO | 5 | `nr13_vaso_.P` → `naUnidade` | equipamento, inline | equipamento | A | NÃO |
| MARGEM DE CORROSÃO (mm), TEMP. PROJETO (°C) | 5 | memorial | mm, °C | mm, °C | B | NÃO |
| PMO/PMTA/PTH (ASPECTOS OPERACIONAIS) | 5 | adotada ?? calculada | equipamento | equipamento | A | NÃO |
| RELAÇÃO P(kPa)×V, P(MPa)×V | 5 | `cat` | kPa·m³, MPa·m³ | idem | B | **NÃO** |
| PMO/PMTA/PTH (topo) | 6 | idem | equipamento | equipamento | A | NÃO |
| Dados utilizados (P, S, t, D, R, c…) | 6 | `DESCRICAO_VARIAVEL` | coluna UNIDADE (MPa, mm) | MPa/mm | B-calc | NÃO |
| ESPESSURA MÍN. CALCULADA (t) | 6 | `tReqMm` | **sem** | mm | B-calc | **SIM** |
| PMTA CALCULADA (P) do componente | 6 | `pmtaMpa` | **sem** (é MPa) | MPa (B-calc) ou equipamento (A) — **D-6** | B-calc/A | **SIM** |
| ESP. MÍN. MEDIDA (t) | 6 | `tNom` | **sem** | mm | B-calc | **SIM** (e o rótulo diz "medida" para a espessura **nominal** — ver §14) |
| MARGEM DE CORROSÃO (c), RAIO | 6 | memorial | **sem** | mm | B-calc | **SIM** |
| TENSÃO ADMISSÍVEL (S) | 6 | memorial | **sem** | MPa | B-calc | **SIM** |
| Memória de cálculo (texto/fórmulas) | 6.1 | `memorialHTML` | MPa/mm explícitos no texto | MPa/mm | B-calc | NÃO |
| Texto chk-pv8 (kPa, m³) | 7.1.1 | catálogo | kPa, m³ | idem | B | NÃO |
| Espessura nominal | 7.4 | `us.espNomCasco` | **sem** | mm | B | **SIM** |
| Temp. da superfície | 7.4 | rastreab/form | rótulo (°C) | °C | B | NÃO |
| Velocidade sônica | 7.4 | rastreab | **sem** | m/s | B | **SIM** |
| Cabeçote | 7.4 | rastreab (texto "2.25 mhz") | no texto | MHz | B | NÃO (texto livre; D-9) |
| Leituras / menor / requerida | 7.4 | grade | faixa "(mm)" | mm | B | NÃO |
| Taxa (mm/ano), sobremetal (mm), vida (anos) | 7.4 | `nr13_vida_` | explícitas | idem | B | NÃO |
| Pressão de projeto (TH) | 7.5 | `th.pressaoProj` | **sem** | equipamento | A | **SIM** |
| Pressão de trabalho (TH) | 7.5 | `th.pressaoTrabalho` | **sem** | equipamento | A | **SIM** |
| Pressão de teste (TH) | 7.5 | `th.pressaoTeste` | **sem** | equipamento | A | **SIM** |
| Duração | 7.5 | texto | o que for digitado | min | B | **SIM** (D-9) |
| Temp. do fluido | 7.5 | texto | o que for digitado | °C | B | **SIM** (D-9) |
| Gráfico: eixo Y | 7.5 | fixo | kgf/cm² | equipamento | A | **SIM** |
| Gráfico: etiqueta PT | 7.5 | fixo | kgf/cm² | equipamento | A | **SIM** |
| Gráfico: rótulo dos pontos | 7.5 | fixo | kgf/cm² | equipamento | A | **SIM** |
| Gráfico: eixo X | 7.5 | fixo | minutos | minutos | B | NÃO |
| Leituras registradas (cabeçalho) | 7.5 | fixo | **sem** | TEMPO (min) / PRESSÃO (equip.) | A/B | **SIM** |
| Datas, textos, marcações | todas | — | — | — | C | NÃO |

### 7.2 Matriz documental (o que se lê no papel)

Valores de exemplo são ilustrativos (equipamento Técnico, PTH 29,16 kgf/cm²); o E2E da
Etapa E substitui por valores reais extraídos do PDF.

| DOCUMENTO/FOLHA | CAMPO | VALOR ATUAL | UNID. ATUAL | DEVERIA SER | VISÍVEL? | SEGUE EQUIP.? | NORMATIVA? | CORREÇÃO |
|---|---|---|---|---|---|---|---|---|
| Relatório 3 | PRESSÕES (PMO/PMTA/PTH) | 29.16 | kgf/cm² (cabeçalho) | equip. | SIM | SIM | NÃO | nenhuma |
| Relatório 4 | PMTA categorização | 22.43 kgf/cm² | kgf/cm² | kgf/cm² | SIM | NÃO | SIM | nenhuma |
| Relatório 4 | P·V (kPa·m³)/(MPa·m³) | 2750 / 2.75 | kPa·m³ / MPa·m³ | idem | SIM | NÃO | SIM | nenhuma |
| Relatório 5 | Pressão de projeto | 22.43 kgf/cm² | inline | equip. | SIM | SIM | NÃO | nenhuma |
| Relatório 6 | PMTA calculada (P) componente | 2.33 | MPa implícito | D-6 | **NÃO** | NÃO | B-calc | rótulo com unidade |
| Relatório 6 | Esp. calculada / nominal / c / raio | 6.3 | mm implícito | mm | **NÃO** | — | B-calc | rótulo "(mm)" |
| Relatório 6 | Tensão admissível (S) | 138 | MPa implícito | MPa | **NÃO** | — | B-calc | rótulo "(MPa)" |
| Relatório 7.4 | Espessura nominal | 8 | mm implícito | mm | **NÃO** | — | SIM | rótulo "(mm)" |
| Relatório 7.4 | Velocidade sônica | 5920 | m/s implícito | m/s | **NÃO** | — | SIM | rótulo "(m/s)" |
| Relatório 7.5 | Pressão de projeto/trabalho/teste | 13.70 | **nenhuma** | equip. | **NÃO** | NÃO | NÃO | P-TH-1..3 |
| Relatório 7.5 | Gráfico eixo/PT/pontos | 8.00 kgf/cm² | kgf/cm² fixo | equip. | SIM | **NÃO** | NÃO | P-TH-3 |
| Relatório 7.5 | Leituras registradas | 8.00 | **nenhuma** | equip. | **NÃO** | NÃO | NÃO | cabeçalho com unidade |
| Relatório 7.5 | Duração / Temp. fluido | "30" | depende | min / °C | às vezes | — | SIM | P-TH-4 |
| Certificado manômetro | Resultados crescente/decrescente | — | unidade do componente (`inj-unid-*`) | escala do instrumento | SIM | NÃO | B-inst | nenhuma |
| Certificado manômetro | Incerteza | texto | nenhuma | escala do instrumento | **NÃO** | NÃO | B-inst | sufixo com `c.unidade` |
| Certificado manômetro | Temperatura do ar / umidade | texto | depende | °C / % | às vezes | — | SIM | rótulo "(°C)" "(%)" |
| Certificado PSV | Abertura / ajuste / fechamento | texto | **nenhuma** (a unidade é coletada em `ModalResultados` e não impressa) | escala do instrumento | **NÃO** | NÃO | B-inst | injetar `c.unidade` no cabeçalho |
| Certificado PSV | Incerteza | texto | nenhuma | idem | **NÃO** | NÃO | B-inst | idem |
| Visualizador de calibração (tela) | Títulos "Sentido Crescente (kgf/cm²)" | fixo | kgf/cm² | `cal.unidade` | SIM | NÃO | B-inst | usar `unidadeDoComponente` |
| Prontuário (vetorial) 2 | PRESSÕES | 4 colunas MPa/psi/kgf/bar | 4 unidades | equip. (coerente com o relatório) | SIM | NÃO | NÃO | **D-10** (fora do núcleo) |
| Prontuário 2 | Pressão de projeto / máx. operação / TH | texto livre do prontuário | nenhuma | equip. | **NÃO** | NÃO | NÃO | **D-10** |
| Prontuário 5 | PMTA (MPa) por componente | explícita | MPa | B-calc | SIM | NÃO | B-calc | nenhuma |
| Livro de registro / Termo | — | sem grandeza numérica | — | — | — | — | — | C |

**Regra de apresentação proposta (consistente):** em TABELA chave-valor, a unidade vai no
RÓTULO (`PRESSÃO DE TESTE (bar)` | `13.70`); em tabela de colunas, no CABEÇALHO
(`PRESSÃO (bar)`); em texto corrido e em rótulo de gráfico, junto do número
(`13.70 bar`). Nunca nas duas posições ao mesmo tempo. É a regra que o documento já
segue nas folhas 3, 5 e 6 (`valorNaUnidade` "SEM rótulo de propósito").

---

## 8. CATEGORIA NR-13 — PERMANECE INTOCADA

**Prova de que o plano não a atinge:**

- Nenhuma alteração proposta em: `src/calc/categoria.ts`, `features/categoria/*`,
  `folhas.ts:folhaCategorizacao` (l. 1004), `matrizCategorizacao` (l. 817),
  `modelo.ts:categorizacaoFolha` (l. 938-964, PMTA fixa em kgf/cm²) e
  `categorizacaoDetalhe` (l. 921-929), nem no bloco "CATEGORIZAÇÃO DO EQUIPAMENTO" da
  folha 5 (l. 1154-1183).
- O helper novo `converterEntreUnidades` é usado SÓ no TH; a categoria não chama nada de
  `unidades.ts` além do que já chama.
- Testes que já travam isso e passam a rodar nos TRÊS sistemas:
  `categoriaIntacta.test.ts` (folha idêntica nas três unidades; PMTA em kgf/cm²; unidades
  normativas escritas) e `unidadeNoPdf.test.ts` (kPa·m³ e MPa·m³ nos documentos).
- Gate adicional da Etapa E: o **texto extraído** da folha 4 é byte a byte igual nos
  relatórios SI, Técnico e Petrobras do mesmo dado físico.

---

## 9. CERTIFICADO DE CALIBRAÇÃO

### 9.1 Logo — causa raiz

| caminho | quem monta | resolve `logoRef`? | resultado |
|---|---|---|---|
| Tela Calibrações → visualizador / "Baixar PDF" | iframe + `usePalcoDocumento` | **sim** (palco, `REF_RESOLVIDA_NO_LUGAR`, `palco.ts:699-704`) | logo aparece **[a confirmar no E2E]** |
| **Anexo no relatório (vetorial)** | `hostCertificado.comFolhaIsolada` | **NÃO** — `materializarChaves` (l. 65-85) faz `localStorage.setItem(chave, JSON.stringify(ler(chave)))` cru | **logo vazia** |
| Portal do Cliente | iframe + `hidratarItemLocal` | depende do que o portal materializa | **[a confirmar]** |

Sequência exata no anexo: (1) a folha abre com `ctx=rel`; (2) `rel-empresa.js` prefere
`meta.empresa`; (3) `snapshotEmpresa()` (`relatoriosService.ts:188-194`) removeu `logo`
quando há `logoRef`; (4) o template faz `if (dados.logo) imgLogo.src = dados.logo` —
falso; (5) fica `src="logo.webp"`, relativo a `/arquivos-inspecao/`, **inexistente** → a
célula superior esquerda sai vazia no JPEG rasterizado.

Não é CORS nem formato: o arquivo nunca chega a ser pedido. Tampouco é o gerador do corpo:
esse já resolve a logo (`gerarRelatorio.ts:361-363`) — e respeita o override
`cabecalho.logo` do relatório, que a folha de calibração também ignora.

**P-CERT-1 · Correção:** `materializarChaves` passa a hidratar as referências pelo MESMO
código do palco — `hidratarFotosDoBucket` (exportado, `palco.ts:813`), que aplica
`refsNoLugarDaChave` com a regra "só preenche campo vazio / nunca troca pela logo atual".
Sem workaround de screenshot, sem logo nova. Qualidade: a imagem é a original do bucket;
o template já usa `object-fit: contain` (proporção preservada). Complemento: trocar
`src="logo.webp"` por `src=""` + `alt` vazio, para a ausência ser um branco explícito e
não um 404.

### 9.2 Assinatura

**O que existe:**
- `nr13_lista_phs` (`Funcionario`): nome, CREA, tipo (Engenheiro/Inspetor), `funcao`,
  `camposExtras`, rubrica (`assinatura` dataURL + `assinaturaRef` no bucket),
  `folhasProntuario[]`, `folhasRelatorio[]`.
- Motores de assinatura: prontuário (`pront-assinatura.js`), relatório raster
  (`rel-assinatura.js`, carimbo), relatório vetorial (`folhas.ts:assinaturas`, snapshot em
  `meta.assinantes`), livro (termo).
- Certificados: **nenhum**. `CERTIFICADO-CAL-*.html` estão explicitamente fora do
  `rel-assinatura.js` (CLAUDE.md §7-bis). O CSS `.signatures-container` existe sem HTML.
- Responsável pela emissão: **não há campo**. O emitente implícito é a organização
  (logo + rodapé de `nr13_minha_empresa`). `DadosCalibracao.empresa` é o CLIENTE.

**P-CERT-2 · Estrutura proposta (sem inventar quem assina):**
- `DadosCalibracao.responsavel?: { id, nome, funcao, registro, assinaturaRef?, assinatura?, camposExtras? }`
  — **snapshot** feito no momento de salvar a calibração (calibração salva já não se
  edita), escolhido num select de `nr13_lista_phs` no formulário da calibração.
  Pré-seleção: nenhuma, ou a última usada nesta organização — **D-11**.
- Bloco no template: *RESPONSÁVEL PELA CALIBRAÇÃO* · rubrica · nome · função ·
  registro/CREA (se houver) · até 2 campos extras. Um assinante (ou dois, se o dono quiser
  técnico + responsável técnico — **D-11**).
- Rubrica via `assinaturaRef`, resolvida pelo mesmo `hidratarFotosDoBucket` de P-CERT-1.
- Calibração antiga sem `responsavel`: o bloco some (não imprime "Fulano de Tal").

### 9.3 Documento independente

| requisito | hoje | proposta |
|---|---|---|
| Identificação única | `id` interno + `numeroCertificado` digitado | manter; opcional numeração automática — **D-12** |
| Número / emissão / validade | sim (digitados) | manter |
| Cliente | sim (`empresa`, `endereco`) | manter |
| Equipamento (TAG) | `referencia` (faixa) / TAG só na URL | imprimir TAG do equipamento |
| Instrumento, padrão, rastreabilidade | sim | padrão referenciando `nr13_rastreab_<id>` em vez de redigitar (P-INS, §10) |
| Resultado / conclusão | sim | — |
| Logo | quebrada no anexo | P-CERT-1 |
| Assinatura | ausente | P-CERT-2 |
| **Imutabilidade** | **re-renderizado dos dados vivos** (download, anexo, Portal) | **P-CERT-3** |

**P-CERT-3 · Certificado vira ARQUIVO na emissão** (mesmo princípio do §7-quater): um
botão "Emitir certificado" gera o PDF (a mesma rasterização de hoje, uma vez), SHA-256,
upload `<org>/certificados-calibracao/<uuid>.pdf`, e grava `pdfRef`/`sha256`/`emitidoEm`
no registro. A partir daí: download, Portal e anexo ao relatório servem **os bytes** (o
anexo vira pdf-lib, como o dos padrões — some o `html2canvas` do relatório para esses
certificados). Calibração **sem** `pdfRef` (todas as de hoje) continua pelo fluxo atual —
**sem retrofit**, porque gerar agora carimbaria a logo e o rodapé de hoje num documento de
outra data. **Decisão D-13** (é a maior mudança da Etapa C).

---

## 10. MODELO DE DADOS

### Chaves atuais envolvidas

| chave | escopo | papel |
|---|---|---|
| `nr13_docs_<TAG>` | TAG | containers de inspeção (checklist, visual_externo/interno, th, ultrassom) |
| `nr13_inspecao_atual` / `nr13_injecao_atual` | global (palco) | cópia do container escolhido para o documento |
| `nr13_relatorio_meta_atual` / `nr13_rel_<id>_<TAG>` | global / TAG | meta com snapshots congelados |
| `nr13_componentes_cal_<TAG>` / `nr13_lotes_cal_<TAG>` | TAG | acessórios e rodadas |
| `nr13_calibracoes_<TAG>` / `nr13_calibracao_item_<id>` | TAG / id | certificados de calibração |
| `nr13_rastreab_<id>` | id | certificados dos padrões + PDF |
| `nr13_lista_phs` / `nr13_minha_empresa` | global | assinantes / empresa + logo |
| `nr13_pref_unidade_<TAG>` | TAG | unidade imutável do equipamento |
| `nr13_ovr_<id>_<TAG>` | TAG | overrides do documento |

### Alterações propostas (todas campos NOVOS e OPCIONAIS em chaves existentes)

| onde | campo | etapa |
|---|---|---|
| `dados.visual_externo` / `visual_interno` | `semanticaNc: 1` | A |
| `dados.checklist` | `observacoesParte1`, `observacoesParte2`, `instrumentosRef: { [instId]: { componenteId } }` | A / D |
| `dados.th` | `unidade: SistemaUnidade`; (D-9) `duracaoMin`, `tempFluidoC` | B |
| `ComponenteCal.tipo` | + `termometro` \| `vacuometro` \| `pressostato` \| `transmissor` | D |
| `DadosCalibracao` | `origem`/`tipo 'externa'`, `laboratorio`, `pdfRef` (terceiro); `responsavel` (snapshot); `pdfRef`/`sha256`/`emitidoEm` (P-CERT-3) | C / D |
| `RelatorioMeta` | `instrumentos` (snapshot congelado do quadro 7.1.1) | D |

### Migrations

**Nenhuma migration SQL.** Tudo é JSON dentro de `app_storage.valor`, já coberto pela RPC
`aplicar_mutacao_storage`, pelas famílias de `familiasChave.ts` (todas as chaves acima já
estão mapeadas) e pela RLS existente. Bucket: o `inspecao` já recebe PDFs em
`<org>/certificados/`; P-CERT-3 usa uma pasta nova no mesmo bucket e as mesmas policies
**[conferir as policies de `storage.objects` antes da Etapa C — se forem por prefixo de
pasta, a pasta nova precisa entrar]**.

Pontos a conferir na implementação:
- `palco.varreduraTemplates.test.ts` quebra se um template passar a ler chave nova —
  P-CERT-2 NÃO cria chave nova (o responsável mora no item), então não deve disparar.
- Projeção `calibracoes_index` (Fase 9F.3): se `tipo 'externa'` precisar aparecer em
  colunas da projeção, é SQL — **evitar**, mantendo o que a projeção indexa inalterado.
  **[conferir `busca_*` antes da Etapa D]**.

---

## 11. OFFLINE / SYNC

- Container: todo campo novo proposto vive DENTRO de `nr13_docs_<TAG>`, gravado por
  `salvarDadosFormulario` → `storage.salvar` → (v2) cache Map + IndexedDB + fila
  transacional → RPC → ACK. Mesmo caminho das respostas de hoje. **Nenhum campo existe só
  em React state**: o autosave (`useAutosaveFormulario`, debounce 1 s + flush no unmount)
  já cobre qualquer campo do objeto `dados`.
- `semanticaNc` e `th.unidade` são gravados no próprio blob no primeiro salvar; o gerador
  lê o blob — funciona offline.
- Seletor de componente no checklist (P-INS-3): leitura de `nr13_componentes_cal_<TAG>` e
  `nr13_calibracoes_<TAG>` do cache. Sem os dados no aparelho, a linha continua aceitando
  Possui/Calibrado manualmente; o id escolhido só referencia — a cópia é feita na geração
  do relatório (escritório, online).
- Anexo PDF de terceiro e emissão de certificado (P-CERT-3) dependem de upload: usar a
  fila de arquivos existente (`fotos.salvarArquivo` + `arquivoPendente`), **nunca**
  `navigator.onLine` (memória `navigator-online-mente`). Emissão offline: gera e guarda
  como pendente, igual ao §7-quater.
- Rubrica do responsável: snapshot com `assinaturaRef` só quando o arquivo já está no
  bucket (regra da promoção tardia, `PENDENCIAS.md` FASE 7B).

---

## 12. MOBILE

**Verificação visual em 390 px: NÃO executada nesta rodada.** Análise por código/CSS:

| tela | estado | proposta |
|---|---|---|
| Exame externo/interno | item em flex com número, texto `flex:1` e segmentado (44 px de altura mínima, `formularios.css:330`); abaixo de 700 px o segmentado ocupa a linha inteira; observação por item em input de 12 px | faixa sticky da pergunta (P-VE-1) + legenda de uma linha; cores por polaridade; aviso inline para SIM sem observação. **Sem card por pergunta.** |
| Instrumentos (checklist) | checkboxes nativos pequenos dentro de `<label>` (toque na linha inteira funciona); sem campo de certificado | linha compacta: `[Possui] [Calibrado] [Componente ▾]` + uma linha de resumo; select nativo (teclado do sistema); nada de modal por instrumento |
| Observações do checklist | inexistentes no campo | 2 textareas de 3 linhas (P-OBS-1) |
| TH | rótulos "(kgf/cm²)" fixos; `inputMode="decimal"` em `type="text"` | rótulos na unidade do equipamento; mantém `inputMode="decimal"` (vírgula aceita, `entradaDecimal.test.ts`); duração/temperatura com sufixo visual fixo |
| Salvar | barra fixa inferior (`.formulario-acoes-fixas`) + `FeedbackSalvamento` | reservar `padding-bottom` para a faixa sticky não colidir com a barra |

A Etapa E inclui a passada visual em 390 px (Chrome, dispositivo emulado) em cada tela
acima, com captura antes/depois.

---

## 13. PDF / DOCUMENT ENGINE

**Arquivos envolvidos:**
`pdfVetorial/modelo.ts` (TH, instrumentos, observações do checklist, exames),
`pdfVetorial/folhas.ts` (blocoExame, 7.1.1, 7.4, 7.5, 6), `pdfVetorial/graficoTh.ts`,
`pdfVetorial/hostCertificado.ts`, `pdfVetorial/certificados.ts`, `pdfVetorial/gerarRelatorio.ts`
(anexo de certificado arquivado — P-CERT-3), `rastreabilidadeService.ts`
(`anexarRastreabilidades`, reuso para terceiros), `calc/unidades.ts` (helper),
`public/arquivos-inspecao/CERTIFICADO-CAL-MANOMETRO.html` e `CERTIIFCADO-CAL-PSV.html`
(logo, assinatura, unidade PSV), `inspecoes/formularios/*`, `VisualizadorFormulario.tsx`,
`calibracoes/*`, `pages/Calibracoes.tsx`.

**Documentos históricos:** relatórios com `pdfRef` não são remontados (§7-quater) — nada
muda neles, SHA e `pdfRef` intactos. Certificados de calibração hoje **não têm** arquivo:
qualquer mudança de template (logo, assinatura, unidade PSV) aparece **também ao reabrir
um certificado antigo** e dentro de rascunhos de relatório em aberto. Isso é o
comportamento atual do sistema para certificados, não uma regressão — mas precisa da sua
ciência (**D-13**). Relatórios finalizados que já anexaram um certificado **não mudam**
(o certificado está dentro dos bytes arquivados).

**Rascunhos em aberto** (sem `pdfRef`) passarão a mostrar TH na unidade do equipamento
(convertendo os legados de kgf/cm²) e a pendência de P-VE-5 — é o comportamento desejado,
e afeta só documentos ainda não emitidos.

---

## 14. RISCOS DE REGRESSÃO

| risco | mitigação |
|---|---|
| Relatórios JÁ EMITIDOS podem ter "SIM" sob "Foi encontrada NC?" significando "ok" | não se altera histórico (§7-quater). Levantamento opcional, só leitura: contar relatórios emitidos com exame visual e alguma resposta SIM — **D-1** |
| Container legado com TH digitado em MPa apesar do rótulo kgf/cm² | impossível detectar; assumir kgf/cm² (o que a tela dizia). Pendência opcional "confirme as pressões do TH" para blob sem carimbo — D-2 |
| Arredondamento duplo na conversão do TH | converter só quando `de !== para`; imprimir o texto digitado quando iguais |
| Overrides antigos do TH sob rótulo de outra unidade | trocar ids (precedente de 16/09) |
| `hidratarFotosDoBucket` no host do certificado disputar a trava do palco | chamar a função de hidratação, não `montarPalcoDaTag` — ela não usa `palcoTrava` **[conferir]** |
| Ampliar `ComponenteCal.tipo` quebra telas que fazem `tipo === 'manometro' ? … : PSV` | varrer `tipo ===`/ternários em `calibracoes/*`, `Calibracoes.tsx`, `vencimentos*`, Portal, `tiposPadraoDoRelatorio`; testes de UX existentes |
| Vencimentos contarem calibração de terceiro em dobro | teste em `vencimentosDeduplicacao.test.ts` |
| Categoria alterada por engano | §8 — testes nos três sistemas + igualdade do texto da folha 4 |
| Mudança de rótulo quebra ids de override de outras células | ids de override derivam do rótulo (`idCampo`); acrescentar unidade ao RÓTULO de uma célula muda o id → listar e decidir célula a célula (preferir unidade no rótulo da coluna, não no id) |
| Achado lateral: "ESP. MÍN. MEDIDA (t)" imprime `tNom` (nominal) e a "Situação do componente" compara nominal × requerida chamando de "medida" | fora do escopo de unidades; registrar e decidir (**D-14**) |
| Achado lateral: "TESTE HIDROSTÁTICO" em "Próxima inspeção" lê `meta.validadeValvula` | só registrar |

---

## 15. TESTES NECESSÁRIOS

**Unitários/integração (vitest, sem rede):**
1. `unidadeNoPdf.test.ts` estendido para **SI, Técnico e Petrobras** e para a composição
   COMPLETA (VISUAL-EXTERNO/INTERNO, ULTRASSOM, TESTE-HIDROSTATICO, checklist), lendo o
   texto extraído dos bytes (pdf.js): pressões do TH com a unidade certa, eixo/PT/pontos,
   cabeçalho das leituras, nenhum `kgf/cm²` num documento SI/Petrobras fora da folha 4.
2. Varredura de "número técnico sem unidade": regex sobre o texto extraído nas linhas dos
   campos auditados (§7.2), falhando em `PRESSÃO DE TESTE\s+\d` sem unidade no rótulo.
3. `categoriaIntacta.test.ts` com Petrobras; texto da folha 4 idêntico nos três.
4. TH legado: blob sem `unidade` com `13.70` → documento SI imprime `1.343 MPa`,
   Petrobras `13.43 bar`, Técnico `13.70`.
5. `converterEntreUnidades` ida e volta nos 9 pares.
6. Prefill TH: nunca `fluidoInput`; pressões via `valorNaUnidade`.
7. Exame visual: faixa da pergunta no formulário (render test); polaridade de cor;
   pendência de P-VE-5 com/sem `semanticaNc`.
8. `hostCertificado`: meta com só `logoRef` → iframe recebe `logo` dataURL; restauração
   do `localStorage` depois.
9. Certificado PSV imprime `c.unidade`; manômetro imprime unidade na incerteza.
10. Quadro 7.1.1: componente referenciado → nº/validade/laboratório no PDF; calibração
    editada depois não muda relatório com meta congelada.
11. Varredura: nenhuma constante `10.19716` fora de `calc/unidades.ts` e `calc/caldeira.ts`.
12. `palco.varreduraTemplates.test.ts` e `unidadeSomenteNaCriacao.test.ts` continuam verdes.

**E2E real (Etapa E) — em Supabase LOCAL (§12 do CLAUDE.md), três vezes (SI/Técnico/Petrobras):**
criar equipamento ZZ escolhendo a unidade → cadastrar componente e calibração própria →
cadastrar calibração de terceiro com PDF → inspeção pelo celular emulado (390 px):
exame externo/interno com a pergunta visível e ao menos um SIM com observação,
instrumentos com componente referenciado, observações do checklist, TH com curva →
gerar relatório → emitir certificado → conferir logo e assinatura no certificado
avulso E no anexado → conferir unidades → salvar → F5 → finalizar → extrair texto do
PDF final → conferir SHA/pdfRef → reabrir arquivado (mesmos bytes) → Categoria idêntica
nos três.

---

## 16. ROADMAP DE IMPLEMENTAÇÃO

Ordem ajustada pela auditoria: **B e C.1 primeiro** (correções isoladas, sem modelo de
dados novo, alto valor), depois A, depois o que depende de dado novo.

| etapa | escopo | depende de | tamanho |
|---|---|---|---|
| **B — Unidades** | P-TH-1..3 e 5 (fluido/projeto conforme D-7), gráfico, leituras, ids de override do TH, rótulos com unidade nas folhas 6 e 7.4, unidade no certificado PSV e no visualizador; helper único; testes 1-6, 9, 11 | D-6, D-7 | M |
| **C.1 — Logo do certificado** | P-CERT-1 (hidratação de refs no host) + `logo.webp` → vazio; teste 8 | — | P |
| **A — Inspeções** | P-VE-1..5 (externo+interno, possivelmente `FormularioVisual` único), visualizador desktop, P-OBS-1; teste 7 | D-2, D-3 | M |
| **C.2 — Assinatura do certificado** | P-CERT-2 (select de responsável na calibração + snapshot + bloco no template) | D-11 | M |
| **C.3 — Certificado como arquivo** | P-CERT-3 (emitir → pdfRef/SHA; download/Portal/anexo servem bytes) | D-13; C.1, C.2 | G |
| **D — Integração instrumentos/terceiros** | P-INS-1..4, tipos de componente, quadro 7.1.1 com referência e snapshot na meta, anexo do PDF de terceiro | D-4, D-5; C.3 recomendado | G |
| **E — E2E completo** | §15, três unidades, 390 px, bytes do PDF | todas | M |

Cada etapa: branch própria, `npm run build` (não só `tsc --noEmit`), suíte verde, sem
push/deploy sem sua aprovação.

---

## PENDÊNCIAS / DECISÕES DO DONO

| id | decisão | recomendação |
|---|---|---|
| D-1 | Levantar (só leitura) relatórios já emitidos com exame visual e respostas SIM? | Sim, só para conhecimento; nada é alterado |
| D-2 | Pendência "confirme o significado do SIM" para containers anteriores à mudança (e "confirme as pressões do TH" para blobs sem unidade)? | Sim, nas duas |
| D-3 | Linha derivada "Não conformidades encontradas: N — itens …" no PDF? | Sim (derivada, nunca persistida) |
| D-4 | Terceiro como `tipo: 'externa'` ou como `origem` nas variantes existentes? | `tipo: 'externa'` (não mistura com os templates de emissão própria) |
| D-5 | Onde o laboratório aparece no 7.1.1: dentro da célula "Nº CERTIFICADO / VALIDADE" ou coluna nova? | Dentro da célula, 2ª linha em fonte menor (mantém a referência) |
| D-6 | Folha 6 por componente: MPa (unidade do cálculo, explícita) ou unidade do equipamento? | **MPa explícito** — é o registro do cálculo, as fórmulas logo acima usam MPa |
| D-7 | "Pressão de projeto" do TH: `nr13_vaso_.P` (projeto real) ou PMTA (como hoje)? | `nr13_vaso_.P` quando houver; sem memorial, campo vazio (não PMTA) |
| D-8 | Técnico escolhe o manômetro padrão do TH em campo ou segue automático? | Automático (como hoje) |
| D-9 | Estruturar duração (min) e temperatura (°C) do TH agora? | Sim, na Etapa B |
| D-10 | Prontuário vetorial também passa a uma unidade só (hoje 4 colunas)? | Sim, mas em etapa própria depois da B |
| D-11 | Quem assina o certificado: 1 responsável ou 2 (técnico + RT)? Pré-seleção? | 1 responsável obrigatório para emitir; sem pré-seleção automática |
| D-12 | Numeração automática do certificado? | Não agora |
| D-13 | Certificado vira arquivo imutável na emissão (P-CERT-3)? | Sim — é o que faz dele documento independente |
| D-14 | "ESP. MÍN. MEDIDA (t)" que imprime a nominal: corrigir rótulo/fonte? | Corrigir em etapa separada, com decisão de engenharia |
