/**
 * Reestruturação de Calibrações (19/09/2026) · a JANELA de trabalho da
 * calibração. UM componente, dois modos:
 *
 *   modal central grande  ⇄  tela cheia   (botão ⛶ no cabeçalho)
 *
 * O modo vale só para esta abertura — não há preferência global. No celular
 * (≤ 640 px) a janela já nasce praticamente em tela cheia pelo CSS; o botão
 * continua lá e não muda nada que atrapalhe.
 *
 * Cabeçalho e rodapé fixos; o corpo rola. Clique FORA não fecha: há uma
 * calibração sendo preenchida. ESC e o ✕ fecham — mas, com alteração não
 * salva, perguntam antes, numa faixa dentro da própria janela (nada de
 * `window.confirm`, que congela a aba — ver memória do projeto).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import './janelaCalibracao.css';

export default function JanelaCalibracao({
  titulo,
  subtitulo,
  eyebrow,
  sujo,
  ocupado,
  aoFechar,
  rodape,
  children,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  eyebrow?: string;
  /** Há alteração não salva? Fechar passa a perguntar. */
  sujo: boolean;
  /** Salvando/emitindo: fechar fica bloqueado. */
  ocupado?: boolean;
  aoFechar: () => void;
  rodape: ReactNode;
  children: ReactNode;
}) {
  const [cheia, setCheia] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  function pedirFechar() {
    if (ocupado) return;
    if (sujo) setConfirmando(true);
    else aoFechar();
  }

  // O ESC lê o estado atual por referência — o efeito não precisa se refazer.
  const pedirRef = useRef(pedirFechar);
  useEffect(() => {
    pedirRef.current = pedirFechar;
  });
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // Um modal por cima (resultados, componente) cuida do próprio ESC.
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Só a janela do TOPO responde: resultados e componente abrem por cima
      // (dentro do corpo) e têm o próprio ESC.
      const topo = [...document.querySelectorAll('[role=dialog]')].pop();
      if (topo !== caixa.current) return;
      e.preventDefault();
      pedirRef.current();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  return (
    <div className="fj-modal-overlay jcal-fundo" role="presentation">
      <div
        ref={caixa}
        className={`jcal${cheia ? ' jcal-cheia' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-modo={cheia ? 'cheia' : 'modal'}
      >
        <header className="jcal-cabeca">
          <div className="jcal-titulo">
            {eyebrow && <div className="fj-eyebrow">{eyebrow}</div>}
            <h2>{titulo}</h2>
            {subtitulo && <div className="jcal-sub">{subtitulo}</div>}
          </div>
          <button
            type="button"
            className="fj-btn fj-btn-ghost jcal-expandir"
            onClick={() => setCheia((c) => !c)}
            aria-pressed={cheia}
            title={cheia ? 'Voltar ao modal' : 'Tela cheia'}
          >
            <span aria-hidden>{cheia ? '🗗' : '⛶'}</span>
            <span className="jcal-expandir-rotulo">{cheia ? 'Recolher' : 'Tela cheia'}</span>
          </button>
          <button
            type="button"
            className="fj-modal-close"
            onClick={pedirFechar}
            aria-label="Fechar"
            disabled={ocupado}
          >
            <Icone nome="x" tam={15} />
          </button>
        </header>

        {confirmando && (
          <div className="jcal-confirma" role="alertdialog" aria-label="Descartar alterações?">
            <span>Há alterações não salvas nesta calibração.</span>
            <div>
              <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setConfirmando(false)}>
                Continuar editando
              </button>
              <button type="button" className="fj-btn fj-btn-danger jcal-descartar" onClick={aoFechar}>
                Descartar
              </button>
            </div>
          </div>
        )}

        <div className="jcal-corpo">{children}</div>

        <footer className="jcal-rodape">{rodape}</footer>
      </div>
    </div>
  );
}
