# As dimensões do prontuário saíam em JSON — 10/09/2026

## A queixa

> "no prontuário em 'dimensões' as dimensões que é injetada na documentação
> está comprometida sua leitura pois tem muita poluição visual"

## O que estava no papel

Seção **4. CROQUI 2D COTADO E DIMENSÕES**, prontuário de ZZ-FASE3, páginas 3 e 4,
bloco `DADOS DERIVADOS DO MODELO`:

| | |
|---|---|
| `geradoEm` | 07/09/2026 |
| `orientacao` | horizontal |
| `bocais` | `[]` |
| `pesos` | `{"vazioKg":417.62295507194204,"cheioDaguaKg":1417.5657167707932,"operacaoKg":1417.5657167707932,"densidade":7850,"notaSuporte":false}` |
| `dimensoes` | `[{"componente":"Casco cilíndrico","texto":"Casco cilíndrico — Ø500 mm × 4.926 mm, t=6,35 mm"},{"componente":"Tampo 1 (Elíptico 2:1)",…}]` |
| `comprimentoTotalMm` | 5176 |
| `circunferenciaMm` | 1610.694553495487 |

JSON cru, chave em camelCase sem acento, float com doze casas decimais — dentro
de um prontuário assinado por engenheiro. A célula de `dimensoes` sozinha ocupava
oito linhas de altura.

## A causa

Não foi esquecimento de formatação. Foi o **TIPO**:

```ts
// modeloProntuario.ts, antes
folhaDados: Record<string, string | null>;

folhaDados: Object.fromEntries(
  Object.entries(folhaDados).map(([k, v]) => [k, txt(typeof v === 'object' ? JSON.stringify(v) : v)]),
),
```

`nr13_folha_dados_<TAG>` é um payload estruturado — bocais, pesos, dimensões por
componente. Achatá-lo num saco de strings destruiu a informação de forma
irrecuperável: a folha recebia pares chave/valor e não tinha mais o que
renderizar além disso. **O `JSON.stringify` não foi o defeito; foi o sintoma de
o modelo não ter tipo.**

A apresentação existia. Os templates legados a tinham:

| bloco | quem já fazia |
|---|---|
| Comprimento total, circunferência, pesos | `PRONT-CROQUI2D.html`, linhas 669-690 — rótulo em pt-BR com unidade, valor por `fmtNumPtBRCompacto` |
| Uma linha por componente | `PRONT-FOLHA-DADOS.html`, linhas 516-537 |
| Lista de bocais | `PRONT-FOLHA-DADOS.html` — tabela de 9 colunas |

A portagem para o vetorial (Fase 12) perdeu os três. É regressão de portagem, não
funcionalidade que nunca existiu.

## O segundo defeito, no mesmo bloco

A tabela `DIMENSÕES REAIS` tinha oito cabeçalhos **fixos e sem unidade**:

```ts
cabecalho: ['MODELO', 'Ø', 'ALTURA', 'COMPRIMENTO', 'e CORPO', 'e FUNDO', 'e TAMPA', 'VOLUME'],
```

Duas consequências, e a segunda é grave:

1. O leitor não sabia se `500` era milímetro, polegada ou centímetro.
2. **Numa caldeira aquatubular, a produção de vapor em kg/h era impressa sob a
   palavra VOLUME.** O formulário sempre soube disso — `getLabelsDimensoes`
   troca o rótulo por tipo e subtipo. A folha não sabia porque **não podia
   saber**: a função vivia dentro de `Prontuarios.tsx`, e a suíte roda em
   ambiente `node`, onde `.tsx` não é importável. A cópia divergente era
   inevitável.

## O conserto

`FolhaDadosProntuario` passou a ser estruturado, e a folha rende três blocos:

- **MEDIDAS DERIVADAS DO MODELO** — orientação, comprimento total,
  circunferência e os três pesos, com unidade e **uma casa decimal**. Doze casas
  afirmam uma precisão de 10⁻⁹ mm que a medida não tem.
- **DIMENSÕES POR COMPONENTE** — uma linha por componente.
- **LISTA DE BOCAIS** — tabela com as colunas do template legado (Tag, Serviço,
  DN, Ø × t, Flange, Local, Pos. long., Ângulo), só quando há bocal.

`geradoEm` ficou de fora **de propósito**: é o carimbo de quando o payload foi
calculado, não uma medida do equipamento, e a data de emissão já está no
cabeçalho de toda folha.

Os rótulos viraram `src/features/prontuarios/rotulosDimensoes.ts`, importado
pelo formulário **e** pela folha. Valores numéricos passaram a pt-BR
(`6.35` → `6,35`); texto livre (`s/ tampo`, `2 × 500`) segue intacto, porque o
campo é livre e virar travessão seria perder o que o usuário escreveu.

## Antes e depois, medido em produção

```
ANTES                                   DEPOIS
circunferenciaMm  1610.694553495487     CIRCUNFERÊNCIA     1.610,7 mm
pesos             {"vazioKg":417.6229…  PESO VAZIO         417,6 kg
dimensoes         [{"componente":"Cas…  Casco cilíndrico — Ø500 mm × 4.926 mm, t=6,35 mm
Ø | ALTURA | e CORPO | VOLUME           Ø DIÂM. INTERNO (MM) | ALT. CORPO (MM) | … | VOLUME (L)
6.35                                    6,35
```

## Gates

17 novos em `medidasDerivadas.test.ts`. Os dois que seguram a causa:

- **o modelo do prontuário nunca usa `JSON.stringify`** — foi assim que o JSON
  chegou ao papel;
- **o cabeçalho sai dos rótulos**, não de uma lista fixa, e o formulário não
  pode ter cópia local deles.

Eles procuram o defeito no CÓDIGO: a prosa sai antes de comparar, senão o gate
acusaria a própria explicação do conserto e obrigaria a apagá-la para ficar
verde.

Suíte: **2.973 passando**. Commit `89f965a`.

## Observado, não alterado

- `PESO CHEIO D'ÁGUA` e `PESO EM OPERAÇÃO` saem iguais (1.417,6 kg). Vem do
  modelador, que usa a densidade da água quando não há fluido de operação
  declarado. É cálculo, não apresentação — fora do escopo desta correção.
- A tabela `PARÂMETROS E RESULTADOS POR COMPONENTE` (seção 5) ainda imprime
  `2.3501` e `5.1216` com ponto decimal e quatro casas. Vem de
  `linhasMemorial()`, compartilhada com o relatório: mexer ali muda os dois
  documentos e é decisão de engenharia, não de layout.
