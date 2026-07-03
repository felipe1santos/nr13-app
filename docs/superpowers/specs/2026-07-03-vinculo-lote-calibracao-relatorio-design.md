# Vínculo Lote de Calibração ↔ Relatório — Design

Data: 03/07/2026 · Status: aprovado pelo usuário

## Objetivo

A validade da válvula/manômetro deixa de ser digitada manualmente no relatório e passa a ser
derivada dos certificados de calibração. O usuário vincula um **lote inteiro** de calibração a um
relatório (existente ou "o próximo que for gerado"), e o Histórico de Inspeções mostra a validade
da válvula e do manômetro derivadas do lote. O dashboard já monitora `dataProxCalibracao` via
`src/services/vencimentos.ts` — não muda.

## Modelo de dados

`LoteCal` (`src/features/calibracoes/componentesService.ts`) ganha campos opcionais:

- `relatorioId?: string` — id (`meta.codigo`) do relatório vinculado.
- `vincularProximoRelatorio?: boolean` — fila: o próximo relatório salvo deste equipamento
  captura o lote e o vínculo vira `relatorioId`.

`RelatorioMeta.validadeValvula` permanece no tipo apenas como legado (fallback de exibição);
o input é removido do modal "Configurações do Relatório".

## Fluxos

1. **Calibrações — vincular lote:** cabeçalho de cada lote mostra badge do vínculo
   ("Relatório REL-123" / "Aguardando próximo relatório" / "Sem vínculo") + botão "Vincular"
   com menu: (a) vincular ao próximo relatório gerado; (b) escolher relatório existente
   (`listarHistorico(tag)`); (c) remover vínculo. Editável a qualquer momento — cobre o técnico
   que calibrou e esqueceu de vincular.
2. **Relatórios — salvar:** `salvarHistorico()` (`src/pages/Relatorios.tsx`) chama
   `vincularLotesPendentes(tag, relatorioId)` após salvar: todo lote com
   `vincularProximoRelatorio=true` recebe `relatorioId` e a flag é limpa.
3. **Histórico de Inspeções:** coluna "Validade Válvula" (derivada; fallback
   `meta.validadeValvula` para relatórios antigos sem lote) + nova coluna "Validade Manômetro".
   Derivação por relatório: lotes com `relatorioId === r.id` → certificados do lote (via
   `loteId`) → **menor** `dataProxCalibracao` por tipo (`psv` → válvula, `manometro` →
   manômetro). Vários lotes vinculados: menor data entre todos.
4. **Modal config:** campo "Valid. Válvula" removido.

## Novas funções (componentesService.ts)

- `salvarLote(tag, lote)` — upsert de lote (edição do vínculo).
- `vincularLotesPendentes(tag, relatorioId)` — captura os lotes em fila.
- `validadesPorRelatorio(tag): Map<string, { valvula?: string; manometro?: string }>` —
  consumida pelo Histórico de Inspeções.

## Erros / bordas

- Lote sem certificados: não contribui com datas (colunas mostram fallback ou "-").
- Certificado sem `dataProxCalibracao`: ignorado na derivação.
- Datas em `dd/mm/aaaa`; comparação via parse local (mesma abordagem de `vencimentos.ts`).
