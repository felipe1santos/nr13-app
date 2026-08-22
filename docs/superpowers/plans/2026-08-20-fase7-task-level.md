# FASE 7 — Logo e rubrica endereçadas por conteúdo

**Achado:** A-05. **Plano macro:** `2026-08-15-evolucao-arquitetura.md`, linhas 1801–2141.
**Portão:** **P4 fecha nesta fase.**

> **A META NÃO É "ZERO BASE64".** É separar três coisas que hoje estão misturadas:
> a **configuração atual** da empresa, a **referência congelada** de um documento, e o
> **PDF arquivado**, que é a verdade definitiva.

---

## Estado atual da fase

`🟢 7A VALIDADA` · `🟡 7B EM VALIDAÇÃO DE PRODUÇÃO` — plano aprovado em 20/08 com as decisões D7-1, D7-3, D7-H e a **correção obrigatória do rollout** (7A → 7B).

| Etapa | Estado |
|---|---|
| Ler a Fase 7 no plano macro | ✅ FEITO (20/08) |
| Inventário de consumidores por varredura em `public/` e `src/` | ✅ FEITO |
| Medir duplicação real por hash | ✅ FEITO |
| Verificar infraestrutura reaproveitável | ✅ FEITO |
| Criar o task-level | ✅ FEITO (este arquivo) |
| Apresentar o plano ao dono | ✅ **aprovado** com D7-1, D7-3, D7-H e a correção do rollout |
| **Etapa 7A — leitura/resolução** | ✅ **VALIDADA EM PRODUÇÃO** |
| **Etapa 7B — switch dos writers** | 🟡 **DEPLOYADA · EM VALIDAÇÃO DE PRODUÇÃO** — faltam Portal e offline |

---

## Rollout aprovado — EXPAND → VALIDAR → SWITCH

> **Correção obrigatória exigida pelo dono, e ela conserta um defeito real do meu plano.**
>
> Eu havia registrado como "custo aceitável" que um relatório emitido durante a Fase 7 e
> reaberto após um rollback exibiria a rubrica **atual** em vez da congelada. **O dono recusou:
> isso viola a garantia histórica.** A correção elimina o cenário em vez de documentá-lo.

### Etapa 7A — compatibilidade de LEITURA (esta etapa)

O sistema aprende a **interpretar** os dois formatos — base64 legado **e** referência — mas os
**writers continuam no formato atual**. Nenhum snapshot novo depende exclusivamente de ref.

| Entra na 7A | Fica para a 7B |
|---|---|
| Palco resolve `logoRef` e `assinaturaRef` | Writers gravando ref |
| Tipos com os campos opcionais | Snapshot novo congelando ref |
| Helpers content-addressed necessários | Cadastro gravando hash |
| Testes, segurança, leitura no Portal | — |

Depois: suíte → build → commit → push → **PARAR** para o redeploy. Em produção, validar que
**tudo antigo continua abrindo** e que **nenhuma identidade visual mudou**.

### Etapa 7B — switch dos WRITERS (só após aprovação)

Com os leitores já em produção, os writers passam a gravar ref, e os snapshots novos congelam
a referência do momento.

### Rollback — a regra que motivou a correção

```
7B com problema  →  volta para 7A       ← 7A JÁ SABE LER as refs novas
7B com problema  →  volta para antes da 7A     ← PROIBIDO
```

O segundo caminho produz exatamente o cenário recusado: relatório novo com ref, leitor antigo
que não a entende, fallback para o dado vivo, e **documento histórico mudando de identidade
visual**. Com 7A em produção, esse caminho deixa de existir.

---

## Decisões do dono — aprovadas em 20/08/2026

### D7-1 · Resolver no PALCO ✅

Os 41 templates continuam lendo a interface que já conhecem (`nr13_minha_empresa.logo` e os
campos de rubrica). O palco aceita **base64 legado OU ref**, e materializa para o formato
esperado **apenas em memória**. Nenhum HTML é alterado.

Exigências que viram teste: legado continua funcionando · `logoRef` funciona ·
`assinaturaRef` funciona · o template recebe **exatamente** o formato esperado · URL assinada
é transitória e nunca persistida · **erro de resolução NÃO troca silenciosamente pela
logo/rubrica atual** · relatório histórico nunca recebe identidade visual errada.

### D7-3 · O que é hasheado ✅

SHA-256 dos **bytes resultantes do processamento atual, no momento da entrada** —
`comprimirImagem(300)` para logo, `processarAssinatura(500)` para rubrica.

**Proibido:** reprocessar imagem histórica para gerar hash novo, ou decodificar/recomprimir
base64 histórico e regravar em silêncio. Para conteúdo antigo, hash só para **análise**, sobre
os bytes existentes, **sem modificar a origem**.

### D7-H · Histórico intocado ✅

14 relatórios legados · 12 snapshots antigos · PDFs arquivados · Livro lacrado · identidades
visuais antigas — **todos intactos**, mesmo sendo a maior parte dos 475,8 KB.
**Nenhum retrofit automático.**

### D7-GC · Sem garbage collection nesta fase

Logo que deixa de ser a atual: **arquivo continua**. Rubrica antiga: **continua**. Funcionário
excluído: a assinatura continua se houver referência histórica. Auditoria de órfãos e eventual
limpeza são da **Fase 10A/10B**.

### D7-E · Como a economia será apresentada

**Os 475,8 KB históricos NÃO entram como economia prometida.** Eles permanecem. A comparação
honesta é: *snapshot novo com base64* × *snapshot novo com ref*, e *N usos da mesma imagem →
1 arquivo físico*.

---

## Divergências comprovadas em relação ao plano macro

Registradas aqui **sem alterar o macro em silêncio**:

| # | O macro dizia | O que a varredura/medição mostrou |
|---|---|---|
| 1 | Poucos consumidores (`rel-empresa.js`, "CAPA e cabeçalhos") | **41 templates** leem `nr13_minha_empresa` direto (40 usam `.logo`, 91 ocorrências) |
| 2 | Escopo incluía alterar os templates | **D7-1**: resolver no palco, **zero HTML alterado** |
| 3 | — | **14 de 16 relatórios são legados** e dependem do snapshot para remontar |
| 4 | Rollback com "regressão temporária de imutabilidade" aceitável | **Recusado.** Rollout **7A → 7B** elimina o cenário |
| 5 | Histórico seria alvo de ganho | Histórico **não é reescrito**; o ganho é **prospectivo** |

---

## AS-IS

### Onde nasce, onde mora

| Artefato | Origem | Armazenamento atual | Formato |
|---|---|---|---|
| **Logo da empresa** | `MinhaEmpresa.tsx:34` → `comprimirImagem(file, 300)` | `nr13_minha_empresa.logo` | dataURL JPEG q0,5 |
| **Rubrica do funcionário** | `Funcionarios.tsx` → `processarAssinatura(file, 500)` | `nr13_lista_phs[].assinatura` | dataURL PNG (fundo removido) |
| **Rubrica do Livro** | `livroAssinatura.camposDaRubrica` | `nr13_livro_<TAG>[].assinaturaRef` **ou** `.assinaturaImg` | **ref por conteúdo** (novo) / dataURL (legado) |
| **Snapshot do relatório** | `RelatorioMeta` na geração (§7-bis) | `nr13_rel_<id>_<TAG>.meta.empresa.logo` e `.meta.assinantes[].assinatura` | dataURL **congelada** |

### Quem consome — varredura, e ela contradiz o plano macro

| Consumidor | Lê | Nº de arquivos |
|---|---|---|
| **Templates que leem `nr13_minha_empresa` DIRETO** | `.logo` | **41 arquivos** (40 usam `.logo`, 91 ocorrências) |
| `rel-empresa.js` | logo, com `ctx=rel` preferindo `meta.empresa` | 1 |
| `pront-footer.js` | logo no rodapé do prontuário | 1 |
| `rel-assinatura.js` | rubrica: `meta.assinantes` (com `ctx=rel`) → `nr13_lista_phs` | 1 |
| `pront-assinatura.js` | rubrica nas 6 folhas | 1 |
| `LIVRO-REGISTRO.html` | `assinaturaImg` (via ref + mapa do palco) e `nr13_lista_phs` | 1 |
| `PRONT-P4.html` | `nr13_lista_phs` direto | 1 |
| Telas React | preview no cadastro | `MinhaEmpresa.tsx`, `Funcionarios.tsx` |

> **O plano macro previa mexer em `rel-empresa.js` e "CAPA.html e cabeçalhos".** A varredura
> mostra **41 templates lendo a chave diretamente**. Tocar em 41 arquivos HTML para trocar
> `.logo` por `logoRef` seria o caminho mais caro e mais arriscado possível — e cada arquivo
> esquecido imprime documento assinado **sem a logo**, em silêncio.
>
> **A saída já existe no próprio projeto** — ver `## Arquitetura proposta`.

### Tabela pedida pelo dono

| Artefato | Origem | Armazenamento | Consumido por | Histórico? | Pode mudar? | Precisa migrar? | Risco |
|---|---|---|---|---|---|---|---|
| Logo viva | `MinhaEmpresa` | `nr13_minha_empresa.logo` | 41 templates + 2 scripts | não | **sim** | **sim** (ganha `logoRef`, dataURL mantida) | médio |
| Rubrica viva | `Funcionarios` | `nr13_lista_phs[].assinatura` | `rel-assinatura`, `pront-assinatura`, LIVRO, PRONT-P4 | não | **sim** | **sim** (ganha `assinaturaRef`) | médio |
| Rubrica do Livro **sem lacre** | livro | `assinaturaImg` | `LIVRO-REGISTRO.html` | sim | sim | **já migra sozinha** | baixo |
| Rubrica do Livro **lacrada** | livro | `assinaturaImg` | idem | **SIM** | **NÃO** | **NUNCA** — mudaria o `sha256` do lacre | alto |
| Snapshot de relatório **novo** | geração | `meta.*` | `rel-assinatura`, `rel-empresa` | sim | passa a guardar **ref** | é o ganho da fase | médio |
| Snapshot de relatório **antigo** | geração | `meta.*` (dataURL) | idem | **SIM** | **NÃO** | **NUNCA reescrever** | **alto** |
| PDF arquivado (`pdfRef`) | `artefatoRelatorio` | bucket + `sha256` | visualizador, Portal | **SIM** | **NÃO** | **NUNCA regenerar** | **alto** |

---

## Baseline

Organização de teste `99f642d3`, 20/08/2026. SHA-256 calculado sobre os **bytes decodificados**.
**Nenhum conteúdo base64 foi registrado.**

### A duplicação, medida

| | |
|---|---|
| Ocorrências de base64 de logo/rubrica | **38** |
| Bytes ocupados no banco | **475,8 KB** |
| **Conteúdos realmente distintos (hashes)** | **4** |
| Soma dos 4 arquivos únicos | **35,4 KB** |
| **Fator de duplicação** | **13,5×** |

### Por campo

| Campo | Ocorrências | KB no banco | Hashes distintos |
|---|---|---|---|
| `assinatura` (rubrica viva + snapshots) | 18 | 292,2 | **2** |
| `logo` | 16 | 117,6 | **2** |
| `assinaturaImg` (livro) | 4 | 66,0 | **1** |

### Por conteúdo

| Hash | Ocorrências | Arquivo | Onde aparece |
|---|---|---|---|
| `45cbb213579c…` | **14** | 12.687 B | `assinaturaImg` **+** `assinatura` |
| `ca14bf0c9a62…` | 10 | 5.516 B | `logo` |
| `b8e3451d175d…` | 8 | 12.222 B | `assinatura` |
| `20ac2db36958…` | 6 | 5.808 B | `logo` |

> **A prova de que a arquitetura já está certa e só falta estendê-la:** o arquivo que existe
> hoje no bucket é `assinaturas/45cbb213579c555744af49bc5ba703997a09e286c73d5c447d0fab3d2d229c3b.png`,
> **12,4 KB** — exatamente o hash e o tamanho da rubrica que aparece **14 vezes em base64** no
> banco. O content-addressing funciona; ele só não foi aplicado fora do Livro.

### Relatórios

| | |
|---|---|
| Total | **16** |
| Com `pdfRef` (arquivo é a verdade) | **2** |
| **LEGADOS sem `pdfRef`** (remontam dos templates) | **14** |
| Com base64 no snapshot | 12 |
| Peso total / médio | 467,2 KB / **29,2 KB** |

> **14 de 16 relatórios são legados.** Eles **dependem** do snapshot para remontar com
> fidelidade. Isso é o dado mais importante do baseline para a regra de imutabilidade.

### Storage hoje

| Pasta | Conteúdo |
|---|---|
| `<org>/assinaturas/` | **1** arquivo, 12,4 KB, nomeado pelo SHA-256 |
| `<org>/logos/` | **não existe** |

---

## Duplicação por hash — o que a Fase 7 pode e não pode capturar

| Grupo | Ocorrências | KB | Pode virar referência? |
|---|---|---|---|
| Chaves **vivas** (`nr13_minha_empresa`, `nr13_lista_phs`) | ~4 | ~30 | **sim** — é o alvo |
| Snapshots de relatório **novos** (a partir do deploy) | crescem com o uso | — | **sim** — é onde o ganho aparece |
| Snapshots **antigos** (12 registros) | 12 | ~430 | **NÃO** — imutáveis |
| Livro **lacrado** | parte das 4 | — | **NÃO** |

> **Não vou prometer economia em histórico que não será reescrito.** Dos 475,8 KB medidos, a
> maior parte está em snapshots antigos e **continua exatamente onde está**. O ganho da fase é
> **prospectivo**: cada relatório novo passa a custar ~150 bytes de referência em vez de ~55 KB
> de imagem duplicada.

---

## Infraestrutura já existente — reaproveitável

**Nada precisa ser inventado.** Levantamento:

| Peça | Onde | O que já faz |
|---|---|---|
| `salvarArquivoPorConteudo` | `fotos.ts:270` | **path = SHA-256 do conteúdo**, `upsert: true` seguro, cofre + fila offline |
| `referenciaDaRubrica` | `livroAssinatura.ts:78` | dataURL → blob → ref por conteúdo, com `catch` que preserva o base64 |
| `CAMPO_REF_NOMEADO` | `palco.ts:653` | tabela prefixo → campo de ref, resolvida na montagem |
| `CHAVE_RUBRICAS_PALCO` | `palco.ts:684` | **mapa caminho → dataURL, UMA cópia por rubrica distinta** |
| `migrarRubricasDoLivro` | `livroAssinatura.ts:129` | migração idempotente com confirmação antes de zerar |
| `recuperacaoArquivos.ts` | Fase 6 | motor genérico de conversão base64 → ref, com as mesmas garantias |
| `arquivoPendente` | `fotos.ts` | o único sinal aceito de que o servidor confirmou (I-14) |
| `portal_arquivo.coletarPaths` | Edge | autoriza **por forma**: todo objeto com `path` entra |

---

## Arquitetura proposta

### D7-1 · Resolver no PALCO, não nos 41 templates

**A decisão central da fase.** Os templates continuam lendo `.logo` e `assinaturaImg` como
sempre; o palco resolve a referência e **preenche o campo que eles já leem**, antes de
materializar — exatamente o que `CAMPO_REF_NOMEADO` já faz para o livro.

```
nr13_minha_empresa : { ..., logo: "data:...", logoRef: {…} }   ← gravação dupla (D-11)
        ↓ palco
nr13_minha_empresa : { ..., logo: "<dataURL resolvida da ref>" }  ← template não muda
```

**Zero arquivos HTML alterados.** Some o risco de "um consumidor esquecido imprime documento
sem a logo", que o próprio plano macro apontou como o modo de falha mais caro do projeto.

### D7-2 · Content-addressing, com o path derivado do hash

```
<org>/assinaturas/<sha256>.png     ← já existe e já funciona
<org>/logos/<sha256>.jpg           ← nova, mesmo padrão
```

Mesmo conteúdo → mesmo path → **um arquivo**. Conteúdo diferente → hash diferente → arquivo
novo, e **o antigo continua onde está**. A imutabilidade deixa de depender de alguém lembrar
de copiar: vira consequência do endereço.

### D7-3 · O que é hasheado — definido sem ambiguidade

**Os bytes do arquivo final, depois do processamento que o app já faz hoje**
(`processarAssinatura` para rubrica, `comprimirImagem` para logo) e **antes** do base64.

Consequência aceita: carregar o **mesmo arquivo** duas vezes produz o mesmo hash **se** o
processamento for determinístico. Rubrica **já existente** **nunca** é reprocessada — isso
mudaria o hash de conteúdo histórico só para encaixar no sistema, que é exatamente o que não
se deve fazer.

### D7-4 · Gravação dupla no dado vivo (D-11 do plano macro)

| Onde | Durante a convivência |
|---|---|
| `nr13_minha_empresa.logo` / `nr13_lista_phs[].assinatura` | **MANTIDAS** — garantem rollback sem perda |
| `.logoRef` / `.assinaturaRef` | **GRAVADAS** — fonte preferida |
| Snapshot de relatório **novo** | **só a ref** — é daqui que vem o ganho |
| Snapshot **antigo**, PDF emitido, livro lacrado | **INTOCADOS** |

O encerramento da gravação dupla é item da **Fase 10B**, com as condições C1–C8, e **não
acontece nesta fase**.

### D7-5 · Formato da referência

Reusar `RefFoto` — `{ bucket, path, mimeType, tamanho }`. O `path` **é** o hash, então um campo
`sha256` seria redundante. **URL assinada nunca é persistida.**

### D7-6 · Segurança — o hash não é autorização

O bucket continua **privado**. `portal_arquivo` autoriza **por vínculo**: o caminho só é
servido se estiver referenciado por um recurso que aquele cliente pode ver. Adivinhar um
SHA-256 não dá acesso a nada.

E como `coletarPaths` varre **por forma** (objeto com `path`), `logoRef` e `assinaturaRef`
entram na autorização **sem alterar a Edge** — mesma propriedade que fez a miniatura da Fase 5
funcionar no Portal sem deploy. **A dependência bloqueante que o plano macro apontava
(§Segurança) já está resolvida por construção** — a confirmar por teste.

---

## Imutabilidade histórica

| Item | Regra |
|---|---|
| Relatório com `pdfRef` | **jamais** regenerar, alterar o PDF ou mudar a identidade visual retroativamente. O arquivo é a verdade |
| Snapshot de relatório antigo | **não reescrever** para economizar banco. **14 de 16** relatórios da org de teste são legados e dependem dele |
| Entrada de livro **lacrada** | **intocada** — mudar `assinaturaImg` mudaria o `sha256` e a entrada se acusaria de adulterada |
| Logo antiga substituída | **não apagar do bucket** — pode estar referenciada por relatório, prontuário ou livro |

**Troca de logo/rubrica — o comportamento obrigatório:**

```
Empresa usa LOGO A  →  documento A criado           →  A congelada (ref do hash A)
Usuário troca para LOGO B                            →  nr13_minha_empresa.logoRef = hash B
Documento novo                                       →  usa B
Documento A reaberto                                 →  CONTINUA com A
```

Nunca o inverso. É o teste manual nº 4 e um critério de aceite.

---

## Tarefas

### ETAPA 7A — compatibilidade de leitura ✅ IMPLEMENTADA

- [x] **7A.1** — `palco.ts`: `REF_RESOLVIDA_NO_LUGAR` + `refsNoLugarDaChave()`, cobrindo `nr13_minha_empresa.logoRef`, `nr13_lista_phs[].assinaturaRef` e os dois campos dentro de `nr13_relatorio_meta_atual`
- [x] **7A.2** — Resolução recursiva na `percorrer`, com **dedupe por caminho** (o cache `jaBaixadas` já existente) e a guarda de campo já preenchido
- [x] **7A.3** — Tipos ganham os campos **opcionais**: `MinhaEmpresaDados.logoRef`, `Funcionario.assinaturaRef`, `AssinanteSnapshot.assinaturaRef` (`meta.empresa` já é `Record<string, unknown>`)
- [x] **7A.4** — `palco.refs7a.test.ts`: **14 testes**
- [x] **7A.5** — Regressão: Livro (12) e as 4 suítes de palco (106 no total) verdes
- [x] **7A.6** — Suíte **1162/1162**, build verde
- [x] **7A.7** — **VALIDADA EM PRODUÇÃO** (bundle `index-D_-wTh2v.js`): zero escrita histórica, PDFs com SHA-256 idêntico, Livro e Portal sem regressão, e os 4 cenários de leitura provados. Ver `medicoes/2026-08-20-fase7a-validacao-producao.md`

**Nenhum writer foi alterado. Nenhum HTML foi alterado.** O diff é `palco.ts` + dois arquivos
de tipos. Nenhum snapshot novo depende de referência.

### ETAPA 7B — switch dos writers 🟡 IMPLEMENTADA LOCALMENTE

- [x] **7B.1** — `imagem.ts`: `comprimirImagemComBlob` e `processarAssinaturaComBlob` devolvem **dataURL + blob**. O blob é a fonte e o dataURL é derivado dele — `toBlob` e `toDataURL` são caminhos de codificação distintos, e gerar os dois independentemente daria um hash que não descreve o que está no registro
- [x] **7B.2** — `identidadeVisual.ts` (novo): casca fina sobre `salvarArquivoPorConteudo`, com a ordem obrigatória — processar → bytes → hash (o próprio path) → upload/reuso → **confirmar** → só então a referência. Falha devolve `null`, e o cadastro segue com a dataURL
- [x] **7B.3** — `MinhaEmpresa.tsx` e `Funcionarios.tsx` gravam a referência de forma **aditiva** (D-11), com o custo declarado em comentário no ponto exato
- [x] **7B.4** — `snapshotEmpresa()` e `snapshotAssinantes()`: com referência, o snapshot congela **só ela** e a dataURL sai. Sem referência, nada muda
- [x] **7B.5** — `PENDENCIAS.md`: encerramento da gravação dupla (data-alvo = deploy + 45 dias) **e** a regra de rollback `7B → 7A`
- [x] **7B.6** — `identidadeVisual.test.ts` (14) e `snapshot7b.test.ts` (10)
- [x] **7B.7** — Suíte **1186/1186**, build verde
- [x] **7B.8a** — Validação em produção, parte medida: content-addressing, dedupe A/B/C/D, D-11, **teste histórico A/B**, PDF imutável, convivência base64×ref, não escrita histórica, livro, economia, suíte e build → `docs/medicoes/2026-08-20-fase7b-validacao-producao.md`
- [x] **7B.8b·1** — **Portal, cliente autorizado (`cliente001@gmail.com`)**: cadeia `relatório → snapshot → logoRef/assinaturaRef → path` reproduzida chave a chave; `portal_arquivo` devolve **200** para LOGO A/B, RUBRICA A/B e os dois PDFs; arquivo REAL sem vínculo, hash inventado e outra org devolvem **404 `nao_disponivel`** idêntico; P1/P3 intactos; Livro remontado no Portal renderiza LOGO-B + RUBRICA B
- [x] **7B.8b·2** — **Contraprova com `ipiranga@gmail.com`** (JWT conferido: `cliente_id ad1fd71c…`, mesma org): as **6** refs do ZZ-FASE3 → **404 `nao_disponivel`**, nenhuma URL emitida. O 404 é **seletivo** — na mesma rota e com o mesmo token, o PDF do vínculo DELE (COMPRESSOR) dá **200**. Não-enumerabilidade: **1 única assinatura de resposta** entre 6 casos distintos (status + corpo + cabeçalhos). P1/P3 intactos. **PORTAL 7B = VALIDADO EM PRODUÇÃO ✅**
- [x] **7B.8c** — **Offline real** (22/08, offline acionado pelo dono no DevTools): dataURL preservada, **sem Ref prematura**, item no cofre com `pendente: true`, reload offline preserva tudo, **nenhuma recuperação automática** no reconnect (CENÁRIO B) e **nenhum arquivo órfão**; a 2ª edição reaproveita o hash calculado offline. Histórico byte a byte. **OFFLINE REAL = VALIDADO ✅**
- [ ] **7B.9** — **PORTÃO P4** — todos os itens medidos e verdes. **Aguardando a decisão do dono** sobre documentar a limitação do offline (base64 até a próxima edição) em vez de corrigi-la agora

**Nenhum HTML alterado. Nenhum snapshot antigo tocado.** O diff é `imagem.ts`,
`identidadeVisual.ts` (novo), os dois writers de cadastro e `relatoriosService.ts`.

---

## Testes

**Marcados = cobertos pela 7A** (14 testes novos). Os demais pertencem à 7B.

- [ ] Mesmo conteúdo → **mesmo path**, um arquivo só
- [ ] Conteúdo diferente → path diferente; **o antigo continua resolvível**
- [ ] Logo nova gera hash e ref; rubrica idem
- [ ] Falha de upload → **origem preservada** (mesmo fallback da Fase 6, que depois a recupera)
- [ ] Arquivo pendente **não** vira ref definitiva
- [ ] Offline: cadastrar rubrica → blob no cofre, ref gravada, upload retomado
- [ ] Documento **novo** usa a logo atual; documento **antigo** continua com a anterior
- [ ] Relatório com `pdfRef` **não** regenera e mantém o **SHA-256**
- [ ] Relatório legado (sem `pdfRef`) continua remontando com a imagem congelada
- [x] Snapshot antigo permanece **byte a byte**
- [x] Livro continua funcionando — **regressão bloqueante**
- [ ] Portal abre o histórico e exibe a rubrica
- [x] **URL assinada nunca persistida**
- [ ] **Nenhuma exclusão automática** de arquivo histórico
- [ ] Palco materializa **uma cópia por imagem distinta**, não uma por uso
- [ ] `palco.varreduraTemplates.test.ts`: todo consumidor de logo/rubrica coberto

---

## Critérios de aceite

- [ ] Registro de relatório **novo** ≈ **50 % menor**, medido
- [ ] Relatório emitido antes da fase **byte a byte igual**
- [ ] Mesma rubrica em dois funcionários → **um arquivo**
- [ ] Trocar a rubrica **não altera** nenhum documento anterior
- [ ] Todas as folhas do inventário renderizam logo e rubrica
- [ ] Portal exibe a rubrica
- [ ] Bytes do palco **não pioram**
- [ ] Suíte verde, build limpo
- [ ] **PORTÃO P4**

---

## Riscos

| # | Risco | Gravidade | Contenção |
|---|---|---|---|
| R7-1 | Consumidor esquecido imprime documento **sem** logo/rubrica — falha silenciosa | **alta** | **D7-1**: resolver no palco, zero template alterado; + varredura virando teste |
| R7-2 | Reescrever snapshot antigo e quebrar a imutabilidade | **alta** | Lista explícita do que é tocado; snapshots antigos fora dela |
| R7-3 | Converter entrada de livro lacrada | **alta** | Já tratado e testado em `livroAssinatura` |
| R7-4 | Regressão no Livro | **alta (bloqueante)** | Não refatorar o Livro; rodar seus 12 testes como regressão |
| R7-5 | Portal sem a rubrica do engenheiro | média | `coletarPaths` varre por forma — a confirmar por teste, como na Fase 5 |
| R7-6 | Gravação dupla virar permanente por inércia | média | T8: item em `PENDENCIAS.md` com data-alvo + comentário no código |
| R7-7 | Rollback exibir rubrica ATUAL em relatório emitido durante a fase | média | Documentado no plano macro; janela curta, `assinaturaRef` nunca apagada |

---

## Rollback

Reverter os commits. **Sem perda:** a gravação dupla mantém a dataURL viva intacta, e o código
antigo volta a lê-la.

**O custo real, escrito antes de alguém descobri-lo sob pressão:** um relatório emitido
*durante* a Fase 7 e reaberto *após* o rollback exibiria a rubrica **atual**, não a congelada —
o código antigo não conhece `assinaturaRef` e cai no dado vivo. É regressão temporária de
imutabilidade, **não perda de dado**, e desaparece ao reaplicar a fase.

---

## Log de execução

| Quando | O quê | Estado |
|---|---|---|
| 20/08 | Fase 6 aprovada e fechada; Fase 7 autorizada **só para planejamento** | ✅ |
| 20/08 | Fase 7 do plano macro lida (linhas 1801–2141), com D-11, D-25 e C1–C8 | ✅ |
| 20/08 | **Inventário por varredura: 41 templates leem `nr13_minha_empresa` DIRETO** (40 usam `.logo`, 91 ocorrências) — o plano macro previa só `rel-empresa.js` | ✅ |
| 20/08 | Baseline: **38 ocorrências / 475,8 KB / apenas 4 hashes distintos / 35,4 KB reais = 13,5× de duplicação** | ✅ |
| 20/08 | **A rubrica no bucket (`45cbb213…png`, 12,4 KB) é exatamente o hash que aparece 14× em base64** — o content-addressing já funciona | ✅ |
| 20/08 | Relatórios: 16 total, **2 com `pdfRef`, 14 LEGADOS** que dependem do snapshot | ✅ |
| 20/08 | Infraestrutura reaproveitável levantada — nada precisa ser inventado | ✅ |
| 20/08 | Task-level criado | ✅ |
| 20/08 | Plano **aprovado** com D7-1, D7-3, D7-H, D7-GC, D7-E e a **correção obrigatória do rollout** (7A → 7B) | ✅ |
| 20/08 | **ETAPA 7A IMPLEMENTADA** — palco resolve as refs no lugar, com dedupe e guarda de campo preenchido; tipos opcionais; 14 testes novos | ✅ |
| 20/08 | Regressão verde: Livro 12/12, palco 106/106. Suíte **1162/1162**, build verde | ✅ |
| 20/08 | Diff da 7A: **só palco.ts e 2 arquivos de tipos** — nenhum writer, nenhum HTML | ✅ |
| 21/08 | **7A VALIDADA EM PRODUÇÃO** — 94 chaves conferidas por SHA-256 e versão: `nr13_rel_`, `nr13_minha_empresa`, `nr13_lista_phs` e `nr13_livro_` **não foram escritos**; PDFs arquivados com hash idêntico | ✅ |
| 21/08 | Teste controlado de leitura: ref válida resolve · **ref inválida NÃO vira substituto** · base64 congelado vence · restauração conferida | ✅ |
| 21/08 | Portal: arquivo próprio 200, de outro cliente e inexistente 404 idêntico, `app_storage` vazio. **Rubrica da org recusada** — correto pela D-05, e vira teste bloqueante da 7B | ✅ |
| 21/08 | **7A APROVADA pelo dono** · commit `ae36731` | ✅ |
| 21/08 | **ETAPA 7B IMPLEMENTADA** — `imagem.ts` devolve blob+dataURL, `identidadeVisual.ts` faz o content-addressing com confirmação, writers gravam a ref de forma aditiva, e o snapshot novo congela **só a referência** | ✅ |
| 21/08 | 24 testes novos (dedupe A/B/C/D, falhas de upload e de confirmação, snapshot A continua A). Suíte **1186/1186**, build verde | ✅ |
| 21/08 | `PENDENCIAS.md`: encerramento da gravação dupla + **regra de rollback 7B → 7A** | ✅ |
| 21/08 | **7B DEPLOYADA** — commit `490a236`, bundle `index-WDnlnv6E.js`. O build local reconstruído sai com o **mesmo hash**: o que foi medido é exatamente esse commit | ✅ |
| 21/08 | Content-addressing conferido **baixando os 4 arquivos do bucket e recalculando o SHA-256**: `nomeEhOHash` verdadeiro nos quatro; `tamanho` declarado = bytes reais | ✅ |
| 21/08 | Dedupe A/B/C/D pela UI real: mesma logo → 1 arquivo · logo nova → arquivo novo · voltar aos bytes de A → **reaproveita A** · o arquivo de B **continua existindo** | ✅ |
| 21/08 | **TESTE HISTÓRICO A/B, com reload completo: A = A, B = B.** Relatório A (2.497 B) aponta para LOGO A + RUBRICA A e renderiza LOGO-A/RUBRICA A; B (2.461 B) para B e renderiza B. **Nenhum base64 nos dois snapshots** | ✅ |
| 21/08 | **PDF de A imutável**: 4.971.975 bytes e SHA `c74e21af…ea85c5` idênticos depois da troca para B, conferidos rebaixando o arquivo | ✅ |
| 21/08 | Convivência provada em produção: relatório de **19/08** (base64, sem ref) reaberto hoje mostra a logo **original**, não a atual | ✅ |
| 21/08 | **Zero escrita histórica**: 24 chaves históricas conferidas por SHA-256 + versão, nenhuma alterada; `nr13_historico_relatorios` byte a byte idêntico; **nenhuma chave com conteúdo sumiu** | ✅ |
| 21/08 | Duas divergências no `EQUIPE TESTE` são **anteriores à 7B** (`versao_obsoleta`, erro de 20/08 01:42) — caso legado da Fase 10B, não corrigido | ⚠️ registrado |
| 21/08 | Livro do ZZ-FASE3: 2 entradas lacradas e **encadeadas** (`shaAnterior` de B = `sha256` de A) | ✅ |
| 21/08 | **Economia medida: snapshot 34.442 → 2.461 B, 14,0× menor.** A chave viva **não** encolheu — a dataURL continua lá pela D-11, e é assim que tem que ser agora | ✅ |
| 21/08 | Suíte **1186/1186**, build verde, bundle com o mesmo hash de produção | ✅ |
| 21/08 | **Portal, cliente AUTORIZADO: passou.** Cadeia provada chave a chave — LOGO A/B e RUBRICA A/B saem de `.meta.empresa.logoRef` e `.meta.assinantes.engenheiro.assinaturaRef` dos relatórios A e B. `nr13_minha_empresa` e `nr13_lista_phs` **não** entram no conjunto varrido: o 200 veio do vínculo, não do cadastro | ✅ |
| 21/08 | `portal_arquivo`: 200 nas 4 refs + 2 PDFs · **404 `nao_disponivel`** para arquivo REAL sem vínculo (`45cbb213`), hash inventado e outra org — **hash não é autorização** | ✅ |
| 21/08 | P1/P3 sem regressão: listar Storage 0 itens, assinar arbitrário 400, download direto 400, `app_storage` 0 linhas | ✅ |
| 21/08 | Portal serve os PDFs **byte a byte** iguais aos do engenheiro; Livro **remontado** no Portal renderiza LOGO-B + RUBRICA B | ✅ |
| 21/08 | Observação anotada: cabeçalho do Portal desenha a logo ANTIGA (cache IndexedDB da conta cliente em versão 1). Não é da 7B e não afeta documento — os documentos usam o dado fresco | ⚠️ registrado |
| 21/08 | **CONTRAPROVA PASSOU.** `ipiranga@gmail.com` (JWT conferido antes de qualquer requisição) recebe **404 `nao_disponivel`** nas **6** refs reais do ZZ-FASE3 — logoRef A/B, assinaturaRef A/B, pdfRef A/B. Nenhuma URL assinada emitida | ✅ |
| 21/08 | O 404 é **seletivo, não é conta vazia**: o ipiranga tem 2 TAGs próprias e, na MESMA rota com o MESMO token, o PDF do vínculo dele dá **200**. Sem isso o 404 seria o atalho `tags.length === 0` e não provaria a regra | ✅ |
| 21/08 | Não-enumerabilidade completa: **1 única assinatura de resposta** (status + corpo + cabeçalhos) entre ref alheia, arquivo sem vínculo, 2 hashes inexistentes, PDF alheio e outra organização | ✅ |
| 21/08 | P1/P3 com o token do ipiranga: listagem 0 itens nas 3 pastas, assinatura direta 400, download autenticado 400, download público 400, `app_storage` 0 linhas (amplo e filtrado) | ✅ |
| 21/08 | **PORTAL 7B = VALIDADO EM PRODUÇÃO ✅** — cadeia fechada: cliente001 → 200 · ipiranga com o MESMO path → 404 · hash inexistente → 404 indistinguível | ✅ |
| 22/08 | Rede da máquina caiu sozinha no meio da preparação — experimento **abortado sem baseline**, e a queda **não** foi aproveitada como teste | ⚠️ registrado |
| 22/08 | Rede estável (6/6 amostras). Push do `e315c13` concluído, `main` sincronizada | ✅ |
| 22/08 | Massa: `ZZ-TESTE-F7-OFFLINE-1` (Inspetor) criado **online e sem rubrica** — acrescenta em vez de sobrescrever, não toca `funciona01` nem `nr13_minha_empresa` | ✅ |
| 22/08 | **OFFLINE (acionado pelo dono).** Rede provada fora por **falha real** em 3 alvos. Salvou: dataURL 26.774 B presente, `assinaturaRef` **ausente** — nenhuma Ref prematura. Cofre com `pendente: true`, 3 tentativas, erro `Failed to fetch` | ✅ |
| 22/08 | **`navigator.onLine` respondeu `true` com a rede morta** — a justificativa da regra I-14, flagrada em produção | ✅ |
| 22/08 | Reload offline: app sobe pelo service worker, aviso correto, "Assinatura cadastrada", nada perdido | ✅ |
| 22/08 | **Reconnect = CENÁRIO B.** 140 s de observação + botão Sincronizar + reload: **nenhuma recuperação automática**. E a hipótese do órfão **não se confirmou** — o "Sincronizar" drena a fila de DADOS, não a de ARQUIVOS; o blob ficou no cofre e nada subiu | ✅ |
| 22/08 | **2ª edição reaproveita o trabalho offline**: mesmo hash `563da5f0…`, cofre vira `pendente: false`, bucket 3 → 4, `nomeEhOHash: true`. Nada reprocessado, nada duplicado | ✅ |
| 22/08 | Histórico conferido DEPOIS de tudo: A = A, B = B, PDFs byte a byte e SHA idênticos, `nr13_minha_empresa` e `funciona01` inalterados | ✅ |
| 22/08 | Suíte **1186/1186**, build verde, bundle `index-WDnlnv6E.js` | ✅ |
| 22/08 | **Todos os itens do P4 medidos.** Falta só a **decisão do dono** sobre documentar a limitação do offline | ⏳ |

---

## Ponto de retomada

**7A: VALIDADA ✅ · 7B: DEPLOYADA E VALIDADA NA PARTE MEDÍVEL · P4 ABERTO.**

Commit `490a236`, bundle `index-WDnlnv6E.js`. Suíte **1186/1186**, build verde — e o build
local sai com o **mesmo hash** do bundle em produção.

Medições completas em `docs/medicoes/2026-08-20-fase7b-validacao-producao.md`.

### O que já está provado em produção

| | |
|---|---|
| Content-addressing | 4 arquivos baixados do bucket, SHA-256 recalculado: o nome **é** o hash |
| Dedupe A/B/C/D | ✅ os quatro cenários, pela UI real |
| Gravação dupla D-11 | ✅ intacta nas duas chaves vivas |
| **Teste histórico A/B** | ✅ **A = A, B = B** depois de reload completo |
| **PDF imutável** | ✅ bytes e SHA-256 idênticos depois da troca para B |
| Convivência base64 × ref | ✅ relatório de 19/08 mostra a logo original |
| **Zero escrita histórica** | ✅ 24 chaves conferidas, 0 alteradas, 0 chaves com conteúdo perdidas |
| Livro | ✅ 2 entradas lacradas e encadeadas |
| Economia | ✅ snapshot **14,0× menor** (34.442 → 2.461 B) |

### Regra de rollback — também em `PENDENCIAS.md`

> **O rollback da 7B é SEMPRE `7B → 7A`. NUNCA para antes da 7A.**

Depois que um writer da 7B grava um snapshot com referência, voltar para antes da 7A faria o
leitor antigo ignorá-la e cair no dado **vivo** — documento histórico exibindo a logo atual.
É o cenário recusado ao aprovar o EXPAND → VALIDAR → SWITCH.

### O que falta — e por que não dá para fazer sozinho

**1 · Portal — VALIDADO EM PRODUÇÃO ✅.** Cadeia fechada com os **mesmos paths** nas três pontas:
`cliente001` com o relatório autorizado → **200**; `ipiranga` com **exatamente o mesmo
hash/path**, sem vínculo → **404**; hash inexistente → **404 indistinguível** (1 única assinatura
de resposta entre 6 casos). A origem do 200 foi reproduzida chave a chave —
`nr13_rel_…_ZZ-FASE3 → .meta.empresa.logoRef` e `→ .meta.assinantes.engenheiro.assinaturaRef` —
e `nr13_minha_empresa`/`nr13_lista_phs` sequer entram no conjunto varrido. O 404 do ipiranga é
seletivo: o PDF do vínculo dele dá 200 na mesma rota. **Hash/path não é autorização.**

**2 · Offline real — VALIDADO EM PRODUÇÃO ✅ (22/08).** Offline acionado pelo dono, rede provada
fora por falha real em 3 alvos. Resultado: dataURL preservada, **nenhuma Ref prematura**, item
no cofre com `pendente: true` — a cadeia I-14 visível. Reload offline preserva tudo.
No reconnect: **CENÁRIO B**, sem recuperação automática — e a hipótese do arquivo órfão **não
se confirmou**, porque o "Sincronizar" drena a fila de dados e não a de arquivos: ficou sem ref
**e** sem arquivo, que é o lado barato. A 2ª edição reaproveita o hash calculado offline
(`563da5f0…`), sem reprocessar nem duplicar. Histórico byte a byte.

**A lacuna que resta é de otimização, não de correção:** `FAMILIAS_RECUPERAVEIS` não cobre
`nr13_lista_phs`/`nr13_minha_empresa`, então a identidade cadastrada sem rede fica em base64
até a próxima edição. Correção mínima, para uma fase seguinte: **(a)** drenar a fila de
ARQUIVOS junto com a de dados; **(b)** só então cobrir essas duas famílias na varredura.

**Todos os itens do P4 estão medidos e verdes. O portão só fecha com a decisão do dono sobre documentar a limitação do offline. Não iniciar a Fase 8.**
