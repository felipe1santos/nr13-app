/**
 * Passo 1 de criar um relatório: QUAL equipamento.
 *
 * ## Por que modal, e não tela
 *
 * O caminho anterior navegava para uma tela inteira chamada "Para qual
 * equipamento?", e ao voltar a lista de `/relatorios` era remontada do zero:
 * busca perdida, rolagem perdida, filtro perdido. Escolher o equipamento não é
 * um lugar — é uma pergunta dentro do trabalho que já estava acontecendo. Em
 * modal, a lista continua atrás, no mesmo estado, e o "Cancelar" devolve
 * exatamente o que havia antes.
 *
 * ## O que este modal NÃO mostra
 *
 * Histórico, relatórios anteriores, contagem de documentos. Ele é o SELETOR
 * (`modo="selecao"` do catálogo), e a contagem por TAG nem chega a ser pedida
 * ao servidor. Mostrar "12 Relatórios" aqui responderia a pergunta de outra
 * tela e devolveria, em outro formato, a segunda lista que a auditoria
 * anterior removeu.
 *
 * ## Estado da busca
 *
 * O termo é LOCAL, não vai para a URL. A URL de `/relatorios` já guarda a busca
 * da LISTA; usar a mesma faria digitar aqui recortar a lista atrás do modal.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import './modalCriarRelatorio.css';

export default function ModalSelecionarEquipamento({
  titulo = 'Selecione o equipamento',
  sobre = 'Criar relatório',
  intro,
  children,
  aoFechar,
}: {
  /** O que se está escolhendo — muda entre relatório e prontuário. */
  titulo?: string;
  sobre?: string;
  /**
   * Bloco de abertura opcional, entre o cabeçalho e a lista (ilustração +
   * explicação curta). Opcional de propósito: o modal de relatório abre em
   * cima de uma lista que o usuário acabou de ver e não precisa da introdução.
   */
  intro?: ReactNode;
  /**
   * O CATÁLOGO. Cada módulo tem o seu (relatórios e prontuários leem
   * projeções e recortes diferentes), e é ele que muda entre um e outro — a
   * moldura, a armadilha de foco e o comportamento do ESC são os mesmos.
   * Passar o catálogo por dentro é o que evita um segundo modal quase igual.
   */
  children: ReactNode;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * ESC fecha; Tab circula dentro do modal.
   *
   * O foco inicial fica com o navegador na caixa (o campo de busca é o
   * primeiro elemento focável dela): forçar `focus()` no campo abriria o
   * teclado virtual no celular assim que o modal aparecesse, cobrindo a lista
   * que a pessoa ainda nem viu.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label={`${sobre} — ${titulo}`}
    >
      <div className="fj-modal-box mcr-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">{sobre}</div>
            <h2>{titulo}</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="mcr-corpo mcr-corpo-lista">
          {intro}
          {children}
        </div>
      </div>
    </div>
  );
}
