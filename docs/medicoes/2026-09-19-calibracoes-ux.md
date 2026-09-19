# Calibrações — reestruturação de UX (medição do E2E local, 19/09/2026)

Branch `calibracoes-ux` (a partir de `6bf3870`). Somente laboratório local; Chromium headless
(Playwright) com login por magic link do admin local. Produção intocada; sem push/deploy.

## Preparação

- Equipamento `ZZ-CAL-UX` (serviço de criação, unidade Petrobras) com cliente `CLIENTE ZZ UX LTDA`.
- Padrões pela tela **Certificados** (fonte oficial, sem cadastro paralelo):
  `ZZ-PADRAO-01` (manômetro, série PS-1556, cert. LAB-2026-5512, val. 31/01/2027) e
  `ZZ-PADRAO-PSV` (válvula, BT-2020, LAB-2026-7788, val. 05/10/2026 → "vence em até 30 dias").

## Manômetro (desktop 1366 px)

`/calibracoes` → **Nova calibração** (visível) → busca `ZZ-CAL-UX` → "Cadastrar novo
componente" → `ZZ-MAN-01` (WIKA, 232.50, MAN-UX-777, 0 a 16, bar, pontos 0/4/8/12/16) → volta
**já selecionado** → Continuar → **janela** (URL continua `/calibracoes`, `data-modo=modal`;
Tela cheia → `cheia`; Recolher → `modal`).

Derivado na janela, sem digitar: item (nome, fabricante, modelo, série, faixa, unidade,
cliente), padrão (pré-selecionado por ser o único; série, certificado, validade + "Certificado
válido"), nº `CERT-1789788759749`, emissão "definida na emissão", responsável (único
cadastrado), texto da conclusão (padrão ao escolher "Aprovado"), pontos da coluna padrão.

Inputs de texto na janela: **5** — data da calibração, próxima, temperatura, umidade, local.
Digitado na calibração: as 2 datas, 23 °C, 58 %, Oficina ZZ, 10 leituras (5 subindo, 5
descendo) e a escolha "Aprovado". ✕ com alteração → "Há alterações não salvas…" (Continuar
editando); clique fora → janela continua aberta. Salvar rascunho → toast com o nº, janela fecha,
página no mesmo lugar.

**F5** → equipamento → clique no acessório → histórico (RASCUNHO, mesmo nº) → Continuar →
todos os valores de volta → **Emitir**. Servidor: `status=emitido`, `dataEmissao=19/09/2026`,
`padraoId`, snapshot do padrão e do item, `componenteId`, SHA do objeto no bucket = SHA gravado
(`1d47edda…`). Página emitida conferida visualmente: todos os dados automáticos presentes.

## PSV (celular 390 px)

Mesmo fluxo em 390×844: `scrollWidth = clientWidth = 390` na lista e na janela (janela ocupa a
tela). Cadastro PSV mostra só os campos dela (+ pressão de ajuste; sem pontos). Padrão da
válvula derivado com aviso "Vence em até 30 dias". Pressão de ajuste pré-carregada do cadastro
(12). Digitado: 2 datas, 24 °C, 61 %, local, abertura 12,1, fechamento 11,4, "Aprovado".
**Emitido direto da janela**: `CERT-1789789169335`, emissão 19/09/2026, SHA `cb7755e2…` =
objeto no bucket. Observação: o 1º run criou o componente `ZZ-PSV-01` e falhou no roteiro
(botão "Revisar resultados"); o fluxo foi repetido com `ZZ-PSV-02`.

## Offline

Gateway do Supabase parado → boot com dados do aparelho → histórico → Nova calibração →
padrão veio do cache (boot essencial) → Salvar rascunho: fila 0 → 2, servidor 0. **F5 offline**:
fila 2, rascunho no cache. Gateway de volta → fila 0; servidor com
`nr13_calibracao_item_cal-1789789333885` (rascunho) e a lista.

## Compatibilidade

Histórico do `Manômetro principal` (ZZ-E2E-PB): "REGISTRO ANTERIOR" (CAL-E2E-001, sem status)
e "EMITIDO" (CAL-F2-001) lado a lado; o legado abre pelo template, sem o bloco novo.

## Achado e corrigido durante o E2E

O histórico do componente ficava POR CIMA da janela da calibração aberta a partir dele (ordem
no DOM). Movido para antes da janela.

## Lab

Na preparação, dois registros de padrão foram gravados em cartões errados pelo roteiro
(ultrassom e manômetro); corrigidos pelo mesmo serviço da tela (versões novas; as erradas
ficaram substituídas). Só no laboratório.

## Rodada final antes do rollout (19/09/2026)

**PDF do padrão exato.** `rastreabilidadesParaRelatorio` resolve cada folha de calibração pelo
`padraoId` (versão) → registro → PDF, com `padraoPdfRef` congelado como segunda via. Lab:
dois padrões de manômetro ativos (A: LAB-2026-5512, PDF 1 pág.; B: LAB-B-9001, PDF 3 págs.);
calibração com **B** emitida (`CERT-1789792166519`). B renovado para LAB-B-9002 (PDF 5 págs.;
v1 substituída); calibração nova com C2 (`CERT-1789792476106`). Relatório com as duas: págs.
13–14 os certificados emitidos; **15–19 = PDF LAB-B-9002**, **20–22 = PDF LAB-B-9001**; PDF do
padrão A **ausente**.

**Contador.** Cartão ZZ-CAL-UX: "3 calibrações" → salvar rascunho → **"4 calibrações"** na hora
→ drenagem + F5 → "4 calibrações" (projeção) → emitir → 4.

**Rodapé.** Rotina `caberNaFolha` nos dois certificados. Medido (px, A4 = 1123): PSV curto
1123 / folga 23; PSV "Unidade Industrial — Área de Utilidades e Casa de Caldeiras" era 1135
(passava do A4) → **1123 / folga 68** (passo 1); texto ainda maior → 1123 / folga 52. Manômetro
extremo → 1123 / folga 26 (3 passos, fonte 10,5 px). PSV emitida em 390 px com o Local longo:
página conferida, rodapé intacto.

**Saída protegida.** ESC → faixa de confirmação; F5 com alteração → `beforeunload` do navegador
(janela continua aberta ao cancelar); rota interna → `useBlocker`.

**Offline.** Gateway parado → Nova calibração → Salvar rascunho → fila +2, servidor 0 → F5 →
fila mantida, rascunho no cache → gateway de volta → item e lista no servidor. A fila ficou com
1 item: conflito antigo em `nr13_relatorio_meta_atual` (duas instâncias gerando relatório — já
em PENDENCIAS), não é das calibrações.

**Imutabilidade.** md5 do relatório REL-1789756839955 e dos registros de certificado emitidos
(CAL-F2-001, CERT-1789788759749, CERT-1789789169335) + o legado cal-e2e-pb: idênticos antes e
depois; SHA dos 4 arquivos no bucket = SHA gravado.
