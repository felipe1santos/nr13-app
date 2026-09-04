import { useState } from 'react';
import { Icone } from '../../../components/Icone';
import { gerarPdfBytes } from '../pdfService';
import { publicarArtefato, artefatoDe, baixarArtefato } from '../artefatoRelatorio';
import { gerarProntuarioVetorial } from './gerarProntuario';
import { conferirCamposProntuario, type ConferenciaProntuario } from './conferenciaProntuario';
import './painelPiloto.css';

/**
 * Fase 12 · a bancada de comparação do PRONTUÁRIO.
 *
 * Atrás de `?piloto=1`, como a da Fase 11: **produção não muda**. O prontuário
 * continua sendo impresso pelo caminho de hoje; este painel só gera os dois
 * lado a lado e mede.
 *
 * O "atual" aqui é a rasterização de `.prontuario-preview` — o mesmo que a
 * impressão produz. O prontuário nunca teve geração de bytes própria, então
 * esta é também a primeira vez que ele vira arquivo com SHA.
 */
interface Medida {
  bytes: number;
  paginas: number;
  ms: number;
}

function kb(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function PainelPilotoProntuario({ tag }: { tag: string }) {
  const [atual, setAtual] = useState<Medida | null>(null);
  const [vetor, setVetor] = useState<Medida | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'atual' | 'vetor' | 'arquivo'>('');
  const [erro, setErro] = useState('');
  const [bytesVetor, setBytesVetor] = useState<Uint8Array | null>(null);
  const [conf, setConf] = useState<ConferenciaProntuario | null>(null);
  const [arquivado, setArquivado] = useState<{ sha: string; path: string; pendente: boolean } | null>(null);

  async function medirAtual() {
    setOcupado('atual');
    setErro('');
    try {
      const t0 = performance.now();
      const r = await gerarPdfBytes('.prontuario-preview', { rastreabilidades: false });
      setAtual({ bytes: r.bytes.byteLength, paginas: r.paginas, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      setErro(`Atual: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  async function medirVetor() {
    setOcupado('vetor');
    setErro('');
    try {
      const r = await gerarProntuarioVetorial(tag);
      setVetor({ bytes: r.bytes.byteLength, paginas: r.paginas, ms: r.ms });
      setBytesVetor(r.bytes);
      setConf(conferirCamposProntuario(r.modelo));
      setArquivado(null);
      if (r.croquisFalhos.length > 0) setErro(`Croquis não convertidos: ${r.croquisFalhos.join(', ')}`);
    } catch (e) {
      setErro(`Vetorial: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  function baixar() {
    if (!bytesVetor) return;
    const url = URL.createObjectURL(new Blob([bytesVetor.slice()], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `piloto-prontuario-${tag}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Mesmo caminho de artefato do relatório: hash + upload + ref. */
  async function arquivar() {
    if (!bytesVetor) return;
    setOcupado('arquivo');
    setErro('');
    try {
      const art = await publicarArtefato(bytesVetor, vetor?.paginas ?? 0);
      setArquivado({ sha: art.sha256 ?? '', path: art.pdfRef?.path ?? '', pendente: !!art.pendente });
    } catch (e) {
      setErro(`Arquivamento: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado('');
    }
  }

  async function reabrir() {
    if (!arquivado) return;
    setOcupado('arquivo');
    setErro('');
    try {
      const art = artefatoDe({
        pdfRef: { bucket: 'inspecao', path: arquivado.path, mimeType: 'application/pdf', tamanho: vetor?.bytes ?? 0 },
        sha256: arquivado.sha,
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

  const reducao = atual && vetor ? (100 - (vetor.bytes / atual.bytes) * 100).toFixed(1) : null;

  return (
    <div className="piloto-painel no-print">
      <div className="piloto-cab">
        <b>Fase 12 · piloto do prontuário</b>
        <span>não substitui a impressão de produção — só mede</span>
      </div>

      <div className="piloto-botoes">
        <button type="button" className="fj-btn fj-btn-ghost" onClick={medirAtual} disabled={!!ocupado}>
          {ocupado === 'atual' ? 'Gerando…' : '1 · Gerar ATUAL (raster)'}
        </button>
        <button type="button" className="fj-btn fj-btn-primary" onClick={medirVetor} disabled={!!ocupado}>
          {ocupado === 'vetor' ? 'Gerando…' : '2 · Gerar VETORIAL'}
        </button>
        <button type="button" className="fj-btn fj-btn-ghost" onClick={baixar} disabled={!bytesVetor}>
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
            <td>atual (html2canvas)</td>
            <td>{atual?.paginas ?? '—'}</td>
            <td>{atual ? kb(atual.bytes) : '—'}</td>
            <td>{atual ? `${atual.ms} ms` : '—'}</td>
          </tr>
          <tr>
            <td>vetorial</td>
            <td>{vetor?.paginas ?? '—'}</td>
            <td>{vetor ? kb(vetor.bytes) : '—'}</td>
            <td>{vetor ? `${vetor.ms} ms` : '—'}</td>
          </tr>
        </tbody>
      </table>

      {reducao && <p className="piloto-reducao">Redução de peso: <b>{reducao}%</b></p>}

      {arquivado && (
        <p className="piloto-sha">
          SHA-256 <code>{arquivado.sha.slice(0, 32)}…</code>
          <br />
          {arquivado.path}
          {arquivado.pendente ? ' · upload pendente (offline)' : ' · no bucket'}
        </p>
      )}

      {conf && (
        <div className="piloto-conferencia">
          <b>
            Conferência campo a campo: {conf.preenchidos} de {conf.total} com dado
            {conf.vazios.length > 0 ? ` · ${conf.vazios.length} em branco` : ''}
          </b>
          {conf.vazios.length > 0 && <p>Em branco (saem como travessão): {conf.vazios.join(' · ')}</p>}
        </div>
      )}

      {erro && <p className="piloto-erro">{erro}</p>}
    </div>
  );
}
