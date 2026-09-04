# FASE 10A · Agenda, faturamento e as três listas

**03/09/2026.** Primeira entrega depois da Fase 9. Cinco pedidos do dono, numa
rodada só. Nada de PDF, nada de geração de documento, nada de histórico.

---

## 1 · Agenda — antes e depois

| | antes | depois |
|---|---|---|
| onde vive | painel de MEIA LARGURA dentro do Dashboard | tela própria, `/agenda`, item no menu |
| o que cabia no dia | o número e uma bolinha | número no canto superior esquerdo + os serviços escritos + "+ N serviços" |
| dia selecionado | o compacto pintava o dia de HOJE com fundo **preto** (`--ink`) | círculo/contorno **azul-escuro** (`--blue2`) em volta do número; a célula continua branca |
| clicar no dia | abria um formulário de anotação com 5 campos | abre o **modal do dia**, com todos os serviços daquele dia por inteiro |
| o que o serviço guarda | título, tipo, TAG, observações | + horário, status, valor e **referência ao cliente** |

O modal do dia mostra, por serviço: **empresa, endereço, responsável, telefone**,
tipo, equipamento/TAG (quando existe), horário, status, valor e observações.

> **Empresa, endereço, responsável e telefone NÃO foram duplicados.** Eles já
> existem no cadastro de clientes (`Cliente.endereco/bairro/cidade/estado/cep`,
> `contato` = responsável, `telefone`). A nota guarda só `clienteId`, e o modal
> resolve na hora de exibir. Copiar criaria um segundo lugar para a mesma
> verdade: corrigir o telefone no cadastro deixaria a agenda mostrando o antigo,
> e ninguém saberia qual dos dois vale.

**O calendário de `/vencimentos` continua existindo** — ele é dos PRAZOS, não da
agenda. O que saiu dele foi o EDITOR de anotações: com `/agenda` no ar, manter os
dois seria manter dois formulários para o mesmo dado, e o de lá salvava metade
dos campos. Ele marca os dias com compromisso e leva para a Agenda.

## 2 · Faturamento previsto × realizado

`src/features/agenda/faturamento.ts` — funções puras, testadas
(`faturamento.test.ts`, 9 casos). A regra:

| status | conta como | por quê |
|---|---|---|
| `agendado` (e **ausente**) | **previsto** | serviço marcado não é dinheiro que entrou |
| `concluido` | **realizado** | |
| `cancelado` | **nenhum dos dois** | some das duas contas em vez de virar previsto eterno |

> **Nota anterior à 10A não tem `status`, e `statusDe()` a lê como `agendado`.**
> O contrário — tratar ausência como concluído — transformaria todo lembrete
> velho do usuário em faturamento realizado.

> **Valor ausente NÃO é zero.** `undefined` é "não informado" e é contado à
> parte (`semValor`); `0` é preço zero DIGITADO. Um mês com R$ 0,00 previsto e
> três serviços sem preço não é um mês sem faturamento — e a tela diz qual dos
> dois casos é.

**No Dashboard sobrou o resumo**: previsto no mês, realizado no mês, quantidade,
os três próximos compromissos e o botão **Abrir Agenda**.

Conferido no navegador: serviço de R$ 2.500 agendado → previsto 2.500 /
realizado 0. Mudando o status para concluído → previsto 0 / realizado 2.500. O
Dashboard repetiu os mesmos números.

## 3 · `/relatorios`

O que já funcionava ficou intacto: a lista é da 9E, vem da projeção, mais
recentes primeiro (`ordem_emissao desc, relatorio_id desc`), com busca por texto,
período e tipo, paginação por keyset e **zero PDF** ao listar.

Acrescentado:

- **o ícone de PDF que o dono mandou usar** — o arquivo real,
  `Downloads/pdf-IMAGEM.jpg`, copiado para `public/icones/pdf.jpg` (33.430 B,
  byte a byte). Ele marca o relatório FINALIZADO (o que tem `pdfRef`); quem não
  tem arquivo — o legado anterior ao §7-quater — recebe a marca vazia, e a
  diferença entre "PDF arquivado" e "só existe como receita" passa a ser
  visível. O JPEG é quadrado com margem branca; a caixa 3:4 com
  `object-fit: cover` + `transform: scale(1.25)` recorta **exatamente** a folha,
  sem redesenhar ícone nenhum;
- **filtro por empresa/cliente**, e o nome da empresa embaixo do relatório.

> **O filtro por empresa é do CLIENTE, e há motivo.** `relatorios_index` não
> guarda cliente — a projeção da 9E foi desenhada sobre o relatório, e o cliente
> pertence ao EQUIPAMENTO. O mapa TAG → empresa sai da projeção de equipamentos
> (`empresasPorTag.ts`) e só é buscado quando o painel de filtros ABRE: abrir a
> tela continua custando o que custava. Com empresa escolhida a lista é puxada
> até o fim, senão o filtro anunciaria "3 relatórios" para quem tem 40.

## 4 · `/prontuarios` e `/calibracoes`

As duas telas continuam POR EQUIPAMENTO, com toda a lógica de abrir/editar
intacta. O que mudou é o RECORTE padrão, em `src/services/recorteCatalogo.ts`
(compartilhado, 11 casos de teste):

- `/prontuarios` esconde quem **comprovadamente não tem** prontuário;
- `/calibracoes` esconde quem tem **0 calibrações** — some o "Nenhuma calibração";
- as duas ganharam filtro por **tipo** (esse vai na consulta, a RPC tem o
  parâmetro) e por **empresa/proprietário**, além da busca por texto que já
  existia;
- uma caixa **"Só equipamentos com …"** desliga o recorte, para cadastrar o
  primeiro documento de um equipamento que ainda não tem.

> **`null` não é `0`, e é a regra inteira deste módulo.** A projeção responde
> `true`/`n>0` = tem, `false`/`0` = não tem, **`null` = ninguém contou**.
> Esconder o `null` seria afirmar uma ausência que não foi medida — o prontuário
> sumiria da tela de quem o tem. `possuiDocumento(null) === true`.

**A foto do equipamento à esquerda do cartão já existia** (`card-eq-img` +
`FotoImg` com `variante="thumb"`, e as iniciais da TAG como placeholder).
Conferido no navegador: 2 cartões com foto real, 4 com placeholder. Nada foi
reconstruído.

## 5 · O defeito que o navegador pegou — e que o `tsc` e a suíte não pegariam

A primeira versão da guarda do mapa de empresas perguntava
`mapaEmpresas.porTag.size > 0`. Numa organização em que **nenhum** equipamento
tem cliente, o mapa volta VAZIO, a condição nunca fica verdadeira, e o efeito se
redispara a cada quadro.

**Medido no navegador: 789 chamadas a `buscar_equipamentos` em 8 segundos.**

Corrigido com um `useRef` — "já pedi" é um fato do componente, não uma propriedade
do resultado. Resultado vazio é uma resposta, e precisa ser lembrado como tal.
Depois da correção: **20 chamadas** (exatamente o teto), e a lista para.

> Isto não tem teste, e a razão é honesta: a suíte roda em ambiente `node`, sem
> DOM, e a guarda mora dentro de um `useEffect`. O que dá para testar
> (`empresasPorTag`, `recorteCatalogo`, `faturamento`) está testado como função
> pura. O resto se confere no navegador — e foi assim que apareceu.

## 6 · Riscos e limitações declarados

| # | limitação | impacto | o que resolve |
|---|---|---|---|
| 1 | **Filtro por empresa e recorte de documento são do CLIENTE** | numa organização com mais de 1.000 equipamentos a varredura para no teto (20 páginas) e a lista **pode ficar incompleta** — a tela DIZ isso, com o aviso no painel de filtros | coluna `cliente_nome` em `relatorios_index` e parâmetros `p_com_prontuario` / `p_com_calibracao` em `buscar_equipamentos`. Precisa de SQL, e o editor do Supabase segue sem abrir |
| 2 | **Abrir `/prontuarios` ou `/calibracoes` numa organização grande dispara até 20 requisições** (50 equipamentos por página) | em produção a maior organização tem 39 equipamentos = **1 requisição**. O custo só aparece em laboratório | o mesmo SQL do item 1 |
| 3 | **Não há filtro por "data de atualização do prontuário"** | pedido no escopo, não entregue: essa data **não existe na projeção**, e lê-la do `nr13_prontuario_<TAG>` obrigaria a baixar o documento de cada equipamento — exatamente o que a Fase 9 desfez | coluna de data na projeção |
| 4 | **A agenda vive em `nr13_agenda_notas`, uma chave só** | ela cresce com o número de serviços; hoje é minúscula, e é chave ESSENCIAL do boot leve (já era) | se crescer, o caminho é o mesmo do §7-sexies: um registro por serviço + índice |
| 5 | **O filtro por empresa não distingue homônimos** | dois clientes com o mesmo nome caem no mesmo grupo — o mapa é por NOME, não por id | filtrar por `cliente_id` quando o item 1 for feito |
| 6 | **`fase9_remocao_flags.sql` continua sem aplicar** | nenhum: o cliente já não lê as oito colunas | rodar quando o SQL Editor abrir (hash em `PONTO-DE-RETOMADA.md`) |

## 7 · O que NÃO foi tocado

- geração de PDF, `pdfRef`, `sha256`, relatórios e prontuários já emitidos;
- Livro de Registro, lacre e a trava do banco;
- certificados de calibração e a rastreabilidade;
- RLS, fila durável, offline, boot leve;
- a lógica de abrir/editar de `/prontuarios` e `/calibracoes` — só a LISTA mudou;
- 10B.1, 10B.2, 10C e Fase 11: não iniciadas.

## 8 · Números

| | |
|---|---|
| suíte | **1.633 testes, 138 arquivos, 0 falhas** (+25 testes, +3 arquivos) |
| `tsc -b` | limpo |
| build | verde |
| arquivos novos | `pages/Agenda.tsx`, `pages/agenda.css`, `features/agenda/faturamento.ts`, `features/relatorios/empresasPorTag.ts`, `services/recorteCatalogo.ts`, `public/icones/pdf.jpg` |
