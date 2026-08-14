# Armazenamento e limites — mapa do que já foi feito e do que falta

Última varredura: **11/08/2026**, contra os dados reais das contas em produção.
Fonte estrutural: `CLAUDE.md` §2-ter e §2-bis. Lista viva de tarefas: `PENDENCIAS.md`.

---

## 1. Os quatro limites, e qual é qual

Confundir um com o outro é a origem de quase toda discussão errada sobre este assunto.

| # | Limite | Valor | Quem impõe | O que acontece ao estourar |
|---|---|---|---|---|
| 1 | `localStorage` da origem | **~5 MB** | Chrome, não configurável | `QuotaExceededError` na escrita |
| 2 | Palco de UM documento | **3.368 KB** | nosso, dentro do 1 | documento recusado com a lista de chaves |
| 3 | Egress do Supabase | **5 GB/mês** (Free) | plano | HTTP 402, projeto fora do ar |
| 4 | IndexedDB do aparelho | centenas de MB | navegador | na prática, nunca |

**O dado do sistema não vive no 1 nem no 2.** Vive no Supabase e no IndexedDB (4). O
`localStorage` é só o *palco*: a cópia temporária que os 40+ templates HTML em `<iframe>`
conseguem ler de forma síncrona no `DOMContentLoaded`. Ele é montado ao abrir um documento e
apagado ao fechar.

O limite 2 existe porque os templates não sabem ler IndexedDB, e reescrever os 40+ arquivos é
justamente o que o palco existe para evitar.

---

## 2. Estado por família de chave

Peso medido na conta `gabriel.dadona` (org `92a28bff…`), 11/08/2026.

**Resultado da migração de 11/08/2026 na conta `gabriel.dadona`: `app_storage` foi de 6.542 KB
para 120 KB — queda de 98%.** Todo arquivo passou para o bucket; o que restou é logo da
empresa e imagens de assinatura, 6 a 14 KB cada.

| Chave | Antes | Depois | Onde o arquivo mora | No palco? | Situação |
|---|---|---|---|---|---|
| `nr13_rastreab_<id>` | 2725 + 970 KB | ~0 | **bucket** | não (escopo id) | ✅ código + legado migrado |
| `nr13_componentes_cal_<TAG>` | 1259 KB | **2 KB** | **bucket** | **não** (desde 11/08) | ✅ código + legado migrado |
| `nr13_docs_<TAG>` | 751 KB | ~6 KB | **bucket** | não | ✅ migrado |
| `nr13_inspecao_atual` / `injecao_atual` | 640 KB | ~0 | **bucket** | **sim** | ✅ migrado — mas ver 3.1 |
| `nr13_fotos_<TAG>` | 92 KB | ~1 KB | **bucket** | sim | ✅ migrado |
| `nr13_pront_fab_<TAG>` | (vazio nesta conta) | — | **bucket** | não | ✅ código pronto, falta deploy |
| `nr13_historico_relatorios` | 224 KB e subindo | **congelado** | LEGADO, só leitura | não | ✅ substituído em 14/08 (ver 4) |
| `nr13_rel_<id>_<TAG>` | — | ~110 KB × N | snapshots congelados (§7-bis) | **não** | ✅ 1 chave por relatório |
| `nr13_historico_indice_<TAG>` | — | ~0,6 KB por relatório | só metadados | **não** | ✅ é o que a tela lê |
| `nr13_minha_empresa` | 6 KB | 6 KB | logo em base64 | sim | 🔸 aceitável |
| `nr13_lista_phs` | 8 KB | 8 KB | assinaturas em base64 | sim | 🔸 aceitável |

> **ORDEM OBRIGATÓRIA: deploy ANTES da migração.** O registro migrado troca o base64 por uma
> referência; um bundle que ainda não sabe ler `ref`/`pdfRef`/`fotoRef` mostra o campo VAZIO —
> foto sumida, certificado "sem arquivo". Foi o que quase aconteceu com o Portal do Cliente em
> 11/08 (ver 3.6).

---

## 3. O que falta implementar — em ordem de risco

### 3.1 A degradação do palco só enxergava `nr13_fotos_` — ✅ RESOLVIDO 11/08/2026

> **Corrigido:** `CHAVES_DEGRADAVEIS` (palco.ts) passou a incluir `nr13_inspecao_atual` e
> `nr13_injecao_atual`, e `recompressorFoto.ts` virou um caminhador RECURSIVO sobre
> `src`/`base64` — antes só entendia o array plano de `{src}` do `nr13_fotos_`.
> `maiorFotoDoValor` também é recursivo e conta a mesma imagem repetida em `src` e `base64`
> UMA vez (contá-la em dobro faria a degradação achar que existe foto do dobro do tamanho e
> degradar além do necessário). A recompressão memoiza por dataURL: um canvas por imagem
> por passo, não um por ocorrência.
>
> Falta o deploy. O texto abaixo fica como registro do diagnóstico.

> **MEDIDO DEPOIS DA MIGRAÇÃO, em produção, 11/08/2026:** o palco do relatório da AUTOCLAVE
> ESTERILAV foi de **1.449 KB para 2.780 KB** contra o limite de 3.368 — **83% do orçamento**,
> sem que uma única foto nova tivesse sido tirada.
>
> A causa é `hidratarFotosDoBucket`, que grava a imagem em **`src` E `base64`**, duplicando
> cada foto no palco. Isso é obrigatório e não deve ser "otimizado": `CAPA.html` lê `.src`, as
> folhas de fotos leem `.base64`, e uma foto nova chega só com `ref`, sem nenhum dos dois
> declarado — não há como saber qual campo aquele template vai consultar, e preencher um só
> deixa folha em branco. Tentar cortar isso quebra `palco.fotos.test.ts`, que existe
> exatamente para impedir a tentação.
>
> Ou seja: migrar para o bucket **alivia o banco e o egress, mas APERTA o palco**. Com 17% de
> folga, a próxima inspeção com mais fotos volta a ser recusada — e agora a degradação é a
> única saída possível.

**O problema.** `degradarAteCaber` (`palco.ts`) só recomprime chave que passa em
`ehChaveDeFoto()`, que é `startsWith('nr13_fotos_')`. As fotos de campo chegam ao palco por
`nr13_inspecao_atual` e `nr13_injecao_atual` — 640 KB **cada**, e a duplicação é obrigatória
(§2 do CLAUDE.md: os templates nunca foram uniformes). **Elas nunca degradam.**

Ou seja: quando o documento não cabe, o sistema recomprime 184 KB de fotos de capa e não toca
nos 1280 KB de fotos de inspeção. Hoje sobra espaço na conta do gabriel (1449 KB medidos), mas
é o teto que volta a apertar conforme a inspeção cresce — e nesse dia a degradação não terá o
que fazer.

**O que falta.** `recompressorFoto.ts` hoje só entende um array plano de `{src}`, que é a forma
do `nr13_fotos_`. Precisa virar um caminhador recursivo sobre `src`/`base64` — exatamente o que
`hidratarFotosDoBucket` (palco.ts) e `migrarNo` (script de migração) já fazem —, e
`ehChaveDeFoto` precisa incluir as duas chaves de dados de campo. Cerca de 30 linhas mais
testes.

**Atenção ao migrar as fotos para o bucket antes disso:** depois da migração, o container passa
a guardar `ref` em vez de base64, mas `hidratarFotosDoBucket` **re-infla** a imagem no palco na
hora de montar o documento (os templates exigem `src` embutido). O peso volta na montagem. A
migração alivia o banco e o egress; **não** alivia o palco.

### 3.6 Toda tela que desenha arquivo precisa passar por `FotoImg`/`resolver*`

Descoberto em 11/08/2026, durante a migração: o **Portal do Cliente** renderizava
`<img src={capa.src}>` direto. Como `src` fica vazio quando a foto vai para o bucket, o portal
das contas migradas ficaria **sem foto nenhuma** — e ninguém perceberia, porque quem olha o
portal é o cliente final, não quem opera o sistema.

Corrigido no mesmo dia (`FotoImg` no portal, na capa e nos componentes). A regra que fica:
**nenhuma tela lê `.src`, `.foto`, `.pdfBase64` direto.** Use `FotoImg`, `fotoDoComponente`,
`resolverPdf` ou `resolverPdfFabricante`. Uma varredura por `src={` em telas novas é barata e
pega esse erro antes do usuário.

### 3.2 `nr13_pront_fab_` — até 8 MB de PDF por equipamento no banco (✅ CÓDIGO PRONTO)

**O problema.** `ProntuarioFabricante.tsx` grava o PDF do prontuário do fabricante inteiro em
base64 dentro do `app_storage`, com `LIMITE_PDF_BYTES = 8 * 1024 * 1024`. É o maior peso
possível por chave em todo o sistema, e ele é rebaixado a cada hidratação do app. Uma conta com
5 equipamentos documentados pode sozinha consumir 40 MB por sincronização.

Já está fora do palco (desde 05/08, quando 10.012 KB numa conta faziam o livro de registro ser
recusado sem motivo), então **não derruba documento** — mas alimenta direto o egress da
cota 3.

**Feito em 11/08/2026:** `pdfRef` no registro, upload por `salvarArquivo`, e
`resolverPdfFabricante`/`baixarPdfFabricante` para os consumidores. O `<a download>` virou
botão (não existe href pronto para um arquivo no bucket) — o gate do trial continua idêntico.
`lerProntuarioFabricante` passou a aceitar as duas formas: exigir `pdfBase64` faria um registro
migrado aparecer como "nenhum prontuário enviado" e o usuário reenviaria o arquivo por cima.

**Falta:** deploy, e verificar no Portal do Cliente que o papel `cliente` consegue URL assinada
sob a policy `inspecao_leitura` (ela compara a pasta com `org_atual()`).

### 3.3 `nr13_componentes_cal_` — 1259 KB de foto que ninguém imprime (✅ CÓDIGO PRONTO)

Saiu do palco em 11/08 (era o que recusava o relatório do gabriel). O código para guardar no
bucket ficou pronto no mesmo dia: `ComponenteCal.fotoRef`, upload dentro de `salvarComponente`,
e `fotoDoComponente(c)` entregando ref-ou-base64 para o `<FotoImg>` nas três telas que desenham
essa miniatura (duas em Calibrações, uma no Portal).

**Falta:** deploy e a migração do legado. A migração só pode rodar DEPOIS do deploy — o bundle
antigo lê `c.foto` e mostraria os cards sem imagem.

### 3.4 Migração do legado das contas pesadas

Ferramenta pronta e validada: `scripts/migrar-fotos-legadas.mjs`. Modos:

```
simular                → mede sem gravar nada (não sobe arquivo, não chama a RPC)
migrar "TAG"           → uma TAG de nr13_fotos_
migrar-todas           → nr13_fotos_ inteiro
migrar-docs            → nr13_docs_ (containers de inspeção)
simular-certificados   → mede os PDFs de nr13_rastreab_
migrar-certificados    → PDFs de nr13_rastreab_ → bucket + pdfRef
```

**Bloqueio permanente:** o script entra na conta (`signInWithPassword`) porque a RLS do
`app_storage` é por organização e não existe caminho de admin. Precisa da senha de cada conta.

Contas pendentes: `gabriel.dadona@gmail.com` (~6,7 MB) e `engyuricesar@gmail.com` (~6,5 MB).
Roteiro que funcionou no `cmam` (8,00 → 3,06 MB): backup → `simular` → migrar UMA TAG →
conferir na tela → resto → gerar um relatório e comparar o número de imagens com o de antes.

### 3.5 Sem teto por conta, e sem aviso antes de doer

Não existe hoje nenhum ponto que diga ao usuário "sua conta está pesada". O sistema só reage
quando o documento é recusado — que é tarde, e no meio do trabalho. Duas ideias baratas:

- `quotaDispositivo.ts` já existe: usar para um selo na topbar quando o aparelho passar de X%;
- um alerta no painel Admin quando uma organização passar de N MB em `app_storage`, com o
  levantamento que já está no `PENDENCIAS.md` virando consulta agendada em vez de manual.

---

## 4. O que já foi resolvido

| Quando | O quê |
|---|---|
| 05/08/2026 | **Armazenamento v2**: `Map` + IndexedDB por organização, RPC transacional, fila, tombstones. Nada é apagado localmente por não ter voltado do servidor. |
| 05/08/2026 | **Palco**: `localStorage` deixa de ser banco e vira cópia temporária de UM documento, com dono por aba, orçamento e materialização tudo-ou-nada. |
| 05/08/2026 | `nr13_docs_` e `nr13_pront_fab_` fora do palco (o segundo ocupava 10.012 KB numa conta). |
| 10/08/2026 | v2 ligada nas 27 organizações; hidratação incremental. |
| 11/08/2026 | **Fotos no bucket** (`fotos.ts` + bucket `inspecao` + policies), com cofre local, fila de reenvio e compatibilidade total com o base64 legado. |
| 11/08/2026 | `nr13_componentes_cal_` e `nr13_lotes_cal_` fora do palco — o relatório da AUTOCLAVE ESTERILAV caiu de **3959 KB para 1449 KB**. |
| 11/08/2026 | **Organização nova nasce em v2** (`flag.ts` + `supabase/v2_por_default.sql`). Antes, toda conta criada depois de 10/08 nascia em v1. |
| 11/08/2026 | **PDF de rastreabilidade no bucket**: `pdfRef` no registro, upload pela mesma fila offline das fotos, `resolverPdf` com cadeia de socorro (ref → cofre → IndexedDB → Supabase legado). |
| 11/08/2026 | **Foto do componente de calibração** (`fotoRef`) e **prontuário do fabricante** (`pdfRef`) no bucket, pelo mesmo desenho. |
| 11/08/2026 | **Portal do Cliente passou a resolver refs** — lia `capa.src`/`c.foto` direto e teria ficado sem foto nenhuma nas contas migradas. |
| 14/08/2026 | **`pdfBase64` fora do palco** (`camposPesados.ts`): a poda do §2-bis vivia só no `storageV1`, e na v2 o `Map` guarda o valor cru do servidor — dois certificados legados da conta `engyuricesar` ocupavam 794 + 614 KB de um orçamento de 3.368 KB e recusavam o relatório inteiro. Documento de **3.969 → 2.561 KB**. |
| 14/08/2026 | **Histórico de relatórios: 1 registro por relatório + índice leve por TAG** (`historicoRelatorios.ts`). O array único carregava logo e rubricas em base64 e era reescrito por inteiro a cada emissão. Com 100 relatórios: reescrita por save de **10,8 MB → 170 KB**; leitura para listar de **10,8 MB → 60 KB**. O legado fica como fallback de leitura, sem ser apagado. |
| 11/08/2026 | **Legado da conta `gabriel.dadona` migrado** pelo navegador, com a sessão do próprio usuário: `app_storage` de **6.542 → 1.377 KB (−79%)**. Fotos, containers de inspeção e os 2 certificados (3.695 KB) confirmados no bucket com assinatura `%PDF-`. |

---

## 5. Regras que não se quebram

1. **Só vai para o palco o que algum template de `public/` realmente lê.** Confira por
   varredura antes de somar uma família de chave. Já saíram por isso: `nr13_docs_`,
   `nr13_pront_fab_`, `nr13_componentes_cal_`, `nr13_lotes_cal_`.
2. **Nada é apagado localmente por não ter voltado do servidor.** Era o apagar-por-ausência que
   transformava falha de rede em sumiço de dado.
3. **O arquivo vai para o bucket antes de o registro perder o base64.** O script confirma
   tamanho no download antes de reescrever; falha em qualquer passo deixa o registro intacto.
4. **Legado nunca é quebrado.** Base64 antigo continua sendo lido e exibido; a migração é
   opcional e idempotente.
5. **Errar para o lado da v2.** A RPC de escrita nunca consulta `v2_ativa`; ficar na v1 contra
   um servidor em v2 é que custou uma semana no `cmam`.
6. **Deploy ANTES da migração, sempre.** O registro migrado troca o arquivo por uma referência;
   bundle que não sabe lê-la mostra campo vazio, e o usuário conclui que o dado sumiu.
7. **Nenhuma tela lê `.src`/`.foto`/`.pdfBase64` direto.** `FotoImg`, `fotoDoComponente`,
   `resolverPdf`, `resolverPdfFabricante` — foi assim que o Portal do Cliente escapou de ficar
   sem foto (3.6).
8. **Falha de upload nunca cancela a gravação.** Todo caminho novo cai no formato legado
   (base64 no registro) quando o bucket não responde. Pesado, porém salvo: perder o arquivo do
   usuário é o único desfecho inaceitável.
