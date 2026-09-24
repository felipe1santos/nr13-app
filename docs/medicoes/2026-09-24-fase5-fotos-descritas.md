# Fase 5 — Fotos com descrição individual + Relatório de Imagens (24/09/2026)

Primeira rodada: auditoria, implementação local, testes, E2E no laboratório (API 55321,
build do lab em 5174). **Sem push, sem deploy, sem migration.** Produção intocada.

## 1. Auditoria das fotos (antes de alterar)

Fluxo real de uma foto de campo:

| etapa | o que acontece | onde |
|---|---|---|
| entrada | `<input type=file accept=image/*>`, uma por vez, sem `capture` | formulários |
| pré-processamento | `comprimirParaBlob` 1200×1600 máx, JPEG 0,7; miniatura 400×533 q0,6 a partir da principal (best-effort) | `services/imagem.ts`, `fotos.ts` |
| caminho | `<org>/<TAG>_<ensaio>/<uuid>.jpg`, definido ANTES da rede; miniatura irmã `.thumb.jpg` | `fotos.montarPath` |
| offline | Blob no IndexedDB `nr13_fotos` (cofre) com `pendente:true`; drenagem em `online`/`visibilitychange` | `fotoStore.ts`, `drenarFotosPendentes` |
| upload | `storage.from('inspecao').upload(path, blob, { upsert: !final })` | `fotos.ts` |
| registro | `{ ref: {bucket,path,mimeType,tamanho,thumb?}, descricao }` dentro de `nr13_docs_<TAG>` (fila transacional da v2) | formulários → `salvarDadosFormulario` |
| leitura | `FotoImg`: cofre → URL assinada (1 h) → base64 legado | `components/FotoImg.tsx` |
| PDF vetorial | `resolverFotos` baixa ref → dataURL; `medirFotos`; grade 4/folha com legenda de 2 linhas | `gerarRelatorio.ts`, `documento.fotos` |
| PDF raster | palco hidrata `.base64` só na encenação; templates `*-FOTOS.html` | `palco.ts` |

Por ensaio (antes da Fase 5):

| ensaio | ID | descrição | ordem | remoção | offline |
|---|---|---|---|---|---|
| checklist (`fotosDocumentacao`, `fotos`) | nenhum — `key={idx}` | `descricao`, editada por ÍNDICE | posição do array, só acrescenta | `filter` por índice, arquivo fica | sim |
| visual externo / interno | nenhum | idem | idem | idem | sim |
| TH | nenhum | idem | idem | idem | sim |
| ultrassom | não aceita foto | — | — | — | — |
| ficha (`nr13_fotos_`) | numérico | não tem | array | não apaga arquivo (decisão explícita) | sim |

- **Base64:** só LEGADO (fotos anteriores a 10/08/2026) e a cópia efêmera do palco. Foto nova
  é só `ref`. Componentes de calibração ainda gravam base64 quando o upload falha (fora do escopo).
- **Remoção no bucket:** `services/fotos.removerFoto` (apaga principal + miniatura + cofre)
  **não tem chamador em produção**. Todo formulário só tira a referência → arquivo órfão,
  inofensivo. A policy do bucket permite DELETE nessas pastas (só as de documento final são
  travadas), mas nenhum caminho do app usa. Referência pode ser compartilhada (relatório
  emitido, rascunho duplicado) — por isso **nenhum delete novo foi criado**.
- **Duplicação:** quatro cópias quase idênticas do bloco adicionar/legenda/remover.
- **Riscos encontrados:** legenda presa à posição (remover a foto anterior durante a digitação
  ou um merge que reordene o array troca a legenda de foto); checklist/visuais sem tratamento de
  erro no `salvarFoto`.

## 2. Arquitetura adotada

- **Modelo único** `features/inspecoes/fotosDescritas.ts`: `{ id, ordem, ref, base64?, descricao }`.
  Nenhum schema novo: dois campos a mais no objeto que já existia.
  - id novo `foto-<uuid>`; foto antiga ganha id DERIVADO de `ref.path` (mesmo em qualquer
    aparelho, sem regravar); só a legada em base64 sem caminho recebe id posicional.
  - ordem explícita em `ordem` **e** o array mantido ordenado (templates e vetorial leem o array).
  - "Foto 01…" derivado da posição, nunca gravado.
  - normalização NA LEITURA; só vai ao storage quando o técnico edita (não retroativo).
- **Editor único** `EditorFotosDescritas.tsx` (upload múltiplo sequencial, ↑ ↓, Remover com
  confirmação na própria foto, estado vazio "Nenhuma imagem adicionada [Adicionar imagem]",
  alvos de 44 px). Atualizador funcional: upload que termina depois não apaga texto digitado.
- **Storage/offline reutilizados:** `salvarFoto` → cofre → fila das fotos → bucket; registro
  pela fila da v2. Sem segunda arquitetura de mídia.

## 3. Relatório de Imagens

- Novo `TipoEnsaio 'relatorio_imagens'` / formulário `'imagens'`, dentro de Inspeções
  (container → ensaio → salvar → visualizar documento).
- Dados próprios: `dataRegistro`, `observacoes`, `fotos`. Equipamento/cliente/empresa vêm da
  ficha pelo `montarModeloRelatorio` na geração — nada copiado.
- Rascunho livre; Baixar/Imprimir exigem ≥1 foto e todas descritas (`pendenciasParaEmissao`),
  regra só deste ensaio.
- Documento avulso (`documentoImagens.ts`): não arquiva, não grava `pdfRef` (mesmo padrão dos
  avulsos de ensaio). Foto que não carrega **para** a geração nomeando a foto — descartar
  renumeraria as seguintes.

### PDF (`pdfVetorial/relatorioImagens.ts`) — HÍBRIDO

Capa simples (título, T.A.G., tabela de identificação, observação) + folhas com grade de 2
colunas: "Foto NN", imagem em `contain` (quadro 87×78 mm), descrição INTEIRA embaixo. Altura
de cada linha da grade MEDIDA (a célula mais alta decide); linha que não cabe abre folha nova;
descrição que não cabe nem sozinha numa folha sai da grade e corre pelas folhas seguintes.
Cabeçalho/rodapé/"Página X de Y" do `Documento` (duas passagens + conferência do total).

`desenharFotosDescritas(doc, fotos)` recebe um `Documento` aberto: é o ponto de composição
para o relatório NR-13 completo.

### Relatório completo: NÃO integrado nesta rodada

Integrar exige: nome em `DOCUMENTOS_DISPONIVEIS` (o fluxo raster/iframe passaria a esperar um
template HTML com esse nome), ramo em `emitir()`, linha no sumário com numeração fixa, campo no
`ModeloRelatorio`, auto-injeção/seleção nos dois modais de criação e decisão de qual container
alimenta a seção. Não é pequeno nem isento de risco para o documento assinado — ficou o ponto de
composição pronto e o teste de paridade fica para quando integrar.

## 4. Outros ensaios

Checklist (2 grupos), visual externo, visual interno e TH passaram a usar o `EditorFotosDescritas`:
id estável, ordem persistida, descrição por id, ↑ ↓, remoção confirmada, tratamento de erro no
upload. A galeria somente leitura (`VisualizadorFormulario`) lê pela ordem e mostra "Foto NN".
**Não mudou:** folhas do relatório (vetorial e raster) — continuam com 4 fotos/folha e legenda
em 2 linhas; a exigência de descrição NÃO se aplica a eles.

## 5. Medição de tamanho (lab, imagens sintéticas)

Entradas PNG de 1,4 a 14,8 MB (1080×1920 a 4032×3024). Saída no bucket:

| variante | n | média | mín–máx | formato |
|---|---|---|---|---|
| principal (≤1200×1600, q0,7) | 15 | 50,8 KB | 27–89 KB | image/jpeg |
| miniatura (≤400×533, q0,6) | 15 | 6,9 KB | 5–8 KB | image/jpeg |

Imagem sintética comprime mais que foto real (comentário de `imagem.ts` mede ~98–150 KB para
foto de celular). Registro principal com 7 fotos: 6,9 KB para o `nr13_docs_` inteiro, sem
nenhum `data:`. PDF avulso com 6 fotos: 285 KB, 3 páginas. **Nenhum P0.**

## 6. E2E (lab) — `scratchpad/e2e5/imagens.mjs`: 32/32 PASS

Criar container com Relatório de Imagens → vazio → 6 fotos + 6 descrições → reordenar →
remover no rascunho → salvar/sincronizar → F5 → visualizar/baixar PDF (conferido pelo texto) →
390 px (sem rolagem lateral, 21 alvos ≥ 44 px) → OFFLINE (proxy derrubando conexão + CDP):
foto nova, descrição alterada, reordenar, salvar → fechar e reabrir o Chrome ainda offline
(7 fotos, ordem/descrições por id intactas, foto nova do cofre) → reconectar (servidor com as
7, arquivo no bucket, upload só depois) → F5 → PDF com 7 fotos → descrição vazia: rascunho salva,
Baixar/Imprimir desligados com o motivo.

Histórico: retrato de `nr13_rel_*`, `nr13_historico_indice_*`, `nr13_pront_emitido_*` e dos
objetos de `relatorios/`, `certificados*/` antes × depois — idênticos. Único diferente foi
`nr13_relatorio_meta_atual` (a meta VIVA, que o avulso zera como os outros avulsos; entrou no
filtro porque `_` é curinga do LIKE).

## 7. Riscos e pendências

- **P3** — o avulso zera `nr13_relatorio_meta_atual` (mesmo comportamento dos avulsos de ensaio
  desde 21/09): quem estiver com um relatório em montagem noutra aba perde a meta viva.
- **P3 (anterior à fase)** — abrir a URL de um formulário direto num aparelho que nunca semeou
  a TAG mostra o formulário vazio (a guarda impede gravar por cima). Vale para todos os ensaios.
- **P3** — fotos removidas do rascunho ficam órfãs no bucket (política atual, sem delete).
- Integração ao relatório completo + teste de paridade: pendente (§3).
- Texto corrido de descrição gigante não repete o título "IMAGENS (continuação)" nas folhas
  de continuação do texto.

## 8. Fase 5.1 — documento avulso é LEITURA pura (24/09/2026)

### Root cause (matriz antes de alterar)

| porta | tipos | gravava | por quê existia |
|---|---|---|---|
| `documentoVetorial.gerarDocumentoDoEnsaio` | checklist, ultrassom, visual externo, visual interno, TH | `nr13_inspecao_atual` + `nr13_injecao_atual` (= `container.dados`) **e** `nr13_relatorio_meta_atual = {containerOrigemId}` | `montarModeloRelatorio` só sabia ler CHAVES. As injeções levavam o dado do container; a meta levava `containerOrigemId` (grade de espessura do container certo, defeito de 10/09) e zerava código/data/assinantes/empresa para o cabeçalho não herdar o último relatório |
| `documentoImagens.gerarDocumentoImagens` | Relatório de Imagens | `nr13_relatorio_meta_atual = {containerOrigemId}` | idem, para a empresa não sair do snapshot do último relatório |
| `PreviewDocumento.DocumentoEmIframes` | manômetro, PSV | injeções + meta `{}` | templates HTML leem `localStorage` (palco). **Inalcançável por container** (`TipoEnsaio` não tem calibração; só por URL digitada `?documento=1`). Não alterado — P3 |

As três são chaves VIVAS e sincronizadas do relatório em montagem: abrir "Ver documento" numa
aba apagava a meta e os dados de campo de um relatório sendo montado noutra (e o sync espalhava).
Havia também um segundo leitor escondido: `carregarMedicoes` relia `nr13_injecao_atual`.

### Correção (sem estado paralelo)

`montarModeloRelatorio(tag, fontes?)` e `gerarRelatorioVetorial(tag, { fontes })` recebem
`FontesDoModelo = { meta, inspecao, injecao }`; `carregarMedicoes(tag, container, us?)` recebe o
ultrassom. Ausente = lê as chaves, como sempre (relatório completo intocado). As duas portas do
avulso entregam as fontes e não gravam nada. O que impede seção indevida é a COMPOSIÇÃO
(`documentos` = folhas do ensaio), não a meta.

### Prova — `avulsoSemEfeitoColateral.test.ts` (18)

Aba A deixa meta (`REL-ABA-A-0042`, ART, empresa congelada, assinante) e campo nas chaves vivas;
aba B gera os 6 avulsos de outro container. Storage inteiro idêntico chave a chave, zero chamadas
ao servidor, cada avulso só com o seu ensaio e os dados do container dele, nenhum com a meta da
aba A, e o relatório completo continua lendo a meta viva. **Mutante** (portas antigas): 6 falhas,
inclusive o relatório completo perdendo a meta da aba A — o defeito reproduzido.

### Achados reclassificados

- **P2** — URL direta do formulário com a TAG não semeada: formulário vazio, mas salvar/autosave
  é RECUSADO (`não encontrado no cache`) e nenhum documento é gerado (provado no mesmo teste).
  Resíduo teórico: se a TAG fosse semeada por outro caminho com o formulário vazio ainda aberto,
  a próxima edição salvaria o estado vazio — nenhum caminho da tela faz isso hoje.
- **P3** — foto removida do rascunho fica órfã no bucket (sem delete nesta fase).
- **Corrigido** — texto corrido de descrição gigante repete "IMAGENS (continuação)" em cada folha.

### Duas abas no navegador real (lab, v2 + sync) — `scratchpad/e2e5/duasAbas.mjs`: 12/12

Meta viva `REL-ABA-A-E2E-51` + campo gravados no servidor; aba A em `/relatorios`; aba B (mesmo
navegador, mesma sessão) abre os avulsos de checklist, ultrassom, visual externo, visual interno,
TH e o Relatório de Imagens. 23 POSTs no período, **0** com meta/injeção (o único
`aplicar_mutacao_storage` foi o container, do "Visualizar documento" que salva o formulário).
Servidor antes = depois: `meta_atual v17`, `inspecao_atual v26`, `injecao_atual v20`, mesmos md5.
Aba A "Sincronizado". Retrato do histórico (relatórios, índices, prontuários, arquivos finais):
0 diferenças.

## 9. Fase 5.2 — Relatório de Imagens no relatório NR-13 completo (seção 8.4)

### Auditoria (antes de alterar)

- **Seleção:** dois assistentes usam `DOCUMENTOS_DISPONIVEIS` — `ModalCriarRelatorio` (tela
  principal, 3 etapas: folhas → container → revisão) e o antigo `ModalNovaInspecao`. As folhas
  de ensaio (`ENSAIOS`) nascem DESMARCADAS; a revisão oferece o ensaio só se o container tem
  dado salvo (`ensaiosRevisaveis` ← `DOC_DO_ENSAIO`), e é marcar/desmarcar a mesma lista.
- **Composição:** `documentosFinais` ordena pela lista canônica; vai para `meta.documentos` e
  para `RelatorioSalvo.documentos` (a composição do rascunho). O motor vetorial decide cada
  seção por `secoesPresentes(documentos)` (`composicao.FOLHA_DA_SECAO`).
- **Container de origem:** `meta.containerOrigemId`; os dados de campo entram por
  `nr13_inspecao_atual`/`nr13_injecao_atual` gravadas ao ABRIR o rascunho (§2) — o rascunho
  usa a versão ATUAL do ensaio a cada abertura, sem snapshot; o finalizado é o arquivo (§7-quater).
- **Ordem:** o vetorial emite … 7.2, 7.3, 7.4, 7.5 (+8.3) e só então o parecer (9). O bloco 8 é
  "registro fotográfico" com números fixos 8, 8.0–8.3.

### Integração

- Folha `RELATORIO-IMAGENS.html` em `DOCUMENTOS_DISPONIVEIS` (depois do TH), marcada como
  ensaio nos dois assistentes; `DOC_DO_ENSAIO`/`DOCS_POR_FORMULARIO` apontam o ensaio para ela;
  a revisão só a oferece para container COM foto.
- **Só vetorial** (`FOLHAS_SO_VETORIAIS`/`temTemplateHtml`): os caminhos de iframe (rollback
  `?previa=iframe`/raster e Portal legado) a pulam; fora do carimbo por folha.
- Seção **8.4 RELATÓRIO DE IMAGENS**, depois do TH e antes do parecer, com linha no sumário.
  Dado: `modelo.relatorioImagens.fotos = normalizarFotos(inj.imagens.fotos)` — a MESMA fonte e
  a MESMA normalização do avulso. Desenho: `prepararFotosDescritas` → `secaoRelatorioImagens` →
  `desenharFotosDescritas` — o MESMO do avulso; muda só o título e a moldura (cabeçalho, rodapé
  e paginação do relatório). Sem capa do avulso.
- Regra de emissão também no relatório: com a 8.4 escolhida, finalizar exige ≥1 foto e todas
  descritas (pendência obrigatória em `validarParaFinalizar` + trava em `salvarHistorico`).

### Provas

- `integracaoRelatorioImagens.test.ts` (22): paridade pelos BYTES (espião no `addImage`) para
  1/6/31 fotos e descrição gigante; sem a seção = mesmo documento de um container sem imagens;
  mutante (reordenar + re-descrever no ensaio muda os dois juntos); validação; fiação.
- E2E lab `scratchpad/e2e5/e2e52.mjs`: **25/25** — opção real no passo 1 (desmarcada, selo de
  ensaio), oferecida na revisão, composição persistida no rascunho; avulso × integrado com as
  mesmas 6 fotos na mesma ordem (SHA das imagens no content stream); sem a 8.4 = 2 folhas a
  menos e nenhuma foto; reorder + reabrir o rascunho → os dois na nova ordem; finalizado com
  pdfRef/SHA (`5aa6cb09…`) e, depois de alterar o ensaio, o MESMO SHA e os mesmos bytes; 390 px
  sem overflow no assistente (itens 59/44 px). Duas abas (5.1) repetido: 12/12.
