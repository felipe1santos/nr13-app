# Armazenamento offline-first — cache em memória + IndexedDB + palco

**Data:** 04/08/2026
**Status:** design aprovado, aguardando revisão do documento
**Origem:** investigação do sumiço de equipamentos na conta `cmam.caldeiras@gmail.com`

---

## 1. O problema (medido em produção)

Consulta rodada no Supabase (`SAAS NR13`, projeto `qqsesrntfvmdxqxrfvmw`) em 04/08/2026:

| Métrica | Valor |
|---|---|
| Equipamentos no servidor (`nr13_info_%`) | **38** |
| Chaves da org | 340 |
| Peso real no `localStorage` (já sem os PDFs que vão pro IndexedDB) | **5.692 KB** |
| Cota do `localStorage` | ~5.000 KB |
| Equipamentos que conseguem entrar no cache | **0** |
| Chave onde a cota estoura | `nr13_fotos_ACA 2040` |

**Nada foi perdido no banco.** O que quebrou foi a exibição.

### Mecanismo

1. `listarEquipamentos()` (`equipamentoService.ts:13`) monta a lista lendo **só o `localStorage`**.
2. `lerTudo()` (`storage.ts:355-368`) baixa as chaves **ordenadas por nome** (`.order('chave')`).
3. `storage.ts:389-399` grava chave por chave com **`catch` vazio**: a que não couber é pulada em silêncio.
4. Alfabeticamente `nr13_fotos_` vem **logo antes** de `nr13_info_`. As fotos consomem os 5 MB e a cota estoura **antes do primeiro equipamento**.
5. Os 10 que o usuário ainda vê são restos gravados localmente na criação. Em aparelho novo ou após limpar o navegador: **zero**.

### Contas já afetadas

| Conta | Peso local | Equip. |
|---|---|---|
| teste@gmail.com | 14.046 KB | 12 |
| cmam.caldeiras@gmail.com | 8.103 KB | 38 |
| gabriel.dadona@gmail.com | 6.770 KB | 3 |
| liperoneads@gmail.com | 5.064 KB | 2 |

Toda conta em uso real chega lá. O projeto Supabase também já está em *exceeding usage limits* — consequência do base64 de foto dentro das linhas.

### Defeitos secundários encontrados na mesma auditoria

- **D1** — `storage.ts:419`: com assinatura suspensa ou papel `cliente`, `salvar()` grava no cache local e **retorna antes de enfileirar**. A tela mostra "salvo"; 60s depois o reconcile apaga a chave. **Perda definitiva e silenciosa.**
- **D2** — `storage.ts:412-418`: cota estourada no `salvar()` é engolida; o dado vai ao Supabase e o equipamento **nasce invisível**.
- **D3** — `storage.ts:401`: `setItem('nr13_cache_owner')` também estoura, cai no catch da linha 404, `ultimaHidratacao` nunca é marcada → **re-download do banco inteiro a cada navegação**.
- **D4** — `useAutosaveFormulario.ts:28`: `.catch(() => {})`. Inspeção de campo falha **calada** no celular.
- **D5** — `sb-storage.js:70`: upsert **sem `org_id`** → sempre recusado pela RLS por org; só sobrevive porque cai na fila.
- **D6** — `salvarDadosFormulario` reescreve `nr13_docs_<TAG>` **inteiro** (todos os containers, todas as fotos) a cada 1s de digitação.
- **D7** — `excluirVaso` casa chaves por sufixo `_<TAG>`, frágil para TAG que é sufixo de outra.

### Descartado (verificado, não é causa)

Linhas com `org_id` nulo (zero no banco), exclusão em massa por RLS/Edge Function, e o D7 como causa deste caso.

---

## 2. Causa raiz

O `localStorage`, com 5 MB para a origem inteira, está sendo usado como **banco primário** de uma aplicação cujos dados reais passam de 8 MB por conta. Não é um bug pontual: é o limite da arquitetura.

A trava que impede simplesmente trocar de camada: **40+ templates HTML em iframe leem e escrevem `localStorage` de forma síncrona** (`public/arquivos-inspecao/*.html`, `public/arquivos-prontuario/*.html`, `public/sb-storage.js`). Qualquer solução que exija reescrevê-los é cara e arriscada.

---

## 3. Arquitetura

### 3.1 Quatro camadas com dono único

| Camada | Guarda | Teto | Quem lê |
|---|---|---|---|
| Supabase `app_storage` | JSON estruturado, **sem base64** | — | verdade final dos dados |
| Supabase Storage, bucket `inspecao` | fotos como arquivo binário | — | verdade das imagens |
| IndexedDB `nr13_dados_<org_id>` | espelho durável de tudo + fotos + fila | centenas de MB | boot e offline |
| `localStorage` | sessão + **palco do documento aberto** | 5 MB | os templates HTML |

### 3.2 A troca central

Hoje `ler(chave)` é síncrono porque lê `localStorage`. Passa a ler um **`Map` em memória**, hidratado do IndexedDB no boot e do Supabase quando há rede.

```
ANTES:  ler()  →  localStorage.getItem()      // teto de 5 MB
DEPOIS: ler()  →  cache.get()                 // Map em memória, sem teto
                   ↑ lerTudo(): Supabase → Map → IndexedDB
                   ↑ boot offline: IndexedDB → Map
```

`ler()` continua **síncrono**: os ~50 pontos de chamada não mudam. `salvar()` mantém a assinatura e grava em três lugares — Map (instantâneo), IndexedDB (durável), Supabase (ou fila, com o motivo do erro).

**O `reconcile` que apaga chaves locais por ausência é removido.** Ele existia para isolar contas; isso passa a ser feito pelo namespace do IndexedDB por org. Nada é apagado localmente por "não ter voltado do servidor" — a única causa de remoção local é um **tombstone explícito** (§7.3). Foi exatamente o apagar-por-ausência que transformou cada falha de rede ou de cota em sumiço de dado.

### 3.3 Módulos

| Módulo | Responsabilidade única | Não conhece |
|---|---|---|
| `services/cacheLocal.ts` | o `Map` + espelho no IndexedDB + cota do dispositivo | rede |
| `services/sync.ts` | fila durável, drenagem, idempotência, conflitos, motivo do erro | UI |
| `services/fotos.ts` | `salvarFoto` / `resolverFoto` / upload / variante de relatório | formulário |
| `services/palco.ts` | orçamento + materialização + limpeza do `localStorage` | Supabase |
| `services/storage.ts` | API pública (`ler`/`salvar`/`excluir*`/`lerTudo`) orquestrando os quatro | — |

`storage.ts` hoje faz tudo isso sozinho em 515 linhas.

---

## 4. Durabilidade do IndexedDB

O IndexedDB **não** é ilimitado nem imune à limpeza do navegador. O design assume isso.

### 4.1 Persistência

- No boot autenticado: `navigator.storage.persist()` (best-effort, sem bloquear nada).
- `navigator.storage.estimate()` a cada boot e após uploads: guarda `{usage, quota}`.
- **Aviso ao usuário a partir de 80% da cota**, com o que ocupa mais espaço e ação de liberar (limpar fotos já sincronizadas do cache local).
- A partir de 95%: bloqueia **novas fotos** com mensagem explícita, em vez de falhar no meio da inspeção.

### 4.2 Se o navegador recusar persistência ou apagar o armazenamento

Só existe um dado que não sobrevive: o **pendente ainda não sincronizado**. Tudo já sincronizado volta do Supabase.

A defesa tem dois níveis, e o segundo é honestamente parcial:

**Nível 1 — encurtar a janela (é o que realmente protege).** Drenagem agressiva assim que há rede, `persist()` pedido no boot, o selo sempre visível para que pendência acumulada não passe despercebida, e aviso quando um item está pendente há mais de 1 hora. Pendência que não existe não se perde.

**Nível 2 — detectar, quando der.** Um **manifesto** minúsculo (só ids, chaves e contagem — sem payload, sem foto) é mantido em `localStorage`, poucos KB.

| Situação | O manifesto detecta? |
|---|---|
| IndexedDB despejado isoladamente (pressão de cota, limpeza automática do navegador) | **Sim** — lista o que se perdeu: TAG, formulário, quando |
| Usuário limpa **todos os dados do site** | **Não** — `localStorage` e IndexedDB são apagados juntos e o manifesto vai junto |
| Navegador anônimo/efêmero encerrado | **Não** |

No caso não detectável não há como enumerar o que se perdeu — o registro do que existia foi embora com o resto. O que o app faz é reconhecer o estado zerado numa conta que tem dados no servidor e avisar de forma genérica: *"Se havia alterações não sincronizadas neste aparelho, elas foram perdidas."* Sem inventar uma lista que não existe mais.

`persist()` negado é registrado e exibido no selo como aviso permanente de risco, com o texto do porquê.

**O compromisso é não perder em silêncio, não "sempre saber o que se perdeu".** Onde a detecção não alcança, a proteção é a janela curta do Nível 1.

---

## 5. O palco — orçamento concreto do `localStorage`

O palco é a única coisa que ainda vive no `localStorage`, e o limite de 5 MB continua valendo lá. Não basta "mostrar erro se não couber".

### 5.1 Orçamentos

| Constante | Valor | Motivo |
|---|---|---|
| `ORCAMENTO_DOC` | **3.400 KB** | 5 MB menos a margem da sessão (token do Supabase, chaves de sessão, manifesto) |
| `ORCAMENTO_IMG` | **110 KB** | teto por imagem já na variante de relatório |
| `LARGURA_REL` | 900 px | resolução suficiente para 4 fotos por folha A4 |

### 5.2 Variante de relatório

Toda foto tem duas formas:

- **original** — o que a câmera mandou, comprimido a 800/900 px, guardado no bucket. Nunca entra no palco.
- **variante de relatório** — derivada sob demanda: JPEG, `LARGURA_REL`, qualidade inicial 0.6, cacheada no IndexedDB por `fotoId`.

A variante é gerada por canvas e serve tanto para o base64 legado quanto para o Blob do bucket.

### 5.3 Cálculo antes de montar

`prepararPalco(tag, documentos)` **calcula tudo em memória antes de escrever qualquer coisa**:

1. Soma o tamanho das chaves estruturais da TAG + globais.
2. Resolve a lista de fotos do documento e gera as variantes.
3. Se `total > ORCAMENTO_DOC`, aplica degradação progressiva **em passos determinísticos**, recalculando a cada passo:
   `q 0.6 → 0.45 → 0.35` e depois `900 → 700 → 560 px`.
4. Se ainda não couber, **não monta nada**.

### 5.4 Nunca um relatório parcial

A escrita no palco é **tudo ou nada**: as chaves são acumuladas numa lista e só então gravadas; se qualquer `setItem` falhar, as já gravadas são removidas (rollback) e o relatório não é montado. O `localStorage` não tem transação — o rollback é explícito.

### 5.5 Quando não couber, dizer exatamente o quê

Tela de recusa listando, em ordem decrescente de peso: cada folha, cada foto (TAG, formulário, descrição), o tamanho de cada uma, o total e o orçamento. Ações oferecidas: remover fotos específicas, ou dividir o relatório em partes. **Nunca** um relatório montado pela metade.

---

## 6. Fila de sincronização

### 6.1 Item da fila

```ts
type ItemFila = {
  mutationId: string;      // crypto.randomUUID() — idempotency key
  op: 'set' | 'del' | 'upload' | 'del-arquivo';
  chave: string;
  valor?: string;          // ausente em del
  versaoBase: number;      // versão que o cliente tinha ao editar
  dispositivo: string;     // id estável do aparelho
  criadoEm: string;
  tentativas: number;
  ultimoErro?: { codigo: string; mensagem: string; quando: string };
  estado: 'aguardando' | 'enviando' | 'falha_definitiva' | 'conflito';
};
```

### 6.2 Idempotência

- **Dados**: o upsert é por `(org_id, chave)`. Reenviar o mesmo `mutationId` é inofensivo por construção.
- **Uploads**: o caminho no bucket é determinístico — `<org_id>/<tag>/<fotoId>.jpg` com `upsert: true`. Subir duas vezes produz o mesmo arquivo.
- **"Tentar de novo"** retoma o item pelo `mutationId` existente. **Nunca** enfileira um item novo. Salvar o mesmo formulário de novo substitui o item pendente daquela chave (dedup por chave), preservando o `mutationId` quando o conteúdo é idêntico.
- O `mutationId` acompanha a gravação até a confirmação do servidor, e é o que a tela de Pendências usa como identidade.

---

## 7. Conflitos

### 7.1 Versionamento

Duas colunas novas em `app_storage` — **fora do JSON**, porque os templates fazem parse do `valor`:

```sql
alter table public.app_storage add column if not exists versao      integer not null default 1;
alter table public.app_storage add column if not exists dispositivo text;
-- atualizado_em já existe
```

Gravação com concorrência otimista: `update ... where chave = ? and versao = versaoBase`, gravando `versao = versaoBase + 1`. **Zero linhas afetadas = conflito.**

### 7.2 Resolução, em ordem

1. **Chaves diferentes** — as chaves granulares por formulário (§8) fazem a maior parte dos conflitos deixar de existir: campo e escritório editando formulários distintos não se encontram.
2. **Exclusão vence** — se um dos lados é tombstone, a exclusão prevalece. É a única ação inequivocamente intencional.
3. **Mais recente vence por `atualizado_em`** — e o perdedor **não é descartado**: vira `nr13_conflito_<chave>__<timestamp>`, que aparece na tela de Pendências como *"Duas versões deste formulário"*, com origem (dispositivo, quando) e escolha manual.
4. **Empate de `atualizado_em`** (relógios diferentes, mesmo segundo) — as duas versões são preservadas, nenhuma é aplicada automaticamente, e o usuário escolhe.

Regra que não se quebra: **nenhuma versão é jogada fora sem alguém escolher.**

### 7.3 Tombstones — exclusão é soft-delete no servidor

Sem o `reconcile` por ausência, uma linha simplesmente sumida do servidor é indistinguível de uma que nunca existiu: o aparelho B jamais saberia que A excluiu algo. Por isso **exclusão deixa de ser `DELETE`**:

```sql
alter table public.app_storage add column if not exists deletado_em timestamptz;
```

- `excluir()` grava tombstone local `{ chave, excluidoEm, dispositivo, mutationId }` e enfileira `op:'del'`, que no servidor vira `update ... set deletado_em = now(), versao = versao + 1`.
- A hidratação traz também as linhas com `deletado_em` preenchido e **remove localmente** as chaves correspondentes. É assim que a exclusão feita num aparelho chega aos outros.
- A hidratação **nunca ressuscita** uma chave cujo tombstone local é mais novo que o `atualizado_em` do servidor.
- `ler()` e a listagem ignoram linhas com `deletado_em`.
- **Coleta de lixo**: `DELETE` físico só numa rotina administrativa, para linhas com `deletado_em` há mais de 30 dias. O `valor` (a parte pesada) é o que sai; a prova da exclusão **permanece** — ver §7.4. O tombstone local é descartado junto.

### 7.4 Piso de versão — o morto não volta depois da coleta

Depois do `DELETE` físico não sobra nada, na linha, que prove que a chave existiu. Um aparelho que ficou offline **mais tempo que o prazo de coleta** volta com um `set` pendente daquela chave, o upsert não encontra conflito e **o dado ressuscita**. Três controles, aplicados **no servidor** — o cliente desatualizado é exatamente a ameaça, então validar só no cliente não serve:

**a) Histórico compacto de exclusões (permanente)**

```sql
create table if not exists public.app_storage_excluidos (
  org_id       uuid not null,
  chave        text not null,
  versao_final integer not null,   -- última versão vista antes de excluir
  excluido_em  timestamptz not null default now(),
  primary key (org_id, chave)
);
```

Guarda só a identidade e o número da versão — dezenas de bytes por exclusão, sem `valor`. É o que sobrevive à coleta. Não é podado junto com as linhas; se um dia precisar ser, aí vale o controle (c).

**b) Piso de versão por chave**

Trigger `before insert or update on app_storage`: se a chave existe em `app_storage_excluidos` com `versao_final >= versao` sendo gravada, a escrita é **rejeitada** com um código próprio (`nr13_versao_obsoleta`). Reescrever legitimamente aquela chave depois — recriar o mesmo equipamento, por exemplo — funciona normalmente, porque a versão nova é maior que `versao_final`.

**c) Corte de sincronização por org (rede de segurança)**

`profiles.sync_corte timestamptz` marca a última coleta executada. Mutação cujo `criadoEm` é anterior ao corte **nunca é aplicada automaticamente**, mesmo que a chave não conste no histórico de exclusões — cobre a hipótese de o próprio histórico ter sido podado um dia.

**Nos três casos a alteração não é descartada:** vira item `conflito` em `/pendencias`, com o texto *"Esta alteração é mais antiga que a exclusão feita em outro aparelho"*, mostrando as duas datas e deixando o usuário decidir entre descartar ou regravar como versão nova. Vale a mesma regra do §7.2: nada é jogado fora sem alguém escolher.

---

## 8. Inspeção mobile e fotos

### 8.1 Foto

```
tirar foto → comprimirImagem(800px) → Blob
           → salvarFoto(blob): grava no IndexedDB, devolve fotoId    ← nunca falha por rede
           → o JSON do formulário guarda { fotoId, descricao }        ← ~50 bytes, não 100 KB
           → sync sobe para inspecao/<org_id>/<tag>/<fotoId>.jpg
```

Guardamos **Blob**, não base64 — sem os 33% de overhead. `resolverFoto(fotoId)`: IndexedDB → bucket → data URI, cacheando ao baixar.

### 8.2 Autosave granular

- `nr13_docs_<TAG>` passa a guardar **só o índice** dos containers (id, nome, data, ensaios, `esquema`).
- Cada formulário vira `nr13_form_<TAG>__<containerId>__<formulario>`.

Autosave escreve ~3 KB em vez de megabytes, e a janela de conflito encolhe para um formulário.

`excluirVaso` deixa de casar sufixo `_<TAG>` e passa a usar um **índice de chaves por TAG**, mantido pelo `cacheLocal` (corrige D7 de quebra).

### 8.3 Offline durante a sessão

Perde sinal → grava no Map e no IndexedDB, tenta o Supabase, falha, enfileira **com o motivo**. Volta o sinal → drena sozinho.

Como o boot passa a hidratar do IndexedDB, **fechar e reabrir o app sem rede também funciona** — hoje `lerTudo` offline devolve `{}`.

### 8.4 Exclusão offline e ordem de remoção no bucket

Fila de dois estágios, nesta ordem obrigatória:

1. `op:'del'` dos **dados** que referenciam a foto → aguarda confirmação do servidor;
2. só então enfileira `op:'del-arquivo'` do objeto no bucket;
3. antes de apagar o arquivo, uma **contagem de referências** confirma que nenhuma outra chave usa aquele `fotoId`. Se usar, o arquivo permanece.

Arquivo órfão é aceitável; arquivo faltando para uma referência viva, não.

---

## 9. Erros — sempre visíveis, nunca crus

### 9.1 Tradução com detalhe técnico guardado

Nenhuma mensagem interna do Supabase vai para a tela principal, **de nenhum usuário**.

| Situação | O que o usuário lê | Ação |
|---|---|---|
| sem rede | "Sem conexão. Vai subir sozinho quando voltar." | — |
| RLS / `42501` | "Sua assinatura está suspensa ou você não tem permissão para gravar." | Regularizar |
| cota do aparelho | "O armazenamento deste aparelho está cheio." | Liberar espaço |
| sessão expirada / `401` | "Sua sessão expirou. Entre novamente." | Entrar |
| conflito | "Este formulário foi alterado em outro aparelho." | Comparar versões |
| qualquer outro | "Não foi possível salvar no servidor." | Tentar de novo |

Em **todos** os casos, um bloco recolhível **"Detalhes técnicos"** guarda: código, mensagem original, chave, `mutationId`, dispositivo e horário — disponível na tela de Pendências e copiável para suporte. O erro nunca é escondido; só não é despejado cru.

### 9.2 Os cinco estados na interface

| Estado | Significado | Sinal visual |
|---|---|---|
| `salvo_local` | gravado no aparelho, ainda não enviado | nuvem com seta, cinza |
| `aguardando` | na fila, será enviado | nuvem pulsando, âmbar |
| `sincronizado` | confirmado pelo servidor | check verde |
| `falha_definitiva` | não se resolve sozinho (permissão, conflito, cota) | vermelho + ação |
| `bloqueado_nao_salvo` | recusado; **nada foi gravado** | cadeado vermelho + "não salvo" |

`bloqueado_nao_salvo` é o caso da assinatura suspensa: o app **não grava local e não enfileira** — corrige D1, que hoje finge sucesso e perde o dado 60s depois.

Cada formulário e cada foto carrega seu estado; o `<SeloSync/>` no Layout agrega ("Tudo salvo" / "3 pendências" / "Falhou") e leva para `/pendencias`.

### 9.3 Regra dura

**Zero `catch {}` vazio no caminho de dados.** Todo catch reporta ao `sync.ts`. Hoje são 6, incluindo o D4 que faz a inspeção do celular falhar calada. Um teste percorre os módulos de dados e falha se encontrar catch vazio.

---

## 10. Isolamento entre organizações

- **O servidor decide o `org_id`.** As policies usam `org_atual()` (SECURITY DEFINER lendo `profiles`); o `org_id` enviado pelo cliente é conferido pelo `with check`, nunca é a fonte da decisão. `sb-storage.js` para de fazer REST direto e passa pela fila do app — corrige D5.
- **Bucket** `inspecao`, privado, com policies por prefixo de pasta:

```sql
create policy inspecao_leitura on storage.objects for select
  using (bucket_id = 'inspecao' and (storage.foldername(name))[1] = public.org_atual()::text);
-- insert/update/delete: mesma condição + papel <> 'cliente' + acesso_vigente() + assinatura_permite_escrita()
```

- **IndexedDB com namespace por org**: `nr13_dados_<org_id>`. Contas diferentes não compartilham banco local.
- **Na troca de conta**: fecha a conexão do IndexedDB, zera o `Map`, limpa o palco e as chaves de sessão. No logout explícito, o banco da org anterior é apagado.
- Testes específicos de isolamento (§11).

---

## 11. Testes

### 11.1 Regressão do bug real

Cenário com **340 chaves / 8 MB**, espelhando a conta `cmam.caldeiras`: os **38** `nr13_info_` têm que aparecer em `listarEquipamentos()`. **Esse teste falha na `main` hoje** — é ele que prova o conserto.

### 11.2 Cenários obrigatórios

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | **Duas abas abertas** no mesmo aparelho | fila única, sem gravação dupla; a segunda aba enxerga o que a primeira gravou |
| 2 | **Dois dispositivos** editando a mesma chave | §7: mais recente vence, perdedor preservado e oferecido |
| 3 | **Fechar o navegador durante o salvamento** | ao reabrir, o item está na fila e sobe; nada some |
| 4 | **Cair a conexão durante upload** de foto | retomada pelo `mutationId`, sem arquivo duplicado |
| 5 | **Sessão expirar com pendências** | itens preservados; estado `falha_definitiva` com "entre novamente"; sobem após novo login |
| 6 | **Exclusão offline** | não ressuscita ao sincronizar; arquivo do bucket só some depois da confirmação dos dados |
| 7 | **Migração interrompida** na metade | retomável, idempotente; container continua legível o tempo todo |
| 8 | **Troca de organização** | zero chaves da org anterior no Map, no palco ou no IndexedDB |
| 9 | **Reabrir o app 100% offline** | hidrata do IndexedDB; lista e fichas funcionam |
| 10 | **Relatório perto e acima de 5 MB** | degrada em passos; se não couber, recusa com a lista do que excedeu; **nunca monta parcial** |
| 11 | IndexedDB apagado pelo navegador com pendências (manifesto sobrevive) | tela explícita listando o que se perdeu |
| 12 | `persist()` negado | app funciona; aviso permanente de risco |
| 13 | **Aparelho offline além do prazo de coleta** volta e tenta sincronizar versão antiga de chave já excluída e coletada | escrita **rejeitada** pelo servidor (§7.4); dado excluído **não ressuscita**; a alteração vira item `conflito` em `/pendencias` com as duas datas |
| 14 | Limpeza total dos dados do site (manifesto some junto) | aviso genérico de possível perda; **sem** lista inventada; nada ressuscita ao re-hidratar |
| 15 | Recriar legitimamente uma chave excluída e coletada | funciona: versão nova > `versao_final`, escrita aceita |

### 11.3 Por módulo

- `cacheLocal`: `ler` síncrono, hidratação do IndexedDB, índice por TAG, namespace por org.
- `sync`: persistência da fila, dedup, ordem, idempotência, tombstones, conflitos, tradução de erro.
- `fotos`: salva offline → resolve local; upload marca enviada; outro aparelho baixa do bucket; variante de relatório respeita `ORCAMENTO_IMG`.
- `palco`: cálculo antes da escrita, degradação em passos, rollback atômico, mensagem do que excedeu.
- `storage.gate.test.ts` (existente): atualizar — bloqueado agora **erra**, não finge.
- Fechamento: `npm run build` (o `tsc -b` do deploy é mais estrito que `--noEmit`).

---

## 12. Migração dos dados existentes

### 12.1 Fonte canônica explícita

Cada container carrega `esquema: 1 | 2` no índice `nr13_docs_<TAG>`.

- `esquema: 1` → **fonte canônica é o JSON legado**. As chaves granulares não existem e não são escritas.
- `esquema: 2` → **fonte canônica são as chaves granulares**. O JSON legado não é mais escrito.

Nunca há edição simultânea das duas fontes. A troca é atômica do ponto de vista da aplicação: `esquema` só vira `2` no último passo.

### 12.2 Migração preguiçosa, idempotente e retomável

Ao abrir um container com `esquema: 1`:

1. cada foto base64 → upload para o bucket (pula as que já estão lá — checagem por `fotoId`);
2. escreve as chaves granulares por formulário (pula as que já existem com o mesmo conteúdo);
3. **só então** grava `esquema: 2` no índice;
4. **só depois da confirmação do servidor do passo 3**, o base64 é removido do JSON legado.

Interrompida em qualquer ponto, a próxima abertura retoma de onde parou. Enquanto `esquema` for `1`, o container continua totalmente legível e editável pelo caminho antigo.

### 12.3 Reversibilidade

Enquanto o passo 4 não roda, o JSON legado continua íntegro no servidor — reverter é voltar `esquema` para `1`. Depois do passo 4, uma rotina `reconstruirLegado(containerId)` remonta o JSON a partir das chaves granulares e das fotos do bucket. As duas direções têm teste.

### 12.4 Leitura de duas pernas

Durante toda a transição, a resolução de foto aceita `{ fotoId }` **e** base64 legado. No dia do deploy, nada quebra.

### 12.5 Varredura das contas gordas

Rotina administrativa opcional (Edge Function) para migrar de uma vez as quatro contas acima do limite, tirando o projeto do *exceeding usage limits*. Usa exatamente o mesmo caminho idempotente da migração preguiçosa. **Nenhum `DELETE` em `app_storage`**: a linha só encolhe depois da foto confirmada no bucket.

---

## 13. Entregas

Sem solução temporária: a primeira publicação já é a arquitetura nova. A hidratação priorizada existe só como detalhe interno da Fase 1, não como release.

| Fase | Entrega | Resultado |
|---|---|---|
| **1** | `cacheLocal` + IndexedDB + `sync` + `palco` + persistência + selo + `/pendencias` + 5 estados + isolamento por org | **os 38 equipamentos voltam**; teto de 5 MB morto; erro nunca mais some |
| **2** | bucket + `fotos.ts` + autosave granular + versionamento/conflitos + exclusão em dois estágios | mobile leve, banco desincha, conflito resolvido |
| **3** | esquema v2 canônico + migração preguiçosa + varredura das contas gordas | Supabase sai do limite |

Defeitos corrigidos por fase: **Fase 1** — o bug principal, D1, D2, D3, D4 e D5 (a escrita vinda dos templates passa a usar a fila do app). **Fase 2** — D6 e D7.

---

## 14. Decisões registradas

| Decisão | Porquê |
|---|---|
| `Map` em memória em vez de tornar `ler()` assíncrono | preserva ~50 pontos de chamada; o diff fica em `storage.ts` |
| `localStorage` mantido só como palco | os 40+ templates HTML não mudam uma linha |
| Fotos no bucket, não base64 no banco | tira o `+33%` de overhead e o projeto do limite de uso |
| Blob no IndexedDB, não base64 | mesmo motivo, no lado do cliente |
| Colunas `versao`/`dispositivo` no SQL, fora do JSON | os templates fazem parse do `valor` e não podem enxergar metadado |
| Conflito nunca descarta versão | dado de inspeção em campo não se refaz |
| Exclusão vira soft-delete (`deletado_em`) | sem isso, uma exclusão feita num aparelho nunca chegaria aos outros — e foi o apagar-por-ausência que causou o bug original |
| Histórico de exclusões permanente + piso de versão, validados por trigger | o cliente desatualizado é a ameaça; validação só no cliente não impede a ressurreição |
| Manifesto de perdas assumido como parcial | limpeza total do site leva o manifesto junto; prometer sempre saber o que se perdeu seria falso |
| Exclusão vence conflito | é a única ação inequivocamente intencional |
| Sem Fase 0 publicada | evita construir e publicar algo que seria substituído em seguida |
