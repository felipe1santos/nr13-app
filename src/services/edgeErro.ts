/**
 * A mensagem REAL de uma Edge Function — e por que ela precisa ser extraída.
 *
 * ## O defeito
 *
 * `supabase.functions.invoke()` devolve `{ data, error }`. Quando a função
 * responde com status não-2xx — que é o que TODA recusa de negócio faz aqui
 * (`json({ erro: '...' }, 400)`) — o cliente monta um `FunctionsHttpError` cuja
 * `.message` é sempre a mesma frase genérica:
 *
 *     "Edge Function returned a non-2xx status code"
 *
 * e deixa `data` como `null`. Ou seja: a função escreve com cuidado
 * "Este e-mail já pertence a outra conta. Use outro e-mail." e quem chama
 * `if (error) throw error` mostra ao administrador a frase genérica. O
 * `if (data?.erro)` logo abaixo nunca é alcançado, porque `data` é nulo
 * justamente nos casos em que havia uma explicação.
 *
 * O corpo da resposta continua disponível em `error.context`, que é a `Response`
 * original. É de lá que a explicação é recuperada.
 *
 * ## Por que existe este arquivo
 *
 * Esta extração já existia — dentro de `orgAdmin.ts`, resolvendo só os
 * sub-logins. A tela do superadmin (`Admin.tsx`), que chama a Edge `admin` em
 * cinco lugares, nunca recebeu o mesmo tratamento: criar uma conta com e-mail já
 * cadastrado devolvia "Edge Function returned a non-2xx status code" e o
 * administrador ficava sem saber o que fazer.
 *
 * Uma regra que vale para toda Edge não pode morar dentro do cliente de UMA
 * delas. Agora mora aqui, e os dois caminhos usam a mesma.
 */

/** Mensagem de último recurso, quando nem o corpo nem o erro dizem algo útil. */
const GENERICA = 'Não foi possível concluir a operação. Tente novamente.';

/**
 * Frases do próprio Supabase que não significam nada para quem lê a tela.
 * Quando o erro é uma delas E o corpo não trouxe explicação, é melhor a
 * genérica em português do que a técnica em inglês.
 */
function ehRuido(mensagem: string): boolean {
  return (
    mensagem === '' ||
    /non-2xx status code/i.test(mensagem) ||
    /^failed to fetch$/i.test(mensagem) ||
    /^\[object Object\]$/i.test(mensagem)
  );
}

/**
 * Traduz o resultado de `functions.invoke` em uma mensagem para o usuário.
 *
 * Devolve `null` quando não houve erro — assim o chamador escreve
 * `const falha = await mensagemDeErroEdge(error, data); if (falha) ...`.
 *
 * Ordem de preferência, da mais específica para a menos:
 *   1. `data.erro` — a função respondeu 2xx mas sinalizou recusa no corpo;
 *   2. `error.context` — o corpo do não-2xx, onde mora o `{ erro }` real;
 *   3. `error.message` — se não for uma das frases de ruído;
 *   4. a genérica em português.
 */
export async function mensagemDeErroEdge(
  error: unknown,
  data?: unknown,
  rotulo = 'operação',
): Promise<string | null> {
  const doCorpo = (data as { erro?: unknown } | null | undefined)?.erro;
  if (!error && doCorpo) return String(doCorpo);
  if (!error) return null;

  // O corpo do não-2xx: é ele que carrega a explicação escrita pela função.
  const contexto = (error as { context?: unknown }).context;
  if (contexto && typeof (contexto as Response).clone === 'function') {
    try {
      const corpo = await (contexto as Response).clone().json();
      if (corpo?.erro) return String(corpo.erro);
      // `message` é do GATEWAY, não da nossa função: chave inválida, função não
      // publicada, falha ao subir o worker. Medido em produção — uma chamada
      // recusada antes de chegar na função devolve
      // `{"message":"Invalid API key"}`, e sem este ramo ela virava a frase
      // genérica, escondendo justamente o problema de configuração que o
      // administrador precisa ver para resolver.
      const doGateway = corpo?.message ?? corpo?.error_description ?? corpo?.error;
      if (doGateway) return String(doGateway);
    } catch {
      // Corpo ausente, vazio ou não-JSON: cai nos próximos passos. Falhar ao ler
      // a explicação não pode virar um erro DIFERENTE do que aconteceu.
    }
  }

  const mensagem = error instanceof Error ? error.message : String(error ?? '');
  if (!ehRuido(mensagem)) return mensagem;
  return `Não foi possível concluir a ${rotulo}. Tente novamente em instantes.`;
}

export const MENSAGEM_GENERICA_EDGE = GENERICA;
