import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metadataPerfil, PAPEIS_VALIDOS } from '../perfilOrigem';

/**
 * Paridade entre o formato da metadata em TRÊS lugares que não podem divergir:
 *
 *   1. `src/services/perfilOrigem.ts`            — os dois signUp do frontend
 *   2. `supabase/functions/org_admin/index.ts`   — createUser dos sub-logins
 *   3. `supabase/perfil_origem.sql`              — o trigger que LÊ a metadata
 *
 * A Edge roda em Deno e o trigger em plpgsql; nenhum dos dois importa de
 * `src/`, então o formato é necessariamente replicado. Duplicação de tabela é a
 * fonte de dessincronização que a D-07 do plano combate na Fase 4 — e aqui o
 * custo de errar é maior: uma chave renomeada em um lado e não no outro faz o
 * trigger não encontrar o papel, cair no default `'mestre'`, e o sub-login
 * voltar a nascer mestre. Silenciosamente, que é o pior modo.
 *
 * Este teste quebra no minuto em que os três divergirem.
 */

const RAIZ = process.cwd();
const EDGE = join(RAIZ, 'supabase', 'functions', 'org_admin', 'index.ts');
const SQL = join(RAIZ, 'supabase', 'perfil_origem.sql');

/**
 * SQL sem as linhas de comentário.
 *
 * Existe porque a primeira versão deste teste procurava palavras no arquivo
 * inteiro e acusava o ROLLBACK de ler a metadata — quando o que ele fazia era
 * explicar, em comentário, que deixa de lê-la. Asserção sobre prosa é asserção
 * frágil: o que precisa ser verificado é o que o SQL EXECUTA.
 */
function corpoSql(caminho: string): string {
  return readFileSync(caminho, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/** As chaves que a função pura produz — a fonte da verdade do formato. */
const CHAVES = Object.keys(
  metadataPerfil('cliente', { orgId: 'org-1', clienteId: 'cli-1' }),
).sort();

describe('paridade da metadata de origem do perfil', () => {
  it('a fonte da verdade tem exatamente as três chaves esperadas', () => {
    expect(CHAVES).toEqual(['nr13_cliente_id', 'nr13_org_id', 'nr13_papel']);
  });

  it('a Edge org_admin usa as MESMAS chaves', () => {
    const fonte = readFileSync(EDGE, 'utf8');
    for (const chave of CHAVES) {
      expect(fonte, `a Edge org_admin não menciona "${chave}"`).toContain(chave);
    }
  });

  it('a Edge passa a metadata no createUser, não só em comentário', () => {
    const fonte = readFileSync(EDGE, 'utf8');
    // `user_metadata` precisa estar no objeto do createUser. Sem isso o papel
    // nunca chega ao trigger e a correção inteira vira decoração.
    expect(fonte).toContain('user_metadata');
    const trecho = fonte.slice(fonte.indexOf('createUser'), fonte.indexOf('createUser') + 1200);
    expect(trecho, 'user_metadata fora do bloco do createUser').toContain('nr13_papel');
  });

  it('o SQL do trigger LÊ as mesmas chaves', () => {
    const sql = corpoSql(SQL);
    for (const chave of CHAVES) {
      expect(sql, `o trigger não lê "${chave}"`).toContain(chave);
    }
  });

  it('o SQL valida os mesmos quatro papéis, na mesma caixa', () => {
    const sql = corpoSql(SQL);
    for (const papel of PAPEIS_VALIDOS) {
      expect(sql, `o trigger não reconhece o papel "${papel}"`).toContain(`'${papel}'`);
    }
  });

  it('papel desconhecido cai em sem_papel no trigger, nunca em mestre', () => {
    const sql = corpoSql(SQL);
    // Fail closed: a lista branca das policies (D-04) recusa 'sem_papel'.
    // Se alguém trocar por 'mestre', o defeito que este arquivo conserta volta.
    expect(sql).toContain("v_papel := 'sem_papel'");
  });

  it('o cast de uuid do trigger é guardado, para não derrubar o signup', () => {
    const sql = corpoSql(SQL);
    // O trigger roda `after insert on auth.users`: se lançar, o cadastro
    // inteiro falha. A conversão só acontece depois de o formato ser conferido.
    expect(sql).toMatch(/\[0-9a-f\]\{8\}-/);
    expect(sql).toContain('::uuid');
  });

  it('o rollback existe e restaura o insert SEM papel', () => {
    const rollback = corpoSql(join(RAIZ, 'supabase', 'perfil_origem_rollback.sql'));
    expect(rollback).toContain('insert into public.profiles (id, email, ativo, role)');
    // A asserção olha o MECANISMO, não a palavra: o rollback cita `nr13_papel`
    // em comentário de propósito (explicando o que deixa de existir), e uma
    // busca pela palavra crua daria falso positivo. O que não pode sobrar é a
    // LEITURA da metadata.
    expect(rollback).not.toContain('raw_user_meta_data');
    expect(rollback).not.toContain('v_meta');
  });
});
