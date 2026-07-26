import { useEffect, useState } from 'react';
import { assinarAviso, type Aviso } from '../services/eventos';
import { Icone, type NomeIcone } from './Icone';
import './modal-aviso.css';

const ICONE: Record<Aviso['variante'], NomeIcone> = {
  sucesso: 'check',
  alerta: 'alerttri',
  erro: 'alerttri',
};

// Modal único do app para bloqueio/sucesso. Monta uma vez no Layout e escuta o
// barramento — assim serviços (pdfService, printService) avisam sem virar React.
export default function ModalAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => assinarAviso(setAviso), []);

  useEffect(() => {
    if (!aviso) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAviso(null);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aviso]);

  if (!aviso) return null;

  return (
    <div className="modal-aviso-fundo" role="dialog" aria-modal="true" onClick={() => setAviso(null)}>
      <div className={`modal-aviso ${aviso.variante}`} onClick={(e) => e.stopPropagation()}>
        <span className="modal-aviso-ic">
          <Icone nome={ICONE[aviso.variante]} tam={30} />
        </span>
        <h3>{aviso.titulo}</h3>
        <p>{aviso.texto}</p>
        <div className="modal-aviso-acoes">
          {aviso.acao && (
            <button
              type="button"
              className="modal-aviso-btn principal"
              onClick={() => {
                aviso.acao?.aoClicar();
                setAviso(null);
              }}
            >
              {aviso.acao.rotulo}
            </button>
          )}
          <button type="button" className="modal-aviso-btn" onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
