# 9F.2 — ROLLOUT EM PRODUÇÃO (29/08/2026)

> **O que este arquivo é:** o registro do rollout controlado da 9F.2 — SQL aplicado,
> reprojeção da organização de TESTE, deploy, roteiro com a flag ligada só nela e rollback.
> Nenhuma organização cliente foi tocada. A 9F.3 não foi iniciada.

Organização de teste: `99f642d3-6efd-446d-9e76-d234ad8d211c` (`teste@gmail.com`).
Commit publicado: **`6342041`**.

---

## 1 · Preflight (19:33:55) — somente leitura

| checagem | valor |
|---|---|
| `equipamentos_index.tem_prontuario` | **ausente** (esperado) |
| `org_sync.prontuarios_v9` · `definir_prontuarios_v9` | **ausentes** (esperado) |
| projeções | equip **17** · rel **22** · cal **18** · pendências **0** |
| flags | `busca_v9` 0 · `boot_v9` 2 · `inspecoes_v9` 0 |

Estado idêntico ao registrado no fim da 9F.1. **Sem divergência** desta vez.

---

## 2 · SQL aplicado (5 arquivos, na ordem, do SHA `6342041`)

Carregados por `fetch` do `raw.githubusercontent.com` **pelo SHA do commit** e injetados no
Monaco. Ordem: `busca_index` → `busca_manutencao` → `busca_index_rpc` → `busca_consulta` →
`prontuarios_v9_flag`. Todos "Success. No rows returned".

### Verificação por marcador no banco (19:37:33 e 19:38:39)

| marcador | resultado |
|---|---|
| `tem_prontuario` existe e é **NULLABLE** | ✅ |
| `projetar_equipamento` lê `nr13_prontuario_` | **true** |
| `projetar_equipamento` tem `tem_prontuario = excluded.tem_prontuario` | **true** (o defeito achado no laboratório, agora em produção) |
| `projetar_chave` despacha `nr13_prontuario_` | **true** |
| retorno de `buscar_equipamentos` traz `tem_prontuario` | **true** |
| sobrecargas de `buscar_equipamentos` | **1** |
| `definir_prontuarios_v9` existe | **1** |
| grants `buscar_equipamentos` / `contar_equipamentos` | anon **false** · authenticated **true** |
| grant `definir_prontuarios_v9` para authenticated | **false** (revogada) |
| `prontuarios_v9` ligada | **0 de 30** — nasce desligada |
| `busca_v9` · `boot_v9` · `inspecoes_v9` | **0** · **2** · **0** — inalteradas |

---

## 3 · Reprojeção — SOMENTE a organização de teste (19:39:05)

4 TAGs, via `projetar_equipamento(org, tag)`. A organização piloto em cliente
(`92a28bff…`) **não foi reprojetada**.

**Paridade contra a verdade, linha a linha:**

| TAG | projetado | existe `nr13_prontuario_`? | bate | `inspecoes` (9F.1) |
|---|---|---|---|---|
| COMPRESSOR V8-15/200L | **true** | sim | ✅ | **1** (preservada) |
| DASDSA | **false** | não | ✅ | null |
| ZZ-FASE3 | **false** | não | ✅ | null |
| ZZ-TESTE-P2 | **false** | não | ✅ | null |

A contagem da 9F.1 sobreviveu à reprojeção — as duas colunas convivem.

---

## 4 · Deploy do front

Coolify, Redeploy manual, bundle **`index-DUDKIbuX.js`** contendo a string `prontuarios_v9`,
conferido por `curl` **fora do navegador**.

> **ARMADILHA NOVA, e ela custou 15 minutos:** o primeiro clique em *Redeploy* **não disparou
> deploy nenhum** — nem erro, nem log. A lista continuou com o deployment de 4 horas antes e o
> bundle em produção seguiu sendo o da 9F.1. A causa foi a **sessão do Livewire velha** na aba
> aberta há horas: o botão existe, aceita o clique e não faz nada. **Recarregar a página do
> Coolify antes de clicar** resolveu na primeira tentativa. Conferir sempre pelo bundle, não
> pelo clique.

---

## 5 · Roteiro na organização de TESTE

### 5.0 · Baseline com a flag OFF (bundle novo já publicado)

Tela legada: "Equipamentos Cadastrados", **zero campo de busca**, 4 cartões, badges
`Prontuário OK` + 3× `Sem Prontuário`, 249 nós de DOM.

### 5.1 · Flag ON (só a org de teste)

Conferido no banco antes de olhar a tela: `prontuarios_v9` ligada **apenas** em
`99f642d3…`; piloto cliente em `false`; `busca_v9` 0; `boot_v9` 2; `inspecoes_v9` 0.

| # | passo | resultado |
|---|---|---|
| 1 | Tela nova sobe | campo "Buscar por TAG, equipamento, fabricante ou cliente…" presente |
| 2 | **Paridade da lista** | **"4 resultados"**, as MESMAS 4 TAGs do baseline |
| 3 | **Badge** | `Prontuário OK` + 3× `Sem Prontuário` — **idênticos ao legado** |
| 4 | Busca por TAG (`ZZ-FASE3`) | **1 resultado**, e é ele |
| 5 | Termo inexistente | "Nenhum resultado" + *"Nenhum equipamento encontrado para XPTO-NAO-EXISTE-9F2."* |
| 6 | Limpar | volta a 4, mesmas TAGs |
| 7 | **Abrir o equipamento** | ordem medida: **`semear:app_storage` → `ler:nr13_prontuario_COMPRESSOR…`**; 2 requisições de semeadura (as duas passadas de `carregarEquipamento`), **24,5 KB**, e **todas filtradas pela TAG escolhida** |
| 8 | PDF | **zero**. As 2 requisições ao bucket eram **imagens `.jpg`** da foto do equipamento (97,9 KB), baixadas ao ABRIR o documento — não na lista, e não PDF |
| 9 | **As 6 folhas** | abriram com conteúdo real (564 a 2.322 caracteres) |
| 10 | **Paridade do documento** | com a flag OFF, o MESMO equipamento reaberto: as seis folhas com texto **IDÊNTICO byte a byte** (1097 / 564 / 1333 / 1110 / 2322 / 1404) |

### 5.2 · Rollback (20:16)

`definir_prontuarios_v9(org, false)` → tela legada de volta, mesmas 4 TAGs, mesmos badges.

| | |
|---|---|
| `auditar_projecao` | **`convergiu: true`**, pendências **0** |
| `prontuarios_v9` | **0 de 30** |
| `busca_v9` · `boot_v9` · `inspecoes_v9` | **0** · **2** · **0** |
| projeções | **17 / 22 / 18** · `busca_pendencias` **0** |
| `app_storage` | **803** linhas vivas |

---

## 6 · O que NÃO foi provado neste rollout — declarado, não presumido

1. **Escala.** A organização de teste tem **4 equipamentos**. Virtualização, keyset e paginação
   seguem provados apenas em laboratório (1k/10k/50k). É a MESMA limitação declarada no
   fechamento da 9E e no rollout da 9F.1.
2. **O estado `null` do badge.** Em produção ele não aparece: a org de teste foi reprojetada, e
   toda linha tem `true`/`false`. O "não sei → badge some" está provado no laboratório, no
   `testes-9f2.sql` e no teste de unidade — **não** na tela de produção.
3. **Cache frio / offline** sob `prontuarios_v9`: não exercitado.
4. **Organização cliente:** `92a28bff…` não foi reprojetada nem teve a flag ligada;
   `cmam.caldeiras` intocada.

> **Um estorvo do roteiro, e o que ele NÃO é:** ao reabrir o documento pelo caminho legado, a
> tela recusou com *"já está aberto"* e nenhuma folha montou. Era a **trava do palco**
> (`nr13_palco_dono`) segurando a posse da montagem anterior, feita por esta mesma aba antes de
> um reload — comportamento normal e existente da trava, idêntico nos dois caminhos da flag.
> Expirado o prazo, o documento abriu normalmente. Registrado para não ser confundido com
> defeito da 9F.2.

---

## 7 · Estado ao fim

| | |
|---|---|
| SQL da 9F.2 em produção | **aplicado (5/5)** e verificado por marcador |
| Projeção | org de teste reprojetada · `convergiu: true` · pendências 0 |
| Front | `6342041` publicado · bundle `index-DUDKIbuX.js` |
| `prontuarios_v9` | **0 de 30** — desligada em todas |
| `busca_v9` / `boot_v9` / `inspecoes_v9` | **0** / **2** / **0** — inalteradas |
| Conta cliente | nenhuma tocada · nenhum PDF regenerado · nenhum SHA-256 alterado |
| 9F.3 | **não iniciada** |
