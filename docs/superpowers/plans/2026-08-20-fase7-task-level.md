# FASE 7 — Logo e rubrica endereçadas por conteúdo

**Achado:** A-05. **Plano macro:** `2026-08-15-evolucao-arquitetura.md`, linhas 1801–2141.
**Portão:** **P4 fecha nesta fase.**

> **A META NÃO É "ZERO BASE64".** É separar três coisas que hoje estão misturadas:
> a **configuração atual** da empresa, a **referência congelada** de um documento, e o
> **PDF arquivado**, que é a verdade definitiva.

---

## Estado atual da fase

`🔵 PLANEJAMENTO / BASELINE` — **nada implementado, nada alterado.**

| Etapa | Estado |
|---|---|
| Ler a Fase 7 no plano macro | ✅ FEITO (20/08) |
| Inventário de consumidores por varredura em `public/` e `src/` | ✅ FEITO |
| Medir duplicação real por hash | ✅ FEITO |
| Verificar infraestrutura reaproveitável | ✅ FEITO |
| Criar o task-level | ✅ FEITO (este arquivo) |
| Apresentar o plano | 🔄 EM CURSO |
| **Implementar** | ⛔ **NÃO AUTORIZADO** |

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

- [ ] **T1** — `imagem.ts`: `processarAssinatura` e `comprimirImagem` devolvem também o blob
- [ ] **T2** — `MinhaEmpresa.tsx` e `Funcionarios.tsx` gravam `logoRef`/`assinaturaRef` (gravação dupla), reusando `salvarArquivoPorConteudo`
- [ ] **T3** — Tipos: `Funcionario.assinaturaRef?`, `AssinanteSnapshot.assinaturaRef?`, `meta.empresa.logoRef?`
- [ ] **T4** — `palco.ts`: estender `CAMPO_REF_NOMEADO` para `nr13_minha_empresa.logoRef` e `nr13_lista_phs[].assinaturaRef`, resolvendo para os campos que os templates já leem, com **dedupe por caminho**
- [ ] **T5** — Snapshot de relatório **novo** congela a referência
- [ ] **T6** — `rel-assinatura.js` / `rel-empresa.js` / `pront-assinatura.js`: ordem `ref → dataURL → vazio`
- [ ] **T7** — Testes (ver `## Testes`), incluindo estender `palco.varreduraTemplates.test.ts`
- [ ] **T8** — `PENDENCIAS.md`: item do encerramento da gravação dupla, com data-alvo = deploy + 45 dias
- [ ] **T9** — Medição, validação em produção e **PORTÃO P4**

---

## Testes

- [ ] Mesmo conteúdo → **mesmo path**, um arquivo só
- [ ] Conteúdo diferente → path diferente; **o antigo continua resolvível**
- [ ] Logo nova gera hash e ref; rubrica idem
- [ ] Falha de upload → **origem preservada** (mesmo fallback da Fase 6, que depois a recupera)
- [ ] Arquivo pendente **não** vira ref definitiva
- [ ] Offline: cadastrar rubrica → blob no cofre, ref gravada, upload retomado
- [ ] Documento **novo** usa a logo atual; documento **antigo** continua com a anterior
- [ ] Relatório com `pdfRef` **não** regenera e mantém o **SHA-256**
- [ ] Relatório legado (sem `pdfRef`) continua remontando com a imagem congelada
- [ ] Snapshot antigo permanece **byte a byte**
- [ ] Livro continua funcionando — **regressão bloqueante**
- [ ] Portal abre o histórico e exibe a rubrica
- [ ] **URL assinada nunca persistida**
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

---

## Ponto de retomada

**Plano pronto. NADA implementado. Aguardando aprovação.**

Três pontos precisam de decisão antes de qualquer código:

1. **D7-1** — resolver no **palco** (zero template alterado) em vez de tocar nos 41 arquivos
   HTML, como o plano macro sugeria?
2. **D7-3** — hashear os bytes **depois** do processamento atual (`processarAssinatura` /
   `comprimirImagem`), nunca reprocessando imagem já existente?
3. **Escopo** — confirmar que os 14 relatórios legados e os 12 snapshots antigos ficam
   **integralmente intocados**, mesmo sendo a maior parte dos 475,8 KB.

**Não iniciar a Fase 8.**
