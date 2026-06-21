import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EquipamentoResumo } from './tipos';
import type { SistemaUnidade } from '../../calc/unidades';
import { FATORES_CONVERSAO, formatarValor } from '../../calc/unidades';
import { salvarUnidade } from './equipamentoService';
import BadgeTipoEquipamento from './BadgeTipoEquipamento';
import './equipamento.css';

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

export default function CardEquipamento({ item }: { item: EquipamentoResumo }) {
  const navigate = useNavigate();
  const { tag, info, categoria, calculo, fotoCapa } = item;
  const [unidade, setUnidade] = useState<SistemaUnidade>(item.unidade);

  const rotuloTipo =
    ROTULO_TIPO[info.tipo] + (info.subtipo && info.subtipo !== 'flamotubular' ? ` (${info.subtipo})` : '');

  const pmtaMpa = calculo ? parseFloat(calculo.pmta) : null;
  const pthMpa = calculo?.pth ? parseFloat(calculo.pth) : null;

  async function handleUnidadeChange(e: ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const u = e.target.value as SistemaUnidade;
    setUnidade(u);
    await salvarUnidade(tag, u);
  }

  return (
    <div className="card-equipamento" onClick={() => navigate(`/equipamento/${tag}`)} style={{ cursor: 'pointer' }}>
      <div className="card-capa-container">
        {fotoCapa ? (
          <img src={fotoCapa} alt={`Foto do equipamento ${tag}`} />
        ) : (
          <div className="card-capa-placeholder">Sem Foto</div>
        )}
        <span className="card-badge-tag">{tag}</span>
      </div>
      <div className="card-corpo">
        <div className="card-unidade-linha" onClick={(e) => e.stopPropagation()}>
          <span className="card-unidade-lbl">Unidade de Medida</span>
          <select
            className="card-unidade-select"
            value={unidade}
            onChange={handleUnidadeChange}
            title="Selecionar unidade de medida"
          >
            {(Object.keys(FATORES_CONVERSAO) as SistemaUnidade[]).map((key) => (
              <option key={key} value={key}>
                {key} ({FATORES_CONVERSAO[key].labelPressao})
              </option>
            ))}
          </select>
        </div>
        <h4>{info.descricao || rotuloTipo}</h4>
        <div className="card-specs-grid">
          <div>
            <span className="spec-label">PMTA</span>
            <span className="spec-valor">{pmtaMpa != null ? formatarValor(pmtaMpa, unidade) : '—'}</span>
          </div>
          <div>
            <span className="spec-label">Categoria</span>
            <span className="spec-valor">{categoria?.catFinal ?? '—'}</span>
          </div>
          <div>
            <span className="spec-label">Volume</span>
            <span className="spec-valor">{categoria ? `${categoria.volInput} m³` : '—'}</span>
          </div>
          <div>
            <span className="spec-label">Fluido</span>
            <span className="spec-valor">{categoria?.fluidoInput ?? '—'}</span>
          </div>
          {pthMpa != null && (
            <div>
              <span className="spec-label">PTH (1,3×)</span>
              <span className="spec-valor">{formatarValor(pthMpa, unidade)}</span>
            </div>
          )}
          {calculo?.resultado && (
            <div>
              <span className="spec-label">Resultado</span>
              <span className={`spec-valor ${calculo.resultado === 'REPROVADO' ? 'spec-reprovado' : 'spec-aprovado'}`}>
                {calculo.resultado}
              </span>
            </div>
          )}
        </div>
        <div className="card-footer">
          <BadgeTipoEquipamento tipo={info.tipo} label={rotuloTipo} />
          <span className="card-btn-acessar">Acessar →</span>
        </div>
      </div>
    </div>
  );
}
