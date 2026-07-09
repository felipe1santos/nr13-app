# Design — Bocais opcionais (UG-37), Memorial de Caldeira (ASME I) e injeção do GV do autoclave

Data: 2026-07-09. Aprovado pelo usuário em conversa (3 perguntas respondidas + "pode implementar tudo").

## Escopo

1. **Parte A** — Inserção OPCIONAL de bocais (com ou sem chapa de reforço) no memorial do vaso de pressão (ASME VIII, UG-37/40/41). Motor de cálculo já existe em `src/calc/vaso.ts` (caso `'bocal'`); falta só UI + validação.
2. **Parte B** — Memorial de cálculo de CALDEIRA (ASME I-2004), fórmulas rigorosamente iguais às planilhas de `C:\Users\felipe\Documents\calculo-de-caldeiras\` (3 JPEGs). Hoje a tela mostra aviso "desativado".
3. **Parte C** — Cálculo do Gerador de Vapor (GV) do autoclave injetado na documentação (folhas MEMORIAL e RESUMO-MEMORIAL) logo ABAIXO do cálculo completo do autoclave em si.

## Decisões fixadas com o usuário

- Caldeira: **3 etapas fixas** no stepper — Costado → Tubo → Espelho (igual planilhas).
- Caldeira: **PMTA = pressão de projeto convertida pra kgf/cm²** (0,9 MPa → 9,18); **TH = 1,5×PMTA** (13,77). NÃO inverter fórmula pra achar PMTA da espessura.
- Caldeira: reativar injeção nos documentos (RESUMO-MEMORIAL, MEMORIAL1..N, prontuário) — salvar no formato padrão `nr13_calc_<TAG>`.
- Bocais: totalmente opcionais — zero bocais = fluxo atual intacto.

## Parte A — Bocais no MemorialVaso

**Modelo de dados:** bocais entram como componentes extras em `VasoSalvo.componentes` (ids `bocal1`, `bocal2`, ...), tipo `'bocal'`. Storage inalterado (`nr13_vaso_<TAG>`). ATENÇÃO: `MemorialVaso.tsx:129` hoje força `componentes.length === 3` ao carregar — trocar por lógica que preserva os 3 fixos + N bocais.

**UI (`MemorialVaso.tsx`):** seção "Bocais (opcional)" após Tampo 2 no stepper — botão "+ Adicionar Bocal", cada bocal com botão remover. Campos por bocal:
- nome (default N1, N2, ...), `d` (diâmetro interno do bocal, mm), `t_comercial` (Tnom pescoço), `ca`, `S`, `E` (opcional, default 1,0 = bocal sem solda), `temp`, `proj_int` (projeção interna, mm, opcional)
- checkbox "Possui chapa de reforço" (`temReforco`) → exibe `w_reforco` (largura/diâmetro do pad), `t_reforco` (espessura do pad), `S_reforco` (tensão do pad, default = S do casco).

**Cálculo:** ao gerar, injetar em cada bocal `dados.dadosCascoRef = { t_comercial, ca, S, E }` do componente casco (motor exige casco primeiro — ver `vaso.ts:321`). Injeção acontece em `calcularResumoVaso` (service), não na UI, pra valer também pro autoclave.

**Validação (`validarCamposVaso`):** para tipo `'bocal'` exigir: `d`, `t_comercial`, `S`, `temp`; `E` NÃO obrigatório (default 1,0); se `temReforco`, exigir `w_reforco` e `t_reforco` > 0. Não exigir campos de bocal quando não há bocais.

**Consolidação (já funciona, verificar com testes):** bocal reprovado → memorial REPROVADO (`calcularResumoVaso` exige todos aprovados); bocal não contribui PMTA (não tem PMTA independente); bocal já é filtrado dos `componentes[]` do RESUMO (`vasoMemorialService.ts:108`). O log do bocal ENTRA no `memorialHTML`/`logCalculo` → aparece nas folhas MEMORIAL automaticamente.

**Autoclave ganha de graça:** MemorialAutoclave reusa MemorialVaso (sufixos `gv`, `ac_corpo`) — seção de bocais aparece lá também.

## Parte B — Memorial de Caldeira (ASME I-2004)

**Arquitetura:** espelha a do vaso, módulos novos, sem tocar no motor ASME VIII:
- `src/calc/caldeira.ts` — motor puro (entradas → resultados + log LaTeX no mesmo estilo de `vaso.ts`).
- `src/features/memorial/caldeiraMemorialService.ts` — carregar/salvar/consolidar (chaves `nr13_vaso_cald_<TAG>` para dados e `nr13_calc_<TAG>` para o payload padrão).
- `src/features/memorial/MemorialCaldeira.tsx` — UI stepper de 3 etapas (mesmo visual/UX do MemorialVaso: abas, OK por etapa, terminal, MemorialLog, botão salvar).
- `src/pages/Memorial.tsx` — substituir o aviso "desativado" por `<MemorialCaldeira tag={tag} />`.

**Fórmulas (RIGOROSAMENTE as planilhas):**

| Etapa | Norma | Fórmula (mm, MPa) | Entradas | Valor de conferência |
|---|---|---|---|---|
| Costado | ASME I-2004 PG-27.2.2 | `e = (P·D)/(2·S·E + 2·y·P) + C` | P (MPa), D (mm), S (MPa), E eficiência de solda, y coef. temperatura (default 0,40), C sobrecorrosão (mm, default 0) | P=0,9 D=1200 S=108 E=0,90 y=0,40 C=0 → **e = 5,535 mm** |
| Tubo | ASME I-2004 PG-27.2.1 | `e = (P·D)/(2·S + P) + 0,005·D + E` | P (MPa), S (MPa), D diâmetro externo do tubo (mm), E fator de espessura (mm) | P=0,9 S=90 D=88,9 E=0,12 → **e = 1,01 mm** |
| Espelho | ASME I-2004 PG-46.1 | `e = p·√(P/(S·C))` | P (MPa), S (MPa), p passo dos estais (mm), C constante dos estais (default 2,2 = soldados) | P=0,9 S=118 p=215 C=2,2 → **e = 12,66 mm** |

- Cada etapa também recebe: material (texto), temperatura (°C), **espessura de projeto** (mm) e **espessura encontrada** (mm).
- **Aprovação por etapa:** espessura encontrada ≥ e calculada. Caldeira APROVADA = 3 etapas aprovadas; campo obrigatório vazio → PENDENTE (mesma semântica do vaso).
- **PMTA/TH:** `PMTA_kgf = P_MPa × 10,19716` (exibir 9,18 p/ 0,9); `TH = 1,5 × PMTA` (13,77). No payload `nr13_calc_<TAG>`: `pmta = P_MPa` e `pth = 1,5 × P_MPa` (templates já convertem MPa → kgf/bar).
- P e temperatura são globais da caldeira (uma pressão de projeto); S/E/material/espessuras por etapa.

**Payload `nr13_calc_<TAG>` (mesmo shape do vaso):** `{ pmta, pth, ecasco (e do costado), etampo (e do espelho), componentes[], memorialHTML, logCalculo, resultado }`. `componentes[]` com `formulaT`/`formulaP` textuais das fórmulas ASME I (formulaP = '—' ou texto PMTA por conversão), `pmtaMpa = P`, `tReqMm = e`, `tNom = espessura encontrada`, etc. — RESUMO-MEMORIAL.html e MEMORIAL.html funcionam SEM alteração de template.

**Reativações:**
- `Memorial.tsx:41-49` — trocar aviso por MemorialCaldeira.
- `Prontuarios.tsx:352` — injetar dados da caldeira no prontuário: `codigoProjeto = 'ASME Seção I'`, ano 2004, espessuras/materiais do `nr13_vaso_cald_<TAG>` (costado → espCorpo, espelho → espTampa/espFundo conforme campos disponíveis), diâmetro do costado.
- Ficha do equipamento ("Ver Memorial Completo", PMTA) já lê `nr13_calc_<TAG>` — funciona automaticamente. NÃO chamar `atualizarCategoriaComPmta` (categoria de risco é de vaso; caldeira tem categoria própria A/B/C definida em outro lugar — não mexer).

## Parte C — GV do autoclave na documentação

**Problema:** folhas MEMORIAL são paginadas por `expandirMemorial`/`linhasMemorial` (`relatoriosService.ts:193`) lendo `nr13_calc_<TAG>.memorialHTML`; o template `MEMORIAL.html:207` lê a mesma chave e fatia por índice de linha (contrato 1:1). O GV fica em `nr13_calc_gv_<TAG>` e — por correção de bug antiga — NUNCA é mesclado na chave principal na gravação.

**Solução: merge em TEMPO DE LEITURA, idêntico nos dois lados:**
1. `linhasMemorial(tag)` (relatoriosService.ts): após extrair as linhas de `nr13_calc_<TAG>`, se existir `nr13_calc_gv_<TAG>` com `memorialHTML`, extrair e CONCATENAR as linhas do GV ao final (mesmo filtro/regex).
2. `MEMORIAL.html`: mesma concatenação, mesmo filtro — os índices `from/to` continuam 1:1.
3. `RESUMO-MEMORIAL.html`: após ler `componentes[]` de `nr13_calc_<TAG>`, concatenar `componentes[]` de `nr13_calc_gv_<TAG>` (se existir), com nomes prefixados "GV — " se já não tiverem.
- A gravação continua intocada (não reintroduzir o bug do gv sobrescrevendo a chave geral).
- Merge só ocorre quando a chave gv existe — vasos/caldeiras sem GV não mudam.

## Testes (vitest)

- `caldeira.test.ts`: os 3 valores de conferência EXATOS das planilhas (5,535 / 1,01 / 12,66; tolerância ±0,005), PMTA 9,18 e TH 13,77 (±0,01), aprovação encontrada≥e, reprovação encontrada<e, PENDENTE com campo vazio.
- `vasoMemorialService` (bocais): sem bocal = resultado igual ao atual; bocal completo aprovado/reprovado propaga pro resultado geral; bocal não altera pmtaFinal; bocal fora de `componentes[]` do RESUMO; `dadosCascoRef` injetado do casco.
- `relatoriosService` (GV): `linhasMemorial` concatena gv quando existe; não muda quando não existe; contagem de folhas cresce de acordo.

## Arquivos tocados

- `src/features/memorial/MemorialVaso.tsx` (UI bocais, trava length===3)
- `src/features/memorial/vasoMemorialService.ts` (dadosCascoRef no cálculo)
- `src/calc/caldeira.ts` + `src/calc/__tests__/caldeira.test.ts` (novos)
- `src/features/memorial/caldeiraMemorialService.ts` + `MemorialCaldeira.tsx` (novos)
- `src/pages/Memorial.tsx`, `src/pages/Prontuarios.tsx`
- `src/features/relatorios/relatoriosService.ts` (merge GV)
- `public/arquivos-inspecao/MEMORIAL.html`, `public/arquivos-inspecao/RESUMO-MEMORIAL.html` (merge GV)
- `CLAUDE.md` (chave nova `nr13_vaso_cald_<TAG>`, caldeira reativada)
