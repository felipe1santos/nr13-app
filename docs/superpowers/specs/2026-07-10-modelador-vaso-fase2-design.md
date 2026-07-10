# Design — Fase 2 do Prontuário: Modelador 3D/2D de Vaso de Pressão (estilo PVElite)

Data: 2026-07-10. Aprovado pelo usuário ("aprovado pode fazer!") após 4 decisões + 1 correção
importante de escopo. Referências visuais: `C:\Users\felipe\Downloads\DOCUMETNACAO-PRONTUARIO\`
(`painel croqui 3D no modelo PVELIT.png` = painel de elementos; `croqui 3D com saia-2.png`,
`transparente-visao-interna.png` = modos do 3D; `vista 2D com vista 3D perspectiva.jpeg` = prancha
2D; `Captura de tela 2026-07-09 162348.png` = vista 2D cotada).

## Decisões fechadas com o usuário

1. **Localização:** dentro do fluxo de Prontuários — substitui o botão "Gerar Croqui 3D".
2. **SEM pontos de medição de espessura no 3D nem no 2D** (correção explícita do usuário).
   Os pontos ficam SÓ na malha/tabela de medição (folha de ultrassom), que destaca em amarelo a
   menor espessura por componente com posição/ângulo. O 3D mostra o modelo visual com linhas de
   cota, bocais e acessórios; o 2D é o desenho técnico completo (vistas longitudinal e
   transversal, dimensões dos tampos: raio, profundidade, raio da coroa quando aplicável,
   circunferência etc.).
3. **Pesos automáticos** do modelo (densidade aço default 7850 kg/m³ editável; peso vazio pelo
   volume de aço, cheio d'água pelo volume interno, peso em operação editável).
4. **Bocais:** importa os do memorial (UG-37) pré-carregados + bocais livres só de geometria
   (posição, orientação, projeção, DN, serviço, flange). Lista de bocais da folha de dados sai daí.

## Escopo

- **Nesta fase:** modelador para VASO DE PRESSÃO (e autoclave usa o corpo como vaso). Caldeira
  fica fora (sem croqui 3D/2D, como hoje).
- **Fora (fase 3+):** motor de assinatura; pontos de espessura clicáveis no modelo; export DXF.

## Arquitetura (visão geral)

```
src/features/modelador/
  tiposModelador.ts      — interfaces do modelo (ModeloVaso, BocalModelo, ...)
  modeladorService.ts    — carregar/salvar (nr13_modelo3d_<TAG>), pré-carga do memorial,
                           geração e gravação dos derivados no save
  geometriaVaso.ts       — motor puro: dimensões derivadas, volumes, pesos (vitest)
  croqui2dService.ts     — gera SVGs 2D (longitudinal, transversal, detalhe tampo) do modelo
  ModeladorVaso.tsx      — tela: painel de elementos + viewport 3D
  Viewport3D.tsx         — three.js: cena, OrbitControls, translúcido, cotas, captura PNG
  PainelElementos.tsx    — lista de elementos + formulário do selecionado (estilo PVElite)
  modelador.css
```

Fluxo de dados no **Salvar** do modelador (tudo via `salvar()` do storage, sincroniza nuvem):

| Chave | Conteúdo | Consumidor |
|---|---|---|
| `nr13_modelo3d_<TAG>` | `ModeloVaso` (fonte da verdade do modelador) | reabrir o modelador |
| `nr13_croqui3d_<TAG>` | PNG base64 capturado do viewport | folha 1 (PRONT-ULTRASSOM) — já existe |
| `nr13_croqui2d_<TAG>` | `{ longitudinal: svg, transversal: svg, detalheTampo: svg }` | folha 2 (PRONT-CROQUI2D) |
| `nr13_folha_dados_<TAG>` | payload derivado: bocais[], pesos, dimensões por componente, orientação de bocais | folha 3 (PRONT-FOLHA-DADOS) |

**Por quê pré-gerar no save:** motor de geometria fica em TypeScript puro com teste unitário;
os templates HTML continuam burros (só leem localStorage e injetam), zero duplicação de lógica.

**Fallback/compat:** sem `nr13_croqui2d_<TAG>` → folha 2 desenha o croqui genérico atual; sem
`nr13_folha_dados_<TAG>` → folha 3 mostra "—"/linhas vazias como hoje. Nada quebra para
equipamentos sem modelo.

## Modelo de dados (`tiposModelador.ts`)

```ts
export type TipoTampoModelo = 'eliptico' | 'toriesferico' | 'hemisferico' | 'plano';
export type TipoSuporte = 'saia' | 'pes' | 'selas' | 'nenhum';
export type LocalBocal = 'casco' | 'tampo1' | 'tampo2';

export interface TampoModelo {
  tipo: TipoTampoModelo;
  espessura: number | '';        // mm
}

export interface BocalModelo {
  id: string;                    // 'N1', 'N2', ...
  doMemorial: boolean;           // importado do UG-37 (não editável em Ø/t; posição sim)
  servico: string;               // ex.: 'Entrada de ar'
  dn: string;                    // ex.: '2"'
  diametro: number | '';         // mm (Ø interno)
  espessura: number | '';        // mm (pescoço)
  flange: string;                // ex.: 'SO #150' (texto livre)
  local: LocalBocal;
  posicaoAxial: number | '';     // mm a partir da linha de tangência do tampo1 (só casco)
  angulo: number | '';           // graus 0-360 (0 = topo na horizontal / norte na vista de topo)
  projecao: number | '';         // mm para fora do costado
}

export interface SuporteModelo {
  tipo: TipoSuporte;
  altura: number | '';           // mm (saia/pés)
  quantidade: number | '';       // pés (2-4) / selas (2)
}

export interface ModeloVaso {
  tag: string;
  orientacao: 'vertical' | 'horizontal';
  diametroInterno: number | '';  // mm
  comprimentoCilindro: number | ''; // mm (tan-tan)
  espessuraCasco: number | '';   // mm
  tampo1: TampoModelo;           // superior (vertical) / esquerdo (horizontal)
  tampo2: TampoModelo;
  bocais: BocalModelo[];
  suporte: SuporteModelo;
  densidadeAco: number;          // kg/m³, default 7850
  pesoOperacao: number | '';     // kg, editável (default = vazio + água)
  material: string;              // do memorial, exibição
}
```

## Motor de geometria (`geometriaVaso.ts` — funções puras, testadas)

- `dimensoesTampo(tipo, D, t)` → `{ profundidade, raioCoroa?, raioCanto?, alturaTotal }`:
  elíptico 2:1 `h = D/4`; toriesférico `raioCoroa = D`, `raioCanto = 0,1·D`, `h ≈ 0,1935·D`
  (Klopper, aproximação de engenharia declarada); hemisférico `h = D/2`; plano `h = t`.
- `comprimentoTotal(modelo)` = comprimento cilindro + profundidades dos 2 tampos (+ altura do
  suporte quando vertical, informado como "altura total c/ suporte" separada).
- `circunferencia(D)` = π·D externo (D + 2t).
- `volumeInterno(modelo)` m³ = cilindro + tampos (elíptico `π·D³/24`; toriesférico aproxima
  `0,9·π·D³/24` do elíptico? NÃO — usar fórmula própria `V ≈ 0,0847·D³`; hemisférico `π·D³/12`;
  plano 0) — constantes documentadas no código com a fonte.
- `volumeAco(modelo)` m³ = casquete/casco pelas áreas × espessuras (aproximação de casca fina:
  área média × t), incluindo pescoços de bocais (cilindro Ø×projeção×t) e suporte (saia =
  casca cilíndrica; pés = perfil estimado fixo 0 — declarar "não incluído" na folha).
- `pesos(modelo)` → `{ vazio, cheioDagua, operacao }` kg: vazio = volumeAco × densidade;
  cheio = vazio + volumeInterno × 1000; operacao = editável (default cheio).
- Todas retornam `null` para entradas incompletas — consumidores exibem "—".

## Pré-carga do memorial (`modeladorService.carregarOuPreCarregar(tag)`)

Se `nr13_modelo3d_<TAG>` existe → retorna. Senão monta default de `nr13_vaso_<TAG>` (VasoSalvo):
- `D` global → diametroInterno; `orientacao` → orientacao.
- componente `cilindrico` → espessuraCasco = `dados.t_comercial`; comprimento fica vazio (usuário
  informa — memorial não tem comprimento).
- componentes tampo (`eliptico`/`toroesferico`/`esferico`→hemisferico/`plano`/`planoAparafusado`→plano)
  → tampo1/tampo2 na ordem em que aparecem (tipo + `t_comercial`).
- componentes `bocal` → BocalModelo `doMemorial: true`, id sequencial N1..., diametro = `dados.d`,
  espessura = `dados.t_comercial`, projecao = `dados.proj_int` ou 150 default; local 'casco',
  angulo 0, posicaoAxial vazio (usuário posiciona).
- material do casco (`dados.mat`) → material.
- Autoclave: usa `nr13_vaso_ac_corpo_<TAG>` quando `nr13_vaso_<TAG>` não existir.

## Editor (`ModeladorVaso.tsx` + `PainelElementos.tsx`)

- Aberto de Prontuários (formulário → seção "Croqui 3D e Modelo"): botão **"⬡ Abrir Modelador"**
  substitui o "Gerar Croqui 3D" atual; abre overlay full-screen (como o modal do memorial).
- Painel esquerdo (estilo print PVElite): árvore de elementos — Geral (orientação, Ø, comprimento,
  material, densidade), Casco, Tampo 1, Tampo 2, Bocais (lista + "+ Bocal", remover só nos livres),
  Suporte, Pesos (calculados + operação editável). Formulário do elemento selecionado à direita
  do painel. Campos numéricos aceitam vírgula decimal (mesma máscara do memorial).
- Viewport (direita, ~60%): three.js.
- Rodapé do overlay: "Salvar Modelo" (grava as 4 chaves; toast ok), "Cancelar".
- Responsivo mobile: painel empilha sobre o viewport (accordion), viewport com touch (OrbitControls
  já suporta touch).

## Viewport 3D (`Viewport3D.tsx`)

- three.js 0.184 (já no projeto) + `OrbitControls` de `three/addons` — rotação/zoom/pan.
- Geometria: casco = `CylinderGeometry` aberto; tampos elíptico/toriesférico/hemisférico =
  `SphereGeometry` escalada (lathe para toriesférico é overkill — escala de meia esfera com
  profundidade correta do motor); plano = disco. Bocais = cilindro + flange (disco) posicionados
  por (local, posicaoAxial, angulo, projecao). Saia = cilindro; pés = caixas; selas = caixas
  curvas simplificadas.
- **Modo translúcido** (toggle): material `transparent, opacity 0.45` — vê bocais com projeção
  interna e o interior (igual print rosa).
- **Cotas 3D** (toggle, on por default): linhas de cota com setas + rótulo (sprite/Canvas) para
  Ø interno e comprimento total — mesmo estilo do CroquiVaso3D atual (helpers `cotaV`/`cotaH`
  podem ser portados).
- Captura PNG: renderer `preserveDrawingBuffer`, câmera de captura em perspectiva 3/4 (posição
  fixa), fundo branco, `toDataURL('image/png')` → `gravarCroqui3d`.
- `CroquiVaso3D.tsx` atual permanece para compat, mas o fluxo de Prontuários passa a usar o
  modelador; remoção do componente antigo só se nada mais o referenciar.

## Croqui 2D (`croqui2dService.ts` → SVGs gravados no save)

Estilo de traço técnico dos exemplos (linhas finas #444, CL tracejada, cotas com setas, textos
7-9px):
1. **Vista longitudinal** — contorno do vaso na orientação real com tampos pelo perfil correto do
   tipo; bocais como stubs na posição axial/ângulo (projetados no plano); cotas: Ø interno,
   comprimento cilindro, comprimento total, posição axial de cada bocal (linha de chamada com o
   id N1, N2...), altura do suporte.
2. **Vista transversal** — círculo (Ø externo + circunferência anotada) com os bocais plotados
   nos ângulos (raio de chamada + id), marcação 0°/90°/180°/270°.
3. **Detalhe do tampo** — perfil do tampo 1 cotado: profundidade, espessura, raio da coroa e raio
   de canto (toriesférico), raio (hemisférico), Ø. Rótulo do tipo por extenso.
- Assinatura: `gerarCroquis2d(modelo): { longitudinal, transversal, detalheTampo }` (strings SVG
  completas `<svg viewBox=...>`). Funções de cota compartilhadas dentro do service. Testes:
  SVG bem-formado (parse via DOMParser em teste jsdom-shim — ou regex de sanidade), sem NaN,
  contém os ids de bocais e valores cotados esperados.

## Integração nas folhas (templates)

- **PRONT-CROQUI2D.html:** se `nr13_croqui2d_<TAG>` existir → injeta `longitudinal` no lugar do
  desenho genérico, `transversal` + `detalheTampo` em linha abaixo (grid 2 colunas), tabela de
  dimensões ganha linhas extras (comprimento total, circunferência, profundidade do tampo, pesos).
  Sem a chave → comportamento atual intacto.
- **PRONT-FOLHA-DADOS.html:** se `nr13_folha_dados_<TAG>` existir → LISTA DE BOCAIS preenchida
  (TAG | SERVIÇO | QTD 1 | DN | FLANGE | OBS=posição/ângulo), TABELA DE PESOS com os 3 valores +
  nota "peso calculado do modelo (aço <densidade> kg/m³); suportes tipo pés não incluídos",
  ORIENTAÇÃO DE BOCAIS com os bocais plotados no círculo (ângulo + id), COMPONENTES com dimensões
  derivadas. Sem a chave → como hoje.
- **Prontuarios.tsx:** botão do modelador; `dados.croqui` continua funcionando (o save do
  modelador também atualiza `dados.croqui` do prontuário aberto quando houver).

## Payload `nr13_folha_dados_<TAG>`

```ts
interface FolhaDadosDerivada {
  geradoEm: string;                     // dd/mm/aaaa
  orientacao: 'vertical' | 'horizontal';
  bocais: { id: string; servico: string; dn: string; flange: string; obs: string; anguloGraus: number | null }[];
  pesos: { vazioKg: number | null; cheioDaguaKg: number | null; operacaoKg: number | null; densidade: number; notaSuporte: boolean };
  dimensoes: { componente: string; texto: string }[];  // ex.: 'Tampo 1 (elíptico 2:1) — Ø1000 t=10 h=250'
  comprimentoTotalMm: number | null;
  circunferenciaMm: number | null;
}
```

## Testes

- `geometriaVaso.test.ts`: dimensões por tipo de tampo (valores de referência calculados à mão no
  plano), volumes (cilindro+elíptico conferido contra fórmula fechada), pesos (caso Ø1000×2000
  t=10 → ~vazio esperado), entradas vazias → null.
- `modeladorService.test.ts`: pré-carga do memorial (vaso com casco+2 tampos+1 bocal), save grava
  as 4 chaves, reabrir retorna o modelo salvo.
- `croqui2dService.test.ts`: SVGs contêm cotas/ids esperados, sem `NaN`/`undefined`, viewBox
  presente; bocal a 90° aparece na transversal na posição certa (regex do transform/coords).
- Verificação visual navegador (controller): montar modelo do VASO A23 (Ø1000, comprimento 2000,
  bocais N1 topo 0°/N2 45°), conferir 3D (rotação, translúcido, cotas), gerar prontuário e conferir
  folhas 1/2/3 com os novos conteúdos; conferir fallback num equipamento sem modelo.

## Execução

Subagent-driven development, ledger em `.superpowers/sdd/progress.md`, mesma disciplina da fase 1
(implementador + revisor por task, revisão final de branch, verificação visual no Chrome).
