import { useMemo, useState } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import type { ItemVencimento } from '../../services/vencimentos';
import './panorama-parque.css';

/**
 * Visão panorâmica do parque no Dashboard (21/11/2026).
 *
 *   · Situação dos equipamentos — UMA barra segmentada (parte do todo, nunca
 *     pizza): vencidos, vencem em até 30 dias, em dia, sem prazo. Passando o
 *     mouse (ou o foco) numa faixa abre um BALÃO com setinha: o que é, quantos,
 *     quanto do parque. Clicar numa faixa de prazo leva à lista filtrada.
 *   · Prazos por tipo — uma barra por família (inspeções, calibrações,
 *     certificados), CADA UMA com a sua cor e o seu ícone, no mesmo eixo; a
 *     situação (vencidos / a vencer) vem escrita ao lado.
 *
 * Entrada animada: as barras crescem a partir da esquerda, em sequência curta.
 * Quem pede menos movimento (`prefers-reduced-motion`) vê tudo pronto.
 */

type Situacao = 'crit' | 'warn' | 'ok' | 'semPrazo';

const ORDEM: Situacao[] = ['crit', 'warn', 'ok', 'semPrazo'];
const ROTULO: Record<Situacao, string> = {
  crit: 'Vencido',
  warn: 'Vence em até 30 dias',
  ok: 'Em dia',
  semPrazo: 'Sem prazo calculado',
};
const EXPLICA: Record<Situacao, string> = {
  crit: 'Inspeção periódica com prazo já vencido.',
  warn: 'Inspeção vence nos próximos 30 dias.',
  ok: 'Inspeção dentro do prazo.',
  semPrazo: 'Ainda sem relatório ou vida remanescente que defina o prazo.',
};
const ICONE: Record<Situacao, NomeIcone> = {
  crit: 'alerttri',
  warn: 'clock',
  ok: 'checkcircle',
  semPrazo: 'info',
};

const TIPOS = [
  { origem: 'inspecao', rotulo: 'Inspeções', icone: 'clipboard', cor: 'insp' },
  { origem: 'calibracao', rotulo: 'Calibrações', icone: 'manometro', cor: 'cal' },
  { origem: 'certificado', rotulo: 'Certificados', icone: 'award', cor: 'cert' },
] as const;

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/** Legenda: ícone + rótulo + número. A cor nunca carrega o sentido sozinha. */
function Legenda({ contas, total }: { contas: Record<Situacao, number>; total: number }) {
  return (
    <ul className="pp-leg">
      {ORDEM.map((s) => (
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
  const [balao, setBalao] = useState<Situacao | null>(null);

  // ── Situação por EQUIPAMENTO: o prazo de inspeção de cada TAG ─────────────
  const equip = useMemo(() => {
    const porTag = new Map<string, Situacao>();
    for (const i of itens) {
      if (i.origem !== 'inspecao') continue;
      const atual = porTag.get(i.tag);
      if (!atual || ORDEM.indexOf(i.status) < ORDEM.indexOf(atual)) porTag.set(i.tag, i.status);
    }
    const c: Record<Situacao, number> = { crit: 0, warn: 0, ok: 0, semPrazo: 0 };
    for (const s of porTag.values()) c[s]++;
    if (totalEquipamentos !== undefined && !truncado) {
      c.semPrazo += Math.max(0, totalEquipamentos - porTag.size);
    }
    return { c, total: c.crit + c.warn + c.ok + c.semPrazo };
  }, [itens, totalEquipamentos, truncado]);

  // ── Prazos por tipo ──────────────────────────────────────────────────────
  const tipos = useMemo(() => {
    const linhas = TIPOS.map((t) => {
      const doTipo = itens.filter((i) => i.origem === t.origem && i.status !== 'semPrazo');
      return {
        ...t,
        total: doTipo.length,
        vencidos: doTipo.filter((i) => i.status === 'crit').length,
        aVencer: doTipo.filter((i) => i.status === 'warn').length,
      };
    });
    return { linhas, max: Math.max(1, ...linhas.map((l) => l.total)) };
  }, [itens]);

  const visiveis = ORDEM.filter((s) => equip.c[s] > 0);

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

          {equip.total === 0 ? (
            <div className="pp-barra alta vazia" />
          ) : (
            <div className="pp-barra alta" onMouseLeave={() => setBalao(null)}>
              {visiveis.map((s, n) => {
                const clicavel = s === 'crit' || s === 'warn';
                return (
                  <button
                    key={s}
                    type="button"
                    className={`pp-seg s-${s}${clicavel ? ' clicavel' : ''}`}
                    style={{ flexGrow: equip.c[s], animationDelay: `${n * 90}ms` }}
                    aria-label={`${ROTULO[s]}: ${equip.c[s]} de ${equip.total} (${pct(equip.c[s], equip.total)}%)`}
                    onMouseEnter={() => setBalao(s)}
                    onFocus={() => setBalao(s)}
                    onBlur={() => setBalao(null)}
                    onClick={() => clicavel && aoVer(s)}
                    tabIndex={clicavel ? 0 : -1}
                  >
                    {(equip.c[s] / equip.total) * 100 >= 9 && <b>{equip.c[s]}</b>}
                    {balao === s && (
                      <span
                        className={`pp-balao${n === 0 && visiveis.length > 1 ? ' esq' : n === visiveis.length - 1 && visiveis.length > 1 ? ' dir' : ''}`}
                        role="tooltip"
                      >
                        <span className="pp-balao-tit">
                          <Icone nome={ICONE[s]} tam={14} /> {ROTULO[s]}
                        </span>
                        <span className="pp-balao-num">
                          <b>{equip.c[s]}</b> de {equip.total} equipamentos · {pct(equip.c[s], equip.total)}%
                        </span>
                        <span className="pp-balao-exp">{EXPLICA[s]}</span>
                        {clicavel && <span className="pp-balao-acao">Clique para ver na lista</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <Legenda contas={equip.c} total={equip.total} />
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
            {tipos.linhas.map((l, n) => (
              <li key={l.origem} className={`t-${l.cor}`}>
                <span className="pp-tipo-ic" aria-hidden="true"><Icone nome={l.icone} tam={18} /></span>
                <div className="pp-tipo-corpo">
                  <div className="pp-tipo-top">
                    <span className="pp-linha-rot">{l.rotulo}</span>
                    <b className="pp-linha-n">{l.total}</b>
                  </div>
                  {/* Mesmo eixo nas três: a largura é proporcional ao total. */}
                  <span className="pp-tipo-trilho">
                    <span
                      className="pp-tipo-barra"
                      style={{ width: `${(l.total / tipos.max) * 100}%`, animationDelay: `${150 + n * 120}ms` }}
                    />
                  </span>
                  <span className="pp-tipo-sit">
                    {l.vencidos > 0 && (
                      <span className="crit"><Icone nome="alerttri" tam={12} /> {l.vencidos} vencido{l.vencidos === 1 ? '' : 's'}</span>
                    )}
                    {l.aVencer > 0 && (
                      <span className="warn"><Icone nome="clock" tam={12} /> {l.aVencer} a vencer em 30 dias</span>
                    )}
                    {l.vencidos === 0 && l.aVencer === 0 && (
                      <span className="ok"><Icone nome="checkcircle" tam={12} /> {l.total ? 'tudo em dia' : 'nenhum prazo'}</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
