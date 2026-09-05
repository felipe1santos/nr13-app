# 13C · os dois campos que a folha gravava, agora em React

**04–05/09/2026.** A superfície de edição do relatório saiu dos templates. Duas
telas, duas chaves, nenhuma migração.

---

## 1 · O escopo, remedido

A 13A já tinha contado; a 13C confirmou antes de escrever a primeira linha:

| | |
|---|---|
| `contenteditable` nos 39 templates | **697** |
| chamadas a `sbSalvar` (a única API de escrita do `sb-storage`) | **5**, em 4 arquivos |

| arquivo | chave | entra na 13C? |
|---|---|---|
| `ULTRASSOM.html` | `nr13_med_esp_`, `nr13_med_grid_` | **sim** |
| `CONCLUSAO.html` | `nr13_laudo_` | **sim** |
| `LIVRO-REGISTRO.html` | `nr13_termo_livro_` | não — Livro está fora do escopo |
| `PRONT-P2.html` | `nr13_prontuario_atual` | não — folha ÓRFÃ, zero referências em `src/` |

**Dois campos, não 697.** Os outros 690 são exibição: o template escreve o valor
lido e deixa o elemento editável por herança do HTML. Digitar ali nunca
persistiu.

---

## 2 · O que foi construído

| peça | papel |
|---|---|
| `medicoesEspessura.ts` | a regra: pontos, colunas, ângulos, mínimo por região, as duas gravações |
| `ModalMedicoes.tsx` | a grade — uma linha por ponto, uma coluna por ângulo |
| `laudoConclusao.ts` | o laudo: ler, gravar, e `null` como terceiro estado |
| `ModalLaudo.tsx` | APTO / INAPTO / não respondido |
| `edicaoReact.ts` | a flag e a trava das duas folhas |
| `textoDoErro.ts` | o conserto do `[object Object]` |

### Mesmas chaves, mesmos formatos

`medicoesEspessura.ts` é a tradução do que `ULTRASSOM.html` faz, não uma versão
nova:

- pontos e colunas saem de `nr13_injecao_atual.ultrassom`, com a mesma validação
  (ponto repetido cai fora, região desconhecida vira `casco`);
- os ângulos saem da fórmula do template — `Math.round(i * 360 / n)`, com `n`
  saneado para 1..12;
- a grade inteira vai para `nr13_med_grid_` no formato que o `PRONT-ULTRASSOM`
  lê;
- o **mínimo** de cada região vai para `nr13_med_esp_` com vírgula decimal, e por
  **mesclagem**: `aparelho`, `acoplante` e `tempSup` vivem na mesma chave, são de
  outra tela, e uma substituição os apagaria.

`nr13_laudo_` recebe os três campos da folha: `apto`, `relatorioCodigo`,
`atualizadoEm`.

### Uma superfície de cada vez

Com `nr13_edicao_react = react` (ou `?edicao=react`), as folhas `ULTRASSOM` e
`CONCLUSAO` abrem com **`ro=1`** — o `sb-storage` recusa toda escrita delas.

Deixar as duas superfícies editáveis criaria o pior caso: o inspetor digita na
folha, o painel não sabe, e o próximo save de qualquer um dos dois apaga o
outro.

Rollback num passo: `?edicao=iframe`, ou apagar a chave. **Nada do caminho
antigo foi removido.**

### O que o editor melhora sem mudar dado nenhum

Descoberta desta rodada, lendo `ULTRASSOM.html:660`: a folha **monta cada célula
a partir do container**, caindo em `'0,00'` quando não há valor —

```js
var v = linha ? linha[a] : '';
var txt = (v === undefined || v === null || v === '') ? '0,00' : String(v)…;
```

Ou seja: **o que o inspetor digitava na folha não voltava.** Ficava só dentro de
`nr13_med_grid_` (para o prontuário) e como mínimo em `nr13_med_esp_`; ao
reabrir, a grade aparecia zerada de novo.

O editor React recarrega o que foi digitado. Mesma chave, mesmo formato — o que
mudou foi passar a **ler de volta** o que já era gravado.

---

## 3 · Validação em produção

Bundle **`assets/index-DXIWvlUd.js`**, org de teste, `ZZ-TESTE-P2`.

### A · o dado que já existe abre no editor

Grade aberta com **24 células** (6 pontos × 4 ângulos), três seções (tampo
superior, casco, tampo inferior) e os valores que estavam gravados.

### §8 · não há campo editável em dois lugares

Relatório com `CONCLUSAO` + `ULTRASSOM` e `?edicao=react`:

```
CONCLUSAO.html  → ro=1
ULTRASSOM.html  → ro=1
```

### B · editar → salvar → F5 → persistiu

| | |
|---|---|
| valores digitados | `6,00 6,05 6,10 6,15 6,20 6,25 5,55 …` |
| mínimos na tela | tampo **6 mm** · casco **5,55 mm** · fundo **6 mm** |
| gravado | `nr13_med_grid_` **versão 2** · `nr13_med_esp_` = `{sup:"6", casco:"5,55", inf:"6"}` |
| depois de recarregar a página e abrir um relatório NOVO | a grade voltou com **os mesmos valores** e os mesmos mínimos |

### C · laudo

Abriu em "ainda não respondido" — nenhuma das duas opções acesa, aviso na tela e
**"Salvar laudo" desabilitado**. Marcado SIM e salvo:

```json
{ "apto": true, "relatorioCodigo": "REL-1788568198331", "atualizadoEm": "2026-09-05T00:30:41.329Z" }
```

versão 1 — passou pela RPC.

### D · offline → fila → reconectar → sincronizou

Com `window.fetch` rejeitando (rede derrubada de propósito):

| | |
|---|---|
| ao salvar | as duas chaves entraram na fila em `estado: "aguardando"` |
| cache local | já com o valor novo (`4,44`) |
| erro na tela | nenhum — offline não é erro |
| ao restaurar a rede | a fila **drenou**: `nr13_med_grid_` na versão 3 e `nr13_med_esp_` com `casco: "4,44"` no servidor |

### E · conflito continua conflito

A org de teste tinha duas escritas em `estado: "conflito"`
(`nr13_uso_contadores` e `nr13_prontuario_meta_ZZ-FASE3`). Elas **continuaram em
conflito** durante e depois de todos os saves da 13C — nada foi sobrescrito em
silêncio, e a máquina de conflito não foi tocada, porque a gravação passa pelo
`salvar` de sempre.

O que mudou é só o TEXTO: `textoDoErro` transforma o objeto da fila
(`{categoria, titulo, explicacao, detalhe}`) numa frase legível. Era ele que
aparecia como `[object Object]`.

### F · o Modelo Novo lê o que o React salvou

Relatório `REL-1788568198331` finalizado (SHA `456c315bf60c3abc`, 3 páginas,
30.660 bytes). No **texto extraído do PDF**: `APTO` — o laudo marcado no painel
chegou ao parecer.

> **Ressalva medida, e ela é anterior à 13C.** A folha de ultrassom do Modelo
> Novo desenha `medEsp.pontos` / `us.pontos` e `medEsp.medidas` / `us.medidas`
> (`modelo.ts:387`) — a estrutura do CONTAINER de inspeção, não a grade de
> `nr13_med_grid_`. Então os valores da grade não aparecem naquela tabela,
> qualquer que seja quem os editou; eles alimentam o prontuário e o mínimo da
> caracterização. É comportamento existente, não algo que a 13C mudou, e fica
> registrado como assunto da 13D.

---

## 4 · Testes

`edicao13c.test.ts` — **28 testes**. O gate parte do dado antigo e exige que o
editor o devolva igual; o próprio gate pegou um erro meu (escrevi ângulos
`['0','90']` para duas colunas, quando a fórmula do template dá `['0','180']`).

| | |
|---|---|
| suíte | **1.931 testes, 158 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 5 · Fora do escopo, não tocados

Prévia em PDF (13D), visualizador, barra superior, painel "o que falta",
palco/ponte, limpeza, Livro, Prontuário e os certificados além do que a 13B
fechou.
