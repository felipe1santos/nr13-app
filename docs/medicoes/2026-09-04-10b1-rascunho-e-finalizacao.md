# FASE 10B.1 · RASCUNHO → FINALIZAR → PDF IMUTÁVEL

**04/09/2026.** O relatório passa a ter ciclo de vida. Até aqui existia um botão
só, chamado "Salvar", que gerava o PDF, calculava o SHA-256 e trancava o
documento — quem clicasse achando que estava guardando o trabalho, finalizava.

---

## 1 · O modelo, e a decisão que faz o resto funcionar sozinho

`RelatorioSalvo.status` deixou de ser a constante `'Aprovado'` e virou
`'Aprovado' | 'Rascunho'`. **`'Aprovado'` continua significando FINALIZADO**, e é
o valor que todo relatório histórico já tem: nada foi renomeado, nada foi
migrado, nenhum documento antigo precisou ser tocado. `ehRascunho(status)`
responde `false` para ausente, vazio e `'Aprovado'`.

> **A DECISÃO: rascunho não entra no índice do equipamento.**
>
> `nr13_historico_indice_<TAG>` é a origem da projeção `relatorios_index`, e
> dela saem quatro coisas que um documento em edição não pode produzir:
>
> 1. **o vencimento oficial** — `vencimentos_org` pega o relatório MAIS RECENTE
>    de cada TAG e tira dele a próxima inspeção. Um rascunho com data de emissão
>    viraria "o último relatório" e apagaria o prazo real do equipamento. Não é
>    exagero: aconteceria na primeira vez que alguém começasse um relatório e
>    fosse almoçar;
> 2. **o Portal do Cliente**, que lista por `listarIndice(tag)`;
> 3. **as contagens** de relatório emitido (`contarRelatorios`);
> 4. **a entrada automática no Livro**, que só existe dentro do finalizar.
>
> Nenhuma das quatro precisou de um `if` novo. O rascunho simplesmente não chega
> lá — e caminho que não existe não é esquecido numa refatoração, ao contrário
> de um filtro.

Onde ele vive, então:

| | |
|---|---|
| conteúdo | `nr13_rel_<id>_<TAG>` — **a mesma chave** do finalizado, com `status: 'Rascunho'`. Sincroniza entre aparelhos pela v2 e sobrevive a fechar o navegador |
| lista | `nr13_rascunhos` — chave global e leve (~150 B por rascunho), no espírito do §7-sexies. Global porque `/relatorios` mostra rascunho de qualquer equipamento |

Usar a mesma chave do registro é o que faz **finalizar reescrever no lugar**: o
id não muda, o histórico não ganha um documento fantasma, e não existe momento
em que o mesmo relatório aparece duas vezes.

`nr13_rascunhos` entrou em `CHAVES_ESSENCIAIS` (o boot leve precisa dela para a
tela poder listar) e em `GLOBAIS` de `familiasChave`. Não vai para o palco:
nenhum template a lê.

## 2 · Os dois botões

| | Salvar rascunho | Finalizar relatório |
|---|---|---|
| drena a ponte | sim | sim |
| gera PDF | **não** | sim |
| SHA-256 + upload | **não** | sim |
| entra no índice | **não** | sim |
| Livro / vencimento / Portal | **não** | sim |
| documento continua editável | **sim** | não |

A ponte é drenada nos DOIS: medição de espessura e laudo são digitados dentro
dos iframes e só chegam ao app por `sbSalvar`. Salvar rascunho sem drenar
guardaria o documento sem o que o usuário acabou de digitar — que é exatamente a
queixa que o rascunho veio resolver.

## 3 · O modal de finalização

Nunca finaliza em silêncio. Antes de perguntar, o modal analisa o relatório e
separa em duas listas — e a separação é a regra:

- **obrigatório faltando BLOQUEIA**, e o botão de finalizar nem aparece: número
  do relatório, data de emissão, tipo de inspeção, engenheiro responsável, ao
  menos uma folha, e o laudo APTO/INAPTO **quando a folha de conclusão faz parte
  do relatório**;
- **opcional em branco AVISA e deixa passar**: validade, execução, próximas
  inspeções, técnico, e os campos dos ensaios que o relatório realmente inclui
  (pressão/data/resultado do teste hidrostático, observação e resultado dos
  exames visuais, aparelho e resultado do ultrassom).

> Por que opcional não bloqueia: campo em branco é comum e legítimo. Transformar
> cada um em bloqueio ensina o usuário a preencher qualquer coisa para liberar o
> botão — e aí o campo passa a MENTIR, que é pior do que estar vazio. O modal diz
> isso, com todas as letras, embaixo da lista de avisos.

`validacaoFinalizacao.ts` é função pura sobre os dados (12 casos de teste): a
suíte roda em ambiente `node`, e uma regra que decide se um documento pode ser
trancado não pode morar dentro do JSX, onde nenhum teste alcança.

## 4 · Na tela `/relatorios`

O layout aprovado na 10A.5 ficou intacto. Os rascunhos aparecem num **bloco
próprio, acima**, com badge `RASCUNHO` e **ícone de lápis — nunca o do PDF**: o
ícone do PDF significa "existe um arquivo arquivado", e num rascunho não existe
nenhum. Clicar leva ao editor, para continuar de onde parou.

Bloco separado, e não linhas misturadas: rascunho não tem emissão fixada, nem
PDF, nem SHA — misturado, ele apareceria como uma linha de quatro travessões, e
a diferença entre documento assinado e trabalho em andamento viraria um detalhe
de cor.

Os rascunhos respondem à **busca por texto e ao filtro de tipo**. Período,
empresa e escopo são filtros do SERVIDOR, sobre a projeção — e rascunho não está
na projeção, de propósito. Com um desses ligado, o bloco é escondido em vez de
mostrado desfiltrado.

## 5 · Um defeito de caminho que este trabalho revelou

**Não havia como criar um relatório pela interface.** A prop
`aoEscolherEquipamento` existe em `RelatoriosV9` desde a 9E, mas nunca foi
ligada em `Relatorios()`; com a remoção da tela legada na 9G.3, o último caminho
que restava era digitar `?legado=1` na barra de endereço. O botão
"+ Criar relatório" existia no código e nunca era renderizado (e apontava para
uma classe CSS que não existe, `fj-btn-primario`).

Ligado e corrigido aqui, porque sem ele não há como criar o rascunho que esta
fase inteira existe para guardar.

## 6 · O que foi validado no navegador, em sequência

Organização de laboratório, equipamento `SEM-01`:

| passo | resultado |
|---|---|
| criar relatório pelo botão novo | editor abre com o selo **RASCUNHO** e os dois botões |
| Salvar rascunho | toast; registro gravado com `status: 'Rascunho'`; **índice da TAG segue com 1 item, o relatório finalizado que já existia** |
| sair para `/relatorios` | bloco "EM RASCUNHO (1)", badge, ícone de lápis, **nenhum ícone de PDF** na linha |
| clicar em continuar | editor reabre **editável**, com as 15 folhas |
| Finalizar (sem engenheiro e sem laudo) | modal BLOQUEIA: só "Voltar e revisar"; lista os 2 obrigatórios e os opcionais |
| corrigir os dois e finalizar | botão "Finalizar relatório" aparece; contador "Gerando PDF 12/15…" |
| confirmar | toast "Relatório finalizado"; selo some; os dois botões de edição somem |
| conferir os dados | `status: 'Aprovado'`, `pdfRef` presente, `sha256 d94e79d7…`, 15 páginas, `pdfPendente: false`, índice com o relatório, **`nr13_rascunhos` vazio** |
| reabrir o finalizado | "Documento arquivado — o que você vê é o arquivo emitido", 15 páginas, o MESMO SHA-256, e nenhum botão de edição |

**Um defeito encontrado e corrigido durante essa validação:** abrir um rascunho
pela URL parava no histórico do equipamento sem abrir nada. A busca era feita só
no índice — e o rascunho não está lá, de propósito. Agora, quando o índice não
tem, o registro é procurado direto pela chave.

## 7 · Livro — mapeado, NÃO alterado (é a 10B.2)

A entrada automática no Livro nasce em **uma linha**:
`await adicionarEntradaLivroAuto(relatorio)`, em `salvarHistorico`
(`src/pages/Relatorios.tsx`), logo depois de `salvarNoHistorico`. É o único
acoplamento entre finalizar um relatório e escrever no Livro. Anotado no código,
naquele exato ponto.

O que a 10B.2 vai precisar tocar, já levantado:

| lugar | o que faz hoje | o que muda |
|---|---|---|
| `Relatorios.tsx` · finalizar | chama `adicionarEntradaLivroAuto` | deixa de chamar |
| `relatoriosService.adicionarEntradaLivroAuto` | monta a entrada e não duplica se já existir | vira a ação MANUAL "criar registro", disparada da tela do Livro |
| `livroLacre.ts` | lacra toda entrada ao gravar | passa a lacrar só no **TRANCAR** |
| `supabase/livro_imutavel.sql` | exige que a sequência de entradas **lacradas** do valor novo comece pela do valor antigo | **não precisa mudar**: ele só olha entradas com `sha256`, então rascunho de registro (sem lacre) já passa. Conferido no arquivo |
| `LivroRegistro.tsx` | lista e permite ocorrência manual | ganha os estados rascunho/trancado |
| Portal | lista o livro pelo mesmo caminho | mostra só o que estiver trancado |

**Nada disso foi implementado nesta rodada.**

## 8 · Compatibilidade — conferida, não presumida

- relatório histórico sem `status` continua FINALIZADO e continua sendo reparado
  para dentro do índice (teste próprio);
- `pdfRef`, `sha256` e os PDFs no bucket: intocados, nenhum regenerado;
- Portal, vencimentos, fila durável, offline, fotos, RLS: nenhum arquivo desses
  caminhos foi alterado;
- relatórios de equipamento excluído: o escopo continua funcionando como na
  10A.5;
- o Livro continua sendo escrito exatamente como antes.

## 9 · Números

| | |
|---|---|
| suíte | **1.660 testes, 140 arquivos, 0 falhas** (+27 testes, +2 arquivos) |
| `tsc -b` | limpo |
| build | verde |
| arquivos novos | `rascunhos.ts`, `validacaoFinalizacao.ts`, `ModalFinalizar.tsx`, `modalFinalizar.css` (+2 de teste) |
