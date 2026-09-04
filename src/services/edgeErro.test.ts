import { describe, expect, it } from 'vitest';
import { mensagemDeErroEdge } from './edgeErro';

/**
 * O defeito que estes testes trancam: `functions.invoke` devolve
 * `FunctionsHttpError` com a mensagem "Edge Function returned a non-2xx status
 * code" para TODA recusa de negócio, e `data` nulo. Quem fazia
 * `if (error) throw error` mostrava a frase genérica; o `if (data?.erro)` que
 * viria depois nunca era alcançado, justamente nos casos em que a função tinha
 * escrito uma explicação.
 */
function erroHttp(corpo: unknown, mensagem = 'Edge Function returned a non-2xx status code') {
  const e = new Error(mensagem) as Error & { context: Response };
  e.context = new Response(JSON.stringify(corpo), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
  return e;
}

describe('a mensagem que o administrador lê vem do CORPO, não do status', () => {
  it('extrai o { erro } do não-2xx em vez do genérico', async () => {
    const e = erroHttp({ erro: 'Este e-mail já pertence a outra conta. Use outro e-mail.' });
    expect(await mensagemDeErroEdge(e)).toBe('Este e-mail já pertence a outra conta. Use outro e-mail.');
  });

  it('sucesso com recusa no corpo também é erro', async () => {
    expect(await mensagemDeErroEdge(null, { erro: 'papel inválido' })).toBe('papel inválido');
  });

  it('sem erro nenhum devolve null — o chamador segue em frente', async () => {
    expect(await mensagemDeErroEdge(null, { ok: true, id: 'abc' })).toBeNull();
    expect(await mensagemDeErroEdge(undefined)).toBeNull();
  });
});

describe('nenhum erro técnico cru chega à tela', () => {
  it('"non-2xx status code" sem corpo vira frase em português', async () => {
    const e = new Error('Edge Function returned a non-2xx status code');
    const m = await mensagemDeErroEdge(e, null, 'criação da conta');
    expect(m).toBe('Não foi possível concluir a criação da conta. Tente novamente em instantes.');
    expect(m).not.toMatch(/non-2xx/);
  });

  it('"Failed to fetch" e "[object Object]" também são ruído', async () => {
    expect(await mensagemDeErroEdge(new Error('Failed to fetch'), null, 'exclusão')).not.toMatch(/Failed to fetch/);
    expect(await mensagemDeErroEdge(new Error('[object Object]'))).not.toMatch(/object Object/);
  });

  it('mensagem específica do servidor é PRESERVADA — não vira genérica', async () => {
    const e = new Error('Password should be at least 6 characters');
    expect(await mensagemDeErroEdge(e)).toBe('Password should be at least 6 characters');
  });

  it('corpo ilegível não troca o erro por outro — cai no texto do próprio erro', async () => {
    const e = new Error('Boom') as Error & { context: Response };
    e.context = new Response('<html>502</html>', { status: 502 });
    expect(await mensagemDeErroEdge(e)).toBe('Boom');
  });

  it('corpo ilegível E mensagem de ruído: sobra a frase em português', async () => {
    const e = new Error('Edge Function returned a non-2xx status code') as Error & { context: Response };
    e.context = new Response('nao é json', { status: 500 });
    expect(await mensagemDeErroEdge(e, null, 'troca de senha')).toContain('troca de senha');
  });
});

describe('erro do GATEWAY, antes de chegar na função', () => {
  // Medido em produção: uma chamada recusada pelo gateway devolve
  // { message: 'Invalid API key' } — sem `erro`. Cair na frase genérica aqui
  // esconderia justamente o problema de configuração que precisa ser visto.
  it('usa `message` quando não há `erro`', async () => {
    expect(await mensagemDeErroEdge(erroHttp({ message: 'Invalid API key' }))).toBe('Invalid API key');
  });

  it('`erro` da nossa função vence o `message` do gateway', async () => {
    const e = erroHttp({ erro: 'Este e-mail já está em uso.', message: 'Bad Request' });
    expect(await mensagemDeErroEdge(e)).toBe('Este e-mail já está em uso.');
  });
});
