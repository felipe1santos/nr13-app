/**
 * O "i" que abre uma explicação curta ao lado do que ele explica.
 *
 * Nasceu dentro do modal "Novo registro" (o "i" do pré-preenchimento) e virou
 * componente quando a mesma peça passou a ser pedida em mais dois lugares: o
 * título da sessão e o selo da cadeia de registros. Três cópias do mesmo botão
 * seriam três comportamentos de ESC diferentes daqui a um mês.
 *
 * ## O ESC fecha o POPOVER, não a tela
 *
 * Ele escuta na fase de CAPTURA e chama `stopPropagation`: dentro de um modal,
 * um ESC para dispensar a explicação não pode derrubar o formulário e levar
 * junto o que o usuário já digitou.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export default function PopoverAjuda({
  rotulo,
  children,
  alinhamento = 'esquerda',
}: {
  /** O que o leitor de tela anuncia — "O que é pré-preencher", por exemplo. */
  rotulo: string;
  children: ReactNode;
  /** De que lado do botão a caixa abre. */
  alinhamento?: 'esquerda' | 'direita';
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const idPop = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [aberto]);

  return (
    <span className="reg-ajuda" ref={raiz}>
      <button
        type="button"
        className="reg-ajuda-btn"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={idPop}
        onClick={() => setAberto((v) => !v)}
      >
        i
      </button>
      {aberto && (
        <span
          className={`reg-ajuda-pop${alinhamento === 'direita' ? ' reg-ajuda-pop-dir' : ''}`}
          id={idPop}
          role="note"
        >
          {children}
        </span>
      )}
    </span>
  );
}
