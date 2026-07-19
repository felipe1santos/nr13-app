import { PDFDocument } from 'pdf-lib';
import { ler, salvar, excluirChave, listarChavesComPrefixo } from '../../services/storage';

/**
 * Rastreabilidade dos padrões de calibração: o usuário anexa o PDF do
 * certificado de rastreabilidade de cada instrumento e pode marcar para
 * injetá-lo automaticamente no FINAL do relatório gerado (facilita a impressão).
 * Chave: nr13_rastreab_<id> (sincroniza pela nuvem como qualquer outra).
 */
export type TipoInstrumento =
  | 'ultrassom'
  | 'manometro'
  | 'pressostato'
  | 'termostato'
  | 'manovacuometro'
  | 'termometro'
  | 'outro';

export interface Rastreabilidade {
  id: string;
  nome: string;               // identificação do instrumento/padrão
  certificadoPadrao: string;  // nº do certificado do padrão
  validade: string;           // data (dd/mm/aaaa ou aaaa-mm-dd)
  pdfBase64: string;          // data URL ou base64 puro do PDF
  injetarNoRelatorio: boolean;
  criadoEm: string;
  // ── Campos opcionais (cadastro por instrumento — registros antigos não os têm) ──
  tipoInstrumento?: TipoInstrumento; // seleciona qual template de ensaio consome o registro
  aparelho?: string;                 // aparelho/modelo (ex.: "CYGNUS 6278")
  fabricante?: string;
  numeroSerie?: string;
  // Dados padrão do ensaio (só fazem sentido quando tipoInstrumento='ultrassom'):
  acoplante?: string;
  cabecote?: string;                 // ex.: "2.25 mhz"
  velocidadeSonica?: string;         // ex.: "5920"
  estadoSuperficie?: string;
  tempSuperficie?: string;           // ex.: "Ambiente"
  // Equipamentos vinculados (TAGs). Ausente/vazio = padrão GLOBAL, vale para todos
  // (comportamento dos registros antigos — zero migração).
  tags?: string[];
}

/** true se o padrão vale para a TAG (global quando não há vínculo). */
export function aplicaAoEquipamento(r: Rastreabilidade, tag?: string | null): boolean {
  if (!r.tags?.length) return true;
  return !!tag && r.tags.includes(tag);
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
  tag?: string | null,
): Promise<{ bytes: Uint8Array; anexados: number; falhas: string[] }> {
  const marcadas = listarRastreabilidades().filter(
    (r) => r.injetarNoRelatorio && aplicaAoEquipamento(r, tag),
  );
  const base = new Uint8Array(pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes);
  if (marcadas.length === 0) return { bytes: base, anexados: 0, falhas: [] };

  const doc = await PDFDocument.load(base);
  let anexados = 0;
  const falhas: string[] = [];

  for (const r of marcadas) {
    // PDF marcado mas sem conteúdo (perdido quando a cota do localStorage estourou na
    // gravação): entra em `falhas` para o usuário ser avisado — nunca some em silêncio.
    if (!r.pdfBase64) {
      falhas.push(r.nome || r.id);
      continue;
    }
    try {
      // ignoreEncryption: certificados oficiais costumam vir "protegidos" (sem senha de
      // abertura); sem a flag o pdf-lib recusa o arquivo inteiro.
      const anexo = await PDFDocument.load(base64ParaBytes(r.pdfBase64), { ignoreEncryption: true });
      const paginas = await doc.copyPages(anexo, anexo.getPageIndices());
      for (const p of paginas) doc.addPage(p);
      anexados++;
    } catch (e) {
      console.error(`Rastreabilidade "${r.nome || r.id}": falha ao anexar o PDF ao relatório.`, e);
      falhas.push(r.nome || r.id);
    }
  }

  return { bytes: await doc.save(), anexados, falhas };
}
