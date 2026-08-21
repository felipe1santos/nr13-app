# Fase 6 em produção — validação completa

**Data:** 20/08/2026 · **Bundle:** `index-t6_YX0dz.js` (anterior: `index-Ite3xGkv.js`)
**Conta:** `teste@gmail.com`, organização `99f642d3`. Nenhuma organização real foi tocada.
**Nenhum conteúdo base64 foi registrado** — só chave, tamanho, versão e hash.

> **Parte 1 (§1–§6):** o que foi validado antes da massa, e a **limitação descoberta** — a UI não
> produz o fallback Classe C (§3).
> **Parte 2 (§7–§12):** validação completa das três famílias com massa controlada pela RPC
> oficial, método **aprovado pelo dono**.

---

## 1. Bundle no ar

| | |
|---|---|
| Bundle no servidor e **carregado na aba** | `index-t6_YX0dz.js` |
| Marcadores da Fase 6 | `[arquivos] recuperação:`, `prontuario-fabricante`, `certificados`, `componentes` — todos presentes |
| Marcadores da Fase 5 | `.thumb.jpg` presente (sem regressão) |

## 2. O recuperador é iniciado pela `RotaProtegida`

Prova comportamental: no boot, o console registrou

```
[livro] rubricas: Object
```

que vem de `migrarRubricasEmSegundoPlano`, **a linha imediatamente anterior** à chamada de
`recuperarArquivosEmSegundoPlano()` no mesmo bloco, sem `await` entre elas. Se aquela executou,
esta executou.

O recuperador **não logou** — e isso é o desenho: ele só escreve no console quando
`convertidos > 0 || adiados > 0`. Como não há nenhum registro Classe C na organização
(baseline da Fase 6), não havia o que relatar. **Nenhum erro no console.**

---

## 3. LIMITAÇÃO — a UI não produz o fallback Classe C

Eu havia antecipado o risco ao entregar a implementação. Confirmado, e a prova é do código.

### 3.1 `salvarArquivo` engole a falha de rede de propósito

```ts
// src/services/fotos.ts
if (!org) throw new Error('sem organização ativa: entre novamente para anexar arquivos');  // :222
await cofre.guardar({ path, blob, mimeType, pendente: true, ... });                        // :237
await enviarPendente(path).catch(() => {});                                               // :248
```

A linha `:248` é a chave: **falha de upload não lança.** O arquivo fica no cofre marcado como
pendente e a fila o retoma sozinha — exatamente o comportamento que a Fase 5 validou de ponta
a ponta com a rede desligada.

**Consequência:** bloquear a rede faz `salvarArquivo` ter SUCESSO. O registro nasce com
`pdfRef`/`fotoRef` e o arquivo sobe depois. **O `catch` do fallback nunca é alcançado.**

### 3.2 As duas condições reais de cada `catch`, provadas

Os três serviços têm o `try` em volta de `salvarArquivo`, então só disparam quando ela lança:

| # | Condição | Como aconteceria de verdade |
|---|---|---|
| 1 | `escopoStorageAtual()` devolve `null` (`fotos.ts:222`) | Só quando **não há organização E não há usuário**. `escopoStorageAtual` tem fallback para `user_id` (`supabase.ts:38-43`), então remover `nr13_org_id` **não** basta — seria preciso não haver sessão, e sem sessão a UI não deixa anexar nada |
| 2 | `cofre.guardar()` lança (`fotos.ts:237`) | IndexedDB indisponível, bloqueado pelo navegador ou com cota estourada — **aparelho degradado**, não condição de rede |

### 3.3 O que isso significa — é notícia boa

**O fallback base64 Classe C é hoje muito mais raro do que o achado A-10 supunha.** O A-10 foi
escrito antes de a migração das fotos (10/08/2026) mover a falha de rede para o cofre + fila.
Depois dela, o caminho "sem sinal em campo" — que era o motivo original do fallback — **deixou
de produzir base64**.

Isso explica, com causa, o que o baseline já tinha medido: **zero registros Classe C** na
organização de teste.

O fallback continua certo e continua existindo (decisão E4). O recuperador continua sendo a
rede de segurança para as duas condições acima. **Só não dá para provocá-lo pela UI.**

> **Nenhum erro artificial foi forçado em produção e nenhum registro base64 foi fabricado.**

---

## 4. O que FOI validado em produção

### 4.1 As famílias protegidas ficam byte a byte

Capturei **SHA-256 e versão** de **25 chaves** protegidas antes do boot com o bundle novo,
recarreguei (o recuperador roda em background) e comparei.

| | |
|---|---|
| Chaves protegidas conferidas | **25** |
| Delas, `nr13_rel_` **contendo base64** | **11** |
| **Chaves alteradas** | **0** |
| Veredito | **nenhuma família protegida foi tocada** |

Famílias cobertas na conferência: `nr13_rel_` (snapshots congelados com logo e rubrica),
`nr13_minha_empresa` (logo), `nr13_lista_phs` (rubrica), `nr13_livro_` e `nr13_fotos_`.

**Esta é a evidência que o dono pediu:** um `nr13_rel_` com base64 permanece **byte a byte**
inalterado depois de o recuperador rodar. Nem hash nem `versao` mudaram — ou seja, não houve
nem escrita silenciosa nem mutação.

### 4.2 Sem regressão

| | |
|---|---|
| Erros no console | nenhum |
| Fase 5 no bundle | intacta |
| Suíte | **1148/1148** |
| Build | verde |

---

## 5. Proposta de massa controlada — **Opção B APROVADA** (executada na Parte 2)

O dono pediu para não fabricar estado que a UI não produz sem aprovar o método antes. Duas
opções, com o que cada uma custa.

### Opção A — induzir a condição real nº 2 (falha do cofre), com a UI fazendo todo o resto
**Recomendada.**

Na aba de teste, antes de anexar o documento, fazer o `indexedDB.open('nr13_fotos')` falhar.
Isso reproduz **exatamente** a condição real do `catch` (`cofre.guardar` lança). Todo o resto é
o produto: a tela de Certificados anexa o PDF, `salvarRastreabilidade` tenta o bucket, o `catch`
dispara e grava o base64 **pelo caminho normal do app** (`salvar`).

| | |
|---|---|
| Fidelidade | **alta** — o registro nasce do próprio código de produção, não de INSERT |
| O que é induzido | **uma condição de ambiente**, não um dado |
| Risco | mexer no cofre da aba; some ao recarregar. Nenhuma escrita fora do fluxo do app |
| Ressalva honesta | é indução deliberada de falha, ainda que de uma condição que ocorre de verdade em aparelho degradado |

### Opção B — gravar um registro Classe C pelo caminho oficial de escrita
**Plano B.**

Gravar `nr13_rastreab_ZZ-TESTE-F6-A` (e as outras duas) com o campo base64 preenchido, usando a
RPC `aplicar_mutacao_storage` — o mesmo caminho que o app usa, não INSERT cru.

| | |
|---|---|
| Fidelidade | **média** — o dado é fabricado; só o transporte é o oficial |
| Risco | menor no ambiente, maior na representatividade |

### Em ambas

Somente `teste@gmail.com`, objetos `ZZ-TESTE-F6-*`, dados descartáveis, e apagados ao fim.
Depois: religar o normal, deixar o recuperador rodar, e medir o registro **antes × depois**.

### Opção C — aceitar a cobertura atual

Os 23 testes automatizados já cobrem caminho feliz, as seis falhas, idempotência, teto,
somente-leitura e offline. O que **falta** é a prova de ponta a ponta com o Storage real. O
dono pode considerar suficiente — mas eu **não** fecho a fase por conta própria dizendo que
validei em produção o que não validei.

---

## 6. Reprodução

1. Bundle: `fetch('/', {cache:'reload'})` → `/assets/*.js` → procurar `[arquivos] recuperação:`.
2. Proteção: ler `app_storage` da org, guardar `sha256(valor)` e `versao` das famílias
   protegidas, recarregar o app, reler e comparar.
3. Console: filtrar por `arquivos|recupera|livro|rubricas`.

---

# PARTE 2 — Validação com massa controlada (Opção B, aprovada pelo dono)

> **Massa sintética controlada criada pela RPC oficial para validar em produção o recuperador;
> o estado NÃO foi produzido naturalmente pela UI porque o fluxo atual de Storage/IndexedDB
> impede que falha de rede gere base64.**
>
> Nenhum INSERT direto no banco. Nenhuma organização real. Chaves `ZZ-TESTE-F6-*`.

## 7. Como a massa foi criada

Escrita pela RPC `aplicar_mutacao_storage` — o mesmo caminho que o app usa —, com
`p_op: 'set'` e `p_versao_esperada: 0`.

> **Correção registrada:** a primeira tentativa usou `p_op: 'upsert'` e a RPC recusou com
> `sem_permissao`. O SQL só aceita `set`/`del` (`armazenamento_v2.sql:128`). Corrigido; as três
> gravações voltaram `{"status":"aplicado","versao":1}`.

A estrutura de cada registro foi conferida **contra o tipo do serviço produtor** antes de
gravar, para ser fiel ao que cada `catch` produziria:

| Família | Estrutura | Conferida contra |
|---|---|---|
| `nr13_rastreab_` | objeto `Rastreabilidade` com `pdfBase64` e **sem** `pdfRef` | `rastreabilidadeService.ts:24-60` |
| `nr13_pront_fab_` | objeto `ProntuarioFabricanteSalvo` com `pdfBase64` e **sem** `pdfRef` | `ProntuarioFabricante.tsx:13-27` |
| `nr13_componentes_cal_` | **array** de `ComponenteCal` com `foto` e **sem** `fotoRef` | `componentesService.ts:12-31` |

Arquivos: PDFs mínimos **válidos** (com `%PDF-1.4`, catálogo, página e stream de texto) e um
JPEG real gerado por canvas.

## 8. ANTES da recuperação

| Chave | Versão | Registro | Arquivo | SHA-256 dos bytes |
|---|---|---|---|---|
| `nr13_rastreab_ZZ-TESTE-F6-RAST` | 1 | **841 B** | 403 B | `ebf6554402f63d2b…` |
| `nr13_pront_fab_ZZ-TESTE-F6-EQ` | 1 | **680 B** | 409 B | `b1930677a8495c23…` |
| `nr13_componentes_cal_ZZ-TESTE-F6-EQ` | 1 | **9.702 B** | 7.153 B | `1155a87ad39e60d8…` |

| Verificação | Resultado |
|---|---|
| base64 presente | ✅ nas três |
| Ref correspondente | ✅ **ausente** nas três |
| Arquivos no destino definitivo | ✅ **0** em `certificados/`, `prontuario-fabricante/` e `componentes/` |
| Logo: o base64 era a **única** representação do arquivo | ✅ |

Nenhum conteúdo base64 foi copiado para log ou Markdown.

## 9. DEPOIS — o recuperador de produção rodou sozinho

Console do boot: **`[arquivos] recuperação: Object`** às 22:53:09.

| Chave | Antes | Depois | Redução | base64 saiu | Bytes conferem | **Hash confere** |
|---|---|---|---|---|---|---|
| `nr13_rastreab_ZZ-TESTE-F6-RAST` | 841 B | **447 B** | **46,8 %** | ✅ | ✅ 403 B | ✅ |
| `nr13_pront_fab_ZZ-TESTE-F6-EQ` | 680 B | **287 B** | **57,8 %** | ✅ | ✅ 409 B | ✅ |
| `nr13_componentes_cal_ZZ-TESTE-F6-EQ` | 9.702 B | **309 B** | **96,8 %** | ✅ | ✅ 7.153 B | ✅ |

**O SHA-256 do arquivo baixado do bucket é idêntico ao dos bytes originais nas três famílias.**
O conteúdo atravessou a recuperação sem alteração de um único byte.

Referências gravadas, cada uma na pasta que o serviço já usava:

```
certificados/800d9589-9a5b-4777-879f-341f2d8c7016.pdf
prontuario-fabricante/923d0b9b-0240-4571-8d12-6ef744354a3b.pdf
componentes/fe83c88f-c574-4639-b04a-14a030d045c4.jpg
```

Versão de cada registro: **1 → 2**. Uma única escrita por registro.

> **Sobre os percentuais:** os PDFs de teste têm ~400 bytes, então a redução do registro
> (46,8 % e 57,8 %) **subestima** o caso real — o que sobra são os campos de metadado, que não
> encolhem. O componente, com um JPEG de 7 KB, mostra o efeito de verdade: **96,8 %**. Com um
> certificado real de 500 KB, o registro sairia de ~683 KB para 447 B — **99,93 %**.

## 10. Idempotência — segunda execução

Recarreguei o app; o recuperador rodou de novo sobre os mesmos registros.

| | Antes | Depois |
|---|---|---|
| Registros alterados | — | **0** |
| Versão de cada registro | 2 | **2** |
| Hash de cada registro | — | **idêntico** |
| Arquivos em `certificados/` | 1 | **1** |
| Arquivos em `prontuario-fabricante/` | 1 | **1** |
| Arquivos em `componentes/` | 1 | **1** |
| **Arquivos novos criados** | — | **0** |

**Nenhuma duplicação, nenhuma versão desnecessária, nenhuma mutação nova.**

## 11. Famílias protegidas — reconferidas DEPOIS da recuperação real

| | |
|---|---|
| Chaves protegidas conferidas | **25** |
| Delas, `nr13_rel_` **com base64** | **11** |
| **Alteradas** | **0** |

SHA-256 e `versao` idênticos aos do baseline, tomado antes de tudo. **`nr13_rel_`, logo,
rubrica, snapshots e relatórios arquivados permaneceram byte a byte** enquanto o recuperador
convertia as três famílias ao lado.

## 12. Massa de teste — registrada para limpeza posterior

**Não removida**, conforme instrução. Identificação:

| Tipo | Item |
|---|---|
| Registro | `nr13_rastreab_ZZ-TESTE-F6-RAST` |
| Registro | `nr13_pront_fab_ZZ-TESTE-F6-EQ` |
| Registro | `nr13_componentes_cal_ZZ-TESTE-F6-EQ` |
| Arquivo | `<org>/certificados/800d9589-9a5b-4777-879f-341f2d8c7016.pdf` |
| Arquivo | `<org>/prontuario-fabricante/923d0b9b-0240-4571-8d12-6ef744354a3b.pdf` |
| Arquivo | `<org>/componentes/fe83c88f-c574-4639-b04a-14a030d045c4.jpg` |

Total: ~1 KB de registro e ~8 KB de arquivo, na organização de teste. Sem exclusão destrutiva.
