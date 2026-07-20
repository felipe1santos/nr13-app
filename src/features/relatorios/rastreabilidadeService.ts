import { PDFDocument } from 'pdf-lib';
import { ler, salvar, excluirChave, listarChavesComPrefixo } from '../../services/storage';

/**
 * Certificados de calibração dos instrumentos PADRÃO: o usuário anexa UM PDF
 * por tipo de padrão (manômetro padrão, válvula padrão, bloco padrão...). O PDF
 * é anexado automaticamente ao FINAL do relatório sempre que o relatório contém
 * uma calibração daquele tipo (ou a folha de ultrassom, para o padrão de ME).
 * Chave: nr13_rastreab_<id> (sincroniza pela nuvem como qualquer outra).
 */
export type TipoInstrumento =
  | 'ultrassom'
  | 'manometro'
  | 'valvula'
  | 'bloco'
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
  // LEGADO: a injeção era manual por flag; hoje é automática por tipo presente no
  // relatório. Mantida só para registros antigos e para a preferência do autoPreencher.
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
  // LEGADO (vínculo por TAG removido — certificado padrão vale para todos os
  // equipamentos). Mantido só para leitura de registros antigos no autoPreencher.
  tags?: string[];
}

/** true se o padrão vale para a TAG (global quando não há vínculo). */
export function aplicaAoEquipamento(r: Rastreabilidade, tag?: string | null): boolean {
  if (!r.tags?.length) return true;
  return !!tag && r.tags.includes(tag);
}

/** Tipo de padrão usado por um certificado de calibração ('manometro' | 'psv'). */
export function tipoPadraoDoCertificado(tipoCalibracao: string): TipoInstrumento {
  return tipoCalibracao === 'psv' ? 'valvula' : 'manometro';
}

/**
 * Tipos de padrão exigidos por um relatório, derivados da lista de documentos:
 * cada folha de certificado de calibração (`?calibId=`) pede o padrão do seu tipo
 * (manômetro/válvula) e a folha de ultrassom pede o padrão de ME.
 */
export function tiposPadraoDoRelatorio(documentos: string[]): TipoInstrumento[] {
  const tipos = new Set<TipoInstrumento>();
  for (const doc of documentos) {
    const m = /[?&]calibId=([^&]+)/.exec(doc);
    if (m) {
      const item = ler<{ tipo?: string }>(`nr13_calibracao_item_${m[1]}`);
      if (item?.tipo) tipos.add(tipoPadraoDoCertificado(item.tipo));
    } else if (doc.split('?')[0] === 'ULTRASSOM.html') {
      tipos.add('ultrassom');
    }
  }
  return [...tipos];
}

const tsCriadoEm = (r: Rastreabilidade): number => {
  const p = (r.criadoEm ?? '').split('/');
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])).getTime() : 0;
};

/**
 * Certificados padrão a anexar no relatório: um por tipo presente nos documentos.
 * Duplicatas do mesmo tipo (registros antigos): vence quem tem PDF; empate, o mais recente.
 */
export function rastreabilidadesParaRelatorio(documentos: string[]): Rastreabilidade[] {
  const tipos = new Set(tiposPadraoDoRelatorio(documentos));
  if (tipos.size === 0) return [];
  const porTipo = new Map<TipoInstrumento, Rastreabilidade>();
  for (const r of listarRastreabilidades()) {
    if (!r.tipoInstrumento || !tipos.has(r.tipoInstrumento)) continue;
    const atual = porTipo.get(r.tipoInstrumento);
    if (
      !atual ||
      (!atual.pdfBase64 && !!r.pdfBase64) ||
      (!!atual.pdfBase64 === !!r.pdfBase64 && tsCriadoEm(r) > tsCriadoEm(atual))
    ) {
      porTipo.set(r.tipoInstrumento, r);
    }
  }
  return [...porTipo.values()];
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
 * Anexa ao final do PDF do relatório os certificados dos padrões dos tipos
 * presentes nos documentos (automático — sem flag manual). PDF que falhar ao
 * carregar é pulado (o relatório sai sem ele) e o nome volta em `falhas`.
 */
export async function anexarRastreabilidades(
  pdfBytes: Uint8Array | ArrayBuffer,
  documentos: string[] = [],
): Promise<{ bytes: Uint8Array; anexados: number; falhas: string[] }> {
  const marcadas = rastreabilidadesParaRelatorio(documentos);
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
