# Croqui 2D técnico realista (motor de desenho do prontuário) — Design

Data: 2026-07-11. Status: aprovado pelo usuário.

## Objetivo

Elevar os 3 SVGs gerados por `gerarCroquis2d` (`src/features/modelador/croqui2dService.ts`) ao
nível de desenho técnico de fabricante (referências: pranchas de air receiver vertical/horizontal
com top view, nozzle chart e cotas — imagens a1–a4 fornecidas pelo usuário), consumidos pela folha
2 do prontuário (`public/arquivos-prontuario/PRONT-CROQUI2D.html`).

## Restrições

- API pública inalterada: `gerarCroquis2d(m: ModeloVaso): Croquis2d | null` com
  `{ longitudinal, transversal, detalheTampo }` — templates e save do modelador não mudam.
- SVGs auto-contidos (sem CSS externo), imprimíveis em A4.
- Invariantes herdadas da fase 1: margem interna ≥14px para texto, toda coordenada clampada ao
  viewBox, nenhum NaN/undefined emitido (tudo passa por `num()`; aborta cedo com null).
- IDs de bocal são texto do usuário → escapar via `esc()` antes de interpolar.

## Arquitetura (3 módulos, mesma pasta)

1. **`croquiPrimitivas.ts`** — primitivas puras de desenho (retornam strings SVG ou empurram em
   `parts: string[]`): `seta`, `cota` (linear), `cotaAngular` (arco com setas + rótulo em graus),
   `flange` (pescoço com placa dupla, orientável), `costura` (linha fina de solda), `calloutEspessura`
   (leader + texto `t=X`), `esc`, `fmt`, `clamp`, `num` re-export.
2. **`croquiTampos.ts`** — geradores de path do perfil de cada tampo com PAREDE DUPLA (contorno
   externo + interno deslocado pela espessura):
   - Elíptico 2:1: arco elíptico, h=D/4.
   - Toriesférico (Klopper): geometria real coroa Rc=D + canto rc=0,1·D tangentes (não arco
     elíptico genérico).
   - Hemisférico: semicírculo, h=D/2.
   - Plano: retângulo, h=t.
   Variantes: horizontal (chord vertical, esquerda/direita) e vertical (chord horizontal,
   cima/baixo), + perfil isolado para a vista de detalhe.
3. **`croqui2dService.ts`** — orquestra as 3 vistas usando 1 e 2.

## Vistas

### Longitudinal (horizontal e vertical)

- Traço técnico: fill `#fff`, stroke preto (remove cinza atual).
- Costuras: linha de tangência sólida fina nas junções tampo-casco; campo novo `virolas`
  (nº de virolas do casco, default 1) → n−1 costuras circunferenciais intermediárias
  igualmente espaçadas.
- Bocais de casco por ângulo (0°=topo, horário visto de cima — convenção existente):
  - ângulo em [315°,360°)∪[0°,45°) → stub pescoço+flange no contorno de cima;
  - [135°,225°) → embaixo;
  - demais → projeção na face do casco: círculo na posição axial (elipse se Ø do bocal ≥ 300 mm,
    caso boca de visita); observador da vista longitudinal fica no lado 90° → [45°,135°) é a
    frente (traço sólido) e [225°,315°) é o fundo (tracejado).
- Bocais de tampo: stub pescoço+flange no polo do tampo, deslocado pela projeção do ângulo.
- Cotas: Ø externo (com callout `t=` do casco via leader), L do cilindro (entre linhas de
  tangência), comprimento total, posição axial de cada bocal a partir da linha de tangência do
  tampo 1 (escalonadas p/ não sobrepor), altura do suporte quando houver.
- Suportes realistas: selas (trapézio sob o casco, 2×), pés (perna + chapa de base), saia
  (trapézio + chapa), conforme `suporte.tipo` e orientação.

### Transversal (vista de topo)

- Anel de parede: círculo externo + interno, callout `t=` com leader.
- Cota diagonal `Ø<D>` dentro do círculo (estilo Ø700 da referência).
- Cruz de centro tracejada + marcas 0/90/180/270°.
- Por bocal de casco: stub radial pescoço+flange no ângulo, retângulo de flange tracejado
  projetado (estilo top view a1) e arco de ângulo cotado em graus a partir de 0°, com raios
  escalonados por índice para não sobrepor.
- Bocais de tampo: marcador no centro com id (estilo `a`/`e` da a1).

### Detalhe do tampo

- Perfil real do tampo 1 com parede dupla; toriesférico com coroa+canto tangentes.
- Cotas: Ø, h (profundidade), `t=` com leader; Rc/rc com leaders no toriesférico.
- Título por extenso (mantém).

## Dados novos

- `ModeloVaso.virolas: number | ''` — default 1; modelos salvos sem o campo tratados como 1
  (migração na leitura). Campo numérico no formulário do modelador (seção do casco).
- `FolhaDadosDerivada` inalterada.

## Testes

`__tests__/croqui2dService.test.ts` (+ novos arquivos se preciso): casos por tipo de tampo,
virolas>1 (conta costuras), bocal frontal/traseiro (tracejado), arcos de ângulo na transversal,
invariantes (sem NaN, coordenadas dentro do viewBox, ids escapados).

## Fora de escopo

Costuras cadastradas manualmente; nozzle chart tabular (já existe tabela de dimensões na folha);
mudanças no 3D.
