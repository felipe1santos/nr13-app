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

// Fortalece a checagem além da presença literal do nome do evento (fix round 1 da revisão):
// extrai o `return` que o `case '<evento>':` realmente executa dentro do switch de
// aplicarEvento e confere que ele menciona o(s) status esperado(s). Como cases sem `break`
// caem no próximo (`case 'compra_aprovada': case 'subscription_renewed': return ...`), o
// primeiro `return` encontrado A PARTIR do case label é sempre o efetivamente executado por
// aquele evento — não precisamos saber de antemão como os cases estão agrupados. Sem isso,
// um bug como `subscription_late` devolvendo 'ativa' passaria batido (a string 'subscription_late'
// continua presente no arquivo, só o mapeamento é que estaria errado).
function extrairRetornoDoCase(evento: string): string {
  const rotulo = `case '${evento}':`;
  const idxCase = TEXTO_INDEX.indexOf(rotulo);
  if (idxCase === -1) throw new Error(`${rotulo} não encontrado em index.ts`);
  const idxReturn = TEXTO_INDEX.indexOf('return', idxCase);
  if (idxReturn === -1) throw new Error(`nenhum "return" encontrado após ${rotulo}`);
  const idxFimReturn = TEXTO_INDEX.indexOf(';', idxReturn);
  if (idxFimReturn === -1) throw new Error(`"return" após ${rotulo} não termina em ";"`);
  return TEXTO_INDEX.slice(idxReturn, idxFimReturn + 1);
}

// Status que cada evento precisa produzir (comparado com o texto do return, ver acima).
// subscription_canceled é condicional (ternário) e pode resultar nos dois status, então exige
// os dois literais no mesmo return.
const MAPEAMENTO_ESPERADO: Record<EventoKiwify, string[]> = {
  compra_aprovada: ["status: 'ativa'"],
  subscription_renewed: ["status: 'ativa'"],
  subscription_late: ["status: 'graca'"],
  subscription_canceled: ["status: 'cancelada_no_prazo'", "status: 'somente_leitura'"],
  compra_reembolsada: ["status: 'somente_leitura'"],
  chargeback: ["status: 'somente_leitura'"],
};

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

  // ── Achado C4: a transição precisa partir do estado da linha que será GRAVADA (a da org),
  // nunca da linha casada pelo e-mail do pagador. Quando quem paga não é o mestre, o estado
  // lido era {trial, ate:null} e um subscription_canceled gravava no mestre
  // {cancelada_no_prazo, ate:null} = sem vencimento = acesso permanente e grátis.
  // Só dá para checar por texto: a Edge Function roda em Deno e não é importável aqui.
  it('não lê mais o estado da assinatura na busca por sck/e-mail', () => {
    expect(TEXTO_INDEX).not.toContain("select('id, org_id, assinatura_status, assinatura_ate')");
  });

  it('relê assinatura_status/ate pelo profileId da ORG antes de aplicar a transição', () => {
    const idxLeitura = TEXTO_INDEX.indexOf(".select('assinatura_status, assinatura_ate')");
    expect(idxLeitura).toBeGreaterThan(-1);
    expect(TEXTO_INDEX.slice(idxLeitura, idxLeitura + 200)).toContain(".eq('id', profileId)");
    expect(idxLeitura).toBeLessThan(TEXTO_INDEX.indexOf('aplicarEvento(atual,'));
  });

  it('não processa quando o estado atual da org é ilegível (fail-closed)', () => {
    expect(TEXTO_INDEX).toContain('&& atualLido');
  });

  it.each(Object.entries(MAPEAMENTO_ESPERADO) as [EventoKiwify, string[]][])(
    'evento %s aponta para o status esperado no switch da Edge Function',
    (evento, statusEsperados) => {
      const retorno = extrairRetornoDoCase(evento);
      for (const trecho of statusEsperados) {
        expect(retorno).toContain(trecho);
      }
    },
  );
});
