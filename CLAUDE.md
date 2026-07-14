# CLAUDE.md — Sistema NR-13 (estrutura fixa do sistema)

Este arquivo é a **fonte de verdade** do sistema. Toda implementação, folha de relatório/prontuário,
formulário de inspeção e regra de injeção de dados DEVE respeitar o que está aqui. A ordem dos
documentos no relatório DEVE seguir a seção "Organização do Relatório".

---

## 1. Objetivo e fluxo do usuário

O sistema torna a inspeção NR-13 e a elaboração da documentação **mais rápida e fácil**. Fluxo real:

1. **Em campo (celular):** o usuário abre o botão **"Inspeções"**, preenche as ferramentas de
   inspeção (checklist, visual externo/interno, ultrassom/ME, teste hidrostático) respondendo
   perguntas e anexando fotos com descrição. Salva no container de inspeção.
2. **No escritório (computador):** o usuário gera a documentação. O sistema **puxa automaticamente**
   tudo que foi salvo (ficha do equipamento, memorial, cadastro da empresa/funcionários, cadastro do
   cliente, dados de campo) e monta as folhas do relatório e do prontuário, com assinatura do
   engenheiro responsável.

Por isso: **as telas de inspeção precisam ser 100% responsivas para mobile**, e os dados delas são
**injetados** nas folhas que geram o relatório e o prontuário.

---

## 2. Stack e arquitetura

- React 19 + TypeScript + Vite. Estado em Zustand. Rotas em `react-router-dom`.
- PDF: `html2canvas` + `jspdf` (A4 210×297mm, JPEG 0.95) — `src/features/relatorios/pdfService.ts`.
- **As folhas do relatório/prontuário são templates HTML estáticos** em `public/arquivos-inspecao/`
  e `public/arquivos-prontuario/`, renderizados em `<iframe>` com `?tag=<TAG>&page=<N>`.
- Cada template lê os dados que precisa **direto do `localStorage`** no `DOMContentLoaded`.
  Não há backend: o "banco" é o `localStorage` (via `src/services/storage.ts`).

### Como o documento puxa as informações (chaves de `localStorage`)

Tudo que o usuário salva pode ser fonte de injeção. Chaves por TAG do equipamento e globais:

| Chave | Conteúdo | Origem (onde o usuário salva) |
|---|---|---|
| `nr13_info_<TAG>` | Dados cadastrais do equipamento | Ficha em "Equipamentos" |
| `nr13_calc_<TAG>` | Resultados do memorial: `pmta`, `pth` (MPa), `memorialHTML`, `logCalculo` e `componentes[]` (array estruturado por componente: nome, pmtaMpa, tReqMm, tNom, E, S, D, raio, ca, material, fórmulas) consumido pelo RESUMO-MEMORIAL | "Salvar Memorial Completo" |
| `nr13_vaso_<TAG>` / `nr13_vaso_ac_corpo_<TAG>` | Componentes/cálculo do memorial | Memorial |
| `nr13_vaso_cald_<TAG>` | Dados do memorial de caldeira (ASME I: costado/tubo/espelho) | Memorial da caldeira |
| `nr13_cat_<TAG>` | Categoria de risco | Calculadora de categoria |
| `nr13_emp_<TAG>` | Empresa/cliente do equipamento | Cadastro de cliente |
| `nr13_fotos_<TAG>` | Fotos da capa/equipamento | Ficha |
| `nr13_med_esp_<TAG>` | Medição de espessura (ultrassom/ME) | Inspeção |
| `nr13_pref_unidade_<TAG>` | Unidade de medida da ficha | Ficha (Seletor de Unidade) |
| `nr13_minha_empresa` | Dados + logo da empresa executante | "Minha Empresa" |
| `nr13_lista_phs` | Profissionais habilitados / engenheiros (assinatura) | Funcionários |
| `nr13_calibracao_item_<id>` | Certificado de calibração | Calibrações |
| `nr13_livro_<TAG>` / `nr13_livro_config_<TAG>` | Livro de registro de segurança | Auto + config |
| `nr13_vida_<TAG>` | Vida remanescente (taxa de corrosão, vida, próxima inspeção) | Card "Vida Remanescente" na ficha |
| `nr13_rastreab_<id>` | Rastreabilidade do padrão (PDF base64 + flag injetar no relatório) | Calibrações → aba Rastreabilidade |
| `nr13_permissoes_<userId>` | Módulos permitidos do sub-login ({ modulos: string[] }) | Acessos (mestre) |
| `nr13_componentes_cal_<TAG>` | Válvulas/manômetros cadastrados (nome, série, foto) | Calibrações → Componentes |
| `nr13_lotes_cal_<TAG>` | Lotes/rodadas de calibração (certificados ganham loteId/componenteId) | Calibrações → Lotes |
| `nr13_relatorio_meta_atual` | Metadados do relatório em montagem | Gravado na geração |
| `nr13_inspecao_atual` **e** `nr13_injecao_atual` | Dados de campo do container escolhido | Gravado na geração |
| `nr13_prontuario_meta_<TAG>` | Nº do relatório (`REL-<timestamp>`) + data de emissão do prontuário; reusado entre reimpressões (`obterOuCriarMeta`) | Gravado ao abrir o visualizador do prontuário |
| `nr13_assinantes_pront_<TAG>` | Assinantes do prontuário (`{engenheiroId, tecnicoId}` de `nr13_lista_phs`) — lido por `pront-assinatura.js` nas 6 folhas | Selects Engenheiro/Técnico no visualizador do prontuário |
| `nr13_assinantes_rel_<TAG>` | Assinantes do relatório (`{engenheiroId, tecnicoId}`) — fallback LEGADO do `rel-assinatura.js` (fonte primária: snapshot `meta.assinantes`, ver §7-bis); espelhado em `meta.phNome/phCrea/tecnicoNome` | Selects no modal Configurações do Relatório |
| `nr13_laudo_<TAG>` | Laudo da conclusão (`{apto, relatorioCodigo, atualizadoEm}`) — alimenta o selo APTO/INAPTO do livro de registro | Checkbox SIM/NÃO da CONCLUSAO.html |
| `nr13_croqui3d_<TAG>` | **LEGADO** (render 3D removido em 11/07/2026): PNG antigo do croqui 3D; nenhum código grava mais — PRONT-ULTRASSOM só lê como fallback de dados antigos | — (só leitura de legado) |
| `nr13_modelo3d_<TAG>` | Modelo do editor de Croqui 2D (`ModeloVaso`: diâmetro, comprimento, casco, virolas, tampos, bocais, suporte) — nome da chave mantido por compatibilidade | Editor de Croqui 2D (memorial → passo obrigatório; Prontuários → botão "Croqui 2D do Equipamento") |
| `nr13_croqui2d_<TAG>` | SVGs 2D gerados no save do editor: `{ longitudinal, transversal, detalheTampo }` | Editor de Croqui 2D (save) → PRONT-CROQUI2D.html + croqui da folha 1 (PRONT-ULTRASSOM.html) |
| `nr13_folha_dados_<TAG>` | Payload derivado do modelo (`FolhaDadosDerivada`: bocais, pesos, dimensões por componente, comprimento total, circunferência) para a folha de dados | Editor de Croqui 2D (save) → PRONT-FOLHA-DADOS.html |

> **REGRA CRÍTICA DE INJEÇÃO:** os dados de campo do container **devem ser gravados nas duas chaves**
> `nr13_inspecao_atual` **e** `nr13_injecao_atual` (ver `gravarInspecaoOrigemAtual`). Os templates não
> são uniformes: VERIFICACAO/checklist1-3/CHECKLIST-FOTOS leem `nr13_inspecao_atual`; VISUAL-EXTERNO/
> INTERNO, suas folhas de fotos, TESTE-HIDROSTATICO, ULTRASSOM e CERTIFICADO-CAL-* leem
> `nr13_injecao_atual`. Ao reabrir um relatório salvo, re-gravar `nr13_relatorio_meta_atual` e os
> dados do container **antes** de remontar os iframes, senão exibe dados do último relatório gerado.

---

## 3. Ficha do equipamento e o Memorial salvo

- Em **"Equipamentos"** ficam os cards. Clicar no card abre a **ficha** do equipamento.
- Ao calcular o memorial, o resultado fica salvo na ficha em **"Ver Memorial Completo"** e a partir
  dele injeta no resto da ficha.
- **O memorial injeta:** Volume (m³), PMTA (kgf/cm²) para cálculo de categoria (basta inserir o
  fluido para calcular a categoria), Tipo de Tampo, material, menor PMTA, PMTA do componente,
  espessura mínima requerida, Volume, etc.
- **Inserção manual:** dados do equipamento e a **espessura da parede de teste** (espessura "dona do
  vaso") que o memorial não calcula são preenchidos pelo usuário na ficha em "Equipamentos".

### Memorial de caldeira (ASME I-2004) e bocais opcionais

- **Caldeira** segue ASME I-2004: costado (PG-27.2.2: `e = P·D/(2·S·E+2·y·P) + C`), tubo
  (PG-27.2.1: `e = P·D/(2S+P) + 0,005·D + e`) e espelho (PG-46.1: `e = p·√(P/(S·C))`). Dados em
  `nr13_vaso_cald_<TAG>`; payload padrão (pmta/pth em MPa, componentes, memorialHTML) em
  `nr13_calc_<TAG>`. **PMTA = P de projeto convertida** (kgf/cm² = P×10,19716) e **TH = 1,5×PMTA**
  (não inverter a fórmula pela espessura; caldeira usa 1,5, vaso usa 1,3). Aprovação por etapa:
  espessura encontrada ≥ e calculada. NÃO chamar `atualizarCategoriaComPmta` para caldeira.
- **Bocais opcionais (UG-37/UG-40):** entram como componentes com id `bocal<N>` e tipo `'bocal'` em
  `nr13_vaso_<TAG>.componentes` — verificação de compensação de área (A1+A2+A3+A4 ≥ A_req). O bocal
  não tem PMTA própria, não entra no min() da PMTA nem nos `componentes[]` do RESUMO; reprovado
  derruba o resultado geral. `calcularResumoVaso` injeta `dadosCascoRef` do casco automaticamente.
- **GV do autoclave:** folhas MEMORIAL/RESUMO-MEMORIAL e `relatoriosService.linhasMemorial` mesclam
  `nr13_calc_gv_<TAG>` **na leitura** (nunca na gravação — ver bug documentado em
  `vasoMemorialService.ts`), exibindo o cálculo do GV logo abaixo do memorial principal.

---

## 4. Unidades de medida

- A unidade é definida **dentro da ficha** e reflete em todo o sistema, convertendo onde necessário.
- Alterar o grupo de unidade na ficha reconverte os dados em "Ver Memorial Completo" e em tudo salvo
  na ficha.
- **REGRA ABSOLUTA (exceção):** NUNCA converter as unidades do **cálculo da Categoria de Risco**.
  - **Enquadramento: (kPa) × (m³) > 8** — base confirmada (decisão de engenharia, mesma base do
    texto do checklist). NÃO usar kgf/cm² aqui.
  - Grupo de risco: (MPa) × (m³).
  - Ver `src/calc/categoria.ts` — recebe MPa/m³ e nunca toca nas unidades de exibição.

---

## 5. Layout, responsividade e impressão (todas as folhas)

- **Mobile:** todas as telas do sistema e telas/ferramentas de inspeção são responsivas. O
  preenchimento em campo pelo celular é a base do fluxo.
- **Impressão A4:** folhas de relatório e prontuário ajustam na impressão para sair exatamente a
  folha A4.
- **Sem quebra:** ao injetar/modificar conteúdo, nada pode ser cortado pelo limite da folha nem
  empurrar o rodapé para fora da margem.
- **Sem vazio:** não deixar grande espaço em branco; ajustar fontes/espaçamentos para proporção
  adequada do conteúdo na folha.

### Imagens / registros fotográficos (fotos da documentação, checklists, V.E., V.I. e TH)

- **Máx. 4 fotos por folha.**
- **Overflow (>4):** gera 2ª folha (e seguintes) com o mesmo cabeçalho/rodapé; a 1ª imagem da nova
  folha é a 5ª adicionada. (Ver `buildPages()` em `CHECKLIST-FOTOS.html` como referência.)
- **<4 fotos:** as 1/2/3 imagens se reajustam para ocupar a folha inteira, sem espaço vazio.

---

## 6. Inspeção mobile → fragmentação nas folhas do relatório

O usuário preenche **um arquivo único de inspeção** no celular (botão "Inspeções"): responde o
checklist e anexa fotos com descrição abaixo de cada item. Ao salvar no container, o sistema
**fragmenta** esse arquivo nos documentos do relatório, **nesta ordem**:

1. **Verificação da documentação** — só a lista de perguntas/verificações da documentação.
2. **Checklist 1, 2, 3** — só as listas relativas a eles.
3. **Fotos da documentação** (`FOTOS-DOCUMENTACAO.html`) — folha dedicada, só as fotos da etapa de
   documentação (grupo `fotosDocumentacao` do checklist). Auto-injetada após checklist3.
4. **Fotos do checklist** (`CHECKLIST-FOTOS.html`) — folha dedicada, fotos dos checklists 1-3.
5. **Vis. Externo** — perguntas/respostas do checklist "visual externo".
6. **Registro Foto V.E** — folha com as imagens do visual externo.
7. **Vis. Interno** — perguntas/respostas do checklist "visual interno".
8. **Registro Foto V.I** — folha com as imagens do visual interno.

As folhas de fotos (CHECKLIST-FOTOS, VISUAL-*-FOTOS, TESTE-HIDROSTATICO-FOTOS) e o TERMO-ABERTURA
são **auto-injetados** por `montarListaComTermoAbertura()` logo após sua folha-pai — não entram em
`DOCUMENTOS_DISPONIVEIS` e não são selecionados manualmente (evita duplicação).

---

## 7. Organização do Relatório — ORDEM DE MONTAGEM E INJEÇÃO (fixa)

Esta é a ordem canônica. `DOCUMENTOS_DISPONIVEIS` em `src/features/relatorios/tipos.ts` deve segui-la,
e a auto-injeção insere as folhas de fotos/termo nas posições indicadas.

| # | Documento | Arquivo | Injeta de |
|---|---|---|---|
| 1 | Capa | `CAPA.html` | ficha do equipamento |
| 2 | Sumário | `SUMARIO.html` | — |
| 3 | Placa | `PLACA.html` | ficha; PMTA em 3 unidades (converter) |
| 4 | **Caracterização** | `CLASSIFICACAO-RISCO.html` | dados do equipamento + categoria de risco |
| 5 | Prontuário | `PRONTUARIO.html` | memorial (fórmulas) + PMTA/PTH em kgf, bar, mpa |
| 6 | Resumo Memorial | `RESUMO-MEMORIAL.html` | ficha + fórmulas do "Ver Memorial" (não fixas); PMO/PMTA em MPa, kgf, bar |
| 7 | Memorial 1, 2, 3… | `MEMORIAL1/2/3.html` | cálculo de "Ver Memorial Completo"; folhas conforme tamanho do cálculo |
| 8 | Resumo do que foi inspecionado | `INSPECOES.html` | ficha + categoria |
| 9 | Verificação da documentação | `VERIFICACAO-DOCUMENTACAO.html` | só perguntas de documentação |
| 10 | Checklist 1, 2, 3 | `checklist1/2/3.html` | só as listas deles |
| 11 | **Fotos da documentação** | `FOTOS-DOCUMENTACAO.html` *(auto após checklist3)* | fotos da etapa de documentação (`fotosDocumentacao`) |
| 12 | Fotos do checklist | `CHECKLIST-FOTOS.html` *(auto-injetado após checklist3)* | fotos dos checklists 1-3 |
| 13 | Vis. Externo | `VISUAL-EXTERNO.html` | checklist "visual externo" |
| 14 | Registro Foto V.E | `VISUAL-EXTERNO-FOTOS.html` *(auto após VE)* | imagens do visual externo |
| 15 | Vis. Interno | `VISUAL-INTERNO.html` | checklist "visual interno" |
| 16 | Registro Foto V.I | `VISUAL-INTERNO-FOTOS.html` *(auto após VI)* | imagens do visual interno |
| 17 | Resultado inspeção e laudo | `CONCLUSAO.html` | — |
| 18 | ME | `ULTRASSOM.html` | medição de espessura |
| 19 | TH | `TESTE-HIDROSTATICO.html` | gráfico do TH + dados do equipamento |
| 20 | Fotos do TH | `TESTE-HIDROSTATICO-FOTOS.html` *(auto após TH)* | descrição breve + fotos do TH |
| 21 | Registro Seg. | `LIVRO-REGISTRO.html` *(TERMO-ABERTURA auto antes, se 1ª inspeção)* | livro de registro |
| 22 | Certificados de Calibração | `CERTIFICADO-CAL-MANOMETRO.html` / `CERTIIFCADO-CAL-PSV.html` | injetado ao fim (seleção em Modal) |

### §7-bis — Motor de assinatura do RELATÓRIO (carimbo flutuante, 14/07/2026)

- `public/rel-assinatura.js` (incluído em todas as folhas do relatório EXCETO `CAPA.html`,
  `SUMARIO.html`, `CAPA-LIVRO-REGISTRO.html` e `CERTIFICADO-CAL-*` — certificados têm assinatura
  própria/independente) sobrepõe **carimbos compactos** (engenheiro + técnico) em posição
  `absolute` logo acima do rodapé de cada `.page`/`.pagina` — **não empurra conteúdo**.
- **Filtro por folha:** cada assinante carimba só as folhas marcadas em `folhasRelatorio[]`
  (Funcionários; lista = `FOLHAS_RELATORIO_ASSINAVEIS` = `DOCUMENTOS_DISPONIVEIS` sem capa/sumário;
  default: Engenheiro todas, Inspetor nenhuma). Folhas auto-injetadas seguem a folha-pai
  (`*-FOTOS` → folha do ensaio; `FOTOS-DOCUMENTACAO`/`checklist1` → VERIFICACAO-DOCUMENTACAO;
  `CHECKLIST-FOTOS` → checklist3; `TERMO-ABERTURA` → LIVRO-REGISTRO, e no termo só o engenheiro).
- **Imutabilidade do relatório salvo:** na geração, `RelatorioMeta` congela `empresa` (cópia de
  `nr13_minha_empresa`) e `assinantes` (snapshots com nome, cargo, CREA, rubrica, camposExtras,
  folhasRelatorio). Os iframes do visualizador rodam com `&ctx=rel`; com esse param,
  `rel-empresa.js` e `rel-assinatura.js` usam os snapshots da meta — trocar rubrica/logo/cadastro
  depois NÃO altera relatório salvo. Sem `ctx=rel` (livro standalone etc.) ou sem snapshot
  (relatórios antigos), caem no dado vivo (`nr13_assinantes_rel_<TAG>` + `nr13_lista_phs`).
  Duplicar = relatório novo → snapshots refeitos com o estado atual; selects de assinante ficam
  desabilitados em relatório salvo (somenteLeitura).

---

## 8. Prontuário

O prontuário deve puxar automaticamente: o **cálculo** (memorial), o **croqui 2D**
(`nr13_croqui2d_<TAG>`), a **logo e dados da empresa** (`nr13_minha_empresa`), e os dados do
**engenheiro responsável** para **assinar** (`nr13_lista_phs`). `PAGINAS_PRONTUARIO`
(`src/features/prontuarios/tipos.ts`) define as 6 folhas, nesta ordem fixa:

1. `PRONT-ULTRASSOM.html` — grade de espessuras (ultrassom) + croqui (SVG longitudinal do croqui
   2D; fallback: PNG legado `nr13_croqui3d_` → "Croqui não gerado") + rastreabilidade dos
   instrumentos + responsabilidade técnica.
2. `PRONT-CROQUI2D.html` — croqui 2D cotado (SVG gerado em runtime) + tabela de dimensões reais.
3. `PRONT-FOLHA-DADOS.html` — prancha técnica do equipamento.
4. `PRONT-PRONTUARIO.html` — dados construtivos + categorização de risco.
5. `PRONT-CONTINUACAO.html` — procedimentos, dispositivos de segurança e pontos de atenção.
6. `PRONT-MEMORIAL.html` — resumo dos cálculos do memorial.

Rodapés das 6 folhas são **sem paginação** (nº de página/total não impresso).

**Motor de assinatura (prontuário — implementado 13/07/2026):** Funcionários (`nr13_lista_phs`)
guarda por funcionário: `funcao` (cargo exibido), `camposExtras[{rotulo,valor}]`,
`folhasProntuario[]`/`folhasRelatorio[]` (quais folhas ele assina — pré-setado no cadastro;
default: Engenheiro todas / Inspetor nenhuma, inclusive para registros antigos sem o campo).
O visualizador do prontuário tem selects de Engenheiro/Técnico que gravam
`nr13_assinantes_pront_<TAG>` (`{engenheiroId, tecnicoId}`) antes de remontar os iframes.
`public/pront-assinatura.js` (incluído nas 6 folhas, antes do script inline) preenche o bloco
"Responsabilidade Técnica" com nome, função, CREA/Registro, campos extras e a imagem da
assinatura, respeitando `folhasProntuario` de cada assinante (não assina a folha → coluna limpa).
**Fallback:** sem a chave de assinantes ou ambos vazios → a folha mantém a assinatura fictícia
de exemplo ("Fulano Da Silva"). **Relatório: motor próprio em modo carimbo (ver §7-bis).**
Certificados de calibração ainda usam o fluxo antigo (ver PENDENCIAS.md).

`PRONTUARIO-RECONSTITUICAO-1..4` **não fazem parte** do prontuário — seguem como folhas do
**relatório** (ver §7).

Ao abrir o visualizador do prontuário (`Prontuarios.tsx`, antes de montar os iframes), o app grava
`obterOuCriarMeta(tag)` em `nr13_prontuario_meta_<TAG>` (nº do relatório + data de emissão, reusado
entre reimpressões). O croqui vem direto de `nr13_croqui2d_<TAG>` — nada é regravado na abertura.

**Editor de Croqui 2D (ex-Modelador; render 3D removido em 11/07/2026 — sem three.js):** overlay
com formulário (`PainelElementos`) + preview 2D ao vivo (`gerarCroquis2d`, função pura sobre
`ModeloVaso`). O save alimenta a folha 1 (SVG longitudinal), a folha 2 (`nr13_croqui2d_<TAG>` —
SVGs substituem o desenho genérico do `PRONT-CROQUI2D.html`) e a folha 3 (`nr13_folha_dados_<TAG>`
— bocais, pesos e dimensões reais do `PRONT-FOLHA-DADOS.html`). Sem o modelo salvo, as folhas
mantêm o comportamento genérico/vazio de sempre (fallback).

**Croqui 2D é passo OBRIGATÓRIO do memorial:** ao salvar o memorial de vaso/autoclave
(`MemorialVaso.salvar`, exceto sufixo `gv`), o editor abre automaticamente com os dados do
memorial **pré-preenchidos** (`carregarOuPreCarregar` re-sincroniza Ø, espessuras, tampos,
material e bocais do `nr13_vaso_<TAG>`, preservando comprimento/virolas/suporte/posições já
digitados; comprimento é sugerido pelo volume de `nr13_cat_<TAG>` quando vazio). O botão
"Ver Memorial Completo" da ficha (`Equipamento.tsx`) também abre o editor antes do documento se
`nr13_croqui2d_<TAG>` não existir (cobre memoriais antigos).

---

## 9. Pendências conhecidas (gaps vs. esta estrutura)

> **LISTA VIVA: `PENDENCIAS.md` na raiz do repo** — checklist atual de pendências (deploy manual,
> fase do motor de assinatura, polimentos). REGRA: ao concluir um item de lá, REMOVER o item do
> arquivo e commitar (o arquivo encolhe até ser deletado). Os blocos abaixo são histórico
> detalhado; a lista viva é a fonte do que ainda falta.

> **Controle de Acesso multi-papel + Portal do Cliente + Sessão Única: CÓDIGO IMPLEMENTADO**
> (plano em `PLANO-CONTROLE-DE-ACESSO.md`). Pendências de DEPLOY (manuais, pelo dono do projeto):
> 1. Rodar `supabase/acesso_setup.sql` no SQL Editor do Supabase (idempotente; backfill
>    `org_id = user_id` mantém o comportamento atual até criar sub-logins).
> 2. Deploy das Edge Functions `org_admin` e `portal_cliente` (Dashboard → Edge Functions).
> 3. Conferir o trigger `handle_new_user`: não pode sobrescrever `org_id`/`papel`/`cliente_id`
>    (ver comentário no fim do acesso_setup.sql).
> O frontend tem fallback: antes do SQL, tudo segue por `user_id` (deploy do código é seguro).
> Peças: `src/services/{auth,storage,orgAdmin}.ts`, `src/pages/Acesso.tsx`, `src/pages/portal/*`,
> guards em `src/app/Rota*.tsx`, seção "Acesso ao Portal" em Empresas.

> **Redesign "Forja" (03/07/2026):** design system em `design/` (fonte da verdade visual) —
> paleta steel/âmbar, sidebar escura, Space Grotesk/IBM Plex (self-hosted), sprite SVG próprio
> (`src/components/Icone.tsx`, sem lucide/emoji). Novidades: Dashboard com vencimentos
> (`src/services/vencimentos.ts`), rota `/equipamentos` (lista; `/dashboard` é o painel),
> `/vencimentos`, `/livro-registro`, Calibrações→Rastreabilidade (merge de PDF no relatório via
> pdf-lib em `rastreabilidadeService.ts`), Acessos com permissões por módulo
> (`src/services/permissoes.ts`, aplicadas no menu/rotas do Layout).

> **Google Maps/Places nos clientes (03/07/2026): PENDÊNCIAS DE DEPLOY (manuais, pelo dono do projeto)**
> A tela "Empresas" usa a chave `VITE_GOOGLE_MAPS_KEY` (arquivo `.env`, NÃO commitado) para a
> busca de empresas (Places API New, REST) e o mapa do detalhe do cliente (Maps Embed API).
> 1. **Criar a variável `VITE_GOOGLE_MAPS_KEY` no ambiente de deploy** (Vercel/Netlify/etc. →
>    Environment Variables). O `.env` local não vai no push; sem a variável no build de produção,
>    busca e mapa ficam desativados (o resto da tela funciona normal).
> 2. **Restringir a chave no Google Cloud Console** (APIs & Services → Credentials → a chave):
>    - Application restrictions: **HTTP referrers**, com os domínios do app
>      (ex.: `https://SEU-DOMINIO/*` e `http://localhost:*` para dev).
>    - API restrictions: permitir SOMENTE **Places API (New)** e **Maps Embed API**.
>    **Por quê:** chaves `VITE_*` ficam embutidas no bundle JavaScript público — qualquer pessoa
>    que abrir o site consegue ler a chave. Sem restrição, ela pode ser usada por terceiros em
>    outros sites/apps, consumindo sua cota e **gerando cobrança no seu cartão do Google Cloud**.
>    Com a restrição por referrer, a chave só funciona a partir do seu domínio; com a restrição
>    de APIs, mesmo vazada não serve para outros serviços do Google.
> 3. No painel do Google Cloud, ativar as APIs **Places API (New)** e **Maps Embed API** no
>    projeto da chave (sem isso a busca retorna erro 403).

> **Painel Admin robusto (03/07/2026): PENDÊNCIA DE DEPLOY (manual)**
> Rodar `supabase/admin_stats.sql` no SQL Editor do Supabase (idempotente). Cria a função
> `admin_usage_stats()` (SECURITY DEFINER, só role admin) que agrega por usuário: equipamentos
> por tipo, inspeções, relatórios salvos, PDFs/impressões (contador `nr13_uso_contadores`,
> incrementado em Relatórios) e sub-logins criados. Sem o SQL, o painel funciona e essas
> colunas mostram "—". O aviso vermelho de expiração (≤30 dias) usa `nr13_acesso_expira_em`
> gravada no login — não depende do SQL.

> **Troca de senha pelo usuário (08/07/2026): PENDÊNCIA DE DEPLOY (manual, no painel Supabase)**
> O usuário troca a própria senha em três frentes: **"Trocar minha senha"** na tela de login
> (e-mail + senha atual + nova — SEM e-mail/SMTP, funciona sem nenhuma config), botão
> **"Trocar Senha"** na sidebar (logado; código por e-mail OU senha atual) e **"Esqueci minha
> senha"** na tela de login (código por e-mail). Superadmin segue resetando pelo painel Admin
> (`reset_password`) e o mestre pelo Acessos (`resetar_senha` da org_admin) — sem e-mail.
> Para o **código por e-mail** funcionar, configurar no Supabase Dashboard:
> 1. **Authentication → Email Templates → "Reset Password"**: o corpo do e-mail PRECISA conter
>    `{{ .Token }}` (código de 6 dígitos). O template padrão só tem `{{ .ConfirmationURL }}`
>    (link) — sem o `{{ .Token }}` o fluxo de código falha. Exemplo de corpo:
>    `<h2>Troca de senha</h2><p>Seu código de confirmação: <b>{{ .Token }}</b></p><p>Ele expira em 1 hora. Se você não pediu a troca, ignore este e-mail.</p>`
> 2. **SMTP próprio (recomendado p/ produção)**: Authentication → SMTP Settings. O e-mail
>    embutido do Supabase tem limite de ~2 mensagens/hora (só para testes) — em produção,
>    configurar um SMTP (Resend/Brevo/etc.) senão os códigos param de chegar.
> 3. Rate limit no app: 1 envio por minuto por usuário (cooldown de 60s na UI); código expira
>    em 1h (padrão "Email OTP Expiration" em Auth → Providers → Email).
> Enquanto o template não for ajustado, o usuário logado ainda troca a senha pela aba
> **"Senha atual"** do modal — esse caminho não usa e-mail nenhum.
> Código: `enviarCodigoTrocaSenha`/`trocarSenhaComCodigo`/`trocarSenhaComSenhaAtual` em
> `src/services/auth.ts`, `src/components/ModalTrocarSenha.tsx`, modo "recuperar" em Login.tsx.

Nenhuma pendência estrutural aberta. Itens já resolvidos:
- ✅ "Fotos da documentação" (folha #11): grupo `fotosDocumentacao` no `FormularioChecklist` +
  `FOTOS-DOCUMENTACAO.html`, auto-injetado após `checklist3` e antes de `CHECKLIST-FOTOS`.
- ✅ Base de enquadramento confirmada em kPa × m³ > 8 (§4).

Sugestões futuras (não bloqueiam): auditoria de responsividade mobile folha a folha; revisão de
`@media print` em cada template para garantir A4 exato sem corte/rodapé empurrado.

---

## 10. Convenções ao alterar o sistema

- Nova folha de relatório → criar HTML em `public/arquivos-inspecao/`, ler dados das chaves do §2 no
  `DOMContentLoaded`, e posicioná-la em `DOCUMENTOS_DISPONIVEIS` (ou na auto-injeção) conforme §7.
- Toda folha nova segue as regras de fotos/impressão/responsividade do §5.
- Qualquer dado novo que o usuário salve deve ser gravado em chave do §2 para poder ser injetado.
