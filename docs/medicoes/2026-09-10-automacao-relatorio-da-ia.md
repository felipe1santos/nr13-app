# Quanto do relatório o sistema preenche sozinho — "RELATORIO DA IA", 10/09/2026

Commits `8e7c324`, `572d73c`, `74b7b86`, `929fb3a`, `e848ba6`.
Conta `teste@gmail.com`, equipamento **ZZ-FASE3** (vaso de pressão, GLP,
categoria III), container **"Inspeção da IA"**, relatório
`REL-1789004119133` — **rascunho, não finalizado**.

O objetivo não era provar que o PDF sai. Era medir **onde a automação chega e
onde ela para**: montar o documento mais completo possível e, ANTES de digitar
qualquer coisa nele, fotografar o que veio de graça.

---

## 1. A fotografia inicial

Documento gerado pelo assistente com as 17 folhas, **32 páginas**, e o painel
"O que falta" com **15 grupos / 31 campos críticos**. Nada foi digitado no
documento até este ponto.

| # | grupo | campos | de onde viria |
|---|---|---|---|
| 1 | Validade da inspeção | 1 | Configurações |
| 2 | Nº da A.R.T. (CREA) | 1 | Configurações |
| 3 | Documentos de referência | 2 | — (linha extra em branco, por desenho) |
| 4 | Escopo e observações da inspeção | 1 | — (texto livre) |
| 5 | Observações sobre a categorização | 1 | — (texto livre) |
| 6 | Observações e pendências do prontuário | 1 | — (texto livre) |
| 7 | Memorial de cálculo | 3 | **`nr13_vaso_.P` — existia e não chegava** |
| 8 | Observações da inspeção | 1 | — (texto livre) |
| 9 | Instrumentos de medição | 6 | — (nº do certificado por instrumento) |
| 10 | Checklist NR-13 | 2 | — (texto livre) |
| 11 | Teste hidrostático | 4 | `nr13_rastreab_` tipo `manometro` — **não cadastrado** |
| 12 | Parecer técnico | 2 | — (texto livre) |
| 13 | Próximas inspeções | 4 | — (prazos da NR-13, não automatizados) |
| 14 | Próxima — exame visual externo | 1 | Configurações |
| 15 | Próxima — exame visual interno | 1 | Configurações |

### O que o sistema entregou pronto

Sem nenhuma digitação no documento: capa completa (equipamento, TAG, classe,
grupo, categoria, contratante com CNPJ, endereço, responsável técnico com
CREA, foto de capa), sumário com paginação, **placa reconstruída inteira**,
categorização com a matriz da NR-13 destacada em Classe A × Grupo 4 = III,
prontuário construtivo, memorial com as fórmulas desenhadas, 36 respostas e 36
observações do checklist, 15+15 itens dos exames visuais com observação em
cada linha, 24 medições de espessura com o menor valor por região, a curva do
teste hidrostático, 20 fotos com legenda, vida remanescente e as duas
assinaturas com rubrica.

**A automação cobre a maior parte do documento.** Os 31 campos que sobraram são
1 defeito, 2 fontes vazias e 28 campos de texto livre.

---

## 2. Como cada grupo fechou

| grupo | fechou por | classificação |
|---|---|---|
| 1, 2, 14, 15 (4 campos) | preencher o modal **Configurações** | **E** — automático pela meta, faltava a entrada |
| 11 · Teste hidrostático (4 campos) | **cadastrar o manômetro padrão em /certificados** | **F** — a automação existia; a FONTE estava vazia |
| 7 · Memorial (3 campos) | **correção de código** (`74b7b86`) | **BUG** |
| 3, 4, 5, 6, 8, 9, 10, 12, 13 (20 campos) | digitação no documento | **G** — sem fonte estruturada |

O caso do manômetro é a prova mais limpa da automação: cadastrado o
certificado padrão, os 4 campos de "INSTRUMENTO DE MEDIÇÃO UTILIZADO" da folha
do TH se preencheram sozinhos — padrão, nº de série, nº do certificado e
validade — e o grupo desapareceu da barra. Nenhuma digitação no documento.

**"O que falta" terminou em ZERO.**

---

## 3. Os cinco defeitos que a rodada achou

### 3.1 `8e7c324` · "Manter a minha" não fazia nada

`nr13_docs_ZZ-FASE3` — o container recém-preenchido — ficou em conflito de
sincronização, e o botão que resolve o conflito **não tinha nenhum efeito**.
Sem erro, sem aviso, sem mudança na tela.

A causa não estava no botão. Enquanto o conflito espera decisão o usuário
continua trabalhando: o autosave regrava a chave e `registrarNaMemoria`
CONDENSA, apagando da fila justamente o item que o registro do conflito
aponta. `resolverMantendoLocal` caía num `if (!original) return` silencioso.

O mesmo acontecia quando uma escrita posterior daquela chave SUBIA com
sucesso: o conflito sobrevivia à própria vitória e virava uma pergunta sem
resposta possível.

Três pontos, a mesma ideia — o registro do conflito precisa acompanhar a fila.
Depois da correção, os 6 conflitos abertos foram resolvidos pela tela e o selo
passou a **"Tudo salvo na nuvem"**.

> Um botão que não faz nada é pior do que um que falha: o usuário acredita que
> decidiu.

### 3.2 `74b7b86` · a folha imprimia a fórmula e omitia o P

Cada folha de componente imprime `t = P·D / (2·S·E − 0,2·P)` e, logo abaixo, a
legenda de símbolos com o valor de cada variável. **O P saía como travessão em
todos os componentes.**

Não era dado ausente: `nr13_vaso_<TAG>.P` é o mesmo número que o motor usou
para calcular a espessura requerida, e já era lido pelo modelo para a folha de
dados técnicos. O componente é que não o carregava, e o mapa `valorDe` da
legenda (S, E, t, D, Ri, R, L, c, PMTA) não tinha a entrada P.

Fonte existia + documento em branco = **defeito de automação**, não campo
manual. Corrigido na raiz; nada é recalculado.

### 3.3 `e848ba6` · a legenda da foto era cortada no meio da frase

`splitTextToSize(...)[0]` desenhava só a PRIMEIRA linha. A legenda "Memorial de
cálculo — Folha de rosto do memorial da PMTA de casco e tampos." saiu no
documento como "…de casco e". Sem reticência, sem nada indicando que faltava
texto.

Agora são duas linhas, e o que passar disso termina em reticência — cortar é
inevitável numa folha de 4 fotos com tamanho fixo, mas **o corte precisa
aparecer**. Conferido na tela: as 20 legendas saem completas.

### 3.4 `572d73c` · o rascunho não podia ser renomeado

O nome só podia ser escolhido no modal de FINALIZAR. Para identificar um
documento em andamento na lista era preciso finalizá-lo primeiro — o contrário
do que o rascunho existe para permitir. `renomearRelatorio` já roteava o
rascunho para `salvarRascunho`; faltava a porta na tela.

### 3.5 `929fb3a` · salvar o rascunho apagava o nome escolhido

Renomeado para "RELATORIO DA IA", o rascunho voltou a
"Relatorio_Inspeção_Periódica_ZZ-FASE3.pdf" no PRIMEIRO save depois de
reabrir. `nomeEscolhido` só era preenchido no modal de finalizar; reabrir
deixava o estado em `null` e `montarRegistro` regravava o nome automático por
cima. **Renomear virava trabalho que se perde sozinho.**

---

## 4. A matriz de automação

| campo | fonte existe? | fonte | automático |
|---|---|---|---|
| Equipamento, TAG, fabricante, série, ano, código, edição, adenda, localização, tipo de construção, descrição | sim | `nr13_info_` | **SIM** |
| Contratante, CNPJ, endereço, telefone, e-mail | sim | `nr13_emp_` | **SIM** |
| Classe do fluido, grupo, categoria, enquadramento, P×V | sim | `nr13_cat_` | **SIM** |
| PMO / PMTA / PTH em MPa, psi, kgf/cm², bar | sim | `nr13_info_.pmoAdotadaMpa` etc. | **SIM** — os três valores distintos (1,750 / 2,200 / 2,860 MPa) saíram corretos |
| PMTA calculada, esp. mín., fórmulas, material, E, S, raio, CA por componente | sim | `nr13_calc_.componentes[]` | **SIM** |
| **Pressão de projeto (P) na legenda** | sim | `nr13_vaso_.P` | **era NÃO — corrigido** |
| Memorial completo (folhas 6.1) | sim | `nr13_calc_.memorialHTML` | **SIM** |
| Vida remanescente, taxa de corrosão, sobremetal | sim | `nr13_vida_` | **SIM** |
| 36 respostas + 36 observações do checklist | sim | container `.checklist` | **SIM** |
| Comentário sobre a documentação | sim | container `.checklist.comentariosDocumentacao` | **SIM** |
| Instrumentos instalados: possui / calibrado | sim | container `.checklist.instrumentos` | **SIM** |
| **Instrumentos: nº do certificado (6)** | **não** | — | **NÃO — sem automação** |
| 15+15 itens, observação por item, conclusão, resultado (exames visuais) | sim | container `.visual_externo` / `.visual_interno` | **SIM** |
| 24 medições, menor valor, esp. mín. requerida por região | sim | container `.ultrassom` + `nr13_calc_` | **SIM** |
| Instrumento padrão do ultrassom e do TH (8 campos) | sim | `nr13_rastreab_` por tipo | **SIM** (bastou cadastrar) |
| TH: cliente, doc, fluido, pressões, duração, temp., normas, procedimento, parecer, curva | sim | container `.th` | **SIM** |
| 20 fotos + legendas | sim | container (5 grupos) | **SIM** |
| Nº do relatório, emissão, execução, validade, próximas, A.R.T. | sim | Configurações | **SIM** |
| Engenheiro e técnico: nome, função, CREA, campos extras, rubrica | sim | `nr13_lista_phs` | **SIM** |
| Logo e dados da executante | sim | `nr13_minha_empresa` | **SIM** |
| Escopo, obs. da categorização, obs. do prontuário, obs. da inspeção, obs. do checklist 1 e 2 | **não** | — | **NÃO — texto narrativo** |
| Parecer: PMTA pode ser mantida? + justificativa | **não** | — | **NÃO** |
| Recomendações 1–4 + prazos | **não** | — | **NÃO** |
| Próximas inspeções: prazo externo / interno / TH e data do TH | **não** | — | **NÃO — a NR-13 define por categoria; nada calcula** |
| Documento de referência adicional + título | **não** | — | **NÃO — linha extra, por desenho** |

### Contagem

| | |
|---|---|
| grupos críticos na fotografia inicial | **15** |
| campos críticos brutos | **31** |
| vieram automáticos depois de preencher a FONTE certa | **8** (4 Configurações + 4 certificado do manômetro) |
| tinham fonte e NÃO vieram (defeito) | **3** (P do memorial) |
| sem fonte estruturada (manual por natureza) | **20** |
| "O que falta" ao fim | **0** |

---

## 5. Onde vale automatizar a seguir

1. **Nº do certificado dos 6 instrumentos do checklist** (6 campos, o maior
   grupo manual). O módulo Calibrações já guarda certificado por componente;
   `modelo.ts` grava `certificado: null` na mão.
2. **Prazos das próximas inspeções** (4 campos). A NR-13 define a periodicidade
   pela categoria e pela existência de PH — é tabela, não julgamento.
3. **Escopo da inspeção** poderia nascer da COMPOSIÇÃO do relatório (quais
   ensaios entraram) como texto sugerido e editável.

---

## 6. Auditoria visual — 32 páginas

Percorridas uma a uma. Nenhum campo amarelo inesperado, nenhum texto cortado
(depois de `e848ba6`), nenhum overflow, nenhuma tabela vazia, nenhuma foto
deformada (a proporção vem dos bytes e as imagens saem com tarja, não
esticadas), nenhuma quebra de página ruim, nenhum valor de outro container.

O que ficou registrado:

- **p22** (parecer do TH) usa ~20% da folha; o resto é branco. Não é erro de
  dado, é aproveitamento de folha.
- **p25–p32** são o PDF do **prontuário do fabricante** anexado à ficha —
  documento de terceiro (TEMPCALL/Braskem), dado de teste da conta.
- **p3** imprime, abaixo da placa reconstituída, um "registro fotográfico da
  placa" que na conta de teste é um anúncio. Dado de teste, não defeito.
- As 4 linhas de RECOMENDAÇÕES nascem amarelas e **não** contam como pendência
  enquanto estiverem inteiramente vazias — regra decidida na rodada 13,
  confirmada aqui: preenchi as quatro e o painel continuou em zero.

---

## 7. O que ficou aberto

1. **O `.pdf` no nome diverge entre os dois caminhos.** Renomear pela lista
   grava o texto puro ("RELATORIO DA IA"); salvar no editor passa por
   `nomeDoDocumento`, que garante a extensão ("RELATORIO DA IA.pdf"). O módulo
   diz que o nome é ao mesmo tempo a etiqueta e o nome do arquivo baixado — o
   certo é os dois caminhos usarem a MESMA função, mas isso muda o que a lista
   mostra. **Decisão do dono**, não tomada aqui.
2. **O snapshot de assinantes congela já no RASCUNHO.** Corrigir o cadastro do
   funcionário não alcança um documento em edição. O §7-bis existe para
   proteger o documento EMITIDO; para o rascunho, congelar cedo demais obriga a
   duplicar o relatório para aproveitar uma correção de cadastro.
3. **Prontuário do fabricante e foto da placa** entram no documento sem
   nenhuma marca de que são anexo de terceiro.
4. A navegação da barra "O que falta" **não rolou a prévia** até o campo nos
   grupos com mais de um campo (medido: o contador de página não se moveu).

## 8. Estado final

`REL-1789004119133` · nome **RELATORIO DA IA** · **RASCUNHO** · 32 páginas ·
24 documentos · container `cont1788990746084_78a10501` · 28 correções manuais ·
`pdfRef: null` · fora do índice oficial (rascunho não gera vencimento) ·
sobreviveu a F5, à reabertura e ao "Salvar rascunho" · selo **Sincronizado**.

**Não foi finalizado**, a pedido.
