# Rollout em produção — fase 2 + UX de Calibrações + imutabilidade + Portal (19/09/2026)

Projeto `qqsesrntfvmdxqxrfvmw`. Base `f57ae16` → `6b559d0` (22 commits). Org de teste
`99f642d3…` (`teste@gmail.com`), clientes do Portal `cliente001` (TAG ZZ-FASE3) e `ipiranga`.
Nenhuma organização real foi tocada; tudo que foi criado é ZZ.

## Ordem executada

1. Pré-auditoria (somente leitura) e baseline.
2. Migration `documentos_emitidos_imutaveis.sql`.
3. Validação da migration e do Storage na org de teste.
4. Edges `portal_cliente` e `portal_arquivo`.
5. Validação da Edge com JWT real de cliente.
6. Push da `main` e deploy do front.
7. E2E em produção e reconferência dos sentinelas.

## Baseline (T0 = 2026-09-19 17:55:20 UTC)

14 organizações com dados, 40 perfis. Calibrações: 29 entradas em lista e 32 registros, todas
LEGADO (nenhum rascunho, emitido ou terceiro — a fase 2 ainda não estava no ar). Relatórios: 69,
sendo 65 finalizados e 54 com PDF arquivado. `calibracoes_index`: 29.

Sentinelas (md5 do conjunto): relatórios finalizados `n=65 h=64e7a6b0…`; registros de calibração
`n=32 h=9f8f142d…`; arquivos das pastas finais `n=87 h=476e575a…`.

## Migration

Texto conferido NO EDITOR antes do Run: SHA-256
`fb2fe5b4522ff5a7427f8e62e717d84ad8987dff84a316601f236bf083c653c4`, 17.701 bytes, LF — igual ao
do commit. Aplicada UMA vez, com confirmação do modal de operação destrutiva.

Verificação por estrutura: as 9 funções com `md5(prosrc)` idêntico ao do arquivo; trigger
`trg_guardar_documento_emitido` habilitado, `tgtype=27` (ROW/BEFORE/UPDATE/DELETE); políticas
`inspecao_atualizacao` e `inspecao_remocao` com as 4 pastas finais; `inspecao_escrita` e
`inspecao_leitura` intactas; `anon` e `authenticated` sem EXECUTE em `coletar_tombstones`,
`reconciliar_versoes_org`, `purgar_dados_trial` e `purgar_dados_por_email`, `service_role`
mantido. `projetar_calibracoes` em produção era byte a byte a versão de `f57ae16` antes da
migration — a troca só acrescentou o filtro de rascunho.

## Validação na org de teste (transação desfeita no fim): 34/34

Rascunho interno criar/editar ✅; emitir ✅; emitido: alterar dado, pdfRef, SHA, status e excluir
❌ recusados, idêntico ✅. Terceiro: registrar ✅; laboratório, validade, PDF, SHA, virar interna
e excluir ❌; idêntico ✅. Relatório: rascunho criar/editar ✅, finalizar ✅, metadado/SHA/pdfRef/
status/excluir ❌, renomear ✅, idêntico ✅. Relatórios REAIS da org de teste (ZZ-TESTE-P2 e um
legado sem PDF): alterações recusadas. Lista: remover emitido ❌, editar só o rascunho ✅. GUC
`nr13.manutencao` com sessão `authenticated`: ❌.

Mensagem da recusa, verbatim: `nr13_documento_emitido: o relatório nr13_rel_REL-1788551349331_ZZ-TESTE-P2
já foi finalizado e não pode ser alterado nem excluído. Para corrigir, duplique-o.`

## Storage em produção (API real, sessão do mestre de teste)

Arquivo novo em pasta final: 200. Upsert e PUT no mesmo arquivo: 403 (RLS). DELETE: 200 com
lista vazia (0 removidos). SHA dos bytes antes e depois: igual. Foto: upload 200 e remoção 200.
Pela RLS em SQL: UPDATE em arquivo final 0 linhas, foto 1 linha, arquivo de outra org 0.

## Edges

Publicadas pelo dashboard, com o SHA de cada arquivo conferido no que o servidor devolveu:
`portal_cliente` (`index.ts` `b40c221a…`, `prefixos.ts` `28b25e0b…`, `oficialidade.ts`
`139d6c6b…`) e `portal_arquivo` (`index.ts` `7a8cdd10…`, `oficialidade.ts` `139d6c6b…`).

O `prefixos.ts` publicado estava numa versão anterior à do repositório: faltava `'nr13_placa_'`
em `FORA_DO_PORTAL` (Fase 12B). `PREFIXOS_POR_TAG` era idêntico e `nr13_placa_` já não passava
na autorização sob demanda, então publicar a versão do repositório não mudou comportamento.

### Payload com JWT real do cliente: 19/19

Cenário ZZ montado em ZZ-FASE3: calibração interna em rascunho, terceiro em rascunho com PDF
próprio e relatório em rascunho. Resultado: `tags` só com ZZ-FASE3; `versoes` presentes (27/27);
nenhum rascunho no JSON bruto; a lista de calibrações sai `[]`; o PDF do rascunho não é citado;
o relatório em rascunho não vem nem sob demanda; nada do outro cliente (ipiranga) nem de outra
organização. Arquivos: relatório finalizado servido com SHA igual ao registro; PDF do rascunho e
arquivo de outra org devolvem o MESMO 404 de um caminho inexistente.

## Front

`main` = `origin/main` = `6b559d0`. Deploy pelo Coolify; bundle `index-xJSSRUKk.js` (antes
`index-Dl2dXyXC.js`), conferido por 10 strings literais da pilha nova, entre elas
`Nova calibração`, `Tela cheia`, `nr13_portal_copias`, `retratoCompleto`,
`nr13_documento_emitido` e `é oficial (emitido ou de laboratório externo)`.

## E2E em produção (org de teste)

**Nova Calibração:** CTA na tela, modal sobre a lista, URL inalterada (`/calibracoes`), tela
cheia 880 → 1512 px e botão "Recolher", clique fora não fecha, ESC com alteração abre "Há
alterações não salvas nesta calibração". Em viewport estreito (487 px, o mínimo que a janela do
Chrome aceitou): janela ocupando a tela, zero elementos transbordando, sem rolagem horizontal.

**Autopreenchimento:** a janela tem 10 campos, todos do evento (datas, lote, padrão, ambiente,
resultado, responsável, conclusão). Item, fabricante, modelo, série, faixa e unidade vêm do
cadastro do componente; nº do certificado é gerado pelo sistema e a data de emissão é carimbada
na emissão; série, certificado e validade do padrão vêm do cadastro de Certificados.

**Certificado interno emitido** `CERT-1789865764024`: `status: emitido`, PDF em
`certificados-calibracao/8ec10dc1…`, SHA `d2eeb894…`, `pendente: false`, `padraoId` +
`padraoSerie MP01-2024-7788` + `padraoCert RBC-2026/44120` + snapshot `padraoPdfRef`,
responsável "Ricardo Salgado Menezes" com rubrica e logo congelados. Imutabilidade pela RPC do
app: alterar dado, trocar SHA, trocar pdfRef e excluir → recusados; idêntico aceito; registro
intacto.

**Terceiro** `EXT-ZZ-ROLLOUT-001`: PDF original em `certificados-externos/b1d5e56f…` com SHA
`4916efa3…`, idêntico ao arquivo enviado. Imutabilidade: laboratório, validade, PDF, virar
interna e excluir → recusados; idêntico aceito.

**Portal no MESMO navegador** (cliente, sem limpar cache): 1ª carga com o front novo sem
rascunho na tela, no cache nem no `localStorage`; outro aparelho grava uma calibração oficial →
Portal reaberto mostra o documento, com a versão REAL 2 no IndexedDB; F5 mantém; o cache foi
podado ao retrato (372 → 27 chaves); o documento removido no servidor sai do cache e da tela e
não ressuscita.

## Depois do rollout

Sentinelas recalculados sobre as linhas anteriores a T0: relatórios `n=65 h=64e7a6b0…`,
calibrações `n=32 h=9f8f142d…`, arquivos `n=87 h=476e575a…` — **idênticos**. Nenhum documento
histórico foi regravado. 7 arquivos finais novos (as emissões e os arquivos ZZ do teste).
`calibracoes_index` sem nenhuma entrada de rascunho. Nenhuma mutação recusada inesperada em 24 h.

## Não exercitado em produção

- **Quadro 7.1.1, prontuário e TH**: a TAG de teste não tem memorial nem inspeção com
  instrumento vinculado, e criar uma inspeção inteira estava fora do escopo do rollout. Seguem
  cobertos por teste automático e pelo E2E do laboratório.
- **Dois padrões do mesmo tipo**: a org de teste tem um único manômetro padrão; o vínculo foi
  conferido pelo `padraoId`/`padraoPdfRef` do certificado emitido.
- **Offline**: não simulado em produção (proibido derrubar rede do navegador do dono); provado
  no laboratório e por teste.
- **Falha da Edge não apaga o cache**: coberto por teste; em produção não foi forçado.
