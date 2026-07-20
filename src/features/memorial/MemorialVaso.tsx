import { useEffect, useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import type { TipoComponenteVaso } from '../../calc/vaso';
import Campo from './Campo';
import MemorialLog from './MemorialLog';
import TerminalMemorial from './TerminalMemorial';
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
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
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

// Inputs nascem VAZIOS — o usuário cadastra os valores manualmente (sem defaults
// pré-preenchidos). O motor de cálculo marca PENDENTE enquanto faltar valor.
const DADOS_VAZIOS = { S: '', E: '', t_comercial: '', ca: '', mat: '', temp: '' };

// Ordem de preenchimento (stepper): tampo 1 → casco → tampo 2.
// Tampo 1 = Inferior (vertical) / Esquerdo (horizontal); tampo 2 = Superior / Direito.
function rotuloTampo(orientacao: OrientacaoVaso, posicao: 'tampo1' | 'tampo2'): string {
  if (orientacao === 'vertical') return posicao === 'tampo1' ? 'Tampo Inferior' : 'Tampo Superior';
  return posicao === 'tampo1' ? 'Tampo Esquerdo' : 'Tampo Direito';
}

function novoComponentes(orientacao: OrientacaoVaso): ComponenteVasoSalvo[] {
  return [
    { id: 'tampo1', nome: rotuloTampo(orientacao, 'tampo1'), tipo: 'eliptico', dados: { ...DADOS_VAZIOS } },
    { id: 'casco', nome: ROTULO_CASCO, tipo: 'cilindrico', dados: { ...DADOS_VAZIOS } },
    { id: 'tampo2', nome: rotuloTampo(orientacao, 'tampo2'), tipo: 'eliptico', dados: { ...DADOS_VAZIOS } },
  ];
}

// Som de CONCLUSÃO ao gerar o memorial: dois tons ascendentes suaves (C5 → G5),
// sensação de tarefa concluída — substitui o estalo antigo.
function playSucesso() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const notas = [523.25, 783.99];
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    });
    setTimeout(() => { void ctx.close(); }, 900);
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
  if (!vaso.P || Number(vaso.P) <= 0) erros.push('Pressão de Projeto (P)');
  if (!vaso.D || Number(vaso.D) <= 0) erros.push('Diâmetro Interno (D)');
  for (const comp of vaso.componentes) {
    const d = comp.dados;
    if (comp.tipo === 'bocal') {
      if (!d.d || Number(d.d) <= 0) erros.push(`${comp.nome}: d — Diâmetro do Bocal`);
      if (!d.S || Number(d.S) <= 0) erros.push(`${comp.nome}: Tensão Admissível (S)`);
      if (!d.t_comercial || Number(d.t_comercial) <= 0) erros.push(`${comp.nome}: Espessura do Pescoço (Tnom)`);
      if (d.temp === undefined || d.temp === null || d.temp === '') erros.push(`${comp.nome}: Temperatura`);
      if (d.temReforco) {
        if (!d.w_reforco || Number(d.w_reforco) <= 0) erros.push(`${comp.nome}: W — Largura da Chapa de Reforço`);
        if (!d.t_reforco || Number(d.t_reforco) <= 0) erros.push(`${comp.nome}: te — Espessura da Chapa de Reforço`);
      }
      continue;
    }
    if (!d.S || Number(d.S) <= 0) erros.push(`${comp.nome}: Tensão Admissível (S)`);
    if (!d.E || Number(d.E) <= 0) erros.push(`${comp.nome}: Eficiência (E)`);
    if (!d.t_comercial || Number(d.t_comercial) <= 0) erros.push(`${comp.nome}: Espessura Nominal (Tnom)`);
    if (d.temp === undefined || d.temp === null || d.temp === '') erros.push(`${comp.nome}: Temperatura`);
  }
  return erros;
}

function MemorialVasoInner({ tag, sufixo = '', titulo = 'Memorial de Cálculo', imagemSrc }: Props) {
  const [vaso, setVaso] = useState<VasoSalvo>(() => carregarVaso(tag, sufixo));
  const [abaId, setAbaId] = useState<string>('tampo1');
  const [resumo, setResumo] = useState<ResumoMemorialVaso | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [dirty, setDirty] = useState(false);
  // etapas confirmadas (botão OK) — verde no stepper, barra de progresso
  const [confirmados, setConfirmados] = useState<Record<string, boolean>>({});
  // filtro do terminal: 'full' = memorial completo | id do componente = só aquela etapa
  const [filtro, setFiltro] = useState<string>('full');
  // instante do último "Gerar Cálculo" — linha "Gerado em ..." no topo do terminal
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  // marca "não salvo" a cada alteração do vaso (ignora a montagem inicial)
  const montou = useRef(false);
  useEffect(() => {
    if (montou.current) setDirty(true);
    else montou.current = true;
  }, [vaso]);

  // avisa ao sair (navegação interna ou fechar/recarregar) com memorial não salvo
  useAvisoSairSemSalvar(dirty);

  function escolherOrientacao(orientacao: OrientacaoVaso) {
    setVaso((v) => ({
      ...v,
      orientacao,
      componentes: v.componentes.length >= 3 ? v.componentes : novoComponentes(orientacao),
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

  // editar um componente desfaz a confirmação daquela etapa
  function invalidarConfirmacao(id: string) {
    setConfirmados((m) => (m[id] ? { ...m, [id]: false } : m));
  }

  function atualizarTipoTampo(id: 'tampo1' | 'tampo2', tipo: TipoComponenteVaso) {
    // troca só o tipo — preserva S/E/Tnom/CA já digitados pelo usuário
    setVaso((v) => ({
      ...v,
      componentes: v.componentes.map((c) => (c.id === id ? { ...c, tipo } : c)),
    }));
    invalidarConfirmacao(id);
  }

  function atualizarDado(id: string, chave: string, valor: unknown) {
    setVaso((v) => ({
      ...v,
      componentes: v.componentes.map((c) => (c.id === id ? { ...c, dados: { ...c.dados, [chave]: valor } } : c)),
    }));
    invalidarConfirmacao(id);
  }

  function adicionarBocal() {
    const seq = vaso.componentes
      .filter((c) => c.tipo === 'bocal')
      .reduce((m, c) => Math.max(m, Number(String(c.id).replace('bocal', '')) || 0), 0) + 1;
    const novo: ComponenteVasoSalvo = {
      id: `bocal${seq}`,
      nome: `Bocal N${seq}`,
      tipo: 'bocal',
      dados: { ...DADOS_VAZIOS },
    };
    setVaso((v) => ({ ...v, componentes: [...v.componentes, novo] }));
    setAbaId(`bocal${seq}`);
  }

  function removerBocal(id: string) {
    if (!window.confirm('Remover este bocal do memorial?')) return;
    setVaso((v) => ({ ...v, componentes: v.componentes.filter((c) => c.id !== id) }));
    setConfirmados((m) => {
      const copia = { ...m };
      delete copia[id];
      return copia;
    });
    if (filtro === id) setFiltro('full');
    if (abaId === id) setAbaId('casco');
  }

  function atualizarNome(id: string, nome: string) {
    setVaso((v) => ({ ...v, componentes: v.componentes.map((c) => (c.id === id ? { ...c, nome } : c)) }));
  }

  function handleCalcular() {
    playSucesso();
    setResumo(calcularResumoVaso(vaso));
    setGeradoEm(new Date());
    setCalcCount((c) => c + 1);
    // cálculo gerado e ainda não salvo → alerta ao sair sem Salvar
    setDirty(true);
  }

  // Zera os campos na tela (dados salvos só mudam quando clicar em Salvar).
  // Útil quando a TAG tem memorial antigo gravado com os defaults de fábrica.
  function limparCampos() {
    if (!window.confirm('Limpar todos os campos da calculadora? Os dados salvos só serão substituídos quando você clicar em Salvar.')) return;
    setVaso((v) => ({
      tag: v.tag,
      P: '',
      D: '',
      orientacao: v.orientacao,
      componentes: novoComponentes(v.orientacao ?? 'vertical'),
    }));
    setConfirmados({});
    setResumo(null);
    setGeradoEm(null);
    setCalcCount(0);
    setFiltro('full');
    setAbaId('tampo1');
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
      // Recalcula com os INPUTS ATUAIS: `resumo` guarda o último "Gerar Cálculo" e o usuário
      // pode ter editado campos depois — salvar o resumo velho gravava nr13_calc_<TAG>
      // inconsistente com nr13_vaso_<TAG> (PMTA do RESUMO-MEMORIAL não batia com os dados).
      const resumoAtual = calcularResumoVaso(vaso);
      setResumo(resumoAtual);
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarVaso(tag, vaso, sufixo);
        await salvarResumoVaso(tag, resumoAtual, sufixo);
      });
      setDirty(false);
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
  const idxAtivo = vaso.componentes.findIndex((c) => c.id === abaId);
  const ehUltimo = idxAtivo === vaso.componentes.length - 1;
  const resultadoPorComp = resumo?.porComponente ?? [];
  const resultadoAtivo = resultadoPorComp.find((c) => c.id === abaId)?.resultado ?? null;

  const qtdConfirmados = vaso.componentes.filter((c) => confirmados[c.id]).length;
  const todosConfirmados = qtdConfirmados === vaso.componentes.length;
  const progresso = vaso.componentes.length > 0 ? (qtdConfirmados / vaso.componentes.length) * 100 : 0;

  function irPara(idx: number) {
    const c = vaso.componentes[idx];
    if (c) setAbaId(c.id);
  }

  function confirmarEtapa() {
    setConfirmados((m) => ({ ...m, [abaId]: true }));
    // avança suavemente pra próxima etapa
    if (!ehUltimo) setTimeout(() => irPara(idxAtivo + 1), 450);
  }

  // Cabeçalho do terminal (padrão design/painel_pmta): título com a TAG e a
  // linha "Gerado em dd/mm/aaaa hh:mm · Material X · NR-13 / ASME VIII Div.1"
  const materialMemorial = vaso.componentes
    .map((c) => String(c.dados.mat ?? '').trim())
    .find((m) => m !== '');
  const cabecalhoTerminal =
    resumo && geradoEm
      ? {
          titulo: `Memorial de Cálculo — TAG: ${tag}`,
          sub:
            `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ` +
            `${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` +
            `${materialMemorial ? ` · Material ${materialMemorial}` : ''} · NR-13 / ASME VIII Div.1`,
        }
      : undefined;

  const pmtaDisplay = resumo?.pmtaFinal != null ? `${resumo.pmtaFinal.toFixed(2)} MPa` : '0.00 MPa';
  const tMinDisplay = resultadoAtivo?.t_min ?? '--';
  const pthDisplay = resumo?.pthFinal != null ? `${resumo.pthFinal.toFixed(2)} MPa` : '--';
  const statusFinal = resumo?.resultado ?? null;

  const logParaMostrar =
    filtro === 'full'
      ? resumo?.logCompleto ?? []
      : resultadoPorComp.find((c) => c.id === filtro)?.resultado.log ?? [];

  const filtrosTerminal = [
    { id: 'full', label: 'Completo' },
    ...vaso.componentes.map((c) => ({ id: c.id, label: c.nome.replace(/\s*\(.*\)$/, '') })),
  ];

  return (
    <div className="calc-calculadora">
      {/* ── Top bar: título + stepper (tampo 1 → casco → tampo 2) + orientação ── */}
      <div className="calc-card-top-bar">
        <div className="calc-top-row">
          <div className="calc-stepper">
            {vaso.componentes.map((c, i) => {
              const done = !!confirmados[c.id];
              const res = resultadoPorComp.find((r) => r.id === c.id);
              return (
                <span key={c.id} className="calc-step-item">
                  <button
                    type="button"
                    className={`calc-step ${c.id === abaId ? 'ativa' : ''} ${done ? 'done' : ''}`}
                    onClick={() => irPara(i)}
                  >
                    <span className="num">
                      {done ? (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="calc-step-nome">{c.nome.replace(/\s*\(.*\)$/, '')}</span>
                    {res && <span className={`calc-tab-dot ${res.resultado.resultado === 'APROVADO' ? 'ok' : 'err'}`} />}
                  </button>
                  {i < vaso.componentes.length - 1 && (
                    <span className={`calc-step-arrow ${done ? 'filled' : ''}`}>
                      <Icone nome="chevright" tam={15} />
                    </span>
                  )}
                </span>
              );
            })}
            <button
              type="button"
              className="calc-step calc-step-add-bocal"
              onClick={adicionarBocal}
              title="Adicionar bocal (opcional — abertura e reforço UG-37)"
            >
              <span className="num">+</span>
              <span className="calc-step-nome">Bocal</span>
            </button>
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
        <div className="calc-progress"><i style={{ width: `${progresso}%` }} /></div>
      </div>

      {/* ── Card body: campos + painel do equipamento ── */}
      <div className="calc-card-body">
        <div className="calc-campos-section">
          <p className="memorial-legenda-aviso">
            <span className="campo-aviso-icon">⚠</span> = campo obrigatório sem valor válido. O cálculo usa
            valores padrão nesses campos e o memorial sai como <b>PENDENTE</b> até você preencher.
          </p>
          {/* P e D globais */}
          <div className="memorial-campos-grid">
            <Campo
              label="Pressão de Projeto P (MPa)"
              value={vaso.P}
              warn={!vaso.P || Number(vaso.P) <= 0}
              onChange={(v) => setVaso((s) => ({ ...s, P: v === '' ? '' : Number(v) }))}
            />
            <Campo
              label="Diâmetro Interno D (mm)"
              value={vaso.D}
              warn={!vaso.D || Number(vaso.D) <= 0}
              onChange={(v) => setVaso((s) => ({ ...s, D: v === '' ? '' : Number(v) }))}
            />
          </div>

          {/* Campos do componente ativo */}
          <ComponenteCampos
            componente={componenteAtivo}
            onTipoChange={(tipo) => atualizarTipoTampo(componenteAtivo.id as 'tampo1' | 'tampo2', tipo)}
            onDadoChange={(chave, valor) => atualizarDado(componenteAtivo.id, chave, valor)}
            onNomeChange={(nome) => atualizarNome(componenteAtivo.id, nome)}
            onRemover={componenteAtivo.tipo === 'bocal' ? () => removerBocal(componenteAtivo.id) : undefined}
          />

          {/* Navegação sequencial: Voltar | OK (confirma etapa) | Próximo */}
          <div className="calc-nav-row">
            <button type="button" className="btn-nav-ghost" disabled={idxAtivo === 0} onClick={() => irPara(idxAtivo - 1)}>
              <Icone nome="chevleft" tam={15} />
              Voltar
            </button>
            <div className="calc-nav-right">
              <button
                type="button"
                className={`btn-ok ${confirmados[abaId] ? 'confirmed' : ''}`}
                onClick={confirmarEtapa}
              >
                {confirmados[abaId] ? (
                  <>
                    <Icone nome="check" tam={14} />
                    Salvo
                  </>
                ) : (
                  'OK'
                )}
              </button>
              {ehUltimo ? (
                <span className="calc-nav-nota">Último componente</span>
              ) : (
                <button type="button" className="btn-nav-next" onClick={() => irPara(idxAtivo + 1)}>
                  Próximo
                  <Icone nome="chevright" tam={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Painel do equipamento */}
        <div className="calc-equip-section">
          {imagemSrc ? (
            <img src={imagemSrc} alt={componenteAtivo.nome} />
          ) : (
            <Icone nome="calculator" tam={44} />
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

      {/* ── Banner de campos faltantes (PENDENTE) ── */}
      {resumo && resumo.resultado === 'PENDENTE' && (
        <div className="memorial-banner-pendente">
          <b>Cálculo PENDENTE — campos obrigatórios sem valor:</b>
          <ul>
            {resumo.porComponente
              .filter((c) => (c.resultado.faltantes ?? []).length > 0)
              .map((c) => (
                <li key={c.id}>
                  {c.nome}: {(c.resultado.faltantes ?? []).join(', ')}
                </li>
              ))}
            {(!vaso.P || Number(vaso.P) <= 0) && <li>Dados gerais: P — Pressão de Projeto</li>}
            {(!vaso.D || Number(vaso.D) <= 0) && <li>Dados gerais: D — Diâmetro Interno</li>}
          </ul>
        </div>
      )}

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
        <button type="button" className={`btn-gerar-calculo ${todosConfirmados ? 'ready' : ''}`} onClick={handleCalcular}>
          Σ GERAR CÁLCULO
        </button>
        <button type="button" className="btn-limpar-campos" onClick={limparCampos} title="Zera os campos na tela — o salvo só muda ao clicar em Salvar">
          Limpar
        </button>
        <span className="calc-terminal-label">Memória de Cálculo — {titulo}</span>
        <button
          type="button"
          className={`btn-primario ${salvando ? 'is-loading' : ''}`}
          onClick={salvar}
          disabled={!resumo || salvando}
          style={{ opacity: resumo ? 1 : 0.4, fontSize: 12 }}
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* ── Terminal (coluna direita no desktop) com filtro Completo/por etapa ── */}
      <TerminalMemorial
        arquivo={`memorial_${tag.toLowerCase().replace(/\s+/g, '_')}.log`}
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
          placeholder={'>> Insira os dados estruturais e clique em "Gerar Cálculo"...'}
        />
      </TerminalMemorial>

    </div>
  );
}

function ComponenteCampos({
  componente,
  onTipoChange,
  onDadoChange,
  onNomeChange,
  onRemover,
}: {
  componente: ComponenteVasoSalvo;
  onTipoChange: (tipo: TipoComponenteVaso) => void;
  onDadoChange: (chave: string, valor: unknown) => void;
  onNomeChange: (nome: string) => void;
  onRemover?: () => void;
}) {
  const d = componente.dados;
  const ehCasco = componente.id === 'casco';

  if (componente.tipo === 'bocal') {
    return (
      <div>
        <div className="memorial-bocal-header">
          <p className="memorial-tipo-fixo">Bocal — Abertura e Reforço (ASME UG-37 / UG-40)</p>
          {onRemover && (
            <button type="button" className="btn-remover-bocal" onClick={onRemover}>
              Remover bocal
            </button>
          )}
        </div>
        <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
          <Campo label="Nome do Bocal" type="text" value={componente.nome} warn={false} onChange={onNomeChange} />
          <Campo label="d — Diâm. Interno do Bocal (mm)" value={d.d ?? ''} warn={!d.d || Number(d.d) <= 0} onChange={(v) => onDadoChange('d', v === '' ? '' : Number(v))} />
          <Campo label="Tnom — Esp. do Pescoço (mm)" value={d.t_comercial ?? ''} warn={!d.t_comercial || Number(d.t_comercial) <= 0} onChange={(v) => onDadoChange('t_comercial', v === '' ? '' : Number(v))} />
          <Campo label="CA — Corrosão Adm. (mm)" value={d.ca ?? ''} warn={false} onChange={(v) => onDadoChange('ca', v === '' ? '' : Number(v))} />
          <Campo label="S — Tensão Adm. do Bocal (MPa)" value={d.S ?? ''} warn={!d.S || Number(d.S) <= 0} onChange={(v) => onDadoChange('S', v === '' ? '' : Number(v))} />
          <Campo label="E — Efic. Junta do Bocal" value={d.E ?? ''} warn={false} onChange={(v) => onDadoChange('E', v === '' ? '' : Number(v))} />
          <Campo label="Material" type="text" value={d.mat ?? ''} warn={false} onChange={(v) => onDadoChange('mat', v)} />
          <Campo label="Temp. Projeto (°C)" value={d.temp ?? ''} warn={d.temp === undefined || d.temp === null || d.temp === ''} onChange={(v) => onDadoChange('temp', v === '' ? '' : Number(v))} />
          <Campo label="h — Projeção Interna (mm)" value={d.proj_int ?? ''} warn={false} onChange={(v) => onDadoChange('proj_int', v === '' ? '' : Number(v))} />
        </div>
        <p className="memorial-bocal-nota">E vazio = 1,0 (bocal sem solda). Projeção interna vazia = 0.</p>
        <label className="memorial-check-reforco">
          <input type="checkbox" checked={!!d.temReforco} onChange={(e) => onDadoChange('temReforco', e.target.checked)} />
          Possui chapa de reforço (pad)
        </label>
        {!!d.temReforco && (
          <div className="memorial-campos-grid" style={{ marginTop: 10 }}>
            <Campo label="W — Largura da Chapa (mm)" value={d.w_reforco ?? ''} warn={!d.w_reforco || Number(d.w_reforco) <= 0} onChange={(v) => onDadoChange('w_reforco', v === '' ? '' : Number(v))} />
            <Campo label="te — Esp. da Chapa (mm)" value={d.t_reforco ?? ''} warn={!d.t_reforco || Number(d.t_reforco) <= 0} onChange={(v) => onDadoChange('t_reforco', v === '' ? '' : Number(v))} />
            <Campo label="Sp — Tensão Adm. da Chapa (MPa)" value={d.S_reforco ?? ''} warn={false} onChange={(v) => onDadoChange('S_reforco', v === '' ? '' : Number(v))} />
          </div>
        )}
      </div>
    );
  }

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
        <Campo label="S — Tensão Adm. (MPa)" value={d.S ?? ''} warn={!d.S || Number(d.S) <= 0} onChange={(v) => onDadoChange('S', v === '' ? '' : Number(v))} />
        <Campo label="E — Eficiência Junta" value={d.E ?? ''} warn={!d.E || Number(d.E) <= 0} onChange={(v) => onDadoChange('E', v === '' ? '' : Number(v))} />
        <Campo label="Tnom — Esp. Comercial (mm)" value={d.t_comercial ?? ''} warn={!d.t_comercial || Number(d.t_comercial) <= 0} onChange={(v) => onDadoChange('t_comercial', v === '' ? '' : Number(v))} />
        <Campo label="CA — Corrosão Adm. (mm)" value={d.ca ?? ''} onChange={(v) => onDadoChange('ca', v === '' ? '' : Number(v))} />
        <Campo label="Material" type="text" value={d.mat ?? ''} onChange={(v) => onDadoChange('mat', v)} />
        <Campo label="Temp. Projeto (°C)" value={d.temp ?? ''} warn={d.temp === undefined || d.temp === null || d.temp === ''} onChange={(v) => onDadoChange('temp', v === '' ? '' : Number(v))} />

        {componente.tipo === 'cone' && (
          <Campo label="α — Meio-ângulo do cone (°)" value={d.alfa ?? ''} onChange={(v) => onDadoChange('alfa', v === '' ? '' : Number(v))} />
        )}

        {componente.tipo === 'planoAparafusado' && (
          <>
            <Campo label="C — Fator UG-34 (0.3 aparafusado)" value={d.C_fator ?? 0.3} onChange={(v) => onDadoChange('C_fator', v === '' ? '' : Number(v))} />
            <Campo label="N — Nº de parafusos/travas" value={d.N_parafusos ?? ''} onChange={(v) => onDadoChange('N_parafusos', v === '' ? '' : Number(v))} />
            <Campo label="d_par — Diâm. raiz parafuso (mm)" value={d.d_parafuso ?? ''} onChange={(v) => onDadoChange('d_parafuso', v === '' ? '' : Number(v))} />
            <Campo label="S_par — Tensão adm. parafuso (MPa)" value={d.S_parafuso ?? ''} onChange={(v) => onDadoChange('S_parafuso', v === '' ? '' : Number(v))} />
          </>
        )}
      </div>
    </div>
  );
}
