# Auditoria e reforma de UX

**06/09/2026.** Só navegação, hierarquia e padrão visual. Nenhuma regra de
negócio, cálculo, SHA/`pdfRef`, imutabilidade de documento, sync/offline, Livro
ou histórico arquivado foi tocado, e nenhuma migração de banco foi feita.

---

## 1 · O defeito principal: duas listas para o mesmo documento

O menu **Relatórios** abria a lista de relatórios. Criar um relatório levava a
escolher o equipamento e, daí, a um **"Histórico de Relatórios" daquele
equipamento** — uma segunda lista, com um segundo `+ Criar Relatório` dentro.
O usuário via duas listas de relatórios que não eram a mesma coisa e não sabia
qual era a de verdade. **Prontuários** tinha o espelho do problema: o menu abria
a lista de EQUIPAMENTOS, e a lista de prontuários salvos não existia como
destino.

A separação passou a ser explícita:

| | lista canônica (o menu) | criação |
|---|---|---|
| Relatórios | `/relatorios` — todos os relatórios da organização | `?editor=1` → "Para qual equipamento?" → montagem |
| Prontuários | `/prontuarios` — os equipamentos que TÊM prontuário, em linha compacta | `+ Criar prontuário` → "Para qual equipamento?" |

Duas decisões que sustentam isso:

- na criação, escolher o equipamento vai **direto** para a montagem. O histórico
  daquele equipamento não é etapa do caminho de criar;
- o "Voltar" da criação devolve à lista canônica, não a um histórico paralelo
  que ninguém pediu para ver.

O `?legado=1&tag=…` continua caindo no histórico por TAG — é o único caminho que
remonta relatório anterior ao §7-quater, e ali o histórico daquela TAG é
justamente o destino útil. A distinção mora em `criando` (`Relatorios.tsx`), lida
uma vez da URL.

Na tela de seleção do prontuário o recorte "só com documento" nasce **desligado**:
quem vai criar o PRIMEIRO prontuário de um equipamento não pode ser filtrado
para fora da própria lista.

## 2 · Um só botão no sistema

Havia duas famílias de botão com a mesma cor e medidas diferentes:

| | arquivos | raio | fonte | padding | borda |
|---|---|---|---|---|---|
| `.btn-primario` / `.btn-secundario` | 37 | 10px | 13px | 10/18 | 1px transparente |
| `.fj-btn` | 15 | 8px | 12,5px | 9/15 | nenhuma |

As **cores já eram idênticas** (`--bg-card` == `--panel`, `--border-solid` ==
`--line`, `--text-main` == `--text`); só as medidas divergiam. E elas aparecem
lado a lado: Prontuários usa as duas. A diferença lia como descuido, não como
hierarquia.

A métrica vencedora é a do `design/`, fonte da verdade visual (CLAUDE.md §9) —
`border-radius:8px; font-size:12.5px; padding:9px 15px; gap:6px`. O legado foi
alinhado ao Forja, não o contrário.

Depois de igualar padding, fonte e raio, sobravam **2px**: `border:none` contra
`1px solid transparent`. Só a medição pegou isso. `.fj-btn` passou a declarar a
borda transparente.

O `disabled` do primário era `opacity: .55`, que sobre âmbar deixa o texto
ilegível; virou cor sólida, como no Forja.

## 3 · Alvo de toque no celular

34px é bom no mouse e curto no dedo. O mínimo recomendado é 44px, e este sistema
é preenchido **em campo, no celular** — é o §1 do CLAUDE.md. Em ≤640px todo botão
de ação passa a ter `min-height: 44px`. Exceção declarada: o botão só-de-ícone
dentro de linha de lista fica em 38 quadrado, porque esticá-lo desalinharia a
linha inteira. Acima de 640px nada muda.

## 4 · Calibrações

| defeito | correção |
|---|---|
| criar e renomear lote passavam por `window.prompt` — fora do design, sem foco controlado, e no celular uma folha do sistema operacional que cobre a tela e esconde o que está sendo nomeado | campo na própria lista, já preenchido com a sugestão e com o texto selecionado; Enter confirma, Esc cancela; ocupa a faixa da linha do lote, então a troca não empurra a lista |
| "Excluir lote" era cinza como um "Cancelar" e, com certificado emitido, respondia com um `alert` de reprovação | só aparece quando o lote está vazio, e aparece como ação destrutiva. A regra é a MESMA; deixou de ser ensinada por recusa |

A hierarquia componente × lote foi auditada e mantida: componentes num painel
compacto no topo (cadastro único, `+ Adicionar` secundário), lotes abaixo
(recorrentes a cada inspeção, `+ Novo lote` primário). "Calibrar" continua
primário dentro do corpo do lote — é a ação daquela região, e só um lote abre
por vez.

## 5 · Auditadas sem defeito de hierarquia

| tela | o que foi conferido |
|---|---|
| **Inspeções** | um primário por região (`+ Nova Inspeção`), busca visível, trilha. Único ajuste: a trilha usava um `<strong>` solto onde os outros módulos usam chevron + chip da TAG — padronizada |
| **Equipamentos** | um primário (`+ Criar equipamento`), "Importar planilha" como fantasma, busca visível com os campos certos |
| **Certificados** | três cartões, um por padrão, com status próprio (Pendente / Cadastrado / Fora do relatório), ações agrupadas no rodapé do cartão e o formulário abrindo abaixo. Nada alterado |

## 6 · Mapa de rotas

| módulo | rota | tela | função | duplicada? | ação |
|---|---|---|---|---|---|
| Painel | `/dashboard` | painel | vencimentos, notificações | não | — |
| Equipamentos | `/equipamentos` | lista | catálogo | não | — |
| | `/equipamento/:tag` | ficha | dados, memorial, vida | não | — |
| | `/equipamento/:tag/memorial` | memorial | cálculo | não | — |
| Inspeções | `/inspecoes` | lista | escolher equipamento | não | — |
| | `/inspecoes/:tag/:containerId` | container | ensaios do container | não | — |
| | `/inspecoes/:tag/:containerId/:formulario` | formulário | preenchimento em campo | não | — |
| Relatórios | `/relatorios` | **lista canônica** | todos os relatórios | **era** | virou destino único |
| | `/relatorios?editor=1` | criação | equipamento → montagem | **era** | perdeu a 2ª lista |
| | `/relatorios?legado=1&tag=` | histórico por TAG | remontar relatório pré-§7-quater | não | mantida de propósito |
| Prontuários | `/prontuarios` | **lista canônica** | prontuários salvos | **faltava** | criada |
| | `/prontuarios` (seleção) | criação | escolher equipamento | **era** | virou etapa, não destino |
| Calibrações | `/calibracoes` | seleção → componentes + lotes | cadastro e lotes | não | prompt removido |
| Certificados | `/certificados` | cartões dos padrões | certificado por padrão | não | — |
| Vencimentos | `/vencimentos` | lista | o que vence | não | — |
| Agenda | `/agenda` | calendário | notas e faturamento | não | — |
| Pendências | `/pendencias` | lista | fila de sync | não | — |
| Livro | `/livro-registro` | livro | registro de segurança | não | **não tocado** |
| Cadastros | `/minha-empresa`, `/empresas`, `/funcionarios`, `/acesso` | formulários | cadastro | não | — |
| Fora do Layout | `/admin`, `/portal`, `/portal/ativo/:tag` | próprias | admin e portal do cliente | não | — |

## 7 · Responsividade — medida, não olhada

`scripts/ux-responsividade.mjs` sobe um Chrome headless com perfil descartável,
renderiza a marcação das peças tocadas com o CSS do build e mede transbordo em
**1400 / 768 / 386 px**.

Duas armadilhas obrigaram o formato do script, e é por isso que ele ficou no
repositório em vez de virar um comando de uma vez:

1. **`--window-size=386` mede 504.** O Chrome do Windows tem piso de largura de
   janela, e as media queries de celular nem chegavam a valer — a primeira
   rodada passou "em 386px" sem nunca ter estado em 386px. A largura real vem de
   um `<iframe>`, onde as media queries avaliam o viewport dele;
2. **iframe `file://` é origem opaca**: `contentDocument` volta nulo, sem erro
   visível. Usa `srcdoc`.

| largura | rolagem horizontal | peças transbordando | botão de ação |
|---|---|---|---|
| 1400px | não | nenhuma | 34px |
| 768px | não | nenhuma | 34px |
| 386px | não | nenhuma | **44px** |

A linha de lista (`.pront-linha`) é um `<button>` e mede 44/56px — é linha, não
botão de ação, e a verificação a exclui da comparação de altura de propósito.

**Limite declarado:** a medição é das PEÇAS com o CSS de produção, não da tela
logada. A aba do MCP vive na janela que o dono está usando, e medir lá exigiria
trazê-la para a frente no meio do uso dele. O que esta reforma mudou é CSS.

## 8 · Verificação

| | |
|---|---|
| suíte | **2.129 testes, 168 arquivos, 0 falhas** |
| `tsc -b` · `vite build` | limpos |
| produção | conferida pelo CONTEÚDO do bundle servido (`cal-lote-nome`, `crumb-tag-chip`, `Para qual equipamento`), não pelo hash — as variáveis de ambiente de produção entram no bundle e o hash local nunca bate |
| CSS no ar | `.btn-primario,.btn-secundario` e `.fj-btn` com padding, fonte, raio e gap idênticos |

## 9 · Resposta

**A navegação tem uma lista canônica por tipo de documento, criação separada de
histórico, e um padrão visual único de botão? SIM.**

Com estes limites registrados:

- o histórico por TAG **continua existindo** em `/relatorios?legado=1&tag=` —
  é o único caminho que remonta relatório anterior ao §7-quater, e apagá-lo
  tiraria do ar a leitura desses documentos;
- `nr13_historico_relatorios` (legado) segue como fallback de leitura, conforme
  §7-sexies. Não é tela, é dado;
- a responsividade foi medida nas peças alteradas, não em varredura de todas as
  telas do sistema;
- as duas famílias de classe de botão continuam existindo no código-fonte (37 e
  15 arquivos). O que foi unificado é o RESULTADO VISUAL. Renomear 52 arquivos
  seria churn sem ganho para o usuário, e cada arquivo tocado é uma chance de
  quebrar tela que hoje funciona.
