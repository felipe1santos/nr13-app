# FASE 6 — Recuperação / aposentadoria segura do fallback base64

**Achado:** A-10. **Plano macro:** `2026-08-15-evolucao-arquitetura.md`, linhas 1668–1800.
**Portão:** nenhum fecha aqui (P3 fechou na Fase 4; o próximo é P4, na Fase 7).

> **REGRA DA FASE, acima de qualquer meta de bytes:**
> **nenhum base64 é removido antes de existir cópia durável e CONFIRMADA no destino novo.**

---

## Estado atual da fase

`🔵 PLANEJAMENTO / BASELINE` — **nada implementado, nada alterado.**

| Etapa | Estado |
|---|---|
| Ler a Fase 6 no plano macro | ✅ FEITO (20/08) |
| Reler achados e planos antigos de migração de arquivos | ✅ FEITO |
| Inventário global de base64 no código | ✅ FEITO |
| Medir base64 persistido em dados reais | ✅ FEITO (org de teste; limite declarado) |
| Classificar cada ocorrência (A–E) | ✅ FEITO |
| Criar o task-level | ✅ FEITO (este arquivo) |
| Apresentar o plano ao dono | 🔄 EM CURSO |
| **Implementar** | ⛔ **NÃO AUTORIZADO** |

---

## AS-IS

### A descoberta que muda o plano: o mecanismo já existe e já roda

O plano macro descreve criar `recuperacaoArquivos.ts` do zero. **Não precisa.**
`migrarRubricasDoLivro` (`livroAssinatura.ts:129`) **já implementa exatamente a ordem exigida**,
já é idempotente, já é chamada em background por `migrarRubricasEmSegundoPlano`
(`RotaProtegida.tsx:69`) e já tem testes.

```
para cada entrada com base64 e SEM ref:
  1. converter dataURL → Blob
  2. salvarArquivoPorConteudo()        → cofre local + tentativa de upload
  3. if (!ref || await arquivoPendente(ref.path)) → ADIA, base64 fica onde está
  4. só então: { ...resto (sem assinaturaImg), assinaturaRef: ref }
```

O passo 4 é **uma escrita só**: ou o registro ganha a ref e perde o base64 ao mesmo tempo, ou
nada muda. E entrada **lacrada** (`sha256` presente) é pulada — trocar o campo mudaria o hash e
a entrada passaria a se denunciar como adulterada.

**A Fase 6 deve GENERALIZAR esse padrão para as 3 famílias do A-10, não reinventá-lo.**

### Onde o base64 nasce — os 3 pontos de fallback (A-10)

Os três têm a mesma forma: tenta o bucket, e no `catch` grava o base64 no registro.

| Serviço | Chave | Campo | Linha do `catch` |
|---|---|---|---|
| `rastreabilidadeService.salvarRastreabilidade` | `nr13_rastreab_<id>` | `pdfBase64` | `:227` |
| `componentesService` | `nr13_componentes_cal_<TAG>` | `foto` | `:81` |
| `ProntuarioFabricante.salvarProntuarioFabricante` | `nr13_pront_fab_<TAG>` | `pdfBase64` | `:70` |

**O fallback continua existindo.** Perder o certificado que o usuário acabou de anexar é o
único desfecho inaceitável. Esta fase só acrescenta a **segunda chance**.

---

## Inventário de base64

Varredura de `src/` por `data:image`, `data:application`, `base64`, `readAsDataURL`,
`toDataURL`, `atob`, `btoa`: **111 ocorrências em 37 arquivos.** Classificadas por **função**,
não por palavra.

| # | Local | Tipo | Quem produz | Quem consome | Persiste? | Onde | Única cópia? | Pode remover? | Fase |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rastreabilidadeService.ts:227` | **C** | `catch` do upload | `resolverPdf`, folhas de calibração | **SIM** | `app_storage` | **SIM, até migrar** | só depois de confirmar a ref | **6** |
| 2 | `componentesService.ts:81` | **C** | `catch` do upload | `FotoImg`, Portal | **SIM** | `app_storage` | **SIM, até migrar** | idem | **6** |
| 3 | `ProntuarioFabricante.tsx:70` | **C** | `catch` do upload | visualizador do prontuário | **SIM** | `app_storage` | **SIM, até migrar** | idem | **6** |
| 4 | `livroAssinatura.ts` — `assinaturaImg` **sem lacre** | **B** | rubrica legada | `LIVRO-REGISTRO.html` | SIM | `app_storage` | sim, até migrar | **já migra sozinho** | ✅ pronto |
| 5 | `livroAssinatura.ts` — `assinaturaImg` **lacrada** (`sha256`) | **B** | rubrica legada | idem | SIM | `app_storage` | **SIM** | **NUNCA** — mudaria o hash da entrada | — |
| 6 | `MinhaEmpresa.tsx:34/38` → `nr13_minha_empresa.logo` | **D** | `comprimirImagem` (300 px) | todos os templates | **SIM** | `app_storage` | **SIM** | **não nesta fase** | **7** |
| 7 | `Funcionarios.tsx` → `nr13_lista_phs[].assinatura` | **D** | `processarAssinatura` (PNG 500 px) | motores de assinatura | **SIM** | `app_storage` | **SIM** | **não nesta fase** | **7** |
| 8 | `nr13_rel_<id>_<TAG>.meta.empresa.logo` e `meta.assinantes[].assinatura` | **D** | snapshot do §7-bis | relatório reaberto | **SIM** | `app_storage` | **SIM** — é o congelamento daquela emissão | **não** — §7-bis + §7-quater | **7** |
| 9 | `nr13_fotos_<TAG>[].src` e containers `.base64` | **B** | fotos anteriores a 10/08 | `resolverFoto` (I-26) | SIM | `app_storage` | sim | **não** — compatibilidade permanente | — |
| 10 | `palco.hidratarFotosDoBucket` | **E** | palco | os 41 templates | **NÃO** | `localStorage` do palco, apagado ao fim | não | n/a — é o desenho | — |
| 11 | `recompressorFoto.ts` | **E** | degradação do palco | idem | **NÃO** | idem | não | n/a | — |
| 12 | `fotos.blobParaDataUrl` | **A** | conversão | palco/templates | **NÃO** | memória | não | n/a | — |
| 13 | `pdfService`/`printService` — `canvas.toDataURL` | **A** | rasterização | jsPDF | **NÃO** | memória | não | n/a | — |
| 14 | `atob()` em 6 arquivos | **A** | dataURL → bytes | upload/download | **NÃO** | memória | não | n/a | — |
| 15 | `certificadoUpload.ts` | **A** | só constantes de limite | validação | **NÃO** | — | não | n/a | — |
| 16 | `pdfStore.ts` / `fotoStore.ts` (IndexedDB) | — | guardam **Blob**, não base64 | cofre offline | SIM (Blob) | IndexedDB | é cópia durável | **NÃO MEXER** | — |
| 17 | `adminMetricas.ts` — `chaves_base64`/`bytes_base64` | — | métrica da Fase 2 | painel Admin | não | — | não | n/a | 2 ✅ |

**Nenhuma meta de "zero ocorrência da palavra base64".** Os itens **A** e **E** são legítimos e
permanecem: sem eles os templates HTML, o canvas e o jsPDF não funcionam.

---

## Baseline

**Organização de teste `99f642d3`, 20/08/2026, leitura direta do `app_storage`.**
Nenhum conteúdo codificado foi registrado — só chave, família, tamanho e data.

| | |
|---|---|
| Chaves na organização | **91** |
| Conteúdo total | **542,7 KB** |
| Chaves contendo base64 | **17** |
| **Bytes de base64** | **≈ 476,0 KB — 88 % do conteúdo** |

### Por família

| Família | Registros | KB totais | Com base64 | KB de base64 | Classificação |
|---|---|---|---|---|---|
| `nr13_rel_` | 15 | 458,5 | **11** | **421,5** | **D — Fase 7**, e imutável (§7-bis) |
| `nr13_livro_` | 3 | 23,2 | 1 | 16,5 | **B** — migração já existe |
| `nr13_historico_relatorios` | 1 | 9,6 | 1 | 7,6 | legado (10A/10B) |
| `nr13_minha_empresa` | 1 | 7,7 | 1 | 7,6 | **D — Fase 7** |
| `nr13_prontuario_atual` | 1 | 8,6 | 1 | 7,6 | **D** (logo copiada) |
| `nr13_prontuario_<TAG>` | 1 | 8,6 | 1 | 7,6 | **D** (logo copiada) |
| `nr13_relatorio_meta_atual` | 1 | 8,8 | 1 | 7,6 | **D** (logo copiada) |
| **`nr13_rastreab_`** | **0** | — | — | — | **A-10** |
| **`nr13_componentes_cal_`** | **0** | — | — | — | **A-10** |
| **`nr13_pront_fab_`** | **0** | — | — | — | **A-10** |

### O resumo que o dono pediu

```
Persistido pesado:            17 chaves / ~476 KB   (88 % do app_storage da org)
Já possui equivalente Storage: 0 dos persistidos    (nenhum é redundante hoje)
ÚNICA CÓPIA:                  17 de 17             ← TODOS. Nada pode ser apagado agora.
Temporário legítimo (A/E):    ~8 pontos do código  (palco, canvas, conversões)
Pertence à FASE 7:            15 chaves / ~459 KB  (96 % do base64 desta org)
Compatibilidade legado (B):    2 chaves / ~24 KB
PRECISA MIGRAR nesta fase:    0 registros nesta organização
```

### Os dois limites desta medição — declarados

1. **Só enxergo a organização de teste.** A RLS restringe o mestre à própria org. O número da
   base inteira exige `admin_usage_stats()` (que já devolve `chaves_base64`/`bytes_base64`,
   entregue pela Fase 2) e **a conta de admin da plataforma**, que não é a que uso.
   Referência independente: o baseline de 16/08 mediu **81 % do `app_storage` em base64** na
   base toda, e **79 %** na maior organização real.
2. **A org de teste não tem NENHUM registro das 3 famílias do A-10.** Não há massa aqui. Ela
   terá de ser **criada** forçando o fallback (teste manual 1 do plano macro), e o número real
   de registros em fallback na produção só sai pelo painel do Admin.

> **Consequência honesta para o planejamento:** medido no dado que consigo ler, **a Fase 6 não
> tem trabalho a fazer nesta organização** — o base64 que existe aqui é de logo, rubrica e
> snapshot de relatório, tudo da **Fase 7** ou intocável. O valor da Fase 6 é a **rede de
> segurança**: o dia em que um upload falhar no campo, o registro volta sozinho.

---

## Classificação — resumo

| Classe | O que é | Quantos pontos | Destino |
|---|---|---|---|
| **A** | temporário legítimo (canvas, conversão, jsPDF) | ~6 | permanece |
| **B** | compatibilidade/legado ainda lido | 3 famílias | permanece legível para sempre (I-26) |
| **C** | **persistido indevidamente — o alvo desta fase** | **3 serviços** | migrar quando ocorrer |
| **D** | pertence à Fase 7 (logo, rubrica, snapshots) | 4 famílias | **mapeado, não tocado** |
| **E** | necessário ao palco/template, não persistido | 2 módulos | permanece |

---

## Arquitetura proposta

**Generalizar o que já funciona**, em vez de escrever um segundo mecanismo.

```
src/services/recuperacaoArquivos.ts        ← NOVO: o motor genérico
  ├─ recebe uma DESCRIÇÃO por família:
  │    { prefixo, campoBase64, campoRef, escopo, ext, mimeType, ehIntocavel? }
  ├─ para cada registro com base64 e SEM ref:
  │    1. dataURL → Blob
  │    2. salvarArquivo()            (cofre local + tentativa de upload)
  │    3. arquivoPendente(path) === false ?  senão ADIA, sem tocar no registro
  │    4. validar tamanho (e hash quando houver)
  │    5. UMA escrita: { ...registro, <campoBase64>: '', <campoRef>: ref }
  └─ throttle: no máximo 3 registros por sessão, com pausa

Gatilho: RotaProtegida, ao lado de migrarHistoricoEmSegundoPlano e
         migrarRubricasEmSegundoPlano — o mesmo lugar, o mesmo padrão.

Guardas: if (bloqueadoParaEscrita()) return     ← Portal e assinatura vencida
         if (!navigator.onLine) return          ← só como atalho barato; a decisão
                                                  real é sempre o passo 3
```

**Decisões:**

| # | Decisão | Porquê |
|---|---|---|
| D6-1 | **Reusar o padrão de `migrarRubricasDoLivro`**, não criar um segundo | Já é idempotente, já confirma no servidor, já está em produção e testado |
| D6-2 | O fallback dos 3 serviços **continua existindo, sem alteração** | Perder o arquivo do usuário é pior que qualquer byte |
| D6-3 | Passo 5 é **uma escrita só** | Ou ganha a ref e perde o base64 juntos, ou nada muda |
| D6-4 | Confirmação por **`arquivoPendente() === false`**, nunca por `navigator.onLine` | I-14 — a flag mente (comprovado na validação offline da Fase 5) |
| D6-5 | **Logo, rubrica e snapshots de relatório NÃO são tocados** | Fase 7; e os snapshots são imutáveis por §7-bis |
| D6-6 | Entrada de livro **lacrada** nunca é convertida | Mudaria o `sha256` e a entrada se denunciaria como adulterada |
| D6-7 | Rastreabilidade: a recuperação **não** cria versão nova nem marca `substituidoEm` | É a mesma versão; só o arquivo muda de lugar |
| D6-8 | **Blob em IndexedDB não é alvo** | É cópia durável e é a base do offline validado na Fase 5 |

---

## Estratégia de migração

**Aditiva, nesta ordem, sem exceção:**

```
origem base64  →  bytes  →  Storage  →  CONFIRMAR upload  →  validar tamanho/hash
               →  gravar a nova referência  →  confirmar leitura pelo caminho novo
               →  só então a origem antiga deixa de existir (na MESMA escrita)
```

**Nunca** `base64 → apagar → tentar subir depois`.

**Idempotência:** registro que já tem ref é pulado antes de qualquer trabalho. Para a rubrica,
o path é o SHA-256 do conteúdo, então reenviar o mesmo desenho não cria arquivo novo. Para as
famílias do A-10, o path é UUID — a idempotência vem do **pulo**, não do endereço.

**Interrupção segura:** a varredura é uma sequência de operações independentes. Fechar a aba
deixa os convertidos convertidos e os demais exatamente como estavam.

---

## Tarefas

- [ ] **T1** — `recuperacaoArquivos.ts`: motor genérico por descrição de família
- [ ] **T2** — Descrições das 3 famílias do A-10 (`nr13_rastreab_`, `nr13_componentes_cal_`, `nr13_pront_fab_`)
- [ ] **T3** — Gatilho em `RotaProtegida` com throttle e guarda de somente leitura
- [ ] **T4** — `recuperacaoArquivos.test.ts` (ver `## Testes`)
- [ ] **T5** — Massa de teste: forçar o fallback em produção com a rede bloqueada, e recuperar
- [ ] **T6** — Medição antes × depois e fechamento

---

## Testes

Os 14 pedidos pelo dono, mais os do plano macro:

- [ ] base64 legado migra com sucesso → registro com ref e campo base64 vazio
- [ ] **falha de upload não apaga a origem** → registro byte a byte igual
- [ ] **falha ao gravar a referência não apaga a origem**
- [ ] confirmação (`arquivoPendente`) falha → registro intacto
- [ ] validação de tamanho falha → registro intacto
- [ ] retry é idempotente → segunda execução não duplica arquivo nem referência
- [ ] registro já migrado é **pulado** sem trabalho
- [ ] arquivo novo é legível pelo caminho novo
- [ ] a referência aponta para o arquivo certo (conteúdo conferido)
- [ ] offline: a varredura **não roda**
- [ ] registros NOVOS não criam base64 persistido
- [ ] compatibilidade: registro antigo continua legível durante todo o processo
- [ ] relatório arquivado (`pdfRef`) **imutável**
- [ ] relatório legado sem `pdfRef` continua remontando
- [ ] **nenhuma exclusão por ausência**
- [ ] **nenhum dado perdido em nenhum cenário**
- [ ] conta somente leitura → não roda
- [ ] throttle: no máximo N por sessão
- [ ] rastreabilidade: não cria versão nova nem marca `substituidoEm`
- [ ] entrada de livro lacrada nunca é convertida

---

## Critérios de aceite

- [ ] Registro em fallback é convertido em condições normais, **provado em produção**
- [ ] Em **toda** falha simulada, o registro fica **byte a byte** como estava
- [ ] **Zero** documentos perdidos em qualquer cenário — invariante da fase
- [ ] Nenhum base64 de logo, rubrica ou snapshot de relatório foi tocado
- [ ] Contador de base64 do painel Admin reflete a queda (quando houver massa)
- [ ] Suíte verde, build limpo

---

## Riscos

| # | Risco | Gravidade | Contenção |
|---|---|---|---|
| R6-1 | Apagar base64 sem cópia durável | **crítica** | D6-3 + D6-4: escrita única, e só depois de o **servidor** confirmar |
| R6-2 | Tocar em snapshot de relatório e quebrar a imutabilidade | **alta** | D6-5: famílias `nr13_rel_` fora da lista, por construção |
| R6-3 | Converter entrada de livro lacrada | **alta** | D6-6, já implementado e testado |
| R6-4 | Recuperação consumir a banda do usuário sem ele pedir | média | throttle de 3 por sessão, com pausa |
| R6-5 | Dois aparelhos convertendo o mesmo registro | baixa | o segundo encontra a ref e pula; corrida vira conflito na RPC (I-04) |
| R6-6 | **Não haver massa para testar** | **certa** | T5: criar o fallback de propósito com a rede bloqueada |
| R6-7 | Otimizar a Fase 7 por engano | média | a lista de famílias é explícita; teste que falha se `nr13_rel_`, `nr13_minha_empresa` ou `nr13_lista_phs` entrarem nela |

---

## Rollback

Reverter os commits. **Registros já convertidos permanecem convertidos, e isso é seguro** —
a leitura por referência já existe hoje (`resolverPdf`, `resolverFoto`,
`resolverPdfFabricante` já preferem a ref). Nenhum passo é destrutivo, então não há estado
a desfazer.

---

## Achado `EQUIPE TESTE` — relação verificada, NÃO corrigida

Verificado durante o inventário, como o dono pediu.

A chave legada `nr13_historico_relatorios` **contém base64** (7,6 KB nesta org). Mas a causa
do defeito é outra: `migrarHistoricoEmSegundoPlano` recria as chaves de um equipamento
excluído com `versaoBase 0`, o servidor recusa por `versao_obsoleta`, e o ciclo repete a cada
boot. **O base64 é passageiro dentro do valor, não a causa.**

> **Sem relação direta com o fallback A-10. Permanece na Fase 10B (legado). Não corrigido
> aqui, conforme instrução.**

---

## Log de execução

| Quando | O quê | Estado |
|---|---|---|
| 20/08 | Fase 5 aprovada e fechada pelo dono; Fase 6 autorizada **só para planejamento** | ✅ |
| 20/08 | Fase 6 do plano macro lida (linhas 1668–1800) | ✅ |
| 20/08 | Inventário: 111 ocorrências em 37 arquivos, classificadas A–E por função | ✅ |
| 20/08 | **Achado:** o motor da fase **já existe** (`migrarRubricasDoLivro`) e **já está ligado** no `RotaProtegida` | ✅ |
| 20/08 | Baseline na org de teste: 17 chaves / ~476 KB / 88 % do `app_storage`; **96 % é Fase 7** | ✅ |
| 20/08 | **A-10 tem ZERO registros nesta organização** — a massa terá de ser criada | ✅ |
| 20/08 | `EQUIPE TESTE`: relação verificada, **sem vínculo** com o fallback; segue na 10B | ✅ |
| 20/08 | Task-level criado | ✅ |

---

## Ponto de retomada

**Plano pronto. NADA implementado. Aguardando aprovação do dono.**

Três pontos precisam de decisão antes de qualquer código:

1. **D6-1** — reusar o padrão de `migrarRubricasDoLivro` (generalizando-o) em vez de escrever
   `recuperacaoArquivos.ts` do zero, como o plano macro previa?
2. **T5** — autorizo criar massa de fallback de propósito na conta de teste (anexar certificado
   com a rede bloqueada) para poder testar a recuperação de ponta a ponta?
3. **Escopo** — confirmar que logo, rubrica e snapshots de `nr13_rel_` ficam **integralmente**
   para a Fase 7, mesmo sendo 96 % do base64 medido.

**Não iniciar a Fase 7.**
