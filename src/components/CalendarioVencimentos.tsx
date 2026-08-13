import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icone } from './Icone';
import type { ItemVencimento } from '../services/vencimentos';
import {
  ROTULO_TIPO_NOTA,
  dataISO,
  dataDeISO,
  excluirNota,
  listarNotas,
  novaNota,
  salvarNota,
  separarPorTempo,
  type NotaAgenda,
  type TipoNota,
} from '../features/agenda/notasAgenda';
import './calendario.css';

/**
 * Calendário do Dashboard: vencimentos (derivados dos dados salvos) + as
 * anotações do usuário.
 *
 * A lista de "próximos vencimentos" que ficava embaixo do calendário saiu: era
 * a mesma informação do painel de Prazos ao lado, com outro formato. O espaço
 * agora é do calendário e do caderno de anotações.
 *
 * O modal pode ser controlado de fora (`modo` + `onModo`), para o botão que
 * vive no cabeçalho do painel abrir direto no formulário de anotação. Sem essas
 * props o componente controla o próprio modal, como antes.
 */
const DOW_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DOW_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS: TipoNota[] = ['inspecao', 'manutencao', 'visita', 'lembrete'];

export type ModoAgenda = 'fechado' | 'agenda' | 'nova';

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

function dataBR(iso: string): string {
  return dataDeISO(iso).toLocaleDateString('pt-BR');
}

export default function CalendarioVencimentos({
  itens,
  modo: modoExterno,
  onModo,
}: {
  itens: ItemVencimento[];
  modo?: ModoAgenda;
  onModo?: (m: ModoAgenda) => void;
}) {
  const hoje = new Date();
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [modoInterno, setModoInterno] = useState<ModoAgenda>('fechado');
  const [notas, setNotas] = useState<NotaAgenda[]>(() => listarNotas());
  const [rascunho, setRascunho] = useState<NotaAgenda | null>(null);
  const [salvando, setSalvando] = useState(false);

  const controlado = modoExterno !== undefined && onModo !== undefined;
  const modo = controlado ? modoExterno : modoInterno;
  const definirModo = useCallback(
    (m: ModoAgenda) => (controlado ? onModo(m) : setModoInterno(m)),
    [controlado, onModo],
  );

  // Abrir em "nova" já entrega o formulário preenchido com o dia de hoje.
  useEffect(() => {
    if (modo === 'nova' && !rascunho) setRascunho(novaNota(dataISO(new Date())));
    if (modo === 'fechado' && rascunho) setRascunho(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const dias = useMemo(
    () => montarDias(ref.getFullYear(), ref.getMonth(), itens, notas),
    [ref, itens, notas],
  );
  const rotuloMes = `${MESES[ref.getMonth()]} ${ref.getFullYear()}`;
  const { passadas, futuras } = useMemo(() => separarPorTempo(notas), [notas]);

  function mudarMes(delta: number) {
    setRef((r) => new Date(r.getFullYear(), r.getMonth() + delta, 1));
  }

  async function gravar() {
    if (!rascunho || !rascunho.titulo.trim()) return;
    setSalvando(true);
    try {
      await salvarNota({ ...rascunho, titulo: rascunho.titulo.trim() });
      setNotas(listarNotas());
      setRascunho(null);
      definirModo('agenda');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    await excluirNota(id);
    setNotas(listarNotas());
  }

  function abrirNovaEm(iso: string) {
    setRascunho(novaNota(iso));
    definirModo('agenda');
  }

  const modalAberto = modo !== 'fechado';

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
              <button
                type="button"
                key={d.iso}
                className={`cal-day${d.foraDoMes ? ' muted' : ''}${mesmoDia(d.data, hoje) ? ' today' : ''}`}
                title={legenda || undefined}
                onClick={() => abrirNovaEm(d.iso)}
              >
                {d.data.getDate()}
                <span className="cal-marcas">
                  {pior && <span className={`mk ${pior}`} />}
                  {d.notas.length > 0 && <span className="mk nota" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fj-panel-foot">
        <button type="button" className="fj-link" onClick={() => definirModo('agenda')}>
          Abrir agenda completa →
        </button>
      </div>

      {modalAberto && (
        <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && definirModo('fechado')}>
          <div className="fj-modal-box agenda-modal">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Agenda</div>
                <h2>{rotuloMes}</h2>
              </div>
              <div className="agenda-modal-acoes">
                <button type="button" className="cal-arrow" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
                  <Icone nome="chevleft" tam={13} />
                </button>
                <button type="button" className="cal-arrow" onClick={() => mudarMes(1)} aria-label="Próximo mês">
                  <Icone nome="chevright" tam={13} />
                </button>
                <button
                  type="button"
                  className="fj-btn fj-btn-primary"
                  onClick={() => setRascunho(novaNota(dataISO(new Date())))}
                >
                  <Icone nome="plus" tam={14} /> Nova anotação
                </button>
                <button type="button" className="fj-modal-close" onClick={() => definirModo('fechado')} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
            </div>

            <div className="agenda-corpo">
              <div className="modal-cal">
                <div className="modal-grid">
                  {DOW_FULL.map((d) => (
                    <div key={d} className="modal-dow">{d}</div>
                  ))}
                  {dias.map((d) => (
                    <button
                      type="button"
                      key={d.iso}
                      className={`modal-day${d.foraDoMes ? ' muted' : ''}${mesmoDia(d.data, hoje) ? ' today' : ''}${rascunho?.data === d.iso ? ' escolhido' : ''}`}
                      onClick={() => setRascunho(novaNota(d.iso))}
                      title="Anotar neste dia"
                    >
                      <span className="modal-day-num">{d.data.getDate()}</span>
                      {d.eventos.map((e, i) => (
                        <span key={`${e.tag}${i}`} className={`modal-ev ${e.status === 'crit' ? 'crit' : e.status === 'warn' ? 'warn' : 'ok'}`}>
                          {e.tag} · vence
                        </span>
                      ))}
                      {d.notas.map((n) => (
                        <span key={n.id} className="modal-ev nota">{n.titulo}</span>
                      ))}
                    </button>
                  ))}
                </div>
                <div className="cal-legend">
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--ok)' }} /> Em dia</div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--warn)' }} /> Vence em breve</div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--crit)' }} /> Vencida / crítica</div>
                  <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--blue2)' }} /> Anotação sua</div>
                </div>
              </div>

              <aside className="agenda-lateral">
                {rascunho ? (
                  <form
                    className="agenda-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void gravar();
                    }}
                  >
                    <div className="agenda-form-titulo">Anotação de {dataBR(rascunho.data)}</div>
                    <label>
                      Data
                      <input
                        type="date"
                        value={rascunho.data}
                        onChange={(e) => setRascunho({ ...rascunho, data: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Título
                      <input
                        autoFocus
                        value={rascunho.titulo}
                        onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                        placeholder="Ex.: próxima inspeção da autoclave"
                        required
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={rascunho.tipo}
                        onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value as TipoNota })}
                      >
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>{ROTULO_TIPO_NOTA[t]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Equipamento (opcional)
                      <input
                        value={rascunho.tag ?? ''}
                        onChange={(e) => setRascunho({ ...rascunho, tag: e.target.value || undefined })}
                        placeholder="TAG"
                      />
                    </label>
                    <label>
                      Observações
                      <textarea
                        rows={3}
                        value={rascunho.descricao ?? ''}
                        onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value || undefined })}
                      />
                    </label>
                    <div className="agenda-form-acoes">
                      <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setRascunho(null)}>
                        Cancelar
                      </button>
                      <button type="submit" className="fj-btn fj-btn-primary" disabled={salvando || !rascunho.titulo.trim()}>
                        {salvando ? 'Salvando…' : 'Salvar anotação'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="agenda-dica">
                    Clique em um dia do calendário para anotar nele.
                  </div>
                )}

                <div className="agenda-secao">
                  <h3>Próximas ({futuras.length})</h3>
                  {futuras.length === 0 ? (
                    <p className="agenda-vazia">Nada anotado daqui para frente.</p>
                  ) : (
                    futuras.map((n) => (
                      <NotaLinha key={n.id} nota={n} onEditar={setRascunho} onExcluir={apagar} />
                    ))
                  )}
                </div>

                <div className="agenda-secao">
                  <h3>Já passaram ({passadas.length})</h3>
                  {passadas.length === 0 ? (
                    <p className="agenda-vazia">Nenhuma anotação anterior.</p>
                  ) : (
                    passadas.map((n) => (
                      <NotaLinha key={n.id} nota={n} passada onEditar={setRascunho} onExcluir={apagar} />
                    ))
                  )}
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NotaLinha({
  nota,
  passada,
  onEditar,
  onExcluir,
}: {
  nota: NotaAgenda;
  passada?: boolean;
  onEditar: (n: NotaAgenda) => void;
  onExcluir: (id: string) => void;
}) {
  return (
    <div className={`agenda-nota${passada ? ' passada' : ''}`}>
      <span className="agenda-nota-data">{dataBR(nota.data)}</span>
      <div className="agenda-nota-corpo">
        <div className="agenda-nota-titulo">{nota.titulo}</div>
        <div className="agenda-nota-meta">
          {ROTULO_TIPO_NOTA[nota.tipo]}
          {nota.tag ? ` · ${nota.tag}` : ''}
        </div>
        {nota.descricao && <div className="agenda-nota-desc">{nota.descricao}</div>}
      </div>
      <div className="agenda-nota-btns">
        <button type="button" title="Editar" aria-label="Editar anotação" onClick={() => onEditar(nota)}>
          <Icone nome="pencil" tam={13} />
        </button>
        <button type="button" title="Excluir" aria-label="Excluir anotação" onClick={() => onExcluir(nota.id)}>
          <Icone nome="trash" tam={13} />
        </button>
      </div>
    </div>
  );
}
