# Fase 6 — Auditoria global dos documentos do sistema (24/09/2026)

Primeira rodada: mapear, medir, classificar. Nada vetorizado, nada redesenhado.
Uma correção local (P2 da calibração avulsa, §8). Um **P0 encontrado e NÃO corrigido**
(§9, decisão do dono). Medições de produção feitas por consulta somente leitura.

## 1. Flags que decidem o caminho

| flag | padrão | produção | efeito |
|---|---|---|---|
| `nr13_previa_documento` / `?previa=` | vetorial | nenhuma org grava | `iframe` = 27 templates (ROLLBACK) |
| `motorPossivel` / `?motor=raster` | vetorial | — | raster só junto com `?previa=iframe` |
| `nr13_motor_prontuario` / `?motorPront=` | vetorial | — | `atual` = raster (ROLLBACK) |
| `nr13_previa_prontuario` / `?previaPront=` | vetorial | — | `iframe` = folhas PRONT-* (ROLLBACK) |
| `?piloto=1` | desligado | — | bancada (PILOTO) |

## 2. Matriz principal

Tipos: **V** = VECTOR · **H** = HYBRID (texto vetorial + foto raster) · **R** = RASTER ·
**EXT** = EXTERNAL ORIGINAL · **LEG** = LEGACY HTML.

| Documento | Estado | Generator | Tipo | Final arquivado? | Regenera? | Standalone | Integrado | Portal |
|---|---|---|---|---|---|---|---|---|
| Relatório NR-13 — prévia/baixar/imprimir rascunho | ATIVO | `gerarRelatorioVetorial` (preview/final) | H | não | sim (rascunho) | — | — | — |
| Relatório NR-13 — finalizado | ATIVO | `gerarRelatorioVetorial` → `publicarArtefato` | H (+anexos) | **SIM** pdfRef+SHA | **não** | — | — | PDF final (URL assinada) |
| Relatório NR-13 — iframes/raster | ROLLBACK | templates + `gerarPdfBytes`/`imprimirRelatorio` | R/LEG | sim, se finalizar no rollback | — | — | — | — |
| Relatório legado sem pdfRef (≤12/08) | LEGADO | templates / vetorial ao imprimir | LEG / H | não | **sim** (ver P2-4) | — | — | iframes (não abre: P2-3) |
| Checklist · VE · VI · TH · Ultrassom — avulso | ATIVO | `gerarDocumentoDoEnsaio` = recorte de `gerarRelatorioVetorial` com `fontes` | H (V no US) | não (prévia) | sim | sim | sim (mesmo gerador) | — |
| Relatório de Imagens — avulso | ATIVO | `gerarRelatorioImagensPdf` | H | não | sim | sim | 8.4 | — |
| 8.4 Relatório de Imagens | ATIVO | `secaoRelatorioImagens` → `desenharFotosDescritas` | H | dentro do relatório | não | — | sim | no PDF final |
| Certificado de calibração interno — emitido (manômetro, PSV) | ATIVO | host isolado + html2canvas → pdf-lib (`emitirCertificado`) | **R** | **SIM** pdfRef+SHA | não | sim | pdf-lib copia os bytes (SHA conferido) | PDF final |
| Certificado interno — rascunho/legado | ATIVO (rascunho) | template em iframe + palco; print/baixar html2canvas | R/LEG | não | sim | sim | legado: rasterizado no relatório | legado: iframe |
| Termômetro, vacuômetro, pressostato, transmissor | ATIVO | — (sem folha interna) | — | — | — | só terceiro | quadro 7.1.1 | — |
| Certificado de laboratório externo (terceiro) | ATIVO | upload (bytes originais, SHA) | **EXT** | **SIM** (`certificados-externos/`) | nunca | sim | **não anexado** ao relatório | PDF original |
| Certificado do padrão (rastreabilidade) | ATIVO | upload `nr13_rastreab_` (sem SHA) | **EXT** | bucket `certificados/` | nunca | ver | pdf-lib `copyPages` | dentro do relatório |
| Prontuário gerado — prévia | ATIVO | `gerarProntuarioVetorial` | H (croqui PNG) | não | sim (mesmo com emissão) | sim | — | — |
| Prontuário gerado — emitido | ATIVO | idem → `publicarArtefato` | H | **SIM** | não | sim | — | **não aparece** (Portal remonta templates: P2-2) |
| Prontuário — iframes PRONT-* | ROLLBACK / Portal | templates + html2canvas | R/LEG | — | sim | — | — | **usado pelo Portal** |
| Prontuário anexado | ATIVO | upload `publicarArtefato` (bytes do usuário, SHA) | **EXT** | **SIM** | nunca | sim | — | **não aparece** |
| Prontuário do fabricante (legado) | LEGADO | upload `prontuario-fabricante/` ou base64 no registro, sem SHA | **EXT** | bucket (pasta NÃO protegida) | nunca | sim | — | PDF |
| Livro de registro — folha/capa/termo | ATIVO | template + html2canvas / `window.print` | R/LEG | **não** (lacre SHA do JSON) | sim | sim | **não sai no vetorial** (P2-1) | iframes |
| Livro completo | ATIVO | `exportarPdfLivroCompleto` (html2canvas, sem paginação) | R | não | sim | sim | — | — |
| Memorial | ATIVO | só tela (KaTeX); vai ao papel dentro do relatório/prontuário | V (no vetorial) | — | — | não | sim | — |
| Placa | ATIVO | `blocoPlaca` (vetorial) / `PLACA.html` | V | — | — | não | sim | — |
| Bancadas `PainelPiloto*` | PILOTO | raster + vetorial | — | sob demanda | — | — | — | — |
| `PRONT-P1..P4`, `P2B`, `CARACTERIZACAO`, `pront-footer.js`, `checklist1.html` | MORTO | — | — | — | — | — | — | — |

**Contagem** (tipos de documento distintos, sem duplicar estados): 17 —
ativos 14 · legado 2 (relatório sem pdfRef, fabricante) · EXT 4 (externo, padrão, anexado,
fabricante) · V 2 (memorial/placa, só integrados) · H 5 (relatório, avulsos, imagens, 8.4,
prontuário) · R 3 (certificado interno, livro folha, livro completo) · LEG = todo caminho em
iframe (rollback relatório/prontuário, Portal para prontuário/livro/legado).

## 3. Motores

| motor | onde | usado por |
|---|---|---|
| A · `Documento` vetorial (`pdfVetorial/documento.ts`, `primitivas.ts`, Carlito) | relatório, avulsos, 8.4, Relatório de Imagens, prontuário | **compartilhado**: 1 cabeçalho (`cabecalho()`), 1 rodapé (`rodape()`), 1 "Página X de Y" (duas passagens + conferência) |
| B · html2canvas de página inteira (`pdfService`, `printService`) | rollback relatório/prontuário, livro, certificado CAL rascunho/legado, Portal legado | rasteriza texto, tabela, assinatura |
| C · host isolado de certificado (`hostCertificado` + `folhaParaJpeg` + pdf-lib) | emissão e anexo do certificado CAL | raster de 1 folha |
| D · pdf-lib cópia de páginas | padrões, CAL emitido anexado, prontuário/relatório anexado | EXT preservado |
| E · templates HTML (`public/arquivos-*`) | rollback, Portal, livro, CAL rascunho | cabeçalho por template (`rel-cabecalho.js` + inline), `rel-empresa.js`, carimbo `rel-assinatura.js`, `pront-assinatura.js` |

Implementações distintas: **cabeçalho** 4 (vetorial; templates relatório; bloco da placa;
templates prontuário) · **paginação** 2 (vetorial "Página X de Y"; "Folha k/N" dos templates —
`pront-footer.js` é morto) · **assinatura** 6 (vetorial relatório `assinaturas()` bloco único;
vetorial prontuário `responsabilidadeTecnica()`; carimbo por folha `rel-assinatura.js`;
`pront-assinatura.js`; rubrica do certificado CAL inline; assinatura do livro inline) ·
**logo** 3 (vetorial `imagemEncaixada`; `rel-empresa.js`; placa). Não consolidado (§6 do pedido).

## 4. Fontes, logos, assinatura

- **Fonte**: vetoriais embutem Carlito (subconjunto pré-gerado, ~102+115 KB, 4 estilos,
  falha em vez de cair na Helvetica). Nenhum gerador escreve texto em Helvetica. Raster usa
  Inter rasterizada; EXT mantém as fontes originais.
- **Logo**: no vetorial é UM objeto de imagem reusado em todas as folhas (medido: a mesma
  SHA de imagem em toda página do PDF — `pdfAnalise.mjs`), não duplica. Em raster vai dentro
  da imagem de cada página. Snapshot `meta.empresa` com `logoRef` (sem base64).
- **Assinatura**: vetorial = bloco único ao fim (relatório) / última folha (prontuário);
  raster = carimbo por folha. Rubrica PNG em `nr13_lista_phs` (dataURL, 500 px) + `assinaturaRef`.

## 5. Tamanhos (produção, somente leitura)

| família | n | KB médio | KB/página |
|---|---|---|---|
| relatório raster (antes de 04/09) | 13 | — | **389** |
| relatório vetorial (desde 04/09) | 45 | — | **46** |
| certificado CAL interno (1 pág.) | 7 | 601 | **601** |
| prontuário gerado | 4 | 205 | 51 |
| prontuário anexado (EXT) | 2 | 395 | — |
| padrões de rastreabilidade (EXT) | 14 | 247 | — |
| fabricante (EXT) | 10 | 2322 | — |

Maiores: 8 relatórios raster de agosto (6,9–11,5 MB, 313–495 KB/pág.) — históricos, não se
regeneram. Maior vetorial: 5,1 MB/26 pág. (197 KB/pág.) — relatório com folhas de calibração
rasterizadas e certificados anexados; os demais vetoriais ficam em 37–41 KB/pág.

## 6. Efeitos colaterais de ações "somente leitura"

| ação | grava | classificação |
|---|---|---|
| Relatórios: imprimir/baixar | `nr13_uso_contadores` | ESPERADO |
| Relatórios: continuar rascunho | meta + injeções + retrofit de snapshots | ESPERADO (é o documento em montagem) |
| Relatórios: abrir relatório **legado sem pdfRef** | meta + injeções (globais) + retrofit no registro emitido | P3 — retrofit é regra do §7-bis; as `_atual` tocadas são do próprio documento aberto |
| Ensaio avulso / Relatório de Imagens | nada (Fase 5.1) | ok |
| **Prévia `?documento=1` de manômetro/PSV** | meta = `{}` + injeções, pelo `salvar` | **INDEVIDO → CORRIGIDO** (§8) |
| **Prontuários: abrir por link/lista** | `nr13_prontuario_atual`, `nr13_prontuario_meta_<TAG>` (cria), `nr13_assinantes_pront_<TAG>`, **`nr13_med_grid_<TAG>`/`nr13_med_esp_<TAG>` vazios** | **P0** (§9) |
| ListaProntuariosV9 / ficha | `nr13_pront_indice`, `pdfPendente→false` | ESPERADO (reconciliação/confirmação) |
| Calibrações / lote / livro (palco) | localStorage temporário restaurado; drena a ponte ao fechar | ok (drenagem: P3 leve) |
| Portal: relatório legado | tenta `salvar` meta/injeções → `ErroBloqueado`, não abre | P2-3 |

Leitores do **último estado global** (sem contexto explícito): relatório vetorial (esperado:
é o documento em montagem); **capa do prontuário vetorial** lê o responsável de
`nr13_relatorio_meta_atual` — o último relatório montado, que pode ser de outra TAG (P2-5);
`bytesArquivadosDaFolha`/`empresaTemLogo` (certificado) leem a meta viva (P3); templates
CERTIFICADO-CAL em iframe sem `fonte=registro` preferem `meta.certCalibracoes` do último
relatório (P3); templates PRONT-* leem `nr13_prontuario_atual` sem conferir TAG (rollback/Portal).

## 7. Finalizados, imutabilidade e Portal

| família | DB (trigger) | Storage | SHA | abre bytes arquivados? |
|---|---|---|---|---|
| relatório (`nr13_rel_`, `historico_indice`, `historico_relatorios`) | **sim** | `relatorios/` sem UPDATE/DELETE | sim | **sim** (exceção: legado sem pdfRef) |
| certificado CAL interno emitido / terceiro (`nr13_calibracoes_`, `nr13_calibracao_item_`) | **sim** | `certificados-calibracao/`, `certificados-externos/` | sim (download não reconfere) | sim |
| prontuário emitido/anexado (`nr13_pront_emitido_`) | **NÃO** (P2-6) | `relatorios/` protegido | sim | sim (sem reconferir) — mas o **Portal não usa** |
| índice de prontuários (`nr13_pront_indice`) | NÃO | — | — | — |
| fabricante (`nr13_pront_fab_`) | NÃO | `prontuario-fabricante/` **com DELETE/UPDATE** | não | sim |
| padrão (`nr13_rastreab_`) | soft-replace no cliente | `certificados/` protegido | não | cópia pdf-lib |
| livro (`nr13_livro_`) | **sim** (lacre encadeado) | sem PDF | SHA do JSON | remonta a folha (é o desenho do livro) |

## 8. P2 da calibração avulsa — CORRIGIDO (local)

**Root cause:** `PreviewDocumento.DocumentoEmIframes` — o caminho de templates dos
formulários `manometro`/`psv` — gravava pelo `salvar` `nr13_inspecao_atual`,
`nr13_injecao_atual` e `nr13_relatorio_meta_atual = {}` antes de montar o palco. Mesma classe
do defeito da 5.1. **Reproduzido no lab:** abrir `manometro?documento=1` e `psv?documento=1`
= 10 mutações, a meta de um relatório em montagem virou `{}` no servidor.

**Correção:** o caminho saiu. Nenhum container tem esses "ensaios" (`TipoEnsaio` não os
inclui; `FormularioManometro/PSV` não são montados) — só a URL digitada chegava lá. A tela
diz que o certificado se vê em Calibrações. **Depois, no lab: 0 mutações, servidor idêntico.**
Os outros 4 tipos não têm folha interna e não passam por aqui. As telas de Calibrações usam o
palco (localStorage temporário, restaurado) e o host isolado — sem escrita sincronizada.

## 9. P0 — abrir o prontuário apaga a medição de espessura da TAG — NÃO CORRIGIDO

`Prontuarios.tsx` `abrirEquipamento` → `aplicarEnsaioEspessura(tag, container)`: sem
container de ensaio escolhido no prontuário, grava pelo `salvar` `nr13_med_grid_<TAG>` VAZIA e
`nr13_med_esp_<TAG>` só com mínimos em branco. Essas chaves são as do editor de medições do
RELATÓRIO (grade digitada, espessura requerida manual, aparelho, acoplante…).

**Reproduzido no lab:** grade com dono + requerida manual `7,77` + aparelho → só ABRIR
`/prontuarios?tag=ZZ-PRONT-01` (prontuário emitido, nenhum clique de edição) → v14 → v15,
tudo vazio no servidor. Com container escolhido, a grade é sobrescrita pelo dado do container
(a edição manual também se perde).

**Exposição em produção (somente leitura):** nenhuma grade com dono (`containerId`) nem
requerida manual hoje — ou a edição manual não foi usada, ou já foi apagada (não há histórico
para distinguir). Várias TAGs têm grade vazia com versão alta (até v7). O relatório vetorial
recai nas medidas do container quando a grade está vazia, então relatórios finalizados usaram
o dado de campo.

**Por que não corrigido:** o prontuário vetorial LÊ essas mesmas chaves; a correção certa é o
padrão da 5.1 (entregar o container ao gerador do prontuário em vez de gravar chave da TAG),
o que muda a semântica do módulo de Prontuários. Opção mínima (não gravar quando não há
container) muda o que a folha 1 do prontuário mostra. Decisão do dono.

## 10. Paridade avulso × relatório

Checklist, ultrassom, VE, VI, TH: **mesma fonte** (container, entregue por `fontes`) e
**mesmo gerador** (`gerarRelatorioVetorial` com a composição do ensaio) — travado por
`paridadeEnsaios.test.ts`, `paridadeUltrassom.test.ts`, `avulsoSemEfeitoColateral.test.ts`.
Relatório de Imagens × 8.4: mesma fonte e mesmo desenho, provado por bytes (5.2).
Exceção: **Livro/Termo** — o avulso (tela do Livro) existe, o relatório vetorial não os
emite (P2-1).

## 11. URL direta sem cache

| rota | semeia? | risco de sobrescrita |
|---|---|---|
| `/equipamento/:tag`, `/memorial` | sim | não |
| `/inspecoes/:tag/:cid` | não → redireciona para `?tag=` que semeia | não |
| `/inspecoes/:tag/:cid/:formulario` | não | guarda "container não encontrado" (P2) |
| `?documento=1` | não | era manômetro/PSV — corrigido |
| `/relatorios?editor=1&rel=` | sim | registro do cache sem container grava `_atual` vazias (P3) |
| `/prontuarios?tag=` | sim (falha engolida) | **grava med_* vazios — P0 §9** |

## 12. Órfãos (somente mapeados; ação: nenhuma)

- 15 PDFs em `relatorios/` sem nenhuma linha que os cite (nem viva nem excluída): 129,9 MB,
  quase todos relatórios raster de agosto (5–12 MB); o Portal não os serve.
- `prontuario-fabricante/`: 2 PDFs órfãos (7,1 MB) + 1 não-PDF; `certificados-externos/` e
  `documento/`: 1 cada (0 KB, ZZ).
- Fotos: 67 principais (5,8 MB) + 26 miniaturas; componentes 3, placa 2, documento 4.
- Documentos de equipamento excluído: só na ZZ (13 relatórios de VASO A23/VASO 02/CALD-01/
  EQUIPE TESTE + índices; `nr13_pront_fab_ZZ-TESTE-F6-EQ`). Nenhuma org de cliente.

## 13. Prioridades

- **P0** — abrir prontuário apaga medição de espessura da TAG (§9).
- **P1** — nenhum.
- **P2-1** — relatório vetorial ignora `LIVRO-REGISTRO.html` e o Termo de Abertura, marcados por
  padrão (folha escolhida some em silêncio desde 04/09).
- **P2-2** — Portal mostra o prontuário remontado dos dados vivos, não o emitido; anexado não aparece.
- **P2-3** — Portal: relatório legado (sem pdfRef) não abre (`salvar` bloqueado para cliente).
- **P2-4** — relatório legado sem pdfRef: imprimir/baixar regeneram pelo vetorial com dados de hoje.
- **P2-5** — capa do prontuário vetorial usa o responsável da meta do último relatório (pode ser de outra TAG).
- **P2-6** — `nr13_pront_emitido_`/`nr13_pront_indice` sem trava no banco; `prontuario-fabricante/` com DELETE.
- **P2 (conhecido)** — URL direta sem cache; calibração avulsa (**corrigido local**).
- **P3** — órfãos no bucket; download/impressão de arquivado não reconferem SHA; `empresaTemLogo`
  lê a meta viva; iframes CAL sem `fonte=registro`; drenagem da ponte em palcos de leitura;
  prévia do prontuário regenerada mesmo com emissão; possível PDF vazio no "Baixar" da lista de
  lote (dedução, não executado); `definir*` sem UI.

## 14. Backlog de vetorização (não implementado)

| fase | documento | ganho | risco | dependências | testes |
|---|---|---|---|---|---|
| A | Certificado CAL interno (manômetro, PSV) | ALTO (601 KB/pág. raster → ~40; texto pesquisável; assinatura nítida) | médio — é documento emitido: só novas emissões; emitidos seguem arquivo | folha vetorial com `Documento`; rubrica/logo por ref | paridade campo a campo com o template, imutabilidade dos emitidos |
| A | Livro de registro (folha + termo + capa) no relatório vetorial | ALTO (resolve P2-1; fecha a paridade) | médio | seção nova no gerador; lacre/`livroCorte` já existem | sumário, composição, paridade com a folha do Livro |
| B | Livro completo / folha avulsa do Livro | MÉDIO | baixo | reusa a seção acima | — |
| B | Portal: prontuário pelo emitido | MÉDIO (P2-2) | baixo | não é vetorização: servir `nr13_pront_emitido_` | Portal lab |
| C | Rollbacks em iframe, Portal legado, PRONT-* | BAIXO (caminho de exceção/legado) | — | — | — |
| — | Fotos | NÃO vetorizar (HYBRID é o alvo) | — | — | — |
