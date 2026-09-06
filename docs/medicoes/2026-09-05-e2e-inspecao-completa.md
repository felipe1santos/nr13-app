# E2E · uma inspeção completa, do campo ao documento arquivado

**05–06/09/2026.** Produção, organização de teste, equipamento **ZZ-FASE3**,
container **"ZZ E2E — inspeção completa 05/09"**. Nenhum cliente real, nenhum
histórico real, nenhum equipamento real tocado. Nada foi corrigido nesta rodada:
o objetivo era **descobrir o que só uma inspeção de verdade revela**.

---

## 1 · O que foi preenchido em campo

| ensaio | preenchido | observação |
|---|---|---|
| Checklist NR-13 | **35 grupos de resposta**, 3 valores alternados, comentário da documentação | 5 fotos de documentação + 6 do checklist, com legenda |
| Ultrassom | 11 campos de cabeçalho, **4 regiões**, 10 pontos, **40 células** de espessura em 0°/90°/180°/270° | o formulário **não tem** observações nem fotos |
| Visual externo | 15 itens (10 respondidos, 5 deixados em branco de propósito), observações e conclusão | 6 fotos com legenda |
| Visual interno | 15 itens, observações e conclusão | 5 fotos com legenda |
| Teste hidrostático | cliente, doc nº, equipamento, data, pressões, fluido, **6 pontos de curva** | 5 fotos; **não tem** duração, temperatura, normas, validade, procedimento nem parecer |

Total: **27 fotos** reais no cofre, todas com legenda.

### O primeiro defeito apareceu antes do documento

As respostas do checklist **voltaram vazias** depois do primeiro save. Causa: o
container mora em `nr13_docs_<TAG>`, e essa chave estava **em conflito** na fila
de sincronização — a versão do servidor (sem respostas) venceu na hidratação. O
segundo preenchimento gravou 35/35 e permaneceu. O sistema não perdeu dado (o
conflito segue parado, esperando decisão, como projetado), mas **a tela de
inspeção não avisa que o container daquele equipamento está em conflito** — o
usuário preenche, vê "Preenchido", e o relatório sai sem as respostas.

---

## 2 · O documento gerado

Prévia e finalização pelo fluxo normal, Modelo Novo (vetorial), **todas as 17
folhas selecionadas** no modal.

| | |
|---|---|
| páginas emitidas | **18** (17 + 1 de rastreabilidade) |
| áreas editáveis na prévia | **162** |
| imagens no PDF final | **19** — 17 logos (uma por página) + foto da capa + foto da placa |
| preenchimentos amarelos no PDF | **0** |
| "O que falta" | 7 campos, todos deixados vazios de propósito |
| SHA-256 | `4e5f34ee5a9e59d79b4fc60a8bcdac3f67e68194db34ea2fa8927dee7fb6cd74` |
| download do rascunho / do arquivado | mesmo arquivo, **mesmo SHA** |
| reabertura pelo histórico | "Documento arquivado", 18 páginas, **0 áreas editáveis** |

Ordem das seções emitidas: capa · sumário + objetivo + referências ·
identificação e placa · categorização · dados técnicos/prontuário · resumo de
cálculos com a memória algébrica por componente (3 componentes, 2 páginas) ·
memorial do motor (2 páginas) · dados gerais da inspeção · checklist (2 páginas)
· exame externo · exame interno · ultrassom · teste hidrostático com gráfico ·
recomendações + parecer + próxima inspeção · rastreabilidade.

### Overrides (13D-bis) — 8 aplicados, todos honrados no PDF final

| campo | tipo | resultado |
|---|---|---|
| Validade da inspeção | vazio → preenchido | `05/03/2027` no documento |
| Número de série | vazio → preenchido | `SN-E2E-77219` |
| PMTA (kgf/cm²) | **campo calculado** | `22,90` no lugar de 22,94, **sem** alterar o memorial |
| Objetivo do relatório | texto longo, multilinha | substituiu o texto automático, com quebra |
| Solicitante / contratante | **branco deliberado** | saiu **vazio** — o valor automático **não** ressuscitou |
| Logo da empresa | imagem | imagem do relatório, em todas as 17 páginas |
| Foto do equipamento (capa) | imagem | na capa |
| T.A.G. | override → **Restaurar automático** | voltou ao valor da ficha e perdeu a marca "alterado manualmente" |

Também foram digitadas duas recomendações de segurança com prazo, e ambas saíram
no documento final.

A placa foi testada nos dois estados: **reconstruída com os dados da ficha** →
**foto real** (o bloco reconstruído sai do documento e entra a foto).

---

## 3 · O que a inspeção real revelou — defeitos NOVOS

Nenhum destes aparecia na auditoria anterior, porque só existem quando há dado
de campo de verdade.

### 3.1 · CRÍTICO — as 27 fotos não chegam ao documento

Foram emitidas **zero folhas de fotos**. A referência tem **5** (documentação,
checklist, exame externo, exame interno e teste hidrostático), 4 slots cada.

Causa exata, `pdfVetorial/modelo.ts`:

```ts
type FotoBruta = { base64?: string; descricao?: string };
function fotos(lista) {
  return (lista ?? [])
    .map((f) => ({ dataUrl: String(f.base64 ?? ''), descricao: ... }))
    .filter((f) => f.dataUrl.startsWith('data:image'));   // ← descarta tudo
}
```

As fotos de campo **não são mais Base64**: chegam como `{ ref: { bucket, path,
mimeType, thumb } }` do cofre. O filtro descarta 100 % delas **em silêncio** —
sem erro, sem aviso no "O que falta", sem folha em branco. O gerador raster
resolvia a `ref`; o vetorial nunca aprendeu.

### 3.2 · CRÍTICO — o exame externo/interno imprime o NÚMERO do item

O documento traz `1 · 1 · SIM`, `2 · 2 · NÃO`. A coluna VERIFICAÇÃO deveria
trazer a pergunta. Causa: os formulários gravam `itens: { "1": "sim", ... }` e o
texto das 15 perguntas mora na constante `ITENS` de
`FormularioVisualExterno.tsx` / `...Interno.tsx`, que **não é exportada**;
`exameVisual()` usa a própria chave como título.

O checklist NR-13 não tem esse defeito — ele importa `SECOES_CHECKLIST` do
formulário e imprimiu as 35 perguntas por extenso.

### 3.3 — item sem resposta some da folha

O exame externo tinha 15 itens, 5 sem resposta: o documento listou **10**,
renumerados de 1 a 10 (o item 14 virou "9"). A referência imprime os 15, com a
marcação vazia. No documento assinado, item não respondido e item inexistente
ficam indistinguíveis.

### 3.4 — certificado padrão sem PDF vira página vazia

A página 18 contém uma única linha: "ZZ-TESTE-F6 rastreabilidade", e nenhuma
imagem. O registro existe e está marcado para injeção, mas **não tem arquivo**
(`temPdf` ausente). O gerador emite a página assim mesmo.

### 3.5 — o mesmo dado com dois valores no mesmo documento

A PMTA em kgf/cm² tem `editableId` **diferente** na tabela de pressões (folhas 3
e 6) e na tabela de aspectos operacionais (folha 5). Com o override aplicado, o
documento emitido afirma **22,90** nas folhas 3 e 6 e **22,94** na folha 5.

### 3.6 — "O que falta" não desconta o que o override resolveu

Validade e Número de série continuaram na lista dos 7 depois de preenchidos por
override, e reapareceram no aviso da finalização.

### 3.7 — lacunas do FORMULÁRIO (não do gerador)

O ultrassom não tem campo de observações nem de fotos; o teste hidrostático não
tem duração, temperatura do fluido, normas aplicadas, validade do laudo,
procedimento nem parecer. A referência imprime todos. Não adianta o gerador
aprender a imprimi-los: **o dado não existe para ser coletado**.

---

## 4 · Confirmados agora com documento na mão

Já estavam na re-auditoria; a inspeção real provou que continuam valendo mesmo
com dado completo: ultrassom sem equipamento, área, espessura nominal, ano,
material e data, e com o instrumento padrão em branco; TH sem cliente, doc nº,
equipamento e instrumento, e com a data em `2026-09-05` (ISO, não pt-BR);
sumário sem número de página e sem o item 2.1; PMO vazio; A.R.T. em branco e
CREA "—"; próximas inspeções em branco; recomendações limitadas a 4 linhas,
todas manuais.

---

## 5 · A resposta

> **Depois de uma inspeção completa real, o Modelo Novo contém tudo que deveria
> conter segundo a referência, exceto exclusões intencionais?**

# NÃO.

Faltam, em ordem de gravidade: **as 27 fotos da inspeção e as 5 folhas de
registro fotográfico** (§3.1); **o texto das 30 verificações dos exames externo
e interno** (§3.2); os itens sem resposta, que somem em vez de sair marcados
(§3.3); os campos de ultrassom e de teste hidrostático da referência — parte
deles sem lugar para ser coletado (§3.7, §4); e o documento chega a afirmar dois
valores para a mesma PMTA (§3.5).

O que a inspeção real **confirmou funcionando**: a montagem do documento inteiro
pelo fluxo normal sem os 27 iframes; os overrides nos oito formatos, inclusive
branco deliberado e restaurar automático; a placa nos dois estados; a logo em
todas as páginas; o memorial algébrico por componente; o gráfico do teste
hidrostático; o congelamento na finalização (SHA idêntico no rascunho, no
arquivado e nas duas reaberturas); e o documento arquivado sem nenhuma área
editável.

Exclusões intencionais mantidas e **não** contadas como falta: Livro/Registro de
Segurança e sua capa, termo de abertura, históricos arquivados e o interior dos
certificados.
