import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metadataPerfil, PAPEIS_VALIDOS } from '../perfilOrigem';

/**
 * Paridade entre o formato da metadata em TRÊS lugares que não podem divergir:
 *
 *   1. `src/services/perfilOrigem.ts`            — a fonte do formato
 *   2. `supabase/functions/org_admin/index.ts`   — createUser dos sub-logins (app_metadata)
 *   3. `supabase/perfil_origem.sql`              — o trigger que LÊ raw_app_meta_data
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

  it('a Edge registra a origem no createUser como app_metadata, não só em comentário', () => {
    const fonte = readFileSync(EDGE, 'utf8');
    // É a origem que a adoção confere numa retentativa (`adocao.ts`). Vai em
    // `app_metadata` porque só o service_role grava esse campo; o
    // `user_metadata` é o `options.data` do signUp público (achado #1 da
    // auditoria de 25/10/2026).
    const trecho = fonte.slice(fonte.indexOf('createUser'), fonte.indexOf('createUser') + 1500);
    expect(trecho, 'app_metadata fora do bloco do createUser').toMatch(/app_metadata:\s*\{[^}]*nr13_papel/);
    expect(trecho, 'papel ainda vai em user_metadata').not.toMatch(/user_metadata:\s*\{[^}]*nr13_papel/);
  });

  it('a adoção da Edge confere a origem em app_metadata', () => {
    // `user_metadata` do usuário existente é escrito por ele mesmo: confiar
    // nele para decidir a adoção reabriria o mesmo furo por outra porta.
    const fonte = readFileSync(EDGE, 'utf8');
    expect(fonte).toContain('metadata: existente.app_metadata');
    expect(fonte).not.toContain('metadata: existente.user_metadata');
  });

  /** Só o corpo de handle_new_user — a conferência no fim do arquivo cita nomes de propósito. */
  function corpoFuncao(): string {
    const sql = corpoSql(SQL);
    const corpo = sql.slice(sql.indexOf('as $$'), sql.indexOf('$$;'));
    expect(corpo.length, 'corpo de handle_new_user não encontrado').toBeGreaterThan(100);
    return corpo;
  }

  it('o trigger NÃO lê metadata nenhuma — nem a do signUp público, nem app_metadata', () => {
    // Achado #1 (25/10/2026): `raw_user_meta_data` é o `options.data` do
    // signUp, escrito por quem se cadastra. E `raw_app_meta_data` não serve no
    // INSERT: o GoTrue (v2.197, medido no laboratório) insere o usuário só com
    // provider/providers e grava o app_metadata num UPDATE depois. Papel e org
    // de sub-login são atribuídos pelo upsert do service_role na Edge.
    const corpo = corpoFuncao();
    expect(corpo, 'o trigger voltou a confiar em raw_user_meta_data').not.toContain('raw_user_meta_data');
    expect(corpo, 'raw_app_meta_data está vazio no INSERT — ler daria falsa garantia').not.toContain('raw_app_meta_data');
    for (const chave of CHAVES) {
      expect(corpo, `o trigger ainda lê "${chave}"`).not.toContain(chave);
    }
  });

  it('todo usuário novo nasce mestre, com org preenchida pelo trg_definir_org_padrao (a própria)', () => {
    const corpo = corpoFuncao();
    expect(corpo).toContain('insert into public.profiles (id, email, ativo, role, papel, org_id, cliente_id)');
    expect(corpo).toMatch(/'mestre',\s*\n?\s*null,\s*\n?\s*null/);
  });

  it('o conflito continua preservando o perfil que a Edge já gravou', () => {
    expect(corpoFuncao()).toContain('on conflict (id) do update set email = excluded.email');
  });

  it('o signUp do frontend não declara papel nem org — o trigger ignoraria, e a falsa garantia confunde', () => {
    const auth = readFileSync(join(RAIZ, 'src', 'services', 'auth.ts'), 'utf8');
    expect(auth).not.toContain('metadataPerfil(');
  });

  it('a Edge org_admin grava papel e org pelo upsert do service_role', () => {
    const fonte = readFileSync(EDGE, 'utf8');
    const i = fonte.indexOf("action === 'criar_subusuario'");
    const bloco = fonte.slice(i, fonte.indexOf("action === 'resetar_senha'", i));
    expect(bloco).toMatch(/org_id:\s*orgId/);
    expect(bloco).toMatch(/\bpapel,/);
    expect(bloco).toContain(".upsert(linha, { onConflict: 'id' })");
    expect(bloco, 'o erro do upsert precisa ser lido').toContain('if (upErr) return json(');
  });

  it('os papéis da Edge são os mesmos da fonte, na mesma caixa', () => {
    const fonte = readFileSync(EDGE, 'utf8');
    for (const papel of PAPEIS_VALIDOS.filter((p) => p !== 'mestre')) {
      expect(fonte, `a Edge não reconhece o papel "${papel}"`).toContain(`'${papel}'`);
    }
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
