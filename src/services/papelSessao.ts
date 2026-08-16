/**
 * O papel desta sessão, lido do `localStorage`.
 *
 * ── POR QUE EXISTE, EM VEZ DE USAR `auth.isCliente()` ───────────────────────
 *
 * `fotos.ts` precisa saber se quem está pedindo um arquivo é um cliente do
 * Portal, para rotear o pedido pela Edge em vez do SDK. Mas `fotos.ts` é
 * importado por `palco.ts`, que é importado por praticamente toda tela que
 * monta documento. Fazer `fotos` depender de `auth` — que importa `storage`,
 * que importa `storageV1`/`storageV2` — alargaria muito esse grafo e arrisca
 * ciclo de import num caminho crítico.
 *
 * O papel já vive em `localStorage.nr13_papel`, gravado por `carregarPerfil()`
 * no login. Ler dali custa três linhas e zero acoplamento.
 *
 * ── ISTO NÃO É A CHECAGEM DE SEGURANÇA ──────────────────────────────────────
 *
 * É ROTEAMENTO: decide por qual caminho o pedido sai. Quem IMPEDE o acesso é a
 * policy do Postgres e do bucket (fail closed, D-04) e a validação de vínculo da
 * Edge `portal_arquivo` (D-05) — as duas no servidor.
 *
 * Um cliente que forje `nr13_papel` no localStorage não ganha nada: passa a
 * tentar o caminho direto do SDK, e é exatamente esse caminho que a policy
 * recusa. Forjar para o outro lado (fingir-se de cliente) também não ajuda: a
 * Edge relê o papel do banco, nunca do que o cliente afirma.
 */

/** Chave gravada por `carregarPerfil()` (auth.ts) no login e em todo boot. */
const CHAVE_PAPEL = 'nr13_papel';

/**
 * Nunca lança. Janela anônima e "armazenamento de sites bloqueado" fazem
 * `getItem` atirar, e uma exceção aqui derrubaria a resolução de QUALQUER foto
 * — inclusive as do sistema interno, que nada têm a ver com o Portal.
 */
export function papelDaSessao(): string {
  try {
    return localStorage.getItem(CHAVE_PAPEL) ?? '';
  } catch {
    return '';
  }
}

/**
 * Comparação SENSÍVEL A CAIXA, espelhando a lista branca das policies (D-04).
 * Falha para o lado interno: papel ilegível vira "não é cliente", e o pedido
 * segue pelo caminho direto — que a policy recusa se de fato for um cliente.
 * O contrário (assumir cliente por engano) mandaria tráfego interno para uma
 * Edge que vai recusá-lo, quebrando o sistema para quem tem direito.
 */
export function ehCliente(): boolean {
  return papelDaSessao() === 'cliente';
}
