import { ler, salvar } from '../../services/storage';
import { salvarArquivo, baixarFoto, blobParaDataUrl, type RefFoto } from '../../services/fotos';

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

/*
 * O componente de ENVIO ("Prontuário do Fabricante" no fim da ficha) saiu em
 * 24/09/2026: 1 equipamento = 1 prontuário vigente, e o PDF existente entra
 * pelo anexo (`anexoProntuario.ts` — SHA-256, índice, dedupe). Os arquivos já
 * enviados ficam onde estão e seguem legíveis pelas funções acima: no slot da
 * ficha (como legado), em /prontuarios e no Portal do Cliente.
 */
