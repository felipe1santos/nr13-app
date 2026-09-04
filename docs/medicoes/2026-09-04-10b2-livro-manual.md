# FASE 10B.2 · LIVRO DE REGISTRO: MANUAL, E TRANCADO POR DECISÃO

**04/09/2026.** Finalizar um relatório deixou de escrever no Livro de Segurança.
O registro passou a ser um ato do usuário: NOVO REGISTRO → preencher → SALVAR →
continua editável → TRANCAR → cadeia → imutável → Portal.

---

## 1 · O acoplamento que saiu

Uma linha, em `Relatorios.tsx`, dentro do "salvar":

```
await adicionarEntradaLivroAuto(relatorio);
```

Ela criava, sozinha, um registro **oficial e já lacrado** no documento legal do
equipamento. O usuário nunca via o que estava sendo escrito ali, e depois de
lacrado não havia como corrigir — só retificar.

A função não foi apagada: virou `montarEntradaLivroDoRelatorio`, que **monta e
devolve** a entrada com os mesmos campos de sempre (ensaios, laudo APTO/INAPTO,
rubrica congelada, termo digitado na folha). Ela agora alimenta o
**pré-preenchimento** do registro manual — o que restou do automatismo é uma
oferta, não uma decisão.

O mesmo aconteceu com a ocorrência manual: `adicionarEntradaLivroManual` virou
`montarEntradaLivroManual` e parou de gravar **e de reordenar** o array.

## 2 · Três estados, e o terceiro é o motivo de existir o campo

> **"Sem `sha256` = rascunho" seria a leitura errada, e a mais cara.**

O livro tem anos de entradas anteriores ao lacre (12/08/2026) e ocorrências
manuais que nunca foram lacradas. Rebaixá-las a rascunho as tiraria da contagem
oficial, do Portal e da folha impressa — apagaria registro de segurança de
equipamento em operação. Então o marcador é EXPLÍCITO (`estadoRegistro.ts`):

| estado | reconhece-se por | é oficial? |
|---|---|---|
| `trancado` | `estado === 'trancado'`, ou tem `sha256` (lacrado antes do campo existir) | sim |
| `rascunho` | `estado === 'rascunho'` — e mora em chave separada | **não** |
| `legado` | não diz nada: registro anterior a esta fase | **sim** |

## 3 · A decisão de armazenamento — a mesma da 10B.1

> **O rascunho não entra em `nr13_livro_<TAG>`.** Ele vive em
> `nr13_livro_rascunho_<TAG>`.

Aquela chave tem três consumidores que só podem enxergar registro oficial, e
**nenhum dos três precisou de filtro novo**:

1. **a projeção** — `busca_manutencao.sql` faz `jsonb_array_length` da chave e
   grava em `equipamentos_index.livro_entradas`, que é o número da lista da
   9F.4. Um rascunho ali viraria "3 registros" onde há 2 — o exemplo exato do
   pedido. E este filtro **não poderia** ser feito agora de outro jeito: é SQL, e
   o SQL Editor do Supabase segue sem abrir;
2. **o Portal do Cliente**, que lê `nr13_livro_<TAG>` direto;
3. **a folha impressa** `LIVRO-REGISTRO.html`, que é documento legal.

Camadas de segurança registradas, além da chave separada:

- `nr13_livro_rascunho_` entrou em `FORA_DO_PORTAL` (Edge `portal_cliente`), com
  o motivo escrito — há um teste de paridade que **quebra** se uma família
  nova não for declarada de um lado ou do outro. Foi ele que exigiu a declaração;
- entrou em `FORA_DO_PALCO`: nenhuma folha lê a chave, e nenhuma deve;
- `montarLinha` filtra por `somenteOficiais` — defensivo, para o caso de um
  rascunho chegar à chave oficial por qualquer caminho.

## 4 · A cadeia: trancar ACRESCENTA AO FIM

`livro_imutavel.sql` **não foi tocado**. Ele exige que a sequência de entradas
lacradas do valor novo comece exatamente pela do valor antigo — então trancar
**acrescenta ao fim** e nunca reordena.

> A cadeia é uma sequência de LACRES, não de datas. Foi por isso que a
> ordenação cronológica saiu do caminho de gravação: com entradas lacradas
> dentro do array, reordenar seria recusado pelo servidor. A tela ordena para
> exibir; o array guarda a ordem de trancamento.

`estado: 'trancado'` é aplicado **antes** do lacre, de propósito: assim ele entra
no conteúdo hasheado. Marcar depois deixaria o estado fora da prova — e há teste
que rebaixa o campo e exige o veredicto `adulterada`.

## 5 · Validado no navegador, em sequência

Organização de laboratório, equipamento `SEM-01` (que já tinha 1 registro
histórico, criado pelo fluxo automático antigo):

| passo | resultado |
|---|---|
| abrir o livro | botão **"Novo registro"**; badge "1 registro(s)" |
| pré-preencher pelo relatório já registrado | recusa explícita: "Este relatório já tem registro trancado neste livro" |
| preencher e **Salvar rascunho** | grava só `nr13_livro_rascunho_SEM-01`, com `estado: 'rascunho'` e **sem sha256**; `nr13_livro_SEM-01` continua com 1; badge continua **"1 registro(s)"** |
| sair para o Dashboard e voltar | seção **"RASCUNHOS (1)"**, badge `RASCUNHO`, texto "não contam como registro, não entram na cadeia e não aparecem no Portal" |
| editar e salvar de novo | o MESMO id é reescrito — 1 rascunho, texto atualizado |
| **Trancar registro** | modal irreversível, com a lista de opcionais e os dois botões |
| confirmar | rascunho some; livro passa a **2 entradas**; a nova com `estado: 'trancado'`, `sha256 af5afe5a9e…` e **`shaAnterior` = sha da anterior**; badge vira **"2 registro(s)"** |
| selo da tela | "Cadeia de registros íntegra"; as duas entradas `integra` |
| tentar editar o trancado | veredicto **`adulterada`** |
| Portal | `nr13_livro_SEM-01` sem nenhum rascunho; a Edge **não busca** o prefixo de rascunho e o declara em `FORA_DO_PORTAL` |

Um defeito corrigido durante a validação: escolher no pré-preenchimento um
relatório cujo REGISTRO ainda não está neste aparelho (boot leve) não fazia nada
e deixava na tela o erro da escolha anterior. Agora diz o que houve.

## 6 · Compatibilidade — conferida

- **livros históricos**: intactos. Nenhuma entrada foi migrada, reescrita ou
  relacrada. `EQUIPE TESTE` e `VASO A23` não foram tocados;
- **cadeias e SHA existentes**: preservados — o encadeamento novo parte da última
  entrada lacrada que já existia;
- **capa, termo de abertura, PDFs históricos, relatórios finalizados,
  certificados**: nenhum arquivo desses caminhos foi alterado;
- **registro legado (sem `estado` e sem `sha256`) é OFICIAL** — com teste próprio,
  porque é a regra que, se invertida, esvaziaria livros inteiros.

## 7 · Limitações declaradas

| # | limitação | por quê |
|---|---|---|
| 1 | A **projeção** (`livro_entradas`) continua contando `jsonb_array_length` da chave oficial | está correta hoje porque o rascunho não está lá. Um filtro por `estado` no SQL seria a segunda camada — precisa do SQL Editor, que segue sem abrir |
| 2 | O caminho **sob demanda** da Edge (`pedidas`) autoriza por `endsWith('_<TAG>')` | um cliente autenticado que adivinhasse o nome da chave poderia pedi-la. O Portal nunca a pede, e o rascunho não contém documento assinado. Endurecer isso exige deploy da Edge |
| 3 | Registros **manuais antigos** (anteriores a hoje) nunca foram lacrados | continuam como `legado`, oficiais e sem selo — exatamente como antes. Lacrá-los retroativamente seria inventar uma prova que não existe |

## 8 · Números

| | |
|---|---|
| suíte | **1.680 testes, 142 arquivos, 0 falhas** (+20 testes, +2 arquivos) |
| `tsc -b` | limpo · **build** verde |
| arquivos novos | `livro/estadoRegistro.ts`, `livro/rascunhosLivro.ts`, `livro/validacaoRegistro.ts`, `livro/ModalTrancarRegistro.tsx` (+2 de teste) |
