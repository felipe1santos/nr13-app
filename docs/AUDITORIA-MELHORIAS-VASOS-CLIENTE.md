# Auditoria — "Modelo Melhorias Vasos", revisão do cliente

> **Esta rodada é AUDITORIA. Nenhum código, banco, documento ou produção foi
> alterado.** O único arquivo criado é este.

- **Arquivo lido:** `C:\Users\felipe\Downloads\Modelo Melhorias Vasos (1) (1).pdf`
- **Páginas:** 25
- **Anotações (não-link):** 18 objetos, **13 com texto** (as demais são as linhas/setas
  e os popups que acompanham cada balão). Autor: `MCA-Eng`. Datas de criação/modificação
  das anotações: 14/09/2026.
- **Documento revisado:** `REL-1789431417552`, ACM Engenharia Ltda / Móveis Katzer,
  TAG `F-122031 - 1`. Emitido **antes** das rodadas de 18–22/09/2026.

Método: as anotações foram extraídas do *appearance stream* (elas não têm `contents`),
e cada uma foi aberta na página para ver **onde a seta aponta** — não só o texto do balão.

---

## Índice das anotações

| # | Pág. | Seção do documento | Anotação do cliente (verbatim) |
|---|---|---|---|
| 1 | 1 | Capa — subtítulo | "Desatualizado essa portaria" |
| 2 | 1 | Capa — campo `Nº DA A.R.T. (CREA)` (vazio) | "ART preencheu neste campo preenche em todos os campos do relatório" |
| 3 | 3 | 4. Categorização de risco | "Manter sempre a mesma unidade de medida" |
| 4 | 11 | 7.1.1 — quadro "Instrumentos e dispositivos" | "Acrescentar um campo de preenchimento caso as calibrações forem feitas por terceiros. Colocar dados dos dispositivios, quem calibrou e N° certificado e validade como ja possue." |
| 5 | 13 | 7.2 Exame externo | "No Aplicativo não aparece essa pergunta" |
| 6 | 14 | 7.3 Exame interno | "No Aplicativo não aparece essa pergunta" |
| 7 | 15 | 7.4 Medição de espessura | "Sugestão acrescentar uma escolha de um croqui apontando os pontos de medição de espessura… cilindro, tipo de tampo." |
| 8 | 16 | 7.5 Teste hidrostático — gráfico | "Unidade de medida em Kgf/cm² diferente do inserido no cadastro do equipamento. Acho melhor manter a mesma unidade de medida." |
| 9 | 18 | Certificado de calibração PSV — cabeçalho | "Ficou sem a Logo depois que baixou para PDF" |
| 10 | 19 | Certificado — após "8. Conclusão técnica" | "Adicionar campo de assinatura individual no certificados, Pois pode ser solicitado ou encaminhado separadamente" |

---

## 1 · CERTIFICADO / LOGO

**STATUS: ✅ JÁ CORRIGIDO**

**CAUSA ANTIGA.** A folha do certificado era montada num host isolado que copiava as
chaves do `localStorage` **cruas**. A logo da empresa não mora mais em base64 na chave:
ela é uma **referência ao bucket** (`nr13_minha_empresa.logoRef`). O template lia o campo
`logo`, que estava vazio, e imprimia o cabeçalho sem imagem — em silêncio. Na tela, com
o cache quente, às vezes aparecia; no PDF baixado, não. É o que a página 18 mostra.

**CORREÇÃO EXISTENTE (18/09/2026, §4-bis/§4-ter do CLAUDE.md).**

1. `hostCertificado.materializarChaves` passou a resolver `logoRef → logo` pela **mesma**
   `hidratarFotosDoBucket` do palco, com a regra dele: só preenche campo **vazio**, e sem
   imagem o campo fica como estava — nunca a logo de hoje num documento de ontem.
2. A emissão **recusa** sair sem a imagem: `emitirCertificado` confere que logo e rubrica
   chegaram à folha e lança `EmissaoRecusada` — **não grava registro nem sobe arquivo**.
3. Emitido vira **arquivo**: `emissao.pdfRef` + `sha256`, e `logoRef`/`assinaturaRef`
   congelados no registro.
4. No relatório, o certificado emitido entra com as **páginas copiadas** (`pdf-lib`) do PDF
   arquivado — a logo já está nos bytes. Certificado legado (sem emissão) é rasterizado com
   a logo hidratada, e a ausência vira `semLogo` **nomeado**, nunca silêncio.

**ARQUIVOS/FUNÇÕES**
- `src/features/relatorios/pdfVetorial/hostCertificado.ts` — `materializarChaves`,
  `empresaTemLogo`, `logoAusenteNaFolha`
- `src/features/calibracoes/emissaoCertificado.ts` — `emitirCertificado`, `EmissaoRecusada`
- `src/features/relatorios/pdfVetorial/certificados.ts` — `anexarFolhasDeCertificado`,
  `bytesArquivadosDaFolha`, retorno `semLogo[]`

**TESTES**
- `src/features/calibracoes/__tests__/certificadoFase2.test.ts`
  - "rubrica ou logo que não chegaram à folha: **NÃO emite e não grava nada**"
  - `emissao.logoRef.path` congelado; bytes começam em `%PDF-`; SHA do bucket = SHA do registro
  - "trocar a LOGO da empresa depois **não muda** o certificado emitido" (SHA idêntico)
- `integracaoE2eFase2.test.ts`, `rodadaFinalCalibracoes.test.ts`

**Respondendo item a item:**

| pergunta | resposta |
|---|---|
| logo aparece no preview? | sim — host isolado hidrata `logoRef` |
| no certificado individual? | sim, e **sem ela não emite** |
| no certificado anexado ao relatório? | sim — páginas copiadas do arquivo emitido |
| fica nos bytes do PDF? | sim — provado por SHA dos bytes do bucket |
| sobrevive a F5 / reabrir arquivado? | sim — serve `pdfRef`, não remonta |
| certificado antigo/finalizado? | preservado pelos bytes arquivados; §4-quinquies impede alterar |

**AINDA FALTA ALGO?** Não. **Fora do plano.**

---

## 2 · CERTIFICADO / ASSINATURA

**STATUS: ✅ JÁ CORRIGIDO**

A página 19 mostra o certificado terminando em "8. Conclusão técnica" e indo direto ao
rodapé da empresa — sem bloco de assinatura.

**CORREÇÃO EXISTENTE (§4-ter).** A calibração interna nasce `status: 'rascunho'` com o
**responsável congelado**: snapshot de `nr13_lista_phs` com nome, função e registro
profissional, e a rubrica por `assinaturaRef` (referência, não dataURL). Emitir carimba
`status: 'emitido'` + `emissao{pdfRef, sha256, emitidoEm, logoRef, assinaturaRef}`.

- **Sem responsável NÃO emite.**
- Sem imagem no cadastro sai nome/registro e **nunca uma rubrica inventada**.
- `certificadoFase2.test.ts`: "trocar a ASSINATURA do funcionário depois não muda o
  certificado emitido".
- Imutabilidade: `salvarCalibracao`/`excluirCalibracao` recusam emitido; corrigir é
  **revisão** (registro novo com `substitui`). Trava também no banco
  (`trg_guardar_documento_emitido`, §4-quinquies).

O pedido "pode ser solicitado ou encaminhado separadamente" está atendido: o certificado
é um **arquivo próprio** no bucket (`<org>/certificados-calibracao/<uuid>.pdf`), servido
por `artefatoDaCalibracao` — visualizar, baixar, imprimir e Portal usam os mesmos bytes.

**AINDA FALTA ALGO?** Não. **Fora do plano.**

---

## 3 · CHECKLIST / INSTRUMENTOS E DISPOSITIVOS

**STATUS: 🟡 PARCIALMENTE CORRIGIDO**

A sugestão do cliente (pág. 11) é de 14/09/2026. Em 18/09 entrou a fase 2 (D) da revisão
do engenheiro, que **superou a sugestão** — e vai além dela. O que sobrou é uma coisa só:
a tabela ainda imprime as seis linhas.

### 3.1 · O que já existe (⚪ SUPERADO POR ARQUITETURA NOVA)

A cadeia que o pedido descreve no §9 já é a arquitetura implementada:

```
COMPONENTE (nr13_componentes_cal_)
   → CALIBRAÇÃO (interna emitida | interna legada | terceiro)
      → CERTIFICADO (arquivo imutável + SHA)
         → INSPEÇÃO (instrumentosRef: ref + SNAPSHOT)
            → RELATÓRIO (lê o snapshot, nunca o registro vivo)
```

- **`SeletorCalibracaoInstrumento.tsx`** já está dentro do `FormularioChecklist`, na linha
  de cada instrumento. O inspetor **escolhe** a calibração registrada — não redigita
  laboratório, certificado nem validade. Divulgação progressiva: resumo + botão na linha;
  lista e cadastro em **modal de tela cheia no celular**.
- **Calibração de terceiro já existe** (`ModalCalibracaoTerceiro`, `origem: 'terceiro'`):
  laboratório, responsável externo, nº do certificado, datas, instrumento, faixa/unidade e
  o **PDF original intacto** em `<org>/certificados-externos/` com SHA-256. Nunca gera
  certificado interno, logo ou assinatura nossa para ela.
- **Snapshot**: `SnapshotInstrumento` guarda tipo, instrumento, fabricante, modelo, série,
  faixa, unidade, nº do certificado, data, validade, emissor, conclusão, `emitido`, `sha256`.
- **Rascunho não entra**: citar um certificado não emitido seria emiti-lo por tabela.
- Mora em `container.dados.checklist.instrumentosRef` — mesmo caminho do resto do
  checklist: container → cache local → fila → sync → ACK (§24 atendido).

### 3.2 · Matriz do quadro 7.1.1

| CAMPO | FONTE | AUTOMÁTICO? | DIGITADO PELO TÉCNICO? | SNAPSHOT? | NO RELATÓRIO? | STATUS |
|---|---|---|---|---|---|---|
| Linha (qual instrumento) | `INSTRUMENTOS_CHECKLIST` — **lista fixa de 6** | sim | não | n/a | **sempre as 6** | 🔴 |
| POSSUI | `instrumentosRef` → `'SIM'`; senão `checklist.instrumentos[id]` | sim (com vínculo) | sim (sem vínculo) | sim | sim | ✅ |
| CALIBRADO | **derivado** de `situacaoCalibracao(snapshot, dataInspecao)`: vencida/reprovada = `NÃO` escrito | sim | só sem vínculo | sim | sim | ✅ |
| Nº DO CERTIFICADO / VALIDADE | `textoCertificado(snapshot)` | sim | não | sim | sim | ✅ |
| Origem (interna/terceiro) | `snapshot.origem`; terceiro → `emissor = laboratorio` | sim | não | sim | via emissor | ✅ |
| Fabricante / modelo / série | componente → snapshot | sim | não | sim | não impresso no 7.1.1 | ✅ |

### 3.3 · O que ainda falta (🔴)

**A tabela imprime as seis linhas, inclusive as vazias.**

Evidência: `src/features/relatorios/pdfVetorial/modelo.ts:1069`
`instrumentos: INSTRUMENTOS_CHECKLIST.map(...)` — e
`folhas.ts:1629` `linhas: m.instrumentos.map(...)`, sem filtro. Na página 11 do PDF do
cliente isso aparece como quatro linhas em branco (termômetro, vacuômetro, pressostato,
transmissor) num documento assinado.

**PRECISA CORREÇÃO: SIM** (só este item).

---

## 4 · NÃO CONFORMIDADE (7.2 / 7.3)

**STATUS: ✅ JÁ CORRIGIDO**

| pergunta | resposta | evidência |
|---|---|---|
| A pergunta aparece na tela de Inspeções? | **sim** | `formularios/ExameNaoConformidade.tsx` → `CabecalhoNaoConformidade`, usado pelo Exame Externo **e** pelo Interno |
| Mobile? | sim — é o mesmo componente; `RespostaSegmentada` é controle segmentado, desenhado para o dedo | — |
| Desktop? | sim, mesmo componente | — |
| SIM = existe NC? | **sim** | `semanticaNc.ts`: `PERGUNTA_NC = 'Foi encontrada alguma não conformidade?'`, `SIGNIFICADO_NC` |
| NÃO = não existe NC? | sim | idem |
| Cores corretas? | sim — `TOM_NC`: SIM em `--crit`, NÃO em `--ok` | `semanticaNc.ts` |
| Resultado geral é derivado? | **sim** — `resultadoNcDerivado(respostas)` | nunca um booleano gravado |
| Resposta geral duplicada? | **não** — a pergunta é CABEÇALHO, não campo | §4-bis |
| Observação exigida quando há NC? | **sim** — NC sem descrição **bloqueia a finalização** | `validacaoFinalizacao.ts` |
| Registro antigo recebe aviso? | **sim** — "Respostas do {exame} precisam de revisão: foram marcadas antes de a pergunta aparecer na tela", e **bloqueia** | `validacaoFinalizacao.ts:171` |
| Sai no PDF? | sim — `folhas.ts:173` `doc.faixa('FOI ENCONTRADA ALGUMA NÃO CONFORMIDADE?')` | `exameNcPdf.test.ts` |

Testes: `semanticaNc.test.ts` (inclui `expect(PERGUNTA_NC).toBe('Foi encontrada alguma não
conformidade?')`), `exameNcPdf.test.ts` (confere no PDF gerado).

**§14 — semântica SIM/NÃO: ✅ confirmada, sem tela divergente.**

**PRECISA CORREÇÃO: NÃO.**

---

## 5 · UNIDADES

### 5.1 · Unidade fixa por equipamento — ✅

Escolhida **só na criação** (§4 do CLAUDE.md). Três escritores e nada mais:
`criarEquipamento`, `importarLinhas`, `injetarDadosDemo`. Travado por
`unidadeSomenteNaCriacao.test.ts` (varre `src/` e `public/` e quebra com um quarto
escritor) e `criacaoComUnidade.test.ts` (22 testes, prova a ordem: unidade **antes** do
`nr13_info_`).

### 5.2 · Teste hidrostático (pág. 16) — ✅

Era o defeito exato da anotação: gráfico em kgf/cm² independentemente do cadastro, e
`PRESSÃO DE PROJETO 10.50` / `PRESSÃO DE TRABALHO 9.48` / `PRESSÃO DE TESTE 13.70` **sem
unidade nenhuma**.

`thUnidades.test.ts` hoje prova, para **SI, Técnico e Petrobras**:
- "as três pressões com unidade no rótulo e o valor certo";
- "gráfico e tabela de leituras na mesma unidade e com os mesmos números";
- "**nenhuma unidade de OUTRO sistema** na folha do TH";
- "**nenhuma pressão do TH com número nu**" ← o §18 do pedido;
- registro antigo sem carimbo: `29,16 kgf/cm²` num equipamento Petrobras sai `28.60 bar`,
  **convertido na apresentação e nunca regravado**.

### 5.3 · Relatório — ✅

`unidadeNoPdf.test.ts`: o documento do equipamento SI traz MPa, o Técnico traz os mesmos
valores em kgf/cm², "uma unidade **não vaza** para o outro equipamento" e "as colunas das
outras unidades **saíram** do documento".

Conferido no relatório que emiti hoje (`REL-1790044230137`, equipamento SI): placa, resumo
de cálculos e memória trazem a coluna **MPa** apenas.

### 5.4 · Categoria NR-13 — ✅ INTACTA

`unidadeNoPdf.test.ts`: "a CATEGORIA NR-13 fica nas unidades da norma, nos dois —
enquadramento em **kPa·m³** e grupo em **MPa·m³**"; "a categoria final é a mesma nos dois
documentos". `thUnidades.test.ts`: "a folha de categorização é **idêntica** nos três
relatórios". Confere com o §17 do pedido — e com a anotação da pág. 3, que aponta
justamente a folha de categorização.

> A anotação 3 ("manter sempre a mesma unidade") aponta a **folha de categorização**. Pela
> regra que você mesmo aprovou (§17), essa folha **não deve** ser convertida. Por isso ela é
> ⚪ **superada** — exceto pelo item 5.5 abaixo, que é o que sobra de real.

### 5.5 · Prontuário — 🟡 DECISÃO SUA

`modeloProntuario.ts:158` e `folhasProntuario.ts:158`: a tabela de pressões do prontuário
imprime **quatro colunas** — `MPa | psi | kgf/cm² | bar`.

Não é bug: é o formato documental clássico do prontuário (tabela de conversão), e o §7 do
CLAUDE.md sempre descreveu a folha assim. Mas **contraria** a frase "manter sempre a mesma
unidade de medida" se você quiser a regra valendo também para o prontuário.

**É uma decisão sua, não um defeito.** Ver "Decisões que precisam de você".

### 5.6 · Varredura PMTA / PTH / PMO

| TELA/DOCUMENTO | FONTE | UNIDADE INTERNA | EXIBIDA | SEGUE O EQUIPAMENTO? | EXCEÇÃO NORMATIVA? | STATUS |
|---|---|---|---|---|---|---|
| Cartão/lista `/equipamentos` | `equipamentos_index.pmta_adotada_mpa` / `pth_adotada_mpa` | MPa | unidade do equip. | SIM | não | ✅ |
| Ficha — "Pressões da Documentação" | `nr13_info_.pmtaAdotadaMpa` etc. | MPa | unidade do equip. | SIM | não | ✅ |
| Relatório — Placa (3) | adotada ?? calculada | MPa | unidade do equip. | SIM | não | ✅ |
| Relatório — Categorização (4) | `nr13_cat_` | kPa / MPa | **kPa·m³ e MPa·m³** | NÃO (proposital) | **SIM** | ✅ |
| Relatório — Dados técnicos (5) | memorial + adotadas | MPa | unidade do equip. | SIM | não | ✅ |
| Relatório — Resumo/Memória (6, 6.1) | `nr13_calc_` | MPa | **MPa/mm escritos** | NÃO (proposital) | **SIM** (memória de cálculo, §4-bis) | ✅ |
| Relatório — TH (7.5) | `container.dados.th` + `th.unidade` | texto digitado | unidade do equip., no rótulo | SIM | não | ✅ |
| Prontuário — tabela de pressões | `pressoesProntuario` | MPa | **MPa + psi + kgf + bar** | NÃO | não | 🟡 |
| Certificado de calibração | unidade do **instrumento**, por grandeza | própria | própria | NÃO (proposital) | **SIM** (§4-ter: unidade é do instrumento, nunca convertida) | ✅ |

**PRECISA CORREÇÃO: parcial** — só o item 5.5, e como decisão.

---

## 6 · OUTRAS ANOTAÇÕES

### Anotação 1 — Portaria (pág. 1) — 🟡 DECISÃO SUA

- **Estado atual:** `folhas.ts:302` imprime `(Portaria nº 1.082, de 18 de dezembro de 2018)`
  como **campo editável** (`id: 'capa.portaria'`, rótulo "Portaria de referência"), com esse
  texto como *default*. Quem precisar citar outra reescreve **naquele relatório**.
- **O que falta:** nada tecnicamente. O que o cliente diz é que o **default** está
  desatualizado. Trocar o default é decisão normativa — **eu não decido qual portaria é a
  vigente**, e chutar isso num documento assinado seria pior do que deixar como está.
- **Ação:** você me diz o texto correto (ou "manter"). É uma linha.
- **Nota:** `folhasProntuario.ts:104` tem a mesma citação, e **não** é editável — se o texto
  mudar, os dois lugares mudam juntos.

### Anotação 2 — ART propaga (pág. 1) — ✅ JÁ CORRIGIDO

A seta aponta o campo `Nº DA A.R.T. (CREA)` **vazio** na capa. O pedido é que preencher ali
preencha em todo o relatório.

Desde 09/09/2026 é exatamente assim: `destinoPendencia.ts:53-54` mapeia **`capa.art`** e
**`inspecao.art`** para a **mesma** fonte (`configuracoes.art` → `meta.art`), e
`folhas.ts:368` documenta: *"a A.R.T. vem das Configurações do Relatório — a MESMA fonte da
folha de exames. Até 09/09/2026 as duas eram campos documentais independentes… e podiam
divergir dentro do mesmo documento."*

**Fora do plano.**

### Anotação 7 — Croqui dos pontos de medição (pág. 15) — ✅ ENTREGUE 22/09/2026

Pedido: *"acrescentar uma escolha de um croqui apontando os pontos de medição de espessura…
cilindro, tipo de tampo"*.

Entregue como folha **7.4.1 MAPA DOS PONTOS DE MEDIÇÃO DE ESPESSURA**, em produção desde
22/09/2026 (bundle `index-BTZprQHv.js`): tampo superior e inferior em planta, costado
planificado, pontos nos ângulos reais, derivado da malha da inspeção — sem editor, sem
chave nova, sem geometria digitada.

Vai **além** do pedido: em vez de escolher um croqui de um catálogo ("os mais utilizados"),
o desenho é **gerado** da medição real — o número de níveis e de ângulos é o que o técnico
configurou (provado em PDF para 4×4, 6×8 e 12×12).

**Fora do plano.**

---

## 7 · DOCUMENTOS HISTÓRICOS (§22) — ✅

A arquitetura continua: finaliza → gera PDF → SHA-256 → upload → grava histórico; reabrir
serve **os bytes** (`pdfRef`), sem remontar (§7-quater). Provado hoje em produção: baixei
`REL-1790044230137` do bucket e o `sha256sum` do arquivo bateu com o código de verificação
mostrado na tela (`a3f6d08c26cc77e8226fc479…`).

Nada do plano abaixo pode reescrever documento finalizado — e, por construção, não
consegue: a trava é no banco (§4-quinquies).

---

## 8 · RESUMO

**✅ Já corrigidos (fora do plano)**
1. Logo do certificado — individual, anexado e nos bytes arquivados
2. Assinatura/responsável no certificado, com imutabilidade
3. Pergunta "Foi encontrada alguma não conformidade?" na tela de Inspeções (externo e interno)
4. Semântica SIM = há NC; resultado derivado; observação obrigatória; aviso em registro legado
5. TH na unidade do equipamento — gráfico, eixo, rótulos, pontos e tabela
6. Nenhuma pressão do TH com número nu
7. Relatório na unidade do equipamento, sem vazamento de outra unidade
8. Unidade fixa por equipamento, escolhida só na criação
9. ART preenchida uma vez vale no documento inteiro
10. Croqui dos pontos de medição (7.4.1)
11. Documentos históricos servidos pelos bytes arquivados

**🟡 Parcialmente corrigidos**
1. **Quadro 7.1.1** — a cadeia instrumento→calibração→snapshot existe e funciona; falta só
   **não imprimir as linhas dos dispositivos que não existem**
2. **Prontuário** — tabela de pressões em 4 unidades (decisão sua)
3. **Portaria** — campo editável existe; o *default* é o que o cliente diz estar
   desatualizado (decisão sua)

**🔴 Pendentes**
1. Filtro das linhas do quadro 7.1.1 (é o único item puramente técnico)

**⚪ Superados por arquitetura nova**
1. "Acrescentar um campo para calibração de terceiros" — hoje é um **módulo** completo
   (`origem: 'terceiro'`, PDF original preservado, SHA, snapshot, Portal), não um campo
2. "Manter a mesma unidade" **na folha de categorização** — a categoria fica nas unidades da
   norma por decisão aprovada (§17)
3. "Escolher um croqui de um catálogo" — o croqui é gerado da malha real

---

## 9 · PLANO (somente 🟡 e 🔴)

### P0 — risco técnico/documental
*Nenhum item.* Nada aqui ameaça integridade, imutabilidade ou dado de cliente.

### P1 — impacto direto no trabalho de campo / documento entregue

**P1.1 · Quadro 7.1.1 mostra só o que existe** 🔴

- **Regra proposta:** a linha entra se **(a)** tem vínculo de calibração
  (`instrumentosRef[id]`), **ou (b)** `checklist.instrumentos[id]` está marcado (POSSUI
  manual). Some se não tem nenhum dos dois.
- **Guarda que eu recomendo:** se **nenhuma** linha sobrar, não imprimir uma tabela vazia —
  imprimir a faixa com "Nenhum instrumento ou dispositivo de segurança declarado nesta
  inspeção". Tabela vazia e seção ausente são coisas diferentes num documento assinado, e a
  frase é o que distingue "não tem" de "esqueceram de preencher".
- **Retrocompatibilidade — o ponto que exige cuidado:** inspeção antiga que **não marcou
  nada** hoje imprime 6 linhas vazias; com a regra nova imprimiria zero. Isso **muda o
  documento** de um rascunho antigo ao reabrir. Documento **finalizado** não é afetado (serve
  os bytes), mas rascunho sim. Proponho que a regra valha para todos os rascunhos e que a
  mudança seja declarada — a alternativa (regra só para inspeções novas) exige um carimbo de
  versão no container, que é complexidade maior do que o problema.
- **Onde mexe:** `pdfVetorial/modelo.ts` (~linha 1069, onde `INSTRUMENTOS_CHECKLIST.map`
  monta `m.instrumentos`) e `pdfVetorial/folhas.ts` (~1624, a faixa e a tabela). O filtro
  deve ficar no **modelo**, não na folha: assim o sumário e qualquer outro leitor enxergam a
  mesma lista.
- **Não mexe em:** `quadroInstrumentos.ts`, `instrumentos.ts`, formulário de checklist,
  banco. O formulário continua oferecendo os 6 — quem some é a linha do *relatório*.
- **Migration:** **não**.
- **Testes necessários:** (1) equipamento só com manômetro e PSV → tabela com 2 linhas, sem
  termômetro/vacuômetro/pressostato/transmissor; (2) nenhum declarado → frase, sem tabela;
  (3) linha com vínculo mas POSSUI não marcado → entra; (4) relatório finalizado antes da
  mudança → bytes idênticos (SHA); (5) o teste existente `quadroInstrumentos.test.ts`
  continua verde.

### P2 — UX / qualidade documental

**P2.1 · Prontuário: pressões na unidade do equipamento** 🟡 *(depende de decisão sua)*
- Hoje: 4 colunas (`MPa | psi | kgf/cm² | bar`) em `folhasProntuario.ts:158`.
- Opções: **(a)** manter as 4 (é tabela de conversão, formato clássico); **(b)** só a unidade
  do equipamento; **(c)** a do equipamento em destaque + as outras menores.
- Migration: não. Testes: prontuário dos 3 sistemas + "nenhuma outra unidade na folha" se
  escolher (b).

**P2.2 · Texto da portaria** 🟡 *(depende de decisão sua)*
- Trocar o *default* em `folhas.ts:302` e a citação de `folhasProntuario.ts:104` — **um lugar
  só não basta**, e a do prontuário não é editável hoje.
- Migration: não. Documento já emitido não muda (bytes).

### P3 — opcional
**P3.1 · Paridade dos demais ensaios avulsos** — hoje só o ultrassom tem teste que gera os
dois PDFs (avulso × relatório) e compara texto. Estender o mesmo molde a checklist, visual
externo/interno e TH. Não é item do PDF do cliente; é dívida que eu declarei na rodada
anterior.

---

## 10 · FECHAMENTO

**ARQUIVOS/CAMADAS QUE SERIAM ALTERADOS (se o plano for aprovado)**
- `src/features/relatorios/pdfVetorial/modelo.ts` — filtro de `m.instrumentos` (P1.1)
- `src/features/relatorios/pdfVetorial/folhas.ts` — faixa/tabela 7.1.1 (P1.1); texto da
  portaria (P2.2)
- `src/features/relatorios/pdfVetorial/folhasProntuario.ts` — colunas de pressão (P2.1);
  citação da portaria (P2.2)
- Testes novos em `src/features/relatorios/pdfVetorial/`

**MIGRATION PREVISTA:** **NÃO.** Nenhum item do plano precisa de SQL, coluna nova ou chave
nova de storage.

**RISCO**
- P1.1 muda o **layout de um documento técnico**. Relatório finalizado é imune (bytes), mas
  rascunho antigo reaberto passa a sair diferente. É o risco real, e é declarado.
- P2.1/P2.2 são texto e colunas — risco baixo, mas mexem em documento assinado, então valem
  o mesmo cuidado: nada de retrofit.

**TESTES QUE A IMPLEMENTAÇÃO FUTURA PRECISARÁ**
1. 7.1.1 com subconjunto de instrumentos (2 de 6)
2. 7.1.1 sem nenhum instrumento → frase, não tabela vazia
3. POSSUI manual sem vínculo → linha entra
4. SHA de um relatório finalizado antes/depois → idêntico
5. Prontuário nos 3 sistemas de unidade (se P2.1 for aprovado)
6. Suíte completa verde (hoje: 250 arquivos / 3762 testes)

**DECISÕES QUE PRECISAM DE VOCÊ**
1. **Portaria:** qual texto deve ser o default? (ou "manter 1.082/2018")
2. **Prontuário:** manter as 4 unidades, ou passar a imprimir só a do equipamento?
3. **7.1.1 sem nenhum instrumento:** frase "nenhum declarado" ou seção inteira ausente?
4. **Rascunhos antigos:** aceita que reabrir um rascunho antigo passe a mostrar o quadro
   filtrado?

---

*Auditoria feita em 22/09/2026. Nenhum código, banco, documento ou ambiente foi alterado
nesta rodada.*
