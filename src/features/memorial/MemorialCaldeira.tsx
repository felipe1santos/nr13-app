import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import TerminalMemorial from './TerminalMemorial';
import {
  calcularResumoCaldeira,
  carregarCaldeira,
  salvarCaldeira,
  salvarResumoCaldeira,
  type CaldeiraSalva,
  type ResumoMemorialCaldeira,
} from './caldeiraMemorialService';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
import './memorial.css';

type EtapaId = 'costado' | 'tubo' | 'espelho';

const ETAPAS: { id: EtapaId; nome: string }[] = [
  { id: 'costado', nome: 'Costado' },
  { id: 'tubo', nome: 'Tubo' },
  { id: 'espelho', nome: 'Espelho' },
];

interface Props { tag: string }

export default function MemorialCaldeira({ tag }: Props) {
  return <MemorialCaldeiraInner key={tag} tag={tag} />;
}

function validarCamposCaldeira(c: CaldeiraSalva): string[] {
  const erros: string[] = [];
  const falta = (v: unknown) => v === '' || v === null || v === undefined || Number(v) <= 0;
  if (falta(c.P)) erros.push('Pressão de Projeto (P)');
  if (c.temp === '' || c.temp === null || c.temp === undefined) erros.push('Temperatura de Projeto');
  if (falta(c.costado.D)) erros.push('Costado: D — Diâmetro');
  if (falta(c.costado.S)) erros.push('Costado: S — Tensão Admissível');
  if (falta(c.costado.E)) erros.push('Costado: E — Eficiência de Solda');
  if (falta(c.costado.espEncontrada)) erros.push('Costado: Espessura Encontrada');
  if (falta(c.tubo.D)) erros.push('Tubo: D — Diâmetro');
  if (falta(c.tubo.S)) erros.push('Tubo: S — Tensão Admissível');
  if (falta(c.tubo.espEncontrada)) erros.push('Tubo: Espessura Encontrada');
  if (falta(c.espelho.S)) erros.push('Espelho: S — Tensão Admissível');
  if (falta(c.espelho.passo)) erros.push('Espelho: p — Passo dos Estais');
  if (falta(c.espelho.espEncontrada)) erros.push('Espelho: Espessura Encontrada');
  return erros;
}

function MemorialCaldeiraInner({ tag }: Props) {
  const [cald, setCald] = useState<CaldeiraSalva>(() => carregarCaldeira(tag));
  const [abaId, setAbaId] = useState<EtapaId>('costado');
  const [resumo, setResumo] = useState<ResumoMemorialCaldeira | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<string>('full');
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) setDirty(true);
    else montou.current = true;
  }, [cald]);
  useAvisoSairSemSalvar(dirty);

  function atualizarEtapa(id: EtapaId, chave: string, valor: unknown) {
    setCald((c) => ({ ...c, [id]: { ...c[id], [chave]: valor } }));
    setConfirmados((m) => (m[id] ? { ...m, [id]: false } : m));
  }

  function handleCalcular() {
    setResumo(calcularResumoCaldeira(cald));
    setGeradoEm(new Date());
    setCalcCount((n) => n + 1);
    setDirty(true);
  }

  async function salvar() {
    if (!resumo) { alert('Gere o cálculo antes de salvar.'); return; }
    const erros = validarCamposCaldeira(cald);
    if (erros.length > 0) {
      alert('Preencha os seguintes campos antes de salvar:\n• ' + erros.join('\n• '));
      return;
    }
    if (!window.confirm('Salvar o cálculo do memorial? Os dados ficarão disponíveis em "Ver Memorial".')) return;
    setSalvando(true);
    try {
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarCaldeira(tag, cald);
        await salvarResumoCaldeira(tag, resumo);
      });
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  const idxAtivo = ETAPAS.findIndex((e) => e.id === abaId);
  const ehUltimo = idxAtivo === ETAPAS.length - 1;
  const etapaResultado = resumo?.etapas.find((e) => e.id === abaId)?.resultado ?? null;
  const qtdConfirmados = ETAPAS.filter((e) => confirmados[e.id]).length;
  const todosConfirmados = qtdConfirmados === ETAPAS.length;
  const progresso = (qtdConfirmados / ETAPAS.length) * 100;

  function confirmarEtapa() {
    setConfirmados((m) => ({ ...m, [abaId]: true }));
    if (!ehUltimo) setTimeout(() => setAbaId(ETAPAS[idxAtivo + 1].id), 450);
  }

  const cabecalhoTerminal =
    resumo && geradoEm
      ? {
          titulo: `Memorial de Cálculo — TAG: ${tag}`,
          sub:
            `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ` +
            `${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` +
            ` · NR-13 / ASME Seção I (2004)`,
        }
      : undefined;

  const statusFinal = resumo?.resultado ?? null;
  const pmtaDisplay = resumo?.pmtaKgf != null ? `${resumo.pmtaKgf.toFixed(2)} kgf/cm²` : '--';
  const thDisplay = resumo?.thKgf != null ? `${resumo.thKgf.toFixed(2)} kgf/cm²` : '--';
  const eMinDisplay = etapaResultado ? etapaResultado.e.toFixed(3) : '--';

  const logParaMostrar =
    filtro === 'full'
      ? resumo?.logCompleto ?? []
      : resumo?.etapas.find((e) => e.id === filtro)?.resultado.log ?? [];
  const filtrosTerminal = [{ id: 'full', label: 'Completo' }, ...ETAPAS.map((e) => ({ id: e.id, label: e.nome }))];

  return (
    <div className="calc-calculadora">
      <div className="calc-card-top-bar">
        <div className="calc-top-row">
          <div className="calc-stepper">
            {ETAPAS.map((e, i) => {
              const done = !!confirmados[e.id];
              const res = resumo?.etapas.find((r) => r.id === e.id);
              return (
                <span key={e.id} className="calc-step-item">
                  <button type="button" className={`calc-step ${e.id === abaId ? 'ativa' : ''} ${done ? 'done' : ''}`} onClick={() => setAbaId(e.id)}>
                    <span className="num">
                      {done ? (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="calc-step-nome">{e.nome}</span>
                    {res && <span className={`calc-tab-dot ${res.resultado.resultado === 'APROVADO' ? 'ok' : 'err'}`} />}
                  </button>
                  {i < ETAPAS.length - 1 && (
                    <span className={`calc-step-arrow ${done ? 'filled' : ''}`}><Icone nome="chevright" tam={15} /></span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <div className="calc-progress"><i style={{ width: `${progresso}%` }} /></div>
      </div>

      <div className="calc-card-body">
        <div className="calc-campos-section">
          <p className="memorial-legenda-aviso">
            <span className="campo-aviso-icon">⚠</span> = campo obrigatório sem valor válido. O cálculo usa
            valores padrão nesses campos e o memorial sai como <b>PENDENTE</b> até você preencher.
          </p>
          {/* P e temp são globais: toda etapa depende delas, então mudar qualquer uma invalida
              todas as confirmações já feitas (não só a etapa aberta no momento). */}
          <div className="memorial-campos-grid">
            <Campo label="Pressão de Projeto P (MPa)" value={cald.P} warn={!cald.P || Number(cald.P) <= 0}
              onChange={(v) => { setCald((s) => ({ ...s, P: v === '' ? '' : Number(v) })); setConfirmados({}); }} />
            <Campo label="Temp. de Projeto (°C)" value={cald.temp} warn={cald.temp === '' || cald.temp === null || cald.temp === undefined}
              onChange={(v) => { setCald((s) => ({ ...s, temp: v === '' ? '' : Number(v) })); setConfirmados({}); }} />
          </div>

          <EtapaCampos etapa={abaId} cald={cald} onChange={(chave, valor) => atualizarEtapa(abaId, chave, valor)} />

          <div className="calc-nav-row">
            <button type="button" className="btn-nav-ghost" disabled={idxAtivo === 0} onClick={() => setAbaId(ETAPAS[idxAtivo - 1].id)}>
              <Icone nome="chevleft" tam={15} />
              Voltar
            </button>
            <div className="calc-nav-right">
              <button type="button" className={`btn-ok ${confirmados[abaId] ? 'confirmed' : ''}`} onClick={confirmarEtapa}>
                {confirmados[abaId] ? (<><Icone nome="check" tam={14} />Salvo</>) : 'OK'}
              </button>
              {ehUltimo ? (
                <span className="calc-nav-nota">Última etapa</span>
              ) : (
                <button type="button" className="btn-nav-next" onClick={() => setAbaId(ETAPAS[idxAtivo + 1].id)}>
                  Próximo
                  <Icone nome="chevright" tam={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="calc-equip-section">
          <Icone nome="flame" tam={44} />
          <span className="calc-equip-label">{ETAPAS[idxAtivo].nome} — ASME I (2004)</span>
          {etapaResultado && (
            <span className={`resultado-final-badge ${etapaResultado.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`} style={{ fontSize: 11 }}>
              {etapaResultado.resultado}
            </span>
          )}
        </div>
      </div>

      {resumo && resumo.resultado === 'PENDENTE' && (
        <div className="memorial-banner-pendente">
          <b>Cálculo PENDENTE — campos obrigatórios sem valor:</b>
          <ul>
            {resumo.etapas
              .filter((e) => e.resultado.faltantes.length > 0)
              .map((e) => (<li key={e.id}>{e.nome}: {e.resultado.faltantes.join(', ')}</li>))}
            {(!cald.P || Number(cald.P) <= 0) && <li>Dados gerais: P — Pressão de Projeto</li>}
            {(cald.temp === '' || cald.temp === null || cald.temp === undefined) && <li>Dados gerais: Temperatura de Projeto</li>}
          </ul>
        </div>
      )}

      <div className="calc-pmta-bar">
        <span>PMTA: <span className="calc-pmta-valor">{pmtaDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>e mín. da etapa: <span className="calc-pmta-valor">{eMinDisplay} mm</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>TH (1,5×PMTA): <span className="calc-pmta-valor">{thDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>Status:{' '}
          <span className={statusFinal === 'APROVADO' ? 'calc-pmta-status-ok' : statusFinal === 'REPROVADO' ? 'calc-pmta-status-err' : ''}>
            {statusFinal ?? '--'}
          </span>
        </span>
      </div>

      <div className="calc-acoes-bar">
        <button type="button" className={`btn-gerar-calculo ${todosConfirmados ? 'ready' : ''}`} onClick={handleCalcular}>
          Σ GERAR CÁLCULO
        </button>
        <span className="calc-terminal-label">Memória de Cálculo — Caldeira (ASME I)</span>
        <button type="button" className={`btn-primario ${salvando ? 'is-loading' : ''}`} onClick={salvar}
          disabled={!resumo || salvando} style={{ opacity: resumo ? 1 : 0.4, fontSize: 12 }}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <TerminalMemorial
        arquivo={`memorial_caldeira_${tag.toLowerCase().replace(/\s+/g, '_')}.log`}
        status={
          statusFinal === 'APROVADO' ? 'aprovado'
            : statusFinal === 'REPROVADO' ? 'reprovado'
              : statusFinal === 'PENDENTE' ? 'pendente'
                : 'aguardando'
        }
        filtros={filtrosTerminal}
        filtroAtivo={filtro}
        onFiltro={setFiltro}
        cabecalho={cabecalhoTerminal}
      >
        <MemorialLog
          key={`${calcCount}-${filtro}`}
          log={logParaMostrar}
          animado={calcCount > 0}
          showPlaceholder={calcCount === 0}
          placeholder={'>> Insira os dados da caldeira e clique em "Gerar Cálculo"...'}
        />
      </TerminalMemorial>
    </div>
  );
}

function EtapaCampos({ etapa, cald, onChange }: { etapa: EtapaId; cald: CaldeiraSalva; onChange: (chave: string, valor: unknown) => void }) {
  const num = (v: string) => (v === '' ? '' : Number(v));
  const falta = (v: unknown) => v === '' || v === null || v === undefined || Number(v) <= 0;
  if (etapa === 'costado') {
    const d = cald.costado;
    return (
      <div>
        <p className="memorial-tipo-fixo">Costado — ASME I-2004, PG-27.2.2 · e = P·D/(2·S·E + 2·y·P) + C</p>
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="D — Diâmetro (mm)" value={d.D ?? ''} warn={falta(d.D)} onChange={(v) => onChange('D', num(v))} />
          <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
          <Campo label="E — Eficiência de Solda" value={d.E ?? ''} warn={falta(d.E)} onChange={(v) => onChange('E', num(v))} />
          <Campo label="y — Coef. de Temperatura" value={d.y ?? ''} warn={false} onChange={(v) => onChange('y', num(v))} />
          <Campo label="C — Sobrecorrosão (mm)" value={d.C ?? ''} warn={false} onChange={(v) => onChange('C', num(v))} />
          <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
          <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
          <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
        <p className="memorial-bocal-nota">y vazio = 0,40 (planilha). C vazio = 0.</p>
      </div>
    );
  }
  if (etapa === 'tubo') {
    const d = cald.tubo;
    return (
      <div>
        <p className="memorial-tipo-fixo">Tubo — ASME I-2004, PG-27.2.1 · e = P·D/(2S+P) + 0,005·D + e</p>
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="D — Diâm. Externo do Tubo (mm)" value={d.D ?? ''} warn={falta(d.D)} onChange={(v) => onChange('D', num(v))} />
          <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
          <Campo label="e — Fator de Espessura (mm)" value={d.fatorE ?? ''} warn={false} onChange={(v) => onChange('fatorE', num(v))} />
          <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
          <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
          <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
        <p className="memorial-bocal-nota">e vazio = 0 (sem fator de espessura).</p>
      </div>
    );
  }
  const d = cald.espelho;
  return (
    <div>
      <p className="memorial-tipo-fixo">Espelho Dianteiro/Traseiro — ASME I-2004, PG-46.1 · e = p·√(P/(S·C))</p>
      <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
        <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={falta(d.S)} onChange={(v) => onChange('S', num(v))} />
        <Campo label="p — Passo dos Estais (mm)" value={d.passo ?? ''} warn={falta(d.passo)} onChange={(v) => onChange('passo', num(v))} />
        <Campo label="C — Constante dos Estais" value={d.cEstais ?? ''} warn={false} onChange={(v) => onChange('cEstais', num(v))} />
        <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onChange('mat', v)} />
        <Campo label="Esp. de Projeto (mm)" value={d.espProjeto ?? ''} warn={false} onChange={(v) => onChange('espProjeto', num(v))} />
        <Campo label="Esp. Encontrada (mm)" value={d.espEncontrada ?? ''} warn={falta(d.espEncontrada)} onChange={(v) => onChange('espEncontrada', num(v))} />
      </div>
      <p className="memorial-bocal-nota">C vazio = 2,2 (estais soldados — planilha).</p>
    </div>
  );
}
