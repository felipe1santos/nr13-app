import { useRef, useState } from 'react';
import { Icone } from '../../components/Icone';
import { excluirChave, ler, salvar } from '../../services/storage';
import { salvarArquivo, baixarFoto, blobParaDataUrl, type RefFoto } from '../../services/fotos';
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
  /** LEGADO: data URL completo. Registros novos nascem vazios — ver `pdfRef`. */
  pdfBase64: string;
  /**
   * O arquivo no bucket `inspecao`, em `<org>/prontuario-fabricante/<uuid>.pdf`.
   *
   * Este documento aceita até 8 MB e era gravado INTEIRO no `app_storage`: o
   * maior peso possível por chave no sistema, rebaixado a cada hidratação do
   * app. Uma conta com cinco equipamentos documentados torrava 40 MB por
   * sincronização — sozinha, mais do que a cota mensal de egress suporta.
   */
  pdfRef?: RefFoto;
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
  // A checagem aceita as DUAS formas. Exigir `pdfBase64` fazia um registro já
  // migrado aparecer como "nenhum prontuário enviado", e o usuário reenviaria
  // o arquivo por cima.
  if (!p) return null;
  return p.pdfRef?.path || (typeof p.pdfBase64 === 'string' && p.pdfBase64) ? p : null;
}

/**
 * Grava o registro, mandando o arquivo para o bucket. Falhar no upload NÃO
 * cancela a gravação: cai no formato legado (base64 no registro). Pesado, mas
 * o documento do usuário não se perde — que é o único desfecho inaceitável.
 */
export async function gravarProntuarioFabricante(
  tag: string,
  registro: ProntuarioFabricanteSalvo,
): Promise<ProntuarioFabricanteSalvo> {
  let final = registro;
  if (registro.pdfBase64?.startsWith('data:') && !registro.pdfRef?.path) {
    try {
      const virgula = registro.pdfBase64.indexOf(',');
      const bin = atob(registro.pdfBase64.slice(virgula + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ref = await salvarArquivo(
        new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
        'prontuario-fabricante',
        'pdf',
        'application/pdf',
      );
      final = { ...registro, pdfBase64: '', pdfRef: ref };
    } catch {
      final = registro;
    }
  }
  await salvar(chaveProntuarioFabricante(tag), final);
  return final;
}

/** O PDF, venha do bucket (cofre local primeiro) ou do base64 legado. */
export async function resolverPdfFabricante(
  doc: ProntuarioFabricanteSalvo | null | undefined,
): Promise<string | null> {
  if (!doc) return null;
  if (doc.pdfRef?.path) {
    try {
      const blob = await baixarFoto(doc.pdfRef);
      if (blob) return await blobParaDataUrl(blob);
    } catch {
      // cai no legado
    }
  }
  return doc.pdfBase64 || null;
}

/** Baixa o arquivo com o nome certo, resolvendo antes de onde ele estiver. */
export async function baixarPdfFabricante(
  doc: ProntuarioFabricanteSalvo,
  nomeArquivo: string,
): Promise<void> {
  const dataUrl = await resolverPdfFabricante(doc);
  if (!dataUrl) return;
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
export async function abrirProntuarioFabricante(
  doc: ProntuarioFabricanteSalvo | null | undefined,
): Promise<void> {
  const dataUrl = await resolverPdfFabricante(doc);
  if (dataUrl) abrirPdfProntuarioFabricante(dataUrl);
}

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
      const final = await comLoadingGlobal('Enviando prontuário do fabricante...', () =>
        gravarProntuarioFabricante(tag, registro),
      );
      setDoc(final);
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
              onClick={() => void abrirProntuarioFabricante(doc)}
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
              // Virou botão porque o arquivo mora no bucket: não existe href
              // pronto para um `<a download>`. O gate do trial acima continua
              // idêntico.
              <button
                type="button"
                className="btn-secundario pfab-link-baixar"
                onClick={() => void baixarPdfFabricante(doc, doc.nome || `prontuario-fabricante-${tag}.pdf`)}
              >
                <Icone nome="download" tam={13} /> Baixar
              </button>
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
