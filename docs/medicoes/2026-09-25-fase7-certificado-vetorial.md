# Fase 7 · Certificado interno de calibração em vetor (25/09/2026)

Código local: `665670d` (gerador + emissão + prévia + testes) e `b6e2725` (selo reduzido).
Sem migration, sem push, sem deploy.

## Auditoria (antes)

### Fluxo antigo

1. **Dados**: registro `nr13_calibracao_item_<id>` (espelhado em `nr13_calibracoes_<TAG>`), com o responsável
   congelado (`responsavel`, rubrica por `assinaturaRef`) e a empresa viva de `nr13_minha_empresa`.
2. **Template**: `CERTIFICADO-CAL-MANOMETRO.html` / `CERTIIFCADO-CAL-PSV.html`, preenchido pelo script `calibId`
   no `DOMContentLoaded` (lê o `localStorage`).
3. **Janela isolada**: `hostCertificado.comFolhaIsolada` materializa as chaves (`materializarChaves`, logo e rubrica
   hidratadas pela função do palco), monta o iframe fora da tela (`fonte=registro&ro=1`) e restaura tudo depois.
4. **HTML → canvas**: `certificados.folhaParaJpeg` — `html2canvas` escala 2, JPEG 0,95.
5. **PDF**: pdf-lib, UMA página A4 com a imagem inteira (`drawImage` 595×842 pt).
6. **Finalização**: `emissaoCertificado.emitirCertificado` — recusa sem responsável/logo/rubrica, SHA-256 dos bytes.
7. **Storage**: `salvarArquivo` → `<org>/certificados-calibracao/<uuid>.pdf` (fila das fotos, `pendente` do cofre).
8. **SHA/pdfRef**: `status:'emitido'` + `emissao{pdfRef, sha256, emitidoEm, paginas, pendente, logoRef, assinaturaRef}`.
   Depois disso: visualizar, baixar, imprimir, Portal e anexo ao relatório servem os bytes (`artefatoDaCalibracao`,
   `bytesArquivadosDaFolha` com conferência de SHA). A prévia do rascunho era o template num iframe pelo palco.

### Tipos

| TIPO | USA CERTIFICADO INTERNO? | MESMO TEMPLATE? | CAMPOS ESPECÍFICOS? |
|---|---|---|---|
| Manômetro | SIM | `CERTIFICADO-CAL-MANOMETRO.html` | seção 6: duas tabelas (crescente/decrescente) VC · VI · erro, 6 linhas; incerteza e k por sentido; unidade no título (sem unidade = `Kgf/cm²`) |
| PSV | SIM | `CERTIIFCADO-CAL-PSV.html` (mesmas seções 1–5, 7, 8) | seção 6: pressão de abertura, de ajuste e fechamento; incerteza e k; unidade nos três rótulos (só se gravada) |
| Termômetro | NÃO — só laboratório externo (`modeloInterno: null`) | — | — |
| Vacuômetro | NÃO | — | — |
| Pressostato | NÃO | — | — |
| Transmissor | NÃO | — | — |

Campos comuns (seções): cabeçalho (logo, título, nº, data de emissão) · 1 cliente (empresa, endereço) · 2 item
(instrumento, fabricante, modelo, série, referência, data da calibração, próxima) · 3 procedimento (texto fixo) ·
4 ambiente (temperatura, umidade, local) · 5 padrão (instrumento, série, nº certificado, validade) + rastreabilidade
RBC/INMETRO com selo · 6 resultados · 7 definições (texto fixo) · 8 conclusão (APROVADO/REPROVADO + motivo) + bloco do
responsável (rubrica, nome, função, registro) · rodapé com a empresa executante. Rascunho leva a marca
"RASCUNHO — NÃO EMITIDO".

### Assinatura, logo e fontes (antes)

- **Rubrica**: PNG no bucket (`assinaturas/<sha>.png`, 3.104 B no lab), referenciada por `responsavel.assinaturaRef`
  (snapshot no registro; dataURL só em cadastro legado). Hidratada no palco e **fotografada dentro do JPEG da página**
  — sem objeto próprio, sem proporção garantida pelo PDF.
- **Logo**: `nr13_minha_empresa.logoRef` (bucket) ou `logo` dataURL; idem, dentro do JPEG.
- **Fonte**: Inter via Google Fonts no template — nada embutido: a página inteira é uma imagem (texto extraível: 0).
- **Tamanho em produção** (somente leitura, 7 certificados emitidos): 568 503 a 661 057 B, 1 página cada — média
  ~615 KB/página. Todos `DCTDecode` 1588×2246.

## O que mudou

- `pdfVetorial/certificadoCalibracao.ts`: `modeloCertificado` (o registro lido com as MESMAS regras do script `calibId`
  — marcadores `----`/`DD/MM/AAAA`, `instrumento || nome`, `Kgf/cm²` sem unidade, `--` sem conclusão) e o desenho em
  jsPDF: Carlito embutida (a do relatório e do prontuário), `imagemEncaixada` das primitivas para logo/rubrica/selo,
  tabelas e fios em linha. Cabeçalho repetido por página, tabela quebra por linha, conclusão longa quebra de página
  com o responsável ao lado das primeiras linhas, rodapé desenhado por último em cada folha, "Página X de Y" só com
  mais de uma. Marca de rascunho por cima, translúcida (GState 0,16), como a camada do template.
- `emissaoCertificado.ts`: `gerarPdfCertificado` desenha em vetor; logo e rubrica vêm do cofre/bucket
  (`baixarFoto`), WEBP → PNG por canvas; cadastro que TEM a imagem e ela não veio continua recusando a emissão.
  Selo do Inmetro reduzido a 160 px (era metade do arquivo). `gerarPreviaCertificado`: leitura pura.
- Tela (`Calibracoes.tsx`, `ModalDetalhesLote.tsx`): rascunho interno abre em `PreviaCertificado` (VisualizadorPdfBytes,
  selo "Prévia do rascunho — não emitido") sem palco; baixar/imprimir o rascunho pelos bytes da prévia, pelo funil do
  trial (`avisarBloqueioDocumentos`). Emitido: arquivo, como antes. Legado sem `status`: template, como antes.

**Não mudou**: certificado de laboratório externo (nunca passa pelo gerador), anexo ao relatório (emitido = bytes
arquivados; legado = folha rasterizada como antes), Portal, Sync, Livro, Storage.

## Provas

Unitárias: `certificadoCalibracao.test.ts` (27: A obrigatórios, B opcionais, C texto longo, D assinatura, E logo,
F tabela, G paginação, H paridade com os templates — campo a campo pelos `c.xxx` que o script lê e textos fixos,
L unidades, M estrutura) e `certificadoVetorialFase7.test.ts` (8: I prévia só leitura, J emitido imutável — inclusive
raster antigo —, K externo intocado). `certificadoFase2.test.ts` adaptado (21). Mutantes: campo sumido → 1 falha;
sem marca de rascunho → 3; prévia gravando `localStorage` → 1; reabertura regenerando → 2.

E2E lab (bundle antigo `d3c79c7` em 5175 × novo em 5174, mesma massa sintética `seed.mjs`, pares idênticos), **31/31**:

| etapa | resultado |
|---|---|
| antigo emite MAN-A2 / PSV-A2 | raster, 655 424 B / 556 726 B, 1 pág, texto extraível 0, 1 imagem 1588×2246 |
| prévia nova (MAN-B2, PSV-B2, LONGO2) | vetor no VisualizadorPdfBytes, 0 iframe, 0 template, 0 POST de gravação, chaves vivas iguais |
| novo emite MAN-B2 | 60 604 B, 1 pág, SHA `a6d0f8b9…` = SHA gravado, `pendente:false`, Carlito embutida, 123 blocos de texto, imagens 300×100 (logo) · 160×160 (selo) · 400×120 (rubrica) |
| novo emite PSV-B2 | 59 807 B, 1 pág, SHA `850d8faa…` |
| LONGO2 (40 observações) | 2 páginas, "Página 1 de 2"/"2 de 2", cabeçalho repetido, nenhuma observação perdida, responsável uma vez |
| paridade | todo campo do DOM do template antigo (67 no manômetro, 31 na PSV) presente no PDF vetorial; nº e data próprios |
| F5 → reabrir MAN-B2 | "Documento arquivado", mesmo SHA, registro com o mesmo md5, 0 gravação |
| externo ZZ-TERM-02 | bytes do bucket = `pdfExternoSha256` (`a6e9287d…`) |
| imutabilidade | 20 emitidos/externos anteriores idênticos (registro, SHA, pdfRef); arquivos do bucket com mesmo tamanho e eTag; os 2 raster emitidos pelo antigo reabertos no fim com o mesmo SHA |
| mobile 390 | documento abre, `scrollWidth` 390, "Baixar PDF" 44 px |
| A4 | todas as páginas 210,0 × 297,0 mm |

Zoom 8× (≈576 dpi, `zoom.mjs`): antigo com serrilhado/artefato JPEG no texto; novo nítido — texto é texto.

### Tamanho

| | antigo (raster) | novo (vetor) | redução |
|---|---|---|---|
| manômetro | 640,1 KB/pág | 59,2 KB/pág | **90,8 %** |
| PSV | 543,7 KB/pág | 58,4 KB/pág | **89,3 %** |
| manômetro, 2 páginas | — | 30,8 KB/pág | — |

Composição do novo (manômetro, streams): fonte embutida 28,2 KB, selo 160×160 12,0 KB, logo 3,4 KB, rubrica 1,9 KB (cor + alfa), conteúdo 6,2 KB.
Antes do ajuste do selo: 97 KB/pág (selo 400×400 = 50 KB).

Produção (somente leitura, antes e depois): 7 certificados internos emitidos + 1 externo — mesmos registros (md5),
SHA e pdfRef.

## Diferenças visuais declaradas (sem mudar conteúdo)

- Fonte Inter (não embutida, fotografada) → Carlito embutida, a do relatório e do prontuário.
- Texto dos blocos alinhado à esquerda (o template justificava).
- Cabeçalho com altura fixa (75 px de logo) em vez de encolher sem logo.
- Sem `nr13_minha_empresa`: o template imprimia um rodapé de EXEMPLO ("NOME DA EMPRESA LTDA.", CNPJ
  00.000.000/0000-00); o vetorial escreve só "NOME DA EMPRESA NÃO INFORMADO".
- Mais de seis pontos por sentido: o template descartava a 7ª linha em silêncio; o vetorial imprime todas.
- Conteúdo longo: o template encolhia a fonte (`aperto-1..3`) e depois cortava o rodapé; o vetorial pagina.

## Limitações / P3

- Certificado LEGADO (sem `status`) anexado a relatório continua rasterizado pela folha (é o documento antigo; não
  foi convertido, como pedido).
- O botão "Abrir em outra aba" do próprio `VisualizadorPdfBytes` não passa pelo funil do trial — igual à prévia do
  relatório (13E), comportamento anterior a esta fase.
- `semeaduraCalibracoes.test.ts` estourou o timeout de 5 s uma vez sob carga (7/7 isolado, 274/274 no reteste).
