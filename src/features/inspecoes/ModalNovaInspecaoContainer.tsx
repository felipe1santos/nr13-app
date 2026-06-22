import { useState } from 'react';
import { ENSAIOS_DISPONIVEIS, type TipoEnsaio } from './tipos';
import '../equipamento/equipamento.css';

const ICONES: Record<TipoEnsaio, React.ReactNode> = {
  checklist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  ultrassom: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2M6 8v8M10 6v12M14 9v6M18 7v10M22 12h-2"/>
    </svg>
  ),
  visual_externo: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  visual_interno: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <circle cx="11" cy="11" r="3"/>
    </svg>
  ),
  teste_hidrostatico: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 L6 9 A6 6 0 1 0 18 9 Z"/>
    </svg>
  ),
};

interface Props {
  onClose: () => void;
  onCriar: (ensaios: TipoEnsaio[], nome: string) => void;
  // ao só adicionar ensaios a um container existente, o nome já existe — não pedir de novo
  pedirNome?: boolean;
}

export default function ModalNovaInspecaoContainer({ onClose, onCriar, pedirNome = true }: Props) {
  const [marcados, setMarcados] = useState<TipoEnsaio[]>([]);
  const [nome, setNome] = useState('');

  function toggle(ensaio: TipoEnsaio) {
    setMarcados((m) => (m.includes(ensaio) ? m.filter((e) => e !== ensaio) : [...m, ensaio]));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nova Inspeção</h3>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {pedirNome && (
            <label className="campo-nome-container" style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nome do container</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Inspeção periódica 2026"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-solid)', fontSize: 14 }}
              />
            </label>
          )}
          <fieldset className="tipo-equipamento-fieldset">
            <legend>Ensaios a atribuir a este container</legend>
            {ENSAIOS_DISPONIVEIS.map((e) => (
              <label key={e.value} className="radio-card" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={marcados.includes(e.value)} onChange={() => toggle(e.value)} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{ICONES[e.value]}</span>
                  {e.label}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="modal-actions">
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primario" onClick={() => onCriar(marcados, nome)} disabled={marcados.length === 0}>
              {pedirNome ? 'Criar Container' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
