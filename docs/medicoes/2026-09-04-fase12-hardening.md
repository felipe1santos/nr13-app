# Fase 12 · hardening final — o que foi publicado, o que foi provado e o que existe

**04/09/2026.** Fecha a Fase 12: republicação da Edge, validação do Portal,
correção da abertura do documento emitido, teste bloqueante de imutabilidade,
validação no navegador contra o bundle em produção e o **inventário real** dos
geradores de documento do sistema.

---

## 1 · `portal_cliente` republicada — e conferida por HASH (§13)

O repo e a produção divergiam por UMA linha (`nr13_pront_emitido_` em
`FORA_DO_PORTAL`). Comportamento idêntico — a família nunca esteve em
`PREFIXOS_POR_TAG`, então a Edge já negava —, mas divergência silenciosa entre
código e servidor é o que faz a próxima leitura do arquivo mentir.

Publicada pelo dashboard (sem CLI), projeto **SAAS NR13 · `qqsesrntfvmdxqxrfvmw`**.

| arquivo | antes (servidor) | repo | depois (servidor) |
|---|---|---|---|
| `index.ts` | `7da703c6…cabf` (8.391 B) | `7da703c6…cabf` | `7da703c6…cabf` — **intocado** |
| `prefixos.ts` | `2f2e5737…b505c` (6.924 B) = repo em `6225581` | `acf3b6f1…82a8f` (7.558 B) | **`acf3b6f1…82a8f`** |

O conteúdo colado no editor foi conferido por SHA-256 **antes** do deploy
(`acf3b6f1…`, igual ao `raw.githubusercontent`) e o que voltou do servidor
**depois** do reload — as duas pontas, porque "Successfully updated" só diz que
o servidor executou o que recebeu, não que recebeu o que se escreveu.

Só `prefixos.ts` ficou marcado `M` na árvore; `index.ts` continuou intacto na
conferência pós-deploy.

**A função sobe e roda** (não é só "deploy aceito"): chamada com a chave
publicável, devolveu `401 {"erro":"Token inválido"}` — mensagem da PRÓPRIA
função, em português, no campo `erro`. Boot error devolveria outra coisa.

## 2 · Portal validado

Seis provas, todas passando (executadas contra a Edge publicada):

| prova | resultado |
|---|---|
| `nr13_pront_emitido_<TAG>` | **negada** |
| `nr13_livro_rascunho_<TAG>` | **negada** |
| `nr13_livro_<TAG>` | permitida |
| chave de OUTRA TAG | negada |
| relatório legado | permitido |
| pedido misto | volta **só** a chave oficial |

O acesso descartável de portal criado para isso (`zz.hard12.*`) foi removido
pelo fluxo oficial — 0 restantes.

## 3 · Abrir o documento emitido não depende do palco nem do dado vivo

`bytesDaEmissao` (em `features/prontuarios/emissaoProntuario.ts`) recebe o
REGISTRO da emissão e devolve o arquivo do `pdfRef`. Não chama gerador, não monta
folha, não lê `nr13_info_`/`nr13_calc_`, não grava nada e não disputa a trava do
palco.

Antes a abertura passava pela tela do visualizador: abrir um documento de meses
atrás exigia carregar o equipamento inteiro — e abria a porta para o que aparece
na tela ser remontado dos dados de HOJE.

## 4 · Imutabilidade: cinco testes bloqueantes

Em `src/features/prontuarios/__tests__/emissaoProntuario.test.ts`, bloco
**"ABRIR emissão arquivada NÃO regenera nada"**:

1. serve os bytes do `pdfRef` e **nada mais** — só `artefatoDe` + `baixarArtefato`,
   nenhuma chamada de geração;
2. abrir várias vezes **não** cria emissão nem muda a lista (comparação do JSON
   inteiro, antes × depois);
3. abrir **não** altera `sha256` nem `pdfRef` do registro;
4. basta o REGISTRO: com o storage vazio, **sem nenhuma chave do equipamento**,
   ainda abre;
5. sem arquivo resolvido **ERRA** — nunca cai em remontagem silenciosa.

O par (1) + (5) é o que trava de verdade: se algum dia a abertura voltar a passar
pelo gerador, pelo palco ou por dado vivo, os testes quebram.

## 5 · Validação no navegador, contra o bundle publicado

Bundle em produção: **`assets/index-BhysF4YM.js`** (anterior: `index-BoijfQPO.js`),
conferido pelas STRINGS literais do commit `9ed7cd2` (`"não tem arquivo
arquivado"`, `"não voltou nem do cofre local nem do bucket"`).

Org de teste, `COMPRESSOR V8-15/200L`, pelo fluxo normal (sem `?piloto=`, sem
`?motorPront=`):

| exigência | medido |
|---|---|
| emissão existente aparece | "Documento emitido em 19/08/2026 · 6 páginas · código de verificação `a0d74335a091669c…` · arquivado" |
| abrir funciona **após reload** | sim — refeito depois de recarregar a página |
| abrir **não** aumenta a quantidade de emissões | 1 antes, **1** depois; `versao` 1; `atualizadoEm` inalterado (`16:56:20.225Z`) |
| mesmo `pdfRef` | `…/relatorios/6716d502-1603-47d4-bcda-61caef7ee56e.pdf` |
| mesmo SHA | `a0d74335a091669c8991a989b49c33a9e2989562ce56c37eb3b45f4aa35c953d` — SHA dos bytes SERVIDOS recalculado no navegador, igual ao do registro |
| mesmos bytes | **71.426** nas duas aberturas |
| integridade | **true** (`%PDF-1.3`, 6 páginas contadas no arquivo) |
| Prontuário vetorial continua padrão | `nr13_motor_prontuario = vetorial`, versão 1 |
| Relatório vetorial continua padrão e **não foi afetado** | `nr13_motor_pdf = vetorial`, versão 1, `em: 2026-09-04T15:23:54.662Z` — mesmo timestamp de antes da Fase 12 |

## 6 · Inventário: os geradores REAIS de documento

Levantado por varredura do código, não por nome de menu: todos os `imprimirRelatorio`,
`exportarPdf*`, `gerarPdfBytes`, `jspdf`, `a.download` e `createObjectURL` de `src/`,
mais a contagem de referências de cada `.html` de `public/`.

### A · Reformulados (vetorial, padrão de produção)

| documento | onde é gerado | produz |
|---|---|---|
| **Relatório de inspeção** | `pages/Relatorios.tsx` → `pdfVetorial/gerarRelatorio.ts` | PDF arquivado (`pdfRef` + SHA) |
| **Prontuário** | `pages/Prontuarios.tsx` → `pdfVetorial/gerarProntuario.ts` | PDF arquivado (`pdfRef` + SHA) |

### B · Fora do escopo por decisão do dono — não tocados

| documento | onde é gerado | produz | por que fica |
|---|---|---|---|
| Certificado de calibração manômetro | `CERTIFICADO-CAL-MANOMETRO.html` · `pages/Calibracoes.tsx` (`imprimirRelatorio('.cal-preview')`) | impressão + folha rasterizada no relatório | lista explícita de exclusão |
| Certificado de calibração PSV | `CERTIIFCADO-CAL-PSV.html` · idem | idem | idem |
| Certificado do padrão (rastreabilidade) | `nr13_rastreab_` → `pdfVetorial/certificados.ts` | páginas **copiadas** do PDF de origem (pdf-lib) | não há layout a refazer: é o arquivo do laboratório |
| Livro / Registro de Segurança | `LIVRO-REGISTRO.html` · `pages/LivroRegistro.tsx` (`exportarPdf`, `exportarPdfLivroCompleto`) | PDF + impressão | lista explícita |
| Capa do Livro | `CAPA-LIVRO-REGISTRO.html` | folha do Livro | lista explícita |
| Termo de abertura | `TERMO-ABERTURA.html` (auto-injetado antes do Livro) | folha do relatório | lista explícita |
| PDFs históricos | qualquer registro com `pdfRef` | servidos como ARQUIVO | §7-quater: não se remontam |

### C · O resto que existe de verdade — e a decisão de cada um

| # | nome | onde é gerado | produz PDF/impressão? | vale reformular? | motivo |
|---|---|---|---|---|---|
| 1 | **Impressão do relatório** (botão Imprimir) | `Relatorios.tsx:233` → `printService.imprimirRelatorio('.relatorio-preview')` | impressão (html2canvas → `#print-root`) | **sim, candidato à Fase 13** | o PDF já é vetorial, mas o papel ainda sai de uma FOTOGRAFIA das folhas: mesmo documento, duas qualidades. Não é defeito de conteúdo — é a última superfície raster do relatório |
| 2 | **Impressão do prontuário** (botão Imprimir) | `Prontuarios.tsx:313` → `imprimirRelatorio('.prontuario-preview')` | impressão | **sim, candidato à Fase 13** | mesma assimetria: "Emitir" produz vetorial, "Imprimir" produz raster |
| 3 | **Baixar PDF de relatório NÃO finalizado** | `Relatorios.tsx:644` → `exportarPdf` | PDF raster | **não** | é rascunho, não documento emitido. Finalizado já baixa o arquivo arquivado (`baixarPdfArquivado`) |
| 4 | **Portal do Cliente** | `pages/portal/PortalAtivo.tsx` | serve `pdfRef` quando existe; `exportarPdf`/`imprimirRelatorio` só como fallback | **não** | o caminho novo já é o artefato; o fallback só alcança relatório LEGADO sem `pdfRef`, e some sozinho conforme os equipamentos são reinspecionados |
| 5 | **Prontuário do fabricante** | `features/equipamento/ProntuarioFabricante.tsx` | baixa o arquivo como está | **não** | não é gerado: é um PDF ENVIADO pelo usuário (até 8 MB). Reformatá-lo seria adulterar documento de terceiro |
| 6 | **CSV de leads** | `pages/Admin.tsx:580` | CSV | **não** | export administrativo, não documento técnico |
| 7 | **Painéis piloto** | `pdfVetorial/PainelPiloto.tsx`, `PainelPilotoProntuario.tsx` (atrás de `?piloto=1`) | PDF de comparação | **não** | ferramenta de medição, não documento entregue |
| 8 | **Seis folhas órfãs** `PRONT-P1`, `PRONT-P2`, `PRONT-P2B`, `PRONT-P3`, `PRONT-P4`, `PRONT-CARACTERIZACAO` | `public/arquivos-prontuario/` | **nada** | **não** | **ZERO referências em `src/`** (conferido arquivo a arquivo). Entraram no commit `d4e1d23`, aparecem só em dois documentos de planejamento de 09/07/2026, e nenhum caminho do sistema as abre. São ~90 KB de HTML morto — não foram removidas porque remover gerador antigo está fora desta rodada |

> As `PRONTUARIO-RECONSTITUICAO-1..4` continuam **não existindo** neste
> repositório (reconferido: `find public -iname "*recons*"` vazio). O item 8
> acima é outra coisa: folhas que EXISTEM e ninguém chama.

### O que a varredura garante

Os 39 `.html` de `public/` (27 em `arquivos-inspecao/`, 12 em
`arquivos-prontuario/`) foram contados por referências em `src/`. Fora as seis do
item 8, **todos** os 33 restantes têm ao menos 2 referências e caem em A ou B.
Não há gerador de documento fora desta tabela.

---

## 7 · Números

| | |
|---|---|
| suíte | **1.806 testes, 149 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
| bundle em produção | `assets/index-BhysF4YM.js` |
| Edge publicada | `portal_cliente` (`prefixos.ts` → `acf3b6f1…`) |

## 8 · Não foi feito, de propósito

Gerador antigo removido, motor raster tocado, Livro alterado, certificado
alterado, histórico regenerado, teste de massa, Fase 13 iniciada — nada disso.
