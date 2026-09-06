# Paridade folha a folha com o relatório-base

**06/09/2026.** O Modelo Novo passou a conter **todas as tabelas, colunas e
informações** de `docs/referencias/relatorio-nr13.html` (cópia idêntica de
`C:\projetos\vender\relatorio-nr13.html`, mesmo MD5). Validado com documento
real emitido em produção.

---

## 1 · Antes e depois, medido no mesmo equipamento

Mesma inspeção (ZZ-FASE3, container "ZZ E2E — inspeção completa 05/09"), mesmas
17 folhas selecionadas:

| | antes | depois |
|---|---|---|
| páginas | 17 + 1 anexo | **28 + 1 anexo** |
| imagens no PDF | 1 (a placa) | **28** — 27 fotos de campo + a placa |
| folhas de registro fotográfico | **0** | **10** (documentação 2 · checklist 2 · externo 2 · interno 2 · TH 2) |
| áreas editáveis | 162 | **548** |
| rótulos da referência ausentes | 26 | **0** |

## 2 · O que entrou, folha a folha

| folha da referência | o que faltava e agora sai |
|---|---|
| 2 · SUMÁRIO | numeração pela **seção** (7.1, 7.4…) e a **página real** de cada uma; ABNT NBR 16035; linha livre de documento adicional; **2.1 escopo e observações** |
| 3 · IDENTIFICAÇÃO | coluna **psi** e a linha da **PMO**; rótulo do registro fotográfico da placa |
| 4 · CATEGORIZAÇÃO | fluido de trabalho, código de projeto, PMTA, volume geométrico, P.V. > 8, **a matriz 13.5.1.2 inteira** (4 classes × 5 faixas), quadro de operador treinado (Anexo I-B) e observações |
| 6 · RESUMO DE CÁLCULOS | **eficiência da junta (E)**, **raio interno / raio da coroa**, **tensão admissível (S)**, com o bloco nomeado por componente |
| 6.1 · MEMÓRIA | tabela **T.A.G. / código de projeto** no topo |
| 7 · EXAMES | data de início e término, nº de série, **A.R.T.**, nº do relatório; **natureza marcável** (4); **ensaios marcáveis** (6, com líquido penetrante e partícula magnética); resultado do visual externo e interno; resultado dos ensaios; observações |
| 7.1 · DOCUMENTAÇÃO | **folha própria**, com os 15 itens e as colunas **Existe / Não ident. / Não aplica** + observação por item |
| 7.1.1 · CHECKLIST P1 | **folha própria**: resultados da inspeção, exame do prontuário, exame externo e o **quadro de instrumentos** (Possui · Calibrado · Nº do certificado/validade) — que ganhou a **PSV**, a 6ª linha da referência |
| 7.1.2 · CHECKLIST P2 | **folha própria**: exame interno, ensaio hidrostático e considerações finais |
| 7.2 / 7.3 · EXAMES | tabela T.A.G. / nº de série; **o texto das 15 verificações** (saía o número do item); colunas SIM/NÃO/N.A.; a pergunta que elas respondem; item sem resposta **continua na folha**; resultado |
| 7.4 · ULTRASSOM | **informações do componente avaliado** (equipamento, série, área, espessura nominal, material, data); "APARELHO / Nº DE SÉRIE"; colunas **MENOR VALOR** e **ESP. MÍN. REQUERIDA**; instrumento padrão; **observações / conclusões** |
| 7.5 · TESTE HIDROSTÁTICO | **dados gerais** (cliente, doc nº, T.A.G., equipamento, pressão de trabalho); **duração, temperatura do fluido, normas, validade do laudo, procedimento**; instrumento padrão; **parecer técnico** |
| 8.x · FOTOS | **as folhas de fotos voltaram a existir** — ver §3 |
| 11 · PRÓXIMA INSPEÇÃO | coluna **PRAZO** |

Campo que a referência imprime e o sistema ainda não coleta nasce **vazio e
editável** (13D-bis): amarelo na prévia, em branco no documento. Suprimir a
linha esconderia do laudo o que ele afirma.

## 3 · A causa do sumiço das fotos

`modelo.ts::fotos()` aceitava só `base64`:

```ts
.filter((f) => f.dataUrl.startsWith('data:image'));   // descartava a ref
```

Toda foto posterior a 10/08/2026 é `{ ref }` — caminho no cofre, sem bytes. O
filtro apagava 100 % delas **sem erro**. Agora a `ref` viaja no modelo e
`resolverFotos` (no gerador, que é assíncrono) baixa cada arquivo antes de
medir. Foto que não resolve é descartada e registrada no console — nunca
inventada.

## 4 · O gate que impede a volta

`paridadeReferencia.test.ts` **lê o HTML da referência**, extrai todo rótulo de
campo, cabeçalho de coluna, faixa e seção das 20 folhas em escopo, e exige cada
um no gerador. Lista escrita à mão envelhece calada; o documento-base, não.

Conferido também: 15 itens de documentação, 15 + 15 dos exames visuais (com o
texto conferido contra a referência), 6 instrumentos, 36 perguntas de checklist
e a exclusividade das marcas SIM / NÃO / N.A.

Exclusões intencionais, declaradas no próprio teste: **folha 21 (Registro de
Segurança / Livro)** — tem motor próprio, lacre e trava no banco — e a folha 22
(registro fotográfico genérico), que no sistema é a folha de fotos de cada
etapa, emitida pela contagem real.

## 5 · Verificação

| | |
|---|---|
| suíte | **2.084 testes, 165 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
| produção | bundle `assets/index-3f_q0wFk.js`, deploy pelo Coolify |
| documento real | 29 páginas, 28 imagens, sumário com página, matriz da NR-13, checklist em 3 folhas, ultrassom e TH completos |
| rótulos da referência ausentes | **0 de 291** |
