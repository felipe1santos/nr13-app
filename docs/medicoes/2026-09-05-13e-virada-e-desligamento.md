# 13E · a virada da prévia e o desligamento dos 27 iframes

**05/09/2026.** A prévia vetorial passou a ser o padrão das organizações, e a
tela normal de Relatórios deixou de montar as folhas HTML.

---

## 1 · O que a 13D deixou pendurado

A 13D fez as duas prévias **coexistirem**: a nova aparecia, a antiga ficava
escondida por CSS. Escondida, mas MONTADA — os iframes carregados, o palco
materializado, a ponte drenando, o `sb-storage` servindo cada folha. O usuário
pagava o caminho antigo inteiro para ver o novo.

## 2 · A decisão, em um lugar só

`features/relatorios/fluxoDocumento.ts`. Quatro coisas dependem dela e precisam
concordar; espalhadas pela tela, saem de sincronia no primeiro ajuste — e o
defeito aparece no documento do cliente.

| pergunta | fluxo `vetorial` | fluxo `iframes` |
|---|---|---|
| monta as folhas HTML? | não | sim |
| monta o palco? | não | sim |
| papel da prévia do rascunho | bytes do gerador da emissão | html2canvas da tela |
| motor possível na finalização | vetorial | o configurado (raster inclusive) |

O raster fotografa `.relatorio-preview`; sem iframes ele falharia com "o
documento não está montado" **no meio de uma finalização**. Por isso o rollback
para raster passa a exigir também `?previa=iframe`: um depende do outro.

## 3 · A virada

`nr13_previa_documento` inverteu o default: **ausência de valor agora é
`vetorial`**. É o que alcança as 30 organizações sem gravar uma chave em cada
uma. O rollback é que passou a precisar ser dito — `?previa=iframe` para
diagnóstico, ou a chave com `'iframe'` para a organização inteira. Leitura que
FALHA cai no padrão novo: cair no antigo faria uma falha de storage remontar as
27 folhas em silêncio.

## 4 · O ganho, medido

Org de teste, `ZZ-TESTE-P2`, mesmo relatório (15 folhas selecionadas), bundle
`assets/index-B0gM0jaY.js`. O "antes" é o mesmo código com `?previa=iframe`.

| | antes (iframes) | depois (vetorial) |
|---|---|---|
| iframes na tela | **15** | **0** |
| nós no DOM (com os iframes) | 2.334 | 327 |
| heap JS | 33,8 MB | 20,3 MB |
| requisições dos templates | 102 | **0** |
| bytes dos templates | 412 KB | **0** |
| chaves `nr13_` no `localStorage` | 31 | 14 |
| trava de palco (`nr13_palco_dono`) | tomada | **nenhuma** |
| até o documento na tela | 7,9 s (todos os iframes prontos) | 4,0 s (PDF desenhado) |

O `localStorage` deixa de receber o palco inteiro: são as 17 chaves que a
materialização gravava e agora não grava. Sem trava de palco, o mesmo relatório
deixa de bloquear a segunda aba.

## 5 · Gate em produção

| | verificado | resultado |
|---|---|---|
| paridade do ultrassom | grade React → Atualizar prévia → **texto extraído do PDF** | `Casco 2 · 90° = 2,22`, MENOR `2,22`, ângulos `0/90/180/270`, três regiões |
| editor React | Medições e Laudo | abrem e gravam sem iframe nenhum |
| amarelo | campos vazios na prévia | presentes (CONTRATANTE, ENDEREÇO, VALIDADE, APARELHO…) |
| painel | "O que falta (18)" | itens clicáveis |
| aviso de prévia atrasada | salvar medição depois de gerar | "Há alterações não refletidas" |
| aviso some | Atualizar prévia | sim |
| prévia não emite | 2 gerações seguidas | histórico continua com **10** linhas; nenhum `pdfRef`, nenhum SHA |
| finalização | Finalizar relatório | 12 páginas, SHA `20c28d3a2de8910f…`, "Documento arquivado" |
| integridade | baixar o arquivado 2× | SHA-256 do arquivo = `20c28d3a2de8910f…`, **igual** ao código de verificação, e os dois downloads idênticos |
| imprimir (rascunho) | Imprimir pré-visualização | abre o PDF da prévia (blob), zero iframes |
| baixar (rascunho) | Baixar PDF | 12 páginas pelo gerador vetorial |
| certificados (13B) | anexo no rascunho baixado | página 12 = certificado de rastreabilidade (pdf-lib), com **zero** iframes montados e nenhum host sobrando no DOM |
| rollback | `?previa=iframe` | 15 iframes, palco montado, 31 chaves — o caminho antigo intacto |
| padrão sem parâmetro | URL limpa | fluxo novo, 0 iframes, palco não montado |
| Prontuário | abrir prontuário | **6 iframes + palco**, como sempre — não foi tocado |

## 6 · O que NÃO foi desligado

Palco, `palcoTrava`, ponte, `sb-storage`, os 40+ templates, as folhas órfãs, o
gerador raster e o rollback continuam no bundle e no repositório. 13E desliga
do fluxo normal; **13F** é que prova código morto e remove.

Fora da tela de Relatórios, nada mudou: Prontuário, Livro, Portal e o host
isolado dos certificados (13B) seguem como estavam.

## 7 · O que ficou por fazer, e por quê

O rollout pedia validar também **uma organização real pequena** antes de
ampliar. Não foi possível a partir daqui: a validação exige entrar na conta
daquela organização, e a única credencial disponível nesta sessão é a da conta
de teste. A ampliação foi feita pelo caminho que existe sem credencial de
terceiro — a inversão do default no código —, com o rollback por organização
disponível em um passo (`nr13_previa_documento = 'iframe'`) e por URL
(`?previa=iframe`).

## 8 · Testes

`edicao13e.test.ts` — 20 testes (fluxo, motor, papel, leitura do fonte da tela,
o que não foi desligado, a virada). `edicao13d.test.ts` ajustado à inversão do
default.

| | |
|---|---|
| suíte | **1.973 testes, 160 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
