# Updates do Sistema NR-13 — Design

Data: 2026-07-19
Status: aprovado pelo usuário

Cinco features independentes. Cada uma tem dono de arquivo exclusivo para permitir
implementação paralela sem conflito.

---

## 1. Prontuário do fabricante (upload de PDF)

**Problema:** quando o engenheiro já possui o prontuário do fabricante em PDF, hoje não há
onde guardá-lo. O sistema só sabe gerar o prontuário próprio (as 6 folhas HTML).

**Chave nova:** `nr13_pront_fab_<TAG>`

```ts
interface ProntuarioFabricante {
  nome: string;        // nome original do arquivo
  tamanho: number;     // bytes, para exibir "2,4 MB"
  pdfBase64: string;   // data URL completo: "data:application/pdf;base64,..."
  enviadoEm: string;   // ISO
}
```

O sufixo `_<TAG>` é obrigatório: a Edge Function `portal_cliente` filtra as chaves por
`chave.endsWith('_' + tag)`, não por whitelist de nome. Uma chave com esse formato chega ao
Portal do Cliente sem redeploy da function.

**Upload:** replica o padrão já usado em `nr13_rastreab_<id>`
(`src/features/calibracoes/AbaRastreabilidade.tsx`): `<input type="file" accept="application/pdf">`
oculto, `FileReader.readAsDataURL`, validação de `file.type` e teto de **8 MB** verificado
antes de gravar.

**Compressão:** o PDF em base64 é gravado inteiro dentro da coluna `valor` do Supabase a cada
`salvar()`. 8 MB de PDF viram ~11 MB de string. Por isso o teto, mais um aviso no modal com
link para `https://www.ilovepdf.com/pt/comprimir_pdf` (`target="_blank"`,
`rel="noopener noreferrer"`).

**Superfícies:**
- Ficha do equipamento: nova `<section className="equipamento-secao">` em `Equipamento.tsx`,
  seguindo o padrão de `VidaRemanescente.tsx` (bloco com header + botão de ação).
- Tela Prontuários: bloco de presença/ausência ao lado do botão de Croqui 2D, mesmo padrão de
  `temCroqui2d` em `Prontuarios.tsx`.
- Portal do Cliente: item novo na aba "Prontuário" de `PortalAtivo.tsx`.

**Visualização:** o PDF não é um template HTML, então não passa pelo caminho
`abrirProntuario()`/`abrirRegistro()` (que montam iframes de `/arquivos-prontuario/*.html`).
Abre-se o data URL direto — `<iframe src={dataUrl}>` para visualizar, `<a download>` para baixar.

---

## 2. Pontos extras de medição de espessura (ultrassom)

**Problema:** a grade é rígida nos dois lados. `FormularioUltrassom.tsx` tem
`COMPONENTES` fixo com 6 entradas (`ts`, `c1`–`c4`, `ti`) e `ULTRASSOM.html` tem 6 `<tr>`
hardcoded (`linha1-0` … `linha6-270`), ligados pelo mapa `COMP_PARA_LINHA`. Não há como
acrescentar um ponto.

**Modelo novo:** `COMPONENTES` deixa de ser constante de módulo e passa a fazer parte do estado
salvo, agrupado por região:

```ts
interface PontoME { id: string; rotulo: string; regiao: 'ts' | 'casco' | 'ti' }
```

IDs novos seguem a numeração existente (`c5`, `c6`, `ts2`, `ti2`) para que nenhum dado já salvo
mude de significado. O `Record<string, Record<Angulo, string>>` de `medidas` não muda de forma —
só passa a ter mais chaves.

**Retrocompatibilidade:** container sem lista de pontos salva assume os 6 pontos originais. Dado
antigo abre idêntico ao que era.

**Folha `ULTRASSOM.html`:** as `<tr>` passam a ser geradas por JS a partir dos pontos, em vez de
fixas no HTML. O mapa `COMP_PARA_LINHA` deixa de existir. `destacarMenoresEspessuras()` continua
agrupando por região e gravando os mínimos em `nr13_med_esp_<TAG>` (`sup`/`casco`/`inf`) e a
grade completa em `nr13_med_grid_<TAG>` — os consumidores dessas chaves não mudam.

**Paginação:** quando os pontos não couberem em uma folha A4, o documento se divide, seguindo
exatamente o padrão já usado nas folhas de foto: uma função `expandirFolhasUltrassom()` conta as
linhas e gera N entradas `ULTRASSOM.html?upag=k&uof=N`; o template lê `upag` e renderiza só a
sua fatia. É o mesmo mecanismo de `expandirFolhasFoto()` com `fpag`.

**`PRONT-ULTRASSOM.html`:** já itera dinamicamente sobre `nr13_med_grid_<TAG>` sem limite de
linhas, mas a folha é uma única `.page` com `height: 297mm; overflow: hidden` — linhas extras
seriam cortadas em silêncio. Ganha redução progressiva de fonte/altura de linha até caber, com
aviso visível caso ainda estoure.

**Restrição de layout:** as folhas de `public/arquivos-inspecao/` e `public/arquivos-prontuario/`
não podem usar `display:grid`, `display:flex` nem `gap` — o html2canvas (caminho do PDF e da
impressão) não suporta grid e quebra flex. Usar `display:table`/`table-cell`, `inline-block`,
`text-align`, `vertical-align`.

---

## 3. Livro de registro editável antes de salvar

**Problema:** hoje não existe edição nenhuma. `adicionarEntradaLivroAuto` grava a entrada já
definitiva ao salvar o relatório, e `adicionarEntradaLivroManual` grava direto pelo formulário.
O `contenteditable` que existe em `LIVRO-REGISTRO.html` e `TERMO-ABERTURA.html` é decorativo:
nenhum listener grava o texto editado de volta, e o `textContent` é sobrescrito a cada
`DOMContentLoaded`.

**Campos novos em `LivroEntrada`:**

```ts
lacrado?: boolean;      // ausente/false = rascunho editável; true = imutável
retificaDe?: string;    // id da entrada que este registro corrige
```

**Ciclo de vida:**
1. A entrada nasce como rascunho (`lacrado` ausente) — tanto a automática quanto a manual.
2. Enquanto rascunho: editável na timeline de `LivroRegistro.tsx` e diretamente na folha
   `LIVRO-REGISTRO.html`, onde o `contenteditable` passa a persistir de verdade (listener de
   `blur` grava em `nr13_livro_<TAG>`).
3. Botão "Lacrar registro", com confirmação explícita. Depois disso a entrada é imutável:
   `contenteditable` desligado, campos em modo leitura, sem caminho de edição ou exclusão.
4. Erro em registro lacrado se corrige com um **registro de retificação** — entrada nova com
   `retificaDe` apontando para a anterior. Ambas permanecem no livro, que é o comportamento
   correto de um livro de registro legal.

**Compatibilidade:** entradas antigas não têm o campo `lacrado`. Como o livro sempre foi
efetivamente imutável até agora, elas são tratadas como **lacradas** (a leitura precisa
diferenciar "ausente por ser antiga" de "ausente por ser rascunho novo" — o discriminador é a
presença do campo no registro, gravado explicitamente como `false` nas entradas novas).

**Padrão de imutabilidade:** segue o que já existe em `RelatorioMeta` (snapshots de `empresa` e
`assinantes` congelados na geração) e no estado `somenteLeitura` de `Relatorios.tsx`.

---

## 4. Dashboard de vencimentos vivo

**Bug real localizado:** `Dashboard.tsx:46` usa
`useMemo(() => listarVencimentos(), [versaoDados])` com um listener de `window.focus` que
incrementa `versaoDados`. Mas `Vencimentos.tsx:27` usa
`useMemo(() => listarVencimentos(), [])` — array de dependências vazio e **nenhum listener**.
Essa tela só recalcula ao montar. É a origem do dado velho relatado.

Além disso, o `focus` só cobre o caso de outra aba/janela. Salvar um relatório e navegar dentro
da mesma aba depende do remount da rota — funciona por acidente, não por desenho.

**Solução:**
- Módulo novo `src/services/eventos.ts`: um `EventTarget` simples com
  `emitirDadosAlterados()` / `assinarDadosAlterados(cb)`.
- Hook `useVencimentos()` que encapsula `listarVencimentos()`, o listener de `focus` e a
  assinatura do evento. Dashboard e Vencimentos passam a usar o mesmo hook.
- `relatoriosService.salvarNoHistorico()` emite o evento após gravar. Como
  `proximaInspecaoInterna`/`proximaInspecaoExterna` do `meta` são exatamente o que
  `vencimentos.ts:87-91` consome, o painel reflete a data nova na hora.

Cobre os três casos: mesma aba sem remount, outra aba (via `focus`), e navegação normal.

---

## 5. Importação de equipamentos por planilha

**Dependência:** `xlsx` (SheetJS) **0.20.3, instalada do CDN oficial**
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), não do npm. O pacote publicado no npm
está congelado em 0.18.5 e carrega duas vulnerabilidades altas sem correção disponível
(GHSA-4r6h-8v6p-xvw6 prototype pollution, CVSS 7.8; GHSA-5pgg-2g8v-p4x9 ReDoS, CVSS 7.5). Como a
feature parseia arquivo fornecido pelo usuário, esse é exatamente o vetor exposto. **Não trocar
por `npm install xlsx`.** Um parser só cobre .xlsx, .xls, .ods e .csv.

**Colunas obrigatórias:** `tag`, `tipo`, `fabricante`, `numero_serie`, `ano`, `cliente`
**Colunas opcionais:** `pmta`, `volume`, `diametro`, `comprimento`, `material`, `espessura`,
`local`, `fluido`, `pressao_projeto`, `temperatura`, `codigo_projeto`, `observacoes`

Cabeçalhos são normalizados (minúsculas, sem acento, espaço/hífen → `_`), então "Nº Série",
"numero serie" e "numero_serie" são a mesma coluna.

**Validação por linha, antes de gravar qualquer coisa:**
- `tag` vazia → linha rejeitada.
- `tipo` fora de `vaso` / `autoclave` / `caldeira` → linha rejeitada.
- TAG duplicada (já existe em `nr13_info_<TAG>` ou repetida dentro da própria planilha) →
  **pulada e reportada**, nunca sobrescrita.
- Linhas válidas e inválidas convivem: as válidas são importadas, as rejeitadas aparecem no
  relatório final com número da linha e motivo.

**Gravação:** `nr13_info_<TAG>` com o shape de `InfoEquipamento`, mais `nr13_emp_<TAG>` quando a
coluna `cliente` vier preenchida. Não existe índice de equipamentos — a listagem varre por
prefixo — então gravar essas chaves basta para o equipamento aparecer.

**Interface:**
- Botão "Importar planilha" ao lado de "Criar equipamento" em `Equipamentos.tsx`.
- Drag-and-drop real sobre a lista (`onDragOver`/`onDragLeave`/`onDrop`). Não existe nenhum
  drag-and-drop no app hoje; o `.gallery-add-dropzone` é só um `<label>` estilizado.
- Modal explicativo reusando `.modal-overlay`/`.modal-content`/`.modal-body`/`.modal-actions`
  de `equipamento.css`: instruções e tabela de colunas à esquerda, **ilustração SVG da planilha
  à direita** mostrando o cabeçalho esperado.
- Barra de progresso determinística, criada do zero (o design system só tem `.spinner` e
  `.nr-save-overlay`), usando os tokens de cor existentes.
- Relatório final: X criados, Y pulados por TAG duplicada, Z rejeitados com motivo.

**Ícones:** o sprite é inline em `src/components/Icone.tsx` (union `NomeIcone` + dicionário
`PATHS`, viewBox 24×24). O projeto não usa lucide nem emoji, e não há logotipos de marca no
sprite. Serão desenhados ícones genéricos de planilha no mesmo traço, diferenciados por cor
(Excel verde, Sheets verde, LibreOffice azul, CSV neutro), **sem reproduzir logotipo
registrado** de nenhuma das empresas.

---

## Divisão de arquivos (implementação paralela)

| Frente | Arquivos exclusivos |
|---|---|
| 1 Prontuário fabricante | `features/equipamento/ProntuarioFabricante.tsx` (novo), `pages/Equipamento.tsx`, `pages/Prontuarios.tsx`, `pages/portal/PortalAtivo.tsx`, `features/equipamento/equipamento.css` |
| 2 Ultrassom | `features/inspecoes/formularios/FormularioUltrassom.tsx`, `arquivos-inspecao/ULTRASSOM.html`, `arquivos-prontuario/PRONT-ULTRASSOM.html`, `features/relatorios/ultrassomPaginacao.ts` (novo), `pages/Relatorios.tsx` |
| 3 Livro | `features/relatorios/relatoriosService.ts`, `features/relatorios/tipos.ts`, `pages/LivroRegistro.tsx`, `arquivos-inspecao/LIVRO-REGISTRO.html` |
| 4 Dashboard | `services/eventos.ts` (novo), `services/vencimentos.ts`, `pages/Dashboard.tsx`, `pages/Vencimentos.tsx` |
| 5 Import planilha | `features/equipamento/ModalImportarPlanilha.tsx` (novo), `features/equipamento/importarPlanilhaService.ts` (novo), `features/equipamento/importar.css` (novo), `pages/Equipamentos.tsx`, `components/Icone.tsx` |

Duas dependências cruzadas, resolvidas por delegação explícita:
- A frente 4 precisa de uma linha de emissão de evento em `relatoriosService.ts`, que pertence à
  frente 3 — a frente 3 adiciona essa linha.
- A frente 2 não toca `relatoriosService.ts`; a paginação vai em módulo próprio, conectado em
  `Relatorios.tsx`.

## Verificação

Cada frente valida com `npm run build` (o `tsc -b` do deploy é mais estrito que
`tsc --noEmit`). As folhas alteradas (frentes 2 e 3) são validadas **rasterizando de verdade**
com html2canvas no navegador, não por screenshot do DOM — é o único jeito de flagrar a quebra
de grid/flex no caminho do PDF.
