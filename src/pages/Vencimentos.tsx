import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import CalendarioVencimentos from '../components/CalendarioVencimentos';
import { resumoKpis, textoPrazo, useVencimentos } from '../services/vencimentos';
import type { ItemVencimento } from '../services/vencimentos';
import { listarChavesComPrefixo } from '../services/storage';
import './dashboard-novo.css';

const ICONE_TIPO: Record<string, Parameters<typeof Icone>[0]['nome']> = {
  'Vaso de Pressão': 'cylinder',
  Caldeira: 'flame',
  Autoclave: 'box',
  'Manômetro': 'gauge',
  'Válvula de Segurança': 'tool',
};

function BadgeStatus({ status }: { status: ItemVencimento['status'] }) {
  if (status === 'crit') return <span className="fj-badge crit">Crítico</span>;
  if (status === 'warn') return <span className="fj-badge warn">Atenção</span>;
  if (status === 'ok') return <span className="fj-badge ok">Operacional</span>;
  return <span className="fj-badge neutro">Sem prazo</span>;
}

export default function Vencimentos() {
  const navigate = useNavigate();
  const itens = useVencimentos();
  const totalEquip = listarChavesComPrefixo('nr13_info_').length;
  const kpis = useMemo(() => resumoKpis(itens, totalEquip), [itens, totalEquip]);

  function irParaItem(it: ItemVencimento) {
    navigate(`/equipamento/${it.pertenceA ?? it.tag}`);
  }

  return (
    <div className="dash-page">
      <div className="fj-kpi-row">
        <div className="fj-kpi">
          <div>
            <div className="fj-kpi-label">Equipamentos cadastrados</div>
            <div className="fj-kpi-value">{kpis.total}</div>
            <div className="fj-kpi-delta flat">ativos sob NR-13</div>
          </div>
          <div className="fj-kpi-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <Icone nome="box" tam={18} />
          </div>
        </div>
        <div className="fj-kpi">
          <div>
            <div className="fj-kpi-label">Próximos a vencer <span className="mono" style={{ fontSize: 10 }}>(30 dias)</span></div>
            <div className="fj-kpi-value" style={{ color: 'var(--warn)' }}>{kpis.aVencer30}</div>
            <div className="fj-kpi-delta flat">inspeções e calibrações</div>
          </div>
          <div className="fj-kpi-icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
            <Icone nome="clock" tam={18} />
          </div>
        </div>
        <div className="fj-kpi">
          <div>
            <div className="fj-kpi-label">Vencidos</div>
            <div className="fj-kpi-value" style={{ color: kpis.vencidos > 0 ? 'var(--crit)' : undefined }}>{kpis.vencidos}</div>
            <div className={`fj-kpi-delta ${kpis.vencidos > 0 ? 'down' : 'up'}`}>
              {kpis.vencidos > 0 ? 'ação imediata' : 'nenhum vencido'}
            </div>
          </div>
          <div className="fj-kpi-icon" style={{ background: 'var(--crit-bg)', color: 'var(--crit)' }}>
            <Icone nome="alerttri" tam={18} />
          </div>
        </div>
        <div className="fj-kpi">
          <div>
            <div className="fj-kpi-label">Taxa de conformidade</div>
            <div className="fj-kpi-value">
              {kpis.conformidade.toLocaleString('pt-BR')}
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>%</span>
            </div>
            <div className={`fj-kpi-delta ${kpis.conformidade >= 90 ? 'up' : 'down'}`}>
              <Icone nome="trendup" tam={11} /> itens com prazo em dia
            </div>
          </div>
          <div className="fj-kpi-icon" style={{ background: 'var(--ok-bg)', color: 'var(--ok)' }}>
            <Icone nome="checkcircle" tam={18} />
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Prazos</div>
              <h2>Equipamentos próximos do vencimento</h2>
            </div>
            {kpis.vencidos > 0 && <span className="fj-badge crit">{kpis.vencidos} vencido{kpis.vencidos > 1 ? 's' : ''}</span>}
          </div>
          {itens.length === 0 ? (
            <div className="fj-empty">
              <div className="fj-empty-ic"><Icone nome="calendar" tam={22} /></div>
              <div className="fj-empty-title">Nenhum equipamento cadastrado</div>
              Cadastre equipamentos e calcule a Vida Remanescente para acompanhar prazos aqui.
            </div>
          ) : (
            <div className="fj-table-wrap">
              <table className="fj-table">
                <thead>
                  <tr><th>Tag</th><th>Origem</th><th>Última</th><th>Vencimento</th><th>Prazo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {itens.map((it, i) => (
                    <tr key={`${it.tag}${i}`} style={{ cursor: 'pointer' }} onClick={() => irParaItem(it)}>
                      <td>
                        <div className="fj-tag-cell">
                          <div className="fj-tag-ico"><Icone nome={ICONE_TIPO[it.tipoEquip] ?? 'box'} tam={15} /></div>
                          <div>
                            <div className="fj-tag-code">{it.tag}</div>
                            <div className="fj-eq-name">
                              {it.tipoEquip}
                              {it.pertenceA ? ` · pertence a ${it.pertenceA}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{it.origem === 'calibracao' ? 'Calibração' : 'Inspeção'}</td>
                      <td className="mono">{it.ultima ? it.ultima.toLocaleDateString('pt-BR') : <span className="fj-dash">—</span>}</td>
                      <td className="mono">{it.vencimento ? it.vencimento.toLocaleDateString('pt-BR') : <span className="fj-dash">—</span>}</td>
                      <td className={`fj-days ${it.status === 'crit' ? 'crit' : it.status === 'warn' ? 'warn' : ''}`}>{textoPrazo(it)}</td>
                      <td><BadgeStatus status={it.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Agenda</div>
              <h2>Próximas inspeções</h2>
            </div>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => navigate('/inspecoes')}>
              <Icone nome="plus" tam={14} /> Nova inspeção
            </button>
          </div>
          <CalendarioVencimentos itens={itens} />
        </div>
      </div>
    </div>
  );
}
