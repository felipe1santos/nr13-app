import { useState } from 'react';
import { Icone } from '../../../components/Icone';
import { gerarPdfBytes } from '../pdfService';
import { publicarArtefato, artefatoDe, baixarArtefato } from '../artefatoRelatorio';
import { gerarRelatorioVetorial } from './gerarRelatorio';
import { conferirCampos, type Conferencia } from './conferencia';
import './painelPiloto.css';

/**
 * Fase 11 · a bancada de comparação do PILOTO.
 *
 * Fica atrás de `?piloto=1` de propósito: **produção não muda**. O gerador de
 * verdade continua sendo o raster (`pdfService.gerarPdfBytes`), e nenhum
 * relatório histórico é regenerado — este painel só existe para medir os dois
 * lado a lado com o MESMO relatório.
 *
 * O que ele prova, na ordem em que o dono pediu: bytes, páginas, tempo, texto
 * selecionável, SHA-256, arquivamento e reabertura pelo mesmo `pdfRef`.
 */
interface Medida {
  bytes: number;
  paginas: number;
  ms: number;
}

interface Arquivado {
  sha256: string;
  path: string;
  pendente: boolean;
}

function kb(n: number): string {
  return n < 1024 * 1024
    ? `${(n / 1024).toFixed(0)} KB`
    : `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function PainelPiloto({ tag, documentos }: { tag: string; documentos: string[] }) {
  const [raster, setRaster] = useState<Medida | null>(null);
  const [vetor, setVetor] = useState<Medida | null>(null);
  const [arquivado, setArquivado] = useState<Arquivado | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'raster' | 'vetor' | 'arquivo'>('');
  const [erro, setErro] = useState('');
  const [bytesVetor, setBytesVetor] = useState<Uint8Array | null>(null);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);

  async function medirRaster() {
    setOcupado('raster');
    setErro('');
    try {
      const t0 = performance.now();
      const r = await gerarPdfBytes('.relatorio-preview', { rastreabilidades: false, documentos });
      setRaster({ bytes: r.bytes.byteLength, paginas: r.paginas, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setErro(`Raster: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  async function medirVetor() {
    setOcupado('vetor');
    setErro('');
    try {
      const r = await gerarRelatorioVetorial(tag);
      setVetor({ bytes: r.bytes.byteLength, paginas: r.paginas, ms: r.ms });
      setBytesVetor(r.bytes);
      setConferencia(conferirCampos(r.modelo));
      setArquivado(null);
    } catch (e) {
      setErro(`Vetorial: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  function baixarVetor() {
    if (!bytesVetor) return;
    // `slice()` devolve um ArrayBuffer próprio: passar a view direto pode levar
    // junto o buffer inteiro do PDF quando ele veio de um pool.
    const url = URL.createObjectURL(new Blob([bytesVetor.slice()], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `piloto-vetorial-${tag}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Arquiva pelo MESMO caminho do relatório finalizado: hash + upload + ref. */
  async function arquivar() {
    if (!bytesVetor) return;
    setOcupado('arquivo');
    setErro('');
    try {
      const art = await publicarArtefato(bytesVetor, vetor?.paginas ?? 0);
      setArquivado({
        sha256: art.sha256 ?? '',
        path: art.pdfRef?.path ?? '',
        pendente: !!art.pendente,
      });
    } catch (e) {
      setErro(`Arquivamento: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  /** Reabre o arquivo pelo `pdfRef` e confere o tamanho — a prova do §7-quater. */
  async function reabrir() {
    if (!arquivado) return;
    setOcupado('arquivo');
    setErro('');
    try {
      const art = artefatoDe({
        pdfRef: { bucket: 'inspecao', path: arquivado.path, mimeType: 'application/pdf', tamanho: vetor?.bytes ?? 0 },
        sha256: arquivado.sha256,
        paginas: vetor?.paginas,
      });
      if (!art) throw new Error('artefato não resolvido');
      const blob = await baixarArtefato(art);
      if (!blob) throw new Error('o arquivo não voltou nem do cofre local nem do bucket');
      setErro(`✔ Reaberto pelo mesmo pdfRef: ${kb(blob.size)} (gerado: ${kb(vetor?.bytes ?? 0)})`);
    } catch (e) {
      setErro(`Reabertura: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  const reducao =
    raster && vetor ? (100 - (vetor.bytes / raster.bytes) * 100).toFixed(1) : null;

  return (
    <div className="piloto-painel no-print">
      <div className="piloto-cab">
        <b>Fase 11 · piloto vetorial</b>
        <span>não substitui a geração de produção — só mede</span>
      </div>

      <div className="piloto-botoes">
        <button type="button" className="fj-btn fj-btn-ghost" onClick={medirRaster} disabled={!!ocupado}>
          {ocupado === 'raster' ? 'Gerando…' : '1 · Gerar RASTER (atual)'}
        </button>
        <button type="button" className="fj-btn fj-btn-primary" onClick={medirVetor} disabled={!!ocupado}>
          {ocupado === 'vetor' ? 'Gerando…' : '2 · Gerar VETORIAL (piloto)'}
        </button>
        <button type="button" className="fj-btn fj-btn-ghost" onClick={baixarVetor} disabled={!bytesVetor}>
          <Icone nome="download" tam={13} /> Baixar o piloto
        </button>
        <button type="button" className="fj-btn fj-btn-ghost" onClick={arquivar} disabled={!bytesVetor || !!ocupado}>
          3 · SHA-256 + arquivar
        </button>
        <button type="button" className="fj-btn fj-btn-ghost" onClick={reabrir} disabled={!arquivado || !!ocupado}>
          4 · Reabrir pelo pdfRef
        </button>
      </div>

      <table className="piloto-tabela">
        <thead>
          <tr><th>gerador</th><th>páginas</th><th>bytes</th><th>tempo</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>raster (html2canvas)</td>
            <td>{raster?.paginas ?? '—'}</td>
            <td>{raster ? kb(raster.bytes) : '—'}</td>
            <td>{raster ? `${raster.ms} ms` : '—'}</td>
          </tr>
          <tr>
            <td>vetorial (piloto)</td>
            <td>{vetor?.paginas ?? '—'}</td>
            <td>{vetor ? kb(vetor.bytes) : '—'}</td>
            <td>{vetor ? `${vetor.ms} ms` : '—'}</td>
          </tr>
        </tbody>
      </table>

      {reducao && (
        <p className="piloto-reducao">
          Redução de peso: <b>{reducao}%</b> — mas as páginas não são as mesmas: o raster gera o
          relatório inteiro, o piloto gera 5 folhas. Compare por PÁGINA.
        </p>
      )}

      {arquivado && (
        <p className="piloto-sha">
          SHA-256 <code>{arquivado.sha256.slice(0, 32)}…</code>
          <br />
          {arquivado.path}
          {arquivado.pendente ? ' · upload pendente (offline)' : ' · no bucket'}
        </p>
      )}

      {conferencia && (
        <div className="piloto-conferencia">
          <b>
            Conferência campo a campo: {conferencia.preenchidos} de {conferencia.total} com dado
            {conferencia.vazios.length > 0 ? ` · ${conferencia.vazios.length} em branco` : ''}
          </b>
          {conferencia.vazios.length > 0 && (
            <p>
              Em branco no relatório (e no documento saem como travessão):{' '}
              {conferencia.vazios.join(' · ')}
            </p>
          )}
        </div>
      )}

      {erro && <p className="piloto-erro">{erro}</p>}
    </div>
  );
}
