# Redesign Forja Compacto — telas piloto (25/10/2026)

Direção aprovada: Opção A (`docs/design/direcao.md`). Branch `redesign-ui`, sem push.
Capturas em `2026-10-25-redesign-piloto/antes/` e `.../depois/`.

## Ambiente de medição

- **Laboratório local**, nunca produção (CLAUDE.md §12): Supabase em `127.0.0.1:55321`
  (cópia de trabalho com portas 553xx, mesmo `project_id`, volume `supabase_db_nr13-app`),
  app em `localhost:5174`. Conta `lab-b@local.test` (gerente; a `lab@local.test` é admin e
  `RotaUsuario` a manda para `/admin`).
- **Antes** = código da `main` (`23d51ca`); **depois** = esta branch.
- Larguras reais de **1440×900** e **375×812**: cada tela foi carregada num `<iframe>` do
  mesmo domínio com essas dimensões (o iframe avalia as media queries pela própria largura).
  A janela do Chrome não chegava a 1440 px úteis. As imagens de 1440 estão reduzidas na
  exibição; o layout é o de 1440.

## Números

| Medida | Antes | Depois |
|---|---|---|
| Cabeçalho global (1440) | 62 px mín. + subtítulo; 74 px medidos | **48 px** |
| Cabeçalho global (375) | 62 px | 52 px |
| PDF — relatório **finalizado**, 1440 | começa a **189 px** | **92 px** |
| PDF — relatório finalizado, 375 | 271 px | **104 px** |
| PDF — **rascunho** em edição, 1440 | 193 px (duas barras) | **92 px** |
| PDF — rascunho, 375 | 327 px (ações em grade de cartões) | **104 px** |
| Altura do PDF no rascunho, 1440×900 | `calc(100dvh − 178px)` fixo | 808 px (todo o resto) |
| Barra do documento | 2–3 faixas empilhadas | **1 linha de 44 px** (52 no toque) |
| Alvos de toque na barra (375) | — | todos **44×44** (Finalizar 78×44) |
| Primárias na barra do rascunho | 1, **azul** | 1, **âmbar** (Finalizar) |
| Dashboard: blocos de cor | banner vermelho de largura total + 4 KPIs com filete/ícone de 4 cores | **nenhum**: 1 KPI dominante (cor só de status) + 4 neutros |
| Dashboard (375): alerta | texto em coluna, uma palavra por linha | KPI legível |
| Sidebar | 12 itens soltos, 246 px | 4 grupos, 232 px; recolhida **56 px** |

Na barra do rascunho a 1440 px nada fica escondido na rolagem do meio (`scrollWidth −
clientWidth = 0`).

## O que mudou de lugar (nenhuma função saiu)

- **Subtítulo da rota** → dica (`title`) do h1.
- **"Último login"** → topo do menu da conta.
- **Bloco de usuário no rodapé da sidebar** → saiu. Já estava no chip do cabeçalho.
- **"Meus dados"** → grupo Cadastros. **Info** → rodapé da sidebar, junto de Trocar Senha e Sair.
- **Banner vermelho do Dashboard** → virou o KPI dominante:
  - mantém o mesmo texto do primeiro vencido e o "Ver equipamento/Ver certificados";
  - ganhou "Ver os N vencidos", que filtra a lista da própria tela;
  - o botão de dispensar saiu: o KPI não é um aviso intrusivo.
- **Resumo da agenda** (previsto/realizado/serviços) → KPI "Serviços no mês". A coluna da
  direita lista os próximos serviços.
- **Rascunho: Imprimir pré-visualização, Baixar PDF e Configurações** → menu ⋯. Laudo,
  Salvar e Finalizar ficam à vista.
- **Relatório somente leitura:** Imprimir e Baixar à vista no desktop, no ⋯ no celular.
- **Visualizador:**
  - "Páginas" e "Abrir em outra aba" viram ícone, com o nome no `aria-label`;
  - o selo vira a forma curta ("Arquivado"/"Prévia"), com o texto inteiro na dica;
  - "Prévia" some quando o selo "Rascunho" já está na barra.
  - Fora da barra única (Portal, Prontuários, Certificados) **nada muda**: sem `barraEm`
    o visualizador desenha a barra no lugar de sempre.

## Verificação

- `npm run build`: ok.
- `npx vitest run`:
  - os 4 testes que já falhavam na `main` continuam falhando. A causa é o checkout CRLF
    (`core.autocrlf=true`): eles procuram `\n` dentro de `Relatorios.tsx`.
  - testes pesados de geração de PDF oscilam por tempo esgotado na suíte inteira (8 numa
    rodada da `main`, 13 em outra). Isolados, os 4 arquivos afetados passam: 106/106.
  - teste novo: `src/__tests__/redesignPiloto.test.ts`, 23/23.
- Lint dos arquivos tocados: mesma contagem da `main` (nenhum problema novo).

## Efeito colateral do método (só no laboratório)

Abrir o MESMO rascunho em duas instâncias do app ao mesmo tempo (a aba e o iframe) fez as
duas gravarem `nr13_injecao_atual`/`nr13_inspecao_atual`, as chaves vivas do relatório em
montagem. Isso gerou 2 conflitos na tela Sincronização do lab. Foi o comportamento
previsto da v2: as duas versões ficaram guardadas. Os conflitos ficaram lá, sem decisão.
Não é efeito do redesign, que não toca em armazenamento.

## Fora deste piloto

Barra inferior no celular, escala de z-index aplicada ao shell, e o resto das telas
(Vencimentos e Registros de Segurança usam o mesmo `dashboard-novo.css`, e as regras novas
estão escopadas em `.painel-compacto`).
