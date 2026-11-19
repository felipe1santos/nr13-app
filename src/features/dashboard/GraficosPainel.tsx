import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from '../../components/Icone';
import { dataDeISO, dataISO, statusDe, type NotaAgenda } from '../agenda/notasAgenda';
import { formatarBRL } from '../agenda/faturamento';
import type { ItemVencimento } from '../../services/vencimentos';
import './graficosPainel.css';

/**
 * Os três cartões de gráfico do Dashboard (redesign Cobalto, protótipo
 * docs/design/prototipo-cobalto): Realizado no mês, Vencimentos por mês e o
 * convite do Portal do Cliente.
 *
 * SÓ LEITURA, das mesmas fontes que a tela já usa: as notas da Agenda (valor e
 * situação de cada serviço) e os itens do painel de vencimentos. Nenhum dado é
 * estimado: dia sem serviço soma zero, serviço sem valor não entra na conta
 * (e o cartão diz quantos são), vencimento sem data não entra no gráfico.
 */

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Paleta validada (dataviz/validate_palette.js): ordem fixa, cor segue a origem. */
const COR_ORIGEM: Record<ItemVencimento['origem'], string> = {
  inspecao: '#2F5BEA',
  calibracao: '#C2410C',
  certificado: '#0D9488',
};
const ROTULO_ORIGEM: Record<ItemVencimento['origem'], string> = {
  inspecao: 'Inspeções',
  calibracao: 'Calibrações',
  certificado: 'Certificados',
};
const ORIGENS: ItemVencimento['origem'][] = ['inspecao', 'calibracao', 'certificado'];

function brlCurto(v: number): string {
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatarBRL(v);
}

/* ───────────────────────── Realizado no mês ───────────────────────── */

export function CartaoRealizadoMes({ notas }: { notas: NotaAgenda[] }) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hojeIso = dataISO(hoje);
  const [diaHover, setDiaHover] = useState<number | null>(null);

  const dados = useMemo(() => {
    const prefixo = `${ano}-${String(mes + 1).padStart(2, '0')}`;
    const doMes = notas.filter((n) => n.data.startsWith(prefixo) && statusDe(n) !== 'cancelado');
    const realizadoDia = new Array(diasNoMes + 1).fill(0);
    const previstoDia = new Array(diasNoMes + 1).fill(0);
    let semValor = 0;
    let realizadoHoje = 0;
    let servicosHoje = 0;
    for (const n of doMes) {
      const d = dataDeISO(n.data).getDate();
      if (n.data === hojeIso) servicosHoje++;
      if (typeof n.valor !== 'number' || !Number.isFinite(n.valor)) {
        semValor++;
        continue;
      }
      previstoDia[d] += n.valor;
      if (statusDe(n) === 'concluido') {
        realizadoDia[d] += n.valor;
        if (n.data === hojeIso) realizadoHoje += n.valor;
      }
    }
    const acumR: number[] = [];
    const acumP: number[] = [];
    let r = 0;
    let p = 0;
    for (let d = 1; d <= diasNoMes; d++) {
      r += realizadoDia[d];
      p += previstoDia[d];
      acumR.push(r);
      acumP.push(p);
    }
    return { acumR, acumP, total: p, realizado: r, semValor, realizadoHoje, servicosHoje };
  }, [notas, ano, mes, diasNoMes, hojeIso]);

  const diaHoje = hoje.getDate();
  const pct = dados.total > 0 ? Math.round((dados.realizado / dados.total) * 100) : 0;
  const falta = Math.max(0, dados.total - dados.realizado);

  // Geometria do gráfico (viewBox; o SVG estica na largura do cartão).
  const W = 800;
  const H = 200;
  const M = { l: 64, r: 12, t: 10, b: 26 };
  const maxY = Math.max(1, ...dados.acumP) * 1.1;
  const passo = maxY / 4;
  const x = (d: number) => M.l + ((d - 1) / Math.max(1, diasNoMes - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / maxY) * (H - M.t - M.b);
  const caminho = (serie: number[], ate: number) =>
    serie.slice(0, ate).map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaR = `${caminho(dados.acumR, diaHoje)} L${x(diaHoje).toFixed(1)},${y(0)} L${x(1)},${y(0)} Z`;

  return (
    <section className="fj-panel dash2-card gp-card" aria-labelledby="gp-real-tit">
      <div className="dash2-card-hd">
        <h2 id="gp-real-tit">Realizado no mês</h2>
      </div>
      <div className="gp-stats">
        <div className="gp-stat gp-stat-largo">
          <div className="gp-stat-top">
            <span>Previsto do mês</span>
            <b>{pct}%</b>
          </div>
          <div className="gp-trilho" role="img" aria-label={`${pct}% do previsto já realizado`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <small>
            {formatarBRL(dados.realizado)} realizados de {formatarBRL(dados.total)}
          </small>
        </div>
        <div className="gp-stat">
          <span><Icone nome="calendar" tam={14} /> Falta realizar</span>
          <b>{formatarBRL(falta)}</b>
          <small>{diasNoMes - diaHoje} dias restantes</small>
        </div>
        <div className="gp-stat">
          <span><Icone nome="check" tam={14} /> Realizado hoje</span>
          <b>{formatarBRL(dados.realizadoHoje)}</b>
          <small>
            {dados.servicosHoje} serviço{dados.servicosHoje === 1 ? '' : 's'} hoje
          </small>
        </div>
      </div>
      {dados.semValor > 0 && (
        <p className="gp-aviso">
          {dados.semValor} serviço{dados.semValor === 1 ? '' : 's'} sem valor informado — fora destas contas.
        </p>
      )}
      {dados.total === 0 ? (
        <div className="gp-vazio">
          <Icone nome="calendar" tam={22} />
          <b>Nenhum serviço com valor neste mês</b>
          <span>Agende serviços com valor na Agenda para acompanhar o realizado aqui.</span>
        </div>
      ) : (
      <>
      <div className="gp-grafico" onMouseLeave={() => setDiaHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Realizado e previsto acumulados por dia do mês">
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line x1={M.l} x2={W - M.r} y1={y(k * passo)} y2={y(k * passo)} className="gp-grade" />
              <text x={M.l - 8} y={y(k * passo) + 4} className="gp-eixo" textAnchor="end">{brlCurto(k * passo)}</text>
            </g>
          ))}
          {Array.from({ length: diasNoMes }, (_, i) => i + 1)
            .filter((d) => d % 2 === 1 || d === diasNoMes)
            .map((d) => (
              <text key={d} x={x(d)} y={H - 6} className={`gp-eixo${d === diaHoje ? ' gp-hoje' : ''}`} textAnchor="middle">{d}</text>
            ))}
          <path d={caminho(dados.acumP, diasNoMes)} className="gp-linha-prev" />
          <path d={areaR} className="gp-area-real" />
          <path d={caminho(dados.acumR, diaHoje)} className="gp-linha-real" />
          <circle cx={x(diaHoje)} cy={y(dados.acumR[diaHoje - 1] ?? 0)} r={5} className="gp-ponto" />
          {diaHover !== null && (
            <line x1={x(diaHover)} x2={x(diaHover)} y1={M.t} y2={H - M.b} className="gp-cruz" />
          )}
          {/* Alvos de hover: uma faixa por dia, maior que a marca. */}
          {Array.from({ length: diasNoMes }, (_, i) => i + 1).map((d) => (
            <rect
              key={d}
              x={x(d) - (W - M.l - M.r) / diasNoMes / 2}
              y={M.t}
              width={(W - M.l - M.r) / diasNoMes}
              height={H - M.t - M.b}
              fill="transparent"
              onMouseEnter={() => setDiaHover(d)}
            />
          ))}
        </svg>
        {diaHover !== null && (
          <div className="gp-tooltip" style={{ left: `${(x(diaHover) / W) * 100}%` }}>
            <b>Dia {diaHover}</b>
            <span><i className="real" /> Realizado {diaHover <= diaHoje ? formatarBRL(dados.acumR[diaHover - 1]) : '—'}</span>
            <span><i className="prev" /> Previsto {formatarBRL(dados.acumP[diaHover - 1])}</span>
          </div>
        )}
      </div>
      <ul className="gp-legenda">
        <li><i className="real" /> Realizado acumulado</li>
        <li><i className="prev" /> Previsto acumulado</li>
      </ul>
      </>
      )}
    </section>
  );
}

/* ───────────────────────── Vencimentos por mês ───────────────────────── */

export function CartaoVencimentosMes({
  itens,
  conformidade,
}: {
  itens: ItemVencimento[];
  conformidade: number | undefined;
}) {
  const anos = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()]);
    for (const i of itens) if (i.vencimento) s.add(i.vencimento.getFullYear());
    return [...s].sort((a, b) => a - b);
  }, [itens]);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [hover, setHover] = useState<number | null>(null);

  const porMes = useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ inspecao: 0, calibracao: 0, certificado: 0 }));
    for (const i of itens) {
      if (!i.vencimento || i.vencimento.getFullYear() !== ano) continue;
      m[i.vencimento.getMonth()][i.origem]++;
    }
    return m;
  }, [itens, ano]);
  const totais = ORIGENS.map((o) => porMes.reduce((s, m) => s + m[o], 0));
  const maxMes = Math.max(1, ...porMes.map((m) => m.inspecao + m.calibracao + m.certificado));
  const mesAtual = new Date().getFullYear() === ano ? new Date().getMonth() : -1;

  const H = 170;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const conf = conformidade === undefined ? null : Math.max(0, Math.min(100, conformidade));

  return (
    <section className="fj-panel dash2-card gp-card" aria-labelledby="gp-venc-tit">
      <div className="dash2-card-hd">
        <h2 id="gp-venc-tit">Vencimentos por mês</h2>
        <label className="ag2-select">
          <span className="sr-only">Ano</span>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
            {anos.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Icone nome="chevdown" tam={16} />
        </label>
      </div>
      <div className="gp-venc">
        <dl className="gp-venc-tot">
          {ORIGENS.map((o, k) => (
            <div key={o}>
              <dd>{totais[k]}</dd>
              <dt>{ROTULO_ORIGEM[o]} no ano</dt>
            </div>
          ))}
        </dl>
        <div className="gp-barras" onMouseLeave={() => setHover(null)} role="img" aria-label={`Vencimentos por mês em ${ano}`}>
          {porMes.map((m, i) => {
            const total = m.inspecao + m.calibracao + m.certificado;
            return (
              <div key={i} className={`gp-col${i === mesAtual ? ' atual' : ''}`} onMouseEnter={() => setHover(i)}>
                <div className="gp-pilha" style={{ height: H }}>
                  <div className="gp-fundo" />
                  {total > 0 && (
                    <div className="gp-segs" style={{ height: `${(total / maxMes) * 100}%` }}>
                      <span className="gp-n">{total}</span>
                      {ORIGENS.filter((o) => m[o] > 0).map((o) => (
                        <i key={o} style={{ flexGrow: m[o], background: COR_ORIGEM[o] }} />
                      ))}
                    </div>
                  )}
                </div>
                <span className="gp-mes">{MESES_CURTOS[i]}</span>
                {hover === i && total > 0 && (
                  <div className="gp-tooltip gp-tooltip-barra">
                    <b>{MESES_CURTOS[i]} {ano}</b>
                    {ORIGENS.filter((o) => m[o] > 0).map((o) => (
                      <span key={o}><i style={{ background: COR_ORIGEM[o] }} /> {ROTULO_ORIGEM[o]}: {m[o]}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="gp-anel">
          <svg viewBox="0 0 110 110" role="img" aria-label={conf === null ? 'Conformidade sem resposta do servidor' : `Conformidade ${conf}%`}>
            <circle cx="55" cy="55" r={r} className="gp-anel-fundo" />
            {conf !== null && (
              <circle
                cx="55"
                cy="55"
                r={r}
                className="gp-anel-valor"
                strokeDasharray={`${(conf / 100) * circ} ${circ}`}
                transform="rotate(-90 55 55)"
              />
            )}
            <text x="55" y="61" textAnchor="middle" className="gp-anel-txt">{conf === null ? '—' : `${Math.round(conf)}%`}</text>
          </svg>
          <span>Conformidade</span>
        </div>
      </div>
      <ul className="gp-legenda">
        {ORIGENS.map((o) => (
          <li key={o}><i style={{ background: COR_ORIGEM[o] }} /> {ROTULO_ORIGEM[o]}</li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── Portal do Cliente ───────────────────────── */

export function CartaoPortalCliente() {
  const navigate = useNavigate();
  return (
    <section className="fj-panel dash2-card gp-card gp-portal" aria-labelledby="gp-portal-tit">
      <div className="dash2-card-hd">
        <h2 id="gp-portal-tit">Portal do Cliente</h2>
      </div>
      <div className="gp-portal-corpo">
        <svg viewBox="0 0 240 120" aria-hidden="true" className="gp-portal-ilus">
          <rect x="20" y="12" width="120" height="96" rx="6" fill="#EEF2F7" />
          <rect x="34" y="28" width="70" height="8" rx="4" fill="#D5DEEA" />
          <rect x="34" y="44" width="92" height="6" rx="3" fill="#E1E7F0" />
          <rect x="34" y="56" width="80" height="6" rx="3" fill="#E1E7F0" />
          <polyline points="34,92 54,78 70,84 92,66 112,72" fill="none" stroke="#9DB4D6" strokeWidth="3" />
          <circle cx="132" cy="30" r="16" fill="#86C99B" />
          <polyline points="124,30 130,36 141,24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="160" y="24" width="64" height="6" rx="3" fill="#D5DEEA" />
          <rect x="160" y="34" width="44" height="5" rx="2.5" fill="#E8EDF3" />
          <rect x="160" y="54" width="64" height="6" rx="3" fill="#D5DEEA" />
          <rect x="160" y="64" width="44" height="5" rx="2.5" fill="#E8EDF3" />
          <rect x="160" y="84" width="64" height="6" rx="3" fill="#D5DEEA" />
          <rect x="160" y="94" width="44" height="5" rx="2.5" fill="#E8EDF3" />
        </svg>
        <p>Libere o Portal do Cliente para que cada empresa acompanhe os próprios laudos, relatórios e certificados.</p>
        <button type="button" className="btn-primario gp-portal-btn" onClick={() => navigate('/empresas')}>
          ATIVAR PORTAL
        </button>
      </div>
    </section>
  );
}
