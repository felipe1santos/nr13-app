// Guardas de TEXTO para o enforcement que vive fora do bundle (SQL + Edge Function `trial`).
// Nada disto roda em vitest (Postgres/Deno), mas os arquivos são a fonte do que o dono do
// projeto vai colar no SQL Editor e deployar — e foram justamente onde a revisão final achou
// buracos que liberavam escrita de graça. Um teste de texto trava a regressão silenciosa.
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// Normaliza CRLF: o repo é editado no Windows e as asserções de texto com quebra de linha
// passariam "de graça" comparando contra \n que nunca existe no arquivo lido.
function ler(relativo: string): string {
  return readFileSync(path.join(RAIZ, relativo), 'utf-8').replace(/\r\n/g, '\n');
}

const SQL_ASSINATURA = ler('supabase/assinatura_setup.sql');
const SQL_TRIAL = ler('supabase/trial_setup.sql');
const TRIAL_INDEX = ler('supabase/functions/trial/index.ts');
const WEBHOOK_INDEX = ler('supabase/functions/kiwify_webhook/index.ts');

/** Corpo da policy `nome` em assinatura_setup.sql (do `create policy` até o `;` final). */
function corpoDaPolicy(nome: string): string {
  const inicio = SQL_ASSINATURA.indexOf(`create policy ${nome} on public.app_storage`);
  if (inicio === -1) throw new Error(`policy ${nome} não encontrada em assinatura_setup.sql`);
  const fim = SQL_ASSINATURA.indexOf(');', inicio);
  if (fim === -1) throw new Error(`policy ${nome} não termina em ");"`);
  return SQL_ASSINATURA.slice(inicio, fim);
}

const POLICIES = ['app_storage_insert_org', 'app_storage_update_org', 'app_storage_delete_org'];

describe('C5 — RLS de escrita mantém as DUAS defesas', () => {
  it.each(POLICIES)('%s exige assinatura_permite_escrita()', (nome) => {
    expect(corpoDaPolicy(nome)).toContain('public.assinatura_permite_escrita()');
  });

  it.each(POLICIES)('%s continua exigindo acesso_vigente() (prazo do trial)', (nome) => {
    // Sem isto, a migração DESLIGA o prazo dos trials criados depois dela: eles nascem
    // 'trial' + assinatura_ate NULL, e NULL = sem vencimento = escrita liberada para sempre.
    expect(corpoDaPolicy(nome)).toContain('public.acesso_vigente()');
  });
});

describe('C5 — Edge Function `trial` grava o estado da assinatura', () => {
  it('define assinatura_status = trial ao ativar', () => {
    expect(TRIAL_INDEX).toContain("assinatura_status: 'trial'");
  });

  it('define assinatura_ate com o mesmo fim das colunas legadas (nunca NULL)', () => {
    expect(TRIAL_INDEX).toContain('assinatura_ate: fim.toISOString()');
    expect(TRIAL_INDEX).toContain('acesso_expira_em: fim.toISOString()');
  });
});

describe('I3 — segredo placeholder do webhook', () => {
  it('a Edge Function recusa o valor que o SQL insere', () => {
    // O placeholder está PUBLICADO neste repositório: se o passo de deploy for esquecido,
    // aceitá-lo é o mesmo que não ter segredo (30 dias grátis para qualquer um, ou um
    // chargeback forjado derrubando um pagante).
    expect(WEBHOOK_INDEX).toContain("const SEGREDO_PLACEHOLDER = 'TROQUE-ESTE-VALOR'");
    expect(WEBHOOK_INDEX).toContain('segredo === SEGREDO_PLACEHOLDER');
    const idxGuarda = WEBHOOK_INDEX.indexOf('segredo === SEGREDO_PLACEHOLDER');
    // A recusa precisa vir ANTES de qualquer leitura do corpo/gravação do evento.
    expect(idxGuarda).toBeLessThan(WEBHOOK_INDEX.indexOf('await req.json()'));
  });

  it('o valor recusado é exatamente o que o SQL insere (não podem divergir)', () => {
    expect(SQL_ASSINATURA).toContain('"segredo": "TROQUE-ESTE-VALOR"');
  });

  it('usuário logado comum não consegue LER o segredo (RLS de config_global)', () => {
    // Sem isto, um trial lia o segredo pelo próprio app e chamava o webhook à vontade.
    for (const sql of [SQL_ASSINATURA, SQL_TRIAL]) {
      expect(sql).toContain("using (chave <> 'kiwify_webhook_segredo')");
      expect(sql).not.toContain('create policy config_global_select on public.config_global\n  for select to authenticated using (true)');
    }
  });
});

describe('C3 — função SQL que o front usa para espelhar a assinatura da org', () => {
  it('assinatura_org() existe, é security definer e resolve pela org', () => {
    const idx = SQL_ASSINATURA.indexOf('create or replace function public.assinatura_org()');
    expect(idx).toBeGreaterThan(-1);
    const corpo = SQL_ASSINATURA.slice(idx, SQL_ASSINATURA.indexOf('$$;', idx));
    expect(corpo).toContain('security definer');
    expect(corpo).toContain('public.assinatura_status_org()');
    expect(corpo).toContain('public.org_atual()');
  });
});
