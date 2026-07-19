import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import PaginaA4 from '../components/PaginaA4';
import { ler, listarChavesComPrefixo } from '../services/storage';
import type { InfoEquipamento } from '../features/equipamento/tipos';
import { listarFuncionarios } from '../features/cadastros/cadastroService';
import {
  adicionarEntradaLivroManual,
  atualizarEntradaLivro,
  estaLacrada,
  excluirEntradaLivro,
  lacrarEntradaLivro,
} from '../features/relatorios/relatoriosService';
import { exportarPdf, exportarPdfLivroCompleto } from '../features/relatorios/pdfService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../features/relatorios/printService';
import './dashboard-novo.css';
import './relatorios.css';

interface LivroEntrada {
  id?: string;
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
  // Campos opcionais das entradas automáticas novas (ausentes nas antigas):
  ensaios?: string[];
  apto?: boolean | null;
  tecnicoNome?: string;
  // Ocorrência manual (manutenção/reparo entre inspeções):
  origem?: 'auto' | 'manual';
  quemRealizou?: string;
  // Ciclo de vida rascunho → lacrado. Campo AUSENTE = entrada antiga ⇒ lacrada (imutável).
  lacrado?: boolean;
  retificaDe?: string;
}

interface LinhaLivro {
  tag: string;
  nomeEquip: string;
  entradas: LivroEntrada[];
  ultimaData: string;
  categoria: string;
}

const ROTULO_TIPO: Record<string, string> = {
  vaso: 'Vaso de Pressão',
  caldeira: 'Caldeira',
  autoclave: 'Autoclave',
};

// Cor do badge por tipo de entrada — mesma paleta de badges do sistema (fj-badge), só varia
// a cor por tipo pra dar leitura rápida rolando a linha do tempo.
const COR_TIPO: Record<string, string> = {
  'Inspeção Inicial': 'ok',
  'Inspeção Periódica': 'info',
  'Inspeção Extraordinária': 'warn',
  'Ocorrência': 'crit',
};

function montarLinhas(): LinhaLivro[] {
  const linhas: LinhaLivro[] = [];
  for (const chave of listarChavesComPrefixo('nr13_info_')) {
    try {
      const tag = chave.slice('nr13_info_'.length);
      const info = ler<InfoEquipamento>(chave);
      if (!info) continue;
      const entradas = ler<LivroEntrada[]>(`nr13_livro_${tag}`) ?? [];
      const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
      linhas.push({
        tag,
        nomeEquip: info.descricao?.trim() || ROTULO_TIPO[info.tipo] || 'Equipamento',
        entradas,
        ultimaData: entradas.length > 0 ? entradas[entradas.length - 1].data : '',
        categoria: cat?.catFinal || '',
      });
    } catch { /* chave malformada: ignora */ }
  }
  // Com livro primeiro, depois por TAG.
  linhas.sort((a, b) => (b.entradas.length - a.entradas.length) || a.tag.localeCompare(b.tag));
  return linhas;
}

// Código fictício "de criptografia" — só visual por enquanto (não há assinatura/blockchain
// real ainda). Determinístico a partir do id da entrada pra não mudar a cada render.
function criptografiaFicticia(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().padStart(8, '0');
}

type DocPreview =
  | { arquivo: 'CAPA-LIVRO-REGISTRO.html'; titulo: string }
  | { arquivo: 'TERMO-ABERTURA.html'; titulo: string }
  | { arquivo: 'LIVRO-REGISTRO.html'; titulo: string; entradaId: string; idx: number };

// URLs do livro COMPLETO (capa + termo + todos os registros em ordem cronológica), em
// ?modo=compacto: cada template vira um bloco na altura do conteúdo, sem numeração de folha.
// &idx é o fallback de entradas antigas sem id (o template busca por id e cai no índice).
function urlsLivroCompleto(linha: LinhaLivro): string[] {
  const t = encodeURIComponent(linha.tag);
  return [
    `/arquivos-inspecao/CAPA-LIVRO-REGISTRO.html?tag=${t}&modo=compacto`,
    `/arquivos-inspecao/TERMO-ABERTURA.html?tag=${t}&modo=compacto`,
    ...linha.entradas.map(
      (e, i) => `/arquivos-inspecao/LIVRO-REGISTRO.html?tag=${t}&entrada=${encodeURIComponent(e.id ?? '')}&idx=${i}&modo=compacto`,
    ),
  ];
}

// Iframe que se ajusta à altura real do conteúdo (blocos do livro completo). Re-mede após as
// fontes carregarem — a altura do texto muda quando a Inter substitui a fonte de fallback.
function IframeBlocoLivro({ src, titulo }: { src: string; titulo: string }) {
  const [altura, setAltura] = useState(300);
  return (
    <iframe
      src={src}
      title={titulo}
      scrolling="no"
      style={{ width: 794, height: altura, border: 'none', display: 'block', background: '#fff' }}
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        const medir = () => {
          const pagina = doc?.querySelector<HTMLElement>('.page');
          const h = pagina?.scrollHeight || doc?.body?.scrollHeight || 0;
          if (h > 80) setAltura(h + 2);
        };
        medir();
        setTimeout(medir, 700);
      }}
    />
  );
}

// Tipos de ocorrência manual (manutenções pontuais entre inspeções — NR-13 13.4.1.9).
const TIPOS_OCORRENCIA = [
  'Manutenção corretiva',
  'Manutenção preventiva',
  'Reparo',
  'Substituição de dispositivo',
  'Ajuste/Calibração',
  'Outra ocorrência',
];

interface FormOcorrencia {
  data: string;
  tipoOcorrencia: string;
  oQueFoiFeito: string;
  descricao: string;
  quemRealizou: string;
  phId: string;
  /** id da entrada lacrada que esta ocorrência retifica (vazio = ocorrência comum). */
  retificaDe: string;
}

const FORM_OCORRENCIA_VAZIO: FormOcorrencia = {
  data: '',
  tipoOcorrencia: '',
  oQueFoiFeito: '',
  descricao: '',
  quemRealizou: '',
  phId: '',
  retificaDe: '',
};

/** Edição inline de uma entrada rascunho (só campos de texto — nada de dado congelado). */
interface FormEdicao {
  data: string;
  tipo: string;
  descricao: string;
  quemRealizou: string;
}

export default function LivroRegistro() {
  // Estado (e não useMemo) para poder recarregar a timeline após salvar uma ocorrência manual.
  const [linhas, setLinhas] = useState<LinhaLivro[]>(() => montarLinhas());
  const [tagAberta, setTagAberta] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tag: string; doc: DocPreview } | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [livroCompleto, setLivroCompleto] = useState(false);
  const [exportandoLivro, setExportandoLivro] = useState(false);
  const [form, setForm] = useState<FormOcorrencia>(FORM_OCORRENCIA_VAZIO);
  const [erroForm, setErroForm] = useState('');
  // Edição/lacre de entradas rascunho (uma por vez).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormEdicao>({ data: '', tipo: '', descricao: '', quemRealizou: '' });
  // Confirmação inline de 2 passos (nunca window.confirm — trava a automação do navegador).
  const [confirmandoLacreId, setConfirmandoLacreId] = useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const funcionarios = useMemo(() => listarFuncionarios(), []);

  const comLivro = linhas.filter((l) => l.entradas.length > 0);
  const linhaAberta = linhas.find((l) => l.tag === tagAberta) ?? null;

  // Pré-rasteriza a folha em #print-root assim que o preview abre (mesmo padrão de
  // Relatorios.tsx), pra que Imprimir/Baixar PDF funcionem igual ao resto do sistema.
  useEffect(() => {
    if (!preview) return;
    let cancelado = false;
    const container = document.querySelector<HTMLElement>('.relatorio-preview');
    if (!container) return;
    const iframe = container.querySelector('iframe');
    const aguardar = iframe?.contentDocument && iframe.contentDocument.readyState === 'complete'
      ? Promise.resolve()
      : new Promise<void>((res) => iframe?.addEventListener('load', () => res(), { once: true }));
    aguardar
      .then(() => new Promise((r) => setTimeout(r, 400)))
      .then(() => {
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
  }, [preview]);

  async function imprimirPreview() {
    setImprimindo(true);
    try {
      await imprimirRelatorio('.relatorio-preview');
    } finally {
      setImprimindo(false);
    }
  }

  async function baixarPreview() {
    if (!preview) return;
    setExportando(true);
    try {
      await exportarPdf('.relatorio-preview', `${preview.doc.titulo.replace(/\s+/g, '_')}_${preview.tag}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  async function exportarLivroPdf() {
    if (!linhaAberta || exportandoLivro) return;
    setExportandoLivro(true);
    try {
      await exportarPdfLivroCompleto(urlsLivroCompleto(linhaAberta), `Livro_Registro_${linhaAberta.tag}.pdf`);
    } finally {
      setExportandoLivro(false);
    }
  }

  function abrirModalOcorrencia() {
    setForm(FORM_OCORRENCIA_VAZIO);
    setErroForm('');
    setModalOcorrencia(true);
  }

  // "Retificar" um registro LACRADO: abre o formulário de ocorrência já apontando para ele.
  // O registro lacrado permanece intacto no livro; a retificação é uma entrada NOVA (rascunho).
  function abrirRetificacao(entrada: LivroEntrada) {
    setForm({
      ...FORM_OCORRENCIA_VAZIO,
      data: new Date().toISOString().slice(0, 10),
      tipoOcorrencia: 'Outra ocorrência',
      oQueFoiFeito: `Retificação do registro de ${entrada.data}`,
      retificaDe: entrada.id ?? '',
    });
    setErroForm('');
    setModalOcorrencia(true);
  }

  function iniciarEdicao(entrada: LivroEntrada) {
    setConfirmandoLacreId(null);
    setConfirmandoExclusaoId(null);
    setEditandoId(entrada.id ?? null);
    setFormEdicao({
      data: entrada.data ?? '',
      tipo: entrada.tipo ?? '',
      descricao: entrada.descricao ?? '',
      quemRealizou: entrada.quemRealizou ?? '',
    });
  }

  function salvarEdicao() {
    if (!linhaAberta || !editandoId) return;
    atualizarEntradaLivro(linhaAberta.tag, editandoId, {
      data: formEdicao.data,
      tipo: formEdicao.tipo,
      descricao: formEdicao.descricao,
      quemRealizou: formEdicao.quemRealizou || undefined,
    });
    setEditandoId(null);
    setLinhas(montarLinhas());
  }

  function confirmarLacre(id: string) {
    if (!linhaAberta) return;
    lacrarEntradaLivro(linhaAberta.tag, id);
    setConfirmandoLacreId(null);
    setEditandoId(null);
    setLinhas(montarLinhas());
  }

  function confirmarExclusao(id: string) {
    if (!linhaAberta) return;
    excluirEntradaLivro(linhaAberta.tag, id);
    setConfirmandoExclusaoId(null);
    setEditandoId(null);
    setLinhas(montarLinhas());
  }

  function salvarOcorrencia() {
    if (!linhaAberta) return;
    if (!form.data || !form.tipoOcorrencia || !form.oQueFoiFeito.trim()) {
      setErroForm('Preencha a data, o tipo de ocorrência e o que foi feito.');
      return;
    }
    adicionarEntradaLivroManual(linhaAberta.tag, {
      data: form.data,
      tipoOcorrencia: form.tipoOcorrencia,
      oQueFoiFeito: form.oQueFoiFeito,
      descricao: form.descricao,
      quemRealizou: form.quemRealizou,
      phId: form.phId || null,
      retificaDe: form.retificaDe || undefined,
    });
    setLinhas(montarLinhas());
    setModalOcorrencia(false);
    setForm(FORM_OCORRENCIA_VAZIO);
    setErroForm('');
  }

  const srcPreview = preview
    ? `/arquivos-inspecao/${preview.doc.arquivo}?tag=${encodeURIComponent(preview.tag)}${
        preview.doc.arquivo === 'LIVRO-REGISTRO.html'
          ? `&entrada=${encodeURIComponent(preview.doc.entradaId)}&idx=${preview.doc.idx}`
          : ''
      }`
    : '';

  /* ── Detalhe do equipamento: capa + termo fixos no topo, depois a timeline ── */
  if (linhaAberta) {
    return (
      <div className="dash-page">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <button type="button" className="btn-secundario" style={{ marginBottom: 10 }} onClick={() => { setTagAberta(null); setLivroCompleto(false); }}>
                ← Todos os equipamentos
              </button>
              <div className="fj-eyebrow">NR-13 · 13.4.1.9 · Livro de Registro de Segurança</div>
              <h2>
                {linhaAberta.tag} <span className="fj-eq-name" style={{ fontWeight: 400 }}>— {linhaAberta.nomeEquip}</span>
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {linhaAberta.categoria && <span className="fj-badge neutro">Cat. {linhaAberta.categoria}</span>}
              <span className="fj-badge info2">{linhaAberta.entradas.length} registro(s)</span>
            </div>
          </div>

          {/* Capa e Termo — sempre no topo, fixos */}
          <div className="livro-fixos">
            <button
              type="button"
              className="livro-doc-card"
              onClick={() => setPreview({ tag: linhaAberta.tag, doc: { arquivo: 'CAPA-LIVRO-REGISTRO.html', titulo: 'Capa do Livro de Registro' } })}
            >
              <span className="livro-doc-ic capa"><Icone nome="filetext" tam={16} /></span>
              <div>
                <strong>Capa do Livro</strong>
                <span>Identificação e classificação NR-13</span>
              </div>
            </button>
            <button
              type="button"
              className="livro-doc-card"
              onClick={() => setPreview({ tag: linhaAberta.tag, doc: { arquivo: 'TERMO-ABERTURA.html', titulo: 'Termo de Abertura' } })}
            >
              <span className="livro-doc-ic termo"><Icone nome="book" tam={16} /></span>
              <div>
                <strong>Termo de Abertura</strong>
                <span>NR-13, item 13.4.1.9</span>
              </div>
            </button>
          </div>

          {/* Ações do livro — logo abaixo da capa/termo, onde ficam fáceis de achar */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
            <button type="button" className="fj-btn fj-btn-primary" onClick={abrirModalOcorrencia}>
              <Icone nome="plus" tam={13} /> Adicionar ocorrência
            </button>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setLivroCompleto(true)}>
              <Icone nome="eye" tam={13} /> Ver livro completo
            </button>
            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => void exportarLivroPdf()} disabled={exportandoLivro}>
              <Icone nome="download" tam={13} /> {exportandoLivro ? 'Gerando PDF…' : 'Exportar PDF'}
            </button>
          </div>

          <div className="fj-panel-head" style={{ marginTop: 22, marginBottom: 6 }}>
            <h3 style={{ margin: 0, border: 'none', padding: 0, fontSize: 14 }}>Linha do tempo — ordem cronológica</h3>
          </div>

          {linhaAberta.entradas.length === 0 ? (
            <p className="dashboard-vazio" style={{ padding: '14px 0' }}>Nenhum registro lançado ainda neste livro.</p>
          ) : (
            <ul className="livro-timeline">
              {linhaAberta.entradas.map((entrada, i) => {
                const cor = COR_TIPO[entrada.tipo] ?? 'neutro';
                const cripto = criptografiaFicticia(entrada.id || `${linhaAberta.tag}-${i}`);
                const numeroRegistro = String(i + 1).padStart(6, '0');
                const lacrada = estaLacrada(entrada);
                const emEdicao = !lacrada && editandoId != null && editandoId === entrada.id;
                const retificada = entrada.retificaDe
                  ? linhaAberta.entradas.find((e) => e.id === entrada.retificaDe)
                  : undefined;
                return (
                  <li key={entrada.id ?? i} className="livro-timeline-item">
                    <span className="livro-timeline-marco" />
                    <div className="livro-timeline-corpo">
                      <div className="livro-timeline-topo">
                        <span className={`fj-badge ${cor}`}>{entrada.tipo}</span>
                        {/* Sem selo Apto/Inapto para ocorrência manual — não é laudo de inspeção. */}
                        {entrada.origem !== 'manual' && (entrada.apto === true || entrada.apto === false) && (
                          <span className={`fj-badge ${entrada.apto ? 'ok' : 'crit'}`}>{entrada.apto ? 'Apto' : 'Inapto'}</span>
                        )}
                        {entrada.origem === 'manual' && <span className="selo-flat manual">manual</span>}
                        {lacrada ? (
                          <span className="selo-flat info2" title="Registro lacrado — imutável">
                            <Icone nome="shield" tam={10} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 3 }} />
                            Lacrado
                          </span>
                        ) : (
                          <span className="selo-flat manual" title="Rascunho — ainda pode ser editado ou excluído">Rascunho</span>
                        )}
                        <span className="livro-timeline-data">{entrada.data}</span>
                      </div>
                      {retificada && (
                        <div className="livro-timeline-desc" style={{ fontStyle: 'italic' }}>
                          Retifica o registro de {retificada.data}
                          {retificada.relatorioCodigo ? ` (relatório ${retificada.relatorioCodigo})` : ''}
                        </div>
                      )}
                      {emEdicao ? (
                        <div style={{ display: 'grid', gap: 8, margin: '6px 0 10px' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <div className="fj-field" style={{ minWidth: 160 }}>
                              <label htmlFor={`ed-data-${entrada.id}`}>Data</label>
                              <input
                                id={`ed-data-${entrada.id}`}
                                type="text"
                                value={formEdicao.data}
                                onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
                              />
                            </div>
                            <div className="fj-field" style={{ minWidth: 200 }}>
                              <label htmlFor={`ed-tipo-${entrada.id}`}>Tipo</label>
                              <input
                                id={`ed-tipo-${entrada.id}`}
                                type="text"
                                value={formEdicao.tipo}
                                onChange={(e) => setFormEdicao({ ...formEdicao, tipo: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="fj-field">
                            <label htmlFor={`ed-desc-${entrada.id}`}>Descrição</label>
                            <textarea
                              id={`ed-desc-${entrada.id}`}
                              rows={3}
                              value={formEdicao.descricao}
                              onChange={(e) => setFormEdicao({ ...formEdicao, descricao: e.target.value })}
                            />
                          </div>
                          <div className="fj-field">
                            <label htmlFor={`ed-quem-${entrada.id}`}>Quem realizou</label>
                            <input
                              id={`ed-quem-${entrada.id}`}
                              type="text"
                              value={formEdicao.quemRealizou}
                              onChange={(e) => setFormEdicao({ ...formEdicao, quemRealizou: e.target.value })}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="fj-btn fj-btn-primary" onClick={salvarEdicao}>
                              <Icone nome="check" tam={13} /> Salvar alterações
                            </button>
                            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setEditandoId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="livro-timeline-desc">{entrada.descricao}</div>
                      )}
                      {entrada.ensaios && entrada.ensaios.length > 0 && (
                        <div className="livro-timeline-desc">Ensaios: {entrada.ensaios.join(' · ')}</div>
                      )}
                      <div className="livro-timeline-meta">
                        {entrada.relatorioCodigo && <span>Relatório {entrada.relatorioCodigo}</span>}
                        {entrada.phNome && <span>{entrada.phNome}</span>}
                        {entrada.tecnicoNome && <span>Téc.: {entrada.tecnicoNome}</span>}
                        {entrada.quemRealizou && <span>Exec.: {entrada.quemRealizou}</span>}
                        <span className="selo-flat crypto" title="Selo de integridade — recurso em desenvolvimento">
                          <Icone nome="shield" tam={10} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 3 }} />
                          Criptografia {cripto}
                        </span>
                        <span className="selo-flat info2">Registro nº {numeroRegistro}</span>
                        <span className="selo-flat ok">
                          <Icone nome="check" tam={10} style={{ display: 'inline-block', verticalAlign: -1, marginRight: 3 }} />
                          Íntegro
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 190 }}>
                      <button
                        type="button"
                        className="fj-btn fj-btn-ghost"
                        onClick={() =>
                          setPreview({
                            tag: linhaAberta.tag,
                            doc: { arquivo: 'LIVRO-REGISTRO.html', titulo: `Registro_${entrada.data.replace(/\//g, '-')}`, entradaId: entrada.id ?? '', idx: i },
                          })
                        }
                      >
                        <Icone nome="eye" tam={13} /> Ver / Imprimir
                      </button>

                      {/* Rascunho: edita, exclui e lacra. Lacrado: só retificação (entrada nova). */}
                      {!lacrada && !emEdicao && (
                        <button type="button" className="fj-btn fj-btn-ghost" onClick={() => iniciarEdicao(entrada)}>
                          <Icone nome="pencil" tam={13} /> Editar
                        </button>
                      )}

                      {!lacrada && confirmandoLacreId !== entrada.id && (
                        <button
                          type="button"
                          className="fj-btn fj-btn-primary"
                          onClick={() => { setConfirmandoExclusaoId(null); setConfirmandoLacreId(entrada.id ?? null); }}
                        >
                          <Icone nome="shield" tam={13} /> Lacrar registro
                        </button>
                      )}
                      {!lacrada && confirmandoLacreId === entrada.id && (
                        <div className="fj-confirm-inline" style={{ border: '1px solid var(--border, #D1D5DB)', borderRadius: 6, padding: 8 }}>
                          <p style={{ margin: '0 0 8px', fontSize: 12 }}>
                            Lacrar este registro? Depois de lacrado ele <strong>não poderá mais ser editado
                            nem excluído</strong> — qualquer correção só será possível por meio de um registro
                            de retificação.
                          </p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="fj-btn fj-btn-primary" onClick={() => confirmarLacre(entrada.id ?? '')}>
                              <Icone nome="check" tam={13} /> Confirmar lacre
                            </button>
                            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setConfirmandoLacreId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {!lacrada && confirmandoExclusaoId !== entrada.id && (
                        <button
                          type="button"
                          className="fj-btn fj-btn-ghost"
                          onClick={() => { setConfirmandoLacreId(null); setConfirmandoExclusaoId(entrada.id ?? null); }}
                        >
                          <Icone nome="trash" tam={13} /> Excluir rascunho
                        </button>
                      )}
                      {!lacrada && confirmandoExclusaoId === entrada.id && (
                        <div style={{ border: '1px solid var(--border, #D1D5DB)', borderRadius: 6, padding: 8 }}>
                          <p style={{ margin: '0 0 8px', fontSize: 12 }}>Excluir este rascunho do livro? A ação não pode ser desfeita.</p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="fj-btn fj-btn-primary" onClick={() => confirmarExclusao(entrada.id ?? '')}>
                              <Icone nome="check" tam={13} /> Confirmar exclusão
                            </button>
                            <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setConfirmandoExclusaoId(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {lacrada && entrada.id && (
                        <button type="button" className="fj-btn fj-btn-ghost" onClick={() => abrirRetificacao(entrada)}>
                          <Icone nome="pencil" tam={13} /> Retificar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {preview && (
          <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
            <div className="fj-modal-box" style={{ maxWidth: 900 }}>
              <div className="fj-modal-head">
                <div>
                  <div className="fj-eyebrow">{preview.doc.titulo}</div>
                  <h2>{preview.tag}</h2>
                </div>
                <button type="button" className="fj-modal-close" onClick={() => setPreview(null)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
                <button type="button" className="btn-secundario" onClick={() => void imprimirPreview()} disabled={imprimindo}>
                  {imprimindo ? 'Preparando…' : 'Imprimir'}
                </button>
                <button type="button" className="barra-btn barra-btn-pdf" onClick={() => void baixarPreview()} disabled={exportando}>
                  <Icone nome="download" tam={13} /> {exportando ? 'Gerando PDF…' : 'Baixar PDF'}
                </button>
              </div>
              <div style={{ padding: 16 }} className="relatorio-preview">
                <PaginaA4>
                  <iframe src={srcPreview} scrolling="no" title={preview.doc.titulo} />
                </PaginaA4>
              </div>
            </div>
          </div>
        )}

        {livroCompleto && (
          <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setLivroCompleto(false)}>
            <div className="fj-modal-box" style={{ maxWidth: 900 }}>
              <div className="fj-modal-head">
                <div>
                  <div className="fj-eyebrow">Livro de Registro completo — ordem cronológica</div>
                  <h2>{linhaAberta.tag}</h2>
                </div>
                <button type="button" className="fj-modal-close" onClick={() => setLivroCompleto(false)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
                <button type="button" className="barra-btn barra-btn-pdf" onClick={() => void exportarLivroPdf()} disabled={exportandoLivro}>
                  <Icone nome="download" tam={13} /> {exportandoLivro ? 'Gerando PDF…' : 'Exportar PDF'}
                </button>
              </div>
              <div style={{ padding: 16, overflowX: 'auto' }}>
                {/* Documento único: capa, termo de abertura e todos os registros empilhados */}
                <div style={{ width: 794, margin: '0 auto', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.18)' }}>
                  {urlsLivroCompleto(linhaAberta).map((url, i) => (
                    <IframeBlocoLivro key={url} src={url} titulo={`Bloco ${i + 1} do livro`} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {modalOcorrencia && (
          <div className="fj-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalOcorrencia(false)}>
            <div className="fj-modal-box" style={{ maxWidth: 560 }}>
              <div className="fj-modal-head">
                <div>
                  <div className="fj-eyebrow">Livro de Registro · {linhaAberta.tag}</div>
                  <h2>{form.retificaDe ? 'Registro de retificação' : 'Adicionar ocorrência'}</h2>
                </div>
                <button type="button" className="fj-modal-close" onClick={() => setModalOcorrencia(false)} aria-label="Fechar">
                  <Icone nome="x" tam={15} />
                </button>
              </div>
              <div style={{ padding: '4px 16px 16px', display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted, #6B7280)' }}>
                  Registre manutenções, reparos e demais ocorrências realizadas entre inspeções — elas
                  entram na linha do tempo do livro na ordem cronológica.
                </p>
                {form.retificaDe && (
                  <div className="fj-badge warn" style={{ justifySelf: 'start' }}>
                    Retifica o registro de{' '}
                    {linhaAberta.entradas.find((e) => e.id === form.retificaDe)?.data ?? '—'} — o registro
                    lacrado permanece no livro; esta é uma entrada nova de correção.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div className="fj-field">
                    <label htmlFor="oc-data">Data da ocorrência *</label>
                    <input
                      id="oc-data"
                      type="date"
                      value={form.data}
                      onChange={(e) => setForm({ ...form, data: e.target.value })}
                    />
                  </div>
                  <div className="fj-field">
                    <label htmlFor="oc-tipo">Tipo de ocorrência *</label>
                    <select
                      id="oc-tipo"
                      value={form.tipoOcorrencia}
                      onChange={(e) => setForm({ ...form, tipoOcorrencia: e.target.value })}
                    >
                      <option value="">Selecione…</option>
                      {TIPOS_OCORRENCIA.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-feito">O que foi feito *</label>
                  <input
                    id="oc-feito"
                    type="text"
                    placeholder="Ex.: Troca da válvula de segurança"
                    value={form.oQueFoiFeito}
                    onChange={(e) => setForm({ ...form, oQueFoiFeito: e.target.value })}
                  />
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-desc">Descrição</label>
                  <textarea
                    id="oc-desc"
                    rows={3}
                    placeholder="Detalhes da ocorrência, peças substituídas, condições encontradas…"
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  />
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-quem">Quem realizou</label>
                  <input
                    id="oc-quem"
                    type="text"
                    placeholder="Ex.: empresa/técnico executante"
                    value={form.quemRealizou}
                    onChange={(e) => setForm({ ...form, quemRealizou: e.target.value })}
                  />
                </div>
                <div className="fj-field">
                  <label htmlFor="oc-ph">Responsável que assina</label>
                  <select id="oc-ph" value={form.phId} onChange={(e) => setForm({ ...form, phId: e.target.value })}>
                    <option value="">— sem assinatura —</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}{f.crea ? ` — ${f.crea}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {erroForm && (
                  <div className="fj-badge crit" role="alert" style={{ justifySelf: 'start' }}>{erroForm}</div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setModalOcorrencia(false)}>
                    Cancelar
                  </button>
                  <button type="button" className="fj-btn fj-btn-primary" onClick={salvarOcorrencia}>
                    <Icone nome="check" tam={13} /> Salvar ocorrência
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Lista de equipamentos ── */
  return (
    <div className="dash-page">
      <div className="fj-panel">
        <div className="fj-panel-head">
          <div>
            <div className="fj-eyebrow">NR-13 · 13.4.1.9</div>
            <h2>Livros de Registro de Segurança</h2>
          </div>
          <span className="fj-badge neutro">{comLivro.length} livro{comLivro.length !== 1 ? 's' : ''} gerado{comLivro.length !== 1 ? 's' : ''}</span>
        </div>

        {comLivro.length === 0 ? (
          <div className="fj-empty">
            <div className="fj-empty-ic"><Icone nome="book" tam={22} /></div>
            <div className="fj-empty-title">
              {linhas.length === 0 ? 'Nenhum equipamento cadastrado' : 'Nenhum livro de registro gerado ainda'}
            </div>
            O livro de registro de cada equipamento é criado automaticamente na primeira inspeção
            (com termo de abertura) e recebe uma anotação a cada relatório salvo. Ocorrências manuais
            (manutenções, reparos, substituições) podem ser adicionadas dentro do livro.
          </div>
        ) : (
          <div className="fj-table-wrap">
            <table className="fj-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Categoria</th>
                  <th>Registros</th>
                  <th>Último registro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {comLivro.map((l) => (
                  <tr key={l.tag} className="linha-clicavel" onClick={() => setTagAberta(l.tag)}>
                    <td>
                      <div className="fj-tag-cell">
                        <div className="fj-tag-ico"><Icone nome="book" tam={15} /></div>
                        <div>
                          <div className="fj-tag-code">{l.tag}</div>
                          <div className="fj-eq-name">{l.nomeEquip}</div>
                        </div>
                      </div>
                    </td>
                    <td>{l.categoria ? <span className="fj-badge neutro">Cat. {l.categoria}</span> : <span className="fj-dash">—</span>}</td>
                    <td className="mono">{l.entradas.length}</td>
                    <td className="mono">{l.ultimaData || <span className="fj-dash">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="fj-btn fj-btn-ghost" onClick={() => setTagAberta(l.tag)}>
                        <Icone nome="chevright" tam={13} /> Abrir livro
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fj-panel-foot">
          O livro é preenchido automaticamente (cada relatório salvo adiciona a anotação de inspeção
          correspondente) e também aceita ocorrências manuais — manutenções e reparos entre inspeções —
          pelo botão "Adicionar ocorrência" dentro do livro de cada equipamento.
        </div>
      </div>
    </div>
  );
}
