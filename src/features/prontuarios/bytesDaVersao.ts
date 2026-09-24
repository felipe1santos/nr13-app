import { artefatoDe, baixarArtefato } from '../relatorios/artefatoRelatorio';
import { bytesDaEmissao } from './emissaoProntuario';
import { resolverPdfFabricante } from '../equipamento/ProntuarioFabricante';
import type { VersaoProntuario } from './prontuarioVigente';

/**
 * Os BYTES ARQUIVADOS de uma versão do prontuário — vigente ou histórica.
 *
 * Uma porta só para a ficha, o histórico e a lista: emissão (gerada ou anexada)
 * vem de `bytesDaEmissao` (cofre → bucket, nada remontado); o PDF do fabricante
 * (legado) vem de `resolverPdfFabricante`. Nenhum dos dois grava nada.
 */
export async function bytesDaVersao(v: VersaoProntuario, tag: string): Promise<{ blob: Blob; nome: string }> {
  if (v.emissao) {
    const e = v.emissao;
    const blob = await bytesDaEmissao(e, { artefatoDe, baixarArtefato });
    return { blob, nome: e.arquivoNome ?? `${e.numero ?? `prontuario-${tag}`}.pdf` };
  }
  if (v.fabricante) {
    const dataUrl = await resolverPdfFabricante(v.fabricante);
    if (!dataUrl) throw new Error('O arquivo do fabricante não voltou nem do aparelho nem do servidor.');
    // Decodificado aqui, sem `fetch`: uma URL `data:` pode ser barrada pela CSP.
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { blob: new Blob([bytes], { type: 'application/pdf' }), nome: v.fabricante.nome || `prontuario-${tag}.pdf` };
  }
  throw new Error('Esta versão não tem arquivo.');
}
