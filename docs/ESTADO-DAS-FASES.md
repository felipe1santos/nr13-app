# ESTADO DAS FASES — porta de entrada

> **Abra este arquivo primeiro.** Ele diz em que ponto o projeto está e para onde ir. Cada
> linha aponta para o task-level onde mora o detalhe.
>
> **REGRA:** este arquivo é atualizado NO MOMENTO em que o estado muda — commit, push,
> redeploy, validação, portão. Não no fim da fase.

**Última atualização:** 04/09/2026 — **FASE 12B ENTREGUE ✅** (modelo Clássico/Novo por empresa + visualizador próprio) · **FASE 12 CONCLUÍDA ✅** · hardening final fechado: `portal_cliente` republicada e conferida por SHA, Portal validado, abertura do documento emitido independente do palco e do dado vivo (5 testes bloqueantes), validação no navegador contra o bundle publicado e **inventário dos geradores reais** de documento.
**Branch:** `main` · **Suíte:** 1829 testes / 152 arquivos, 0 falhas · **Build:** verde

> ### 🔖 VOLTANDO DEPOIS DE UMA PAUSA? Leia [`PONTO-DE-RETOMADA.md`](PONTO-DE-RETOMADA.md).
> Ele tem o estado de produção, o que falta decidir (a **9D**) e **todos os endereços de acesso** —
> sistema, Supabase e Coolify.


## ✅ FASE 12B — ENTREGUE (04/09/2026) · MODELO CLÁSSICO/NOVO + VISUALIZADOR PRÓPRIO

| | |
|---|---|
| escolha | **Clássico / Novo** em "Minha Empresa". A tela não diz raster, vetorial, motor nem engine — a tradução 1:1 vive só em `features/relatorios/modeloDocumento.ts` |
| escopo | `nr13_modelo_relatorio` é chave GLOBAL, e no v2 global já é POR ORGANIZAÇÃO (IndexedDB por org + RLS). Nenhum mecanismo novo de configuração |
| herança | sem a chave nova, o modelo vem do `nr13_motor_pdf` que a org já tinha — a org virada em 04/09 apareceu marcada em **Novo** sozinha |
| congelamento | `modeloDocumento` é carimbado no NASCIMENTO do rascunho. Trocar a configuração depois não altera rascunho em andamento; duplicar nasce com o modelo atual |
| prova A/B/C/D | Clássico → **387.670 B, 1 imagem, 0 fonte**; Novo → **32.219 B, 0 imagem, 4 FontFile2**; rascunho "novo" finalizado com a empresa em Clássico saiu **vetorial**; cada histórico serviu o próprio pdfRef com SHA conferido |
| visualizador | pdf.js (o mesmo que o `printService` já usava): **miniaturas fechadas**, botão ☰ Páginas, barra de **38px**, ajuste à largura, zoom, render preguiçoso. Sem rolagem horizontal em 1.396px nem em 585px |
| também | "Configurações" some no documento arquivado; finalizar já entrega o ARQUIVO na tela (antes, "Imprimir" logo após finalizar rasterizava a prévia) |
| detalhe | `medicoes/2026-09-04-fase12b-modelo-e-visualizador.md` |

---

## ✅ FASE 12 — CONCLUÍDA (04/09/2026) · HARDENING FINAL

| | |
|---|---|
| Edge | **`portal_cliente` republicada** pelo dashboard. `prefixos.ts` no servidor voltou com o SHA-256 do repo (`acf3b6f1…82a8f`, 7.558 B) e `index.ts` ficou intocado (`7da703c6…cabf`). Repo × produção deixaram de divergir. Boot provado: a função responde `{"erro":"Token inválido"}` — mensagem dela, não do gateway |
| Portal | 6 provas passando: `nr13_pront_emitido_` negada, `nr13_livro_rascunho_` negada, `nr13_livro_` permitida, TAG alheia negada, relatório legado permitido, pedido misto devolvendo só a chave oficial. Acesso descartável criado e removido pelo fluxo oficial |
| abrir emitido | `bytesDaEmissao` recebe só o REGISTRO e serve o `pdfRef`: **não** chama gerador, não monta folha, não lê dado vivo do equipamento, não grava e não disputa a trava do palco |
| imutabilidade | **5 testes bloqueantes** — serve os bytes e nada mais; abrir N vezes não muda a lista; não altera `sha256`/`pdfRef`; abre com o storage VAZIO; sem arquivo resolvido **ERRA** em vez de remontar calado |
| validação no navegador | contra `index-BhysF4YM.js`: emissão aparece, abre **após reload**, quantidade continua **1**, mesmo `pdfRef`, mesmo SHA (`a0d74335…`), **71.426 bytes** nas duas aberturas, `%PDF-1.3` com 6 páginas. `nr13_motor_prontuario = vetorial` e `nr13_motor_pdf = vetorial` (versão 1, timestamp de antes — o relatório não foi afetado) |
| inventário | **A** relatório + prontuário (vetoriais) · **B** certificados, Livro, capa, termo, históricos (fora por decisão) · **C** 8 itens. Achado extra: **6 folhas órfãs** em `public/arquivos-prontuario/` com ZERO referências em `src/` — registradas em `PENDENCIAS.md` como código morto candidato à Fase 13, **não removidas** |
| impressão | **IMPRIMIR passa a servir o ARQUIVO.** Regra única em `features/documentos/fonteImpressao.ts`: com `pdfRef` → arquivo; sem → **prévia**, e o botão diz "Imprimir pré-visualização". O relatório já fazia isso (o item C-1 do inventário estava errado); o **prontuário** era o caso real e foi corrigido, inclusive o Ctrl+P nativo (a pré-rasterização deixa de rodar quando há emissão). **11 testes** provam que VISUALIZAR, BAIXAR e IMPRIMIR pedem o mesmo `pdfRef` e que imprimir não escreve nada |
| detalhe | `medicoes/2026-09-04-fase12-hardening.md` (§9 para a impressão) |

---

## ✅ FASE 12A — CONCLUÍDA (04/09/2026) · PRONTUÁRIO VETORIAL É O PADRÃO

| | |
|---|---|
| o que mudou | o prontuário deixou de ser só IMPRESSO e passou a ser **EMITIDO**: bytes → SHA-256 → Storage → `pdfRef`. Antes, cada impressão remontava as 6 folhas com dados VIVOS, e duas impressões da mesma TAG podiam sair diferentes sem ninguém perceber |
| motor | `nr13_motor_prontuario = vetorial`, **chave separada** da do relatório — rollback de um não arrasta o outro |
| prova pós-virada | emissão pelo fluxo normal, **sem `?motorPront=` e sem `?piloto=`**: `motor: "vetorial"` gravado, 6 páginas, 71.426 bytes, upload 200, `pdfPendente:false`, SHA conferido contra o bucket, reabertura servindo o MESMO arquivo |
| economia | 2,27 MB → 70 KB (**−97%**) e ~4,5× mais rápido |
| imutabilidade | `nr13_pront_emitido_<TAG>` é uma LISTA: emitir de novo **acrescenta revisão**, nunca sobrescreve um `pdfRef` gravado |
| defeitos achados pela conferência | data de emissão e Nº fora do corpo; bairro/CEP fora do rodapé; **croqui saindo esticado** (proporção não enviada à primitiva); colisão de id de revisão no mesmo milissegundo |
| rollback | `definirMotorProntuario('atual')` — gerador antigo, testes e seleção de motor **todos preservados** |
| fora do escopo, não tocados | Livro, capa do Livro, termo de abertura, certificados, registros trancados, PDFs históricos e o motor do RELATÓRIO |
| detalhe | `medicoes/2026-09-04-fase12-piloto-prontuario.md` e `medicoes/2026-09-04-fase12a-virada.md` |

---

## ✅ FASE 11 — CONCLUÍDA (04/09/2026) · O VETORIAL VIROU O PADRÃO

| | |
|---|---|
| o que é | o relatório deixou de ser uma FOTOGRAFIA das folhas e passou a ser **desenhado**: texto real selecionável, Carlito embutida (4 subsets CID), tabelas e gráfico do teste hidrostático em vetor, A4 exato |
| virada | `nr13_motor_pdf = {motor:'vetorial'}`, gravado pela RPC oficial de mutação. **Padrão GLOBAL da organização** — nenhum parâmetro de URL é necessário |
| prova pós-virada | relatório novo finalizado pelo fluxo normal, **sem `?motor=` e sem `?piloto=`**: `REL-1788535532968`, 12 páginas, **48.685 bytes** (~4 KB/página). Upload 200, `pdfPendente:false`, SHA e tamanho conferidos, reabertura servindo o MESMO arquivo com **0 templates remontados** |
| o que o vetorial economiza | um relatório completo caiu de **7,47 MB / 22,6 s** para **0,65 MB / 1,8 s**; no cenário simples, **97,9% menor** e 25× mais rápido |
| históricos | os 3 relatórios raster já arquivados foram baixados e conferidos: **bytes, SHA, páginas e `pdfRef` idênticos**. Trocar o motor alcança SÓ novas finalizações (§7-quater) |
| rollback | `definirMotorPdf('raster')` — o gerador raster **não foi removido** (segue no bundle) e `?motor=raster` continua forçando-o, provado emitindo em 04/09 |
| Edges | `admin` (`f6e0629`) e `portal_cliente` (`6225581`) publicadas pelo **dashboard** e conferidas por SHA-256 contra o repo. Portal validado: Livro oficial permitido, `nr13_livro_rascunho_*` negado, TAG alheia negada, relatório legado abrindo |
| gate pendente | **impressão física** — esta máquina não tem impressora. É gate manual, não falha técnica |
| detalhe | `medicoes/2026-09-04-fase11-hardening.md` e `medicoes/2026-09-04-fase11-e2e-producao.md` |

---

## ✅ FASE 10A — ENTREGUE (03/09/2026)

| | |
|---|---|
| Agenda | saiu do Dashboard e virou `/agenda`, item próprio de menu. Número do dia no canto superior esquerdo, serviços escritos na célula, "+ N serviços" no excedente, dia escolhido com círculo AZUL-ESCURO (nunca fundo preto). Clique abre o modal do dia com empresa, endereço, responsável, telefone, tipo, TAG, horário, status, valor e observações — todos resolvidos do cadastro de clientes por `clienteId`, nada duplicado |
| faturamento | **previsto** (agendado) separado de **realizado** (concluído); cancelado fora das duas contas; nota sem `status` conta como agendada; valor ausente NÃO é zero. Dashboard ficou com o resumo + "Abrir Agenda" |
| `/relatorios` | ícone de PDF com o arquivo REAL do dono (`public/icones/pdf.jpg`, SHA-256 conferido byte a byte contra o servido em produção), filtro por empresa e a empresa na linha. Lista, ordem e busca da 9E intactas |
| `/prontuarios` · `/calibracoes` | recorte padrão esconde quem **comprovadamente** não tem o documento (`null` = "ninguém contou" FICA); filtros de tipo e empresa; caixa para desligar o recorte. Foto do equipamento à esquerda já existia e foi conferida |
| defeito achado | guarda de efeito que se redisparava com mapa vazio — **789 chamadas a `buscar_equipamentos` em 8 s**, medidas no navegador. Corrigido com `ref`; depois: 20 chamadas e para |
| limitações | filtros de empresa/documento são do CLIENTE (sem SQL novo, editor do Supabase segue fechado) e o filtro por data de atualização do prontuário NÃO foi entregue — a data não existe na projeção. Detalhe em `medicoes/2026-09-03-10a-agenda-e-listas.md` |
| NÃO iniciado | 10B.1 (rascunho→finalizar), 10B.2 (Livro manual), 10C (layout novo), Fase 11 (PDF vetorial) |

---

## ✅ FASE 9 — CONCLUÍDA (03/09/2026)

| | |
|---|---|
| rollout | as **6 ondas** da 9G.3 em **30/30 organizações**, com auditoria convergindo nas trinta e 0 pendências |
| gate global | 8 telas navegadas com **hidratação integral ZERO**, livro real com cadeia íntegra, busca, offline e recuperação |
| remoção | caminhos legados **fora** do cliente e dos testes (−2.966 linhas). `flag.ts` foi de 9 flags e uma escada de 8 degraus para **UMA** (`v2_ativa`, que não é da Fase 9) |
| preservado | boot leve (virou o único caminho), fila durável, offline, RLS, PDFs e Livro históricos, e a saída `legado=1` para relatório sem PDF arquivado |
| pendente | `supabase/fase9_remocao_flags.sql` **NÃO aplicado** — o editor SQL do dashboard não carregou em nenhuma das quatro tentativas. É inerte: o cliente já não lê as colunas, elas apenas ocupam espaço em `org_sync` |
| medições | `medicoes/2026-09-03-9g3-ondas-1-a-6-e-gate-global.md` e `medicoes/2026-09-03-9g3-remocao-legados.md` |

---

## ✅ P1, P2 e P3 APROVADOS · FASE 4 CONCLUÍDA

| | |
|---|---|
| **P1** (Fase 0) | **FECHADO ✅** aprovado 20/08 |
| **P2** (Fase 3) | **FECHADO ✅** aprovado 20/08 |
| **P3** (Fase 4) | **FECHADO ✅** aprovado 20/08 |
| **Fase 3** | **CONCLUÍDA** |
| **Fase 4** | **CONCLUÍDA** |
| **Fase 6** | ✅ **CONCLUÍDA** (20/08) — as 3 famílias recuperadas com integridade byte a byte, idempotente, protegidas intactas |
| **Fase 5** | ✅ **CONCLUÍDA** (20/08) — fotos de lista −87,4 %, palco da CAPA −91,6 %, offline real, Portal sem regressão, fechada com teste de foto real |
| Commits de fechamento | `caa168f` (P1/P2) · `676f81f` (P3) |
| Suíte | **1148/1148**, 91 arquivos · Build **verde** |

**Ganho da Fase 4, aprovado com base nas evidências:** leitura no Postgres **534,7 KB → ~21 KB**
(descarte de 93 % → ~zero), payload **31.403 → 21.592 bytes**, `nr13_rel_` e legado fora da carga
inicial, busca sob demanda funcionando, regressão de segurança completa e ataques ao modo novo
`{chaves:[…]}` — todos passaram.

**Ressalva aceita pelo dono:** **não** se afirma ganho de latência como conclusão da Fase 4 — a
dispersão observada não permite essa conclusão. O ganho provado é de **leitura e payload**.

---

## ✅ Risco operacional Supabase — ENCERRADO (aprovado pelo dono em 20/08)

Auditoria read-only em 20/08: **`docs/medicoes/2026-08-20-auditoria-cota-supabase.md`**

**Nenhuma métrica está excedida.** A maior é o Storage, em **33 %**; todos os *overages* em 0.
O badge `EXCEEDING USAGE LIMITS` refletia o ciclo **20/jul → 20/ago**, que fechou ontem — e já
**desapareceu**; o projeto está `Healthy`. O banner *"Grace period is over"* é **condicional**
("**If** your organization is over its quota…"), não uma constatação.

**Sem risco imediato. Sem necessidade de mudar de plano nem de prioridade.** Encerramento da
auditoria aprovado formalmente pelo dono. Projeto `Healthy`.

O que fica para acompanhar é **estoque, não fluxo**: o Storage não zera no reset, e **o PDF de
relatório é 99,5 % dele**, a ~5,9 MB por arquivo. É exatamente o alvo das **Fases 11 e 12**
(PDF vetorial) — o roadmap já aponta para lá.

## 🔴 ACHADO ABERTO — `EQUIPE TESTE` recriado a cada boot

**NÃO CORRIGIR INCIDENTALMENTE.** Não limpar o array legado. Não remover à mão só para sumir da
fila. Não "consertar" no meio de outra fase sem análise. Pertence ao **legado / achado A-13** e
será tratado na fase apropriada do roadmap (10A/10B).

### Causa provável COMPROVADA

```
legado persistente no SERVIDOR  (nr13_historico_relatorios ainda contém o relatório)
   → migração em segundo plano  (migrarHistoricoEmSegundoPlano, no boot)
   → equipamento/relatório JÁ EXCLUÍDO  (não há nr13_rel_ correspondente)
   → recriação da mutação        (nr13_rel_ + nr13_historico_indice_, versaoBase 0)
   → servidor recusa             (versao_obsoleta — piso em app_storage_excluidos)
   → novo boot repete
```

### Por que não é corrupção de um navegador

Reproduzido em **outro navegador (Brave), outra conta (`inspetor01@gmail.com`) e outro
IndexedDB**, durante o teste do P2. O mesmo item preso apareceu numa sessão que nunca tinha
tocado naquele equipamento. A causa está no servidor, não no aparelho.

### Efeito

Gerador permanente de pendência: toda abertura do app produz mutações que o servidor nunca vai
aceitar, e o selo fica em falha para sempre. Não impede o funcionamento normal da Fase 3 — os
conflitos reais nascem, são resolvidos e drenam normalmente, como o P2 provou.

## Vocabulário de estado

Sempre use um destes. Nunca "concluído".

`PLANEJADO` → `EM IMPLEMENTAÇÃO` → `IMPLEMENTADO` → `TESTADO LOCALMENTE` → `COMMITADO`
→ `PUSH MAIN` → `AGUARDANDO REDEPLOY` → `DEPLOYADO` → `VALIDADO EM PRODUÇÃO` → `PORTÃO FECHADO`

---

## Quadro geral

| Fase | Tema | Estado | Portão | Task-level |
|---|---|---|---|---|
| **0-A** | Origem do papel na criação de perfil | ✅ VALIDADO EM PRODUÇÃO | — | `plans/2026-08-16-fase0-task-level.md` |
| **0-B** | Isolamento do Portal (A-01) | ✅ VALIDADO EM PRODUÇÃO — sem ressalva | **P1 FECHADO ✅** aprovado 20/08 | `plans/2026-08-16-fase0b-task-level.md` |
| **1** | Índice da hidratação (A-03) | ✅ VALIDADO EM PRODUÇÃO | — | *(sem task-level — ver abaixo)* |
| **2** | Observabilidade (A-11) | ✅ VALIDADO EM PRODUÇÃO · 1 item de doc aberto | — | `plans/2026-08-16-fase2-task-level.md` |
| **3** | Conflitos (A-14) | ✅ **CONCLUÍDA** | **P2 FECHADO ✅** aprovado 20/08 | `plans/2026-08-16-fase3-task-level.md` |
| **4** | Portal: arquitetura de leitura (A-02) | ✅ **CONCLUÍDA** | **P3 FECHADO ✅** aprovado 20/08 | `plans/2026-08-20-fase4-task-level.md` |
| **5** | Fotos: thumbnail, EXIF, teto de altura (A-08) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** | — | `plans/2026-08-20-fase5-task-level.md` · `medicoes/2026-08-20-fase5-producao-antes-depois.md` |
| **6** | Recuperação do fallback base64 (A-10) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** nas 3 famílias, com SHA-256 idêntico | — | `plans/2026-08-20-fase6-task-level.md` |
| **9** | Escala, busca e carregamento sob demanda | 🟢 **9A–9E + 9F.1…9F.4 CONCLUÍDAS** · `boot_v9` em 2 orgs (teste + piloto real); **`busca_v9`, `inspecoes_v9`, `prontuarios_v9`, `calibracoes_v9` e `livro_v9` OFF nas 30**; `cmam.caldeiras` NÃO habilitada. **9F.5 = só ANÁLISE autorizada** (03/09) | **P9.1 ✅** · **P9.2 ✅** (23/08) · **P9.3 ✅** (25/08) · **9E ✅** (28/08) · **P9.4 ✅** (31/08) · **9F.4 ✅** (03/09) · P9.5 | `plans/2026-08-22-fase9-task-level.md` · `specs/2026-08-22-fase9-escala-busca-design.md` |
| **10C** | **Especificação/mapeamento visual do novo documento** | 🟡 **REGISTRADA, NÃO INICIADA** (03/09) — ver §"Novo layout documental" | — | *(a escrever)* |
| **11** | **Novo relatório em PDF vetorial/híbrido** no padrão da 10C | 🟡 **REGISTRADA, NÃO INICIADA** (03/09) | — | *(a escrever)* |
| **12** | **Expansão do padrão** ao Prontuário e demais documentos autorizados | 🟡 **REGISTRADA, NÃO INICIADA** (03/09) | — | *(a escrever)* |
| **8** | Escala, dataset e medições | ✅ **CONCLUÍDA** (22/08) — diagnóstico aprovado; o critério de produto **NÃO PASSA em grande escala**, e isso é o mandato da Fase 9 | — | `plans/2026-08-22-fase8-task-level.md` · `medicoes/2026-08-22-fase8-fechamento.md` |
| **7** | Logo e rubrica por conteúdo (A-05) | ✅ **CONCLUÍDA · VALIDADA EM PRODUÇÃO** (7A EXPAND + 7B SWITCH, Portal e offline real) | **P4 FECHADO ✅** aprovado 22/08 | `plans/2026-08-20-fase7-task-level.md` · `medicoes/2026-08-20-fase7b-validacao-producao.md` |
| **8** | Escala, dataset determinístico e medições (A-17) | 🟡 **PLANEJADA** — AS-IS, dataset e plano de medição escritos; **nenhuma massa gerada** | — | `plans/2026-08-22-fase8-task-level.md` |
| 9…13 | ver plano macro | PLANEJADO | P5…P8 | `plans/2026-08-15-evolucao-arquitetura.md` |

**Fase atual:** **9 — 9E FECHADA ✅ pelo dono em 28/08/2026** (P9.3 fechado em 25/08, 9D
concluída). `boot_v9` está ligada em DUAS organizações: a de teste (`99f642d3-…-8d211c`) e o
piloto real `92a28bff-…-488a75` (gabriel.dadona). **`busca_v9` segue desligada nas 30 — não
habilitar em cliente sem autorização nova.**

> **`cmam.caldeiras` (`06f84f2e…`) NÃO foi habilitada, por decisão do dono.** É a única
> organização pagante, a maior, e a do incidente v1×v2 — e a organização de maior risco não vira
> requisito artificial para fechar um portão. A expansão para clientes é **gradual, com
> autorização separada**.

**9E FECHADA ✅** (28/08). **A 9F.1 e a 9F.2 foram rolladas na organização de teste em 29/08 e
revertidas no mesmo dia — `inspecoes_v9` e `prontuarios_v9` estão OFF nas 30. Em 31/08 o dono
FECHOU o P9.4 e deu a 9F.2 por CONCLUÍDA, e autorizou APENAS a ANÁLISE da 9F.3 (`/calibracoes`).
A implementação da 9F.3, a 9F.4, a 9G e o PDF vetorial continuam NÃO autorizados — não começam
sozinhos.**

| | |
|---|---|
| Desenho | **APROVADO** (`8e82cf6`) |
| Task-level | **APROVADO** (`2fada5b`) |
| **9A** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9a-peso-projecao.md` |
| **9B** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9b-projecao-na-rpc.md` · P9.1 aprovado |
| **9C** | **CONCLUÍDA** — `medicoes/2026-08-22-fase9c-indices.md` e `-tela.md` |
| **9D** | **CONCLUÍDA · EM PRODUÇÃO** (25/08) — `medicoes/2026-08-25-9d-sql-aplicado-producao.md` |
| **9D · prova offline** | **CONCLUÍDA** (25/08) — 2 defeitos achados e corrigidos: painel inventava `0`; `navigator.onLine` como autoridade. `medicoes/2026-08-25-9d-prova-offline-e-dois-defeitos.md` |
| **9D · piloto cliente** | **CONCLUÍDO** (25/08) — `92a28bff…`: paridade 3/3, boot 20 KB × 354 KB, rollback conferido. `medicoes/2026-08-25-9d-piloto-org-cliente.md` |
| **P9.3** | **FECHADO ✅** (25/08) — evidência DISTRIBUÍDA: laboratório + organização de teste + piloto real |
| **9E** | **BLOQUEADA ⛔** (25/08) — construída e medida (banco 55×–190× melhor; 50k no banco = 16 linhas no DOM, zero PDF), mas o rollout reprovou: **clicar em "Visualizar" num relatório arquivado não abre nada**. Flag revertida para OFF nas 30. `medicoes/2026-08-25-9e-rollout-producao.md` |
| **9E · correção** | **APLICADA** (28/08) — três defeitos consertados com teste: a navegação, o `pdfRef ->> 'caminho'` da projeção (o campo é `path`, e o `NULL` era silencioso) e o recorte do relatório de equipamento excluído. 1410/1410 · build verde. `medicoes/2026-08-28-9e-destravamento.md` |
| **9E · rollout repetido** | **PASSOU** (28/08) — SQL aplicado, reprojeção (`sha256` sem `pdf_ref`: **11 → 0**), front `a944845` publicado, flag ON na org de teste. **Passo 11 aprovado: o PDF arquivado ABRE**, 13 e 18 páginas, SHA-256 da tela igual ao do banco; zero PDF durante a busca; selo e aviso do equipamento excluído conferidos; rollback ON→OFF completo. `medicoes/2026-08-28-9e-rollout-producao.md` |

| **9E** | **🚪 FECHADA ✅ pelo dono em 28/08/2026** — com DUAS limitações declaradas, que **não** contam como aprovadas: (1) **cache frio sob `boot_v9` NÃO foi exercitado** no rollout da organização de teste; (2) **paginação/keyset** foi validada em laboratório com 50.000 relatórios, mas **não** exercitada na organização de teste, que tem 12. Nenhuma das duas vale por inferência |

| **9F.1** | **IMPLEMENTADA · MEDIDA · COM ROLLOUT FEITO E REVERTIDO** (29/08). Gate de navegador em 1k/10k/50k (**11 linhas / 395 nós** constantes, zero PDF) + `testes-9f.sql` 12/12 (`medicoes/2026-08-29-9f1-gate-navegador.md`). Rollout em produção: 5 arquivos de SQL aplicados, org de TESTE reprojetada (`convergiu: true`, badge **1/null/null/null** batendo com a verdade), bundle `index-DkxtOk2G.js` publicado, roteiro com a flag ON só na org de teste (paridade **4 = 4**, **2 requisições por busca**, zero PDF, semeadura por TAG, dados de campo intactos) e **rollback: `inspecoes_v9` 0/30** (`medicoes/2026-08-29-9f1-rollout-producao.md`). **NÃO provado: escala (a org tem 4 equipamentos) e cache frio/offline** |

| **9F.2** | **CONCLUÍDA ✅** (rollout em 29/08, fechada pelo dono em 31/08). `/prontuarios` passou a listar da projeção, com a coluna `tem_prontuario` **nullable** (`null` = "não sei", nunca `false`) e o contrato **semear antes de ler** (`abrirEquipamentoParaProntuario`). Gate de navegador 1k/10k/50k, `testes-9f2.sql` **18/18** (uma assertiva achou um defeito REAL: faltava `tem_prontuario` no `on conflict do update`), e a prova bloqueante cumprida — as **6 folhas do prontuário com texto idêntico byte a byte** entre V9 e legado, em laboratório e em produção. Rollout na org de TESTE e **rollback no mesmo dia: `prontuarios_v9` 0/30**. Registros: `medicoes/2026-08-29-9f2-prontuarios.md` (construção) e `medicoes/2026-08-29-9f2-rollout-producao.md` (rollout) |

| **P9.4** | **🚪 FECHADO ✅ pelo dono em 31/08/2026** — com TRÊS limitações declaradas, que **não** contam como aprovadas e **não** valem por inferência: (1) **escala em produção não exercitada** (a org de teste tem 4 equipamentos; 1k/10k/50k só em laboratório); (2) **o estado `null` do badge não exercitado em produção** (a org foi reprojetada, então toda linha tem `true`/`false`); (3) **cache frio / offline sob `prontuarios_v9` não exercitado** |

| **9F.3** | **IMPLEMENTADA LOCALMENTE** (31/08) — `/calibracoes` pela projeção, com busca, keyset e virtualização; a contagem sai de `calibracoes_index` (a mesma tabela do painel de vencimentos), nunca do `.length` do array. `testes-9f3.sql` **31/31** em 3 execuções contra o Supabase LOCAL, suíte **1508/1508**, build verde. O teste bloqueante de semeadura foi verificado ficando VERMELHO. **Gate de navegador PASSOU em 50.000**: 11 cartões / 398 nós / 30 MB, 2 requisições por busca e zero `app_storage`, os TRÊS estados do rótulo na tela — inclusive o `null`, que a 9F.2 não conseguiu exercitar em produção — e a prova bloqueante: apagadas as 10 chaves do equipamento no IndexedDB, o histórico abriu com 2 componentes, 1 lote e "2/2 calibrados", e as 10 chaves voltaram. O gate foi COMPLETADO nos TRÊS degraus em 31/08: **DOM em 398 nós, 11 cartões e heap em 30 MB — constantes de 1.000 a 50.000**, 2 requisições por busca, zero a `app_storage`, keyset carregando páginas novas, e paridade do histórico com o legado. SQL das três etapas da 9F: **61/61** (31+18+12). **Produção intocada** — e não poderia ser validada agora: o gateway responde HTTP 402 por cota. Registro: `medicoes/2026-08-31-9f3-calibracoes.md` |

**Próxima ação exata:** **NENHUMA sem autorização.** A 9F.1 e a 9F.2 estão entregues, medidas e
revertidas; a decisão de habilitá-las em alguma organização — e quando — é do dono. A **9F.3
(`/calibracoes`) tem apenas a ANÁLISE autorizada** e escrita
(`medicoes/2026-08-31-9f3-calibracoes-as-is.md`); a implementação **não** foi iniciada e não
começa sozinha.
Registro: `medicoes/2026-08-29-9f1-rollout-producao.md`. `busca_v9` segue **OFF nas 30** — **não habilitar em cliente nenhum**; nenhuma conta
pagante foi habilitada. Nenhum PDF histórico foi regenerado e nenhum SHA-256 mudou.

### ✅ P9.2 FECHADO — 23/08/2026

Aprovado pelo dono depois da correção de paridade. A evidência ficou dividida em duas
organizações, de propósito, para **não acessar a conta real do cliente** (decisão OPÇÃO B):

| organização | o que provou |
|---|---|
| `…8d0f7e` | camada de **servidor** com dado rico — projeção × verdade, 4 equipamentos × 13 campos, busca em todas as modalidades, cursor, isolamento, ciclo de escrita |
| `…8d211c` | camada de **tela** — flag OFF × ON, busca, debounce, URL, DOM/rede sem PDF, ponte, palco, offline com requisição realmente falhando, fila durável, reconexão, reprojeção automática, rollback |

**O portão só fechou depois de uma divergência ser encontrada e corrigida:** a cidade do cliente
sumia do cartão sob a V9, e a precedência do nome estava invertida (`nomeFantasia` antes de
`razaoSocial`) — defeito LATENTE que nenhuma das organizações validadas exercia. A correção
separou a projeção em `cliente_nome` + `cliente_cidade`, com a composição na tela
(`textoCliente()`), e alcançou **todos** os caminhos: estrutura, projetor, manutenção pela RPC,
rebuild, reparo, consulta, catálogo offline, item pendente e testes.

Resultado final medido: **os 4 cartões idênticos caractere a caractere entre OFF e ON**, ficha
pela ponte com os mesmos 466 nós nos dois caminhos, prova sintética `PARIDADE OK` com razão
social ≠ nome fantasia, e auditoria convergida nas duas organizações com zero pendências.

Registro completo em
[`medicoes/2026-08-23-p92-validacao-frontend-8d211c.md`](medicoes/2026-08-23-p92-validacao-frontend-8d211c.md)
(§11 a correção, §12 a regressão curta).

### ✅ ETAPA 2 APLICADA EM PRODUÇÃO — 23/08/2026

Infraestrutura 9A/9B/9C instalada na ordem, org piloto `…8d0f7e` com backfill convergido, e
**toda a camada de servidor validada em dado real**. Flag **DESLIGADA**.

| | |
|---|---|
| SQL aplicado | os 6 arquivos, **verificados byte a byte** contra o commit publicado |
| Backfill da piloto | 4 equip. + 4 relatórios · **123 ms** · `convergiu: true` |
| Projeção × verdade | **4 equipamentos × 13 campos, todos idênticos** |
| Busca | TAG, prefixo, descrição, **fabricante**, **nº de série** (com e sem separador), filtros |
| Paginação | cursor sem duplicar nem pular |
| Isolamento | outras orgs e papel `cliente` → **zero** |
| Escrita | criar → editar → excluir, `source_version` convergindo, **sem fantasma** |
| Flag | OFF → ON → OFF, **nenhuma outra org afetada** |
| `app_storage` | intacta (+1 tombstone do teste, declarado) |

O que faltava aqui (comparação visual, abrir equipamento, offline, DOM/rede, debounce) foi feito
depois do deploy do bundle, na organização `…8d211c` — ver o bloco do **P9.2 FECHADO** acima.
Detalhes em [`medicoes/2026-08-23-etapa2-fase9-producao.md`](medicoes/2026-08-23-etapa2-fase9-producao.md).

### ✅ ETAPA 1 CONCLUÍDA EM PRODUÇÃO — 23/08/2026

As seis funções auxiliares da RLS estão **`STABLE`** em produção. Aplicada, validada, **revertida
de verdade** e reaplicada.

| | |
|---|---|
| Benchmark (mesma consulta) | 1.695 → **883 buffers** · 11,4 → **6,3 ms** |
| Plano | `Filter` por linha → **`One-Time Filter`** |
| Segurança | **7 atores reais, 0 divergências** |
| Dados / permissões | **inalterados** |
| Projeto | **Healthy** |

Detalhes em [`medicoes/2026-08-23-etapa1-rls-stable-producao.md`](medicoes/2026-08-23-etapa1-rls-stable-producao.md).
**(Naquele momento a Fase 9 ainda não tinha nada aplicado em produção; 9A–9D entraram depois.)**

### O aviso `Grace period is over` — investigado em 23/08

**Não há bloqueio, não há dívida, não há problema de cartão.** 7 faturas, todas US$ 0,00 e PAID.
O aviso diz que a carência acabou em 16/08 e que estourar a cota **passa a** restringir; o projeto
está **Healthy**, com 100 % de sucesso nas requisições. Métrica mais alta: *cached egress* em
**54 %** (2,71 de 5 GB), ciclo de 20/08 a 20/09.

**O que preocupa é o RITMO, não o deploy:** ~800 MB/dia de *cached egress* com **8 usuários
ativos**. E **65 % do egresso não cacheado é PostgREST** — a hidratação que a Fase 9 remove.
O custo das operações planejadas é de alguns MB contra 2,29 GB disponíveis.

Diagnóstico completo: [`medicoes/2026-08-23-diagnostico-grace-period.md`](medicoes/2026-08-23-diagnostico-grace-period.md).

### O que a 9C entregou

`/equipamentos` passa a ler da projeção sob a flag `busca_v9`. Medido na mesma organização, com
a flag ligada e desligada pelo servidor:

| | OFF (hoje) | ON (v9) |
|---|---:|---:|
| Nós no DOM | **42.450** | **1.301** |
| Heap | 72,9 MB | 49,5 MB |
| Busca por fabricante | não existe | acha, e sem acento |

A consulta é **plana** em 50.000 equipamentos — 2 a 6 ms para qualquer modalidade, sem depender
do tamanho da base. O DOM ficou constante entre 50 e 100 itens carregados.

**Rollback é desligar a flag**, e foi exercitado: a tela antiga volta inteira, sem converter dado
nenhum.

### Decidido em 23/08

**O custo de escrita de +48 %** (1.129 → 1.671 buffers) foi **ACEITO** como *desvio do piloto 9C*
e registrado como **baseline de escrita da V9**. A fidelidade do cartão — PMTA, PTH, resultado,
volume, fluido, vida e unidade — fica preservada. Reabrir a otimização só com evidência de que a
escrita virou gargalo, e sem enfraquecer consistência.

### Mudança INDEPENDENTE, validada e não aplicada

As **seis** funções auxiliares da RLS estão `VOLATILE` em produção, o que numa cláusula de RLS
significa **uma chamada por linha**. A mesma leitura de 1.000 chaves custa **248.685 buffers**
com `VOLATILE` e **1.021** com `STABLE` — **244×**, e o plano vira `One-Time Filter`.

Validada isolada: análise semântica função por função, **88 provas de comportamento idênticas**
nos dois modos (7 atores × 12 provas + `anon`), e rollback exercitado.
`supabase/rls_funcoes_estaveis.sql` · `medicoes/2026-08-23-rls-funcoes-volateis.md`.

**Não depende da flag nem da Fase 9.** Pode ser implantada sozinha, quando autorizado.

Os dois roteiros ficam gravados, já com os resultados marcados:

| Portão | Roteiro | Onde |
|---|---|---|
| **P1** | "Roteiro de fechamento do P1" — regressão curta do sistema interno com as policies atuais | `plans/2026-08-16-fase0b-task-level.md` |
| **P2** | "Roteiro de dois aparelhos — P2" — ciclo completo de conflito + regressão do fluxo de exclusão | `plans/2026-08-16-fase3-task-level.md` |

---

## Fase 1 — não tem task-level, e não precisa ter

Fase de um commit só. Registro aqui para não parecer não-feita.

- **Estado:** VALIDADO EM PRODUÇÃO (16/08/2026)
- **Commit:** `da77d3c` · **SQL:** `supabase/indice_hidratacao.sql` (+ `_rollback`)
- **Índice:** `app_storage_org_atualizado_idx (org_id, atualizado_em, chave)`,
  `indisvalid = true`, 72 kB. Índices da tabela: 432 kB → 504 kB (+16,7 %)
- **Medição:** `docs/medicoes/2026-08-16-fase1-explain.md` — `EXPLAIN ANALYZE` antes/depois nos
  3 cenários. Cenário "nada mudou" (o comum): **61 → 2 buffers**, o nó `Sort` sumiu dos três, e
  `Rows Removed by Filter: 353` desapareceu
- **Ressalva já registrada e aceita:** o cenário "marca nula" (primeiro boot) ficou mais caro
  nesta escala (65 → 236 buffers), porque o `Index Scan` busca cada linha no heap. Documentado
  no próprio arquivo de medição, com o raciocínio

---

## Trabalho de 19/08/2026 — fora de fase, sem task-level

Sessão de uso/validação em produção que produziu correções. **Nenhuma delas tinha registro em
Markdown até 19/08/2026 21:58.** Todas commitadas, no `main` e **CONFIRMADAS EM PRODUÇÃO**
(SHA-256 do bundle idêntico ao build local, 19/08/2026 22:40).

| Commit | O que é | Pertence a |
|---|---|---|
| `8f19a26` | TAG com barra deixava a ficha do equipamento inalcançável — `:tag` casa um segmento só; 2 de 3 equipamentos de uma conta real eram inacessíveis. Correção central em `src/app/rotas.ts` | fora de fase (bug de produção) |
| `4a8e50e` | teste de navegação real, casando os construtores de rota contra o `router.tsx` | idem |
| `a85570a` | TAG nasce sem caractere invisível | idem |
| `f074a64` | **Fase 3** — item recusado por `tombstone_mais_novo`/`anterior_ao_corte` ficava contado no selo e invisível na tela, e a chave nunca recebia o `deletado_em` do servidor | **Fase 3** |
| `e72dd38` | a aba aberta também DESCE o que os outros aparelhos fizeram (`atualizarDoServidor`, throttle de 60 s, respeito ao palco) | sync (fora de fase) |
| `90c2b5f` + `9d9978c` | "TAG nova não aceita barra" — **implementado e revertido no mesmo dia**. A restrição não vale: a barra está na placa do equipamento | — |
| `cb26450` | **Fase 0-B** — prontuário do cliente não abria no Portal: `salvar()` recusado pelo gate de escrita do papel `cliente`. Consequência direta da policy fail-closed | **Fase 0-B** |

**Item aberto herdado de `cb26450`:** o caminho interno (`Prontuarios.tsx`) segue gravando
`nr13_prontuario_atual` por `salvar()` — sincroniza para o servidor uma chave efêmera de
renderização. Não quebra nada; é lixo de sincronização a limpar.

### O defeito de exclusão de `f074a64` — cobertura obrigatória daqui para frente

Já corrigido. **Não reimplementar.** Mas o comportamento entra no roteiro de regressão de
sincronização (P2), porque a falha era silenciosa e cara:

> Com uma pendência na chave, `lerTudo` a **pulava** (`sync.itemDaChave`), então o
> `deletado_em` vindo do servidor nunca era aplicado. Um equipamento excluído num aparelho
> continuava aparecendo no outro **indefinidamente, sem nenhum caminho na interface** para
> resolver — e o selo contava uma falha que a tela não sabia desenhar.

Cenário mínimo de regressão (conta de teste, ativos `ZZ-TESTE-*`):
criar equipamento → sincronizar → segunda sessão enxerga → excluir → sincronizar →
**segunda sessão deixa de enxergar**. Havendo o cenário de recusa correspondente, validar também
as duas saídas do card: **"Recriar no servidor"** e **"Descartar a minha"**.

---

## Situação de cada portão

### P1 (depois da Fase 0) — executado, aguardando aprovação

- [x] Regressão do sistema interno **depois** das policies fail-closed, com conta `mestre`
      → `GET /rest/v1/app_storage` com token de mestre = **HTTP 200**; hidratar, listar, abrir,
      editar, sincronizar e renderizar documento, todos verificados
- [x] Mestre não usa os caminhos do Portal → Edges `portal_cliente` e `portal_arquivo` = **403**
- [x] Revalidar o prontuário do Portal depois do fix `cb26450`
      → **parcial**: o prontuário INTERNO renderizou (palco + iframe). O do Portal exige conta
      cliente, que não tenho
- [ ] Cliente-contra-cliente de arquivo na mesma organização (caso literal)
- [ ] `lerRemoto` recusando para cliente, exercitado com certificado legado real
- [ ] Conta cliente re-verificada nesta rodada — **sem credencial; prova de 16/08 continua valendo**

### P4 (depois da Fase 7) — FECHADO ✅ · aprovado pelo dono em 22/08/2026

**7A — EXPAND**

- [x] Leitor entende Base64 **e** Ref em produção
- [x] **Zero escrita histórica** — 94 chaves conferidas por SHA-256 + versão
- [x] Fallback seguro de leitura: base64 congelado vence; ref que não resolve **não** é
      substituída pela identidade atual
- [x] Rollback preparado (`7B -> 7A`)

**7B — SWITCH**

- [x] Writers produzem referência endereçada por conteúdo — 4 arquivos baixados do bucket e
      SHA-256 recalculado, `nomeEhOHash` verdadeiro nos quatro
- [x] Mesmo conteúdo = mesmo hash/path · conteúdo diferente = arquivo novo
- [x] Deduplicação validada nos 4 cenários (A/B/C/D), pela UI real
- [x] Snapshot novo congela **só** a referência — nenhum base64 nos registros A e B
- [x] **A continua A depois da troca para B**, com reload completo
- [x] PDF arquivado **imutável**: bytes e SHA-256 idênticos depois da troca
- [x] Histórico em Base64 permanece correto — relatório de 19/08 reaberto mostra a logo original
- [x] Portal: cliente autorizado → **200**
- [x] Portal: outro cliente com o **mesmo hash/path** → **404 `nao_disponivel`**
- [x] Portal: hash inexistente → **404 indistinguível** (1 única assinatura de resposta em 6 casos)
- [x] **P1/P3 preservados** — Storage não lista, não assina arbitrário, não baixa pelo hash;
      `app_storage` devolve 0 linhas
- [x] Livro de Registro preservado — entradas lacradas e encadeadas
- [x] **Offline sem perda** — dataURL preservada, reload offline funciona, dado sincroniza
- [x] **Offline sem Ref quebrada** — nenhuma referência prematura, nenhum arquivo órfão
- [x] Suíte **1186/1186** e build verdes

**Achado offline classificado pelo dono como `LIMITAÇÃO DE OTIMIZAÇÃO / PROMOÇÃO TARDIA PARA
REF`** — e explicitamente **não** como risco de perda, risco histórico, ref quebrada ou falha
de integridade. Correção **não** implementada; pendência registrada em `PENDENCIAS.md`.

### P2 (depois da Fase 3) — executado, aguardando aprovação

- [x] Confirmar que o bundle em produção é posterior a `cb26450` → **SHA-256 idêntico**
- [x] Roteiro de dois aparelhos na org de teste, com números
- [x] Desfecho dos 2 conflitos de `EQUIPE TESTE` → **inspecionados, intocados**; descoberto que
      são recriados a cada boot (a causa é o array legado, não os itens)
- [x] Nenhum `nr13_conflito_*` sobrou em `dados` → **0**, conferido três vezes
- [x] Regressão do fluxo de exclusão (`f074a64`) → criar → outro aparelho vê → excluir →
      outro aparelho deixa de ver, **sem fila residual**

**Ressalvas que ficam registradas** (não bloqueiam, mas não devem ser esquecidas): drenagem
offline não exercitada manualmente; primeiro clique em "Manter a minha" sem efeito, não
diagnosticado.

---

## Novo layout documental e PDF vetorial — REGISTRADO EM 03/09/2026, NÃO INICIADO

> **Decisão do dono, registrada para o futuro. Nenhum template foi alterado, e nenhum
> será antes da autorização de cada fase.**

O arquivo **`relatorio-nr13.html`**, a ser fornecido pelo dono, é a **referência visual
oficial** da futura reformulação documental.

> ⚠️ **PENDENTE DE ENTREGA:** em 03/09/2026 o arquivo **ainda não estava no repositório
> nem foi anexado na sessão**. A Fase 10C não pode começar sem ele — é a fonte da
> especificação. Quando chegar, guardar em `docs/referencias/relatorio-nr13.html` e
> registrar o SHA-256, porque referência visual que muda em silêncio produz duas
> especificações diferentes com o mesmo nome.

| Fase | O quê |
|---|---|
| **10C** | Especificação e **mapeamento visual**: o que cada bloco do padrão representa, de qual chave do §2 do `CLAUDE.md` ele sai, e como se comporta em A4 e no celular |
| **11** | **Novo relatório já em PDF vetorial/híbrido** usando esse padrão — deixa de nascer de `html2canvas` rasterizado |
| **12** | Expansão do padrão ao **Prontuário** e demais documentos autorizados |

### FORA desta mudança — preservados como estão

- certificados de calibração;
- **Livro / Registro de Segurança**;
- **capa** do Registro de Segurança;
- **termo de abertura**;
- **documentos históricos imutáveis** (todo relatório com `pdfRef` — §7-quater do
  `CLAUDE.md`: relatório finalizado é ARQUIVO, não receita; ele não se remonta, e por isso
  não pode ser "reformatado" retroativamente).

### Restrições que já valem, antes de escrever a primeira linha

- **Nada de retrofit.** Aplicar o layout novo a um relatório já emitido reescreveria um
  registro técnico assinado. O padrão novo vale para emissões novas.
- O PDF vetorial muda **como o documento é desenhado**, não **o que ele contém**: as regras
  de injeção do §2 e a ordem do §7 do `CLAUDE.md` continuam valendo.
- As regras de folha do §5 (máx. 4 fotos, overflow em folha nova, sem corte, sem vazio)
  continuam sendo o critério de aceite.

---

## Documentos de referência

| Documento | Papel |
|---|---|
| `docs/superpowers/plans/2026-08-15-evolucao-arquitetura.md` | **Roteiro principal** (Revisão 3, fechado). Fases, portões, invariantes I-01…I-26 |
| `docs/auditoria-arquitetura-2026-08-15.md` | Achados A-01…A-18 com impacto e prioridade |
| `docs/medicoes/estado-arquitetural-atual.md` | Como o sistema funciona HOJE (rotas, escrita, leitura, PDF, offline, papéis) |
| `docs/medicoes/2026-08-16-baseline-inicial.md` | Marco zero de produção — egress, banco, bucket, base64 |
| `docs/ARMAZENAMENTO-LIMITES.md` | Os quatro tetos de armazenamento |
| `PENDENCIAS.md` | Pendências operacionais fora do roteiro de fases |

---

## Regras de sessão (combinadas em 19/08/2026)

1. **Markdown acompanha a execução.** Tarefa concluída → `[x]` na hora. Commit, push,
   redeploy, validação, portão → registrar na hora.
2. **`[x]` só com critério cumprido.** Parcial escreve `Status: PARCIAL — falta …` embaixo.
3. **Nunca inventar** deploy, teste, resultado ou medição. Sem prova, escrever
   `PENDENTE DE CONFIRMAÇÃO`.
4. **Antes de qualquer parada**, atualizar `## Ponto de retomada` no task-level ativo.
5. **Testes destrutivos** só em `teste@gmail.com`, com nomes `ZZ-TESTE-*`. Produção de cliente
   real é read-only. Senha nunca em código, Git, Markdown ou log.
6. **Parar no portão.** Nenhuma linha da fase seguinte sem autorização explícita do dono.
