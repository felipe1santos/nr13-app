# Redesign do Prontuário Técnico (Fase 1 — Documentação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as 6 folhas antigas do prontuário por 6 folhas novas profissionais (ultrassom+croqui 3D, croqui 2D+dimensões, folha de dados PVElite-style, prontuário construtivo, continuação texto, resumo memorial), fiéis aos exemplos visuais.

**Architecture:** Templates HTML estáticos autocontidos em `public/arquivos-prontuario/`, cada um lê localStorage no `DOMContentLoaded` (chave `nr13_prontuario_atual` para dados do formulário + chaves por TAG). `Prontuarios.tsx` monta iframes na ordem de `PAGINAS_PRONTUARIO` e imprime via `printService` (inalterado).

**Tech Stack:** HTML/CSS/JS vanilla nos templates (fonte Inter, SVG inline para croqui 2D), React 19 + TS no wiring, vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-prontuario-redesign-fase1-design.md`
**Exemplos visuais (implementer DEVE ler as imagens com a tool Read antes de codar a folha):**
pasta `C:\Users\felipe\Downloads\DOCUMETNACAO-PRONTUARIO\` — arquivos `EXEMPLO-FINAL01.png` (folha 1), `EXEMPLO-FINAL02.png` (folha 2), `folha de dados.png` + `vista 2D com vista 3D perspectiva.jpeg` (folha 3), `folha-prontuario.png` (folha 4), `Captura de tela 2026-07-09 170016.png` (folha 5).

## Global Constraints

- **Rodapé SEM paginação** em TODAS as folhas novas do prontuário (nenhum número de página).
- A4 exato: `.page { width:100%; height:297mm; overflow:hidden; padding:15mm 15mm 8mm; display:flex; flex-direction:column; }`; rodapé com `margin-top:auto`; nada cortado, sem grandes vazios (CLAUDE.md §5).
- Identidade visual: fonte `Inter` (Google Fonts, mesmo `<link>` do ULTRASSOM.html), valores de dado em `--blue-data: #0033a2` peso 700, títulos de seção em faixa (`background:#e5e7eb` estilo ULTRASSOM ou faixa preta `#111` texto branco nos blocos tipo prancha da folha 3).
- Dado ausente → `—` (nunca vazio, nunca `undefined`).
- Templates autocontidos: CSS/JS inline, sem dependência entre arquivos (padrão do sistema).
- Fonte de dados: `nr13_prontuario_atual` (objeto `ProntuarioDados`, tem `.tag`, `.croqui`, `.logo`, campos de empresa) + chaves por TAG: `nr13_calc_<TAG>`, `nr13_calc_gv_<TAG>`, `nr13_cat_<TAG>`, `nr13_med_grid_<TAG>`, `nr13_med_esp_<TAG>`, `nr13_minha_empresa`, `nr13_rastreab_*` (prefixo), `nr13_prontuario_meta_<TAG>`, `nr13_croqui3d_<TAG>`.
- GV: merge SÓ em tempo de leitura, componentes com prefixo `GV — ` (CLAUDE.md §3). NUNCA gravar merge.
- Assinatura fictícia padrão (bloco idêntico em todas as folhas que assinam): esquerda "Fulano Da Silva / Engenheiro De Equipamentos / CREA: 12151566" (com rubrica SVG), direita "Fulano Da Silva / Tecnico em Mecanica / CREA: 12151566".
- Arquivos antigos (PRONT-P1/P2/P2B/P3/P4/PRONT-CARACTERIZACAO.html) NÃO são deletados — apenas saem de `PAGINAS_PRONTUARIO`.
- Commits frequentes, mensagens `feat(prontuario): ...`; testes com `npm test` (baseline 81 verdes), lint baseline = 7 erros pré-existentes.

## Bloco JS comum dos templates (usar este código, adaptando as chaves lidas por folha)

```js
function lerJSON(chave) { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (_) { return null; } }
function lerTexto(chave) { var v = localStorage.getItem(chave); if (!v) return ''; try { var p = JSON.parse(v); return typeof p === 'string' ? p : v; } catch (_) { return v; } }
function texto(id, v) { var el = document.getElementById(id); if (el) el.textContent = (v === null || v === undefined || v === '') ? '—' : String(v); }
document.addEventListener('DOMContentLoaded', function () {
  var pront = lerJSON('nr13_prontuario_atual') || {};
  var tag = pront.tag || new URLSearchParams(location.search).get('tag') || '';
  var meta = lerJSON('nr13_prontuario_meta_' + tag) || {};
  var minhaEmp = lerJSON('nr13_minha_empresa') || {};
  texto('meta-numero', meta.numero); texto('meta-data', meta.emissao);
  var logo = pront.logo || minhaEmp.logo;
  if (logo) { var img = document.getElementById('img-logo'); img.src = logo; img.style.display = 'block'; }
  // ... injeções específicas da folha ...
});
```

## Bloco de cabeçalho/rodapé/assinatura canônico (definido na Task 2; Tasks 3–7 copiam VERBATIM do arquivo `PRONT-ULTRASSOM.html` criado na Task 2)

Cabeçalho (tabela 3 colunas, borda preta, igual EXEMPLO-FINAL01):

```html
<table class="header-table"><tr>
  <td class="col-logo"><img id="img-logo" alt="Logo" style="display:none"></td>
  <td class="col-title">TÍTULO DA FOLHA<br>SUBTÍTULO</td>
  <td class="col-info">
    <div class="info-label">Relatório nº.</div><div class="info-value" id="meta-numero">—</div>
    <div class="info-label">Data de Emissão:</div><div class="info-value" id="meta-data">—</div>
  </td>
</tr></table>
```

Rodapé (sem paginação — faixa dupla preta como no EXEMPLO-FINAL01):

```html
<div class="rodape">
  <div class="rodape-linha"></div>
  <div class="rodape-nome" id="rod-nome">—</div>
  <div class="rodape-info"><span id="rod-endereco">—</span> • CNPJ: <span id="rod-cnpj">—</span> • CEP: <span id="rod-cep">—</span></div>
  <div class="rodape-info">Telef: <span id="rod-tel">—</span> • E-mail: <span id="rod-email">—</span></div>
  <div class="rodape-linha"></div>
</div>
```

CSS do rodapé: `.rodape { margin-top:auto; text-align:center; font-size:9px; } .rodape-linha { border-top:3px solid #111; margin:3px 0; } .rodape-nome { font-weight:900; } .rodape-info { color:#7a5c00; font-weight:600; }` (dourado-escuro como no exemplo). Injeta de `nr13_minha_empresa` (campos: `nome|razaoSocial`, `endereco`, `cnpj`, `cep`, `telefone`, `email` — implementer confere nomes reais em `src/features/cadastros/tipos.ts` e usa fallback entre eles).

Assinatura (Responsabilidade Técnica):

```html
<div class="resp-tecnica">
  <div class="resp-titulo">Responsabilidade Tecnica:</div>
  <div class="resp-grid">
    <div class="resp-col">
      <svg class="rubrica" viewBox="0 0 160 50" aria-hidden="true"><path d="M8 38 C 30 8, 44 44, 60 22 S 92 10, 104 30 S 138 18, 152 26" fill="none" stroke="#1a2f8a" stroke-width="2.2" stroke-linecap="round"/></svg>
      <div class="resp-linha"></div>
      <div class="resp-nome">Fulano Da Silva</div>
      <div class="resp-cargo">Engenheiro De Equipamentos</div>
      <div class="resp-crea">CREA: 12151566</div>
    </div>
    <div class="resp-col">
      <div class="resp-espaco"></div>
      <div class="resp-linha"></div>
      <div class="resp-nome">Fulano Da Silva</div>
      <div class="resp-cargo">Tecnico em Mecanica</div>
      <div class="resp-crea">CREA: 12151566</div>
    </div>
  </div>
</div>
```

CSS: `.resp-grid { display:flex; justify-content:space-around; gap:40px; } .resp-col { text-align:center; min-width:220px; } .rubrica { height:44px; display:block; margin:0 auto; } .resp-espaco { height:44px; } .resp-linha { border-top:2px solid #111; margin:2px 20px 4px; } .resp-nome { font-weight:800; } .resp-cargo,.resp-crea { font-size:9px; color:#333; } .resp-titulo { font-weight:800; border-bottom:1px solid #999; margin-bottom:10px; }`

---

### Task 1: Meta do prontuário + croqui 3D no service

**Files:**
- Modify: `src/features/prontuarios/prontuarioService.ts`
- Modify: `src/pages/Prontuarios.tsx` (função `excluirProntuario` já chamada lá — só service muda nesta task)
- Test: `src/features/prontuarios/__tests__/prontuarioService.test.ts` (novo)

**Interfaces:**
- Consumes: `ler`, `salvar`, `excluirChave` de `src/services/storage.ts` (assinaturas existentes: `ler<T>(chave): T | null`, `salvar(chave, valor): Promise<void>`, `excluirChave(chave): Promise<void>`).
- Produces: `interface MetaProntuario { numero: string; emissao: string }`; `obterOuCriarMeta(tag: string): Promise<MetaProntuario>` (chave `nr13_prontuario_meta_<TAG>`, REUSA se existir); `gravarCroqui3d(tag: string, b64: string): Promise<void>` (chave `nr13_croqui3d_<TAG>`); `excluirProntuario(tag)` passa a limpar também meta e croqui3d.

- [ ] **Step 1: Failing tests**

```ts
// src/features/prontuarios/__tests__/prontuarioService.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { obterOuCriarMeta, gravarCroqui3d, excluirProntuario } from '../prontuarioService';

describe('meta do prontuário', () => {
  beforeEach(() => localStorage.clear());

  it('cria meta com numero REL- e data pt-BR na primeira chamada', async () => {
    const meta = await obterOuCriarMeta('VASO-01');
    expect(meta.numero).toMatch(/^REL-\d+$/);
    expect(meta.emissao).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(JSON.parse(localStorage.getItem('nr13_prontuario_meta_VASO-01')!)).toEqual(meta);
  });

  it('reusa meta existente (numero estável entre reimpressões)', async () => {
    const primeira = await obterOuCriarMeta('VASO-01');
    const segunda = await obterOuCriarMeta('VASO-01');
    expect(segunda).toEqual(primeira);
  });

  it('grava croqui 3D na chave por TAG', async () => {
    await gravarCroqui3d('VASO-01', 'data:image/png;base64,AAA');
    expect(localStorage.getItem('nr13_croqui3d_VASO-01')).toContain('AAA');
  });

  it('excluirProntuario limpa dados, meta e croqui', async () => {
    localStorage.setItem('nr13_prontuario_VASO-01', '{}');
    await obterOuCriarMeta('VASO-01');
    await gravarCroqui3d('VASO-01', 'x');
    await excluirProntuario('VASO-01');
    expect(localStorage.getItem('nr13_prontuario_VASO-01')).toBeNull();
    expect(localStorage.getItem('nr13_prontuario_meta_VASO-01')).toBeNull();
    expect(localStorage.getItem('nr13_croqui3d_VASO-01')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test -- prontuarioService` → FAIL (`obterOuCriarMeta` não exportado).
- [ ] **Step 3: Implementar no service**

```ts
// adicionar em src/features/prontuarios/prontuarioService.ts
export interface MetaProntuario { numero: string; emissao: string }
const chaveMeta = (tag: string) => `nr13_prontuario_meta_${tag}`;
const chaveCroqui3d = (tag: string) => `nr13_croqui3d_${tag}`;

export async function obterOuCriarMeta(tag: string): Promise<MetaProntuario> {
  const existente = ler<MetaProntuario>(chaveMeta(tag));
  if (existente?.numero) return existente;
  const meta: MetaProntuario = {
    numero: `REL-${Date.now()}`,
    emissao: new Date().toLocaleDateString('pt-BR'),
  };
  await salvar(chaveMeta(tag), meta);
  return meta;
}

export async function gravarCroqui3d(tag: string, b64: string): Promise<void> {
  await salvar(chaveCroqui3d(tag), b64);
}
```

E em `excluirProntuario`, acrescentar: `await excluirChave(chaveMeta(tag)); await excluirChave(chaveCroqui3d(tag));`

- [ ] **Step 4: Rodar** — `npm test -- prontuarioService` → 4 PASS; suíte inteira verde.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(prontuario): meta estavel (REL-n/data) e croqui 3D por TAG no service"`

---

### Task 2: Folha 1 — PRONT-ULTRASSOM.html (réplica EXEMPLO-FINAL01)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-ULTRASSOM.html`
- Referências que o implementer DEVE ler antes: imagem `C:\Users\felipe\Downloads\DOCUMETNACAO-PRONTUARIO\EXEMPLO-FINAL01.png`; CSS base de `public/arquivos-inspecao/ULTRASSOM.html` (linhas 1–130, variáveis e header-table); leitura de grid em `public/arquivos-prontuario/PRONT-P2.html` (como lê `nr13_med_grid_<TAG>`).

**Interfaces:**
- Consumes: chaves `nr13_prontuario_atual`, `nr13_prontuario_meta_<TAG>`, `nr13_croqui3d_<TAG>`, `nr13_med_grid_<TAG>` (`{ ts: string[][], casco: string[][], ti: string[][] }` — colunas 0°/90°/180°/270°), `nr13_med_esp_<TAG>`, `nr13_calc_<TAG>` (`componentes[]` com `nome`, `tNom`), `nr13_info_<TAG>` (`fabricante`, `anoFabricacao`, `material`, `local|area` — conferir nomes em `src/features/equipamento/tipos.ts`), `nr13_minha_empresa`, prefixo `nr13_rastreab_` (objetos `{ nome, certificadoPadrao, validade }`).
- Produces: blocos canônicos de cabeçalho/rodapé/assinatura (copiados pelas Tasks 3–7).

- [ ] **Step 1: Ler EXEMPLO-FINAL01.png e ULTRASSOM.html** (tool Read).
- [ ] **Step 2: Criar o template** com esta estrutura (usar blocos canônicos e JS comum do topo do plano):
  1. Cabeçalho: título "RELATÓRIO DE ULTRASSOM<br>MEDIÇÃO DE ESPESSURA".
  2. Tabela **INFORMAÇÕES DO COMPONENTE AVALIADO**: linha 1 = EQUIPAMENTO (tipo por extenso: Vaso de Pressão/Autoclave/Caldeira, de `nr13_info_<TAG>.tipo`), T.A.G, ÁREA; linha 2 = ESPESSURA NOMINAL (MM) com sub-células CASCO/TAMPOS (de `calc.componentes[]`: casco = componente cujo nome contém "casco"/"CASC", tampos = primeiro "tampo"; usar `tNom`), ANO DE FABRICAÇÃO, MATERIAL DE CONSTRUÇÃO.
  3. Tabela **INFORMAÇÕES PARA O ENSAIO**: APARELHO/Nº DE SÉRIE, ACOPLANTE, TEMP. DA SUPERFÍCIE (°C) (default "AMBIENTE"), ESTADO DA SUPERFÍCIE, TIPO CABEÇOTE, VELOCIDADE SÔNICA (sufixo "m/s"). Fonte `nr13_med_esp_<TAG>` — objeto pode ter campos `aparelho`, `acoplante`, `cabecote`, `velocidade` etc.; implementer inspeciona `src/features/inspecoes/formularios/FormularioMedicaoEspessura.tsx` para os nomes reais e usa `—` no que faltar.
  4. Faixa-título **LOCALIZAÇÃO DOS PONTOS DE MEDIÇÃO E MEDIDAS ENCONTRADAS (MM)**, depois grid 2 colunas (`display:grid; grid-template-columns: 1fr 200px; gap:8px`):
     - Esquerda: tabela TAMPO SUPERIOR (1 linha) / CASCO (4 linhas) / TAMPO INFERIOR (1 linha) × 0°|90°|180°|270°, sub-cabeçalhos de bloco em cinza, células de valor com fundo `#fef08a` e peso 800; menor valor de cada bloco ganha classe `highlight-min` (fundo amarelo mais forte + borda). Valores de `nr13_med_grid_<TAG>`; célula sem medida → `—` (Global Constraint; o `0,00` do PNG é só placeholder do exemplo).
     - Direita: `<img id="img-croqui3d">` de `nr13_croqui3d_<TAG>` (fallback `pront.croqui`); sem imagem → `<div class="croqui-vazio">Croqui não gerado</div>` (borda tracejada, centralizado).
  5. Tabela **INSTRUMENTO DE MEDIÇÃO UTILIZADO** (PADRÃO | Nº SÉRIE | Nº CERTIFICADO | VALIDADE): iterar `localStorage` por prefixo `nr13_rastreab_` (loop `for (var i=0;i<localStorage.length;i++)` + `key.indexOf('nr13_rastreab_')===0`), linha por item (`nome`, `—` p/ série se não houver campo, `certificadoPadrao`, `validade`); nenhuma → 1 linha "—". Abaixo, nota em fonte 7.5px com borda: "O instrumento de medição utilizado foi calibrado por laboratório acreditado pela RBC/INMETRO, com certificado de calibração válido, garantindo a rastreabilidade metrológica e a confiabilidade dos resultados."
  6. Bloco assinatura + rodapé canônicos (SEM paginação).
- [ ] **Step 3: Verificação manual** — servir `npm run dev` já rodando? Se não: `npx serve public` não é necessário; abrir via file:// não funciona (localStorage de origem). Validar por inspeção de código + Task 9 cobre navegador. Rodar `npm run build` → verde.
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 1 - relatorio de ultrassom com croqui 3D, rastreabilidade e responsabilidade tecnica"`

---

### Task 3: Folha 2 — PRONT-CROQUI2D.html (réplica EXEMPLO-FINAL02)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-CROQUI2D.html`
- Referências: imagem `EXEMPLO-FINAL02.png`; blocos canônicos de `PRONT-ULTRASSOM.html` (Task 2).

**Interfaces:**
- Consumes: `nr13_prontuario_atual` (`.dimensoes[0]` = `{ diametro, altura, espCorpo, espFundo, espTampa, volume }` strings), `nr13_calc_<TAG>` (`ecasco`, `etampo`), `nr13_cat_<TAG>` (`volInput`), `nr13_info_<TAG>`, meta/minha empresa.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Ler EXEMPLO-FINAL02.png.**
- [ ] **Step 2: Criar template**: cabeçalho título "FOLHA DE DADOS E<br>CROQUI DETALHADO"; corpo em grid `1fr 240px`:
  - **Croqui 2D SVG inline gerado por JS.** Duas variantes:
    - HORIZONTAL (padrão quando `comprimento >= altura` ou orientação desconhecida): corpo = retângulo com cantos retos + 2 tampos elípticos (arcos `path` em cada extremidade), linha de centro tracejada (CL), pernas/suportes retangulares embaixo (2), bocal superior (boca de inspeção: 2 retângulos com flange no topo), válvula (pequeno símbolo no topo esquerdo), manômetro (círculo pequeno com haste na frente).
    - VERTICAL (`altura > comprimento` e sem comprimento informado): corpo em pé com tampo superior elíptico e saia/base.
    - Callouts com linha fina + texto 7px: "BOCA DE INSPEÇÃO", "VÁLVULA SEGURANÇA", "PLACA IDENTIFICAÇÃO", "MANÔMETRO" apontando para os elementos (posições fixas relativas ao desenho).
    - Cotas: função JS `cota(svg, x1,y1,x2,y2, texto)` desenhando linha com setas triangulares nas pontas + texto central sobre fundo branco. Cotas: A = Ø (vertical no corpo), B = comprimento total (horizontal embaixo), C = altura total (vertical à direita), D = bocal (no topo). Valores reais em mm de `dimensoes[0]` (`diametro`, `altura`) — sem valor → letra só (ex.: "A").
    - Desenho proporcional: escala = `min(larguraArea/B, alturaArea/C)` com mínimo sensato; traço `#444` 1.2px, fill `#f3f4f6` claro.
  - **Tabela "Dimensão do Vaso de Pressão"** (direita): linhas rotuladas A Ø interno (mm) | B Comprimento (mm) | C Altura (mm) | Espessura do casco (mm) | Espessura dos tampos (mm) | Capacidade (L). Fontes na ordem: `dimensoes[0]`, depois `calc.ecasco`/`calc.etampo`, `cat.volInput` (m³ → L ×1000, formatar sem decimais desnecessários). Ausente → `—`.
  - Nota lateral esquerda em itálico 7px (igual exemplo): "A rede industrial fornece os vasos de pressão com furação para fixação dos mesmos."
  - Assinatura + rodapé canônicos.
- [ ] **Step 3: `npm run build` verde.**
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 2 - croqui 2D com cotas e tabela de dimensoes reais"`

---

### Task 4: Folha 3 — PRONT-FOLHA-DADOS.html (anexo técnico estilo PVElite)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-FOLHA-DADOS.html`
- Referências: imagens `folha de dados.png` e `vista 2D com vista 3D perspectiva.jpeg`; blocos canônicos da Task 2.

**Interfaces:**
- Consumes: `nr13_calc_<TAG>` (`componentes[]`: `nome`, `pmtaMpa`, `tReqMm`, `tNom`, `ca`, `material`, `D`, `S`, `E`; `pmta`, `pth` MPa), `nr13_calc_gv_<TAG>` (mesmo shape — merge leitura com prefixo `GV — `), `nr13_info_<TAG>`, `nr13_emp_<TAG>` (cliente), `nr13_prontuario_atual`, meta, minha empresa.
- Produces: nada.

- [ ] **Step 1: Ler as 2 imagens de referência.**
- [ ] **Step 2: Criar template** — grade de blocos com título em faixa preta (`background:#111;color:#fff;font-size:8px;font-weight:800;padding:2px 6px;text-transform:uppercase`), bordas finas `#999`, corpo 8px. Layout: coluna esquerda (60%) e direita (40%):
  - **DADOS TÉCNICOS DO EQUIPAMENTO** (direita, topo): lista rotulada — Pressão (kgf/cm², converter de `calc.pmta` MPa ×10,19716, 2 casas), Temperatura (°C de info), Sobr. corrosão (mm do 1º componente `ca`), Ø interno (mm `D` do casco), Material (casco), CG/corr (—). Subtítulo RESULTADOS: PMTA conjunto (kgf/cm²), Teste hidro (`calc.pth` → kgf/cm²), Peso vazio (—). Subtítulo COMPONENTES: linha por componente `calc.componentes[]` + GV: `nome — Ø<D> mm t=<tNom>`.
  - **ORIENTAÇÃO DE BOCAIS — VISTA DE TOPO** (centro): SVG círculo com cruz tracejada, marcas 0°/90°/180°/270° fora do círculo, rosa "N" com seta no canto sup. direito. Sem bocais plotados nesta fase.
  - **LISTA DE BOCAIS** (direita, meio): tabela TAG | SERVIÇO | QTD | DN | FLANGE | OBS. com 8 linhas vazias (`&nbsp;`).
  - **LISTA DE SOLDAS** (esquerda, topo): tabela Nº | TIPO | POS | E(%) | OBS com linhas padrão pré-listadas: 1 Tampo→Casco (circunf.), 2 Longitudinal, 3 Casco→Casco (circunf.), 4 Bocais — colunas E(%)/OBS `—`.
  - **TABELA DE PESOS** (esquerda): Peso vazio | Peso em operação | Peso cheio d'água — valores `—` (fase 2 preenche).
  - **ESPESSURAS POR COMPONENTE**: tabela COMPONENTE | t NOMINAL (mm) | t REQUERIDA (mm) | CA (mm) de `componentes[]` (+ GV prefixado).
  - **NOTAS TÉCNICAS** (direita, baixo): lista numerada fixa, `contenteditable="true"`: 1. Cotas em milímetros, salvo indicação contrária. 2. Soldas conforme ASME IX — qualificação WPS/PQR em anexo. 3. Tratamento térmico de alívio de tensões conforme UW-40. 4. Radiografia: conforme percentual de eficiência de junta adotado no memorial (RT-1). 5. Teste hidrostático conforme UG-99. 6. Material certificado — CCMs em anexo. 7. Datum Line: face inferior do tampo inferior. 8. Desenho AS-BUILT — dimensões verificadas em campo.
  - **Carimbo de prancha** (canto inferior direito): tabela REV | DESCRIÇÃO | DATA | POR (linha 00 / Emissão inicial / data emissão / —) + células: CLIENTE (razão social de `nr13_emp_<TAG>`), TAG EQUIP, Nº DESENHO (`ECS-VP-001-R00` → usar `<TAG>-FD-R00`), FABRICANTE, CÓDIGO PROJETO ("ASME VIII Div.1 + NR-13"), ESCALA ("s/ escala"), DATA, FORMATO ("A4"), selo vermelho "AS-BUILT" (borda 2px vermelha, texto vermelho 800).
  - Rodapé canônico (sem paginação; folha 3 NÃO leva bloco de assinatura — carimbo já assina).
- [ ] **Step 3: `npm run build` verde.**
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 3 - folha de dados estilo prancha com orientacao de bocais e espessuras"`

---

### Task 5: Folha 4 — PRONT-PRONTUARIO.html (trazer PRONTUARIO.html do relatório)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-PRONTUARIO.html` (cópia adaptada de `public/arquivos-inspecao/PRONTUARIO.html`)
- Referências: imagem `folha-prontuario.png`; arquivo fonte `public/arquivos-inspecao/PRONTUARIO.html` (ler INTEIRO).

**Interfaces:**
- Consumes: mesmas chaves que o PRONTUARIO.html original usa (implementer mapeia lendo o arquivo), MAS com TAG resolvida via `nr13_prontuario_atual.tag`/`?tag=` — NÃO depender de `nr13_relatorio_meta_atual` nem de container de inspeção.
- Produces: nada.

- [ ] **Step 1: Ler `public/arquivos-inspecao/PRONTUARIO.html` inteiro + `folha-prontuario.png`.**
- [ ] **Step 2: Copiar e adaptar SOMENTE:**
  1. Bloco info do cabeçalho → `RASTREABILIDADE` + `REL-nº` (meta.numero) e `DATA DA INSPEÇÃO` + meta.emissao (labels iguais ao print).
  2. Resolução de TAG/dados: trocar leituras de `nr13_relatorio_meta_atual`/`nr13_inspecao_atual` pela TAG do prontuário; manter TODAS as seções e visual: DADOS GERAIS (contratante/endereço de `nr13_emp_<TAG>`), ASPECTOS GERAIS, ASPECTOS CONSTRUTIVOS, ASPECTOS OPERACIONAIS, tabelas PMO/PMTA/PTH (MPA|PSI|KGF/CM³), CATEGORIZAÇÃO DO EQUIPAMENTO (`nr13_cat_<TAG>`: relação kPa×m³, resultado, classificação fluido, grupo risco, categoria), LEGENDA.
  3. Rodapé: se o original tiver número de página, REMOVER (constraint global).
- [ ] **Step 3: `npm run build` verde.**
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 4 - prontuario construtivo com categorizacao (trazido do relatorio)"`

---

### Task 6: Folha 5 — PRONT-CONTINUACAO.html (procedimentos, dispositivos, atenção)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-CONTINUACAO.html`
- Referências: imagem `Captura de tela 2026-07-09 170016.png` (prontuário antigo em papel); blocos canônicos da Task 2.

**Interfaces:**
- Consumes: `nr13_calc_<TAG>` (`pmta` MPa → kgf/cm² p/ pressão de abertura sugerida), meta, minha empresa, `nr13_prontuario_atual`.
- Produces: nada.

- [ ] **Step 1: Ler a imagem de referência.**
- [ ] **Step 2: Criar template** — cabeçalho canônico (título "PRONTUÁRIO<br>CONTINUAÇÃO"), seções numeradas com faixa cinza tipo formulário técnico, TODO texto `contenteditable="true"`, fonte 8.5px justificada. Conteúdo padrão EXATO:
  - **6 — PROCEDIMENTOS DE INSPEÇÃO**: "Certificamos que o equipamento foi inspecionado em conformidade com a norma regulamentadora NR-13 do Ministério do Trabalho e Emprego, e demais normas aplicáveis. As inspeções de segurança periódicas devem ser realizadas nos prazos máximos estabelecidos pela NR-13 conforme a categoria do equipamento, por Profissional Legalmente Habilitado, compreendendo exames externo, interno e teste hidrostático quando aplicável. Os resultados devem ser registrados no Livro de Registro de Segurança e no relatório de inspeção correspondente."
  - **7 — DISPOSITIVOS DE SEGURANÇA**: tabela 3 linhas — 7.1 Válvula de Segurança: "Calibrada para abertura na pressão indicada, aferida por empresa competente"; 7.2 Material de Construção / Corpo: "—"; 7.3 Pressão Máxima de Abertura: valor sugerido = PMTA em kgf/cm² (id `val-pressao-abertura`, editável).
  - **8 — ATENÇÃO** (lista numerada 8.1–8.10, texto padrão):
    - 8.1 Os dados assinalados neste prontuário foram obtidos em conformidade com a NR-13 do Ministério do Trabalho e Emprego.
    - 8.2 Verifique semanalmente o funcionamento da válvula de segurança.
    - 8.3 Realize anualmente a aferição do manômetro e da válvula de segurança por empresa competente; esta operação deve ser realizada em dispositivo não previsto ao seu uso normal.
    - 8.4 É de responsabilidade do usuário final realizar novo teste hidrostático do vaso de pressão e outro após cinco anos da data de fabricação, mediante a inspeção e aprovação de um engenheiro responsável (Profissional Legalmente Habilitado), de acordo com a NR-13. Os períodos subsequentes serão determinados pelo próprio engenheiro responsável.
    - 8.5 Nunca efetue reparos ou serviços de solda no Vaso de Pressão.
    - 8.6 A instalação, manutenção e a operação do vaso devem ser realizadas somente por pessoal treinado, conforme a norma NR-13 MTE.
    - 8.7 O usuário final deve possuir documentação especificada do vaso de pressão, de acordo com a norma NR-13 MTE.
    - 8.8 Este documento perde a validade se o vaso de pressão tiver sofrido ou vir a sofrer qualquer alteração das suas características originais.
    - 8.9 O vaso de pressão com compressor/motor montados sobre o mesmo deve ser instalado com amortecedores de vibração e não deve ser chumbado rigidamente ao piso.
    - 8.10 Nunca opere o equipamento acima da PMTA indicada neste prontuário.
  - Linha final: bloco **Responsável:** com rubrica + "CREA nº: PR-166121/D" fictício (mesma classe `.resp-*` do bloco canônico, versão 1 coluna à esquerda + célula CREA à direita, igual ao print).
  - Rodapé canônico. **Medir**: se estourar 297mm em fonte 8.5px, reduzir para 8px antes de dividir; divisão em 2 folhas só se ainda estourar (então criar `PRONT-CONTINUACAO-2.html` movendo a seção 8 inteira, e avisar no report — Task 8 ajusta a lista).
- [ ] **Step 3: `npm run build` verde.**
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 5 - procedimentos de inspecao, dispositivos de seguranca e atencao"`

---

### Task 7: Folha 6 — PRONT-MEMORIAL.html (resumo de cálculos)

**Files:**
- Create: `public/arquivos-prontuario/PRONT-MEMORIAL.html` (cópia adaptada de `public/arquivos-inspecao/RESUMO-MEMORIAL.html`)
- Referências: arquivo fonte `public/arquivos-inspecao/RESUMO-MEMORIAL.html` (ler INTEIRO — contém `buildResumoDinamico`, merge GV com `data-gv="1"`, auto-shrink).

**Interfaces:**
- Consumes: `nr13_calc_<TAG>` + `nr13_calc_gv_<TAG>` (merge leitura, prefixo `GV — `, células GV fora do laudo limitante — comportamento já existente no arquivo fonte, PRESERVAR), `nr13_pref_unidade_<TAG>`, meta, minha empresa.
- Produces: nada.

- [ ] **Step 1: Ler `RESUMO-MEMORIAL.html` inteiro.**
- [ ] **Step 2: Copiar e adaptar SOMENTE:** (a) título da folha → "RESUMO DE CÁLCULOS DA PMTA E ESPESSURA"; (b) TAG resolvida por `nr13_prontuario_atual.tag`/`?tag=` (não `nr13_relatorio_meta_atual`); (c) cabeçalho info = REL nº + Data de Emissão (meta do prontuário); (d) rodapé sem paginação. NÃO tocar em `buildResumoDinamico`, `calcularLimitantes`, auto-shrink, merge GV.
- [ ] **Step 3: `npm run build` verde.**
- [ ] **Step 4: Commit** — `git commit -m "feat(prontuario): folha 6 - resumo de calculos da PMTA e espessura"`

---

### Task 8: Wiring — PAGINAS_PRONTUARIO, gravação meta/croqui, CLAUDE.md

**Files:**
- Modify: `src/features/prontuarios/tipos.ts` (const `PAGINAS_PRONTUARIO`)
- Modify: `src/pages/Prontuarios.tsx`
- Modify: `CLAUDE.md` (§2 tabela de chaves + §8)
- Test: `src/features/prontuarios/__tests__/prontuarioService.test.ts` (já existe; sem teste novo — mudança é wiring de UI)

**Interfaces:**
- Consumes: `obterOuCriarMeta(tag)`, `gravarCroqui3d(tag, b64)` da Task 1.
- Produces: nova lista de folhas usada pelo visualizador.

- [ ] **Step 1: `tipos.ts`** — substituir a lista:

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

(Se Task 6 criou `PRONT-CONTINUACAO-2.html`, incluir após CONTINUACAO.)

- [ ] **Step 2: `Prontuarios.tsx`** — no fluxo que abre o visualizador (onde chama `gravarProntuarioAtual(dados)` antes de montar iframes): `await obterOuCriarMeta(tag);` e `if (dados.croqui) await gravarCroqui3d(tag, dados.croqui);`. No callback `onCaptura` do `CroquiVaso3D` (linha ~800, `set('croqui', b64)`): também `void gravarCroqui3d(dados.tag, b64)`. Imports do service.
- [ ] **Step 3: `CLAUDE.md`** — §2: linhas novas na tabela: `nr13_prontuario_meta_<TAG>` (nº REL + data de emissão do prontuário; reusado entre reimpressões) e `nr13_croqui3d_<TAG>` (imagem base64 do croqui 3D p/ folha de ultrassom). §8: trocar a lista de folhas por: "Folhas: PRONT-ULTRASSOM (grade de espessuras + croqui 3D + rastreabilidade + responsabilidade técnica), PRONT-CROQUI2D (croqui 2D cotado + dimensões reais), PRONT-FOLHA-DADOS (prancha técnica), PRONT-PRONTUARIO (construtivo + categorização), PRONT-CONTINUACAO (procedimentos/dispositivos/atenção), PRONT-MEMORIAL (resumo de cálculos). Rodapés SEM paginação. Assinatura fictícia até o motor de assinatura existir. / PRONTUARIO-RECONSTITUICAO-1..4 seguem no relatório."
- [ ] **Step 4: Rodar** — `npm test` (todos verdes) e `npm run build` (verde); `npm run lint` sem erros NOVOS.
- [ ] **Step 5: Commit** — `git commit -m "feat(prontuario): ativa as 6 folhas novas e grava meta/croqui na geracao"`

---

### Task 9: Verificação visual no navegador (controller, não subagent)

**Files:** nenhum (correções que surgirem = fix-subagents pontuais).

- [ ] **Step 1:** Dev server rodando (`npm run dev`), Chrome logado; abrir Prontuários → VASO A23 → gerar croqui 3D → visualizador.
- [ ] **Step 2:** Conferir folha a folha contra os PNGs: folha 1 (grade + croqui à direita + rastreabilidade + assinatura + rodapé sem nº), folha 2 (croqui 2D cotado + tabela dimensões reais), folha 3 (prancha), folha 4 (categorização presente), folha 5 (textos), folha 6 (resumo com GV quando houver). Checar: nada cortado em 297mm, sem vazio grande, `—` nos ausentes.
- [ ] **Step 3:** Imprimir (preview PDF) e conferir A4 exato.
- [ ] **Step 4:** Bugs achados → fix subagents; re-verificar; commit final se houver ajustes.
