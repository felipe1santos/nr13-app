# Bloco 1.1 · logo global, memorial matemático e auditoria de completude

**05/09/2026.** Duas correções e uma auditoria. Nada do Bloco 2 foi iniciado.

---

## 1 · Logo

O cabeçalho já desenhava a logo em **todas** as folhas (é `novaFolha` quem o
monta). O que faltava era a ação: a área clicável estava registrada só na folha
1. Agora está em todas — mesmo `id`, mesmo override, um documento só.

| situação | prévia | documento final |
|---|---|---|
| logo mestre existe, sem override | logo mestre | logo mestre |
| sem logo nenhuma | área amarela com "Clique para adicionar a logo" | **nada** — sem amarelo, sem moldura, sem legenda |
| override de imagem no relatório | a imagem escolhida | a imagem escolhida |

O override guarda o **caminho** do arquivo no cofre (`RefFoto`), nunca Base64, e
não toca a logo mestre da empresa.

## 2 · Memorial matemático (folha 6)

De tabela de números soltos para memorial de engenharia, por componente:

```
MEMÓRIA DE CÁLCULO — TAMPO ESQUERDO

Fórmulas aplicadas
                P·D                          2·S·E·t
      t =  ───────────────        PMTA =  ─────────────
            2·S·E − 0,2·P                   D + 0,2·t

Dados utilizados      SÍMBOLO · DESCRIÇÃO · VALOR · UNIDADE
Resultados            espessura calculada / medida, PMTA, margem, material
Situação do componente
```

**A equação vem do motor.** `nr13_calc_<TAG>.componentes[].formulaT/formulaP`
são gravadas por `vasoMemorialService` / `autoclaveMemorialService`;
`formulaMatematica.ts` apenas **reformata** para poder desenhar a fração, e há
teste que recompõe `numerador / (denominador)` e exige a string original de
volta. A barra dentro de radical (`√(P/S)`) não é fração e não é dividida.

O desenho é vetorial — texto e linha —, selecionável e nítido em qualquer zoom.
Nenhuma fórmula literal mora nas folhas, e o gate reprova `Math.pow/sqrt/log/
sin/cos/tan` no gerador.

**Editabilidade:** valores e situação são campos da 13D-bis (override por
relatório). A **equação não é campo de texto livre** — trocá-la faria o
documento afirmar um método de cálculo que o sistema não usou.

### O defeito que a validação pegou

Na primeira prévia em produção a fórmula saiu **truncada**:
`PMTA = 2·S·E·t / (D + 0,2·t)` imprimiu `PMTA = 2 / (D + 0,2)`.

Causa: o jsPDF corta o texto no primeiro caractere que a fonte embutida não tem,
e o subconjunto de Carlito não incluía `·`, `−`, `√` nem `α` — todos usados
pelas fórmulas do motor. O subconjunto foi regerado com eles (104/117/97/113 KB,
~83 % menores que a fonte cheia). Gate novo varre as fórmulas do motor caractere
a caractere contra a lista do subconjunto.

---

## 3 · Auditoria global de completude

Comparação folha a folha da referência contra o Modelo Novo **de hoje** (PDF
real de 12 páginas, org de teste). Classificação:
**A** implementado · **B** existe no sistema, falta imprimir · **C** existe com
outra fonte/nome · **D** não existe · **E** puramente visual ·
**F** exclusão intencional.

| folha da referência | estado | o que falta |
|---|---|---|
| 1 · CAPA | **COMPLETA** | — |
| 2 · SUMÁRIO / OBJETIVO / REFERÊNCIAS / ESCOPO | divergente | sumário numerado com página real (B+E); ABNT NBR 16035 e nota dos documentos (E); objetivo completo da referência (E); **2.1 escopo e observações** (D) |
| 3 · IDENTIFICAÇÃO / PLACA | divergente | **PMO** na tabela de pressões (B); placa em largura total + legenda (E); placa vazia em amarelo (E) |
| 4 · CATEGORIZAÇÃO DE RISCO | divergente | fluido de trabalho e código de projeto (B); PMTA na folha (B); **matriz 13.5.1.2** (E); operador treinado (E); observações (D). *P.V. em kPa e MPa já saem — na folha 5* |
| 5 · DADOS TÉCNICOS / PRONTUÁRIO | **COMPLETA** | — |
| 6 · RESUMO DE CÁLCULOS | **COMPLETA** | — (fórmulas, variáveis, resultados e situação) |
| 7 · MEMÓRIA DE CÁLCULO | divergente | tabela T.A.G. / código de projeto no topo (B); nota de fórmulas ASME (E — hoje as fórmulas aparecem na folha 6) |
| 8 · EXAMES — DADOS GERAIS | divergente | data de início e término (D); nº de série, nº do relatório e A.R.T. na folha (B/D); natureza e ensaios **marcáveis** (E); resultado do exame visual (B); observações (D) |
| 9 · VERIFICAÇÃO DA DOCUMENTAÇÃO | divergente | tabela de 15 itens com SIM/NÃO/N.A. (C — o sistema guarda a resposta em texto); marcas (E) |
| 10 · CHECKLIST PARTE 1 | divergente | faixas temáticas da referência (C); marcas (E) |
| 11 · CHECKLIST PARTE 2 | divergente | idem folha 10 |
| 12 · FOTOS — DOCUMENTAÇÃO | **COMPLETA** | — (folha só existe com foto: decisão declarada da 13D) |
| 13 · EXAME EXTERNO | divergente | tabela T.A.G. / nº de série no topo (B); marcas (E) |
| 14 · FOTOS — EXAME EXTERNO | **COMPLETA** | — |
| 15 · EXAME INTERNO | divergente | idem folha 13 |
| 16 · FOTOS — EXAME INTERNO | **COMPLETA** | — |
| 17 · ULTRASSOM | divergente | informações do componente avaliado: equipamento, nº de série, **área** (B); tabela única REGIÃO/PONTO (E); nota INMETRO (E); observações/conclusões (D) |
| 18 · TESTE HIDROSTÁTICO | divergente | dados gerais: cliente, doc nº, equipamento (B); instrumento de medição (B); duração, temperatura, normas, validade do laudo, procedimento (D); parecer do TH (D) |
| 19 · FOTOS — TESTE HIDROSTÁTICO | **COMPLETA** | — |
| 20 · RECOMENDAÇÕES / PARECER / PRÓXIMA | **COMPLETA** | coluna PRAZO na próxima inspeção (B) e A.R.T. nas assinaturas (D) — pendências menores |
| 21 · REGISTRO DE SEGURANÇA | **F — exclusão intencional** | fora do escopo por decisão do dono |

### Sumário da auditoria

| | |
|---|---|
| folhas/seções **completas** | **9** de 20 no escopo (1, 5, 6, 12, 14, 16, 19, 20 e a capa contada uma vez) |
| folhas/seções com divergência | **11** de 20 |
| exclusões intencionais | **1** (folha 21 · Livro/Registro de Segurança), além de capa do Livro, termo de abertura, históricos arquivados e certificados |
| campos que ainda faltam | **34** |
| — dados que existem e não são impressos (B) | **17** |
| — existem com outra fonte/nome (C) | **3** |
| — realmente não existem (D) | **14** |
| diferenças apenas visuais (E) | **13** |

Os 17 dados que existem e não aparecem: PMO; fluido de trabalho e código de
projeto na categorização; PMTA na folha 4; T.A.G./código na folha 7; nº de
série, nº do relatório e resultado visual na folha 8; T.A.G./série nas folhas 13
e 15; equipamento, série e área do ultrassom; cliente, doc nº e equipamento do
TH; instrumento do TH; prazo da próxima inspeção.

---

## 4 · Validação em produção

Org de teste, `ZZ-FASE3`, bundle `assets/index-DnfCVXNZ.js` + fonte nova
(`carlito-regular.ttf`, 106.156 bytes servidos).

| | resultado |
|---|---|
| áreas editáveis no documento | **154** (eram 131 no Bloco 1 e 52 na 13D) |
| áreas de logo clicáveis | **12** — uma por folha, todas o mesmo campo |
| fórmulas | completas: `t = P·D / (2·S·E − 0,2·P)` e `PMTA = 2·S·E·t / (D + 0,2·t)`, com fração desenhada |
| dados utilizados | 6 símbolos com descrição, valor e unidade |
| memorial | um bloco por componente, com quebra de página automática |

## 5 · Testes

`formulaMatematica.test.ts` — **17 testes**, incluindo o gate de que o gerador
não conhece engenharia e o de que os sinais das fórmulas existem na fonte.

| | |
|---|---|
| suíte | **2.072 testes, 164 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
