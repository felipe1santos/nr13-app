# Etapa 7A em produção — validação

**Data:** 20/08–21/08/2026 · **Bundle:** `index-D_-wTh2v.js` (anterior: `index-t6_YX0dz.js`)
**Conta:** `teste@gmail.com` (mestre) e `ipiranga@gmail.com` (cliente). Nenhuma organização real.
**Nenhum conteúdo base64 foi registrado.**

> **O que a 7A precisava provar:** o sistema **sabe ler** referência de logo e rubrica, **sem
> mudar comportamento histórico** e **sem que nenhum writer comece a produzi-las**.

---

## 1. Bundle

| | |
|---|---|
| No servidor e **carregado na aba** | `index-D_-wTh2v.js` |
| Marcadores 7A (`logoRef`, `assinaturaRef`) | ✅ presentes |
| Fases anteriores (`.thumb.jpg`, recuperação) | ✅ intactas |

## 2. Sistema interno

| Tela | Resultado |
|---|---|
| Equipamentos | ✅ 4 cards, 4 com foto |
| Livro de Registro | ✅ abre; 13 entradas em 3 livros |
| Relatórios | ✅ lista, criação e visualização normais |
| Geração de documento | ✅ montou e renderizou |
| **Console** | ✅ **nenhum erro** — só os `INFO` dos gatilhos de background |

## 3–4. Histórico e identidade visual

### PDFs arquivados — hash conferido antes e depois

| Registro | Bytes | SHA-256 |
|---|---|---|
| `nr13_rel_REL-1786586275346_VASO A23` | 6.802.341 | **idêntico** |
| `nr13_rel_REL-1787152599432_COMPRESSOR…` | 4.604.131 | **idêntico** |

Os dois também batem com o `sha256` gravado na emissão. **Nenhuma regeneração.**

### Identidade visual antiga

Provado pelo teste controlado do §5: **base64 congelado vence sempre sobre qualquer ref**, e
**ref que não resolve não é substituída pela imagem atual**.

## 5. Livro de Registro

| | |
|---|---|
| Livros / entradas | 3 / 13 |
| `VASO A23` | 10 entradas — 3 com `assinaturaRef`, 1 com `assinaturaImg`, 1 **lacrada** |
| Motor próprio | ✅ continua funcionando; a 7A **não o alcança** (`refsNoLugarDaChave('nr13_livro_…') === []`) |

## 6. Portal do Cliente — P1/P3 intactos

Sessão real de `ipiranga@gmail.com`, papel `cliente`, bundle 7A.

| Teste | Resultado |
|---|---|
| Arquivo do próprio cliente | ✅ **200** com URL |
| Arquivo REAL de outro cliente | ✅ **404 `nao_disponivel`** |
| Caminho inexistente | ✅ **404 `nao_disponivel`** — resposta idêntica |
| Ler `app_storage` por REST | ✅ **`[]`** |
| Cards | ✅ 13, com imagem |

### A rubrica da organização foi RECUSADA — e isso é o comportamento certo

Pedi ao Portal, como cliente, o caminho da rubrica que existe no bucket
(`assinaturas/45cbb213….png`): **404 `nao_disponivel`**.

**Não é defeito.** É a D-05 funcionando: a autorização é por **vínculo**, não por pasta. Hoje
nenhum relatório desse cliente referencia a rubrica — os snapshots dele guardam a imagem em
base64, não em referência. Conhecer o hash **não dá acesso a nada**.

> **Consequência direta para a 7B, e ela precisa estar escrita antes:** quando o snapshot
> passar a carregar `assinaturaRef`, a rubrica passará a ser alcançável por `coletarPaths` a
> partir do relatório que o cliente pode ver — e só então será servida. **É por isso que o
> teste "Portal exibe a rubrica" pertence à 7B, e é bloqueante lá.**

## 7. PROVA DE NÃO ESCRITA

Baseline com SHA-256 e `versao` de **94 chaves**, tomado **antes** de carregar o bundle novo;
comparado depois de toda a validação.

| Família histórica | Escreveu? |
|---|---|
| `nr13_rel_` (relatórios e snapshots) | ✅ **NÃO** |
| `nr13_minha_empresa` (logo) | ✅ **NÃO** |
| `nr13_lista_phs` (rubricas) | ✅ **NÃO** |
| `nr13_livro_` | ✅ **NÃO** |
| Chaves novas criadas | ✅ **nenhuma** |
| PDFs arquivados | ✅ bytes e SHA-256 **idênticos** |

### As 4 chaves que mudaram — e por quê

| Chave | Versão | Causa |
|---|---|---|
| `nr13_relatorio_meta_atual` | 31 → 32 | **eu gerei um documento** durante a validação |
| `nr13_inspecao_atual` | 22 → 23 | idem — dados do container na geração |
| `nr13_injecao_atual` | 22 → 23 | idem |
| `nr13_assinantes_rel_ZZ-FASE3` | 1 → 2 | `carregarAssinantesRel` ao abrir relatório **novo** (comportamento pré-existente) |

**Nenhuma é histórica.** As quatro são chaves de **montagem**, reescritas a cada geração, e
mudaram porque a validação incluía gerar um documento (item 2 do roteiro). A prova de que não
vieram da 7A: as duas chaves que a 7A **lê** — `nr13_minha_empresa` e `nr13_lista_phs` — estão
entre as que **não mudaram**.

> **Declaração de método:** meu script marcou "ATENÇÃO" porque o critério era
> `mudaram === 0`, sem distinguir chave histórica de chave de montagem. O critério era grosso
> demais; a análise acima é a leitura correta. Registro o fato em vez de silenciar o alarme.

## 8. TESTE CONTROLADO DA NOVA CAPACIDADE DE LEITURA

Os writers ainda não produzem referências, então a capacidade foi exercitada com massa
controlada **apenas no cache local** (IndexedDB) — **o servidor nunca foi tocado**, o que o §7
comprova. Referência usada: a rubrica que **já existe** no bucket. Estado restaurado ao fim.

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | `logo: ''` + `logoRef` válida | resolve | ✅ **resolveu** — 278×141, 16,5 KB no palco |
| 1-bis | rubrica só com `assinaturaRef` válida | resolve | ✅ **resolveu** — 278×141 |
| 2 | `assinatura: ''` + **ref inválida** | campo continua vazio, **sem substituto** | ✅ **vazio**; a ref continua no registro para a próxima tentativa |
| 3 | `assinatura` base64 + `assinaturaRef` válida | **base64 vence** | ✅ **venceu** — a dataURL original ficou intacta |

**O caso 2 é o mais importante da fase:** a referência inválida **não** foi trocada pela
logo/rubrica atual. Um documento histórico nunca recebe identidade visual de outra época por
causa de uma falha de resolução.

### Restauração

Cache local restaurado e conferido: `nr13_minha_empresa` de volta com a logo em base64 e
**sem** `logoRef`; `nr13_lista_phs` com 1 funcionário e **sem** nenhum item `ZZ-TESTE-F7A`.

---

## 9. Conclusão da 7A

| Critério | Resultado |
|---|---|
| Bundle novo no ar | ✅ |
| Sistema interno sem erro novo | ✅ |
| Relatório legado e arquivado abrem | ✅ |
| SHA-256 dos PDFs arquivados idêntico | ✅ |
| Nenhuma identidade visual mudou | ✅ |
| Livro sem regressão | ✅ |
| Portal com P1/P3 intactos | ✅ |
| **Nenhuma escrita histórica** | ✅ |
| **Leitor resolve ref; ref inválida não vira substituto; base64 vence** | ✅ |
| **Nenhum writer produz referência ainda** | ✅ |

## 10. Reprodução

1. Baseline: ler `app_storage` da org, guardar `sha256(valor)` + `versao`; baixar cada PDF de
   `pdfRef` e hashear os bytes.
2. Carregar o bundle novo, navegar e gerar um documento.
3. Reler tudo e comparar, separando chave histórica de chave de montagem.
4. Teste de leitura: alterar **apenas o IndexedDB local**, montar um documento, ler o palco,
   restaurar.
