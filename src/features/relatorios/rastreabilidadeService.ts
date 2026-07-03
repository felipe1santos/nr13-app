import { PDFDocument } from 'pdf-lib';
import { ler, salvar, excluirChave, listarChavesComPrefixo } from '../../services/storage';

/**
 * Rastreabilidade dos padrões de calibração: o usuário anexa o PDF do
 * certificado de rastreabilidade de cada instrumento e pode marcar para
 * injetá-lo automaticamente no FINAL do relatório gerado (facilita a impressão).
 * Chave: nr13_rastreab_<id> (sincroniza pela nuvem como qualquer outra).
 */
export interface Rastreabilidade {
  id: string;
  nome: string;               // identificação do instrumento/padrão
  certificadoPadrao: string;  // nº do certificado do padrão
  validade: string;           // data (dd/mm/aaaa ou aaaa-mm-dd)
  pdfBase64: string;          // data URL ou base64 puro do PDF
  injetarNoRelatorio: boolean;
  criadoEm: string;
}

const PREFIXO = 'nr13_rastreab_';

export function listarRastreabilidades(): Rastreabilidade[] {
  return listarChavesComPrefixo(PREFIXO)
    .map((chave) => {
      try {
        return ler<Rastreabilidade>(chave);
      } catch {
        return null;
      }
    })
    .filter((r): r is Rastreabilidade => !!r)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function salvarRastreabilidade(r: Rastreabilidade): Promise<void> {
  await salvar(`${PREFIXO}${r.id}`, r);
}

export async function excluirRastreabilidade(id: string): Promise<void> {
  await excluirChave(`${PREFIXO}${id}`);
}

function base64ParaBytes(b64: string): Uint8Array {
  const puro = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const bin = atob(puro);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Anexa ao final do PDF do relatório as páginas dos PDFs de rastreabilidade
 * marcados com "injetar no relatório". PDF que falhar ao carregar é pulado
 * (o relatório sai sem ele) e o nome volta em `falhas` para avisar o usuário.
 */
export async function anexarRastreabilidades(
  pdfBytes: Uint8Array | ArrayBuffer,
): Promise<{ bytes: Uint8Array; anexados: number; falhas: string[] }> {
  const marcadas = listarRastreabilidades().filter((r) => r.injetarNoRelatorio && r.pdfBase64);
  const base = new Uint8Array(pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes);
  if (marcadas.length === 0) return { bytes: base, anexados: 0, falhas: [] };

  const doc = await PDFDocument.load(base);
  let anexados = 0;
  const falhas: string[] = [];

  for (const r of marcadas) {
    try {
      const anexo = await PDFDocument.load(base64ParaBytes(r.pdfBase64));
      const paginas = await doc.copyPages(anexo, anexo.getPageIndices());
      for (const p of paginas) doc.addPage(p);
      anexados++;
    } catch {
      falhas.push(r.nome || r.id);
    }
  }

  return { bytes: await doc.save(), anexados, falhas };
}
