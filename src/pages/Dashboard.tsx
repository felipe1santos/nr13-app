import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../components/Icone';
import CalendarioVencimentos from '../components/CalendarioVencimentos';
import { listarVencimentos, resumoKpis, textoPrazo } from '../services/vencimentos';
import type { ItemVencimento } from '../services/vencimentos';
import { listarChavesComPrefixo } from '../services/storage';
import { carregarMinhaEmpresa } from '../features/cadastros/cadastroService';
import './dashboard-novo.css';

const ICONE_TIPO: Record<string, Parameters<typeof Icone>[0]['nome']> = {
  'Vaso de Pressão': 'cylinder',
  Caldeira: 'flame',
  Autoclave: 'box',
  'Manômetro': 'manometro',
  'Válvula de Segurança': 'valvula-psv',
};

function BadgeStatus({ status }: { status: ItemVencimento['status'] }) {
  if (status === 'crit') return <span className="fj-badge crit">Crítico</span>;
  if (status === 'warn') return <span className="fj-badge warn">Atenção</span>;
  if (status === 'ok') return <span className="fj-badge ok">Operacional</span>;
  return <span className="fj-badge neutro">Sem prazo</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [alertaDispensado, setAlertaDispensado] = useState(
    () => sessionStorage.getItem('nr13_alerta_dispensado') === '1',
  );
  const [listaExpandida, setListaExpandida] = useState(false);

  const itens = useMemo(() => listarVencimentos(), []);
  const totalEquip = listarChavesComPrefixo('nr13_info_').length;
  const kpis = useMemo(() => resumoKpis(itens, totalEquip), [itens, totalEquip]);
  const empresa = carregarMinhaEmpresa();

  const vencidos = itens.filter((i) => i.status === 'crit');
  const alertas = itens.filter((i) => i.status === 'crit' || i.status === 'warn').slice(0, 5);
  const comPrazo = itens.filter((i) => i.status !== 'semPrazo');
  const tabela = listaExpandida ? comPrazo : comPrazo.slice(0, 6);
  const primeiroVencido = vencidos[0];

  function dispensarAlerta() {
    sessionStorage.setItem('nr13_alerta_dispensado', '1');
    setAlertaDispensado(true);
  }

  function irParaItem(it: ItemVencimento) {
    navigate(`/equipamento/${it.pertenceA ?? it.tag}`);
  }

  return (
    <div className="dash-page">
      {/* ===== BANNER CRÍTICO ===== */}
      {primeiroVencido && !alertaDispensado && (
        <div className="alert-banner">
          <div className="alert-ic-wrap">
            <Icone nome="alerttri" tam={20} style={{ stroke: '#fff' }} />
            <span className="pulse-dot" />
          </div>
          <div className="alert-body">
            <div className="alert-title">
              {vencidos.length === 1
                ? '1 equipamento vencido requer atenção imediata'
                : `${vencidos.length} itens vencidos requerem atenção imediata`}
            </div>
            <div className="alert-sub">
              <b>{primeiroVencido.tag}</b> · {primeiroVencido.tipoEquip}
              {primeiroVencido.pertenceA ? ` · pertence a ${primeiroVencido.pertenceA}` : ''} ·{' '}
              {textoPrazo(primeiroVencido).toLowerCase()}
            </div>
          </div>
          <div className="alert-actions">
            <button type="button" className="btn-alert" onClick={() => irParaItem(primeiroVencido)}>
              Ver equipamento <Icone nome="arrowright" tam={13} />
            </button>
            <button type="button" className="btn-alert-ghost" title="Dispensar" onClick={dispensarAlerta}>
              <Icone nome="x" tam={15} />
            </button>
          </div>
        </div>
      )}

      {/* ===== KPIs ===== */}
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
            <div className="fj-kpi-label">Próximos a vencer <span className="mono" style={{ fontSize: 10 }}>(30d)</span></div>
            <div className="fj-kpi-value" style={{ color: 'var(--warn)' }}>{kpis.aVencer30}</div>
            <div className="fj-kpi-delta flat">inspeções e calibrações</div>
          </div>
          <div className="fj-kpi-icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
            <Icone nome="calendar" tam={18} />
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

      {/* ===== COLUNAS (mockup): esquerda = Minha Empresa + Prazos; direita = Agenda + Alertas.
           Cada coluna empilha seus painéis de forma independente — sem buraco quando o
           calendário é mais alto que o card da empresa. ===== */}
      <div className="dash-cols">
        <div className="dash-col">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Empresa executante</div>
              <h2>Minha Empresa</h2>
            </div>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => navigate('/minha-empresa')}>
              <Icone nome="pencil" tam={13} /> Editar dados
            </button>
          </div>
          <div className="minha-emp-body">
            <div className="minha-emp-logo">
              {empresa.logo ? <img src={empresa.logo} alt="Logo da empresa" /> : <Icone nome="briefcase" tam={26} />}
            </div>
            {empresa.razao || empresa.fantasia ? (
              <div className="minha-emp-info">
                <div className="minha-emp-nome">{empresa.razao || empresa.fantasia}</div>
                {empresa.fantasia && empresa.razao && <div className="minha-emp-sub">{empresa.fantasia}</div>}
                <div className="minha-emp-meta">
                  {empresa.cnpj && <span className="mono">CNPJ {empresa.cnpj}</span>}
                  {empresa.cidade && <span>{empresa.cidade}{empresa.estado ? `/${empresa.estado}` : ''}</span>}
                  {empresa.telefone && <span>{empresa.telefone}</span>}
                  {empresa.email && <span>{empresa.email}</span>}
                </div>
                <div className="minha-emp-nota">Estes dados assinam a documentação gerada (relatórios e prontuários).</div>
              </div>
            ) : (
              <div className="minha-emp-info">
                <div className="minha-emp-nome" style={{ color: 'var(--muted)' }}>Dados não preenchidos</div>
                <div className="minha-emp-nota">Preencha os dados e a logo da sua empresa — eles vão para dentro da documentação.</div>
              </div>
            )}
          </div>
        </div>

        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Prazos</div>
              <h2>Equipamentos próximos do vencimento</h2>
            </div>
            {kpis.vencidos > 0 && <span className="fj-badge crit">{kpis.vencidos} vencido{kpis.vencidos > 1 ? 's' : ''}</span>}
          </div>
          {tabela.length === 0 ? (
            <div className="fj-empty">
              <div className="fj-empty-ic"><Icone nome="calendar" tam={22} /></div>
              <div className="fj-empty-title">Nenhum prazo cadastrado</div>
              Calcule a Vida Remanescente na ficha do equipamento ou cadastre calibrações para acompanhar os vencimentos aqui.
            </div>
          ) : (
            <div className="fj-table-wrap">
              <table className="fj-table">
                <thead>
                  <tr><th>Tag</th><th>Origem</th><th>Última</th><th>Vencimento</th><th>Prazo</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {tabela.map((it, i) => (
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
          <div className="fj-panel-foot">
            <button type="button" className="fj-link" onClick={() => setListaExpandida((v) => !v)}>
              {listaExpandida ? 'Recolher lista' : `Ver todos os vencimentos (${comPrazo.length})`}
              <Icone nome={listaExpandida ? 'chevup' : 'chevdown'} tam={13} />
            </button>
          </div>
        </div>
        </div>

        <div className="dash-col">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Agenda</div>
              <h2>Próximas inspeções</h2>
            </div>
            <button type="button" className="fj-btn fj-btn-primary" onClick={() => navigate('/inspecoes')}>
              <Icone nome="plus" tam={14} /> Nova Inspeção
            </button>
          </div>
          <CalendarioVencimentos itens={itens} />
        </div>

        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <div className="fj-eyebrow">Prioridade</div>
              <h2>Alertas críticos</h2>
            </div>
            <button type="button" className="fj-link" onClick={() => navigate('/vencimentos')}>Ver todos</button>
          </div>
          <div className="alist">
            {alertas.length === 0 ? (
              <div className="agenda-vazia" style={{ padding: '16px 0' }}>Nenhum alerta crítico. Tudo em dia.</div>
            ) : (
              alertas.map((it, i) => (
                <div key={`${it.tag}${i}`} className="alist-item" role="button" tabIndex={0} onClick={() => irParaItem(it)} onKeyDown={(e) => e.key === 'Enter' && irParaItem(it)}>
                  <div className="alist-ic" style={{ background: `var(--${it.status}-bg)`, color: `var(--${it.status})` }}>
                    <Icone nome="alerttri" tam={16} />
                  </div>
                  <div className="alist-main">
                    <div className="alist-title">
                      {it.origem === 'calibracao' ? 'Vencimento de calibração' : 'Vencimento de inspeção'}
                    </div>
                    <div className="alist-sub">
                      {it.tag} · {it.tipoEquip}
                      {it.pertenceA ? ` (${it.pertenceA})` : ''}
                    </div>
                  </div>
                  <span className="alist-badge" style={{ background: `var(--${it.status}-bg)`, color: `var(--${it.status})` }}>
                    {it.status === 'crit' ? 'Atrasado' : 'Alta'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
