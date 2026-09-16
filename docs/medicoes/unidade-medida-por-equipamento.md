# Unidade de medida por equipamento — 16/09/2026

Registro da rodada que transformou a unidade de medida de *preferência de
visualização* em *característica do equipamento*, e fez o relatório inteiro sair
numa unidade só.

---

## 1. Comportamento anterior

O cartão de `/equipamentos` tinha um `<select>` de unidade que gravava na hora:

```
UNIDADE DE MEDIDA   [ SI (MPa) ▼ ]
```

Trocar ali mudava, num clique e sem confirmação, a unidade em que a ficha
daquele equipamento era exibida — e, a partir desta rodada, também a unidade em
que o relatório dele sai.

A criação (`criarEquipamento`) gravava **só** `nr13_info_<TAG>`. A unidade não
nascia com o equipamento: ela só passava a existir se alguém mexesse no seletor.
Enquanto não existisse, todos os leitores caíam em `SI`.

O relatório (Modelo Novo) **nunca leu** `nr13_pref_unidade_`. Ele imprimia as
pressões em várias unidades ao mesmo tempo, copiando o documento de referência.

## 2. Modelo novo

| | |
|---|---|
| Escolha | na **criação** do equipamento, campo obrigatório |
| Exibição no cartão | **texto**, não controle |
| Edição posterior | só na **ficha**, com select + botão "Salvar" + "✓ Unidade fixada" |
| Alcance | ficha, cartão, memorial, prontuário, entrada da Categoria e **o relatório inteiro** |
| Exceção | **Categorização NR-13** — kPa·m³ e MPa·m³, sempre |

## 3. Fonte da unidade

`nr13_pref_unidade_<TAG>` em `app_storage`.

Já existia, já era por equipamento, já estava em `familiasChave` e já era
projetada em `equipamentos_index.unidade` (`busca_manutencao.sql`, linha do
`v_unid`). **Nenhuma migration foi necessária.**

Leitores: `carregarUnidade` (ficha), `montarResumo` (cartão legado),
`item.unidade` da projeção (cartão novo e as quatro listas),
`montarModeloRelatorio` (relatório), `MEMORIAL.html` (folha do memorial).

## 4. Enum e opções

`SistemaUnidade` em `src/calc/unidades.ts` — **três**, e nenhuma foi inventada:

| valor | nome | pressão | fator sobre MPa | casas |
|---|---|---|---|---|
| `SI` | SI | `MPa` | 1 | 3 |
| `TECNICO` | Técnico | `kgf/cm²` | 10,19716 | 2 |
| `PETROBRAS` | Petrobras | `bar` | 10 | 2 |

O que se guarda é o **enum** (`SI`), nunca o rótulo (`SI (MPa)`). O rótulo é
montado na apresentação por `rotuloSistemaCompleto`.

As casas por unidade (`CASAS_POR_UNIDADE`) são as que o documento sempre usou.
Não é capricho: 1 MPa vale ~10,2 kgf/cm², então a terceira casa em MPa carrega a
mesma informação que a segunda nas outras duas.

## 5. Armazenamento canônico

**MPa** para pressão, **mm** para espessura — como sempre foi. A unidade só
decide **apresentação** e **entrada**.

```
valor canônico (MPa)  +  unidade do equipamento  →  texto no papel
```

Nunca o contrário: não se grava na unidade exibida para reconverter depois.
`valorNaUnidade` parte sempre do número canônico, e o arredondamento acontece
só na última etapa — o texto formatado nunca vira entrada de outra conversão.

## 6. Conversões

`paraExibicao` / `paraMpa` / `formatarValor` / `valorNaUnidade`, todas em
`src/calc/unidades.ts`. `unidadeValida` recua para `SI` diante de qualquer valor
fora do domínio — é o que impede a lista inteira de cair no `errorElement` por
causa de uma chave legada.

Ida e volta testada nas três unidades, tolerância de 10 casas.

## 7. A exceção: Categoria NR-13

Não muda, sob nenhuma unidade:

- enquadramento `P(kPa) × V(m³) > 8`
- grupo de potencial de risco `P(MPa) × V(m³)`
- tabela classe × grupo, limites, categoria final

`categoriaService` converte a entrada para MPa **antes** de chamar a norma
(`const pressaoMpa = paraMpa(pressaoExibida, unidade);`), e a ficha passa à
`CategoriaNR13` a unidade **fixada**, nunca a prévia. No relatório, `pvKpa` e
`pvMpa` saem crus do que a categorização gravou.

**A folha inteira é exceção, não só as fórmulas.** Em 16/09/2026 o campo
`categorizacaoFolha.pmta` chegou a converter, sob o argumento de que é exibição
e não entra na conta da categoria — argumento correto sobre a fórmula e errado
sobre o limite pedido. Revertido no mesmo dia: a PMTA daquela folha sai sempre
em **kgf/cm²**, seja qual for a unidade do equipamento.

O limite é a seção porque a folha é lida como um conjunto: PMTA, produto em
kPa·m³, produto em MPa·m³ e a matriz classe × grupo, um embaixo do outro. Com a
PMTA em bar e os produtos em kPa e MPa, quem confere a categoria teria de
converter de cabeça para verificar a conta impressa ao lado.

Travado por `unidadeDoEquipamento.test.ts`: a mesma pressão física declarada nas
três unidades produz produto, grupo e categoria idênticos.

## 8. Memorial de cálculo

O cálculo **não foi tocado**. As fórmulas do memorial trabalham em MPa/mm e
continuam assim; o que a unidade decide é como o resultado aparece.
`MEMORIAL.html` já lia `nr13_pref_unidade_<TAG>` e continua lendo.

## 9. Pressões da Documentação

PMTA / PMO / PTH adotadas seguem sendo do engenheiro, gravadas em **MPa** dentro
de `nr13_info_<TAG>`. A UI converte na entrada e na saída, e os rótulos mostram a
unidade — `PMTA ADOTADA (kgf/cm²)` num equipamento em Técnico.

Mudou a origem da unidade do bloco: era a **prévia** da ficha, passou a ser a
**fixada**. Ligado à prévia, o rótulo dizia uma unidade por causa de uma escolha
ainda não salva, e a entrada era interpretada nela.

## 10. Equipamentos legados

**Cenário B do pedido**, e o default não foi chutado.

Equipamento anterior a 16/09/2026 que nunca teve o seletor tocado **não tem** a
chave `nr13_pref_unidade_`. A unidade efetiva dele já era `SI`, por quatro
recuos independentes que existiam antes desta rodada:

- `equipamentoService.montarResumo`: `ler(...) || 'SI'`
- `equipamentoService.carregarUnidade`: `ler(...) || 'SI'`
- `calc/unidades.unidadeValida`: recuo para `'SI'`
- `MEMORIAL.html`: `localStorage.getItem(...) || 'SI'`

Ou seja: **não há backfill a fazer.** Ausência da chave continua significando SI,
exatamente como significava ontem. O cartão, a ficha e o relatório desses
equipamentos saem em MPa — que é o que já saía.

A partir de agora a criação grava a escolha **sempre**, inclusive quando é SI.
É isso que distingue "escolheu SI" de "nunca escolheu", e é o que permitirá, se
um dia for preciso, migrar o parque antigo com honestidade.

## 11. Relatório — mapa campo a campo

| campo | fonte | canônico | unidade antes | unidade depois | folha |
|---|---|---|---|---|---|
| PMO / PMTA / PTH (pressões) | `info.*AdotadaMpa` ?? `calc.*` | MPa | 4 colunas: MPa, psi, kgf/cm², bar | **1 coluna, do equipamento** | 3 — Identificação/Placa |
| PMO / PMTA / PTH (operacionais) | idem | MPa | 3 colunas: MPa, psi, kgf/cm² | **1 coluna, do equipamento** | Dados técnicos |
| PMO / PMTA / PTH (resumo) | idem | MPa | 3 colunas: MPa, kgf/cm², bar | **1 coluna, do equipamento** | 6 — Resumo de cálculos |
| PMTA / PTH na placa desenhada | idem | MPa | 3 mini-colunas | **1, do equipamento** | 3 — Identificação/Placa |
| Pressão de projeto | `nr13_vaso_.P` | MPa | fixo `MPa` | **do equipamento** | Dados técnicos |
| PMTA da caracterização | `info.pmtaAdotadaMpa` ?? `calc.pmta` | MPa | fixo `kgf/cm²` | **fixo `kgf/cm²` (inalterado)** | Caracterização |
| Produto P.V. enquadramento | `cat.PV_enq` | — | `kPa·m³` | **`kPa·m³` (inalterado)** | Categorização |
| Produto P.V. risco | `cat.PV_cat` | — | `MPa·m³` | **`MPa·m³` (inalterado)** | Categorização |
| Categoria, grupo, classe | `cat.*` | — | — | **inalterados** | Categorização |

## 12. Outras telas

| tela | classe | o que faz |
|---|---|---|
| `/equipamentos` cartão e linha | **A** | segue a unidade do equipamento |
| Ficha (memorial, quick, pressões) | **A** | segue |
| Prontuários | **A** | `formatarValor(pmtaNum, eq.unidade)` |
| Inspeções, Prontuários, Relatórios, Calibrações (listas) | **A** | `formatarValor(item.pmtaMpa, item.unidade)` |
| Entrada da Categoria NR-13 | **A** | entrada segue; o cálculo não |
| Cálculo da Categoria NR-13 | **B** | kPa·m³ e MPa·m³ por norma |
| Calibrações — `.unidade` do componente | **B** | é a faixa do instrumento, outro domínio |
| Certificados, Agenda, Livro | **C** | não exibem grandeza afetada |

## 13. Overrides do relatório

O `id` das células de pressão perdeu o sufixo de unidade:
`pressoes.PMTA MPa` → `pressoes.PMTA`.

Override antigo fica **inerte** e a célula volta ao valor calculado. É o
comportamento correto: um override digitado na coluna kgf valia `22,43`, e
reaproveitá-lo numa célula que agora imprime MPa poria `22,43 MPa` no papel —
dez vezes a pressão real, num documento assinado.

## 14. Documentos históricos

Intocados. Relatório com `pdfRef` serve os bytes arquivados (§7-quater); nada é
regenerado, nenhum SHA muda, nenhum rótulo é reescrito.

## 15. Migration / SQL

**Nenhuma.** `equipamentos_index.unidade` já existe e já é alimentada de
`nr13_pref_unidade_<TAG>` pela projeção. Coluna ausente na origem vira `null`, e
o front resolve com `unidadeValida` → `SI`.

`pmta_adotada_mpa` e `pth_adotada_mpa` (rodada de 15/09/2026) não foram tocadas:
continuam canônicas em MPa, e é só a formatação do cartão que agora usa a
unidade do equipamento.

## 16. Rollout necessário

Só front: `git push origin main` + Redeploy no Coolify. Sem SQL, sem backfill,
sem janela de incompatibilidade — o bundle novo lê uma coluna que já existe.

## 17. Testes

`src/features/equipamento/unidadeDoEquipamento.test.ts` — 24 casos:

- as três opções e os rótulos, para nenhuma ser inventada
- `unidadeValida` recuando para SI (é a prova da migração)
- ida e volta MPa → unidade → MPa nas três, com 7 valores
- que a conversão parte do canônico e não do texto formatado
- casas por unidade, e `null` para ausente/`NaN`/`Infinity`
- **Categoria NR-13**: mesma pressão física nas três unidades → mesmo produto,
  mesmo grupo, mesma categoria
- cartão sem seletor, sem `salvarUnidade`, e ainda com a pressão **adotada**
- criação gravando a chave
- relatório com uma coluna só, e a placa recebendo a mesma unidade

## 18. Riscos

1. **Override de pressão em rascunho aberto** perde o efeito (item 13). Some do
   papel o valor digitado à mão; volta o calculado. Deliberado.
2. **Densidade da folha 3**: a tabela de pressões passou de 5 para 2 colunas.
   Menos informação por linha, mais espaço em branco — vale conferir a
   proporção da folha no E2E.
3. **Paridade com a referência** do documento físico: o gate de fidelidade
   comparava contra um modelo multi-unidade. Esta rodada afasta o documento
   daquela referência por decisão do dono, registrada em 16/09/2026.
4. **A placa desenhada** passa a mostrar uma unidade só. Placa física de
   equipamento costuma trazer mais de uma; o desenho aqui é reconstruído a
   partir da ficha, não uma foto — quando existe foto real da placa, é ela que
   o documento usa.


---

## 19. Overrides antigos — medição em produção (16/09/2026)

A troca do `id` das células de pressão (item 13) foi MEDIDA antes do rollout,
com consulta somente-leitura em produção.

| | |
|---|---|
| mapas de override (`nr13_ovr_`) | **44** |
| campos com override, no total | **332** |
| mapas que tocam pressão | **1** |
| campos de pressão com override | **1** |
| ids que ficariam inertes | **1** |

O único é:

```
chave  nr13_ovr_REL-1788658262213_ZZ-FASE3
campo  pressoes.pmta-pressao-maxima-de-trabalho-admissivel-kgf
modo   manual · digitado 22,90 sobre o automático 22.94 · 06/09/2026
```

E o relatório dele está **FINALIZADO** (`pdfRef` presente, SHA
`4e9f34ee…fb6cd74`). Relatório finalizado serve os bytes arquivados e nunca é
remontado (§7-quater), então o override não é aplicado nem consultado: o
`22,90` já está impresso no PDF que foi emitido.

**Rascunhos afetados: ZERO. Perda silenciosa: NÃO.**

### A borda que sobra, e a compatibilidade proposta

`copiarOverrides` faz com que DUPLICAR um relatório leve os overrides junto. Se
alguém duplicar aquele relatório finalizado, a cópia nasce com o id antigo, que
o código novo não reconhece, e a célula volta ao valor calculado — perdendo a
correção de 0,04 kgf sem avisar.

Não foi implementado nada, porque não há caso hoje e a regra do pedido é
"medir antes". Se um dia for preciso, a migração SEGURA é:

```
pressoes.<campo>-<u>  →  pressoes.<campo>
   SOMENTE quando <u> é a unidade ATUAL do equipamento
```

Nunca incondicionalmente: um override de `22,90` digitado na coluna kgf, levado
para uma célula que imprime MPa, poria 22,90 MPa no papel — dez vezes a pressão
real. Quando as unidades não casam, o certo é NÃO migrar; e para não ser
silencioso, o campo deveria ser marcado na prévia como "override descartado por
troca de unidade".
