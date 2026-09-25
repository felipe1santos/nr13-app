# Fase 6.3 · Portal do Prontuário serve o PDF emitido (25/09/2026)

Correção local: `8d0aa5a`. Sem migration, sem push, sem deploy. **Exige redeploy das Edges
`portal_cliente` e `portal_arquivo`** junto com o front.

Antes desta fase foram excluídos, pelo fluxo normal da tela e com identificação exata, os dois rascunhos de
smoke da 6.2 na ZZ (`REL-1790302189611`, `REL-1790302311503`): tombstone do registro, `removidoEm` na coleção
de rascunhos, índice de emitidos intacto (2 relatórios com `pdfRef`), nada mais alterado.

## Fluxo auditado (antes)

Portal → `/portal/ativo/:tag` → aba Prontuário → `PortalAtivo.abrirProntuario()` →
`materializarProntuarioAtual(nr13_prontuario_<TAG>)` → 4–6 iframes `/arquivos-prontuario/PRONT-*.html` que leem
do `localStorage` a ficha, o memorial, a medição, os assinantes e a empresa **de hoje**.

- A Edge `portal_cliente` não entregava `nr13_pront_emitido_<TAG>` (`FORA_DO_PORTAL`: "a tela ainda não sabe
  apresentá-lo"), então o Portal nem sabia que havia emissão.
- `nr13_pront_indice` (global) não é usado pelo Portal.
- A Edge `portal_arquivo` já autorizava qualquer `path` citado em chave `_<TAG>` do cliente (inclusive as
  emissões), com URL assinada de 300 s — a infraestrutura de arquivo existia; faltava a tela usá-la.

## Correção

- `features/portal/prontuarioPortal.ts`: vigente pela mesma `resolverProntuarioVigente` da ficha e de
  `/prontuarios` (mais recente, `removidoEm` não conta, fabricante fora). Com `pdfRef` → `arquivo`; emissão sem
  arquivo → `indisponivel` (sem botão, nunca remontagem); sem emissão → `legado` (caminho antigo).
- `PortalAtivo`: `arquivo` abre como `documentoSimples.artefato` — o MESMO caminho dos certificados emitidos
  (`VisualizadorPdf`, `baixarPdfArquivado`, `imprimirPdfArquivado`). A lista mostra a origem
  (GERADO PELO SISTEMA / PDF ANEXADO), número e data.
- Edge: `nr13_pront_emitido_` em `PREFIXOS_POR_TAG` (registro leve, só metadados; paridade com `POR_TAG` mantida)
  e `sanearParaPortal` retirando emissões com `removidoEm` — nas duas cópias idênticas de `oficialidade.ts`, o
  que também impede o `portal_arquivo` de autorizar o arquivo de uma emissão retirada.

## Provas

Unitárias `prontuarioNoPortal.test.ts` (13): gerado, anexado, retirada, dados vivos, indisponível, legado,
fabricante, read-only, ordem na tela, carga da Edge, TAG alheia, saneamento nas duas Edges, cópias idênticas.
Mutantes: tela antiga → 1 falha; prefixos antigos → 2 falhas.

E2E lab (Edges locais, bundles novo e antigo `9ea10ea`), **28/28**:

| etapa | resultado |
|---|---|
| emissão sintética (ZZ-IMG-E2E) | pdfRef `…/relatorios/c8986b13….pdf`, SHA `47ac1a5f…`; PDF com "FABRICANTE ORIGINAL 63" |
| dados vivos alterados | fabricante, modelo e série → "ALTERADO 63" |
| Portal ANTIGO | 6 iframes, texto com "ALTERADO 63" — **reproduzido** |
| Portal NOVO · visualizar | arquivo (canvas), 0 iframes, 0 templates pedidos |
| baixar / imprimir | SHA = emissão (`47ac1a5f…`); texto ORIGINAL, sem ALTERADO |
| F5 · sessão nova (perfil limpo) | mesmo SHA |
| anexado vigente | lista "PDF ANEXADO"; SHA Portal = SHA do original |
| arquivo ausente | "Não foi possível abrir o PDF deste documento."; sem iframe, sem template |
| cross | próprio: 200 + URL; org B (mesma TAG e `clienteId`): 404; TAG de outro cliente: 404; igual a inexistente |
| carga do Portal | traz a lista de emissões do cliente, nada da org B |
| read-only | app_storage da org A idêntico antes/depois do Portal |
| histórico | PDF emitido byte a byte igual ao final |
| mobile 390 | documento abre; Baixar e Voltar 108×44 px; `scrollWidth` 390 |

## Classificações (sem correção)

- **Legado sem emissão (§18):** produção tem 13 prontuários; 4 com emissão (passam a servir o arquivo), 9 sem
  emissão (caminho antigo, inalterado). Destes, **2** estão em orgs com login de cliente e equipamento vinculado:
  continuam vendo a remontagem com dados vivos até serem emitidos. Decisão do dono.
- **Equipamento excluído (§13):** `excluirVaso` tombstona `nr13_pront_emitido_<TAG>` (só o livro é protegido); o
  PDF segue no bucket (sem DELETE); o Portal não entrega chave excluída, então o cliente não chega ao documento.
  P3: a busca de vínculos (`nr13_emp_`) e o `portal_arquivo` não filtram `deletado_em`.
- **URL assinada (§15):** bucket privado (policy recusa `cliente`), autorização por vínculo antes de assinar,
  TTL 300 s. No lab a URL sai com o host interno `kong:8000` (limitação local, reescrita só no teste).
- **SHA na abertura:** o Portal não reconfere o SHA ao servir (P3 já registrado na Fase 6).
