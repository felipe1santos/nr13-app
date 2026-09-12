import { useEffect, type RefObject } from 'react';

/**
 * Prende o foco dentro de um diálogo e devolve o Esc a ele.
 *
 * ## Por que isto precisa existir aqui
 *
 * O gerenciador de predefinições abre um SEGUNDO modal por cima do primeiro
 * ("Como funciona"). Sem trava, o Tab passeia pelos botões do modal de baixo —
 * que continuam no DOM, atrás do overlay — e quem navega por teclado (ou por
 * leitor de tela) fica operando uma tela que não está vendo. O Esc, sem
 * `stopPropagation`, fecharia os dois de uma vez.
 *
 * A trava é do modal de CIMA: cada diálogo chama este hook, e o último a montar
 * é o que responde ao Tab e ao Esc, porque o seu ouvinte é o mais interno na
 * captura do elemento.
 */
export function useFocoPreso(ref: RefObject<HTMLElement | null>, onFechar: () => void): void {
  useEffect(() => {
    const caixa = ref.current;
    if (!caixa) return;

    // Quem tinha o foco antes: ao fechar, ele volta para lá — senão o foco cai
    // no <body> e o próximo Tab recomeça do topo da página.
    const anterior = document.activeElement as HTMLElement | null;

    const focaveis = () =>
      [
        ...caixa.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement);

    const primeiro = focaveis()[0];
    (primeiro ?? caixa).focus({ preventScroll: true });

    // O `caixa` de fora é `HTMLElement | null` pelo tipo do ref; aqui dentro
    // ele já passou pela guarda, e o alias tipado é o que evita um `!` solto.
    const elemento: HTMLElement = caixa;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFechar();
        return;
      }
      if (e.key !== 'Tab') return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const ini = lista[0];
      const fim = lista[lista.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === ini || !elemento.contains(atual))) {
        e.preventDefault();
        fim.focus();
      } else if (!e.shiftKey && atual === fim) {
        e.preventDefault();
        ini.focus();
      }
    }

    caixa.addEventListener('keydown', aoTeclar);
    return () => {
      caixa.removeEventListener('keydown', aoTeclar);
      anterior?.focus?.({ preventScroll: true });
    };
  }, [ref, onFechar]);
}
