# Prontuário no layout do relatório

**06/09/2026.** O prontuário passou a ser o mesmo documento profissional do
relatório — e o croqui 2D deixou de existir onde ele não descreve o
equipamento.

---

## 1 · O que mudou no papel

| | antes | depois |
|---|---|---|
| capa | não tinha | igual à do relatório, com identificação, foto e responsável |
| sumário | não tinha | com o número e a **página real** de cada seção |
| cabeçalho | dizia "RELATÓRIO DE INSPEÇÃO" | **"PRONTUÁRIO DO EQUIPAMENTO — NR-13 Nº"** |
| grade de espessuras | colunas genéricas `P1, P2`, menor valor recalculado ali | a MESMA do relatório: ângulos da região, MENOR, ESP. MÍN. REQ., com o realce da maior (azul-petróleo) e da menor (vermelho) leitura |
| memorial | LaTeX cru (`$$ t_{req} = …`) | fração desenhada, com subscrito |
| pressões | MPa · kgf · bar | MPa · psi · kgf · bar, com a linha da PMO |
| prévia da tela | 6 iframes dos templates HTML | **o próprio documento** |

A grade tinha uma leitura própria — duas verdades para o mesmo ensaio dentro
do mesmo sistema. Agora ela sai de `pontosUltrassom`, a função que o relatório
já usava, lendo `nr13_med_grid_<TAG>`.

## 2 · O croqui é do vaso

Croqui e folha de dados já não eram emitidos para caldeira e autoclave. O
DESENHO na folha de ultrassom, sim: bastava o equipamento ter sido vaso um dia
para `nr13_croqui2d_<TAG>` continuar gravado e o desenho antigo aparecer num
prontuário de caldeira — geometria que não é a do equipamento, num documento
assinado. A condição agora é o TIPO, e sem croqui o espaço fica em branco:
ausência é informação, desenho errado não.

Provado em produção com `ZZ-CALDEIRA-TESTE`: **6 páginas**, sumário com 4
itens, sem folha de croqui e sem o desenho na folha de ultrassom.

## 3 · A prancha de vistas

O equipamento é comprido. Empilhando as três vistas em faixas de largura
inteira, a longitudinal ficava com 5 cm de altura e as cotas viravam risco.

A folha 2 virou prancha técnica: **vista longitudinal na coluna esquerda, em
toda a altura; transversal e detalhe do tampo à direita, uma sob a outra**.
Nenhuma é suprimida.

E a longitudinal entra **em pé**: a mesma imagem girada 90°, escolhida por
qual orientação ocupa mais área dentro da coluna. Decidir pelo formato do
arquivo não funcionava — o SVG traz margem branca, e a proporção do arquivo
não é a do desenho dentro dele.

## 4 · Três defeitos de paginação que apareceram no caminho

| sintoma | causa | correção |
|---|---|---|
| "Página 1 de 10" num PDF de 11 | a 1ª passagem conta, a 2ª desenha; o respiro mudou uma quebra | o gerador CONFERE o total e, divergindo, redesenha com o número certo — no relatório também |
| o bloco final pulava de página | `minAltura` era exigência | virou intenção: sobrando menos, o bloco encolhe |
| a assinatura sozinha numa folha | reservava 30 mm e desenhava mais; o respiro e o croqui fixo comiam o resto | reserva a altura real; a folha assinada não estica; o croqui cede a vez e a grade virou uma tabela só quando os ângulos coincidem |

## 5 · Como voltar atrás

| chave | padrão | rollback |
|---|---|---|
| `nr13_previa_prontuario` | vetorial | `?previaPront=iframe` |
| `nr13_motor_prontuario` | vetorial | `?motorPront=atual` |

As duas são independentes das do relatório: um rollback aqui não mexe lá.

## 6 · Verificação

| | |
|---|---|
| suíte | **2.127 testes, 168 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
| produção | bundle `assets/index-hNtzNnJT.js` |
| vaso (ZZ-FASE3) | 10 páginas, rodapé conferido, prancha com a longitudinal em pé |
| caldeira (ZZ-CALDEIRA-TESTE) | 6 páginas, sem croqui |
