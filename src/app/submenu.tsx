/**
 * Submenu contextual do shell v5 (25/10/2026, docs/design/proposta-v5.html).
 *
 * A coluna ao lado do trilho de ícones mostra duas coisas:
 *   · as subpáginas do módulo, quando o módulo é um GRUPO (Documentos,
 *     Instrumentos, Cadastros) — isso o próprio Layout desenha;
 *   · o que a TELA aberta quiser pôr ali (filtros, atalhos), por portal.
 *
 * Com nenhuma das duas, a coluna some e a tela ganha a largura. É o `registrar`
 * que conta quantas telas estão usando o espaço: o portal sozinho não diz ao
 * Layout que existe conteúdo, e uma coluna vazia de 232px seria pior do que
 * nenhuma.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ContextoSubmenu {
  /** O nó onde o conteúdo da tela é desenhado. `null` antes do Layout montar. */
  alvo: HTMLElement | null;
  /** Avisa o Layout que há conteúdo; devolve a função que desfaz o aviso. */
  registrar: () => () => void;
}

export const SubmenuContexto = createContext<ContextoSubmenu>({
  alvo: null,
  registrar: () => () => undefined,
});

/** Conteúdo que a tela põe no submenu. Fora do Layout (testes, Portal), não desenha nada. */
export function ConteudoSubmenu({ children }: { children: ReactNode }) {
  const { alvo, registrar } = useContext(SubmenuContexto);
  useEffect(() => registrar(), [registrar]);
  return alvo ? createPortal(children, alvo) : null;
}
