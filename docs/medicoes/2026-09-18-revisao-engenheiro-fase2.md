# Revisão do engenheiro — Fase 2 (medição do E2E local, 18/09/2026)

Branch `revisao-engenheiro-fase2` (a partir de `f57ae16`). **Somente laboratório local**
(Supabase em `127.0.0.1:54321`, org `02cb1a15-…`, usuário `lab@local.test`). Produção não foi
tocada; nenhum push, nenhum deploy. Login no lab por *magic link* gerado pelo admin local (nenhuma
senha digitada no navegador).

## Escopo

| item | onde |
|---|---|
| Prontuário: pressão de projeto da fonte técnica | `features/prontuarios/pressoesProntuario.ts` |
| C.2 responsável/assinatura no certificado | `calibracoes/responsavelCalibracao.ts`, templates `CERTIFICADO-CAL-*`, `palco.ts` |
| C.3 emissão imutável | `calibracoes/emissaoCertificado.ts`, `artefatoCalibracao.ts`, `hostCertificado.ts` (modo avulso), `certificados.ts` (anexo pelos bytes) |
| D terceiro + 6 instrumentos | `calibracoes/instrumentos.ts`, `ModalCalibracaoTerceiro.tsx`, `tipos.ts` |
| D quadro 7.1.1 | `calibracoes/quadroInstrumentos.ts`, `SeletorCalibracaoInstrumento.tsx`, `FormularioChecklist.tsx`, `pdfVetorial/modelo.ts`/`folhas.ts` |
| Catálogo (ZZ-UNID-BAR) | `CatalogoCalibracoesV9.tsx` |
| Assistente de relatório semeia a TAG | `RelatoriosV9.tsx` |

**Banco:** nenhuma migration, nenhuma tabela nova. Tudo em `app_storage` (JSON) e no bucket
privado `inspecao`, sob `<org>/certificados-calibracao/` e `<org>/certificados-externos/` — as
quatro policies existentes (`inspecao_leitura/escrita/atualizacao/remocao`) já isolam por
`(storage.foldername(name))[1] = org_atual()`.

## Cenário 1 — certificado interno

1. Lote "Fase 2 · interno" → Calibrar (manômetro, `bar`) → responsável ENGENHEIRO E2E
   (rubrica no bucket por conteúdo) → **Salvar e revisar** → prévia com marca "RASCUNHO — NÃO
   EMITIDO" e o bloco "RESPONSÁVEL PELA CALIBRAÇÃO".
2. **Emitir certificado** → 2 s → "Certificado emitido e arquivado".
   - registro `cal-1789780710333`, `status=emitido`, `pendente=false`
   - `pdfRef` = `…/certificados-calibracao/449f0f89-0d0d-42e6-8c7b-37753f12e9f3.pdf` (614.139 B)
   - SHA-256 gravado = SHA do objeto no bucket = `e71926a8c343282dbef3c794671fffe3d362ccbec39d5d58f34d2c263e5acdc9`
   - `responsavel` no servidor só com `assinaturaRef` (sem dataURL)
   - página conferida visualmente: logo, rubrica, nome, função, registro, rótulo; sem marca de
     rascunho; rodapé intacto.
3. **F5** → lote → Visualizar PDF: "Documento arquivado" (pdf.js), **0** templates montados.
4. Trocada a LOGO da empresa e a RUBRICA do engenheiro (novos arquivos no bucket) → reabertura:
   bytes servidos com o mesmo SHA `e71926a8…`; `emissao.logoRef`/`assinaturaRef` continuam os
   antigos.
5. Editar e excluir o emitido pelo serviço: **recusados** ("já foi emitido … emita uma revisão").

## Cenário 2 + 3 — terceiro, celular 390 px, offline, F5, sync, relatório

Checklist da inspeção ZZ-E2E-PB num viewport de 390 px (`scrollWidth = clientWidth = 389`,
modais com 365 px).

1. Manômetro → Vincular calibração → lista mostra CAL-F2-001 (emitido) e o legado → escolhido.
2. **Gateway do Supabase local parado** (falha real de rede).
3. Termômetro → Vincular → **Laboratório externo**: tipo travado em Termômetro; unidades
   oferecidas só `°C/°F/K`; PDF de teste (1.033 B) anexado → Registrar.
   - fila: 5 mutações; cofre: 1 arquivo pendente; servidor: 0 linhas e 0 objetos.
4. **F5 offline**: boot com os dados do aparelho (~40 s de "Carregando…", pendência já
   registrada); vínculos e fila preservados (5 + 1).
5. Gateway de volta → drenagem: servidor recebeu `nr13_calibracao_item_cal-1789781008373`,
   `nr13_calibracoes_ZZ-E2E-PB`, `nr13_docs_ZZ-E2E-PB` (com `instrumentosRef` e snapshots) e o
   PDF em `…/certificados-externos/334b56bd-….pdf`. SHA do objeto = SHA gravado = SHA do arquivo
   gerado = `1b08d9057d18178e4b3f1c97b196cdf069b7c328a8da9cfa63bdce0ea0639985`.
6. Relatório (Chromium headless, perfil novo): assistente → ZZ-E2E-PB → lote "Fase 2" →
   inspeção → Gerar → **Baixar PDF** (13 págs., 692.145 B). Quadro 7.1.1 extraído do PDF:

   ```
   Manômetro   X   X   CAL-F2-001 · val. 18/09/2027
   Termômetro  X   X   LAB-E2E-555 · val. 05/08/2027 · Laboratório Metrologia Teste SA (externo)
   ```

   A última página é o certificado anexado: o JPEG dentro do relatório é **byte a byte** o do
   PDF emitido (613.177 B, encontrado no offset 76.141) — copiado, não re-renderizado. Há **1**
   JPEG no relatório: nenhuma folha interna para a calibração de terceiro.

## Relatório finalizado anterior

`nr13_rel_REL-1789756839955_ZZ-E2E-PB`: md5 do registro `f8813a1a6c233309ad42028a5a092baa` e SHA
do arquivo `5cf9d3b2…9fef50` — iguais antes e depois de toda a rodada.

## Defeitos achados pelo E2E e corrigidos

1. **Catálogo de Calibrações (ZZ-UNID-BAR)** — reproduzido com `ZZ-E2E-SI` (0 calibrações): a
   busca achava o equipamento e o recorte padrão "só com calibração" o escondia, com a mensagem
   "Nenhum equipamento encontrado". Agora diz quantos o filtro escondeu e oferece "Mostrar".
2. **Assistente de relatório em aparelho novo** — lia containers, lotes e calibrações do cache
   sem semear; no perfil novo não oferecia nem a inspeção nem os certificados. Semeia a TAG.
3. **Calibração de terceiro avulsa** aparecia sob "entram como folhas no fim do relatório".
4. **Bloco do responsável estourava o A4** (1.178 px > 1.123): foi para o lado da conclusão, com
   topo da página 5 mm menor só quando existe. Medido nas duas folhas (manômetro e PSV), com e
   sem responsável: 1.123 px; legado sem mudança nenhuma.
5. Opção legada aparecia como "interna" na lista do celular → "origem não informada".

## Ambiente

`cardapio` (Supabase local que divide as portas) parado para o lab e restaurado no fim.
