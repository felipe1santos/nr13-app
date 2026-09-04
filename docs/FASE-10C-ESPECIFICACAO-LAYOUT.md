# FASE 10C · ESPECIFICAÇÃO DO NOVO LAYOUT DOCUMENTAL

**04/09/2026.** Análise fechada da referência oficial, matriz campo → dado →
fonte → regra → template, componentes reutilizáveis e sequência para a Fase 11.

> **Esta fase NÃO implementa nada.** Ela existe para que a Fase 11 possa
> escrever o relatório novo direto, sem descobrir regra no meio do caminho.

---

## 1 · O que é a referência, exatamente

O caminho combinado era uma pasta; o que existe é **um arquivo**:
`C:\projetos\vender\relatorio-nr13.html` — 101 KB, 1.475 linhas, **autocontido**
(um `<style>`, um `<script>`, zero dependências externas).

Ao redor dele, na mesma pasta, há material de venda que **não é referência de
layout** e não entra na Fase 11:

| pasta | o que é | serve à 10C? |
|---|---|---|
| `entregaveis/*.html` | o mesmo documento fatiado em 7 arquivos para venda avulsa (`01-corpo`, `02-inspecao`, …) — **mesmo CSS, mesmo JS, mesmas folhas** | não. É recorte comercial |
| `pacotes/*.zip` | os entregáveis zipados | não |
| `prints/folha-01..21.jpg` | 21 capturas, uma por folha | **sim, como conferência visual** |
| `index.html`, `hero-*.jpg`, `kiwify-*.jpg`, `Dockerfile`, `nginx.conf` | página de vendas do produto | não |
| `planejador-teste-hidrostatico.html` | outro produto (planejador de TH) | não |

**O que a referência É:** um formulário A4 imprimível, preenchido À MÃO no
navegador, sem persistência ("Nada é salvo. Ao fechar, o preenchimento se
perde"). **O que ela NÃO é:** um sistema. Ela não lê dado nenhum.

> É por isso que a 10C existe. O valor da referência é o **desenho da folha** —
> tipografia, grade, tabelas, ordem das seções, impressão vetorial. A ligação de
> cada campo com o dado real do NR-13 não está lá, e é o que esta especificação
> escreve.

---

## 2 · A diferença que define a Fase 11

| | sistema hoje | referência |
|---|---|---|
| arquivos | **27 templates** em `public/arquivos-inspecao/`, um por folha | **1 arquivo**, 21 folhas em `<section class="folha">` |
| montagem | um `<iframe>` por folha, com `?tag=&page=` | um documento, folhas irmãs no mesmo DOM |
| dados | cada template lê `localStorage` no `DOMContentLoaded` | nada: o usuário digita |
| unidade | `px` e `mm` misturados, `.page` 210×297mm | **`mm` em tudo**, `@page { size: A4; margin: 0 }` |
| paginação | `page`/`total` passados na query string pelo app | `renumerarPaginas()` conta `.folha` no DOM |
| cabeçalho/rodapé | copiado dentro de cada template | **um `<template>` clonado** para todas as folhas |
| PDF | `html2canvas` + `jsPDF` — **rasteriza** cada folha em JPEG 0.95 | `window.print()` → **PDF vetorial** do navegador |
| tamanho do PDF | imagem por página | texto real, selecionável, pesquisável |

**A troca de motor é a Fase 11.** A 10C entrega o mapa para que ela não precise
inventar nada.

---

## 3 · Mapa das folhas: referência × sistema atual

21 folhas na referência × 27 templates hoje. A correspondência é quase 1:1 —
com quatro diferenças que importam.

| # | folha da referência | template atual | observação |
|---|---|---|---|
| 1 | Capa | `CAPA.html` | ✔ |
| 2 | Sumário / objetivo / referências | `SUMARIO.html` | a referência traz **objetivo, documentos de referência e escopo** na mesma folha; hoje o sumário é só o índice |
| 3 | Identificação — placa | `PLACA.html` | ✔ (a referência acrescenta foto da placa na mesma folha) |
| 4 | Categorização de risco | `CLASSIFICACAO-RISCO.html` | ✔ |
| 5 | Dados técnicos / prontuário | `PRONTUARIO.html` | ✔ |
| 6 | Resumo de cálculos da PMTA | `RESUMO-MEMORIAL.html` | ✔ |
| 7 | Memória de cálculo | `MEMORIAL.html` (+`memorial-calc-novo.css/js`) | **folhas automáticas** hoje (`?part=N&of=M`); na referência é UMA folha |
| 8 | Dados e aspectos gerais da inspeção | `INSPECOES.html` | ✔ |
| 9 | Verificação da documentação | `VERIFICACAO-DOCUMENTACAO.html` | ✔ |
| 10 | Checklist NR-13 parte 1 | `checklist1.html` + `checklist2.html` | **2 → 1**: a referência junta |
| 11 | Checklist NR-13 parte 2 | `checklist3.html` | ✔ |
| 12 | Fotos da documentação | `FOTOS-DOCUMENTACAO.html` | ✔ |
| — | *(fotos do checklist)* | `CHECKLIST-FOTOS.html` | **não existe na referência** — precisa ser mantido |
| 13 | Exame externo | `VISUAL-EXTERNO.html` | ✔ |
| 14 | Fotos do exame externo | `VISUAL-EXTERNO-FOTOS.html` | ✔ |
| 15 | Exame interno | `VISUAL-INTERNO.html` | ✔ |
| 16 | Fotos do exame interno | `VISUAL-INTERNO-FOTOS.html` | ✔ |
| 17 | Ultrassom | `ULTRASSOM.html` | ✔ (a referência tem tabela de pontos com linhas adicionáveis) |
| 18 | Teste hidrostático | `TESTE-HIDROSTATICO.html` | ✔ |
| 19 | Fotos do TH | `TESTE-HIDROSTATICO-FOTOS.html` | ✔ |
| 20 | Resultado / parecer conclusivo | `CONCLUSAO.html` | a referência acrescenta **recomendações de segurança** e **datas das próximas inspeções** na mesma folha |
| 21 | Registro de segurança | `LIVRO-REGISTRO.html` | **FORA da reformulação** (ver §8) |

### O que existe no sistema e NÃO existe na referência

`CHECKLIST-FOTOS.html`, `TERMO-ABERTURA.html`, `CAPA-LIVRO-REGISTRO.html`,
`CERTIFICADO-CAL-MANOMETRO.html`, `CERTIIFCADO-CAL-PSV.html`.
**Nenhum é regressão da referência** — ela é um formulário genérico de venda,
não o sistema. Todos permanecem.

> **Correção (04/09/2026):** esta lista também citava `PRONTUARIO-RECONSTITUICAO-*`.
> Essas folhas **não existem no repositório** — sem arquivo em `public/`, sem
> entrada em `DOCUMENTOS_DISPONIVEIS`, sem referência em código. A afirmação
> vinha do `CLAUDE.md` §8, corrigido junto. Ver
> `docs/medicoes/2026-09-04-fase11-hardening.md` §4.

---

## 4 · Matriz campo visual → dado real → fonte → regra → template

O que a referência deixa como campo em branco, o sistema já tem gravado. Esta é
a ligação, folha a folha. `meta` = `nr13_relatorio_meta_atual`.

### 4.1 · Cabeçalho e rodapé (todas as folhas)

| campo visual | dado | fonte | regra |
|---|---|---|---|
| logo | logo da executante | `nr13_minha_empresa.logo` | com `ctx=rel`, vem do **snapshot congelado** `meta.empresa` (§7-bis) — nunca do dado vivo |
| "RELATÓRIO … N°" | `meta.codigo` | `nr13_relatorio_meta_atual` | 2ª chave mais lida do sistema |
| Página N de T | posição da folha | app | hoje `?page=&total=`; na referência, contagem no DOM |
| rodapé 1/2/3 | razão social, endereço/CNPJ, contato | `nr13_minha_empresa` / `meta.empresa` | 3 linhas fixas |

### 4.2 · Folhas 3 a 6 — identificação, risco, prontuário, cálculos

| campo visual | dado | fonte | regra |
|---|---|---|---|
| TAG, tipo, fabricante, série, ano, código de projeto, local | ficha | `nr13_info_<TAG>` | — |
| código de projeto | prontuário | `nr13_prontuario_<TAG>` | lido hoje pela PLACA |
| fluido, classe, volume, grupo, categoria | categoria | `nr13_cat_<TAG>` | **enquadramento kPa × m³ > 8**, grupo em MPa × m³ (§4 — nunca converter) |
| PMO / PMTA / PTH em MPa, psi, kgf/cm² | memorial | `nr13_calc_<TAG>.pmta`, `.pth` (MPa) | conversão de exibição; PTH = 1,3×PMTA (vaso) e **1,5×PMTA (caldeira)** |
| dados construtivos, aspectos operacionais | memorial | `nr13_vaso_<TAG>`, `nr13_vaso_cald_<TAG>`, `nr13_vaso_ac_corpo_<TAG>` | caldeira segue ASME I-2004 |
| execução / validade da inspeção | `meta.execucaoInspecao`, `meta.validade` | meta | — |
| parâmetros e resultados por componente (casco, tampos) | `nr13_calc_<TAG>.componentes[]` | memorial | array estruturado consumido hoje pelo RESUMO-MEMORIAL |
| memória de cálculo | `nr13_calc_<TAG>.memorialHTML` + `logCalculo` | memorial | **paginação automática** por orçamento de linhas (`UNIDADES_POR_FOLHA_MEMORIAL`); GV do autoclave é mesclado **na leitura** de `nr13_calc_gv_<TAG>` |
| foto da placa | fotos da ficha | `nr13_fotos_<TAG>` | — |

### 4.3 · Folhas 8 a 16 — inspeção, documentação, checklists, exames

| campo visual | dado | fonte | regra |
|---|---|---|---|
| natureza da inspeção, tipo de exame, resultado | `meta` | `nr13_relatorio_meta_atual` | a folha INSPECOES já marca isso |
| verificação da documentação | respostas do checklist | `nr13_inspecao_atual` | **fragmentação do §6** |
| checklist partes 1 e 2 | respostas | `nr13_inspecao_atual` | hoje em 3 folhas; a referência usa 2 |
| exame externo / interno (itens, obs., conclusão, resultado) | formulários de campo | `nr13_injecao_atual` | **VE/VI leem `injecao`, checklist lê `inspecao`** — a duplicação obrigatória do §2 |
| fotos (documentação, checklist, VE, VI, TH) | fotos de campo | `nr13_inspecao_atual` / `nr13_injecao_atual` | **4 por folha**, overflow gera folha nova (§5) |

### 4.4 · Folhas 17 a 20 — ensaios e parecer

| campo visual | dado | fonte | regra |
|---|---|---|---|
| aparelho, acoplante, temperatura, estado da superfície, cabeçote, velocidade sônica | formulário de ultrassom | `nr13_injecao_atual.ultrassom` | — |
| pontos/medidas, menor valor, espessura mínima requerida | medição | `nr13_med_esp_<TAG>`, `nr13_med_grid_<TAG>` | espessura requerida vem do memorial |
| instrumento padrão (série, certificado, validade) | certificado do padrão | `nr13_rastreab_<id>` | **um por `tipoInstrumento`**; `meta.rastreabIds` congela as versões |
| TH: fluido, pressão, duração, temperatura, normas, procedimento | formulário TH | `nr13_injecao_atual.th` | — |
| gráfico de pressurização | curva do TH | `nr13_injecao_atual.th.curva` | hoje desenhado pelo template |
| laudo APTO/INAPTO | conclusão | `nr13_laudo_<TAG>` | grava por `sbSalvar`; com `ro=1` a escrita é recusada (§7-ter) |
| assinaturas (nome, cargo, CREA, ART, rubrica) | snapshots | `meta.assinantes` (§7-bis) | carimbo por folha, respeitando `folhasRelatorio[]` de cada assinante |
| próximas inspeções (interna, externa, TH) | `meta.proximaInspecaoInterna/Externa` | meta | alimenta o vencimento oficial |
| **recomendações de segurança** | **não existe hoje** | — | **campo novo** — ver risco R4 |

---

## 5 · Componentes reutilizáveis

A referência já é componentizada. Estes são os blocos que a Fase 11 deve
extrair uma vez e usar em todas as folhas:

| componente | o que é | onde reaparece |
|---|---|---|
| **`.folha`** | A4 flex: `210×297mm`, padding `9/15/7/15mm`, `page-break-after: always` | 21 folhas |
| **`tpl-cab`** | logo + título + "Página N de T" | todas |
| **`tpl-rod`** | 3 linhas da executante | todas |
| **`.banner` / `.faixa` / `h3.secao`** | 3 níveis de título (cinza escuro / cinza claro / texto) | ~60 ocorrências |
| **`table.tb` / `.compacta` / `.limpa`** | tabela com bordas 0,6pt, `th` cinza, `td.rotulo` 38 %, zebra | ~30 tabelas |
| **`.campo`** | valor: amarelo quando vazio, azul-escuro quando preenchido, `data-ph` como placeholder | ~400 |
| **`.campo.bloco`** | parágrafo justificado que **estica** para preencher a folha (`.estica`) | 12 |
| **`.toggle`** | SIM/NÃO, APTO/INAPTO/APTO COM RESSALVAS | 20+ |
| **`td.marca`** | X exclusivo dentro da linha | matrizes de risco e do registro |
| **`.grade-fotos` + `.cartao-foto`** | 2×2 = **4 fotos por folha**, legenda embaixo | 5 folhas |
| **`tpl-folha-fotos`** | folha de fotos inteira, clonável | overflow |
| **`.assinaturas`** | 2 quadros: rubrica + linha + nome/cargo/registro | 3 folhas |
| **`.slot`** | qualquer imagem (logo, foto, assinatura, gráfico), com remover | ~40 |
| **detector de estouro** | `scrollHeight > 297mm` marca a folha em vermelho | todas |

> **O detector de estouro é o item mais subestimado desta lista.** O §5 do
> `CLAUDE.md` proíbe conteúdo cortado e rodapé empurrado — hoje isso é
> verificado no olho. A referência resolve com 12 linhas de JS, e o mesmo
> mecanismo pode virar **teste automático** de layout na Fase 11.

---

## 6 · O que NÃO pode mudar (regras de negócio preservadas)

Levantadas do código, não da memória:

1. **4 fotos por folha** — `FOTOS_POR_FOLHA = 4` (`relatoriosService.ts`) e
   `buildPages()` nos templates. A referência usa a mesma grade 2×2;
2. **paginação automática** — `expandirFolhasFoto` (fotos, `?fpag=`),
   `expandirMemorial` (memória de cálculo, `?part=&of=`),
   `expandirFolhasUltrassom` (grade de pontos). São três motores distintos e
   **nenhum some**;
3. **auto-injeção** (§6/§7) — folhas de fotos e TERMO-ABERTURA entram sozinhas
   depois da folha-pai, via `montarListaComTermoAbertura`;
4. **duplicação `nr13_inspecao_atual` + `nr13_injecao_atual`** — os templates não
   são uniformes, e trocar isso quebra folha silenciosamente;
5. **unidades** — enquadramento em **kPa × m³ > 8**; grupo de risco em MPa × m³;
   nunca converter na categoria (§4);
6. **memorial de caldeira** — ASME I-2004, PTH = **1,5×PMTA**;
7. **imutabilidade** — relatório finalizado é ARQUIVO (§7-quater); com `ctx=rel`
   valem os snapshots congelados de empresa, assinantes e calibrações (§7-bis);
   com `ro=1`, `sbSalvar` recusa escrita (§7-ter);
8. **motor de assinatura** — carimbo flutuante que **não empurra conteúdo**,
   filtrado por `folhasRelatorio[]` de cada assinante;
9. **palco** — o documento é materializado no `localStorage` sob orçamento de
   3.368 KB por documento (§2-ter). O layout novo muda o consumo: ver R3.

---

## 7 · Riscos

| # | risco | por quê | mitigação proposta para a Fase 11 |
|---|---|---|---|
| **R1** | **Fontes**: a referência pede `Carlito`/`Calibri`; o sistema usa IBM Plex/Space Grotesk self-hosted | Carlito não está no bundle. Cair no fallback muda a métrica do texto e **estoura folha** | decidir a fonte ANTES de portar; se for Carlito, empacotar via `@fontsource` (o PWA precisa dela offline) |
| **R2** | **Print vetorial × iframes**: `window.print()` do documento pai não imprime 27 iframes como 27 páginas A4 confiáveis | é a razão de existir o `printService` de 489 linhas com pré-rasterização | a Fase 11 precisa do documento em **um DOM só** — é a mudança estrutural, não um detalhe |
| **R3** | **Palco**: um documento único com todas as fotos em base64 no mesmo DOM | o orçamento de 3.368 KB foi dimensionado para folhas separadas | medir antes; provavelmente exige as fotos por `blob:`/bucket (Fase 2) em vez de base64 |
| **R4** | **Campos que não existem**: "recomendações de segurança" e "datas das próximas inspeções por exame" | não há chave para eles hoje | ou entram como campo novo (chave + UI + migração), ou saem da folha. **Decisão do dono** |
| **R5** | **Checklist 3 → 2 folhas** | a referência junta partes que hoje são 3 arquivos | conferir item a item: perder pergunta de checklist é perder evidência de inspeção |
| **R6** | **Memória de cálculo em 1 folha** | hoje é paginada por orçamento de linhas; caldeira gera mais folhas que autoclave | manter a paginação. A folha única da referência é um exemplo, não um limite |
| **R7** | **PDFs históricos** | §7-quater: relatório finalizado é arquivo | **nenhum PDF histórico é regenerado**. O layout novo vale para emissões novas |
| **R8** | **Regressão silenciosa de campo** | 400 campos; um `data-ph` sem fonte imprime "—" sem erro | a matriz do §4 vira **teste**: cada campo do layout novo declara sua chave, e o teste falha se alguma ficar órfã |

---

## 8 · Fora da reformulação (confirmado)

Não são tocados pela 10C nem pela Fase 11:

- **certificados de calibração** (`CERTIFICADO-CAL-MANOMETRO.html`,
  `CERTIIFCADO-CAL-PSV.html`) — têm assinatura própria e fluxo próprio;
- **Livro / Registro de Segurança histórico** — inclusive a folha 21 da
  referência: o Livro acabou de ganhar ciclo próprio na 10B.2, e o registro
  trancado é imutável;
- **capa do Registro** (`CAPA-LIVRO-REGISTRO.html`) e **termo de abertura**
  (`TERMO-ABERTURA.html`);
- **PDFs históricos** — nenhum é regenerado, nunca.

---

## 9 · Sequência proposta para a Fase 11

Cada passo termina verificável, e nenhum depende de decisão que ainda não foi
tomada:

| passo | entrega | critério de pronto |
|---|---|---|
| **11.1** | **Decisões pendentes** com o dono: fonte (R1), recomendações e próximas inspeções (R4), checklist 2 × 3 folhas (R5) | respondido por escrito |
| **11.2** | **Folha-base + cabeçalho/rodapé/tabelas** como CSS único (`documento-a4.css`) e um componente de folha | uma folha de teste imprime A4 exato, vetorial, com o rodapé no lugar |
| **11.3** | **Ponte de dados**: um adaptador que lê as chaves do §4 e devolve um objeto por folha — **sem tocar em template** | testes puros por folha, cada campo com fonte declarada (R8) |
| **11.4** | **Folhas 1–7** (capa → memória de cálculo), incluindo a paginação do memorial | comparação lado a lado com `prints/folha-01..07.jpg` |
| **11.5** | **Folhas 8–16** (inspeção, checklists, exames, fotos) com as 4 fotos por folha e o overflow | idem, e o detector de estouro sem acusar nada |
| **11.6** | **Folhas 17–20** (ultrassom, TH, parecer) com assinaturas e injeção de certificados | idem |
| **11.7** | **Motor de PDF vetorial**: `window.print()` sobre o documento único, com `@page` e sem `html2canvas` | PDF com texto selecionável, tamanho medido contra o atual |
| **11.8** | **Convivência**: o novo por trás de flag, o antigo intacto para reabrir documento legado | relatório antigo continua abrindo pelo arquivo (§7-quater) |
| **11.9** | Gate: suíte, navegador, offline, impressão real, comparação de páginas | e só então o rollout gradual |

> **Ordem inegociável:** 11.3 (ponte de dados) antes de qualquer folha. Portar o
> visual primeiro e ligar os dados depois é como as 27 folhas atuais acumularam
> `|| '{}'` — o defeito que imprime "-" e não avisa ninguém.

---

## 10 · Resumo executivo

- a referência é **um arquivo** de 21 folhas, A4 nativo em `mm`, com impressão
  **vetorial** e zero dependências — o desenho está pronto e é bom;
- ela **não tem dados**: a ligação com as 30+ chaves do sistema é o que esta
  especificação escreve, folha a folha (§4);
- **14 componentes** reutilizáveis já existem nela, incluindo a grade de 4 fotos
  e o detector de estouro de folha;
- **9 regras de negócio** ficam preservadas na íntegra (§6), e **8 riscos** estão
  nomeados com mitigação (§7);
- **3 decisões do dono** bloqueiam o início: fonte, campos novos e checklist;
- a implementação cabe em **9 passos**, com a ponte de dados obrigatoriamente
  antes das folhas.
