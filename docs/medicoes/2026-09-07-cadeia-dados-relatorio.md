# Cadeia de dados do Relatório de Inspeção — auditoria, matriz e correção

**Data:** 07/09/2026 · **Escopo:** `FICHA → CÁLCULO → CATEGORIA → INSPEÇÃO → MODELO → PRÉVIA → PDF`
**Motor:** vetorial (Modelo Novo). O raster não foi tocado e continua sendo rollback de um passo.

---

## 1. O que estava errado, e por que ninguém via

Os dados **estavam salvos**. O defeito inteiro mora numa camada só: o
**leitor** do documento vetorial (`pdfVetorial/modelo.ts` + `pdfVetorial/documento.ts`),
que lê chaves e campos com nomes que o sistema nunca gravou.

Um leitor com o nome errado devolve `null`. `null` no modelo vira travessão na
folha. E travessão na folha é **indistinguível de "o usuário não preencheu"** —
nenhum erro, nenhum log, nada em "O que falta". Por isso o defeito sobreviveu a
uma emissão em produção e a um gate de conferência: `conferencia.ts` recebe o
modelo e compara o modelo **consigo mesmo**.

São **seis** causas independentes, não uma:

| # | Onde | O que o sistema grava | O que o leitor procurava | Campos que ficavam em branco |
|---|---|---|---|---|
| 1 | `modelo.ts` | `nr13_fotos_<TAG>` = **lista** de `{id, src, ref, isCapa}` | objeto `{capa, fotos[].base64}` | **foto de capa, em 100% dos relatórios** |
| 2 | `modelo.ts` | `nr13_info_.pmtaAdotadaMpa` / `.pthAdotadaMpa` (pressões da documentação) | só `nr13_calc_` | **PMTA e PTH** — tabela de pressões, prontuário, categorização e placa, em todo equipamento sem memorial |
| 3 | `modelo.ts` | `componentes[].tipo` = `cilindrico` / `eliptico` / … | `"casco"`, `"costado"`, `tipo.includes("tampo")` | **material do corpo, margem de corrosão, temperatura de projeto, material dos 2 tampos** |
| 4 | `modelo.ts` | memorial de autoclave em `nr13_vaso_ac_corpo_`, de caldeira em `nr13_vaso_cald_` | só `nr13_vaso_` | **folha 5 inteira**, para autoclave e caldeira |
| 5 | `modelo.ts` | instrumento padrão em `nr13_rastreab_<id>`, por `tipoInstrumento` | `ultrassom.instrumento` / `th.instrumento` do container (campo que formulário nenhum grava) | **"INSTRUMENTO DE MEDIÇÃO UTILIZADO"** nas folhas de ultrassom e de TH — num documento que afirma rastreabilidade metrológica |
| 6 | `documento.ts` | — | `blocoAteOFim` fixava o valor automático em `''` | **comentários da documentação, observações gerais do exame externo, do interno e do ultrassom** — tudo digitado em campo |

Defeito menor, corrigido junto: a data da inspeção saía do `<input type="date">`
em ISO (`2026-09-07`) num documento em português.

---

## 2. Matriz FONTE → RELATÓRIO

Legenda de **precedência**: o primeiro item vence.
`OVR` = o campo aceita override manual do rascunho (13D-bis).
**Antes** = chegava ao documento antes desta correção.

### 2.1 Identificação (folha 3) — `nr13_info_<TAG>` e `nr13_cat_<TAG>`

| Campo do relatório | Fonte | Chave · campo | Transformação | Fallback | OVR | Antes | Agora |
|---|---|---|---|---|---|---|---|
| T.A.G. | ficha | a própria TAG | — | — | ✓ | OK | OK |
| Tipo de equipamento | ficha | `nr13_info_.tipo` | `rotuloTipoEquipamento` | `.descricao` | ✓ | OK | OK |
| Fabricante | ficha | `nr13_info_.fabricante` | — | vazio | ✓ | OK | OK |
| Nº de série | ficha | `nr13_info_.numeroSerie` | — | vazio | ✓ | OK | OK |
| Ano de fabricação | ficha | `nr13_info_.ano` | — | vazio | ✓ | OK | OK |
| Código de projeto | ficha | `nr13_info_.codigoProjeto` | — | vazio | ✓ | OK | OK |
| Local da instalação | ficha | `nr13_info_.localizacao` | — | vazio | ✓ | OK | OK |
| Fluido de operação | categoria | `nr13_cat_.fluidoInput` | tira o prefixo da classe | `info.fluido` | ✓ | OK (13A) | OK |
| Classe do fluido | categoria | `nr13_cat_.classe` | `Classe X` | vazio | ✓ | OK (13A) | OK |
| Volume (m³) | categoria | `nr13_cat_.volInput` | pt-BR | — | ✓ | OK (13A) | OK |
| Grupo de risco | categoria | `nr13_cat_.grupo` | — | vazio | ✓ | OK | OK |
| Categoria do vaso | categoria | `nr13_cat_.catFinal` | — | vazio | ✓ | OK | OK |
| **Foto de capa** | ficha | `nr13_fotos_<TAG>[]` · `isCapa` → `src` \| `ref` | cofre → dataURL | 1ª foto | ✓ (imagem) | **✗ NUNCA** | **OK** |

### 2.2 Pressões (folhas 3, 5 e placa)

| Campo | Precedência | Transformação | OVR | Antes | Agora |
|---|---|---|---|---|---|
| **PMTA** | `info.pmtaAdotadaMpa` → `calc.pmta` | MPa → kgf/cm², bar, psi | ✓ | **só a calculada** | **OK** |
| **PTH** | `info.pthAdotadaMpa` → `calc.pth` | idem | ✓ | **só a calculada** | **OK** |
| PMO | `info.pmoAdotadaMpa` | idem | ✓ | OK | OK |

> **PTH NÃO é derivada de PMTA aqui.** Vaso usa 1,3 e caldeira 1,5 (§3 do
> CLAUDE.md) — o fator é do motor do memorial. Multiplicar no gerador criaria
> uma segunda verdade, e ela estaria errada para caldeira. Os templates HTML
> antigos fazem esse `× 1,3` cego; o vetorial não repete o defeito.

### 2.3 Dados técnicos / prontuário (folha 5)

| Campo | Fonte | Chave · campo | Fallback | OVR | Antes | Agora |
|---|---|---|---|---|---|---|
| Contratante | cliente | `nr13_emp_.razaoSocial` | `.nomeFantasia` | ✓ | OK | OK |
| Endereço | cliente | `endereco, bairro, cidade, estado` | — | ✓ | OK | OK |
| **Material do corpo** | memorial | componente `id=casco` · `dados.mat` | `info.materialCorpo` | ✓ | **✗** | **OK** |
| **Margem de corrosão** | memorial | casco · `dados.ca` | — | ✓ | **✗** | **OK** |
| **Temperatura de projeto** | memorial | casco · `dados.temp` | — | ✓ | **✗** | **OK** |
| **Material dos tampos 1/2** | memorial | `id=tampo1/tampo2` · `dados.mat` | — | ✓ | **✗** | **OK** |
| Pressão de projeto | memorial | `nr13_vaso_.P` | — | ✓ | OK | OK |
| Tipo de construção | ficha | `nr13_info_.tipoConstrucao` | — | ✓ | OK | OK |
| Descrição resumida | ficha | `.descricaoResumida` | `.descricao` | ✓ | OK | OK |
| Volume | categoria | `nr13_cat_.volInput` | — | ✓ | OK | OK |

Chave do memorial, por tipo: `nr13_vaso_<TAG>` (vaso) → `nr13_vaso_ac_corpo_<TAG>`
(autoclave) → `nr13_vaso_cald_<TAG>` (caldeira). **Antes só a primeira era lida.**

### 2.4 Categorização (folha 4) — LEITURA, nunca recálculo

| Campo | Chave · campo | Antes | Agora |
|---|---|---|---|
| P×V do enquadramento (kPa·m³) | `nr13_cat_.PV_enq` | OK | OK |
| Resultado do enquadramento | `.isEnquadrado` | OK (13A) | OK |
| P×V do grupo (MPa·m³) | `.PV_cat` | OK | OK |
| Grupo de risco | `.grupo` | OK | OK |
| Categoria final | `.catFinal` | OK | OK |
| Operador treinado | derivado de `catFinal ∈ {I, II}` (Anexo I-B) | OK | OK |

> **Uma fórmula só.** `calc/categoria.ts` é o motor; `calcularESalvarCategoria`
> grava; o documento LÊ. Não há segunda conta no gerador, e o gate
> `cadeiaDados.test.ts` prova que motor, dado salvo e documento dão o mesmo
> resultado a partir da mesma entrada — a exigência "tela ≠ motor ≠ PDF" do
> pedido.
>
> **Sem `nr13_cat_` não há como derivar**: o VOLUME do equipamento só existe
> dentro dessa chave (`volInput`) — `InfoEquipamento` não tem campo de volume.
> Faltando a categorização, o campo sai vazio e entra em "O que falta"; inventar
> categoria seria pior que o vazio.

### 2.5 Inspeção — `nr13_inspecao_atual` / `nr13_injecao_atual`

| Campo | Bloco do container | Antes | Agora |
|---|---|---|---|
| Checklist (itens, marcação, observação por item) | `checklist.respostas` / `.observacoes` | OK | OK |
| **Comentários sobre a documentação** | `checklist.comentariosDocumentacao` | **✗ (bloco vazio)** | **OK** |
| Fotos da documentação / do checklist | `checklist.fotosDocumentacao` / `.fotos` | OK | OK |
| Data da inspeção | `checklist.dataInspecao` | ISO cru | **pt-BR** |
| Exame ext./int. — itens e observação por item | `visual_*.itens` / `.itemObs` | OK | OK |
| Exame ext./int. — conclusão | `visual_*.conclusao` | OK | OK |
| Exame ext./int. — resultado | `visual_*.resultado` | OK | OK |
| **Exame ext./int. — observações gerais** | `visual_*.observacoes` | **✗ (bloco vazio)** | **OK** |
| Exame ext./int. — fotos | `visual_*.fotos` (base64 ou `ref`) | OK | OK |
| Ensaios realizados (X na folha 7) | derivado das respostas de cada bloco | OK | OK |

### 2.6 Ultrassom / medição de espessura (folha 7.4)

| Campo | Fonte | Antes | Agora |
|---|---|---|---|
| Pontos, ângulos, medidas, menor | `nr13_med_grid_<TAG>` → `injecao.ultrassom.medidas` | OK (13D) | OK |
| Espessura requerida | `nr13_med_esp_.pontos[].espMinRequerida` | OK | OK |
| Equipamento / área / material / esp. nominal / data | `injecao.ultrassom.*` | OK | OK |
| Aparelho, acoplante, temp., estado, cabeçote, vel. sônica | `injecao.ultrassom.*` (pré-preenchidos do padrão por `autoPreencher`) | OK | OK |
| **Padrão / nº série / nº certificado / validade** | `nr13_rastreab_` · `tipoInstrumento='ultrassom'` | **✗** | **OK** |
| **Observações / conclusões do ensaio** | bloco livre (sem campo no formulário) | **✗** | **manual, e agora ligado** |

### 2.7 Teste hidrostático (folha 7.5)

| Campo | Fonte | Antes | Agora |
|---|---|---|---|
| Cliente, doc nº, equipamento, data, pressões, fluido, resultado, curva, fotos | `injecao.th.*` | OK | OK |
| **Padrão / série / certificado / validade** | `nr13_rastreab_` · `tipoInstrumento='manometro'` | **✗** | **OK** |
| **Parecer técnico** | bloco livre | **✗** | **ligado** (sem fonte automática — ver §4) |
| Pressão de trabalho, duração, temp. do fluido, normas, validade do laudo, procedimento | — | manual | manual (ver §4) |

### 2.8 Empresa executante, assinatura e capa

| Campo | Fonte | Observação |
|---|---|---|
| Razão, endereço, contato, logo | `meta.empresa` (snapshot §7-bis) → `nr13_minha_empresa` | congelado na geração |
| Engenheiro / técnico, CREA, rubrica | `meta.assinantes` → `nr13_lista_phs` | congelado na geração |
| Nº do relatório, emissão, validade, execução, próximas inspeções | `nr13_relatorio_meta_atual` | modal Configurações |

---

## 3. Precedência, campo a campo

Vale para **todo** campo do documento, e é uma regra só:

```
1. override manual do RASCUNHO (13D-bis)      ← manda; `branco` = vazio de propósito
2. dado da INSPEÇÃO selecionada               ← quando o campo é da inspeção
3. dado oficial da FICHA / CÁLCULO / CATEGORIA ← quando o campo é do equipamento
4. dado do CLIENTE / EMPRESA
5. vazio (travessão; amarelo na prévia)
```

Duas exceções deliberadas, ambas de **precedência interna** ao passo 3:

- **Pressões:** a ADOTADA da documentação vence a calculada pelo memorial
  (`info.pmtaAdotadaMpa` > `calc.pmta`). É a regra que `PLACA.html` e
  `PRONTUARIO.html` sempre tiveram, e o vetorial agora a acompanha.
- **Instrumento do ensaio:** o que estiver no container vence o cadastro de
  Certificados. O inspetor que digitou na folha corrige o padrão daquele ensaio.

**Override nunca escreve na fonte.** Ele mora em `nr13_ovr_<id>_<TAG>` e não toca
ficha, cliente, memorial, categoria nem inspeção — provado por teste
(`emissaoVetorial.test.ts`, "override do relatório NÃO altera a ficha nem a
inspeção"). String vazia é `branco`, um terceiro estado: o valor automático **não**
volta sozinho.

---

## 4. O que continua vazio, e por quê

Nem todo travessão é defeito. Estes campos **não têm fonte no sistema** — não
existe tela onde o usuário os preencha —, então nascem vazios, amarelos na
prévia, e são escritos direto no documento:

| Campo | Situação |
|---|---|
| Escopo e observações da inspeção (2.1) | texto do engenheiro, por relatório |
| Observações sobre a categorização | idem |
| Observações e pendências do prontuário | idem |
| Observações do checklist, partes 1 e 2 | idem |
| Observações / conclusões do ultrassom | o formulário de ultrassom não tem campo de observação |
| Parecer técnico do TH | o formulário de TH não tem campo de parecer |
| TH: pressão de trabalho, duração, temperatura do fluido, normas, validade do laudo, procedimento | o formulário de TH não coleta esses seis campos (a folha HTML antiga também os deixava `contenteditable` puro) |
| A.R.T. | não há campo de A.R.T. em lugar nenhum do sistema |
| Recomendações de segurança | texto do engenheiro |

Isto é **pendência do usuário**, não perda de dado — a distinção que o pedido
exige. Quem quiser fechar os seis campos do TH precisa acrescentá-los ao
`FormularioTH`, e aí eles entram na matriz §2.7 como automáticos.

**Fora de escopo declarado:** a seção **12 · REGISTRO DE SEGURANÇA** da
referência não é emitida pelo gerador vetorial — é o Livro de Registro, que esta
rodada não podia tocar.

---

## 5. Os gates

| arquivo | o que trava |
|---|---|
| `pdfVetorial/cadeiaDados.test.ts` (29) | **fonte → modelo**: grava dado real no storage, monta o modelo e exige que o dado tenha chegado. Cobre foto de capa, pressões adotadas, casco/tampos, os três tipos de equipamento, identificação, cliente, categorização (motor = documento), inspeção, isolamento entre TAGs e entre inspeções, ultrassom, instrumento padrão e TH |
| `pdfVetorial/emissaoVetorial.test.ts` (13) | **modelo → papel**: gera o PDF de verdade (duas passagens, Carlito do disco) e afirma sobre `editaveis`, que é o registro do que foi escrito em cada posição. Cobre os quatro blocos de texto livre, o instrumento nas duas folhas, a placa reconstruída, a troca por foto e a volta, o override, a string vazia, a composição e a paridade prévia = emissão. Mede o arquivo: `FontFile2` presente e imagens só onde há foto |
| `pdfVetorial/storageParaModelo.test.ts` (18) | o gate anterior, de 13A — mantido |

O primeiro **falhava em 14 dos 29** antes da correção; o segundo, em 2 de 13.

---

## 6. Medição do PDF emitido

Documento de teste com 14 folhas selecionadas, ficha completa, inspeção com
checklist + exame externo + exame interno + ultrassom (2 pontos × 4 ângulos) +
TH, 3 fotos:

| medida | valor |
|---|---|
| páginas | 11 |
| bytes | 90.568 (~8 KB/página) |
| geração (2 passagens, node) | ~150 ms |
| imagens no arquivo (`/Subtype /Image`) | 3 — capa + 1 foto por exame |
| fonte embutida | `/FontFile2` presente, `/Type0` (CIDFontType2) |
| texto | vetorial e selecionável; nenhuma página rasterizada |

O número de imagens ser **menor que o de páginas** é a prova mecânica de que
nenhuma folha virou fotografia: no motor raster ele seria ≥ o total de páginas.

---

## 7. E2E em produção — o documento emitido

Rodado em 07/09/2026 contra `app.nr13sistema.com.br`, bundle `index-Cvn4SIgw.js`
(o deploy desta correção), organização de teste, equipamento **ZZ-REL-E2E**
criado para isto. Nenhum equipamento real foi tocado.

### O caminho, na ordem em que o usuário o percorre

| passo | resultado |
|---|---|
| criar equipamento, preencher a ficha (10 campos sentinela) | salvo; **F5 → tudo permanece** |
| pressões da documentação: PMTA 0,8 · PMO 0,6 · PTH 1,04 MPa | salvas |
| categoria: 1,25 m³ × 0,8 MPa, fluido inflamável | Classe A · Grupo 4 · **Categoria III** · P×V 1000 kPa·m³ · ENQUADRA |
| memorial ASME VIII (3 componentes, materiais sentinela) | **PMTA calculada 1,17 MPa**, PTH 1,52, APROVADO; F5 → permanece |
| foto de identificação | enviada ao cofre |
| container de inspeção com os 5 ensaios | checklist (15 itens + comentários), exame externo, exame interno, ultrassom (6 pontos × 4 ângulos), TH (curva de 3 pontos) |
| F5 na inspeção | **5/5 "Preenchido"** |
| criar relatório → equipamento → inspeção A → 17 documentos | rascunho, prévia vetorial de 18 páginas |

### O que o documento mostra (lido campo a campo na prévia, em produção)

| campo | valor no documento | era antes |
|---|---|---|
| Foto de capa | **a foto enviada** | **em branco** |
| MATERIAL DO CORPO | `MATERIAL-CASCO-E2E` | **em branco** |
| MATERIAL DO TAMPO 1 / 2 | `MATERIAL-TAMPO1-E2E` / `MATERIAL-TAMPO2-E2E` | **em branco** |
| MARGEM DE CORROSÃO | `1.6` | **em branco** |
| TEMPERATURA DE PROJETO | `120` | **em branco** |
| Placa — PMTA / PTH | **8.16 / 10.61 kgf/cm²** (a ADOTADA, 0,8/1,04 MPa — não a calculada 1,17) | **em branco** |
| Instrumento padrão (ultrassom) | `ZZ-TESTE-F6 Bloco padrão` · série `F6-0001` · cert. `ZZ-F6-001` · val. `07/12/2026` | **quatro travessões** |
| Comentários sobre a documentação | `COMENTARIO-DOC-E2E` | **caixa vazia** |
| Observações gerais (externo / interno) | `OBSERVACOES-VE-E2E` / `OBSERVACOES-VI-E2E` | **caixa vazia** |
| Fabricante, nº de série, cód. projeto, local, cliente, categoria | todos os sentinelas | já chegavam |

"O que falta" listou 4 pendências **reais** (validade, laudo, próximas datas) e
foi a **zero** depois de preenchidas. Nenhum campo corrigido apareceu ali —
que é a distinção que o gate protege: perda de dado não é pendência do usuário.

### Placa e overrides

- placa nasce **RECONSTRUÍDA** — 10 campos de texto vetorial, clicáveis;
- "Escolher imagem" no bloco da placa → a foto substitui e os 10 campos somem
  (585 → 575 áreas editáveis);
- "Remover imagem" → **a reconstruída volta** (575 → 585);
- override de FABRICANTE → `FABRICANTE-OVERRIDE-E2E`, "1 campo alterado";
  **sobreviveu ao F5** e à reabertura do rascunho pela lista;
- a FICHA continuou com `FABRICANTE-E2E-2026` — o override não vazou para o cadastro.

### A emissão

```
pdfRef   inspecao/99f642d3-…/relatorios/29374b57-5600-45b2-b003-0b3b5e7ee317.pdf
sha256   8f3d52905baba945c247b737d34f37877c23882487fd338365841253f1f549a9
páginas  19 (18 do corpo + 1 do certificado do padrão anexado)
bytes    97.542  (~5 KB/página)
pdfPendente  false
```

O arquivo **baixado do bucket** tem 97.542 bytes e SHA-256
`8f3d5290…f549a9` — **idêntico** ao gravado no registro.

Texto extraído do PDF final com pdf.js: **24.747 caracteres em 19 páginas**, e
todos os sentinelas presentes — inclusive os quatro blocos de texto livre, o
instrumento padrão, os três materiais e as pressões adotadas. Texto real,
selecionável; nenhuma página rasterizada.

O **sumário traz as páginas reais** (2, 3, 4, 5, 7, 9, 10…18), calculadas na 1ª
passagem — não números fixos. E não anuncia seção fotográfica, porque esta
inspeção não teve foto de exame.

Reaberto pela lista **em aba nova**, sem passar por ficha, memorial ou inspeção:
selo "Documento arquivado", 19 páginas, **zero** áreas editáveis e nenhum botão
de edição. Serve o arquivo; não remonta nada (§7-quater).

### O que NÃO foi executado, e por quê

- **Cache frio total** (limpar o IndexedDB e reidratar do servidor): a conta
  tinha **3 escritas pendentes de sincronização** que não são deste teste, e
  apagar o cache local as descartaria. O gate de unidade cobre a mesma
  propriedade — `cadeiaDados.test.ts` monta o modelo a partir de um storage
  recém-criado, sem nenhuma tela ter sido aberta antes. A reabertura em aba
  nova, acima, cobre a parte que dava para cobrir sem risco.
- **Fotos de exame**: a inspeção foi salva sem fotos de VE/VI/TH, então o
  documento saiu sem folha de registro fotográfico — que é o comportamento
  correto (§5: zero fotos, zero folhas). A regra das 4 por folha está coberta
  por teste (`pdfVetorial.test.ts`).
- **Instrumento padrão do TH**: saiu com travessão porque esta organização
  **não tem certificado do tipo `manometro`** cadastrado. Ausência real da
  fonte, não perda de dado — cadastrar um faz o bloco preencher, pelo mesmo
  caminho que o do ultrassom preencheu.

### Defeito encontrado no caminho (fora do escopo desta correção)

`MemorialVaso.salvar()` chama `alert()` quando a validação falha
(`MemorialVaso.tsx:236` e `:239`). Um `alert()` **congela a aba inteira** — CDP,
automação e a própria interface param até alguém clicar OK. Custou três
tentativas de salvar o memorial neste E2E, e para um usuário de campo com o
celular na mão o sintoma é "o sistema travou". Trocar por `emitirAviso` (que o
mesmo arquivo já usa no sucesso) resolve. **Não alterado nesta rodada** — está
fora do que foi pedido.

---

## 8. Fechamento das pendências (07/09/2026, mesma data)

As três pendências que a §7 registrou foram resolvidas. O pipeline
ficha → inspeção → relatório **não foi reaberto**.

### 8.1 · Memorial: o `alert()` saiu

`alert()` e `confirm()` **param o renderer** — nada pinta, nada responde, e a
aba parece travada. As três telas (vaso, caldeira, autoclave) tinham o mesmo
trio no `salvar()`: dois `alert` de validação e um `confirm` de "salvar mesmo?".

Os avisos vão agora por `emitirAviso` → `ModalAviso`, o mesmo caminho que essas
telas já usavam para o sucesso e para o erro de gravação (`avisoMemorial.ts`).
O `confirm` saiu inteiro: pedia confirmação de uma ação que o usuário acabara de
pedir clicando em **Salvar**, e cujo resultado já é anunciado.

**A validação continua impedindo o salvamento** — só o veículo mudou.

Medido em produção: cálculo gerado, temperatura do tampo apagada, clique em
Salvar → modal do app **"Preencha os seguintes campos antes de salvar · Tampo
Esquerdo: Temperatura"**, campo marcado em amarelo na tela, e a aba respondeu em
**1.983 ms** (o tempo do próprio `sleep` do teste). Antes: minutos de CDP morto.

### 8.2 · Teste hidrostático: sete campos

`pressaoTrabalho`, `duracao`, `tempFluido`, `normas`, `validadeLaudo`,
`procedimento` e `parecer` já eram lidos pelo modelo e desenhados na folha 7.5 —
faltava quem os coletasse. Entraram no `DadosTH` com **os nomes que o modelo já
lê**, dentro do mesmo `dados.th` do container: nenhuma chave nova.

`pressaoTrabalho` **não virou fonte nova**: nasce pré-preenchida da **PMO
adotada** na ficha, pelo mesmo caminho que a pressão de projeto já usava a PMTA.
Medido: PMO 0,6 MPa → campo abriu com **6.12 kgf/cm²**.

`normas` nasce com `ASME VIII Div.1 / NR-13` — o mesmo texto que a folha HTML
antiga trazia impresso, e editável.

### 8.3 · Ultrassom: observações

Um campo, mesma história: a folha 7.4 tem o bloco, o modelo lê
`ultrassom.observacoes`, o formulário não coletava.

### 8.4 · Resíduo achado ao conferir o PDF

A validade do laudo saiu **`2031-09-07`** na mesma tabela em que a data do teste
saía `07/09/2026` — o campo é `<input type="date">` e era o único dos campos de
data do TH sem `dataBr`. Corrigido e reemitido.

### 8.5 · E2E cirúrgico (só os caminhos alterados)

Container `INSPECAO-A-E2E` do `ZZ-REL-E2E`, já existente. Os campos novos
apareceram num ensaio **gravado antes desta rodada** — a compatibilidade com
dado antigo é o primeiro resultado.

| | |
|---|---|
| preencher TH (duração, temp., validade, procedimento, parecer) + observação do US | salvo, sem diálogo nativo |
| **F5 nos dois ensaios** | `6.12 · 30 min · 22 °C · ASME VIII Div.1 / NR-13 · 2031-09-07 · PROCEDIMENTO-TH-E2E · PARECER-TH-E2E` e `OBSERVACOES-US-E2E` |
| relatório novo → finalizar | 19 páginas |

```
pdfRef   inspecao/…/relatorios/9604aed1-cef6-44f0-8c7d-1ce635f79fe7.pdf
sha256   e4f4b3f9247b41e00c0bb1ec66beb48a9b8f8882ce4ae1fa582c1c593f952b49
bytes    97.525   ·   páginas 19   ·   pdfPendente false
```

Arquivo baixado do bucket: **SHA idêntico**. Texto extraído: 23.083 caracteres —
vetorial e selecionável. A folha 7.5, lida do PDF final:

> PRESSÃO DE PROJETO 8.16 · **PRESSÃO DE TRABALHO 6.12** · FLUIDO DE TESTE … ·
> PRESSÃO DE TESTE 10.61 · **DURAÇÃO DO TESTE 30 min** · **TEMP. DO FLUIDO 22 °C** ·
> **NORMAS DE REFERÊNCIA ASME VIII Div.1 / NR-13** · **VALIDADE DO LAUDO 07/09/2031** ·
> **PROCEDIMENTO PROCEDIMENTO-TH-E2E** · DATA DO TESTE 07/09/2026 · RESULTADO APROVADO

`PARECER-TH-E2E` e `OBSERVACOES-US-E2E` presentes; nenhum `2031-09-07` no arquivo.

### 8.6 · O que segue pendente

- **Prova de cache frio**: continua adiada. A conta ainda tem **3 escritas
  pendentes de sincronização que não são deste teste**, e apagar o IndexedDB as
  descartaria. Fazer quando a fila estiver limpa.
- **Três `window.confirm` fora do fluxo `salvar()`** congelam a aba do mesmo
  jeito: "Remover este bocal do memorial?" (`MemorialVaso.tsx:193`), "Limpar
  todos os campos da calculadora?" (`:220`) e o de sair sem salvar
  (`useAvisoSairSemSalvar.ts:17`). Ficaram de fora porque são confirmações
  destrutivas e trocá-las muda o gesto do usuário — não era o que esta rodada
  pedia.
- **`FLUIDO DE TESTE` sai com o prefixo da classe** (`A - Fluido inflamável…`)
  porque o prefill copia `cat.fluidoInput` inteiro. É dado do ensaio e o usuário
  edita; não foi tocado por estar fora do escopo.
