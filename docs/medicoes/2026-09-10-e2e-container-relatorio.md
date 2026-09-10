# E2E container → relatório, e os três defeitos que ele achou — 10/09/2026

Commits `f3f3710`, `036824a`, `397cbf2`.
Conta `teste@gmail.com`, equipamento **ZZ-FASE3** (vaso de pressão), container
**"Inspeção da IA"** (`cont1788990746084_78a10501`) criado do zero para esta
auditoria.

---

## 1. Estado atual

A cadeia funciona de ponta a ponta. Chegou lá depois de três defeitos, e os
três produziam a MESMA aparência para o usuário — "o teste hidrostático não
chega ao relatório" — por causas completamente diferentes.

## 2. Cadeia container → relatório

| formulário | chave persistida | dentro do container | leitor do relatório | folha |
|---|---|---|---|---|
| Checklist NR-13 | `nr13_docs_<TAG>` | `dados.checklist` | `insp.checklist` | 11, 14, 15 |
| Visual externo | idem | `dados.visual_externo` | `inj.visual_externo` | 16, 17 |
| Visual interno | idem | `dados.visual_interno` | `inj.visual_interno` | 18, 19 |
| Ultrassom | idem | `dados.ultrassom` | `inj.ultrassom` + `nr13_med_grid_<TAG>` | 20 |
| Teste hidrostático | idem | `dados.th` | `inj.th` | 21 |

O elo entre os dois lados é `gravarInspecaoOrigemAtual`, que copia o blob do
container para as chaves globais `nr13_inspecao_atual` e `nr13_injecao_atual`
(a duplicação é obrigatória — §2 do CLAUDE.md). `meta.containerOrigemId` guarda
de qual container o documento veio.

## 3. Defeito 1 · os campos recusavam vírgula

Digitei `22,5`, `25,5` e oito pontos de curva com vírgula. **Todos os campos
ficaram vazios**, sem aviso: eram `<input type="number">`, e o navegador recusa
a vírgula.

Sem pressão na curva, `pontosDaCurva` devolve `null` em tudo,
`pontos.some(p => p.pressao !== null)` dá falso e **o gráfico não é
desenhado**. Era a queixa que abriu a rodada.

Não era só o gráfico: as três pressões do TH e, no ultrassom, a espessura
nominal, a velocidade sônica e **cada uma das 24 medidas**. Todos passaram a
`type="text" inputMode="decimal"`.

`numeroDoTexto` também truncava — `/[\d.]+/` casava só o "12" em "12,5". O
teste que existia **documentava o truncamento como correto** ("igual ao
template"): era paridade com um template que erra.

## 4. Defeito 2 · a TAG vinha do estado do React

Com a vírgula resolvida, o container ficou completo — conferido no IndexedDB:
36 respostas de checklist, 24 medições, 15+15 respostas de exame, 8 pontos de
curva, 5 fotos.

O relatório saiu com **26 páginas e todos os ensaios em branco**.
`meta.containerOrigemId` correto; `nr13_injecao_atual` e `nr13_inspecao_atual`
**vazias**.

`finalizarGeracao` lia `tag`, que é **estado do React**. No caminho do
assistente ela roda no mesmo tick de `abrirEquipamento`, que acabou de chamar
`setTag` — e `tag` ainda vale `''`. `carregarContainer('', id)` lê a chave
`nr13_docs_` (sem TAG) e devolve `{}`.

É o mesmo defeito que `pendente` já tinha e que já estava resolvido ao lado,
por parâmetro; a TAG passou despercebida quando o assistente foi escrito. Ela
não afetava só o container: `expandirMemorial`, `expandirFolhasUltrassom`,
`montarListaComTermoAbertura` e `carregarAssinantesRel` leem todas por TAG.

Depois da correção: **30 páginas** (as folhas de foto entraram) e as 5 chaves
presentes.

## 5. Defeito 3 · a grade de espessuras de uma inspeção contaminava outra

O mais grave. O PDF arquivado imprimiu, na folha 7.4:

```
Tampo Superior   6.32  6.23  6.11  6.06
Casco 1          6.00  6.04  5.94  5.91
```

**Nenhum desses números foi medido nesta inspeção.** Os meus eram
`9,41 · 9,38 · 9,45 · 9,40 · 9,12 …`. Vieram de uma rodada anterior do mesmo
vaso.

`nr13_med_grid_<TAG>` é uma chave por **equipamento**, e `montarGrade` a fazia
vencer o container sempre — *"a digitada vence, é a mais recente"*. Sem dono
declarado não há como saber de qual inspeção ela é.

> Campo vazio o revisor percebe. **Número errado, não**: ninguém desconfia de
> um número num documento assinado.

A grade passa a carimbar `containerId`: prevalece quando é daquele container (a
correção manual dentro do documento continua vencendo) e deixa de existir para
os outros. Grade legada, sem dono, cede a célula que o container sabe preencher
e mantém as que ele não tem.

## 6. Matriz campo a campo — PDF FINAL arquivado

`REL-1788993628387`, 30 páginas, SHA `9f823206…`, `pdfPendente: false`,
`containerOrigemId: cont1788990746084_78a10501`. Texto extraído dos **bytes do
bucket** com o pdf.js do próprio app.

| origem | sentinela | página no PDF | OK |
|---|---|---|---|
| Checklist · observações | `OBS-CHECKLIST-IA-1` / `-3` | 11 | ✅ |
| Checklist · comentário documentação | `COMENTARIO-DOC-IA` | 11 | ✅ |
| Checklist · foto documentação | `FOTO-DOC-IA` | 14 | ✅ |
| Checklist · foto | `FOTO-CHECKLIST-IA` | 15 | ✅ |
| Externo · observações | `OBS-EXTERNO-IA` | 16 | ✅ |
| Externo · conclusão | `CONCLUSAO-EXTERNO-IA` | 16 | ✅ |
| Externo · fotos | `FOTO-CASCO-IA`, `FOTO-PLACA-IA` | 17 | ✅ |
| Interno · observações | `OBS-INTERNO-IA` | 18 | ✅ |
| Interno · conclusão | `CONCLUSAO-INTERNO-IA` | 18 | ✅ |
| Interno · foto | `FOTO-INTERNO-IA` | 19 | ✅ |
| Ultrassom · área/aparelho/acoplante | `AREA-US-IA`, `APARELHO-US-IA`, `ACOPL-IA` | 20 | ✅ |
| Ultrassom · observações | `OBS-ULTRASSOM-IA` | 20 | ✅ |
| **Ultrassom · 24 medições** | `9,41 … 9,31` | 20 | ✅ **24/24** |
| TH · cliente/doc/fluido/normas/procedimento | `CLIENTE-TH-IA` etc. | 21 | ✅ |
| TH · parecer | `PARECER-TH-IA` | 21 | ✅ |
| **TH · curva** | `8,5 · 17,0 · 25,5 · 25,4` + 8 tempos | 21 | ✅ **4/4** |
| Inspetor | `INSPETOR-IA` | 22 | ✅ |
| A.R.T. | `ART-IA-2026-0002` | 1 (capa) | ✅ |

**Valores da inspeção antiga no PDF: 0.**

### As três sentinelas que NÃO aparecem — e por quê

`CONTRATANTE-VE-IA`, `RASTR-VE-IA-001` e `FABRICANTE-VE-IA` são campos do
cabeçalho do formulário de exame visual. O documento **não os lê**: o
contratante vem do cadastro do cliente (`modelo.ts:844`,
`emps.razaoSocial`) e o fabricante da ficha do equipamento.

**É desenho, não defeito** — e não foi alterado. Trocar a fonte cadastral por
um texto redigitado em campo seria piorar. O que existe é uma coleta
duplicada: o formulário pede dados que o documento tira de outro lugar.

## 7. Fotos e legendas — achado documental

O sistema tem **UM campo por foto**, e ele tem **dois nomes diferentes**:

| tela | rótulo |
|---|---|
| Visual externo / interno | `Legenda — Foto N` |
| Checklist (documentação e checklist) | `Descrição da foto...` |

**Não existe título separado de descrição.** O item 8 da rodada pedia para
documentar antes de inventar campo novo — está documentado, e nada foi
inventado. As 5 legendas chegaram ao PDF, cada uma na folha do seu ensaio.

## 8. "O que falta" — agrupamento

A detecção campo a campo **não mudou**: `oQueFalta` continua derivando do mesmo
ponto que pinta o amarelo, e o gate de cobertura continua provando que todo
crítico tem pendência. O que entrou é uma camada de apresentação
(`agruparPendencias.ts`).

| | antes | depois |
|---|---|---|
| itens na barra | ~120 (um por célula) | **22 grupos** |
| depois do defeito 2 corrigido | — | **20 grupos** |
| Teste hidrostático | 18 campos | **4** |
| Ultrassom | 13 campos | **grupo sumiu** |

Duas regras de fusão: mesmo campo do painel (`capa.art` + `inspecao.art` = uma
ação) e mesma seção. Seção com um campo mostra o nome do campo, não o da seção.
Clicar leva ao primeiro campo; clicar de novo avança e dá a volta.

Sete gates em `agruparPendencias.test.ts` cobrem as condições A–G do item 20.

## 9. E2E "Inspeção da IA"

| passo | resultado |
|---|---|
| container criado com os 5 ensaios | ✅ |
| 5 formulários preenchidos com sentinelas | ✅ `Salvando…` → `Salvo` em todos |
| estados verdes | 5/5 |
| F5 na tela da inspeção | 5/5 continuam verdes |
| persistência conferida no IndexedDB | 36 respostas · 24 medidas · 15+15 itens · 8 pontos · 5 fotos |
| olho do container no assistente | bate campo a campo com o persistido |
| rascunho salvo → F5 → reabrir | container, curva (8), medidas (6 regiões), ART e validade preservados |
| finalizado | 30 páginas, SHA `9f823206…`, `pdfPendente: false` |
| reabertura | servida pelos bytes arquivados, 30 páginas |

---

## Ponto de retomada / pendências reais

1. **Painel "O que falta" no celular** (item 23) — não foi adaptado. Continua
   sendo o painel lateral do desktop.
2. **Fotos do TH** — o formulário aceita, mas não anexei nenhuma neste E2E; a
   folha de fotos do TH não foi exercida.
3. **Coleta duplicada no exame visual** (§6): contratante, rastreabilidade e
   fabricante são pedidos ao inspetor e ignorados pelo documento. Decidir se
   somem do formulário ou passam a ser impressos — não decidi sozinho.
4. **Grade legada sem dono** continua podendo preencher célula que o container
   não tem. É deliberado (não apagar trabalho manual anterior), mas é a única
   porta que resta para dado de outra inspeção aparecer — e só onde o container
   está vazio.
5. Containers de teste em `ZZ-FASE3`: "Inspeção da IA", "INSPECAO X",
   "ZZ RENOMEADO…". Relatórios `REL-1788992708455` e `REL-1788993628387`.
