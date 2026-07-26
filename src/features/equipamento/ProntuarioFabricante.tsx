import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { excluirChave, ler, salvar } from '../../services/storage';
import { comLoadingGlobal } from '../../app/loadingGlobal';
import { isTrial } from '../../services/auth';
import { MSG_BLOQUEIO_DOCS } from '../../services/trial';
import { emitirAviso } from '../../services/eventos';

// Prontuário do fabricante em PDF, gravado por equipamento (CLAUDE.md §2).
// O sufixo _<TAG> é obrigatório: a Edge Function portal_cliente filtra as chaves
// por chave.endsWith('_' + tag), então a chave chega ao Portal sem redeploy.
export interface ProntuarioFabricanteSalvo {
  nome: string;
  tamanho: number;
  /** data URL completo: "data:application/pdf;base64,..." */
  pdfBase64: string;
  /** ISO */
  enviadoEm: string;
}

export const LIMITE_PDF_BYTES = 8 * 1024 * 1024;

export function chaveProntuarioFabricante(tag: string): string {
  return `nr13_pront_fab_${tag}`;
}

export function lerProntuarioFabricante(tag: string): ProntuarioFabricanteSalvo | null {
  if (!tag) return null;
  const p = ler<ProntuarioFabricanteSalvo>(chaveProntuarioFabricante(tag));
  return p && typeof p.pdfBase64 === 'string' && p.pdfBase64 ? p : null;
}

export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatarDataEnvio(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/**
 * Abre o PDF do prontuário do fabricante em nova aba.
 * Navegar direto para uma `data:` URL é bloqueado pelos navegadores no nível de
 * documento — então o data URL é convertido em Blob e aberto por object URL.
 */
export function abrirPdfProntuarioFabricante(dataUrl: string): void {
  try {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    // O revoke imediato mataria a aba recém-aberta; libera depois de carregar.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
  }
}

export default function ProntuarioFabricante({ tag }: { tag: string }) {
  const [doc, setDoc] = useState<ProntuarioFabricanteSalvo | null>(() => lerProntuarioFabricante(tag));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function selecionar(file: File) {
    if (file.type !== 'application/pdf') {
      setErro('Anexe um arquivo PDF.');
      return;
    }
    if (file.size > LIMITE_PDF_BYTES) {
      setErro(
        `PDF muito grande (${formatarTamanho(file.size)}). O limite é 8 MB — comprima o arquivo antes de enviar.`,
      );
      return;
    }
    setErro('');
    const reader = new FileReader();
    reader.onerror = () => setErro('Não foi possível ler o arquivo. Tente novamente.');
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      if (!dataUrl) {
        setErro('Não foi possível ler o arquivo. Tente novamente.');
        return;
      }
      void gravar({
        nome: file.name,
        tamanho: file.size,
        pdfBase64: dataUrl,
        enviadoEm: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  }

  async function gravar(registro: ProntuarioFabricanteSalvo) {
    setSalvando(true);
    try {
      await comLoadingGlobal('Enviando prontuário do fabricante...', () =>
        salvar(chaveProntuarioFabricante(tag), registro),
      );
      setDoc(registro);
    } finally {
      setSalvando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remover() {
    setSalvando(true);
    try {
      await comLoadingGlobal('Removendo prontuário do fabricante...', () =>
        excluirChave(chaveProntuarioFabricante(tag)),
      );
      setDoc(null);
      setConfirmandoRemover(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="bloco-dados">
      <div className="bloco-header-acoes">
        <h3>Prontuário do Fabricante (PDF)</h3>
        {doc && (
          <button
            type="button"
            className="btn-secundario"
            onClick={() => fileRef.current?.click()}
            disabled={salvando}
          >
            <Icone nome="upload" tam={13} /> Substituir PDF
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && selecionar(e.target.files[0])}
      />

      {!doc ? (
        <>
          <button
            type="button"
            className="pfab-dropzone"
            onClick={() => fileRef.current?.click()}
            disabled={salvando}
          >
            <span className="pfab-dropzone-ic">
              <Icone nome="upload" tam={20} />
            </span>
            <span className="pfab-dropzone-titulo">
              {salvando ? 'Enviando...' : 'Enviar o PDF do prontuário do fabricante'}
            </span>
            <span className="pfab-dropzone-sub">Somente arquivos PDF — máximo 8 MB</span>
          </button>
          <p className="pfab-aviso">
            O PDF é gravado inteiro na nuvem junto com o equipamento. Antes de enviar,{' '}
            <b>comprima o arquivo</b> para reduzir o tamanho — você pode usar o{' '}
            <a
              href="https://www.ilovepdf.com/pt/comprimir_pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              iLovePDF
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <div className="dash-grid-4">
            <div className="resultado-item span-2">
              <span className="lbl-view">Arquivo</span>
              <span className="val-view">{doc.nome || '—'}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Tamanho</span>
              <span className="val-view">{formatarTamanho(doc.tamanho)}</span>
            </div>
            <div className="resultado-item">
              <span className="lbl-view">Enviado em</span>
              <span className="val-view">{formatarDataEnvio(doc.enviadoEm)}</span>
            </div>
          </div>

          <div className="pfab-acoes">
            <button
              type="button"
              className="btn-primario"
              onClick={() => abrirPdfProntuarioFabricante(doc.pdfBase64)}
            >
              <Icone nome="eye" tam={13} /> Visualizar
            </button>
            {isTrial() ? (
              <button
                type="button"
                className="btn-secundario"
                title={MSG_BLOQUEIO_DOCS}
                onClick={() => emitirAviso({ variante: 'alerta', titulo: 'Recurso do plano contratado', texto: MSG_BLOQUEIO_DOCS })}
              >
                <Icone nome="download" tam={13} /> Baixar
              </button>
            ) : (
              <a className="btn-secundario pfab-link-baixar" href={doc.pdfBase64} download={doc.nome || `prontuario-fabricante-${tag}.pdf`}>
                <Icone nome="download" tam={13} /> Baixar
              </a>
            )}
            {!confirmandoRemover ? (
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setConfirmandoRemover(true)}
                disabled={salvando}
              >
                <Icone nome="trash" tam={13} /> Remover
              </button>
            ) : (
              <span className="pfab-confirma">
                Remover este PDF?
                <button type="button" className="btn-primario" onClick={() => void remover()} disabled={salvando}>
                  {salvando ? 'Removendo...' : 'Sim, remover'}
                </button>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setConfirmandoRemover(false)}
                  disabled={salvando}
                >
                  Cancelar
                </button>
              </span>
            )}
          </div>
        </>
      )}

      {erro && <p className="pfab-erro">{erro}</p>}
    </div>
  );
}
