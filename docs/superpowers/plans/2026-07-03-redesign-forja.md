# Redesign "Forja" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar todo o sistema NR-13 com o design da pasta `design/` (paleta steel/âmbar, sidebar escura, Space Grotesk/IBM Plex, sprite SVG próprio) e adicionar Dashboard de vencimentos, página Vencimentos, Livro Registro, aba Rastreabilidade (com merge de PDF) e Acessos com permissões.

**Architecture:** Tokens CSS globais + componente `<Icone>` (sprite SVG) + shell novo em `Layout.tsx`; telas reescrevem só a camada de apresentação chamando os services existentes. Motor novo `src/services/vencimentos.ts` deriva prazos de dados já salvos. Permissões por sub-login em `nr13_permissoes_<userId>` (app_storage), aplicadas no front.

**Tech Stack:** React 19 + TS + Vite, Zustand, react-router-dom, @fontsource (Space Grotesk, IBM Plex Sans/Mono), pdf-lib (merge), vitest.

## Global Constraints

- **Fonte da verdade visual:** `design/*.html` — copiar tokens/classes/medidas de lá, não inventar.
- Nenhuma alteração em `src/calc/*`, fórmulas/HTML salvo dos services de memorial, templates de `public/arquivos-*`, chaves do CLAUDE.md §2 (só adiciona `nr13_rastreab_<id>`, `nr13_permissoes_<userId>`, `nr13_ultimo_login`).
- Regra de unidades da Categoria (kPa×m³) intocada.
- Zero emoji na UI; ícones só via sprite próprio. Remove lucide-react ao final da Fase C.
- Todos os botões ligados a ações reais.
- Cada fase termina com `npx vitest run` verde (37+ testes) e `npm run build` limpo.
- Commits frequentes em main local; push só ao final validado (push = produção).

---

## FASE A — Fundação visual

### Task A1: Fontes + tokens
**Files:** Modify `package.json` (deps), `src/main.tsx`, `src/styles/tokens.css`.
- [ ] `npm i @fontsource/space-grotesk @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono`
- [ ] `src/main.tsx`: trocar imports @fontsource-variable/inter + jetbrains por:
  `@fontsource/space-grotesk/{500,600,700}.css`, `@fontsource/ibm-plex-sans/{400,500,600}.css`, `@fontsource/ibm-plex-mono/{400,500,600}.css`.
- [ ] `tokens.css`: substituir paleta pelo `:root` do spec §1 mantendo aliases usados no código
  (`--accent` → #FF7A1A, `--bg-body` → #F6F5F2, `--font-base` → 'IBM Plex Sans', `--font-mono` → 'IBM Plex Mono', novo `--font-display` → 'Space Grotesk'). Grep por vars antigas e mapear todas.
- [ ] Verify: `npm run build` OK. Commit `feat(design): paleta Forja + fontes Space Grotesk/IBM Plex`.

### Task A2: Sprite de ícones `<Icone>`
**Files:** Create `src/components/Icone.tsx`.
**Produces:** `export function Icone({ nome, tam = 17, style, className }: { nome: NomeIcone; tam?: number; style?: CSSProperties; className?: string })` — renderiza `<svg class="icone">` com paths inline (stroke currentColor, fill none, strokeWidth 1.8, linecap/linejoin round). `export type NomeIcone` união dos nomes.
- [ ] Copiar TODOS os symbols de `design/painel_dashboard.html:246-274` e `design/painel_relatorios.html:153-176` (grid, box, userplus, users, briefcase, barchart, clipboard, sliders, key, logout, chevdown/left/right, cloudcheck, clock, bell, alerttri, arrowright/left, trendup, map, checkcircle, calendar, plus, x, flame, fan, cylinder, tool, filetext, pencil, eye, copy, trash, filter) + extras necessários: search (lupa), book (livro registro), camera, upload, cloud-off, check.
- [ ] Implementar como mapa `const PATHS: Record<NomeIcone, ReactNode>`.
- [ ] Verify build. Commit `feat(design): componente Icone com sprite SVG próprio`.

### Task A3: Shell novo (sidebar + topbar)
**Files:** Modify `src/app/Layout.tsx`, `src/app/layout.css`, `src/app/SyncStatus.tsx`, `src/services/auth.ts` (gravar `nr13_ultimo_login` no login), Create `src/app/menu.ts`.
**Produces:** `menu.ts` exporta `ITENS_MENU: { id: string; to: string; label: string; icone: NomeIcone }[]` com ids `dashboard, equipamentos, inspecoes, relatorios, prontuarios, calibracoes, livro, vencimentos` + submenu cadastrar (`funcionarios`, `clientes`→/empresas) — usado depois pelas permissões (D3).
- [ ] Reescrever sidebar conforme `design/painel_dashboard.html:279-312`: brand Fj/Forja, nav-items com Icone, contador de equipamentos (conta cards de `listarEquipamentos()` — ver como Dashboard.tsx atual lista), Cadastrar expansível, divisória, Sair danger, sidebar-foot avatar+nome+papel (papel de `papelAtual()`, rótulos: mestre→Administrador, gerente→Gerente, funcionario→Inspetor).
- [ ] Topbar: h1+path por rota (mapa rota→título/subtítulo), sync-pill (reusar estado do SyncStatus: verde Sincronizado / warn pendências / cinza Offline), login-info "Último login: …" lendo `nr13_ultimo_login`, bell-wrap com bell-dot se houver vencidos (import dinâmico de vencimentos — na Fase A deixa dot oculto, liga na B2), user-chip.
- [ ] Mobile: manter hambúrguer/backdrop atuais, sidebar `position:fixed` como hoje.
- [ ] `auth.ts` login: `localStorage.setItem('nr13_ultimo_login', new Date().toISOString())` (chave local, NÃO sincronizada — adicionar a CHAVES_PRESERVADAS).
- [ ] Verify: app abre, navegação funciona, mobile drawer OK. Commit `feat(design): shell Forja (sidebar escura + topbar)`.

### Task A4: Classes base globais
**Files:** Create `src/styles/forja.css` (importado no main.tsx após tokens).
- [ ] Portar classes compartilhadas dos HTMLs: `.painel/.panel`, `.panel-head`, `.eyebrow`, `.btn/.btn-primary/.btn-ghost`, `.badge (crit/warn/ok)`, `.type-badge`, `.tag-chip-azul` (eq-tag), `.field` (label+input mono), `.fselect`, `.search-box`, `.kpi*`, tabela (`thead th`, `tbody td`, hover #FBFAF7), `.modal-overlay/.modal-box`, `.result-banner`, focus-visible âmbar. Prefixo sem colisão com CSS antigo (usar nomes iguais aos HTMLs; remover regras conflitantes dos css antigos quando re-skinnar cada tela).
- [ ] Verify build. Commit `feat(design): classes base Forja`.

---

## FASE B — Vencimentos + Dashboard

### Task B1: Motor de vencimentos (TDD)
**Files:** Create `src/services/vencimentos.ts`, Test `src/services/vencimentos.test.ts`.
**Produces:**
```ts
export interface ItemVencimento {
  tag: string; nome: string; tipoEquip: string;       // 'Vaso de Pressão' | 'Caldeira' | ...
  origem: 'inspecao' | 'calibracao';
  pertenceA?: string;                                  // TAG pai (acessórios)
  ultima?: Date; vencimento?: Date; dias?: number;     // dias restantes (negativo = vencido)
  status: 'crit' | 'warn' | 'ok' | 'semPrazo';
}
export function listarVencimentos(hoje?: Date): ItemVencimento[];
export function resumoKpis(itens: ItemVencimento[], totalEquip: number):
  { total: number; aVencer30: number; vencidos: number; conformidade: number };
export function statusPrazo(venc: Date, hoje: Date): { dias: number; status: 'crit'|'warn'|'ok' };
```
- [ ] Testes primeiro (statusPrazo: vencido→crit; 15d→warn; 45d→ok; resumoKpis com 0 prazos→conformidade 100; parse de datas 'dd/mm/aaaa' e 'aaaa-mm-dd' dos dados salvos). `npx vitest run` FAIL → implementar → PASS.
- [ ] `listarVencimentos`: varre localStorage: `nr13_vida_<TAG>` (campo próxima inspeção — conferir nome real do campo em `VidaRemanescente.tsx` antes), `nr13_calibracao_item_<id>` (validade + tag vinculada — conferir shape em `Calibracoes.tsx`), `nr13_info_<TAG>` p/ nome+tipo. Ignorar chaves malformadas (try/catch por item).
- [ ] Commit `feat(vencimentos): motor de prazos derivado dos dados salvos`.

### Task B2: Rotas + Dashboard novo + /vencimentos
**Files:** Rename `src/pages/Dashboard.tsx`→`src/pages/Equipamentos.tsx` (lista), Create `src/pages/Dashboard.tsx` (novo), `src/pages/Vencimentos.tsx`, `src/pages/dashboard-novo.css`; Modify `src/app/router.tsx` (`/equipamentos`→lista, `/dashboard`→novo, `/vencimentos`), `src/app/menu.ts`, topbar bell (liga dot).
- [ ] Dashboard conforme `design/painel_dashboard.html:334-525`: alert-banner (se `vencidos>0`, 1º item vencido, botão → `/equipamento/<tag>`, X dispensa na sessão), kpi-row (dados de `resumoKpis`; sem deltas de mês — mostrar subtítulo estático tipo "atualizado agora", YAGNI histórico), grid tabela vencimentos (6 primeiros, link → `/vencimentos`), painel alertas críticos (itens crit/warn), card Minha Empresa (logo+dados de `nr13_minha_empresa` + botão Editar → `/minha-empresa`) no lugar do plant-map, calendário compacto real (mês atual, navegação ‹›, marcas nos dias com vencimento) + agenda (grupos por dia dos próximos vencimentos) + modal calendário completo (`design/painel_dashboard.html:530-569`) + botão "+ Nova Inspeção" → `/inspecoes`.
- [ ] `/vencimentos` conforme `design/painel_vencimentos_inspecoes.html`: KPIs + tabela completa (todos os itens, ordenado por dias) + calendário/agenda + modal.
- [ ] Redirect `/` → `/dashboard`; menu aponta Equipamentos → `/equipamentos`.
- [ ] Verify: navegar, dados reais aparecem, vazio não quebra (estado vazio elegante). Commit.

---

## FASE C — Re-skin telas

### Task C1: Lista de equipamentos (`/equipamentos`)
**Files:** Modify `src/pages/Equipamentos.tsx`, `src/pages/dashboard.css`→`equipamentos.css`.
- [ ] Cards `plate-card` conforme `design/painel_equipamentos.html:78-118,197-221`: foto object-fit contain (usa 1ª foto de `nr13_fotos_<TAG>`; senão "Sem foto"), tag-chip sobre foto, uom-row (unidade da ficha), equip-name/empresa, meta-grid (PMTA, Categoria, Volume, Fluido, PTH, Resultado — dados de `nr13_calc_<TAG>`/`nr13_cat_<TAG>`/`nr13_info_<TAG>`; ausente = "—" `.dash`), life-block (de `nr13_vida_<TAG>`: % = vida/teto NR-13 clampado; cores ok>50/warn>25/crit), type-badge (vaso purple, caldeira crit-bg, tubulação blue), botão "Acessar →".
- [ ] Toolbar busca + selects Empresa/Tipo/Categoria/Resultado (opções derivadas dos dados) + "Limpar filtros" + contador "N de M".
- [ ] Botão topo "+ Criar equipamento" abre o `ModalCriarEquipamento` existente.
- [ ] Commit.

### Task C2: Ficha do equipamento (`/equipamento/:tag`)
**Files:** Modify `src/pages/Equipamento.tsx` + css e componentes da ficha (`src/features/equipamento/*` apresentação apenas).
- [ ] Conforme `design/painel_detalhe_equipamento.html:241-425`: painel header (eq-tag azul "TAG: X", type-badge, delete-link, uom-select ligado ao seletor real, eq-stats-grid 5 stats, thumbs + foto principal contain), painel Categoria (form volume/pressão/fluido pré-preenchidos da lógica atual + result-banner mono + 2 grids resultado), painel Memorial (btn-mem-edit âmbar vertical → `/equipamento/:tag/memorial`, mem-stats de `nr13_calc_<TAG>`, "Ver Memorial Completo →" abre o modal/HTML atual), painel Vida Remanescente (component atual re-skinnado: 5 fields + 2 botões + life-result), painel Dados equipamento/empresa lado a lado (rd-grid readonly + ✎ abre edição atual).
- [ ] Não mudar nenhum handler/estado — só JSX/classes.
- [ ] Commit.

### Task C3: Relatórios
**Files:** Modify `src/pages/Relatorios.tsx`, `relatorios.css`.
- [ ] Conforme `design/painel_relatorios.html:229-352`: crumb (Voltar, chevron, crumb-tag TAG quando filtrado), tabela (checkbox geral, file-cell com Icone filetext em crit-bg, tag-mini, type-badge por tipo, datas mono, dash, actions-cell pencil/eye(.view azul2)/copy/trash(.danger)), filter-wrap dropdown com checkboxes tipo/status, btn-primary "+ Criar Relatório" ligando no fluxo atual. Ações ligadas às funções existentes (abrir/editar/duplicar/excluir — mapear as que existem; se duplicar não existir, ocultar).
- [ ] Commit.

### Task C4: Memorial em cascata (terminal)
**Files:** Create `src/features/memorial/TerminalMemorial.tsx` (+css), Modify `MemorialVaso.tsx`, `MemorialCaldeira.tsx`, `MemorialAutoclave.tsx`, `src/pages/Memorial.tsx` (layout grid-2).
**Produces:** `<TerminalMemorial linhas={LinhaTerminal[]} status={'idle'|'calculando'|'aprovado'|'reprovado'|'pendente'} arquivo={string}>` onde `LinhaTerminal = { tipo: 'doc-title'|'doc-sub'|'hr'|'section'|'comp-header'|'comp-sub'|'sub'|'comment'|'ok'|'bad'|'formula'|'resultado'|'banner-pass'|'banner-fail'|'result-pass'|'result-fail'|'prompt'; texto?: string; html?: string }` + helpers `linhaFracao(label, num, den)` e `linhaResultado(label, valor, unidade)` que geram o HTML `.formula-block/.frac/.fnum/.fden/.fresult` de `design/painel_calculo_pmta_nr13.html:127-133,330-338`.
- [ ] Parser: os services atuais devolvem `logCalculo`/HTML — criar adaptador que converte as linhas existentes (t_req = P·R / (S·E−0,6·P) etc.) em LinhaTerminal com frações verdadeiras, SEM alterar o `memorialHTML` salvo p/ A4.
- [ ] Layout: form à esquerda (fgroup-labels/fields mono), terminal à direita (term-topbar dots+filename `memorial_<tag>.log`+status pill), animação `.tl` fade-in, banner final APROVADO/REPROVADO/PENDENTE, comp-header azul-escuro por componente.
- [ ] Verify: gerar memorial de vaso, caldeira mista, autoclave vertical — resultados numéricos idênticos aos de antes (conferir com testes vitest existentes intactos). Commit.

### Task C5: Telas restantes
**Files:** Modify `Login.tsx/login.css`, `Inspecoes.tsx/InspecaoContainer.tsx/InspecaoFormulario.tsx/inspecoes.css`, `Calibracoes.tsx/calibracoes.css`, `Prontuarios.tsx/prontuarios.css`, `Funcionarios.tsx/Empresas.tsx/cadastros.css`, `MinhaEmpresa.tsx`, `Acesso.tsx`, `Admin.tsx/admin.css`, `src/pages/portal/*`, `LoadingGlobalOverlay`.
- [ ] Aplicar tokens/painéis/btn/badges/fields em cada uma; formulários de inspeção mantêm RespostaSegmentada (recolorir âmbar/ok/crit) e alvos ≥44px; Login = card branco + brand-mark âmbar; Portal = mesma paleta com topbar simples.
- [ ] Remover lucide-react (`npm rm lucide-react`) após substituir todos os usos por `<Icone>`; grep por emoji na UI (✏️ 🗑 etc.) e trocar por Icone.
- [ ] `npx vitest run` + build. Commit por tela ou grupo.

---

## FASE D — Funcionalidades novas

### Task D1: Livro Registro (`/livro-registro`)
**Files:** Create `src/pages/LivroRegistro.tsx` (+css inline em forja.css), Modify `router.tsx`, `menu.ts`.
- [ ] Varre `nr13_livro_<TAG>`/`nr13_livro_config_<TAG>` → tabela painel: TAG (tag-mini), equipamento, nº registros, termo de abertura (badge ok "Gerado" se 1ª inspeção já gerou / dash), último registro (data mono), ação eye → modal com `<PaginaA4><iframe src="/arquivos-inspecao/LIVRO-REGISTRO.html?tag=X">` (e TERMO-ABERTURA quando existir).
- [ ] Commit.

### Task D2: Rastreabilidade + merge PDF
**Files:** Modify `src/pages/Calibracoes.tsx` (abas Certificados|Rastreabilidade), `src/features/relatorios/pdfService.ts` (append pós-geração), `package.json` (`npm i pdf-lib`), CLAUDE.md §2 (+`nr13_rastreab_<id>`).
**Produces:** `nr13_rastreab_<id>` = `{ id, nome, certificadoPadrao, validade, pdfBase64, injetarNoRelatorio: boolean }`; `export async function anexarRastreabilidades(pdfBytes: Uint8Array): Promise<Uint8Array>` em novo `src/features/relatorios/rastreabilidadeService.ts`.
- [ ] Aba nova: lista + form (nome, nº certificado, validade, `<input type=file accept=application/pdf>` → base64, checkbox injetar), salvar via storage.ts (sincroniza).
- [ ] `anexarRastreabilidades`: pdf-lib `PDFDocument.load` de cada base64 marcado, `copyPages` → append; try/catch por PDF (falhou → pula e `console.warn` + aviso UI). Chamar no ponto onde pdfService finaliza o jsPDF (converter `doc.output('arraybuffer')` → merge → download blob). Só quando houver itens marcados; caso contrário fluxo atual intacto.
- [ ] Verify manual: gerar relatório com 1 PDF marcado → páginas anexadas ao final. Commit.

### Task D3: Acessos ampliado + permissões
**Files:** Modify `src/pages/Acesso.tsx`, `src/services/auth.ts` (helper `moduloPermitido`), `src/app/Layout.tsx` (filtra menu), Create `src/services/permissoes.ts`, CLAUDE.md §2 (+`nr13_permissoes_<userId>`).
**Produces:**
```ts
// permissoes.ts
export const MODULOS = ['dashboard','vencimentos','equipamentos','inspecoes','relatorios',
  'prontuarios','calibracoes','livro','funcionarios','clientes'] as const;
export type Modulo = typeof MODULOS[number];
export function carregarPermissoes(userId: string): Modulo[] | null;  // null = sem restrição (legado)
export function salvarPermissoes(userId: string, modulos: Modulo[]): void; // via storage.ts
export function modulosDoUsuarioAtual(): Modulo[] | null;              // usa id do perfil logado
```
- [ ] UI Acesso: cards por sub-login (nome, papel exibido — gerente→"Gerente", funcionario→"Inspetor"), criação com escolha Gerente (pré-marca tudo)/Inspetor (só inspecoes)/Personalizado (vazio) + grade de checkboxes de MODULOS; salvar cria via `org_admin` atual (papel real: gerente|funcionario) + `salvarPermissoes`. Bloco "Acesso de Cliente" com link → `/empresas`.
- [ ] Layout: `modulosDoUsuarioAtual()` ≠ null → renderizar só itens permitidos; guard leve nas rotas (redirect ao 1º módulo permitido). Mestre nunca filtrado.
- [ ] Verify: mestre vê tudo; simular permissões limitadas via localStorage. Commit.

### Task D4: Fechamento
- [ ] CLAUDE.md: §2 chaves novas, §9 nota do redesign; atualizar memória do projeto.
- [ ] `npx vitest run` (todos) + `npm run build` + smoke visual (screenshots dashboard/equipamentos/ficha/memorial/relatorios vs HTMLs).
- [ ] Commit final. Push em main **só com autorização já dada** (usuário mandou subir em main — confirmar no fim se quer push imediato).
