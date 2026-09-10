import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import { PRIMEIROS_PASSOS } from './infoConteudo';

/**
 * A JORNADA, etapa por etapa.
 *
 * ## Por que um componente só para os dois usos
 *
 * Clicar no cartão 3 e clicar em "Abrir o guia completo" pedem a mesma coisa em
 * profundidades diferentes: no primeiro caso o usuário quer entender AQUELA
 * etapa; no segundo, percorrer a jornada inteira. Fazer dois modais separados
 * duplicaria o texto e — pior — deixaria o primeiro sem saída: quem abre a
 * etapa 3 e entende, quer ver a 4.
 *
 * Então é um só: `inicio` diz onde ele abre, a seta avança, e a barra de
 * progresso no topo diz onde se está. Do cartão ou do botão, o leitor sempre
 * pode continuar.
 *
 * ## Acessibilidade
 *
 * `role="dialog"` com `aria-modal`, ESC fecha, o foco entra no diálogo e fica
 * preso nele, e volta ao elemento de origem ao sair. As setas do teclado (← →)
 * andam pela jornada, porque é o gesto natural de quem está estudando uma
 * sequência.
 */
export default function ModalJornada({
  inicio,
  aoFechar,
}: {
  inicio: number;
  aoFechar: () => void;
}) {
  const navigate = useNavigate();
  const [i, setI] = useState(inicio);
  const caixa = useRef<HTMLDivElement>(null);
  const total = PRIMEIROS_PASSOS.length;
  const etapa = PRIMEIROS_PASSOS[i];

  const ir = useCallback(
    (delta: number) => setI((n) => Math.min(total - 1, Math.max(0, n + delta))),
    [total],
  );

  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>('.info-jor-titulo')?.focus();
    return () => origem?.focus?.();
  }, []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        aoFechar();
        return;
      }
      if (e.key === 'ArrowRight') {
        ir(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        ir(-1);
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
  }, [aoFechar, ir]);

  return (
    <div className="info-modal-overlay" onClick={aoFechar}>
      <div
        className="info-modal info-jornada"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jornada-titulo"
        ref={caixa}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="info-jor-topo">
          <div className="info-jor-topo-linha">
            <span className="info-jor-eyebrow">
              Etapa {i + 1} de {total}
            </span>
            <button type="button" className="info-modal-x" onClick={aoFechar} aria-label="Fechar a jornada">
              ×
            </button>
          </div>

          {/* A barra de progresso é também a NAVEGAÇÃO: cada traço é a etapa, e
              clicar salta para ela. Quem está estudando não quer avançar doze
              vezes para reler a segunda. */}
          <div
            className="info-jor-barra"
            role="tablist"
            aria-label="Etapas da jornada"
          >
            {PRIMEIROS_PASSOS.map((p, n) => (
              <button
                key={p.titulo}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`Etapa ${n + 1}: ${p.titulo}`}
                title={`${n + 1}. ${p.titulo}`}
                className={`info-jor-traco${n === i ? ' is-atual' : ''}${n < i ? ' is-feito' : ''}`}
                onClick={() => setI(n)}
              />
            ))}
          </div>

          <div className="info-jor-cab">
            <span className="info-jor-ic" aria-hidden>
              <Icone nome={etapa.icone} tam={18} />
            </span>
            <h2 id="jornada-titulo" className="info-jor-titulo" tabIndex={-1}>
              {etapa.titulo}
            </h2>
          </div>
        </header>

        <div className="info-modal-corpo info-jor-corpo">
          <p className="info-jor-detalhe">{etapa.detalhe}</p>
          <section className="info-jor-pontos">
            <h3>O que você faz aqui</h3>
            <ul>
              {etapa.pontos.map((p) => (
                <li key={p}>
                  <Icone nome="check" tam={13} /> <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
          {i < total - 1 && (
            <p className="info-jor-proxima">
              <Icone nome="arrowright" tam={12} /> Depois:{' '}
              <strong>{PRIMEIROS_PASSOS[i + 1].titulo}</strong>
            </p>
          )}
        </div>

        <footer className="info-modal-acoes info-jor-acoes">
          <button
            type="button"
            className="btn-secundario info-jor-nav"
            onClick={() => ir(-1)}
            disabled={i === 0}
            aria-label="Etapa anterior"
          >
            <Icone nome="arrowleft" tam={14} />
          </button>
          <button
            type="button"
            className="btn-secundario info-jor-secao"
            onClick={() => {
              aoFechar();
              navigate(etapa.rota);
            }}
          >
            {etapa.rotaRotulo}
          </button>
          <button
            type="button"
            className="btn-primario info-jor-nav-frente"
            onClick={() => (i === total - 1 ? aoFechar() : ir(1))}
          >
            {i === total - 1 ? 'Concluir' : 'Próxima etapa'}{' '}
            <Icone nome={i === total - 1 ? 'check' : 'arrowright'} tam={14} />
          </button>
        </footer>
      </div>
    </div>
  );
}
