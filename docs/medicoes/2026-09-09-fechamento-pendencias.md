# Fechamento da rodada de pendências — 09/09/2026

Commits `08225e2`, `781bd40`, `18e0bdb`. Bundle em produção:
`assets/index-BG1gpWCo.js`. Conta `teste@gmail.com`, org `…d234ad8d211c`,
somente equipamentos `ZZ-*`.

---

## 1. A allowlist volta a ser a autorizada

A observação por item do **exame visual externo/interno** tinha sido marcada
`opcional` por analogia com a documentação e os checklists — mesma forma
(resposta na coluna ao lado, comentário livre). Não estava autorizada.
Revertida.

No sentido contrário, as 4 linhas em branco da tabela de **recomendações**
geravam 8 pendências: o engenheiro era obrigado a inventar recomendação num
equipamento que não tem nenhuma. Linha inteiramente em branco não é campo
facultativo — é linha que ainda não existe.

`CelulaDoc.linhaOpcional` marca as células da mesma linha, e a conta é feita
sobre a linha **já resolvida** (com os overrides aplicados). Assim que o
usuário escreve o texto da recomendação, a linha passa a existir e o prazo
dela vira pendência — provado por teste com override em
`recomendacoes.2.texto`.

### Contagem, no mesmo documento ZZ da rodada anterior

| | antes | agora |
|---|---|---|
| campos distintos desenhados | 509 | 509 |
| **críticos (= itens da barra)** | **40** | **60** |
| opcionais (amarelos sem alerta) | 64 | 44 |
| críticos sem alerta | 0 | 0 |
| pendências sem campo | 0 | 0 |

`+28` observações de exame (externo 2–15, interno 2–15) e `−8` recomendações.

Os 60, por seção: Cabeçalho 1 · Capa 1 · Documentos de referência 2 · Escopo 1 ·
Pressões 4 · Categorização 1 · Dados operacionais 3 · Prontuário 1 · Memorial 3 ·
Exames realizados 2 · Instrumentos 6 · Checklist 2 · **Exame visual externo 14** ·
**Exame visual interno 14** · Parecer 2 · Próximas inspeções 3.

Com as 28 observações chegando à barra apareceu um defeito escondido: o mapa de
seções tinha `externo`/`interno`, e os ids reais são `exameExterno.item-3.obs`.
Enquanto elas não alertavam, ninguém viu que aquelas duas linhas nunca casavam
com nada — as 28 caíam todas no título genérico "Documento". Corrigido.

---

## 2. E2E dentro do app (o que faltava na rodada anterior)

Rascunho `REL-1788571268261`, TAG `ZZ-TESTE-P2`, 12 páginas, 105 pendências.

### Navegação até o campo

| pendência | página | scrollTop antes → depois | página no topo | destaque |
|---|---|---|---|---|
| Classe do fluido | 1 | 0 → 0 (campo já visível) | 1 | aceso |
| PMO — Pressão Máxima de Operação (MPa) | 3 | 180 → **1605,6** | **3** | aceso, e apagado sozinho em ~1,5 s |

### Campo em Configurações — e um defeito real

Clicar numa pendência de data ou de A.R.T. abria o modal e deixava o input
**sem foco e sem destaque**.

Causa: o efeito agendava o `requestAnimationFrame` que aplica o foco e, na
MESMA passagem, chamava `setFocoConfig(null)`. Isso dispara um render, o render
roda a limpeza do efeito, e a limpeza era `cancelAnimationFrame` — o quadro
morria antes de focar. O primeiro clique da sessão às vezes passava; do segundo
em diante, nunca.

Corrigido em `781bd40`: o estado só é limpo DEPOIS de aplicar, dentro do próprio
callback, e um `setTimeout` de 120 ms acompanha o quadro (o
`requestAnimationFrame` não roda em aba oculta).

Medido de novo, no bundle já corrigido:

| pendência | modal | foco | destaque |
|---|---|---|---|
| Nº da A.R.T. (CREA) | abriu | `art` | `art` |
| Validade da inspeção | abriu | `validade` | `validade` |
| Próxima — exame visual interno | abriu | `proximaInterna` | `proximaInterna` |
| Próxima — exame visual externo | abriu | `proximaExterna` | `proximaExterna` |

E o destaque some sozinho: `.rel-modal .campo-destacado` = 0 depois de 1,8 s.

O terceiro destino também foi exercido: **Parecer (APTO / INAPTO)** abre o modal
do Laudo (`.modal-content`, "Laudo da conclusão — ZZ-CALDEIRA-TESTE"), não a
folha.

### Um segundo defeito, achado na auditoria de campo (item 7)

A linha **RESPONSÁVEL TÉCNICO** da capa é montada de
`meta.assinantes.engenheiro` (nome + CREA). O destino da pendência mandava o
revisor para o campo de texto **"Técnico"**: ele digitava ali, voltava, e a capa
continuava vazia. Agora aponta para o select do engenheiro, que ganhou
`name="engenheiroId"` (`18e0bdb`).

---

## 3. Persistência

`ART-E2E-987654`, validade `09/10/2026` (+30 d), próxima interna `08/11/2026`
(+60 d), próxima externa `08/12/2026` (+90 d).

| passo | art | validade | interna | externa |
|---|---|---|---|---|
| digitado no modal | ✅ | ✅ | ✅ | ✅ |
| **depois do F5** | `ART-E2E-987654` | `09/10/2026` | `08/11/2026` | `08/12/2026` |
| depois de sair para `/relatorios` e reabrir | ✅ | ✅ | ✅ | ✅ |

> **A persistência é do "Salvar rascunho", não do "Atualizar".** Medido: num
> rascunho NUNCA salvo, preencher e clicar em Atualizar e dar F5 devolve o
> editor à escolha do equipamento — nada é recuperado. `atualizarMetadados`
> grava `nr13_relatorio_meta_atual`, que é a chave que os TEMPLATES leem; o app
> nunca a lê de volta para o estado React. Quem restaura a meta na reabertura é
> o registro do rascunho.

Logout/login não foi exercido: eu não insiro credenciais, e derrubar a sessão
custaria o resto da medição. O caminho é o mesmo do F5 — o registro no
storage — mas isso é dedução, não medição.

---

## 4. `/relatorios`: o rascunho mostra data, e não vira prazo

Linha do rascunho, lida da tela:

```
Relatorio_Inspeção_Periódica_ZZ-TESTE-P2.pdf | REL-1788571268261 | ZZ-TESTE-P2
| Inspeção Periódica | 05/09/2026 | 09/10/2026 | 08/11/2026 | RASCUNHO
```

VALIDADE `09/10/2026` e PRÓXIMA `08/11/2026` (a menor entre interna e externa).

No MESMO instante, o Dashboard mostrava para `ZZ-TESTE-P2` o vencimento
**07/10/2026** — o do relatório finalizado anterior, e não o `08/11/2026` do
rascunho. É a prova da fronteira: o rascunho aparece na lista e **não** entra em
`nr13_historico_indice_<TAG>`, de onde sai o vencimento.

---

## 5. Finalizado → Dashboard, com os três horizontes

Duas emissões novas, pelo fluxo normal:

| relatório | TAG | próxima interna | SHA-256 |
|---|---|---|---|
| REL-1788966582291 | ZZ-TESTE-P2 | 08/11/2026 (60 d) | `a74dcb14…c6e37` |
| — | ZZ-CALDEIRA-TESTE | 07/12/2026 (89 d) | `f06fc456…97414f` |

Contagem dos chips, medida antes e depois:

| chip | antes das emissões | depois |
|---|---|---|
| 15 dias | 0 | 0 |
| 30 dias | 2 · certificado 20 d + ZZ-TESTE-P2 **28 d** | **1** · só o certificado 20 d |
| 60 dias | 2 | **2** · +ZZ-TESTE-P2 **08/11/2026, 60 d** |
| 90 dias | 2 | **3** · +ZZ-CALDEIRA-TESTE **07/12/2026, 89 d** |
| Vencidos | 0 | 0 |

A régua é cumulativa e os contadores fecham. E a regra `min(interna, externa)`
está exercida: com interna `08/11` e externa `08/12`, o painel usou `08/11`.

---

## 6. Inventário do modal de Configurações (item 7)

FONTE INICIAL de um relatório novo é `metaPadrao` (`Relatorios.tsx`).
"Sobrevive F5" pressupõe **rascunho salvo** — ver §3.

| campo | fonte inicial | editável | chave persistida | sobrevive F5 | onde aparece no PDF | na lista | no Dashboard |
|---|---|---|---|---|---|---|---|
| **Código** | `REL-${Date.now()}` | não (`disabled`) | `meta.codigo` no registro | sim | `capa.n-do-relatorio`, `inspecao.numero-relatorio` | coluna Nº RELATÓRIO | não |
| **Emissão** | `hoje()` | sim | `meta.emissao` | sim | só como reserva de `capa.data-da-inspecao` (`execucao ?? emissao`) | não (a coluna CRIAÇÃO é `criadoEm`) | **sim, indireto**: ordena `listarIndice` (define QUAL relatório manda) e vira "ÚLTIMA" quando não há execução |
| **Validade** | vazio | sim | `meta.validade` | sim | `capa.validade`, `datas.validade` | coluna VALIDADE | **não** |
| **Execução da inspeção** | `hoje()` | sim | `meta.execucaoInspecao` | sim | `capa.data-da-inspecao`, `datas.execucao`, `inspecao.data-inicio`, `inspecao.data-termino` | não | sim, como coluna ÚLTIMA |
| **Próxima interna** | vazio | sim | `meta.proximaInspecaoInterna` | sim | `proximas.interna` | coluna PRÓXIMA (a menor das duas) | **sim** — entra no `min()` do vencimento |
| **Próxima externa** | vazio | sim | `meta.proximaInspecaoExterna` | sim | `proximas.externa` | coluna PRÓXIMA (a menor das duas) | **sim** — entra no `min()` |
| **Nº da A.R.T.** | vazio | sim | `meta.art` | sim | `capa.art` e `inspecao.art` (um dado, duas linhas) | não | não |
| **Técnico** (texto) | vazio | sim | `meta.tecnicoNome` | sim | reserva do nome do técnico no bloco de assinatura | não | não |
| **Engenheiro que assina** | `nr13_assinantes_rel_<TAG>`; único engenheiro é pré-selecionado | sim (trancado em documento emitido) | `nr13_assinantes_rel_<TAG>` **+** snapshot `meta.assinantes` | sim | `capa.responsavel` (nome + CREA) e o carimbo nas folhas que ele assina | não | não |
| **Técnico que assina** | `nr13_assinantes_rel_<TAG>` | sim (trancado em documento emitido) | idem | sim | carimbo nas folhas que ele assina | não | não |
| **Quem assina o Termo do Livro** | `engenheiro` | sim (trancado em documento emitido) | `nr13_assinantes_rel_<TAG>.assinanteTermoLivro` + snapshot | sim | folha TERMO-ABERTURA | não | não |

Duas coisas que este inventário produziu, e já estão corrigidas:
`capa.responsavel` apontava para o campo errado (§2), e os dois selects não
tinham `name` — sem ele o foco não teria onde pousar.

**Emissão não é editada com segurança depois do fato.** Ela ordena o índice: um
relatório com emissão anterior à de outro NÃO passa a mandar no prazo, por mais
recente que seja a emissão real. Foi o que aconteceu na primeira tentativa desta
medição — finalizar um rascunho de 04/09 não mudou o Dashboard, porque já havia
relatório de 07/09. Não é defeito; é a regra "vale o último relatório", e ela
usa a data do documento, não a hora do clique.

---

## O que NÃO foi validado

1. **Logout / login** — ver §3.
2. **Um item entre 1 e 15 dias** e **um vencido**: os chips foram exercidos com
   20 d, 60 d e 89 d. `15 dias` e `Vencidos` foram medidos vazios, coerentes com
   a massa, mas nenhum item foi produzido nessas faixas.
3. **Um defeito observado e NÃO corrigido** (fora do que a rodada autorizou): ao
   confirmar o modal "Configurar Novo Relatório" a partir da lista, o editor
   reabre perguntando "Para qual equipamento?" e é preciso escolher o
   equipamento de novo. Reproduzido nas três criações desta sessão. A escolha
   viaja no `state` da navegação e é lida uma única vez, num `useRef`, na
   montagem — e a rota não remonta, porque é a mesma. Custa um clique; não perde
   dado.
