# FASE 5 — Fotos: thumbnail, EXIF e teto de altura

**Achado:** A-08 (R-11). **Plano macro:** `2026-08-15-evolucao-arquitetura.md`, seção "FASE 5".
**Portão:** nenhum portão formal fecha nesta fase (P3 fechou na Fase 4; o próximo é P4, na Fase 7).

---

## Estado atual da fase

`🔵 PLANEJAMENTO / BASELINE` — **nada implementado**.

| Etapa | Estado |
|---|---|
| Ler a Fase 5 no plano macro | ✅ FEITO (20/08) |
| Reler achados de foto/Storage/egress/IndexedDB/offline/base64 | ✅ FEITO (20/08) |
| Mapear o AS-IS | ✅ FEITO (20/08) |
| Colher baseline | ✅ FEITO (20/08) — ver `## Baseline` |
| Criar o task-level | ✅ FEITO (este arquivo) |
| Apresentar o plano ao dono | ✅ FEITO — as 3 decisões voltaram aprovadas |
| **Implementar** | ✅ **T1…T8 IMPLEMENTADAS E COMMITADAS** — 6 commits, suíte 1107/1107, build verde |
| Push `main` | ✅ `485c024` |
| Redeploy | ✅ feito pelo dono em 20/08 · bundle `index-Bx8gMJyu.js` |
| **Validar em produção** | 🟢 **12 de 12 itens PASSARAM** · A-F5-02 corrigido e confirmado · A-F5-01 encerrado · **falta apenas a comparação visual das 6 fotos de referência** — `docs/medicoes/2026-08-20-fase5-producao-antes-depois.md` |
| **T10 — correção A-F5-02** | ✅ **CONFIRMADA EM PRODUÇÃO** (bundle `index-Ite3xGkv.js`): 1.100,9 KB → **92,9 KB**, exatamente o previsto |

---

## AS-IS

Levantado por leitura de código em 20/08/2026. Arquivos: `src/services/imagem.ts`,
`src/services/fotos.ts`, `src/services/fotoStore.ts`, `src/components/FotoImg.tsx`,
`src/services/palco.ts`.

### Caminho completo, ponta a ponta

```
<input type=file capture>  (5 telas — ver tabela)
  └─> salvarFoto(file, escopo)                                     fotos.ts:110
        └─> comprimirParaBlob(file, larguraMax=1200, qual=0.7)     imagem.ts:9
              new Image() + URL.createObjectURL
              escala = min(1, 1200 / img.width)      <-- SÓ LARGURA
              canvas.toBlob('image/jpeg', 0.7)
        └─> salvarArquivo(blob, escopo, 'jpg', 'image/jpeg')       fotos.ts:134
              org  = escopoStorageAtual().id
              path = <org>/<pastaSegura(escopo)>/<uuid>.jpg   <-- decidido ANTES da rede (I-14)
              ref  = { bucket:'inspecao', path, mimeType, tamanho }
              cofre.guardar({ path, blob, pendente:true })         fotoStore.ts (IndexedDB nr13_fotos)
              enviarPendente(path).catch(() => {})                 <-- falhar é NORMAL em campo
        └─> devolve RefFoto  ->  gravada no registro do app_storage
```

Leitura:

```
FotoImg  ->  IntersectionObserver(rootMargin 300px) + rede de segurança de 1200 ms
         ->  resolverFoto(foto)                                    fotos.ts:355
              1. objetos.get(path)          (objectURL já criado, em memória)
              2. cofre.obter(path)          -> URL.createObjectURL(blob)   <-- offline, egress 0
              3. urlAssinada(path)          -> cliente: Edge portal_arquivo (TTL 300 s)
                                               interno: createSignedUrl    (TTL 3600 s)
              4. base64 legado (I-26)
```

Documento (relatório/prontuário):

```
palco.hidratarFotosDoBucket(itens)                                 palco.ts:701
  -> baixarFoto(ref)   (cofre -> bucket)  -> blobParaDataUrl -> embute no campo src/base64
  -> degradação por passos SÓ em nr13_fotos_ (ehChaveDeFoto): q 0,60/0,45/0,35 -> w 900/700/560
```

### Tabela do estado atual

| Pergunta do dono | Resposta medida no código |
|---|---|
| Onde a original é criada | `comprimirParaBlob` (`imagem.ts:9`), no navegador, antes de qualquer rede |
| Dimensões atuais | largura ≤ **1200 px**; **altura SEM TETO** — retrato 3:4 vira **1200×1600** |
| Qualidade JPEG | **0,7** (padrão de `salvarFoto`; nenhum call site passa outro valor) |
| Tamanho médio real | **87,7 KB** ponderado no bucket inteiro (206 fotos, baseline 16/08) |
| Tratamento de EXIF | **NENHUM explícito.** Depende do padrão do navegador (`image-orientation: from-image`); `drawImage` sobre um `<img>` moderno já sai orientado, mas **não há garantia no código nem teste** |
| Orientação física preservada | Sim **por herança**, não por contrato |
| Onde existe thumbnail hoje | **em lugar nenhum** |
| Onde NÃO existe | todas as listas, cards e galerias — ver tabela de consumidores |
| Telas que baixam original podendo usar thumb | `Equipamentos`, `CardEquipamento`, `Inspecoes`, `Relatorios` (grade), `Calibracoes` (componentes), `Galeria`, `PortalAtivos`, `PortalAtivo`, e as grades dos 4 formulários de inspeção |
| Lazy loading | `FotoImg` com `IntersectionObserver` (`rootMargin: 300px`) + `loading="lazy"` no `<img>` + rede de segurança de 1200 ms (contêiner de altura zero, corrigido em 11/08) |
| Comportamento offline | Blob no cofre ANTES do upload; `resolverFoto` acha o blob local primeiro; fila drena em `online` **e** `visibilitychange` |
| Cache em IndexedDB | `nr13_fotos` / store `fotos` / keyPath `path` / índice `pendente`. O blob **permanece depois de enviado** — é cache de leitura offline |
| Signed URLs | Nunca persistidas. Cache em memória (`assinadas`), TTL 3600 s interno (margem 5 min) / 300 s Portal (margem 30 s) |
| Compatibilidade com fotos antigas | `resolverFoto` aceita `string` base64 e `FotoArmazenada.base64` (I-26) |
| Base64 residual | Persistente em **3 caminhos de fallback** (`rastreabilidadeService`, `componentesService`, `ProntuarioFabricante`), nunca retomado — é o **A-10, Fase 6**, fora desta fase. Também é a forma que a foto assume DENTRO do palco (A-12), por exigência dos templates |
| Como as fotos entram nos PDFs | `palco.hidratarFotosDoBucket` → `baixarFoto` → `blobParaDataUrl` → campo `src`/`base64` do JSON → template lê síncrono no `DOMContentLoaded` → `html2canvas` rasteriza |

### Onde a foto é escrita (5 pontos)

| Tela | Escopo do path | Arquivo |
|---|---|---|
| Galeria do equipamento | `<TAG>` | `features/equipamento/Galeria.tsx:31` |
| Checklist (inclui `fotosDocumentacao`) | `<TAG>/checklist` | `.../FormularioChecklist.tsx:248` |
| Teste hidrostático | `<TAG>/th` | `.../FormularioTH.tsx:86` |
| Visual externo | `<TAG>/visual-externo` | `.../FormularioVisualExterno.tsx:97` |
| Visual interno | `<TAG>/visual-interno` | `.../FormularioVisualInterno.tsx:97` |

Todos passam por `salvarFoto` — **um único ponto de compressão**. É o que torna esta fase barata.

### Onde a foto é lida (18 pontos de `FotoImg`)

| Tela | Tamanho renderizado | Precisaria da original? |
|---|---|---|
| `Equipamentos.tsx:303` (lista) | card | **não** |
| `CardEquipamento.tsx:67` | card | **não** |
| `Inspecoes.tsx:150` | miniatura | **não** |
| `Relatorios.tsx:732` | miniatura | **não** |
| `Calibracoes.tsx:518,685` (componentes) | ~20–24 px | **não** |
| `Calibracoes.tsx:474` (capa do equipamento) | card | **não** |
| `portal/PortalAtivos.tsx:31` | card | **não** |
| `portal/PortalAtivo.tsx:480,633` | card / ~26 px | **não** |
| `Galeria.tsx:68` | grade de miniaturas | **não** na grade; **sim** ao ampliar |
| `Equipamento.tsx:227` (capa) | foto grande | **sim** |
| 4 formulários de inspeção (grades) | miniatura | **não** |
| `VisualizadorFormulario.tsx:85` | miniatura | **não** |

**Nenhum** desses caminhos passa pelo palco: o documento usa `baixarFoto`, não `FotoImg`.
É a separação que permite a miniatura existir sem tocar no documento assinado.

---

## Baseline

**Colhido em 20/08/2026.** Escrita SOMENTE na conta `teste@gmail.com`, organização
`99f642d3`, equipamento `ZZ-TESTE-P2`, arquivos nomeados `ZZ-TESTE-FOTO-1..10.jpg`.
Nenhum dado de cliente real foi tocado.

> **A massa de teste FICA no ar de propósito.** Ela é a régua do "depois": a mesma
> galeria, medida do mesmo jeito, é o que prova (ou desmente) o ganho da Fase 5.

### B-0 · Método e limite declarado

As 10 fotos de origem são **sintéticas**, geradas em canvas a 4032×3024 e 3024×4032
(7 paisagens + 3 retratos), com ruído, manchas e traços para ter densidade de detalhe
parecida com a de uma foto de câmera, e salvas a q0,92 — **1,59 a 1,67 MB cada**, que é a
ordem de grandeza de uma foto de celular. Foram entregues ao `<input type=file>` REAL da
galeria, então o caminho exercitado é o de produção: `handleUpload` → `salvarFoto` →
`comprimirParaBlob` → cofre → upload → `RefFoto`.

**Limite:** conteúdo sintético não é foto de corrosão. Por isso todo número **absoluto**
abaixo é conferido contra a única medida real disponível — a média ponderada do bucket
inteiro em 16/08: **87,7 KB em 206 fotos**. As fotos sintéticas saíram em **115,2 KB de
média**, ou seja **31 % mais pesadas** que a realidade. Para o número que interessa (a
RAZÃO thumb/original) isso é conservador nos dois sentidos e está declarado.

### B-1 · O que o sistema guarda hoje, por foto

| # | Origem | Guardado no bucket | Dimensão guardada |
|---|---|---|---|
| 1–7 (paisagem) | 4032×3024, 1,60–1,67 MB | **98,4 a 105,3 KB** | **1200×900** |
| 8–10 (retrato) | 3024×4032, 1,59–1,64 MB | **142,1 a 149,5 KB** | **1200×1600** |
| **Total das 10** | ~16,3 MB | **1.152,3 KB** | — |
| **Média** | — | **115,2 KB** | — |

**O retrato custa 1,42× o que a paisagem custa**, porque a escala é só por largura: o
retrato guarda 1,92 Mpx contra 1,08 Mpx da paisagem. É o A-08 em número.

### B-2 · Onde essas fotos são desenhadas (medido no DOM/CSS, não estimado)

| Tela | Caixa de renderização | O que é decodificado |
|---|---|---|
| Galeria da ficha (`.galeria-foto-item`) | **100×70 CSS** (medido: 97×67) | **1200×900 / 1200×1600** |
| Card da lista (`.plate-photo`) | 180 px de altura; largura ≥260 (grid `minmax(260px,1fr)`); medido **293×180** no desktop | idem |
| Card do Portal (`.portal-card-foto`) | **74×74 CSS** | idem |
| Calibrações — equipamento (`.cal-eq-foto`) | **96×96 CSS** | idem |
| Calibrações — componente (`.cal-comp-foto`) | **44×44 CSS** | idem |
| Formulário de inspeção (`.foto-formulario-item img`) | 110 px de altura, 2 col no celular / 4 col no desktop | idem |
| Capa da ficha (`Equipamento.tsx:227`) | grande, **~1180 px** de largura | idem — **e aqui está certo** |

**A galeria decodifica 1200×900 para pintar 97×67.** É uma imagem **12× maior em cada
lado**, ou **~150× em área**, do que o pixel que chega na tela.

### B-3 · Cenário CACHE FRIO — galeria com 10 fotos

Cofre local esvaziado (só as 10 chaves, todas já confirmadas no servidor), recarga
completa da página.

| Medida | Valor |
|---|---|
| Requisições ao Storage | **21** (11 × `POST /object/sign` + 10 × `GET` da imagem) |
| Bytes de imagem transferidos | **1.152,3 KB** (confirmado byte a byte: o mesmo total voltou ao repovoar o cofre) |
| Última imagem pronta — 1ª carga | **5.995 ms** |
| Última imagem pronta — 2ª carga (app já hidratado) | **1.371 ms** (1ª imagem em 833 ms, duração média por imagem 404 ms) |

> **21 requisições para 10 fotos.** Um caminho é assinado **duas vezes** — a foto de capa é
> pedida pela capa da ficha e pelo item da galeria ao mesmo tempo, e o cache de
> `urlAssinada` só guarda o resultado **depois** que a primeira chamada volta. Duas chamadas
> simultâneas ao mesmo `path` viram duas assinaturas. Ver N-02.

### B-4 · Cenário CACHE QUENTE — mesmo aparelho que tirou a foto

| Medida | Valor |
|---|---|
| Requisições ao Storage | **0** |
| Bytes | **0** |
| Fotos exibidas | **10 de 10** (conferido por captura de tela) |

O cofre resolve tudo. **Este é também o caminho offline**, porque `resolverFoto` tenta o
cofre antes de qualquer rede — o mesmo desenho que a Fase 5 não pode quebrar.

### B-5 · Achado NOVO N-01 — o cofre nunca é repovoado por download

`resolverFoto` e `baixarFoto` **leem** o cofre; quando não acham, usam a URL assinada e
**não gravam o blob de volta**. O cofre só é preenchido por `salvarArquivo`, ou seja, **no
aparelho que capturou**.

Consequência medida: **duas recargas seguidas da mesma galeria baixaram as mesmas
1.152,3 KB** (11 assinaturas + 10 GET em cada uma). E o cache HTTP do navegador não ajuda:
cada assinatura gera um `?token=` novo, então a URL muda a cada carga e **nunca casa com a
entrada anterior do cache**.

Quem paga isso é o computador do escritório — que nunca tirou foto nenhuma e é justamente
onde a documentação é montada.

### B-6 · Achado NOVO N-02 — assinatura duplicada por concorrência

Ver B-3: 11 assinaturas para 10 caminhos distintos. `urlAssinada` (`fotos.ts:324`) preenche
o mapa `assinadas` só na volta da chamada; não há registro de chamada **em voo**. Custo
pequeno (uma requisição por caminho pedido em paralelo), mas cresce com o tamanho da lista.

### B-7 · Escada de tamanho da miniatura — medida na mesma fonte calibrada

Fonte 4032×3024. Original de referência (**1200 px, q0,7**): **111,8 KB**.

| Largura do thumb | q0,6 | q0,7 | Redução (q0,6) | Densidade num card de 360 CSS px |
|---|---|---|---|---|
| 240 px | **6,9 KB** | 8,6 KB | **93,8 %** | 0,67× (borrado) |
| 320 px | **11,0 KB** | 13,9 KB | **90,2 %** | 0,89× |
| 400 px | **16,1 KB** | 20,2 KB | **85,6 %** | 1,11× |
| **480 px** | **21,8 KB** | 27,3 KB | **80,5 %** | **1,33×** |
| 560 px | 28,0 KB | 34,8 KB | 75,0 % | 1,56× |
| 640 px | 34,9 KB | 43,2 KB | 68,8 % | 1,78× |
| 800 px | 50,3 KB | 61,7 KB | 55,0 % | 2,22× |

A coluna de densidade é o ponto que o plano macro não tinha: **o maior consumidor de
miniatura não é a galeria de 100 px, é o card da lista**, que no celular ocupa a largura
toda (~360 CSS px) com `object-fit: cover`. Num aparelho DPR 3 o card pede 1.080 px de
verdade; nenhuma miniatura razoável entrega isso, e não precisa — mas 320 px entrega
**menos** pixels do que o card tem em CSS.

### B-8 · Teto de altura — onde ele morde e onde não morde

| Proporção da fonte | Hoje | Com teto 1200×1600 | Diferença |
|---|---|---|---|
| 4:3 paisagem (4032×3024) | 1200×900 · 112,6 KB | 1200×900 · 112,6 KB | **nenhuma** |
| 3:4 retrato (3024×4032) | 1200×1600 · 171,0 KB | 1200×1600 · 171,0 KB | **nenhuma** |
| 16:9 paisagem (4032×2268) | 1200×675 · 88,1 KB | 1200×675 · 88,1 KB | nenhuma |
| **9:16 retrato (2268×4032)** | **1200×2133 · 195,2 KB** | **900×1600 · 132,0 KB** | **−32,4 %** |

**O teto de 1600 não muda nada para a foto de celular comum (4:3).** Ele só age no retrato
"alto" — e é exatamente por isso que é seguro: não toca na foto que hoje está certa, e
corta o caso extremo, que hoje guarda 2,56 Mpx (2,4× a paisagem) sem que nenhuma folha
precise disso.

### B-9 · EXIF / orientação — MEDIDO, e o resultado contraria a suspeita

Teste: JPEG 400×200 com APP1/Exif `Orientation` = 1, 3, 6 e 8, passado pelos dois caminhos.

| Orientação | Caminho ATUAL (`new Image()` + `drawImage`) | Caminho PROPOSTO (`createImageBitmap(..., 'from-image')`) | Pixels diferentes |
|---|---|---|---|
| 1 | 400×200 | 400×200 | **0** |
| 3 | 400×200 | 400×200 | **0** |
| 6 | **200×400** | **200×400** | **0** |
| 8 | **200×400** | **200×400** | **0** |

**O caminho de hoje já normaliza a orientação, e o resultado é idêntico ao explícito, pixel
a pixel.** Além disso, `escala = min(1, 1200 / img.width)` usa a largura **já orientada**,
então o retrato não é escalado pelo lado errado.

**Portanto, no Chrome, não existe bug de orientação para corrigir.** O que existe é a
ausência de **garantia**: nenhum teste trava esse comportamento, e ele depende do motor.
Trocar para `createImageBitmap` explícito é **endurecimento**, não conserto — e esta fase
não pode vender isso como ganho.

### B-10 · Projeção para o parque real (usando 87,7 KB, a média medida em produção)

| Cenário | Hoje | Com thumb de 480 px (21,8 KB medidos, ajustados p/ a média real ≈ 17 KB) |
|---|---|---|
| Galeria de 10 fotos, cache frio | **1.152 KB** | ~170 KB |
| Lista com 38 equipamentos com capa (org `06f84f2e`) | **~3,3 MB** por carga fria | ~0,6 MB |
| Portal, 20 ativos com capa | ~1,7 MB | ~0,3 MB |

> Números de lista são **derivados** do custo por foto medido, não de uma medição direta de
> 38 cards — a conta que tem 38 equipamentos é de cliente real e é somente leitura. Está
> declarado como derivação, não como medição.

---

## Arquitetura proposta

Segue a forma fixada no plano macro. As **decisões numéricas** vêm do baseline acima, e
onde o baseline contraria o plano macro isso está dito.

```
File
 └─ normalizarOrientacao(file)          createImageBitmap(..., {imageOrientation:'from-image'})
                                        com fallback para o caminho atual (que já acerta)
 ├─ PRINCIPAL  1200 px de largura E 1600 px de altura, q0,7   ← inalterada no caso comum
 │    └─ cofre → bucket → RefFoto { bucket, path, mimeType, tamanho }
 └─ THUMB      400 px, q0,6                                   ← 16,1 KB medidos
      └─ cofre → bucket → RefFoto.thumb  (OBJETO, D5-10)      (best-effort, D-18)

path da principal:  <org>/<escopo>/<uuid>.jpg
path do thumb:      <org>/<escopo>/<uuid>.thumb.jpg      ← irmão, mesma 1ª pasta (I-22)
referência:         RefFoto.thumb = { bucket, path, mimeType, tamanho }  ← objeto, não string

FotoImg variante="thumb"  → thumb.path quando existe; CAI NA PRINCIPAL quando não existe
FotoImg variante="cheia"  → sempre a principal
palco / relatório / PDF   → SEMPRE a principal. Nunca o thumb.
```

### Decisões desta fase, com o porquê medido

| # | Decisão | Base |
|---|---|---|
| D5-1 | **Thumb de 400 px, q0,6** — decidido pelo dono (A-1) | B-7: 16,1 KB, **−85,6 %**, densidade 1,11× no card de 360 CSS px. 320 px foi descartado por entregar MENOS pixel do que o card tem em CSS |
| D5-2 | **Critério continua ≥ 85 %**, como no plano macro | Com 400 px a redução medida é 85,6 %. **Não há divergência com o plano macro.** |
| D5-3 | Teto de altura **1600 px** | B-8: não muda 4:3 nem 3:4; corta 32 % no 9:16. Risco zero para a foto comum |
| D5-4 | Orientação explícita entra como **garantia + teste**, não como correção | B-9: os dois caminhos já são idênticos pixel a pixel no Chrome |
| D5-5 | A principal continua **1200 px / q0,7**, intocada | Plano macro; A4 a 300 dpi pede ~1.060 px |
| D5-6 | Thumb é **best-effort**, nunca atômico com a principal | D-18 do plano macro |
| D5-7 | **Nenhum backfill** de fotos antigas | Plano macro; fallback para a principal cobre |
| D5-8 | `resolverFoto` **grava no cofre a miniatura que baixou** | **N-01**, aprovado (A-2). Só a miniatura — a principal continua fora, para não encher o disco do escritório |
| D5-9 | `urlAssinada` guarda a **promessa em voo** | **N-02**, aprovado (A-2) — mata a assinatura duplicada |
| D5-10 | A miniatura é **objeto** `{bucket,path,mimeType,tamanho}`, não `thumbPath: string` | `portal_arquivo.coletarPaths` autoriza por FORMA: string solta não entraria no conjunto autorizado e o Portal recusaria a miniatura. Com objeto, **nenhum deploy de Edge** |

> **D5-8 e D5-9 são achados NOVOS do baseline** e foram **aprovados** (A-2) como tarefas e
> commits separados — T6 e T7. Escopo travado: não viram refatoração geral de cache.

### Segurança — sem caminho novo

Thumb e principal moram no **mesmo bucket**, com a **mesma primeira pasta** (`<org>/…`), e
portanto sob a **mesma policy** já validada em P1. O Portal continua passando pela Edge
`portal_arquivo`, que autoriza **por caminho**; `<uuid>.thumb.jpg` é um caminho como outro
qualquer e precisa estar referenciado por um recurso do cliente. **Nenhuma rota nova, nenhum
bucket novo, nenhuma exceção de policy.**

---

## Decisões do dono — aprovadas em 20/08/2026

| # | Decisão | Efeito no plano |
|---|---|---|
| **A-1** | **Thumb de 400 px, q0,6** | Redução medida **85,6 %** — cumpre o ≥ 85 % do plano macro. **A divergência D5-2 deixa de existir.** D5-1 revisada: 400 px, densidade 1,11× no card de 360 CSS px |
| **A-2** | **N-01 e N-02 entram na Fase 5**, como tarefas e commits **separados** | T6 e T7. Escopo travado: só o write-back da miniatura e a dedup de assinatura. **Não vira refatoração de cache** |
| **A-3** | **Ficha do equipamento = 1 foto de identificação** | T8. Inspeção/checklist/relatório **continuam com várias fotos técnicas** |
| **A-4** | **Nada é apagado** para adequar a interface | Nenhum arquivo sai do Storage, nenhuma referência é removida, nenhuma migração |

---

## Revisão de impacto de "uma foto por ficha" — feita ANTES de implementar

O dono pediu confirmação de que a mudança não afeta as galerias técnicas de inspeção nem os
relatórios históricos. Levantado por varredura de `src/` e `public/`:

### 1. As fotos da ficha e as fotos de inspeção são famílias DIFERENTES

| | Chave | Quem lê |
|---|---|---|
| **Ficha** (o que muda) | `nr13_fotos_<TAG>` | **`CAPA.html` — e mais nenhuma folha** (confirmado: 1 ocorrência em todo o `public/`) |
| **Inspeção** (não muda) | `nr13_docs_<TAG>` → `nr13_inspecao_atual` / `nr13_injecao_atual` | CHECKLIST-FOTOS, FOTOS-DOCUMENTACAO, VISUAL-EXTERNO/INTERNO-FOTOS, TESTE-HIDROSTATICO-FOTOS |

`palco.ts` já trata as duas separadamente (`CAMPO_DA_FOTO`: `nr13_fotos_` → `.src`;
chaves de campo → `.base64`). **Os conjuntos são disjuntos e sempre foram.** A ficha não
tem como interferir na galeria técnica.

### 2. O conceito de "capa" JÁ É a foto de identificação

Cinco lugares já resolvem a mesma coisa, do mesmo jeito — `fotos.find(f => f.isCapa) ?? fotos[0]`:

`equipamentoService.ts:33` · `Equipamento.tsx:53` · `portalService.ts:115` ·
`PortalAtivo.tsx:92` · `CAPA.html:325`

**Então A-3 não inventa modelo de dado nenhum.** O formato `FotoEquipamento[]` continua
igual, a chave continua igual, `CAPA.html` **não muda uma linha**, e o Portal também não.
O que muda é só a UI da ficha: em vez de uma fileira de miniaturas, um slot único.

### 3. Relatório histórico — o que muda e o que já era assim

| Tipo de relatório | Lê a foto de onde | Trocar a foto de identificação afeta? |
|---|---|---|
| Com `pdfRef` (§7-quater, desde 12/08) | **do arquivo PDF** | **não** — o documento é um arquivo, não uma receita |
| **Legado, sem `pdfRef`** | remonta `CAPA.html`, que lê `nr13_fotos_` **vivo** | **sim — e já era assim hoje** |

Isto **não é criado por esta fase**: qualquer troca de capa hoje já muda a capa de um
relatório legado. O que a Fase 5 faz é **não piorar**: nenhuma foto sai do Storage e
nenhuma referência é removida, então o arquivo que um relatório legado aponta continua
existindo.

### 4. Consequência: a troca NUNCA apaga

- **Trocar** → entra uma foto nova marcada `isCapa`; as anteriores perdem a marca, **ficam
  no array e o arquivo fica no bucket**. Custo: ~150 bytes de referência por foto antiga.
- **Remover** → a entrada sai do array (senão o fallback `fotos[0]` ressuscitaria uma foto
  antiga como identificação), mas **o arquivo NÃO é apagado do bucket**. Vira órfão
  conhecido, e o inventário da Fase 10A é quem decide o destino dele.
- É **mudança de comportamento** em relação ao `remover()` de hoje, que chama `removerFoto`
  e apaga o arquivo. A mudança é na direção que o dono pediu: "não quero perda de histórico
  só para adequar a interface".

### 5. AJUSTE ARQUITETURAL NECESSÁRIO — a miniatura não pode ser um campo `string`

O plano macro previa `RefFoto { …, thumbPath?: string }`. **Isso quebraria a miniatura no
Portal.**

`supabase/functions/portal_arquivo/index.ts` autoriza por **forma**: `coletarPaths` varre o
JSON e coleta todo objeto que tenha `path`. Um campo `thumbPath: '<uuid>.thumb.jpg'` é uma
**string solta** — não é objeto, não tem `path`, **não entra no conjunto autorizado**. O
cliente pediria a miniatura e receberia `nao_disponivel`.

Não quebraria a tela (cai na principal, D5-7), mas o Portal — que é justamente quem mais se
beneficia — ficaria de fora, e exigiria **deploy novo da Edge** para consertar.

**D5-10 (nova): a miniatura é um objeto com a mesma forma da referência principal.**

```ts
interface RefFoto {
  bucket: string;
  path: string;
  mimeType: string;
  tamanho: number;
  /** Miniatura (Fase 5). Ausente = foto antiga; o consumidor cai na principal. */
  thumb?: { bucket: string; path: string; mimeType: string; tamanho: number };
}
```

Com isso `coletarPaths` recolhe a miniatura sozinho, **sem alterar a Edge, sem deploy e sem
tocar em policy** — a autorização do thumb passa a ser exatamente a mesma da principal, que
é o que o dono exigiu no item 9 da especificação.

---

## Tarefas

Ordem de execução e de commit. Cada bloco fecha em commit próprio.

### T1 — `imagem.ts`: orientação explícita e teto de altura
- [x] `normalizarParaBitmap(file)` — `createImageBitmap(file, { imageOrientation: 'from-image' })` com fallback para `new Image()`
- [x] `comprimirParaBlob(file, larguraMax, qualidade, alturaMax?)` — escala pelo fator **mais restritivo**
- [x] `gerarMiniatura(file, largura=400, qualidade=0.6)`
- [x] `imagem.test.ts` (novo): largura, altura, retrato, paisagem, 9:16, EXIF, arquivo inválido
- [x] **Commit 1** — `feat(imagem): orientação explícita e teto de altura`

### T2 — `fotos.ts`: variante miniatura (D-18)
- [x] `RefFoto.thumb?` como **objeto** (D5-10), opcional
- [x] `salvarFoto` na ordem da D-18 — principal salva e devolvida **antes** de qualquer tentativa de miniatura
- [x] Três `catch` independentes: gerar / gravar no cofre / completar o registro
- [x] `resolverFoto(foto, { variante })` — `'thumb'` usa `thumb.path`, cai na principal quando não existe
- [x] `baixarFoto` **inalterada** (é o caminho do documento)
- [x] `removerFoto` apaga também a miniatura
- [x] `fotos.test.ts` estendido: 3 pontos de falha, registro sem thumb, resolução por variante
- [x] **Commit 2** — `feat(fotos): variante miniatura com fallback para a principal`

### T3 — `FotoImg` e consumidores de miniatura
- [x] `variante?: 'thumb' | 'cheia'`, default `'cheia'`
- [x] `Equipamentos`, `CardEquipamento`, `Inspecoes`, `Relatorios` (grade), `Calibracoes` (3 pontos), `Galeria`, `PortalAtivos`, `PortalAtivo` (2 pontos), 4 formulários, `VisualizadorFormulario`
- [x] **NÃO tocar:** `Equipamento.tsx` (foto ampliada) e nada do palco
- [x] Teste: **o palco nunca usa a miniatura**
- [x] **Commit 3** — `perf(ui): listas e cards usam a miniatura`

### T6 — N-01: o cofre guarda a miniatura que baixou
- [x] `resolverFoto`, ao baixar do bucket **em modo miniatura**, grava o blob no cofre (`pendente: false`)
- [x] **Só a miniatura.** A principal continua não sendo cacheada por download — 115 KB × parque encheria o disco do escritório
- [x] Falha ao gravar no cofre não pode derrubar a exibição
- [x] Teste: segunda resolução do mesmo caminho não vai à rede
- [x] **Commit 4** — `perf(fotos): cofre guarda a miniatura baixada`

### T7 — N-02: uma assinatura em voo por caminho
- [x] `urlAssinada` guarda a **promessa** em `emVoo: Map<string, Promise>`, não só o resultado
- [x] Vale para os dois caminhos (SDK interno e Edge do Portal)
- [x] A entrada em voo é limpa ao resolver, inclusive em falha
- [x] Teste: N chamadas simultâneas ao mesmo caminho = 1 requisição
- [x] **Commit 5** — `perf(fotos): uma assinatura em voo por caminho`

### T8 — Ficha do equipamento: uma foto de identificação
- [x] `Galeria.tsx` vira **slot único** (`FotoIdentificacao`): adicionar / trocar / remover
- [x] Identificação = `fotos.find(isCapa) ?? fotos[0]` — **o mesmo critério dos outros 5 lugares**
- [x] **Trocar não apaga**: entra a nova como `isCapa`, as antigas ficam no array e no bucket
- [x] **Remover não apaga o arquivo**: sai do array, o arquivo fica (órfão conhecido, Fase 10A)
- [x] Formato de `nr13_fotos_<TAG>` **inalterado**; `CAPA.html` e o Portal **não mudam**
- [x] Nenhum base64 novo; offline e reconexão pelo mesmo caminho de sempre
- [x] Testes: troca preserva a antiga, remoção não chama `removerFoto`, legado com N fotos escolhe a capa certa
- [x] **Commit 6** — `feat(equipamento): ficha com uma foto de identificação`

### T10 — A-F5-02: o palco hidrata só a foto de identificação
- [x] Provar a regra atual de `CAPA.html` antes de mexer (linhas 322-333) — **a cadeia tem fallback por causa do `&& .src`**
- [x] `hidratarIdentificacaoDaFicha` em `palco.ts`: mesma cadeia, mesma ordem, nenhum critério novo
- [x] O array vai INTEIRO para o palco — nada é removido
- [x] 11 testes novos em `palco.fotos.test.ts` (os 10 pedidos pelo dono + base64 legado)
- [x] `fichaNaoApaga.test.ts` (novo, varredura): a ficha não chama `removerFoto` nem escreve base64
- [x] 3 testes em `historicoRelatorios.test.ts`: relatório com `pdfRef` é arquivo, não receita
- [x] Medição: **1.100,9 KB → ≈ 92,9 KB (−91,6 %)**, derivada; confirmar após o redeploy
- [x] Suíte **1125/1125**, build verde
- [x] **Commit** — `fix(palco): só a foto de identificação da ficha vira imagem`

### T11 — A-F5-01: investigação READ-ONLY
- [x] `app_storage_excluidos`, `app_storage_mutacoes`, `versao`/`atualizado_em`, bucket, tombstones locais
- [x] Veredito registrado: **CAUSA NÃO DETERMINADA / EVENTO ANTERIOR À FASE 5**
- [x] Nenhuma correção por hipótese

### T9 — Fechamento
- [x] Suíte — **1107/1107**, 89 arquivos
- [x] Build — `npm run build` verde (só os avisos de chunk que já existiam)
- [x] Medição do que dá para medir **antes** do deploy — ver `### B-11`
- [x] Push `main` — `485c024`
- [x] **PARAR para o redeploy do dono** — feito
- [x] Medição do "depois" em produção — **1.152,3 KB → 144,9 KB (−87,4 %)**; listagem 450,0 KB → 55,6 KB (−87,6 %)

### B-11 · O que foi medido ao fechar, e o que NÃO foi

**Medido, com o mesmo cálculo que o código agora executa** (harness no navegador,
20/08, fonte 4032×3024 calibrada):

| | Antes | Depois | |
|---|---|---|---|
| Foto que a lista baixa | 111,8 KB (1200 px, q0,7) | **16,1 KB** (400 px, q0,6) | **−85,6 %** |
| Galeria de 10 fotos, cache frio | **1.152,3 KB** | **~161 KB** (derivado) | −86 % |
| Retrato 9:16 guardado | 1200×2133 · 195,2 KB | 900×1600 · 132,0 KB | −32,4 % |
| Retrato 3:4 e paisagem 4:3 | referência | **idênticos** | **0** |

**NÃO medido, e não vou afirmar:** os bytes reais na rede depois da mudança. O bundle em
produção ainda é o anterior — a medição do "depois" exige o redeploy, e fazê-la antes
seria medir o código antigo e chamar de resultado. Fica como a primeira ação depois que
o dono redeployar.

**Também não medido ainda:** a comparação visual dos PDFs com as 6 fotos de referência
(placa, solda, corrosão, trinca, instrumento, geral). A variante principal só muda para
retrato 9:16, então o risco é pequeno — mas "pequeno" não é "medido", e o critério de
aceite continua aberto.

---

## Critérios de aceite

- [x] Redução **≥ 85 %** — **87,4 % medidos em produção** (arquivos no bucket) e **87,6 %** na listagem `/equipamentos`
- [x] **A foto principal não muda** para 4:3 e 3:4 — provado por teste (`dimensionar`) e pela medição B-8
- [ ] PDF de comparação com as 6 fotos de referência reais (placa, solda, corrosão, trinca, instrumento, geral): **AINDA PENDENTE** — a principal não muda para 4:3/3:4, mas a comparação visual não foi feita
- [x] Foto antiga sem miniatura funciona — **confirmado em produção**: as 9 fotos legadas do `ZZ-TESTE-P2` continuam resolvendo pela principal
- [ ] Teste provando que o palco nunca usa o thumb
- [x] Orientação: medida em 20/08 nas 4 orientações, caminho atual == explícito, 0 pixel de diferença; travada por teste
- [x] Portal **VALIDADO EM PRODUÇÃO** (20/08, sessão real de `ipiranga@gmail.com`): miniatura e principal autorizadas abrem; miniatura e principal REAIS de outro cliente devolvem 404 `nao_disponivel`; caminho inexistente devolve **o mesmo status, corpo e cabeçalhos**; cliente não assina direto no Storage nem lê `app_storage`
- [x] Offline **VALIDADO EM PRODUÇÃO com a rede desligada de verdade** (20/08): principal 105,1 KB e miniatura 12,7 KB no cofre como pendentes, `Failed to fetch` com tentativas subindo, miniatura exibida offline em 400×300, sobrevive a fechar/reabrir, fila drena em 1,2 s e as duas sobem com as referências certas
- [x] Suíte verde (**1107/1107**), build limpo

---

## Achados abertos da validação em produção (20/08)

Detalhe e evidências: `docs/medicoes/2026-08-20-fase5-producao-antes-depois.md` §6.

### A-F5-01 · ENCERRADO — CAUSA NÃO DETERMINADA / EVENTO ANTERIOR À FASE 5

Entre a criação da massa e a validação, uma das 10 fotos sumiu do **registro, do cofre e do
bucket** ao mesmo tempo (`05d97b1d…jpg`, 142,1 KB; a diferença bate exata). A última escrita
daquele registro é `2026-08-20T15:05:40Z`, `versao` 2 — **anterior ao redeploy**, então o
código da Fase 5 não a causou.

Investigação read-only (detalhe em `medicoes/…-fase5-producao-antes-depois.md` §15):
`app_storage_excluidos` **não tem linha** para essa chave (não houve exclusão de chave — o que
sumiu foi uma entrada do array); `versao` 2 indica **duas** gravações, e o upload das 10 fotos
grava **uma**; o arquivo saiu do bucket, o que só acontece por `removerFoto`, chamado naquele
bundle **apenas** por `Galeria.remover()`; `app_storage_mutacoes` **não é legível** (sem policy
de select), então o `[]` é ausência de acesso, não de registro.

**Veredito: CAUSA NÃO DETERMINADA / EVENTO ANTERIOR À FASE 5.** Sem evidência de regressão do
código novo — e o caminho capaz de produzir o efeito **foi removido pela própria Fase 5**
(`FotoIdentificacao` não chama `removerFoto`, travado por `fichaNaoApaga.test.ts`). **Não
bloqueia a fase.** Impacto: massa de teste, conta de teste.

### A-F5-02 · CORRIGIDO em 20/08 (aprovado pelo dono)

Medido ao gerar a CAPA no `ZZ-TESTE-P2`: **18 entradas, 18 dataURLs, 1.100,9 KB** numa chave
só, de um orçamento de 3.368 KB — para uma folha que imprime **uma** foto.

Hidratar o array inteiro **já era assim**. O que muda com o T8 é que o array **cresce a cada
troca**, por decisão A-4 (nada é apagado). Por volta de **38 trocas**, essa chave sozinha ocupa
o orçamento e o documento passa a ser recusado (I-23) — com mensagem e sem perda de dado, mas
recusado.

**Corrigido em T10.** O palco passa a hidratar apenas a foto que a CAPA usaria, repetindo a
**cadeia inteira** do template (`find(isCapa)` com `src` → `fotos[0].src` → `imagemPrint`) —
inclusive o fallback, que existe justamente porque a condição é `&& .src`. O array vai
**inteiro** para o palco: `fotos.length` e `fotos[0]` são lidos pelo template.

Medido: **1.100,9 KB → ≈ 92,9 KB (−91,6 %)**; o "depois" é derivado de dois números medidos
(5,3 KB de referências + 87,6 KB de uma foto degradada) e **será confirmado após o redeploy**.

---

## Riscos

| # | Risco | Gravidade | Contenção |
|---|---|---|---|
| R5-1 | Thumb entra num caminho de documento e degrada folha assinada | **alta** | Teste dedicado (T5); `baixarFoto` não ganha variante |
| R5-2 | Erro ao gerar o thumb derruba a foto de campo | **alta** | D-18: a principal é salva e devolvida antes; 3 `catch` isolados |
| R5-3 | Thumb de 400 px fica visivelmente pior no card do celular | média | Escada B-7 medida (densidade 1,11×); comparação visual antes de fechar |
| R5-4 | Thumb órfão no bucket | baixa | Poucos KB; inventário da Fase 10A |
| R5-5 | Dobra o número de arquivos no bucket | baixa | +16,1 KB por foto ≈ +14 % de estoque de FOTO — e foto é 0,5 % do bucket (auditoria de cota) |
| R5-6 | D5-8 enche o disco do escritório | média | Só o thumb vai para o cofre no download, nunca a principal |
| R5-7 | Troca da foto de identificação altera a capa de relatório LEGADO (sem `pdfRef`) | média | **Pré-existente**, não criado aqui. Contido por A-4: nada é apagado, então o arquivo referenciado continua existindo |

---

## Rollback

Reverter os commits. Fotos novas ficam com um `.thumb.jpg` órfão no bucket — inofensivo,
pequeno, e o inventário da Fase 10A o encontra. **Nenhuma foto principal é afetada**,
porque a principal não muda de tamanho, de caminho nem de conteúdo nesta fase. Nenhum dado
é migrado; nenhum registro antigo é reescrito.

---

## Pedido do dono registrado em 20/08/2026

> "eu gostaria q em cada equipamento desse para colocar apenas uma imagem na ficha. apenas
> para identificar"

**Ainda não implementado e ainda não decidido** — precisa de uma definição antes de virar
tarefa, porque há duas leituras e elas dão trabalhos diferentes:

| Leitura | O que muda | Efeito no que já existe |
|---|---|---|
| **(a)** A ficha passa a ter **uma foto só**, de identificação — a galeria de várias fotos sai | `Galeria.tsx` vira um slot único; `nr13_fotos_<TAG>` passa a ter 1 item | Equipamentos que já têm várias fotos precisam continuar funcionando; nada pode ser apagado sem o usuário mandar |
| **(b)** A galeria continua, mas **uma foto (a capa) é a identificação** nas listas | nada — **é o comportamento de hoje** | nenhum |

Se for **(a)**, é mudança de produto e merece decisão explícita (é remoção de
funcionalidade existente). Ela **reforça** a Fase 5 em vez de conflitar: com uma foto por
ficha, o card da lista é o único consumidor de miniatura que importa, e a escolha de D5-1
(480 px) fica ainda mais central.

---

## Log de execução

| Quando | O quê | Estado |
|---|---|---|
| 20/08 03:20 | Fase 5 marcada como PLANEJAMENTO/BASELINE em `ESTADO-DAS-FASES.md` | ✅ |
| 20/08 03:35 | Fase 5 do plano macro lida integralmente (linhas 1479–1664) | ✅ |
| 20/08 03:40 | AS-IS mapeado por leitura de `imagem.ts`, `fotos.ts`, `fotoStore.ts`, `FotoImg.tsx`, `palco.ts` | ✅ |
| 20/08 03:45 | Task-level criado com Estado atual + AS-IS | ✅ |
| 20/08 03:55 | Escada de tamanho e teto de altura medidos no navegador (fonte calibrada) | ✅ |
| 20/08 04:05 | 10 fotos 4032×3024/3024×4032 enviadas pelo input real em `ZZ-TESTE-P2` | ✅ |
| 20/08 04:10 | Cache frio medido: 21 requisições, 1.152,3 KB, 5.995 ms | ✅ |
| 20/08 04:15 | Cache quente medido: 0 requisição, 0 byte | ✅ |
| 20/08 04:18 | Achados novos N-01 (cofre não repovoa) e N-02 (assinatura duplicada) | ✅ |
| 20/08 04:25 | EXIF medido nas 4 orientações: caminho atual == proposto, 0 pixel de diferença | ✅ |
| 20/08 04:35 | Baseline, arquitetura, tarefas, critérios, riscos e rollback escritos | ✅ |
| 20/08 04:40 | Pedido do dono ("uma imagem por ficha") registrado, aguardando definição | ✅ |
| 20/08 05:05 | Decisões A-1 a A-4 aprovadas; revisão de impacto concluída; D5-10 criada (miniatura é objeto, não string) | ✅ |
| 20/08 17:4x | **Item C (Portal) VALIDADO** — miniatura e principal autorizadas abrem; as REAIS de outro cliente e o caminho inexistente devolvem 404 `nao_disponivel` com corpo e cabeçalhos idênticos; cliente segue sem assinar direto no Storage e sem ler `app_storage`. Card do Portal em 400×300 | ✅ |
| 20/08 17:3x | **Item B (offline real) VALIDADO** — rede desligada pelo dono; as duas variantes ficam pendentes com `Failed to fetch`, miniatura utilizável offline, sobrevive a reabrir, drena em 1.203 ms, principal e miniatura sobem, referências corretas, reload com 0 requisição | ✅ |
| 20/08 17:0x | **A-F5-02 confirmado em produção** — 18 entradas preservadas, 1 imagem embutida (a `isCapa`), chave 1.100,9 KB → **92,9 KB** (−91,6 %). 19ª troca custou **0,4 KB**, não uma imagem. Item **D** reconfirmado no bundle novo | ✅ |
| 20/08 16:2x | **T10 — A-F5-02 corrigido**: palco hidrata só a foto de identificação, repetindo a cadeia de `CAPA.html` com o fallback. 18 testes novos. Suíte **1125/1125**, build verde | ✅ |
| 20/08 16:2x | **T11 — A-F5-01**: investigação read-only encerrada sem causa determinada; caminho capaz de causar o efeito foi removido pela própria Fase 5 | ✅ |
| 20/08 12:5x | **Validação em produção** — bundle `index-Bx8gMJyu.js` conferido; 10 de 12 itens passaram; achados A-F5-01 e A-F5-02 abertos; itens 9 (offline) e 10 (Portal) dependem do dono | 🟠 |
| 20/08 06:45 | **T9** — suíte 1107/1107, build verde, push `main` em `485c024`. **PARADO para o redeploy do dono** | ✅ |
| 20/08 06:35 | **T8 concluída** — `FotoIdentificacao` (slot único) no lugar da galeria da ficha; regras puras em `identificacaoEquipamento.ts` com 10 testes. Suíte **1107/1107**, build verde | ✅ |
| 20/08 06:15 | **T7 concluída (N-02)** — assinatura e download de miniatura deduplicados por caminho; falha não congela o caminho. Suíte **1097/1097** | ✅ |
| 20/08 06:05 | **T6 concluída (N-01)** — miniatura baixada vai para o cofre como já enviada; principal segue sob demanda. Suíte **1094/1094** | ✅ |
| 20/08 05:55 | **T3 concluída** — `FotoImg` com `variante`, 15 pontos de miniatura, `Equipamento.tsx` intocado, teste do palco. Suíte **1090/1090** | ✅ |
| 20/08 05:40 | **T2 concluída** — `RefFoto.thumb` como objeto, D-18 na ordem certa, `resolverFoto` por variante, `removerFoto` cobrindo as duas. Suíte **1088/1088** | ✅ |
| 20/08 05:15 | **T1 concluída** — `dimensionar`, `abrirImagem`, `gerarMiniatura`, `imagem.test.ts` com 15 testes verdes | ✅ |

---

## Ponto de retomada

**Estado: 12 de 12 itens de validação PASSARAM. A FASE 5 NÃO ESTÁ FECHADA.**

Falta exatamente **um** critério, e ele depende de material do dono:

> **Comparação visual dos PDFs com as 6 fotos de referência reais.**
>
> São elas: (1) placa com texto pequeno, (2) solda, (3) corrosão, (4) trinca/detalhe fino,
> (5) instrumento/manômetro com mostrador, (6) foto geral do equipamento.
>
> **Procuradas em 20/08 e NÃO encontradas** — ver §19 das medições: nenhum arquivo entrou na organização depois das 20:22:04Z, que é o upload do próprio teste offline.
>
> **Elas ainda não foram fornecidas.** Toda a massa usada até aqui é sintética e **não serve**
> para julgar legibilidade de placa ou de trinca. Conforme instrução do dono: **PARADO neste
> critério**, sem substituir por imagem sintética e sem fechar a fase.

O que esse teste ainda precisa provar, quando as fotos chegarem:
relatório novo usa a principal e nunca a miniatura · orientação correta · qualidade técnica
preservada · a CAPA usa só a foto de identificação · relatório arquivado antigo continua
sendo exatamente o mesmo arquivo.

**A-F5-01** permanece **CAUSA NÃO DETERMINADA / EVENTO ANTERIOR À FASE 5** e não deve ser
reaberto sem evidência nova.

**Não iniciar a Fase 6.**
