import { useEffect, useRef, useState } from 'react';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import MemorialVaso from './MemorialVaso';
import {
  calcularAutoclave,
  carregarDadosAutoclave,
  salvarDadosAutoclave,
  salvarResultadoAutoclave,
  type DadosAutoclave,
} from './autoclaveMemorialService';
import type { ResultadoCalculo } from '../../calc/tipos';
import './memorial.css';

interface Props {
  tag: string;
  subtipo: 'retangular' | 'cilindrica';
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

export default function MemorialAutoclave(props: Props) {
  return <MemorialAutoclaveInner key={`${props.tag}-${props.subtipo}`} {...props} />;
}

function MemorialAutoclaveInner({ tag, subtipo }: Props) {
  const [aba, setAba] = useState<'principal' | 'geradorVapor'>('principal');
  const [dados, setDados] = useState<DadosAutoclave>(() => carregarDadosAutoclave(tag, subtipo));
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);

  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) setDirty(true);
    else montou.current = true;
  }, [dados]);

  useEffect(() => {
    function aviso(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [dirty]);

  function set(chave: keyof DadosAutoclave, valor: number) {
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  // Material é texto livre (vai para componentes[].material no RESUMO), não entra no cálculo.
  function setMaterial(valor: string) {
    setDados((d) => ({ ...d, material: valor }));
  }

  function handleCalcular() {
    playClick();
    setResultado(calcularAutoclave(subtipo, dados));
    setCalcCount((c) => c + 1);
  }

  async function salvar() {
    if (!resultado) { alert('Gere o cálculo antes de salvar.'); return; }
    const erros: string[] = [];
    if (!dados.pressao || Number(dados.pressao) <= 0) erros.push('Pressão de Projeto (P)');
    if (!dados.tensao || Number(dados.tensao) <= 0) erros.push('Tensão Admissível (S)');
    if (!dados.espessura || Number(dados.espessura) <= 0) erros.push('Espessura real');
    if (!dados.espacamento || Number(dados.espacamento) <= 0) erros.push('Passo entre tirantes (a)');
    if (erros.length > 0) {
      alert('Preencha os seguintes campos antes de salvar:\n• ' + erros.join('\n• '));
      return;
    }
    if (!window.confirm('Salvar o cálculo do memorial? Os dados ficarão disponíveis em "Ver Memorial".')) return;
    setSalvando(true);
    try {
      await salvarDadosAutoclave(tag, subtipo, dados);
      await salvarResultadoAutoclave(tag, subtipo, dados, resultado);
      setDirty(false);
      window.alert('Memorial salvo com sucesso!');
    } finally {
      setSalvando(false);
    }
  }

  const abaLabel = subtipo === 'retangular' ? 'Autoclave Retangular' : 'Autoclave Cilíndrica';

  return (
    <div>
      <div className="abas-caldeira">
        <button type="button" className={`aba-caldeira-btn ${aba === 'principal' ? 'ativa' : ''}`} onClick={() => setAba('principal')}>
          {abaLabel}
        </button>
        <button type="button" className={`aba-caldeira-btn ${aba === 'geradorVapor' ? 'ativa' : ''}`} onClick={() => setAba('geradorVapor')}>
          Gerador de Vapor
        </button>
      </div>

      {aba === 'geradorVapor' ? (
        <MemorialVaso tag={tag} sufixo="gv" titulo="Memorial do Gerador de Vapor (ASME VIII — tratado como vaso)" />
      ) : subtipo === 'cilindrica' ? (
        <MemorialVaso
          tag={tag}
          sufixo="ac_corpo"
          titulo="Memorial do Casco e Tampos da Autoclave (ASME VIII Div.1)"
          imagemSrc="/icon/autoclave-cilindrico.png"
        />
      ) : (
        /* ── Retangular ── */
        <div className="calc-calculadora">
          <div className="calc-card-top-bar">
            <span className="calc-card-title">Dados Técnicos — {abaLabel}</span>
          </div>

          <div className="calc-card-body">
            <div className="calc-campos-section">
              <div className="memorial-campos-grid">
                <Campo label="P — Pressão de Projeto (MPa)" value={dados.pressao ?? ''} warn={!dados.pressao || Number(dados.pressao) <= 0} onChange={(v) => set('pressao', Number(v))} />
                <Campo label="S — Tensão Adm. (MPa)" value={dados.tensao ?? ''} warn={!dados.tensao || Number(dados.tensao) <= 0} onChange={(v) => set('tensao', Number(v))} />
                <Campo label="C — Coef. UG-47 (2.1 ou 2.2)" value={dados.c_stay ?? 2.1} onChange={(v) => set('c_stay', Number(v))} />
                <Campo label="a — Passo entre tirantes (mm)" value={dados.espacamento ?? ''} warn={!dados.espacamento || Number(dados.espacamento) <= 0} onChange={(v) => set('espacamento', Number(v))} />
                <Campo label="t_real — Espessura real (mm)" value={dados.espessura ?? ''} warn={!dados.espessura || Number(dados.espessura) <= 0} onChange={(v) => set('espessura', Number(v))} />
                <Campo label="d — Diâmetro do tirante (mm)" value={dados.diametro_tirante ?? ''} onChange={(v) => set('diametro_tirante', Number(v))} />
                <Campo label="Tensão de escoamento (MPa, opcional)" value={dados.sigma_escoamento ?? 0} onChange={(v) => set('sigma_escoamento', Number(v))} />
                <Campo label="Material" type="text" value={dados.material ?? ''} onChange={setMaterial} />
              </div>
            </div>

            <div className="calc-equip-section">
              <img src="/icon/autoclave-retangular.png" alt="Autoclave Retangular" />
              <span className="calc-equip-label">Autoclave Retangular</span>
              {resultado && (
                <span className={`resultado-final-badge ${resultado.resultado === 'APROVADO' ? 'aprovado' : 'reprovado'}`} style={{ fontSize: 11 }}>
                  {resultado.resultado}
                </span>
              )}
            </div>
          </div>

          <div className="calc-pmta-bar">
            <span>PMTA CALCULADA: <span className="calc-pmta-valor">{resultado?.pmta ? `${resultado.pmta} MPa` : '0.00 MPa'}</span></span>
            <span className="calc-pmta-sep">|</span>
            <span>Esp. Mínima: <span className="calc-pmta-valor">{resultado?.t_min ?? '--'} mm</span></span>
            <span className="calc-pmta-sep">|</span>
            <span>Status: <span className={resultado?.resultado === 'APROVADO' ? 'calc-pmta-status-ok' : resultado?.resultado === 'REPROVADO' ? 'calc-pmta-status-err' : ''}>{resultado?.resultado ?? '--'}</span></span>
          </div>

          <div className="calc-acoes-bar">
            <button type="button" className="btn-gerar-calculo" onClick={handleCalcular}>
              Σ GERAR CÁLCULO
            </button>
            <span className="calc-terminal-label">Memória de Cálculo — {abaLabel}</span>
            <button
              type="button"
              className={`btn-primario ${salvando ? 'is-loading' : ''}`}
              onClick={salvar}
              disabled={!resultado || salvando}
              style={{ opacity: resultado ? 1 : 0.4, fontSize: 12 }}
            >
              {salvando ? 'Salvando...' : '💾 Salvar'}
            </button>
          </div>

          <div className="calc-terminal-section expandido">
            <MemorialLog
              key={calcCount}
              log={resultado?.log ?? []}
              animado={calcCount > 0}
              showPlaceholder={calcCount === 0}
              placeholder={'>> Insira os dados estruturais e clique em "Gerar Cálculo"...'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
