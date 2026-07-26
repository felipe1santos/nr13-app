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
const SQL_ASSINATURA = readFileSync(path.join(RAIZ, 'supabase/assinatura_setup.sql'), 'utf-8');
const TRIAL_INDEX = readFileSync(path.join(RAIZ, 'supabase/functions/trial/index.ts'), 'utf-8');

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
