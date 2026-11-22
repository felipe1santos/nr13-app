import { useMemo } from 'react';
import { Icone } from '../../components/Icone';
import type { ItemVencimento } from '../../services/vencimentos';
import './panorama-parque.css';

/**
 * Visão panorâmica do parque no Dashboard (21/11/2026).
 *
 * Dois gráficos de PARTE DO TODO, desenhados como barras (nunca pizza):
 *   · Situação dos equipamentos — UMA barra segmentada: quantos equipamentos
 *     estão vencidos, vencem em até 30 dias, em dia, ou sem prazo calculado.
 *   · Prazos por tipo — uma barra empilhada por família de prazo (inspeções,
 *     calibrações, certificados), no mesmo eixo, para comparar as três.
 *
 * As cores são de ESTADO (crítico / atenção / em dia / sem prazo) e nunca
 * aparecem sozinhas: toda faixa tem ícone + rótulo + número na legenda.
 * Os números saem da MESMA lista que alimenta a tabela de prazos da tela —
 * nada é contado duas vezes nem estimado.
 */

type Situacao = 'crit' | 'warn' | 'ok' | 'semPrazo';

const ORDEM: Situacao[] = ['crit', 'warn', 'ok', 'semPrazo'];
const ROTULO: Record<Situacao, string> = {
  crit: 'Vencido',
  warn: 'Vence em até 30 dias',
  ok: 'Em dia',
  semPrazo: 'Sem prazo calculado',
};
const ICONE: Record<Situacao, 'alerttri' | 'clock' | 'checkcircle' | 'info'> = {
  crit: 'alerttri',
  warn: 'clock',
  ok: 'checkcircle',
  semPrazo: 'info',
};

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/** Legenda: ícone + rótulo + número. A cor nunca carrega o sentido sozinha. */
function Legenda({ contas, total, mostrar }: { contas: Record<Situacao, number>; total: number; mostrar: Situacao[] }) {
  return (
    <ul className="pp-leg">
      {mostrar.map((s) => (
        <li key={s}>
          <span className={`pp-sw s-${s}`} aria-hidden="true" />
          <Icone nome={ICONE[s]} tam={13} />
          <span className="pp-leg-rot">{ROTULO[s]}</span>
          <b>{contas[s]}</b>
          {total > 0 && <small>{pct(contas[s], total)}%</small>}
        </li>
      ))}
    </ul>
  );
}

/** Barra segmentada; o número aparece DENTRO do bloco só quando cabe. */
function BarraSegmentada({ contas, total, alta }: { contas: Record<Situacao, number>; total: number; alta?: boolean }) {
  if (total === 0) return <div className={`pp-barra vazia${alta ? ' alta' : ''}`} />;
  return (
    <div className={`pp-barra${alta ? ' alta' : ''}`} role="img" aria-label={ORDEM.filter((s) => contas[s] > 0).map((s) => `${ROTULO[s]}: ${contas[s]}`).join(', ')}>
      {ORDEM.filter((s) => contas[s] > 0).map((s) => {
        const p = (contas[s] / total) * 100;
        return (
          <span key={s} className={`pp-seg s-${s}`} style={{ flexGrow: contas[s] }} title={`${ROTULO[s]}: ${contas[s]} (${pct(contas[s], total)}%)`}>
            {alta && p >= 9 ? <b>{contas[s]}</b> : null}
          </span>
        );
      })}
    </div>
  );
}

export default function PanoramaParque({
  itens,
  totalEquipamentos,
  truncado,
  aoVer,
}: {
  itens: ItemVencimento[];
  /** Contador do servidor (`kpis.total`); indefinido = não respondeu. */
  totalEquipamentos: number | undefined;
  /** A lista veio cortada pelo servidor — as contas por equipamento são parciais. */
  truncado: boolean;
  aoVer: (s: Situacao) => void;
}) {
  // ── Situação por EQUIPAMENTO: o prazo de inspeção de cada TAG ─────────────
  const equip = useMemo(() => {
    const porTag = new Map<string, Situacao>();
    for (const i of itens) {
      if (i.origem !== 'inspecao') continue;
      const atual = porTag.get(i.tag);
      // Se a mesma TAG vier duas vezes, vale a situação MAIS grave.
      if (!atual || ORDEM.indexOf(i.status) < ORDEM.indexOf(atual)) porTag.set(i.tag, i.status);
    }
    const c: Record<Situacao, number> = { crit: 0, warn: 0, ok: 0, semPrazo: 0 };
    for (const s of porTag.values()) c[s]++;
    // Equipamento SEM nenhum prazo de inspeção na lista = "sem prazo calculado".
    // Só dá para afirmar isso com o total do servidor e a lista inteira.
    if (totalEquipamentos !== undefined && !truncado) {
      c.semPrazo += Math.max(0, totalEquipamentos - porTag.size);
    }
    const total = c.crit + c.warn + c.ok + c.semPrazo;
    return { c, total };
  }, [itens, totalEquipamentos, truncado]);

  // ── Prazos por tipo (inspeção / calibração / certificado) ─────────────────
  const tipos = useMemo(() => {
    const linhas = (['inspecao', 'calibracao', 'certificado'] as const).map((o) => {
      const c: Record<Situacao, number> = { crit: 0, warn: 0, ok: 0, semPrazo: 0 };
      for (const i of itens) if (i.origem === o && i.status !== 'semPrazo') c[i.status]++;
      return { origem: o, c, total: c.crit + c.warn + c.ok };
    });
    const max = Math.max(1, ...linhas.map((l) => l.total));
    return { linhas, max };
  }, [itens]);
  const ROT_ORIGEM = { inspecao: 'Inspeções', calibracao: 'Calibrações', certificado: 'Certificados' } as const;
  const totaisTipo = useMemo(() => {
    const c: Record<Situacao, number> = { crit: 0, warn: 0, ok: 0, semPrazo: 0 };
    for (const l of tipos.linhas) for (const s of ORDEM) c[s] += l.c[s];
    return c;
  }, [tipos]);

  return (
    <div className="pp-grade">
      <section className="fj-panel dash2-card pp-card" aria-labelledby="pp-eq-tit">
        <div className="dash2-card-hd">
          <h2 id="pp-eq-tit">Situação dos equipamentos</h2>
          <span className="dash2-mes">inspeção periódica</span>
        </div>
        <div className="pp-corpo">
          <div className="pp-hero">
            <b>{equip.total}</b>
            <span>equipamento{equip.total === 1 ? '' : 's'}</span>
          </div>
          <BarraSegmentada contas={equip.c} total={equip.total} alta />
          <Legenda contas={equip.c} total={equip.total} mostrar={ORDEM} />
          <div className="pp-acoes">
            {equip.c.crit > 0 && (
              <button type="button" className="pp-ver crit" onClick={() => aoVer('crit')}>
                Ver vencidos
              </button>
            )}
            {equip.c.warn > 0 && (
              <button type="button" className="pp-ver warn" onClick={() => aoVer('warn')}>
                Ver os que vencem em 30 dias
              </button>
            )}
          </div>
          {truncado && (
            <p className="pp-nota">Lista parcial: o servidor mandou só os prazos mais próximos. "Sem prazo" não foi calculado.</p>
          )}
        </div>
      </section>

      <section className="fj-panel dash2-card pp-card" aria-labelledby="pp-tipo-tit">
        <div className="dash2-card-hd">
          <h2 id="pp-tipo-tit">Prazos por tipo</h2>
          <span className="dash2-mes">com data de vencimento</span>
        </div>
        <div className="pp-corpo">
          <ul className="pp-linhas">
            {tipos.linhas.map((l) => (
              <li key={l.origem}>
                <span className="pp-linha-rot">{ROT_ORIGEM[l.origem]}</span>
                {/* Mesmo eixo nas três linhas: a largura é proporcional ao total. */}
                <span className="pp-linha-trilho">
                  <span className="pp-linha-cheia" style={{ width: `${(l.total / tipos.max) * 100}%` }}>
                    <BarraSegmentada contas={l.c} total={l.total} />
                  </span>
                </span>
                <b className="pp-linha-n">{l.total}</b>
              </li>
            ))}
          </ul>
          <Legenda contas={totaisTipo} total={0} mostrar={['crit', 'warn', 'ok']} />
        </div>
      </section>
    </div>
  );
}
