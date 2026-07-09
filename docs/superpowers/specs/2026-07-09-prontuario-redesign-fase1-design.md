# Design — Redesign do Prontuário Técnico (Fase 1: Documentação)

Data: 2026-07-09. Aprovado pelo usuário ("sim aprovado! pode iniciar!") após 4 decisões fechadas
via perguntas. Exemplos visuais de referência em `C:\Users\felipe\Downloads\DOCUMETNACAO-PRONTUARIO\`
(NOTA: pasta tem typo "DOCUMETNACAO"): `EXEMPLO-FINAL01.png`, `EXEMPLO-FINAL02.png`,
`folha-prontuario.png`, `folha de dados.png`, `vista 2D com vista 3D perspectiva.jpeg`,
`Captura de tela 2026-07-09 170016.png` (prontuário antigo em papel).

## Escopo

**Fase 1 (esta spec):** redesign completo das folhas do prontuário — 6 folhas novas substituem
PRONT-P1/P2/P2B/P3/P4/CARACTERIZACAO. **Somente vaso de pressão** ganha o layout novo completo
(croqui 3D/2D); autoclave e caldeira continuam gerando prontuário com as mesmas folhas, com croqui
3D/2D omitido ou placeholder quando não aplicável.

**Fase 2 (spec futura, NÃO nesta):** modelador 3D/2D estilo PVElite (inserir saias, pés, bocais,
tampos; rotação; translúcido; pontos de espessura em torno de bocais/tampos/costura) + folha de
dados completa alimentada pelo modelador.

## Decisões fechadas com o usuário

1. **Substitui tudo** — folhas antigas saem de `PAGINAS_PRONTUARIO`; arquivos antigos podem ficar
   no repo (não referenciados) para histórico.
2. **Croqui 3D:** usar `CroquiVaso3D.tsx` atual (three.js, captura base64) nesta fase; fase 2
   evolui para modelo completo.
3. **Seções texto** (procedimentos de inspeção, dispositivos de segurança, atenção): folha própria
   (`PRONT-CONTINUACAO.html`), texto padrão editável.
4. **Tabela de dimensões da folha 2:** dimensões REAIS do equipamento (memorial + ficha), não
   catálogo genérico.
5. **Assinatura:** fictícia por enquanto (motor de assinatura real vem depois, para todo o sistema).
6. **Rodapé das folhas: SEM paginação** (regra explícita do usuário para folha 1; aplicar em todas
   as folhas novas do prontuário — nenhuma exibe número de página).

## Arquitetura

Padrão idêntico ao relatório (CLAUDE.md §2): templates HTML estáticos em
`public/arquivos-prontuario/`, lidos em iframe com `?tag=<TAG>`, cada template lê localStorage no
`DOMContentLoaded`. `Prontuarios.tsx` continua sendo a tela (formulário → visualizador → impressão
via `printService`). `PAGINAS_PRONTUARIO` em `src/features/prontuarios/tipos.ts` passa a ser:

```ts
export const PAGINAS_PRONTUARIO = [
  'PRONT-ULTRASSOM.html',
  'PRONT-CROQUI2D.html',
  'PRONT-FOLHA-DADOS.html',
  'PRONT-PRONTUARIO.html',
  'PRONT-CONTINUACAO.html',
  'PRONT-MEMORIAL.html',
] as const;
```

### Identidade visual (todas as folhas)

- Base visual = `public/arquivos-inspecao/ULTRASSOM.html` (fonte Inter, `--blue-data: #0033a2`
  para valores, cabeçalho `header-table` com logo | título | bloco info).
- Bloco info do cabeçalho: "Relatório nº" `REL-<numero>` + "Data de Emissão" (na folha
  PRONT-PRONTUARIO: "RASTREABILIDADE REL-..." + "DATA DA INSPEÇÃO", igual print).
- Rodapé padrão (todas as folhas): faixa preta dupla com nome da empresa + linha
  "endereço • CNPJ • CEP" + "Telef • E-mail" (dados de `nr13_minha_empresa`). **SEM número de
  página.**
- Bloco "Responsabilidade Técnica" (folhas 1 e 2, e onde indicado): duas colunas com linha de
  assinatura, nome, título, CREA. Dados FICTÍCIOS fixos nesta fase:
  esquerda "Fulano Da Silva / Engenheiro De Equipamentos / CREA: 12151566" com imagem de
  assinatura manuscrita SVG inline; direita "Fulano Da Silva / Tecnico em Mecanica /
  CREA: 12151566" sem imagem. Estrutura em bloco reutilizável (mesmo markup/classe em todas as
  folhas) para o futuro motor de assinatura trocar fácil.
- Impressão A4 exata (CLAUDE.md §5): `.page` 297mm, overflow hidden, sem corte, sem vazio.

### Número do relatório e data

- Ao abrir o visualizador, `Prontuarios.tsx` grava `nr13_prontuario_meta_<TAG>`:
  `{ numero: 'REL-' + Date.now(), emissao: dd/mm/aaaa }`. Se já existir para a TAG, REUSA
  (número estável entre reimpressões; regenera só se usuário gerar prontuário novo).
- Todas as folhas leem essa chave para o cabeçalho.

## Folha 1 — `PRONT-ULTRASSOM.html` (réplica EXEMPLO-FINAL01)

Cabeçalho: logo | "RELATÓRIO DE ULTRASSOM / MEDIÇÃO DE ESPESSURA" | REL nº + Data de Emissão.

1. **INFORMAÇÕES DO COMPONENTE AVALIADO** — tabela: EQUIPAMENTO (tipo por extenso), T.A.G, ÁREA
   (área/localização da ficha); ESPESSURA NOMINAL (MM) casco/tampos (do memorial `nr13_calc_<TAG>`
   componentes tNom, fallback ficha), ANO DE FABRICAÇÃO, MATERIAL (material do casco).
2. **INFORMAÇÕES PARA O ENSAIO** — APARELHO/Nº DE SÉRIE, ACOPLANTE, TEMP. DA SUPERFÍCIE (°C),
   ESTADO DA SUPERFÍCIE, TIPO CABEÇOTE, VELOCIDADE SÔNICA. Fonte: `nr13_med_esp_<TAG>` (campos do
   FormularioMedicaoEspessura) com fallback "—"/valores padrão do exemplo (AMBIENTE, 0000m/s).
3. **LOCALIZAÇÃO DOS PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (MM)** — layout 2 colunas:
   - ESQUERDA: grade TAMPO SUPERIOR (1 linha) / CASCO (4 linhas) / TAMPO INFERIOR (1 linha) ×
     colunas 0°/90°/180°/270°, células amarelas (`--highlight-yellow`) com valores de
     `nr13_med_grid_<TAG>` (mesma fonte das folhas atuais). Mínimo de cada bloco destacado.
   - DIREITA: croqui 3D — `<img>` de `nr13_croqui3d_<TAG>` (ver fluxo abaixo). Sem croqui →
     bloco com contorno tracejado "Croqui não gerado".
4. **INSTRUMENTO DE MEDIÇÃO UTILIZADO** (rastreabilidade, abaixo da tabela) — tabela: PADRÃO
   (nome), Nº SÉRIE, Nº CERTIFICADO, VALIDADE — de `listarRastreabilidades()` (chaves
   `nr13_rastreab_*`; template lê direto por prefixo no localStorage). Linha de nota com selo:
   "O instrumento de medição utilizado foi calibrado por laboratório acreditado pela RBC/INMETRO,
   com certificado de calibração válido, garantindo a rastreabilidade metrológica e a
   confiabilidade dos resultados." Sem rastreabilidade cadastrada → linha única "—".
5. **Responsabilidade Técnica** + rodapé (sem paginação).

### Fluxo do croqui 3D

- `Prontuarios.tsx` já captura base64 do `CroquiVaso3D` em `dados.croqui`. Novo: ao salvar/gerar,
  gravar também em `nr13_croqui3d_<TAG>` (string base64) para os templates lerem.
- Compat: se `nr13_croqui3d_<TAG>` vazio mas `nr13_prontuario_<TAG>.croqui` existir, template usa o
  segundo.

## Folha 2 — `PRONT-CROQUI2D.html` (réplica EXEMPLO-FINAL02)

Cabeçalho: logo | "FOLHA DE DADOS E CROQUI DETALHADO" | REL nº + data.

1. **Croqui 2D em SVG inline**, gerado por JS no template a partir das dimensões reais:
   - Orientação pela ficha/prontuário: vaso HORIZONTAL (corpo deitado com 2 tampos elípticos,
     como o exemplo) ou VERTICAL (corpo em pé). Heurística: campo orientação da ficha se existir;
     senão altura>diâmetro → vertical.
   - Callouts com setas: BOCA DE INSPEÇÃO (topo), VÁLVULA SEGURANÇA e PLACA IDENTIFICAÇÃO
     (linha superior), MANÔMETRO (frente), texto lateral de nota (igual exemplo: "A rede
     industrial fornece os vasos de pressão com furação para fixação dos mesmos").
   - Cotas A (Ø interno), B (comprimento total), C (altura total), D (bocal) com linhas de
     cota e setas, valores reais em mm quando disponíveis.
   - Desenho proporcional ao equipamento (escala pelo maior lado), traço técnico fino cinza-escuro.
2. **Tabela "Dimensão do Vaso de Pressão"** à direita do croqui — dimensões REAIS: linhas
   A Ø interno (mm), B Comprimento (mm), C Altura (mm), Espessura casco (mm), Espessura tampos
   (mm), Volume/Capacidade (L). Fontes: `nr13_prontuario_<TAG>.dimensoes[0]`, memorial
   (`nr13_calc_<TAG>`), categoria (`nr13_cat_<TAG>` volume). Valor ausente → "—".
3. **Responsabilidade Técnica** + rodapé (sem paginação).

## Folha 3 — `PRONT-FOLHA-DADOS.html` (estilo PVElite, prints "folha de dados" e "vista 2D...")

Anexo técnico em grade (blocos com título em faixa preta, estilo do print):

- **DADOS TÉCNICOS DO EQUIPAMENTO** — condições de projeto (pressão, temperatura, sobr. corrosão,
  Ø interno, material, eficiência) + resultados (PMTA conjunto, teste hidro, peso se houver) +
  COMPONENTES (linhas "CASC / ELIP ..." com Ø×comprimento×t= das espessuras do memorial).
- **ORIENTAÇÃO DE BOCAIS — VISTA DE TOPO** — círculo SVG com marcações 0°/90°/180°/270° e rosa
  norte. Fase 1: círculo sem bocais plotados (modelador da fase 2 plota).
- **LISTA DE BOCAIS** — tabela TAG | SERVIÇO | QTD | DN | FLANGE | OBS. Fase 1: linhas vazias.
- **LISTA DE SOLDAS** e **TABELA DE PESOS** — estrutura pronta, valores "—" (fase 2 preenche).
- **ESPESSURAS POR COMPONENTE** — tabela componente | t nominal | t requerida | CA, preenchida do
  memorial (componentes[] com tNom/tReqMm/ca) incluindo GV quando existir (prefixo "GV — ").
- **NOTAS TÉCNICAS** — lista numerada padrão (cotas em mm; soldas conforme ASME IX; teste
  hidrostático conforme UG-99; desenho AS-BUILT — texto do exemplo), editável.
- **Carimbo de desenho** (canto inferior direito, estilo prancha): REV/DESCRIÇÃO/DATA/POR, cliente,
  TAG, nº desenho, fabricante, código projeto (ASME VIII Div.1 + NR-13), escala, data, selo
  "AS-BUILT". Dados da ficha/empresa; campos sem fonte → "—".
- Rodapé (sem paginação).

## Folha 4 — `PRONT-PRONTUARIO.html` (réplica folha-prontuario.png)

É o `public/arquivos-inspecao/PRONTUARIO.html` do relatório trazido para o prontuário:
copiar o template e adaptar SOMENTE: (a) cabeçalho info = RASTREABILIDADE REL-nº + DATA DA
INSPEÇÃO (data emissão do meta), (b) fontes de dados = chaves diretas por TAG (não depende de
`nr13_relatorio_meta_atual`/container de inspeção — lê `?tag=` da URL), (c) rodapé sem paginação.
Seções mantidas exatamente: DADOS GERAIS (contratante + endereço de `nr13_emp_<TAG>`), ASPECTOS
GERAIS DO EQUIPAMENTO, ASPECTOS CONSTRUTIVOS, ASPECTOS OPERACIONAIS, tabelas PMO/PMTA/PTH em
MPA|PSI|KGF/CM³, **CATEGORIZAÇÃO DO EQUIPAMENTO** (relação P×V kPa·m³, resultado, classificação
fluido, grupo potencial de risco, categoria — de `nr13_cat_<TAG>`), LEGENDA.

## Folha 5 — `PRONT-CONTINUACAO.html` (seções texto, estilo prontuário antigo em papel)

Seções numeradas com texto padrão pré-preenchido (contenteditable), inspirado no print do
prontuário antigo (Captura 170016):

- **PROCEDIMENTOS DE INSPEÇÃO** — parágrafo padrão (certificação de conformidade NR-13, exame
  conforme portaria, periodicidades por categoria).
- **DISPOSITIVOS DE SEGURANÇA** — válvula de segurança, material de construção/corpo, pressão
  máxima de abertura (puxa PMTA do memorial como sugestão).
- **ATENÇÃO** — lista numerada dos itens de atenção do exemplo (8.1–8.15 resumidos): dados
  assinalados na reconstituição, verificação semanal da válvula, aferição anual de manômetro,
  novo teste hidrostático por conta do usuário, inspeções por profissional habilitado, não operar
  acima da PMTA, etc. Texto padrão completo definido no plano (sem placeholder).
- Linha final: **Responsável** (assinatura fictícia) + **CREA nº** — mesma estrutura de bloco de
  assinatura das folhas 1 e 2.
- Rodapé (sem paginação). Se o texto padrão não couber em uma folha A4, o plano divide em duas
  folhas fixas (CONTINUACAO e CONTINUACAO-2) — sem paginação dinâmica nesta fase.

## Folha 6 — `PRONT-MEMORIAL.html` ("RESUMO DE CÁLCULOS DA PMTA E ESPESSURA")

Cópia adaptada de `public/arquivos-inspecao/RESUMO-MEMORIAL.html`: mesma lógica de
`buildResumoDinamico` (componentes[] de `nr13_calc_<TAG>` + merge GV com prefixo "GV — " e
`data-gv` fora do laudo limitante — regra CLAUDE.md §3), título da folha "RESUMO DE CÁLCULOS DA
PMTA E ESPESSURA", cabeçalho/rodapé do prontuário (REL nº, sem paginação). Lê `?tag=` da URL em
vez de depender de meta de relatório.

## Mudanças em código React

- `src/features/prontuarios/tipos.ts` — nova `PAGINAS_PRONTUARIO` (6 folhas).
- `src/pages/Prontuarios.tsx`:
  - gravar `nr13_prontuario_meta_<TAG>` ao abrir visualizador (reusar se existir);
  - gravar `nr13_croqui3d_<TAG>` junto com `dados.croqui`;
  - visualizador continua igual (iframes + `?tag=`), impressão via printService inalterada.
- `src/features/prontuarios/prontuarioService.ts` — helper `gravarMetaProntuario(tag)` e
  `gravarCroqui3d(tag, b64)` (com sync via `salvar`).
- CLAUDE.md §2/§8 — novas chaves `nr13_prontuario_meta_<TAG>`, `nr13_croqui3d_<TAG>`; §8
  atualizado com as 6 folhas novas.

## Fora de escopo (fase 2+)

- Modelador 3D/2D interativo (componentes: saia, pés, bocais, tampos; rotação; translúcido;
  pontos de espessura plotados em torno de bocais/tampos/costura longitudinal).
- Preenchimento real de lista de bocais/soldas/pesos na folha de dados.
- Motor de assinatura digital (todas as documentações).
- Prontuário de reconstituição (folhas PRONTUARIO-RECONSTITUICAO-* seguem como estão no relatório).

## Testes

- vitest: `prontuarioService` (meta estável entre chamadas; croqui gravado; grid mínima já coberta).
- Verificação visual navegador (Chrome) folha a folha contra os PNGs de exemplo, com equipamento
  real (VASO A23) — checagem A4 sem corte/vazio, dados injetados, ausências viram "—".
- `npm test` + `npm run build` verdes; lint sem erros novos (baseline 7 pré-existentes).

## Execução

Subagent-driven development (implementador + revisor por tarefa; revisão final de branch no modelo
mais capaz). Ledger em `.superpowers/sdd/progress.md`.
