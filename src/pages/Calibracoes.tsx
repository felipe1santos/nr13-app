import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from '../components/Icone';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EmpresaEquipamento, EquipamentoResumo, TipoEquipamento } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import { ler } from '../services/storage';
import { mascararData } from '../services/mascaras';
import {
  arquivoCalibracao,
  calcularErro,
  excluirCalibracao,
  listarCalibracoes,
  salvarCalibracao,
} from '../features/calibracoes/calibracaoService';
import type { DadosCalibracao, DadosManometro, DadosPSV } from '../features/calibracoes/tipos';
import VisualizadorCalibracao from '../features/calibracoes/VisualizadorCalibracao';
import {
  criarLote,
  excluirComponente,
  excluirLote,
  fotoDoComponente,
  listarComponentes,
  listarLotes,
  salvarComponente,
  salvarLote,
  type ComponenteCal,
  type LoteCal,
} from '../features/calibracoes/componentesService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import { documentosBloqueados } from '../services/trial';
import '../pages/relatorios.css';
import './calibracoes.css';
import PaginaA4 from '../components/PaginaA4';
import FotoImg from '../components/FotoImg';

type Tela = 'equipamentos' | 'historico' | 'formulario' | 'visualizador' | 'verDados';

function proprietarioDe(tag: string): string {
  const emp = ler<EmpresaEquipamento>(`nr13_emp_${tag}`);
  return emp?.razaoSocial || emp?.nomeFantasia || '';
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

interface FormDados {
  tipo: 'manometro' | 'psv';
  nome: string;
  numeroCertificado: string;
  dataEmissao: string;
  empresa: string;
  endereco: string;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  referencia: string;
  dataCalibracao: string;
  dataProxCalibracao: string;
  tempAr: string;
  umidade: string;
  local: string;
  padraoInst: string;
  padraoSerie: string;
  padraoCert: string;
  padraoVal: string;
  statusConclusao: 'aprovado' | 'reprovado' | '';
  textoMotivo: string;
  crescente: Array<{ vc: string; vi: string }>;
  incertezaC: string;
  coefC: string;
  decrescente: Array<{ vc: string; vi: string }>;
  incertezaD: string;
  coefD: string;
  pressaoAbertura: string;
  pressaoAjuste: string;
  fechamento: string;
  incerteza: string;
  coef: string;
}

function empresaAutoFill() {
  try {
    const emp = JSON.parse(localStorage.getItem('nr13_minha_empresa') || '{}');
    const razao = emp.razao || emp.fantasia || '';
    const partes = [emp.endereco, emp.bairro, emp.cidade].filter(Boolean);
    return { empresa: razao, endereco: partes.join(', ') };
  } catch { return { empresa: '', endereco: '' }; }
}

function formPadrao(tipo: 'manometro' | 'psv' = 'manometro'): FormDados {
  const { empresa, endereco } = empresaAutoFill();
  const hoje = new Date().toLocaleDateString('pt-BR');
  return {
    tipo,
    nome: '',
    numeroCertificado: `CERT-${Date.now()}`,
    dataEmissao: hoje,
    empresa,
    endereco,
    instrumento: '',
    fabricante: '',
    modelo: '',
    serie: '',
    referencia: '',
    dataCalibracao: hoje,
    dataProxCalibracao: '',
    tempAr: '',
    umidade: '',
    local: '',
    padraoInst: '',
    padraoSerie: '',
    padraoCert: '',
    padraoVal: '',
    statusConclusao: '',
    textoMotivo: '',
    crescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaC: '',
    coefC: '',
    decrescente: Array.from({ length: 5 }, () => ({ vc: '', vi: '' })),
    incertezaD: '',
    coefD: '',
    pressaoAbertura: '',
    pressaoAjuste: '',
    fechamento: '',
    incerteza: '',
    coef: '',
  };
}

function converterForm(form: FormDados, tag: string, id: string): DadosCalibracao {
  const base = {
    id,
    tag,
    nome: form.nome || (form.tipo === 'manometro' ? 'Manômetro' : 'Válvula de Segurança'),
    criadoEm: new Date().toLocaleDateString('pt-BR'),
    numeroCertificado: form.numeroCertificado,
    dataEmissao: form.dataEmissao,
    empresa: form.empresa,
    endereco: form.endereco,
    instrumento: form.instrumento || form.nome,
    fabricante: form.fabricante,
    modelo: form.modelo,
    serie: form.serie,
    referencia: form.referencia,
    dataCalibracao: form.dataCalibracao,
    dataProxCalibracao: form.dataProxCalibracao,
    tempAr: form.tempAr,
    umidade: form.umidade,
    local: form.local,
    padraoInst: form.padraoInst,
    padraoSerie: form.padraoSerie,
    padraoCert: form.padraoCert,
    padraoVal: form.padraoVal,
    statusConclusao: form.statusConclusao,
    textoMotivo: form.textoMotivo,
  };

  if (form.tipo === 'manometro') {
    return {
      ...base,
      tipo: 'manometro',
      crescente: form.crescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaC: form.incertezaC,
      coefC: form.coefC,
      decrescente: form.decrescente.map((r) => ({ vc: r.vc, vi: r.vi, erro: calcularErro(r.vc, r.vi) })),
      incertezaD: form.incertezaD,
      coefD: form.coefD,
    } as DadosManometro;
  }
  return {
    ...base,
    tipo: 'psv',
    pressaoAbertura: form.pressaoAbertura,
    pressaoAjuste: form.pressaoAjuste,
    fechamento: form.fechamento,
    incerteza: form.incerteza,
    coef: form.coef,
  } as DadosPSV;
}

function parseDateBR(d: string): number {
  const p = d.split('/');
  if (p.length !== 3) return 0;
  return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
}

export default function Calibracoes() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [tag, setTag] = useState('');
  const [cals, setCals] = useState<DadosCalibracao[]>([]);
  const [calAtual, setCalAtual] = useState<DadosCalibracao | null>(null);
  const [form, setForm] = useState<FormDados>(formPadrao());
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoEquipamento>('todos');
  const [filtroProp, setFiltroProp] = useState('');
  const [toast, setToast] = useState('');
  // Componentes (válvulas/manômetros) + lotes de calibração do equipamento aberto
  const [eqAtual, setEqAtual] = useState<EquipamentoResumo | null>(null);
  const [componentes, setComponentes] = useState<ComponenteCal[]>([]);
  const [lotes, setLotes] = useState<LoteCal[]>([]);
  const [compForm, setCompForm] = useState<ComponenteCal | null>(null);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  const compFotoRef = useRef<HTMLInputElement>(null);
  const vinculoCalibracao = useRef<{ componenteId: string; loteId: string } | null>(null);

  const proprietarios = useMemo(
    () => [...new Set(equipamentos.map((e) => proprietarioDe(e.tag)).filter(Boolean))].sort(),
    [equipamentos],
  );

  const equipamentosFiltrados = useMemo(
    () =>
      equipamentos.filter(
        (e) =>
          (filtroTipo === 'todos' || e.info.tipo === filtroTipo) &&
          (filtroProp === '' || proprietarioDe(e.tag) === filtroProp),
      ),
    [equipamentos, filtroTipo, filtroProp],
  );

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEquipamentos();
  }, [carregarEquipamentos]);

  // Pré-rasteriza o certificado em #print-root (1 imagem A4) quando o preview abre — igual ao
  // relatório/prontuário. Sem isto, o Ctrl+P/botão Imprimir cairia no print nativo do iframe
  // (sai em tiras / só 1 página). Limpa ao sair do visualizador.
  useEffect(() => {
    if (tela !== 'visualizador') return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.cal-preview');
    if (!preview) return;
    const iframes = Array.from(preview.querySelectorAll('iframe'));
    Promise.all(
      iframes.map((f) =>
        f.contentDocument && f.contentDocument.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true })),
      ),
    )
      .then(() => new Promise((r) => setTimeout(r, 500)))
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.cal-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [tela, calAtual, versao]);

  function abrirEquipamento(eq: EquipamentoResumo) {
    setTag(eq.tag);
    setEqAtual(eq);
    const lista = listarCalibracoes(eq.tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    setComponentes(listarComponentes(eq.tag));
    setLotes(listarLotes(eq.tag));
    setConfirmandoId(null);
    setTela('historico');
  }

  // Calibração SEMPRE parte de um componente cadastrado dentro de um lote:
  // pré-preenche o formulário com os dados do instrumento e vincula os ids.
  function novaForm(tipo: 'manometro' | 'psv', comp?: ComponenteCal, loteId?: string) {
    const base = formPadrao(tipo);
    if (comp) {
      base.nome = comp.nome;
      base.instrumento = comp.nome;
      base.fabricante = comp.fabricante ?? '';
      base.modelo = comp.modelo ?? '';
      base.serie = comp.serie ?? '';
    }
    vinculoCalibracao.current = comp && loteId ? { componenteId: comp.id, loteId } : null;
    setForm(base);
    setTela('formulario');
  }

  function abrirVisualizador(cal: DadosCalibracao) {
    setCalAtual(cal);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  function abrirVerDados(cal: DadosCalibracao) {
    setCalAtual(cal);
    setTela('verDados');
  }

  function excluir(id: string) {
    excluirCalibracao(tag, id);
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    setConfirmandoId(null);
    if (tela === 'visualizador') setTela('historico');
  }

  function set<K extends keyof FormDados>(campo: K, valor: FormDados[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function setCrescente(i: number, campo: 'vc' | 'vi', valor: string) {
    setForm((f) => {
      const arr = [...f.crescente];
      arr[i] = { ...arr[i], [campo]: valor };
      return { ...f, crescente: arr };
    });
  }

  function setDecrescente(i: number, campo: 'vc' | 'vi', valor: string) {
    setForm((f) => {
      const arr = [...f.decrescente];
      arr[i] = { ...arr[i], [campo]: valor };
      return { ...f, decrescente: arr };
    });
  }

  function mostrarToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  }

  function salvar(voltarParaLista = false) {
    const id = `cal-${Date.now()}`;
    const dados: DadosCalibracao = { ...converterForm(form, tag, id), ...(vinculoCalibracao.current ?? {}) };
    salvarCalibracao(tag, dados);
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    if (voltarParaLista) {
      // confirma o salvamento, fecha o formulário e volta à lista — usuário adiciona outro manualmente
      const nome = dados.nome || (dados.tipo === 'manometro' ? 'Manômetro' : 'PSV');
      mostrarToast(`✓ "${nome}" salvo com sucesso`);
      setTela('historico');
    } else {
      setCalAtual(dados);
      setVersao((v) => v + 1);
      setTela('visualizador');
    }
  }

  const statusLabel = (s: string) => {
    if (s === 'aprovado') return 'Aprovado';
    if (s === 'reprovado') return 'Reprovado';
    return 'Pendente';
  };

  return (
    <div className="calibracoes-page">
      <h1>Calibrações</h1>

      {/* Os certificados dos instrumentos PADRÃO saíram daqui para o menu próprio
          "Certificados" (src/pages/Certificados.tsx) — esta tela cuida só das
          calibrações dos acessórios do cliente (manômetros/PSV por equipamento). */}

      {/* ── EQUIPAMENTOS ─────────────────────────────── */}
      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <div className="meta-card-header">
            <h3>Selecione o Equipamento</h3>
          </div>

          <div className="cal-filtros">
            <div className="cal-filtro-campo">
              <label>Tipo de Equipamento</label>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as 'todos' | TipoEquipamento)}>
                <option value="todos">Todos os tipos</option>
                <option value="vaso">Vaso de Pressão</option>
                <option value="autoclave">Autoclave</option>
                <option value="caldeira">Caldeira</option>
              </select>
            </div>
            <div className="cal-filtro-campo">
              <label>Proprietário (Empresa Dona)</label>
              <select value={filtroProp} onChange={(e) => setFiltroProp(e.target.value)}>
                <option value="">Todos os proprietários</option>
                {proprietarios.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {(filtroTipo !== 'todos' || filtroProp !== '') && (
              <button type="button" className="btn-secundario cal-filtro-limpar" onClick={() => { setFiltroTipo('todos'); setFiltroProp(''); }}>
                Limpar filtros
              </button>
            )}
          </div>

          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : equipamentosFiltrados.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento corresponde aos filtros.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentosFiltrados.map((eq) => {
                const qtd = listarCalibracoes(eq.tag).length;
                const prop = proprietarioDe(eq.tag);
                return (
                  <button
                    type="button"
                    key={eq.tag}
                    className="card-equipamento-horiz"
                    onClick={() => abrirEquipamento(eq)}
                  >
                    <div className="card-eq-info" style={{ flex: 1 }}>
                      <div className="eq-col">
                        <span className="eq-tag">{eq.tag}</span>
                        <span className="eq-tipo">{ROTULO_TIPO[eq.info.tipo]}</span>
                      </div>
                      <div className="eq-col">
                        <span className="eq-label">Proprietário</span>
                        <span className="eq-value">{prop || '—'}</span>
                      </div>
                      <div className="eq-col">
                        <span className="eq-label">Categoria</span>
                        <span className="eq-value">{eq.categoria?.catFinal ?? '—'}</span>
                      </div>
                      <div className="eq-col">
                        <span className="eq-label">PMTA</span>
                        <span className="eq-value">
                          {eq.calculo ? formatarValor(parseFloat(eq.calculo.pmta), eq.unidade) : '—'}
                        </span>
                      </div>
                    </div>
                    <span className={`badge-relatorios ${qtd > 0 ? 'tem' : ''}`}>
                      {qtd} Calibrações
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO (componentes + lotes) ─────────── */}
      {tela === 'historico' && (
        <>
          <div className="bloco-dados">
            {/* Cabeçalho: Voltar compacto + foto + título à esquerda; painel de componentes
               ocupa o canto superior direito (antes era uma faixa vazia). */}
            <div className="cal-eq-header">
              <div className="cal-eq-main">
                <button
                  type="button"
                  className="btn-secundario cal-btn-voltar"
                  onClick={() => setTela('equipamentos')}
                >
                  ← Voltar
                </button>
                <div className="cal-eq-foto">
                  {eqAtual?.fotoCapa ? (
                    <FotoImg foto={eqAtual.fotoCapa} alt={`Foto de ${tag}`} />
                  ) : (
                    <Icone nome="cylinder" tam={34} />
                  )}
                </div>
                <div className="cal-eq-info">
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Calibrações — {tag}</h3>
                  <p className="cal-eq-sub">
                    Cadastre as válvulas e manômetros do equipamento uma única vez; a cada inspeção,
                    abra um novo lote e calibre os mesmos componentes.
                  </p>
                </div>
              </div>

              {/* ── COMPONENTES DO EQUIPAMENTO (painel compacto no topo direito) ── */}
              <div className="cal-eq-comps">
                <div className="cal-eq-comps-head">
                  <span className="cal-eq-comps-title">Componentes do equipamento</span>
                  {!compForm && (
                    <button
                      type="button"
                      className="btn-secundario cal-btn-add-comp"
                      onClick={() =>
                        setCompForm({
                          id: `comp-${Date.now()}`,
                          tipo: 'manometro',
                          nome: '',
                          criadoEm: new Date().toLocaleDateString('pt-BR'),
                        })
                      }
                    >
                      + Adicionar
                    </button>
                  )}
                </div>
                {componentes.length === 0 && !compForm ? (
                  <p className="cal-eq-comps-vazio">
                    Nenhum componente. Adicione as válvulas e manômetros deste equipamento.
                  </p>
                ) : (
                  <div className="cal-eq-comps-lista" role="list" aria-label="Componentes do equipamento">
                    {componentes.map((c) => (
                      <div key={c.id} className="cal-comp-item compacto">
                        <div className="cal-comp-foto">
                          {fotoDoComponente(c) ? <FotoImg foto={fotoDoComponente(c)} alt={c.nome} placeholder="" /> : <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={20} />}
                        </div>
                        <div className="cal-comp-nome">
                          <strong>{c.nome}</strong>
                          <span>{[c.fabricante, c.serie && `S/N ${c.serie}`].filter(Boolean).join(' · ') || '—'}</span>
                        </div>
                        <span className={`badge-cal-tipo ${c.tipo}`}>{c.tipo === 'manometro' ? 'Manômetro' : 'PSV'}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn-icone cor-cinza" title="Editar" onClick={() => setCompForm({ ...c })}>
                            <Icone nome="pencil" tam={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-icone cor-vermelho"
                            title="Excluir componente"
                            onClick={async () => {
                              if (!window.confirm(`Excluir o componente ${c.nome}? Os certificados já emitidos continuam no histórico.`)) return;
                              await excluirComponente(tag, c.id);
                              setComponentes(listarComponentes(tag));
                            }}
                          >
                            <Icone nome="trash" tam={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {compForm && (
              <div className="cal-comp-form">
                <div className="cal-form-grid cols-4" style={{ padding: 0, marginBottom: 10 }}>
                  <div className="cal-campo">
                    <label>Tipo</label>
                    <select
                      value={compForm.tipo}
                      onChange={(e) => setCompForm({ ...compForm, tipo: e.target.value as 'manometro' | 'psv' })}
                    >
                      <option value="manometro">Manômetro</option>
                      <option value="psv">Válvula de Segurança (PSV)</option>
                    </select>
                  </div>
                  <div className="cal-campo">
                    <label>Nome / identificação *</label>
                    <input value={compForm.nome} onChange={(e) => setCompForm({ ...compForm, nome: e.target.value })} placeholder="Ex: PSV-01" />
                  </div>
                  <div className="cal-campo">
                    <label>Fabricante</label>
                    <input value={compForm.fabricante ?? ''} onChange={(e) => setCompForm({ ...compForm, fabricante: e.target.value })} />
                  </div>
                  <div className="cal-campo">
                    <label>Nº de série</label>
                    <input value={compForm.serie ?? ''} onChange={(e) => setCompForm({ ...compForm, serie: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    ref={compFotoRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      // A `fotoRef` do arquivo anterior morre junto: mantê-la faria
                      // `salvarComponente` gravar a referência velha e descartar em
                      // silêncio a foto que o usuário acabou de escolher.
                      reader.onload = (ev) =>
                        setCompForm((f) =>
                          f ? { ...f, foto: String(ev.target?.result ?? ''), fotoRef: undefined } : f,
                        );
                      reader.readAsDataURL(file);
                    }}
                  />
                  <button type="button" className="btn-secundario" onClick={() => compFotoRef.current?.click()}>
                    <Icone nome="camera" tam={13} /> {compForm.foto ? 'Trocar foto' : 'Foto (opcional)'}
                  </button>
                  {compForm.foto && <img src={compForm.foto} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={async () => {
                      if (!compForm.nome.trim()) return;
                      await salvarComponente(tag, compForm);
                      setComponentes(listarComponentes(tag));
                      setCompForm(null);
                    }}
                  >
                    Salvar componente
                  </button>
                  <button type="button" className="btn-secundario" onClick={() => setCompForm(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {/* ── LOTES DE CALIBRAÇÃO ── */}
            <div className="meta-card-header" style={{ marginTop: 18 }}>
              <h3 style={{ margin: 0, border: 'none', padding: 0, fontSize: 14 }}>Lotes de calibração</h3>
              <button
                type="button"
                className="btn-primario"
                disabled={componentes.length === 0}
                title={componentes.length === 0 ? 'Cadastre os componentes primeiro' : undefined}
                onClick={async () => {
                  // Nome definido pelo usuário facilita achar o lote no modal do relatório.
                  const nome = window.prompt(
                    'Nome do lote de calibração:',
                    `Lote de calibração — ${new Date().toLocaleDateString('pt-BR')}`,
                  );
                  if (nome === null) return;
                  const lote = await criarLote(tag, nome);
                  setLotes(listarLotes(tag));
                  setLoteAberto(lote.id);
                }}
              >
                + Novo lote de calibração
              </button>
            </div>

            {lotes.length === 0 ? (
              <p className="dashboard-vazio" style={{ padding: '14px 0' }}>
                Nenhum lote ainda. Cada inspeção gera um lote com a calibração de todos os componentes.
              </p>
            ) : (
              lotes.map((lote) => {
                const calsDoLote = cals.filter((c) => c.loteId === lote.id);
                const aberto = loteAberto === lote.id;
                return (
                  <div key={lote.id} className="cal-lote">
                    <div className="cal-lote-head-row">
                      <button type="button" className="cal-lote-head" onClick={() => setLoteAberto(aberto ? null : lote.id)}>
                        <Icone nome={aberto ? 'chevdown' : 'chevright'} tam={14} />
                        <strong>{lote.descricao}</strong>
                        <span className="cal-lote-meta">
                          {calsDoLote.length}/{componentes.length} calibrado{calsDoLote.length !== 1 ? 's' : ''}
                        </span>
                        {calsDoLote.length >= componentes.length && componentes.length > 0 ? (
                          <span className="badge-cal-status aprovado">Completo</span>
                        ) : (
                          <span className="badge-cal-status pendente">Em andamento</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn-icone cor-azul"
                        title="Renomear lote"
                        style={{ marginRight: 10, flexShrink: 0 }}
                        onClick={async () => {
                          const nome = window.prompt('Nome do lote:', lote.descricao);
                          if (nome === null || !nome.trim()) return;
                          await salvarLote(tag, { ...lote, descricao: nome.trim() });
                          setLotes(listarLotes(tag));
                        }}
                      >
                        <Icone nome="pencil" tam={14} />
                      </button>
                    </div>
                    {aberto && (
                      <div className="cal-lote-corpo">
                        {componentes.map((c) => {
                          const cal = calsDoLote.find((x) => x.componenteId === c.id);
                          return (
                            <div key={c.id} className="cal-comp-item">
                              <div className="cal-comp-foto">
                                {fotoDoComponente(c) ? <FotoImg foto={fotoDoComponente(c)} alt={c.nome} placeholder="" /> : <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={24} />}
                              </div>
                              <div className="cal-comp-nome">
                                <strong>{c.nome}</strong>
                                <span>{cal ? `Calibrado em ${cal.dataCalibracao || cal.criadoEm}` : 'Aguardando calibração neste lote'}</span>
                              </div>
                              {cal ? (
                                <>
                                  <span className={`badge-cal-status ${cal.statusConclusao || 'pendente'}`}>{statusLabel(cal.statusConclusao)}</span>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" className="btn-icone cor-azul" title="Ver o que foi preenchido" onClick={() => abrirVerDados(cal)}>
                                      <Icone nome="eye" tam={15} />
                                    </button>
                                    <button type="button" className="btn-icone cor-azul" title="Ver o certificado" onClick={() => abrirVisualizador(cal)}>
                                      <Icone nome="filetext" tam={15} />
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-icone cor-vermelho"
                                      title="Excluir certificado"
                                      onClick={() => window.confirm('Excluir este certificado?') && excluir(cal.id)}
                                    >
                                      <Icone nome="trash" tam={14} />
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <button type="button" className="btn-primario" onClick={() => novaForm(c.tipo, c, lote.id)}>
                                  Calibrar
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <div style={{ textAlign: 'right', marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn-secundario"
                            onClick={async () => {
                              if (calsDoLote.length > 0) {
                                window.alert('Este lote tem certificados emitidos — exclua os certificados primeiro.');
                                return;
                              }
                              if (!window.confirm('Excluir este lote vazio?')) return;
                              await excluirLote(tag, lote.id);
                              setLotes(listarLotes(tag));
                            }}
                          >
                            Excluir lote
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* ── CALIBRAÇÕES AVULSAS (antes dos lotes) ── */}
            {cals.some((c) => !c.loteId) && (
              <>
                <div className="meta-card-header" style={{ marginTop: 22 }}>
                  <h3 style={{ margin: 0, border: 'none', padding: 0, fontSize: 14 }}>Calibrações avulsas (antigas)</h3>
                </div>
                <table className="cal-historico-table">
                  <thead>
                    <tr>
                      <th>Nome do Item</th>
                      <th>Tipo</th>
                      <th>Data Calibração</th>
                      <th>Próx. Calibração</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cals.filter((c) => !c.loteId).map((c) => (
                      <tr key={c.id}>
                        <td data-label="Item" style={{ fontWeight: 600 }}>{c.nome}</td>
                        <td data-label="Tipo">
                          <span className={`badge-cal-tipo ${c.tipo}`}>
                            {c.tipo === 'manometro' ? 'Manômetro' : 'PSV'}
                          </span>
                        </td>
                        <td data-label="Data Calibração">{c.dataCalibracao || '—'}</td>
                        <td data-label="Próx. Calibração">{c.dataProxCalibracao || '—'}</td>
                        <td data-label="Status">
                          <span className={`badge-cal-status ${c.statusConclusao || 'pendente'}`}>
                            {statusLabel(c.statusConclusao)}
                          </span>
                        </td>
                        <td data-label="Ações" className="acoes-relatorio-icones">
                          {confirmandoId === c.id ? (
                            <>
                              <button type="button" className="btn-remover" onClick={() => excluir(c.id)}>
                                Confirmar
                              </button>
                              <button type="button" className="btn-secundario" onClick={() => setConfirmandoId(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="btn-icone cor-azul" title="Ver o que foi preenchido" onClick={() => abrirVerDados(c)}>
                                <Icone nome="eye" tam={15} />
                              </button>
                              <button type="button" className="btn-icone cor-azul" title="Ver como fica o documento" onClick={() => abrirVisualizador(c)}>
                                <Icone nome="filetext" tam={15} />
                              </button>
                              <button type="button" className="btn-icone cor-vermelho" title="Excluir" onClick={() => setConfirmandoId(c.id)}>
                                <Icone nome="trash" tam={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}

      {/* ── FORMULÁRIO ───────────────────────────────── */}
      {tela === 'formulario' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header" style={{ marginBottom: 16 }}>
            <h3>Nova Calibração — {form.tipo === 'manometro' ? 'Manômetro' : 'Válvula de Segurança (PSV)'}</h3>
          </div>

          {/* Identificação */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Identificação do Item</div>
            <div className="cal-form-grid cols-3">
              <div className="cal-campo cal-campo-full">
                <label>Nome / Identificação do Instrumento *</label>
                <input
                  value={form.nome}
                  onChange={(e) => set('nome', e.target.value)}
                  placeholder={form.tipo === 'manometro' ? 'Ex: Manômetro Principal, Manômetro 1...' : 'Ex: Válvula de Segurança 1, PSV-001...'}
                />
              </div>
              <div className="cal-campo">
                <label>Nº do Certificado</label>
                <input value={form.numeroCertificado} onChange={(e) => set('numeroCertificado', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Data de Emissão</label>
                <input value={form.dataEmissao} onChange={(e) => set('dataEmissao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* Dados do Item Calibrado */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Dados do Item Calibrado</div>
            <div className="cal-form-grid cols-3">
              <div className="cal-campo">
                <label>Instrumento</label>
                <input value={form.instrumento} onChange={(e) => set('instrumento', e.target.value)} placeholder={form.nome} />
              </div>
              <div className="cal-campo">
                <label>Fabricante</label>
                <input value={form.fabricante} onChange={(e) => set('fabricante', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Modelo</label>
                <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Lote / Série</label>
                <input value={form.serie} onChange={(e) => set('serie', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Referência</label>
                <input value={form.referencia} onChange={(e) => set('referencia', e.target.value)} />
              </div>
              <div className="cal-campo" />
              <div className="cal-campo">
                <label>Data da Calibração</label>
                <input value={form.dataCalibracao} onChange={(e) => set('dataCalibracao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
              <div className="cal-campo">
                <label>Data da Próxima Calibração</label>
                <input value={form.dataProxCalibracao} onChange={(e) => set('dataProxCalibracao', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* Condições Ambientais */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Condições Ambientais</div>
            <div className="cal-form-grid cols-3">
              <div className="cal-campo">
                <label>Temperatura do Ar</label>
                <input value={form.tempAr} onChange={(e) => set('tempAr', e.target.value)} placeholder="Ex: 23°C" />
              </div>
              <div className="cal-campo">
                <label>Umidade Relativa</label>
                <input value={form.umidade} onChange={(e) => set('umidade', e.target.value)} placeholder="Ex: 60%" />
              </div>
              <div className="cal-campo">
                <label>Local</label>
                <input value={form.local} onChange={(e) => set('local', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Padrões */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Padrões Utilizados e Rastreabilidade</div>
            <div className="cal-form-grid cols-4">
              <div className="cal-campo">
                <label>Instrumento Padrão</label>
                <input value={form.padraoInst} onChange={(e) => set('padraoInst', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Nº Série</label>
                <input value={form.padraoSerie} onChange={(e) => set('padraoSerie', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Nº Certificado</label>
                <input value={form.padraoCert} onChange={(e) => set('padraoCert', e.target.value)} />
              </div>
              <div className="cal-campo">
                <label>Validade</label>
                <input value={form.padraoVal} onChange={(e) => set('padraoVal', mascararData(e.target.value))} placeholder="DD/MM/AAAA" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* Resultados — Manômetro */}
          {form.tipo === 'manometro' && (
            <div className="cal-form-secao">
              <div className="cal-form-secao-titulo">Resultados Obtidos (Manômetro)</div>
              <div className="cal-tabelas-duplas">
                <div>
                  <div className="cal-subtabela-titulo">Sentido Crescente (kgf/cm²)</div>
                  <table className="cal-tabela-resultados">
                    <thead>
                      <tr>
                        <th>Valor Convencional</th>
                        <th>Valor Nominal</th>
                        <th>Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.crescente.map((row, i) => (
                        <tr key={i}>
                          <td><input value={row.vc} onChange={(e) => setCrescente(i, 'vc', e.target.value)} /></td>
                          <td><input value={row.vi} onChange={(e) => setCrescente(i, 'vi', e.target.value)} /></td>
                          <td className="erro-calc">{row.vc && row.vi ? calcularErro(row.vc, row.vi) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cal-form-grid" style={{ padding: '10px 0 0', gap: 10 }}>
                    <div className="cal-campo">
                      <label>Incerteza de Medição</label>
                      <input value={form.incertezaC} onChange={(e) => set('incertezaC', e.target.value)} />
                    </div>
                    <div className="cal-campo">
                      <label>Coeficiente k</label>
                      <input value={form.coefC} onChange={(e) => set('coefC', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="cal-subtabela-titulo">Sentido Decrescente (kgf/cm²)</div>
                  <table className="cal-tabela-resultados">
                    <thead>
                      <tr>
                        <th>Valor Convencional</th>
                        <th>Valor Nominal</th>
                        <th>Erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.decrescente.map((row, i) => (
                        <tr key={i}>
                          <td><input value={row.vc} onChange={(e) => setDecrescente(i, 'vc', e.target.value)} /></td>
                          <td><input value={row.vi} onChange={(e) => setDecrescente(i, 'vi', e.target.value)} /></td>
                          <td className="erro-calc">{row.vc && row.vi ? calcularErro(row.vc, row.vi) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cal-form-grid" style={{ padding: '10px 0 0', gap: 10 }}>
                    <div className="cal-campo">
                      <label>Incerteza de Medição</label>
                      <input value={form.incertezaD} onChange={(e) => set('incertezaD', e.target.value)} />
                    </div>
                    <div className="cal-campo">
                      <label>Coeficiente k</label>
                      <input value={form.coefD} onChange={(e) => set('coefD', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resultados — PSV */}
          {form.tipo === 'psv' && (
            <div className="cal-form-secao">
              <div className="cal-form-secao-titulo">Resultados Obtidos (PSV)</div>
              <div className="cal-form-grid cols-3">
                <div className="cal-campo">
                  <label>Pressão de Abertura</label>
                  <input value={form.pressaoAbertura} onChange={(e) => set('pressaoAbertura', e.target.value)} />
                </div>
                <div className="cal-campo">
                  <label>Pressão de Ajuste</label>
                  <input value={form.pressaoAjuste} onChange={(e) => set('pressaoAjuste', e.target.value)} />
                </div>
                <div className="cal-campo">
                  <label>Fechamento</label>
                  <input value={form.fechamento} onChange={(e) => set('fechamento', e.target.value)} />
                </div>
                <div className="cal-campo">
                  <label>Incerteza de Medição</label>
                  <input value={form.incerteza} onChange={(e) => set('incerteza', e.target.value)} />
                </div>
                <div className="cal-campo">
                  <label>Coeficiente k</label>
                  <input value={form.coef} onChange={(e) => set('coef', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Conclusão */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Conclusão Técnica</div>
            <div className="cal-form-grid">
              <div className="cal-campo">
                <label>Status</label>
                <select value={form.statusConclusao} onChange={(e) => set('statusConclusao', e.target.value as FormDados['statusConclusao'])}>
                  <option value="">Selecione...</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                </select>
              </div>
              <div className="cal-campo">
                <label>Motivo / Complemento</label>
                <input value={form.textoMotivo} onChange={(e) => set('textoMotivo', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="cal-acoes-form">
            <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
              Cancelar
            </button>
            <button type="button" className="btn-secundario" onClick={() => salvar(true)}>
              Salvar e Voltar à Lista
            </button>
            <button type="button" className="btn-primario" onClick={() => salvar(false)}>
              Salvar e Visualizar
            </button>
          </div>
        </div>
      )}

      {/* ── VISUALIZADOR ─────────────────────────────── */}
      {tela === 'visualizador' && calAtual && (
        <>
          <div className="bloco-dados">
            <div className="meta-breadcrumb">
              <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
                ← Voltar
              </button>
              <strong>{tag}</strong>
              <span className="breadcrumb-chevron">›</span>
              <span>{calAtual.nome}</span>
            </div>
            <div className="meta-card-header">
              <h3>
                {calAtual.tipo === 'manometro' ? 'Certificado de Calibração — Manômetro' : 'Certificado de Calibração — PSV'}
              </h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-secundario" onClick={() => abrirVerDados(calAtual)}>
                  Ver preenchido
                </button>
                <button
                  type="button"
                  className={`btn-secundario${documentosBloqueados() ? ' btn-bloqueado' : ''}`}
                  onClick={() => void imprimirRelatorio('.cal-preview')}
                >
                  {documentosBloqueados() && <Icone nome="cadeado" tam={13} />} Imprimir
                </button>
                {confirmandoId === calAtual.id ? (
                  <>
                    <button type="button" className="btn-remover" onClick={() => excluir(calAtual.id)}>
                      Confirmar Exclusão
                    </button>
                    <button type="button" className="btn-secundario" onClick={() => setConfirmandoId(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-remover" onClick={() => setConfirmandoId(calAtual.id)}>
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="cal-preview">
            <PaginaA4 key={`${calAtual.id}-${versao}`}>
              <iframe
                src={`/arquivos-inspecao/${arquivoCalibracao(calAtual.tipo)}?calibId=${calAtual.id}&tag=${encodeURIComponent(tag)}&page=1`}
                scrolling="no"
                title="Certificado de Calibração"
              />
            </PaginaA4>
          </div>
        </>
      )}

      {/* ── VER PREENCHIDO (dados salvos, sem campos de edição) ── */}
      {tela === 'verDados' && calAtual && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => setTela('historico')}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
            <span className="breadcrumb-chevron">›</span>
            <span>{calAtual.nome}</span>
          </div>
          <div className="meta-card-header">
            <h3>
              {calAtual.tipo === 'manometro' ? 'Calibração — Manômetro' : 'Calibração — PSV'} (dados preenchidos)
            </h3>
            <button type="button" className="btn-primario" onClick={() => abrirVisualizador(calAtual)}>
              <Icone nome="eye" tam={14} /> Ver como fica o documento
            </button>
          </div>
          <VisualizadorCalibracao dados={calAtual} />
        </div>
      )}

      {toast && (
        <div className="toast-sucesso" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
