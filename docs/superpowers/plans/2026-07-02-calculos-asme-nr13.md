# Cálculos ASME/NR-13 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir avisos/defaults silenciosos do memorial, adicionar tipos de caldeira (mista, elétrica, vertical), fornalha lisa, fator C do tampo aparafusado e autoclave vertical — validados contra as planilhas da pasta `CALCULOS/`.

**Architecture:** Estender os módulos existentes (`src/calc/*.ts` motores puros que devolvem `ResultadoCalculo`; `src/features/memorial/*Service.ts` orquestram e gravam `nr13_calc_<TAG>`; componentes React só renderizam). Tipos novos de caldeira = composição das funções de componente já existentes. Nenhuma chave de `localStorage` muda; campos novos são aditivos.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand, vitest. Sem backend (localStorage via `src/services/storage.ts`).

## Global Constraints

- NUNCA alterar `src/calc/categoria.ts` nem unidades do enquadramento (CLAUDE.md §4).
- Não mudar shape existente de `nr13_calc_<TAG>` (templates HTML leem); só adicionar campos.
- Fórmulas flamotubular/aquatubular existentes NÃO mudam (18 testes atuais continuam passando).
- Textos de memorial em pt-BR, mesmo estilo dos existentes (`// comentário`, `$$LaTeX$$`, spans/divs de status).
- Rodar testes: `npx vitest run` (não usar `--reporter=basic`, quebra no vitest 4).
- Commits frequentes, mensagens em pt-BR estilo conventional (`feat(calc): ...`).

## Valores de referência (extraídos das planilhas CALCULOS/ — usar nos testes)

| Caso | Entradas | Esperado |
|---|---|---|
| Tampo plano aparafusado UG-34 (`Planilha_Tampo_Plano_UG34`) | d=300, P=0.7, S=138, E=1, C=0.3, CA=0, t=8 | t_req=11.7028 mm, PMTA=0.3271 MPa, REPROVADO |
| Fornalha lisa (`Planilha_Caldeira_Flamotubular` sheet4) | P=0.7, S=108, E=0.85, R=200, t=8, CA=0 | t_req=1.5320 mm, PMTA=3.5859 MPa, APROVADO |
| Fundo cônico (`Autoclave vertical` sheet10) | α=15°, D=680, P=0.69, S=108, E=0.8, CA=0, t=6.51 | t_req=2.8245 mm, PMTA=1.5804 MPa, APROVADO |
| Autoclave vertical (`Autoclave_vertical_corrigida`) | D=400, P=0.2, S=138, E=1, CA=1, C=0.33, t_tampo=8, t_costado=4, t_fundo=6, N=6, d_trava=12, S_trava=120 | tampo t_req=8.7477 REPROVADO; costado t_req=0.2901, PMTA=2.0515 APROVADO; travas: carga 4188.79 N ≤ adm 13571.68 N APROVADO; geral REPROVADO |

> Nota: a planilha da autoclave vertical tem fator ×/10 espúrio (bug de unidade, cm×mm) no
> tampo — NÃO replicar; usar a fórmula padrão (idêntica à planilha standalone do UG-34).
> Avisar o usuário disso no resumo final do bloco.

---

### Task 1: Fornalha lisa cilíndrica (`fornalhaLisa`) em `caldeira.ts`

**Files:**
- Modify: `src/calc/caldeira.ts` (após `fornalhaOndulada`)
- Test: `src/calc/__tests__/caldeira.test.ts`

**Interfaces:**
- Produces: `fornalhaLisa(dados: DadosFornalhaLisa, nomeComponente?: string): ResultadoCalculo` e `interface DadosFornalhaLisa { pressao; tensao; eficiencia?; raio_interno; t_comercial; ca? }` (todos `NumLike`), exportados de `src/calc/caldeira.ts`.

- [ ] **Step 1: Teste falhando**

```ts
// em src/calc/__tests__/caldeira.test.ts
import { fornalhaLisa } from '../caldeira';

describe('fornalhaLisa', () => {
  // Planilha_Caldeira_Flamotubular_ASME_NR13.xlsx, aba Fornalha:
  // t = P·R/(S·E − 0.6·P); PMTA = t_util·S·E/(R + 0.6·t_util)
  it('bate com a planilha de referência (P=0.7, S=108, E=0.85, R=200, t=8)', () => {
    const r = fornalhaLisa({ pressao: 0.7, tensao: 108, eficiencia: 0.85, raio_interno: 200, t_comercial: 8, ca: 0 });
    expect(parseFloat(r.t_min)).toBeCloseTo(1.532, 3);
    expect(parseFloat(r.pmta)).toBeCloseTo(3.5859, 3);
    expect(r.resultado).toBe('APROVADO');
  });

  it('reprova quando espessura útil < requerida', () => {
    const r = fornalhaLisa({ pressao: 0.7, tensao: 108, eficiencia: 0.85, raio_interno: 200, t_comercial: 1.2, ca: 0 });
    expect(r.resultado).toBe('REPROVADO');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/calc/__tests__/caldeira.test.ts`. Esperado: FAIL (`fornalhaLisa` não exportada).

- [ ] **Step 3: Implementar**

```ts
// src/calc/caldeira.ts — junto das outras interfaces
export interface DadosFornalhaLisa {
  pressao: NumLike;
  tensao: NumLike;
  eficiencia?: NumLike;
  raio_interno: NumLike;
  t_comercial: NumLike;
  ca?: NumLike;
}

// Fornalha cilíndrica lisa — modelo simplificado da planilha de referência do engenheiro
// (mesma forma do UG-27(c)(1); pressão externa tratada de forma conservadora conforme
// Planilha_Caldeira_Flamotubular_ASME_NR13.xlsx).
export function fornalhaLisa(dados: DadosFornalhaLisa, nomeComponente = 'FORNALHA CILÍNDRICA LISA'): ResultadoCalculo {
  const P = num(dados.pressao);
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1);
  const R = num(dados.raio_interno);
  const t_nom = num(dados.t_comercial);
  const CA = numOuPadrao(dados.ca, 0);
  const t_util = t_nom - CA;

  const t_min = (P * R) / (S * E - 0.6 * P);
  const pmta = (S * E * t_util) / (R + 0.6 * t_util);

  const espessura_ok = t_util >= t_min;
  const pmta_ok = pmta >= P;
  const resultadoFinal = espessura_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const logTerminal = [
    '// ====================================================',
    `// MEMORIAL DE CÁLCULO - ${nomeComponente} (NR-13)`,
    '// Método: cilindro sob pressão (forma UG-27(c)(1)) — planilha de referência flamotubular',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto)`,
    `// R = ${R.toFixed(4)} mm (Raio Interno da fornalha)`,
    `// S = ${S.toFixed(4)} MPa (Tensão Admissível do material)`,
    `// E = ${E.toFixed(4)} (Eficiência de junta)`,
    `// Tnom = ${t_nom.toFixed(4)} mm | CA = ${CA.toFixed(4)} mm | Tútil = ${t_util.toFixed(4)} mm`,
    '// ----------------------------------------------------',
    ' ',
    '// 1. ESPESSURA MÍNIMA REQUERIDA',
    `$$t_{min} = \\frac{P \\cdot R}{S \\cdot E - 0.6 \\cdot P}$$`,
    `$$t_{min} = \\frac{${P} \\cdot ${R}}{${S} \\cdot ${E} - 0.6 \\cdot ${P}} = ${t_min.toFixed(3)} \\text{ mm}$$`,
    espessura_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> Espessura útil (${t_util.toFixed(2)} mm) ≥ requerida (${t_min.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> Espessura útil (${t_util.toFixed(2)} mm) < requerida (${t_min.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. PRESSÃO MÁXIMA DE TRABALHO ADMISSÍVEL (PMTA)',
    `$$PMTA = \\frac{S \\cdot E \\cdot t_{util}}{R + 0.6 \\cdot t_{util}}$$`,
    `$$PMTA = \\frac{${S} \\cdot ${E} \\cdot ${t_util.toFixed(4)}}{${R} + 0.6 \\cdot ${t_util.toFixed(4)}} = ${pmta.toFixed(3)} \\text{ MPa}$$`,
    pmta_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> PMTA (${pmta.toFixed(3)} MPa) ≥ Pressão de Projeto (${P} MPa).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> PMTA (${pmta.toFixed(3)} MPa) < Pressão de Projeto (${P} MPa).</div>`,
    ' ',
    `// RESULTADO: ${resultadoFinal}`,
  ];

  return { t_min: t_min.toFixed(3), pmta: pmta.toFixed(3), resultado: resultadoFinal, log: logTerminal };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run src/calc/__tests__/caldeira.test.ts`. Esperado: PASS (todos, inclusive antigos).

- [ ] **Step 5: Commit** — `git add src/calc/caldeira.ts src/calc/__tests__/caldeira.test.ts && git commit -m "feat(calc): fornalha cilíndrica lisa conforme planilha de referência"`

---

### Task 2: Fator C configurável no tampo plano aparafusado (`vaso.ts`)

**Files:**
- Modify: `src/calc/vaso.ts` (case `planoAparafusado`, ~linha 227; interface `DadosComponenteVaso`)
- Modify: `src/features/memorial/MemorialVaso.tsx` (campos do componente — seção que já renderiza N_parafusos/d_parafuso/S_parafuso para `planoAparafusado`)
- Test: `src/calc/__tests__/vaso.test.ts`

**Interfaces:**
- Produces: campo novo `C_fator?: NumLike` em `DadosComponenteVaso`. Default no cálculo: **0.3** (UG-34 aparafusado, junta plena — igual à planilha). Tipo `plano` (soldado) permanece C=0.33 fixo.

- [ ] **Step 1: Teste falhando**

```ts
// em src/calc/__tests__/vaso.test.ts
import { calcularComponenteVaso } from '../vaso';

describe('planoAparafusado com C configurável', () => {
  // Planilha_Tampo_Plano_UG34_ASME_Status.xlsx: d=300, P=0.7, S=138, E=1, C=0.3, CA=0, t=8
  it('bate com a planilha UG-34 (C=0.3)', () => {
    const r = calcularComponenteVaso('TAMPA', 'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, C_fator: 0.3, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 },
      300, 0.7);
    expect(parseFloat(r.t_min)).toBeCloseTo(11.7028, 3);
    expect(r.resultado).toBe('REPROVADO'); // t 8 < 11.70
  });

  it('default de C para aparafusado é 0.3', () => {
    const r1 = calcularComponenteVaso('TAMPA', 'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 }, 300, 0.7);
    const r2 = calcularComponenteVaso('TAMPA', 'planoAparafusado',
      { t_comercial: 8, ca: 0, S: 138, E: 1, C_fator: 0.3, N_parafusos: 8, d_parafuso: 20, S_parafuso: 138 }, 300, 0.7);
    expect(r1.t_min).toBe(r2.t_min);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/calc/__tests__/vaso.test.ts`. Esperado: FAIL (t_min calculado com C=0.33 → 12.2756 ≠ 11.7028).

- [ ] **Step 3: Implementar**

Em `DadosComponenteVaso` adicionar:

```ts
  C_fator?: NumLike; // UG-34: 0.3 aparafusado (default), 0.33 soldado — planilha de referência
```

No case `planoAparafusado`, trocar `const C_ap = 0.33;` por:

```ts
      const C_ap = numOuPadrao(dados.C_fator, 0.3);
```

(As linhas de log que imprimem `C = ${C_ap}` já usam a variável — nada mais muda. A PMTA
`S·E·t²/(C·d²)` é idêntica à da planilha `(S·E/C)·(t/d)²`.)

Em `MemorialVaso.tsx`, no grupo de campos exibido quando `tipo === 'planoAparafusado'` (mesmo bloco de N_parafusos), adicionar:

```tsx
<Campo label="C — Fator UG-34 (0.3 aparafusado)" value={d.C_fator ?? ''} onChange={(v) => onDadoChange('C_fator', Number(v))} />
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run`. Esperado: PASS (18 antigos + novos).

- [ ] **Step 5: Commit** — `git commit -am "feat(calc): fator C configurável no tampo plano aparafusado (UG-34, default 0.3)"`

---

### Task 3: Campos vazios → resultado PENDENTE + aviso de default no log (`vaso.ts`)

**Files:**
- Modify: `src/calc/tipos.ts` (ResultadoCalculo)
- Modify: `src/calc/vaso.ts` (`gerarBlocoComponenteVaso` + `calcularComponenteVaso`)
- Modify: `src/features/memorial/vasoMemorialService.ts` (`ResumoMemorialVaso`, `calcularResumoVaso`)
- Test: `src/calc/__tests__/vaso.test.ts`

**Interfaces:**
- Produces: `ResultadoCalculo` ganha `faltantes?: string[]` (rótulos dos campos sem valor). `ResumoMemorialVaso.resultado` passa a `'APROVADO' | 'REPROVADO' | 'PENDENTE'`. `calcularResumoVaso` devolve `'PENDENTE'` se qualquer componente tiver `faltantes` não-vazio ou se `vaso.P`/`vaso.D` inválidos.
- Consumes: nada de tasks anteriores.

- [ ] **Step 1: Teste falhando**

```ts
// em src/calc/__tests__/vaso.test.ts
describe('campos vazios → faltantes + aviso no log', () => {
  it('lista campos vazios e injeta aviso de valor padrão no log', () => {
    const r = calcularComponenteVaso('CASCO', 'cilindrico', { t_comercial: 8, ca: 0 }, 1000, 1.5);
    expect(r.faltantes).toEqual(['S — Tensão Admissível', 'E — Eficiência de Junta']);
    expect(r.log.some((l) => l.includes('ATENÇÃO: valor padrão adotado'))).toBe(true);
  });

  it('sem campos vazios não há faltantes nem aviso', () => {
    const r = calcularComponenteVaso('CASCO', 'cilindrico', { t_comercial: 8, ca: 0, S: 138, E: 1, temp: 25 }, 1000, 1.5);
    expect(r.faltantes ?? []).toEqual([]);
    expect(r.log.some((l) => l.includes('ATENÇÃO'))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Esperado: FAIL (`faltantes` undefined).

- [ ] **Step 3: Implementar**

`src/calc/tipos.ts` — no `ResultadoCalculo` adicionar:

```ts
  /** Rótulos de campos obrigatórios sem valor — cálculo saiu com defaults; resultado não confiável. */
  faltantes?: string[];
```

`src/calc/vaso.ts` — dentro de `gerarBlocoComponenteVaso`, logo após calcular `S`, `E`, `t_nom`
(linhas ~91-98), detectar vazios ANTES dos defaults e emitir avisos. Trocar o início por:

```ts
  const vazio = (v: NumLike | undefined) => v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;

  const faltantes: string[] = [];
  if (vazio(dados.t_comercial)) faltantes.push('Tnom — Espessura Comercial');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.E)) faltantes.push('E — Eficiência de Junta');
```

e, depois do bloco `// ----------------------------------------------------` inicial (linha ~118), acrescentar ao `blocoOutput`:

```ts
  for (const f of faltantes) {
    blocoOutput.push(
      `<span class="msg-reprovado">// ATENÇÃO: valor padrão adotado para "${f}" — campo não preenchido. Preencha para validar o cálculo.</span>`,
    );
  }
  if (faltantes.length) blocoOutput.push(' ');
```

A função passa a devolver também os faltantes: mudar a assinatura interna para devolver
`{ log: string[]; faltantes: string[] }` OU (mais simples, sem quebrar quem chama
`gerarBlocoComponenteVaso` — verifique com grep `gerarBlocoComponenteVaso` antes) exportar
uma função auxiliar:

```ts
export function camposFaltantesVaso(tipo: TipoComponenteVaso, dados: DadosComponenteVaso): string[] {
  const vazio = (v: NumLike | undefined) => v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;
  const faltantes: string[] = [];
  if (vazio(dados.t_comercial)) faltantes.push('Tnom — Espessura Comercial');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.E)) faltantes.push('E — Eficiência de Junta');
  return faltantes;
}
```

e usar dentro de `gerarBlocoComponenteVaso` (para o log) e em `calcularComponenteVaso`:

```ts
  const faltantes = camposFaltantesVaso(tipo, dados);
  return { t_min, pmta, resultado: aprovado ? 'APROVADO' : 'REPROVADO', log, faltantes };
```

`src/features/memorial/vasoMemorialService.ts`:

```ts
export interface ResumoMemorialVaso {
  porComponente: { id: string; nome: string; tipo: TipoComponenteVaso; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE';
  logCompleto: string[];
}
```

e em `calcularResumoVaso`, trocar o cálculo de `resultado` por:

```ts
  const temFaltantes =
    !Number.isFinite(Number(vaso.P)) || Number(vaso.P) <= 0 ||
    !Number.isFinite(Number(vaso.D)) || Number(vaso.D) <= 0 ||
    porComponente.some((c) => (c.resultado.faltantes ?? []).length > 0);
  const resultado = temFaltantes
    ? 'PENDENTE'
    : porComponente.every((c) => c.resultado.resultado === 'APROVADO')
      ? 'APROVADO'
      : 'REPROVADO';
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run`. Esperado: PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(calc): campos vazios geram PENDENTE e aviso de valor padrão no memorial do vaso"`

---

### Task 4: Legenda ⚠ + banner de campos faltantes no MemorialVaso

**Files:**
- Modify: `src/features/memorial/MemorialVaso.tsx`
- Modify: `src/features/memorial/MemorialAutoclave.tsx` (mesma legenda do Step 1 — os campos dele também usam `warn=`)
- Modify: `src/features/memorial/memorial.css`

**Interfaces:**
- Consumes: `ResumoMemorialVaso.resultado === 'PENDENTE'` e `resultado.faltantes` (Task 3).

- [ ] **Step 1: Legenda.** No topo do formulário (logo abaixo do título/campos P e D em `MemorialVasoInner`), adicionar:

```tsx
<p className="memorial-legenda-aviso">
  <span className="campo-aviso-icon">⚠</span> = campo obrigatório sem valor válido. O cálculo usa
  valores padrão nesses campos e o memorial sai como <b>PENDENTE</b> até você preencher.
</p>
```

- [ ] **Step 2: Banner.** Onde o resumo é exibido (bloco que renderiza `resumo.resultado`), adicionar antes:

```tsx
{resumo && resumo.resultado === 'PENDENTE' && (
  <div className="memorial-banner-pendente">
    <b>Cálculo PENDENTE — campos obrigatórios sem valor:</b>
    <ul>
      {resumo.porComponente
        .filter((c) => (c.resultado.faltantes ?? []).length > 0)
        .map((c) => (
          <li key={c.id}>
            {c.nome}: {(c.resultado.faltantes ?? []).join(', ')}
          </li>
        ))}
      {(!vaso.P || vaso.P <= 0) && <li>Dados gerais: P — Pressão de Projeto</li>}
      {(!vaso.D || vaso.D <= 0) && <li>Dados gerais: D — Diâmetro Interno</li>}
    </ul>
  </div>
)}
```

- [ ] **Step 3: CSS.** Em `memorial.css`:

```css
.memorial-legenda-aviso {
  font-size: 0.85rem;
  color: #9a5b00;
  margin: 4px 0 12px;
}
.memorial-banner-pendente {
  background: #fff4e5;
  border: 1px solid #f0a44b;
  border-left: 4px solid #e8830c;
  border-radius: 6px;
  padding: 10px 14px;
  margin: 12px 0;
  color: #7a4a00;
  font-size: 0.9rem;
}
.memorial-banner-pendente ul { margin: 6px 0 0 18px; }
```

- [ ] **Step 4: Verificar manualmente** — `npm run dev`, abrir memorial de um vaso com S vazio: ⚠ nos campos, banner listando componente + campo, resultado PENDENTE. `npx vitest run` continua PASS. `npm run build` sem erro de tipo.

- [ ] **Step 5: Commit** — `git commit -am "feat(memorial): legenda do aviso laranja e banner de campos faltantes (PENDENTE)"`

---

### Task 5: Subtipo de fornalha (lisa/ondulada) no memorial flamotubular

**Files:**
- Modify: `src/features/memorial/caldeiraMemorialService.ts`
- Modify: `src/features/memorial/MemorialCaldeira.tsx`
- Test: nenhum novo (lógica coberta pela Task 1); teste de serviço abaixo é opcional mas recomendado.

**Interfaces:**
- Produces: `TiposCaldeira` ganha `fornalha: 'lisa' | 'ondulada'` (default `'ondulada'` — compatibilidade com dados salvos). `calcularAbaCaldeira` despacha `fornalhaLisa` quando `tipos.fornalha === 'lisa'`.
- Consumes: `fornalhaLisa` (Task 1).

- [ ] **Step 1:** Em `caldeiraMemorialService.ts`:

```ts
export type SubtipoFornalha = 'lisa' | 'ondulada';

export interface TiposCaldeira {
  tampo: SubtipoTampo;
  espelho: SubtipoEspelho;
  fornalha: SubtipoFornalha;
}
```

`carregarTiposCaldeira` passa a mesclar defaults (dados antigos não têm `fornalha`):

```ts
export function carregarTiposCaldeira(tag: string): TiposCaldeira {
  const salvo = ler<Partial<TiposCaldeira>>(`nr13_caldeira_tipos_${tag}`);
  return { tampo: 'tampoAbaulado', espelho: 'espelhoEstaiado', fornalha: 'ondulada', ...salvo };
}
```

Em `calcularAbaCaldeira`, trocar `if (aba === 'fornalha') return fornalhaOndulada(dados);` por:

```ts
  if (aba === 'fornalha') {
    return tipos.fornalha === 'lisa'
      ? fornalhaLisa({
          pressao: dados.pressao,
          tensao: dados.tensao,
          eficiencia: dados.eficiencia ?? 1,
          raio_interno: Number(dados.diametro_medio ?? 0) / 2,
          t_comercial: dados.t_comercial,
          ca: dados.ca,
        })
      : fornalhaOndulada(dados);
  }
```

(importar `fornalhaLisa` no topo). Nos `PADROES.fornalha`, acrescentar `tensao: 108, eficiencia: 1` (a ondulada ignora; a lisa usa).

Em `ROTULO_ABA_FLAMO`/`FORMULAS_FLAMO`, a chave da fornalha vem de `chaveTipoFlamo` — atualizar:

```ts
function chaveTipoFlamo(aba: AbaCaldeira, tipos: TiposCaldeira): string {
  if (aba === 'tampo') return tipos.tampo;
  if (aba === 'espelho') return tipos.espelho;
  if (aba === 'fornalha') return tipos.fornalha === 'lisa' ? 'fornalhaLisa' : 'fornalha';
  return aba;
}
```

e adicionar aos mapas:

```ts
// ROTULO_ABA_FLAMO
fornalhaLisa: 'Fornalha Cilíndrica Lisa',
// FORMULAS_FLAMO
fornalhaLisa: ['t = P·R / (S·E − 0,6·P)', 'PMTA = S·E·t / (R + 0,6·t)'],
```

- [ ] **Step 2: UI.** Em `MemorialCaldeira.tsx`, na aba fornalha do flamotubular, adicionar seletor (mesmo padrão dos seletores de tampo/espelho já existentes — procurar onde `tipos.tampo` é selecionado):

```tsx
<Campo
  label="Tipo de Fornalha"
  value={tipos.fornalha}
  options={[
    { value: 'ondulada', label: 'Ondulada (Fox/Morison/Leeds)' },
    { value: 'lisa', label: 'Cilíndrica Lisa' },
  ]}
  onChange={(v) => marcarTipos((t) => ({ ...t, fornalha: v as SubtipoFornalha }))}
/>
```

Quando `lisa`, mostrar campos `tensao` e `eficiencia` da fornalha (a ondulada não usa; os campos já existem no objeto de dados).

- [ ] **Step 3: Verificar** — `npx vitest run` PASS; `npm run build` sem erro; dev: alternar tipo de fornalha muda o memorial gerado.

- [ ] **Step 4: Commit** — `git commit -am "feat(memorial): seletor de fornalha lisa/ondulada na caldeira flamotubular"`

---

### Task 6: Caldeira VERTICAL (fogotubular vertical)

**Files:**
- Modify: `src/features/equipamento/tipos.ts` (union `subtipo`)
- Modify: `src/features/equipamento/ModalCriarEquipamento.tsx`
- Modify: `src/pages/Memorial.tsx`
- Modify: `src/features/memorial/MemorialCaldeira.tsx`
- Modify: `src/features/memorial/caldeiraMemorialService.ts`

**Interfaces:**
- Produces: subtipo `'vertical'` aceito em `InfoEquipamento['subtipo']`, `MemorialCaldeira` prop `subtipo: 'flamotubular' | 'aquatubular' | 'vertical' | 'mista' | 'eletrica'` (mista/eletrica chegam nas Tasks 7–8; incluir na union já).
- Consumes: fornalha lisa (Tasks 1/5).

A caldeira vertical usa EXATAMENTE as mesmas 5 abas do flamotubular (costado, tampo, espelho,
fornalha, tubos) e as mesmas chaves de dados `nr13_caldeira_dados_*` — só muda: fornalha default
lisa e rótulos. Zero cálculo novo.

- [ ] **Step 1:** `src/features/equipamento/tipos.ts` — estender union:

```ts
  subtipo: SubtipoAutoclave | 'flamotubular' | 'aquatubular' | 'vertical' | 'mista' | 'eletrica' | '';
```

(Se existir `type SubtipoCaldeira`, estender lá: `'flamotubular' | 'aquatubular' | 'vertical' | 'mista' | 'eletrica'`.)

- [ ] **Step 2:** `ModalCriarEquipamento.tsx` — adicionar radios (mesmo padrão dos 2 existentes):

```tsx
<label>
  <input type="radio" name="subtipoCaldeira" checked={subtipoCaldeira === 'vertical'}
    onChange={() => setSubtipoCaldeira('vertical')} /> Vertical (fogotubular)
</label>
<label>
  <input type="radio" name="subtipoCaldeira" checked={subtipoCaldeira === 'mista'}
    onChange={() => setSubtipoCaldeira('mista')} /> Mista (aqua + flamo)
</label>
<label>
  <input type="radio" name="subtipoCaldeira" checked={subtipoCaldeira === 'eletrica'}
    onChange={() => setSubtipoCaldeira('eletrica')} /> Elétrica
</label>
```

- [ ] **Step 3:** `Memorial.tsx` — repassar subtipo real:

```tsx
{info.tipo === 'caldeira' && info.subtipo !== 'eletrica' && (
  <MemorialCaldeira
    tag={tag}
    subtipo={(info.subtipo as 'flamotubular' | 'aquatubular' | 'vertical' | 'mista') || 'flamotubular'}
  />
)}
{info.tipo === 'caldeira' && info.subtipo === 'eletrica' && (
  <MemorialVaso tag={tag} sufixo="celetrica" titulo="Caldeira Elétrica — Memorial (ASME VIII)" />
)}
```

(A parte `eletrica` só compila depois da Task 8 — se fizer as tasks fora de ordem, deixar o
bloco `eletrica` para a Task 8.)

- [ ] **Step 4:** `MemorialCaldeira.tsx` — aceitar `'vertical'`: tratar como flamo com rótulos próprios:

```ts
const ABAS_VERTICAL: { value: AbaCaldeira; label: string }[] = [
  { value: 'costado', label: 'Costado' },
  { value: 'tampo', label: 'Tampo Superior' },
  { value: 'espelho', label: 'Espelho/Placa Tubular' },
  { value: 'fornalha', label: 'Fornalha Interna' },
  { value: 'tubo', label: 'Tubos de Fogo' },
];
```

`const ehFlamoLike = subtipo === 'flamotubular' || subtipo === 'vertical';` — todo o fluxo flamo
existente roda quando `ehFlamoLike`, usando `subtipo === 'vertical' ? ABAS_VERTICAL : ABAS_FLAMO`
para os rótulos. Default de tipos p/ vertical: fornalha lisa — em `carregarTiposCaldeira` não
muda; na primeira renderização do vertical, se não houver tipos salvos, gravar
`{ ...tipos, fornalha: 'lisa' }` (um `useEffect` simples com guarda `ler(...) == null`).

- [ ] **Step 5: Verificar** — dev: criar caldeira vertical, memorial abre com 5 abas rotuladas, fornalha lisa default, salvar gera `nr13_calc_<TAG>`. `npx vitest run` + `npm run build` PASS.

- [ ] **Step 6: Commit** — `git commit -am "feat(memorial): caldeira vertical fogotubular (abas flamo + fornalha lisa default)"`

---

### Task 7: Caldeira MISTA (componentes aqua + flamo com toggle)

**Files:**
- Modify: `src/features/memorial/caldeiraMemorialService.ts`
- Modify: `src/features/memorial/MemorialCaldeira.tsx`
- Test: `src/features/memorial/__tests__/mista.test.ts` (novo)

**Interfaces:**
- Produces (em `caldeiraMemorialService.ts`):

```ts
export interface AbaMista { familia: 'flamo' | 'aqua'; aba: AbaCaldeira | AbaAquatubular; }
export const ABAS_MISTA: AbaMista[];                       // flamo: costado, tampo, espelho, fornalha, tubo + aqua: tubulaoSup, tubulaoInf, tuboGerador, coletor
export function carregarAtivasMista(tag: string): Record<string, boolean>;  // chave `${familia}:${aba}`, default true
export async function salvarAtivasMista(tag: string, ativas: Record<string, boolean>): Promise<void>; // chave nr13_caldeira_mista_ativas_<TAG>
export interface ResumoMemorialMista { porAba: { chave: string; rotulo: string; resultado: ResultadoCalculo }[]; pmtaFinal: number | null; pthFinal: number | null; resultado: 'APROVADO' | 'REPROVADO'; logCompleto: string[]; }
export function calcularResumoMista(tag: string, tipos: TiposCaldeira): ResumoMemorialMista;
export async function salvarResumoMista(tag: string, resumo: ResumoMemorialMista, tipos?: TiposCaldeira): Promise<void>;
```

- Consumes: `calcularAbaCaldeira`, `calcularAbaAqua`, `carregarDadosCaldeira`, `carregarDadosAqua`, `componentesFlamo`/`componentesAqua` (privadas — reusar via chamada interna), `testeHidrostatico`.

- [ ] **Step 1: Teste falhando**

```ts
// src/features/memorial/__tests__/mista.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { calcularResumoMista, carregarTiposCaldeira } from '../caldeiraMemorialService';

describe('caldeira mista', () => {
  beforeEach(() => localStorage.clear());

  it('compõe componentes flamo + aqua e PMTA final é o menor', () => {
    const r = calcularResumoMista('TAGX', carregarTiposCaldeira('TAGX'));
    // defaults de PADROES (flamo) e PADROES_AQUATUBULAR (aqua) — 5 + 4 abas ativas
    expect(r.porAba.length).toBe(9);
    const pmtas = r.porAba.map((c) => parseFloat(c.resultado.pmta)).filter(Number.isFinite);
    expect(r.pmtaFinal).toBe(Math.min(...pmtas));
  });

  it('aba desativada fica fora do resumo', () => {
    localStorage.setItem('nr13_caldeira_mista_ativas_TAGY', JSON.stringify({ 'aqua:coletor': false }));
    const r = calcularResumoMista('TAGY', carregarTiposCaldeira('TAGY'));
    expect(r.porAba.length).toBe(8);
    expect(r.porAba.some((c) => c.chave === 'aqua:coletor')).toBe(false);
  });
});
```

> Se o vitest não tiver `localStorage` (ambiente node), configurar o teste com
> `// @vitest-environment jsdom` na primeira linha do arquivo (jsdom já é dependência do
> template Vite; se não estiver em devDependencies, `npm i -D jsdom`).

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run src/features/memorial/__tests__/mista.test.ts`. Esperado: FAIL (exports inexistentes).

- [ ] **Step 3: Implementar** em `caldeiraMemorialService.ts` (seção nova `── CALDEIRA MISTA ──`):

```ts
export interface AbaMista { familia: 'flamo' | 'aqua'; aba: AbaCaldeira | AbaAquatubular; }

export const ABAS_MISTA: AbaMista[] = [
  { familia: 'aqua', aba: 'tubulaoSup' },
  { familia: 'aqua', aba: 'tubulaoInf' },
  { familia: 'aqua', aba: 'tuboGerador' },
  { familia: 'aqua', aba: 'coletor' },
  { familia: 'flamo', aba: 'costado' },
  { familia: 'flamo', aba: 'tampo' },
  { familia: 'flamo', aba: 'espelho' },
  { familia: 'flamo', aba: 'fornalha' },
  { familia: 'flamo', aba: 'tubo' },
];

const chaveMista = (m: AbaMista) => `${m.familia}:${m.aba}`;

export function carregarAtivasMista(tag: string): Record<string, boolean> {
  const salvo = ler<Record<string, boolean>>(`nr13_caldeira_mista_ativas_${tag}`) || {};
  const ativas: Record<string, boolean> = {};
  for (const m of ABAS_MISTA) ativas[chaveMista(m)] = salvo[chaveMista(m)] ?? true;
  return ativas;
}

export async function salvarAtivasMista(tag: string, ativas: Record<string, boolean>): Promise<void> {
  await salvar(`nr13_caldeira_mista_ativas_${tag}`, ativas);
}

export interface ResumoMemorialMista {
  porAba: { chave: string; rotulo: string; resultado: ResultadoCalculo }[];
  pmtaFinal: number | null;
  pthFinal: number | null;
  resultado: 'APROVADO' | 'REPROVADO';
  logCompleto: string[];
}

export function calcularResumoMista(tag: string, tipos: TiposCaldeira): ResumoMemorialMista {
  const ativas = carregarAtivasMista(tag);
  const abas = ABAS_MISTA.filter((m) => ativas[chaveMista(m)]);

  const porAba = abas.map((m) => {
    if (m.familia === 'flamo') {
      const aba = m.aba as AbaCaldeira;
      return {
        chave: chaveMista(m),
        rotulo: ROTULO_ABA_FLAMO[chaveTipoFlamo(aba, tipos)] ?? aba,
        resultado: calcularAbaCaldeira(aba, tipos, carregarDadosCaldeira(tag, aba)),
      };
    }
    const aba = m.aba as AbaAquatubular;
    return { chave: chaveMista(m), rotulo: ROTULOS_AQUATUBULAR[aba], resultado: calcularAbaAqua(aba, carregarDadosAqua(tag, aba)) };
  });

  const pmtas = porAba.map((c) => parseFloat(c.resultado.pmta)).filter((n) => Number.isFinite(n));
  const pmtaFinal = pmtas.length > 0 ? Math.min(...pmtas) : null;

  const limitante = porAba.find((c) => parseFloat(c.resultado.pmta) === pmtaFinal);
  let tensaoLimitante = 0;
  if (limitante) {
    const [fam, aba] = limitante.chave.split(':');
    const d = fam === 'flamo' ? carregarDadosCaldeira(tag, aba as AbaCaldeira) : carregarDadosAqua(tag, aba as AbaAquatubular);
    tensaoLimitante = parseFloat(String(d.tensao ?? 0));
  }
  const teste = pmtaFinal != null ? testeHidrostatico({ pmta: pmtaFinal, tensao_componente_limitante: tensaoLimitante }) : null;

  const resultado = porAba.every((c) => c.resultado.resultado === 'APROVADO') ? 'APROVADO' : 'REPROVADO';
  const logCompleto = porAba.flatMap((c) => c.resultado.log).concat(teste ? teste.log : []);

  return { porAba, pmtaFinal, pthFinal: teste ? parseFloat(teste.p_teste) : pmtaFinal != null ? pmtaFinal * 1.5 : null, resultado, logCompleto };
}

export async function salvarResumoMista(tag: string, resumo: ResumoMemorialMista, tipos?: TiposCaldeira): Promise<void> {
  const tiposEf = tipos ?? carregarTiposCaldeira(tag);
  const ativas = carregarAtivasMista(tag);
  // componentes estruturados: reusa os montadores das duas famílias filtrando pelas abas ativas
  const resumoFlamoFake: ResumoMemorialCaldeira = {
    porAba: resumo.porAba
      .filter((c) => c.chave.startsWith('flamo:'))
      .map((c) => ({ aba: c.chave.split(':')[1] as AbaCaldeira, resultado: c.resultado })),
    pmtaFinal: resumo.pmtaFinal, pthFinal: resumo.pthFinal, resultado: resumo.resultado, logCompleto: [],
  };
  const resumoAquaFake: ResumoMemorialAqua = {
    porAba: resumo.porAba
      .filter((c) => c.chave.startsWith('aqua:'))
      .map((c) => ({ aba: c.chave.split(':')[1] as AbaAquatubular, resultado: c.resultado })),
    pmtaFinal: resumo.pmtaFinal, pthFinal: resumo.pthFinal, resultado: resumo.resultado, logCompleto: [],
  };
  const componentes = [...componentesAqua(tag, resumoAquaFake), ...componentesFlamo(tag, tiposEf, resumoFlamoFake)];
  void ativas;
  await salvar(`nr13_calc_${tag}`, {
    pmta: resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(2) : '',
    pth: resumo.pthFinal != null ? resumo.pthFinal.toFixed(2) : '',
    ecasco: resumo.porAba.find((c) => c.chave === 'aqua:tubulaoSup')?.resultado.t_min
      ?? resumo.porAba.find((c) => c.chave === 'flamo:costado')?.resultado.t_min,
    componentes,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  });
  await atualizarCategoriaComPmta(tag, resumo.pmtaFinal);
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run`. Esperado: PASS.

- [ ] **Step 5: UI.** `MemorialCaldeira.tsx`, ramo `subtipo === 'mista'`: renderizar chips de
toggle por aba + as duas grades de abas (reusar os componentes de aba flamo/aqua já existentes,
mostrando só as ativas), botão "Gerar" → `calcularResumoMista`, "Salvar" → `salvarResumoMista`.
Chips:

```tsx
<div className="mista-toggles">
  {ABAS_MISTA.map((m) => {
    const chave = `${m.familia}:${m.aba}`;
    return (
      <label key={chave} className={`mista-chip${ativas[chave] ? ' ativo' : ''}`}>
        <input type="checkbox" checked={ativas[chave]}
          onChange={(e) => { const novo = { ...ativas, [chave]: e.target.checked }; setAtivas(novo); salvarAtivasMista(tag, novo); setDirty(true); }} />
        {m.familia === 'aqua'
          ? ROTULOS_AQUATUBULAR[m.aba as AbaAquatubular]
          : (ABAS_FLAMO.find((a) => a.value === m.aba)?.label ?? m.aba)}
      </label>
    );
  })}
</div>
```

CSS em `memorial.css`:

```css
.mista-toggles { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.mista-chip { border: 1px solid #ccc; border-radius: 16px; padding: 4px 12px; font-size: 0.85rem; cursor: pointer; opacity: 0.55; }
.mista-chip.ativo { border-color: #0b62c4; color: #0b62c4; opacity: 1; }
.mista-chip input { display: none; }
```

- [ ] **Step 6: Verificar** — dev: criar caldeira mista, desligar coletor, gerar memorial → some do log; salvar grava `nr13_calc_<TAG>` com componentes das duas famílias. `npm run build` PASS.

- [ ] **Step 7: Commit** — `git commit -am "feat(memorial): caldeira mista — componentes aqua+flamo com abas ativáveis"`

---

### Task 8: Caldeira ELÉTRICA (reusa motor do vaso, sufixo `celetrica`)

**Files:**
- Modify: `src/pages/Memorial.tsx` (bloco da Task 6 Step 3 — ativar ramo `eletrica`)
- Modify: `src/features/memorial/MemorialVaso.tsx` (apenas se `titulo`/`imagemSrc` não bastarem — a prop `sufixo` já existe, linha 64)

**Interfaces:**
- Consumes: `MemorialVaso` com props `{ tag, sufixo: 'celetrica', titulo }` (já suportadas); `salvarResumoVaso` já replica o payload para `nr13_calc_<TAG>` quando há sufixo (vasoMemorialService.ts:129-131).

- [ ] **Step 1:** Ativar em `Memorial.tsx` o ramo `eletrica` (código na Task 6 Step 3). Importar `MemorialVaso` já está importado.

- [ ] **Step 2:** No subtítulo da página (linha 29), incluir rótulos dos novos subtipos:

```tsx
{info.tipo === 'vaso' ? 'Vaso de Pressão'
  : info.tipo === 'autoclave' ? `Autoclave (${info.subtipo})`
  : `Caldeira (${info.subtipo || 'flamotubular'})`}
```

- [ ] **Step 3: Verificar** — dev: criar caldeira elétrica → memorial abre a calculadora de vaso (componentes cilíndrico/tampos, sem fornalha, sem piso 6 mm — correto p/ caldeira elétrica, exceção da PG-16.3); salvar gera `nr13_calc_celetrica_<TAG>` e replica em `nr13_calc_<TAG>`. `npx vitest run` + `npm run build` PASS.

- [ ] **Step 4: Commit** — `git commit -am "feat(memorial): caldeira elétrica usa motor ASME VIII do vaso (sufixo celetrica)"`

---

### Task 9: Autoclave VERTICAL (`autoclave.ts` + memorial)

**Files:**
- Modify: `src/calc/autoclave.ts`
- Modify: `src/features/memorial/autoclaveMemorialService.ts` (seguir o padrão existente do arquivo — ler antes de editar)
- Modify: `src/features/memorial/MemorialAutoclave.tsx`
- Modify: `src/features/equipamento/ModalCriarEquipamento.tsx` (+ radio "Vertical")
- Modify: `src/pages/Memorial.tsx` (union do subtipo autoclave)
- Test: `src/calc/__tests__/autoclave.test.ts`

**Interfaces:**
- Produces em `src/calc/autoclave.ts`:

```ts
export interface DadosAutoclaveVertical {
  pressao: NumLike; diametro: NumLike; tensao: NumLike; eficiencia?: NumLike; ca?: NumLike;
  c_fator?: NumLike;                       // UG-34, default 0.33 (planilha de referência)
  t_tampo: NumLike; t_costado: NumLike; t_fundo: NumLike;
  tipo_fundo?: 'plano' | 'conico';         // default 'plano'
  alfa?: NumLike;                          // semiângulo do cone (graus), se tipo_fundo='conico'
  n_travas: NumLike; d_trava: NumLike; tensao_trava: NumLike;
  sigma_escoamento?: NumLike; material?: string;
}
export function vertical(dados: DadosAutoclaveVertical): ResultadoCalculo;
// r.t_min = t_req do tampo; r.pmta = min(PMTA tampo, costado, fundo); r.resultado = AND de tudo
```

- [ ] **Step 1: Teste falhando**

```ts
// em src/calc/__tests__/autoclave.test.ts
import { vertical } from '../autoclave';

describe('autoclave vertical', () => {
  // Autoclave_vertical_corrigida_ASME (1).xlsx (fórmula padrão, sem o fator /10 espúrio da planilha)
  const base = {
    pressao: 0.2, diametro: 400, tensao: 138, eficiencia: 1, ca: 1, c_fator: 0.33,
    t_tampo: 8, t_costado: 4, t_fundo: 6, n_travas: 6, d_trava: 12, tensao_trava: 120,
  };

  it('tampo reprova (t_req 8.7477 > 8), costado aprova, travas aprovam, geral REPROVADO', () => {
    const r = vertical(base);
    expect(parseFloat(r.t_min)).toBeCloseTo(8.7477, 3);
    expect(r.resultado).toBe('REPROVADO');
    expect(r.log.join('\n')).toContain('TRAVAS');
  });

  it('fundo cônico bate com a planilha do cone (α=15°, D=680, P=0.69, S=108, E=0.8, t=6.51)', () => {
    const r = vertical({
      pressao: 0.69, diametro: 680, tensao: 108, eficiencia: 0.8, ca: 0, c_fator: 0.3,
      t_tampo: 30, t_costado: 10, t_fundo: 6.51, tipo_fundo: 'conico', alfa: 15,
      n_travas: 8, d_trava: 20, tensao_trava: 138,
    });
    // t_req cone = P·D/(2·cosα·(S·E − 0.6·P)) = 2.8245 mm; PMTA cone = t·S·E/((D/2cosα)+0.6t) = 1.5804
    expect(r.log.join('\n')).toMatch(/2\.82\d* .*mm/);
    expect(r.log.join('\n')).toMatch(/1\.580\d* .*MPa/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Esperado: FAIL (`vertical` não exportada).

- [ ] **Step 3: Implementar** em `autoclave.ts`:

```ts
export function vertical(dados: DadosAutoclaveVertical): ResultadoCalculo {
  const P = num(dados.pressao);
  const D = num(dados.diametro);
  const R = D / 2;
  const S = num(dados.tensao);
  const E = numOuPadrao(dados.eficiencia, 1);
  const CA = numOuPadrao(dados.ca, 0);
  const C = numOuPadrao(dados.c_fator, 0.33);
  const tipoFundo = dados.tipo_fundo ?? 'plano';

  // 1) TAMPO PLANO APARAFUSADO — UG-34
  const tuTampo = num(dados.t_tampo) - CA;
  const treqTampo = D * Math.sqrt((C * P) / (S * E));
  const pmtaTampo = ((S * E) / C) * Math.pow(tuTampo / D, 2);
  const tampo_ok = num(dados.t_tampo) >= treqTampo;

  // 2) COSTADO CILÍNDRICO — UG-27(c)(1)
  const tuCost = num(dados.t_costado) - CA;
  const treqCost = (P * R) / (S * E - 0.6 * P);
  const pmtaCost = (S * E * tuCost) / (R + 0.6 * tuCost);
  const costado_ok = tuCost >= treqCost;

  // 3) FUNDO — plano (UG-34, mesma tampa) ou cônico (UG-32(g))
  const tuFundo = num(dados.t_fundo) - CA;
  let treqFundo: number;
  let pmtaFundo: number;
  let linhasFundo: string[];
  if (tipoFundo === 'conico') {
    const alfaRad = (numOuPadrao(dados.alfa, 15) * Math.PI) / 180;
    const cosA = Math.cos(alfaRad);
    treqFundo = (P * D) / (2 * cosA * (S * E - 0.6 * P));
    pmtaFundo = (tuFundo * S * E) / (D / (2 * cosA) + 0.6 * tuFundo);
    linhasFundo = [
      '// 3. FUNDO CÔNICO — ASME VIII Div.1 UG-32(g)',
      `$$t_{req} = \\frac{P \\cdot D}{2 \\cdot \\cos\\alpha \\cdot (S \\cdot E - 0.6 \\cdot P)} = ${treqFundo.toFixed(4)} \\text{ mm}$$`,
      `$$PMTA = \\frac{t_{util} \\cdot S \\cdot E}{\\frac{D}{2\\cos\\alpha} + 0.6 \\cdot t_{util}} = ${pmtaFundo.toFixed(4)} \\text{ MPa}$$`,
    ];
  } else {
    treqFundo = treqTampo; // planilha de referência: fundo plano dimensionado como a tampa UG-34
    pmtaFundo = ((S * E) / C) * Math.pow(tuFundo / D, 2);
    linhasFundo = [
      '// 3. FUNDO PLANO — UG-34 (mesmo critério da tampa)',
      `$$t_{req} = ${treqFundo.toFixed(4)} \\text{ mm} \\quad PMTA = ${pmtaFundo.toFixed(4)} \\text{ MPa}$$`,
    ];
  }
  const fundo_ok = tuFundo >= treqFundo;

  // 4) TRAVAS — força de separação dividida pelas travas
  const N = num(dados.n_travas);
  const dTrava = num(dados.d_trava);
  const Strava = num(dados.tensao_trava);
  const areaTampa = (Math.PI * D * D) / 4;
  const forcaTotal = P * areaTampa;
  const cargaPorTrava = N > 0 ? forcaTotal / N : Infinity;
  const areaTrava = (Math.PI * dTrava * dTrava) / 4;
  const cargaAdm = areaTrava * Strava;
  const travas_ok = cargaAdm >= cargaPorTrava;

  const pmta = Math.min(pmtaTampo, pmtaCost, pmtaFundo);
  const pmta_ok = pmta >= P;
  const resultadoFinal = tampo_ok && costado_ok && fundo_ok && travas_ok && pmta_ok ? 'APROVADO' : 'REPROVADO';

  const FATOR_TESTE = 1.3;
  const p_teste = pmta * FATOR_TESTE;

  const logTerminal = [
    '// ====================================================',
    '// MEMORIAL DE CÁLCULO - AUTOCLAVE VERTICAL (NR-13)',
    '// Modelo: tampo plano removível com travas (UG-34) + costado cilíndrico (UG-27) + fundo',
    '// ====================================================',
    '// PARÂMETROS DE ENTRADA:',
    `// P = ${P.toFixed(4)} MPa | D = ${D.toFixed(2)} mm | S = ${S.toFixed(2)} MPa | E = ${E.toFixed(2)} | CA = ${CA.toFixed(2)} mm | C = ${C}`,
    `// t_tampo = ${num(dados.t_tampo).toFixed(2)} mm | t_costado = ${num(dados.t_costado).toFixed(2)} mm | t_fundo = ${num(dados.t_fundo).toFixed(2)} mm`,
    `// Travas: N = ${N} | d = ${dTrava.toFixed(2)} mm | S_trava = ${Strava.toFixed(2)} MPa`,
    ' ',
    '// 1. TAMPO PLANO APARAFUSADO — UG-34',
    `$$t_{req} = D\\sqrt{\\frac{C \\cdot P}{S \\cdot E}} = ${D.toFixed(2)}\\sqrt{\\frac{${C} \\cdot ${P}}{${S} \\cdot ${E}}} = ${treqTampo.toFixed(4)} \\text{ mm}$$`,
    `$$PMTA_{tampo} = \\frac{S \\cdot E}{C}\\left(\\frac{t_{util}}{D}\\right)^2 = ${pmtaTampo.toFixed(4)} \\text{ MPa}$$`,
    tampo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> t_tampo (${num(dados.t_tampo).toFixed(2)} mm) ≥ requerida (${treqTampo.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> t_tampo (${num(dados.t_tampo).toFixed(2)} mm) < requerida (${treqTampo.toFixed(3)} mm).</div>`,
    ' ',
    '// 2. COSTADO CILÍNDRICO — UG-27(c)(1)',
    `$$t_{req} = \\frac{P \\cdot R}{S \\cdot E - 0.6 \\cdot P} = ${treqCost.toFixed(4)} \\text{ mm} \\quad PMTA_{costado} = ${pmtaCost.toFixed(4)} \\text{ MPa}$$`,
    costado_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> espessura útil do costado (${tuCost.toFixed(2)} mm) ≥ requerida (${treqCost.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> espessura útil do costado (${tuCost.toFixed(2)} mm) < requerida (${treqCost.toFixed(3)} mm).</div>`,
    ' ',
    ...linhasFundo,
    fundo_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> espessura útil do fundo (${tuFundo.toFixed(2)} mm) ≥ requerida (${treqFundo.toFixed(3)} mm).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> espessura útil do fundo (${tuFundo.toFixed(2)} mm) < requerida (${treqFundo.toFixed(3)} mm).</div>`,
    ' ',
    '// 4. VERIFICAÇÃO DAS TRAVAS',
    `$$A_{tampa} = \\frac{\\pi D^2}{4} = ${areaTampa.toFixed(2)} \\text{ mm}^2 \\quad F = P \\cdot A = ${forcaTotal.toFixed(2)} \\text{ N}$$`,
    `$$F_{trava} = F/N = ${cargaPorTrava.toFixed(2)} \\text{ N} \\quad F_{adm} = A_{trava} \\cdot S_{trava} = ${cargaAdm.toFixed(2)} \\text{ N}$$`,
    travas_ok
      ? `<div style="${CSS_OK}"><b>OK:</b> carga por trava (${cargaPorTrava.toFixed(2)} N) ≤ admissível (${cargaAdm.toFixed(2)} N).</div>`
      : `<div style="${CSS_ERRO}"><b>REPROVADO:</b> carga por trava (${cargaPorTrava.toFixed(2)} N) > admissível (${cargaAdm.toFixed(2)} N).</div>`,
    ' ',
    '// 5. PMTA DO CONJUNTO E TESTE HIDROSTÁTICO',
    `$$PMTA = \\min(PMTA_{tampo}, PMTA_{costado}, PMTA_{fundo}) = ${pmta.toFixed(4)} \\text{ MPa}$$`,
    `$$P_{teste} = 1.3 \\cdot PMTA = ${p_teste.toFixed(4)} \\text{ MPa}$$`,
    ' ',
    `// RESULTADO FINAL: ${resultadoFinal}`,
  ];

  return { t_min: treqTampo.toFixed(4), pmta: pmta.toFixed(4), resultado: resultadoFinal, log: logTerminal };
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run`.

- [ ] **Step 5: UI.** Ler `autoclaveMemorialService.ts` e `MemorialAutoclave.tsx`; seguir exatamente o padrão do subtipo `retangular`: novo ramo `subtipo === 'vertical'` com os campos de `DadosAutoclaveVertical` (Campo numéricos + select tipo_fundo + alfa condicional), botões Gerar/Salvar; salvar grava `nr13_calc_<TAG>` com `{ pmta, pth: pmta*1.3, etampo: t_min, componentes, memorialHTML, logCalculo, resultado }` — montar `componentes: ComponenteResumo[]` com 3 entradas (Tampo UG-34, Costado UG-27, Fundo) e fórmulas em texto:

```ts
const FORMULAS_AUTOCLAVE_VERTICAL: Record<string, [string, string]> = {
  tampo: ['t = D·√(C·P/(S·E))', 'PMTA = (S·E/C)·(t/D)²'],
  costado: ['t = P·R/(S·E − 0,6·P)', 'PMTA = S·E·t/(R + 0,6·t)'],
  fundoPlano: ['t = D·√(C·P/(S·E))', 'PMTA = (S·E/C)·(t/D)²'],
  fundoConico: ['t = P·D/(2·cos α·(S·E − 0,6·P))', 'PMTA = t·S·E/((D/2cos α) + 0,6·t)'],
};
```

Radio "Vertical" no `ModalCriarEquipamento.tsx` (grupo autoclave) e union em `Memorial.tsx`:

```tsx
<MemorialAutoclave tag={tag} subtipo={(info.subtipo as 'retangular' | 'cilindrica' | 'vertical') || 'cilindrica'} />
```

(`SubtipoAutoclave` em `equipamento/tipos.ts` ganha `'vertical'`.)

- [ ] **Step 6: Verificar** — dev: criar autoclave vertical, preencher com os valores da planilha, conferir REPROVADO do tampo e números; `npx vitest run` + `npm run build` PASS.

- [ ] **Step 7: Commit** — `git commit -am "feat(calc): autoclave vertical (tampo UG-34 + costado UG-27 + fundo plano/cônico + travas)"`

---

### Task 10: Verificação final do bloco

**Files:** nenhum novo.

- [ ] **Step 1:** `npx vitest run` — todos PASS (18 antigos + ~10 novos).
- [ ] **Step 2:** `npm run build` — sem erros TS.
- [ ] **Step 3:** Smoke manual (`npm run dev`): criar 1 equipamento de cada tipo novo (caldeira vertical, mista, elétrica; autoclave vertical), gerar e salvar memorial, abrir "Ver Memorial Completo" na ficha e conferir que `nr13_calc_<TAG>` alimenta o RESUMO-MEMORIAL (gerar relatório com a folha 6).
- [ ] **Step 4:** Vaso com campos vazios → banner PENDENTE + avisos no log.
- [ ] **Step 5:** Commit final se sobrou algo + informar o usuário: (a) bug de unidade na planilha da autoclave vertical (fator /10) não replicado; (b) fórmulas flamo/aqua existentes preservadas.
