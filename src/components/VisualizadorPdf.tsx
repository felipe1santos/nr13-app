import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { baixarArtefato, type PdfArtefato } from '../features/relatorios/artefatoRelatorio';

/**
 * Mostra o PDF ARQUIVADO de um documento finalizado.
 *
 * POR QUE ISTO EXISTE: um relatório finalizado não pode ser remontado a partir
 * dos templates e dos dados vivos. Enquanto era assim, editar a ficha do
 * equipamento mudava documento assinado, e no Portal do Cliente bastava abrir o
 * DevTools, remover a trava de somente-leitura, trocar "Aprovado" por
 * "Reprovado" e clicar em Baixar PDF — o arquivo saía do domínio oficial, com a
 * logo e a assinatura do engenheiro, adulterado.
 *
 * Aqui não existe DOM do documento para adulterar: o que se vê, o que se imprime
 * e o que se baixa são o MESMO arquivo, byte a byte, o que subiu no dia da
 * emissão.
 *
 * O blob vem do cofre local antes do bucket (`baixarArtefato`), então documento
 * já aberto uma vez abre offline e sem gastar egress.
 *
 * ## Fase 12B · por que deixou de ser um `<iframe>`
 *
 * O `<iframe src={blob}>` entrega a página ao leitor de PDF do NAVEGADOR, e ali
 * o app não manda em nada: a coluna de miniaturas abre por conta própria e come
 * um terço da largura, a barra de ferramentas dele soma altura à barra do app, e
 * os parâmetros de abertura (`#navpanes=0`, `#toolbar=0`) são convenção da
 * Adobe que cada navegador implementa como quer — e nenhum garante entre
 * versões. Forçar aquilo por CSS seria pior: o conteúdo é de outra origem e não
 * há folha de estilo que o alcance.
 *
 * Então o desenho passou a ser nosso: **pdf.js** (que o projeto JÁ usa para
 * rasterizar certificados na impressão) desenha as páginas em `<canvas>`, e o
 * app decide o que aparece — miniaturas FECHADAS por padrão, uma barra de uma
 * linha e o documento ocupando o resto.
 *
 * **Viewer ≠ gerador.** Nada aqui produz PDF: só desenha na tela os bytes que
 * vieram do `pdfRef`. Nenhum gerador novo entrou no projeto, e o pdf.js já
 * estava nas dependências.
 *
 * Se o pdf.js falhar (ambiente sem worker, arquivo que ele recusa), a tela cai
 * no `<iframe>` de antes em vez de ficar em branco — pior visual, mesmo
 * documento.
 */
export default function VisualizadorPdf({
  artefato,
  nomeArquivo,
  onErro,
}: {
  artefato: PdfArtefato;
  nomeArquivo: string;
  onErro?: (mensagem: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'falhou'>('carregando');
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    void baixarArtefato(artefato)
      .then(async (blob) => {
        if (!vivo) return;
        if (!blob) {
          setEstado('falhou');
          onErro?.('Não foi possível abrir o PDF deste documento. Verifique a conexão.');
          return;
        }
        const objeto = URL.createObjectURL(blob);
        urlRef.current = objeto;
        // O ArrayBuffer alimenta o pdf.js; o object URL serve "Abrir em outra
        // aba" e o `<iframe>` de fallback. Os dois saem do MESMO blob.
        const buf = await blob.arrayBuffer();
        if (!vivo) return;
        setBytes(buf);
        setUrl(objeto);
        setEstado('pronto');
      })
      .catch(() => {
        if (!vivo) return;
        setEstado('falhou');
        onErro?.('Não foi possível abrir o PDF deste documento.');
      });
    return () => {
      vivo = false;
      // O object URL segura o blob na memória até ser revogado.
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [artefato, onErro]);

  if (estado === 'carregando') {
    return <div className="vpdf-aviso">Abrindo o documento...</div>;
  }
  if (estado === 'falhou' || !url) {
    return <div className="vpdf-aviso vpdf-aviso-erro">Não foi possível abrir o PDF deste documento.</div>;
  }

  return <QuadroPdf url={url} bytes={bytes} nomeArquivo={nomeArquivo} paginas={artefato.paginas} />;
}

/** Uma página desenhada; `null` enquanto ainda não entrou na tela. */
type Pagina = { numero: number; largura: number; altura: number };

function QuadroPdf({
  url,
  bytes,
  nomeArquivo,
  paginas: paginasDoRegistro,
}: {
  url: string;
  bytes: ArrayBuffer | null;
  nomeArquivo: string;
  paginas: number;
}) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [zoom, setZoom] = useState(1);
  const [atual, setAtual] = useState(1);
  // FECHADO por padrão — é o pedido, e é o que devolve a largura ao documento.
  const [miniaturas, setMiniaturas] = useState(false);
  const [semPdfJs, setSemPdfJs] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [larguraArea, setLarguraArea] = useState(0);

  // Carrega o documento no pdf.js. Import DINÂMICO: o visualizador só pesa
  // quando alguém abre um documento — a mesma escolha do printService.
  useEffect(() => {
    if (!bytes) return;
    let vivo = true;
    let tarefa: { destroy: () => void } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        // `slice()`: o pdf.js assume a posse do buffer, e sem a cópia o mesmo
        // ArrayBuffer não poderia ser reaproveitado numa segunda montagem.
        const t = pdfjs.getDocument({ data: bytes.slice(0) });
        tarefa = t as unknown as { destroy: () => void };
        const d = (await t.promise) as unknown as PdfDoc;
        if (!vivo) return;
        const lista: Pagina[] = [];
        for (let n = 1; n <= d.numPages; n += 1) {
          const p = await d.getPage(n);
          const v = p.getViewport({ scale: 1 });
          lista.push({ numero: n, largura: v.width, altura: v.height });
          if (!vivo) return;
        }
        setDoc(d);
        setPaginas(lista);
      } catch (e) {
        console.error('pdf.js indisponível — caindo no leitor do navegador.', e);
        if (vivo) setSemPdfJs(true);
      }
    })();
    return () => {
      vivo = false;
      try {
        tarefa?.destroy();
      } catch {
        /* destruir um documento já descartado não é erro que interesse */
      }
    };
  }, [bytes]);

  // Largura disponível → escala "ajustar à largura", que é o estado inicial pedido.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setLarguraArea(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, miniaturas]);

  const escala = useMemo(() => {
    const larguraPagina = paginas[0]?.largura ?? 595;
    if (!larguraArea || !larguraPagina) return zoom;
    // −24px: a folga lateral do container. Sem ela a página encosta na barra de
    // rolagem e o navegador cria rolagem HORIZONTAL na página inteira.
    const ajuste = (larguraArea - 24) / larguraPagina;
    return Math.max(0.15, ajuste * zoom);
  }, [larguraArea, paginas, zoom]);

  const aoRolar = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const alvo = el.scrollTop + el.clientHeight * 0.35;
    const filhos = Array.from(el.querySelectorAll<HTMLElement>('[data-pagina]'));
    for (const f of filhos) {
      if (f.offsetTop + f.offsetHeight >= alvo) {
        setAtual(Number(f.dataset.pagina));
        return;
      }
    }
  }, []);

  function irPara(n: number) {
    const el = areaRef.current;
    const alvo = el?.querySelector<HTMLElement>(`[data-pagina="${n}"]`);
    if (el && alvo) el.scrollTo({ top: alvo.offsetTop - 8, behavior: 'smooth' });
  }

  const total = paginas.length || paginasDoRegistro || 0;

  return (
    <div className="vpdf">
      <div className="vpdf-barra no-print">
        {!semPdfJs && (
          <button
            type="button"
            className={`vpdf-btn${miniaturas ? ' is-ativo' : ''}`}
            onClick={() => setMiniaturas((v) => !v)}
            aria-pressed={miniaturas}
            title="Mostrar ou esconder as miniaturas das páginas"
          >
            ☰ Páginas
          </button>
        )}
        {!semPdfJs && total > 0 && (
          <span className="vpdf-contador">
            {atual} / {total}
          </span>
        )}
        {!semPdfJs && (
          <span className="vpdf-zoom">
            <button type="button" className="vpdf-btn" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} title="Diminuir">
              −
            </button>
            <button type="button" className="vpdf-btn" onClick={() => setZoom(1)} title="Ajustar à largura">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="vpdf-btn" onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))} title="Aumentar">
              +
            </button>
          </span>
        )}
        <span className="vpdf-selo" title="Este documento não é remontado: são os bytes arquivados na emissão.">
          Documento arquivado
        </span>
        <button type="button" className="vpdf-btn vpdf-btn-aba" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
          Abrir em outra aba
        </button>
      </div>

      {semPdfJs ? (
        // Fallback: o leitor do navegador. Os parâmetros são um PEDIDO — cada
        // navegador atende o que quer —, então eles nunca foram o plano A.
        <iframe title={nomeArquivo} src={`${url}#view=FitH&navpanes=0`} className="vpdf-iframe" />
      ) : (
        <div className={`vpdf-corpo${miniaturas ? ' com-miniaturas' : ''}`}>
          {miniaturas && (
            <nav className="vpdf-miniaturas" aria-label="Páginas do documento">
              {paginas.map((p) => (
                <button key={p.numero} type="button" className={`vpdf-mini${p.numero === atual ? ' is-ativo' : ''}`} onClick={() => irPara(p.numero)}>
                  <PaginaCanvas doc={doc} numero={p.numero} escala={110 / p.largura} />
                  <span>{p.numero}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="vpdf-area" ref={areaRef} onScroll={aoRolar}>
            {paginas.map((p) => (
              <div
                key={p.numero}
                data-pagina={p.numero}
                className="vpdf-folha"
                style={{ width: Math.round(p.largura * escala), height: Math.round(p.altura * escala) }}
              >
                <PaginaCanvas doc={doc} numero={p.numero} escala={escala} />
              </div>
            ))}
            {paginas.length === 0 && <div className="vpdf-aviso">Preparando as páginas…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Uma página em `<canvas>`, desenhada só quando entra (ou quase entra) na tela.
 *
 * Sem essa preguiça, abrir um relatório de 22 folhas rasterizadas desenharia as
 * 22 de uma vez — segundos de tela travada para mostrar a primeira.
 */
function PaginaCanvas({ doc, numero, escala }: { doc: PdfDoc | null; numero: number; escala: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visivel]);

  useEffect(() => {
    if (!doc || !visivel) return;
    const canvas = ref.current;
    if (!canvas) return;
    let vivo = true;
    let tarefa: { cancel: () => void } | null = null;
    (async () => {
      const pagina = await doc.getPage(numero);
      if (!vivo) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2× já satisfaz tela retina; 3× só gasta memória
      const viewport = pagina.getViewport({ scale: escala * dpr });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      // v6 do pdf.js recebe o CANVAS, não o contexto — é a mesma chamada do
      // `printService`, e passar `canvasContext` aqui seria uma segunda forma
      // de fazer a mesma coisa, pronta para divergir na próxima atualização.
      const t = pagina.render({ canvas, viewport });
      tarefa = t as unknown as { cancel: () => void };
      try {
        await t.promise;
      } catch {
        /* render cancelado por zoom/desmontagem — não é falha */
      }
    })();
    return () => {
      vivo = false;
      try {
        tarefa?.cancel();
      } catch {
        /* idem */
      }
    };
  }, [doc, numero, escala, visivel]);

  return <canvas ref={ref} className="vpdf-canvas" />;
}

/** O pouco que este arquivo usa do pdf.js — evita `any` espalhado. */
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
  }>;
}

/**
 * Baixa o arquivo arquivado com o nome do documento.
 *
 * Não regenera nada: é o mesmo arquivo que está no bucket. Regenerar produziria
 * um PDF com os dados de HOJE e ainda por cima com hash diferente do que ficou
 * registrado na emissão.
 */
export async function baixarPdfArquivado(artefato: PdfArtefato, nomeArquivo: string): Promise<boolean> {
  const blob = await baixarArtefato(artefato);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** Abre o arquivo arquivado numa aba, onde o usuário usa a impressão do próprio leitor. */
export async function imprimirPdfArquivado(artefato: PdfArtefato): Promise<boolean> {
  const blob = await baixarArtefato(artefato);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, '_blank', 'noopener,noreferrer');
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
