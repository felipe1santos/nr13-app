// A regra de transição existe duplicada (front + Edge Function, porque Deno não importa de
// src/ — ver comentário no topo de supabase/functions/kiwify_webhook/index.ts). Este teste lê o
// texto da função de disco e compara com o módulo puro, para que a divergência NUNCA passe
// silenciosa (ex.: alguém troca 30 por 45 só no index.ts durante um ajuste manual no dashboard).
//
// Referência isolada (só este arquivo, não o app inteiro) porque tsconfig.app.json restringe
// "types" a ["vite/client"] — sem isto o tsc do build (npm run build) não reconhece os módulos
// node:fs/node:url/node:path usados abaixo, mesmo com @types/node já instalado.
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DIAS_CICLO, DIAS_GRACA, type EventoKiwify } from '../maquinaEstados';

const CAMINHO_INDEX = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/functions/kiwify_webhook/index.ts',
);

const TEXTO_INDEX = readFileSync(CAMINHO_INDEX, 'utf-8');

const EVENTOS: EventoKiwify[] = [
  'compra_aprovada',
  'subscription_renewed',
  'subscription_late',
  'subscription_canceled',
  'compra_reembolsada',
  'chargeback',
];

function extrairConstanteNumerica(nome: string): number {
  const m = TEXTO_INDEX.match(new RegExp(`const\\s+${nome}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`Constante ${nome} não encontrada em index.ts`);
  return Number(m[1]);
}

describe('consistência maquinaEstados.ts <-> kiwify_webhook/index.ts', () => {
  it('DIAS_CICLO da Edge Function bate com o módulo puro', () => {
    expect(extrairConstanteNumerica('DIAS_CICLO')).toBe(DIAS_CICLO);
  });

  it('DIAS_GRACA da Edge Function bate com o módulo puro', () => {
    expect(extrairConstanteNumerica('DIAS_GRACA')).toBe(DIAS_GRACA);
  });

  it.each(EVENTOS)('evento %s é tratado no texto da Edge Function', (evento) => {
    expect(TEXTO_INDEX.includes(`'${evento}'`)).toBe(true);
  });
});
