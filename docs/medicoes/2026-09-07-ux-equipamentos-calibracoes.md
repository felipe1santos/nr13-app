# /equipamentos e /calibracoes — rodada de UX (07/09/2026)

## 1 · O que estava ruim

**Equipamentos.** Duas faixas no topo: um cabeçalho com o título "Equipamentos",
a alternância grade/lista, "Importar planilha" e "Criar equipamento"; e, abaixo,
a busca com dois `<select>` sempre abertos (tipo, categoria) e um "Limpar
filtros". Sete controles em duas linhas para uma tela cuja ação é procurar um
equipamento.

**Calibrações.** A lista não dizia o que fazer com ela (escolher o equipamento é
o que abre lotes e componentes), e o card horizontal — que ocupa a largura da
tela — mostrava três blocos: TAG/tipo, proprietário e categoria.

## 2 · Equipamentos

| antes | agora |
|---|---|
| cabeçalho + barra de busca (2 faixas) | **uma linha**: contexto e visualização à esquerda, busca no meio, funil e criar à direita |
| "Importar planilha" na barra | removido (o arrastar-e-soltar continua) |
| `<select>` de tipo e categoria abertos | **funil** → modal central |
| "Limpar filtros" solto na barra | dentro do modal |

O modal (`ModalFiltrosEquipamentos`) filtra por **tipo, categoria, cliente e
fabricante**, com aplicar/limpar/cancelar, ESC, armadilha de foco e rascunho até
o "Aplicar". É componente próprio, e não o de prontuários: a moldura é a mesma
(`mfp-*`), mas lá a primeira pergunta é "com/sem prontuário", que nesta tela não
quer dizer nada.

**Onde cada filtro roda:** `tipo` e `categoria` são parâmetros de
`buscar_equipamentos` — vão na URL e filtram na origem. `cliente` e `fabricante`
não têm parâmetro na RPC: são recorte do CLIENTE sobre as páginas já trazidas,
com o mesmo teto (20 páginas) e o mesmo aviso das outras telas, escrito no
próprio modal. Filtro que esconde linha calado é relato de dado sumido com outro
nome.

`recorteCatalogo` ganhou `fabricante` e `fabricantesDoCatalogo`, na mesma
família de `empresa` e `categoria` — mudança aditiva, sem tocar em prontuários
nem calibrações.

**O funil** acende em roxo quando há filtro (com bolinha no canto, para o celular
onde o rótulo some) e dá um pulso curto de 260ms no clique, desligado sob
`prefers-reduced-motion`.

## 3 · Calibrações

- a linha `[ selecione o equipamento para iniciar ]` entra em **roxo discreto**
  acima da lista;
- o card passou de três para **cinco** blocos: TAG/tipo, proprietário,
  fabricante, categoria e PMTA, além da contagem de calibrações. **Nenhuma
  consulta nova**: os três campos já vinham na mesma linha da projeção que a
  lista busca. O que falta sai como travessão — nada é inventado;
- as colunas somem por largura na ordem certa: **fabricante primeiro** (é o
  campo mais longo e o menos usado para escolher o que vai calibrar), depois
  proprietário.

## 4 · Medições

`node scripts/ux-equip-calibracoes.mjs` sobre o CSS compilado:

| largura | barra de /equipamentos | modal de filtro | card de calibração | colunas |
|---|---|---|---|---|
| 1400 | 107px | 545px | 74px | 5 |
| 768 | 107px | 545px | 74px | 3 |
| 386 | 194px (quebra) | 613px | 220px (empilhado) | 5 |

Sem transbordo em nenhuma largura; funil e "Criar equipamento" com **44px** de
alvo no celular; o funil e o criar ficam depois da busca acima de 640px (abaixo
disso a barra quebra de propósito).

## 5 · Validação em produção

Bundle `assets/index-DHprCbXa.js`.

**/equipamentos**: barra única de 36px de altura com "Equipamentos", as duas
visualizações, a busca, o funil e o criar; nenhum `fj-fselect`, nenhum
"Importar planilha", nenhuma faixa `fj-page-head.equip-head`; `scrollWidth ===
innerWidth`. Modal aberto com as quatro seções e as três ações. Filtrando por
cliente "Posto Ipiranga": **1 resultado e 1 card na grade**, com o funil aceso.

**/calibracoes**: a instrução em `rgb(124, 92, 252)` acima da lista, e o card
com Proprietário · Fabricante · Categoria · PMTA + a contagem, 74px de altura.

**Defeito achado na validação e corrigido:** o recorte por cliente/fabricante
chegava ao CONTADOR mas não à grade — a `ListaVirtualizada` ainda recebia
`itens`. Dizia "1 resultado" com cinco cards na tela. Junto veio o
`chaveDoConjunto`, para a rolagem voltar ao topo quando o filtro muda.

## 6 · Testes

`src/features/equipamento/uxEquipCalibracoes.test.ts` — 19 casos. Suíte
completa: **2454 testes, 177 arquivos**; `tsc -b` e `npm run build` limpos.
