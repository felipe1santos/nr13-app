# Fase 6.1 · P0 — abrir o prontuário apagava a medição de espessura (24/09/2026)

Correção local: `7410d7d`. Sem migration, sem push, sem deploy.

## Semântica das duas chaves

| chave | dono lógico | escrito por | lido por | canônico? | o prontuário pode sobrescrever? |
|---|---|---|---|---|---|
| `nr13_med_grid_<TAG>` | EQUIPAMENTO, com `containerId` do container de onde a correção veio (desde 10/09) | editor de medições do relatório (`ModalMedicoes` → `salvarMedicoes`, carimba `containerId`); `ULTRASSOM.html` por `sbSalvar` (legado/rollback, sem dono); **até 7410d7d: `Prontuarios.aplicarEnsaioEspessura`** | relatório vetorial (`carregarMedicoes` → `montarGrade`: só vence o container se o dono confere, órfã só onde o container não tem dado); `ultrassomPaginacao` (nº de linhas sem container); `PRONT-ULTRASSOM`/`PRONT-P2` (iframe) | é a CORREÇÃO manual; o dado de campo canônico é o container (`nr13_docs_<TAG>[].dados.ultrassom`) | **NÃO** — não é dado do prontuário; ele só precisa LER o container |
| `nr13_med_esp_<TAG>` | EQUIPAMENTO | `salvarMedicoes` (mescla os mínimos, preserva o resto); `ULTRASSOM.html`; **até 7410d7d: o prontuário (substituindo o objeto inteiro)** | relatório vetorial (caracterização, `pontosUltrassom`: requerida manual em `pontos[].espMinRequerida`, aparelho, instrumento); `PRONT-*` (iframe) | canônico para requerida manual e campos do ensaio digitados no relatório | **NÃO** — o prontuário substituía o objeto e apagava requerida, aparelho e instrumento |

Versão correspondente no container: sim — `ContainerInspecao.dados.ultrassom` (`medidas`, `pontos`, `colunas`, `aparelho`…).

## Fluxo do defeito

`/prontuarios?tag=X` → efeito da URL → `abrirPorTag` → `abrirEquipamentoParaProntuario` (semeia a TAG) →
`abrirEquipamento` → prefill → `gravarProntuarioAtual` → `obterOuCriarMeta` →
`aplicarEnsaioEspessura(tag, containerSelecionado | null)` → `salvar(nr13_med_grid_)` + `salvar(nr13_med_esp_)` →
fila v2 → RPC `aplicar_mutacao_storage` → servidor. Também em `selecionarEnsaio` (troca do container no formulário).

Motivo histórico: **A** — alimentar os templates `PRONT-*.html`, que só sabem ler `localStorage`. Com a prévia
vetorial (Fase 12) o gerador passou a ler as mesmas chaves, e o workaround ficou no caminho padrão.

## Correção

- `features/prontuarios/espessuraProntuario.ts`: `espessuraDoContainer(container)` — função PURA, o mesmo
  cálculo da função antiga (grade, mínimos, campos do ensaio).
- `montarModeloProntuario(tag, fontes)` / `gerarProntuarioVetorial(tag, fontes)`: `fontes.espessura` ENTREGUE.
  O modelo não lê mais `nr13_med_*` nem `*_atual`. Sem `fontes`, usa o container do prontuário SALVO.
- A tela deriva `espessura` de `dados.containerEnsaioId` (salvo ou não) e a entrega à prévia, à impressão e à emissão.
- Rollback em iframe: as chaves vão ao PALCO (`usePalcoDocumento({ sobrepor })` → `sobreporItens`), cópia
  temporária restaurada ao fechar. `nr13_prontuario_atual` (lida só pelas folhas em iframe) idem.
- Fonte SEM container: seção de espessura vazia — o que o documento já imprimia (a função antiga gravava vazio e
  o gerador lia vazio). Não se inventou fonte nova.
- Capa: responsável = engenheiro que assina o prontuário (`nr13_assinantes_pront_<TAG>`), não mais a meta do
  último relatório montado (`nr13_relatorio_meta_atual`, P2-5 da Fase 6).

Estados globais que o gerador do prontuário ainda lê, todos legítimos: `nr13_minha_empresa`, `nr13_lista_phs`
(organização). Nenhum `*_atual`.

Escritas que CONTINUAM na abertura (documentadas, fora do dado técnico):
`nr13_prontuario_meta_<TAG>` na PRIMEIRA abertura (`obterOuCriarMeta`, §8: nº + data de emissão, reusado depois);
pré-seleção do engenheiro quando há exatamente 1 e nada escolhido (`nr13_assinantes_pront_<TAG>`).

## Provas

Unitárias: `features/prontuarios/__tests__/prontuarioSemMutacao.test.ts` (19) — sem escrita (retrato completo do
storage + upserts), 7,77 preservado, A×B, paridade com o caminho antigo, TAG A/B, responsável, cache vazio,
palco, varredura da página, PDF real lido com pdf.js. Mutante (voltar a ler a chave): 4 falhas.

E2E lab (build local contra Supabase 553xx, perfil de Chrome limpo = cache vazio, online):

| cenário | grade G (versão+md5) | esp G | diff servidor | RPC | PDF |
|---|---|---|---|---|---|
| S1 sem container, abre 2× | igual | igual | 0 | 0 | seção vazia, sem G |
| S2 container A | igual | igual | 0 | 0 | APARELHO-A / 5,11 |
| S3 container B | igual | igual | 0 | 0 | APARELHO-B / 6,11 |
| S4 sem container de novo | igual | igual | 0 | 0 | vazio |
| S5 TAG B (container C) | igual | igual | 0 (2ª abertura) | 0 | APARELHO-C |
| S6 TAG A de novo | igual | igual | 0 | 0 | APARELHO-A |
| S7 offline sem cache | igual | igual | 0 após voltar | 0 | tela "Carregando…" |

81/81 PASS. Impressão de TAG com emissão gerada serve o ARQUIVO (SHA da emissão r1 conferido). A 1ª abertura da
TAG B criou `nr13_prontuario_meta_ZZ-PRONT-02` (comportamento documentado acima).

Bundle ANTIGO (HEAD `6f5e1f6`), mesmos cenários: grade e esp regravadas (S2 v33→34, S5 v4→5, S1 v35→37),
5–11 RPCs — o P0 reproduzido. Texto dos PDFs antigo × novo: **idêntico** em S1, S2 e S5.

Calibração (`259923b`): prévia de manômetro/PSV — 0 POST em chave viva, servidor idêntico.

## Produção (somente leitura, 24/09/2026)

- `nr13_med_grid_`: 49 linhas, 41 vivas, 26 com valor, 15 vazias, **0 com `containerId`**, versão máx. 42.
- `nr13_med_esp_`: 41 vivas, 26 com mínimos, 8 com aparelho, **0 com requerida manual**, 0 com `pontos`.
- Nenhuma grade gravada depois de 10/09 tem `containerId` — o editor do relatório carimba o dono; o prontuário
  (e o `ULTRASSOM.html`) não. Compatível com o prontuário ter regravado essas chaves em contas de cliente.
- Grades VAZIAS com versão > 1 (padrão "zerada"): engacmeng `F-122030` (v7), guibsonengenharia `ALC - 0001` (v6)
  e `ALC-0002` (v3), mayorca `VP-SAO-01` (v3), osvaldocj `DEMO-CP-01` (v8; há container com medidas).
- `app_storage_mutacoes` guarda só `mutation_id`/`versão` — não há histórico de valores.
- **Evidência de perda: INCONCLUSIVA.** Fontes possíveis de recuperação (fase separada): o container
  (`nr13_docs_<TAG>`), o PDF do relatório finalizado (`pdfRef`) e o cache local de aparelhos antigos.

## Residual encontrado (não corrigido — paridade)

- **P2 · grade do prontuário com pontos/colunas fora do padrão.** O gerador do prontuário monta as linhas com os
  6 pontos e 4 ângulos padrão (`pontosUltrassom(tag, medEsp, medEsp)`: `medEsp` não tem `pontos`/`colunas`),
  enquanto a grade entregue segue os pontos e colunas do container. Container com mais pontos ou outro nº de
  colunas sai truncado/com cabeçalho de ângulo errado — igual antes da correção (paridade exigida). Corrigir =
  entregar também `pontos`/`colunas` do container ao `pontosUltrassom`; muda o PDF desses casos.

## Checagem final · `nr13_prontuario_meta_<TAG>` (24/09/2026)

**Semântica.** `{ numero: 'REL-<Date.now()>', emissao: 'dd/mm/aaaa' }`, criada por `obterOuCriarMeta` (cria se
ausente, reusa depois). Não é rascunho nem documento: o rascunho é `nr13_prontuario_<TAG>` + linha do índice.
Número por timestamp — não há sequência, nem reserva, nem buraco. Fora do índice (`IRMAS_COM_TAG`), fora do badge
do catálogo (`busca_index_rpc.sql`/`busca_manutencao.sql`), fora das listas. Lida pelo gerador vetorial (nº e data
no cabeçalho/capa), pelas folhas `PRONT-*.html` e servida ao Portal. Sincroniza pelo `salvar`.

**Classificação: C na abertura, A nas ações.** A criação na ABERTURA existia "antes de montar os iframes"
(comentário no código). Toda ação que usa o número já chamava `obterOuCriarMeta` por conta própria (Visualizar,
Salvar, Emitir). Abrir a TAG de um equipamento SEM prontuário deixava uma meta sem documento — no lab já havia
`nr13_prontuario_meta_ZZ-SEM-PRONT` sem `nr13_prontuario_ZZ-SEM-PRONT`. A data de emissão ficava sendo a da
primeira visita.

**Correção (commit separado):** a chamada saiu de `abrirEquipamento`; na emissão, `obterOuCriarMeta` passou para
ANTES de gerar o PDF (antes era depois do upload — sem meta prévia, o papel saía "—" e o registro com número).

**Lab (build local, perfil limpo):**

| cenário | antigo (`aa25d2c`) | novo |
|---|---|---|
| M1 abrir TAG sem prontuário | cria `meta_ZZ-SEM-PRONT` (1 RPC) | servidor inalterado, 0 RPC |
| M2 abrir + prévia + "Abrir em outra aba" + imprimir (prontuário sem meta) | cria `meta_ZZ-PRONT-02`; prévia `REL-…` | inalterado, 0 RPC; prévia "—" |
| M3 trocar container (3×) no formulário | inalterado | inalterado |
| M4 EMITIR sem meta | — | cria a meta + emissão + índice; nº do PDF emitido = nº registrado (`REL-1790293011708`) |
| M5 abrir TAG sem assinante, 1 engenheiro | — | grava `nr13_assinantes_pront_<TAG>` (pré-seleção, METADATA) |

Zero mutação técnica em M1–M3/M5 (grade, esp, `*_atual`, containers, ficha, outras TAGs): diff do servidor inteiro.
Não há contador de uso no prontuário.
