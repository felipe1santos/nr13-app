# 9D.1 — O TETO REAL DO BOOT LEVE, MEDIDO EM PRODUÇÃO

**24/08/2026** · projeto `qqsesrntfvmdxqxrfvmw` (SAAS NR13) · SQL Editor do painel
Consulta: `scripts/fase9/medir-teto-boot.sql` · **somente leitura**, nada foi alterado.

---

## 1 · A pergunta

A 9D.1 pede um número, não uma estimativa: **quantos bytes o boot passa a baixar** com a
lista de `src/services/essencial.ts`, e quantos ele **deixa de baixar**.

---

## 2 · Por organização (as 8 maiores das 11 com dado vivo)

| organização | equip. | chaves | **KB hoje no boot** | chaves ess. | **KB boot leve** | % do que era | KB em `rastreab` |
|---|---:|---:|---:|---:|---:|---:|---:|
| `06f84f2e…d1fe5e` | 38 | 344 | **1.103** | 8 | **433** | 39,3 % | 396 |
| `99f642d3…8d211c` (teste) | 4 | 59 | 595 | 8 | 61 | 10,3 % | 0 |
| `32512667…88d0f7e` | 4 | 113 | 592 | 8 | 64 | 10,9 % | 1 |
| `0a264586…5bbdfcd` | 2 | 23 | 455 | 2 | 0 | 0,0 % | 0 |
| `92a28bff…98488a75` | 3 | 64 | 355 | 6 | 16 | 4,4 % | 1 |
| `32d3fa95…46fda9593` | 4 | 58 | 308 | 4 | 9 | 2,9 % | 0 |
| `be25cb86…3b74bcd09` | 2 | 31 | 163 | 6 | 50 | 30,7 % | 0 |
| `675ca636…7118d36f2` | 2 | 26 | 10 | 5 | 1 | 6,2 % | 0 |

## 3 · Por família, na base inteira

| família | chaves | KB total | KB maior | KB média |
|---|---:|---:|---:|---:|
| `nr13_rastreab_` | 9 | **398** | **197** | 44,3 |
| `nr13_lista_phs` | 8 | 196 | 56 | 24,5 |
| `nr13_minha_empresa` | 9 | 33 | 7 | 3,6 |
| `nr13_clientes` | 9 | 7 | 2 | 0,8 |
| `nr13_termos_aceite` | 4 | 0 | 0 | 0,0 |
| `nr13_agenda_notas` | 1 | 0 | 0 | 0,0 |
| `nr13_permissoes_` | 3 | 0 | 0 | 0,0 |
| `nr13_uso_contadores` | 7 | 0 | 0 | 0,0 |

---

## 4 · O que o número diz

**O teto é ~433 KB no pior caso medido, e é CONSTANTE.** Nenhuma família do essencial
cresce com o número de equipamentos — a regra está travada por teste
(`hidratacaoEssencial.test.ts` compara a lista com `POR_TAG`). Isso é o critério de aceite
da 9D: *o boot não depende do tamanho da organização*.

O ganho não aparece nestas contas porque elas são pequenas: a maior tem 38 equipamentos.
Ele aparece na escala que a Fase 8 mediu — **51.000 equipamentos = 1,63 GB e ~4 min**, que
com o boot leve viram os mesmos ~433 KB.

### A decisão que a medição informava: `nr13_rastreab_` fica

Na maior conta, **396 dos 433 KB são de `nr13_rastreab_`** — um único certificado padrão
tem 197 KB, porque no `app_storage` o registro vai COMPLETO, com o PDF (§2-bis). Tirá-lo do
essencial derrubaria o boot de 433 KB para **37 KB** (3,4 %).

**Fica assim mesmo, e a razão é o custo do erro oposto.** A injeção dos certificados no
relatório lê essa família do `Map`, de forma síncrona. Carregá-la sob demanda arrisca o
defeito que o §2 do CLAUDE.md registra como o mais caro por ser SILENCIOSO: a folha cai no
`|| '{}'`, imprime "-" e ninguém vê erro nenhum — foi exatamente o que aconteceu em 13/08.
O critério de aceite já está cumprido com folga por 433 KB constantes; trocar isso por
37 KB não compra nada que o usuário perceba, e paga com risco em documento assinado.

Se um dia essa conta mudar (uma organização com dezenas de certificados padrão), a saída
não é tirar a família do boot: é parar de mandar o `pdfBase64` dentro do registro que o
cliente baixa — o mesmo caminho que a Fase 2 (fotos no bucket) já abriu.

---

## 5 · Reprodução

`scripts/fase9/medir-teto-boot.sql`, colado no SQL Editor. **Manha do painel** (custou tempo
em 23/08 e de novo hoje): a aba do SQL Editor só monta o Monaco quando fica VISÍVEL — em
segundo plano `document.visibilityState` é `hidden` e o editor nem existe. Um screenshot
força o render; depois disso `window.monaco.editor.getEditors()[0].setValue(sql)` escreve a
consulta e `Ctrl+Enter` executa. O clique no botão *Run* sozinho não pegou.
