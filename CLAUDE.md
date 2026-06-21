# CLAUDE.md — Sistema NR-13 (estrutura fixa do sistema)

Este arquivo é a **fonte de verdade** do sistema. Toda implementação, folha de relatório/prontuário,
formulário de inspeção e regra de injeção de dados DEVE respeitar o que está aqui. A ordem dos
documentos no relatório DEVE seguir a seção "Organização do Relatório".

---

## 1. Objetivo e fluxo do usuário

O sistema torna a inspeção NR-13 e a elaboração da documentação **mais rápida e fácil**. Fluxo real:

1. **Em campo (celular):** o usuário abre o botão **"Inspeções"**, preenche as ferramentas de
   inspeção (checklist, visual externo/interno, ultrassom/ME, teste hidrostático) respondendo
   perguntas e anexando fotos com descrição. Salva no container de inspeção.
2. **No escritório (computador):** o usuário gera a documentação. O sistema **puxa automaticamente**
   tudo que foi salvo (ficha do equipamento, memorial, cadastro da empresa/funcionários, cadastro do
   cliente, dados de campo) e monta as folhas do relatório e do prontuário, com assinatura do
   engenheiro responsável.

Por isso: **as telas de inspeção precisam ser 100% responsivas para mobile**, e os dados delas são
**injetados** nas folhas que geram o relatório e o prontuário.

---

## 2. Stack e arquitetura

- React 19 + TypeScript + Vite. Estado em Zustand. Rotas em `react-router-dom`.
- PDF: `html2canvas` + `jspdf` (A4 210×297mm, JPEG 0.95) — `src/features/relatorios/pdfService.ts`.
- **As folhas do relatório/prontuário são templates HTML estáticos** em `public/arquivos-inspecao/`
  e `public/arquivos-prontuario/`, renderizados em `<iframe>` com `?tag=<TAG>&page=<N>`.
- Cada template lê os dados que precisa **direto do `localStorage`** no `DOMContentLoaded`.
  Não há backend: o "banco" é o `localStorage` (via `src/services/storage.ts`).

### Como o documento puxa as informações (chaves de `localStorage`)

Tudo que o usuário salva pode ser fonte de injeção. Chaves por TAG do equipamento e globais:

| Chave | Conteúdo | Origem (onde o usuário salva) |
|---|---|---|
| `nr13_info_<TAG>` | Dados cadastrais do equipamento | Ficha em "Equipamentos" |
| `nr13_calc_<TAG>` | Resultados do memorial (PMTA, PTH, etc.) | "Ver Memorial Completo" |
| `nr13_vaso_<TAG>` / `nr13_vaso_ac_corpo_<TAG>` | Componentes/cálculo do memorial | Memorial |
| `nr13_cat_<TAG>` | Categoria de risco | Calculadora de categoria |
| `nr13_emp_<TAG>` | Empresa/cliente do equipamento | Cadastro de cliente |
| `nr13_fotos_<TAG>` | Fotos da capa/equipamento | Ficha |
| `nr13_med_esp_<TAG>` | Medição de espessura (ultrassom/ME) | Inspeção |
| `nr13_pref_unidade_<TAG>` | Unidade de medida da ficha | Ficha (Seletor de Unidade) |
| `nr13_minha_empresa` | Dados + logo da empresa executante | "Minha Empresa" |
| `nr13_lista_phs` | Profissionais habilitados / engenheiros (assinatura) | Funcionários |
| `nr13_calibracao_item_<id>` | Certificado de calibração | Calibrações |
| `nr13_livro_<TAG>` / `nr13_livro_config_<TAG>` | Livro de registro de segurança | Auto + config |
| `nr13_relatorio_meta_atual` | Metadados do relatório em montagem | Gravado na geração |
| `nr13_inspecao_atual` **e** `nr13_injecao_atual` | Dados de campo do container escolhido | Gravado na geração |

> **REGRA CRÍTICA DE INJEÇÃO:** os dados de campo do container **devem ser gravados nas duas chaves**
> `nr13_inspecao_atual` **e** `nr13_injecao_atual` (ver `gravarInspecaoOrigemAtual`). Os templates não
> são uniformes: VERIFICACAO/checklist1-3/CHECKLIST-FOTOS leem `nr13_inspecao_atual`; VISUAL-EXTERNO/
> INTERNO, suas folhas de fotos, TESTE-HIDROSTATICO, ULTRASSOM e CERTIFICADO-CAL-* leem
> `nr13_injecao_atual`. Ao reabrir um relatório salvo, re-gravar `nr13_relatorio_meta_atual` e os
> dados do container **antes** de remontar os iframes, senão exibe dados do último relatório gerado.

---

## 3. Ficha do equipamento e o Memorial salvo

- Em **"Equipamentos"** ficam os cards. Clicar no card abre a **ficha** do equipamento.
- Ao calcular o memorial, o resultado fica salvo na ficha em **"Ver Memorial Completo"** e a partir
  dele injeta no resto da ficha.
- **O memorial injeta:** Volume (m³), PMTA (kgf/cm²) para cálculo de categoria (basta inserir o
  fluido para calcular a categoria), Tipo de Tampo, material, menor PMTA, PMTA do componente,
  espessura mínima requerida, Volume, etc.
- **Inserção manual:** dados do equipamento e a **espessura da parede de teste** (espessura "dona do
  vaso") que o memorial não calcula são preenchidos pelo usuário na ficha em "Equipamentos".

---

## 4. Unidades de medida

- A unidade é definida **dentro da ficha** e reflete em todo o sistema, convertendo onde necessário.
- Alterar o grupo de unidade na ficha reconverte os dados em "Ver Memorial Completo" e em tudo salvo
  na ficha.
- **REGRA ABSOLUTA (exceção):** NUNCA converter as unidades do **cálculo da Categoria de Risco**.
  - **Enquadramento: (kPa) × (m³) > 8** — base confirmada (decisão de engenharia, mesma base do
    texto do checklist). NÃO usar kgf/cm² aqui.
  - Grupo de risco: (MPa) × (m³).
  - Ver `src/calc/categoria.ts` — recebe MPa/m³ e nunca toca nas unidades de exibição.

---

## 5. Layout, responsividade e impressão (todas as folhas)

- **Mobile:** todas as telas do sistema e telas/ferramentas de inspeção são responsivas. O
  preenchimento em campo pelo celular é a base do fluxo.
- **Impressão A4:** folhas de relatório e prontuário ajustam na impressão para sair exatamente a
  folha A4.
- **Sem quebra:** ao injetar/modificar conteúdo, nada pode ser cortado pelo limite da folha nem
  empurrar o rodapé para fora da margem.
- **Sem vazio:** não deixar grande espaço em branco; ajustar fontes/espaçamentos para proporção
  adequada do conteúdo na folha.

### Imagens / registros fotográficos (fotos da documentação, checklists, V.E., V.I. e TH)

- **Máx. 4 fotos por folha.**
- **Overflow (>4):** gera 2ª folha (e seguintes) com o mesmo cabeçalho/rodapé; a 1ª imagem da nova
  folha é a 5ª adicionada. (Ver `buildPages()` em `CHECKLIST-FOTOS.html` como referência.)
- **<4 fotos:** as 1/2/3 imagens se reajustam para ocupar a folha inteira, sem espaço vazio.

---

## 6. Inspeção mobile → fragmentação nas folhas do relatório

O usuário preenche **um arquivo único de inspeção** no celular (botão "Inspeções"): responde o
checklist e anexa fotos com descrição abaixo de cada item. Ao salvar no container, o sistema
**fragmenta** esse arquivo nos documentos do relatório, **nesta ordem**:

1. **Verificação da documentação** — só a lista de perguntas/verificações da documentação.
2. **Checklist 1, 2, 3** — só as listas relativas a eles.
3. **Fotos da documentação** (`FOTOS-DOCUMENTACAO.html`) — folha dedicada, só as fotos da etapa de
   documentação (grupo `fotosDocumentacao` do checklist). Auto-injetada após checklist3.
4. **Fotos do checklist** (`CHECKLIST-FOTOS.html`) — folha dedicada, fotos dos checklists 1-3.
5. **Vis. Externo** — perguntas/respostas do checklist "visual externo".
6. **Registro Foto V.E** — folha com as imagens do visual externo.
7. **Vis. Interno** — perguntas/respostas do checklist "visual interno".
8. **Registro Foto V.I** — folha com as imagens do visual interno.

As folhas de fotos (CHECKLIST-FOTOS, VISUAL-*-FOTOS, TESTE-HIDROSTATICO-FOTOS) e o TERMO-ABERTURA
são **auto-injetados** por `montarListaComTermoAbertura()` logo após sua folha-pai — não entram em
`DOCUMENTOS_DISPONIVEIS` e não são selecionados manualmente (evita duplicação).

---

## 7. Organização do Relatório — ORDEM DE MONTAGEM E INJEÇÃO (fixa)

Esta é a ordem canônica. `DOCUMENTOS_DISPONIVEIS` em `src/features/relatorios/tipos.ts` deve segui-la,
e a auto-injeção insere as folhas de fotos/termo nas posições indicadas.

| # | Documento | Arquivo | Injeta de |
|---|---|---|---|
| 1 | Capa | `CAPA.html` | ficha do equipamento |
| 2 | Sumário | `SUMARIO.html` | — |
| 3 | Placa | `PLACA.html` | ficha; PMTA em 3 unidades (converter) |
| 4 | **Caracterização** | `CLASSIFICACAO-RISCO.html` | dados do equipamento + categoria de risco |
| 5 | Prontuário | `PRONTUARIO.html` | memorial (fórmulas) + PMTA/PTH em kgf, bar, mpa |
| 6 | Resumo Memorial | `RESUMO-MEMORIAL.html` | ficha + fórmulas do "Ver Memorial" (não fixas); PMO/PMTA em MPa, kgf, bar |
| 7 | Memorial 1, 2, 3… | `MEMORIAL1/2/3.html` | cálculo de "Ver Memorial Completo"; folhas conforme tamanho do cálculo |
| 8 | Resumo do que foi inspecionado | `INSPECOES.html` | ficha + categoria |
| 9 | Verificação da documentação | `VERIFICACAO-DOCUMENTACAO.html` | só perguntas de documentação |
| 10 | Checklist 1, 2, 3 | `checklist1/2/3.html` | só as listas deles |
| 11 | **Fotos da documentação** | `FOTOS-DOCUMENTACAO.html` *(auto após checklist3)* | fotos da etapa de documentação (`fotosDocumentacao`) |
| 12 | Fotos do checklist | `CHECKLIST-FOTOS.html` *(auto-injetado após checklist3)* | fotos dos checklists 1-3 |
| 13 | Vis. Externo | `VISUAL-EXTERNO.html` | checklist "visual externo" |
| 14 | Registro Foto V.E | `VISUAL-EXTERNO-FOTOS.html` *(auto após VE)* | imagens do visual externo |
| 15 | Vis. Interno | `VISUAL-INTERNO.html` | checklist "visual interno" |
| 16 | Registro Foto V.I | `VISUAL-INTERNO-FOTOS.html` *(auto após VI)* | imagens do visual interno |
| 17 | Resultado inspeção e laudo | `CONCLUSAO.html` | — |
| 18 | ME | `ULTRASSOM.html` | medição de espessura |
| 19 | TH | `TESTE-HIDROSTATICO.html` | gráfico do TH + dados do equipamento |
| 20 | Fotos do TH | `TESTE-HIDROSTATICO-FOTOS.html` *(auto após TH)* | descrição breve + fotos do TH |
| 21 | Registro Seg. | `LIVRO-REGISTRO.html` *(TERMO-ABERTURA auto antes, se 1ª inspeção)* | livro de registro |
| 22 | Certificados de Calibração | `CERTIFICADO-CAL-MANOMETRO.html` / `CERTIIFCADO-CAL-PSV.html` | injetado ao fim (seleção em Modal) |

---

## 8. Prontuário

O prontuário deve puxar automaticamente: o **cálculo** (memorial), o **croqui** (`CroquiVaso3D`),
a **logo e dados da empresa** (`nr13_minha_empresa`), e os dados do **engenheiro responsável** para
**assinar** (`nr13_lista_phs`). Folhas: `PRONTUARIO.html` e `PRONT-P1..4` /
`PRONTUARIO-RECONSTITUICAO-1..4`.

---

## 9. Pendências conhecidas (gaps vs. esta estrutura)

Nenhuma pendência estrutural aberta. Itens já resolvidos:
- ✅ "Fotos da documentação" (folha #11): grupo `fotosDocumentacao` no `FormularioChecklist` +
  `FOTOS-DOCUMENTACAO.html`, auto-injetado após `checklist3` e antes de `CHECKLIST-FOTOS`.
- ✅ Base de enquadramento confirmada em kPa × m³ > 8 (§4).

Sugestões futuras (não bloqueiam): auditoria de responsividade mobile folha a folha; revisão de
`@media print` em cada template para garantir A4 exato sem corte/rodapé empurrado.

---

## 10. Convenções ao alterar o sistema

- Nova folha de relatório → criar HTML em `public/arquivos-inspecao/`, ler dados das chaves do §2 no
  `DOMContentLoaded`, e posicioná-la em `DOCUMENTOS_DISPONIVEIS` (ou na auto-injeção) conforme §7.
- Toda folha nova segue as regras de fotos/impressão/responsividade do §5.
- Qualquer dado novo que o usuário salve deve ser gravado em chave do §2 para poder ser injetado.
