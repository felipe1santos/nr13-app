# Fase 12 · piloto do PRONTUÁRIO em vetor

**04/09/2026.** O padrão visual aprovado na Fase 11 aplicado ao prontuário —
**piloto**, atrás de `?piloto=1`. Produção continua imprimindo pelo caminho de
hoje, e a virada depende de autorização.

---

## 1 · O mapeamento, antes de escrever código

### O que o prontuário é hoje

Seis folhas HTML em `public/arquivos-prontuario/`, montadas em `<iframe>` no
`.prontuario-preview` e **apenas IMPRESSAS** (`imprimirRelatorio`).

> **Descoberta que muda o escopo da fase: o prontuário nunca virou artefato.**
> Não existe `gerarPdfBytes`, `publicarArtefato`, `sha256` nem `pdfRef` em
> `Prontuarios.tsx` nem em `features/prontuarios/` — a busca volta vazia. Logo
> **não há PDF histórico de prontuário para preservar**, e a imutabilidade
> (bytes → SHA → Storage → pdfRef) entra junto com a virada, reusando
> `artefatoRelatorio.ts` sem alteração.

### As fontes de cada folha (varredura do `public/`)

| folha | lê |
|---|---|
| `PRONT-ULTRASSOM` | `nr13_med_esp_`, `nr13_med_grid_`, `nr13_croqui2d_`, `nr13_croqui3d_` (legado), `nr13_rastreab_`, `nr13_calc_` |
| `PRONT-CROQUI2D` | `nr13_croqui2d_`, `nr13_modelo3d_`, `nr13_folha_dados_`, `nr13_cat_` |
| `PRONT-FOLHA-DADOS` | `nr13_folha_dados_`, `nr13_vaso_`, `nr13_calc_gv_`, `nr13_emp_` |
| `PRONT-PRONTUARIO` | `nr13_info_`, `nr13_cat_`, `nr13_emp_`, `nr13_vaso_`, `nr13_vaso_ac_corpo_`, dados de caldeira, `nr13_relatorio_meta_atual` |
| `PRONT-CONTINUACAO` | `nr13_calc_` |
| `PRONT-MEMORIAL` | `nr13_calc_`, `nr13_calc_gv_`, `nr13_vaso_ac_corpo_` |

Comuns: `nr13_prontuario_<TAG>` (formulário), `nr13_prontuario_atual`
(materializada para os templates), `nr13_prontuario_meta_<TAG>` (número +
emissão), `nr13_minha_empresa`, `nr13_assinantes_pront_<TAG>` + `nr13_lista_phs`.

**Regras condicionais:** `paginasProntuario(tipo)` — caldeira e autoclave não
têm croqui 2D e por isso saem com 4 folhas, não 6 (§8). **Assinatura:**
`folhasProntuario` ausente = engenheiro assina todas, inspetor nenhuma.

---

## 2 · O que foi construído — sem um segundo framework

| peça | reusa |
|---|---|
| `modeloProntuario.ts` | `converterPressao`, `textoOu`, `rotulos` e `linhasMemorial` (o MESMO extrator do template e do relatório) |
| `folhasProntuario.ts` | o `Documento` da Fase 11 — cursor, quebra de folha, tabela que repete cabeçalho, `Página X de Y` |
| `gerarProntuario.ts` | `carlito`, `documentoA4`, duas passagens |
| publicação | `artefatoRelatorio.ts`, sem alteração |

O modelo **lê e não calcula**: PMTA e PTH saem de `converterPressao`, a memória
de cálculo de `linhasMemorial`, a categoria de `nr13_cat_`. Campo ausente é
`null` e chega à folha como travessão, em vez do `|| '{}'` silencioso.

Um teste percorre `['vaso','caldeira','autoclave','outro']` e quebra se
`folhasDoProntuario` divergir de `paginasProntuario` — a composição do PDF e a
da tela têm uma fonte só.

---

## 3 · O piloto, medido em produção (org de teste)

Equipamento `COMPRESSOR V8-15/200L`, vaso de pressão, 6 folhas.

| motor | páginas | bytes | tempo |
|---|---|---|---|
| atual (html2canvas) | 6 | **2,27 MB** | 1.329 ms |
| **vetorial** | 6 | **70 KB** | **293 ms** |

**Redução de 97,0%** e ~4,5× mais rápido, com **o mesmo número de páginas**.

### Por dentro do arquivo

```
páginas ......................... 6      todas em A4 exato (595,28 × 841,89)
caracteres de texto selecionável  2.676
numeração ....................... "Página 1 de 6" … "Página 6 de 6"
imagens ......................... logo do cabeçalho, rubrica e croqui
```

### Cadeia de artefato

| | |
|---|---|
| SHA-256 | `ce9bd1366120a451d3c3854b607c3a61…` |
| `pdfRef` | `99f642d3-…/relatorios/b21ae5ca-….pdf` · **no bucket** |
| reabertura | **✔ 70 KB reabertos pelo mesmo `pdfRef`** (gerado: 70 KB) |

É a primeira vez que um prontuário deste sistema vira arquivo com hash.

---

## 4 · Paridade de conteúdo — e as duas faltas que ela encontrou

A conferência comparou **todo valor guardado pelo sistema** com o texto extraído
do PDF. Primeira rodada: **22 de 29 presentes**. Analisadas uma a uma, cinco das
sete ausências eram falso positivo (arrays serializados, `logoRef` interna, e
`tipo: "vaso"` que aparece traduzido como "Vaso de Pressão").

**Duas eram reais, e as folhas atuais imprimem as duas:**

1. **Data de emissão e Nº do prontuário** só existiam no cabeçalho. A folha
   atual os imprime no corpo (`pront-data-insp`) — e data de emissão de
   documento assinado não pode depender do cabeçalho. Foram para "Dados Gerais".
2. **Bairro e CEP no rodapé da executante**: o `footer-empresa` das seis folhas
   monta `endereço • bairro • cidade/UF • CNPJ • CEP`, e o modelo omitia dois.

Corrigidas, com teste que tranca cada uma. Segunda rodada: **23 presentes**, e as
4 restantes classificadas:

| restante | veredito |
|---|---|
| `info.tipo = vaso` | impresso **traduzido** ("Vaso de Pressão") — não é perda |
| `emp.cep`, `emp.telefone`, `prontuario.empresaTelefone` | **as 6 folhas atuais também não imprimem**: o endereço do contratante lá é `endereco - bairro - localidade` |

Bairro, cidade e localidade do cliente foram conferidos **presentes** no PDF.

> **Nenhuma perda de conteúdo.** As faltas encontradas foram corrigidas; o que
> sobra ou está traduzido, ou não é impresso pelo documento atual.

A conferência campo a campo do painel mostra **19 de 70 campos com dado** neste
equipamento — os 51 em branco são ausência no cadastro, não perda: saem como
travessão nos dois motores.

---

## 5 · Convivência

`nr13_motor_prontuario` — **chave separada** de `nr13_motor_pdf`, de propósito:
se o prontuário precisar de rollback, ele não pode arrastar junto o relatório,
que já está validado em produção. URL própria (`?motorPront=`), padrão `atual`,
e um teste garante que `?motor=vetorial` **não** vira o prontuário.

O gerador atual não foi tocado. O piloto vive atrás de `?piloto=1`.

---

## 6 · Diferença conhecida, declarada

As três vistas do croqui são **SVG**, e o jsPDF não importa SVG sem plugin —
trazer um segundo motor de desenho contradiz "nenhum framework novo". Elas são
rasterizadas em **3×** antes de desenhar, e são o único raster de conteúdo do
documento. Croqui que falhe na conversão é **dito na folha**, nunca substituído
por outro desenho.

Fora do escopo e **não tocados**: certificados de calibração, Livro/Registro de
Segurança, capa do Livro, termo de abertura, registros trancados e PDFs
históricos.

---

## 7 · Números

| | |
|---|---|
| suíte | **1.790 testes, 148 arquivos, 0 falhas** (+21) |
| `tsc -b` · build | limpos |
| novos | `modeloProntuario.ts`, `folhasProntuario.ts`, `gerarProntuario.ts`, `conferenciaProntuario.ts`, `PainelPilotoProntuario.tsx` |
| bundle | `assets/index-BcQAWO-U.js` |
