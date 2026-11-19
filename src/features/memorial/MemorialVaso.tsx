import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import { camposFaltantesVaso, type TipoComponenteVaso } from '../../calc/vaso';
import { useFocoPreso } from '../../components/useFocoPreso';
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
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { emitirAviso } from '../../services/eventos';
import { avisarCamposFaltando, avisarGereOCalculo } from './avisoMemorial';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
import './memorial.css';
import './memorialEditor.css';

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
  /** Voltar + trilha da página: com ela, as ações (Gerar/Salvar) sobem para a barra do topo. */
  barra?: ReactNode;
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

function MemorialVasoInner({ tag, sufixo = '', titulo = 'Memorial de Cálculo', barra }: Props) {
  const [vaso, setVaso] = useState<VasoSalvo>(() => carregarVaso(tag, sufixo));
  // elemento aberto na janela: edita uma CÓPIA; só o Salvar devolve ao vaso
  const [elemento, setElemento] = useState<{ id: string; rascunho: ComponenteVasoSalvo; novo: boolean } | null>(null);
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

  function abrirElemento(id: string) {
    const c = vaso.componentes.find((x) => x.id === id);
    if (c) setElemento({ id, rascunho: JSON.parse(JSON.stringify(c)) as ComponenteVasoSalvo, novo: false });
  }

  function fecharElemento(salvarElemento: boolean) {
    if (!elemento) return;
    const { id, rascunho, novo } = elemento;
    if (salvarElemento) {
      setVaso((v) => ({ ...v, componentes: v.componentes.map((c) => (c.id === id ? rascunho : c)) }));
      setConfirmados((m) => ({ ...m, [id]: true }));
    } else if (novo) {
      setVaso((v) => ({ ...v, componentes: v.componentes.filter((c) => c.id !== id) }));
    }
    setElemento(null);
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
    setElemento({ id: novo.id, rascunho: JSON.parse(JSON.stringify(novo)) as ComponenteVasoSalvo, novo: true });
  }

  function removerBocal(id: string) {
    setVaso((v) => ({ ...v, componentes: v.componentes.filter((c) => c.id !== id) }));
    setConfirmados((m) => {
      const copia = { ...m };
      delete copia[id];
      return copia;
    });
    if (filtro === id) setFiltro('full');
    setElemento(null);
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
    setElemento(null);
  }

  async function salvar() {
    if (!resumo) { avisarGereOCalculo(); return; }
    const erros = validarCamposVaso(vaso);
    if (erros.length > 0) {
      avisarCamposFaltando(erros);
      return;
    }
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
      }, { minimoMs: 1500 });
      setDirty(false);
      emitirAviso({
        variante: 'sucesso',
        titulo: 'Cálculo salvo',
        texto: 'O memorial de cálculo foi salvo com sucesso no sistema.',
      });
    } catch (e) {
      // O erro REAL, com o texto do erro. Antes ele subia como rejeição não
      // tratada: a tela ficava idêntica à de um salvamento bem-sucedido, sem
      // aviso nenhum — e o usuário só descobria que o memorial não fora salvo
      // ao voltar à ficha.
      emitirAviso({
        variante: 'erro',
        titulo: 'Não foi possível salvar',
        texto: `O memorial NÃO foi salvo: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSalvando(false);
    }
  }

  if (!vaso.orientacao) {
    return (
      <div className="mz-wrap">
      {barra ? <div className="fx-bar mz-topo">{barra}</div> : null}
      <div className="mz">
        <section className="mz-card">
          <header className="mz-h"><h2>{titulo}</h2><span className="mz-norma">ASME VIII Div. 1</span></header>
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
        </section>
      </div>
      </div>
    );
  }

  const resultadoPorComp = resumo?.porComponente ?? [];
  const qtdConfirmados = vaso.componentes.filter((c) => confirmados[c.id]).length;
  const progresso = vaso.componentes.length > 0 ? (qtdConfirmados / vaso.componentes.length) * 100 : 0;

  // Situação de cada elemento na lista/desenho — derivada, nada gravado.
  function situacao(c: ComponenteVasoSalvo): [string, string] {
    if (camposFaltantesVaso(c.tipo, c.dados).length > 0) return ['pend', 'Faltam dados'];
    const r = resultadoPorComp.find((x) => x.id === c.id);
    if (r) return r.resultado.resultado === 'APROVADO' ? ['ok', 'Aprovado'] : ['crit', 'Reprovado'];
    return confirmados[c.id] ? ['conf', 'Confirmado'] : ['novo', 'A conferir'];
  }

  // Cabeçalho do memorial: TAG + "Gerado em dd/mm/aaaa hh:mm · Material X · NR-13 / ASME VIII Div.1"
  const materialMemorial = vaso.componentes
    .map((c) => String(c.dados.mat ?? '').trim())
    .find((m) => m !== '');
  const subMemorial =
    resumo && geradoEm
      ? `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ` +
        `${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` +
        `${materialMemorial ? ` · Material ${materialMemorial}` : ''} · NR-13 / ASME VIII Div.1`
      : '';

  const statusFinal = resumo?.resultado ?? null;
  // Barra de resultado: só números que o motor devolveu
  const comPmta = resultadoPorComp.filter((c) => c.tipo !== 'bocal' && Number.isFinite(Number(c.resultado.pmta)));
  const limitante =
    resumo?.pmtaFinal != null ? comPmta.find((c) => Number(c.resultado.pmta) === resumo.pmtaFinal) ?? null : null;
  const tMins = comPmta.map((c) => Number(c.resultado.t_min)).filter((n) => Number.isFinite(n));
  const espMinima = tMins.length > 0 ? Math.max(...tMins) : null;

  const logParaMostrar =
    filtro === 'full'
      ? resumo?.logCompleto ?? []
      : resultadoPorComp.find((c) => c.id === filtro)?.resultado.log ?? [];

  const acoes = (
    <>
      <span className={`mx-st ${statusFinal ? statusFinal.toLowerCase() : 'aguardando'}`}>
        {statusFinal === 'APROVADO' ? 'Aprovado' : statusFinal === 'REPROVADO' ? 'Reprovado' : statusFinal === 'PENDENTE' ? 'Pendente' : 'Aguardando cálculo'}
      </span>
      <button type="button" className="btn btn-sec mz-gerar" onClick={handleCalcular}>
        <Icone nome="calculator" tam={17} />
        Gerar cálculo
      </button>
      <button
        type="button"
        className={`btn btn-pri mz-salvar-memorial ${salvando ? 'is-loading' : ''}`}
        onClick={salvar}
        disabled={!resumo || salvando}
      >
        <Icone nome="check" tam={16} />
        {salvando ? 'Salvando...' : dirty || !resumo ? 'Salvar memorial' : 'Salvo'}
      </button>
    </>
  );

  return (
    <div className="mz-wrap">
      {barra ? (
        <div className="fx-bar mz-topo">
          {barra}
          <span className="grow" />
          {acoes}
        </div>
      ) : null}

      <div className="mz">
        <section className="mz-card mz-geo">
          <header className="mz-h">
            <h2>{barra ? 'Geometria do vaso' : titulo}</h2>
            <span className="mz-norma">ASME VIII Div. 1</span>
            <span className="grow" />
            <button type="button" className="mz-limpar" onClick={limparCampos} title="Zera os campos na tela — o salvo só muda ao clicar em Salvar">
              Limpar campos
            </button>
            <div className="mx-orient" role="group" aria-label="Orientação">
              <button type="button" aria-pressed={vaso.orientacao === 'vertical'} onClick={() => trocarOrientacao('vertical')}>Vertical</button>
              <button type="button" aria-pressed={vaso.orientacao === 'horizontal'} onClick={() => trocarOrientacao('horizontal')}>Horizontal</button>
            </div>
            {!barra && <span className="mz-acoes-card">{acoes}</span>}
          </header>
          <div className="mz-geo-c">
            <div className="mz-esq">
              <div className="mz-desenho">
                <DesenhoVaso
                  orientacao={vaso.orientacao}
                  componentes={vaso.componentes}
                  ativo={elemento?.id ?? null}
                  situacao={(c) => situacao(c)[0]}
                  diametro={vaso.D}
                  onAbrir={abrirElemento}
                />
                <small>Clique numa parte do vaso ou num item ao lado para preencher</small>
              </div>
              <div className="mz-gerais">
                <CampoMx
                  rotulo="Pressão de projeto P"
                  unidade="MPa"
                  valor={vaso.P}
                  obrigatorio
                  onChange={(v) => setVaso((s) => ({ ...s, P: v === '' ? '' : Number(v) }))}
                />
                <CampoMx
                  rotulo="Diâmetro interno D"
                  unidade="mm"
                  valor={vaso.D}
                  obrigatorio
                  onChange={(v) => setVaso((s) => ({ ...s, D: v === '' ? '' : Number(v) }))}
                />
              </div>
            </div>
            <div className="mz-geo-lado">
              <h3 className="mz-sub">Elementos do vaso</h3>
              <ul className="mz-comps">
                {vaso.componentes.map((c) => {
                  const [s, t] = situacao(c);
                  const r = resultadoPorComp.find((x) => x.id === c.id);
                  const pm = r && c.tipo !== 'bocal' && Number.isFinite(Number(r.resultado.pmta)) ? Number(r.resultado.pmta) : null;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={`mz-comp ${corDoElemento(c.id)} ${elemento?.id === c.id ? 'on' : ''}`}
                        onClick={() => abrirElemento(c.id)}
                      >
                        <span className="cor" />
                        <span className="nm">
                          <b>{c.nome.replace(/\s*\(.*\)$/, '')}</b>
                          <small>{resumoElemento(c)}</small>
                        </span>
                        {pm != null && (
                          <span className="pm">
                            {pm.toFixed(3).replace('.', ',')} <small>MPa</small>
                          </span>
                        )}
                        <span className={`sit s-${s}`}>{t}</span>
                        <Icone nome="pencil" tam={16} className="ed" />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button type="button" className="mz-comp mz-add" onClick={adicionarBocal}>
                    <span className="cor" />
                    <span className="nm">
                      <b>Adicionar bocal</b>
                      <small>Opcional · abertura e reforço (UG-37)</small>
                    </span>
                    <Icone nome="plus" tam={18} />
                  </button>
                </li>
              </ul>
              <div className="mz-prog">
                <span>{qtdConfirmados} de {vaso.componentes.length} elementos preenchidos</span>
                <span className="trk"><i style={{ width: `${progresso}%` }} /></span>
              </div>
            </div>
          </div>
        </section>

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

        <section className="mz-card mz-memo">
          <header className="mz-h">
            <h2>Memorial</h2>
            {subMemorial && <span className="mz-gerado">{subMemorial}</span>}
            <span className="grow" />
            {resumo && (
              <>
                <span className="mz-exib">Exibindo</span>
                <select className="mz-filtro" aria-label="Componente exibido" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="full">todos os componentes</option>
                  {vaso.componentes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome.replace(/\s*\(.*\)$/, '').toLowerCase()}</option>
                  ))}
                </select>
              </>
            )}
          </header>
          <div className="mz-memo-c">
            <MemorialLog
              key={`${calcCount}-${filtro}`}
              log={logParaMostrar}
              animado={calcCount > 0}
              showPlaceholder={calcCount === 0}
              placeholder="Preencha os dados estruturais do equipamento e clique em Gerar Cálculo para ver o memorial técnico desta geometria."
            />
            {calcCount === 0 && (
              <div className="mz-vazio-acao">
                <button type="button" className="btn-novo sq" onClick={handleCalcular}>
                  <Icone nome="calculator" tam={18} />
                  Gerar cálculo
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Barra de resultado — fina ── */}
      <div className="mz-barra">
        {resumo ? (
          <>
            <span><em>PMTA</em><b className="pet">{resumo.pmtaFinal != null ? resumo.pmtaFinal.toFixed(3).replace('.', ',') : '—'}</b><small>MPa</small></span>
            <span><em>Teste (1,3×)</em><b className="pet">{resumo.pthFinal != null ? resumo.pthFinal.toFixed(3).replace('.', ',') : '—'}</b><small>MPa</small></span>
            <span><em>Esp. mínima</em><b>{espMinima != null ? espMinima.toFixed(2).replace('.', ',') : '—'}</b><small>mm</small></span>
            <span><em>Limitante</em><b className="lim">{limitante ? limitante.nome : '—'}</b></span>
            <span className="grow" />
            <span className={`eres ${statusFinal === 'APROVADO' ? 'ok' : statusFinal === 'PENDENTE' ? 'off' : 'crit'}`}>
              {statusFinal === 'APROVADO' ? 'Aprovado' : statusFinal === 'PENDENTE' ? 'Pendente' : 'Reprovado'}
            </span>
          </>
        ) : (
          <span className="mz-barra-vazia">
            <Icone nome="info" tam={16} />
            Resultado aparece aqui depois de gerar o cálculo
          </span>
        )}
      </div>

      {elemento && (
        <ModalElemento
          rascunho={elemento.rascunho}
          novo={elemento.novo}
          pmtaAtual={(() => {
            const r = resultadoPorComp.find((x) => x.id === elemento.id);
            return r && elemento.rascunho.tipo !== 'bocal' && Number.isFinite(Number(r.resultado.pmta)) ? Number(r.resultado.pmta) : null;
          })()}
          onMudar={(rasc) => setElemento((e) => (e ? { ...e, rascunho: rasc } : e))}
          onCancelar={() => fecharElemento(false)}
          onSalvar={() => fecharElemento(true)}
          onRemover={elemento.rascunho.tipo === 'bocal' && !elemento.novo ? () => removerBocal(elemento.id) : undefined}
        />
      )}
    </div>
  );
}

// Cor de identidade de cada elemento (tampo 1 violeta, casco âmbar, tampo 2
// magenta, bocal ciano) — mesma do protótipo; só desenho e lista.
function corDoElemento(id: string): string {
  if (id === 'tampo1') return 'c-t1';
  if (id === 'casco') return 'c-cs';
  if (id === 'tampo2') return 'c-t2';
  return 'c-bc';
}

function rotuloTipo(c: ComponenteVasoSalvo): string {
  if (c.id === 'casco') return 'Casco · UG-27(c)';
  if (c.tipo === 'bocal') return 'Bocal · UG-37';
  const o = OPCOES_TAMPO.find((x) => x.value === c.tipo);
  if (!o) return String(c.tipo);
  const m = o.label.match(/^(.*?)\s*\((.+)\)$/);
  return m ? `${m[1].replace(/^Tampo\s+/, '')} · ${m[2]}` : o.label;
}

function resumoElemento(c: ComponenteVasoSalvo): string {
  const mat = String(c.dados.mat ?? '').trim();
  const t = c.dados.t_comercial;
  const tn = t !== undefined && t !== null && t !== '' ? `${String(t).replace('.', ',')} mm` : 'Tnom —';
  return `${rotuloTipo(c)} · ${mat || '—'} · ${tn}`;
}

function CampoMx({
  rotulo,
  unidade,
  valor,
  onChange,
  obrigatorio = false,
  tipo = 'number',
  cheio = false,
}: {
  rotulo: string;
  unidade?: string;
  valor: unknown;
  onChange: (v: string) => void;
  obrigatorio?: boolean;
  tipo?: 'number' | 'text';
  cheio?: boolean;
}) {
  const v = valor === undefined || valor === null ? '' : String(valor);
  const warn = obrigatorio && !(Number(v) > 0);
  return (
    <label className={`mx-c${warn ? ' warn' : ''}${cheio ? ' full' : ''}`}>
      <span>
        {rotulo}
        {warn && <span className="mx-warn" title="Obrigatório sem valor válido"><Icone nome="alerttri" tam={14} /></span>}
      </span>
      <input
        type={tipo}
        step="any"
        inputMode={tipo === 'number' ? 'decimal' : undefined}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
      />
      {unidade && <em>{unidade}</em>}
    </label>
  );
}

function DesenhoVaso({
  orientacao,
  componentes,
  ativo,
  situacao,
  diametro,
  onAbrir,
}: {
  orientacao: OrientacaoVaso;
  componentes: ComponenteVasoSalvo[];
  ativo: string | null;
  situacao: (c: ComponenteVasoSalvo) => string;
  diametro: unknown;
  onAbrir: (id: string) => void;
}) {
  const zona = (id: string, forma: ReactNode) => {
    const c = componentes.find((x) => x.id === id);
    if (!c) return null;
    return (
      <g
        key={id}
        className={`zz ${corDoElemento(id)} ${id === ativo ? 'on' : ''} s-${situacao(c)}`}
        tabIndex={0}
        role="button"
        aria-label={c.nome}
        onClick={() => onAbrir(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAbrir(id);
          }
        }}
      >
        {forma}
      </g>
    );
  };
  const bocais = componentes.filter((c) => c.tipo === 'bocal');
  const d = Number(diametro);
  if (orientacao === 'horizontal') {
    return (
      <svg viewBox="0 0 420 200" className="mz-svg" aria-label="Geometria do vaso horizontal">
        <defs>
          <pattern id="mz-hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#C9CED8" strokeWidth="1" />
          </pattern>
        </defs>
        {zona('tampo1', <path d="M120 46 C62 46 46 100 46 100 C46 100 62 154 120 154 Z" />)}
        {zona('casco', <rect x="120" y="46" width="180" height="108" />)}
        {zona('tampo2', <path d="M300 46 C358 46 374 100 374 100 C374 100 358 154 300 154 Z" />)}
        {bocais.map((c, i) => zona(c.id, <rect x={168 + (i % 4) * 46} y="22" width="24" height="24" rx="2" />))}
        <path className="sela" d="M146 154l-10 26h56l-10-26M238 154l-10 26h56l-10-26" />
        <rect x="40" y="180" width="340" height="6" fill="url(#mz-hach)" />
        {d > 0 && (
          <>
            <path className="cota" d="M46 196h328" />
            <text x="210" y="194" className="ct">D = {d.toLocaleString('pt-BR')} mm</text>
          </>
        )}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 260 260" className="mz-svg mz-svg-v" aria-label="Geometria do vaso vertical">
      {zona('tampo2', <path d="M80 74 C80 26 130 18 130 18 C130 18 180 26 180 74 Z" />)}
      {zona('casco', <rect x="80" y="74" width="100" height="120" />)}
      {zona('tampo1', <path d="M80 194 C80 242 130 250 130 250 C130 250 180 242 180 194 Z" />)}
      {bocais.map((c, i) => zona(c.id, <rect x="180" y={92 + (i % 3) * 34} width="22" height="20" rx="2" />))}
    </svg>
  );
}

function ModalElemento({
  rascunho,
  novo,
  pmtaAtual,
  onMudar,
  onCancelar,
  onSalvar,
  onRemover,
}: {
  rascunho: ComponenteVasoSalvo;
  novo: boolean;
  pmtaAtual: number | null;
  onMudar: (c: ComponenteVasoSalvo) => void;
  onCancelar: () => void;
  onSalvar: () => void;
  onRemover?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocoPreso(ref, onCancelar);
  const c = rascunho;
  const d = c.dados;
  const ehCasco = c.id === 'casco';
  const ehBocal = c.tipo === 'bocal';
  const num = (v: string) => (v === '' ? '' : Number(v));
  const dado = (chave: string, valor: unknown) => onMudar({ ...c, dados: { ...c.dados, [chave]: valor } });
  const subtitulo = ehCasco
    ? ROTULO_CASCO
    : ehBocal
      ? 'Bocal — Abertura e Reforço (ASME UG-37 / UG-40)'
      : OPCOES_TAMPO.find((o) => o.value === c.tipo)?.label ?? '';
  const vazioTemp = d.temp === undefined || d.temp === null || d.temp === '';

  // Sem onClick no fundo: o elemento tem dados digitados (modal com edição só
  // fecha por X, Cancelar, Salvar ou Esc).
  return (
    <div className="mzm-ov mzm-overlay">
      <div ref={ref} className={`mzm ${corDoElemento(c.id)}`} role="dialog" aria-modal="true" aria-labelledby="mzm-tit">
        <header className="mzm-h">
          <span className="cor" />
          <div className="t">
            <h2 id="mzm-tit">{c.nome}</h2>
            <small>
              {subtitulo}
              {pmtaAtual != null && (
                <>
                  {' · PMTA atual '}
                  <b>{pmtaAtual.toFixed(3).replace('.', ',')} MPa</b>
                </>
              )}
            </small>
          </div>
          <button type="button" className="ibtn" onClick={onCancelar} aria-label="Fechar">
            <Icone nome="x" tam={18} />
          </button>
        </header>
        <div className="mzm-c">
          {ehCasco && <p className="mx-fixo">{ROTULO_CASCO} — espessura pela tensão circunferencial</p>}
          {ehBocal && (
            <CampoMx rotulo="Nome do bocal" tipo="text" cheio valor={c.nome} onChange={(v) => onMudar({ ...c, nome: v })} />
          )}
          {!ehCasco && !ehBocal && (
            <label className="mx-c full">
              <span>Tipo de tampo</span>
              <select value={c.tipo} onChange={(e) => onMudar({ ...c, tipo: e.target.value as TipoComponenteVaso })}>
                {OPCOES_TAMPO.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          <h4 className="mz-grupo"><Icone nome="box" tam={16} />Material e tensão</h4>
          <div className="mx-grid c3">
            <CampoMx rotulo="Material" tipo="text" valor={d.mat} onChange={(v) => dado('mat', v)} />
            <CampoMx rotulo={ehBocal ? 'S — tensão adm. do bocal' : 'S — tensão admissível'} unidade="MPa" obrigatorio valor={d.S} onChange={(v) => dado('S', num(v))} />
            <CampoMx rotulo={ehBocal ? 'E — efic. junta do bocal' : 'E — eficiência de junta'} obrigatorio={!ehBocal} valor={d.E} onChange={(v) => dado('E', num(v))} />
          </div>

          <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Espessuras e corrosão</h4>
          <div className="mx-grid c3">
            {ehBocal && <CampoMx rotulo="d — diâm. interno do bocal" unidade="mm" obrigatorio valor={d.d} onChange={(v) => dado('d', num(v))} />}
            <CampoMx rotulo={ehBocal ? 'Tnom — esp. do pescoço' : 'Tnom — esp. comercial'} unidade="mm" obrigatorio valor={d.t_comercial} onChange={(v) => dado('t_comercial', num(v))} />
            <CampoMx rotulo="CA — corrosão admissível" unidade="mm" valor={d.ca} onChange={(v) => dado('ca', num(v))} />
            <label className={`mx-c${vazioTemp ? ' warn' : ''}`}>
              <span>
                Temperatura de projeto
                {vazioTemp && <span className="mx-warn" title="Obrigatório sem valor válido"><Icone nome="alerttri" tam={14} /></span>}
              </span>
              <input type="number" step="any" inputMode="decimal" value={d.temp === undefined || d.temp === null ? '' : String(d.temp)} onChange={(e) => dado('temp', num(e.target.value))} onWheel={(e) => e.currentTarget.blur()} />
              <em>°C</em>
            </label>
            {ehBocal && <CampoMx rotulo="h — projeção interna" unidade="mm" valor={d.proj_int} onChange={(v) => dado('proj_int', num(v))} />}
            {c.tipo === 'cone' && <CampoMx rotulo="α — meio-ângulo do cone" unidade="°" valor={d.alfa} onChange={(v) => dado('alfa', num(v))} />}
          </div>

          {c.tipo === 'planoAparafusado' && (
            <>
              <h4 className="mz-grupo"><Icone nome="tool" tam={16} />Parafusos (UG-34)</h4>
              <div className="mx-grid c2">
                <CampoMx rotulo="C — fator UG-34 (0,3 aparafusado)" valor={d.C_fator ?? 0.3} onChange={(v) => dado('C_fator', num(v))} />
                <CampoMx rotulo="N — nº de parafusos/travas" valor={d.N_parafusos} onChange={(v) => dado('N_parafusos', num(v))} />
                <CampoMx rotulo="d_par — diâm. raiz do parafuso" unidade="mm" valor={d.d_parafuso} onChange={(v) => dado('d_parafuso', num(v))} />
                <CampoMx rotulo="S_par — tensão adm. do parafuso" unidade="MPa" valor={d.S_parafuso} onChange={(v) => dado('S_parafuso', num(v))} />
              </div>
            </>
          )}

          {ehBocal && (
            <>
              <p className="memorial-bocal-nota">E vazio = 1,0 (bocal sem solda). Projeção interna vazia = 0.</p>
              <label className="memorial-check-reforco">
                <input type="checkbox" checked={!!d.temReforco} onChange={(e) => dado('temReforco', e.target.checked)} />
                Possui chapa de reforço (pad)
              </label>
              {!!d.temReforco && (
                <div className="mx-grid c3" style={{ marginTop: 10 }}>
                  <CampoMx rotulo="W — largura da chapa" unidade="mm" obrigatorio valor={d.w_reforco} onChange={(v) => dado('w_reforco', num(v))} />
                  <CampoMx rotulo="te — esp. da chapa" unidade="mm" obrigatorio valor={d.t_reforco} onChange={(v) => dado('t_reforco', num(v))} />
                  <CampoMx rotulo="Sp — tensão adm. da chapa" unidade="MPa" valor={d.S_reforco} onChange={(v) => dado('S_reforco', num(v))} />
                </div>
              )}
            </>
          )}

          <p className="mx-aviso">
            <Icone nome="alerttri" tam={15} />
            <span>Campo obrigatório vazio deixa o memorial como <b>Pendente</b>.</span>
          </p>
        </div>
        <footer className="mzm-f">
          {onRemover && (
            <button type="button" className="btn btn-perigo" onClick={onRemover}>
              <Icone nome="trash" tam={16} />
              Remover bocal
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sec" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn mz-salvar" onClick={onSalvar}>
            <Icone nome="check" tam={16} />
            {novo ? 'Adicionar' : 'Salvar'} {ehBocal ? 'bocal' : ehCasco ? 'casco' : 'tampo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
