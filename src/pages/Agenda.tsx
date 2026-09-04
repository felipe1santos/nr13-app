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
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
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
  const [ref, setRef] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [notas, setNotas] = useState<NotaAgenda[]>(() => listarNotas());
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
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
  const doDia = diaAberto ? notas.filter((n) => n.data === diaAberto).sort(ordenar) : [];

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
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    await excluirNota(id);
    setNotas(listarNotas());
  }

  function novo(iso: string) {
    setRascunho({ ...novaNota(iso), tipo: 'inspecao', status: 'agendado' });
  }

  return (
    <div className="agenda-page nr-anim-in">
      {/* ===== FATURAMENTO DO MÊS ===== */}
      <div className="ag-kpis">
        <div className="ag-kpi previsto">
          <div className="ag-kpi-label">Faturamento previsto · {rotuloMes}</div>
          <div className="ag-kpi-valor">{formatarBRL(resumo.previsto)}</div>
          <div className="ag-kpi-sub">
            {resumo.agendados} serviço{resumo.agendados === 1 ? '' : 's'} agendado
            {resumo.agendados === 1 ? '' : 's'}
          </div>
        </div>
        <div className="ag-kpi realizado">
          <div className="ag-kpi-label">Faturamento realizado · {rotuloMes}</div>
          <div className="ag-kpi-valor">{formatarBRL(resumo.realizado)}</div>
          <div className="ag-kpi-sub">
            {resumo.concluidos} serviço{resumo.concluidos === 1 ? '' : 's'} concluído
            {resumo.concluidos === 1 ? '' : 's'}
          </div>
        </div>
        <div className="ag-kpi">
          <div className="ag-kpi-label">Serviços no mês</div>
          <div className="ag-kpi-valor">{resumo.quantidade}</div>
          {/* Valor não informado NÃO é zero: sem esta linha, um mês de serviços
              sem preço digitado passaria por mês sem faturamento. */}
          <div className="ag-kpi-sub">
            {resumo.semValor > 0
              ? `${resumo.semValor} sem valor informado`
              : resumo.cancelados > 0
                ? `${resumo.cancelados} cancelado${resumo.cancelados === 1 ? '' : 's'} (fora das contas)`
                : 'todos com valor informado'}
          </div>
        </div>
      </div>

      {/* ===== CALENDÁRIO ===== */}
      <div className="fj-panel">
        <div className="fj-panel-head">
          <div className="ag-nav">
            <button type="button" className="ag-arrow" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              <Icone nome="chevleft" tam={13} />
            </button>
            <h2 className="ag-mes">{rotuloMes}</h2>
            <button type="button" className="ag-arrow" onClick={() => mudarMes(1)} aria-label="Próximo mês">
              <Icone nome="chevright" tam={13} />
            </button>
            <button
              type="button"
              className="fj-link"
              onClick={() => setRef(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}
            >
              Hoje
            </button>
          </div>
          <button type="button" className="fj-btn fj-btn-primary" onClick={() => novo(dataISO(new Date()))}>
            <Icone nome="plus" tam={14} /> Novo serviço
          </button>
        </div>

        <div className="ag-grid">
          {DOW.map((d) => (
            <div key={d} className="ag-dow">{d}</div>
          ))}
          {dias.map((d) => {
            const extras = d.servicos.length - CHIPS_POR_DIA;
            return (
              <div
                key={d.iso}
                role="button"
                tabIndex={0}
                className={
                  'ag-day'
                  + (d.foraDoMes ? ' fora' : '')
                  + (mesmoDia(d.data, hoje) ? ' hoje' : '')
                  + (diaAberto === d.iso ? ' escolhido' : '')
                }
                onClick={() => setDiaAberto(d.iso)}
                onKeyDown={(e) => e.key === 'Enter' && setDiaAberto(d.iso)}
              >
                {/* Número do dia no canto superior ESQUERDO. O dia escolhido
                    ganha um círculo azul-escuro em volta do número — nunca
                    fundo preto na célula, que apagava os serviços dentro. */}
                <div className="ag-day-top">
                  <span className="ag-day-num">{d.data.getDate()}</span>
                  <button
                    type="button"
                    className="ag-day-add"
                    aria-label={`Novo serviço em ${dataBR(d.iso)}`}
                    title="Novo serviço neste dia"
                    onClick={(e) => {
                      e.stopPropagation();
                      novo(d.iso);
                    }}
                  >
                    <Icone nome="plus" tam={11} />
                  </button>
                </div>
                <div className="ag-day-servs">
                  {d.servicos.slice(0, CHIPS_POR_DIA).map((n) => (
                    <span key={n.id} className={`ag-chip ${statusDe(n)}`} title={n.titulo}>
                      {n.horario ? <b>{n.horario}</b> : null}
                      {n.titulo}
                    </span>
                  ))}
                  {extras > 0 && (
                    <span className="ag-chip mais">+ {extras} serviço{extras === 1 ? '' : 's'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== MODAL DO DIA ===== */}
      {diaAberto && (
        <div
          className="fj-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setDiaAberto(null)}
        >
          <div className="fj-modal-box ag-modal">
            <div className="fj-modal-head">
              <div>
                <div className="fj-eyebrow">Agenda</div>
                <h2>{dataBR(diaAberto)}</h2>
              </div>
              <div className="ag-modal-acoes">
                <button type="button" className="fj-btn fj-btn-primary" onClick={() => novo(diaAberto)}>
                  <Icone nome="plus" tam={14} /> Novo serviço
                </button>
                <button type="button" className="fj-modal-close" onClick={() => setDiaAberto(null)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
            </div>

            <div className="ag-modal-corpo">
              {doDia.length === 0 ? (
                <div className="fj-empty">
                  <div className="fj-empty-ic"><Icone nome="calendar" tam={22} /></div>
                  <div className="fj-empty-title">Nenhum serviço neste dia</div>
                  Use "Novo serviço" para agendar uma inspeção, manutenção ou visita.
                </div>
              ) : (
                doDia.map((n) => (
                  <CartaoServico
                    key={n.id}
                    nota={n}
                    cliente={n.clienteId ? porId.get(n.clienteId) : undefined}
                    onEditar={() => setRascunho(n)}
                    onExcluir={() => void apagar(n.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== FORMULÁRIO ===== */}
      {rascunho && (
        <div
          className="fj-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setRascunho(null)}
        >
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
