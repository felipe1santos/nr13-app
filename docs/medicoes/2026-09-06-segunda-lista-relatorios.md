# A segunda lista de relatórios — causa e correção

**06/09/2026.** `/relatorios?editor=1&tag=…&rel=…` mostrava o "Histórico de
Relatórios" daquele equipamento: outra tabela, outro Filtrar, outro
"+ Criar Relatório". Este documento registra a causa real, o mapa dos estados da
rota e o que ficou.

---

## 1 · A causa

`pages/Relatorios.tsx` é **duas telas num componente só**:

- o **EDITOR** — o único lugar do sistema que monta um relatório a partir dos
  dados;
- o **HISTÓRICO POR TAG** — a lista antiga, anterior à busca global.

Ele decidia qual das duas ser perguntando `alvoLegadoDaUrl(search) === null`,
isto é: **"tem `tag` na URL?"**. As duas rotas têm `tag`.

| tentativa | condição | o que cobria | o que deixava passar |
|---|---|---|---|
| original | `tag` na URL ⇒ legado | — | tudo que passasse TAG |
| 06/09, manhã | idem | — | o modal de criar passou a mandar TAG |
| 06/09, tarde | `escolhaPronta ‖ sem tag` | CRIAR (navega com `state`) | **CONTINUAR RASCUNHO**, que navega sem `state` — a URL do bug |
| definitiva | `papelDaTelaLegada(search)` | a rota DIZ o papel | — |

**Por que passou despercebido duas vezes.** No caminho feliz o histórico era um
piscar: `abrirEquipamento` fazia `setTela('historico')` e, milissegundos depois,
`visualizar` trocava para o documento. O defeito só fica visível quando
`visualizar` **falha** — registro ainda não hidratado, id de outra organização,
link antigo. Ela retornava cedo, em silêncio, e a tela **ficava** no histórico.

> Uma lista que aparece quando algo falha é pior do que um erro: ela parece um
> destino.

### Quem levava até lá

Quatro produtores de URL, todos no dispatcher:

| ação | URL | levava ao histórico? |
|---|---|---|
| `aoAbrir` (legado sem PDF) | `?legado=1&tag&rel` | sim — e é o correto |
| **`aoContinuarRascunho`** | `?editor=1&tag&rel` | **sim — era o bug** |
| criar (com escolha) | `?editor=1&tag` + `state` | não |
| criar (sem escolha) | `?editor=1` | não |

`Visualizar` de um finalizado **não** navega: a lista canônica resolve o `pdfRef`
nela mesma. `Editar nome` e `Arquivar` são modais. Nenhum outro controle
alcançava a tela duplicada.

## 2 · Mapa dos estados da rota

| estado | finalidade | componente | necessário? | destino agora |
|---|---|---|---|---|
| `/relatorios` | **lista canônica única** | `RelatoriosV9` | sim | — |
| `?editor=1` | criar: escolher equipamento | `Relatorios` (papel editor) | sim | tela "Para qual equipamento?" |
| `?editor=1&tag` + `state` | criar: montar | idem | sim | modal do container → documento |
| `?editor=1&tag` sem `state` | recarregou/colou | idem | não é destino | **redireciona** para `/relatorios` |
| `?editor=1&tag&rel` | continuar rascunho | idem | sim | **o editor daquele rascunho** |
| `?editor=1&tag&rel` que não resolve | link velho, cache frio | idem | não é destino | **redireciona** para `/relatorios` |
| `?legado=1&tag` | achar documento pré-§7-quater | `Relatorios` (papel legado) | **sim** | histórico por TAG |
| `?legado=1&tag&rel` | abrir documento pré-§7-quater | idem | **sim** | o documento; falhando, o histórico |

## 3 · A correção, em quatro partes

1. **o papel vem da ROTA.** `papelDaTelaLegada(search)`: `?editor=1` é editor,
   `?legado=1` é legado, e nenhum se deduz do resto da query;
2. **`abrirEquipamento` parou de decidir a tela.** Era ele que fazia
   `setTela('historico')` no fim — então *todo* caminho que carregasse um
   equipamento passava pela segunda lista. Quem chama agora diz por quê
   (`escolherEquipamento` para a lista, `abrirDocumentoDaUrl` para o `rel=`);
3. **`visualizar` devolve `false`** quando o registro não existe, e o editor
   redireciona para `/relatorios`;
4. **guarda estrutural** no bloco do histórico:
   `tela === 'historico' && papel.current === 'legado'`. Mesmo que o estado
   chegue lá por um caminho futuro, no editor ele não renderiza.

O **"+ Criar Relatório" de dentro do histórico legado saiu**: criar é ação da
lista canônica, e um segundo botão com o mesmo verbo em outra tela é a
duplicidade que esta rodada elimina. No lugar, "Ir para Relatórios".

O subtítulo do menu dizia **"Histórico de inspeções por equipamento"** logo acima
da lista da organização inteira — descrevia a tela antiga. Virou "Todos os
relatórios da organização".

## 4 · O legado, e por que ele fica

`?legado=1&tag=` continua abrindo o histórico por TAG. É a **única** forma de
alcançar documento anterior ao §7-quater: ele não está na projeção de relatórios
e não tem PDF arquivado, então nem a busca global o encontra nem o visualizador
o serve. Enquanto existir um desses documentos, existe esse caminho.

## 5 · Auditoria: quem lista relatórios

| # | onde | classificação | fica? |
|---|---|---|---|
| 1 | `RelatoriosV9` (`.rel-tabela-v9`) | **canônico** | sim |
| 2 | `Relatorios.tsx`, `tela === 'historico'` (`.meta-table`) | **legado necessário**, agora só sob `?legado=1` | sim, isolado |
| 3 | `portal/PortalAtivo` | outra aplicação (Portal do Cliente, somente leitura, por ativo) | sim |
| 4 | `ModalDetalheEquipamento` | helper — lê só o ÚLTIMO relatório, não lista | sim |
| 5 | `LivroRegistro` | helper — lê o histórico para montar o Livro | sim |
| 6 | `CatalogoRelatoriosV9` | lista EQUIPAMENTOS, não relatórios | sim |

**Nenhuma implementação obsoleta sobrou.** Uma lista visual moderna (1), o legado
isolado atrás de um parâmetro explícito (2), e o Portal, que atende outro
público.

## 6 · Verificação em produção

Bundle `assets/index-D15gVK-G.js`.

| URL / ação | histórico? | 2ª tabela? | 2º criar? | destino |
|---|---|---|---|---|
| `?editor=1&tag=ZZ-TESTE-P2&rel=REL-1788571268261` (a do bug) | **não** | não | não | editor do rascunho |
| `?editor=1&tag=…&rel=REL-000000000000` | não | não | não | redirect → `/relatorios` |
| `?editor=1` | não | não | não | "Para qual equipamento?" |
| `?editor=1&tag=…` | não | não | não | redirect → `/relatorios` |
| `?legado=1&tag=…` | **sim** (correto) | sim | **não** | histórico por TAG, 11 linhas |
| lista → Visualizar (finalizado) | não | não | não | visualizador, 29 páginas, sem navegar |
| lista → Continuar editando | não | não | não | editor, selo "Rascunho" |
| editor → ← Voltar | não | não | não | `/relatorios` |
| lista → Criar → passo 1 → passo 2 | não | não | não | modais sobre a lista |

## 7 · Gates

`refinoRelatorios.test.ts`, **51 asserções**. As do bug trazem o histórico das
**duas** tentativas anteriores escrito na própria descrição — para a terceira não
repetir a segunda. Travam:

- o papel vindo da rota, e a pergunta antiga (`alvoLegadoDaUrl(...) === null`)
  não aparecendo mais no arquivo;
- `?editor=1` sendo editor com ou sem `tag` e `rel` (inclusive a URL exata do bug);
- `?legado=1` continuando legado;
- o bloco do histórico com a guarda de papel;
- `+ Criar Relatório` fora do JSX;
- `abrirEquipamento` sem `setTela` nenhum;
- `visualizar` com `Promise<boolean>` e `if (!r) return false`;
- o redirect para `/relatorios` nos dois pontos de falha;
- os quatro produtores de URL, um por verbo.

Suíte: **2.189 testes, 170 arquivos, 0 falhas.**
