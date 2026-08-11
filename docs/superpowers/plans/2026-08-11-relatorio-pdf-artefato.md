# Relatório salvo como ARTEFATO (PDF imutável no bucket) — Plano de implementação

> **Para quem executa:** cada etapa termina em algo testável e commitável. TDD: teste que
> falha → implementação mínima → teste passa → commit.

**Goal:** ao salvar, o relatório deixa de ser uma receita re-renderizada e passa a ser um PDF
imutável no bucket, com SHA-256, servido como arquivo em toda visualização histórica.

**Arquitetura:** gerar o PDF no "Salvar" → subir para `<org>/relatorios/<id>.pdf` pela mesma
fila offline das fotos → gravar `pdfRef` + `sha256` no `RelatorioSalvo`. A partir daí,
visualizar/imprimir/baixar/portal servem o arquivo. `documentos`/`meta` ficam só para
auditoria.

**Stack:** html2canvas + jsPDF (já existentes), `crypto.subtle.digest('SHA-256')`,
`services/fotos.ts` (`salvarArquivo`/`baixarFoto`), bucket `inspecao`.

## Restrições globais

- **Nunca marcar como salvo sem o PDF confirmado.** Falha em qualquer etapa = não salvou.
- **Offline não pode perder o relatório nem mentir.** Estado explícito, nunca "salvo" falso.
- **Legado não quebra:** relatório sem `pdfRef` continua no fluxo antigo, intacto.
- **Template novo não pode alterar relatório com `pdfRef`.**
- **Bucket:** caminho começa em `<org_id>/`, senão a policy `inspecao_leitura` não isola.
- **Trial/assinatura:** `avisarBloqueioDocumentos()` já é o funil de bloqueio; a geração no
  salvar NÃO pode ser bloqueada por ele (senão conta em trial não consegue salvar) — só o
  download/impressão continuam bloqueados.

---

## Mapeamento — o que existe hoje

| Arquivo | Papel hoje | Muda? |
|---|---|---|
| `features/relatorios/tipos.ts` | `RelatorioSalvo { id, tagVaso, nome, tipo, data, documentos, meta, status }` | **sim** — ganha `pdfRef`, `sha256`, `geradoEm`, `paginas`, `livroSnapshot` |
| `features/relatorios/pdfService.ts` | `exportarPdf()` rasteriza e faz `pdf.save()` direto | **sim** — extrair `gerarPdfBytes()` que DEVOLVE bytes + progresso |
| `features/relatorios/relatoriosService.ts` | `salvarNoHistorico`, `listarHistorico`, `adicionarEntradaLivroAuto` | **sim** — congelar livro |
| `pages/Relatorios.tsx:529 salvarHistorico()` | monta `RelatorioSalvo` e grava | **sim** — passa a gerar/subir antes |
| `pages/Relatorios.tsx:394 visualizar()` | remonta iframes do relatório salvo | **sim** — com `pdfRef`, abre o PDF |
| `pages/Relatorios.tsx` botões Imprimir/Baixar | `imprimirRelatorio` / `exportarPdf` | **sim** — com `pdfRef`, servem o arquivo |
| `pages/portal/PortalAtivo.tsx` | monta iframes do relatório | **sim** — com `pdfRef`, mostra o PDF |
| `services/fotos.ts` | `salvarArquivo` (cofre local + fila + upload) | não — reusar |
| `services/fotoStore.ts` | cofre IndexedDB, fila de pendentes | não — reusar |
| `features/documentos/somenteLeituraDoc.ts` | trava de DOM | fica (protege a MONTAGEM, antes do save) |

**Chaves que hoje derivam o relatório salvo e por isso derivam com ele** (o problema):
`nr13_info_`, `nr13_calc_`, `nr13_cat_`, `nr13_emp_`, `nr13_fotos_`, `nr13_med_esp_`,
`nr13_med_grid_`, `nr13_laudo_`, `nr13_livro_`, `nr13_vaso_*`, `nr13_croqui2d_`, container.

---

## Etapa 1 — `gerarPdfBytes`: o pipeline devolve bytes, não baixa

**Arquivos:** `features/relatorios/pdfService.ts`, teste `__tests__/pdfArtefato.test.ts`

`exportarPdf` hoje termina em `pdf.save()`. Extrair o miolo para uma função que devolve
`Uint8Array` e aceita `onProgresso(feito, total)`. `exportarPdf` passa a ser um invólucro
fino que chama a nova função e baixa — comportamento atual preservado byte a byte.

Assinatura produzida:

```ts
export async function gerarPdfBytes(
  containerSelector: string,
  opts: { rastreabilidades?: boolean; documentos?: string[];
          onProgresso?: (feito: number, total: number) => void } = {},
): Promise<{ bytes: Uint8Array; paginas: number; falhasAnexo: string[] }>
```

**Cuidado:** `avisarBloqueioDocumentos()` fica em `exportarPdf` (download), NÃO em
`gerarPdfBytes` — salvar não pode ser bloqueado por trial.

## Etapa 2 — `artefatoRelatorio.ts`: hash + upload + verificação

**Arquivos:** criar `features/relatorios/artefatoRelatorio.ts`, teste
`__tests__/artefatoRelatorio.test.ts`

```ts
export interface PdfArtefato {
  pdfRef: RefFoto;            // { bucket, path, mimeType, tamanho }
  sha256: string;             // hex minúsculo
  geradoEm: string;           // ISO
  paginas: number;
}
export async function sha256Hex(bytes: Uint8Array): Promise<string>
export async function publicarArtefato(
  relatorioId: string, bytes: Uint8Array, paginas: number,
): Promise<PdfArtefato>
export async function baixarArtefato(a: PdfArtefato): Promise<Blob | null>
export async function verificarIntegridade(a: PdfArtefato): Promise<boolean>
```

Caminho: `<org>/relatorios/<relatorioId>.pdf` (montado por `montarPath` para herdar a
sanitização e o isolamento por organização).

## Etapa 3 — `RelatorioSalvo` ganha o artefato

**Arquivos:** `features/relatorios/tipos.ts`

```ts
pdfRef?: RefFoto; sha256?: string; geradoEm?: string; paginas?: number;
livroSnapshot?: unknown;   // cópia de nr13_livro_<TAG> na emissão
```

Todos OPCIONAIS — é o que mantém o legado vivo. `temArtefato(r)` = `!!r.pdfRef?.path`.

## Etapa 4 — Salvar passa a exigir o artefato

**Arquivos:** `pages/Relatorios.tsx:529`

Ordem nova, e ela importa:

1. drenar a ponte (**antes de tudo**, senão perde medição/laudo digitados)
2. congelar `livroSnapshot` = `ler('nr13_livro_<TAG>')`
3. `gerarPdfBytes` com progresso na UI
4. `publicarArtefato` (sobe + confirma)
5. só então `salvarNoHistorico` com `pdfRef`/`sha256`
6. `setSomenteLeitura(true)` + bump de versão

Falha em 3 ou 4 → **não salva**, mostra o erro, relatório continua editável.

**Offline:** `salvarArquivo` guarda no cofre local e enfileira. Então offline o artefato
EXISTE (localmente) e o `pdfRef` é válido — o upload completa depois pela fila. O relatório
é salvo com `pdfPendente: true` e a UI mostra "aguardando envio". Nunca "salvo" falso.

## Etapa 5 — Visualizar/Imprimir/Baixar servem o arquivo

**Arquivos:** `pages/Relatorios.tsx`, componente novo `components/VisualizadorPdf.tsx`

Com `pdfRef`: renderiza o PDF (object URL em `<iframe>`), e Imprimir/Baixar usam o MESMO
arquivo. Sem `pdfRef`: fluxo legado inalterado.

## Etapa 6 — Portal do Cliente

**Arquivos:** `pages/portal/PortalAtivo.tsx`

Relatório com `pdfRef` → `VisualizadorPdf`. Mata o vetor do DevTools: não há DOM a adulterar.

## Etapa 7 — Livro de registro histórico

`adicionarEntradaLivroAuto` continua criando a entrada no livro vivo. O `livroSnapshot`
congelado na etapa 4 é o que o relatório histórico mostra. O PDF já contém a folha do livro
renderizada — o snapshot é a garantia auditável em dado estruturado.

## Etapa 8 — Retrofit do legado

**Estratégia escolhida: NÃO gerar retrofit automático.** Gerar PDF ao abrir um relatório
antigo produziria um documento com os dados de HOJE e o carimbaria como "o artefato daquela
emissão" — consagraria a deriva em vez de corrigi-la, e de forma irreversível.

O correto: relatório antigo continua legado e a UI mostra um selo "documento legado —
remontado a partir dos dados atuais". Botão **explícito** "Congelar PDF agora" para quem
quiser, deixando claro que congela o estado atual, não o de origem.

## Etapa 9 — Testes

Cobertura pedida: gerar+salvar, `pdfRef` persistido, SHA-256, dado do equipamento mudou →
PDF não mudou, template mudou → não mudou, portal, download, impressão, falha de upload,
offline, legado sem `pdfRef`, livro histórico, isolamento entre organizações.
