# Bloco 1 de fidelidade · capa, prontuário, componentes e recomendações

**05/09/2026.** Quatro áreas reconstruídas contra o relatório-base. Cada campo
novo nasce com id semântico, override por relatório, amarelo na prévia e nada
de amarelo no documento final.

---

## 1 · Capa

| item da referência | antes | agora |
|---|---|---|
| Portaria nº 1.082 | ausente | presente, editável |
| tabela superior (equipamento/TAG, classe/grupo, categoria/validade) | ausente | presente, das fontes reais |
| foto do equipamento | 92 mm FIXOS, no fim da folha | **elástica** — ocupa o que sobra entre as duas tabelas, piso de 40 mm |
| bloco inferior | 4 campos | 6: nº do relatório, **A.R.T.**, data da inspeção, contratante, endereço, **responsável técnico + CREA** |
| logo ausente | nada | placeholder amarelo clicável (só na prévia) |

A foto elástica é a correção do defeito CRÍTICO do gate: a referência usa
`flex: 1 1 auto` com base de 92 mm, e o Modelo Novo tinha 92 mm fixos depois da
tabela — daí o terço de papel em branco.

A **A.R.T. não existe no sistema**. Ela nasce como campo documental vazio:
amarelo na prévia, preenchido à mão, e nada é inventado quando ninguém preenche.

## 2 · Folha 5 — prontuário

De uma frase ("Memorial sem componentes calculados") para as quatro faixas da
referência:

| faixa | campos | fonte |
|---|---|---|
| DADOS GERAIS | contratante, endereço | `nr13_emp_<TAG>` |
| ASPECTOS CONSTRUTIVOS | material do corpo, tipo de construção, materiais dos tampos 1 e 2, volume, pressão de projeto, margem de corrosão, temperatura de projeto, descrição resumida | `nr13_vaso_<TAG>` (dados por componente) + `nr13_info_<TAG>` |
| ASPECTOS OPERACIONAIS | PMO · PMTA · PTH em **MPa, psi e kgf/cm²** | `info.pmoAdotadaMpa` e `nr13_calc_` |
| CATEGORIZAÇÃO | P(kPa)×V, P(MPa)×V e os dois resultados, classe, grupo/categoria | `nr13_cat_.PV_enq` / `.PV_cat` |
| OBSERVAÇÕES E PENDÊNCIAS | bloco textual | não existe fonte — nasce vazio e editável |

**psi é conversão, não rótulo trocado:** ×145,0377 sobre o mesmo valor em MPa.
Medido em produção: PMTA 2,250 MPa → 326,3 psi → 22,94 kgf/cm².

PMO sem valor declarado sai **vazio** — não vira a PMTA repetida.

## 3 · Folha 6 — parâmetros por componente

Uma faixa por componente, com os oito parâmetros da referência: espessura
mínima calculada, PMTA calculada, eficiência da junta (E), espessura medida,
margem de corrosão, raio interno, material e tensão admissível (S).

Tudo já estava em `nr13_calc_<TAG>.componentes[]`, gravado pelo motor do
memorial — **nenhuma fórmula foi reimplementada**, e há teste que reprova a
volta de `Math.pow`/`Math.sqrt` para dentro das folhas. A tabela do `Documento`
pagina sozinha, repetindo o cabeçalho: mais componentes do que cabem não são
cortados.

Medido em produção (`ZZ-FASE3`, 3 componentes): E 0,85 · S 138 · raio 250 ·
margem 1,5 · espessura medida 6,35 · PMTA 2,2494.

## 4 · Recomendações de segurança (seção 9)

O sistema **não tem** recomendação estruturada — não existe formulário, chave
nem campo que a guarde (auditado). Inventar origem automática produziria
recomendação que ninguém escreveu, num documento assinado.

A seção existe como a referência a desenha: quatro linhas numeradas com
recomendação e prazo, células vazias, amarelas na prévia, preenchidas à mão.
Junto entraram, também do original, "A PMTA pode ser mantida?" e a
justificativa.

## 5 · Áreas de imagem

`Documento.areaImagem` desenha a foto em `contain` (proporção medida, sem
esticar) ou o placeholder: **amarelo com convite na prévia**, apenas o fio cinza
de 0,4 pt no documento final — é o que a referência faz
(`.foto-capa:not(.tem-img)`).

A área é um campo editável do tipo `imagem`: clicar nela troca, remove ou
restaura. O override guarda o **caminho** do arquivo no cofre — nunca Base64,
pela mesma razão do §2-bis.

## 6 · Validação em produção

Org de teste, `ZZ-FASE3`, bundle `assets/index-9EosanVw.js`.

| | resultado |
|---|---|
| áreas editáveis no documento | **131** (eram 52) |
| áreas de imagem registradas | 2 — logo e foto de capa |
| capa | Portaria, tabela 4 colunas com Classe A / Grupo 4 / Categoria III, foto elástica amarela, bloco inferior com A.R.T. vazia e responsável + CREA |
| folha 5 | as 4 faixas com dados reais; construtivos vazios em amarelo (este equipamento não tem `nr13_vaso_` preenchido) |
| operacionais | PMTA 2.250 MPa · 326.3 psi · 22.94 kgf/cm² |
| categorização | P·V 2.249,4 kPa·m³ → "Enquadrado na NR-13"; 2,249 MPa·m³ → "Grupo de risco 4" |
| folha 6 | 3 faixas de componente com E/S/raio/margem/espessura |
| recomendações | 4 linhas vazias e amarelas + PMTA mantida? + justificativa |
| override na folha 5 | "ASTM A516 Gr. 60 (informado em campo)" salvo e presente no PDF |
| finalização | 11 páginas, SHA `ef5afb827bc70887…`, arquivo baixado com o MESMO SHA |
| amarelo no PDF final | **nenhum** — a única cor de preenchimento no arquivo é o azul do valor (`0.106 0.227 0.42`) |

## 7 · Testes

`bloco1Fidelidade.test.ts` — 24 testes (A–J do pedido), com os dados gravados
no formato REAL do sistema.

| | |
|---|---|
| suíte | **2.055 testes, 163 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |

## 8 · Fora do escopo desta rodada

Categorização completa (folha 4), placa, folha 8, ultrassom, TH,
objetivo/referências, sumário e acabamento seguem como estavam. A folha 21
(Registro de Segurança / Livro) foi reclassificada pelo dono como **exclusão
intencional de escopo** — não entra na reformulação visual.
