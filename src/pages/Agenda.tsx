import { useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import { listarClientes } from '../features/cadastros/cadastroService';
import type { Cliente } from '../features/cadastros/tipos';
import {
  ROTULO_STATUS,
  ROTULO_TIPO_NOTA,
  dataDeISO,
  dataISO,
  excluirNota,
  listarNotas,
  novaNota,
  salvarNota,
  statusDe,
  type NotaAgenda,
  type StatusNota,
  type TipoNota,
} from '../features/agenda/notasAgenda';
import { formatarBRL, resumoDoMes, textoValor } from '../features/agenda/faturamento';
import './agenda.css';

/**
 * Agenda — tela própria (Fase 10A).
 *
 * Antes o calendário morava dentro de um painel do Dashboard, com metade da
 * largura: cabia o número do dia e uma bolinha, e mais nada. Serviço agendado
 * tem empresa, endereço, responsável, telefone, horário, status e valor — nada
 * disso cabia ali, e por isso continuava no papel.
 *
 * O que a tela NÃO faz: não copia dados do cliente. A nota guarda `clienteId`,
 * e empresa/endereço/responsável/telefone são resolvidos na hora de exibir, do
 * cadastro de clientes. Copiar criaria um segundo lugar para a mesma verdade.
 */
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const TIPOS: TipoNota[] = ['inspecao', 'manutencao', 'visita', 'lembrete'];
const STATUS: StatusNota[] = ['agendado', 'concluido', 'cancelado'];

/** Visão da agenda (padrão SimplesDental: Semana é a de abertura). */
type Visao = 'dia' | 'semana' | 'mes';
/** Faixa de horas da grade. Serviço fora dela encosta na borda, não some. */
const HORAS = Array.from({ length: 15 }, (_, i) => 6 + i); // 06h…20h
const HORA_PX = 64;

/** Topo e altura do bloco: o serviço não tem duração gravada — ocupa 1 hora. */
function posicaoEvento(hhmm: string): { top: number; altura: number } {
  const [h, m] = hhmm.split(':').map(Number);
  const horas = Math.min(Math.max((h || 0) + (m || 0) / 60 - HORAS[0], 0), HORAS.length - 1);
  return { top: horas * HORA_PX + 1, altura: HORA_PX - 4 };
}

/** Status concluído/cancelado manda sobre a cor do tipo. */
function classeEvento(n: NotaAgenda): string {
  const st = statusDe(n);
  return st === 'agendado' ? n.tipo : st;
}

/** Quantos serviços aparecem dentro da célula antes do "+ N serviços". */
const CHIPS_POR_DIA = 2;

interface DiaCal {
  data: Date;
  iso: string;
  foraDoMes: boolean;
  servicos: NotaAgenda[];
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Horário primeiro, depois título — o dia se lê de cima para baixo. */
function ordenar(a: NotaAgenda, b: NotaAgenda): number {
  const ha = a.horario ?? '99:99';
  const hb = b.horario ?? '99:99';
  return ha === hb ? a.titulo.localeCompare(b.titulo) : ha.localeCompare(hb);
}

function montarDias(ano: number, mes: number, notas: NotaAgenda[]): DiaCal[] {
  const primeiro = new Date(ano, mes, 1);
  // Cobalto: a semana começa na SEGUNDA (padrão SimplesDental).
  const inicio = new Date(ano, mes, 1 - ((primeiro.getDay() + 6) % 7));
  const dias: DiaCal[] = [];
  for (let i = 0; i < 42; i++) {
    const data = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const iso = dataISO(data);
    dias.push({
      data,
      iso,
      foraDoMes: data.getMonth() !== mes,
      servicos: notas.filter((n) => n.data === iso).sort(ordenar),
    });
  }
  if (dias.slice(35).every((d) => d.foraDoMes)) dias.length = 35;
  return dias;
}

function dataBR(iso: string): string {
  return dataDeISO(iso).toLocaleDateString('pt-BR');
}

function nomeCliente(c: Cliente): string {
  return c.nomeFantasia?.trim() || c.razaoSocial?.trim() || '(cliente sem nome)';
}

function enderecoCliente(c: Cliente): string {
  const linha1 = [c.endereco, c.bairro].filter(Boolean).join(', ');
  const linha2 = [c.cidade, c.estado].filter(Boolean).join(' / ');
  return [linha1, linha2, c.cep].filter(Boolean).join(' · ');
}

export default function Agenda() {
  const hoje = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const [visao, setVisao] = useState<Visao>('semana');
  const ref = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const [notas, setNotas] = useState<NotaAgenda[]>(() => listarNotas());
  const [notaAberta, setNotaAberta] = useState<string | null>(null);
  const [legendaAberta, setLegendaAberta] = useState(false);
  const [rascunho, setRascunho] = useState<NotaAgenda | null>(null);
  const [salvando, setSalvando] = useState(false);

  const clientes = useMemo(() => listarClientes(), []);
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const dias = useMemo(() => montarDias(ref.getFullYear(), ref.getMonth(), notas), [ref, notas]);
  const resumo = useMemo(
    () => resumoDoMes(notas, ref.getFullYear(), ref.getMonth()),
    [notas, ref],
  );
  const rotuloMes = `${MESES[ref.getMonth()]} ${ref.getFullYear()}`;
  const notaVista = notaAberta ? notas.find((n) => n.id === notaAberta) ?? null : null;

  // Colunas da grade: os 7 dias da semana do cursor (domingo a sábado) ou só o dia.
  const colunas = useMemo(() => {
    const base = visao === 'dia'
      ? [cursor]
      : Array.from({ length: 7 }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - ((cursor.getDay() + 6) % 7) + i));
    return base.map((data) => {
      const iso = dataISO(data);
      const doDia = notas.filter((n) => n.data === iso).sort(ordenar);
      return { data, iso, semHora: doDia.filter((n) => !n.horario), comHora: doDia.filter((n) => n.horario) };
    });
  }, [cursor, visao, notas]);

  // Linha do "agora" (só no dia de hoje, dentro da faixa de horas).
  const agoraH = hoje.getHours() + hoje.getMinutes() / 60;
  const agoraTop = agoraH >= HORAS[0] && agoraH <= HORAS[HORAS.length - 1] + 1 ? (agoraH - HORAS[0]) * HORA_PX : null;

  function andar(delta: number) {
    setCursor((c) =>
      visao === 'mes'
        ? new Date(c.getFullYear(), c.getMonth() + delta, 1)
        : new Date(c.getFullYear(), c.getMonth(), c.getDate() + delta * (visao === 'dia' ? 1 : 7)),
    );
  }

  async function gravar() {
    if (!rascunho || !rascunho.titulo.trim()) return;
    setSalvando(true);
    try {
      await salvarNota({ ...rascunho, titulo: rascunho.titulo.trim() });
      setNotas(listarNotas());
      setRascunho(null);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    await excluirNota(id);
    setNotas(listarNotas());
  }

  function novo(iso: string, horario?: string) {
    setRascunho({ ...novaNota(iso), tipo: 'inspecao', status: 'agendado', ...(horario ? { horario } : {}) });
  }

  return (
    <div className="agenda-page ag2 nr-anim-in">
      {/* ===== BARRA (padrão SimplesDental, uma linha) =====
          Faturamento do mês à esquerda; navegação, mês e visão à direita. */}
      <div className="ag2-barra">
        <div className="ag2-chip" aria-label={`Faturamento de ${rotuloMes}`} title={`Faturamento de ${rotuloMes}`}>
          <span className="av">R$</span>
          <span className="k prev">
            <span>Previsto</span>
            <b>{formatarBRL(resumo.previsto)}</b>
          </span>
          <span className="k real">
            <span>Realizado</span>
            <b>{formatarBRL(resumo.realizado)}</b>
          </span>
          <span className="k" title={
            resumo.semValor > 0
              ? `${resumo.semValor} sem valor informado`
              : resumo.cancelados > 0
                ? `${resumo.cancelados} cancelado${resumo.cancelados === 1 ? '' : 's'} (fora das contas)`
                : 'todos com valor informado'
          }>
            <span>Serviços</span>
            <b>{resumo.quantidade}</b>
            {/* Valor não informado NÃO é zero: sem este aviso, um mês de
                serviços sem preço digitado passaria por mês sem faturamento. */}
            {resumo.semValor > 0 && <em className="ag2-semvalor">{resumo.semValor} sem valor</em>}
          </span>
        </div>
        <span className="grow" />
        <button type="button" className="ag2-hoje" onClick={() => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))}>
          HOJE
        </button>
        <button type="button" className="ag2-seta" onClick={() => andar(-1)} aria-label={visao === 'mes' ? 'Mês anterior' : visao === 'dia' ? 'Dia anterior' : 'Semana anterior'}>
          <Icone nome="chevleft" tam={20} />
        </button>
        <button type="button" className="ag2-seta" onClick={() => andar(1)} aria-label={visao === 'mes' ? 'Próximo mês' : visao === 'dia' ? 'Próximo dia' : 'Próxima semana'}>
          <Icone nome="chevright" tam={20} />
        </button>
        <label className="ag2-data" title="Escolher mês">
          <span>{rotuloMes}</span>
          <Icone nome="calendar" tam={17} />
          <input
            type="month"
            aria-label="Escolher mês"
            value={`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`}
            onChange={(e) => {
              const [a, m] = e.target.value.split('-').map(Number);
              if (a && m) setCursor(new Date(a, m - 1, 1));
            }}
          />
        </label>
        <label className="ag2-select">
          <span className="sr-only">Visualização</span>
          <select value={visao} onChange={(e) => setVisao(e.target.value as Visao)} aria-label="Visualização">
            <option value="semana">Semana</option>
            <option value="dia">Dia</option>
            <option value="mes">Mês</option>
          </select>
          <Icone nome="chevdown" tam={16} />
        </label>
        <div className="ag2-pos">
          <button
            type="button"
            className="ag2-tool"
            aria-expanded={legendaAberta}
            onClick={() => setLegendaAberta((v) => !v)}
            title="Legenda de cores"
            aria-label="Legenda de cores"
          >
            <Icone nome="palette" tam={19} />
          </button>
          {legendaAberta && (
            <div className="ag2-pop" role="dialog" aria-label="Legenda de cores">
              <h4>Tipo</h4>
              <ul className="ag2-legenda">
                {TIPOS.map((t) => (
                  <li key={t}><i className={`ag2-ev ${t}`} />{ROTULO_TIPO_NOTA[t]}</li>
                ))}
              </ul>
              <h4>Status</h4>
              <ul className="ag2-legenda">
                <li><i className="ag2-ev concluido" />Concluído</li>
                <li><i className="ag2-ev cancelado" /><s>Cancelado</s></li>
              </ul>
            </div>
          )}
        </div>
      </div>


      {visao === 'mes' ? (
        /* ===== MÊS ===== */
        <div className="ag2-mes">
          <button type="button" className="ag2-novo ag2-novo-mes" onClick={() => novo(dataISO(cursor))} aria-label="Novo serviço" title="Novo serviço">
            <Icone nome="plus" tam={22} />
          </button>
          {[...DOW.slice(1), DOW[0]].map((d) => (
            <div key={d} className="ag2-mes-dow">{d}</div>
          ))}
          {dias.map((d) => {
            const extras = d.servicos.length - CHIPS_POR_DIA;
            return (
              <div
                key={d.iso}
                role="button"
                tabIndex={0}
                className={'ag2-mes-dia' + (d.foraDoMes ? ' fora' : '') + (mesmoDia(d.data, hoje) ? ' hoje' : '')}
                onClick={() => {
                  setCursor(d.data);
                  setVisao('dia');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCursor(d.data);
                    setVisao('dia');
                  }
                }}
                aria-label={`${dataBR(d.iso)} · ${d.servicos.length} serviço${d.servicos.length === 1 ? '' : 's'}`}
              >
                <span className="ag2-mes-num">{d.data.getDate()}</span>
                <div className="ag2-mes-servs">
                  {d.servicos.slice(0, CHIPS_POR_DIA).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`ag2-ev ${classeEvento(n)}`}
                      title={n.titulo}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotaAberta(n.id);
                      }}
                    >
                      {n.horario ? <b>{n.horario}</b> : null} {n.titulo}
                    </button>
                  ))}
                  {extras > 0 && <span className="ag2-mais">+ {extras} serviço{extras === 1 ? '' : 's'}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== SEMANA / DIA: grade de horários ===== */
        <div className="ag2-wrap">
          <div className="ag2-tg" style={{ '--cols': colunas.length } as React.CSSProperties}>
            <div className="ag2-row ag2-head">
              <div className="ag2-canto">
                <button type="button" className="ag2-novo" onClick={() => novo(dataISO(cursor))} aria-label="Novo serviço" title="Novo serviço">
                  <Icone nome="plus" tam={22} />
                </button>
                <small>Dia inteiro</small>
              </div>
              {colunas.map((c) => (
                <button
                  key={c.iso}
                  type="button"
                  className={`ag2-dh${mesmoDia(c.data, hoje) ? ' hoje' : ''}`}
                  onClick={() => {
                    setCursor(c.data);
                    setVisao('dia');
                  }}
                  title="Ver o dia"
                >
                  <span className="w">{DOW[c.data.getDay()]}.</span>
                  <span className="n">
                    {c.data.getDate()}
                    <small>/{String(c.data.getMonth() + 1).padStart(2, '0')}</small>
                  </span>
                </button>
              ))}
            </div>
            {/* Serviço sem horário mora na faixa "Dia inteiro", como no
                SimplesDental — não se inventa hora para ele. */}
            <div className="ag2-row">
              <div className="ag2-gut-ad" />
              {colunas.map((c) => (
                <div key={c.iso} className={`ag2-ad${mesmoDia(c.data, hoje) ? ' hoje' : ''}`}>
                  {c.semHora.map((n) => (
                    <button key={n.id} type="button" className={`ag2-ev ${classeEvento(n)}`} title={n.titulo} onClick={() => setNotaAberta(n.id)}>
                      {n.titulo}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="ag2-row ag2-corpo">
              <div className="ag2-gut">
                {HORAS.map((h) => (
                  <div key={h} className="ag2-lbl">{String(h).padStart(2, '0')}h00</div>
                ))}
              </div>
              {colunas.map((c) => (
                <div key={c.iso} className={`ag2-col${mesmoDia(c.data, hoje) ? ' hoje' : ''}`}>
                  {HORAS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="ag2-slot"
                      aria-label={`Novo serviço em ${dataBR(c.iso)} às ${String(h).padStart(2, '0')}h`}
                      onClick={() => novo(c.iso, `${String(h).padStart(2, '0')}:00`)}
                    />
                  ))}
                  {c.comHora.map((n) => {
                    const pos = posicaoEvento(n.horario!);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className={`ag2-ev ag2-ev-bloco ${classeEvento(n)}`}
                        style={{ top: pos.top, height: pos.altura }}
                        title={n.titulo}
                        onClick={() => setNotaAberta(n.id)}
                      >
                        <b>{statusDe(n) === 'concluido' ? '✓ ' : ''}{n.titulo}</b>
                        <small>
                          {n.horario}
                          {n.clienteId && porId.get(n.clienteId) ? ` · ${nomeCliente(porId.get(n.clienteId)!)}` : ''}
                        </small>
                      </button>
                    );
                  })}
                  {mesmoDia(c.data, hoje) && agoraTop !== null && <div className="ag2-agora" style={{ top: agoraTop }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== SERVIÇO ABERTO (leitura) =====
          Clicar num serviço MOSTRA o que foi salvo; editar só em "Editar". */}
      {notaVista && (
        // fecha-pelo-fundo: é LEITURA — nada digitado se perde; editar abre o formulário, que não fecha pelo fundo.
        <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setNotaAberta(null)}>
          <div className="fj-modal-box ag-modal">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Serviço agendado</div>
                <h2>{dataBR(notaVista.data)}</h2>
              </div>
              <button type="button" className="fj-modal-close" onClick={() => setNotaAberta(null)} aria-label="Fechar">
                <Icone nome="x" tam={15} />
              </button>
            </div>
            <div className="ag-modal-corpo">
              <CartaoServico
                nota={notaVista}
                cliente={notaVista.clienteId ? porId.get(notaVista.clienteId) : undefined}
                onEditar={() => {
                  setNotaAberta(null);
                  setRascunho(notaVista);
                }}
                onExcluir={() => {
                  setNotaAberta(null);
                  void apagar(notaVista.id);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== FORMULÁRIO ===== */}
      {rascunho && (
        // O fundo NÃO fecha: é o formulário do serviço, digitado. Ver
        // `modaisComEdicao.test.ts`.
        <div className="fj-modal-overlay">
          <div className="fj-modal-box ag-form-box">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Serviço</div>
                <h2>{dataBR(rascunho.data)}</h2>
              </div>
              <button type="button" className="fj-modal-close" onClick={() => setRascunho(null)} aria-label="Fechar">
                <Icone nome="x" tam={15} />
              </button>
            </div>

            <form
              className="ag-form"
              onSubmit={(e) => {
                e.preventDefault();
                void gravar();
              }}
            >
              <label className="col2">
                Título do serviço
                <input
                  autoFocus
                  value={rascunho.titulo}
                  onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                  placeholder="Ex.: inspeção periódica da caldeira"
                  required
                />
              </label>
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
                Horário
                <input
                  type="time"
                  value={rascunho.horario ?? ''}
                  onChange={(e) => setRascunho({ ...rascunho, horario: e.target.value || undefined })}
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
                Status
                <select
                  value={statusDe(rascunho)}
                  onChange={(e) => setRascunho({ ...rascunho, status: e.target.value as StatusNota })}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
                  ))}
                </select>
              </label>
              <label className="col2">
                Empresa / cliente
                {/* Só a REFERÊNCIA. Endereço, responsável e telefone vêm do
                    cadastro na hora de exibir — não são copiados para cá. */}
                <select
                  value={rascunho.clienteId ?? ''}
                  onChange={(e) => setRascunho({ ...rascunho, clienteId: e.target.value || undefined })}
                >
                  <option value="">— sem cliente vinculado —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{nomeCliente(c)}</option>
                  ))}
                </select>
              </label>
              <label>
                Equipamento (TAG)
                <input
                  value={rascunho.tag ?? ''}
                  onChange={(e) => setRascunho({ ...rascunho, tag: e.target.value || undefined })}
                  placeholder="opcional"
                />
              </label>
              <label>
                Valor do serviço (R$)
                {/* Campo vazio grava `undefined`, não 0: "não informado" e
                    "custa zero" são coisas diferentes no faturamento. */}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rascunho.valor ?? ''}
                  onChange={(e) =>
                    setRascunho({
                      ...rascunho,
                      valor: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  placeholder="opcional"
                />
              </label>
              <label className="col2">
                Observações
                <textarea
                  rows={3}
                  value={rascunho.descricao ?? ''}
                  onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value || undefined })}
                />
              </label>

              <div className="ag-form-acoes">
                <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setRascunho(null)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="fj-btn fj-btn-primary"
                  disabled={salvando || !rascunho.titulo.trim()}
                >
                  {salvando ? 'Salvando…' : 'Salvar serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CartaoServico({
  nota,
  cliente,
  onEditar,
  onExcluir,
}: {
  nota: NotaAgenda;
  cliente?: Cliente;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const st = statusDe(nota);
  return (
    <div className={`ag-serv ${st}`}>
      <div className="ag-serv-head">
        <div>
          <div className="ag-serv-titulo">
            {nota.horario && <span className="ag-serv-hora">{nota.horario}</span>}
            {nota.titulo}
          </div>
          <div className="ag-serv-meta">
            <span className="fj-badge info2">{ROTULO_TIPO_NOTA[nota.tipo]}</span>
            <span className={`fj-badge ${st === 'concluido' ? 'ok' : st === 'cancelado' ? 'neutro' : 'info'}`}>
              {ROTULO_STATUS[st]}
            </span>
            {nota.tag && <span className="fj-badge neutro mono">{nota.tag}</span>}
          </div>
        </div>
        <div className="ag-serv-valor">
          <div className="ag-serv-valor-num">{textoValor(nota.valor)}</div>
          <div className="ag-serv-valor-rot">
            {st === 'concluido' ? 'realizado' : st === 'cancelado' ? 'não contabilizado' : 'previsto'}
          </div>
        </div>
      </div>

      <dl className="ag-serv-dados">
        <div>
          <dt><Icone nome="building" tam={12} /> Empresa</dt>
          <dd>{cliente ? nomeCliente(cliente) : <span className="fj-dash">—</span>}</dd>
        </div>
        <div>
          <dt><Icone nome="map" tam={12} /> Endereço</dt>
          <dd>{cliente && enderecoCliente(cliente) ? enderecoCliente(cliente) : <span className="fj-dash">—</span>}</dd>
        </div>
        <div>
          <dt><Icone nome="users" tam={12} /> Responsável</dt>
          <dd>{cliente?.contato || <span className="fj-dash">—</span>}</dd>
        </div>
        <div>
          <dt><Icone nome="bell" tam={12} /> Telefone</dt>
          <dd>{cliente?.telefone || <span className="fj-dash">—</span>}</dd>
        </div>
      </dl>

      {nota.descricao && <div className="ag-serv-obs">{nota.descricao}</div>}

      <div className="ag-serv-btns">
        <button type="button" onClick={onEditar}>
          <Icone nome="pencil" tam={12} /> Editar
        </button>
        <button type="button" className="perigo" onClick={onExcluir}>
          <Icone nome="trash" tam={12} /> Excluir
        </button>
      </div>
    </div>
  );
}
