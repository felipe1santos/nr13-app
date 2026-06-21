import { useState } from 'react';
import type { InfoEquipamento } from './tipos';
import { salvarInfo } from './equipamentoService';
import Campo from '../memorial/Campo';

export default function DadosEquipamento({ info, onSalvo }: { info: InfoEquipamento; onSalvo: (i: InfoEquipamento) => void }) {
  const [editando, setEditando] = useState(false);
  const [local, setLocal] = useState(info);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await salvarInfo(local);
      onSalvo(local);
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="bloco-header-acoes">
        <h4>Dados do Equipamento</h4>
        {!editando && (
          <button type="button" className="btn-editar-pencil" onClick={() => setEditando(true)} title="Editar">
            ✏️
          </button>
        )}
      </div>

      {editando ? (
        <>
          <div className="memorial-campos-grid">
            <Campo label="TAG" type="text" value={local.tag} onChange={() => {}} disabled />
            <Campo label="Descrição" type="text" value={local.descricao ?? ''} onChange={(v) => setLocal((l) => ({ ...l, descricao: v }))} />
            <Campo label="Fabricante" type="text" value={local.fabricante ?? ''} onChange={(v) => setLocal((l) => ({ ...l, fabricante: v }))} />
            <Campo label="Ano de Fabricação" type="text" value={local.ano ?? ''} onChange={(v) => setLocal((l) => ({ ...l, ano: v }))} />
            <Campo label="Nº de Série" type="text" value={local.numeroSerie ?? ''} onChange={(v) => setLocal((l) => ({ ...l, numeroSerie: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn-primario" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Informações'}
            </button>
            <button type="button" className="btn-secundario" onClick={() => { setLocal(info); setEditando(false); }}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="dash-grid-4">
          <div className="resultado-item">
            <span className="lbl-view">TAG</span>
            <span className="val-view">{info.tag}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Nº de Série</span>
            <span className="val-view">{info.numeroSerie || '—'}</span>
          </div>
          <div className="resultado-item span-2">
            <span className="lbl-view">Descrição</span>
            <span className="val-view">{info.descricao || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Fabricante</span>
            <span className="val-view">{info.fabricante || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Ano Fab.</span>
            <span className="val-view">{info.ano || '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
