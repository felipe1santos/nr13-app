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
