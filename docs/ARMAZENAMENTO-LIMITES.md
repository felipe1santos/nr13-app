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

| Chave | Peso lá | Onde o arquivo mora hoje | No palco? | Situação |
|---|---|---|---|---|
| `nr13_rastreab_<id>` | 5451 + 1941 KB | **bucket** (novo) / base64 (legado) | não (escopo id) | ✅ resolvido no código; falta migrar o legado |
| `nr13_componentes_cal_<TAG>` | 2518 KB | base64 no `app_storage` | **não** (desde 11/08) | ⚠️ fora do palco, mas ainda pesa no banco |
| `nr13_pront_fab_<TAG>` | — | base64, **até 8 MB por equipamento** | não | ❌ **maior risco aberto** |
| `nr13_docs_<TAG>` | 863 + 640 KB | base64 → bucket pelo script | não | 🔸 migrável hoje |
| `nr13_inspecao_atual` / `nr13_injecao_atual` | 640 KB × 2 | cópia do container | **sim** | ⚠️ não degrada (ver 3.1) |
| `nr13_fotos_<TAG>` | 184 KB | base64 → bucket | sim | ✅ degrada; migrável |
| `nr13_minha_empresa` | ~60 KB | logo em base64 | sim | 🔸 aceitável |
| `nr13_lista_phs` | 15 KB | assinaturas em base64 | sim | 🔸 aceitável |

---

## 3. O que falta implementar — em ordem de risco

### 3.1 A degradação do palco só enxerga `nr13_fotos_`

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

### 3.2 `nr13_pront_fab_` — até 8 MB de PDF por equipamento no banco

**O problema.** `ProntuarioFabricante.tsx` grava o PDF do prontuário do fabricante inteiro em
base64 dentro do `app_storage`, com `LIMITE_PDF_BYTES = 8 * 1024 * 1024`. É o maior peso
possível por chave em todo o sistema, e ele é rebaixado a cada hidratação do app. Uma conta com
5 equipamentos documentados pode sozinha consumir 40 MB por sincronização.

Já está fora do palco (desde 05/08, quando 10.012 KB numa conta faziam o livro de registro ser
recusado sem motivo), então **não derruba documento** — mas alimenta direto o egress da
cota 3.

**O que falta.** O mesmo desenho do certificado de rastreabilidade: `salvarArquivo` no bucket +
`ref` leve no registro. Duas diferenças exigem cuidado:

1. O consumo é por `<a download>` e `window.open` de object URL, não por template — então a
   troca é contida.
2. A Edge Function `portal_cliente` entrega ao Portal do Cliente as chaves que terminam em
   `_<TAG>`. Com o PDF fora do registro, o Portal precisa da URL assinada do bucket, e a policy
   `inspecao_leitura` compara a pasta com `org_atual()` — **o papel `cliente` precisa ser
   verificado** antes de assumir que a leitura funciona por lá.

### 3.3 `nr13_componentes_cal_` — 2518 KB de foto que ninguém imprime

Saiu do palco em 11/08 (era o que recusava o relatório do gabriel), mas continua em base64 no
banco e no egress. Migrar exige mexer nos **dois lados**, e por isso não foi feito junto:

- o script varre `src`/`base64`; aqui o campo se chama `foto` (`ComponenteCal.foto`);
- `hidratarFotosDoBucket` devolve a imagem escrevendo em `src`/`base64`, e a tela de
  Calibrações lê `c.foto` de forma **síncrona** — migrar sem adaptar a tela deixa os cards de
  componente sem imagem.

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
