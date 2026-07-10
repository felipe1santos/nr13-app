# Modelador 3D/2D de Vaso (Fase 2 do Prontuário) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelador de vaso estilo PVElite (painel de elementos + viewport three.js rotacionável/translúcido) que, ao salvar, alimenta croqui 3D (PNG), croqui 2D técnico (SVGs) e folha de dados (bocais/pesos/dimensões) do prontuário.

**Architecture:** Módulo novo `src/features/modelador/` — motor de geometria puro (testado), service de persistência/pré-carga, gerador de SVG 2D, e UI React (overlay full-screen aberto de Prontuários). No SAVE grava 4 chaves de localStorage; os templates HTML só leem (fallback total quando as chaves não existem).

**Tech Stack:** React 19 + TS, three.js 0.184 (`three/addons/controls/OrbitControls.js`), SVG string-building em TS, vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-modelador-vaso-fase2-design.md` (ler íntegra antes da Task 1).
**Referências visuais** (implementer de UI DEVE ler com a tool Read): pasta `C:\Users\felipe\Downloads\DOCUMETNACAO-PRONTUARIO\` — `painel croqui 3D no modelo PVELIT.png` (painel), `croqui 3D com saia-2.png` e `transparente-visao-interna.png` (3D), `vista 2D com vista 3D perspectiva.jpeg` e `Captura de tela 2026-07-09 162348.png` (2D).

## Global Constraints

- **SEM pontos de medição de espessura no 3D e no 2D** (decisão explícita do usuário). 3D = modelo visual + cotas + bocais/acessórios; 2D = desenho técnico (longitudinal, transversal, detalhe de tampo).
- Chaves gravadas SÓ pelo save do modelador, via `salvar()` de `src/services/storage.ts` (sync nuvem): `nr13_modelo3d_<TAG>`, `nr13_croqui3d_<TAG>` (PNG base64 — chave já existente da fase 1), `nr13_croqui2d_<TAG>`, `nr13_folha_dados_<TAG>`.
- Templates HTML NUNCA escrevem localStorage; sem as chaves novas → comportamento atual intacto (fallback).
- Valores numéricos aceitam vírgula decimal na UI; internamente `number`; dado ausente → `null`/`—`.
- Densidade default 7850 kg/m³. Constantes de geometria documentadas no código com a aproximação usada.
- Funções do motor retornam `null` para entrada incompleta — nunca NaN.
- Testes: suíte base 85 verdes; lint baseline 7 erros pré-existentes; `npm run build` verde.
- Commits `feat(modelador): ...` / `fix(modelador): ...` frequentes.

---

### Task 1: Motor de geometria (`geometriaVaso.ts` + tipos)

**Files:**
- Create: `src/features/modelador/tiposModelador.ts`
- Create: `src/features/modelador/geometriaVaso.ts`
- Test: `src/features/modelador/__tests__/geometriaVaso.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro).
- Produces (exato — Tasks 2/3/4/5 dependem):
  - `tiposModelador.ts`: interfaces `TampoModelo { tipo: TipoTampoModelo; espessura: number | '' }`, `BocalModelo { id: string; doMemorial: boolean; servico: string; dn: string; diametro: number | ''; espessura: number | ''; flange: string; local: 'casco'|'tampo1'|'tampo2'; posicaoAxial: number | ''; angulo: number | ''; projecao: number | '' }`, `SuporteModelo { tipo: 'saia'|'pes'|'selas'|'nenhum'; altura: number | ''; quantidade: number | '' }`, `ModeloVaso { tag: string; orientacao: 'vertical'|'horizontal'; diametroInterno: number | ''; comprimentoCilindro: number | ''; espessuraCasco: number | ''; tampo1: TampoModelo; tampo2: TampoModelo; bocais: BocalModelo[]; suporte: SuporteModelo; densidadeAco: number; pesoOperacao: number | ''; material: string }`, `type TipoTampoModelo = 'eliptico' | 'toriesferico' | 'hemisferico' | 'plano'`.
  - `geometriaVaso.ts`: `dimensoesTampo(tipo: TipoTampoModelo, D: number, t: number): { profundidade: number; raioCoroa: number | null; raioCanto: number | null }`; `comprimentoTotalMm(m: ModeloVaso): number | null`; `circunferenciaMm(m: ModeloVaso): number | null`; `volumeInternoM3(m: ModeloVaso): number | null`; `volumeAcoM3(m: ModeloVaso): number | null`; `pesosKg(m: ModeloVaso): { vazioKg: number | null; cheioDaguaKg: number | null; operacaoKg: number | null }`; helper exportado `num(v: number | ''): number | null`.

**Fórmulas (documentar no código a fonte/aproximação):**
- `dimensoesTampo` (D e t em mm): eliptico 2:1 → `{ profundidade: D/4, raioCoroa: null, raioCanto: null }`; toriesferico (Klopper) → `{ profundidade: 0.1935*D, raioCoroa: D, raioCanto: 0.1*D }`; hemisferico → `{ profundidade: D/2, ... null }`; plano → `{ profundidade: t, ... null }`.
- `comprimentoTotalMm` = comprimentoCilindro + profundidade(tampo1) + profundidade(tampo2) (espessuras dos próprios tampos p/ profundidade; null se D/L/tipos incompletos). NÃO soma suporte.
- `circunferenciaMm` = π·(D + 2·espessuraCasco).
- `volumeInternoM3` (converter mm→m): cilindro π·(D/2)²·L + por tampo: eliptico π·D³/24; toriesferico 0.0847·D³ (aprox. Klopper); hemisferico π·D³/12; plano 0.
- `volumeAcoM3` (casca fina, área média × t): casco π·(D+t)·L·t; tampos área×t com áreas: eliptico 1.084·D²; toriesferico 0.99·D²; hemisferico (π/2)·D²; plano (π/4)·D². + bocais: π·(d+t)·projecao·t cada (ignora se campos vazios). + suporte saia: π·(D+t)·altura·(espessuraCasco) (mesma t do casco, aproximação declarada); pes/selas/nenhum: 0 (flag de nota fica na folha de dados — Task 2).
- `pesosKg`: vazio = volumeAco×densidade; cheioDagua = vazio + volumeInterno×1000; operacao = `num(m.pesoOperacao) ?? cheioDagua`.

- [ ] **Step 1: Failing tests**

```ts
// src/features/modelador/__tests__/geometriaVaso.test.ts
import { describe, expect, it } from 'vitest';
import { dimensoesTampo, comprimentoTotalMm, circunferenciaMm, volumeInternoM3, volumeAcoM3, pesosKg } from '../geometriaVaso';
import type { ModeloVaso } from '../tiposModelador';

function modeloBase(): ModeloVaso {
  return {
    tag: 'T1', orientacao: 'horizontal', diametroInterno: 1000, comprimentoCilindro: 2000,
    espessuraCasco: 10, tampo1: { tipo: 'eliptico', espessura: 10 }, tampo2: { tipo: 'eliptico', espessura: 10 },
    bocais: [], suporte: { tipo: 'nenhum', altura: '', quantidade: '' }, densidadeAco: 7850,
    pesoOperacao: '', material: 'SA-516-70',
  };
}

describe('dimensoesTampo', () => {
  it('elíptico 2:1: h = D/4', () => {
    expect(dimensoesTampo('eliptico', 1000, 10).profundidade).toBeCloseTo(250, 5);
  });
  it('toriesférico Klopper: h=0,1935D, coroa=D, canto=0,1D', () => {
    const d = dimensoesTampo('toriesferico', 1000, 10);
    expect(d.profundidade).toBeCloseTo(193.5, 1);
    expect(d.raioCoroa).toBe(1000);
    expect(d.raioCanto).toBeCloseTo(100, 5);
  });
  it('hemisférico: h = D/2; plano: h = t', () => {
    expect(dimensoesTampo('hemisferico', 1000, 10).profundidade).toBe(500);
    expect(dimensoesTampo('plano', 1000, 12).profundidade).toBe(12);
  });
});

describe('derivadas do modelo Ø1000 L2000 t10 elíptico×2', () => {
  it('comprimento total = 2000 + 250 + 250', () => {
    expect(comprimentoTotalMm(modeloBase())).toBeCloseTo(2500, 3);
  });
  it('circunferência = π·1020', () => {
    expect(circunferenciaMm(modeloBase())).toBeCloseTo(Math.PI * 1020, 1);
  });
  it('volume interno ≈ 1,8326 m³ (cilindro 1,5708 + 2 tampos 0,2618)', () => {
    expect(volumeInternoM3(modeloBase())).toBeCloseTo(1.8326, 3);
  });
  it('volume de aço ≈ 0,0851 m³ e peso vazio ≈ 668 kg', () => {
    const va = volumeAcoM3(modeloBase())!;
    expect(va).toBeCloseTo(0.0851, 3);
    const p = pesosKg(modeloBase());
    expect(p.vazioKg!).toBeCloseTo(668, 0);
    expect(p.cheioDaguaKg!).toBeCloseTo(668 + 1832.6, 0);
    expect(p.operacaoKg).toBe(p.cheioDaguaKg); // default
  });
  it('entrada incompleta → null (nunca NaN)', () => {
    const m = { ...modeloBase(), diametroInterno: '' as const };
    expect(volumeInternoM3(m)).toBeNull();
    expect(pesosKg(m).vazioKg).toBeNull();
    expect(comprimentoTotalMm(m)).toBeNull();
  });
  it('bocal soma aço; saia soma casca', () => {
    const m = modeloBase();
    m.bocais = [{ id: 'N1', doMemorial: false, servico: '', dn: '', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 500, angulo: 0, projecao: 150 }];
    m.suporte = { tipo: 'saia', altura: 300, quantidade: '' };
    const base = volumeAcoM3(modeloBase())!;
    expect(volumeAcoM3(m)!).toBeGreaterThan(base);
  });
});
```

- [ ] **Step 2:** `npm test -- geometriaVaso` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `tiposModelador.ts` (interfaces exatas acima) e `geometriaVaso.ts` (fórmulas acima; toda função valida com `num()` e retorna null se faltar dado; unidades mm→m via /1000 nos volumes).
- [ ] **Step 4:** `npm test -- geometriaVaso` → PASS; suíte inteira verde.
- [ ] **Step 5:** `git add -A && git commit -m "feat(modelador): motor de geometria do vaso (tampos, volumes, pesos)"`

---

### Task 2: Service — persistência, pré-carga do memorial e payload da folha de dados

**Files:**
- Create: `src/features/modelador/modeladorService.ts`
- Test: `src/features/modelador/__tests__/modeladorService.test.ts` (usar o shim de localStorage de `src/features/prontuarios/__tests__/prontuarioService.test.ts` — copiar o bloco)

**Interfaces:**
- Consumes: Task 1 (`ModeloVaso`, `geometriaVaso`); `ler`/`salvar` de `src/services/storage.ts`; `VasoSalvo`/`carregarVaso` de `src/features/memorial/vasoMemorialService.ts` (chaves `nr13_vaso_<TAG>` e `nr13_vaso_ac_corpo_<TAG>` — ler direto com `ler<VasoSalvo>`); `gravarCroqui3d` de `src/features/prontuarios/prontuarioService.ts`.
- Produces (Tasks 3/5/6 dependem):
  - `interface FolhaDadosDerivada { geradoEm: string; orientacao: 'vertical'|'horizontal'; bocais: { id: string; servico: string; dn: string; flange: string; obs: string; anguloGraus: number | null }[]; pesos: { vazioKg: number | null; cheioDaguaKg: number | null; operacaoKg: number | null; densidade: number; notaSuporte: boolean }; dimensoes: { componente: string; texto: string }[]; comprimentoTotalMm: number | null; circunferenciaMm: number | null }`
  - `modeloVazio(tag: string): ModeloVaso` (tudo `''`, tampos elíptico, suporte nenhum, densidade 7850)
  - `carregarOuPreCarregar(tag: string): ModeloVaso`
  - `montarFolhaDados(m: ModeloVaso): FolhaDadosDerivada`
  - `salvarModelo(tag: string, m: ModeloVaso, croquis2d: { longitudinal: string; transversal: string; detalheTampo: string } | null, png3d: string | null): Promise<void>` — grava `nr13_modelo3d_<TAG>`, `nr13_folha_dados_<TAG>` (via montarFolhaDados), `nr13_croqui2d_<TAG>` (se croquis2d) e `gravarCroqui3d(tag, png3d)` (se png3d).

**Regras da pré-carga** (`carregarOuPreCarregar`): se `nr13_modelo3d_<TAG>` existe → retorna. Senão lê `ler<VasoSalvo>('nr13_vaso_'+tag)` (fallback `nr13_vaso_ac_corpo_`+tag); mapeia: `D`→diametroInterno; `orientacao`→orientacao (default 'horizontal'); componente tipo `'cilindrico'`→espessuraCasco=`dados.t_comercial`, material=`dados.mat ?? ''`; os DOIS primeiros componentes de tampo na ordem (`'eliptico'→'eliptico'`, `'toroesferico'→'toriesferico'`, `'esferico'→'hemisferico'`, `'plano'|'planoAparafusado'→'plano'`)→tampo1/tampo2 com `espessura=dados.t_comercial`; componentes `'bocal'`→BocalModelo `{ id: 'N'+n, doMemorial: true, diametro: dados.d, espessura: dados.t_comercial, projecao: dados.proj_int || 150, local: 'casco', angulo: 0, posicaoAxial: '', servico: '', dn: '', flange: '' }`. Campos numéricos `NumLike` podem vir string com vírgula: converter com `parseFloat(String(v).replace(',', '.'))` e usar `''` se não finito. Sem VasoSalvo → `modeloVazio(tag)`.

**Regras do `montarFolhaDados`:** bocais→linhas (obs = `local`+' @ '+`posicaoAxial`+'mm' quando houver; anguloGraus = num(angulo)); pesos de `pesosKg` + `notaSuporte: m.suporte.tipo === 'pes' || m.suporte.tipo === 'selas'`; dimensoes = linhas texto por componente: `'Casco cilíndrico — Ø<D> mm × <L> mm, t=<t> mm'`, `'Tampo 1 (<tipo por extenso>) — Ø<D> t=<t> h=<profundidade>'` (+ ` Rc=<raioCoroa> rc=<raioCanto>` no toriesférico), suporte quando ≠ nenhum; valores via helpers com 0-2 casas e vírgula pt-BR; ausente → `'—'` no texto. `geradoEm = new Date().toLocaleDateString('pt-BR')`.

- [ ] **Step 1: Failing tests**

```ts
// src/features/modelador/__tests__/modeladorService.test.ts  (com o shim de localStorage no topo)
import { beforeEach, describe, expect, it } from 'vitest';
import { carregarOuPreCarregar, modeloVazio, montarFolhaDados, salvarModelo } from '../modeladorService';

describe('pré-carga do memorial', () => {
  beforeEach(() => localStorage.clear());

  it('sem memorial → modelo vazio', () => {
    const m = carregarOuPreCarregar('X1');
    expect(m.diametroInterno).toBe('');
    expect(m.bocais).toEqual([]);
  });

  it('importa D, casco, 2 tampos e bocal do nr13_vaso_<TAG>', () => {
    localStorage.setItem('nr13_vaso_V1', JSON.stringify({
      tag: 'V1', P: 1, D: 1000, orientacao: 'vertical',
      componentes: [
        { id: 'casco', nome: 'Casco', tipo: 'cilindrico', dados: { t_comercial: '10', mat: 'SA-516-70' } },
        { id: 'tampo1', nome: 'Tampo 1', tipo: 'eliptico', dados: { t_comercial: '8' } },
        { id: 'tampo2', nome: 'Tampo 2', tipo: 'toroesferico', dados: { t_comercial: '8,5' } },
        { id: 'bocal1', nome: 'Bocal 1', tipo: 'bocal', dados: { d: 100, t_comercial: 6 } },
      ],
    }));
    const m = carregarOuPreCarregar('V1');
    expect(m.diametroInterno).toBe(1000);
    expect(m.orientacao).toBe('vertical');
    expect(m.espessuraCasco).toBe(10);
    expect(m.material).toBe('SA-516-70');
    expect(m.tampo1).toEqual({ tipo: 'eliptico', espessura: 8 });
    expect(m.tampo2.tipo).toBe('toriesferico');
    expect(m.tampo2.espessura).toBeCloseTo(8.5, 5);
    expect(m.bocais).toHaveLength(1);
    expect(m.bocais[0]).toMatchObject({ id: 'N1', doMemorial: true, diametro: 100, espessura: 6 });
  });

  it('modelo salvo tem precedência sobre a pré-carga', async () => {
    const m = modeloVazio('V2');
    m.diametroInterno = 750;
    await salvarModelo('V2', m, null, null);
    localStorage.setItem('nr13_vaso_V2', JSON.stringify({ tag: 'V2', P: 1, D: 999, componentes: [] }));
    expect(carregarOuPreCarregar('V2').diametroInterno).toBe(750);
  });
});

describe('salvarModelo e folha de dados', () => {
  beforeEach(() => localStorage.clear());

  it('grava modelo3d, folha_dados e croqui2d', async () => {
    const m = modeloVazio('V3');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.tampo1.espessura = 10; m.tampo2.espessura = 10;
    await salvarModelo('V3', m, { longitudinal: '<svg/>', transversal: '<svg/>', detalheTampo: '<svg/>' }, null);
    expect(localStorage.getItem('nr13_modelo3d_V3')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('nr13_croqui2d_V3')!)).toHaveProperty('longitudinal');
    const fd = JSON.parse(localStorage.getItem('nr13_folha_dados_V3')!);
    expect(fd.pesos.vazioKg).toBeGreaterThan(600);
    expect(fd.comprimentoTotalMm).toBeCloseTo(2500, 0);
  });

  it('montarFolhaDados descreve componentes e bocais', () => {
    const m = modeloVazio('V4');
    m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
    m.bocais = [{ id: 'N1', doMemorial: false, servico: 'Dreno', dn: '1"', diametro: 25, espessura: 4, flange: 'SO #150', local: 'casco', posicaoAxial: 300, angulo: 180, projecao: 120 }];
    const fd = montarFolhaDados(m);
    expect(fd.bocais[0]).toMatchObject({ id: 'N1', servico: 'Dreno', dn: '1"', anguloGraus: 180 });
    expect(fd.dimensoes.some((d) => d.componente.includes('Casco'))).toBe(true);
  });
});
```

- [ ] **Step 2:** `npm test -- modeladorService` → FAIL.
- [ ] **Step 3:** Implementar `modeladorService.ts` conforme regras acima.
- [ ] **Step 4:** `npm test -- modeladorService` → PASS; suíte verde.
- [ ] **Step 5:** `git add -A && git commit -m "feat(modelador): service de persistencia, pre-carga do memorial e folha de dados"`

---

### Task 3: Gerador de croqui 2D (`croqui2dService.ts`)

**Files:**
- Create: `src/features/modelador/croqui2dService.ts`
- Test: `src/features/modelador/__tests__/croqui2dService.test.ts`

**Interfaces:**
- Consumes: Task 1 (tipos + `dimensoesTampo`, `comprimentoTotalMm`, `circunferenciaMm`, `num`).
- Produces: `gerarCroquis2d(m: ModeloVaso): { longitudinal: string; transversal: string; detalheTampo: string } | null` (null se D/L/espessura incompletos). Strings SVG completas com `viewBox`, self-contained (sem CSS externo).

**Requisitos de desenho** (traço técnico: stroke `#444` 1.2, fill `#f3f4f6`, CL tracejada `#888`, cotas com setas triangulares e texto 9px sobre retângulo branco, rótulos 8px — mesmo estilo do croqui da folha 2 da fase 1; ler `public/arquivos-prontuario/PRONT-CROQUI2D.html` funções `cota`/`seta` como referência de estilo e PORTAR para TS dentro do service):
1. `longitudinal` (viewBox 0 0 720 420): vaso na orientação do modelo; tampos com perfil pelo tipo (elíptico arco h=D/4; toriesférico arco h=0,1935D; hemisférico semicírculo; plano reta); bocais = stub retangular na posição (posicaoAxial ao longo do casco; ângulo projetado: 0-180°=em cima, 180-360°=embaixo na vista) com linha de chamada e id; suporte desenhado (saia/pés/selas); cotas: Ø interno, comprimento cilindro, comprimento total, posição axial de cada bocal com posicaoAxial preenchida; escala = min(larguraÁrea/comprTotal, alturaÁrea/DExterno) com clamps (coordenada nunca <0 nem fora do viewBox — lição da fase 1).
2. `transversal` (viewBox 0 0 360 360): círculo Ø externo, cruz tracejada, marcas 0°/90°/180°/270° FORA do círculo com folga (lição da bússola fase 1), bocais plotados no ângulo (stub radial + id), circunferência anotada embaixo (`Circunf.: <valor> mm`).
3. `detalheTampo` (viewBox 0 0 360 300): perfil do tampo1 cotado — Ø, profundidade, espessura; toriesférico: raio da coroa e raio de canto anotados (`Rc=`, `rc=`); título com tipo por extenso ('Tampo Elíptico 2:1', 'Tampo Toriesférico (Klopper)', 'Tampo Hemisférico', 'Tampo Plano').
- Números formatados pt-BR (vírgula, até 1 casa).

- [ ] **Step 1: Failing tests**

```ts
// src/features/modelador/__tests__/croqui2dService.test.ts
import { describe, expect, it } from 'vitest';
import { gerarCroquis2d } from '../croqui2dService';
import { modeloVazio } from '../modeladorService';

function modeloCompleto() {
  const m = modeloVazio('V1');
  m.diametroInterno = 1000; m.comprimentoCilindro = 2000; m.espessuraCasco = 10;
  m.tampo1 = { tipo: 'toriesferico', espessura: 10 }; m.tampo2 = { tipo: 'eliptico', espessura: 10 };
  m.bocais = [
    { id: 'N1', doMemorial: false, servico: 'Inspeção', dn: '4"', diametro: 100, espessura: 8, flange: '', local: 'casco', posicaoAxial: 800, angulo: 0, projecao: 150 },
    { id: 'N2', doMemorial: false, servico: 'Dreno', dn: '1"', diametro: 25, espessura: 4, flange: '', local: 'casco', posicaoAxial: 1500, angulo: 90, projecao: 100 },
  ];
  return m;
}

describe('gerarCroquis2d', () => {
  it('modelo incompleto → null', () => {
    expect(gerarCroquis2d(modeloVazio('X'))).toBeNull();
  });
  it('gera 3 SVGs bem formados, sem NaN/undefined, com ids dos bocais', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    for (const svg of [c.longitudinal, c.transversal, c.detalheTampo]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(c.longitudinal).toContain('N1');
    expect(c.transversal).toContain('N2');
  });
  it('coordenadas dentro do viewBox (nenhum atributo numérico negativo)', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    const negativos = [...c.longitudinal.matchAll(/(?:x|y|cx|cy|x1|y1|x2|y2)="(-\d[\d.]*)"/g)];
    expect(negativos).toEqual([]);
  });
  it('detalhe do toriesférico anota Rc e rc; cotas com valores pt-BR', () => {
    const c = gerarCroquis2d(modeloCompleto())!;
    expect(c.detalheTampo).toContain('Rc');
    expect(c.detalheTampo).toContain('rc');
    expect(c.detalheTampo).toContain('Toriesf');
  });
  it('circunferência anotada na transversal', () => {
    expect(gerarCroquis2d(modeloCompleto())!.transversal).toMatch(/Circunf/);
  });
});
```

- [ ] **Step 2:** `npm test -- croqui2dService` → FAIL.
- [ ] **Step 3:** Implementar o service (helpers `seta`/`cota`/`fmt` internos; três funções privadas `svgLongitudinal`/`svgTransversal`/`svgDetalheTampo`).
- [ ] **Step 4:** `npm test -- croqui2dService` → PASS; suíte verde.
- [ ] **Step 5:** `git add -A && git commit -m "feat(modelador): gerador de croqui 2D tecnico (longitudinal, transversal, detalhe do tampo)"`

---

### Task 4: Viewport 3D (`Viewport3D.tsx`)

**Files:**
- Create: `src/features/modelador/Viewport3D.tsx`
- Referências: `src/features/prontuarios/CroquiVaso3D.tsx` (padrões three.js do projeto: criarCena, materiais, captura), prints `croqui 3D com saia-2.png` e `transparente-visao-interna.png`.

**Interfaces:**
- Consumes: Task 1 (`ModeloVaso`, `dimensoesTampo`, `num`).
- Produces: componente `Viewport3D({ modelo, translucido, mostrarCotas, capturaRef }: { modelo: ModeloVaso; translucido: boolean; mostrarCotas: boolean; capturaRef: React.MutableRefObject<(() => string | null) | null> })` — renderiza canvas responsivo; `capturaRef.current()` retorna PNG base64 da vista atual (fundo branco) ou null.

**Requisitos:**
- three.js + `OrbitControls` (`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`): rotate/zoom/pan, touch ok, damping.
- Reconstrói a malha quando `modelo` muda (useEffect com JSON.stringify do modelo como dep, grupo único `THREE.Group` descartado/recriado; dispose de geometrias/materiais).
- Geometria (unidade cena = mm/1000): casco `CylinderGeometry(r, r, L, 48, 1, true)`; tampo elíptico/hemisférico = `SphereGeometry` meia-esfera com `scale(1, profundidade/(D/2), 1)`; toriesférico = mesma técnica com a profundidade do motor (aprox. visual declarada em comentário); plano = `CircleGeometry`; bocais = cilindro (r=d/2, comprimento=projecao) + flange `CylinderGeometry(r*1.6, r*1.6, esp)` posicionados por local/posicaoAxial/angulo (rotação em torno do eixo do vaso); saia = cilindro aberto abaixo do tampo inferior (altura do suporte); pés = 2-4 `BoxGeometry` distribuídos; selas = 2 caixas na horizontal. Orientação horizontal = grupo rotacionado 90° em Z.
- Material aço: `MeshStandardMaterial({ color: 0x8a94a3, metalness: 0.55, roughness: 0.45 })`; translúcido: `transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false`.
- Cotas (toggle): `Line` + cones para setas + `Sprite` com canvas de texto — Ø interno e comprimento total (usar valores do motor). Sem dado → sem cota.
- Luz: ambiente + 2 direcionais (padrão do CroquiVaso3D). Fundo `#f4f6f8`; na captura trocar para branco, renderizar 1 frame e voltar.
- Captura: renderer com `preserveDrawingBuffer: true`; `capturaRef.current = () => renderer.domElement.toDataURL('image/png')`.
- Modelo sem D/L → mostra placeholder (`<div className="viewport-vazio">Informe Ø e comprimento…</div>`).

- [ ] **Step 1:** Implementar componente (sem teste unitário — three.js não roda no vitest node; validação por type-check + Task 7 visual). `npx tsc --noEmit` limpo.
- [ ] **Step 2:** `npm run build` verde; `npm test` 85+ verdes (nada quebrado).
- [ ] **Step 3:** `git add -A && git commit -m "feat(modelador): viewport 3D three.js com orbit, translucido, cotas e captura"`

---

### Task 5: Tela do modelador (`ModeladorVaso.tsx` + `PainelElementos.tsx`) e integração em Prontuários

**Files:**
- Create: `src/features/modelador/ModeladorVaso.tsx`, `src/features/modelador/PainelElementos.tsx`, `src/features/modelador/modelador.css`
- Modify: `src/pages/Prontuarios.tsx` (seção "Dimensões e Croqui 3D": botão "⬡ Abrir Modelador" no lugar de "Gerar Croqui 3D"; manter exibição/remoção do croqui salvo)
- Referência visual: `painel croqui 3D no modelo PVELIT.png`.

**Interfaces:**
- Consumes: Tasks 1-4 (`carregarOuPreCarregar`, `salvarModelo`, `gerarCroquis2d`, `Viewport3D`, tipos).
- Produces: `ModeladorVaso({ tag, onFechar, onSalvo }: { tag: string; onFechar: () => void; onSalvo: (png3d: string | null) => void })` — overlay full-screen.

**Requisitos:**
- Layout overlay (z-index alto, fundo escurecido, caixa 95vw×92vh): header com `Modelador — TAG`, botões Salvar/Fechar; corpo grid `minmax(300px, 380px) 1fr` — painel esquerdo, viewport direita. Mobile (<860px): colunas empilham, painel vira accordion acima do viewport.
- `PainelElementos`: seções colapsáveis — **Geral** (orientação select, Ø interno, comprimento cilindro, material ro, densidade), **Casco** (espessura), **Tampo 1/Tampo 2** (tipo select 4 opções, espessura; mostra profundidade/raios calculados ro via `dimensoesTampo`), **Bocais** (lista: id, serviço, DN, Ø, espessura, flange, local select, posição axial, ângulo 0-360, projeção; `+ Bocal` adiciona livre id N<seq>; remover só quando `!doMemorial`; badge "memorial" nos importados), **Suporte** (tipo select, altura, quantidade), **Pesos** (vazio/cheio ro calculados ao vivo, operação editável). Inputs numéricos: `inputMode="decimal"`, aceitar vírgula (`onChange` guarda string crua no estado local do campo e converte no blur — ou usar o padrão de máscara já usado em `MemorialVaso.tsx`; implementer confere e copia o padrão existente).
- Toggles no topo do viewport: "Translúcido" e "Cotas" (checkbox estilizado).
- **Salvar**: `const png = capturaRef.current?.() ?? null; const croquis = gerarCroquis2d(modelo); await salvarModelo(tag, modelo, croquis, png); onSalvo(png);` toast "Modelo salvo" e fecha. Se `croquis === null` salva mesmo assim (modelo incompleto → folhas usam fallback) com aviso no toast.
- `Prontuarios.tsx`: estado `mostrarModelador`; botão abre; `onSalvo(png)` → `set('croqui', png ?? dados.croqui)` (atualiza preview do formulário). NÃO remover o `<CroquiVaso3D>` import ainda se usado em outro lugar — verificar com grep; se só o Prontuarios usa, remover o uso antigo (botão "Gerar Croqui 3D") e manter o arquivo.
- CSS novo em `modelador.css` seguindo o design system (variáveis o app já usa — conferir `prontuarios.css`).

- [ ] **Step 1:** Implementar os 3 arquivos + integração.
- [ ] **Step 2:** `npx tsc --noEmit` limpo; `npm run build` verde; `npm test` verde; `npm run lint` sem erros novos.
- [ ] **Step 3:** `git add -A && git commit -m "feat(modelador): tela estilo PVElite integrada ao fluxo de prontuarios"`

---

### Task 6: Consumo nas folhas — PRONT-CROQUI2D e PRONT-FOLHA-DADOS

**Files:**
- Modify: `public/arquivos-prontuario/PRONT-CROQUI2D.html`
- Modify: `public/arquivos-prontuario/PRONT-FOLHA-DADOS.html`
- Modify: `CLAUDE.md` (§2: chaves `nr13_modelo3d_<TAG>`, `nr13_croqui2d_<TAG>`, `nr13_folha_dados_<TAG>`; §8: nota "modelador alimenta croqui 2D e folha de dados")

**Interfaces:**
- Consumes: chaves gravadas pela Task 2 (`nr13_croqui2d_<TAG>` = `{longitudinal, transversal, detalheTampo}` strings SVG; `nr13_folha_dados_<TAG>` = `FolhaDadosDerivada`).
- Produces: nada.

**Requisitos PRONT-CROQUI2D.html:**
- No DOMContentLoaded, após resolver a TAG: `var c2d = lerJSON('nr13_croqui2d_' + tag);`
- Se `c2d && c2d.longitudinal`: substitui o conteúdo do box do croqui genérico por `c2d.longitudinal` (innerHTML; SVG responsivo `width:100%;height:auto`) e adiciona ABAIXO uma linha grid 2 colunas com `c2d.transversal` e `c2d.detalheTampo` (títulos "VISTA TRANSVERSAL" / "DETALHE DO TAMPO" no mesmo estilo de faixa). Ajustar tamanhos pra folha continuar A4 sem corte (medida de segurança: container com max-height e SVG `preserveAspectRatio`).
- Tabela de dimensões ganha (quando `nr13_folha_dados_<TAG>` existir): Comprimento total (mm), Circunferência (mm), Peso vazio (kg), Peso cheio d'água (kg) — valores pt-BR, `—` se null.
- Sem `c2d` → NADA muda (desenho genérico atual).

**Requisitos PRONT-FOLHA-DADOS.html:**
- `var fd = lerJSON('nr13_folha_dados_' + tag);`
- Se `fd`: LISTA DE BOCAIS = linhas reais (TAG | SERVIÇO | 1 | DN | FLANGE | OBS) completando com vazias até 8; TABELA DE PESOS = 3 valores pt-BR + (se `fd.pesos.notaSuporte`) nota 6.5px "Pesos calculados do modelo (aço <densidade> kg/m³); suporte tipo pés/selas não incluído."; ORIENTAÇÃO DE BOCAIS = plotar cada bocal com `anguloGraus` no círculo SVG existente (marcador + id, ângulo 0° = norte, sentido horário); bloco COMPONENTES/dimensões usa `fd.dimensoes` (uma linha por item).
- Sem `fd` → NADA muda.
- Preservar auto-fit (`ajustarFonteParaCaber`) — chamado depois das injeções novas.

- [ ] **Step 1:** Implementar os dois templates + CLAUDE.md.
- [ ] **Step 2:** `node --check` nos scripts extraídos; `npm test` verde; `npm run build` verde.
- [ ] **Step 3:** `git add -A && git commit -m "feat(modelador): folhas 2 e 3 consomem croqui 2D e folha de dados do modelo"`

---

### Task 7: Verificação visual no navegador (controller, não subagent)

- [ ] **Step 1:** `npm run dev`; Chrome logado; Prontuários → VASO A23 → "Abrir Modelador".
- [ ] **Step 2:** Conferir pré-carga (Ø/espessuras/tampos do memorial), montar modelo completo (comprimento 2000, bocais N1 0°/800mm + N2 90°/1500mm, saia), testar rotação/zoom/translúcido/cotas, Salvar.
- [ ] **Step 3:** Gerar prontuário: folha 1 com PNG novo do 3D; folha 2 com longitudinal + transversal + detalhe do tampo + tabela estendida; folha 3 com bocais na lista e na vista de topo + pesos. A4 sem corte/vazio.
- [ ] **Step 4:** Fallback: equipamento sem modelo (VASO 02) → folhas como antes.
- [ ] **Step 5:** Mobile: viewport responsivo (painel accordion) — reduzir janela.
- [ ] **Step 6:** Bugs → fix subagents; re-verificar; commit final.
