import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../components/Icone';
import PaginaA4 from '../components/PaginaA4';
import { ler, listarChavesComPrefixo } from '../services/storage';
import type { InfoEquipamento } from '../features/equipamento/tipos';
import { exportarPdf } from '../features/relatorios/pdfService';
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
  | { arquivo: 'LIVRO-REGISTRO.html'; titulo: string; entradaId: string };

export default function LivroRegistro() {
  const linhas = useMemo(() => montarLinhas(), []);
  const [tagAberta, setTagAberta] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tag: string; doc: DocPreview } | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [exportando, setExportando] = useState(false);

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

  const srcPreview = preview
    ? `/arquivos-inspecao/${preview.doc.arquivo}?tag=${encodeURIComponent(preview.tag)}${
        preview.doc.arquivo === 'LIVRO-REGISTRO.html' ? `&entrada=${encodeURIComponent(preview.doc.entradaId)}` : ''
      }`
    : '';

  /* ── Detalhe do equipamento: capa + termo fixos no topo, depois a timeline ── */
  if (linhaAberta) {
    return (
      <div className="dash-page">
        <div className="fj-panel">
          <div className="fj-panel-head">
            <div>
              <button type="button" className="btn-secundario" style={{ marginBottom: 10 }} onClick={() => setTagAberta(null)}>
                ← Todos os equipamentos
              </button>
              <div className="fj-eyebrow">NR-13 · 13.4.1.9 · Livro de Registro de Segurança</div>
              <h2>
                {linhaAberta.tag} <span className="fj-eq-name" style={{ fontWeight: 400 }}>— {linhaAberta.nomeEquip}</span>
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                return (
                  <li key={entrada.id ?? i} className="livro-timeline-item">
                    <span className="livro-timeline-marco" />
                    <div className="livro-timeline-corpo">
                      <div className="livro-timeline-topo">
                        <span className={`fj-badge ${cor}`}>{entrada.tipo}</span>
                        {(entrada.apto === true || entrada.apto === false) && (
                          <span className={`fj-badge ${entrada.apto ? 'ok' : 'crit'}`}>{entrada.apto ? 'Apto' : 'Inapto'}</span>
                        )}
                        <span className="livro-timeline-data">{entrada.data}</span>
                      </div>
                      <div className="livro-timeline-desc">{entrada.descricao}</div>
                      {entrada.ensaios && entrada.ensaios.length > 0 && (
                        <div className="livro-timeline-desc">Ensaios: {entrada.ensaios.join(' · ')}</div>
                      )}
                      <div className="livro-timeline-meta">
                        {entrada.relatorioCodigo && <span>Relatório {entrada.relatorioCodigo}</span>}
                        {entrada.phNome && <span>{entrada.phNome}</span>}
                        {entrada.tecnicoNome && <span>Téc.: {entrada.tecnicoNome}</span>}
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
                    <button
                      type="button"
                      className="fj-btn fj-btn-ghost"
                      onClick={() =>
                        setPreview({
                          tag: linhaAberta.tag,
                          doc: { arquivo: 'LIVRO-REGISTRO.html', titulo: `Registro_${entrada.data.replace(/\//g, '-')}`, entradaId: entrada.id ?? '' },
                        })
                      }
                    >
                      <Icone nome="eye" tam={13} /> Ver / Imprimir
                    </button>
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
            (com termo de abertura) e recebe uma anotação a cada relatório salvo.
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
          O livro é preenchido automaticamente: cada relatório salvo adiciona a anotação de inspeção correspondente.
        </div>
      </div>
    </div>
  );
}
