# Auditoria técnica — Sistema NR-13

**Data:** 15/08/2026
**Base:** branch `main` @ `6f7b576`
**Escopo:** 252 arquivos TS/TSX · 13 scripts SQL · 6 Edge Functions · 40+ templates HTML
**Natureza:** diagnóstico read-only. Nenhum código, banco, template ou deploy foi alterado.

---

## Contexto do sistema (para quem está lendo de fora)

Aplicação React 19 + TypeScript + Vite, sem backend próprio: o "banco" é o Supabase
(Postgres + Storage + Edge Functions). Domínio: inspeção de vasos de pressão, caldeiras
e autoclaves conforme a norma brasileira NR-13. O usuário preenche inspeções no celular
em campo (muitas vezes offline) e gera relatórios/prontuários técnicos assinados por
engenheiro no computador do escritório.

Particularidade arquitetural central: **as folhas do relatório e do prontuário são
templates HTML estáticos** (40+ arquivos em `public/`) renderizados em `<iframe>`. Cada
template lê os dados que precisa **direto do `localStorage`**, de forma síncrona, no
`DOMContentLoaded`. Essa restrição explica quase todas as decisões de armazenamento do
sistema.

Histórico recente relevante: entre 04/08 e 14/08/2026 o armazenamento foi reescrito
(v1 → v2) porque o `localStorage`, com cota de ~5 MB para a origem inteira, estava
fazendo equipamentos "sumirem" de contas reais em produção.

---

## Placar

| Severidade | Quantidade |
|---|---|
| 🔴 Crítico | 4 |
| 🟠 Importante | 8 |
| 🟡 Melhoria | 6 |
| 🟢 Já correto (verificado) | 18 |

**Leitura curta:** a arquitetura de armazenamento já está, no essencial, onde deveria
estar. As correções de agosto de 2026 (v2, migração para bucket, artefato imutável,
índice por TAG, hidratação incremental) resolveram os problemas estruturais graves e
resolveram bem. O que sobrou se divide em três grupos:

1. **Uma falha de isolamento entre clientes** que não é de desempenho e não pode esperar fase nenhuma.
2. **Três gargalos de escala** que hoje não doem e vão doer de forma previsível: o Portal do Cliente, o índice do Postgres e o PDF rasterizado.
3. **Uma coleção de pontas de legado**: base64 residual, arquivos órfãos, listagens sem paginação, observabilidade zero.

---

# 1. Como o sistema guarda os dados hoje

## 1.1 As quatro camadas

| Camada | Papel hoje | Conteúdo | Teto |
|---|---|---|---|
| **Postgres `app_storage`** | Fonte de verdade. Uma linha por chave, por organização (chave-valor: `org_id`, `chave`, `valor` texto/JSON, `versao`, `atualizado_em`, `dispositivo`, `deletado_em`). | JSON estruturado + referências leves para arquivos. Resíduo de base64 legado (ver A-05). | — |
| **Supabase Storage, bucket `inspecao`** | Todo arquivo pesado. Privado. Isolado por pasta `<org_id>/`. | Fotos, PDF de relatório, certificados padrão, prontuário do fabricante, rubricas do livro. | — |
| **IndexedDB** | Cache offline + fila de mutações. Dois bancos: `nr13_dados_<org_id>` (stores: `dados`, `fila`, `tombstones`, `meta`) e um cofre de arquivos (blobs pendentes). | Map espelhado, fila, tombstones, blobs, PDFs legados. | centenas de MB |
| **localStorage** | **Só o "palco"** + flags de sessão. Montado e limpo por documento. | Chaves da TAG aberta que algum template lê, com imagens rehidratadas em dataURL. | 3.368 KB por documento (orçamento próprio, dentro dos ~5 MB do navegador) |

### O "palco"

Como os templates HTML leem `localStorage` de forma síncrona e não podem ser reescritos
sem custo alto, o app **materializa** no `localStorage`, antes de montar os iframes,
apenas as chaves daquele documento específico — e limpa depois. Isso tem:

- trava de dono exclusivo por aba (`palcoTrava.ts`, TTL de 60 s, liberada em `pagehide`);
- orçamento de 3.400 KB menos margem de 32 KB para metadados;
- degradação progressiva de imagem em passos fixos (qualidade 0,60 / 0,45 / 0,35, depois largura 900 / 700 / 560 px);
- materialização tudo-ou-nada com restauração dos valores anteriores em caso de falha;
- uma lista explícita `FORA_DO_PALCO` de chaves que nenhum template lê;
- um teste (`palco.varreduraTemplates.test.ts`) que varre `public/` e quebra se surgir chave nova sem cobertura.

## 1.2 Módulo a módulo

| Módulo | O que é armazenado | Onde | Formato | Tamanho típico | Sincronização | Offline |
|---|---|---|---|---|---|---|
| Equipamentos | Ficha, unidade, categoria, memorial, vida remanescente | `app_storage` · IndexedDB | JSON | 2–20 KB/TAG | RPC `aplicar_mutacao_storage` + fila | Total (Map + IDB) |
| Fotos do equipamento | Galeria e capa | Bucket · ref no `app_storage` · blob no cofre | JPEG 1200px q0.7 | 80–200 KB | Upload direto + fila própria do cofre | Blob local, upload retomado |
| Inspeções (container) | Checklists, respostas, refs de foto | `nr13_docs_<TAG>` | JSON | 10–80 KB | Fila v2 | Total |
| Fotos de inspeção | Campo, checklists, visual externo/interno, teste hidrostático | Bucket · ref no container | JPEG 1200px q0.7 | 100–150 KB | Upload + fila do cofre | Blob local |
| Memorial de cálculo | PMTA, PTH, componentes, HTML do memorial | `app_storage` | JSON + HTML | 10–60 KB | Fila v2 | Total |
| Relatório salvo | Receita + snapshots congelados + `pdfRef` + SHA-256 | `nr13_rel_<id>_<TAG>` · PDF no bucket | JSON ~110 KB + PDF | 110 KB + 8–30 MB | Fila v2 + upload do artefato | PDF no cofre, marcado `pdfPendente` |
| Histórico | Índice leve por TAG (id, código, datas, `pdfRef`, sha) | `nr13_historico_indice_<TAG>` | JSON | ~0,6 KB/relatório | Fila v2; índice é derivado e reparável | Total |
| Livro de Registro | Entradas lacradas em cadeia (SHA + `shaAnterior`) + `assinaturaRef` | `app_storage` · rubricas no bucket | JSON | ~1,2 KB/entrada | Fila v2 + trava de imutabilidade no banco | Total |
| Certificados padrão (rastreabilidade) | Metadados + PDF do instrumento padrão | Bucket · ref no `app_storage` | PDF | 200–800 KB | Upload + fila do cofre | Blob local |
| Calibrações / componentes | Válvulas, manômetros, lotes, certificados emitidos | `app_storage` · fotos no bucket | JSON | 5–40 KB | Fila v2 | Total |
| Prontuário do fabricante | PDF enviado pelo usuário, até 8 MB | Bucket · ref no `app_storage` | PDF | até 8 MB | Upload + fila do cofre | Blob local |
| Assinaturas / logo | Rubrica dos funcionários (PNG 500px), logo da empresa (JPEG 300px) | **`app_storage` em base64** | dataURL | 15–30 KB cada | Fila v2 | Total |
| Croqui 2D / folha de dados | Modelo do vaso, SVGs, dimensões derivadas | `app_storage` | JSON + SVG | 20–80 KB | Fila v2 | Total |
| Portal do Cliente | Chaves dos ativos do cliente | Edge `portal_cliente` → `localStorage` | JSON | organização inteira lida no servidor | Sem fila — leitura pura | Nenhum |
| Dashboard / vencimentos | Derivado do índice de relatórios + calibrações | Calculado do Map em memória | — | — | — | Total |
| Service worker | App shell, templates das folhas, assets com hash | Cache API `nr13-cache-v8` | HTTP | poucos MB | network-first, exceto `/assets/` | App abre offline |

## 1.3 Como uma escrita viaja hoje

**Dados estruturados:**

1. `salvar()` grava o dado **e** o item de fila na **mesma transação** do IndexedDB.
2. A promessa só resolve no `tx.oncomplete` — nunca no `request.onsuccess`, que dispara antes do commit.
3. Só então tenta a RPC `aplicar_mutacao_storage`.
4. A RPC é idempotente por `mutationId` (tabela `app_storage_mutacoes`) e compara `versao_esperada` sob `FOR UPDATE`. Conflito é detectado, nunca sobrescrito em silêncio.
5. Em conflito, **as duas versões sobrevivem**: a do servidor vira `nr13_conflito_*`, a local fica na fila marcada, e o usuário decide.
6. Nada é apagado localmente por ausência no servidor. Só tombstone explícito remove.

**Hidratação (leitura):**

- Consulta incremental: `where org_id = X and atualizado_em > marca order by atualizado_em, chave`, paginada de 1000 em 1000.
- Ordenação **composta** porque `atualizado_em` não é único — sem a chave de desempate, linhas do mesmo instante poderiam cair na fronteira entre páginas e nunca serem lidas.
- A marca d'água só avança **depois** de todas as páginas terem sido aplicadas.
- Tombstone local mais novo não ressuscita a chave; pendência local vence a linha do servidor.
- Offline devolve o snapshot do Map (a v1 devolvia `{}`, e a tela concluía "conta vazia").
- Válvula de escape: `localStorage.nr13_hidratacao_completa = '1'` força hidratação total.

**Arquivos:**

- O caminho no bucket é decidido **antes** de qualquer rede, e não muda depois.
- O blob vai para o cofre local (IndexedDB) **antes** da tentativa de upload.
- Falhar é normal (campo sem sinal) e não é erro para o usuário.
- A fila retoma em `online` **e** em `visibilitychange` — no celular a rede volta com a aba em segundo plano e nenhum evento `online` chega à página.
- Quem grava um registro que aponta para arquivo pergunta ao cofre (`arquivoPendente`), nunca ao `navigator.onLine`.

---

# 2. Achados

Ordenados por prioridade.

> ⚠️ **Antes de qualquer fase de desempenho:** o achado A-01 não é otimização. É um
> cliente conseguindo ler os dados de outro cliente da mesma organização. Deve ser
> corrigido isoladamente, com prioridade sobre todo o resto.

---

## 🔴 A-01 — Cliente do Portal lê o `app_storage` e o bucket da organização inteira

**Arquivos:** `supabase/acesso_setup.sql:68` · `supabase/fotos_storage.sql:46` · `supabase/functions/portal_cliente/index.ts`

A única policy de `SELECT` em `app_storage` é:

```sql
create policy app_storage_select_org on public.app_storage
  for select using (org_id = public.org_atual());
```

Sem filtro de papel. E `org_atual()` é:

```sql
create or replace function public.org_atual() returns uuid
  language sql security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;
```

Para uma conta `papel='cliente'`, `profiles.org_id` aponta para a organização do
**inspetor**. A Edge Function `portal_cliente` existe justamente para filtrar por cliente
usando `service_role` — e o comentário no topo dela reconhece explicitamente o risco:

> "o vínculo ativo→cliente mora DENTRO do app_storage (`nr13_emp_<TAG>.clienteId`), então
> RLS pura não filtra por cliente — um cliente com DevTools leria chaves de outros
> clientes da mesma org. Aqui o filtro é feito com service_role."

Mas a Edge é um caminho **opcional**. O token do cliente é um token normal do Supabase, e
`supabase.from('app_storage').select('*')` no console do navegador devolve todas as
chaves da organização: fichas de equipamento, relatórios, dados comerciais e de contato
de outros clientes.

O bucket tem exatamente o mesmo desenho — `inspecao_leitura` compara só a primeira pasta
do caminho com `org_atual()`. Um cliente autenticado consegue assinar URL de qualquer
foto, qualquer PDF de relatório e qualquer prontuário da organização.

A **escrita está protegida**: `papel_atual() in ('mestre','gerente','funcionario')`
aparece em todas as policies de INSERT/UPDATE/DELETE de `app_storage` e do bucket. O
buraco é só de leitura, e só entre clientes da mesma organização; o isolamento **entre
organizações** está íntegro.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Real desde que exista mais de um cliente com login na mesma organização |
| Impacto com escala | Cresce com cada cliente do Portal; vazamento entre concorrentes atendidos pelo mesmo inspetor |
| Solução recomendada | Restringir o SELECT por papel e reencaminhar toda leitura do cliente pela Edge; no bucket, exigir papel na policy de leitura e servir arquivo ao cliente por URL assinada emitida pela Edge |
| Complexidade | Média (SQL + ajuste em `portalService`) |
| Risco | Médio — policy errada tira o Portal do ar; exige teste com conta cliente real antes do deploy |
| Compatibilidade com legado | Total |
| Impacto offline | Nenhum (cliente não grava nem trabalha offline) |
| Prioridade | **Imediata, isolada** |

---

## 🔴 A-02 — A Edge do Portal baixa a organização inteira a cada abertura

**Arquivos:** `supabase/functions/portal_cliente/index.ts:80` · `src/features/portal/portalService.ts:27`

A Edge faz duas varreduras completas:

1. `select chave, valor from app_storage where org_id = X and chave like 'nr13\_emp\_%'` — para descobrir as TAGs do cliente.
2. `select chave, valor from app_storage where org_id = X` — **sem filtro nenhum**, paginada de mil em mil — e só então filtra por sufixo `_<TAG>` em memória.

O comentário no código assume o custo conscientemente ("Uma query só, filtro em memória —
padrões de sufixo com LIKE por TAG explodiriam em N queries"), mas a conta não fecha em
escala: numa organização com 38 equipamentos e histórico, isso lê e transfere dezenas de
MB do Postgres para a Edge a cada login de cliente, para entregar uma fração.

Do lado do navegador:

```ts
for (const [chave, valor] of Object.entries(chaves)) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // cota: segue com as demais
  }
}
```

Estourada a cota de ~5 MB, as chaves seguintes somem **sem erro, sem log e sem aviso** —
o cliente vê um ativo pela metade ou uma tela vazia. É exatamente o modo de falha que a
v2 eliminou do sistema principal e que segue vivo aqui: o Portal nunca recebeu palco nem
IndexedDB.

Agrava: a Edge entrega o `RelatorioSalvo` completo (~110 KB cada, com logo e rubricas em
base64 dentro dos snapshots) quando o que o cliente precisa é o índice e o PDF do bucket.
E ainda entrega `nr13_historico_relatorios`, o array legado.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Egress alto por abertura; perda silenciosa de chaves em contas médias |
| Impacto com escala | Linear no tamanho da organização, não no do cliente. 1.000 equipamentos = varredura de tudo para mostrar 3 ativos |
| Solução recomendada | Resolver TAGs primeiro e consultar só as chaves daquelas TAGs; devolver índice em vez de relatório completo; trocar `localStorage` por palco (ou ao menos falhar em voz alta na cota) |
| Complexidade | Média (Edge + `portalService`; templates não mudam) |
| Risco | Baixo — área isolada, sem escrita e sem dado do inspetor em jogo |
| Impacto no egress | **O maior ganho isolado desta auditoria** |
| Prioridade | Alta |

---

## 🔴 A-03 — A hidratação incremental não tem índice que a sustente

**Arquivos:** `src/services/storageV2.ts:294` · `supabase/acesso_setup.sql:97`

A consulta de todo boot é:

```sql
select chave, valor, versao, atualizado_em, dispositivo, deletado_em
from app_storage
where org_id = $1 and atualizado_em > $2
order by atualizado_em asc, chave asc
limit 1000;
```

Os índices existentes em `app_storage`:

- `app_storage_org_idx (org_id, chave)`
- `app_storage_org_chave_uidx (org_id, chave)` (unique)
- `app_storage_deletado_idx (org_id, deletado_em)`

Nenhum serve para essa consulta. O Postgres varre todas as linhas da organização e ordena
em memória, **mesmo quando o resultado é zero linhas**.

Hoje não aparece porque as organizações são pequenas. Com 1.000 equipamentos (~15 mil
chaves), cada abertura do app de cada usuário paga uma varredura completa — e a promessa
da hidratação incremental ("custo quase zero quando nada mudou") só se cumpre no tráfego,
não no banco.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Baixo e invisível |
| Impacto com escala | CPU do Postgres cresce com nº de chaves × nº de aberturas. É o primeiro item a derrubar o teste de carga |
| Solução recomendada | `create index concurrently on app_storage (org_id, atualizado_em, chave)` |
| Complexidade | Trivial |
| Risco | Mínimo — aditivo, sem downtime |
| Compatibilidade com legado | Total |
| Prioridade | Alta (custo quase zero, ganho estrutural) |

---

## 🔴 A-04 — O PDF é 100% raster: cada folha A4 é uma foto JPEG

**Arquivos:** `src/features/relatorios/pdfService.ts:42` · `printService.ts`

```ts
const canvas = await html2canvas(alvo, {
  scale: 2, useCORS: true, allowTaint: true, logging: false,
  height: ALTURA_A4_PX, windowHeight: ALTURA_A4_PX,
  onclone: normalizarCloneParaCanvas,
});
pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
```

`html2canvas` em `scale: 2` gera um bitmap de ~1.588 × 2.245 px por folha, convertido em
JPEG 0.95 e colado no jsPDF cobrindo a página inteira. **Não sobra vetor nenhum**: texto,
tabelas, linhas, fórmulas e números viram pixels.

Consequências encadeadas:

- **Tamanho.** Cada folha custa centenas de KB. Um relatório de 30 folhas produz um PDF na casa dos 10–30 MB — e esse arquivo agora é o artefato imutável, guardado no bucket para sempre.
- **Storage e egress.** Multiplique por relatório emitido, por equipamento, por cliente, por ano. É a maior fonte de crescimento de custo do sistema.
- **Qualidade.** Texto rasterizado a ~192 dpi imprime com bordas moles; linhas finas de tabela engrossam ou somem. Não há busca de texto nem seleção no PDF.
- **Memória.** A geração segura dezenas de canvases grandes; o código já precisa de um `setTimeout(0)` entre folhas para o Chrome não oferecer matar a aba.
- **Fragilidade.** Toda uma família de defeitos já documentada no projeto é consequência direta de rasterizar HTML: fonte Inter não registrada no documento pai (texto sai sem espaços), `letter-spacing ≠ normal` fazendo o texto ser desenhado caractere a caractere, `text-align: justify` colapsando espaços, grid/flex estourando a folha, inputs cortados. Há uma função inteira (`normalizarCloneParaCanvas`) só para contornar isso.

O caminho vetorial é real mas não é pequeno: os 40+ templates são HTML estático desenhado
para tela. Um piloto honesto pega **uma** folha densa em texto e tabela — `PRONTUARIO.html`
ou `RESUMO-MEMORIAL.html` — e a redesenha com primitivas do jsPDF ou pdf-lib, mantendo
raster só para foto, rubrica, logo e croqui.

| Campo | Avaliação |
|---|---|
| Impacto hoje | PDFs grandes, impressão sofrível, geração lenta |
| Impacto com escala | Storage e egress crescem sem teto; domina a conta do Supabase no longo prazo |
| Solução recomendada | Piloto híbrido em **uma** folha, medindo tamanho, nitidez e fidelidade contra o PDF atual. Expansão só depois de aprovado |
| Complexidade | Alta — cada folha migrada é trabalho de layout, não de refactor |
| Risco | Alto se feito em bloco; baixo por folha, com o caminho antigo intacto como padrão |
| Compatibilidade com legado | Nenhum PDF já emitido pode ser regerado — são artefatos com hash. A mudança vale só para emissões novas |
| Prioridade | Alta em valor, mas depois dos itens baratos |

---

## 🟠 A-05 — Rubricas e logo continuam em base64, e são copiadas para dentro de cada relatório

**Arquivos:** `src/services/imagem.ts:86` · `src/features/relatorios/tipos.ts` (`AssinanteSnapshot`)

`nr13_lista_phs` guarda a rubrica de cada funcionário como PNG em dataURL (processada a
500 px), e `nr13_minha_empresa` guarda a logo como JPEG em dataURL (300 px). As duas são
chaves **globais**, entram no palco de **todo** documento das quatro rotas, e — pela regra
de imutabilidade do relatório — são **copiadas inteiras** para dentro de `meta.empresa` e
`meta.assinantes` de cada relatório salvo:

```ts
export interface AssinanteSnapshot {
  nome: string;
  funcao?: string;
  crea?: string;
  assinatura?: string; // dataURL da rubrica  ← copiado por relatório
  camposExtras?: { rotulo: string; valor: string }[];
  folhasRelatorio?: string[];
}
```

100 relatórios guardam 100 cópias da mesma logo e 200 cópias das mesmas duas rubricas.

**O congelamento está certo** — é o que impede trocar a assinatura hoje e reescrever
documento assinado ano passado. O que está errado é o mecanismo: copiar o objeto quando
existe um jeito mais barato de congelar.

O sistema **já resolveu isso** uma vez, no Livro de Registro
(`src/features/relatorios/livroAssinatura.ts`): `salvarArquivoPorConteudo` nomeia o
arquivo pelo SHA-256 do próprio conteúdo, e a imutabilidade vira consequência do endereço:

- conteúdo igual → path igual → **um** arquivo, N referências de ~150 bytes;
- conteúdo diferente → path diferente; o arquivo antigo continua onde está, então a entrada de 2024 segue exibindo a rubrica de 2024.

O padrão está pronto e testado. Falta aplicá-lo à lista de funcionários, à logo e aos
snapshots do relatório.

| Campo | Avaliação |
|---|---|
| Impacto hoje | ~30–60 KB por relatório salvo, mais orçamento de palco consumido em todo documento |
| Impacto com escala | Linear no nº de relatórios; também engorda a hidratação, porque `nr13_lista_phs` muda a cada edição de cadastro |
| Solução recomendada | Estender o endereçamento por conteúdo do livro para rubrica e logo; snapshots passam a congelar a **ref**, não a imagem |
| Complexidade | Média — o palco já sabe rehidratar ref nomeada (`CAMPO_REF_NOMEADO`) |
| Risco | Médio — mexe no que folha assinada imprime; exige que o registro antigo continue lendo base64 para sempre |
| Compatibilidade com legado | Não migrar relatório já emitido. Só emissões novas nascem com ref |
| Prioridade | Média-alta |

---

## 🟠 A-06 — Arquivo do bucket nunca é removido quando o dono é excluído

**Arquivos:** `src/services/storageV2.ts:198` (`excluirVaso`) · `src/features/relatorios/historicoRelatorios.ts:261`

`excluirVaso` percorre as chaves da TAG pelo índice explícito e enfileira exclusões — mas
não conhece arquivo nenhum. Todas as fotos do equipamento, o prontuário do fabricante e
os PDFs de todos os relatórios dele ficam no bucket, sem nada apontando para eles. O mesmo
em `excluirRelatorio`: o registro sai, o PDF fica.

`removerFoto` tenta apagar e **engole a falha de propósito** — decisão correta para o
fluxo do usuário ("arquivo órfão no bucket é aceitável; perder a ação do usuário não é"),
e mais uma fonte de órfãos.

Não existe hoje nenhuma forma de saber quantos arquivos órfãos existem nem quanto ocupam.

A saída correta é uma rotina que **encontra e relata** — idade, tamanho, origem — sem
apagar nada. A exclusão vem depois, com período de retenção, e nunca automática: um
"órfão" que na verdade é o PDF de um relatório assinado seria uma perda irrecuperável.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Storage cresce monotonicamente; não sabemos quanto é lixo |
| Impacto com escala | Proporcional à rotatividade de equipamentos e relatórios; impossível estimar sem medir |
| Solução recomendada | Fase A: inventário read-only (listar bucket × referências no `app_storage`). Fase B: retenção e exclusão manual auditada |
| Complexidade | Média — precisa de uma Edge com `service_role` para listar o bucket |
| Risco | Zero enquanto for só inventário; alto se virar exclusão automática — por isso não deve virar |
| Prioridade | Média |

---

## 🟠 A-07 — Nenhuma listagem tem paginação ou virtualização

**Arquivos:** `src/pages/Equipamentos.tsx` · `Dashboard.tsx` · `Vencimentos.tsx` · `LivroRegistro.tsx` · `src/services/vencimentos.ts`

`listarEquipamentos()` monta o resumo de **todos** os equipamentos e a tela renderiza um
card por item, filtrando no cliente. `listarVencimentos()` percorre todas as chaves
`nr13_info_`, e para cada uma abre o índice de relatórios e a lista de calibrações — e
roda de novo a cada evento `focus` da janela.

A parte cara já foi resolvida: `FotoImg` só resolve a imagem quando ela entra na tela,
via `IntersectionObserver` com margem de 300 px e rede de segurança de 1,2 s. O que sobra
é o custo de DOM e de CPU: 1.000 equipamentos são 1.000 cards montados e ~3.000
`JSON.parse` por recálculo de vencimentos.

Como o cache já está inteiro em memória (Map), **não é preciso paginação de servidor** —
basta virtualizar a lista e memoizar o cálculo de vencimentos por identidade de valor
(`lerCru()` já existe exatamente para isso: na v2 o Map devolve a mesma instância de
string enquanto o valor não muda, então a comparação é O(1)).

| Campo | Avaliação |
|---|---|
| Impacto hoje | Nenhum perceptível até ~100 equipamentos |
| Impacto com escala | Tela de equipamentos e Dashboard travam alguns segundos a cada montagem e a cada foco |
| Solução recomendada | Virtualização da lista + memo do cálculo de vencimentos. Busca e filtro continuam no cliente |
| Complexidade | Baixa a média |
| Risco | Baixo — puramente de UI |
| Prioridade | Média |

---

## 🟠 A-08 — Uma só resolução de foto para miniatura de 40 px e folha impressa

**Arquivos:** `src/services/imagem.ts:9` · `src/services/fotos.ts:114`

```ts
export async function salvarFoto(file, escopo, opcoes = {}) {
  const blob = await comprimirParaBlob(file, opcoes.larguraMax ?? 1200, opcoes.qualidade ?? 0.7);
  return salvarArquivo(blob, escopo, 'jpg', 'image/jpeg');
}
```

Toda foto de campo e de equipamento é normalizada para **1200 px de largura, JPEG q0.7**,
e essa mesma variante serve o card do equipamento, a miniatura de componente de 40 px, a
galeria e o relatório A4. Não há thumbnail nem variante de impressão.

A escolha de 1200/0.7 está **bem calibrada para a folha**: a área útil de foto num
registro fotográfico A4 com 4 imagens é ~90 mm de largura, que a 300 dpi pede ~1.060 px.
Ou seja, 1200 px é o valor certo **para imprimir** — e ~30× mais pixels do que uma
miniatura precisa. Reduzir a variante única seria perder leitura de placa, trinca e
corrosão; a saída é gerar uma segunda.

Dois pontos secundários da pipeline:

- `comprimirParaBlob` escala **só pela largura** (`Math.min(1, larguraMax / img.width)`) — uma foto em retrato vira 1200 × 1600, mais alta que o necessário;
- a orientação EXIF não é tratada explicitamente. Funciona porque navegadores modernos aplicam `image-orientation: from-image` por padrão ao desenhar `<img>` em canvas, mas é comportamento herdado, não garantido em código.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Listagens baixam 100–150 KB por card para desenhar 40×40 px |
| Impacto com escala | Egress da tela de equipamentos e de calibrações cresce linearmente com o parque |
| Solução recomendada | Gerar thumbnail (≈320 px q0.6, ~15 KB) no mesmo `salvarFoto`, com path irmão; `FotoImg` ganha modo miniatura. Limitar também pela altura e fixar a orientação em código |
| Complexidade | Baixa — um segundo `toBlob` e um segundo upload |
| Risco | Baixo — ausência de thumb cai na foto cheia, como hoje |
| Compatibilidade com legado | Fotos antigas seguem sem thumb; nada a migrar obrigatoriamente |
| Prioridade | Média |

---

## 🟠 A-09 — Dados de campo existem em três cópias no banco

**Arquivos:** `src/features/relatorios/relatoriosService.ts` (`gravarInspecaoOrigemAtual`)

O mesmo container de inspeção é gravado em três chaves:

- `nr13_docs_<TAG>` — o original, a lista de containers do equipamento;
- `nr13_inspecao_atual` — lida por VERIFICACAO-DOCUMENTACAO, checklist1-3, CHECKLIST-FOTOS;
- `nr13_injecao_atual` — lida por VISUAL-EXTERNO/INTERNO e suas folhas de fotos, TESTE-HIDROSTATICO, ULTRASSOM, CERTIFICADO-CAL-*.

A duplicação existe porque os templates nunca foram uniformes sobre qual chave ler. São
três linhas no Postgres com o mesmo conteúdo, retransmitidas a cada geração de relatório.

No palco o custo foi bem atacado em 14/08/2026: a partição por grupo
(`CHAVE_DA_FOTO_POR_GRUPO`) fez cada foto ser embutida em **uma** das duas chaves em vez
das duas, cortando o consumo pela metade (medido: um container com 8 fotos ia a
11.458 KB, 3,4× o orçamento inteiro). O que sobra é o custo **no banco**, que a partição
não toca.

A correção de verdade é uniformizar a leitura dos templates — trabalho de varredura em
`public/`, mecânico e testável pela suíte que já existe. Enquanto isso não acontece, a
duplicação é uma dívida conhecida e contida, não um defeito ativo.

| Campo | Avaliação |
|---|---|
| Impacto hoje | ~2× o tamanho do container por geração de relatório, no banco e no tráfego |
| Impacto com escala | Proporcional ao volume de inspeções, não ao parque |
| Solução recomendada | Uniformizar os templates para uma chave só e aposentar a segunda, com retrocompatibilidade de leitura |
| Complexidade | Média — 40+ arquivos HTML, mas mudança mecânica e coberta por teste |
| Risco | Médio — template esquecido imprime folha em branco, e a falha é silenciosa |
| Prioridade | Média-baixa |

---

## 🟠 A-10 — O fallback de base64 nunca é retomado depois que a rede volta

**Arquivos:** `rastreabilidadeService.ts:227` · `componentesService.ts:81` · `ProntuarioFabricante.tsx:70`

Nos três caminhos que migraram para o bucket, o `catch` grava o base64 no `app_storage`
como antes:

```ts
} catch {
  // Sem organização ativa ou cofre indisponível: cai no caminho legado
  // abaixo, que ainda grava o PDF no registro. Pesado, porém salvo — perder
  // o certificado do usuário seria muito pior que gastar bytes.
}
```

A decisão está **certa** — perder o certificado que o usuário acabou de anexar é o único
desfecho inaceitável. Mas não existe segunda chance: se o upload falhou por falta de
organização ativa ou cofre indisponível, o registro fica gordo **para sempre**, e um
prontuário de fabricante nessa condição custa até 8 MB por equipamento, rebaixados a cada
hidratação.

Também não há como saber quantos registros estão nessa condição — não há contador nem log.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Desconhecido por falta de medição; potencialmente alto numa conta específica |
| Impacto com escala | Não cresce sozinho, mas cada ocorrência é cara e permanente |
| Solução recomendada | Varredura idempotente em segundo plano: registro com base64 e sem ref → sobe, confirma, valida tamanho/hash, grava a ref, **então** zera o base64 |
| Complexidade | Baixa — o padrão de migração segura já está escrito em `livroAssinatura` |
| Risco | Baixo, desde que a ordem seja respeitada: nunca apagar antes de confirmar |
| Prioridade | Média |

---

## 🟠 A-11 — O painel Admin conta relatórios pela chave que acabou de ser aposentada

**Arquivo:** `supabase/admin_stats.sql:47`

```sql
coalesce(sum(case when b.chave = 'nr13_historico_relatorios'
                  and jsonb_typeof(b.valor::jsonb) = 'array'
             then jsonb_array_length(b.valor::jsonb) end), 0)::int as relatorios
```

Desde a migração de 14/08/2026 o array legado não recebe mais entradas — só encolhe (a
exclusão de relatório é o único caminho que ainda o reescreve). Toda conta migrada vai
reportar um número congelado, e conta nova vai reportar zero.

A função também não mede nada de: tamanho do banco, storage total, egress mensal, nº de
arquivos, nº de PDFs, tamanho médio dos PDFs, nº de fotos, tamanho médio das fotos,
organização que mais consome storage, maiores arquivos, falhas de sincronização, arquivos
pendentes, tempo médio de geração de PDF.

**O sistema é operado hoje sem instrumentação.** Todos os números quantitativos desta
auditoria vieram de medições manuais registradas em comentário de código, feitas depois
de um problema aparecer em produção.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Painel passa a mentir a partir da primeira conta migrada |
| Impacto com escala | Sem observabilidade, nenhum item desta auditoria pode ser priorizado por dado real |
| Solução recomendada | Contar por `chave like 'nr13\_rel\_%'`; acrescentar métricas de storage (`storage.objects`), tamanho por org e pendências |
| Complexidade | Baixa — SQL |
| Risco | Mínimo — função de leitura, com guarda de `role='admin'` |
| Prioridade | Alta (é pré-requisito de priorização) |

---

## 🟠 A-12 — Fotos de campo ainda entram no palco como base64, e degradar custa qualidade

**Arquivos:** `src/services/palco.ts:97` · `ORCAMENTO_DOC = 3.400 KB`

O palco existe porque os templates leem `localStorage` de forma síncrona, então toda
imagem precisa voltar a ser dataURL na montagem do documento. Uma foto de 134 KB de
arquivo custa ~356 KB no palco (×1,33 do base64, ×2 do UTF-16 do navegador). Um container
com 8 fotos já ocupa a maior parte do orçamento de 3.368 KB.

A degradação progressiva funciona e está testada, mas ela **recomprime** — o preço de
caber é qualidade de imagem no documento assinado. Conforme a inspeção cresce, o sistema
silenciosamente entrega folhas com foto em q0.35 / 560 px, ou recusa o documento inteiro.

Isto não tem conserto barato dentro do desenho atual: o teto é do navegador, e a única
saída estrutural é o template deixar de ler `localStorage` e passar a receber a imagem por
outro canal (`postMessage`, ou `<img src>` apontando para a URL assinada do bucket). É a
mesma reescrita de templates do A-04 e deve ser avaliada junto com ela.

| Campo | Avaliação |
|---|---|
| Impacto hoje | Fotos degradadas em relatórios com muitas imagens; documento recusado em casos extremos |
| Impacto com escala | Piora com o tamanho da inspeção, não com o do parque |
| Solução recomendada | Curto prazo: nada (o palco já está bem otimizado). Longo prazo: template lê a imagem por URL assinada, junto com o piloto de PDF vetorial |
| Complexidade | Alta — é reescrita de template |
| Risco | Alto — mexe no que sai impresso |
| Prioridade | Junto com A-04 |

---

## 🟡 A-13 — O array legado `nr13_historico_relatorios` segue no banco

Mantido de propósito como backup e fallback da migração de 14/08/2026 — decisão correta.
Mas ele continua sendo hidratado, continua sendo entregue pelo Portal, e continua ocupando
espaço em toda conta migrada (224 KB medidos numa conta em 13/08). O descarte depende de
confirmar em produção que a conversão fechou (`divergentes` vazio) em todas as
organizações. Item de higiene, não de risco.

**Risco:** médio se apressado — é a única cópia de segurança da migração.
**Prioridade:** depois de A-11 dar visibilidade.

---

## 🟡 A-14 — Conflitos são guardados mas a resolução precisa ser confirmada

`guardarConflito` preserva o lado perdedor em `nr13_conflito_<chave>__<ts>` e o item fica
na fila marcado como `conflito`, aguardando decisão do usuário. O código de `drenar()`
pula explicitamente esses itens ("aguarda decisão do usuário") e referencia uma rota
`/pendencias` onde essa escolha aconteceria. Vale confirmar se ela está completa; sem ela,
o conflito nunca sai da fila — o dado está a salvo, mas o selo da topbar fica
permanentemente em pendência e o IndexedDB acumula.

**Impacto:** nenhuma perda de dado. Ruído permanente na UI.
**Prioridade:** sobe quando houver uso multi-dispositivo real.

---

## 🟡 A-15 — Tombstones e mutações nunca são podados

`app_storage_excluidos` é permanente por desenho — e está certo, é o que torna o piso de
versão à prova de relógio de celular adiantado. Mas `app_storage_mutacoes` guarda uma
linha por mutação já aplicada, **para sempre**, e a store local de tombstones cresce do
mesmo jeito. Existe `coletar_tombstones(p_org, p_dias)` no SQL, mas nada o chama.

**Impacto com escala:** uma linha por escrita, por sempre. Cresce mais rápido que os dados.
**Solução:** retenção de 30–90 dias em `app_storage_mutacoes`, agendada. **Nunca** em `app_storage_excluidos`.
**Risco:** baixo, desde que a janela seja muito maior que a de uma retentativa offline.

---

## 🟡 A-16 — Livros de equipamentos excluídos ficam órfãos no cache (aceito)

Decisão consciente e documentada: `nr13_livro_` é protegido contra exclusão porque a trava
de imutabilidade do banco recusa apagar entrada emitida, e retentar eternamente deixava
"⚠ 1 falha" fixo na topbar. Custo: ~1 KB invisível por equipamento excluído.

**Está certo assim.** Registrado aqui para que ninguém "conserte" isso no futuro sem
entender o motivo.

---

## 🟡 A-17 — Não existe ambiente nem massa de dados para teste de escala

Todos os números conhecidos do sistema vieram de contas reais em produção
(`cmam.caldeiras`, `gabriel.dadona`, `engyuricesar`) — diagnóstico **depois** do problema,
nunca antes. Não há gerador de massa, organização de teste isolada, nem baseline
registrado.

Sem isso, nenhuma fase de implementação pode cumprir a regra de "medir antes/depois". Um
gerador que cria uma org sintética com 100 / 500 / 1.000 equipamentos, N inspeções e M
relatórios é **pré-requisito**, não sobremesa.

**Solução:** script de seed em org dedicada + roteiro de medição (1º carregamento,
sincronizações seguintes, memória do navegador, tamanho do IndexedDB, palco, geração de
PDF, abertura de histórico, Dashboard, pesquisa, requests, egress estimado).
**Complexidade:** média — `demoSeed.ts` já dá o formato.
**Risco:** zero se a organização for isolada e claramente marcada.

---

## 🟡 A-18 — Teste de carga precisa de PostgREST e Storage no roteiro, não só de conexões

Contar conexões do Supabase não diz nada útil. Pelo desenho atual, o que vai saturar
primeiro, nesta ordem:

1. **CPU do Postgres** na varredura da hidratação, enquanto A-03 não for corrigido;
2. **Egress do Storage**, dominado pelo tamanho dos PDFs (A-04);
3. **PostgREST** no pico de boot, quando muitos usuários abrem o app ao mesmo tempo.

O roteiro de carga deve exercitar `login → hidratação → Dashboard → salvar → abrir PDF`,
com uma fração baixa (10–20%) abrindo PDF, que é o cenário real.

**Depende de:** A-17 (massa) e A-11 (medição).
**Prioridade:** última — medir arquitetura instável não gera número útil.

---

# 3. O que já está correto e não deve ser mexido

Verificado nesta auditoria. Vários destes pontos são contraintuitivos e existem por causa
de um defeito real já pago — mexer sem entender o porquê reintroduz o defeito.

1. **Nada é apagado por ausência.** A regra que faltava na v1. Só tombstone explícito remove. Foi o apagar-por-ausência que transformava qualquer falha de rede ou de cota em sumiço de dado.
2. **Dado e fila na mesma transação.** `gravarAtomico` resolve no `tx.oncomplete`, nunca no `onsuccess`. Dado sem fila nunca sobe; fila sem dado sobe lixo.
3. **Idempotência por `mutationId`.** Reenvio devolve o resultado anterior sem reaplicar. "Tentar de novo" retoma o item existente e nunca cria um segundo.
4. **Conflito detectado sob `FOR UPDATE`.** Comparação versão-esperada na RPC. As duas versões sobrevivem; nenhuma é descartada sem alguém escolher.
5. **Marca d'água avança só no fim.** Falha na página 2 não faz a marca dizer que a organização inteira foi lida. Ordenação composta `(atualizado_em, chave)` torna a paginação determinística.
6. **Drenagem por `visibilitychange`.** No celular a rede volta com a aba em segundo plano e nenhum evento `online` chega. Vale para a fila de dados e para a de arquivos.
7. **Pendência vem do cofre, não do `navigator.onLine`.** Estar online não significa que o servidor aceitou. Estado falso de "salvo" foi eliminado (bug medido com upload devolvendo 500 com o navegador online).
8. **Caminho do arquivo decidido antes da rede.** O registro pode ser salvo agora, com path definitivo, e o upload acontecer horas depois. Nome UUID e imutável — nunca sobrescreve, então cache de navegador e CDN não servem imagem trocada.
9. **Relatório finalizado é arquivo, não receita.** `pdfRef` + SHA-256 + bucket privado. Editar ficha, conclusão ou template não altera documento emitido. E **não há retrofit automático** — gerar o PDF ao abrir um relatório antigo produziria um documento com os dados de hoje carimbado como o artefato daquela emissão.
10. **Livro lacrado em cadeia, com trava no banco.** Serialização canônica (chaves ordenadas, sem os campos do lacre), `shaAnterior` como elo, e um trigger que recusa editar, apagar ou reordenar. Detectar e impedir são coisas diferentes, e as duas existem.
11. **Rubrica endereçada pelo conteúdo.** Mesmo SHA → mesmo arquivo → N referências. A imutabilidade histórica vira consequência do endereço, não de alguém lembrar de preservá-la. **É o padrão a estender (A-05).**
12. **Índice de histórico é derivado e reparável.** Perder o índice numa corrida entre aparelhos custa uma listagem mais lenta, nunca o relatório. `listarIndice` reconstrói a partir dos registros.
13. **Três camadas de somente-leitura no relatório salvo.** DOM (`contenteditable=false` + bloqueio em captura + MutationObserver), `sb-storage.js` com `ro=1` (não grava), e a ponte que não drena. A de DOM é burlável pelo DevTools; a de dados é que protege — e as três existem.
14. **Lazy loading de imagem já implementado.** `FotoImg` resolve por `IntersectionObserver` com margem de 300 px e rede de segurança de 1,2 s. Abrir uma lista de 38 cards não dispara 38 downloads.
15. **Isolamento entre organizações.** Banco por org no IndexedDB, `org_id` em toda policy, primeira pasta do bucket = org, canal de `BroadcastChannel` com a org no nome. Íntegro. (O problema do A-01 é **dentro** da org.)
16. **Palco com orçamento, trava e rollback.** Materialização tudo-ou-nada com restauração dos valores anteriores. Relatório pela metade sai impresso com folha faltando e ninguém percebe — por isso é recusado inteiro.
17. **Varredura de templates virou teste.** `palco.varreduraTemplates.test.ts` varre `public/` e quebra se aparecer chave nova sem cobertura. A conferência manual que já custou quatro defeitos silenciosos agora é automática.
18. **Migrações aditivas e idempotentes.** Nada apaga legado antes de validar. `migrarHistoricoRelatorios` confere a contagem por equipamento e reporta divergência em vez de passar em silêncio.

---

# 4. Leitura contra os objetivos de arquitetura definidos

| Objetivo final | Situação | O que falta |
|---|---|---|
| Postgres = dados estruturados e referências leves | 🟠 Quase lá | Rubrica, logo e o base64 de fallback (A-05, A-10) |
| Bucket = PDFs, fotos, certificados, arquivos pesados | 🟢 Feito | Faltam thumbnails (A-08) e inventário de órfãos (A-06) |
| IndexedDB = cache/offline em Blob | 🟢 Feito | Poda de mutações antigas (A-15) |
| localStorage = apenas dados pequenos | 🟠 Quase lá | Sistema principal, sim. Portal do Cliente, não (A-02) |
| Base64 persistente ≈ zero | 🟠 Quase lá | Rubrica, logo, snapshots e fallback (A-05, A-10) |
| PDF preferencialmente vetorial/híbrido | 🔴 Não iniciado | Tudo. Precisa de piloto controlado (A-04) |
| Fotos otimizadas antes de persistir, online e offline | 🟢 Feito | 1200 px q0.7, mesmo caminho nos dois modos. Falta variante de miniatura (A-08) |
| Histórico imutável, versionado e leve | 🟢 Feito | Snapshots ainda copiam imagem (A-05) |
| Listagens = índices leves + paginação | 🟠 Metade | Índice leve, sim. Paginação/virtualização, não (A-07) |
| Arquivos pesados carregados sob demanda | 🟢 Feito | Nada |
| Sincronização incremental | 🟠 Feita, sem índice | A-03 |
| Dados antigos compatíveis | 🟢 Feito | Nada |
| Migrações seguras e idempotentes | 🟢 Feito | Nada |
| Observabilidade | 🔴 Inexistente | A-11, A-17 |
| Segurança / isolamento | 🔴 Furo entre clientes | A-01 |

---

# 5. Nota sobre o próximo passo

Este documento é **só o diagnóstico**. Nenhum arquivo, banco, template ou deploy foi
tocado. O plano de implementação em fases é um passo separado.

A única recomendação de sequência já firmada: **A-01 não deve entrar em fase nenhuma**.
É correção de segurança e vai sozinha, antes de tudo.
