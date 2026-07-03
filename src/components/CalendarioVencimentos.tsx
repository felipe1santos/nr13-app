import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from './Icone';
import { textoPrazo } from '../services/vencimentos';
import type { ItemVencimento } from '../services/vencimentos';
import './calendario.css';

/**
 * Calendário compacto + agenda + modal de calendário completo (padrão Forja,
 * copiado de design/painel_dashboard.html). Os eventos são os VENCIMENTOS
 * derivados dos dados salvos — não existe agendamento manual (YAGNI).
 */
const DOW_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DOW_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface DiaCal {
  data: Date;
  foraDoMes: boolean;
  eventos: ItemVencimento[];
}

function montarDias(ano: number, mes: number, itens: ItemVencimento[]): DiaCal[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const dias: DiaCal[] = [];
  for (let i = 0; i < 42; i++) {
    const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    dias.push({
      data,
      foraDoMes: data.getMonth() !== mes,
      eventos: itens.filter((it) => it.vencimento && mesmoDia(it.vencimento, data)),
    });
  }
  // remove última semana se toda fora do mês
  if (dias.slice(35).every((d) => d.foraDoMes)) dias.length = 35;
  return dias;
}

export default function CalendarioVencimentos({ itens }: { itens: ItemVencimento[] }) {
  const hoje = new Date();
  const navigate = useNavigate();
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [modalAberto, setModalAberto] = useState(false);

  const dias = useMemo(() => montarDias(ref.getFullYear(), ref.getMonth(), itens), [ref, itens]);
  const rotuloMes = `${MESES[ref.getMonth()]} ${ref.getFullYear()}`;

  const proximos = useMemo(
    () =>
      itens
        .filter((i) => i.vencimento && (i.dias ?? -1) >= 0)
        .slice(0, 5),
    [itens],
  );

  function mudarMes(delta: number) {
    setRef((r) => new Date(r.getFullYear(), r.getMonth() + delta, 1));
  }

  return (
    <>
      <div className="cal-nav-row">
        <button type="button" className="cal-arrow" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
          <Icone nome="chevleft" tam={13} />
        </button>
        <div className="cal-month">{rotuloMes}</div>
        <button type="button" className="cal-arrow" onClick={() => mudarMes(1)} aria-label="Próximo mês">
          <Icone nome="chevright" tam={13} />
        </button>
      </div>

      <div className="cal-body">
        <div className="cal-grid">
          {DOW_MIN.map((d, i) => (
            <div key={`${d}${i}`} className="cal-dow">{d}</div>
          ))}
          {dias.map((d) => {
            const pior = d.eventos.some((e) => e.status === 'crit')
              ? 'crit'
              : d.eventos.some((e) => e.status === 'warn')
                ? 'warn'
                : d.eventos.length > 0
                  ? 'ok'
                  : null;
            return (
              <div
                key={d.data.toISOString()}
                className={`cal-day${d.foraDoMes ? ' muted' : ''}${mesmoDia(d.data, hoje) ? ' today' : ''}`}
                title={d.eventos.map((e) => `${e.tag} · ${e.tipoEquip}`).join('\n') || undefined}
              >
                {d.data.getDate()}
                {(pior || mesmoDia(d.data, hoje)) && <span className={`mk${pior ? ` ${pior}` : ''}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="agenda-list">
        {proximos.length === 0 ? (
          <div className="agenda-vazia">Nenhum vencimento futuro cadastrado.</div>
        ) : (
          proximos.map((it, idx) => (
            <div
              key={`${it.tag}${idx}`}
              className="agenda-item"
              role="button"
              tabIndex={0}
              onClick={() => navigate(it.pertenceA ? `/equipamento/${it.pertenceA}` : `/equipamento/${it.tag}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(it.pertenceA ? `/equipamento/${it.pertenceA}` : `/equipamento/${it.tag}`)}
            >
              <span className="ag-time">
                {it.vencimento!.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
              <span className={`ag-bar ${it.status === 'crit' ? 'crit' : it.status === 'warn' ? 'warn' : 'ok'}`} />
              <div className="ag-main">
                <div className="ag-title">
                  {it.tag} · {it.tipoEquip}
                  {it.pertenceA ? ` (${it.pertenceA})` : ''}
                </div>
                <div className="ag-sub">{textoPrazo(it)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fj-panel-foot">
        <button type="button" className="fj-link" onClick={() => setModalAberto(true)}>
          Expandir calendário completo →
        </button>
      </div>

      {modalAberto && (
        <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalAberto(false)}>
          <div className="fj-modal-box">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Calendário completo</div>
                <h2>{rotuloMes} · Todos os vencimentos</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="cal-arrow" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
                  <Icone nome="chevleft" tam={13} />
                </button>
                <button type="button" className="cal-arrow" onClick={() => mudarMes(1)} aria-label="Próximo mês">
                  <Icone nome="chevright" tam={13} />
                </button>
                <button type="button" className="fj-modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
            </div>
            <div className="modal-cal">
              <div className="modal-grid">
                {DOW_FULL.map((d) => (
                  <div key={d} className="modal-dow">{d}</div>
                ))}
                {dias.map((d) => (
                  <div
                    key={d.data.toISOString()}
                    className={`modal-day${d.foraDoMes ? ' muted' : ''}${mesmoDia(d.data, hoje) ? ' today' : ''}`}
                  >
                    {d.data.getDate()}
                    {d.eventos.map((e, i) => (
                      <div key={`${e.tag}${i}`} className={`modal-ev ${e.status === 'crit' ? 'crit' : e.status === 'warn' ? 'warn' : 'ok'}`}>
                        {e.tag} · vencimento
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="cal-legend">
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--ok)' }} /> Em dia</div>
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--warn)' }} /> Vence em breve</div>
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--crit)' }} /> Vencida / crítica</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
