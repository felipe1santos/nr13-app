import { PDFDocument } from 'pdf-lib';
import { ler } from '../../services/storage';
import { arquivoPendente, salvarArquivo, type RefFoto } from '../../services/fotos';
import { baixarArtefato, sha256Hex } from '../relatorios/artefatoRelatorio';
import { garantirFonteInterHost, aguardarRecursosIframe } from '../relatorios/printService';
import {
  calibIdDoDocumento,
  comFolhaIsolada,
  empresaTemLogo,
  logoAusenteNaFolha,
} from '../relatorios/pdfVetorial/hostCertificado';
import { A4_PT, folhaParaJpeg } from '../relatorios/pdfVetorial/certificados';
import { arquivoCalibracao, salvarCalibracao } from './calibracaoService';
import { artefatoDaCalibracao } from './artefatoCalibracao';
import { pendenciasEmissao, temRubrica } from './responsavelCalibracao';
import { ehInterna, type DadosCalibracao, type DadosCalibracaoInterna } from './tipos';

/**
 * Revisão do engenheiro, fase 2 (C.3) · o certificado de calibração EMITIDO é
 * um documento independente e imutável — a mesma regra do relatório
 * (§7-quater), aplicada à folha de calibração.
 *
 * ## O fluxo
 *
 *   rascunho → revisão (a folha na tela) → EMITIR:
 *     1. monta a folha SOZINHA (host isolado, modo avulso — sem a meta de
 *        relatório nenhum) com o registro que será carimbado;
 *     2. confere que a logo e a rubrica chegaram à folha (sem isso, NÃO emite);
 *     3. rasteriza em UMA página A4 e gera o PDF (pdf-lib);
 *     4. SHA-256 dos bytes;
 *     5. grava no cofre local e sobe para `<org>/certificados-calibracao/<uuid>.pdf`
 *        (bucket privado `inspecao`, policy por organização — sem migration);
 *     6. só então grava o registro com `status: 'emitido'` e `emissao`.
 *
 * Falha em qualquer passo antes do 6 NÃO emite: o registro continua rascunho.
 *
 * ## Depois de emitido
 *
 * Visualizar, baixar, o Portal e o anexo ao relatório servem os BYTES
 * arquivados. Nada remonta o template. Trocar a logo da empresa ou a rubrica do
 * responsável depois não muda nada — a emissão guardou o arquivo, e
 * `emissao.logoRef`/`emissao.assinaturaRef` registram quais imagens ela usou.
 * `salvarCalibracao` recusa reescrever um emitido; corrigir é emitir uma
 * REVISÃO (registro novo com `substitui`).
 */
export const ESCOPO_CERTIFICADOS = 'certificados-calibracao';

export class EmissaoRecusada extends Error {
  motivos: string[];
  constructor(motivos: string[]) {
    super(motivos.join(' '));
    this.motivos = motivos;
    this.name = 'EmissaoRecusada';
  }
}

/** A imagem da rubrica chegou à folha? (o template marca `data-sem-rubrica` quando não) */
function rubricaAusenteNaFolha(doc: Document | null | undefined, esperada: boolean): boolean {
  if (!esperada) return false;
  const img = doc?.getElementById('cal-resp-assinatura') as HTMLImageElement | null;
  const src = img?.getAttribute('src') ?? '';
  return !src.startsWith('data:');
}

/**
 * Os bytes do certificado, montados do REGISTRO dado. Não grava nada.
 *
 * `registro` já vem com `status: 'emitido'`: a folha não imprime a marca de
 * rascunho, e o que ela lê é exatamente o que vai ser gravado.
 */
export async function gerarPdfCertificado(
  registro: DadosCalibracaoInterna,
  tag: string,
): Promise<{ bytes: Uint8Array; paginas: number }> {
  const arquivo = arquivoCalibracao(registro);
  if (!arquivo) throw new EmissaoRecusada(['Este instrumento não tem modelo de certificado interno.']);
  const documento = `${arquivo}?calibId=${registro.id}`;
  await garantirFonteInterHost();
  const esperaLogo = empresaTemLogo();
  const esperaRubrica = temRubrica(registro.responsavel);

  const jpg = await comFolhaIsolada(
    documento,
    tag,
    async (alvo, docFolha) => {
      await aguardarRecursosIframe(docFolha);
      const faltas: string[] = [];
      if (logoAusenteNaFolha(docFolha, esperaLogo)) faltas.push('A logo da empresa não carregou na folha.');
      if (rubricaAusenteNaFolha(docFolha, esperaRubrica)) faltas.push('A assinatura do responsável não carregou na folha.');
      if (faltas.length) throw new EmissaoRecusada([...faltas, 'Nada foi emitido — tente de novo com conexão.']);
      return folhaParaJpeg(alvo);
    },
    { avulsa: true, sobrepor: { [`nr13_calibracao_item_${registro.id}`]: registro } },
  );

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado de calibração ${registro.numeroCertificado}`);
  pdf.setProducer('NR-13');
  pdf.setCreator('NR-13');
  // Datas fixas no PDF: o hash depende só da imagem da folha e do registro.
  const quando = new Date(0);
  pdf.setCreationDate(quando);
  pdf.setModificationDate(quando);
  const img = await pdf.embedJpg(jpg);
  const pagina = pdf.addPage([A4_PT.largura, A4_PT.altura]);
  pagina.drawImage(img, { x: 0, y: 0, width: A4_PT.largura, height: A4_PT.altura });
  return { bytes: await pdf.save(), paginas: 1 };
}

/**
 * EMITE: gera, arquiva e só então carimba. Devolve o registro emitido.
 * Recusa (sem gravar nada) com `EmissaoRecusada` e os motivos.
 */
export async function emitirCertificado(tag: string, cal: DadosCalibracao): Promise<DadosCalibracaoInterna> {
  if (!ehInterna(cal)) throw new EmissaoRecusada(pendenciasEmissao(cal));
  const motivos = pendenciasEmissao(cal);
  if (motivos.length) throw new EmissaoRecusada(motivos);

  const aEmitir: DadosCalibracaoInterna = { ...cal, origem: 'interna', status: 'emitido' };
  delete (aEmitir as { emissao?: unknown }).emissao;
  const { bytes, paginas } = await gerarPdfCertificado(aEmitir, tag);
  const sha256 = await sha256Hex(bytes);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const pdfRef = await salvarArquivo(blob, ESCOPO_CERTIFICADOS, 'pdf', 'application/pdf');
  const pendente = await arquivoPendente(pdfRef.path);
  const empresa = ler<{ logoRef?: RefFoto }>('nr13_minha_empresa');

  const emitido: DadosCalibracaoInterna = {
    ...aEmitir,
    emissao: {
      pdfRef,
      sha256,
      emitidoEm: new Date().toISOString(),
      paginas,
      pendente,
      logoRef: empresa?.logoRef?.path ? empresa.logoRef : null,
      assinaturaRef: cal.responsavel?.assinaturaRef?.path ? cal.responsavel.assinaturaRef : null,
    },
  };
  await salvarCalibracao(tag, emitido, { permitirEmissao: true });
  return emitido;
}

/**
 * Os bytes ARQUIVADOS de uma folha `?calibId=` do relatório, quando aquela
 * calibração foi emitida. `null` = não emitida (legado): o chamador monta a
 * folha como sempre montou.
 *
 * Lê o snapshot congelado na meta do relatório antes do registro vivo (§7-bis).
 * Arquivo indisponível ou com hash diferente do gravado LANÇA — o chamador põe
 * a folha em `falhas`. Cair no template seria regenerar um documento emitido.
 */
export async function bytesArquivadosDaFolha(documento: string): Promise<Uint8Array | null> {
  const id = calibIdDoDocumento(documento);
  if (!id) return null;
  const meta = ler<{ certCalibracoes?: Record<string, DadosCalibracao> }>('nr13_relatorio_meta_atual');
  const cal = meta?.certCalibracoes?.[id] ?? ler<DadosCalibracao>(`nr13_calibracao_item_${id}`);
  const arte = artefatoDaCalibracao(cal);
  if (!arte) return null;
  const blob = await baixarArtefato(arte);
  if (!blob) throw new Error(`o certificado emitido ${id} não está disponível (offline e sem cópia local?)`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (arte.sha256 && (await sha256Hex(bytes)) !== arte.sha256) {
    throw new Error(`o arquivo do certificado ${id} não confere com o SHA-256 da emissão`);
  }
  return bytes;
}
