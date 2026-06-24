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
  expandirMemorial,
  filtrarDocumentosValidos,
  filtrarFolhasFotoVazias,
  gravarInspecaoOrigemAtual,
  gravarMetaAtual,
  listarHistorico,
  montarListaComTermoAbertura,
  salvarNoHistorico,
} from '../features/relatorios/relatoriosService';
import { exportarPdf } from '../features/relatorios/pdfService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
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
  const [nomeRenomeando, setNomeRenomeando] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalConfig, setModalConfig] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  async function prepararEImprimir() {
    setImprimindo(true);
    try {
      await imprimirRelatorio('.relatorio-preview');
    } finally {
      setImprimindo(false);
    }
  }

  // Pré-rasteriza as folhas em #print-root assim que o relatório carrega, e mantém atualizado a
  // cada nova versão. Assim o Ctrl+P nativo já imprime as imagens prontas (1 folha por A4), sem
  // pré-visualização e sem quebrar os iframes. Limpa ao sair do visualizador.
  useEffect(() => {
    if (tela !== 'visualizador' || !documentos) return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.relatorio-preview');
    if (!preview) return;
    const iframes = Array.from(preview.querySelectorAll('iframe'));
    const aguardarIframes = Promise.all(
      iframes.map((f) =>
        f.contentDocument && f.contentDocument.readyState === 'complete'
          ? Promise.resolve()
          : new Promise<void>((res) => f.addEventListener('load', () => res(), { once: true })),
      ),
    );
    aguardarIframes
      .then(() => new Promise((r) => setTimeout(r, 500))) // deixa imagens/fontes dos templates assentarem
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [tela, documentos, versao]);

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
    // Carrega o container ANTES de montar: a auto-injeção das folhas de fotos depende de haver
    // fotos de campo (VE/VI/TH) — sem fotos, a folha não entra.
    const dadosContainer = containerId ? (carregarContainer(tag, containerId)?.dados ?? {}) : {};
    const comTermo = expandirMemorial(tag, montarListaComTermoAbertura(tag, validos, dadosContainer));
    const novaMeta = metaPadrao(pendente.tipo);
    novaMeta.documentos = comTermo; // SUMARIO/INSPECOES leem isto pra montar TOC e ensaios
    if (containerId) {
      novaMeta.containerOrigemId = containerId;
      await gravarInspecaoOrigemAtual(dadosContainer);
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
    let dadosContainer: unknown = {};
    if (r.meta.containerOrigemId) {
      const container = carregarContainer(r.tagVaso, r.meta.containerOrigemId);
      dadosContainer = container?.dados ?? {};
      await gravarInspecaoOrigemAtual(dadosContainer);
    }
    // Filtra folhas de fotos sem imagem (a lista salva não passa pela auto-injeção que gateia isso).
    const docsFiltrados = filtrarFolhasFotoVazias(r.documentos, dadosContainer);
    // garante documentos na meta mesmo p/ relatórios salvos antes desse campo existir
    await gravarMetaAtual({ ...r.meta, documentos: r.meta.documentos ?? docsFiltrados });
    setDocumentos(docsFiltrados);
    setMeta(r.meta);
    setSomenteLeitura(true);
    setVersao((v) => v + 1);
    setTela('visualizador');
  }

  async function duplicar(r: RelatorioSalvo) {
    const novaMeta: RelatorioMeta = { ...r.meta, codigo: `REL-${Date.now()}`, emissao: hoje(), documentos: r.meta.documentos ?? r.documentos };
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
            <div className="meta-table-wrap">
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
            </div>
          )}
        </div>
      )}

      {tela === 'visualizador' && meta && documentos && (
        <>
          {/* Barra de ações — só 4 botões */}
          <div className="meta-barra-fixa no-print">
            <button type="button" className="btn-secundario barra-btn" onClick={voltarParaHistorico}>
              ← Voltar
            </button>
            <div className="meta-barra-acoes">
              {!somenteLeitura && (
                <button type="button" className={`btn-primario barra-btn ${salvando ? 'is-loading' : ''}`} onClick={salvarHistorico} disabled={salvando}>
                  {salvando ? 'Salvando...' : '💾 Salvar'}
                </button>
              )}
              <button type="button" className="btn-secundario barra-btn" onClick={prepararEImprimir} disabled={imprimindo}>
                {imprimindo ? 'Preparando…' : '🖨 Imprimir'}
              </button>
              <button type="button" className="btn-secundario barra-btn" onClick={() => setModalConfig(true)}>
                ⚙ Configurações
              </button>
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

          {/* Modal de configurações: todas as datas/campos + Atualizar + Baixar PDF */}
          {modalConfig && (
            <div className="rel-modal-overlay no-print" onClick={() => setModalConfig(false)}>
              <div className="rel-modal" onClick={(e) => e.stopPropagation()}>
                <div className="rel-modal-header">
                  <span>Configurações do Relatório</span>
                  <button type="button" className="rel-modal-fechar" onClick={() => setModalConfig(false)}>✕</button>
                </div>
                <div className="rel-modal-corpo">
                  <div className="rel-config-grid">
                    <div className="meta-barra-campo">
                      <label>Código</label>
                      <input value={meta.codigo} disabled />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Emissão</label>
                      <input value={meta.emissao} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('emissao', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Validade</label>
                      <input placeholder="DD/MM/AAAA" value={meta.validade} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('validade', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Execução Insp.</label>
                      <input placeholder="DD/MM/AAAA" value={meta.execucaoInspecao} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('execucaoInspecao', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Próx. Interna</label>
                      <input placeholder="DD/MM/AAAA" value={meta.proximaInspecaoInterna} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('proximaInspecaoInterna', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Próx. Externa</label>
                      <input placeholder="DD/MM/AAAA" value={meta.proximaInspecaoExterna} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('proximaInspecaoExterna', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Valid. Válvula</label>
                      <input placeholder="DD/MM/AAAA" value={meta.validadeValvula} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('validadeValvula', e.target.value)} />
                    </div>
                    <div className="meta-barra-campo">
                      <label>Técnico</label>
                      <input value={meta.tecnicoNome} readOnly={somenteLeitura} onChange={(e) => setCampoMeta('tecnicoNome', e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="rel-modal-acoes">
                  {!somenteLeitura && (
                    <button type="button" className="btn-secundario" onClick={() => { atualizarMetadados(); }}>
                      Atualizar
                    </button>
                  )}
                  <button type="button" className="btn-primario" onClick={baixarPdf} disabled={exportando}>
                    {exportando ? 'PDF...' : 'Baixar PDF'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
