# Calibrações — a cadeia do certificado e o preenchimento, 11/09/2026

## O pedido

> "melhorar o design e a experiência do usuário no preenchimento das
> informações da calibração dos acessórios (…) veja se os dados do certificado
> estão sendo puxados para a folha de calibração (…) garanta que tudo funciona
> de ponta a ponta (…) que o usuário preencha as informações do equipamento
> padrão utilizado seja puxado de forma automática (…) resultados obtidos (…)
> abrir um modal interativo (…) o que der para ser puxado (…) pode ser
> adicionado anteriormente na hora do cadastro"

## Auditoria — o que o certificado imprimia

Medido no certificado de `PSV-GATE-9F3` (ZZ-TESTE-P2) em produção, antes de
qualquer mudança:

| bloco da folha | saía |
|---|---|
| 1 · DADOS DO CLIENTE / SOLICITANTE | `----` · `----` |
| 2 · fabricante, modelo, série, referência | `----` |
| 2 · data da próxima calibração | **`DD/MM/AAAA`** |
| 4 · CONDIÇÕES AMBIENTAIS | `----` |
| 5 · PADRÕES E RASTREABILIDADE | `----` × 3 + `DD/MM/AAAA` |
| 6 · RESULTADOS | `----` em 30 células |
| 8 · CONCLUSÃO | *"…está --, pois durante o processo, o mesmo"* |

**O template não tinha culpa de nenhum deles.** Ele lê todos os campos, e o
rodapé com a empresa executante saiu certo — prova de que a ponte
`nr13_calibracao_item_<id>` → folha funciona. O que faltava era a FONTE.

## Os quatro defeitos, e a causa de cada um

### 1 · Cliente em branco em toda calibração

```ts
// antes
const emp = JSON.parse(localStorage.getItem('nr13_minha_empresa') || '{}');
```

Numa organização v2 o `localStorage` é só o PALCO (§2-ter). Conferido na conta:
`nr13_minha_empresa` está **AUSENTE** do `localStorage` (13 chaves lá, todas de
sessão). A leitura devolvia `{}` e gravava vazio — em silêncio.

De quebra, o campo preenchia com a empresa **executante** um bloco cujo título
é "cliente / solicitante", e o rodapé da folha já imprime a executante. Passou a
vir de `nr13_emp_<TAG>`, lido por `ler()`. Formato conferido em produção: as 5
chaves `nr13_emp_` têm `razaoSocial`, `endereco`, `bairro`, `cidade`, `estado`.

### 2 · Padrão utilizado digitado à mão

Os quatro campos do bloco 5 existem, campo a campo, no cadastro de
**Certificados** (`nr13_rastreab_`). Passaram a vir de `padraoDoEnsaio()` — a
MESMA função que decide qual PDF de padrão é anexado ao relatório. Usar duas
regras faria o texto do bloco 5 e o anexo falarem de instrumentos diferentes no
mesmo documento.

A data vem `aaaa-mm-dd` do `input type=date` e é convertida: sem isso o
certificado imprimiria `2027-04-30`.

### 3 · `DD/MM/AAAA` impresso como se fosse data

Campo vazio faz o `inj()` do template não escrever nada, e o texto de exemplo do
HTML fica. Resolvido na fonte: a data nasce com +12 meses. `31/03` continua
`31/03`; `29/02` de ano bissexto **recua** para `28/02`, em vez de virar `01/03`.

### 4 · Conclusão com a frase pela metade

A folha costura *"…está \<status\>, pois durante o processo, o mesmo
\<motivo\>"*. Motivo vazio terminava o documento em "o mesmo". Sem motivo
digitado, grava o MESMO texto do seletor da própria folha.

## O que não muda foi para o cadastro do componente

`ComponenteCal` ganhou `referencia`, `unidade`, `pontos` e `pressaoAjuste`. O
`modelo` já era LIDO por `novaForm` e **não tinha campo nenhum no cadastro** —
era sempre vazio.

O ganho maior são os **pontos**: eram a coluna "valor convencional" das DUAS
tabelas, a mesma sequência, digitada duas vezes por certificado.

## Resultados obtidos — o modal

Eram 20 células nuas (5 linhas × 2 colunas × 2 tabelas) no meio de um formulário
de 30 campos, sem unidade, sem progresso e sem erro à vista. No celular, duas
tabelas com rolagem lateral.

A unidade de trabalho passou a ser o **PONTO**: uma linha, duas leituras, os
dois erros ao vivo. **10 campos no lugar de 20.** Progresso no topo
("6 de 6 pontos medidos · maior erro 0,30 kgf/cm²"), `Enter` descendo na coluna
— que é como se lê um padrão, ponto a ponto — e cartão por ponto no celular.

`paraLinhas()` devolve as duas tabelas com o mesmo VC: `DadosManometro` e os
dois templates não mudaram.

## Achado do E2E: o 6º ponto sumia

Com os pontos vindo do cadastro, seis pontos foram medidos — e o **sexto não
aparecia no documento**. As tabelas do HTML têm seis linhas, mas a última não
tinha `id` para receber injeção. Perda silenciosa de uma medição dentro de um
certificado assinado, e ela só apareceu porque o preenchimento ficou fácil o
bastante para alguém usar seis pontos.

Duas pontas: os ids foram criados, e `PONTOS_NA_FOLHA = 6` virou o teto do modal
e do cadastro.

## Unidade

`Kgf/cm²` estava fixo no HTML dos dois títulos de tabela: quem calibrasse em bar
via a própria medição rotulada com a unidade errada. Virou campo injetado.

## Prova de ponta a ponta, em produção

Componente `man` recebeu modelo `WIKA 232.50`, faixa `0 a 10 kgf/cm²` e pontos
`0, 2, 4, 6, 8, 10`. Calibração nova, lida do DOM do formulário:

```
MODELO                       WIKA 232.50          ← do cadastro
REFERÊNCIA                   0 a 10 kgf/cm²       ← do cadastro
DATA DA PRÓXIMA CALIBRAÇÃO   11/09/2027           ← +12 meses
INSTRUMENTO PADRÃO           Manômetro padrão digital MP-01 — Zurich MD-500 · 0 a 60 kgf/cm²
Nº SÉRIE                     MP01-2024-7788       ← de Certificados
Nº CERTIFICADO               RBC-2026/44120
VALIDADE                     30/04/2027           ← ISO convertido
RESULTADOS                   0 de 6 pontos medidos
aviso                        "Preenchido a partir do certificado Manômetro
                              padrão digital MP-01, cadastrado em Certificados."
```

Modal preenchido → `6 de 6 pontos medidos · maior erro 0,30 kgf/cm²`. Salvo, o
documento (lido do `contentDocument` do iframe):

| ponto | padrão | subindo | erro | descendo | erro |
|---|---|---|---|---|---|
| 1 | 0 | 0,0 | 0,00 | 0,1 | -0,10 |
| 2 | 2 | 2,1 | -0,10 | 1,9 | 0,10 |
| 3 | 4 | 4,1 | -0,10 | 3,9 | 0,10 |
| 4 | 6 | 6,2 | -0,20 | 5,8 | 0,20 |
| 5 | 8 | 8,2 | -0,20 | 7,9 | 0,10 |
| 6 | 10 | 10,3 | -0,30 | 9,8 | 0,20 |

Unidade `kgf/cm²` nos dois títulos, status `APROVADO`, motivo com a frase
inteira e ponto final.

## Outros dois, no caminho

- O filtro de `/calibracoes` reusa o modal de Prontuários e abria escrito
  "Prontuários / Filtrar prontuários", com "Com prontuário" filtrando quem tem
  CALIBRAÇÃO. Ganhou a prop `assunto`.
- Nove botões de ícone tinham só `title` — dica de mouse, não rótulo. O leitor
  de tela anunciava "botão". Ganharam `aria-label`.

## Gates

29 novos em `preencherCalibracao.test.ts`, incluindo os que seguram as causas:
a tela não pode ler `localStorage` cru; a folha tem de ter uma linha com `id`
para cada ponto que o modal aceita; a unidade escolhida tem de chegar ao título.

Suíte: **3.003 passando**. Commits `d960ab6` e `85f7dfc`.

## Declarado, não feito

- O bloco 1 continua vazio para ZZ-TESTE-P2 porque **aquele equipamento não tem
  cliente vinculado** — é o comportamento certo. O caminho foi conferido pelo
  formato das 5 chaves `nr13_emp_` em produção, não por um certificado com
  cliente.
- **Condições ambientais** (temperatura, umidade, local) seguem manuais: não há
  fonte no sistema para elas. Um valor padrão por organização resolveria, e é
  decisão do dono.
- A **captura de tela** não foi possível nesta sessão: a janela do Chrome que
  hospeda o grupo de abas estava minimizada e o CDP recusa com
  `Cannot take screenshot with 0 width`. A verificação acima é do DOM do
  formulário e do `contentDocument` do iframe do documento — mais forte que a
  imagem, mas sem o registro visual.
