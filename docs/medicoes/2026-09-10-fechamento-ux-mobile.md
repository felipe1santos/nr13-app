# Fechamento da auditoria mobile + containers de inspeção — 10/09/2026

Commits `d568d8e`, `6f6132e`, `7ed7aec`, `b79e969`, `a3814d6`, `4a0c4b7`.

**Largura REAL de medição.** A janela do Chrome desta máquina reporta
`outerWidth: 0` e recusa `resize`. Tudo abaixo foi medido com o app dentro de
um `<iframe>` de largura fixa: **390 px de moldura = 388 px de `innerWidth`**.
Desktop: 1400 → 1396–1397. Tablet: 768 → 765.

---

## 1. As telas que faltavam

Todas em 388 px. `overflow` = excesso horizontal do documento.

| tela | overflow | fora da borda | botões < 40 px | campo mais estreito |
|---|---|---|---|---|
| `/equipamento/ZZ-FASE3` (ficha) | 0 | 0 | 12 | 127 px |
| `/equipamento/ZZ-FASE3/memorial` | 0 | 0 | 14 | 307 px |
| `/inspecoes/:tag/:container` | 0 | 0 | 14 | — |
| formulário **ultrassom** | 0 | **36** | 17 | 181 px |
| formulário **visual externo** | 0 | 0 | 10 | 149 px |
| formulário **teste hidrostático** | 0 | **18** | 18 | 149 px |
| editor do relatório | 0 | 0 | — | — |
| `/calibracoes` | 0 | 0 | 4 | 161 px |
| `/certificados` | 0 | 0 | 6 | 16 px |
| `/livro-registro` | 0 | 0 | 5 | 265 px |
| `/acesso` | 0 | 0 | 18 | 77 px |
| `/empresas` (clientes) | 0 | 0 | 10 | — |
| `/funcionarios` | 0 | 0 | 8 | — |

**Nenhuma tela tem rolagem horizontal do documento.**

### O achado que virou correção

Ultrassom e TH tinham 36 e 18 elementos passando da borda direita.
`.linha-medida-campos` usa `repeat(2, 1fr)`, e `1fr` **não encolhe abaixo do
min-content**: o input de texto tem largura mínima própria (~170 px no Chrome),
então duas colunas de **181 px** ficavam dentro de um bloco de **286 px** e a
segunda saía cortada. `minmax(0, 1fr)` + `min-width: 0` no campo.

É o mesmo defeito do `plate-meta-grid` na rodada anterior — terceira
ocorrência do mesmo padrão no projeto.

## 2. Editor do relatório no celular

| | antes | depois |
|---|---|---|
| topbar | 49 px | 49 px |
| barra do editor | **140 px, três linhas** | **96 px, duas linhas** |
| botões à vista | 6 | 3 + `⋯` |
| alvo de toque | 38 px | 44 px |
| overflow | 0 | 0 |

Voltar, Salvar e Finalizar ficam à vista; imprimir prévia, baixar PDF e
configurações descem para o `⋯`, que **só existe abaixo de 640 px**. Abaixo
dessa largura os rótulos também perdem a palavra redundante ("Salvar
rascunho" → "Salvar").

> **Não chegou a uma linha.** Além dos quatro controles, a barra carrega o chip
> "Rascunho", que é estado do documento e não sai. 96 px é o medido.
> `components/MenuMais` mantém item desabilitado VISÍVEL (sumir esconderia a
> existência da ação) e tem `destrutiva` para não ocultar gesto perigoso sem
> identificação.

## 3. /relatorios: 44 px contra altura

O item 3 e o item 4 pedem coisas opostas, e o item 3 é explícito ("não quero
resolver isso reduzindo área de toque"). Três botões de 44 px pedem ~140 px; a
última coluna da grade tem ~87 px em 388 px. As ações voltaram a ter faixa
própria, agora com 44 px.

| | antes desta rodada | depois |
|---|---|---|
| altura da linha | 106 px | **~124 px** (faixa de ação de 44) |
| alvo de toque | 34 px | **44 px** |

Trade-off consciente e reversível. O caminho para ter os dois é o `⋯` na
linha da lista — declarado como pendência, não resolvido encolhendo o dedo.

## 4. Barra de alerta (fixture)

Não há conta com prazo de acesso vencendo, então o banner foi medido por
**fixture**: a mesma marcação de `Layout.tsx` injetada num iframe de 390 px.

| | antes | depois |
|---|---|---|
| `.aviso-expiracao` | **62 px, 3 linhas** | 1–2 linhas |

A frase virou duas — o fato ("Faltam 12 dias para o seu acesso vencer") e a
instrução ("Contate o administrador para renovar"). Abaixo de 640 px sai a
instrução; o fato fica inteiro.

## 5. Cobertura do feedback de salvamento

| ação | tinha feedback? | devia? | implementado |
|---|---|---|---|
| ficha do equipamento | **não** — saía do modo edição e pronto | sim | ✅ |
| memorial (vaso/caldeira/autoclave) | sim — `comLoadingGlobal` + `emitirAviso`, sucesso E erro | já ok | mantido |
| exame externo | sim (cópia própria) | sim | ✅ unificado |
| exame interno | sim (cópia própria) | sim | ✅ unificado |
| ultrassom | **não** | sim | ✅ (rodada anterior) |
| teste hidrostático | sim (cópia própria) | sim | ✅ unificado |
| checklist | sim (cópia própria) | sim | ✅ unificado |
| rascunho de relatório | sim — `toast-sucesso` | já ok | mantido |
| renomear container | — (novo) | sim | ✅ |
| componente de calibração | **não** — gravava e fechava | sim | ✅ |
| prontuário / certificado / registro de segurança | não medido | — | pendente |

Em todos os casos aplicados, o check só aparece depois do `await`; no `catch`
não existe caminho para `'salvo'`, e há teste que lê a fonte para travar isso.

## 6. Containers de inspeção

### Renomear — E2E medido

| passo | resultado |
|---|---|
| lápis no cartão | 2 cartões, 2 lápis |
| modal | título "Renomear container", nome atual preenchido, Cancelar/Salvar |
| nome vazio (`"   "`) | Salvar **desabilitado** + mensagem de erro |
| nome longo (89 caracteres) | aceito |
| feedback | `fbs-salvando` → modal fecha |
| lista | nome novo **imediatamente** |
| F5 | nome novo mantido |
| abrir o container | id **inalterado** (`cont1788980467771_9a1921fa`), ensaio ainda **Preenchido** |

`renomearContainer` reescreve só o rótulo — `id`, `criadoEm`, `ensaios` e
`dados` intactos. É isso que faz o rename não desfazer o vínculo dos ensaios
nem a origem (`meta.containerOrigemId`) de relatórios já emitidos.

> Detalhe medido: o estado `Salvo` não chega a ser visto porque o modal fecha
> no sucesso e leva o aviso junto. A confirmação de fato é a lista mudando.

### Ajuda

`i` ao lado do título abre `AjudaContainers`, reaproveitando o `ModalAjuda` de
Calibrações e Certificados. Três passos — criar, preencher, usar no relatório
— com a distinção que confunde a tela dita por escrito: **atribuir um ensaio
não é preenchê-lo**. Ilustração `/ilustracoes/container-inspecao.webp`
(11.216 → **5.488 bytes**, WebP q88).

## 7. Assistente · etapa 3

A arte entrou na PRIMEIRA faixa (`grid-row: 1`, canto superior direito) e
termina ali: os blocos de documentos, inspeção e revisão voltam a ocupar a
largura toda. `aspect-ratio` + `object-fit: contain` — não deforma. No celular
ela encolhe para 84 px e fica ao lado do primeiro bloco.

## 8. Responsividade do assistente (medida depois do deploy)

| | 388 | 765 | 1397 |
|---|---|---|---|
| caixa | 355 × 514, dentro | 660 × 490 | 660 × 490 |
| linha de container | 68 px | 64 px | 64 px |
| lista | 206 px, rola por dentro | 194 px | 194 px |
| olho | 44 px | 34 px | 34 px |
| overflow | 0 | 0 | 0 |

---

## O que NÃO foi feito

1. **Prontuário, certificado e registro de segurança**: a cobertura do
   feedback de salvamento neles não foi medida.
2. **Modais internos** (adicionar calibração, Informações, novo registro,
   viewer do registro) foram vistos apenas pelas telas que os hospedam — não
   abri cada um em 388 px.
3. **`/relatorios` subiu para ~124 px** (§3 acima). O `⋯` na linha da lista é
   o caminho para ter altura e alvo juntos.
4. **A barra do editor não chegou a uma linha** (96 px, duas).
5. **`ZZ RENOMEADO — …`** ficou em `ZZ-FASE3`: é o container do E2E de rename.
