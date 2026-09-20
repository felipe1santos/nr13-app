# Anexar prontuário existente em PDF — implementação e E2E local

**Data:** 20/09/2026 · **Ambiente do desenvolvimento e do E2E:** Supabase LOCAL
(`npx supabase start`) + Vite 5199 + Chromium headless (Playwright).

> **SUBIDA PARA PRODUÇÃO — 20/09/2026**, autorizada pelo dono depois desta medição.
> O registro do rollout está no §15, no fim deste arquivo.

Organização A: `lab@local.test` (`02cb1a15-…`). Organização B: `lab2-outra-org@local.test`
(`32eb9b7f-…`). Equipamentos de teste: `ZZ-PRONT-01`, `ZZ-PRONT-02`.

---

## 1 · O que foi implementado

Um prontuário pode entrar no sistema de duas maneiras, e a segunda não existia:

| | como nasce | onde mora o arquivo |
|---|---|---|
| **A · gerado aqui** | formulário → prévia → **Emitir** | `<org>/relatorios/<uuid>.pdf`, SHA-256, `pdfRef` |
| **B · PDF existente anexado** (novo) | **Anexar prontuário existente** → escolhe o PDF | o **mesmo lugar**, com os **bytes originais** |

O anexo **não se passa** pelo documento gerado: sem OCR, sem extração de campos, sem
conversão, sem rasterizar, sem remontar. Os bytes que o usuário enviou são o documento, e é
com eles que ele volta a ser aberto. `origem: 'anexado'` no registro, selo `PDF ANEXADO` na
tela.

### Por que reaproveitou a emissão em vez de criar uma família nova

`nr13_pront_emitido_<TAG>` já é uma LISTA append-only de documentos por equipamento, cada um
com `pdfRef`, `sha256`, tamanho e data (Fase 12A); `nr13_pront_indice` já é a lista canônica
de `/prontuarios`. Uma segunda família criaria um segundo catálogo, duas listas para
conciliar e duas regras de imutabilidade. **Nenhuma tabela nova, nenhuma chave nova.**

### Arquivos

| arquivo | papel |
|---|---|
| `features/prontuarios/anexoProntuario.ts` | a REGRA: validar → publicar → registrar → indexar |
| `features/prontuarios/ModalAnexarProntuario.tsx` | o MESMO modal nos dois pontos de entrada |
| `features/prontuarios/ProntuarioDoEquipamento.tsx` | a seção "Prontuário NR-13" na ficha |
| `features/prontuarios/abrirArquivo.ts` | reserva a aba no clique (ver §5) |
| `features/prontuarios/emissaoProntuario.ts` | `origem`, `ehAnexado`, `emissaoAtual`, `revisaoDe`, `confirmarEnvios` |
| `features/prontuarios/indiceProntuarios.ts` | `origem`/`arquivoNome` na linha, revisão nula no anexo |
| `supabase/busca_manutencao.sql` + `supabase/prontuario_anexado_badge.sql` | o badge do catálogo (§6) |

---

## 2 · Cenário A — pela FICHA do equipamento (ZZ-PRONT-01)

O equipamento já está definido: o modal mostra a TAG em modo leitura e **não** pergunta o
equipamento (`temCatalogo: 0`).

```
modal            → equipamento "ZZ-PRONT-01", botão Anexar DESABILITADO sem arquivo
arquivo escolhido→ "anexo-A.pdf 1 KB", botão habilitado
envio            → modal fecha; a ficha lista o documento
```

| conferido | resultado |
|---|---|
| SHA-256 do arquivo em disco | `527c916a06ec8aa9ea7e84cbea3fad4181f195ff2b4565fba7187a1d10a80d0e` |
| SHA-256 gravado no registro | **idêntico** |
| bytes | 1467 enviados, 1467 gravados |
| `origem` / `revisao` | `anexado` / `null` |
| `enviadoPor` | `lab@local.test` |
| `pdfPendente` | `false` (ACK do servidor, não `navigator.onLine`) |
| linha em `/prontuarios` | **mesmo id** do registro da ficha (`PRONT-…-anexo1`) |

Um registro, um arquivo, duas visões.

## 3 · Cenário B — pela LISTA de `/prontuarios` (ZZ-PRONT-02)

Primeiro passo é ESCOLHER o equipamento, e a busca é do SERVIDOR: as requisições observadas
no momento da digitação foram `buscar_equipamentos` e `contar_equipamentos` — **nenhum
`lerTudo`, nenhuma varredura do cache**.

```
busca "ZZ-PRONT-02" → 1 resultado (projeção)
escolhe             → "ZZ-PRONT-02 · CLIENTE ZZ PRONT LTDA"
anexa anexo-B.pdf   → aparece na LISTA e na FICHA do equipamento
```

SHA `c7453229052e9427b16d0d560f0ae8f08b0a44a48a86bfcec2cadda7e28208b9`, igual ao do arquivo
em disco.

## 4 · Convivência: o anexo NÃO substitui o documento do sistema

Com dois PDFs já anexados em `ZZ-PRONT-01`, o prontuário do sistema foi emitido pelo fluxo
normal (rascunho → prévia → Salvar Definitivamente → **Emitir**):

```
anexo-A.pdf        origem=anexado  rev=0  sha=527c916a06
anexo-offline.pdf  origem=anexado  rev=0  sha=2c94c9a84e
REL-1789876197044  origem=sistema  rev=1  sha=5283ad364b  3 páginas
```

- `emissaoAtual()` devolve **o documento do sistema**, não o anexo;
- a numeração de revisão **ignora** o anexo: o documento gerado é a **Rev. 01**, e não a 03;
- os dois anexos seguem com os SHAs originais — emitir não apagou nem alterou nada;
- a ficha mostra os três, cada um com o seu selo (`PDF ANEXADO` / `EMITIDO`).

## 5 · Abrir o documento

Abrir serve os **bytes arquivados** (`bytesDaEmissao`), nunca uma remontagem. Medido na
ficha e na lista: aba `blob:` com `application/pdf`, 1467 bytes, primeiros bytes `%PDF-`,
SHA do que foi servido **igual** ao registrado.

**Defeito corrigido no caminho:** `window.open` acontecia DEPOIS do `await` da busca dos
bytes. Num aparelho que já tem o arquivo no cofre isso passa (milissegundos); num aparelho
novo o arquivo vem do bucket e a aba é barrada como popup — **em silêncio**. Agora a aba é
RESERVADA na mesma pilha do clique (`abrirArquivo.ts`), recebe o blob quando ele chega, e
se o bloqueador recusar até a reserva o arquivo é BAIXADO por âncora. O clique nunca fica
inerte. Também na lista: a emissão mora na chave da TAG, que num aparelho novo não está
hidratada — antes o clique retornava sem fazer nada; agora semeia a TAG e, se ainda assim
não achar, **diz** o que houve.

## 6 · Badge do catálogo (projeção)

`equipamentos_index.tem_prontuario` olhava só `nr13_prontuario_<TAG>` (os DADOS do documento
que o sistema monta). O anexo não cria essa chave — de propósito —, então o catálogo escrevia
**"Sem Prontuário"** sobre um equipamento cuja lista de `/prontuarios` mostra um documento.

Corrigido em `supabase/busca_manutencao.sql` (a projeção passa a aceitar as duas chaves) +
`supabase/prontuario_anexado_badge.sql` (backfill dirigido). **Aplicado só no laboratório:**

```
UPDATE 2
 linhas | com_prontuario | nao_projetadas | divergentes
      7 |              2 |              0 |           0
```

Depois: `ZZ-PRONT-01` e `ZZ-PRONT-02` = "Prontuário OK".

## 7 · Navegador novo (o servidor é a verdade)

Perfil vazio, login de novo, cache zerado:

- `/prontuarios` lista os **dois** documentos anexados (o índice veio do servidor no boot
  leve — `nr13_pront_indice` entrou em `essencial.ts`/`familiasChave.ts`);
- `emissoesNoCacheAntesDeAbrirAFicha: 0` — a chave pesada da TAG **não** está no boot leve,
  e é semeada quando o equipamento é aberto, como manda a 9D;
- a ficha do equipamento mostra o anexo; a busca dos bytes resolveu em **106 ms** vindo do
  bucket.

## 8 · Segurança — organização B

Com a sessão de `lab2-outra-org@local.test` comprovada no mesmo bloco das consultas:

| tentativa | resultado |
|---|---|
| `app_storage` com as chaves da org A (`nr13_pront_indice`, `nr13_pront_emitido_ZZ-PRONT-01`, `nr13_info_…`) | **0 linhas** |
| baixar o PDF pelo path exato | **falha** — "Object not found" |
| listar `…/relatorios` da org A | **0 itens** |
| remover o arquivo | **não removeu** |
| `buscar_equipamentos('ZZ-PRONT')` | **0 equipamentos** |

Os arquivos seguem íntegros no bucket depois da tentativa (1467 e 1193 bytes).

## 9 · Offline

Rede derrubada com a tela já aberta (é o caso real):

```
anexo gravado          → pdfPendente: true, fila com 2 itens
ficha                  → "anexo-offline.pdf · PDF anexado · 903 B · aguardando sincronização"
rede volta             → fila drena para 0
reabrir a ficha        → o aviso SOME sozinho (registro e índice em false)
```

O aviso sair é tão importante quanto aparecer: `pdfPendente` é o retrato do momento da
gravação, e um aviso que não some deixa de ser aviso. `confirmarEnvios` relê a FILA
(`arquivoPendente`, nunca `navigator.onLine`) e regrava só o que mudou — sem tocar em
`pdfRef` nem em `sha256`.

## 10 · Erros (nada é gravado pela metade)

| caso | mensagem | estado depois |
|---|---|---|
| `.docx` renomeado para `.pdf` | "Este arquivo não é um PDF válido (o conteúdo não tem a assinatura de PDF)." | nada gravado, nada enviado |
| PDF de 0 bytes | "O arquivo está vazio." | nada gravado |
| `.jpg` / MIME de imagem | "O arquivo precisa ser um PDF." | nada gravado |
| acima de 8 MB | recusa com o tamanho e o limite | nada gravado |
| sem equipamento | "Escolha o equipamento antes de anexar o prontuário." | nada gravado |
| duplo clique / mesmo arquivo de novo | — | **um** registro (dedupe por SHA-256) |

## 11 · Mobile (390 px)

Ficha, modal da ficha, lista e modal da lista: **nenhuma rolagem lateral**
(`scrollWidth == innerWidth == 390`).

Corrigido no caminho: no celular o catálogo comia a tela e o botão **Selecionar PDF** ficava
escondido atrás do rodapé do modal (`max-height` do catálogo: 46vh → 34vh). O botão de abrir
na linha da ficha subiu para 44×44 px de área de toque.

---

## 12 · O que NÃO foi feito (e por quê)

- **OCR, extração de dados, conversão para o modelo interno:** proibido pelo pedido e pelo
  desenho — o anexo é documento de outro emitente.
- **Exclusão do anexo:** não foi criada. A pasta `relatorios/` perdeu UPDATE e DELETE na
  migration de 19/09/2026 (documento final é imutável), e a lista de emissões é append-only.
  Excluir exigiria enfraquecer as duas coisas — fica como decisão sua, não como efeito
  colateral desta entrega.
- **Portal do Cliente:** `nr13_pront_emitido_` está em `FORA_DO_PORTAL`; prontuário não é
  exposto ao cliente hoje, e o anexo seguiu a mesma regra. Nada foi ampliado.
- **Quantidade por equipamento:** SEM limite e sem sobrescrita — cada anexo é um documento
  novo na lista. Dois PDFs iguais (mesmo SHA) viram um só.

## 13 · Limitações e observações do laboratório

1. **Arquivo órfão.** Se o processo morrer entre o upload e a gravação do registro, o bucket
   fica com um PDF que nenhuma chave cita. Ele é inofensivo (ninguém o lista, o Portal só
   autoriza path citado em chave do cliente) e foi observado no laboratório ao limpar
   registros de teste direto no banco: 3 arquivos de 1467 bytes seguem lá.
2. **Ficha offline.** Com o servidor fora do ar ANTES de abrir a tela, `/equipamento/:tag`
   fica em "Carregando…" — comportamento pré-existente do gate de sessão, não deste recurso.
3. **Clique do Playwright em perfil recém-criado.** Num perfil novo o CDP não entregou
   nenhum evento de mouse à página (nem `pointerdown`); o mesmo clique via DOM e o mesmo
   clique num perfil já usado funcionam. Artefato do harness, não do app.
4. **`usuarioLogado()` e magic link.** O campo "enviado por" sai do `localStorage` gravado
   no LOGIN por formulário; entrada por magic link não o grava. O E2E usou login por senha,
   e o campo veio preenchido.

## 14 · Verificação

```
npx vitest run   → 242 arquivos, 3646 testes, 0 falhas
npm run build    → ok
lint (vs 5f89f06)→ nenhuma regressão; os 6 arquivos novos em 0 erros / 0 avisos
```

Testes novos: `__tests__/anexoProntuario.test.ts` (18) e `__tests__/abrirArquivo.test.ts` (4).

---

## 15 · Rollout para produção (20/09/2026)

Projeto de produção `qqsesrntfvmdxqxrfvmw`. Ordem executada: **push → SQL → deploy**. O SQL
foi antes do front de propósito: ele é inofensivo sem a tela nova (só passa a aceitar uma
segunda chave), e o contrário abriria uma janela em que alguém anexa um PDF e o catálogo
escreve "Sem Prontuário".

### 15.1 · Push

`5f89f06..fd06b87  main -> main` — 4 commits (feature, testes, SQL, documentação).

### 15.2 · SQL, conferido por HASH antes de rodar (§13)

O texto foi carregado no editor a partir do **raw do commit** (`raw.githubusercontent.com/
…/fd06b87/…`), com `setEOL(LF)`, e o SHA-256 **do que estava no editor** foi comparado com o
do arquivo do commit. Só então rodou.

| arquivo | bytes | SHA-256 no editor | confere |
|---|---|---|---|
| `supabase/busca_manutencao.sql` | 44.088 | `1ce03338…dc62479d` | **sim** |
| `supabase/prontuario_anexado_badge.sql` | 4.398 | `7c142b64…9149dba4` | **sim** |

O dashboard pediu confirmação no primeiro ("destructive operations" — o arquivo tem
`drop function if exists` e `revoke`), confirmada.

**Verificação por ESTRUTURA, não pela mensagem "Success":**

```
proname                   le_emissao le_dados  acl
projetar_equipamento      true       true      postgres=X, service_role=X
projetar_calibracoes      false      false     postgres=X, service_role=X
projetar_relatorios       false      false     postgres=X, service_role=X
reconstruir_indice_busca  false      false     postgres=X, service_role=X
auditar_projecao          false      false     postgres=X, service_role=X
reparar_divergencias      false      false     postgres=X, service_role=X
```

Só `projetar_equipamento` mudou, e passou a olhar as DUAS chaves. `anon`/`authenticated`
seguem sem EXECUTE.

**Backfill:** `linhas 95 · com_prontuario 10 · nao_projetadas 11 · divergentes 0`.

### 15.3 · Sentinelas — nenhum dado tocado

| | antes | depois |
|---|---|---|
| `app_storage` | 1.372 | **1.372** |
| `equipamentos_index` | 95 | **95** |
| com prontuário | 10 | **10** |
| não projetadas (`null`) | 11 | **11** |
| chaves `nr13_pront_emitido_` | 1 | **1** |

O único equipamento com documento de prontuário em produção já tinha `nr13_prontuario_`, então
o badge dele já era `true` e o backfill não precisou mudar nada — o `UPDATE 0` esperado.

### 15.4 · Deploy

Coolify → **Redeploy** na aplicação "NOVO - APP - NR13"; build acompanhado até o fim.
Bundle servido em `https://app.nr13sistema.com.br/`: **`index-xJSSRUKk.js` → `index-C3LnP57q.js`**
(3.667.417 bytes).

Conferido pelo CONTEÚDO (string literal sobrevive à minificação; identificador não):

```
Anexar prontuário existente        2   nr13_pront_indice                    2
PDF ANEXADO                        2   O PDF é guardado como está           1
Este arquivo não é um PDF válido   1   Prontuário NR-13                     1
aguardando sincronização           1   não substitui                        3
Abrindo o documento                2   O arquivo está vazio                 2
Documentos deste equipamento       1   Escolha o equipamento antes…         1
```

12 de 12 marcadores presentes.

### 15.5 · O que NÃO foi feito em produção

Nenhum anexo foi criado lá: não havia autorização para gravar dado de teste nesta subida, e a
sessão aberta no navegador é a da organização real do dono. Os dois fluxos seguem provados no
laboratório (§2 e §3); em produção a prova é estrutural (§15.2/§15.3) e do bundle (§15.4).
