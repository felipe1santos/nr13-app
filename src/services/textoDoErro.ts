/**
 * Fase 13C · a mensagem de um erro, para pessoas.
 *
 * ## O `[object Object]`
 *
 * `String(e)` num objeto devolve `"[object Object]"`, e foi assim que o usuário
 * viu falha de gravação mais de uma vez. A fila de sincronização não rejeita com
 * `Error`: ela carrega um objeto próprio — `{ categoria, titulo, explicacao,
 * acao, detalhe }` —, e é justamente ele que vira `[object Object]` quando
 * alguém o joga numa interpolação de string.
 *
 * Esta função não inventa texto: ela procura, na ordem, o campo que já FOI
 * escrito para ser lido por gente. Só quando não acha nenhum é que devolve uma
 * frase genérica — e aí a frase genérica é a resposta honesta, porque não havia
 * mensagem.
 *
 * Não substitui tratamento de erro: a semântica do conflito continua onde
 * sempre esteve (`errosSync`, a tela de conflitos). Isto é só a camada de texto.
 */
export function textoDoErro(e: unknown, padrao = 'Não foi possível concluir a operação.'): string {
  if (e === null || e === undefined) return padrao;
  if (typeof e === 'string') return e.trim() === '' ? padrao : e;
  if (e instanceof Error) return e.message.trim() === '' ? padrao : e.message;

  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    // `titulo` + `explicacao` é a forma dos erros da fila — a mais informativa,
    // e a que aparecia como "[object Object]".
    const titulo = typeof o.titulo === 'string' ? o.titulo.trim() : '';
    const explicacao = typeof o.explicacao === 'string' ? o.explicacao.trim() : '';
    if (titulo && explicacao) return `${titulo} — ${explicacao}`;
    if (titulo) return titulo;
    if (explicacao) return explicacao;

    for (const campo of ['mensagem', 'message', 'erro', 'error', 'detalhe']) {
      const v = o[campo];
      if (typeof v === 'string' && v.trim() !== '') return v;
      // `detalhe` costuma ser objeto com `mensagemOriginal` dentro.
      if (v && typeof v === 'object') {
        const interno = (v as Record<string, unknown>).mensagemOriginal;
        if (typeof interno === 'string' && interno.trim() !== '') return interno;
      }
    }
  }

  return padrao;
}
