# Onboarding do memorial e do prontuário + feedback ao salvar (07/09/2026)

Escopo: memorial de cálculo (estado antes do cálculo e retorno do "Salvar") e o
modal de criação de prontuário. Nenhuma fórmula, nenhuma persistência, nenhuma
regra de documento.

## 1 · Diagnóstico

**Memorial.** A área da direita — metade da tela — abria com uma linha de
prompt: `>> Insira os dados estruturais e clique em "Gerar Cálculo"...`, em azul
claro, no canto superior. Todo o resto era branco.

**Salvar.** O sistema já tinha um overlay central com spinner
(`nr-save-overlay`), mas a gravação do memorial é local e volta em poucos
milissegundos: o overlay PISCAVA. O que o usuário via de fato era o
`window.alert('Memorial salvo com sucesso!')` — a caixa cinza do navegador.
E o erro não aparecia de jeito nenhum: uma falha subia como rejeição não
tratada, deixando a tela idêntica à de um salvamento bem-sucedido.

**Modal de prontuário.** Abria direto na lista de equipamentos, sem dizer o que
a escolha provoca.

## 2 · O que mudou

| onde | antes | agora |
|---|---|---|
| memorial, sem cálculo | linha de prompt | ilustração + "Memorial ainda não gerado" + a instrução |
| memorial, ao salvar | overlay piscando | overlay com piso de **1,5s** |
| memorial, sucesso | `window.alert` | modal do sistema: "Cálculo salvo" |
| memorial, erro | silêncio | aviso de erro com a mensagem real |
| modal de prontuário | lista direta | abertura com ilustração + "Escolha o equipamento" |

O piso de 1,5s atrasa **só o sucesso**: em erro o `finally` esconde o overlay na
hora — segurar a tela dizendo "salvando" enquanto a gravação já falhou é mentir
por 1,5 segundo.

A introdução do modal é **opcional** (`intro?: ReactNode`): o modal de criar
relatório não a recebe, porque abre sobre uma lista que o usuário acabou de ver.

## 3 · Ilustrações

Convertidas por `scripts/converter-ilustracao.mjs` (canvas do Chrome headless —
não há sharp/magick/cwebp nesta máquina):

| arquivo | origem | resultado |
|---|---|---|
| `memorial-calculo.webp` | PNG de 1.077 KB | **25,1 KB**, 820×820 |
| `escolher-equipamento.webp` | JPG de 11 KB | **4,7 KB**, 620×413 |

`loading="lazy"`, `decoding="async"`, `aspect-ratio` + `object-fit: contain` e
alt descritivo nas duas.

## 4 · Medições

`node scripts/ux-onboarding.mjs` sobre o CSS compilado. As imagens entram como
`data:` URI do arquivo local: medir contra a produção mediria a versão que ainda
não subiu, e um quadro vazio passaria por "não carregou" sem dizer por quê.

| largura | ilustração do memorial | ilustração do modal | abertura ocupa | lista visível |
|---|---|---|---|---|
| 1400 | 260×260 | 180×120 | 36% do modal | sim |
| 768 | 260×260 | 180×120 | 36% do modal | sim |
| 386 | 184×184 | 140×94 | 19% do modal | sim |

Sem transbordo horizontal em nenhuma largura.

**Ajuste que a medição no navegador obrigou:** com 230px de ilustração a
abertura empurrava a segunda linha da lista para fora do modal. 180px bastam
para reconhecer o desenho, e a lista volta a ser o conteúdo.

## 5 · Validação em produção

Bundle `assets/index-CUaxQVDK.js`; as duas ilustrações servindo `200`
(25.738 e 4.862 bytes). Conferido por conteúdo: `Memorial ainda não gerado` 1×,
`Cálculo salvo` 3× (as três telas de memorial), `O memorial NÃO foi salvo` 3×,
`Escolha o equipamento` 1×, `Memorial salvo com sucesso` **0**.

**Memorial** (`/equipamento/ZZ-FASE3/memorial`): estado vazio com a ilustração
carregada (260px na tela, 820px de original) e o texto certo; depois de "GERAR
CÁLCULO" o estado vazio some e o log ocupa a área (93 linhas).

**Salvar**, medido por amostragem de 200ms durante o clique: overlay presente
por **1.402 ms**, e ao fim o modal `modal-aviso sucesso` com "Cálculo salvo / O
memorial de cálculo foi salvo com sucesso no sistema".

> A confirmação nativa (`window.confirm`) foi neutralizada **só na página,
> durante a medição**, e restaurada em seguida: diálogo nativo trava a extensão
> do navegador e o passo falharia sem dizer por quê. Nenhum código do app foi
> alterado para isso.

**Modal de prontuário** (`/prontuarios` → "Criar prontuário"): abertura com a
ilustração (180px), o título "Escolha o equipamento", a busca logo abaixo e a
lista de equipamentos com os selos de situação intactos.

## 6 · Testes

`src/features/memorial/uxMemorialProntuario.test.ts` — 16 casos: o estado vazio
e a condição que o liga, o texto por equipamento, o peso e a proporção das
imagens, o piso do overlay, o modal de sucesso, o aviso de erro, a preservação
das chamadas de gravação e a estrutura do modal (ESC, foco, busca e lista).

Suíte completa: **2389 testes, 176 arquivos**; `tsc -b` e `npm run build`
limpos.
