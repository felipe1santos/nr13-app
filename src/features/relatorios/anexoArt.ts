/**
 * 22/10/2026 · ART EM PDF ANEXADA AO RELATÓRIO DE CALDEIRA (seção 6).
 *
 * O PDF da ART entra como ele é: validado pela assinatura dos bytes, gravado
 * num caminho NOVO (`<org>/relatorios/<uuid>.pdf`, pasta sem UPDATE/DELETE) e
 * referenciado na meta do RASCUNHO com o SHA-256. Anexar não toca em nenhum
 * relatório emitido: a meta de um finalizado não se edita (§7-ter), e o
 * arquivo de outra emissão nunca é sobrescrito. Trocar a ART só troca a
 * referência; o arquivo anterior fica no bucket (inofensivo, ninguém o cita).
 */
import { validarPdf, type ResultadoValidacao } from '../prontuarios/anexoProntuario';
import { sha256Hex, ESCOPO_RELATORIOS } from './artefatoRelatorio';
import { salvarArquivo } from '../../services/fotos';
import type { RelatorioMeta } from './tipos';

export type ArtAnexo = NonNullable<RelatorioMeta['artAnexo']>;

export function validarArt(arquivo: { nome: string; tamanho: number; mimeType: string }, bytes: Uint8Array): ResultadoValidacao {
  return validarPdf(arquivo, bytes);
}

/** Valida e sobe o PDF. Inválido não sobe nada. */
export async function anexarArt(arquivo: File): Promise<ArtAnexo> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const v = validarArt({ nome: arquivo.name, tamanho: arquivo.size, mimeType: arquivo.type }, bytes);
  if (!v.ok) throw new Error(v.erro);
  const sha256 = await sha256Hex(bytes);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const ref = await salvarArquivo(blob, ESCOPO_RELATORIOS, 'pdf', 'application/pdf');
  return { ref, nome: arquivo.name, sha256, anexadoEm: new Date().toISOString() };
}
