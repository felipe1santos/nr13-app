import { useState } from 'react';
import { listarContainers } from '../inspecoes/inspecaoService';
import { ENSAIOS_DISPONIVEIS } from '../inspecoes/tipos';
import '../equipamento/equipamento.css';

interface Props {
  tag: string;
  onClose: () => void;
  onConfirmar: (containerId: string | null) => void;
}

export default function ModalSelecionarContainer({ tag, onClose, onConfirmar }: Props) {
  const containers = listarContainers(tag);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Selecionar Container de Inspeção</h3>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="texto-ajuda-modal">
            Selecione um container de inspeção pra injetar automaticamente os dados de campo já coletados (ultrassom, checklist,
            calibrações...) neste relatório. Opcional.
          </p>

          <div className="lista-documentos-scroll">
            <label className="item-documento-check">
              <input type="radio" name="container" checked={selecionado === null} onChange={() => setSelecionado(null)} />
              Não injetar dados (relatório em branco)
            </label>
            {containers.map((c) => (
              <label key={c.id} className="item-documento-check">
                <input type="radio" name="container" checked={selecionado === c.id} onChange={() => setSelecionado(c.id)} />
                <span>
                  Criado em {c.criadoEm} —{' '}
                  {c.ensaios.map((e) => ENSAIOS_DISPONIVEIS.find((d) => d.value === e)?.label ?? e).join(', ')}
                </span>
              </label>
            ))}
            {containers.length === 0 && (
              <p className="dashboard-vazio" style={{ padding: 16 }}>
                Nenhum container de inspeção salvo pra este equipamento ainda.
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secundario" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn-primario" onClick={() => onConfirmar(selecionado)}>
              Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
