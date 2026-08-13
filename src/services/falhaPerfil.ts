/**
 * "O servidor recusou" x "o servidor não respondeu" — a distinção que decide se
 * o usuário é deslogado ou continua trabalhando.
 *
 * O BUG QUE ISTO CONSERTA: `carregarPerfil()` lia o perfil e, quando a leitura
 * FALHAVA, `data` ficava `null` e `(data?.ativo) ?? false` produzia `ativo:
 * false` — o mesmo valor que significa "conta ainda não liberada pelo
 * administrador". `verificarAcesso()` então chamava `logout()`. Ou seja: uma
 * instabilidade do banco expulsava o usuário da própria conta.
 *
 * Não é hipótese. Se o Supabase aplicar a restrição de cota, TODA requisição ao
 * projeto responde 402 e todo mundo é deslogado — sem necessidade nenhuma, já
 * que com o armazenamento v2 os dados estão no IndexedDB do aparelho e o
 * trabalho de campo continuaria, subindo quando o serviço voltasse.
 *
 * A REGRA, e o lado para o qual cada dúvida cai:
 *
 *   - 401/403, JWT inválido, permissão negada → AUTORIZAÇÃO. Desloga. É
 *     revogação de verdade e afrouxar aqui seria abrir brecha de acesso.
 *   - 402/408/429/5xx e falha de transporte → INDISPONIBILIDADE. Mantém a
 *     sessão. O servidor não disse nada sobre esta conta.
 *   - Qualquer outra falha (400 por coluna inexistente, por exemplo) → NENHUMA,
 *     e o chamador segue o caminho que já seguia. Classificar como
 *     indisponibilidade o que não se reconhece seria transformar erro de
 *     esquema em sessão eterna.
 */
export type FalhaPerfil = 'nenhuma' | 'indisponivel' | 'autorizacao';

/** Códigos do PostgREST/Postgres que significam credencial ou permissão, não instabilidade. */
const CODIGOS_AUTORIZACAO = new Set([
  'PGRST301', // JWT expirado ou inválido
  'PGRST302', // credencial ausente
  '42501', // insufficient_privilege (RLS recusou)
]);

/**
 * @param status HTTP devolvido pelo supabase-js (`{ status }` da resposta). `0`
 *   é o que sobra quando a requisição não chegou a ter resposta.
 * @param codigo `error.code` do PostgREST, quando houver.
 */
export function classificarFalhaPerfil(status: number, codigo?: string | null): FalhaPerfil {
  if (status === 401 || status === 403) return 'autorizacao';
  if (codigo && CODIGOS_AUTORIZACAO.has(codigo)) return 'autorizacao';
  if (status === 0 || status === 402 || status === 408 || status === 429 || status >= 500) {
    return 'indisponivel';
  }
  return 'nenhuma';
}

/**
 * Falha de transporte (rede caída, DNS, CORS, timeout do navegador) chega como
 * exceção ou como erro sem status. Vale como indisponibilidade pelo mesmo
 * motivo: o servidor não disse nada sobre esta conta.
 */
export function ehFalhaDeTransporte(erro: unknown): boolean {
  const msg = String((erro as { message?: string } | null)?.message ?? erro ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('err_internet_disconnected')
  );
}
