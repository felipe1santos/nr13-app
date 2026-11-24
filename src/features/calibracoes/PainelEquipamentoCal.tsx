/**
 * Visão de UM equipamento em /calibracoes — exata do protótipo Cobalto.
 *
 * Só APRESENTA o que a página já carregou (`abrirEquipamentoParaCalibracoes`):
 * componentes do cadastro e calibrações da TAG. Nenhuma leitura nova, nenhuma
 * regra nova. O prazo de cada acessório é o da calibração OFICIAL mais recente
 * dele (`ehOficial`, a mesma regra do painel de vencimentos) — rascunho não
 * gera prazo.
 */
import { Icone } from '../../components/Icone';
import { iconeDoTipo } from '../../components/listaCobalto';
import type { ComponenteCal } from './componentesService';
import { definicaoDe } from './instrumentos';
import { ehOficial, ehTerceiro, type DadosCalibracao } from './tipos';
import { prazoDoCanto, situacaoDoAcessorio, type SituacaoAcessorio } from './situacaoAcessorio';

/** Cor de identidade do instrumento (mesma família da lista). */
function classeDoInstrumento(tipo: string): string {
  switch (tipo) {
    case 'psv':
      return 'i-psv';
    case 'termometro':
    case 'termostato':
      return 'i-ter';
    case 'vacuometro':
      return 'i-vac';
    case 'pressostato':
      return 'i-prs';
    case 'transmissor':
      return 'i-tra';
    default:
      return 'i-man';
  }
}

const ROTULO_SELO: Record<NonNullable<SituacaoAcessorio['selo']>, string> = {
  'em-dia': 'Em dia',
  vencido: 'Vencido',
  reprovado: 'Reprovado',
};

const ROTULO_CERT: Record<NonNullable<SituacaoAcessorio['certificado']>, string> = {
  emitido: 'Certificado emitido',
  externo: 'Certificado de laboratório externo',
  anterior: 'Certificado não emitido (registro anterior)',
};

function prazoCurto(dias: number): string {
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoje';
  return `Em ${dias} dia${dias === 1 ? '' : 's'}`;
}

export function SeloPrazo({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="cal3-prazo folgado">Sem prazo</span>;
  const c = dias < 0 ? 'crit' : dias <= 30 ? 'warn' : dias > 60 ? 'folgado' : 'ok';
  return (
    <span className={`cal3-prazo ${c}`}>
      <Icone nome={dias < 0 ? 'alerttri' : dias <= 30 ? 'clock' : 'check'} tam={13} />
      {prazoCurto(dias)}
    </span>
  );
}

/** Cartão do topo: equipamento + contadores. */
export function TopoEquipamentoCal({
  tag,
  tipo,
  descricao,
  componentes,
  cals,
}: {
  tag: string;
  tipo: string | undefined;
  descricao: string;
  componentes: ComponenteCal[];
  cals: DadosCalibracao[];
}) {
  const sits = componentes.map((c) => situacaoDoAcessorio(c, cals));
  const vencidas = sits.filter((s) => s.dias !== null && s.dias < 0).length;
  const aVencer = sits.filter((s) => s.dias !== null && s.dias >= 0 && s.dias <= 30).length;
  const rascunhos = cals.filter((c) => !ehOficial(c)).length;
  return (
    <section className="mz-card cal4-topo">
      <span className={`lc-ico ${tipo ?? 'outro'} cal4-topo-ic`} aria-hidden>
        <Icone nome={iconeDoTipo(tipo)} tam={32} />
      </span>
      <div className="t">
        <h1>Calibrações · {tag}</h1>
        <p>{descricao}</p>
      </div>
      <dl className="cal4-res">
        <div>
          <dt>Acessórios</dt>
          <dd>{componentes.length}</dd>
        </div>
        <div>
          <dt>Vencidas</dt>
          <dd className={vencidas ? 'v-crit' : ''}>{vencidas}</dd>
        </div>
        <div>
          <dt>A vencer (30 dias)</dt>
          <dd className={aVencer ? 'v-warn' : ''}>{aVencer}</dd>
        </div>
        <div>
          <dt>Rascunhos</dt>
          <dd>{rascunhos}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Aba "Calibrar acessórios": um cartão por acessório. */
export function GradeAcessorios({
  componentes,
  cals,
  aoAdicionar,
  aoEditar,
  aoHistorico,
  aoCalibrar,
  aoContinuar,
  hoje,
}: {
  componentes: ComponenteCal[];
  cals: DadosCalibracao[];
  aoAdicionar: () => void;
  aoEditar: (c: ComponenteCal) => void;
  aoHistorico: (c: ComponenteCal) => void;
  aoCalibrar: (c: ComponenteCal) => void;
  aoContinuar: (cal: DadosCalibracao) => void;
  /** Só para teste: a data de referência do prazo. */
  hoje?: Date;
}) {
  return (
    <section className="mz-card cal-acessorios-card">
      <header className="mz-h">
        <h2>Acessórios do equipamento</h2>
        <span className="grow" />
        <button type="button" className="cal4-btn cal4-btn-sec" onClick={aoAdicionar}>
          <Icone nome="plus" tam={16} />
          Adicionar acessório
        </button>
      </header>
      {componentes.length === 0 ? (
        <p className="cal4-vazio">Nenhum acessório cadastrado. Adicione os manômetros, válvulas e demais instrumentos deste equipamento.</p>
      ) : (
        <div className="cal4-grade">
          {componentes.map((c) => {
            const def = definicaoDe(c.tipo);
            const s = situacaoDoAcessorio(c, cals, hoje);
            const classe = classeDoInstrumento(c.tipo);
            const calibrarOuContinuar = () => (s.rascunho ? aoContinuar(s.rascunho) : aoCalibrar(c));

            // ── NUNCA CALIBRADO ────────────────────────────────────────────
            // Só o nome, o tipo e "Requer calibração". O cartão INTEIRO é o
            // botão — um jeito só de calibrar. Editar o cadastro continua a um
            // clique, dentro da janela da calibração ("Editar componente").
            if (!s.ultima) {
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cal4-ac cal4-ac-novo ${classe}`}
                  aria-label={`${s.rascunho ? 'Continuar a calibração de' : 'Calibrar'} ${c.nome} (${def.rotulo}) — requer calibração`}
                  title={s.rascunho ? 'Continuar a calibração em rascunho' : 'Calibrar este acessório'}
                  onClick={calibrarOuContinuar}
                >
                  <span className="cal4-ac-cab">
                    <span className="cal4-ci" aria-hidden>
                      <Icone nome={def.icone} tam={18} />
                    </span>
                    <span className="t">
                      <b>{c.nome}</b>
                      <span className="cal4-tipo">{def.rotulo}</span>
                    </span>
                  </span>
                  <span className="cal4-requer">
                    <Icone nome="manometro" tam={40} />
                    <strong>Requer calibração</strong>
                    {s.rascunho && <span className="cal4-st rasc">Rascunho em aberto</span>}
                  </span>
                </button>
              );
            }

            // ── JÁ CALIBRADO ───────────────────────────────────────────────
            const u = s.ultima;
            return (
              <article key={c.id} className={`cal4-ac cal4-ac-cal ${classe}`}>
                <header>
                  <span className="cal4-ci" aria-hidden>
                    <Icone nome={def.icone} tam={18} />
                  </span>
                  <div className="t">
                    <span className="cal4-nome">
                      <b>{c.nome}</b>
                      {s.selo && <span className={`cal4-selo ${s.selo}`}>{ROTULO_SELO[s.selo]}</span>}
                    </span>
                    <span className="cal4-tipo">{def.rotulo}</span>
                  </div>
                  <span className={`cal4-canto${s.dias !== null && s.dias < 0 ? ' venc' : ''}`}>{prazoDoCanto(s.dias)}</span>
                </header>
                <dl>
                  <div>
                    <dt>Última calibração</dt>
                    <dd>{u.dataCalibracao || '—'}</dd>
                  </div>
                  <div>
                    <dt>Próxima</dt>
                    <dd>{u.dataProxCalibracao || '—'}</dd>
                  </div>
                  <div>
                    <dt>Resultado</dt>
                    <dd>
                      {u.statusConclusao === 'aprovado' ? 'Aprovado' : u.statusConclusao === 'reprovado' ? 'Reprovado' : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Certificado</dt>
                    <dd>{u.numeroCertificado || '—'}</dd>
                  </div>
                </dl>
                <p className={`cal4-cert ${s.certificado ?? ''}`}>
                  <Icone nome={s.certificado === 'anterior' ? 'alerttri' : 'checkcircle'} tam={14} />
                  {s.certificado ? ROTULO_CERT[s.certificado] : '—'}
                  {s.rascunho && <span className="cal4-st rasc">Rascunho em aberto</span>}
                </p>
                <footer>
                  <span className="grow" />
                  <button
                    type="button"
                    className="cal4-ra"
                    title="Editar acessório"
                    aria-label={`Editar ${c.nome}`}
                    onClick={() => aoEditar(c)}
                  >
                    <Icone nome="pencil" tam={15} />
                  </button>
                  <button
                    type="button"
                    className="cal4-hist"
                    title="Calibrações já feitas deste acessório"
                    aria-label={`Histórico de ${c.nome}: ${s.oficiais} ${s.oficiais === 1 ? 'calibração' : 'calibrações'}`}
                    aria-haspopup="dialog"
                    onClick={() => aoHistorico(c)}
                  >
                    <Icone nome="clock" tam={15} />
                    Histórico <span className="n">{s.oficiais}</span>
                  </button>
                  <button type="button" className="cal4-calibrar" onClick={calibrarOuContinuar}>
                    <Icone nome="gauge" tam={15} />
                    {s.rascunho ? 'Continuar' : 'Calibrar'}
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Aba "Calibrações realizadas": uma linha por calibração. */
export function TabelaRealizadas({
  componentes,
  cals,
  aoContinuar,
  aoVer,
  aoBaixar,
}: {
  componentes: ComponenteCal[];
  cals: DadosCalibracao[];
  aoContinuar: (cal: DadosCalibracao) => void;
  aoVer: (cal: DadosCalibracao) => void;
  aoBaixar: (cal: DadosCalibracao) => void;
}) {
  return (
    <section className="mz-card">
      <header className="mz-h">
        <h2>Calibrações realizadas</h2>
        <span className="mz-norma">{cals.length}</span>
      </header>
      {cals.length === 0 ? (
        <p className="cal4-vazio">Nenhuma calibração registrada neste equipamento.</p>
      ) : (
        <div className="cal4-tab">
          <div className="cal4-tcab" aria-hidden="true">
            <span />
            <span>Certificado</span>
            <span>Acessório</span>
            <span>Data</span>
            <span>Origem</span>
            <span>Resultado</span>
            <span>Situação</span>
            <span className="ta-r">Ações</span>
          </div>
          {cals.map((c, i) => {
            const comp = componentes.find((x) => x.id === c.componenteId);
            const def = definicaoDe(c.tipo);
            const oficial = ehOficial(c);
            return (
              <div key={c.id} className="cal4-tlin" data-z={i % 2 === 1 || undefined}>
                <span className={`cal4-ci ${classeDoInstrumento(c.tipo)}`} aria-hidden>
                  <Icone nome={def.icone} tam={16} />
                </span>
                <span className="cal3-tag">{c.numeroCertificado || '—'}</span>
                <span className="cal3-cli">
                  <b>{comp?.nome ?? c.nome ?? '—'}</b> · {def.rotulo}
                </span>
                <span className="cal4-data">{c.dataCalibracao || '—'}</span>
                <span>
                  {ehTerceiro(c) ? (
                    <span className="cal4-st ter">{c.laboratorio || 'Laboratório externo'}</span>
                  ) : (
                    <span className="cal4-st int">Interna</span>
                  )}
                </span>
                <span>
                  {c.statusConclusao === 'aprovado' ? (
                    <span className="eres ok">Aprovado</span>
                  ) : c.statusConclusao === 'reprovado' ? (
                    <span className="eres crit">Reprovado</span>
                  ) : (
                    <span className="cal4-nada">—</span>
                  )}
                </span>
                <span>
                  {oficial ? (
                    <span className="cal4-st emi">
                      <Icone nome="checkcircle" tam={13} />
                      Emitido
                    </span>
                  ) : (
                    <span className="cal4-st rasc">Rascunho</span>
                  )}
                </span>
                <span className="cal4-acoes">
                  {oficial ? (
                    <>
                      <button type="button" className="cal4-ra" title="Ver certificado" aria-label="Ver certificado" onClick={() => aoVer(c)}>
                        <Icone nome="eye" tam={15} />
                      </button>
                      <button type="button" className="cal4-ra doc" title="Baixar PDF" aria-label="Baixar PDF" onClick={() => aoBaixar(c)}>
                        <Icone nome="download" tam={15} />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="cal4-ra" title="Continuar" aria-label="Continuar rascunho" onClick={() => aoContinuar(c)}>
                      <Icone nome="pencil" tam={15} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
