/**
 * "Como funciona" — a explicação da sessão, sob demanda.
 *
 * ## O que ela substitui
 *
 * Em Certificados, três parágrafos fixos ocupavam o topo da tela, em toda
 * visita, para explicar algo que se lê uma vez. Quem já entendeu rola por cima
 * deles todo dia; quem não entendeu costuma pular texto denso justamente quando
 * ele aparece sem ter sido pedido.
 *
 * O texto foi reaproveitado quase inteiro — ele estava certo, estava no lugar
 * errado. Aqui ele vira passos numerados com uma ilustração, e sai da frente do
 * trabalho.
 *
 * ## A ilustração
 *
 * SVG desenhado no componente: sem arquivo, sem requisição, sem dependência
 * nova, e acompanha o tema pelas variáveis de cor. Ela existe para dar forma ao
 * que o texto descreve — o padrão de medição, os componentes do equipamento e o
 * certificado que sai no relatório —, não para decorar.
 */
import { useEffect, useRef } from 'react';
import { Icone } from '../../components/Icone';
import './modalComponente.css';
import './ilustracoes.css';

export default function ModalAjudaCalibracoes({ aoFechar }: { aoFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll<HTMLElement>('button, a[href]');
      if (focaveis.length === 0) return;
      const p = focaveis[0];
      const u = focaveis[focaveis.length - 1];
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
    <div
      className="fj-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Como funcionam as calibrações e os certificados"
    >
      <div className="fj-modal-box majuda-box" ref={caixa}>
        <div className="fj-modal-head">
          <div>
            <div className="fj-eyebrow">Calibrações</div>
            <h2>Como funciona</h2>
          </div>
          <button type="button" className="fj-modal-close" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" tam={15} />
          </button>
        </div>

        <div className="majuda-corpo">
          <IlustracaoCalibracao />
          <ol className="majuda-passos">
            <li>
              <div>
                <b>Cadastre o padrão, uma vez</b>
                <span>
                  Em <b>Certificados</b>, anexe o certificado de calibração de cada instrumento
                  padrão de medição — ultrassom, manômetro e válvula — e preencha a
                  rastreabilidade. É um certificado por padrão, válido para todos os equipamentos.
                </span>
              </div>
            </li>
            <li>
              <div>
                <b>Cadastre os componentes do equipamento</b>
                <span>
                  As válvulas e manômetros que serão calibrados. Isso também é feito uma vez: a
                  cada inspeção você reaproveita a mesma lista.
                </span>
              </div>
            </li>
            <li>
              <div>
                <b>Abra um lote a cada inspeção</b>
                <span>
                  O lote é a rodada de calibração daquela inspeção. Dentro dele você calibra os
                  componentes cadastrados, um a um.
                </span>
              </div>
            </li>
            <li>
              <div>
                <b>O relatório se monta sozinho</b>
                <span>
                  Ao gerar um relatório, marque o lote: o sistema injeta os certificados dele,
                  anexa o PDF do padrão usado no ensaio e leva os dados de rastreabilidade para
                  dentro da folha correspondente.
                </span>
              </div>
            </li>
          </ol>
          <p className="mcomp-ajuda" style={{ marginTop: 16 }}>
            <Icone nome="alerttri" tam={13} /> Mantenha o certificado do padrão atualizado quando
            ele vencer — é ele que dá validade à medição no documento assinado.
          </p>
        </div>

        <div className="majuda-acoes">
          <button type="button" className="fj-btn fj-btn-primary" onClick={aoFechar}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O padrão de medição à esquerda, os componentes do equipamento ao centro e o
 * certificado que sai no relatório à direita — a mesma sequência dos passos.
 */
export function IlustracaoCalibracao() {
  return (
    <svg
      className="ilustra ilustra-calibracao"
      viewBox="0 0 300 96"
      role="img"
      aria-label="O padrão de medição, os componentes do equipamento e o certificado no relatório"
    >
      {/* padrão de medição */}
      <rect x="8" y="24" width="54" height="48" rx="7" className="il-traco" />
      <circle cx="35" cy="44" r="11" className="il-traco" />
      <path d="M35 44l6-6" className="il-linha" />
      <path d="M20 62h30" className="il-linha" />

      <path d="M70 48h22" className="il-seta" />

      {/* componentes do equipamento */}
      <rect x="100" y="18" width="60" height="60" rx="9" className="il-traco" />
      <circle cx="118" cy="38" r="8" className="il-traco" />
      <path d="M134 34h14M134 42h14" className="il-linha" />
      <path d="M112 58h36" className="il-linha" />
      <path d="M118 58v10M142 58v10" className="il-guia" />

      <path d="M168 48h22" className="il-seta" />

      {/* certificado no relatório */}
      <rect x="198" y="12" width="72" height="72" rx="6" className="il-traco il-papel" />
      <path d="M210 30h48M210 42h48M210 54h30" className="il-linha" />
      <rect x="210" y="62" width="30" height="12" rx="3" className="il-marca" />
    </svg>
  );
}
