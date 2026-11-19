import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from '../../components/Icone';
import { AcoesMz, BarraResultadoMz, CampoMx, CartaoMemorialMz, ModalElementoMz } from './EditorMz';
import {
  calcularResumoCaldeira,
  carregarCaldeira,
  salvarCaldeira,
  salvarResumoCaldeira,
  type CaldeiraSalva,
  type ResumoMemorialCaldeira,
} from './caldeiraMemorialService';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { emitirAviso } from '../../services/eventos';
import { avisarCamposFaltando, avisarGereOCalculo } from './avisoMemorial';
import { useAvisoSairSemSalvar } from './useAvisoSairSemSalvar';
import './memorial.css';

type EtapaId = 'costado' | 'tubo' | 'espelho';

const ETAPAS: { id: EtapaId; nome: string; ref: string }[] = [
  { id: 'costado', nome: 'Costado', ref: 'PG-27.2.2' },
  { id: 'tubo', nome: 'Tubo', ref: 'PG-27.2.1' },
  { id: 'espelho', nome: 'Espelho', ref: 'PG-46.1' },
];

interface Props {
  tag: string;
  /** Voltar + trilha da página: com ela, Gerar/Salvar sobem para a barra do topo. */
  barra?: ReactNode;
}

export default function MemorialCaldeira(props: Props) {
  return <MemorialCaldeiraInner key={props.tag} {...props} />;
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

function MemorialCaldeiraInner({ tag, barra }: Props) {
  const [cald, setCald] = useState<CaldeiraSalva>(() => carregarCaldeira(tag));
  // elemento aberto na janela: edita uma CÓPIA; só o Salvar devolve à caldeira
  const [elemento, setElemento] = useState<{ id: EtapaId; rascunho: Record<string, unknown> } | null>(null);
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

  function handleCalcular() {
    setResumo(calcularResumoCaldeira(cald));
    setGeradoEm(new Date());
    setCalcCount((n) => n + 1);
    setDirty(true);
  }

  async function salvar() {
    if (!resumo) { avisarGereOCalculo(); return; }
    const erros = validarCamposCaldeira(cald);
    if (erros.length > 0) {
      avisarCamposFaltando(erros);
      return;
    }
    setSalvando(true);
    try {
      await comLoadingGlobal('Salvando memorial...', async () => {
        await salvarCaldeira(tag, cald);
        await salvarResumoCaldeira(tag, resumo);
      }, { minimoMs: 1500 });
      setDirty(false);
      emitirAviso({
        variante: 'sucesso',
        titulo: 'Cálculo salvo',
        texto: 'O memorial de cálculo foi salvo com sucesso no sistema.',
      });
    } catch (e) {
      // Ver o mesmo bloco em `MemorialVaso`: erro de gravação não pode sair da
      // tela igual a um sucesso.
      emitirAviso({
        variante: 'erro',
        titulo: 'Não foi possível salvar',
        texto: `O memorial NÃO foi salvo: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSalvando(false);
    }
  }

  const statusFinal = resumo?.resultado ?? null;
  const qtdConfirmados = ETAPAS.filter((e) => confirmados[e.id]).length;
  const progresso = (qtdConfirmados / ETAPAS.length) * 100;

  function situacao(id: EtapaId): [string, string] {
    const r = resumo?.etapas.find((x) => x.id === id)?.resultado;
    if (r && r.faltantes.length > 0) return ['pend', 'Faltam dados'];
    if (r) return r.resultado === 'APROVADO' ? ['ok', 'Aprovado'] : ['crit', 'Reprovado'];
    return confirmados[id] ? ['conf', 'Confirmado'] : ['novo', 'A conferir'];
  }

  function abrirElemento(id: EtapaId) {
    setElemento({ id, rascunho: JSON.parse(JSON.stringify(cald[id] ?? {})) as Record<string, unknown> });
  }
  function fecharElemento(salvarElemento: boolean) {
    if (elemento && salvarElemento) {
      setCald((c) => ({ ...c, [elemento.id]: elemento.rascunho }));
      setConfirmados((m) => ({ ...m, [elemento.id]: true }));
    }
    setElemento(null);
  }

  const sub = geradoEm
    ? `Gerado em ${geradoEm.toLocaleDateString('pt-BR')} ${geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · NR-13 / ASME Seção I (2004)`
    : '';
  const logParaMostrar =
    filtro === 'full' ? resumo?.logCompleto ?? [] : resumo?.etapas.find((e) => e.id === filtro)?.resultado.log ?? [];
  const eMax = resumo ? Math.max(...resumo.etapas.map((e) => e.resultado.e).filter((n) => Number.isFinite(n))) : null;
  const acoes = (
    <AcoesMz
      status={statusFinal}
      aoGerar={handleCalcular}
      aoSalvar={salvar}
      podeSalvar={!!resumo}
      salvando={salvando}
      salvo={!!resumo && !dirty}
    />
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
            <h2>Geometria da caldeira</h2>
            <span className="mz-norma">ASME Seção I (2004)</span>
            <span className="grow" />
            {!barra && <span className="mz-acoes-card">{acoes}</span>}
          </header>
          <div className="mz-geo-c">
            <div className="mz-esq">
              <div className="mz-desenho">
                <DesenhoCaldeira ativo={elemento?.id ?? null} situacao={(id) => situacao(id)[0]} onAbrir={abrirElemento} />
                <small>Clique numa parte da caldeira ou num item ao lado para preencher</small>
              </div>
              {/* P e temp são globais: toda etapa depende delas, então mudar
                  qualquer uma invalida todas as confirmações já feitas. */}
              <div className="mz-gerais">
                <CampoMx
                  rotulo="Pressão de projeto P"
                  unidade="MPa"
                  obrigatorio
                  valor={cald.P}
                  onChange={(v) => {
                    setCald((s) => ({ ...s, P: v === '' ? '' : Number(v) }));
                    setConfirmados({});
                  }}
                />
                <CampoMx
                  rotulo="Temperatura de projeto"
                  unidade="°C"
                  obrigatorio
                  aceitaZero
                  valor={cald.temp}
                  onChange={(v) => {
                    setCald((s) => ({ ...s, temp: v === '' ? '' : Number(v) }));
                    setConfirmados({});
                  }}
                />
              </div>
            </div>
            <div className="mz-geo-lado">
              <h3 className="mz-sub">Elementos da caldeira</h3>
              <ul className="mz-comps">
                {ETAPAS.map((e) => {
                  const [s, t] = situacao(e.id);
                  const r = resumo?.etapas.find((x) => x.id === e.id)?.resultado;
                  const d = (cald[e.id] ?? {}) as Record<string, unknown>;
                  const mat = String(d.mat ?? '').trim();
                  const esp = d.espEncontrada !== undefined && d.espEncontrada !== '' ? `${String(d.espEncontrada).replace('.', ',')} mm` : 'esp. —';
                  return (
                    <li key={e.id}>
                      <button type="button" className={`mz-comp ${COR[e.id]} ${elemento?.id === e.id ? 'on' : ''}`} onClick={() => abrirElemento(e.id)}>
                        <span className="cor" />
                        <span className="nm">
                          <b>{e.nome}</b>
                          <small>
                            {e.ref} · {mat || '—'} · {esp}
                          </small>
                        </span>
                        {r && Number.isFinite(r.e) && (
                          <span className="pm">
                            e {r.e.toFixed(2).replace('.', ',')} <small>mm</small>
                          </span>
                        )}
                        <span className={`sit s-${s}`}>{t}</span>
                        <Icone nome="pencil" tam={16} className="ed" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mz-prog">
                <span>
                  {qtdConfirmados} de {ETAPAS.length} elementos preenchidos
                </span>
                <span className="trk">
                  <i style={{ width: `${progresso}%` }} />
                </span>
              </div>
            </div>
          </div>
        </section>

        {resumo && resumo.resultado === 'PENDENTE' && (
          <div className="memorial-banner-pendente">
            <b>Cálculo PENDENTE — campos obrigatórios sem valor:</b>
            <ul>
              {resumo.etapas
                .filter((e) => e.resultado.faltantes.length > 0)
                .map((e) => (
                  <li key={e.id}>
                    {e.nome}: {e.resultado.faltantes.join(', ')}
                  </li>
                ))}
              {(!cald.P || Number(cald.P) <= 0) && <li>Dados gerais: P — Pressão de Projeto</li>}
              {(cald.temp === '' || cald.temp === null || cald.temp === undefined) && <li>Dados gerais: Temperatura de Projeto</li>}
            </ul>
          </div>
        )}

        <CartaoMemorialMz
          log={logParaMostrar}
          calcCount={calcCount}
          sub={sub}
          placeholder="Preencha os dados da caldeira e clique em Gerar Cálculo para ver o memorial técnico desta geometria."
          filtros={[{ id: 'full', label: 'todos os componentes' }, ...ETAPAS.map((e) => ({ id: e.id, label: e.nome.toLowerCase() }))]}
          filtro={filtro}
          aoFiltro={setFiltro}
          aoGerar={handleCalcular}
        />
      </div>

      <BarraResultadoMz
        temResultado={!!resumo}
        status={statusFinal}
        itens={[
          { rotulo: 'PMTA', valor: resumo?.pmtaKgf != null ? resumo.pmtaKgf.toFixed(2).replace('.', ',') : '—', un: 'kgf/cm²', classe: 'pet' },
          { rotulo: 'TH (1,5×)', valor: resumo?.thKgf != null ? resumo.thKgf.toFixed(2).replace('.', ',') : '—', un: 'kgf/cm²', classe: 'pet' },
          { rotulo: 'Esp. mínima', valor: eMax != null && Number.isFinite(eMax) ? eMax.toFixed(2).replace('.', ',') : '—', un: 'mm' },
        ]}
      />

      {elemento && (
        <ModalElementoMz
          cor={COR[elemento.id]}
          titulo={ETAPAS.find((e) => e.id === elemento.id)!.nome}
          subtitulo={FORMULA[elemento.id]}
          rotuloSalvar={`Salvar ${ETAPAS.find((e) => e.id === elemento.id)!.nome.toLowerCase()}`}
          onCancelar={() => fecharElemento(false)}
          onSalvar={() => fecharElemento(true)}
        >
          <CamposEtapa
            etapa={elemento.id}
            d={elemento.rascunho}
            onChange={(chave, valor) => setElemento((x) => (x ? { ...x, rascunho: { ...x.rascunho, [chave]: valor } } : x))}
          />
        </ModalElementoMz>
      )}
    </div>
  );
}

const COR: Record<EtapaId, string> = { costado: 'c-cs', tubo: 'c-bc', espelho: 'c-t1' };
const FORMULA: Record<EtapaId, string> = {
  costado: 'ASME I-2004, PG-27.2.2 · e = P·D/(2·S·E + 2·y·P) + C',
  tubo: 'ASME I-2004, PG-27.2.1 · e = P·D/(2S+P) + 0,005·D + e',
  espelho: 'ASME I-2004, PG-46.1 · e = p·√(P/(S·C))',
};

function DesenhoCaldeira({
  ativo,
  situacao,
  onAbrir,
}: {
  ativo: EtapaId | null;
  situacao: (id: EtapaId) => string;
  onAbrir: (id: EtapaId) => void;
}) {
  const zona = (id: EtapaId, rotulo: string, forma: ReactNode) => (
    <g
      key={id}
      className={`zz ${COR[id]} ${id === ativo ? 'on' : ''} s-${situacao(id)}`}
      tabIndex={0}
      role="button"
      aria-label={rotulo}
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
  return (
    <svg viewBox="0 0 420 200" className="mz-svg" aria-label="Geometria da caldeira flamotubular">
      {zona('costado', 'Costado', <rect x="70" y="40" width="280" height="112" rx="14" />)}
      {zona(
        'tubo',
        'Tubos',
        <>
          <rect x="96" y="62" width="228" height="10" rx="5" />
          <rect x="96" y="80" width="228" height="10" rx="5" />
          <rect x="96" y="98" width="228" height="10" rx="5" />
          <rect x="96" y="116" width="228" height="10" rx="5" />
        </>,
      )}
      {zona(
        'espelho',
        'Espelhos',
        <>
          <rect x="80" y="48" width="10" height="96" rx="2" />
          <rect x="330" y="48" width="10" height="96" rx="2" />
        </>,
      )}
      <path className="sela" d="M120 152l-10 26h56l-10-26M254 152l-10 26h56l-10-26" />
    </svg>
  );
}

function CamposEtapa({ etapa, d, onChange }: { etapa: EtapaId; d: Record<string, unknown>; onChange: (chave: string, valor: unknown) => void }) {
  const num = (v: string) => (v === '' ? '' : Number(v));
  if (etapa === 'costado') {
    return (
      <>
        <p className="mx-fixo">Costado — {FORMULA.costado}</p>
        <h4 className="mz-grupo"><Icone nome="box" tam={16} />Material e tensão</h4>
        <div className="mx-grid c3">
          <CampoMx rotulo="Material" tipo="text" valor={d.mat} onChange={(v) => onChange('mat', v)} />
          <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={d.S} onChange={(v) => onChange('S', num(v))} />
          <CampoMx rotulo="E — eficiência de solda" obrigatorio valor={d.E} onChange={(v) => onChange('E', num(v))} />
        </div>
        <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Geometria e espessuras</h4>
        <div className="mx-grid c3">
          <CampoMx rotulo="D — diâmetro" unidade="mm" obrigatorio valor={d.D} onChange={(v) => onChange('D', num(v))} />
          <CampoMx rotulo="y — coef. de temperatura" valor={d.y} onChange={(v) => onChange('y', num(v))} />
          <CampoMx rotulo="C — sobrecorrosão" unidade="mm" valor={d.C} onChange={(v) => onChange('C', num(v))} />
          <CampoMx rotulo="Esp. de projeto" unidade="mm" valor={d.espProjeto} onChange={(v) => onChange('espProjeto', num(v))} />
          <CampoMx rotulo="Esp. encontrada" unidade="mm" obrigatorio valor={d.espEncontrada} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
        <p className="mx-aviso"><Icone nome="info" tam={15} /><span>y vazio = 0,40 (planilha). C vazio = 0.</span></p>
      </>
    );
  }
  if (etapa === 'tubo') {
    return (
      <>
        <p className="mx-fixo">Tubo — {FORMULA.tubo}</p>
        <h4 className="mz-grupo"><Icone nome="box" tam={16} />Material e tensão</h4>
        <div className="mx-grid c3">
          <CampoMx rotulo="Material" tipo="text" valor={d.mat} onChange={(v) => onChange('mat', v)} />
          <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={d.S} onChange={(v) => onChange('S', num(v))} />
          <CampoMx rotulo="e — fator de espessura" unidade="mm" valor={d.fatorE} onChange={(v) => onChange('fatorE', num(v))} />
        </div>
        <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Geometria e espessuras</h4>
        <div className="mx-grid c3">
          <CampoMx rotulo="D — diâm. externo do tubo" unidade="mm" obrigatorio valor={d.D} onChange={(v) => onChange('D', num(v))} />
          <CampoMx rotulo="Esp. de projeto" unidade="mm" valor={d.espProjeto} onChange={(v) => onChange('espProjeto', num(v))} />
          <CampoMx rotulo="Esp. encontrada" unidade="mm" obrigatorio valor={d.espEncontrada} onChange={(v) => onChange('espEncontrada', num(v))} />
        </div>
        <p className="mx-aviso"><Icone nome="info" tam={15} /><span>e vazio = 0 (sem fator de espessura).</span></p>
      </>
    );
  }
  return (
    <>
      <p className="mx-fixo">Espelho dianteiro/traseiro — {FORMULA.espelho}</p>
      <h4 className="mz-grupo"><Icone nome="box" tam={16} />Material e tensão</h4>
      <div className="mx-grid c3">
        <CampoMx rotulo="Material" tipo="text" valor={d.mat} onChange={(v) => onChange('mat', v)} />
        <CampoMx rotulo="S — tensão admissível" unidade="MPa" obrigatorio valor={d.S} onChange={(v) => onChange('S', num(v))} />
        <CampoMx rotulo="C — constante dos estais" valor={d.cEstais} onChange={(v) => onChange('cEstais', num(v))} />
      </div>
      <h4 className="mz-grupo"><Icone nome="gauge" tam={16} />Estais e espessuras</h4>
      <div className="mx-grid c3">
        <CampoMx rotulo="p — passo dos estais" unidade="mm" obrigatorio valor={d.passo} onChange={(v) => onChange('passo', num(v))} />
        <CampoMx rotulo="Esp. de projeto" unidade="mm" valor={d.espProjeto} onChange={(v) => onChange('espProjeto', num(v))} />
        <CampoMx rotulo="Esp. encontrada" unidade="mm" obrigatorio valor={d.espEncontrada} onChange={(v) => onChange('espEncontrada', num(v))} />
      </div>
      <p className="mx-aviso"><Icone nome="info" tam={15} /><span>C vazio = 2,2 (estais soldados — planilha).</span></p>
    </>
  );
}
