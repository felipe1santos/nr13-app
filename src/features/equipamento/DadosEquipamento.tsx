import { useState } from 'react';
import { Icone } from '../../components/Icone';
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
          <button
            type="button"
            className="btn-editar-pencil"
            // Re-sincroniza com a prop ao entrar em edição: `local` fica congelado desde a
            // montagem, e salvar a cópia velha regravava nr13_info_<TAG> apagando campos
            // salvos por outros cards (ex.: pressões adotadas da documentação).
            onClick={() => { setLocal(info); setEditando(true); }}
            title="Editar"
          >
            <Icone nome="pencil" tam={14} />
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
            <Campo label="Código de Projeto" type="text" value={local.codigoProjeto ?? ''} onChange={(v) => setLocal((l) => ({ ...l, codigoProjeto: v }))} />
            <Campo label="Edição" type="text" value={local.edicao ?? ''} onChange={(v) => setLocal((l) => ({ ...l, edicao: v }))} />
            <Campo label="Adenda" type="text" value={local.adenda ?? ''} onChange={(v) => setLocal((l) => ({ ...l, adenda: v }))} />
            <Campo label="Localização" type="text" value={local.localizacao ?? ''} onChange={(v) => setLocal((l) => ({ ...l, localizacao: v }))} />
            <Campo label="Tipo de Construção" type="text" value={local.tipoConstrucao ?? ''} onChange={(v) => setLocal((l) => ({ ...l, tipoConstrucao: v }))} />
            <Campo label="Descrição Resumida" type="text" value={local.descricaoResumida ?? ''} onChange={(v) => setLocal((l) => ({ ...l, descricaoResumida: v }))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={local.placaOcultarDatas ?? false}
              onChange={(e) => setLocal((l) => ({ ...l, placaOcultarDatas: e.target.checked }))}
            />
            Ocultar datas de inspeção/validade na placa
          </label>
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
          <div className="resultado-item">
            <span className="lbl-view">Código de Projeto</span>
            <span className="val-view">{info.codigoProjeto || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Edição</span>
            <span className="val-view">{info.edicao || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Adenda</span>
            <span className="val-view">{info.adenda || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Localização</span>
            <span className="val-view">{info.localizacao || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Tipo de Construção</span>
            <span className="val-view">{info.tipoConstrucao || '—'}</span>
          </div>
          <div className="resultado-item span-2">
            <span className="lbl-view">Descrição Resumida</span>
            <span className="val-view">{info.descricaoResumida || '—'}</span>
          </div>
          <div className="resultado-item">
            <span className="lbl-view">Datas na placa</span>
            <span className="val-view">{info.placaOcultarDatas ? 'Ocultas' : 'Visíveis'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
