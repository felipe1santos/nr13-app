# Fase 6.2 · Livro de Registro + Termo de Abertura no relatório vetorial (25/09/2026)

Correção local: `a216938`. Sem migration, sem push, sem deploy.

## Reprodução (antes da correção)

- **Gerador real** (vitest, `gerarRelatorioVetorial`): composição
  `[CAPA, SUMARIO, PLACA, CONCLUSAO, CAPA-LIVRO-REGISTRO, TERMO-ABERTURA, LIVRO-REGISTRO]`
  → 4 páginas, igual à composição sem livro; sumário sem item do livro; nenhum texto "Termo de Abertura",
  "Livro de Registro" nem "Termo de Inspeção". `secoesPresentes` não tinha chave para as três folhas.
- **Pela tela** (lab, bundle `fea0032`, ZZ-IMG-E2E, livro vazio): o assistente mostra
  "Livro de Registro de Segurança (NR-13)" **marcado por padrão**; o Termo **não** é opção (é automático).
  PDF: 14 páginas, sem livro, sem termo, sem item no sumário.

| | selecionado | no PDF |
|---|---|---|
| Livro | SIM (padrão) | **NÃO** |
| Termo | automático (livro vazio) | **NÃO** |

## Root cause

`pdfVetorial/composicao.ts` · `FOLHA_DA_SECAO` não tinha seção para `LIVRO-REGISTRO.HTML`,
`TERMO-ABERTURA.HTML` nem `CAPA-LIVRO-REGISTRO.HTML`, e `gerarRelatorio.emitir` não tinha desenho para elas.
A composição persistida trazia as folhas; o vetorial (padrão desde 04/09) simplesmente não as casava. O
comentário do gerador dizia "o Livro … e o termo de abertura não são tocados" — limitação da Fase 11 que
nunca chegou à tela do assistente.

## Os quatro conceitos

| | o que é | fonte | nesta fase |
|---|---|---|---|
| A | Livro de Registro (documento do equipamento) | `/livro-registro`, `nr13_livro_<TAG>` | intocado |
| B | folha desta inspeção para colar no livro físico | `LIVRO-REGISTRO.html` na composição | **12.2** |
| C | Termo de Abertura (1ª inspeção, NR-13 13.4.1.9) | auto-injetado com a capa do livro | **12.1** |
| D | registro oficial lacrado | entrada trancada em `nr13_livro_<TAG>` | intocado — nada escreve no livro |

## Fontes (nenhuma cópia nova)

- **Termo (12.1):** frase do `TERMO-ABERTURA.html`; folhas de `nr13_livro_config_<TAG>.totalFolhas` (padrão
  50); empresa proprietária, endereço, CNPJ, fabricante, série, código de projeto e fluido do MESMO modelo
  da capa/placa; PMTA/PTH na unidade do equipamento (§4) — a folha HTML imprimia kgf/cm² fixo.
- **Registro (12.2):** tipo, datas (as da seção 7, pt-BR) e código da meta; APTO/INAPTO do MESMO laudo da
  seção 10; ensaios pela composição; PH/técnico e assinante do termo (`assinanteTermoLivro`) da meta
  congelada; termo = rascunho `nr13_termo_livro_<TAG>` se existir, senão o gerado. Os dois termos são
  editáveis na prévia (override por relatório: `livro.abertura`, `livro.termo`).

## Provas

Unitárias `livroRegistroRelatorio.test.ts` (22): composição, A/B/C/D, conteúdo, INAPTO, rascunho, assinante,
sumário (página existe e tem o título), "Página X de Y" contínuo com um cabeçalho por folha, F5 determinístico,
rascunho antigo, outras seções intactas, prévia sem pendência nova. Mutante (livro sem seção): 9 falhas.

E2E lab (build local, perfil limpo), 19/19:

| caso | resultado |
|---|---|
| D · livro vazio, Livro marcado | 16 págs; 12.1 na 15, 12.2 na 16; sumário 15/15/16; rodapé contínuo |
| rascunho | composição persistida com `CAPA-LIVRO-REGISTRO`, `TERMO-ABERTURA`, `LIVRO-REGISTRO` |
| G · F5 | prévia com o mesmo texto em todas as 16 páginas |
| I · finalizar | pdfRef + SHA `6464f303…`; arquivo = SHA; livro_config e fabricante alterados depois → mesmo pdfRef, mesmo SHA, bytes iguais |
| A · Livro desmarcado | 15 págs, sem seção 12 nem título residual |
| B · livro com entrada | 12.2 presente, 12.1 ausente |
| mobile 390 | sem overflow; item do Livro 328×44 px |

Antigo × novo (texto, normalizando código `REL-*` e o fabricante alterado de propósito): **A idêntico em todas
as 15 páginas**; D e B com capa e corpo idênticos — muda só o sumário e entram as folhas novas.

## Fora desta fase

Vetorização do Livro avulso (`/livro-registro`) e da capa do livro; certificado de calibração; Portal
(serve o PDF arquivado, que já contém a seção). "Só Termo" não é caminho da UI (o termo acompanha o livro);
o vetorial respeita a lista se ela vier assim (teste C).
