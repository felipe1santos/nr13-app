import { useEffect, useMemo, useRef, useState } from 'react';
import { Icone, type NomeIcone } from '../../components/Icone';
import { Link, useParams } from 'react-router-dom';
import { ler } from '../../services/storage';
import { listarHistorico, carregarRelatorio, filtrarFolhasFotoVazias, gravarMetaAtual, gravarInspecaoOrigemAtual } from '../../features/relatorios/relatoriosService';
import { chaveRelatorio } from '../../features/relatorios/historicoRelatorios';
import { buscarChaveSobDemanda } from '../../features/portal/portalService';
import { exportarPdf } from '../../features/relatorios/pdfService';
import { imprimirRelatorio, prepararFolhasImpressao, limparFolhasImpressao } from '../../features/relatorios/printService';
import AnexosRastreabPreview from '../../features/relatorios/AnexosRastreabPreview';
import { listarContainers, carregarContainer } from '../../features/inspecoes/inspecaoService';
import { fotoDoComponente, listarComponentes } from '../../features/calibracoes/componentesService';
import FotoImg from '../../components/FotoImg';
import VisualizadorPdf, { baixarPdfArquivado, imprimirPdfArquivado } from '../../components/VisualizadorPdf';
import { artefatoDe } from '../../features/relatorios/artefatoRelatorio';
import type { FotoArmazenada } from '../../services/fotos';
import { listarCalibracoes, arquivoCalibracao, hidratarItemLocal } from '../../features/calibracoes/calibracaoService';
import type { DadosCalibracao } from '../../features/calibracoes/tipos';
import { carregarProntuario, materializarProntuarioAtual } from '../../features/prontuarios/prontuarioService';
import {
  abrirProntuarioFabricante,
  formatarDataEnvio,
  formatarTamanho as formatarTamanhoPdf,
  lerProntuarioFabricante,
} from '../../features/equipamento/ProntuarioFabricante';
import { paginasProntuario } from '../../features/prontuarios/tipos';
import { parseDataFlex, statusPrazo } from '../../services/vencimentos';
import type { InfoEquipamento } from '../../features/equipamento/tipos';
import { temArtefato, type RelatorioIndiceItem, type RelatorioSalvo } from '../../features/relatorios/tipos';
import PaginaA4 from '../../components/PaginaA4';
import { travarIframeSomenteLeitura } from '../../features/documentos/somenteLeituraDoc';
import '../relatorios.css';
import '../calibracoes.css';

type Aba = 'documentacao' | 'prontuario' | 'registros' | 'historico' | 'acessorios' | 'calibracoes';

interface LivroEntradaView {
  /** id da entrada — o template LIVRO-REGISTRO.html busca por ele (?entrada=); &idx é o fallback. */
  id?: string;
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

// Folha do documento no portal: o iframe é travado em SOMENTE LEITURA assim que carrega
// (templates são preenchíveis por padrão — ver somenteLeituraDoc.ts).
function IframeDocumento({ src, titulo }: { src: string; titulo: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return travarIframeSomenteLeitura(ref.current);
  }, [src]);
  return <iframe ref={ref} src={src} scrolling="no" title={titulo} />;
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
  // Fase 4: o registro do relatório legado vem sob demanda, então a abertura pode esperar
  // rede — e pode falhar. Sem estes dois, o clique ficaria mudo (o defeito do cb26450).
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [erroPortal, setErroPortal] = useState<string | null>(null);

  const info = ler<InfoEquipamento>(`nr13_info_${tag}`);
  // `ref` é o caminho no bucket; `src` só continua preenchido nas fotos legadas.
  const fotos = ler<(FotoArmazenada & { src?: string; isCapa?: boolean })[]>(`nr13_fotos_${tag}`) || [];
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
  // PDF do prontuário original do fabricante (nr13_pront_fab_<TAG>) — não é template
  // HTML, então NÃO passa por abrirProntuario()/abrirRegistro(): abre o PDF direto.
  const prontFabricante = useMemo(() => lerProntuarioFabricante(tag), [tag]);

  // Itens da aba Registros: só os que realmente existem pra este equipamento (mesma
  // condição de LivroRegistro.tsx — termo de abertura nasce junto com a 1ª entrada do livro).
  const itensRegistros = useMemo(() => {
    const t = encodeURIComponent(tag);
    const itens: { titulo: string; paginas: string[]; meta?: string }[] = [];
    if (livro.length > 0) {
      itens.push({ titulo: 'Capa do Livro de Registro', paginas: [`/arquivos-inspecao/CAPA-LIVRO-REGISTRO.html?tag=${t}&page=1`] });
      itens.push({ titulo: 'Termo de Abertura', paginas: [`/arquivos-inspecao/TERMO-ABERTURA.html?tag=${t}&page=1`] });
      // Uma folha POR ENTRADA do livro (o template renderiza UM registro por vez —
      // ?entrada=<id>, com &idx de fallback pra entradas antigas sem id). Antes o portal
      // abria uma folha só e o cliente via apenas o primeiro registro.
      itens.push({
        titulo: 'Livro de Registro de Segurança',
        meta: `${livro.length} registro(s)`,
        paginas: livro.map(
          (e, i) =>
            `/arquivos-inspecao/LIVRO-REGISTRO.html?tag=${t}&entrada=${encodeURIComponent(e.id ?? '')}&idx=${i}&page=${i + 1}&total=${livro.length}`,
        ),
      });
    }
    return itens;
  }, [livro, tag]);

  // Calibrações de um acessório, da mais recente para a mais antiga.
  const calibracoesPorComponente = useMemo(() => {
    const mapa = new Map<string, DadosCalibracao[]>();
    for (const c of calibracoes) {
      const chave = c.componenteId || '__sem_componente__';
      const lista = mapa.get(chave) ?? [];
      lista.push(c);
      mapa.set(chave, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (parseDataFlex(b.dataCalibracao)?.getTime() ?? 0) - (parseDataFlex(a.dataCalibracao)?.getTime() ?? 0));
    }
    return mapa;
  }, [calibracoes]);

  // Calibrações antigas sem componente vinculado — senão sumiriam da aba Acessórios.
  const calibracoesSoltas = calibracoesPorComponente.get('__sem_componente__') ?? [];

  // Aba Calibrações: TODOS os certificados do equipamento numa linha do tempo única
  // (manômetros e PSVs juntos, mais recente primeiro), com o acessório identificado.
  const calibracoesCronologicas = useMemo(() => {
    const nomePorComponente = new Map(componentes.map((c) => [c.id, c.nome] as const));
    return [...calibracoes]
      .sort((a, b) => (parseDataFlex(b.dataCalibracao)?.getTime() ?? 0) - (parseDataFlex(a.dataCalibracao)?.getTime() ?? 0))
      .map((cal) => ({
        cal,
        acessorio: (cal.componenteId && nomePorComponente.get(cal.componenteId)) || cal.nome || cal.instrumento || 'Acessório não identificado',
      }));
  }, [calibracoes, componentes]);

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
  async function abrirRelatorio(item: RelatorioIndiceItem) {
    // A lista é o ÍNDICE (leve). O relatório completo — `meta` e `documentos`,
    // que o fluxo legado precisa — só é carregado quando o cliente clica.
    let r = carregarRelatorio(item.id, tag);
    // Não está no cache porque a carga inicial deixou de trazer `nr13_rel_` (Fase 4): a
    // listagem usa só o índice. Busca agora, pela Edge, com a mesma autorização.
    //
    // Para relatório COM `pdfRef` isto quase nunca dispara — `temArtefato` decide pelo
    // índice, que já tem `pdfRef` e `sha256`. Quem realmente precisa do registro é o
    // relatório LEGADO, que remonta os templates a partir de `meta` e `documentos`.
    if (!r) {
      try {
        setCarregandoRelatorio(true);
        await buscarChaveSobDemanda(chaveRelatorio(item.id, tag));
        r = carregarRelatorio(item.id, tag);
      } catch (e) {
        setErroPortal(e instanceof Error ? e.message : String(e));
        return;
      } finally {
        setCarregandoRelatorio(false);
      }
    }
    if (!r) {
      setErroPortal('Não foi possível carregar este relatório. Tente novamente.');
      return;
    }
    // ARTEFATO: relatório finalizado é só um arquivo. NÃO grava nada.
    //
    // As escritas abaixo existem para o fluxo legado — os templates leem
    // `nr13_relatorio_meta_atual` e os dados de campo do localStorage. Só que o
    // papel `cliente` não tem permissão de escrita, e `gravarMetaAtual` lançava
    // `ErroBloqueado: acesso somente leitura` ANTES de `setRelatorioAberto`:
    // clicar em "Visualizar" no Portal não abria nada, em silêncio (o erro só
    // aparecia no console). Medido em produção em 12/08/2026.
    if (temArtefato(r)) {
      setDocsVisiveis([]);
      setRelatorioAberto(r);
      return;
    }
    await gravarMetaAtual(r.meta);
    const container = r.meta.containerOrigemId ? carregarContainer(tag, r.meta.containerOrigemId) : null;
    await gravarInspecaoOrigemAtual(container?.dados ?? {});
    setDocsVisiveis(filtrarFolhasFotoVazias(r.documentos, container?.dados));
    setRelatorioAberto(r);
  }

  // Livro/Termo/Capa: documentos que dependem só da TAG (sem relatório escolhido),
  // igual ao preview usado em LivroRegistro.tsx.
  function abrirRegistro(titulo: string, paginas: string[]) {
    setDocumentoSimples({ titulo, paginas });
  }

  // Certificado de calibração de um acessório. O template lê nr13_calibracao_item_<id>,
  // chave que o portal_cliente não entrega (não termina em _<TAG>) — hidratamos do
  // objeto que já veio dentro de nr13_calibracoes_<TAG>.
  function abrirCertificado(cal: DadosCalibracao) {
    hidratarItemLocal(cal);
    setDocumentoSimples({
      titulo: `Certificado de Calibração — ${cal.nome || cal.instrumento}`,
      paginas: [`/arquivos-inspecao/${arquivoCalibracao(cal.tipo)}?calibId=${cal.id}&tag=${encodeURIComponent(tag)}&page=1`],
    });
  }

  // Prontuário: registro único por equipamento (nr13_prontuario_<TAG>), independente
  // do histórico de relatórios — mesmo fluxo de Prontuarios.tsx (a chave 'atual'
  // antes de montar os iframes de /arquivos-prontuario/).
  async function abrirProntuario() {
    if (!prontuario) return;
    // Materializa SÓ no localStorage: no Portal os templates leem de lá
    // (portalService), e `salvar()` enfileiraria mutação — que o gate de
    // escrita recusa para o papel cliente, derrubando a abertura (19/08/2026).
    materializarProntuarioAtual(prontuario);
    // Mesma lista do prontuário interno: caldeira e autoclave não têm croqui 2D,
    // e o cliente não pode receber duas folhas a mais que o engenheiro não vê.
    const folhas = paginasProntuario(info?.tipo ?? '');
    const n = folhas.length;
    setDocumentoSimples({
      titulo: 'Prontuário',
      paginas: folhas.map((doc, i) => `/arquivos-prontuario/${doc}?tag=${encodeURIComponent(tag)}&page=${i + 1}&total=${n}`),
    });
  }

  function fecharVisualizador() {
    setRelatorioAberto(null);
    setDocumentoSimples(null);
  }

  async function imprimirDocumento() {
    setImprimindo(true);
    try {
      // ARTEFATO: relatório finalizado imprime o ARQUIVO.
      //
      // Era exatamente aqui que morava o vetor de adulteração: a impressão saía
      // do DOM vivo, então bastava abrir o DevTools, remover a trava de
      // somente-leitura, trocar "Aprovado" por "Reprovado" e imprimir um
      // documento falso com a logo e a assinatura do engenheiro. Servindo o
      // arquivo não há DOM a adulterar.
      const arte = artefatoDe(relatorioAberto);
      if (arte) {
        await imprimirPdfArquivado(arte);
        return;
      }
      // Certificados de rastreabilidade só acompanham RELATÓRIO (paridade com o exportarPdf).
      await imprimirRelatorio('.relatorio-preview', !!relatorioAberto, docsVisiveis);
    } finally {
      setImprimindo(false);
    }
  }

  async function baixarDocumento() {
    const titulo = relatorioAberto?.nome ?? documentoSimples?.titulo;
    if (!titulo) return;
    setExportando(true);
    try {
      // Idem: finalizado entrega o arquivo da emissão, não uma regeração.
      const arte = artefatoDe(relatorioAberto);
      if (arte && relatorioAberto) {
        await baixarPdfArquivado(arte, relatorioAberto.nome);
        return;
      }
      // Certificados de rastreabilidade só acompanham RELATÓRIO (documentos simples saem sem).
      await exportarPdf('.relatorio-preview', `${titulo.replace(/\s+/g, '_')}_${tag}.pdf`, { rastreabilidades: !!relatorioAberto, documentos: docsVisiveis });
    } finally {
      setExportando(false);
    }
  }

  const paginasAtivas = relatorioAberto
    ? docsVisiveis.map((doc, i) => {
        const sep = doc.includes('?') ? '&' : '?';
        // &ctx=rel: relatório SALVO renderiza com os snapshots congelados da meta
        // (empresa/assinantes do §7-bis), não com o cadastro vivo — igual ao visualizador.
        return `/arquivos-inspecao/${doc}${sep}tag=${encodeURIComponent(tag)}&page=${i + 1}&ctx=rel`;
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
        if (!cancelado) void prepararFolhasImpressao('.relatorio-preview', !!relatorioAberto, docsVisiveis);
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
        {artefatoDe(relatorioAberto) ? (
          // Relatório finalizado: o cliente vê o ARQUIVO da emissão. Nenhum
          // template é montado, então não há DOM para o DevTools alterar antes
          // de imprimir ou baixar.
          <VisualizadorPdf artefato={artefatoDe(relatorioAberto)!} nomeArquivo={relatorioAberto!.nome} />
        ) : (
        <div className="relatorio-preview portal-preview-doc">
          {paginasAtivas.map((src, i) => (
            <PaginaA4 key={`${src}-${i}`}>
              <IframeDocumento src={src} titulo={tituloAtivo} />
            </PaginaA4>
          ))}
          {/* PDFs dos certificados padrão no fim — só RELATÓRIO (paridade com impressão/PDF). */}
          {relatorioAberto && <AnexosRastreabPreview documentos={docsVisiveis} />}
        </div>
        )}
      </div>
    );
  }

  // Histórico de calibrações de um acessório (mais recente primeiro), cada certificado
  // abrindo no visualizador do portal (somente leitura).
  function ListaCalibracoes({ lista }: { lista: DadosCalibracao[] }) {
    if (lista.length === 0) return <p className="portal-hint portal-acessorio-vazio">Nenhuma calibração registrada para este acessório.</p>;
    return (
      <ul className="portal-lista-docs portal-lista-calibracoes">
        {lista.map((cal) => (
          <li key={cal.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icone nome="gauge" tam={16} style={{ color: '#1e3a8a' }} />
              <div>
                <b>{cal.numeroCertificado ? `Certificado ${cal.numeroCertificado}` : 'Certificado de calibração'}</b>
                <span className="portal-doc-meta">
                  {cal.dataCalibracao || cal.dataEmissao || '—'}
                  {cal.dataProxCalibracao ? ` · próxima ${cal.dataProxCalibracao}` : ''}
                  {cal.statusConclusao ? ` · ${cal.statusConclusao === 'aprovado' ? 'Aprovado' : 'Reprovado'}` : ''}
                </span>
              </div>
            </div>
            <button type="button" className="btn-primario" onClick={() => abrirCertificado(cal)}>
              Visualizar
            </button>
          </li>
        ))}
      </ul>
    );
  }

  function ListaDocumentos({ lista, vazio }: { lista: RelatorioIndiceItem[]; vazio: string }) {
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
                  {r.codigo ? `${r.codigo} · ` : ''}{r.data} · {r.tipo}
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

      {/* Falha ao carregar documento sob demanda vira AVISO VISÍVEL (Fase 4). O clique mudo
          é o defeito que o `cb26450` corrigiu; não vamos reintroduzi-lo por outro caminho. */}
      {erroPortal && (
        <p className="erro-form" role="alert" style={{ marginTop: 12 }}>
          {erroPortal}{' '}
          <button type="button" className="btn-secundario" onClick={() => setErroPortal(null)}>
            Fechar
          </button>
        </p>
      )}
      {carregandoRelatorio && (
        <p className="portal-hint" role="status" style={{ marginTop: 12 }}>
          <span className="spinner" /> Carregando o relatório…
        </p>
      )}

      <div className="portal-detalhe">
        {/* ── Resumo do ativo (esquerda) ── */}
        <aside className="portal-resumo">
          <div className="portal-resumo-foto">
            {/* `capa.src` vem VAZIO desde que as fotos passaram a morar no bucket
                (11/08/2026): o que o registro carrega é `ref`. Ler `src` direto
                deixava o Portal sem foto nenhuma para as contas já migradas. */}
            {capa ? <FotoImg foto={capa} alt={tag} placeholder="" variante="thumb" /> : <span className="portal-card-sem-foto"><Icone nome="box" tam={22} /></span>}
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
            <button type="button" className={aba === 'calibracoes' ? 'ativa' : ''} onClick={() => setAba('calibracoes')}>
              Calibrações
            </button>
          </div>

          {aba === 'documentacao' && (
            <div className="portal-aba-corpo">
              <ListaDocumentos lista={relatorios} vazio="Nenhum relatório publicado para este equipamento ainda." />
            </div>
          )}

          {aba === 'prontuario' && (
            <div className="portal-aba-corpo">
              {!prontuario && !prontFabricante ? (
                <p className="portal-hint">Nenhum prontuário elaborado para este equipamento ainda.</p>
              ) : (
                <ul className="portal-lista-docs">
                  {prontuario && (
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
                  )}
                  {prontFabricante && (
                    <li>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icone nome="filetext" tam={18} style={{ color: '#1e3a8a' }} />
                        <div>
                          <b>Prontuário do Fabricante</b>
                          <span className="portal-doc-meta">
                            {prontFabricante.nome} — {formatarTamanhoPdf(prontFabricante.tamanho)} — enviado em{' '}
                            {formatarDataEnvio(prontFabricante.enviadoEm)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primario"
                        onClick={() => void abrirProntuarioFabricante(prontFabricante)}
                      >
                        Visualizar
                      </button>
                    </li>
                  )}
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
                    <li key={item.titulo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Icone nome="filetext" tam={18} style={{ color: '#1e3a8a' }} />
                        <div>
                          <b>{item.titulo}</b>
                          {item.meta && <span className="portal-doc-meta">{item.meta}</span>}
                        </div>
                      </div>
                      <button type="button" className="btn-primario" onClick={() => abrirRegistro(item.titulo, item.paginas)}>
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
              {componentes.length === 0 && calibracoesSoltas.length === 0 ? (
                <p className="portal-hint">Nenhum acessório (válvula/manômetro) cadastrado para este equipamento.</p>
              ) : (
                <div className="cal-comp-lista">
                  {componentes.map((c) => {
                    const doComponente = calibracoesPorComponente.get(c.id) ?? [];
                    const ultima = ultimaCalibracao(c.id);
                    const venc = ultima ? parseDataFlex(ultima.dataProxCalibracao) : null;
                    const prazo = venc ? statusPrazo(venc, new Date()) : null;
                    return (
                      <div key={c.id} className="portal-acessorio">
                        <div className="cal-comp-item">
                          <div className="cal-comp-foto">
                            {fotoDoComponente(c) ? <FotoImg foto={fotoDoComponente(c)} alt={c.nome} placeholder="" variante="thumb" /> : <Icone nome={c.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={26} />}
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
                        <ListaCalibracoes lista={doComponente} />
                      </div>
                    );
                  })}
                  {calibracoesSoltas.length > 0 && (
                    <div className="portal-acessorio">
                      <div className="cal-comp-item">
                        <div className="cal-comp-foto"><Icone nome="gauge" tam={26} /></div>
                        <div className="cal-comp-nome">
                          <strong>Calibrações sem acessório vinculado</strong>
                          <span>Certificados anteriores ao cadastro dos acessórios</span>
                        </div>
                      </div>
                      <ListaCalibracoes lista={calibracoesSoltas} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {aba === 'calibracoes' && (
            <div className="portal-aba-corpo">
              {calibracoesCronologicas.length === 0 ? (
                <p className="portal-hint">Nenhum certificado de calibração emitido para este equipamento ainda.</p>
              ) : (
                <>
                  <p className="portal-hint">
                    {calibracoesCronologicas.length} certificado(s), do mais recente para o mais antigo.
                  </p>
                  <ul className="portal-lista-docs">
                    {calibracoesCronologicas.map(({ cal, acessorio }) => (
                      <li key={cal.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Icone nome={cal.tipo === 'psv' ? 'valvula-psv' : 'manometro'} tam={18} style={{ color: '#1e3a8a' }} />
                          <div>
                            <b>{acessorio}</b>
                            <span className="portal-doc-meta">
                              {cal.numeroCertificado ? `Cert. ${cal.numeroCertificado} · ` : ''}
                              {cal.dataCalibracao || cal.dataEmissao || '—'}
                              {cal.dataProxCalibracao ? ` · próxima ${cal.dataProxCalibracao}` : ''}
                              {cal.statusConclusao ? ` · ${cal.statusConclusao === 'aprovado' ? 'Aprovado' : 'Reprovado'}` : ''}
                            </span>
                          </div>
                        </div>
                        <button type="button" className="btn-primario" onClick={() => abrirCertificado(cal)}>
                          Visualizar
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
