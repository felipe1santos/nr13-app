# UX de Calibrações — auditoria e reestruturação, 11/09/2026

> Auditoria escrita **antes** da primeira linha de código, como pedido no §36
> da especificação. As seções "Novo fluxo" em diante foram completadas depois
> da implementação.

## Estado anterior

Ao abrir um equipamento em `/calibracoes`:

```
← Voltar  [foto 100px]  Calibrações — ZZ-TESTE-P2        ┌─ COMPONENTES ──────┐
                        ⚠ Como funciona                   │ PSV-GATE-9F3   ✎ 🗑│
                                                          │ man            ✎ 🗑│
Lotes de calibração                    [+ Novo lote]      └────────────────────┘

▸ werwer      1/2 calibrado   EM ANDAMENTO   ✎
▸ dasdsad     1/2 calibrado   EM ANDAMENTO   ✎
```

Clicar no lote (accordion) despeja **todos os componentes do equipamento**
abaixo dele, com foto de 40 px, status e três botões cada. Dois lotes abertos
com cinco componentes = dez blocos empilhados antes do próximo lote.

## Arquitetura real

### Estrutura de dados

| chave | tipo | conteúdo |
|---|---|---|
| `nr13_componentes_cal_<TAG>` | `ComponenteCal[]` | **fonte mestre** do acessório: `id`, `tipo`, `nome`, `fabricante`, `modelo`, `serie`, `referencia`, `unidade`, `pontos[]`, `pressaoAjuste`, `foto`/`fotoRef` |
| `nr13_lotes_cal_<TAG>` | `LoteCal[]` | `id`, `criadoEm` (dd/mm/aaaa), `descricao`, `relatorioId?`, `vincularProximoRelatorio?` |
| `nr13_calibracoes_<TAG>` | `DadosCalibracao[]` | a lista, para a tela e para o Dashboard |
| `nr13_calibracao_item_<id>` | `DadosCalibracao` | o MESMO objeto, por id — é o que o template lê por `?calibId=` |
| `nr13_rastreab_<id>` | `Rastreabilidade` | **outra coisa**: o certificado do PADRÃO de medição (menu Certificados) |

`salvarCalibracao` grava **as duas** chaves (lista + item). A duplicação é
deliberada: a Edge do Portal só entrega chaves terminadas em `_<TAG>`, então o
item individual não chega ao cliente — `hidratarItemLocal` o reconstrói a partir
da lista.

### Lifecycle — o que existe hoje

| pergunta | resposta medida no código |
|---|---|
| o que é "Completo"? | `calsDoLote.length >= componentes.length` — calibrações **daquele lote** contra o total de componentes **do equipamento** |
| o lote guarda quais itens cobre? | **NÃO.** Não há campo de itens; o corpo do accordion renderiza `componentes.map(...)` inteiro |
| o lote tem data própria? | **NÃO.** Só `criadoEm`, gravado automaticamente por `criarLote` |
| a calibração individual tem data? | **SIM** — `dataCalibracao`, editável, padrão = hoje |
| calibração salva pode ser editada? | **NÃO.** `salvar()` sempre cria `cal-${Date.now()}`; não existe caminho de reabertura para edição. Corrigir = excluir + refazer |
| lote pode ser excluído? | Só **vazio** (`calsDoLote.length === 0`) — o botão nem aparece havendo certificado |
| certificado é imutável? | Não há trava. O que existe é **snapshot**: ver abaixo |

**Defeito encontrado na regra de "Completo":** ela compara com o total de
componentes do equipamento HOJE. Cadastrar um manômetro novo faz todo lote
antigo "Completo" voltar a "Em andamento", retroativamente, sem nada ter
mudado naqueles lotes.

### Histórico: snapshot ou view? (§35)

**Snapshot.** `converterForm` COPIA `fabricante`, `modelo`, `serie`,
`referencia`, `instrumento` e a unidade para dentro de `DadosCalibracao` no
momento do save. O template lê o registro, não o componente. Trocar o
fabricante no cadastro **não altera** certificado já emitido — comprovado pela
cadeia de leitura (`?calibId=` → `nr13_calibracao_item_<id>` → `inj(...)`).

Há uma segunda camada para o relatório: `meta.certCalibracoes` congela os
certificados dentro do `RelatorioSalvo` (§7-bis).

**Conclusão sobre §34 (não duplicar):** a duplicação existente é a correta —
cadastro é fonte mestre para PREENCHER, e a calibração guarda a cópia para
PRESERVAR. O que não existia era o preenchimento a partir do mestre, feito em
`d960ab6`.

### PDF (§21, §22, §23)

**Não existe artefato arquivado para certificado de calibração.** Diferente de
relatório e prontuário (§7-quater: `pdfRef` + `sha256`), o certificado é
**re-renderizado do registro** toda vez que se abre. Só havia "Imprimir"
(`imprimirRelatorio('.cal-preview')`); não havia download.

Consequência honesta para o §23: "Baixar PDF" **gera** o arquivo do registro
atual — não há documento histórico arquivado que pudesse ser servido no lugar.
Isso é diferente do relatório, e está registrado aqui para não se confundirem.

### Validade → Dashboard (§32)

```
DadosCalibracao.dataProxCalibracao
  → listarVencimentos()  (vencimentos.ts:326)
     · lê nr13_calibracoes_<TAG>
     · agrupa por componenteId — só a calibração MAIS RECENTE de cada
       componente conta (senão o painel mostraria o prazo já substituído)
  → itemDeCalibracao()  → { origem: 'calibracao', pertenceA: <TAG>, vencimento }
  → Dashboard / /vencimentos
```

A "TAG" do acessório no painel é rótulo, não identidade:
`MANÔMETRO-<serie>` ou o nome.

### Certificados: as duas coisas que não se confundem (§33)

| | certificado de CALIBRAÇÃO | certificado do PADRÃO |
|---|---|---|
| o que é | o documento que ESTE sistema emite para o acessório do cliente | o PDF do laboratório que calibrou o INSTRUMENTO PADRÃO do inspetor |
| chave | `nr13_calibracao_item_<id>` | `nr13_rastreab_<id>` |
| onde se cadastra | `/calibracoes` | `/certificados` |
| escopo | por equipamento (TAG) | da organização inteira |
| aparece onde | folha `CERTIFICADO-CAL-*` | bloco 5 daquela folha + anexo do relatório |

O bloco 5 do certificado de calibração é preenchido A PARTIR do certificado do
padrão (`padraoSugerido`, desde `d960ab6`) — é o único ponto onde os dois se
tocam.

### Vínculo com relatório

`LoteCal.vincularProximoRelatorio` põe o lote numa fila; `salvarHistorico()`
chama `vincularLotesPendentes(tag, relatorioId)`, que carimba `relatorioId` no
lote. `validadesPorRelatorio` deriva dali a menor `dataProxCalibracao` por tipo.
**Nada disso foi tocado nesta rodada.**

## O que a nova UX exige do modelo

Duas coisas que hoje não existem, e por isso o §7 e o §8 da especificação não
tinham como funcionar:

1. **`LoteCal.data`** — a data da calibração do lote. Hoje só há `criadoEm`
   (quando o registro foi feito), que não é a mesma coisa: pode-se lançar em
   setembro uma calibração executada em agosto.
2. **`LoteCal.itens`** — quais componentes aquele lote cobre. Sem isso, o
   "2/2" compara com o parque inteiro e muda sozinho.

Ambos entram como **opcionais**, com fallback explícito para os lotes que já
existem:

| campo ausente | significa | por quê |
|---|---|---|
| `data` | usa `criadoEm` | é a única data que o lote antigo tem |
| `itens` | todos os componentes de hoje | é exatamente o comportamento atual — o lote legado não sabe o que cobria |

Nenhuma migração, nenhuma reescrita de registro antigo.

---

# Novo fluxo — implementado

## Cabeçalho

Faixa única de **67 px** (1400 px): Voltar · foto de 44 px · TAG + tipo + "Como
funciona" · acessórios EM LINHA à direita, com `overflow-x: auto`. Eles eram
uma coluna à direita que empurrava os lotes — o trabalho — para fora da
primeira tela.

No celular a faixa quebra em três linhas (187 px) e os acessórios ganham
`scroll-snap-type: x proximate`: arrastar para NO acessório, não no meio dele.

## Componentes

Mini-cartão horizontal de 40 px com foto/ícone, nome, tipo e série, e o lápis
para editar. `+ Adicionar` ao fim da faixa. O cadastro estrutural não mudou —
segue sendo a fonte mestre (`ComponenteCal`).

## Lotes

Lista única, **44 px por linha** no desktop e **64 px** no celular:

```
LOTE CALIBRACAO IA 2026        11/09/2026   1/2   EM ANDAMENTO   👁 ✎ 🗑
```

Acima dela, a barra `[Buscar lote, data ou acessório…] [Situação] [+ Novo lote]`.
A busca casa o nome, a data **e o nome dos acessórios** do lote — "quando o
PSV-01 foi calibrado?" é a pergunta que se faz aqui, e ela não se responde
procurando pelo nome do lote.

Ordem: pela data de EXECUÇÃO, do mais recente ao mais antigo.

## Nova calibração

`Calibrar` leva à tela dedicada, agora com o contexto no topo
(`Lote · Data · Acessório`) e `← Voltar ao lote`, que **reabre o lote** de onde
se veio — não a lista. A data do lote semeia `dataCalibracao` e
`dataProxCalibracao` (+12 meses), ambas editáveis.

Cada seção diz de onde vem: `cadastro do acessório` (azul) contra
`desta calibração` (verde).

## Histórico

`historicoDoComponente` ordena as calibrações de um acessório do mais recente
ao mais antigo. O modal do lote mostra, por item, calibração, próxima e
certificado.

## PDF

`Visualizar PDF` abre a folha DENTRO do modal do lote; `Voltar ao lote` devolve
o lote no estado anterior (comprovado: `visor:false, lote:"LOTE CALIBRACAO IA
2026"`). ESC fecha primeiro a folha, depois o lote.

`Baixar PDF` passou a existir e usa `exportarPdf`. Ele **gera** do registro —
ver a auditoria: certificado de calibração nunca teve artefato arquivado.

## Dashboard

Inalterado. A cadeia foi conferida DEPOIS da mudança.

## Mobile

| largura | overflow-X | altura/lote | acessórios rolam | faixa |
|---|---|---|---|---|
| 1400 | não | 44 px | não | 67 px |
| 768 | não | 44 px | não | 123 px |
| 390 | não | 64 px | **sim** | 187 px |
| 386 | não | 64 px | **sim** | 187 px |

Medido com iframe de largura fixa contra a produção. Meta do §25 (60–85 px por
lote): cumprida.

## E2E

Equipamento `ZZ-TESTE-P2`, lote `LOTE CALIBRACAO IA 2026`, data `11/09/2026`,
2 itens selecionados:

| passo | resultado |
|---|---|
| criar lote | modal com nome, data e itens; `2 de 2 selecionados` |
| lista | **uma linha**, 44 px: `LOTE CALIBRACAO IA 2026 · 11/09/2026 · 0/2 · EM ANDAMENTO` |
| abrir pelo olho | modal com os 2 itens; ambos `PENDENTE` + `Calibrar` |
| calibrar `man` | contexto `LOTE · DATA · ACESSÓRIO`; acessório já preenchido (`kjhk`, `WIKA 232.50`, `jkhhkj`, `0 a 10 kgf/cm²`); padrão de `RBC-2026/44120`; datas `11/09/2026` → `11/09/2027`; `0 de 6 pontos` |
| preencher | `6 de 6 pontos medidos · maior erro 0,20 kgf/cm²` |
| salvar | linha passou a `1/2 · EM ANDAMENTO` |
| **F5** | lista intacta; lote continua `1/2` |
| reabrir lote | `man` = `APROVADO`, com fabricante/modelo/série/faixa, `CALIBRAÇÃO 11/09/2026`, `PRÓXIMA 11/09/2027`, `CERT-1789136379319`; `PSV-GATE-9F3` = `PENDENTE` + `Calibrar` |
| visualizar PDF | folha completa dentro do modal, com bloco 5 preenchido e as 6 linhas de resultado |
| voltar ao lote | `visor:false`, lote reaberto no mesmo estado |
| **Dashboard** | `MANÔMETRO-jkhhkj · pertence a ZZ-TESTE-P2 · CALIBRAÇÃO · 11/09/2026 → 11/09/2027 · Vence em 365 dias · OPERACIONAL` |

## Defeito encontrado depois do primeiro deploy

`.cal-lote-nome` era o CONTÊINER do campo de renomear (06/09), com borda âmbar
e fundo de painel. A lista nova usa o mesmo nome de classe para o NOME do lote:
o resultado era uma caixa com cara de input em volta de cada nome, numa lista
que não tem campo nenhum. Removido com o bloco do cabeçalho antigo — 215 linhas
de CSS órfão a menos.

## Pendências

- **Calibração salva não se edita.** `salvar()` sempre cria `cal-${Date.now()}`;
  corrigir um certificado é excluir e refazer. Não foi alterado nesta rodada
  (§10: documentar a regra atual antes de inventar trava nova). É a decisão de
  produto mais óbvia daqui.
- **Condições ambientais** seguem manuais — não há fonte no sistema.
- 16 classes `.cal-` órfãs de UIs anteriores a esta rodada (`cal-add-card*`,
  `cal-tipo-*`, `cal-filtros`, `cal-historico-table`) continuam no CSS. Não
  foram tocadas por não pertencerem a esta mudança.
- A faixa do equipamento ocupa 187 px em 386/390 px. Dentro do razoável (ainda
  cabem ~7 lotes na tela), mas é o ponto mais gordo do celular.

## Ponto de retomada

Decidir se calibração salva passa a ser editável — e, se sim, se a edição
mantém o id (corrige o certificado) ou cria versão nova com soft-replace, como
`nr13_rastreab_` faz.
