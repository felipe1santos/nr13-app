# Calibrações — reestruturação de UX (medição do E2E local, 19/09/2026)

Branch `calibracoes-ux` (a partir de `6bf3870`). Somente laboratório local; Chromium headless
(Playwright) com login por magic link do admin local. Produção intocada; sem push/deploy.

## Preparação

- Equipamento `ZZ-CAL-UX` (serviço de criação, unidade Petrobras) com cliente `CLIENTE ZZ UX LTDA`.
- Padrões pela tela **Certificados** (fonte oficial, sem cadastro paralelo):
  `ZZ-PADRAO-01` (manômetro, série PS-1556, cert. LAB-2026-5512, val. 31/01/2027) e
  `ZZ-PADRAO-PSV` (válvula, BT-2020, LAB-2026-7788, val. 05/10/2026 → "vence em até 30 dias").

## Manômetro (desktop 1366 px)

`/calibracoes` → **Nova calibração** (visível) → busca `ZZ-CAL-UX` → "Cadastrar novo
componente" → `ZZ-MAN-01` (WIKA, 232.50, MAN-UX-777, 0 a 16, bar, pontos 0/4/8/12/16) → volta
**já selecionado** → Continuar → **janela** (URL continua `/calibracoes`, `data-modo=modal`;
Tela cheia → `cheia`; Recolher → `modal`).

Derivado na janela, sem digitar: item (nome, fabricante, modelo, série, faixa, unidade,
cliente), padrão (pré-selecionado por ser o único; série, certificado, validade + "Certificado
válido"), nº `CERT-1789788759749`, emissão "definida na emissão", responsável (único
cadastrado), texto da conclusão (padrão ao escolher "Aprovado"), pontos da coluna padrão.

Inputs de texto na janela: **5** — data da calibração, próxima, temperatura, umidade, local.
Digitado na calibração: as 2 datas, 23 °C, 58 %, Oficina ZZ, 10 leituras (5 subindo, 5
descendo) e a escolha "Aprovado". ✕ com alteração → "Há alterações não salvas…" (Continuar
editando); clique fora → janela continua aberta. Salvar rascunho → toast com o nº, janela fecha,
página no mesmo lugar.

**F5** → equipamento → clique no acessório → histórico (RASCUNHO, mesmo nº) → Continuar →
todos os valores de volta → **Emitir**. Servidor: `status=emitido`, `dataEmissao=19/09/2026`,
`padraoId`, snapshot do padrão e do item, `componenteId`, SHA do objeto no bucket = SHA gravado
(`1d47edda…`). Página emitida conferida visualmente: todos os dados automáticos presentes.

## PSV (celular 390 px)

Mesmo fluxo em 390×844: `scrollWidth = clientWidth = 390` na lista e na janela (janela ocupa a
tela). Cadastro PSV mostra só os campos dela (+ pressão de ajuste; sem pontos). Padrão da
válvula derivado com aviso "Vence em até 30 dias". Pressão de ajuste pré-carregada do cadastro
(12). Digitado: 2 datas, 24 °C, 61 %, local, abertura 12,1, fechamento 11,4, "Aprovado".
**Emitido direto da janela**: `CERT-1789789169335`, emissão 19/09/2026, SHA `cb7755e2…` =
objeto no bucket. Observação: o 1º run criou o componente `ZZ-PSV-01` e falhou no roteiro
(botão "Revisar resultados"); o fluxo foi repetido com `ZZ-PSV-02`.

## Offline

Gateway do Supabase parado → boot com dados do aparelho → histórico → Nova calibração →
padrão veio do cache (boot essencial) → Salvar rascunho: fila 0 → 2, servidor 0. **F5 offline**:
fila 2, rascunho no cache. Gateway de volta → fila 0; servidor com
`nr13_calibracao_item_cal-1789789333885` (rascunho) e a lista.

## Compatibilidade

Histórico do `Manômetro principal` (ZZ-E2E-PB): "REGISTRO ANTERIOR" (CAL-E2E-001, sem status)
e "EMITIDO" (CAL-F2-001) lado a lado; o legado abre pelo template, sem o bloco novo.

## Achado e corrigido durante o E2E

O histórico do componente ficava POR CIMA da janela da calibração aberta a partir dele (ordem
no DOM). Movido para antes da janela.

## Lab

Na preparação, dois registros de padrão foram gravados em cartões errados pelo roteiro
(ultrassom e manômetro); corrigidos pelo mesmo serviço da tela (versões novas; as erradas
ficaram substituídas). Só no laboratório.

## Rodada final antes do rollout (19/09/2026)

**PDF do padrão exato.** `rastreabilidadesParaRelatorio` resolve cada folha de calibração pelo
`padraoId` (versão) → registro → PDF, com `padraoPdfRef` congelado como segunda via. Lab:
dois padrões de manômetro ativos (A: LAB-2026-5512, PDF 1 pág.; B: LAB-B-9001, PDF 3 págs.);
calibração com **B** emitida (`CERT-1789792166519`). B renovado para LAB-B-9002 (PDF 5 págs.;
v1 substituída); calibração nova com C2 (`CERT-1789792476106`). Relatório com as duas: págs.
13–14 os certificados emitidos; **15–19 = PDF LAB-B-9002**, **20–22 = PDF LAB-B-9001**; PDF do
padrão A **ausente**.

**Contador.** Cartão ZZ-CAL-UX: "3 calibrações" → salvar rascunho → **"4 calibrações"** na hora
→ drenagem + F5 → "4 calibrações" (projeção) → emitir → 4.

**Rodapé.** Rotina `caberNaFolha` nos dois certificados. Medido (px, A4 = 1123): PSV curto
1123 / folga 23; PSV "Unidade Industrial — Área de Utilidades e Casa de Caldeiras" era 1135
(passava do A4) → **1123 / folga 68** (passo 1); texto ainda maior → 1123 / folga 52. Manômetro
extremo → 1123 / folga 26 (3 passos, fonte 10,5 px). PSV emitida em 390 px com o Local longo:
página conferida, rodapé intacto.

**Saída protegida.** ESC → faixa de confirmação; F5 com alteração → `beforeunload` do navegador
(janela continua aberta ao cancelar); rota interna → `useBlocker`.

**Offline.** Gateway parado → Nova calibração → Salvar rascunho → fila +2, servidor 0 → F5 →
fila mantida, rascunho no cache → gateway de volta → item e lista no servidor. A fila ficou com
1 item: conflito antigo em `nr13_relatorio_meta_atual` (duas instâncias gerando relatório — já
em PENDENCIAS), não é das calibrações.

**Imutabilidade.** md5 do relatório REL-1789756839955 e dos registros de certificado emitidos
(CAL-F2-001, CERT-1789788759749, CERT-1789789169335) + o legado cal-e2e-pb: idênticos antes e
depois; SHA dos 4 arquivos no bucket = SHA gravado.

## Pré-rollout: imutabilidade no servidor, rascunho fora, Portal (19/09/2026)

Migration `supabase/documentos_emitidos_imutaveis.sql` aplicada no laboratório (duas vezes —
idempotente). Todas as tentativas abaixo como o usuário logado, pela RPC
`aplicar_mutacao_storage`, contra um certificado emitido:

| tentativa | resultado |
|---|---|
| mudar serviço / data / responsável / resultado | recusada `nr13_documento_emitido` |
| trocar `emissao.pdfRef` / `emissao.sha256` | recusada |
| voltar `status` para rascunho | recusada |
| `del` (tombstone) | recusada |
| tirar / alterar / excluir a entrada emitida da lista `nr13_calibracoes_<TAG>` | recusada |
| UPDATE direto pelo PostgREST | recusada |
| regravar o MESMO valor (re-sincronização) | aceita |
| editar rascunho | aceita |
| emitir (rascunho → emitido) pelo fluxo normal | aceita |

**Fila.** Mutação adulterada posta na fila do aparelho → servidor recusa → item encerrado como
recusa definitiva e o cache local volta ao valor do servidor. Conflito + "Manter a minha" →
servidor intacto. Mutação atrasada com versão antiga → `conflito`, nada gravado.

**Bucket.** upsert/update recusados em `certificados-calibracao/`, `certificados-externos/`,
`relatorios/` e `certificados/`; remove afeta 0 arquivos; SHA dos arquivos inalterado. Foto:
upload e remoção seguem funcionando. Outra organização (`lab2-outra-org`): download "Object not
found", listagem 0, registros 0, delete 0.

**Migration em banco zerado** (transação, 54 linhas apagadas, aplicada 2×, rollback) e em banco
populado (2×): `calibracoes_index` de ZZ-CAL-UX 7 → 5 (os 2 rascunhos saíram); md5 do relatório
REL-1789756839955 e dos certificados emitidos idênticos antes/depois.

**Vencimento.** Rascunho ZZ-MAN-VENC com próxima 20/09/2026 → painel sem prazo; emitido → "vence
20/09/2026 · warn".

**Portal (cliente `portal-zz`).** ZZ-CAL-UX lista os emitidos e EXT-UX-321 "Laboratório externo:
Laboratório Metrologia UX Ltda"; rascunhos ausentes. Emitido CERT-1789792476106: "Documento
arquivado", 0 iframes de template, SHA dos bytes = SHA do registro, logo/data/padrão LAB-B-9002 na
imagem. Terceiro: SHA = arquivo enviado. Relatório antigo REL-1789756839955: arquivado, SHA
confere. Legado CAL-E2E-001: abre pelo template. No lab a Edge assina a URL com `kong:8000` — o
E2E remapeia o host (não é defeito do código).

**Regressão do padrão exato.** Relatório com CERT-1789792476106 → págs. 14–18 = PDF LAB-B-9002;
padrão A ausente.

## Último hardening: terceiro, relatório finalizado, listas e bypass (19/09/2026)

A guarda virou UMA regra para três documentos (interno emitido, terceiro, relatório
finalizado) e suas listas (`nr13_calibracoes_`, `nr13_historico_indice_`,
`nr13_historico_relatorios`). Migration aplicada no lab populado 2× (e mais uma vez, por
engano do gerador de teste, rollback + 2× em autocommit — estado final idêntico, nenhuma linha
apagada), e em banco ZERADO: rollback → 64 linhas apagadas → migration 2× → casos-chave →
ROLLBACK. md5 dos registros históricos e SHA dos arquivos: idênticos.

**Bateria SQL (73/73)** como `authenticated` pela RPC: A (6), B (10), C (13, com relatório
legado e retrofit), D rascunhos (12), lista de calibrações (9), índice (8), legado (2), bypass
com GUC ligado (3), outra org (3), anon/service_role/DBA (7).

**Pelo PostgREST (14/14)**, com JWT real: terceiro e relatório recusados (400
`nr13_documento_emitido`); `rpc/set_config` 404; `coletar_tombstones` 403; anon em
`purgar_dados_por_email`/`reconciliar_versoes_org` 401; service_role DELETE direto recusado;
outra org lê 0 linhas.

**Bypass.** Quem liga o GUC: sessão direta (DBA) e quatro rotinas SECURITY DEFINER que exigem
claims `service_role` antes. `anon` tinha EXECUTE nelas (default privilege do Supabase; os
`revoke` originais só tiravam de `public, authenticated`) — sem efeito, porque elas recusam,
mas o grant saiu. PostgREST não expõe `set_config` (pg_catalog fora dos schemas) e pg_graphql
não está instalado no lab. Sessão `authenticator` real + GUC: negado para `authenticated` e
sem claims; autorizado só com `service_role`.

**Fila (§11)**, pelo app, para interno, terceiro e relatório: rascunho → edição offline na fila →
outro aparelho oficializa → rede volta → conflito → "Manter a minha" → `encerrado` /
`recusa_definitiva`, 1 tentativa, e mais duas drenagens não gastam outra; cache volta ao oficial;
servidor intacto. `del` cru de relatório finalizado pela fila: recusado e restaurado (SHA igual).

**Fluxos legítimos pela UI**: finalizar relatório (rascunho → Aprovado, PDF + SHA, índice);
renomear (passa); adulterar validade pelo app (recusado, restaurado); emitir certificado pela
janela; registrar terceiro com PDF (lista aceita a entrada nova e mantém a antiga).

**Portal**, perfil limpo: emitido novo e terceiro novo abrem o arquivo, SHA = registro; rascunhos
ausentes. Com perfil já usado, os novos NÃO apareciam — cache semeado com versão fixa
(pré-existente, registrado em PENDENCIAS).

**Storage**: nenhuma das quatro pastas recebe rascunho, temporário ou upload não emitido — os
únicos escritores são `publicarArtefato` (finalização de relatório/prontuário e a bancada
`?piloto=1`), `salvarRastreabilidade`/`recuperacaoArquivos` (padrão cadastrado), a emissão e o
"Registrar" do terceiro; todos com caminho novo (uuid); ninguém remove.

**Arquivo para produção** (conferir no SQL Editor por hash, §13): `supabase/documentos_emitidos_imutaveis.sql`
do commit `a70c6fd`, 17.701 bytes, fim de linha LF —
SHA-256 `fb2fe5b4522ff5a7427f8e62e717d84ad8987dff84a316601f236bf083c653c4`.
Rollback `documentos_emitidos_imutaveis_rollback.sql` —
SHA-256 `72aa9ea5e17a86baa1f94778c4c42abd2966ace363aac771962767750b837d8b`.

## Portal: rascunho não sai do servidor; cache segue o servidor (19/09/2026)

**Fonte do vazamento.** `portal_cliente` montava o payload com `chaves[row.chave] = row.valor`
— `nr13_calibracoes_<TAG>` inteira, rascunhos dentro — e o modo sob demanda servia
`nr13_rel_<id>_<TAG>` de relatório em rascunho. `portal_arquivo` autorizava qualquer `path`
achado em qualquer chave `_<TAG>`, inclusive dentro de rascunho. A tela filtrava com
`ehOficial`; o dado já estava no navegador.

**Correção na fonte.** `sanearParaPortal` (mesma regra de `ehOficial`) em toda leitura que
serializa, nas duas Edges. Nenhuma mudança na migration (SHA `fb2fe5b4…c653c4` mantido).

**Payload bruto (17/17)**, cliente `portal-zz` da org A, lab com: rascunhos internos, um
terceiro em rascunho com PDF próprio no bucket, um relatório em rascunho, e a org B com a
MESMA TAG e o MESMO `clienteId`. Sai: B (emitido), C (terceiro), legado. Não sai: nenhum
rascunho, nenhum `"status":"rascunho"`, o path do PDF do rascunho, o relatório em rascunho
(nem sob demanda), nada da org B. Arquivos: emitido e terceiro servidos com SHA = registro;
PDF do rascunho e arquivo da org B → 404 idêntico ao de arquivo inexistente.
**Com o código anterior (HEAD) o mesmo script deu 8 falhas** — inclusive URL assinada (200)
para o PDF do rascunho.

**Cache.** Causa: `semearCache` gravava versão fixa 1 via `aplicarRemoto`, que só aceita o mais
novo; e nunca tirava do cache o que o servidor deixava de mandar. Agora a carga é o retrato
completo: substitui sem comparar versão, grava a versão real (`versoes` da Edge) e remove o
que saiu, no IndexedDB e nas cópias do `localStorage`.

**E2E no MESMO perfil** (o `perfil-portal`, que antes não mostrava CERT-1789829059104 nem
EXT-HARD-777): passou a mostrar os dois e perdeu os rascunhos do cache; certificado novo
CERT-1789833357394 emitido pela janela → Portal reaberto sem limpar nada → aparece (tela e
cache); F5 → mantém; fechar e reabrir o navegador → mantém; offline → o Portal mostra erro
(não abre offline, como antes), mas o cache no disco continua com os 10 itens; online de novo →
normal.

**Regressão:** bateria SQL 73/73, PostgREST 14/14, storage e outra org iguais; Portal:
emitido e terceiro com SHA, relatório antigo `5cf9d3b2…` confere, legado abre pelo template.
