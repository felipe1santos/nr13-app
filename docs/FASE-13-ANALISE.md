# FASE 13 · ANÁLISE — nada implementado

**04/09/2026.** Análise pedida antes de qualquer código. O roteiro
(`FASE-10-DESENHO.md`) terminava na 12: a 13 não estava escrita, então esta é a
proposta de escopo.

---

## 1 · Escopo exato

> **A PRÉVIA PASSA A SER O DOCUMENTO.**

Hoje o usuário edita 27 folhas HTML (o desenho **Clássico**) e recebe um PDF
desenhado pelo motor vetorial (o desenho **Novo**). São dois documentos
diferentes na mesma tarefa: o que ele revisa não é o que ele assina.

A Fase 13 fecha esse ciclo — a tela mostra o PDF que vai ser emitido — e, ao
fechá-lo, permite aposentar o subsistema que só existe para servir as folhas
HTML do RELATÓRIO.

### Por que este tema, e não outro

Os candidatos eram três. Escolhi o primeiro:

| candidato | valor | risco | veredito |
|---|---|---|---|
| **prévia = documento** | acaba com a divergência do que se revisa × do que se assina; destrava a aposentadoria do palco | médio | **é a Fase 13** |
| layout Clássico em vetor | devolve a escolha de modelo | alto (1.500–2.000 linhas + gate folha a folha) | fica para depois, e só se o dono quiser dois modelos |
| só limpeza (código morto, SQL) | baixo custo | baixo | **entra junto**, como último bloco — não vale uma fase |

---

## 2 · O que ENTRA e o que FICA FORA

### Entra

1. **Editor React para os três campos que a folha grava hoje.** A varredura
   mostrou que só três templates vivos persistem dado:

   | template | chave |
   |---|---|
   | `ULTRASSOM.html` | `nr13_med_esp_`, `nr13_med_grid_` |
   | `CONCLUSAO.html` | `nr13_laudo_` |
   | `LIVRO-REGISTRO.html` | (já tem trava própria; **fica fora** — ver abaixo) |

   Ou seja: a superfície editável do relatório são **duas telas** (grade de
   espessuras e laudo), não vinte e sete.

2. **Prévia do relatório = PDF vetorial**, no visualizador pdf.js que a 12B já
   construiu (miniaturas fechadas, ajuste à largura, zoom).

3. **Painel "o que falta"** no lugar do amarelo: com a prévia em PDF não há mais
   `[contenteditable]` para pintar. A lista de campos vazios passa a ser
   derivada do MODELO — mais confiável, e ela já é a mesma fonte do PDF.

4. **Aposentadoria do caminho de folhas do RELATÓRIO**: palco, ponte,
   `sb-storage`, trava de somente-leitura e o gate de escrita, para essa tela.
   São **1.789 linhas** em 6 módulos que existem só por causa dos iframes.

5. **Limpeza** (último bloco): 6 folhas órfãs de `public/arquivos-prontuario/`,
   `nr13_croqui3d_` (legado só-leitura), `index.anterior.ts` do
   `portal_cliente`, e o `fase9_remocao_flags.sql` que nunca foi aplicado.

### Fica fora

| | por quê |
|---|---|
| **Livro / Registro de Segurança** | documento legal, lacrado, com trava no banco. Sai do escopo inteiro, inclusive do palco |
| **Certificados de calibração** | ver dependência D3 — são a única razão pela qual o gerador ainda precisa do DOM |
| **Prontuário** | a tela dele continua com as 6 folhas; só entra depois que o relatório provar o caminho |
| **Qualquer retrofit** | histórico não se regenera (§7-quater) |
| **Layout Clássico em vetor** | fase própria, se e quando for pedido |
| **Motor raster** | permanece como rollback, sem alteração |

---

## 3 · Dependências técnicas

| # | dependência | situação |
|---|---|---|
| D1 | visualizador pdf.js | **pronto** (12B) |
| D2 | gerador vetorial completo e validado | **pronto** (11/12A) |
| D3 | **o gerador ainda lê o DOM** para as folhas `CERTIFICADO-CAL-*` (`certificados.ts:69` rasteriza `.relatorio-preview .pagina-relatorio-a4`) | **bloqueia** desligar os iframes enquanto houver certificado no relatório |
| D4 | `nr13_med_esp_` / `nr13_med_grid_` / `nr13_laudo_` gravadas pela folha via `window.sbSalvar` | precisam de tela React antes de a folha sumir |
| D5 | prévia precisa gerar PDF a cada mudança | o vetorial leva ~1,8 s num relatório completo — aceitável com regeneração sob demanda, não a cada tecla |
| D6 | `familiasChave`, `essencial`, Portal | já sabem lidar com chave nova; nenhuma mudança de contrato |

**D3 é a dependência crítica.** Sem resolvê-la, o relatório com calibração
continua exigindo as folhas montadas — e o ganho vira meio ganho.

---

## 4 · Riscos

| risco | gravidade | mitigação |
|---|---|---|
| **Perder capacidade de edição** que hoje existe por acidente nos `contenteditable` (um inspetor pode estar corrigindo texto direto na folha, mesmo que não persista) | alta | medir antes: os campos não persistidos **já se perdem** hoje ao recarregar; documentar e confirmar com o dono |
| **D3**: certificado sem DOM | alta | manter o caminho antigo ligado quando o relatório TEM folha de calibração, até a 13 tratar o certificado |
| Prévia em PDF mais lenta que iframes em relatório grande | média | gerar sob demanda ("Atualizar prévia") em vez de a cada alteração |
| Regressão no que a 11/12A/12B validaram | média | flag de coexistência, como em todas as viradas anteriores; o caminho antigo continua no bundle |
| Aposentar palco cedo demais e quebrar prontuário/livro | média | o palco **só** é desligado para a tela do relatório; prontuário, livro e certificados continuam usando |
| Cota do Supabase | baixa | nada novo sobe; a prévia é local |

---

## 5 · Ordem ideal de execução

| bloco | o que entrega | virada? |
|---|---|---|
| **13A · medição** | varredura do que cada folha do relatório realmente lê e grava; lista fechada de campos editáveis; decisão sobre D3 | não — é documento |
| **13B · certificados sem DOM** | `CERTIFICADO-CAL-*` desenhada pelo gerador vetorial (ou o PDF do certificado anexado direto), removendo a dependência do `.relatorio-preview` | atrás de flag |
| **13C · edição em React** | grade de espessuras (ultrassom) e laudo da conclusão como telas próprias, gravando as mesmas chaves | não muda documento |
| **13D · prévia = PDF** | o visualizador da 12B passa a mostrar o vetorial em vez dos 27 iframes, com "Atualizar prévia" e o painel "o que falta" | **atrás de flag**, com o caminho antigo intacto |
| **13E · aposentadoria** | palco/ponte/sb-storage desligados **para a tela do relatório**; código preservado para prontuário e livro | depende de 13D validada |
| **13F · limpeza** | 6 folhas órfãs, `nr13_croqui3d_`, `index.anterior.ts`, `fase9_remocao_flags.sql` | inerte |

A ordem não é negociável em dois pontos: **13B antes de 13D** (senão o
certificado quebra) e **13C antes de 13E** (senão o inspetor perde onde digitar).

---

## 6 · Impacto em produção

| | |
|---|---|
| documentos já emitidos | **nenhum** — `pdfRef` continua sendo servido como arquivo |
| documentos novos | mesmo gerador, mesmo layout, mesmo SHA. A 13 muda **onde se revisa**, não o que se emite |
| Livro, certificados, prontuário | intocados até a 13 chegar neles |
| desempenho | menos memória (sem 27 iframes) e fim do teto de 3.368 KB do palco **para o relatório** |
| rollback | flag, como nas oito viradas da Fase 9 e nas duas da 11/12 |

---

## 7 · Migração, limpeza, consolidação e UX pendente

**Migração de dado:** nenhuma. As chaves não mudam.

**Consolidação de fluxo:** é o coração da fase — hoje existem dois pipelines de
documento (folhas HTML + motor vetorial) e a 13 encerra o primeiro **para o
relatório**.

**Código morto identificado:**

| item | tamanho |
|---|---|
| `PRONT-P1/P2/P2B/P3/P4/PRONT-CARACTERIZACAO` | ~90 KB, zero referências |
| `nr13_croqui3d_` | fallback de leitura, sem gravador |
| `portal_cliente/index.anterior.ts` | versão anterior guardada no repo |
| `fase9_remocao_flags.sql` | nunca aplicado, inerte |

**UX pendente, herdada:**

- o Portal não mostra o **prontuário emitido** (`nr13_pront_emitido_` negada com
  motivo declarado);
- filtros de `/relatorios`, `/prontuarios` e `/calibracoes` ainda são do CLIENTE
  — falta SQL na projeção (10A);
- o **modelo Clássico** está retirado da oferta: ou ganha layout vetorial, ou é
  removido de vez.

---

## 8 · Estimativa

| bloco | rodadas |
|---|---|
| 13A · medição | 1 |
| 13B · certificados sem DOM | 1–2 |
| 13C · edição em React | 2 |
| 13D · prévia = PDF | 2 |
| 13E · aposentadoria | 1 |
| 13F · limpeza | 1 |
| **total** | **8–9 rodadas**, com portão do dono ao fim de cada bloco |

Se o objetivo for só reduzir dívida sem mexer na tela, **13F sozinha resolve em
1 rodada** — e é a única parte desta fase sem risco nenhum.

---

## 9 · DECISÃO DA 13B — **B1**, registrada em 04/09/2026

O dono escolheu **B1** entre as duas saídas levantadas pela medição (13A §3):

| | |
|---|---|
| folha de calibração (`CERTIFICADO-CAL-*.html`) | montada **fora da tela**, rasterizada **só ela**, visual preservado exatamente |
| certificado do laboratório (`nr13_rastreab_`) | continua entrando pelo **pdf-lib**, sem rasterizar |
| redesenhar certificado em vetor | **não agora** |

> **É exceção documental localizada.** A 13B tem de ENCAPSULAR essa necessidade
> fora da prévia e do editor: montar o que ela precisa, usar, e descartar. O que
> não pode voltar é a tela principal depender dos 27 iframes por causa dela —
> isso anularia a 13D e a 13E.

Consequência de projeto que a 13B precisa resolver: a folha lê
`nr13_calibracao_item_<id>`, `nr13_minha_empresa` e `nr13_relatorio_meta_atual`
do `localStorage`. Montá-la fora da tela exige materializar **essas chaves** —
não o documento inteiro. O palco continua existindo para esse recorte, e é só
isso que sobra dele no caminho do relatório.

---

## 10 · Correção de conteúdo feita ANTES da 13B (04/09/2026)

Autorizada fora da ordem porque documentos novos estavam saindo com dado real
vazio. Detalhe em `medicoes/2026-09-04-13a-medicao.md` §4; correção no commit
`e2a4e1b`.

| campo | antes | agora |
|---|---|---|
| CLASSE DO FLUIDO | `cat.classeFluido` (inexistente) | `cat.classe` |
| VOLUME (m³) | `cat.volume` (inexistente) | `info.volume` → `cat.volInput` |
| FLUIDO DE OPERAÇÃO | `cat.fluido` (inexistente) | `cat.fluidoInput`, sem o prefixo da classe |
| ENQUADRAMENTO | `cat.enquadramento` (inexistente) | `cat.isEnquadrado`, e `null` continua sendo ausência |
| PMTA / PTH | só aceitava `number` | `numeroDoStorage` aceita `"1.25"` e `"12,50"`, recusa texto |

E o gate que faltava: **`storageParaModelo.test.ts`** parte do dado gravado e
exige que ele chegue ao modelo. O gate antigo (`conferencia.ts`) compara o
modelo consigo mesmo e é cego para chave com nome errado.
