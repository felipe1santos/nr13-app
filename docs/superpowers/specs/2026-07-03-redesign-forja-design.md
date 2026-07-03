# Redesign "Forja" — Spec de design (03/07/2026)

**Fonte da verdade visual:** pasta `design/` na raiz do projeto (6 HTMLs + `INFORMACOES-IMPORTANTES.md`).
Replicar exatamente: paleta, tipografia, componentes, espaçamentos. Onde não houver HTML de exemplo,
usar os mesmos tokens/componentes. **É reestilização + funcionalidades novas aprovadas — a lógica de
negócio, cálculos, injeção de dados e templates A4 ficam intocados.**

## 1. Identidade visual (tokens)

Copiados de `design/painel_dashboard.html` (`:root`):

```css
--ink:#14181C; --ink-soft:#1E252B; --ink-soft2:#242B32;
--steel:#F6F5F2; --panel:#FFFFFF; --line:#E4E1D8;
--text:#2D3339; --muted:#7A8790;
--amber:#FF7A1A; --amber-deep:#D9640C;
--ok:#1FA971; --ok-bg:#E7F6EF;
--warn:#B8860B; --warn-bg:#FBF1DC;
--crit:#D5453D; --crit-deep:#B93A33; --crit-bg:#FBEAE9;
--purple:#7C5CFC; --purple-bg:#F1EDFF;
--blue:#457DC1; --blue-deep:#35639C; --blue-bg:#EAF2FB; --blue-line:#C9DCF0;
--blue2:#0C4F9B; --blue2-bg:#E4EDF9; --blue2-line:#C4D9F0;
--radius:10px;
```

- **Fontes:** Space Grotesk (títulos/números grandes), IBM Plex Sans (texto), IBM Plex Mono (tags,
  valores, fórmulas). Auto-hospedadas via `@fontsource` (PWA offline). Substituem Inter/JetBrains.
- **Ícones:** sprite SVG próprio (símbolos copiados dos HTMLs de referência, stroke 1.8, cantos
  arredondados), componente React `<Icone nome="..."/>`. **Remove lucide-react. Zero emoji na UI.**
- Cards raio 10px, sombra só no hover (`0 10px 26px rgba(20,24,28,.08)` + translateY(-2px)).
- Botões: `.btn-primary` âmbar (#FF7A1A, texto #241505, hover #D9640C); `.btn-ghost` borda `--line`.
- Badges de status: crit/warn/ok com fundo claro; badge tipo "Inspeção Periódica" em `--blue2`.
- Chip de TAG: mono, `--blue` sobre `--blue-bg` com borda `--blue-line`.
- Focus visible: outline 2px âmbar (acessibilidade, presente em todos os HTMLs).

## 2. Shell (todas as telas)

- **Sidebar escura fixa** (~246px, `--ink`): brand "Fj / Forja — Engenharia & Ativos"; itens com
  ícone, hover `--ink-soft`, ativo com `inset 2px 0 0 var(--amber)`; contador mono em Equipamentos;
  "Cadastrar" expansível (chevron gira) com Funcionários e Clientes; divisória; "Sair" (hover
  vermelho escuro); rodapé avatar + nome + papel do usuário logado.
- **Menu final:** Dashboard · Equipamentos · Inspeções · Cadastrar (Funcionários, Clientes) ·
  Relatórios · Prontuários · Calibrações · **Livro Registro** · Acessos (só mestre) · — · Sair.
  "Minha Empresa" sai do menu (vira card no Dashboard, rota `/minha-empresa` continua).
- **Topbar branca:** h1 Space Grotesk + subtítulo; à direita: pill verde "Sincronizado" (liga no
  SyncStatus real: verde=ok, amarelo=pendências, cinza=offline), "Último login: [data/hora]"
  (gravado no login em localStorage), sino com bolinha vermelha quando houver vencido (clique → 
  dashboard), chip avatar+nome+papel.
- **Mobile (≤720px):** sidebar vira drawer via hambúrguer (comportamento atual mantido); topbar
  compacta; grids colapsam conforme media queries dos HTMLs.

## 3. Telas (mapa referência → código)

| Referência | Tela do app | Mudança |
|---|---|---|
| `painel_dashboard.html` | **NOVA** `/dashboard` (Dashboard.tsx vira lista → `/equipamentos`) | banner vencidos, 4 KPIs, tabela vencimentos, alertas críticos, card Minha Empresa (no lugar do mapa de planta — usuário dispensou o mapa), calendário+agenda+modal, botão "+ Nova Inspeção" → `/inspecoes` |
| `painel_vencimentos_inspecoes.html` | **NOVA** `/vencimentos` | KPIs + tabela completa + calendário; alvo do "ver todos" |
| `painel_equipamentos.html` | `/equipamentos` (ex-Dashboard) | cards `plate-card`: foto contain com chip TAG, unidade de medida, meta-grid PMTA/Categoria/Volume/Fluido/PTH/Resultado, barra vida remanescente colorida (ok>50%, warn 25–50%, crit<25% do teto), badge tipo, "Acessar →"; toolbar busca+filtros empresa/tipo/categoria/resultado + limpar |
| `painel_detalhe_equipamento.html` | `/equipamento/:tag` | painel header (TAG azul grande, badge tipo, excluir, seletor unidade, stats, thumbs de foto, foto principal), painel Categoria NR-13 (form 3 campos + banner mono verde + grids resultado), painel Memorial (botão vertical âmbar gigante "Editar Memorial de Cálculo" + mem-stats + "Ver Memorial Completo →"), painel Vida Remanescente (5 campos + Calcular/Calcular e Salvar + result box), painel Dados equipamento/empresa lado a lado (rd-grid readonly) |
| `painel_relatorios.html` | `/relatorios` | crumb TAG chip, tabela histórico (checkbox, file-cell ícone PDF vermelho, tag-mini azul, type-badge, datas mono, dash "—", ações pencil/eye azul-escuro/copy/trash vermelho), filtro dropdown checkboxes, "+ Criar Relatório" |
| `painel_calculo_pmta_nr13.html` | `/equipamento/:tag/memorial` (Memorial*.tsx) | grid 2 col: form à esquerda (fgroup-labels, fields mono), à direita "terminal" branco: term-topbar (3 dots, filename, status pill), linhas animadas `.tl`, cabeçalho azul-escuro por componente (`comp-header`), **frações reais** (`.frac/.fnum/.fden`), STATUS banner por componente, veredito final com ✓/✗ e banner APROVADO/REPROVADO |

Demais telas sem HTML próprio (Inspeções, formulários de campo, Calibrações, Prontuários,
Funcionários, Empresas, Minha Empresa, Acesso, Login, Portal do cliente, Admin): aplicar tokens,
painéis, botões, badges e fields do padrão. Login: card branco sobre `--steel`, brand-mark âmbar.

**Memorial:** o pipeline atual (services → `memorialHTML` salvo em `nr13_calc_<TAG>` e consumido
pelos templates A4) NÃO muda. A reestilização é na **tela** (render do log/resultado em React com
as classes novas). O HTML salvo para o relatório permanece como está para não quebrar as folhas A4.

## 4. Motor de vencimentos (novo, `src/services/vencimentos.ts`)

Deriva prazos SOMENTE de dados já salvos (sem tela de agendamento):

- **Equipamento (interna):** `nr13_vida_<TAG>.proximaInspecao` (data) quando existir; senão sem
  prazo (não inventar).
- **Relatórios:** datas de validade/próximas inspeções gravadas no histórico
  (`nr13_historico_relatorios`), quando presentes.
- **Acessórios:** itens de Calibração (`nr13_calibracao_item_<id>`) com data de validade — mostrar
  "pertence a <TAG>" quando o item tiver equipamento vinculado.
- Saída unificada: `{ tag, nome, tipo, origem, ultimaData?, vencimento?, diasRestantes, status:
  'crit'|'warn'|'ok' }` (crit = vencido; warn ≤30 dias; ok >30).
- KPIs: total equipamentos; a vencer 30d; vencidos; conformidade = 1 − vencidos/itens com prazo
  (100% se nenhum prazo cadastrado).
- Calendário marca os vencimentos no mês; agenda lista próximos por dia. "+ Nova Inspeção" abre
  `/inspecoes` (não há agendamento com hora — YAGNI).

## 5. Funcionalidades novas

### 5.1 Livro Registro (`/livro-registro`)
Painel listando, por equipamento (varre `nr13_livro_<TAG>` / `nr13_livro_config_<TAG>`), os livros
de registro: TAG, equipamento, nº de registros, se termo de abertura/capa existem (1ª inspeção),
data do último registro; ação "Visualizar" abre as folhas existentes (`LIVRO-REGISTRO.html` /
`TERMO-ABERTURA.html` via iframe `?tag=`) num modal/preview A4. Nada de lógica nova de geração —
só painel de consulta do que o fluxo atual já salva.

### 5.2 Calibrações → aba "Rastreabilidade"
- Abas dentro de Calibrações: "Certificados" (tela atual) e "Rastreabilidade" (nova).
- Cadastro por instrumento: nome/identificação, nº certificado padrão, validade, **PDF anexado**
  (base64 em `nr13_rastreab_<id>`, sincroniza via storage.ts normal) e checkbox **"Injetar no
  final do relatório"**.
- Injeção: após `pdfService` gerar o PDF do relatório, mesclar com `pdf-lib` as páginas dos PDFs
  marcados (append no final). Se um PDF falhar ao mesclar, gera sem ele e avisa.

### 5.3 Acessos ampliado (`/acesso`)
- UI nova estilo painel: criar **Gerente**, **Inspetor** (papel `funcionario` no backend),
  **Personalizado**; atalho "Acesso de Cliente" aponta para Empresas → editar → Portal.
- **Permissões por sub-login**: checklist visível de módulos (Dashboard, Equipamentos, Inspeções,
  Relatórios, Prontuários, Calibrações, Livro Registro, Cadastrar, Vencimentos). Gerente começa com
  tudo marcado (exceto Minha Empresa/Acessos, que são só do mestre); Inspetor começa só com
  Inspeções; Personalizado começa vazio.
- Armazenamento: `nr13_permissoes_<userId>` no app_storage da org (JSON `{ modulos: string[] }`).
  Aplicação no front: menu/rotas filtrados por permissão (guard no Layout). **Sem mudança de SQL ou
  Edge Function** — papel no banco continua mestre/gerente/funcionario/cliente; a granularidade é
  de aplicação, como já previsto no plano de acesso (§8).

### 5.4 Dashboard — card Minha Empresa
Logo + razão social + CNPJ + cidade/UF + telefone (de `nr13_minha_empresa`) + botão "Editar dados"
→ `/minha-empresa`. Substitui o "mapa da planta baixa" (dispensado pelo usuário).

## 6. Restrições invioláveis

1. Nenhuma alteração em `src/calc/*`, services de memorial (fórmulas/HTML salvo), `pdfService`
   (exceto o append de rastreabilidade pós-geração), templates de `public/arquivos-inspecao/` e
   `public/arquivos-prontuario/`, chaves de localStorage do CLAUDE.md §2 (só ADICIONA
   `nr13_rastreab_<id>` e `nr13_permissoes_<userId>`).
2. Regra de unidades da Categoria (kPa×m³) intocada.
3. Fluxo mobile de inspeção continua 100% funcional; alvos de toque ≥44px mantidos.
4. Todos os botões visuais ligados às ações reais existentes (nada decorativo morto).
5. 37 testes vitest verdes + `npm run build` limpo ao fim de cada fase.

## 7. Ordem de implementação

A) Fundação (tokens, fontes, sprite, shell/Layout, componentes base) →
B) Motor de vencimentos + Dashboard novo + /vencimentos + rota /equipamentos →
C) Re-skin: Equipamentos, Ficha, Relatórios, Memorial-terminal, telas restantes →
D) Livro Registro, Rastreabilidade + merge PDF, Acessos ampliado.
Commits frequentes; push em main só ao final validado (push = produção).
