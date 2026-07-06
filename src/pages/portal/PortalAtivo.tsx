import { useEffect, useMemo, useState } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import { Link, useParams } from 'react-router-dom';
import { ler } from '../../services/storage';
import { listarHistorico, filtrarFolhasFotoVazias, gravarMetaAtual, gravarInspecaoOrigemAtual } from '../../features/relatorios/relatoriosService';
import { exportarPdf } from '../../features/relatorios/pdfService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../../features/relatorios/printService';
import { listarContainers, carregarContainer } from '../../features/inspecoes/inspecaoService';
import { listarComponentes } from '../../features/calibracoes/componentesService';
import { listarCalibracoes } from '../../features/calibracoes/calibracaoService';
import type { DadosCalibracao } from '../../features/calibracoes/tipos';
import { carregarProntuario, gravarProntuarioAtual } from '../../features/prontuarios/prontuarioService';
import { PAGINAS_PRONTUARIO } from '../../features/prontuarios/tipos';
import { parseDataFlex, statusPrazo } from '../../services/vencimentos';
import type { InfoEquipamento } from '../../features/equipamento/tipos';
import type { RelatorioSalvo } from '../../features/relatorios/tipos';
import PaginaA4 from '../../components/PaginaA4';
import '../relatorios.css';
import '../calibracoes.css';

type Aba = 'documentacao' | 'prontuario' | 'registros' | 'historico' | 'acessorios';

interface LivroEntradaView {
  data: string;
  tipo: string;
  descricao: string;
  relatorioCodigo: string;
  phNome: string;
}

interface EventoHistorico {
  ts: number;
  data: string;
  icone: NomeIcone;
  titulo: string;
  detalhe?: string;
  aoClicar?: () => void;
}

// Documento simples (Prontuário / Livro / Termo / Capa): já não depende de um relatório
// salvo — igual ao padrão de LivroRegistro.tsx e Prontuarios.tsx (visualizador própria).
interface DocumentoSimples {
  titulo: string;
  paginas: string[]; // URLs prontas do iframe (já com ?tag=...&page=...)
}

// Detalhe do ativo no portal: resumo à esquerda, abas à direita (Documentação /
// Prontuário / Registros / Histórico / Acessórios). Tudo somente leitura.
export default function PortalAtivo() {
  const { tag = '' } = useParams<{ tag: string }>();
  const [aba, setAba] = useState<Aba>('documentacao');
  const [relatorioAberto, setRelatorioAberto] = useState<RelatorioSalvo | null>(null);
  const [docsVisiveis, setDocsVisiveis] = useState<string[]>([]);
  const [documentoSimples, setDocumentoSimples] = useState<DocumentoSimples | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [exportando, setExportando] = useState(false);

  const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
  const fotos = ler<{ src: string; isCapa: boolean }[]>(`nr13_fotos_${tag}`) || [];
  const capa = fotos.find((f) => f.isCapa) ?? fotos[0] ?? null;
  const cat = ler<{ catFinal?: string }>(`nr13_cat_${tag}`);
  const calc = ler<{ pmta?: string; pth?: string; resultado?: string }>(`nr13_calc_${tag}`);
  const emp = ler<{ razaoSocial?: string; cidade?: string; endereco?: string }>(`nr13_emp_${tag}`);
  const livro = ler<LivroEntradaView[]>(`nr13_livro_${tag}`) || [];
  const relatorios = useMemo(() => listarHistorico(tag), [tag]);
  const containers = useMemo(() => listarContainers(tag), [tag]);
  const componentes = useMemo(() => listarComponentes(tag), [tag]);
  const calibracoes = useMemo(() => listarCalibracoes(tag), [tag]);
  const prontuario = useMemo(() => carregarProntuario(tag), [tag]);

  // Itens da aba Registros: só os que realmente existem pra este equipamento (mesma
  // condição de LivroRegistro.tsx — termo de abertura nasce junto com a 1ª entrada do livro).
  const itensRegistros = useMemo(() => {
    const itens: { titulo: string; doc: string; meta?: string }[] = [];
    if (livro.length > 0) {
      itens.push({ titulo: 'Livro de Registro de Segurança', doc: 'LIVRO-REGISTRO.html', meta: `${livro.length} registro(s)` });
      itens.push({ titulo: 'Termo de Abertura', doc: 'TERMO-ABERTURA.html' });
    }
    if (capa) itens.push({ titulo: 'Capa do Equipamento', doc: 'CAPA.html' });
    return itens;
  }, [livro, capa]);

  const eventosHistorico = useMemo<EventoHistorico[]>(() => {
    const out: EventoHistorico[] = [];
    for (const l of livro) {
      out.push({ ts: parseDataFlex(l.data)?.getTime() ?? 0, data: l.data, icone: 'book', titulo: l.tipo, detalhe: l.descricao });
    }
    for (const r of relatorios) {
      out.push({
        ts: parseDataFlex(r.data)?.getTime() ?? 0,
        data: r.data,
        icone: 'filetext',
        titulo: 'Relatório gerado',
        detalhe: r.nome,
        aoClicar: () => void abrirRelatorio(r),
      });
    }
    for (const c of containers) {
      out.push({ ts: parseDataFlex(c.criadoEm)?.getTime() ?? 0, data: c.criadoEm, icone: 'clipboard', titulo: 'Inspeção de campo registrada', detalhe: c.nome });
    }
    for (const cal of calibracoes) {
      out.push({
        ts: parseDataFlex(cal.dataEmissao)?.getTime() ?? 0,
        data: cal.dataEmissao,
        icone: 'gauge',
        titulo: 'Calibração realizada',
        detalhe: `${cal.nome || cal.instrumento}${cal.numeroCertificado ? ` — Cert. ${cal.numeroCertificado}` : ''}`,
      });
    }
    return out.sort((a, b) => b.ts - a.ts);
  }, [livro, relatorios, containers, calibracoes]);

  function ultimaCalibracao(componenteId: string): DadosCalibracao | null {
    const doComp = calibracoes.filter((c) => c.componenteId === componenteId);
    if (doComp.length === 0) return null;
    return doComp.reduce((mais, atual) => {
      const tsMais = parseDataFlex(mais.dataCalibracao)?.getTime() ?? 0;
      const tsAtual = parseDataFlex(atual.dataCalibracao)?.getTime() ?? 0;
      return tsAtual > tsMais ? atual : mais;
    });
  }

  // Reabre um relatório salvo em modo leitura: regrava as chaves "atuais" que os
  // templates leem (CLAUDE.md §2 — REGRA CRÍTICA DE INJEÇÃO) antes de montar os iframes.
  async function abrirRelatorio(r: RelatorioSalvo) {
    await gravarMetaAtual(r.meta);
    const container = r.meta.containerOrigemId ? carregarContainer(tag, r.meta.containerOrigemId) : null;
    await gravarInspecaoOrigemAtual(container?.dados ?? {});
    setDocsVisiveis(filtrarFolhasFotoVazias(r.documentos, container?.dados));
    setRelatorioAberto(r);
  }

  // Livro/Termo/Capa: documentos que dependem só da TAG (sem relatório escolhido),
  // igual ao preview usado em LivroRegistro.tsx.
  function abrirRegistro(titulo: string, doc: string) {
    setDocumentoSimples({ titulo, paginas: [`/arquivos-inspecao/${doc}?tag=${encodeURIComponent(tag)}&page=1`] });
  }

  // Prontuário: registro único por equipamento (nr13_prontuario_<TAG>), independente
  // do histórico de relatórios — mesmo fluxo de Prontuarios.tsx (gravarProntuarioAtual
  // antes de montar os iframes de /arquivos-prontuario/).
  async function abrirProntuario() {
    if (!prontuario) return;
    await gravarProntuarioAtual(prontuario);
    const n = PAGINAS_PRONTUARIO.length;
    setDocumentoSimples({
      titulo: 'Prontuário',
      paginas: PAGINAS_PRONTUARIO.map((doc, i) => `/arquivos-prontuario/${doc}?tag=${encodeURIComponent(tag)}&page=${i + 1}&total=${n}`),
    });
  }

  function fecharVisualizador() {
    setRelatorioAberto(null);
    setDocumentoSimples(null);
  }

  async function imprimirDocumento() {
    setImprimindo(true);
    try {
      await imprimirRelatorio('.relatorio-preview');
    } finally {
      setImprimindo(false);
    }
  }

  async function baixarDocumento() {
    const titulo = relatorioAberto?.nome ?? documentoSimples?.titulo;
    if (!titulo) return;
    setExportando(true);
    try {
      await exportarPdf('.relatorio-preview', `${titulo.replace(/\s+/g, '_')}_${tag}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  const paginasAtivas = relatorioAberto
    ? docsVisiveis.map((doc, i) => {
        const sep = doc.includes('?') ? '&' : '?';
        return `/arquivos-inspecao/${doc}${sep}tag=${encodeURIComponent(tag)}&page=${i + 1}`;
      })
    : documentoSimples?.paginas ?? null;
  const tituloAtivo = relatorioAberto?.nome ?? documentoSimples?.titulo ?? '';

  // Pré-rasteriza as folhas em #print-root assim que o documento abre (mesmo padrão de
  // Relatorios.tsx), pra que o Ctrl+P nativo já imprima as imagens prontas.
  useEffect(() => {
    if (!paginasAtivas) return;
    let cancelado = false;
    const preview = document.querySelector<HTMLElement>('.relatorio-preview');
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
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview');
      });
    return () => {
      cancelado = true;
      limparFolhasImpressao();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paginasAtivas é recriado a cada render; comparar pelo conteúdo via join evita loop
  }, [paginasAtivas?.join('|')]);

  if (paginasAtivas) {
    return (
      <div className="portal-pagina">
        <div className="meta-barra-fixa no-print">
          <button type="button" className="btn-secundario barra-btn" onClick={fecharVisualizador}>
            ← Voltar para {tag}
          </button>
          <div className="meta-barra-acoes">
            <button type="button" className="btn-secundario barra-btn" onClick={() => void imprimirDocumento()} disabled={imprimindo}>
              {imprimindo ? 'Preparando…' : 'Imprimir'}
            </button>
            <button type="button" className="barra-btn barra-btn-pdf" onClick={() => void baixarDocumento()} disabled={exportando}>
              <Icone nome="download" tam={14} /> {exportando ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
          </div>
        </div>
        <h2 style={{ margin: '12px 0' }}>{tituloAtivo}</h2>
        <div className="relatorio-preview portal-preview-doc">
          {paginasAtivas.map((src, i) => (
            <PaginaA4 key={`${src}-${i}`}>
              <iframe src={src} scrolling="no" title={tituloAtivo} />
            </PaginaA4>
          ))}
        </div>
      </div>
    );
  }

  function ListaDocumentos({ lista, vazio }: { lista: RelatorioSalvo[]; vazio: string }) {
    if (lista.length === 0) return <p className="portal-hint">{vazio}</p>;
    return (
      <ul className="portal-lista-docs">
        {lista.map((r) => (
          <li key={r.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icone nome="filetext" tam={18} style={{ color: '#1e3a8a' }} />
              <div>
                <b>{r.nome}</b>
                <span className="portal-doc-meta">
                  {r.meta?.codigo ? `${r.meta.codigo} · ` : ''}{r.data} · {r.tipo}
                </span>
              </div>
            </div>
            <button type="button" className="btn-primario" onClick={() => void abrirRelatorio(r)}>
              Visualizar
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="portal-pagina">
      <Link to="/portal" className="btn-secundario">← Todos os equipamentos</Link>

      <div className="portal-detalhe">
        {/* ── Resumo do ativo (esquerda) ── */}
        <aside className="portal-resumo">
          <div className="portal-resumo-foto">
            {capa ? <img src={capa.src} alt={tag} /> : <span className="portal-card-sem-foto"><Icone nome="box" tam={22} /></span>}
          </div>
          <h2>{tag}</h2>
          {info?.descricao && <p className="portal-card-desc">{info.descricao}</p>}
          <dl className="portal-resumo-dados">
            {info?.fabricante && (<><dt>Fabricante</dt><dd>{info.fabricante}</dd></>)}
            {info?.ano && (<><dt>Ano</dt><dd>{info.ano}</dd></>)}
            {info?.numeroSerie && (<><dt>Nº de série</dt><dd>{info.numeroSerie}</dd></>)}
            {cat?.catFinal && (<><dt>Categoria NR-13</dt><dd>{cat.catFinal}</dd></>)}
            {calc?.pmta && (<><dt>PMTA</dt><dd>{calc.pmta} MPa</dd></>)}
            {calc?.resultado && (<><dt>Situação</dt><dd>{calc.resultado}</dd></>)}
            {emp?.razaoSocial && (<><dt>Instalado em</dt><dd>{emp.razaoSocial}{emp.cidade ? ` — ${emp.cidade}` : ''}</dd></>)}
          </dl>
        </aside>

        {/* ── Abas (direita) ── */}
        <section className="portal-abas">
          <div className="portal-abas-nav">
            <button type="button" className={aba === 'documentacao' ? 'ativa' : ''} onClick={() => setAba('documentacao')}>
              Documentação
            </button>
            <button type="button" className={aba === 'prontuario' ? 'ativa' : ''} onClick={() => setAba('prontuario')}>
              Prontuário
            </button>
            <button type="button" className={aba === 'registros' ? 'ativa' : ''} onClick={() => setAba('registros')}>
              Registros
            </button>
            <button type="button" className={aba === 'historico' ? 'ativa' : ''} onClick={() => setAba('historico')}>
              Histórico
            </button>
            <button type="button" className={aba === 'acessorios' ? 'ativa' : ''} onClick={() => setAba('acessorios')}>
              Acessórios
            </button>
          </div>

          {aba === 'documentacao' && (
            <div className="portal-aba-corpo">
              <ListaDocumentos lista={relatorios} vazio="Nenhum relatório publicado para este equipamento ainda." />
            </div>
          )}

          {aba === 'prontuario' && (
            <div className="portal-aba-corpo">
              {!prontuario ? (
                <p className="portal-hint">Nenhum prontuário elaborado para este equipamento ainda.</p>
              ) : (
                <ul className="portal-lista-docs">
                  <li>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icone nome="filetext" tam={18} style={{ color: '#1e3a8a' }} />
                      <div>
                        <b>Prontuário do Equipamento</b>
                        <span className="portal-doc-meta">Atualizado em {prontuario.criadoEm}</span>
                      </div>
                    </div>
                    <button type="button" className="btn-primario" onClick={() => void abrirProntuario()}>
                      Visualizar
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}

          {aba === 'registros' && (
            <div className="portal-aba-corpo">
              {itensRegistros.length === 0 ? (
                <p className="portal-hint">Nenhum livro de registro, termo de abertura ou capa publicado ainda.</p>
              ) : (
                <ul className="portal-lista-docs">
                  {itensRegistros.map((item) => (
                    <li key={item.doc}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icone nome="filetext" tam={18} style={{ color: '#1e3a8a' }} />
                        <div>
                          <b>{item.titulo}</b>
                          {item.meta && <span className="portal-doc-meta">{item.meta}</span>}
                        </div>
                      </div>
                      <button type="button" className="btn-primario" onClick={() => abrirRegistro(item.titulo, item.doc)}>
                        Visualizar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {aba === 'historico' && (
            <div className="portal-aba-corpo">
              {eventosHistorico.length === 0 ? (
                <p className="portal-hint">Nenhum evento registrado ainda para este equipamento.</p>
              ) : (
                <ul className="portal-timeline">
                  {eventosHistorico.map((ev, i) => (
                    <li key={i} className={ev.aoClicar ? 'clicavel' : ''} onClick={ev.aoClicar}>
                      <span className="portal-timeline-ic"><Icone nome={ev.icone} tam={15} /></span>
                      <div className="portal-timeline-corpo">
                        <div className="portal-timeline-topo">
                          <b>{ev.titulo}</b>
                          <span className="portal-timeline-data">{ev.data || '—'}</span>
                        </div>
                        {ev.detalhe && <span className="portal-timeline-detalhe">{ev.detalhe}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {aba === 'acessorios' && (
            <div className="portal-aba-corpo">
              {componentes.length === 0 ? (
                <p className="portal-hint">Nenhum acessório (válvula/manômetro) cadastrado para este equipamento.</p>
              ) : (
                <div className="cal-comp-lista">
                  {componentes.map((c) => {
                    const ultima = ultimaCalibracao(c.id);
                    const venc = ultima ? parseDataFlex(ultima.dataProxCalibracao) : null;
                    const prazo = venc ? statusPrazo(venc, new Date()) : null;
                    return (
                      <div key={c.id} className="cal-comp-item">
                        <div className="cal-comp-foto">
                          {c.foto ? <img src={c.foto} alt={c.nome} /> : <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={26} />}
                        </div>
                        <div className="cal-comp-nome">
                          <strong>{c.nome}</strong>
                          <span>{[c.fabricante, c.serie && `S/N ${c.serie}`].filter(Boolean).join(' · ') || '—'}</span>
                        </div>
                        <span className={`badge-cal-tipo ${c.tipo}`}>{c.tipo === 'manometro' ? 'Manômetro' : 'PSV'}</span>
                        {ultima && prazo ? (
                          <span className={`fj-badge ${prazo.status}`}>
                            {prazo.status === 'crit' ? `Vencida há ${Math.abs(prazo.dias)} dia(s)` : `Próx. calibração ${ultima.dataProxCalibracao}`}
                          </span>
                        ) : (
                          <span className="fj-badge neutro">Sem calibração registrada</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
