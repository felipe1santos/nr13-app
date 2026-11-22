/**
 * A linha INTEIRA de uma lista como atalho da ação principal (22/11/2026):
 * em Relatórios e Prontuários, clicar no documento abre a edição (rascunho)
 * ou a visualização (salvo/emitido) — o mesmo que o botão da linha já fazia.
 *
 * Clique em controle de DENTRO da linha (lápis, baixar, histórico, renomear…)
 * continua sendo daquele controle: a linha ignora. Pelo teclado, a linha
 * recebe foco e abre com Enter.
 */
const CONTROLES = 'button, a, input, select, textarea, label, [role="button"], [role="menuitem"]';

export function linhaClicavel(acao: (() => void) | undefined, rotulo?: string) {
  if (!acao) return {};
  return {
    tabIndex: 0,
    title: rotulo,
    'data-clicavel': true,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest(CONTROLES) && alvo.closest(CONTROLES) !== e.currentTarget) return;
      acao();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
      e.preventDefault();
      acao();
    },
  };
}
