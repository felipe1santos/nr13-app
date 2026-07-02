# Design — Vida Remanescente (Bloco 2 de 6)

**Data:** 2026-07-02
**Status:** aprovado verbalmente ("quero q vc continue")

## Objetivo

Calcular a vida remanescente do equipamento a partir do desgaste de espessura entre duas
inspeções (método da taxa de corrosão, API 510 §7 adaptado à NR-13) e sugerir o prazo da
próxima inspeção.

## Fontes de dados (tudo já existe no sistema)

- **Medições de espessura**: containers de inspeção (`nr13_docs_<TAG>`), cada um com
  `criadoEm` (dd/mm/aaaa) e `dados.ultrassom.medidas` (grade ts/c1..c4/ti × 4 ângulos).
  Duas inspeções em datas diferentes ⇒ taxa medida. Uma só ⇒ fallback: espessura nominal
  (`espNomCasco` do formulário de ultrassom ou input manual) + ano de fabricação (`info.ano`).
- **Espessura mínima requerida**: `nr13_calc_<TAG>.componentes[].tReqMm` (menor) ou `ecasco`.
- **Categoria**: `nr13_cat_<TAG>.catFinal` (I–V) para o teto de prazo da NR-13.

## Fórmulas

```
taxa (mm/ano)      = (t_anterior − t_atual) / Δanos          [se ≤ 0 → "sem desgaste mensurável"]
sobremetal (mm)    = t_atual − t_requerida
vida (anos)        = sobremetal / taxa
próxima inspeção   = min(vida / 2, teto NR-13)
```

Teto NR-13 (inspeção interna, estabelecimento SEM SPIE):
- Vasos/autoclaves por categoria: I=3, II=4, III=6, IV=8, V=10 anos.
- Caldeiras: 1 ano (12 meses).
- Sem categoria salva: teto não aplicado (mostra aviso).

## Componentes

1. **`src/calc/vidaRemanescente.ts`** (motor puro + log estilo memorial, testável):
   - `parseDataBR(s): Date | null`
   - `calcularVidaRemanescente(entrada): ResultadoVida` com
     `{ taxaMmAno, sobremetalMm, vidaAnos, proximaInspecaoAnos, prazoNR13Anos, avisos[], log[] }`
   - Casos-limite: taxa ≤ 0 (vida = null, aviso), sobremetal ≤ 0 (vida = 0, REPROVADO já na
     espessura), Δanos ≤ 0 (aviso, sem cálculo).
2. **`src/features/equipamento/VidaRemanescente.tsx`** — card na ficha do equipamento:
   - Auto-preenche com as 2 medições mais recentes (mínimo global da grade de cada container);
     campos editáveis para o caso manual (1 inspeção só / espessura nominal + ano de fabricação).
   - Botão Calcular → mostra taxa, vida, próxima inspeção + log.
   - Salvar → `nr13_vida_<TAG>` (chave nova, aditiva — documentar no CLAUDE.md §2).
3. **Testes**: `src/calc/__tests__/vidaRemanescente.test.ts` (taxa, vida, tetos, casos-limite).

## Fora de escopo

Folha nova de relatório (ordem do §7 do CLAUDE.md é fixa; injeção em folha fica para quando o
usuário pedir). Sem mudança de banco.
