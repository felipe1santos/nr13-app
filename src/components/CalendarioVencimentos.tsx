import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icone } from './Icone';
import type { ItemVencimento } from '../services/vencimentos';
import {
  ROTULO_TIPO_NOTA,
  dataISO,
  listarNotas,
  type NotaAgenda,
} from '../features/agenda/notasAgenda';
import './calendario.css';

/**
 * Calendário COMPACTO de vencimentos — o mês com os prazos derivados dos dados
 * salvos (inspeções, calibrações, vida remanescente), mais uma marca nos dias
 * que têm serviço na agenda.
 *
 * Fase 10A · o EDITOR de anotações saiu daqui. Ele nasceu neste componente
 * porque não havia outro lugar; agora há `/agenda`, com empresa, endereço,
 * responsável, telefone, horário, status e valor. Manter os dois seria manter
 * dois formulários para o mesmo dado, e o daqui salvava a metade dos campos —
 * o usuário não teria como saber qual dos dois usar.
 *
 * O que ficou: ver o mês e saber em que dias há compromisso. Clicar leva para a
 * Agenda, que é onde o serviço se lê e se edita por inteiro.
 */
const DOW_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface DiaCal {
  data: Date;
  iso: string;
  foraDoMes: boolean;
  eventos: ItemVencimento[];
  notas: NotaAgenda[];
}

function montarDias(ano: number, mes: number, itens: ItemVencimento[], notas: NotaAgenda[]): DiaCal[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const dias: DiaCal[] = [];
  for (let i = 0; i < 42; i++) {
    const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = dataISO(data);
    dias.push({
      data,
      iso,
      foraDoMes: data.getMonth() !== mes,
      eventos: itens.filter((it) => it.vencimento && mesmoDia(it.vencimento, data)),
      notas: notas.filter((n) => n.data === iso),
    });
  }
  // remove última semana se toda fora do mês
  if (dias.slice(35).every((d) => d.foraDoMes)) dias.length = 35;
  return dias;
}

export default function CalendarioVencimentos({ itens }: { itens: ItemVencimento[] }) {
  const hoje = new Date();
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const notas = useMemo(() => listarNotas(), []);

  const dias = useMemo(
    () => montarDias(ref.getFullYear(), ref.getMonth(), itens, notas),
    [ref, itens, notas],
  );
  const rotuloMes = `${MESES[ref.getMonth()]} ${ref.getFullYear()}`;

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
            const legenda = [
              ...d.eventos.map((e) => `Vence: ${e.tag} · ${e.tipoEquip}`),
              ...d.notas.map((n) => `${ROTULO_TIPO_NOTA[n.tipo]}: ${n.titulo}`),
            ].join('\n');
            return (
              <Link
                key={d.iso}
                to="/agenda"
                className={`cal-day${d.foraDoMes ? ' muted' : ''}${mesmoDia(d.data, hoje) ? ' today' : ''}`}
                title={legenda || 'Abrir a Agenda'}
              >
                {d.data.getDate()}
                <span className="cal-marcas">
                  {pior && <span className={`mk ${pior}`} />}
                  {d.notas.length > 0 && <span className="mk nota" />}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="fj-panel-foot">
        <Link className="fj-link" to="/agenda">Abrir a Agenda →</Link>
      </div>
    </>
  );
}
