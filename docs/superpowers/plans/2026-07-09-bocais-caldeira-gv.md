# Bocais UG-37 + Memorial de Caldeira ASME I + Injeção GV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bocais opcionais (com/sem chapa de reforço) no memorial do vaso; memorial de caldeira ASME I-2004 (Costado PG-27.2.2, Tubo PG-27.2.1, Espelho PG-46.1) com injeção nos documentos; cálculo do GV do autoclave injetado nas folhas MEMORIAL/RESUMO logo abaixo do cálculo principal.

**Architecture:** Bocais reusam o motor existente `src/calc/vaso.ts` (caso `'bocal'`) — só UI + validação + injeção de `dadosCascoRef`. Caldeira ganha motor próprio `src/calc/caldeira.ts` + service + tela, salvando payload no formato padrão `nr13_calc_<TAG>` (templates funcionam sem mudança). GV é mesclado em TEMPO DE LEITURA (service de paginação + templates), nunca na gravação.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand não é necessário aqui, vitest (`npm test`), templates HTML estáticos em `public/arquivos-inspecao/`.

**Spec:** `docs/superpowers/specs/2026-07-09-bocais-caldeira-gv-design.md`

## Global Constraints

- Fórmulas da caldeira RIGOROSAMENTE as planilhas: costado `e = P·D/(2·S·E + 2·y·P) + C`; tubo `e = P·D/(2S+P) + 0,005·D + E`; espelho `e = p·√(P/(S·C))`. Valores de conferência: 5,535 / 1,01 / 12,66 mm.
- Caldeira: PMTA = P(MPa) × 10,19716 (kgf/cm²); TH = 1,5 × PMTA. No payload: `pmta = P` (MPa), `pth = 1,5·P` (MPa).
- Bocais 100% OPCIONAIS — zero bocais preserva comportamento atual byte a byte.
- NUNCA mesclar GV na gravação de `nr13_calc_<TAG>` (reintroduziria bug antigo documentado em `vasoMemorialService.ts:141-146`). Merge só na leitura.
- NÃO chamar `atualizarCategoriaComPmta` para caldeira (categoria kPa×m³ é regra de vaso).
- Logs de cálculo seguem o contrato existente: linhas `// comentário`, equações `$$...$$` (KaTeX), status `<span class="msg-aprovado|msg-reprovado">...</span>`, header de bloco `// MEMORIAL DE CÁLCULO: <NOME>` (a paginação de `expandirMemorial` depende desse header).
- Comandos: testes `npm test`, lint `npm run lint`, build `npm run build`. Commits frequentes em `main`.

---

### Task 1: Validação de campos do bocal no motor (`camposFaltantesVaso`)

**Files:**
- Modify: `src/calc/vaso.ts:94-105` (função `camposFaltantesVaso`)
- Test: `src/calc/__tests__/vaso.test.ts` (append)

**Interfaces:**
- Consumes: `camposFaltantesVaso(tipo, dados)` existente.
- Produces: para `tipo === 'bocal'`: exige `S`, `t_comercial`, `d`; NÃO exige `E` (default 1,0 = sem solda); se `temReforco`, exige `w_reforco` e `t_reforco`. Rótulos exatos: `'d — Diâmetro do Bocal'`, `'W — Largura da Chapa de Reforço'`, `'te — Espessura da Chapa de Reforço'`.

- [ ] **Step 1: Write the failing tests** — append em `src/calc/__tests__/vaso.test.ts`:

```ts
describe('camposFaltantesVaso — bocal', () => {
  it('bocal exige d, S e Tnom; E não é obrigatório', () => {
    const f = camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10 });
    expect(f).toEqual(['d — Diâmetro do Bocal']);
  });
  it('bocal com reforço exige W e te', () => {
    const f = camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10, d: 150, temReforco: true });
    expect(f).toContain('W — Largura da Chapa de Reforço');
    expect(f).toContain('te — Espessura da Chapa de Reforço');
  });
  it('bocal completo sem reforço: nada faltante', () => {
    expect(camposFaltantesVaso('bocal', { S: 137.9, t_comercial: 10, d: 150 })).toEqual([]);
  });
});
```

Importar `camposFaltantesVaso` no topo do test file (junto do import existente de `../vaso`).

- [ ] **Step 2: Run** `npm test -- vaso` → os 3 novos FALHAM (bocal hoje exige E e não exige d).

- [ ] **Step 3: Implement** — em `src/calc/vaso.ts`, substituir o corpo de `camposFaltantesVaso`:

```ts
export function camposFaltantesVaso(tipo: TipoComponenteVaso, dados: DadosComponenteVaso): string[] {
  const vazio = (v: NumLike | undefined) =>
    v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;
  const faltantes: string[] = [];
  // bocal/flange têm conjuntos próprios de entrada; S é comum a todos
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (tipo === 'bocal') {
    // E do bocal é OPCIONAL (default 1,0 — bocal sem solda, ver caso 'bocal' do motor)
    if (vazio(dados.t_comercial)) faltantes.push('Tnom — Espessura Comercial');
    if (vazio(dados.d)) faltantes.push('d — Diâmetro do Bocal');
    if (dados.temReforco) {
      if (vazio(dados.w_reforco)) faltantes.push('W — Largura da Chapa de Reforço');
      if (vazio(dados.t_reforco)) faltantes.push('te — Espessura da Chapa de Reforço');
    }
    return faltantes;
  }
  if (tipo !== 'flange') {
    if (vazio(dados.E)) faltantes.push('E — Eficiência de Junta');
    if (vazio(dados.t_comercial)) faltantes.push('Tnom — Espessura Comercial');
  }
  return faltantes;
}
```

- [ ] **Step 4: Run** `npm test -- vaso` → PASS (novos e antigos).
- [ ] **Step 5: Commit** `feat(vaso): validacao de campos especifica do bocal UG-37`

---

### Task 2: `calcularResumoVaso` injeta `dadosCascoRef` nos bocais

**Files:**
- Modify: `src/features/memorial/vasoMemorialService.ts:54-60`
- Test: `src/features/memorial/__tests__/vasoMemorialService.test.ts` (create)

**Interfaces:**
- Consumes: `calcularComponenteVaso` (motor), `VasoSalvo`.
- Produces: bocais na lista `vaso.componentes` calculam com `dadosCascoRef` = `dados` do componente `id === 'casco'` (sem mutar o estado salvo). Consolidação já existente vale: bocal reprovado → REPROVADO; bocal sem PMTA não afeta `pmtaFinal`.

- [ ] **Step 1: Write the failing tests** — criar `src/features/memorial/__tests__/vasoMemorialService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calcularResumoVaso, type VasoSalvo, type ComponenteVasoSalvo } from '../vasoMemorialService';

const fixos: ComponenteVasoSalvo[] = [
  { id: 'tampo1', nome: 'Tampo Inferior', tipo: 'eliptico', dados: { S: 137.9, E: 1, t_comercial: 10, ca: 1, temp: 50, mat: 'SA-516-70' } },
  { id: 'casco', nome: 'Casco Cilíndrico (UG-27c)', tipo: 'cilindrico', dados: { S: 137.9, E: 0.85, t_comercial: 12, ca: 1, temp: 50, mat: 'SA-516-70' } },
  { id: 'tampo2', nome: 'Tampo Superior', tipo: 'eliptico', dados: { S: 137.9, E: 1, t_comercial: 10, ca: 1, temp: 50, mat: 'SA-516-70' } },
];
const base: VasoSalvo = { tag: 'T1', P: 1.0, D: 1000, orientacao: 'vertical', componentes: fixos };
const bocalOk: ComponenteVasoSalvo = {
  id: 'bocal1', nome: 'Bocal N1', tipo: 'bocal',
  dados: { d: 150, t_comercial: 10, ca: 1.5, S: 137.9, temp: 50 },
};

describe('calcularResumoVaso — bocais opcionais', () => {
  it('sem bocal: comportamento atual (3 componentes, APROVADO)', () => {
    const r = calcularResumoVaso(base);
    expect(r.porComponente).toHaveLength(3);
    expect(r.resultado).toBe('APROVADO');
  });

  it('bocal recebe dadosCascoRef do casco automaticamente (sem ERRO SISTÊMICO)', () => {
    const r = calcularResumoVaso({ ...base, componentes: [...fixos, bocalOk] });
    const b = r.porComponente.find((c) => c.id === 'bocal1')!;
    const log = b.resultado.log.join('\n');
    expect(log).not.toContain('ERRO SISTÊMICO');
    expect(log).toContain('UG-37');
  });

  it('bocal não altera a PMTA final', () => {
    const sem = calcularResumoVaso(base);
    const com = calcularResumoVaso({ ...base, componentes: [...fixos, bocalOk] });
    expect(com.pmtaFinal).toBe(sem.pmtaFinal);
  });

  it('bocal reprovado derruba o resultado geral', () => {
    // casco no limite (pouca sobra p/ A1) + pescoço fino (A2=A3=A4=0) → A_disp < A_req
    const cascoJusto: ComponenteVasoSalvo = { ...fixos[1], dados: { ...fixos[1].dados, t_comercial: 5.3 } };
    const bocalRuim: ComponenteVasoSalvo = { ...bocalOk, dados: { ...bocalOk.dados, t_comercial: 2 } };
    const r = calcularResumoVaso({ ...base, componentes: [fixos[0], cascoJusto, fixos[2], bocalRuim] });
    const b = r.porComponente.find((c) => c.id === 'bocal1')!;
    expect(b.resultado.resultado).toBe('REPROVADO');
    expect(r.resultado).toBe('REPROVADO');
  });

  it('bocal incompleto marca PENDENTE', () => {
    const bocalVazio: ComponenteVasoSalvo = { ...bocalOk, dados: { S: 137.9 } };
    const r = calcularResumoVaso({ ...base, componentes: [...fixos, bocalVazio] });
    expect(r.resultado).toBe('PENDENTE');
  });
});
```

- [ ] **Step 2: Run** `npm test -- vasoMemorialService` → falha nos testes de bocal ("ERRO SISTÊMICO" no log, pois `dadosCascoRef` não é injetado).

- [ ] **Step 3: Implement** — em `vasoMemorialService.ts`, dentro de `calcularResumoVaso`, trocar o map inicial:

```ts
export function calcularResumoVaso(vaso: VasoSalvo): ResumoMemorialVaso {
  // Bocais (UG-37) precisam dos dados do casco furado — injeta a referência na hora do
  // cálculo (não muta o estado salvo). Vale pro vaso e pro reuso no autoclave.
  const casco = vaso.componentes.find((c) => c.id === 'casco');
  const porComponente = vaso.componentes.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    resultado: calcularComponenteVaso(
      c.nome,
      c.tipo,
      c.tipo === 'bocal' && casco ? { ...c.dados, dadosCascoRef: casco.dados } : c.dados,
      vaso.D,
      vaso.P,
    ),
  }));
  // ... resto inalterado
```

- [ ] **Step 4: Run** `npm test -- vasoMemorialService` → PASS. Rodar `npm test` completo → nada quebrou.
- [ ] **Step 5: Commit** `feat(memorial): bocais calculam com dadosCascoRef injetado do casco`

---

### Task 3: UI de bocais no MemorialVaso (opcional, adicionar/remover)

**Files:**
- Modify: `src/features/memorial/MemorialVaso.tsx`
- Modify: `src/features/memorial/memorial.css` (estilos novos no fim)

**Interfaces:**
- Consumes: Task 2 (`calcularResumoVaso`), `Campo`, `ComponenteVasoSalvo`.
- Produces: usuário adiciona/remove bocais no stepper; bocal persiste em `vaso.componentes` com id `bocal<N>`, tipo `'bocal'`. `validarCamposVaso` cobre bocal (regras da Task 1) — bocal com reforço marcado exige W/te no Salvar.

Sem teste automatizado de UI no repo — validação = `npm run lint` + `npm run build` + smoke manual no fim (Task 9). Mudanças:

- [ ] **Step 1: Ampliar tipos/estado** em `MemorialVaso.tsx`:
  - `const [abaId, setAbaId] = useState<string>('tampo1');` (era union literal). Ajustar `irPara` para `setAbaId(c.id)` e remover casts `as 'tampo1' | 'casco' | 'tampo2'` (linhas 103, 244, 365 — em 365 manter cast só no `onTipoChange` de tampo).
  - Linha 129 (`escolherOrientacao`): trocar `v.componentes.length === 3` por `v.componentes.length >= 3` (preserva bocais salvos).

- [ ] **Step 2: Funções adicionar/remover** (depois de `atualizarDado`):

```ts
function adicionarBocal() {
  const seq = vaso.componentes
    .filter((c) => c.tipo === 'bocal')
    .reduce((m, c) => Math.max(m, Number(String(c.id).replace('bocal', '')) || 0), 0) + 1;
  const novo: ComponenteVasoSalvo = {
    id: `bocal${seq}`,
    nome: `Bocal N${seq}`,
    tipo: 'bocal',
    dados: { ...DADOS_VAZIOS },
  };
  setVaso((v) => ({ ...v, componentes: [...v.componentes, novo] }));
  setAbaId(`bocal${seq}`);
}

function removerBocal(id: string) {
  if (!window.confirm('Remover este bocal do memorial?')) return;
  setVaso((v) => ({ ...v, componentes: v.componentes.filter((c) => c.id !== id) }));
  setConfirmados((m) => {
    const copia = { ...m };
    delete copia[id];
    return copia;
  });
  if (abaId === id) setAbaId('casco');
}

function atualizarNome(id: string, nome: string) {
  setVaso((v) => ({ ...v, componentes: v.componentes.map((c) => (c.id === id ? { ...c, nome } : c)) }));
}
```

- [ ] **Step 3: validarCamposVaso** — regras específicas do bocal (espelho da Task 1):

```ts
function validarCamposVaso(vaso: VasoSalvo): string[] {
  const erros: string[] = [];
  if (!vaso.P || Number(vaso.P) <= 0) erros.push('Pressão de Projeto (P)');
  if (!vaso.D || Number(vaso.D) <= 0) erros.push('Diâmetro Interno (D)');
  for (const comp of vaso.componentes) {
    const d = comp.dados;
    if (comp.tipo === 'bocal') {
      if (!d.d || Number(d.d) <= 0) erros.push(`${comp.nome}: d — Diâmetro do Bocal`);
      if (!d.S || Number(d.S) <= 0) erros.push(`${comp.nome}: Tensão Admissível (S)`);
      if (!d.t_comercial || Number(d.t_comercial) <= 0) erros.push(`${comp.nome}: Espessura do Pescoço (Tnom)`);
      if (d.temp === undefined || d.temp === null || d.temp === '') erros.push(`${comp.nome}: Temperatura`);
      if (d.temReforco) {
        if (!d.w_reforco || Number(d.w_reforco) <= 0) erros.push(`${comp.nome}: W — Largura da Chapa de Reforço`);
        if (!d.t_reforco || Number(d.t_reforco) <= 0) erros.push(`${comp.nome}: te — Espessura da Chapa de Reforço`);
      }
      continue;
    }
    if (!d.S || Number(d.S) <= 0) erros.push(`${comp.nome}: Tensão Admissível (S)`);
    if (!d.E || Number(d.E) <= 0) erros.push(`${comp.nome}: Eficiência (E)`);
    if (!d.t_comercial || Number(d.t_comercial) <= 0) erros.push(`${comp.nome}: Espessura Nominal (Tnom)`);
    if (d.temp === undefined || d.temp === null || d.temp === '') erros.push(`${comp.nome}: Temperatura`);
  }
  return erros;
}
```

- [ ] **Step 4: Botão "+ Bocal" no stepper** — dentro de `<div className="calc-stepper">`, logo após o `.map` dos componentes:

```tsx
<button
  type="button"
  className="calc-step calc-step-add-bocal"
  onClick={adicionarBocal}
  title="Adicionar bocal (opcional — abertura e reforço UG-37)"
>
  <span className="num">+</span>
  <span className="calc-step-nome">Bocal</span>
</button>
```

- [ ] **Step 5: Campos do bocal no `ComponenteCampos`** — adicionar props `onNomeChange: (nome: string) => void` e `onRemover?: () => void` (passar do caller: `onNomeChange={(n) => atualizarNome(componenteAtivo.id, n)}` e `onRemover={componenteAtivo.tipo === 'bocal' ? () => removerBocal(componenteAtivo.id) : undefined}`). No início do componente:

```tsx
if (componente.tipo === 'bocal') {
  return (
    <div>
      <div className="memorial-bocal-header">
        <p className="memorial-tipo-fixo">Bocal — Abertura e Reforço (ASME UG-37 / UG-40)</p>
        {onRemover && (
          <button type="button" className="btn-remover-bocal" onClick={onRemover}>
            Remover bocal
          </button>
        )}
      </div>
      <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
        <Campo label="Nome do Bocal" type="text" value={componente.nome} warn={false} onChange={onNomeChange} />
        <Campo label="d — Diâm. Interno do Bocal (mm)" value={d.d ?? ''} warn={!d.d || Number(d.d) <= 0} onChange={(v) => onDadoChange('d', v === '' ? '' : Number(v))} />
        <Campo label="Tnom — Esp. do Pescoço (mm)" value={d.t_comercial ?? ''} warn={!d.t_comercial || Number(d.t_comercial) <= 0} onChange={(v) => onDadoChange('t_comercial', v === '' ? '' : Number(v))} />
        <Campo label="CA — Corrosão Adm. (mm)" value={d.ca ?? ''} warn={false} onChange={(v) => onDadoChange('ca', v === '' ? '' : Number(v))} />
        <Campo label="S — Tensão Adm. do Bocal (MPa)" value={d.S ?? ''} warn={!d.S || Number(d.S) <= 0} onChange={(v) => onDadoChange('S', v === '' ? '' : Number(v))} />
        <Campo label="E — Efic. Junta do Bocal" value={d.E ?? ''} warn={false} onChange={(v) => onDadoChange('E', v === '' ? '' : Number(v))} />
        <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onDadoChange('mat', v)} />
        <Campo label="Temp. Projeto (°C)" value={d.temp ?? ''} warn={d.temp === undefined || d.temp === null || d.temp === ''} onChange={(v) => onDadoChange('temp', v === '' ? '' : Number(v))} />
        <Campo label="h — Projeção Interna (mm)" value={d.proj_int ?? ''} warn={false} onChange={(v) => onDadoChange('proj_int', v === '' ? '' : Number(v))} />
      </div>
      <p className="memorial-bocal-nota">E vazio = 1,0 (bocal sem solda). Projeção interna vazia = 0.</p>
      <label className="memorial-check-reforco">
        <input type="checkbox" checked={!!d.temReforco} onChange={(e) => onDadoChange('temReforco', e.target.checked)} />
        Possui chapa de reforço (pad)
      </label>
      {!!d.temReforco && (
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="W — Largura da Chapa (mm)" value={d.w_reforco ?? ''} warn={!d.w_reforco || Number(d.w_reforco) <= 0} onChange={(v) => onDadoChange('w_reforco', v === '' ? '' : Number(v))} />
          <Campo label="te — Esp. da Chapa (mm)" value={d.t_reforco ?? ''} warn={!d.t_reforco || Number(d.t_reforco) <= 0} onChange={(v) => onDadoChange('t_reforco', v === '' ? '' : Number(v))} />
          <Campo label="Sp — Tensão Adm. da Chapa (MPa)" value={d.S_reforco ?? ''} warn={false} onChange={(v) => onDadoChange('S_reforco', v === '' ? '' : Number(v))} />
        </div>
      )}
    </div>
  );
}
```

O `select` de tipo de tampo e a grade padrão continuam no caminho não-bocal (inalterados). ATENÇÃO ao warn do CA na grade padrão: manter como está hoje.

- [ ] **Step 6: CSS** — append em `src/features/memorial/memorial.css` (seguir tokens/cores já usados no arquivo; conferir variáveis existentes antes):

```css
/* ── Bocais opcionais (UG-37) ── */
.calc-step-add-bocal { border-style: dashed; opacity: 0.75; }
.calc-step-add-bocal:hover { opacity: 1; }
.memorial-bocal-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.btn-remover-bocal { background: none; border: 1px solid currentColor; border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; color: #b3403a; }
.memorial-check-reforco { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; cursor: pointer; }
.memorial-bocal-nota { font-size: 11px; opacity: 0.7; margin: 6px 0 0; }
```

- [ ] **Step 7: Verify** `npm run lint` e `npm run build` → sem erros. `npm test` → verde.
- [ ] **Step 8: Commit** `feat(memorial): insercao opcional de bocais com chapa de reforco no vaso`

---

### Task 4: Motor de caldeira `src/calc/caldeira.ts` (ASME I-2004)

**Files:**
- Create: `src/calc/caldeira.ts`
- Test: `src/calc/__tests__/caldeira.test.ts` (create)

**Interfaces:**
- Produces (usado na Task 5):
  - `interface CostadoCaldeira { D?, S?, E?, y?, C?, mat?, espProjeto?, espEncontrada? }`
  - `interface TuboCaldeira { D?, S?, fatorE?, mat?, espProjeto?, espEncontrada? }`
  - `interface EspelhoCaldeira { S?, passo?, cEstais?, mat?, espProjeto?, espEncontrada? }`
  - `interface ResultadoEtapaCaldeira { e: number; resultado: 'APROVADO' | 'REPROVADO'; log: string[]; faltantes: string[] }`
  - `calcularCostadoCaldeira(P: NumLike, temp: NumLike, dados: CostadoCaldeira): ResultadoEtapaCaldeira` (idem `calcularTuboCaldeira`, `calcularEspelhoCaldeira`)
  - `pmtaCaldeiraKgf(P_MPa: number): number` = `P × 10.19716`; `thCaldeiraKgf(P_MPa: number): number` = `1.5 × pmta`; `export const KGF_POR_MPA = 10.19716`

- [ ] **Step 1: Write the failing tests** — criar `src/calc/__tests__/caldeira.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  calcularCostadoCaldeira,
  calcularEspelhoCaldeira,
  calcularTuboCaldeira,
  pmtaCaldeiraKgf,
  thCaldeiraKgf,
} from '../caldeira';

describe('caldeira — costado PG-27.2.2 (valores da planilha)', () => {
  const dados = { D: 1200, S: 108, E: 0.9, y: 0.4, C: 0, espProjeto: 10, espEncontrada: 10, mat: 'ASTM A285 C' };
  it('e = 5,535 mm com P=0,9 D=1200 S=108 E=0,90 y=0,40 C=0', () => {
    const r = calcularCostadoCaldeira(0.9, 25, dados);
    expect(r.e).toBeCloseTo(5.535, 2);
    expect(r.resultado).toBe('APROVADO');
    expect(r.faltantes).toEqual([]);
  });
  it('reprova quando espessura encontrada < e', () => {
    const r = calcularCostadoCaldeira(0.9, 25, { ...dados, espEncontrada: 5 });
    expect(r.resultado).toBe('REPROVADO');
  });
  it('log tem header de bloco e fórmula da norma', () => {
    const r = calcularCostadoCaldeira(0.9, 25, dados);
    const log = r.log.join('\n');
    expect(log).toContain('MEMORIAL DE CÁLCULO: COSTADO');
    expect(log).toContain('PG-27.2.2');
  });
  it('faltantes quando D/S/E/espessura vazios', () => {
    const r = calcularCostadoCaldeira(0.9, 25, {});
    expect(r.faltantes.length).toBeGreaterThanOrEqual(4);
  });
});

describe('caldeira — tubo PG-27.2.1 (valores da planilha)', () => {
  it('e = 1,01 mm com P=0,9 S=90 D=88,9 fatorE=0,12', () => {
    const r = calcularTuboCaldeira(0.9, 25, { D: 88.9, S: 90, fatorE: 0.12, espProjeto: 3.05, espEncontrada: 3.3 });
    expect(r.e).toBeCloseTo(1.01, 2);
    expect(r.resultado).toBe('APROVADO');
  });
});

describe('caldeira — espelho PG-46.1 (valores da planilha)', () => {
  it('e = 12,66 mm com P=0,9 S=118 p=215 C=2,2', () => {
    const r = calcularEspelhoCaldeira(0.9, 25, { S: 118, passo: 215, cEstais: 2.2, espProjeto: 12.7, espEncontrada: 12.7 });
    expect(r.e).toBeCloseTo(12.66, 2);
    expect(r.resultado).toBe('APROVADO');
  });
  it('cEstais vazio assume 2,2 (estais soldados)', () => {
    const r = calcularEspelhoCaldeira(0.9, 25, { S: 118, passo: 215, espEncontrada: 12.7 });
    expect(r.e).toBeCloseTo(12.66, 2);
  });
});

describe('caldeira — PMTA/TH (planilha: PMTA 9,18 / TH 13,77 p/ P=0,9 MPa)', () => {
  it('PMTA = P × 10,19716 kgf/cm²', () => expect(pmtaCaldeiraKgf(0.9)).toBeCloseTo(9.18, 2));
  it('TH = 1,5 × PMTA', () => expect(thCaldeiraKgf(0.9)).toBeCloseTo(13.77, 2));
});
```

- [ ] **Step 2: Run** `npm test -- caldeira` → FAIL (módulo não existe).

- [ ] **Step 3: Implement** — criar `src/calc/caldeira.ts`:

```ts
// Motor de cálculo de CALDEIRAS — ASME Seção I, edição 2004.
// Fórmulas transcritas RIGOROSAMENTE das planilhas de referência do usuário
// (Memorial de Cálculo Costado/Tubo/Espelho): PG-27.2.2, PG-27.2.1 e PG-46.1.
// Unidades internas: MPa e mm (mesma convenção de calc/vaso.ts).
// PMTA (kgf/cm²) = P de projeto × 10,19716 (a planilha NÃO inverte a fórmula pela
// espessura encontrada); TH = 1,5 × PMTA (teste hidrostático de caldeira — difere
// do 1,3 do vaso ASME VIII).
import type { NumLike, Resultado } from './tipos';

export const KGF_POR_MPA = 10.19716;

export function pmtaCaldeiraKgf(pMpa: number): number {
  return pMpa * KGF_POR_MPA;
}
export function thCaldeiraKgf(pMpa: number): number {
  return 1.5 * pmtaCaldeiraKgf(pMpa);
}

interface EtapaCaldeiraBase {
  S?: NumLike; // tensão admissível (MPa)
  mat?: string;
  espProjeto?: NumLike; // espessura de projeto (mm) — informativa
  espEncontrada?: NumLike; // espessura encontrada/medida (mm) — critério de aprovação
}
export interface CostadoCaldeira extends EtapaCaldeiraBase {
  D?: NumLike; // diâmetro (mm)
  E?: NumLike; // eficiência de solda
  y?: NumLike; // coeficiente de temperatura (default 0,40 — planilha)
  C?: NumLike; // sobrecorrosão (mm, default 0)
}
export interface TuboCaldeira extends EtapaCaldeiraBase {
  D?: NumLike; // diâmetro EXTERNO do tubo (mm)
  fatorE?: NumLike; // fator de espessura "e" da PG-27.2.1 (mm, default 0)
}
export interface EspelhoCaldeira extends EtapaCaldeiraBase {
  passo?: NumLike; // passo dos estais p (mm)
  cEstais?: NumLike; // constante C dos estais (default 2,2 — soldados, planilha)
}

export interface ResultadoEtapaCaldeira {
  e: number; // espessura mínima calculada (mm)
  resultado: Resultado;
  log: string[];
  faltantes: string[];
}

function numOuPadrao(v: NumLike, padrao: number): number {
  if (v === undefined || v === null || v === '') return padrao;
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}
const vazio = (v: NumLike | undefined) =>
  v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;

function cabecalho(nome: string, paragrafo: string, P: number, temp: number): string[] {
  return [
    `// ====================================================`,
    `// MEMORIAL DE CÁLCULO: ${nome}`,
    `// Norma Base: ASME Seção I (2004) — Parágrafo ${paragrafo}`,
    `// ====================================================`,
    `// PARÂMETROS GERAIS DE ENTRADA`,
    `// P = ${P.toFixed(4)} MPa (Pressão de Projeto da caldeira)`,
    `// T = ${temp.toFixed(2)} °C (Temperatura de Projeto)`,
  ];
}

function statusEspessura(e: number, encontrada: number): { ok: boolean; linha: string } {
  const ok = encontrada >= e;
  const css = ok ? 'msg-aprovado' : 'msg-reprovado';
  const txt = ok
    ? `STATUS: APROVADO. Espessura encontrada (${encontrada.toFixed(2)} mm) ≥ espessura mínima calculada (${e.toFixed(3)} mm).`
    : `STATUS: REPROVADO! Espessura encontrada (${encontrada.toFixed(2)} mm) < espessura mínima calculada (${e.toFixed(3)} mm).`;
  return { ok, linha: `<span class="${css}">${txt}</span>` };
}

export function calcularCostadoCaldeira(P: NumLike, temp: NumLike, dados: CostadoCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const D = numOuPadrao(dados.D, 0);
  const S = numOuPadrao(dados.S, 0);
  const E = numOuPadrao(dados.E, 0);
  const y = numOuPadrao(dados.y, 0.4);
  const C = numOuPadrao(dados.C, 0);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const denom = 2 * S * E + 2 * y * p;
  const e = denom > 0 ? (p * D) / denom + C : 0;
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.D)) faltantes.push('D — Diâmetro');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.E)) faltantes.push('E — Eficiência de Solda');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('COSTADO (ASME I — PG-27.2.2)', 'PG-27.2.2 — Espessura Mínima do Costado', p, t).concat([
    `// D = ${D.toFixed(2)} mm (Diâmetro) | S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// E = ${E.toFixed(2)} (Eficiência de solda) | y = ${y.toFixed(2)} (Coef. de temperatura) | C = ${C.toFixed(2)} mm (Sobrecorrosão)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-27.2.2)`,
    `$$ e = \\frac{P \\cdot D}{2 \\cdot S \\cdot E + 2 \\cdot y \\cdot P} + C $$`,
    `$$ e = \\frac{${p.toFixed(4)} \\cdot ${D.toFixed(2)}}{2 \\cdot ${S.toFixed(2)} \\cdot ${E.toFixed(2)} + 2 \\cdot ${y.toFixed(2)} \\cdot ${p.toFixed(4)}} + ${C.toFixed(2)} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}

export function calcularTuboCaldeira(P: NumLike, temp: NumLike, dados: TuboCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const D = numOuPadrao(dados.D, 0);
  const S = numOuPadrao(dados.S, 0);
  const fatorE = numOuPadrao(dados.fatorE, 0);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const denom = 2 * S + p;
  const e = denom > 0 ? (p * D) / denom + 0.005 * D + fatorE : 0;
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.D)) faltantes.push('D — Diâmetro do Tubo');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('TUBO (ASME I — PG-27.2.1)', 'PG-27.2.1 — Espessura Mínima do Tubo', p, t).concat([
    `// D = ${D.toFixed(2)} mm (Diâmetro externo do tubo) | S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// e_fator = ${fatorE.toFixed(2)} mm (Fator de espessura da PG-27.2.1)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-27.2.1)`,
    `$$ e = \\frac{P \\cdot D}{2 \\cdot S + P} + 0.005 \\cdot D + e_{fator} $$`,
    `$$ e = \\frac{${p.toFixed(4)} \\cdot ${D.toFixed(2)}}{2 \\cdot ${S.toFixed(2)} + ${p.toFixed(4)}} + 0.005 \\cdot ${D.toFixed(2)} + ${fatorE.toFixed(2)} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}

export function calcularEspelhoCaldeira(P: NumLike, temp: NumLike, dados: EspelhoCaldeira): ResultadoEtapaCaldeira {
  const p = numOuPadrao(P, 0);
  const t = numOuPadrao(temp, 25);
  const S = numOuPadrao(dados.S, 0);
  const passo = numOuPadrao(dados.passo, 0);
  const cEstais = numOuPadrao(dados.cEstais, 2.2);
  const espProj = numOuPadrao(dados.espProjeto, 0);
  const espEnc = numOuPadrao(dados.espEncontrada, 0);

  const radicando = S * cEstais > 0 ? p / (S * cEstais) : 0;
  const e = passo * Math.sqrt(radicando);
  const st = statusEspessura(e, espEnc);

  const faltantes: string[] = [];
  if (vazio(P)) faltantes.push('P — Pressão de Projeto');
  if (vazio(dados.S)) faltantes.push('S — Tensão Admissível');
  if (vazio(dados.passo)) faltantes.push('p — Passo dos Estais');
  if (vazio(dados.espEncontrada)) faltantes.push('Espessura Encontrada');

  const log = cabecalho('ESPELHO DIANTEIRO/TRASEIRO (ASME I — PG-46.1)', 'PG-46.1 — Espessura Mínima do Espelho', p, t).concat([
    `// S = ${S.toFixed(2)} MPa (${dados.mat || 'material não especificado'})`,
    `// p = ${passo.toFixed(2)} mm (Passo dos estais) | C = ${cEstais.toFixed(2)} (Constante — estais soldados: 2,2)`,
    `// Espessura de Projeto = ${espProj.toFixed(2)} mm | Espessura Encontrada = ${espEnc.toFixed(2)} mm`,
    ` `,
    `// 1. ESPESSURA MÍNIMA REQUERIDA (PG-46.1)`,
    `$$ e = p \\cdot \\sqrt{\\frac{P}{S \\cdot C}} $$`,
    `$$ e = ${passo.toFixed(2)} \\cdot \\sqrt{\\frac{${p.toFixed(4)}}{${S.toFixed(2)} \\cdot ${cEstais.toFixed(2)}}} = ${e.toFixed(3)} \\text{ mm} $$`,
    st.linha,
    ` `,
  ]);

  return { e, resultado: st.ok ? 'APROVADO' : 'REPROVADO', log, faltantes };
}
```

- [ ] **Step 4: Run** `npm test -- caldeira` → PASS (todos).
- [ ] **Step 5: Commit** `feat(calc): motor de caldeira ASME I-2004 (PG-27.2.2, PG-27.2.1, PG-46.1)`

---

### Task 5: Service da caldeira (`caldeiraMemorialService.ts`)

**Files:**
- Create: `src/features/memorial/caldeiraMemorialService.ts`
- Test: `src/features/memorial/__tests__/caldeiraMemorialService.test.ts` (create)
- Read antes: `src/features/memorial/tiposMemorial.ts` (shape exato de `ComponenteResumo` — ajustar campos se divergirem do exemplo abaixo)

**Interfaces:**
- Consumes: Task 4 (motor), `formatarMemorialHTML`, `ler/salvar` de `src/services/storage.ts`.
- Produces (usado na Task 6 e 7):
  - `interface CaldeiraSalva { tag: string; P: number | ''; temp: number | ''; costado: CostadoCaldeira; tubo: TuboCaldeira; espelho: EspelhoCaldeira }`
  - `carregarCaldeira(tag): CaldeiraSalva` (chave `nr13_vaso_cald_<TAG>`)
  - `salvarCaldeira(tag, c): Promise<void>`
  - `interface ResumoMemorialCaldeira { etapas: { id: 'costado'|'tubo'|'espelho'; nome: string; resultado: ResultadoEtapaCaldeira }[]; pmtaKgf: number | null; thKgf: number | null; resultado: 'APROVADO'|'REPROVADO'|'PENDENTE'; logCompleto: string[] }`
  - `calcularResumoCaldeira(c: CaldeiraSalva): ResumoMemorialCaldeira`
  - `salvarResumoCaldeira(tag, resumo): Promise<void>` → grava payload padrão em `nr13_calc_<TAG>`

- [ ] **Step 1: Write the failing tests** — criar `src/features/memorial/__tests__/caldeiraMemorialService.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calcularResumoCaldeira, type CaldeiraSalva } from '../caldeiraMemorialService';

const planilha: CaldeiraSalva = {
  tag: 'CAL1',
  P: 0.9,
  temp: 200,
  costado: { D: 1200, S: 108, E: 0.9, y: 0.4, C: 0, espProjeto: 10, espEncontrada: 10, mat: 'A285C' },
  tubo: { D: 88.9, S: 90, fatorE: 0.12, espProjeto: 3.05, espEncontrada: 3.3, mat: 'A178A' },
  espelho: { S: 118, passo: 215, cEstais: 2.2, espProjeto: 12.7, espEncontrada: 12.7, mat: 'A285C' },
};

describe('calcularResumoCaldeira', () => {
  it('caso da planilha: 3 etapas aprovadas, PMTA 9,18 e TH 13,77 kgf/cm²', () => {
    const r = calcularResumoCaldeira(planilha);
    expect(r.etapas).toHaveLength(3);
    expect(r.resultado).toBe('APROVADO');
    expect(r.pmtaKgf).toBeCloseTo(9.18, 2);
    expect(r.thKgf).toBeCloseTo(13.77, 2);
    expect(r.etapas[0].resultado.e).toBeCloseTo(5.535, 2);
    expect(r.etapas[1].resultado.e).toBeCloseTo(1.01, 2);
    expect(r.etapas[2].resultado.e).toBeCloseTo(12.66, 2);
  });

  it('uma etapa reprovada → REPROVADO', () => {
    const r = calcularResumoCaldeira({ ...planilha, tubo: { ...planilha.tubo, espEncontrada: 0.5 } });
    expect(r.resultado).toBe('REPROVADO');
  });

  it('campo obrigatório vazio → PENDENTE', () => {
    const r = calcularResumoCaldeira({ ...planilha, costado: { ...planilha.costado, S: '' } });
    expect(r.resultado).toBe('PENDENTE');
  });

  it('P vazio → PENDENTE e PMTA nula', () => {
    const r = calcularResumoCaldeira({ ...planilha, P: '' });
    expect(r.resultado).toBe('PENDENTE');
    expect(r.pmtaKgf).toBeNull();
  });

  it('log completo tem os 3 blocos + bloco de PMTA/TH final', () => {
    const log = calcularResumoCaldeira(planilha).logCompleto.join('\n');
    expect(log).toContain('MEMORIAL DE CÁLCULO: COSTADO');
    expect(log).toContain('MEMORIAL DE CÁLCULO: TUBO');
    expect(log).toContain('MEMORIAL DE CÁLCULO: ESPELHO');
    expect(log).toContain('PMTA');
    expect(log).toContain('TESTE HIDROSTÁTICO');
  });
});
```

- [ ] **Step 2: Run** `npm test -- caldeiraMemorialService` → FAIL (módulo não existe).

- [ ] **Step 3: Implement** — criar `src/features/memorial/caldeiraMemorialService.ts` (Read `tiposMemorial.ts` primeiro e ajustar `ComponenteResumo` se o shape diferir):

```ts
import { ler, salvar } from '../../services/storage';
import type { ComponenteResumo } from './tiposMemorial';
import { formatarMemorialHTML } from './formatarMemorialHTML';
import {
  calcularCostadoCaldeira,
  calcularEspelhoCaldeira,
  calcularTuboCaldeira,
  pmtaCaldeiraKgf,
  thCaldeiraKgf,
} from '../../calc/caldeira';
import type { CostadoCaldeira, EspelhoCaldeira, ResultadoEtapaCaldeira, TuboCaldeira } from '../../calc/caldeira';

export interface CaldeiraSalva {
  tag: string;
  P: number | ''; // Pressão de projeto (MPa) — global da caldeira
  temp: number | ''; // Temperatura de projeto (°C)
  costado: CostadoCaldeira;
  tubo: TuboCaldeira;
  espelho: EspelhoCaldeira;
}

export interface ResumoMemorialCaldeira {
  etapas: { id: 'costado' | 'tubo' | 'espelho'; nome: string; resultado: ResultadoEtapaCaldeira }[];
  pmtaKgf: number | null;
  thKgf: number | null;
  resultado: 'APROVADO' | 'REPROVADO' | 'PENDENTE';
  logCompleto: string[];
}

const chaveCaldeira = (tag: string) => `nr13_vaso_cald_${tag}`;

export function carregarCaldeira(tag: string): CaldeiraSalva {
  return ler<CaldeiraSalva>(chaveCaldeira(tag)) || { tag, P: '', temp: '', costado: {}, tubo: {}, espelho: {} };
}

export async function salvarCaldeira(tag: string, c: CaldeiraSalva): Promise<void> {
  await salvar(chaveCaldeira(tag), c);
}

// PMTA da caldeira = pressão de projeto convertida (planilha de referência do usuário) e
// TH = 1,5 × PMTA — NÃO inverte a fórmula pela espessura encontrada (decisão de engenharia).
export function calcularResumoCaldeira(c: CaldeiraSalva): ResumoMemorialCaldeira {
  const etapas: ResumoMemorialCaldeira['etapas'] = [
    { id: 'costado', nome: 'Costado (PG-27.2.2)', resultado: calcularCostadoCaldeira(c.P, c.temp, c.costado) },
    { id: 'tubo', nome: 'Tubo (PG-27.2.1)', resultado: calcularTuboCaldeira(c.P, c.temp, c.tubo) },
    { id: 'espelho', nome: 'Espelho Diant./Tras. (PG-46.1)', resultado: calcularEspelhoCaldeira(c.P, c.temp, c.espelho) },
  ];

  const pNum = Number(c.P);
  const temP = Number.isFinite(pNum) && pNum > 0;
  const pmtaKgf = temP ? pmtaCaldeiraKgf(pNum) : null;
  const thKgf = temP ? thCaldeiraKgf(pNum) : null;

  const temFaltantes =
    !temP ||
    c.temp === '' || c.temp === null || c.temp === undefined ||
    etapas.some((e) => e.resultado.faltantes.length > 0);
  const resultado = temFaltantes
    ? 'PENDENTE'
    : etapas.every((e) => e.resultado.resultado === 'APROVADO')
      ? 'APROVADO'
      : 'REPROVADO';

  const blocoFinal = [
    `// ====================================================`,
    `// MEMORIAL DE CÁLCULO: PMTA E TESTE HIDROSTÁTICO DA CALDEIRA`,
    `// ====================================================`,
    `// PMTA (kgf/cm²) = P × 10,19716 = ${pmtaKgf != null ? pmtaKgf.toFixed(2) : '--'} kgf/cm²`,
    `// TESTE HIDROSTÁTICO: TH = 1,5 × PMTA = ${thKgf != null ? thKgf.toFixed(2) : '--'} kgf/cm²`,
    `<span class="${resultado === 'APROVADO' ? 'msg-aprovado' : 'msg-reprovado'}">RESULTADO FINAL: CALDEIRA ${resultado}.</span>`,
    ` `,
  ];

  return {
    etapas,
    pmtaKgf,
    thKgf,
    resultado,
    logCompleto: etapas.flatMap((e) => e.resultado.log).concat(blocoFinal),
  };
}

const FORMULAS_CALDEIRA: Record<string, [string, string]> = {
  costado: ['e = P·D / (2·S·E + 2·y·P) + C', 'PMTA = P de projeto (kgf/cm²) — PG-27.2.2'],
  tubo: ['e = P·D / (2·S + P) + 0,005·D + e', 'PMTA = P de projeto (kgf/cm²) — PG-27.2.1'],
  espelho: ['e = p·√(P / (S·C))', 'PMTA = P de projeto (kgf/cm²) — PG-46.1'],
};

function numV(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// Payload no MESMO shape do vaso (ver salvarResumoVaso) — RESUMO-MEMORIAL.html,
// MEMORIAL.html e a ficha ("Ver Memorial") funcionam sem alteração de template.
export async function salvarResumoCaldeira(tag: string, resumo: ResumoMemorialCaldeira): Promise<void> {
  const c = carregarCaldeira(tag);
  const P = numV(c.P);
  const dadosPorEtapa: Record<string, CostadoCaldeira & TuboCaldeira & EspelhoCaldeira> = {
    costado: c.costado, tubo: c.tubo, espelho: c.espelho,
  };
  const componentes: ComponenteResumo[] = resumo.etapas.map((e) => {
    const d = dadosPorEtapa[e.id];
    const f = FORMULAS_CALDEIRA[e.id];
    return {
      nome: e.nome,
      pmtaMpa: P,
      tReqMm: e.resultado.e,
      tNom: numV(d.espEncontrada),
      E: e.id === 'costado' ? numV((d as CostadoCaldeira).E) : null,
      S: numV(d.S),
      D: e.id === 'espelho' ? null : numV((d as CostadoCaldeira).D),
      raio: e.id === 'costado' && numV(d.D) != null ? (numV(d.D) as number) / 2 : null,
      ca: e.id === 'costado' ? numV((d as CostadoCaldeira).C) : null,
      material: d.mat || null,
      formulaT: f[0],
      formulaP: f[1],
    };
  });
  const payload = {
    pmta: P != null ? P.toFixed(2) : '', // MPa — templates convertem p/ kgf/bar
    pth: P != null ? (1.5 * P).toFixed(2) : '', // MPa (TH caldeira = 1,5×)
    ecasco: resumo.etapas[0].resultado.e.toFixed(3),
    etampo: resumo.etapas[2].resultado.e.toFixed(3),
    componentes,
    memorialHTML: formatarMemorialHTML(resumo.logCompleto),
    logCalculo: resumo.logCompleto,
    resultado: resumo.resultado,
  };
  await salvar(`nr13_calc_${tag}`, payload);
  // NÃO chamar atualizarCategoriaComPmta: categoria (kPa×m³) é regra de VASO; caldeira não usa.
}
```

- [ ] **Step 4: Run** `npm test -- caldeiraMemorialService` → PASS. `npm run lint` limpo.
- [ ] **Step 5: Commit** `feat(memorial): service do memorial de caldeira (payload padrao nr13_calc)`

---

### Task 6: Tela `MemorialCaldeira.tsx` + rota em `Memorial.tsx`

**Files:**
- Create: `src/features/memorial/MemorialCaldeira.tsx`
- Modify: `src/pages/Memorial.tsx:41-49` (trocar aviso pelo componente)

**Interfaces:**
- Consumes: Task 5 (service), `Campo`, `TerminalMemorial`, `MemorialLog`, `comLoadingGlobal`, `useAvisoSairSemSalvar`, `Icone`.
- Produces: `<MemorialCaldeira tag={tag} />`. Mesmo UX do MemorialVaso: stepper 3 etapas, OK por etapa, GERAR CÁLCULO, terminal com filtro, Salvar.

- [ ] **Step 1: Criar o componente** — `src/features/memorial/MemorialCaldeira.tsx`. Modelar no `MemorialVaso.tsx` (mesmas classes CSS `calc-*`/`memorial-*`; reutilizar sem criar CSS novo). Estrutura completa:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import TerminalMemorial from './TerminalMemorial';
import {
  calcularResumoCaldeira,
  carregarCaldeira,
  salvarCaldeira,
  salvarResumoCaldeira,
  type CaldeiraSalva,
  type ResumoMemorialCaldeira,
} from './caldeiraMemorialService';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
import './memorial.css';

type EtapaId = 'costado' | 'tubo' | 'espelho';

const ETAPAS: { id: EtapaId; nome: string }[] = [
  { id: 'costado', nome: 'Costado' },
  { id: 'tubo', nome: 'Tubo' },
  { id: 'espelho', nome: 'Espelho' },
];

interface Props { tag: string }

export default function MemorialCaldeira({ tag }: Props) {
  return <MemorialCaldeiraInner key={tag} tag={tag} />;
}

function validarCamposCaldeira(c: CaldeiraSalva): string[] {
  const erros: string[] = [];
  const falta = (v: unknown) => v === '' || v === null || v === undefined || Number(v) <= 0;
  if (falta(c.P)) erros.push('Pressão de Projeto (P)');
  if (c.temp === '' || c.temp === null || c.temp === undefined) erros.push('Temperatura de Projeto');
  if (falta(c.costado.D)) erros.push('Costado: D — Diâmetro');
  if (falta(c.costado.S)) erros.push('Costado: S — Tensão Admissível');
  if (falta(c.costado.E)) erros.push('Costado: E — Eficiência de Solda');
  if (falta(c.costado.espEncontrada)) erros.push('Costado: Espessura Encontrada');
  if (falta(c.tubo.D)) erros.push('Tubo: D — Diâmetro');
  if (falta(c.tubo.S)) erros.push('Tubo: S — Tensão Admissível');
  if (falta(c.tubo.espEncontrada)) erros.push('Tubo: Espessura Encontrada');
  if (falta(c.espelho.S)) erros.push('Espelho: S — Tensão Admissível');
  if (falta(c.espelho.passo)) erros.push('Espelho: p — Passo dos Estais');
  if (falta(c.espelho.espEncontrada)) erros.push('Espelho: Espessura Encontrada');
  return erros;
}

function MemorialCaldeiraInner({ tag }: Props) {
  const [cald, setCald] = useState<CaldeiraSalva>(() => carregarCaldeira(tag));
  const [abaId, setAbaId] = useState<EtapaId>('costado');
  const [resumo, setResumo] = useState<ResumoMemorialCaldeira | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<string>('full');
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) setDirty(true);
    else montou.current = true;
  }, [cald]);
  useAvisoSairSemSalvar(dirty);

  function atualizarEtapa(id: EtapaId, chave: string, valor: unknown) {
    setCald((c) => ({ ...c, [id]: { ...c[id], [chave]: valor } }));
    setConfirmados((m) => (m[id] ? { ...m, [id]: false } : m));
  }

  function handleCalcular() {
    setResumo(calcularResumoCaldeira(cald));
    setGeradoEm(new Date());
    setCalcCount((n) => n + 1);
    setDirty(true);
  }

  async function salvar() {
    if (!resumo) { alert('Gere o cálculo antes de salvar.'); return; }
    const erros = validarCamposCaldeira(cald);
    if (erros.length > 0) {
      alert('Preencha os seguintes campos antes de salvar:\n• ' + erros.join('\n• '));
      return;
    }
    if (!window.confirm('Salvar o cálculo do memorial? Os dados ficarão disponíveis em "Ver Memorial".')) return;
    setSalvando(true);
    try {
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarCaldeira(tag, cald);
        await salvarResumoCaldeira(tag, resumo);
      });
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  const idxAtivo = ETAPAS.findIndex((e) => e.id === abaId);
  const ehUltimo = idxAtivo === ETAPAS.length - 1;
  const etapaResultado = resumo?.etapas.find((e) => e.id === abaId)?.resultado ?? null;
  const qtdConfirmados = ETAPAS.filter((e) => confirmados[e.id]).length;
  const todosConfirmados = qtdConfirmados === ETAPAS.length;
  const progresso = (qtdConfirmados / ETAPAS.length) * 100;

  function confirmarEtapa() {
    setConfirmados((m) => ({ ...m, [abaId]: true }));
    if (!ehUltimo) setTimeout(() => setAbaId(ETAPAS[idxAtivo + 1].id), 450);
  }

  const cabecalhoTerminal =
    resumo && geradoEm
      ? {
          titulo: `Memorial de Cálculo — TAG: ${tag}`,
          sub:
            `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ` +
            `${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` +
            ` · NR-13 / ASME Seção I (2004)`,
        }
      : undefined;

  const statusFinal = resumo?.resultado ?? null;
  const pmtaDisplay = resumo?.pmtaKgf != null ? `${resumo.pmtaKgf.toFixed(2)} kgf/cm²` : '--';
  const thDisplay = resumo?.thKgf != null ? `${resumo.thKgf.toFixed(2)} kgf/cm²` : '--';
  const eMinDisplay = etapaResultado ? etapaResultado.e.toFixed(3) : '--';

  const logParaMostrar =
    filtro === 'full'
      ? resumo?.logCompleto ?? []
      : resumo?.etapas.find((e) => e.id === filtro)?.resultado.log ?? [];
  const filtrosTerminal = [{ id: 'full', label: 'Completo' }, ...ETAPAS.map((e) => ({ id: e.id, label: e.nome }))];

  return (
    <div className="calc-calculadora">
      <div className="calc-card-top-bar">
        <div className="calc-top-row">
          <div className="calc-stepper">
            {ETAPAS.map((e, i) => {
              const done = !!confirmados[e.id];
              const res = resumo?.etapas.find((r) => r.id === e.id);
              return (
                <span key={e.id} className="calc-step-item">
                  <button type="button" className={`calc-step ${e.id === abaId ? 'ativa' : ''} ${done ? 'done' : ''}`} onClick={() => setAbaId(e.id)}>
                    <span className="num">
                      {done ? (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="calc-step-nome">{e.nome}</span>
                    {res && <span className={`calc-tab-dot ${res.resultado.resultado === 'APROVADO' ? 'ok' : 'err'}`} />}
                  </button>
                  {i < ETAPAS.length - 1 && (
                    <span className={`calc-step-arrow ${done ? 'filled' : ''}`}><Icone nome="chevright" tam={15} /></span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <div className="calc-progress"><i style={{ width: `${progresso}%` }} /></div>
      </div>

      <div className="calc-card-body">
        <div className="calc-campos-section">
          <p className="memorial-legenda-aviso">
            <span className="campo-aviso-icon">⚠</span> = campo obrigatório sem valor válido. O cálculo usa
            valores padrão nesses campos e o memorial sai como <b>PENDENTE</b> até você preencher.
          </p>
          <div className="memorial-campos-grid">
            <Campo label="Pressão de Projeto P (MPa)" value={cald.P} warn={!cald.P || Number(cald.P) <= 0}
              onChange={(v) => setCald((s) => ({ ...s, P: v === '' ? '' : Number(v) }))} />
            <Campo label="Temp. de Projeto (°C)" value={cald.temp} warn={cald.temp === '' || cald.temp === null || cald.temp === undefined}
              onChange={(v) => setCald((s) => ({ ...s, temp: v === '' ? '' : Number(v) }))} />
          </div>

          <EtapaCampos etapa={abaId} cald={cald} onChange={(chave, valor) => atualizarEtapa(abaId, chave, valor)} />

          <div className="calc-nav-row">
            <button type="button" className="btn-nav-ghost" disabled={idxAtivo === 0} onClick={() => setAbaId(ETAPAS[idxAtivo - 1].id)}>
              <Icone nome="chevleft" tam={15} />
              Voltar
            </button>
            <div className="calc-nav-right">
              <button type="button" className={`btn-ok ${confirmados[abaId] ? 'confirmed' : ''}`} onClick={confirmarEtapa}>
                {confirmados[abaId] ? (<><Icone nome="check" tam={14} />Salvo</>) : 'OK'}
              </button>
              {ehUltimo ? (
                <span className="calc-nav-nota">Última etapa</span>
              ) : (
                <button type="button" className="btn-nav-next" onClick={() => setAbaId(ETAPAS[idxAtivo + 1].id)}>
                  Próximo
                  <Icone nome="chevright" tam={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="calc-equip-section">
          <Icone nome="flame" tam={44} />
          <span className="calc-equip-label">{ETAPAS[idxAtivo].nome} — ASME I (2004)</span>
          {etapaResultado && (
            <span className={`resultado-final-badge ${etapaResultado.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`} style={{ fontSize: 11 }}>
              {etapaResultado.resultado}
            </span>
          )}
        </div>
      </div>

      {resumo && resumo.resultado === 'PENDENTE' && (
        <div className="memorial-banner-pendente">
          <b>Cálculo PENDENTE — campos obrigatórios sem valor:</b>
          <ul>
            {resumo.etapas
              .filter((e) => e.resultado.faltantes.length > 0)
              .map((e) => (<li key={e.id}>{e.nome}: {e.resultado.faltantes.join(', ')}</li>))}
            {(!cald.P || Number(cald.P) <= 0) && <li>Dados gerais: P — Pressão de Projeto</li>}
            {(cald.temp === '' || cald.temp === null || cald.temp === undefined) && <li>Dados gerais: Temperatura de Projeto</li>}
          </ul>
        </div>
      )}

      <div className="calc-pmta-bar">
        <span>PMTA: <span className="calc-pmta-valor">{pmtaDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>e mín. da etapa: <span className="calc-pmta-valor">{eMinDisplay} mm</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>TH (1,5×PMTA): <span className="calc-pmta-valor">{thDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>Status:{' '}
          <span className={statusFinal === 'APROVADO' ? 'calc-pmta-status-ok' : statusFinal === 'REPROVADO' ? 'calc-pmta-status-err' : ''}>
            {statusFinal ?? '--'}
          </span>
        </span>
      </div>

      <div className="calc-acoes-bar">
        <button type="button" className={`btn-gerar-calculo ${todosConfirmados ? 'ready' : ''}`} onClick={handleCalcular}>
          Σ GERAR CÁLCULO
        </button>
        <span className="calc-terminal-label">Memória de Cálculo — Caldeira (ASME I)</span>
        <button type="button" className={`btn-primario ${salvando ? 'is-loading' : ''}`} onClick={salvar}
          disabled={!resumo || salvando} style={{ opacity: resumo ? 1 : 0.4, fontSize: 12 }}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <TerminalMemorial
        arquivo={`memorial_caldeira_${tag.toLowerCase().replace(/\s+/g, '_')}.log`}
        status={
          statusFinal === 'APROVADO' ? 'aprovado'
            : statusFinal === 'REPROVADO' ? 'reprovado'
              : statusFinal === 'PENDENTE' ? 'pendente'
                : 'aguardando'
        }
        filtros={filtrosTerminal}
        filtroAtivo={filtro}
        onFiltro={setFiltro}
        cabecalho={cabecalhoTerminal}
      >
        <MemorialLog
          key={`${calcCount}-${filtro}`}
          log={logParaMostrar}
          animado={calcCount > 0}
          showPlaceholder={calcCount === 0}
          placeholder={'>> Insira os dados da caldeira e clique em "Gerar Cálculo"...'}
        />
      </TerminalMemorial>
    </div>
  );
}

function EtapaCampos({ etapa, cald, onChange }: { etapa: EtapaId; cald: CaldeiraSalva; onChange: (chave: string, valor: unknown) => void }) {
  const num = (v: string) => (v === '' ? '' : Number(v));
  const falta = (v: unknown) => v === '' || v === null || v === undefined || Number(v) <= 0;
  if (etapa === 'costado') {
    const d = cald.costado;
    return (
      <div>
        <p className="memorial-tipo-fixo">Costado — ASME I-2004, PG-27.2.2 · e = P·D/(2·S·E + 2·y·P) + C</p>
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="D — Diâmetro (mm)" value={d.D ?? ''} warn={falta(d.D)} onChange={(v) => onChange('D', num(v))} />
          <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
          <Campo label="E — Eficiência de Solda" value={d.E ?? ''} warn={falta(d.E)} onChange={(v) => onChange('E', num(v))} />
          <Campo label="y — Coef. de Temperatura" value={d.y ?? ''} warn={false} onChange={(v) => onChange('y', num(v))} />
          <Campo label="C — Sobrecorrosão (mm)" value={d.C ?? ''} warn={false} onChange={(v) => onChange('C', num(v))} />
          <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
          <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
          <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
        <p className="memorial-bocal-nota">y vazio = 0,40 (planilha). C vazio = 0.</p>
      </div>
    );
  }
  if (etapa === 'tubo') {
    const d = cald.tubo;
    return (
      <div>
        <p className="memorial-tipo-fixo">Tubo — ASME I-2004, PG-27.2.1 · e = P·D/(2S+P) + 0,005·D + e</p>
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="D — Diâm. Externo do Tubo (mm)" value={d.D ?? ''} warn={falta(d.D)} onChange={(v) => onChange('D', num(v))} />
          <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
          <Campo label="e — Fator de Espessura (mm)" value={d.fatorE ?? ''} warn={false} onChange={(v) => onChange('fatorE', num(v))} />
          <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
          <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
          <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
      </div>
    );
  }
  const d = cald.espelho;
  return (
    <div>
      <p className="memorial-tipo-fixo">Espelho Dianteiro/Traseiro — ASME I-2004, PG-46.1 · e = p·√(P/(S·C))</p>
      <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
        <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
        <Campo label="p — Passo dos Estais (mm)" value={d.passo ?? ''} warn={falta(d.passo)} onChange={(v) => onChange('passo', num(v))} />
        <Campo label="C — Constante dos Estais" value={d.cEstais ?? ''} warn={false} onChange={(v) => onChange('cEstais', num(v))} />
        <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
        <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
        <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
      </div>
      <p className="memorial-bocal-nota">C vazio = 2,2 (estais soldados — planilha).</p>
    </div>
  );
}
```

Notas: conferir se o sprite `Icone` tem `flame` (Dashboard.tsx usa `Caldeira: 'flame'`); se `TerminalMemorial`/`MemorialLog` tiverem props diferentes, seguir exatamente o uso do MemorialVaso.

- [ ] **Step 2: Ligar em `Memorial.tsx`** — substituir o bloco do aviso (linhas 41-49):

```tsx
{info.tipo === 'caldeira' && <MemorialCaldeira tag={tag} />}
```

com `import MemorialCaldeira from '../features/memorial/MemorialCaldeira';` no topo. Remover a classe `memorial-aviso-desativado` só se não for usada em outro lugar (grep antes).

- [ ] **Step 3: Verify** `npm run lint`, `npm run build`, `npm test` → verdes.
- [ ] **Step 4: Commit** `feat(memorial): tela de memorial de caldeira ASME I com stepper de 3 etapas`

---

### Task 7: Injeção da caldeira no prontuário (`Prontuarios.tsx`)

**Files:**
- Modify: `src/pages/Prontuarios.tsx:352` (substituir comentário "desativada")

**Interfaces:**
- Consumes: `carregarCaldeira` (Task 5), helpers `pb`/`pd`/`str` locais do arquivo.

- [ ] **Step 1: Implement** — substituir a linha `// Caldeira: injeção do memorial desativada (cálculos em revisão de engenharia).` por:

```ts
if (eq.info.tipo === 'caldeira') {
  pb('codigoProjeto', 'ASME Seção I');
  pb('anoEdicao', '2004');
  const cald = carregarCaldeira(eq.tag);
  if (cald.costado.D) pd('diametro', str(cald.costado.D));
  if (cald.costado.espEncontrada) pd('espCorpo', str(cald.costado.espEncontrada));
  if (cald.costado.C) pb('sobreespessura', str(cald.costado.C) + ' mm');
  if (cald.temp !== '' && cald.temp != null) pb('tempProjeto', str(cald.temp) + ' °C');
  if (cald.costado.mat) pb('fundoCorpo', cald.costado.mat);
  if (cald.espelho.espEncontrada) {
    pd('espFundo', str(cald.espelho.espEncontrada));
    pd('espTampa', str(cald.espelho.espEncontrada));
  }
  if (cald.espelho.mat) pb('tampa', cald.espelho.mat);
}
```

Import no topo: `import { carregarCaldeira } from '../features/memorial/caldeiraMemorialService';`

- [ ] **Step 2: Verify** `npm run lint`, `npm run build` → verdes.
- [ ] **Step 3: Commit** `feat(prontuario): reativa injecao do memorial de caldeira (ASME I)`

---

### Task 8: GV do autoclave nas folhas MEMORIAL e RESUMO-MEMORIAL (merge na leitura)

**Files:**
- Modify: `src/features/relatorios/relatoriosService.ts:193-203` (`linhasMemorial`)
- Modify: `public/arquivos-inspecao/MEMORIAL.html` (~linha 207 e ~247)
- Modify: `public/arquivos-inspecao/RESUMO-MEMORIAL.html` (~linha 705, `buildResumoDinamico`)
- Test: `src/features/relatorios/__tests__/relatoriosService.test.ts` (create)

**Interfaces:**
- Consumes: `expandirMemorial(tag, docs)` exportado; storage `ler`.
- Produces: linhas do memorial do GV (`nr13_calc_gv_<TAG>.memorialHTML`) concatenadas APÓS as do principal, em `linhasMemorial` (service) e `extrairLinhas` (template) — contrato de índices `from/to` 1:1 preservado. `RESUMO-MEMORIAL` concatena `componentes[]` do GV com prefixo "GV — ".

- [ ] **Step 1: Write the failing test** — criar `src/features/relatorios/__tests__/relatoriosService.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { expandirMemorial } from '../relatoriosService';

function calcCom(linhas: string[]): string {
  return JSON.stringify({ memorialHTML: '<div class="katex-render">' + linhas.join('<br>') + '</div>' });
}

describe('expandirMemorial — merge do GV do autoclave', () => {
  beforeEach(() => localStorage.clear());

  it('sem chave gv: paginação inalterada (to = nº de linhas do principal)', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a', 'linha b']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=3');
  });

  it('com nr13_calc_gv_<TAG>: linhas do GV entram após as do principal', () => {
    localStorage.setItem('nr13_calc_AC1', calcCom(['MEMORIAL DE CÁLCULO: CORPO', 'linha a']));
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=4');
  });

  it('gv sem principal: só as linhas do gv', () => {
    localStorage.setItem('nr13_calc_gv_AC1', calcCom(['MEMORIAL DE CÁLCULO: GERADOR DE VAPOR', 'linha gv']));
    const docs = expandirMemorial('AC1', ['MEMORIAL.html']);
    expect(docs[docs.length - 1]).toContain('to=2');
  });
});
```

(Confirmar como `ler` de `src/services/storage.ts` lê o localStorage — se envolver prefixo/parse diferente, ajustar o setup do teste para gravar no formato que `ler` espera.)

- [ ] **Step 2: Run** `npm test -- relatoriosService` → os testes de gv FALHAM (to=2 em vez de 4 etc.).

- [ ] **Step 3: Implement no service** — refatorar `linhasMemorial` extraindo helper:

```ts
function linhasDeMemorialHTML(html: string): string[] {
  const m = html.match(/<div class="katex-render">([\s\S]*)<\/div>/i);
  const corpo = m ? m[1] : html;
  return corpo
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, '').trim())
    .filter((t) => t && t !== '&nbsp;' && !ehCabecalhoMemorial(t));
}

// Mesmo filtro de linhas do template MEMORIAL.html (1:1 por índice) — base da paginação.
// GV do autoclave (nr13_calc_gv_<TAG>) é mesclado APÓS o principal, na LEITURA — o template
// MEMORIAL.html faz a mesma concatenação, mantendo o contrato de índices from/to.
function linhasMemorial(tag: string): string[] {
  const calc = ler<{ memorialHTML?: string }>(`nr13_calc_${tag}`);
  const linhas = calc?.memorialHTML ? linhasDeMemorialHTML(calc.memorialHTML) : [];
  const gv = ler<{ memorialHTML?: string }>(`nr13_calc_gv_${tag}`);
  if (gv?.memorialHTML) linhas.push(...linhasDeMemorialHTML(gv.memorialHTML));
  return linhas;
}
```

- [ ] **Step 4: Run** `npm test -- relatoriosService` → PASS.

- [ ] **Step 5: MEMORIAL.html** — após a linha `var calc = JSON.parse(localStorage.getItem('nr13_calc_' + tag) || '{}');` adicionar:

```js
var calcGv = JSON.parse(localStorage.getItem('nr13_calc_gv_' + tag) || '{}');
```

E onde monta as linhas (`var res = extrairLinhas(calc, pref); var linhas = res.linhas;`):

```js
var res = extrairLinhas(calc, pref);
var linhas = res.linhas;
// GV do autoclave: mescla na LEITURA, na mesma ordem/filtragem do relatoriosService
// (linhasMemorial) — os índices from/to da paginação são 1:1 com esta lista.
if (calcGv && calcGv.memorialHTML) {
    linhas = linhas.concat(extrairLinhas(calcGv, pref).linhas);
}
```

- [ ] **Step 6: RESUMO-MEMORIAL.html** — em `buildResumoDinamico()`, após ler `var comps = calc.componentes;` e antes do `if (!Array.isArray(comps)...)`:

```js
// GV do autoclave: componentes do gerador de vapor entram logo abaixo dos do corpo principal.
var gvCalc = {};
try { gvCalc = JSON.parse(localStorage.getItem('nr13_calc_gv_' + tag) || '{}'); } catch (e) {}
if (Array.isArray(gvCalc.componentes) && gvCalc.componentes.length > 0) {
    var gvComps = gvCalc.componentes.map(function (c) {
        var n = String(c.nome || 'COMPONENTE');
        var copia = {}; for (var k in c) copia[k] = c[k];
        copia.nome = /^GV\b/i.test(n) ? n : 'GV — ' + n;
        return copia;
    });
    comps = (Array.isArray(comps) ? comps : []).concat(gvComps);
}
```

- [ ] **Step 7: Verify** `npm test`, `npm run lint`, `npm run build` → verdes.
- [ ] **Step 8: Commit** `feat(relatorios): memorial do GV do autoclave injetado abaixo do calculo principal`

---

### Task 9: Documentação (CLAUDE.md) + verificação final

**Files:**
- Modify: `CLAUDE.md` (§2 tabela de chaves + remover nota de caldeira desativada se houver)

- [ ] **Step 1: CLAUDE.md** — na tabela de chaves do §2, adicionar linha:

```
| `nr13_vaso_cald_<TAG>` | Dados do memorial de caldeira (ASME I: costado/tubo/espelho) | Memorial da caldeira |
```

E no §3 ou onde couber, nota curta: memorial de caldeira usa ASME I-2004 (PG-27.2.2/PG-27.2.1/PG-46.1), PMTA = P convertida, TH = 1,5×PMTA; bocais opcionais (UG-37) entram em `nr13_vaso_<TAG>.componentes` com id `bocal<N>`; folhas MEMORIAL/RESUMO mesclam `nr13_calc_gv_<TAG>` na leitura.

- [ ] **Step 2: Verificação completa**

```
npm test        → todos verdes
npm run lint    → sem erros
npm run build   → build ok
```

- [ ] **Step 3: Smoke manual (dev server)** — `npm run dev`; criar equipamento tipo caldeira, preencher com os valores da planilha (P=0,9; costado D=1200 S=108 E=0,9 y=0,4 C=0 esp=10; tubo D=88,9 S=90 e=0,12 esp=3,3; espelho S=118 p=215 C=2,2 esp=12,7), conferir na tela: e = 5,535 / 1,007 / 12,66 mm, PMTA 9,18, TH 13,77, APROVADO. Num vaso, adicionar bocal e conferir bloco UG-37 no terminal. Salvar e conferir "Ver Memorial" na ficha.

- [ ] **Step 4: Commit final** `docs: registra chave nr13_vaso_cald e regras de caldeira/bocais no CLAUDE.md`
