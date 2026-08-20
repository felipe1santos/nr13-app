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
| Apresentar o plano ao dono | 🔄 EM CURSO — 3 decisões abertas, ver `## Ponto de retomada` |
| **Implementar** | ⛔ **NÃO AUTORIZADO** — o dono mandou PARAR antes da implementação |

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
 └─ THUMB      480 px, q0,6                                   ← ~17–22 KB
      └─ cofre → bucket → RefFoto.thumbPath / thumbTamanho    (best-effort, D-18)

path da principal:  <org>/<escopo>/<uuid>.jpg
path do thumb:      <org>/<escopo>/<uuid>.thumb.jpg      ← irmão, mesma 1ª pasta (I-22)

FotoImg variante="thumb"  → thumbPath quando existe; CAI NA PRINCIPAL quando não existe
FotoImg variante="cheia"  → sempre a principal
palco / relatório / PDF   → SEMPRE a principal. Nunca o thumb.
```

### Decisões desta fase, com o porquê medido

| # | Decisão | Base |
|---|---|---|
| D5-1 | **Thumb de 480 px, q0,6** (e não 320) | B-2 + B-7: o card da lista ocupa ~360 CSS px no celular; 320 px entregaria **menos** pixels do que o card tem em CSS. 480 dá 1,33× e custa 21,8 KB |
| D5-2 | **Critério de redução vira ≥ 80 %** (o plano macro pedia ≥ 85 %) | Consequência direta de D5-1. Com 400 px daria 85,6 %, mas com densidade 1,11× no card. **Divergência declarada, não silenciosa** — decisão do dono |
| D5-3 | Teto de altura **1600 px** | B-8: não muda 4:3 nem 3:4; corta 32 % no 9:16. Risco zero para a foto comum |
| D5-4 | Orientação explícita entra como **garantia + teste**, não como correção | B-9: os dois caminhos já são idênticos pixel a pixel no Chrome |
| D5-5 | A principal continua **1200 px / q0,7**, intocada | Plano macro; A4 a 300 dpi pede ~1.060 px |
| D5-6 | Thumb é **best-effort**, nunca atômico com a principal | D-18 do plano macro |
| D5-7 | **Nenhum backfill** de fotos antigas | Plano macro; fallback para a principal cobre |
| D5-8 | `resolverFoto` **grava no cofre o que baixou** | **N-01** — resolve o re-download por sessão do computador do escritório. Só o thumb, para não encher o disco com originais |
| D5-9 | `urlAssinada` guarda a **promessa em voo** | **N-02** — mata a assinatura duplicada |

> **D5-8 e D5-9 são achados NOVOS do baseline, fora do escopo original da Fase 5.** Estão
> propostos separadamente e podem ser recusados sem afetar o resto.

### Segurança — sem caminho novo

Thumb e principal moram no **mesmo bucket**, com a **mesma primeira pasta** (`<org>/…`), e
portanto sob a **mesma policy** já validada em P1. O Portal continua passando pela Edge
`portal_arquivo`, que autoriza **por caminho**; `<uuid>.thumb.jpg` é um caminho como outro
qualquer e precisa estar referenciado por um recurso do cliente. **Nenhuma rota nova, nenhum
bucket novo, nenhuma exceção de policy.**

---

## Tarefas

### T1 — `imagem.ts`: orientação explícita e teto de altura
- [ ] `normalizarParaBitmap(file)`: `createImageBitmap(file, { imageOrientation: 'from-image' })` com fallback para `new Image()`
- [ ] `comprimirParaBlob(file, larguraMax, qualidade, alturaMax?)` — escala pelo fator **mais restritivo**
- [ ] `gerarMiniatura(file | bitmap, largura, qualidade)`
- [ ] `imagem.test.ts` (novo): largura, altura, retrato, paisagem, 9:16, EXIF 1/3/6/8, arquivo que não é imagem

### T2 — `fotos.ts`: variante miniatura
- [ ] `RefFoto` ganha `thumbPath?: string` e `thumbTamanho?: number` — **opcionais**
- [ ] `salvarFoto` na ordem da D-18: principal salva e devolvida **antes** de qualquer tentativa de thumb
- [ ] Três `catch` independentes (gerar / gravar no cofre / completar o registro), cada um só registra
- [ ] `resolverFoto(foto, { variante })` — `'thumb'` usa `thumbPath`, cai na principal quando não há
- [ ] `baixarFoto` **inalterada** — é o caminho do documento
- [ ] `removerFoto` apaga os dois caminhos
- [ ] `fotos.test.ts` estendido

### T3 — `FotoImg`: prop de variante
- [ ] `variante?: 'thumb' | 'cheia'`, default `'cheia'` (nenhuma tela muda de comportamento sem ser tocada)

### T4 — Consumidores de miniatura
- [ ] `Equipamentos.tsx`, `CardEquipamento.tsx`, `Inspecoes.tsx`, `Relatorios.tsx` (grade), `Calibracoes.tsx` (2 pontos de componente + capa), `Galeria.tsx` (grade), `PortalAtivos.tsx`, `PortalAtivo.tsx` (2 pontos), 4 formulários de inspeção, `VisualizadorFormulario.tsx`
- [ ] **NÃO mexer:** `Equipamento.tsx:227` (capa grande) e qualquer caminho do palco

### T5 — Testes de regressão do documento
- [ ] Teste explícito: **o palco nunca usa o thumb** (é a regressão que degradaria documento assinado)
- [ ] Registro sem `thumbPath` continua válido para todo consumidor
- [ ] Nenhum base64 novo persistido

### T6 (opcional, decisão do dono) — N-01 e N-02
- [ ] `resolverFoto` grava no cofre o thumb baixado
- [ ] `urlAssinada` guarda a promessa em voo

---

## Critérios de aceite

- [ ] Redução **≥ 80 %** nos bytes da galeria de 10 fotos, medida **na mesma massa
      `ZZ-TESTE-FOTO-*`, com cache frio, do mesmo jeito** que o baseline (1.152,3 KB é a régua)
- [ ] **A foto principal não muda: mesmos bytes, mesmo hash**, para fonte 4:3 e 3:4
- [ ] PDF de comparação com as 6 fotos de referência do plano macro: **nenhuma perda perceptível** com zoom
- [ ] Foto antiga sem `thumbPath` funciona em **todas** as telas
- [ ] Teste provando que o palco nunca usa o thumb
- [ ] Orientação correta (EXIF 6 e 8) em card, galeria e folha
- [ ] Portal: thumb de outro cliente **recusado**, caminho inexistente **recusado**, sem oráculo de enumeração
- [ ] Offline: foto capturada sem rede → principal **e** thumb no cofre → fecha/reabre → visíveis → reconecta → os dois sobem
- [ ] Suíte verde, build limpo

---

## Riscos

| # | Risco | Gravidade | Contenção |
|---|---|---|---|
| R5-1 | Thumb entra num caminho de documento e degrada folha assinada | **alta** | Teste dedicado (T5); `baixarFoto` não ganha variante |
| R5-2 | Erro ao gerar o thumb derruba a foto de campo | **alta** | D-18: a principal é salva e devolvida antes; 3 `catch` isolados |
| R5-3 | Thumb de 480 px fica visivelmente pior no card do celular | média | Escada B-7 medida; comparação visual antes de fechar |
| R5-4 | Thumb órfão no bucket | baixa | Poucos KB; inventário da Fase 10A |
| R5-5 | Dobra o número de arquivos no bucket | baixa | +21,8 KB por foto ≈ +19 % de estoque de FOTO — e foto é 0,5 % do bucket (auditoria de cota) |
| R5-6 | D5-8 enche o disco do escritório | média | Só o thumb vai para o cofre no download, nunca a principal |
| R5-7 | Divergência do ≥ 85 % do plano macro | documental | D5-2 declarada; decisão do dono antes de implementar |

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
| 20/08 04:40 | Pedido do dono ("uma imagem por ficha") registrado, aguardando definição | ⬜ |

---

## Ponto de retomada

**A fase está no fim do planejamento.** Nada de código foi alterado — `git status` só
mostra Markdown.

**Próxima ação exata:** aguardar do dono, antes de qualquer implementação:

1. **D5-1/D5-2** — thumb de 480 px com critério de **≥ 80 %**, ou 400 px com **≥ 85,6 %** e
   card mais mole no celular;
2. **T6** — implementar ou não os achados novos N-01 e N-02;
3. **Pedido "uma imagem por ficha"** — leitura (a) ou (b).

**NÃO implementar** enquanto essas três respostas não vierem.
