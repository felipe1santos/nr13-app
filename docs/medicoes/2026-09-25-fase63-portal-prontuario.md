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

## Os 9 prontuários sem emissão (produção, somente leitura, 25/09/2026)

**Regra de hoje no Portal (bundle em produção):** o item "Prontuário do Equipamento" aparece quando a chave
`nr13_prontuario_<TAG>` chega ao cliente — nenhuma outra condição (nem status, nem índice). A chave chega quando
a TAG é do cliente (`nr13_emp_<TAG>.clienteId === profiles.cliente_id`) e não está excluída. Visualizar remonta as
folhas `PRONT-*.html` com os dados vivos.

| ORG | TAG | RASCUNHO | EMITIDO | ANEXADO | LEGADO FAB. | ÍNDICE | TAG c/ cliente | LOGIN CLIENTE da TAG | PORTAL HOJE |
|---|---|---|---|---|---|---|---|---|---|
| engyuricesar | VP02 - SOTREQ - 1000L OFICINA | sim (16/08) | não | não | não | rascunho | sim | **não** (0 logins na org) | ninguém vê |
| gabriel.dadona | AUTOCLAVE BAUMER | sim (15/07) | não | não | não | rascunho | sim | **não** (0) | ninguém vê |
| guibsonengenharia | ALC - 0001 | sim (04/09) | não | não | não | — (pré-índice) | `demo-cli-01` | **não** (0) | ninguém vê |
| guibsonengenharia | ALC-0002 | sim (04/09) | não | não | não | — | `demo-cli-01` | **não** (0) | ninguém vê |
| guibsonengenharia | ALC-0003 | sim (04/09) | não | não | não | — | `demo-cli-01` | **não** (0) | ninguém vê |
| teste (ZZ) | ZZ-CALDEIRA-TESTE | sim (06/09) | não | não | não | rascunho | **não** | não (TAG sem cliente) | ninguém vê |
| teste (ZZ) | ZZ-TESTE-VISUAL | sim (13/09) | não | não | não | rascunho | **não** | não | ninguém vê |
| thiagocordeirorodrigues | 23IA08162 | sim (19/07) | não | não | não | — | sim | **sim** (1) | remontagem viva |
| thiagocordeirorodrigues | COMPRESSOR CHI | sim (06/08) | não | não | não | — | sim | **sim** (1) | remontagem viva |

Todos têm `nr13_prontuario_meta_<TAG>` (nº/data criados ao abrir, regra anterior à 6.1) e nenhum tem
`nr13_pront_emitido_<TAG>`, `pdfRef`, SHA ou arquivo — nunca houve emissão.

**Os 2 com login (org thiagocordeirorodrigues):** o login de cliente (1) está ligado ao `clienteId` das duas TAGs
(4 TAGs vinculadas); 3 logins, todos em 14/07/2026, último acesso 14/07. Os prontuários são de 19/07 e 06/08 —
**posteriores ao último acesso**: o cliente nunca abriu o Portal com eles existindo. A conta mestre da org está
`ativo=false` (plano demonstração).

**PDF oficial não indexado:** nenhum. Nas 5 orgs há 79 PDFs nas pastas de documento e 7 sem referência: 6 de
agosto (engyuricesar e ZZ; 7–10 MB em `relatorios/`, anteriores à emissão de prontuário, que chegou em setembro;
1 em `prontuario-fabricante/`) e 1 de 69 KB na ZZ (04/09, não aberto — TAGs ZZ sem cliente). Nenhum na org com login.

**Impacto de remover a remontagem para quem não tem emissão:** 2 equipamentos, 1 login de cliente (inativo desde
14/07, org mestre inativa). Os outros 7 não são vistos por nenhum cliente hoje.
