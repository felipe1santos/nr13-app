# 13B · a folha de calibração deixou de sair da tela

**04/09/2026.** Decisão B1 executada: o gerador do Modelo Novo não depende mais
de `.relatorio-preview` para produzir a folha `CERTIFICADO-CAL-*`.

---

## 1 · O que era, e por que incomodava

```
gerarRelatorioVetorial
  → anexarFolhasDeCertificado(bytes, documentos, '.relatorio-preview')
  → document.querySelectorAll('.relatorio-preview .pagina-relatorio-a4')[i]
  → html2canvas(iframe.contentDocument.body)
```

Duas consequências:

1. **a emissão do PDF dependia da TELA** — sem os 27 iframes montados, a folha de
   certificado simplesmente não entrava no documento;
2. `contarFolhasDeCertificado` contava só as folhas MONTADAS, então com a prévia
   fechada o "Página X de Y" prometia menos páginas do que o arquivo teria.

O segundo era um defeito latente, não só dívida de arquitetura.

## 2 · O que passou a ser

`pdfVetorial/hostCertificado.ts`:

```
para cada folha CERTIFICADO-CAL da COMPOSIÇÃO:
  materializa as 4 chaves que ela lê
  monta UM iframe num contêiner fora da interface
  espera load + imagens
  html2canvas dessa folha
  destrói o contêiner e restaura as chaves
```

| detalhe | por quê |
|---|---|
| `position: fixed; left: -20000px` | `display:none` faria o `html2canvas` medir tudo como zero |
| `ro=1` na URL | a folha nasce somente-leitura; um host invisível é o último lugar onde uma escrita acidental seria notada |
| timeout de 8s no `load` | rede lenta ou template quebrado não podem travar a emissão para sempre |
| 350 ms depois do `load` | o script do template preenche no `DOMContentLoaded`; rasterizar antes pegaria a folha vazia |
| chaves restauradas no `finally` | o host não pode deixar rastro no `localStorage` de quem chamou |

### As quatro chaves — e por que não o palco

A folha lê `nr13_minha_empresa`, `nr13_relatorio_meta_atual`,
`nr13_injecao_atual` e `nr13_calibracao_item_<calibId>`. O host materializa
**só essas**, e apenas quando ainda não existem.

Não reusa `palco.ts` de propósito: aquele módulo tem trava por aba, manifesto e
orçamento de 3.368 KB para um DOCUMENTO inteiro. Aqui são quatro chaves e uma
folha — reaproveitar a maquinaria significaria disputar a trava com o documento
que talvez esteja aberto na mesma aba.

### A contagem saiu do DOM

`contarFolhasDeCertificado(documentos)` conta a LISTA. Além de remover a
dependência, conserta o defeito latente do §1.

## 3 · O que NÃO mudou

| | |
|---|---|
| aparência da folha | idêntica — mesmo template, mesmo `html2canvas` a `scale: 2`, mesma página A4 |
| certificado do LABORATÓRIO (`nr13_rastreab_`) | continua entrando por **pdf-lib**, com os bytes originais. Não é rasterizado |
| corpo do relatório | vetor de ponta a ponta |
| motores | nenhum novo. jsPDF + pdf-lib + `html2canvas` **só** nesta exceção |

`containerSelector` saiu de `OpcoesVetorial` e dos dois chamadores: era a opção
que apontava para a tela, e não sobrou ninguém para apontar.

---

## 4 · Prova em produção

Bundle **`assets/index-ClEmScow.js`**. Org de teste, `ZZ-TESTE-P2`.

Relatório `REL-1788566885335` com **CAPA + ULTRASSOM + LOTE DE CALIBRAÇÃO**, que
resolve a composição para:

```
CAPA.html
ULTRASSOM.html
CERTIFICADO-CAL-MANOMETRO.html?calibId=cal-1788317422995
```

### O teste decisivo

Antes de clicar em Finalizar, **`.relatorio-preview` foi REMOVIDA do DOM** —
zero iframes na página — com um `MutationObserver` observando o host isolado:

| | |
|---|---|
| `.relatorio-preview` na tela | **removida** (`document.querySelectorAll('iframe').length === 0`) |
| hosts isolados criados / destruídos | **1 / 1** — exatamente uma folha de certificado |
| resultado | `status: Aprovado`, **4 páginas**, SHA `2c5cc46df4d57a85`, 589.043 bytes, `pdfPendente: false` |

As 4 páginas, conferidas na renderização do arquivo:

| # | o que é | por onde entrou |
|---|---|---|
| 1 | CAPA | vetor |
| 2 | ULTRASSOM | vetor |
| 3 | **CERTIFICADO-CAL-MANOMETRO** — seções 1 a 5, tabelas, logo do INMETRO, item calibrado `PSV-GATE-9F3`, data 01/09/2026 | **host isolado** |
| 4 | **"ZZ-TESTE-F6 rastreabilidade"** — o PDF do laboratório | **pdf-lib**, bytes originais |

> Os três cenários pedidos saíram do MESMO documento: as páginas 1 e 2 provam o
> cenário A (corpo emitido com zero iframes na tela), a 3 prova o B (só a folha
> necessária, montada isolada) e a 4 prova o C (PDF de origem preservado).

O SHA do arquivo baixado bate com o do registro, e o rodapé do visualizador
confirma "4 páginas".

### Uma observação sobre o método

Arrancar `.relatorio-preview` do DOM é violento com o React — depois da
finalização a tela caiu no "Recarregar página", como esperado de um nó removido
por fora da árvore. **O documento não foi afetado**: o registro estava gravado,
com upload confirmado, e reabriu inteiro pelo histórico. Foi um teste
deliberado, não um caminho de uso.

---

## 5 · Gate

`pdfVetorial/hostCertificado.test.ts` — 8 testes. O que ele trava:

- a folha de certificado é reconhecida pelo NOME do arquivo, não pela tela
  (inclusive o `CERTIIFCADO` com o erro de digitação preservado);
- as posições saem da lista de documentos;
- **`contarFolhasDeCertificado` não chama o DOM** — um espião registra qualquer
  `querySelectorAll` e o teste falha se alguém devolver a dependência;
- as chaves do host são as quatro, e nenhuma de foto, memorial ou checklist;
- relatório sem calibração não tem o que anexar.

| | |
|---|---|
| suíte | **1.903 testes, 157 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 6 · Fora do escopo, não tocados

Editor React (13C), prévia em PDF (13D), UX do visualizador, palco/ponte,
limpeza, Livro, Prontuário e PDFs históricos.
