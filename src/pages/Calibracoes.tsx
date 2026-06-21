import { useCallback, useEffect, useState } from 'react';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import {
  arquivoCalibracao,
  calcularErro,
  excluirCalibracao,
  listarCalibracoes,
  salvarCalibracao,
} from '../features/calibracoes/calibracaoService';
import type { DadosCalibracao, DadosManometro, DadosPSV } from '../features/calibracoes/tipos';
import '../pages/relatorios.css';
import './calibracoes.css';

type Tela = 'equipamentos' | 'historico' | 'formulario' | 'visualizador';

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

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarEquipamentos();
  }, [carregarEquipamentos]);

  function abrirEquipamento(eq: EquipamentoResumo) {
    setTag(eq.tag);
    const lista = listarCalibracoes(eq.tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    setConfirmandoId(null);
    setTela('historico');
  }

  function novaForm(tipo: 'manometro' | 'psv' = 'manometro') {
    setForm(formPadrao(tipo));
    setTela('formulario');
  }

  function abrirVisualizador(cal: DadosCalibracao) {
    setCalAtual(cal);
    setVersao((v) => v + 1);
    setTela('visualizador');
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

  function salvar(addOutro = false) {
    const id = `cal-${Date.now()}`;
    const dados = converterForm(form, tag, id);
    salvarCalibracao(tag, dados);
    const lista = listarCalibracoes(tag);
    setCals([...lista].sort((a, b) => parseDateBR(b.dataCalibracao || b.criadoEm) - parseDateBR(a.dataCalibracao || a.criadoEm)));
    if (addOutro) {
      setForm(formPadrao(form.tipo));
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

      {/* ── EQUIPAMENTOS ─────────────────────────────── */}
      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <h3>Equipamentos Cadastrados</h3>
          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentos.map((eq) => {
                const qtd = listarCalibracoes(eq.tag).length;
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

      {/* ── HISTÓRICO ────────────────────────────────── */}
      {tela === 'historico' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={() => setTela('equipamentos')}>
              ← Voltar
            </button>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header">
            <h3>Calibrações — {tag}</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secundario" onClick={() => novaForm('manometro')}>
                + Manômetro
              </button>
              <button type="button" className="btn-primario" onClick={() => novaForm('psv')}>
                + Válvula (PSV)
              </button>
            </div>
          </div>

          {cals.length === 0 ? (
            <p className="dashboard-vazio">Nenhuma calibração registrada ainda para este equipamento.</p>
          ) : (
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
                {cals.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nome}</td>
                    <td>
                      <span className={`badge-cal-tipo ${c.tipo}`}>
                        {c.tipo === 'manometro' ? 'Manômetro' : 'PSV'}
                      </span>
                    </td>
                    <td>{c.dataCalibracao || '—'}</td>
                    <td>{c.dataProxCalibracao || '—'}</td>
                    <td>
                      <span className={`badge-cal-status ${c.statusConclusao || 'pendente'}`}>
                        {statusLabel(c.statusConclusao)}
                      </span>
                    </td>
                    <td className="acoes-relatorio-icones">
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
                          <button type="button" className="btn-icone cor-azul" title="Visualizar" onClick={() => abrirVisualizador(c)}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <button type="button" className="btn-icone cor-vermelho" title="Excluir" onClick={() => setConfirmandoId(c.id)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
                            </svg>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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

          {/* Tipo selector */}
          <div className="cal-form-secao">
            <div className="cal-form-secao-titulo">Tipo de Instrumento</div>
            <div className="cal-tipo-selector">
              <button
                type="button"
                className={`cal-tipo-btn ${form.tipo === 'manometro' ? 'ativo' : ''}`}
                onClick={() => set('tipo', 'manometro')}
              >
                <div className="cal-tipo-btn-titulo">Manômetro</div>
                <div className="cal-tipo-btn-desc">Certificado de calibração com tabela crescente/decrescente</div>
              </button>
              <button
                type="button"
                className={`cal-tipo-btn ${form.tipo === 'psv' ? 'ativo' : ''}`}
                onClick={() => set('tipo', 'psv')}
              >
                <div className="cal-tipo-btn-titulo">Válvula de Segurança (PSV)</div>
                <div className="cal-tipo-btn-desc">Certificado com pressão de abertura, ajuste e fechamento</div>
              </button>
            </div>
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
                <input value={form.dataEmissao} onChange={(e) => set('dataEmissao', e.target.value)} placeholder="DD/MM/AAAA" />
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
                <input value={form.dataCalibracao} onChange={(e) => set('dataCalibracao', e.target.value)} placeholder="DD/MM/AAAA" />
              </div>
              <div className="cal-campo">
                <label>Data da Próxima Calibração</label>
                <input value={form.dataProxCalibracao} onChange={(e) => set('dataProxCalibracao', e.target.value)} placeholder="DD/MM/AAAA" />
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
                <input value={form.padraoVal} onChange={(e) => set('padraoVal', e.target.value)} placeholder="DD/MM/AAAA" />
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
              Salvar e Adicionar Outro
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secundario" onClick={() => window.print()}>
                  Imprimir
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
            <div key={`${calAtual.id}-${versao}`} className="pagina-relatorio-a4">
              <iframe
                src={`/arquivos-inspecao/${arquivoCalibracao(calAtual.tipo)}?calibId=${calAtual.id}&tag=${tag}&page=1`}
                scrolling="no"
                title="Certificado de Calibração"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
