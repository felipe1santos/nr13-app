import { useEffect, useRef, type RefObject } from 'react';

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
 *
 * ## O EFEITO RODA UMA VEZ POR ABERTURA. NUNCA A CADA RENDER (15/09/2026)
 *
 * Isto não é detalhe de performance — é a diferença entre o formulário
 * funcionar e não funcionar. O efeito abaixo **move o foco** para o primeiro
 * elemento focável do diálogo. Se ele reexecutar a cada render, cada tecla
 * digitada devolve o foco ao topo do modal, e o usuário precisa clicar de novo
 * no campo para digitar a SEGUNDA letra.
 *
 * Era exatamente o que acontecia, e a causa era a lista de dependências:
 * `[ref, onFechar]`. Todo chamador passa uma função nova a cada render — ora
 * uma arrow inline aqui (`() => !ocupado && onFechar()`), ora uma arrow inline
 * no JSX do pai (`onFechar={() => setVendo(null)}`). Identidade nova a cada
 * render = efeito reexecutado a cada render. Medido no cadastro de manômetro
 * padrão: uma letra digitada, `blur` no input e `document.activeElement` no
 * botão "×" do cabeçalho.
 *
 * A correção é guardar a função num ref e **tirá-la das dependências**. O
 * ouvinte lê `aoFechar.current` na hora do evento, então continua enxergando a
 * versão mais recente — inclusive as guardas que o chamador põe dentro dela
 * (`!ocupado && ...`). Exigir `useCallback` de todo chamador resolveria só os
 * que lembrassem de usar, e o próximo modal nasceria com o defeito de volta.
 *
 * `ref` continua nas dependências por ser o objeto de ref (estável por
 * identidade); ele está ali para o caso de alguém trocar o ref do diálogo.
 */
export function useFocoPreso(ref: RefObject<HTMLElement | null>, onFechar: () => void): void {
  // A função mais recente, sem entrar nas dependências do efeito de foco.
  // Atualizada em efeito (e não durante o render) para não escrever em ref no
  // corpo do componente; o ouvinte só a lê quando o usuário tecla Esc, muito
  // depois de qualquer render ter terminado.
  const aoFechar = useRef(onFechar);
  useEffect(() => {
    aoFechar.current = onFechar;
  });

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
        aoFechar.current();
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
  }, [ref]);
}
