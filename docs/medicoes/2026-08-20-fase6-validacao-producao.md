# Fase 6 em produção — validação parcial e limitação encontrada

**Data:** 20/08/2026 · **Bundle:** `index-t6_YX0dz.js` (anterior: `index-Ite3xGkv.js`)
**Conta:** `teste@gmail.com`, organização `99f642d3`. Nenhuma organização real foi tocada.
**Nenhum conteúdo base64 foi registrado** — só chave, tamanho, versão e hash.

> **A Fase 6 NÃO está fechada.** O caminho feliz não pôde ser validado porque **a UI não produz
> o fallback Classe C** — ver §3. Proposta de massa controlada em §5, aguardando aprovação.

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

## 5. Proposta de massa controlada — aguardando aprovação

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
