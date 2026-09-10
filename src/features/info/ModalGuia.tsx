import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import type { Guia } from './infoConteudo';

/**
 * O guia aberto.
 *
 * ## Acessibilidade não é enfeite aqui
 *
 * É um `role="dialog"` com `aria-modal`, ESC fecha, o foco entra no diálogo,
 * fica preso nele enquanto está aberto e VOLTA para o botão que o abriu. Sem a
 * última parte, quem navega por teclado é devolvido ao topo da página e perde
 * o lugar da lista onde estava — o que na prática torna a central inutilizável
 * sem mouse.
 */
export default function ModalGuia({
  guia,
  aoFechar,
}: {
  guia: Guia;
  aoFechar: () => void;
}) {
  const navigate = useNavigate();
  const caixa = useRef<HTMLDivElement>(null);
  const origem = useRef<HTMLElement | null>(null);

  useEffect(() => {
    origem.current = document.activeElement as HTMLElement | null;
    // O foco entra no TÍTULO, não no primeiro botão: quem chegou aqui veio ler.
    caixa.current?.querySelector<HTMLElement>('.info-modal-titulo')?.focus();
    const anterior = origem.current;
    return () => anterior?.focus?.();
  }, []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = [
        ...caixa.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener('keydown', tecla, true);
    return () => document.removeEventListener('keydown', tecla, true);
  }, [aoFechar]);

  return (
    <div className="info-modal-overlay" onClick={aoFechar}>
      <div
        className="info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`guia-${guia.id}`}
        ref={caixa}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-modal-topo">
          <span className="info-modal-ic" aria-hidden>
            <Icone nome={guia.icone} tam={18} />
          </span>
          <div className="info-modal-tit">
            <h2 id={`guia-${guia.id}`} className="info-modal-titulo" tabIndex={-1}>
              {guia.titulo}
            </h2>
            <p>{guia.resumo}</p>
          </div>
          <button type="button" className="info-modal-x" onClick={aoFechar} aria-label="Fechar o guia">
            ×
          </button>
        </header>

        <div className="info-modal-corpo">
          {guia.preRequisitos.length > 0 && (
            <section className="info-pre">
              <h3>Antes de começar</h3>
              <ul>
                {guia.preRequisitos.map((p) => (
                  <li key={p}>
                    <Icone nome="check" tam={13} /> {p}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="info-passos">
            <h3>Passo a passo</h3>
            <ol>
              {guia.passos.map((p, i) => (
                <li key={p.titulo}>
                  <span className="info-passo-n" aria-hidden>
                    {i + 1}
                  </span>
                  <div>
                    <strong>{p.titulo}</strong>
                    <p>{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {guia.observacoes.length > 0 && (
            <section className="info-obs">
              <h3>Importante</h3>
              <ul>
                {guia.observacoes.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}

          {guia.depois && (
            <section className="info-depois">
              <h3>O que acontece depois</h3>
              <p>{guia.depois}</p>
            </section>
          )}
        </div>

        <footer className="info-modal-acoes">
          {guia.rota && (
            <button
              type="button"
              className="btn-primario"
              onClick={() => {
                aoFechar();
                navigate(guia.rota!);
              }}
            >
              {guia.rotaRotulo ?? 'Abrir a tela'} <Icone nome="arrowright" tam={13} />
            </button>
          )}
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
