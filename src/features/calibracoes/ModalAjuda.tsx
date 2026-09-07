/**
 * O modal de ajuda contextual das sessões de Calibrações e Certificados.
 *
 * ## Por que ele existe
 *
 * As duas telas tinham parágrafos fixos no topo explicando, em toda visita,
 * algo que se lê uma vez — e empurrando o trabalho para baixo da dobra. O
 * conteúdo virou ajuda sob demanda, atrás de um `[i] Informações` na barra.
 *
 * ## Sobre o TEXTO
 *
 * Cada passo aqui descreve o que o código faz HOJE, conferido antes de
 * escrever. Em particular, a reutilização automática do certificado padrão tem
 * duas condições que uma promessa genérica esconderia, e que estão ditas:
 *
 *  - o relatório precisa INCLUIR a folha correspondente — `ULTRASSOM.html`
 *    puxa o bloco padrão de espessura; as folhas `CERTIFICADO-CAL-*` puxam o
 *    padrão do tipo daquela calibração (`tiposPadraoDoRelatorio`);
 *  - a caixa "Injetar no final do relatório" precisa estar marcada no cadastro
 *    do padrão (`injetaNoRelatorio`).
 *
 * Sem uma das duas, nada é anexado — e dizer o contrário faria o usuário
 * entregar um documento acreditando que o certificado está lá.
 */
import { useEffect, useRef } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import './modalAjuda.css';

export interface PassoAjuda {
  titulo: string;
  texto: React.ReactNode;
}

export default function ModalAjuda({
  eyebrow,
  icone,
  titulo,
  subtitulo,
  ilustracao,
  alt,
  passos,
  nota,
  aoFechar,
}: {
  eyebrow: string;
  icone: NomeIcone;
  titulo: string;
  subtitulo: string;
  /** Caminho em `public/ilustracoes/`. */
  ilustracao: string;
  alt: string;
  passos: PassoAjuda[];
  nota?: React.ReactNode;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const idTitulo = 'ajuda-titulo';

  /**
   * Foco inicial no BOTÃO FECHAR, não no conteúdo.
   *
   * O modal é informativo: quem o abriu quer ler e sair. Pôr o foco na saída
   * dá o caminho de volta a um Enter de distância, e é o que o leitor de tela
   * anuncia primeiro depois do título.
   */
  useEffect(() => {
    fechar.current?.focus();
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const foc = caixa.current.querySelectorAll<HTMLElement>('button, a[href]');
      if (foc.length === 0) return;
      const p = foc[0];
      const u = foc[foc.length - 1];
      if (!e.shiftKey && document.activeElement === u) {
        e.preventDefault();
        p.focus();
      } else if (e.shiftKey && document.activeElement === p) {
        e.preventDefault();
        u.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    // Clicar fora FECHA: este modal não tem preenchimento a perder.
    <div
      className="fj-modal-overlay ajuda-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <div className="fj-modal-box ajuda-box" ref={caixa}>
        <div className="ajuda-head">
          <div className="ajuda-head-txt">
            <div className="fj-eyebrow">
              <Icone nome={icone} tam={12} /> {eyebrow}
            </div>
            <h2 id={idTitulo}>{titulo}</h2>
            <p>{subtitulo}</p>
          </div>
          <button
            ref={fechar}
            type="button"
            className="fj-modal-close"
            onClick={aoFechar}
            aria-label="Fechar"
          >
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="ajuda-corpo">
          {/* `contain` e proporção fixa: a ilustração é 3:1 e não pode esticar
              nem cortar. `loading="lazy"` porque ela só existe se alguém abrir
              a ajuda — não pesa no carregamento da tela. */}
          <figure className="ajuda-figura">
            <img src={ilustracao} alt={alt} loading="lazy" decoding="async" />
          </figure>

          <ol className="ajuda-passos">
            {passos.map((p) => (
              <li key={p.titulo}>
                <div>
                  <b>{p.titulo}</b>
                  <span>{p.texto}</span>
                </div>
              </li>
            ))}
          </ol>

          {nota && (
            <p className="ajuda-nota">
              <Icone nome="alerttri" tam={13} /> <span>{nota}</span>
            </p>
          )}
        </div>

        <div className="ajuda-acoes">
          <button type="button" className="fj-btn fj-btn-primary" onClick={aoFechar}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
