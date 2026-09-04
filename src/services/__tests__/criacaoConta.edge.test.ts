import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * As garantias da criação de conta pela Edge `admin`, verificadas no CÓDIGO que
 * roda em produção.
 *
 * A Edge roda em Deno e não pode ser importada daqui, então o teste lê o
 * arquivo — o mesmo recurso de `perfilOrigem.paridade.test.ts`. É estrutura, não
 * prosa: cada asserção aponta uma linha que EXECUTA.
 *
 * ## O que quebrou, e que estes testes impedem de voltar
 *
 * `create_user` criava o usuário no Auth e, em seguida, fazia um `update` em
 * `profiles` cujo erro era DESCARTADO. Duas consequências:
 *
 *   1. se o `update` falhasse, a resposta era `ok: true` com uma conta que não
 *      entra — login criado, perfil não gravado;
 *   2. na retentativa, o Auth recusava com "already been registered", a Edge
 *      devolvia 400 com a mensagem crua e o administrador ficava sem saída.
 */

const EDGE = join(process.cwd(), 'supabase', 'functions', 'admin', 'index.ts');

/** Só o que executa — comentário explicando o contrário passaria despercebido. */
function corpo(): string {
  return readFileSync(EDGE, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');
}

/** O bloco da ação `create_user`, até a ação seguinte. */
function blocoCreateUser(): string {
  const fonte = corpo();
  const i = fonte.indexOf("action === 'create_user'");
  expect(i, 'ação create_user sumiu da Edge').toBeGreaterThan(-1);
  const j = fonte.indexOf("action === 'reset_password'", i);
  return fonte.slice(i, j > i ? j : undefined);
}

describe('estado parcial: a retentativa tem que ter saída', () => {
  it('reconhece "already registered" em vez de devolver o erro cru', () => {
    expect(blocoCreateUser()).toMatch(/already \(been \)\?registered\|already exists/);
  });

  it('procura o usuário existente para retomá-lo', () => {
    const b = blocoCreateUser();
    expect(b).toContain('listUsers');
    expect(b).toContain('updateUserById');
  });

  it('NÃO retoma conta que já tem dados — isso seria sequestro, não retentativa', () => {
    const b = blocoCreateUser();
    expect(b).toContain('app_storage');
    expect(b).toMatch(/count/);
  });

  it('NÃO retoma sub-login nem acesso de cliente de outra organização', () => {
    const b = blocoCreateUser();
    expect(b).toMatch(/org_id\s*!==\s*existente\.id|papel\s*!==\s*'mestre'/);
  });

  it('NÃO retoma conta de administrador da plataforma', () => {
    expect(blocoCreateUser()).toMatch(/role\s*===\s*'admin'/);
  });
});

describe('o perfil precisa ser gravado — e o erro, lido', () => {
  it('usa upsert: `update` não acerta linha nenhuma se o trigger não criou o perfil', () => {
    const b = blocoCreateUser();
    expect(b).toContain('upsert');
    expect(b).toContain("onConflict: 'id'");
  });

  it('o erro do perfil é VERIFICADO, não descartado', () => {
    expect(blocoCreateUser()).toMatch(/perfilErr/);
  });

  it('vincula a conta à própria organização e ao papel mestre', () => {
    const b = blocoCreateUser();
    expect(b).toContain('org_id: userId');
    expect(b).toContain("papel: 'mestre'");
  });

  it('declara o papel na ORIGEM, como a Edge org_admin (perfilOrigem.ts)', () => {
    expect(blocoCreateUser()).toContain('nr13_papel');
  });
});

describe('as mensagens dizem o que aconteceu', () => {
  it('falha ao gravar o perfil avisa que o login existe e como retomar', () => {
    const b = blocoCreateUser();
    expect(b).toMatch(/login foi criado/i);
    expect(b).toMatch(/MESMO e-mail/);
    expect(b).toContain('parcial: true');
  });

  it('conta em uso aponta as ações certas em vez de só recusar', () => {
    const b = blocoCreateUser();
    expect(b).toMatch(/EM USO/);
    expect(b).toMatch(/Liberar acesso/i);
    expect(b).toMatch(/Resetar senha/i);
  });

  it('nenhuma mensagem devolvida ao usuário fica em inglês técnico', () => {
    const b = blocoCreateUser();
    const mensagens = [...b.matchAll(/erro:\s*'([^']{12,})'/g)].map((m) => m[1]);
    expect(mensagens.length).toBeGreaterThan(2);
    for (const m of mensagens) {
      expect(m, `mensagem sem acento/artigo em português: "${m}"`).toMatch(/[áâãàéêíóôõúçÁÂÃÉÊÍÓÔÕÚÇ]|\b(a|o|de|não|já|use)\b/i);
    }
  });
});

describe('o que NÃO pode ser afrouxado para consertar isto', () => {
  it('a Edge continua exigindo que o chamador seja admin', () => {
    expect(corpo()).toMatch(/role\s*!==\s*'admin'/);
    expect(corpo()).toContain('Acesso negado');
  });

  it('a service_role continua só na Edge — nada de chave no bundle', () => {
    expect(corpo()).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    const front = readFileSync(join(process.cwd(), 'src', 'pages', 'Admin.tsx'), 'utf8');
    expect(front).not.toMatch(/SERVICE_ROLE|service_role/);
  });
});

describe('a tela do superadmin mostra o motivo real', () => {
  const ADMIN_TSX = join(process.cwd(), 'src', 'pages', 'Admin.tsx');

  it('nenhuma chamada de Edge joga o erro cru na tela', () => {
    const fonte = readFileSync(ADMIN_TSX, 'utf8');
    // Um `if (error) throw error` logo depois de invoke() é o padrão que
    // engolia a explicação e mostrava "non-2xx status code".
    const trechos = fonte.split("functions.invoke('admin'");
    for (const t of trechos.slice(1)) {
      const janela = t.slice(0, 400);
      if (!janela.includes('error')) continue;
      expect(janela, 'invoke ainda usa o padrão que esconde o motivo').not.toContain('if (error) throw error;');
    }
  });

  it('usa o extrator compartilhado', () => {
    expect(readFileSync(ADMIN_TSX, 'utf8')).toContain('mensagemDeErroEdge');
  });

  it('o cliente da org_admin usa o MESMO extrator — regra única', () => {
    const org = readFileSync(join(process.cwd(), 'src', 'services', 'orgAdmin.ts'), 'utf8');
    expect(org).toContain('mensagemDeErroEdge');
  });
});
