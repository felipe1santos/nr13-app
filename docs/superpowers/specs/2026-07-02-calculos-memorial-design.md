# Design — Correção e expansão dos cálculos ASME/NR-13 (Bloco 1 de 6)

**Data:** 2026-07-02
**Status:** aguardando aprovação do usuário
**Escopo:** somente motor de cálculo + memorial. Não altera: injeção nos templates, chaves de
`localStorage`, `categoria.ts` (regra absoluta do CLAUDE.md §4), fluxo de geração de relatório.

## Contexto

O sistema já calcula (em `src/calc/`):

- **Vaso** (`vaso.ts`, ASME VIII Div. 1): cilíndrico, elíptico 2:1, toriesférico, esférico,
  plano UG-34, plano aparafusado, cone UG-32(g), bocal UG-37, flange Ap. 2.
- **Caldeira** (`caldeira.ts`, ASME I): costado PG-27.2.2, tubos, tampo abaulado, espelho
  estaiado, placa plana, fornalha ondulada (com ressalva "NÃO VERIFICADO").
- **Autoclave** (`autoclave.ts`): retangular UG-47 e cilíndrica UG-27(c).
- UI em `src/features/memorial/` — `MemorialCaldeira.tsx` já tem subtipos
  `flamotubular` / `aquatubular` com abas por componente.
- 18 testes vitest passando (baseline).

A pasta `CALCULOS/` na raiz contém as planilhas e prints de referência do engenheiro
(fonte de verdade das fórmulas): flamotubular, aquatubular, autoclave vertical e tampo
plano aparafusado UG-34.

## Problema 1 — "Avisos laranja" no memorial

Diagnóstico: `Campo.tsx` marca em laranja (classe `campo-aviso` + ícone ⚠) todo campo
vazio ou ≤ 0. É proposital ("campo não preenchido"), mas tem dois defeitos reais:

1. **Defaults silenciosos.** Se o usuário deixa S vazio, `numOuPadrao` assume 137.9 MPa
   (e P=1.5, E=0.85, D=1000…) e o memorial sai calculado com números que o usuário nunca
   digitou — sem nenhum aviso no resultado. Perigoso em documento de engenharia.
2. **Sem explicação.** Nenhuma legenda diz o que o laranja significa.

### Solução

- **Legenda fixa** no topo de cada memorial: "⚠ campo obrigatório sem valor válido".
- **Bloqueio de default silencioso:** ao Gerar/Salvar com campo obrigatório vazio, exibir
  banner listando os campos faltantes. O cálculo ainda roda (preview), mas o log do
  memorial imprime linha destacada `// ATENÇÃO: valor padrão adotado para S (137.9 MPa) —
  campo não preenchido` para cada default usado, e o resultado final vira
  "PENDENTE — dados incompletos" em vez de APROVADO/REPROVADO.
- **Auditoria de falsos positivos:** revisar todos os `warn=` (ex.: campo preenchido que
  continua laranja por valor salvo como string) e corrigir.

## Problema 2 — Tipos de caldeira incompletos

Hoje: flamotubular e aquatubular. Usuário pediu "todas as principais, como mista etc.".

### Solução — 5 tipos, compostos dos mesmos cálculos de componente

| Tipo | Componentes (abas) | Norma |
|---|---|---|
| **Flamotubular** (existe) | costado, tampo/fundo (elíptico/torisférico/plano), espelho (estaiado/não estaiado), fornalha (lisa/ondulada), tubos de fogo | ASME I PG-27, PG-46/47, PFT |
| **Aquatubular** (existe) | tubulão superior/inferior, coletores, fundos, tubos/superaquecedor/economizador (PMTA = 2SEt/D) | conforme planilha `Planilha_Caldeira_Aquatubular_NR13_ASME.xlsx` |
| **Mista** (novo) | união: tubulão + parede d'água (aqua) + costado + fornalha + espelhos + tubos de fogo (flamo). Usuário ativa só as abas que o equipamento tem | reuso dos dois acima |
| **Elétrica** (novo) | casco cilíndrico + tampos — sem fornalha, sem piso de 6 mm PG-16.3 (exceção explícita da PG-16.3 p/ caldeira elétrica) | ASME VIII (reusa `vaso.ts`) |
| **Vertical fogotubular** (novo) | costado, fornalha cilíndrica interna (t = PR/(SE−0.6P); PMTA = tSE/(R+0.6t) — print de referência), espelho/placa tubular, tubos | ASME I |

- Seletor de tipo no memorial (hoje já existe para flamo/aqua — estende para 5).
- PMTA global do equipamento = menor PMTA entre componentes ativos (regra já existente).
- Fornalha ondulada: mantém ressalva atual até validar contra planilha flamotubular.

## Problema 3 — Tampo plano aparafusado incompleto

`planoAparafusado` hoje usa C=0.33 + checagem simplificada de parafusos. A fórmula UG-34
correta para tampo aparafusado com junta (sketch j/k) tem termo de momento dos parafusos:

```
t = d·√( C·P/(S·E) + 1.9·W·hG/(S·E·d³) )
```

com C=0.3, W = carga dos parafusos (Wm1/Wm2, Ap. 2), hG = braço do momento da junta.

### Solução

- Reescrever `planoAparafusado` com a fórmula completa UG-34 sketch j/k, validando contra
  `Planilha_Tampo_Plano_UG34_ASME_Status.xlsx`.
- Manter o tipo `plano` (soldado, C=0.33) como está.
- Entradas novas: G (diâmetro da junta), b, m, y (fatores de junta — já existem no tipo
  flange), N, d_par, S_par (já existem).

## Problema 4 — Autoclave vertical

Pasta `CALCULOS/Autoclave vertical` tem planilha corrigida + print com PMTA de seção
cônica: `PMTA = t·S·E / (D/(2·cosα) + 0.6·t)` (equivalente algébrico do cone UG-32(g) já
implementado em `vaso.ts`).

### Solução

- Novo subtipo `vertical` em `autoclave.ts`: casco cilíndrico + fundo cônico + tampa
  (plana aparafusada ou abaulada), compondo cálculos existentes de `vaso.ts`.
- Validar números contra `Autoclave_vertical_corrigida_ASME (1).xlsx`.

## Validação (TDD)

1. Extrair valores das planilhas xlsx (unzip + XML — sem python na máquina) para casos de
   teste: entradas → t_req, PMTA, status esperados.
2. Um arquivo de teste por equipamento novo (`mista.test.ts`, `eletrica.test.ts`,
   `vertical.test.ts`, `planoAparafusado` em `vaso.test.ts`, `autoclave vertical` em
   `autoclave.test.ts`).
3. Testes existentes (18) continuam passando — nenhuma fórmula atual muda, exceto
   `planoAparafusado` (correção deliberada, documentada no cabeçalho do arquivo, padrão já
   usado no projeto).

## Abordagens consideradas

- **A (escolhida): estender módulos atuais.** Tipos novos de caldeira = composição das
  funções de componente existentes; UI estende o seletor que já existe. Zero rewrite,
  respeita "não estrague a lógica".
- **B: motor genérico data-driven** (fórmulas em JSON). Elegante, mas reescreve tudo —
  risco alto, proibido pelo usuário.
- **C: patch mínimo** (presets sobre a tela atual). Não entrega mista/elétrica/vertical
  de verdade.

## Fora de escopo deste bloco

- Vida remanescente (bloco 2), redesign UI (bloco 3), offline sync (bloco 4), fontes dos
  relatórios (bloco 5), portal do cliente (bloco 6).
- Alterar `categoria.ts` ou unidades do enquadramento (proibido — CLAUDE.md §4).
- Alterar chaves de `localStorage` ou o shape de `nr13_calc_<TAG>` (templates dependem).
  Campos novos são aditivos.
