import { useCallback, useEffect, useState } from 'react';
import { listarEquipamentos } from '../features/equipamento/equipamentoService';
import type { EquipamentoResumo } from '../features/equipamento/tipos';
import { formatarValor } from '../calc/unidades';
import ModalNovaInspecao from '../features/relatorios/ModalNovaInspecao';
import ModalSelecionarContainer from '../features/relatorios/ModalSelecionarContainer';
import { carregarContainer } from '../features/inspecoes/inspecaoService';
import {
  adicionarEntradaLivroAuto,
  excluirDoHistorico,
  filtrarDocumentosValidos,
  gravarInspecaoOrigemAtual,
  gravarMetaAtual,
  listarHistorico,
  montarListaComTermoAbertura,
  salvarNoHistorico,
} from '../features/relatorios/relatoriosService';
import { exportarPdf } from '../features/relatorios/pdfService';
import type { RelatorioMeta, RelatorioSalvo, TipoInspecao } from '../features/relatorios/tipos';
import './relatorios.css';

type Tela = 'equipamentos' | 'historico' | 'visualizador';
type EtapaModal = 'nenhuma' | 'documentos' | 'container';

const hoje = () => new Date().toLocaleDateString('pt-BR');

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  autoclave: 'Autoclave',
  caldeira: 'Caldeira',
};

const IconeOlho = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconeImpressora = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const IconeDuplicar = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const IconeLapis = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const IconeLixeira = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
  </svg>
);

const IconePdf = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z" opacity="0.15" />
    <path d="M14 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function metaPadrao(tipo: TipoInspecao): RelatorioMeta {
  return {
    codigo: `REL-${Date.now()}`,
    emissao: hoje(),
    validade: '',
    execucaoInspecao: hoje(),
    proximaInspecaoInterna: '',
    proximaInspecaoExterna: '',
    validadeValvula: '',
    tipoInspecao: tipo,
    phNome: '',
    phCrea: '',
    tecnicoNome: '',
  };
}

interface PHItem { id: string; nome: string; crea: string; registro: string; tipo: string; }

export default function Relatorios() {
  const [tela, setTela] = useState<Tela>('equipamentos');
  const [equipamentos, setEquipamentos] = useState<EquipamentoResumo[]>([]);
  const [tag, setTag] = useState('');
  const [etapaModal, setEtapaModal] = useState<EtapaModal>('nenhuma');
  const [pendente, setPendente] = useState<{ tipo: TipoInspecao; docs: string[] } | null>(null);
  const [documentos, setDocumentos] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<RelatorioMeta | null>(null);
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [versao, setVersao] = useState(0);
  const [historico, setHistorico] = useState<RelatorioSalvo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [toastSalvo, setToastSalvo] = useState(false);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [listaPHs] = useState<PHItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('nr13_lista_phs') || '[]') as PHItem[]; } catch { return []; }
  });
  const [nomeRenomeando, setNomeRenomeando] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregarEquipamentos = useCallback(async () => {
    setEquipamentos(await listarEquipamentos());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão
    carregarEquipamentos();
  }, [carregarEquipamentos]);


  function abrirEquipamento(novaTag: string) {
    setTag(novaTag);
    setHistorico(listarHistorico(novaTag));
    setDocumentos(null);
    setMeta(null);
    setSelecionados(new Set());
    setTela('historico');
  }

  function voltarParaEquipamentos() {
    setTela('equipamentos');
  }

  function voltarParaHistorico() {
    setHistorico(listarHistorico(tag));
    setDocumentos(null);
    setMeta(null);
    setTela('historico');
  }

  function abrirEtapaDocumentos() {
    setEtapaModal('documentos');
  }

  function avancarParaEtapaContainer(tipo: TipoInspecao, docsSelecionados: string[]) {
    setPendente({ tipo, docs: docsSelecionados });
    setEtapaModal('container');
  }

  async function finalizarGeracao(containerId: string | null) {
    if (!pendente) return;
    setEtapaModal('nenhuma');
    const validos = filtrarDocumentosValidos(pendente.docs);
    const comTermo = montarListaComTermoAbertura(tag, validos);
    const novaMeta = metaPadrao(pendente.tipo);
    if (containerId) {
      novaMeta.containerOrigemId = containerId;
      const container = carregarContainer(tag, containerId);
      await gravarInspecaoOrigemAtual(container?.dados ?? {});
    }
    await gravarMetaAtual(novaMeta);
    setDocumentos(comTermo);
    setMeta(novaMeta);
    setSomenteLeitura(false);
    setPendente(null);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  // Re-hidrata as chaves "atuais" que os templates leem do localStorage ANTES de remontar os
  // iframes, senão um relatório reaberto exibe a meta/dados de campo do último relatório gerado.
  async function visualizar(r: RelatorioSalvo) {
    await gravarMetaAtual(r.meta);
    if (r.meta.containerOrigemId) {
      const container = carregarContainer(r.tagVaso, r.meta.containerOrigemId);
      await gravarInspecaoOrigemAtual(container?.dados ?? {});
    }
    setDocumentos(r.documentos);
    setMeta(r.meta);
    setSomenteLeitura(true);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  async function imprimir(r: RelatorioSalvo) {
    await visualizar(r);
    setTimeout(() => window.print(), 700);
  }

  async function duplicar(r: RelatorioSalvo) {
    const novaMeta: RelatorioMeta = { ...r.meta, codigo: `REL-${Date.now()}`, emissao: hoje() };
    await gravarMetaAtual(novaMeta);
    setDocumentos(r.documentos);
    setMeta(novaMeta);
    setSomenteLeitura(false);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  async function excluirHistorico(id: string) {
    await excluirDoHistorico(id);
    setHistorico(listarHistorico(tag));
  }

  async function excluirSelecionados() {
    for (const id of selecionados) await excluirDoHistorico(id);
    setSelecionados(new Set());
    setHistorico(listarHistorico(tag));
  }

  function toggleSelecionado(id: string) {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleSelecionarTodos() {
    setSelecionados((s) => (s.size === historico.length ? new Set() : new Set(historico.map((r) => r.id))));
  }

  function iniciarRenome(r: RelatorioSalvo) {
    setRenomeandoId(r.id);
    setNomeRenomeando(r.nome);
  }

  async function confirmarRenome(r: RelatorioSalvo) {
    const novoNome = nomeRenomeando.trim();
    if (novoNome) await salvarNoHistorico({ ...r, nome: novoNome });
    setRenomeandoId(null);
    setHistorico(listarHistorico(tag));
  }

  async function atualizarMetadados() {
    if (!meta) return;
    await gravarMetaAtual(meta);
    setVersao((v) => v + 1);
  }

  async function baixarPdf() {
    if (!meta) return;
    setExportando(true);
    try {
      await exportarPdf('.relatorio-preview', `Relatorio_${meta.tipoInspecao.replace(/ /g, '_')}_${tag}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  async function salvarHistorico() {
    if (!meta || !documentos) return;
    setSalvando(true);
    try {
      const relatorio: RelatorioSalvo = {
        id: meta.codigo,
        tagVaso: tag,
        nome: `Relatorio_${meta.tipoInspecao.replace(/ /g, '_')}_${tag}.pdf`,
        tipo: meta.tipoInspecao,
        data: hoje(),
        documentos,
        meta,
        status: 'Aprovado',
      };
      await salvarNoHistorico(relatorio);
      await adicionarEntradaLivroAuto(relatorio);
      setHistorico(listarHistorico(tag));
      setSomenteLeitura(true);
      setToastSalvo(true);
      setTimeout(() => setToastSalvo(false), 3000);
    } finally {
      setSalvando(false);
    }
  }

  function setCampoMeta(chave: keyof RelatorioMeta, valor: string) {
    setMeta((m) => (m ? { ...m, [chave]: valor } : m));
  }

  return (
    <div className="relatorios-page">
      <h1>Relatórios</h1>

      {tela === 'equipamentos' && (
        <div className="bloco-dados">
          <h3>Equipamentos Cadastrados</h3>
          {equipamentos.length === 0 ? (
            <p className="dashboard-vazio">Nenhum equipamento cadastrado ainda.</p>
          ) : (
            <div className="lista-cards-horiz">
              {equipamentos.map((eq) => (
                <button
                  type="button"
                  key={eq.tag}
                  className="card-equipamento-horiz"
                  onClick={() => abrirEquipamento(eq.tag)}
                >
                  <div className="card-eq-img">
                    {eq.fotoCapa ? <img src={eq.fotoCapa} alt={eq.tag} /> : <span className="card-eq-img-vazio">{eq.tag.slice(0, 2)}</span>}
                  </div>
                  <div className="card-eq-info">
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
                      <span className="eq-value">{eq.calculo ? formatarValor(parseFloat(eq.calculo.pmta), eq.unidade) : '—'}</span>
                    </div>
                  </div>
                  <span className={`badge-relatorios ${listarHistorico(eq.tag).length > 0 ? 'tem' : ''}`}>
                    {listarHistorico(eq.tag).length} Relatórios
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tela === 'historico' && (
        <div className="bloco-dados">
          <div className="meta-breadcrumb">
            <button type="button" className="btn-secundario" onClick={voltarParaEquipamentos}>
              ← Voltar
            </button>
            <span className="breadcrumb-chevron">›</span>
            <strong>{tag}</strong>
          </div>
          <div className="meta-card-header">
            <h3>Histórico de Inspeções</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              {selecionados.size > 0 && (
                <button type="button" className="btn-secundario" onClick={excluirSelecionados}>
                  Excluir Selecionados ({selecionados.size})
                </button>
              )}
              <button type="button" className="btn-filtrar">
                ▾ Filtrar
              </button>
              <button type="button" className="btn-primario" onClick={abrirEtapaDocumentos}>
                + Criar Relatório
              </button>
            </div>
          </div>
          {historico.length === 0 ? (
            <p className="dashboard-vazio">Nenhum relatório salvo ainda para este equipamento.</p>
          ) : (
            <table className="meta-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={selecionados.size === historico.length} onChange={toggleSelecionarTodos} />
                  </th>
                  <th>Nome do Relatório</th>
                  <th>TAG</th>
                  <th>Tipo de Inspeção</th>
                  <th>Criação Relatório</th>
                  <th>Validade Relatório</th>
                  <th>Próx. Insp. Interna</th>
                  <th>Próx. Insp. Externa</th>
                  <th>Validade Válvula</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input type="checkbox" checked={selecionados.has(r.id)} onChange={() => toggleSelecionado(r.id)} />
                    </td>
                    <td>
                      <span className="nome-relatorio-cel">
                        <span className="icone-pdf-cel">{IconePdf}</span>
                        {renomeandoId === r.id ? (
                          <input
                            autoFocus
                            value={nomeRenomeando}
                            onChange={(e) => setNomeRenomeando(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmarRenome(r)}
                          />
                        ) : (
                          r.nome
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="tag-cel-link">{r.tagVaso}</span>
                    </td>
                    <td>
                      <span className="badge-tipo-inspecao">{r.tipo}</span>
                    </td>
                    <td>{r.meta.emissao}</td>
                    <td>{r.meta.validade || '-'}</td>
                    <td>{r.meta.proximaInspecaoInterna || '-'}</td>
                    <td>{r.meta.proximaInspecaoExterna || '-'}</td>
                    <td>{r.meta.validadeValvula || '-'}</td>
                    <td className="acoes-relatorio-icones">
                      {renomeandoId === r.id ? (
                        <button type="button" className="btn-secundario" onClick={() => confirmarRenome(r)}>
                          Salvar
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn-icone cor-cinza" title="Renomear" onClick={() => iniciarRenome(r)}>
                            {IconeLapis}
                          </button>
                          <button type="button" className="btn-icone cor-azul" title="Visualizar" onClick={() => visualizar(r)}>
                            {IconeOlho}
                          </button>
                          <button type="button" className="btn-icone cor-verde" title="Imprimir" onClick={() => imprimir(r)}>
                            {IconeImpressora}
                          </button>
                          <button type="button" className="btn-icone cor-roxo" title="Duplicar" onClick={() => duplicar(r)}>
                            {IconeDuplicar}
                          </button>
                          <button type="button" className="btn-icone cor-vermelho" title="Deletar" onClick={() => excluirHistorico(r.id)}>
                            {IconeLixeira}
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

      {tela === 'visualizador' && meta && documentos && (
        <>
          {/* Barra sticky horizontal de metadados */}
          <div className="meta-barra-fixa">
            <button type="button" className="btn-secundario" style={{ height: 30, fontSize: 12, padding: '0 10px', alignSelf: 'flex-end' }} onClick={voltarParaHistorico}>
              ← Voltar
            </button>

            <div className="meta-barra-campo">
              <label>Código</label>
              <input value={meta.codigo} disabled style={{ width: 130 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Emissão</label>
              <input value={meta.emissao} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('emissao', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Validade</label>
              <input placeholder="DD/MM/AAAA" value={meta.validade} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('validade', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Execução Insp.</label>
              <input value={meta.execucaoInspecao} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('execucaoInspecao', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Próx. Interna</label>
              <input placeholder="DD/MM/AAAA" value={meta.proximaInspecaoInterna} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('proximaInspecaoInterna', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Próx. Externa</label>
              <input placeholder="DD/MM/AAAA" value={meta.proximaInspecaoExterna} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('proximaInspecaoExterna', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Valid. Válvula</label>
              <input placeholder="DD/MM/AAAA" value={meta.validadeValvula} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('validadeValvula', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>PH Responsável</label>
              {somenteLeitura ? (
                <input value={meta.phNome} readOnly style={{ width: 130 }} />
              ) : (
                <select
                  value={listaPHs.find((p) => p.nome === meta.phNome)?.id ?? ''}
                  onChange={(e) => {
                    const ph = listaPHs.find((p) => p.id === e.target.value);
                    if (ph) { setCampoMeta('phNome', ph.nome); setCampoMeta('phCrea', ph.crea || ph.registro || ''); }
                  }}
                  style={{ height: 30, fontSize: 12, minWidth: 130, border: '1px solid var(--border-solid)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-body)', color: 'var(--text-main)', padding: '0 6px' }}
                >
                  <option value="">Selecione PH...</option>
                  {listaPHs.filter((p) => !p.tipo || p.tipo.startsWith('Engenheiro')).map((ph) => (
                    <option key={ph.id} value={ph.id}>{ph.nome}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="meta-barra-campo">
              <label>CREA do PH</label>
              <input value={meta.phCrea} readOnly style={{ width: 90 }} />
            </div>
            <div className="meta-barra-campo">
              <label>Técnico</label>
              <input value={meta.tecnicoNome} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('tecnicoNome', e.target.value)} style={{ width: 100 }} />
            </div>

            <div className="meta-barra-acoes">
              {!somenteLeitura && (
                <button type="button" className="btn-secundario" onClick={atualizarMetadados}>
                  Atualizar
                </button>
              )}
              <button type="button" className="btn-secundario" onClick={() => window.print()}>
                Imprimir
              </button>
              <button type="button" className="btn-primario" onClick={baixarPdf} disabled={exportando}>
                {exportando ? 'PDF...' : 'Baixar PDF'}
              </button>
              {!somenteLeitura && (
                <button type="button" className="btn-primario" onClick={salvarHistorico} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar no Histórico'}
                </button>
              )}
            </div>
          </div>

          <div className="relatorio-preview">
            {documentos.map((doc, i) => {
              const sep = doc.includes('?') ? '&' : '?';
              return (
                <div key={`${doc}-${i}-${versao}`} className="pagina-relatorio-a4">
                  <iframe src={`/arquivos-inspecao/${doc}${sep}tag=${tag}&page=${i + 1}`} scrolling="no" title={doc} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {etapaModal === 'documentos' && (
        <ModalNovaInspecao onClose={() => setEtapaModal('nenhuma')} onGerar={avancarParaEtapaContainer} tag={tag} />
      )}
      {etapaModal === 'container' && (
        <ModalSelecionarContainer
          tag={tag}
          onClose={() => setEtapaModal('nenhuma')}
          onConfirmar={finalizarGeracao}
        />
      )}

      {toastSalvo && (
        <div className="toast-sucesso" role="status">
          ✓ Relatório salvo com sucesso
        </div>
      )}
    </div>
  );
}
