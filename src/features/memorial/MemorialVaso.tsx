import { useState } from 'react';
import type { TipoComponenteVaso } from '../../calc/vaso';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import {
  calcularResumoVaso,
  carregarVaso,
  salvarResumoVaso,
  salvarVaso,
  type ComponenteVasoSalvo,
  type OrientacaoVaso,
  type ResumoMemorialVaso,
  type VasoSalvo,
} from './vasoMemorialService';
import './memorial.css';

const ROTULO_CASCO = 'Casco Cilíndrico (UG-27c)';

const OPCOES_TAMPO: { value: TipoComponenteVaso; label: string }[] = [
  { value: 'eliptico', label: 'Tampo Elíptico 2:1 (UG-32d)' },
  { value: 'toroesferico', label: 'Tampo Torisférico ASME F&D (UG-32e)' },
  { value: 'esferico', label: 'Tampo Hemiesférico (UG-32b)' },
  { value: 'plano', label: 'Tampo Plano Soldado (UG-34)' },
  { value: 'planoAparafusado', label: 'Tampo Plano Aparafusado (UG-34 + Parafusos)' },
  { value: 'cone', label: 'Tampo Cônico / Helicoidal (UG-32g)' },
];

const DADOS_PADRAO = { S: 137.9, E: 0.85, t_comercial: 10, ca: 1.5, mat: 'SA-516-70', temp: 100, alfa: 30 };

function rotuloTampo(orientacao: OrientacaoVaso, posicao: 'tampo1' | 'tampo2'): string {
  if (orientacao === 'vertical') return posicao === 'tampo1' ? 'Tampo Inferior' : 'Tampo Superior';
  return posicao === 'tampo1' ? 'Tampo Esquerdo' : 'Tampo Direito';
}

function novoComponentes(orientacao: OrientacaoVaso): ComponenteVasoSalvo[] {
  return [
    { id: 'tampo1', nome: rotuloTampo(orientacao, 'tampo1'), tipo: 'eliptico', dados: { ...DADOS_PADRAO } },
    { id: 'casco', nome: ROTULO_CASCO, tipo: 'cilindrico', dados: { ...DADOS_PADRAO } },
    { id: 'tampo2', nome: rotuloTampo(orientacao, 'tampo2'), tipo: 'eliptico', dados: { ...DADOS_PADRAO } },
  ];
}

function playClick() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const data = buf.getChannelData(0);
    const decay = ctx.sampleRate * 0.005;
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / decay);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    src.onended = () => ctx.close();
  } catch { /* silently ignore */ }
}

interface Props {
  tag: string;
  sufixo?: string;
  titulo?: string;
  imagemSrc?: string;
}

export default function MemorialVaso(props: Props) {
  return <MemorialVasoInner key={`${props.tag}-${props.sufixo ?? ''}`} {...props} />;
}

function validarCamposVaso(vaso: VasoSalvo): string[] {
  const erros: string[] = [];
  if (!vaso.P || vaso.P <= 0) erros.push('Pressão de Projeto (P)');
  if (!vaso.D || vaso.D <= 0) erros.push('Diâmetro Interno (D)');
  for (const comp of vaso.componentes) {
    const d = comp.dados;
    if (!d.S || Number(d.S) <= 0) erros.push(`${comp.nome}: Tensão Admissível (S)`);
    if (!d.E || Number(d.E) <= 0) erros.push(`${comp.nome}: Eficiência (E)`);
    if (!d.t_comercial || Number(d.t_comercial) <= 0) erros.push(`${comp.nome}: Espessura Nominal (Tnom)`);
    if (d.temp === undefined || d.temp === null || d.temp === '') erros.push(`${comp.nome}: Temperatura`);
  }
  return erros;
}

function MemorialVasoInner({ tag, sufixo = '', titulo = 'Memorial de Cálculo', imagemSrc }: Props) {
  const [vaso, setVaso] = useState<VasoSalvo>(() => carregarVaso(tag, sufixo));
  const [abaId, setAbaId] = useState<'tampo1' | 'casco' | 'tampo2'>('tampo1');
  const [resumo, setResumo] = useState<ResumoMemorialVaso | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [salvando, setSalvando] = useState(false);

  function escolherOrientacao(orientacao: OrientacaoVaso) {
    setVaso((v) => ({
      ...v,
      orientacao,
      componentes: v.componentes.length === 3 ? v.componentes : novoComponentes(orientacao),
    }));
  }

  function trocarOrientacao(orientacao: OrientacaoVaso) {
    setVaso((v) => ({
      ...v,
      orientacao,
      componentes: v.componentes.map((c) =>
        c.id === 'tampo1' || c.id === 'tampo2' ? { ...c, nome: rotuloTampo(orientacao, c.id) } : c,
      ),
    }));
  }

  function atualizarTipoTampo(id: 'tampo1' | 'tampo2', tipo: TipoComponenteVaso) {
    setVaso((v) => ({
      ...v,
      componentes: v.componentes.map((c) => (c.id === id ? { ...c, tipo, dados: { ...DADOS_PADRAO } } : c)),
    }));
  }

  function atualizarDado(id: string, chave: string, valor: unknown) {
    setVaso((v) => ({
      ...v,
      componentes: v.componentes.map((c) => (c.id === id ? { ...c, dados: { ...c.dados, [chave]: valor } } : c)),
    }));
  }

  function handleCalcular() {
    playClick();
    setResumo(calcularResumoVaso(vaso));
    setCalcCount((c) => c + 1);
  }

  async function salvar() {
    if (!resumo) { alert('Gere o cálculo antes de salvar.'); return; }
    const erros = validarCamposVaso(vaso);
    if (erros.length > 0) {
      alert('Preencha os seguintes campos antes de salvar:\n• ' + erros.join('\n• '));
      return;
    }
    if (!window.confirm('Salvar o cálculo do memorial? Os dados ficarão disponíveis em "Ver Memorial".')) return;
    setSalvando(true);
    try {
      await salvarVaso(tag, vaso, sufixo);
      await salvarResumoVaso(tag, resumo, sufixo);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  if (!vaso.orientacao) {
    return (
      <div>
        <h3>{titulo}</h3>
        <div className="orientacao-gate">
          <p>Selecione a orientação do vaso de pressão pra continuar:</p>
          <div className="orientacao-opcoes">
            <button type="button" className="btn-orientacao" onClick={() => escolherOrientacao('vertical')}>
              Vaso Vertical
            </button>
            <button type="button" className="btn-orientacao" onClick={() => escolherOrientacao('horizontal')}>
              Vaso Horizontal
            </button>
          </div>
        </div>
      </div>
    );
  }

  const componenteAtivo = vaso.componentes.find((c) => c.id === abaId)!;
  const resultadoPorComp = resumo?.porComponente ?? [];
  const resultadoAtivo = resultadoPorComp.find((c) => c.id === abaId)?.resultado ?? null;

  const pmtaDisplay = resumo?.pmtaFinal != null ? `${resumo.pmtaFinal.toFixed(2)} MPa` : '0.00 MPa';
  const tMinDisplay = resultadoAtivo?.t_min ?? '--';
  const pthDisplay = resumo?.pthFinal != null ? `${resumo.pthFinal.toFixed(2)} MPa` : '--';
  const statusFinal = resumo?.resultado ?? null;

  const logParaMostrar = resumo?.logCompleto ?? [];

  return (
    <div className="calc-calculadora">
      {/* ── Top bar: title + tabs + orientation ── */}
      <div className="calc-card-top-bar">
        <span className="calc-card-title">{titulo}</span>
        <div className="calc-card-tabs">
          {vaso.componentes.map((c) => {
            const res = resultadoPorComp.find((r) => r.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`calc-tab ${c.id === abaId ? 'ativa' : ''}`}
                onClick={() => setAbaId(c.id as 'tampo1' | 'casco' | 'tampo2')}
              >
                {c.nome}
                {res && <span className={`calc-tab-dot ${res.resultado.resultado === 'APROVADO' ? 'ok' : 'err'}`} />}
              </button>
            );
          })}
        </div>
        <div className="calc-orientacao-toggle">
          <button
            type="button"
            className={`calc-orientacao-btn ${vaso.orientacao === 'vertical' ? 'ativa' : ''}`}
            onClick={() => trocarOrientacao('vertical')}
          >
            Vertical
          </button>
          <button
            type="button"
            className={`calc-orientacao-btn ${vaso.orientacao === 'horizontal' ? 'ativa' : ''}`}
            onClick={() => trocarOrientacao('horizontal')}
          >
            Horizontal
          </button>
        </div>
      </div>

      {/* ── Card body: campos + equipment panel ── */}
      <div className="calc-card-body">
        <div className="calc-campos-section">
          {/* Global P and D */}
          <div className="memorial-campos-grid">
            <Campo
              label="Pressão de Projeto P (MPa)"
              value={vaso.P}
              warn={!vaso.P || vaso.P <= 0}
              onChange={(v) => setVaso((s) => ({ ...s, P: Number(v) }))}
            />
            <Campo
              label="Diâmetro Interno D (mm)"
              value={vaso.D}
              warn={!vaso.D || vaso.D <= 0}
              onChange={(v) => setVaso((s) => ({ ...s, D: Number(v) }))}
            />
          </div>

          {/* Per-component fields */}
          <ComponenteCampos
            componente={componenteAtivo}
            onTipoChange={(tipo) => atualizarTipoTampo(componenteAtivo.id as 'tampo1' | 'tampo2', tipo)}
            onDadoChange={(chave, valor) => atualizarDado(componenteAtivo.id, chave, valor)}
          />
        </div>

        {/* Equipment panel */}
        <div className="calc-equip-section">
          {imagemSrc ? (
            <img src={imagemSrc} alt={componenteAtivo.nome} />
          ) : (
            <div style={{ fontSize: 48, opacity: 0.15 }}>⚙</div>
          )}
          <span className="calc-equip-label">{componenteAtivo.nome}</span>
          {resultadoAtivo && (
            <span className={`resultado-final-badge ${resultadoAtivo.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`}
              style={{ fontSize: 11 }}>
              {resultadoAtivo.resultado}
            </span>
          )}
        </div>
      </div>

      {/* ── PMTA bar ── */}
      <div className="calc-pmta-bar">
        <span>PMTA CALCULADA: <span className="calc-pmta-valor">{pmtaDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>Esp. Mínima: <span className="calc-pmta-valor">{tMinDisplay} mm</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>P. Teste: <span className="calc-pmta-valor">{pthDisplay}</span></span>
        <span className="calc-pmta-sep">|</span>
        <span>Status:{' '}
          <span className={statusFinal === 'APROVADO' ? 'calc-pmta-status-ok' : statusFinal === 'REPROVADO' ? 'calc-pmta-status-err' : ''}>
            {statusFinal ?? '--'}
          </span>
        </span>
      </div>

      {/* ── Actions bar ── */}
      <div className="calc-acoes-bar">
        <button type="button" className="btn-gerar-calculo" onClick={handleCalcular}>
          Σ GERAR CÁLCULO
        </button>
        <span className="calc-terminal-label">Memória de Cálculo — {titulo}</span>
        <button
          type="button"
          className="btn-primario"
          onClick={salvar}
          disabled={!resumo || salvando}
          style={{ opacity: resumo ? 1 : 0.4, fontSize: 12 }}
        >
          {salvando ? 'Salvando...' : '💾 Salvar'}
        </button>
      </div>

      {/* ── Terminal ── */}
      <div className="calc-terminal-section expandido">
        <MemorialLog
          key={calcCount}
          log={logParaMostrar}
          animado={calcCount > 0}
          showPlaceholder={calcCount === 0}
          placeholder={'>> Insira os dados estruturais e clique em "Gerar Cálculo"...'}
        />
      </div>
    </div>
  );
}

function ComponenteCampos({
  componente,
  onTipoChange,
  onDadoChange,
}: {
  componente: ComponenteVasoSalvo;
  onTipoChange: (tipo: TipoComponenteVaso) => void;
  onDadoChange: (chave: string, valor: unknown) => void;
}) {
  const d = componente.dados;
  const ehCasco = componente.id === 'casco';

  return (
    <div>
      {ehCasco ? (
        <p className="memorial-tipo-fixo">{ROTULO_CASCO}</p>
      ) : (
        <select
          className="calc-tipo-selector"
          value={componente.tipo}
          onChange={(e) => onTipoChange(e.target.value as TipoComponenteVaso)}
        >
          {OPCOES_TAMPO.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
        <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={!d.S || Number(d.S) <= 0} onChange={(v) => onDadoChange('S', Number(v))} />
        <Campo label="E — Eficiência Junta" value={d.E ?? ''} warn={!d.E || Number(d.E) <= 0} onChange={(v) => onDadoChange('E', Number(v))} />
        <Campo label="Tnom — Esp. Comercial (mm)" value={d.t_comercial ?? ''} warn={!d.t_comercial || Number(d.t_comercial) <= 0} onChange={(v) => onDadoChange('t_comercial', Number(v))} />
        <Campo label="CA — Corrosão Adm. (mm)" value={d.ca ?? ''} onChange={(v) => onDadoChange('ca', Number(v))} />
        <Campo label="Material" type="text" value={d.mat ?? ''} onChange={(v) => onDadoChange('mat', v)} />
        <Campo label="Temp. Projeto (°C)" value={d.temp ?? ''} warn={d.temp === undefined || d.temp === null || d.temp === ''} onChange={(v) => onDadoChange('temp', Number(v))} />

        {componente.tipo === 'cone' && (
          <Campo label="α — Meio-ângulo do cone (°)" value={d.alfa ?? 30} onChange={(v) => onDadoChange('alfa', Number(v))} />
        )}

        {componente.tipo === 'planoAparafusado' && (
          <>
            <Campo label="N — Nº de parafusos/travas" value={d.N_parafusos ?? 8} onChange={(v) => onDadoChange('N_parafusos', Number(v))} />
            <Campo label="d_par — Diâm. raiz parafuso (mm)" value={d.d_parafuso ?? 25} onChange={(v) => onDadoChange('d_parafuso', Number(v))} />
            <Campo label="S_par — Tensão adm. parafuso (MPa)" value={d.S_parafuso ?? 137.9} onChange={(v) => onDadoChange('S_parafuso', Number(v))} />
          </>
        )}
      </div>
    </div>
  );
}
